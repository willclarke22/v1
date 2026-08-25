import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssetDirectabilityProfileV1 } from "../../sandbox/probe-lab/directability/asset-directability-contract";
import {
  DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION,
  inferDirectorQualificationPhysicalInspectionFromPoints,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-physical-inspection";
import {
  resolveDirectorPhysicalBlockingPlacement,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";
import type { DirectorShotDirectionV2 } from "../../sandbox/probe-lab/director";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function approx(left: number, right: number, epsilon = 0.05) {
  return Math.abs(left - right) <= epsilon;
}

function emptyProfile(assetId: string): AssetDirectabilityProfileV1 {
  return {
    schema_version: "myway_asset_directability_profile_v1",
    directability_version: "director_asset_directability_phase1b5_v1",
    asset_id: assetId,
    coordinate_space: "normalized_glb_y_up",
    local_bounds_size: [2, 1.2, 1],
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

function chairLikePointCloud() {
  const points: Array<[number, number, number]> = [];
  // Broad real right-side chair panel/arm region at x=0.62.
  for (let yi = 0; yi <= 12; yi += 1) {
    for (let zi = 0; zi <= 12; zi += 1) {
      points.push([0.62, 0.38 + yi * 0.045, -0.36 + zi * 0.06]);
      points.push([-0.72, 0.38 + yi * 0.045, -0.36 + zi * 0.06]);
    }
  }
  // Small caster/protrusion establishes a misleading global +X bound at 1.0.
  for (let yi = 0; yi <= 2; yi += 1) {
    for (let zi = 0; zi <= 2; zi += 1) {
      points.push([1.0, yi * 0.045, -0.05 + zi * 0.05]);
    }
  }
  return points;
}

function openCupPointCloud() {
  const points: Array<[number, number, number]> = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    points.push([x, 1, z]);
    for (let y = 0; y <= 8; y += 1) {
      const yy = y / 8;
      points.push([x, yy, z]);
    }
  }
  // Bottom ring/floor perimeter, but deliberately no top-center samples.
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * 0.46, 0.03, Math.sin(angle) * 0.46]);
  }
  return points;
}

function main() {
  assert(
    DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION ===
      "director_qualification_physical_inspection_phase1b7a11a9_v1",
    "A.11A.9 physical-inspection version drifted.",
  );

  const chairInspection = inferDirectorQualificationPhysicalInspectionFromPoints(
    chairLikePointCloud(),
    600,
  );
  const rightPatches = chairInspection.surface_contact_candidates.filter(
    (candidate) => candidate.side === "right",
  );
  assert(rightPatches.length > 0, "Chair-like point cloud produced no measured right-side contact patch.");
  const broadPatch = rightPatches.find(
    (candidate) =>
      candidate.local_position[1] > 0.45 &&
      candidate.contact_size[0] > 0.35 &&
      candidate.contact_size[1] > 0.35,
  );
  assert(broadPatch, `Expected a broad occupied side patch, got ${JSON.stringify(rightPatches)}.`);
  assert(
    broadPatch.local_position[0] < 0.8 && approx(broadPatch.local_position[0], 0.62, 0.08),
    `Attached-To mesh truth must not collapse to the misleading global x=1.0 protrusion; x=${broadPatch.local_position[0]}.`,
  );

  const sourceActor = actor("primary_subject", [0.12, 0.18, 0.12], emptyProfile("source"), [-1, 0, 0]);
  const targetProfile = emptyProfile("chair_target");
  targetProfile.anchors.push({
    id: broadPatch.id,
    semantic_names: ["surface_contact", "exterior_contact"],
    kind: "attachment",
    local_position: [...broadPatch.local_position],
    local_normal: [...broadPatch.local_normal],
    target_scope: "root",
    subpart_id: null,
    source: "geometry_profile",
    confidence: broadPatch.confidence,
    contact_size: [...broadPatch.contact_size],
  });
  const target = actor("secondary_subject", [2, 1.2, 1], targetProfile, [0, 0, 0]);
  const attached = resolveDirectorPhysicalBlockingPlacement(cue("attached_to"), [sourceActor, target]);
  assert(
    attached?.status === "resolved" && attached.position,
    `Mesh-truth Attached To canary did not resolve: ${JSON.stringify(attached)}.`,
  );
  assert(
    attached.position[0] < 0.9,
    `Attached To must stage from the occupied mesh patch, not the x=1.0 global-bounds face: ${attached.position[0]}.`,
  );

  const cupInspection = inferDirectorQualificationPhysicalInspectionFromPoints(
    openCupPointCloud(),
    800,
  );
  assert(
    cupInspection.top_opening &&
      cupInspection.top_opening.center_void_score >= 0.72 &&
      cupInspection.top_opening.rim_angular_coverage >= 0.58,
    `Open-container geometry canary was not recognized: ${JSON.stringify(cupInspection.top_opening)}.`,
  );

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "inspectDirectorQualificationPhysicalAsset",
    "directorQualificationContainmentOverrideFromInspection",
    "directorQualificationContactOverridesFromInspection",
    "DIRECTOR_QUALIFICATION_CONTAINER_SEMANTIC_HINTS",
    "semantic_plus_browser_geometry",
    "browser_gltf_surface_sample",
    "retiredWholeBoundsIds",
    '"attachment_left"',
    '"attachment_right"',
    "physicalInspectionReady",
    "physical_region_override",
    "open_container_evidence_found_but_no_real_source_pair_fits",
    "no_semantic_open_container_evidence_available",
    "mesh_contact_patches_found_but_no_real_pair_fits",
    "no_real_mesh_contact_patch_available",
  ]) {
    assert(room.includes(marker), `A.11A.9 Qualification Room marker missing: ${marker}`);
  }
  assert(
    room.includes("On Surface measured-region canary") &&
      room.includes("onSurfaceCanaryCount") &&
      room.includes("? 3") &&
      room.includes(": 6"),
    "A.11A.9 must preserve the frozen six-proof On Surface Cross-asset gauntlet.",
  );

  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  assert(
    preview.includes("directability_override") &&
      preview.includes("role.directability_override !== undefined"),
    "Qualification preview must replay the exact inspected physical-region override used to plan the manifest.",
  );
  assert(
    room.includes('base.anchors.filter((anchor) => anchor.kind !== "attachment")'),
    "The qualification directability override must expose only the selected sampled attachment patch, not allow another attachment anchor to outrank it during deterministic replay.",
  );

  const contract = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-contract.ts",
  );
  for (const marker of [
    "DirectorQualificationPhysicalRegionOverride",
    'kind: "surface_contact_region"',
    'kind: "containment_region"',
    "physical_region_override?:",
    "selected_region_evidence_source",
  ]) {
    assert(contract.includes(marker), `A.11A.9 evidence contract marker missing: ${marker}`);
  }

  const blenderBridge = source(
    "sandbox/probe-lab/assets/blender/scripts/myway-blender-bridge.py",
  );
  for (const marker of [
    "def _mesh_surface_contact_regions",
    "mesh_contact_{side}_{index + 1}",
    "myway_blender_geometry_profile_v4_mesh_contact_regions",
    "Whole-object left/right/front/back bounds are",
  ]) {
    assert(
      blenderBridge.includes(marker),
      `A.11A.9 canonical Blender mesh-contact generator marker missing: ${marker}`,
    );
  }
  assert(
    !blenderBridge.includes('"id": "attachment_left"') &&
      !blenderBridge.includes('"id": "attachment_right"') &&
      !blenderBridge.includes('"id": "attachment_front"') &&
      !blenderBridge.includes('"id": "attachment_back"'),
    "A.11A.9 must retire the canonical whole-bounds attachment pseudo-face generator.",
  );

  const geometryWorker = source(
    "sandbox/probe-lab/assets/geometry/geometry-profile-worker.server.ts",
  );
  assert(
    geometryWorker.includes(
      '"myway_blender_geometry_profile_v4_mesh_contact_regions"',
    ),
    "Geometry backfill must refresh pre-v4 profiles so canonical mesh-contact evidence can replace historical bounds pseudo-faces.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "resolveDirectorPhysicalBlockingPlacement",
    "no_measured_support_surface_fits_source",
    "no_measured_containment_region_fits_source",
    "no_measured_attachment_region",
  ]) {
    assert(runtime.includes(marker), `A.11A.9 disturbed fail-closed runtime boundary: ${marker}`);
  }

  const a11a8 = source(
    "scripts/sandbox/verify-director-support-containment-scale-parity-phase1b7a11a8.ts",
  );
  assert(
    a11a8.includes("0.17 m canary") &&
      a11a8.includes("directorQualificationRenderedWorldSize"),
    "A.11A.9 must preserve the A.11A.8 scale-parity canary.",
  );

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes(
      "Phase 1B.7A.11A.9 — mesh-surface attachment truth + open-container discovery",
    ),
    "Director README is missing the A.11A.9 note.",
  );

  console.log(
    "Director Support & containment Phase 1B.7A.11A.9 physical-surface-truth verification passed.",
  );
  console.log(
    `Chair canary resolves a broad occupied right-side patch at x=${broadPatch.local_position[0].toFixed(3)} instead of the misleading x=1.000 global protrusion; open-container geometry also produces a qualified top-opening candidate.`,
  );
  console.log(
    "On Ground and On Surface stay frozen; Attached To now consumes sampled rendered-mesh contact patches, while Inside may promote only semantic-container + independently measured open-top geometry and still fails closed when no fitting real source/receiver pair exists.",
  );
}

main();
