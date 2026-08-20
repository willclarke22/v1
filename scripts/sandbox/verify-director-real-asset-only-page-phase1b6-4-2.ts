import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const pageFacingFiles = [
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx",
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
];

for (const relativePath of pageFacingFiles) {
  const value = source(relativePath);
  assert(
    !/\bcontrolled\b/i.test(value),
    `${relativePath} still exposes controlled-proof copy or mode state on the canonical page.`,
  );
}

const atomicViewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
);
for (const marker of [
  'fixtureMode="real_assets"',
  "Real-asset proof",
  "Retry Asset Library",
  "browser-loadable assets",
]) {
  assert(
    atomicViewer.includes(marker),
    `Atomic real-asset-only viewer is missing marker: ${marker}.`,
  );
}
assert(
  !atomicViewer.includes("PreviewMode") &&
    !atomicViewer.includes('chooseMode("controlled")'),
  "Atomic viewer retained the retired proof-mode switch.",
);

const level1 = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx",
);
for (const marker of [
  "Level 1 real-asset visualization",
  "Select a real asset",
  "autoFillSlots(assets)",
  "Asset facing correction",
  "Directional capability variants",
]) {
  assert(
    level1.includes(marker),
    `Level 1 real-asset-only shell is missing marker: ${marker}.`,
  );
}

const perceptualViewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
);
for (const marker of [
  "Real-asset perceptual execution",
  "MissingRealAssetMarker",
  "DirectorRealAssetLoadBoundary",
  "Inspect keeps your manual camera while playback continues",
]) {
  assert(
    perceptualViewer.includes(marker),
    `Level 1 real-asset viewer is missing marker: ${marker}.`,
  );
}
assert(
  !perceptualViewer.includes("PreviewMode") &&
    !perceptualViewer.includes("ControlledActor") &&
    !perceptualViewer.includes("GoldenControlledOutline"),
  "Level 1 viewer retained retired proxy-geometry proof code.",
);

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
assert(
  preview.includes("ControlledAuditActor"),
  "Internal deterministic atomic audit fixtures should remain available as regression evidence even though the canonical page no longer exposes them.",
);

console.log("Director real-asset-only page Phase 1B.6.4.2 verification passed.");
console.log("The canonical Director page exposes real Asset Library execution only; internal deterministic fixtures remain regression-only.");
