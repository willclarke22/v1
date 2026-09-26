import {
  BODYPARTS3D_FULL_COLLECTION_ID,
  BODYPARTS3D_SLP_COLLECTION_ID,
} from "../bodyparts3d-slp-pilot";
import {
  readBodyParts3dFullCatalog,
  type BodyParts3dFullCatalogV1,
} from "../bodyparts3d-full-import.server";
import { loadReviewedAssetResolverSnapshot } from "../reviewed-asset-resolver.server";
import type { MyWayAssetRecord } from "../asset-types";
import {
  buildAssetSearchDocumentV1,
  type AssetSearchDomainEvidenceV1,
  type AssetSearchDocumentV1,
} from "./asset-search-document";
import {
  ASSET_LEXICAL_SEARCH_VERSION,
  buildAssetLexicalSearchIndexV1,
  searchAssetLexicalIndexV1,
  type AssetLexicalSearchIndexV1,
  type AssetSearchRequirementV1,
} from "./asset-lexical-search";

export type AssetSearchBenchCollectionMode =
  | "bodyparts3d_full_atlas"
  | "bodyparts3d_slp_pilot";

export type AssetSearchBenchRequestV1 = {
  requirements: AssetSearchRequirementV1[];
  asset_collection_mode: AssetSearchBenchCollectionMode;
  limit?: number;
};

type PreparationMetrics = {
  cache_lookup_duration_ms: number;
  registry_snapshot_duration_ms: number;
  catalog_read_duration_ms: number;
  evidence_map_duration_ms: number;
  search_document_build_duration_ms: number;
  lexical_index_build_duration_ms: number;
  total_prepare_duration_ms: number;
  cache_age_ms: number;
};

type CachedIndex = {
  mode: AssetSearchBenchCollectionMode;
  key: string;
  created_at_ms: number;
  build_duration_ms: number;
  index: AssetLexicalSearchIndexV1;
  documents: AssetSearchDocumentV1[];
  registry_snapshot_id: string;
  catalog_counts: BodyParts3dFullCatalogV1["counts"] | null;
  preparation: PreparationMetrics;
};

const CACHE_TTL_MS = 5 * 60_000;
let cache: CachedIndex | null = null;

function unique(values: Array<string | null | undefined>, limit = 96) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

type BodyPartsRelationEdge = {
  kind: "is_a" | "part_of";
  parent_id: string;
  parent_name: string;
  child_id: string;
  child_name: string;
};

function conceptEvidenceMaps(catalog: BodyParts3dFullCatalogV1 | null) {
  const conceptNamesByElement = new Map<string, string[]>();
  const conceptIdsByElement = new Map<string, string[]>();
  const parentEdgesByChildId = new Map<string, BodyPartsRelationEdge[]>();
  const elementById = new Map<string, BodyParts3dFullCatalogV1["elements"][number]>();
  if (!catalog) {
    return {
      conceptNamesByElement,
      conceptIdsByElement,
      parentEdgesByChildId,
      elementById,
    };
  }

  for (const element of catalog.elements) elementById.set(element.id.toUpperCase(), element);
  for (const concept of catalog.concepts) {
    for (const elementId of concept.element_ids) {
      conceptNamesByElement.set(
        elementId.toUpperCase(),
        unique([...(conceptNamesByElement.get(elementId.toUpperCase()) ?? []), concept.name], 64),
      );
      conceptIdsByElement.set(
        elementId.toUpperCase(),
        unique([...(conceptIdsByElement.get(elementId.toUpperCase()) ?? []), concept.concept_id], 64),
      );
    }
  }

  const addParentEdge = (edge: BodyPartsRelationEdge) => {
    const current = parentEdgesByChildId.get(edge.child_id) ?? [];
    if (
      !current.some(
        (candidate) =>
          candidate.kind === edge.kind &&
          candidate.parent_id === edge.parent_id &&
          candidate.child_id === edge.child_id,
      )
    ) {
      current.push(edge);
      parentEdgesByChildId.set(edge.child_id, current);
    }
  };

  // Direction matters. Index an asset's upward parent context, but never copy
  // every parent's child-specific vocabulary onto all members of that parent.
  // The latter caused "hip" to leak into unrelated skull bones in Search Bench V1.
  for (const relation of catalog.isa_relations) {
    addParentEdge({ kind: "is_a", ...relation });
  }
  for (const relation of catalog.partof_relations) {
    addParentEdge({ kind: "part_of", ...relation });
  }

  return {
    conceptNamesByElement,
    conceptIdsByElement,
    parentEdgesByChildId,
    elementById,
  };
}

function parentContext(
  conceptIds: string[],
  maps: ReturnType<typeof conceptEvidenceMaps>,
) {
  const directRelationTerms: string[] = [];
  const oneHopTerms: string[] = [];
  const twoHopTerms: string[] = [];

  for (const conceptId of conceptIds) {
    const directEdges = maps.parentEdgesByChildId.get(conceptId) ?? [];
    for (const edge of directEdges) {
      directRelationTerms.push(
        edge.kind === "part_of"
          ? `${edge.child_name} part of ${edge.parent_name}`
          : `${edge.child_name} is a ${edge.parent_name}`,
      );
      oneHopTerms.push(edge.parent_name);

      const grandparentEdges = maps.parentEdgesByChildId.get(edge.parent_id) ?? [];
      for (const grandparent of grandparentEdges) {
        twoHopTerms.push(grandparent.parent_name);
      }
    }
  }

  return {
    direct_relation_terms: unique(directRelationTerms, 64),
    ontology_1hop_terms: unique(oneHopTerms, 48),
    ontology_2hop_terms: unique(twoHopTerms, 32),
  };
}

function evidenceForAsset(
  asset: MyWayAssetRecord,
  catalog: BodyParts3dFullCatalogV1 | null,
  maps: ReturnType<typeof conceptEvidenceMaps>,
): AssetSearchDomainEvidenceV1 {
  const elementId = (
    asset.source_asset_id ||
    asset.collection_membership?.member_id ||
    ""
  ).toUpperCase();
  const element = maps.elementById.get(elementId) ?? null;
  const conceptIds = unique([
    ...(element?.concept_ids ?? []),
    ...(maps.conceptIdsByElement.get(elementId) ?? []),
  ], 64);
  const conceptNames = unique([
    element?.name,
    asset.collection_membership?.concept_name,
    ...(maps.conceptNamesByElement.get(elementId) ?? []),
  ], 64);
  const parentEvidence = parentContext(conceptIds, maps);
  const systemMarker = asset.collection_membership?.group_tags.find((tag) => tag.startsWith("system:"));

  return {
    concept_ids: conceptIds,
    concept_names: conceptNames,
    relation_terms: parentEvidence.direct_relation_terms,
    ...parentEvidence,
    system: element?.system ?? systemMarker?.slice("system:".length) ?? null,
  };
}

function roundedMs(value: number) {
  return Number(value.toFixed(2));
}

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const value = await run();
  return { value, duration_ms: roundedMs(performance.now() - started) };
}

function zeroPreparation(cacheAgeMs: number, cacheLookupDurationMs: number): PreparationMetrics {
  return {
    cache_lookup_duration_ms: cacheLookupDurationMs,
    registry_snapshot_duration_ms: 0,
    catalog_read_duration_ms: 0,
    evidence_map_duration_ms: 0,
    search_document_build_duration_ms: 0,
    lexical_index_build_duration_ms: 0,
    total_prepare_duration_ms: cacheLookupDurationMs,
    cache_age_ms: Math.max(0, Math.round(cacheAgeMs)),
  };
}

async function buildIndex(mode: AssetSearchBenchCollectionMode) {
  const prepareStarted = performance.now();
  const cacheLookupStarted = performance.now();
  const cacheAgeMs = cache ? Date.now() - cache.created_at_ms : 0;

  // V3 checks the prepared-corpus TTL before touching registry/catalog storage.
  // This is intentionally a Search Bench cache: it makes warm retrieval timing
  // representative of a resident production index rather than reload cost.
  if (
    cache &&
    cache.mode === mode &&
    cacheAgeMs < CACHE_TTL_MS
  ) {
    const cacheLookupDurationMs = roundedMs(performance.now() - cacheLookupStarted);
    return {
      cache,
      cache_hit: true,
      preparation: zeroPreparation(cacheAgeMs, cacheLookupDurationMs),
    };
  }

  const cacheLookupDurationMs = roundedMs(performance.now() - cacheLookupStarted);
  const registryTimed = timed(() => loadReviewedAssetResolverSnapshot());
  const catalogTimed =
    mode === "bodyparts3d_full_atlas"
      ? timed(() => readBodyParts3dFullCatalog())
      : Promise.resolve({ value: null, duration_ms: 0 });
  const [registryResult, catalogResult] = await Promise.all([registryTimed, catalogTimed]);
  const snapshot = registryResult.value;
  const catalog = catalogResult.value;
  const collectionId =
    mode === "bodyparts3d_full_atlas"
      ? BODYPARTS3D_FULL_COLLECTION_ID
      : BODYPARTS3D_SLP_COLLECTION_ID;
  const cacheKey = `${mode}:${snapshot.registry_snapshot_id}:${catalog?.generated_at ?? "no-catalog"}`;

  const evidenceStarted = performance.now();
  const maps = conceptEvidenceMaps(catalog);
  const evidenceMapDurationMs = roundedMs(performance.now() - evidenceStarted);

  const documentsStarted = performance.now();
  const assets = snapshot.registry.assets.filter(
    (asset) => asset.collection_membership?.collection_id === collectionId,
  );
  const documents = assets.map((asset) =>
    buildAssetSearchDocumentV1(asset, evidenceForAsset(asset, catalog, maps)),
  );
  const searchDocumentBuildDurationMs = roundedMs(performance.now() - documentsStarted);

  const indexStarted = performance.now();
  const index = buildAssetLexicalSearchIndexV1(documents);
  const lexicalIndexBuildDurationMs = roundedMs(performance.now() - indexStarted);
  const totalPrepareDurationMs = roundedMs(performance.now() - prepareStarted);

  const preparation: PreparationMetrics = {
    cache_lookup_duration_ms: cacheLookupDurationMs,
    registry_snapshot_duration_ms: registryResult.duration_ms,
    catalog_read_duration_ms: catalogResult.duration_ms,
    evidence_map_duration_ms: evidenceMapDurationMs,
    search_document_build_duration_ms: searchDocumentBuildDurationMs,
    lexical_index_build_duration_ms: lexicalIndexBuildDurationMs,
    total_prepare_duration_ms: totalPrepareDurationMs,
    cache_age_ms: 0,
  };

  cache = {
    mode,
    key: cacheKey,
    created_at_ms: Date.now(),
    build_duration_ms: totalPrepareDurationMs,
    index,
    documents,
    registry_snapshot_id: snapshot.registry_snapshot_id,
    catalog_counts: catalog?.counts ?? null,
    preparation,
  };
  return { cache, cache_hit: false, preparation };
}

export async function getPreparedAssetSearchCorpus(
  mode: AssetSearchBenchCollectionMode,
) {
  const result = await buildIndex(mode);
  return {
    documents: result.cache.documents,
    lexical_index: result.cache.index,
    registry_snapshot_id: result.cache.registry_snapshot_id,
    catalog_counts: result.cache.catalog_counts,
    cache_hit: result.cache_hit,
    preparation: result.preparation,
  };
}

export async function runLexicalAssetSearchBench(input: AssetSearchBenchRequestV1) {
  const started = performance.now();
  const { cache: active, cache_hit, preparation } = await buildIndex(input.asset_collection_mode);
  const limit = Math.max(1, Math.min(20, Math.round(input.limit ?? 8)));
  const queries = input.requirements.map((requirement) => {
    const queryStarted = performance.now();
    const results = searchAssetLexicalIndexV1(active.index, requirement, limit);
    return {
      requirement,
      duration_ms: Number((performance.now() - queryStarted).toFixed(2)),
      result_count: results.length,
      results,
    };
  });

  return {
    schema_version: "myway_semantic_asset_search_bench_v1" as const,
    strategy: ASSET_LEXICAL_SEARCH_VERSION,
    provider_calls: 0,
    embedding_calls: 0,
    asset_collection_mode: input.asset_collection_mode,
    index: {
      document_count: active.index.documents.length,
      source_document_count: active.documents.length,
      registry_snapshot_id: active.registry_snapshot_id,
      catalog_counts: active.catalog_counts,
      cache_hit,
      build_duration_ms: cache_hit ? 0 : active.build_duration_ms,
      cache_ttl_ms: CACHE_TTL_MS,
      preparation,
    },
    metrics: {
      total_search_duration_ms: roundedMs(performance.now() - started),
      query_scoring_duration_ms: roundedMs(
        queries.reduce((sum, query) => sum + query.duration_ms, 0),
      ),
      query_count: queries.length,
      result_limit: limit,
    },
    queries,
    authority_note:
      "Lexical Search Bench V3 uses direction-aware BodyParts3D ontology evidence, a prepared-corpus TTL cache, and BM25 V2 ranking without provider or embedding calls. Ranking is evidence, not execution authority; exact asset use still passes through MyWay validation/grounding.",
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export async function runStandaloneAssetSearchBench(raw: Record<string, unknown>) {
  const semanticName =
    typeof raw.semantic_name === "string" && raw.semantic_name.trim()
      ? raw.semantic_name.trim()
      : "hip joint";
  const visualRole = typeof raw.visual_role === "string" ? raw.visual_role.trim() : "";
  const semanticTags = stringList(raw.semantic_tags).slice(0, 12);
  const assetCollectionMode: AssetSearchBenchCollectionMode =
    raw.asset_collection_mode === "bodyparts3d_slp_pilot"
      ? "bodyparts3d_slp_pilot"
      : "bodyparts3d_full_atlas";
  const numericLimit = Number(raw.limit);
  const limit = Number.isFinite(numericLimit) ? Math.max(1, Math.min(20, Math.round(numericLimit))) : 8;
  const requirement: AssetSearchRequirementV1 = {
    semantic_name: semanticName,
    visual_role: visualRole,
    semantic_tags: semanticTags,
  };
  const searchBench = await runLexicalAssetSearchBench({
    requirements: [requirement],
    asset_collection_mode: assetCollectionMode,
    limit,
  });
  return {
    ok: true as const,
    route: "visual-experience/asset-search-bench",
    input: {
      ...requirement,
      asset_collection_mode: assetCollectionMode,
      limit,
    },
    search_bench: searchBench,
  };
}
