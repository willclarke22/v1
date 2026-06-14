import type {
  ConfidenceScore,
  DiagnosisLabel,
  DiagnosisNextAction,
  EvaluatedProbeAttemptSignal,
} from "./shared";

export type DiagnosisModelInput = {
  schema_version: "diagnosis_model_input_v1";

  input_kind: "user_message" | "evaluated_probe_attempt";

  user_message?: {
    text: string;
  };

  evaluated_probe_attempt?: EvaluatedProbeAttemptSignal;
};

export type DiagnosisModelOutput = {
  schema_version: "diagnosis_model_output_v1";

  diagnosis: DiagnosisLabel;
  diagnosis_confidence: ConfidenceScore;

  next_action: DiagnosisNextAction;
  next_action_confidence: ConfidenceScore;

  suggested_question?: string | null;
};
