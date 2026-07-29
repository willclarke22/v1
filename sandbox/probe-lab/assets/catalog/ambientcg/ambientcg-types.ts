
export const AMBIENTCG_ASSET_TYPES = [
  "material",
  "hdri",
  "substance",
  "decal",
  "atlas",
  "3d-model",
  "plain-image",
  "brush",
  "terrain",
  "hdri-element",
] as const;

export type AmbientCgAssetType = (typeof AMBIENTCG_ASSET_TYPES)[number];

export type AmbientCgDownloadVariant = {
  variant_id: string;
  label: string;
  resolution: string | null;
  file_format: string | null;
  archive_format: string | null;
  url: string;
  size_bytes: number | null;
  attributes: Record<string, string | number | boolean | null>;
};

export type AmbientCgCatalogAsset = {
  asset_id: string;
  source_asset_id: string;
  source_type: "ambientcg";
  asset_type: AmbientCgAssetType | "unknown";
  display_name: string;
  source_url: string;
  release_date: string | null;
  short_description: string | null;
  long_description: string | null;
  semantic_tags: string[];
  colors: string[];
  dimensions: unknown;
  maps: string[];
  technique: string | null;
  collections: string[];
  download_statistics: unknown;
  download_variants: AmbientCgDownloadVariant[];
  preview_urls: string[];
  thumbnail_urls: string[];
  catalog_status: "cataloged" | "cached" | "published" | "failed";
  cached_resource_id: string | null;
  source_record: Record<string, unknown>;
  cataloged_at: string;
  updated_at: string;
};

export type AmbientCgCatalogDocument = {
  schema_version: "myway_ambientcg_catalog_v1";
  source: "ambientcg_api_v3";
  updated_at: string | null;
  total_results: number;
  assets: AmbientCgCatalogAsset[];
};

export type AmbientCgSyncState = {
  schema_version: "myway_ambientcg_sync_state_v1";
  status: "idle" | "running" | "complete" | "failed";
  run_id: string | null;
  last_started_at: string | null;
  last_completed_at: string | null;
  next_offset: number;
  page_limit: number;
  total_results: number | null;
  records_seen: number;
  records_written: number;
  last_error: string | null;
};

export type AmbientCgMaterialMaps = {
  base_color: string | null;
  normal_gl: string | null;
  normal_dx: string | null;
  roughness: string | null;
  metallic: string | null;
  ambient_occlusion: string | null;
  height: string | null;
  opacity: string | null;
  emission: string | null;
};

export type AmbientCgCachedMaterial = {
  resource_id: string;
  source_asset_id: string;
  source_type: "ambientcg";
  asset_type: "material";
  display_name: string;
  source_url: string;
  license: "CC0-1.0";
  attribution_required: false;
  commercial_use_allowed: true;
  raw_distribution_allowed: true;
  resolution: string | null;
  file_format: string | null;
  variant_id: string;
  public_root: string;
  thumbnail_url: string | null;
  maps: AmbientCgMaterialMaps;
  physical_dimensions: unknown;
  semantic_tags: string[];
  content_sha256: string;
  cached_at: string;
  published_to_r2: boolean;
};

export type AmbientCgCachedHdri = {
  resource_id: string;
  source_asset_id: string;
  source_type: "ambientcg";
  asset_type: "hdri";
  display_name: string;
  source_url: string;
  license: "CC0-1.0";
  attribution_required: false;
  commercial_use_allowed: true;
  raw_distribution_allowed: true;
  resolution: string | null;
  file_format: string | null;
  variant_id: string;
  environment_url: string;
  thumbnail_url: string | null;
  semantic_tags: string[];
  content_sha256: string;
  cached_at: string;
  published_to_r2: boolean;
};

export type AmbientCgMaterialRegistry = {
  schema_version: "myway_ambientcg_material_registry_v1";
  updated_at: string | null;
  materials: AmbientCgCachedMaterial[];
};

export type AmbientCgHdriRegistry = {
  schema_version: "myway_ambientcg_hdri_registry_v1";
  updated_at: string | null;
  hdris: AmbientCgCachedHdri[];
};

export type AmbientCgDownloadJob = {
  job_id: string;
  source_asset_id: string;
  asset_type: "material" | "hdri";
  variant_id: string;
  status: "queued" | "running" | "complete" | "failed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  downloaded_bytes: number | null;
  content_sha256: string | null;
  resource_id: string | null;
  error: string | null;
};

export type AmbientCgDownloadJobRegistry = {
  schema_version: "myway_ambientcg_download_jobs_v1";
  updated_at: string | null;
  jobs: AmbientCgDownloadJob[];
};
