import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES,
  directorQualificationAssetMatchesSemanticPhrases,
  directorQualificationFindInsideValidationAsset,
  directorQualificationInsideValidationFixtureForPass,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES.length === 2,
  "A.11A.14 must define exactly two Cross-asset Inside validation fixtures.",
);
const baseline = directorQualificationInsideValidationFixtureForPass("baseline");
const diversity = directorQualificationInsideValidationFixtureForPass("diversity");
assert(
  baseline?.id === "pineapple_in_bathtub" &&
    baseline.source_phrases.includes("pineapple") &&
    baseline.receiver_phrases.some((phrase) => phrase.includes("bathtub")),
  "A.11A.14 baseline must be pineapple inside bathtub.",
);
assert(
  diversity?.id === "apple_in_existing_mug" &&
    diversity.source_phrases.includes("apple") &&
    diversity.preferred_receiver_asset_ids.includes("coffee_mug_bk_mritny8x"),
  "A.11A.14 diversity must be apple inside the established coffee mug.",
);

const syntheticAssets = [
  { asset_id: "pineapple_asset", canonical_label: "Pineapple" },
  { asset_id: "apple_asset", canonical_label: "Apple" },
  { asset_id: "bathtub_asset", canonical_label: "White Bathtub" },
  {
    asset_id: "coffee_mug_bk_mritny8x",
    canonical_label: "Ceramic Coffee Mug",
  },
];
assert(
  directorQualificationAssetMatchesSemanticPhrases(
    syntheticAssets[1]!,
    ["apple"],
  ) &&
    !directorQualificationAssetMatchesSemanticPhrases(
      syntheticAssets[0]!,
      ["apple"],
    ),
  "A.11A.14 apple matching must not accidentally select pineapple.",
);
assert(
  directorQualificationFindInsideValidationAsset(syntheticAssets, {
    preferred_asset_ids: diversity!.preferred_receiver_asset_ids,
    phrases: diversity!.receiver_phrases,
  })?.asset_id === "coffee_mug_bk_mritny8x",
  "A.11A.14 must prefer the established mug identity when it is present.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
for (const marker of [
  '"bathtub"',
  '"tub"',
  "function directorInsideValidationFixturePair",
  "return directorInsideValidationFixturePair(input);",
  "Inside validation · ${",
  "QUALIFICATION_PHYSICAL_INSPECTION_CACHE",
  "inspectDirectorQualificationPhysicalAssetCached",
  "...insideFixtureReceivers",
  "...contactReadabilityReceivers",
  ".slice(0, 8)",
  "plannedClips.flatMap((clip) => clip.roles.map((role) => role.asset.asset_id))",
]) {
  assert(room.includes(marker), `A.11A.14 Qualification Room marker missing: ${marker}`);
}
assert(
  !room.includes(".slice(0, 18)"),
  "A.11A.14 must retire the broad eighteen-receiver physical-inspection scan.",
);
assert(
  room.includes(
    "await inspectDirectorQualificationPhysicalAssetCached(asset)",
  ),
  "A.11A.14 Support/Containment physical inspection must use the module-lived exact-GLB cache.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.7A.11A.14 — Inside validation fixtures + Qualification load efficiency",
  "pineapple inside bathtub",
  "apple inside the established `coffee_mug_bk_mritny8x` mug",
  "absolute cap of eight",
  "cached at module scope",
]) {
  assert(readme.includes(marker), `A.11A.14 README marker missing: ${marker}`);
}

console.log(
  "Director Support & containment Phase 1B.7A.11A.14 Inside fixtures + load-efficiency verification passed.",
);
console.log(
  "Cross-asset Inside is now pinned to pineapple→bathtub and apple→the established mug, while Support/Containment browser physical inspection is bounded to at most eight prioritized receivers and reuses exact GLB+rotation inspections across Room remounts.",
);
