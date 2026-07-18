export type MyWayAssetSourceType =
  | "blenderkit"
  | "trellis"
  | "manual"
  | "procedural";

export type MyWayAssetStatus =
  | "inbox"
  | "normalized"
  | "approved"
  | "rejected";

export type MyWayAssetSceneReviewStatus =
  | "pending"
  | "approved"
  | "rejected";

export type MyWayAssetSemanticReviewStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "rejected";

export type MyWayAssetObjectComposition =
  | "single_object"
  | "object_set"
  | "environment_piece"
  | "unknown";

export type MyWayAssetLicenseKind =
  | "cc0"
  | "royalty_free"
  | "self_owned"
  | "unknown";

export type MyWayAssetLicenseStatus =
  | "recorded"
  | "needs_review"
  | "sandbox_only"
  | "app_ready";

export type MyWayAssetStorageProvider =
  | "local"
  | "r2";

export type Vec3 = [number, number, number];

export type MyWayAssetGeometryProfileSource =
  | "blender_geometry"
  | "runtime_geometry"
  | "manual"
  | "legacy_ratio";

export type MyWayAssetBounds = {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
};

export type MyWayAssetContactRegion = {
  id: string;
  center: Vec3;
  normal: Vec3;
  size: [number, number];
  area: number;
  confidence: number;
};

export type MyWayAssetSupportSurface = {
  id: string;
  label: string;
  center: Vec3;
  normal: Vec3;
  u_axis: Vec3;
  v_axis: Vec3;
  size: [number, number];
  area: number;
  confidence: number;
  source: MyWayAssetGeometryProfileSource;

  // Legacy ratio fields remain optional so old registry records can be read
  // without pretending that a guessed whole-object top is real geometry.
  height_ratio?: number;
  footprint_ratio?: [number, number];
};

export type MyWayAssetCollisionBox = {
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
};

export type MyWayAssetInteriorVolume = {
  id: string;
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
  confidence: number;
};

export type MyWayAssetGeometryProfileV1 = {
  schema_version: "myway_asset_geometry_profile_v1";
  coordinate_space: "normalized_glb_y_up";
  local_bounds: MyWayAssetBounds;
  orientation: {
    up_axis: Vec3;
    forward_axis: Vec3;
  };
  bottom_contact_region: MyWayAssetContactRegion;
  support_surfaces: MyWayAssetSupportSurface[];
  interior_volumes: MyWayAssetInteriorVolume[];
  collision_boxes: MyWayAssetCollisionBox[];
  generated_at: string;
  generator: string;
};

export type MyWayAssetRecord = {
  asset_id: string;

  // Stable technical identity. asset_id and storage paths never need to be
  // renamed when the human-readable identity is corrected.
  canonical_label: string;
  display_name: string;
  aliases: string[];
  semantic_tags: string[];
  style_tags: string[];
  asset_type: "glb" | "gltf" | "primitive";
  domain: string;

  // Search provenance is intentionally separate from verified identity.
  requested_concept?: string | null;
  source_display_name?: string | null;
  verified_canonical_label?: string | null;
  verified_aliases?: string[];
  semantic_review_status?: MyWayAssetSemanticReviewStatus;
  semantic_reviewed_at?: string | null;
  semantic_review_notes?: string | null;
  object_composition?: MyWayAssetObjectComposition;
  contains?: string[];
  affordances?: string[];
  support_surfaces?: MyWayAssetSupportSurface[];
  geometry_profile?: MyWayAssetGeometryProfileV1 | null;
  preferred_for_concepts?: string[];

  source_type: MyWayAssetSourceType;
  source_asset_id?: string | null;
  source_prompt?: string | null;
  source_url?: string | null;
  source_path?: string | null;

  public_path: string;
  thumbnail_path?: string | null;
  license_record_path?: string | null;

  storage_provider?: MyWayAssetStorageProvider;
  storage_object_key?: string | null;
  storage_etag?: string | null;
  file_size_bytes?: number | null;

  thumbnail_storage_provider?: MyWayAssetStorageProvider | null;
  thumbnail_object_key?: string | null;
  thumbnail_etag?: string | null;
  thumbnail_file_size_bytes?: number | null;

  source_storage_provider?: MyWayAssetStorageProvider | null;
  source_object_key?: string | null;
  source_storage_etag?: string | null;
  source_file_size_bytes?: number | null;
  source_archived_at?: string | null;

  promoted_at?: string | null;
  license_review_id?: string | null;

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

  // Separate from licensing and ingestion status. This is the explicit human
  // gate for whether automatic scene composition may select this asset.
  scene_review_status?: MyWayAssetSceneReviewStatus;
  scene_reviewed_at?: string | null;
  scene_review_notes?: string | null;

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

export type AssetMatchScoreBreakdown = {
  asset_id: string;
  verified_identity: number;
  exact_phrase: number;
  semantic_role: number;
  scene_context: number;
  structural_fit: number;
  quality: number;
  preferred_bonus: number;
  performance_penalty: number;
  contradiction_penalty: number;
  total: number;
};

export type AssetResolveRequest = {
  concept: string;
  aliases?: string[];
  semantic_tags?: string[];
  style_tags?: string[];
  domain?: string;
  target_extent_m?: number;
  required_affordances?: string[];
  desired_composition?: MyWayAssetObjectComposition;
  preferred_asset_id?: string;
  allow_blenderkit?: boolean;
  allow_trellis?: boolean;
  allow_primitive_fallback?: boolean;
  force_refresh?: boolean;
  require_scene_approved?: boolean;
  require_semantic_verified?: boolean;
  minimum_match_score?: number;
  minimum_match_margin?: number;
  candidate_limit?: number;
};

export type AssetResolveResult = {
  ok: boolean;
  source:
    | "library"
    | "blenderkit"
    | "trellis"
    | "primitive"
    | "none";
  asset: MyWayAssetRecord | null;
  warnings: string[];
  attempts: Array<{
    source: string;
    ok: boolean;
    error?: string;
  }>;
  match_score?: number | null;
  match_margin?: number | null;
  candidate_scores?: AssetMatchScoreBreakdown[];
  requires_scene_review?: boolean;
};


