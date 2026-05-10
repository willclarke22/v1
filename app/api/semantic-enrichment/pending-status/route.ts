import { NextResponse } from "next/server";
import { getLatestTopicState } from "@/lib/persistence/read";

function hasEmbeddingCentroid(row: {
  topic_embedding_centroid: unknown;
  topic_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_embedding_centroid) &&
    row.topic_embedding_centroid.length > 0 &&
    row.topic_embedding_count > 0
  );
}

function shouldEnrichTopic(row: Awaited<ReturnType<typeof getLatestTopicState>>[number]) {
  if (hasEmbeddingCentroid(row)) return false;

  if (row.needs_embedding_centroid) return true;
  if (row.should_schedule_enrichment) return true;

  const topicJson = row.topic_json;
  if (!topicJson || typeof topicJson !== "object") return false;

  const semanticStatus = topicJson.semantic_enrichment_status;

  if (semanticStatus && typeof semanticStatus === "object") {
    const statusObject = semanticStatus as Record<string, unknown>;

    return (
      statusObject.needs_embedding_centroid === true ||
      statusObject.should_schedule_enrichment === true ||
      statusObject.status === "skipped_for_fast_model_route"
    );
  }

  return false;
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
      pending_topics: pendingRows.slice(0, 10).map((row) => ({
        topic_id: row.topic_id,
        topic_name: row.topic_name,
        semantic_enrichment_status: row.semantic_enrichment_status,
        needs_embedding_centroid: row.needs_embedding_centroid,
        should_schedule_enrichment: row.should_schedule_enrichment,
        topic_embedding_count: row.topic_embedding_count,
        has_embedding_centroid: hasEmbeddingCentroid(row),
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