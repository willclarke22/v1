import type {
  ProbeContractModelInput,
  ProbeContractModelOutput,
} from "../schemas";
import type {
  EngineProviderResult,
  ProbeContractModelProvider,
} from "../providers";
import type { ValidationResult } from "../validation";
import { validateProbeContract } from "../validation";

export type ProbeContractRunResult = {
  output: ProbeContractModelOutput;
  provider_result: EngineProviderResult<ProbeContractModelOutput>;
  validation: ValidationResult<ProbeContractModelOutput | null>;
  usable: boolean;
};

export async function runProbeContract(input: {
  provider: ProbeContractModelProvider;
  model_input: ProbeContractModelInput;
}): Promise<ProbeContractRunResult> {
  const providerResult = await input.provider.runProbeContract(input.model_input);
  const validation = validateProbeContract(providerResult.output);

  return {
    output: providerResult.output,
    provider_result: providerResult,
    validation,
    usable: validation.ok,
  };
}

