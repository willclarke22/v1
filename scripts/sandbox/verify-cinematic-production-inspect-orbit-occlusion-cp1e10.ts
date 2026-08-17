import fs from "node:fs";
import path from "node:path";

import {
  CINEMATIC_BURGER_TIMELINE_SEGMENTS,
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
  "CP.1E.10: from the end of the early hero shift onward",
  "fully occluded, then discovered",
  "Inspect-like orbit",
  "front -> right side -> behind -> left side -> front hero",
  "Near-zero yaw turns the fish length into depth",
  "Visibility is earned by viewpoint",
  "once the spatial journey begins it owns actor continuity",
]) {
  assert(
    layout.includes(marker) || readme.includes(marker),
    `CP.1E.10 marker missing: ${marker}`,
  );
}

function subtract(a: RuntimeVec3, b: RuntimeVec3): RuntimeVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: RuntimeVec3, amount: number): RuntimeVec3 {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

function length(v: RuntimeVec3) {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot(a: RuntimeVec3, b: RuntimeVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Every semantic boundary must still be crossed with meaningful velocity and
// without a directional discontinuity.
for (const boundary of CINEMATIC_BURGER_TIMELINE_SEGMENTS.slice(0, -1).map(
  (segment) => segment.endS,
)) {
  const dt = 0.02;
  const before = sampleCinematicBurgerRuntime(boundary - dt).camera.position;
  const at = sampleCinematicBurgerRuntime(boundary).camera.position;
  const after = sampleCinematicBurgerRuntime(boundary + dt).camera.position;
  const beforeVelocity = scale(subtract(at, before), 1 / dt);
  const afterVelocity = scale(subtract(after, at), 1 / dt);
  const beforeSpeed = length(beforeVelocity);
  const afterSpeed = length(afterVelocity);
  const directionCosine =
    dot(beforeVelocity, afterVelocity) /
    Math.max(0.000001, beforeSpeed * afterSpeed);

  assert(
    beforeSpeed > 0.05 && afterSpeed > 0.05,
    `CP.1E.10 camera should keep moving through semantic boundary ${boundary}s.`,
  );
  assert(
    directionCosine > 0.65,
    `CP.1E.10 camera direction should remain continuous through semantic boundary ${boundary}s.`,
  );
}

// The fish is fully committed to a deep, almost exactly center-behind staging
// before the reveal. The burger remains the opaque foreground anchor.
const hidden = sampleCinematicBurgerRuntime(14.4);
const reveal = sampleCinematicBurgerRuntime(16.85);
const held = sampleCinematicBurgerRuntime(17.4);

assert(
  hidden.goldfish.opacity > 0.98 &&
    hidden.foods[1].opacity > 0.98 &&
    reveal.foods[1].opacity > 0.98,
  "CP.1E.10 fish and burger must be physical/opaque during the reveal.",
);
assert(
  Math.abs(hidden.goldfish.position[0] - hidden.foods[1].position[0]) < 0.08,
  "CP.1E.10 fish should begin almost exactly behind the burger in screen-horizontal staging.",
);
assert(
  hidden.goldfish.position[2] < hidden.foods[1].position[2] - 0.9,
  "CP.1E.10 fish needs materially deeper world-space staging behind the burger.",
);
assert(
  Math.abs(hidden.goldfish.rotation[1]) < 0.15,
  "CP.1E.10 fish yaw should align its long profile into depth on the frontal approach.",
);
assert(
  Math.hypot(
    held.goldfish.position[0] - hidden.goldfish.position[0],
    held.goldfish.position[2] - hidden.goldfish.position[2],
  ) < 0.08 &&
    held.goldfish.opacity > 0.98,
  "CP.1E.10 fish should hold position through the camera reveal instead of sliding out from behind the burger.",
);
assert(
  Math.hypot(
    reveal.foods[1].position[0] - hidden.foods[1].position[0],
    reveal.foods[1].position[2] - hidden.foods[1].position[2],
  ) < 0.03,
  "CP.1E.10 burger must remain essentially stationary while the camera earns the reveal.",
);

function horizontalRayAngle(camera: RuntimeVec3, point: RuntimeVec3) {
  return Math.atan2(point[0] - camera[0], camera[2] - point[2]);
}

function burgerFishAngularSeparation(timeS: number) {
  const sample = sampleCinematicBurgerRuntime(timeS);
  return Math.abs(
    horizontalRayAngle(sample.camera.position, sample.foods[1].position) -
      horizontalRayAngle(sample.camera.position, sample.goldfish.position),
  );
}

const hiddenSeparation = burgerFishAngularSeparation(14.4);
const revealSeparation = burgerFishAngularSeparation(16.35);
assert(
  hiddenSeparation < 0.025,
  "CP.1E.10 initial burger/fish rays should be tightly aligned for full occlusion.",
);
assert(
  revealSeparation > hiddenSeparation * 8 && revealSeparation > 0.15,
  "CP.1E.10 right-side orbit must create a decisive parallax separation.",
);

// Measure authored orbit around the burger and unwrap the azimuth. The late path
// should keep rotating in one direction instead of returning to frontal staging.
const orbitTimes = [14.55, 15.25, 16.05, 16.85, 18, 19.25, 20.45, 21.75, 23, 24.4, 26];
let previousAngle: number | null = null;
let cumulativeOrbit = 0;
for (const timeS of orbitTimes) {
  const sample = sampleCinematicBurgerRuntime(timeS);
  const burger = sample.foods[1].position;
  let angle = Math.atan2(
    sample.camera.position[0] - burger[0],
    sample.camera.position[2] - burger[2],
  );
  if (previousAngle !== null) {
    while (angle < previousAngle - Math.PI) angle += Math.PI * 2;
    while (angle > previousAngle + Math.PI) angle -= Math.PI * 2;
    const delta = angle - previousAngle;
    assert(
      delta > -0.03,
      `CP.1E.10 orbit should not reverse direction at ${timeS}s.`,
    );
    cumulativeOrbit += delta;
  }
  previousAngle = angle;
}
assert(
  cumulativeOrbit > 5.5,
  "CP.1E.10 late camera should execute an Inspect-like near-360-degree spatial journey before returning to the hero front.",
);

// Because the active actor journey now owns the recap -> hero boundary too,
// actor positions must not jump at 20.6s.
const boundary = 20.6;
const dt = 0.02;
const beforeHero = sampleCinematicBurgerRuntime(boundary - dt);
const afterHero = sampleCinematicBurgerRuntime(boundary + dt);
for (let index = 0; index < 3; index += 1) {
  const before = beforeHero.foods[index].position;
  const after = afterHero.foods[index].position;
  assert(
    length(subtract(after, before)) < 0.08,
    `CP.1E.10 food ${index} should flow through the recap/hero semantic boundary without a staging jump.`,
  );
}

assert(
  lab.includes("MyWay · Cinematic Production · CP.1E.10") &&
    lab.includes("true occlusion-to-discovery move") &&
    lab.includes("Inspect-like authored orbit"),
  "CP.1E.10 lab copy must describe the full-occlusion and Inspect-like orbit experiment.",
);
assert(
  readme.includes("CP.1E.10 — Inspect-Like Orbit + Full Occlusion Reveal") &&
    readme.includes("fully occluded, then discovered") &&
    readme.includes("Late-film through-motion"),
  "CP.1E.10 README must document the stronger spatial reveal and late-film continuity model.",
);

assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    runtime.includes("CameraAwareStudioRig") &&
    runtime.includes("protectCameraFraming") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.10 must preserve the single low-overhead geometry-aware runtime.",
);

console.log("Cinematic Production CP.1E.10 Inspect-orbit/full-occlusion verification passed.");
console.log(
  "The fish now starts tightly aligned and deep behind a stationary burger, holds while camera motion reveals it, and the master camera continues one-direction orbital travel through recap and hero.",
);
