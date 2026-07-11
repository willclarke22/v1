export type MyWayAssetSourceType = "blenderkit" | "trellis" | "manual" | "procedural";
export type MyWayAssetStatus = "inbox" | "normalized" | "approved" | "rejected";
export type MyWayAssetLicenseKind = "cc0" | "royalty_free" | "self_owned" | "unknown";
export type MyWayAssetLicenseStatus = "recorded" | "needs_review" | "sandbox_only" | "app_ready";
export type Vec3 = [number, number, number];

export type MyWayAssetRecord = {
  asset_id: string;
  canonical_label: string;
  display_name: string;
  aliases: string[];
  semantic_tags: string[];
  style_tags: string[];
  asset_type: "glb" | "gltf" | "primitive";
  domain: string;

  source_type: MyWayAssetSourceType;
  source_asset_id?: string | null;
  source_prompt?: string | null;
  source_url?: string | null;
  source_path?: string | null;

  public_path: string;
  thumbnail_path?: string | null;
  license_record_path?: string | null;

  dimensions_m: Vec3;
  default_scale: number;
  default_rotation: Vec3;
  ground_offset_m: number;
  polygon_count?: number | null;
  rigged: boolean;
  animation_clips: string[];

  content_hash?: string | null;
  quality_score: number;
  reuse_count: number;

  license_kind: MyWayAssetLicenseKind;
  license_status: MyWayAssetLicenseStatus;
  commercial_use_allowed: boolean;
  raw_redistribution_allowed: boolean;
  safe_to_use_in_sandbox: boolean;
  safe_to_promote_to_app: boolean;
  status: MyWayAssetStatus;

  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type MyWayAssetRegistryV1 = {
  schema_version: "myway_asset_registry_v1";
  updated_at: string;
  asset_root_public_url: "/sandbox-assets/myway";
  notes?: string | null;
  assets: MyWayAssetRecord[];
};

export type AssetResolveRequest = {
  concept: string;
  aliases?: string[];
  semantic_tags?: string[];
  style_tags?: string[];
  domain?: string;
  target_extent_m?: number;
  allow_blenderkit?: boolean;
  allow_trellis?: boolean;
  allow_primitive_fallback?: boolean;
  force_refresh?: boolean;
};

export type AssetResolveResult = {
  ok: boolean;
  source: "library" | "blenderkit" | "trellis" | "primitive" | "none";
  asset: MyWayAssetRecord | null;
  warnings: string[];
  attempts: Array<{ source: string; ok: boolean; error?: string }>;
};
