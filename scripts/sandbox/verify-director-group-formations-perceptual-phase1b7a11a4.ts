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
  type DirectorQualificationFamily,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_GROUP_FORMATION_FIXTURE_POLICY_VERSION,
  directorQualificationGroupFormationAssetRoles,
  directorQualificationGroupFormationParticipantRoleIds,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  applyDirectorBlocking,
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

function groupFamily(): DirectorQualificationFamily {
  const found = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) =>
      family.category === "blocking_placement" &&
      family.group === "Group formations",
  );
  assert(found, "Group formations qualification family is missing.");
  return found;
}

function qualificationCapability(
  id: string,
  roleIds: string[],
): DirectorCapability {
  const base = capability(id);
  return {
    ...base,
    demo: {
      ...base.demo,
      required_visible_roles: [...roleIds],
      blocking: roleIds.map((role, index) => ({
        role,
        position:
          index === 0
            ? [-1.65, 0, 0.55]
            : index === 1
              ? [1.7, 0, -0.35]
              : index === 2
                ? [0.2, 0, -2.55]
                : index === 3
                  ? [2.25, 0, -1.9]
                  : [-2.2, 0, -1.75],
        target_extent_m: index === 0 ? 1.2 : index === 1 ? 1.15 : 1.0,
      })),
    },
  };
}

function actorsForRoles(roleIds: string[]): DirectorRuntimeActor[] {
  const templates: Record<string, DirectorRuntimeActor> = {
    primary_subject: {
      id: "primary_subject",
      position: [-1.65, 0, 0.55],
      rotation: [0, 0, 0],
      size: [1.08, 1.2, 0.92],
    },
    secondary_subject: {
      id: "secondary_subject",
      position: [1.7, 0, -0.35],
      rotation: [0, 0, 0],
      size: [1.22, 1.0, 1.02],
    },
    context_subject: {
      id: "context_subject",
      position: [0.2, 0, -2.55],
      rotation: [0, 0, 0],
      size: [0.72, 1.02, 0.54],
    },
    formation_support_2: {
      id: "formation_support_2",
      position: [2.25, 0, -1.9],
      rotation: [0, 0, 0],
      size: [0.78, 0.88, 0.62],
    },
    formation_support_3: {
      id: "formation_support_3",
      position: [-2.2, 0, -1.75],
      rotation: [0, 0, 0],
      size: [0.68, 0.96, 0.58],
    },
  };

  return roleIds.map((role) => {
    const actor = templates[role];
    assert(actor, `Missing test actor template for ${role}.`);
    return {
      ...actor,
      position: [...actor.position] as [number, number, number],
      rotation: [...(actor.rotation ?? [0, 0, 0])] as [number, number, number],
      size: [...actor.size] as [number, number, number],
    };
  });
}

function groundRadius(actor: DirectorRuntimeActor) {
  return Math.max(
    0.16,
    Math.hypot(Math.abs(actor.size[0]), Math.abs(actor.size[2])) * 0.5,
  );
}

function pairwiseGroundDistance(
  left: DirectorRuntimeActor,
  right: DirectorRuntimeActor,
) {
  return Math.hypot(
    left.position[0] - right.position[0],
    left.position[2] - right.position[2],
  );
}

function envelopeOverlapRatio(
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

function projectedEnvelopes(
  selected: DirectorCapability,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(selected);
  const blocked = applyDirectorBlocking(moment, actors);
  const envelopes = blocked.map((actor) => {
    const envelope = projectDirectorActorEnvelope(moment, blocked, actor.id, 0);
    assert(envelope, `Missing projected envelope for ${selected.id}/${actor.id}.`);
    assert(
      envelope.fully_inside_safe_frame,
      `${selected.id}/${actor.id} leaves the projected safe frame.`,
    );
    assert(
      envelope.height_ndc >= 0.055,
      `${selected.id}/${actor.id} became too small to judge (${envelope.height_ndc.toFixed(3)} NDC height).`,
    );
    return envelope;
  });
  return { moment, blocked, envelopes };
}

function groundBasis(
  selected: DirectorCapability,
  actors: DirectorRuntimeActor[],
) {
  const moment = directorCapabilityDemoMoment(selected);
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
  return { right, forward };
}

function main() {
  assert(
    DIRECTOR_GROUP_FORMATION_FIXTURE_POLICY_VERSION ===
      "director_group_formation_fixture_policy_phase1b7a11a4_v1",
    "Unexpected A.11A.4 Group formation fixture policy version.",
  );

  const family = groupFamily();
  const expectedQualificationRoles: Record<string, string[]> = {
    surround: [
      "primary_subject",
      "secondary_subject",
      "context_subject",
      "formation_support_2",
    ],
    form_line: ["primary_subject", "secondary_subject", "context_subject"],
    form_circle: [
      "primary_subject",
      "secondary_subject",
      "context_subject",
      "formation_support_2",
      "formation_support_3",
    ],
    cluster: ["primary_subject", "secondary_subject", "context_subject"],
    symmetrical_pair: ["primary_subject", "secondary_subject"],
  };

  for (const [id, expectedRoles] of Object.entries(expectedQualificationRoles)) {
    const selected = capability(id);
    const roleIds = directorQualificationGroupFormationParticipantRoleIds(selected);
    const roleAssets = directorQualificationGroupFormationAssetRoles(
      family,
      selected,
    ).map((role) => role.role);
    assert(
      roleIds.join("|") === expectedRoles.join("|"),
      `${id} participant policy mismatch: ${roleIds.join("|")}.`,
    );
    assert(
      roleAssets.join("|") === expectedRoles.join("|"),
      `${id} qualification asset-role policy mismatch: ${roleAssets.join("|")}.`,
    );
  }

  const surroundRoles = expectedQualificationRoles.surround!;
  const surroundCapability = qualificationCapability("surround", surroundRoles);
  const surroundShot = directorCapabilityDemoShot(surroundCapability);
  assert(
    surroundShot.camera.focus_entity_ids.join("|") === surroundRoles.join("|"),
    "Surround qualification camera must focus the centre actor plus all three supports.",
  );
  const surroundEvidence = projectedEnvelopes(
    surroundCapability,
    actorsForRoles(surroundRoles),
  );
  const surroundCenter = surroundEvidence.blocked.find(
    (actor) => actor.id === "primary_subject",
  );
  assert(surroundCenter, "Surround primary actor missing after blocking.");
  const supporters = surroundEvidence.blocked.filter(
    (actor) => actor.id !== "primary_subject",
  );
  assert(supporters.length === 3, "Surround must prove three supporting actors around the centre.");
  const supportAngles = supporters
    .map((actor) =>
      Math.atan2(
        actor.position[2] - surroundCenter.position[2],
        actor.position[0] - surroundCenter.position[0],
      ),
    )
    .sort((left, right) => left - right);
  const supportGaps = supportAngles.map((angle, index) => {
    const next =
      index === supportAngles.length - 1
        ? supportAngles[0]! + Math.PI * 2
        : supportAngles[index + 1]!;
    return next - angle;
  });
  assert(
    Math.min(...supportGaps) >= 1.8 && Math.max(...supportGaps) <= 2.35,
    `Surround supports must wrap the centre across three distinct sectors; gaps ${supportGaps.map((gap) => gap.toFixed(3)).join(", ")}.`,
  );

  const circleRoles = expectedQualificationRoles.form_circle!;
  const circleCapability = qualificationCapability("form_circle", circleRoles);
  const circleShot = directorCapabilityDemoShot(circleCapability);
  assert(
    circleShot.camera.focus_entity_ids.join("|") === circleRoles.join("|"),
    "Form Circle qualification camera must focus all five ring actors.",
  );
  const circleEvidence = projectedEnvelopes(
    circleCapability,
    actorsForRoles(circleRoles),
  );
  const circleCenter = circleEvidence.blocked.reduce(
    (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
    new THREE.Vector3(),
  ).multiplyScalar(1 / circleEvidence.blocked.length);
  circleCenter.y = 0;
  const circleRadii = circleEvidence.blocked.map((actor) =>
    new THREE.Vector3(...actor.position).sub(circleCenter).setY(0).length(),
  );
  const circleMean =
    circleRadii.reduce((sum, value) => sum + value, 0) / circleRadii.length;
  assert(Math.min(...circleRadii) >= 1.45, "Form Circle must retain an empty visual centre.");
  assert(
    Math.max(...circleRadii) - Math.min(...circleRadii) <= circleMean * 0.05,
    "Form Circle five-actor proof must share one circumference.",
  );
  const circleBasis = groundBasis(circleCapability, circleEvidence.blocked);
  const circleAngles = circleEvidence.blocked
    .map((actor) => {
      const delta = new THREE.Vector3(...actor.position).sub(circleCenter);
      return Math.atan2(delta.dot(circleBasis.forward), delta.dot(circleBasis.right));
    })
    .sort((left, right) => left - right);
  const circleGaps = circleAngles.map((angle, index) => {
    const next =
      index === circleAngles.length - 1
        ? circleAngles[0]! + Math.PI * 2
        : circleAngles[index + 1]!;
    return next - angle;
  });
  assert(
    Math.min(...circleGaps) >= 1.05 && Math.max(...circleGaps) <= 1.45,
    `Form Circle must read as an evenly distributed five-point ring; gaps ${circleGaps.map((gap) => gap.toFixed(3)).join(", ")}.`,
  );

  const clusterCapability = qualificationCapability(
    "cluster",
    expectedQualificationRoles.cluster!,
  );
  const clusterActors: DirectorRuntimeActor[] = [
    {
      id: "primary_subject",
      position: [-1.65, 0, 0.55],
      rotation: [0, 0, 0],
      size: [1.42, 1.38, 1.18],
    },
    {
      id: "secondary_subject",
      position: [1.7, 0, -0.35],
      rotation: [0, 0, 0],
      size: [1.72, 0.95, 1.24],
    },
    {
      id: "context_subject",
      position: [0.2, 0, -2.55],
      rotation: [0, 0, 0],
      size: [0.54, 1.68, 0.36],
    },
  ];
  const clusterEvidence = projectedEnvelopes(clusterCapability, clusterActors);
  let maximumProjectedOverlap = 0;
  for (let leftIndex = 0; leftIndex < clusterEvidence.blocked.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < clusterEvidence.blocked.length;
      rightIndex += 1
    ) {
      const leftActor = clusterEvidence.blocked[leftIndex]!;
      const rightActor = clusterEvidence.blocked[rightIndex]!;
      const required = groundRadius(leftActor) + groundRadius(rightActor) + 0.25;
      const actual = pairwiseGroundDistance(leftActor, rightActor);
      assert(
        actual + 0.001 >= required,
        `Cluster lost physical clearance for ${leftActor.id}/${rightActor.id}: ${actual.toFixed(3)}m < ${required.toFixed(3)}m.`,
      );
      maximumProjectedOverlap = Math.max(
        maximumProjectedOverlap,
        envelopeOverlapRatio(
          clusterEvidence.envelopes[leftIndex]!,
          clusterEvidence.envelopes[rightIndex]!,
        ),
      );
    }
  }
  assert(
    maximumProjectedOverlap <= 0.45,
    `Cluster projected-envelope overlap is still too high (${maximumProjectedOverlap.toFixed(3)} of the smaller actor envelope).`,
  );

  // Frozen sibling guards: this refinement must not reopen the Line or Pair
  // geometry that already passed perceptual review after A.11A.3.
  for (const id of ["form_line", "symmetrical_pair"] as const) {
    const selected = qualificationCapability(id, expectedQualificationRoles[id]!);
    const actors = actorsForRoles(expectedQualificationRoles[id]!);
    const basis = groundBasis(selected, actors);
    const blocked = applyDirectorBlocking(directorCapabilityDemoMoment(selected), actors);
    const centre = blocked.reduce(
      (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
      new THREE.Vector3(),
    ).multiplyScalar(1 / blocked.length);
    const coordinates = blocked.map((actor) => {
      const delta = new THREE.Vector3(...actor.position).sub(centre);
      return {
        right: delta.dot(basis.right),
        forward: delta.dot(basis.forward),
      };
    });
    if (id === "form_line") {
      const forwardSpread =
        Math.max(...coordinates.map((item) => item.forward)) -
        Math.min(...coordinates.map((item) => item.forward));
      assert(
        forwardSpread <= 0.06,
        `Frozen Form Line camera-relative depth spread regressed to ${forwardSpread.toFixed(3)}m.`,
      );
    } else {
      assert(
        coordinates.length === 2 &&
          coordinates[0]!.right < -0.5 &&
          coordinates[1]!.right > 0.5 &&
          Math.abs(coordinates[0]!.right + coordinates[1]!.right) <= 0.02 &&
          Math.abs(coordinates[0]!.forward - coordinates[1]!.forward) <= 0.02,
        "Frozen Symmetrical Pair mirror/depth relationship regressed.",
      );
    }
  }

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "directorFormationScreenLateralOverlapRatio",
    "directorClusterPreferredAngle",
    "maximumLateralOverlapRatio = 0.24",
    "directorFormationMaximumProjectedEnvelopeOverlap",
    "maximumProjectedOverlapRatio = 0.42",
  ]) {
    assert(runtime.includes(marker), `A.11A.4 Cluster readability marker missing: ${marker}`);
  }

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes("const participants = [...capability.demo.required_visible_roles];"),
    "Group formation demo shot must derive participants from the promoted visibility contract.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    room.includes("required_visible_roles: groupFormation") &&
      room.includes("plannedRoleIds"),
    "Qualification Room must promote planned formation support roles into the demo visibility contract.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.4 — Group formation perceptual refinement"),
    "Director README is missing the A.11A.4 Group formation perceptual refinement note.",
  );

  console.log(
    "Director Group formations Phase 1B.7A.11A.4 perceptual verification passed.",
  );
  console.log(
    `Surround uses ${supporters.length} support sectors; Form Circle uses ${circleEvidence.blocked.length} ring actors; Cluster maximum projected overlap ${maximumProjectedOverlap.toFixed(3)}; frozen Line and Symmetrical Pair invariants remain intact.`,
  );
}

main();
