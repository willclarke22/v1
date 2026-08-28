import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  directorCapabilityDemoShot,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION,
  DIRECTOR_DETAIL_RELATIONSHIP_FIXTURE_POLICY_VERSION,
  directorQualificationAssetRoles,
  directorQualificationDetailRelationshipAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  directorCameraFidelityFixtureActors,
} from "../../sandbox/probe-lab/motion-camera-library/director-camera-fidelity";
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

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
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

  const visualCenter = sample.position.clone().add(
    new THREE.Vector3(0, Math.max(0.1, primary.size[1]) * 0.45, 0),
  );
  const ndc = visualCenter.project(camera);
  return (ndc.x + 1) * 0.5;
}

function main() {
  assert(DIRECTOR_CAPABILITIES.length === 184, "Frozen Director registry must remain 184 entries.");

  const fullFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const fullIds = fullFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);

  assert(fullFamilies.length === 33, "Full qualification taxonomy must remain 33 families.");
  assert(new Set(fullIds).size === 184, "Full qualification taxonomy must assign 184 unique capabilities.");
  assert(activeFamilies.length === 33, "Active qualification taxonomy must remain 33 families.");
  const deferred = [
    ...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  ] as readonly string[];
  assert(
    new Set(activeIds).size === DIRECTOR_CAPABILITIES.length - deferred.length,
    "Active qualification taxonomy must equal frozen coverage minus the live deferred set.",
  );
  assert(
    deferred.includes("inside_object") && deferred.includes("macro"),
    `A.11A.21 lineage requires inside_object + macro to remain deferred. Got ${deferred.join(", ")}`,
  );
  assert(!activeIds.includes("macro"), "Macro must be deferred from active Qualification.");
  assert(fullIds.includes("macro"), "Macro must remain in the frozen qualification taxonomy.");

  // Successor-safe A.11A.19 canary: inside_object remains deferred and
  // object_attached keeps the solid-bodied vehicle-only qualification profile.
  const specialFamily = activeFamilies.find(
    (family) =>
      family.category === "camera_angle" &&
      family.group === "Special viewpoints",
  );
  assert(specialFamily, "Active Special viewpoints family is missing.");
  const objectAttachedProfile = directorQualificationCapabilityProfile(
    specialFamily,
    "object_attached",
  );
  assert(
    JSON.stringify(objectAttachedProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["vehicle"]),
    "Object-attached must retain its solid-bodied vehicle qualification profile.",
  );

  // Successor-safe A.11A.20 canaries: Composition membership, primary-only
  // negative-space proofs, and true projected thirds remain intact without
  // freezing the historical 183-active-capability snapshot.
  assert(
    DIRECTOR_COMPOSITION_NEGATIVE_SPACE_FIXTURE_POLICY_VERSION ===
      "director_composition_negative_space_fixture_policy_phase1b7a11a20_v1",
    "A.11A.20 composition fixture-policy contract regressed.",
  );
  const compositionFamily = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Composition",
  );
  assert(compositionFamily, "Active Composition family is missing.");
  const expectedCompositionIds = [
    "anchor_center",
    "left_third",
    "right_third",
    "negative_space_left",
    "negative_space_right",
    "two_subject_balance",
  ];
  assert(
    JSON.stringify(compositionFamily.capability_ids) ===
      JSON.stringify(expectedCompositionIds),
    `Composition family membership regressed: ${compositionFamily.capability_ids.join(", ")}`,
  );
  for (const id of ["negative_space_left", "negative_space_right"]) {
    const roles = directorQualificationAssetRoles(compositionFamily, capability(id));
    assert(
      roles.length === 1 && roles[0]?.role === "primary_subject",
      `${id} must retain primary-only Qualification evidence.`,
    );
  }
  const centerX = projectedPrimaryScreenX("anchor_center");
  const leftX = projectedPrimaryScreenX("left_third");
  const rightX = projectedPrimaryScreenX("right_third");
  assert(centerX >= 0.47 && centerX <= 0.53, `Center anchor drifted: ${centerX.toFixed(4)}.`);
  assert(leftX >= 0.29 && leftX <= 0.38, `Left third drifted: ${leftX.toFixed(4)}.`);
  assert(rightX >= 0.62 && rightX <= 0.71, `Right third drifted: ${rightX.toFixed(4)}.`);
  assert(
    Math.abs(leftX - (1 - rightX)) <= 0.035,
    `Thirds symmetry regressed: left=${leftX.toFixed(4)} right=${rightX.toFixed(4)}.`,
  );

  const detailFamily = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
  assert(detailFamily, "Active Detail & relationship framing family is missing.");
  for (const id of [
    "insert",
    "two_shot",
    "group_shot",
    "over_shoulder",
    "point_of_view",
  ]) {
    assert(
      detailFamily.capability_ids.includes(id),
      `A.11A.21 durable detail capability disappeared from active qualification: ${id}.`,
    );
  }
  if (deferred.includes("cutaway")) {
    assert(
      !detailFamily.capability_ids.includes("cutaway"),
      "Deferred Cutaway must not remain in active Detail & relationship evidence.",
    );
  }

  const insertProfile = directorQualificationCapabilityProfile(detailFamily, "insert");
  assert(
    JSON.stringify(insertProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["small_detail", "compact_rigid", "irregular_hero"]),
    "Insert must use the suitable small/compact detail-target pools.",
  );

  assert(
    DIRECTOR_DETAIL_RELATIONSHIP_FIXTURE_POLICY_VERSION ===
      "director_detail_relationship_fixture_policy_phase1b7a11a21_v1",
    "A.11A.21 fixture policy version mismatch.",
  );

  const insertRoles = directorQualificationDetailRelationshipAssetRoles(
    detailFamily,
    capability("insert"),
  ).map((role) => role.role);
  const twoRoles = directorQualificationDetailRelationshipAssetRoles(
    detailFamily,
    capability("two_shot"),
  ).map((role) => role.role);
  const groupRoles = directorQualificationDetailRelationshipAssetRoles(
    detailFamily,
    capability("group_shot"),
  ).map((role) => role.role);
  assert(JSON.stringify(insertRoles) === JSON.stringify(["context_subject"]), "Insert qualification must bind only its explicit detail target.");
  assert(JSON.stringify(twoRoles) === JSON.stringify(["primary_subject", "secondary_subject"]), "Two-shot qualification must contain exactly two actors.");
  assert(JSON.stringify(groupRoles) === JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]), "Group-shot qualification must contain exactly three actors.");

  const twoShot = directorCapabilityDemoShot(capability("two_shot"));
  assert(
    JSON.stringify(twoShot.camera.focus_entity_ids) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "Two-shot camera must fit both relationship actors.",
  );
  const groupShot = directorCapabilityDemoShot(capability("group_shot"));
  assert(
    JSON.stringify(groupShot.camera.focus_entity_ids) ===
      JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
    "Group-shot camera must fit all three qualification actors.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "DIRECTOR_COMPOSITION_REFERENCE_ASPECT_RATIO = 16 / 9",
    "DIRECTOR_THIRD_SCREEN_NDC_OFFSET = 1 / 3",
    "const thirdsHorizontal =",
    'case "left_third": offset.addScaledVector(right, thirdsHorizontal)',
    'case "right_third": offset.addScaledVector(right, -thirdsHorizontal)',
    "screenAnchorOffset(shot, pose.position, pose.target, radius, resolvedFov)",
  ]) {
    assert(runtime.includes(marker), `Composition runtime canary missing: ${marker}`);
  }
  assert(
    runtime.includes('["two_shot", "group_shot", "cutaway"].includes(shot.composition.framing)') &&
      runtime.includes("relationshipEnvelopeFitComposition"),
    "Runtime projected relationship-envelope fit is missing.",
  );
  assert(
    !runtime.includes('["two_shot", "group_shot", "cutaway", "over_shoulder"') &&
      !runtime.includes('["two_shot", "group_shot", "cutaway", "point_of_view"'),
    "A.11A.21 must not fold qualified OTS/POV into the new relationship-fit branch.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    (room.includes("Macro is deferred from active Qualification Room coverage") ||
      room.includes("Macro remains deferred until reviewed")) &&
      room.includes("detailRelationshipEvidence"),
    "Qualification Room A.11A.21 state/role markers are missing.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.21 — Detail & relationship framing qualification truth") &&
      readme.includes("semantic feature/sub-part anchors") &&
      (readme.includes("Active Qualification coverage is now 182 capabilities") ||
        readme.includes("Active Qualification coverage is now **181 capabilities**")),
    "Director README is missing A.11A.21 qualification boundaries.",
  );

  console.log("Director Detail & relationship framing Phase 1B.7A.11A.21 verification passed.");
  console.log(
    "Macro remains deferred; successor phases may defer higher-order framing vocabulary while preserving A.11A.19 object-attached, A.11A.20 Composition, Insert target diversity, and relationship-safe framing semantics.",
  );
}

main();
