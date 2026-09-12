import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(rootIndex >= 0 && process.argv[rootIndex + 1] ? process.argv[rootIndex + 1] : process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMarker = (source: string, marker: string, message: string) => {
  if (!source.includes(marker)) throw new Error(`A.12.12 verification failed: ${message} Missing marker: ${marker}`);
};
const forbidMarker = (source: string, marker: string, message: string) => {
  if (source.includes(marker)) throw new Error(`A.12.12 verification failed: ${message} Forbidden marker: ${marker}`);
};

const browser = read("sandbox/probe-lab/assets/routes/library-browser.ts");
const ui = read("sandbox/probe-lab/assets/ui/asset-library-lab.tsx");
const viewer = read("sandbox/probe-lab/assets/ui/asset-library-viewer.tsx");

for (const marker of [
  "const DEFAULT_LIMIT = 30;",
  "const MAX_LIMIT = 60;",
  "const BROWSER_INDEX_TTL_MS = 5 * 60_000;",
  "function browserCardSummary(asset: ListedAsset)",
  "const assets = page.map((entry) => browserCardSummary(entry.asset));",
  "search_text: searchableText(asset)",
]) requireMarker(browser, marker, "Browser results must use compact summaries and a long-lived precomputed index.");

forbidMarker(browser, "assetWithBrowserStats", "Search result pages must not hydrate complete records or probe per-card files.");
forbidMarker(browser, "mapWithConcurrency", "Browser card pages must not run per-result async hydration.");

for (const marker of [
  "const AmbientCgLibraryLab = dynamic(",
  "const SmartAssetImportLab = dynamic(",
  "const BodyParts3dSlpPilotImportLab = dynamic(",
  "const AssetIdentityAuditLab = dynamic(",
  "const AssetLibraryViewer = dynamic(",
  "function AssetCardThumbnail({ asset }",
  "new IntersectionObserver(",
  "rootMargin: \"320px 0px\"",
  "decoding=\"async\"",
  "fetchPriority=\"low\"",
  'limit: "30"',
  "Previous 30",
  "Next 30",
  "selectedAssetDetail",
  "asset detail",
  "!selectedAssetId ? (",
  "content-visibility: auto;",
]) requireMarker(ui, marker, "Client browsing must use lazy chunks, virtualized thumbnails, compact paging, and click-only detail hydration.");

forbidMarker(ui, "visibleAssets[0]?.asset_id", "Search/page changes must never auto-select the first asset.");
forbidMarker(ui, "@react-three/fiber", "The main Asset Library bundle must not statically include React Three Fiber.");
forbidMarker(ui, "@react-three/drei", "The main Asset Library bundle must not statically include Drei.");
forbidMarker(ui, "import * as THREE", "The main Asset Library bundle must not statically include Three.js.");
forbidMarker(ui, 'import { AmbientCgLibraryLab }', "Heavy resource workbenches must be dynamically imported.");
forbidMarker(ui, 'import { SmartAssetImportLab }', "Heavy import workbenches must be dynamically imported.");

for (const marker of [
  'import { Canvas } from "@react-three/fiber";',
  'import { Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";',
  "export function AssetLibraryViewer",
  "/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=",
  'asset.storage_provider === "r2_private_pending"',
]) requireMarker(viewer, marker, "The click-loaded viewer must preserve the existing safe model transport and anatomy preview behavior.");

console.log("PASS: A.12.12 Asset Library catalog virtualization verified: browser responses are compact 30-card summaries; the search index remains warm for five minutes per revision; thumbnails are intersection-gated; full asset records hydrate only after click; first-result auto-selection is removed; and Three.js plus secondary workbenches are split out of the initial client bundle.");
