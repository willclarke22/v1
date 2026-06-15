import type {
  ProbeAttemptEvaluatorInput,
  ProbeAttemptEvaluatorOutput,
} from "../schemas";
import type {
  EngineProviderResult,
  ProbeAttemptEvaluatorProvider,
} from "../providers";
import type { ValidationResult } from "../validation";
import { validateAttemptEvaluation } from "../validation";

export type AttemptEvaluationRunResult = {
  output: ProbeAttemptEvaluatorOutput;
  provider_result: EngineProviderResult<ProbeAttemptEvaluatorOutput>;
  validation: ValidationResult<ProbeAttemptEvaluatorOutput | null>;
  usable: boolean;
};

export async function runAttemptEvaluation(input: {
  provider: ProbeAttemptEvaluatorProvider;
  model_input: ProbeAttemptEvaluatorInput;
}): Promise<AttemptEvaluationRunResult> {
  const providerResult = await input.provider.runAttemptEvaluation(input.model_input);
  const validation = validateAttemptEvaluation(providerResult.output);

  return {
    output: providerResult.output,
    provider_result: providerResult,
    validation,
    usable: validation.ok,
  };
}

