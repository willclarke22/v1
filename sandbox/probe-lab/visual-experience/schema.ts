import type {
  EducationalSceneDirectorPlanV1,
  EducationalSceneDirectorValidationReport,
} from "../director";

// -----------------------------------------------------------------------------
// MyWay Visual Experience sandbox schema
// -----------------------------------------------------------------------------
// This file is intentionally sandbox-scoped. The goal is to prove the asset-
// aware visual experience loop before promoting the feature into the main app.

export type VisualAssetRegistrySchemaVersion = "myway_visual_asset_registry_v1";
export type VisualExperienceCompilerInputVersion = "myway_visual_experience_compiler_input_v1";
export type VisualExperienceCompilerOutputVersion = "myway_visual_experience_compiler_output_v1";

export type VisualAssetType = "glb" | "gltf" | "texture" | "hdri" | "primitive";

export type VisualAssetDomain =
  | "generic"
  | "biology"
  | "chemistry"
  | "physics"
  | "medicine"
  | "math"
  | "law"
  | "coding"
  | "automotive"
  | "plumbing"
  | "other";

export type VisualAssetSourceType =
  | "blenderkit"
  | "blendkit"
  | "blender_manual_export"
  | "self_made"
  | "built_in"
  | "unknown";

export type VisualAssetLicenseKind =
  | "cc0"
  | "cc_by_4_0"
  | "royalty_free"
  | "self_owned"
  | "unknown";

export type VisualAssetLicenseStatus =
  | "recorded"
  | "needs_review"
  | "sandbox_only"
  | "app_ready";

export type VisualAssetRenderRole =
  | "reference_object"
  | "opening_context"
  | "zoom_context"
  | "zoom_target"
  | "scene_environment"
  | "process_part"
  | "token"
  | "label_anchor"
  | "background"
  | "material"
  | "lighting"
  | "other";

export type VisualExperienceMode =
  | "asset_preview"
  | "model_selected_scene"
  | "visual_story"
  | "body_zoom"
  | "cell_cutaway"
  | "process_loop"
  | "mechanism"
  | "compare_contrast"
  | "spatial_structure"
  | "generic_scene";

export type VisualDiagnosisLabel =
  | "unknown"
  | "no_gap_detected"
  | "recall_gap"
  | "representation_gap"
  | "procedure_gap"
  | "discrimination_gap"
  | "transfer_gap"
  | "metacognitive_gap";

export type VisualBridgeLevel = "bridge_0" | "bridge_1" | "bridge_2" | "full_bridge";
export type VisualJargonLevel = "none" | "light" | "standard" | "full";

export type VisualPresentationStyle =
  | "plain_direct"
  | "gentle_coaching"
  | "analogy_based"
  | "metaphor_based"
  | "concrete_examples"
  | "step_by_step"
  | "visual_description"
  | "curiosity_question"
  | "real_world_connection";

export type VisualAssetRecord = {
  asset_id: string;
  display_name: string;
  asset_type: VisualAssetType;
  domain: VisualAssetDomain;
  source_type: VisualAssetSourceType;

  /** Browser-loadable URL, usually under /sandbox-assets/visual-experience/... */
  public_path: string;

  /** Optional non-browser source path, usually under sandbox/probe-lab/... */
  source_path?: string | null;
  license_record_path?: string | null;

  semantic_tags: string[];
  render_roles: VisualAssetRenderRole[];
  experience_modes: VisualExperienceMode[];

  license_kind: VisualAssetLicenseKind;
  license_status: VisualAssetLicenseStatus;
  commercial_use_allowed: boolean;
  raw_redistribution_allowed: boolean;
  safe_to_use_in_sandbox: boolean;
  safe_to_promote_to_app: boolean;

  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type VisualAssetRegistry = {
  schema_version: VisualAssetRegistrySchemaVersion;
  updated_at: string;
  asset_root_public_url: "/sandbox-assets/visual-experience" | string;
  notes?: string | null;
  assets: VisualAssetRecord[];
};

export type VisualAssetFileStats = {
  exists: boolean;
  file_size_bytes: number | null;
  file_size_label: string | null;
  project_relative_path: string | null;
};

export type VisualAssetWithStats = VisualAssetRecord & {
  file_stats: VisualAssetFileStats;
};

export type VisualAssetSummaryForModel = {
  asset_id: string;
  display_name: string;
  asset_type: VisualAssetType;
  domain: VisualAssetDomain;
  semantic_tags: string[];
  render_roles: VisualAssetRenderRole[];
  experience_modes: VisualExperienceMode[];
  license_status: VisualAssetLicenseStatus;
};

export type VisualAssetSelectionInput = {
  topic_label?: string | null;
  learner_message?: string | null;
  diagnosis?: string | null;
  semantic_tags?: string[];
  max_assets?: number;
};

export type VisualRendererCapabilities = {
  renderer: "react_three_fiber_sandbox";
  can_load_glb: boolean;
  can_orbit_camera: boolean;
  can_show_captions: boolean;
  can_show_asset_cards: boolean;
  supported_asset_types: VisualAssetType[];
  supported_experience_modes: VisualExperienceMode[];
};

export type VisualExperienceTargetTopic = {
  topic_id?: string | null;
  topic_label: string;
};

export type VisualExperienceLearnerSignal =
  | {
      signal_kind: "user_message";
      user_message: string | null;
    }
  | {
      signal_kind: "evaluated_probe_attempt";
      evaluated_probe_attempt: Record<string, unknown>;
    };

export type VisualExperiencePersonalizationContext = {
  bridge_level: VisualBridgeLevel;
  language_policy: {
    jargon_level: VisualJargonLevel;
  };
  preferred_style?: VisualPresentationStyle | null;
  preferred_order?: VisualPresentationStyle[];
  preferred_order_confidence?: number | null;
  user_interests?: Array<{
    interest: string;
    user_interest_confidence: number;
  }>;
  profile_snapshot?: {
    summary: string;
  } | null;
};

export type VisualExperienceOutputPreferences = {
  no_jargon: boolean;
  model_must_use_registered_asset_ids: boolean;
  prefer_existing_assets_over_requests: boolean;
  keep_scene_plan_renderer_facing: boolean;
  include_optional_check: boolean;
  max_beats: number;
  max_asset_uses: number;
};

export type VisualExperienceCompilerInput = {
  schema_version: VisualExperienceCompilerInputVersion;

  // Compatibility mirror while the sandbox matures.
  learner_message: string;
  diagnosis?: VisualDiagnosisLabel | string | null;
  root_problem?: string | null;

  // 3-model-shaped request boundary.
  target_topic: VisualExperienceTargetTopic;
  target_diagnosis: VisualDiagnosisLabel | string;
  learner_signal: VisualExperienceLearnerSignal;
  personalization_context: VisualExperiencePersonalizationContext;

  available_assets: VisualAssetSummaryForModel[];
  renderer_capabilities: VisualRendererCapabilities;

  requested_experience_mode?: VisualExperienceMode | null;
  output_preferences: VisualExperienceOutputPreferences;
  allow_asset_requests: boolean;
};

export type VisualExperienceAssetUse = {
  asset_id: string;
  role: VisualAssetRenderRole;
  purpose: string;
  beat_id?: string | null;
};

export type VisualExperienceAssetRequest = {
  need_id: string;
  description: string;
  semantic_tags: string[];
  preferred_asset_type: VisualAssetType;
  required: boolean;
  fallback_strategy: "use_primitive" | "use_generic_asset" | "skip";
};

export type VisualSceneEntity = {
  id: string;
  display_name: string;
  semantic_role: string;
  asset_id?: string | null;
  primitive_fallback?: "sphere" | "box" | "arrow" | "path" | "label" | "particle" | "none";
  position_hint?: [number, number, number] | null;
};

export type VisualSceneAction = {
  id: string;
  type:
    | "show_asset"
    | "highlight_asset"
    | "move_camera"
    | "show_label"
    | "trace_path"
    | "show_relationship"
    | "fade_in"
    | "fade_out"
    | "pause_for_check";
  target_entity_id?: string | null;
  asset_id?: string | null;
  narration?: string | null;
  params?: Record<string, unknown> | null;
};

export type VisualSceneBeat = {
  id: string;
  title: string;
  script_segment: string;
  duration_ms: number;
  active_entity_ids?: string[];
  active_asset_ids?: string[];
  actions: VisualSceneAction[];
};

export type VisualExperienceScenePlan = {
  renderer: "react_three_fiber_sandbox";
  /** Canonical direction; legacy entities/beats below are renderer compatibility views. */
  director_plan?: EducationalSceneDirectorPlanV1 | null;
  director_validation?: EducationalSceneDirectorValidationReport | null;
  visual_style: "simple_preview" | "diagrammatic" | "cinematic_learning" | "minimal_story";
  entities: VisualSceneEntity[];
  beats: VisualSceneBeat[];
  camera_notes?: string | null;
  interaction_notes?: string | null;
};

export type VisualExperienceCompilerOutput = {
  schema_version: VisualExperienceCompilerOutputVersion;
  title: string;
  orientation: string;
  target_takeaway: string;
  experience_mode: VisualExperienceMode;
  asset_uses: VisualExperienceAssetUse[];
  asset_requests?: VisualExperienceAssetRequest[];
  scene_plan?: VisualExperienceScenePlan | Record<string, unknown> | null;
  check_prompt?: string | null;
};

export type VisualExperienceValidationReport = {
  valid: boolean;
  fatal_errors: string[];
  warnings: string[];
  missing_asset_ids: string[];
  unsupported_asset_types: string[];
  unsupported_experience_modes: string[];
  scene_plan_warnings: string[];

  /** Asset ids that survived normalization and are safe for the renderer to use. */
  used_asset_ids: string[];

  /** Entity/action references the model gave that did not resolve after normalization. */
  unknown_entity_ids: string[];
  invalid_action_targets: string[];

  /** Non-fatal fixes applied to keep the renderer safe. */
  normalization_notes: string[];
};

export type VisualExperienceValidationResult = {
  output: VisualExperienceCompilerOutput;
  validation: VisualExperienceValidationReport;
};

export type VisualExperienceModelMessage = {
  role: "system" | "user";
  content: string;
};

export type VisualExperienceModelRequest = {
  model_task: "visual_experience_compiler";
  schema_version: "myway_visual_experience_model_request_debug_v1";
  messages: VisualExperienceModelMessage[];
  response_contract: Record<string, unknown>;
  compiler_input: VisualExperienceCompilerInput;
  tuning_notes: string[];
  prompt_stats: {
    system_chars: number;
    user_chars: number;
    total_chars: number;
    available_asset_count: number;
  };
};
