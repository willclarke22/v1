export {
  interpretAttemptEvidence,
  normalizeAttemptEvidence,
} from "@/lib/learning-evaluation/attempt-evidence";

export type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/lib/learning-evaluation/attempt-evidence";

/**
 * Attempt evidence runtime bridge.
 *
 * This compatibility boundary no longer reaches through lib/engine/evidence or
 * archive/old-engine for active probe-submit evidence interpretation.
 *
 * Current behavior is intentionally preserved by copying the previous evidence
 * interpreter into:
 *
 *   lib/learning-evaluation/attempt-evidence
 *
 * Later, this bridge can be replaced by Probe Attempt Evaluator output once the
 * evaluator is allowed to influence active route behavior.
 */
