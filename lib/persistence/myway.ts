import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EmbeddingVector } from "@/types/contracts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonObject = { [key: string]: JsonValue };
type TopicPosition = [number, number, number];

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asJsonEmbeddingVector(
  value: EmbeddingVector | null | undefined,
): JsonValue {
  if (!Array.isArray(value)) return null;

  const clean = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!clean.length) return null;
  if (clean.length !== value.length) return null;

  return clean;
}

function asString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(
  value: unknown,
  fallback: boolean | null = null,
): boolean | null {
  return typeof value === "boolean" ? value : fallback;
}

function asTopicPosition(value: unknown): TopicPosition | null {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const clean = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (clean.length !== 3) return null;

  return [clean[0], clean[1], clean[2]];
}

function cleanCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function getJsonObjectValue(
  object: JsonObject,
  key: string,
): JsonValue | undefined {
  return object[key];
}

function getNestedSemanticObject(topicJson: JsonObject) {
  const nested = getJsonObjectValue(topicJson, "semantic_enrichment_status");

  return isPlainObject(nested) ? nested : null;
}

function readSemanticStatusFromTopicJson(topicJson: JsonObject) {
  const topLevel = asString(
    getJsonObjectValue(topicJson, "semantic_enrichment_status"),
  );

  if (topLevel) return topLevel;

  const nested = getNestedSemanticObject(topicJson);

  return nested ? asString(getJsonObjectValue(nested, "status")) : null;
}

function readNestedSemanticString(topicJson: JsonObject, key: string) {
  const topLevel = asString(getJsonObjectValue(topicJson, key));

  if (topLevel) return topLevel;

  const nested = getNestedSemanticObject(topicJson);

  return nested ? asString(getJsonObjectValue(nested, key)) : null;
}

function readNestedSemanticBoolean(topicJson: JsonObject, key: string) {
  const topLevel = asBoolean(getJsonObjectValue(topicJson, key));

  if (topLevel !== null) return topLevel;

  const nested = getNestedSemanticObject(topicJson);

  return nested ? asBoolean(getJsonObjectValue(nested, key)) : null;
}

function readTopicPositionFromTopicJson(
  topicJson: JsonObject,
): TopicPosition | null {
  return (
    asTopicPosition(getJsonObjectValue(topicJson, "topic_position")) ??
    asTopicPosition(getJsonObjectValue(topicJson, "position")) ??
    asTopicPosition(getJsonObjectValue(topicJson, "topic_centroid"))
  );
}

function readSemanticPositionFromTopicJson(
  topicJson: JsonObject,
): TopicPosition | null {
  return (
    asTopicPosition(getJsonObjectValue(topicJson, "semantic_position")) ??
    asTopicPosition(
      getJsonObjectValue(topicJson, "semantic_target_position"),
    ) ??
    asTopicPosition(
      getJsonObjectValue(topicJson, "learning_space_target_position"),
    )
  );
}

function baseTopicJson(topicJson: JsonValue): JsonObject {
  return isPlainObject(topicJson) ? { ...topicJson } : { value: topicJson };
}

function mergeEmbeddingFieldsIntoTopicJson(args: {
  topicJson: JsonValue;

  /**
   * Canonical topic-label embedding.
   */
  topicLabelEmbeddingCentroid?: EmbeddingVector | null;
  topicLabelEmbeddingCount?: number | null;
  topicLabelEmbeddingModel?: string | null;
  topicLabelEmbeddingUpdatedAt?: string | null;

  /**
   * Canonical topic-message embedding.
   */
  topicMessageEmbeddingCentroid?: EmbeddingVector | null;
  topicMessageEmbeddingCount?: number | null;
  topicMessageEmbeddingModel?: string | null;
  topicMessageEmbeddingUpdatedAt?: string | null;
}): JsonValue {
  const base = baseTopicJson(args.topicJson);

  /**
   * Hard-cutover wave 2:
   * topic_embedding_* is no longer written. Remove stale JSON keys if present.
   */
  delete base.topic_embedding_centroid;
  delete base.topic_embedding_count;
  delete base.topic_embedding_model;
  delete base.topic_embedding_updated_at;

  if (args.topicLabelEmbeddingCentroid !== undefined) {
    base.topic_label_embedding_centroid = asJsonEmbeddingVector(
      args.topicLabelEmbeddingCentroid,
    );
  }

  if (args.topicLabelEmbeddingCount !== undefined) {
    base.topic_label_embedding_count = cleanCount(
      args.topicLabelEmbeddingCount,
    );
  }

  if (args.topicLabelEmbeddingModel !== undefined) {
    base.topic_label_embedding_model = args.topicLabelEmbeddingModel ?? null;
  }

  if (args.topicLabelEmbeddingUpdatedAt !== undefined) {
    base.topic_label_embedding_updated_at =
      args.topicLabelEmbeddingUpdatedAt ?? null;
  }

  if (args.topicMessageEmbeddingCentroid !== undefined) {
    base.topic_message_embedding_centroid = asJsonEmbeddingVector(
      args.topicMessageEmbeddingCentroid,
    );
  }

  if (args.topicMessageEmbeddingCount !== undefined) {
    base.topic_message_embedding_count = cleanCount(
      args.topicMessageEmbeddingCount,
    );
  }

  if (args.topicMessageEmbeddingModel !== undefined) {
    base.topic_message_embedding_model =
      args.topicMessageEmbeddingModel ?? null;
  }

  if (args.topicMessageEmbeddingUpdatedAt !== undefined) {
    base.topic_message_embedding_updated_at =
      args.topicMessageEmbeddingUpdatedAt ?? null;
  }

  return base;
}

function mergeSemanticPositionIntoTopicJson(args: {
  topicJson: JsonValue;
  semanticPosition?: TopicPosition | null;
  semanticPositionUpdatedAt?: string | null;
  semanticPositionMethod?: string | null;
}): JsonValue {
  const base = baseTopicJson(args.topicJson);

  if (args.semanticPosition !== undefined) {
    base.semantic_position = args.semanticPosition;
  }

  if (args.semanticPositionUpdatedAt !== undefined) {
    base.semantic_position_updated_at = args.semanticPositionUpdatedAt ?? null;
  }

  if (args.semanticPositionMethod !== undefined) {
    base.semantic_position_method = args.semanticPositionMethod ?? null;
  }

  return base;
}

function getTopicStateColumnMetadata(topicJsonWithEmbedding: JsonValue) {
  const topicJson = isPlainObject(topicJsonWithEmbedding)
    ? topicJsonWithEmbedding
    : null;

  if (!topicJson) {
    return {
      topicPosition: null,
      semanticPosition: null,
      semanticPositionUpdatedAt: null,
      semanticPositionMethod: null,
      semanticEnrichmentStatus: null,
      needsEmbeddingCentroid: false,
      shouldScheduleEnrichment: false,
      semanticEnrichmentPromptText: null,
      layoutStatus: null,
      embeddingSkipReason: null,
    };
  }

  const topicPosition = readTopicPositionFromTopicJson(topicJson);
  const semanticPosition = readSemanticPositionFromTopicJson(topicJson);

  const semanticPositionUpdatedAt = asString(
    getJsonObjectValue(topicJson, "semantic_position_updated_at"),
  );

  const semanticPositionMethod = asString(
    getJsonObjectValue(topicJson, "semantic_position_method"),
  );

  const semanticEnrichmentStatus = readSemanticStatusFromTopicJson(topicJson);
  const needsEmbeddingCentroid =
    readNestedSemanticBoolean(topicJson, "needs_embedding_centroid") ?? false;
  const shouldScheduleEnrichment =
    readNestedSemanticBoolean(topicJson, "should_schedule_enrichment") ?? false;

  const semanticEnrichmentPromptText =
    asString(
      getJsonObjectValue(topicJson, "semantic_enrichment_prompt_text"),
    ) ?? readNestedSemanticString(topicJson, "enrichment_prompt_text");

  const layoutStatus = readNestedSemanticString(topicJson, "layout_status");
  const embeddingSkipReason = readNestedSemanticString(
    topicJson,
    "embedding_skip_reason",
  );

  return {
    topicPosition,
    semanticPosition,
    semanticPositionUpdatedAt,
    semanticPositionMethod,
    semanticEnrichmentStatus,
    needsEmbeddingCentroid,
    shouldScheduleEnrichment,
    semanticEnrichmentPromptText,
    layoutStatus,
    embeddingSkipReason,
  };
}

export type PersistedRunInput = {
  id: string;
  runType: "message" | "probe_submit";
  userMessage: string | null;
  sourceMessageId?: string | null;
  targetTopicId?: string | null;
  modeSelected?: "clarify" | "probe" | null;
  activeDiagnosis?: string | null;
  replyText?: string | null;
  suggestedAction?: string | null;
  runResultJson: JsonValue;
};

export type PersistedAttemptInput = {
  id: string;
  runId: string;
  probeId?: string | null;
  topicId: string;
  responseText?: string | null;
  classification?: string | null;
  correctnessEstimate?: string | null;
  explanationQuality?: string | null;
  insight?: number | null;
  confusion?: number | null;
  attemptJson: JsonValue;
};

export type PersistedTopicStateInput = {
  topicId: string;
  lastRunId?: string | null;
  topicName: string;
  confusion?: number | null;
  insight?: number | null;
  learningScore?: number | null;
  diagnosis?: string | null;
  nextStep?: string | null;
  topicJson: JsonValue;

  /**
   * Canonical embedding of the clean topic label.
   * Used for semantic topic layout and Qdrant topic lookup.
   */
  topicLabelEmbeddingCentroid?: EmbeddingVector | null;
  topicLabelEmbeddingCount?: number | null;
  topicLabelEmbeddingModel?: string | null;
  topicLabelEmbeddingUpdatedAt?: string | null;

  /**
   * Canonical topic-level embedding of learner messages assigned to this topic.
   */
  topicMessageEmbeddingCentroid?: EmbeddingVector | null;
  topicMessageEmbeddingCount?: number | null;
  topicMessageEmbeddingModel?: string | null;
  topicMessageEmbeddingUpdatedAt?: string | null;

  semanticPosition?: TopicPosition | null;
  semanticPositionUpdatedAt?: string | null;
  semanticPositionMethod?: string | null;
};

export async function insertRun(input: PersistedRunInput) {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("runs").insert({
    id: input.id,
    run_type: input.runType,
    user_message: input.userMessage,
    source_message_id: input.sourceMessageId ?? null,
    target_topic_id: input.targetTopicId ?? null,
    mode_selected: input.modeSelected ?? null,
    active_diagnosis: input.activeDiagnosis ?? null,
    reply_text: input.replyText ?? null,
    suggested_action: input.suggestedAction ?? null,
    run_result_json: input.runResultJson,
  });

  if (error) {
    throw new Error(`Failed to insert run: ${error.message}`);
  }
}

export async function insertAttempt(input: PersistedAttemptInput) {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("attempts").insert({
    id: input.id,
    run_id: input.runId,
    probe_id: input.probeId ?? null,
    topic_id: input.topicId,
    response_text: input.responseText ?? null,
    classification: input.classification ?? null,
    correctness_estimate: input.correctnessEstimate ?? null,
    explanation_quality: input.explanationQuality ?? null,
    insight: input.insight ?? null,
    confusion: input.confusion ?? null,
    attempt_json: input.attemptJson,
  });

  if (error) {
    throw new Error(`Failed to insert attempt: ${error.message}`);
  }
}

export async function upsertTopicState(input: PersistedTopicStateInput) {
  const supabase = createServerSupabaseClient();

  /**
   * Hard-cutover wave 2:
   * topic_label_embedding_* and topic_message_embedding_* are canonical.
   * topic_embedding_* is no longer accepted or written.
   */
  const resolvedLabelCentroid = input.topicLabelEmbeddingCentroid ?? null;

  const resolvedLabelCount = input.topicLabelEmbeddingCount ?? null;

  const resolvedLabelModel = input.topicLabelEmbeddingModel ?? null;

  const resolvedLabelUpdatedAt =
    input.topicLabelEmbeddingUpdatedAt ??
    (resolvedLabelCentroid ? new Date().toISOString() : null);

  const resolvedMessageCentroid = input.topicMessageEmbeddingCentroid ?? null;

  const resolvedMessageCount = input.topicMessageEmbeddingCount ?? null;

  const resolvedMessageModel = input.topicMessageEmbeddingModel ?? null;

  const resolvedMessageUpdatedAt =
    input.topicMessageEmbeddingUpdatedAt ??
    (resolvedMessageCentroid ? new Date().toISOString() : null);

  const semanticPositionUpdatedAt =
    input.semanticPositionUpdatedAt ??
    (input.semanticPosition ? new Date().toISOString() : null);

  const topicJsonWithEmbedding = mergeEmbeddingFieldsIntoTopicJson({
    topicJson: input.topicJson,

    topicLabelEmbeddingCentroid: resolvedLabelCentroid,
    topicLabelEmbeddingCount: resolvedLabelCount,
    topicLabelEmbeddingModel: resolvedLabelModel,
    topicLabelEmbeddingUpdatedAt: resolvedLabelUpdatedAt,

    topicMessageEmbeddingCentroid: resolvedMessageCentroid,
    topicMessageEmbeddingCount: resolvedMessageCount,
    topicMessageEmbeddingModel: resolvedMessageModel,
    topicMessageEmbeddingUpdatedAt: resolvedMessageUpdatedAt,
  });

  const topicJsonWithSemanticPosition = mergeSemanticPositionIntoTopicJson({
    topicJson: topicJsonWithEmbedding,
    semanticPosition: input.semanticPosition,
    semanticPositionUpdatedAt,
    semanticPositionMethod: input.semanticPositionMethod,
  });

  const columnMetadata = getTopicStateColumnMetadata(
    topicJsonWithSemanticPosition,
  );

  const { error } = await supabase.from("topic_state").upsert(
    {
      topic_id: input.topicId,
      updated_at: new Date().toISOString(),
      last_run_id: input.lastRunId ?? null,
      topic_name: input.topicName,
      confusion: input.confusion ?? null,
      insight: input.insight ?? null,
      learning_score: input.learningScore ?? null,
      diagnosis: input.diagnosis ?? null,
      next_step: input.nextStep ?? null,
      topic_json: topicJsonWithSemanticPosition,

      topic_position_x: columnMetadata.topicPosition?.[0] ?? null,
      topic_position_y: columnMetadata.topicPosition?.[1] ?? null,
      topic_position_z: columnMetadata.topicPosition?.[2] ?? null,

      semantic_position_x: columnMetadata.semanticPosition?.[0] ?? null,
      semantic_position_y: columnMetadata.semanticPosition?.[1] ?? null,
      semantic_position_z: columnMetadata.semanticPosition?.[2] ?? null,
      semantic_position_updated_at: columnMetadata.semanticPositionUpdatedAt,
      semantic_position_method: columnMetadata.semanticPositionMethod,

      semantic_enrichment_status: columnMetadata.semanticEnrichmentStatus,
      needs_embedding_centroid: columnMetadata.needsEmbeddingCentroid,
      should_schedule_enrichment: columnMetadata.shouldScheduleEnrichment,
      semantic_enrichment_prompt_text:
        columnMetadata.semanticEnrichmentPromptText,
      layout_status: columnMetadata.layoutStatus,
      embedding_skip_reason: columnMetadata.embeddingSkipReason,

      topic_label_embedding_centroid: asJsonEmbeddingVector(
        resolvedLabelCentroid,
      ),
      topic_label_embedding_count: cleanCount(resolvedLabelCount),
      topic_label_embedding_model: resolvedLabelModel,
      topic_label_embedding_updated_at: resolvedLabelUpdatedAt,

      topic_message_embedding_centroid: asJsonEmbeddingVector(
        resolvedMessageCentroid,
      ),
      topic_message_embedding_count: cleanCount(resolvedMessageCount),
      topic_message_embedding_model: resolvedMessageModel,
      topic_message_embedding_updated_at: resolvedMessageUpdatedAt,
    },
    {
      onConflict: "topic_id",
    },
  );

  if (error) {
    throw new Error(`Failed to upsert topic_state: ${error.message}`);
  }
}
