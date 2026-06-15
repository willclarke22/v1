export {
  interpretAttemptEvidence,
  normalizeAttemptEvidence,
} from "@/lib/engine/evidence";

export type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/lib/engine/evidence";

/**
 * Attempt evidence runtime bridge.
 *
 * This is the runtime-facing compatibility boundary for turning a submitted
 * probe attempt into normalized evidence and an attempt interpretation.
 *
 * Today it delegates to the archived legacy evidence interpreter through the
 * temporary engine shim.
 *
 * Later, this file should call the real Probe Attempt Evaluator provider.
 */
