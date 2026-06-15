import type {
  AttemptResponseType,
  DiagnosisDelta,
  EntityId,
  ISO8601String,
  ModelSignals,
  NewAttemptInput,
  ProbeExpectedResponseType,
  ProbeType,
} from "@/types/contracts";

/**
 * Engine Evidence V1.1
 *
 * This module is modality-aware. Learner evidence may be text, choice,
 * drag/drop, ordering, slider/prediction, audio/video, simulation, or a mixed
 * interaction. The engine should preserve those differences instead of forcing
 * everything into "explanation quality."
 *
 * V1.1 adds explicit normalized structured evidence shapes so deterministic
 * judges can read learner submissions without guessing inside a generic record.
 */

export type EvidenceSourceKind =
  | "probe_attempt"
  | "message"
  | "clarify_response"
  | "review"
  | "unknown";

export type EvidenceModality =
  | "text"
  | "choice"
  | "multiple_choice"
  | "ordering"
  | "drag_drop"
  | "slider"
  | "classification"
  | "prediction"
  | "audio"
  | "video"
  | "interactive_action"
  | "simulation"
  | "mixed"
  | "none"
  | "unknown";

export type EvidenceCompletion =
  | "complete"
  | "partial"
  | "skipped"
  | "abandoned"
  | "unclear";

/**
 * Choice / multiple-choice responses.
 *
 * selected_option_ids is always an array so single-choice and multi-choice
 * probes can use the same deterministic judging path.
 */
export type NormalizedChoiceEvidenceValue = {
  kind: "choice";
  selected_option_ids: EntityId[];
  selected_labels: string[];
  raw_value: unknown;
};

/**
 * Ordering responses.
 *
 * ordered_item_ids should represent the learner's final sequence.
 */
export type NormalizedOrderingEvidenceValue = {
  kind: "ordering";
  ordered_item_ids: EntityId[];
  raw_value: unknown;
};

/**
 * Slider / numeric prediction responses.
 */
export type NormalizedSliderEvidenceValue = {
  kind: "slider";
  value: number | null;
  raw_value: unknown;
};

/**
 * Drag/drop match responses.
 *
 * matches are normalized as item-target pairs so the deterministic judge can
 * compare them against contract.input_schema.correct_matches.
 */
export type NormalizedDragDropEvidenceValue = {
  kind: "drag_drop";
  matches: Array<{
    item_id: EntityId;
    target_id: EntityId;
  }>;
  raw_value: unknown;
};

/**
 * Graph match responses.
 *
 * selected_edge_ids should represent the learner's selected relationship edges.
 */
export type NormalizedGraphMatchEvidenceValue = {
  kind: "graph_match";
  selected_edge_ids: EntityId[];
  raw_value: unknown;
};

/**
 * Classification responses.
 *
 * This supports both a single selected label and a map of item -> label.
 */
export type NormalizedClassificationEvidenceValue = {
  kind: "classification";
  selected_label: string | null;
  labels_by_item_id: Record<EntityId, string>;
  raw_value: unknown;
};

/**
 * Simulation / interactive action traces.
 *
 * V1.1 does not yet deeply judge simulation traces, but preserves enough shape
 * for future renderer-specific deterministic judging.
 */
export type NormalizedInteractionEvidenceValue = {
  kind: "interaction";
  action_count: number;
  actions: unknown[];
  final_state: Record<string, unknown> | null;
  raw_value: unknown;
};

export type NormalizedTextEvidenceValue = {
  kind: "text";
  text: string;
  word_count: number;
  character_count: number;
};

export type NormalizedStructuredEvidenceValue = {
  kind: "structured";
  value: Record<string, unknown>;
  keys: string[];
};

/**
 * NormalizedEvidenceValue keeps the old generic "structured" shape for
 * backward compatibility while adding more precise shapes for deterministic
 * judging.
 */
export type NormalizedEvidenceValue =
  | NormalizedTextEvidenceValue
  | NormalizedChoiceEvidenceValue
  | NormalizedOrderingEvidenceValue
  | NormalizedSliderEvidenceValue
  | NormalizedDragDropEvidenceValue
  | NormalizedGraphMatchEvidenceValue
  | NormalizedClassificationEvidenceValue
  | NormalizedInteractionEvidenceValue
  | NormalizedStructuredEvidenceValue
  | {
      kind: "none";
      value: null;
    };

export type NormalizedEvidenceInput = {
  evidence_id: EntityId | null;
  timestamp: ISO8601String | null;

  source_kind: EvidenceSourceKind;
  linked_topic_id: EntityId | null;
  linked_probe_id: EntityId | null;

  response_type: AttemptResponseType | null;
  expected_response_type?: ProbeExpectedResponseType | null;
  probe_type?: ProbeType | null;

  modality: EvidenceModality;
  completion: EvidenceCompletion;

  value: NormalizedEvidenceValue;

  delivery_context: NewAttemptInput["delivery_context"] | null;
  submission_metadata: NewAttemptInput["submission_metadata"] | null;

  raw_attempt?: NewAttemptInput | null;
};

export type EvidenceSignalName =
  | "conceptual_coherence"
  | "prediction_accuracy"
  | "discrimination_accuracy"
  | "transfer_success"
  | "procedure_order_quality"
  | "representation_quality"
  | "interaction_efficiency"
  | "hint_dependence"
  | "response_specificity"
  | "uncertainty_signal"
  | "confusion_signal"
  | "insight_signal"
  | "evidence_strength";

/**
 * V1.1 note:
 * Some features are still generic estimates until deterministic/rubric judging
 * updates them. For example, discrimination_accuracy from generic evidence
 * should be interpreted as a weak estimate unless a structured judgment is also
 * present.
 */
export type EvidenceFeatureVector = Partial<Record<EvidenceSignalName, number | null>>;

export type AttemptInterpretationOutcome =
  | "strong_evidence"
  | "partial_evidence"
  | "weak_evidence"
  | "no_evidence"
  | "uninterpretable";

export type AttemptInterpretation = {
  interpretation_id: EntityId | null;
  evidence_id: EntityId | null;
  linked_topic_id: EntityId | null;
  linked_probe_id: EntityId | null;

  modality: EvidenceModality;
  outcome: AttemptInterpretationOutcome;

  features: EvidenceFeatureVector;

  /**
   * Amount of usable evidence present. This is not the same thing as
   * correctness.
   */
  evidence_strength: number;

  /**
   * Confidence in the generic interpretation of the evidence shape/signal.
   * Contract judging may later produce a separate, stronger confidence.
   */
  judgment_confidence: number;

  /**
   * Generic diagnostic pressure from evidence interpretation.
   * Contract judging may refine this later using structured or rubric judgment.
   */
  diagnosis_delta: DiagnosisDelta;

  model_signals_used: {
    confusion: number | null;
    insight: number | null;
    model_version: string | null;
    status: ModelSignals["status"] | null;
  };

  reasons: string[];
  cautions: string[];
};

export type InterpretAttemptOptions = {
  modelSignals?: ModelSignals | null;
  activeDiagnosis?: string | null;
  probeType?: ProbeType | null;
  expectedResponseType?: ProbeExpectedResponseType | null;
};
