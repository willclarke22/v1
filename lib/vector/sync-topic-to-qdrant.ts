import crypto from "node:crypto";
import { embedText } from "@/lib/vector/embed";
import {
  createQdrantClient,
  hasQdrantConfig,
  ensureTopicCollection,
  TOPIC_COLLECTION,
} from "@/lib/vector/qdrant";

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

export function canSyncTopicToQdrant(): boolean {
  return hasQdrantConfig() && Boolean(process.env.EMBEDDINGS_URL?.trim());
}

export async function syncTopicToQdrant(
  input: SyncTopicToQdrantInput
): Promise<void> {
  if (!canSyncTopicToQdrant()) {
    throw new Error(
      "Qdrant topic sync is unavailable because QDRANT or EMBEDDINGS configuration is missing."
    );
  }

  const qdrant = createQdrantClient();
  await ensureTopicCollection();

  const embeddingText = buildEmbeddingText(input);
  const vector = await embedText(embeddingText);

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
          inferred_keywords: asStringArray(asRecord(input.topicJson)?.inferred_keywords),
          embedding_text: embeddingText,
        },
      },
    ],
  });
}