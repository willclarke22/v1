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
  type DirectorQualificationFamily,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_RELATIVE_ACTOR_BETWEEN_FRAMING_POLICY_VERSION,
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

type BetweenScenario = {
  label: string;
  extents: [number, number, number];
  sizes: [[number, number, number], [number, number, number], [number, number, number]];
};

const SCENARIOS: BetweenScenario[] = [
  {
    label: "cross_asset_baseline_like",
    extents: [1.7, 1.425, 0.861],
    sizes: [
      [0.94, 1.7, 0.46],
      [0.86, 1.425, 0.92],
      [0.36, 0.861, 0.28],
    ],
  },
  {
    label: "cross_asset_diversity_like",
    extents: [1.5, 1.425, 0.861],
    sizes: [
      [0.96, 1.5, 1.07],
      [1.06, 0.352, 1.425],
      [0.77, 0.862, 0.77],
    ],
  },
];

function roleBasePosition(
  scene: DirectorQualificationScene,
  role: string,
): [number, number, number] {
  if (role === "primary_subject") return [...scene.blocking.primary];
  if (role === "secondary_subject") return [...scene.blocking.secondary];
  return [...scene.blocking.context];
}

function groundHalfWidth(actor: DirectorRuntimeActor) {
  return Math.abs(actor.size[0]) * 0.5;
}

function scenarioEvidence(scenario: BetweenScenario) {
  const family = relativeFamily();
  const scene = sceneB();
  const selected = capability("between");
  const roles = directorQualificationRelativeActorAssetRoles(
    family,
    selected,
  );
  assert(
    roles.map((role) => role.role).join("|") ===
      "primary_subject|secondary_subject|context_subject",
    "Between qualification must remain exactly three-participant.",
  );

  const positions = directorQualificationAdjustRelativeActorFixturePositions({
    family,
    capability: selected,
    scene,
    positions: roles.map((role) => roleBasePosition(scene, role.role)),
    target_extents_m: [...scenario.extents],
  });

  const referenceHalfSpan =
    Math.abs(positions[2]![0] - positions[1]![0]) * 0.5;
  assert(
    referenceHalfSpan >= 1.18 && referenceHalfSpan <= 1.55,
    `${scenario.label}: compact Between reference half-span is outside the intended readable range: ${referenceHalfSpan.toFixed(3)}m.`,
  );
  assert(
    positions[0]![0] < Math.min(positions[1]![0], positions[2]![0]),
    `${scenario.label}: primary must begin outside the reference interval so Between still proves a placement operation.`,
  );

  const promoted: DirectorCapability = {
    ...selected,
    demo: {
      ...selected.demo,
      required_visible_roles: roles.map((role) => role.role),
      blocking: roles.map((role, index) => ({
        role: role.role,
        position: positions[index] ?? roleBasePosition(scene, role.role),
        rotation: [0, 0, 0],
        target_extent_m: scenario.extents[index] ?? 1,
      })),
    },
  };

  const actors: DirectorRuntimeActor[] = roles.map((role, index) => ({
    id: role.role,
    position: positions[index] ?? roleBasePosition(scene, role.role),
    rotation: [0, 0, 0],
    size: scenario.sizes[index] ?? [0.8, 1, 0.7],
  }));

  const moment = directorCapabilityDemoMoment(promoted);
  const blocked = applyDirectorBlocking(moment, actors);
  const primary = blocked.find((actor) => actor.id === "primary_subject");
  const left = blocked.find((actor) => actor.id === "secondary_subject");
  const right = blocked.find((actor) => actor.id === "context_subject");
  assert(primary && left && right, `${scenario.label}: blocked Between actors are incomplete.`);

  const midpoint = new THREE.Vector3(...left.position).lerp(
    new THREE.Vector3(...right.position),
    0.5,
  );
  assert(
    new THREE.Vector3(...primary.position).distanceTo(midpoint) <= 0.001,
    `${scenario.label}: Between primary is not the exact reference midpoint.`,
  );

  const leftGap =
    Math.abs(primary.position[0] - left.position[0]) -
    groundHalfWidth(primary) -
    groundHalfWidth(left);
  const rightGap =
    Math.abs(right.position[0] - primary.position[0]) -
    groundHalfWidth(right) -
    groundHalfWidth(primary);
  assert(
    leftGap >= 0.14 && rightGap >= 0.14,
    `${scenario.label}: compact fixture erased physical breathing room: left=${leftGap.toFixed(3)}m right=${rightGap.toFixed(3)}m.`,
  );

  const ids = ["secondary_subject", "primary_subject", "context_subject"] as const;
  const centers = ids.map((id) =>
    projectDirectorActorCenter(moment, blocked, id, 0),
  );
  assert(
    centers.every((center) => center?.visible_in_safe_frame),
    `${scenario.label}: all Between centers must remain in the safe frame.`,
  );
  const orderedX = centers.map((center) => center!.ndc[0]);
  assert(
    orderedX[0]! < orderedX[1]! - 0.09 &&
      orderedX[1]! < orderedX[2]! - 0.09,
    `${scenario.label}: projected Between ordering is not visibly left/centre/right: ${orderedX.map((value) => value.toFixed(3)).join("/")}.`,
  );

  const envelopes = ids.map((id) =>
    projectDirectorActorEnvelope(moment, blocked, id, 0),
  );
  assert(
    envelopes.every((envelope) => envelope?.fully_inside_safe_frame),
    `${scenario.label}: all Between projected envelopes must remain in the safe frame.`,
  );
  const heights = envelopes.map((envelope) => envelope!.height_ndc);
  assert(
    heights[1]! >= 0.34,
    `${scenario.label}: Between primary remains too small after fixture compaction: ${heights[1]!.toFixed(3)} NDC.`,
  );
  assert(
    Math.min(...heights) >= 0.15,
    `${scenario.label}: at least one Between participant remains too small to read: ${heights.map((value) => value.toFixed(3)).join("/")}.`,
  );

  return { referenceHalfSpan, heights, orderedX };
}

function main() {
  assert(
    DIRECTOR_RELATIVE_ACTOR_FIXTURE_POLICY_VERSION ===
      "director_relative_actor_fixture_policy_phase1b7a11a5_v1",
    "A.11A.6 must not rewrite the qualified A.11A.5 Relative actor fixture policy version.",
  );
  assert(
    DIRECTOR_RELATIVE_ACTOR_BETWEEN_FRAMING_POLICY_VERSION ===
      "director_relative_actor_between_framing_policy_phase1b7a11a6_v1",
    "Unexpected A.11A.6 Between framing policy version.",
  );

  const evidence = SCENARIOS.map(scenarioEvidence);

  const fixture = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy.ts",
  );
  for (const marker of [
    "A.11A.6",
    "primaryExtent * 0.4",
    "Math.max(secondaryExtent, contextExtent) * 0.32",
    "Full-cast remains the physical-scale",
  ]) {
    assert(
      fixture.includes(marker),
      `A.11A.6 Between fixture marker missing: ${marker}`,
    );
  }

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes('reference_roles: ["secondary_subject", "context_subject"]') &&
      registry.includes('reference_entity_ids: ["secondary_subject", "context_subject"]'),
    "A.11A.6 must preserve the A.11A.5 canonical ternary Between contract.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  assert(
    runtime.includes('if (cue.relation === "between")') &&
      runtime.includes("position.lerpVectors("),
    "A.11A.6 must preserve the canonical runtime midpoint solver.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.6 — Between qualification framing refinement"),
    "Director README is missing the A.11A.6 Between framing note.",
  );

  console.log(
    "Director Relative actor Between Phase 1B.7A.11A.6 framing verification passed.",
  );
  evidence.forEach((item, index) => {
    console.log(
      `${SCENARIOS[index]!.label}: half-span ${item.referenceHalfSpan.toFixed(3)}m; projected heights ${item.heights.map((value) => value.toFixed(3)).join("/")}; centres ${item.orderedX.map((value) => value.toFixed(3)).join("/")}.`,
    );
  });
}

main();
