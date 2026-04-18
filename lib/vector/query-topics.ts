import { embedText } from "@/lib/vector/embed";
import { qdrant, TOPIC_COLLECTION } from "@/lib/vector/qdrant";
import type { VectorInfo } from "@/types/contracts";

type QdrantTopicPayload = {
  topic_id?: string;
  topic_name?: string;
};

export async function querySemanticTopicCandidates(
  message: string,
  limit = 5
): Promise<VectorInfo> {
  const vector = await embedText(message);

  const results = await qdrant.query(TOPIC_COLLECTION, {
    query: vector,
    limit,
    with_payload: true,
  });

  const topicNames: string[] = [];
  const topicIds: string[] = [];
  const scores: number[] = [];

  for (const item of results.points ?? []) {
    const payload = (item.payload ?? {}) as QdrantTopicPayload;

    if (typeof payload.topic_id === "string") {
      topicIds.push(payload.topic_id);
      topicNames.push(
        typeof payload.topic_name === "string" ? payload.topic_name : payload.topic_id
      );
      scores.push(typeof item.score === "number" ? item.score : 0);
    }
  }

  return {
    top_k_topic_names: topicNames,
    top_k_topic_ids: topicIds,
    top_k_similarity_scores: scores,
  };
}