import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_PAN_DEMO_DISTANCE_M,
  DIRECTOR_ROTATIONAL_REFRAMING_DEMO_POLICY_VERSION,
  DIRECTOR_TILT_DEMO_STRENGTH,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  directorQualificationExpectedActiveCapabilityCount,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  type DirectorQualificationFamily,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_ROTATIONAL_REFRAMING_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustOrbitRevealFixturePositions,
  directorQualificationAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  sampleDirectorCameraPose,
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

const ROLE_SIZE: Record<string, [number, number, number]> = {
  primary_subject: [1.0, 1.6, 0.8],
  secondary_subject: [1.0, 1.35, 0.8],
  context_subject: [0.7, 0.9, 0.65],
};

function basePosition(
  family: DirectorQualificationFamily,
  role: string,
): [number, number, number] {
  const scene = directorQualificationScene(family.recommended_scene_id);
  if (role === "primary_subject") return [...scene.blocking.primary];
  if (role === "secondary_subject") return [...scene.blocking.secondary];
  return [...scene.blocking.context];
}

function fixtureActors(
  family: DirectorQualificationFamily,
  item: DirectorCapability,
): DirectorRuntimeActor[] {
  const scene = directorQualificationScene(family.recommended_scene_id);
  const roles = directorQualificationAssetRoles(family, item);
  const sizes = roles.map(
    (role) => ROLE_SIZE[role.role] ?? ([0.8, 1.0, 0.8] as [number, number, number]),
  );
  const positions = directorQualificationAdjustOrbitRevealFixturePositions({
    family,
    capability: item,
    scene,
    positions: roles.map((role) => basePosition(family, role.role)),
    target_extents_m: sizes.map((size) => Math.max(...size)),
  });

  return roles.map((role, index) => ({
    id: role.role,
    position: positions[index] ?? basePosition(family, role.role),
    rotation: [0, 0, 0],
    size: sizes[index] ?? [0.8, 1.0, 0.8],
  }));
}

function visibleVerticalFraction(envelope: DirectorProjectedActorEnvelope) {
  const visibleBottom = Math.max(-0.92, envelope.min_ndc_y);
  const visibleTop = Math.min(0.92, envelope.max_ndc_y);
  const visibleHeight = Math.max(0, visibleTop - visibleBottom);
  return visibleHeight / Math.max(0.000001, envelope.height_ndc);
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
    "A.11A.30 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeIds.length === directorQualificationExpectedActiveCapabilityCount(DIRECTOR_CAPABILITIES) &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.30 active coverage must derive from the live Qualification exclusion policy. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  const frozenFamily = frozenFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Rotational reframing",
  );
  const activeFamily = activeFamilies.find(
    (family) =>
      family.category === "camera_movement" &&
      family.group === "Rotational reframing",
  );
  assert(frozenFamily && activeFamily, "Rotational reframing family is missing.");
  const expectedIds = ["pan", "tilt", "reframe"];
  assert(
    JSON.stringify(frozenFamily.capability_ids) === JSON.stringify(expectedIds) &&
      JSON.stringify(activeFamily.capability_ids) === JSON.stringify(expectedIds),
    `Rotational reframing membership changed unexpectedly: frozen=${JSON.stringify(frozenFamily.capability_ids)} active=${JSON.stringify(activeFamily.capability_ids)}.`,
  );

  assert(
    DIRECTOR_ROTATIONAL_REFRAMING_DEMO_POLICY_VERSION ===
      "director_rotational_reframing_demo_phase1b7a11a30_v1" &&
      DIRECTOR_ROTATIONAL_REFRAMING_FIXTURE_POLICY_VERSION ===
        "director_rotational_reframing_fixture_policy_phase1b7a11a30_v1",
    "A.11A.30 rotational-reframing policy version mismatch.",
  );
  assert(
    DIRECTOR_PAN_DEMO_DISTANCE_M === 0.95 &&
      DIRECTOR_TILT_DEMO_STRENGTH === 0.38,
    "A.11A.30 bounded Pan/Tilt demo calibration changed unexpectedly.",
  );

  const pan = capability("pan");
  const panMoment = directorCapabilityDemoMoment(pan);
  const panShot = panMoment.shot;
  assert(panShot, "Pan demo shot is missing.");
  const panStep = panShot.camera.movement_steps[0];
  assert(
    panStep?.movement === "pan" &&
      panStep.target_entity_id === "primary_subject" &&
      panStep.parameters.distance_m === DIRECTOR_PAN_DEMO_DISTANCE_M &&
      panStep.parameters.direction_sign === 1 &&
      JSON.stringify(panShot.camera.focus_entity_ids) ===
        JSON.stringify(["primary_subject"]),
    "Pan qualification must select the generic one-focus bounded-yaw branch rather than the two-actor handoff branch.",
  );
  const panActors = fixtureActors(activeFamily, pan);
  assert(
    panActors.length === pan.demo.asset_roles.length,
    "Pan must retain its existing spatial-reference cast.",
  );
  const panStartPose = sampleDirectorCameraPose(panMoment, 0, panActors);
  const panEndPose = sampleDirectorCameraPose(panMoment, 1, panActors);
  const panStart = projectDirectorActorCenter(
    panMoment,
    panActors,
    "primary_subject",
    0,
  );
  const panEnd = projectDirectorActorCenter(
    panMoment,
    panActors,
    "primary_subject",
    1,
  );
  assert(panStart && panEnd, "Pan projection evidence is incomplete.");
  const panCameraTravel = panStartPose.position.distanceTo(panEndPose.position);
  const panScreenTravel = Math.abs(panEnd.ndc[0] - panStart.ndc[0]);
  assert(
    panCameraTravel <= 0.001 &&
      panScreenTravel >= 0.16 &&
      panEnd.visible_in_safe_frame,
    `Pan must be fixed-position horizontal rotation with readable lateral screen travel. cameraTravel=${panCameraTravel.toFixed(4)} screenTravel=${panScreenTravel.toFixed(3)} end=${JSON.stringify(panEnd.ndc)}.`,
  );

  const tilt = capability("tilt");
  const tiltMoment = directorCapabilityDemoMoment(tilt);
  const tiltShot = tiltMoment.shot;
  assert(tiltShot, "Tilt demo shot is missing.");
  const tiltStep = tiltShot.camera.movement_steps[0];
  assert(
    tiltStep?.movement === "tilt" &&
      tiltStep.strength === DIRECTOR_TILT_DEMO_STRENGTH &&
      tiltShot.composition.framing === "medium_wide" &&
      JSON.stringify(tiltShot.camera.focus_entity_ids) ===
        JSON.stringify(["primary_subject"]),
    "Tilt qualification must use the bounded one-subject medium-wide proof.",
  );
  const tiltActors = fixtureActors(activeFamily, tilt);
  assert(
    tiltActors.length === 1 && tiltActors[0]?.id === "primary_subject",
    `Tilt qualification must remove unrelated support actors. roles=${JSON.stringify(tiltActors.map((actor) => actor.id))}.`,
  );
  const tiltStartPose = sampleDirectorCameraPose(tiltMoment, 0, tiltActors);
  const tiltEndPose = sampleDirectorCameraPose(tiltMoment, 1, tiltActors);
  const tiltStart = projectDirectorActorCenter(
    tiltMoment,
    tiltActors,
    "primary_subject",
    0,
  );
  const tiltEnd = projectDirectorActorCenter(
    tiltMoment,
    tiltActors,
    "primary_subject",
    1,
  );
  const tiltEndEnvelope = projectDirectorActorEnvelope(
    tiltMoment,
    tiltActors,
    "primary_subject",
    1,
  );
  assert(
    tiltStart && tiltEnd && tiltEndEnvelope,
    "Tilt projection evidence is incomplete.",
  );
  const tiltCameraTravel = tiltStartPose.position.distanceTo(tiltEndPose.position);
  const tiltVerticalTravel = Math.abs(tiltEnd.ndc[1] - tiltStart.ndc[1]);
  const tiltVisibleFraction = visibleVerticalFraction(tiltEndEnvelope);
  assert(
    tiltCameraTravel <= 0.001 &&
      tiltVerticalTravel >= 0.16 &&
      tiltEnd.visible_in_safe_frame &&
      Math.abs(tiltEnd.ndc[1]) <= 0.78 &&
      tiltVisibleFraction >= 0.42,
    `Tilt must remain visually useful through the final frame. cameraTravel=${tiltCameraTravel.toFixed(4)} verticalTravel=${tiltVerticalTravel.toFixed(3)} endY=${tiltEnd.ndc[1].toFixed(3)} visibleFraction=${tiltVisibleFraction.toFixed(3)}.`,
  );

  const reframe = capability("reframe");
  const reframeMoment = directorCapabilityDemoMoment(reframe);
  const reframeShot = reframeMoment.shot;
  assert(reframeShot, "Reframe demo shot is missing.");
  const reframeStep = reframeShot.camera.movement_steps[0];
  assert(
    reframeStep?.movement === "reframe" &&
      reframeStep.target_entity_id === "secondary_subject" &&
      JSON.stringify(reframeShot.camera.focus_entity_ids) ===
        JSON.stringify(["primary_subject", "secondary_subject"]) &&
      JSON.stringify(reframeShot.composition.keep_visible_entity_ids) ===
        JSON.stringify(["primary_subject", "secondary_subject"]),
    "Reframe qualification must retain an explicit two-actor A-to-B attention handoff.",
  );
  const reframeActors = fixtureActors(activeFamily, reframe);
  assert(
    JSON.stringify(reframeActors.map((actor) => actor.id)) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    `Reframe qualification must use exactly its two intrinsic handoff actors. roles=${JSON.stringify(reframeActors.map((actor) => actor.id))}.`,
  );
  const reframeStartPose = sampleDirectorCameraPose(
    reframeMoment,
    0,
    reframeActors,
  );
  const reframeEndPose = sampleDirectorCameraPose(
    reframeMoment,
    1,
    reframeActors,
  );
  const primaryStart = projectDirectorActorCenter(
    reframeMoment,
    reframeActors,
    "primary_subject",
    0,
  );
  const secondaryStart = projectDirectorActorCenter(
    reframeMoment,
    reframeActors,
    "secondary_subject",
    0,
  );
  const primaryEnd = projectDirectorActorCenter(
    reframeMoment,
    reframeActors,
    "primary_subject",
    1,
  );
  const secondaryEnd = projectDirectorActorCenter(
    reframeMoment,
    reframeActors,
    "secondary_subject",
    1,
  );
  assert(
    primaryStart && secondaryStart && primaryEnd && secondaryEnd,
    "Reframe projection evidence is incomplete.",
  );
  const reframeCameraTravel =
    reframeStartPose.position.distanceTo(reframeEndPose.position);
  assert(
    reframeCameraTravel <= 0.001 &&
      Math.abs(primaryStart.ndc[0]) <= 0.12 &&
      Math.abs(secondaryEnd.ndc[0]) <= 0.12 &&
      Math.abs(secondaryStart.ndc[0]) >= 0.34 &&
      Math.abs(primaryEnd.ndc[0]) >= 0.34 &&
      primaryStart.visible_in_safe_frame &&
      secondaryStart.visible_in_safe_frame &&
      primaryEnd.visible_in_safe_frame &&
      secondaryEnd.visible_in_safe_frame,
    `Reframe must visibly transfer optical-centre emphasis A->B with a fixed camera. cameraTravel=${reframeCameraTravel.toFixed(4)} primaryStartX=${primaryStart.ndc[0].toFixed(3)} secondaryStartX=${secondaryStart.ndc[0].toFixed(3)} primaryEndX=${primaryEnd.ndc[0].toFixed(3)} secondaryEndX=${secondaryEnd.ndc[0].toFixed(3)}.`,
  );

  const panProfile = directorQualificationCapabilityProfile(activeFamily, "pan");
  const tiltProfile = directorQualificationCapabilityProfile(activeFamily, "tilt");
  const reframeProfile = directorQualificationCapabilityProfile(
    activeFamily,
    "reframe",
  );
  assert(
    panProfile.merge_compare_with_capability_id === null &&
      panProfile.qualification_note?.includes("one focus subject") &&
      tiltProfile.merge_compare_with_capability_id === null &&
      tiltProfile.qualification_note?.includes("meaningfully readable") &&
      reframeProfile.merge_compare_with_capability_id === null &&
      reframeProfile.qualification_note?.includes("two-actor compositional handoff"),
    "Rotational-reframing Qualification profiles must encode the perceptual distinctions without inventing a merge.",
  );

  console.log(
    "Director Rotational reframing Phase 1B.7A.11A.30 verification passed.",
  );
  console.log(
    `Pan screen travel=${panScreenTravel.toFixed(3)}; Tilt vertical travel=${tiltVerticalTravel.toFixed(3)} visible=${tiltVisibleFraction.toFixed(3)}; Reframe X handoff=${primaryStart.ndc[0].toFixed(3)} -> ${secondaryEnd.ndc[0].toFixed(3)}.`,
  );
}

main();
