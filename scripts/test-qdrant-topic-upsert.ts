import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { embedText } from "../lib/vector/embed";

async function main() {
  console.log("QDRANT_URL:", process.env.QDRANT_URL);
  console.log("QDRANT_API_KEY exists:", Boolean(process.env.QDRANT_API_KEY));
  console.log("EMBEDDINGS_URL:", process.env.EMBEDDINGS_URL);

  const { qdrant, TOPIC_COLLECTION } = await import("../lib/vector/qdrant");

  const topicName = "Action Potentials";
  const vector = await embedText(topicName);

  await qdrant.upsert(TOPIC_COLLECTION, {
    wait: true,
    points: [
      {
        id: 1,
        vector,
        payload: {
          topic_id: "test-action-potentials",
          topic_name: topicName,
        },
      },
    ],
  });

  const queryVector = await embedText("How do action potentials work?");

  const results = await qdrant.query(TOPIC_COLLECTION, {
    query: queryVector,
    limit: 3,
    with_payload: true,
  });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});