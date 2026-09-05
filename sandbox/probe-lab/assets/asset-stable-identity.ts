/**
 * Cross-runtime asset identity helpers.
 *
 * MyWay deliberately separates:
 * - asset_uid: immutable internal identity,
 * - asset_id: migratable technical slug,
 * - semantic identity: labels/aliases/tags used for matching.
 *
 * This module has no Node-only dependencies so the same rules can be used by
 * server registry code and browser Director/Qualification code.
 */

export type MyWayStableAssetIdentityLike = {
  asset_id: string;
  asset_uid?: string | null;
  legacy_asset_ids?: readonly string[] | null;
  canonical_label?: string | null;
  verified_canonical_label?: string | null;
  display_name?: string | null;
  requested_concept?: string | null;
  source_display_name?: string | null;
  aliases?: readonly string[] | null;
  verified_aliases?: readonly string[] | null;
  semantic_tags?: readonly string[] | null;
  preferred_for_concepts?: readonly string[] | null;
  contains?: readonly string[] | null;
  affordances?: readonly string[] | null;
};

export type MyWayAssetReferenceMatchKind =
  | "asset_uid"
  | "asset_id"
  | "legacy_asset_id";

export function normalizeAssetIdLike(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function fnv1a32(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Legacy registries predate asset_uid. Derive a deterministic UID from the
 * first technical ID they are seen with, then persist that UID on the next
 * registry mutation. renameMyWayAssetId always carries it forward unchanged.
 */
export function legacyAssetUidForAssetId(assetId: string) {
  const normalized = normalizeAssetIdLike(assetId) || "asset";
  const forward = fnv1a32(normalized, 0x811c9dc5)
    .toString(16)
    .padStart(8, "0");
  const reverse = fnv1a32(
    [...normalized].reverse().join(""),
    0x9e3779b9,
  )
    .toString(16)
    .padStart(8, "0");
  return `asset_v1_${forward}${reverse}`;
}

export function normalizeAssetUid(
  value: string | null | undefined,
  assetId: string,
) {
  const candidate = String(value ?? "").trim();
  return candidate || legacyAssetUidForAssetId(assetId);
}

export function normalizeLegacyAssetIds(
  value: unknown,
  currentAssetId: string,
) {
  const current = normalizeAssetIdLike(currentAssetId);
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalizeAssetIdLike)
        .filter((entry) => Boolean(entry) && entry !== current),
    ),
  );
}

export function assetReferenceMatchKind(
  asset: MyWayStableAssetIdentityLike,
  reference: string | null | undefined,
): MyWayAssetReferenceMatchKind | null {
  const rawReference = String(reference ?? "").trim();
  if (!rawReference) return null;

  if (
    asset.asset_uid?.trim() &&
    rawReference === asset.asset_uid.trim()
  ) {
    return "asset_uid";
  }

  const normalizedReference = normalizeAssetIdLike(rawReference);
  if (!normalizedReference) return null;

  if (normalizeAssetIdLike(asset.asset_id) === normalizedReference) {
    return "asset_id";
  }

  if (
    (asset.legacy_asset_ids ?? [])
      .map(normalizeAssetIdLike)
      .includes(normalizedReference)
  ) {
    return "legacy_asset_id";
  }

  return null;
}

export function assetMatchesAnyReference(
  asset: MyWayStableAssetIdentityLike,
  references: readonly string[] | null | undefined,
) {
  return Boolean(
    (references ?? []).some((reference) =>
      assetReferenceMatchKind(asset, reference),
    ),
  );
}

export function resolveAssetByReference<
  T extends MyWayStableAssetIdentityLike,
>(
  assets: readonly T[],
  reference: string | null | undefined,
) {
  const asset = assets.find((candidate) =>
    assetReferenceMatchKind(candidate, reference),
  );
  if (!asset) return null;
  return {
    asset,
    match_kind: assetReferenceMatchKind(asset, reference)!,
  } as const;
}

export function normalizeAssetSemanticPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function assetSemanticIdentityValues(
  asset: MyWayStableAssetIdentityLike,
) {
  return [
    asset.asset_id,
    ...(asset.legacy_asset_ids ?? []),
    asset.canonical_label,
    asset.verified_canonical_label,
    asset.display_name,
    asset.requested_concept,
    asset.source_display_name,
    ...(asset.aliases ?? []),
    ...(asset.verified_aliases ?? []),
    ...(asset.semantic_tags ?? []),
    ...(asset.preferred_for_concepts ?? []),
    ...(asset.contains ?? []),
    ...(asset.affordances ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

export function assetSemanticSearchText(
  asset: MyWayStableAssetIdentityLike,
) {
  return normalizeAssetSemanticPhrase(
    assetSemanticIdentityValues(asset).join(" "),
  );
}

export function assetMatchesSemanticPhrase(
  asset: MyWayStableAssetIdentityLike,
  phrase: string,
) {
  const normalizedPhrase = normalizeAssetSemanticPhrase(phrase);
  if (!normalizedPhrase) return false;
  const haystack = ` ${assetSemanticSearchText(asset)} `;
  return haystack.includes(` ${normalizedPhrase} `);
}
