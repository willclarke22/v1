import type { AssetLexicalSearchResultV1 } from "./asset-lexical-search";
import type { AssetSearchDocumentV1 } from "./asset-search-document";
import {
  buildAssetSearchDocumentV2,
  type AssetSearchDocumentV2,
} from "./asset-search-document-v2";
import type { SearchQueryPacketV2 } from "./asset-search-query-v2";

export const ASSET_SEMANTIC_RETRIEVAL_V2_SCHEMA_VERSION =
  "myway_asset_semantic_retrieval_v2" as const;
export const ASSET_SEMANTIC_PILOT_V2_SELECTION_VERSION =
  "myway_bodyparts3d_semantic_embedding_pilot_selection_v2" as const;
export const ASSET_SEMANTIC_PILOT_V2_TARGET_COUNT = 96;
export const ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE = 4;
export const ASSET_SEMANTIC_RRF_K = 60;

export type SemanticDocumentViewV2 = "identity" | "relationship" | "role";
export type SemanticQueryViewV2 =
  | "identity_hint"
  | "full_intent"
  | "relationship_role";

export type SemanticVectorRowV2 = {
  asset_id: string;
  view: SemanticDocumentViewV2;
  vector: number[];
  model: string;
  source_text_hash: string;
};

export type SemanticChannelResultV2 = {
  rank: number;
  similarity: number;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  best_document_view: SemanticDocumentViewV2;
  query_view: SemanticQueryViewV2;
};

export type GraphAnchorResultV2 = {
  rank: number;
  score: number;
  asset_id: string;
  canonical_identity: string;
  matched_anchors: string[];
  evidence_fields: string[];
};

export type CandidateFusionResultV2 = {
  rank: number;
  rrf_score: number;
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  channel_ranks: Record<string, number | null>;
  channel_evidence: string[];
};

export function cosineSimilarityV2(left: number[], right: number[]) {
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

export function buildSemanticPilotDocumentsV2(
  sourceDocuments: AssetSearchDocumentV1[],
) {
  return sourceDocuments
    .filter((document) => document.search_eligible)
    .map(buildAssetSearchDocumentV2);
}

export function semanticPassagesForDocumentV2(
  document: AssetSearchDocumentV2,
) {
  const values: Array<{
    asset_id: string;
    view: SemanticDocumentViewV2;
    text: string;
  }> = [
    {
      asset_id: document.asset_id,
      view: "identity",
      text: document.identity.passage,
    },
    {
      asset_id: document.asset_id,
      view: "relationship",
      text: document.relationship.passage,
    },
  ];
  if (document.role.passage) {
    values.push({
      asset_id: document.asset_id,
      view: "role",
      text: document.role.passage,
    });
  }
  return values;
}

export function rankSemanticChannelV2(
  documents: AssetSearchDocumentV2[],
  rows: SemanticVectorRowV2[],
  queryVector: number[],
  queryView: SemanticQueryViewV2,
  compatibleViews: SemanticDocumentViewV2[],
  limit = 20,
): SemanticChannelResultV2[] {
  const documentById = new Map(
    documents.map((document) => [document.asset_id, document]),
  );
  const compatible = new Set<SemanticDocumentViewV2>(compatibleViews);
  const bestByAsset = new Map<
    string,
    { similarity: number; view: SemanticDocumentViewV2 }
  >();

  for (const row of rows) {
    if (!compatible.has(row.view)) continue;
    const document = documentById.get(row.asset_id);
    if (!document) continue;
    const similarity = cosineSimilarityV2(queryVector, row.vector);
    if (!Number.isFinite(similarity) || similarity < -0.999999) continue;
    const current = bestByAsset.get(row.asset_id);
    if (!current || similarity > current.similarity) {
      bestByAsset.set(row.asset_id, { similarity, view: row.view });
    }
  }

  const ranked = Array.from(bestByAsset.entries())
    .map(([assetId, best]) => ({
      document: documentById.get(assetId)!,
      similarity: best.similarity,
      view: best.view,
    }))
    .sort((left, right) =>
      right.similarity - left.similarity ||
      left.document.canonical_identity.localeCompare(
        right.document.canonical_identity,
      ),
    )
    .slice(0, Math.max(1, Math.min(50, Math.round(limit))));

  return ranked.map((entry, index) => ({
    rank: index + 1,
    similarity: Number(entry.similarity.toFixed(6)),
    asset_id: entry.document.asset_id,
    canonical_identity: entry.document.canonical_identity,
    display_name: entry.document.display_name,
    system: entry.document.system,
    laterality: entry.document.laterality,
    best_document_view: entry.view,
    query_view: queryView,
  }));
}

function normalized(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(values: string[], phrase: string) {
  const wanted = normalized(phrase);
  if (!wanted) return false;
  return values.some((value) => normalized(value).includes(wanted));
}

export function rankGraphAnchorEvidenceV2(
  documents: AssetSearchDocumentV2[],
  packet: SearchQueryPacketV2,
  limit = 20,
): GraphAnchorResultV2[] {
  const results: Array<{
    document: AssetSearchDocumentV2;
    score: number;
    matchedAnchors: string[];
    evidenceFields: string[];
  }> = [];

  for (const document of documents) {
    let score = 0;
    const matchedAnchors: string[] = [];
    const evidenceFields = new Set<string>();
    for (const anchor of packet.anchors) {
      let anchorScore = 0;
      if (
        containsPhrase(
          [
            document.identity.canonical_identity,
            ...document.identity.aliases,
            ...document.identity.concept_names,
          ],
          anchor.concept,
        )
      ) {
        anchorScore = Math.max(anchorScore, 4);
        evidenceFields.add("identity");
      }
      if (
        containsPhrase(
          document.relationship.direct_relationships,
          anchor.concept,
        )
      ) {
        anchorScore = Math.max(anchorScore, 3);
        evidenceFields.add("direct_relationship");
      }
      if (
        containsPhrase(document.relationship.ontology_1hop_terms, anchor.concept)
      ) {
        anchorScore = Math.max(anchorScore, 1.5);
        evidenceFields.add("ontology_1hop");
      }
      if (
        containsPhrase(document.relationship.ontology_2hop_terms, anchor.concept)
      ) {
        anchorScore = Math.max(anchorScore, 0.5);
        evidenceFields.add("ontology_2hop");
      }
      if (anchorScore > 0) {
        score += anchorScore;
        matchedAnchors.push(anchor.concept);
      }
    }
    if (score > 0) {
      results.push({
        document,
        score,
        matchedAnchors,
        evidenceFields: Array.from(evidenceFields),
      });
    }
  }

  results.sort((left, right) =>
    right.score - left.score ||
    right.matchedAnchors.length - left.matchedAnchors.length ||
    left.document.canonical_identity.localeCompare(
      right.document.canonical_identity,
    ),
  );

  return results
    .slice(0, Math.max(1, Math.min(50, Math.round(limit))))
    .map((entry, index) => ({
      rank: index + 1,
      score: Number(entry.score.toFixed(3)),
      asset_id: entry.document.asset_id,
      canonical_identity: entry.document.canonical_identity,
      matched_anchors: entry.matchedAnchors,
      evidence_fields: entry.evidenceFields,
    }));
}

type FusionChannel = {
  name: string;
  results: Array<{ asset_id: string; rank: number }>;
};

export function fuseCandidateChannelsRrfV2(
  documents: AssetSearchDocumentV2[],
  channels: FusionChannel[],
  limit = 20,
): CandidateFusionResultV2[] {
  const documentById = new Map(
    documents.map((document) => [document.asset_id, document]),
  );
  const accum = new Map<
    string,
    {
      score: number;
      channelRanks: Record<string, number | null>;
      evidence: string[];
    }
  >();
  const channelNames = channels.map((channel) => channel.name);

  for (const channel of channels) {
    for (const result of channel.results) {
      if (!documentById.has(result.asset_id)) continue;
      const current = accum.get(result.asset_id) ?? {
        score: 0,
        channelRanks: Object.fromEntries(
          channelNames.map((name) => [name, null]),
        ) as Record<string, number | null>,
        evidence: [],
      };
      current.score += 1 / (ASSET_SEMANTIC_RRF_K + result.rank);
      current.channelRanks[channel.name] = result.rank;
      current.evidence.push(`${channel.name}#${result.rank}`);
      accum.set(result.asset_id, current);
    }
  }

  const ranked = Array.from(accum.entries())
    .map(([assetId, state]) => ({
      document: documentById.get(assetId)!,
      state,
    }))
    .sort((left, right) =>
      right.state.score - left.state.score ||
      left.document.canonical_identity.localeCompare(
        right.document.canonical_identity,
      ),
    )
    .slice(0, Math.max(1, Math.min(80, Math.round(limit))));

  return ranked.map((entry, index) => ({
    rank: index + 1,
    rrf_score: Number(entry.state.score.toFixed(8)),
    asset_id: entry.document.asset_id,
    canonical_identity: entry.document.canonical_identity,
    display_name: entry.document.display_name,
    system: entry.document.system,
    laterality: entry.document.laterality,
    channel_ranks: entry.state.channelRanks,
    channel_evidence: entry.state.evidence,
  }));
}

export function lexicalChannelForFusionV2(
  results: AssetLexicalSearchResultV1[],
) {
  return results.map((result) => ({
    asset_id: result.asset_id,
    rank: result.rank,
  }));
}
