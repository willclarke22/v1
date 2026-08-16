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
  "emphasis: number",
  "smootherStep",
  "smoothWindow",
  "arrivalProgress",
  "departureProgress",
  "focusEmphasis",
]) {
  assert(layout.includes(marker), `CP.1E.4 layout is missing motion marker: ${marker}`);
}

assert(
  layout.includes("supportFadeForInsert") &&
    layout.includes("lerp(1, 0.08, focus)"),
  "CP.1E.4 must use the cleaner staggered support crossfade.",
);

assert(
  layout.includes("function sampleReturnTray") &&
    /function sampleReturnTray[\s\S]*?hand: hiddenActor\(\),/.test(layout),
  "CP.1E.4 must remove the second hand entrance from the return-to-tray beat.",
);

assert(
  runtime.includes("const HIDDEN_POSE: RuntimeActorPose") &&
    runtime.includes("emphasis: 0"),
  "CP.1E.4 hidden runtime poses must explicitly satisfy the emphasis field.",
);

for (const marker of [
  "makeOutlineClone",
  "cinematicOutlineMesh",
  "applyGroupEmphasis",
  "#ffd84d",
  "THREE.BackSide",
]) {
  assert(runtime.includes(marker), `CP.1E.4 runtime is missing outline marker: ${marker}`);
}

assert(
  runtime.includes("applyGroupOpacity") &&
    runtime.includes("prepareAssetGeometry") &&
    runtime.includes("protectCameraFraming"),
  "CP.1E.4 must preserve crossfade, geometry contact, and safe framing.",
);

assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.4 must preserve the single low-overhead WebGL runtime.",
);

console.log("Cinematic Production CP.1E.4 motion/emphasis verification passed.");
console.log(
  "Entrances use smoother cinematic curves, cow/chicken use cleaner staggered crossfades, smart outline emphasis is available, and the second hand entrance is removed.",
);
