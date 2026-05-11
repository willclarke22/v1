import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import { nowIso } from "@/lib/runtime/shared";
import { embedTexts } from "@/lib/vector/embed";
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

function hasVector(value: EmbeddingVector | null, count: number) {
  return Array.isArray(value) && value.length > 0 && count > 0;
}

function hasLegacyEmbedding(row: {
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
}) {
  return hasVector(row.topic_embedding_centroid, row.topic_embedding_count);
}

function hasConceptEmbedding(row: {
  topic_concept_embedding_centroid: EmbeddingVector | null;
  topic_concept_embedding_count: number;
}) {
  return hasVector(
    row.topic_concept_embedding_centroid,
    row.topic_concept_embedding_count,
  );
}

function hasLearningPatternEmbedding(row: {
  learning_pattern_embedding_centroid: EmbeddingVector | null;
  learning_pattern_embedding_count: number;
}) {
  return hasVector(
    row.learning_pattern_embedding_centroid,
    row.learning_pattern_embedding_count,
  );
}

function getTopicJson(row: { topic_json: Record<string, unknown> | null }) {
  return isJsonObject(row.topic_json) ? row.topic_json : {};
}

function shouldEnrichTopic(row: {
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
  topic_concept_embedding_centroid: EmbeddingVector | null;
  topic_concept_embedding_count: number;
  learning_pattern_embedding_centroid: EmbeddingVector | null;
  learning_pattern_embedding_count: number;
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

  return (
    explicitNeedsCentroid ||
    explicitSchedule ||
    !hasConceptEmbedding(row) ||
    !hasLearningPatternEmbedding(row) ||
    !hasLegacyEmbedding(row)
  );
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

function buildConceptEmbeddingText(row: { topic_name: string }) {
  return row.topic_name.trim();
}

function buildLearningPatternEmbeddingText(args: {
  topicName: string;
  enrichmentPromptText: string;
}) {
  return [
    `Learning pattern for topic ${args.topicName}:`,
    args.enrichmentPromptText,
  ].join("\n");
}

function buildUpdatedTopicJson(args: {
  topicJson: Record<string, unknown> | null;

  conceptCentroid: EmbeddingVector;
  learningPatternCentroid: EmbeddingVector;

  embeddingModel: string;
  embeddingUpdatedAt: string;

  conceptEmbeddingText: string;
  learningPatternEmbeddingText: string;
  enrichmentPromptText: string;

  nextConceptEmbeddingCount: number;
  nextLearningPatternEmbeddingCount: number;
}) {
  const {
    topicJson,
    conceptCentroid,
    learningPatternCentroid,
    embeddingModel,
    embeddingUpdatedAt,
    conceptEmbeddingText,
    learningPatternEmbeddingText,
    enrichmentPromptText,
    nextConceptEmbeddingCount,
    nextLearningPatternEmbeddingCount,
  } = args;

  const base = getTopicJson({ topic_json: topicJson });

  return {
    ...base,

    semantic_enrichment_status: {
      status: "centroid_ready",
      needs_embedding_centroid: false,
      centroid_source: "two_embedding_system_v1",
      embedding_skip_reason: null,
      layout_status: "semantic_position_ready",
      should_schedule_enrichment: false,
      enrichment_prompt_text: enrichmentPromptText,

      concept_embedding_source: "topic_label_only_v1",
      learning_pattern_embedding_source: "enrichment_prompt_text_v1",
    },

    needs_embedding_centroid: false,
    embedding_skip_reason: null,
    layout_status: "semantic_position_ready",
    should_schedule_enrichment: false,
    semantic_enrichment_prompt_text: enrichmentPromptText,

    /**
     * Debug/source texts.
     */
    topic_concept_embedding_text: conceptEmbeddingText,
    learning_pattern_embedding_text: learningPatternEmbeddingText,

    /**
     * Legacy/general embedding fields.
     * For compatibility, these mirror concept embedding.
     */
    topic_embedding_centroid: conceptCentroid,
    topic_embedding_count: nextConceptEmbeddingCount,
    topic_embedding_model: embeddingModel,
    topic_embedding_updated_at: embeddingUpdatedAt,

    /**
     * New concept embedding fields for semantic layout.
     */
    topic_concept_embedding_centroid: conceptCentroid,
    topic_concept_embedding_count: nextConceptEmbeddingCount,
    topic_concept_embedding_model: embeddingModel,
    topic_concept_embedding_updated_at: embeddingUpdatedAt,

    /**
     * New learning-pattern embedding fields for future personalization /
     * diagnosis transfer / similar-struggle matching.
     */
    learning_pattern_embedding_centroid: learningPatternCentroid,
    learning_pattern_embedding_count: nextLearningPatternEmbeddingCount,
    learning_pattern_embedding_model: embeddingModel,
    learning_pattern_embedding_updated_at: embeddingUpdatedAt,
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
    concept_vector_size: number | null;
    learning_pattern_vector_size: number | null;
    qdrant_sync_ok: boolean | null;
    qdrant_sync_error: string | null;
  }> = [];

  for (const row of pendingRows) {
    try {
      const enrichmentPromptText = buildEnrichmentPrompt(row);

      const conceptEmbeddingText = buildConceptEmbeddingText({
        topic_name: row.topic_name,
      });

      const learningPatternEmbeddingText = buildLearningPatternEmbeddingText({
        topicName: row.topic_name,
        enrichmentPromptText,
      });

      const [conceptEmbeddingResult, learningPatternEmbeddingResult] =
        await embedTexts([conceptEmbeddingText, learningPatternEmbeddingText]);

      const conceptCentroid = asEmbeddingVector(conceptEmbeddingResult);
      const learningPatternCentroid = asEmbeddingVector(
        learningPatternEmbeddingResult,
      );

      if (!conceptCentroid) {
        results.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          status: "error",
          reason: "concept_embedding_result_missing_or_invalid_vector",
          embedding_model: null,
          concept_vector_size: null,
          learning_pattern_vector_size: null,
          qdrant_sync_ok: null,
          qdrant_sync_error: null,
        });

        continue;
      }

      if (!learningPatternCentroid) {
        results.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          status: "error",
          reason: "learning_pattern_embedding_result_missing_or_invalid_vector",
          embedding_model: null,
          concept_vector_size: conceptCentroid.length,
          learning_pattern_vector_size: null,
          qdrant_sync_ok: null,
          qdrant_sync_error: null,
        });

        continue;
      }

      const embeddingModel = "local-embedding-service";
      const embeddingUpdatedAt = nowIso();

      const nextConceptEmbeddingCount = Math.max(
        1,
        row.topic_concept_embedding_count || row.topic_embedding_count || 0,
      );

      const nextLearningPatternEmbeddingCount = Math.max(
        1,
        row.learning_pattern_embedding_count || 0,
      );

      const updatedTopicJson = buildUpdatedTopicJson({
        topicJson: row.topic_json,

        conceptCentroid,
        learningPatternCentroid,

        embeddingModel,
        embeddingUpdatedAt,

        conceptEmbeddingText,
        learningPatternEmbeddingText,
        enrichmentPromptText,

        nextConceptEmbeddingCount,
        nextLearningPatternEmbeddingCount,
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

        /**
         * Legacy/general embedding mirrors concept embedding for compatibility.
         */
        topicEmbeddingCentroid: conceptCentroid,
        topicEmbeddingCount: nextConceptEmbeddingCount,
        topicEmbeddingModel: embeddingModel,
        topicEmbeddingUpdatedAt: embeddingUpdatedAt,

        topicConceptEmbeddingCentroid: conceptCentroid,
        topicConceptEmbeddingCount: nextConceptEmbeddingCount,
        topicConceptEmbeddingModel: embeddingModel,
        topicConceptEmbeddingUpdatedAt: embeddingUpdatedAt,

        learningPatternEmbeddingCentroid: learningPatternCentroid,
        learningPatternEmbeddingCount: nextLearningPatternEmbeddingCount,
        learningPatternEmbeddingModel: embeddingModel,
        learningPatternEmbeddingUpdatedAt: embeddingUpdatedAt,
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

          /**
           * Qdrant gets the concept embedding because Qdrant is currently part of
           * semantic topic routing/layout, not learning-pattern matching.
           */
          topicEmbeddingCentroid: conceptCentroid,
          topicEmbeddingCount: nextConceptEmbeddingCount,
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
        concept_vector_size: conceptCentroid.length,
        learning_pattern_vector_size: learningPatternCentroid.length,
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
        concept_vector_size: null,
        learning_pattern_vector_size: null,
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