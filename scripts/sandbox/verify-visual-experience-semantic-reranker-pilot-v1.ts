import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildAssetSearchDocumentV2 } from "../../sandbox/probe-lab/assets/search/asset-search-document-v2";
import { compileSearchQueryPacketV2 } from "../../sandbox/probe-lab/assets/search/asset-search-query-v2";
import {
  ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-rerank-benchmark";
import {
  buildAssetRerankerInputsV1,
  compileAssetRerankerPassageV1,
  compileAssetRerankerQueryV1,
  mergeAssetRerankerRankingsV1,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-reranker";
import { compileVisualOrchestrationSearchPacketsV2Shadow } from "../../sandbox/probe-lab/visual-experience/orchestration/search-query-v2-shadow";
import type { AssetSearchDocumentV1 } from "../../sandbox/probe-lab/assets/search/asset-search-document";
import type { CandidateFusionResultV2 } from "../../sandbox/probe-lab/assets/search/asset-semantic-search-v2";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--project-root");
const projectRoot = path.resolve(
  rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1]! : process.cwd(),
);

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function fixture(input: Partial<AssetSearchDocumentV1> & Pick<AssetSearchDocumentV1, "asset_id" | "canonical_identity">): AssetSearchDocumentV1 {
  return {
    schema_version: "myway_asset_search_document_v1",
    asset_id: input.asset_id,
    canonical_identity: input.canonical_identity,
    display_name: input.display_name ?? input.canonical_identity,
    source_display_name: input.source_display_name ?? input.canonical_identity,
    aliases: input.aliases ?? [],
    semantic_tags: input.semantic_tags ?? [],
    requested_concept: input.requested_concept ?? null,
    source_asset_id: input.source_asset_id ?? null,
    concept_ids: input.concept_ids ?? [],
    concept_names: input.concept_names ?? [],
    relation_terms: input.relation_terms ?? input.direct_relation_terms ?? [],
    direct_relation_terms: input.direct_relation_terms ?? [],
    ontology_1hop_terms: input.ontology_1hop_terms ?? [],
    ontology_2hop_terms: input.ontology_2hop_terms ?? [],
    affordances: input.affordances ?? [],
    contains: input.contains ?? [],
    domain: input.domain ?? "anatomy",
    system: input.system ?? "skeletal",
    laterality: input.laterality ?? "unspecified",
    collection_id: input.collection_id ?? "bodyparts3d_full_atlas",
    collection_name: input.collection_name ?? "BodyParts3D full atlas",
    collection_member_id: input.collection_member_id ?? input.asset_id,
    scene_review_status: input.scene_review_status ?? "approved",
    semantic_review_status: input.semantic_review_status ?? "verified",
    runtime_available: input.runtime_available ?? true,
    search_eligible: input.search_eligible ?? true,
    search_text: input.search_text ?? input.canonical_identity,
  };
}

const packet = compileSearchQueryPacketV2({
  semantic_name: "structure that carries an action between two endpoints",
  visual_role: "intermediate rigid structure that fulfills the requested relationship",
  semantic_tags: ["endpoint a", "endpoint b", "rotation"],
  anchors: [
    { concept: "endpoint a", role: "context_anchor" },
    { concept: "endpoint b", role: "context_anchor" },
  ],
});
const rerankerQuery = compileAssetRerankerQueryV1(packet);
assert(rerankerQuery.includes("anchor or endpoint"), "Reranker query must preserve generic endpoint-vs-role discrimination.");

const intermediary = buildAssetSearchDocumentV2(fixture({
  asset_id: "intermediary",
  canonical_identity: "intermediate structure",
  aliases: ["connector"],
  direct_relation_terms: ["connects endpoint a to endpoint b"],
}));
const endpoint = buildAssetSearchDocumentV2(fixture({
  asset_id: "endpoint",
  canonical_identity: "endpoint b",
  aliases: ["endpoint"],
  direct_relation_terms: ["part of endpoint region"],
}));
const passage = compileAssetRerankerPassageV1(intermediary);
assert(!/RRF|rank #|rrf_score/i.test(passage), "Reranker passage must not leak first-stage rank/score.");
assert(passage.includes("connects endpoint a to endpoint b"), "Reranker passage must preserve trusted relationship evidence.");

const fused: CandidateFusionResultV2[] = [
  {
    rank: 1,
    rrf_score: 0.08,
    asset_id: "endpoint",
    canonical_identity: "endpoint b",
    display_name: "endpoint b",
    system: "skeletal",
    laterality: "unspecified",
    channel_ranks: { lexical: 1 },
    channel_evidence: ["lexical#1"],
  },
  {
    rank: 2,
    rrf_score: 0.07,
    asset_id: "intermediary",
    canonical_identity: "intermediate structure",
    display_name: "intermediate structure",
    system: "skeletal",
    laterality: "unspecified",
    channel_ranks: { relationship_vector: 1 },
    channel_evidence: ["relationship_vector#1"],
  },
];
const inputs = buildAssetRerankerInputsV1(fused, [endpoint, intermediary]);
const reranked = mergeAssetRerankerRankingsV1(inputs, [
  { index: 1, logit: 3.2 },
  { index: 0, logit: -0.4 },
]);
assert.equal(reranked[0]?.asset_id, "intermediary", "Cross-encoder evidence must be able to move a role-fulfilling candidate above an endpoint without a production hard-code.");
assert.equal(reranked[0]?.previous_rrf_rank, 2, "Before/after rank evidence must be preserved.");
assert.equal(reranked[0]?.rank_delta, 1, "Rank delta should report upward movement.");

assert.equal(ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES.length, 12, "Initial reranker benchmark catalog should contain 12 bounded cases.");
assert(ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES.some((item) => item.category === "endpoint_vs_intermediary"), "Benchmark must retain endpoint-vs-intermediary coverage.");
assert(ASSET_SEMANTIC_RERANK_BENCHMARK_V1_CASES.some((item) => item.category === "laterality"), "Benchmark must include laterality coverage.");

const shadowPackets = compileVisualOrchestrationSearchPacketsV2Shadow({
  required_visual_concepts: [
    { semantic_name: "structure a", role: "show the source", semantic_tags: ["source"] },
    { semantic_name: "structure b", role: "show the target", semantic_tags: ["target"] },
  ],
  relationships: [
    {
      source_semantic_name: "structure a",
      relationship: "causes",
      target_semantic_name: "structure b",
      learning_reason: "show the mechanism",
    },
  ],
});
assert.equal(shadowPackets.length, 2, "Stage shadow adapter should compile one packet per visual concept.");
assert(shadowPackets[0]?.requested_relationships.some((item) => item.type === "causes"), "Stage-3 relationship evidence must survive into shadow Query Packet V2.");

const provider = read("sandbox/probe-lab/assets/search/asset-semantic-reranker-provider.server.ts");
assert(provider.includes("nvidia/llama-nemotron-rerank-vl-1b-v2"), "Active NVIDIA reranker model marker missing.");
assert(provider.includes("/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking"), "Hosted NVIDIA reranking endpoint marker missing.");
assert(provider.includes("query: { text: query }"), "Provider request must use NVIDIA query.text contract.");
assert(provider.includes("passages: passages.map((text) => ({ text }))"), "Provider request must use NVIDIA passages[].text contract.");
assert(provider.includes("record.index") && provider.includes("record.logit"), "Provider response must validate index/logit rankings.");

const v2Server = read("sandbox/probe-lab/assets/search/asset-semantic-embedding-pilot-v2.server.ts");
assert(v2Server.includes("myway_asset_semantic_serving_snapshot_v2"), "Published serving snapshot schema marker missing.");
assert(v2Server.includes("publishSemanticSearchServingSnapshotV2"), "Snapshot publish function missing.");
assert(v2Server.includes("runSemanticAssetSearchServingV2"), "Snapshot-backed serving search missing.");
const servingStart = v2Server.indexOf("export async function runSemanticAssetSearchServingV2");
const historicalStart = v2Server.indexOf("export async function runSemanticAssetSearchComparisonV2", servingStart);
const servingSection = v2Server.slice(servingStart, historicalStart);
assert(!servingSection.includes("ensurePilotStateV2"), "Query-serving path must not re-enter pilot/corpus preparation.");
assert(!servingSection.includes("getPreparedAssetSearchCorpus"), "Query-serving path must not rebuild/read the prepared corpus.");
assert(v2Server.includes("servingSnapshotV2 = null"), "Pilot writes/reset must invalidate stale serving snapshots.");
assert(!v2Server.includes("llama-nemotron-rerank"), "Reranker provider must remain separate from V2 candidate-generation server.");

const rerankPilot = read("sandbox/probe-lab/assets/search/asset-semantic-reranker-pilot.server.ts");
assert(rerankPilot.includes("slice(0, 20)"), "Reranker must be bounded to the RRF Top 20.");
assert(rerankPilot.includes("authority_note"), "Reranker result must state the evidence-only authority boundary.");
assert(!rerankPilot.includes("resolveReviewedAsset") && !rerankPilot.includes("director"), "Reranker pilot must not bind execution or Director authority.");

const route = read("sandbox/probe-lab/visual-experience/routes/semantic-embedding-pilot.ts");
for (const marker of [
  'action === "pilot_v2_publish_serving_snapshot"',
  'action === "reranker_probe"',
  'action === "semantic_rerank_v1"',
  'action === "semantic_rerank_benchmark_v1"',
]) assert(route.includes(marker), `Reranker route action missing: ${marker}`);

const ui = read("sandbox/probe-lab/visual-experience/ui/semantic-search-v2-panel.tsx");
for (const marker of [
  "SEMANTIC RETRIEVAL RERANKER PILOT V1",
  "Publish query-ready snapshot",
  "Probe NVIDIA reranker",
  "Run RRF → reranker",
  "Before vs after",
  "Run benchmark smoke (3 cases)",
]) assert(ui.includes(marker), `Reranker UI marker missing: ${marker}`);

const stageRunner = read("sandbox/probe-lab/visual-experience/orchestration/run-stage.server.ts");
assert(stageRunner.includes("search_query_packets_v2_shadow"), "Stage runner must expose Query Packet V2 shadow output.");
assert(stageRunner.includes("compileVisualOrchestrationSearchPacketsV2Shadow"), "Stage runner must use the shadow adapter.");

const fullAtlas = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
assert(fullAtlas.includes("runEmbedding: false"), "Full BodyParts3D import embeddings must remain OFF.");

const readme = read("sandbox/probe-lab/visual-experience/README.md");
assert(readme.includes("Semantic Retrieval Reranker Pilot V1"), "README reranker pilot section missing.");
assert(readme.includes("2,234-asset semantic backfill"), "README must preserve the bounded-pilot/full-backfill boundary.");

console.log("PASS: Semantic Retrieval Reranker Pilot V1 verified.");
console.log("Published serving snapshot keeps corpus preparation out of the query path; NVIDIA reranking is bounded to RRF Top 20, preserves before/after evidence, remains non-authoritative, and is backed by a 12-case benchmark plus Stage-3 Query Packet V2 shadow compilation.");
