import { logicalAssetSizeDecision } from "../assets/logical-asset-size";
import type { MyWayAssetRecord } from "../assets/asset-types";
import type {
  DirectorQualificationCastSlot,
  DirectorQualificationCastSlotId,
} from "./director-qualification-cast";
import type { DirectorQualificationScene } from "./director-qualification-scenes";

export const DIRECTOR_QUALIFICATION_NORMALIZATION_VERSION =
  "director_qualification_normalization_phase1b7a1_v1" as const;

export type DirectorQualificationNormalizationPolicy =
  | "presentation_normalized"
  | "physical_context";

export type DirectorQualificationRoleKind = "primary" | "secondary" | "context";

export type DirectorQualificationAssetNormalization = {
  normalization_version: typeof DIRECTOR_QUALIFICATION_NORMALIZATION_VERSION;
  cast_slot_id: DirectorQualificationCastSlotId;
  policy: DirectorQualificationNormalizationPolicy;
  role_kind: DirectorQualificationRoleKind;
  source_dimensions_m: [number, number, number];
  source_largest_extent_m: number;
  logical_extent_m: number;
  logical_extent_source: string;
  requested_target_extent_m: number;
  target_extent_m: number;
  render_scale_multiplier: number;
  metadata_warning: string | null;
  reason: string;
};

function finitePositive(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function dimensions(asset: MyWayAssetRecord): [number, number, number] {
  const input = asset.dimensions_m ?? [1, 1, 1];
  return [
    finitePositive(Math.abs(Number(input[0])), 1),
    finitePositive(Math.abs(Number(input[1])), 1),
    finitePositive(Math.abs(Number(input[2])), 1),
  ];
}

function roleMultiplier(
  scene: DirectorQualificationScene,
  roleKind: DirectorQualificationRoleKind,
) {
  return scene.normalization.presentation_role_multipliers[roleKind];
}

export function normalizeAssetForDirectorQualification(input: {
  asset: MyWayAssetRecord;
  slot: DirectorQualificationCastSlot;
  scene: DirectorQualificationScene;
  role_kind: DirectorQualificationRoleKind;
  policy: DirectorQualificationNormalizationPolicy;
}): DirectorQualificationAssetNormalization {
  const sourceDimensions = dimensions(input.asset);
  const sourceLargest = Math.max(...sourceDimensions);
  const concept =
    input.asset.verified_canonical_label?.trim() ||
    input.asset.canonical_label?.trim() ||
    input.asset.display_name?.trim() ||
    input.slot.label;

  const logical = logicalAssetSizeDecision({
    concept,
    aliases: [
      ...(input.asset.verified_aliases ?? []),
      ...(input.asset.aliases ?? []),
      ...input.slot.concepts,
    ],
    semanticTags: input.asset.semantic_tags ?? [],
    requestedTargetExtentM: input.slot.physical_reference_extent_m,
  });

  const presentationTarget =
    input.slot.presentation_extent_m * roleMultiplier(input.scene, input.role_kind);
  const requested =
    input.policy === "presentation_normalized"
      ? presentationTarget
      : logical.target_extent_m;

  let target = clamp(
    requested,
    input.scene.normalization.physical_min_extent_m,
    input.scene.normalization.physical_max_extent_m,
  );

  // The shared Director preview normally protects against pathological model scales.
  // Qualification widens that safe range, but the manifest still records when the
  // source metadata would require an extreme correction so a reviewer does not blame
  // the capability for bad source normalization.
  const minimumRenderable = sourceLargest * 0.02;
  const maximumRenderable = sourceLargest * 40;
  target = clamp(target, minimumRenderable, maximumRenderable);
  const renderScale = target / Math.max(0.0001, sourceLargest);

  const metadataWarning =
    renderScale > 12 || renderScale < 1 / 12
      ? `Source bounds require a ${renderScale.toFixed(2)}× qualification scale correction.`
      : null;

  const reason =
    input.policy === "presentation_normalized"
      ? `Fair-display normalization uses the ${input.slot.label} presentation target (${input.slot.presentation_extent_m.toFixed(2)} m) with the ${input.scene.short_label} ${input.role_kind} multiplier. Logical real-world reference: ${logical.target_extent_m.toFixed(2)} m (${logical.source}).`
      : `Physical-context normalization uses MyWay logical sizing: ${logical.target_extent_m.toFixed(2)} m (${logical.source}), bounded only by the ${input.scene.short_label} qualification stage.`;

  return {
    normalization_version: DIRECTOR_QUALIFICATION_NORMALIZATION_VERSION,
    cast_slot_id: input.slot.id,
    policy: input.policy,
    role_kind: input.role_kind,
    source_dimensions_m: sourceDimensions,
    source_largest_extent_m: Math.round(sourceLargest * 1000) / 1000,
    logical_extent_m: logical.target_extent_m,
    logical_extent_source: logical.source,
    requested_target_extent_m: Math.round(requested * 1000) / 1000,
    target_extent_m: Math.round(target * 1000) / 1000,
    render_scale_multiplier: Math.round(renderScale * 1000) / 1000,
    metadata_warning: metadataWarning,
    reason,
  };
}

export function defaultQualificationNormalizationPolicy(input: {
  category: string;
  group: string;
}): DirectorQualificationNormalizationPolicy {
  // Screen/depth placement is primarily a perceptual-composition test. Baseline
  // and cross-asset passes therefore normalize actors to comparable display
  // extents so a tiny physical prop cannot create a false capability failure.
  // Full-cast qualification still appends a physical_stress pass, and the Room
  // forces that pass back to physical_context before rendering.
  if (
    input.category === "blocking_placement" &&
    input.group === "Depth & screen placement"
  ) {
    return "presentation_normalized";
  }

  if (input.category === "object_motion" || input.category === "blocking_placement") {
    return "physical_context";
  }
  return "presentation_normalized";
}

