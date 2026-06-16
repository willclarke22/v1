import type {
  EngineModelCallContext,
  EngineModelCallInputByKind,
  EngineModelCallKind,
  EngineModelCallOutputByKind,
  EngineModelCallRow,
  EngineModelCallRowByKind,
  EngineModelCallStatus,
  EngineProviderMetadata,
} from "./model-call-row";
import { createDefaultReviewMetadata } from "./model-call-row";
import type { ValidationIssue } from "../validation";

export type ModelCallLogSink = {
  write(row: EngineModelCallRow): void | Promise<void>;
};

const inMemoryRows: EngineModelCallRow[] = [];

export const inMemoryModelCallLogSink: ModelCallLogSink = {
  write(row) {
    inMemoryRows.push(row);
  },
};

export function getInMemoryModelCallRows(): EngineModelCallRow[] {
  return [...inMemoryRows];
}

export function clearInMemoryModelCallRows(): void {
  inMemoryRows.length = 0;
}

function createCallId(callKind: EngineModelCallKind): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 10);
  return `${callKind}_${timestamp}_${random}`;
}

function getNowIso(now?: string | null): string {
  if (now && now.trim().length > 0) {
    return now;
  }

  return new Date().toISOString();
}

export type CreateModelCallRowInput<K extends EngineModelCallKind> = {
  call_kind: K;
  provider: EngineProviderMetadata;
  input: EngineModelCallInputByKind[K];
  output?: EngineModelCallOutputByKind[K] | null;
  status?: EngineModelCallStatus;
  validation_issues?: ValidationIssue[];
  duration_ms?: number | null;
  context?: EngineModelCallContext;
  now?: string | null;
};

export function createModelCallRow<K extends EngineModelCallKind>(
  input: CreateModelCallRowInput<K>,
): EngineModelCallRowByKind<K> {
  const validationIssues = input.validation_issues ?? [];
  const status =
    input.status ??
    (validationIssues.some((issue) => issue.severity === "error")
      ? "validation_failed"
      : "success");

  const row = {
    schema_version: "engine_model_call_row_v1",
    call_id: createCallId(input.call_kind),
    call_kind: input.call_kind,
    provider_kind: input.provider.provider_kind,
    provider_name: input.provider.provider_name,
    provider_version: input.provider.provider_version ?? null,
    status,
    validation_issues: validationIssues,
    duration_ms: input.duration_ms ?? null,
    request_id: input.context?.request_id ?? null,
    topic_id: input.context?.topic_id ?? null,
    topic_label: input.context?.topic_label ?? null,
    learner_id_hash: input.context?.learner_id_hash ?? null,
    created_at: getNowIso(input.now),
    review: createDefaultReviewMetadata(
      status === "success" && validationIssues.length === 0
        ? "unreviewed"
        : "needs_review",
    ),
    input: input.input,
    output: input.output ?? null,
    error: null,
  };

  return row as unknown as EngineModelCallRowByKind<K>;
}

export type CreateProviderErrorRowInput<K extends EngineModelCallKind> = {
  call_kind: K;
  provider: EngineProviderMetadata;
  input: EngineModelCallInputByKind[K];
  error: {
    message: string;
    code?: string | null;
    stack?: string | null;
  };
  duration_ms?: number | null;
  context?: EngineModelCallContext;
  now?: string | null;
};

export function createProviderErrorModelCallRow<K extends EngineModelCallKind>(
  input: CreateProviderErrorRowInput<K>,
): EngineModelCallRowByKind<K> {
  const row = {
    schema_version: "engine_model_call_row_v1",
    call_id: createCallId(input.call_kind),
    call_kind: input.call_kind,
    provider_kind: input.provider.provider_kind,
    provider_name: input.provider.provider_name,
    provider_version: input.provider.provider_version ?? null,
    status: "provider_error",
    validation_issues: [],
    duration_ms: input.duration_ms ?? null,
    request_id: input.context?.request_id ?? null,
    topic_id: input.context?.topic_id ?? null,
    topic_label: input.context?.topic_label ?? null,
    learner_id_hash: input.context?.learner_id_hash ?? null,
    created_at: getNowIso(input.now),
    review: createDefaultReviewMetadata("needs_review"),
    input: input.input,
    output: null,
    error: input.error,
  };

  return row as unknown as EngineModelCallRowByKind<K>;
}

export async function logModelCall(
  row: EngineModelCallRow,
  sink: ModelCallLogSink = inMemoryModelCallLogSink,
): Promise<EngineModelCallRow> {
  await sink.write(row);
  return row;
}

