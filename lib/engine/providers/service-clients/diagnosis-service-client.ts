import type { DiagnosisModelInput, DiagnosisModelOutput } from "../../schemas";
import type { DiagnosisModelProvider, EngineProviderResult } from "../types";
import { buildProviderMeta } from "../types";

export type DiagnosisServiceClientConfig = {
  provider_name?: string;
  model_name?: string | null;
  endpoint_url?: string | null;
};

export function createDiagnosisServiceClient(
  config: DiagnosisServiceClientConfig = {},
): DiagnosisModelProvider {
  const providerName = config.provider_name ?? "diagnosis_service_client_unconfigured";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runDiagnosis(
      input: DiagnosisModelInput,
    ): Promise<EngineProviderResult<DiagnosisModelOutput>> {
      const startedAtMs = Date.now();

      const output: DiagnosisModelOutput = {
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

      return {
        output,
        meta: buildProviderMeta({
          provider_name: providerName,
          provider_kind: "service_client",
          schema_version: output.schema_version,
          model_name: config.model_name ?? null,
          started_at_ms: startedAtMs,
          warnings: [
            "Diagnosis service client is not wired yet. Returned safe unconfigured output.",
            config.endpoint_url
              ? `Configured endpoint was not called yet: ${config.endpoint_url}`
              : "No diagnosis endpoint configured.",
          ],
        }),
      };
    },
  };
}
