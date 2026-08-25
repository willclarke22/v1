import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AssetDirectabilityProfileV1,
} from "../../sandbox/probe-lab/directability/asset-directability-contract";
import {
  directorQualificationEffectiveRenderScale,
  directorQualificationRenderedWorldSize,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-render-geometry";
import {
  DIRECTOR_SUPPORT_CONTAINMENT_FIXTURE_POLICY_VERSION,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
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

function approx(left: number, right: number, epsilon = 1e-6) {
  return Math.abs(left - right) <= epsilon;
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function emptyProfile(assetId: string): AssetDirectabilityProfileV1 {
  return {
    schema_version: "myway_asset_directability_profile_v1",
    directability_version: "director_asset_directability_phase1b5_v1",
    asset_id: assetId,
    coordinate_space: "normalized_glb_y_up",
    local_bounds_size: [1, 1, 1],
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
    "A.11A.8 must not rewrite the A.11A.7 Support & containment fixture-policy version.",
  );

  // The reel exposed a 0.17 m visible mug being silently inflated to 0.25 m for
  // runtime geometry. Prove the canonical helper keeps visible/render/runtime
  // geometry on the exact same requested extent under Qualification Room bounds.
  const sourceDimensions = [0.12, 0.2, 0.12] as const;
  const sourceScale = directorQualificationEffectiveRenderScale({
    dimensions_m: sourceDimensions,
    target_extent_m: 0.17,
    scale_bounds: [0.02, 40],
  });
  const sourceWorldSize = directorQualificationRenderedWorldSize({
    dimensions_m: sourceDimensions,
    target_extent_m: 0.17,
    scale_bounds: [0.02, 40],
  });
  assert(approx(sourceScale, 0.85), `0.17 m parity canary scale drifted: ${sourceScale}.`);
  assert(
    approx(Math.max(...sourceWorldSize), 0.17) &&
      approx(sourceWorldSize[0], 0.102) &&
      approx(sourceWorldSize[2], 0.102),
    `Qualification world size must preserve the requested 0.17 m extent: ${sourceWorldSize.join("/")}.`,
  );
  assert(
    Math.abs(Math.max(...sourceWorldSize) - 0.25) > 0.05,
    "The retired 0.25 m runtime floor reappeared in canonical qualification geometry.",
  );

  const compactSource = actor(
    "primary_subject",
    sourceWorldSize,
    emptyProfile("small_detail_source"),
    [-1, 0, 0],
  );
  const inflatedLegacySource = actor(
    "primary_subject",
    [0.15, 0.25, 0.15],
    emptyProfile("legacy_floor_source"),
    [-1, 0, 0],
  );

  const tightSurfaceProfile = emptyProfile("tight_support_target");
  tightSurfaceProfile.surfaces = [
    {
      id: "tight_real_surface",
      semantic_names: ["support_surface", "seat"],
      local_center: [0, 0.62, 0],
      normal: [0, 1, 0],
      size: [0.15, 0.15],
      usable_size: [0.14, 0.14],
      blocked_fraction: 0,
      exposure: "exterior",
      orientation: "upward",
      openness: "open",
      vertical_rank: 1,
      clearance_above_m: null,
      is_primary: true,
      source: "geometry_profile",
      confidence: 0.95,
    },
  ];
  tightSurfaceProfile.diagnostics.feature_kinds.push("surfaces");
  const tightSurfaceTarget = actor(
    "secondary_subject",
    [1, 1, 1],
    tightSurfaceProfile,
    [1, 0, 0],
  );

  const paritySurface = resolveDirectorPhysicalBlockingPlacement(
    cue("on_surface"),
    [compactSource, tightSurfaceTarget],
  );
  const legacySurface = resolveDirectorPhysicalBlockingPlacement(
    cue("on_surface"),
    [inflatedLegacySource, tightSurfaceTarget],
  );
  assert(
    paritySurface?.status === "resolved" &&
      paritySurface.region_id === "tight_real_surface",
    `The true 0.17 m actor should fit the tight measured support surface: ${JSON.stringify(paritySurface)}.`,
  );
  assert(
    legacySurface?.status === "unresolved" &&
      legacySurface.reason === "no_measured_support_surface_fits_source",
    "The canary must remain tight enough that the retired 0.25 m actor would fail; otherwise it cannot protect scale parity.",
  );

  const containerProfile = emptyProfile("compact_container");
  containerProfile.containment_regions = [
    {
      id: "compact_open_interior",
      semantic_names: ["containment_region", "fillable_region"],
      local_center: [0, 0.45, 0],
      size: [0.13, 0.2, 0.13],
      access_direction: [0, 1, 0],
      source: "geometry_profile",
      confidence: 0.94,
      openness: "open",
      exposure: "interior",
    },
  ];
  containerProfile.diagnostics.feature_kinds.push("containment");
  const compactContainer = actor(
    "secondary_subject",
    [1, 1, 1],
    containerProfile,
    [1, 0, 0],
  );
  const parityInside = resolveDirectorPhysicalBlockingPlacement(
    cue("inside"),
    [compactSource, compactContainer],
  );
  const legacyInside = resolveDirectorPhysicalBlockingPlacement(
    cue("inside"),
    [inflatedLegacySource, compactContainer],
  );
  assert(
    parityInside?.status === "resolved" &&
      parityInside.region_id === "compact_open_interior",
    `Exact rendered source geometry should fit the compact open containment canary: ${JSON.stringify(parityInside)}.`,
  );
  assert(
    legacyInside?.status === "unresolved" &&
      legacyInside.reason === "no_measured_containment_region_fits_source",
    "The compact containment canary must reject the retired inflated actor.",
  );

  const attachProfile = emptyProfile("contact_target");
  attachProfile.anchors.push({
    id: "measured_side_contact",
    semantic_names: ["surface_contact", "right_attachment"],
    kind: "attachment",
    local_position: [0.5, 0.55, 0],
    local_normal: [1, 0, 0],
    target_scope: "root",
    subpart_id: null,
    source: "geometry_profile",
    confidence: 0.94,
    contact_size: [0.22, 0.22],
  });
  const attachTarget = actor(
    "secondary_subject",
    [1, 1, 1],
    attachProfile,
    [1, 0, 0],
  );
  const attached = resolveDirectorPhysicalBlockingPlacement(
    cue("attached_to"),
    [compactSource, attachTarget],
  );
  assert(
    attached?.status === "resolved" && attached.position,
    `Attached To parity canary did not resolve: ${JSON.stringify(attached)}.`,
  );
  const targetFaceX = 1.5;
  const expectedSourceCenterX = targetFaceX + sourceWorldSize[0] * 0.5 + 0.008;
  assert(
    approx(attached.position[0], expectedSourceCenterX, 1e-4),
    `Attached To must offset from the measured face using the visible source half-extent; x=${attached.position[0]} expected=${expectedSourceCenterX}.`,
  );

  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  for (const marker of [
    "directorQualificationRenderedWorldSize",
    "directorQualificationEffectiveRenderScale",
    "directorQualificationRuntimeSize",
    "directorQualificationRuntimeActors",
    "const minimumScale = scaleBounds?.[0] ?? 0.08",
  ]) {
    assert(preview.includes(marker), `Qualification preview parity marker missing: ${marker}`);
  }
  for (const retired of [
    "Math.max(0.25, role.blocking.target_extent_m",
    "Math.max(0.05, Math.abs(Number(value)",
  ]) {
    assert(
      !preview.includes(retired),
      `Retired qualification runtime-size inflation is still present: ${retired}`,
    );
  }

  const helper = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-render-geometry.ts",
  );
  for (const marker of [
    "directorQualificationEffectiveRenderScale",
    "directorQualificationRenderedWorldSize",
    "targetExtent / largestDimension",
  ]) {
    assert(helper.includes(marker), `Canonical qualification geometry helper missing: ${marker}`);
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  for (const marker of [
    "directorInsidePhysicalPairCandidates",
    "chooseDirectorInsidePhysicalPair",
    "preferred_primary",
    "directorQualificationRenderedWorldSize",
    "plannedClipPhysicalResolutionEvidence",
    "plannedCoverageGaps",
    "no_compatible_measured_real_asset_pair_available",
    "physical_resolution: plannedClipPhysicalResolutionEvidence(planned)",
    "coverage_gaps: plannedCoverageGaps",
  ]) {
    assert(room.includes(marker), `Qualification Room A.11A.8 marker missing: ${marker}`);
  }

  assert(
    room.includes("capabilities: familyCapabilities") &&
      !room.includes("selectedCapabilities"),
    "A.11A.8 coverage-gap manifest wiring must use the in-scope familyCapabilities list; the retired selectedCapabilities identifier would fail the Next.js type check.",
  );

  // Preserve the A.11A.7 longer On Surface canary and fail-closed physical-region
  // architecture instead of replacing it with an A.11A.8 fixture shortcut.
  for (const marker of [
    "On Surface measured-region canary",
    "onSurfaceCanaryCount",
    "? 3",
    'input.pass_kind === "diversity"',
    ": 6",
    "directorPhysicalPairSuitability",
    "chooseDirectorPhysicalSupportingAsset",
  ]) {
    assert(room.includes(marker), `A.11A.7 physical-region boundary drifted: ${marker}`);
  }

  const contract = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-contract.ts",
  );
  for (const marker of [
    "DirectorQualificationPhysicalResolutionEvidence",
    "DirectorQualificationCoverageGap",
    "physical_resolution:",
    "coverage_gaps:",
    "source_world_size_m",
    "target_region_world_size_m",
    "fit_margin_m",
    "unresolved_reason",
    "expected_clip_count",
    "actual_clip_count",
    "missing_clip_count",
  ]) {
    assert(contract.includes(marker), `Qualification evidence contract marker missing: ${marker}`);
  }

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "resolveDirectorPhysicalBlockingPlacement",
    "no_measured_support_surface_fits_source",
    "no_measured_containment_region_fits_source",
    "no_measured_attachment_region",
  ]) {
    assert(runtime.includes(marker), `A.11A.7 fail-closed runtime marker missing: ${marker}`);
  }

  const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
  assert(
    readme.includes(
      "Phase 1B.7A.11A.8 — physical qualification scale parity + containment coverage",
    ),
    "Director README is missing the A.11A.8 note.",
  );

  console.log(
    "Director Support & containment Phase 1B.7A.11A.8 scale-parity + containment-coverage verification passed.",
  );
  console.log(
    `0.17 m canary renders/reasons at ${sourceWorldSize.map((value) => value.toFixed(3)).join("/")} m; tight support and compact containment resolve at visible size while the retired 0.25 m runtime floor fails both canaries.`,
  );
  console.log(
    "Inside now searches compatible source+receiver pairs, physical clips record selected-region/fit diagnostics, coverage gaps are explicit, and A.11A.7 fail-closed measured-region semantics remain intact.",
  );
}

main();
