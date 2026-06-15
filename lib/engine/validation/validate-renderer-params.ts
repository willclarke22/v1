import type {
  ProbeType,
  RendererParams,
} from "../schemas";

import {
  buildValidationResult,
  isRecord,
  pushIssue,
  type ValidationIssue,
  type ValidationResult,
} from "./shared";

function isArrayWithItems(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function validateOptions(
  rendererParams: Record<string, unknown>,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isArrayWithItems(rendererParams.options)) {
    pushIssue(
      issues,
      "error",
      "renderer_options_required",
      "This probe type requires renderer_params.options with at least one option.",
      `${path}.options`,
    );
  }
}

function validateItemsAndTargets(
  rendererParams: Record<string, unknown>,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isArrayWithItems(rendererParams.items)) {
    pushIssue(
      issues,
      "error",
      "renderer_items_required",
      "This probe type requires renderer_params.items with at least one item.",
      `${path}.items`,
    );
  }

  if (!isArrayWithItems(rendererParams.placement_targets)) {
    pushIssue(
      issues,
      "error",
      "renderer_placement_targets_required",
      "This probe type requires renderer_params.placement_targets with at least one target.",
      `${path}.placement_targets`,
    );
  }
}

function validateSlider(
  rendererParams: Record<string, unknown>,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(rendererParams.slider)) {
    pushIssue(
      issues,
      "error",
      "renderer_slider_required",
      "Slider probes require renderer_params.slider.",
      `${path}.slider`,
    );
    return;
  }

  const min = rendererParams.slider.min;
  const max = rendererParams.slider.max;

  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    pushIssue(
      issues,
      "error",
      "renderer_slider_min_max_required",
      "Slider renderer params require finite min and max values.",
      `${path}.slider`,
    );
  } else if (min >= max) {
    pushIssue(
      issues,
      "error",
      "renderer_slider_min_must_be_less_than_max",
      "Slider min must be less than max.",
      `${path}.slider`,
    );
  }
}

function validateVideo(
  rendererParams: Record<string, unknown>,
  issues: ValidationIssue[],
  path: string,
): void {
  if (!isRecord(rendererParams.video)) {
    pushIssue(
      issues,
      "warning",
      "renderer_video_metadata_missing",
      "Video probes should include renderer_params.video metadata when possible.",
      `${path}.video`,
    );
  }
}

export function validateRendererParams(
  rendererParams: unknown,
  probeType: ProbeType,
  path = "renderer_params",
): ValidationResult<RendererParams | null> {
  const issues: ValidationIssue[] = [];

  if (rendererParams === undefined || rendererParams === null) {
    if (
      probeType === "single_choice" ||
      probeType === "multi_choice" ||
      probeType === "drag_drop_placements" ||
      probeType === "slider" ||
      probeType === "video_click_interval"
    ) {
      pushIssue(
        issues,
        "error",
        "renderer_params_required",
        "This probe type requires renderer_params.",
        path,
      );
    }

    return buildValidationResult(null, issues);
  }

  if (!isRecord(rendererParams)) {
    pushIssue(
      issues,
      "error",
      "invalid_renderer_params",
      "Expected renderer_params to be an object.",
      path,
    );
    return buildValidationResult(null, issues);
  }

  if (probeType === "single_choice" || probeType === "multi_choice") {
    validateOptions(rendererParams, issues, path);
  }

  if (probeType === "drag_drop_placements") {
    validateItemsAndTargets(rendererParams, issues, path);
  }

  if (probeType === "slider") {
    validateSlider(rendererParams, issues, path);
  }

  if (probeType === "video_click_interval" || probeType === "video_explanation") {
    validateVideo(rendererParams, issues, path);
  }

  return buildValidationResult(rendererParams as RendererParams, issues);
}

