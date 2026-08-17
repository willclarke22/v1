
import fs from "node:fs";
import path from "node:path";

import {
  sampleCinematicBurgerRuntime,
  type RuntimeVec3,
} from "../../sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const layoutPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts",
);
const runtimePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx",
);
const labPath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx",
);
const readmePath = path.join(
  root,
  "sandbox/probe-lab/cinematic-production/README.md",
);

const layout = fs.readFileSync(layoutPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");
const lab = fs.readFileSync(labPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

for (const marker of [
  "CP.1E.11: the legacy function name is retained for compatibility",
  "sampler now owns the ENTIRE 0 -> 26 second film",
  "CONTINUOUS_INSERT_START_S = 0",
  "no semantic-shot switch is allowed in normal playback",
  "quinticHermiteScalar",
  "quinticHermiteVec3",
  "masterCameraVec3AccelerationAt",
  "masterCameraScalarAccelerationAt",
  "C2 through-motion master camera rail",
]) {
  assert(layout.includes(marker), `CP.1E.11 layout marker missing: ${marker}`);
}

const rawSamplerSource =
  layout.match(
    /function sampleRawCinematicBurgerRuntime[\s\S]*?\n}\n\ntype MasterCameraKey/,
  )?.[0] ?? "";

assert(
  rawSamplerSource.includes("sampleContinuousInsertJourney") &&
    !rawSamplerSource.includes("segmentAtTime(") &&
    !rawSamplerSource.includes("switch (") &&
    !rawSamplerSource.includes("case \"shot_"),
  "CP.1E.11 normal playback must be one absolute-time film sampler, not a shot-id switch.",
);

const filmSamplerSource =
  layout.match(
    /function sampleContinuousInsertJourney[\s\S]*?\n}\n\nfunction sampleReturnTray/,
  )?.[0] ?? "";

assert(
  filmSamplerSource.includes("galleryTravel") &&
    filmSamplerSource.includes("Cow begins while the trio is still physically travelling") &&
    !filmSamplerSource.includes("entryLayout") &&
    !filmSamplerSource.includes("blendActorPose("),
  "CP.1E.11 full-film sampler must remove the CP.1E.10 entry handoff and stacked actor easing.",
);

function subtract(a: RuntimeVec3, b: RuntimeVec3): RuntimeVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: RuntimeVec3, amount: number): RuntimeVec3 {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

function add(a: RuntimeVec3, b: RuntimeVec3): RuntimeVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function length(v: RuntimeVec3) {
  return Math.hypot(v[0], v[1], v[2]);
}

function oneSidedAccelerationBefore(timeS: number, dt: number): RuntimeVec3 {
  const p0 = sampleCinematicBurgerRuntime(timeS - 2 * dt).camera.position;
  const p1 = sampleCinematicBurgerRuntime(timeS - dt).camera.position;
  const p2 = sampleCinematicBurgerRuntime(timeS).camera.position;
  return scale(add(subtract(p2, scale(p1, 2)), p0), 1 / (dt * dt));
}

function oneSidedAccelerationAfter(timeS: number, dt: number): RuntimeVec3 {
  const p0 = sampleCinematicBurgerRuntime(timeS).camera.position;
  const p1 = sampleCinematicBurgerRuntime(timeS + dt).camera.position;
  const p2 = sampleCinematicBurgerRuntime(timeS + 2 * dt).camera.position;
  return scale(add(subtract(p2, scale(p1, 2)), p0), 1 / (dt * dt));
}

// The CP.1E.10 recording exposed a perceptible acceleration change near the
// 7.35s camera key. CP.1E.11 requires shared acceleration on both sides.
for (const keyTimeS of [
  2.1, 4.7, 7.35, 9.35, 11.0, 12.85, 13.75, 14.55, 15.25, 16.05,
  16.85, 18.0, 19.25, 20.45, 21.75, 23.0, 24.4,
]) {
  const dt = 0.001;
  const beforeAcceleration = oneSidedAccelerationBefore(keyTimeS, dt);
  const afterAcceleration = oneSidedAccelerationAfter(keyTimeS, dt);
  const difference = length(subtract(afterAcceleration, beforeAcceleration));
  const reference = Math.max(
    0.001,
    length(beforeAcceleration),
    length(afterAcceleration),
  );
  assert(
    difference / reference < 0.08,
    `CP.1E.11 camera acceleration must remain C2-continuous at ${keyTimeS}s.`,
  );
}

// The old 7.4s authority handoff must no longer create a tray or food jump.
const seamBefore = sampleCinematicBurgerRuntime(7.39);
const seamAfter = sampleCinematicBurgerRuntime(7.41);
assert(
  length(subtract(seamAfter.tray.position, seamBefore.tray.position)) < 0.01,
  "CP.1E.11 tray must flow through the former 7.4s handoff without a staging jump.",
);
for (let index = 0; index < 3; index += 1) {
  assert(
    length(
      subtract(
        seamAfter.foods[index].position,
        seamBefore.foods[index].position,
      ),
    ) < 0.01,
    `CP.1E.11 food ${index} must flow through the former 7.4s handoff.`,
  );
}

// The trio must still be physically moving while the cow is becoming visible.
// This prevents the old "prepare -> settle -> introduce cow" rhythm.
const preCow = sampleCinematicBurgerRuntime(7.55);
const cowEmerging = sampleCinematicBurgerRuntime(7.95);
const cowReadable = sampleCinematicBurgerRuntime(8.35);
const appleTravelDuringCow = length(
  subtract(cowReadable.foods[0].position, preCow.foods[0].position),
);
const burgerTravelDuringCow = length(
  subtract(cowReadable.foods[1].position, preCow.foods[1].position),
);
const nigiriTravelDuringCow = length(
  subtract(cowReadable.foods[2].position, preCow.foods[2].position),
);
assert(
  cowEmerging.cow.opacity > 0.5 &&
    cowReadable.cow.opacity > 0.95,
  "CP.1E.11 cow must emerge while the continuous tabletop choreography is already in motion.",
);
assert(
  appleTravelDuringCow > 0.04 &&
    burgerTravelDuringCow > 0.015 &&
    nigiriTravelDuringCow > 0.04,
  "CP.1E.11 trio must keep travelling through the cow entrance instead of settling first.",
);

// Preserve the CP.1E.10 fish proof and late Inspect-like orbit.
const hidden = sampleCinematicBurgerRuntime(14.4);
const reveal = sampleCinematicBurgerRuntime(16.35);
assert(
  hidden.goldfish.opacity > 0.98 &&
    reveal.goldfish.opacity > 0.98 &&
    hidden.foods[1].opacity > 0.98 &&
    reveal.foods[1].opacity > 0.98 &&
    hidden.goldfish.position[2] < hidden.foods[1].position[2] - 0.9,
  "CP.1E.11 must preserve the physical fish-behind-burger reveal.",
);

const cp1e11Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.11") &&
  lab.includes("one absolute-time film choreography from frame zero") &&
  lab.includes("semantic beats");
const cp1e12Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.12") &&
  lab.includes("one-film/C2 choreography") &&
  lab.includes("semantic beats");
const cp1e13Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.13") &&
  lab.includes("one-film/C2 camera") &&
  lab.includes("burger contact zone");
const cp1fLab =
  lab.includes("MyWay · Cinematic Production · CP.1F") &&
  lab.includes("one-film/C2 camera") &&
  lab.includes("asset-aware");
assert(
  cp1e11Lab || cp1e12Lab || cp1e13Lab || cp1fLab,
  "CP.1E.11-family lab copy must demote shots to semantic navigation and describe the one-film runtime.",
);

assert(
  readme.includes("CP.1E.11 — One-Film Runtime + C2 Camera Continuity") &&
    readme.includes("One film, semantic beats only") &&
    readme.includes("Pre-cow seam repair") &&
    readme.includes("C2 camera continuity"),
  "CP.1E.11 README must document the one-film runtime and C2 camera model.",
);

assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    runtime.includes("CameraAwareStudioRig") &&
    runtime.includes("protectCameraFraming") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.11 must preserve the single low-overhead geometry-aware runtime.",
);

console.log("Cinematic Production CP.1E.11 one-film/C2-continuity verification passed.");
console.log(
  "Normal playback now has one absolute-time actor choreography from frame zero, the trio keeps moving through the cow entrance, and the master camera is C2-continuous at its internal control points.",
);
