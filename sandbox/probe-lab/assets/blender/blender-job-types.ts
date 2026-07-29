import type {
  MyWayAssetAppearanceViewName,
  MyWayAssetGeometryProfileV1,
} from "../asset-types";

export type BlenderAssetResult = {
  output_path: string;
  thumbnail_path: string;
  dimensions_m: [number, number, number];
  polygon_count: number;
  rigged: boolean;
  animation_clips: string[];
  geometry_profile?: MyWayAssetGeometryProfileV1 | null;
  source_asset_id?: string | null;
  source_asset_name?: string | null;
  source_url?: string | null;
  source_license?: string | null;
  source_author?: string | null;
  source_record?: Record<string, unknown> | null;
};


export type BlenderGeometryProfileResult = {
  dimensions_m: [number, number, number];
  geometry_profile: MyWayAssetGeometryProfileV1;
};

export type BlenderGeometryProfileJob = {
  schema_version: "myway_blender_job_v1";
  job_id: string;
  kind: "profile_asset_geometry";
  status: "pending" | "running" | "completed" | "failed";
  input_path: string;
  created_at: string;
  updated_at: string;
  result?: BlenderGeometryProfileResult | null;
  error?: string | null;
};
export type BlenderAnalysisRenderResult = {
  dimensions_m: [number, number, number];
  analysis_views: Array<{
    name: MyWayAssetAppearanceViewName;
    file_path: string;
    public_path: string;
  }>;
};

export type BlenderNormalizeJob = {
  schema_version: "myway_blender_job_v1";
  job_id: string;
  kind: "normalize_asset";
  status: "pending" | "running" | "completed" | "failed";
  input_path: string;
  output_path: string;
  thumbnail_path: string;
  target_extent_m: number;
  source_type: "trellis" | "manual";
  created_at: string;
  updated_at: string;
  result?: BlenderAssetResult | null;
  error?: string | null;
};

export type BlenderKitAcquireJob = {
  schema_version: "myway_blender_job_v1";
  job_id: string;
  kind: "blenderkit_acquire";
  status: "pending" | "running" | "completed" | "failed";
  query: string;
  output_path: string;
  thumbnail_path: string;
  target_extent_m: number;
  resolution: "blend" | "resolution_0_5K" | "resolution_1K" | "resolution_2K";
  free_only: boolean;
  required_license_kind?: "cc0" | null;
  excluded_source_asset_ids?: string[];
  selected_source_asset_id?: string | null;
  created_at: string;
  updated_at: string;
  result?: BlenderAssetResult | null;
  error?: string | null;
};

export type BlenderAnalysisRenderJob = {
  schema_version: "myway_blender_job_v1";
  job_id: string;
  kind: "render_asset_analysis";
  status: "pending" | "running" | "completed" | "failed";
  input_path: string;
  render_directory: string;
  public_url_root: string;
  target_extent_m: number;
  created_at: string;
  updated_at: string;
  result?: BlenderAnalysisRenderResult | null;
  error?: string | null;
};

export type MyWayBlenderJob =
  | BlenderGeometryProfileJob
  | BlenderNormalizeJob
  | BlenderKitAcquireJob
  | BlenderAnalysisRenderJob;
