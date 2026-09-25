import fs from "node:fs";
import path from "node:path";

import {
  buildAssetSearchDocumentV1,
  type AssetSearchDocumentAssetLike,
} from "../../sandbox/probe-lab/assets/search/asset-search-document";
import {
  buildAssetLexicalSearchIndexV1,
  searchAssetLexicalIndexV1,
} from "../../sandbox/probe-lab/assets/search/asset-lexical-search";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function source(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}
function fixture(input: Partial<AssetSearchDocumentAssetLike> & Pick<AssetSearchDocumentAssetLike, "asset_id" | "canonical_label">): AssetSearchDocumentAssetLike {
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
    fixture({ asset_id: "FJ_LEFT_FEMUR", canonical_label: "left femur", aliases: ["left thigh bone"] }),
    {
      concept_ids: ["FMA_FEMUR_LEFT"],
      concept_names: ["femur", "left femur", "bone of left thigh"],
      relation_terms: ["femur part of lower limb", "femur participates in hip joint", "femur related to pelvis"],
      system: "skeletal",
      laterality: "left",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({ asset_id: "FJ_RIGHT_FEMUR", canonical_label: "right femur", aliases: ["right thigh bone"] }),
    {
      concept_ids: ["FMA_FEMUR_RIGHT"],
      concept_names: ["femur", "right femur", "bone of right thigh"],
      relation_terms: ["femur part of lower limb", "femur participates in hip joint", "femur related to pelvis"],
      system: "skeletal",
      laterality: "right",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({ asset_id: "FJ_PELVIS", canonical_label: "pelvis" }),
    {
      concept_ids: ["FMA_PELVIS"],
      concept_names: ["pelvis", "hip region", "pelvic skeleton"],
      relation_terms: ["pelvis participates in hip joint", "femur articulates with pelvis"],
      system: "skeletal",
      laterality: "midline",
    },
  ),
  buildAssetSearchDocumentV1(
    fixture({ asset_id: "UNSAFE_FEMUR", canonical_label: "training femur", safe_to_use_in_sandbox: false }),
    { concept_names: ["femur"], relation_terms: ["hip joint"], system: "skeletal" },
  ),
  buildAssetSearchDocumentV1(
    fixture({ asset_id: "MUG", canonical_label: "coffee mug", domain: "household", semantic_tags: ["cup"] }),
    { concept_names: ["mug"], relation_terms: ["drink container"], system: "household" },
  ),
];

const index = buildAssetLexicalSearchIndexV1(documents);
assert(index.documents.length === 4, "Unsafe assets must not enter the lexical execution candidate index.");

const femur = searchAssetLexicalIndexV1(index, { semantic_name: "femur", visual_role: "rigid bone connecting hip and knee" }, 5);
assert(femur.length >= 2, "Generic femur search should return both bilateral femur candidates.");
assert(new Set(femur.slice(0, 2).map((item) => item.asset_id)).has("FJ_LEFT_FEMUR"), "Left femur must be in the top bilateral candidates.");
assert(new Set(femur.slice(0, 2).map((item) => item.asset_id)).has("FJ_RIGHT_FEMUR"), "Right femur must be in the top bilateral candidates.");
assert(!femur.some((item) => item.asset_id === "UNSAFE_FEMUR"), "Unsafe candidates must remain excluded.");

const hip = searchAssetLexicalIndexV1(
  index,
  {
    semantic_name: "hip joint",
    visual_role: "joint where the femur rotates relative to the pelvis",
    semantic_tags: ["femur", "pelvis", "rotation"],
  },
  5,
);
assert(hip.some((item) => item.asset_id === "FJ_PELVIS"), "Functional hip-joint wording should retrieve the pelvis through concept/relationship evidence.");
assert(hip.some((item) => item.asset_id === "FJ_LEFT_FEMUR" || item.asset_id === "FJ_RIGHT_FEMUR"), "Functional hip-joint wording should retrieve a femur through concept/relationship evidence.");
assert(!hip.slice(0, 3).some((item) => item.asset_id === "MUG"), "Unrelated assets must not outrank anatomy evidence.");
assert(hip.some((item) => item.matched_fields.includes("relation_terms")), "Search results should expose relationship evidence rather than a score alone.");

const searchDocument = source("sandbox/probe-lab/assets/search/asset-search-document.ts");
const lexical = source("sandbox/probe-lab/assets/search/asset-lexical-search.ts");
const server = source("sandbox/probe-lab/assets/search/asset-search-bench.server.ts");
const runner = source("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");
const ui = source("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const route = source("sandbox/probe-lab/visual-experience/routes/asset-search-bench.ts");
const apiRoute = source("app/api/sandbox/probe-lab/visual-experience/asset-search-bench/route.ts");
const fullAtlas = source("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const importer = source("sandbox/probe-lab/assets/ui/bodyparts3d-slp-pilot-import-lab.tsx");
const readme = source("sandbox/probe-lab/visual-experience/README.md");

for (const marker of [
  "myway_asset_search_document_v1",
  "concept_names",
  "relation_terms",
  "laterality",
  "search_eligible",
  "search_text",
]) assert(searchDocument.includes(marker), `Search Document V1 marker missing: ${marker}`);

for (const marker of [
  "myway_asset_lexical_bm25_v1",
  "document_frequency",
  "average_weighted_length",
  "matched_terms",
  "matched_fields",
  "canonical_exact",
  "concept_exact",
]) assert(lexical.includes(marker), `Lexical retrieval marker missing: ${marker}`);
assert(!lexical.includes("TOKEN_EQUIVALENCE_GROUPS"), "Search Bench V1 must not grow the old hard-coded synonym table pattern.");

for (const marker of [
  "readBodyParts3dFullCatalog",
  "catalog.concepts",
  "catalog.isa_relations",
  "catalog.partof_relations",
  "CACHE_TTL_MS = 5 * 60_000",
  "provider_calls: 0",
  "embedding_calls: 0",
]) assert(server.includes(marker), `Search Bench server marker missing: ${marker}`);
assert(!server.includes("@qdrant/js-client-rest"), "Qdrant/ANN must remain a later scaling phase, not the lexical baseline.");
assert(!server.includes("embedAssetAppearance") && !server.includes("embedAppearanceQuery"), "The lexical baseline must not call the embedding provider.");

for (const marker of [
  "resolveSandboxBodyParts3dSemanticConcepts",
  "runLexicalAssetSearchBench",
  "semantic_asset_search",
  "lexical_search_duration_ms",
]) assert(runner.includes(marker), `Orchestration runner search marker missing: ${marker}`);

assert(runner.includes("const requirements: AssetSearchRequirementV1[] = [];"), "V2 must accumulate search requirements into an explicitly typed array.");
assert(runner.includes("requirements.push({"), "V2 must push validated requirements instead of mapping nullable entries.");
assert(!runner.includes(".filter((item): item is AssetSearchRequirementV1 => Boolean(item))"), "The V1 nullable-map type predicate that failed project TypeScript must not return.");
assert(!runner.includes("return null;\n      }\n      return {\n        semantic_name:"), "The V1 nullable requirement-map shape must not return.");

for (const marker of [
  "SEARCH BENCH · PHASE A/B",
  "Run lexical search only",
  "No GLM call · no embedding call",
  "Stage Search Bench · lexical baseline",
  "Provider calls",
  "Embedding calls",
]) assert(ui.includes(marker), `Orchestration Search Bench UI marker missing: ${marker}`);
assert(ui.includes('const summaryMetrics: Array<{ label: string; value: string }>'), "React 19 metric-card typing fix must remain intact.");
assert(!ui.includes('].map(([label, metric]) =>'), "The retired heterogeneous tuple metric renderer must not return.");

assert(route.includes("runStandaloneAssetSearchBench"), "Search-only sandbox route is not wired to the shared search server.");
assert(apiRoute.includes('runtime = "nodejs"') && apiRoute.includes("maxDuration = 30"), "Search-only app route must use a bounded Node runtime.");

assert(fullAtlas.includes("runEmbedding: false"), "Full BodyParts3D import must keep embeddings OFF.");
assert(importer.includes("Embedding generation after import: <b>OFF</b>"), "Full-atlas UI must keep its no-embedding import policy visible.");
assert(readme.includes("Semantic Asset Search Bench V1"), "Visual Experience README must document the lexical baseline and later embedding phases.");

console.log("PASS: Visual Experience Semantic Asset Search Bench V1 / package V2 verified.");
console.log("Search Document V1 + lexical BM25 retrieval are active without embedding/provider calls; BodyParts3D import remains embeddings OFF and the original Stage 2 exact/phrase resolver remains visible for calibration.");
