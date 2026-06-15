import type { ProbeExpectedResponseType } from "@/types/contracts";
import type {
  ProbeRendererKind,
  ProbeScaffoldLevel,
  ProbeTelemetryKey,
} from "@/archive/old-engine/probes/probe-types";
import type {
  EvidenceJudgingTier,
  JudgingMethod,
} from "@/archive/old-engine/judging";

export function expectedResponseTypeForRenderer(
  rendererKind: ProbeRendererKind,
): ProbeExpectedResponseType {
  switch (rendererKind) {
    case "multiple_choice":
      return "multiple_choice";
    case "ordering":
      return "ordering";
    case "slider_prediction":
      return "predict";
    case "drag_drop_match":
    case "graph_match":
    case "simulation":
      return "interactive_action";
    case "audio_explanation":
      return "audio";
    case "video_checkpoint":
      return "video";
    case "text_explanation":
    default:
      return "text";
  }
}

export function answerCaptureKeysForRenderer(
  rendererKind: ProbeRendererKind,
): string[] {
  switch (rendererKind) {
    case "multiple_choice":
      return ["selected_option_ids", "choice_selected", "confidence_rating"];
    case "ordering":
      return ["ordered_item_ids", "ordering_sequence", "confidence_rating"];
    case "slider_prediction":
      return ["slider_value", "prediction", "confidence_rating"];
    case "drag_drop_match":
      return ["matches", "drag_drop_positions", "confidence_rating"];
    case "graph_match":
      return ["selected_edge_ids", "graph_selection", "confidence_rating"];
    case "simulation":
      return ["actions", "simulation_actions", "final_state", "confidence_rating"];
    case "audio_explanation":
      return ["transcript", "audio_duration_ms"];
    case "video_checkpoint":
      return ["transcript", "video_checkpoint_time"];
    case "text_explanation":
    default:
      return ["text", "revision_count", "confidence_rating"];
  }
}

export function deterministicJudgingAvailable(rendererKind: ProbeRendererKind) {
  switch (rendererKind) {
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
    case "drag_drop_match":
    case "graph_match":
      return true;
    default:
      return false;
  }
}

export function expectedJudgingMethodsForRenderer(
  rendererKind: ProbeRendererKind,
): JudgingMethod[] {
  switch (rendererKind) {
    case "multiple_choice":
      return ["deterministic_multiple_choice", "contract_marker_estimate"];
    case "ordering":
      return ["deterministic_ordering", "contract_marker_estimate"];
    case "slider_prediction":
      return ["deterministic_slider", "contract_marker_estimate"];
    case "drag_drop_match":
      return ["deterministic_drag_drop", "contract_marker_estimate"];
    case "graph_match":
      return ["deterministic_graph_match", "contract_marker_estimate"];
    case "text_explanation":
      return ["heuristic_rubric_text", "contract_marker_estimate"];
    case "audio_explanation":
      return ["heuristic_rubric_audio_transcript", "contract_marker_estimate"];
    case "video_checkpoint":
      return ["heuristic_rubric_video_checkpoint", "contract_marker_estimate"];
    case "simulation":
    default:
      return ["contract_marker_estimate"];
  }
}

export function expectedEvidenceTierForRenderer(
  rendererKind: ProbeRendererKind,
): EvidenceJudgingTier {
  if (deterministicJudgingAvailable(rendererKind)) {
    return "deterministic_structured_judgment";
  }

  if (
    rendererKind === "text_explanation" ||
    rendererKind === "audio_explanation" ||
    rendererKind === "video_checkpoint"
  ) {
    return "heuristic_rubric_judgment";
  }

  return "contract_marker_estimate";
}

export function telemetryForRenderer(
  rendererKind: ProbeRendererKind,
): ProbeTelemetryKey[] {
  const base: ProbeTelemetryKey[] = ["latency_ms", "hint_usage", "retry_count"];

  switch (rendererKind) {
    case "multiple_choice":
      return [...base, "choice_selected", "confidence_rating"];
    case "ordering":
      return [...base, "ordering_sequence", "confidence_rating"];
    case "slider_prediction":
      return [...base, "slider_value", "confidence_rating"];
    case "drag_drop_match":
      return [...base, "drag_drop_positions", "confidence_rating"];
    case "graph_match":
      return [...base, "graph_selection", "confidence_rating"];
    case "simulation":
      return [...base, "simulation_actions", "confidence_rating"];
    case "audio_explanation":
      return [...base, "audio_duration_ms"];
    case "video_checkpoint":
      return [...base, "video_checkpoint_time"];
    case "text_explanation":
    default:
      return [...base, "revision_count", "confidence_rating"];
  }
}

export function rendererIcon(rendererKind: ProbeRendererKind) {
  switch (rendererKind) {
    case "multiple_choice":
      return "✓";
    case "ordering":
      return "≡";
    case "slider_prediction":
      return "◒";
    case "drag_drop_match":
      return "⠿";
    case "graph_match":
      return "⌁";
    case "simulation":
      return "✦";
    case "audio_explanation":
      return "◌";
    case "video_checkpoint":
      return "▶";
    case "text_explanation":
    default:
      return "T";
  }
}

export function defaultScaffoldLevelForRenderer(
  rendererKind: ProbeRendererKind,
): ProbeScaffoldLevel {
  switch (rendererKind) {
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
      return "low";
    case "drag_drop_match":
    case "graph_match":
    case "simulation":
      return "medium";
    case "audio_explanation":
    case "video_checkpoint":
    case "text_explanation":
    default:
      return "medium";
  }
}

