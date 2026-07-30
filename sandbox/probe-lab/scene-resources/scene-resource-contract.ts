import type {
  AssetCandidateEligibilityDiagnostic,
  AssetMatchScoreBreakdown,
  MyWayAssetAppearanceRankingDiagnostics,
} from "../assets/asset-types";

/**
 * Shared Phase 2 resource intent and binding contracts.
 *
 * The Educational Scene Director remains the educational source of truth.
 * These contracts describe the resources needed to execute that direction and
 * the reviewed resources selected later by MyWay. They never replace the
 * Director plan and never require provider-specific ids or URLs in model output.
 */

export const SCENE_RESOURCE_PLAN_SCHEMA_VERSION =
  "myway_scene_resource_plan_v1" as const;

export const RESOLVED_SCENE_RESOURCES_SCHEMA_VERSION =
  "myway_resolved_scene_resources_v1" as const;

export const SCENE_RESOURCE_PLAN_SOURCES = [
  "visual_experience",
  "primitive_builder",
  "manual_turn",
  "compatibility_adapter",
  "scaffold",
] as const;

export const SCENE_RESOURCE_KINDS = [
  "model",
  "material",
  "environment",
  "decal",
  "terrain",
  "atlas",
  "image",
  "brush",
  "substance",
  "hdri_element",
] as const;

export const SCENE_RESOURCE_REQUIRED_MAPS = [
  "base_color",
  "normal",
  "roughness",
  "metalness",
  "ambient_occlusion",
  "height",
  "opacity",
  "emission",
] as const;

export const SCENE_RESOURCE_RUNTIME_TARGETS = [
  "browser",
  "blender",
  "both",
  "authoring_only",
] as const;

export const SCENE_RESOURCE_ACQUISITION_POLICIES = [
  "never",
  "queue_only",
  "sandbox_synchronous",
] as const;

export const SCENE_RESOURCE_DEVICE_TIERS = [
  "mobile",
  "desktop",
  "high_fidelity",
] as const;

export type SceneResourcePlanSource =
  (typeof SCENE_RESOURCE_PLAN_SOURCES)[number];

export type SceneResourceKind =
  (typeof SCENE_RESOURCE_KINDS)[number];

export type SceneResourceRequiredMap =
  (typeof SCENE_RESOURCE_REQUIRED_MAPS)[number];

export type SceneResourceRuntimeTarget =
  (typeof SCENE_RESOURCE_RUNTIME_TARGETS)[number];

export type SceneResourceAcquisitionPolicy =
  (typeof SCENE_RESOURCE_ACQUISITION_POLICIES)[number];

export type SceneResourceDeviceTier =
  (typeof SCENE_RESOURCE_DEVICE_TIERS)[number];

export type SceneResourceCloseupImportance =
  | "low"
  | "medium"
  | "high";

export type SceneResourceModelRequirement = {
  semantic_tags: string[];
  aliases: string[];
  required_capabilities: string[];
  required_anchor_types: string[];
  required_affordances: string[];
  preferred_composition:
    | "single_object"
    | "object_set"
    | "environment_piece"
    | "any";
  target_extent_m: number | null;
  rigging_required: boolean;
  required_animation_clips: string[];
  closeup_importance: SceneResourceCloseupImportance;
  visual_brief: string;
  required_appearance_traits: string[];
  preferred_appearance_traits: string[];
  avoided_appearance_traits: string[];
};

export type SceneResourceMaterialRequirement = {
  semantic_tags: string[];
  appearance_tags: string[];
  required_maps: SceneResourceRequiredMap[];
  max_resolution_px: number;
  preferred_encoding: "jpg" | "png" | "automatic";
  transparency: "required" | "forbidden" | "allowed";
  tiling: [number, number];
  rotation_degrees: number;
  uv_assumption:
    | "existing_uv"
    | "generated_primitive_uv"
    | "triplanar_allowed"
    | "unknown";
  color_tint_allowed: boolean;
  displacement: "allowed" | "forbidden";
  closeup_importance: SceneResourceCloseupImportance;
};

export type SceneResourceEnvironmentRequirement = {
  semantic_tags: string[];
  lighting_mood: string;
  exposure: number;
  intensity: number;
  background_mode: "visible" | "lighting_only";
  rotation_degrees: number;
  shadow_softness: "soft" | "medium" | "hard";
  color_temperature_intent: string;
  max_resolution_px: number;
};

export type SceneResourceFallbackPolicy = {
  acquisition_policy: SceneResourceAcquisitionPolicy;
  missing_model:
    | "diagrammatic_proxy"
    | "abstract_proxy"
    | "preserve_direction_without_actor"
    | "fail_scene";
  missing_material:
    | "solid_pbr"
    | "preserve_original_material"
    | "omit_override"
    | "fail_scene";
  missing_environment:
    | "neutral_studio"
    | "renderer_default"
    | "fail_scene";
  missing_auxiliary:
    | "omit_with_warning"
    | "diagrammatic_fallback"
    | "fail_scene";
  preserve_entity_ids: true;
};

export type SceneResourcePerformanceBudget = {
  target_device: SceneResourceDeviceTier;
  max_models: number;
  max_total_triangles: number;
  max_texture_resolution_px: number;
  max_hdri_resolution_px: number;
  max_total_texture_bytes: number;
  max_simultaneous_animated_models: number;
};

export type SceneEntityResourceIntent = {
  intent_id: string;
  entity_id: string;
  semantic_role: string;
  instructional_purpose: string;
  actor_kind: string;
  resource_criticality: "optional" | "important" | "required";
  runtime_target: SceneResourceRuntimeTarget;
  model_requirement: SceneResourceModelRequirement | null;
  fallback_policy?: Partial<SceneResourceFallbackPolicy> | null;
};

export type SceneSurfaceResourceIntent = {
  intent_id: string;
  target_entity_id: string;
  material_slot: string;
  instructional_purpose: string;
  runtime_target: SceneResourceRuntimeTarget;
  material_requirement: SceneResourceMaterialRequirement;
};

export type SceneEnvironmentResourceIntent = {
  intent_id: string;
  instructional_purpose: string;
  runtime_target: Exclude<SceneResourceRuntimeTarget, "authoring_only">;
  environment_requirement: SceneResourceEnvironmentRequirement;
};

export type SceneAuxiliaryResourceIntent = {
  intent_id: string;
  resource_kind: Exclude<
    SceneResourceKind,
    "model" | "material" | "environment"
  >;
  target_entity_id?: string | null;
  target_surface?: string | null;
  semantic_tags: string[];
  instructional_purpose: string;
  runtime_target: SceneResourceRuntimeTarget;
  required: boolean;
  max_resolution_px?: number | null;
  metadata: Record<string, unknown>;
};

export type SceneResourcePlanV1 = {
  schema_version: typeof SCENE_RESOURCE_PLAN_SCHEMA_VERSION;
  source: SceneResourcePlanSource;
  scene_id: string;
  director_schema_version:
    | "myway_educational_scene_director_v1"
    | null;
  entity_intents: SceneEntityResourceIntent[];
  surface_intents: SceneSurfaceResourceIntent[];
  environment_intent: SceneEnvironmentResourceIntent | null;
  auxiliary_intents: SceneAuxiliaryResourceIntent[];
  fallback_policy: SceneResourceFallbackPolicy;
  performance_budget: SceneResourcePerformanceBudget;
};

export type SceneResourceValidationIssue = {
  severity: "warning" | "error";
  code: string;
  path: string;
  message: string;
};

export type SceneResourcePlanValidationReport = {
  valid: boolean;
  entity_intent_count: number;
  surface_intent_count: number;
  auxiliary_intent_count: number;
  unresolved_reference_count: number;
  duplicate_intent_ids: string[];
  duplicate_entity_ids: string[];
  issues: SceneResourceValidationIssue[];
};

export type ResolvedResourceSelectionReason = {
  summary: string;
  eligibility_checks: string[];
  score_components: Record<string, number>;
  candidate_rank: number;
};

export type ResolvedResourceLicenseReference = {
  license_kind: string;
  license_status: string;
  attribution_required: boolean;
  attribution_text: string | null;
  source_url: string | null;
  license_record_path: string | null;
};

export type ResolvedModelResourceBinding = {
  intent_id: string;
  entity_id: string;
  asset_id: string;
  variant_id: string | null;
  public_url: string;
  content_hash: string | null;
  storage_provider: "local" | "r2";
  selection_reason: ResolvedResourceSelectionReason;
  license: ResolvedResourceLicenseReference;
};

export type ResolvedMaterialResourceBinding = {
  intent_id: string;
  target_entity_id: string;
  material_slot: string;
  resource_id: string;
  variant_id: string;
  map_urls: Partial<Record<SceneResourceRequiredMap, string>>;
  content_hash: string;
  storage_provider: "local" | "r2";
  selection_reason: ResolvedResourceSelectionReason;
  license: ResolvedResourceLicenseReference;
};

export type ResolvedEnvironmentResourceBinding = {
  intent_id: string;
  resource_id: string;
  variant_id: string;
  environment_url: string;
  content_hash: string;
  storage_provider: "local" | "r2";
  selection_reason: ResolvedResourceSelectionReason;
  license: ResolvedResourceLicenseReference;
};

export type ResolvedAuxiliaryResourceBinding = {
  intent_id: string;
  resource_kind: SceneAuxiliaryResourceIntent["resource_kind"];
  resource_id: string;
  variant_id: string | null;
  primary_url: string | null;
  file_urls: string[];
  content_hash: string;
  storage_provider: "local" | "r2";
  selection_reason: ResolvedResourceSelectionReason;
  license: ResolvedResourceLicenseReference;
};

export type SceneModelResolutionDiagnostic = {
  intent_id: string;
  entity_id: string;
  concept: string;
  status:
    | "resolved"
    | "fallback"
    | "not_requested";
  selected_asset_id: string | null;
  match_score: number | null;
  match_margin: number | null;
  failure_reason: string | null;
  candidate_scores: AssetMatchScoreBreakdown[];
  eligibility_diagnostics: AssetCandidateEligibilityDiagnostic[];
  appearance_ranking:
    | MyWayAssetAppearanceRankingDiagnostics
    | null;
  warnings: string[];
};

export type SceneResourceResolutionWarning = {
  code: string;
  intent_id: string | null;
  message: string;
};

export type SceneResourceFallbackRecord = {
  intent_id: string;
  resource_kind: SceneResourceKind;
  fallback_used: string;
  reason: string;
  preserved_entity_id: string | null;
};

export type ResolvedSceneResourcesV1 = {
  schema_version: typeof RESOLVED_SCENE_RESOURCES_SCHEMA_VERSION;
  scene_id: string;
  resolver_version: string;
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  resolved_at: string;
  acquisition_policy: SceneResourceAcquisitionPolicy;
  models: ResolvedModelResourceBinding[];
  materials: ResolvedMaterialResourceBinding[];
  environment: ResolvedEnvironmentResourceBinding | null;
  auxiliary: ResolvedAuxiliaryResourceBinding[];
  model_resolution_diagnostics: SceneModelResolutionDiagnostic[];
  warnings: SceneResourceResolutionWarning[];
  fallbacks_used: SceneResourceFallbackRecord[];
};

export const DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY: SceneResourceFallbackPolicy = {
  acquisition_policy: "never",
  missing_model: "diagrammatic_proxy",
  missing_material: "solid_pbr",
  missing_environment: "neutral_studio",
  missing_auxiliary: "omit_with_warning",
  preserve_entity_ids: true,
};

export const DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET: SceneResourcePerformanceBudget = {
  target_device: "desktop",
  max_models: 24,
  max_total_triangles: 750_000,
  max_texture_resolution_px: 2048,
  max_hdri_resolution_px: 2048,
  max_total_texture_bytes: 128 * 1024 * 1024,
  max_simultaneous_animated_models: 8,
};
