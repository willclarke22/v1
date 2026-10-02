import fs from "node:fs";
import path from "node:path";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

function read(relative) {
  return fs.readFileSync(path.join(projectRoot, relative), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireMarker(source, marker, message) {
  assert(source.includes(marker), `${message} Missing marker: ${marker}`);
}

function forbidPattern(source, pattern, message) {
  assert(!pattern.test(source), `${message} Forbidden pattern: ${pattern}`);
}

const evidence = read("sandbox/probe-lab/assets/search/asset-semantic-evidence.ts");
const evidenceServer = read("sandbox/probe-lab/assets/search/asset-semantic-evidence-pilot.server.ts");
const reranker = read("sandbox/probe-lab/assets/search/asset-semantic-reranker.ts");
const rerankerPilot = read("sandbox/probe-lab/assets/search/asset-semantic-reranker-pilot.server.ts");
const v2Server = read("sandbox/probe-lab/assets/search/asset-semantic-embedding-pilot-v2.server.ts");
const route = read("sandbox/probe-lab/visual-experience/routes/semantic-embedding-pilot.ts");
const panel = read("sandbox/probe-lab/visual-experience/ui/semantic-search-v2-panel.tsx");
const orchestration = read("sandbox/probe-lab/visual-experience/ui/orchestration-lab.tsx");
const fullAtlas = read("sandbox/probe-lab/assets/bodyparts3d-full-import.server.ts");
const readme = read("sandbox/probe-lab/visual-experience/README.md");

for (const marker of [
  "myway_asset_semantic_evidence_v1",
  '"source_asserted"',
  '"measured"',
  '"reviewed"',
  '"model_inferred"',
  "collectionGeometryEvidenceForAssetV1",
  "boundsGapMetersV1",
  "resolveSemanticEvidenceAnchorsV1",
  "contextualSpatialEvidenceV1",
  "projection_t",
  "interior_fraction",
]) requireMarker(evidence, marker, "Generic semantic evidence contract is incomplete.");

forbidPattern(
  evidence,
  /\b(femur|hip|knee|patella|humerus|tibia|fibula)\b/i,
  "Generic evidence math must not encode benchmark/anatomy-specific entity rules.",
);
forbidPattern(
  evidence,
  /articulates_with|transmits_rotation|carries_rotation|connects_hip|connects_knee/i,
  "Geometry evidence must not manufacture semantic anatomy predicates.",
);
requireMarker(
  evidence,
  "model_inferred: []",
  "Evidence V1 must author zero model-inferred permanent facts.",
);

for (const marker of [
  "myway_asset_semantic_evidence_snapshot_v1",
  "myway_asset_semantic_evidence_audit_v1",
  "getSemanticSearchServingCorpusV2",
  "loadReviewedAssetResolverSnapshot",
  "buildAssetSemanticEvidenceRecordV1",
  "buildSemanticEvidenceContextsV1",
  "runSemanticEvidenceAuditV1",
]) requireMarker(evidenceServer, marker, "Evidence snapshot/audit server is incomplete.");
forbidPattern(
  evidenceServer,
  /updateMyWayAsset|registerMyWayAsset|writeDurableAssetJson|callNvidia|callVisualOrchestrationCalibrationModel/,
  "Evidence audit must be derived/read-only and must not call a model/provider.",
);

requireMarker(
  v2Server,
  "getSemanticSearchServingCorpusV2",
  "Published V2 serving snapshot must expose the selected documents to the derived evidence layer.",
);

for (const marker of [
  "compileAssetRerankerPassageV1",
  "compileAssetRerankerEvidencePassageV2",
  "buildAssetRerankerInputsEvidenceV2",
  "Query-conditioned measured spatial evidence",
  "no model-authored permanent facts",
]) requireMarker(reranker, marker, "Evidence Passage V2 is incomplete or historical Passage V1 was lost.");

for (const marker of [
  "myway_asset_semantic_evidence_rerank_ab_v1",
  "runSemanticAssetEvidenceRerankAbV1",
  "baselineInputs",
  "evidenceInputs",
  "same query",
]) requireMarker(rerankerPilot, marker, "A/B reranker path is incomplete.");
requireMarker(
  rerankerPilot,
  "runSemanticAssetRerankV1",
  "Historical reranker V1 path must remain available.",
);

for (const marker of [
  'action === "semantic_evidence_publish_v1"',
  'action === "semantic_evidence_status_v1"',
  'action === "semantic_evidence_audit_v1"',
  'action === "semantic_evidence_rerank_ab_v1"',
]) requireMarker(route, marker, "Semantic evidence route action is missing.");

for (const marker of [
  "ASSET RETRIEVAL · CURRENT PIPELINE",
  "Build / refresh evidence",
  "Audit current evidence",
  "Run Evidence V2 A/B reranker",
  "Evidence audit · Raw JSON",
  "Evidence A/B reranker · Raw JSON",
  "Passage V1",
  "Evidence Passage V2",
  "Diagnostics / history",
  "SEARCH DOCUMENT / QUERY PACKET V2",
  "SEMANTIC RETRIEVAL RERANKER PILOT V1",
  "Run benchmark smoke (3 cases)",
]) requireMarker(panel, marker, "Orchestration retrieval panel cleanup/evidence observability is incomplete.");

for (const marker of [
  "ASSET RETRIEVAL QUERY",
  "Historical Search Bench",
  "Historical semantic embedding pilot V1",
  "<SemanticSearchV2Panel",
]) requireMarker(orchestration, marker, "Orchestration Lab cleanup is incomplete.");

requireMarker(fullAtlas, "runEmbedding: false", "Full BodyParts3D import embedding generation must remain OFF.");
requireMarker(readme, "Asset Semantic Evidence Pilot V1", "README evidence architecture section missing.");
requireMarker(readme, "zero model-inferred permanent facts", "README must state the no-generated-truth boundary.");
requireMarker(readme, "same query and same exact RRF Top 20", "README must document the A/B attribution boundary.");

console.log("PASS: Asset Semantic Evidence Pilot V1 verified.");
console.log(
  "Derived evidence stays read-only and provenance-aware, shared-collection spatial values remain measurements rather than anatomy claims, historical retrieval/reranker baselines remain available, and the Orchestration Lab preserves raw JSON while collapsing legacy controls into Diagnostics/History.",
);
