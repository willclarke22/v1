import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { embedText } from "../../lib/vector/embed";

async function main() {
  console.log("QDRANT_URL:", process.env.QDRANT_URL);
  console.log("QDRANT_API_KEY exists:", !!process.env.QDRANT_API_KEY);
  console.log("EMBEDDINGS_URL:", process.env.EMBEDDINGS_URL);

  const { createQdrantClient, TOPIC_COLLECTION } = await import(
    "../../lib/vector/qdrant"
  );

  const qdrant = createQdrantClient();

  const topicName = "Action Potentials";
  const vector = await embedText(topicName);

  await qdrant.upsert(TOPIC_COLLECTION, {
    wait: true,
    points: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        vector,
        payload: {
          topic_id: "test-action-potentials",
          topic_name: topicName,
        },
      },
    ],
  });

  const result = await qdrant.query(TOPIC_COLLECTION, {
    query: await embedText("How do action potentials work?"),
    limit: 3,
    with_payload: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
