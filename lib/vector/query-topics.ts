import { qdrant, TOPIC_COLLECTION } from "@/lib/vector/qdrant";
import { embedText } from "@/lib/vector/embed";
import type { VectorInfo } from "@/types/contracts";

type QdrantTopicPayload = {
  topic_id?: unknown;
  topic_name?: unknown;
  diagnosis?: unknown;
  next_step?: unknown;
  updated_at?: unknown;
  embedding_text?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

export async function querySemanticTopicCandidates(
  message: string,
  limit = 5
): Promise<VectorInfo> {
  if (typeof message !== "string" || !message.trim()) {
    return {
      top_k_topic_names: [],
      top_k_topic_ids: [],
      top_k_similarity_scores: [],
    };
  }

  const vector = await embedText(message);

  const result = await qdrant.query(TOPIC_COLLECTION, {
    query: vector,
    limit,
    with_payload: true,
  });

  const top_k_topic_names: string[] = [];
  const top_k_topic_ids: string[] = [];
  const top_k_similarity_scores: number[] = [];

  const points = Array.isArray(result.points) ? result.points : [];

  for (const point of points) {
    const payload = (point.payload ?? {}) as QdrantTopicPayload;

    const topicId = asString(payload.topic_id);
    const topicName = asString(payload.topic_name);
    const score = asNumber(point.score);

    if (!topicId) {
      continue;
    }

    top_k_topic_ids.push(topicId);
    top_k_topic_names.push(topicName ?? topicId);
    top_k_similarity_scores.push(score ?? 0);
  }

  return {
    top_k_topic_names,
    top_k_topic_ids,
    top_k_similarity_scores,
  };
}