import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (!source.includes(marker)) {
    throw new Error(`${message} Missing marker: ${marker}`);
  }
}

function forbidMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (source.includes(marker)) {
    throw new Error(`${message} Forbidden marker: ${marker}`);
  }
}

const snapshot = read(
  "sandbox/probe-lab/assets/asset-browser-snapshot.server.ts",
);
const browser = read(
  "sandbox/probe-lab/assets/routes/library-browser.ts",
);
const library = read(
  "sandbox/probe-lab/assets/routes/library.ts",
);
const pending = read(
  "sandbox/probe-lab/assets/routes/pending-file.ts",
);
const model = read(
  "sandbox/probe-lab/resource-runtime/routes/model-file.ts",
);
const ui = read(
  "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
);
const viewer = read(
  "sandbox/probe-lab/assets/ui/asset-library-viewer.tsx",
);
const maintenance = read(
  "sandbox/probe-lab/assets/bodyparts3d-thumbnail-maintenance.server.ts",
);
const maintenanceRoute = read(
  "sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails.ts",
);
const maintenanceUi = read(
  "sandbox/probe-lab/assets/ui/bodyparts3d-thumbnail-maintenance-lab.tsx",
);
const jobTypes = read(
  "sandbox/probe-lab/assets/blender/blender-job-types.ts",
);
const blender = read(
  "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
);
const api = read(
  "app/api/sandbox/probe-lab/assets/bodyparts3d-thumbnails/route.ts",
);

for (const marker of [
  "ASSET_BROWSER_SNAPSHOT_TTL_MS = 5 * 60_000",
  "by_reference: Map<string, MyWayAssetRecord>",
  "getAssetBrowserRegistrySnapshot",
  "getAssetBrowserRegistryAsset",
  "invalidateAssetBrowserRegistrySnapshot",
]) {
  requireMarker(
    snapshot,
    marker,
    "Asset-ID hydration must reuse a five-minute revision-scoped normalized registry snapshot.",
  );
}

for (const marker of [
  "getAssetBrowserRegistrySnapshot(clientRevision)",
  "versionedThumbnailPath",
  "thumbnail_etag: asset.thumbnail_etag ?? null",
  "public_path: asset.public_path",
  "dimensions_m: asset.dimensions_m",
  "geometry_profile: asset.geometry_profile?.local_bounds",
  "v: asset.thumbnail_etag || asset.thumbnail_object_key || asset.asset_id",
]) {
  requireMarker(
    browser,
    marker,
    "Browser card summaries must provide stable versioned cached thumbnails and enough preview metadata for click-immediate viewing.",
  );
}

for (const marker of [
  "getAssetBrowserRegistryAsset",
  'searchParams.get("revision")',
  "browserDetailStats(asset)",
]) {
  requireMarker(
    library,
    marker,
    "Browser detail hydration must reuse the revision-scoped registry snapshot and avoid an R2 HEAD before preview.",
  );
}

for (const marker of [
  "getAssetBrowserRegistryAsset",
  'searchParams.get("revision")',
  'searchParams.get("v")',
  '"private, max-age=31536000, immutable"',
  '"private, max-age=3600, stale-while-revalidate=86400"',
  "ETag: object.etag",
]) {
  requireMarker(
    pending,
    marker,
    "Private thumbnails/models must reuse indexed asset lookup and use cacheable versioned browser responses.",
  );
}

for (const marker of [
  "getAssetBrowserRegistryAsset",
  'searchParams.get("revision")',
  "getR2RuntimeStorage().read",
]) {
  requireMarker(
    model,
    marker,
    "Reviewed model loading must reuse the browser registry snapshot before reading the exact runtime-R2 object.",
  );
}

for (const marker of [
  "function preloadAssetLibraryViewer()",
  "onMouseEnter={preloadAssetLibraryViewer}",
  "onFocus={preloadAssetLibraryViewer}",
  "const selectedViewerAsset = selectedAsset ?? selectedCardAsset",
  "registryRevision={String(refreshToken)}",
  "&revision=${encodeURIComponent(String(refreshToken))}",
  "onError={() => setFailed(true)}",
  "thumbnail unavailable",
  "const BodyParts3dThumbnailMaintenanceLab = dynamic(",
  "<BodyParts3dThumbnailMaintenanceLab",
]) {
  requireMarker(
    ui,
    marker,
    "Asset cards must surface thumbnail failures, prefetch only the viewer code, start preview from card metadata, and expose explicit anatomy maintenance.",
  );
}

for (const marker of [
  "registryRevision?: string",
  "withRevision",
  "modelUrl(asset, registryRevision)",
]) {
  requireMarker(
    viewer,
    marker,
    "Viewer model requests must carry the same registry revision as the selected card.",
  );
}

for (const marker of [
  "auditBodyParts3dThumbnailBatch",
  "recoverable_reference",
  "missing_object",
  "pendingAssetThumbnailObjectKey",
  "readPendingAssetReviewObject(asset, \"model\")",
  "thumbnail_color_hex",
  "source.uploadBytes",
  "repairThumbnailReference",
  "invalidateAssetBrowserRegistrySnapshot",
]) {
  requireMarker(
    maintenance,
    marker,
    "Anatomy thumbnail maintenance must audit first, repair orphaned references without Blender, and regenerate only genuinely missing PNGs.",
  );
}

for (const marker of [
  'action === "audit_batch"',
  'action === "backfill_one"',
  "maxDuration = 300",
]) {
  requireMarker(
    maintenanceRoute,
    marker,
    "Anatomy thumbnail maintenance route must expose bounded explicit audit/backfill actions.",
  );
}

for (const marker of [
  "Audit 2,234 anatomy thumbnails",
  "Repair next",
  "This does not re-import the atlas",
  "slice(0, 4)",
]) {
  requireMarker(
    maintenanceUi,
    marker,
    "Anatomy maintenance UI must require explicit user action and repair only small targeted batches.",
  );
}

requireMarker(
  api,
  'export { POST } from "@/sandbox/probe-lab/assets/routes/bodyparts3d-thumbnails";',
  "Anatomy thumbnail API wrapper is missing.",
);
requireMarker(
  jobTypes,
  "thumbnail_color_hex?: string | null",
  "Blender normalize jobs must support a render-only semantic thumbnail tint.",
);
for (const marker of [
  "def apply_thumbnail_color(color_hex):",
  "def make_thumbnail(thumbnail_path, dimensions, color_hex=None):",
  'make_thumbnail(job["thumbnail_path"], dimensions, job.get("thumbnail_color_hex"))',
]) {
  requireMarker(
    blender,
    marker,
    "Blender must support semantic thumbnail coloring without changing the exported GLB.",
  );
}
requireMarker(
  blender,
  'export_glb(job["output_path"])\n        make_thumbnail(',
  "Thumbnail-only color must be applied after GLB export so runtime model materials remain untouched.",
);

forbidMarker(
  maintenanceUi,
  "useEffect(() => {\n    void audit()",
  "Thumbnail audit/backfill must not run automatically on page mount.",
);
console.log(
  "PASS: A.12.13 Asset Library thumbnail + click hydration verified: revision-scoped asset lookup is shared across search/detail/proxies; card thumbnails are versioned/cacheable with visible failures; card metadata can start preview immediately while full detail loads in parallel; viewer code prefetches on intent; and BodyParts3D thumbnail maintenance audits before repairing or regenerating small explicit batches with semantic render-only colors.",
);
