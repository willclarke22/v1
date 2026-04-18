import "dotenv/config";
import { getLatestTopicState } from "@/lib/persistence/read";
import { embedTexts } from "@/lib/vector/embed";
import {
  createQdrantClient,
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

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

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

function buildEmbeddingText(row: TopicStateRow): string {
  const topicJson = asRecord(row.topic_json);
  const inferredKeywords = asStringArray(topicJson?.inferred_keywords);

  const parts = [
    `Topic: ${row.topic_name}`,
    row.diagnosis ? `Diagnosis: ${row.diagnosis}` : null,
    row.next_step ? `Next step: ${row.next_step}` : null,
    inferredKeywords.length > 0
      ? `Keywords: ${inferredKeywords.join(", ")}`
      : null,
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join("\n");
}

function buildPointId(topicId: string): string {
  return topicId;
}

async function main() {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    console.log("No topic_state rows found.");
    return;
  }

  const ensureResult = await ensureTopicCollection();
  const qdrant = createQdrantClient();

  console.log(
    ensureResult.created
      ? `Created Qdrant collection "${ensureResult.collectionName}".`
      : `Using existing Qdrant collection "${ensureResult.collectionName}".`
  );

  const embeddingTexts = rows.map(buildEmbeddingText);
  const vectors = await embedTexts(embeddingTexts);

  if (vectors.length !== rows.length) {
    throw new Error(
      `Embedding count mismatch: got ${vectors.length}, expected ${rows.length}`
    );
  }

  const points = rows.map((row, index) => {
    const topicJson = asRecord(row.topic_json);
    const inferredKeywords = asStringArray(topicJson?.inferred_keywords);
    const embeddingText = embeddingTexts[index];
    const vector = vectors[index];

    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error(`Invalid embedding vector for topic_id "${row.topic_id}"`);
    }

    return {
      id: buildPointId(row.topic_id),
      vector,
      payload: {
        topic_id: row.topic_id,
        topic_name: row.topic_name,
        diagnosis: row.diagnosis,
        next_step: row.next_step,
        updated_at: row.updated_at,
        inferred_keywords: inferredKeywords,
        embedding_text: embeddingText,
      },
    };
  });

  await qdrant.upsert(TOPIC_COLLECTION, {
    wait: true,
    points,
  });

  console.log(
    `Backfilled ${points.length} topic_state rows into Qdrant collection "${TOPIC_COLLECTION}".`
  );
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});