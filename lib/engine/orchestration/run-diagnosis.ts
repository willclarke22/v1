import type {
  DiagnosisModelInput,
  DiagnosisModelOutput,
} from "../schemas";
import type {
  DiagnosisModelProvider,
  EngineProviderResult,
} from "../providers";
import type { ValidationResult } from "../validation";
import { validateDiagnosisOutput } from "../validation";

export type DiagnosisRunResult = {
  output: DiagnosisModelOutput;
  provider_result: EngineProviderResult<DiagnosisModelOutput>;
  validation: ValidationResult<DiagnosisModelOutput | null>;
  usable: boolean;
};

export async function runDiagnosis(input: {
  provider: DiagnosisModelProvider;
  model_input: DiagnosisModelInput;
}): Promise<DiagnosisRunResult> {
  const providerResult = await input.provider.runDiagnosis(input.model_input);
  const validation = validateDiagnosisOutput(providerResult.output);

  return {
    output: providerResult.output,
    provider_result: providerResult,
    validation,
    usable: validation.ok,
  };
}

