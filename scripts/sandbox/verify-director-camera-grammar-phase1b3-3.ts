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
  assert(actor, `Phase 1B.3.3 fixture is missing actor ${id}.`);
  return actor;
}

function cameraForPose(
  pose: ReturnType<typeof sampleDirectorCameraPose>,
) {
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function localMountedState(
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
    actor,
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
  "insert",
  "track_parallel",
  "macro",
  "object_attached",
  "camera_object_attached",
]) {
  capability(id);
}

// The authored Track Parallel sample was already full-shot stable in 1B.3.2.
// 1B.3.3 prevents the controlled UI from showing a different paused camera.
{
  const item = capability("track_parallel");
  const actors = directorCameraFidelityFixtureActors(item);
  const moment = directorCapabilityDemoMoment(item);
  const p0 = sampleDirectorCameraPose(moment, 0, actors);
  const pTiny = sampleDirectorCameraPose(moment, 0.001, actors);
  assert(
    p0.position.distanceTo(pTiny.position) < 0.02 &&
      p0.target.distanceTo(pTiny.target) < 0.02,
    "Track Parallel authored t=0 pose must be continuous into the first playback sample.",
  );
}

// Macro must keep the entire familiar cross-head inside a conservative safe
// frame at each standard fidelity checkpoint.
{
  const item = capability("macro");
  const actors = directorCameraFidelityFixtureActors(item);
  const screw = actorById(actors, "secondary_subject");
  const moment = directorCapabilityDemoMoment(item);
  const halfHead = Math.max(0.055, screw.size[0] * 0.5);
  let maxAbsX = 0;
  let maxAbsY = 0;

  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    const camera = cameraForPose(pose);
    const sample = sampleDirectorActorState(moment, screw, progress, actors);
    for (const point of [
      sample.position.clone().add(new THREE.Vector3(-halfHead, 0, 0)),
      sample.position.clone().add(new THREE.Vector3(halfHead, 0, 0)),
      sample.position.clone().add(new THREE.Vector3(0, -halfHead, 0)),
      sample.position.clone().add(new THREE.Vector3(0, halfHead, 0)),
    ]) {
      const projected = point.project(camera);
      maxAbsX = Math.max(maxAbsX, Math.abs(projected.x));
      maxAbsY = Math.max(maxAbsY, Math.abs(projected.y));
    }
    assert(
      pose.target.distanceTo(sample.position) < 0.025,
      `Macro target drifted away from fastener centre at ${progress}.`,
    );
  }

  assert(
    maxAbsX <= 0.82 && maxAbsY <= 0.82,
    `Macro fastener leaves the safe frame: max projected x/y ${maxAbsX.toFixed(3)}/${maxAbsY.toFixed(3)}.`,
  );
}

// Both mounted forms use a high/back default mount and a stable, slightly
// downward-forward actor-local view. The movement form is sampled after attach.
for (const id of ["object_attached", "camera_object_attached"] as const) {
  const item = capability(id);
  const progress = id === "object_attached" ? 0.5 : 0.9;
  const state = localMountedState(item, progress);
  assert(
    state.mount.y >= state.actor.size[1] * 0.64,
    `${id} mount is still too low: y ${state.mount.y.toFixed(3)} m.`,
  );
  assert(
    state.mount.z <= state.actor.size[2] * 0.3,
    `${id} mount is still too far forward: z ${state.mount.z.toFixed(3)} m.`,
  );
  assert(
    state.view.y < -0.08,
    `${id} mounted view needs a slight downward pitch; local y ${state.view.y.toFixed(3)}.`,
  );
  assert(
    state.view.dot(new THREE.Vector3(0, 0, 1)) > 0.96,
    `${id} mounted view must remain predominantly actor-local forward.`,
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
  `Phase 1B.3.3 must not change support classifications: ${JSON.stringify(supportCounts)}.`,
);

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "defaultActorLocalMountedPosition",
  "defaultActorLocalMountedViewDirection",
  "actor.size[1] * 0.72",
  "actor.size[2] * 0.08 + radius * 0.04",
  "new THREE.Vector3(0, -0.16, 1)",
  "const authoredStart = runtimeProgress <= 0.001",
]) {
  assert(runtime.includes(marker), `Phase 1B.3.3 runtime marker missing: ${marker}.`);
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
assert(
  registry.includes("view_direction: [0, -0.16, 1]"),
  "Phase 1B.3.3 mounted demo must use the downward-forward local view.",
);

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "enabled={!auditSnap && !isPlaying}",
  "Controlled audit proofs are camera-authoritative",
  "higher/back body mount",
]) {
  assert(preview.includes(marker), `Phase 1B.3.3 preview marker missing: ${marker}.`);
}

const fidelity = source(
  "sandbox/probe-lab/motion-camera-library/director-camera-fidelity.ts",
);
for (const marker of [
  "projectedFeatureBounds",
  "max projected x/y",
  "mountedHighBack",
  "downwardForward",
]) {
  assert(fidelity.includes(marker), `Phase 1B.3.3 fidelity marker missing: ${marker}.`);
}

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "paused 0% proof",
  "complete circular head stays inside the safe frame",
  "mounted high/back on a small vehicle",
]) {
  assert(audit.includes(marker), `Phase 1B.3.3 audit marker missing: ${marker}.`);
}

console.log("Director camera grammar Phase 1B.3.3 verification passed.");
console.log("Controlled t=0 camera authority and Macro safe-frame projection passed.");
console.log("Mounted defaults are high/back with a stable downward-forward actor-local view.");
