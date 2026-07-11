export type SceneAssetInstance = {
  instance_id: string;
  asset_id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  motion?: Record<string, unknown> | null;
  visible_from_beat?: number | null;
};

export type MyWaySceneManifestV1 = {
  schema_version: "myway_scene_manifest_v1";
  scene_id: string;
  title: string;
  original_prompt: string;
  assets: SceneAssetInstance[];
  procedural_nodes: unknown[];
  camera: Record<string, unknown>;
  lights: Record<string, unknown>;
  timeline: unknown[];
  created_at: string;
  updated_at: string;
};
