export const DIRECTOR_QUALIFICATION_DRINKWARE_SOURCE_HINTS = [
  "mug",
  "cup",
  "teacup",
  "tumbler",
] as const;

export type DirectorQualificationSemanticAsset = {
  asset_id: string;
  canonical_label?: string | null;
  verified_canonical_label?: string | null;
  display_name?: string | null;
  requested_concept?: string | null;
  source_display_name?: string | null;
  aliases?: readonly string[] | null;
  verified_aliases?: readonly string[] | null;
  semantic_tags?: readonly string[] | null;
  preferred_for_concepts?: readonly string[] | null;
};

export type DirectorQualificationPassKindLike =
  | "baseline"
  | "diversity"
  | "physical_stress";


export const DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES = [
  {
    id: "pineapple_in_bathtub",
    pass_kind: "baseline",
    label: "Pineapple inside bathtub",
    source_phrases: ["pineapple"],
    receiver_phrases: ["bathtub", "bath tub"],
    preferred_source_asset_ids: [],
    preferred_receiver_asset_ids: [],
    source_cast_slot_id: "irregular_hero",
    receiver_cast_slot_id: "furniture",
  },
  {
    id: "apple_in_existing_mug",
    pass_kind: "diversity",
    label: "Apple inside coffee mug",
    source_phrases: ["apple"],
    receiver_phrases: ["coffee mug", "mug"],
    preferred_source_asset_ids: [],
    preferred_receiver_asset_ids: ["coffee_mug_bk_mritny8x"],
    source_cast_slot_id: "small_detail",
    receiver_cast_slot_id: "small_detail",
  },
] as const;

export type DirectorQualificationInsideValidationFixture =
  (typeof DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES)[number];

export const DIRECTOR_QUALIFICATION_INSIDE_FIXTURE_RENDER_SCALE_BOUNDS = [
  0.001,
  100,
] as const;

export const DIRECTOR_QUALIFICATION_SUPPORT_CONTAINMENT_INSPECTION_LIMIT = 4;

export const DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M = 0.35;

export type DirectorQualificationInsideDetailCameraProfile = {
  framing: "insert";
  angle: "high_angle";
  focal_length_mm: number;
  field_of_view_degrees: number;
  focus_entity_id: "secondary_subject";
};

export function directorQualificationInsideDetailCameraProfile(
  receiverTargetExtentM: number | null | undefined,
): DirectorQualificationInsideDetailCameraProfile | null {
  const receiverExtent = Number(receiverTargetExtentM);
  if (
    !Number.isFinite(receiverExtent) ||
    receiverExtent <= 0 ||
    receiverExtent > DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M
  ) {
    return null;
  }
  return {
    framing: "insert",
    angle: "high_angle",
    focal_length_mm: 72,
    field_of_view_degrees: 34,
    focus_entity_id: "secondary_subject",
  };
}

// A.11A.17 qualification readability remains geometric rather than semantic.
// The Room may sample a bounded number of source assets, but no asset class is
// categorically banned from On Surface or Inside when measured fit succeeds.
export const DIRECTOR_QUALIFICATION_ON_SURFACE_SOURCE_SCAN_LIMIT = 24;
export const DIRECTOR_QUALIFICATION_INSIDE_SOURCE_SCAN_LIMIT = 18;
export const DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_RECEIVER_HEIGHT_M = 0.06;
export const DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_RECEIVER_HEIGHT_ASPECT = 0.055;
export const DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_HEIGHT_RATIO = 0.22;
export const DIRECTOR_QUALIFICATION_ON_SURFACE_MAX_BLOCKED_FRACTION = 0.55;

export function directorQualificationSupportReceiverLooksGroundLike(
  worldSize: readonly number[],
) {
  const width = Math.max(0, Math.abs(Number(worldSize[0]) || 0));
  const height = Math.max(0, Math.abs(Number(worldSize[1]) || 0));
  const depth = Math.max(0, Math.abs(Number(worldSize[2]) || 0));
  const horizontal = Math.max(width, depth, 1e-6);
  return (
    height < DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_RECEIVER_HEIGHT_M ||
    height / horizontal <
      DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_RECEIVER_HEIGHT_ASPECT
  );
}

export function directorQualificationSupportSurfaceIsPerceptuallyEligible(input: {
  normal_y: number;
  exposure?: string | null;
  openness?: string | null;
  blocked_fraction?: number | null;
  height_ratio?: number | null;
}) {
  const blocked = Math.max(
    0,
    Math.min(1, Number(input.blocked_fraction) || 0),
  );
  const heightRatio =
    input.height_ratio == null || !Number.isFinite(Number(input.height_ratio))
      ? null
      : Math.max(0, Math.min(1, Number(input.height_ratio)));
  return (
    Number(input.normal_y) >= 0.45 &&
    input.exposure !== "interior" &&
    input.openness !== "enclosed" &&
    blocked <= DIRECTOR_QUALIFICATION_ON_SURFACE_MAX_BLOCKED_FRACTION &&
    (heightRatio === null ||
      heightRatio >= DIRECTOR_QUALIFICATION_ON_SURFACE_MIN_HEIGHT_RATIO)
  );
}

export function directorQualificationAdaptiveContainmentClearance(
  regionSize: readonly number[],
  preferredClearance = 0.008,
) {
  const positive = regionSize
    .map((value) => Math.abs(Number(value) || 0))
    .filter((value) => value > 1e-6);
  const narrowest = positive.length ? Math.min(...positive) : 0;
  if (narrowest <= 0) return Math.max(0.0015, preferredClearance);
  return Math.min(
    Math.max(0.0015, preferredClearance),
    Math.max(0.0015, narrowest * 0.04),
  );
}

export function directorQualificationContainedSourceFitFloor(
  logicalMinimumExtentM: number,
) {
  const logicalMinimum = Math.max(0.02, Number(logicalMinimumExtentM) || 0.02);
  // Qualification may use a genuinely small specimen (e.g. a small apple) but
  // cannot collapse an object to an arbitrary miniature merely to force a pass.
  return Math.max(0.045, logicalMinimum * 0.75);
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function directorQualificationSemanticAssetWords(
  asset: DirectorQualificationSemanticAsset,
) {
  return new Set(
    normalizedWords(
      [
        asset.asset_id,
        asset.canonical_label,
        asset.verified_canonical_label,
        asset.display_name,
        asset.requested_concept,
        asset.source_display_name,
        ...(asset.aliases ?? []),
        ...(asset.verified_aliases ?? []),
        ...(asset.semantic_tags ?? []),
        ...(asset.preferred_for_concepts ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );
}

function normalizedSemanticValue(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function directorQualificationAssetMatchesExactSemanticLabel(
  asset: DirectorQualificationSemanticAsset,
  phrases: readonly string[],
) {
  const fields = [
    asset.canonical_label,
    asset.verified_canonical_label,
    asset.display_name,
    asset.requested_concept,
    asset.source_display_name,
    ...(asset.aliases ?? []),
    ...(asset.verified_aliases ?? []),
    ...(asset.semantic_tags ?? []),
    ...(asset.preferred_for_concepts ?? []),
  ]
    .map((value) => normalizedSemanticValue(value))
    .filter(Boolean);
  const wanted = phrases
    .map((phrase) => normalizedSemanticValue(phrase))
    .filter(Boolean);
  return wanted.some((phrase) => fields.includes(phrase));
}

export function directorQualificationAssetMatchesSemanticPhrases(
  asset: DirectorQualificationSemanticAsset,
  phrases: readonly string[],
) {
  const words = directorQualificationSemanticAssetWords(asset);
  return phrases.some((phrase) => {
    const phraseWords = normalizedWords(phrase);
    return phraseWords.length > 0 && phraseWords.every((word) => words.has(word));
  });
}

export function directorQualificationInsideValidationFixtureForPass(
  passKind: DirectorQualificationPassKindLike,
) {
  return (
    DIRECTOR_QUALIFICATION_INSIDE_VALIDATION_FIXTURES.find(
      (fixture) => fixture.pass_kind === passKind,
    ) ?? null
  );
}

export function directorQualificationFindInsideValidationAsset<
  T extends DirectorQualificationSemanticAsset,
>(
  assets: readonly T[],
  input: {
    preferred_asset_ids: readonly string[];
    phrases: readonly string[];
  },
) {
  for (const assetId of input.preferred_asset_ids) {
    const exact = assets.find((asset) => asset.asset_id === assetId);
    if (exact) return exact;
  }
  return (
    assets.find((asset) =>
      directorQualificationAssetMatchesExactSemanticLabel(asset, input.phrases),
    ) ??
    assets.find((asset) =>
      directorQualificationAssetMatchesSemanticPhrases(asset, input.phrases),
    ) ??
    null
  );
}

// Historical A.11A.11 helper retained for lineage/audits. A.11A.17 no longer
// uses semantic drinkware exclusion as an On Surface qualification rule.
export function directorQualificationIsDrinkwareSource(
  asset: DirectorQualificationSemanticAsset,
) {
  const words = directorQualificationSemanticAssetWords(asset);
  return DIRECTOR_QUALIFICATION_DRINKWARE_SOURCE_HINTS.some((hint) =>
    words.has(hint),
  );
}

export function directorQualificationSelectDistinctOnSurfacePairs<
  T extends {
    source_asset: { asset_id: string };
    target: { asset: { asset_id: string } };
  },
>(rankedPairs: readonly T[]) {
  const selected: T[] = [];
  const usedSources = new Set<string>();
  const usedTargets = new Set<string>();

  // Prefer distinct source + distinct receiver first.
  for (const pair of rankedPairs) {
    if (
      usedSources.has(pair.source_asset.asset_id) ||
      usedTargets.has(pair.target.asset.asset_id)
    ) {
      continue;
    }
    selected.push(pair);
    usedSources.add(pair.source_asset.asset_id);
    usedTargets.add(pair.target.asset.asset_id);
  }

  // Source diversity is mandatory; receiver diversity is best effort.
  for (const pair of rankedPairs) {
    if (usedSources.has(pair.source_asset.asset_id)) continue;
    selected.push(pair);
    usedSources.add(pair.source_asset.asset_id);
  }

  return selected;
}

export function directorQualificationOnSurfacePairIndex(input: {
  pass_kind: DirectorQualificationPassKindLike;
  variant_index: number;
  pair_count: number;
  canaries_per_pass?: number;
}) {
  const canariesPerPass = Math.max(
    1,
    Math.floor(Number(input.canaries_per_pass) || 3),
  );
  const pairCount = Math.max(0, Math.floor(Number(input.pair_count) || 0));
  const variantIndex = Math.floor(Number(input.variant_index) || 0);
  if (
    pairCount < canariesPerPass ||
    variantIndex < 0 ||
    variantIndex >= canariesPerPass
  ) {
    return null;
  }

  const passOffset =
    input.pass_kind === "baseline"
      ? 0
      : input.pass_kind === "diversity"
        ? canariesPerPass
        : canariesPerPass * 2;
  const index = passOffset + variantIndex;
  // A.11A.17 evidence never wraps an earlier source/receiver pair into a later
  // pass. If the library cannot supply a fresh Cross-asset set, qualification
  // reports the explicit coverage gap instead of relabeling repeated evidence.
  return index < pairCount ? index : null;
}

export function directorQualificationInsidePairKey(
  sourceAssetId: string | null | undefined,
  receiverAssetId: string | null | undefined,
) {
  if (!sourceAssetId || !receiverAssetId) return null;
  return `${sourceAssetId}\u0000${receiverAssetId}`;
}

export function directorQualificationSelectDistinctInsidePairs<
  T extends {
    source_asset: { asset_id: string };
    target: { asset: { asset_id: string } };
  },
>(rankedPairs: readonly T[]) {
  const selected: T[] = [];
  const usedPairKeys = new Set<string>();

  // A physical target scan can yield several candidate regions on the same
  // receiver. Qualification diversity is about independent real asset pairs,
  // not alternate regions on one source/receiver combination. rankedPairs is
  // already score-sorted, so retain only the strongest candidate per identity.
  for (const pair of rankedPairs) {
    const key = directorQualificationInsidePairKey(
      pair.source_asset.asset_id,
      pair.target.asset.asset_id,
    );
    if (!key || usedPairKeys.has(key)) continue;
    usedPairKeys.add(key);
    selected.push(pair);
  }

  return selected;
}

export function directorQualificationInsidePairIndex(input: {
  pass_kind: DirectorQualificationPassKindLike;
  pair_count: number;
}) {
  const pairCount = Math.max(0, Math.floor(Number(input.pair_count) || 0));
  const index =
    input.pass_kind === "baseline"
      ? 0
      : input.pass_kind === "diversity"
        ? 1
        : 2;
  return index < pairCount ? index : null;
}
