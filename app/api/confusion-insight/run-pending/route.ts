// app/api/confusion-insight/run-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import { scoreConfusionInsight } from "@/lib/runtime/score-confusion-insight";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type PendingConfusionInsightScore = {
  score_id: string;
  run_id: string | null;
  text: string;
  chat_history: string[];
  created_at: string;
  source: "message_route";
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

      const scoreId =
        typeof candidate.score_id === "string" && candidate.score_id.trim()
          ? candidate.score_id.trim()
          : null;
      const text =
        typeof candidate.text === "string" && candidate.text.trim()
          ? candidate.text.trim()
          : null;
      const createdAt =
        typeof candidate.created_at === "string" && candidate.created_at.trim()
          ? candidate.created_at.trim()
          : null;

      if (!scoreId || !text || !createdAt) return null;

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
        created_at: createdAt,
        source: "message_route",
        routing: {
          target_topic_id:
            typeof routing.target_topic_id === "string"
              ? routing.target_topic_id
              : "",
          target_topic_label:
            typeof routing.target_topic_label === "string"
              ? routing.target_topic_label
              : "",
          resolution_kind:
            typeof routing.resolution_kind === "string"
              ? routing.resolution_kind
              : "unknown",
          resolved_label:
            typeof routing.resolved_label === "string"
              ? routing.resolved_label
              : null,
          match_confidence:
            typeof routing.match_confidence === "number" &&
            Number.isFinite(routing.match_confidence)
              ? routing.match_confidence
              : 0,
          authority_source:
            typeof routing.authority_source === "string"
              ? routing.authority_source
              : null,
        },
      };
    })
    .filter((item): item is PendingConfusionInsightScore => Boolean(item));
}

function blendSignalAverage(args: {
  previous: number | null;
  nextSignal: number;
  priorSignalCount: number;
}) {
  const signal = clamp01(args.nextSignal);

  if (
    typeof args.previous !== "number" ||
    !Number.isFinite(args.previous) ||
    args.priorSignalCount <= 0
  ) {
    return round4(signal);
  }

  const alpha = DEFAULT_SIGNAL_ALPHA;
  return round4(clamp01(args.previous * (1 - alpha) + signal * alpha));
}

function buildUpdatedTopicJson(args: {
  row: TopicStateRow;
  remainingQueue: PendingConfusionInsightScore[];
  processedItems: Array<{
    item: PendingConfusionInsightScore;
    model_confusion: number;
    model_insight: number;
    model_version: string | null;
    latency_ms: number | null;
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
    text_preview: processed.item.text.slice(0, 120),
    model_confusion: processed.model_confusion,
    model_insight: processed.model_insight,
    model_version: processed.model_version,
    latency_ms: processed.latency_ms,
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
      note:
        "Message-level confusion/insight scores are supportive soft signals, not proof of understanding.",
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
    model_confusion: number;
    model_insight: number;
    model_version: string | null;
    latency_ms: number | null;
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
    try {
      const signal = await scoreConfusionInsight({
        userMessage: item.text,
        chatHistory: item.chat_history,
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

      confusion = blendSignalAverage({
        previous: confusion,
        nextSignal: signal.model_confusion,
        priorSignalCount: signalCount,
      });
      insight = blendSignalAverage({
        previous: insight,
        nextSignal: signal.model_insight,
        priorSignalCount: signalCount,
      });
      signalCount += 1;

      processedItems.push({
        item,
        model_confusion: signal.model_confusion,
        model_insight: signal.model_insight,
        model_version: signal.model_version,
        latency_ms: signal.latency_ms,
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
      failed_count: failedItems.length,
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
    failed_count: failedItems.length,
    remaining_count: remainingQueue.length,
    updated: true,
    previous_confusion: args.row.confusion,
    previous_insight: args.row.insight,
    next_confusion: confusion,
    next_insight: insight,
    signal_alpha: DEFAULT_SIGNAL_ALPHA,
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
    const updatedTopicCount = results.filter((result) => result.updated).length;

    return NextResponse.json({
      ok: true,
      route: "POST /api/confusion-insight/run-pending",
      duration_ms: roundMs(performance.now() - startedAt),
      limit,
      processed_score_count: processedScoreCount,
      failed_score_count: failedScoreCount,
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
