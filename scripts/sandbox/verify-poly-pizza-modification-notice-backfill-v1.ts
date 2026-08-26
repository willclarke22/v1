import fs from "node:fs";
import path from "node:path";

import {
  MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE,
} from "../../sandbox/probe-lab/assets/asset-attribution";

const root = process.cwd();
const source = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

check(
  MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE ===
    "Normalized and processed for real-time use by MyWay.",
  "The standard MyWay runtime modification notice changed unexpectedly.",
);

const provider = source(
  "sandbox/probe-lab/assets/providers/manual-glb-provider.server.ts",
);
for (const marker of [
  "MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE",
  'sourceProvider.toLowerCase() ===\n    "poly pizza"',
  "cleanText(input.modificationNotice, 1000) ||",
  "? MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE",
]) {
  check(
    provider.includes(marker),
    `Manual GLB provider is missing Poly Pizza modification-notice defaulting: ${marker}`,
  );
}
check(
  !provider.includes(
    'cleanText(input.modificationNotice, 1000) ||\n    null;',
  ),
  "Manual GLB provider must not leave normalized Poly Pizza imports without the deterministic processing notice.",
);

const smartUi = source(
  "sandbox/probe-lab/assets/ui/smart-asset-import-lab.tsx",
);
for (const marker of [
  "defaultModificationNoticeFor(",
  'sourceProvider.trim().toLowerCase() ===\n      "poly pizza"',
  "MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE",
  "knownMetadata?.source_provider ??",
]) {
  check(
    smartUi.includes(marker),
    `Unified Import Asset UI is missing current modification-notice behavior: ${marker}`,
  );
}
check(
  !smartUi.includes(
    'knownMetadata?.license_kind === "cc_by" ||\n                knownMetadata?.license_kind === "cc_by_4_0"',
  ),
  "Known Poly Pizza CC0 bundle members must not be excluded from the standard modification notice.",
);

const library = source(
  "sandbox/probe-lab/assets/asset-library.server.ts",
);
for (const marker of [
  "const preservedProvenanceNotes =",
  "input.provenanceNotes === undefined",
  "previousSource?.provenance_notes",
  "previousLicense?.provenance_notes",
  "provenance_notes:\n      preservedProvenanceNotes",
]) {
  check(
    library.includes(marker),
    `Provenance updates must preserve existing durable notes when the caller only repairs attribution metadata: ${marker}`,
  );
}

const review = source(
  "sandbox/probe-lab/assets/acquisition/missing-asset-review.server.ts",
);
const helperStart = review.indexOf(
  "async function ensureStandardPolyPizzaModificationNotice",
);
const helperEnd = review.indexOf(
  "export type NeedsReviewBulkSceneApprovalSkip",
  helperStart,
);
check(
  helperStart >= 0 && helperEnd > helperStart,
  "The deterministic legacy Poly Pizza modification-notice repair helper is missing.",
);
const helper = review.slice(helperStart, helperEnd);
for (const marker of [
  "isPolyPizzaManualLicenseCandidate(asset)",
  'asset.storage_provider === "r2"',
  "asset.attribution?.modification_notice?.trim()",
  "updateMyWayAssetProvenance({",
  "MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE",
  "provenanceNotes: undefined",
  "backfilled: true",
]) {
  check(
    helper.includes(marker),
    `Legacy Poly Pizza repair helper is missing a required safety/repair marker: ${marker}`,
  );
}
for (const requiredRealMetadata of [
  "!attribution",
  "!sourceProvider",
  "!sourceAssetId",
  "!sourceUrl",
  "!assetTitle",
  "!creatorName",
  "attribution.source_asset_id?.trim() !==",
  "attribution.source_url?.trim() !==",
  "attribution.license_name !==",
  "!asset.commercial_use_allowed",
  "!asset.raw_redistribution_allowed",
]) {
  check(
    helper.includes(requiredRealMetadata),
    `Modification-notice repair must refuse to invent missing provenance: ${requiredRealMetadata}`,
  );
}

const approveStart = review.indexOf(
  "export async function approveAndPublishAsset",
);
const approveEnd = review.indexOf(
  "export async function rejectAndRetryMissingAsset",
  approveStart,
);
const approve = review.slice(approveStart, approveEnd);
check(
  approve.includes(
    "await ensureStandardPolyPizzaModificationNotice(",
  ),
  "Individual approval must run the safe legacy Poly Pizza notice repair before licence review.",
);
check(
  approve.includes(
    "modification_notice_backfilled:",
  ),
  "Individual approval must report whether it repaired the legacy notice.",
);

const bulkStart = review.indexOf(
  "export async function approveAllNeedsReviewAssetsForSceneUse",
);
const bulkEnd = review.indexOf(
  "export async function approveAndPublishAsset",
  bulkStart,
);
const bulk = review.slice(bulkStart, bulkEnd);
for (const marker of [
  "modificationNoticeBackfilledAssetIds",
  "result.modification_notice_backfilled",
  "modification_notice_backfilled_count",
  "modification_notice_backfilled_asset_ids",
]) {
  check(
    bulk.includes(marker),
    `Bulk approval must expose legacy Poly Pizza repair accounting: ${marker}`,
  );
}

const libraryUi = source(
  "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
);
for (const marker of [
  "modification_notice_backfilled_count",
  "legacy Poly Pizza modification notice",
  "Bulk approval complete:",
]) {
  check(
    libraryUi.includes(marker),
    `Asset Library must surface modification-notice repair accounting: ${marker}`,
  );
}

const knownBundles = source(
  "sandbox/probe-lab/assets/known-asset-bundles.ts",
);
const officePackCc0Count = (
  knownBundles.match(
    /"license_kind": "cc0", "source_provider": "Poly Pizza"/g,
  ) ?? []
).length;
check(
  officePackCc0Count > 0,
  "Known Poly Pizza bundle metadata should contain CC0 members for this regression canary.",
);

console.log(
  "Poly Pizza modification-notice backfill verification passed.",
);
console.log(
  `Normalized Poly Pizza imports now receive the standard processing notice server-side; legacy pending candidates repair only that deterministic field before the existing individual approval/publication authority runs. Known-bundle CC0 metadata rows detected: ${officePackCc0Count}.`,
);
