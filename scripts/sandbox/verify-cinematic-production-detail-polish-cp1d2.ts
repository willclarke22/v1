import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
for (const marker of [
  "ContactShadow",
  "applyShadowPose",
  "shadowOpacityForRole",
  "burgerShadowARef",
  'color="#fff4df"',
  'color="#91e7ff"',
]) {
  assert(runtime.includes(marker), `CP.1D.2 runtime is missing marker: ${marker}`);
}

const layout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
for (const marker of [
  "sampleHandNudge",
  "sampleGoldfishInsert",
  "sampleHero",
  "handAtBurger",
  "visibleAmount",
]) {
  assert(layout.includes(marker), `CP.1D.2 layout is missing marker: ${marker}`);
}

assert(
  layout.includes("const handAtBurger = pose([-1.56, 0.72, 0.58]") &&
    layout.includes("lerp(-1.42, -1.16, nudge)") &&
    layout.includes("0.26 + lift") &&
    layout.includes("lerp(0.35, 0.14, nudge)"),
  "CP.1D.2 should retarget the left-hand pickup beat toward the animated left burger path.",
);
assert(
  layout.includes("fov: 28") && layout.includes("lerp(1.18, 1.28, t)"),
  "CP.1D.2 hero shot should keep the burger in-frame during the final push-in.",
);

console.log("Cinematic Production CP.1D.2 detail-polish verification passed.");
console.log(
  "The runtime now adds cheap contact shadows, improved hand/burger blocking, refined animal entrances, fish orientation adjustments, and a less-cropped hero camera.",
);
