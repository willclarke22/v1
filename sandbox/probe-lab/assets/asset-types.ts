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
  | "cc_by"
  | "cc_by_4_0"
  | "royalty_free"
  | "self_owned"
  | "unknown";

export type MyWayAssetLicenseStatus =
  | "recorded"
  | "needs_review"
  | "sandbox_only"
  | "app_ready";

export type MyWayAssetAttributionV1 = {
  schema_version: "myway_asset_attribution_v1";
  required: boolean;
  text: string | null;
  asset_title: string | null;
  creator_name: string | null;
  source_provider: string | null;
  source_asset_id: string | null;
  source_url: string | null;
  license_name: string;
  license_version: string | null;
  license_url: string | null;
  modification_notice: string | null;
  downloaded_at: string | null;
};

export type MyWayThirdPartyAssetCreditV1 = {
  schema_version: "myway_third_party_asset_credit_v1";
  asset_id: string;
  asset_title: string | null;
  creator_name: string | null;
  source_provider: string | null;
  source_asset_id: string | null;
  source_url: string | null;
  license_kind: MyWayAssetLicenseKind;
  license_name: string;
  license_version: string | null;
  license_url: string | null;
  attribution_text: string;
  modification_notice: string | null;
};

export type MyWayThirdPartyAssetManifestV1 = {
  schema_version: "myway_third_party_assets_v1";
  generated_at: string;
  assets: MyWayThirdPartyAssetCreditV1[];
};

export type MyWayAssetStorageProvider =
  | "local"
  | "r2_private_pending"
  | "r2";

export type MyWayAssetAppearanceStatus =
  | "pending"
  | "rendering"
  | "analyzing"
  | "ready"
  | "failed";

export type MyWayAssetAppearanceViewName =
  | "front_three_quarter"
  | "rear_three_quarter"
  | "side"
  | "elevated_front";

export type MyWayAssetAppearanceView = {
  name: MyWayAssetAppearanceViewName;
  public_path: string;
};

export type MyWayAssetAppearanceProfileV1 = {
  schema_version: "myway_asset_appearance_profile_v1";
  status: MyWayAssetAppearanceStatus;
  summary: string;
  style_descriptors: string[];
  design_era: string[];
  realism_level: string[];
  shape_language: string[];
  material_treatment: string[];
  color_palette: string[];
  surface_condition: string[];
  ornamentation: string[];
  visual_mood: string[];
  detail_level: string[];
  scene_compatibility: string[];
  descriptors: string[];
  materials: string[];
  colors: string[];
  geometry: string[];
  warnings: string[];
  confidence: number;
  analysis_views: MyWayAssetAppearanceView[];
  model: string | null;
  prompt_version: string;
  render_version: string;
  content_hash: string | null;
  analyzed_at: string | null;
  error: string | null;
};

export type MyWayAssetAppearanceEmbeddingV1 = {
  schema_version: "myway_asset_appearance_embedding_v1";
  status: "pending" | "ready" | "failed";
  model: string;
  dimensions: number | null;
  vector_key: string | null;
  source_text_hash: string | null;
  embedded_at: string | null;
  error: string | null;
};

export type MyWayAssetAppearanceRequestV1 = {
  schema_version: "myway_asset_appearance_request_v1";
  visual_brief: string;
  required_traits: string[];
  preferred_traits: string[];
  avoid_traits: string[];
};

export type MyWayAssetAppearanceRankingDiagnostics = {
  requested: boolean;
  used: boolean;
  model: string | null;
  dimensions: number | null;
  source_text_hash: string | null;
  comparable_candidate_count: number;
  reason: string | null;
};

export type Vec3 = [number, number, number];

export type MyWayAssetGeometryProfileSource =
  | "blender_geometry"
  | "runtime_geometry"
  | "manual"
  | "legacy_ratio";

export type MyWaySpatialExposure =
  | "exterior"
  | "interior"
  | "unknown";

export type MyWaySpatialOrientation =
  | "upward"
  | "vertical"
  | "downward"
  | "sloped"
  | "unknown";

export type MyWaySpatialOpenness =
  | "open"
  | "enclosed"
  | "unknown";

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
  usable_size?: [number, number];
  area: number;
  confidence: number;
  source: MyWayAssetGeometryProfileSource;

  // Generic spatial-region properties. These deliberately avoid object-specific
  // labels such as "tabletop" or "shelf" so the same solver works for every asset.
  region_kind?: "support";
  exposure?: MyWaySpatialExposure;
  orientation?: MyWaySpatialOrientation;
  openness?: MyWaySpatialOpenness;
  vertical_rank?: number;
  clearance_above_m?: number | null;
  blocked_fraction?: number;
  enclosure_confidence?: number;
  edge_margin_m?: number;

  // Legacy ratio fields remain optional so old registry records can be read
  // without pretending that a guessed whole-object top is real geometry.
  height_ratio?: number;
  footprint_ratio?: [number, number];
  coverage_ratio?: number;
};

export type MyWayAssetGeometryAuditV1 = {
  status: "measured" | "review_required";
  confidence: number;
  warnings: string[];
  mesh_object_count: number;
  included_mesh_count: number;
  excluded_mesh_names: string[];
  triangle_count: number;
  support_surface_count: number;
};

export type MyWayAssetCollisionBox = {
  id?: string;
  label?: string;
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
  confidence?: number;
  source?: MyWayAssetGeometryProfileSource;
};

export type MyWayAssetInteriorVolume = {
  id: string;
  label?: string;
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
  confidence: number;
  source?: MyWayAssetGeometryProfileSource;
  exposure?: MyWaySpatialExposure;
  openness?: MyWaySpatialOpenness;
  access_direction?: Vec3;
};

export type MyWayAssetAttachmentRegion = {
  id: string;
  label: string;
  center: Vec3;
  normal: Vec3;
  u_axis: Vec3;
  v_axis: Vec3;
  size: [number, number];
  confidence: number;
  source: MyWayAssetGeometryProfileSource;
  exposure: MyWaySpatialExposure;
  orientation: MyWaySpatialOrientation;
  side: "left" | "right" | "front" | "back" | "top" | "bottom" | "unknown";
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
  attachment_regions: MyWayAssetAttachmentRegion[];
  collision_boxes: MyWayAssetCollisionBox[];
  primary_support_surface_id?: string | null;
  audit?: MyWayAssetGeometryAuditV1;
  content_hash?: string | null;
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
  appearance_profile?: MyWayAssetAppearanceProfileV1;
  appearance_embedding?: MyWayAssetAppearanceEmbeddingV1;

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
  attribution?: MyWayAssetAttributionV1 | null;
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

export type MyWayAssetRegistryV2 = {
  schema_version: "myway_asset_registry_v2";
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
  appearance_eligible: boolean;
  appearance_status:
    | "not_requested"
    | "ready"
    | "profile_only"
    | "missing"
    | "invalid"
    | "contradicted";
  appearance_similarity: number | null;
  appearance_similarity_bonus: number;
  required_trait_matches: string[];
  required_trait_unknown: string[];
  required_trait_conflicts: string[];
  preferred_trait_matches: string[];
  avoid_trait_matches: string[];
  appearance_trait_bonus: number;
  appearance_penalty: number;
  appearance_summary: string | null;
  total: number;
};

export const ASSET_ACQUISITION_POLICIES = [
  "never",
  "queue_only",
  "sandbox_synchronous",
] as const;

export type AssetAcquisitionPolicy =
  (typeof ASSET_ACQUISITION_POLICIES)[number];

export type AssetCandidateEligibilityDiagnostic = {
  asset_id: string;
  eligible: boolean;
  reasons: string[];
  scene_review_status: MyWayAssetSceneReviewStatus | "pending";
  semantic_review_status: MyWayAssetSemanticReviewStatus | "pending";
  license_status: MyWayAssetLicenseStatus;
  storage_provider: MyWayAssetStorageProvider;
  cloud_ready: boolean;
  file_exists: boolean | null;
};

export type AssetSelectionReason = {
  summary: string;
  eligibility_checks: string[];
  score_components: Record<string, number>;
  candidate_rank: number;
};

export type AssetAcquisitionQueueContext = {
  scene_session_id: string;
  scene_id?: string | null;
  source: "primitive_builder" | "visual_experience";
  title?: string | null;
  original_prompt?: string | null;
  requirement_instance_id?: string | null;
};

export type AssetResolveRequest = {
  concept: string;
  aliases?: string[];
  semantic_tags?: string[];
  domain?: string;
  target_extent_m?: number;
  required_affordances?: string[];
  desired_composition?: MyWayAssetObjectComposition;
  preferred_asset_id?: string;
  appearance_request?: MyWayAssetAppearanceRequestV1;

  // Canonical Phase 2 resolution uses deterministic profile/trait checks.
  // Provider-backed vector reranking is opt-in and must not be enabled by
  // normal scene-runtime callers.
  appearance_ranking?: boolean;

  acquisition_policy?: AssetAcquisitionPolicy;
  acquisition_queue_context?: AssetAcquisitionQueueContext;

  require_scene_approved?: boolean;
  require_semantic_verified?: boolean;
  require_license_eligible?: boolean;
  require_cloud_ready?: boolean;
  require_rigged?: boolean;
  required_animation_clips?: string[];
  minimum_match_score?: number;
  minimum_match_margin?: number;
  candidate_limit?: number;
  debug_write?: boolean;

  // Deprecated compatibility inputs. New code must use acquisition_policy.
  allow_blenderkit?: boolean;
  allow_trellis?: boolean;
  allow_primitive_fallback?: boolean;
  force_refresh?: boolean;

  // Deprecated telemetry input. Canonical resolution never mutates reuse
  // counters; callers may record usage separately after selection.
  record_reuse?: boolean;
};

export type AssetResolveResult = {
  ok: boolean;
  source:
    | "library"
    | "blenderkit"
    | "trellis"
    | "queued"
    | "primitive"
    | "none";
  asset: MyWayAssetRecord | null;
  warnings: string[];
  attempts: Array<{
    source: string;
    ok: boolean;
    error?: string;
  }>;
  resolver_version: string;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  resolved_at: string;
  acquisition_policy: AssetAcquisitionPolicy;
  selection_reason: AssetSelectionReason | null;
  eligibility_diagnostics: AssetCandidateEligibilityDiagnostic[];
  queued_job_ids?: string[];
  match_score?: number | null;
  match_margin?: number | null;
  candidate_scores?: AssetMatchScoreBreakdown[];
  appearance_ranking?: MyWayAssetAppearanceRankingDiagnostics;
  failure_reason?: string | null;
  requires_scene_review?: boolean;
};
