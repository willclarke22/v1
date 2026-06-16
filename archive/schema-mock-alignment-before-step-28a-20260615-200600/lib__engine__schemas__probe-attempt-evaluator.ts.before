import type {
  AnswerKey,
  AttemptEvaluatorNextAction,
  ConfidenceScore,
  CorrectnessScore,
  DiagnosisLabel,
  MisconceptionMarker,
  PersonalizationProfileDelta,
  ProbeAttemptType,
  ProbeDeliveryContext,
  ProbePrompt,
  ProbeType,
  UnderstandingEvidence,
} from "./shared";

export type ProbeAttemptEvaluatorInput = {
  schema_version: "probe_attempt_evaluator_input_v1";

  probe: {
    probe_type: ProbeType;
    expected_attempt_type: ProbeAttemptType;
    prompt: ProbePrompt;
    target_diagnosis?: DiagnosisLabel | null;
  };

  answer_key?: AnswerKey | null;

  attempt: {
    attempt_type: ProbeAttemptType;

    text_response?: string | null;

    selected_option_id?: string | null;
    selected_option_ids?: string[];

    ordered_item_ids?: string[];

    placements?: Record<string, string>;

    numeric_response?: number | null;

    graph_features?: string[];

    audio_response_transcript?: string | null;

    selected_click_seconds?: number | null;

    // Optional learner self-report. This can help detect patterns like:
    // correct but low confidence, or confident but still using a misconception.
    self_reported_confidence?: ConfidenceScore | null;
  };

  misconception_markers?: MisconceptionMarker[];

  // What MyWay actually delivered before this attempt.
  // This lets the evaluator suggest cautious personalization updates based on
  // intervention outcome evidence rather than static preference guesses.
  delivery_context?: ProbeDeliveryContext | null;
};

export type ProbeAttemptEvaluatorOutput = {
  schema_version: "probe_attempt_evaluator_output_v1";

  correctness: CorrectnessScore;

  correctness_summary: string;

  understanding_evidence: UnderstandingEvidence;

  misconception_hits: Array<{
    misconception_id: string;
    confidence: ConfidenceScore;
  }>;

  diagnosis_delta?: Partial<Record<DiagnosisLabel, number>>;

  // Suggested profile update only. MyWay should validate, clamp, and apply this
  // cautiously instead of letting a model directly mutate the durable profile.
  personalization_delta?: PersonalizationProfileDelta | null;

  next_action: AttemptEvaluatorNextAction;
  next_action_confidence: ConfidenceScore;
};

