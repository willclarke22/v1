import type { MyWayAssetRecord } from "../asset-types";
import type { AssetSearchDocumentV1 } from "./asset-search-document";
import type { AssetSearchDocumentV2 } from "./asset-search-document-v2";
import type { SearchQueryPacketV2 } from "./asset-search-query-v2";

export const ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION =
  "myway_asset_semantic_evidence_v1" as const;

export type AssetSemanticEvidenceClassV1 =
  | "source_asserted"
  | "measured"
  | "reviewed"
  | "model_inferred";

export type AssetSemanticEvidenceFactV1 = {
  id: string;
  subject_asset_id: string;
  statement: string;
  predicate: string;
  object_label: string | null;
  object_asset_id: string | null;
  evidence_class: AssetSemanticEvidenceClassV1;
  source: string;
  graph_distance: number | null;
  confidence: number;
  measurement: Record<string, number | string | boolean | null> | null;
};

export type AssetCollectionGeometryEvidenceV1 = {
  collection_id: string;
  runtime_collection_space: string;
  world_bounds: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
    center: [number, number, number];
  };
  runtime_transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  source: "collection_runtime_transform+measured_local_bounds";
};

export type AssetSemanticEvidenceRecordV1 = {
  schema_version: typeof ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION;
  asset_id: string;
  canonical_identity: string;
  system: string | null;
  laterality: AssetSearchDocumentV1["laterality"];
  source_asserted: AssetSemanticEvidenceFactV1[];
  measured: AssetSemanticEvidenceFactV1[];
  reviewed: AssetSemanticEvidenceFactV1[];
  model_inferred: AssetSemanticEvidenceFactV1[];
  collection_geometry: AssetCollectionGeometryEvidenceV1 | null;
  excluded_unreviewed_role_metadata: string[];
};

export type AssetAnchorResolutionV1 = {
  anchor: string;
  role: string;
  matched_asset_ids: string[];
  matched_labels: string[];
};

export type AssetContextualSpatialEvidenceV1 = {
  anchor_distances: Array<{
    anchor: string;
    anchor_asset_id: string;
    anchor_label: string;
    bounds_gap_m: number;
    centroid_distance_m: number;
    same_asset: boolean;
  }>;
  anchor_pair_geometry: Array<{
    anchor_a: string;
    anchor_a_asset_id: string;
    anchor_b: string;
    anchor_b_asset_id: string;
    anchor_span_m: number;
    projection_t: number;
    projection_inside_segment: boolean;
    perpendicular_distance_m: number;
    normalized_perpendicular_distance: number;
    interior_fraction: number;
  }>;
};

export type AssetAnchorMatchStrategyV2 =
  | "canonical_exact"
  | "alias_exact"
  | "concept_exact"
  | "canonical_phrase"
  | "alias_phrase"
  | "concept_phrase";

export type AssetAnchorResolutionMatchV2 = {
  asset_id: string;
  canonical_identity: string;
  laterality: AssetSearchDocumentV1["laterality"];
  match_strategy: AssetAnchorMatchStrategyV2;
  match_score: number;
  geometry_available: boolean;
};

export type AssetAnchorResolutionV2 = {
  anchor: string;
  role: string;
  resolution_scope: "full_collection_reference";
  matched_asset_ids: string[];
  matched_labels: string[];
  matches: AssetAnchorResolutionMatchV2[];
};

export type AssetContextualSpatialEvidenceV2 = {
  anchor_distances: Array<{
    anchor: string;
    anchor_asset_id: string;
    anchor_label: string;
    anchor_match_strategy: AssetAnchorMatchStrategyV2;
    anchor_match_score: number;
    resolution_scope: "full_collection_reference";
    bounds_gap_m: number;
    centroid_distance_m: number;
    same_asset: boolean;
  }>;
  anchor_pair_geometry: Array<{
    anchor_a: string;
    anchor_a_asset_id: string;
    anchor_a_label: string;
    anchor_b: string;
    anchor_b_asset_id: string;
    anchor_b_label: string;
    anchor_span_m: number;
    projection_t: number;
    projection_inside_segment: boolean;
    perpendicular_distance_m: number;
    normalized_perpendicular_distance: number;
    interior_fraction: number;
    candidate_gap_to_anchor_a_m: number;
    candidate_gap_to_anchor_b_m: number;
    candidate_is_anchor_a: boolean;
    candidate_is_anchor_b: boolean;
  }>;
  endpoint_anchor_matches: string[];
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase();
}

function unique(values: string[], limit = 64) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = clean(raw);
    const key = normalized(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function stableEvidenceId(input: {
  asset_id: string;
  source: string;
  statement: string;
  evidence_class: AssetSemanticEvidenceClassV1;
}) {
  const text = `${input.asset_id}|${input.evidence_class}|${input.source}|${input.statement}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `evidence_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourcePredicate(statement: string) {
  const value = normalized(statement);
  if (/\bpart of\b/.test(value)) return "part_of";
  if (/\bis an?\b/.test(value)) return "is_a";
  return "source_relation";
}

function objectFromSourceStatement(statement: string, predicate: string) {
  if (predicate === "part_of") {
    const split = statement.split(/\bpart of\b/i);
    return clean(split.slice(1).join(" part of ")) || null;
  }
  if (predicate === "is_a") {
    const split = statement.split(/\bis an?\b/i);
    return clean(split.slice(1).join(" is a ")) || null;
  }
  return null;
}

function fact(input: Omit<AssetSemanticEvidenceFactV1, "id">) {
  return {
    ...input,
    id: stableEvidenceId({
      asset_id: input.subject_asset_id,
      source: input.source,
      statement: input.statement,
      evidence_class: input.evidence_class,
    }),
  };
}

function vec3(values: readonly number[] | undefined | null, fallback: [number, number, number]) {
  if (!values || values.length < 3) return fallback;
  const result = values.slice(0, 3).map((value, index) =>
    Number.isFinite(value) ? Number(value) : fallback[index]!,
  );
  return result as [number, number, number];
}

function rotateX(point: [number, number, number], angle: number) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c] as [number, number, number];
}

function rotateY(point: [number, number, number], angle: number) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c] as [number, number, number];
}

function rotateZ(point: [number, number, number], angle: number) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z] as [number, number, number];
}

function transformPoint(
  point: [number, number, number],
  input: AssetCollectionGeometryEvidenceV1["runtime_transform"],
) {
  const scaled: [number, number, number] = [
    point[0] * input.scale[0],
    point[1] * input.scale[1],
    point[2] * input.scale[2],
  ];
  // Collection transforms are consumed as Three.js-style XYZ Euler radians by the runtime.
  const rotated = rotateZ(rotateY(rotateX(scaled, input.rotation[0]), input.rotation[1]), input.rotation[2]);
  return [
    rotated[0] + input.position[0],
    rotated[1] + input.position[1],
    rotated[2] + input.position[2],
  ] as [number, number, number];
}

function corners(min: [number, number, number], max: [number, number, number]) {
  return [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ] as Array<[number, number, number]>;
}

export function collectionGeometryEvidenceForAssetV1(
  asset: MyWayAssetRecord,
): AssetCollectionGeometryEvidenceV1 | null {
  const membership = asset.collection_membership;
  if (!membership?.collection_id || !membership.runtime_collection_space) return null;

  const localBounds = asset.geometry_profile?.local_bounds;
  const fallbackSize = vec3(asset.dimensions_m, [0, 0, 0]);
  const localMin = localBounds
    ? vec3(localBounds.min, [0, 0, 0])
    : ([-fallbackSize[0] / 2, 0, -fallbackSize[2] / 2] as [number, number, number]);
  const localMax = localBounds
    ? vec3(localBounds.max, [0, 0, 0])
    : ([fallbackSize[0] / 2, fallbackSize[1], fallbackSize[2] / 2] as [number, number, number]);

  const runtimeTransform = {
    position: vec3(membership.runtime_transform.position, [0, 0, 0]),
    rotation: vec3(membership.runtime_transform.rotation, [0, 0, 0]),
    scale: vec3(membership.runtime_transform.scale, [1, 1, 1]),
  };
  const transformed = corners(localMin, localMax).map((point) =>
    transformPoint(point, runtimeTransform),
  );
  const min: [number, number, number] = [
    Math.min(...transformed.map((point) => point[0])),
    Math.min(...transformed.map((point) => point[1])),
    Math.min(...transformed.map((point) => point[2])),
  ];
  const max: [number, number, number] = [
    Math.max(...transformed.map((point) => point[0])),
    Math.max(...transformed.map((point) => point[1])),
    Math.max(...transformed.map((point) => point[2])),
  ];
  const size: [number, number, number] = [
    Math.max(0, max[0] - min[0]),
    Math.max(0, max[1] - min[1]),
    Math.max(0, max[2] - min[2]),
  ];
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  return {
    collection_id: membership.collection_id,
    runtime_collection_space: membership.runtime_collection_space,
    world_bounds: { min, max, size, center },
    runtime_transform: runtimeTransform,
    source: "collection_runtime_transform+measured_local_bounds",
  };
}

export function buildAssetSemanticEvidenceRecordV1(input: {
  document: AssetSearchDocumentV2;
  source_document: AssetSearchDocumentV1;
  asset: MyWayAssetRecord;
}): AssetSemanticEvidenceRecordV1 {
  const { document, source_document: sourceDocument, asset } = input;
  const sourceAsserted: AssetSemanticEvidenceFactV1[] = [];
  const reviewed: AssetSemanticEvidenceFactV1[] = [];

  sourceAsserted.push(
    fact({
      subject_asset_id: document.asset_id,
      statement: `Canonical identity: ${document.canonical_identity}`,
      predicate: "identity",
      object_label: document.canonical_identity,
      object_asset_id: null,
      evidence_class: "source_asserted",
      source: "search_document_identity",
      graph_distance: null,
      confidence: 1,
      measurement: null,
    }),
  );

  for (const concept of unique(sourceDocument.concept_names, 24)) {
    sourceAsserted.push(
      fact({
        subject_asset_id: document.asset_id,
        statement: `Named concept: ${concept}`,
        predicate: "named_concept",
        object_label: concept,
        object_asset_id: null,
        evidence_class: "source_asserted",
        source: "search_document_named_concept",
        graph_distance: null,
        confidence: 1,
        measurement: null,
      }),
    );
  }

  for (const evidence of document.relationship.provenance) {
    if (!evidence.hard_truth) continue;
    const predicate = sourcePredicate(evidence.statement);
    sourceAsserted.push(
      fact({
        subject_asset_id: document.asset_id,
        statement: evidence.statement,
        predicate,
        object_label: objectFromSourceStatement(evidence.statement, predicate),
        object_asset_id: null,
        evidence_class: "source_asserted",
        source: evidence.source,
        graph_distance: evidence.graph_distance,
        confidence:
          evidence.graph_distance === 0
            ? 1
            : evidence.graph_distance === 1
              ? 0.86
              : 0.72,
        measurement: null,
      }),
    );
  }

  const roleStatements = unique([
    ...document.role.affordances.map((value) => `Affordance: ${value}`),
    ...document.role.contains.map((value) => `Contains: ${value}`),
  ], 24);
  const roleIsReviewed = document.execution.semantic_review_status === "verified";
  if (roleIsReviewed) {
    for (const statement of roleStatements) {
      reviewed.push(
        fact({
          subject_asset_id: document.asset_id,
          statement,
          predicate: statement.startsWith("Contains:") ? "contains" : "affordance",
          object_label: clean(statement.split(":").slice(1).join(":")) || null,
          object_asset_id: null,
          evidence_class: "reviewed",
          source: "verified_asset_metadata",
          graph_distance: null,
          confidence: 1,
          measurement: null,
        }),
      );
    }
  }

  const collectionGeometry = collectionGeometryEvidenceForAssetV1(asset);
  const measured: AssetSemanticEvidenceFactV1[] = collectionGeometry
    ? [
        fact({
          subject_asset_id: document.asset_id,
          statement: `Measured collection-space bounds available in ${collectionGeometry.runtime_collection_space}.`,
          predicate: "collection_space_geometry",
          object_label: collectionGeometry.collection_id,
          object_asset_id: null,
          evidence_class: "measured",
          source: collectionGeometry.source,
          graph_distance: null,
          confidence: 1,
          measurement: {
            width_m: Number(collectionGeometry.world_bounds.size[0].toFixed(6)),
            height_m: Number(collectionGeometry.world_bounds.size[1].toFixed(6)),
            depth_m: Number(collectionGeometry.world_bounds.size[2].toFixed(6)),
          },
        }),
      ]
    : [];

  return {
    schema_version: ASSET_SEMANTIC_EVIDENCE_SCHEMA_VERSION,
    asset_id: document.asset_id,
    canonical_identity: document.canonical_identity,
    system: document.system,
    laterality: document.laterality,
    source_asserted: sourceAsserted,
    measured,
    reviewed,
    model_inferred: [],
    collection_geometry: collectionGeometry,
    excluded_unreviewed_role_metadata: roleIsReviewed ? [] : roleStatements,
  };
}

function distance(left: [number, number, number], right: [number, number, number]) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function axisGap(aMin: number, aMax: number, bMin: number, bMax: number) {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
}

export function boundsGapMetersV1(
  left: AssetCollectionGeometryEvidenceV1,
  right: AssetCollectionGeometryEvidenceV1,
) {
  if (
    left.collection_id !== right.collection_id ||
    left.runtime_collection_space !== right.runtime_collection_space
  ) {
    return null;
  }
  const x = axisGap(left.world_bounds.min[0], left.world_bounds.max[0], right.world_bounds.min[0], right.world_bounds.max[0]);
  const y = axisGap(left.world_bounds.min[1], left.world_bounds.max[1], right.world_bounds.min[1], right.world_bounds.max[1]);
  const z = axisGap(left.world_bounds.min[2], left.world_bounds.max[2], right.world_bounds.min[2], right.world_bounds.max[2]);
  return Math.hypot(x, y, z);
}

function identityTerms(sourceDocument: AssetSearchDocumentV1) {
  return unique([
    sourceDocument.canonical_identity,
    sourceDocument.display_name,
    ...sourceDocument.concept_names,
    ...sourceDocument.aliases.filter((value) => /\s/.test(value)),
  ], 80).map(normalized);
}

function phraseMatch(term: string, anchor: string) {
  if (term === anchor) return true;
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(term);
}

export function resolveSemanticEvidenceAnchorsV1(input: {
  packet: SearchQueryPacketV2;
  source_documents: AssetSearchDocumentV1[];
}) {
  const resolutions: AssetAnchorResolutionV1[] = [];
  for (const anchor of input.packet.anchors) {
    const wanted = normalized(anchor.concept);
    if (!wanted) continue;
    const matched = input.source_documents.filter((document) =>
      identityTerms(document).some((term) => phraseMatch(term, wanted)),
    );
    resolutions.push({
      anchor: anchor.concept,
      role: anchor.role,
      matched_asset_ids: matched.slice(0, 12).map((document) => document.asset_id),
      matched_labels: matched.slice(0, 12).map((document) => document.canonical_identity),
    });
  }
  return resolutions;
}

function anchorIdentityMatchV2(
  document: AssetSearchDocumentV1,
  wanted: string,
): { strategy: AssetAnchorMatchStrategyV2; score: number } | null {
  const canonical = normalized(document.canonical_identity);
  const aliases = document.aliases.map(normalized);
  const concepts = document.concept_names.map(normalized);

  if (canonical === wanted) return { strategy: "canonical_exact", score: 1000 };
  if (aliases.includes(wanted)) return { strategy: "alias_exact", score: 960 };
  if (concepts.includes(wanted)) return { strategy: "concept_exact", score: 940 };
  if (phraseMatch(canonical, wanted)) return { strategy: "canonical_phrase", score: 820 };
  if (aliases.some((value) => phraseMatch(value, wanted))) {
    return { strategy: "alias_phrase", score: 790 };
  }
  if (concepts.some((value) => phraseMatch(value, wanted))) {
    return { strategy: "concept_phrase", score: 770 };
  }
  return null;
}

export function resolveSemanticEvidenceAnchorsV2(input: {
  packet: SearchQueryPacketV2;
  reference_source_documents: AssetSearchDocumentV1[];
  reference_geometry_by_id: Map<string, AssetCollectionGeometryEvidenceV1>;
}) {
  const resolutions: AssetAnchorResolutionV2[] = [];
  for (const anchor of input.packet.anchors) {
    const wanted = normalized(anchor.concept);
    if (!wanted) continue;
    const matches = input.reference_source_documents
      .flatMap((document) => {
        const match = anchorIdentityMatchV2(document, wanted);
        if (!match) return [];
        return [{
          asset_id: document.asset_id,
          canonical_identity: document.canonical_identity,
          laterality: document.laterality,
          match_strategy: match.strategy,
          match_score: match.score,
          geometry_available: input.reference_geometry_by_id.has(document.asset_id),
        } satisfies AssetAnchorResolutionMatchV2];
      })
      .sort((left, right) =>
        right.match_score - left.match_score ||
        Number(right.geometry_available) - Number(left.geometry_available) ||
        left.canonical_identity.localeCompare(right.canonical_identity) ||
        left.asset_id.localeCompare(right.asset_id),
      )
      .slice(0, 12);

    resolutions.push({
      anchor: anchor.concept,
      role: anchor.role,
      resolution_scope: "full_collection_reference",
      matched_asset_ids: matches.map((match) => match.asset_id),
      matched_labels: matches.map((match) => match.canonical_identity),
      matches,
    });
  }
  return resolutions;
}

function lateralityCompatible(
  candidate: AssetSearchDocumentV1["laterality"],
  anchor: AssetSearchDocumentV1["laterality"],
) {
  if (candidate === "left" || candidate === "right") {
    return anchor === candidate || anchor === "midline" || anchor === "unspecified" || anchor === "bilateral";
  }
  return true;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function projectionMetrics(
  point: [number, number, number],
  start: [number, number, number],
  end: [number, number, number],
) {
  const ab: [number, number, number] = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ];
  const ap: [number, number, number] = [
    point[0] - start[0],
    point[1] - start[1],
    point[2] - start[2],
  ];
  const spanSquared = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  if (spanSquared <= 1e-12) return null;
  const rawT = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / spanSquared;
  const closestT = Math.max(0, Math.min(1, rawT));
  const closest: [number, number, number] = [
    start[0] + ab[0] * closestT,
    start[1] + ab[1] * closestT,
    start[2] + ab[2] * closestT,
  ];
  const span = Math.sqrt(spanSquared);
  return {
    span,
    rawT,
    perpendicular: distance(point, closest),
    normalizedPerpendicular: distance(point, closest) / Math.max(1e-6, span),
    interiorFraction:
      rawT >= 0 && rawT <= 1
        ? clamp01(2 * Math.min(rawT, 1 - rawT))
        : 0,
  };
}

export function contextualSpatialEvidenceV1(input: {
  packet: SearchQueryPacketV2;
  candidate: AssetSemanticEvidenceRecordV1;
  source_document: AssetSearchDocumentV1;
  records_by_id: Map<string, AssetSemanticEvidenceRecordV1>;
  source_documents_by_id: Map<string, AssetSearchDocumentV1>;
  anchor_resolutions: AssetAnchorResolutionV1[];
}): AssetContextualSpatialEvidenceV1 {
  const candidateGeometry = input.candidate.collection_geometry;
  if (!candidateGeometry) {
    return { anchor_distances: [], anchor_pair_geometry: [] };
  }

  const chosen = input.anchor_resolutions.flatMap((resolution) => {
    const matches = resolution.matched_asset_ids
      .map((assetId) => ({
        record: input.records_by_id.get(assetId),
        source: input.source_documents_by_id.get(assetId),
      }))
      .filter(
        (item): item is { record: AssetSemanticEvidenceRecordV1; source: AssetSearchDocumentV1 } =>
          Boolean(item.record?.collection_geometry && item.source),
      )
      .filter((item) =>
        lateralityCompatible(input.source_document.laterality, item.source.laterality),
      );
    const usable = matches.length
      ? matches
      : resolution.matched_asset_ids
          .map((assetId) => ({
            record: input.records_by_id.get(assetId),
            source: input.source_documents_by_id.get(assetId),
          }))
          .filter(
            (item): item is { record: AssetSemanticEvidenceRecordV1; source: AssetSearchDocumentV1 } =>
              Boolean(item.record?.collection_geometry && item.source),
          );
    const sameCollection = usable.filter((item) => {
      const geometry = item.record.collection_geometry!;
      return (
        geometry.collection_id === candidateGeometry.collection_id &&
        geometry.runtime_collection_space === candidateGeometry.runtime_collection_space
      );
    });
    const ranked = sameCollection.sort((left, right) => {
      const leftGap = boundsGapMetersV1(candidateGeometry, left.record.collection_geometry!) ?? Number.POSITIVE_INFINITY;
      const rightGap = boundsGapMetersV1(candidateGeometry, right.record.collection_geometry!) ?? Number.POSITIVE_INFINITY;
      return leftGap - rightGap || left.source.asset_id.localeCompare(right.source.asset_id);
    });
    const selected = ranked[0];
    return selected
      ? [{ resolution, record: selected.record, source: selected.source }]
      : [];
  });

  const anchorDistances = chosen.map((item) => {
    const geometry = item.record.collection_geometry!;
    return {
      anchor: item.resolution.anchor,
      anchor_asset_id: item.record.asset_id,
      anchor_label: item.record.canonical_identity,
      bounds_gap_m: Number((boundsGapMetersV1(candidateGeometry, geometry) ?? 0).toFixed(6)),
      centroid_distance_m: Number(
        distance(candidateGeometry.world_bounds.center, geometry.world_bounds.center).toFixed(6),
      ),
      same_asset: item.record.asset_id === input.candidate.asset_id,
    };
  });

  const pairGeometry: AssetContextualSpatialEvidenceV1["anchor_pair_geometry"] = [];
  for (let leftIndex = 0; leftIndex < chosen.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < chosen.length; rightIndex += 1) {
      const left = chosen[leftIndex]!;
      const right = chosen[rightIndex]!;
      if (left.resolution.anchor === right.resolution.anchor) continue;
      if (left.record.asset_id === right.record.asset_id) continue;
      const metrics = projectionMetrics(
        candidateGeometry.world_bounds.center,
        left.record.collection_geometry!.world_bounds.center,
        right.record.collection_geometry!.world_bounds.center,
      );
      if (!metrics) continue;
      pairGeometry.push({
        anchor_a: left.resolution.anchor,
        anchor_a_asset_id: left.record.asset_id,
        anchor_b: right.resolution.anchor,
        anchor_b_asset_id: right.record.asset_id,
        anchor_span_m: Number(metrics.span.toFixed(6)),
        projection_t: Number(metrics.rawT.toFixed(6)),
        projection_inside_segment: metrics.rawT >= 0 && metrics.rawT <= 1,
        perpendicular_distance_m: Number(metrics.perpendicular.toFixed(6)),
        normalized_perpendicular_distance: Number(metrics.normalizedPerpendicular.toFixed(6)),
        interior_fraction: Number(metrics.interiorFraction.toFixed(6)),
      });
    }
  }

  return {
    anchor_distances: anchorDistances,
    anchor_pair_geometry: pairGeometry.slice(0, 8),
  };
}

export function contextualSpatialEvidenceV2(input: {
  candidate: AssetSemanticEvidenceRecordV1;
  source_document: AssetSearchDocumentV1;
  reference_source_documents_by_id: Map<string, AssetSearchDocumentV1>;
  reference_geometry_by_id: Map<string, AssetCollectionGeometryEvidenceV1>;
  anchor_resolutions: AssetAnchorResolutionV2[];
}): AssetContextualSpatialEvidenceV2 {
  const candidateGeometry = input.candidate.collection_geometry;
  if (!candidateGeometry) {
    return { anchor_distances: [], anchor_pair_geometry: [], endpoint_anchor_matches: [] };
  }

  const chosen = input.anchor_resolutions.flatMap((resolution) => {
    const available = resolution.matches
      .map((match) => ({
        match,
        source: input.reference_source_documents_by_id.get(match.asset_id),
        geometry: input.reference_geometry_by_id.get(match.asset_id),
      }))
      .filter(
        (item): item is {
          match: AssetAnchorResolutionMatchV2;
          source: AssetSearchDocumentV1;
          geometry: AssetCollectionGeometryEvidenceV1;
        } => Boolean(item.source && item.geometry),
      )
      .filter((item) =>
        item.geometry.collection_id === candidateGeometry.collection_id &&
        item.geometry.runtime_collection_space === candidateGeometry.runtime_collection_space,
      );

    const lateralityMatches = available.filter((item) =>
      lateralityCompatible(input.source_document.laterality, item.source.laterality),
    );
    const usable = lateralityMatches.length ? lateralityMatches : available;
    usable.sort((left, right) => {
      const scoreDelta = right.match.match_score - left.match.match_score;
      if (scoreDelta) return scoreDelta;
      const leftGap = boundsGapMetersV1(candidateGeometry, left.geometry) ?? Number.POSITIVE_INFINITY;
      const rightGap = boundsGapMetersV1(candidateGeometry, right.geometry) ?? Number.POSITIVE_INFINITY;
      return leftGap - rightGap || left.source.asset_id.localeCompare(right.source.asset_id);
    });
    const selected = usable[0];
    return selected ? [{ resolution, ...selected }] : [];
  });

  const anchorDistances: AssetContextualSpatialEvidenceV2["anchor_distances"] =
    chosen.map((item) => ({
      anchor: item.resolution.anchor,
      anchor_asset_id: item.match.asset_id,
      anchor_label: item.match.canonical_identity,
      anchor_match_strategy: item.match.match_strategy,
      anchor_match_score: item.match.match_score,
      resolution_scope: item.resolution.resolution_scope,
      bounds_gap_m: Number((boundsGapMetersV1(candidateGeometry, item.geometry) ?? 0).toFixed(6)),
      centroid_distance_m: Number(
        distance(candidateGeometry.world_bounds.center, item.geometry.world_bounds.center).toFixed(6),
      ),
      same_asset: item.match.asset_id === input.candidate.asset_id,
    }));

  const pairGeometry: AssetContextualSpatialEvidenceV2["anchor_pair_geometry"] = [];
  for (let leftIndex = 0; leftIndex < chosen.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < chosen.length; rightIndex += 1) {
      const left = chosen[leftIndex]!;
      const right = chosen[rightIndex]!;
      if (left.resolution.anchor === right.resolution.anchor) continue;
      if (left.match.asset_id === right.match.asset_id) continue;
      const metrics = projectionMetrics(
        candidateGeometry.world_bounds.center,
        left.geometry.world_bounds.center,
        right.geometry.world_bounds.center,
      );
      if (!metrics) continue;
      pairGeometry.push({
        anchor_a: left.resolution.anchor,
        anchor_a_asset_id: left.match.asset_id,
        anchor_a_label: left.match.canonical_identity,
        anchor_b: right.resolution.anchor,
        anchor_b_asset_id: right.match.asset_id,
        anchor_b_label: right.match.canonical_identity,
        anchor_span_m: Number(metrics.span.toFixed(6)),
        projection_t: Number(metrics.rawT.toFixed(6)),
        projection_inside_segment: metrics.rawT >= 0 && metrics.rawT <= 1,
        perpendicular_distance_m: Number(metrics.perpendicular.toFixed(6)),
        normalized_perpendicular_distance: Number(metrics.normalizedPerpendicular.toFixed(6)),
        interior_fraction: Number(metrics.interiorFraction.toFixed(6)),
        candidate_gap_to_anchor_a_m: Number(
          (boundsGapMetersV1(candidateGeometry, left.geometry) ?? 0).toFixed(6),
        ),
        candidate_gap_to_anchor_b_m: Number(
          (boundsGapMetersV1(candidateGeometry, right.geometry) ?? 0).toFixed(6),
        ),
        candidate_is_anchor_a: left.match.asset_id === input.candidate.asset_id,
        candidate_is_anchor_b: right.match.asset_id === input.candidate.asset_id,
      });
    }
  }

  return {
    anchor_distances: anchorDistances,
    anchor_pair_geometry: pairGeometry.slice(0, 8),
    endpoint_anchor_matches: anchorDistances
      .filter((item) => item.same_asset)
      .map((item) => item.anchor),
  };
}

