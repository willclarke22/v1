import type { AssetLexicalSearchResultV1, AssetSearchRequirementV1 } from "./asset-lexical-search";
import type { AssetSearchDocumentV1 } from "./asset-search-document";

export const ASSET_SEMANTIC_RETRIEVAL_SCHEMA_VERSION =
  "myway_asset_semantic_retrieval_v1" as const;
export const ASSET_SEMANTIC_PILOT_SELECTION_VERSION =
  "myway_bodyparts3d_semantic_embedding_pilot_selection_v1" as const;
export const ASSET_SEMANTIC_PILOT_TARGET_COUNT = 96;
export const ASSET_SEMANTIC_PILOT_BATCH_SIZE = 4;

export type SemanticVectorRowV1 = {
  asset_id: string;
  vector: number[];
  model: string;
  source_text_hash: string;
};

export type SemanticVectorSearchResultV1 = {
  rank: number;
  similarity: number;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  collection_member_id: string | null;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  scene_review_status: string;
};

export type HybridSemanticSearchResultV1 = {
  rank: number;
  hybrid_score: number;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  lexical_rank: number | null;
  lexical_score: number;
  vector_rank: number | null;
  vector_similarity: number | null;
};

const ANCHOR_TERMS = [
  "femur",
  "hip",
  "knee",
  "pelvis",
  "sacrum",
  "tibia",
  "fibula",
  "patella",
  "humerus",
  "shoulder",
  "elbow",
  "radius",
  "ulna",
  "vertebra",
  "spine",
  "skull",
  "mandible",
  "heart",
  "lung",
  "trachea",
  "larynx",
  "tongue",
] as const;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableStringOrder(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function documentIdentityText(document: AssetSearchDocumentV1) {
  return [
    document.canonical_identity,
    ...document.aliases,
    ...document.concept_names,
  ].join(" ").toLowerCase();
}

export function selectSemanticEmbeddingPilotDocuments(
  documents: AssetSearchDocumentV1[],
  targetCount = ASSET_SEMANTIC_PILOT_TARGET_COUNT,
) {
  const target = Math.max(8, Math.min(100, Math.round(targetCount)));
  const eligible = documents.filter((document) => document.search_eligible);
  const selected: AssetSearchDocumentV1[] = [];
  const selectedIds = new Set<string>();

  const add = (document: AssetSearchDocumentV1 | undefined) => {
    if (!document || selectedIds.has(document.asset_id) || selected.length >= target) return;
    selectedIds.add(document.asset_id);
    selected.push(document);
  };

  // Guarantee benchmark-relevant anatomy is represented without making the pilot
  // exclusively musculoskeletal. Each anchor gets at most a bilateral pair first.
  for (const anchor of ANCHOR_TERMS) {
    const matches = eligible
      .filter((document) => documentIdentityText(document).includes(anchor))
      .sort((left, right) =>
        left.canonical_identity.localeCompare(right.canonical_identity) ||
        left.asset_id.localeCompare(right.asset_id)
      );
    const lateral = matches.filter((document) =>
      document.laterality === "left" || document.laterality === "right"
    );
    const pool = lateral.length >= 2 ? lateral : matches;
    add(pool[0]);
    add(pool.find((document) =>
      pool[0] && document.laterality !== pool[0].laterality
    ) ?? pool[1]);
    if (selected.length >= Math.min(target, 36)) break;
  }

  const remainingBySystem = new Map<string, AssetSearchDocumentV1[]>();
  for (const document of eligible) {
    if (selectedIds.has(document.asset_id)) continue;
    const system = document.system || "unknown";
    const group = remainingBySystem.get(system) ?? [];
    group.push(document);
    remainingBySystem.set(system, group);
  }
  for (const group of remainingBySystem.values()) {
    group.sort((left, right) =>
      stableStringOrder(left.asset_id) - stableStringOrder(right.asset_id) ||
      left.asset_id.localeCompare(right.asset_id)
    );
  }

  const systems = Array.from(remainingBySystem.keys()).sort();
  let cursor = 0;
  while (selected.length < target && systems.length > 0) {
    const system = systems[cursor % systems.length]!;
    const group = remainingBySystem.get(system) ?? [];
    add(group.shift());
    if (group.length === 0) {
      remainingBySystem.delete(system);
      systems.splice(cursor % systems.length, 1);
      if (!systems.length) break;
      continue;
    }
    cursor += 1;
  }

  return selected;
}

export function buildSemanticRetrievalPassageV1(document: AssetSearchDocumentV1) {
  return [
    `Anatomical asset: ${document.canonical_identity}.`,
    document.aliases.length ? `Aliases: ${document.aliases.join(", ")}.` : "",
    document.concept_names.length ? `Named anatomical concepts: ${document.concept_names.join(", ")}.` : "",
    document.direct_relation_terms.length
      ? `Direct ontology relationships: ${document.direct_relation_terms.join("; ")}.`
      : "",
    document.ontology_1hop_terms.length
      ? `Immediate broader anatomy: ${document.ontology_1hop_terms.join(", ")}.`
      : "",
    document.ontology_2hop_terms.length
      ? `Broader anatomy context: ${document.ontology_2hop_terms.join(", ")}.`
      : "",
    document.system ? `Anatomical system: ${document.system}.` : "",
    `Laterality: ${document.laterality}.`,
    document.semantic_tags.length ? `Semantic tags: ${document.semantic_tags.join(", ")}.` : "",
    document.affordances.length ? `Known affordances: ${document.affordances.join(", ")}.` : "",
    document.contains.length ? `Contains: ${document.contains.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

export function buildSemanticRetrievalQueryV1(requirement: AssetSearchRequirementV1) {
  return [
    `Required visual concept: ${clean(requirement.semantic_name)}.`,
    clean(requirement.visual_role)
      ? `Teaching/visual role: ${clean(requirement.visual_role)}.`
      : "",
    (requirement.semantic_tags ?? []).length
      ? `Related semantic concepts: ${(requirement.semantic_tags ?? []).map(clean).filter(Boolean).join(", ")}.`
      : "",
  ].filter(Boolean).join("\n");
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm <= 0 || rightNorm <= 0) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function rankSemanticVectorRows(
  documents: AssetSearchDocumentV1[],
  rows: SemanticVectorRowV1[],
  queryVector: number[],
  limit = 8,
): SemanticVectorSearchResultV1[] {
  const documentById = new Map(documents.map((document) => [document.asset_id, document]));
  return rows
    .map((row) => {
      const document = documentById.get(row.asset_id);
      if (!document) return null;
      const similarity = cosineSimilarity(queryVector, row.vector);
      if (!Number.isFinite(similarity) || similarity < -0.999999) return null;
      return { document, similarity };
    })
    .filter((entry): entry is { document: AssetSearchDocumentV1; similarity: number } => Boolean(entry))
    .sort((left, right) =>
      right.similarity - left.similarity ||
      left.document.canonical_identity.localeCompare(right.document.canonical_identity)
    )
    .slice(0, Math.max(1, Math.min(20, Math.round(limit))))
    .map((entry, index) => ({
      rank: index + 1,
      similarity: Number(entry.similarity.toFixed(6)),
      asset_id: entry.document.asset_id,
      canonical_identity: entry.document.canonical_identity,
      display_name: entry.document.display_name,
      collection_member_id: entry.document.collection_member_id,
      system: entry.document.system,
      laterality: entry.document.laterality,
      scene_review_status: entry.document.scene_review_status,
    }));
}

function normalizeScores(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min;
  return values.map((value) => span > 1e-9 ? (value - min) / span : (value > 0 ? 1 : 0));
}

export function fuseLexicalAndSemanticPilotResults(
  documents: AssetSearchDocumentV1[],
  lexical: AssetLexicalSearchResultV1[],
  vector: SemanticVectorSearchResultV1[],
  limit = 8,
): HybridSemanticSearchResultV1[] {
  const documentById = new Map(documents.map((document) => [document.asset_id, document]));
  const lexicalById = new Map(lexical.map((result) => [result.asset_id, result]));
  const vectorById = new Map(vector.map((result) => [result.asset_id, result]));
  const ids = Array.from(new Set([...lexicalById.keys(), ...vectorById.keys()]));
  const lexicalNormalized = normalizeScores(ids.map((id) => lexicalById.get(id)?.score ?? 0));
  const vectorNormalized = normalizeScores(ids.map((id) => vectorById.get(id)?.similarity ?? 0));

  return ids
    .map((assetId, index) => {
      const document = documentById.get(assetId);
      if (!document) return null;
      const lexicalResult = lexicalById.get(assetId) ?? null;
      const vectorResult = vectorById.get(assetId) ?? null;
      const hybridScore = 0.35 * lexicalNormalized[index]! + 0.65 * vectorNormalized[index]!;
      return {
        document,
        lexicalResult,
        vectorResult,
        hybridScore,
      };
    })
    .filter((entry): entry is {
      document: AssetSearchDocumentV1;
      lexicalResult: AssetLexicalSearchResultV1 | null;
      vectorResult: SemanticVectorSearchResultV1 | null;
      hybridScore: number;
    } => Boolean(entry))
    .sort((left, right) =>
      right.hybridScore - left.hybridScore ||
      left.document.canonical_identity.localeCompare(right.document.canonical_identity)
    )
    .slice(0, Math.max(1, Math.min(20, Math.round(limit))))
    .map((entry, index) => ({
      rank: index + 1,
      hybrid_score: Number(entry.hybridScore.toFixed(6)),
      asset_id: entry.document.asset_id,
      canonical_identity: entry.document.canonical_identity,
      display_name: entry.document.display_name,
      system: entry.document.system,
      laterality: entry.document.laterality,
      lexical_rank: entry.lexicalResult?.rank ?? null,
      lexical_score: entry.lexicalResult?.score ?? 0,
      vector_rank: entry.vectorResult?.rank ?? null,
      vector_similarity: entry.vectorResult?.similarity ?? null,
    }));
}
