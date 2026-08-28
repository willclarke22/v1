import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import { directorCameraFidelityFixtureActors } from "../../sandbox/probe-lab/motion-camera-library/director-camera-fidelity";
import {
  DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION,
  directorQualificationAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  sampleDirectorActorState,
  sampleDirectorCameraPose,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const match = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(match, `Missing Director capability: ${id}`);
  return match;
}

function projectedPrimaryScreenX(capabilityId: string) {
  const item = capability(capabilityId);
  const actors = directorCameraFidelityFixtureActors(item);
  const primary = actors.find((actor) => actor.id === "primary_subject");
  assert(primary, `${capabilityId} controlled fixture has no primary_subject.`);

  const moment = directorCapabilityDemoMoment(item);
  const progress = 0.5;
  const sample = sampleDirectorActorState(moment, primary, progress, actors);
  const pose = sampleDirectorCameraPose(moment, progress, actors);

  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // sampleDirectorCameraPose targets the single actor at 45% of its height.
  // Project that semantic visual centre rather than the actor's ground origin.
  const visualCenter = sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.1, primary.size[1]) * 0.45, 0),
  );
  const ndc = visualCenter.project(camera);
  return (ndc.x + 1) * 0.5;
}

function main() {
  assert(
    DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION ===
      "director_composition_negative_space_fixture_policy_phase1b7a11a20_v1",
    "A.11A.20 composition fixture policy version mismatch.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.20 must preserve the frozen 184-capability / 33-family taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === 183 &&
      new Set(activeIds).size === 183 &&
      !activeIds.includes("inside_object"),
    "A.11A.20 must preserve the A.11A.19 183-capability active campaign with inside_object deferred.",
  );

  const composition = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Composition",
  );
  assert(composition, "Composition qualification family could not be resolved.");

  const expectedCompositionIds = [
    "anchor_center",
    "left_third",
    "right_third",
    "negative_space_left",
    "negative_space_right",
    "two_subject_balance",
  ];
  assert(
    expectedCompositionIds.every((id) => composition.capability_ids.includes(id)) &&
      composition.capability_ids.length === expectedCompositionIds.length,
    `Composition family membership changed unexpectedly: ${JSON.stringify(composition.capability_ids)}.`,
  );

  for (const id of ["negative_space_left", "negative_space_right"]) {
    const roles = directorQualificationAssetRoles(composition, capability(id));
    assert(
      roles.length === 1 && roles[0]?.role === "primary_subject",
      `${id} Qualification evidence must render only primary_subject so the reserved side is genuinely empty.`,
    );
  }

  // Do not broaden the fixture cleanup into already-good composition siblings.
  for (const id of ["anchor_center", "left_third", "right_third", "two_subject_balance"]) {
    const roles = directorQualificationAssetRoles(composition, capability(id));
    assert(
      roles.length === capability(id).demo.asset_roles.length,
      `${id} Qualification role count changed unexpectedly.`,
    );
  }

  const centerX = projectedPrimaryScreenX("anchor_center");
  const leftX = projectedPrimaryScreenX("left_third");
  const rightX = projectedPrimaryScreenX("right_third");

  assert(
    centerX >= 0.47 && centerX <= 0.53,
    `Center anchor drifted away from frame centre: x=${centerX.toFixed(4)}.`,
  );
  assert(
    leftX >= 0.29 && leftX <= 0.38,
    `Left third must land near the 1/3 screen line in the 16:9 controlled proof: x=${leftX.toFixed(4)}.`,
  );
  assert(
    rightX >= 0.62 && rightX <= 0.71,
    `Right third must land near the 2/3 screen line in the 16:9 controlled proof: x=${rightX.toFixed(4)}.`,
  );
  assert(
    Math.abs(leftX - (1 - rightX)) <= 0.035,
    `Left/right thirds should remain approximately symmetric: left=${leftX.toFixed(4)} right=${rightX.toFixed(4)}.`,
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "DIRECTOR_COMPOSITION_REFERENCE_ASPECT_RATIO = 16 / 9",
    "DIRECTOR_THIRD_SCREEN_NDC_OFFSET = 1 / 3",
    "const thirdsHorizontal =",
    'case "left_third": offset.addScaledVector(right, thirdsHorizontal)',
    'case "right_third": offset.addScaledVector(right, -thirdsHorizontal)',
    'case "center_left": offset.addScaledVector(right, horizontal * 0.6)',
    'case "center_right": offset.addScaledVector(right, -horizontal * 0.6)',
    'negative_space_side === "left") offset.addScaledVector(right, -horizontal * 0.45)',
    'negative_space_side === "right") offset.addScaledVector(right, horizontal * 0.45)',
    "screenAnchorOffset(shot, pose.position, pose.target, radius, resolvedFov)",
  ]) {
    assert(runtime.includes(marker), `A.11A.20 runtime marker missing: ${marker}`);
  }

  const fixturePolicy = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy.ts",
  );
  for (const marker of [
    "DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION",
    "isCompositionQualificationFamily",
    "directorQualificationCompositionAssetRoles",
    'capability.id !== "negative_space_left"',
    'capability.id !== "negative_space_right"',
    'role.role === "primary_subject"',
  ]) {
    assert(fixturePolicy.includes(marker), `A.11A.20 fixture-policy marker missing: ${marker}`);
  }

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  for (const marker of [
    "Phase 1B.7A.11A.20 — Composition thirds + negative-space truth",
    "screen-space thirds solve",
    "Negative-space qualification is also made truthful and symmetric",
    "only the required primary actor",
    "does not prevent a",
    "production shot from containing other actors",
    "A.11A.19 deferrals",
  ]) {
    assert(readme.includes(marker), `A.11A.20 README marker missing: ${marker}`);
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
    `A.11A.20 must preserve the Level 2 support distribution: ${JSON.stringify(supportCounts)}.`,
  );

  console.log(
    "Director Composition Phase 1B.7A.11A.20 thirds + negative-space verification passed.",
  );
  console.log(
    `16:9 controlled screen centres: center=${centerX.toFixed(3)}, left=${leftX.toFixed(3)}, right=${rightX.toFixed(3)}. Negative-space evidence is primary-only and the 184/183 frozen/active taxonomy remains intact.`,
  );
}

main();
