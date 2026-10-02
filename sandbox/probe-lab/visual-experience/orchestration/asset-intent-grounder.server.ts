import {
  BODYPARTS3D_FULL_COLLECTION_ID,
  BODYPARTS3D_SLP_COLLECTION_ID,
} from "../../assets/bodyparts3d-slp-pilot";
import {
  readBodyParts3dFullCatalog,
  type BodyParts3dFullCatalogV1,
} from "../../assets/bodyparts3d-full-import.server";
import {
  getAssetBrowserRegistrySnapshot,
} from "../../assets/asset-browser-snapshot.server";
import type {
  AssetResolveRequest,
  MyWayAssetRecord,
} from "../../assets/asset-types";
import {
  assetMatchesSemanticPhrase,
  normalizeAssetSemanticPhrase,
} from "../../assets/asset-stable-identity";
import type {
  AssetLexicalSearchResultV1,
} from "../../assets/search/asset-lexical-search";
import type {
  AssetSearchBenchCollectionMode,
} from "../../assets/search/asset-search-bench.server";
import type {
  VisualAssetIntentGroundingRequest,
} from "./asset-intent-adapter";
import type {
  VisualAssetIntentLaterality,
} from "./contracts";

export const VISUAL_ASSET_GROUNDING_VERSION =
  "myway_visual_asset_grounding_v2" as const;

export type VisualAssetGroundingStatus =
  | "resolved"
  | "ambiguous"
  | "candidate_below_threshold"
  | "missing";

export type VisualAssetGroundingMethod =
  | "collection_exact"
  | "collection_concept_family"
  | "general_identity_exact"
  | "general_identity_candidate"
  | "reviewed_library"
  | "lexical_evidence"
  | "none";

export type VisualGroundedAssetRef = {
  asset_id: string;
  public_path: string;
  canonical_label: string;
  display_name: string;
  source_type: MyWayAssetRecord["source_type"];
  scene_review_status: MyWayAssetRecord["scene_review_status"] | "pending";
  semantic_review_status: MyWayAssetRecord["semantic_review_status"] | "pending";
  dimensions_m: MyWayAssetRecord["dimensions_m"];
  default_scale: number;
  default_rotation: MyWayAssetRecord["default_rotation"];
  ground_offset_m: number;
  collection_membership: MyWayAssetRecord["collection_membership"] | null;
};

type GeneralIdentityMatchKind =
  | "trusted_exact"
  | "registered_exact"
  | "semantic_phrase";

export type VisualAssetGroundingResult = {
  schema_version: typeof VISUAL_ASSET_GROUNDING_VERSION;
  intent: VisualAssetIntentGroundingRequest["intent"];
  status: VisualAssetGroundingStatus;
  method: VisualAssetGroundingMethod;
  confidence: "high" | "medium" | "low";
  escalation_required: boolean;
  resolved_asset: VisualGroundedAssetRef | null;
  candidates: VisualGroundedAssetRef[];
  appearance_request: VisualAssetIntentGroundingRequest["appearance_request"];
  diagnostics: {
    bodyparts_catalog_concept_count: number;
    bodyparts_exact_candidate_count: number;
    equivalent_variant_family: boolean;
    presentation_choice_only: boolean;
    presentation_choice_reason: string | null;
    general_identity_match_kind: GeneralIdentityMatchKind | null;
    general_identity_candidate_count: number;
    general_execution_eligible_count: number;
    reviewed_resolver_ok: boolean;
    reviewed_resolver_failure_reason: string | null;
    lexical_fallback_used: boolean;
    lexical_candidates: AssetLexicalSearchResultV1[];
  };
};

function normalize(value: string) {
  return normalizeAssetSemanticPhrase(value);
}

function exactRegisteredIdentityNames(asset: MyWayAssetRecord) {
  return [
    asset.collection_membership?.concept_name ?? "",
    asset.verified_canonical_label ?? "",
    ...(asset.verified_aliases ?? []),
    asset.canonical_label,
    asset.display_name,
    asset.requested_concept ?? "",
    asset.source_display_name ?? "",
    ...asset.aliases,
    ...(asset.semantic_tags ?? []),
    ...(asset.preferred_for_concepts ?? []),
  ]
    .map(normalize)
    .filter(Boolean);
}

function trustedExactIdentityNames(asset: MyWayAssetRecord) {
  if (asset.semantic_review_status !== "verified") return [];
  return [
    asset.verified_canonical_label ?? asset.canonical_label,
    ...(asset.verified_aliases ?? []),
    ...asset.aliases,
    ...(asset.preferred_for_concepts ?? []),
  ]
    .map(normalize)
    .filter(Boolean);
}

function detectedLaterality(asset: MyWayAssetRecord): VisualAssetIntentLaterality {
  const text = normalize([
    asset.canonical_label,
    asset.display_name,
    asset.collection_membership?.concept_name ?? "",
    ...(asset.aliases ?? []),
    ...(asset.verified_aliases ?? []),
    ...(asset.collection_membership?.group_tags ?? []),
  ].join(" "));
  const hasLeft = /\bleft\b/.test(text);
  const hasRight = /\bright\b/.test(text);
  if (hasLeft && hasRight) return "bilateral";
  if (hasLeft) return "left";
  if (hasRight) return "right";
  return "unspecified";
}

function lateralityMatches(
  asset: MyWayAssetRecord,
  laterality: VisualAssetIntentLaterality,
) {
  if (laterality === "unspecified") return true;
  const actual = detectedLaterality(asset);
  if (laterality === "bilateral") return actual === "bilateral" || actual === "unspecified";
  return actual === laterality;
}

function collectionIdForMode(mode: AssetSearchBenchCollectionMode) {
  return mode === "bodyparts3d_slp_pilot"
    ? BODYPARTS3D_SLP_COLLECTION_ID
    : BODYPARTS3D_FULL_COLLECTION_ID;
}

function usableSandboxRecord(asset: MyWayAssetRecord) {
  return asset.safe_to_use_in_sandbox && asset.status !== "rejected";
}

function executionEligibleGeneralAsset(asset: MyWayAssetRecord) {
  const cloudReady =
    asset.storage_provider === "r2" &&
    /^https:\/\//i.test(asset.public_path) &&
    Boolean(asset.storage_object_key) &&
    Boolean(asset.content_hash);
  return (
    usableSandboxRecord(asset) &&
    asset.scene_review_status === "approved" &&
    asset.semantic_review_status === "verified" &&
    asset.license_kind !== "unknown" &&
    asset.license_status !== "needs_review" &&
    cloudReady
  );
}

function groundedAssetRef(asset: MyWayAssetRecord): VisualGroundedAssetRef {
  return {
    asset_id: asset.asset_id,
    public_path: asset.public_path,
    canonical_label: asset.canonical_label,
    display_name: asset.display_name,
    source_type: asset.source_type,
    scene_review_status: asset.scene_review_status ?? "pending",
    semantic_review_status: asset.semantic_review_status ?? "pending",
    dimensions_m: asset.dimensions_m,
    default_scale: asset.default_scale,
    default_rotation: asset.default_rotation,
    ground_offset_m: asset.ground_offset_m,
    collection_membership: asset.collection_membership ?? null,
  };
}

function emptyDiagnostics(): VisualAssetGroundingResult["diagnostics"] {
  return {
    bodyparts_catalog_concept_count: 0,
    bodyparts_exact_candidate_count: 0,
    equivalent_variant_family: false,
    presentation_choice_only: false,
    presentation_choice_reason: null,
    general_identity_match_kind: null,
    general_identity_candidate_count: 0,
    general_execution_eligible_count: 0,
    reviewed_resolver_ok: false,
    reviewed_resolver_failure_reason: null,
    lexical_fallback_used: false,
    lexical_candidates: [],
  };
}

/**
 * Historical V1 diagnostic contract. Runtime grounding no longer calls
 * resolveReviewedAsset or runLexicalAssetSearchBench. Keeping this request
 * compiler makes the old convergence verifier readable and preserves a direct
 * comparison point with the V1 policy.
 */
export function reviewedRequestForVisualAssetIntent(
  request: VisualAssetIntentGroundingRequest,
): AssetResolveRequest {
  return {
    concept: request.intent.concept,
    appearance_ranking: false,
    acquisition_policy: "never",
    require_scene_approved: true,
    require_semantic_verified: true,
    require_license_eligible: true,
    require_cloud_ready: true,
    minimum_match_score: 48,
    minimum_match_margin: 6,
    candidate_limit: 8,
    record_reuse: false,
    debug_write: false,
  };
}

let bodyPartsCatalogPromise: Promise<BodyParts3dFullCatalogV1 | null> | null = null;
function cachedBodyPartsCatalog() {
  bodyPartsCatalogPromise ??= readBodyParts3dFullCatalog();
  return bodyPartsCatalogPromise;
}

function bodyPartsCatalogElementIds(
  catalog: BodyParts3dFullCatalogV1 | null,
  concept: string,
) {
  if (!catalog) return [] as string[];
  const wanted = normalize(concept);
  const ids = new Set<string>();
  for (const record of catalog.concepts) {
    if (normalize(record.name) !== wanted) continue;
    for (const elementId of record.element_ids) ids.add(elementId.toUpperCase());
  }
  return [...ids];
}

export function bodyPartsPresentationIdentity(value: string) {
  return normalize(value)
    .replace(/^(?:left|right)\s+/, "")
    .trim();
}

function bodyPartsPresentationIdentityNames(asset: MyWayAssetRecord) {
  return [
    asset.collection_membership?.concept_name ?? "",
    asset.verified_canonical_label ?? "",
    ...(asset.verified_aliases ?? []),
    asset.canonical_label,
    asset.display_name,
    ...asset.aliases,
  ]
    .map(bodyPartsPresentationIdentity)
    .filter(Boolean);
}

function bodyPartsCandidates(
  assets: MyWayAssetRecord[],
  catalog: BodyParts3dFullCatalogV1 | null,
  request: VisualAssetIntentGroundingRequest,
  mode: AssetSearchBenchCollectionMode,
) {
  const wanted = normalize(request.intent.concept);
  const presentationWanted = bodyPartsPresentationIdentity(request.intent.concept);
  const collectionId = collectionIdForMode(mode);
  const collection = assets.filter((asset) =>
    asset.collection_membership?.collection_id === collectionId && usableSandboxRecord(asset)
  );
  const catalogElementIds = mode === "bodyparts3d_full_atlas"
    ? new Set(bodyPartsCatalogElementIds(catalog, request.intent.concept))
    : new Set<string>();

  // Direct identity is execution authority. Ontology/catalog membership is
  // diagnostics-only here because a broad concept such as "pelvis" can have
  // many related descendants that are not interchangeable presentation assets.
  const exact = collection.filter((asset) =>
    lateralityMatches(asset, request.intent.laterality ?? "unspecified") &&
    exactRegisteredIdentityNames(asset).includes(wanted)
  );
  const identityFamily = collection.filter((asset) =>
    lateralityMatches(asset, request.intent.laterality ?? "unspecified") &&
    bodyPartsPresentationIdentityNames(asset).includes(presentationWanted)
  );

  const merged = new Map<string, MyWayAssetRecord>();
  for (const asset of [...exact, ...identityFamily]) merged.set(asset.asset_id, asset);
  return {
    catalog_concept_count: catalogElementIds.size,
    exact_count: exact.length,
    candidates: [...merged.values()].sort((a, b) => a.asset_id.localeCompare(b.asset_id)),
  };
}

function equivalentLateralityVariantFamily(candidates: MyWayAssetRecord[]) {
  if (candidates.length < 2) return false;
  const lateralities = new Set(candidates.map(detectedLaterality));
  return (
    [...lateralities].every((value) => value === "left" || value === "right") &&
    lateralities.has("left") &&
    lateralities.has("right")
  );
}

function bodyPartsDecision(
  request: VisualAssetIntentGroundingRequest,
  evidence: ReturnType<typeof bodyPartsCandidates>,
): VisualAssetGroundingResult | null {
  const candidates = evidence.candidates;
  if (!candidates.length) return null;
  const diagnostics = {
    ...emptyDiagnostics(),
    bodyparts_catalog_concept_count: evidence.catalog_concept_count,
    bodyparts_exact_candidate_count: evidence.exact_count,
  };

  if (candidates.length === 1) {
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      intent: request.intent,
      status: "resolved",
      method: evidence.catalog_concept_count > 0 ? "collection_concept_family" : "collection_exact",
      confidence: "high",
      escalation_required: false,
      resolved_asset: groundedAssetRef(candidates[0]!),
      candidates: candidates.map(groundedAssetRef),
      appearance_request: request.appearance_request,
      diagnostics,
    };
  }

  const variantFamily =
    (request.intent.laterality ?? "unspecified") === "unspecified" &&
    equivalentLateralityVariantFamily(candidates);
  if (variantFamily) {
    const presentationAsset = candidates[0]!;
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      intent: request.intent,
      status: "resolved",
      method: "collection_concept_family",
      confidence: "high",
      escalation_required: false,
      resolved_asset: groundedAssetRef(presentationAsset),
      candidates: candidates.slice(0, 8).map(groundedAssetRef),
      appearance_request: request.appearance_request,
      diagnostics: {
        ...diagnostics,
        equivalent_variant_family: true,
        presentation_choice_only: true,
        presentation_choice_reason:
          "Semantic laterality remains unspecified; MyWay selected the first stable asset-id variant only as a deterministic presentation representative.",
      },
    };
  }

  return {
    schema_version: VISUAL_ASSET_GROUNDING_VERSION,
    intent: request.intent,
    status: "ambiguous",
    method: evidence.catalog_concept_count > 0 ? "collection_concept_family" : "collection_exact",
    confidence: "medium",
    escalation_required: true,
    resolved_asset: null,
    candidates: candidates.slice(0, 8).map(groundedAssetRef),
    appearance_request: request.appearance_request,
    diagnostics,
  };
}

function generalIdentityCandidates(
  assets: MyWayAssetRecord[],
  request: VisualAssetIntentGroundingRequest,
) {
  const wanted = normalize(request.intent.concept);
  const available = assets.filter(usableSandboxRecord);
  const trustedExact = available.filter((asset) =>
    trustedExactIdentityNames(asset).includes(wanted)
  );
  if (trustedExact.length) {
    return { kind: "trusted_exact" as const, candidates: trustedExact };
  }
  const registeredExact = available.filter((asset) =>
    exactRegisteredIdentityNames(asset).includes(wanted)
  );
  if (registeredExact.length) {
    return { kind: "registered_exact" as const, candidates: registeredExact };
  }
  const phrase = available.filter((asset) => assetMatchesSemanticPhrase(asset, request.intent.concept));
  return { kind: phrase.length ? "semantic_phrase" as const : null, candidates: phrase };
}

function generalIdentityDecision(
  request: VisualAssetIntentGroundingRequest,
  match: ReturnType<typeof generalIdentityCandidates>,
): VisualAssetGroundingResult {
  const candidates = match.candidates
    .sort((a, b) => a.asset_id.localeCompare(b.asset_id))
    .slice(0, 8);
  const eligible = candidates.filter(executionEligibleGeneralAsset);
  const diagnostics = {
    ...emptyDiagnostics(),
    general_identity_match_kind: match.kind,
    general_identity_candidate_count: match.candidates.length,
    general_execution_eligible_count: eligible.length,
  };

  if (match.kind === "trusted_exact" && eligible.length === 1) {
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      intent: request.intent,
      status: "resolved",
      method: "general_identity_exact",
      confidence: "high",
      escalation_required: false,
      resolved_asset: groundedAssetRef(eligible[0]!),
      candidates: candidates.map(groundedAssetRef),
      appearance_request: request.appearance_request,
      diagnostics,
    };
  }

  if (match.kind === "trusted_exact" && eligible.length > 1) {
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      intent: request.intent,
      status: "ambiguous",
      method: "general_identity_exact",
      confidence: "high",
      escalation_required: true,
      resolved_asset: null,
      candidates: eligible.map(groundedAssetRef),
      appearance_request: request.appearance_request,
      diagnostics,
    };
  }

  if (candidates.length > 0) {
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      intent: request.intent,
      status: "candidate_below_threshold",
      method: "general_identity_candidate",
      confidence: match.kind === "registered_exact" ? "medium" : "low",
      escalation_required: true,
      resolved_asset: null,
      candidates: candidates.map(groundedAssetRef),
      appearance_request: request.appearance_request,
      diagnostics,
    };
  }

  return {
    schema_version: VISUAL_ASSET_GROUNDING_VERSION,
    intent: request.intent,
    status: "missing",
    method: "none",
    confidence: "low",
    escalation_required: true,
    resolved_asset: null,
    candidates: [],
    appearance_request: request.appearance_request,
    diagnostics,
  };
}

export async function groundVisualAssetIntents(
  requests: VisualAssetIntentGroundingRequest[],
  assetCollectionMode: AssetSearchBenchCollectionMode,
): Promise<{
  schema_version: typeof VISUAL_ASSET_GROUNDING_VERSION;
  results: VisualAssetGroundingResult[];
  metrics: {
    total_grounding_duration_ms: number;
    registry_snapshot_duration_ms: number;
    bodyparts_catalog_duration_ms: number;
    identity_decision_duration_ms: number;
    lexical_fallback_duration_ms: number | null;
    lexical_fallback_query_count: number;
  };
  authority_note: string;
}> {
  const startedAt = performance.now();
  if (!requests.length) {
    return {
      schema_version: VISUAL_ASSET_GROUNDING_VERSION,
      results: [],
      metrics: {
        total_grounding_duration_ms: 0,
        registry_snapshot_duration_ms: 0,
        bodyparts_catalog_duration_ms: 0,
        identity_decision_duration_ms: 0,
        lexical_fallback_duration_ms: null,
        lexical_fallback_query_count: 0,
      },
      authority_note: "No asset intents were present, so no grounding was attempted.",
    };
  }

  const snapshotStartedAt = performance.now();
  const registryPromise = getAssetBrowserRegistrySnapshot("visual_asset_grounding_v2");
  const catalogStartedAt = performance.now();
  const catalogPromise = assetCollectionMode === "bodyparts3d_full_atlas"
    ? cachedBodyPartsCatalog()
    : Promise.resolve(null);
  const [registrySnapshot, catalog] = await Promise.all([registryPromise, catalogPromise]);
  const registrySnapshotDurationMs = Number((performance.now() - snapshotStartedAt).toFixed(2));
  const bodyPartsCatalogDurationMs = Number((performance.now() - catalogStartedAt).toFixed(2));

  const decisionStartedAt = performance.now();
  const results = requests.map((request) => {
    const anatomy = bodyPartsDecision(
      request,
      bodyPartsCandidates(registrySnapshot.assets, catalog, request, assetCollectionMode),
    );
    if (anatomy) return anatomy;
    return generalIdentityDecision(
      request,
      generalIdentityCandidates(registrySnapshot.assets, request),
    );
  });
  const identityDecisionDurationMs = Number((performance.now() - decisionStartedAt).toFixed(2));

  return {
    schema_version: VISUAL_ASSET_GROUNDING_VERSION,
    results,
    metrics: {
      total_grounding_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      registry_snapshot_duration_ms: registrySnapshotDurationMs,
      bodyparts_catalog_duration_ms: bodyPartsCatalogDurationMs,
      identity_decision_duration_ms: identityDecisionDurationMs,
      lexical_fallback_duration_ms: null,
      lexical_fallback_query_count: 0,
    },
    authority_note:
      "Asset Grounding V2 uses one cached Asset Library registry snapshot. BodyParts3D exact source concepts resolve through the atlas catalog and may choose a deterministic presentation representative without changing unspecified semantic laterality. General assets use cheap in-memory identity evidence and distinguish resolved, ambiguous, candidate_below_threshold, and missing. The reviewed resolver, BodyParts3D BM25, vectors, RRF, reranker, and geometry remain escalation tools and do not run on this normal path.",
  };
}
