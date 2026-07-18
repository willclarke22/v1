import type {
  AssetMatchScoreBreakdown,
  MyWayAssetRecord,
  MyWayAssetSceneReviewStatus,
  MyWayAssetSourceType,
  Vec3,
} from "../assets/asset-types";
import type {
  PrimitiveBuilderAssetRequirement,
  PrimitiveBuilderPlacementRelation,
} from "../primitive-builder/asset-requirement-plan";

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
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  motion?: Record<string, unknown> | null;
  fallback_node_id?: string;
  parent_id?: string;
  replacement_node_ids: string[];
  placement_relation: PrimitiveBuilderPlacementRelation;
  placement_target_instance_id?: string;
  placement_anchor: string;
  placement_offset: Vec3;
  clearance_m: number;
  preview_only: boolean;
  match_score?: number | null;
  match_margin?: number | null;
  candidate_scores?: AssetMatchScoreBreakdown[];
};

export type PrimitiveBuilderSceneAssetResolution = {
  schema_version: "primitive_builder_scene_asset_resolution_v2";
  bindings: ResolvedSceneAssetBinding[];
  unresolved_requirements: PrimitiveBuilderAssetRequirement[];
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
    position: requirement.position,
    rotation: requirement.rotation,
    scale: requirement.scale,
    motion: input.motion ?? null,
    fallback_node_id: requirement.fallback_node_id,
    parent_id: requirement.parent_id,
    replacement_node_ids:
      requirement.replacement_node_ids,
    placement_relation:
      requirement.placement_relation,
    placement_target_instance_id:
      requirement.placement_target_instance_id,
    placement_anchor:
      requirement.placement_anchor,
    placement_offset:
      requirement.placement_offset,
    clearance_m: requirement.clearance_m,
    preview_only: input.previewOnly === true,
    match_score: input.matchScore ?? null,
    match_margin: input.matchMargin ?? null,
    candidate_scores:
      input.candidateScores ?? [],
  };
}
