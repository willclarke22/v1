import { logicalAssetSizeDecision } from "../../sandbox/probe-lab/assets/logical-asset-size";
import type { DirectableAssetTopOpeningCandidateV1 } from "../../sandbox/probe-lab/directability/affordance-graph-contract";
import type { AssetDirectabilityProfileV1 } from "../../sandbox/probe-lab/directability/asset-directability-contract";
import type { DirectorShotDirectionV2 } from "../../sandbox/probe-lab/director";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  directorQualificationSupportContainmentAssetRoles,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy";
import {
  directorQualificationBroadTopAccessProposal,
  inferDirectorQualificationOpenCavityFromRayDepths,
  inferDirectorQualificationSurfaceContactsFromRayHits,
  type DirectorQualificationCavityRayDepth,
  type DirectorQualificationPhysicalBounds,
  type DirectorQualificationRayContactHit,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-physical-inspection";
import {
  directorQualificationRenderedWorldSize,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-render-geometry";
import {
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M,
  DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS,
  DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES,
  DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT,
  DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT,
  directorQualificationAdaptiveContainmentClearance,
  directorQualificationContainedSourceFitFloor,
  directorQualificationAssetMatchesExactSemanticLabel,
  directorQualificationAssetMatchesSemanticPhrases,
  directorQualificationFindInsideValidationAsset,
  directorQualificationInsideDetailCameraProfile,
  directorQualificationInsidePairIndex,
  directorQualificationInsidePairKey,
  directorQualificationInsideValidationFixtureForPass,
  directorQualificationOnSurfacePairIndex,
  directorQualificationSelectDistinctInsidePairs,
  directorQualificationSelectDistinctOnSurfacePairs,
  directorQualificationSupportReceiverLooksGroundLike,
  directorQualificationSupportSurfaceIsPerceptuallyEligible,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";
import {
  directorPhysicalInsideAccessTravel,
  resolveDirectorPhysicalBlockingPlacement,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(left: number, right: number, epsilon = 1e-4) {
  return Math.abs(left - right) <= epsilon;
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const family = families.find(
  (candidate) =>
    candidate.category === "blocking_placement" &&
    candidate.group === "Support & containment",
);
const relativeFamily = families.find(
  (candidate) =>
    candidate.category === "blocking_placement" &&
    candidate.group === "Relative actor placement",
);
assert(family, "Support & containment qualification family is missing.");
assert(relativeFamily, "Relative actor placement qualification family is missing.");
assert(
  family.capability_ids.length === 3 &&
    ["on_ground", "on_surface", "inside"].every((id) =>
      family.capability_ids.includes(id),
    ) &&
    !family.capability_ids.includes("attached_to") &&
    relativeFamily.capability_ids.includes("attached_to"),
  `Earned boundary: Support & containment must be exactly On Ground / On Surface / Inside while Attached To remains covered elsewhere; support=${JSON.stringify(family.capability_ids)} relative=${JSON.stringify(relativeFamily.capability_ids)}.`,
);

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
  readabilityNearOpening = false,
): DirectorShotDirectionV2["blocking"][number] {
  return {
    relation,
    actor_entity_id: "primary_subject",
    target_entity_id: "secondary_subject",
    screen_region: null,
    preserve_clearance: true,
    parameters: {
      physical_region_required: true,
      ...(readabilityNearOpening
        ? { physical_containment_readability_near_opening: true }
        : {}),
    },
  };
}

// Earned fixture/scale boundaries: one source for On Ground; binary proofs for
// measured support/attachment/containment; physical-context sizing stays canonical.
assert(
  family.normalization_policy === "physical_context",
  "Earned boundary: Support & containment must retain physical-context sizing.",
);
for (const [id, expected] of Object.entries({
  on_ground: 1,
  on_surface: 2,
  inside: 2,
})) {
  const roles = directorQualificationSupportContainmentAssetRoles(
    family,
    capability(id),
  );
  assert(
    roles.length === expected,
    `Earned boundary: ${id} should use ${expected} proof actor(s), got ${roles.length}.`,
  );
}
const parityWorldSize = directorQualificationRenderedWorldSize({
  dimensions_m: [0.5, 1, 0.25],
  target_extent_m: 0.17,
  scale_bounds: [0.02, 40],
});
assert(
  approx(Math.max(...parityWorldSize), 0.17, 1e-6),
  `Earned boundary: qualification render/runtime world size must honor the requested physical extent; got ${JSON.stringify(parityWorldSize)}.`,
);

// A.11A.11 source-generalization/readability boundaries live in pure policy APIs,
// not source-string snapshots of the Qualification Room implementation.
const onSurfaceProfile = directorQualificationCapabilityProfile(family, "on_surface");
assert(
  [
    "character",
    "vehicle",
    "furniture",
    "irregular_hero",
    "compact_rigid",
    "simple_rigid",
    "small_asymmetric",
    "organic_elongated",
    "small_detail",
  ].every((slot) => onSurfaceProfile.suitable_primary_cast_slots.includes(slot as never)),
  "Earned boundary: On Surface source eligibility must be semantic-agnostic across the Qualification Cast; measured fit/readability decides admission.",
);
assert(
  directorQualificationSupportReceiverLooksGroundLike([1.6, 0.02, 1.6]) &&
    !directorQualificationSupportReceiverLooksGroundLike([0.45, 0.78, 0.45]),
  "Earned boundary: qualification On Surface must distinguish floor/rug-like receivers from elevated supports by geometry, not asset IDs.",
);
assert(
  directorQualificationSupportSurfaceIsPerceptuallyEligible({
    normal_y: 0.98, exposure: "open", openness: "open", blocked_fraction: 0.08, height_ratio: 0.78,
  }) &&
    !directorQualificationSupportSurfaceIsPerceptuallyEligible({
      normal_y: 0.98, exposure: "open", openness: "open", blocked_fraction: 0.08, height_ratio: 0.08,
    }) &&
    !directorQualificationSupportSurfaceIsPerceptuallyEligible({
      normal_y: 0.98, exposure: "open", openness: "open", blocked_fraction: 0.82, height_ratio: 0.78,
    }),
  "Earned boundary: qualification On Surface must require an exposed, elevated, sufficiently unblocked upward support region.",
);
assert(
  DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT <= 24,
  "Earned boundary: On Surface source search must remain bounded rather than scaling quadratically with the full library.",
);
const generalizationPairs = directorQualificationSelectDistinctOnSurfacePairs([
  { source_asset: { asset_id: "book" }, target: { asset: { asset_id: "bench" } } },
  { source_asset: { asset_id: "book" }, target: { asset: { asset_id: "table" } } },
  { source_asset: { asset_id: "lantern" }, target: { asset: { asset_id: "bench" } } },
  { source_asset: { asset_id: "lantern" }, target: { asset: { asset_id: "stool" } } },
  { source_asset: { asset_id: "burger" }, target: { asset: { asset_id: "chair" } } },
  { source_asset: { asset_id: "apple" }, target: { asset: { asset_id: "table" } } },
]);
assert(
  new Set(generalizationPairs.map((pair) => pair.source_asset.asset_id)).size ===
    generalizationPairs.length,
  "Earned boundary: selected On Surface generalization sources must remain distinct.",
);
assert(
  directorQualificationOnSurfacePairIndex({
    pass_kind: "baseline",
    variant_index: 0,
    pair_count: 3,
    canaries_per_pass: 3,
  }) === 0 &&
    directorQualificationOnSurfacePairIndex({
      pass_kind: "diversity",
      variant_index: 0,
      pair_count: 3,
      canaries_per_pass: 3,
    }) === null &&
    directorQualificationOnSurfacePairIndex({
      pass_kind: "diversity",
      variant_index: 0,
      pair_count: 6,
      canaries_per_pass: 3,
    }) === 3,
  "Earned boundary: On Surface Cross-asset evidence must use distinct later pairs and never wrap baseline evidence into Diversity.",
);
assert(
  directorQualificationInsidePairIndex({
    pass_kind: "diversity",
    pair_count: 1,
  }) === null,
  "Earned boundary: Inside diversity must not wrap or relabel the baseline pair.",
);


const adaptiveSmallCavityClearance = directorQualificationAdaptiveContainmentClearance(
  [0.06, 0.08, 0.06],
  0.008,
);
assert(
  adaptiveSmallCavityClearance < 0.008 && adaptiveSmallCavityClearance >= 0.0015,
  `Earned boundary: small real cavities need proportional clearance rather than a fixed 8mm veto; got ${adaptiveSmallCavityClearance}.`,
);
assert(
  approx(directorQualificationContainedSourceFitFloor(0.06), 0.045, 1e-6),
  "Earned boundary: contained sources may shrink only within a plausible logical-size floor; receivers must not be enlarged to force a fit.",
);

const distinctInsidePairs = directorQualificationSelectDistinctInsidePairs([
  {
    source_asset: { asset_id: "takeaway_cup" },
    target: { asset: { asset_id: "open_mug" } },
    candidate: "best_region",
  },
  {
    source_asset: { asset_id: "takeaway_cup" },
    target: { asset: { asset_id: "open_mug" } },
    candidate: "second_region_same_assets",
  },
  {
    source_asset: { asset_id: "apple" },
    target: { asset: { asset_id: "open_mug" } },
    candidate: "second_real_pair",
  },
]);
assert(
  distinctInsidePairs.length === 2 &&
    distinctInsidePairs[0]?.candidate === "best_region" &&
    distinctInsidePairs[1]?.source_asset.asset_id === "apple",
  "Earned boundary: Inside candidate regions must collapse to the strongest candidate per source/receiver asset identity before pass indexing.",
);
assert(
  directorQualificationInsidePairIndex({
    pass_kind: "diversity",
    pair_count: distinctInsidePairs.slice(0, 1).length,
  }) === null,
  "Earned boundary: alternate regions on the baseline Inside pair must not satisfy diversity.",
);

const baselineInsidePairKey = directorQualificationInsidePairKey(
  "takeaway_cup",
  "open_mug",
);
assert(
  baselineInsidePairKey !== null &&
    directorQualificationInsidePairKey("takeaway_cup", "open_mug") ===
      baselineInsidePairKey &&
    directorQualificationInsidePairKey("apple", "open_mug") !==
      baselineInsidePairKey &&
    directorQualificationInsidePairKey("takeaway_cup", "open_bowl") !==
      baselineInsidePairKey,
  "Earned boundary: final Inside evidence identity must be the exact source_asset_id + receiver_asset_id pair, so repeated baseline evidence is rejectable at reel admission.",
);

const baselineInsideFixture =
  directorQualificationInsideValidationFixtureForPass("baseline");
const diversityInsideFixture =
  directorQualificationInsideValidationFixtureForPass("diversity");
assert(
  DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES.length === 2 &&
    baselineInsideFixture?.id === "pineapple_in_bathtub" &&
    baselineInsideFixture.source_cast_slot_id === "irregular_hero" &&
    baselineInsideFixture.receiver_cast_slot_id === "furniture" &&
    diversityInsideFixture?.id === "apple_in_existing_mug" &&
    diversityInsideFixture.source_cast_slot_id === "small_detail" &&
    diversityInsideFixture.receiver_cast_slot_id === "small_detail",
  "Earned boundary: Cross-asset Inside must retain explicit semantic fixture roles instead of reclassifying Bathtub through the generic cast vocabulary.",
);

const fixtureAssets = [
  {
    asset_id: "pineapple_asset",
    canonical_label: "Pineapple",
  },
  {
    asset_id: "coffee_mug_bk_mritny8x",
    canonical_label: "Ceramic coffee mug",
  },
  {
    asset_id: "apple_asset",
    canonical_label: "Apple",
  },
  {
    asset_id: "bathtub_asset",
    canonical_label: "White bathtub",
  },
];
assert(
  directorQualificationAssetMatchesSemanticPhrases(
    fixtureAssets[2]!,
    ["apple"],
  ) &&
    !directorQualificationAssetMatchesSemanticPhrases(
      fixtureAssets[0]!,
      ["apple"],
    ),
  "Earned boundary: apple fixture matching must be word-exact and must not accidentally select pineapple.",
);
assert(
  directorQualificationFindInsideValidationAsset(fixtureAssets, {
    preferred_asset_ids: ["coffee_mug_bk_mritny8x"],
    phrases: ["mug"],
  })?.asset_id === "coffee_mug_bk_mritny8x" &&
    directorQualificationFindInsideValidationAsset(fixtureAssets, {
      preferred_asset_ids: [],
      phrases: ["bath tub", "bathtub"],
    })?.asset_id === "bathtub_asset",
  "Earned boundary: Inside fixture selection must prefer the established mug identity and resolve bathtub semantics deterministically.",
);
assert(
  directorQualificationAssetMatchesExactSemanticLabel(
    { asset_id: "bathtub_caps", canonical_label: "Bathtub" },
    ["bathtub"],
  ) &&
    directorQualificationAssetMatchesExactSemanticLabel(
      { asset_id: "pineapple_caps", display_name: "Pineapple" },
      ["pineapple"],
    ),
  "Earned boundary: explicit fixture discovery must be case-insensitive for exact Bathtub/Pineapple semantic labels.",
);

const fixtureLogicalSizes = {
  pineapple: logicalAssetSizeDecision({ concept: "pineapple" }).target_extent_m,
  bathtub: logicalAssetSizeDecision({ concept: "bathtub" }).target_extent_m,
  apple: logicalAssetSizeDecision({ concept: "apple" }).target_extent_m,
  mug: logicalAssetSizeDecision({ concept: "coffee mug" }).target_extent_m,
};
assert(
  approx(fixtureLogicalSizes.pineapple, 0.3) &&
    approx(fixtureLogicalSizes.bathtub, 1.7) &&
    approx(fixtureLogicalSizes.apple, 0.09) &&
    approx(fixtureLogicalSizes.mug, 0.13),
  `Earned boundary: Inside fixtures must preserve real-world concept sizes; got ${JSON.stringify(fixtureLogicalSizes)}.`,
);
assert(
  DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[0] <= 0.001 &&
    DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT === 4,
  "Earned boundary: fixture source-unit correction must allow small real props while Support/Containment browser inspection stays capped at four exact receivers.",
);

const cup = actor(
  "primary_subject",
  [0.18, 0.28, 0.18],
  emptyProfile("cup"),
  [-1.4, 0, 0],
);

// Measured support must beat whole-bounds false positives and fail closed when
// no measured support exists.
const chairProfile = emptyProfile("chair");
chairProfile.local_bounds_size = [1, 1.5, 1];
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
const chair = actor("secondary_subject", [1, 1.5, 1], chairProfile, [1.25, 0, 0]);
const chairSurface = resolveDirectorPhysicalBlockingPlacement(
  cue("on_surface"),
  [cup, chair],
);
assert(
  chairSurface?.status === "resolved" &&
    chairSurface.region_id === "seat" &&
    (chairSurface.position?.[1] ?? 99) < 0.75,
  `Earned boundary: On Surface must select the usable measured seat rather than a narrow/global top; got ${JSON.stringify(chairSurface)}.`,
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
  "Earned boundary: On Surface must fail closed instead of falling back to whole-object bounds.",
);

// Containment must be measured/open and the qualification-only visibility shift
// must stay below the mathematically safe one-direction centre limit.
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
const container = actor(
  "secondary_subject",
  [1.2, 1.2, 1.2],
  containerProfile,
  [1.1, 0, 0],
);
const inside = resolveDirectorPhysicalBlockingPlacement(
  cue("inside", true),
  [cup, container],
);
assert(
  inside?.status === "resolved" && inside.region_id === "open_interior",
  "Earned boundary: Inside must resolve only through a measured accessible containment region.",
);
const chairInside = resolveDirectorPhysicalBlockingPlacement(
  cue("inside"),
  [cup, chair],
);
assert(
  chairInside?.status === "unresolved" &&
    chairInside.reason === "no_measured_containment_region_fits_source",
  "Earned boundary: a non-container with no measured containment region must fail closed for Inside.",
);
const availableVertical = 0.82 - 0.28 - 0.008 * 2;
const productionTravel = directorPhysicalInsideAccessTravel({
  available_span_m: availableVertical,
  actor_height_m: 0.28,
  qualification_readability_near_opening: false,
});
const readableTravel = directorPhysicalInsideAccessTravel({
  available_span_m: availableVertical,
  actor_height_m: 0.28,
  qualification_readability_near_opening: true,
});
assert(
  readableTravel > productionTravel &&
    readableTravel <= availableVertical * 0.5 * 0.801,
  "Earned boundary: qualification Inside readability may approach the opening but must stay within the safe centre-travel limit.",
);

// Blocking-level attachment must use measured exterior contact fit and fail closed
// when the patch is absent or too small.
const attachProfile = emptyProfile("attach_target");
attachProfile.anchors.push({
  id: "side_panel_contact",
  semantic_names: ["attachment_anchor", "surface_contact"],
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
    attached.region_id === "side_panel_contact",
  `Earned boundary: Attached To must resolve through measured exterior contact evidence; got ${JSON.stringify(attached)}.`,
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
const tinyAttached = resolveDirectorPhysicalBlockingPlacement(
  cue("attached_to"),
  [cup, tinyAttachTarget],
);
assert(
  tinyAttached?.status === "unresolved" &&
    tinyAttached.reason === "no_measured_attachment_region",
  "Earned boundary: undersized attachment contact must fail closed.",
);

// Mesh-topology canaries: disconnected side islands cannot become one broad
// attachment rectangle; open cavity rays qualify while a shallow closed lid does not.
const bounds: DirectorQualificationPhysicalBounds = {
  min: [-1, 0, -1],
  max: [1, 1.2, 1],
  size: [2, 1.2, 2],
  center: [0, 0.6, 0],
};
const hits: DirectorQualificationRayContactHit[] = [];
for (let u = 3; u <= 8; u += 1) {
  for (let v = 3; v <= 8; v += 1) {
    hits.push({
      u_index: u,
      v_index: v,
      local_position: [0.62, 0.05 + u * 0.09, -0.9 + v * 0.15],
      local_normal: [1, 0, 0],
    });
  }
}
for (const [u, v] of [[0, 0], [0, 11], [11, 0], [11, 11]] as const) {
  hits.push({
    u_index: u,
    v_index: v,
    local_position: [1, 0.05 + u * 0.09, -0.9 + v * 0.15],
    local_normal: [1, 0, 0],
  });
}
const contacts = inferDirectorQualificationSurfaceContactsFromRayHits({
  side: "right",
  grid_size: 12,
  local_bounds: bounds,
  hits,
});
const broad = contacts[0];
assert(
  broad?.evidence_method === "raycast_contiguous_patch" &&
    broad.topology.method === "raycast_contiguous_patch" &&
    broad.topology.center_hit &&
    broad.topology.occupancy_ratio >= 0.68 &&
    approx(broad.local_position[0], 0.62, 0.04),
  `Earned boundary: Attached-To mesh qualification must use a contiguous centre-hit ray patch; got ${JSON.stringify(broad)}.`,
);
assert(
  !contacts.some(
    (candidate) =>
      candidate.contact_size[0] > bounds.size[1] * 0.8 &&
      candidate.contact_size[1] > bounds.size[2] * 0.8,
  ),
  "Earned boundary: disconnected exterior islands must not merge into one whole-side attachment rectangle.",
);

function openingCandidate(): DirectableAssetTopOpeningCandidateV1 {
  return {
    axis_name: "y",
    axis: [0, 1, 0],
    score: 0.94,
    confidence: 0.92,
    center_void_score: 0.96,
    rim_angular_coverage: 0.94,
    opening_size_ratio: [0.8, 0.8],
    local_center: [0, 1, 0],
    opening_size: [0.8, 0.8],
    access_direction: [0, 1, 0],
    note: "synthetic rim proposal",
  };
}
function cavityDepths(depth: number): DirectorQualificationCavityRayDepth[] {
  const output: DirectorQualificationCavityRayDepth[] = [];
  for (let u = 0; u < 7; u += 1) {
    for (let v = 0; v < 7; v += 1) {
      output.push({ u_index: u, v_index: v, depth_m: depth });
    }
  }
  return output;
}
const containerBounds: DirectorQualificationPhysicalBounds = {
  min: [-0.5, 0, -0.5],
  max: [0.5, 1, 0.5],
  size: [1, 1, 1],
  center: [0, 0.5, 0],
};
const basinProposal = directorQualificationBroadTopAccessProposal(containerBounds);
const basinCavity = inferDirectorQualificationOpenCavityFromRayDepths({
  opening: basinProposal,
  local_bounds: containerBounds,
  grid_size: 7,
  sampled_opening_size: [0.82, 0.82],
  depths: cavityDepths(0.72),
});
assert(
  basinCavity?.method === "raycast_open_cavity" && basinCavity.cavity_depth_m > 0.6,
  `Earned boundary: broad basin-style top access may qualify only after connected downward rays prove real open depth; got ${JSON.stringify(basinCavity)}.`,
);

const openCavity = inferDirectorQualificationOpenCavityFromRayDepths({
  opening: openingCandidate(),
  local_bounds: containerBounds,
  grid_size: 7,
  sampled_opening_size: [0.5, 0.5],
  depths: cavityDepths(0.94),
});
const closedLid = inferDirectorQualificationOpenCavityFromRayDepths({
  opening: openingCandidate(),
  local_bounds: containerBounds,
  grid_size: 7,
  sampled_opening_size: [0.5, 0.5],
  depths: cavityDepths(0.02),
});
assert(
  openCavity?.method === "raycast_open_cavity" &&
    openCavity.center_access_clear &&
    openCavity.access_clear_ratio >= 0.52 &&
    openCavity.cavity_depth_m > 0.8,
  `Earned boundary: ray-confirmed open cavity should qualify; got ${JSON.stringify(openCavity)}.`,
);
assert(
  closedLid === null,
  `Earned boundary: a shallow/closed lid must fail closed even when rim heuristics exist; got ${JSON.stringify(closedLid)}.`,
);

// Readability belongs to the canonical capability contract, but this assertion
// inspects behavior returned by the API rather than source spelling.
const attachedMoment = directorCapabilityDemoMoment(capability("attached_to"));
const attachedCue = attachedMoment.shot?.blocking.find(
  (item) => item.relation === "attached_to",
);
const insideMoment = directorCapabilityDemoMoment(capability("inside"));
const insideDemoCue = insideMoment.shot?.blocking.find(
  (item) => item.relation === "inside",
);
assert(
  attachedCue?.parameters.physical_contact_readability_oblique === true &&
    attachedMoment.shot?.composition.angle === "three_quarter_front",
  "Earned boundary: Attached To must retain an oblique contact-readable proof.",
);
assert(
  insideDemoCue?.parameters.physical_containment_readability_near_opening === true &&
    insideMoment.shot?.composition.angle === "high_angle",
  "Earned boundary: Inside qualification must retain high-angle + safe near-opening readability.",
);
const smallInsideCamera = directorQualificationInsideDetailCameraProfile(0.13);
const largeInsideCamera = directorQualificationInsideDetailCameraProfile(1.7);
assert(
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M > 0.13 &&
    DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M < 1.7 &&
    smallInsideCamera?.framing === "insert" &&
    smallInsideCamera.angle === "high_angle" &&
    smallInsideCamera.field_of_view_degrees < 42 &&
    smallInsideCamera.focus_entity_id === "secondary_subject" &&
    largeInsideCamera === null,
  "Earned boundary: small Inside receivers must receive qualification-only detail framing while bathtub-scale receivers retain the established wide high-angle proof.",
);

console.log(
  "Director Support & containment earned-boundaries regression verification passed.",
);
console.log(
  "Durable semantics verified functionally: physical-context parity; semantic-agnostic On Surface source generalization with perceptually readable measured support; distinct no-wrap Cross-asset evidence; case-insensitive Bathtub/Pineapple fixtures; receiver-authoritative adaptive contained-source sizing; bounded physical inspection; broad-basin proposals gated by real ray-confirmed cavity depth; measured attachment fit in its reassigned family; and qualification-only perceptual readability.",
);
console.log(
  "Historical A.11A.7-A.11A.10 acceptance scripts remain lineage records and are intentionally not required as permanent successor regressions.",
);
