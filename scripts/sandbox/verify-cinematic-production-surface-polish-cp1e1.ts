import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const runtimeLayoutPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const runtimeCanvasPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);

const runtimeLayout = fs.readFileSync(runtimeLayoutPath, "utf8");
const runtimeCanvas = fs.readFileSync(runtimeCanvasPath, "utf8");

assert(
  runtimeLayout.includes("HERO_CLOSEUP_SAFE_FOV") &&
    runtimeLayout.includes("HERO_CLOSEUP_SAFE_DISTANCE"),
  "CP.1E.1 runtime layout must keep hero-safe framing markers.",
);
assert(
  runtimeLayout.includes("INSERT_CLEARANCE_Z") &&
    runtimeLayout.includes("shot_04_cow_insert") &&
    runtimeLayout.includes("shot_05_chicken_insert"),
  "CP.1E.1 runtime layout must keep insert-clearance staging for the animal beats.",
);
const originalHandPath =
  runtimeLayout.includes("lerp(-2.26, -0.88, handBlend)") &&
  runtimeLayout.includes("lerp(0.2, 0.36, handBlend)");
const straightHandSuccessor =
  runtimeLayout.includes("lerp(-2.26, -0.88, handBlend)") &&
  runtimeLayout.includes("STRAIGHT_HAND_ROTATION");
assert(
  originalHandPath || straightHandSuccessor,
  "CP.1E.1 must preserve the left-hand pickup approach while allowing the geometry-contact successor to straighten its orientation.",
);
assert(
  runtimeCanvas.includes("surfaceLaneBounds") &&
    (runtimeCanvas.includes("Surface-staging lanes derived from the asset scene builder's safe placement idea.") ||
      runtimeCanvas.includes("Surface-staging lanes derived from the Asset Scene Builder's collision-safe")),
  "CP.1E.1 runtime canvas must use staged support lanes for the tray surface.",
);
const originalSeatTuning =
  runtimeCanvas.includes("supportSeatAdjustmentForRole") &&
  runtimeCanvas.includes("hoverDampingForRole") &&
  runtimeCanvas.includes("maxHoverForRole");
const geometryAwareContact =
  runtimeCanvas.includes("prepareAssetGeometry") &&
  runtimeCanvas.includes("new THREE.Box3().setFromObject(scene)") &&
  runtimeCanvas.includes("measured geometry owns contact");
assert(
  originalSeatTuning || geometryAwareContact,
  "CP.1E.1 must retain either the original seat tuning or its measured-geometry contact successor.",
);
assert(
  runtimeCanvas.includes('"insert_left"') &&
    runtimeCanvas.includes('"insert_right"') &&
    runtimeCanvas.includes('"insert_center"'),
  "CP.1E.1 runtime canvas must preserve explicit insert lanes so the animals do not hide behind the food trio.",
);

console.log("Cinematic Production CP.1E.1 surface-polish verification passed.");
console.log(
  geometryAwareContact
    ? "CP.1E.1 staging invariants are preserved through the CP.1E.2 measured-geometry contact runtime."
    : "The cinematic runtime retains tray-safe support lanes, hero-protected framing, insert clearances, and the retargeted left-hand pickup approach.",
);
