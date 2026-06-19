import type {
  ProbeAttemptEvaluatorInput,
  ProbeAttemptEvaluatorOutput,
} from "../../schemas";
import type { EngineProviderResult, ProbeAttemptEvaluatorProvider } from "../types";
import { buildProviderMeta } from "../types";

export type AttemptEvaluatorServiceClientConfig = {
  provider_name?: string;
  model_name?: string | null;
  endpoint_url?: string | null;
  timeout_ms?: number;
};

type ServiceEnvelope<T> = {
  ok?: boolean;
  output?: T;
  meta?: unknown;
  error?: string;
};

function getEndpointUrl(config: AttemptEvaluatorServiceClientConfig): string | null {
  return (
    config.endpoint_url ??
    process.env.MYWAY_ATTEMPT_EVALUATOR_ENDPOINT_URL ??
    process.env.MYWAY_ATTEMPT_EVALUATOR_SERVICE_URL ??
    null
  );
}

function buildSafeFallbackOutput(): ProbeAttemptEvaluatorOutput {
  return {
    schema_version: "probe_attempt_evaluator_output_v1",
    correctness: 0,
    correctness_summary:
      "The attempt evaluator service client could not reach a configured provider, so this output is intentionally low-confidence.",
    understanding_evidence: {
      evidence_strength: 0,
      may_be_lucky_guess: false,
      needs_verification_probe: true,
      verification_reason:
        "The real evaluator was not available, so MyWay should not treat this as stable evidence.",
    },
    misconception_hits: [],
    next_action: "ask_clarifying_question",
    next_action_confidence: 0.35,
  };
}

function isAttemptEvaluatorOutput(value: unknown): value is ProbeAttemptEvaluatorOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProbeAttemptEvaluatorOutput>;
  return (
    candidate.schema_version === "probe_attempt_evaluator_output_v1" &&
    typeof candidate.correctness === "number" &&
    typeof candidate.correctness_summary === "string" &&
    Boolean(candidate.understanding_evidence) &&
    typeof candidate.understanding_evidence === "object" &&
    Array.isArray(candidate.misconception_hits) &&
    typeof candidate.next_action === "string" &&
    typeof candidate.next_action_confidence === "number"
  );
}

async function postJson<T>(url: string, input: unknown, timeoutMs: number): Promise<ServiceEnvelope<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ServiceEnvelope<T> | T) : ({} as ServiceEnvelope<T>);

    if (!response.ok) {
      const errorPayload = payload as ServiceEnvelope<T>;
      throw new Error(errorPayload.error ?? `Attempt evaluator service returned HTTP ${response.status}`);
    }

    if (payload && typeof payload === "object" && "output" in payload) {
      return payload as ServiceEnvelope<T>;
    }

    return { ok: true, output: payload as T };
  } finally {
    clearTimeout(timeout);
  }
}

export function createAttemptEvaluatorServiceClient(
  config: AttemptEvaluatorServiceClientConfig = {},
): ProbeAttemptEvaluatorProvider {
  const providerName = config.provider_name ?? "attempt_evaluator_service_client";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runAttemptEvaluation(
      input: ProbeAttemptEvaluatorInput,
    ): Promise<EngineProviderResult<ProbeAttemptEvaluatorOutput>> {
      const startedAtMs = Date.now();
      const endpointUrl = getEndpointUrl(config);

      if (!endpointUrl) {
        const output = buildSafeFallbackOutput();
        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? null,
            started_at_ms: startedAtMs,
            warnings: [
              "No attempt evaluator endpoint configured. Returned safe fallback output.",
              "Set MYWAY_ATTEMPT_EVALUATOR_ENDPOINT_URL=http://127.0.0.1:8013/predict to use the local artifact service.",
            ],
          }),
        };
      }

      try {
        const serviceResponse = await postJson<ProbeAttemptEvaluatorOutput>(
          endpointUrl,
          input,
          config.timeout_ms ?? 8000,
        );
        const output = serviceResponse.output;

        if (!isAttemptEvaluatorOutput(output)) {
          throw new Error("Attempt evaluator service returned an invalid ProbeAttemptEvaluatorOutput shape.");
        }

        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? "myway_attempt_evaluator_hybrid_phase_a_v1",
            started_at_ms: startedAtMs,
            warnings: [],
          }),
        };
      } catch (error) {
        const output = buildSafeFallbackOutput();
        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? null,
            started_at_ms: startedAtMs,
            warnings: [
              "Attempt evaluator service call failed. Returned safe fallback output.",
              error instanceof Error ? error.message : String(error),
            ],
          }),
        };
      }
    },
  };
}
