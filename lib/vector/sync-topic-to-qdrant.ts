import crypto from "node:crypto";
import { embedText } from "@/lib/vector/embed";
import {
  createQdrantClient,
  hasQdrantConfig,
  ensureTopicCollection,
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

export type SyncTopicToQdrantInput = {
  topicId: string;
  topicName: string;
  diagnosis?: string | null;
  nextStep?: string | null;
  updatedAt?: string | null;
  topicJson?: JsonValue;

  /**
   * Semantic routing centroid.
   * If provided, this becomes the Qdrant point vector.
   * If omitted, sync falls back to embedding topic text.
   */
  topicEmbeddingCentroid?: EmbeddingVector | null;
  topicEmbeddingCount?: number | null;
  topicEmbeddingModel?: string | null;
  topicEmbeddingUpdatedAt?: string | null;
};

export type SyncTopicToQdrantResult = {
  ok: boolean;
  skipped: boolean;
  error: string | null;
  topic_id: string;
  topic_name: string;
  vector_source: "topic_embedding_centroid" | "topic_text_fallback" | null;
  qdrant_sync_timeout_ms: number;
  qdrant_ensure_timeout_ms: number;
  qdrant_upsert_wait: boolean;
  duration_ms: number;
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
    2500
  );
}

function getQdrantEnsureTimeoutMs() {
  return parsePositiveInteger(
    process.env.MYWAY_QDRANT_ENSURE_TIMEOUT_MS ??
      process.env.QDRANT_ENSURE_TIMEOUT_MS,
    1500
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
  label: string
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
    (item): item is number => typeof item === "number" && Number.isFinite(item)
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

function readTopicJsonEmbedding(input: SyncTopicToQdrantInput) {
  const topicJson = asRecord(input.topicJson);

  return {
    topicEmbeddingCentroid: asEmbeddingVector(topicJson?.topic_embedding_centroid),
    topicEmbeddingCount: asNonNegativeInteger(topicJson?.topic_embedding_count),
    topicEmbeddingModel: asString(topicJson?.topic_embedding_model),
    topicEmbeddingUpdatedAt: asString(topicJson?.topic_embedding_updated_at),
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

function buildEmbeddingText(input: SyncTopicToQdrantInput): string {
  const topicJson = asRecord(input.topicJson);
  const inferredKeywords = asStringArray(topicJson?.inferred_keywords);

  const parts = [
    `Topic: ${input.topicName}`,
    input.diagnosis ? `Diagnosis: ${input.diagnosis}` : null,
    input.nextStep ? `Next step: ${input.nextStep}` : null,
    inferredKeywords.length > 0
      ? `Keywords: ${inferredKeywords.join(", ")}`
      : null,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join("\n");
}

function getEmbeddingModelName(input: SyncTopicToQdrantInput) {
  const topicJsonEmbedding = readTopicJsonEmbedding(input);

  return (
    input.topicEmbeddingModel ??
    topicJsonEmbedding.topicEmbeddingModel ??
    process.env.MYWAY_EMBEDDING_MODEL ??
    process.env.EMBEDDING_MODEL ??
    "local-embedding-service"
  );
}

function resolveTopicEmbeddingFields(input: SyncTopicToQdrantInput) {
  const topicJsonEmbedding = readTopicJsonEmbedding(input);

  const topicEmbeddingCentroid =
    asEmbeddingVector(input.topicEmbeddingCentroid) ??
    topicJsonEmbedding.topicEmbeddingCentroid;

  const topicEmbeddingCount =
    asNonNegativeInteger(input.topicEmbeddingCount) ??
    topicJsonEmbedding.topicEmbeddingCount ??
    (topicEmbeddingCentroid ? 1 : 0);

  const topicEmbeddingModel = getEmbeddingModelName(input);

  const topicEmbeddingUpdatedAt =
    input.topicEmbeddingUpdatedAt ??
    topicJsonEmbedding.topicEmbeddingUpdatedAt ??
    (topicEmbeddingCentroid ? input.updatedAt ?? new Date().toISOString() : null);

  return {
    topicEmbeddingCentroid,
    topicEmbeddingCount,
    topicEmbeddingModel,
    topicEmbeddingUpdatedAt,
  };
}

/**
 * This now checks only Qdrant config.
 *
 * EMBEDDINGS_URL is not required when a topic already has
 * topicEmbeddingCentroid, because V3 sync can upsert that centroid directly.
 */
export function canSyncTopicToQdrant(): boolean {
  return hasQdrantConfig();
}

async function buildVectorForQdrant(input: SyncTopicToQdrantInput): Promise<{
  vector: EmbeddingVector;
  vectorSource: "topic_embedding_centroid" | "topic_text_fallback";
  embeddingText: string;
  topicEmbeddingCount: number;
  topicEmbeddingModel: string;
  topicEmbeddingUpdatedAt: string | null;
}> {
  const {
    topicEmbeddingCentroid,
    topicEmbeddingCount,
    topicEmbeddingModel,
    topicEmbeddingUpdatedAt,
  } = resolveTopicEmbeddingFields(input);

  const embeddingText = buildEmbeddingText(input);

  /**
   * Preferred V3 behavior:
   * - If the topic already has a semantic centroid, Qdrant stores that centroid.
   *
   * Migration fallback:
   * - If the topic has no centroid yet, embed the topic summary text like the
   *   old implementation did.
   */
  if (topicEmbeddingCentroid?.length) {
    return {
      vector: topicEmbeddingCentroid,
      vectorSource: "topic_embedding_centroid",
      embeddingText,
      topicEmbeddingCount,
      topicEmbeddingModel,
      topicEmbeddingUpdatedAt,
    };
  }

  if (!process.env.EMBEDDINGS_URL?.trim()) {
    throw new Error(
      `Cannot sync topic_id "${input.topicId}" to Qdrant because it has no topicEmbeddingCentroid and EMBEDDINGS_URL is missing.`
    );
  }

  const fallbackVector = await embedText(embeddingText);

  if (!Array.isArray(fallbackVector) || fallbackVector.length === 0) {
    throw new Error(`Invalid fallback embedding vector for topic_id "${input.topicId}"`);
  }

  return {
    vector: fallbackVector,
    vectorSource: "topic_text_fallback",
    embeddingText,
    topicEmbeddingCount: topicEmbeddingCount || 1,
    topicEmbeddingModel,
    topicEmbeddingUpdatedAt:
      topicEmbeddingUpdatedAt ?? input.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Strict sync API.
 *
 * Use this when the caller wants failures to throw. In /api/message, prefer
 * syncTopicToQdrantBestEffort(...) so Qdrant cannot fail the user-facing route.
 */
export async function syncTopicToQdrant(
  input: SyncTopicToQdrantInput
): Promise<void> {
  if (!canSyncTopicToQdrant()) {
    throw new Error(
      "Qdrant topic sync is unavailable because QDRANT configuration is missing."
    );
  }

  const qdrantSyncTimeoutMs = getQdrantSyncTimeoutMs();
  const qdrantEnsureTimeoutMs = getQdrantEnsureTimeoutMs();
  const qdrantUpsertWait = getQdrantUpsertWait();

  const qdrant = createQdrantClient();

  await withTimeout(
    ensureTopicCollection(),
    qdrantEnsureTimeoutMs,
    "Qdrant ensureTopicCollection"
  );

  const {
    vector,
    vectorSource,
    embeddingText,
    topicEmbeddingCount,
    topicEmbeddingModel,
    topicEmbeddingUpdatedAt,
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
            topic_name: input.topicName,
            diagnosis: input.diagnosis ?? null,
            next_step: input.nextStep ?? null,
            updated_at: input.updatedAt ?? new Date().toISOString(),
            inferred_keywords: asStringArray(
              asRecord(input.topicJson)?.inferred_keywords
            ),

            /**
             * Debug/source fields.
             */
            embedding_text: embeddingText,
            vector_source: vectorSource,

            /**
             * Semantic centroid metadata used by the V3 router/debug output.
             */
            topic_embedding_count: topicEmbeddingCount,
            topic_embedding_model: topicEmbeddingModel,
            topic_embedding_updated_at: topicEmbeddingUpdatedAt,
          },
        },
      ],
    }),
    qdrantSyncTimeoutMs,
    "Qdrant topic upsert"
  );
}

/**
 * Best-effort sync API.
 *
 * This is the one /api/message should use next. It never throws. It returns a
 * compact result object so the route can attach sync status to latency_debug or
 * log it without failing the user-facing response.
 */
export async function syncTopicToQdrantBestEffort(
  input: SyncTopicToQdrantInput
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
      topic_name: input.topicName,
      vector_source: null,
      qdrant_sync_timeout_ms: qdrantSyncTimeoutMs,
      qdrant_ensure_timeout_ms: qdrantEnsureTimeoutMs,
      qdrant_upsert_wait: qdrantUpsertWait,
      duration_ms: roundMs(nowMs() - startedAt),
    };
  }

  let vectorSource: SyncTopicToQdrantResult["vector_source"] = null;

  try {
    const fields = resolveTopicEmbeddingFields(input);
    vectorSource = fields.topicEmbeddingCentroid?.length
      ? "topic_embedding_centroid"
      : "topic_text_fallback";

    await syncTopicToQdrant(input);

    const result: SyncTopicToQdrantResult = {
      ok: true,
      skipped: false,
      error: null,
      topic_id: input.topicId,
      topic_name: input.topicName,
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
      topic_name: input.topicName,
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