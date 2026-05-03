import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EmbeddingVector } from "@/types/contracts";

function asNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" && value.trim() ? value : fallback;
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

function readFromTopicJson<T>(
  topicJson: Record<string, unknown> | null | undefined,
  key: string,
): T | null {
  if (!topicJson || typeof topicJson !== "object") return null;
  return (topicJson[key] as T | undefined) ?? null;
}

export type TopicStateRow = {
  topic_id: string;
  updated_at: string;
  last_run_id: string | null;
  topic_name: string;
  confusion: number | null;
  insight: number | null;
  learning_score: number | null;
  diagnosis: string | null;
  next_step: string | null;
  topic_json: Record<string, unknown> | null;

  /**
   * Semantic topic-routing centroid.
   * This is separate from the visual 3D topic_centroid/position.
   */
  topic_embedding_centroid: EmbeddingVector | null;
  topic_embedding_count: number;
  topic_embedding_model: string | null;
  topic_embedding_updated_at: string | null;
};

type RawTopicStateRow = {
  topic_id: string;
  updated_at: string;
  last_run_id: string | null;
  topic_name: string;
  confusion: number | null;
  insight: number | null;
  learning_score: number | null;
  diagnosis: string | null;
  next_step: string | null;
  topic_json: Record<string, unknown> | null;

  topic_embedding_centroid?: unknown;
  topic_embedding_count?: unknown;
  topic_embedding_model?: unknown;
  topic_embedding_updated_at?: unknown;
};

function normalizeTopicStateRow(row: RawTopicStateRow): TopicStateRow {
  const topicJson = row.topic_json;

  const centroidFromColumn = asEmbeddingVector(row.topic_embedding_centroid);
  const centroidFromJson = asEmbeddingVector(
    readFromTopicJson(topicJson, "topic_embedding_centroid"),
  );

  const countFromColumn = asNumber(row.topic_embedding_count, null);
  const countFromJson = asNumber(
    readFromTopicJson(topicJson, "topic_embedding_count"),
    null,
  );

  const modelFromColumn = asString(row.topic_embedding_model, null);
  const modelFromJson = asString(
    readFromTopicJson(topicJson, "topic_embedding_model"),
    null,
  );

  const updatedAtFromColumn = asString(row.topic_embedding_updated_at, null);
  const updatedAtFromJson = asString(
    readFromTopicJson(topicJson, "topic_embedding_updated_at"),
    null,
  );

  return {
    topic_id: row.topic_id,
    updated_at: row.updated_at,
    last_run_id: row.last_run_id,
    topic_name: row.topic_name,
    confusion: row.confusion,
    insight: row.insight,
    learning_score: row.learning_score,
    diagnosis: row.diagnosis,
    next_step: row.next_step,
    topic_json: row.topic_json,

    topic_embedding_centroid: centroidFromColumn ?? centroidFromJson,
    topic_embedding_count: Math.max(0, countFromColumn ?? countFromJson ?? 0),
    topic_embedding_model: modelFromColumn ?? modelFromJson,
    topic_embedding_updated_at: updatedAtFromColumn ?? updatedAtFromJson,
  };
}

export async function getLatestTopicState(): Promise<TopicStateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("topic_state")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read topic_state: ${error.message}`);
  }

  return ((data ?? []) as RawTopicStateRow[]).map(normalizeTopicStateRow);
}