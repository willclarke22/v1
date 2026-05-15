import crypto from "node:crypto";
import { embedText } from "@/lib/vector/embed";
import {
  createQdrantClient,
  ensureTopicCollection,
  hasQdrantConfig,
  TOPIC_COLLECTION,
} from "@/lib/vector/qdrant";
import type { EmbeddingVector } from "@/types/contracts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type TopicLabelVectorSource =
  | "topic_label_embedding_centroid"
  | "topic_label_text_fallback";

export type SyncTopicToQdrantInput = {
  topicId: string;
  topicLabel?: string | null;

  /**
   * @deprecated Use topicLabel instead. Kept because the persistence boundary
   * still calls this value topicName in a few places.
   */
  topicName?: string | null;
  diagnosis?: string | null;
  nextStep?: string | null;
  updatedAt?: string | null;
  topicJson?: JsonValue;

  /**
   * Canonical topic-label embedding.
   *
   * This is the vector Qdrant stores for topic lookup / semantic layout.
   */
  topicLabelEmbeddingCentroid?: EmbeddingVector | null;
  topicLabelEmbeddingCount?: number | null;
  topicLabelEmbeddingModel?: string | null;
  topicLabelEmbeddingUpdatedAt?: string | null;
};

export type SyncTopicToQdrantResult = {
  ok: boolean;
  skipped: boolean;
  error: string | null;
  topic_id: string;
  topic_label: string;
  /** @deprecated Use topic_label instead. */
  topic_name: string;
  vector_source: TopicLabelVectorSource | null;
  qdrant_sync_timeout_ms: number;
  qdrant_ensure_timeout_ms: number;
  qdrant_upsert_wait: boolean;
  duration_ms: number;
};

type ResolvedTopicLabelEmbeddingFields = {
  centroid: EmbeddingVector | null;
  count: number;
  model: string;
  updatedAt: string | null;
  source: "topic_label_embedding_centroid" | null;
};

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function nowMs() {
  return performance.now();
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value || !value.trim()) return fallback;

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getQdrantSyncTimeoutMs() {
  return parsePositiveInteger(
    process.env.MYWAY_QDRANT_SYNC_TIMEOUT_MS ??
      process.env.QDRANT_SYNC_TIMEOUT_MS,
    2500,
  );
}

function getQdrantEnsureTimeoutMs() {
  return parsePositiveInteger(
    process.env.MYWAY_QDRANT_ENSURE_TIMEOUT_MS ??
      process.env.QDRANT_ENSURE_TIMEOUT_MS,
    1500,
  );
}

function getQdrantUpsertWait() {
  const raw =
    process.env.MYWAY_QDRANT_UPSERT_WAIT ??
    process.env.QDRANT_UPSERT_WAIT ??
    "false";

  return raw.trim().toLowerCase() === "true";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function asRecord(value: unknown): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, JsonValue>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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

function asNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDefaultEmbeddingModelName() {
  return (
    process.env.MYWAY_EMBEDDING_MODEL ??
    process.env.EMBEDDING_MODEL ??
    "local-embedding-service"
  );
}

function getInputTopicLabel(input: SyncTopicToQdrantInput): string {
  return input.topicLabel?.trim() || input.topicName?.trim() || input.topicId;
}

function readTopicJsonEmbedding(input: SyncTopicToQdrantInput) {
  const topicJson = asRecord(input.topicJson);

  const topicLabelCentroid = asEmbeddingVector(
    topicJson?.topic_label_embedding_centroid,
  );

  return {
    centroid: topicLabelCentroid,
    source: topicLabelCentroid
      ? ("topic_label_embedding_centroid" as const)
      : null,
    count: asNonNegativeInteger(topicJson?.topic_label_embedding_count),
    model: asString(topicJson?.topic_label_embedding_model),
    updatedAt: asString(topicJson?.topic_label_embedding_updated_at),
  };
}

function buildPointId(topicId: string): string {
  const hex = crypto.createHash("sha256").update(topicId).digest("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function buildTopicLabelFallbackText(input: SyncTopicToQdrantInput): string {
  const topicJson = asRecord(input.topicJson);
  const inferredKeywords = asStringArray(topicJson?.inferred_keywords);

  const parts = [
    /**
     * Keep the fallback text label-centered.
     *
     * Qdrant stores topic-label vectors, not learner-message pattern vectors.
     */
    getInputTopicLabel(input),
    inferredKeywords.length > 0
      ? `Keywords: ${inferredKeywords.join(", ")}`
      : null,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join("\n");
}

function resolveInputCentroidSource(input: SyncTopicToQdrantInput): {
  centroid: EmbeddingVector | null;
  source: ResolvedTopicLabelEmbeddingFields["source"];
} {
  const topicLabelCentroid = asEmbeddingVector(input.topicLabelEmbeddingCentroid);

  if (topicLabelCentroid) {
    return {
      centroid: topicLabelCentroid,
      source: "topic_label_embedding_centroid",
    };
  }

  return {
    centroid: null,
    source: null,
  };
}

function resolveTopicLabelEmbeddingFields(
  input: SyncTopicToQdrantInput,
): ResolvedTopicLabelEmbeddingFields {
  const topicJsonEmbedding = readTopicJsonEmbedding(input);
  const inputCentroid = resolveInputCentroidSource(input);

  const centroid = inputCentroid.centroid ?? topicJsonEmbedding.centroid;
  const source = inputCentroid.source ?? topicJsonEmbedding.source;

  const count =
    asNonNegativeInteger(input.topicLabelEmbeddingCount) ??
    topicJsonEmbedding.count ??
    (centroid ? 1 : 0);

  const model =
    input.topicLabelEmbeddingModel ??
    topicJsonEmbedding.model ??
    getDefaultEmbeddingModelName();

  const updatedAt =
    input.topicLabelEmbeddingUpdatedAt ??
    topicJsonEmbedding.updatedAt ??
    (centroid ? input.updatedAt ?? new Date().toISOString() : null);

  return {
    centroid,
    count,
    model,
    updatedAt,
    source,
  };
}

/**
 * This checks only Qdrant config.
 *
 * EMBEDDINGS_URL is not required when the topic already has a
 * topicLabelEmbeddingCentroid, because sync can upsert that centroid directly.
 */
export function canSyncTopicToQdrant(): boolean {
  return hasQdrantConfig();
}

async function buildVectorForQdrant(input: SyncTopicToQdrantInput): Promise<{
  vector: EmbeddingVector;
  vectorSource: TopicLabelVectorSource;
  embeddingText: string;
  topicLabelEmbeddingCount: number;
  topicLabelEmbeddingModel: string;
  topicLabelEmbeddingUpdatedAt: string | null;
}> {
  const fields = resolveTopicLabelEmbeddingFields(input);
  const embeddingText = buildTopicLabelFallbackText(input);

  /**
   * Preferred behavior:
   * - If the topic already has a topic-label embedding, Qdrant stores that vector.
   *
   * Last-resort fallback:
   * - If no vector exists, embed the topic-label fallback text.
   */
  if (fields.centroid?.length) {
    return {
      vector: fields.centroid,
      vectorSource: fields.source ?? "topic_label_embedding_centroid",
      embeddingText,
      topicLabelEmbeddingCount: fields.count,
      topicLabelEmbeddingModel: fields.model,
      topicLabelEmbeddingUpdatedAt: fields.updatedAt,
    };
  }

  if (!process.env.EMBEDDINGS_URL?.trim()) {
    throw new Error(
      `Cannot sync topic_id "${input.topicId}" to Qdrant because it has no topicLabelEmbeddingCentroid and EMBEDDINGS_URL is missing.`,
    );
  }

  const fallbackVector = await embedText(embeddingText);

  if (!Array.isArray(fallbackVector) || fallbackVector.length === 0) {
    throw new Error(`Invalid fallback embedding vector for topic_id "${input.topicId}"`);
  }

  return {
    vector: fallbackVector,
    vectorSource: "topic_label_text_fallback",
    embeddingText,
    topicLabelEmbeddingCount: fields.count || 1,
    topicLabelEmbeddingModel: fields.model,
    topicLabelEmbeddingUpdatedAt:
      fields.updatedAt ?? input.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Strict sync API.
 *
 * Use this when the caller wants failures to throw. In user-facing routes, prefer
 * syncTopicToQdrantBestEffort(...) so Qdrant cannot fail the response.
 */
export async function syncTopicToQdrant(
  input: SyncTopicToQdrantInput,
): Promise<void> {
  if (!canSyncTopicToQdrant()) {
    throw new Error(
      "Qdrant topic sync is unavailable because QDRANT configuration is missing.",
    );
  }

  const qdrantSyncTimeoutMs = getQdrantSyncTimeoutMs();
  const qdrantEnsureTimeoutMs = getQdrantEnsureTimeoutMs();
  const qdrantUpsertWait = getQdrantUpsertWait();

  const qdrant = createQdrantClient();

  await withTimeout(
    ensureTopicCollection(),
    qdrantEnsureTimeoutMs,
    "Qdrant ensureTopicCollection",
  );

  const {
    vector,
    vectorSource,
    embeddingText,
    topicLabelEmbeddingCount,
    topicLabelEmbeddingModel,
    topicLabelEmbeddingUpdatedAt,
  } = await buildVectorForQdrant(input);

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`Invalid embedding vector for topic_id "${input.topicId}"`);
  }

  await withTimeout(
    qdrant.upsert(TOPIC_COLLECTION, {
      wait: qdrantUpsertWait,
      points: [
        {
          id: buildPointId(input.topicId),
          vector,
          payload: {
            topic_id: input.topicId,
            topic_label: getInputTopicLabel(input),

            // Temporary legacy alias for older Qdrant/debug consumers.
            topic_name: getInputTopicLabel(input),
            diagnosis: input.diagnosis ?? null,
            next_step: input.nextStep ?? null,
            updated_at: input.updatedAt ?? new Date().toISOString(),
            inferred_keywords: asStringArray(
              asRecord(input.topicJson)?.inferred_keywords,
            ),

            /**
             * Debug/source fields.
             */
            embedding_text: embeddingText,
            vector_source: vectorSource,
            vector_semantics: "topic_label_embedding",

            /**
             * Canonical Qdrant payload metadata.
             */
            topic_label_embedding_count: topicLabelEmbeddingCount,
            topic_label_embedding_model: topicLabelEmbeddingModel,
            topic_label_embedding_updated_at: topicLabelEmbeddingUpdatedAt,
          },
        },
      ],
    }),
    qdrantSyncTimeoutMs,
    "Qdrant topic upsert",
  );
}

/**
 * Best-effort sync API.
 *
 * It never throws. It returns a compact result object so callers can attach sync
 * status to debug output without failing the user-facing response.
 */
export async function syncTopicToQdrantBestEffort(
  input: SyncTopicToQdrantInput,
): Promise<SyncTopicToQdrantResult> {
  const startedAt = nowMs();
  const qdrantSyncTimeoutMs = getQdrantSyncTimeoutMs();
  const qdrantEnsureTimeoutMs = getQdrantEnsureTimeoutMs();
  const qdrantUpsertWait = getQdrantUpsertWait();

  if (!canSyncTopicToQdrant()) {
    return {
      ok: false,
      skipped: true,
      error: "missing_qdrant_config",
      topic_id: input.topicId,
      topic_label: getInputTopicLabel(input),
      topic_name: getInputTopicLabel(input),
      vector_source: null,
      qdrant_sync_timeout_ms: qdrantSyncTimeoutMs,
      qdrant_ensure_timeout_ms: qdrantEnsureTimeoutMs,
      qdrant_upsert_wait: qdrantUpsertWait,
      duration_ms: roundMs(nowMs() - startedAt),
    };
  }

  let vectorSource: SyncTopicToQdrantResult["vector_source"] = null;

  try {
    const fields = resolveTopicLabelEmbeddingFields(input);
    vectorSource = fields.centroid?.length
      ? fields.source ?? "topic_label_embedding_centroid"
      : "topic_label_text_fallback";

    await syncTopicToQdrant(input);

    const result: SyncTopicToQdrantResult = {
      ok: true,
      skipped: false,
      error: null,
      topic_id: input.topicId,
      topic_label: getInputTopicLabel(input),
      topic_name: getInputTopicLabel(input),
      vector_source: vectorSource,
      qdrant_sync_timeout_ms: qdrantSyncTimeoutMs,
      qdrant_ensure_timeout_ms: qdrantEnsureTimeoutMs,
      qdrant_upsert_wait: qdrantUpsertWait,
      duration_ms: roundMs(nowMs() - startedAt),
    };

    console.info("[syncTopicToQdrant best-effort]", result);
    return result;
  } catch (error) {
    const result: SyncTopicToQdrantResult = {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : "unknown_qdrant_sync_error",
      topic_id: input.topicId,
      topic_label: getInputTopicLabel(input),
      topic_name: getInputTopicLabel(input),
      vector_source: vectorSource,
      qdrant_sync_timeout_ms: qdrantSyncTimeoutMs,
      qdrant_ensure_timeout_ms: qdrantEnsureTimeoutMs,
      qdrant_upsert_wait: qdrantUpsertWait,
      duration_ms: roundMs(nowMs() - startedAt),
    };

    console.warn("[syncTopicToQdrant best-effort failed]", result);
    return result;
  }
}
