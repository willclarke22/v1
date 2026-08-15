import type {
  DirectableAssetAffordanceGraphV1,
  DirectableAssetAffordanceNode,
  DirectableAssetContainmentAffordance,
  DirectableAssetGroundContactAffordance,
  DirectableAssetPortAffordance,
  DirectableAssetQualificationLevel,
  DirectableAssetSurfaceAffordance,
  DirectableAssetSurfaceContactAffordance,
} from "./affordance-graph-contract";
import {
  DIRECTABLE_ASSET_PAIR_INTERACTION_SCHEMA_VERSION,
  DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION,
  type DirectableAssetPairCandidateTransform,
  type DirectableAssetPairContextV1,
  type DirectableAssetPairEvidenceSelection,
  type DirectableAssetPairFitAssessment,
  type DirectableAssetPairInteractionId,
  type DirectableAssetPairInteractionResolutionV1,
  type DirectableAssetPairRelationshipPlan,
  type DirectableAssetPairResolutionDiagnostics,
  type DirectableAssetPairScaleAuthority,
  type DirectableAssetPairRoutePlan,
} from "./pair-interaction-contract";
import type { AssetDirectabilityVec3 } from "./asset-directability-contract";

type Vec3 = AssetDirectabilityVec3;
type Quat = [number, number, number, number];

const EPS = 1e-8;
const DEFAULT_CLEARANCE_M = 0.004;
const MIN_PLACE_SUPPORT_VIABILITY = 0.72;

const GENERIC_SEMANTIC_TOKENS = new Set([
  "attachment",
  "attach",
  "anchor",
  "socket",
  "port",
  "connector",
  "connection",
  "mount",
  "side",
  "source",
  "target",
  "region",
  "surface",
  "contact",
  "left",
  "right",
  "front",
  "back",
  "top",
  "bottom",
  "inlet",
  "outlet",
  "opening",
  "open",
  "input",
  "output",
  "generic",
  "exterior",
  "interior",
  "semantic",
]);

const INTERACTION_LABELS: Record<DirectableAssetPairInteractionId, string> = {
  place_on: "Place on target",
  surface_attach: "Surface attach",
  precise_attach: "Precise attach",
  insert: "Insert",
  flow: "Flow source → destination",
};

const QUALIFICATION_RANK: Record<DirectableAssetQualificationLevel, number> = {
  verified: 5,
  measured: 4,
  inferred: 3,
  suggested: 2,
  unknown: 1,
  contradicted: 0,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function vec3(value: readonly number[] | null | undefined, fallback: Vec3 = [0, 0, 0]): Vec3 {
  return [
    Number.isFinite(value?.[0]) ? Number(value![0]) : fallback[0],
    Number.isFinite(value?.[1]) ? Number(value![1]) : fallback[1],
    Number.isFinite(value?.[2]) ? Number(value![2]) : fallback[2],
  ];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function multiply(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function scaleVec(a: Vec3, scalar: number): Vec3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a: Vec3) {
  return Math.sqrt(Math.max(0, dot(a, a)));
}

function normalize(a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const len = length(a);
  if (len <= EPS) return [...fallback];
  return [a[0] / len, a[1] / len, a[2] / len];
}

function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

function absScale(value: readonly number[] | null | undefined): Vec3 {
  const input = vec3(value, [1, 1, 1]);
  return [
    Math.max(EPS, Math.abs(input[0])),
    Math.max(EPS, Math.abs(input[1])),
    Math.max(EPS, Math.abs(input[2])),
  ];
}

function scalePoint(point: readonly number[], scale: Vec3): Vec3 {
  return multiply(vec3(point), scale);
}

function scaleNormal(normal: readonly number[] | null | undefined, scale: Vec3): Vec3 | null {
  if (!normal) return null;
  const raw = vec3(normal);
  return normalize(
    [
      raw[0] / Math.max(EPS, scale[0]),
      raw[1] / Math.max(EPS, scale[1]),
      raw[2] / Math.max(EPS, scale[2]),
    ],
    [0, 1, 0],
  );
}

function quaternionNormalize(value: Quat): Quat {
  const len = Math.sqrt(
    value[0] * value[0] +
      value[1] * value[1] +
      value[2] * value[2] +
      value[3] * value[3],
  );
  if (len <= EPS) return [0, 0, 0, 1];
  return [value[0] / len, value[1] / len, value[2] / len, value[3] / len];
}

function quaternionFromUnitVectors(fromRaw: Vec3, toRaw: Vec3): Quat {
  const from = normalize(fromRaw);
  const to = normalize(toRaw);
  const d = Math.max(-1, Math.min(1, dot(from, to)));

  if (d > 0.999999) return [0, 0, 0, 1];

  if (d < -0.999999) {
    const helper: Vec3 =
      Math.abs(from[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    const axis = normalize(cross(from, helper), [0, 0, 1]);
    return [axis[0], axis[1], axis[2], 0];
  }

  const axis = cross(from, to);
  return quaternionNormalize([axis[0], axis[1], axis[2], 1 + d]);
}

function quaternionRotate(qRaw: Quat, point: Vec3): Vec3 {
  const q = quaternionNormalize(qRaw);
  const u: Vec3 = [q[0], q[1], q[2]];
  const s = q[3];
  const term1 = scaleVec(u, 2 * dot(u, point));
  const term2 = scaleVec(point, s * s - dot(u, u));
  const term3 = scaleVec(cross(u, point), 2 * s);
  return add(add(term1, term2), term3);
}

function determinant3(matrix: [Vec3, Vec3, Vec3]) {
  const [a, b, c] = matrix;
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

function quaternionFromRotationColumns(columns: [Vec3, Vec3, Vec3]): Quat {
  const [x, y, z] = columns;
  const m00 = x[0];
  const m01 = y[0];
  const m02 = z[0];
  const m10 = x[1];
  const m11 = y[1];
  const m12 = z[1];
  const m20 = x[2];
  const m21 = y[2];
  const m22 = z[2];
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return quaternionNormalize([
      (m21 - m12) / s,
      (m02 - m20) / s,
      (m10 - m01) / s,
      0.25 * s,
    ]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return quaternionNormalize([
      0.25 * s,
      (m01 + m10) / s,
      (m02 + m20) / s,
      (m21 - m12) / s,
    ]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return quaternionNormalize([
      (m01 + m10) / s,
      0.25 * s,
      (m12 + m21) / s,
      (m02 - m20) / s,
    ]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return quaternionNormalize([
    (m02 + m20) / s,
    (m12 + m21) / s,
    0.25 * s,
    (m10 - m01) / s,
  ]);
}

type BoxOrientation = {
  id: string;
  output_size: (input: Vec3) => Vec3;
  quaternion: Quat;
};

function axisAlignedBoxOrientations(): BoxOrientation[] {
  const axes: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const result: BoxOrientation[] = [];
  const seen = new Set<string>();

  for (const x of axes) {
    for (const y of axes) {
      if (Math.abs(dot(x, y)) > EPS) continue;
      const z = cross(x, y);
      if (length(z) < 0.9) continue;
      const columns: [Vec3, Vec3, Vec3] = [x, y, normalize(z)];
      if (determinant3(columns) < 0.99) continue;
      const signature = columns.flat().join(",");
      if (seen.has(signature)) continue;
      seen.add(signature);

      result.push({
        id: `cube_rotation_${String(result.length + 1).padStart(2, "0")}`,
        output_size(input: Vec3) {
          return [
            Math.abs(x[0]) * input[0] + Math.abs(y[0]) * input[1] + Math.abs(z[0]) * input[2],
            Math.abs(x[1]) * input[0] + Math.abs(y[1]) * input[1] + Math.abs(z[1]) * input[2],
            Math.abs(x[2]) * input[0] + Math.abs(y[2]) * input[1] + Math.abs(z[2]) * input[2],
          ];
        },
        quaternion: quaternionFromRotationColumns(columns),
      });
    }
  }

  return result;
}

const BOX_ORIENTATIONS = axisAlignedBoxOrientations();

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function semanticTokens(names: readonly string[]) {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const token of normalizedWords(name)) {
      if (token.length < 2 || GENERIC_SEMANTIC_TOKENS.has(token)) continue;
      tokens.add(token);
    }
  }
  return Array.from(tokens).sort();
}

function sharedTokens(a: readonly string[], b: readonly string[]) {
  const left = new Set(a);
  return b.filter((token) => left.has(token)).sort();
}

function semanticRequestMatches(
  item: DirectableAssetAffordanceNode,
  requested: string | null | undefined,
) {
  if (!requested?.trim()) return true;
  const requestedTokens = normalizedWords(requested).filter(
    (token) => !GENERIC_SEMANTIC_TOKENS.has(token),
  );
  if (!requestedTokens.length) return true;
  const itemTokens = new Set(
    item.semantic_names.flatMap((name) => normalizedWords(name)),
  );
  return requestedTokens.every((token) => itemTokens.has(token));
}

function executableNodes<T extends DirectableAssetAffordanceNode>(
  graph: DirectableAssetAffordanceGraphV1,
  predicate: (item: DirectableAssetAffordanceNode) => item is T,
) {
  return graph.affordances.filter(
    (item): item is T => item.evidence.executable && predicate(item),
  );
}

function confidence(items: readonly DirectableAssetAffordanceNode[]) {
  if (!items.length) return null;
  return Math.max(...items.map((item) => clamp01(item.evidence.confidence)));
}

function evidenceSelection(
  source: readonly DirectableAssetAffordanceNode[],
  target: readonly DirectableAssetAffordanceNode[],
  tokens: readonly string[] = [],
): DirectableAssetPairEvidenceSelection {
  return {
    source_evidence_ids: source.map((item) => item.id),
    target_evidence_ids: target.map((item) => item.id),
    source_qualification_levels: source.map((item) => item.evidence.qualification),
    target_qualification_levels: target.map((item) => item.evidence.qualification),
    source_confidence: confidence(source),
    target_confidence: confidence(target),
    shared_semantic_tokens: [...tokens],
  };
}

const EMPTY_EVIDENCE: DirectableAssetPairEvidenceSelection = {
  source_evidence_ids: [],
  target_evidence_ids: [],
  source_qualification_levels: [],
  target_qualification_levels: [],
  source_confidence: null,
  target_confidence: null,
  shared_semantic_tokens: [],
};

function emptyFit(note: string): DirectableAssetPairFitAssessment {
  return {
    mode: "not_applicable",
    fits: null,
    score: null,
    source_size_m: null,
    target_size_m: null,
    margin_m: null,
    orientation_variant: null,
    note,
  };
}

type ScaleResolution = {
  scale: Vec3;
  source: DirectableAssetPairScaleAuthority;
};

function normalizedScaleAuthority(
  authority: Exclude<DirectableAssetPairScaleAuthority, "assumed_unit"> | null | undefined,
  fallback: Exclude<DirectableAssetPairScaleAuthority, "assumed_unit">,
) {
  return authority ?? fallback;
}

function scaleIsAuthoritative(scale: ScaleResolution) {
  return (
    scale.source === "scene_instance" ||
    scale.source === "explicit_context"
  );
}

function scaleFromContext(
  graph: DirectableAssetAffordanceGraphV1,
  dimensions: readonly number[] | null | undefined,
  explicitScale: readonly number[] | null | undefined,
  dimensionsAuthority: Exclude<DirectableAssetPairScaleAuthority, "assumed_unit"> | null | undefined,
  scaleAuthority: Exclude<DirectableAssetPairScaleAuthority, "assumed_unit"> | null | undefined,
): ScaleResolution {
  if (
    dimensions &&
    dimensions.length >= 3 &&
    dimensions.every((value) => Number.isFinite(value) && Number(value) > 0)
  ) {
    const bounds = graph.local_bounds_size.map((value) =>
      Math.max(EPS, Math.abs(Number(value))),
    ) as Vec3;
    return {
      scale: [
        Number(dimensions[0]) / bounds[0],
        Number(dimensions[1]) / bounds[1],
        Number(dimensions[2]) / bounds[2],
      ],
      source: normalizedScaleAuthority(
        dimensionsAuthority,
        "asset_baseline",
      ),
    };
  }
  if (
    explicitScale &&
    explicitScale.length >= 3 &&
    explicitScale.every((value) => Number.isFinite(value) && Math.abs(Number(value)) > EPS)
  ) {
    return {
      scale: absScale(explicitScale),
      source: normalizedScaleAuthority(
        scaleAuthority,
        "scene_instance",
      ),
    };
  }
  return {
    scale: [1, 1, 1],
    source: "assumed_unit",
  };
}

function diagnosticScale(
  source: ScaleResolution,
  target: ScaleResolution,
  candidates: number,
  rejected: number,
  warnings: string[] = [],
): DirectableAssetPairResolutionDiagnostics {
  return {
    source_scale_source: source.source,
    target_scale_source: target.source,
    candidate_count: candidates,
    rejected_candidate_count: rejected,
    warnings,
  };
}

function graphBoundsSizeM(
  graph: DirectableAssetAffordanceGraphV1,
  scale: Vec3,
) {
  return multiply(vec3(graph.local_bounds_size), scale);
}

function graphBoundsCenterM(
  graph: DirectableAssetAffordanceGraphV1,
  scale: Vec3,
) {
  return multiply(
    vec3(
      graph.local_bounds_center ??
        [0, graph.local_bounds_size[1] * 0.5, 0],
    ),
    scale,
  );
}

function conservativeSurfaceSizeM(
  size: readonly number[],
  scale: Vec3,
): [number, number] {
  const horizontal = Math.max(EPS, Math.min(scale[0], scale[2]));
  return [
    Math.max(EPS, Number(size[0] ?? 0) * horizontal),
    Math.max(EPS, Number(size[1] ?? 0) * horizontal),
  ];
}

function fit2d(
  sourceSize: [number, number],
  targetSize: [number, number],
) {
  const variants: Array<{
    id: string;
    size: [number, number];
  }> = [
    { id: "as_authored", size: sourceSize },
    { id: "quarter_turn", size: [sourceSize[1], sourceSize[0]] },
  ];

  const ranked = variants.map((variant) => {
    const margin: [number, number] = [
      targetSize[0] - variant.size[0],
      targetSize[1] - variant.size[1],
    ];
    const ratios = [
      targetSize[0] / Math.max(EPS, variant.size[0]),
      targetSize[1] / Math.max(EPS, variant.size[1]),
    ];
    const minRatio = Math.min(...ratios);
    const fits = margin[0] >= -EPS && margin[1] >= -EPS;
    const score = fits
      ? 0.72 + 0.28 * clamp01((minRatio - 1) / 1.5)
      : 0.7 * clamp01(minRatio);
    return {
      id: variant.id,
      source_size: variant.size,
      margin,
      fits,
      score,
    };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  )[0]!;
}

function fit3d(sourceSize: Vec3, targetSize: Vec3) {
  const ranked = BOX_ORIENTATIONS.map((orientation) => {
    const output = orientation.output_size(sourceSize);
    const margin: Vec3 = [
      targetSize[0] - output[0],
      targetSize[1] - output[1],
      targetSize[2] - output[2],
    ];
    const ratios = [
      targetSize[0] / Math.max(EPS, output[0]),
      targetSize[1] / Math.max(EPS, output[1]),
      targetSize[2] / Math.max(EPS, output[2]),
    ];
    const minRatio = Math.min(...ratios);
    const fits = margin.every((value) => value >= -EPS);
    const score = fits
      ? 0.72 + 0.28 * clamp01((minRatio - 1) / 1.5)
      : 0.7 * clamp01(minRatio);
    return {
      orientation,
      output,
      margin,
      fits,
      score,
    };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      b.score - a.score ||
      a.orientation.id.localeCompare(b.orientation.id),
  )[0]!;
}

function surfaceTransform(input: {
  sourcePointM: Vec3;
  targetPointM: Vec3;
  sourceNormal: Vec3;
  targetNormal: Vec3;
  clearance: number;
  alignment: "opposed_contact_normals" | "source_anchor_to_target_anchor";
}): DirectableAssetPairCandidateTransform {
  const targetNormal = normalize(input.targetNormal);
  const sourceNormal = normalize(input.sourceNormal);
  const q =
    input.alignment === "opposed_contact_normals"
      ? quaternionFromUnitVectors(sourceNormal, negate(targetNormal))
      : [0, 0, 0, 1] as Quat;
  const rotatedSourcePoint = quaternionRotate(q, input.sourcePointM);
  const targetPoint = add(
    input.targetPointM,
    scaleVec(targetNormal, Math.max(0, input.clearance)),
  );
  return {
    coordinate_space: "target_scaled_local",
    source_origin_translation_m: subtract(targetPoint, rotatedSourcePoint),
    source_rotation_quaternion_xyzw: q,
    source_anchor_local_m: input.sourcePointM,
    target_anchor_local_m: input.targetPointM,
    source_normal_local: sourceNormal,
    target_normal_local: targetNormal,
    alignment_rule: input.alignment,
    note:
      "Candidate aligns selected pair evidence in scaled target-local space. Scene/world composition and collision acceptance remain downstream.",
  };
}

function placeTransform(input: {
  sourcePointM: Vec3;
  targetPointM: Vec3;
  targetNormal: Vec3;
  clearance: number;
}): DirectableAssetPairCandidateTransform {
  const targetNormal = normalize(input.targetNormal);
  const q = quaternionFromUnitVectors([0, 1, 0], targetNormal);
  const rotatedSourcePoint = quaternionRotate(q, input.sourcePointM);
  const targetPoint = add(
    input.targetPointM,
    scaleVec(targetNormal, Math.max(0, input.clearance)),
  );
  return {
    coordinate_space: "target_scaled_local",
    source_origin_translation_m: subtract(targetPoint, rotatedSourcePoint),
    source_rotation_quaternion_xyzw: q,
    source_anchor_local_m: input.sourcePointM,
    target_anchor_local_m: input.targetPointM,
    source_normal_local: [0, 1, 0],
    target_normal_local: targetNormal,
    alignment_rule: "source_up_to_target_normal",
    note:
      "Candidate aligns source up/bottom contact to the selected support normal. Asset Scene Builder remains authoritative for stable placement and collision.",
  };
}

function proposedRelationship(
  type: DirectableAssetPairRelationshipPlan["type"],
  sourceId: string | null,
  targetId: string | null,
): DirectableAssetPairRelationshipPlan {
  if (type === "persistent_attachment") {
    return {
      type,
      activation_state: "proposed",
      persistent_after_activation: true,
      source_follows_target_after_activation: true,
      inverse_operation: "detach",
      source_evidence_id: sourceId,
      target_evidence_id: targetId,
      activation_requirements: [
        "interaction policy/intent must allow persistent attachment",
        "Asset Scene Builder must validate final collision/contact state",
      ],
      note:
        "If Builder validation accepts this pair, later scene state may persist source→target attachment. Detach removes that relation without changing asset identity.",
    };
  }
  if (type === "containment_membership") {
    return {
      type,
      activation_state: "proposed",
      persistent_after_activation: true,
      source_follows_target_after_activation: true,
      inverse_operation: "remove",
      source_evidence_id: sourceId,
      target_evidence_id: targetId,
      activation_requirements: [
        "receiver access/fit must be validated at final scene scale",
        "Asset Scene Builder must validate containment collision state",
      ],
      note:
        "If Builder validation accepts insertion, scene state may persist containment membership. Remove clears membership without inventing geometry.",
    };
  }
  if (type === "support_contact") {
    return {
      type,
      activation_state: "proposed",
      persistent_after_activation: false,
      source_follows_target_after_activation: false,
      inverse_operation: null,
      source_evidence_id: sourceId,
      target_evidence_id: targetId,
      activation_requirements: [
        "Asset Scene Builder must validate final support/collision state",
      ],
      note:
        "Support contact describes placement, not automatic parenting. Scene state may strengthen it later only when explicitly requested.",
    };
  }
  return {
    type,
    activation_state: "proposed",
    persistent_after_activation: false,
    source_follows_target_after_activation: false,
    inverse_operation: null,
    source_evidence_id: sourceId,
    target_evidence_id: targetId,
    activation_requirements: [
      "scene runtime must compose endpoint poses into world space",
      "selected visual carrier must pass route/visibility validation",
    ],
    note:
      "Directed flow records source→destination intent and endpoints; it is not a physics or persistent parenting claim.",
  };
}

function baseResolution(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  interactionId: DirectableAssetPairInteractionId,
  context: DirectableAssetPairContextV1,
) {
  return {
    sourceScale: scaleFromContext(
      source,
      context.source_dimensions_m,
      context.source_scale,
      context.source_dimensions_authority,
      context.source_scale_authority,
    ),
    targetScale: scaleFromContext(
      target,
      context.target_dimensions_m,
      context.target_scale,
      context.target_dimensions_authority,
      context.target_scale_authority,
    ),
    clearance: Math.max(
      0,
      Number.isFinite(context.clearance_m)
        ? Number(context.clearance_m)
        : DEFAULT_CLEARANCE_M,
    ),
    common: {
      schema_version: DIRECTABLE_ASSET_PAIR_INTERACTION_SCHEMA_VERSION,
      resolver_version: DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION,
      interaction_id: interactionId,
      label: INTERACTION_LABELS[interactionId],
      source_asset_id: source.asset_id,
      target_asset_id: target.asset_id,
    },
  };
}

function resolvedPlaceOn(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
): DirectableAssetPairInteractionResolutionV1 {
  const base = baseResolution(source, target, "place_on", context);
  const contacts = executableNodes(
    source,
    (item): item is DirectableAssetGroundContactAffordance =>
      item.kind === "ground_contact",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_source_semantic),
  );
  const allSurfaces = executableNodes(
    target,
    (item): item is DirectableAssetSurfaceAffordance =>
      item.kind === "support_surface",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );
  const surfaces = allSurfaces.filter(
    (surface) =>
      surface.viability !== "weak" &&
      surface.viability_score >= MIN_PLACE_SUPPORT_VIABILITY,
  );

  if (!contacts.length || !surfaces.length) {
    return {
      ...base.common,
      status: "fallback_only",
      score: null,
      evidence: evidenceSelection(contacts, surfaces.length ? surfaces : allSurfaces),
      fit: emptyFit(
        !contacts.length
          ? "No executable source ground/contact evidence was available."
          : allSurfaces.length
            ? "Target support evidence exists, but no surface clears the hardened Place viability threshold."
            : "No executable target support surface was available.",
      ),
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [
        "Asset Scene Builder may use its existing coarse-bounds placement fallback.",
      ],
      missing_requirements: [
        ...(!contacts.length ? ["source ground/contact evidence"] : []),
        ...(!surfaces.length
          ? [
              allSurfaces.length
                ? "strong target support surface"
                : "target support surface",
            ]
          : []),
      ],
      note:
        "Literal Place On is not pair-qualified because required contact/support evidence is missing or too weak.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        0,
        allSurfaces.length,
      ),
    };
  }

  const sourceBoundsM = graphBoundsSizeM(source, base.sourceScale.scale);
  const candidates = surfaces.flatMap((surface) =>
    contacts.map((contact) => {
      const sourceFootprint: [number, number] = contact.contact_size
        ? conservativeSurfaceSizeM(
            contact.contact_size,
            base.sourceScale.scale,
          )
        : [sourceBoundsM[0], sourceBoundsM[2]];
      const targetSize = conservativeSurfaceSizeM(
        surface.usable_size ?? surface.size,
        base.targetScale.scale,
      );
      const fit = fit2d(sourceFootprint, targetSize);
      const pairScore =
        0.54 * fit.score +
        0.31 * clamp01(surface.viability_score) +
        0.15 *
          Math.min(
            clamp01(contact.evidence.confidence),
            clamp01(surface.evidence.confidence),
          );
      return {
        surface,
        contact,
        sourceFootprint,
        targetSize,
        fit,
        pairScore,
      };
    }),
  );
  const selected = candidates
    .sort(
      (a, b) =>
        Number(b.fit.fits) - Number(a.fit.fits) ||
        b.pairScore - a.pairScore ||
        a.surface.id.localeCompare(b.surface.id) ||
        a.contact.id.localeCompare(b.contact.id),
    )[0]!;

  const scalesAreAuthoritative =
    scaleIsAuthoritative(base.sourceScale) &&
    scaleIsAuthoritative(base.targetScale);
  const status =
    selected.fit.fits && scalesAreAuthoritative
      ? "resolved_candidate"
      : selected.fit.fits
        ? "contextual_candidate"
        : scalesAreAuthoritative
          ? "fallback_only"
          : "contextual_candidate";

  const sourcePointM = scalePoint(
    selected.contact.local_position,
    base.sourceScale.scale,
  );
  const targetPointM = scalePoint(
    selected.surface.local_center,
    base.targetScale.scale,
  );
  const targetNormal =
    scaleNormal(selected.surface.normal, base.targetScale.scale) ?? [0, 1, 0];

  return {
    ...base.common,
    status,
    score: selected.pairScore,
    evidence: evidenceSelection(
      [selected.contact],
      [selected.surface],
    ),
    fit: {
      mode: "surface_2d",
      fits: selected.fit.fits,
      score: selected.fit.score,
      source_size_m: [...selected.fit.source_size],
      target_size_m: [...selected.targetSize],
      margin_m: [...selected.fit.margin],
      orientation_variant: selected.fit.id,
      note:
        selected.fit.fits && scalesAreAuthoritative
          ? "Measured source contact footprint fits a strong target support candidate at authoritative scene scale. Stability and collision remain downstream."
          : selected.fit.fits
            ? "The measured contact/support geometry fits at preview/baseline scale, but authoritative scene scale is still required before literal placement is promoted."
            : scalesAreAuthoritative
              ? "Authoritative scene dimensions do not fit the selected strong support candidate."
              : "Preview/baseline dimensions do not fit this support candidate; final scene scale may still change the result.",
    },
    candidate_transform: selected.fit.fits
      ? placeTransform({
          sourcePointM,
          targetPointM,
          targetNormal,
          clearance: base.clearance,
        })
      : null,
    route: null,
    proposed_relationship: selected.fit.fits
      ? proposedRelationship(
          "support_contact",
          selected.contact.id,
          selected.surface.id,
        )
      : null,
    context_requirements: [
      ...selected.surface.context_requirements,
      ...(!scalesAreAuthoritative
        ? [
            "authoritative final scene dimensions/instance scale must replace Asset Library baseline scale",
          ]
        : []),
      "Asset Scene Builder must accept the resulting collision/clearance state.",
    ],
    builder_validation_handoff: [
      "validate source contact footprint against the exact selected support polygon/region",
      "validate center-of-mass stability",
      "validate clearance above target surface",
      "reject or reposition on collision",
    ],
    missing_requirements: selected.fit.fits
      ? scalesAreAuthoritative
        ? []
        : ["authoritative final scene dimensions/instance scale"]
      : [
          "source footprint must fit a target support candidate at final scene scale",
        ],
    note:
      status === "resolved_candidate"
        ? "Strong support evidence + authoritative scene scale produced a deterministic target-local placement candidate."
        : status === "contextual_candidate"
          ? "Contact/support geometry is useful, but the pair still needs authoritative scene scale and/or final fit validation."
          : "Authoritative scene scale rejects literal placement on the selected support candidate.",
    diagnostics: diagnosticScale(
      base.sourceScale,
      base.targetScale,
      candidates.length,
      candidates.filter((item) => !item.fit.fits).length,
      scalesAreAuthoritative
        ? []
        : [
            "Asset baseline/assumed scale is preview evidence only; it cannot promote or permanently reject Place fit.",
          ],
    ),
  };
}

function resolvedSurfaceAttach(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
): DirectableAssetPairInteractionResolutionV1 {
  const base = baseResolution(source, target, "surface_attach", context);
  const sourceContacts = executableNodes(
    source,
    (item): item is DirectableAssetSurfaceContactAffordance =>
      item.kind === "surface_contact_region",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_source_semantic),
  );
  const targetContacts = executableNodes(
    target,
    (item): item is DirectableAssetSurfaceContactAffordance =>
      item.kind === "surface_contact_region",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );

  if (!sourceContacts.length || !targetContacts.length) {
    return {
      ...base.common,
      status: "fallback_only",
      score: null,
      evidence: evidenceSelection(sourceContacts, targetContacts),
      fit: emptyFit("Generic surface attachment needs measurable exterior contact regions on both actors."),
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [],
      missing_requirements: [
        ...(!sourceContacts.length ? ["source surface-contact region"] : []),
        ...(!targetContacts.length ? ["target surface-contact region"] : []),
      ],
      note:
        "No geometry-backed surface-attachment pair can be selected.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        0,
        0,
      ),
    };
  }

  const candidates = sourceContacts.flatMap((sourceContact) =>
    targetContacts.map((targetContact) => {
      const sourceBoundsM = graphBoundsSizeM(source, base.sourceScale.scale);
      const sourceSize = sourceContact.size
        ? conservativeSurfaceSizeM(sourceContact.size, base.sourceScale.scale)
        : [sourceBoundsM[0], sourceBoundsM[2]] as [number, number];
      const targetBoundsM = graphBoundsSizeM(target, base.targetScale.scale);
      const targetSize = targetContact.size
        ? conservativeSurfaceSizeM(targetContact.size, base.targetScale.scale)
        : [targetBoundsM[0], targetBoundsM[2]] as [number, number];
      const fit = fit2d(sourceSize, targetSize);
      const normalsAvailable = Boolean(
        sourceContact.local_normal && targetContact.local_normal,
      );
      const evidenceScore =
        Math.min(
          sourceContact.evidence.confidence,
          targetContact.evidence.confidence,
        );
      const pairScore =
        0.55 * fit.score +
        0.25 * clamp01(evidenceScore) +
        0.2 * (normalsAvailable ? 1 : 0);
      return {
        sourceContact,
        targetContact,
        sourceSize,
        targetSize,
        fit,
        normalsAvailable,
        pairScore,
      };
    }),
  );

  const selected = candidates
    .sort(
      (a, b) =>
        Number(b.fit.fits) - Number(a.fit.fits) ||
        Number(b.normalsAvailable) - Number(a.normalsAvailable) ||
        b.pairScore - a.pairScore ||
        a.sourceContact.id.localeCompare(b.sourceContact.id) ||
        a.targetContact.id.localeCompare(b.targetContact.id),
    )[0]!;

  const transform =
    selected.fit.fits &&
    selected.sourceContact.local_normal &&
    selected.targetContact.local_normal
      ? surfaceTransform({
          sourcePointM: scalePoint(
            selected.sourceContact.local_position,
            base.sourceScale.scale,
          ),
          targetPointM: scalePoint(
            selected.targetContact.local_position,
            base.targetScale.scale,
          ),
          sourceNormal:
            scaleNormal(
              selected.sourceContact.local_normal,
              base.sourceScale.scale,
            ) ?? [0, 0, 1],
          targetNormal:
            scaleNormal(
              selected.targetContact.local_normal,
              base.targetScale.scale,
            ) ?? [0, 0, 1],
          clearance: base.clearance,
          alignment: "opposed_contact_normals",
        })
      : null;

  const scalesAreAuthoritative =
    scaleIsAuthoritative(base.sourceScale) &&
    scaleIsAuthoritative(base.targetScale);

  return {
    ...base.common,
    status:
      selected.fit.fits && transform
        ? "contextual_candidate"
        : !selected.fit.fits && scalesAreAuthoritative
          ? "fallback_only"
          : "contextual_candidate",
    score: selected.pairScore,
    evidence: evidenceSelection(
      [selected.sourceContact],
      [selected.targetContact],
    ),
    fit: {
      mode: "surface_2d",
      fits: selected.fit.fits,
      score: selected.fit.score,
      source_size_m: [...selected.fit.source_size],
      target_size_m: [...selected.targetSize],
      margin_m: [...selected.fit.margin],
      orientation_variant: selected.fit.id,
      note:
        "Surface geometry can establish a contact/alignment candidate, but geometry alone cannot decide whether the requested material/policy permits persistent attachment.",
    },
    candidate_transform: transform,
    route: null,
    proposed_relationship: transform
      ? proposedRelationship(
          "persistent_attachment",
          selected.sourceContact.id,
          selected.targetContact.id,
        )
      : null,
    context_requirements: [
      "interaction intent/material policy must permit generic surface attachment",
      "selected contact normals must remain physically sensible after scene transforms",
      "Asset Scene Builder must accept collision and contact fit",
    ],
    builder_validation_handoff: [
      "validate contact-region overlap at final scene scale",
      "validate opposed surface normals",
      "reject interpenetration outside the intended contact patch",
      "apply persistent parenting only after validation",
    ],
    missing_requirements:
      selected.fit.fits && transform
        ? ["surface-attachment policy/intent confirmation"]
        : [
            ...(!selected.fit.fits ? ["surface contact regions must fit at final scale"] : []),
            ...(!selected.normalsAvailable ? ["surface contact normals"] : []),
          ],
    note:
      "1B.5C may solve where two surfaces meet, but it deliberately does not reinterpret generic exterior geometry as a semantic connector.",
    diagnostics: diagnosticScale(
      base.sourceScale,
      base.targetScale,
      candidates.length,
      candidates.filter((item) => !item.fit.fits || !item.normalsAvailable).length,
      scalesAreAuthoritative
        ? []
        : ["Asset baseline/assumed scale is preview evidence only; surface fit remains contextual until authoritative scene scale is supplied."],
    ),
  };
}

function isPort(
  item: DirectableAssetAffordanceNode,
): item is DirectableAssetPortAffordance {
  return (
    item.kind === "attachment_port" ||
    item.kind === "socket_port" ||
    item.kind === "inlet_port" ||
    item.kind === "outlet_port"
  );
}

function precisePortKindScore(
  source: DirectableAssetPortAffordance,
  target: DirectableAssetPortAffordance,
) {
  if (
    source.kind === "attachment_port" &&
    target.kind === "socket_port"
  ) {
    return 1;
  }
  if (
    source.kind === "socket_port" &&
    target.kind === "attachment_port"
  ) {
    return 0.95;
  }
  if (
    source.kind === "attachment_port" &&
    target.kind === "attachment_port"
  ) {
    return 0.78;
  }
  return 0;
}

function compatiblePrecisePortPairs(
  sourcePorts: DirectableAssetPortAffordance[],
  targetPorts: DirectableAssetPortAffordance[],
) {
  return sourcePorts.flatMap((sourcePort) =>
    targetPorts.flatMap((targetPort) => {
      const kindScore = precisePortKindScore(sourcePort, targetPort);
      if (kindScore <= 0) return [];
      const sourceTokens = semanticTokens(sourcePort.semantic_names);
      const targetTokens = semanticTokens(targetPort.semantic_names);
      const shared = sharedTokens(sourceTokens, targetTokens);
      if (!shared.length) return [];
      const semanticScore = clamp01(shared.length / Math.max(1, Math.min(2, Math.max(sourceTokens.length, targetTokens.length))));
      const evidenceScore =
        Math.min(
          sourcePort.evidence.confidence,
          targetPort.evidence.confidence,
        );
      const score =
        0.35 * kindScore +
        0.4 * semanticScore +
        0.25 * clamp01(evidenceScore);
      return [{
        sourcePort,
        targetPort,
        sourceTokens,
        targetTokens,
        shared,
        kindScore,
        semanticScore,
        score,
      }];
    }),
  );
}

function resolvedPreciseAttach(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
): DirectableAssetPairInteractionResolutionV1 {
  const base = baseResolution(source, target, "precise_attach", context);
  const sourcePorts = executableNodes(
    source,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) &&
      (item.kind === "attachment_port" || item.kind === "socket_port"),
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_source_semantic),
  );
  const targetPorts = executableNodes(
    target,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) &&
      (item.kind === "attachment_port" || item.kind === "socket_port"),
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );

  if (!sourcePorts.length || !targetPorts.length) {
    return {
      ...base.common,
      status: "requires_asset_authoring",
      score: null,
      evidence: evidenceSelection(sourcePorts, targetPorts),
      fit: emptyFit("Precise attachment requires semantically authored/verified connector or socket evidence on both actors."),
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [],
      missing_requirements: [
        ...(!sourcePorts.length ? ["source attachment/socket port"] : []),
        ...(!targetPorts.length ? ["target attachment/socket port"] : []),
      ],
      note:
        "Generic exterior surface regions are intentionally excluded from precise connector attachment.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        0,
        0,
      ),
    };
  }

  const candidates = compatiblePrecisePortPairs(sourcePorts, targetPorts);
  if (!candidates.length) {
    return {
      ...base.common,
      status: "fallback_only",
      score: null,
      evidence: evidenceSelection(sourcePorts, targetPorts),
      fit: {
        mode: "semantic_port",
        fits: false,
        score: 0,
        source_size_m: null,
        target_size_m: null,
        margin_m: null,
        orientation_variant: null,
        note:
          "Ports exist on both actors, but no pair has compatible kind + meaningful shared semantic tokens.",
      },
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [],
      missing_requirements: ["compatible typed connector/socket semantics"],
      note:
        "1B.5C fails closed rather than mating unrelated authored ports.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        sourcePorts.length * targetPorts.length,
        sourcePorts.length * targetPorts.length,
      ),
    };
  }

  const selected = candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.sourcePort.id.localeCompare(b.sourcePort.id) ||
      a.targetPort.id.localeCompare(b.targetPort.id),
  )[0]!;

  const sourceNormal = scaleNormal(
    selected.sourcePort.local_normal,
    base.sourceScale.scale,
  );
  const targetNormal = scaleNormal(
    selected.targetPort.local_normal,
    base.targetScale.scale,
  );
  const transform: DirectableAssetPairCandidateTransform =
    sourceNormal && targetNormal
      ? surfaceTransform({
          sourcePointM: scalePoint(
            selected.sourcePort.local_position,
            base.sourceScale.scale,
          ),
          targetPointM: scalePoint(
            selected.targetPort.local_position,
            base.targetScale.scale,
          ),
          sourceNormal,
          targetNormal,
          clearance: 0,
          alignment: "opposed_contact_normals",
        })
      : {
          coordinate_space: "target_scaled_local",
          source_origin_translation_m: subtract(
            scalePoint(
              selected.targetPort.local_position,
              base.targetScale.scale,
            ),
            scalePoint(
              selected.sourcePort.local_position,
              base.sourceScale.scale,
            ),
          ),
          source_rotation_quaternion_xyzw: [0, 0, 0, 1] as Quat,
          source_anchor_local_m: scalePoint(
            selected.sourcePort.local_position,
            base.sourceScale.scale,
          ),
          target_anchor_local_m: scalePoint(
            selected.targetPort.local_position,
            base.targetScale.scale,
          ),
          source_normal_local: sourceNormal,
          target_normal_local: targetNormal,
          alignment_rule: "source_anchor_to_target_anchor" as const,
          note:
            "Port positions align, but one or both port normals are missing; orientation remains contextual.",
        };

  const normalsResolved = Boolean(sourceNormal && targetNormal);
  const scalesAreAuthoritative =
    scaleIsAuthoritative(base.sourceScale) &&
    scaleIsAuthoritative(base.targetScale);

  return {
    ...base.common,
    status: normalsResolved && scalesAreAuthoritative
      ? "resolved_candidate"
      : "contextual_candidate",
    score: selected.score,
    evidence: evidenceSelection(
      [selected.sourcePort],
      [selected.targetPort],
      selected.shared,
    ),
    fit: {
      mode: "semantic_port",
      fits: true,
      score: selected.score,
      source_size_m: null,
      target_size_m: null,
      margin_m: null,
      orientation_variant: null,
      note:
        "Connector compatibility is derived from trusted port kind plus meaningful shared semantic tokens. Dimensional mating remains a Builder validation responsibility unless richer port geometry is authored later.",
    },
    candidate_transform: transform,
    route: null,
    proposed_relationship: proposedRelationship(
      "persistent_attachment",
      selected.sourcePort.id,
      selected.targetPort.id,
    ),
    context_requirements: [
      ...(!normalsResolved
        ? ["author or resolve port normals/orientation frames for exact mating"]
        : []),
      ...(!scalesAreAuthoritative
        ? ["authoritative final scene dimensions/instance scale"]
        : []),
    ],
    builder_validation_handoff: [
      "validate collision-free connector mating",
      "validate any connector-specific dimensional/tolerance constraints",
      "persist source→target attachment only after validation",
    ],
    missing_requirements: [
      ...(!normalsResolved ? ["complete port orientation frame"] : []),
      ...(!scalesAreAuthoritative
        ? ["authoritative final scene dimensions/instance scale"]
        : []),
    ],
    note:
      normalsResolved && scalesAreAuthoritative
        ? "A typed compatible connector pair has been selected at authoritative scene scale. Generic surface-contact evidence did not participate."
        : "Typed connector semantics are compatible, but exact mating remains contextual until port orientation and authoritative scene scale are resolved.",
    diagnostics: diagnosticScale(
      base.sourceScale,
      base.targetScale,
      candidates.length,
      sourcePorts.length * targetPorts.length - candidates.length,
    ),
  };
}

function containmentOpeningPort(
  target: DirectableAssetAffordanceGraphV1,
  containment: DirectableAssetContainmentAffordance,
  context: DirectableAssetPairContextV1,
) {
  const suffix = containment.id.includes(":")
    ? containment.id.slice(containment.id.indexOf(":") + 1)
    : "";
  const inlets = executableNodes(
    target,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) && item.kind === "inlet_port",
  ).filter(
    (item) =>
      semanticRequestMatches(item, context.requested_target_semantic) &&
      Boolean(item.opening_size),
  );
  if (!inlets.length) return null;
  if (suffix) {
    const exact = inlets.find((item) => item.id === `inlet_port:${suffix}`);
    if (exact) return exact;
  }
  return inlets
    .sort(
      (a, b) =>
        b.evidence.confidence - a.evidence.confidence ||
        a.id.localeCompare(b.id),
    )[0] ?? null;
}

function fit3dThroughOpening(
  sourceSize: Vec3,
  targetSize: Vec3,
  openingSize: [number, number],
) {
  const ranked = BOX_ORIENTATIONS.map((orientation) => {
    const output = orientation.output_size(sourceSize);
    const volumeMargin: Vec3 = [
      targetSize[0] - output[0],
      targetSize[1] - output[1],
      targetSize[2] - output[2],
    ];
    const volumeRatios = [
      targetSize[0] / Math.max(EPS, output[0]),
      targetSize[1] / Math.max(EPS, output[1]),
      targetSize[2] / Math.max(EPS, output[2]),
    ];
    const volumeMinRatio = Math.min(...volumeRatios);
    const volumeFits = volumeMargin.every((value) => value >= -EPS);
    const volumeScore = volumeFits
      ? 0.72 + 0.28 * clamp01((volumeMinRatio - 1) / 1.5)
      : 0.7 * clamp01(volumeMinRatio);

    const sourceAperture: [number, number] = [output[0], output[2]];
    const openingMargin: [number, number] = [
      openingSize[0] - sourceAperture[0],
      openingSize[1] - sourceAperture[1],
    ];
    const openingRatios = [
      openingSize[0] / Math.max(EPS, sourceAperture[0]),
      openingSize[1] / Math.max(EPS, sourceAperture[1]),
    ];
    const openingMinRatio = Math.min(...openingRatios);
    const openingFits =
      openingMargin[0] >= -EPS && openingMargin[1] >= -EPS;
    const openingScore = openingFits
      ? 0.72 + 0.28 * clamp01((openingMinRatio - 1) / 1.5)
      : 0.7 * clamp01(openingMinRatio);

    return {
      orientation,
      output,
      margin: volumeMargin,
      fits: volumeFits && openingFits,
      score: 0.62 * volumeScore + 0.38 * openingScore,
      volume_fits: volumeFits,
      opening_fits: openingFits,
      opening_size: openingSize,
      source_aperture_size: sourceAperture,
      opening_margin: openingMargin,
      volume_score: volumeScore,
      opening_score: openingScore,
    };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      Number(b.volume_fits) - Number(a.volume_fits) ||
      Number(b.opening_fits) - Number(a.opening_fits) ||
      b.score - a.score ||
      a.orientation.id.localeCompare(b.orientation.id),
  )[0]!;
}

function socketInsertCandidates(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
) {
  const sourcePorts = executableNodes(
    source,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) && item.kind === "attachment_port",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_source_semantic),
  );
  const targetSockets = executableNodes(
    target,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) && item.kind === "socket_port",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );
  return compatiblePrecisePortPairs(sourcePorts, targetSockets);
}

function resolvedInsert(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
): DirectableAssetPairInteractionResolutionV1 {
  const base = baseResolution(source, target, "insert", context);
  const sourceRootEvidence = source.affordances.filter(
    (item) => item.kind === "root_transform" && item.evidence.executable,
  );
  const containments = executableNodes(
    target,
    (item): item is DirectableAssetContainmentAffordance =>
      item.kind === "containment_volume",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );
  const socketCandidates = socketInsertCandidates(source, target, context);

  if (!containments.length && !socketCandidates.length) {
    const targetSockets = executableNodes(
      target,
      (item): item is DirectableAssetPortAffordance =>
        isPort(item) && item.kind === "socket_port",
    );
    return {
      ...base.common,
      status:
        targetSockets.length > 0
          ? "fallback_only"
          : "requires_asset_authoring",
      score: null,
      evidence: EMPTY_EVIDENCE,
      fit: emptyFit(
        targetSockets.length
          ? "A target socket exists, but no compatible source insertion port was found."
          : "Insertion requires a trusted usable containment volume or typed socket receiver.",
      ),
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [],
      missing_requirements: [
        targetSockets.length
          ? "compatible source port for target socket"
          : "target containment volume or compatible socket receiver",
      ],
      note:
        "Raw containment candidates are intentionally excluded; they cannot become insertion receivers until promoted by trusted evidence.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        0,
        0,
      ),
    };
  }

  const sourceSizeM = graphBoundsSizeM(source, base.sourceScale.scale);
  const sourceCenterM = graphBoundsCenterM(source, base.sourceScale.scale);
  const scalesAreAuthoritative =
    scaleIsAuthoritative(base.sourceScale) &&
    scaleIsAuthoritative(base.targetScale);

  const volumeCandidates = containments.map((containment) => {
    const targetSizeM = multiply(
      vec3(containment.size),
      base.targetScale.scale,
    );
    const openingPort = containmentOpeningPort(
      target,
      containment,
      context,
    );
    const openingSizeM = openingPort?.opening_size
      ? conservativeSurfaceSizeM(
          openingPort.opening_size,
          base.targetScale.scale,
        )
      : null;
    const fit = openingSizeM
      ? fit3dThroughOpening(
          sourceSizeM,
          targetSizeM,
          openingSizeM,
        )
      : fit3d(sourceSizeM, targetSizeM);
    const pairScore =
      0.56 * fit.score +
      0.24 * clamp01(containment.usability_score) +
      0.12 * clamp01(containment.evidence.confidence) +
      0.08 * (openingSizeM ? 1 : 0);
    return {
      containment,
      openingPort,
      openingSizeM,
      targetSizeM,
      fit,
      pairScore,
    };
  });

  const bestVolume = volumeCandidates.sort(
    (a, b) =>
      Number(b.fit.fits) - Number(a.fit.fits) ||
      Number(Boolean(b.openingSizeM)) - Number(Boolean(a.openingSizeM)) ||
      b.pairScore - a.pairScore ||
      a.containment.id.localeCompare(b.containment.id),
  )[0] ?? null;

  if (bestVolume?.fit.fits) {
    const targetCenterM = scalePoint(
      bestVolume.containment.local_center,
      base.targetScale.scale,
    );
    const rotatedSourceCenter = quaternionRotate(
      bestVolume.fit.orientation.quaternion,
      sourceCenterM,
    );
    const accessDirection = scaleNormal(
      bestVolume.containment.access_direction,
      base.targetScale.scale,
    );
    const openingKnown = Boolean(bestVolume.openingSizeM);
    const transform: DirectableAssetPairCandidateTransform = {
      coordinate_space: "target_scaled_local",
      source_origin_translation_m: subtract(
        targetCenterM,
        rotatedSourceCenter,
      ),
      source_rotation_quaternion_xyzw:
        bestVolume.fit.orientation.quaternion,
      source_anchor_local_m: sourceCenterM,
      target_anchor_local_m: targetCenterM,
      source_normal_local: null,
      target_normal_local: accessDirection,
      alignment_rule: "target_access_axis",
      note:
        "Candidate centers a rotated source bounding box inside the trusted receiver. When aperture geometry is present, the same orientation is required to pass the opening; Builder collision/clearance remains authoritative.",
    };
    const status =
      scalesAreAuthoritative && accessDirection && openingKnown
        ? "resolved_candidate"
        : "contextual_candidate";
    const targetEvidence: DirectableAssetAffordanceNode[] = [
      bestVolume.containment,
      ...(bestVolume.openingPort ? [bestVolume.openingPort] : []),
    ];
    const missingRequirements = [
      ...(!scalesAreAuthoritative
        ? ["authoritative final scene dimensions/instance scale"]
        : []),
      ...(!openingKnown ? ["receiver opening aperture dimensions"] : []),
      ...(!accessDirection ? ["target access direction"] : []),
    ];

    return {
      ...base.common,
      status,
      score: bestVolume.pairScore,
      evidence: evidenceSelection(
        sourceRootEvidence,
        targetEvidence,
      ),
      fit: {
        mode: "volume_3d",
        fits: true,
        score: bestVolume.fit.score,
        source_size_m: [...bestVolume.fit.output],
        target_size_m: [...bestVolume.targetSizeM],
        margin_m: [...bestVolume.fit.margin],
        orientation_variant: bestVolume.fit.orientation.id,
        note: bestVolume.openingSizeM
          ? "The same conservative box orientation fits both the trusted containment volume and the measured receiver aperture."
          : "Source bounds fit the trusted containment volume, but the receiver aperture is not dimensioned strongly enough to prove entry.",
      },
      candidate_transform: transform,
      route: null,
      proposed_relationship: proposedRelationship(
        "containment_membership",
        sourceRootEvidence[0]?.id ?? "root_bounds",
        bestVolume.containment.id,
      ),
      context_requirements: [
        ...(!scalesAreAuthoritative
          ? [
              "authoritative final scene dimensions/instance scale must replace Asset Library baseline scale",
            ]
          : []),
        ...(!openingKnown
          ? [
              "receiver opening aperture must be measured/authored before insertion is promoted",
            ]
          : []),
        ...(!accessDirection
          ? [
              "target access/insertion direction must be resolved before motion planning",
            ]
          : []),
      ],
      builder_validation_handoff: [
        "validate exact mesh/collision fit inside receiver",
        "validate continuous collision-free access path through the measured receiver opening",
        "reject interpenetration with receiver walls",
        "activate containment membership only after validation",
      ],
      missing_requirements: missingRequirements,
      note:
        status === "resolved_candidate"
          ? "Authoritative scene scale + trusted containment + measured aperture support a deterministic insertion candidate; Builder still proves exact collision/path clearance."
          : "Containment fit is promising, but final scene scale, opening aperture, or access direction is still contextual.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        volumeCandidates.length + socketCandidates.length,
        volumeCandidates.filter((item) => !item.fit.fits).length,
        [
          ...(!scalesAreAuthoritative
            ? [
                "Asset baseline/assumed scale is preview evidence only; it cannot promote Insert fit.",
              ]
            : []),
          ...(!openingKnown
            ? [
                "Receiver volume is known but entry aperture is not dimensioned.",
              ]
            : []),
        ],
      ),
    };
  }

  if (socketCandidates.length) {
    const selected = socketCandidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.sourcePort.id.localeCompare(b.sourcePort.id) ||
        a.targetPort.id.localeCompare(b.targetPort.id),
    )[0]!;
    const sourceNormal = scaleNormal(
      selected.sourcePort.local_normal,
      base.sourceScale.scale,
    );
    const targetNormal = scaleNormal(
      selected.targetPort.local_normal,
      base.targetScale.scale,
    );
    const transform =
      sourceNormal && targetNormal
        ? surfaceTransform({
            sourcePointM: scalePoint(
              selected.sourcePort.local_position,
              base.sourceScale.scale,
            ),
            targetPointM: scalePoint(
              selected.targetPort.local_position,
              base.targetScale.scale,
            ),
            sourceNormal,
            targetNormal,
            clearance: 0,
            alignment: "opposed_contact_normals",
          })
        : null;
    return {
      ...base.common,
      status: "contextual_candidate",
      score: selected.score,
      evidence: evidenceSelection(
        [selected.sourcePort],
        [selected.targetPort],
        selected.shared,
      ),
      fit: {
        mode: "semantic_port",
        fits: null,
        score: selected.score,
        source_size_m: null,
        target_size_m: null,
        margin_m: null,
        orientation_variant: null,
        note:
          "Typed plug/socket semantics match, but current affordance ports do not carry a full receiver bore/tolerance volume. Dimensional insertion stays contextual.",
      },
      candidate_transform: transform,
      route: null,
      proposed_relationship: proposedRelationship(
        "containment_membership",
        selected.sourcePort.id,
        selected.targetPort.id,
      ),
      context_requirements: [
        "socket bore/depth or equivalent fit geometry must be validated by Asset Scene Builder",
        ...(!scalesAreAuthoritative
          ? ["authoritative final scene dimensions/instance scale"]
          : []),
      ],
      builder_validation_handoff: [
        "validate source connector dimensions against socket receiver geometry",
        "validate insertion depth and collision-free access path",
        "activate containment/attachment relation only after validation",
      ],
      missing_requirements: [
        "socket dimensional/tolerance validation",
        ...(!scalesAreAuthoritative
          ? ["authoritative final scene dimensions/instance scale"]
          : []),
      ],
      note:
        "Semantic socket compatibility is known, but geometry is deliberately not invented.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        volumeCandidates.length + socketCandidates.length,
        volumeCandidates.filter((item) => !item.fit.fits).length,
      ),
    };
  }

  return {
    ...base.common,
    status: scalesAreAuthoritative
      ? "fallback_only"
      : "contextual_candidate",
    score: bestVolume?.pairScore ?? null,
    evidence: evidenceSelection(
      sourceRootEvidence,
      bestVolume
        ? [
            bestVolume.containment,
            ...(bestVolume.openingPort ? [bestVolume.openingPort] : []),
          ]
        : containments,
    ),
    fit: bestVolume
      ? {
          mode: "volume_3d",
          fits: false,
          score: bestVolume.fit.score,
          source_size_m: [...bestVolume.fit.output],
          target_size_m: [...bestVolume.targetSizeM],
          margin_m: [...bestVolume.fit.margin],
          orientation_variant: bestVolume.fit.orientation.id,
          note: bestVolume.openingSizeM
            ? "No conservative orientation fits both the measured receiver aperture and trusted containment volume."
            : "Trusted containment exists, but source bounds do not fit at the current pair dimensions; aperture geometry is also unavailable.",
        }
      : emptyFit("No containment fit candidate was available."),
    candidate_transform: null,
    route: null,
    proposed_relationship: null,
    context_requirements: scalesAreAuthoritative
      ? []
      : ["final scene dimensions/scale must be supplied before rejecting fit"],
    builder_validation_handoff: [],
    missing_requirements: [
      "source must fit a trusted receiver at final scene scale",
    ],
    note:
      scalesAreAuthoritative
        ? "Insertion fails closed when trusted receiver geometry cannot fit the source through its known aperture/volume constraints."
        : "Preview/baseline scale does not currently fit, but final scene scale may still change the result.",
    diagnostics: diagnosticScale(
      base.sourceScale,
      base.targetScale,
      volumeCandidates.length + socketCandidates.length,
      volumeCandidates.filter((item) => !item.fit.fits).length,
      scalesAreAuthoritative
        ? []
        : [
            "Asset baseline/assumed scale is preview evidence only; insertion fit rejection remains contextual until authoritative scene scale is supplied.",
          ],
    ),
  };
}

function isPortOrContainmentPort(
  item: DirectableAssetPortAffordance | DirectableAssetContainmentAffordance,
): item is DirectableAssetPortAffordance {
  return (
    item.kind === "attachment_port" ||
    item.kind === "socket_port" ||
    item.kind === "inlet_port" ||
    item.kind === "outlet_port"
  );
}

function flowMediumCompatible(
  source: DirectableAssetPortAffordance,
  target: DirectableAssetPortAffordance | DirectableAssetContainmentAffordance,
  medium: string | null | undefined,
) {
  const sourceTokens = semanticTokens(source.semantic_names);
  const targetTokens = semanticTokens(target.semantic_names);
  const shared = sharedTokens(sourceTokens, targetTokens);
  const mediumTokens = medium ? normalizedWords(medium) : [];
  const mediumMatch =
    mediumTokens.length > 0 &&
    mediumTokens.some(
      (token) =>
        sourceTokens.includes(token) ||
        targetTokens.includes(token),
    );

  const sourceSpecific = sourceTokens.length > 0;
  const targetSpecific = targetTokens.length > 0;

  if (sourceSpecific && targetSpecific && !shared.length && !mediumMatch) {
    return {
      compatible: false,
      shared,
      score: 0,
      note:
        "Both flow endpoints are semantically specific but share no compatible medium/type token.",
    };
  }

  const score =
    0.55 +
    0.25 * (shared.length ? 1 : 0) +
    0.2 * (mediumMatch ? 1 : 0);

  return {
    compatible: true,
    shared,
    score: clamp01(score),
    note:
      shared.length || mediumMatch
        ? "Flow endpoint semantics are compatible."
        : "Target is generic enough to receive the user-directed flow; medium/type remains contextual.",
  };
}

function resolvedFlow(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  context: DirectableAssetPairContextV1,
): DirectableAssetPairInteractionResolutionV1 {
  const base = baseResolution(source, target, "flow", context);
  const outlets = executableNodes(
    source,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) && item.kind === "outlet_port",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_source_semantic),
  );
  const inlets = executableNodes(
    target,
    (item): item is DirectableAssetPortAffordance =>
      isPort(item) && item.kind === "inlet_port",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );
  const containments = executableNodes(
    target,
    (item): item is DirectableAssetContainmentAffordance =>
      item.kind === "containment_volume",
  ).filter((item) =>
    semanticRequestMatches(item, context.requested_target_semantic),
  );

  if (!outlets.length || (!inlets.length && !containments.length)) {
    return {
      ...base.common,
      status: "requires_asset_authoring",
      score: null,
      evidence: evidenceSelection(outlets, [...inlets, ...containments]),
      fit: emptyFit("Directed Flow requires a trusted source outlet and a trusted target inlet or usable containment receiver."),
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [
        "diagrammatic Flow remains available without inventing physical endpoints",
      ],
      missing_requirements: [
        ...(!outlets.length ? ["source outlet/emission port"] : []),
        ...(!inlets.length && !containments.length
          ? ["target inlet or containment receiver"]
          : []),
      ],
      note:
        "1B.5C will not invent a literal source/destination point from arbitrary mesh bounds.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        0,
        0,
      ),
    };
  }

  const targets: Array<
    DirectableAssetPortAffordance | DirectableAssetContainmentAffordance
  > = [...inlets, ...containments];

  const candidates = outlets.flatMap((outlet) =>
    targets.flatMap((targetEvidence) => {
      const compatibility = flowMediumCompatible(
        outlet,
        targetEvidence,
        context.medium,
      );
      if (!compatibility.compatible) return [];
      const evidenceScore =
        Math.min(
          outlet.evidence.confidence,
          targetEvidence.evidence.confidence,
        );
      const receiverPreference =
        targetEvidence.kind === "inlet_port" ? 1 : 0.82;
      const score =
        0.48 * compatibility.score +
        0.32 * clamp01(evidenceScore) +
        0.2 * receiverPreference;
      return [{
        outlet,
        targetEvidence,
        compatibility,
        score,
      }];
    }),
  );

  if (!candidates.length) {
    return {
      ...base.common,
      status: "fallback_only",
      score: null,
      evidence: evidenceSelection(outlets, targets),
      fit: {
        mode: "directed_route",
        fits: false,
        score: 0,
        source_size_m: null,
        target_size_m: null,
        margin_m: null,
        orientation_variant: null,
        note:
          "Physical endpoints exist, but their semantic medium/type evidence conflicts.",
      },
      candidate_transform: null,
      route: null,
      proposed_relationship: null,
      context_requirements: [],
      builder_validation_handoff: [
        "diagrammatic Flow may still be rendered when literal endpoint semantics conflict",
      ],
      missing_requirements: ["compatible flow medium/type semantics"],
      note:
        "Specific incompatible endpoints are not connected merely because one is an outlet and one is an inlet.",
      diagnostics: diagnosticScale(
        base.sourceScale,
        base.targetScale,
        outlets.length * targets.length,
        outlets.length * targets.length,
      ),
    };
  }

  const selected = candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.targetEvidence.kind === "inlet_port") -
        Number(a.targetEvidence.kind === "inlet_port") ||
      a.outlet.id.localeCompare(b.outlet.id) ||
      a.targetEvidence.id.localeCompare(b.targetEvidence.id),
  )[0]!;

  const sourcePoint = scalePoint(
    selected.outlet.local_position,
    base.sourceScale.scale,
  );
  const sourceDirection = scaleNormal(
    selected.outlet.local_normal,
    base.sourceScale.scale,
  );
  const targetEvidence = selected.targetEvidence;
  let targetPoint: Vec3;
  let targetAccess: Vec3 | null;
  if (isPortOrContainmentPort(targetEvidence)) {
    targetPoint = scalePoint(
      targetEvidence.local_position,
      base.targetScale.scale,
    );
    targetAccess = scaleNormal(
      targetEvidence.local_normal,
      base.targetScale.scale,
    );
  } else {
    targetPoint = scalePoint(
      targetEvidence.local_center,
      base.targetScale.scale,
    );
    targetAccess = scaleNormal(
      targetEvidence.access_direction,
      base.targetScale.scale,
    );
  }
  const route: DirectableAssetPairRoutePlan = {
    source_point_local_m: sourcePoint,
    target_point_local_m: targetPoint,
    source_direction_local: sourceDirection,
    target_access_direction_local: targetAccess,
    route_mode: "direct_segment_candidate",
    note:
      "Endpoints are expressed in their respective scaled actor-local spaces. Scene runtime transforms them to world space and may bend/reroute the carrier representation around obstacles.",
  };
  const targetIsExplicitInlet =
    selected.targetEvidence.kind === "inlet_port";
  const scalesAreAuthoritative =
    scaleIsAuthoritative(base.sourceScale) &&
    scaleIsAuthoritative(base.targetScale);

  return {
    ...base.common,
    status:
      targetIsExplicitInlet &&
      sourceDirection &&
      targetAccess &&
      scalesAreAuthoritative
        ? "resolved_candidate"
        : "contextual_candidate",
    score: selected.score,
    evidence: evidenceSelection(
      [selected.outlet],
      [selected.targetEvidence],
      selected.compatibility.shared,
    ),
    fit: {
      mode: "directed_route",
      fits: true,
      score: selected.compatibility.score,
      source_size_m: null,
      target_size_m: null,
      margin_m: null,
      orientation_variant: null,
      note: selected.compatibility.note,
    },
    candidate_transform: null,
    route,
    proposed_relationship: proposedRelationship(
      "directed_flow_link",
      selected.outlet.id,
      selected.targetEvidence.id,
    ),
    context_requirements: [
      ...(!targetIsExplicitInlet
        ? ["resolve a visible receiver/access point inside the usable containment volume"]
        : []),
      ...(!sourceDirection ? ["resolve source outlet direction"] : []),
      ...(!targetAccess ? ["resolve target access direction"] : []),
      ...(!scalesAreAuthoritative
        ? ["authoritative final scene dimensions/instance scale"]
        : []),
    ],
    builder_validation_handoff: [
      "transform selected endpoints into current world-space actor poses",
      "validate route visibility/obstruction for the chosen visual carrier",
      "retain process quantity semantics from the existing Director process runtime",
      "do not imply fluid/particle physics beyond the selected representation",
    ],
    missing_requirements: [
      ...(!targetIsExplicitInlet ? ["explicit target inlet/access point"] : []),
      ...(!sourceDirection ? ["source outlet direction"] : []),
      ...(!targetAccess ? ["target access direction"] : []),
      ...(!scalesAreAuthoritative
        ? ["authoritative final scene dimensions/instance scale"]
        : []),
    ],
    note:
      "1B.5C.2 resolves which actual source and destination evidence participate in Flow while keeping baseline-scale routes contextual; route rendering and process physics remain separate concerns.",
    diagnostics: diagnosticScale(
      base.sourceScale,
      base.targetScale,
      candidates.length,
      outlets.length * targets.length - candidates.length,
    ),
  };
}

export function resolveDirectableAssetPairInteraction(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  interactionId: DirectableAssetPairInteractionId,
  context: DirectableAssetPairContextV1 = {},
): DirectableAssetPairInteractionResolutionV1 {
  if (source.asset_id === target.asset_id) {
    // Same asset id is legal: separate scene instances may use the same library asset.
  }

  switch (interactionId) {
    case "place_on":
      return resolvedPlaceOn(source, target, context);
    case "surface_attach":
      return resolvedSurfaceAttach(source, target, context);
    case "precise_attach":
      return resolvedPreciseAttach(source, target, context);
    case "insert":
      return resolvedInsert(source, target, context);
    case "flow":
      return resolvedFlow(source, target, context);
    default: {
      const exhaustive: never = interactionId;
      throw new Error(`Unknown asset-pair interaction: ${String(exhaustive)}`);
    }
  }
}

export function resolveAllDirectableAssetPairInteractions(
  source: DirectableAssetAffordanceGraphV1,
  target: DirectableAssetAffordanceGraphV1,
  interactionIds: readonly DirectableAssetPairInteractionId[],
  context: DirectableAssetPairContextV1 = {},
) {
  return interactionIds.map((interactionId) =>
    resolveDirectableAssetPairInteraction(
      source,
      target,
      interactionId,
      context,
    ),
  );
}

export function weakestPairEvidenceQualification(
  resolution: DirectableAssetPairInteractionResolutionV1,
): DirectableAssetQualificationLevel {
  const levels = [
    ...resolution.evidence.source_qualification_levels,
    ...resolution.evidence.target_qualification_levels,
  ];
  if (!levels.length) return "unknown";
  return levels.reduce((weakest, current) =>
    QUALIFICATION_RANK[current] < QUALIFICATION_RANK[weakest]
      ? current
      : weakest,
  );
}
