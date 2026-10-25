/**
 * MyWay V3.7B.1: experimental Supabase semantic-search adapter.
 * INTENTIONALLY NOT CONNECTED to active production/sandbox message routes.
 * Always use the guarded server client; never expose service-role keys to browsers.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SandboxVectorKind = "label" | "message";
export interface SandboxTopicMatch {
  topicId: string;
  topicLabel: string;
  embeddingModel: string;
  similarity: number;
}

export async function searchSandboxTopics(input: {
  vector: number[];
  kind: SandboxVectorKind;
  embeddingModel: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<SandboxTopicMatch[]> {
  const { vector, kind, embeddingModel } = input;
  if (!Array.isArray(vector) || vector.length !== 384 || vector.some(v => !Number.isFinite(v))) {
    throw new Error("V3.7B.1: query embedding must contain exactly 384 finite numbers.");
  }
  if (kind !== "label" && kind !== "message") throw new Error("V3.7B.1: invalid embedding kind.");
  if (typeof embeddingModel !== "string" || !embeddingModel.trim()) {
    throw new Error("V3.7B.1: embedding model identity is required.");
  }
  const limit = input.limit ?? 10;
  const minSimilarity = input.minSimilarity ?? -1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1) {
    throw new Error("V3.7B.1: invalid retrieval parameters.");
  }
  // Guard in createServerSupabaseClient rejects original project credentials.
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("myway_match_topics", {
    p_query: vector,
    p_kind: kind,
    p_model: embeddingModel,
    p_limit: limit,
    p_min_similarity: minSimilarity,
  });
  if (error) throw new Error(`V3.7B.1 Supabase topic-search failure: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("V3.7B.1: unexpected Supabase result shape.");
  return data.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    if (typeof r.topic_id !== "string" || typeof r.topic_label !== "string" ||
        typeof r.embedding_model !== "string" || typeof r.similarity !== "number" || !Number.isFinite(r.similarity)) {
      throw new Error("V3.7B.1: malformed search result.");
    }
    return { topicId: r.topic_id, topicLabel: r.topic_label, embeddingModel: r.embedding_model, similarity: r.similarity };
  });
}
