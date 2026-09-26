import fs from "node:fs";
import path from "node:path";

import {
  buildAssetSearchDocumentV1,
  type AssetSearchDocumentAssetLike,
} from "../../sandbox/probe-lab/assets/search/asset-search-document";
import {
  ASSET_LEXICAL_SEARCH_VERSION,
  LEGACY_ASSET_LEXICAL_SEARCH_VERSION,
  buildAssetLexicalSearchIndexV1,
  searchAssetLexicalIndexV1,
} from "../../sandbox/probe-lab/assets/search/asset-lexical-search";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}
function fixture(
  input: Partial<AssetSearchDocumentAssetLike> &
    Pick<AssetSearchDocumentAssetLike, "asset_id" | "canonical_label">,
): AssetSearchDocumentAssetLike {
  return {
    asset_id: input.asset_id,
    canonical_label: input.canonical_label,
    display_name: input.display_name ?? input.canonical_label,
    aliases: input.aliases ?? [],
    semantic_tags: input.semantic_tags ?? [],
    domain: input.domain ?? "human_anatomy_bodyparts3d",
    requested_concept: input.requested_concept ?? null,
    source_display_name: input.source_display_name ?? input.canonical_label,
    verified_canonical_label: input.verified_canonical_label ?? null,
    verified_aliases: input.verified_aliases ?? [],
    contains: input.contains ?? [],
    affordances: input.affordances ?? [],
    source_asset_id: input.source_asset_id ?? input.asset_id,
    public_path: input.public_path ?? `/sandbox-assets/${input.asset_id}.glb`,
    safe_to_use_in_sandbox: input.safe_to_use_in_sandbox ?? true,
    status: input.status ?? "ready",
    scene_review_status: input.scene_review_status ?? "pending",
    semantic_review_status: input.semantic_review_status ?? "pending",
    collection_membership: input.collection_membership ?? {
      collection_id: "bodyparts3d_4_0_full_atlas",
      collection_name: "BodyParts3D 4.0 full atlas",
      collection_version: "4.0",
      member_id: input.asset_id,
      concept_id: null,
      concept_name: input.canonical_label,
      group_tags: ["bodyparts3d_full_atlas", "system:skeletal"],
      runtime_collection_space: "glb_y_up_meters",
    },
  };
}

const documents = [
  buildAssetSearchDocumentV1(
    fixture({
      asset_id: "LEFT_HIP",
      canonical_label: "left hip",
      aliases: ["hip", "left hip region"],
    }),
    {
      concept_ids: ["HIP_LEFT"],
      concept_names: ["left hip", "hip"],
      direct_relation_terms: ["left hip part of pelvis"],
      ontology_1hop_terms: ["pelvis"],
      ontology_2hop_terms: ["skeletal system"],
      system: "skeletal",
      laterality: "left",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({
      asset_id: "RIGHT_HIP",
      canonical_label: "right hip",
      aliases: ["hip", "right hip region"],
    }),
    {
      concept_ids: ["HIP_RIGHT"],
      concept_names: ["right hip", "hip"],
      direct_relation_terms: ["right hip part of pelvis"],
      ontology_1hop_terms: ["pelvis"],
      ontology_2hop_terms: ["skeletal system"],
      system: "skeletal",
      laterality: "right",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({
      asset_id: "LEFT_FEMUR",
      canonical_label: "left femur",
      aliases: ["left thigh bone"],
    }),
    {
      concept_ids: ["FEMUR_LEFT"],
      concept_names: ["femur", "left femur"],
      direct_relation_terms: ["left femur is a femur", "left femur part of left lower limb"],
      ontology_1hop_terms: ["femur", "left lower limb"],
      ontology_2hop_terms: ["bone organ", "lower limb"],
      system: "skeletal",
      laterality: "left",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({
      asset_id: "RIGHT_FEMUR",
      canonical_label: "right femur",
      aliases: ["right thigh bone"],
    }),
    {
      concept_ids: ["FEMUR_RIGHT"],
      concept_names: ["femur", "right femur"],
      direct_relation_terms: ["right femur is a femur", "right femur part of right lower limb"],
      ontology_1hop_terms: ["femur", "right lower limb"],
      ontology_2hop_terms: ["bone organ", "lower limb"],
      system: "skeletal",
      laterality: "right",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({
      asset_id: "FRONTAL_BONE",
      canonical_label: "frontal bone",
    }),
    {
      concept_ids: ["FRONTAL_BONE"],
      concept_names: ["frontal bone"],
      direct_relation_terms: ["frontal bone is a bone organ"],
      ontology_1hop_terms: ["bone organ"],
      // This simulates the old broad-graph contamination. Even if "hip" is
      // present only as distant context, it must not outrank direct hip evidence.
      ontology_2hop_terms: ["hip"],
      system: "skeletal",
      laterality: "unspecified",
    },
  ),
];

const index = buildAssetLexicalSearchIndexV1(documents);
assert(ASSET_LEXICAL_SEARCH_VERSION === "myway_asset_lexical_bm25_v2", "V3 must activate BM25 V2.");
assert(LEGACY_ASSET_LEXICAL_SEARCH_VERSION === "myway_asset_lexical_bm25_v1", "Historical V1 strategy marker must remain explicit.");
assert(index.canonical_exact.get("left hip")?.includes(0), "Exact identity lookup must be precomputed instead of scanning every document.");

const hip = searchAssetLexicalIndexV1(
  index,
  {
    semantic_name: "hip joint",
    visual_role: "joint where the femur rotates relative to the pelvis",
    semantic_tags: ["femur", "pelvis", "rotation"],
  },
  5,
);
const hipTopTwo = new Set(hip.slice(0, 2).map((result) => result.asset_id));
assert(hipTopTwo.has("LEFT_HIP") && hipTopTwo.has("RIGHT_HIP"), "Direct bilateral hip evidence must occupy the top two positions.");
assert(
  (hip.findIndex((result) => result.asset_id === "FRONTAL_BONE") === -1 ||
    hip.findIndex((result) => result.asset_id === "FRONTAL_BONE") >= 2),
  "Distant ontology contamination must not outrank direct hip identity/concept evidence.",
);

const femur = searchAssetLexicalIndexV1(
  index,
  {
    semantic_name: "femur",
    visual_role: "rigid bone carrying orientation from hip toward knee",
    semantic_tags: ["hip", "knee", "rotation"],
  },
  5,
);
const femurTopTwo = new Set(femur.slice(0, 2).map((result) => result.asset_id));
assert(femurTopTwo.has("LEFT_FEMUR") && femurTopTwo.has("RIGHT_FEMUR"), "Generic femur search must preserve bilateral top candidates.");

const directLegacy = buildAssetSearchDocumentV1(
  fixture({ asset_id: "LEGACY_PELVIS", canonical_label: "pelvis" }),
  {
    concept_names: ["pelvis"],
    relation_terms: ["pelvis part of axial skeleton"],
    system: "skeletal",
  },
);
assert(
  directLegacy.direct_relation_terms.includes("pelvis part of axial skeleton") &&
    directLegacy.relation_terms.includes("pelvis part of axial skeleton"),
  "Legacy relation_terms input must map to the new direct relationship bucket.",
);

const searchDocument = source("sandbox/probe-lab/assets/search/asset-search-document.ts");
const lexical = source("sandbox/probe-lab/assets/search/asset-lexical-search.ts");
const server = source("sandbox/probe-lab/assets/search/asset-search-bench.server.ts");
const ui = source("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const readme = source("sandbox/probe-lab/visual-experience/README.md");
const fullAtlas = source("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const importer = source("sandbox/probe-lab/assets/ui/bodyparts3d-slp-pilot-import-lab.tsx");

for (const marker of [
  "direct_relation_terms",
  "ontology_1hop_terms",
  "ontology_2hop_terms",
  "relation_terms remains the legacy direct-relation alias",
]) {
  assert(searchDocument.includes(marker), `Search Document V1 relation-bucket marker missing: ${marker}`);
}

for (const marker of [
  "myway_asset_lexical_bm25_v2",
  "LEGACY_ASSET_LEXICAL_SEARCH_VERSION",
  "canonical_exact",
  "alias_exact",
  "concept_exact",
  '"ontology_1hop_terms", document.ontology_1hop_terms, 0.35',
  '"ontology_2hop_terms", document.ontology_2hop_terms, 0.08',
]) {
  assert(lexical.includes(marker), `BM25 V2 marker missing: ${marker}`);
}
assert(
  !lexical.includes("index.documents.forEach((entry, documentIndex) =>"),
  "Warm query scoring must not scan every indexed document just to discover exact identity matches.",
);
assert(
  !lexical.includes("...document.relation_terms,\n  ].join"),
  "Exact phrase bonuses must not be sourced from ontology relationship text.",
);

for (const marker of [
  "parentEdgesByChildId",
  "Direction matters.",
  "cache.mode === mode",
  "cacheAgeMs < CACHE_TTL_MS",
  "registry_snapshot_duration_ms",
  "catalog_read_duration_ms",
  "evidence_map_duration_ms",
  "search_document_build_duration_ms",
  "lexical_index_build_duration_ms",
  "query_scoring_duration_ms",
]) {
  assert(server.includes(marker), `V3 server/caching metric marker missing: ${marker}`);
}
assert(
  !server.includes("addRelation(relation.parent_id"),
  "High-fanout parent concepts must not inherit every child-specific relation term.",
);
assert(
  server.indexOf("cache.mode === mode") < server.indexOf("loadReviewedAssetResolverSnapshot()"),
  "Prepared-corpus TTL gate must execute before registry snapshot loading.",
);
assert(
  server.indexOf("cache.mode === mode") < server.indexOf("readBodyParts3dFullCatalog()"),
  "Prepared-corpus TTL gate must execute before BodyParts3D catalog loading.",
);

for (const marker of [
  "Prepared cache",
  "Prepare ms",
  "Registry ms",
  "Catalog ms",
  "Documents ms",
  "BM25 build ms",
  "Query score ms",
  "Total search ms",
]) {
  assert(ui.includes(marker), `Search Bench V3 latency UI marker missing: ${marker}`);
}

assert(readme.includes("Search Bench V3 lexical hardening"), "README must document the V3 lexical hardening boundary.");
assert(readme.includes("50–100 asset pilot"), "README must preserve the later embedding-pilot boundary.");
assert(fullAtlas.includes("runEmbedding: false"), "Full BodyParts3D import must keep embeddings OFF.");
assert(importer.includes("Embedding generation after import: <b>OFF</b>"), "Full-atlas UI must keep embeddings OFF.");

console.log("PASS: Visual Experience Semantic Asset Search Bench V3 verified.");
console.log("BM25 V2 uses direction-aware ontology evidence, prepared-corpus cache-first lookup, precomputed exact identity maps, and detailed latency instrumentation without embedding/provider calls.");
