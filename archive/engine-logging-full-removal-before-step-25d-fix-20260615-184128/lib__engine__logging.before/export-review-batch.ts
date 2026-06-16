import type { EngineReviewBatch } from "./build-review-batch";
import type {
  AttemptEvaluationModelCallRow,
  DiagnosisModelCallRow,
  EngineModelCallRow,
  ProbeContractModelCallRow,
} from "./model-call-row";

export type EngineTrainingExampleKind =
  | "diagnosis"
  | "probe_contract"
  | "attempt_evaluation";

export type EngineTrainingExample = {
  schema_version: "engine_training_example_v1";
  example_kind: EngineTrainingExampleKind;
  source_call_id: string;
  input: unknown;
  output: unknown;
  metadata: {
    provider_name: string;
    provider_version?: string | null;
    created_at: string;
    topic_id?: string | null;
    topic_label?: string | null;
    validation_issue_count: number;
  };
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

export function exportReviewBatchToJson(batch: EngineReviewBatch): string {
  return JSON.stringify(batch, null, 2);
}

export function exportReviewBatchToJsonl(batch: EngineReviewBatch): string {
  return batch.rows.map((row) => stableStringify(row)).join("\n");
}

function isApprovedForTraining(row: EngineModelCallRow): boolean {
  return (
    row.review.review_status === "approved" &&
    row.review.include_in_training === true &&
    row.status === "success" &&
    row.output !== undefined &&
    row.output !== null
  );
}

function diagnosisTrainingExample(row: DiagnosisModelCallRow): EngineTrainingExample {
  return {
    schema_version: "engine_training_example_v1",
    example_kind: "diagnosis",
    source_call_id: row.call_id,
    input: row.input,
    output: row.output ?? null,
    metadata: {
      provider_name: row.provider_name,
      provider_version: row.provider_version ?? null,
      created_at: row.created_at,
      topic_id: row.topic_id ?? null,
      topic_label: row.topic_label ?? null,
      validation_issue_count: row.validation_issues.length,
    },
  };
}

function probeContractTrainingExample(
  row: ProbeContractModelCallRow,
): EngineTrainingExample {
  return {
    schema_version: "engine_training_example_v1",
    example_kind: "probe_contract",
    source_call_id: row.call_id,
    input: row.input,
    output: row.output ?? null,
    metadata: {
      provider_name: row.provider_name,
      provider_version: row.provider_version ?? null,
      created_at: row.created_at,
      topic_id: row.topic_id ?? null,
      topic_label: row.topic_label ?? null,
      validation_issue_count: row.validation_issues.length,
    },
  };
}

function attemptEvaluationTrainingExample(
  row: AttemptEvaluationModelCallRow,
): EngineTrainingExample {
  return {
    schema_version: "engine_training_example_v1",
    example_kind: "attempt_evaluation",
    source_call_id: row.call_id,
    input: row.input,
    output: row.output ?? null,
    metadata: {
      provider_name: row.provider_name,
      provider_version: row.provider_version ?? null,
      created_at: row.created_at,
      topic_id: row.topic_id ?? null,
      topic_label: row.topic_label ?? null,
      validation_issue_count: row.validation_issues.length,
    },
  };
}

export function buildTrainingExamplesFromReviewBatch(
  batch: EngineReviewBatch,
): EngineTrainingExample[] {
  return batch.rows
    .filter(isApprovedForTraining)
    .map((row) => {
      switch (row.call_kind) {
        case "diagnosis":
          return diagnosisTrainingExample(row);

        case "probe_contract":
          return probeContractTrainingExample(row);

        case "attempt_evaluation":
          return attemptEvaluationTrainingExample(row);

        default: {
          const exhaustiveCheck: never = row;
          return exhaustiveCheck;
        }
      }
    });
}

export function exportTrainingExamplesToJsonl(
  examples: EngineTrainingExample[],
): string {
  return examples.map((example) => stableStringify(example)).join("\n");
}

export function splitTrainingExamplesByKind(
  examples: EngineTrainingExample[],
): Record<EngineTrainingExampleKind, EngineTrainingExample[]> {
  return {
    diagnosis: examples.filter((example) => example.example_kind === "diagnosis"),
    probe_contract: examples.filter(
      (example) => example.example_kind === "probe_contract",
    ),
    attempt_evaluation: examples.filter(
      (example) => example.example_kind === "attempt_evaluation",
    ),
  };
}

