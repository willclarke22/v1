import type {
  MyWayAssetAppearanceRankingDiagnostics,
  MyWayAssetGeometryProfileV1,
  MyWayAssetSceneReviewStatus,
  MyWayAssetSourceType,
  Vec3,
} from "../assets/asset-types";
import type {
  LogicalAssetSizeDecision,
} from "../assets/logical-asset-size";
import type {
  PrimitiveBuilderPlacementRegionPreference,
  PrimitiveBuilderSurfaceReference,
} from "../primitive-builder/asset-requirement-plan";

import type {
  EducationalSceneDirectorPlanV1,
  EducationalSceneDirectorValidationReport,
} from "../director";

export type SceneAssetInstance = {
  instance_id: string;
  concept?: string;
  asset_id: string;
  public_path?: string;
  source_type?: MyWayAssetSourceType;
  scene_review_status?: MyWayAssetSceneReviewStatus;
  dimensions_m?: Vec3;
  default_scale?: number;
  default_rotation?: Vec3;
  ground_offset_m?: number;
  target_extent_m?: number;
  requested_target_extent_m?: number;
  size_policy?: LogicalAssetSizeDecision;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  motion?: Record<string, unknown> | null;
  layout_proxy_node_id?: string;
  parent_id?: string;
  layout_proxy_node_ids?: string[];

  // Compatibility fields accepted from older saved scenes.
  fallback_node_id?: string;
  replacement_node_ids?: string[];
  placement_relation?:
    | "absolute"
    | "on_ground"
    | "on_surface"
    | "beside"
    | "inside"
    | "attached_to";
  placement_target_instance_id?: string;
  placement_anchor?: string;
  placement_region?: PrimitiveBuilderPlacementRegionPreference;
  placement_source?: "explicit" | "inferred";
  placement_offset?: Vec3;
  placement_uv?: [number, number];
  primitive_support_surface?: PrimitiveBuilderSurfaceReference;
  layout_priority?: number;
  clearance_m?: number;
  geometry_profile?: MyWayAssetGeometryProfileV1 | null;
  preview_only?: boolean;
  match_score?: number | null;
  match_margin?: number | null;
  appearance_ranking?: MyWayAssetAppearanceRankingDiagnostics;
  appearance_similarity?: number | null;
  appearance_score?: number;
  appearance_summary?: string | null;
  appearance_trait_matches?: string[];
  appearance_trait_conflicts?: string[];
  visible_from_beat?: number | null;
};

export type MyWaySceneManifestV2 = {
  schema_version: "myway_scene_manifest_v2";
  scene_id: string;
  title: string;
  original_prompt: string;
  source: "primitive_builder" | "visual_experience";
  assets: SceneAssetInstance[];
  procedural_nodes: unknown[];
  /** Canonical teaching and choreography source of truth. */
  director_plan?: EducationalSceneDirectorPlanV1 | null;
  director_validation?: EducationalSceneDirectorValidationReport | null;
  /** Compatibility graph retained for layout proxies and refreshable asset resolution. */
  scene_graph?: unknown;
  primitive_plan?: unknown;
  asset_requirements?: unknown[];
  unresolved_requirements?: unknown[];
  camera: Record<string, unknown>;
  lights: Record<string, unknown>;
  timeline: unknown[];
  created_at: string;
  updated_at: string;
};

// Compatibility alias for older imports.
export type MyWaySceneManifestV1 =
  MyWaySceneManifestV2;
