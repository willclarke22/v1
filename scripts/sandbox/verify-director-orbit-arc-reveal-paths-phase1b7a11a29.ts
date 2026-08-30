import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_REVERSE_REVEAL_DEMO_DEGREES,
  DIRECTOR_RISE_REVEAL_DEMO_DISTANCE_M,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_ORBIT_REVEAL_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustOrbitRevealFixturePositions,
  directorQualificationAdjustOrbitRevealNormalization,
  directorQualificationAssetRoles,
  directorQualificationOrbitRevealSupportingCastSlot,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import type { DirectorQualificationAssetNormalization } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-normalization";
import {
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  type DirectorProjectedActorEnvelope,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function overlapFraction(
  left: DirectorProjectedActorEnvelope,
  right: DirectorProjectedActorEnvelope,
) {
  const overlapX = Math.max(
    0,
    Math.min(left.max_ndc_x, right.max_ndc_x) -
      Math.max(left.min_ndc_x, right.min_ndc_x),
  );
  const overlapY = Math.max(
    0,
    Math.min(left.max_ndc_y, right.max_ndc_y) -
      Math.max(left.min_ndc_y, right.min_ndc_y),
  );
  const intersection = overlapX * overlapY;
  const leftArea = Math.max(0.000001, left.width_ndc * left.height_ndc);
  const rightArea = Math.max(0.000001, right.width_ndc * right.height_ndc);
  return intersection / Math.min(leftArea, rightArea);
}

function fixtureActors(
  family: ReturnType<typeof buildDirectorQualificationFamilies>[number],
  item: DirectorCapability,
  extents: readonly [number, number],
  sizes: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
  ],
): DirectorRuntimeActor[] {
  const scene = directorQualificationScene(family.recommended_scene_id);
  const positions = directorQualificationAdjustOrbitRevealFixturePositions({
    family,
    capability: item,
    scene,
    positions: [
      [...scene.blocking.primary],
      [...scene.blocking.secondary],
    ],
    target_extents_m: [...extents],
  });
  return [
    {
      id: "primary_subject",
      position: positions[0]!,
      rotation: [0, 0, 0],
      size: [sizes[0][0], sizes[0][1], sizes[0][2]],
    },
    {
      id: "secondary_subject",
      position: positions[1]!,
      rotation: [0, 0, 0],
      size: [sizes[1][0], sizes[1][1], sizes[1][2]],
    },
  ];
}

function fakeNormalization(
  targetExtent: number,
): DirectorQualificationAssetNormalization {
  return {
    normalization_version: "director_qualification_normalization_phase1b7a1_v1",
    cast_slot_id: "simple_rigid",
    policy: "presentation_normalized",
    role_kind: "secondary",
    source_dimensions_m: [1, 1, 1],
    source_largest_extent_m: 1,
    logical_extent_m: 0.65,
    logical_extent_source: "controlled_verifier_fixture",
    requested_target_extent_m: targetExtent,
    target_extent_m: targetExtent,
    render_scale_multiplier: targetExtent,
    metadata_warning: null,
    reason: "controlled verifier fixture",
  };
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const deferred =
    [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS] as readonly string[];

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.29 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeIds.length === DIRECTOR_CAPABILITIES.length - deferred.length &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.29 active coverage must derive from the live deferred set. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );

  const frozenFamily = frozenFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Orbit, arc & reveal paths",
  );
  const activeFamily = activeFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Orbit, arc & reveal paths",
  );
  assert(frozenFamily && activeFamily, "Orbit, arc & reveal paths family is missing.");
  const expectedIds = [
    "orbit",
    "arc_left",
    "arc_right",
    "reverse_reveal",
    "rise_reveal",
  ];
  assert(
    JSON.stringify(frozenFamily.capability_ids) === JSON.stringify(expectedIds) &&
      JSON.stringify(activeFamily.capability_ids) === JSON.stringify(expectedIds),
    `Orbit/Arc/Reveal membership changed unexpectedly: frozen=${JSON.stringify(frozenFamily.capability_ids)} active=${JSON.stringify(activeFamily.capability_ids)}.`,
  );

  assert(
    DIRECTOR_ORBIT_REVEAL_FIXTURE_POLICY_VERSION ===
      "director_orbit_reveal_fixture_policy_phase1b7a11a29_v1",
    "A.11A.29 reveal fixture-policy version mismatch.",
  );

  for (const id of ["orbit", "arc_left", "arc_right"]) {
    const item = capability(id);
    const roles = directorQualificationAssetRoles(activeFamily, item).map(
      (role) => role.role,
    );
    assert(
      JSON.stringify(roles) ===
        JSON.stringify(item.demo.asset_roles.map((role) => role.role)),
      `${id} must retain the accepted three-role spatial-reference stage.`,
    );
  }
  for (const id of ["reverse_reveal", "rise_reveal"]) {
    const roles = directorQualificationAssetRoles(
      activeFamily,
      capability(id),
    ).map((role) => role.role);
    assert(
      JSON.stringify(roles) ===
        JSON.stringify(["primary_subject", "secondary_subject"]),
      `${id} qualification must use exactly the two actors intrinsic to the reveal.`,
    );
  }

  assert(
    directorQualificationOrbitRevealSupportingCastSlot(
      activeFamily,
      capability("reverse_reveal"),
      "furniture",
    ) === "compact_rigid",
    "Reverse reveal must use a compact-rigid concealed source instead of an arbitrary open furniture support.",
  );
  assert(
    directorQualificationOrbitRevealSupportingCastSlot(
      activeFamily,
      capability("rise_reveal"),
      "furniture",
    ) === "simple_rigid",
    "Rise and reveal must use a solid simple-rigid foreground occluder.",
  );

  const adjustedOccluderNormalization =
    directorQualificationAdjustOrbitRevealNormalization({
      family: activeFamily,
      capability: capability("rise_reveal"),
      role: "secondary_subject",
      normalization: fakeNormalization(1.14),
    });
  assert(
    adjustedOccluderNormalization.target_extent_m >= 1.25 &&
      adjustedOccluderNormalization.render_scale_multiplier >= 1.25,
    `Rise-and-reveal presentation occluder is too small: ${JSON.stringify(adjustedOccluderNormalization)}.`,
  );

  const reverseMoment = directorCapabilityDemoMoment(capability("reverse_reveal"));
  const reverseShot = reverseMoment.shot;
  assert(reverseShot, "Reverse reveal demo shot is missing.");
  const reverseStep = reverseShot.camera.movement_steps[0];
  assert(
    reverseStep?.movement === "reverse_reveal" &&
      reverseStep.parameters.degrees === DIRECTOR_REVERSE_REVEAL_DEMO_DEGREES &&
      DIRECTOR_REVERSE_REVEAL_DEMO_DEGREES === 72,
    "Reverse reveal demo must author the stronger bounded reveal arc.",
  );
  assert(
    JSON.stringify(reverseShot.camera.focus_entity_ids) ===
      JSON.stringify(["primary_subject", "secondary_subject"]) &&
      JSON.stringify(reverseShot.composition.keep_visible_entity_ids) ===
        JSON.stringify(["primary_subject"]) &&
      reverseShot.reveal_at === 0.5,
    "Reverse reveal must permit the source to begin concealed while retaining the two-actor target handoff.",
  );

  const riseMoment = directorCapabilityDemoMoment(capability("rise_reveal"));
  const riseShot = riseMoment.shot;
  assert(riseShot, "Rise and reveal demo shot is missing.");
  const riseStep = riseShot.camera.movement_steps[0];
  assert(
    riseStep?.movement === "rise_reveal" &&
      riseStep.parameters.distance_m === DIRECTOR_RISE_REVEAL_DEMO_DISTANCE_M &&
      DIRECTOR_RISE_REVEAL_DEMO_DISTANCE_M === 1.6,
    "Rise and reveal demo must use the calibrated bounded rise that creates vertical parallax without over-pulling the camera.",
  );
  assert(
    riseShot.composition.keep_visible_entity_ids.length === 0 &&
      JSON.stringify(riseShot.composition.foreground_entity_ids) ===
        JSON.stringify(["secondary_subject"]) &&
      JSON.stringify(riseShot.camera.focus_entity_ids) ===
        JSON.stringify(["primary_subject"]) &&
      riseShot.reveal_at === 0.48,
    "Rise and reveal must explicitly model a foreground occluder and allow the target to begin hidden.",
  );

  const reverseActors = fixtureActors(
    activeFamily,
    capability("reverse_reveal"),
    [1.25, 1.14],
    [
      [1.05, 1.25, 0.9],
      [0.82, 1.14, 0.76],
    ],
  );
  const reversePrimaryStart = projectDirectorActorEnvelope(
    reverseMoment,
    reverseActors,
    "primary_subject",
    0,
  );
  const reverseSourceStart = projectDirectorActorEnvelope(
    reverseMoment,
    reverseActors,
    "secondary_subject",
    0,
  );
  const reversePrimaryEnd = projectDirectorActorEnvelope(
    reverseMoment,
    reverseActors,
    "primary_subject",
    1,
  );
  const reverseSourceEnd = projectDirectorActorEnvelope(
    reverseMoment,
    reverseActors,
    "secondary_subject",
    1,
  );
  const reversePrimaryCenterStart = projectDirectorActorCenter(
    reverseMoment,
    reverseActors,
    "primary_subject",
    0,
  );
  const reverseSourceCenterStart = projectDirectorActorCenter(
    reverseMoment,
    reverseActors,
    "secondary_subject",
    0,
  );
  const reverseSourceCenterEnd = projectDirectorActorCenter(
    reverseMoment,
    reverseActors,
    "secondary_subject",
    1,
  );
  const reversePrimaryCenterEnd = projectDirectorActorCenter(
    reverseMoment,
    reverseActors,
    "primary_subject",
    1,
  );
  assert(
    reversePrimaryStart &&
      reverseSourceStart &&
      reversePrimaryEnd &&
      reverseSourceEnd &&
      reversePrimaryCenterStart &&
      reverseSourceCenterStart &&
      reverseSourceCenterEnd &&
      reversePrimaryCenterEnd,
    "Reverse reveal projection evidence is incomplete.",
  );
  const reverseStartOverlap = overlapFraction(
    reversePrimaryStart,
    reverseSourceStart,
  );
  const reverseEndOverlap = overlapFraction(
    reversePrimaryEnd,
    reverseSourceEnd,
  );
  const reverseStartCenterGap = Math.abs(
    reversePrimaryCenterStart.ndc[0] - reverseSourceCenterStart.ndc[0],
  );
  const reverseEndCenterGap = Math.abs(
    reversePrimaryCenterEnd.ndc[0] - reverseSourceCenterEnd.ndc[0],
  );
  assert(
    reverseStartOverlap >= 0.62 &&
      reverseStartCenterGap <= 0.1 &&
      reverseSourceCenterStart.camera_depth_m >=
        reversePrimaryCenterStart.camera_depth_m + 0.35,
    `Reverse reveal must begin with the source substantially hidden behind the apparent result. overlap=${reverseStartOverlap.toFixed(3)} centerGap=${reverseStartCenterGap.toFixed(3)} depthGap=${(reverseSourceCenterStart.camera_depth_m - reversePrimaryCenterStart.camera_depth_m).toFixed(3)}.`,
  );
  assert(
    reverseEndOverlap <= reverseStartOverlap - 0.25 &&
      reverseEndCenterGap >= 0.15 &&
      reverseSourceCenterEnd.visible_in_safe_frame,
    `Reverse reveal must end with the source independently readable through parallax. overlap=${reverseEndOverlap.toFixed(3)} centerGap=${reverseEndCenterGap.toFixed(3)} visible=${reverseSourceCenterEnd.visible_in_safe_frame}.`,
  );

  const riseActors = fixtureActors(
    activeFamily,
    capability("rise_reveal"),
    [1.25, 1.25],
    [
      [1.05, 1.25, 0.9],
      [1.05, 1.25, 1.0],
    ],
  );
  const riseTargetStart = projectDirectorActorEnvelope(
    riseMoment,
    riseActors,
    "primary_subject",
    0,
  );
  const riseOccluderStart = projectDirectorActorEnvelope(
    riseMoment,
    riseActors,
    "secondary_subject",
    0,
  );
  const riseTargetEnd = projectDirectorActorEnvelope(
    riseMoment,
    riseActors,
    "primary_subject",
    1,
  );
  const riseOccluderEnd = projectDirectorActorEnvelope(
    riseMoment,
    riseActors,
    "secondary_subject",
    1,
  );
  const riseTargetCenterStart = projectDirectorActorCenter(
    riseMoment,
    riseActors,
    "primary_subject",
    0,
  );
  const riseOccluderCenterStart = projectDirectorActorCenter(
    riseMoment,
    riseActors,
    "secondary_subject",
    0,
  );
  const riseTargetCenterEnd = projectDirectorActorCenter(
    riseMoment,
    riseActors,
    "primary_subject",
    1,
  );
  const riseOccluderCenterEnd = projectDirectorActorCenter(
    riseMoment,
    riseActors,
    "secondary_subject",
    1,
  );
  assert(
    riseTargetStart &&
      riseOccluderStart &&
      riseTargetEnd &&
      riseOccluderEnd &&
      riseTargetCenterStart &&
      riseOccluderCenterStart &&
      riseTargetCenterEnd &&
      riseOccluderCenterEnd,
    "Rise-and-reveal projection evidence is incomplete.",
  );
  const riseStartOverlap = overlapFraction(riseTargetStart, riseOccluderStart);
  const riseEndOverlap = overlapFraction(riseTargetEnd, riseOccluderEnd);
  const riseStartVerticalGap =
    riseTargetCenterStart.ndc[1] - riseOccluderCenterStart.ndc[1];
  const riseEndVerticalGap =
    riseTargetCenterEnd.ndc[1] - riseOccluderCenterEnd.ndc[1];
  const riseStartTopClearance =
    riseTargetStart.max_ndc_y - riseOccluderStart.max_ndc_y;
  const riseEndTopClearance =
    riseTargetEnd.max_ndc_y - riseOccluderEnd.max_ndc_y;
  assert(
    riseStartOverlap >= 0.62 &&
      riseOccluderCenterStart.camera_depth_m <=
        riseTargetCenterStart.camera_depth_m - 0.35,
    `Rise and reveal must begin behind a foreground occluder. overlap=${riseStartOverlap.toFixed(3)} depthGap=${(riseTargetCenterStart.camera_depth_m - riseOccluderCenterStart.camera_depth_m).toFixed(3)}.`,
  );
  assert(
    riseEndOverlap <= riseStartOverlap - 0.24 &&
      riseEndVerticalGap >= riseStartVerticalGap + 0.08 &&
      riseEndTopClearance >= riseStartTopClearance + 0.24 &&
      riseEndTopClearance >= 0.24 &&
      riseTargetCenterEnd.visible_in_safe_frame,
    `Rise and reveal must visibly clear the occluder as the camera rises. startOverlap=${riseStartOverlap.toFixed(3)} endOverlap=${riseEndOverlap.toFixed(3)} startVerticalGap=${riseStartVerticalGap.toFixed(3)} endVerticalGap=${riseEndVerticalGap.toFixed(3)} startTopClearance=${riseStartTopClearance.toFixed(3)} endTopClearance=${riseEndTopClearance.toFixed(3)}.`,
  );

  const reverseProfile = directorQualificationCapabilityProfile(
    activeFamily,
    "reverse_reveal",
  );
  const riseProfile = directorQualificationCapabilityProfile(
    activeFamily,
    "rise_reveal",
  );
  assert(
    reverseProfile.merge_compare_with_capability_id === null &&
      reverseProfile.qualification_note?.includes("occlusion transition") &&
      riseProfile.merge_compare_with_capability_id === null &&
      riseProfile.qualification_note?.includes("solid foreground occluder"),
    "Reveal Qualification profiles must describe the perceptual hidden-to-readable contract without inventing a merge.",
  );

  console.log("Director Orbit, arc & reveal paths Phase 1B.7A.11A.29 verification passed.");
  console.log(
    `Reverse reveal overlap ${reverseStartOverlap.toFixed(3)} -> ${reverseEndOverlap.toFixed(3)}; Rise reveal overlap ${riseStartOverlap.toFixed(3)} -> ${riseEndOverlap.toFixed(3)}. Orbit/Arc siblings remain structurally unchanged.`,
  );
}

main();
