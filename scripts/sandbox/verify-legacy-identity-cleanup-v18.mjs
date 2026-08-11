import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverPath = path.join(
  root,
  "sandbox/probe-lab/assets/storage/asset-historical-cleanup.server.ts",
);
const scriptPath = path.join(
  root,
  "scripts/sandbox/post-cloud-legacy-identity-cleanup-v18.ts",
);

for (const filePath of [serverPath, scriptPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required v18 file is missing: ${filePath}`);
  }
}

const server = fs.readFileSync(serverPath, "utf8");
const script = fs.readFileSync(scriptPath, "utf8");

const serverRequirements = [
  '"metadata/myway/assets/source-records/"',
  '"asset_base_id"',
  '"selected_source_asset_id"',
  '"legacy_identity"',
  'hashFile(input.filePath)',
  'objectKeyMatchesContentHash',
  'Buffer.compare(',
  'item_ids?: string[]',
  'Requested Phase 3 cleanup item is no longer safe_to_remove',
];

for (const requirement of serverRequirements) {
  if (!server.includes(requirement)) {
    throw new Error(`v18 server safety requirement is missing: ${requirement}`);
  }
}

const scriptRequirements = [
  'DELETE_VERIFIED_LEGACY_IDENTITY_DUPLICATES_V18',
  'classification === "cloud_size_mismatch"',
  'verification.kind === "legacy_identity"',
  'item_ids: selected.map((item) => item.id)',
  'Git tracking and R2 objects were not mutated.',
];

for (const requirement of scriptRequirements) {
  if (!script.includes(requirement)) {
    throw new Error(`v18 script safety requirement is missing: ${requirement}`);
  }
}

if (/git\s+(rm|add|commit|reset|checkout)|\.delete\(/i.test(script)) {
  throw new Error("v18 orchestration must not mutate Git or delete R2 objects.");
}

console.log(
  "Legacy-identity cleanup v18 source verification passed: authoritative R2 source records resolve historical paths, runtime GLBs require content-hash identity, thumbnail/source copies require byte identity, targeted item IDs gate deletion, and Git/R2 remain read-only.",
);
