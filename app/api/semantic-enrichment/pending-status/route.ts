import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

const LAYOUT_COMMIT_EPSILON = 0.035;

function hasTopicLabelEmbedding(row: {
  topic_label_embedding_centroid: unknown;
  topic_label_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_label_embedding_centroid) &&
    row.topic_label_embedding_centroid.length > 0 &&
    row.topic_label_embedding_count > 0
  );
}

function hasTopicMessageEmbedding(row: {
  topic_message_embedding_centroid: unknown;
  topic_message_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_message_embedding_centroid) &&
    row.topic_message_embedding_centroid.length > 0 &&
    row.topic_message_embedding_count > 0
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedSemanticStatus(
  row: TopicStateRow,
): Record<string, unknown> | null {
  const topicJson = asRecord(row.topic_json);
  if (!topicJson) return null;

  return asRecord(topicJson.semantic_enrichment_status);
}

function getPendingTopicMessageEmbeddings(row: TopicStateRow) {
  const topicJson = asRecord(row.topic_json);
  const rawQueue = topicJson?.pending_topic_message_embeddings;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue.filter((item) => {
    const candidate = asRecord(item);

    return Boolean(
      candidate &&
        typeof candidate.message_id === "string" &&
        candidate.message_id.trim() &&
        typeof candidate.text === "string" &&
        candidate.text.trim(),
    );
  });
}

function getPendingConfusionInsightScores(row: TopicStateRow) {
  const topicJson = asRecord(row.topic_json);
  const rawQueue = topicJson?.pending_confusion_insight_scores;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue.filter((item) => {
    const candidate = asRecord(item);

    return Boolean(
      candidate &&
        typeof candidate.score_id === "string" &&
        candidate.score_id.trim() &&
        typeof candidate.text === "string" &&
        candidate.text.trim(),
    );
  });
}

function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getLayoutCommitDistance(row: TopicStateRow) {
  if (!row.topic_position || !row.semantic_position) return null;

  const distance = distanceBetween(row.topic_position, row.semantic_position);

  return Number.isFinite(distance) ? distance : null;
}

function needsLayoutCommit(row: TopicStateRow) {
  const distance = getLayoutCommitDistance(row);

  return distance !== null && distance > LAYOUT_COMMIT_EPSILON;
}

function shouldEnrichTopic(row: TopicStateRow) {
  const hasLabelEmbedding = hasTopicLabelEmbedding(row);
  const hasMessageEmbedding = hasTopicMessageEmbedding(row);

  if (row.needs_embedding_centroid) return true;
  if (row.should_schedule_enrichment) return true;

  const nestedStatus = getNestedSemanticStatus(row);

  if (
    nestedStatus?.needs_embedding_centroid === true ||
    nestedStatus?.should_schedule_enrichment === true ||
    nestedStatus?.status === "skipped_for_fast_model_route"
  ) {
    return true;
  }

  return !hasLabelEmbedding || !hasMessageEmbedding;
}

export async function GET() {
  try {
    const rows = await getLatestTopicState();
    const pendingRows = rows.filter(shouldEnrichTopic);
    const pendingMessageEmbeddingRows = rows.filter(
      (row) => getPendingTopicMessageEmbeddings(row).length > 0,
    );
    const pendingConfusionInsightRows = rows.filter(
      (row) => getPendingConfusionInsightScores(row).length > 0,
    );
    const pendingLayoutCommitRows = rows.filter(needsLayoutCommit);

    const pendingTopicMessageEmbeddingItemsFound =
      pendingMessageEmbeddingRows.reduce(
        (sum, row) => sum + getPendingTopicMessageEmbeddings(row).length,
        0,
      );

    const pendingConfusionInsightItemsFound = pendingConfusionInsightRows.reduce(
      (sum, row) => sum + getPendingConfusionInsightScores(row).length,
      0,
    );

    return NextResponse.json({
      ok: true,
      route: "GET /api/semantic-enrichment/pending-status",
      total_topics_seen: rows.length,

      pending_topics_found: pendingRows.length,
      pending_topic_message_embedding_topics_found:
        pendingMessageEmbeddingRows.length,
      pending_topic_message_embedding_items_found:
        pendingTopicMessageEmbeddingItemsFound,
      pending_confusion_insight_topics_found: pendingConfusionInsightRows.length,
      pending_confusion_insight_items_found: pendingConfusionInsightItemsFound,

      /**
       * Used by the local worker to avoid calling commit-pending every cycle.
       * The commit route itself remains authoritative, but this cheap summary
       * lets the worker skip needless POSTs when no topic_position actually
       * needs to move to semantic_position.
       */
      pending_layout_commit_topics_found: pendingLayoutCommitRows.length,
      pending_layout_commit_epsilon: LAYOUT_COMMIT_EPSILON,

      pending_work_found:
        pendingRows.length +
        pendingTopicMessageEmbeddingItemsFound +
        pendingConfusionInsightItemsFound +
        pendingLayoutCommitRows.length,

      pending_topics: pendingRows.slice(0, 10).map((row) => {
        const hasLabelEmbedding = hasTopicLabelEmbedding(row);
        const hasMessageEmbedding = hasTopicMessageEmbedding(row);
        const pendingTopicMessageEmbeddings =
          getPendingTopicMessageEmbeddings(row);

        return {
          topic_id: row.topic_id,
          topic_label: row.topic_label,

          semantic_enrichment_status: row.semantic_enrichment_status,
          needs_embedding_centroid: row.needs_embedding_centroid,
          should_schedule_enrichment: row.should_schedule_enrichment,
          layout_status: row.layout_status,
          embedding_skip_reason: row.embedding_skip_reason,

          topic_label_embedding_count: row.topic_label_embedding_count,
          topic_message_embedding_count: row.topic_message_embedding_count,

          has_topic_label_embedding: hasLabelEmbedding,
          has_topic_message_embedding: hasMessageEmbedding,

          pending_topic_message_embedding_count:
            pendingTopicMessageEmbeddings.length,
          pending_confusion_insight_count:
            getPendingConfusionInsightScores(row).length,
          pending_layout_commit: needsLayoutCommit(row),
          layout_commit_distance: getLayoutCommitDistance(row),

          missing_canonical_embeddings: {
            topic_label_embedding: !hasLabelEmbedding,
            topic_message_embedding: !hasMessageEmbedding,
          },
        };
      }),

      pending_topic_message_embedding_topics: pendingMessageEmbeddingRows
        .slice(0, 10)
        .map((row) => ({
          topic_id: row.topic_id,
          topic_label: row.topic_label,
          pending_topic_message_embedding_count:
            getPendingTopicMessageEmbeddings(row).length,
          topic_message_embedding_count: row.topic_message_embedding_count,
          topic_message_embedding_updated_at:
            row.topic_message_embedding_updated_at,
        })),

      pending_confusion_insight_topics: pendingConfusionInsightRows
        .slice(0, 10)
        .map((row) => ({
          topic_id: row.topic_id,
          topic_label: row.topic_label,
          pending_confusion_insight_count:
            getPendingConfusionInsightScores(row).length,
          confusion: row.confusion,
          insight: row.insight,
        })),

      pending_layout_commit_topics: pendingLayoutCommitRows
        .slice(0, 10)
        .map((row) => ({
          topic_id: row.topic_id,
          topic_label: row.topic_label,
          topic_position: row.topic_position,
          semantic_position: row.semantic_position,
          layout_commit_distance: getLayoutCommitDistance(row),
          semantic_position_method: row.semantic_position_method,
          semantic_position_updated_at: row.semantic_position_updated_at,
        })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "GET /api/semantic-enrichment/pending-status",
        error:
          error instanceof Error
            ? error.message
            : "Unknown pending-status error",
      },
      { status: 500 },
    );
  }
}
