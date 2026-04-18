import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getLatestTopicState } from "@/lib/persistence/read";
import { qdrant, TOPIC_COLLECTION } from "@/lib/vector/qdrant";
import { embedText } from "@/lib/vector/embed";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractKeywordText(topicJson: Record<string, unknown> | null): string[] {
  if (!topicJson) return [];

  const raw = topicJson["inferred_keywords"];
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTopicEmbeddingText(row: TopicStateRow): string {
  const keywordText = extractKeywordText(row.topic_json).join(", ");

  const parts = [
    row.topic_name,
    row.diagnosis ? `Diagnosis: ${row.diagnosis}` : "",
    row.next_step ? `Next step: ${row.next_step}` : "",
    keywordText ? `Keywords: ${keywordText}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

function toDeterministicPointId(topicId: string): string {
  return crypto.randomUUID?.() ? crypto.randomUUID() : topicId;
}

/**
 * For first pass safety, store the real topic_id in payload and use a UUID point id.
 * Later, you may want a stable uuidv5-style mapping instead.
 */
async function main() {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    console.log("No topic_state rows found.");
    return;
  }

  const points = [];

  for (const row of rows) {
    const text = buildTopicEmbeddingText(row);
    const vector = await embedText(text);

    points.push({
      id: crypto.randomUUID(),
      vector,
      payload: {
        topic_id: row.topic_id,
        topic_name: row.topic_name,
        diagnosis: row.diagnosis,
        next_step: row.next_step,
        updated_at: row.updated_at,
        embedding_text: text,
      },
    });
  }

  await qdrant.upsert(TOPIC_COLLECTION, {
    wait: true,
    points,
  });

  console.log(`Backfilled ${points.length} topics into ${TOPIC_COLLECTION}.`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});