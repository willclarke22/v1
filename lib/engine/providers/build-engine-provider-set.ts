import type { EngineProviderSet } from "./types";
import {
  createAttemptEvaluatorServiceClient,
  createDiagnosisServiceClient,
  createProbeContractServiceClient,
} from "./service-clients";

export type EngineProviderMode = "local_services";

/**
 * Builds the active 3-model provider set.
 *
 * For now there is only one real provider mode: local HTTP service clients.
 * Each service client already owns its safe fallback behavior when an endpoint is
 * missing, down, timed out, or returns an invalid shape.
 */
export function buildEngineProviderSet(): EngineProviderSet {
  return {
    diagnosis: createDiagnosisServiceClient(),
    probe_contract: createProbeContractServiceClient(),
    attempt_evaluator: createAttemptEvaluatorServiceClient(),
  };
}
