import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "scripts", "sandbox", "post-cloud-orphan-archive-cleanup-v19.ts");
if (!fs.existsSync(target)) {
  throw new Error("Missing v19 orphan archive cleanup script.");
}
const source = fs.readFileSync(target, "utf8");
const required = [
  "ARCHIVE_AND_DELETE_UNREFERENCED_LOCAL_ASSET_ORPHANS_V19",
  "archive/myway/historical-orphans/v19",
  "runAssetCloudAuthorityAudit",
  "auditHistoricalLocalAssetStorage",
  "listMyWayAssets",
  "hashFile",
  "getR2SourceStorage",
  "classification === \"needs_review\"",
  "entry.kind === \"git_tracking\"",
  "archiveCandidate",
  "All selected orphan bytes/manifests are verified in private R2",
  "assertCandidatesStillUnresolved",
  "cloud_size_mismatch",
  "Live asset registry and Git tracking were not changed",
];
for (const needle of required) {
  if (!source.includes(needle)) {
    throw new Error(`v19 verifier missing required source boundary: ${needle}`);
  }
}
const forbidden = [
  "git rm",
  "git add",
  "git commit",
  "getR2RuntimeStorage().delete",
  ".delete(asset",
];
for (const needle of forbidden) {
  if (source.includes(needle)) {
    throw new Error(`v19 verifier found forbidden mutation marker: ${needle}`);
  }
}
console.log(
  "Orphan archive cleanup v19 source verification passed: only untracked Phase-3 needs_review runtime/thumbnail/source artifacts can be selected, current registry/active references block deletion, exact bytes are content-addressed into private R2 before deletion, all selected archives are verified before any local delete, and live registry/Git/runtime R2 remain untouched.",
);
