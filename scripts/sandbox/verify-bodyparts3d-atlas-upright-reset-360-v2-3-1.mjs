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
  "const ANATOMICAL_FRONT_VIEW_DIRECTION = new THREE.Vector3(",
  "1.15,",
  "0.72,",
  "1.35,",
  "Historical V2.2 compatibility marker only: new THREE.Vector3(0, 0, 1)",
  "show the assembled human upright instead of top-down",
  "(radius / Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) * 1.42",
  "radius * 2.15",
  "camera.up.set(0, 1, 0)",
  "direction = ANATOMICAL_FRONT_VIEW_DIRECTION.clone()",
  "anatomical front reset",
  "full orbit",
  "hover a preset to warm its cache",
]) {
  assert(viewer.includes(marker), `Atlas Upright Reset + 360 V2.3.1 marker missing: ${marker}`);
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
  "minDistance={0.015}",
  "maxDistance={100}",
]) {
  assert(orbitBlock.includes(marker), `Full 360 OrbitControls marker missing: ${marker}`);
}

assert(
  !viewer.includes("const ANATOMICAL_FRONT_VIEW_DIRECTION = new THREE.Vector3(0, 0, 1);"),
  "Reset must not fall back to the mistaken +Z-only top-down orientation.",
);

console.log("PASS: BodyParts3D Atlas Upright Reset + 360 V2.3.1 verified.");
console.log(
  "Reset/start view uses the reviewed upright full-body orientation, preserves full damped OrbitControls movement, and keeps the close-inspection near-plane and preset prewarm behavior intact.",
);
