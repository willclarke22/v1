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
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  DIRECTOR_QUALIFICATION_SCENES,
  type DirectorQualificationScene,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  applyDirectorBlocking,
  projectDirectorActorEnvelope,
  sampleDirectorCameraPose,
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

function sceneB(): DirectorQualificationScene {
  const found = DIRECTOR_QUALIFICATION_SCENES.find(
    (scene) => scene.id === "scene_b_spatial_relationship",
  );
  assert(found, "Scene B qualification fixture is missing.");
  return found;
}

const BASE_ACTORS: DirectorRuntimeActor[] = [
  {
    id: "primary_subject",
    position: [-1.65, 0, 0.55],
    rotation: [0, 0, 0],
    size: [1.05, 1.45, 0.82],
  },
  {
    id: "secondary_subject",
    position: [1.7, 0, -0.35],
    rotation: [0, 0, 0],
    size: [1.35, 1.05, 1.08],
  },
  {
    id: "context_subject",
    position: [0.2, 0, -2.55],
    rotation: [0, 0, 0],
    size: [0.72, 0.88, 0.58],
  },
];

type FormationId =
  | "surround"
  | "form_line"
  | "form_circle"
  | "cluster"
  | "symmetrical_pair";

function roleIdsFor(id: FormationId) {
  return id === "symmetrical_pair"
    ? ["primary_subject", "secondary_subject"]
    : ["primary_subject", "secondary_subject", "context_subject"];
}

function actorsFor(id: FormationId) {
  const required = new Set(roleIdsFor(id));
  return BASE_ACTORS.filter((actor) => required.has(actor.id)).map((actor) => ({
    ...actor,
    position: [...actor.position] as [number, number, number],
    rotation: [...(actor.rotation ?? [0, 0, 0])] as [number, number, number],
    size: [...actor.size] as [number, number, number],
  }));
}

function groundRadius(actor: DirectorRuntimeActor) {
  return Math.max(
    0.16,
    Math.hypot(Math.abs(actor.size[0]), Math.abs(actor.size[2])) * 0.5,
  );
}

function basisFor(selected: DirectorCapability, actors: DirectorRuntimeActor[]) {
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
  if (forward.lengthSq() < 0.000001) {
    forward.set(-right.z, 0, right.x);
  }
  forward.normalize();

  return { right, forward };
}

function formation(id: FormationId) {
  const selected = capability(id);
  const inputActors = actorsFor(id);
  const basis = basisFor(selected, inputActors);
  const inputCenter = inputActors.reduce(
    (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
    new THREE.Vector3(),
  ).multiplyScalar(1 / inputActors.length);
  inputCenter.y = 0;
  const moment = directorCapabilityDemoMoment(selected);
  const blocked = applyDirectorBlocking(moment, inputActors);
  const center = blocked.reduce(
    (sum, actor) => sum.add(new THREE.Vector3(...actor.position)),
    new THREE.Vector3(),
  ).multiplyScalar(1 / blocked.length);
  center.y = 0;

  const coordinates = new Map(
    blocked.map((actor) => {
      const delta = new THREE.Vector3(...actor.position).sub(center);
      return [
        actor.id,
        {
          right: delta.dot(basis.right),
          forward: delta.dot(basis.forward),
          radius: Math.hypot(
            delta.dot(basis.right),
            delta.dot(basis.forward),
          ),
        },
      ] as const;
    }),
  );

  for (const actorId of roleIdsFor(id)) {
    const envelope = projectDirectorActorEnvelope(
      moment,
      blocked,
      actorId,
      0,
    );
    assert(envelope, `${id} is missing projected envelope evidence for ${actorId}.`);
    assert(
      envelope.fully_inside_safe_frame,
      `${id}/${actorId} leaves the projected safe frame.`,
    );
    assert(
      envelope.height_ndc >= 0.08,
      `${id}/${actorId} became too small to judge (NDC height ${envelope.height_ndc.toFixed(3)}).`,
    );
  }

  return { selected, moment, blocked, coordinates, basis, inputCenter };
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

function assertClearance(
  label: string,
  actors: DirectorRuntimeActor[],
  margin: number,
) {
  for (let leftIndex = 0; leftIndex < actors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < actors.length; rightIndex += 1) {
      const left = actors[leftIndex]!;
      const right = actors[rightIndex]!;
      const required = groundRadius(left) + groundRadius(right) + margin;
      const actual = pairwiseGroundDistance(left, right);
      assert(
        actual + 0.001 >= required,
        `${label} loses pairwise clearance for ${left.id}/${right.id}: ${actual.toFixed(3)}m < ${required.toFixed(3)}m.`,
      );
    }
  }
}

function main() {
  assert(
    [
      "director_group_formation_fixture_policy_phase1b7a11a3_v1",
      "director_group_formation_fixture_policy_phase1b7a11a4_v1",
    ].includes(DIRECTOR_GROUP_FORMATION_FIXTURE_POLICY_VERSION),
    "Unexpected Group formation fixture policy version.",
  );

  const family = groupFamily();
  assert(
    family.normalization_policy === "presentation_normalized",
    "Group formations Baseline/Diversity must use presentation-normalized sizing.",
  );

  const scene = sceneB();
  assert(
    scene.id === "scene_b_spatial_relationship",
    "Group formations should retain the controlled Scene-B spatial stage.",
  );

  for (const id of ["form_line", "cluster"] as const) {
    const roles = directorQualificationGroupFormationAssetRoles(
      family,
      capability(id),
    ).map((role) => role.role);
    assert(
      roles.join("|") ===
        "primary_subject|secondary_subject|context_subject",
      `${id} qualification must retain its three-actor foundation; got ${roles.join("|")}.`,
    );
  }

  for (const id of ["surround", "form_circle"] as const) {
    const roles = directorQualificationGroupFormationAssetRoles(
      family,
      capability(id),
    ).map((role) => role.role);
    assert(
      roles.length >= 3 &&
        roles.slice(0, 3).join("|") ===
          "primary_subject|secondary_subject|context_subject",
      `${id} qualification must retain the original three-role foundation even when a successor adds perceptual support actors; got ${roles.join("|")}.`,
    );
  }

  const pairRoles = directorQualificationGroupFormationAssetRoles(
    family,
    capability("symmetrical_pair"),
  ).map((role) => role.role);
  assert(
    pairRoles.join("|") === "primary_subject|secondary_subject",
    `Symmetrical Pair qualification must contain exactly two actors; got ${pairRoles.join("|")}.`,
  );

  for (const id of [
    "surround",
    "form_line",
    "form_circle",
    "cluster",
    "symmetrical_pair",
  ] as const) {
    const shot = directorCapabilityDemoShot(capability(id));
    const expectedRoles = roleIdsFor(id);
    assert(
      shot.blocking.length === 1 && shot.blocking[0]?.relation === id,
      `${id} must remain one semantic formation cue rather than N repeated per-actor cues.`,
    );
    assert(
      shot.composition.framing === "group_shot",
      `${id} must use group framing.`,
    );
    assert(
      shot.camera.focus_entity_ids.join("|") === expectedRoles.join("|"),
      `${id} camera focus must cover the complete formation.`,
    );
    assert(
      shot.composition.keep_visible_entity_ids.join("|") ===
        expectedRoles.join("|"),
      `${id} keep-visible contract must cover the complete formation.`,
    );
    const participants = shot.blocking[0]?.parameters?.participant_entity_ids;
    assert(
      Array.isArray(participants) &&
        participants.join("|") === expectedRoles.join("|"),
      `${id} semantic cue is missing its participant set.`,
    );
  }

  const surround = formation("surround");
  const surroundPrimaryActor = surround.blocked.find(
    (actor) => actor.id === "primary_subject",
  );
  const surroundSecondaryActor = surround.blocked.find(
    (actor) => actor.id === "secondary_subject",
  );
  const surroundContextActor = surround.blocked.find(
    (actor) => actor.id === "context_subject",
  );
  assert(
    surroundPrimaryActor && surroundSecondaryActor && surroundContextActor,
    "Surround actor evidence is incomplete.",
  );
  const surroundPrimaryOffset = new THREE.Vector3(
    surroundPrimaryActor.position[0] - surround.inputCenter.x,
    0,
    surroundPrimaryActor.position[2] - surround.inputCenter.z,
  ).length();
  const surroundSecondaryRadius = pairwiseGroundDistance(
    surroundPrimaryActor,
    surroundSecondaryActor,
  );
  const surroundContextRadius = pairwiseGroundDistance(
    surroundPrimaryActor,
    surroundContextActor,
  );
  const supportA = new THREE.Vector3(
    surroundSecondaryActor.position[0] - surroundPrimaryActor.position[0],
    0,
    surroundSecondaryActor.position[2] - surroundPrimaryActor.position[2],
  );
  const supportB = new THREE.Vector3(
    surroundContextActor.position[0] - surroundPrimaryActor.position[0],
    0,
    surroundContextActor.position[2] - surroundPrimaryActor.position[2],
  );
  const supportAngle = supportA.angleTo(supportB);
  assert(
    surroundPrimaryOffset <= 0.05,
    `Surround must move the privileged primary to the neutral formation centre; offset ${surroundPrimaryOffset.toFixed(3)}m.`,
  );
  assert(
    surroundSecondaryRadius >= 1.5 &&
      surroundContextRadius >= 1.5,
    "Surround supporting actors must occupy a visible ring around the centre actor.",
  );
  assert(
    supportAngle >= 1.8 && supportAngle <= 2.4,
    `Surround's two supporters should wrap around the centre rather than collapse into a line; angle ${supportAngle.toFixed(3)}rad.`,
  );
  assertClearance("Surround", surround.blocked, 0.4);

  const line = formation("form_line");
  const lineCoords = [...line.coordinates.values()];
  const lineForwardSpread =
    Math.max(...lineCoords.map((item) => item.forward)) -
    Math.min(...lineCoords.map((item) => item.forward));
  const lineRightSpread =
    Math.max(...lineCoords.map((item) => item.right)) -
    Math.min(...lineCoords.map((item) => item.right));
  assert(
    lineForwardSpread <= 0.06,
    `Form Line must be collinear in camera-relative depth; spread ${lineForwardSpread.toFixed(3)}m.`,
  );
  assert(
    lineRightSpread >= 2.5,
    `Form Line must visibly span screen width; spread ${lineRightSpread.toFixed(3)}m.`,
  );
  assertClearance("Form Line", line.blocked, 0.45);

  const circle = formation("form_circle");
  const circleCoords = [...circle.coordinates.values()];
  const circleRadii = circleCoords.map((item) => item.radius);
  const circleRadiusMean =
    circleRadii.reduce((sum, value) => sum + value, 0) /
    circleRadii.length;
  const circleRadiusSpread =
    Math.max(...circleRadii) - Math.min(...circleRadii);
  assert(
    Math.min(...circleRadii) >= 1.5,
    "Form Circle must leave the shared centre empty.",
  );
  assert(
    circleRadiusSpread <= Math.max(0.08, circleRadiusMean * 0.04),
    `Form Circle participants must share one circumference; radial spread ${circleRadiusSpread.toFixed(3)}m.`,
  );
  const circleAngles = circleCoords
    .map((item) => Math.atan2(item.forward, item.right))
    .sort((left, right) => left - right);
  const circleGaps = circleAngles.map((angle, index) => {
    const next =
      index === circleAngles.length - 1
        ? circleAngles[0]! + Math.PI * 2
        : circleAngles[index + 1]!;
    return next - angle;
  });
  assert(
    Math.min(...circleGaps) >= 1.75,
    `Form Circle angular separation collapsed; minimum gap ${Math.min(...circleGaps).toFixed(3)}rad.`,
  );
  assertClearance("Form Circle", circle.blocked, 0.4);

  const cluster = formation("cluster");
  const clusterCoords = [...cluster.coordinates.values()];
  const clusterMaxRadius = Math.max(
    ...clusterCoords.map((item) => item.radius),
  );
  assert(
    clusterMaxRadius < circleRadiusMean * 0.82,
    `Cluster must remain materially tighter than Form Circle (${clusterMaxRadius.toFixed(3)}m vs circle ${circleRadiusMean.toFixed(3)}m).`,
  );
  assert(
    clusterMaxRadius < Math.max(
      surroundSecondaryRadius,
      surroundContextRadius,
    ) * 0.9,
    "Cluster must remain materially tighter than Surround.",
  );
  assertClearance("Cluster", cluster.blocked, 0.25);

  const pair = formation("symmetrical_pair");
  const pairPrimary = pair.coordinates.get("primary_subject");
  const pairSecondary = pair.coordinates.get("secondary_subject");
  assert(pairPrimary && pairSecondary, "Symmetrical Pair evidence is incomplete.");
  assert(
    pairPrimary.right < -0.5 && pairSecondary.right > 0.5,
    `Symmetrical Pair must occupy opposite camera-relative sides; ${pairPrimary.right.toFixed(3)} / ${pairSecondary.right.toFixed(3)}m.`,
  );
  assert(
    Math.abs(pairPrimary.right + pairSecondary.right) <= 0.02,
    "Symmetrical Pair must mirror around the composition centre.",
  );
  assert(
    Math.abs(pairPrimary.forward - pairSecondary.forward) <= 0.02,
    "Symmetrical Pair must preserve equal camera-relative depth.",
  );
  assertClearance("Symmetrical Pair", pair.blocked, 0.55);

  const signatures = [
    surround.blocked.map((actor) => actor.position.map((value) => value.toFixed(3)).join(",")).join("|"),
    line.blocked.map((actor) => actor.position.map((value) => value.toFixed(3)).join(",")).join("|"),
    circle.blocked.map((actor) => actor.position.map((value) => value.toFixed(3)).join(",")).join("|"),
    cluster.blocked.map((actor) => actor.position.map((value) => value.toFixed(3)).join(",")).join("|"),
  ];
  assert(
    new Set(signatures).size === signatures.length,
    "Group formation siblings collapsed to identical solved geometry.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "DIRECTOR_GROUP_FORMATION_RELATIONS",
    "directorGroupFormationParticipantIds",
    "directorFormationGroundRadius",
    "applyDirectorGroupFormation",
    "if (isDirectorGroupFormationRelation(cue.relation)) {",
  ]) {
    assert(runtime.includes(marker), `Group formation runtime marker missing: ${marker}`);
  }
  const blockingStart = runtime.indexOf("export function applyDirectorBlocking");
  const scalarSwitchStart = runtime.indexOf("switch (cue.relation)", blockingStart);
  const scalarSwitchEnd = runtime.indexOf("applyBlockingScreenRegion", scalarSwitchStart);
  assert(
    blockingStart >= 0 && scalarSwitchStart > blockingStart && scalarSwitchEnd > scalarSwitchStart,
    "Could not isolate the post-formation scalar blocking switch.",
  );
  const scalarSwitch = runtime.slice(scalarSwitchStart, scalarSwitchEnd);
  for (const relation of [
    "surround",
    "form_line",
    "form_circle",
    "cluster",
    "symmetrical_pair",
  ] as const) {
    assert(
      !scalarSwitch.includes(`case "${relation}"`),
      `${relation} must not reappear in the scalar switch after the group-formation type guard; TypeScript narrows those relations away before this switch.`,
    );
  }

  for (const retired of [
    "position.set(Math.cos(angle) * 2.2",
    "position.x = (index - (output.length - 1) / 2) * 1.7",
    "position.set(Math.cos(angle) * 2.3",
    "case \"cluster\": position.multiplyScalar(0.68)",
    "? -1.6 : 1.6",
  ]) {
    assert(
      !runtime.includes(retired),
      `Retired single-actor group-formation approximation is still present: ${retired}`,
    );
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    room.includes("directorQualificationAssetRoles") &&
      room.includes('input.pass_kind === "physical_stress"') &&
      room.includes('? "physical_context"'),
    "Qualification Room must use formation-aware roles while retaining the Full-cast physical-stress override.",
  );

  const readme = source(
    "sandbox/probe-lab/motion-camera-library/README.md",
  );
  assert(
    readme.includes("Phase 1B.7A.11A.3 — Group formation foundation repair"),
    "Director README is missing the A.11A.3 Group formation repair note.",
  );

  console.log(
    "Director Group formations Phase 1B.7A.11A.3 verification passed.",
  );
  console.log(
    `Surround centre occupied with support radius ${Math.max(surroundSecondaryRadius, surroundContextRadius).toFixed(2)}m and wrap angle ${supportAngle.toFixed(2)}rad; line depth spread ${lineForwardSpread.toFixed(3)}m; circle radius ${circleRadiusMean.toFixed(2)}m; cluster max radius ${clusterMaxRadius.toFixed(2)}m; symmetrical pair mirrored at ${pairPrimary.right.toFixed(2)} / ${pairSecondary.right.toFixed(2)}m.`,
  );
}

main();
