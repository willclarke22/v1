import * as THREE from "three";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  directorCameraFidelityFixtureActors,
} from "../../sandbox/probe-lab/motion-camera-library/director-camera-fidelity";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  directorVisualAuditDefinition,
} from "../../sandbox/probe-lab/motion-camera-library/director-visual-audit";
import {
  sampleDirectorActorState,
  sampleDirectorCameraPose,
  validateDirectorShot,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const value = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(value, `Missing Director capability ${id}.`);
  return value;
}

function actorById(actors: DirectorRuntimeActor[], id: string) {
  const actor = actors.find((candidate) => candidate.id === id);
  assert(actor, `Controlled grammar fixture is missing actor ${id}.`);
  return actor;
}

function actorEye(
  capabilityValue: DirectorCapability,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(capabilityValue);
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  return sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.08, actor.size[1]) * 0.68, 0),
  );
}

function travelDirection(
  capabilityValue: DirectorCapability,
  actor: DirectorRuntimeActor,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(capabilityValue);
  const start = sampleDirectorActorState(moment, actor, 0, actors).position;
  const end = sampleDirectorActorState(moment, actor, 1, actors).position;
  const direction = end.sub(start);
  direction.y = 0;
  assert(direction.lengthSq() > 0.25, `${capabilityValue.id} fixture must contain real subject travel.`);
  return direction.normalize();
}

function localCameraOffset(
  capabilityValue: DirectorCapability,
  progress: number,
) {
  const actors = directorCameraFidelityFixtureActors(capabilityValue);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(capabilityValue);
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const inverse = new THREE.Quaternion()
    .setFromEuler(sample.rotation)
    .invert();
  return pose.position
    .clone()
    .sub(sample.position)
    .applyQuaternion(inverse);
}

for (const id of [
  "over_shoulder",
  "point_of_view",
  "follow",
  "lead_subject",
  "lag_follow",
  "track_parallel",
  "object_attached",
  "camera_object_attached",
  "isometric",
  "macro",
  "insert",
  "cutaway",
]) {
  assert(capability(id), `Camera grammar canary ${id} is missing.`);
}

// Viewpoint composition: camera must remain outside the source actor while
// looking at the declared focus actor.
for (const id of ["over_shoulder", "point_of_view"] as const) {
  const item = capability(id);
  const actors = directorCameraFidelityFixtureActors(item);
  const moment = directorCapabilityDemoMoment(item);
  const sourceActor = actorById(actors, "primary_subject");
  const focusActor = actorById(actors, "secondary_subject");
  const sourceEye = actorEye(item, sourceActor, 0.5, actors);
  const focusEye = actorEye(item, focusActor, 0.5, actors);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  const sourceDistance = pose.position.distanceTo(sourceEye);
  const sourceRadius = Math.sqrt(
    sourceActor.size[0] ** 2 +
    sourceActor.size[1] ** 2 +
    sourceActor.size[2] ** 2,
  ) * 0.5;

  assert(
    pose.target.distanceTo(focusEye) < 0.14,
    `${id} must look at the declared focus actor.`,
  );

  if (id === "over_shoulder") {
    assert(
      sourceDistance > sourceRadius * 0.68 &&
      sourceDistance < sourceRadius * 1.6,
      `over_shoulder camera must sit outside but near the foreground actor; got ${sourceDistance.toFixed(3)} m for radius ${sourceRadius.toFixed(3)} m.`,
    );
  } else {
    assert(
      sourceDistance > Math.abs(sourceActor.size[2]) * 0.4 &&
      sourceDistance < sourceRadius * 0.86,
      `point_of_view must clear the source face volume while remaining viewpoint-relative; got ${sourceDistance.toFixed(3)} m.`,
    );
  }
}

// Travelling grammar: follow is stable, lead looks forward, lag temporarily
// looks behind, and parallel tracking settles into a side-on relationship.
const follow = capability("follow");
const lead = capability("lead_subject");
const lag = capability("lag_follow");
const parallel = capability("track_parallel");

for (const item of [follow, lead, lag, parallel]) {
  assert(
    directorVisualAuditDefinition(item).fixture === "travelling_subject",
    `${item.id} must use the travelling_subject controlled fixture.`,
  );
}

{
  const actors = directorCameraFidelityFixtureActors(follow);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(follow);
  const pA = 0.25;
  const pB = 0.85;
  const poseA = sampleDirectorCameraPose(moment, pA, actors);
  const poseB = sampleDirectorCameraPose(moment, pB, actors);
  const actorA = sampleDirectorActorState(moment, actor, pA, actors).position;
  const actorB = sampleDirectorActorState(moment, actor, pB, actors).position;
  const drift = poseA.position.clone().sub(actorA).distanceTo(
    poseB.position.clone().sub(actorB),
  );
  assert(drift < 0.18, `follow relative camera drift is too large: ${drift.toFixed(3)} m.`);
}

{
  const actors = directorCameraFidelityFixtureActors(lead);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(lead);
  const direction = travelDirection(lead, actor, actors);
  const progress = 0.78;
  const eye = actorEye(lead, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const lookAhead = pose.target.clone().sub(eye).dot(direction);
  assert(lookAhead > 0.12, `lead_subject must look ahead of travel; got ${lookAhead.toFixed(3)} m.`);
}

{
  const actors = directorCameraFidelityFixtureActors(lag);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(lag);
  const direction = travelDirection(lag, actor, actors);
  const midProgress = 0.55;
  const midEye = actorEye(lag, actor, midProgress, actors);
  const midPose = sampleDirectorCameraPose(moment, midProgress, actors);
  const midBias = midPose.target.clone().sub(midEye).dot(direction);
  const endEye = actorEye(lag, actor, 1, actors);
  const endPose = sampleDirectorCameraPose(moment, 1, actors);
  const endBias = endPose.target.clone().sub(endEye).dot(direction);
  assert(midBias < -0.1, `lag_follow must let the actor pull ahead; got ${midBias.toFixed(3)} m.`);
  assert(
    Math.abs(endBias) < Math.abs(midBias) * 0.45,
    `lag_follow must catch up by the end; mid ${midBias.toFixed(3)} m, end ${endBias.toFixed(3)} m.`,
  );
}

{
  const actors = directorCameraFidelityFixtureActors(parallel);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(parallel);
  const direction = travelDirection(parallel, actor, actors);

  const relationAt = (progress: number) => {
    const eye = actorEye(parallel, actor, progress, actors);
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    return pose.position.clone().sub(eye);
  };

  const lateA = relationAt(0.78);
  const lateB = relationAt(1);
  const drift = lateA.distanceTo(lateB);
  const along = Math.abs(lateB.dot(direction));
  const lateral = lateB
    .clone()
    .addScaledVector(direction, -lateB.dot(direction))
    .length();

  assert(drift < 0.3, `track_parallel side rig must stabilize; late drift ${drift.toFixed(3)} m.`);
  assert(
    lateral > along * 1.8,
    `track_parallel must be predominantly lateral; lateral ${lateral.toFixed(3)} m, along ${along.toFixed(3)} m.`,
  );
}

// Mounted cameras must stay stable in the actor's local space and keep a
// useful clearance from the source body.
for (const id of ["object_attached", "camera_object_attached"] as const) {
  const item = capability(id);
  const startProgress = id === "object_attached" ? 0 : 0.92;
  const endProgress = 1;
  const localA = localCameraOffset(item, startProgress);
  const localB = localCameraOffset(item, endProgress);
  const drift = localA.distanceTo(localB);
  assert(drift < 0.12, `${id} actor-local camera mount drift is ${drift.toFixed(3)} m.`);

  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const clearance = localB.length();
  const radius = Math.sqrt(
    actor.size[0] ** 2 + actor.size[1] ** 2 + actor.size[2] ** 2,
  ) * 0.5;
  assert(
    clearance > radius * 0.85,
    `${id} camera mount is still too close to the source body: ${clearance.toFixed(3)} m.`,
  );
}

// Technical/detail grammar.
{
  const item = capability("isometric");
  const actors = directorCameraFidelityFixtureActors(item);
  const moment = directorCapabilityDemoMoment(item);
  const validation = validateDirectorShot(moment, actors, 9);
  assert(
    moment.shot?.camera.focus_entity_ids.length === 3,
    "isometric controlled demo must frame the whole three-actor technical envelope.",
  );
  assert(
    validation.required_visible_fraction >= 0.95,
    `isometric controlled proof must keep the technical layout visible; got ${(validation.required_visible_fraction * 100).toFixed(1)}%.`,
  );
}

for (const id of ["macro", "insert", "cutaway"] as const) {
  const item = capability(id);
  const actors = directorCameraFidelityFixtureActors(item);
  const moment = directorCapabilityDemoMoment(item);
  const detailRole = id === "insert" ? "context_subject" : "secondary_subject";
  assert(
    directorVisualAuditDefinition(item).fixture === "detail_target",
    `${id} must use the explicit detail_target fixture.`,
  );
  assert(
    moment.shot?.camera.focus_entity_ids[0] === detailRole,
    `${id} must focus controlled detail role ${detailRole}.`,
  );
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  const detail = actorById(actors, detailRole);
  const detailEye = actorEye(item, detail, 0.5, actors);
  assert(
    pose.target.distanceTo(detailEye) < 0.14,
    `${id} camera target must land on controlled detail role ${detailRole}.`,
  );
  if (id !== "cutaway") {
    assert(
      pose.position.distanceTo(pose.target) < 1.25,
      `${id} should produce a genuinely tight detail camera; got ${pose.position.distanceTo(pose.target).toFixed(3)} m.`,
    );
  }
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "actorTravelDirection",
  "leadDistance",
  "lagEnvelope",
  "sideDistance",
  "faceClearance",
  "foregroundRadius * 0.92",
  "radius * 4.05",
  'shot.composition.framing === "macro"',
]) {
  assert(runtime.includes(marker), `Phase 1B.3 runtime marker missing: ${marker}.`);
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
for (const marker of [
  'capability.id === "macro" || capability.id === "insert"',
  'movement === "track_parallel"',
  'capability.id === "isometric"',
  'shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject", "context_subject"]',
]) {
  assert(registry.includes(marker), `Phase 1B.3 registry marker missing: ${marker}.`);
}

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "DIRECTOR_CONTROLLED_AUDIT_LAYOUTS",
  "directorControlledAuditRoleLayout",
  'capability.id === "cutaway"',
  "The lag should be visibly stronger than Follow",
]) {
  assert(audit.includes(marker), `Phase 1B.3 audit marker missing: ${marker}.`);
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  'fixtureKind === "travelling_subject" && primary',
  'fixtureKind === "detail_target" && secondary',
  'fixtureKind === "technical_overview"',
  'fixtureKind === "mounted_camera" && primary',
]) {
  assert(preview.includes(marker), `Phase 1B.3 fixture marker missing: ${marker}.`);
}

console.log("Director camera grammar Phase 1B.3 verification passed.");
console.log("Viewpoint, travelling, mounted, technical-overview, and detail-target grammar canaries passed.");
console.log("Controlled fixtures remain the qualification baseline; real-asset proof remains a separate generalization check.");
