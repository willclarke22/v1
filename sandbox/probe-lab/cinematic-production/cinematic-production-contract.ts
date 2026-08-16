export const CINEMATIC_PRODUCTION_SCHEMA_VERSION = "myway_cinematic_production_cp1a_v1" as const;

export type CinematicShotStatus =
  | "benchmark_defined"
  | "storyboard_ready"
  | "animatic_ready"
  | "production_blocked"
  | "production_ready";

export type CinematicExecutionLane =
  | "browser_rigid_runtime"
  | "prepared_controller"
  | "skeletal_animation"
  | "blender_procedural"
  | "blender_simulation"
  | "composited_graphics";

export type CinematicAssetRole = "hero" | "supporting" | "background";

export type CinematicCastSlot = {
  id: string;
  label: string;
  concept: string;
  search_terms: string[];
  preferred_asset_id?: string;
  required: boolean;
  notes?: string;
};

export type CinematicShotAssetRequirement = {
  id: string;
  concept: string;
  role: CinematicAssetRole;
  required_capabilities: string[];
  notes?: string;
};

export type CinematicShot = {
  id: string;
  order: number;
  title: string;
  purpose: string;
  teaching_point: string;
  duration_s: number;
  camera_label: string;
  camera_detail: string;
  action_label: string;
  action_detail: string;
  execution_lane: CinematicExecutionLane;
  status: CinematicShotStatus;
  hero_concept: string;
  asset_requirements: CinematicShotAssetRequirement[];
  visible_gaps: string[];
};

export type CinematicProductionBenchmark = {
  schema_version: typeof CINEMATIC_PRODUCTION_SCHEMA_VERSION;
  id: string;
  title: string;
  subtitle: string;
  north_star: string;
  source_note: string;
  duration_target_s: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  production_brief: string;
  visual_language: string[];
  cast_slots: CinematicCastSlot[];
  shots: CinematicShot[];
};
