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

export function canSyncTopicToQdrant(): boolean {
  return hasQdrantConfig() && Boolean(process.env.EMBEDDINGS_URL?.trim());
}

export async function syncTopicToQdrant(
  input: SyncTopicToQdrantInput,
): Promise<void> {
  if (!canSyncTopicToQdrant()) {
    throw new Error(
      "Qdrant topic sync is unavailable because QDRANT or EMBEDDINGS configuration is missing.",
    );
  }

  const qdrant = createQdrantClient();
  await ensureTopicCollection();

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
  const vector = topicEmbeddingCentroid ?? (await embedText(embeddingText));

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`Invalid embedding vector for topic_id "${input.topicId}"`);
  }

  await qdrant.upsert(TOPIC_COLLECTION, {
    wait: true,
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
            asRecord(input.topicJson)?.inferred_keywords,
          ),

          /**
           * Debug/source fields.
           */
          embedding_text: embeddingText,
          vector_source: topicEmbeddingCentroid
            ? "topic_embedding_centroid"
            : "topic_text_fallback",

          /**
           * Semantic centroid metadata used by the V3 router/debug output.
           */
          topic_embedding_count: topicEmbeddingCount,
          topic_embedding_model: topicEmbeddingModel,
          topic_embedding_updated_at: topicEmbeddingUpdatedAt,
        },
      },
    ],
  });
}