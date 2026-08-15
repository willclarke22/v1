import type {
  DirectableAssetAffordanceGraphV1,
  DirectableAssetAffordanceNode,
  DirectableAssetQualificationLevel,
} from "./affordance-graph-contract";
import {
  directableAssetOperatorSpec,
  type DirectableAssetOperatorId,
  type DirectableAssetOperatorRequirement,
  type DirectableAssetOperatorSpec,
} from "./interaction-operator-contract";

export type DirectableAssetOperatorQualificationStatus =
  | "executable_as_is"
  | "conditional"
  | "contextual_candidate"
  | "asset_ready_runtime_pending"
  | "requires_asset_authoring"
  | "fallback_only";

export type DirectableAssetRequirementMatch = {
  requirement_id: string;
  label: string;
  required: boolean;
  resolved: boolean;
  evidence_ids: string[];
  qualification_levels: DirectableAssetQualificationLevel[];
  confidence: number | null;
  note: string;
};

export type DirectableAssetOperatorQualification = {
  operator_id: DirectableAssetOperatorId;
  label: string;
  status: DirectableAssetOperatorQualificationStatus;
  asset_qualification_level: DirectableAssetQualificationLevel;
  resolved_required_count: number;
  required_count: number;
  requirements: DirectableAssetRequirementMatch[];
  missing_required_labels: string[];
  context_requirements: string[];
  context_note: string | null;
  counterpart_note: string | null;
  fallback_note: string;
};

const QUALIFICATION_RANK: Record<DirectableAssetQualificationLevel, number> = {
  verified: 5,
  measured: 4,
  inferred: 3,
  suggested: 2,
  unknown: 1,
  contradicted: 0,
};

function normalizedSemantic(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function semanticMatch(item: DirectableAssetAffordanceNode, requested: string) {
  const normalized = normalizedSemantic(requested);
  return item.semantic_names.some(
    (name) => normalizedSemantic(name) === normalized,
  );
}

function matchesRequirement(
  graph: DirectableAssetAffordanceGraphV1,
  requirement: DirectableAssetOperatorRequirement,
) {
  return graph.affordances.filter((item) => {
    if (!requirement.any_of_kinds.includes(item.kind)) return false;
    if (
      requirement.require_executable_evidence &&
      !item.evidence.executable
    ) {
      return false;
    }
    if (
      requirement.semantic_name &&
      !semanticMatch(item, requirement.semantic_name)
    ) {
      return false;
    }
    return true;
  });
}

function articulatedPairEvidence(graph: DirectableAssetAffordanceGraphV1) {
  const subparts = graph.affordances.filter(
    (item) => item.kind === "semantic_subpart" && item.evidence.executable,
  );
  const joints = graph.affordances.filter(
    (item) => item.kind === "pivot_joint" && item.evidence.executable,
  );
  for (const subpart of subparts) {
    if (subpart.kind !== "semantic_subpart" || !subpart.pivot_id) continue;
    const joint = joints.find(
      (candidate) =>
        candidate.kind === "pivot_joint" &&
        candidate.id === `joint:${subpart.pivot_id}` &&
        (!candidate.subpart_id || candidate.subpart_id === subpart.subpart_id),
    );
    if (joint) return { subpart, joint };
  }
  return null;
}

function requirementsForGraph(
  graph: DirectableAssetAffordanceGraphV1,
  spec: DirectableAssetOperatorSpec,
): DirectableAssetRequirementMatch[] {
  const articulatedPair =
    spec.id === "open_subpart" || spec.id === "close_subpart"
      ? articulatedPairEvidence(graph)
      : null;

  return spec.requirements.map((requirement) => {
    const isArticulationRequirement =
      (spec.id === "open_subpart" || spec.id === "close_subpart") &&
      (requirement.id === "part" || requirement.id === "joint");
    const matches =
      isArticulationRequirement
        ? articulatedPair
          ? requirement.id === "part"
            ? [articulatedPair.subpart]
            : [articulatedPair.joint]
          : []
        : matchesRequirement(graph, requirement);
    return {
      requirement_id: requirement.id,
      label: requirement.label,
      required: requirement.required,
      resolved: matches.length > 0,
      evidence_ids: matches.map((item) => item.id),
      qualification_levels: matches.map((item) => item.evidence.qualification),
      confidence: matches.length
        ? Math.max(...matches.map((item) => item.evidence.confidence))
        : null,
      note: matches.length
        ? `Resolved from ${matches.map((item) => item.id).join(", ")}.`
        : `No trusted ${requirement.any_of_kinds.join(" or ")} affordance resolves ${requirement.label}.`,
    };
  });
}

function weakestRequiredQualification(
  requirements: DirectableAssetRequirementMatch[],
): DirectableAssetQualificationLevel {
  const required = requirements.filter((item) => item.required);
  if (required.some((item) => !item.resolved)) return "unknown";
  const levels = required.flatMap((item) => item.qualification_levels);
  if (!levels.length) return "unknown";
  return levels.reduce((weakest, current) =>
    QUALIFICATION_RANK[current] < QUALIFICATION_RANK[weakest]
      ? current
      : weakest,
  );
}

function inferredRollContext(graph: DirectableAssetAffordanceGraphV1) {
  const rolling = graph.affordances.find(
    (item) =>
      item.kind === "rolling" &&
      item.evidence.qualification === "inferred",
  );
  if (!rolling || rolling.kind !== "rolling") return null;
  return {
    executable: rolling.evidence.executable,
    runtime_model: rolling.runtime_model,
    rolling_profile: rolling.rolling_profile,
    requirements: [...rolling.context_requirements],
    note:
      rolling.runtime_model === "approximate_only"
        ? `Geometry suggests ${rolling.rolling_profile.replace(/_/g, " ")} rolling, but the current constant-radius UMP Roll is not faithful enough for literal execution.`
        : rolling.default_pose === "requires_reorientation"
          ? "Geometry supports constant-radius rolling, but the asset's default pose does not put the inferred rolling axis in a floor-ready orientation."
          : "Geometry supports constant-radius rolling in principle; the scene still has to provide compatible support and travel direction.",
  };
}

function supportContext(
  graph: DirectableAssetAffordanceGraphV1,
  spec: DirectableAssetOperatorSpec,
) {
  if (
    spec.id !== "place_on_target" &&
    spec.id !== "accumulate_on_target"
  ) {
    return null;
  }
  const supports = graph.affordances.filter(
    (item) =>
      item.kind === "support_surface" &&
      item.evidence.executable,
  );
  if (!supports.length) return null;
  const requirements = Array.from(
    new Set(
      supports.flatMap((item) =>
        item.kind === "support_surface"
          ? item.context_requirements
          : [],
      ),
    ),
  );
  return {
    requirements,
    note:
      "Measured support geometry is only an asset-side candidate. Source footprint, stability, and clearance must be resolved against the actual counterpart before placement/accumulation is literal.",
  };
}

function hasExecutableContainment(
  graph: DirectableAssetAffordanceGraphV1,
) {
  return graph.affordances.some(
    (item) =>
      item.kind === "containment_volume" &&
      item.evidence.executable,
  );
}

function statusForQualification(
  graph: DirectableAssetAffordanceGraphV1,
  spec: DirectableAssetOperatorSpec,
  requirements: DirectableAssetRequirementMatch[],
): DirectableAssetOperatorQualificationStatus {
  const required = requirements.filter((item) => item.required);
  const resolvedRequired = required.filter((item) => item.resolved);
  if (required.length === resolvedRequired.length) {
    if (spec.runtime_execution === "declared_not_executed") {
      return "asset_ready_runtime_pending";
    }
    if (spec.id === "roll" && inferredRollContext(graph)) {
      return "contextual_candidate";
    }
    if (spec.id === "place_on_target") {
      return "contextual_candidate";
    }
    if (
      spec.id === "accumulate_on_target" &&
      !hasExecutableContainment(graph)
    ) {
      return "contextual_candidate";
    }
    return spec.interaction_scope === "asset_pair"
      ? "conditional"
      : "executable_as_is";
  }

  if (
    spec.id === "translate" ||
    spec.id === "rotate" ||
    spec.id === "lift" ||
    spec.id === "lower"
  ) {
    return "fallback_only";
  }

  if (
    spec.id === "roll" &&
    inferredRollContext(graph)?.runtime_model === "approximate_only"
  ) {
    return "fallback_only";
  }

  if (spec.id === "aim") {
    return "fallback_only";
  }

  const structuralOperator =
    spec.interaction_scope === "subpart" ||
    spec.interaction_scope === "rig" ||
    spec.id === "roll";
  return structuralOperator
    ? "requires_asset_authoring"
    : "fallback_only";
}

export function qualifyDirectableAssetForOperator(
  graph: DirectableAssetAffordanceGraphV1,
  operatorId: DirectableAssetOperatorId,
): DirectableAssetOperatorQualification {
  const spec = directableAssetOperatorSpec(operatorId);
  if (!spec) {
    throw new Error(`Unknown directable asset operator: ${operatorId}`);
  }
  const requirements = requirementsForGraph(graph, spec);
  const required = requirements.filter((item) => item.required);
  const resolvedRequired = required.filter((item) => item.resolved);
  const rollContext = spec.id === "roll" ? inferredRollContext(graph) : null;
  const surfaceContext = supportContext(graph, spec);
  const context =
    rollContext ??
    surfaceContext;
  return {
    operator_id: spec.id,
    label: spec.label,
    status: statusForQualification(graph, spec, requirements),
    asset_qualification_level: weakestRequiredQualification(requirements),
    resolved_required_count: resolvedRequired.length,
    required_count: required.length,
    requirements,
    missing_required_labels: required
      .filter((item) => !item.resolved)
      .map((item) => item.label),
    context_requirements: context?.requirements ?? [],
    context_note: context?.note ?? null,
    counterpart_note: spec.counterpart_note ?? null,
    fallback_note: spec.fallback_note,
  };
}

export function qualifyDirectableAssetForAllOperators(
  graph: DirectableAssetAffordanceGraphV1,
  operatorIds: readonly DirectableAssetOperatorId[],
) {
  return operatorIds.map((operatorId) =>
    qualifyDirectableAssetForOperator(graph, operatorId),
  );
}
