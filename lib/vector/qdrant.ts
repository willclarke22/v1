import { QdrantClient } from "@qdrant/js-client-rest";

export const TOPIC_COLLECTION = "myway-topics";
export const TOPIC_VECTOR_SIZE = 384;

let cachedQdrantClient: QdrantClient | null = null;
let cachedQdrantClientKey: string | null = null;

function getOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return null;
  }
  return value.trim();
}

export function getQdrantConfig() {
  return {
    url: getOptionalEnv("QDRANT_URL"),
    apiKey: getOptionalEnv("QDRANT_API_KEY"),
  };
}

export function hasQdrantConfig(): boolean {
  const { url, apiKey } = getQdrantConfig();
  return Boolean(url && apiKey);
}

function buildQdrantClientKey(url: string, apiKey: string) {
  // Use a partial key only for in-process cache identity. Do not log this value.
  return `${url}:${apiKey.slice(0, 8)}`;
}

export function createQdrantClient(): QdrantClient {
  const { url, apiKey } = getQdrantConfig();

  if (!url) {
    throw new Error("Missing QDRANT_URL");
  }

  if (!apiKey) {
    throw new Error("Missing QDRANT_API_KEY");
  }

  const clientKey = buildQdrantClientKey(url, apiKey);

  if (cachedQdrantClient && cachedQdrantClientKey === clientKey) {
    return cachedQdrantClient;
  }

  cachedQdrantClient = new QdrantClient({
    url,
    apiKey,
  });
  cachedQdrantClientKey = clientKey;

  return cachedQdrantClient;
}

export function resetQdrantClientCacheForTests() {
  cachedQdrantClient = null;
  cachedQdrantClientKey = null;
}

type EnsureTopicCollectionResult = {
  created: boolean;
  collectionName: string;
};

export async function ensureTopicCollection(): Promise<EnsureTopicCollectionResult> {
  const qdrant = createQdrantClient();

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
