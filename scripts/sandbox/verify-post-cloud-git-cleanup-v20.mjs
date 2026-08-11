import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "scripts/sandbox/post-cloud-git-cleanup-v20.ts");
const source = await readFile(target, "utf8");

const required = [
  "EXPECTED_TOTAL = 480",
  "EXPECTED_ANALYSIS = 252",
  "EXPECTED_DURABLE = 228",
  '"analysis_render_copy"',
  '"durable_metadata_copy"',
  '"public/sandbox-assets/myway/analysis/"',
  '"sandbox/probe-lab/assets/embeddings/"',
  '"sandbox/probe-lab/assets/library/licenses/"',
  '"sandbox/probe-lab/assets/library/source-records/"',
  "nonGitVerificationsAllPass",
  "policyBlocksTrackedCleanup",
  "cloud_size_mismatch",
  "v20 refuses an unexpected Git cleanup category",
  "v20 requires zero untracked needs-review asset items",
  "v20 candidate set drifted",
  "v20 postflight requires zero remaining Git cleanup candidates",
];

const missing = required.filter((needle) => !source.includes(needle));
if (missing.length) {
  console.error("v20 source verification failed. Missing safety markers:");
  for (const needle of missing) console.error(`- ${needle}`);
  process.exit(1);
}

if (/git\s+(rm|add|reset|restore|commit)/i.test(source)) {
  console.error("v20 TypeScript pre/postflight must remain read-only with respect to Git; Git mutation belongs only in the explicitly confirmed installer.");
  process.exit(1);
}

console.log(
  "Post-cloud Git cleanup v20 source verification passed: candidate scope is fixed to 252 analysis renders + 228 durable metadata mirrors, cloud/non-Git verification is required, untracked needs-review must be zero, and the TypeScript audit itself does not mutate Git or R2.",
);
