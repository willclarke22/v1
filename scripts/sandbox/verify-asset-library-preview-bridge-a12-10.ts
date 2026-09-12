import fs from "node:fs";
import path from "node:path";

const rootIndex = process.argv.indexOf("--project-root");
const root = path.resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);

const uiPath = path.join(
  root,
  "sandbox/probe-lab/assets/ui/asset-library-lab.tsx",
);
const bridgePath = path.join(
  root,
  "sandbox/probe-lab/resource-runtime/routes/model-file.ts",
);

const ui = fs.readFileSync(uiPath, "utf8");
const bridge = fs.readFileSync(bridgePath, "utf8");

function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) {
    throw new Error(`${message} Missing marker: ${marker}`);
  }
}

function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) {
    throw new Error(`${message} Forbidden marker: ${marker}`);
  }
}

for (const marker of [
  "function assetLibraryBrowserModelUrl(asset: LibraryAsset)",
  'asset.storage_provider === "r2_private_pending"',
  "/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=",
  "const previewUrl = assetLibraryBrowserModelUrl(asset);",
  "<SemanticMaterialAsset src={previewUrl}",
  "<LoadedAsset src={previewUrl} />",
]) {
  requireMarker(
    ui,
    marker,
    "Asset Library previews must use the safe same-origin model path for remote models.",
  );
}

requireMarker(
  ui,
  'console.warn("Asset library GLB preview unavailable."',
  "Preview failures must degrade to the in-pane fallback instead of an intentional console error.",
);
forbidMarker(
  ui,
  'console.error("Asset library GLB preview failed."',
  "The old Next.js dev-overlay-triggering preview console.error must not return.",
);
forbidMarker(
  ui,
  "<SemanticMaterialAsset src={asset.public_path}",
  "Semantic anatomy previews must not fetch a remote R2 public_path directly.",
);
forbidMarker(
  ui,
  "<LoadedAsset src={asset.public_path} />",
  "Ordinary model previews must not fetch a remote R2 public_path directly.",
);

for (const marker of [
  "getMyWayAsset",
  'searchParams.get("asset_id")',
  "isApprovedForSandbox",
  "fetch(publicUrl",
  "model/gltf-binary",
]) {
  requireMarker(
    bridge,
    marker,
    "The existing reviewed model bridge safety/transport contract is missing.",
  );
}
forbidMarker(
  bridge,
  'searchParams.get("url")',
  "The reviewed model bridge must remain asset-id scoped, not a generic URL proxy.",
);

console.log(
  "PASS: A.12.10 Asset Library preview bridge verified: remote published GLBs use the existing asset-id-scoped same-origin model bridge, private pending previews keep their private proxy, and preview failures remain contained without an intentional console.error overlay.",
);
