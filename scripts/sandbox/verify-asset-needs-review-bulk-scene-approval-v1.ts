import fs from "node:fs";
import path from "node:path";

import {
  needsReviewSceneApprovalMetadataBlocker,
} from "../../sandbox/probe-lab/assets/needs-review-scene-approval-policy";

const root = process.cwd();
const source = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const base = {
  status: "normalized",
  scene_review_status: "pending",
  semantic_review_status: "verified",
  safe_to_use_in_sandbox: true,
  storage_provider: "local",
  appearance_profile: {
    status: "ready",
  },
  appearance_embedding: {
    status: "ready",
    vector_key:
      "sandbox/probe-lab/assets/embeddings/example.json",
  },
};

check(
  needsReviewSceneApprovalMetadataBlocker(base) === null,
  "A fully enriched eligible Needs Review asset should pass bulk approval/publish metadata gates.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    scene_review_status: "approved",
  }) !== null,
  "Already-approved assets must not be treated as Needs Review bulk candidates.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    semantic_review_status: "pending",
  }) === "semantic_identity_not_verified",
  "Bulk approval must preserve semantic verification.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    appearance_profile: { status: "failed" },
  }) === "vision_not_ready",
  "Bulk approval must require ready Omni vision.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    appearance_embedding: {
      status: "pending",
      vector_key: null,
    },
  }) === "embedding_not_ready",
  "Bulk approval must require a ready appearance embedding.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    appearance_embedding: {
      status: "ready",
      vector_key: null,
    },
  }) === "embedding_not_ready",
  "A ready embedding without a durable vector key must not qualify for bulk publication.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    safe_to_use_in_sandbox: false,
  }) === "not_safe_for_scene_use",
  "Bulk approval must fail closed for unsafe assets.",
);
check(
  needsReviewSceneApprovalMetadataBlocker({
    ...base,
    storage_provider: "r2_private_pending",
  }) === null,
  "Private-R2 state must be delegated to the existing individual approve/publish authority rather than blocked by the enrichment selector.",
);

const reviewSource = source(
  "sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts",
);
const bulkStart = reviewSource.indexOf(
  "export async function approveAllNeedsReviewAssetsForSceneUse",
);
const bulkEnd = reviewSource.indexOf(
  "export async function approveAndPublishAsset",
  bulkStart,
);
check(
  bulkStart >= 0 && bulkEnd > bulkStart,
  "Bulk Needs Review approval helper is missing.",
);
const bulkSource = reviewSource.slice(bulkStart, bulkEnd);
for (const marker of [
  'asset.scene_review_status ===\n        "pending"',
  "needsReviewSceneApprovalMetadataBlocker",
  "assetWithFileStats",
  "approveAndPublishAsset",
  "confirmManualLicenseReview",
  "true",
  "published_count",
  "local_scene_only_count",
  "published_asset_ids",
  "skipped_count",
]) {
  check(
    bulkSource.includes(marker),
    `Bulk approval/publish is missing required behavior marker: ${marker}`,
  );
}
for (const forbidden of [
  "promoteMyWayAssetToR2(",
  "writeApprovedPolyPizzaLicenseReview(",
  "writeApprovedManualCc0LicenseReview(",
  "reviewMyWayAssetForScenes({",
  "markMissingAssetCandidateApproved(",
]) {
  check(
    !bulkSource.includes(forbidden),
    `Bulk helper must reuse approveAndPublishAsset instead of duplicating its internal authority: ${forbidden}`,
  );
}

const routeSource = source(
  "sandbox/probe-lab/assets/routes/acquisition.ts",
);
check(
  routeSource.includes('"approve_all_scene_use"') &&
    routeSource.includes("approveAllNeedsReviewAssetsForSceneUse"),
  "Acquisition route does not expose the bulk approval/publish action.",
);

const uiSource = source(
  "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
);
for (const marker of [
  "Approve all assets for scene use",
  'reviewView === "needs_review"',
  "bulkSceneApprovalRunning",
  '"approve_all_scene_use"',
  "appearance_profile?.status ===",
  "appearance_embedding?.status ===",
  "vector_key?.trim()",
  "same approval/publication path as the individual",
  "published to Cloudflare R2",
  "local_scene_only_count",
  "Skipped assets remain in Needs review",
]) {
  check(
    uiSource.includes(marker),
    `Asset Library UI missing bulk approval/publish marker: ${marker}`,
  );
}
check(
  !uiSource.includes(
    "This does not publish assets or change licences.",
  ),
  "The old scene-use-only bulk copy must not survive the publication rewire.",
);


const polyPizzaTestSource = source(
  "sandbox/probe-lab/assets/tests/verify-poly-pizza-cc-by-pipeline.ts",
);
for (const marker of [
  "MAX_MANUAL_GLB_BATCH_FILES,\n  200",
  '/manualAcquisitionMode === "import"/',
  "/<SmartAssetImportLab/",
  "/Import Asset/",
  'assert.doesNotMatch(\n  libraryUiSource,\n  /manualAcquisitionMode === "cc0"/',
  'assert.doesNotMatch(\n  libraryUiSource,\n  /manualAcquisitionMode === "cc_by"/',
]) {
  check(
    polyPizzaTestSource.includes(marker),
    `Poly Pizza regression fixture is not aligned with the current unified Import Asset contract: ${marker}`,
  );
}

console.log(
  "Asset Library Needs Review bulk approval/publish verification passed.",
);
console.log(
  "The Needs Review button now requires ready Omni vision plus a durable ready embedding, then reuses the exact individual approveAndPublishAsset authority for scene approval, licence-aware R2 publication, and acquisition bookkeeping.",
);
