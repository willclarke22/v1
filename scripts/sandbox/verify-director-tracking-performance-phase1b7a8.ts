import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  sampleDirectorActorState,
  sampleDirectorCameraPose,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

const characterActors: DirectorRuntimeActor[] = [
  { id: "primary_subject", position: [-2.4, 0, 0], rotation: [0, 0, 0], size: [0.98, 1.75, 0.72] },
];

const vehicleActors: DirectorRuntimeActor[] = [
  { id: "primary_subject", position: [-2.4, 0, 0], rotation: [0, 0, 0], size: [2.35, 0.82, 1.16] },
];

const follow = capability("follow");
const lead = capability("lead_subject");
const lag = capability("lag_follow");
const parallel = capability("track_parallel");

function travelScreenSign(
  item: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
) {
  const moment = directorCapabilityDemoMoment(item);
  const start = sampleDirectorActorState(moment, actors[0]!, 0, actors).position;
  const end = sampleDirectorActorState(moment, actors[0]!, 1, actors).position;
  const travel = end.clone().sub(start).setY(0).normalize();
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const forward = pose.target.clone().sub(pose.position).normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();
  return Math.sign(travel.dot(right)) || 1;
}

function projectedCenterDelta(
  item: DirectorCapability,
  reference: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
) {
  const sign = travelScreenSign(reference, actors, progress);
  const referenceCenter = projectDirectorActorCenter(
    directorCapabilityDemoMoment(reference),
    actors,
    "primary_subject",
    progress,
  );
  const itemCenter = projectDirectorActorCenter(
    directorCapabilityDemoMoment(item),
    actors,
    "primary_subject",
    progress,
  );
  assert(referenceCenter && itemCenter, `Projected centre evidence missing at ${progress}.`);
  return (itemCenter.ndc[0] - referenceCenter.ndc[0]) * sign;
}

function projectedArea(
  item: DirectorCapability,
  actors: DirectorRuntimeActor[],
  progress: number,
) {
  const envelope = projectDirectorActorEnvelope(
    directorCapabilityDemoMoment(item),
    actors,
    "primary_subject",
    progress,
  );
  assert(envelope, `Projected envelope evidence missing for ${item.id} at ${progress}.`);
  return envelope;
}

// Lead must remain visibly distinct and safe for both tall-character and wide-vehicle
// geometry. A.8 specifically protects the vehicle lane that A.7 did not test.
for (const [label, actors, minimumDelta] of [
  ["character", characterActors, 0.08],
  ["vehicle", vehicleActors, 0.05],
] as const) {
  const progress = 0.72;
  const delta = projectedCenterDelta(lead, follow, actors, progress);
  const envelope = projectedArea(lead, actors, progress);
  assert(
    delta < -minimumDelta,
    `Lead ${label} proof must remain materially behind Follow in screen-travel space; delta=${delta.toFixed(3)}.`,
  );
  assert(
    envelope.fully_inside_safe_frame,
    `Lead ${label} envelope must remain inside the runtime safe frame: ${JSON.stringify(envelope)}.`,
  );
}

// Lag must read as delay/catch-up without the A.7 vehicle loom. Protect both screen
// position and projected silhouette area against the corresponding Follow frame.
for (const [label, actors] of [
  ["character", characterActors],
  ["vehicle", vehicleActors],
] as const) {
  const early = projectedCenterDelta(lag, follow, actors, 0.18);
  const middle = projectedCenterDelta(lag, follow, actors, 0.5);
  const late = projectedCenterDelta(lag, follow, actors, 0.85);
  assert(Math.abs(early) < 0.06, `Lag ${label} must begin near Follow; delta=${early.toFixed(3)}.`);
  assert(middle > 0.08, `Lag ${label} must visibly pull ahead mid-shot; delta=${middle.toFixed(3)}.`);
  assert(Math.abs(late) < 0.07, `Lag ${label} must recover toward Follow; delta=${late.toFixed(3)}.`);

  const lagArea = projectedArea(lag, actors, 0.5).screen_area_fraction;
  const followArea = projectedArea(follow, actors, 0.5).screen_area_fraction;
  const areaRatio = lagArea / Math.max(0.000001, followArea);
  assert(
    areaRatio >= 0.78 && areaRatio <= 1.22,
    `Lag ${label} must preserve Follow-like apparent size; area ratio=${areaRatio.toFixed(3)}.`,
  );

  const lagMoment = directorCapabilityDemoMoment(lag);
  const followMoment = directorCapabilityDemoMoment(follow);
  const lagPose = sampleDirectorCameraPose(lagMoment, 0.5, actors);
  const followPose = sampleDirectorCameraPose(followMoment, 0.5, actors);
  const lagActor = sampleDirectorActorState(lagMoment, actors[0]!, 0.5, actors);
  const followActor = sampleDirectorActorState(followMoment, actors[0]!, 0.5, actors);
  const distanceRatio =
    lagPose.position.distanceTo(lagActor.position) /
    Math.max(0.001, followPose.position.distanceTo(followActor.position));
  assert(
    distanceRatio >= 0.88 && distanceRatio <= 1.12,
    `Lag ${label} physical camera distance must remain close to Follow; ratio=${distanceRatio.toFixed(3)}.`,
  );
}

// Track Parallel camera relationship itself remains frozen; A.8 repairs only its stage.
{
  const progress = 0.62;
  const moment = directorCapabilityDemoMoment(parallel);
  const pose = sampleDirectorCameraPose(moment, progress, characterActors);
  const actor = sampleDirectorActorState(moment, characterActors[0]!, progress, characterActors);
  const start = sampleDirectorActorState(moment, characterActors[0]!, 0, characterActors).position;
  const end = sampleDirectorActorState(moment, characterActors[0]!, 1, characterActors).position;
  const travel = end.clone().sub(start).setY(0).normalize();
  const relation = pose.position.clone().sub(actor.position);
  const along = Math.abs(relation.dot(travel));
  const lateral = relation
    .clone()
    .addScaledVector(travel, -relation.dot(travel))
    .length();
  assert(
    lateral > along * 4,
    `Track Parallel side rail regressed; lateral=${lateral.toFixed(3)} along=${along.toFixed(3)}.`,
  );
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "constrainLeadTargetConstantTime",
  "LEAD_REAR_EDGE_SAFE_NDC - projectedHalfWidthNdc * 1.2",
  "pose.position.addScaledVector(direction, -lagDistance * 0.18)",
  "pose.target.addScaledVector(direction, -lagDistance * 1.05)",
]) {
  assert(runtime.includes(marker), `A.8 runtime marker missing: ${marker}`);
}
assert(
  !runtime.includes("constrainLeadTargetToSafeEnvelope") &&
    !runtime.includes("for (let iteration = 0; iteration < 10; iteration += 1)"),
  "A.8 must remove the iterative Lead projection search from the display-frame hot path.",
);

const preview = source("sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx");
for (const marker of [
  'const showRoadsideMarkers = capabilityId !== "track_parallel"',
  "showRoadsideMarkers",
  "centre/edge lines",
]) {
  assert(preview.includes(marker), `A.8 Track Parallel fixture marker missing: ${marker}`);
}

const room = source("sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx");
for (const marker of [
  "isTrackingQualificationFamily",
  "input.capability.demo.asset_roles.slice(0, 1)",
  "arbitrary supporting GLBs",
  "window.setTimeout(present, QUALIFICATION_PREVIEW_FRAME_MS)",
  "QUALIFICATION_RESIDENT_GLTF_URLS",
  "useGLTF.clear(previousUrl)",
]) {
  assert(room.includes(marker), `A.8 Qualification Room marker missing: ${marker}`);
}
assert(
  !room.includes("window.requestAnimationFrame(pump)"),
  "A.8 Qualification playback must not spin a monitor-refresh-rate rAF pump.",
);
assert(
  !room.includes('fetch("/api/sandbox/probe-lab/assets/library"'),
  "A.8 Qualification Room must consume the shared Director Asset Library snapshot instead of refetching it.",
);

const library = source("sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx");
assert(
  (library.match(/fetch\("\/api\/sandbox\/probe-lab\/assets\/library"/g) ?? []).length === 1,
  "Director shell should own exactly one Asset Library fetch path shared across both tabs.",
);
for (const marker of [
  "type SharedDirectorAssetLibraryProps",
  "const sharedAssetLibrary",
  "assetsLoading={isLoadingAssets}",
  "{...sharedAssetLibrary}",
]) {
  assert(library.includes(marker), `A.8 shared Asset Library marker missing: ${marker}`);
}

const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
for (const marker of [
  "Phase 1B.7A.8 — Tracking visual + runtime-performance hardening",
  "constant-time camera-space constraint",
  "real primary actor only",
  "shared Asset Library snapshot",
  "REEL COMPLETE",
]) {
  assert(readme.includes(marker), `A.8 README marker missing: ${marker}`);
}

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  DIRECTOR_CAPABILITIES.length === 184 &&
    supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `A.8 must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
);

console.log("Director Qualification Room Phase 1B.7A.8 tracking/performance verification passed.");
console.log("Lead is constant-time and character/vehicle safe, Lag preserves apparent size, Track Parallel fixture occluders are suppressed, Tracking uses primary-only real evidence, and Director tabs share one bounded asset-loading lifecycle.");
