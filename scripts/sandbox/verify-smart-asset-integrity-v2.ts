import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const manualBatch = source("sandbox/probe-lab/assets/manual-glb-batch-intake.ts");
const smartArchive = source("sandbox/probe-lab/assets/smart-asset-archive.ts");
const manualProvider = source("sandbox/probe-lab/assets/providers/manual-glb-provider.server.ts");
const library = source("sandbox/probe-lab/assets/asset-library.server.ts");
const libraryRoute = source("sandbox/probe-lab/assets/routes/library.ts");
const enrichmentWorker = source("sandbox/probe-lab/assets/enrichment/asset-enrichment-worker.server.ts");
const enrichmentRoute = source("sandbox/probe-lab/assets/routes/enrichment.ts");
const enrichmentProvider = source("sandbox/probe-lab/assets/enrichment/asset-enrichment-provider.server.ts");
const importLocal = source("sandbox/probe-lab/assets/routes/import-local.ts");
const importSmart = source("sandbox/probe-lab/assets/routes/import-smart.ts");
const importSmartApi = source("app/api/sandbox/probe-lab/assets/import-smart/route.ts");
const ledger = source("sandbox/probe-lab/assets/asset-import-ledger.server.ts");
const identity = source("sandbox/probe-lab/assets/asset-identity.ts");
const cloudMigration = source("sandbox/probe-lab/assets/asset-identity-cloud-migration.server.ts");
const audit = source("sandbox/probe-lab/assets/asset-identity-audit.server.ts");
const auditRoute = source("sandbox/probe-lab/assets/routes/identity-audit.ts");
const auditApi = source("app/api/sandbox/probe-lab/assets/identity-audit/route.ts");
const smartUi = source("sandbox/probe-lab/assets/ui/smart-asset-import-lab.tsx");
const auditUi = source("sandbox/probe-lab/assets/ui/asset-identity-audit-lab.tsx");
const libraryUi = source("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const blenderKit = source("sandbox/probe-lab/assets/providers/blenderkit-provider.server.ts");
const trellis = source("sandbox/probe-lab/assets/providers/trellis-asset-provider.server.ts");
const knownBundles = source("sandbox/probe-lab/assets/known-asset-bundles.ts");

check(manualBatch.includes("MAX_MANUAL_GLB_BATCH_FILES = 200"), "Manual batch cap is not 200.");
check(smartArchive.includes("MAX_SMART_ASSET_BATCH_FILES = 200"), "Smart intake batch cap is not 200.");

for (const marker of [
  "buildProviderAwareAssetId",
  "runEmbedding?: boolean",
  "replaceMissingAssetId",
  "queueAssetEnrichment(registered.asset.asset_id, {",
  "runEmbedding: input.runEmbedding !== false",
]) {
  check(manualProvider.includes(marker), `Manual provider missing marker: ${marker}`);
}
check(manualProvider.includes("autoEnrich: false"), "Manual import no longer disables hidden registration enrichment.");
check(manualProvider.includes("repaired_existing"), "Missing-file source duplicates are not repairable.");
check(manualProvider.includes("runtime model is missing"), "Missing approved binaries are not guarded from silent replacement.");
check(library.includes("replaceMissingAssetId?: string | null"), "Registry cannot explicitly replace a missing duplicate asset.");
check(library.includes("options.autoEnrich !== false"), "registerMyWayAsset can still auto-enrich when explicitly disabled.");
check(library.includes("prepareAssetIdentityStorageMigration"), "Asset rename does not invoke storage migration.");
check(library.includes("queueEmbeddingRefresh?: boolean"), "Identity updates cannot suppress embedding refreshes.");

for (const marker of ["vision_only", "embedding_only", "runEmbedding?: boolean"]) {
  check(enrichmentWorker.includes(marker), `Enrichment worker missing independent mode marker: ${marker}`);
}
check(
  enrichmentWorker.includes("Appearance analysis is not ready. Run Omni vision first; embedding-only mode never starts the vision provider."),
  "Embedding-only mode can still silently start vision.",
);
check(enrichmentRoute.includes('action === "analyze_vision"'), "Vision-only route action missing.");
check(enrichmentRoute.includes('action === "refresh_embedding"'), "Embedding-only route action missing.");
check(
  enrichmentProvider.includes('"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"'),
  "Asset vision is not using the intended Omni model.",
);
check(
  enrichmentProvider.includes('"nvidia/nemotron-3-embed-1b"'),
  "Asset embedding default model changed unexpectedly.",
);

for (const route of [importLocal, importSmart]) {
  for (const marker of ["run_embedding", "import_run_id", "import_row_index", "import_batch_title", "import_ledger"]) {
    check(route.includes(marker), `Import route missing ${marker}`);
  }
}
check(importSmart.includes("readSmartAssetImportLedger"), "Smart route cannot recover a durable import ledger.");
check(importSmartApi.includes("export { GET, POST }"), "Smart API wrapper does not expose ledger recovery GET.");
for (const marker of [
  'schema_version: "myway_smart_asset_import_ledger_v1"',
  "sandbox/probe-lab/assets/import-ledgers/",
  "accounted",
  "duplicate",
  "failed",
]) {
  check(ledger.includes(marker), `Import ledger missing marker: ${marker}`);
}

for (const marker of [
  '"polyp"',
  '"acg"',
  '"bk"',
  '"trl"',
  '"proc"',
  '"man"',
  "stableAssetIdentitySuffix",
  "buildProviderAwareAssetId",
  "sourceAssetId",
  "sourceUrl",
  "Existing provider-aware IDs such as soldier_polyp_<id>",
  "ugiy7ycqp9",
  "safe_to_auto_rename",
]) {
  check(identity.includes(marker), `Provider-aware identity layer missing marker: ${marker}`);
}
check(blenderKit.includes("buildProviderAwareAssetId"), "BlenderKit does not use provider-aware final naming.");
check(blenderKit.includes("_bk_pending_"), "BlenderKit lacks provisional-to-final identity flow.");
check(trellis.includes("buildProviderAwareAssetId"), "TRELLIS does not use provider-aware final naming.");
check(trellis.includes("_trl_pending_"), "TRELLIS lacks provisional-to-final identity flow.");

for (const marker of [
  "copyVerifiedR2Object",
  "prepareAssetIdentityStorageMigration",
  "analysis_views",
  "source_storage_provider",
  "thumbnail_storage_provider",
  "rollback",
  "commit",
]) {
  check(cloudMigration.includes(marker), `Cloud identity migration missing marker: ${marker}`);
}

for (const marker of [
  'review_bucket: "needs_review" | "approved" | "other"',
  "safe_needs_review_repairs",
  "approved_with_legacy_ids",
  "applyAssetIdentityRepair",
  "applySafeNeedsReviewIdentityRepairs",
  "verifyStorage",
]) {
  check(audit.includes(marker), `Identity audit server missing marker: ${marker}`);
}
check(auditRoute.includes('action === "apply_safe_needs_review"'), "Safe Needs Review audit route missing.");
check(auditRoute.includes("exclude_asset_ids"), "Safe repair batching cannot exclude failed rows.");
check(auditApi.includes("maxDuration = 300"), "Identity-audit API max duration is not 300 seconds.");

for (const marker of [
  "Run Omni vision after import",
  "Generate embedding after import",
  "myway_smart_asset_import_last_run_v1",
  "without refreshing the library",
  "accounted",
  "onBatchComplete",
  "import_run_id",
]) {
  check(smartUi.includes(marker), `Smart import UI missing marker: ${marker}`);
}
check(!smartUi.includes("onImportComplete?.(payload.asset.asset_id)"), "Smart intake still refreshes/selects the main library per imported row.");

for (const marker of [
  "Asset identity audit",
  "Needs Review assets can be safely migrated automatically",
  "Approved assets are shown too, but never mass-renamed",
  "Technical asset ID",
  "Display name",
  "Canonical identity",
  "Refresh embeddings after semantic identity edits",
]) {
  check(auditUi.includes(marker), `Identity audit UI missing marker: ${marker}`);
}

for (const marker of [
  "renameSelectedAssetId",
  "Rename asset ID",
  "Canonical label",
  "Refresh embedding after identity edits",
  "queue_embedding_refresh: refreshIdentityEmbedding",
  "◉ embedding ready",
  "◌ embedding pending",
  "Analyze vision",
  "Generate embedding",
  "AssetIdentityAuditLab",
]) {
  check(libraryUi.includes(marker), `Main Asset Library lost identity/provider control marker: ${marker}`);
}
check(libraryRoute.includes("queueEmbeddingRefresh:"), "Manual identity route cannot suppress embedding refresh.");

// The known Office Pack manifest should still be present and large enough to cover the downloaded pack.
const officeMemberCount = (knownBundles.match(/"bundle_title": "The Office Pack"/g) ?? []).length;
check(officeMemberCount === 125, `Expected 125 Office Pack manifest members, found ${officeMemberCount}.`);

for (const wrapper of [
  source("app/api/sandbox/probe-lab/assets/import-smart/route.ts"),
  source("app/api/sandbox/probe-lab/assets/identity-audit/route.ts"),
]) {
  check(wrapper.includes('runtime = "nodejs"'), "New API wrapper is not Node runtime.");
  check(wrapper.includes("maxDuration = 300"), "New API wrapper does not retain a 300 second max duration.");
}

console.log("Smart Asset Integrity v2 verification passed.");
