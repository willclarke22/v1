import type { DiagnosisModelOutput } from "@/lib/engine/schemas/diagnosis-model";
import type { DiagnosticSignal } from "./diagnostic-relationships";
import type { ProbeContractModelOutput } from "@/lib/engine/schemas/probe-contract-model";
import type {
  BridgeLevel,
  ConfidenceScore,
  DiagnosisLabel,
  EvaluatedProbeAttemptSignal,
  JargonLevel,
  LanguagePolicy,
  PersonalizationProfileSnapshot,
  PersonalizationSignalDirection,
  PersonalizationSignalKind,
  PersonalizationSignalScope,
  PresentationStyle,
  ProbeType,
} from "@/lib/engine/schemas/shared";

import type {
  DirectorActorKind,
  DirectorFallbackRepresentation,
  EducationalSceneDirectorPlanV1,
  EducationalSceneDirectorValidationReport,
} from "../director";
import type {
  ResolvedSceneResourcesV1,
  SceneResourcePlanV1,
  SceneResourcePlanValidationReport,
} from "../scene-resources";
export type VisualLearningTurnInput = {
  schema_version: "myway_visual_learning_turn_input_v1";
  input_kind: "user_message" | "evaluated_probe_attempt";
  user_message?: { text: string } | null;
  evaluated_probe_attempt?: EvaluatedProbeAttemptSignal | null;
  known_topic_state?: {
    topic_id?: string | null;
    topic_label?: string | null;
    recent_diagnoses?: DiagnosisLabel[];
  } | null;
  personalization_context: {
    bridge_level: BridgeLevel;
    language_policy: LanguagePolicy;
    preferred_style?: PresentationStyle | null;
    preferred_order?: PresentationStyle[];
    preferred_order_confidence?: ConfidenceScore | null;
    user_interests?: Array<{ interest: string; user_interest_confidence: ConfidenceScore }>;
    profile_snapshot?: PersonalizationProfileSnapshot | null;
  };
  renderer_capabilities: VisualLearningRendererCapabilities;
  available_probe_types: ProbeType[];
  asset_resolution_policy: {
    myway_will_resolve_assets_after_model_output: true;
    model_should_not_use_asset_ids: true;
    model_should_not_invent_file_paths: true;
    model_should_describe_visual_needs: true;
    allow_primitive_fallbacks: boolean;
    prefer_scene_integrity_over_asset_availability: true;
  };
  output_preferences: {
    visual_first: true;
    probe_after_visual: true;
    no_jargon: boolean;
    max_orientation_segments: number;
    max_visual_beats: number;
    max_probe_options: number;
    include_personalization_hypotheses: boolean;
    full_prompt_drives_scene?: boolean;
    cinematic_by_default?: true;
    introduce_visual_elements_one_at_a_time_when_helpful?: true;
    durable_personalization_delta_after_attempt_only: true;
  };
};

export type VisualLearningRendererCapabilities = {
  renderer: "react_three_fiber_sandbox" | string;
  can_render_primitives: boolean;
  can_render_paths: boolean;
  can_render_labels: boolean;
  can_render_particles: boolean;
  can_orbit_camera: boolean;
  can_zoom_camera: boolean;
  can_show_captions: boolean;
  can_scrub_beats: boolean;
  supported_experience_modes: VisualExperienceMode[];
  supported_primitives: VisualPrimitiveKind[];
  supported_scene_actions: VisualSceneActionType[];
};

export type VisualExperienceMode =
  | "model_selected_scene"
  | "process_loop"
  | "mechanism"
  | "compare_contrast"
  | "spatial_structure"
  | "generic_scene";

export type VisualPrimitiveKind = "sphere" | "box" | "arrow" | "path" | "label" | "particle";

export type VisualSceneActionType =
  | "show_entity"
  | "highlight_entity"
  | "move_entity"
  | "trace_path"
  | "show_label"
  | "show_relationship"
  | "fade_in"
  | "fade_out"
  | "pause_for_check";

export type VisualLearningTurnOutput =
  | VisualLearningTurnNeedsClarificationOutput
  | VisualLearningTurnProceedOutput;

export type VisualLearningTurnNeedsClarificationOutput = {
  schema_version: "myway_visual_learning_turn_output_v1";
  turn_status: "needs_clarification";
  clarification_gate: ClarificationGateOutput;
};

export type VisualLearningTurnProceedOutput = {
  schema_version: "myway_visual_learning_turn_output_v1";
  turn_status: "proceed";
  clarification_gate: ClarificationGateOutput;
  topic_resolution: TopicResolutionOutput;
  diagnosis: DiagnosisModelOutput;
  diagnostic_signal?: DiagnosticSignal;
  learning_focus: VisualLearningFocus;
  visual_experience: VisualExperienceCompilerOutput;
  guided_interaction: GuidedVisualInteraction;
  personalization_decision?: VisualPersonalizationDecision | null;
  followup_probe: ProbeContractModelOutput;
  personalization_hypotheses?: VisualPersonalizationHypothesis[];
  confidence: ConfidenceScore;
};

export type ClarificationGateOutput = {
  schema_version: "myway_turn_clarification_gate_output_v1";
  action: "proceed" | "ask_clarifying_question" | "offer_scope_choices" | "confirm_interpretation";
  confidence: { overall: ConfidenceScore; topic: ConfidenceScore; learner_goal: ConfidenceScore };
  clarification_question?: string | null;
  scope_choices?: Array<{ id: string; label: string; description: string }>;
  reason: string;
};

export type TopicResolutionOutput = {
  topic_label: string;
  topic_id?: string | null;
  topic_confidence: ConfidenceScore;
  topic_reference_type: "new_topic" | "existing_topic" | "topic_refinement" | "unknown";
  reason: string;
};

export type VisualLearningFocus = {
  root_problem: string;
  target_takeaway: string;
  /** Legacy compatibility only. The v2 model prompt no longer asks for this. */
  why_visual_first?: string;
};

export type VisualExperienceCompilerOutput = {
  schema_version: "myway_visual_experience_compiler_output_v1";
  title: string;
  /** Source of truth for the learner-facing teaching turn. */
  full_prompt?: string;
  /** Teaching moves inside full_prompt; also used for progressive reveal. */
  explanation_pieces?: VisualExplanationPiece[];
  what_to_watch_for?: string[];
  experience_mode: VisualExperienceMode;
  /** Legacy renderer compatibility derived from explanation_pieces. */
  orientation_segments: VisualOrientationSegment[];
  semantic_scene_plan: SemanticScenePlan;
};

export type VisualExplanationPiece = {
  id: string;
  text: string;
  role:
    | "start_from_basic_need"
    | "hit_a_wall"
    | "introduce_needed_part"
    | "show_how_part_helps"
    | "hit_next_wall"
    | "connect_parts"
    | "land_the_takeaway"
    | "prepare_followup_probe";
};

export type VisualOrientationSegment = {
  id: string;
  text: string;
  purpose:
    | "introduce_scene"
    | "show_main_structure"
    | "show_motion_or_change"
    | "show_relationship"
    | "prepare_interaction"
    | "connect_to_probe";
};

export type DirectedSceneCaptionPolicy = {
  display_mode?: "one_word_at_a_time" | "short_phrase" | "sentence" | string;
  cadence?: "natural_speech" | "slow" | "quick" | string;
  max_words_on_screen?: number;
  important_words_linger?: boolean;
  [key: string]: unknown;
};

export type DirectedSceneLabelPolicy = {
  default_visibility?: "active_only" | "selected_only" | "introduced_only" | "always" | "minimal" | string;
  show_labels_when?: string;
  avoid_covering_core_motion?: boolean;
  [key: string]: unknown;
};

export type DirectedSceneCinematography = {
  opening_shot?: string;
  camera_motion?: string;
  focus_strategy?: string;
  label_strategy?: string;
  [key: string]: unknown;
};

export type DirectedVisualSceneDirection = {
  scene_concept?: string;
  visual_metaphor?: string;
  emotional_tone?: string;
  spatial_design?: string;
  cinematography?: DirectedSceneCinematography | null;
  caption_policy?: DirectedSceneCaptionPolicy | null;
  label_policy?: DirectedSceneLabelPolicy | null;
  renderer_directive?: string;
  [key: string]: unknown;
};

export type DirectedVisualEvent = {
  type?: string;
  entity_id?: string;
  entity_ids?: string[];
  from?: string;
  to?: string;
  description?: string;
  [key: string]: unknown;
};

export type DirectedStoryBeat = {
  id: string;
  title?: string;
  director_intent?: string;
  camera?: {
    shot_type?: string;
    focus_entity_ids?: string[];
    movement?: string;
    [key: string]: unknown;
  } | null;
  visual_events?: DirectedVisualEvent[];
  /** Legacy renderer compatibility only. The v2 model prompt no longer asks for spoken_caption. */
  spoken_caption?: {
    text?: string;
    display_mode?: "one_word_at_a_time" | "short_phrase" | "sentence" | string;
    cadence?: "natural_speech" | "slow" | "quick" | string;
    [key: string]: unknown;
  } | null;
  source_explanation_piece_ids?: string[];
  introduces_entity_ids?: string[];
  keeps_visible_entity_ids?: string[];
  [key: string]: unknown;
};

export type SemanticScenePlan = {
  /** Canonical source of truth for educational direction and late-bound actors. */
  director_plan?: EducationalSceneDirectorPlanV1 | null;
  /** Validation produced when the canonical director plan is normalized. */
  director_validation?: EducationalSceneDirectorValidationReport | null;
  /** Shared Phase 2 resource intent derived from the canonical Director plan. */
  resource_plan?: SceneResourcePlanV1 | null;
  /** Validation for resource ids, targets, fallbacks, and budgets. */
  resource_plan_validation?: SceneResourcePlanValidationReport | null;
  /** Compatibility view derived from director_plan for the current renderer. */
  directed_scene?: Record<string, unknown> | null;
  /** Optional beat-level director instructions. The older beats array remains the executable compatibility layer. */
  story_beats?: Array<Record<string, unknown>>;
  caption_policy?: Record<string, unknown> | null;
  label_policy?: Record<string, unknown> | null;
  /** v2 scene moments from the model. story_beats remains the renderer compatibility layer. */
  scene_moments?: Array<Record<string, unknown>>;
  entities: SemanticSceneEntity[];
  relationships?: SemanticSceneRelationship[];
  beats: SemanticSceneBeat[];
  camera_notes?: string | null;
  interaction_notes?: string | null;
};

export type SemanticSceneEntity = {
  id: string;
  display_name: string;
  semantic_role: string;
  visual_need: VisualNeed;
  /** Director-facing actor classification retained independently of the resolved GLB. */
  actor_kind?: DirectorActorKind | string;
  asset_policy?: {
    asset_required?: boolean;
    can_use_proxy_until_asset_ready?: boolean;
    fallback_representation?: DirectorFallbackRepresentation | string;
    capability_needs?: string[];
    anchor_needs?: string[];
  } | null;
  position_hint?: [number, number, number] | null;
};

export type VisualNeed = {
  description: string;
  semantic_tags: string[];
  preferred_render_kind: VisualPrimitiveKind | "registered_asset" | "any";
  fallback_allowed: boolean;
};

export type SemanticSceneRelationship = {
  id: string;
  source_entity_id: string;
  target_entity_ids: string[];
  relationship_type:
    | "connects_to"
    | "contrasts_with"
    | "causes"
    | "becomes"
    | "enters"
    | "leaves"
    | "cycles_back"
    | "supports_takeaway";
  explanation: string;
};

export type SemanticSceneBeat = {
  id: string;
  title: string;
  source_orientation_segment_ids: string[];
  duration_ms: number;
  active_entity_ids: string[];
  actions: SemanticSceneAction[];
};

export type SemanticSceneAction = {
  id: string;
  type: VisualSceneActionType;
  target_entity_id: string;
  narration?: string | null;
  params?: Record<string, unknown> | null;
};

export type GuidedVisualInteraction = {
  instruction: string;
  required_action_type:
    | "orbit"
    | "zoom"
    | "scrub_beats"
    | "inspect_entity"
    | "compare_entities"
    | "drag_object"
    | "toggle_layer"
    | "answer_in_scene"
    | "none";
  target_entity_ids?: string[];
  success_observation?: string | null;
};

export type VisualPersonalizationDecision = {
  chosen_interest?: string | null;
  use_interest: "structural_bridge" | "light_tone" | "do_not_use";
  reason: string;
  structural_mapping?: string | null;
  anti_distortion_guard: string;
};

export type VisualPersonalizationHypothesis = {
  kind: PersonalizationSignalKind;
  value: string;
  direction: PersonalizationSignalDirection;
  scope: PersonalizationSignalScope;
  scope_key?: string | null;
  confidence: ConfidenceScore;
  reason: string;
};

export type MyWayResolvedVisualLearningTurn = {
  schema_version: "myway_resolved_visual_learning_turn_v1";
  source_output_valid: boolean;
  resource_plan?: SceneResourcePlanV1 | null;
  resource_plan_validation?: SceneResourcePlanValidationReport | null;
  resolved_resources?: ResolvedSceneResourcesV1 | null;
  render_bindings: RenderBinding[];
  queued_asset_needs: QueuedAssetNeed[];
  asset_resolution_warnings?: string[];
  validation: VisualLearningTurnValidationReport;
};

export type RegisteredVisualAssetBinding = {
  kind: "registered_asset";
  asset_id: string;
  public_path: string;
  source_type: string;
  scene_review_status: "pending" | "approved" | "rejected";
  dimensions_m: [number, number, number];
  default_scale: number;
  default_rotation: [number, number, number];
  ground_offset_m: number;
  match_score?: number | null;
  reason: string;
};

export type RenderBinding = {
  entity_id: string;
  binding:
    | RegisteredVisualAssetBinding
    | { kind: "primitive"; primitive: VisualPrimitiveKind; reason: string }
    | { kind: "placeholder"; label: string; reason: string };
};

export type QueuedAssetNeed = {
  source_entity_id: string;
  description: string;
  semantic_tags: string[];
  priority: "low" | "medium" | "high";
};

export type VisualLearningTurnValidationReport = {
  valid: boolean;
  root_problem_present: boolean;
  orientation_coverage_valid: boolean;
  covered_orientation_segment_ids: string[];
  uncovered_orientation_segment_ids: string[];
  all_action_targets_valid: boolean;
  unknown_action_target_entity_ids: string[];
  followup_probe_valid: boolean;
  bridge_policy_valid: boolean;
  fatal_errors: string[];
  warnings: string[];
  director_plan_present?: boolean;
  director_plan_valid?: boolean;
  director_plan_issue_count?: number;
  resource_plan_present?: boolean;
  resource_plan_valid?: boolean;
  resource_plan_issue_count?: number;
};

export const DEFAULT_VISUAL_LEARNING_RENDERER_CAPABILITIES: VisualLearningRendererCapabilities = {
  renderer: "react_three_fiber_sandbox",
  can_render_primitives: true,
  can_render_paths: true,
  can_render_labels: true,
  can_render_particles: true,
  can_orbit_camera: true,
  can_zoom_camera: true,
  can_show_captions: true,
  can_scrub_beats: true,
  supported_experience_modes: [
    "model_selected_scene",
    "process_loop",
    "mechanism",
    "compare_contrast",
    "spatial_structure",
    "generic_scene",
  ],
  supported_primitives: ["sphere", "box", "arrow", "path", "label", "particle"],
  supported_scene_actions: [
    "show_entity",
    "highlight_entity",
    "move_entity",
    "trace_path",
    "show_label",
    "show_relationship",
    "fade_in",
    "fade_out",
    "pause_for_check",
  ],
};

export const DEFAULT_VISUAL_LEARNING_PROBE_TYPES: ProbeType[] = [
  "single_choice",
  "multi_choice",
  "sequence",
  "drag_drop_placements",
  "explain",
  "predict",
  "graph_relationship",
];

export const DEFAULT_BRIDGE_LEVEL: BridgeLevel = "bridge_0";
export const DEFAULT_JARGON_LEVEL: JargonLevel = "none";
