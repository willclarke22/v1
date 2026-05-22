// app/api/confusion-insight/run-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import {
  scoreConfusionInsight,
  type ConfusionInsightEvent,
  type ConfusionInsightInputType,
  type ConfusionInsightPreviousMode,
  type ConfusionInsightStructuredInput,
  type ConfusionInsightTopicTransitionType,
} from "@/lib/runtime/score-confusion-insight";

// Worker/backfill route.
//
// Local dev now defaults to worker-mode confusion/insight scoring so the
// foreground /api/message route does not compete with the topic labeler,
// embedding service, and Next dev server on the same laptop.
//
// This route remains useful for:
// - normal worker-mode message scoring
// - old pending topic_json.pending_confusion_insight_scores rows
// - fallback queue processing if foreground scoring is unavailable
// - future batch rescoring/migration work
//
// It supports both queue item shapes:
// 1. structured v1_1: { structured_input }
// 2. legacy:          { text, chat_history }

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type PendingConfusionInsightPayloadShape = "structured_v1_1" | "legacy_text";

type PendingConfusionInsightScore = {
  score_id: string;
  run_id: string | null;
  text: string;
  chat_history: string[];
  structured_input: ConfusionInsightStructuredInput | null;
  created_at: string;
  source: "message_route" | "probe_submit" | "fallback" | string;
  routing: {
    target_topic_id: string;
    target_topic_label: string;
    resolution_kind: string;
    resolved_label: string | null;
    match_confidence: number;
    authority_source: string | null;
  };
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonObject = { [key: string]: JsonValue };

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const DEFAULT_SIGNAL_ALPHA = 0.25;
const DEFAULT_SIMILARITY_THRESHOLD = 0.65;

function nowIso() {
  return new Date().toISOString();
}

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");

  if (!raw) return DEFAULT_LIMIT;
  if (raw === "all") return MAX_LIMIT;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(parsed, MAX_LIMIT);
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (value && typeof value === "object") {
    const output: JsonObject = {};

    for (const [key, childValue] of Object.entries(value)) {
      output[key] = toJsonValue(childValue);
    }

    return output;
  }

  return null;
}

function normalizeInputType(value: unknown): ConfusionInsightInputType {
  if (
    value === "message" ||
    value === "clarify_response" ||
    value === "text_attempt" ||
    value === "spoken_attempt" ||
    value === "interactive_attempt" ||
    value === "video_checkpoint_attempt" ||
    value === "audio_checkpoint_attempt"
  ) {
    return value;
  }

  return "message";
}

function normalizeTopicTransitionType(
  value: unknown,
): ConfusionInsightTopicTransitionType {
  if (
    value === "same_topic" ||
    value === "nearby_topic" ||
    value === "far_topic" ||
    value === "new_topic"
  ) {
    return value;
  }

  return "same_topic";
}

function normalizePreviousMode(value: unknown): ConfusionInsightPreviousMode {
  if (value === "no_previous" || value === "clarify" || value === "probe") {
    return value;
  }

  return "no_previous";
}

function normalizeEvent(value: unknown): ConfusionInsightEvent | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;

  return {
    event_type: asOptionalString(record.event_type),
    topic_label: asOptionalString(record.topic_label),
    diagnosis_label: asOptionalString(record.diagnosis_label),

    clarification_prompt: asOptionalString(record.clarification_prompt),
    clarification_goal: asOptionalString(record.clarification_goal),

    probe_type: asOptionalString(record.probe_type),
    modality: asOptionalString(record.modality),
    probe_prompt: asOptionalString(record.probe_prompt),
    learning_objective: asOptionalString(record.learning_objective),
    expected_attempt_type: asOptionalString(record.expected_attempt_type),
    success_marker: asOptionalString(record.success_marker),
    misconception_being_tested: asOptionalString(
      record.misconception_being_tested,
    ),

    attempt_type: asOptionalString(record.attempt_type),
    evidence: asOptionalString(record.evidence),
  };
}

function normalizeEvents(value: unknown): ConfusionInsightEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeEvent)
    .filter((event): event is ConfusionInsightEvent => Boolean(event))
    .slice(-5);
}

function normalizeStructuredInput(
  value: unknown,
): ConfusionInsightStructuredInput | null {
  const record = asRecord(value);
  const currentEvidence = asOptionalString(record.current_evidence);

  if (!currentEvidence) return null;

  return {
    input_type: normalizeInputType(record.input_type),
    current_attempt_type: asOptionalString(record.current_attempt_type),
    current_evidence: currentEvidence,

    previous_active_topic_label: asOptionalString(
      record.previous_active_topic_label,
    ),
    target_topic_label: asOptionalString(record.target_topic_label),
    topic_transition_type: normalizeTopicTransitionType(
      record.topic_transition_type,
    ),
    topic_similarity: asFiniteNumber(record.topic_similarity),

    previous_mode: normalizePreviousMode(record.previous_mode),
    is_response_to_clarify: asBoolean(record.is_response_to_clarify),
    is_response_to_probe: asBoolean(record.is_response_to_probe),

    target_topic_recent_events: normalizeEvents(record.target_topic_recent_events),

    most_related_topic_label: asOptionalString(record.most_related_topic_label),
    most_related_topic_similarity: asFiniteNumber(
      record.most_related_topic_similarity,
    ),
    most_related_topic_similarity_threshold:
      asFiniteNumber(record.most_related_topic_similarity_threshold) ??
      DEFAULT_SIMILARITY_THRESHOLD,
    most_related_topic_recent_events: normalizeEvents(
      record.most_related_topic_recent_events,
    ),

    target_topic_confusion_average: asFiniteNumber(
      record.target_topic_confusion_average,
    ),
    target_topic_insight_average: asFiniteNumber(
      record.target_topic_insight_average,
    ),
    most_related_topic_confusion_average: asFiniteNumber(
      record.most_related_topic_confusion_average,
    ),
    most_related_topic_insight_average: asFiniteNumber(
      record.most_related_topic_insight_average,
    ),
  };
}

function getPendingPayloadShape(
  item: PendingConfusionInsightScore,
): PendingConfusionInsightPayloadShape {
  return item.structured_input ? "structured_v1_1" : "legacy_text";
}

function inferLegacyTopicTransition(
  routing: PendingConfusionInsightScore["routing"],
): ConfusionInsightTopicTransitionType {
  if (routing.resolution_kind === "created_new_candidate") return "new_topic";
  return "same_topic";
}

function buildStructuredInputForPendingItem(args: {
  item: PendingConfusionInsightScore;
  row: TopicStateRow;
}): ConfusionInsightStructuredInput {
  const { item, row } = args;

  if (item.structured_input) {
    return item.structured_input;
  }

  const targetTopicLabel = item.routing.target_topic_label || row.topic_label;
  const topicSimilarity =
    typeof item.routing.match_confidence === "number" &&
    Number.isFinite(item.routing.match_confidence)
      ? clamp01(item.routing.match_confidence)
      : null;

  return {
    input_type: "message",
    current_attempt_type: null,
    current_evidence: item.text,

    previous_active_topic_label: row.topic_label,
    target_topic_label: targetTopicLabel,
    topic_transition_type: inferLegacyTopicTransition(item.routing),
    topic_similarity: topicSimilarity,

    previous_mode: "no_previous",
    is_response_to_clarify: false,
    is_response_to_probe: false,

    target_topic_recent_events: [],

    most_related_topic_label: null,
    most_related_topic_similarity: null,
    most_related_topic_similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    most_related_topic_recent_events: [],

    target_topic_confusion_average:
      typeof row.confusion === "number" && Number.isFinite(row.confusion)
        ? clamp01(row.confusion)
        : null,
    target_topic_insight_average:
      typeof row.insight === "number" && Number.isFinite(row.insight)
        ? clamp01(row.insight)
        : null,
    most_related_topic_confusion_average: null,
    most_related_topic_insight_average: null,
  };
}

function getPendingConfusionInsightScores(
  topicJson: unknown,
): PendingConfusionInsightScore[] {
  const base = asRecord(topicJson);
  const rawQueue = base.pending_confusion_insight_scores;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingConfusionInsightScore | null => {
      const candidate = asRecord(item);
      const routing = asRecord(candidate.routing);

      const scoreId = asOptionalString(candidate.score_id);
      const createdAt = asOptionalString(candidate.created_at);
      const text = asOptionalString(candidate.text) ?? "";
      const structuredInput = normalizeStructuredInput(candidate.structured_input);

      if (!scoreId || !createdAt) return null;
      if (!text && !structuredInput) return null;

      const rawChatHistory = candidate.chat_history;
      const chatHistory = Array.isArray(rawChatHistory)
        ? rawChatHistory
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
            .slice(-8)
        : [];

      return {
        score_id: scoreId,
        run_id: asOptionalString(candidate.run_id),
        text: text || structuredInput?.current_evidence || "",
        chat_history: chatHistory,
        structured_input: structuredInput,
        created_at: createdAt,
        source: asString(candidate.source, "message_route"),
        routing: {
          target_topic_id: asString(routing.target_topic_id),
          target_topic_label: asString(routing.target_topic_label),
          resolution_kind: asString(routing.resolution_kind, "unknown"),
          resolved_label: asOptionalString(routing.resolved_label),
          match_confidence: asFiniteNumber(routing.match_confidence) ?? 0,
          authority_source: asOptionalString(routing.authority_source),
        },
      };
    })
    .filter((item): item is PendingConfusionInsightScore => Boolean(item));
}

type SignalAverageUpdate = {
  value: number;
  alpha_applied: number;
  source:
    | "model_direct_created_topic"
    | "model_direct_first_signal"
    | "model_blended_existing_topic";
};

function shouldUseModelSignalDirectly(args: {
  item: PendingConfusionInsightScore;
  priorSignalCount: number;
  previous: number | null;
}) {
  if (args.item.routing.resolution_kind === "created_new_candidate") {
    return true;
  }

  if (args.priorSignalCount <= 0) {
    return true;
  }

  return typeof args.previous !== "number" || !Number.isFinite(args.previous);
}

function deriveSignalAverageUpdate(args: {
  item: PendingConfusionInsightScore;
  previous: number | null;
  nextSignal: number;
  priorSignalCount: number;
}): SignalAverageUpdate {
  const signal = clamp01(args.nextSignal);

  if (
    shouldUseModelSignalDirectly({
      item: args.item,
      priorSignalCount: args.priorSignalCount,
      previous: args.previous,
    })
  ) {
    return {
      value: round4(signal),
      alpha_applied: 1,
      source:
        args.item.routing.resolution_kind === "created_new_candidate"
          ? "model_direct_created_topic"
          : "model_direct_first_signal",
    };
  }

  const previous = clamp01(args.previous as number);
  const alpha = DEFAULT_SIGNAL_ALPHA;

  return {
    value: round4(clamp01(previous * (1 - alpha) + signal * alpha)),
    alpha_applied: alpha,
    source: "model_blended_existing_topic",
  };
}

function buildUpdatedTopicJson(args: {
  row: TopicStateRow;
  remainingQueue: PendingConfusionInsightScore[];
  processedItems: Array<{
    item: PendingConfusionInsightScore;
    input_type: ConfusionInsightInputType;
    payload_shape: PendingConfusionInsightPayloadShape;
    model_confusion: number;
    model_insight: number;
    model_version: string | null;
    latency_ms: number | null;
    alpha_applied: number;
    persistence_source:
      | "model_direct_created_topic"
      | "model_direct_first_signal"
      | "model_blended_existing_topic";
  }>;
  failedItems: PendingConfusionInsightScore[];
  updatedAt: string;
  nextConfusion: number | null;
  nextInsight: number | null;
}) {
  const base = asRecord(args.row.topic_json);

  const previousProcessed = Array.isArray(base.processed_confusion_insight_scores)
    ? base.processed_confusion_insight_scores
    : [];

  const processedSummaries = args.processedItems.map((processed) => ({
    score_id: processed.item.score_id,
    run_id: processed.item.run_id,
    processed_at: args.updatedAt,
    source: processed.item.source,
    input_type: processed.input_type,
    payload_shape: processed.payload_shape,
    text_preview: processed.item.text.slice(0, 120),
    model_confusion: processed.model_confusion,
    model_insight: processed.model_insight,
    model_version: processed.model_version,
    latency_ms: processed.latency_ms,
    alpha_applied: processed.alpha_applied,
    persistence_source: processed.persistence_source,
  }));

  const nextProcessed = [...previousProcessed, ...processedSummaries].slice(-30);

  const previousSignalCount =
    typeof base.confusion_insight_signal_count === "number" &&
    Number.isFinite(base.confusion_insight_signal_count)
      ? Math.max(0, Math.floor(base.confusion_insight_signal_count))
      : 0;

  const nextSignalCount = previousSignalCount + args.processedItems.length;

  const nextJson: JsonObject = {
    ...Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, toJsonValue(value)]),
    ),
    pending_confusion_insight_scores: args.remainingQueue.map(toJsonValue),
    confusion_insight_pending_count: args.remainingQueue.length,
    confusion_insight_queue_status:
      args.remainingQueue.length > 0 ? "pending" : "empty",
    processed_confusion_insight_scores: nextProcessed.map(toJsonValue),
    confusion_insight_signal_count: nextSignalCount,
    confusion_insight_updated_at: args.updatedAt,
    confusion_insight_status: {
      ...asRecord(base.confusion_insight_status),
      status: args.remainingQueue.length > 0 ? "partially_processed" : "ready",
      pending_count: args.remainingQueue.length,
      processed_count_this_run: args.processedItems.length,
      failed_count_this_run: args.failedItems.length,
      updated_at: args.updatedAt,
      model_signal_alpha: DEFAULT_SIGNAL_ALPHA,
      first_signal_alpha: 1,
      direct_score_for_created_topic: true,
      note:
        "Confusion/insight scores are supportive soft signals, not proof of understanding. Created topics and first real signals use the model score directly; established topics blend with prior state.",
    },
    model_confusion_average: args.nextConfusion,
    model_insight_average: args.nextInsight,
  };

  return nextJson;
}

async function processTopicQueue(args: {
  row: TopicStateRow;
  remainingBudget: number;
}) {
  const queue = getPendingConfusionInsightScores(args.row.topic_json);

  if (!queue.length || args.remainingBudget <= 0) {
    return null;
  }

  const toProcess = queue.slice(0, args.remainingBudget);
  const notYetProcessed = queue.slice(args.remainingBudget);
  const processedItems: Array<{
    item: PendingConfusionInsightScore;
    input_type: ConfusionInsightInputType;
    payload_shape: PendingConfusionInsightPayloadShape;
    model_confusion: number;
    model_insight: number;
    model_version: string | null;
    latency_ms: number | null;
    alpha_applied: number;
    persistence_source:
      | "model_direct_created_topic"
      | "model_direct_first_signal"
      | "model_blended_existing_topic";
  }> = [];
  const failedItems: PendingConfusionInsightScore[] = [];

  const topicJson = asRecord(args.row.topic_json);
  let signalCount =
    typeof topicJson.confusion_insight_signal_count === "number" &&
    Number.isFinite(topicJson.confusion_insight_signal_count)
      ? Math.max(0, Math.floor(topicJson.confusion_insight_signal_count))
      : 0;

  let confusion =
    typeof args.row.confusion === "number" && Number.isFinite(args.row.confusion)
      ? clamp01(args.row.confusion)
      : null;
  let insight =
    typeof args.row.insight === "number" && Number.isFinite(args.row.insight)
      ? clamp01(args.row.insight)
      : null;

  for (const item of toProcess) {
    const structuredInput = buildStructuredInputForPendingItem({
      item,
      row: args.row,
    });
    const payloadShape = getPendingPayloadShape(item);

    try {
      const signal = await scoreConfusionInsight({
        input: structuredInput,
        timeoutMs: 10_000,
      });

      if (
        signal.status !== "ok" ||
        typeof signal.model_confusion !== "number" ||
        typeof signal.model_insight !== "number"
      ) {
        console.warn("Confusion/insight worker received non-ok signal", {
          topic_id: args.row.topic_id,
          topic_label: args.row.topic_label,
          score_id: item.score_id,
          status: signal.status,
          error_message: signal.error_message,
        });
        failedItems.push(item);
        continue;
      }

      const confusionUpdate = deriveSignalAverageUpdate({
        item,
        previous: confusion,
        nextSignal: signal.model_confusion,
        priorSignalCount: signalCount,
      });
      const insightUpdate = deriveSignalAverageUpdate({
        item,
        previous: insight,
        nextSignal: signal.model_insight,
        priorSignalCount: signalCount,
      });

      confusion = confusionUpdate.value;
      insight = insightUpdate.value;
      signalCount += 1;

      processedItems.push({
        item,
        input_type: structuredInput.input_type,
        payload_shape: payloadShape,
        model_confusion: signal.model_confusion,
        model_insight: signal.model_insight,
        model_version: signal.model_version,
        latency_ms: signal.latency_ms,
        alpha_applied: Math.max(
          confusionUpdate.alpha_applied,
          insightUpdate.alpha_applied,
        ),
        persistence_source:
          confusionUpdate.source === insightUpdate.source
            ? confusionUpdate.source
            : confusionUpdate.alpha_applied >= insightUpdate.alpha_applied
              ? confusionUpdate.source
              : insightUpdate.source,
      });
    } catch (error) {
      console.warn("Confusion/insight worker failed to score pending item", {
        topic_id: args.row.topic_id,
        topic_label: args.row.topic_label,
        score_id: item.score_id,
        error: error instanceof Error ? error.message : String(error),
      });
      failedItems.push(item);
    }
  }

  if (!processedItems.length) {
    return {
      topic_id: args.row.topic_id,
      topic_label: args.row.topic_label,
      processed_count: 0,
      processed_structured_v1_1_count: 0,
      processed_legacy_text_count: 0,
      failed_count: failedItems.length,
      failed_structured_v1_1_count: failedItems.filter(
        (item) => getPendingPayloadShape(item) === "structured_v1_1",
      ).length,
      failed_legacy_text_count: failedItems.filter(
        (item) => getPendingPayloadShape(item) === "legacy_text",
      ).length,
      remaining_count: queue.length,
      updated: false,
      confusion: args.row.confusion,
      insight: args.row.insight,
    };
  }

  const updatedAt = nowIso();
  const remainingQueue = [...failedItems, ...notYetProcessed];

  const updatedRowForJson: TopicStateRow = {
    ...args.row,
    confusion,
    insight,
  };

  const nextTopicJson = buildUpdatedTopicJson({
    row: updatedRowForJson,
    remainingQueue,
    processedItems,
    failedItems,
    updatedAt,
    nextConfusion: confusion,
    nextInsight: insight,
  });

  const processedStructuredV1Count = processedItems.filter(
    (item) => item.payload_shape === "structured_v1_1",
  ).length;
  const processedLegacyTextCount = processedItems.filter(
    (item) => item.payload_shape === "legacy_text",
  ).length;
  const failedStructuredV1Count = failedItems.filter(
    (item) => getPendingPayloadShape(item) === "structured_v1_1",
  ).length;
  const failedLegacyTextCount = failedItems.filter(
    (item) => getPendingPayloadShape(item) === "legacy_text",
  ).length;

  await upsertTopicState({
    topicId: args.row.topic_id,
    lastRunId: args.row.last_run_id,
    topicLabel: args.row.topic_label,
    confusion,
    insight,
    learningScore: args.row.learning_score,
    diagnosis: args.row.diagnosis,
    nextStep: args.row.next_step,
    topicJson: nextTopicJson,
    topicPosition: args.row.topic_position as TopicPosition | null,

    topicLabelEmbeddingCentroid: args.row.topic_label_embedding_centroid,
    topicLabelEmbeddingCount: args.row.topic_label_embedding_count,
    topicLabelEmbeddingModel: args.row.topic_label_embedding_model,
    topicLabelEmbeddingUpdatedAt: args.row.topic_label_embedding_updated_at,

    topicMessageEmbeddingCentroid: args.row.topic_message_embedding_centroid,
    topicMessageEmbeddingCount: args.row.topic_message_embedding_count,
    topicMessageEmbeddingModel: args.row.topic_message_embedding_model,
    topicMessageEmbeddingUpdatedAt: args.row.topic_message_embedding_updated_at,

    semanticPosition: args.row.semantic_position,
    semanticPositionMethod: args.row.semantic_position_method,
    semanticPositionUpdatedAt: args.row.semantic_position_updated_at,
  });

  return {
    topic_id: args.row.topic_id,
    topic_label: args.row.topic_label,
    processed_count: processedItems.length,
    processed_structured_v1_1_count: processedStructuredV1Count,
    processed_legacy_text_count: processedLegacyTextCount,
    failed_count: failedItems.length,
    failed_structured_v1_1_count: failedStructuredV1Count,
    failed_legacy_text_count: failedLegacyTextCount,
    remaining_count: remainingQueue.length,
    updated: true,
    previous_confusion: args.row.confusion,
    previous_insight: args.row.insight,
    next_confusion: confusion,
    next_insight: insight,
    signal_alpha: DEFAULT_SIGNAL_ALPHA,
    first_signal_alpha: 1,
    direct_score_for_created_topic: true,
    applied_alpha_values: processedItems.map((item) => item.alpha_applied),
    persistence_sources: processedItems.map((item) => item.persistence_source),
    updated_at: updatedAt,
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams);

  try {
    const rows = await getLatestTopicState();
    let remainingBudget = limit;
    const results = [];

    for (const row of rows) {
      if (remainingBudget <= 0) break;

      const pendingCount = getPendingConfusionInsightScores(row.topic_json).length;
      if (pendingCount <= 0) continue;

      const result = await processTopicQueue({
        row,
        remainingBudget,
      });

      if (!result) continue;

      remainingBudget -= result.processed_count + result.failed_count;
      results.push(result);
    }

    const processedScoreCount = results.reduce(
      (sum, result) => sum + result.processed_count,
      0,
    );
    const failedScoreCount = results.reduce(
      (sum, result) => sum + result.failed_count,
      0,
    );
    const processedStructuredV1ScoreCount = results.reduce(
      (sum, result) => sum + result.processed_structured_v1_1_count,
      0,
    );
    const processedLegacyTextScoreCount = results.reduce(
      (sum, result) => sum + result.processed_legacy_text_count,
      0,
    );
    const failedStructuredV1ScoreCount = results.reduce(
      (sum, result) => sum + result.failed_structured_v1_1_count,
      0,
    );
    const failedLegacyTextScoreCount = results.reduce(
      (sum, result) => sum + result.failed_legacy_text_count,
      0,
    );
    const updatedTopicCount = results.filter((result) => result.updated).length;

    return NextResponse.json({
      ok: true,
      route: "POST /api/confusion-insight/run-pending",
      duration_ms: roundMs(performance.now() - startedAt),
      limit,
      processed_score_count: processedScoreCount,
      processed_structured_v1_1_score_count: processedStructuredV1ScoreCount,
      processed_legacy_text_score_count: processedLegacyTextScoreCount,
      failed_score_count: failedScoreCount,
      failed_structured_v1_1_score_count: failedStructuredV1ScoreCount,
      failed_legacy_text_score_count: failedLegacyTextScoreCount,
      updated_topic_count: updatedTopicCount,
      should_refresh_learning_space: processedScoreCount > 0,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "POST /api/confusion-insight/run-pending",
        duration_ms: roundMs(performance.now() - startedAt),
        error:
          error instanceof Error
            ? error.message
            : "Unknown confusion/insight worker error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
