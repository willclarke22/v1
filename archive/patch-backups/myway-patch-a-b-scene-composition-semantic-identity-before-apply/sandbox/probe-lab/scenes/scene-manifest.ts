import type {
  MyWayAssetSceneReviewStatus,
  MyWayAssetSourceType,
  Vec3,
} from "../assets/asset-types";

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
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  motion?: Record<string, unknown> | null;
  fallback_node_id?: string;
  parent_id?: string;
  preview_only?: boolean;
  match_score?: number | null;
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
