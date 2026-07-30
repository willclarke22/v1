import type {
  AssetMatchScoreBreakdown,
  MyWayAssetAppearanceRankingDiagnostics,
  MyWayAssetGeometryProfileV1,
  MyWayAssetRecord,
  MyWayAssetSceneReviewStatus,
  MyWayAssetSourceType,
  Vec3,
} from "../assets/asset-types";
import type {
  LogicalAssetSizeDecision,
} from "../assets/logical-asset-size";
import type {
  PrimitiveBuilderAssetRequirement,
  PrimitiveBuilderPlacementRelation,
  PrimitiveBuilderPlacementRegionPreference,
  PrimitiveBuilderSurfaceReference,
} from "../primitive-builder/asset-requirement-plan";

import type {
  EducationalSceneDirectorPlanV1,
  EducationalSceneDirectorValidationReport,
} from "../director";
import type {
  ResolvedSceneResourcesV1,
  SceneResourcePlanV1,
  SceneResourcePlanValidationReport,
} from "../scene-resources";

export type ResolvedSceneAssetBinding = {
  instance_id: string;
  concept: string;
  asset_id: string;
  public_path: string;
  source_type: MyWayAssetSourceType;
  scene_review_status: MyWayAssetSceneReviewStatus;
  dimensions_m: Vec3;
  default_scale: number;
  default_rotation: Vec3;
  ground_offset_m: number;
  target_extent_m: number;
  requested_target_extent_m?: number;
  size_policy?: LogicalAssetSizeDecision;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  motion?: Record<string, unknown> | null;
  layout_proxy_node_id?: string;
  parent_id?: string;
  layout_proxy_node_ids: string[];

  // Compatibility fields for loading older scene manifests.
  fallback_node_id?: string;
  replacement_node_ids?: string[];
  placement_relation: PrimitiveBuilderPlacementRelation;
  placement_target_instance_id?: string;
  placement_anchor: string;
  placement_region: PrimitiveBuilderPlacementRegionPreference;
  placement_source: "explicit" | "inferred";
  placement_offset: Vec3;
  placement_uv: [number, number];
  primitive_support_surface?: PrimitiveBuilderSurfaceReference;
  layout_priority: number;
  clearance_m: number;
  geometry_profile?: MyWayAssetGeometryProfileV1 | null;
  preview_only: boolean;
  match_score?: number | null;
  match_margin?: number | null;
  candidate_scores?: AssetMatchScoreBreakdown[];
  appearance_ranking?: MyWayAssetAppearanceRankingDiagnostics;
  appearance_similarity?: number | null;
  appearance_score?: number;
  appearance_summary?: string | null;
  appearance_trait_matches?: string[];
  appearance_trait_conflicts?: string[];
};

export type PrimitiveBuilderUnresolvedAssetDiagnostic = {
  instance_id: string;
  concept: string;
  reason: string;
  warnings: string[];
  candidate_scores: AssetMatchScoreBreakdown[];
  appearance_ranking?: MyWayAssetAppearanceRankingDiagnostics;
};

export type PrimitiveBuilderSceneAssetResolution = {
  schema_version: "primitive_builder_scene_asset_resolution_v2";
  director_plan?: EducationalSceneDirectorPlanV1;
  director_validation?: EducationalSceneDirectorValidationReport;
  resource_plan?: SceneResourcePlanV1;
  resource_plan_validation?: SceneResourcePlanValidationReport;
  resolved_resources?: ResolvedSceneResourcesV1;
  bindings: ResolvedSceneAssetBinding[];
  unresolved_requirements: PrimitiveBuilderAssetRequirement[];
  unresolved_diagnostics?: PrimitiveBuilderUnresolvedAssetDiagnostic[];
  warnings: string[];
};

export function makeResolvedSceneAssetBinding(input: {
  requirement: PrimitiveBuilderAssetRequirement;
  asset: MyWayAssetRecord;
  motion?: Record<string, unknown> | null;
  previewOnly?: boolean;
  matchScore?: number | null;
  matchMargin?: number | null;
  candidateScores?: AssetMatchScoreBreakdown[];
  appearanceRanking?: MyWayAssetAppearanceRankingDiagnostics;
  selectedScore?: AssetMatchScoreBreakdown;
  sizeDecision?: LogicalAssetSizeDecision;
}): ResolvedSceneAssetBinding {
  const { requirement, asset } = input;

  return {
    instance_id: requirement.instance_id,
    concept: requirement.concept,
    asset_id: asset.asset_id,
    public_path: asset.public_path,
    source_type: asset.source_type,
    scene_review_status:
      asset.scene_review_status ?? "pending",
    dimensions_m: asset.dimensions_m,
    default_scale: asset.default_scale,
    default_rotation: asset.default_rotation,
    ground_offset_m: asset.ground_offset_m,
    target_extent_m: requirement.target_extent_m,
    requested_target_extent_m:
      input.sizeDecision?.requested_target_extent_m ??
      requirement.target_extent_m,
    size_policy: input.sizeDecision,
    position: requirement.position,
    rotation: requirement.rotation,
    scale: requirement.scale,
    motion: input.motion ?? null,
    layout_proxy_node_id:
      requirement.layout_proxy_node_id,
    parent_id: requirement.parent_id,
    layout_proxy_node_ids:
      requirement.layout_proxy_node_ids,
    placement_relation:
      requirement.placement_relation,
    placement_target_instance_id:
      requirement.placement_target_instance_id,
    placement_anchor:
      requirement.placement_anchor,
    placement_region:
      requirement.placement_region,
    placement_source:
      requirement.placement_source,
    placement_offset:
      requirement.placement_offset,
    placement_uv:
      requirement.placement_uv,
    primitive_support_surface:
      requirement.primitive_support_surface,
    layout_priority:
      requirement.layout_priority,
    clearance_m: requirement.clearance_m,
    geometry_profile:
      asset.geometry_profile ?? null,
    preview_only: input.previewOnly === true,
    match_score: input.matchScore ?? null,
    match_margin: input.matchMargin ?? null,
    candidate_scores:
      input.candidateScores ?? [],
    appearance_ranking:
      input.appearanceRanking,
    appearance_similarity:
      input.selectedScore
        ?.appearance_similarity ?? null,
    appearance_score:
      (input.selectedScore
        ?.appearance_similarity_bonus ?? 0) +
      (input.selectedScore
        ?.appearance_trait_bonus ?? 0) -
      (input.selectedScore
        ?.appearance_penalty ?? 0),
    appearance_summary:
      input.selectedScore
        ?.appearance_summary ?? null,
    appearance_trait_matches: [
      ...(input.selectedScore
        ?.required_trait_matches ?? []),
      ...(input.selectedScore
        ?.preferred_trait_matches ?? []),
    ],
    appearance_trait_conflicts:
      input.selectedScore
        ?.required_trait_conflicts ?? [],
  };
}
