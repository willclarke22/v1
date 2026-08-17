
import fs from "node:fs";
import path from "node:path";

import {
  sampleCinematicBurgerRuntime,
  type RuntimeVec3,
} from "../../sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout";
import {
  advanceSoftCameraSafetyCorrection,
  softFramingParticipation,
  softProtectedCameraDistance,
} from "../../sandbox/probe-lab/cinematic-production/ui/cinematic-production-camera-safety";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const layout = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-layout.ts"),
  "utf8",
);
const runtime = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-runtime-canvas.tsx"),
  "utf8",
);
const safety = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-camera-safety.ts"),
  "utf8",
);
const lab = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/ui/cinematic-production-lab.tsx"),
  "utf8",
);
const readme = fs.readFileSync(
  path.join(root, "sandbox/probe-lab/cinematic-production/README.md"),
  "utf8",
);

for (const marker of [
  "CP.1E.12 soft post-rail camera safety",
  "softFramingParticipation",
  "softProtectedCameraDistance",
  "advanceSoftCameraSafetyCorrection",
  "FramingSafetyState",
  "correctionDistance",
  "lastTimelineS",
]) {
  assert(runtime.includes(marker), `CP.1E.12 runtime marker missing: ${marker}`);
}
for (const marker of [
  "framing participation is continuous",
  "Deterministic soft guard",
  "Playback-only temporal governor",
  "maxRatePerS",
]) {
  assert(safety.includes(marker), `CP.1E.12 camera-safety marker missing: ${marker}`);
}

const framingSource =
  runtime.match(/function protectCameraFraming[\s\S]*?\n}\n\nfunction applyRuntimeLayout/)?.[0] ?? "";
assert(
  !framingSource.includes("actorOpacity <= 0.06") &&
    !framingSource.includes("severeThreshold") &&
    !framingSource.includes("if (requiredDistance >"),
  "CP.1E.12 must remove the binary actor-admission and camera-distance jump thresholds.",
);
assert(
  framingSource.includes("weightedActorDistance") &&
    framingSource.includes("desiredCorrection") &&
    framingSource.includes("advanceSoftCameraSafetyCorrection"),
  "CP.1E.12 framing must blend actor participation and temporally govern only the post-rail correction offset.",
);

// The old cow pop happened around opacity 0.06. Participation must be tiny and
// continuous there instead of jumping from zero to the full cow bounds.
const belowOldThreshold = softFramingParticipation(0.059);
const aboveOldThreshold = softFramingParticipation(0.061);
assert(
  belowOldThreshold >= 0 &&
    aboveOldThreshold > belowOldThreshold &&
    aboveOldThreshold - belowOldThreshold < 0.002,
  "CP.1E.12 actor framing participation must cross the old 0.06 threshold continuously.",
);

// Synthetic worst-case fade: a large actor would eventually ask for a 24% pull
// back. The playback governor must limit every 60fps correction step.
const authoredDistance = 5;
const fullyRequiredDistance = 6.2;
let correction = 0;
let maxStep = 0;
for (let frame = 1; frame <= 60; frame += 1) {
  const timeS = frame / 60;
  const opacity = Math.min(1, timeS / 0.7);
  const participation = softFramingParticipation(opacity);
  const weightedRequired = authoredDistance +
    (fullyRequiredDistance - authoredDistance) * participation;
  const desiredDistance = softProtectedCameraDistance(
    authoredDistance,
    weightedRequired,
  );
  const desiredCorrection = Math.max(0, desiredDistance - authoredDistance);
  const next = advanceSoftCameraSafetyCorrection(
    correction,
    desiredCorrection,
    1 / 60,
  );
  maxStep = Math.max(maxStep, Math.abs(next - correction));
  correction = next;
}
assert(
  maxStep <= 0.95 / 60 + 0.0001,
  `CP.1E.12 post-rail camera safety exceeded its per-frame correction-rate cap: ${maxStep}.`,
);
assert(
  correction > 0.35,
  "CP.1E.12 soft framing must still provide meaningful emergency pull-back rather than disabling crop protection.",
);

function distance(a: RuntimeVec3, b: RuntimeVec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const filmSamplerSource =
  layout.match(/function sampleContinuousInsertJourney[\s\S]*?\n}\n\nfunction sampleReturnTray/)?.[0] ?? "";
const cp1fInteractionSuccessor =
  filmSamplerSource.includes("CP.1F: the film clock now authors only interaction intent") &&
  layout.includes('id: "hand_nudges_burger"') &&
  runtime.includes("resolveAssetAwareInteractionMotion");
assert(
  cp1fInteractionSuccessor ||
    (
      filmSamplerSource.includes("CP.1E.12 clearance arc") &&
      filmSamplerSource.includes("cubicBezierVec3(") &&
      !filmSamplerSource.includes("lerp(-2.26, -0.88, handBlend)")
    ),
  "CP.1E.12 active hand path must preserve clearance semantics or promote them to the CP.1F asset-aware interaction solver.",
);

// When the hand passes near the apple horizontally, it must still be high or
// depth-separated. This verifies the root trajectory's clearance corridor.
for (let timeS = 1.2; timeS <= 6.55; timeS += 0.025) {
  const sample = sampleCinematicBurgerRuntime(timeS);
  if (!sample.hand.visible || sample.hand.opacity < 0.02) continue;
  const apple = sample.foods[0].position;
  const hand = sample.hand.position;
  if (Math.abs(hand[0] - apple[0]) < 0.45) {
    assert(
      hand[1] > 1.0 || hand[2] > apple[2] + 0.42,
      `CP.1E.12 hand clearance corridor collapsed near the apple at ${timeS.toFixed(3)}s.`,
    );
  }
}

const hidden = sampleCinematicBurgerRuntime(14.4);
const revealed = sampleCinematicBurgerRuntime(16.35);
assert(
  hidden.goldfish.opacity > 0.98 &&
    hidden.foods[1].opacity > 0.98 &&
    hidden.goldfish.position[2] < hidden.foods[1].position[2] - 1.25,
  "CP.1E.12 fish must preserve occlusion while increasing burger/fish depth clearance.",
);
assert(
  distance(
    [hidden.goldfish.position[0], 0, hidden.goldfish.position[2]],
    [revealed.goldfish.position[0], 0, revealed.goldfish.position[2]],
  ) < 0.08,
  "CP.1E.12 fish should still hold its XZ position while the camera earns the reveal.",
);

const cp1e12Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.12") &&
  lab.includes("soft opacity-weighted protection envelope") &&
  lab.includes("clearance arc");
const cp1e13Lab =
  lab.includes("MyWay · Cinematic Production · CP.1E.13") &&
  lab.includes("soft opacity-weighted protection envelope") &&
  lab.includes("burger contact zone");
const cp1fLab =
  lab.includes("MyWay · Cinematic Production · CP.1F") &&
  lab.includes("soft framing stack") &&
  lab.includes("asset-aware");
assert(
  cp1e12Lab || cp1e13Lab || cp1fLab,
  "CP.1E.12-family lab copy must describe final-camera safety and hand clearance/contact.",
);
assert(
  readme.includes("CP.1E.12 — Soft Camera Safety + Physical Clearance") &&
    readme.includes("Final-camera continuity") &&
    readme.includes("Hand clearance") &&
    readme.includes("Fish negative space"),
  "CP.1E.12 README must document the soft camera guard and physical-clearance fixes.",
);
assert(
  runtime.includes('frameloop="demand"') &&
    runtime.includes('powerPreference: "low-power"') &&
    runtime.includes("CameraAwareStudioRig") &&
    (runtime.match(/<Canvas\b/g) ?? []).length === 1,
  "CP.1E.12 must preserve the single low-overhead camera-aware runtime.",
);

console.log("Cinematic Production CP.1E.12 soft-camera-safety/clearance verification passed.");
console.log(
  "Final camera protection now fades and rate-limits its post-rail correction, the hand clears the apple on a curved approach, and the fish holds farther behind the burger.",
);
