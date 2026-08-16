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
for (const marker of [
  "playbackTimeS",
  "CINEMATIC_BURGER_TIMELINE_DURATION_S",
  "cinematicShotStartTime",
  'aria-label="Cinematic benchmark timeline"',
]) {
  assert(lab.includes(marker), `CP.1C lab is missing marker: ${marker}`);
}
assert(
  lab.includes("Burger Continuous Cinematic Player") ||
    lab.includes("Burger Cinematic Preview"),
  "CP.1C-family UI must retain the continuous burger movie player.",
);
assert(
  !lab.includes("setInterval"),
  "CP.1C must not return to interval-driven shot swapping; playback is a continuous clock.",
);

const runtime = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
for (const marker of [
  "sampleCinematicBurgerRuntime",
  "Canvas",
]) {
  assert(runtime.includes(marker), `CP.1C runtime is missing marker: ${marker}`);
}
assert(
  runtime.includes("AnimatedCamera") ||
    runtime.includes("AnimatedCameraAndActors"),
  "CP.1C-family runtime must keep an animated camera path.",
);

const pageDrivenClock = lab.includes("requestAnimationFrame");
const runtimeDrivenClock =
  runtime.includes("requestAnimationFrame") &&
  runtime.includes("playAnchorWallMsRef");
assert(
  pageDrivenClock || runtimeDrivenClock,
  "CP.1C-family playback must remain driven by a continuous animation clock.",
);

const canvasCount = (runtime.match(/<Canvas\b/g) ?? []).length;
assert(
  canvasCount === 1,
  `CP.1C must keep exactly one WebGL Canvas; found ${canvasCount}.`,
);

const layout = source(
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
for (const marker of [
  "CINEMATIC_BURGER_TIMELINE_SEGMENTS",
  "CINEMATIC_BURGER_TIMELINE_DURATION_S",
  "sampleCinematicBurgerRuntime",
  "sampleHandNudge",
  "sampleCowInsert",
  "sampleChickenInsert",
  "sampleGoldfishInsert",
  "sampleReturnTray",
  "sampleHero",
  "easeOutBack",
]) {
  assert(layout.includes(marker), `CP.1C timeline is missing marker: ${marker}`);
}
for (const shotId of [
  "shot_01_establish",
  "shot_02_hand_nudge",
  "shot_03_hero_shift",
  "shot_04_cow_insert",
  "shot_05_chicken_insert",
  "shot_06_goldfish_insert",
  "shot_07_return_tray",
  "shot_08_hero",
]) {
  assert(layout.includes(shotId), `CP.1C timeline is missing shot: ${shotId}`);
}

const readme = source(
  "sandbox/probe-lab/cinematic-production/README.md",
).toLowerCase();
for (const phrase of [
  "continuous, seekable short-form player",
  "hand entrance and burger nudge",
  "cow insert that enters and settles",
  "camera position, look target, and field of view",
  "does not add a second director",
  "solid burger glb",
  "goldfish insert",
  "final beauty-render lane",
]) {
  assert(readme.includes(phrase), `CP.1C README is missing phrase: ${phrase}`);
}

console.log("Cinematic Production CP.1C continuous player verification passed.");
console.log(
  runtimeDrivenClock
    ? "The continuous clock now lives inside the WebGL runtime while preserving seekable 26-second camera/actor playback."
    : "The original page-driven continuous 26-second camera/actor playback remains available.",
);
