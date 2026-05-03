import { QdrantClient } from "@qdrant/js-client-rest";

export const TOPIC_COLLECTION = "myway-topics";
export const DEFAULT_TOPIC_VECTOR_SIZE = 384;

let cachedQdrantClient: QdrantClient | null = null;
let cachedQdrantClientKey: string | null = null;

function getOptionalEnv(name: string): string | null {
  const value = process.env[name];

  if (!value || !value.trim()) {
    return null;
  }

  return value.trim();
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getTopicVectorSize() {
  return parsePositiveInteger(
    getOptionalEnv("MYWAY_EMBEDDING_VECTOR_SIZE") ??
      getOptionalEnv("EMBEDDING_VECTOR_SIZE"),
    DEFAULT_TOPIC_VECTOR_SIZE,
  );
}

/**
 * Backward-compatible export.
 *
 * If you need the runtime-configured size, prefer getTopicVectorSize().
 */
export const TOPIC_VECTOR_SIZE = DEFAULT_TOPIC_VECTOR_SIZE;

export function getQdrantConfig() {
  return {
    url: getOptionalEnv("QDRANT_URL"),
    apiKey: getOptionalEnv("QDRANT_API_KEY"),
    topicCollection: getOptionalEnv("QDRANT_TOPIC_COLLECTION") ?? TOPIC_COLLECTION,
    topicVectorSize: getTopicVectorSize(),
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
  expectedVectorSize: number;
  existingVectorSize: number | null;
};

function extractExistingVectorSize(collectionInfo: unknown): number | null {
  const info = collectionInfo as {
    config?: {
      params?: {
        vectors?: unknown;
      };
    };
  };

  const vectors = info.config?.params?.vectors;

  if (!vectors || typeof vectors !== "object") return null;

  const directSize = (vectors as { size?: unknown }).size;

  if (typeof directSize === "number" && Number.isFinite(directSize)) {
    return directSize;
  }

  /**
   * Named-vector Qdrant config shape, not expected here, but this makes the
   * validation a little more defensive.
   */
  const firstNamedVector = Object.values(vectors as Record<string, unknown>)[0] as
    | { size?: unknown }
    | undefined;

  if (
    firstNamedVector &&
    typeof firstNamedVector.size === "number" &&
    Number.isFinite(firstNamedVector.size)
  ) {
    return firstNamedVector.size;
  }

  return null;
}

export async function ensureTopicCollection(): Promise<EnsureTopicCollectionResult> {
  const qdrant = createQdrantClient();
  const { topicCollection, topicVectorSize } = getQdrantConfig();

  try {
    const collectionInfo = await qdrant.getCollection(topicCollection);
    const existingVectorSize = extractExistingVectorSize(collectionInfo);

    if (existingVectorSize != null && existingVectorSize !== topicVectorSize) {
      throw new Error(
        [
          `Qdrant collection "${topicCollection}" exists with vector size ${existingVectorSize},`,
          `but MyWay expects vector size ${topicVectorSize}.`,
          "This usually means the embedding model changed.",
          "Create a new collection name or recreate the existing collection before syncing topic centroids.",
        ].join(" "),
      );
    }

    return {
      created: false,
      collectionName: topicCollection,
      expectedVectorSize: topicVectorSize,
      existingVectorSize,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    const looksMissing =
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("does not exist");

    if (!looksMissing) {
      throw error;
    }
  }

  await qdrant.createCollection(topicCollection, {
    vectors: {
      size: topicVectorSize,
      distance: "Cosine",
    },
  });

  return {
    created: true,
    collectionName: topicCollection,
    expectedVectorSize: topicVectorSize,
    existingVectorSize: null,
  };
}