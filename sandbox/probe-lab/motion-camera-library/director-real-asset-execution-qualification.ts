import type { MyWayAssetRecord } from "../assets/asset-types";
import type { DirectorCapability } from "./director-capability-registry";
import {
  directorCapabilityAssetAuthorityPath,
  type DirectorCapabilityAssetAuthorityPath,
} from "../directability/capability-authority-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../directability/directable-asset-compiler";
import {
  qualifyDirectableAssetForOperator,
  type DirectableAssetOperatorQualification,
} from "../directability/interaction-operator-resolver";
import {
  resolveDirectableAssetPairInteraction,
} from "../directability/pair-interaction-resolver";
import type {
  DirectableAssetPairInteractionResolutionV1,
} from "../directability/pair-interaction-contract";

export const DIRECTOR_REAL_ASSET_EXECUTION_QUALIFICATION_VERSION =
  "director_real_asset_execution_qualification_phase1b5e_v1" as const;

export type DirectorRealAssetExecutionStatus =
  | "not_asset_gated"
  | "missing_required_asset"
  | "asset_authoring_required"
  | "runtime_pending"
  | "fallback_only"
  | "context_required"
  | "builder_validation_required"
  | "ready_for_visual_proof";

export type DirectorRealAssetRoleInput = {
  role: string;
  asset: MyWayAssetRecord | null;
  target_extent_m: number;
};

export type DirectorRealAssetOperatorProof = {
  side: "self" | "source" | "target";
  role: string;
  asset_id: string | null;
  qualification: DirectableAssetOperatorQualification | null;
};

export type DirectorRealAssetPairProof = {
  source_role: string;
  target_role: string;
  source_asset_id: string | null;
  target_asset_id: string | null;
  resolution: DirectableAssetPairInteractionResolutionV1 | null;
};

export type DirectorRealAssetExecutionQualificationReport = {
  version: typeof DIRECTOR_REAL_ASSET_EXECUTION_QUALIFICATION_VERSION;
  capability_id: string;
  authority_path: DirectorCapabilityAssetAuthorityPath | null;
  source_role: string | null;
  target_role: string | null;
  operator_proofs: DirectorRealAssetOperatorProof[];
  pair_proofs: DirectorRealAssetPairProof[];
  execution_status: DirectorRealAssetExecutionStatus;
  runtime_support: DirectorCapability["compiler"]["threejs"];
  builder_validation_required: boolean;
  selected_asset_ids: string[];
  missing_roles: string[];
  summary: string;
};

function roleByName(
  roles: readonly DirectorRealAssetRoleInput[],
  name: string,
) {
  return roles.find((role) => role.role === name) ?? null;
}

function primaryRole(roles: readonly DirectorRealAssetRoleInput[]) {
  return roleByName(roles, "primary_subject") ?? roles[0] ?? null;
}

function secondaryRole(roles: readonly DirectorRealAssetRoleInput[]) {
  return (
    roleByName(roles, "secondary_subject") ??
    roles.find((role) => role !== primaryRole(roles)) ??
    null
  );
}

function sceneDimensions(
  asset: MyWayAssetRecord,
  targetExtent: number,
): [number, number, number] {
  const source = asset.dimensions_m ?? [1, 1, 1];
  const largest = Math.max(
    0.001,
    ...source.map((value) => Math.abs(Number(value) || 0)),
  );
  const scale = Math.max(0.001, targetExtent) / largest;
  return source.map((value) =>
    Math.max(0.001, Math.abs(Number(value) || 0) * scale),
  ) as [number, number, number];
}

function graphFor(asset: MyWayAssetRecord) {
  return compileDirectableAssetAffordanceGraph(asset);
}

function operatorProof(
  side: DirectorRealAssetOperatorProof["side"],
  role: DirectorRealAssetRoleInput | null,
  operatorId: DirectorCapabilityAssetAuthorityPath["asset_operator_ids"][number],
): DirectorRealAssetOperatorProof {
  return {
    side,
    role: role?.role ?? (side === "target" ? "secondary_subject" : "primary_subject"),
    asset_id: role?.asset?.asset_id ?? null,
    qualification: role?.asset
      ? qualifyDirectableAssetForOperator(
          graphFor(role.asset),
          operatorId,
        )
      : null,
  };
}

function statusFromProofs(
  capability: DirectorCapability,
  authorityPath: DirectorCapabilityAssetAuthorityPath | null,
  operatorProofs: readonly DirectorRealAssetOperatorProof[],
  pairProofs: readonly DirectorRealAssetPairProof[],
  missingRoles: readonly string[],
): DirectorRealAssetExecutionStatus {
  if (!authorityPath) {
    return capability.compiler.threejs === "declared"
      ? "runtime_pending"
      : "not_asset_gated";
  }
  if (missingRoles.length) return "missing_required_asset";

  const operatorStatuses = operatorProofs
    .map((proof) => proof.qualification?.status)
    .filter((status): status is NonNullable<typeof status> => Boolean(status));

  if (
    operatorStatuses.includes("requires_asset_authoring") ||
    pairProofs.some(
      (proof) => proof.resolution?.status === "requires_asset_authoring",
    )
  ) {
    return "asset_authoring_required";
  }
  if (operatorStatuses.includes("asset_ready_runtime_pending")) {
    return "runtime_pending";
  }
  if (
    operatorStatuses.includes("fallback_only") ||
    pairProofs.some((proof) => proof.resolution?.status === "fallback_only")
  ) {
    return "fallback_only";
  }
  if (
    operatorStatuses.includes("conditional") ||
    operatorStatuses.includes("contextual_candidate") ||
    pairProofs.some(
      (proof) => proof.resolution?.status === "contextual_candidate",
    )
  ) {
    return "context_required";
  }
  if (
    authorityPath.builder_validation_required &&
    pairProofs.some(
      (proof) => proof.resolution?.status === "resolved_candidate",
    )
  ) {
    return "builder_validation_required";
  }
  if (capability.compiler.threejs === "declared") return "runtime_pending";
  return "ready_for_visual_proof";
}

function summaryForStatus(
  status: DirectorRealAssetExecutionStatus,
  authorityPath: DirectorCapabilityAssetAuthorityPath | null,
) {
  switch (status) {
    case "not_asset_gated":
      return "This capability has no Phase 1B.5D asset-qualification gate yet. The selected GLBs can still be used for visual generalization testing.";
    case "missing_required_asset":
      return "Load/select the required real asset roles before qualification can be evaluated.";
    case "asset_authoring_required":
      return "Trusted affordance evidence is missing. The bench fails closed rather than inventing semantic anatomy.";
    case "runtime_pending":
      return "The asset evidence is useful, but the relevant runtime execution lane is still explicitly pending.";
    case "fallback_only":
      return "The selected asset does not qualify for literal execution through this capability; only the declared fallback remains honest.";
    case "context_required":
      return "Asset-side evidence exists, but scene or counterpart context is still required before literal execution can be claimed.";
    case "builder_validation_required":
      return "The selected pair resolves to a strong candidate, but final fit/collision/stability remains Builder-owned before relationship activation.";
    case "ready_for_visual_proof":
    default:
      return authorityPath
        ? "Asset-side qualification is compatible with the existing shared runtime. Use the real-asset viewer to judge visible execution."
        : "Use the real-asset viewer to judge visible execution.";
  }
}

export function buildDirectorRealAssetExecutionQualification(
  capability: DirectorCapability,
  roles: readonly DirectorRealAssetRoleInput[],
): DirectorRealAssetExecutionQualificationReport {
  const authorityPath =
    directorCapabilityAssetAuthorityPath(capability.id);
  const primary = primaryRole(roles);
  const secondary = secondaryRole(roles);
  const usesPair = Boolean(authorityPath?.pair_interaction_ids.length);

  const source = primary;
  const target = usesPair
    ? secondary
    : authorityPath?.target_operator_ids.length
      ? primary
      : secondary;

  const operatorProofs: DirectorRealAssetOperatorProof[] = [];
  for (const operatorId of authorityPath?.asset_operator_ids ?? []) {
    operatorProofs.push(operatorProof("self", primary, operatorId));
  }
  for (const operatorId of authorityPath?.source_operator_ids ?? []) {
    operatorProofs.push(operatorProof("source", source, operatorId));
  }
  for (const operatorId of authorityPath?.target_operator_ids ?? []) {
    operatorProofs.push(operatorProof("target", target, operatorId));
  }

  const pairProofs: DirectorRealAssetPairProof[] = [];
  for (const interactionId of authorityPath?.pair_interaction_ids ?? []) {
    const sourceAsset = source?.asset ?? null;
    const targetAsset = target?.asset ?? null;
    pairProofs.push({
      source_role: source?.role ?? "primary_subject",
      target_role: target?.role ?? "secondary_subject",
      source_asset_id: sourceAsset?.asset_id ?? null,
      target_asset_id: targetAsset?.asset_id ?? null,
      resolution:
        sourceAsset && targetAsset
          ? resolveDirectableAssetPairInteraction(
              graphFor(sourceAsset),
              graphFor(targetAsset),
              interactionId,
              {
                source_dimensions_m: sceneDimensions(
                  sourceAsset,
                  source?.target_extent_m ?? 1.6,
                ),
                target_dimensions_m: sceneDimensions(
                  targetAsset,
                  target?.target_extent_m ?? 1.6,
                ),
                source_dimensions_authority: "scene_instance",
                target_dimensions_authority: "scene_instance",
              },
            )
          : null,
    });
  }

  const missingRoles = Array.from(
    new Set(
      [
        ...(authorityPath?.asset_operator_ids.length && !primary?.asset
          ? [primary?.role ?? "primary_subject"]
          : []),
        ...(authorityPath?.source_operator_ids.length && !source?.asset
          ? [source?.role ?? "primary_subject"]
          : []),
        ...(authorityPath?.target_operator_ids.length && !target?.asset
          ? [target?.role ?? (usesPair ? "secondary_subject" : "primary_subject")]
          : []),
        ...(usesPair && !source?.asset
          ? [source?.role ?? "primary_subject"]
          : []),
        ...(usesPair && !target?.asset
          ? [target?.role ?? "secondary_subject"]
          : []),
      ],
    ),
  );

  const executionStatus = statusFromProofs(
    capability,
    authorityPath,
    operatorProofs,
    pairProofs,
    missingRoles,
  );

  return {
    version: DIRECTOR_REAL_ASSET_EXECUTION_QUALIFICATION_VERSION,
    capability_id: capability.id,
    authority_path: authorityPath,
    source_role: source?.role ?? null,
    target_role: target?.role ?? null,
    operator_proofs: operatorProofs,
    pair_proofs: pairProofs,
    execution_status: executionStatus,
    runtime_support: capability.compiler.threejs,
    builder_validation_required:
      authorityPath?.builder_validation_required ?? false,
    selected_asset_ids: Array.from(
      new Set(
        roles
          .map((role) => role.asset?.asset_id ?? null)
          .filter((assetId): assetId is string => Boolean(assetId)),
      ),
    ),
    missing_roles: missingRoles,
    summary: summaryForStatus(executionStatus, authorityPath),
  };
}
