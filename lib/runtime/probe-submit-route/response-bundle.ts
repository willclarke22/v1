import type {
  DeliveredProbe,
  DeliveredResponse,
  LearningSpace,
  ProbeSubmitRouteResponse,
} from "@/types/contracts";
import type { buildNextProbePlan } from "@/lib/runtime/probe-runtime";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rendererTypeForPlan(plan: ReturnType<typeof buildNextProbePlan>) {
  const rendererKind = readString(plan.probe_contract_snapshot?.renderer_kind);

  switch (rendererKind) {
    case "multiple_choice":
      return "multiple_choice_renderer";
    case "ordering":
      return "ordering_renderer";
    case "slider_prediction":
      return "slider_prediction_renderer";
    case "drag_drop_match":
      return "drag_drop_match_renderer";
    case "graph_match":
      return "graph_match_renderer";
    case "simulation":
      return "simulation_renderer";
    case "audio_explanation":
      return "audio_renderer";
    case "video_checkpoint":
      return "video_renderer";
    case "text_explanation":
    default:
      return "text_renderer";
  }
}

function modalityForPlan(plan: ReturnType<typeof buildNextProbePlan>) {
  const rendererKind = readString(plan.probe_contract_snapshot?.renderer_kind);

  switch (rendererKind) {
    case "audio_explanation":
      return "audio";
    case "video_checkpoint":
      return "video";
    case "multiple_choice":
    case "ordering":
    case "slider_prediction":
    case "drag_drop_match":
    case "graph_match":
    case "simulation":
      return "interactive";
    case "text_explanation":
    default:
      return "text";
  }
}

function getRendererConfigString(
  plan: ReturnType<typeof buildNextProbePlan>,
  key: "title" | "prompt" | "instructions",
) {
  const rendererConfig = plan.probe_contract_snapshot?.renderer_config;

  if (!rendererConfig || typeof rendererConfig !== "object") {
    return null;
  }

  return readString((rendererConfig as Record<string, unknown>)[key]);
}

export function buildDeliveredProbeFromPlan(
  plan: ReturnType<typeof buildNextProbePlan>,
): DeliveredProbe {
  const probeType = plan.probe_type;

  const fallbackTitle =
    probeType === "apply_transfer"
      ? "Apply the idea in a new situation"
      : probeType === "predict"
        ? "Predict what happens next"
        : probeType === "discriminate"
          ? "Distinguish the key difference"
          : probeType === "transform"
            ? "Walk through it step by step"
            : "Explain the idea more concretely";

  const title = getRendererConfigString(plan, "title") ?? fallbackTitle;
  const instructions =
    getRendererConfigString(plan, "prompt") ??
    getRendererConfigString(plan, "instructions") ??
    plan.text_payload.input;

  return {
    probe_id: plan.probe_id,
    target_topic_id: plan.target_topic_id,
    target_diagnosis: plan.target_diagnosis,
    intent: plan.intent,
    probe_type: plan.probe_type,
    renderer_type: rendererTypeForPlan(plan),
    generator: "chatgpt",
    modality: modalityForPlan(plan),
    title,
    instructions,
    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing:
      plan.text_payload.personalization_snapshot.context_framing ?? null,
    expected_response_type: plan.expected_response_type,

    /**
     * Preserve the exact measurement contract attached to the plan as part of
     * the learner-facing delivered probe.
     *
     * Probe submit should judge the learner's response against this answered
     * contract, not against the follow-up contract generated after submission.
     */
    probe_contract_snapshot: plan.probe_contract_snapshot,

    stimulus_id: `stimulus-${plan.probe_id}`,
    payload_snapshot: {
      text_payload: plan.text_payload,
      probe_contract_snapshot: plan.probe_contract_snapshot,
    },
  };
}

export function buildDeliveredResponse(
  reply: string,
  nextMode: "clarify" | "probe",
  nextProbe: DeliveredProbe | null,
): DeliveredResponse {
  return {
    learner_message: {
      text: reply,
      tone: "encouraging",
      mode: nextMode,
    },
    delivered_probe: nextMode === "probe" ? nextProbe : null,
  };
}

export function buildSceneUpdate(
  topicId: string,
  learningSpace: LearningSpace,
): ProbeSubmitRouteResponse["scene_update"] {
  return {
    target_topic_id: topicId,
    camera_destination_topic_id: topicId,
    arrival_mode: "focus",
    learning_space: learningSpace,
  };
}
