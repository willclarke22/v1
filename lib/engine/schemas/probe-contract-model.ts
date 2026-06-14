import type {
  AnswerKey,
  BridgeLevel,
  ConfidenceScore,
  DiagnosisLabel,
  EvaluatedProbeAttemptSignal,
  LanguagePolicy,
  MisconceptionMarker,
  PersonalizationProfileSnapshot,
  PresentationStyle,
  PresentationSupport,
  ProbeAttemptType,
  ProbeDeliveryContext,
  ProbePrompt,
  ProbeType,
  RendererParams,
} from "./shared";

export type ProbeContractModelInput = {
  schema_version: "probe_contract_model_input_v1";

  target_topic: {
    topic_id?: string | null;
    topic_label: string;
  };

  target_diagnosis: DiagnosisLabel;

  learner_signal:
    | {
        signal_kind: "user_message";
        user_message: string | null;
      }
    | {
        signal_kind: "evaluated_probe_attempt";
        evaluated_probe_attempt: EvaluatedProbeAttemptSignal;
      };

  personalization_context?: {
    bridge_level: BridgeLevel;

    // bridge_0 should normally set language_policy.jargon_level = "none".
    language_policy: LanguagePolicy;

    preferred_style?: PresentationStyle | null;

    // preferred_order takes priority over preferred_style when confidence is strong.
    preferred_order?: PresentationStyle[];
    preferred_order_confidence?: ConfidenceScore | null;

    user_interests?: Array<{
      interest: string;
      user_interest_confidence: ConfidenceScore;
    }>;

    // Compact profile summary that helps the Probe Contract Model choose
    // tasteful teaching moves without overusing personal details.
    profile_snapshot?: PersonalizationProfileSnapshot | null;
  } | null;
};

export type ProbeContractModelOutput = {
  schema_version: "probe_contract_model_output_v1";

  probe_type: ProbeType;
  expected_attempt_type: ProbeAttemptType;

  prompt: ProbePrompt;

  presentation_support?: PresentationSupport[];

  answer_key?: AnswerKey | null;

  misconception_markers: MisconceptionMarker[];

  renderer_params?: RendererParams | null;

  // Optional record of what teaching moves the generated probe used.
  // This can be passed into the Probe Attempt Evaluator so outcome evidence can
  // become a cautious personalization delta.
  delivery_context?: ProbeDeliveryContext | null;

  // Confidence that this probe contract is usable, aligned, and valid.
  confidence: ConfidenceScore;
};

