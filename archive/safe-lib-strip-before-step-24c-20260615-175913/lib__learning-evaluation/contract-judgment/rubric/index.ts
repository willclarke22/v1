export * from "./rubric-types";
export * from "./judge-text-explanation";

import type {
  ContractJudgingInput,
  RubricJudgment,
} from "@/lib/learning-evaluation/contract-judgment/judging-types";
import {
  judgeTextExplanationRubric,
  isUsableRubricJudgment,
} from "./judge-text-explanation";

export function runRubricJudge(
  input: ContractJudgingInput,
): RubricJudgment | null {
  return judgeTextExplanationRubric(input);
}

export { isUsableRubricJudgment };


