import fs from "node:fs";
import path from "node:path";

import {
  buildSemanticRetrievalPassageV1,
  buildSemanticRetrievalQueryV1,
  cosineSimilarity,
  fuseLexicalAndSemanticPilotResults,
  rankSemanticVectorRows,
  selectSemanticEmbeddingPilotDocuments,
  ASSET_SEMANTIC_PILOT_BATCH_SIZE,
  ASSET_SEMANTIC_PILOT_TARGET_COUNT,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-search";
import type { AssetSearchDocumentV1 } from "../../sandbox/probe-lab/assets/search/asset-search-document";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

function read(relative: string) {
  return fs.readFileSync(path.join(projectRoot, relative), "utf8");
}
function requireMarker(source: string, marker: string, message: string) {
  if (!source.includes(marker)) throw new Error(`${message} Missing marker: ${marker}`);
}
function forbidMarker(source: string, marker: string, message: string) {
  if (source.includes(marker)) throw new Error(`${message} Forbidden marker: ${marker}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const provider = read("sandbox/probe-lab/assets/enrichment/asset-enrichment-provider.server.ts");
const searchServer = read("sandbox/probe-lab/assets/search/asset-search-bench.server.ts");
const semantic = read("sandbox/probe-lab/assets/search/asset-semantic-search.ts");
const pilot = read("sandbox/probe-lab/assets/search/asset-semantic-embedding-pilot.server.ts");
const route = read("sandbox/probe-lab/visual-experience/routes/semantic-embedding-pilot.ts");
const api = read("app/api/sandbox/probe-lab/visual-experience/semantic-embedding-pilot/route.ts");
const ui = read("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const importer = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");

for (const marker of [
  "embedAssetSemanticSearchTexts",
  "embedSemanticSearchQuery",
  'input_type: inputType',
  'input: normalized',
  'normalized.length > 16',
]) requireMarker(provider, marker, "The existing NVIDIA embedding provider must support bounded semantic passage/query batches.");

for (const marker of [
  "getPreparedAssetSearchCorpus",
  "documents: result.cache.documents",
  "registry_snapshot_id: result.cache.registry_snapshot_id",
]) requireMarker(searchServer, marker, "The semantic pilot must reuse the prepared Search Bench corpus instead of rebuilding a parallel atlas representation.");

for (const marker of [
  'ASSET_SEMANTIC_PILOT_TARGET_COUNT = 96',
  'ASSET_SEMANTIC_PILOT_BATCH_SIZE = 4',
  "selectSemanticEmbeddingPilotDocuments",
  "buildSemanticRetrievalPassageV1",
  "buildSemanticRetrievalQueryV1",
  "cosineSimilarity",
  "0.35 * lexicalNormalized",
  "0.65 * vectorNormalized",
]) requireMarker(semantic, marker, "The pure semantic-search contract must keep the pilot bounded and expose transparent vector/hybrid scoring.");

for (const marker of [
  'sandbox/probe-lab/assets/embeddings/semantic-search/',
  "source_text_hash",
  "stableTextHash",
  "MAX_PROVIDER_ATTEMPTS = 4",
  "RETRY_DELAYS_MS",
  "readDurableAssetJson",
  "writeDurableAssetJson",
  "reusableArtifact",
  "runSemanticEmbeddingPilotWindow",
  "runSemanticAssetSearchComparison",
  "provider_calls: 1",
  "embedding_calls: 1",
]) requireMarker(pilot, marker, "The semantic pilot must be durable, resumable, source-hash-aware, rate-aware, and explicitly measurable.");

for (const marker of [
  'action === "pilot_prepare"',
  'action === "pilot_step"',
  'action === "pilot_run_window"',
  'action === "pilot_status"',
  'action === "pilot_reset"',
  'action === "semantic_compare"',
]) requireMarker(route, marker, "The separate semantic embedding pilot route must expose the bounded pilot lifecycle.");

requireMarker(api, "export const maxDuration = 300;", "The pilot route must allow bounded hosted embedding calls to complete.");

for (const marker of [
  "SEMANTIC RETRIEVAL · 96-ASSET PILOT",
  "Prepare / resume pilot",
  "Index next 4",
  "Index / resume next 24",
  "Run lexical + semantic comparison",
  "Semantic embedding pilot comparison",
  "full-atlas import embeddings remain OFF",
]) requireMarker(ui, marker, "The Orchestration Lab must expose explicit pilot controls and side-by-side retrieval evidence.");

for (const marker of [
  "runVision: false",
  "runEmbedding: false",
]) requireMarker(importer, marker, "The semantic pilot must not change the full-atlas import enrichment policy.");

forbidMarker(
  pilot,
  "appearance_embedding",
  "Semantic retrieval vectors must remain separate from appearance embeddings.",
);

const fixture = (overrides: Partial<AssetSearchDocumentV1>): AssetSearchDocumentV1 => ({
  schema_version: "myway_asset_search_document_v1",
  asset_id: "fixture",
  canonical_identity: "fixture",
  display_name: "fixture",
  aliases: [],
  domain: "human_anatomy_bodyparts3d",
  semantic_tags: [],
  requested_concept: null,
  source_display_name: null,
  source_asset_id: null,
  concept_ids: [],
  concept_names: [],
  relation_terms: [],
  direct_relation_terms: [],
  ontology_1hop_terms: [],
  ontology_2hop_terms: [],
  affordances: [],
  contains: [],
  collection_id: "bodyparts3d_4_0_full_atlas",
  collection_name: "BodyParts3D 4.0",
  collection_member_id: null,
  system: "skeletal",
  laterality: "unspecified",
  scene_review_status: "pending",
  semantic_review_status: "pending",
  runtime_available: true,
  search_eligible: true,
  search_text: "",
  ...overrides,
});

const documents: AssetSearchDocumentV1[] = [];
for (let index = 0; index < 120; index += 1) {
  documents.push(fixture({
    asset_id: `asset_${String(index).padStart(3, "0")}`,
    canonical_identity: `generic structure ${index}`,
    display_name: `generic structure ${index}`,
    system: ["skeletal", "muscular", "nervous", "respiratory"][index % 4]!,
  }));
}
documents.push(
  fixture({ asset_id: "left_femur", canonical_identity: "left femur", display_name: "left femur", aliases: ["femur"], laterality: "left" }),
  fixture({ asset_id: "right_femur", canonical_identity: "right femur", display_name: "right femur", aliases: ["femur"], laterality: "right" }),
  fixture({ asset_id: "left_hip", canonical_identity: "left hip", display_name: "left hip", aliases: ["hip"], laterality: "left" }),
  fixture({ asset_id: "right_hip", canonical_identity: "right hip", display_name: "right hip", aliases: ["hip"], laterality: "right" }),
  fixture({ asset_id: "left_knee", canonical_identity: "left knee", display_name: "left knee", aliases: ["knee"], laterality: "left" }),
  fixture({ asset_id: "right_knee", canonical_identity: "right knee", display_name: "right knee", aliases: ["knee"], laterality: "right" }),
);

const selected = selectSemanticEmbeddingPilotDocuments(documents);
assert(selected.length === ASSET_SEMANTIC_PILOT_TARGET_COUNT, "Pilot selector must deterministically cap at 96 documents.");
assert(selected.some((document) => document.asset_id === "left_femur"), "Pilot selector must include left femur benchmark anatomy.");
assert(selected.some((document) => document.asset_id === "right_femur"), "Pilot selector must include right femur benchmark anatomy.");
assert(selected.some((document) => document.asset_id === "left_hip"), "Pilot selector must include hip benchmark anatomy.");
assert(ASSET_SEMANTIC_PILOT_BATCH_SIZE === 4, "Provider batch size must remain four.");

const femur = documents.find((document) => document.asset_id === "left_femur")!;
const passage = buildSemanticRetrievalPassageV1(femur);
assert(passage.includes("Anatomical asset: left femur."), "Semantic passage must preserve authoritative identity.");
assert(!passage.toLowerCase().includes("appearance"), "Semantic passage must not use appearance-enrichment prose.");

const query = buildSemanticRetrievalQueryV1({
  semantic_name: "bone carrying hip rotation to the knee",
  visual_role: "rigid structure whose orientation determines knee direction",
  semantic_tags: ["hip", "knee", "rotation"],
});
assert(query.includes("Teaching/visual role:"), "Semantic query must carry the GLM visual role into query embedding text.");

assert(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9, "Cosine identity must equal one.");
assert(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9, "Orthogonal cosine must equal zero.");

const vectorRank = rankSemanticVectorRows(
  documents,
  [
    { asset_id: "left_femur", vector: [1, 0], model: "fixture", source_text_hash: "a" },
    { asset_id: "left_knee", vector: [0.2, 0.98], model: "fixture", source_text_hash: "b" },
  ],
  [1, 0],
  2,
);
assert(vectorRank[0]?.asset_id === "left_femur", "Vector ranking must order by cosine similarity.");

const hybrid = fuseLexicalAndSemanticPilotResults(
  documents,
  [
    {
      rank: 1, score: 100, asset_id: "left_knee", canonical_identity: "left knee",
      display_name: "left knee", collection_member_id: null, concept_ids: [], concept_names: [],
      system: "skeletal", laterality: "left", scene_review_status: "pending",
      identity_match: "none", matched_terms: ["knee"], matched_fields: ["canonical_identity"],
    },
    {
      rank: 2, score: 80, asset_id: "left_femur", canonical_identity: "left femur",
      display_name: "left femur", collection_member_id: null, concept_ids: [], concept_names: [],
      system: "skeletal", laterality: "left", scene_review_status: "pending",
      identity_match: "none", matched_terms: ["bone"], matched_fields: ["concept_names"],
    },
  ],
  [
    {
      rank: 1, similarity: 0.95, asset_id: "left_femur", canonical_identity: "left femur",
      display_name: "left femur", collection_member_id: null, system: "skeletal",
      laterality: "left", scene_review_status: "pending",
    },
    {
      rank: 2, similarity: 0.5, asset_id: "left_knee", canonical_identity: "left knee",
      display_name: "left knee", collection_member_id: null, system: "skeletal",
      laterality: "left", scene_review_status: "pending",
    },
  ],
  2,
);
assert(hybrid[0]?.asset_id === "left_femur", "Semantic-heavy hybrid scoring must be able to rescue a functional paraphrase from a lexical-first knee result.");

console.log(
  "PASS: semantic asset retrieval embedding pilot verified. The 96-asset sample is deterministic and benchmark-aware; indexing uses four-passage NVIDIA batches with durable per-vector checkpoints, hash reuse, bounded retry/backoff, and separate semantic vector artifacts; Search Bench exposes lexical, vector, and hybrid evidence while full-atlas import embeddings remain OFF.",
);
