import { QdrantClient } from "@qdrant/js-client-rest";

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing ${name}`);
  }

  return value.trim();
}

export const QDRANT_URL = getEnv("QDRANT_URL");
export const QDRANT_API_KEY = getEnv("QDRANT_API_KEY");

export const TOPIC_COLLECTION = "myway-topics";
export const TOPIC_VECTOR_SIZE = 384;

export const qdrant = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

type EnsureTopicCollectionResult = {
  created: boolean;
  collectionName: string;
};

export async function ensureTopicCollection(): Promise<EnsureTopicCollectionResult> {
  try {
    await qdrant.getCollection(TOPIC_COLLECTION);

    return {
      created: false,
      collectionName: TOPIC_COLLECTION,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    const looksMissing =
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("does not exist");

    if (!looksMissing) {
      throw error;
    }
  }

  await qdrant.createCollection(TOPIC_COLLECTION, {
    vectors: {
      size: TOPIC_VECTOR_SIZE,
      distance: "Cosine",
    },
  });

  return {
    created: true,
    collectionName: TOPIC_COLLECTION,
  };
}