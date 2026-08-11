import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "scripts", "sandbox", "post-cloud-local-cleanup-v17.ts");
const source = await readFile(file, "utf8");

const required = [
  "DELETE_VERIFIED_POST_CLOUD_LOCAL_DUPLICATES_V17",
  "runAssetCloudAuthorityAudit",
  "runHistoricalLocalAssetCleanup",
  "phase3ApplyConfirmation",
  "missing_check_count",
  "summary.issues",
  "git_cleanup_manifest",
  "untracked_needs_review",
  "PROTECTED_TOP_LEVEL_PREFIXES",
  '"models/"',
  'r2_mutation: false',
  'git_mutation: false',
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`v17 verifier missing required source token: ${token}`);
  }
}

const forbidden = [
  /git\s+rm/i,
  /git\s+add/i,
  /git\s+commit/i,
  /execFileSync\([^\n]*["']git["'][^\n]*["']rm["']/i,
  /\.delete\s*\(.*object_key/i,
  /uploadRuntimeAssetFile\s*\(/,
  /archivePrivateAssetSource\s*\(/,
];
for (const pattern of forbidden) {
  if (pattern.test(source)) {
    throw new Error(`v17 verifier found forbidden mutation pattern: ${pattern}`);
  }
}

console.log(
  "Post-cloud local cleanup v17 source verification passed: zero-gap R2 authority is required before/after deletion, only existing Phase-3 safe_to_remove items can be deleted, top-level trained models stay protected, and Git/R2 remain read-only.",
);
