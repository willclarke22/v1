import type {
  DeliveredProbe,
  DeliveredResponse,
  LearningSpace,
  ProbeSubmitRouteResponse,
} from "@/types/contracts";
import type { buildNextProbePlan } from "@/lib/runtime/probe-runtime";

export function buildDeliveredProbeFromPlan(
  plan: ReturnType<typeof buildNextProbePlan>,
): DeliveredProbe {
  const probeType = plan.probe_type;

  const title =
    probeType === "apply_transfer"
      ? "Apply the idea in a new situation"
      : probeType === "predict"
        ? "Predict what happens next"
        : probeType === "discriminate"
          ? "Distinguish the key difference"
          : probeType === "transform"
            ? "Walk through it step by step"
            : "Explain the idea more concretely";

  return {
    probe_id: plan.probe_id,
    target_topic_id: plan.target_topic_id,
    target_diagnosis: plan.target_diagnosis,
    intent: plan.intent,
    probe_type: plan.probe_type,
    renderer_type: "text_renderer",
    generator: "chatgpt",
    modality: "text",
    title,
    instructions: plan.text_payload.input,
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
