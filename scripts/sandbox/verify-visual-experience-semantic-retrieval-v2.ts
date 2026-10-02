import fs from "node:fs";
import path from "node:path";

import { compileSearchQueryPacketV2 } from "../../sandbox/probe-lab/assets/search/asset-search-query-v2";
import {
  buildAssetSearchDocumentV2,
  buildAssetSearchDocumentV2Views,
} from "../../sandbox/probe-lab/assets/search/asset-search-document-v2";
import {
  fuseCandidateChannelsRrfV2,
  rankGraphAnchorEvidenceV2,
  rankSemanticChannelV2,
  ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE,
  ASSET_SEMANTIC_PILOT_V2_TARGET_COUNT,
  type SemanticVectorRowV2,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-search-v2";
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireMarker(source: string, marker: string, message: string) {
  assert(source.includes(marker), `${message} Missing marker: ${marker}`);
}

function forbidMarker(source: string, marker: string, message: string) {
  assert(!source.includes(marker), `${message} Forbidden marker: ${marker}`);
}

function fixture(overrides: Partial<AssetSearchDocumentV1>): AssetSearchDocumentV1 {
  return {
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
  };
}

const packet = compileSearchQueryPacketV2({
  requirement_id: "actor_transmitting_bone",
  semantic_name: "bone that carries rotation from the hip down toward the knee",
  visual_role:
    "rigid structure whose orientation at the hip determines the direction the knee faces",
  semantic_tags: ["hip", "knee", "rotation"],
  target_entity_kind: "anatomical_structure",
  target_material_or_class: ["bone"],
  anchors: [
    { concept: "hip", role: "proximal_anchor" },
    { concept: "knee", role: "distal_anchor" },
  ],
  requested_relationships: [
    { type: "connects_or_spans", from: "hip", to: "knee" },
  ],
});

assert(packet.schema_version === "myway_asset_search_query_packet_v2", "Query Packet V2 schema marker changed.");
assert(packet.views.identity_hint.includes("bone"), "Identity query view should preserve class/concept evidence.");
assert(packet.views.full_intent.includes("rigid structure"), "Full-intent query must preserve the visual role.");
assert(packet.views.relationship_role.includes("proximal_anchor"), "Relationship query should preserve anchor roles.");
assert(packet.constraints.endpoint_only_match_is_soft_negative, "Two-anchor role queries should expose endpoint-only soft-negative policy.");
assert(!packet.views.full_intent.includes("FJ_"), "Query compiler must never invent BodyParts3D ids.");

const sourceDocuments = [
  fixture({
    asset_id: "left_femur",
    canonical_identity: "left femur",
    display_name: "left femur",
    aliases: ["femur", "left thigh bone"],
    concept_names: ["femur"],
    direct_relation_terms: ["left femur is a femur", "left femur part of left lower limb"],
    ontology_1hop_terms: ["femur", "left lower limb"],
    ontology_2hop_terms: ["bone organ", "lower limb"],
    laterality: "left",
  }),
  fixture({
    asset_id: "left_knee",
    canonical_identity: "left knee",
    display_name: "left knee",
    aliases: ["knee"],
    concept_names: ["knee"],
    direct_relation_terms: ["left knee part of left lower limb"],
    ontology_1hop_terms: ["left lower limb"],
    laterality: "left",
  }),
  fixture({
    asset_id: "left_hip",
    canonical_identity: "left hip",
    display_name: "left hip",
    aliases: ["hip"],
    concept_names: ["hip"],
    direct_relation_terms: ["left hip part of pelvis"],
    ontology_1hop_terms: ["pelvis"],
    laterality: "left",
  }),
];
const documents = sourceDocuments.map(buildAssetSearchDocumentV2);
const femur = documents[0]!;
assert(femur.schema_version === "myway_asset_search_document_v2", "Search Document V2 schema marker changed.");
assert(femur.identity.passage.includes("left femur"), "Identity passage must preserve canonical identity.");
assert(femur.relationship.passage.includes("left femur is a femur"), "Relationship passage must preserve direct ontology evidence.");
assert(femur.relationship.provenance.some((item) => item.graph_distance === 0), "Direct relationship provenance must retain graph distance.");
assert(femur.role.passage === null, "Role/use passage must not be fabricated when trusted role metadata is absent.");
assert(buildAssetSearchDocumentV2Views(femur).length === 2, "Assets without trusted role evidence should emit identity + relationship vectors only.");

const rows: SemanticVectorRowV2[] = [
  { asset_id: "left_femur", view: "identity", vector: [0.55, 0.45], model: "fixture", source_text_hash: "a" },
  { asset_id: "left_femur", view: "relationship", vector: [1, 0], model: "fixture", source_text_hash: "b" },
  { asset_id: "left_knee", view: "identity", vector: [1, 0], model: "fixture", source_text_hash: "c" },
  { asset_id: "left_knee", view: "relationship", vector: [0.35, 0.65], model: "fixture", source_text_hash: "d" },
  { asset_id: "left_hip", view: "identity", vector: [0.9, 0.1], model: "fixture", source_text_hash: "e" },
  { asset_id: "left_hip", view: "relationship", vector: [0.25, 0.75], model: "fixture", source_text_hash: "f" },
];

const identityRank = rankSemanticChannelV2(
  documents,
  rows,
  [1, 0],
  "identity_hint",
  ["identity"],
  10,
);
const relationshipRank = rankSemanticChannelV2(
  documents,
  rows,
  [1, 0],
  "relationship_role",
  ["relationship", "role"],
  10,
);
assert(identityRank[0]?.asset_id === "left_knee", "Fixture should preserve endpoint-heavy identity ranking.");
assert(relationshipRank[0]?.asset_id === "left_femur", "Relationship view must be able to retrieve the role-fulfilling candidate independently.");

const graphRank = rankGraphAnchorEvidenceV2(documents, packet, 10);
const fused = fuseCandidateChannelsRrfV2(
  documents,
  [
    { name: "identity_vector", results: identityRank },
    { name: "relationship_vector", results: relationshipRank },
    { name: "graph_anchor", results: graphRank },
  ],
  20,
);
const fusedFemur = fused.find((item) => item.asset_id === "left_femur");
assert(fusedFemur, "Candidate union must preserve femur recall even when another channel prefers an endpoint.");
assert(fusedFemur.channel_ranks.relationship_vector === 1, "Candidate union must keep per-channel evidence visible.");
assert(ASSET_SEMANTIC_PILOT_V2_TARGET_COUNT === 96, "V2 must reuse the bounded 96-asset pilot size.");
assert(ASSET_SEMANTIC_PILOT_V2_PROVIDER_BATCH_SIZE === 4, "V2 passage indexing must retain four passages per provider request.");

const route = read("sandbox/probe-lab/visual-experience/routes/semantic-embedding-pilot.ts");
const v2Server = read("sandbox/probe-lab/assets/search/asset-semantic-embedding-pilot-v2.server.ts");
const v2Document = read("sandbox/probe-lab/assets/search/asset-search-document-v2.ts");
const v2Query = read("sandbox/probe-lab/assets/search/asset-search-query-v2.ts");
const v2Search = read("sandbox/probe-lab/assets/search/asset-semantic-search-v2.ts");
const ui = read("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const v2Ui = read("sandbox/probe-lab/visual-experience/ui/semantic-search-v2-panel.tsx");
const v1Pilot = read("sandbox/probe-lab/assets/search/asset-semantic-embedding-pilot.server.ts");
const v1Semantic = read("sandbox/probe-lab/assets/search/asset-semantic-search.ts");
const fullAtlas = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const readme = read("sandbox/probe-lab/visual-experience/README.md");

for (const marker of [
  'action === "pilot_v2_prepare"',
  'action === "pilot_v2_step"',
  'action === "pilot_v2_run_window"',
  'action === "pilot_v2_status"',
  'action === "pilot_v2_reset"',
  'action === "semantic_compare_v2"',
  "request_parse_duration_ms",
  "route_wrapper_duration_ms",
]) requireMarker(route, marker, "V2 route lifecycle/timing is incomplete.");

for (const marker of [
  "semantic-search-v2/bodyparts3d-pilot-state.json",
  "source_text_hash",
  "provenance_hash",
  "runSemanticAssetSearchComparisonV2",
  "query_embedding_wall_duration_ms",
  "unaccounted_duration_ms",
  "provider_calls: 3",
  "embedding_calls: 3",
]) requireMarker(v2Server, marker, "V2 pilot must be versioned, resumable, and fully instrumented.");

for (const marker of [
  "myway_asset_search_document_v2",
  "bodyparts3d_ontology_direct",
  "graph_distance",
  "runtime_available",
]) requireMarker(v2Document, marker, "Search Document V2 provenance/execution boundary is incomplete.");

for (const marker of [
  "myway_asset_search_query_packet_v2",
  "identity_hint",
  "full_intent",
  "relationship_role",
  "endpoint_only_match_is_soft_negative",
]) requireMarker(v2Query, marker, "Query Compiler V2 channel contract is incomplete.");

for (const marker of [
  "ASSET_SEMANTIC_RRF_K = 60",
  "rankSemanticChannelV2",
  "rankGraphAnchorEvidenceV2",
  "fuseCandidateChannelsRrfV2",
]) requireMarker(v2Search, marker, "V2 candidate-generation/fusion contract is incomplete.");

requireMarker(ui, "<SemanticSearchV2Panel", "Orchestration Lab must mount the V2 benchmark panel.");
for (const marker of [
  "SEARCH DOCUMENT / QUERY PACKET V2",
  "Run V2 candidate comparison",
  "RRF candidate union",
  "Unaccounted ms",
  "V1 artifacts untouched",
]) requireMarker(v2Ui, marker, "V2 UI must expose pilot controls, evidence, and timing.");

requireMarker(
  v1Pilot,
  "myway_asset_semantic_embedding_pilot_v1",
  "Historical V1 pilot baseline must remain intact for comparison.",
);
for (const marker of [
  "0.35 * lexicalNormalized",
  "0.65 * vectorNormalized",
]) requireMarker(v1Semantic, marker, "Historical V1 hybrid baseline must remain intact for comparison.");

requireMarker(fullAtlas, "runEmbedding: false", "Full BodyParts3D import embeddings must remain OFF.");
requireMarker(readme, "Search Query / Search Document V2 candidate-generation benchmark", "README must document the V2 benchmark boundary.");
forbidMarker(v2Server, "llama-nemotron-rerank", "Reranker belongs in the subsequent patch, not V2 representation/fusion.");
forbidMarker(v2Server, "callVisualOrchestrationCalibrationModel", "V2 retrieval benchmark must not add a GLM call.");

console.log("PASS: Semantic Asset Retrieval V2 candidate-generation benchmark verified.");
console.log("Query Packet V2 + multi-view Search Document V2 preserve the same 96-asset bounded experiment, version V2 vectors separately, expose identity/full-intent/relationship/graph evidence through RRF, and instrument comparison latency without adding a reranker or full-atlas semantic backfill.");
