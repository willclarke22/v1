import type {
  ProbeContractModelInput,
  ProbeContractModelOutput,
} from "../../schemas";
import type { EngineProviderResult, ProbeContractModelProvider } from "../types";
import { buildProviderMeta } from "../types";

export type ProbeContractServiceClientConfig = {
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

function getEndpointUrl(config: ProbeContractServiceClientConfig): string | null {
  return (
    config.endpoint_url ??
    process.env.MYWAY_PROBE_CONTRACT_ENDPOINT_URL ??
    process.env.MYWAY_PROBE_CONTRACT_SERVICE_URL ??
    null
  );
}

function buildSafeFallbackOutput(input: ProbeContractModelInput): ProbeContractModelOutput {
  return {
    schema_version: "probe_contract_model_output_v1",
    probe_type: "explain",
    expected_attempt_type: "text",
    prompt: {
      root_problem_explanation:
        "The probe contract service client could not reach a configured provider.",
      reshaping_explanation:
        "Use a safe minimal text probe until the real provider is connected.",
      task: `Explain what you know about ${input.target_topic.topic_label}.`,
      full_prompt: `In your own words, explain what you know about ${input.target_topic.topic_label}.`,
    },
    presentation_support: [],
    answer_key: null,
    misconception_markers: [],
    renderer_params: null,
    confidence: 0.2,
  };
}

function isProbeContractOutput(value: unknown): value is ProbeContractModelOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProbeContractModelOutput>;
  return (
    candidate.schema_version === "probe_contract_model_output_v1" &&
    typeof candidate.probe_type === "string" &&
    typeof candidate.expected_attempt_type === "string" &&
    Boolean(candidate.prompt) &&
    typeof candidate.prompt === "object" &&
    Array.isArray(candidate.misconception_markers) &&
    typeof candidate.confidence === "number"
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
      throw new Error(errorPayload.error ?? `Probe contract service returned HTTP ${response.status}`);
    }

    if (payload && typeof payload === "object" && "output" in payload) {
      return payload as ServiceEnvelope<T>;
    }

    return { ok: true, output: payload as T };
  } finally {
    clearTimeout(timeout);
  }
}

export function createProbeContractServiceClient(
  config: ProbeContractServiceClientConfig = {},
): ProbeContractModelProvider {
  const providerName = config.provider_name ?? "probe_contract_service_client";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runProbeContract(
      input: ProbeContractModelInput,
    ): Promise<EngineProviderResult<ProbeContractModelOutput>> {
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
              "No probe contract endpoint configured. Returned safe fallback output.",
              "Set MYWAY_PROBE_CONTRACT_ENDPOINT_URL=http://127.0.0.1:8012/predict to use the local artifact service.",
            ],
          }),
        };
      }

      try {
        const serviceResponse = await postJson<ProbeContractModelOutput>(
          endpointUrl,
          input,
          config.timeout_ms ?? 8000,
        );
        const output = serviceResponse.output;

        if (!isProbeContractOutput(output)) {
          throw new Error("Probe contract service returned an invalid ProbeContractModelOutput shape.");
        }

        return {
          output,
          meta: buildProviderMeta({
            provider_name: providerName,
            provider_kind: "service_client",
            schema_version: output.schema_version,
            model_name: config.model_name ?? "myway_probe_contract_retriever_phase_a_v1",
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
              "Probe contract service call failed. Returned safe fallback output.",
              error instanceof Error ? error.message : String(error),
            ],
          }),
        };
      }
    },
  };
}
