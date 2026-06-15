import type {
  DiagnosisLabel,
  DiagnosisModelOutput,
  DiagnosisNextAction,
} from "../schemas";

import {
  buildValidationResult,
  isKnownString,
  isRecord,
  pushIssue,
  validateOptionalString,
  validateScoreField,
  type ValidationIssue,
  type ValidationResult,
} from "./shared";

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

const DIAGNOSIS_NEXT_ACTIONS = [
  "ask_clarifying_question",
  "generate_probe_contract",
  "give_feedback",
  "summarize_progress",
] as const satisfies readonly DiagnosisNextAction[];

export function validateDiagnosisOutput(
  output: unknown,
  path = "diagnosis_output",
): ValidationResult<DiagnosisModelOutput | null> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(output)) {
    pushIssue(
      issues,
      "error",
      "invalid_diagnosis_output",
      "Expected diagnosis output to be an object.",
      path,
    );
    return buildValidationResult(null, issues);
  }

  if (output.schema_version !== "diagnosis_model_output_v1") {
    pushIssue(
      issues,
      "error",
      "invalid_diagnosis_schema_version",
      "Expected schema_version: 'diagnosis_model_output_v1'.",
      `${path}.schema_version`,
    );
  }

  if (!isKnownString(output.diagnosis, DIAGNOSIS_LABELS)) {
    pushIssue(
      issues,
      "error",
      "invalid_diagnosis_label",
      "Expected a valid diagnosis label.",
      `${path}.diagnosis`,
    );
  }

  validateScoreField(output.diagnosis_confidence, issues, `${path}.diagnosis_confidence`);

  if (!isKnownString(output.next_action, DIAGNOSIS_NEXT_ACTIONS)) {
    pushIssue(
      issues,
      "error",
      "invalid_diagnosis_next_action",
      "Expected a valid diagnosis next_action.",
      `${path}.next_action`,
    );
  }

  validateScoreField(output.next_action_confidence, issues, `${path}.next_action_confidence`);
  validateOptionalString(output.suggested_question, issues, `${path}.suggested_question`);

  if (
    output.next_action === "ask_clarifying_question" &&
    (typeof output.suggested_question !== "string" ||
      output.suggested_question.trim().length === 0)
  ) {
    pushIssue(
      issues,
      "warning",
      "clarifying_question_missing",
      "A clarifying next_action should usually include suggested_question.",
      `${path}.suggested_question`,
    );
  }

  if (
    output.diagnosis === "no_gap_detected" &&
    typeof output.diagnosis_confidence === "number" &&
    output.diagnosis_confidence < 0.75
  ) {
    pushIssue(
      issues,
      "warning",
      "no_gap_detected_low_confidence",
      "no_gap_detected should not be used casually with low confidence.",
      `${path}.diagnosis`,
    );
  }

  return buildValidationResult(output as DiagnosisModelOutput, issues);
}

