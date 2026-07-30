export const MATERIAL_RUNTIME_SCHEMA_VERSION =
  "myway_material_runtime_v1" as const;

export const MATERIAL_TEXTURE_ROLES = [
  "base_color",
  "normal",
  "roughness",
  "metalness",
  "ambient_occlusion",
  "opacity",
  "emissive",
  "height",
  "orm",
] as const;

export type MaterialTextureRole =
  (typeof MATERIAL_TEXTURE_ROLES)[number];

export type RuntimeTextureColorSpace =
  | "srgb"
  | "linear";

export type RuntimeNormalMapConvention =
  | "opengl"
  | "directx"
  | "none";

export type RuntimeMaterialSourceMode =
  | "preserve_original"
  | "replace_all"
  | "replace_slot"
  | "primitive_surface";

export type RuntimeTextureBindingV1 = {
  role: MaterialTextureRole;
  public_url: string;
  object_key: string | null;
  content_hash: string | null;
  color_space: RuntimeTextureColorSpace;
  channel:
    | "rgb"
    | "r"
    | "g"
    | "b"
    | "a";
};

export type RuntimeMaterialUvTransform = {
  repeat: [number, number];
  offset: [number, number];
  rotation_radians: number;
  center: [number, number];
};

export type RuntimeMaterialParameters = {
  base_color_factor: string;
  roughness_factor: number;
  metalness_factor: number;
  opacity: number;
  emissive_color: string;
  emissive_intensity: number;
  normal_scale: number;
  displacement_scale: number;
};

export type RuntimeMaterialProvenance = {
  source_type: "ambientcg";
  source_asset_id: string;
  source_url: string;
  license: "CC0-1.0";
  attribution_required: false;
  commercial_use_allowed: true;
  raw_distribution_allowed: true;
};

export type RuntimeMaterialBindingV1 = {
  schema_version:
    typeof MATERIAL_RUNTIME_SCHEMA_VERSION;
  resource_kind: "material";
  material_binding_id: string;
  material_resource_id: string;
  variant_id: string;
  content_hash: string;
  target_entity_id: string;
  target_slot: string | null;
  source_mode: RuntimeMaterialSourceMode;
  display_name: string;
  resolution: string | null;
  normal_map_convention:
    RuntimeNormalMapConvention;
  maps: Partial<
    Record<
      MaterialTextureRole,
      RuntimeTextureBindingV1
    >
  >;
  parameters: RuntimeMaterialParameters;
  uv_transform: RuntimeMaterialUvTransform;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  resolver_version: string;
  resolved_at: string;
  provenance: RuntimeMaterialProvenance;
  warnings: string[];
};

export type ReviewedMaterialSummary = {
  resource_id: string;
  display_name: string;
  resolution: string | null;
  semantic_tags: string[];
  map_roles: MaterialTextureRole[];
  thumbnail_url: string | null;
  content_hash: string;
};

export type MaterialCandidateDiagnostic = {
  resource_id: string;
  eligible: boolean;
  score: number;
  reasons: string[];
  rejected_reasons: string[];
};

export type MaterialResolveDiagnostics = {
  resolver_version: string;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  selected_resource_id: string | null;
  candidate_diagnostics:
    MaterialCandidateDiagnostic[];
  acquisition_attempted: false;
};

export type MaterialRuntimeListResponse = {
  ok: boolean;
  materials: ReviewedMaterialSummary[];
  default_material_id: string | null;
  error?: string;
};

export type MaterialRuntimeResolveResponse = {
  ok: boolean;
  binding: RuntimeMaterialBindingV1 | null;
  diagnostics:
    | MaterialResolveDiagnostics
    | null;
  error?: string;
};

export type MaterialTextureMetric = {
  role: MaterialTextureRole;
  cache_key: string;
  cache_hit: boolean;
  byte_size: number;
  download_ms: number;
  decode_ms: number;
  color_space:
    RuntimeTextureColorSpace;
};

export type MaterialMeshApplicationDiagnostics = {
  source_mode:
    RuntimeMaterialSourceMode;
  target_slot: string | null;
  discovered_mesh_count: number;
  discovered_slot_count: number;
  applied_mesh_count: number;
  applied_slot_count: number;
  mesh_names: string[];
  material_slot_names: string[];
  meshes_missing_uvs: string[];
  attached_maps:
    MaterialTextureRole[];
};

export type MaterialRuntimeMetrics = {
  material_resource_id: string;
  texture_count: number;
  unique_texture_count: number;
  cache_hits: number;
  cache_misses: number;
  total_bytes: number;
  total_ms: number;
  texture_metrics:
    MaterialTextureMetric[];
  fallback_roles: MaterialTextureRole[];
  applied_mesh_count: number;
  applied_slot_count: number;
  application:
    | MaterialMeshApplicationDiagnostics
    | null;
};

export type MaterialRuntimeInstanceState = {
  phase:
    | "idle"
    | "loading"
    | "ready"
    | "failed"
    | "disposed";
  error: string | null;
  metrics: MaterialRuntimeMetrics | null;
  warnings: string[];
};

export type BlenderMaterialHydrationReport = {
  ok: boolean;
  material_resource_id: string;
  variant_id: string;
  content_hash: string;
  target_entity_id: string;
  file_count: number;
  total_bytes: number;
  files: Array<{
    role: MaterialTextureRole;
    file_name: string;
    byte_size: number;
    blender_color_space:
      | "sRGB"
      | "Non-Color";
    principled_input: string;
    channel: string;
  }>;
  normal_map_convention:
    RuntimeNormalMapConvention;
  retained_for_debug: false;
  cleaned_up: boolean;
  error?: string;
};