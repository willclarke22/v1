import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EmbeddingVector } from "@/types/contracts";

export type TopicPosition = [number, number, number];

function asNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asBoolean(
  value: unknown,
  fallback: boolean | null = null,
): boolean | null {
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

function asTopicPosition(value: unknown): TopicPosition | null {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (vector.length !== 3) return null;

  return [vector[0], vector[1], vector[2]];
}

function readFromTopicJson<T>(
  topicJson: Record<string, unknown> | null | undefined,
  key: string,
): T | null {
  if (!topicJson || typeof topicJson !== "object") return null;
  return (topicJson[key] as T | undefined) ?? null;
}

function readSemanticStatusFromTopicJson(
  topicJson: Record<string, unknown> | null | undefined,
): string | null {
  const topLevel = asString(
    readFromTopicJson(topicJson, "semantic_enrichment_status"),
  );

  if (topLevel) return topLevel;

  const nested = readFromTopicJson<Record<string, unknown>>(
    topicJson,
    "semantic_enrichment_status",
  );

  if (!nested || typeof nested !== "object") return null;

  return asString(nested.status);
}

function readNestedSemanticString(
  topicJson: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const topLevel = asString(readFromTopicJson(topicJson, key));

  if (topLevel) return topLevel;

  const nested = readFromTopicJson<Record<string, unknown>>(
    topicJson,
    "semantic_enrichment_status",
  );

  if (!nested || typeof nested !== "object") return null;

  return asString(nested[key]);
}

function readNestedSemanticBoolean(
  topicJson: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  const topLevel = asBoolean(readFromTopicJson(topicJson, key));

  if (topLevel !== null) return topLevel;

  const nested = readFromTopicJson<Record<string, unknown>>(
    topicJson,
    "semantic_enrichment_status",
  );

  if (!nested || typeof nested !== "object") return null;

  return asBoolean(nested[key]);
}

function readPositionFromTopicJson(
  topicJson: Record<string, unknown> | null | undefined,
): TopicPosition | null {
  return (
    asTopicPosition(readFromTopicJson(topicJson, "topic_position")) ??
    asTopicPosition(readFromTopicJson(topicJson, "position")) ??
    asTopicPosition(readFromTopicJson(topicJson, "topic_centroid"))
  );
}

function readSemanticPositionFromTopicJson(
  topicJson: Record<string, unknown> | null | undefined,
): TopicPosition | null {
  return (
    asTopicPosition(readFromTopicJson(topicJson, "semantic_position")) ??
    asTopicPosition(readFromTopicJson(topicJson, "semantic_target_position")) ??
    asTopicPosition(
      readFromTopicJson(topicJson, "learning_space_target_position"),
    )
  );
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

  topic_position: TopicPosition | null;
  topic_position_x: number | null;
  topic_position_y: number | null;
  topic_position_z: number | null;

  semantic_position: TopicPosition | null;
  semantic_position_x: number | null;
  semantic_position_y: number | null;
  semantic_position_z: number | null;
  semantic_position_updated_at: string | null;
  semantic_position_method: string | null;

  semantic_enrichment_status: string | null;
  needs_embedding_centroid: boolean;
  should_schedule_enrichment: boolean;
  semantic_enrichment_prompt_text: string | null;
  layout_status: string | null;
  embedding_skip_reason: string | null;

  /**
   * Canonical embedding of the clean topic label.
   * Used for semantic 3D topic layout and Qdrant topic lookup.
   */
  topic_label_embedding_centroid: EmbeddingVector | null;
  topic_label_embedding_count: number;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;

  /**
   * Canonical topic-level embedding of learner messages assigned to this topic.
   * Used later for personalization / struggle-pattern similarity.
   */
  topic_message_embedding_centroid: EmbeddingVector | null;
  topic_message_embedding_count: number;
  topic_message_embedding_model: string | null;
  topic_message_embedding_updated_at: string | null;
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
  topic_json?: Record<string, unknown> | null;

  topic_position_x?: unknown;
  topic_position_y?: unknown;
  topic_position_z?: unknown;

  semantic_position_x?: unknown;
  semantic_position_y?: unknown;
  semantic_position_z?: unknown;
  semantic_position_updated_at?: unknown;
  semantic_position_method?: unknown;

  semantic_enrichment_status?: unknown;
  needs_embedding_centroid?: unknown;
  should_schedule_enrichment?: unknown;
  semantic_enrichment_prompt_text?: unknown;
  layout_status?: unknown;
  embedding_skip_reason?: unknown;

  topic_label_embedding_centroid?: unknown;
  topic_label_embedding_count?: unknown;
  topic_label_embedding_model?: unknown;
  topic_label_embedding_updated_at?: unknown;

  topic_message_embedding_centroid?: unknown;
  topic_message_embedding_count?: unknown;
  topic_message_embedding_model?: unknown;
  topic_message_embedding_updated_at?: unknown;
};

function normalizeTopicStateRow(row: RawTopicStateRow): TopicStateRow {
  const topicJson = row.topic_json ?? null;

  const labelCentroidFromColumn = asEmbeddingVector(
    row.topic_label_embedding_centroid,
  );
  const labelCentroidFromJson = asEmbeddingVector(
    readFromTopicJson(topicJson, "topic_label_embedding_centroid"),
  );

  const labelCountFromColumn = asNumber(row.topic_label_embedding_count, null);
  const labelCountFromJson = asNumber(
    readFromTopicJson(topicJson, "topic_label_embedding_count"),
    null,
  );

  const labelModelFromColumn = asString(row.topic_label_embedding_model, null);
  const labelModelFromJson = asString(
    readFromTopicJson(topicJson, "topic_label_embedding_model"),
    null,
  );

  const labelUpdatedAtFromColumn = asString(
    row.topic_label_embedding_updated_at,
    null,
  );
  const labelUpdatedAtFromJson = asString(
    readFromTopicJson(topicJson, "topic_label_embedding_updated_at"),
    null,
  );

  const messageCentroidFromColumn = asEmbeddingVector(
    row.topic_message_embedding_centroid,
  );
  const messageCentroidFromJson = asEmbeddingVector(
    readFromTopicJson(topicJson, "topic_message_embedding_centroid"),
  );

  const messageCountFromColumn = asNumber(
    row.topic_message_embedding_count,
    null,
  );
  const messageCountFromJson = asNumber(
    readFromTopicJson(topicJson, "topic_message_embedding_count"),
    null,
  );

  const messageModelFromColumn = asString(
    row.topic_message_embedding_model,
    null,
  );
  const messageModelFromJson = asString(
    readFromTopicJson(topicJson, "topic_message_embedding_model"),
    null,
  );

  const messageUpdatedAtFromColumn = asString(
    row.topic_message_embedding_updated_at,
    null,
  );
  const messageUpdatedAtFromJson = asString(
    readFromTopicJson(topicJson, "topic_message_embedding_updated_at"),
    null,
  );

  /**
   * Hard-cutover wave 2:
   * - topic_label_embedding_* is the only label/layout/Qdrant vector family.
   * - topic_message_embedding_* is the only learner-message vector family.
   * - topic_embedding_* is no longer read.
   */
  const labelCentroid = labelCentroidFromColumn ?? labelCentroidFromJson;
  const labelCount = labelCountFromColumn ?? labelCountFromJson ?? 0;
  const labelModel = labelModelFromColumn ?? labelModelFromJson;
  const labelUpdatedAt = labelUpdatedAtFromColumn ?? labelUpdatedAtFromJson;

  const messageCentroid = messageCentroidFromColumn ?? messageCentroidFromJson;
  const messageCount = messageCountFromColumn ?? messageCountFromJson ?? 0;
  const messageModel = messageModelFromColumn ?? messageModelFromJson;
  const messageUpdatedAt =
    messageUpdatedAtFromColumn ?? messageUpdatedAtFromJson;

  const positionXFromColumn = asNumber(row.topic_position_x, null);
  const positionYFromColumn = asNumber(row.topic_position_y, null);
  const positionZFromColumn = asNumber(row.topic_position_z, null);

  const positionFromColumns =
    positionXFromColumn !== null &&
    positionYFromColumn !== null &&
    positionZFromColumn !== null
      ? ([
          positionXFromColumn,
          positionYFromColumn,
          positionZFromColumn,
        ] as TopicPosition)
      : null;

  const positionFromJson = readPositionFromTopicJson(topicJson);
  const topicPosition = positionFromColumns ?? positionFromJson;

  const semanticPositionXFromColumn = asNumber(row.semantic_position_x, null);
  const semanticPositionYFromColumn = asNumber(row.semantic_position_y, null);
  const semanticPositionZFromColumn = asNumber(row.semantic_position_z, null);

  const semanticPositionFromColumns =
    semanticPositionXFromColumn !== null &&
    semanticPositionYFromColumn !== null &&
    semanticPositionZFromColumn !== null
      ? ([
          semanticPositionXFromColumn,
          semanticPositionYFromColumn,
          semanticPositionZFromColumn,
        ] as TopicPosition)
      : null;

  const semanticPositionFromJson = readSemanticPositionFromTopicJson(topicJson);
  const semanticPosition =
    semanticPositionFromColumns ?? semanticPositionFromJson;

  const semanticStatusFromColumn = asString(
    row.semantic_enrichment_status,
    null,
  );
  const semanticStatusFromJson = readSemanticStatusFromTopicJson(topicJson);

  const needsCentroidFromColumn = asBoolean(row.needs_embedding_centroid, null);
  const needsCentroidFromJson = readNestedSemanticBoolean(
    topicJson,
    "needs_embedding_centroid",
  );

  const shouldScheduleFromColumn = asBoolean(
    row.should_schedule_enrichment,
    null,
  );
  const shouldScheduleFromJson = readNestedSemanticBoolean(
    topicJson,
    "should_schedule_enrichment",
  );

  const promptFromColumn = asString(row.semantic_enrichment_prompt_text, null);
  const promptFromJson =
    readNestedSemanticString(topicJson, "enrichment_prompt_text") ??
    asString(
      readFromTopicJson(topicJson, "semantic_enrichment_prompt_text"),
      null,
    );

  const layoutStatusFromColumn = asString(row.layout_status, null);
  const layoutStatusFromJson = readNestedSemanticString(
    topicJson,
    "layout_status",
  );

  const skipReasonFromColumn = asString(row.embedding_skip_reason, null);
  const skipReasonFromJson = readNestedSemanticString(
    topicJson,
    "embedding_skip_reason",
  );

  const semanticPositionUpdatedAtFromColumn = asString(
    row.semantic_position_updated_at,
    null,
  );
  const semanticPositionUpdatedAtFromJson = asString(
    readFromTopicJson(topicJson, "semantic_position_updated_at"),
    null,
  );

  const semanticPositionMethodFromColumn = asString(
    row.semantic_position_method,
    null,
  );
  const semanticPositionMethodFromJson = asString(
    readFromTopicJson(topicJson, "semantic_position_method"),
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
    topic_json: topicJson,

    topic_position: topicPosition,
    topic_position_x: topicPosition?.[0] ?? null,
    topic_position_y: topicPosition?.[1] ?? null,
    topic_position_z: topicPosition?.[2] ?? null,

    semantic_position: semanticPosition,
    semantic_position_x: semanticPosition?.[0] ?? null,
    semantic_position_y: semanticPosition?.[1] ?? null,
    semantic_position_z: semanticPosition?.[2] ?? null,
    semantic_position_updated_at:
      semanticPositionUpdatedAtFromColumn ?? semanticPositionUpdatedAtFromJson,
    semantic_position_method:
      semanticPositionMethodFromColumn ?? semanticPositionMethodFromJson,

    semantic_enrichment_status:
      semanticStatusFromColumn ?? semanticStatusFromJson,
    needs_embedding_centroid:
      needsCentroidFromColumn ?? needsCentroidFromJson ?? false,
    should_schedule_enrichment:
      shouldScheduleFromColumn ?? shouldScheduleFromJson ?? false,
    semantic_enrichment_prompt_text: promptFromColumn ?? promptFromJson,
    layout_status: layoutStatusFromColumn ?? layoutStatusFromJson,
    embedding_skip_reason: skipReasonFromColumn ?? skipReasonFromJson,

    topic_label_embedding_centroid: labelCentroid,
    topic_label_embedding_count: Math.max(0, labelCount),
    topic_label_embedding_model: labelModel,
    topic_label_embedding_updated_at: labelUpdatedAt,

    topic_message_embedding_centroid: messageCentroid,
    topic_message_embedding_count: Math.max(0, messageCount),
    topic_message_embedding_model: messageModel,
    topic_message_embedding_updated_at: messageUpdatedAt,
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

export async function getRouteTopicState(): Promise<TopicStateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("topic_state")
    .select(
      `
      topic_id,
      updated_at,
      last_run_id,
      topic_name,
      confusion,
      insight,
      learning_score,
      diagnosis,
      next_step,
      topic_position_x,
      topic_position_y,
      topic_position_z,
      semantic_position_x,
      semantic_position_y,
      semantic_position_z,
      semantic_position_updated_at,
      semantic_position_method,
      semantic_enrichment_status,
      needs_embedding_centroid,
      should_schedule_enrichment,
      semantic_enrichment_prompt_text,
      layout_status,
      embedding_skip_reason,
      topic_label_embedding_centroid,
      topic_label_embedding_count,
      topic_label_embedding_model,
      topic_label_embedding_updated_at,
      topic_message_embedding_centroid,
      topic_message_embedding_count,
      topic_message_embedding_model,
      topic_message_embedding_updated_at
    `,
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read route topic_state: ${error.message}`);
  }

  return ((data ?? []) as RawTopicStateRow[]).map((row) =>
    normalizeTopicStateRow({
      ...row,
      topic_json: null,
    }),
  );
}
