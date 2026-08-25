import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoShot,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_SUPPORT_CONTAINMENT_FIXTURE_POLICY_VERSION,
  directorQualificationSupportContainmentAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import type {
  AssetDirectabilityProfileV1,
} from "../../sandbox/probe-lab/directability/asset-directability-contract";
import {
  resolveDirectorPhysicalBlockingPlacement,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";
import type {
  DirectorShotDirectionV2,
} from "../../sandbox/probe-lab/director";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(left: number, right: number, epsilon = 1e-4) {
  return Math.abs(left - right) <= epsilon;
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

function supportFamily() {
  const found = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES).find(
    (family) =>
      family.category === "blocking_placement" &&
      family.group === "Support & containment",
  );
  assert(found, "Support & containment qualification family is missing.");
  return found;
}

function emptyProfile(assetId: string): AssetDirectabilityProfileV1 {
  return {
    schema_version: "myway_asset_directability_profile_v1",
    directability_version: "director_asset_directability_phase1b5_v1",
    asset_id: assetId,
    coordinate_space: "normalized_glb_y_up",
    local_bounds_size: [1, 1.5, 1],
    orientation: {
      up_axis: [0, 1, 0],
      forward_axis: [0, 0, 1],
      source: "geometry_profile",
      confidence: 0.95,
    },
    anchors: [
      {
        id: "bottom_contact",
        semantic_names: ["bottom_contact", "ground_contact"],
        kind: "contact",
        local_position: [0, 0, 0],
        local_normal: [0, 1, 0],
        target_scope: "root",
        subpart_id: null,
        source: "geometry_profile",
        confidence: 0.95,
      },
    ],
    pivots: [],
    surfaces: [],
    containment_regions: [],
    subparts: [],
    rolling: null,
    rig: {
      rigged: false,
      available_clips: [],
      bone_map: {},
      clip_map: {},
      source: "asset_metadata",
      confidence: 0.25,
    },
    diagnostics: {
      geometry_profile_available: true,
      geometry_profile_audit_status: "measured",
      feature_kinds: ["orientation", "anchors"],
      warnings: [],
    },
  };
}

function actor(
  id: string,
  size: [number, number, number],
  directability: AssetDirectabilityProfileV1 | null,
  position: [number, number, number] = [0, 0, 0],
): DirectorRuntimeActor {
  return {
    id,
    position,
    rotation: [0, 0, 0],
    size,
    directability,
  };
}

function cue(
  relation: "on_surface" | "inside" | "attached_to",
): DirectorShotDirectionV2["blocking"][number] {
  return {
    relation,
    actor_entity_id: "primary_subject",
    target_entity_id: "secondary_subject",
    screen_region: null,
    preserve_clearance: true,
    parameters: { physical_region_required: true },
  };
}

function main() {
  assert(
    DIRECTOR_SUPPORT_CONTAINMENT_FIXTURE_POLICY_VERSION ===
      "director_support_containment_fixture_policy_phase1b7a11a7_v1",
    "Unexpected Support & containment fixture policy version.",
  );

  const family = supportFamily();
  assert(
    family.normalization_policy === "physical_context",
    "Support & containment must retain physical-context sizing.",
  );

  const expectedRoleCounts: Record<string, number> = {
    on_ground: 1,
    on_surface: 2,
    attached_to: 2,
    inside: 2,
  };
  for (const [id, expected] of Object.entries(expectedRoleCounts)) {
    const roles = directorQualificationSupportContainmentAssetRoles(
      family,
      capability(id),
    );
    assert(
      roles.length === expected,
      `${id} qualification should use ${expected} physical proof actor(s), got ${roles.length}.`,
    );
  }

  for (const id of ["on_surface", "attached_to", "inside"]) {
    const profile = directorQualificationCapabilityProfile(family, id);
    assert(
      profile.suitable_primary_cast_slots.includes("small_detail") &&
        !profile.suitable_primary_cast_slots.includes("furniture"),
      `${id} should cast a compact source rather than a furniture-sized primary.`,
    );
    const shot = directorCapabilityDemoShot(capability(id));
    assert(
      shot.composition.keep_visible_entity_ids.join("|") ===
        "primary_subject|secondary_subject" &&
        shot.camera.focus_entity_ids.includes("primary_subject") &&
        shot.camera.focus_entity_ids.includes("secondary_subject"),
      `${id} physical proof must frame both source and receiver.`,
    );
  }

  const cup = actor("primary_subject", [0.18, 0.28, 0.18], emptyProfile("cup"), [-1.4, 0, 0]);

  const chairProfile = emptyProfile("chair");
  chairProfile.local_bounds_size = [1.0, 1.5, 1.0];
  chairProfile.surfaces = [
    {
      id: "backrest_top",
      semantic_names: ["backrest_top", "support_surface", "top_surface"],
      local_center: [0, 1.45, -0.36],
      normal: [0, 1, 0],
      size: [0.72, 0.08],
      source: "geometry_profile",
      confidence: 0.98,
      usable_size: [0.72, 0.06],
      blocked_fraction: 0.12,
      exposure: "exterior",
      orientation: "upward",
      openness: "open",
      vertical_rank: 0,
      clearance_above_m: null,
    },
    {
      id: "seat",
      semantic_names: ["seat", "support_surface", "top_surface"],
      local_center: [0, 0.56, 0.02],
      normal: [0, 1, 0],
      size: [0.72, 0.62],
      source: "geometry_profile",
      confidence: 0.94,
      usable_size: [0.66, 0.56],
      blocked_fraction: 0.02,
      exposure: "exterior",
      orientation: "upward",
      openness: "open",
      vertical_rank: 1,
      clearance_above_m: null,
    },
  ];
  chairProfile.diagnostics.feature_kinds.push("surfaces");
  const chair = actor("secondary_subject", [1.0, 1.5, 1.0], chairProfile, [1.25, 0, 0]);

  const chairSurface = resolveDirectorPhysicalBlockingPlacement(
    cue("on_surface"),
    [cup, chair],
  );
  assert(chairSurface?.status === "resolved", "Chair On Surface should resolve.");
  assert(
    chairSurface.region_id === "seat",
    `Chair On Surface must select the usable seat instead of the bounds/backrest top; got ${chairSurface.region_id}.`,
  );
  assert(
    chairSurface.position && chairSurface.position[1] < 0.75,
    `Chair surface placement is still using whole-object height: ${chairSurface.position?.[1]}.`,
  );

  const stoolProfile = emptyProfile("stool");
  stoolProfile.local_bounds_size = [0.8, 0.8, 0.8];
  stoolProfile.surfaces = [
    {
      id: "seat_top",
      semantic_names: ["seat_top", "support_surface", "top_surface"],
      local_center: [0, 0.78, 0],
      normal: [0, 1, 0],
      size: [0.68, 0.68],
      source: "geometry_profile",
      confidence: 0.95,
    },
  ];
  const stool = actor("secondary_subject", [0.8, 0.8, 0.8], stoolProfile, [1.25, 0, 0]);
  const stoolSurface = resolveDirectorPhysicalBlockingPlacement(
    cue("on_surface"),
    [cup, stool],
  );
  assert(
    stoolSurface?.status === "resolved" && stoolSurface.region_id === "seat_top",
    "Simple stool top should remain a positive On Surface canary.",
  );

  const noSurface = actor(
    "secondary_subject",
    [1, 1.2, 1],
    emptyProfile("no_surface"),
    [1.25, 0, 0],
  );
  const missingSurface = resolveDirectorPhysicalBlockingPlacement(
    cue("on_surface"),
    [cup, noSurface],
  );
  assert(
    missingSurface?.status === "unresolved" &&
      missingSurface.reason === "no_measured_support_surface_fits_source",
    "On Surface must fail closed instead of falling back to target bounds.",
  );

  const containerProfile = emptyProfile("container");
  containerProfile.local_bounds_size = [1.2, 1.2, 1.2];
  containerProfile.containment_regions = [
    {
      id: "open_interior",
      semantic_names: ["containment_region", "interior", "fillable_region"],
      local_center: [0, 0.58, 0],
      size: [0.78, 0.82, 0.78],
      access_direction: [0, 1, 0],
      source: "geometry_profile",
      confidence: 0.94,
      openness: "open",
      exposure: "interior",
    },
  ];
  containerProfile.diagnostics.feature_kinds.push("containment");
  const container = actor(
    "secondary_subject",
    [1.2, 1.2, 1.2],
    containerProfile,
    [1.1, 0, 0],
  );
  const inside = resolveDirectorPhysicalBlockingPlacement(
    cue("inside"),
    [cup, container],
  );
  assert(
    inside?.status === "resolved" && inside.region_id === "open_interior",
    "Inside must resolve through the measured containment volume.",
  );

  const chairInside = resolveDirectorPhysicalBlockingPlacement(
    cue("inside"),
    [cup, chair],
  );
  assert(
    chairInside?.status === "unresolved" &&
      chairInside.reason === "no_measured_containment_region_fits_source",
    "A chair with no containment region must not become an Inside receiver merely because it has a bounding box.",
  );

  const attachProfile = emptyProfile("attach_target");
  attachProfile.anchors.push({
    id: "side_panel_contact",
    semantic_names: ["attachment_anchor", "right_attachment"],
    kind: "attachment",
    local_position: [0.5, 0.62, 0],
    local_normal: [1, 0, 0],
    target_scope: "root",
    subpart_id: null,
    source: "geometry_profile",
    confidence: 0.92,
    contact_size: [0.62, 0.54],
  });
  const attachTarget = actor(
    "secondary_subject",
    [1, 1.2, 1],
    attachProfile,
    [1.2, 0, 0],
  );
  const attached = resolveDirectorPhysicalBlockingPlacement(
    cue("attached_to"),
    [cup, attachTarget],
  );
  assert(
    attached?.status === "resolved" &&
      attached.region_kind === "surface_contact_region" &&
      attached.region_id === "side_panel_contact" &&
      attached.position &&
      attached.position[0] > 1.7,
    `Attached To must use measured exterior surface-contact evidence and remain outside the receiver; got ${JSON.stringify(attached)}.`,
  );

  const tinyAttachProfile = emptyProfile("tiny_attach_target");
  tinyAttachProfile.anchors.push({
    id: "tiny_contact",
    semantic_names: ["attachment_anchor", "surface_contact"],
    kind: "attachment",
    local_position: [0.5, 0.6, 0],
    local_normal: [1, 0, 0],
    target_scope: "root",
    subpart_id: null,
    source: "geometry_profile",
    confidence: 0.92,
    contact_size: [0.02, 0.02],
  });
  const tinyAttachTarget = actor(
    "secondary_subject",
    [1, 1.2, 1],
    tinyAttachProfile,
    [1.2, 0, 0],
  );
  const tinyAttach = resolveDirectorPhysicalBlockingPlacement(
    cue("attached_to"),
    [cup, tinyAttachTarget],
  );
  assert(
    tinyAttach?.status === "unresolved" &&
      tinyAttach.reason === "no_measured_attachment_region",
    "A measured exterior contact patch that is too small must fail closed instead of accepting a face center alone.",
  );

  const noAttach = resolveDirectorPhysicalBlockingPlacement(
    cue("attached_to"),
    [cup, noSurface],
  );
  assert(
    noAttach?.status === "unresolved" &&
      noAttach.reason === "no_measured_attachment_region",
    "Attached To must fail closed when no measured attachment region exists.",
  );

  assert(
    approx(chairSurface.position?.[0] ?? Number.NaN, chair.position[0]),
    "On Surface should align the source root over the selected measured surface center.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "DIRECTOR_PHYSICAL_REGION_RELATIONS",
    "resolveDirectorPhysicalBlockingPlacement",
    "no_measured_support_surface_fits_source",
    "no_measured_containment_region_fits_source",
    "no_measured_attachment_region",
    "if (isDirectorPhysicalRegionRelation(cue.relation)) {",
  ]) {
    assert(runtime.includes(marker), `Physical-region runtime marker missing: ${marker}`);
  }
  const blockingStart = runtime.indexOf("export function applyDirectorBlocking");
  const scalarSwitchStart = runtime.indexOf("switch (cue.relation)", blockingStart);
  const scalarSwitchEnd = runtime.indexOf("applyBlockingScreenRegion", scalarSwitchStart);
  assert(
    blockingStart >= 0 && scalarSwitchStart > blockingStart && scalarSwitchEnd > scalarSwitchStart,
    "Could not isolate the post-physical scalar blocking switch.",
  );
  const scalarSwitch = runtime.slice(scalarSwitchStart, scalarSwitchEnd);
  for (const relation of ["on_surface", "inside", "attached_to"]) {
    assert(
      !scalarSwitch.includes(`case "${relation}"`),
      `${relation} must not fall back to the old bounding-box scalar switch.`,
    );
  }

  const directabilityContract = source(
    "sandbox/probe-lab/directability/asset-directability-contract.ts",
  );
  const directabilityFromAsset = source(
    "sandbox/probe-lab/directability/asset-directability-from-asset.ts",
  );
  for (const marker of [
    "contact_size?: [number, number] | null",
    "usable_size?: [number, number] | null",
    "blocked_fraction?: number | null",
    "is_primary?: boolean",
    'openness?: "open" | "enclosed" | "unknown"',
  ]) {
    assert(
      directabilityContract.includes(marker),
      `Physical-region Directability contract marker missing: ${marker}`,
    );
  }
  for (const marker of [
    "usable_size: [...(surface.usable_size ?? surface.size)]",
    "blocked_fraction: surface.blocked_fraction",
    "is_primary: primarySurfaceId === surface.id",
    '.filter((surface) => surface.source !== "legacy_ratio")',
    "openness: volume.openness",
    "contact_size: [...region.size]",
  ]) {
    assert(
      directabilityFromAsset.includes(marker),
      `Physical-region Directability bridge marker missing: ${marker}`,
    );
  }

  const directableCompiler = source(
    "sandbox/probe-lab/directability/directable-asset-compiler.ts",
  );
  assert(
    directableCompiler.includes('kind: "surface_contact_region"') &&
      directableCompiler.includes("generic surface-contact candidate, not a semantic connector port") &&
      directableCompiler.includes("semanticNamesSuggestConnector"),
    "A.11A.7 must preserve Directability's boundary between generic exterior contact and semantic connector ports.",
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "directorPhysicalPairSuitability",
    "geometry.support_surfaces",
    'volume.openness === "open"',
    "geometry.attachment_regions",
    "On Surface measured-region canary",
    "onSurfaceCanaryCount",
    "? 3",
    'input.pass_kind === "diversity"',
    "? 3",
    ": 6",
    "chooseDirectorPhysicalSupportingAsset",
  ]) {
    assert(room.includes(marker), `Qualification Room physical-proof marker missing: ${marker}`);
  }

  const fixture = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy.ts",
  );
  assert(
    fixture.includes("directorQualificationSupportContainmentAssetRoles") &&
      fixture.includes('capability.id === "on_ground"') &&
      fixture.includes("DIRECTOR_SUPPORT_CONTAINMENT_BINARY_ROLE_IDS"),
    "Support/containment exact role-count fixture is missing.",
  );

  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  assert(
    registry.includes("physical_region_required") &&
      registry.includes('["on_surface", "attached_to", "inside"]') &&
      registry.includes('capability.id === "inside"') &&
      registry.includes('"high_angle"'),
    "Physical relation camera/readability contract is missing.",
  );

  // Frozen historical boundaries must remain visible to their own verifiers.
  assert(
    room.includes("required_visible_roles: groupFormation") &&
      room.includes("relativeActorPlacement") &&
      runtime.includes("DIRECTOR_RELATIVE_ACTOR_RELATIONS"),
    "A.11A.7 disturbed frozen Group Formation / Relative actor source boundaries.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes("Phase 1B.7A.11A.7 — Support & containment physical-region convergence"),
    "Director README is missing the A.11A.7 Support & containment note.",
  );

  console.log("Director Support & containment Phase 1B.7A.11A.7 verification passed.");
  console.log("On Surface selects measured support regions (chair seat beats backrest-top false positives), Inside requires containment, and blocking-level Attached To consumes generic measured exterior surface-contact evidence without claiming typed connector mating; missing geometry fails closed.");
  console.log("Cross-asset On Surface now records three receiver canaries per pass while On Ground remains frozen and source/receiver physical sizing stays physical-context.");
}

main();
