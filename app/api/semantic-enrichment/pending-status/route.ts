import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

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

    const pendingTopicMessageEmbeddingItemsFound =
      pendingMessageEmbeddingRows.reduce(
        (sum, row) => sum + getPendingTopicMessageEmbeddings(row).length,
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
      pending_work_found:
        pendingRows.length + pendingTopicMessageEmbeddingItemsFound,

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
