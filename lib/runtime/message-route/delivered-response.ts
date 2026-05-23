import type {
  DeliveredProbe,
  DeliveredResponse,
  InterventionModeDecision,
  ProbePlan,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type { RouteResolutionKind } from "./confusion-insight-queue";

export type DeliveredRendererSelection = {
  modality: "text" | "video" | "interactive";
  generator: "chatgpt" | "sora" | "custom";
  renderer_type: "text_renderer" | "video_renderer" | "interactive_renderer";
};

export function buildProbeReply(
  topicLabel: string,
  diagnosis: InterventionModeDecision["active_diagnosis"],
) {
  const diagnosisText =
    diagnosis === "representation_gap"
      ? "your understanding may still need a cleaner mental model"
      : diagnosis === "procedure_gap"
        ? "you may need more step-by-step execution support"
        : diagnosis === "recall_gap"
          ? "the main issue may be retrieval rather than deep structure"
          : diagnosis === "discrimination_gap"
            ? "the main issue may be distinguishing similar concepts"
            : "the main issue may be transferring the idea into a new setting";

  return `I think your message connects most strongly to ${topicLabel}. Right now, ${diagnosisText}, so I’m moving us there and preparing a focused next step to reveal what you already understand.`;
}

export function buildClarifyReply(
  topicLabel: string,
  diagnosis: InterventionModeDecision["active_diagnosis"],
) {
  const diagnosisText =
    diagnosis === "representation_gap"
      ? "a cleaner mental model"
      : diagnosis === "procedure_gap"
        ? "a clearer sequence of steps"
        : diagnosis === "recall_gap"
          ? "a quick retrieval-oriented reminder"
          : diagnosis === "discrimination_gap"
            ? "a sharper contrast between similar ideas"
            : "help bridging the idea into a new setting";

  return `I think your message connects most strongly to ${topicLabel}. Right now, the best next move is clarification rather than measurement, because you may first need ${diagnosisText}. I’ll stabilize the idea a bit before asking you to demonstrate it.`;
}

export function buildSuggestedAction(
  topicLabel: string,
  nextStep: string,
  mode: "clarify" | "probe",
) {
  if (mode === "clarify") {
    return `First, let’s stabilize ${topicLabel.toLowerCase()} so the next step feels clearer: ${nextStep}`;
  }

  return `Next, let’s work on ${topicLabel.toLowerCase()}: ${nextStep}`;
}

export function buildStatusLabel(
  resolutionKind: RouteResolutionKind,
  mode: "clarify" | "probe",
) {
  const topicLabel =
    resolutionKind === "created_new_candidate"
      ? "Created new topic"
      : resolutionKind === "matched_existing"
        ? "Matched existing topic"
        : resolutionKind === "fallback_active_topic"
          ? "Used active topic fallback"
          : resolutionKind === "fallback_existing_topic"
            ? "Used conservative existing-topic fallback"
            : "No confident match";

  return `${topicLabel} • ${mode === "clarify" ? "Clarify mode" : "Probe mode"}`;
}

export function selectDeliveredRenderer(
  probePlan: ProbePlan,
): DeliveredRendererSelection {
  if (probePlan.interactive_payload.ready_to_send) {
    return {
      modality: "interactive",
      generator: "custom",
      renderer_type: "interactive_renderer",
    };
  }

  if (probePlan.video_payload.ready_to_send) {
    return {
      modality: "video",
      generator: "sora",
      renderer_type: "video_renderer",
    };
  }

  if (probePlan.text_payload.ready_to_send) {
    return {
      modality: "text",
      generator: "chatgpt",
      renderer_type: "text_renderer",
    };
  }

  const preferredModality =
    probePlan.renderer_request.preferred_modality ?? "text";

  if (preferredModality === "interactive") {
    return {
      modality: "interactive",
      generator: "custom",
      renderer_type: "interactive_renderer",
    };
  }

  if (preferredModality === "video") {
    return {
      modality: "video",
      generator: "sora",
      renderer_type: "video_renderer",
    };
  }

  return {
    modality: "text",
    generator: "chatgpt",
    renderer_type: "text_renderer",
  };
}

export function buildDeliveredProbe(
  probePlan: ProbePlan,
  topic: RouteTopic,
): DeliveredProbe {
  const selected = selectDeliveredRenderer(probePlan);

  const title =
    selected.modality === "video"
      ? `Visualize ${topic.topic_label}`
      : selected.modality === "interactive"
        ? `Try ${topic.topic_label}`
        : probePlan.probe_type === "apply_transfer"
          ? `Apply ${topic.topic_label} in a new situation`
          : probePlan.probe_type === "predict"
            ? `Predict what happens in ${topic.topic_label}`
            : probePlan.probe_type === "discriminate"
              ? `Distinguish ${topic.topic_label} clearly`
              : probePlan.probe_type === "transform"
                ? `Walk through ${topic.topic_label} step by step`
                : (probePlan.text_plan.instructional_goal ??
                  `Explain ${topic.topic_label}`);

  const instructions =
    selected.modality === "video"
      ? (probePlan.video_payload.narration ??
        probePlan.video_payload.prompt ??
        `Watch carefully, then respond about ${topic.topic_label}.`)
      : selected.modality === "interactive"
        ? (probePlan.interactive_payload.prompt ??
          "Interact with the task, then explain what you learned.")
        : (probePlan.text_payload.input ??
          `Explain ${topic.topic_label} in your own words.`);

  return {
    probe_id: probePlan.probe_id,
    target_topic_id: probePlan.target_topic_id,
    target_diagnosis: probePlan.target_diagnosis,
    intent: probePlan.intent,
    probe_type: probePlan.probe_type,
    renderer_type: selected.renderer_type,
    generator: selected.generator,
    modality: selected.modality,
    title,
    instructions,
    actual_tone:
      probePlan.text_plan.personalization_application.tone ??
      probePlan.video_plan.personalization_application.tone ??
      probePlan.interactive_plan.personalization_application.tone ??
      "encouraging",
    actual_pacing:
      probePlan.text_plan.personalization_application.pacing ??
      probePlan.video_plan.personalization_application.pacing ??
      probePlan.interactive_plan.personalization_application.pacing ??
      "normal",
    actual_language_style:
      probePlan.text_plan.personalization_application.language_style ??
      probePlan.video_plan.personalization_application.language_style ??
      "plain",
    actual_context_framing:
      probePlan.text_payload.personalization_snapshot.context_framing ??
      probePlan.video_plan.personalization_application.context_framing ??
      `Stay focused on ${topic.topic_label} and reveal learner understanding.`,
    expected_response_type: probePlan.expected_response_type,
    stimulus_id: `stimulus-${probePlan.probe_id}`,
    payload_snapshot:
      selected.modality === "video"
        ? { video_payload: probePlan.video_payload }
        : selected.modality === "interactive"
          ? { interactive_payload: probePlan.interactive_payload }
          : { text_payload: probePlan.text_payload },
  };
}

export function buildDeliveredResponse(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  probePlan: ProbePlan,
): DeliveredResponse {
  const reply =
    decision.mode_selected === "clarify"
      ? buildClarifyReply(
          topic.topic_label,
          decision.active_diagnosis ?? "representation_gap",
        )
      : buildProbeReply(
          topic.topic_label,
          decision.active_diagnosis ?? "representation_gap",
        );

  return {
    learner_message: {
      text: reply,
      tone: "encouraging",
      mode: decision.mode_selected,
    },
    delivered_probe:
      decision.mode_selected === "probe" && probePlan.status === "applicable"
        ? buildDeliveredProbe(probePlan, topic)
        : null,
  };
}
