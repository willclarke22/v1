import type { AssetSearchDocumentV1 } from "./asset-search-document";

export const LEGACY_ASSET_LEXICAL_SEARCH_VERSION =
  "myway_asset_lexical_bm25_v1" as const;
export const ASSET_LEXICAL_SEARCH_VERSION = "myway_asset_lexical_bm25_v2" as const;

export type AssetSearchRequirementV1 = {
  semantic_name: string;
  visual_role?: string;
  semantic_tags?: string[];
};

export type AssetLexicalSearchResultV1 = {
  rank: number;
  score: number;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  collection_member_id: string | null;
  concept_ids: string[];
  concept_names: string[];
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  scene_review_status: string;
  identity_match: "canonical_exact" | "alias_exact" | "concept_exact" | "phrase" | "none";
  matched_terms: string[];
  matched_fields: string[];
};

type IndexedDocument = {
  document: AssetSearchDocumentV1;
  weighted_length: number;
  term_weights: Map<string, number>;
  field_tokens: Map<string, Set<string>>;
};

export type AssetLexicalSearchIndexV1 = {
  schema_version: typeof ASSET_LEXICAL_SEARCH_VERSION;
  documents: IndexedDocument[];
  postings: Map<string, Array<{ document_index: number; weighted_tf: number }>>;
  document_frequency: Map<string, number>;
  average_weighted_length: number;
  canonical_exact: Map<string, number[]>;
  alias_exact: Map<string, number[]>;
  concept_exact: Map<string, number[]>;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "in", "into", "is", "it", "of", "on", "or", "that", "the", "this", "to",
  "where", "which", "with", "whose", "why",
]);

export function normalizeAssetSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeAssetSearchText(value: string) {
  return normalizeAssetSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function addWeightedTerms(
  target: Map<string, number>,
  fieldTokens: Map<string, Set<string>>,
  field: string,
  values: string[],
  weight: number,
) {
  const tokens = values.flatMap(tokenizeAssetSearchText);
  fieldTokens.set(field, new Set(tokens));
  for (const token of tokens) target.set(token, (target.get(token) ?? 0) + weight);
}

function indexDocument(document: AssetSearchDocumentV1): IndexedDocument {
  const termWeights = new Map<string, number>();
  const fieldTokens = new Map<string, Set<string>>();
  addWeightedTerms(termWeights, fieldTokens, "canonical_identity", [document.canonical_identity], 5);
  addWeightedTerms(termWeights, fieldTokens, "aliases", document.aliases, 4.5);
  addWeightedTerms(termWeights, fieldTokens, "concept_names", document.concept_names, 4.5);
  addWeightedTerms(termWeights, fieldTokens, "source_display_name", [document.source_display_name ?? ""], 2.5);
  addWeightedTerms(termWeights, fieldTokens, "semantic_tags", document.semantic_tags, 2.5);
  // V3 separates direct relationship evidence from progressively weaker
  // upward ontology context. relation_terms is the legacy direct alias.
  addWeightedTerms(termWeights, fieldTokens, "relation_terms", document.direct_relation_terms, 1.5);
  addWeightedTerms(termWeights, fieldTokens, "ontology_1hop_terms", document.ontology_1hop_terms, 0.35);
  addWeightedTerms(termWeights, fieldTokens, "ontology_2hop_terms", document.ontology_2hop_terms, 0.08);
  addWeightedTerms(termWeights, fieldTokens, "affordances", document.affordances, 1.75);
  addWeightedTerms(termWeights, fieldTokens, "contains", document.contains, 1.5);
  addWeightedTerms(termWeights, fieldTokens, "domain", [document.domain], 0.75);
  addWeightedTerms(termWeights, fieldTokens, "system", [document.system ?? ""], 0.75);
  addWeightedTerms(termWeights, fieldTokens, "laterality", [document.laterality], 0.5);
  const weightedLength = Array.from(termWeights.values()).reduce((sum, value) => sum + value, 0);
  return { document, weighted_length: Math.max(1, weightedLength), term_weights: termWeights, field_tokens: fieldTokens };
}

function addExactLookup(target: Map<string, number[]>, value: string, documentIndex: number) {
  const key = normalizeAssetSearchText(value);
  if (!key) return;
  const entries = target.get(key) ?? [];
  if (!entries.includes(documentIndex)) entries.push(documentIndex);
  target.set(key, entries);
}

export function buildAssetLexicalSearchIndexV1(
  documents: AssetSearchDocumentV1[],
): AssetLexicalSearchIndexV1 {
  const indexed = documents.filter((document) => document.search_eligible).map(indexDocument);
  const postings = new Map<string, Array<{ document_index: number; weighted_tf: number }>>();
  const documentFrequency = new Map<string, number>();
  const canonicalExact = new Map<string, number[]>();
  const aliasExact = new Map<string, number[]>();
  const conceptExact = new Map<string, number[]>();
  let totalLength = 0;

  indexed.forEach((entry, documentIndex) => {
    totalLength += entry.weighted_length;
    for (const [term, weightedTf] of entry.term_weights) {
      const list = postings.get(term) ?? [];
      list.push({ document_index: documentIndex, weighted_tf: weightedTf });
      postings.set(term, list);
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    addExactLookup(canonicalExact, entry.document.canonical_identity, documentIndex);
    for (const alias of entry.document.aliases) addExactLookup(aliasExact, alias, documentIndex);
    for (const concept of entry.document.concept_names) addExactLookup(conceptExact, concept, documentIndex);
  });

  return {
    schema_version: ASSET_LEXICAL_SEARCH_VERSION,
    documents: indexed,
    postings,
    document_frequency: documentFrequency,
    average_weighted_length: indexed.length ? totalLength / indexed.length : 1,
    canonical_exact: canonicalExact,
    alias_exact: aliasExact,
    concept_exact: conceptExact,
  };
}

function queryWeights(requirement: AssetSearchRequirementV1) {
  const weights = new Map<string, number>();
  const add = (value: string, weight: number) => {
    for (const token of tokenizeAssetSearchText(value)) {
      weights.set(token, Math.max(weights.get(token) ?? 0, weight));
    }
  };
  add(requirement.semantic_name, 3);
  for (const tag of requirement.semantic_tags ?? []) add(tag, 2);
  add(requirement.visual_role ?? "", 1);
  return weights;
}

function exactIdentityMatch(document: AssetSearchDocumentV1, semanticName: string) {
  const wanted = normalizeAssetSearchText(semanticName);
  if (!wanted) return { kind: "none" as const, bonus: 0 };
  if (normalizeAssetSearchText(document.canonical_identity) === wanted) {
    return { kind: "canonical_exact" as const, bonus: 160 };
  }
  if (document.aliases.some((value) => normalizeAssetSearchText(value) === wanted)) {
    return { kind: "alias_exact" as const, bonus: 130 };
  }
  if (document.concept_names.some((value) => normalizeAssetSearchText(value) === wanted)) {
    return { kind: "concept_exact" as const, bonus: 125 };
  }
  const corpus = normalizeAssetSearchText([
    document.canonical_identity,
    ...document.aliases,
    ...document.concept_names,
  ].join(" "));
  if (wanted.length >= 4 && corpus.includes(wanted)) {
    return { kind: "phrase" as const, bonus: 38 };
  }
  return { kind: "none" as const, bonus: 0 };
}

function matchedFields(entry: IndexedDocument, matchedTerms: Set<string>) {
  const fields: string[] = [];
  for (const [field, tokens] of entry.field_tokens) {
    if (Array.from(matchedTerms).some((term) => tokens.has(term))) fields.push(field);
  }
  return fields;
}

export function searchAssetLexicalIndexV1(
  index: AssetLexicalSearchIndexV1,
  requirement: AssetSearchRequirementV1,
  limit = 8,
): AssetLexicalSearchResultV1[] {
  const qWeights = queryWeights(requirement);
  if (!qWeights.size || !index.documents.length) return [];

  const scores = new Map<number, number>();
  const termsByDocument = new Map<number, Set<string>>();
  const documentCount = index.documents.length;
  const k1 = 1.2;
  const b = 0.75;

  for (const [term, qWeight] of qWeights) {
    const postings = index.postings.get(term) ?? [];
    const df = index.document_frequency.get(term) ?? 0;
    if (!df) continue;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    for (const posting of postings) {
      const entry = index.documents[posting.document_index];
      if (!entry) continue;
      const tf = posting.weighted_tf;
      const denominator = tf + k1 * (1 - b + b * (entry.weighted_length / index.average_weighted_length));
      const bm25 = idf * ((tf * (k1 + 1)) / denominator) * qWeight;
      scores.set(posting.document_index, (scores.get(posting.document_index) ?? 0) + bm25);
      const matched = termsByDocument.get(posting.document_index) ?? new Set<string>();
      matched.add(term);
      termsByDocument.set(posting.document_index, matched);
    }
  }

  const candidates = new Set<number>(scores.keys());
  const exactKey = normalizeAssetSearchText(requirement.semantic_name);
  const exactCandidates = exactKey
    ? unique([
        ...(index.canonical_exact.get(exactKey) ?? []).map(String),
        ...(index.alias_exact.get(exactKey) ?? []).map(String),
        ...(index.concept_exact.get(exactKey) ?? []).map(String),
      ]).map(Number)
    : [];
  for (const documentIndex of exactCandidates) {
    const entry = index.documents[documentIndex];
    if (!entry) continue;
    const exact = exactIdentityMatch(entry.document, requirement.semantic_name);
    if (exact.bonus > 0) {
      candidates.add(documentIndex);
      scores.set(documentIndex, (scores.get(documentIndex) ?? 0) + exact.bonus);
    }
  }

  return Array.from(candidates)
    .map((documentIndex) => {
      const entry = index.documents[documentIndex]!;
      const identity = exactIdentityMatch(entry.document, requirement.semantic_name);
      const matchedTerms = termsByDocument.get(documentIndex) ?? new Set<string>();
      return {
        documentIndex,
        rawScore: scores.get(documentIndex) ?? 0,
        identity,
        matchedTerms,
        matchedFields: matchedFields(entry, matchedTerms),
      };
    })
    .filter((candidate) => candidate.rawScore > 0)
    .sort((left, right) =>
      right.rawScore - left.rawScore ||
      index.documents[left.documentIndex]!.document.canonical_identity.localeCompare(
        index.documents[right.documentIndex]!.document.canonical_identity,
      )
    )
    .slice(0, Math.max(1, Math.min(20, Math.round(limit))))
    .map((candidate, indexPosition) => {
      const document = index.documents[candidate.documentIndex]!.document;
      return {
        rank: indexPosition + 1,
        score: Number(candidate.rawScore.toFixed(4)),
        asset_id: document.asset_id,
        canonical_identity: document.canonical_identity,
        display_name: document.display_name,
        collection_member_id: document.collection_member_id,
        concept_ids: document.concept_ids.slice(0, 12),
        concept_names: document.concept_names.slice(0, 12),
        system: document.system,
        laterality: document.laterality,
        scene_review_status: document.scene_review_status,
        identity_match: candidate.identity.kind,
        matched_terms: Array.from(candidate.matchedTerms).sort(),
        matched_fields: candidate.matchedFields,
      };
    });
}
