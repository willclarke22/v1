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

type CachedIndex = {
  key: string;
  created_at_ms: number;
  build_duration_ms: number;
  index: AssetLexicalSearchIndexV1;
  documents: AssetSearchDocumentV1[];
  registry_snapshot_id: string;
  catalog_counts: BodyParts3dFullCatalogV1["counts"] | null;
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

function conceptEvidenceMaps(catalog: BodyParts3dFullCatalogV1 | null) {
  const conceptNamesByElement = new Map<string, string[]>();
  const conceptIdsByElement = new Map<string, string[]>();
  const relationTermsByConceptId = new Map<string, string[]>();
  const elementById = new Map<string, BodyParts3dFullCatalogV1["elements"][number]>();
  if (!catalog) return { conceptNamesByElement, conceptIdsByElement, relationTermsByConceptId, elementById };

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

  const addRelation = (conceptId: string, value: string) => {
    relationTermsByConceptId.set(
      conceptId,
      unique([...(relationTermsByConceptId.get(conceptId) ?? []), value], 96),
    );
  };
  for (const relation of catalog.isa_relations) {
    const phrase = `${relation.child_name} is a ${relation.parent_name}`.trim();
    addRelation(relation.child_id, phrase);
    addRelation(relation.parent_id, phrase);
  }
  for (const relation of catalog.partof_relations) {
    const phrase = `${relation.child_name} part of ${relation.parent_name}`.trim();
    addRelation(relation.child_id, phrase);
    addRelation(relation.parent_id, phrase);
  }

  return { conceptNamesByElement, conceptIdsByElement, relationTermsByConceptId, elementById };
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
  const relationTerms = unique(
    conceptIds.flatMap((conceptId) => maps.relationTermsByConceptId.get(conceptId) ?? []),
    96,
  );
  const systemMarker = asset.collection_membership?.group_tags.find((tag) => tag.startsWith("system:"));

  return {
    concept_ids: conceptIds,
    concept_names: conceptNames,
    relation_terms: relationTerms,
    system: element?.system ?? systemMarker?.slice("system:".length) ?? null,
  };
}

async function buildIndex(mode: AssetSearchBenchCollectionMode) {
  const started = performance.now();
  const snapshot = await loadReviewedAssetResolverSnapshot();
  const collectionId =
    mode === "bodyparts3d_full_atlas"
      ? BODYPARTS3D_FULL_COLLECTION_ID
      : BODYPARTS3D_SLP_COLLECTION_ID;
  const catalog = mode === "bodyparts3d_full_atlas" ? await readBodyParts3dFullCatalog() : null;
  const cacheKey = `${mode}:${snapshot.registry_snapshot_id}:${catalog?.generated_at ?? "no-catalog"}`;

  if (cache && cache.key === cacheKey && Date.now() - cache.created_at_ms < CACHE_TTL_MS) {
    return { cache, cache_hit: true };
  }

  const maps = conceptEvidenceMaps(catalog);
  const assets = snapshot.registry.assets.filter(
    (asset) => asset.collection_membership?.collection_id === collectionId,
  );
  const documents = assets.map((asset) =>
    buildAssetSearchDocumentV1(asset, evidenceForAsset(asset, catalog, maps)),
  );
  const index = buildAssetLexicalSearchIndexV1(documents);
  cache = {
    key: cacheKey,
    created_at_ms: Date.now(),
    build_duration_ms: Number((performance.now() - started).toFixed(2)),
    index,
    documents,
    registry_snapshot_id: snapshot.registry_snapshot_id,
    catalog_counts: catalog?.counts ?? null,
  };
  return { cache, cache_hit: false };
}

export async function runLexicalAssetSearchBench(input: AssetSearchBenchRequestV1) {
  const started = performance.now();
  const { cache: active, cache_hit } = await buildIndex(input.asset_collection_mode);
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
    },
    metrics: {
      total_search_duration_ms: Number((performance.now() - started).toFixed(2)),
      query_count: queries.length,
      result_limit: limit,
    },
    queries,
    authority_note:
      "Lexical Search Bench V1 retrieves and ranks real MyWay assets without provider or embedding calls. Ranking is evidence, not execution authority; exact asset use still passes through MyWay validation/grounding.",
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
