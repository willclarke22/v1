import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIRECTOR_CAPABILITIES } from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CAST,
  DIRECTOR_QUALIFICATION_CAST_SLOT_IDS,
  directorQualificationCastSlot,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-cast";
import {
  DIRECTOR_QUALIFICATION_COVERAGE_VERSION,
  DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-contract";
import { buildDirectorQualificationFamilies } from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_QUALIFICATION_NORMALIZATION_VERSION,
  normalizeAssetForDirectorQualification,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-normalization";
import {
  DIRECTOR_QUALIFICATION_SCENES,
  directorQualificationScene,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import type { MyWayAssetRecord } from "../../sandbox/probe-lab/assets/asset-types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function asset(input: {
  id: string;
  label: string;
  dimensions: [number, number, number];
}): MyWayAssetRecord {
  return {
    asset_id: input.id,
    canonical_label: input.label,
    display_name: input.label,
    aliases: [input.label],
    semantic_tags: [input.label],
    asset_type: "glb",
    domain: "generic",
    source_type: "manual",
    public_path: `/sandbox-assets/${input.id}.glb`,
    dimensions_m: input.dimensions,
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    rigged: false,
    animation_clips: [],
    quality_score: 1,
    reuse_count: 0,
    license_kind: "cc0",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "approved",
    scene_review_status: "approved",
    semantic_review_status: "verified",
    created_at: "2026-08-21T00:00:00.000Z",
    updated_at: "2026-08-21T00:00:00.000Z",
  } as MyWayAssetRecord;
}

assert(DIRECTOR_CAPABILITIES.length === 184, "Qualification coverage must preserve all 184 Level 2 capabilities.");
assert(DIRECTOR_QUALIFICATION_SCHEMA_VERSION === "director_qualification_phase1b7a_v1", "Additive coverage refinement must preserve Phase 1B.7A review-state compatibility.");
assert(DIRECTOR_QUALIFICATION_COVERAGE_VERSION === "director_qualification_coverage_phase1b7a1_v1", "Coverage version drifted.");
assert(DIRECTOR_QUALIFICATION_NORMALIZATION_VERSION === "director_qualification_normalization_phase1b7a1_v1", "Normalization version drifted.");

assert(DIRECTOR_QUALIFICATION_CAST.length === 9, "Qualification cast should retain nine semantic geometry classes.");
for (const slot of DIRECTOR_QUALIFICATION_CAST) {
  assert(slot.pool_size >= 4, `${slot.id} must keep a rotating pool rather than a single demo asset.`);
  assert(slot.physical_reference_extent_m > 0, `${slot.id} is missing a physical reference extent.`);
  assert(slot.presentation_extent_m > 0, `${slot.id} is missing a fair-display presentation extent.`);
}

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const groupedIds = families.flatMap((family) => family.capability_ids);
assert(groupedIds.length === 184 && new Set(groupedIds).size === 184, "All Level 2 capabilities must remain covered exactly once by audition families.");
const representedClassIds = new Set(families.flatMap((family) => family.primary_cast_slots));
for (const slotId of DIRECTOR_QUALIFICATION_CAST_SLOT_IDS) {
  assert(representedClassIds.has(slotId), `No audition family exercises the ${slotId} geometry class.`);
}
for (const family of families) {
  assert(family.primary_cast_slots.length >= 4, `${family.label} needs broader geometry-class coverage.`);
  assert(
    family.normalization_policy === "presentation_normalized" || family.normalization_policy === "physical_context",
    `${family.label} has an invalid normalization policy.`,
  );
}

assert(DIRECTOR_QUALIFICATION_SCENES.length === 4, "Scene A-D must remain the canonical v1 qualification scene set.");
for (const scene of DIRECTOR_QUALIFICATION_SCENES) {
  assert(scene.normalization.minimum_clearance_m > 0, `${scene.short_label} must declare a starting-layout clearance guard.`);
  assert(scene.normalization.physical_max_extent_m > scene.normalization.physical_min_extent_m, `${scene.short_label} physical scale bounds are invalid.`);
}

const mugSlot = directorQualificationCastSlot("small_detail");
assert(mugSlot, "Small-detail qualification slot missing.");
const mug = asset({ id: "qualification_mug", label: "coffee mug", dimensions: [0.13, 0.11, 0.1] });
const heroScene = directorQualificationScene("scene_c_hero_object");
const mugPresentation = normalizeAssetForDirectorQualification({
  asset: mug,
  slot: mugSlot,
  scene: heroScene,
  role_kind: "primary",
  policy: "presentation_normalized",
});
const mugPhysical = normalizeAssetForDirectorQualification({
  asset: mug,
  slot: mugSlot,
  scene: heroScene,
  role_kind: "primary",
  policy: "physical_context",
});
assert(mugPresentation.target_extent_m > 0.8, "Fair-display mug should be enlarged enough to judge cinematography instead of appearing microscopic.");
assert(mugPhysical.target_extent_m < 0.3, "Physical-context mug should retain a plausible real-world scale.");
assert(mugPresentation.logical_extent_source === "concept_profile", "Existing logical-size profiles should ground known asset classes.");

const vehicleSlot = directorQualificationCastSlot("vehicle");
assert(vehicleSlot, "Vehicle qualification slot missing.");
const carPhysical = normalizeAssetForDirectorQualification({
  asset: asset({ id: "qualification_car", label: "race car", dimensions: [4.4, 1.25, 1.9] }),
  slot: vehicleSlot,
  scene: directorQualificationScene("scene_d_travelling_subject"),
  role_kind: "primary",
  policy: "physical_context",
});
assert(carPhysical.target_extent_m >= 3 && carPhysical.target_extent_m <= 5.5, "Vehicle physical stress must preserve a plausible large horizontal actor scale within Scene D bounds.");

const room = source("sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx");
for (const marker of [
  "resolveQualificationPools",
  "score.semantic > 0",
  "Stable baseline",
  "Rotating diversity",
  "Physical-size stress",
  "flattenFamilyCandidates",
  "for (const passKind of passKinds(input.coverage))",
  "adjustBlockingPositions",
  "minimum_clearance_m",
  "Asset coverage & normalization",
  "Scale false-negative guard",
  "globalPoolAssetCount",
  "scheduledAssetIds.size",
  "source_largest_extent_m",
  "logical_extent_m",
  "target_extent_m",
  "render_scale_multiplier",
  "normalization_warning",
  "blocking_position",
  "unrelated assets are not substituted",
  "render_scale_bounds: [0.02, 40]",
  "scale_ground_offset_with_render: true",
]) {
  assert(room.includes(marker), `Qualification Room coverage/normalization marker missing: ${marker}.`);
}
assert((room.match(/<Canvas/g) ?? []).length === 1, "Coverage refinement must retain exactly one Qualification Room Canvas.");
assert(!room.includes("familyCapabilities.length * primarySlots.length"), "Old capability × fixed-class cross-product planning must be retired.");

const preview = source("sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx");
for (const marker of [
  "render_scale_bounds?: [number, number]",
  "scaleBounds?: [number, number]",
  "const minimumScale = scaleBounds?.[0] ?? 0.08",
  "scaleBounds={resolvedRole.render_scale_bounds}",
  "scale_ground_offset_with_render?: boolean",
  "scaleGroundOffset={resolvedRole.scale_ground_offset_with_render}",
  "const renderedGroundOffset = groundOffset * (scaleGroundOffset ? scale : 1)",
]) {
  assert(preview.includes(marker), `Shared real-asset preview is missing qualification scale-bound marker: ${marker}.`);
}

const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
for (const marker of [
  "Phase 1B.7A.1 — Qualification coverage + scale normalization",
  "qualification pool",
  "presentation_normalized",
  "physical_context",
  "Qualification scale guard",
]) {
  assert(readme.includes(marker), `Qualification README is missing coverage/normalization marker: ${marker}.`);
}

console.log("Director Qualification Room Phase 1B.7A.1 coverage + normalization verification passed.");
console.log(`${families.length} Level 2 audition families retain exact 184-capability coverage while all nine geometry classes participate across the suite.`);
console.log("Stable baseline + rotating diversity + physical stress are separated; source size and audition normalization evidence are recorded before visual judgment.");
