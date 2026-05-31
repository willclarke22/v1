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
 * Engine Evidence V1
 *
 * This module is modality-aware. Learner evidence may be text, choice,
 * drag/drop, ordering, slider/prediction, audio/video, simulation, or a mixed
 * interaction. The engine should preserve those differences instead of forcing
 * everything into "explanation quality."
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

export type NormalizedEvidenceValue =
  | {
      kind: "text";
      text: string;
      word_count: number;
      character_count: number;
    }
  | {
      kind: "structured";
      value: Record<string, unknown>;
      keys: string[];
    }
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

  evidence_strength: number;
  judgment_confidence: number;

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
