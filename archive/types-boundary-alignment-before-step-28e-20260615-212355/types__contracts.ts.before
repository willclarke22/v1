// types/contracts.ts

/**
 * MyWay core runtime contracts
 *
 * This file is intentionally centered on the "contract-proving" phase:
 * - important_run_inputs
 * - engine_fuel.intervention_mode_decision
 * - engine_fuel.probe_plan
 * - delivered_response
 * - learning_space
 *
 * Key invariant:
 * - engine_fuel.probe_plan = intended intervention plan
 * - delivered_response.delivered_probe = actual delivered artifact
 * - important_run_inputs.new_attempt = raw submitted attempt
 * - engine_fuel.attempts = judged attempts
 *
 * Embedding naming invariant:
 * - topic_centroid remains the visual / 3D position vector for now.
 * - topic_label_embedding_centroid is the semantic embedding of the clean topic label.
 *   It is used for layout / semantic structure / Qdrant topic lookup.
 * - topic_message_embedding_centroid is the topic-level embedding of learner messages.
 *   It is used later for personalization / struggle-pattern similarity.
 * - learning_space.position is the renderer-safe current visual position derived
 *   from topic state.
 *
 * Position/layout invariant:
 * - topic_position_x/y/z = current committed renderer position.
 * - semantic_position_x/y/z = computed semantic target position.
 * - learning_space.topics[].position = current renderer-safe position.
 * - learning_space.topics[].layout.semantic_position = optional semantic target.
 */

export type ISO8601String = string;
export type EntityId = string;

export type Nullable<T> = T | null;
export type EmbeddingVector = number[];

/* ------------------------------------------------------------------ */
/* ENUM / UNION TYPES */
/* ------------------------------------------------------------------ */

export type RunKind =
  | "initial_question"
  | "clarify_followup"
  | "attempt_run"
  | "mixed";

export type InterventionMode = "clarify" | "probe";

export type DiagnosisType =
  | "recall_gap"
  | "representation_gap"
  | "procedure_gap"
  | "discrimination_gap"
  | "transfer_gap";

export type ProbeIntent = "diagnostic" | "intervention" | "verification";

export type ProbeType =
  | "predict"
  | "explain"
  | "discriminate"
  | "transform"
  | "apply_transfer";

export type AttemptResponseType =
  | "text"
  | "choice"
  | "multiple_choice"
  | "ordering"
  | "transform"
  | "classify"
  | "predict"
  | "dynamic_task"
  | "audio"
  | "video"
  | "interactive_action";

export type ProbeExpectedResponseType = AttemptResponseType | "mixed";

export type RendererModality = "text" | "video" | "interactive";
export type RendererGenerator = "chatgpt" | "sora" | "custom";

export type ModelInferenceMode = "local" | "service";
export type ModelSignalStatus =
  | "ok"
  | "queued"
  | "unavailable"
  | "timeout"
  | "error";

export type AttemptStatus = "present" | "absent" | "not_applicable";
export type AttemptCompletionStatus =
  | "complete"
  | "partial"
  | "skipped"
  | "abandoned"
  | "unclear";

export type PreviousClarifyOutcome =
  | "sufficient"
  | "probe_required"
  | "not_applicable";

export type ProbePlanStatus = "not_applicable" | "applicable";

export type TextPlanStatus = "planned" | "not_selected" | "not_applicable";
export type VideoPlanStatus = "planned" | "not_selected" | "not_applicable";
export type InteractivePlanStatus =
  | "planned"
  | "not_selected"
  | "placeholder"
  | "not_applicable";

export type ContentSourceMode = "generated" | "retrieved" | "hybrid";

export type TextPedagogicalRole =
  | "guided_question"
  | "mini_explanation"
  | "worked_example"
  | "hint_ladder"
  | "contrast_prompt"
  | "mixed";

export type VideoPedagogicalRole =
  | "micro_explanation"
  | "narrated_walkthrough"
  | "concept_animation"
  | "compare_contrast_video"
  | "prompt_video";

export type InteractivePedagogicalRole =
  | "manipulate_and_predict"
  | "order_and_explain"
  | "label_and_compare"
  | "simulate_and_infer";

export type HintPolicy =
  | "none"
  | "available_on_request"
  | "staged"
  | "built_in";

export type Tone = "neutral" | "encouraging" | "challenging" | "calm";
export type Verbosity = "low" | "medium" | "high";
export type Pacing = "slow" | "normal" | "fast";
export type LanguageStyle = "plain" | "technical" | "metaphorical";

export type MotivationStrategy =
  | "supportive"
  | "challenge_based"
  | "curiosity_based"
  | "relevance_based";

export type VisualComplexity = "minimal" | "moderate" | "rich";
export type VisualStylePreference =
  | "clean_educational"
  | "cinematic"
  | "playful"
  | "diagrammatic";

export type SingleShotVsSequence = "single_shot" | "multi_shot";

export type InteractionType =
  | "drag_drop"
  | "slider_manipulation"
  | "step_ordering"
  | "clickable_state_change"
  | "graph_match"
  | "multi_stage";

export type CognitiveOperation =
  | "predict"
  | "classify"
  | "compare"
  | "transform"
  | "construct"
  | "troubleshoot";

export type Statefulness = "single_step" | "multi_step";

export type FeedbackTiming = "none" | "after_submit" | "stepwise" | "adaptive";

export type OutputForm =
  | "guided_question"
  | "mini_explanation"
  | "worked_example"
  | "hint_ladder"
  | "contrast_prompt"
  | "mixed";

export type AnswerRevealPolicy =
  | "do_not_reveal"
  | "partial_reveal"
  | "reveal_after_attempt";

export type ClosingAction =
  | "ask_for_prediction"
  | "ask_for_explanation"
  | "ask_for_choice"
  | "ask_for_transformation";

export type LengthBucket = "short" | "medium" | "long";

export type UploadedContentType =
  | "document"
  | "audio"
  | "video"
  | "image"
  | "other";

export type LearningSourceKind =
  | "uploaded_document"
  | "course_material"
  | "manual_notes"
  | "web_excerpt"
  | "trusted_public_reference"
  | "human_reviewed_reference"
  | "generated_text"
  | "unknown";

export type LearningSourceRightsScope =
  | "user_uploaded_private"
  | "public_reference"
  | "internal_reviewed"
  | "generated_ephemeral"
  | "unknown";

export type LearningSourceTrustLevel =
  | "human_reviewed"
  | "trusted_public"
  | "user_provided"
  | "learner_notes"
  | "unverified_public"
  | "model_generated"
  | "unknown";

export type LearningSourceProcessingStatus =
  | "raw"
  | "normalized"
  | "chunked"
  | "indexed"
  | "rejected";

export interface LearningSourceReference {
  source_id: EntityId;
  source_kind: LearningSourceKind;
  source_title: string;
  rights_scope: LearningSourceRightsScope;
  trust_level: LearningSourceTrustLevel;
  summary: Nullable<string>;
}

export interface LearningSourceChunkReference {
  source_id: EntityId;
  chunk_id: EntityId;
  source_title: string;
  chunk_index: number;
  summary: Nullable<string>;
}

export type ProbeAuthoringMode =
  | "source_grounded_text_explanation"
  | "source_grounded_multiple_choice_candidate"
  | "source_grounded_ordering_candidate"
  | "source_grounded_drag_drop_candidate"
  | "source_grounded_graph_candidate"
  | "low_stakes_reflection_probe"
  | "not_authorable";

export type ProbeAuthoringReadiness =
  | "not_ready"
  | "low_stakes_only"
  | "candidate_ready"
  | "trusted_ready";

export type RenderState = {
  /**
   * Visible sphere radius. This controls the rendered body size.
   */
  radius: number;

  /**
   * Minimum world-space clearance the layout/renderer should reserve for this topic.
   * This can be larger than radius because local bobbing, rings, probe markers,
   * labels, and satellites may occupy visual space beyond the sphere.
   */
  collision_radius: number;

  surface_noise: number;

  /**
   * Smoothness/coherence proxy for the stable topic body.
   * Higher values should look calmer and more coherent.
   */
  smoothness: number;

  spin_rate: number;
  saturation: number;
  is_star: boolean;

  /**
   * Glow is separate from saturation so insight/coherence can brighten a topic
   * without turning topic hue into a semantic category.
   */
  glow_intensity: number;
  glow_source: "insight" | "star_state" | "focus" | "none";
};

/* ------------------------------------------------------------------ */
/* SEMANTIC TOPIC ROUTING */
/* ------------------------------------------------------------------ */

export type TopicRoutingDecisionKind =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "create_and_link"
  | "clarify_topic_intent"
  | "no_decision";

export type TopicRoutingRouterVersion =
  | "legacy"
  | "topic-router-v2"
  | "semantic-centroid-v3";

export type TopicRoutingPolicyPath =
  | "strong_centroid_match"
  | "medium_centroid_match_with_gap"
  | "active_topic_tiny_followup"
  | "all_centroid_matches_weak_create_new"
  | "exact_existing_topic_match"
  | "create_and_link_to_related_topic"
  | "ambiguous_centroid_competition"
  | "missing_message_embedding"
  | "missing_topic_centroids"
  | "legacy_fallback"
  | "no_decision";

export interface TopicRoutingThresholds {
  strong_centroid_match: number;
  medium_centroid_match: number;
  weak_centroid_match: number;
  min_similarity_gap: number;
  active_followup_match: number;
  create_new_below: number;
}

export interface TopicRoutingCandidateEvidence {
  topic_id: EntityId;
  topic_label: string;
  similarity: number;
  rank: number;
  embedding_count: Nullable<number>;
  embedding_model: Nullable<string>;
}

export interface TopicRoutingDebug {
  router_version: TopicRoutingRouterVersion;
  decision_kind: TopicRoutingDecisionKind;
  policy_path: TopicRoutingPolicyPath;

  selected_topic_id: Nullable<EntityId>;
  selected_topic_label: Nullable<string>;
  new_topic_label: Nullable<string>;

  active_topic_id: Nullable<EntityId>;
  active_topic_label: Nullable<string>;

  best_topic_id: Nullable<EntityId>;
  best_topic_label: Nullable<string>;
  best_similarity: Nullable<number>;

  second_topic_id: Nullable<EntityId>;
  second_topic_label: Nullable<string>;
  second_similarity: Nullable<number>;

  active_topic_similarity: Nullable<number>;
  similarity_gap: Nullable<number>;

  top_candidates: TopicRoutingCandidateEvidence[];

  message_embedding_available: boolean;
  message_embedding_model: Nullable<string>;
  topic_centroids_available: number;
  topic_count_considered: number;

  thresholds: Nullable<TopicRoutingThresholds>;
  reasons: string[];
}

export interface TopicCentroidUpdateDebug {
  topic_id: EntityId;
  previous_embedding_count: number;
  new_embedding_count: number;
  update_method: "initialize" | "running_average" | "ema" | "none";
  alpha: Nullable<number>;
  embedding_model: Nullable<string>;
  updated_at: ISO8601String;
}

export interface TopicRoutingState {
  router_version: TopicRoutingRouterVersion;
  decision_kind: TopicRoutingDecisionKind;
  policy_path: TopicRoutingPolicyPath;

  selected_topic_id: Nullable<EntityId>;
  selected_topic_label: Nullable<string>;
  new_topic_label: Nullable<string>;

  confidence: number;
  reasons: string[];

  vector_info: VectorInfo;
  debug: TopicRoutingDebug;

  centroid_update: Nullable<TopicCentroidUpdateDebug>;
}

/* ------------------------------------------------------------------ */
/* IMPORTANT RUN INPUTS */
/* ------------------------------------------------------------------ */

export interface UserMessageInput {
  message_id: Nullable<EntityId>;
  timestamp: Nullable<ISO8601String>;
  content: string;
}

export interface ModelSignals {
  model_confusion: Nullable<number>;
  model_insight: Nullable<number>;
  model_version: Nullable<string>;
  inference_mode: Nullable<ModelInferenceMode>;
  latency_ms: Nullable<number>;
  status: Nullable<ModelSignalStatus>;
  error_message: Nullable<string>;
}

export interface CurrentInteractionContext {
  run_kind: RunKind;
  is_response_to_delivered_probe: Nullable<boolean>;
  prior_mode_selected: Nullable<InterventionMode>;
  prior_probe_was_applicable: Nullable<boolean>;
  prior_probe_id: Nullable<EntityId>;
  prior_mode_outcome_available: Nullable<boolean>;
}

export interface AttemptDeliveryContext {
  renderer_type: Nullable<string>;
  generator: Nullable<string>;
  modality: Nullable<string>;
  tone: Nullable<string>;
  pacing: Nullable<string>;
  language_style: Nullable<string>;
  context_framing: Nullable<string>;
}

export interface AttemptSubmissionMetadata {
  latency_ms: Nullable<number>;
  revision_count: Nullable<number>;
  used_hint: Nullable<boolean>;
  requested_clarification_before_answering: Nullable<boolean>;
}

export interface NewAttemptInput {
  status: AttemptStatus;
  attempt_id: Nullable<EntityId>;
  timestamp: Nullable<ISO8601String>;
  originating_run_id: Nullable<EntityId>;
  source_message_id: Nullable<EntityId>;
  linked_probe_id: Nullable<EntityId>;
  linked_stimulus_id: Nullable<EntityId>;
  linked_topic_id: Nullable<EntityId>;
  linked_cluster_id: Nullable<EntityId>;
  linked_resolution_contract_id: Nullable<EntityId>;
  response_type: Nullable<AttemptResponseType>;
  completion_status: Nullable<AttemptCompletionStatus>;
  raw_response: string | Record<string, unknown> | null;
  delivery_context: AttemptDeliveryContext;
  submission_metadata: AttemptSubmissionMetadata;
}

export interface VectorInfo {
  top_k_topic_labels: string[];
  top_k_topic_ids: string[];
  top_k_similarity_scores: number[];
}

export interface UploadedContentReference {
  content_id: EntityId;
  content_type: UploadedContentType;
  source_name: string;
  summary: Nullable<string>;

  /**
   * Optional bridge to the source-processing layer. During migration, uploaded
   * content may exist before it has been normalized into learning sources.
   */
  normalized_source_id?: Nullable<EntityId>;
  normalized_chunk_ids?: EntityId[];
}

export interface ImportantRunInputs {
  user_message: UserMessageInput;
  model_signals: ModelSignals;
  current_interaction_context: CurrentInteractionContext;
  new_attempt: NewAttemptInput;
  vector_info: VectorInfo;
  uploaded_content: UploadedContentReference[];
}

/* ------------------------------------------------------------------ */
/* INTERVENTION MODE DECISION */
/* ------------------------------------------------------------------ */

export interface InterventionSignalSummary {
  raw_response_signal: Nullable<number>;
  evidence_quality_signal: Nullable<number>;
  active_problem_signal: Nullable<number>;
  readiness_signal: Nullable<number>;
  history_signal: Nullable<number>;
}

export interface InterventionModeDecision {
  mode_selected: InterventionMode;
  target_topic_id: Nullable<EntityId>;
  active_diagnosis: Nullable<DiagnosisType>;
  primary_block: Nullable<string>;
  decision_confidence: number;
  decision_reasons: string[];
  clarify_score: number;
  probe_score: number;
  signal_summary: InterventionSignalSummary;
}

export interface PreviousModeOutcome {
  mode_selected: InterventionMode;
  reasons: string[];
  confidence: number;
  clarify_outcome: PreviousClarifyOutcome;
}

/* ------------------------------------------------------------------ */
/* PROBE PLAN */
/* ------------------------------------------------------------------ */

export interface RendererRequest {
  preferred_modality: Nullable<RendererModality>;
  preferred_generator: Nullable<RendererGenerator>;
  allowed_modalities: RendererModality[];
  allowed_generators: RendererGenerator[];
  fallback_renderer_order: RendererModality[];
  must_preserve_probe_intent: boolean;
  must_match_requested_modality: boolean;
  allow_null_delivery_on_failure: boolean;
}

export interface JudgingSupport {
  rubric_notes: string[];
  evidence_type_expected: Array<
    "predict" | "explain" | "discriminate" | "apply_transfer"
  >;
  response_features_to_extract: string[];
  target_misconceptions: string[];
  success_indicators: string[];
  failure_indicators: string[];
}

export interface SharedContentSelection {
  source_mode: Nullable<ContentSourceMode>;
  selected_concepts: string[];
  selected_examples: string[];
  selected_contrasts: string[];
  selected_misconceptions: string[];
  selected_context: Nullable<string>;
}

export interface SharedScaffolding {
  hint_policy: Nullable<HintPolicy>;
  max_hint_steps: Nullable<number>;
  allow_partial_credit: Nullable<boolean>;
  allow_retry: Nullable<boolean>;
  max_retries: Nullable<number>;
}

export interface TextPersonalizationApplication {
  tone: Nullable<Tone>;
  verbosity: Nullable<Verbosity>;
  pacing: Nullable<Pacing>;
  language_style: Nullable<LanguageStyle>;
  context_framing: Nullable<string>;
  motivation_strategy: Nullable<MotivationStrategy>;
  adaptation_reasons: string[];
}

export interface VideoPersonalizationApplication {
  tone: Nullable<Tone>;
  pacing: Nullable<Pacing>;
  language_style: Nullable<LanguageStyle>;
  context_framing: Nullable<string>;
  visual_complexity: Nullable<VisualComplexity>;
  visual_style_preference: Nullable<VisualStylePreference>;
  adaptation_reasons: string[];
}

export interface InteractivePersonalizationApplication {
  tone: Nullable<Tone>;
  pacing: Nullable<Pacing>;
  interaction_density: Nullable<"low" | "medium" | "high">;
  adaptation_reasons: string[];
}

export interface TextMeasurementIntent {
  what_response_should_reveal: string[];
  what_would_count_as_progress: string[];
}

export interface VideoMeasurementIntent {
  what_response_should_reveal: string[];
  what_visual_takeaway_should_precede_response: string[];
}

export interface InteractiveMeasurementIntent {
  telemetry_to_watch: Array<
    "latency" | "revision_count" | "hint_usage" | "error_pattern"
  >;
  what_response_should_reveal: string[];
}

export interface TextPlan {
  status: TextPlanStatus;
  pedagogical_role: Nullable<TextPedagogicalRole>;
  diagnostic_goal: Nullable<string>;
  instructional_goal: Nullable<string>;
  why_text: string[];
  content_selection: SharedContentSelection;
  scaffolding: SharedScaffolding;
  personalization_application: TextPersonalizationApplication;
  measurement_intent: TextMeasurementIntent;
}

export interface VideoVisualLearningGoal {
  what_the_learner_should_notice_first: string[];
  what_should_change_over_time: string[];
  what_should_remain_fixed: string[];
  target_visual_contrast: string[];
}

export interface VideoStoryboardIntent {
  shot_count: Nullable<number>;
  single_shot_vs_sequence: Nullable<SingleShotVsSequence>;
  timing_beats: string[];
  pause_for_attempt: Nullable<boolean>;
  pause_goal: Nullable<string>;
  must_stop_before_full_answer: Nullable<boolean>;
}

export interface VideoPlan {
  status: VideoPlanStatus;
  pedagogical_role: Nullable<VideoPedagogicalRole>;
  diagnostic_goal: Nullable<string>;
  instructional_goal: Nullable<string>;
  why_video: string[];
  visual_learning_goal: VideoVisualLearningGoal;
  content_selection: SharedContentSelection;
  storyboard_intent: VideoStoryboardIntent;
  personalization_application: VideoPersonalizationApplication;
  measurement_intent: VideoMeasurementIntent;
}

export interface InteractiveTaskModel {
  interaction_type: Nullable<InteractionType>;
  cognitive_operation: Nullable<CognitiveOperation>;
  statefulness: Nullable<Statefulness>;
}

export interface InteractiveScaffolding extends SharedScaffolding {
  feedback_timing: Nullable<FeedbackTiming>;
}

export interface InteractivePlan {
  status: InteractivePlanStatus;
  pedagogical_role: Nullable<InteractivePedagogicalRole>;
  diagnostic_goal: Nullable<string>;
  instructional_goal: Nullable<string>;
  why_interactive: string[];
  task_model: InteractiveTaskModel;
  scaffolding: InteractiveScaffolding;
  personalization_application: InteractivePersonalizationApplication;
  measurement_intent: InteractiveMeasurementIntent;
}

export interface TextPayloadPersonalizationSnapshot {
  tone: Nullable<string>;
  verbosity: Nullable<string>;
  pacing: Nullable<string>;
  language_style: Nullable<string>;
  context_framing: Nullable<string>;
}

export interface TextPayloadRenderingContract {
  output_form: Nullable<OutputForm>;
  answer_reveal_policy: Nullable<AnswerRevealPolicy>;
  closing_action: Nullable<ClosingAction>;
  max_length: Nullable<LengthBucket>;
}

export interface TextPayload {
  ready_to_send: boolean;
  api: Nullable<"responses">;
  model: Nullable<string>;
  instructions: Nullable<string>;
  input: Nullable<string>;
  personalization_snapshot: TextPayloadPersonalizationSnapshot;
  rendering_contract: TextPayloadRenderingContract;
}

export interface VideoPayload {
  ready_to_send: boolean;
  api: Nullable<"videos">;
  endpoint: Nullable<"/v1/videos">;
  model: "sora-2" | "sora-2-pro" | null;
  size: Nullable<string>;
  seconds: Nullable<4 | 8 | 12 | 16 | 20>;
  prompt: Nullable<string>;
  narration: Nullable<string>;
  visual_constraints: string[];
}

export interface InteractivePayload {
  ready_to_send: boolean;
  renderer: "custom" | null;
  task_type: Nullable<string>;
  prompt: Nullable<string>;
  config: Record<string, unknown> | null;
}

/**
 * JSON-safe snapshot of the richer engine-side Probe Contract V1.
 *
 * The canonical contract types live in lib/engine/probes. This shape stays
 * intentionally loose inside the public runtime contract so types/contracts.ts
 * does not need to import engine modules and create a circular type dependency.
 */
export interface ProbeContractSnapshot {
  contract_id?: EntityId;
  version?: string;
  created_at?: ISO8601String;

  target_topic_id?: Nullable<EntityId>;
  target_topic_label?: string;
  target_diagnosis?: Nullable<DiagnosisType>;

  intent?: Nullable<ProbeIntent>;
  probe_type?: Nullable<ProbeType>;
  renderer_kind?: string;
  assessment_target?: string;
  difficulty?: string;

  input_schema?: Record<string, unknown> | null;
  judging_schema?: Record<string, unknown> | null;
  renderer_config?: Record<string, unknown> | null;

  diagnosis_state_snapshot?: Record<string, unknown> | null;

  reasons?: string[];
  cautions?: string[];

  [key: string]: unknown;
}

export interface ProbePlan {
  status: ProbePlanStatus;
  probe_id: EntityId;
  target_topic_id: Nullable<EntityId>;
  target_diagnosis: Nullable<DiagnosisType>;
  intent: Nullable<ProbeIntent>;
  probe_type: Nullable<ProbeType>;
  expected_response_type: Nullable<ProbeExpectedResponseType>;

  renderer_request: RendererRequest;
  judging_support: JudgingSupport;

  text_plan: TextPlan;
  video_plan: VideoPlan;
  interactive_plan: InteractivePlan;

  text_payload: TextPayload;
  video_payload: VideoPayload;
  interactive_payload: InteractivePayload;

  /**
   * Optional Probe Contract V1 snapshot.
   *
   * This lets the runtime carry "what this probe is measuring" alongside the
   * older renderer-specific plan fields while we migrate toward richer
   * interactive probes and contract-based judging.
   */
  probe_contract_snapshot: Nullable<ProbeContractSnapshot>;
}

/* ------------------------------------------------------------------ */
/* DELIVERED RESPONSE */
/* ------------------------------------------------------------------ */

export interface DeliveredLearnerMessage {
  text: string;
  tone: Nullable<string>;
  mode: InterventionMode;
}

export interface DeliveredProbe {
  probe_id: EntityId;
  target_topic_id: Nullable<EntityId>;
  target_diagnosis?: Nullable<DiagnosisType>;
  intent?: Nullable<ProbeIntent>;
  probe_type?: Nullable<ProbeType>;

  renderer_type: Nullable<string>;
  generator: Nullable<string>;
  modality: Nullable<string>;

  title: Nullable<string>;
  instructions: Nullable<string>;

  actual_tone: Nullable<string>;
  actual_pacing: Nullable<string>;
  actual_language_style: Nullable<string>;
  actual_context_framing: Nullable<string>;

  expected_response_type: Nullable<ProbeExpectedResponseType>;

  /**
   * Optional copy of the plan's probe contract snapshot for frontend/debug
   * surfaces. During migration this may be absent on older delivered probes.
   */
  probe_contract_snapshot?: Nullable<ProbeContractSnapshot>;

  stimulus_id: Nullable<EntityId>;
  payload_snapshot: Record<string, unknown> | null;
}

export interface DeliveredResponse {
  learner_message: DeliveredLearnerMessage;
  delivered_probe: DeliveredProbe | null;
}

/* ------------------------------------------------------------------ */
/* JUDGED ATTEMPTS */
/* ------------------------------------------------------------------ */

export type StimulusModality =
  | "text"
  | "diagram"
  | "video"
  | "audio"
  | "simulation"
  | "interactive";

export type StimulusSource = "static" | "generated";
export type StimulusGenerator = "chatgpt" | "sora" | "tts" | null;

export type ConfidenceAlignment =
  | "overconfident"
  | "underconfident"
  | "aligned";

export type AttemptOutcomeClassification =
  | "success"
  | "near_miss"
  | "structural_failure"
  | "guess"
  | "no_response";

export type AttemptOutcomeRole = "diagnostic" | "verification";

export interface JudgedAttemptStimulus {
  stimulus_id: Nullable<EntityId>;
  modality: StimulusModality;
  source: StimulusSource;
  generator: StimulusGenerator;
  constraints: string[];
}

export interface JudgedAttemptRenderer {
  renderer_type: string;
  personalization_applied: {
    tone: Nullable<string>;
    verbosity: Nullable<string>;
    pacing: Nullable<string>;
    language_style: Nullable<string>;
    context_framing: Nullable<string>;
  };
}

export interface JudgedAttemptRawResponse {
  type: "text" | "choice" | "ordering" | "state" | "none";
  value: string | Record<string, unknown> | null;
}

export interface JudgedAttemptFeatures {
  correctness: Nullable<number>;
  error_types: string[];
  explanation_quality: Nullable<number>;
  transfer_distance: Nullable<number>;
  confidence_alignment: Nullable<ConfidenceAlignment>;
  mental_model_inferred: Nullable<string>;
  struggle_type: Nullable<string>;
  evidence_strength: Nullable<number>;
  judgment_confidence: Nullable<number>;
  missing_elements: Nullable<string>;
  misconception_tags: string[];
}

export interface DiagnosisDelta {
  recall_gap: number;
  representation_gap: number;
  procedure_gap: number;
  discrimination_gap: number;
  transfer_gap: number;
}

export interface JudgedAttemptOutcome {
  classification: AttemptOutcomeClassification;
  role: AttemptOutcomeRole;
}

export interface JudgedAttempt {
  attempt_id: EntityId;
  timestamp: ISO8601String;
  topic_id: EntityId;
  probe_id: Nullable<EntityId>;
  stimulus: JudgedAttemptStimulus;
  renderer: JudgedAttemptRenderer;
  raw_response: JudgedAttemptRawResponse;
  features: JudgedAttemptFeatures;
  mental_model_hypothesis_ids: string[];
  outcome: JudgedAttemptOutcome;
  diagnosis_delta: DiagnosisDelta;
}

/* ------------------------------------------------------------------ */
/* ENGINE FUEL - PHASE 2 PRACTICAL SHAPE */
/* ------------------------------------------------------------------ */

export interface TopicEmbeddingSummary {
  available: boolean;
  dimension: number;
  count: number;
  model: Nullable<string>;
  updated_at: Nullable<ISO8601String>;

  /**
   * First five numeric components of the full embedding centroid.
   * The full embedding remains backend-only; this preview is intentionally
   * small so normal client responses stay lightweight while still inspectable.
   */
  preview: number[];
}

export interface TopicState {
  topic_id: EntityId;
  topic_label: string;
  topic_confusion_average: number;
  topic_insight_average: number;
  topic_learning_score: number;
  topic_learning_velocity: number;
  topic_novelty_score: number;
  topic_message_count: number;
  topic_difficulty: number;
  topic_decay_rate: number;
  topic_link_threshold: number;
  topic_last_update: ISO8601String;

  /**
   * Visual / spatial centroid used by the 3D learning-space renderer.
   * This is NOT the semantic embedding centroid.
   *
   * Kept as topic_centroid for backward compatibility with current route/output.
   * Long-term rename candidate: topic_position or topic_visual_centroid.
   */
  topic_centroid: [number, number, number];

  /**
   * Lightweight client-facing summary of the canonical embedding of the clean
   * topic label. The full vector is intentionally not included in engine_fuel.
   */
  topic_label_embedding: TopicEmbeddingSummary;

  /**
   * Lightweight client-facing summary of the topic-level learner-message
   * embedding. The full vector is intentionally not included in engine_fuel.
   */
  topic_message_embedding: TopicEmbeddingSummary;

  /**
   * Deprecated client-facing full-vector fields.
   *
   * Full embedding vectors should remain in Supabase/backend RouteTopic state
   * and persistence layers, not in normal /api/message responses.
   */
  topic_label_embedding_centroid?: never;
  topic_label_embedding_count?: never;
  topic_label_embedding_model?: never;
  topic_label_embedding_updated_at?: never;
  topic_message_embedding_centroid?: never;
  topic_message_embedding_count?: never;
  topic_message_embedding_model?: never;
  topic_message_embedding_updated_at?: never;
}

export interface ClusterState {
  cluster_id: EntityId;
  cluster_label: string;
  cluster_confusion_average: number;
  cluster_confusion_variance: number;
  cluster_insight_average: number;
  cluster_insight_variance: number;
  cluster_learning_score: number;
  cluster_learning_velocity: number;
  cluster_density: number;
  cluster_message_count: number;
  cluster_size: number;
  cluster_creation_date: ISO8601String;
  cluster_last_update: ISO8601String;
  list_of_clustered_topics: EntityId[];
  cluster_centroid: [number, number, number];

  /**
   * Optional future semantic centroid for cluster-level routing/retrieval.
   * Not required for the first semantic topic router pass.
   */
  cluster_embedding_centroid?: Nullable<EmbeddingVector>;
  cluster_embedding_count?: number;
  cluster_embedding_model?: Nullable<string>;
  cluster_embedding_updated_at?: Nullable<ISO8601String>;
}

export interface LinkedPair {
  topic1: EntityId;
  topic2: EntityId;
  raw_previous_similarity: number;
  decayed_previous_similarity: number;
  new_similarity: number;
  previous_link_threshold: number;
  new_link_threshold: number;
  link_reason: string;
}

export interface EngineFuel {
  intervention_mode_decision: InterventionModeDecision;
  previous_mode_outcome: PreviousModeOutcome;
  probe_plan: ProbePlan;

  /**
   * Optional during migration.
   * Once semantic centroid routing is fully wired, this can become required.
   */
  topic_routing?: TopicRoutingState;

  topics: TopicState[];
  clusters: ClusterState[];
  linked_pairs: LinkedPair[];

  attempts: JudgedAttempt[];
}

/* ------------------------------------------------------------------ */
/* LEARNING SPACE */
/* ------------------------------------------------------------------ */

export type TopicPositionSource =
  | "topic_position"
  | "semantic_position"
  | "topic_json"
  | "deterministic_fallback";

export type LearningSpaceRelationshipType =
  | "semantic"
  | "shared_confusion"
  | "prerequisite"
  | "strategy"
  | "temporal";

export type LearningSpaceRelationshipVisualStyle =
  | "arc"
  | "thread"
  | "arrow"
  | "halo"
  | "trail";

export type LearningSpaceViewpointType =
  | "overview"
  | "semantic_neighborhood"
  | "confusion_alignment"
  | "prerequisite_chain"
  | "bridge"
  | "growth_path";

export interface LearningSpaceRelationshipBasis {
  similarity: Nullable<number>;
  normalized_similarity: Nullable<number>;
  desired_distance: Nullable<number>;
  actual_distance: Nullable<number>;
  diagnostic_method: Nullable<string>;
}

export interface LearningSpaceRelationshipDisplayPolicy {
  show_in_overview: boolean;
  show_on_focus: boolean;
  max_opacity: number;
  visual_style: LearningSpaceRelationshipVisualStyle;
  priority: number;
}

export interface LearningSpaceRelationship {
  relationship_id: EntityId;
  source_topic_id: EntityId;
  target_topic_id: EntityId;
  relationship_type: LearningSpaceRelationshipType;

  /**
   * Strength is continuous and relationship-specific. For semantic links it is
   * generally derived from embedding similarity.
   */
  strength: number;

  /**
   * Confidence reflects evidence quality, not relationship strength.
   */
  confidence: number;

  evidence_source: string[];
  evidence_summary: Nullable<string>;
  basis: LearningSpaceRelationshipBasis;
  display_policy: LearningSpaceRelationshipDisplayPolicy;
}

export interface LearningSpaceViewpointCamera {
  position: Nullable<[number, number, number]>;
  target: Nullable<[number, number, number]>;
  up: Nullable<[number, number, number]>;
  distance: Nullable<number>;
}

export interface LearningSpaceViewpoint {
  viewpoint_id: EntityId;
  viewpoint_type: LearningSpaceViewpointType;
  label: string;
  intent: string;
  focus_topic_ids: EntityId[];
  relationship_ids: EntityId[];
  camera: LearningSpaceViewpointCamera;
  relationship_filter: {
    relationship_types: LearningSpaceRelationshipType[];
    max_visible_relationships: number;
  };
  explanation: Nullable<string>;
}

export interface LearningSpaceProjectionMetadata {
  projection_id: EntityId;
  projection_method: string;
  dimensionality: 2 | 3;
  relationship_basis: string[];
  generated_at: Nullable<ISO8601String>;
  confidence: Nullable<number>;
  notes: string[];
}

export interface LearningSpaceTopicLayout {
  position_source: TopicPositionSource;
  semantic_position: Nullable<[number, number, number]>;
  semantic_position_method: Nullable<string>;
  semantic_position_updated_at: Nullable<ISO8601String>;
}

export interface LearningSpaceSatellite {
  satellite_id: EntityId;
  orbit_angle: number;
  linked_attempt_id: Nullable<EntityId>;
}

export interface LearningSpaceTopic {
  topic_id: EntityId;
  topic_label: string;

  /**
   * Renderer-safe current committed visual position.
   */
  position: [number, number, number];

  /**
   * Layout metadata for debugging and future animation/commit behavior.
   * The renderer may inspect this, but it should not become the source of truth.
   */
  layout: LearningSpaceTopicLayout;

  render_state: RenderState;

  satellite_count: number;
  satellites: LearningSpaceSatellite[];
}

export interface LearningSpaceCluster {
  cluster_id: EntityId;

  /**
   * Optional compatibility label for older API/debug surfaces. The renderer-safe
   * learning-space contract does not require a cluster label, but routes may
   * still include one when available.
   */
  cluster_label?: string;

  cluster_centroid: [number, number, number];
  member_topic_ids: EntityId[];
}

export interface LearningSpace {
  space_version: "v1";
  topics: LearningSpaceTopic[];
  clusters: LearningSpaceCluster[];
  relationships: LearningSpaceRelationship[];
  viewpoints: LearningSpaceViewpoint[];
  projection: LearningSpaceProjectionMetadata;
}

/* ------------------------------------------------------------------ */
/* TOP-LEVEL RUNTIME RESULT */
/* ------------------------------------------------------------------ */

export interface RunMetadata {
  run_id: EntityId;
  timestamp: ISO8601String;
  engine_version: string;
  previous_run_id: Nullable<EntityId>;
  topic_count: number;
  cluster_count: number;
  linked_pair_count: number;
}

export interface MyWayRunResult {
  run_metadata: RunMetadata;
  important_run_inputs: ImportantRunInputs;
  engine_fuel: EngineFuel;
  delivered_response: DeliveredResponse;
  learning_space: LearningSpace;
}

/* ------------------------------------------------------------------ */
/* FRONTEND-FACING ROUTE PAYLOADS */
/* ------------------------------------------------------------------ */

export interface MessageRouteRequest {
  messageText: string;
  activeTopicId?: Nullable<EntityId>;
  selectedClusterId?: Nullable<EntityId>;
  viewportContext?: {
    focusedTopicId?: Nullable<EntityId>;
    selectedTopicId?: Nullable<EntityId>;
    activeTopicIdForMessage?: Nullable<EntityId>;
  };
}

export interface ProbeSubmitRouteRequest {
  probeId: EntityId;
  topicId: EntityId;
  response: string | Record<string, unknown>;
  submittedAt: ISO8601String;
  deliveryContext?: Partial<AttemptDeliveryContext>;
}

export interface FrontendSceneUpdate {
  target_topic_id: Nullable<EntityId>;
  camera_destination_topic_id: Nullable<EntityId>;
  arrival_mode: "warp" | "focus" | "none";
  learning_space: LearningSpace;
}

export interface FrontendTopicMetricUpdate {
  topicId: EntityId;
  confusion?: number;
  insight?: number;
  learningScore?: number;
}

export interface FrontendInterventionSummary {
  mode_selected: InterventionMode;
  target_topic_id: Nullable<EntityId>;
  active_diagnosis: Nullable<DiagnosisType>;

  /**
   * During migration, some client paths still use "available" / "not_applicable"
   * while newer route code may prefer boolean.
   */
  probe_available: boolean | "available" | "not_applicable";

  status_label: string;
  suggested_action: string;
}

export interface MessageRouteResponse {
  result: MyWayRunResult;
  scene_update: FrontendSceneUpdate;
  intervention: FrontendInterventionSummary;
}

export interface ProbeSubmitRouteResponse {
  result: MyWayRunResult;
  scene_update: FrontendSceneUpdate;
  continue_probe_loop: boolean;
  next_probe: DeliveredProbe | null;
  updated_topic_metrics?: FrontendTopicMetricUpdate;
}