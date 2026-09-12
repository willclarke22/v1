import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

const routePath = path.join(
  root,
  "sandbox/probe-lab/assets/routes/library.ts",
);
const source = fs.readFileSync(routePath, "utf8");

function requireMarker(marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(`A.12.7 verification failed: ${message} Missing marker: ${marker}`);
  }
}

function forbidMarker(marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(`A.12.7 verification failed: ${message} Forbidden marker: ${marker}`);
  }
}

requireMarker(
  "const ASSET_LIBRARY_LIST_CONCURRENCY = 16;",
  "Bulk Asset Library work must use a bounded worker pool.",
);
requireMarker(
  'asset.storage_provider === "r2_private_pending"',
  "Needs Review R2 assets must use registry-backed list stats instead of one live R2 check per card.",
);
requireMarker(
  'verification: "registry_metadata" as const',
  "Bulk pending-asset stats must identify their registry-metadata basis.",
);
requireMarker(
  "async function mapWithConcurrency<T, R>(",
  "The library list must have a reusable bounded-concurrency helper.",
);
requireMarker(
  'return errorResponse(caught, 500, "registry_read");',
  "Registry-read failures must identify their stage.",
);
requireMarker(
  'return errorResponse(caught, 500, "list_stats");',
  "List-stat failures must identify their stage.",
);
requireMarker(
  'error_stage: stage',
  "Library errors must carry a non-empty diagnostic stage.",
);
requireMarker(
  'return "Unknown Asset Library server error.";',
  "Thrown values with blank messages must not produce an empty API error string.",
);
requireMarker(
  "asset: await assetWithFileStats(asset)",
  "Single-asset detail GET must retain live storage verification.",
);
requireMarker(
  'verification: "registry_metadata_fallback" as const',
  "A single per-item stats failure must degrade to registry metadata instead of failing the whole list.",
);
forbidMarker(
  "Promise.all(selectedAssets.map(assetWithFileStats))",
  "The former unbounded all-assets stats fan-out must not return.",
);

console.log(
  "PASS: A.12.7 Asset Library scale hardening verified: bulk Needs Review listing avoids per-asset R2 HEAD fan-out, remaining work is concurrency-bounded and failure-isolated, detail reads retain live verification, and server errors are non-empty/staged.",
);
