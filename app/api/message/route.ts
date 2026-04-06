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

function buildStatusLabel(createdTopic: boolean, mode: "clarify" | "probe") {
  const topicLabel = createdTopic ? "Created new topic" : "Matched existing topic";
  return `${topicLabel} • ${mode === "clarify" ? "Clarify mode" : "Probe mode"}`;
}

function buildDeliveredProbe(
  probePlan: ProbePlan,
  topic: RouteTopic
): DeliveredProbe {
  const generator =
    probePlan.renderer_request.preferred_generator ?? "chatgpt";
  const modality =
    probePlan.renderer_request.preferred_modality ?? "text";

  const title =
    modality === "video"
      ? `Visualize ${topic.name}`
      : modality === "interactive"
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
    modality === "video"
      ? probePlan.video_payload.narration ??
        probePlan.video_payload.prompt ??
        `Watch carefully, then respond about ${topic.name}.`
      : modality === "interactive"
        ? "Interact with the task, then explain what you learned."
        : probePlan.text_payload.input ?? `Explain ${topic.name} in your own words.`;

  return {
    probe_id: probePlan.probe_id,
    target_topic_id: probePlan.target_topic_id,
    target_diagnosis: probePlan.target_diagnosis,
    intent: probePlan.intent,
    probe_type: probePlan.probe_type,
    renderer_type:
      modality === "interactive"
        ? "interactive_renderer"
        : modality === "video"
          ? "video_renderer"
          : "text_renderer",
    generator,
    modality,
    title,
    instructions,
    actual_tone: "encouraging",
    actual_pacing: "normal",
    actual_language_style: "plain",
    actual_context_framing: `Stay focused on ${topic.name} and reveal learner understanding.`,
    expected_response_type: probePlan.expected_response_type,
    stimulus_id: `stimulus-${probePlan.probe_id}`,
    payload_snapshot:
      modality === "video"
        ? { video_payload: probePlan.video_payload }
        : modality === "interactive"
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
  isNewTopic: boolean
): MessageRouteResponse["scene_update"] {
  return {
    target_topic_id: topicId,
    camera_destination_topic_id: topicId,
    arrival_mode: isNewTopic ? "warp" : "focus",
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
    const matchResult = resolveTopicForMessage(message, existingTopics);

    const createdTopic = matchResult.shouldCreateNewTopic
      ? buildSeededTopicFromMessage(message, existingTopics)
      : null;

    const routeTopics = createdTopic
      ? [...existingTopics, createdTopic]
      : existingTopics;

    if (!routeTopics.length) {
      return NextResponse.json(
        { error: "No topics are available." },
        { status: 500 }
      );
    }

    const topic = createdTopic ?? matchResult.matchedTopic ?? routeTopics[0];

    if (!topic) {
      return NextResponse.json(
        { error: "Unable to resolve a topic." },
        { status: 500 }
      );
    }

    const targetTopicId = topic.id;

    const vectorInfo: VectorInfo = {
      ...matchResult.vectorInfo,
      top_k_topic_names:
        matchResult.vectorInfo.top_k_topic_names.length > 0
          ? matchResult.vectorInfo.top_k_topic_names
          : [topic.name],
      top_k_topic_ids:
        matchResult.vectorInfo.top_k_topic_ids.length > 0
          ? matchResult.vectorInfo.top_k_topic_ids
          : [topic.id],
      top_k_similarity_scores:
        matchResult.vectorInfo.top_k_similarity_scores.length > 0
          ? matchResult.vectorInfo.top_k_similarity_scores
          : [createdTopic ? 0.24 : 0.72],
    };

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
        prior_mode_outcome_available: recentTurns.length > 0 ? true : false,
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
    const updatedTopics = routeTopics.map((t) =>
      applyMetricUpdate(t, updatedTopicMetrics)
    );

    const decision = buildInterventionModeDecision(
      topic,
      vectorInfo,
      preferredModality,
      message,
      Boolean(createdTopic),
      modelSignals,
      currentInteractionContext,
      newAttempt
    );

    const probePlan =
      decision.mode_selected === "probe"
        ? buildProbePlan(topic, decision, message)
        : buildNotApplicableProbePlan(topic);

    const deliveredResponse = buildDeliveredResponse(topic, decision, probePlan);
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
        topic_id: topic.id,
        topic_name: topic.name,
        next_step: probePlan.text_plan.instructional_goal ?? topic.nextStep,
        inferred_keywords: inferKeywordsFromMessage(message),
        updated_topic_metrics: updatedTopicMetrics,
        learning_space_topic:
          learningSpace.topics.find((t) => t.topic_id === topic.id) ?? null,
        planned_probe:
          deliveredResponse.delivered_probe ?? null,
      })
    );

    const sceneUpdate = buildSceneUpdate(
      targetTopicId,
      learningSpace,
      Boolean(createdTopic)
    );
    const suggestedAction = buildSuggestedAction(
      topic.name,
      probePlan.text_plan.instructional_goal ?? topic.nextStep,
      decision.mode_selected
    );
    const statusLabel = buildStatusLabel(
      Boolean(createdTopic),
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
      topicId: topic.id,
      lastRunId: runId,
      topicName: topic.name,
      confusion: updatedTopicMetrics.confusion ?? null,
      insight: updatedTopicMetrics.insight ?? null,
      learningScore:
        updatedTopics.find((t) => t.id === topic.id)?.learningScore ?? null,
      diagnosis: decision.active_diagnosis,
      nextStep: probePlan.text_plan.instructional_goal ?? topic.nextStep,
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