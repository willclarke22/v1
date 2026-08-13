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
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const item = DIRECTOR_CAPABILITIES.find((candidate) => candidate.id === id);
  assert(item, `Missing Director capability ${id}.`);
  return item;
}

function actorById(actors: DirectorRuntimeActor[], id: string) {
  const actor = actors.find((candidate) => candidate.id === id);
  assert(actor, `Phase 1B.3.2 fixture is missing actor ${id}.`);
  return actor;
}

function actorEye(
  item: DirectorCapability,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(item);
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  return sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.08, actor.size[1]) * 0.68, 0),
  );
}

function travelDirection(
  item: DirectorCapability,
  actor: DirectorRuntimeActor,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(item);
  const start = sampleDirectorActorState(moment, actor, 0, actors).position;
  const end = sampleDirectorActorState(moment, actor, 1, actors).position;
  const travel = end.sub(start);
  travel.y = 0;
  assert(travel.lengthSq() > 0.25, `${item.id} controlled proof needs real subject travel.`);
  return travel.normalize();
}

function actorLocalCameraState(
  item: DirectorCapability,
  progress: number,
) {
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const actorSample = sampleDirectorActorState(moment, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const inverse = new THREE.Quaternion().setFromEuler(actorSample.rotation).invert();
  return {
    mount: pose.position.clone().sub(actorSample.position).applyQuaternion(inverse),
    view: pose.target.clone().sub(pose.position).normalize().applyQuaternion(inverse).normalize(),
  };
}

for (const id of [
  "point_of_view",
  "over_shoulder",
  "follow",
  "lead_subject",
  "lag_follow",
  "track_parallel",
  "object_attached",
  "camera_object_attached",
  "macro",
  "insert",
]) {
  capability(id);
}

// Freeze the already-qualified camera family behind simple regressions.
{
  const follow = capability("follow");
  const actors = directorCameraFidelityFixtureActors(follow);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(follow);
  const relationAt = (progress: number) => {
    const actorPosition = sampleDirectorActorState(moment, actor, progress, actors).position;
    return sampleDirectorCameraPose(moment, progress, actors).position.sub(actorPosition);
  };
  assert(
    relationAt(0.2).distanceTo(relationAt(0.8)) < 0.15,
    "Follow regressed while Phase 1B.3.2 was refining neighboring camera grammar.",
  );
}

{
  const pov = capability("point_of_view");
  const actors = directorCameraFidelityFixtureActors(pov);
  const sourceActor = actorById(actors, "primary_subject");
  const focusActor = actorById(actors, "secondary_subject");
  const moment = directorCapabilityDemoMoment(pov);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  assert(
    pose.target.distanceTo(actorEye(pov, focusActor, 0.5, actors)) < 0.12,
    "POV regressed while Phase 1B.3.2 was refining neighboring camera grammar.",
  );
  assert(
    pose.position.distanceTo(actorEye(pov, sourceActor, 0.5, actors)) >
      Math.abs(sourceActor.size[2]) * 0.4,
    "POV re-entered the source actor face volume.",
  );
}

// Track-parallel must be stable from the first frame, not only after settling.
{
  const item = capability("track_parallel");
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const step = moment.shot?.camera.movement_steps.find(
    (candidate) => candidate.movement === "track_parallel",
  );
  assert(step, "Track Parallel demo is missing its camera movement step.");
  assert(
    step.start_progress === 0 && step.end_progress === 1,
    `Track Parallel controlled proof must occupy the full shot; got ${step.start_progress}-${step.end_progress}.`,
  );

  const direction = travelDirection(item, actor, actors);
  const checkpoints = [0, 0.25, 0.5, 0.75, 1].map((progress) => {
    const eye = actorEye(item, actor, progress, actors);
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    const relation = pose.position.clone().sub(eye);
    return {
      relation,
      distance: relation.length(),
      targetError: pose.target.distanceTo(eye),
      apparentSizeProxy: actor.size[1] / Math.max(0.001, relation.length()),
    };
  });

  const baseline = checkpoints[0]!;
  const distances = checkpoints.map((entry) => entry.distance);
  const apparent = checkpoints.map((entry) => entry.apparentSizeProxy);
  const distanceSpread = Math.max(...distances) - Math.min(...distances);
  const apparentSpread = Math.max(...apparent) - Math.min(...apparent);
  const relationDrift = Math.max(
    ...checkpoints.map((entry) => entry.relation.distanceTo(baseline.relation)),
  );
  const targetError = Math.max(...checkpoints.map((entry) => entry.targetError));
  const finalRelation = checkpoints[checkpoints.length - 1]!.relation;
  const along = Math.abs(finalRelation.dot(direction));
  const lateral = finalRelation
    .clone()
    .addScaledVector(direction, -finalRelation.dot(direction))
    .length();

  assert(distanceSpread < 0.08, `Track Parallel full-shot distance spread is ${distanceSpread.toFixed(3)} m.`);
  assert(apparentSpread < 0.035, `Track Parallel apparent-size proxy spread is ${apparentSpread.toFixed(3)}.`);
  assert(relationDrift < 0.1, `Track Parallel full-shot relation drift is ${relationDrift.toFixed(3)} m.`);
  assert(targetError < 0.08, `Track Parallel maximum target error is ${targetError.toFixed(3)} m.`);
  assert(
    lateral > along * 5,
    `Track Parallel must remain overwhelmingly lateral; lateral ${lateral.toFixed(3)}, along ${along.toFixed(3)}.`,
  );
}

// Macro should be recognizable, not maximally close: exact feature centre,
// complete screw head, and enough clearance for surrounding panel context.
{
  const item = capability("macro");
  const actors = directorCameraFidelityFixtureActors(item);
  const screw = actorById(actors, "secondary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  const screwSample = sampleDirectorActorState(moment, screw, 0.5, actors);
  const distance = pose.position.distanceTo(pose.target);

  assert(
    moment.shot?.camera.focus_entity_ids[0] === "secondary_subject",
    "Macro must remain focused on the controlled screw/fastener.",
  );
  assert(
    pose.target.distanceTo(screwSample.position) < 0.025,
    `Macro must target the tiny feature geometric centre; error ${pose.target.distanceTo(screwSample.position).toFixed(3)} m.`,
  );
  assert(
    distance >= 0.4 && distance <= 0.7,
    `Macro camera clearance should preserve recognizable context; distance ${distance.toFixed(3)} m.`,
  );
  assert(pose.fov <= 26, `Macro should retain a tight optical field of view; got ${pose.fov.toFixed(1)}°.`);
}

// Insert passed visual review and should remain semantically distinct.
{
  const item = capability("insert");
  const actors = directorCameraFidelityFixtureActors(item);
  const moment = directorCapabilityDemoMoment(item);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  assert(
    moment.shot?.camera.focus_entity_ids[0] === "context_subject",
    "Insert regressed: it must remain focused on the larger lever/control.",
  );
  assert(pose.fov >= 30, `Insert should remain wider than Macro; got ${pose.fov.toFixed(1)}°.`);
}

// Mounted runtime remains actor-local. 1B.3.2 strengthens the proof fixture,
// not the already-correct local transform grammar.
for (const id of ["object_attached", "camera_object_attached"] as const) {
  const item = capability(id);
  const a = actorLocalCameraState(item, id === "object_attached" ? 0.25 : 0.45);
  const b = actorLocalCameraState(item, id === "object_attached" ? 0.8 : 0.9);
  assert(
    a.mount.distanceTo(b.mount) < 0.08,
    `${id} local mount regressed during fixture-only refinement.`,
  );
  assert(
    THREE.MathUtils.radToDeg(a.view.angleTo(b.view)) < 2.5,
    `${id} local view direction regressed during fixture-only refinement.`,
  );
  assert(
    b.view.dot(new THREE.Vector3(0, 0, 1)) > 0.94,
    `${id} must continue looking along actor-local forward.`,
  );
  assert(
    directorVisualAuditDefinition(item).fixture === "mounted_camera",
    `${id} must remain on the mounted-camera qualification fixture.`,
  );
}

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.3.2 must not change support classifications: ${JSON.stringify(supportCounts)}.`,
);

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "parallelRailStartsWithShot",
  "pose.position.copy(desiredPosition)",
  "pose.target.copy(desiredTarget)",
  'shot.composition.framing === "macro" && samples.length === 1',
  "? 0.44",
]) {
  assert(runtime.includes(marker), `Phase 1B.3.2 runtime marker missing: ${marker}.`);
}
assert(!runtime.includes("const railBlend ="), "Track Parallel must not retain the entry-zoom railBlend.");

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
for (const marker of [
  'start_progress: movement === "track_parallel" ? 0 : 0.05',
  'end_progress: movement === "track_parallel" ? 1 : 0.9',
  'easing: movement === "track_parallel" ? "linear" : "ease_in_out"',
]) {
  assert(registry.includes(marker), `Phase 1B.3.2 registry marker missing: ${marker}.`);
}

const fidelity = source(
  "sandbox/probe-lab/motion-camera-library/director-camera-fidelity.ts",
);
for (const marker of [
  "full distance spread",
  "apparent-size proxy spread",
  "distanceIsLegible",
  "complete head loses recognizability",
]) {
  assert(fidelity.includes(marker), `Phase 1B.3.2 fidelity marker missing: ${marker}.`);
}

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "first frame",
  "complete circular head",
  "small vehicle",
  "road gates",
]) {
  assert(audit.includes(marker), `Phase 1B.3.2 audit marker missing: ${marker}.`);
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "function MountedCameraCourse",
  "gatePositions",
  "vehicle-like host",
  "Mount marker + local XYZ axes",
  "Math.PI / 2",
]) {
  assert(preview.includes(marker), `Phase 1B.3.2 preview marker missing: ${marker}.`);
}

console.log("Director camera grammar Phase 1B.3.2 verification passed.");
console.log("Track Parallel is full-shot stable; Macro preserves recognizable fastener context.");
console.log("Mounted runtime regressions are guarded while the controlled vehicle/course fixture makes the view judgeable.");
