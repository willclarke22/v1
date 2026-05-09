import { NextResponse } from "next/server";
import { buildLearningSpace } from "@/lib/build-learning-space";
import { insertRun, upsertTopicState } from "@/lib/persistence/myway";
import { makeId } from "@/lib/utils/ids";
import {
  embedMessageForSemanticRouting,
  querySemanticTopicCandidatesFromEmbedding,
} from "@/lib/vector/query-topics";
import {
  canSyncTopicToQdrant,
  syncTopicToQdrantBestEffort,
} from "@/lib/vector/sync-topic-to-qdrant";
import type {
  DeliveredProbe,
  DeliveredResponse,
  EngineFuel,
  EmbeddingVector,
  ImportantRunInputs,
  InterventionModeDecision,
  LearningSpace,
  MessageRouteRequest,
  MessageRouteResponse,
  ModelSignals,
  MyWayRunResult,
  PreviousModeOutcome,
  ProbePlan,
  RunMetadata,
  TopicRoutingState,
  TopicState,
  VectorInfo,
} from "@/types/contracts";
import {
  buildDeterministicTopicResolutionSnapshot,
  buildSeededTopicFromResolvedLabel as buildSeededRouteTopicFromResolvedLabel,
  inferKeywordsFromTopicLabel,
  loadRouteTopics,
  resolveTopicForMessage,
  shouldTryLLMTopicResolutionFallback,
  type RouteTopic,
  type TopicResolutionTrace,
} from "@/lib/runtime/topic-resolution";
import {
  applyMetricUpdate,
  buildImportantRunInputs,
  buildInterventionModeDecision,
  buildNotApplicableProbePlan,
  buildProbePlan,
  buildUpdatedMetrics,
} from "@/lib/runtime/message-runtime";
import { nowIso } from "@/lib/runtime/shared";
import { scoreConfusionInsight } from "@/lib/providers/confusion-insight";
import { buildRecentChatHistory } from "@/lib/runtime/chat-history";
import {
  runTopicLabelingLLMAdjudication,
  type TopicLabelingLLMDecision,
} from "@/lib/providers/topic-labeling-llm";
import {
  isNarrowerThanExistingBroadTopic,
  isStructurallyStrongTopicLabel,
} from "@/lib/runtime/topic-labeling/topic-label-contract";
import {
  buildTopicLabelerV3Request,
  callTopicLabelerV3,
  type TopicLabelerV3ClientResult,
} from "@/lib/runtime/topic-labeling-model/model-topic-labeler-v3";
import {
  buildModelTopicRoutePolicyDecision,
  type ModelTopicRoutePolicyDecision,
} from "@/lib/runtime/topic-labeling-model/topic-labeler-policy";

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

type IncomingViewportContext = {
  focusedTopicId?: unknown;
  selectedTopicId?: unknown;
  activeTopicIdForMessage?: unknown;
};

type MessageRouteBody = MessageRouteRequest & {
  message?: string;
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];
  viewportContext?: IncomingViewportContext;
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

type TopicLabelingMode =
  | "deterministic_only"
  | "deterministic_plus_llm"
  | "model_v3_3_primary";

type TopicRoutingQdrantQueryMode = "off" | "always";

type TopicResolutionDebug = {
  topic_labeling_mode: TopicLabelingMode;
  llm_fallback_allowed_by_mode: boolean;
  llm_fallback_recommended_by_policy: boolean;
  llm_fallback_attempted: boolean;
  llm_fallback_used: boolean;
  deterministic_trusted_without_llm: boolean;
  deterministic_create_blocked_as_suspicious: boolean;
  structurally_strong_resolved_label: boolean;
  narrower_than_active_broad_topic: boolean;
  resolution_kind: RouteResolutionKind;
  resolved_label: string | null;
  match_confidence: number;
  resolution_trace: TopicResolutionTrace | null;
};

type TopicResolutionOutcome = {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: RouteResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  usedLLMFallback: boolean;
  resolutionTrace: TopicResolutionTrace | null;
  semanticTopicRouting: TopicRoutingState | null;
  centroidUpdatePlan: RouteCentroidUpdatePlan | null;
  debug: TopicResolutionDebug;
};

type RouteCentroidUpdatePlan = {
  topic_id: string;
  previous_embedding_count: number;
  new_embedding_count: number;
  update_method: "initialize" | "running_average" | "ema" | "none";
  alpha: number | null;
  embedding_model: string | null;
  updated_at: string;
  new_centroid: EmbeddingVector | null;
};

type MessageRouteTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

type MessageRouteLatencyDebug = {
  enabled: boolean;
  total_ms: number;
  steps: MessageRouteTimingStep[];
  metadata: {
    route: "POST /api/message";
    topic_count_loaded: number | null;

    incoming_active_topic_id: string | null;
    incoming_active_topic_found: boolean | null;
    incoming_active_topic_name: string | null;
    viewport_focused_topic_id: string | null;
    viewport_selected_topic_id: string | null;
    viewport_active_topic_id_for_message: string | null;

    qdrant_query_mode: TopicRoutingQdrantQueryMode;
    qdrant_query_attempted: boolean;
    qdrant_query_succeeded: boolean | null;
    qdrant_query_error: string | null;
    qdrant_query_skipped_reason: string | null;

    qdrant_sync_attempted: boolean;
    qdrant_sync_succeeded: boolean | null;
    qdrant_sync_error: string | null;
    qdrant_sync_duration_ms: number | null;

    confusion_insight_status: ModelSignals["status"] | null;
    topic_labeling_mode: TopicLabelingMode | null;
    resolution_kind: RouteResolutionKind | null;
    used_llm_topic_fallback: boolean | null;
    message_embedding_available: boolean | null;
    embedding_model: string | null;
    centroid_update_method: string | null;

    topic_labeler_v3_compare_enabled: boolean;
    topic_labeler_v3_attempted: boolean;
    topic_labeler_v3_succeeded: boolean | null;
    topic_labeler_v3_error: string | null;
    topic_labeler_v3_latency_ms: number | null;
    topic_labeler_v3_route_decision: string | null;
    topic_labeler_v3_extracted_label: string | null;
    topic_labeler_v3_matched_topic_name: string | null;

    model_topic_policy_usable: boolean | null;
    model_topic_policy_decision_kind: string | null;
    model_topic_policy_extracted_label: string | null;
    model_topic_policy_matched_topic_name: string | null;
    model_topic_policy_reasons: string[] | null;
    model_topic_policy_used_as_authority: boolean | null;
    topic_authority_source: string | null;
  };
};

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function createMessageRouteTimer() {
  const enabled = process.env.MYWAY_MESSAGE_ROUTE_TIMING !== "off";
  const startedAt = performance.now();
  let lastMark = startedAt;
  const steps: MessageRouteTimingStep[] = [];

  function step(label: string) {
    if (!enabled) return;

    const now = performance.now();

    steps.push({
      label,
      duration_ms: roundMs(now - lastMark),
      elapsed_ms: roundMs(now - startedAt),
    });

    lastMark = now;
  }

  function finish(
    metadata: MessageRouteLatencyDebug["metadata"]
  ): MessageRouteLatencyDebug {
    return {
      enabled,
      total_ms: roundMs(performance.now() - startedAt),
      steps,
      metadata,
    };
  }

  return {
    step,
    finish,
  };
}

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value || !value.trim()) return fallback;

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getLLMFallbackTimeoutMs() {
  return parsePositiveInteger(
    process.env.MYWAY_TOPIC_LLM_FALLBACK_TIMEOUT_MS ??
      process.env.TOPIC_LLM_FALLBACK_TIMEOUT_MS,
    8000
  );
}

function getTopicRoutingQdrantQueryMode(): TopicRoutingQdrantQueryMode {
  const raw = process.env.MYWAY_TOPIC_ROUTING_QDRANT_QUERY_MODE
    ?.trim()
    .toLowerCase();

  if (raw === "always") return "always";

  /**
   * Default is intentionally "off" for this pass.
   *
   * The route now embeds once and lets V3 perform local Supabase centroid ranking.
   * We will add "local confidence -> optional Qdrant" after updating topic-router.ts
   * and topic-routing-policy.ts.
   */
  return "off";
}

function getTopicLabelerV3CompareEnabled() {
  const raw =
    process.env.TOPIC_LABELER_MODE?.trim().toLowerCase() ??
    process.env.MYWAY_TOPIC_LABELER_MODE?.trim().toLowerCase() ??
    "";

  return raw === "compare" || raw === "model_v3_compare";
}

function buildRecentUserMessagesForTopicLabelerV3(
  recentTurns: Array<{ role: "user" | "assistant"; text: string }>
) {
  return recentTurns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .slice(-5);
}

function getTopicLabelerV3CompareSummary(
  result: TopicLabelerV3ClientResult | null
) {
  if (!result) {
    return {
      attempted: false,
      succeeded: null,
      error: null,
      latency_ms: null,
      route_decision: null,
      extracted_label: null,
      matched_topic_name: null,
    };
  }

  if (!result.ok) {
    return {
      attempted: true,
      succeeded: false,
      error: result.error,
      latency_ms: result.latency_ms,
      route_decision: null,
      extracted_label: null,
      matched_topic_name: null,
    };
  }

  return {
    attempted: true,
    succeeded: true,
    error: null,
    latency_ms: result.latency_ms,
    route_decision: result.response.route.route_decision,
    extracted_label: result.response.model_prediction.extracted_label,
    matched_topic_name: result.response.route.matched_topic_name,
  };
}

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
  recentTurns: Array<{ role: "user" | "assistant"; text: string }>;
  hasActiveTopicId: boolean;
  clarifySeeking: boolean;
}) {
  const { recentTurns, hasActiveTopicId, clarifySeeking } = args;
  const isClarifySeeking = clarifySeeking;

  if (isClarifySeeking) {
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

type ResolvedMessageFrame = TopicResolutionTrace["interpretation"]["frame"];
type RoutePreferredModality = "text" | "video" | "interactive";

function getResolvedMessageFrame(
  resolutionTrace: TopicResolutionTrace | null
): ResolvedMessageFrame {
  return resolutionTrace?.interpretation?.frame ?? "general";
}

function derivePreferredModalityFromResolutionFrame(
  frame: ResolvedMessageFrame
): RoutePreferredModality {
  if (frame === "apply_request") {
    return "interactive";
  }

  return "text";
}

function deriveClarifySeekingFromResolutionFrame(frame: ResolvedMessageFrame) {
  return frame === "confusion_help" || frame === "explain_request";
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
  return updatedTopics.map((topic) => {
    const topicWithOptionalMetrics = topic as RouteTopic & {
      learningVelocity?: number;
      noveltyScore?: number;
      difficulty?: number;
      decayRate?: number;
      linkThreshold?: number;
    };

    return {
      topic_id: topic.id,
      topic_name: topic.name,
      topic_learning_score: topic.learningScore,
      topic_confusion_average: topic.confusion,
      topic_insight_average: topic.insight,
      topic_learning_velocity: topicWithOptionalMetrics.learningVelocity ?? 0,
      topic_novelty_score: topicWithOptionalMetrics.noveltyScore ?? 0,
      topic_difficulty: topicWithOptionalMetrics.difficulty ?? 0.5,
      topic_decay_rate: topicWithOptionalMetrics.decayRate ?? 0.1,
      topic_link_threshold: topicWithOptionalMetrics.linkThreshold ?? 0.5,
      topic_message_count: topic.messageCount ?? 0,
      topic_last_update: topic.lastUpdated ?? nowIso(),
      topic_centroid: topic.position,
      topic_embedding_centroid: topic.topic_embedding_centroid ?? null,
      topic_embedding_count: topic.topic_embedding_count ?? 0,
      topic_embedding_model: topic.topic_embedding_model ?? null,
      topic_embedding_updated_at: topic.topic_embedding_updated_at ?? null,
    };
  });
}

function buildPreviousModeOutcome(
  runKind: ImportantRunInputs["current_interaction_context"]["run_kind"]
): PreviousModeOutcome {
  return {
    mode_selected: runKind === "clarify_followup" ? "clarify" : "probe",
    reasons: [],
    confidence: 0.5,
    clarify_outcome:
      runKind === "clarify_followup" ? "sufficient" : "not_applicable",
  };
}

function buildEngineFuel(
  updatedTopics: RouteTopic[],
  decision: InterventionModeDecision,
  probePlan: ProbePlan,
  previousModeOutcome: PreviousModeOutcome,
  topicRouting: TopicRoutingState | null
): EngineFuel {
  return {
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    previous_mode_outcome: previousModeOutcome,
    intervention_mode_decision: decision,
    probe_plan: probePlan,
    topic_routing: topicRouting ?? undefined,
    attempts: [],
  };
}

function buildRunMetadata(engineFuel: EngineFuel, runId: string): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version: "runtime-v3-semantic-centroid-fast-path",
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

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item)
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function buildCreatedTopicCentroidPlan(args: {
  createdTopic: RouteTopic | null;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
}): RouteCentroidUpdatePlan | null {
  const { createdTopic, messageEmbedding, embeddingModel } = args;
  const centroid = asEmbeddingVector(messageEmbedding);

  if (!createdTopic || !centroid) return null;

  return {
    topic_id: createdTopic.id,
    previous_embedding_count: 0,
    new_embedding_count: 1,
    update_method: "initialize",
    alpha: null,
    embedding_model: embeddingModel,
    updated_at: nowIso(),
    new_centroid: centroid,
  };
}

function applyCentroidUpdatePlanToTopics(
  topics: RouteTopic[],
  plan: RouteCentroidUpdatePlan | null
): RouteTopic[] {
  if (!plan || !plan.new_centroid) return topics;

  return topics.map((topic) => {
    if (topic.id !== plan.topic_id) return topic;

    return {
      ...topic,
      topic_embedding_centroid: plan.new_centroid,
      topic_embedding_count: plan.new_embedding_count,
      topic_embedding_model: plan.embedding_model,
      topic_embedding_updated_at: plan.updated_at,
      topic_json: {
        ...(topic.topic_json ?? {}),
        topic_embedding_centroid: plan.new_centroid,
        topic_embedding_count: plan.new_embedding_count,
        topic_embedding_model: plan.embedding_model,
        topic_embedding_updated_at: plan.updated_at,
      },
    };
  });
}

function getTopicCentroidMetadata(topic: RouteTopic) {
  return {
    topicEmbeddingCentroid: topic.topic_embedding_centroid ?? null,
    topicEmbeddingCount: topic.topic_embedding_count ?? 0,
    topicEmbeddingModel: topic.topic_embedding_model ?? null,
    topicEmbeddingUpdatedAt: topic.topic_embedding_updated_at ?? null,
  };
}

function buildTopicRoutingStateFromMatch(args: {
  match: {
    semanticTopicRouting?: unknown;
    centroidUpdatePlan?: RouteCentroidUpdatePlan | null;
  };
  vectorInfo: VectorInfo;
  centroidUpdatePlan: RouteCentroidUpdatePlan | null;
}): TopicRoutingState | null {
  const rawRouting = args.match.semanticTopicRouting;

  if (!rawRouting || typeof rawRouting !== "object") return null;

  const routing = rawRouting as Record<string, unknown>;
  const debug =
    routing.debug && typeof routing.debug === "object"
      ? (routing.debug as TopicRoutingState["debug"])
      : null;

  if (!debug) return null;

  const reasons = Array.isArray(routing.reasons)
    ? routing.reasons.filter((item): item is string => typeof item === "string")
    : [];

  return {
    router_version: "semantic-centroid-v3",
    decision_kind: debug.decision_kind,
    policy_path: debug.policy_path,
    selected_topic_id:
      typeof routing.target_topic_id === "string"
        ? routing.target_topic_id
        : debug.selected_topic_id ?? null,
    selected_topic_name:
      typeof routing.target_topic_name === "string"
        ? routing.target_topic_name
        : debug.selected_topic_name ?? null,
    new_topic_label:
      typeof routing.new_topic_label === "string"
        ? routing.new_topic_label
        : debug.new_topic_label ?? null,
    confidence:
      typeof routing.confidence === "number" && Number.isFinite(routing.confidence)
        ? routing.confidence
        : 0,
    reasons,
    vector_info: args.vectorInfo,
    debug,
    centroid_update: args.centroidUpdatePlan
      ? {
          topic_id: args.centroidUpdatePlan.topic_id,
          previous_embedding_count: args.centroidUpdatePlan.previous_embedding_count,
          new_embedding_count: args.centroidUpdatePlan.new_embedding_count,
          update_method: args.centroidUpdatePlan.update_method,
          alpha: args.centroidUpdatePlan.alpha,
          embedding_model: args.centroidUpdatePlan.embedding_model,
          updated_at: args.centroidUpdatePlan.updated_at,
        }
      : null,
  };
}

function normalizeTextLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSuspiciousCreateLabel(label: string | null) {
  if (!label) return true;

  const normalized = normalizeTextLoose(label);
  if (!normalized) return true;

  if (isStructurallyStrongTopicLabel(label)) {
    return false;
  }

  const suspiciousSingles = new Set([
    "i",
    "me",
    "you",
    "we",
    "they",
    "this",
    "that",
    "it",
    "part",
    "thing",
    "stuff",
    "help",
    "question",
    "new topic",
    "law works",
    "where to start",
    "where to even start",
    "whole thing",
    "whole thing confusing",
    "coded language",
    "another language",
    "actual blocker",
    "actual issue",
    "specific thing",
    "real issue",
    "real bottleneck",
    "tiny word",
  ]);

  if (suspiciousSingles.has(normalized)) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  if (tokenCount > 8) return true;

  if (
    /\b(help|understand|get|confused|stuck|trouble|pretending|fake|stupid|dumb|panic|spiral|shut down|zoning out|nothing is sticking|missing piece|own brain)\b/i.test(
      label
    )
  ) {
    return true;
  }

  if (/^(?:is|are|it is|it s|but|actually|i think)\b/i.test(normalized)) {
    return true;
  }

  return false;
}

function shouldTrustDeterministicCreate(args: {
  resolvedLabel: string | null;
  matchConfidence: number;
  activeTopic: RouteTopic | null;
  resolutionTrace: TopicResolutionTrace | null | undefined;
}) {
  const { resolvedLabel, matchConfidence, activeTopic, resolutionTrace } = args;

  if (!resolvedLabel || looksLikeSuspiciousCreateLabel(resolvedLabel)) {
    return false;
  }

  const structurallyStrong = isStructurallyStrongTopicLabel(resolvedLabel);
  const narrowerThanActive = isNarrowerThanExistingBroadTopic({
    label: resolvedLabel,
    existingTopicName: activeTopic?.name ?? null,
  });

  const traceAsRecord = resolutionTrace as
    | (TopicResolutionTrace & {
        structurallyStrongLabel?: boolean;
        nullOnlyEmotionalLike?: boolean;
        labelerCreateRecommended?: boolean;
      })
    | null
    | undefined;

  if (traceAsRecord?.nullOnlyEmotionalLike) {
    return false;
  }

  if (traceAsRecord?.labelerCreateRecommended && matchConfidence >= 0.5) {
    return true;
  }

  if (structurallyStrong && matchConfidence >= 0.5) {
    return true;
  }

  if (narrowerThanActive && matchConfidence >= 0.46) {
    return true;
  }

  return matchConfidence >= 0.58;
}

function resolveFallbackTopicLabel(args: {
  resolutionTrace?: TopicResolutionTrace | null;
  fallbackLabel?: string | null;
}) {
  const tracedLabel = args.resolutionTrace?.interpretation?.canonicalLabel ?? null;
  const candidate = tracedLabel ?? args.fallbackLabel ?? "New Topic";

  return looksLikeSuspiciousCreateLabel(candidate) ? "New Topic" : candidate;
}

function buildRouteTopicFromResolvedLabel(args: {
  existingTopics: RouteTopic[];
  resolvedLabel: string;
}): RouteTopic {
  return buildSeededRouteTopicFromResolvedLabel({
    existingTopics: args.existingTopics,
    resolvedLabel: args.resolvedLabel,
  });
}

function findTopicFromLLMResult(args: {
  existingTopics: RouteTopic[];
  decision: TopicLabelingLLMDecision;
}) {
  const { existingTopics, decision } = args;

  if (decision.matched_topic_id) {
    const byId =
      existingTopics.find((topic) => topic.id === decision.matched_topic_id) ??
      null;
    if (byId) return byId;
  }

  if (decision.matched_topic_name) {
    const looseTarget = normalizeTextLoose(decision.matched_topic_name);
    const byName =
      existingTopics.find(
        (topic) => normalizeTextLoose(topic.name) === looseTarget
      ) ?? null;
    if (byName) return byName;
  }

  return null;
}

function adaptLearningSpaceToContract(
  rawLearningSpace: RawLearningSpace,
  updatedTopics: RouteTopic[]
): LearningSpace {
  return {
    space_version: "v1",
    topics: (rawLearningSpace.topics ?? []).map((topic, index) => {
      const fallbackTopic = updatedTopics[index] ?? updatedTopics[0];
      const resolvedTopicName =
        topic.topic_name ??
        topic.label ??
        fallbackTopic?.name ??
        "Untitled Topic";

      return {
        topic_id: topic.topic_id ?? fallbackTopic?.id ?? makeId("topic"),
        topic_name: resolvedTopicName,
        label: resolvedTopicName,
        position:
          Array.isArray(topic.position) && topic.position.length === 3
            ? (topic.position as [number, number, number])
            : fallbackTopic?.position ?? [0, 0, 0],
        render_state: {
          radius: topic.render_state?.radius ?? 0.8,
          surface_noise: topic.render_state?.surface_noise ?? 0.3,
          spin_rate: topic.render_state?.spin_rate ?? 0.25,
          saturation: topic.render_state?.saturation ?? 0.7,
          is_star: topic.render_state?.is_star ?? false,
        },
        satellite_count: topic.satellite_count ?? 0,
        satellites: (topic.satellites ?? []).map((satellite, satelliteIndex) => ({
          satellite_id:
            satellite.satellite_id ?? `sat-${index}-${satelliteIndex}`,
          orbit_angle: satellite.orbit_angle ?? 0,
          linked_attempt_id: satellite.linked_attempt_id ?? null,
        })),
      };
    }),
    clusters: (rawLearningSpace.clusters ?? []).map((cluster, index) => {
      const resolvedClusterName = cluster.label ?? `Cluster ${index + 1}`;

      return {
        cluster_id: cluster.cluster_id ?? `cluster-${index}`,
        cluster_name: resolvedClusterName,
        label: resolvedClusterName,
        cluster_centroid:
          Array.isArray(cluster.cluster_centroid) &&
          cluster.cluster_centroid.length === 3
            ? (cluster.cluster_centroid as [number, number, number])
            : [0, 0, 0],
        member_topic_ids: Array.isArray(cluster.member_topic_ids)
          ? cluster.member_topic_ids
          : [],
      };
    }),
  };
}

function getTopicLabelingMode(): TopicLabelingMode {
  const raw = process.env.MYWAY_TOPIC_LABELING_MODE?.trim().toLowerCase();

  if (raw === "deterministic_only") {
    return "deterministic_only";
  }

  return "deterministic_plus_llm";
}

function buildTopicResolutionDebug(args: {
  topicLabelingMode: TopicLabelingMode;
  llmFallbackAllowedByMode: boolean;
  llmFallbackRecommendedByPolicy: boolean;
  llmFallbackAttempted: boolean;
  llmFallbackUsed: boolean;
  deterministicTrustedWithoutLLM: boolean;
  deterministicCreateBlockedAsSuspicious: boolean;
  structurallyStrongResolvedLabel: boolean;
  narrowerThanActiveBroadTopic: boolean;
  resolutionKind: RouteResolutionKind;
  resolvedLabel: string | null;
  matchConfidence: number;
  resolutionTrace: TopicResolutionTrace | null;
}): TopicResolutionDebug {
  return {
    topic_labeling_mode: args.topicLabelingMode,
    llm_fallback_allowed_by_mode: args.llmFallbackAllowedByMode,
    llm_fallback_recommended_by_policy: args.llmFallbackRecommendedByPolicy,
    llm_fallback_attempted: args.llmFallbackAttempted,
    llm_fallback_used: args.llmFallbackUsed,
    deterministic_trusted_without_llm: args.deterministicTrustedWithoutLLM,
    deterministic_create_blocked_as_suspicious:
      args.deterministicCreateBlockedAsSuspicious,
    structurally_strong_resolved_label: args.structurallyStrongResolvedLabel,
    narrower_than_active_broad_topic: args.narrowerThanActiveBroadTopic,
    resolution_kind: args.resolutionKind,
    resolved_label: args.resolvedLabel,
    match_confidence: args.matchConfidence,
    resolution_trace: args.resolutionTrace,
  };
}

function buildResolvedOutcome(args: {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: RouteResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  usedLLMFallback: boolean;
  resolutionTrace: TopicResolutionTrace | null;
  semanticTopicRouting?: TopicRoutingState | null;
  centroidUpdatePlan?: RouteCentroidUpdatePlan | null;
  topicLabelingMode: TopicLabelingMode;
  llmFallbackAllowedByMode: boolean;
  llmFallbackRecommendedByPolicy: boolean;
  llmFallbackAttempted: boolean;
  deterministicTrustedWithoutLLM?: boolean;
  deterministicCreateBlockedAsSuspicious?: boolean;
  structurallyStrongResolvedLabel?: boolean;
  narrowerThanActiveBroadTopic?: boolean;
}): TopicResolutionOutcome {
  return {
    topic: args.topic,
    createdTopic: args.createdTopic,
    routeTopics: args.routeTopics,
    resolutionKind: args.resolutionKind,
    vectorInfo: args.vectorInfo,
    resolvedLabel: args.resolvedLabel,
    matchConfidence: args.matchConfidence,
    usedLLMFallback: args.usedLLMFallback,
    resolutionTrace: args.resolutionTrace,
    semanticTopicRouting: args.semanticTopicRouting ?? null,
    centroidUpdatePlan: args.centroidUpdatePlan ?? null,
    debug: buildTopicResolutionDebug({
      topicLabelingMode: args.topicLabelingMode,
      llmFallbackAllowedByMode: args.llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy: args.llmFallbackRecommendedByPolicy,
      llmFallbackAttempted: args.llmFallbackAttempted,
      llmFallbackUsed: args.usedLLMFallback,
      deterministicTrustedWithoutLLM: args.deterministicTrustedWithoutLLM ?? false,
      deterministicCreateBlockedAsSuspicious:
        args.deterministicCreateBlockedAsSuspicious ?? false,
      structurallyStrongResolvedLabel: args.structurallyStrongResolvedLabel ?? false,
      narrowerThanActiveBroadTopic: args.narrowerThanActiveBroadTopic ?? false,
      resolutionKind: args.resolutionKind,
      resolvedLabel: args.resolvedLabel,
      matchConfidence: args.matchConfidence,
      resolutionTrace: args.resolutionTrace,
    }),
  };
}


type SafeAuthoritativeModelTopicRoutePolicyDecision =
  ModelTopicRoutePolicyDecision & {
    usable: true;
    decision_kind: "create_new" | "switch_existing" | "stay_active";
  };

function isModelPolicySafeAuthoritativeDecision(
  decision: ModelTopicRoutePolicyDecision | null
): decision is SafeAuthoritativeModelTopicRoutePolicyDecision {
  if (!decision?.usable) return false;

  return (
    decision.decision_kind === "create_new" ||
    decision.decision_kind === "switch_existing" ||
    decision.decision_kind === "stay_active"
  );
}

function buildModelAuthoritativeTopicResolutionOutcome(args: {
  existingTopics: RouteTopic[];
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  semanticVectorInfo: VectorInfo;
}): TopicResolutionOutcome | null {
  const { existingTopics, modelPolicyDecision, semanticVectorInfo } = args;

  if (!isModelPolicySafeAuthoritativeDecision(modelPolicyDecision)) {
    return null;
  }

  if (modelPolicyDecision.decision_kind === "create_new") {
    const resolvedLabel = modelPolicyDecision.extracted_label;

    if (!resolvedLabel) return null;

    const createdTopic = buildRouteTopicFromResolvedLabel({
      existingTopics,
      resolvedLabel,
    });

    return buildResolvedOutcome({
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: semanticVectorInfo,
      resolvedLabel,
      matchConfidence: 0.86,
      usedLLMFallback: false,
      resolutionTrace: null,
      semanticTopicRouting: null,
      centroidUpdatePlan: null,
      topicLabelingMode: "model_v3_3_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
      deterministicTrustedWithoutLLM: false,
      deterministicCreateBlockedAsSuspicious: false,
      structurallyStrongResolvedLabel: false,
      narrowerThanActiveBroadTopic: false,
    });
  }

  if (modelPolicyDecision.decision_kind === "switch_existing") {
    const targetTopic = modelPolicyDecision.target_topic;

    if (!targetTopic) return null;

    return buildResolvedOutcome({
      topic: targetTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "matched_existing",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: modelPolicyDecision.extracted_label ?? targetTopic.name,
      matchConfidence: 0.84,
      usedLLMFallback: false,
      resolutionTrace: null,
      semanticTopicRouting: null,
      centroidUpdatePlan: null,
      topicLabelingMode: "model_v3_3_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
      deterministicTrustedWithoutLLM: false,
      deterministicCreateBlockedAsSuspicious: false,
      structurallyStrongResolvedLabel: false,
      narrowerThanActiveBroadTopic: false,
    });
  }

  if (modelPolicyDecision.decision_kind === "stay_active") {
    const targetTopic = modelPolicyDecision.target_topic;

    if (!targetTopic) return null;

    return buildResolvedOutcome({
      topic: targetTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: targetTopic.name,
      matchConfidence: 0.82,
      usedLLMFallback: false,
      resolutionTrace: null,
      semanticTopicRouting: null,
      centroidUpdatePlan: null,
      topicLabelingMode: "model_v3_3_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
      deterministicTrustedWithoutLLM: false,
      deterministicCreateBlockedAsSuspicious: false,
      structurallyStrongResolvedLabel: false,
      narrowerThanActiveBroadTopic: false,
    });
  }

  return null;
}

function buildConservativeFallbackOutcome(args: {
  existingTopics: RouteTopic[];
  message: string;
  semanticVectorInfo: VectorInfo;
  activeTopic: RouteTopic | null;
  topicLabelingMode: TopicLabelingMode;
  llmFallbackAllowedByMode: boolean;
  llmFallbackRecommendedByPolicy: boolean;
  llmFallbackAttempted: boolean;
  resolutionTrace?: TopicResolutionTrace | null;
  deterministicCreateBlockedAsSuspicious?: boolean;
}): TopicResolutionOutcome {
  const {
    existingTopics,
    semanticVectorInfo,
    activeTopic,
    topicLabelingMode,
    llmFallbackAllowedByMode,
    llmFallbackRecommendedByPolicy,
    llmFallbackAttempted,
    resolutionTrace,
    deterministicCreateBlockedAsSuspicious,
  } = args;

  if (activeTopic) {
    return buildResolvedOutcome({
      topic: activeTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: activeTopic.name,
      matchConfidence: 0.32,
      usedLLMFallback: false,
      resolutionTrace: resolutionTrace ?? null,
      topicLabelingMode,
      llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy,
      llmFallbackAttempted,
      deterministicCreateBlockedAsSuspicious:
        deterministicCreateBlockedAsSuspicious ?? false,
    });
  }

  const fallbackTopic = buildRouteTopicFromResolvedLabel({
    existingTopics,
    resolvedLabel: resolveFallbackTopicLabel({ resolutionTrace }),
  });

  return buildResolvedOutcome({
    topic: fallbackTopic,
    createdTopic: fallbackTopic,
    routeTopics: [...existingTopics, fallbackTopic],
    resolutionKind: "created_new_candidate",
    vectorInfo: semanticVectorInfo,
    resolvedLabel: fallbackTopic.name,
    matchConfidence: 0.22,
    usedLLMFallback: false,
    resolutionTrace: resolutionTrace ?? null,
    topicLabelingMode,
    llmFallbackAllowedByMode,
    llmFallbackRecommendedByPolicy,
    llmFallbackAttempted,
    deterministicCreateBlockedAsSuspicious:
      deterministicCreateBlockedAsSuspicious ?? false,
  });
}

async function resolveTopicOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopicId?: string | null;
  message: string;
  semanticVectorInfo: VectorInfo;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  currentInteractionContext: ImportantRunInputs["current_interaction_context"];
}): Promise<TopicResolutionOutcome> {
  const {
    existingTopics,
    activeTopicId,
    message,
    semanticVectorInfo,
    messageEmbedding,
    embeddingModel,
    currentInteractionContext,
  } = args;
  const topicLabelingMode = getTopicLabelingMode();
  const llmFallbackAllowedByMode =
    topicLabelingMode === "deterministic_plus_llm";

  const activeTopic =
    activeTopicId != null
      ? existingTopics.find((topic) => topic.id === activeTopicId) ?? null
      : null;

  const deterministicMatch = resolveTopicForMessage(
    message,
    existingTopics,
    activeTopic,
    semanticVectorInfo,
    {
      messageEmbedding,
      embeddingModel,
      currentInteractionContext,
    }
  );

  const deterministicSnapshot =
    buildDeterministicTopicResolutionSnapshot(deterministicMatch);

  const deterministicResolvedLabel = deterministicMatch.resolvedLabel ?? null;
  const structurallyStrongResolvedLabel = isStructurallyStrongTopicLabel(
    deterministicResolvedLabel
  );
  const narrowerThanActiveBroadTopic = isNarrowerThanExistingBroadTopic({
    label: deterministicResolvedLabel,
    existingTopicName: activeTopic?.name ?? null,
  });
  const deterministicCreateBlockedAsSuspicious =
    Boolean(deterministicMatch.shouldCreateNewTopic && deterministicResolvedLabel) &&
    looksLikeSuspiciousCreateLabel(deterministicResolvedLabel);
  const deterministicCreateTrusted = shouldTrustDeterministicCreate({
    resolvedLabel: deterministicResolvedLabel,
    matchConfidence: deterministicMatch.matchConfidence,
    activeTopic,
    resolutionTrace: deterministicMatch.resolutionTrace ?? null,
  });

  const llmFallbackRecommendedByPolicy = shouldTryLLMTopicResolutionFallback({
    ...deterministicSnapshot,
    existingTopicsCount: existingTopics.length,
    vectorInfo: deterministicMatch.vectorInfo,
  });

  const shouldEscalate =
    llmFallbackAllowedByMode &&
    llmFallbackRecommendedByPolicy &&
    !deterministicCreateTrusted;

  if (!shouldEscalate) {
    if (deterministicMatch.matchedTopic) {
      return buildResolvedOutcome({
        topic: deterministicMatch.matchedTopic,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind: deterministicMatch.resolutionKind,
        vectorInfo: deterministicMatch.vectorInfo,
        resolvedLabel: deterministicMatch.resolvedLabel,
        matchConfidence: deterministicMatch.matchConfidence,
        usedLLMFallback: false,
        resolutionTrace: deterministicMatch.resolutionTrace ?? null,
        semanticTopicRouting: buildTopicRoutingStateFromMatch({
          match: deterministicMatch,
          vectorInfo: deterministicMatch.vectorInfo,
          centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        }),
        centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        topicLabelingMode,
        llmFallbackAllowedByMode,
        llmFallbackRecommendedByPolicy,
        llmFallbackAttempted: false,
        deterministicTrustedWithoutLLM: deterministicCreateTrusted,
        deterministicCreateBlockedAsSuspicious,
        structurallyStrongResolvedLabel,
        narrowerThanActiveBroadTopic,
      });
    }

    if (
      deterministicMatch.shouldCreateNewTopic &&
      deterministicMatch.resolvedLabel &&
      deterministicCreateTrusted
    ) {
      const createdTopic = buildRouteTopicFromResolvedLabel({
        existingTopics,
        resolvedLabel: deterministicMatch.resolvedLabel,
      });

      return buildResolvedOutcome({
        topic: createdTopic,
        createdTopic,
        routeTopics: [...existingTopics, createdTopic],
        resolutionKind: "created_new_candidate",
        vectorInfo: deterministicMatch.vectorInfo,
        resolvedLabel: deterministicMatch.resolvedLabel,
        matchConfidence: deterministicMatch.matchConfidence,
        usedLLMFallback: false,
        resolutionTrace: deterministicMatch.resolutionTrace ?? null,
        semanticTopicRouting: buildTopicRoutingStateFromMatch({
          match: deterministicMatch,
          vectorInfo: deterministicMatch.vectorInfo,
          centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        }),
        centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        topicLabelingMode,
        llmFallbackAllowedByMode,
        llmFallbackRecommendedByPolicy,
        llmFallbackAttempted: false,
        deterministicTrustedWithoutLLM: deterministicCreateTrusted,
        deterministicCreateBlockedAsSuspicious,
        structurallyStrongResolvedLabel,
        narrowerThanActiveBroadTopic,
      });
    }

    return buildConservativeFallbackOutcome({
      existingTopics,
      message,
      semanticVectorInfo: deterministicMatch.vectorInfo,
      activeTopic,
      topicLabelingMode,
      llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy,
      llmFallbackAttempted: false,
      resolutionTrace: deterministicMatch.resolutionTrace ?? null,
      deterministicCreateBlockedAsSuspicious,
    });
  }

  let llmDecision: TopicLabelingLLMDecision | null = null;

  try {
    llmDecision = await withTimeout(
      runTopicLabelingLLMAdjudication({
        message,
        activeTopic,
        existingTopics,
        deterministicResolution: deterministicSnapshot,
      }),
      getLLMFallbackTimeoutMs(),
      "Topic labeling LLM fallback"
    );
  } catch (error) {
    console.warn("Topic labeling LLM fallback failed or timed out.", error);
    llmDecision = null;
  }

  if (llmDecision) {
    if (llmDecision.decision === "reuse_existing") {
      const matchedTopic = findTopicFromLLMResult({
        existingTopics,
        decision: llmDecision,
      });

      if (matchedTopic) {
        return buildResolvedOutcome({
          topic: matchedTopic,
          createdTopic: null,
          routeTopics: existingTopics,
          resolutionKind:
            matchedTopic.id === activeTopic?.id
              ? "fallback_active_topic"
              : "matched_existing",
          vectorInfo: deterministicMatch.vectorInfo,
          resolvedLabel: llmDecision.canonical_label ?? matchedTopic.name,
          matchConfidence: llmDecision.confidence,
          usedLLMFallback: true,
          resolutionTrace: deterministicMatch.resolutionTrace ?? null,
          topicLabelingMode,
          llmFallbackAllowedByMode,
          llmFallbackRecommendedByPolicy,
          llmFallbackAttempted: true,
        });
      }
    }

    if (llmDecision.decision === "fallback_active" && activeTopic) {
      return buildResolvedOutcome({
        topic: activeTopic,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind: "fallback_active_topic",
        vectorInfo: deterministicMatch.vectorInfo,
        resolvedLabel: llmDecision.canonical_label ?? activeTopic.name,
        matchConfidence: llmDecision.confidence,
        usedLLMFallback: true,
        resolutionTrace: deterministicMatch.resolutionTrace ?? null,
        semanticTopicRouting: buildTopicRoutingStateFromMatch({
          match: deterministicMatch,
          vectorInfo: deterministicMatch.vectorInfo,
          centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        }),
        centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        topicLabelingMode,
        llmFallbackAllowedByMode,
        llmFallbackRecommendedByPolicy,
        llmFallbackAttempted: true,
      });
    }

    if (
      llmDecision.decision === "create_new" &&
      llmDecision.canonical_label &&
      !looksLikeSuspiciousCreateLabel(llmDecision.canonical_label)
    ) {
      const createdTopic = buildRouteTopicFromResolvedLabel({
        existingTopics,
        resolvedLabel: llmDecision.canonical_label,
      });

      return buildResolvedOutcome({
        topic: createdTopic,
        createdTopic,
        routeTopics: [...existingTopics, createdTopic],
        resolutionKind: "created_new_candidate",
        vectorInfo: deterministicMatch.vectorInfo,
        resolvedLabel: llmDecision.canonical_label,
        matchConfidence: llmDecision.confidence,
        usedLLMFallback: true,
        resolutionTrace: deterministicMatch.resolutionTrace ?? null,
        semanticTopicRouting: buildTopicRoutingStateFromMatch({
          match: deterministicMatch,
          vectorInfo: deterministicMatch.vectorInfo,
          centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        }),
        centroidUpdatePlan: deterministicMatch.centroidUpdatePlan ?? null,
        topicLabelingMode,
        llmFallbackAllowedByMode,
        llmFallbackRecommendedByPolicy,
        llmFallbackAttempted: true,
      });
    }
  }

  if (deterministicMatch.matchedTopic) {
    return buildResolvedOutcome({
      topic: deterministicMatch.matchedTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: deterministicMatch.resolutionKind,
      vectorInfo: deterministicMatch.vectorInfo,
      resolvedLabel: deterministicMatch.resolvedLabel,
      matchConfidence: deterministicMatch.matchConfidence,
      usedLLMFallback: false,
      resolutionTrace: deterministicMatch.resolutionTrace ?? null,
      topicLabelingMode,
      llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy,
      llmFallbackAttempted: true,
    });
  }

  if (
    deterministicMatch.shouldCreateNewTopic &&
    deterministicMatch.resolvedLabel &&
    deterministicCreateTrusted
  ) {
    const createdTopic = buildRouteTopicFromResolvedLabel({
      existingTopics,
      resolvedLabel: deterministicMatch.resolvedLabel,
    });

    return buildResolvedOutcome({
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: deterministicMatch.vectorInfo,
      resolvedLabel: deterministicMatch.resolvedLabel,
      matchConfidence: deterministicMatch.matchConfidence,
      usedLLMFallback: false,
      resolutionTrace: deterministicMatch.resolutionTrace ?? null,
      topicLabelingMode,
      llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy,
      llmFallbackAttempted: true,
    });
  }

  return buildConservativeFallbackOutcome({
    existingTopics,
    message,
    semanticVectorInfo: deterministicMatch.vectorInfo,
    activeTopic,
    topicLabelingMode,
    llmFallbackAllowedByMode,
    llmFallbackRecommendedByPolicy,
    llmFallbackAttempted: true,
    resolutionTrace: deterministicMatch.resolutionTrace ?? null,
    deterministicCreateBlockedAsSuspicious,
  });
}

export async function POST(request: Request) {
  const timer = createMessageRouteTimer();

  let topicCountLoaded: number | null = null;

  let incomingActiveTopicId: string | null = null;
  let incomingActiveTopicFound: boolean | null = null;
  let incomingActiveTopicName: string | null = null;
  let viewportFocusedTopicId: string | null = null;
  let viewportSelectedTopicId: string | null = null;
  let viewportActiveTopicIdForMessage: string | null = null;

  const qdrantQueryMode = getTopicRoutingQdrantQueryMode();
  let qdrantQueryAttempted = false;
  let qdrantQuerySucceeded: boolean | null = null;
  let qdrantQueryError: string | null = null;
  let qdrantQuerySkippedReason: string | null =
    qdrantQueryMode === "off" ? "qdrant_query_mode_off" : null;

  let qdrantSyncAttempted = false;
  let qdrantSyncSucceeded: boolean | null = null;
  let qdrantSyncError: string | null = null;
  let qdrantSyncDurationMs: number | null = null;

  let finalModelSignalsStatus: ModelSignals["status"] | null = null;
  let finalTopicLabelingMode: TopicLabelingMode | null = null;
  let finalResolutionKind: RouteResolutionKind | null = null;
  let finalUsedLLMFallback: boolean | null = null;
  let finalMessageEmbeddingAvailable: boolean | null = null;
  let finalEmbeddingModel: string | null = null;
  let finalCentroidUpdateMethod: string | null = null;

  const topicLabelerV3CompareEnabled = getTopicLabelerV3CompareEnabled();
  let topicLabelerV3CompareResult: TopicLabelerV3ClientResult | null = null;
  let modelTopicRoutePolicyDecision: ModelTopicRoutePolicyDecision | null = null;
  let modelTopicPolicyUsedAsAuthority = false;
  let topicAuthoritySource: string | null = null;

  try {
    const body = (await request.json()) as MessageRouteBody;
    timer.step("parse_request_json");

    const message = body.messageText?.trim() || body.message?.trim();

    if (!message) {
      timer.step("validate_message_missing");

      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 }
      );
    }

    incomingActiveTopicId = asOptionalString(body.activeTopicId);
    viewportFocusedTopicId = asOptionalString(body.viewportContext?.focusedTopicId);
    viewportSelectedTopicId = asOptionalString(body.viewportContext?.selectedTopicId);
    viewportActiveTopicIdForMessage = asOptionalString(
      body.viewportContext?.activeTopicIdForMessage
    );

    const recentTurns = normalizeRecentTurns(body);
    const chatHistory = buildChatHistoryFromBody(body);
    timer.step("normalize_message_and_chat_history");

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

    finalModelSignalsStatus = modelSignals.status;
    timer.step("score_confusion_insight");

    const existingTopics = await loadRouteTopics();
    topicCountLoaded = existingTopics.length;

    const activeTopicFromRequest =
      incomingActiveTopicId != null
        ? existingTopics.find((topic) => topic.id === incomingActiveTopicId) ?? null
        : null;

    incomingActiveTopicFound = Boolean(activeTopicFromRequest);
    incomingActiveTopicName = activeTopicFromRequest?.name ?? null;

    timer.step("load_route_topics_from_supabase");

    if (topicLabelerV3CompareEnabled) {
      const topicLabelerV3Request = buildTopicLabelerV3Request({
        message,
        activeTopicName: incomingActiveTopicName,
        currentTopicNames: existingTopics.map((topic) => topic.name),
        previousUserMessages: buildRecentUserMessagesForTopicLabelerV3(
          recentTurns
        ),
      });

      topicLabelerV3CompareResult = await callTopicLabelerV3(
        topicLabelerV3Request,
        { timeoutMs: 15_000 }
      );

      console.info("[topic-labeler-v3 compare: model result]", {
        request: topicLabelerV3Request,
        result: topicLabelerV3CompareResult,
        note: "V3/model policy is now allowed to be authoritative for safe route decisions.",
      });
    }

    timer.step("topic_labeler_v3_compare");

    modelTopicRoutePolicyDecision = buildModelTopicRoutePolicyDecision({
      modelResult: topicLabelerV3CompareResult,
      activeTopic: activeTopicFromRequest,
      existingTopics,
    });

    console.info("[topic-labeler-v3 policy decision]", {
      usable: modelTopicRoutePolicyDecision.usable,
      decision_kind: modelTopicRoutePolicyDecision.decision_kind,
      extracted_label: modelTopicRoutePolicyDecision.extracted_label,
      matched_topic_name: modelTopicRoutePolicyDecision.matched_topic_name,
      matched_topic_id: modelTopicRoutePolicyDecision.matched_topic_id,
      reasons: modelTopicRoutePolicyDecision.reasons,
      note: "Policy may be authoritative for create_new, switch_existing, or stay_active. Clarify/no-topic still falls back.",
    });

    timer.step("model_topic_policy_decision");

    let semanticVectorInfo: VectorInfo = emptyVectorInfo();
    let messageEmbedding: EmbeddingVector | null = null;
    let embeddingModel: string | null = null;

    try {
      const embeddingResult = await embedMessageForSemanticRouting(message);
      messageEmbedding = embeddingResult.messageEmbedding;
      embeddingModel = embeddingResult.embeddingModel;
      finalMessageEmbeddingAvailable = Boolean(messageEmbedding?.length);
      finalEmbeddingModel = embeddingModel;
    } catch (error) {
      console.warn("Message embedding failed in POST /api/message", error);
      messageEmbedding = null;
      embeddingModel = null;
      finalMessageEmbeddingAvailable = false;
      finalEmbeddingModel = null;
    }

    timer.step("embed_message_for_semantic_routing");

    if (messageEmbedding?.length && qdrantQueryMode === "always") {
      qdrantQueryAttempted = true;
      qdrantQuerySkippedReason = null;

      try {
        const qdrantQuery = await querySemanticTopicCandidatesFromEmbedding(
          messageEmbedding,
          5,
          embeddingModel
        );

        semanticVectorInfo = qdrantQuery.vectorInfo;
        qdrantQuerySucceeded = true;

        if (!qdrantQuery.candidates.length) {
          qdrantQuerySkippedReason =
            qdrantQuery.debug?.metadata.skipped_reason ?? "no_qdrant_candidates";
        }
      } catch (error) {
        qdrantQuerySucceeded = false;
        qdrantQueryError =
          error instanceof Error ? error.message : "Unknown Qdrant query error";
        qdrantQuerySkippedReason = "qdrant_query_failed";
        semanticVectorInfo = emptyVectorInfo();

        console.warn("Qdrant topic query failed in POST /api/message", error);
      }
    }

    timer.step("optional_qdrant_topic_query");

    const preliminaryInteractionContext: ImportantRunInputs["current_interaction_context"] = {
      run_kind:
        incomingActiveTopicId && recentTurns.length > 0
          ? "mixed"
          : "initial_question",
      is_response_to_delivered_probe: false,
      prior_mode_selected: null,
      prior_probe_was_applicable: null,
      prior_probe_id: null,
      prior_mode_outcome_available: recentTurns.length > 0,
    };

    const modelAuthoritativeTopicResolution =
      buildModelAuthoritativeTopicResolutionOutcome({
        existingTopics,
        modelPolicyDecision: modelTopicRoutePolicyDecision,
        semanticVectorInfo,
      });

    let topicResolution: TopicResolutionOutcome;

    if (modelAuthoritativeTopicResolution) {
      topicResolution = modelAuthoritativeTopicResolution;
      modelTopicPolicyUsedAsAuthority = true;
      topicAuthoritySource = "model_v3_3_policy";
    } else {
      topicResolution = await resolveTopicOutcome({
        existingTopics,
        activeTopicId: incomingActiveTopicId,
        message,
        semanticVectorInfo,
        messageEmbedding,
        embeddingModel,
        currentInteractionContext: preliminaryInteractionContext,
      });
      modelTopicPolicyUsedAsAuthority = false;
      topicAuthoritySource = "deterministic_fallback";
    }

    timer.step("resolve_topic_outcome");

    const {
      topic,
      createdTopic,
      routeTopics,
      resolutionKind,
      vectorInfo,
      resolvedLabel,
      matchConfidence,
      usedLLMFallback,
      resolutionTrace,
      semanticTopicRouting,
      centroidUpdatePlan: initialCentroidUpdatePlan,
      debug: topicResolutionDebug,
    } = topicResolution;

    finalTopicLabelingMode = topicResolutionDebug.topic_labeling_mode;
    finalResolutionKind = resolutionKind;
    finalUsedLLMFallback = usedLLMFallback;

    if (topicLabelerV3CompareEnabled) {
      console.info("[topic-labeler-v3 compare: route authority decision]", {
        actual_authoritative_result: {
          authority_source: topicAuthoritySource,
          model_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
          resolution_kind: resolutionKind,
          resolved_label: resolvedLabel,
          target_topic_id: topic.id,
          target_topic_name: topic.name,
          created_topic_name: createdTopic?.name ?? null,
          match_confidence: matchConfidence,
          used_llm_topic_fallback: usedLLMFallback,
        },
        model_v3_compare_result: topicLabelerV3CompareResult,
      });
    }

    const targetTopicId = topic.id;
    const resolvedMessageFrame = getResolvedMessageFrame(resolutionTrace);
    const preferredModality =
      derivePreferredModalityFromResolutionFrame(resolvedMessageFrame);
    const clarifySeeking =
      modelTopicPolicyUsedAsAuthority &&
      modelTopicRoutePolicyDecision?.decision_kind === "stay_active"
        ? true
        : deriveClarifySeekingFromResolutionFrame(resolvedMessageFrame);
    timer.step("derive_route_message_signals");

    const currentInteractionContext: ImportantRunInputs["current_interaction_context"] =
      {
        run_kind: inferMessageRouteRunKind({
          recentTurns,
          hasActiveTopicId: Boolean(incomingActiveTopicId),
          clarifySeeking,
        }),
        is_response_to_delivered_probe: false,
        prior_mode_selected:
          recentTurns.length > 0 && clarifySeeking ? "clarify" : null,
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

    timer.step("build_interaction_context_and_attempt_shell");

    const updatedTopicMetrics = buildUpdatedMetrics(targetTopicId, topic);

    const finalCentroidUpdatePlan =
      initialCentroidUpdatePlan ??
      buildCreatedTopicCentroidPlan({
        createdTopic,
        messageEmbedding,
        embeddingModel,
      });

    const metricUpdatedTopics = routeTopics.map((routeTopic) =>
      routeTopic.id === targetTopicId
        ? applyMetricUpdate(routeTopic, updatedTopicMetrics)
        : routeTopic
    );

    const updatedTopics = applyCentroidUpdatePlanToTopics(
      metricUpdatedTopics,
      finalCentroidUpdatePlan
    );

    const updatedResolvedTopic =
      updatedTopics.find((routeTopic) => routeTopic.id === targetTopicId) ?? topic;

    finalCentroidUpdateMethod = finalCentroidUpdatePlan?.update_method ?? null;

    const topicRouting = semanticTopicRouting
      ? {
          ...semanticTopicRouting,
          selected_topic_id: targetTopicId,
          selected_topic_name: updatedResolvedTopic.name,
          centroid_update: finalCentroidUpdatePlan
            ? {
                topic_id: finalCentroidUpdatePlan.topic_id,
                previous_embedding_count:
                  finalCentroidUpdatePlan.previous_embedding_count,
                new_embedding_count: finalCentroidUpdatePlan.new_embedding_count,
                update_method: finalCentroidUpdatePlan.update_method,
                alpha: finalCentroidUpdatePlan.alpha,
                embedding_model: finalCentroidUpdatePlan.embedding_model,
                updated_at: finalCentroidUpdatePlan.updated_at,
              }
            : null,
        }
      : null;

    const normalizedVectorInfo = normalizeVectorInfoFallback(
      vectorInfo,
      topic,
      Boolean(createdTopic)
    );

    const decision = buildInterventionModeDecision(
      updatedResolvedTopic,
      normalizedVectorInfo,
      preferredModality,
      message,
      Boolean(createdTopic),
      modelSignals,
      currentInteractionContext,
      newAttempt,
      resolutionKind,
      clarifySeeking
    );

    const probePlan =
      decision.mode_selected === "probe"
        ? buildProbePlan(
            updatedResolvedTopic,
            decision,
            message,
            preferredModality
          )
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
      previousModeOutcome,
      topicRouting
    );

    timer.step("build_decision_probe_delivery_and_engine_fuel");

    const rawLearningSpace = buildLearningSpace(updatedTopics) as RawLearningSpace;
    const learningSpace = adaptLearningSpaceToContract(
      rawLearningSpace,
      updatedTopics
    );

    timer.step("build_learning_space");

    const runId = makeId("run");

    const result: MyWayRunResult = {
      run_metadata: buildRunMetadata(engineFuel, runId),
      important_run_inputs: buildImportantRunInputs(
        message,
        normalizedVectorInfo,
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
        inferred_keywords: inferKeywordsFromTopicLabel(
          resolvedLabel ?? updatedResolvedTopic.name
        ),
        updated_topic_metrics: updatedTopicMetrics,
        learning_space_topic:
          learningSpace.topics.find((t) => t.topic_id === updatedResolvedTopic.id) ??
          null,
        planned_probe: deliveredResponse.delivered_probe ?? null,
        resolution_kind: resolutionKind,
        resolved_label: resolvedLabel,
        match_confidence: matchConfidence,
        used_llm_topic_fallback: usedLLMFallback,
        topic_resolution_debug: topicResolutionDebug,
        topic_resolution_trace: resolutionTrace,
        semantic_vector_info: normalizedVectorInfo,
        topic_routing: topicRouting,
        topic_labeler_v3_compare: topicLabelerV3CompareResult,
        model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
        model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
        topic_authority_source: topicAuthoritySource,
        centroid_update_plan: finalCentroidUpdatePlan,
        topic_embedding_centroid: updatedResolvedTopic.topic_embedding_centroid ?? null,
        topic_embedding_count: updatedResolvedTopic.topic_embedding_count ?? 0,
        topic_embedding_model: updatedResolvedTopic.topic_embedding_model ?? null,
        topic_embedding_updated_at:
          updatedResolvedTopic.topic_embedding_updated_at ?? null,
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

    timer.step("serialize_result_topic_json_and_scene_update");

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

    timer.step("insert_run_supabase");

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
      ...getTopicCentroidMetadata(updatedResolvedTopic),
    });

    timer.step("upsert_topic_state_supabase");

    if (canSyncTopicToQdrant()) {
      qdrantSyncAttempted = true;

      const syncResult = await syncTopicToQdrantBestEffort({
        topicId: updatedResolvedTopic.id,
        topicName: updatedResolvedTopic.name,
        diagnosis: decision.active_diagnosis,
        nextStep:
          probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
        updatedAt: nowIso(),
        topicJson,
        ...getTopicCentroidMetadata(updatedResolvedTopic),
      });

      qdrantSyncSucceeded = syncResult.ok;
      qdrantSyncError = syncResult.error;
      qdrantSyncDurationMs = syncResult.duration_ms;
    } else {
      qdrantSyncSucceeded = null;
      qdrantSyncError = "missing_qdrant_config";
    }

    timer.step("sync_topic_to_qdrant_best_effort");

    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_name: incomingActiveTopicName,
      viewport_focused_topic_id: viewportFocusedTopicId,
      viewport_selected_topic_id: viewportSelectedTopicId,
      viewport_active_topic_id_for_message: viewportActiveTopicIdForMessage,

      qdrant_query_mode: qdrantQueryMode,
      qdrant_query_attempted: qdrantQueryAttempted,
      qdrant_query_succeeded: qdrantQuerySucceeded,
      qdrant_query_error: qdrantQueryError,
      qdrant_query_skipped_reason: qdrantQuerySkippedReason,

      qdrant_sync_attempted: qdrantSyncAttempted,
      qdrant_sync_succeeded: qdrantSyncSucceeded,
      qdrant_sync_error: qdrantSyncError,
      qdrant_sync_duration_ms: qdrantSyncDurationMs,

      confusion_insight_status: finalModelSignalsStatus,
      topic_labeling_mode: finalTopicLabelingMode,
      resolution_kind: finalResolutionKind,
      used_llm_topic_fallback: finalUsedLLMFallback,
      message_embedding_available: Boolean(messageEmbedding?.length),
      embedding_model: embeddingModel,
      centroid_update_method: finalCentroidUpdatePlan?.update_method ?? null,

      topic_labeler_v3_compare_enabled: topicLabelerV3CompareEnabled,
      topic_labeler_v3_attempted:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).attempted,
      topic_labeler_v3_succeeded:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).succeeded,
      topic_labeler_v3_error:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).error,
      topic_labeler_v3_latency_ms:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).latency_ms,
      topic_labeler_v3_route_decision:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .route_decision,
      topic_labeler_v3_extracted_label:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .extracted_label,
      topic_labeler_v3_matched_topic_name:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .matched_topic_name,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_name:
        modelTopicRoutePolicyDecision?.matched_topic_name ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
    });

    console.info("[POST /api/message timing]", latencyDebug);

    const response: MessageRouteResponse & {
      topic_resolution_debug: TopicResolutionDebug;
      topic_resolution_trace: TopicResolutionTrace | null;
      topic_routing: TopicRoutingState | null;
      topic_labeler_v3_compare: TopicLabelerV3ClientResult | null;
      model_topic_route_policy_decision: ModelTopicRoutePolicyDecision | null;
      model_topic_policy_used_as_authority: boolean;
      topic_authority_source: string | null;
      latency_debug: MessageRouteLatencyDebug;
    } = {
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
      topic_resolution_debug: topicResolutionDebug,
      topic_resolution_trace: resolutionTrace,
      topic_routing: topicRouting,
      topic_labeler_v3_compare: topicLabelerV3CompareResult,
      model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
      latency_debug: latencyDebug,
    };

    return NextResponse.json(response);
  } catch (error) {
    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_name: incomingActiveTopicName,
      viewport_focused_topic_id: viewportFocusedTopicId,
      viewport_selected_topic_id: viewportSelectedTopicId,
      viewport_active_topic_id_for_message: viewportActiveTopicIdForMessage,

      qdrant_query_mode: qdrantQueryMode,
      qdrant_query_attempted: qdrantQueryAttempted,
      qdrant_query_succeeded: qdrantQuerySucceeded,
      qdrant_query_error: qdrantQueryError,
      qdrant_query_skipped_reason: qdrantQuerySkippedReason,

      qdrant_sync_attempted: qdrantSyncAttempted,
      qdrant_sync_succeeded: qdrantSyncSucceeded,
      qdrant_sync_error: qdrantSyncError,
      qdrant_sync_duration_ms: qdrantSyncDurationMs,

      confusion_insight_status: finalModelSignalsStatus,
      topic_labeling_mode: finalTopicLabelingMode,
      resolution_kind: finalResolutionKind,
      used_llm_topic_fallback: finalUsedLLMFallback,
      message_embedding_available: finalMessageEmbeddingAvailable,
      embedding_model: finalEmbeddingModel,
      centroid_update_method: finalCentroidUpdateMethod,

      topic_labeler_v3_compare_enabled: topicLabelerV3CompareEnabled,
      topic_labeler_v3_attempted:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).attempted,
      topic_labeler_v3_succeeded:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).succeeded,
      topic_labeler_v3_error:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).error,
      topic_labeler_v3_latency_ms:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult).latency_ms,
      topic_labeler_v3_route_decision:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .route_decision,
      topic_labeler_v3_extracted_label:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .extracted_label,
      topic_labeler_v3_matched_topic_name:
        getTopicLabelerV3CompareSummary(topicLabelerV3CompareResult)
          .matched_topic_name,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_name:
        modelTopicRoutePolicyDecision?.matched_topic_name ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
    });

    console.error("POST /api/message failed", error);
    console.info("[POST /api/message timing before failure]", latencyDebug);

    return NextResponse.json(
      {
        error: "Failed to process message.",
        latency_debug: latencyDebug,
      },
      { status: 500 }
    );
  }
}