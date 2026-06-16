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
};

export function createProbeContractServiceClient(
  config: ProbeContractServiceClientConfig = {},
): ProbeContractModelProvider {
  const providerName = config.provider_name ?? "probe_contract_service_client_unconfigured";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runProbeContract(
      input: ProbeContractModelInput,
    ): Promise<EngineProviderResult<ProbeContractModelOutput>> {
      const startedAtMs = Date.now();

      const output: ProbeContractModelOutput = {
        schema_version: "probe_contract_model_output_v1",
        probe_type: "explain",
        expected_attempt_type: "text",
        prompt: {
          root_problem_explanation:
            "The probe contract service client is not wired yet.",
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

      return {
        output,
        meta: buildProviderMeta({
          provider_name: providerName,
          provider_kind: "service_client",
          schema_version: output.schema_version,
          model_name: config.model_name ?? null,
          started_at_ms: startedAtMs,
          warnings: [
            "Probe contract service client is not wired yet. Returned safe minimal explain/text contract.",
            config.endpoint_url
              ? `Configured endpoint was not called yet: ${config.endpoint_url}`
              : "No probe contract endpoint configured.",
          ],
        }),
      };
    },
  };
}
