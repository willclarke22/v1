import type {
  PresentationStyle,
  PresentationSupportKind,
  ProbeAttemptType,
  ProbeContractModelOutput,
  ProbePrompt,
  ProbeType,
} from "../schemas";

import {
  buildValidationResult,
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
import { validateProbeDeliveryContext } from "./validate-personalization";
import { validateRendererParams } from "./validate-renderer-params";

const PROBE_TYPES = [
  "explain",
  "discriminate",
  "apply_transfer",
  "sequence",
  "single_choice",
  "multi_choice",
  "drag_drop_placements",
  "predict",
  "slider",
  "graph_relationship",
  "audio_clip_question",
  "audio_response_question",
  "video_click_interval",
  "video_explanation",
] as const satisfies readonly ProbeType[];

const PROBE_ATTEMPT_TYPES = [
  "text",
  "single_choice",
  "multi_choice",
  "ordered_items",
  "drag_drop_placements",
  "numeric",
  "graph",
  "audio_response",
  "video_click",
  "none",
  "unknown",
] as const satisfies readonly ProbeAttemptType[];

const PRESENTATION_SUPPORT_KINDS = [
  "analogy",
  "metaphor",
  "contrast",
  "example",
  "real_world_connection",
  "visual_description",
  "step_by_step_frame",
  "curiosity_hook",
] as const satisfies readonly PresentationSupportKind[];

const PRESENTATION_STYLES = [
  "plain_direct",
  "gentle_coaching",
  "analogy_based",
  "metaphor_based",
  "concrete_examples",
  "step_by_step",
  "visual_description",
  "curiosity_question",
  "real_world_connection",
] as const satisfies readonly PresentationStyle[];

function probeUsuallyNeedsAnswerKey(probeType: ProbeType): boolean {
  return probeType !== "video_explanation" && probeType !== "audio_response_question";
}

function validatePrompt(
  prompt: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(prompt)) {
    pushIssue(
      issues,
      "error",
      "invalid_probe_prompt",
      "Expected prompt to be an object.",
      path,
    );
    return;
  }

  validateRequiredString(
    prompt.root_problem_explanation,
    issues,
    `${path}.root_problem_explanation`,
  );
  validateRequiredString(
    prompt.reshaping_explanation,
    issues,
    `${path}.reshaping_explanation`,
  );
  validateRequiredString(prompt.task, issues, `${path}.task`);
  validateRequiredString(prompt.full_prompt, issues, `${path}.full_prompt`);
}

function validatePresentationSupport(
  support: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (support === undefined || support === null) {
    return;
  }

  if (!Array.isArray(support)) {
    pushIssue(
      issues,
      "error",
      "invalid_presentation_support",
      "Expected presentation_support to be an array when provided.",
      path,
    );
    return;
  }

  support.forEach((item, index) => {
    const itemPath = pathJoin(path, index);

    if (!isRecord(item)) {
      pushIssue(
        issues,
        "error",
        "invalid_presentation_support_item",
        "Expected presentation support item to be an object.",
        itemPath,
      );
      return;
    }

    if (!isKnownString(item.kind, PRESENTATION_SUPPORT_KINDS)) {
      pushIssue(
        issues,
        "error",
        "invalid_presentation_support_kind",
        "Expected a valid presentation support kind.",
        `${itemPath}.kind`,
      );
    }

    if (!isKnownString(item.style_used, PRESENTATION_STYLES)) {
      pushIssue(
        issues,
        "error",
        "invalid_presentation_style_used",
        "Expected a valid presentation style.",
        `${itemPath}.style_used`,
      );
    }

    validateRequiredString(item.text, issues, `${itemPath}.text`);
    validateOptionalString(item.user_interest_used, issues, `${itemPath}.user_interest_used`);

    if (item.confidence !== undefined && item.confidence !== null) {
      validateScoreField(item.confidence, issues, `${itemPath}.confidence`);
    }
  });
}

function validateMisconceptionMarkers(
  markers: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!Array.isArray(markers)) {
    pushIssue(
      issues,
      "error",
      "invalid_misconception_markers",
      "Expected misconception_markers to be an array.",
      path,
    );
    return;
  }

  markers.forEach((marker, index) => {
    const markerPath = pathJoin(path, index);

    if (!isRecord(marker)) {
      pushIssue(
        issues,
        "error",
        "invalid_misconception_marker",
        "Expected misconception marker to be an object.",
        markerPath,
      );
      return;
    }

    validateRequiredString(marker.misconception_id, issues, `${markerPath}.misconception_id`);
    validateRequiredString(marker.label, issues, `${markerPath}.label`);
    validateOptionalString(marker.marker, issues, `${markerPath}.marker`);
    validateOptionalString(marker.description, issues, `${markerPath}.description`);

    if (marker.confidence !== undefined && marker.confidence !== null) {
      validateScoreField(marker.confidence, issues, `${markerPath}.confidence`);
    }
  });
}

export function validateProbeContract(
  output: unknown,
  path = "probe_contract",
): ValidationResult<ProbeContractModelOutput | null> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(output)) {
    pushIssue(
      issues,
      "error",
      "invalid_probe_contract",
      "Expected probe contract output to be an object.",
      path,
    );
    return buildValidationResult(null, issues);
  }

  if (output.schema_version !== "probe_contract_model_output_v1") {
    pushIssue(
      issues,
      "error",
      "invalid_probe_contract_schema_version",
      "Expected schema_version: 'probe_contract_model_output_v1'.",
      `${path}.schema_version`,
    );
  }

  const probeType = isKnownString(output.probe_type, PROBE_TYPES)
    ? output.probe_type
    : undefined;

  if (!probeType) {
    pushIssue(
      issues,
      "error",
      "invalid_probe_type",
      "Expected a valid probe_type.",
      `${path}.probe_type`,
    );
  }

  if (!isKnownString(output.expected_attempt_type, PROBE_ATTEMPT_TYPES)) {
    pushIssue(
      issues,
      "error",
      "invalid_expected_attempt_type",
      "Expected a valid expected_attempt_type.",
      `${path}.expected_attempt_type`,
    );
  }

  validatePrompt(output.prompt, issues, `${path}.prompt`);
  validatePresentationSupport(output.presentation_support, issues, `${path}.presentation_support`);
  validateMisconceptionMarkers(output.misconception_markers, issues, `${path}.misconception_markers`);

  if (probeType && probeUsuallyNeedsAnswerKey(probeType) && output.answer_key == null) {
    pushIssue(
      issues,
      "warning",
      "answer_key_missing",
      "This probe type usually needs an answer_key.",
      `${path}.answer_key`,
    );
  }

  if (probeType) {
    const rendererValidation = validateRendererParams(
      output.renderer_params,
      probeType,
      `${path}.renderer_params`,
    );
    issues.push(...rendererValidation.issues);
  }

  if (output.delivery_context !== undefined && output.delivery_context !== null) {
    const deliveryValidation = validateProbeDeliveryContext(
      output.delivery_context,
      `${path}.delivery_context`,
    );
    issues.push(...deliveryValidation.issues);
  }

  validateScoreField(output.confidence, issues, `${path}.confidence`);

  return buildValidationResult(output as ProbeContractModelOutput, issues);
}

export function assertProbePromptShape(prompt: unknown): prompt is ProbePrompt {
  return (
    isRecord(prompt) &&
    typeof prompt.root_problem_explanation === "string" &&
    typeof prompt.reshaping_explanation === "string" &&
    typeof prompt.task === "string" &&
    typeof prompt.full_prompt === "string"
  );
}


