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

function getNestedSemanticStatus(row: TopicStateRow): Record<string, unknown> | null {
  const topicJson = row.topic_json;

  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  const semanticStatus = topicJson.semantic_enrichment_status;

  if (
    semanticStatus &&
    typeof semanticStatus === "object" &&
    !Array.isArray(semanticStatus)
  ) {
    return semanticStatus as Record<string, unknown>;
  }

  return null;
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

  /**
   * Wave 2 canonical enrichment requirement.
   *
   * topic_label_embedding_* powers label/layout/Qdrant topic structure.
   * topic_message_embedding_* stores learner-message pattern evidence.
   *
   * topic_embedding_* has been removed and should not participate in pending
   * status anymore.
   */
  return !hasLabelEmbedding || !hasMessageEmbedding;
}

export async function GET() {
  try {
    const rows = await getLatestTopicState();
    const pendingRows = rows.filter(shouldEnrichTopic);

    return NextResponse.json({
      ok: true,
      route: "GET /api/semantic-enrichment/pending-status",
      total_topics_seen: rows.length,
      pending_topics_found: pendingRows.length,
      pending_topics: pendingRows.slice(0, 10).map((row) => {
        const hasLabelEmbedding = hasTopicLabelEmbedding(row);
        const hasMessageEmbedding = hasTopicMessageEmbedding(row);

        return {
          topic_id: row.topic_id,
          topic_name: row.topic_name,

          semantic_enrichment_status: row.semantic_enrichment_status,
          needs_embedding_centroid: row.needs_embedding_centroid,
          should_schedule_enrichment: row.should_schedule_enrichment,
          layout_status: row.layout_status,
          embedding_skip_reason: row.embedding_skip_reason,

          topic_label_embedding_count: row.topic_label_embedding_count,
          topic_message_embedding_count: row.topic_message_embedding_count,

          has_topic_label_embedding: hasLabelEmbedding,
          has_topic_message_embedding: hasMessageEmbedding,

          missing_canonical_embeddings: {
            topic_label_embedding: !hasLabelEmbedding,
            topic_message_embedding: !hasMessageEmbedding,
          },
        };
      }),
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
