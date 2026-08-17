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
  "CONTINUOUS_INSERT_START_S",
  "sampleContinuousInsertJourney",
  "smoothTimeWindow",
  "Foreground anchor: keep the burger physical, opaque, and nearly stationary.",
  "The fish reaches a real back-plane position before its semantic beat begins.",
  "Fish parallax proof",
  "masterCameraVec3TangentAt",
  "masterCameraScalarTangentAt",
  "time-aware Hermite tangents",
  "Intentionally linear time parameterization",
]) {
  assert(layout.includes(marker), `CP.1E.9 layout marker missing: ${marker}`);
}

const masterCameraSource =
  layout.match(/function masterCameraAtTime[\s\S]*?\n}\n\nexport function sampleCinematicBurgerRuntime/)?.[0] ?? "";
assert(
  masterCameraSource.includes("const t = clamp01") &&
    !masterCameraSource.includes("const t = smootherStep"),
  "CP.1E.9 master camera must not ease time to zero velocity at every key.",
);

const masterKeySource =
  layout.match(/const MASTER_CAMERA_KEYS[\s\S]*?\n];/)?.[0] ?? "";
for (const semanticBoundary of [2.6, 5.6, 8.8, 11.6, 14.4, 17.2, 20.6]) {
  assert(
    !masterKeySource.includes(`timeS: ${semanticBoundary}`),
    `CP.1E.9 master camera key must not land exactly on semantic boundary ${semanticBoundary}s.`,
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
    `CP.1E.9 camera should keep moving through semantic boundary ${boundary}s.`,
  );
  assert(
    directionCosine > 0.65,
    `CP.1E.9 camera direction should remain continuous through semantic boundary ${boundary}s.`,
  );
}

const cowChickenOverlap = sampleCinematicBurgerRuntime(10.9);
assert(
  cowChickenOverlap.cow.opacity > 0.5 &&
    cowChickenOverlap.chicken.opacity > 0.5,
  "CP.1E.9 cow departure and chicken arrival should overlap rather than reset the trio.",
);

const chickenFishOverlap = sampleCinematicBurgerRuntime(13.4);
assert(
  chickenFishOverlap.chicken.opacity > 0.5 &&
    chickenFishOverlap.goldfish.opacity > 0.5,
  "CP.1E.9 chicken departure and fish arrival should overlap.",
);

const fishOccluded = sampleCinematicBurgerRuntime(14.4);
const fishRevealed = sampleCinematicBurgerRuntime(16.35);
const burgerAtOcclusion = fishOccluded.foods[1];
const burgerAtReveal = fishRevealed.foods[1];

assert(
  Math.hypot(
    burgerAtReveal.position[0] - burgerAtOcclusion.position[0],
    burgerAtReveal.position[2] - burgerAtOcclusion.position[2],
  ) < 0.05 &&
    burgerAtOcclusion.opacity > 0.98 &&
    burgerAtReveal.opacity > 0.98,
  "CP.1E.9 fish reveal must keep the burger essentially stationary and opaque.",
);

assert(
  fishOccluded.goldfish.position[2] <
    burgerAtOcclusion.position[2] - 0.45,
  "CP.1E.9 fish must occupy real depth behind the burger.",
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

const occludedSeparation = burgerFishAngularSeparation(14.4);
const revealedSeparation = burgerFishAngularSeparation(16.35);
assert(
  fishRevealed.camera.position[0] - fishOccluded.camera.position[0] > 2.0,
  "CP.1E.9 fish reveal needs a substantial authored truck/orbit around the burger.",
);
assert(
  revealedSeparation > occludedSeparation * 4 &&
    revealedSeparation > 0.08,
  "CP.1E.9 camera motion must create a materially stronger burger/fish parallax separation.",
);

const labKeepsCp1e9OrSuccessor =
  (lab.includes("MyWay · Cinematic Production · CP.1E.9") &&
    lab.includes("fish is revealed by real parallax")) ||
  (lab.includes("MyWay · Cinematic Production · CP.1E.10") &&
    lab.includes("true occlusion-to-discovery move"));
assert(
  labKeepsCp1e9OrSuccessor,
  "CP.1E.9-family lab copy must describe the continuity/parallax model or a compatible successor.",
);
const readmeKeepsCp1e9OrSuccessor =
  readme.includes("CP.1E.9 — Continuous Spatial Choreography + Parallax") ||
  readme.includes("CP.1E.10 — Inspect-Like Orbit + Full Occlusion Reveal");
assert(
  readmeKeepsCp1e9OrSuccessor &&
    readme.includes("semantic boundaries are not camera cuts") &&
    readme.includes("Fish parallax proof"),
  "CP.1E.9-family README must document the benchmark's camera/continuity model.",
);

assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    runtime.includes("CameraAwareStudioRig") &&
    runtime.includes("protectCameraFraming") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.9 must preserve the single low-overhead geometry-aware runtime.",
);

console.log("Cinematic Production CP.1E.9 continuous spatial choreography verification passed.");
console.log(
  "Camera velocity now flows through semantic boundaries; cow/chicken/fish overlap on one absolute-time journey; and the fish is physically behind a stationary burger before a true camera-parallax reveal.",
);
