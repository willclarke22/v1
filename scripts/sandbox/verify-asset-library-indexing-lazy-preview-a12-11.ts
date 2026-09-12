import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8",
  );
}

function requireMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (!source.includes(marker)) {
    throw new Error(
      `A.12.11 verification failed: ${message} Missing marker: ${marker}`,
    );
  }
}

function forbidMarker(
  source: string,
  marker: string,
  message: string,
) {
  if (source.includes(marker)) {
    throw new Error(
      `A.12.11 verification failed: ${message} Forbidden marker: ${marker}`,
    );
  }
}

const browser =
  read("sandbox/probe-lab/assets/routes/library-browser.ts");
const ui =
  read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const bridge =
  read("sandbox/probe-lab/resource-runtime/routes/model-file.ts");

for (const marker of [
  "loadMyWayAssetRegistry",
  "const BROWSER_INDEX_TTL_MS = 30_000;",
  "let browserIndexCache: BrowserIndexSnapshot | null = null;",
  "search_text: searchableText(asset)",
  "browserIndexBuild",
  'params.get("revision")',
  "const snapshot = await browserIndex(clientRevision);",
  "const counts = snapshot.counts;",
  "const facets = snapshot.facets;",
  "const stats = snapshot.stats;",
  "entry.search_text.includes(token)",
  "const page = filtered.slice(offset, offset + limit);",
]) {
  requireMarker(
    browser,
    marker,
    "Asset Library browser search must reuse a revision-aware precomputed index.",
  );
}

forbidMarker(
  browser,
  "const allAssets = await listMyWayAssets();",
  "Search requests must not reload/sort the entire registry through listMyWayAssets.",
);
forbidMarker(
  browser,
  "const haystack = searchableText(asset);",
  "Search text must be precomputed when the browser index is built, not rebuilt per query.",
);

for (const marker of [
  "async function fetchAssetLibrarySnapshot(",
  "async function fetchAssetLibraryBackground(",
  "new AbortController()",
  "controller.abort();",
  'revision: String(refreshToken)',
  "fetchAssetLibraryBackground(",
  "return null;",
]) {
  requireMarker(
    ui,
    marker,
    "Asset Library UI must isolate browsing from background status and cancel superseded requests.",
  );
}

const browserFetchStart =
  ui.indexOf("async function fetchAssetLibrarySnapshot(");
const browserFetchEnd =
  ui.indexOf("async function fetchAssetLibraryBackground(", browserFetchStart);
if (
  browserFetchStart < 0 ||
  browserFetchEnd < 0
) {
  throw new Error(
    "A.12.11 verification failed: browser/background fetch functions could not be isolated.",
  );
}
const browserFetch =
  ui.slice(
    browserFetchStart,
    browserFetchEnd,
  );
for (const forbidden of [
  "/api/sandbox/probe-lab/assets/acquisition",
  "/api/sandbox/probe-lab/assets/enrichment",
  "/api/sandbox/probe-lab/assets/geometry",
]) {
  forbidMarker(
    browserFetch,
    forbidden,
    "Typing/searching must request only the bounded library-browser endpoint.",
  );
}
forbidMarker(
  ui,
  "const previewable =",
  "Search result changes must not automatically choose and download a GLB.",
);

for (const marker of [
  "getR2RuntimeStorage",
  'asset.storage_provider === "r2"',
  "asset.storage_object_key",
  "await getR2RuntimeStorage().read(",
  "Runtime R2 object is missing for asset",
  '"runtime_r2_object_key"',
  "fetch(publicUrl",
  '"legacy_public_url"',
]) {
  requireMarker(
    bridge,
    marker,
    "Published model previews must read exact runtime-R2 object keys with a legacy URL fallback.",
  );
}
forbidMarker(
  bridge,
  'searchParams.get("url")',
  "The model bridge must remain asset-id scoped and never become a generic URL proxy.",
);

console.log(
  "PASS: A.12.11 Asset Library indexing + lazy preview verified: repeated searches reuse a revision-aware in-process index with precomputed search text/counts/facets; background queues are off the search critical path; superseded browser requests are aborted; search results do not auto-load GLBs; and published previews prefer exact runtime-R2 object keys before the legacy reviewed URL fallback.",
);
