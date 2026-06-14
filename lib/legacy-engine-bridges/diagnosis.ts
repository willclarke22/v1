export {
  updateDiagnosisBeliefs,
} from "@/lib/engine/diagnosis";

export type {
  DiagnosisState,
} from "@/lib/engine/diagnosis";

/**
 * Diagnosis runtime bridge.
 *
 * This is the runtime-facing compatibility boundary for updating diagnosis
 * state after a message or probe attempt.
 *
 * Today it delegates to the archived legacy diagnosis updater through the
 * temporary engine shim.
 *
 * Later, this file should call the real Diagnosis Model / diagnosis-state
 * update logic.
 */
