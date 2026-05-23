import { makeId } from "@/lib/utils/ids";
import type {
  ImportantRunInputs,
  ModelSignals,
  VectorInfo,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import { nowIso } from "@/lib/runtime/shared";
import {
  scoreConfusionInsight,
  type ConfusionInsightEvent,
  type ConfusionInsightInputType,
  type ConfusionInsightPreviousMode,
  type ConfusionInsightStructuredInput,
  type ConfusionInsightTopicTransitionType,
} from "@/lib/runtime/score-confusion-insight";

export type RouteResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

export type ConfusionInsightScoringMode = "foreground" | "worker";

export type PendingConfusionInsightScore = {
  score_id: string;
  run_id: string | null;
  text: string;
  chat_history: string[];
  structured_input: ConfusionInsightStructuredInput;
  payload_shape: "structured_v1_1";
  created_at: string;
  source: "message_route";
  routing: {
    target_topic_id: string;
    target_topic_label: string;
    resolution_kind: RouteResolutionKind;
    resolved_label: string | null;
    match_confidence: number;
    authority_source: string | null;
  };
};

const FOREGROUND_CONFUSION_INSIGHT_EXISTING_TOPIC_ALPHA = 0.35;
export const PENDING_WORKER_QUEUE_MAX_ITEMS = 50;
export const CONFUSION_INSIGHT_PAYLOAD_SHAPE = "structured_v1_1" as const;
export const CONFUSION_INSIGHT_WORKER_QUEUE_ROLE =
  "worker_default_structured_v1_1";
const DEFAULT_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 2_000;
const MIN_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 250;
const MAX_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS = 10_000;

type PersistedConfusionInsightSource =
  | "foreground_model_new_topic"
  | "foreground_model_blended_existing_topic"
  | "fallback_metric_update";

type UpdatedTopicMetricsLike = {
  confusion?: number | null;
  insight?: number | null;
};

function asNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function getForegroundConfusionInsightTimeoutMs() {
  const raw = process.env.MYWAY_CONFUSION_INSIGHT_FOREGROUND_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : null;

  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(parsed, MIN_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS),
    MAX_FOREGROUND_CONFUSION_INSIGHT_TIMEOUT_MS,
  );
}

export function getConfusionInsightScoringMode(): ConfusionInsightScoringMode {
  const raw =
    process.env.MYWAY_CONFUSION_INSIGHT_SCORING_MODE?.trim().toLowerCase();

  if (raw === "foreground") return "foreground";

  /**
   * Default to worker mode for local-dev stability.
   * The v1_1 model is lightweight, but running it alongside Next dev,
   * topic-labeler, embedding service, and the semantic worker can still
   * overload a CPU-only laptop.
   */
  return "worker";
}

export function buildFallbackModelSignals(errorMessage?: string): ModelSignals {
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

export function hasUsableConfusionInsightSignals(modelSignals: ModelSignals) {
  return (
    modelSignals.status === "ok" &&
    typeof modelSignals.model_confusion === "number" &&
    Number.isFinite(modelSignals.model_confusion) &&
    typeof modelSignals.model_insight === "number" &&
    Number.isFinite(modelSignals.model_insight)
  );
}

function blendConfusionInsightSignal(args: {
  previous: number | null;
  signal: number;
  alpha: number;
}) {
  const signal = Math.max(0, Math.min(1, args.signal));

  if (typeof args.previous !== "number" || !Number.isFinite(args.previous)) {
    return signal;
  }

  const previous = Math.max(0, Math.min(1, args.previous));
  const alpha = Math.max(0, Math.min(1, args.alpha));

  return previous * (1 - alpha) + signal * alpha;
}

export function derivePersistedConfusionInsightValues(args: {
  topic: RouteTopic;
  updatedTopicMetrics: UpdatedTopicMetricsLike;
  modelSignals: ModelSignals;
  createdTopic: boolean;
}) {
  const fallbackConfusion = asNullableFiniteNumber(
    args.updatedTopicMetrics.confusion,
  );
  const fallbackInsight = asNullableFiniteNumber(
    args.updatedTopicMetrics.insight,
  );

  if (!hasUsableConfusionInsightSignals(args.modelSignals)) {
    return {
      confusion: fallbackConfusion,
      insight: fallbackInsight,
      source: "fallback_metric_update" as PersistedConfusionInsightSource,
      model_confusion_used: null,
      model_insight_used: null,
      blend_alpha: null,
    };
  }

  const rawModelConfusion = args.modelSignals.model_confusion;
  const rawModelInsight = args.modelSignals.model_insight;

  if (
    typeof rawModelConfusion !== "number" ||
    !Number.isFinite(rawModelConfusion) ||
    typeof rawModelInsight !== "number" ||
    !Number.isFinite(rawModelInsight)
  ) {
    return {
      confusion: fallbackConfusion,
      insight: fallbackInsight,
      source: "fallback_metric_update" as PersistedConfusionInsightSource,
      model_confusion_used: null,
      model_insight_used: null,
      blend_alpha: null,
    };
  }

  const modelConfusion = Math.max(0, Math.min(1, rawModelConfusion));
  const modelInsight = Math.max(0, Math.min(1, rawModelInsight));

  if (args.createdTopic) {
    return {
      confusion: modelConfusion,
      insight: modelInsight,
      source: "foreground_model_new_topic" as PersistedConfusionInsightSource,
      model_confusion_used: modelConfusion,
      model_insight_used: modelInsight,
      blend_alpha: 1,
    };
  }

  const previousConfusion = asNullableFiniteNumber(args.topic.confusion);
  const previousInsight = asNullableFiniteNumber(args.topic.insight);

  return {
    confusion: blendConfusionInsightSignal({
      previous: previousConfusion,
      signal: modelConfusion,
      alpha: FOREGROUND_CONFUSION_INSIGHT_EXISTING_TOPIC_ALPHA,
    }),
    insight: blendConfusionInsightSignal({
      previous: previousInsight,
      signal: modelInsight,
      alpha: FOREGROUND_CONFUSION_INSIGHT_EXISTING_TOPIC_ALPHA,
    }),
    source:
      "foreground_model_blended_existing_topic" as PersistedConfusionInsightSource,
    model_confusion_used: modelConfusion,
    model_insight_used: modelInsight,
    blend_alpha: FOREGROUND_CONFUSION_INSIGHT_EXISTING_TOPIC_ALPHA,
  };
}

function deriveConfusionInsightInputType(args: {
  currentInteractionContext: ImportantRunInputs["current_interaction_context"];
  clarifySeeking: boolean;
}): ConfusionInsightInputType {
  if (
    args.currentInteractionContext.run_kind === "clarify_followup" ||
    args.currentInteractionContext.prior_mode_selected === "clarify" ||
    args.clarifySeeking
  ) {
    return "clarify_response";
  }

  return "message";
}

function deriveConfusionInsightPreviousMode(
  currentInteractionContext: ImportantRunInputs["current_interaction_context"],
): ConfusionInsightPreviousMode {
  if (currentInteractionContext.prior_mode_selected === "clarify") {
    return "clarify";
  }

  if (currentInteractionContext.prior_mode_selected === "probe") {
    return "probe";
  }

  return "no_previous";
}

function deriveConfusionInsightTopicTransitionType(args: {
  resolutionKind: RouteResolutionKind;
  matchConfidence: number;
  createdTopic: boolean;
}): ConfusionInsightTopicTransitionType {
  if (args.createdTopic || args.resolutionKind === "created_new_candidate") {
    return "new_topic";
  }

  if (
    args.resolutionKind === "fallback_active_topic" ||
    args.resolutionKind === "matched_existing" ||
    args.matchConfidence >= 0.72
  ) {
    return "same_topic";
  }

  if (args.matchConfidence >= 0.42) {
    return "nearby_topic";
  }

  return "far_topic";
}

function buildTargetTopicRecentEventsForConfusionInsight(args: {
  topic: RouteTopic;
  currentInteractionContext: ImportantRunInputs["current_interaction_context"];
  clarifySeeking: boolean;
}): ConfusionInsightEvent[] {
  const priorMode = args.currentInteractionContext.prior_mode_selected;

  if (!args.clarifySeeking && priorMode !== "clarify") {
    return [];
  }

  return [
    {
      event_type: "clarify",
      topic_label: args.topic.topic_label,
      diagnosis_label: args.topic.diagnosis ?? null,
      clarification_goal: `Interpret the learner's latest expression and decide whether ${args.topic.topic_label} needs clarification or measurement.`,
      evidence: null,
    },
  ];
}

export function buildConfusionInsightInput(args: {
  message: string;
  activeTopic: RouteTopic | null;
  targetTopic: RouteTopic;
  vectorInfo: VectorInfo;
  resolutionKind: RouteResolutionKind;
  matchConfidence: number;
  createdTopic: boolean;
  currentInteractionContext: ImportantRunInputs["current_interaction_context"];
  clarifySeeking: boolean;
}): ConfusionInsightStructuredInput {
  const topLabels = args.vectorInfo.top_k_topic_labels;
  const topScores = args.vectorInfo.top_k_similarity_scores;
  const targetTopicLabel = args.targetTopic.topic_label;

  const relatedIndex = topLabels.findIndex(
    (label) => label && label !== targetTopicLabel,
  );

  const mostRelatedTopicLabel =
    relatedIndex >= 0 ? (topLabels[relatedIndex] ?? null) : null;

  const mostRelatedTopicSimilarity =
    relatedIndex >= 0 ? asNullableFiniteNumber(topScores[relatedIndex]) : null;

  return {
    input_type: deriveConfusionInsightInputType({
      currentInteractionContext: args.currentInteractionContext,
      clarifySeeking: args.clarifySeeking,
    }),
    current_attempt_type: null,
    current_evidence: `Learner wrote: ${args.message}`,

    previous_active_topic_label: args.activeTopic?.topic_label ?? null,
    target_topic_label: targetTopicLabel,
    topic_transition_type: deriveConfusionInsightTopicTransitionType({
      resolutionKind: args.resolutionKind,
      matchConfidence: args.matchConfidence,
      createdTopic: args.createdTopic,
    }),
    topic_similarity: asNullableFiniteNumber(args.matchConfidence),

    previous_mode: deriveConfusionInsightPreviousMode(
      args.currentInteractionContext,
    ),
    is_response_to_clarify:
      args.currentInteractionContext.prior_mode_selected === "clarify",
    is_response_to_probe:
      args.currentInteractionContext.is_response_to_delivered_probe === true ||
      args.currentInteractionContext.prior_mode_selected === "probe",

    target_topic_recent_events: buildTargetTopicRecentEventsForConfusionInsight(
      {
        topic: args.targetTopic,
        currentInteractionContext: args.currentInteractionContext,
        clarifySeeking: args.clarifySeeking,
      },
    ),

    most_related_topic_label: mostRelatedTopicLabel,
    most_related_topic_similarity: mostRelatedTopicSimilarity,
    most_related_topic_similarity_threshold: 0.65,
    most_related_topic_recent_events: [],

    target_topic_confusion_average: asNullableFiniteNumber(
      args.targetTopic.confusion,
    ),
    target_topic_insight_average: asNullableFiniteNumber(
      args.targetTopic.insight,
    ),

    most_related_topic_confusion_average: null,
    most_related_topic_insight_average: null,
  };
}

export async function resolveConfusionInsightSignalsForMessageRoute(args: {
  scoringMode: ConfusionInsightScoringMode;
  input: ConfusionInsightStructuredInput;
  targetTopicId: string;
  targetTopicLabel: string;
  resolutionKind: RouteResolutionKind;
}) {
  if (args.scoringMode === "foreground") {
    const modelSignals = await scoreConfusionInsight({
      input: args.input,
      timeoutMs: getForegroundConfusionInsightTimeoutMs(),
    });

    console.info("[confusion-insight foreground scoring]", {
      target_topic_id: args.targetTopicId,
      target_topic_label: args.targetTopicLabel,
      resolution_kind: args.resolutionKind,
      status: modelSignals.status,
      model_confusion: modelSignals.model_confusion,
      model_insight: modelSignals.model_insight,
      model_version: modelSignals.model_version,
      latency_ms: modelSignals.latency_ms,
      error_message: modelSignals.error_message,
    });

    return {
      modelSignals,
      timerStep: "score_confusion_insight_foreground",
    };
  }

  const modelSignals: ModelSignals = {
    ...buildFallbackModelSignals(),
    error_message:
      "Confusion/insight scoring is queued for the worker; /api/message stays responsive and does not require the model service in worker mode.",
  };

  console.info("[confusion-insight queued for worker mode]", {
    target_topic_id: args.targetTopicId,
    target_topic_label: args.targetTopicLabel,
    resolution_kind: args.resolutionKind,
    scoring_mode: args.scoringMode,
    payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
  });

  return {
    modelSignals,
    timerStep: "queue_confusion_insight_for_worker",
  };
}

function getConfusionInsightSignalCount(topicJson: unknown) {
  const record = asRecord(topicJson);
  const value = record.confusion_insight_signal_count;

  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function buildForegroundConfusionInsightSignalState(args: {
  topicJson: unknown;
  modelSignals: ModelSignals;
  persisted: ReturnType<typeof derivePersistedConfusionInsightValues>;
}) {
  if (!hasUsableConfusionInsightSignals(args.modelSignals)) {
    return asRecord(args.topicJson).confusion_insight_signal_state ?? null;
  }

  const signalCountBefore = getConfusionInsightSignalCount(args.topicJson);
  const signalCountAfter = signalCountBefore + 1;
  const processedAt = nowIso();

  return {
    status: "has_model_signal",
    signal_count: signalCountAfter,
    last_processed_at: processedAt,
    last_model_version: args.modelSignals.model_version,
    last_model_confusion: args.modelSignals.model_confusion,
    last_model_insight: args.modelSignals.model_insight,
    last_next_confusion: args.persisted.confusion,
    last_next_insight: args.persisted.insight,
    last_persistence_source: args.persisted.source,
  };
}

function isRouteResolutionKind(value: unknown): value is RouteResolutionKind {
  return (
    value === "matched_existing" ||
    value === "created_new_candidate" ||
    value === "fallback_active_topic" ||
    value === "fallback_existing_topic" ||
    value === "no_match"
  );
}

export function getPendingConfusionInsightScores(
  topicJson: unknown,
): PendingConfusionInsightScore[] {
  const base = asRecord(topicJson);
  const rawQueue = base.pending_confusion_insight_scores;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingConfusionInsightScore | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const routing = asRecord(candidate.routing);

      const scoreId =
        typeof candidate.score_id === "string" && candidate.score_id.trim()
          ? candidate.score_id.trim()
          : null;
      const structuredInput =
        candidate.structured_input &&
        typeof candidate.structured_input === "object" &&
        !Array.isArray(candidate.structured_input)
          ? (candidate.structured_input as ConfusionInsightStructuredInput)
          : null;

      const text =
        typeof candidate.text === "string" && candidate.text.trim()
          ? candidate.text.trim()
          : structuredInput?.current_evidence?.trim() ?? null;
      const createdAt =
        typeof candidate.created_at === "string" && candidate.created_at.trim()
          ? candidate.created_at.trim()
          : null;
      const targetTopicId =
        typeof routing.target_topic_id === "string" &&
        routing.target_topic_id.trim()
          ? routing.target_topic_id.trim()
          : null;
      const targetTopicLabel =
        typeof routing.target_topic_label === "string" &&
        routing.target_topic_label.trim()
          ? routing.target_topic_label.trim()
          : null;

      if (
        !scoreId ||
        !text ||
        !createdAt ||
        !structuredInput ||
        !targetTopicId ||
        !targetTopicLabel
      ) {
        return null;
      }

      const rawChatHistory = candidate.chat_history;
      const chatHistory = Array.isArray(rawChatHistory)
        ? rawChatHistory
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
            .slice(-8)
        : [];

      return {
        score_id: scoreId,
        run_id:
          typeof candidate.run_id === "string" && candidate.run_id.trim()
            ? candidate.run_id.trim()
            : null,
        text,
        chat_history: chatHistory,
        structured_input: structuredInput,
        payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
        created_at: createdAt,
        source: "message_route",
        routing: {
          target_topic_id: targetTopicId,
          target_topic_label: targetTopicLabel,
          resolution_kind: isRouteResolutionKind(routing.resolution_kind)
            ? routing.resolution_kind
            : "fallback_existing_topic",
          resolved_label:
            typeof routing.resolved_label === "string" &&
            routing.resolved_label.trim()
              ? routing.resolved_label.trim()
              : null,
          match_confidence:
            typeof routing.match_confidence === "number" &&
            Number.isFinite(routing.match_confidence)
              ? routing.match_confidence
              : 0,
          authority_source:
            typeof routing.authority_source === "string" &&
            routing.authority_source.trim()
              ? routing.authority_source.trim()
              : null,
        },
      };
    })
    .filter((item): item is PendingConfusionInsightScore => Boolean(item));
}

export function buildPendingConfusionInsightScore(args: {
  message: string;
  chatHistory: string[];
  structuredInput: ConfusionInsightStructuredInput;
  runId: string;
  targetTopicId: string;
  targetTopicLabel: string;
  resolutionKind: RouteResolutionKind;
  resolvedLabel: string | null;
  matchConfidence: number;
  authoritySource: string | null;
}): PendingConfusionInsightScore {
  return {
    score_id: makeId("ciscore"),
    run_id: args.runId,
    text: args.message,
    chat_history: args.chatHistory.slice(-8),
    structured_input: args.structuredInput,
    payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
    created_at: nowIso(),
    source: "message_route",
    routing: {
      target_topic_id: args.targetTopicId,
      target_topic_label: args.targetTopicLabel,
      resolution_kind: args.resolutionKind,
      resolved_label: args.resolvedLabel,
      match_confidence: args.matchConfidence,
      authority_source: args.authoritySource,
    },
  };
}

export function buildConfusionInsightQueueReason(args: {
  scoringMode: ConfusionInsightScoringMode;
  modelSignals: ModelSignals;
}) {
  if (args.scoringMode === "worker") {
    return "worker_mode_selected";
  }

  if (args.modelSignals.status !== "ok") {
    return "foreground_scoring_failed_or_unavailable";
  }

  return null;
}

export function appendPendingConfusionInsightScore(args: {
  topicJson: Record<string, unknown>;
  pendingItem: PendingConfusionInsightScore;
}) {
  const existingQueue = getPendingConfusionInsightScores(args.topicJson);
  const nextQueue = [...existingQueue, args.pendingItem].slice(
    -PENDING_WORKER_QUEUE_MAX_ITEMS,
  );

  return {
    ...args.topicJson,
    pending_confusion_insight_scores: nextQueue,
    confusion_insight_pending_count: nextQueue.length,
    confusion_insight_queue_status: "pending",
    confusion_insight_queue_role: CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
    confusion_insight_normal_payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
    confusion_insight_status: {
      ...asRecord(args.topicJson.confusion_insight_status),
      status: "pending",
      pending_count: nextQueue.length,
      queued_at: args.pendingItem.created_at,
      source: "message_route",
      payload_shape: args.pendingItem.payload_shape,
      queue_role: CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
      worker_owned: true,
    },
    confusion_insight_signal_state: {
      ...asRecord(args.topicJson.confusion_insight_signal_state),
      status: "pending_model_signal",
      pending_count: nextQueue.length,
      queued_at: args.pendingItem.created_at,
      last_queued_score_id: args.pendingItem.score_id,
      payload_shape: args.pendingItem.payload_shape,
    },
  };
}
