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
  DIRECTOR_QUALIFICATION_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustDepthScreenFixturePositions,
  directorQualificationDepthScreenAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  DIRECTOR_QUALIFICATION_SCENES,
  type DirectorQualificationScene,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  applyDirectorBlocking,
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  type DirectorProjectedActorEnvelope,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

function depthFamily(): DirectorQualificationFamily {
  const found = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) =>
      family.category === "blocking_placement" &&
      family.group === "Depth & screen placement",
  );
  assert(found, "Depth & screen placement qualification family is missing.");
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
  primary_subject: [0.66, 1.75, 0.52],
  secondary_subject: [0.82, 1.10, 0.82],
  context_subject: [0.46, 0.90, 0.46],
};

function basePositionForRole(
  scene: DirectorQualificationScene,
  role: string,
): [number, number, number] {
  if (role === "primary_subject") return [...scene.blocking.primary];
  if (role === "secondary_subject") return [...scene.blocking.secondary];
  return [...scene.blocking.context];
}

function evidenceActors(
  family: DirectorQualificationFamily,
  scene: DirectorQualificationScene,
  selected: DirectorCapability,
): DirectorRuntimeActor[] {
  const roles = directorQualificationDepthScreenAssetRoles(family, selected);
  const positions = directorQualificationAdjustDepthScreenFixturePositions({
    family,
    capability: selected,
    scene,
    positions: roles.map((role) => basePositionForRole(scene, role.role)),
  });

  return roles.map((role, index) => ({
    id: role.role,
    position: positions[index] ?? basePositionForRole(scene, role.role),
    rotation: [0, 0, 0],
    size: ROLE_SIZES[role.role] ?? [0.75, 1, 0.75],
  }));
}

function overlapFraction(
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
  const intersection = overlapWidth * overlapHeight;
  const leftArea = Math.max(0.000001, left.width_ndc * left.height_ndc);
  const rightArea = Math.max(0.000001, right.width_ndc * right.height_ndc);
  return intersection / Math.min(leftArea, rightArea);
}

function stagedSide(
  family: DirectorQualificationFamily,
  scene: DirectorQualificationScene,
  id: "screen_left" | "screen_right",
) {
  const selected = capability(id);
  const actors = evidenceActors(family, scene, selected);
  const moment = directorCapabilityDemoMoment(selected);
  const blocked = applyDirectorBlocking(moment, actors);
  const primary = projectDirectorActorCenter(
    moment,
    blocked,
    "primary_subject",
    0,
  );
  const secondary = projectDirectorActorCenter(
    moment,
    blocked,
    "secondary_subject",
    0,
  );
  const primaryEnvelope = projectDirectorActorEnvelope(
    moment,
    blocked,
    "primary_subject",
    0,
  );
  const secondaryEnvelope = projectDirectorActorEnvelope(
    moment,
    blocked,
    "secondary_subject",
    0,
  );
  assert(primary && secondary && primaryEnvelope && secondaryEnvelope, `${id} is missing projected evidence.`);
  return {
    primary,
    secondary,
    primaryEnvelope,
    secondaryEnvelope,
    overlap: overlapFraction(primaryEnvelope, secondaryEnvelope),
  };
}

function main() {
  assert(
    DIRECTOR_QUALIFICATION_FIXTURE_POLICY_VERSION ===
      "director_qualification_fixture_policy_phase1b7a11a2_v1",
    "Unexpected Depth/screen qualification fixture policy version.",
  );

  const family = depthFamily();
  const scene = sceneB();

  for (const id of [
    "foreground",
    "midground",
    "background",
    "screen_left",
    "screen_right",
  ]) {
    const roleIds = directorQualificationDepthScreenAssetRoles(
      family,
      capability(id),
    ).map((role) => role.role);
    assert(
      roleIds.join("|") === "primary_subject|secondary_subject",
      `${id} must exclude optional context from its two-actor qualification proof; got ${roleIds.join("|")}.`,
    );
  }

  const layeredRoleIds = directorQualificationDepthScreenAssetRoles(
    family,
    capability("layered_depth"),
  ).map((role) => role.role);
  assert(
    layeredRoleIds.join("|") ===
      "primary_subject|secondary_subject|context_subject",
    `layered_depth must retain all three required layers; got ${layeredRoleIds.join("|")}.`,
  );

  const rawPair: [number, number, number][] = [
    [...scene.blocking.primary],
    [...scene.blocking.secondary],
  ];
  const leftFixture = directorQualificationAdjustDepthScreenFixturePositions({
    family,
    capability: capability("screen_left"),
    scene,
    positions: rawPair,
  });
  const rightFixture = directorQualificationAdjustDepthScreenFixturePositions({
    family,
    capability: capability("screen_right"),
    scene,
    positions: rawPair,
  });
  const neutralPairCenterX =
    (scene.blocking.primary[0] + scene.blocking.secondary[0]) / 2;

  assert(
    leftFixture[0]![0] === rawPair[0]![0] &&
      leftFixture[1]![0] === rawPair[1]![0],
    "Screen Left fixture should preserve the already complementary Scene-B pair.",
  );
  assert(
    Math.abs(
      rightFixture[0]![0] -
        (neutralPairCenterX - (rawPair[0]![0] - neutralPairCenterX)),
    ) < 0.000001 &&
      Math.abs(
        rightFixture[1]![0] -
          (neutralPairCenterX - (rawPair[1]![0] - neutralPairCenterX)),
      ) < 0.000001,
    "Screen Right fixture must mirror the primary/support pair around the neutral Scene-B pair centre.",
  );

  const left = stagedSide(family, scene, "screen_left");
  const right = stagedSide(family, scene, "screen_right");

  assert(
    left.primary.ndc[0] < -0.16 && right.primary.ndc[0] > 0.16,
    `Screen-side primary bias is too weak after fixture repair: left=${left.primary.ndc[0].toFixed(3)} right=${right.primary.ndc[0].toFixed(3)}.`,
  );
  assert(
    left.secondary.ndc[0] > 0.10 && right.secondary.ndc[0] < -0.10,
    `Complementary support placement is not visually opposed: left-support=${left.secondary.ndc[0].toFixed(3)} right-support=${right.secondary.ndc[0].toFixed(3)}.`,
  );
  assert(
    right.primary.ndc[0] - left.primary.ndc[0] > 0.38,
    `Screen Left / Right primary separation is too small: ${left.primary.ndc[0].toFixed(3)} -> ${right.primary.ndc[0].toFixed(3)}.`,
  );

  for (const [label, sample] of [
    ["Screen Left", left],
    ["Screen Right", right],
  ] as const) {
    assert(
      sample.primary.visible_in_safe_frame &&
        sample.secondary.visible_in_safe_frame &&
        sample.primaryEnvelope.fully_inside_safe_frame &&
        sample.secondaryEnvelope.fully_inside_safe_frame,
      `${label} must keep both qualification actors safely framed.`,
    );
    assert(
      sample.overlap <= 0.12,
      `${label} primary/support projected overlap is too high: ${sample.overlap.toFixed(3)}.`,
    );
  }

  assert(
    left.primaryEnvelope.max_ndc_x + 0.04 <
      left.secondaryEnvelope.min_ndc_x,
    "Screen Left must preserve visible primary/support horizontal separation.",
  );
  assert(
    right.secondaryEnvelope.max_ndc_x + 0.04 <
      right.primaryEnvelope.min_ndc_x,
    "Screen Right must preserve visible primary/support horizontal separation.",
  );

  console.log(
    "Director Depth/screen qualification fixture repair Phase 1B.7A.11A.2 verification passed.",
  );
  console.log(
    `Two-actor proofs omit optional context; Screen Left/Right primary NDC ${left.primary.ndc[0].toFixed(3)} / ${right.primary.ndc[0].toFixed(3)} with overlap ${left.overlap.toFixed(3)} / ${right.overlap.toFixed(3)}; layered_depth retains three required actors.`,
  );
}

main();
