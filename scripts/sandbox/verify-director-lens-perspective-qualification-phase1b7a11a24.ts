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
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_LENS_PERSPECTIVE_CAMERA_DEPTH_BASIS,
  DIRECTOR_LENS_PERSPECTIVE_CAPABILITY_IDS,
  DIRECTOR_LENS_PERSPECTIVE_FIXTURE_POLICY_VERSION,
  DIRECTOR_LENS_PERSPECTIVE_VIEW_RIGHT_BASIS,
  directorQualificationAdjustLensPerspectiveFixturePositions,
  directorQualificationLensPerspectiveAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import { directorQualificationScene } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  projectDirectorActorEnvelope,
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

const ACTIVE_LENS_IDS = [
  "lens_ultra_wide",
  "lens_wide",
  "lens_normal",
  "lens_portrait",
  "lens_telephoto",
] as const;

const EXPECTED_FOV: Record<(typeof ACTIVE_LENS_IDS)[number], number> = {
  lens_ultra_wide: 72,
  lens_wide: 58,
  lens_normal: 44,
  lens_portrait: 34,
  lens_telephoto: 24,
};

function qualificationLensCapability(
  id: (typeof ACTIVE_LENS_IDS)[number],
  positions: [number, number, number][],
): DirectorCapability {
  const base = capability(id);
  const roleIds = ["primary_subject", "secondary_subject", "context_subject"];
  return {
    ...base,
    demo: {
      ...base.demo,
      required_visible_roles: roleIds,
      blocking: roleIds.map((role, index) => ({
        role,
        position: [...positions[index]!] as [number, number, number],
        rotation: [0, 0, 0],
        target_extent_m: 1.2,
      })),
    },
  };
}

function main() {
  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenIds = frozenFamilies.flatMap((family) => family.capability_ids);
  const activeIds = activeFamilies.flatMap((family) => family.capability_ids);
  const deferred: string[] = [...DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS].sort();

  assert(
    DIRECTOR_CAPABILITIES.length === 184 &&
      frozenFamilies.length === 33 &&
      frozenIds.length === 184 &&
      new Set(frozenIds).size === 184,
    "A.11A.24 must preserve the frozen 184-capability / 33-family Director taxonomy.",
  );
  assert(
    activeFamilies.length === 33 &&
      activeIds.length === DIRECTOR_CAPABILITIES.length - deferred.length &&
      new Set(activeIds).size === activeIds.length,
    `A.11A.24 successor compatibility requires active coverage to derive from the live deferred set. Active=${activeIds.length}, deferred=${deferred.length}.`,
  );
  for (const id of [
    "cutaway",
    "focus_deep",
    "focus_shallow",
    "inside_object",
    "lens_macro",
    "macro",
    "point_of_view",
  ]) {
    assert(
      deferred.includes(id),
      `A.11A.24 lineage requires ${id} to remain deferred. Got ${JSON.stringify(deferred)}.`,
    );
  }
  for (const id of deferred) {
    assert(!activeIds.includes(id), `Deferred capability leaked into active Qualification: ${id}.`);
    assert(frozenIds.includes(id), `Deferred capability disappeared from frozen taxonomy: ${id}.`);
  }

  // Carry forward the closed Detail & relationship family without rerunning its
  // historical 180-count acceptance verifier.
  const activeDetail = activeFamilies.find(
    (family) =>
      family.category === "camera_framing" &&
      family.group === "Detail & relationship framing",
  );
  assert(activeDetail, "Active Detail & relationship family is missing.");
  assert(
    JSON.stringify(activeDetail.capability_ids) ===
      JSON.stringify(["insert", "two_shot", "group_shot", "over_shoulder"]),
    `Qualified Detail & relationship subset regressed: ${JSON.stringify(activeDetail.capability_ids)}.`,
  );

  const frozenLens = frozenFamilies.find(
    (family) => family.category === "camera_framing" && family.group === "Lens",
  );
  const activeLens = activeFamilies.find(
    (family) => family.category === "camera_framing" && family.group === "Lens",
  );
  assert(frozenLens && activeLens, "Lens family is missing from qualification taxonomy.");
  assert(
    JSON.stringify(frozenLens.capability_ids) ===
      JSON.stringify([
        "lens_ultra_wide",
        "lens_wide",
        "lens_normal",
        "lens_portrait",
        "lens_telephoto",
        "lens_macro",
        "focus_shallow",
        "focus_deep",
      ]),
    `Frozen Lens membership changed unexpectedly: ${JSON.stringify(frozenLens.capability_ids)}.`,
  );
  assert(
    JSON.stringify(activeLens.capability_ids) === JSON.stringify(ACTIVE_LENS_IDS),
    `Active Lens reel must contain only five conventional focal-length presets. Got ${JSON.stringify(activeLens.capability_ids)}.`,
  );

  for (const id of ACTIVE_LENS_IDS) {
    const profile = directorQualificationCapabilityProfile(frozenLens, id);
    assert(
      JSON.stringify(profile.suitable_primary_cast_slots) === JSON.stringify(["character"]) &&
        profile.comparison_group === null &&
        profile.qualification_note?.includes("same three assets") &&
        profile.qualification_note?.includes("near/mid/far"),
      `${id} must use the controlled same-cast lens perspective profile.`,
    );
  }
  const macroProfile = directorQualificationCapabilityProfile(frozenLens, "lens_macro");
  assert(
    macroProfile.merge_compare_with_capability_id === "macro" &&
      macroProfile.qualification_note?.includes("close-focus") &&
      macroProfile.qualification_note?.includes("magnification"),
    "Macro lens must remain frozen/deferred as a future Macro-framing merge candidate.",
  );
  for (const id of ["focus_shallow", "focus_deep"]) {
    const profile = directorQualificationCapabilityProfile(frozenLens, id);
    assert(
      profile.qualification_note?.includes("Depth-of-field qualification is deferred as a pair") &&
        profile.qualification_note?.includes("aperture blur"),
      `${id} must remain honestly deferred until rendered DOF exists.`,
    );
  }

  assert(
    DIRECTOR_LENS_PERSPECTIVE_FIXTURE_POLICY_VERSION ===
      "director_lens_perspective_fixture_policy_phase1b7a11a24_v1",
    "A.11A.24 Lens perspective fixture policy version mismatch.",
  );
  assert(
    JSON.stringify(DIRECTOR_LENS_PERSPECTIVE_CAPABILITY_IDS) ===
      JSON.stringify(ACTIVE_LENS_IDS),
    "A.11A.24 Lens perspective capability set drifted.",
  );

  for (const id of ACTIVE_LENS_IDS) {
    const roles = directorQualificationLensPerspectiveAssetRoles(
      activeLens,
      capability(id),
    ).map((role) => role.role);
    assert(
      JSON.stringify(roles) ===
        JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
      `${id} qualification must retain the exact near/mid/far three-role proof.`,
    );
  }

  const scene = directorQualificationScene(activeLens.recommended_scene_id);
  const rawPositions = [
    [...scene.blocking.primary] as [number, number, number],
    [...scene.blocking.secondary] as [number, number, number],
    [...scene.blocking.context] as [number, number, number],
  ];
  const positions = directorQualificationAdjustLensPerspectiveFixturePositions({
    family: activeLens,
    capability: capability("lens_normal"),
    scene,
    positions: rawPositions,
    target_extents_m: [1.2, 1.2, 1.2],
  });

  const [depthX, , depthZ] = DIRECTOR_LENS_PERSPECTIVE_CAMERA_DEPTH_BASIS;
  const [rightX, , rightZ] = DIRECTOR_LENS_PERSPECTIVE_VIEW_RIGHT_BASIS;
  const depthCoordinate = (position: [number, number, number]) =>
    position[0] * depthX + position[2] * depthZ;
  const rightCoordinate = (position: [number, number, number]) =>
    position[0] * rightX + position[2] * rightZ;
  const nearDepth = depthCoordinate(positions[0]!);
  const midDepth = depthCoordinate(positions[1]!);
  const farDepth = depthCoordinate(positions[2]!);
  assert(
    nearDepth > midDepth + 1.4 && midDepth > farDepth + 1.4,
    `Lens fixture must create strong ordered near/mid/far camera depth: ${nearDepth.toFixed(3)} / ${midDepth.toFixed(3)} / ${farDepth.toFixed(3)}.`,
  );
  assert(
    rightCoordinate(positions[0]!) + 0.6 < rightCoordinate(positions[1]!) &&
      rightCoordinate(positions[1]!) + 0.6 < rightCoordinate(positions[2]!),
    `Lens fixture must retain restrained lateral silhouette separation: ${positions.map((position) => rightCoordinate(position).toFixed(3)).join(" / ")}.`,
  );

  const actors: DirectorRuntimeActor[] = [
    {
      id: "primary_subject",
      position: [...positions[0]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.8, 1.2, 0.72],
    },
    {
      id: "secondary_subject",
      position: [...positions[1]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.8, 1.2, 0.72],
    },
    {
      id: "context_subject",
      position: [...positions[2]!] as [number, number, number],
      rotation: [0, 0, 0],
      size: [0.8, 1.2, 0.72],
    },
  ];

  const ratios: number[] = [];
  for (const id of ACTIVE_LENS_IDS) {
    const qualifiedCapability = qualificationLensCapability(id, positions);
    const shot = directorCapabilityDemoShot(qualifiedCapability);
    assert(
      shot.lens.field_of_view_degrees === EXPECTED_FOV[id],
      `${id} FOV changed unexpectedly: ${shot.lens.field_of_view_degrees}.`,
    );
    assert(
      JSON.stringify(shot.composition.keep_visible_entity_ids) ===
        JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]) &&
        JSON.stringify(shot.camera.focus_entity_ids) ===
          JSON.stringify(["primary_subject", "secondary_subject", "context_subject"]),
      `${id} qualification clone must focus the same three depth references.`,
    );

    const moment = directorCapabilityDemoMoment(qualifiedCapability);
    const nearEnvelope = projectDirectorActorEnvelope(
      moment,
      actors,
      "primary_subject",
      0.5,
    );
    const midEnvelope = projectDirectorActorEnvelope(
      moment,
      actors,
      "secondary_subject",
      0.5,
    );
    const farEnvelope = projectDirectorActorEnvelope(
      moment,
      actors,
      "context_subject",
      0.5,
    );
    assert(nearEnvelope && midEnvelope && farEnvelope, `${id} projection evidence is missing.`);
    assert(
      nearEnvelope.fully_inside_safe_frame &&
        midEnvelope.fully_inside_safe_frame &&
        farEnvelope.fully_inside_safe_frame,
      `${id} must keep all three controlled depth actors fully inside the safe frame.`,
    );
    assert(
      [nearEnvelope, midEnvelope, farEnvelope].every(
        (envelope) => envelope.screen_area_fraction >= 0.008,
      ),
      `${id} made a controlled depth actor too small to judge.`,
    );
    const ratio = nearEnvelope.height_ndc / Math.max(0.001, farEnvelope.height_ndc);
    ratios.push(ratio);
  }

  for (let index = 1; index < ratios.length; index += 1) {
    assert(
      ratios[index - 1]! > ratios[index]! + 0.015,
      `Lens perspective compression must increase monotonically toward telephoto. Ratios: ${ratios.map((value) => value.toFixed(3)).join(" / ")}.`,
    );
  }
  assert(
    ratios[0]! > ratios[ratios.length - 1]! + 0.12,
    `Ultra-wide versus Telephoto perspective separation is too weak: ${ratios.map((value) => value.toFixed(3)).join(" / ")}.`,
  );

  // The ordinary frozen demo remains the historical two-actor comparison; the
  // three-role depth proof is Qualification-only via required_visible_roles.
  const ordinaryNormal = directorCapabilityDemoShot(capability("lens_normal"));
  assert(
    JSON.stringify(ordinaryNormal.composition.keep_visible_entity_ids) ===
      JSON.stringify(["primary_subject", "secondary_subject"]),
    "A.11A.24 must not globally rewrite the ordinary frozen Lens demo into a three-actor shot.",
  );

  const fidelity = source(
    "sandbox/probe-lab/motion-camera-library/director-camera-fidelity.ts",
  );
  assert(
    fidelity.includes("The current Three.js preview does not simulate production depth-of-field blur."),
    "Shallow-focus deferral must remain grounded in the existing browser-renderer limitation.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "perspectiveCompensation = 44 / fov",
    "new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200)",
    "relationshipEnvelopeFitComposition",
  ]) {
    assert(runtime.includes(marker), `Lens qualification depends on unchanged camera-runtime marker: ${marker}`);
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "chooseLensPerspectivePrimaryAsset",
    "chooseLensPerspectiveSupportingAsset",
  ]) {
    assert(room.includes(marker), `A.11A.24 Qualification Room structural hook missing: ${marker}`);
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
    `A.11A.24 must preserve Level 2 support distribution: ${JSON.stringify(supportCounts)}.`,
  );

  console.log("Director Lens perspective Phase 1B.7A.11A.24 verification passed.");
  console.log(
    `Frozen/active taxonomy: 184/${activeIds.length}. Active Lens near/far ratios: ${ratios.map((value) => value.toFixed(3)).join(" / ")}. Macro lens and DOF pair remain frozen/deferred under successor phases.`,
  );
}

main();
