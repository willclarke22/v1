import { readFileSync } from "node:fs";
import { join } from "node:path";

import { logicalAssetSizeDecision } from "../../sandbox/probe-lab/assets/logical-asset-size";
import {
  DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS,
  DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT,
  directorQualificationAssetMatchesExactSemanticLabel,
  directorQualificationFindInsideValidationAsset,
  directorQualificationInsideValidationFixtureForPass,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function approx(left: number, right: number, epsilon = 1e-6) {
  return Math.abs(left - right) <= epsilon;
}

const baseline = directorQualificationInsideValidationFixtureForPass("baseline");
const diversity = directorQualificationInsideValidationFixtureForPass("diversity");
assert(
  baseline?.id === "pineapple_in_bathtub" &&
    baseline.source_cast_slot_id === "irregular_hero" &&
    baseline.receiver_cast_slot_id === "furniture" &&
    diversity?.id === "apple_in_existing_mug" &&
    diversity.source_cast_slot_id === "small_detail" &&
    diversity.receiver_cast_slot_id === "small_detail",
  "A.11A.15 explicit Inside fixtures must carry stable qualification roles instead of depending on generic cast reclassification.",
);

const capsAssets = [
  { asset_id: "pineapple_caps", canonical_label: "Pineapple" },
  { asset_id: "bathtub_caps", canonical_label: "Bathtub" },
  { asset_id: "apple_caps", canonical_label: "Apple" },
  {
    asset_id: "coffee_mug_bk_mritny8x",
    canonical_label: "Coffee Mug",
  },
] as const;
assert(
  directorQualificationAssetMatchesExactSemanticLabel(
    capsAssets[0],
    ["pineapple"],
  ) &&
    directorQualificationAssetMatchesExactSemanticLabel(
      capsAssets[1],
      ["bathtub"],
    ),
  "A.11A.15 semantic discovery must resolve capitalized Pineapple/Bathtub labels case-insensitively.",
);
assert(
  directorQualificationFindInsideValidationAsset(capsAssets, {
    preferred_asset_ids: [],
    phrases: ["pineapple"],
  })?.asset_id === "pineapple_caps" &&
    directorQualificationFindInsideValidationAsset(capsAssets, {
      preferred_asset_ids: [],
      phrases: ["bathtub", "bath tub"],
    })?.asset_id === "bathtub_caps" &&
    directorQualificationFindInsideValidationAsset(capsAssets, {
      preferred_asset_ids: ["coffee_mug_bk_mritny8x"],
      phrases: ["mug"],
    })?.asset_id === "coffee_mug_bk_mritny8x",
  "A.11A.15 fixture selection must prefer exact semantic identity and the established mug ID.",
);

const sizes = {
  pineapple: logicalAssetSizeDecision({ concept: "pineapple" }).target_extent_m,
  bathtub: logicalAssetSizeDecision({ concept: "bathtub" }).target_extent_m,
  apple: logicalAssetSizeDecision({ concept: "apple" }).target_extent_m,
  mug: logicalAssetSizeDecision({ concept: "coffee mug" }).target_extent_m,
};
assert(
  approx(sizes.pineapple, 0.3) &&
    approx(sizes.bathtub, 1.7) &&
    approx(sizes.apple, 0.09) &&
    approx(sizes.mug, 0.13),
  `A.11A.15 logical fixture sizes drifted: ${JSON.stringify(sizes)}`,
);
assert(
  DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS[0] <= 0.001 &&
    DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT === 4,
  "A.11A.15 must allow source-unit correction for small real fixtures while capping heavy Support/Containment browser inspection at four receivers.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  "function directorInsideValidationFixtureNormalization",
  "inside_fixture_asset_authoritative:",
  "fixture.source_cast_slot_id",
  "fixture.receiver_cast_slot_id",
  "qualificationScaleBounds(input.target_normalization)",
  "render_scale_bounds: [0.02, 40] as [number, number]",
  "current.render_scale_bounds = qualificationScaleBounds(role.normalization)",
  "DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT",
  "Math.min(2, Math.max(1, candidates.length))",
  "inside_fixture_${fixture.id}_source_not_found_or_not_loadable",
  "inside_fixture_${fixture.id}_receiver_not_found_or_not_loadable",
  "inside_fixture_${fixture.id}_receiver_not_physically_inspected",
  "inside_fixture_${fixture.id}_receiver_has_no_verified_open_cavity",
  "inside_fixture_${fixture.id}_pair_failed_real_scale_fit",
]) {
  assert(room.includes(marker), `A.11A.15 Qualification Room marker missing: ${marker}`);
}
const inspectionStart = room.indexOf("const physicalInspectionCandidates = useMemo");
const inspectionEnd = room.indexOf("const physicalInspectionKey = useMemo", inspectionStart);
assert(
  inspectionStart >= 0 && inspectionEnd > inspectionStart,
  "A.11A.15 could not locate Support/Containment physical-inspection planning.",
);
const inspectionSection = room.slice(inspectionStart, inspectionEnd);
assert(
  !inspectionSection.includes("preferredReceivers") &&
    !inspectionSection.includes("semanticContainers") &&
    inspectionSection.includes('const contactReadabilityReceivers = ["chair", "stool"]'),
  "A.11A.15 must not speculatively inspect generic receiver pools/containers after the exact four-receiver plan.",
);

const shell = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "DIRECTOR_ASSET_LIBRARY_CACHE",
  "DIRECTOR_ASSET_LIBRARY_INFLIGHT",
  '?view=qualification',
  'loadAssets("qualification")',
  'loadAssets("full")',
  "qualificationAssetsLoaded",
]) {
  assert(shell.includes(marker), `A.11A.15 lazy Asset Library marker missing: ${marker}`);
}
assert(
  (shell.match(/fetch\("\/api\/sandbox\/probe-lab\/assets\/library"/g) ?? [])
    .length === 1,
  "A.11A.15 must preserve one shared Director Asset Library fetch path.",
);
assert(
  !shell.includes("if (assetsLoaded || isLoadingAssets || assetError) return;\n    void loadAssets();"),
  "A.11A.15 must retire eager whole-library loading on Director page mount.",
);

const route = source("sandbox/probe-lab/assets/routes/library.ts");
for (const marker of [
  'view === "qualification"',
  'asset.asset_type === "glb" || asset.asset_type === "gltf"',
  'asset.semantic_review_status !== "mismatch"',
  "selectedAssets.map(assetWithFileStats)",
]) {
  assert(route.includes(marker), `A.11A.15 qualification Asset Library route marker missing: ${marker}`);
}
const selectedIndex = route.indexOf("const selectedAssets");
const statIndex = route.indexOf("selectedAssets.map(assetWithFileStats)");
assert(
  selectedIndex >= 0 && statIndex > selectedIndex,
  "A.11A.15 must filter the qualification Asset Library view before file-stat work.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.7A.11A.15 — Inside real-scale fixtures + Qualification lazy-loading",
  "Pineapple → Bathtub",
  "Apple → `coffee_mug_bk_mritny8x`",
  "Pineapple ≈ 0.30 m",
  "Bathtub ≈ 1.70 m",
  "Apple ≈",
  "Coffee Mug ≈ 0.13 m",
  "Support & containment browser mesh inspection",
  "four exact",
]) {
  assert(readme.includes(marker), `A.11A.15 README marker missing: ${marker}`);
}

console.log(
  "Director Support & containment Phase 1B.7A.11A.15 real-scale fixtures + lazy-loading verification passed.",
);
console.log(
  "Pineapple/Bathtub resolve case-insensitively with explicit fixture roles; pineapple≈0.30m, bathtub≈1.70m, apple≈0.09m and mug≈0.13m use fixture-only wide unit correction. Director Asset Library loading is lazy/cached, qualification-filtered before file stats, and Support/Containment mesh inspection is capped at four exact receivers with two workers.",
);
