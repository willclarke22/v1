export {
  judgeProbeAttemptAgainstContract,
} from "@/lib/learning-evaluation/contract-judgment";

export type {
  ContractJudgment,
} from "@/lib/learning-evaluation/contract-judgment";

/**
 * Contract judgment runtime bridge.
 *
 * This compatibility boundary no longer reaches through lib/engine/judging or
 * archive/old-engine for active probe-submit contract judgment.
 *
 * Current behavior is intentionally preserved by copying the previous judging
 * stack into:
 *
 *   lib/learning-evaluation/contract-judgment
 *
 * Later, this bridge can be replaced by Probe Attempt Evaluator output once the
 * evaluator is allowed to influence active route behavior.
 */
