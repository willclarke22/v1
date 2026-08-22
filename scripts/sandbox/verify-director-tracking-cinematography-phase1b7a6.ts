import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoEvents,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
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

const actors: DirectorRuntimeActor[] = [
  { id: "primary_subject", position: [-2.4, 0, 0], rotation: [0, 0, 0], size: [0.98, 1.75, 0.72] },
  { id: "secondary_subject", position: [-1.6, 0, -2.9], rotation: [0, 0, 0], size: [0.7, 0.9, 0.7] },
  { id: "context_subject", position: [2.1, 0, 2.7], rotation: [0, 0, 0], size: [0.9, 0.9, 0.9] },
];

function actorEye(item: DirectorCapability, progress: number) {
  const moment = directorCapabilityDemoMoment(item);
  const sample = sampleDirectorActorState(moment, actors[0]!, progress, actors);
  return sample.position.clone().add(new THREE.Vector3(0, actors[0]!.size[1] * 0.68, 0));
}

function cameraFor(item: DirectorCapability, progress: number) {
  const moment = directorCapabilityDemoMoment(item);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { pose, camera, eye: actorEye(item, progress) };
}

const follow = capability("follow");
const lead = capability("lead_subject");
const lag = capability("lag_follow");
const parallel = capability("track_parallel");
const mountedMovement = capability("camera_object_attached");
const mountedAngle = capability("object_attached");

// Lead: actor should move behind centre relative to its on-screen direction of travel,
// while camera distance remains close to Follow.
{
  const progress = 0.7;
  const followState = cameraFor(follow, progress);
  const leadState = cameraFor(lead, progress);
  const start = sampleDirectorActorState(directorCapabilityDemoMoment(follow), actors[0]!, 0, actors).position;
  const end = sampleDirectorActorState(directorCapabilityDemoMoment(follow), actors[0]!, 1, actors).position;
  const travel = end.clone().sub(start).setY(0).normalize();
  const followForward = followState.pose.target.clone().sub(followState.pose.position).normalize();
  const followRight = new THREE.Vector3().crossVectors(followForward, new THREE.Vector3(0, 1, 0)).normalize();
  const screenTravelSign = Math.sign(travel.dot(followRight)) || 1;
  const followX = followState.eye.clone().project(followState.camera).x;
  const leadX = leadState.eye.clone().project(leadState.camera).x;
  assert(
    (leadX - followX) * screenTravelSign < -0.06,
    `Lead must place the actor behind Follow in screen-travel space; follow x=${followX.toFixed(3)} lead x=${leadX.toFixed(3)} sign=${screenTravelSign}.`,
  );
  const followDistance = followState.pose.position.distanceTo(followState.eye);
  const leadDistance = leadState.pose.position.distanceTo(leadState.eye);
  assert(
    Math.abs(leadDistance - followDistance) / Math.max(0.001, followDistance) < 0.12,
    `Lead should preserve Follow-like apparent size; follow distance=${followDistance.toFixed(3)} lead distance=${leadDistance.toFixed(3)}.`,
  );
}

// Lag: a bounded mid-shot delay, then recovery, without the old dramatic distance swing.
{
  const early = cameraFor(lag, 0.18);
  const mid = cameraFor(lag, 0.55);
  const end = cameraFor(lag, 1);
  const followEarly = cameraFor(follow, 0.18);
  const followMid = cameraFor(follow, 0.55);
  const followEnd = cameraFor(follow, 1);
  const earlyDelta = early.pose.position.distanceTo(followEarly.pose.position);
  const midDelta = mid.pose.position.distanceTo(followMid.pose.position);
  const endDelta = end.pose.position.distanceTo(followEnd.pose.position);
  assert(midDelta > earlyDelta + 0.015, `Lag needs a modest delayed middle rig separation; early=${earlyDelta.toFixed(3)} mid=${midDelta.toFixed(3)}.`);
  assert(endDelta < 0.12, `Lag must recover to Follow by the end; end separation=${endDelta.toFixed(3)}.`);
  const midDistance = mid.pose.position.distanceTo(mid.eye);
  const followMidDistance = followMid.pose.position.distanceTo(followMid.eye);
  assert(
    midDistance / Math.max(0.001, followMidDistance) < 1.22,
    `Lag must avoid a dramatic apparent-size swing; lag/follow distance ratio=${(midDistance / followMidDistance).toFixed(3)}.`,
  );
}

// Parallel remains a separate side-rail relationship.
{
  const p = cameraFor(parallel, 0.62);
  const start = sampleDirectorActorState(directorCapabilityDemoMoment(parallel), actors[0]!, 0, actors).position;
  const end = sampleDirectorActorState(directorCapabilityDemoMoment(parallel), actors[0]!, 1, actors).position;
  const travel = end.clone().sub(start).setY(0).normalize();
  const relation = p.pose.position.clone().sub(p.eye);
  const along = Math.abs(relation.dot(travel));
  const lateral = relation.clone().addScaledVector(travel, -relation.dot(travel)).length();
  assert(lateral > along * 4, `Track Parallel lost its side rail; lateral=${lateral.toFixed(3)} along=${along.toFixed(3)}.`);
}

// Mounted-camera vocabulary is retained, but the implementation is consolidated.
{
  const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const family = families.find((item) => item.category === "camera_movement" && item.group === "Tracking & attached camera");
  assert(family, "Tracking & attached camera family missing.");
  const profile = directorQualificationCapabilityProfile(family, mountedMovement.id);
  assert(
    profile.merge_compare_with_capability_id === mountedAngle.id &&
      profile.suitable_primary_cast_slots.join("|") === "vehicle",
    "camera_object_attached must remain vehicle-gated and explicitly paired with object_attached for merge/deprecation review.",
  );
  const movementEvents = directorCapabilityDemoEvents(mountedMovement);
  assert(
    movementEvents.length === 1 && movementEvents[0]?.behaviour === "move_to",
    "Mounted movement audition should prove blend-in on a forward travel corridor without the old 105-degree host turn.",
  );
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  'type DirectorMountedCameraMode = "immediate" | "blend_in"',
  "solveDirectorMountedCameraRelationship",
  'mode: "immediate"',
  'mode: "blend_in"',
  "actor.size[1] + Math.max(0.12, radius * 0.12)",
  "-Math.max(0.18, actor.size[2] * 0.34, radius * 0.16)",
  "Lag is a delayed tracking response",
  "screen-space* look room",
]) {
  assert(runtime.includes(marker), `Phase 1B.7A.6 runtime marker missing: ${marker}`);
}

const registry = source("sandbox/probe-lab/motion-camera-library/director-capability-registry.ts");
assert(registry.includes("view_direction: [0, -0.12, 1]") && registry.includes("look_distance_m: 5.0"), "Mounted movement demo must use the revised forward/horizon view.");
assert(!registry.includes("demo_camera_object_attached_subject_turn"), "Legacy mounted movement proof must not rotate the vehicle away from its travel corridor.");

const preview = source("sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx");
for (const marker of [
  "function TravellingCameraCorridor",
  "same safe travelling corridor",
  "tracking-roadside-marker-",
]) {
  assert(preview.includes(marker), `Safe travelling corridor marker missing: ${marker}`);
}
assert(!preview.includes("function MountedCameraCourse"), "Mounted-only course should be consolidated into the shared travelling corridor.");

const room = source("sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx");
for (const marker of [
  "isTrackingQualificationFamily",
  "qualificationAssetRoles",
  "arbitrary supporting GLBs",
  "legacy merge/deprecation candidate",
  "MERGE / DEPRECATION CHECK",
]) {
  assert(room.includes(marker), `Qualification Room A.6 marker missing: ${marker}`);
}

const audit = source("sandbox/probe-lab/motion-camera-library/director-visual-audit.ts");
for (const marker of [
  "actor should sit visibly behind centre",
  "without a dramatic looming/zoom-like size change",
  "same canonical high/back mounted-camera relationship",
]) {
  assert(audit.includes(marker), `A.6 visual-audit expectation missing: ${marker}`);
}

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>((counts, item) => {
  counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
  return counts;
}, {});
assert(
  DIRECTOR_CAPABILITIES.length === 184 &&
    supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.7A.6 must not mutate Level 2 vocabulary/support counts: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
);

console.log("Director Qualification Room Phase 1B.7A.6 tracking cinematography verification passed.");
console.log("Lead uses travel-relative look room; Lag is bounded/delayed; tracking uses a safe corridor; mounted angle/movement IDs compile through one canonical primitive while the movement ID remains a merge/deprecation candidate.");
