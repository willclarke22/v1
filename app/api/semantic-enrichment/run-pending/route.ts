import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import { nowIso } from "@/lib/runtime/shared";
import { embedText } from "@/lib/vector/embed";
import {
  canSyncTopicToQdrant,
  syncTopicToQdrantBestEffort,
} from "@/lib/vector/sync-topic-to-qdrant";
import type { EmbeddingVector } from "@/types/contracts";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown, fallback: string | null = null) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
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

function hasEmbeddingCentroid(row: {
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_embedding_centroid) &&
    row.topic_embedding_centroid.length > 0 &&
    row.topic_embedding_count > 0
  );
}

function getTopicJson(row: { topic_json: Record<string, unknown> | null }) {
  return isJsonObject(row.topic_json) ? row.topic_json : {};
}

function shouldEnrichTopic(row: {
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
  topic_json: Record<string, unknown> | null;
}) {
  const topicJson = getTopicJson(row);

  const explicitNeedsCentroid = asBoolean(
    topicJson.needs_embedding_centroid,
    false,
  );

  const explicitSchedule = asBoolean(
    topicJson.should_schedule_enrichment,
    false,
  );

  return !hasEmbeddingCentroid(row) || explicitNeedsCentroid || explicitSchedule;
}

function buildEnrichmentPrompt(row: {
  topic_name: string;
  topic_json: Record<string, unknown> | null;
}) {
  const topicJson = getTopicJson(row);

  const storedPrompt = asString(topicJson.semantic_enrichment_prompt_text);

  if (storedPrompt) return storedPrompt;

  const nestedStatus = isJsonObject(topicJson.semantic_enrichment_status)
    ? topicJson.semantic_enrichment_status
    : null;

  const nestedPrompt = nestedStatus
    ? asString(nestedStatus.enrichment_prompt_text)
    : null;

  if (nestedPrompt) return nestedPrompt;

  return `Topic: ${row.topic_name}`;
}

function buildUpdatedTopicJson(args: {
  topicJson: Record<string, unknown> | null;
  centroid: EmbeddingVector;
  embeddingModel: string;
  embeddingUpdatedAt: string;
  enrichmentPromptText: string;
  nextEmbeddingCount: number;
}) {
  const {
    topicJson,
    centroid,
    embeddingModel,
    embeddingUpdatedAt,
    enrichmentPromptText,
    nextEmbeddingCount,
  } = args;

  const base = getTopicJson({ topic_json: topicJson });

  return {
    ...base,

    semantic_enrichment_status: {
      status: "centroid_ready",
      needs_embedding_centroid: false,
      centroid_source: "topic_name_plus_initial_message",
      embedding_skip_reason: null,
      layout_status: "semantic_position_ready",
      should_schedule_enrichment: false,
      enrichment_prompt_text: enrichmentPromptText,
    },

    needs_embedding_centroid: false,
    embedding_skip_reason: null,
    layout_status: "semantic_position_ready",
    should_schedule_enrichment: false,
    semantic_enrichment_prompt_text: enrichmentPromptText,

    topic_embedding_centroid: centroid,
    topic_embedding_count: nextEmbeddingCount,
    topic_embedding_model: embeddingModel,
    topic_embedding_updated_at: embeddingUpdatedAt,
  };
}

function getLimitFromUrl(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("limit");

  if (!raw) return 5;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return 5;

  return Math.min(parsed, 25);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const limit = getLimitFromUrl(request);

  const rows = await getLatestTopicState();
  const allPendingRows = rows.filter(shouldEnrichTopic);
  const pendingRows = allPendingRows.slice(0, limit);

  const results: Array<{
    topic_id: string;
    topic_name: string;
    status: "enriched" | "skipped" | "error";
    reason: string | null;
    embedding_model: string | null;
    vector_size: number | null;
    qdrant_sync_ok: boolean | null;
    qdrant_sync_error: string | null;
  }> = [];

  for (const row of pendingRows) {
    try {
      const enrichmentPromptText = buildEnrichmentPrompt(row);

      /**
       * In this codebase, embedText(...) returns the embedding vector directly
       * as number[], not an object like { embedding, embeddingModel }.
       */
      const embeddingResult = await embedText(enrichmentPromptText);
      const centroid = asEmbeddingVector(embeddingResult);

      if (!centroid) {
        results.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          status: "error",
          reason: "embedding_result_missing_or_invalid_vector",
          embedding_model: null,
          vector_size: null,
          qdrant_sync_ok: null,
          qdrant_sync_error: null,
        });

        continue;
      }

      const embeddingModel = "local-embedding-service";
      const embeddingUpdatedAt = nowIso();
      const nextEmbeddingCount = Math.max(1, row.topic_embedding_count || 0);

      const updatedTopicJson = buildUpdatedTopicJson({
        topicJson: row.topic_json,
        centroid,
        embeddingModel,
        embeddingUpdatedAt,
        enrichmentPromptText,
        nextEmbeddingCount,
      });

      await upsertTopicState({
        topicId: row.topic_id,
        lastRunId: row.last_run_id,
        topicName: row.topic_name,
        confusion: row.confusion,
        insight: row.insight,
        learningScore: row.learning_score,
        diagnosis: row.diagnosis,
        nextStep: row.next_step,
        topicJson: updatedTopicJson,
        topicEmbeddingCentroid: centroid,
        topicEmbeddingCount: nextEmbeddingCount,
        topicEmbeddingModel: embeddingModel,
        topicEmbeddingUpdatedAt: embeddingUpdatedAt,
      });

      let qdrantSyncOk: boolean | null = null;
      let qdrantSyncError: string | null = null;

      if (canSyncTopicToQdrant()) {
        const syncResult = await syncTopicToQdrantBestEffort({
          topicId: row.topic_id,
          topicName: row.topic_name,
          diagnosis: row.diagnosis,
          nextStep: row.next_step,
          updatedAt: embeddingUpdatedAt,
          topicJson: updatedTopicJson,
          topicEmbeddingCentroid: centroid,
          topicEmbeddingCount: nextEmbeddingCount,
          topicEmbeddingModel: embeddingModel,
          topicEmbeddingUpdatedAt: embeddingUpdatedAt,
        });

        qdrantSyncOk = syncResult.ok;
        qdrantSyncError = syncResult.error;
      }

      results.push({
        topic_id: row.topic_id,
        topic_name: row.topic_name,
        status: "enriched",
        reason: null,
        embedding_model: embeddingModel,
        vector_size: centroid.length,
        qdrant_sync_ok: qdrantSyncOk,
        qdrant_sync_error: qdrantSyncError,
      });
    } catch (error) {
      results.push({
        topic_id: row.topic_id,
        topic_name: row.topic_name,
        status: "error",
        reason:
          error instanceof Error
            ? error.message
            : "unknown_semantic_enrichment_error",
        embedding_model: null,
        vector_size: null,
        qdrant_sync_ok: null,
        qdrant_sync_error: null,
      });
    }
  }

  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  return NextResponse.json({
    ok: true,
    route: "POST /api/semantic-enrichment/run-pending",
    duration_ms: durationMs,
    limit,
    total_topics_seen: rows.length,
    pending_topics_found: allPendingRows.length,
    processed_count: results.length,
    enriched_count: results.filter((result) => result.status === "enriched")
      .length,
    skipped_count: results.filter((result) => result.status === "skipped")
      .length,
    error_count: results.filter((result) => result.status === "error").length,
    results,
  });
}