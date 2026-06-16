import type {
  AttemptEvaluatorNextAction,
  DiagnosisLabel,
  ProbeAttemptEvaluatorOutput,
} from "../schemas";

import {
  buildValidationResult,
  isBoolean,
  isKnownString,
  isRecord,
  pathJoin,
  pushIssue,
  validateOptionalString,
  validateRequiredString,
  validateScoreField,
  type ValidationIssue,
  type ValidationResult,
} from "./shared";
import { validatePersonalizationProfileDelta } from "./validate-personalization";

const DIAGNOSIS_LABELS = [
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
] as const satisfies readonly DiagnosisLabel[];

const ATTEMPT_EVALUATOR_NEXT_ACTIONS = [
  "give_feedback",
  "target_misconception",
  "generate_followup_probe",
  "ask_clarifying_question",
  "summarize_progress",
] as const satisfies readonly AttemptEvaluatorNextAction[];

function validateUnderstandingEvidence(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(value)) {
    pushIssue(
      issues,
      "error",
      "invalid_understanding_evidence",
      "Expected understanding_evidence to be an object.",
      path,
    );
    return;
  }

  validateScoreField(value.evidence_strength, issues, `${path}.evidence_strength`);

  if (!isBoolean(value.may_be_lucky_guess)) {
    pushIssue(
      issues,
      "error",
      "invalid_may_be_lucky_guess",
      "Expected may_be_lucky_guess to be a boolean.",
      `${path}.may_be_lucky_guess`,
    );
  }

  if (!isBoolean(value.needs_verification_probe)) {
    pushIssue(
      issues,
      "error",
      "invalid_needs_verification_probe",
      "Expected needs_verification_probe to be a boolean.",
      `${path}.needs_verification_probe`,
    );
  }

  validateOptionalString(value.verification_reason, issues, `${path}.verification_reason`);

  if (
    value.needs_verification_probe === true &&
    (typeof value.verification_reason !== "string" ||
      value.verification_reason.trim().length === 0)
  ) {
    pushIssue(
      issues,
      "warning",
      "verification_reason_missing",
      "When needs_verification_probe is true, verification_reason should usually explain why.",
      `${path}.verification_reason`,
    );
  }
}

function validateMisconceptionHits(
  hits: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!Array.isArray(hits)) {
    pushIssue(
      issues,
      "error",
      "invalid_misconception_hits",
      "Expected misconception_hits to be an array.",
      path,
    );
    return;
  }

  hits.forEach((hit, index) => {
    const hitPath = pathJoin(path, index);

    if (!isRecord(hit)) {
      pushIssue(
        issues,
        "error",
        "invalid_misconception_hit",
        "Expected misconception hit to be an object.",
        hitPath,
      );
      return;
    }

    validateRequiredString(hit.misconception_id, issues, `${hitPath}.misconception_id`);
    validateScoreField(hit.confidence, issues, `${hitPath}.confidence`);
  });
}

function validateDiagnosisDelta(
  delta: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (delta === undefined || delta === null) {
    return;
  }

  if (!isRecord(delta)) {
    pushIssue(
      issues,
      "error",
      "invalid_diagnosis_delta",
      "Expected diagnosis_delta to be an object when provided.",
      path,
    );
    return;
  }

  Object.entries(delta).forEach(([key, value]) => {
    if (!isKnownString(key, DIAGNOSIS_LABELS)) {
      pushIssue(
        issues,
        "error",
        "invalid_diagnosis_delta_key",
        "diagnosis_delta contains an unknown diagnosis label.",
        `${path}.${key}`,
      );
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      pushIssue(
        issues,
        "error",
        "invalid_diagnosis_delta_value",
        "diagnosis_delta values must be finite numbers.",
        `${path}.${key}`,
      );
    }
  });
}

export function validateAttemptEvaluation(
  output: unknown,
  path = "attempt_evaluation",
): ValidationResult<ProbeAttemptEvaluatorOutput | null> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(output)) {
    pushIssue(
      issues,
      "error",
      "invalid_attempt_evaluation",
      "Expected attempt evaluation output to be an object.",
      path,
    );
    return buildValidationResult(null, issues);
  }

  if (output.schema_version !== "probe_attempt_evaluator_output_v1") {
    pushIssue(
      issues,
      "error",
      "invalid_attempt_evaluation_schema_version",
      "Expected schema_version: 'probe_attempt_evaluator_output_v1'.",
      `${path}.schema_version`,
    );
  }

  validateScoreField(output.correctness, issues, `${path}.correctness`);
  validateRequiredString(output.correctness_summary, issues, `${path}.correctness_summary`);

  validateUnderstandingEvidence(
    output.understanding_evidence,
    issues,
    `${path}.understanding_evidence`,
  );

  validateMisconceptionHits(output.misconception_hits, issues, `${path}.misconception_hits`);
  validateDiagnosisDelta(output.diagnosis_delta, issues, `${path}.diagnosis_delta`);

  if (output.personalization_delta !== undefined && output.personalization_delta !== null) {
    const personalizationValidation = validatePersonalizationProfileDelta(
      output.personalization_delta,
      `${path}.personalization_delta`,
    );
    issues.push(...personalizationValidation.issues);
  }

  if (!isKnownString(output.next_action, ATTEMPT_EVALUATOR_NEXT_ACTIONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_attempt_evaluator_next_action",
      "Expected a valid attempt evaluator next_action.",
      `${path}.next_action`,
    );
  }

  validateScoreField(output.next_action_confidence, issues, `${path}.next_action_confidence`);

  return buildValidationResult(output as ProbeAttemptEvaluatorOutput, issues);
}

