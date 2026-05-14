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

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

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

function hasTopicLabelEmbedding(row: {
  topic_label_embedding_centroid: EmbeddingVector | null;
  topic_label_embedding_count: number;
}) {
  return hasVector(
    row.topic_label_embedding_centroid,
    row.topic_label_embedding_count,
  );
}

function hasTopicMessageEmbedding(row: {
  topic_message_embedding_centroid: EmbeddingVector | null;
  topic_message_embedding_count: number;
}) {
  return hasVector(
    row.topic_message_embedding_centroid,
    row.topic_message_embedding_count,
  );
}

function hasLegacyTopicEmbedding(row: {
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
}) {
  return hasVector(row.topic_embedding_centroid, row.topic_embedding_count);
}

function getTopicJson(row: { topic_json: Record<string, unknown> | null }) {
  return isJsonObject(row.topic_json) ? row.topic_json : {};
}

function getNestedSemanticStatus(
  topicJson: Record<string, unknown> | null,
): JsonObject | null {
  const json = isJsonObject(topicJson) ? topicJson : {};
  const nested = json.semantic_enrichment_status;

  return isJsonObject(nested) ? nested : null;
}

function shouldEnrichTopic(row: TopicStateRow) {
  const topicJson = getTopicJson(row);
  const nestedStatus = getNestedSemanticStatus(row.topic_json);

  const explicitNeedsCentroid =
    asBoolean(topicJson.needs_embedding_centroid, false) ||
    asBoolean(nestedStatus?.needs_embedding_centroid, false);

  const explicitSchedule =
    asBoolean(topicJson.should_schedule_enrichment, false) ||
    asBoolean(nestedStatus?.should_schedule_enrichment, false);

  const wasSkippedForFastRoute =
    asString(nestedStatus?.status) === "skipped_for_fast_model_route";

  /**
   * Canonical enrichment requirement:
   * - topic_label_embedding_* powers layout / Qdrant topic lookup.
   * - topic_message_embedding_* preserves learner-message pattern evidence.
   *
   * Legacy topic_embedding_* is still mirrored when we write, but missing legacy
   * fields should not by themselves make a topic pending.
   */
  return (
    explicitNeedsCentroid ||
    explicitSchedule ||
    wasSkippedForFastRoute ||
    !hasTopicLabelEmbedding(row) ||
    !hasTopicMessageEmbedding(row)
  );
}

function buildEnrichmentPrompt(row: {
  topic_name: string;
  topic_json: Record<string, unknown> | null;
}) {
  const topicJson = getTopicJson(row);

  const storedPrompt = asString(topicJson.semantic_enrichment_prompt_text);

  if (storedPrompt) return storedPrompt;

  const nestedStatus = getNestedSemanticStatus(row.topic_json);
  const nestedPrompt = nestedStatus
    ? asString(nestedStatus.enrichment_prompt_text)
    : null;

  if (nestedPrompt) return nestedPrompt;

  return `Topic: ${row.topic_name}`;
}

function buildTopicLabelEmbeddingText(row: { topic_name: string }) {
  return row.topic_name.trim();
}

function buildTopicMessageEmbeddingText(args: {
  topicName: string;
  enrichmentPromptText: string;
}) {
  return [
    `Topic message pattern for topic ${args.topicName}:`,
    args.enrichmentPromptText,
  ].join("\n");
}

function buildUpdatedTopicJson(args: {
  topicJson: Record<string, unknown> | null;

  topicLabelCentroid: EmbeddingVector;
  topicMessageCentroid: EmbeddingVector;

  embeddingModel: string;
  embeddingUpdatedAt: string;

  topicLabelEmbeddingText: string;
  topicMessageEmbeddingText: string;
  enrichmentPromptText: string;

  nextTopicLabelEmbeddingCount: number;
  nextTopicMessageEmbeddingCount: number;
}) {
  const {
    topicJson,
    topicLabelCentroid,
    topicMessageCentroid,
    embeddingModel,
    embeddingUpdatedAt,
    topicLabelEmbeddingText,
    topicMessageEmbeddingText,
    enrichmentPromptText,
    nextTopicLabelEmbeddingCount,
    nextTopicMessageEmbeddingCount,
  } = args;

  const base = getTopicJson({ topic_json: topicJson });

  return {
    ...base,

    semantic_enrichment_status: {
      status: "centroid_ready",
      needs_embedding_centroid: false,
      centroid_source: "topic_label_and_message_embedding_v1",
      embedding_skip_reason: null,
      layout_status: "semantic_position_ready",
      should_schedule_enrichment: false,
      enrichment_prompt_text: enrichmentPromptText,

      topic_label_embedding_source: "topic_label_only_v1",
      topic_message_embedding_source: "topic_message_enrichment_prompt_text_v1",

      /**
       * Legacy migration note.
       *
       * topic_embedding_* and topic_concept_embedding_* mirror
       * topic_label_embedding_* during migration.
       * learning_pattern_embedding_* mirrors topic_message_embedding_*.
       */
      legacy_aliases_written: true,
    },

    needs_embedding_centroid: false,
    embedding_skip_reason: null,
    layout_status: "semantic_position_ready",
    should_schedule_enrichment: false,
    semantic_enrichment_prompt_text: enrichmentPromptText,

    /**
     * Debug/source texts.
     */
    topic_label_embedding_text: topicLabelEmbeddingText,
    topic_message_embedding_text: topicMessageEmbeddingText,

    /**
     * Canonical topic-label embedding.
     */
    topic_label_embedding_centroid: topicLabelCentroid,
    topic_label_embedding_count: nextTopicLabelEmbeddingCount,
    topic_label_embedding_model: embeddingModel,
    topic_label_embedding_updated_at: embeddingUpdatedAt,

    /**
     * Canonical topic-message embedding.
     */
    topic_message_embedding_centroid: topicMessageCentroid,
    topic_message_embedding_count: nextTopicMessageEmbeddingCount,
    topic_message_embedding_model: embeddingModel,
    topic_message_embedding_updated_at: embeddingUpdatedAt,

    /**
     * Legacy/general embedding fields.
     * For compatibility, these mirror topic-label embedding.
     */
    topic_embedding_centroid: topicLabelCentroid,
    topic_embedding_count: nextTopicLabelEmbeddingCount,
    topic_embedding_model: embeddingModel,
    topic_embedding_updated_at: embeddingUpdatedAt,

    /**
     * Legacy alias for topic_label_embedding_*.
     */
    topic_concept_embedding_centroid: topicLabelCentroid,
    topic_concept_embedding_count: nextTopicLabelEmbeddingCount,
    topic_concept_embedding_model: embeddingModel,
    topic_concept_embedding_updated_at: embeddingUpdatedAt,

    /**
     * Legacy alias for topic_message_embedding_*.
     */
    learning_pattern_embedding_centroid: topicMessageCentroid,
    learning_pattern_embedding_count: nextTopicMessageEmbeddingCount,
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
    topic_label_vector_size: number | null;
    topic_message_vector_size: number | null;
    had_legacy_topic_embedding_before: boolean;
    qdrant_sync_ok: boolean | null;
    qdrant_sync_error: string | null;
  }> = [];

  for (const row of pendingRows) {
    try {
      const enrichmentPromptText = buildEnrichmentPrompt(row);

      const topicLabelEmbeddingText = buildTopicLabelEmbeddingText({
        topic_name: row.topic_name,
      });

      const topicMessageEmbeddingText = buildTopicMessageEmbeddingText({
        topicName: row.topic_name,
        enrichmentPromptText,
      });

      const [topicLabelEmbeddingResult, topicMessageEmbeddingResult] =
        await embedTexts([topicLabelEmbeddingText, topicMessageEmbeddingText]);

      const topicLabelCentroid = asEmbeddingVector(topicLabelEmbeddingResult);
      const topicMessageCentroid = asEmbeddingVector(
        topicMessageEmbeddingResult,
      );

      if (!topicLabelCentroid) {
        results.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          status: "error",
          reason: "topic_label_embedding_result_missing_or_invalid_vector",
          embedding_model: null,
          topic_label_vector_size: null,
          topic_message_vector_size: null,
          had_legacy_topic_embedding_before: hasLegacyTopicEmbedding(row),
          qdrant_sync_ok: null,
          qdrant_sync_error: null,
        });

        continue;
      }

      if (!topicMessageCentroid) {
        results.push({
          topic_id: row.topic_id,
          topic_name: row.topic_name,
          status: "error",
          reason: "topic_message_embedding_result_missing_or_invalid_vector",
          embedding_model: null,
          topic_label_vector_size: topicLabelCentroid.length,
          topic_message_vector_size: null,
          had_legacy_topic_embedding_before: hasLegacyTopicEmbedding(row),
          qdrant_sync_ok: null,
          qdrant_sync_error: null,
        });

        continue;
      }

      const embeddingModel = "local-embedding-service";
      const embeddingUpdatedAt = nowIso();

      const nextTopicLabelEmbeddingCount = Math.max(
        1,
        row.topic_label_embedding_count || row.topic_embedding_count || 0,
      );

      const nextTopicMessageEmbeddingCount = Math.max(
        1,
        row.topic_message_embedding_count || 0,
      );

      const updatedTopicJson = buildUpdatedTopicJson({
        topicJson: row.topic_json,

        topicLabelCentroid,
        topicMessageCentroid,

        embeddingModel,
        embeddingUpdatedAt,

        topicLabelEmbeddingText,
        topicMessageEmbeddingText,
        enrichmentPromptText,

        nextTopicLabelEmbeddingCount,
        nextTopicMessageEmbeddingCount,
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
         * Canonical topic-label embedding.
         */
        topicLabelEmbeddingCentroid: topicLabelCentroid,
        topicLabelEmbeddingCount: nextTopicLabelEmbeddingCount,
        topicLabelEmbeddingModel: embeddingModel,
        topicLabelEmbeddingUpdatedAt: embeddingUpdatedAt,

        /**
         * Canonical topic-message embedding.
         */
        topicMessageEmbeddingCentroid: topicMessageCentroid,
        topicMessageEmbeddingCount: nextTopicMessageEmbeddingCount,
        topicMessageEmbeddingModel: embeddingModel,
        topicMessageEmbeddingUpdatedAt: embeddingUpdatedAt,

        /**
         * Legacy/general embedding mirrors topic-label embedding for compatibility.
         */
        topicEmbeddingCentroid: topicLabelCentroid,
        topicEmbeddingCount: nextTopicLabelEmbeddingCount,
        topicEmbeddingModel: embeddingModel,
        topicEmbeddingUpdatedAt: embeddingUpdatedAt,

        /**
         * Legacy aliases during migration.
         */
        topicConceptEmbeddingCentroid: topicLabelCentroid,
        topicConceptEmbeddingCount: nextTopicLabelEmbeddingCount,
        topicConceptEmbeddingModel: embeddingModel,
        topicConceptEmbeddingUpdatedAt: embeddingUpdatedAt,

        learningPatternEmbeddingCentroid: topicMessageCentroid,
        learningPatternEmbeddingCount: nextTopicMessageEmbeddingCount,
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
           * Qdrant gets the topic-label embedding because Qdrant is currently part of
           * semantic topic lookup/layout, not topic-message matching.
           */
          topicLabelEmbeddingCentroid: topicLabelCentroid,
          topicLabelEmbeddingCount: nextTopicLabelEmbeddingCount,
          topicLabelEmbeddingModel: embeddingModel,
          topicLabelEmbeddingUpdatedAt: embeddingUpdatedAt,

          /**
           * Compatibility alias while Qdrant/vector helpers migrate.
           */
          topicEmbeddingCentroid: topicLabelCentroid,
          topicEmbeddingCount: nextTopicLabelEmbeddingCount,
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
        topic_label_vector_size: topicLabelCentroid.length,
        topic_message_vector_size: topicMessageCentroid.length,
        had_legacy_topic_embedding_before: hasLegacyTopicEmbedding(row),
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
        topic_label_vector_size: null,
        topic_message_vector_size: null,
        had_legacy_topic_embedding_before: hasLegacyTopicEmbedding(row),
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