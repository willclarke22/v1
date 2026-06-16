import type {
  AttemptEvaluatorNextAction,
  DiagnosisModelOutput,
  DiagnosisNextAction,
  ProbeAttemptEvaluatorOutput,
} from "../schemas";

export type EngineRoutedNextAction =
  | DiagnosisNextAction
  | AttemptEvaluatorNextAction
  | "keep_topic_open";

export type EngineRouteReason =
  | "attempt_evaluator_requested_action"
  | "attempt_needs_verification"
  | "attempt_has_misconception"
  | "diagnosis_requested_action"
  | "no_gap_still_low_confidence"
  | "fallback_keep_topic_open";

export type EngineRouteResult = {
  next_action: EngineRoutedNextAction;
  confidence: number;
  reason: EngineRouteReason;
  keep_topic_open: boolean;
};

export function routeEngineNextAction(input: {
  diagnosis_output?: DiagnosisModelOutput | null;
  attempt_evaluation_output?: ProbeAttemptEvaluatorOutput | null;
}): EngineRouteResult {
  const attempt = input.attempt_evaluation_output;

  if (attempt) {
    const hasMisconception = attempt.misconception_hits.length > 0;
    const needsVerification =
      attempt.understanding_evidence.needs_verification_probe ||
      attempt.understanding_evidence.may_be_lucky_guess ||
      attempt.understanding_evidence.possible_guess === true;

    if (hasMisconception && attempt.next_action !== "target_misconception") {
      return {
        next_action: "target_misconception",
        confidence: Math.max(0.62, attempt.next_action_confidence),
        reason: "attempt_has_misconception",
        keep_topic_open: true,
      };
    }

    if (needsVerification && attempt.next_action !== "generate_followup_probe") {
      return {
        next_action: "generate_followup_probe",
        confidence: Math.max(0.58, attempt.next_action_confidence),
        reason: "attempt_needs_verification",
        keep_topic_open: true,
      };
    }

    return {
      next_action: attempt.next_action,
      confidence: attempt.next_action_confidence,
      reason: "attempt_evaluator_requested_action",
      keep_topic_open:
        hasMisconception ||
        needsVerification ||
        attempt.correctness < 0.85 ||
        attempt.understanding_evidence.evidence_strength < 0.75,
    };
  }

  const diagnosis = input.diagnosis_output;

  if (diagnosis) {
    if (
      diagnosis.diagnosis === "no_gap_detected" &&
      diagnosis.diagnosis_confidence < 0.75
    ) {
      return {
        next_action: "keep_topic_open",
        confidence: diagnosis.diagnosis_confidence,
        reason: "no_gap_still_low_confidence",
        keep_topic_open: true,
      };
    }

    return {
      next_action: diagnosis.next_action,
      confidence: diagnosis.next_action_confidence,
      reason: "diagnosis_requested_action",
      keep_topic_open: diagnosis.diagnosis !== "no_gap_detected",
    };
  }

  return {
    next_action: "keep_topic_open",
    confidence: 0.25,
    reason: "fallback_keep_topic_open",
    keep_topic_open: true,
  };
}


