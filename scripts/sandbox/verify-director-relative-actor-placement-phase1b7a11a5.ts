import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  directorCapabilityDemoShot,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  type DirectorQualificationFamily,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_RELATIVE_ACTOR_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustRelativeActorFixturePositions,
  directorQualificationRelativeActorAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  DIRECTOR_QUALIFICATION_SCENES,
  type DirectorQualificationScene,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  applyDirectorBlocking,
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  sampleDirectorCameraPose,
  type DirectorProjectedActorEnvelope,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

function relativeFamily(): DirectorQualificationFamily {
  const found = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) =>
      family.category === "blocking_placement" &&
      family.group === "Relative actor placement",
  );
  assert(found, "Relative actor placement qualification family is missing.");
  return found;
}

function sceneB(): DirectorQualificationScene {
  const found = DIRECTOR_QUALIFICATION_SCENES.find(
    (scene) => scene.id === "scene_b_spatial_relationship",
  );
  assert(found, "Scene B qualification fixture is missing.");
  return found;
}

const ROLE_SIZES: Record<string, [number, number, number]> = {
  primary_subject: [0.78, 1.65, 0.56],
  secondary_subject: [1.18, 1.1, 0.88],
  context_subject: [0.52, 1.16, 0.42],
};

const ROLE_EXTENTS: Record<string, number> = {
  primary_subject: 1.65,
  secondary_subject: 1.18,
  context_subject: 1.16,
};

function basePositionForRole(
  scene: DirectorQualificationScene,
  role: string,
): [number, number, number] {
  if (role === "primary_subject") return [...scene.blocking.primary];
  if (role === "secondary_subject") return [...scene.blocking.secondary];
  return [...scene.blocking.context];
}

function qualificationEvidence(id: string) {
  const family = relativeFamily();
  const scene = sceneB();
  const selected = capability(id);
  const roles = directorQualificationRelativeActorAssetRoles(
    family,
    selected,
  );
  const positions = directorQualificationAdjustRelativeActorFixturePositions({
    family,
    capability: selected,
    scene,
    positions: roles.map((role) => basePositionForRole(scene, role.role)),
    target_extents_m: roles.map((role) => ROLE_EXTENTS[role.role] ?? 1),
  });
  const promoted: DirectorCapability = {
    ...selected,
    demo: {
      ...selected.demo,
      required_visible_roles: roles.map((role) => role.role),
      blocking: roles.map((role, index) => ({
        role: role.role,
        position: positions[index] ?? basePositionForRole(scene, role.role),
        rotation: [0, 0, 0],
        target_extent_m: ROLE_EXTENTS[role.role] ?? 1,
      })),
    },
  };
  const actors: DirectorRuntimeActor[] = roles.map((role, index) => ({
    id: role.role,
    position: positions[index] ?? basePositionForRole(scene, role.role),
    rotation: [0, 0, 0],
    size: ROLE_SIZES[role.role] ?? [0.8, 1, 0.7],
  }));
  const moment = directorCapabilityDemoMoment(promoted);
  return { family, scene, selected, promoted, actors, moment };
}

function groundBasis(
  moment: ReturnType<typeof directorCapabilityDemoMoment>,
  actors: DirectorRuntimeActor[],
) {
  const pose = sampleDirectorCameraPose(moment, 0, actors);
  const fullForward = pose.target.clone().sub(pose.position);
  if (fullForward.lengthSq() < 0.000001) fullForward.set(0, 0, -1);
  fullForward.normalize();
  let right = new THREE.Vector3().crossVectors(
    fullForward,
    new THREE.Vector3(0, 1, 0),
  );
  if (right.lengthSq() < 0.000001) right = new THREE.Vector3(1, 0, 0);
  else right.normalize();
  const forward = fullForward.clone();
  forward.y = 0;
  if (forward.lengthSq() < 0.000001) forward.set(-right.z, 0, right.x);
  forward.normalize();
  right.y = 0;
  if (right.lengthSq() < 0.000001) right.set(1, 0, 0);
  else right.normalize();
  return { right, forward };
}

function groundRadius(actor: DirectorRuntimeActor) {
  return Math.max(
    0.16,
    Math.hypot(Math.abs(actor.size[0]), Math.abs(actor.size[2])) * 0.5,
  );
}

function overlapRatio(
  left: DirectorProjectedActorEnvelope,
  right: DirectorProjectedActorEnvelope,
) {
  const overlapWidth = Math.max(
    0,
    Math.min(left.max_ndc_x, right.max_ndc_x) -
      Math.max(left.min_ndc_x, right.min_ndc_x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.max_ndc_y, right.max_ndc_y) -
      Math.max(left.min_ndc_y, right.min_ndc_y),
  );
  const overlapArea = overlapWidth * overlapHeight;
  const leftArea = Math.max(0.000001, left.width_ndc * left.height_ndc);
  const rightArea = Math.max(0.000001, right.width_ndc * right.height_ndc);
  return overlapArea / Math.min(leftArea, rightArea);
}

function horizontalGap(
  left: DirectorProjectedActorEnvelope,
  right: DirectorProjectedActorEnvelope,
) {
  return Math.max(
    0,
    right.min_ndc_x - left.max_ndc_x,
    left.min_ndc_x - right.max_ndc_x,
  );
}

function projectedPair(
  moment: ReturnType<typeof directorCapabilityDemoMoment>,
  blocked: DirectorRuntimeActor[],
) {
  const primary = projectDirectorActorEnvelope(
    moment,
    blocked,
    "primary_subject",
    0,
  );
  const secondary = projectDirectorActorEnvelope(
    moment,
    blocked,
    "secondary_subject",
    0,
  );
  assert(primary && secondary, "Missing projected pair evidence.");
  assert(
    primary.fully_inside_safe_frame && secondary.fully_inside_safe_frame,
    "Relative actor pair must remain inside the safe frame.",
  );
  return { primary, secondary };
}

function semanticAxisSample(
  id: "beside" | "in_front_of" | "behind",
  angle: "three_quarter_front" | "side_profile" | "front_profile",
) {
  const evidence = qualificationEvidence(id);
  assert(evidence.moment.shot, `${id} demo moment is missing its shot.`);
  evidence.moment.shot.composition.angle = angle;
  const basis = groundBasis(evidence.moment, evidence.actors);
  const blocked = applyDirectorBlocking(evidence.moment, evidence.actors);
  const primary = blocked.find((actor) => actor.id === "primary_subject");
  const secondary = blocked.find((actor) => actor.id === "secondary_subject");
  assert(primary && secondary, `${id} blocked pair is missing.`);
  const delta = new THREE.Vector3(...primary.position).sub(
    new THREE.Vector3(...secondary.position),
  );
  const projected = projectedPair(evidence.moment, blocked);
  return {
    basis,
    blocked,
    primary,
    secondary,
    right: delta.dot(basis.right),
    forward: delta.dot(basis.forward),
    projected,
    overlap: overlapRatio(projected.primary, projected.secondary),
    gap: horizontalGap(projected.primary, projected.secondary),
  };
}

function primaryForward(actor: DirectorRuntimeActor) {
  const rotation = new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ");
  return new THREE.Vector3(0, 0, 1).applyEuler(rotation).setY(0).normalize();
}

function main() {
  assert(
    DIRECTOR_RELATIVE_ACTOR_FIXTURE_POLICY_VERSION ===
      "director_relative_actor_fixture_policy_phase1b7a11a5_v1",
    "Unexpected Relative actor fixture policy version.",
  );

  const family = relativeFamily();
  assert(
    family.normalization_policy === "presentation_normalized",
    "Relative actor Baseline/Diversity must use presentation-normalized sizing; Full cast supplies the physical-context stress pass.",
  );

  for (const id of [
    "beside",
    "in_front_of",
    "behind",
    "facing",
    "facing_away",
  ] as const) {
    const roleIds = directorQualificationRelativeActorAssetRoles(
      family,
      capability(id),
    ).map((role) => role.role);
    assert(
      roleIds.join("|") === "primary_subject|secondary_subject",
      `${id} qualification must omit optional context; got ${roleIds.join("|")}.`,
    );
  }
  const betweenRoles = directorQualificationRelativeActorAssetRoles(
    family,
    capability("between"),
  ).map((role) => role.role);
  assert(
    betweenRoles.join("|") ===
      "primary_subject|secondary_subject|context_subject",
    `Between must retain both reference actors; got ${betweenRoles.join("|")}.`,
  );

  for (const id of ["facing", "facing_away"] as const) {
    const profile = directorQualificationCapabilityProfile(family, id);
    assert(
      profile.requires_directional_facing,
      `${id} must opt into directional-primary qualification.`,
    );
    assert(
      profile.suitable_primary_cast_slots[0] === "character" &&
        profile.suitable_primary_cast_slots.includes("small_asymmetric") &&
        profile.suitable_primary_cast_slots.includes("organic_elongated") &&
        profile.suitable_primary_cast_slots.includes("vehicle") &&
        !profile.suitable_primary_cast_slots.includes("furniture") &&
        !profile.suitable_primary_cast_slots.includes("compact_rigid"),
      `${id} directional cast gate is not restricted to readable-forward-axis slots.`,
    );
  }

  const besideA = semanticAxisSample("beside", "three_quarter_front");
  const besideB = semanticAxisSample("beside", "side_profile");
  for (const [label, sample] of [
    ["three-quarter", besideA],
    ["rotated", besideB],
  ] as const) {
    const required =
      groundRadius(sample.primary) + groundRadius(sample.secondary) + 0.45;
    const distance = Math.hypot(
      sample.primary.position[0] - sample.secondary.position[0],
      sample.primary.position[2] - sample.secondary.position[2],
    );
    assert(
      sample.right > required * 0.8 && Math.abs(sample.forward) <= 0.08,
      `Beside is not camera-relative lateral staging in ${label} view: right=${sample.right.toFixed(3)} forward=${sample.forward.toFixed(3)}.`,
    );
    assert(
      distance >= required,
      `Beside lost world clearance in ${label} view: ${distance.toFixed(3)}m < ${required.toFixed(3)}m.`,
    );
    assert(
      sample.overlap <= 0.06 && sample.gap >= 0.025,
      `Beside projected clearance is too weak in ${label} view: overlap=${sample.overlap.toFixed(3)} gap=${sample.gap.toFixed(3)}.`,
    );
  }

  const frontA = semanticAxisSample("in_front_of", "three_quarter_front");
  const frontB = semanticAxisSample("in_front_of", "side_profile");
  const behindA = semanticAxisSample("behind", "three_quarter_front");
  const behindB = semanticAxisSample("behind", "side_profile");

  for (const [label, sample] of [
    ["front three-quarter", frontA],
    ["front rotated", frontB],
  ] as const) {
    assert(
      sample.forward < -0.65,
      `In front of lost signed camera-relative depth in ${label}: ${sample.forward.toFixed(3)}m.`,
    );
    assert(
      Math.abs(sample.right) >= 0.2,
      `In front of needs a readable lateral peek in ${label}: ${sample.right.toFixed(3)}m.`,
    );
    assert(
      sample.overlap <= 0.64,
      `In front of projected overlap is too high in ${label}: ${sample.overlap.toFixed(3)}.`,
    );
  }
  for (const [label, sample] of [
    ["behind three-quarter", behindA],
    ["behind rotated", behindB],
  ] as const) {
    assert(
      sample.forward > 0.65,
      `Behind lost signed camera-relative depth in ${label}: ${sample.forward.toFixed(3)}m.`,
    );
    assert(
      Math.abs(sample.right) >= 0.2,
      `Behind needs a readable lateral peek in ${label}: ${sample.right.toFixed(3)}m.`,
    );
    assert(
      sample.overlap <= 0.64,
      `Behind projected overlap is too high in ${label}: ${sample.overlap.toFixed(3)}.`,
    );
  }
  assert(
    frontA.forward < -0.65 && behindA.forward > 0.65,
    "In front of / Behind sibling depth signs collapsed.",
  );

  const between = qualificationEvidence("between");
  const betweenShot = directorCapabilityDemoShot(between.promoted);
  assert(
    betweenShot.camera.focus_entity_ids.join("|") ===
      "primary_subject|secondary_subject|context_subject" &&
      betweenShot.composition.keep_visible_entity_ids.join("|") ===
        "primary_subject|secondary_subject|context_subject",
    "Between demo must frame primary plus both references.",
  );
  const betweenCue = betweenShot.blocking[0];
  const betweenReferenceIds = betweenCue?.parameters?.reference_entity_ids;
  assert(
    Array.isArray(betweenReferenceIds) &&
      betweenReferenceIds.join("|") === "secondary_subject|context_subject",
    "Between cue must declare both reference entity ids.",
  );
  const betweenBlocked = applyDirectorBlocking(between.moment, between.actors);
  const betweenPrimary = betweenBlocked.find((actor) => actor.id === "primary_subject");
  const betweenLeft = betweenBlocked.find((actor) => actor.id === "secondary_subject");
  const betweenRight = betweenBlocked.find((actor) => actor.id === "context_subject");
  assert(
    betweenPrimary && betweenLeft && betweenRight,
    "Between blocked actors are incomplete.",
  );
  const expectedMidpoint = new THREE.Vector3(...betweenLeft.position).lerp(
    new THREE.Vector3(...betweenRight.position),
    0.5,
  );
  assert(
    new THREE.Vector3(...betweenPrimary.position).distanceTo(expectedMidpoint) <=
      0.001,
    "Between primary is not at the midpoint of its two explicit references.",
  );
  const betweenCenters = [
    projectDirectorActorCenter(between.moment, betweenBlocked, "primary_subject", 0),
    projectDirectorActorCenter(between.moment, betweenBlocked, "secondary_subject", 0),
    projectDirectorActorCenter(between.moment, betweenBlocked, "context_subject", 0),
  ];
  assert(
    betweenCenters.every((center) => center?.visible_in_safe_frame),
    "Between must keep all three actors visible in the safe frame.",
  );
  const primaryX = betweenCenters[0]!.ndc[0];
  const referenceXs = [betweenCenters[1]!.ndc[0], betweenCenters[2]!.ndc[0]].sort(
    (left, right) => left - right,
  );
  assert(
    primaryX > referenceXs[0]! + 0.08 &&
      primaryX < referenceXs[1]! - 0.08,
    `Between primary must be visibly inside the projected reference interval: refs=${referenceXs.map((value) => value.toFixed(3)).join(",")} primary=${primaryX.toFixed(3)}.`,
  );

  const orientationDots: Record<"facing" | "facing_away", number> = {
    facing: 0,
    facing_away: 0,
  };
  for (const id of ["facing", "facing_away"] as const) {
    const evidence = qualificationEvidence(id);
    const shot = directorCapabilityDemoShot(evidence.promoted);
    assert(
      shot.composition.angle === "front_profile" &&
        shot.composition.framing === "two_shot" &&
        shot.camera.focus_entity_ids.length === 2,
      `${id} must use the compact front-profile two-shot qualification composition.`,
    );
    const blocked = applyDirectorBlocking(evidence.moment, evidence.actors);
    const primary = blocked.find((actor) => actor.id === "primary_subject");
    const secondary = blocked.find((actor) => actor.id === "secondary_subject");
    assert(primary && secondary, `${id} blocked pair is missing.`);
    const targetDirection = new THREE.Vector3(...secondary.position)
      .sub(new THREE.Vector3(...primary.position))
      .setY(0)
      .normalize();
    const dot = primaryForward(primary).dot(targetDirection);
    orientationDots[id] = dot;
    if (id === "facing") {
      assert(dot >= 0.995, `Facing forward vector misses target: dot=${dot.toFixed(4)}.`);
    } else {
      assert(dot <= -0.995, `Facing away vector is not opposite target: dot=${dot.toFixed(4)}.`);
    }
    const envelope = projectDirectorActorEnvelope(
      evidence.moment,
      blocked,
      "primary_subject",
      0,
    );
    assert(envelope, `${id} primary projected envelope is missing.`);
    assert(
      envelope.fully_inside_safe_frame && envelope.height_ndc >= 0.14,
      `${id} primary is too small or leaves the safe frame: height=${envelope.height_ndc.toFixed(3)}.`,
    );
  }
  assert(
    orientationDots.facing > 0.99 && orientationDots.facing_away < -0.99,
    "Facing / Facing away sibling orientation signs collapsed.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "DIRECTOR_RELATIVE_ACTOR_RELATIONS",
    "applyDirectorRelativeActorPlacement",
    "directorRelativeProjectedPairReadability",
    "reference_entity_ids",
    "if (isDirectorRelativeActorRelation(cue.relation)) {",
  ]) {
    assert(runtime.includes(marker), `Relative actor runtime marker missing: ${marker}`);
  }
  const blockingStart = runtime.indexOf("export function applyDirectorBlocking");
  const scalarSwitchStart = runtime.indexOf("switch (cue.relation)", blockingStart);
  const scalarSwitchEnd = runtime.indexOf("applyBlockingScreenRegion", scalarSwitchStart);
  assert(
    blockingStart >= 0 && scalarSwitchStart > blockingStart && scalarSwitchEnd > scalarSwitchStart,
    "Could not isolate the post-relative scalar blocking switch.",
  );
  const scalarSwitch = runtime.slice(scalarSwitchStart, scalarSwitchEnd);
  for (const relation of [
    "beside",
    "in_front_of",
    "behind",
    "between",
    "facing",
    "facing_away",
  ] as const) {
    assert(
      !scalarSwitch.includes(`case "${relation}"`),
      `${relation} must not reappear in the scalar switch after the Relative actor type guard.`,
    );
  }
  for (const retired of [
    "new THREE.Vector3(gap, 0, 0)",
    "new THREE.Vector3(0, 0, gap)",
    "new THREE.Vector3(0.35 * gap, 0, -gap)",
  ]) {
    assert(
      !runtime.includes(retired),
      `Retired world-axis Relative actor approximation is still present: ${retired}`,
    );
  }

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes('reference_roles: ["secondary_subject", "context_subject"]') &&
      registry.includes('id === "between" ||'),
    "Between must be a canonical three-participant capability contract.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    room.includes("directorQualificationAdjustRelativeActorFixturePositions") &&
      room.includes("required_visible_roles: groupFormation") &&
      room.includes("relativeActorPlacement") &&
      room.includes("plannedRoleIds") &&
      room.includes("target_extents_m"),
    "Qualification Room must apply the Relative actor fixture and promote its exact role set.",
  );

  const normalization = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-normalization.ts",
  );
  assert(
    normalization.includes('input.group === "Relative actor placement"'),
    "Relative actor fair-display normalization marker is missing.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.5 — Relative actor placement foundation repair"),
    "Director README is missing the A.11A.5 Relative actor repair note.",
  );

  console.log(
    "Director Relative actor placement Phase 1B.7A.11A.5 verification passed.",
  );
  console.log(
    `Beside gaps ${besideA.gap.toFixed(3)}/${besideB.gap.toFixed(3)} NDC; front/behind signed depth ${frontA.forward.toFixed(2)}/${behindA.forward.toFixed(2)}m; Between projected primary ${primaryX.toFixed(3)} between ${referenceXs.map((value) => value.toFixed(3)).join("/")}; facing dots ${orientationDots.facing.toFixed(3)}/${orientationDots.facing_away.toFixed(3)}.`,
  );
}

main();
