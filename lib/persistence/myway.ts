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

function asJsonEmbeddingVector(value: EmbeddingVector | null | undefined): JsonValue {
  if (!Array.isArray(value)) return null;

  const clean = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!clean.length) return null;
  if (clean.length !== value.length) return null;

  return clean;
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string | null = null): string | null {
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
  const topLevel = asString(getJsonObjectValue(topicJson, "semantic_enrichment_status"));

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

function readTopicPositionFromTopicJson(topicJson: JsonObject): TopicPosition | null {
  return (
    asTopicPosition(getJsonObjectValue(topicJson, "topic_position")) ??
    asTopicPosition(getJsonObjectValue(topicJson, "position")) ??
    asTopicPosition(getJsonObjectValue(topicJson, "topic_centroid"))
  );
}

function mergeTopicEmbeddingIntoTopicJson(args: {
  topicJson: JsonValue;
  topicEmbeddingCentroid?: EmbeddingVector | null;
  topicEmbeddingCount?: number | null;
  topicEmbeddingModel?: string | null;
  topicEmbeddingUpdatedAt?: string | null;
}): JsonValue {
  const {
    topicJson,
    topicEmbeddingCentroid,
    topicEmbeddingCount,
    topicEmbeddingModel,
    topicEmbeddingUpdatedAt,
  } = args;

  const base: JsonObject = isPlainObject(topicJson)
    ? { ...topicJson }
    : { value: topicJson };

  if (topicEmbeddingCentroid !== undefined) {
    base.topic_embedding_centroid = asJsonEmbeddingVector(topicEmbeddingCentroid);
  }

  if (topicEmbeddingCount !== undefined) {
    base.topic_embedding_count =
      typeof topicEmbeddingCount === "number" && Number.isFinite(topicEmbeddingCount)
        ? Math.max(0, Math.floor(topicEmbeddingCount))
        : null;
  }

  if (topicEmbeddingModel !== undefined) {
    base.topic_embedding_model = topicEmbeddingModel ?? null;
  }

  if (topicEmbeddingUpdatedAt !== undefined) {
    base.topic_embedding_updated_at = topicEmbeddingUpdatedAt ?? null;
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
      semanticEnrichmentStatus: null,
      needsEmbeddingCentroid: false,
      shouldScheduleEnrichment: false,
      semanticEnrichmentPromptText: null,
      layoutStatus: null,
      embeddingSkipReason: null,
    };
  }

  const topicPosition = readTopicPositionFromTopicJson(topicJson);

  const semanticEnrichmentStatus = readSemanticStatusFromTopicJson(topicJson);
  const needsEmbeddingCentroid =
    readNestedSemanticBoolean(topicJson, "needs_embedding_centroid") ?? false;
  const shouldScheduleEnrichment =
    readNestedSemanticBoolean(topicJson, "should_schedule_enrichment") ?? false;

  const semanticEnrichmentPromptText =
    asString(getJsonObjectValue(topicJson, "semantic_enrichment_prompt_text")) ??
    readNestedSemanticString(topicJson, "enrichment_prompt_text");

  const layoutStatus = readNestedSemanticString(topicJson, "layout_status");
  const embeddingSkipReason = readNestedSemanticString(
    topicJson,
    "embedding_skip_reason",
  );

  return {
    topicPosition,
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
   * Semantic topic-routing centroid.
   * This is separate from the visual 3D topic_position.
   */
  topicEmbeddingCentroid?: EmbeddingVector | null;
  topicEmbeddingCount?: number | null;
  topicEmbeddingModel?: string | null;
  topicEmbeddingUpdatedAt?: string | null;
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
  const embeddingUpdatedAt =
    input.topicEmbeddingUpdatedAt ??
    (input.topicEmbeddingCentroid ? new Date().toISOString() : null);

  const topicJsonWithEmbedding = mergeTopicEmbeddingIntoTopicJson({
    topicJson: input.topicJson,
    topicEmbeddingCentroid: input.topicEmbeddingCentroid,
    topicEmbeddingCount: input.topicEmbeddingCount,
    topicEmbeddingModel: input.topicEmbeddingModel,
    topicEmbeddingUpdatedAt: embeddingUpdatedAt,
  });

  const columnMetadata = getTopicStateColumnMetadata(topicJsonWithEmbedding);

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
      topic_json: topicJsonWithEmbedding,

      topic_position_x: columnMetadata.topicPosition?.[0] ?? null,
      topic_position_y: columnMetadata.topicPosition?.[1] ?? null,
      topic_position_z: columnMetadata.topicPosition?.[2] ?? null,

      semantic_enrichment_status: columnMetadata.semanticEnrichmentStatus,
      needs_embedding_centroid: columnMetadata.needsEmbeddingCentroid,
      should_schedule_enrichment: columnMetadata.shouldScheduleEnrichment,
      semantic_enrichment_prompt_text: columnMetadata.semanticEnrichmentPromptText,
      layout_status: columnMetadata.layoutStatus,
      embedding_skip_reason: columnMetadata.embeddingSkipReason,

      // These columns should be added in Supabase. read.ts also falls back to
      // topic_json during migration, but these explicit columns make routing
      // faster and easier to query later.
      topic_embedding_centroid: asJsonEmbeddingVector(input.topicEmbeddingCentroid),
      topic_embedding_count:
        typeof input.topicEmbeddingCount === "number" &&
        Number.isFinite(input.topicEmbeddingCount)
          ? Math.max(0, Math.floor(input.topicEmbeddingCount))
          : 0,
      topic_embedding_model: input.topicEmbeddingModel ?? null,
      topic_embedding_updated_at: embeddingUpdatedAt,
    },
    {
      onConflict: "topic_id",
    },
  );

  if (error) {
    throw new Error(`Failed to upsert topic_state: ${error.message}`);
  }
}