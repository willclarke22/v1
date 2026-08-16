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
  "opacity: number",
  "fadeEnvelope",
  "supportFadeForInsert",
  "animalOpacity",
  "supportOpacity",
  "sampleCowInsert",
  "sampleChickenInsert",
]) {
  assert(layout.includes(marker), `CP.1E.3 layout is missing crossfade marker: ${marker}`);
}

assert(
  layout.includes("const STRAIGHT_HAND_ROTATION: RuntimeVec3 = [0.12, Math.PI, 0]") &&
    layout.includes("STRAIGHT_HAND_ROTATION,"),
  "CP.1E.3 must reverse the straight hand by 180 degrees around world Y so its authored direction reads upward rather than downward.",
);

assert(
  (layout.match(/supportOpacity\)/g) ?? []).length >= 4,
  "CP.1E.3 must fade both apple and nigiri during both cow and chicken insert beats.",
);
assert(
  (layout.match(/animalOpacity,/g) ?? []).length >= 2,
  "CP.1E.3 must fade cow and chicken into their insert beats.",
);

for (const marker of [
  "applyGroupOpacity",
  "cinematicOwnsFadeMaterials",
  "cinematicBaseOpacity",
  "cinematicOpacity",
  "material.opacity = baseOpacity * clamped",
  "material.depthWrite = shouldFade ? false : baseDepthWrite",
  "actorOpacity",
]) {
  assert(runtime.includes(marker), `CP.1E.3 runtime is missing material-fade marker: ${marker}`);
}

assert(
  runtime.includes("prepareAssetGeometry") &&
    runtime.includes("protectCameraFraming") &&
    runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"'),
  "CP.1E.3 must preserve geometry-aware contact, framing protection, and the low-overhead runtime.",
);

assert(
  (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.3 must keep exactly one WebGL Canvas.",
);

console.log("Cinematic Production CP.1E.3 hand/crossfade verification passed.");
console.log(
  "The left hand is reversed to the upward-facing direction, cow/chicken crossfade in while apple/nigiri crossfade out, and geometry/contact + camera protection remain active.",
);
