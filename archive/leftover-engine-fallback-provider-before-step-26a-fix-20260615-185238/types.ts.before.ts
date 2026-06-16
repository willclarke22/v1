import type {
  DiagnosisModelInput,
  DiagnosisModelOutput,
  ProbeAttemptEvaluatorInput,
  ProbeAttemptEvaluatorOutput,
  ProbeContractModelInput,
  ProbeContractModelOutput,
} from "../schemas";

export type EngineProviderKind =
  | "service_client";

export type EngineProviderCallMeta = {
  provider_name: string;
  provider_kind: EngineProviderKind;
  model_name?: string | null;
  schema_version: string;
  latency_ms?: number | null;
  warnings?: string[];
};

export type EngineProviderResult<TOutput> = {
  output: TOutput;
  meta: EngineProviderCallMeta;
  raw_response?: unknown;
};

export type DiagnosisModelProvider = {
  provider_name: string;
  provider_kind: EngineProviderKind;
  runDiagnosis(
    input: DiagnosisModelInput,
  ): Promise<EngineProviderResult<DiagnosisModelOutput>>;
};

export type ProbeContractModelProvider = {
  provider_name: string;
  provider_kind: EngineProviderKind;
  runProbeContract(
    input: ProbeContractModelInput,
  ): Promise<EngineProviderResult<ProbeContractModelOutput>>;
};

export type ProbeAttemptEvaluatorProvider = {
  provider_name: string;
  provider_kind: EngineProviderKind;
  runAttemptEvaluation(
    input: ProbeAttemptEvaluatorInput,
  ): Promise<EngineProviderResult<ProbeAttemptEvaluatorOutput>>;
};

export type EngineProviderSet = {
  diagnosis: DiagnosisModelProvider;
  probe_contract?: ProbeContractModelProvider;
  attempt_evaluator: ProbeAttemptEvaluatorProvider;
};

export function buildProviderMeta(input: {
  provider_name: string;
  provider_kind: EngineProviderKind;
  schema_version: string;
  model_name?: string | null;
  started_at_ms: number;
  warnings?: string[];
}): EngineProviderCallMeta {
  return {
    provider_name: input.provider_name,
    provider_kind: input.provider_kind,
    schema_version: input.schema_version,
    model_name: input.model_name ?? null,
    latency_ms: Math.max(0, Date.now() - input.started_at_ms),
    warnings: input.warnings ?? [],
  };
}

