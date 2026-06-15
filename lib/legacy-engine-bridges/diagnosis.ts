export {
  updateDiagnosisBeliefs,
} from "@/lib/learning-evaluation/diagnosis-state";

export type {
  DiagnosisState,
} from "@/lib/learning-evaluation/diagnosis-state";

/**
 * Diagnosis runtime bridge.
 *
 * This compatibility boundary no longer reaches through lib/engine/diagnosis or
 * archive/old-engine for active probe-submit diagnosis-state persistence.
 *
 * Current behavior is intentionally preserved by copying the previous diagnosis
 * updater into:
 *
 *   lib/learning-evaluation/diagnosis-state
 *
 * Later, this bridge can be replaced by the new engine state update layer once
 * Diagnosis Model / Probe Attempt Evaluator deltas are allowed to control active
 * persisted diagnosis state.
 */
