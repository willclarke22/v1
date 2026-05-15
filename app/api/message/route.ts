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
import type { TopicResolutionTrace } from "@/lib/runtime/topic-routing-trace";

import {
  buildSeededTopicFromResolvedLabel as buildSeededRouteTopicFromResolvedLabel,
  inferKeywordsFromTopicLabel,
  loadRouteTopics,
  type RouteTopic,
} from "@/lib/runtime/route-topics";
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
  buildTopicLabelerRequest,
  callConfiguredTopicLabeler,
  getTopicLabelerEnabled,
  getTopicLabelerProvider,
  getTopicLabelerTimeoutMs,
  type TopicLabelerClientResult,
} from "@/lib/runtime/topic-labeling-model/topic-labeler-client";
import {
  buildModelTopicRoutePolicyDecision,
  type ModelTopicRoutePolicyDecision,
} from "@/lib/runtime/topic-labeling-model/topic-labeler-policy";
import {
  buildModelFirstTopicResolutionOutcome,
  buildModelRouteContinuationPolicy,
  isModelPolicySafePositiveDecision,
  type ModelFirstTopicResolutionOutcome,
  type ModelRouteContinuationPolicy,
  type SemanticEnrichmentStatus,
} from "@/lib/runtime/topic-labeling-model/model-topic-resolution";

type RawLearningSpaceTopic = {
  topic_id?: string;
  topic_label?: string;
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
  cluster_label?: string;
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
  | "topic_labeler_primary";

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
    incoming_active_topic_label: string | null;
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

    topic_labeler_provider: string | null;
    topic_labeler_enabled: boolean;
    topic_labeler_attempted: boolean;
    topic_labeler_succeeded: boolean | null;
    topic_labeler_error: string | null;
    topic_labeler_latency_ms: number | null;
    topic_labeler_route_decision: string | null;
    topic_labeler_extracted_label: string | null;
    topic_labeler_matched_topic_label: string | null;

    model_topic_policy_usable: boolean | null;
    model_topic_policy_decision_kind: string | null;
    model_topic_policy_extracted_label: string | null;
    model_topic_policy_matched_topic_label: string | null;
    model_topic_policy_reasons: string[] | null;
    model_topic_policy_used_as_authority: boolean | null;
    topic_authority_source: string | null;

    model_route_continuation_policy_kind: string | null;
    model_route_learner_message_intent: string | null;
    model_route_should_create_learning_topic: boolean | null;
    model_route_should_update_learning_space: boolean | null;
    model_route_should_treat_as_learning_evidence: boolean | null;
    model_route_should_myway_choose_target: boolean | null;
    model_route_should_ask_user_to_choose: boolean | null;

    semantic_enrichment_status: string | null;
    needs_embedding_centroid: boolean | null;
    embedding_skip_reason: string | null;
    layout_status: string | null;
    should_schedule_enrichment: boolean | null;
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
    top_k_topic_labels: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTopicRoutingQdrantQueryMode(): TopicRoutingQdrantQueryMode {
  const raw = process.env.MYWAY_TOPIC_ROUTING_QDRANT_QUERY_MODE
    ?.trim()
    .toLowerCase();

  if (raw === "always") return "always";

  /**
   * Default is intentionally "off" for this pass.
   *
   * The route now embeds once and lets the configured topic labeler perform local Supabase embedding ranking.
   * We will add "local confidence -> optional Qdrant" after updating topic-router.ts
   * and topic-routing-policy.ts.
   */
  return "off";
}

function shouldSyncQdrantOnMessageRoute() {
  const raw = process.env.MYWAY_QDRANT_SYNC_ON_MESSAGE?.trim().toLowerCase();

  /**
   * Default is intentionally false during the topic-label/message-embedding
   * migration. Qdrant should receive the topic_label_embedding vector from the
   * idle semantic-enrichment runner, not a raw learner-message embedding from
   * the foreground message route.
   */
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

function buildRecentUserMessagesForTopicLabeler(
  recentTurns: Array<{ role: "user" | "assistant"; text: string }>
) {
  return recentTurns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .slice(-5);
}

function getTopicLabelerSummary(result: TopicLabelerClientResult | null) {
  if (!result) {
    return {
      attempted: false,
      provider: getTopicLabelerProvider(),
      succeeded: null,
      error: null,
      latency_ms: null,
      route_decision: null,
      extracted_label: null,
      matched_topic_label: null,
    };
  }

  if (!result.ok) {
    return {
      attempted: true,
      provider: result.provider,
      succeeded: false,
      error: result.error,
      latency_ms: result.latency_ms,
      route_decision: null,
      extracted_label: null,
      matched_topic_label: null,
    };
  }

  return {
    attempted: true,
    provider: result.provider,
    succeeded: true,
    error: null,
    latency_ms: result.latency_ms,
    route_decision: result.response.route.route_decision,
    extracted_label:
      result.response.route.extracted_label ??
      result.response.model_prediction.extracted_label,
    matched_topic_label: result.response.route.matched_topic_label ?? null,
  };
}

function getMessageEmbeddingSkipReason(args: {
  decision: ModelTopicRoutePolicyDecision | null;
  continuationPolicy: ModelRouteContinuationPolicy | null;
  topicLabelerEnabled: boolean;
}): string | null {
  const { decision, continuationPolicy, topicLabelerEnabled } = args;

  if (isModelPolicySafePositiveDecision(decision)) {
    return "model_policy_safe_authoritative_decision";
  }

  /**
   * If the configured topic labeler was actually attempted and failed/timed out into a recovery policy,
   * do not pay for synchronous semantic embedding in /api/message.
   *
   * In these cases we are intentionally not using semantic routing to create or
   * switch topics; the safest behavior is to return the recovery response and
   * avoid adding another 2-4s of embedding latency after the model has already
   * failed.
   */
  if (
    topicLabelerEnabled &&
    continuationPolicy &&
    (continuationPolicy.kind === "stay_active_after_model_failure" ||
      continuationPolicy.kind === "ask_lightweight_retry" ||
      continuationPolicy.kind === "invite_word_vomit" ||
      continuationPolicy.kind === "no_learning_space_change")
  ) {
    return `model_continuation_policy_${continuationPolicy.kind}`;
  }

  return null;
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
  topicLabel: string,
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

  return `I think your message connects most strongly to ${topicLabel}. Right now, ${diagnosisText}, so I’m moving us there and preparing a focused next step to reveal what you already understand.`;
}

function buildClarifyReply(
  topicLabel: string,
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

  return `I think your message connects most strongly to ${topicLabel}. Right now, the best next move is clarification rather than measurement, because you may first need ${diagnosisText}. I’ll stabilize the idea a bit before asking you to demonstrate it.`;
}

function buildSuggestedAction(
  topicLabel: string,
  nextStep: string,
  mode: "clarify" | "probe"
) {
  if (mode === "clarify") {
    return `First, let’s stabilize ${topicLabel.toLowerCase()} so the next step feels clearer: ${nextStep}`;
  }

  return `Next, let’s work on ${topicLabel.toLowerCase()}: ${nextStep}`;
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
                : probePlan.text_plan.instructional_goal ?? `Explain ${topic.topic_label}`;

  const instructions =
    selected.modality === "video"
      ? probePlan.video_payload.narration ??
        probePlan.video_payload.prompt ??
        `Watch carefully, then respond about ${topic.topic_label}.`
      : selected.modality === "interactive"
        ? probePlan.interactive_payload.prompt ??
          "Interact with the task, then explain what you learned."
        : probePlan.text_payload.input ?? `Explain ${topic.topic_label} in your own words.`;

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

function buildDeliveredResponse(
  topic: RouteTopic,
  decision: InterventionModeDecision,
  probePlan: ProbePlan
): DeliveredResponse {
  const reply =
    decision.mode_selected === "clarify"
      ? buildClarifyReply(
          topic.topic_label,
          decision.active_diagnosis ?? "representation_gap"
        )
      : buildProbeReply(
          topic.topic_label,
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

function buildEmbeddingSummary(args: {
  centroid?: EmbeddingVector | null;
  count?: number | null;
  model?: string | null;
  updatedAt?: string | null;
}) {
  const centroid = asEmbeddingVector(args.centroid ?? null);

  return {
    available: Boolean(centroid?.length),
    dimension: centroid?.length ?? 0,
    count: args.count ?? 0,
    model: args.model ?? null,
    updated_at: args.updatedAt ?? null,
    preview: centroid ? centroid.slice(0, 5) : [],
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
      topic_label: topic.topic_label,
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

      topic_label_embedding: buildEmbeddingSummary({
        centroid: topic.topic_label_embedding_centroid ?? null,
        count: topic.topic_label_embedding_count ?? 0,
        model: topic.topic_label_embedding_model ?? null,
        updatedAt: topic.topic_label_embedding_updated_at ?? null,
      }),

      topic_message_embedding: buildEmbeddingSummary({
        centroid: topic.topic_message_embedding_centroid ?? null,
        count: topic.topic_message_embedding_count ?? 0,
        model: topic.topic_message_embedding_model ?? null,
        updatedAt: topic.topic_message_embedding_updated_at ?? null,
      }),
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
    engine_version: "runtime-topic-labeler-provider-message-embedding-fast-path",
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
  const topKTopicLabels = matchVectorInfo.top_k_topic_labels.length
    ? matchVectorInfo.top_k_topic_labels
    : [topic.topic_label];

  return {
    ...matchVectorInfo,
    top_k_topic_labels: topKTopicLabels,
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

function buildCreatedTopicMessageEmbeddingPlan(args: {
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

function applyMessageEmbeddingUpdatePlanToTopics(
  topics: RouteTopic[],
  plan: RouteCentroidUpdatePlan | null
): RouteTopic[] {
  if (!plan || !plan.new_centroid) return topics;

  return topics.map((topic) => {
    if (topic.id !== plan.topic_id) return topic;

    return {
      ...topic,
      topic_message_embedding_centroid: plan.new_centroid,
      topic_message_embedding_count: plan.new_embedding_count,
      topic_message_embedding_model: plan.embedding_model,
      topic_message_embedding_updated_at: plan.updated_at,
      topic_json: {
        ...(topic.topic_json ?? {}),
        topic_message_embedding_centroid: plan.new_centroid,
        topic_message_embedding_count: plan.new_embedding_count,
        topic_message_embedding_model: plan.embedding_model,
        topic_message_embedding_updated_at: plan.updated_at,
      },
    };
  });
}

function getCanonicalEmbeddingPersistenceMetadata(topic: RouteTopic) {
  return {
    topicLabelEmbeddingCentroid:
      topic.topic_label_embedding_centroid ?? null,
    topicLabelEmbeddingCount:
      topic.topic_label_embedding_count ?? null,
    topicLabelEmbeddingModel:
      topic.topic_label_embedding_model ?? null,
    topicLabelEmbeddingUpdatedAt:
      topic.topic_label_embedding_updated_at ?? null,

    topicMessageEmbeddingCentroid:
      topic.topic_message_embedding_centroid ?? null,
    topicMessageEmbeddingCount:
      topic.topic_message_embedding_count ?? null,
    topicMessageEmbeddingModel:
      topic.topic_message_embedding_model ?? null,
    topicMessageEmbeddingUpdatedAt:
      topic.topic_message_embedding_updated_at ?? null,
  };
}

function normalizeTextLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function adaptLearningSpaceToContract(
  rawLearningSpace: RawLearningSpace,
  updatedTopics: RouteTopic[]
): LearningSpace {
  return {
    space_version: "v1",
    topics: (rawLearningSpace.topics ?? []).map((topic, index) => {
      const fallbackTopic = updatedTopics[index] ?? updatedTopics[0];
      const resolvedTopicLabel =
        topic.topic_label ??
        fallbackTopic?.topic_label ??
        "Untitled Topic";

      return {
        topic_id: topic.topic_id ?? fallbackTopic?.id ?? makeId("topic"),
        topic_label: resolvedTopicLabel,
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
      const resolvedClusterLabel = cluster.cluster_label ?? `Cluster ${index + 1}`;

      return {
        cluster_id: cluster.cluster_id ?? `cluster-${index}`,
        cluster_label: resolvedClusterLabel,
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



function adaptModelFirstTopicResolutionOutcome(
  outcome: ModelFirstTopicResolutionOutcome
): TopicResolutionOutcome {
  return buildResolvedOutcome({
    topic: outcome.topic,
    createdTopic: outcome.createdTopic,
    routeTopics: outcome.routeTopics,
    resolutionKind: outcome.resolutionKind,
    vectorInfo: outcome.vectorInfo,
    resolvedLabel: outcome.resolvedLabel,
    matchConfidence: outcome.matchConfidence,
    usedLLMFallback: false,
    resolutionTrace: outcome.resolutionTrace,
    semanticTopicRouting: outcome.semanticTopicRouting,
    centroidUpdatePlan: outcome.centroidUpdatePlan,
    topicLabelingMode: "topic_labeler_primary",
    llmFallbackAllowedByMode: false,
    llmFallbackRecommendedByPolicy: false,
    llmFallbackAttempted: false,
    deterministicTrustedWithoutLLM: false,
    deterministicCreateBlockedAsSuspicious: false,
    structurallyStrongResolvedLabel: false,
    narrowerThanActiveBroadTopic: false,
  });
}


function shouldUseModelContinuationPolicyInsteadOfDeterministic(
  policy: ModelRouteContinuationPolicy | null
) {
  if (!policy) return false;

  return (
    policy.kind === "invite_word_vomit" ||
    policy.kind === "choose_best_learning_target" ||
    policy.kind === "stay_active_after_model_failure" ||
    policy.kind === "ask_lightweight_retry" ||
    policy.kind === "no_learning_space_change"
  );
}

function buildRouteTopicForContinuationOnly(args: {
  existingTopics: RouteTopic[];
  fallbackLabel: string;
}): RouteTopic {
  return buildRouteTopicFromResolvedLabel({
    existingTopics: args.existingTopics,
    resolvedLabel: args.fallbackLabel,
  });
}

function buildContinuationPolicyTopicResolutionOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopic: RouteTopic | null;
  modelRouteContinuationPolicy: ModelRouteContinuationPolicy;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  semanticVectorInfo: VectorInfo;
}): TopicResolutionOutcome {
  const {
    existingTopics,
    activeTopic,
    modelRouteContinuationPolicy,
    modelPolicyDecision,
    semanticVectorInfo,
  } = args;

  const chosenTarget = modelRouteContinuationPolicy.chosen_target?.trim() || null;

  if (
    modelRouteContinuationPolicy.kind === "choose_best_learning_target" &&
    chosenTarget
  ) {
    const looseChosen = normalizeTextLoose(chosenTarget);
    const existingMatch =
      existingTopics.find(
        (topic) => normalizeTextLoose(topic.topic_label) === looseChosen
      ) ?? null;

    if (existingMatch) {
      return buildResolvedOutcome({
        topic: existingMatch,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind:
          activeTopic?.id === existingMatch.id
            ? "fallback_active_topic"
            : "matched_existing",
        vectorInfo: semanticVectorInfo,
        resolvedLabel: existingMatch.topic_label,
        matchConfidence: 0.62,
        usedLLMFallback: false,
        resolutionTrace: null,
        topicLabelingMode: "topic_labeler_primary",
        llmFallbackAllowedByMode: false,
        llmFallbackRecommendedByPolicy: false,
        llmFallbackAttempted: false,
      });
    }

    const createdTopic = buildRouteTopicFromResolvedLabel({
      existingTopics,
      resolvedLabel: chosenTarget,
    });

    return buildResolvedOutcome({
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: chosenTarget,
      matchConfidence: 0.62,
      usedLLMFallback: false,
      resolutionTrace: null,
      topicLabelingMode: "topic_labeler_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
    });
  }

  if (activeTopic) {
    return buildResolvedOutcome({
      topic: activeTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: activeTopic.topic_label,
      matchConfidence:
        modelRouteContinuationPolicy.kind === "stay_active_after_model_failure"
          ? 0.3
          : 0.22,
      usedLLMFallback: false,
      resolutionTrace: null,
      topicLabelingMode: "topic_labeler_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
    });
  }

  const fallbackTopic = buildRouteTopicForContinuationOnly({
    existingTopics,
    fallbackLabel:
      modelRouteContinuationPolicy.kind === "invite_word_vomit"
        ? "Orientation"
        : "Unresolved Topic Intent",
  });

  return buildResolvedOutcome({
    topic: fallbackTopic,
    createdTopic: null,
    routeTopics: existingTopics,
    resolutionKind: "no_match",
    vectorInfo: semanticVectorInfo,
    resolvedLabel: null,
    matchConfidence: 0,
    usedLLMFallback: false,
    resolutionTrace: null,
    topicLabelingMode: "topic_labeler_primary",
    llmFallbackAllowedByMode: false,
    llmFallbackRecommendedByPolicy: false,
    llmFallbackAttempted: false,
  });
}

function shouldPersistLearningSpaceForContinuation(
  policy: ModelRouteContinuationPolicy | null
) {
  return policy?.should_update_learning_space !== false;
}

function shouldOverrideLearnerMessageWithContinuationPolicy(
  policy: ModelRouteContinuationPolicy | null
) {
  if (!policy?.suggested_learner_message) return false;

  return (
    policy.kind === "invite_word_vomit" ||
    policy.kind === "choose_best_learning_target" ||
    policy.kind === "stay_active_after_model_failure" ||
    policy.kind === "ask_lightweight_retry"
  );
}


function buildSemanticEnrichmentStatusForContinuationPolicy(args: {
  policy: ModelRouteContinuationPolicy;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
}): SemanticEnrichmentStatus {
  const { policy, modelPolicyDecision } = args;
  const isModelFailure =
    !modelPolicyDecision ||
    modelPolicyDecision.decision_kind === "unusable_model_result";

  return {
    status: isModelFailure ? "blocked_model_failure" : "not_needed",
    needs_embedding_centroid: false,
    centroid_source: null,
    embedding_skip_reason: isModelFailure
      ? "model_failure_or_timeout"
      : "not_a_real_learning_topic",
    layout_status: policy.should_update_learning_space
      ? "temporary_position"
      : "no_learning_space_change",
    should_schedule_enrichment: false,
    enrichment_prompt_text: null,
  };
}

export async function POST(request: Request) {
  const timer = createMessageRouteTimer();

  let topicCountLoaded: number | null = null;

  let incomingActiveTopicId: string | null = null;
  let incomingActiveTopicFound: boolean | null = null;
  let incomingActiveTopicLabel: string | null = null;
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

  const topicLabelerEnabled = getTopicLabelerEnabled();
  const topicLabelerProvider = getTopicLabelerProvider();
  let topicLabelerResult: TopicLabelerClientResult | null = null;
  let modelTopicRoutePolicyDecision: ModelTopicRoutePolicyDecision | null = null;
  let modelTopicPolicyUsedAsAuthority = false;
  let topicAuthoritySource: string | null = null;
  let modelRouteContinuationPolicy: ModelRouteContinuationPolicy | null = null;
  let semanticEnrichmentStatus: SemanticEnrichmentStatus | null = null;

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
    incomingActiveTopicLabel = activeTopicFromRequest?.topic_label ?? null;

    timer.step("load_route_topics_from_supabase");

    if (topicLabelerEnabled) {
      const topicLabelerRequest = buildTopicLabelerRequest({
        message,
        activeTopicLabel: incomingActiveTopicLabel,
        currentTopicLabels: existingTopics.map((topic) => topic.topic_label),
        previousUserMessages: buildRecentUserMessagesForTopicLabeler(
          recentTurns
        ),
      });

      topicLabelerResult = await callConfiguredTopicLabeler(
        topicLabelerRequest,
        { timeoutMs: getTopicLabelerTimeoutMs() }
      );

      console.info("[topic-labeler active: model result]", {
        request: topicLabelerRequest,
        result: topicLabelerResult,
        note: "The configured topic labeler/model policy is now allowed to be authoritative for safe route decisions.",
      });
    }

    timer.step("topic_labeler_active");

    modelTopicRoutePolicyDecision = buildModelTopicRoutePolicyDecision({
      modelResult: topicLabelerResult,
      activeTopic: activeTopicFromRequest,
      existingTopics,
    });

    modelRouteContinuationPolicy = buildModelRouteContinuationPolicy({
      activeTopic: activeTopicFromRequest,
      modelPolicyDecision: modelTopicRoutePolicyDecision,
    });

    console.info("[topic-labeler policy decision]", {
      usable: modelTopicRoutePolicyDecision.usable,
      decision_kind: modelTopicRoutePolicyDecision.decision_kind,
      extracted_label: modelTopicRoutePolicyDecision.extracted_label,
      matched_topic_label: modelTopicRoutePolicyDecision.matched_topic_label,
      matched_topic_id: modelTopicRoutePolicyDecision.matched_topic_id,
      reasons: modelTopicRoutePolicyDecision.reasons,
      continuation_policy: modelRouteContinuationPolicy,
      note: "Policy may be authoritative for create_new, switch_existing, or stay_active. Clarify/no-topic now has an explicit continuation policy.",
    });

    timer.step("model_topic_policy_decision");

    let semanticVectorInfo: VectorInfo = emptyVectorInfo();
    let messageEmbedding: EmbeddingVector | null = null;
    let embeddingModel: string | null = null;

    const messageEmbeddingSkipReason = getMessageEmbeddingSkipReason({
      decision: modelTopicRoutePolicyDecision,
      continuationPolicy: modelRouteContinuationPolicy,
      topicLabelerEnabled,
    });
    const skipMessageEmbeddingForModelPolicy = messageEmbeddingSkipReason !== null;

    if (skipMessageEmbeddingForModelPolicy) {
      messageEmbedding = null;
      embeddingModel = null;
      finalMessageEmbeddingAvailable = false;
      finalEmbeddingModel = null;

      console.info("[message embedding skipped]", {
        reason: messageEmbeddingSkipReason,
        decision_kind: modelTopicRoutePolicyDecision?.decision_kind ?? null,
        extracted_label: modelTopicRoutePolicyDecision?.extracted_label ?? null,
        continuation_policy_kind: modelRouteContinuationPolicy?.kind ?? null,
      });
    } else {
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

    const modelFirstTopicResolution = buildModelFirstTopicResolutionOutcome({
      existingTopics,
      activeTopic: activeTopicFromRequest,
      modelPolicyDecision: modelTopicRoutePolicyDecision,
      semanticVectorInfo,
      messageEmbedding,
      embeddingModel,
      initialMessage: message,
      embeddingSkippedForFastRoute: skipMessageEmbeddingForModelPolicy,
    });

    const modelAuthoritativeTopicResolution = modelFirstTopicResolution
      ? adaptModelFirstTopicResolutionOutcome(modelFirstTopicResolution)
      : null;

    if (modelFirstTopicResolution) {
      modelRouteContinuationPolicy =
        modelFirstTopicResolution.modelRouteContinuationPolicy;
      semanticEnrichmentStatus = modelFirstTopicResolution.semanticEnrichmentStatus;
    }

    let topicResolution: TopicResolutionOutcome;

    const shouldUseContinuationPolicyInsteadOfDeterministic =
      !modelAuthoritativeTopicResolution &&
      shouldUseModelContinuationPolicyInsteadOfDeterministic(
        modelRouteContinuationPolicy
      );

    if (modelAuthoritativeTopicResolution) {
      topicResolution = modelAuthoritativeTopicResolution;
      modelTopicPolicyUsedAsAuthority = true;
      topicAuthoritySource = "topic_labeler_policy";
    } else if (
      shouldUseContinuationPolicyInsteadOfDeterministic &&
      modelRouteContinuationPolicy
    ) {
      topicResolution = buildContinuationPolicyTopicResolutionOutcome({
        existingTopics,
        activeTopic: activeTopicFromRequest,
        modelRouteContinuationPolicy,
        modelPolicyDecision: modelTopicRoutePolicyDecision,
        semanticVectorInfo,
      });
      semanticEnrichmentStatus =
        buildSemanticEnrichmentStatusForContinuationPolicy({
          policy: modelRouteContinuationPolicy,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });
      modelTopicPolicyUsedAsAuthority = false;
      topicAuthoritySource = "topic_labeler_continuation_policy";
    } else {
      const modelSafeFallbackPolicy =
        modelRouteContinuationPolicy ??
        buildModelRouteContinuationPolicy({
          activeTopic: activeTopicFromRequest,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });

      topicResolution = buildContinuationPolicyTopicResolutionOutcome({
        existingTopics,
        activeTopic: activeTopicFromRequest,
        modelRouteContinuationPolicy: modelSafeFallbackPolicy,
        modelPolicyDecision: modelTopicRoutePolicyDecision,
        semanticVectorInfo,
      });

      semanticEnrichmentStatus =
        buildSemanticEnrichmentStatusForContinuationPolicy({
          policy: modelSafeFallbackPolicy,
          modelPolicyDecision: modelTopicRoutePolicyDecision,
        });

      modelRouteContinuationPolicy = modelSafeFallbackPolicy;
      modelTopicPolicyUsedAsAuthority = false;
      topicAuthoritySource = "topic_labeler_safe_fallback_no_legacy_deterministic";
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

    if (topicLabelerEnabled) {
      console.info("[topic-labeler active: route authority decision]", {
        actual_authoritative_result: {
          authority_source: topicAuthoritySource,
          model_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
          resolution_kind: resolutionKind,
          resolved_label: resolvedLabel,
          target_topic_id: topic.id,
          target_topic_label: topic.topic_label,
          created_topic_label: createdTopic?.topic_label ?? null,
          match_confidence: matchConfidence,
          used_llm_topic_fallback: usedLLMFallback,
          model_route_continuation_policy: modelRouteContinuationPolicy,
          semantic_enrichment_status: semanticEnrichmentStatus,
        },
        topic_labeler_result: topicLabelerResult,
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
      buildCreatedTopicMessageEmbeddingPlan({
        createdTopic,
        messageEmbedding,
        embeddingModel,
      });

    const metricUpdatedTopics = routeTopics.map((routeTopic) =>
      routeTopic.id === targetTopicId
        ? applyMetricUpdate(routeTopic, updatedTopicMetrics)
        : routeTopic
    );

    const updatedTopics = applyMessageEmbeddingUpdatePlanToTopics(
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
          selected_topic_label: updatedResolvedTopic.topic_label,
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

    let deliveredResponse = buildDeliveredResponse(
      updatedResolvedTopic,
      decision,
      probePlan
    );

    if (
      shouldOverrideLearnerMessageWithContinuationPolicy(
        modelRouteContinuationPolicy
      ) &&
      modelRouteContinuationPolicy?.suggested_learner_message
    ) {
      deliveredResponse = {
        ...deliveredResponse,
        learner_message: {
          text: modelRouteContinuationPolicy.suggested_learner_message,
          tone: "encouraging",
          mode: "clarify",
        },
        delivered_probe: null,
      };
    }

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
        topic_label: updatedResolvedTopic.topic_label,
        next_step:
          probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
        inferred_keywords: inferKeywordsFromTopicLabel(
          resolvedLabel ?? updatedResolvedTopic.topic_label
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
        topic_labeler_active: topicLabelerResult,
        model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
        model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
        topic_authority_source: topicAuthoritySource,
        model_route_continuation_policy: modelRouteContinuationPolicy,
        semantic_enrichment_status: semanticEnrichmentStatus,
        needs_embedding_centroid:
          semanticEnrichmentStatus?.needs_embedding_centroid ?? false,
        embedding_skip_reason:
          semanticEnrichmentStatus?.embedding_skip_reason ?? null,
        layout_status: semanticEnrichmentStatus?.layout_status ?? null,
        should_schedule_enrichment:
          semanticEnrichmentStatus?.should_schedule_enrichment ?? false,
        semantic_enrichment_prompt_text:
          semanticEnrichmentStatus?.enrichment_prompt_text ?? null,
        message_embedding_update_plan: finalCentroidUpdatePlan,

        topic_label_embedding_centroid:
          updatedResolvedTopic.topic_label_embedding_centroid ?? null,
        topic_label_embedding_count:
          updatedResolvedTopic.topic_label_embedding_count ?? 0,
        topic_label_embedding_model:
          updatedResolvedTopic.topic_label_embedding_model ?? null,
        topic_label_embedding_updated_at:
          updatedResolvedTopic.topic_label_embedding_updated_at ?? null,

        topic_message_embedding_centroid:
          updatedResolvedTopic.topic_message_embedding_centroid ?? null,
        topic_message_embedding_count:
          updatedResolvedTopic.topic_message_embedding_count ?? 0,
        topic_message_embedding_model:
          updatedResolvedTopic.topic_message_embedding_model ?? null,
        topic_message_embedding_updated_at:
          updatedResolvedTopic.topic_message_embedding_updated_at ?? null,

      })
    );

    const sceneUpdate = buildSceneUpdate(
      targetTopicId,
      learningSpace,
      resolutionKind
    );

    const suggestedAction = buildSuggestedAction(
      updatedResolvedTopic.topic_label,
      probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
      decision.mode_selected
    );

    const statusLabel = buildStatusLabel(
      resolutionKind,
      decision.mode_selected
    );

    timer.step("serialize_result_topic_json_and_scene_update");

    const shouldPersistLearningSpace = shouldPersistLearningSpaceForContinuation(
      modelRouteContinuationPolicy
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

    timer.step("insert_run_supabase");

    if (shouldPersistLearningSpace) {
      await upsertTopicState({
        topicId: updatedResolvedTopic.id,
        lastRunId: runId,
        topicLabel: updatedResolvedTopic.topic_label,
        confusion: updatedTopicMetrics.confusion ?? null,
        insight: updatedTopicMetrics.insight ?? null,
        learningScore:
          updatedTopics.find((t) => t.id === updatedResolvedTopic.id)?.learningScore ??
          null,
        diagnosis: decision.active_diagnosis,
        nextStep:
          probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
        topicJson,
        ...getCanonicalEmbeddingPersistenceMetadata(updatedResolvedTopic),
      });
    } else {
      console.info("[topic_state persistence skipped]", {
        reason: "model_route_continuation_policy_no_learning_space_update",
        continuation_policy_kind: modelRouteContinuationPolicy?.kind ?? null,
        learner_message_intent:
          modelRouteContinuationPolicy?.learner_message_intent ?? null,
        target_topic_id: updatedResolvedTopic.id,
        target_topic_label: updatedResolvedTopic.topic_label,
      });
    }

    timer.step("upsert_topic_state_supabase");

    const syncQdrantOnMessageRoute = shouldSyncQdrantOnMessageRoute();

    if (
      shouldPersistLearningSpace &&
      syncQdrantOnMessageRoute &&
      canSyncTopicToQdrant()
    ) {
      qdrantSyncAttempted = true;

      const syncResult = await syncTopicToQdrantBestEffort({
        topicId: updatedResolvedTopic.id,
        topicLabel: updatedResolvedTopic.topic_label,
        diagnosis: decision.active_diagnosis,
        nextStep:
          probePlan.text_plan.instructional_goal ?? updatedResolvedTopic.nextStep,
        updatedAt: nowIso(),
        topicJson,
        ...getCanonicalEmbeddingPersistenceMetadata(updatedResolvedTopic),
      });

      qdrantSyncSucceeded = syncResult.ok;
      qdrantSyncError = syncResult.error;
      qdrantSyncDurationMs = syncResult.duration_ms;
    } else {
      qdrantSyncSucceeded = null;
      qdrantSyncDurationMs = null;

      if (!shouldPersistLearningSpace) {
        qdrantSyncError = "skipped_no_learning_space_update";
      } else if (!syncQdrantOnMessageRoute) {
        qdrantSyncError = "qdrant_sync_on_message_route_disabled";

        console.info("[qdrant sync skipped on message route]", {
          reason: qdrantSyncError,
          topic_id: updatedResolvedTopic.id,
          topic_label: updatedResolvedTopic.topic_label,
          note: "Semantic enrichment runner remains responsible for topic_label_embedding/Qdrant sync.",
        });
      } else {
        qdrantSyncError = "missing_qdrant_config";
      }
    }

    timer.step("sync_topic_to_qdrant_best_effort");

    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_label: incomingActiveTopicLabel,
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

      topic_labeler_provider: getTopicLabelerSummary(topicLabelerResult).provider ?? topicLabelerProvider,
      topic_labeler_enabled: topicLabelerEnabled,
      topic_labeler_attempted:
        getTopicLabelerSummary(topicLabelerResult).attempted,
      topic_labeler_succeeded:
        getTopicLabelerSummary(topicLabelerResult).succeeded,
      topic_labeler_error:
        getTopicLabelerSummary(topicLabelerResult).error,
      topic_labeler_latency_ms:
        getTopicLabelerSummary(topicLabelerResult).latency_ms,
      topic_labeler_route_decision:
        getTopicLabelerSummary(topicLabelerResult)
          .route_decision,
      topic_labeler_extracted_label:
        getTopicLabelerSummary(topicLabelerResult)
          .extracted_label,
      topic_labeler_matched_topic_label:
        getTopicLabelerSummary(topicLabelerResult)
          .matched_topic_label,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_label:
        modelTopicRoutePolicyDecision?.matched_topic_label ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,

      model_route_continuation_policy_kind:
        modelRouteContinuationPolicy?.kind ?? null,
      model_route_learner_message_intent:
        modelRouteContinuationPolicy?.learner_message_intent ?? null,
      model_route_should_create_learning_topic:
        modelRouteContinuationPolicy?.should_create_learning_topic ?? null,
      model_route_should_update_learning_space:
        modelRouteContinuationPolicy?.should_update_learning_space ?? null,
      model_route_should_treat_as_learning_evidence:
        modelRouteContinuationPolicy?.should_treat_as_learning_evidence ?? null,
      model_route_should_myway_choose_target:
        modelRouteContinuationPolicy?.should_myway_choose_target ?? null,
      model_route_should_ask_user_to_choose:
        modelRouteContinuationPolicy?.should_ask_user_to_choose ?? null,

      semantic_enrichment_status: semanticEnrichmentStatus?.status ?? null,
      needs_embedding_centroid:
        semanticEnrichmentStatus?.needs_embedding_centroid ?? null,
      embedding_skip_reason:
        semanticEnrichmentStatus?.embedding_skip_reason ?? null,
      layout_status: semanticEnrichmentStatus?.layout_status ?? null,
      should_schedule_enrichment:
        semanticEnrichmentStatus?.should_schedule_enrichment ?? null,
    });

    console.info("[POST /api/message timing]", latencyDebug);

    const response: MessageRouteResponse & {
      topic_resolution_debug: TopicResolutionDebug;
      topic_resolution_trace: TopicResolutionTrace | null;
      topic_routing: TopicRoutingState | null;
      topic_labeler_active: TopicLabelerClientResult | null;
      model_topic_route_policy_decision: ModelTopicRoutePolicyDecision | null;
      model_topic_policy_used_as_authority: boolean;
      topic_authority_source: string | null;
      model_route_continuation_policy: ModelRouteContinuationPolicy | null;
      semantic_enrichment_status: SemanticEnrichmentStatus | null;
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
      topic_labeler_active: topicLabelerResult,
      model_topic_route_policy_decision: modelTopicRoutePolicyDecision,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,
      model_route_continuation_policy: modelRouteContinuationPolicy,
      semantic_enrichment_status: semanticEnrichmentStatus,
      latency_debug: latencyDebug,
    };

    return NextResponse.json(response);
  } catch (error) {
    const latencyDebug = timer.finish({
      route: "POST /api/message",
      topic_count_loaded: topicCountLoaded,

      incoming_active_topic_id: incomingActiveTopicId,
      incoming_active_topic_found: incomingActiveTopicFound,
      incoming_active_topic_label: incomingActiveTopicLabel,
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

      topic_labeler_provider: getTopicLabelerSummary(topicLabelerResult).provider ?? topicLabelerProvider,
      topic_labeler_enabled: topicLabelerEnabled,
      topic_labeler_attempted:
        getTopicLabelerSummary(topicLabelerResult).attempted,
      topic_labeler_succeeded:
        getTopicLabelerSummary(topicLabelerResult).succeeded,
      topic_labeler_error:
        getTopicLabelerSummary(topicLabelerResult).error,
      topic_labeler_latency_ms:
        getTopicLabelerSummary(topicLabelerResult).latency_ms,
      topic_labeler_route_decision:
        getTopicLabelerSummary(topicLabelerResult)
          .route_decision,
      topic_labeler_extracted_label:
        getTopicLabelerSummary(topicLabelerResult)
          .extracted_label,
      topic_labeler_matched_topic_label:
        getTopicLabelerSummary(topicLabelerResult)
          .matched_topic_label,

      model_topic_policy_usable: modelTopicRoutePolicyDecision?.usable ?? null,
      model_topic_policy_decision_kind:
        modelTopicRoutePolicyDecision?.decision_kind ?? null,
      model_topic_policy_extracted_label:
        modelTopicRoutePolicyDecision?.extracted_label ?? null,
      model_topic_policy_matched_topic_label:
        modelTopicRoutePolicyDecision?.matched_topic_label ?? null,
      model_topic_policy_reasons:
        modelTopicRoutePolicyDecision?.reasons ?? null,
      model_topic_policy_used_as_authority: modelTopicPolicyUsedAsAuthority,
      topic_authority_source: topicAuthoritySource,

      model_route_continuation_policy_kind:
        modelRouteContinuationPolicy?.kind ?? null,
      model_route_learner_message_intent:
        modelRouteContinuationPolicy?.learner_message_intent ?? null,
      model_route_should_create_learning_topic:
        modelRouteContinuationPolicy?.should_create_learning_topic ?? null,
      model_route_should_update_learning_space:
        modelRouteContinuationPolicy?.should_update_learning_space ?? null,
      model_route_should_treat_as_learning_evidence:
        modelRouteContinuationPolicy?.should_treat_as_learning_evidence ?? null,
      model_route_should_myway_choose_target:
        modelRouteContinuationPolicy?.should_myway_choose_target ?? null,
      model_route_should_ask_user_to_choose:
        modelRouteContinuationPolicy?.should_ask_user_to_choose ?? null,

      semantic_enrichment_status: semanticEnrichmentStatus?.status ?? null,
      needs_embedding_centroid:
        semanticEnrichmentStatus?.needs_embedding_centroid ?? null,
      embedding_skip_reason:
        semanticEnrichmentStatus?.embedding_skip_reason ?? null,
      layout_status: semanticEnrichmentStatus?.layout_status ?? null,
      should_schedule_enrichment:
        semanticEnrichmentStatus?.should_schedule_enrichment ?? null,
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
