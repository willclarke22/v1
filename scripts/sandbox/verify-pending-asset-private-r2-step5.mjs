import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";

async function source(
  relative,
) {
  return readFile(
    relative,
    "utf8",
  );
}

const [
  types,
  normalizer,
  validator,
  pending,
  library,
  promotion,
  maintenance,
  review,
  enrichment,
  geometry,
  audit,
  cloudMigration,
  proxy,
  ui,
  reviewedResolver,
  migration,
] =
  await Promise.all([
    source("sandbox/probe-lab/assets/asset-types.ts"),
    source("sandbox/probe-lab/assets/normalize-asset-record.ts"),
    source("sandbox/probe-lab/assets/validate-asset-record.ts"),
    source("sandbox/probe-lab/assets/storage/pending-asset-storage.server.ts"),
    source("sandbox/probe-lab/assets/asset-library.server.ts"),
    source("sandbox/probe-lab/assets/asset-promotion.server.ts"),
    source("sandbox/probe-lab/assets/asset-maintenance.server.ts"),
    source("sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts"),
    source("sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts"),
    source("sandbox/probe-lab/assets/geometry/geometry-profile-worker.server.ts"),
    source("sandbox/probe-lab/assets/storage/asset-cloud-authority-audit.server.ts"),
    source("sandbox/probe-lab/assets/cloud-library-migration.server.ts"),
    source("sandbox/probe-lab/assets/routes/pending-file.ts"),
    source("sandbox/probe-lab/assets/ui/asset-library-lab.tsx"),
    source("sandbox/probe-lab/scene-resources/resolve-reviewed-scene-resources.server.ts"),
    source("scripts/sandbox/migrate-pending-asset-review-to-private-r2-step5.ts"),
  ]);

assert.match(types, /r2_private_pending/);
assert.match(normalizer, /value === "r2_private_pending"/);
assert.match(validator, /cannot be scene-approved before runtime R2 promotion/);

assert.match(pending, /pending\/assets\//);
assert.match(pending, /Private R2 pending-object conflict/);
assert.match(pending, /createAssetTempWorkspace/);
assert.match(pending, /hashTraceSafeFile/);
assert.match(
  pending,
  /createReadStream[\s\S]*turbopackIgnore:\s*true/,
  "Pending review hashing must remain behind an opaque Turbopack filesystem boundary.",
);
assert.doesNotMatch(
  pending,
  /content-hash\.server/,
  "Pending review storage must not use the generic project-wide hashFile helper.",
);
assert.doesNotMatch(
  pending,
  /getR2RuntimeStorage/,
  "Pending review bytes belong only in source/private R2.",
);

assert.match(library, /duplicateHash[\s\S]*stageLocalAssetAsPrivatePending/);
assert.match(library, /cleanupLocalPendingStageFiles/);
assert.match(library, /pendingAssetReviewObjectExists/);

assert.match(promotion, /materializePendingAssetReviewFiles/);
assert.match(
  promotion,
  /runtime\.exists[\s\S]*updateMyWayAsset/,
  "Runtime R2 verification must occur before the registry switches from private pending to runtime R2.",
);
assert.match(promotion, /deletePendingAssetReviewObjects/);

assert.match(maintenance, /r2_private_pending[\s\S]*getR2SourceStorage/);
assert.match(review, /removeMyWayAssetCompletely[\s\S]*startMissingAssetAcquisition/);
assert.match(
  review,
  /cannot be approved for automatic scene use until its licence\/provenance clears public runtime-R2 promotion/,
);

assert.match(enrichment, /r2_private_pending[\s\S]*materializePendingAssetReviewModel/);
assert.match(geometry, /r2_private_pending[\s\S]*materializePendingAssetReviewModel/);
assert.match(geometry, /finally[\s\S]*materialized\.cleanup/);

assert.match(audit, /pending_review_model/);
assert.match(audit, /pending_review_thumbnail/);
assert.match(
  cloudMigration,
  /storage_provider ===\s*"local"[\s\S]*scene_review_status ===\s*"approved"/,
);

assert.match(proxy, /readPendingAssetReviewObject/);
assert.doesNotMatch(proxy, /searchParams[\s\S]*get\(\s*"object_key"/);
assert.match(proxy, /private, no-store/);

assert.match(ui, /Private R2 review candidate/);
assert.match(ui, /Awaiting licence clearance/);

assert.match(
  reviewedResolver,
  /asset\.storage_provider\s*===\s*"r2_private_pending"/,
  "Reviewed scene resolution must reject private pending assets.",
);

assert.match(migration, /MIGRATE_PENDING_ASSET_REVIEW_TO_PRIVATE_R2/);
assert.match(migration, /R2 deletes performed by successful migration: 0/);

console.log(
  "Step 5 private pending Asset Library source verification passed.",
);
