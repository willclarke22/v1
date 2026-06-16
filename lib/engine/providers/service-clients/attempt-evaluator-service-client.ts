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
};

export function createAttemptEvaluatorServiceClient(
  config: AttemptEvaluatorServiceClientConfig = {},
): ProbeAttemptEvaluatorProvider {
  const providerName = config.provider_name ?? "attempt_evaluator_service_client_unconfigured";

  return {
    provider_name: providerName,
    provider_kind: "service_client",

    async runAttemptEvaluation(
      _input: ProbeAttemptEvaluatorInput,
    ): Promise<EngineProviderResult<ProbeAttemptEvaluatorOutput>> {
      const startedAtMs = Date.now();

      const output: ProbeAttemptEvaluatorOutput = {
        schema_version: "probe_attempt_evaluator_output_v1",
        correctness: 0,
        correctness_summary:
          "The attempt evaluator service client is not wired yet, so this output is intentionally low-confidence.",
        understanding_evidence: {
          evidence_strength: 0,
          may_be_lucky_guess: false,
          needs_verification_probe: true,
          verification_reason:
            "The real evaluator has not been connected, so MyWay should not treat this as stable evidence.",
        },
        misconception_hits: [],
        next_action: "ask_clarifying_question",
        next_action_confidence: 0.35,
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
            "Attempt evaluator service client is not wired yet. Returned safe clarification output.",
            config.endpoint_url
              ? `Configured endpoint was not called yet: ${config.endpoint_url}`
              : "No attempt evaluator endpoint configured.",
          ],
        }),
      };
    },
  };
}

