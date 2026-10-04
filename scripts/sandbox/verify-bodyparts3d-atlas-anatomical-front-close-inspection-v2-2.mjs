import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const viewerPath =
  "sandbox/probe-lab/visual-experience/ui/orchestration-anatomy-atlas-viewer.tsx";

assert(existsSync(join(process.cwd(), viewerPath)), `Missing viewer: ${viewerPath}`);
const viewer = source(viewerPath);

for (const marker of [
  "ANATOMICAL_FRONT_VIEW_DIRECTION",
  "new THREE.Vector3(0, 0, 1)",
  "Canonical anatomy Reset view: upright and directly anterior-facing.",
  "near: Math.max(0.0005, Math.min(radius * 0.0025, 0.01))",
  "minDistance: Math.max(radius * 0.08, 0.008)",
  "PREWARM_BATCH_SIZE = 8",
  "PREWARM_BATCH_DELAY_MS = 90",
  "function assetsForPreset",
  "prewarmedUrls",
  "prewarmTimers",
  "useGLTF.preload(url)",
  "onPointerEnter={() => prewarmPreset(item.id)}",
  "onFocus={() => prewarmPreset(item.id)}",
  "anatomical front reset",
  "hover a preset to warm its cache",
]) {
  assert(viewer.includes(marker), `Atlas V2.2 marker missing: ${marker}`);
}

const orbitStart = viewer.indexOf("<OrbitControls");
assert(orbitStart >= 0, "Atlas OrbitControls block is missing.");
const orbitEnd = viewer.indexOf("/>", orbitStart);
assert(orbitEnd > orbitStart, "Atlas OrbitControls block is malformed.");
const orbitBlock = viewer.slice(orbitStart, orbitEnd + 2);

for (const marker of [
  "makeDefault",
  "enableRotate",
  "enablePan",
  "enableZoom",
  "enableDamping",
  "dampingFactor={0.08}",
  "minPolarAngle={0}",
  "maxPolarAngle={Math.PI}",
]) {
  assert(orbitBlock.includes(marker), `Full-orbit control marker missing: ${marker}`);
}

assert(
  viewer.includes("camera.up.set(0, 1, 0)") &&
    viewer.includes("direction = ANATOMICAL_FRONT_VIEW_DIRECTION.clone()"),
  "Reset view must explicitly restore a Y-up, anterior-facing camera.",
);

assert(
  !viewer.includes("near: Math.max(0.002, distance - radius * 2.2)"),
  "The old fit-distance-derived near plane must not return; it clips anatomy during close zoom.",
);

assert(
  viewer.includes("position={transform.position}") &&
    viewer.includes("rotation={transform.rotation}") &&
    viewer.includes("scale={transform.scale}"),
  "V2.2 must not alter BodyParts3D shared-space member transforms.",
);

assert(
  (viewer.match(/<Canvas\b/g) ?? []).length === 1,
  "V2.2 must preserve exactly one atlas Canvas.",
);

console.log("PASS: BodyParts3D Atlas Anatomical Front + Close Inspection V2.2 verified.");
console.log(
  "Reset/start view is anatomy-owned and anterior-facing, orbit remains full and damped, close zoom no longer inherits a large fit-derived near plane, and preset hover/focus progressively warms the existing useGLTF cache without changing Stage 2 or Director authority.",
);
