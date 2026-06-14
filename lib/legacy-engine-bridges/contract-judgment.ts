export {
  judgeProbeAttemptAgainstContract,
} from "@/lib/engine/judging";

export type {
  ContractJudgment,
} from "@/lib/engine/judging";

/**
 * Contract judgment runtime bridge.
 *
 * This is the runtime-facing compatibility boundary for judging a submitted
 * probe attempt against the probe contract that was answered.
 *
 * Today it delegates to the archived legacy contract judging stack through the
 * temporary engine shim.
 *
 * Later, this file should call the real Probe Attempt Evaluator provider.
 */
