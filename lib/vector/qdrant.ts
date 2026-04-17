import { QdrantClient } from "@qdrant/js-client-rest";

if (!process.env.QDRANT_URL) {
  throw new Error("Missing QDRANT_URL");
}

if (!process.env.QDRANT_API_KEY) {
  throw new Error("Missing QDRANT_API_KEY");
}

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

export const TOPIC_COLLECTION = "myway-topics";