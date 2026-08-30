import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  directorCapabilityDemoShot,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  directorQualificationExpectedActiveCapabilityCount,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION,
  DIRECTOR_DETAIL_RELATIONSHIP_GROUP_PROJECTION_FIXTURE_POLICY_VERSION,
  DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS,
  directorQualificationAdjustDetailRelationshipFixturePositions,
  directorQualificationDetailRelationshipAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  type DirectorProjectedActorEnvelope,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

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

function horizontalOverlapFraction(
  left: DirectorProjectedActorEnvelope,
  right: DirectorProjectedActorEnvelope,
) {
  const overlap = Math.max(
    0,
    Math.min(left.max_ndc_x, right.max_ndc_x) -
      Math.max(left.min_ndc_x, right.min_ndc_x),
  );
  return overlap / Math.max(0.001, Math.min(left.width_ndc, right.width_ndc));
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const deferred = [
    ...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  ] as readonly string[];

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.23 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === directorQualificationExpectedActiveCapabilityCount(DIRECTOR_CAPABILITIES) &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.23 successor coverage must equal the centralized live Qualification-active count. Got ${activeIds.length} active / ${deferred.length} deferred.`,
  );
  for (const id of ["cutaway", "inside_object", "macro", "point_of_view"]) {
    assert(
      deferred.includes(id),
      `A.11A.23 lineage requires ${id} to remain represented in the live deferred set unless a successor phase explicitly supersedes this verifier.`,
    );
  }
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  const frozenDetail = frozenFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
  const activeDetail = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
  assert(frozenDetail && activeDetail, "Detail & relationship framing family is missing.");
  assert(
    JSON.stringify(frozenDetail.capability_ids) ===
      JSON.stringify([
        "macro",
        "insert",
        "two_shot",
        "group_shot",
        "over_shoulder",
        "point_of_view",
        "cutaway",
      ]),
    `Frozen Detail & relationship family changed unexpectedly: ${JSON.stringify(frozenDetail.capability_ids)}.`,
  );
  const expectedActiveDetailIds = frozenDetail.capability_ids.filter(
    (id) => !deferred.includes(id),
  );
  assert(
    JSON.stringify(activeDetail.capability_ids) === JSON.stringify(expectedActiveDetailIds),
    `A.11A.23 active Detail & relationship membership must mirror the live deferred set. Got ${JSON.stringify(activeDetail.capability_ids)} expected ${JSON.stringify(expectedActiveDetailIds)}.`,
  );

  const povProfile = directorQualificationCapabilityProfile(
    frozenDetail,
    "point_of_view",
  );
  assert(
    JSON.stringify(povProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["character"]) &&
      povProfile.merge_compare_with_capability_id === null &&
      povProfile.qualification_note?.includes("semantic viewpoint anchor") &&
      povProfile.qualification_note?.includes("trustworthy forward axis") &&
      povProfile.qualification_note?.includes("frozen legacy POV id remains executable"),
    "POV must remain frozen/executable while active qualification waits for semantic viewpoint metadata.",
  );

  const cutawayProfile = directorQualificationCapabilityProfile(
    frozenDetail,
    "cutaway",
  );
  assert(
    cutawayProfile.merge_compare_with_capability_id === "show_inside_outside",
    "A.11A.23 must preserve the A.11A.22 Cutaway higher-order merge direction.",
  );

  const otsProfile = directorQualificationCapabilityProfile(
    activeDetail,
    "over_shoulder",
  );
  assert(
    JSON.stringify(otsProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["character"]),
    "A.11A.23 must preserve the qualified Character-only OTS evidence restriction.",
  );

  assert(
    DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION ===
      "director_detail_relationship_cleanup_fixture_policy_phase1b7a11a22_v1",
    "A.11A.23 must preserve the A.11A.22 cleanup policy boundary.",
  );
  assert(
    DIRECTOR_DETAIL_RELATIONSHIP_GROUP_PROJECTION_FIXTURE_POLICY_VERSION ===
      "director_detail_relationship_group_projection_fixture_policy_phase1b7a11a23_v1",
    "A.11A.23 Group-shot projection fixture-policy version mismatch.",
  );

  const [viewRightX, viewRightY, viewRightZ] =
    DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS;
  assert(
    Math.abs(viewRightX - Math.SQRT1_2) < 1e-9 &&
      viewRightY === 0 &&
      Math.abs(viewRightZ + Math.SQRT1_2) < 1e-9,
    `Group-shot qualification view-right basis drifted: ${JSON.stringify(DIRECTOR_DETAIL_RELATIONSHIP_GROUP_VIEW_RIGHT_BASIS)}.`,
  );

  const insertRoles = directorQualificationDetailRelationshipAssetRoles(
    activeDetail,
    capability("insert"),
  ).map((role) => role.role);
  const twoRoles = directorQualificationDetailRelationshipAssetRoles(
    activeDetail,
    capability("two_shot"),
  ).map((role) => role.role);
  const groupRoles = directorQualificationDetailRelationshipAssetRoles(
    activeDetail,
    capability("group_shot"),
  ).map((role) => role.role);
  const otsRoles = directorQualificationDetailRelationshipAssetRoles(
    activeDetail,
    capability("over_shoulder"),
  ).map((role) => role.role);
  assert(
    JSON.stringify(insertRoles) === JSON.stringify(["context_subject"]),
    "Insert Qualification role contract regressed.",
  );
  assert(
    JSON.stringify(twoRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "Two-shot Qualification role contract regressed.",
  );
  assert(
    JSON.stringify(groupRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
    "Group-shot Qualification must retain exactly three actors.",
  );
  assert(
    JSON.stringify(otsRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "Over-shoulder Qualification role contract regressed.",
  );

  const groupShot = directorCapabilityDemoShot(capability("group_shot"));
  assert(
    groupShot.composition.angle === "three_quarter_front" &&
      JSON.stringify(groupShot.camera.focus_entity_ids) ===
        JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
    "A.11A.23 projection-aware fixture is calibrated to the unchanged three-quarter-front three-actor Group-shot demo.",
  );

  const scene = directorQualificationScene(activeDetail.recommended_scene_id);
  const rawPositions = [
    [...scene.blocking.primary] as [number, number, number],
    [...scene.blocking.secondary] as [number, number, number],
    [...scene.blocking.context] as [number, number, number],
  ];
  const groupPositions = directorQualificationAdjustDetailRelationshipFixturePositions({
    family: activeDetail,
    capability: capability("group_shot"),
    scene,
    positions: rawPositions,
    target_extents_m: [1.7, 0.95, 0.82],
  });

  const viewRightCoordinate = (position: [number, number, number]) =>
    position[0] * viewRightX + position[2] * viewRightZ;
  const primaryViewX = viewRightCoordinate(groupPositions[0]!);
  const secondaryViewX = viewRightCoordinate(groupPositions[1]!);
  const contextViewX = viewRightCoordinate(groupPositions[2]!);
  assert(
    primaryViewX + 1.1 < contextViewX &&
      contextViewX + 1.1 < secondaryViewX,
    `Group-shot fixture must be left/centre/right on the camera view plane: ${JSON.stringify(groupPositions)}.`,
  );

  const actors: DirectorRuntimeActor[] = [
    {
      id: "primary_subject",
      position: [...groupPositions[0]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.94, 1.7, 0.46],
    },
    {
      id: "secondary_subject",
      position: [...groupPositions[1]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.86, 0.95, 0.82],
    },
    {
      id: "context_subject",
      position: [...groupPositions[2]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.72, 0.82, 0.58],
    },
  ];
  const moment = directorCapabilityDemoMoment(capability("group_shot"));
  const projected = actors.map((actor) => {
    const center = projectDirectorActorCenter(moment, actors, actor.id, 0.5);
    const envelope = projectDirectorActorEnvelope(moment, actors, actor.id, 0.5);
    assert(center && envelope, `Could not project Group-shot actor ${actor.id}.`);
    return { actor, center, envelope };
  });

  const primary = projected[0]!;
  const secondary = projected[1]!;
  const context = projected[2]!;
  assert(
    primary.envelope.fully_inside_safe_frame &&
      secondary.envelope.fully_inside_safe_frame &&
      context.envelope.fully_inside_safe_frame,
    `Projected Group-shot envelopes must all remain in the safe frame: ${JSON.stringify(projected.map((entry) => entry.envelope))}.`,
  );
  assert(
    primary.center.ndc[0] + 0.28 < context.center.ndc[0] &&
      context.center.ndc[0] + 0.28 < secondary.center.ndc[0],
    `Projected Group-shot centres must remain distinctly left/centre/right: ${projected.map((entry) => `${entry.actor.id}=${entry.center.ndc[0].toFixed(3)}`).join(", ")}.`,
  );
  assert(
    horizontalOverlapFraction(primary.envelope, context.envelope) <= 0.15 &&
      horizontalOverlapFraction(context.envelope, secondary.envelope) <= 0.15 &&
      horizontalOverlapFraction(primary.envelope, secondary.envelope) <= 0.05,
    `Projected Group-shot actors overlap too heavily: ${JSON.stringify({
      primary_context: horizontalOverlapFraction(primary.envelope, context.envelope),
      context_secondary: horizontalOverlapFraction(context.envelope, secondary.envelope),
      primary_secondary: horizontalOverlapFraction(primary.envelope, secondary.envelope),
    })}.`,
  );
  assert(
    projected.every((entry) => entry.envelope.screen_area_fraction >= 0.02),
    `Projected Group-shot actors became too small to read: ${projected.map((entry) => `${entry.actor.id}=${entry.envelope.screen_area_fraction.toFixed(3)}`).join(", ")}.`,
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "relationshipEnvelopeFitComposition",
    '["two_shot", "group_shot", "cutaway"].includes(shot.composition.framing)',
    "safe_half_width: 0.82",
    "safe_half_height: 0.78",
    "breathing_multiplier: 1.025",
  ]) {
    assert(runtime.includes(marker), `A.11A.22 projected camera-fit canary missing: ${marker}`);
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
    `A.11A.23 must preserve Level 2 support distribution: ${JSON.stringify(supportCounts)}.`,
  );

  console.log(
    "Director Detail & relationship closeout Phase 1B.7A.11A.23 verification passed.",
  );
  console.log(
    `Frozen/active taxonomy: 184/${activeIds.length}. A.11A.23 POV/Group-shot invariants remain intact under ${deferred.length} live deferrals; projected centres are ${projected.map((entry) => entry.center.ndc[0].toFixed(3)).join(" / ")}.`,
  );
}

main();
