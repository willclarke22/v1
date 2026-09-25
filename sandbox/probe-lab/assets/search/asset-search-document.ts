export const ASSET_SEARCH_DOCUMENT_SCHEMA_VERSION =
  "myway_asset_search_document_v1" as const;

export type AssetSearchDocumentAssetLike = {
  asset_id: string;
  canonical_label: string;
  display_name: string;
  aliases?: string[];
  semantic_tags?: string[];
  domain?: string;
  requested_concept?: string | null;
  source_display_name?: string | null;
  verified_canonical_label?: string | null;
  verified_aliases?: string[];
  contains?: string[];
  affordances?: string[];
  source_asset_id?: string | null;
  public_path?: string | null;
  safe_to_use_in_sandbox?: boolean;
  status?: string;
  scene_review_status?: string | null;
  semantic_review_status?: string | null;
  collection_membership?: {
    collection_id: string;
    collection_name: string;
    collection_version?: string | null;
    member_id: string;
    concept_id?: string | null;
    concept_name?: string | null;
    group_tags?: string[];
    runtime_collection_space?: string | null;
  } | null;
};

export type AssetSearchDomainEvidenceV1 = {
  concept_ids?: string[];
  concept_names?: string[];
  relation_terms?: string[];
  system?: string | null;
  laterality?: "left" | "right" | "bilateral" | "midline" | "unspecified";
};

export type AssetSearchDocumentV1 = {
  schema_version: typeof ASSET_SEARCH_DOCUMENT_SCHEMA_VERSION;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  aliases: string[];
  domain: string;
  semantic_tags: string[];
  requested_concept: string | null;
  source_display_name: string | null;
  source_asset_id: string | null;
  concept_ids: string[];
  concept_names: string[];
  relation_terms: string[];
  affordances: string[];
  contains: string[];
  collection_id: string | null;
  collection_name: string | null;
  collection_member_id: string | null;
  system: string | null;
  laterality: "left" | "right" | "bilateral" | "midline" | "unspecified";
  scene_review_status: string;
  semantic_review_status: string;
  runtime_available: boolean;
  search_eligible: boolean;
  search_text: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values: Array<string | null | undefined>, limit = 96) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = clean(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function inferLaterality(values: string[]) {
  const text = ` ${values.join(" ").toLowerCase()} `;
  const left = /\b(left|sinister)\b/.test(text);
  const right = /\b(right|dexter)\b/.test(text);
  if (left && right) return "bilateral" as const;
  if (left) return "left" as const;
  if (right) return "right" as const;
  if (/\b(midline|median|central)\b/.test(text)) return "midline" as const;
  return "unspecified" as const;
}

function systemFromGroupTags(tags: string[] | undefined) {
  const marker = (tags ?? []).find((tag) => tag.startsWith("system:"));
  return marker?.slice("system:".length).trim() || null;
}

export function buildAssetSearchDocumentV1(
  asset: AssetSearchDocumentAssetLike,
  evidence: AssetSearchDomainEvidenceV1 = {},
): AssetSearchDocumentV1 {
  const membership = asset.collection_membership ?? null;
  const canonicalIdentity =
    clean(asset.verified_canonical_label) ||
    clean(membership?.concept_name) ||
    clean(asset.canonical_label) ||
    clean(asset.display_name) ||
    asset.asset_id;
  const aliases = unique([
    ...(asset.verified_aliases ?? []),
    ...(asset.aliases ?? []),
    asset.canonical_label,
    asset.display_name,
    membership?.concept_name,
  ]);
  const conceptNames = unique(evidence.concept_names ?? [], 64);
  const conceptIds = unique([
    membership?.concept_id,
    ...(evidence.concept_ids ?? []),
  ], 64);
  const relationTerms = unique(evidence.relation_terms ?? [], 96);
  const semanticTags = unique(asset.semantic_tags ?? [], 48);
  const affordances = unique(asset.affordances ?? [], 48);
  const contains = unique(asset.contains ?? [], 48);
  const system = clean(evidence.system) || systemFromGroupTags(membership?.group_tags) || null;
  const laterality = evidence.laterality ?? inferLaterality([
    canonicalIdentity,
    ...aliases,
    ...conceptNames,
  ]);
  const runtimeAvailable = Boolean(clean(asset.public_path));
  const searchEligible =
    asset.safe_to_use_in_sandbox !== false &&
    asset.status !== "rejected" &&
    runtimeAvailable;

  const searchText = [
    `identity ${canonicalIdentity}`,
    aliases.length ? `aliases ${aliases.join(" | ")}` : "",
    clean(asset.requested_concept) ? `requested concept ${clean(asset.requested_concept)}` : "",
    clean(asset.source_display_name) ? `source name ${clean(asset.source_display_name)}` : "",
    clean(asset.domain) ? `domain ${clean(asset.domain)}` : "",
    semanticTags.length ? `semantic tags ${semanticTags.join(" | ")}` : "",
    conceptNames.length ? `named concepts ${conceptNames.join(" | ")}` : "",
    relationTerms.length ? `relationships ${relationTerms.join(" | ")}` : "",
    affordances.length ? `affordances ${affordances.join(" | ")}` : "",
    contains.length ? `contains ${contains.join(" | ")}` : "",
    system ? `system ${system}` : "",
    `laterality ${laterality}`,
    membership?.collection_name ? `collection ${membership.collection_name}` : "",
  ].filter(Boolean).join("\n");

  return {
    schema_version: ASSET_SEARCH_DOCUMENT_SCHEMA_VERSION,
    asset_id: asset.asset_id,
    canonical_identity: canonicalIdentity,
    display_name: clean(asset.display_name) || canonicalIdentity,
    aliases,
    domain: clean(asset.domain),
    semantic_tags: semanticTags,
    requested_concept: clean(asset.requested_concept) || null,
    source_display_name: clean(asset.source_display_name) || null,
    source_asset_id: clean(asset.source_asset_id) || null,
    concept_ids: conceptIds,
    concept_names: conceptNames,
    relation_terms: relationTerms,
    affordances,
    contains,
    collection_id: membership?.collection_id ?? null,
    collection_name: membership?.collection_name ?? null,
    collection_member_id: membership?.member_id ?? null,
    system,
    laterality,
    scene_review_status: clean(asset.scene_review_status) || "pending",
    semantic_review_status: clean(asset.semantic_review_status) || "pending",
    runtime_available: runtimeAvailable,
    search_eligible: searchEligible,
    search_text: searchText,
  };
}
