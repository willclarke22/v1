import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  directorQualificationInsidePairIndex,
  directorQualificationIsDrinkwareSource,
  directorQualificationOnSurfacePairIndex,
  directorQualificationSelectDistinctOnSurfacePairs,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";
import {
  directorPhysicalInsideAccessTravel,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const family = families.find(
  (candidate) =>
    candidate.category === "blocking_placement" &&
    candidate.group === "Support & containment",
);
assert(family, "Support & containment qualification family is missing.");

const onSurfaceProfile = directorQualificationCapabilityProfile(family, "on_surface");
assert(
  onSurfaceProfile.suitable_primary_cast_slots[0] === "simple_rigid" &&
    onSurfaceProfile.suitable_primary_cast_slots.includes("small_asymmetric") &&
    onSurfaceProfile.suitable_primary_cast_slots.includes("irregular_hero") &&
    onSurfaceProfile.qualification_note?.includes("non-mug/non-cup"),
  "A.11A.11 On Surface source-generalization profile drifted.",
);

assert(
  directorQualificationIsDrinkwareSource({
    asset_id: "coffee_mug_canary",
    canonical_label: "ceramic coffee mug",
  }),
  "A.11A.11 must exclude mug/cup drinkware from On Surface source-generalization evidence.",
);
assert(
  !directorQualificationIsDrinkwareSource({
    asset_id: "hardcover_book_canary",
    canonical_label: "hardcover book",
    semantic_tags: ["book", "rigid", "prop"],
  }),
  "A.11A.11 must admit non-drinkware rigid props to On Surface source-generalization evidence.",
);

const syntheticPairs = [
  { source_asset: { asset_id: "book" }, target: { asset: { asset_id: "bench" } } },
  { source_asset: { asset_id: "book" }, target: { asset: { asset_id: "table" } } },
  { source_asset: { asset_id: "lantern" }, target: { asset: { asset_id: "bench" } } },
  { source_asset: { asset_id: "lantern" }, target: { asset: { asset_id: "stool" } } },
  { source_asset: { asset_id: "burger" }, target: { asset: { asset_id: "chair" } } },
  { source_asset: { asset_id: "apple" }, target: { asset: { asset_id: "table" } } },
] as const;
const selectedPairs = directorQualificationSelectDistinctOnSurfacePairs(syntheticPairs);
assert(
  new Set(selectedPairs.map((pair) => pair.source_asset.asset_id)).size ===
    selectedPairs.length,
  "A.11A.11 On Surface pair policy must keep every selected source asset distinct.",
);
assert(
  selectedPairs.slice(0, 3).every(
    (pair, index, list) =>
      list.findIndex(
        (candidate) => candidate.target.asset.asset_id === pair.target.asset.asset_id,
      ) === index,
  ),
  "A.11A.11 On Surface pair policy should prefer distinct receivers before reusing one.",
);
assert(
  directorQualificationOnSurfacePairIndex({
    pass_kind: "baseline",
    variant_index: 0,
    pair_count: 2,
    canaries_per_pass: 3,
  }) === null,
  "A.11A.11 must fail closed when fewer than three generalized On Surface source pairs exist.",
);
assert(
  directorQualificationOnSurfacePairIndex({
    pass_kind: "diversity",
    variant_index: 0,
    pair_count: 6,
    canaries_per_pass: 3,
  }) === 3,
  "A.11A.11 Diversity should use the next distinct On Surface source set when six pairs exist.",
);
assert(
  directorQualificationInsidePairIndex({
    pass_kind: "diversity",
    pair_count: 1,
  }) === null &&
    directorQualificationInsidePairIndex({
      pass_kind: "diversity",
      pair_count: 2,
    }) === 1,
  "Inside diversity must require a genuinely second pair and must never wrap the baseline pair.",
);

const inside = DIRECTOR_CAPABILITIES.find((capability) => capability.id === "inside");
assert(inside, "Inside capability is missing.");
const insideMoment = directorCapabilityDemoMoment(inside);
const insideCue = insideMoment.shot?.blocking.find(
  (cue) => cue.relation === "inside",
);
assert(insideCue, "Inside demo blocking cue is missing.");
assert(
  insideCue.parameters.physical_containment_readability_near_opening === true,
  "Inside qualification demo must opt into near-opening readability placement.",
);
assert(
  insideMoment.shot?.composition.angle === "high_angle",
  "Inside qualification must retain the high-angle proof camera.",
);

const availableSpan = 0.5881145066640023 - 0.17 - 0.008 * 2;
const maximumSafeOneDirectionTravel = availableSpan * 0.5;
const productionTravel = directorPhysicalInsideAccessTravel({
  available_span_m: availableSpan,
  actor_height_m: 0.17,
  qualification_readability_near_opening: false,
});
const qualificationTravel = directorPhysicalInsideAccessTravel({
  available_span_m: availableSpan,
  actor_height_m: 0.17,
  qualification_readability_near_opening: true,
});
assert(
  productionTravel > 0 && productionTravel < 0.03,
  `Production Inside centering unexpectedly changed: ${productionTravel.toFixed(4)}m.`,
);
assert(
  qualificationTravel > productionTravel * 5,
  `Qualification readability travel is not meaningfully stronger: ${qualificationTravel.toFixed(4)}m versus ${productionTravel.toFixed(4)}m.`,
);
assert(
  qualificationTravel <= maximumSafeOneDirectionTravel * 0.801 &&
    qualificationTravel >= maximumSafeOneDirectionTravel * 0.799,
  `Qualification Inside placement must use 80% of safe one-direction travel without crossing the cavity boundary; got ${qualificationTravel.toFixed(4)}m of ${maximumSafeOneDirectionTravel.toFixed(4)}m.`,
);

// Current-phase integration checks are intentionally narrow. Durable predecessor
// behavior lives in the earned-boundaries verifier; this script is not meant to
// become another permanent snapshot of local variable names or UI copy.
const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "director-qualification-support-containment-policy",
  "directorQualificationIsDrinkwareSource(asset)",
  "directorQualificationSelectDistinctOnSurfacePairs(ranked)",
  "directorQualificationOnSurfacePairIndex({",
  "directorQualificationInsidePairIndex({",
  "fewer_than_three_distinct_non_drinkware_on_surface_sources_fit",
  "open_container_evidence_found_but_no_distinct_real_source_receiver_pair_fits_pass",
  'if (physicalRelation === "inside" && !insidePair) return null',
  'if (physicalRelation === "on_surface" && !onSurfacePair) return null',
]) {
  assert(room.includes(marker), `A.11A.11 Qualification Room integration marker missing: ${marker}.`);
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
assert(
  registry.includes(
    'physical_containment_readability_near_opening: capability.id === "inside"',
  ) && registry.includes('physical_contact_readability_oblique: capability.id === "attached_to"'),
  "A.11A.11 must add Inside readability without regressing Attached-To oblique proof.",
);

const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
assert(
  readme.includes(
    "Phase 1B.7A.11A.11 — Inside readability + On Surface source generalization",
  ) && readme.includes("Successor verifier policy"),
  "Director README is missing the A.11A.11 or successor-verifier policy note.",
);

console.log(
  "Director Support & containment Phase 1B.7A.11A.11 readability + generalization verification passed.",
);
console.log(
  `Inside qualification moves ${qualificationTravel.toFixed(3)}m toward the verified opening versus ${productionTravel.toFixed(3)}m in ordinary production placement, while staying at 80% of the safe centre-travel limit.`,
);
console.log(
  "On Surface uses a pure, testable source-generalization policy: drinkware is excluded, selected source IDs are distinct, receiver diversity is preferred, fewer than three compatible sources fail closed, and Inside later passes do not wrap the baseline pair.",
);
