import type { AssetSearchDocumentV2 } from "./asset-search-document-v2";
import type { SearchQueryPacketV2 } from "./asset-search-query-v2";
import type { CandidateFusionResultV2 } from "./asset-semantic-search-v2";
import type {
  AssetContextualSpatialEvidenceV1,
  AssetContextualSpatialEvidenceV2,
  AssetSemanticEvidenceRecordV1,
} from "./asset-semantic-evidence";

export const ASSET_SEMANTIC_RERANKER_V1_SCHEMA_VERSION =
  "myway_asset_semantic_reranker_v1" as const;

export type AssetRerankerInputCandidateV1 = {
  input_index: number;
  asset_id: string;
  passage: string;
  rrf_candidate: CandidateFusionResultV2;
};

export type AssetRerankerProviderRankingV1 = {
  index: number;
  logit: number;
};

export type AssetRerankedCandidateV1 = CandidateFusionResultV2 & {
  previous_rrf_rank: number;
  reranker_rank: number;
  rank_delta: number;
  reranker_logit: number;
  candidate_passage: string;
};

function line(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join("; ")}.` : "";
}

export function compileAssetRerankerQueryV1(packet: SearchQueryPacketV2) {
  const anchors = packet.anchors.length
    ? packet.anchors.map((anchor) => `${anchor.concept} (${anchor.role})`).join(", ")
    : "none specified";
  const relationships = packet.requested_relationships.length
    ? packet.requested_relationships
        .map((relationship) =>
          [
            relationship.type,
            relationship.from ? `from ${relationship.from}` : "",
            relationship.to ? `to ${relationship.to}` : "",
            relationship.toward ? `toward ${relationship.toward}` : "",
          ].filter(Boolean).join(" "),
        )
        .join("; ")
    : "none explicitly specified";

  return [
    `Required visual concept: ${packet.semantic_concept}.`,
    packet.visual_role ? `Required visual/teaching role: ${packet.visual_role}.` : "",
    packet.target_entity_kind !== "visual_resource"
      ? `Target entity kind: ${packet.target_entity_kind}.`
      : "",
    packet.target_material_or_class.length
      ? `Required class/material: ${packet.target_material_or_class.join(", ")}.`
      : "",
    `Context anchors: ${anchors}.`,
    packet.requested_relationships.length
      ? `Requested relationships: ${relationships}.`
      : "",
    packet.negative_role_hints.length
      ? `Negative role criteria: ${packet.negative_role_hints.join(" ")}`
      : "",
    "Rank the candidate whose evidence best fulfills the requested visual role and relationship. A candidate that only names an anchor or endpoint should not outrank a candidate that actually fulfills the requested role.",
  ].filter(Boolean).join("\n");
}

export function compileAssetRerankerPassageV1(document: AssetSearchDocumentV2) {
  return [
    `Candidate asset: ${document.canonical_identity}.`,
    document.identity.passage,
    document.relationship.passage,
    document.role.passage ?? "",
    line("Trusted identity evidence", document.identity.provenance.filter((item) => item.hard_truth).map((item) => item.statement)),
    line("Trusted relationship evidence", document.relationship.provenance.filter((item) => item.hard_truth).map((item) => item.statement)),
    document.role.provenance.length
      ? line("Reviewed/deterministic role evidence", document.role.provenance.map((item) => item.statement))
      : "",
  ].filter(Boolean).join("\n");
}

export function buildAssetRerankerInputsV1(
  candidates: CandidateFusionResultV2[],
  documents: AssetSearchDocumentV2[],
) {
  const documentById = new Map(
    documents.map((document) => [document.asset_id, document]),
  );
  const result: AssetRerankerInputCandidateV1[] = [];
  for (const candidate of candidates) {
    const document = documentById.get(candidate.asset_id);
    if (!document) continue;
    result.push({
      input_index: result.length,
      asset_id: candidate.asset_id,
      passage: compileAssetRerankerPassageV1(document),
      rrf_candidate: candidate,
    });
  }
  return result;
}

export function mergeAssetRerankerRankingsV1(
  candidates: AssetRerankerInputCandidateV1[],
  rankings: AssetRerankerProviderRankingV1[],
): AssetRerankedCandidateV1[] {
  const seen = new Set<number>();
  const ordered = rankings
    .filter((ranking) =>
      Number.isInteger(ranking.index) &&
      ranking.index >= 0 &&
      ranking.index < candidates.length &&
      Number.isFinite(ranking.logit) &&
      !seen.has(ranking.index),
    )
    .map((ranking) => {
      seen.add(ranking.index);
      return ranking;
    })
    .sort((left, right) => right.logit - left.logit || left.index - right.index);

  return ordered.map((ranking, index) => {
    const input = candidates[ranking.index]!;
    const rerankerRank = index + 1;
    return {
      ...input.rrf_candidate,
      rank: rerankerRank,
      previous_rrf_rank: input.rrf_candidate.rank,
      reranker_rank: rerankerRank,
      rank_delta: input.rrf_candidate.rank - rerankerRank,
      reranker_logit: Number(ranking.logit.toFixed(6)),
      candidate_passage: input.passage,
    };
  });
}

export type AssetRerankerEvidenceContextV2 = {
  asset_id: string;
  record: AssetSemanticEvidenceRecordV1;
  contextual: AssetContextualSpatialEvidenceV1;
};

function compactUnique(values: string[], limit: number) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function fixedMeters(value: number) {
  if (!Number.isFinite(value)) return "unknown";
  if (Math.abs(value) >= 1) return `${value.toFixed(3)} m`;
  if (Math.abs(value) >= 0.01) return `${value.toFixed(4)} m`;
  return `${value.toFixed(6)} m`;
}

export function compileAssetRerankerEvidencePassageV2(
  document: AssetSearchDocumentV2,
  evidence: AssetRerankerEvidenceContextV2,
) {
  const concepts = compactUnique(
    evidence.record.source_asserted
      .filter((item) => item.predicate === "named_concept")
      .map((item) => item.object_label ?? "")
      .filter(Boolean),
    10,
  );
  const directRelationships = compactUnique(
    evidence.record.source_asserted
      .filter((item) => item.graph_distance === 0)
      .map((item) => item.statement),
    10,
  );
  const broaderContext = compactUnique(
    evidence.record.source_asserted
      .filter((item) => item.graph_distance === 1 || item.graph_distance === 2)
      .map((item) => item.statement),
    10,
  );
  const reviewed = compactUnique(
    evidence.record.reviewed.map((item) => item.statement),
    8,
  );
  const anchorMeasurements = evidence.contextual.anchor_distances.map((item) =>
    [
      `Measured shared-collection distance to query anchor "${item.anchor}" represented by ${item.anchor_label}:`,
      `bounds gap ${fixedMeters(item.bounds_gap_m)}`,
      `centroid distance ${fixedMeters(item.centroid_distance_m)}`,
      item.same_asset ? "candidate is the anchor asset itself" : "candidate is distinct from the anchor asset",
    ].join(" "),
  );
  const pairMeasurements = evidence.contextual.anchor_pair_geometry.map((item) =>
    [
      `Measured position relative to query anchors "${item.anchor_a}" and "${item.anchor_b}":`,
      `anchor span ${fixedMeters(item.anchor_span_m)}`,
      `projection t=${item.projection_t.toFixed(3)}`,
      `inside segment=${item.projection_inside_segment ? "yes" : "no"}`,
      `perpendicular distance ${fixedMeters(item.perpendicular_distance_m)}`,
      `normalized perpendicular=${item.normalized_perpendicular_distance.toFixed(3)}`,
      `interior fraction=${item.interior_fraction.toFixed(3)}`,
    ].join(" "),
  );

  return [
    `Candidate: ${document.canonical_identity}.`,
    document.system ? `System: ${document.system}.` : "",
    `Laterality: ${document.laterality}.`,
    concepts.length ? `Source-backed named concepts: ${concepts.join("; ")}.` : "",
    directRelationships.length
      ? `Source-backed direct relationships: ${directRelationships.join("; ")}.`
      : "",
    broaderContext.length
      ? `Source-backed broader context: ${broaderContext.join("; ")}.`
      : "",
    reviewed.length ? `Human/verified metadata: ${reviewed.join("; ")}.` : "",
    anchorMeasurements.length
      ? `Query-conditioned measured spatial evidence:\n- ${anchorMeasurements.join("\n- ")}`
      : "",
    pairMeasurements.length
      ? `Query-conditioned anchor-pair geometry:\n- ${pairMeasurements.join("\n- ")}`
      : "",
    "Evidence note: source-backed statements and deterministic measurements only; no model-authored permanent facts are included.",
  ].filter(Boolean).join("\n");
}

export function buildAssetRerankerInputsEvidenceV2(
  candidates: CandidateFusionResultV2[],
  documents: AssetSearchDocumentV2[],
  evidenceContexts: AssetRerankerEvidenceContextV2[],
) {
  const documentById = new Map(
    documents.map((document) => [document.asset_id, document]),
  );
  const evidenceById = new Map(
    evidenceContexts.map((context) => [context.asset_id, context]),
  );
  const result: AssetRerankerInputCandidateV1[] = [];
  for (const candidate of candidates) {
    const document = documentById.get(candidate.asset_id);
    const evidence = evidenceById.get(candidate.asset_id);
    if (!document || !evidence) continue;
    result.push({
      input_index: result.length,
      asset_id: candidate.asset_id,
      passage: compileAssetRerankerEvidencePassageV2(document, evidence),
      rrf_candidate: candidate,
    });
  }
  return result;
}

export type AssetRerankerEvidenceContextV3 = {
  asset_id: string;
  record: AssetSemanticEvidenceRecordV1;
  contextual: AssetContextualSpatialEvidenceV2;
};

export function compileAssetRerankerEvidencePassageV3(
  document: AssetSearchDocumentV2,
  evidence: AssetRerankerEvidenceContextV3,
  packet: SearchQueryPacketV2,
) {
  const classFacts = compactUnique(
    evidence.record.source_asserted
      .filter((item) => item.graph_distance === 0 && item.predicate === "is_a")
      .map((item) => item.statement),
    3,
  );
  const partFacts = compactUnique(
    evidence.record.source_asserted
      .filter((item) => item.graph_distance === 0 && item.predicate === "part_of")
      .map((item) => item.statement),
    3,
  );
  const reviewed = compactUnique(evidence.record.reviewed.map((item) => item.statement), 5);
  const anchorMeasurements = evidence.contextual.anchor_distances.map((item) =>
    [
      `Query anchor "${item.anchor}" is represented by source-backed full-collection reference ${item.anchor_label}`,
      `(match=${item.anchor_match_strategy}, score=${item.anchor_match_score})`,
      `bounds gap ${fixedMeters(item.bounds_gap_m)}`,
      `centroid distance ${fixedMeters(item.centroid_distance_m)}`,
      item.same_asset ? "candidate is this context anchor" : "candidate is distinct from this context anchor",
    ].join(" "),
  );
  const pairMeasurements = evidence.contextual.anchor_pair_geometry.map((item) =>
    [
      `Across query anchors "${item.anchor_a}" (${item.anchor_a_label}) and "${item.anchor_b}" (${item.anchor_b_label}):`,
      `candidate center projects inside anchor segment=${item.projection_inside_segment ? "yes" : "no"}`,
      `projection t=${item.projection_t.toFixed(3)}`,
      `normalized corridor distance=${item.normalized_perpendicular_distance.toFixed(3)}`,
      `interior fraction=${item.interior_fraction.toFixed(3)}`,
      `candidate bounds gap to first anchor ${fixedMeters(item.candidate_gap_to_anchor_a_m)}`,
      `to second anchor ${fixedMeters(item.candidate_gap_to_anchor_b_m)}`,
    ].join(" "),
  );
  const endpointNote =
    packet.constraints.endpoint_only_match_is_soft_negative &&
    evidence.contextual.endpoint_anchor_matches.length
      ? `Query-conditioned endpoint note: candidate is itself context anchor ${evidence.contextual.endpoint_anchor_matches.map((value) => `"${value}"`).join(", ")}; the query explicitly says an endpoint-only match is insufficient unless the requested role is fulfilled.`
      : "";

  return [
    `Candidate: ${document.canonical_identity}.`,
    document.system ? `System: ${document.system}.` : "",
    `Laterality: ${document.laterality}.`,
    classFacts.length ? `Source-backed class evidence: ${classFacts.join("; ")}.` : "",
    partFacts.length ? `Source-backed part-of evidence: ${partFacts.join("; ")}.` : "",
    reviewed.length ? `Human/verified metadata: ${reviewed.join("; ")}.` : "",
    anchorMeasurements.length
      ? `Resolved query-anchor measurements:
- ${anchorMeasurements.join("\n- ")}`
      : "",
    pairMeasurements.length
      ? `Two-anchor relational geometry:
- ${pairMeasurements.join("\n- ")}`
      : "",
    endpointNote,
    "Evidence note: full-collection references are source-backed identity/concept matches used only as geometric context; candidate ranking remains bounded to the original RRF shortlist; no model-authored permanent facts are included.",
  ].filter(Boolean).join("\n");
}

export function buildAssetRerankerInputsEvidenceV3(
  candidates: CandidateFusionResultV2[],
  documents: AssetSearchDocumentV2[],
  evidenceContexts: AssetRerankerEvidenceContextV3[],
  packet: SearchQueryPacketV2,
) {
  const documentById = new Map(documents.map((document) => [document.asset_id, document]));
  const evidenceById = new Map(evidenceContexts.map((context) => [context.asset_id, context]));
  const result: AssetRerankerInputCandidateV1[] = [];
  for (const candidate of candidates) {
    const document = documentById.get(candidate.asset_id);
    const evidence = evidenceById.get(candidate.asset_id);
    if (!document || !evidence) continue;
    result.push({
      input_index: result.length,
      asset_id: candidate.asset_id,
      passage: compileAssetRerankerEvidencePassageV3(document, evidence, packet),
      rrf_candidate: candidate,
    });
  }
  return result;
}

