// -----------------------------------------------------------------------------
// MyWay Engine Shared Schema Types
// -----------------------------------------------------------------------------
//
// These are shared contract types for the new 3-model engine:
//
// 1. Diagnosis Model
// 2. Probe Contract Model
// 3. Probe Attempt Evaluator
//
// MyWay owns orchestration, validation, state, rendering compatibility,
// persistence, trust policy, progression, and personalization profile updates.
// Models provide structured semantic intelligence only.

export type ConfidenceScore = number;

// 0 = not correct / weak evidence
// 1 = fully correct / strong evidence
export type CorrectnessScore = number;

export type DiagnosisLabel =
  | "unknown"
  | "no_gap_detected"
  | "recall_gap"
  | "representation_gap"
  | "procedure_gap"
  | "discrimination_gap"
  | "transfer_gap"
  | "metacognitive_gap";

export type DiagnosisNextAction =
  | "ask_clarifying_question"
  | "generate_probe_contract"
  | "give_feedback"
  | "summarize_progress";

export type AttemptEvaluatorNextAction =
  | "give_feedback"
  | "target_misconception"
  | "generate_followup_probe"
  | "ask_clarifying_question"
  | "summarize_progress";

export type ProbeType =
  | "explain"
  | "discriminate"
  | "apply_transfer"
  | "sequence"
  | "single_choice"
  | "multi_choice"
  | "drag_drop_placements"
  | "predict"
  | "slider"
  | "graph_relationship"
  | "audio_clip_question"
  | "audio_response_question"
  | "video_click_interval"
  | "video_explanation";

export type ProbeAttemptType =
  | "text"
  | "single_choice"
  | "multi_choice"
  | "ordered_items"
  | "drag_drop_placements"
  | "numeric"
  | "graph"
  | "audio_response"
  | "video_click"
  | "none"
  | "unknown";

export type BridgeLevel =
  | "bridge_0"
  | "bridge_1"
  | "bridge_2"
  | "full_bridge";

// bridge_0 should normally use jargon_level: "none".
export type JargonLevel =
  | "none"
  | "light"
  | "standard"
  | "full";

export type LanguagePolicy = {
  jargon_level: JargonLevel;
};

export type PresentationStyle =
  | "plain_direct"
  | "gentle_coaching"
  | "analogy_based"
  | "metaphor_based"
  | "concrete_examples"
  | "step_by_step"
  | "visual_description"
  | "curiosity_question"
  | "real_world_connection";

export type PresentationSupportKind =
  | "analogy"
  | "metaphor"
  | "contrast"
  | "example"
  | "real_world_connection"
  | "visual_description"
  | "step_by_step_frame"
  | "curiosity_hook";

export type PresentationSupport = {
  kind: PresentationSupportKind;
  style_used: PresentationStyle;
  text: string;

  user_interest_used?: string | null;
  confidence?: ConfidenceScore | null;
};

export type ProbePrompt = {
  // Debug/planning: concise root hypothesis, not necessarily shown directly.
  root_problem_explanation: string;

  // Debug/planning: concise instructional plan.
  reshaping_explanation: string;

  // The actual task.
  task: string;

  // Learner-facing prompt. This does the real explanation + probe.
  full_prompt: string;
};

export type AnswerKey = {
  // Optional for now so older minimal contracts can remain valid.
  // Dataset examples should normally provide kind.
  kind?:
    | "single_choice"
    | "multi_choice"
    | "text"
    | "numeric"
    | "ordered_items"
    | "drag_drop_placements"
    | "graph"
    | "audio_clip"
    | "video_click";

  // For single choice, multi choice, or audio clip questions.
  correct_option_id?: string | null;
  correct_option_ids?: string[];
  acceptable_option_ids?: string[];

  // For open-ended text explanation.
  expected_ideas?: string[];
  success_markers?: string[];

  // For prediction probes.
  correct_prediction?: string | number | boolean | null;

  // For sequence probes.
  correct_order?: string[];

  // For drag/drop placement probes.
  correct_placements?: Record<string, string>;

  // For slider, numeric, or numeric prediction probes.
  correct_numeric_range?: {
    min: number;
    max: number;
  } | null;

  // For graph relationship probes.
  correct_graph_features?: string[];

  // For video click interval probes.
  correct_click_interval?: {
    start_seconds: number;
    end_seconds: number;
  } | null;
};

export type MisconceptionMarker = {
  misconception_id: string;
  label: string;

  // Optional pattern/string that can help match an attempt to this misconception.
  marker?: string | null;

  // Optional model-authored explanation for review/data generation.
  description?: string | null;

  confidence?: ConfidenceScore | null;
};

export type UnderstandingEvidence = {
  evidence_strength: ConfidenceScore;

  // True when the attempt supports stable understanding.
  supports_understanding?: boolean;

  // True when the attempt supports an active gap or misconception.
  supports_gap?: boolean;

  // True when the learner got the answer right, but the attempt does not show
  // enough reasoning or transfer to trust the answer as stable understanding.
  may_be_lucky_guess: boolean;

  // Alias used by newer evaluator artifacts. Keep may_be_lucky_guess as the
  // durable MyWay field until validation/state code is updated.
  possible_guess?: boolean;

  // True when MyWay should ask one more related task to verify understanding.
  needs_verification_probe: boolean;

  informational_only?: boolean;

  verification_reason?: string | null;
};

export type RendererParams = {
  options?: Array<{
    id: string;
    label: string;
    text: string;
  }>;

  items?: Array<{
    id: string;
    text: string;
  }>;

  placement_targets?: Array<{
    id: string;
    label: string;
  }>;

  slider?: {
    min: number;
    max: number;
    step?: number;
    unit?: string | null;
  };

  audio?: {
    audio_id?: string | null;
    audio_url?: string | null;
    transcript?: string | null;
  };

  video?: {
    video_id?: string | null;
    video_url?: string | null;
    duration_seconds?: number | null;
    informational_only?: boolean;
  };
};

// -----------------------------------------------------------------------------
// Personalization Types
// -----------------------------------------------------------------------------
//
// Personalization is intentionally lightweight in V1.
//
// The profile is not a biography of the learner. It is a small, data-driven
// summary of teaching moves that appear to help, hurt, or require verification.
// Raw attempt-level details should live in logs/review data, not in the profile.
//
// preference_score convention:
// -1 = strongly avoid
//  0 = neutral / not enough evidence
// +1 = strongly prefer
//
// confidence is separate from preference_score:
// preference_score says direction/strength.
// confidence says how much MyWay should trust that signal.

export type PersonalizationSignalKind =
  | "bridge_level"
  | "jargon_level"
  | "presentation_style"
  | "support_kind"
  | "probe_type"
  | "verification_pattern";

export type PersonalizationSignalDirection =
  | "prefer"
  | "avoid"
  | "verify";

export type PersonalizationSignalScope =
  | "global"
  | "topic"
  | "diagnosis_label"
  | "probe_type";

export type PersonalizationOutcomeTag =
  | "misconception_persisted"
  | "partial_improvement"
  | "strong_local_success"
  | "correct_but_needs_verification"
  | "neutral_or_unclear"
  | "user_correction";

export type PersonalizationUpdateReason =
  | "teaching_move_helped"
  | "teaching_move_did_not_repair"
  | "try_lower_jargon"
  | "try_more_targeted_probe"
  | "avoid_repetition"
  | "needs_verification";

export type PersonalizationSignal = {
  signal_id: string;

  kind: PersonalizationSignalKind;

  // The actual thing being learned.
  // Examples: "bridge_0", "none", "visual_description",
  // "single_choice_success_needs_explanation_followup".
  value: string;

  direction: PersonalizationSignalDirection;

  // scope describes where the signal applies.
  // scope_key identifies the specific topic, diagnosis label, or probe type.
  //
  // Examples:
  // scope: "global", scope_key: null
  // scope: "diagnosis_label", scope_key: "representation_gap"
  // scope: "topic", scope_key: "forces_and_motion"
  // scope: "probe_type", scope_key: "single_choice"
  scope: PersonalizationSignalScope;
  scope_key?: string | null;

  preference_score: number;
  confidence: ConfidenceScore;
  evidence_count: number;

  summary: string;
};

export type ExampleDomainSignalScope =
  | "global"
  | "topic"
  | "diagnosis_label";

export type ExampleDomainSignal = {
  domain: string;

  preference_score: number;
  confidence: ConfidenceScore;
  evidence_count: number;

  // Used to prevent tasteful personalization from becoming repetitive.
  last_used_at?: string | null;
  recent_use_count: number;

  scope: ExampleDomainSignalScope;
  scope_key?: string | null;

  summary: string;
};

export type PersonalizationProfileSnapshot = {
  schema_version: "personalization_profile_snapshot_v1";

  // Short model-readable summary of the profile.
  // This should be enough for the Probe Contract Model to understand the
  // overall personalization direction without reading every old event.
  summary: string;

  teaching_signals: PersonalizationSignal[];

  // Example domains are separated from teaching signals so MyWay can avoid
  // overusing a personal-interest example just because it helped once.
  example_domains: ExampleDomainSignal[];
};

export type PersonalizationSignalUpdate = {
  signal_id: string;

  // Deltas are intentionally self-describing, even when signal_id already
  // exists. This makes logs, review queues, and future training examples easier
  // to inspect without looking up the previous profile snapshot.
  kind: PersonalizationSignalKind;
  value: string;
  direction: PersonalizationSignalDirection;
  scope: PersonalizationSignalScope;
  scope_key?: string | null;

  // Structured tags make profile updates more repeatable while preserving the
  // human-readable summary below.
  outcome_tag: PersonalizationOutcomeTag;
  update_reason: PersonalizationUpdateReason;

  preference_score_delta: number;
  confidence_delta: number;
  evidence_count_delta: number;

  summary: string;
};

export type ExampleDomainUpdate = {
  domain: string;

  // Example-domain deltas are also self-describing because domain usefulness is
  // context-sensitive and should not silently generalize across topics.
  scope: ExampleDomainSignalScope;
  scope_key?: string | null;

  outcome_tag: PersonalizationOutcomeTag;
  update_reason: PersonalizationUpdateReason;

  preference_score_delta: number;
  confidence_delta: number;
  evidence_count_delta: number;

  recent_use_count_delta?: number;
  last_used_at?: string | null;

  summary: string;
};

export type PersonalizationProfileDelta = {
  schema_version: "personalization_profile_delta_v1";

  // Short explanation of what this delta suggests.
  // MyWay should still validate and apply the delta cautiously.
  summary: string;

  teaching_signal_updates?: PersonalizationSignalUpdate[];

  example_domain_updates?: ExampleDomainUpdate[];
};

export type ProbeDeliveryContext = {
  bridge_level: BridgeLevel;
  language_policy: LanguagePolicy;

  presentation_styles_used?: PresentationStyle[];
  support_kinds_used?: PresentationSupportKind[];

  // Example domains are intentionally lightweight strings.
  // Examples: "basketball", "cooking", "maps", "music".
  example_domains_used?: string[];

  // Optional record of which profile signals influenced the delivered probe.
  personalization_signals_used?: Array<{
    signal_id?: string;
    kind: PersonalizationSignalKind | "example_domain";
    value: string;
    confidence?: ConfidenceScore | null;
  }>;
};

export type EvaluatedProbeAttemptSignal = {
  probe: {
    probe_type: ProbeType;
    expected_attempt_type: ProbeAttemptType;
    prompt: ProbePrompt;
    target_diagnosis?: DiagnosisLabel | null;
  };

  attempt: {
    attempt_type: ProbeAttemptType;
    response_summary?: string | null;
  };

  evaluation: {
    correctness: CorrectnessScore;
    correctness_summary: string;

    understanding_evidence: UnderstandingEvidence;

    misconception_hits?: Array<{
      misconception_id: string;
      label?: string | null;
      confidence: ConfidenceScore;
    }>;

    next_action?: AttemptEvaluatorNextAction | null;

    personalization_delta?: PersonalizationProfileDelta | null;
  };
};



