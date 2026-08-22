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

const actors: DirectorRuntimeActor[] = [
  { id: "primary_subject", position: [-2.4, 0, 0], rotation: [0, 0, 0], size: [0.98, 1.75, 0.72] },
  { id: "secondary_subject", position: [-1.6, 0, -2.9], rotation: [0, 0, 0], size: [0.7, 0.9, 0.7] },
  { id: "context_subject", position: [2.1, 0, 2.7], rotation: [0, 0, 0], size: [0.9, 0.9, 0.9] },
];

const vehicleActors: DirectorRuntimeActor[] = [
  { id: "primary_subject", position: [-2.4, 0, 0], rotation: [0, 0, 0], size: [2.35, 0.82, 1.16] },
  { id: "secondary_subject", position: [-1.6, 0, -2.9], rotation: [0, 0, 0], size: [0.7, 0.9, 0.7] },
  { id: "context_subject", position: [2.1, 0, 2.7], rotation: [0, 0, 0], size: [0.9, 0.9, 0.9] },
];

const follow = capability("follow");
const lead = capability("lead_subject");
const lag = capability("lag_follow");
const parallel = capability("track_parallel");
const mountedMovement = capability("camera_object_attached");
const mountedAngle = capability("object_attached");

function travelScreenSign(item: DirectorCapability, progress: number) {
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

// Lead closeout: preserve the visible sibling distinction but never crowd the
// primary actor's rear silhouette against the frame edge.
{
  const progress = 0.72;
  const sign = travelScreenSign(follow, progress);
  const followCenter = projectDirectorActorCenter(
    directorCapabilityDemoMoment(follow),
    actors,
    "primary_subject",
    progress,
  );
  const leadCenter = projectDirectorActorCenter(
    directorCapabilityDemoMoment(lead),
    actors,
    "primary_subject",
    progress,
  );
  const leadEnvelope = projectDirectorActorEnvelope(
    directorCapabilityDemoMoment(lead),
    actors,
    "primary_subject",
    progress,
  );
  assert(followCenter && leadCenter && leadEnvelope, "Lead projected qualification evidence is missing.");
  assert(
    (leadCenter.ndc[0] - followCenter.ndc[0]) * sign < -0.08,
    `Lead must remain materially behind Follow in screen-travel space; follow=${followCenter.ndc[0].toFixed(3)} lead=${leadCenter.ndc[0].toFixed(3)} sign=${sign}.`,
  );
  const rearEdge = sign >= 0 ? leadEnvelope.min_ndc_x : leadEnvelope.max_ndc_x;
  assert(
    sign >= 0 ? rearEdge >= -0.9 : rearEdge <= 0.9,
    `Lead rear edge violated the closeout comfort margin: ${rearEdge.toFixed(3)}.`,
  );
  assert(
    leadEnvelope.fully_inside_safe_frame,
    `Lead projected actor envelope must remain fully inside the runtime safe frame: ${JSON.stringify(leadEnvelope)}.`,
  );
}

// Lag closeout: the temporal event must be perceptible in screen space, not only
// as a camera-coordinate separation, and must recover back toward Follow.
{
  const earlyProgress = 0.18;
  const midProgress = 0.5;
  const lateProgress = 0.85;
  const sign = travelScreenSign(follow, midProgress);
  const screenDelta = (progress: number) => {
    const followCenter = projectDirectorActorCenter(
      directorCapabilityDemoMoment(follow),
      actors,
      "primary_subject",
      progress,
    );
    const lagCenter = projectDirectorActorCenter(
      directorCapabilityDemoMoment(lag),
      actors,
      "primary_subject",
      progress,
    );
    assert(followCenter && lagCenter, `Lag projected centre evidence missing at ${progress}.`);
    return (lagCenter.ndc[0] - followCenter.ndc[0]) * sign;
  };

  const earlyDelta = screenDelta(earlyProgress);
  const midDelta = screenDelta(midProgress);
  const lateDelta = screenDelta(lateProgress);
  assert(
    Math.abs(earlyDelta) < 0.04,
    `Lag should begin close to Follow before the response delay; screen delta=${earlyDelta.toFixed(3)}.`,
  );
  assert(
    midDelta > 0.08,
    `Lag must visibly pull the actor ahead of Follow through the middle; screen delta=${midDelta.toFixed(3)}.`,
  );
  assert(
    Math.abs(lateDelta) < 0.05,
    `Lag must catch back toward Follow before the end; screen delta=${lateDelta.toFixed(3)}.`,
  );

  const lagMoment = directorCapabilityDemoMoment(lag);
  const followMoment = directorCapabilityDemoMoment(follow);
  const lagMidPose = sampleDirectorCameraPose(lagMoment, midProgress, actors);
  const followMidPose = sampleDirectorCameraPose(followMoment, midProgress, actors);
  const lagMidActor = sampleDirectorActorState(lagMoment, actors[0]!, midProgress, actors);
  const followMidActor = sampleDirectorActorState(followMoment, actors[0]!, midProgress, actors);
  const lagDistance = lagMidPose.position.distanceTo(lagMidActor.position);
  const followDistance = followMidPose.position.distanceTo(followMidActor.position);
  assert(
    lagDistance / Math.max(0.001, followDistance) < 1.22,
    `Lag closeout must retain bounded apparent-size change; lag/follow distance ratio=${(lagDistance / followDistance).toFixed(3)}.`,
  );
}

// Track Parallel remains intentionally unchanged and must retain its side-rail solve.
{
  const progress = 0.62;
  const moment = directorCapabilityDemoMoment(parallel);
  const pose = sampleDirectorCameraPose(moment, progress, actors);
  const actor = sampleDirectorActorState(moment, actors[0]!, progress, actors);
  const start = sampleDirectorActorState(moment, actors[0]!, 0, actors).position;
  const end = sampleDirectorActorState(moment, actors[0]!, 1, actors).position;
  const travel = end.clone().sub(start).setY(0).normalize();
  const relation = pose.position.clone().sub(actor.position);
  const along = Math.abs(relation.dot(travel));
  const lateral = relation
    .clone()
    .addScaledVector(travel, -relation.dot(travel))
    .length();
  assert(
    lateral > along * 4,
    `Track Parallel closeout regressed its side rail; lateral=${lateral.toFixed(3)} along=${along.toFixed(3)}.`,
  );
}

// Mounted movement remains a progressive blend into the same canonical primitive.
// The relative camera distance must move through an intermediate state rather than
// behaving as an immediate mount, and the settled optical centre must remain above
// the host body.
{
  const moment = directorCapabilityDemoMoment(mountedMovement);
  const relativeDistance = (progress: number) => {
    const pose = sampleDirectorCameraPose(moment, progress, vehicleActors);
    const actor = sampleDirectorActorState(moment, vehicleActors[0]!, progress, vehicleActors);
    return {
      distance: pose.position.distanceTo(actor.position),
      height: pose.position.y - actor.position.y,
    };
  };

  const early = relativeDistance(0.08);
  const middle = relativeDistance(0.24);
  const settled = relativeDistance(0.56);
  assert(
    early.distance > middle.distance && middle.distance > settled.distance,
    `Mounted blend must pass through a progressive external→mounted relation; distances=${early.distance.toFixed(3)},${middle.distance.toFixed(3)},${settled.distance.toFixed(3)}.`,
  );
  assert(
    settled.height > vehicleActors[0]!.size[1],
    `Settled mounted optical centre must remain above the host body; relative height=${settled.height.toFixed(3)}.`,
  );

  const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const family = families.find(
    (item) =>
      item.category === "camera_movement" &&
      item.group === "Tracking & attached camera",
  );
  assert(family, "Tracking & attached camera family missing.");
  const profile = directorQualificationCapabilityProfile(family, mountedMovement.id);
  assert(
    profile.merge_compare_with_capability_id === mountedAngle.id,
    "Mounted movement ID must remain explicitly paired with object_attached for human merge/deprecation review.",
  );
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "LEAD_REAR_EDGE_SAFE_NDC = 0.88",
  "constrainLeadTargetConstantTime",
  "projectActorEnvelopeAgainstPose",
  "const lagRise = THREE.MathUtils.smootherstep(lagT, 0.12, 0.36)",
  "1 - THREE.MathUtils.smootherstep(lagT, 0.62, 0.94)",
  "pose.position.addScaledVector(direction, -lagDistance * 0.18)",
  "pose.target.addScaledVector(direction, -lagDistance * 1.05)",
  "actor.size[1] + Math.max(0.18, radius * 0.18)",
  "actor.size[2] * 0.22",
  "clamp01(input.blend_progress ?? 0)",
  "0.34",
]) {
  assert(runtime.includes(marker), `Tracking closeout runtime marker missing: ${marker}`);
}

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "isTrackingQualificationFamily",
  "qualificationAssetRoles",
  "arbitrary supporting GLBs",
]) {
  assert(room.includes(marker), `Tracking closeout Qualification Room marker missing: ${marker}`);
}

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "projected silhouette crowds the rear safe-frame edge",
  "Lag should read as a temporal event",
  "visibly ease from the external travelling view",
]) {
  assert(audit.includes(marker), `Tracking closeout visual-audit marker missing: ${marker}`);
}

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.7A.7 — Tracking family closeout hardening",
  "preferred rear-third placement",
  "brief middle hold",
  "spectator/background zone",
  "vehicle Track Parallel playback",
]) {
  assert(readme.includes(marker), `Tracking closeout README marker missing: ${marker}`);
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
  `Phase 1B.7A.7 must not mutate the Level 2 vocabulary/support distribution: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)}.`,
);

console.log("Director Qualification Room Phase 1B.7A.7 tracking closeout verification passed.");
console.log("Lead is rear-edge safe, Lag proves visible pull-ahead/recovery, Parallel remains unchanged, mounted blend is progressive, and Scene D support assets remain outside the evidence corridor.");
