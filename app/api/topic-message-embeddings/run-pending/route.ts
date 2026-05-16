// app/api/topic-message-embeddings/run-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import { embedMessageForSemanticRouting } from "@/lib/vector/query-topics";
import type { EmbeddingVector } from "@/types/contracts";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type PendingTopicMessageEmbedding = {
  message_id: string;
  run_id: string | null;
  text: string;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function getPendingTopicMessageEmbeddings(
  topicJson: unknown,
): PendingTopicMessageEmbedding[] {
  const base = asRecord(topicJson);
  const rawQueue = base.pending_topic_message_embeddings;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingTopicMessageEmbedding | null => {
      const candidate = asRecord(item);
      const routing = asRecord(candidate.routing);

      const messageId =
        typeof candidate.message_id === "string" && candidate.message_id.trim()
          ? candidate.message_id.trim()
          : null;
      const text =
        typeof candidate.text === "string" && candidate.text.trim()
          ? candidate.text.trim()
          : null;
      const createdAt =
        typeof candidate.created_at === "string" && candidate.created_at.trim()
          ? candidate.created_at.trim()
          : null;

      if (!messageId || !text || !createdAt) return null;

      return {
        message_id: messageId,
        run_id:
          typeof candidate.run_id === "string" && candidate.run_id.trim()
            ? candidate.run_id.trim()
            : null,
        text,
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
    .filter((item): item is PendingTopicMessageEmbedding => Boolean(item));
}

function buildRunningAverageCentroid(args: {
  existingCentroid: EmbeddingVector | null;
  existingCount: number;
  newEmbedding: EmbeddingVector;
}) {
  const safeExistingCount = Math.max(0, Math.floor(args.existingCount));

  if (
    !args.existingCentroid?.length ||
    safeExistingCount <= 0 ||
    args.existingCentroid.length !== args.newEmbedding.length
  ) {
    return {
      centroid: args.newEmbedding,
      count: 1,
      update_method: "initialize" as const,
      alpha: null,
    };
  }

  const nextCount = safeExistingCount + 1;
  const centroid = args.existingCentroid.map((existingValue, index) => {
    const newValue = args.newEmbedding[index];

    return (existingValue * safeExistingCount + newValue) / nextCount;
  });

  return {
    centroid,
    count: nextCount,
    update_method: "running_average" as const,
    alpha: 1 / nextCount,
  };
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

function buildUpdatedTopicJson(args: {
  row: TopicStateRow;
  remainingQueue: PendingTopicMessageEmbedding[];
  processedItems: PendingTopicMessageEmbedding[];
  updatedAt: string;
}) {
  const base = asRecord(args.row.topic_json);

  const previousProcessed = Array.isArray(
    base.processed_topic_message_embeddings,
  )
    ? base.processed_topic_message_embeddings
    : [];

  const processedSummaries = args.processedItems.map((item) => ({
    message_id: item.message_id,
    run_id: item.run_id,
    processed_at: args.updatedAt,
    source: item.source,
    text_preview: item.text.slice(0, 120),
  }));

  const nextProcessed = [...previousProcessed, ...processedSummaries].slice(-30);

  const nextJson: JsonObject = {
    ...Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, toJsonValue(value)]),
    ),
    pending_topic_message_embeddings: args.remainingQueue.map(toJsonValue),
    topic_message_embedding_pending_count: args.remainingQueue.length,
    topic_message_embedding_queue_status:
      args.remainingQueue.length > 0 ? "pending" : "empty",
    processed_topic_message_embeddings: nextProcessed.map(toJsonValue),
    topic_message_embedding_centroid:
      args.row.topic_message_embedding_centroid,
    topic_message_embedding_count: args.row.topic_message_embedding_count,
    topic_message_embedding_model: args.row.topic_message_embedding_model,
    topic_message_embedding_updated_at:
      args.row.topic_message_embedding_updated_at,
    layout_status: "semantic_layout_refresh_pending",
    should_schedule_enrichment: args.remainingQueue.length > 0,
    semantic_enrichment_status: {
      ...asRecord(base.semantic_enrichment_status),
      status: "message_embedding_ready",
      needs_embedding_centroid: false,
      should_schedule_enrichment: args.remainingQueue.length > 0,
      layout_status: "semantic_layout_refresh_pending",
      embedding_skip_reason: null,
    },
  };

  return nextJson;
}

async function processTopicQueue(args: {
  row: TopicStateRow;
  remainingBudget: number;
}) {
  const queue = getPendingTopicMessageEmbeddings(args.row.topic_json);

  if (!queue.length || args.remainingBudget <= 0) {
    return null;
  }

  const toProcess = queue.slice(0, args.remainingBudget);
  const notYetProcessed = queue.slice(args.remainingBudget);
  const processedItems: PendingTopicMessageEmbedding[] = [];
  const failedItems: PendingTopicMessageEmbedding[] = [];

  let centroid = args.row.topic_message_embedding_centroid;
  let count = args.row.topic_message_embedding_count;
  let embeddingModel = args.row.topic_message_embedding_model;
  let lastUpdateMethod: "initialize" | "running_average" | null = null;
  let lastAlpha: number | null = null;

  for (const item of toProcess) {
    try {
      const embeddingResult = await embedMessageForSemanticRouting(item.text);
      const vector = asEmbeddingVector(embeddingResult.messageEmbedding);

      if (!vector) {
        failedItems.push(item);
        continue;
      }

      const next = buildRunningAverageCentroid({
        existingCentroid: centroid,
        existingCount: count,
        newEmbedding: vector,
      });

      centroid = next.centroid;
      count = next.count;
      embeddingModel = embeddingResult.embeddingModel;
      lastUpdateMethod = next.update_method;
      lastAlpha = next.alpha;
      processedItems.push(item);
    } catch (error) {
      console.warn(
        "Topic-message embedding worker failed to embed pending item",
        {
          topic_id: args.row.topic_id,
          topic_label: args.row.topic_label,
          message_id: item.message_id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
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
      update_method: null,
      alpha: null,
    };
  }

  const updatedAt = nowIso();
  const remainingQueue = [...failedItems, ...notYetProcessed];

  const updatedRowForJson: TopicStateRow = {
    ...args.row,
    topic_message_embedding_centroid: centroid,
    topic_message_embedding_count: count,
    topic_message_embedding_model: embeddingModel,
    topic_message_embedding_updated_at: updatedAt,
  };

  const topicJson = buildUpdatedTopicJson({
    row: updatedRowForJson,
    remainingQueue,
    processedItems,
    updatedAt,
  });

  await upsertTopicState({
    topicId: args.row.topic_id,
    lastRunId: args.row.last_run_id,
    topicLabel: args.row.topic_label,
    confusion: args.row.confusion,
    insight: args.row.insight,
    learningScore: args.row.learning_score,
    diagnosis: args.row.diagnosis,
    nextStep: args.row.next_step,
    topicJson,
    topicPosition: args.row.topic_position as TopicPosition | null,

    topicLabelEmbeddingCentroid: args.row.topic_label_embedding_centroid,
    topicLabelEmbeddingCount: args.row.topic_label_embedding_count,
    topicLabelEmbeddingModel: args.row.topic_label_embedding_model,
    topicLabelEmbeddingUpdatedAt: args.row.topic_label_embedding_updated_at,

    topicMessageEmbeddingCentroid: centroid,
    topicMessageEmbeddingCount: count,
    topicMessageEmbeddingModel: embeddingModel,
    topicMessageEmbeddingUpdatedAt: updatedAt,

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
    update_method: lastUpdateMethod,
    alpha: lastAlpha,
    previous_embedding_count: args.row.topic_message_embedding_count,
    new_embedding_count: count,
    embedding_model: embeddingModel,
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

      const pendingCount = getPendingTopicMessageEmbeddings(row.topic_json).length;
      if (pendingCount <= 0) continue;

      const result = await processTopicQueue({
        row,
        remainingBudget,
      });

      if (!result) continue;

      remainingBudget -= result.processed_count + result.failed_count;
      results.push(result);
    }

    const processedMessageCount = results.reduce(
      (sum, result) => sum + result.processed_count,
      0,
    );
    const failedMessageCount = results.reduce(
      (sum, result) => sum + result.failed_count,
      0,
    );
    const updatedTopicCount = results.filter((result) => result.updated).length;

    return NextResponse.json({
      ok: true,
      route: "POST /api/topic-message-embeddings/run-pending",
      duration_ms: roundMs(performance.now() - startedAt),
      limit,
      processed_message_count: processedMessageCount,
      failed_message_count: failedMessageCount,
      updated_topic_count: updatedTopicCount,
      should_recompute_layout: processedMessageCount > 0,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "POST /api/topic-message-embeddings/run-pending",
        duration_ms: roundMs(performance.now() - startedAt),
        error:
          error instanceof Error
            ? error.message
            : "Unknown topic-message embedding worker error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
