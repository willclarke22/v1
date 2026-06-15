import type {
  DiagnosisModelInput,
  ProbeContractModelInput,
} from "../schemas";
import type { EngineProviderSet } from "../providers";
import type { DiagnosisRunResult } from "./run-diagnosis";
import { runDiagnosis } from "./run-diagnosis";
import type { ProbeContractRunResult } from "./run-probe-contract";
import { runProbeContract } from "./run-probe-contract";
import type { EngineRouteResult } from "./route-engine-next-action";
import { routeEngineNextAction } from "./route-engine-next-action";

export type EngineTurnProbeContractContext = Omit<
  ProbeContractModelInput,
  "schema_version" | "target_diagnosis"
>;

export type RunEngineTurnInput = {
  providers: EngineProviderSet;
  diagnosis_input: DiagnosisModelInput;

  // Optional because not every engine turn should generate a probe.
  // When present and diagnosis routes to generate_probe_contract, the turn can
  // produce a validated probe contract without route-level wiring.
  probe_contract_context?: EngineTurnProbeContractContext;
};

export type RunEngineTurnResult = {
  diagnosis: DiagnosisRunResult;
  route: EngineRouteResult;
  probe_contract?: ProbeContractRunResult;
};

export async function runEngineTurn(
  input: RunEngineTurnInput,
): Promise<RunEngineTurnResult> {
  const diagnosis = await runDiagnosis({
    provider: input.providers.diagnosis,
    model_input: input.diagnosis_input,
  });

  const route = routeEngineNextAction({
    diagnosis_output: diagnosis.output,
  });

  if (
    route.next_action === "generate_probe_contract" &&
    input.providers.probe_contract &&
    input.probe_contract_context
  ) {
    const probeContractInput: ProbeContractModelInput = {
      schema_version: "probe_contract_model_input_v1",
      target_topic: input.probe_contract_context.target_topic,
      target_diagnosis: diagnosis.output.diagnosis,
      learner_signal: input.probe_contract_context.learner_signal,
      personalization_context:
        input.probe_contract_context.personalization_context ?? null,
    };

    const probeContract = await runProbeContract({
      provider: input.providers.probe_contract,
      model_input: probeContractInput,
    });

    return {
      diagnosis,
      route,
      probe_contract: probeContract,
    };
  }

  return {
    diagnosis,
    route,
  };
}

