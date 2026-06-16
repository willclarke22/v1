import type {
  ProbeContractModelOutput,
  ProbeType,
  RendererParams,
} from "../schemas";

import type {
  EngineRenderableProbe,
  RendererCompatibilityReport,
  ProbeRendererAdapterResult,
} from "./probe-renderer-contract";

function hasArrayItems(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function hasRendererParams(
  rendererParams: RendererParams | null | undefined,
): rendererParams is RendererParams {
  return typeof rendererParams === "object" && rendererParams !== null;
}

function requireOptions(
  rendererParams: RendererParams | null | undefined,
  blockingReasons: string[],
): void {
  if (!hasRendererParams(rendererParams) || !hasArrayItems(rendererParams.options)) {
    blockingReasons.push("renderer_params.options is required for this probe type.");
  }
}

function requireItemsAndTargets(
  rendererParams: RendererParams | null | undefined,
  blockingReasons: string[],
): void {
  if (!hasRendererParams(rendererParams) || !hasArrayItems(rendererParams.items)) {
    blockingReasons.push("renderer_params.items is required for drag_drop_placements.");
  }

  if (
    !hasRendererParams(rendererParams) ||
    !hasArrayItems(rendererParams.placement_targets)
  ) {
    blockingReasons.push(
      "renderer_params.placement_targets is required for drag_drop_placements.",
    );
  }
}

function requireSlider(
  rendererParams: RendererParams | null | undefined,
  blockingReasons: string[],
): void {
  if (!hasRendererParams(rendererParams) || !rendererParams.slider) {
    blockingReasons.push("renderer_params.slider is required for slider probes.");
    return;
  }

  const { min, max } = rendererParams.slider;

  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    blockingReasons.push("renderer_params.slider requires finite min and max values.");
    return;
  }

  if (min >= max) {
    blockingReasons.push("renderer_params.slider.min must be less than max.");
  }
}

function warnIfMissingAudio(
  rendererParams: RendererParams | null | undefined,
  warnings: string[],
): void {
  if (!hasRendererParams(rendererParams) || !rendererParams.audio) {
    warnings.push("Audio probe has no renderer_params.audio metadata.");
  }
}

function warnIfMissingVideo(
  rendererParams: RendererParams | null | undefined,
  warnings: string[],
): void {
  if (!hasRendererParams(rendererParams) || !rendererParams.video) {
    warnings.push("Video probe has no renderer_params.video metadata.");
  }
}

export function buildRendererCompatibilityReport(
  probeContract: Pick<ProbeContractModelOutput, "probe_type" | "renderer_params">,
): RendererCompatibilityReport {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const probeType = probeContract.probe_type;
  const rendererParams = probeContract.renderer_params;

  switch (probeType) {
    case "single_choice":
    case "multi_choice": {
      requireOptions(rendererParams, blockingReasons);
      break;
    }

    case "drag_drop_placements": {
      requireItemsAndTargets(rendererParams, blockingReasons);
      break;
    }

    case "slider": {
      requireSlider(rendererParams, blockingReasons);
      break;
    }

    case "audio_clip_question":
    case "audio_response_question": {
      warnIfMissingAudio(rendererParams, warnings);
      break;
    }

    case "video_click_interval":
    case "video_explanation": {
      warnIfMissingVideo(rendererParams, warnings);
      break;
    }

    case "explain":
    case "discriminate":
    case "apply_transfer":
    case "sequence":
    case "predict":
    case "graph_relationship": {
      // These can often render with prompt text and optional params.
      break;
    }

    default: {
      const exhaustiveCheck: never = probeType satisfies never;
      blockingReasons.push(`Unsupported probe renderer kind: ${String(exhaustiveCheck)}`);
    }
  }

  return {
    renderer_kind: probeType,
    is_renderable: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    warnings,
  };
}

export function toEngineRenderableProbe(
  probeContract: ProbeContractModelOutput,
): EngineRenderableProbe {
  const rendererCompatibility = buildRendererCompatibilityReport(probeContract);

  return {
    schema_version: "engine_renderable_probe_v1",
    probe_type: probeContract.probe_type,
    expected_attempt_type: probeContract.expected_attempt_type,
    prompt: probeContract.prompt,
    presentation_support: probeContract.presentation_support,
    answer_key: probeContract.answer_key,
    misconception_markers: probeContract.misconception_markers,
    renderer_params: probeContract.renderer_params,
    delivery_context: probeContract.delivery_context,
    confidence: probeContract.confidence,
    renderer_compatibility: rendererCompatibility,
  };
}

export function adaptProbeContractForRenderer(
  probeContract: ProbeContractModelOutput,
): ProbeRendererAdapterResult {
  const renderableProbe = toEngineRenderableProbe(probeContract);
  const { renderer_compatibility } = renderableProbe;

  return {
    ok: renderer_compatibility.is_renderable,
    renderable_probe: renderer_compatibility.is_renderable ? renderableProbe : null,
    warnings: renderer_compatibility.warnings,
    blocking_reasons: renderer_compatibility.blocking_reasons,
  };
}

export function isRendererBackedProbeType(probeType: ProbeType): boolean {
  return (
    probeType === "single_choice" ||
    probeType === "multi_choice" ||
    probeType === "drag_drop_placements" ||
    probeType === "slider" ||
    probeType === "audio_clip_question" ||
    probeType === "audio_response_question" ||
    probeType === "video_click_interval" ||
    probeType === "video_explanation"
  );
}


