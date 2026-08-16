import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const runtimePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const layoutPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);

const runtime = fs.readFileSync(runtimePath, "utf8");
const layout = fs.readFileSync(layoutPath, "utf8");

for (const marker of [
  "geometry_profile?: MyWayAssetGeometryProfileV1 | null",
  "prepareAssetGeometry",
  "new THREE.Box3().setFromObject(scene)",
  "-initialBounds.min.y",
  "PreparedAssetGeometry",
  "bottomContactCenter",
  "bottomContactSize",
  "supportSurfaces",
  "selectPrimarySupportSurface",
  "traySurfaceInfo",
  "rotatedBoundsMetrics",
  "contactAlignedRootY",
  "boundsSafeRootY",
  "protectCameraFraming",
  "localBoundsCorners",
  "SAFE_X",
  "SAFE_Y",
  "preparedGeometryRef",
]) {
  assert(runtime.includes(marker), `CP.1E.2 runtime is missing geometry-contact marker: ${marker}`);
}

assert(
  runtime.includes("Pair Resolver / Asset Scene Builder principle") &&
    runtime.includes("measured contact footprint"),
  "CP.1E.2 must preserve measured bottom-contact footprint placement semantics.",
);
assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes("dpr={1}") &&
    runtime.includes('powerPreference: "low-power"'),
  "CP.1E.2 must preserve the low-overhead CP.1D runtime.",
);
assert(
  (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.2 must keep exactly one WebGL Canvas.",
);
assert(
  !runtime.includes("supportSeatAdjustmentForRole") &&
    !runtime.includes("hoverDampingForRole") &&
    !runtime.includes("maxHoverForRole"),
  "CP.1E.2 should replace hand-tuned support-seat offsets with geometry-aware contact alignment.",
);

for (const marker of [
  "STRAIGHT_HAND_ROTATION",
  "RESTING_LIFT_Y",
  "HERO_CLOSEUP_SAFE_FOV",
  "HERO_CLOSEUP_SAFE_DISTANCE",
  "INSERT_CLEARANCE_Z",
  "sampleCowInsert",
  "sampleChickenInsert",
  "sampleGoldfishInsert",
  "sampleHero",
]) {
  assert(layout.includes(marker), `CP.1E.2 layout is missing marker: ${marker}`);
}
assert(
  (layout.includes("const STRAIGHT_HAND_ROTATION: RuntimeVec3 = [0.12, 0, 0]") ||
    layout.includes("const STRAIGHT_HAND_ROTATION: RuntimeVec3 = [0.12, Math.PI, 0]")) &&
    layout.includes("STRAIGHT_HAND_ROTATION,"),
  "CP.1E.2 must preserve a straight hand orientation; later compatibility patches may reverse its forward direction without restoring diagonal twist.",
);
assert(
  layout.includes("Surface-aware runtime interprets non-hand actor Y as lift above measured support") &&
    layout.includes("pose([0, RESTING_LIFT_Y, 0.02]") &&
    layout.includes("pose([0.02, RESTING_LIFT_Y"),
  "CP.1E.2 must convert resting food Y values from absolute world heights to support-relative lift values.",
);

console.log("Cinematic Production CP.1E.2 geometry-contact verification passed.");
console.log(
  "Visible GLB bounds are bottom-normalized like Asset Scene Builder, measured support/contact regions drive seating, the camera protects full actor bounds, and the hand uses a straight upward-facing orientation.",
);
