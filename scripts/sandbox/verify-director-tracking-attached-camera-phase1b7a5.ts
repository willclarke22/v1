import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
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

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const family = families.find(
  (item) =>
    item.category === "camera_movement" &&
    item.group === "Tracking & attached camera",
);
assert(family, "Tracking & attached camera qualification family is missing.");
assert(
  family.capability_ids.join("|") ===
    "follow|lead_subject|lag_follow|track_parallel|camera_object_attached",
  `Unexpected tracking family membership: ${family.capability_ids.join("|")}.`,
);

for (const id of ["follow", "lead_subject", "lag_follow", "track_parallel"]) {
  const profile = directorQualificationCapabilityProfile(family, id);
  assert(
    profile.comparison_group === "tracking_relationship" &&
      profile.suitable_primary_cast_slots.join("|") === "character|vehicle" &&
      profile.requires_directional_facing,
    `${id} must use comparable character/vehicle tracking evidence with directional facing.`,
  );
}

const mountedProfile = directorQualificationCapabilityProfile(
  family,
  "camera_object_attached",
);
assert(
  mountedProfile.comparison_group === "mounted_camera" &&
    mountedProfile.suitable_primary_cast_slots.join("|") === "vehicle" &&
    mountedProfile.merge_compare_with_capability_id === "object_attached",
  "Object-attached camera must be vehicle-gated and explicitly compared with object_attached before merge/keep decisions.",
);

const actors: DirectorRuntimeActor[] = [
  {
    id: "primary_subject",
    position: [-2.4, 0, 0],
    rotation: [0, 0, 0],
    size: [0.98, 1.75, 0.72],
  },
  {
    id: "secondary_subject",
    position: [2.6, 0, -1.85],
    rotation: [0, 0, 0],
    size: [0.7, 0.9, 0.7],
  },
  {
    id: "context_subject",
    position: [-2.6, 0, -1.85],
    rotation: [0, 0, 0],
    size: [0.9, 0.9, 0.9],
  },
];

function actorEye(
  moment: ReturnType<typeof directorCapabilityDemoMoment>,
  progress: number,
) {
  const primary = actors[0]!;
  const sample = sampleDirectorActorState(
    moment,
    primary,
    progress,
    actors,
  );
  return sample.position
    .clone()
    .add(new THREE.Vector3(0, Math.max(0.08, primary.size[1]) * 0.68, 0));
}

const followMoment = directorCapabilityDemoMoment(capability("follow"));
const leadMoment = directorCapabilityDemoMoment(capability("lead_subject"));
const lagMoment = directorCapabilityDemoMoment(capability("lag_follow"));
const parallelMoment = directorCapabilityDemoMoment(capability("track_parallel"));

const primaryStart = sampleDirectorActorState(
  followMoment,
  actors[0]!,
  0,
  actors,
).position;
const primaryEnd = sampleDirectorActorState(
  followMoment,
  actors[0]!,
  1,
  actors,
).position;
const travelDirection = primaryEnd.clone().sub(primaryStart);
travelDirection.y = 0;
assert(
  travelDirection.length() > 0.5,
  "Tracking canary needs meaningful primary travel.",
);
travelDirection.normalize();

function signedLookBias(
  moment: ReturnType<typeof directorCapabilityDemoMoment>,
  progress: number,
) {
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const eye = actorEye(moment, progress);
  return pose.target.clone().sub(eye).dot(travelDirection);
}

const followBias = signedLookBias(followMoment, 0.72);
const leadBias = signedLookBias(leadMoment, 0.72);
const lagBias = signedLookBias(lagMoment, 0.55);
const lagEndBias = signedLookBias(lagMoment, 1);

assert(
  leadBias > followBias + 0.45,
  `Lead must reserve unmistakable forward look room relative to Follow; follow=${followBias.toFixed(3)} lead=${leadBias.toFixed(3)}.`,
);
assert(
  lagBias < followBias - 0.12,
  `Lag must visibly fall behind Follow through the middle; follow=${followBias.toFixed(3)} lag=${lagBias.toFixed(3)}.`,
);
assert(
  Math.abs(lagEndBias - signedLookBias(followMoment, 1)) < 0.16,
  `Lag must catch back toward Follow by the end; lag=${lagEndBias.toFixed(3)} follow=${signedLookBias(followMoment, 1).toFixed(3)}.`,
);

const parallelPose = sampleDirectorCameraPose(parallelMoment, 0.62, actors);
const parallelEye = actorEye(parallelMoment, 0.62);
const parallelRelation = parallelPose.position.clone().sub(parallelEye);
const parallelAlong = Math.abs(parallelRelation.dot(travelDirection));
const parallelLateral = parallelRelation
  .clone()
  .addScaledVector(travelDirection, -parallelRelation.dot(travelDirection))
  .length();
assert(
  parallelLateral > parallelAlong * 4,
  `Track Parallel must remain predominantly perpendicular to subject travel; lateral=${parallelLateral.toFixed(3)} along=${parallelAlong.toFixed(3)}.`,
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "trackingComparisonSlotForPass",
  "Sibling comparison · ${slot}",
  "Directional actors are",
  "merge_compare_with_capability_id",
  "primaryTravelHeadingRadians",
  "facing_correction_degrees: role.facing_correction_degrees",
]) {
  assert(room.includes(marker), `Qualification Room tracking evidence marker missing: ${marker}`);
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
assert(
  preview.includes("roadside orientation markers") &&
    !preview.includes("mounted-gate-"),
  "Mounted-camera qualification stage must use non-occluding roadside markers instead of overhead gate bars.",
);

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "screen-space* look room",
  "Lag is a delayed tracking response",
  "radius * 2.35",
  "radius * 0.82",
]) {
  assert(runtime.includes(marker), `Tracking runtime marker missing: ${marker}`);
}

const objectAttached = capability("object_attached");
const cameraObjectAttached = capability("camera_object_attached");
assert(
  objectAttached.category === "camera_angle" &&
    cameraObjectAttached.category === "camera_movement",
  "Mounted angle/movement vocabulary distinction must remain intact until human merge review.",
);

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
  `Phase 1B.7A.5 must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
);

console.log("Director Qualification Room Phase 1B.7A.5 tracking verification passed.");
console.log(
  "Follow/Lead/Lag/Parallel now have distinct runtime relationships; sibling reels use same-actor character/vehicle blocks with travel-facing alignment, and mounted-camera remains an explicit merge candidate rather than being silently preserved or deleted.",
);
