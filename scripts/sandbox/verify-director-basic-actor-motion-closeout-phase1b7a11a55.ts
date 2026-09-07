import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityObjectMotionCompound,
  isDirectorQualificationCapabilityObjectMotionModifier,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_BASIC_ACTOR_MOTION_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustBasicActorMotionFixturePositions,
  directorQualificationAssetRoles,
  isBasicActorMotionQualificationFamily,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import { defaultQualificationNormalizationPolicy } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-normalization";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";

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

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.55 must preserve the frozen 184-capability compatibility vocabulary.",
  );

  const frozenFamily = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(frozenFamily, "A.11A.55 must preserve the frozen Basic actor motion family.");
  assert(activeFamily, "A.11A.55 must keep Basic actor motion active after reduction.");
  assert(
    activeFamilies.length === 32,
    `A.11A.55 should preserve the 32 active-family count; found ${activeFamilies.length}.`,
  );

  const frozenExpected = [
    "translate",
    "rotate",
    "pivot",
    "oscillate",
    "follow_path",
    "enter_frame",
    "exit_frame",
    "move_toward",
    "move_away",
    "follow_target",
    "align",
    "aim_at",
  ];
  const activeCoreExpected = [
    "translate",
    "rotate",
    "follow_path",
    "enter_frame",
    "exit_frame",
    "move_toward",
    "move_away",
  ];
  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.55 frozen Basic actor motion membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );
  for (const id of activeCoreExpected) {
    assert(
      activeFamily.capability_ids.includes(id),
      `A.11A.55 frozen visual primitive ${id} disappeared from active Basic actor motion.`,
    );
  }
  const allowedSuccessorActiveIds = new Set([
    ...activeCoreExpected,
    "follow_target",
  ]);
  assert(
    activeFamily.capability_ids.every((id) => allowedSuccessorActiveIds.has(id)),
    `A.11A.55 successor state reintroduced an excluded Basic actor motion capability: ${activeFamily.capability_ids.join("|")}`,
  );

  assert(
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS.join("|") ===
      "oscillate",
    "A.11A.55 must classify Oscillate as the Basic actor motion temporal modifier.",
  );
  for (const id of ["pivot", "align", "aim_at"]) {
    assert(
      (
        DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS as readonly string[]
      ).includes(id),
      `A.11A.55 must preserve ${id} as an authored-semantic compound.`,
    );
    assert(
      isDirectorQualificationCapabilityObjectMotionCompound(id),
      `A.11A.55 ${id} must be excluded from independent active Qualification as a compound.`,
    );
    assert(capability(id), `A.11A.55 must preserve ${id} in the Director vocabulary.`);
  }
  assert(
    isDirectorQualificationCapabilityObjectMotionModifier("oscillate"),
    "A.11A.55 Oscillate must be excluded from independent active Qualification as a modifier.",
  );
  assert(
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID.pivot.join("|") ===
      "rotate" &&
      DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID.align.join("|") ===
        "rotate" &&
      DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID.aim_at.join("|") ===
        "rotate",
    "A.11A.55 compound mapping must preserve Rotate as the reusable orientation primitive.",
  );

  const pivotProfile = directorQualificationCapabilityProfile(
    frozenFamily,
    "pivot",
  );
  const aimProfile = directorQualificationCapabilityProfile(
    frozenFamily,
    "aim_at",
  );
  assert(
    pivotProfile.merge_compare_with_capability_id === "rotate" &&
      pivotProfile.qualification_note?.includes("authored contact/hinge anchor"),
    "A.11A.55 Pivot profile must document the authored-anchor dependency and Rotate comparison.",
  );
  assert(
    aimProfile.requires_directional_facing &&
      aimProfile.qualification_note?.includes("semantic visual-forward axis"),
    "A.11A.55 Aim at profile must document the semantic forward-axis requirement.",
  );

  assert(
    defaultQualificationNormalizationPolicy({
      category: "object_motion",
      group: "Basic actor motion",
    }) === "presentation_normalized",
    "A.11A.55 Baseline/Diversity Basic actor motion must use presentation normalization.",
  );
  assert(
    defaultQualificationNormalizationPolicy({
      category: "object_motion",
      group: "Rigid mechanics",
    }) === "physical_context",
    "A.11A.55 must not globally erase physical-context object-motion normalization.",
  );

  assert(
    DIRECTOR_BASIC_ACTOR_MOTION_FIXTURE_POLICY_VERSION ===
      "director_basic_actor_motion_fixture_policy_phase1b7a11a55_v1",
    "A.11A.55 Basic actor motion fixture policy version drifted.",
  );
  assert(
    isBasicActorMotionQualificationFamily(activeFamily),
    "A.11A.55 family classifier must recognize the active Basic actor motion family.",
  );
  const translateRoles = directorQualificationAssetRoles(
    activeFamily,
    capability("translate"),
  );
  const enterRoles = directorQualificationAssetRoles(
    activeFamily,
    capability("enter_frame"),
  );
  assert(
    translateRoles.map((role) => role.role).join("|") === "primary_subject",
    "A.11A.55 Translate should remain a clean single-actor proof.",
  );
  assert(
    enterRoles.map((role) => role.role).join("|") ===
      "primary_subject|secondary_subject",
    "A.11A.55 Enter frame needs a stationary reference actor for a stable boundary proof.",
  );
  if (activeFamily.capability_ids.includes("follow_target")) {
    const followRoles = directorQualificationAssetRoles(
      activeFamily,
      capability("follow_target"),
    );
    assert(
      followRoles.map((role) => role.role).join("|") ===
        "primary_subject|secondary_subject",
      "A.11A.55 original Follow target proof must render both leader and follower while it remains independently active.",
    );
  }

  const scene = directorQualificationScene("scene_d_travelling_subject");
  const moveTowardPositions = directorQualificationAdjustBasicActorMotionFixturePositions({
    family: activeFamily,
    capability: capability("move_toward"),
    scene,
    positions: [
      [...scene.blocking.primary],
      [...scene.blocking.secondary],
    ],
  });
  const towardGap = Math.hypot(
    moveTowardPositions[1]![0] - moveTowardPositions[0]![0],
    moveTowardPositions[1]![2] - moveTowardPositions[0]![2],
  );
  assert(
    towardGap > 2.5 && towardGap < 2.9,
    `A.11A.55 Move toward opening gap should be a readable ~2.7m pair; found ${towardGap}.`,
  );
  const enterPositions = directorQualificationAdjustBasicActorMotionFixturePositions({
    family: activeFamily,
    capability: capability("enter_frame"),
    scene,
    positions: [
      [...scene.blocking.primary],
      [...scene.blocking.secondary],
    ],
  });
  assert(
    Math.hypot(enterPositions[0]![0], enterPositions[0]![2]) > 4.1 &&
      Math.hypot(enterPositions[1]![0], enterPositions[1]![2]) < 0.01,
    "A.11A.55 Enter frame fixture must start the primary well outside a center-framed reference.",
  );

  const previewSource = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const roomSource = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const normalizationSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-normalization.ts",
  );
  for (const marker of [
    "basicActorMotionIds",
    "target_position: offsetRight(primaryStart, 3.45)",
    "target_position: offsetRight(primaryStart, 5.0)",
    "Boundary clips frame a",
  ]) {
    assert(
      previewSource.includes(marker),
      `A.11A.55 Qualification preview repair marker missing: ${marker}`,
    );
  }
  if (activeFamily.capability_ids.includes("follow_target")) {
    for (const marker of [
      "target_position: offsetRight(secondaryStart, 2.2)",
      "offset: subtract(primaryStart, secondaryStart)",
    ]) {
      assert(
        previewSource.includes(marker),
        `A.11A.55 original Follow target preview marker missing while Follow target remains independently active: ${marker}`,
      );
    }
  }
  assert(
    roomSource.includes("directorQualificationAdjustBasicActorMotionFixturePositions") &&
      roomSource.includes("basicActorMotionEvidence") &&
      roomSource.includes('passKind === "physical_stress"') &&
      roomSource.includes('? "physical_context"'),
    "A.11A.55 Room must route Basic actor motion through its fixture policy while retaining physical-stress scale truth.",
  );
  assert(
    normalizationSource.includes('input.group === "Basic actor motion"') &&
      normalizationSource.includes('return "presentation_normalized"'),
    "A.11A.55 normalization source must explicitly protect Basic actor motion readability.",
  );

  console.log(
    `A.11A.55 successor-safe Basic actor motion verification passed: 184 vocabulary entries preserved; seven frozen visual primitives remain active; Pivot/Align/Aim at remain authored-semantic compounds; Oscillate remains a temporal modifier; Follow target may be independently active or intentionally closed by a later semantic successor; readability repairs and physical-stress truth remain protected.`,
  );
}

main();
