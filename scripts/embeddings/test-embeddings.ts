import dotenv from "dotenv";
import { embedText } from "../../lib/vector/embed";

dotenv.config({ path: ".env.local" });

async function main() {
  const vector = await embedText("How do action potentials work?");
  console.log("Vector length:", vector.length);
  console.log("First 5 values:", vector.slice(0, 5));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
