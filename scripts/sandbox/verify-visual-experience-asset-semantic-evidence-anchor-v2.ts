import fs from "node:fs";
import path from "node:path";

import {
  contextualSpatialEvidenceV2,
  resolveSemanticEvidenceAnchorsV2,
  type AssetCollectionGeometryEvidenceV1,
  type AssetSemanticEvidenceRecordV1,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-evidence";
import {
  compileAssetRerankerEvidencePassageV3,
} from "../../sandbox/probe-lab/assets/search/asset-semantic-reranker";
import type { AssetSearchDocumentV1 } from "../../sandbox/probe-lab/assets/search/asset-search-document";
import type { AssetSearchDocumentV2 } from "../../sandbox/probe-lab/assets/search/asset-search-document-v2";
import type { SearchQueryPacketV2 } from "../../sandbox/probe-lab/assets/search/asset-search-query-v2";

const rootArgIndex = process.argv.indexOf("--project-root");
const projectRoot = path.resolve(
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? process.argv[rootArgIndex + 1]
    : process.cwd(),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relative: string) {
  return fs.readFileSync(path.join(projectRoot, relative), "utf8");
}

function sourceDoc(input: {
  asset_id: string;
  label: string;
  laterality?: AssetSearchDocumentV1["laterality"];
  aliases?: string[];
  concepts?: string[];
}): AssetSearchDocumentV1 {
  return {
    schema_version: "myway_asset_search_document_v1",
    asset_id: input.asset_id,
    canonical_identity: input.label,
    display_name: input.label,
    aliases: input.aliases ?? [],
    semantic_tags: [],
    requested_concept: null,
    source_display_name: input.label,
    source_asset_id: input.asset_id,
    domain: "synthetic_test_domain",
    concept_ids: [],
    concept_names: input.concepts ?? [input.label],
    relation_terms: [],
    direct_relation_terms: [],
    ontology_1hop_terms: [],
    ontology_2hop_terms: [],
    affordances: [],
    contains: [],
    system: "synthetic",
    laterality: input.laterality ?? "unspecified",
    collection_id: "synthetic_collection",
    collection_name: "Synthetic collection",
    collection_member_id: input.asset_id,
    scene_review_status: "pending",
    semantic_review_status: "pending",
    search_eligible: true,
    runtime_available: true,
    search_text: input.label,
  };
}

function geometry(assetId: string, centerX: number): AssetCollectionGeometryEvidenceV1 {
  return {
    collection_id: "synthetic_collection",
    runtime_collection_space: "shared_test_space",
    world_bounds: {
      min: [centerX - 0.5, -0.5, -0.5],
      max: [centerX + 0.5, 0.5, 0.5],
      size: [1, 1, 1],
      center: [centerX, 0, 0],
    },
    runtime_transform: {
      position: [centerX, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    source: "collection_runtime_transform+measured_local_bounds",
  };
}

const packet = {
  schema_version: "myway_asset_search_query_packet_v2",
  requirement_id: "bridge_between_endpoints",
  semantic_concept: "rigid bridge between two endpoints",
  visual_role: "span the first endpoint toward the second endpoint",
  target_entity_kind: "visual_resource",
  target_material_or_class: [],
  granularity: "unspecified",
  laterality: { value: "unspecified", required: false },
  anchors: [
    { concept: "alpha endpoint", role: "context_anchor" },
    { concept: "beta endpoint", role: "context_anchor" },
    { concept: "turning", role: "context_anchor" },
  ],
  requested_relationships: [],
  negative_role_hints: ["An endpoint-only match is insufficient."],
  quantity: { minimum: 1, preferred: 1 },
  visual_importance: "primary",
  lexical_requirement: {
    semantic_name: "rigid bridge between two endpoints",
    visual_role: "span the first endpoint toward the second endpoint",
    semantic_tags: ["alpha endpoint", "beta endpoint", "turning"],
  },
  views: {
    identity_hint: "rigid bridge alpha endpoint beta endpoint",
    full_intent: "Find the bridge between alpha endpoint and beta endpoint.",
    relationship_role: "Use endpoints as context anchors.",
  },
  constraints: {
    runtime_available_before_resolution: true,
    search_eligible_before_candidate_generation: true,
    laterality_required: false,
    target_material_or_class: [],
    anchor_concepts: ["alpha endpoint", "beta endpoint", "turning"],
    endpoint_only_match_is_soft_negative: true,
  },
} satisfies SearchQueryPacketV2;

const references = [
  sourceDoc({ asset_id: "LEFT_ALPHA", label: "left alpha endpoint", laterality: "left", concepts: ["alpha endpoint"] }),
  sourceDoc({ asset_id: "RIGHT_ALPHA", label: "right alpha endpoint", laterality: "right", concepts: ["alpha endpoint"] }),
  sourceDoc({ asset_id: "LEFT_BETA", label: "left beta endpoint", laterality: "left", concepts: ["beta endpoint"] }),
  sourceDoc({ asset_id: "RIGHT_BETA", label: "right beta endpoint", laterality: "right", concepts: ["beta endpoint"] }),
  sourceDoc({ asset_id: "UNRELATED", label: "unrelated object", laterality: "unspecified" }),
];
const referenceGeometry = new Map<string, AssetCollectionGeometryEvidenceV1>([
  ["LEFT_ALPHA", geometry("LEFT_ALPHA", 0)],
  ["RIGHT_ALPHA", geometry("RIGHT_ALPHA", 0)],
  ["LEFT_BETA", geometry("LEFT_BETA", 10)],
  ["RIGHT_BETA", geometry("RIGHT_BETA", 10)],
  ["UNRELATED", geometry("UNRELATED", 30)],
]);

const resolutions = resolveSemanticEvidenceAnchorsV2({
  packet,
  reference_source_documents: references,
  reference_geometry_by_id: referenceGeometry,
});
assert(resolutions.find((item) => item.anchor === "alpha endpoint")?.matched_asset_ids.includes("LEFT_ALPHA"), "V2 must resolve source-backed anchors from the full reference collection.");
assert(resolutions.find((item) => item.anchor === "beta endpoint")?.matched_asset_ids.includes("LEFT_BETA"), "V2 must resolve the second source-backed anchor.");
assert((resolutions.find((item) => item.anchor === "turning")?.matched_asset_ids.length ?? 0) === 0, "Abstract context must remain unresolved when no source-backed identity/concept asset exists.");
assert(resolutions.every((item) => item.resolution_scope === "full_collection_reference"), "V2 reference scope must remain explicit.");

const bridgeSource = sourceDoc({ asset_id: "LEFT_BRIDGE", label: "left bridge", laterality: "left", concepts: ["bridge"] });
const bridgeRecord = {
  schema_version: "myway_asset_semantic_evidence_v1",
  asset_id: "LEFT_BRIDGE",
  canonical_identity: "left bridge",
  system: "synthetic",
  laterality: "left",
  source_asserted: [],
  measured: [],
  reviewed: [],
  model_inferred: [],
  collection_geometry: geometry("LEFT_BRIDGE", 5),
  excluded_unreviewed_role_metadata: [],
} satisfies AssetSemanticEvidenceRecordV1;
const sourceById = new Map(references.map((document) => [document.asset_id, document]));
const spatial = contextualSpatialEvidenceV2({
  candidate: bridgeRecord,
  source_document: bridgeSource,
  reference_source_documents_by_id: sourceById,
  reference_geometry_by_id: referenceGeometry,
  anchor_resolutions: resolutions,
});
assert(spatial.anchor_distances.length === 2, "Only resolvable physical anchors should produce geometry.");
assert(spatial.anchor_pair_geometry.length === 1, "Two resolved physical anchors must produce pair geometry.");
assert(spatial.anchor_pair_geometry[0]?.projection_inside_segment === true, "Bridge center should project inside the anchor segment.");
assert((spatial.anchor_pair_geometry[0]?.normalized_perpendicular_distance ?? 1) < 0.001, "Bridge should lie on the synthetic anchor corridor.");

const endpointRecord = { ...bridgeRecord, asset_id: "LEFT_ALPHA", canonical_identity: "left alpha endpoint", collection_geometry: geometry("LEFT_ALPHA", 0) };
const endpointSpatial = contextualSpatialEvidenceV2({
  candidate: endpointRecord,
  source_document: references[0]!,
  reference_source_documents_by_id: sourceById,
  reference_geometry_by_id: referenceGeometry,
  anchor_resolutions: resolutions,
});
assert(endpointSpatial.endpoint_anchor_matches.includes("alpha endpoint"), "Endpoint identity must be exposed as query-conditioned evidence instead of a hard-coded domain rule.");

const v2Document = {
  asset_id: "LEFT_ALPHA",
  canonical_identity: "left alpha endpoint",
  system: "synthetic",
  laterality: "left",
} as AssetSearchDocumentV2;
const passage = compileAssetRerankerEvidencePassageV3(
  v2Document,
  { asset_id: "LEFT_ALPHA", record: endpointRecord, contextual: endpointSpatial },
  packet,
);
assert(passage.includes("source-backed full-collection reference"), "Evidence V3 passage must make reference-anchor provenance explicit.");
assert(passage.includes("endpoint-only match is insufficient"), "Evidence V3 passage must carry the query packet's endpoint soft-negative when applicable.");

const evidence = read("sandbox/probe-lab/assets/search/asset-semantic-evidence.ts");
const evidenceServer = read("sandbox/probe-lab/assets/search/asset-semantic-evidence-pilot.server.ts");
const reranker = read("sandbox/probe-lab/assets/search/asset-semantic-reranker.ts");
const rerankerPilot = read("sandbox/probe-lab/assets/search/asset-semantic-reranker-pilot.server.ts");
const route = read("sandbox/probe-lab/visual-experience/routes/semantic-embedding-pilot.ts");
const ui = read("sandbox/probe-lab/visual-experience/ui/semantic-search-v2-panel.tsx");

for (const marker of [
  "resolveSemanticEvidenceAnchorsV2",
  'resolution_scope: "full_collection_reference"',
  "contextualSpatialEvidenceV2",
  "endpoint_anchor_matches",
  "candidate_gap_to_anchor_a_m",
  "candidate_gap_to_anchor_b_m",
]) assert(evidence.includes(marker), `Anchor Resolution V2 evidence marker missing: ${marker}`);

for (const marker of [
  "getPreparedAssetSearchCorpus",
  "reference_source_documents",
  "reference_geometry_by_id",
  "buildSemanticEvidenceContextsV2",
  "runSemanticEvidenceAuditV2",
]) assert(evidenceServer.includes(marker), `Evidence server V2 marker missing: ${marker}`);

for (const marker of [
  "compileAssetRerankerEvidencePassageV3",
  "buildAssetRerankerInputsEvidenceV3",
  "Two-anchor relational geometry",
]) assert(reranker.includes(marker), `Evidence Passage V3 marker missing: ${marker}`);

for (const marker of [
  "runSemanticAssetEvidenceRerankAbcV2",
  "anchor_resolution_v2",
  "evidence_v3",
]) assert(rerankerPilot.includes(marker), `A/B/C reranker marker missing: ${marker}`);

for (const marker of [
  'action === "semantic_evidence_anchor_audit_v2"',
  'action === "semantic_evidence_rerank_abc_v2"',
]) assert(route.includes(marker), `Semantic evidence route marker missing: ${marker}`);

for (const marker of [
  "Audit anchor geometry V2",
  "Run Evidence V3 A/B/C reranker",
  "Reference assets",
  "Reference geometry",
  "Evidence V3 A/B/C reranker · Raw JSON",
]) assert(ui.includes(marker), `Orchestration UI V2/V3 marker missing: ${marker}`);

for (const source of [evidence, evidenceServer, reranker, rerankerPilot]) {
  assert(!/\b(femur|hip|knee)\b/i.test(source), "Production evidence/reranker code must remain domain-generic and contain no anatomy benchmark special cases.");
}
assert(!/model_inferred\s*:\s*\[[^\]]+\]/.test(evidence), "Production evidence must not author model-inferred permanent facts.");

console.log("PASS: Asset Semantic Evidence Anchor Resolution V2 / Passage V3 verified.");
console.log("Full-collection source identity/concepts may supply reference anchors without entering the RRF candidate set; abstract anchors may remain unresolved; pair geometry and endpoint status are deterministic query-conditioned evidence; production code contains no benchmark anatomy special cases.");
