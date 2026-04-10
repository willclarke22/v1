import type {
  DiagnosisType,
  FrontendTopicMetricUpdate,
  ImportantRunInputs,
  InterventionModeDecision,
  ModelSignals,
  ProbePlan,
  RendererModality,
  VectorInfo,
} from "@/types/contracts";
import { clamp, normalizeDiagnosis, nowIso } from "./shared";
import {
  inferPrimaryMessageFrame,
  type RouteTopic,
} from "./topic-resolution";
import { makeId } from "@/lib/utils/ids";

type TopicMetricUpdate = FrontendTopicMetricUpdate;

type CurrentInteractionContext =
  ImportantRunInputs["current_interaction_context"];

type NewAttempt = ImportantRunInputs["new_attempt"];

type UploadedContent = ImportantRunInputs["uploaded_content"];

export type TopicResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

type InterventionScoreArgs = {
  topic: RouteTopic;
  vectorInfo: VectorInfo;
  preferredModality: RendererModality;
  message: string;
  createdTopic: boolean;
  topicResolutionKind?: TopicResolutionKind;
  modelSignals?: ModelSignals;
  currentInteractionContext?: CurrentInteractionContext;
  newAttempt?: NewAttempt;
};

type ProbeType =
  | "predict"
  | "explain"
  | "discriminate"
  | "transform"
  | "apply_transfer";

export function inferDiagnosisFromTopic(topic: RouteTopic): DiagnosisType {
  return (
    normalizeDiagnosis((topic as { diagnosis?: unknown }).diagnosis) ??
    "representation_gap"
  );
}

function resolveTopicResolutionKind(
  createdTopic: boolean,
  topicResolutionKind?: TopicResolutionKind
): TopicResolutionKind {
  if (topicResolutionKind) return topicResolutionKind;
  return createdTopic ? "created_new_candidate" : "matched_existing";
}

function hasExplicitVideoRequest(message: string) {
  const lower = message.toLowerCase();

  return (
    lower.includes("show me visually") ||
    lower.includes("show me a visual") ||
    lower.includes("visual explanation") ||
    lower.includes("diagram") ||
    lower.includes("animation") ||
    lower.includes("video")
  );
}

function hasExplicitInteractiveRequest(message: string) {
  const lower = message.toLowerCase();

  return (
    lower.includes("interactive") ||
    lower.includes("quiz me") ||
    lower.includes("test me") ||
    lower.includes("let me try") ||
    lower.includes("let me test myself")
  );
}

export function inferPreferredModality(
  message: string,
  modeHint?: "clarify" | "probe"
): RendererModality {
  const frame = inferPrimaryMessageFrame(message);

  if (hasExplicitInteractiveRequest(message)) {
    return modeHint === "clarify" ? "text" : "interactive";
  }

  if (hasExplicitVideoRequest(message)) {
    return "video";
  }

  if (frame === "quiz_request" || frame === "apply_request") {
    return modeHint === "clarify" ? "text" : "interactive";
  }

  return "text";
}

export function messageLooksClarifySeeking(message: string) {
  const frame = inferPrimaryMessageFrame(message);
  const lower = message.toLowerCase();

  if (
    frame === "confusion_help" ||
    frame === "explain_request" ||
    frame === "compare_request"
  ) {
    return true;
  }

  return (
    lower.startsWith("what is ") ||
    lower.startsWith("what are ") ||
    lower.startsWith("how does ") ||
    lower.startsWith("can you explain ") ||
    lower.startsWith("explain ") ||
    lower.includes("i don't understand") ||
    lower.includes("i dont understand") ||
    lower.includes("i am confused") ||
    lower.includes("i'm confused") ||
    lower.includes("confused about") ||
    lower.includes("help me understand") ||
    lower.includes("walk me through") ||
    lower.includes("go over")
  );
}

function buildDefaultModelSignals(): ModelSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: null,
    inference_mode: null,
    latency_ms: null,
    status: "unavailable",
    error_message: null,
  };
}

function buildDefaultCurrentInteractionContext(): CurrentInteractionContext {
  return {
    run_kind: "initial_question",
    is_response_to_delivered_probe: false,
    prior_mode_selected: null,
    prior_probe_was_applicable: null,
    prior_probe_id: null,
    prior_mode_outcome_available: null,
  };
}

function buildDefaultNewAttempt(): NewAttempt {
  return {
    status: "absent",
    attempt_id: null,
    timestamp: null,
    originating_run_id: null,
    source_message_id: null,
    linked_probe_id: null,
    linked_stimulus_id: null,
    linked_topic_id: null,
    linked_cluster_id: null,
    linked_resolution_contract_id: null,
    response_type: null,
    completion_status: null,
    raw_response: null,
    delivery_context: {
      renderer_type: null,
      generator: null,
      modality: null,
      tone: null,
      pacing: null,
      language_style: null,
      context_framing: null,
    },
    submission_metadata: {
      latency_ms: null,
      revision_count: null,
      used_hint: null,
      requested_clarification_before_answering: null,
    },
  };
}

export function buildImportantRunInputs(
  message: string,
  vectorInfo: VectorInfo,
  modelSignals?: ModelSignals,
  currentInteractionContext?: CurrentInteractionContext,
  newAttempt?: NewAttempt,
  uploadedContent?: UploadedContent
): ImportantRunInputs {
  return {
    user_message: {
      message_id: null,
      timestamp: nowIso(),
      content: message,
    },
    model_signals: modelSignals ?? buildDefaultModelSignals(),
    current_interaction_context:
      currentInteractionContext ?? buildDefaultCurrentInteractionContext(),
    new_attempt: newAttempt ?? buildDefaultNewAttempt(),
    vector_info: vectorInfo,
    uploaded_content: uploadedContent ?? [],
  };
}

function selectInitialProbeType(
  diagnosis: DiagnosisType,
  preferredModality: RendererModality
): ProbeType {
  if (preferredModality === "interactive" && diagnosis !== "representation_gap") {
    return diagnosis === "procedure_gap"
      ? "transform"
      : diagnosis === "discrimination_gap"
        ? "discriminate"
        : diagnosis === "transfer_gap"
          ? "apply_transfer"
          : "predict";
  }

  switch (diagnosis) {
    case "recall_gap":
      return "predict";
    case "representation_gap":
      return "explain";
    case "procedure_gap":
      return "transform";
    case "discrimination_gap":
      return "discriminate";
    case "transfer_gap":
      return "apply_transfer";
    default:
      return "explain";
  }
}

function buildLearnerFacingProbeTitle(
  topic: RouteTopic,
  probeType: ProbeType
) {
  switch (probeType) {
    case "predict":
      return `Predict what happens in ${topic.name}`;
    case "discriminate":
      return `Distinguish ${topic.name}`;
    case "transform":
      return `Walk through ${topic.name}`;
    case "apply_transfer":
      return `Apply ${topic.name} in a new situation`;
    case "explain":
    default:
      return `Explain ${topic.name}`;
  }
}

function buildLearnerFacingInstructionalGoal(
  topic: RouteTopic,
  probeType: ProbeType
) {
  switch (probeType) {
    case "predict":
      return `Predict what would happen in a simple case involving ${topic.name}, and explain why.`;
    case "discriminate":
      return `Explain the key difference that helps distinguish ${topic.name} from a closely related idea.`;
    case "transform":
      return `Walk through ${topic.name} step by step and explain why the order matters.`;
    case "apply_transfer":
      return `Apply ${topic.name} in a new but related situation and explain what changes.`;
    case "explain":
    default:
      return `Explain ${topic.name} in your own words, focusing on the key relationship or mechanism.`;
  }
}

function buildInternalDiagnosticGoal(
  topic: RouteTopic,
  probeType: ProbeType
) {
  switch (probeType) {
    case "predict":
      return `Check whether the learner can anticipate outcomes in ${topic.name}.`;
    case "discriminate":
      return `Check whether the learner can distinguish ${topic.name} from nearby ideas.`;
    case "transform":
      return `Check whether the learner can express ${topic.name} as a coherent ordered process.`;
    case "apply_transfer":
      return `Check whether the learner can transfer ${topic.name} into a changed setting.`;
    case "explain":
    default:
      return `Check whether the learner can explain ${topic.name} coherently.`;
  }
}

function buildInitialPromptForProbe(args: {
  topic: RouteTopic;
  diagnosis: DiagnosisType;
  probeType: ProbeType;
}) {
  const { topic, diagnosis, probeType } = args;

  switch (probeType) {
    case "predict":
      return `Predict what would happen in a simple case involving ${topic.name}, and explain why.`;
    case "discriminate":
      return `What is the key difference that helps distinguish ${topic.name} from a closely related idea? Explain the difference clearly.`;
    case "transform":
      return `Walk through ${topic.name} as a step-by-step process. What happens first, what happens next, and why does the order matter?`;
    case "apply_transfer":
      return `Apply ${topic.name} in a new but related situation. What stays the same, what changes, and why?`;
    case "explain":
    default:
      return diagnosis === "representation_gap"
        ? `Can you explain ${topic.name} in your own words, focusing on the key relationship or mechanism?`
        : `Can you explain ${topic.name} clearly in your own words?`;
  }
}

function buildInitialJudgingSupport(args: {
  topic: RouteTopic;
  diagnosis: DiagnosisType;
  probeType: ProbeType;
}) {
  const { topic, diagnosis, probeType } = args;

  if (probeType === "predict") {
    return {
      rubric_notes: [
        `Judge whether the learner can make a justified prediction about ${topic.name}.`,
        "Prefer supported prediction over guess-like wording.",
      ],
      evidence_type_expected: ["predict"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "prediction_quality",
        "causal_basis",
        "topic_grounding",
      ],
      target_misconceptions: [
        "guess without justification",
        "surface recall without usable prediction",
      ],
      success_indicators: [
        "The learner makes a concrete prediction.",
        "The learner connects the prediction to a meaningful reason.",
      ],
      failure_indicators: [
        "The learner gives only a guess or vague anticipation.",
        "The learner cannot ground the prediction in the concept.",
      ],
    };
  }

  if (probeType === "discriminate") {
    return {
      rubric_notes: [
        `Judge whether the learner can distinguish ${topic.name} from nearby ideas using a decisive difference.`,
      ],
      evidence_type_expected: ["discriminate"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "contrast_quality",
        "boundary_marker",
        "decisive_difference",
      ],
      target_misconceptions: [
        "blurred category boundary",
        "listing without distinction",
      ],
      success_indicators: [
        "The learner identifies a decisive difference.",
        "The learner explains why that difference matters.",
      ],
      failure_indicators: [
        "The learner stays vague about the distinction.",
        "The learner lists traits without drawing a boundary.",
      ],
    };
  }

  if (probeType === "transform") {
    return {
      rubric_notes: [
        `Judge whether the learner can express ${topic.name} as a coherent ordered process.`,
      ],
      evidence_type_expected: ["explain"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "sequencing",
        "step_linkage",
        "order_dependence",
      ],
      target_misconceptions: [
        "misordered reasoning",
        "disconnected steps",
      ],
      success_indicators: [
        "The learner explains the process in a sensible order.",
        "The learner explains why one step leads to the next.",
      ],
      failure_indicators: [
        "The learner gives disconnected steps.",
        "The learner cannot explain why the order matters.",
      ],
    };
  }

  if (probeType === "apply_transfer") {
    return {
      rubric_notes: [
        `Judge whether the learner can carry the core idea of ${topic.name} into a changed setting.`,
      ],
      evidence_type_expected: ["apply_transfer"] as Array<
        "predict" | "explain" | "discriminate" | "apply_transfer"
      >,
      response_features_to_extract: [
        "structure_preservation",
        "changed_condition_handling",
        "transfer_success",
      ],
      target_misconceptions: [
        "surface wording without transferable structure",
        "failed transfer despite apparent familiarity",
      ],
      success_indicators: [
        "The learner preserves the core idea in the new case.",
        "The learner identifies what changes and what stays the same.",
      ],
      failure_indicators: [
        "The learner only repeats the original wording.",
        "The learner cannot adapt the idea to the new setting.",
      ],
    };
  }

  return {
    rubric_notes: [
      `Judge whether the learner can explain ${topic.name} with connected reasoning.`,
      `The current diagnosis focus is ${diagnosis}.`,
      "Prefer structural understanding over phrase matching.",
    ],
    evidence_type_expected: ["explain"] as Array<
      "predict" | "explain" | "discriminate" | "apply_transfer"
    >,
    response_features_to_extract: [
      "mechanistic clarity",
      "missing step",
      "misordered reasoning",
      "topic_grounding",
    ],
    target_misconceptions: [
      "surface familiarity without mechanism",
      "memorized wording without causal structure",
    ],
    success_indicators: [
      "The learner explains the concept in a connected way.",
      "The learner names the critical steps or relationships.",
    ],
    failure_indicators: [
      "The learner gives only isolated facts.",
      "The learner cannot connect the concept to the asked task.",
    ],
  };
}

function computeReadinessSignal(args: {
  preferredModality: RendererModality;
  modelSignals?: ModelSignals;
  currentInteractionContext?: CurrentInteractionContext;
  newAttempt?: NewAttempt;
  resolutionKind: TopicResolutionKind;
}) {
  const {
    preferredModality,
    modelSignals,
    currentInteractionContext,
    newAttempt,
    resolutionKind,
  } = args;

  const base =
    preferredModality === "interactive"
      ? 0.64
      : preferredModality === "video"
        ? 0.56
        : 0.58;

  const confusion = modelSignals?.model_confusion;
  const insight = modelSignals?.model_insight;

  let adjusted = base;

  if (currentInteractionContext?.run_kind === "attempt_run") {
    adjusted += 0.18;
  } else if (currentInteractionContext?.run_kind === "clarify_followup") {
    adjusted += 0.06;
  }

  if (currentInteractionContext?.is_response_to_delivered_probe) {
    adjusted += 0.18;
  }

  if (newAttempt?.status === "present") {
    adjusted += 0.14;
  }

  if (resolutionKind === "fallback_active_topic") {
    adjusted -= 0.12;
  } else if (resolutionKind === "fallback_existing_topic") {
    adjusted -= 0.08;
  } else if (resolutionKind === "created_new_candidate") {
    adjusted -= 0.04;
  }

  if (typeof confusion === "number") {
    adjusted -= confusion * 0.18;
  }

  if (typeof insight === "number") {
    adjusted += insight * 0.16;
  }

  return clamp(adjusted, 0, 1);
}

function computeActiveProblemSignal(
  topic: RouteTopic,
  resolutionKind: TopicResolutionKind
) {
  const base = topic.nextStep ? 0.72 : 0.5;

  const resolutionBonus =
    resolutionKind === "created_new_candidate"
      ? 0.06
      : resolutionKind === "fallback_active_topic"
        ? 0.02
        : 0;

  return clamp(base + resolutionBonus, 0, 1);
}

function computeHistorySignal(args: {
  resolutionKind: TopicResolutionKind;
  currentInteractionContext?: CurrentInteractionContext;
}) {
  const { resolutionKind, currentInteractionContext } = args;

  let value =
    resolutionKind === "created_new_candidate"
      ? 0.18
      : resolutionKind === "fallback_active_topic"
        ? 0.34
        : resolutionKind === "fallback_existing_topic"
          ? 0.3
          : resolutionKind === "no_match"
            ? 0.24
            : 0.42;

  if (currentInteractionContext?.prior_mode_selected === "clarify") {
    value += 0.14;
  }

  if (currentInteractionContext?.prior_mode_outcome_available) {
    value += 0.1;
  }

  if (currentInteractionContext?.is_response_to_delivered_probe) {
    value += 0.18;
  }

  return clamp(value, 0, 1);
}

function computeRawResponseSignal(
  message: string,
  currentInteractionContext?: CurrentInteractionContext,
  newAttempt?: NewAttempt
) {
  const trimmed = message.trim();
  if (!trimmed) return 0;

  let base = 0;

  if (trimmed.length < 20) base = 0.28;
  else if (trimmed.length < 60) base = 0.46;
  else base = 0.62;

  if (currentInteractionContext?.run_kind === "attempt_run") {
    base += 0.14;
  }

  if (newAttempt?.status === "present") {
    base += 0.12;
  }

  return clamp(base, 0, 1);
}

function computeEvidenceQualitySignal(args: {
  modelSignals?: ModelSignals;
  currentInteractionContext?: CurrentInteractionContext;
  newAttempt?: NewAttempt;
}) {
  const { modelSignals, currentInteractionContext, newAttempt } = args;
  const confusion = modelSignals?.model_confusion;
  const insight = modelSignals?.model_insight;

  let value =
    typeof confusion === "number" && typeof insight === "number"
      ? clamp(0.5 + insight * 0.35 - confusion * 0.3, 0, 1)
      : 0.42;

  if (currentInteractionContext?.is_response_to_delivered_probe) {
    value += 0.14;
  }

  if (newAttempt?.status === "present") {
    value += 0.1;
  }

  return clamp(value, 0, 1);
}

function computeAttemptReadinessSignal(args: {
  currentInteractionContext?: CurrentInteractionContext;
  newAttempt?: NewAttempt;
}) {
  const { currentInteractionContext, newAttempt } = args;

  let value = 0.2;

  if (currentInteractionContext?.run_kind === "attempt_run") value += 0.3;
  if (currentInteractionContext?.is_response_to_delivered_probe) value += 0.28;
  if (newAttempt?.status === "present") value += 0.22;

  return clamp(value, 0, 1);
}

function computeClarifyPressureSignal(args: {
  message: string;
  resolutionKind: TopicResolutionKind;
  currentInteractionContext?: CurrentInteractionContext;
  modelSignals?: ModelSignals;
}) {
  const { message, resolutionKind, currentInteractionContext, modelSignals } = args;

  let value = 0.14;

  if (messageLooksClarifySeeking(message)) {
    value += 0.3;
  }

  if (resolutionKind === "created_new_candidate") {
    value += 0.16;
  } else if (resolutionKind === "fallback_active_topic") {
    value += 0.22;
  } else if (resolutionKind === "fallback_existing_topic") {
    value += 0.16;
  } else if (resolutionKind === "no_match") {
    value += 0.12;
  }

  if (currentInteractionContext?.run_kind === "initial_question") {
    value += 0.08;
  }

  if (currentInteractionContext?.run_kind === "clarify_followup") {
    value += 0.12;
  }

  if (typeof modelSignals?.model_confusion === "number") {
    value += modelSignals.model_confusion * 0.22;
  }

  return clamp(value, 0, 1);
}

function computeProbePressureSignal(args: {
  topic: RouteTopic;
  resolutionKind: TopicResolutionKind;
  currentInteractionContext?: CurrentInteractionContext;
  newAttempt?: NewAttempt;
  modelSignals?: ModelSignals;
  topSimilarity: number;
}) {
  const {
    topic,
    resolutionKind,
    currentInteractionContext,
    newAttempt,
    modelSignals,
    topSimilarity,
  } = args;

  let value = 0.18;

  if (resolutionKind === "matched_existing") {
    value += 0.12;
  } else if (resolutionKind === "created_new_candidate") {
    value += 0.02;
  } else if (resolutionKind === "fallback_existing_topic") {
    value -= 0.04;
  } else if (resolutionKind === "fallback_active_topic") {
    value -= 0.1;
  } else if (resolutionKind === "no_match") {
    value -= 0.08;
  }

  if (topic.nextStep) {
    value += 0.08;
  }

  if (topSimilarity >= 0.62) {
    value += 0.16;
  } else if (topSimilarity <= 0.4) {
    value -= 0.06;
  }

  if (currentInteractionContext?.run_kind === "attempt_run") {
    value += 0.18;
  }

  if (currentInteractionContext?.is_response_to_delivered_probe) {
    value += 0.24;
  }

  if (newAttempt?.status === "present") {
    value += 0.18;
  }

  if (currentInteractionContext?.prior_mode_selected === "clarify") {
    value += 0.12;
  }

  if (typeof modelSignals?.model_insight === "number") {
    value += modelSignals.model_insight * 0.18;
  }

  if (typeof modelSignals?.model_confusion === "number") {
    value -= modelSignals.model_confusion * 0.08;
  }

  return clamp(value, 0, 1);
}

function computeInterventionScores(args: InterventionScoreArgs) {
  const {
    topic,
    vectorInfo,
    preferredModality,
    message,
    createdTopic,
    topicResolutionKind,
    modelSignals,
    currentInteractionContext,
    newAttempt,
  } = args;

  const resolutionKind = resolveTopicResolutionKind(
    createdTopic,
    topicResolutionKind
  );

  const diagnosis = inferDiagnosisFromTopic(topic);
  const topSimilarity = vectorInfo.top_k_similarity_scores[0] ?? 0.3;
  const clarifySeeking = messageLooksClarifySeeking(message);
  const confusion = modelSignals?.model_confusion;
  const insight = modelSignals?.model_insight;

  const readinessSignal = computeReadinessSignal({
    preferredModality,
    modelSignals,
    currentInteractionContext,
    newAttempt,
    resolutionKind,
  });

  const activeProblemSignal = computeActiveProblemSignal(topic, resolutionKind);

  const historySignal = computeHistorySignal({
    resolutionKind,
    currentInteractionContext,
  });

  const rawResponseSignal = computeRawResponseSignal(
    message,
    currentInteractionContext,
    newAttempt
  );

  const evidenceQualitySignal = computeEvidenceQualitySignal({
    modelSignals,
    currentInteractionContext,
    newAttempt,
  });

  const attemptReadinessSignal = computeAttemptReadinessSignal({
    currentInteractionContext,
    newAttempt,
  });

  const clarifyPressureSignal = computeClarifyPressureSignal({
    message,
    resolutionKind,
    currentInteractionContext,
    modelSignals,
  });

  const probePressureSignal = computeProbePressureSignal({
    topic,
    resolutionKind,
    currentInteractionContext,
    newAttempt,
    modelSignals,
    topSimilarity,
  });

  let clarifyScore =
    0.16 +
    clarifyPressureSignal * 0.42 +
    activeProblemSignal * 0.08 +
    (clarifySeeking ? 0.08 : 0);

  let probeScore =
    0.18 +
    probePressureSignal * 0.34 +
    readinessSignal * 0.12 +
    attemptReadinessSignal * 0.16 +
    evidenceQualitySignal * 0.1;

  if (typeof confusion === "number") {
    if (confusion >= 0.7) {
      clarifyScore += 0.14;
      probeScore -= 0.06;
    } else if (confusion >= 0.55) {
      clarifyScore += 0.08;
      probeScore -= 0.02;
    } else if (confusion <= 0.35) {
      probeScore += 0.05;
    }
  }

  if (typeof insight === "number") {
    if (insight >= 0.6) {
      probeScore += 0.12;
    } else if (insight >= 0.45) {
      probeScore += 0.06;
    } else if (insight <= 0.2) {
      clarifyScore += 0.05;
    }
  }

  if (currentInteractionContext?.is_response_to_delivered_probe) {
    probeScore += 0.12;
  }

  if (currentInteractionContext?.prior_mode_selected === "clarify") {
    probeScore += 0.08;
  }

  if (preferredModality === "interactive") {
    probeScore += 0.03;
  }

  if (preferredModality === "video" && clarifySeeking) {
    clarifyScore += 0.03;
  }

  if (resolutionKind === "fallback_active_topic") {
    clarifyScore += 0.08;
    probeScore -= 0.04;
  } else if (resolutionKind === "fallback_existing_topic") {
    clarifyScore += 0.04;
    probeScore -= 0.02;
  } else if (resolutionKind === "no_match") {
    clarifyScore += 0.06;
    probeScore -= 0.03;
  }

  clarifyScore = clamp(clarifyScore, 0, 0.95);
  probeScore = clamp(probeScore, 0, 0.95);

  const mode_selected: "clarify" | "probe" =
    clarifyScore >= probeScore ? "clarify" : "probe";

  const resolutionReason =
    resolutionKind === "created_new_candidate"
      ? "This target topic was newly created, so stabilization has extra value."
      : resolutionKind === "fallback_active_topic"
        ? "Topic targeting stayed conservative by reusing the currently active topic, which increases the value of clarification."
        : resolutionKind === "fallback_existing_topic"
          ? "Topic targeting used a conservative existing-topic fallback, so the system should avoid overconfident measurement."
          : resolutionKind === "no_match"
            ? "Topic targeting remained uncertain, so the system should stay conservative before measuring aggressively."
            : "The topic match looked strong enough to support a focused next-step decision.";

  const decision_reasons =
    mode_selected === "clarify"
      ? [
          `The message connects most strongly to ${topic.name}.`,
          resolutionReason,
          currentInteractionContext?.run_kind === "clarify_followup"
            ? "This still looks like clarification-oriented stabilization rather than a fair measurement moment."
            : "The current message looks more like a need for stabilization than an immediate readiness signal for measurement.",
          typeof confusion === "number"
            ? `Confusion signal is ${confusion.toFixed(2)}, which increases the value of clarifying before probing.`
            : "No confusion/insight score was available, so the route stayed conservative where the message itself suggested clarification.",
          `The current block still appears to be: ${topic.nextStep}.`,
        ]
      : [
          `The message connects most strongly to ${topic.name}.`,
          resolutionReason,
          currentInteractionContext?.is_response_to_delivered_probe
            ? "This run is positioned like a response to a previously delivered probe, which increases measurement value."
            : currentInteractionContext?.prior_mode_selected === "clarify"
              ? "Clarification appears to have already been attempted, so there is stronger pressure to gather evidence now."
              : "The topic and interaction state together look ready for a focused measurement step.",
          typeof insight === "number"
            ? `Insight signal is ${insight.toFixed(2)}, which supports moving toward a focused measurement step.`
            : "The message and topic state together look ready for a focused measurement step.",
          `The next unresolved learning move appears to be: ${topic.nextStep}.`,
        ];

  const winningScore = mode_selected === "clarify" ? clarifyScore : probeScore;
  const losingScore = mode_selected === "clarify" ? probeScore : clarifyScore;
  const margin = Math.max(0, winningScore - losingScore);

  const decisionConfidence = clamp(
    0.46 + winningScore * 0.24 + margin * 0.34 + evidenceQualitySignal * 0.08,
    0,
    0.95
  );

  return {
    diagnosis,
    mode_selected,
    clarifyScore,
    probeScore,
    decisionConfidence,
    decision_reasons,
    signalSummary: {
      raw_response_signal: rawResponseSignal,
      evidence_quality_signal: evidenceQualitySignal,
      active_problem_signal: activeProblemSignal,
      readiness_signal: readinessSignal,
      history_signal: historySignal,
    },
  };
}

export function buildInterventionModeDecision(
  topic: RouteTopic,
  vectorInfo: VectorInfo,
  preferredModality: RendererModality,
  message: string,
  createdTopic: boolean,
  modelSignals?: ModelSignals,
  currentInteractionContext?: CurrentInteractionContext,
  newAttempt?: NewAttempt,
  topicResolutionKind?: TopicResolutionKind
): InterventionModeDecision {
  const computed = computeInterventionScores({
    topic,
    vectorInfo,
    preferredModality,
    message,
    createdTopic,
    topicResolutionKind,
    modelSignals,
    currentInteractionContext,
    newAttempt,
  });

  return {
    mode_selected: computed.mode_selected,
    target_topic_id: topic.id,
    active_diagnosis: computed.diagnosis,
    primary_block: topic.nextStep,
    decision_confidence: computed.decisionConfidence,
    decision_reasons: computed.decision_reasons,
    clarify_score: computed.clarifyScore,
    probe_score: computed.probeScore,
    signal_summary: computed.signalSummary,
  };
}

export function buildProbePlan(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  message: string
): ProbePlan {
  const preferredModality = inferPreferredModality(message, "probe");
  const diagnosis = decision.active_diagnosis ?? inferDiagnosisFromTopic(topic);
  const probeType = selectInitialProbeType(diagnosis, preferredModality);
  const probeId = makeId(`probe-${topic.id}`);

  const learnerFacingTitle = buildLearnerFacingProbeTitle(topic, probeType);
  const learnerFacingGoal = buildLearnerFacingInstructionalGoal(topic, probeType);
  const instruction = buildInitialPromptForProbe({
    topic,
    diagnosis,
    probeType,
  });

  const judgingSupport = buildInitialJudgingSupport({
    topic,
    diagnosis,
    probeType,
  });

  return {
    status: "applicable",
    probe_id: probeId,
    target_topic_id: topic.id,
    target_diagnosis: diagnosis,
    intent: "diagnostic",
    probe_type: probeType,
    expected_response_type: "text",

    renderer_request: {
      preferred_modality: preferredModality,
      preferred_generator:
        preferredModality === "video"
          ? "sora"
          : preferredModality === "interactive"
            ? "custom"
            : "chatgpt",
      allowed_modalities: ["text", "video", "interactive"],
      allowed_generators: ["chatgpt", "sora", "custom"],
      fallback_renderer_order: ["text", "video", "interactive"],
      must_preserve_probe_intent: true,
      must_match_requested_modality: false,
      allow_null_delivery_on_failure: false,
    },

    judging_support: judgingSupport,

    text_plan: {
      status: "planned",
      pedagogical_role: "guided_question",
      diagnostic_goal: buildInternalDiagnosticGoal(topic, probeType),
      instructional_goal: learnerFacingGoal,
      why_text: [
        "Text is the safest fallback renderer during contract-proving.",
        "A text prompt keeps the plan easy to judge and easy to store.",
      ],
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples:
          probeType === "predict" || probeType === "apply_transfer"
            ? ["Use a simple changed case or scenario."]
            : [],
        selected_contrasts:
          probeType === "discriminate"
            ? ["Contrast against a nearby but importantly different idea."]
            : [],
        selected_misconceptions: judgingSupport.target_misconceptions,
        selected_context: topic.nextStep,
      },
      scaffolding: {
        hint_policy: "available_on_request",
        max_hint_steps: 2,
        allow_partial_credit: true,
        allow_retry: true,
        max_retries: 1,
      },
      personalization_application: {
        tone: "encouraging",
        verbosity: "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay grounded in ${topic.name} and the learner's current next step.`,
        motivation_strategy: "curiosity_based",
        adaptation_reasons: [
          "Use supportive prompting while preserving measurement value.",
          `Initial probe type selected from diagnosis: ${diagnosis}.`,
        ],
      },
      measurement_intent:
        probeType === "predict"
          ? {
              what_response_should_reveal: [
                "Whether the learner can make a justified prediction.",
              ],
              what_would_count_as_progress: [
                "A prediction tied to the concept rather than a guess.",
              ],
            }
          : probeType === "discriminate"
            ? {
                what_response_should_reveal: [
                  "Whether the learner can identify the decisive difference between nearby ideas.",
                ],
                what_would_count_as_progress: [
                  "A clear contrast with an explanation of why it matters.",
                ],
              }
            : probeType === "transform"
              ? {
                  what_response_should_reveal: [
                    "Whether the learner can express the idea as a coherent ordered process.",
                  ],
                  what_would_count_as_progress: [
                    "A connected sequence with meaningful step linkage.",
                  ],
                }
              : probeType === "apply_transfer"
                ? {
                    what_response_should_reveal: [
                      "Whether the learner can preserve the core idea in a changed setting.",
                    ],
                    what_would_count_as_progress: [
                      "Correctly mapping the same structure into a new case.",
                    ],
                  }
                : {
                    what_response_should_reveal: [
                      "Whether the learner understands the key structure of the topic.",
                      "Whether the learner can explain rather than merely name it.",
                    ],
                    what_would_count_as_progress: [
                      "A coherent explanation with at least one meaningful relationship or mechanism.",
                    ],
                  },
    },

    video_plan: {
      status: preferredModality === "video" ? "planned" : "not_selected",
      pedagogical_role: "micro_explanation",
      diagnostic_goal: `Support visual grounding for ${topic.name}.`,
      instructional_goal: `Make the next step more concrete before asking for a response.`,
      why_video: ["The message suggests a visual explanation may help."],
      visual_learning_goal: {
        what_the_learner_should_notice_first: [topic.name],
        what_should_change_over_time: [
          "The causal or temporal progression of the concept.",
        ],
        what_should_remain_fixed: ["The core entities involved."],
        target_visual_contrast: ["correct progression vs incomplete mental model"],
      },
      content_selection: {
        source_mode: "generated",
        selected_concepts: [topic.name],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: topic.nextStep,
      },
      storyboard_intent: {
        shot_count: 3,
        single_shot_vs_sequence: "multi_shot",
        timing_beats: [
          "Introduce the concept",
          "Show the key relationship",
          "Pause before full resolution",
        ],
        pause_for_attempt: true,
        pause_goal:
          "Invite the learner to explain what they now think is happening.",
        must_stop_before_full_answer: true,
      },
      personalization_application: {
        tone: "encouraging",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Explain only enough to support the next attempt in ${topic.name}.`,
        visual_complexity: "moderate",
        visual_style_preference: "diagrammatic",
        adaptation_reasons: [
          "The user may benefit from a visual bridge into the probe.",
        ],
      },
      measurement_intent: {
        what_response_should_reveal: [
          "Whether the learner can describe the core mechanism after visual support.",
        ],
        what_visual_takeaway_should_precede_response: [
          "The learner should notice the central structural relationship before answering.",
        ],
      },
    },

    interactive_plan: {
      status: preferredModality === "interactive" ? "planned" : "placeholder",
      pedagogical_role: "manipulate_and_predict",
      diagnostic_goal: `Eventually test whether the learner can act on ${topic.name}, not just describe it.`,
      instructional_goal: `Preserve a future seam for richer interactive probes.`,
      why_interactive: [
        "This remains a placeholder seam during the current contract-proving phase.",
      ],
      task_model: {
        interaction_type: "multi_stage",
        cognitive_operation:
          probeType === "predict"
            ? "predict"
            : probeType === "discriminate"
              ? "compare"
              : probeType === "transform"
                ? "transform"
                : probeType === "apply_transfer"
                  ? "construct"
                  : "predict",
        statefulness: "multi_step",
      },
      scaffolding: {
        hint_policy: "available_on_request",
        max_hint_steps: 2,
        allow_partial_credit: true,
        allow_retry: true,
        max_retries: 1,
        feedback_timing: "after_submit",
      },
      personalization_application: {
        tone: "encouraging",
        pacing: "normal",
        interaction_density: "medium",
        adaptation_reasons: ["Reserved for future interactive renderer support."],
      },
      measurement_intent: {
        telemetry_to_watch: [
          "latency",
          "revision_count",
          "hint_usage",
          "error_pattern",
        ],
        what_response_should_reveal: [
          "Whether the learner can successfully manipulate the concept.",
        ],
      },
    },

    text_payload: {
      ready_to_send: true,
      api: "responses",
      model: "gpt-5.4",
      instructions:
        "You are rendering a MyWay probe. Do not over-explain. Ask only enough to reveal the learner's understanding. Preserve the requested probe intent and avoid giving the final answer.",
      input: `${learnerFacingTitle}\n\n${instruction}`,
      personalization_snapshot: {
        tone: "encouraging",
        verbosity: "medium",
        pacing: "normal",
        language_style: "plain",
        context_framing: `Stay focused on ${topic.name}.`,
      },
      rendering_contract: {
        output_form: "guided_question",
        answer_reveal_policy: "do_not_reveal",
        closing_action:
          probeType === "predict"
            ? "ask_for_prediction"
            : probeType === "apply_transfer" || probeType === "transform"
              ? "ask_for_transformation"
              : "ask_for_explanation",
        max_length: "medium",
      },
    },

    video_payload: {
      ready_to_send: preferredModality === "video",
      api: "videos",
      endpoint: "/v1/videos",
      model: preferredModality === "video" ? "sora-2" : null,
      size: "1280x720",
      seconds: 8,
      prompt:
        preferredModality === "video"
          ? `Create a concise educational animation about ${topic.name}. Show only enough to prepare the learner for a follow-up response task about: ${topic.nextStep}.`
          : null,
      narration:
        preferredModality === "video"
          ? `Guide the learner toward the key structure of ${topic.name}, then pause before giving the full answer.`
          : null,
      visual_constraints: [
        "Keep visuals clean and educational.",
        "Do not fully resolve the answer before the learner responds.",
      ],
    },

    interactive_payload: {
      ready_to_send: false,
      renderer: null,
      task_type: null,
      prompt: null,
      config: null,
    },
  };
}

export function buildNotApplicableProbePlan(topic: RouteTopic): ProbePlan {
  return {
    status: "not_applicable",
    probe_id: makeId(`probe-na-${topic.id}`),
    target_topic_id: topic.id,
    target_diagnosis: inferDiagnosisFromTopic(topic),
    intent: null,
    probe_type: null,
    expected_response_type: null,

    renderer_request: {
      preferred_modality: null,
      preferred_generator: null,
      allowed_modalities: ["text", "video", "interactive"],
      allowed_generators: ["chatgpt", "sora", "custom"],
      fallback_renderer_order: ["text", "video", "interactive"],
      must_preserve_probe_intent: false,
      must_match_requested_modality: false,
      allow_null_delivery_on_failure: true,
    },

    judging_support: {
      rubric_notes: [],
      evidence_type_expected: [],
      response_features_to_extract: [],
      target_misconceptions: [],
      success_indicators: [],
      failure_indicators: [],
    },

    text_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_text: [],
      content_selection: {
        source_mode: null,
        selected_concepts: [],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: null,
      },
      scaffolding: {
        hint_policy: null,
        max_hint_steps: null,
        allow_partial_credit: null,
        allow_retry: null,
        max_retries: null,
      },
      personalization_application: {
        tone: null,
        verbosity: null,
        pacing: null,
        language_style: null,
        context_framing: null,
        motivation_strategy: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        what_response_should_reveal: [],
        what_would_count_as_progress: [],
      },
    },

    video_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_video: [],
      visual_learning_goal: {
        what_the_learner_should_notice_first: [],
        what_should_change_over_time: [],
        what_should_remain_fixed: [],
        target_visual_contrast: [],
      },
      content_selection: {
        source_mode: null,
        selected_concepts: [],
        selected_examples: [],
        selected_contrasts: [],
        selected_misconceptions: [],
        selected_context: null,
      },
      storyboard_intent: {
        shot_count: null,
        single_shot_vs_sequence: null,
        timing_beats: [],
        pause_for_attempt: null,
        pause_goal: null,
        must_stop_before_full_answer: null,
      },
      personalization_application: {
        tone: null,
        pacing: null,
        language_style: null,
        context_framing: null,
        visual_complexity: null,
        visual_style_preference: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        what_response_should_reveal: [],
        what_visual_takeaway_should_precede_response: [],
      },
    },

    interactive_plan: {
      status: "not_applicable",
      pedagogical_role: null,
      diagnostic_goal: null,
      instructional_goal: null,
      why_interactive: [],
      task_model: {
        interaction_type: null,
        cognitive_operation: null,
        statefulness: null,
      },
      scaffolding: {
        hint_policy: null,
        max_hint_steps: null,
        allow_partial_credit: null,
        allow_retry: null,
        max_retries: null,
        feedback_timing: null,
      },
      personalization_application: {
        tone: null,
        pacing: null,
        interaction_density: null,
        adaptation_reasons: [],
      },
      measurement_intent: {
        telemetry_to_watch: [],
        what_response_should_reveal: [],
      },
    },

    text_payload: {
      ready_to_send: false,
      api: null,
      model: null,
      instructions: null,
      input: null,
      personalization_snapshot: {
        tone: null,
        verbosity: null,
        pacing: null,
        language_style: null,
        context_framing: null,
      },
      rendering_contract: {
        output_form: null,
        answer_reveal_policy: null,
        closing_action: null,
        max_length: null,
      },
    },

    video_payload: {
      ready_to_send: false,
      api: null,
      endpoint: null,
      model: null,
      size: null,
      seconds: null,
      prompt: null,
      narration: null,
      visual_constraints: [],
    },

    interactive_payload: {
      ready_to_send: false,
      renderer: null,
      task_type: null,
      prompt: null,
      config: null,
    },
  };
}

export function buildUpdatedMetrics(
  topicId: string,
  topic: RouteTopic
): TopicMetricUpdate {
  const confusion =
    topic.confusion >= 0.75
      ? clamp(topic.confusion - 0.01, 0, 1)
      : topic.confusion >= 0.5
        ? clamp(topic.confusion - 0.03, 0, 1)
        : clamp(topic.confusion - 0.05, 0, 1);

  const insight =
    topic.insight <= 0.25
      ? clamp(topic.insight + 0.03, 0, 1)
      : clamp(topic.insight + 0.05, 0, 1);

  const learningScore =
    topic.confusion >= 0.7
      ? clamp(topic.learningScore + 0.01, 0, 1)
      : clamp(topic.learningScore + 0.04, 0, 1);

  return {
    topicId,
    confusion,
    insight,
    learningScore,
  };
}

export function applyMetricUpdate(
  topic: RouteTopic,
  update: TopicMetricUpdate
): RouteTopic {
  if (topic.id !== update.topicId) return topic;

  return {
    ...topic,
    confusion: update.confusion ?? topic.confusion,
    insight: update.insight ?? topic.insight,
    learningScore: update.learningScore ?? topic.learningScore,
  };
}