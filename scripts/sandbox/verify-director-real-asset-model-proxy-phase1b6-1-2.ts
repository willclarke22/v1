import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const required = [
  "app/api/sandbox/probe-lab/resource-runtime/models/file/route.ts",
  "sandbox/probe-lab/resource-runtime/routes/model-file.ts",
  "sandbox/probe-lab/motion-camera-library/ui/director-real-asset-browser.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
];
for (const relative of required) {
  assert(existsSync(join(process.cwd(), relative)), `Missing Phase 1B.6.1.2 file: ${relative}`);
}

const browser = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-real-asset-browser.tsx",
);
for (const marker of [
  "directorRealAssetBrowserUrl",
  "/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=",
  "DirectorRealAssetLoadBoundary",
  "Controlled fallback shown.",
]) {
  assert(browser.includes(marker), `Director browser bridge is missing marker: ${marker}`);
}
assert(
  browser.includes('if (/^https:\\/\\//i.test(publicPath))'),
  "Only remote HTTPS assets should be routed through the server bridge.",
);

const route = source("sandbox/probe-lab/resource-runtime/routes/model-file.ts");
for (const marker of [
  "getMyWayAsset",
  'searchParams.get("asset_id")',
  "safe_to_use_in_sandbox",
  "semantic_review_status",
  "scene_review_status",
  "fetch(publicUrl",
  "model/gltf-binary",
]) {
  assert(route.includes(marker), `Reviewed model route is missing marker: ${marker}`);
}
assert(
  !route.includes('searchParams.get("url")'),
  "Reviewed model bridge must never accept an arbitrary upstream URL.",
);

for (const relative of [
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
]) {
  const viewer = source(relative);
  assert(
    viewer.includes("directorRealAssetBrowserUrl(asset)"),
    `${relative} must route selected remote Asset Library models through the browser bridge.`,
  );
  assert(
    viewer.includes("DirectorRealAssetLoadBoundary"),
    `${relative} must fail visibly to a controlled actor instead of crashing the whole Canvas.`,
  );
  assert(
    !viewer.includes("useGLTF(asset.public_path)"),
    `${relative} still fetches the selected remote public_path directly.`,
  );
}



const phase5dVerifier = source(
  "scripts/sandbox/verify-capability-vocabulary-authority-phase1b5d.ts",
);
assert(
  phase5dVerifier.includes("Phase 1B.6.1 simplified the Director page layout") &&
    phase5dVerifier.includes('"Capability authority path"') &&
    !phase5dVerifier.includes('"Phase 1B.5D capability authority path",'),
  "Phase 1B.5D regression verification must protect authority wiring without freezing the retired page heading.",
);

const phase5eVerifier = source(
  "scripts/sandbox/verify-director-real-asset-execution-qualification-phase1b5e.ts",
);
assert(
  phase5eVerifier.includes("Phase 1B.6.1 deliberately simplified the visible Director page") &&
    phase5eVerifier.includes('"Real-asset proof & qualification"') &&
    !phase5eVerifier.includes('"Phase 1B.5E qualification report JSON",'),
  "Phase 1B.5E regression verification must protect execution wiring without freezing retired diagnostic copy.",
);

console.log("Director real-asset model proxy Phase 1B.6.1.2 verification passed.");
console.log("Remote reviewed GLBs use an asset-id-scoped same-origin bridge; local paths remain direct; load failures fall back without crashing the Director page.");
