import type { AssetSearchDocumentV1 } from "./asset-search-document";

export const ASSET_SEARCH_DOCUMENT_V2_SCHEMA_VERSION =
  "myway_asset_search_document_v2" as const;

export type AssetSearchEvidenceV2 = {
  statement: string;
  source:
    | "asset_identity"
    | "bodyparts3d_ontology_direct"
    | "bodyparts3d_ontology_ancestor"
    | "asset_affordance_metadata"
    | "asset_contains_metadata";
  graph_distance: 0 | 1 | 2 | null;
  hard_truth: boolean;
};

export type AssetSearchDocumentV2 = {
  schema_version: typeof ASSET_SEARCH_DOCUMENT_V2_SCHEMA_VERSION;
  source_document_schema_version: AssetSearchDocumentV1["schema_version"];
  asset_id: string;
  canonical_identity: string;
  display_name: string;
  collection_member_id: string | null;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  search_eligible: boolean;
  identity: {
    canonical_identity: string;
    aliases: string[];
    concept_names: string[];
    domain: string;
    system: string | null;
    laterality: AssetSearchDocumentV1["laterality"];
    collection_id: string | null;
    collection_name: string | null;
    passage: string;
    provenance: AssetSearchEvidenceV2[];
  };
  relationship: {
    direct_relationships: string[];
    ontology_1hop_terms: string[];
    ontology_2hop_terms: string[];
    collection_name: string | null;
    passage: string;
    provenance: AssetSearchEvidenceV2[];
  };
  role: {
    affordances: string[];
    contains: string[];
    passage: string | null;
    provenance: AssetSearchEvidenceV2[];
  };
  execution: {
    scene_review_status: string;
    semantic_review_status: string;
    runtime_available: boolean;
    search_eligible: boolean;
    collection_id: string | null;
    collection_member_id: string | null;
  };
};

function sentence(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(", ")}.` : "";
}

function evidence(
  values: string[],
  source: AssetSearchEvidenceV2["source"],
  graphDistance: AssetSearchEvidenceV2["graph_distance"],
  hardTruth = true,
) {
  return values.map((statement) => ({
    statement,
    source,
    graph_distance: graphDistance,
    hard_truth: hardTruth,
  }));
}

export function buildAssetSearchDocumentV2(
  document: AssetSearchDocumentV1,
): AssetSearchDocumentV2 {
  const identityProvenance: AssetSearchEvidenceV2[] = [
    {
      statement: document.canonical_identity,
      source: "asset_identity",
      graph_distance: null,
      hard_truth: true,
    },
    ...evidence(document.aliases, "asset_identity", null),
    ...evidence(document.concept_names, "asset_identity", null),
  ];

  const relationshipProvenance: AssetSearchEvidenceV2[] = [
    ...evidence(
      document.direct_relation_terms,
      "bodyparts3d_ontology_direct",
      0,
    ),
    ...evidence(
      document.ontology_1hop_terms,
      "bodyparts3d_ontology_ancestor",
      1,
    ),
    ...evidence(
      document.ontology_2hop_terms,
      "bodyparts3d_ontology_ancestor",
      2,
    ),
  ];

  const roleProvenance: AssetSearchEvidenceV2[] = [
    ...evidence(
      document.affordances,
      "asset_affordance_metadata",
      null,
    ),
    ...evidence(
      document.contains,
      "asset_contains_metadata",
      null,
    ),
  ];

  const identityPassage = [
    `Asset identity: ${document.canonical_identity}.`,
    sentence("Aliases", document.aliases),
    sentence("Named concepts", document.concept_names),
    document.domain ? `Domain: ${document.domain}.` : "",
    document.system ? `System: ${document.system}.` : "",
    `Laterality: ${document.laterality}.`,
    document.collection_name ? `Collection: ${document.collection_name}.` : "",
  ].filter(Boolean).join("\n");

  const relationshipPassage = [
    `Relationship evidence for ${document.canonical_identity}.`,
    document.direct_relation_terms.length
      ? `Direct trusted relationships: ${document.direct_relation_terms.join("; ")}.`
      : "",
    document.ontology_1hop_terms.length
      ? `One-hop broader context: ${document.ontology_1hop_terms.join(", ")}.`
      : "",
    document.ontology_2hop_terms.length
      ? `Two-hop broader context: ${document.ontology_2hop_terms.join(", ")}.`
      : "",
    document.collection_name ? `Collection membership: ${document.collection_name}.` : "",
  ].filter(Boolean).join("\n");

  const rolePassage = roleProvenance.length
    ? [
        `Reviewed or deterministic use evidence for ${document.canonical_identity}.`,
        sentence("Known affordances", document.affordances),
        sentence("Known contained parts or regions", document.contains),
      ].filter(Boolean).join("\n")
    : null;

  return {
    schema_version: ASSET_SEARCH_DOCUMENT_V2_SCHEMA_VERSION,
    source_document_schema_version: document.schema_version,
    asset_id: document.asset_id,
    canonical_identity: document.canonical_identity,
    display_name: document.display_name,
    collection_member_id: document.collection_member_id,
    system: document.system,
    laterality: document.laterality,
    search_eligible: document.search_eligible,
    identity: {
      canonical_identity: document.canonical_identity,
      aliases: document.aliases,
      concept_names: document.concept_names,
      domain: document.domain,
      system: document.system,
      laterality: document.laterality,
      collection_id: document.collection_id,
      collection_name: document.collection_name,
      passage: identityPassage,
      provenance: identityProvenance,
    },
    relationship: {
      direct_relationships: document.direct_relation_terms,
      ontology_1hop_terms: document.ontology_1hop_terms,
      ontology_2hop_terms: document.ontology_2hop_terms,
      collection_name: document.collection_name,
      passage: relationshipPassage,
      provenance: relationshipProvenance,
    },
    role: {
      affordances: document.affordances,
      contains: document.contains,
      passage: rolePassage,
      provenance: roleProvenance,
    },
    execution: {
      scene_review_status: document.scene_review_status,
      semantic_review_status: document.semantic_review_status,
      runtime_available: document.runtime_available,
      search_eligible: document.search_eligible,
      collection_id: document.collection_id,
      collection_member_id: document.collection_member_id,
    },
  };
}

export function buildAssetSearchDocumentV2Views(
  document: AssetSearchDocumentV2,
) {
  const views: Array<{
    view: "identity" | "relationship" | "role";
    text: string;
    provenance: AssetSearchEvidenceV2[];
  }> = [
    {
      view: "identity",
      text: document.identity.passage,
      provenance: document.identity.provenance,
    },
    {
      view: "relationship",
      text: document.relationship.passage,
      provenance: document.relationship.provenance,
    },
  ];
  if (document.role.passage) {
    views.push({
      view: "role",
      text: document.role.passage,
      provenance: document.role.provenance,
    });
  }
  return views;
}
