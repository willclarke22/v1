export const ENVIRONMENT_RUNTIME_SCHEMA_VERSION =
  "myway_environment_runtime_v1" as const;

export const ENVIRONMENT_RESOLVER_VERSION =
  "myway_reviewed_environment_resolver_v1" as const;

export const ENVIRONMENT_RUNTIME_PHASES = [
  "idle",
  "resolving",
  "resolved",
  "downloading",
  "verifying",
  "decoding",
  "processing",
  "ready",
  "fallback",
  "failed",
  "cancelled",
  "disposed",
] as const;

export type EnvironmentRuntimePhase =
  (typeof ENVIRONMENT_RUNTIME_PHASES)[number];

export type RuntimeEnvironmentFormat =
  | "hdr"
  | "exr";

export type RuntimeEnvironmentLightingMode =
  | "hdri"
  | "studio_rig"
  | "diagrammatic_rig"
  | "dramatic_rig"
  | "outdoor_daylight_rig"
  | "unlit";

export type RuntimeEnvironmentBackgroundMode =
  | "environment"
  | "solid_color"
  | "transparent"
  | "none";

export type RuntimeEnvironmentFallbackRig =
  Exclude<
    RuntimeEnvironmentLightingMode,
    "hdri" | "unlit"
  >;

export type RuntimeShadowQuality =
  | "off"
  | "low"
  | "medium"
  | "high";

export type RuntimeShadowPolicy = {
  enabled: boolean;
  quality: RuntimeShadowQuality;
  max_shadow_lights: number;
  map_size: 512 | 1024 | 2048;
  softness: number;
  bias: number;
  normal_bias: number;
};

export type RuntimeEnvironmentFallback = {
  used: boolean;
  reason: string | null;
  rig: RuntimeEnvironmentFallbackRig;
  ambient_intensity: number;
  key_light_intensity: number;
  fill_light_intensity: number;
  rim_light_intensity: number;
};

export type RuntimeEnvironmentBindingV1 = {
  schema_version:
    typeof ENVIRONMENT_RUNTIME_SCHEMA_VERSION;
  resource_kind: "environment";
  environment_binding_id: string;
  environment_resource_id: string | null;
  variant_id: string | null;
  content_hash: string | null;
  display_name: string;
  format: RuntimeEnvironmentFormat | null;
  lighting_mode: RuntimeEnvironmentLightingMode;
  background_mode: RuntimeEnvironmentBackgroundMode;
  public_url: string | null;
  object_key: string | null;
  intensity: number;
  rotation_radians: number;
  background_intensity: number;
  background_blurriness: number;
  background_color: string;
  exposure: number;
  shadow_policy: RuntimeShadowPolicy;
  fallback: RuntimeEnvironmentFallback;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  resolver_version:
    typeof ENVIRONMENT_RESOLVER_VERSION;
  resolved_at: string;
  provenance: {
    source_type: "ambientcg" | "fallback";
    source_asset_id: string | null;
    source_url: string | null;
    license: "CC0-1.0" | "internal";
    attribution_required: boolean;
    commercial_use_allowed: boolean;
    raw_distribution_allowed: boolean;
  };
  warnings: string[];
};

export type ReviewedEnvironmentSummary = {
  resource_id: string;
  display_name: string;
  resolution: string | null;
  file_format: string | null;
  variant_id: string;
  format: RuntimeEnvironmentFormat;
  public_url: string;
  content_hash: string;
  semantic_tags: string[];
  source_url: string;
};

export type EnvironmentCandidateDiagnostic = {
  resource_id: string;
  eligible: boolean;
  score: number;
  reasons: string[];
  rejected_reasons: string[];
};

export type EnvironmentResolverDiagnostics = {
  resolver_version:
    typeof ENVIRONMENT_RESOLVER_VERSION;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  selected_resource_id: string | null;
  candidate_diagnostics:
    EnvironmentCandidateDiagnostic[];
  acquisition_attempted: false;
  fallback_used: boolean;
};

export type EnvironmentRuntimeListResponse = {
  ok: boolean;
  environments: ReviewedEnvironmentSummary[];
  default_environment_id: string | null;
  registry_snapshot_id: string | null;
  registry_content_hash: string | null;
  error: string | null;
};

export type EnvironmentRuntimeResolveResponse = {
  ok: boolean;
  binding: RuntimeEnvironmentBindingV1 | null;
  diagnostics:
    | EnvironmentResolverDiagnostics
    | null;
  error: string | null;
};

export type EnvironmentCacheMetric = {
  cache_key: string;
  status: "loading" | "ready" | "failed";
  refs: number;
  byte_size: number | null;
  format: RuntimeEnvironmentFormat;
  download_ms: number | null;
  verify_ms: number | null;
  decode_ms: number | null;
  pmrem_ms: number | null;
  cache_hit: boolean;
  decoded_width: number | null;
  decoded_height: number | null;
  source_width?: number | null;
  source_height?: number | null;
  runtime_width?: number | null;
  runtime_height?: number | null;
  downsampled?: boolean;
  estimated_runtime_bytes?: number | null;
  browser_max_width?: number | null;
  expected_content_hash: string | null;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
  last_used_at: number;
};

export type EnvironmentRuntimeState = {
  phase: EnvironmentRuntimePhase;
  environment_resource_id: string | null;
  lighting_mode: RuntimeEnvironmentLightingMode;
  environment_attached: boolean;
  background_attached: boolean;
  fallback_lights_active: boolean;
  error: string | null;
  warnings: string[];
  metrics: EnvironmentCacheMetric | null;
  effective: {
    tone_mapping: "ACESFilmic";
    output_color_space: "srgb";
    exposure: number;
    environment_intensity: number;
    rotation_radians: number;
    background_mode:
      RuntimeEnvironmentBackgroundMode;
    background_blurriness: number;
    shadow_policy: RuntimeShadowPolicy;
  };
};

export type BlenderEnvironmentHydrationReport = {
  ok: boolean;
  environment_resource_id: string | null;
  variant_id: string | null;
  content_hash: string | null;
  file_name: string | null;
  byte_size: number;
  format: RuntimeEnvironmentFormat | null;
  world_nodes: Array<{
    node_type: string;
    purpose: string;
  }>;
  mapping_rotation_radians: number;
  background_strength: number;
  visible_background: boolean;
  view_transform: "AgX";
  exposure: number;
  retained_for_debug: boolean;
  cleaned_up: boolean;
  error: string | null;
};

export const DEFAULT_ENVIRONMENT_SHADOW_POLICY:
  RuntimeShadowPolicy = {
    enabled: true,
    quality: "medium",
    max_shadow_lights: 1,
    map_size: 1024,
    softness: 2,
    bias: -0.0002,
    normal_bias: 0.02,
  };

export const DEFAULT_ENVIRONMENT_FALLBACK:
  RuntimeEnvironmentFallback = {
    used: false,
    reason: null,
    rig: "studio_rig",
    ambient_intensity: 0.55,
    key_light_intensity: 2.6,
    fill_light_intensity: 1.15,
    rim_light_intensity: 1.5,
  };
