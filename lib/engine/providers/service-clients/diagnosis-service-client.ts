import type { DiagnosisModelInput, DiagnosisModelOutput } from "../../schemas";
import type { DiagnosisModelProvider, EngineProviderResult } from "../types";
import { buildProviderMeta } from "../types";

export type DiagnosisServiceClientConfig = {
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

function getEndpointUrl(config: DiagnosisServiceClientConfig): string | null {
  return (
    config.endpoint_url ??
    process.env.MYWAY_DIAGNOSIS_ENDPOINT_URL ??
    process.env.MYWAY_DIAGNOSIS_SERVICE_URL ??
    null
  );
}

function buildSafeFallbackOutput(input: DiagnosisModelInput): DiagnosisModelOutput {
  return {
    schema_version: "diagnosis_model_output_v1",
    diagnosis: "unknown",
    diagnosis_confidence: 0.25,
    next_action: "ask_clarifying_question",
    next_action_confidence: 0.45,
    suggested_question:
      input.input_kind === "user_message"
        ? "What part should MyWay check first?"
        : "Can you explain how you got that answer?",
  };
}

function isDiagnosisOutput(value: unknown): value is DiagnosisModelOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DiagnosisModelOutput>;
  return (
    candidate.schema_version === "diagnosis_model_output_v1" &&
    typeof candidate.diagnosis === "string" &&
    typeof candidate.diagnosis_confidence === "number" &&
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
      throw new Error(errorPayload.error ?? `Diagnosis service returned HTTP ${response.status}`);
    }

    if (payload && typeof payload === "object" && "output" in payload) {
      return payload as ServiceEnvelope<T>;
    }

    return { ok: true, output: payload as T };
  } finally {
    clearTimeout(timeout);
  }
}

export function createDiagnosisServiceClient(
  config: DiagnosisServiceClientConfig = {},
): DiagnosisModelProvider {
  const providerName = config.provider_name ?? "diagnosis_service_client";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runDiagnosis(
      input: DiagnosisModelInput,
    ): Promise<EngineProviderResult<DiagnosisModelOutput>> {
      const startedAtMs = Date.now();
      const endpointUrl = getEndpointUrl(config);

      if (!endpointUrl) {
        const output = buildSafeFallbackOutput(input);
        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? null,
            started_at_ms: startedAtMs,
            warnings: [
              "No diagnosis endpoint configured. Returned safe fallback output.",
              "Set MYWAY_DIAGNOSIS_ENDPOINT_URL=http://127.0.0.1:8011/predict to use the local artifact service.",
            ],
          }),
        };
      }

      try {
        const serviceResponse = await postJson<DiagnosisModelOutput>(
          endpointUrl,
          input,
          config.timeout_ms ?? 8000,
        );
        const output = serviceResponse.output;

        if (!isDiagnosisOutput(output)) {
          throw new Error("Diagnosis service returned an invalid DiagnosisModelOutput shape.");
        }

        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? "myway_diagnosis_classifier_phase_a_v1",
            started_at_ms: startedAtMs,
            warnings: [],
          }),
        };
      } catch (error) {
        const output = buildSafeFallbackOutput(input);
        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? null,
            started_at_ms: startedAtMs,
            warnings: [
              "Diagnosis service call failed. Returned safe fallback output.",
              error instanceof Error ? error.message : String(error),
            ],
          }),
        };
      }
    },
  };
}
