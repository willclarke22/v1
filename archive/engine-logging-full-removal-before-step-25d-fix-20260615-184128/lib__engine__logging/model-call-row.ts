import type {
  DiagnosisModelInput,
  DiagnosisModelOutput,
  ProbeAttemptEvaluatorInput,
  ProbeAttemptEvaluatorOutput,
  ProbeContractModelInput,
  ProbeContractModelOutput,
} from "../schemas";
import type { ValidationIssue } from "../validation";

export type EngineModelCallKind =
  | "diagnosis"
  | "probe_contract"
  | "attempt_evaluation";

export type EngineModelProviderKind =
  | "fallback"
  | "service"
  | "llm"
  | "trained_model"
  | "unknown";

export type EngineModelCallStatus =
  | "success"
  | "validation_failed"
  | "provider_error"
  | "skipped";

export type EngineReviewStatus =
  | "unreviewed"
  | "needs_review"
  | "approved"
  | "rejected";

export type EngineTrainingSplit =
  | "none"
  | "train"
  | "validation"
  | "test";

export type EngineModelCallReviewMetadata = {
  review_status: EngineReviewStatus;
  training_split: EngineTrainingSplit;
  reviewer_notes?: string | null;
  include_in_training?: boolean;
  reviewed_at?: string | null;
};

export type EngineModelCallError = {
  message: string;
  code?: string | null;
  stack?: string | null;
};

export type EngineModelCallRowBase = {
  schema_version: "engine_model_call_row_v1";

  call_id: string;
  call_kind: EngineModelCallKind;

  provider_kind: EngineModelProviderKind;
  provider_name: string;
  provider_version?: string | null;

  status: EngineModelCallStatus;

  validation_issues: ValidationIssue[];

  duration_ms?: number | null;

  request_id?: string | null;
  topic_id?: string | null;
  topic_label?: string | null;

  // Use a hash or stable anonymous id here if this is ever persisted.
  // Do not store raw personal identifiers in engine training logs.
  learner_id_hash?: string | null;

  created_at: string;

  review: EngineModelCallReviewMetadata;

  error?: EngineModelCallError | null;
};

export type DiagnosisModelCallRow = EngineModelCallRowBase & {
  call_kind: "diagnosis";
  input: DiagnosisModelInput;
  output?: DiagnosisModelOutput | null;
};

export type ProbeContractModelCallRow = EngineModelCallRowBase & {
  call_kind: "probe_contract";
  input: ProbeContractModelInput;
  output?: ProbeContractModelOutput | null;
};

export type AttemptEvaluationModelCallRow = EngineModelCallRowBase & {
  call_kind: "attempt_evaluation";
  input: ProbeAttemptEvaluatorInput;
  output?: ProbeAttemptEvaluatorOutput | null;
};

export type EngineModelCallRow =
  | DiagnosisModelCallRow
  | ProbeContractModelCallRow
  | AttemptEvaluationModelCallRow;

export type EngineModelCallInputByKind = {
  diagnosis: DiagnosisModelInput;
  probe_contract: ProbeContractModelInput;
  attempt_evaluation: ProbeAttemptEvaluatorInput;
};

export type EngineModelCallOutputByKind = {
  diagnosis: DiagnosisModelOutput;
  probe_contract: ProbeContractModelOutput;
  attempt_evaluation: ProbeAttemptEvaluatorOutput;
};

export type EngineModelCallRowByKind<K extends EngineModelCallKind> =
  K extends "diagnosis"
    ? DiagnosisModelCallRow
    : K extends "probe_contract"
      ? ProbeContractModelCallRow
      : K extends "attempt_evaluation"
        ? AttemptEvaluationModelCallRow
        : never;

export type EngineModelCallContext = {
  request_id?: string | null;
  topic_id?: string | null;
  topic_label?: string | null;
  learner_id_hash?: string | null;
};

export type EngineProviderMetadata = {
  provider_kind: EngineModelProviderKind;
  provider_name: string;
  provider_version?: string | null;
};

export function createDefaultReviewMetadata(
  review_status: EngineReviewStatus = "unreviewed",
): EngineModelCallReviewMetadata {
  return {
    review_status,
    training_split: "none",
    reviewer_notes: null,
    include_in_training: false,
    reviewed_at: null,
  };
}

