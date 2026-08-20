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
  const value = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(value, `Missing Director capability ${id}.`);
  return value;
}

function actorById(actors: DirectorRuntimeActor[], id: string) {
  const actor = actors.find((candidate) => candidate.id === id);
  assert(actor, `Controlled refinement fixture is missing actor ${id}.`);
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
  const delta = end.sub(start);
  delta.y = 0;
  assert(delta.lengthSq() > 0.25, `${item.id} fixture must contain real subject travel.`);
  return delta.normalize();
}

function signedLookBias(
  item: DirectorCapability,
  progress: number,
) {
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const direction = travelDirection(item, actor, actors);
  const eye = actorEye(item, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  return pose.target.clone().sub(eye).dot(direction);
}

function actorLocalCameraState(
  item: DirectorCapability,
  progress: number,
) {
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const sample = sampleDirectorActorState(moment, actor, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const inverse = new THREE.Quaternion()
    .setFromEuler(sample.rotation)
    .invert();

  return {
    mount: pose.position
      .clone()
      .sub(sample.position)
      .applyQuaternion(inverse),
    view: pose.target
      .clone()
      .sub(pose.position)
      .normalize()
      .applyQuaternion(inverse)
      .normalize(),
  };
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
  "macro",
  "insert",
]) {
  assert(capability(id), `Phase 1B.3.1 refinement canary ${id} is missing.`);
}

// Preserve the two capabilities that passed human review.
{
  const item = capability("point_of_view");
  const actors = directorCameraFidelityFixtureActors(item);
  const sourceActor = actorById(actors, "primary_subject");
  const focusActor = actorById(actors, "secondary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  const sourceEye = actorEye(item, sourceActor, 0.5, actors);
  const focusEye = actorEye(item, focusActor, 0.5, actors);

  assert(
    pose.target.distanceTo(focusEye) < 0.12,
    "Point of view regressed: it no longer targets the declared focus actor.",
  );
  assert(
    pose.position.distanceTo(sourceEye) > Math.abs(sourceActor.size[2]) * 0.4,
    "Point of view regressed: it entered the source face volume.",
  );
}

{
  const item = capability("follow");
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const relation = (progress: number) => {
    const actorPosition = sampleDirectorActorState(moment, actor, progress, actors).position;
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    return pose.position.clone().sub(actorPosition);
  };
  const drift = relation(0.25).distanceTo(relation(0.85));
  assert(drift < 0.15, `Follow regressed: actor-relative camera drift is ${drift.toFixed(3)} m.`);
}

// OTS keeps the passing relationship but lowers the optical centre slightly.
{
  const item = capability("over_shoulder");
  const actors = directorCameraFidelityFixtureActors(item);
  const sourceActor = actorById(actors, "primary_subject");
  const focusActor = actorById(actors, "secondary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const pose = sampleDirectorCameraPose(moment, 0.5, actors);
  const sourceEye = actorEye(item, sourceActor, 0.5, actors);
  const focusEye = actorEye(item, focusActor, 0.5, actors);

  assert(
    pose.position.y < sourceEye.y - 0.02,
    `Over-shoulder optical centre should sit slightly below source eye height; camera ${pose.position.y.toFixed(3)}, eye ${sourceEye.y.toFixed(3)}.`,
  );
  assert(
    pose.target.distanceTo(focusEye) < 0.14,
    "Over-shoulder polish must preserve focus-actor targeting.",
  );
}

// Lead / lag must now be visibly separated from ordinary Follow.
{
  const followItem = capability("follow");
  const leadItem = capability("lead_subject");
  const lagItem = capability("lag_follow");

  const followBias = signedLookBias(followItem, 0.55);
  const leadBias = signedLookBias(leadItem, 0.78);
  const lagBias = signedLookBias(lagItem, 0.55);
  const lagEndBias = signedLookBias(lagItem, 1);

  assert(
    leadBias > followBias + 0.45,
    `Lead must be visibly ahead of Follow; follow ${followBias.toFixed(3)} m, lead ${leadBias.toFixed(3)} m.`,
  );
  assert(
    lagBias < followBias - 0.45,
    `Lag must be visibly behind Follow; follow ${followBias.toFixed(3)} m, lag ${lagBias.toFixed(3)} m.`,
  );
  assert(
    Math.abs(lagEndBias - followBias) < 0.2,
    `Lag must catch back toward Follow by the end; follow ${followBias.toFixed(3)} m, lag end ${lagEndBias.toFixed(3)} m.`,
  );
}

// Parallel tracking must behave like a second rail beside the actor.
{
  const item = capability("track_parallel");
  const actors = directorCameraFidelityFixtureActors(item);
  const actor = actorById(actors, "primary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const direction = travelDirection(item, actor, actors);

  const sample = (progress: number) => {
    const eye = actorEye(item, actor, progress, actors);
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    const relation = pose.position.clone().sub(eye);
    return {
      relation,
      distance: relation.length(),
      targetError: pose.target.distanceTo(eye),
    };
  };

  const a = sample(0.35);
  const b = sample(0.65);
  const c = sample(0.9);
  const distanceSpread = Math.max(a.distance, b.distance, c.distance) -
    Math.min(a.distance, b.distance, c.distance);
  const relationDrift = Math.max(
    a.relation.distanceTo(b.relation),
    b.relation.distanceTo(c.relation),
    a.relation.distanceTo(c.relation),
  );
  const along = Math.abs(c.relation.dot(direction));
  const lateral = c.relation
    .clone()
    .addScaledVector(direction, -c.relation.dot(direction))
    .length();

  assert(distanceSpread < 0.16, `Track parallel distance should stay nearly constant; spread ${distanceSpread.toFixed(3)} m.`);
  assert(relationDrift < 0.2, `Track parallel side relation should stay stable; drift ${relationDrift.toFixed(3)} m.`);
  assert(c.targetError < 0.12, `Track parallel should keep the subject centered; target error ${c.targetError.toFixed(3)} m.`);
  assert(lateral > along * 5, `Track parallel should be overwhelmingly lateral; lateral ${lateral.toFixed(3)}, along ${along.toFixed(3)}.`);
}

// Mounted views must preserve both local mount and outward local view direction.
for (const id of ["object_attached", "camera_object_attached"] as const) {
  const item = capability(id);
  const pA = id === "object_attached" ? 0.25 : 0.4;
  const pB = id === "object_attached" ? 0.78 : 0.88;
  const a = actorLocalCameraState(item, pA);
  const b = actorLocalCameraState(item, pB);
  const mountDrift = a.mount.distanceTo(b.mount);
  const viewDriftDegrees = THREE.MathUtils.radToDeg(a.view.angleTo(b.view));
  const forwardAlignment = b.view.dot(new THREE.Vector3(0, 0, 1));

  assert(mountDrift < 0.08, `${id} local mount drift is ${mountDrift.toFixed(3)} m.`);
  assert(viewDriftDegrees < 2.5, `${id} local view-direction drift is ${viewDriftDegrees.toFixed(3)} degrees.`);
  assert(
    forwardAlignment > 0.94,
    `${id} must look outward along actor-local forward; alignment ${forwardAlignment.toFixed(3)}.`,
  );
}

// Macro and Insert now prove two different recognizable details.
{
  const macro = capability("macro");
  const insert = capability("insert");
  const macroActors = directorCameraFidelityFixtureActors(macro);
  const insertActors = directorCameraFidelityFixtureActors(insert);
  const macroMoment = directorCapabilityDemoMoment(macro);
  const insertMoment = directorCapabilityDemoMoment(insert);
  const macroPose = sampleDirectorCameraPose(macroMoment, 0.5, macroActors);
  const insertPose = sampleDirectorCameraPose(insertMoment, 0.5, insertActors);

  assert(
    directorVisualAuditDefinition(macro).fixture === "detail_target" &&
      directorVisualAuditDefinition(insert).fixture === "detail_target",
    "Macro and Insert must remain on the recognizable detail_target fixture.",
  );
  assert(
    macroMoment.shot?.camera.focus_entity_ids[0] === "secondary_subject",
    "Macro must focus the tiny fastener actor.",
  );
  assert(
    insertMoment.shot?.camera.focus_entity_ids[0] === "context_subject",
    "Insert must focus the larger lever/control actor.",
  );

  const fastener = actorById(macroActors, "secondary_subject");
  const lever = actorById(insertActors, "context_subject");
  const fastenerRadius = Math.sqrt(
    fastener.size[0] ** 2 + fastener.size[1] ** 2 + fastener.size[2] ** 2,
  ) * 0.5;
  const leverRadius = Math.sqrt(
    lever.size[0] ** 2 + lever.size[1] ** 2 + lever.size[2] ** 2,
  ) * 0.5;

  assert(
    fastenerRadius < leverRadius * 0.55,
    `Macro target must be materially smaller than Insert target; fastener ${fastenerRadius.toFixed(3)}, lever ${leverRadius.toFixed(3)}.`,
  );
  const macroDistance = macroPose.position.distanceTo(macroPose.target);
  assert(
    macroDistance >= 0.4 && macroDistance <= 0.7,
    `Macro should stay close while preserving the complete fastener; distance ${macroDistance.toFixed(3)} m.`,
  );
  assert(
    macroPose.fov < insertPose.fov,
    `Macro should remain optically tighter than Insert; macro FOV ${macroPose.fov.toFixed(1)}, insert FOV ${insertPose.fov.toFixed(1)}.`,
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
  supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.3.1 must not silently change support classifications: ${JSON.stringify(supportCounts)}.`,
);

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "actorLocalMountedView",
  "parallelRailStartsWithShot",
  "attachBlend",
  "radius * 1.34",
  "radius * 1.26",
  "foregroundActor.size[1] * 0.045",
  "localViewDirection",
]) {
  assert(runtime.includes(marker), `Phase 1B.3.1 runtime marker missing: ${marker}.`);
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
for (const marker of [
  'const detailRole = capability.id === "macro"',
  '"context_subject"',
  "distance_m: 3.15",
  "look_distance_m: 4.2",
]) {
  assert(registry.includes(marker), `Phase 1B.3.1 registry marker missing: ${marker}.`);
}

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "Recognizable control-panel fixture",
  "tiny screw (Macro)",
  "larger lever/control (Insert)",
  "second rail at the first frame",
]) {
  assert(audit.includes(marker), `Phase 1B.3.1 audit marker missing: ${marker}.`);
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "small machine/control panel",
  "Macro target: tiny metal fastener",
  "Insert target: a larger, semantically meaningful lever/control",
  "mounted outward view",
]) {
  assert(preview.includes(marker), `Phase 1B.3.1 fixture marker missing: ${marker}.`);
}

console.log("Director camera grammar Phase 1B.3.1 verification passed.");
console.log("POV and Follow regression canaries passed; OTS lower polish passed.");
console.log("Lead/Lag separation, parallel side rail, mounted local orientation, and distinct Macro/Insert detail targets passed.");
