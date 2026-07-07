import type { DiagnosisModelOutput } from "@/lib/engine/schemas/diagnosis-model";
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
  learning_focus: VisualLearningFocus;
  visual_experience: VisualExperienceCompilerOutput;
  guided_interaction: GuidedVisualInteraction;
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
  why_visual_first: string;
};

export type VisualExperienceCompilerOutput = {
  schema_version: "myway_visual_experience_compiler_output_v1";
  title: string;
  experience_mode: VisualExperienceMode;
  orientation_segments: VisualOrientationSegment[];
  semantic_scene_plan: SemanticScenePlan;
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

export type SemanticScenePlan = {
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
  render_bindings: RenderBinding[];
  queued_asset_needs: QueuedAssetNeed[];
  validation: VisualLearningTurnValidationReport;
};

export type RenderBinding = {
  entity_id: string;
  binding:
    | { kind: "registered_asset"; asset_id: string; reason: string }
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
