import { loadReviewedAssetResolverSnapshot } from "../reviewed-asset-resolver.server";
import { getPreparedAssetSearchCorpus } from "./asset-search-bench.server";
import type { AssetSearchDocumentV1 } from "./asset-search-document";
import type { AssetSearchDocumentV2 } from "./asset-search-document-v2";
import type { SearchQueryPacketV2 } from "./asset-search-query-v2";
import {
  getSemanticSearchServingCorpusV2,
  runSemanticAssetSearchServingV2,
} from "./asset-semantic-embedding-pilot-v2.server";
import {
  ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION,
  buildAssetSemanticEvidenceRecordV1,
  collectionGeometryEvidenceForAssetV1,
  contextualSpatialEvidenceV1,
  contextualSpatialEvidenceV2,
  resolveSemanticEvidenceAnchorsV1,
  resolveSemanticEvidenceAnchorsV2,
  type AssetAnchorResolutionV1,
  type AssetAnchorResolutionV2,
  type AssetCollectionGeometryEvidenceV1,
  type AssetContextualSpatialEvidenceV1,
  type AssetContextualSpatialEvidenceV2,
  type AssetSemanticEvidenceRecordV1,
} from "./asset-semantic-evidence";
import type { CandidateFusionResultV2 } from "./asset-semantic-search-v2";

export const ASSET_SEMANTIC_EVIDENCE_SNAPSHOT_V1_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_snapshot_v1" as const;
export const ASSET_SEMANTIC_EVIDENCE_AUDIT_V1_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_audit_v1" as const;
export const ASSET_SEMANTIC_EVIDENCE_ANCHOR_AUDIT_V2_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_anchor_audit_v2" as const;

type AssetCollectionMode =
  | "bodyparts3d_full_atlas"
  | "bodyparts3d_slp_pilot";

type EvidenceSnapshotV1 = {
  schema_version: typeof ASSET_SEMANTIC_EVIDENCE_SNAPSHOT_V1_SCHEMA_VERSION;
  asset_collection_mode: AssetCollectionMode;
  registry_snapshot_id: string;
  serving_selection_hash: string;
  serving_published_at: string;
  built_at: string;
  source_documents: AssetSearchDocumentV1[];
  documents: AssetSearchDocumentV2[];
  source_documents_by_id: Map<string, AssetSearchDocumentV1>;
  documents_by_id: Map<string, AssetSearchDocumentV2>;
  records_by_id: Map<string, AssetSemanticEvidenceRecordV1>;
  reference_source_documents: AssetSearchDocumentV1[];
  reference_source_documents_by_id: Map<string, AssetSearchDocumentV1>;
  reference_geometry_by_id: Map<string, AssetCollectionGeometryEvidenceV1>;
};

let evidenceSnapshotV1: EvidenceSnapshotV1 | null = null;

function roundedMs(value: number) {
  return Number(value.toFixed(2));
}

function modeFromRaw(raw: Record<string, unknown>): AssetCollectionMode {
  return raw.asset_collection_mode === "bodyparts3d_slp_pilot"
    ? "bodyparts3d_slp_pilot"
    : "bodyparts3d_full_atlas";
}

function currentServingCorpusOrNull() {
  try {
    return getSemanticSearchServingCorpusV2();
  } catch {
    return null;
  }
}

function snapshotCompatibleWithServing(snapshot: EvidenceSnapshotV1 | null) {
  if (!snapshot) return false;
  const serving = currentServingCorpusOrNull();
  return Boolean(
    serving &&
      serving.asset_collection_mode === snapshot.asset_collection_mode &&
      serving.registry_snapshot_id === snapshot.registry_snapshot_id &&
      serving.selection_hash === snapshot.serving_selection_hash &&
      serving.published_at === snapshot.serving_published_at,
  );
}

function countEvidence(snapshot: EvidenceSnapshotV1) {
  let sourceAsserted = 0;
  let measured = 0;
  let reviewed = 0;
  let modelInferred = 0;
  let collectionGeometryAssets = 0;
  let excludedUnreviewed = 0;
  for (const record of snapshot.records_by_id.values()) {
    sourceAsserted += record.source_asserted.length;
    measured += record.measured.length;
    reviewed += record.reviewed.length;
    modelInferred += record.model_inferred.length;
    excludedUnreviewed += record.excluded_unreviewed_role_metadata.length;
    if (record.collection_geometry) collectionGeometryAssets += 1;
  }
  return {
    source_asserted_fact_count: sourceAsserted,
    measured_fact_count: measured,
    reviewed_fact_count: reviewed,
    model_inferred_fact_count: modelInferred,
    collection_geometry_asset_count: collectionGeometryAssets,
    excluded_unreviewed_role_metadata_count: excludedUnreviewed,
  };
}

export function semanticEvidenceSnapshotStatusV1() {
  if (!evidenceSnapshotV1) {
    return {
      schema_version: ASSET_SEMANTIC_EVIDENCE_SNAPSHOT_V1_SCHEMA_VERSION,
      ready: false as const,
      compatible_with_serving_snapshot: false,
      asset_collection_mode: null,
      asset_count: 0,
      reference_asset_count: 0,
      reference_geometry_asset_count: 0,
      built_at: null,
      evidence_counts: {
        source_asserted_fact_count: 0,
        measured_fact_count: 0,
        reviewed_fact_count: 0,
        model_inferred_fact_count: 0,
        collection_geometry_asset_count: 0,
        excluded_unreviewed_role_metadata_count: 0,
      },
    };
  }
  const compatible = snapshotCompatibleWithServing(evidenceSnapshotV1);
  return {
    schema_version: evidenceSnapshotV1.schema_version,
    ready: compatible,
    compatible_with_serving_snapshot: compatible,
    asset_collection_mode: evidenceSnapshotV1.asset_collection_mode,
    asset_count: evidenceSnapshotV1.records_by_id.size,
    reference_asset_count: evidenceSnapshotV1.reference_source_documents.length,
    reference_geometry_asset_count: evidenceSnapshotV1.reference_geometry_by_id.size,
    registry_snapshot_id: evidenceSnapshotV1.registry_snapshot_id,
    serving_selection_hash: evidenceSnapshotV1.serving_selection_hash,
    serving_published_at: evidenceSnapshotV1.serving_published_at,
    built_at: evidenceSnapshotV1.built_at,
    evidence_counts: countEvidence(evidenceSnapshotV1),
    authority_note:
      "Evidence V1 is derived from existing source-provenanced search documents, verified metadata when present, and measured shared-collection geometry. Model-inferred permanent facts are not authored or stored.",
  };
}

export function clearSemanticEvidenceSnapshotV1() {
  evidenceSnapshotV1 = null;
  return {
    ok: true as const,
    snapshot: semanticEvidenceSnapshotStatusV1(),
  };
}

export async function publishSemanticEvidenceSnapshotV1(
  mode: AssetCollectionMode = "bodyparts3d_full_atlas",
) {
  const totalStarted = performance.now();
  const serving = getSemanticSearchServingCorpusV2();
  if (serving.asset_collection_mode !== mode) {
    throw new Error(
      "The active semantic serving snapshot belongs to another collection. Publish the query-ready snapshot for this collection first.",
    );
  }

  const registryStarted = performance.now();
  const registrySnapshot = await loadReviewedAssetResolverSnapshot();
  const registryDurationMs = roundedMs(performance.now() - registryStarted);
  if (registrySnapshot.registry_snapshot_id !== serving.registry_snapshot_id) {
    throw new Error(
      "The Asset Library registry changed after the serving snapshot was published. Republish the query-ready snapshot before building evidence.",
    );
  }

  const referenceStarted = performance.now();
  const referenceCorpus = await getPreparedAssetSearchCorpus(mode);
  const referenceCorpusDurationMs = roundedMs(performance.now() - referenceStarted);
  if (referenceCorpus.registry_snapshot_id !== registrySnapshot.registry_snapshot_id) {
    throw new Error(
      "The full collection reference corpus belongs to another registry snapshot. Republish the query-ready snapshot and rebuild evidence.",
    );
  }

  const buildStarted = performance.now();
  const selectedIds = new Set(serving.documents.map((document) => document.asset_id));
  const assetsById = new Map(
    registrySnapshot.registry.assets
      .filter((asset) => selectedIds.has(asset.asset_id))
      .map((asset) => [asset.asset_id, asset]),
  );
  const sourceDocumentsById = new Map(
    serving.source_documents.map((document) => [document.asset_id, document]),
  );
  const documentsById = new Map(
    serving.documents.map((document) => [document.asset_id, document]),
  );
  const recordsById = new Map<string, AssetSemanticEvidenceRecordV1>();
  const referenceSourceDocumentsById = new Map(
    referenceCorpus.documents.map((document) => [document.asset_id, document]),
  );
  const referenceGeometryById = new Map<string, AssetCollectionGeometryEvidenceV1>();
  for (const asset of registrySnapshot.registry.assets) {
    if (!referenceSourceDocumentsById.has(asset.asset_id)) continue;
    const geometry = collectionGeometryEvidenceForAssetV1(asset);
    if (geometry) referenceGeometryById.set(asset.asset_id, geometry);
  }

  for (const document of serving.documents) {
    const sourceDocument = sourceDocumentsById.get(document.asset_id);
    const asset = assetsById.get(document.asset_id);
    if (!sourceDocument || !asset) {
      throw new Error(
        `Evidence snapshot could not reconstruct selected asset ${document.asset_id} from the active registry/search corpus.`,
      );
    }
    recordsById.set(
      document.asset_id,
      buildAssetSemanticEvidenceRecordV1({
        document,
        source_document: sourceDocument,
        asset,
      }),
    );
  }

  evidenceSnapshotV1 = {
    schema_version: ASSET_SEMANTIC_EVIDENCE_SNAPSHOT_V1_SCHEMA_VERSION,
    asset_collection_mode: mode,
    registry_snapshot_id: serving.registry_snapshot_id,
    serving_selection_hash: serving.selection_hash,
    serving_published_at: serving.published_at,
    built_at: new Date().toISOString(),
    source_documents: serving.source_documents,
    documents: serving.documents,
    source_documents_by_id: sourceDocumentsById,
    documents_by_id: documentsById,
    records_by_id: recordsById,
    reference_source_documents: referenceCorpus.documents,
    reference_source_documents_by_id: referenceSourceDocumentsById,
    reference_geometry_by_id: referenceGeometryById,
  };
  const evidenceBuildDurationMs = roundedMs(performance.now() - buildStarted);

  return {
    ok: true as const,
    snapshot: semanticEvidenceSnapshotStatusV1(),
    metrics: {
      registry_snapshot_duration_ms: registryDurationMs,
      reference_corpus_duration_ms: referenceCorpusDurationMs,
      evidence_build_duration_ms: evidenceBuildDurationMs,
      total_duration_ms: roundedMs(performance.now() - totalStarted),
    },
    authority_note:
      "This is an in-memory derived evidence snapshot. It does not mutate Asset Library records, add AI-authored facts, regenerate embeddings, change RRF, resolve assets, or grant execution authority.",
  };
}

function requireEvidenceSnapshot(mode: AssetCollectionMode) {
  if (!evidenceSnapshotV1 || !snapshotCompatibleWithServing(evidenceSnapshotV1)) {
    throw new Error(
      "Semantic evidence snapshot is not ready for the active serving snapshot. Build / refresh evidence first.",
    );
  }
  if (evidenceSnapshotV1.asset_collection_mode !== mode) {
    throw new Error(
      "Semantic evidence snapshot belongs to another collection. Build / refresh evidence for this collection first.",
    );
  }
  return evidenceSnapshotV1;
}

function evidenceSummary(record: AssetSemanticEvidenceRecordV1) {
  return {
    source_asserted_count: record.source_asserted.length,
    measured_count: record.measured.length,
    reviewed_count: record.reviewed.length,
    model_inferred_count: record.model_inferred.length,
    collection_geometry_available: Boolean(record.collection_geometry),
    excluded_unreviewed_role_metadata_count:
      record.excluded_unreviewed_role_metadata.length,
  };
}

export function buildSemanticEvidenceContextsV1(input: {
  packet: SearchQueryPacketV2;
  candidate_ids: string[];
  mode: AssetCollectionMode;
}) {
  const snapshot = requireEvidenceSnapshot(input.mode);
  const anchorResolutions = resolveSemanticEvidenceAnchorsV1({
    packet: input.packet,
    source_documents: snapshot.source_documents,
  });
  const contexts = input.candidate_ids.flatMap((assetId) => {
    const record = snapshot.records_by_id.get(assetId);
    const sourceDocument = snapshot.source_documents_by_id.get(assetId);
    if (!record || !sourceDocument) return [];
    const contextual = contextualSpatialEvidenceV1({
      packet: input.packet,
      candidate: record,
      source_document: sourceDocument,
      records_by_id: snapshot.records_by_id,
      source_documents_by_id: snapshot.source_documents_by_id,
      anchor_resolutions: anchorResolutions,
    });
    return [{
      asset_id: assetId,
      record,
      contextual,
    }];
  });
  return {
    snapshot,
    anchor_resolutions: anchorResolutions,
    contexts,
  };
}

export async function runSemanticEvidenceAuditV1(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const mode = modeFromRaw(raw);
  const retrievalStarted = performance.now();
  const retrieval = await runSemanticAssetSearchServingV2({
    ...raw,
    limit: 20,
  });
  const retrievalDurationMs = roundedMs(performance.now() - retrievalStarted);
  const maxCandidates = Math.max(1, Math.min(20, Number(raw.max_candidates) || 10));
  const candidates = retrieval.candidate_union.slice(0, maxCandidates);

  const evidenceStarted = performance.now();
  const built = buildSemanticEvidenceContextsV1({
    packet: retrieval.query_packet,
    candidate_ids: candidates.map((candidate) => candidate.asset_id),
    mode,
  });
  const evidenceDurationMs = roundedMs(performance.now() - evidenceStarted);
  const candidateById = new Map(candidates.map((candidate) => [candidate.asset_id, candidate]));

  return {
    schema_version: ASSET_SEMANTIC_EVIDENCE_AUDIT_V1_SCHEMA_VERSION,
    evidence_schema_version: ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION,
    query_packet: retrieval.query_packet,
    snapshot: semanticEvidenceSnapshotStatusV1(),
    anchor_resolution: built.anchor_resolutions,
    candidates: built.contexts.map((context) => ({
      rrf_candidate: candidateById.get(context.asset_id) ?? null,
      asset_id: context.asset_id,
      canonical_identity: context.record.canonical_identity,
      evidence_summary: evidenceSummary(context.record),
      source_asserted: context.record.source_asserted,
      measured: context.record.measured,
      reviewed: context.record.reviewed,
      model_inferred: context.record.model_inferred,
      contextual_spatial_evidence: context.contextual,
      excluded_unreviewed_role_metadata:
        context.record.excluded_unreviewed_role_metadata,
    })),
    metrics: {
      retrieval_duration_ms: retrievalDurationMs,
      evidence_context_duration_ms: evidenceDurationMs,
      total_duration_ms: roundedMs(performance.now() - totalStarted),
    },
    authority_note:
      "Audit output separates source-asserted, measured, reviewed, and model-inferred evidence. V1 authors zero model-inferred permanent facts; contextual spatial values are measurements, not semantic anatomy assertions.",
  };
}

export function buildSemanticEvidenceContextsV2(input: {
  packet: SearchQueryPacketV2;
  candidate_ids: string[];
  mode: AssetCollectionMode;
}) {
  const snapshot = requireEvidenceSnapshot(input.mode);
  const anchorResolutions = resolveSemanticEvidenceAnchorsV2({
    packet: input.packet,
    reference_source_documents: snapshot.reference_source_documents,
    reference_geometry_by_id: snapshot.reference_geometry_by_id,
  });
  const contexts = input.candidate_ids.flatMap((assetId) => {
    const record = snapshot.records_by_id.get(assetId);
    const sourceDocument = snapshot.source_documents_by_id.get(assetId);
    if (!record || !sourceDocument) return [];
    return [{
      asset_id: assetId,
      record,
      contextual: contextualSpatialEvidenceV2({
        candidate: record,
        source_document: sourceDocument,
        reference_source_documents_by_id: snapshot.reference_source_documents_by_id,
        reference_geometry_by_id: snapshot.reference_geometry_by_id,
        anchor_resolutions: anchorResolutions,
      }),
    }];
  });
  return {
    snapshot,
    anchor_resolutions: anchorResolutions,
    contexts,
  };
}

export async function runSemanticEvidenceAuditV2(
  raw: Record<string, unknown>,
) {
  const totalStarted = performance.now();
  const mode = modeFromRaw(raw);
  const retrievalStarted = performance.now();
  const retrieval = await runSemanticAssetSearchServingV2({ ...raw, limit: 20 });
  const retrievalDurationMs = roundedMs(performance.now() - retrievalStarted);
  const maxCandidates = Math.max(1, Math.min(20, Number(raw.max_candidates) || 10));
  const candidates = retrieval.candidate_union.slice(0, maxCandidates);

  const evidenceStarted = performance.now();
  const built = buildSemanticEvidenceContextsV2({
    packet: retrieval.query_packet,
    candidate_ids: candidates.map((candidate) => candidate.asset_id),
    mode,
  });
  const evidenceDurationMs = roundedMs(performance.now() - evidenceStarted);
  const candidateById = new Map(candidates.map((candidate) => [candidate.asset_id, candidate]));

  return {
    schema_version: ASSET_SEMANTIC_EVIDENCE_ANCHOR_AUDIT_V2_SCHEMA_VERSION,
    evidence_schema_version: ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION,
    query_packet: retrieval.query_packet,
    snapshot: semanticEvidenceSnapshotStatusV1(),
    anchor_resolution: built.anchor_resolutions,
    candidates: built.contexts.map((context) => ({
      rrf_candidate: candidateById.get(context.asset_id) ?? null,
      asset_id: context.asset_id,
      canonical_identity: context.record.canonical_identity,
      evidence_summary: evidenceSummary(context.record),
      source_asserted: context.record.source_asserted,
      measured: context.record.measured,
      reviewed: context.record.reviewed,
      model_inferred: context.record.model_inferred,
      contextual_spatial_evidence: context.contextual,
      excluded_unreviewed_role_metadata: context.record.excluded_unreviewed_role_metadata,
    })),
    metrics: {
      retrieval_duration_ms: retrievalDurationMs,
      evidence_context_duration_ms: evidenceDurationMs,
      total_duration_ms: roundedMs(performance.now() - totalStarted),
    },
    authority_note:
      "Anchor Resolution V2 may use source-backed identity/concept matches from the full collection as reference geometry without promoting those references into the 96-asset candidate set. Spatial values remain deterministic measurements and no model-authored facts are stored.",
  };
}

export function evidenceContextForCandidateV1(input: {
  packet: SearchQueryPacketV2;
  candidate: CandidateFusionResultV2;
  mode: AssetCollectionMode;
}) {
  const built = buildSemanticEvidenceContextsV1({
    packet: input.packet,
    candidate_ids: [input.candidate.asset_id],
    mode: input.mode,
  });
  return {
    anchor_resolutions: built.anchor_resolutions,
    context: built.contexts[0] ?? null,
  };
}

export type SemanticEvidenceRerankerContextV1 = {
  asset_id: string;
  record: AssetSemanticEvidenceRecordV1;
  contextual: AssetContextualSpatialEvidenceV1;
};

export type SemanticEvidenceAnchorResolutionV1 = AssetAnchorResolutionV1;
export type SemanticEvidenceAnchorResolutionV2 = AssetAnchorResolutionV2;
export type SemanticEvidenceRerankerContextV2 = {
  asset_id: string;
  record: AssetSemanticEvidenceRecordV1;
  contextual: AssetContextualSpatialEvidenceV2;
};
