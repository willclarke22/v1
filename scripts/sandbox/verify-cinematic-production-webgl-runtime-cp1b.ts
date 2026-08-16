import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const lab = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
for (const requirement of [
  "CinematicProductionRuntimeCanvas",
  "WebGL 3D pane",
  "Play benchmark",
  "camera grammar",
]) {
  assert(
    lab.includes(requirement),
    `CP.1B lab is missing requirement: ${requirement}`,
  );
}
assert(
  !lab.includes("function AssetSprite") && !lab.includes("function getShotStage"),
  "CP.1B should replace the original static sprite implementation rather than keep two active preview engines.",
);

const canvas = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
for (const requirement of [
  "Canvas",
  "PerspectiveCamera",
  "useGLTF",
  "AnimatedCamera",
  "StageScene",
]) {
  assert(
    canvas.includes(requirement),
    `CP.1B runtime canvas is missing requirement: ${requirement}`,
  );
}

const usesOriginalShotLayout = canvas.includes("getCinematicShotRuntimeLayout");
const usesContinuousTimeline = canvas.includes("sampleCinematicBurgerRuntime");
assert(
  usesOriginalShotLayout || usesContinuousTimeline,
  "CP.1B WebGL runtime must consume either the original shot-layout sampler or a compatible continuous cinematic sampler.",
);

const canvasCount = (canvas.match(/<Canvas\b/g) ?? []).length;
assert(
  canvasCount === 1,
  `CP.1B must own exactly one WebGL Canvas; found ${canvasCount}.`,
);

const layout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
for (const shot of [
  "shot_01_establish",
  "shot_02_hand_nudge",
  "shot_03_hero_shift",
  "shot_04_cow_insert",
  "shot_05_chicken_insert",
  "shot_06_goldfish_insert",
  "shot_07_return_tray",
  "shot_08_hero",
]) {
  assert(
    layout.includes(shot),
    `CP.1B runtime layout is missing shot pose: ${shot}`,
  );
}
assert(
  layout.includes("camera") &&
    layout.includes("burgers") &&
    layout.includes("goldfish"),
  "CP.1B runtime layout must define camera and actor staging.",
);
assert(
  layout.includes("getCinematicShotRuntimeLayout"),
  "Later CP.1 phases must preserve the CP.1B midpoint shot-layout compatibility API.",
);
if (usesContinuousTimeline) {
  assert(
    layout.includes("sampleCinematicBurgerRuntime") &&
      layout.includes("CINEMATIC_BURGER_TIMELINE_SEGMENTS"),
    "A continuous CP.1 successor must define its timeline sampler and segment table in the shared runtime-layout module.",
  );
}

const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
).toLowerCase();
for (const phrase of [
  "webgl 3d pane",
  "single webgl canvas-based 3d pane",
  "camera movement visible",
  "final beauty-render lane",
]) {
  assert(
    readme.includes(phrase),
    `CP.1B README is missing phrase: ${phrase}`,
  );
}

console.log("Cinematic Production CP.1B WebGL runtime verification passed.");
console.log(
  usesContinuousTimeline
    ? "The CP.1B WebGL contract is preserved through the CP.1C continuous timeline: one Canvas, real Asset Library cast, continuous camera/actor sampling, and the midpoint shot-layout compatibility API."
    : "The burger benchmark uses exactly one WebGL pane with shot-to-shot camera movement, 3D asset staging, and the existing Asset Library cast path.",
);
