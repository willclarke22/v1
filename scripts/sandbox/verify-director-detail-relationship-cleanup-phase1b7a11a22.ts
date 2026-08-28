import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoShot,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION,
  directorQualificationAdjustDetailRelationshipFixturePositions,
  directorQualificationDetailRelationshipAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
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
    "A.11A.22 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === 181 &&
      new Set(activeIds).size === 181,
    `A.11A.22 active Qualification coverage must be 181 unique capabilities. Got ${activeIds.length}.`,
  );
  assert(
    JSON.stringify([...deferred].sort()) ===
      JSON.stringify(["cutaway", "inside_object", "macro"]),
    `A.11A.22 deferred set must be inside_object + macro + cutaway. Got ${JSON.stringify(deferred)}.`,
  );
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
  assert(
    JSON.stringify(activeDetail.capability_ids) ===
      JSON.stringify([
        "insert",
        "two_shot",
        "group_shot",
        "over_shoulder",
        "point_of_view",
      ]),
    `Active Detail & relationship family must contain five honestly provable framings. Got ${JSON.stringify(activeDetail.capability_ids)}.`,
  );

  const cutawayProfile = directorQualificationCapabilityProfile(
    frozenDetail,
    "cutaway",
  );
  assert(
    cutawayProfile.merge_compare_with_capability_id === "show_inside_outside" &&
      cutawayProfile.qualification_note?.includes("higher-order narrative/editing grammar") &&
      cutawayProfile.qualification_note?.includes("legacy framing id remains frozen"),
    "Cutaway must stay frozen for compatibility while active qualification redirects its meaning to higher-order narrative/editing grammar.",
  );

  const otsProfile = directorQualificationCapabilityProfile(
    activeDetail,
    "over_shoulder",
  );
  const povProfile = directorQualificationCapabilityProfile(
    activeDetail,
    "point_of_view",
  );
  assert(
    JSON.stringify(otsProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["character"]),
    "Over-shoulder Qualification must require a Character foreground source.",
  );
  assert(
    JSON.stringify(povProfile.suitable_primary_cast_slots) ===
      JSON.stringify(["character"]),
    "POV Qualification must keep a stable Character viewpoint source for visible proof.",
  );

  assert(
    DIRECTOR_DETAIL_RELATIONSHIP_CLEANUP_FIXTURE_POLICY_VERSION ===
      "director_detail_relationship_cleanup_fixture_policy_phase1b7a11a22_v1",
    "A.11A.22 Detail/relationship fixture-policy version mismatch.",
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
  const povRoles = directorQualificationDetailRelationshipAssetRoles(
    activeDetail,
    capability("point_of_view"),
  ).map((role) => role.role);

  assert(
    JSON.stringify(insertRoles) === JSON.stringify(["context_subject"]),
    "Insert must remain a one-target Qualification proof.",
  );
  assert(
    JSON.stringify(twoRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "Two shot must use exactly two Qualification actors.",
  );
  assert(
    JSON.stringify(groupRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
    "Group shot must use exactly three Qualification actors.",
  );
  assert(
    JSON.stringify(otsRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "Over shoulder must retain source + viewed-target Qualification roles.",
  );
  assert(
    JSON.stringify(povRoles) ===
      JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
    "POV Qualification must include source + viewed target + context reference.",
  );

  const scene = directorQualificationScene(activeDetail.recommended_scene_id);
  const rawPositions = [
    [...scene.blocking.primary] as [number, number, number],
    [...scene.blocking.secondary] as [number, number, number],
    [...scene.blocking.context] as [number, number, number],
  ];
  const twoPositions = directorQualificationAdjustDetailRelationshipFixturePositions({
    family: activeDetail,
    capability: capability("two_shot"),
    scene,
    positions: rawPositions.slice(0, 2),
    target_extents_m: [1.4, 0.9],
  });
  const twoSpan = Math.abs(twoPositions[1]![0] - twoPositions[0]![0]);
  assert(
    twoSpan >= 1.5 && twoSpan <= 2.5,
    `Two-shot Qualification pair must be compact but separated. Span=${twoSpan.toFixed(3)}.`,
  );

  const groupPositions = directorQualificationAdjustDetailRelationshipFixturePositions({
    family: activeDetail,
    capability: capability("group_shot"),
    scene,
    positions: rawPositions,
    target_extents_m: [1.4, 0.9, 0.8],
  });
  assert(
    groupPositions[0]![0] < groupPositions[2]![0] &&
      groupPositions[2]![0] < groupPositions[1]![0] &&
      groupPositions[2]![2] < groupPositions[0]![2] &&
      groupPositions[2]![2] < groupPositions[1]![2],
    `Group-shot Qualification must form a compact triangular cluster: ${JSON.stringify(groupPositions)}.`,
  );

  const povPositions = directorQualificationAdjustDetailRelationshipFixturePositions({
    family: activeDetail,
    capability: capability("point_of_view"),
    scene,
    positions: rawPositions,
    target_extents_m: [1.4, 0.9, 0.8],
  });
  assert(
    povPositions[0]![2] - povPositions[1]![2] >= 1.7 &&
      Math.abs(povPositions[2]![0] - povPositions[1]![0]) >= 0.7,
    `POV Qualification must separate the viewpoint source and provide an offset context reference: ${JSON.stringify(povPositions)}.`,
  );

  const povCapability = capability("point_of_view");
  const povQualificationCapability: DirectorCapability = {
    ...povCapability,
    demo: {
      ...povCapability.demo,
      required_visible_roles: [
        "primary_subject",
        "secondary_subject",
        "context_subject",
      ],
    },
  };
  const povShot = directorCapabilityDemoShot(povQualificationCapability);
  assert(
    JSON.stringify(povShot.composition.keep_visible_entity_ids) ===
      JSON.stringify(["secondary_subject", "context_subject"]) &&
      JSON.stringify(povShot.camera.focus_entity_ids) ===
        JSON.stringify(["secondary_subject"]) &&
      povShot.composition.foreground_entity_ids[0] === "primary_subject",
    "Qualification POV must keep the viewed target + reference visible while the camera remains sourced from primary_subject.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "insertEnvelopeFitComposition",
    "safe_half_width?: number",
    "breathing_multiplier?: number",
    "safe_half_width: 0.72",
    "safe_half_height: 0.72",
    "breathing_multiplier: 1.03",
    "safe_half_width: 0.82",
    "safe_half_height: 0.78",
    "breathing_multiplier: 1.025",
  ]) {
    assert(runtime.includes(marker), `A.11A.22 runtime marker missing: ${marker}`);
  }
  assert(
    runtime.includes(
      `: relationshipEnvelopeFitComposition\n          ? layeredDepthProjectedFitDistance(\n              samples,\n              target,\n              cameraOffsetDirection,\n              fov,\n              minimumCameraDistance,`,
    ),
    "Two-shot/Group-shot relationship fit must use the projected safe envelope without the old pair-radius minimum-distance over-pull.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "directorQualificationAdjustDetailRelationshipFixturePositions",
    'capability.id === "over_shoulder" || capability.id === "point_of_view"',
    'return candidateForSlot(pools, "character", 0);',
    '["two_shot", "group_shot", "point_of_view", "cutaway"]',
    "Cutaway is also deferred as an atomic camera framing",
    "This reel qualifies Insert, Two shot, Group shot, Over shoulder, and",
  ]) {
    assert(room.includes(marker), `A.11A.22 Qualification Room marker missing: ${marker}`);
  }

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  for (const marker of [
    "Phase 1B.7A.11A.22 — Detail & relationship framing cleanup + honest proof",
    "Active Qualification coverage is now **181 capabilities**",
    "higher-order narrative/editing grammar",
    "stable `character` foreground source",
    "third context/reference actor",
    "full production build",
  ]) {
    assert(readme.includes(marker), `A.11A.22 README marker missing: ${marker}`);
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
    `A.11A.22 must preserve Level 2 support distribution: ${JSON.stringify(supportCounts)}.`,
  );

  console.log(
    "Director Detail & relationship cleanup Phase 1B.7A.11A.22 verification passed.",
  );
  console.log(
    "Cutaway is deferred to higher-order narrative grammar; OTS/POV use truthful Character-source evidence; Insert uses projected object fit; Two/Group use compact staged relationships plus closest-safe projected camera fitting; 184/181 frozen/active taxonomy is intact.",
  );
}

main();
