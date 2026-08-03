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

export type AmbientCgAssetType =
  (typeof AMBIENTCG_ASSET_TYPES)[number];

export type AmbientCgResourceAssetType = Exclude<
  AmbientCgAssetType,
  "material" | "hdri" | "3d-model"
>;

export type AmbientCgDownloadVariant = {
  variant_id: string;
  label: string;
  resolution: string | null;
  file_format: string | null;
  archive_format: string | null;
  url: string;
  size_bytes: number | null;
  attributes: Record<
    string,
    string | number | boolean | null
  >;
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
  catalog_status:
    | "cataloged"
    | "cached"
    | "published"
    | "failed";
  cached_resource_id: string | null;
  source_record: Record<string, unknown>;
  cataloged_at: string;
  updated_at: string;
  appearance_profile?:
    AmbientCgMaterialAppearanceProfile | null;
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
  status:
    | "idle"
    | "running"
    | "complete"
    | "failed";
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


export type AmbientCgMaterialBrightness =
  | "dark"
  | "medium"
  | "light";

export type AmbientCgMaterialAppearanceProfile = {
  schema_version:
    "myway_ambientcg_material_appearance_v1";
  source_asset_id: string;
  status:
    | "pending"
    | "analyzing"
    | "ready"
    | "failed";
  summary: string | null;
  dominant_colors: string[];
  brightness:
    AmbientCgMaterialBrightness | null;
  confidence: number;
  warnings: string[];
  preview_url: string | null;
  model: string | null;
  prompt_version: string;
  analyzed_at: string | null;
  error: string | null;
};

export type AmbientCgMaterialAppearanceRegistry = {
  schema_version:
    "myway_ambientcg_material_appearance_registry_v1";
  updated_at: string | null;
  profiles:
    AmbientCgMaterialAppearanceProfile[];
};

export type AmbientCgCloudStorage = {
  provider: "local" | "r2";
  runtime_prefix: string;
  manifest_url: string | null;
  manifest_object_key: string | null;
  thumbnail_object_key: string | null;
  source_metadata_object_key: string | null;
  license_object_key: string | null;
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
  available_variants?: AmbientCgDownloadVariant[];
  public_root: string;
  thumbnail_url: string | null;
  preview_url?: string | null;
  maps: AmbientCgMaterialMaps;
  map_object_keys?: Partial<
    Record<keyof AmbientCgMaterialMaps, string>
  >;
  physical_dimensions: unknown;
  semantic_tags: string[];
  content_sha256: string;
  cached_at: string;
  published_to_r2: boolean;
  storage_provider?: "local" | "r2";
  storage?: AmbientCgCloudStorage;
  appearance_profile?:
    AmbientCgMaterialAppearanceProfile | null;
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
  available_variants?: AmbientCgDownloadVariant[];
  environment_url: string;
  environment_object_key?: string | null;
  thumbnail_url: string | null;
  preview_url?: string | null;
  semantic_tags: string[];
  content_sha256: string;
  cached_at: string;
  published_to_r2: boolean;
  storage_provider?: "local" | "r2";
  storage?: AmbientCgCloudStorage;
};

export type AmbientCgCachedResourceFile = {
  name: string;
  role: string | null;
  public_url: string;
  object_key: string | null;
  size_bytes: number;
  content_type: string;
};

export type AmbientCgCachedResource = {
  resource_id: string;
  source_asset_id: string;
  source_type: "ambientcg";
  asset_type: AmbientCgResourceAssetType;
  display_name: string;
  source_url: string;
  license: "CC0-1.0";
  attribution_required: false;
  commercial_use_allowed: true;
  raw_distribution_allowed: true;
  resolution: string | null;
  file_format: string | null;
  variant_id: string;
  available_variants: AmbientCgDownloadVariant[];
  public_root: string;
  primary_url: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  files: AmbientCgCachedResourceFile[];
  semantic_tags: string[];
  dimensions: unknown;
  content_sha256: string;
  cached_at: string;
  published_to_r2: boolean;
  storage_provider: "local" | "r2";
  storage: AmbientCgCloudStorage;
};

export type AmbientCgMaterialRegistry = {
  schema_version:
    "myway_ambientcg_material_registry_v1";
  updated_at: string | null;
  materials: AmbientCgCachedMaterial[];
};

export type AmbientCgHdriRegistry = {
  schema_version:
    "myway_ambientcg_hdri_registry_v1";
  updated_at: string | null;
  hdris: AmbientCgCachedHdri[];
};

export type AmbientCgResourceRegistry = {
  schema_version:
    "myway_ambientcg_resource_registry_v1";
  updated_at: string | null;
  resources: AmbientCgCachedResource[];
};

export type AmbientCgDownloadJob = {
  job_id: string;
  source_asset_id: string;
  asset_type: AmbientCgAssetType | "unknown";
  variant_id: string;
  operation?:
    | "cache"
    | "replace_variant"
    | "import_model";
  status:
    | "queued"
    | "running"
    | "complete"
    | "failed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  downloaded_bytes: number | null;
  content_sha256: string | null;
  resource_id: string | null;
  storage_provider?: "local" | "r2" | null;
  error: string | null;
};

export type AmbientCgDownloadJobRegistry = {
  schema_version:
    "myway_ambientcg_download_jobs_v1";
  updated_at: string | null;
  jobs: AmbientCgDownloadJob[];
};

export type AmbientCgStorageStatus = {
  cloud_enabled: boolean;
  local_mirror_enabled: boolean;
  runtime_bucket_configured: boolean;
  source_bucket_configured: boolean;
  public_base_url_configured: boolean;
  catalog_location: "r2" | "local";
  cached_asset_destination: "r2" | "local";
};

export type AssetCloudMigrationState = {
  schema_version:
    "myway_asset_cloud_migration_v1";
  updated_at: string | null;
  completed_asset_ids: string[];
  failures: Array<{
    asset_id: string;
    error: string;
    attempted_at: string;
  }>;
  last_batch: {
    attempted: number;
    promoted: number;
    skipped: number;
    failed: number;
  } | null;
};
