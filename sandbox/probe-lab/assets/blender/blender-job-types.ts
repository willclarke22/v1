import type { MyWayAssetGeometryProfileV1 } from "../asset-types";

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
  created_at: string;
  updated_at: string;
  result?: BlenderAssetResult | null;
  error?: string | null;
};

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

export type MyWayBlenderJob = BlenderNormalizeJob | BlenderKitAcquireJob;



