import { NextResponse } from "next/server";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { makeId } from "@/lib/utils/ids";
import type {
  DeliveredProbe,
  DeliveredResponse,
  EngineFuel,
  InterventionModeDecision,
  LearningSpace,
  MessageRouteRequest,
  MessageRouteResponse,
  ModelSignals,
  MyWayRunResult,
  PreviousModeOutcome,
  ProbePlan,
  RunMetadata,
  TopicState,
  VectorInfo,
  ImportantRunInputs,
} from "@/types/contracts";
import {
  buildSeededTopicFromMessage,
  inferKeywordsFromMessage,
  loadRouteTopics,
  resolveTopicForMessage,
  type RouteTopic,
} from "@/lib/runtime/topic-resolution";
import {
  applyMetricUpdate,
  buildImportantRunInputs,
  buildInterventionModeDecision,
  buildNotApplicableProbePlan,
  buildProbePlan,
  buildUpdatedMetrics,
  inferPreferredModality,
  messageLooksClarifySeeking,
} from "@/lib/runtime/message-runtime";
import { nowIso } from "@/lib/runtime/shared";
import { scoreConfusionInsight } from "@/lib/providers/confusion-insight";
import { buildRecentChatHistory } from "@/lib/runtime/chat-history";

type RawLearningSpaceTopic = {
  topic_id?: string;
  label?: string;
  topic_name?: string;
  position?: [number, number, number];
  render_state?: {
    radius?: number;
    surface_noise?: number;
    spin_rate?: number;
    saturation?: number;
    is_star?: boolean;
  };
  satellite_count?: number;
  satellites?: Array<{
    satellite_id?: string;
    orbit_angle?: number;
    linked_attempt_id?: string | null;
  }>;
};

type RawLearningSpaceCluster = {
  cluster_id?: string;
  label?: string;
  cluster_centroid?: [number, number, number];
  member_topic_ids?: string[];
};

type RawLearningSpace = {
  space_version?: "v1";
  topics?: RawLearningSpaceTopic[];
  clusters?: RawLearningSpaceCluster[];
};

type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

type MessageRouteBody = MessageRouteRequest & {
  message?: string;
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];
};

type DeliveredRendererSelection = {
  modality: "text" | "video" | "interactive";
  generator: "chatgpt" | "sora" | "custom";
  renderer_type: "text_renderer" | "video_renderer" | "interactive_renderer";
};

type RouteResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

type TopicResolutionOutcome = {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: RouteResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
};

function normalizeRecentTurns(body: MessageRouteBody) {
  const rawTurns = Array.isArray(body.recent_turns)
    ? body.recent_turns
    : Array.isArray(body.conversation_turns)
      ? body.conversation_turns
      : [];

  return rawTurns
    .map((turn) => {
      const rawRole = typeof turn.role === "string" ? turn.role : "user";
      const role = rawRole === "assistant" ? "assistant" : "user";
      const text =
        typeof turn.text === "string"
          ? turn.text
          : typeof turn.content === "string"
            ? turn.content
            : "";

      return {
        role,
        text: text.trim(),
      };
    })
    .filter((turn) => turn.text.length > 0) as Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

function buildChatHistoryFromBody(body: MessageRouteBody) {
  if (typeof body.chat_history === "string" && body.chat_history.trim()) {
    return body.chat_history.trim();
  }

  const recentTurns = normalizeRecentTurns(body);

  if (!recentTurns.length) {
    return "";
  }

  return buildRecentChatHistory(recentTurns, 6);
}

function inferMessageRouteRunKind(args: {
  message: string;
  recentTurns: Array<{ role: "user" | "assistant"; text: string }>;
  hasActiveTopicId: boolean;
}) {
  const { message, recentTurns, hasActiveTopicId } = args;

  if (messageLooksClarifySeeking(message)) {
    return hasActiveTopicId || recentTurns.length > 0
      ? ("clarify_followup" as const)
      : ("initial_question" as const);
  }

  const userTurnCount = recentTurns.filter((turn) => turn.role === "user").length;
  const assistantTurnCount = recentTurns.filter(
    (turn) => turn.role === "assistant"
  ).length;

  if (hasActiveTopicId && assistantTurnCount > 0 && userTurnCount > 0) {
    return "mixed" as const;
  }

  return "initial_question" as const;
}

function buildProbeReply(
  topicName: string,
  diagnosis: InterventionModeDecision["active_diagnosis"]
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

  return `I think your message connects most strongly to ${topicName}. Right now, ${diagnosisText}, so I’m moving us there and preparing a focused next step to reveal what you already understand.`;
}

function buildClarifyReply(
  topicName: string,
  diagnosis: InterventionModeDecision["active_diagnosis"]
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

  return `I think your message connects most strongly to ${topicName}. Right now, the best next move is clarification rather than measurement, because you may first need ${diagnosisText}. I’ll stabilize the idea a bit before asking you to demonstrate it.`;
}

function buildSuggestedAction(
  topicName: string,
  nextStep: string,
  mode: "clarify" | "probe"
) {
  if (mode === "clarify") {
    return `First, let’s stabilize ${topicName.toLowerCase()} so the next step feels clearer: ${nextStep}`;
  }

  return `Next, let’s work on ${topicName.toLowerCase()}: ${nextStep}`;
}

function buildStatusLabel(
  resolutionKind: RouteResolutionKind,
  mode: "clarify" | "probe"
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

function mapResolutionKindForDecision(
  resolutionKind: RouteResolutionKind
): string {
  switch (resolutionKind) {
    case "matched_existing":
      return "matched";
    case "created_new_candidate":
      return "created";
    case "fallback_active_topic":
      return "fallback_active_topic";
    case "fallback_existing_topic":
      return "fallback_existing_topic";
    case "no_match":
    default:
      return "fallback_existing_topic";
  }
}

function selectDeliveredRenderer(
  probePlan: ProbePlan
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

  const preferredModality = probePlan.renderer_request.preferred_modality ?? "text";
  const preferredGenerator =
    probePlan.renderer_request.preferred_generator ?? "chatgpt";

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

function buildDeliveredProbe(
  probePlan: ProbePlan,
  topic: RouteTopic
): DeliveredProbe {
  const selected = selectDeliveredRenderer(probePlan);

  const title =
    selected.modality === "video"
      ? `Visualize ${topic.name}`
      : selected.modality === "interactive"
        ? `Try ${topic.name}`
        : probePlan.probe_type === "apply_transfer"
          ? `Apply ${topic.name} in a new situation`
          : probePlan.probe_type === "predict"
            ? `Predict what happens in ${topic.name}`
            : probePlan.probe_type === "discriminate"
              ? `Distinguish ${topic.name} clearly`
              : probePlan.probe_type === "transform"
                ? `Walk through ${topic.name} step by step`
                : probePlan.text_plan.instructional_goal ?? `Explain ${topic.name}`;

  const instructions =
    selected.modality === "video"
      ? probePlan.video_payload.narration ??
        probePlan.video_payload.prompt ??
        `Watch carefully, then respond about ${topic.name}.`
      : selected.modality === "interactive"
        ? probePlan.interactive_payload.prompt ??
          "Interact with the task, then explain what you learned."
        : probePlan.text_payload.input ?? `Explain ${topic.name} in your own words.`;

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
      `Stay focused on ${topic.name} and reveal learner understanding.`,
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

function buildDeliveredResponse(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  probePlan: ProbePlan
): DeliveredResponse {
  const reply =
    decision.mode_selected === "clarify"
      ? buildClarifyReply(
          topic.name,
          decision.active_diagnosis ?? "representation_gap"
        )
      : buildProbeReply(
          topic.name,
          decision.active_diagnosis ?? "representation_gap"
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

function buildTopicStates(updatedTopics: RouteTopic[]): TopicState[] {
  return updatedTopics.map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
    topic_confusion_average: topic.confusion,
    topic_insight_average: topic.insight,
    topic_learning_score: topic.learningScore,
    topic_learning_velocity: 0,
    topic_novelty_score: 0.5,
    topic_message_count: 1,
    topic_difficulty: 0.5,
    topic_decay_rate: 0.05,
    topic_link_threshold: 0.5,
    topic_last_update: nowIso(),
    topic_centroid: topic.position as [number, number, number],
  }));
}

function adaptLearningSpaceToContract(
  rawLearningSpace: RawLearningSpace,
  updatedTopics: RouteTopic[]
): LearningSpace {
  const safeTopics = Array.isArray(rawLearningSpace.topics)
    ? rawLearningSpace.topics
    : [];

  const safeClusters = Array.isArray(rawLearningSpace.clusters)
    ? rawLearningSpace.clusters
    : [];

  return {
    space_version: "v1",
    topics: safeTopics.map((topic, index) => {
      const fallbackTopic = updatedTopics[index];

      return {
        topic_id:
          topic.topic_id ??
          fallbackTopic?.id ??
          makeId("topic-fallback"),
        topic_name:
          topic.topic_name ??
          topic.label ??
          fallbackTopic?.name ??
          "Untitled Topic",
        position:
          topic.position ??
          fallbackTopic?.position ??
          [0, 0, 0],
        render_state: {
          radius: topic.render_state?.radius ?? 1,
          surface_noise: topic.render_state?.surface_noise ?? 0,
          spin_rate: topic.render_state?.spin_rate ?? 0,
          saturation: topic.render_state?.saturation ?? 1,
          is_star: topic.render_state?.is_star ?? false,
        },
        satellite_count:
          topic.satellite_count ??
          topic.satellites?.length ??
          0,
        satellites: (topic.satellites ?? []).map((satellite, satelliteIndex) => ({
          satellite_id:
            satellite.satellite_id ??
            makeId(`satellite-${fallbackTopic?.id ?? satelliteIndex}`),
          orbit_angle: satellite.orbit_angle ?? satelliteIndex * 0.8,
          linked_attempt_id: satellite.linked_attempt_id ?? null,
        })),
      };
    }),
    clusters: safeClusters.map((cluster, index) => ({
      cluster_id: cluster.cluster_id ?? makeId(`cluster-${index}`),
      cluster_name: cluster.label ?? `Cluster ${index + 1}`,
      cluster_centroid: cluster.cluster_centroid ?? [0, 0, 0],
      member_topic_ids: cluster.member_topic_ids ?? [],
    })),
  };
}

function buildPreviousModeOutcome(
  runKind: ImportantRunInputs["current_interaction_context"]["run_kind"]
): PreviousModeOutcome {
  return {
    mode_selected: runKind === "clarify_followup" ? "clarify" : "clarify",
    reasons: [
      runKind === "clarify_followup"
        ? "The current message appears to follow earlier clarification-oriented interaction."
        : "No previous judged attempt is available in this route yet, so previous-mode state remains conservative.",
    ],
    confidence: runKind === "clarify_followup" ? 0.42 : 0.18,
    clarify_outcome:
      runKind === "clarify_followup" ? "probe_required" : "not_applicable",
  };
}

function buildEngineFuel(
  updatedTopics: RouteTopic[],
  decision: InterventionModeDecision,
  probePlan: ProbePlan,
  previousModeOutcome: PreviousModeOutcome
): EngineFuel {
  return {
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    previous_mode_outcome: previousModeOutcome,
    intervention_mode_decision: decision,
    probe_plan: probePlan,
    attempts: [],
  };
}

function buildRunMetadata(engineFuel: EngineFuel, runId: string): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version: "runtime-v1",
    previous_run_id: null,
    topic_count: engineFuel.topics.length,
    cluster_count: engineFuel.clusters.length,
    linked_pair_count: engineFuel.linked_pairs.length,
  };
}

function buildSceneUpdate(
  topicId: string,
  learningSpace: LearningSpace,
  resolutionKind: RouteResolutionKind
): MessageRouteResponse["scene_update"] {
  return {
    target_topic_id: topicId,
    camera_destination_topic_id: topicId,
    arrival_mode:
      resolutionKind === "created_new_candidate" ? "warp" : "focus",
    learning_space: learningSpace,
  };
}

function buildFallbackModelSignals(errorMessage?: string): ModelSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: "unavailable",
    inference_mode: null,
    latency_ms: null,
    status: errorMessage ? "error" : "unavailable",
    error_message: errorMessage ?? null,
  };
}

function normalizeVectorInfoFallback(
  matchVectorInfo: VectorInfo,
  topic: RouteTopic,
  createdTopic: boolean
): VectorInfo {
  return {
    ...matchVectorInfo,
    top_k_topic_names:
      matchVectorInfo.top_k_topic_names.length > 0
        ? matchVectorInfo.top_k_topic_names
        : [topic.name],
    top_k_topic_ids:
      matchVectorInfo.top_k_topic_ids.length > 0
        ? matchVectorInfo.top_k_topic_ids
        : [topic.id],
    top_k_similarity_scores:
      matchVectorInfo.top_k_similarity_scores.length > 0
        ? matchVectorInfo.top_k_similarity_scores
        : [createdTopic ? 0.24 : 0.52],
  };
}

function resolveTopicOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopicId?: string | null;
  message: string;
}): TopicResolutionOutcome | null {
  const { existingTopics, activeTopicId, message } = args;

  if (existingTopics.length === 0) {
    const createdTopic = buildSeededTopicFromMessage(message, existingTopics);

    return {
      topic: createdTopic,
      createdTopic,
      routeTopics: [createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: {
        top_k_topic_names: [],
        top_k_topic_ids: [],
        top_k_similarity_scores: [],
      },
      resolvedLabel: createdTopic.name,
      matchConfidence: 0,
    };
  }

  const matchResult = resolveTopicForMessage(message, existingTopics);

  if (matchResult.matchedTopic) {
    return {
      topic: matchResult.matchedTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "matched_existing",
      vectorInfo: matchResult.vectorInfo,
      resolvedLabel: matchResult.resolvedLabel,
      matchConfidence: matchResult.matchConfidence,
    };
  }

  if (matchResult.shouldCreateNewTopic) {
    const createdTopic = buildSeededTopicFromMessage(message, existingTopics);

    return {
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: matchResult.vectorInfo,
      resolvedLabel: matchResult.resolvedLabel ?? createdTopic.name,
      matchConfidence: matchResult.matchConfidence,
    };
  }

  if (activeTopicId) {
    const activeTopic = existingTopics.find((topic) => topic.id === activeTopicId);
    if (activeTopic) {
      return {
        topic: activeTopic,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind: "fallback_active_topic",
        vectorInfo: matchResult.vectorInfo,
        resolvedLabel: matchResult.resolvedLabel,
        matchConfidence: matchResult.matchConfidence,
      };
    }
  }

  const bestVectorTopicId = matchResult.vectorInfo.top_k_topic_ids[0];
  const bestVectorTopic =
    existingTopics.find((topic) => topic.id === bestVectorTopicId) ?? null;

  if (bestVectorTopic) {
    return {
      topic: bestVectorTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_existing_topic",
      vectorInfo: matchResult.vectorInfo,
      resolvedLabel: matchResult.resolvedLabel,
      matchConfidence: matchResult.matchConfidence,
    };
  }

  return {
    topic: existingTopics[0],
    createdTopic: null,
    routeTopics: existingTopics,
    resolutionKind: "fallback_existing_topic",
    vectorInfo: matchResult.vectorInfo,
    resolvedLabel: matchResult.resolvedLabel,
    matchConfidence: matchResult.matchConfidence,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MessageRouteBody;

    const message = body.messageText?.trim() || body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 }
      );
    }

    const recentTurns = normalizeRecentTurns(body);
    const chatHistory = buildChatHistoryFromBody(body);

    let modelSignals: ModelSignals = buildFallbackModelSignals();

    try {
      modelSignals = await scoreConfusionInsight({
        userMessage: message,
        chatHistory,
      });
    } catch (error) {
      modelSignals = buildFallbackModelSignals(
        error instanceof Error
          ? error.message
          : "Unknown confusion/insight scoring error"
      );
    }

    const existingTopics = await loadRouteTopics();

    const topicResolution = resolveTopicOutcome({
      existingTopics,
      activeTopicId:
        typeof body.activeTopicId === "string" ? body.activeTopicId : null,
      message,
    });

    if (!topicResolution) {
      return NextResponse.json(
        { error: "Unable to resolve or create a topic." },
        { status: 500 }
      );
    }

    const {
      topic,
      createdTopic,
      routeTopics,
      resolutionKind,
      vectorInfo: rawVectorInfo,
      resolvedLabel,
      matchConfidence,
    } = topicResolution;

    const targetTopicId = topic.id;

    const vectorInfo: VectorInfo = normalizeVectorInfoFallback(
      rawVectorInfo,
      topic,
      Boolean(createdTopic)
    );

    const preferredModality = inferPreferredModality(message);

    const currentInteractionContext: ImportantRunInputs["current_interaction_context"] =
      {
        run_kind: inferMessageRouteRunKind({
          message,
          recentTurns,
          hasActiveTopicId: Boolean(body.activeTopicId),
        }),
        is_response_to_delivered_probe: false,
        prior_mode_selected:
          recentTurns.length > 0 && messageLooksClarifySeeking(message)
            ? "clarify"
            : null,
        prior_probe_was_applicable: null,
        prior_probe_id: null,
        prior_mode_outcome_available: recentTurns.length > 0,
      };

    const newAttempt: ImportantRunInputs["new_attempt"] = {
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

    const updatedTopicMetrics = buildUpdatedMetrics(targetTopicId, topic);
    const updatedTopics = routeTopics.map((routeTopic) =>
      routeTopic.id === targetTopicId
        ? applyMetricUpdate(routeTopic, updatedTopicMetrics)
        : routeTopic
    );

    const updatedResolvedTopic =
      updatedTopics.find((routeTopic) => routeTopic.id === targetTopicId) ?? topic;

    const decision = buildInterventionModeDecision(
      updatedResolvedTopic,
      vectorInfo,
      preferredModality,
      message,
      Boolean(createdTopic),
      modelSignals,
      currentInteractionContext,
      newAttempt,
      mapResolutionKindForDecision(resolutionKind)
    );

    const probePlan =
      decision.mode_selected === "probe"
        ? buildProbePlan(updatedResolvedTopic, decision, message)
        : buildNotApplicableProbePlan(updatedResolvedTopic);

    const deliveredResponse = buildDeliveredResponse(
      updatedResolvedTopic,
      decision,
      probePlan
    );

    const previousModeOutcome = buildPreviousModeOutcome(
      currentInteractionContext.run_kind
    );

    const engineFuel = buildEngineFuel(
      updatedTopics,
      decision,
      probePlan,
      previousModeOutcome
    );

    const rawLearningSpace = buildLearningSpace(updatedTopics) as RawLearningSpace;
    const learningSpace = adaptLearningSpaceToContract(
      rawLearningSpace,
      updatedTopics
    );

    const runId = makeId("run");

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: buildImportantRunInputs(
        message,
        vectorInfo,
        modelSignals,
        currentInteractionContext,
        newAttempt,
        []
      ),
      engine_fuel: engineFuel,
      delivered_response: deliveredResponse,
      learning_space: learningSpace,
    };

    const runResultJson = JSON.parse(JSON.stringify(result));

    const topicJson = JSON.parse(
      JSON.stringify({
        topic_id: updatedResolvedTopic.id,
        topic_name: updatedResolvedTopic.name,
        next_step:
          probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
        inferred_keywords: inferKeywordsFromMessage(message),
        updated_topic_metrics: updatedTopicMetrics,
        learning_space_topic:
          learningSpace.topics.find((t) => t.topic_id === updatedResolvedTopic.id) ??
          null,
        planned_probe: deliveredResponse.delivered_probe ?? null,
        resolution_kind: resolutionKind,
        resolved_label: resolvedLabel,
        match_confidence: matchConfidence,
      })
    );

    const sceneUpdate = buildSceneUpdate(
      targetTopicId,
      learningSpace,
      resolutionKind
    );

    const suggestedAction = buildSuggestedAction(
      updatedResolvedTopic.name,
      probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
      decision.mode_selected
    );

    const statusLabel = buildStatusLabel(
      resolutionKind,
      decision.mode_selected
    );

    await insertRun({
      id: runId,
      runType: "message",
      userMessage: message,
      sourceMessageId: result.important_run_inputs.user_message.message_id,
      targetTopicId,
      modeSelected: decision.mode_selected,
      activeDiagnosis: decision.active_diagnosis,
      replyText: deliveredResponse.learner_message.text,
      suggestedAction,
      runResultJson,
    });

    await upsertTopicState({
      topicId: updatedResolvedTopic.id,
      lastRunId: runId,
      topicName: updatedResolvedTopic.name,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore:
        updatedTopics.find((t) => t.id === updatedResolvedTopic.id)?.learningScore ??
        null,
      diagnosis: decision.active_diagnosis,
      nextStep:
        probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
      topicJson,
    });

    const response: MessageRouteResponse = {
      result,
      scene_update: sceneUpdate,
      intervention: {
        mode_selected: decision.mode_selected,
        target_topic_id: decision.target_topic_id,
        active_diagnosis: decision.active_diagnosis,
        probe_available: deliveredResponse.delivered_probe !== null,
        status_label: statusLabel,
        suggested_action: suggestedAction,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/message failed", error);
    return NextResponse.json(
      { error: "Failed to process message." },
      { status: 500 }
    );
  }
}