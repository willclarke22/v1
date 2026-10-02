import type { AssetSearchRequirementV1 } from "./asset-lexical-search";

export const ASSET_SEARCH_QUERY_PACKET_V2_SCHEMA_VERSION =
  "myway_asset_search_query_packet_v2" as const;

export type SearchQueryAnchorV2 = {
  concept: string;
  role: string;
};

export type SearchQueryRelationshipV2 = {
  type: string;
  from?: string;
  to?: string;
  toward?: string;
};

export type SearchQueryPacketV2 = {
  schema_version: typeof ASSET_SEARCH_QUERY_PACKET_V2_SCHEMA_VERSION;
  requirement_id: string;
  semantic_concept: string;
  visual_role: string;
  target_entity_kind: string;
  target_material_or_class: string[];
  granularity: string;
  laterality: {
    value: string;
    required: boolean;
  };
  anchors: SearchQueryAnchorV2[];
  requested_relationships: SearchQueryRelationshipV2[];
  negative_role_hints: string[];
  quantity: {
    minimum: number;
    preferred: number;
  };
  visual_importance: string;
  lexical_requirement: AssetSearchRequirementV1;
  views: {
    identity_hint: string;
    full_intent: string;
    relationship_role: string;
  };
  constraints: {
    runtime_available_before_resolution: true;
    search_eligible_before_candidate_generation: true;
    laterality_required: boolean;
    target_material_or_class: string[];
    anchor_concepts: string[];
    endpoint_only_match_is_soft_negative: boolean;
  };
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stringList(value: unknown, limit = 16) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = clean(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function record(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "visual_requirement";
}

function anchorsFromRaw(
  raw: Record<string, unknown>,
  semanticTags: string[],
): SearchQueryAnchorV2[] {
  const explicit = Array.isArray(raw.anchors) ? raw.anchors : [];
  const anchors: SearchQueryAnchorV2[] = [];
  const seen = new Set<string>();
  for (const item of explicit) {
    const itemRecord = record(item);
    const concept = clean(itemRecord?.concept ?? item);
    if (!concept) continue;
    const key = concept.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({
      concept,
      role: clean(itemRecord?.role) || "context_anchor",
    });
  }
  if (!anchors.length) {
    for (const tag of semanticTags.slice(0, 6)) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push({ concept: tag, role: "context_anchor" });
    }
  }
  return anchors;
}

function relationshipsFromRaw(raw: Record<string, unknown>) {
  const values = Array.isArray(raw.requested_relationships)
    ? raw.requested_relationships
    : [];
  const relationships: SearchQueryRelationshipV2[] = [];
  for (const value of values.slice(0, 12)) {
    const item = record(value);
    if (!item) continue;
    const type = clean(item.type);
    if (!type) continue;
    relationships.push({
      type,
      ...(clean(item.from) ? { from: clean(item.from) } : {}),
      ...(clean(item.to) ? { to: clean(item.to) } : {}),
      ...(clean(item.toward) ? { toward: clean(item.toward) } : {}),
    });
  }
  return relationships;
}

export function compileSearchQueryPacketV2(
  raw: Record<string, unknown>,
): SearchQueryPacketV2 {
  const semanticConcept =
    clean(raw.semantic_concept) ||
    clean(raw.semantic_name) ||
    "required visual concept";
  const visualRole = clean(raw.visual_role);
  const semanticTags = stringList(raw.semantic_tags, 12);
  const targetMaterialOrClass = stringList(raw.target_material_or_class, 8);
  const targetEntityKind = clean(raw.target_entity_kind) || "visual_resource";
  const granularity = clean(raw.granularity) || "unspecified";
  const rawLaterality = record(raw.laterality);
  const lateralityValue = clean(rawLaterality?.value ?? raw.laterality) || "unspecified";
  const lateralityRequired = rawLaterality?.required === true;
  const anchors = anchorsFromRaw(raw, semanticTags);
  const requestedRelationships = relationshipsFromRaw(raw);
  const explicitNegativeHints = stringList(raw.negative_role_hints, 8);
  const endpointSoftNegative = anchors.length >= 2 && visualRole.length > 0;
  const negativeRoleHints = explicitNegativeHints.length
    ? explicitNegativeHints
    : endpointSoftNegative
      ? [
          "A candidate that merely matches a named anchor or endpoint is insufficient if it does not fulfill the requested visual role.",
        ]
      : [];

  const identityParts = [
    semanticConcept,
    ...targetMaterialOrClass,
    ...semanticTags,
    lateralityValue !== "unspecified" ? lateralityValue : "",
  ].filter(Boolean);
  const anchorText = anchors.length
    ? anchors.map((anchor) => `${anchor.concept} (${anchor.role})`).join(", ")
    : "none specified";
  const relationshipText = requestedRelationships.length
    ? requestedRelationships
        .map((relationship) =>
          [
            relationship.type,
            relationship.from ? `from ${relationship.from}` : "",
            relationship.to ? `to ${relationship.to}` : "",
            relationship.toward ? `toward ${relationship.toward}` : "",
          ].filter(Boolean).join(" ")
        )
        .join("; ")
    : "none explicitly specified";

  const fullIntent = [
    `Find a ${targetEntityKind} matching this required visual concept: ${semanticConcept}.`,
    visualRole ? `Required teaching/visual role: ${visualRole}.` : "",
    targetMaterialOrClass.length
      ? `Target class or material: ${targetMaterialOrClass.join(", ")}.`
      : "",
    `Context anchors: ${anchorText}.`,
    requestedRelationships.length
      ? `Requested relationships: ${relationshipText}.`
      : "",
  ].filter(Boolean).join("\n");

  const relationshipRole = [
    visualRole
      ? `The target candidate must fulfill this role: ${visualRole}.`
      : `The target candidate must fulfill the requested concept: ${semanticConcept}.`,
    `Use these concepts as context anchors rather than automatically selecting them: ${anchorText}.`,
    requestedRelationships.length
      ? `Relationship constraints: ${relationshipText}.`
      : "",
    endpointSoftNegative
      ? "Prefer the resource that realizes the requested relationship or role; an anchor or endpoint match alone is only weak evidence."
      : "",
    negativeRoleHints.length
      ? `Negative role hints: ${negativeRoleHints.join("; ")}.`
      : "",
  ].filter(Boolean).join("\n");

  return {
    schema_version: ASSET_SEARCH_QUERY_PACKET_V2_SCHEMA_VERSION,
    requirement_id: clean(raw.requirement_id) || slug(semanticConcept),
    semantic_concept: semanticConcept,
    visual_role: visualRole,
    target_entity_kind: targetEntityKind,
    target_material_or_class: targetMaterialOrClass,
    granularity,
    laterality: {
      value: lateralityValue,
      required: lateralityRequired,
    },
    anchors,
    requested_relationships: requestedRelationships,
    negative_role_hints: negativeRoleHints,
    quantity: {
      minimum: Math.max(1, Number(record(raw.quantity)?.minimum) || 1),
      preferred: Math.max(1, Number(record(raw.quantity)?.preferred) || 1),
    },
    visual_importance: clean(raw.visual_importance) || "primary",
    lexical_requirement: {
      semantic_name: semanticConcept,
      ...(visualRole ? { visual_role: visualRole } : {}),
      ...(semanticTags.length ? { semantic_tags: semanticTags } : {}),
    },
    views: {
      identity_hint: identityParts.join(" "),
      full_intent: fullIntent,
      relationship_role: relationshipRole,
    },
    constraints: {
      runtime_available_before_resolution: true,
      search_eligible_before_candidate_generation: true,
      laterality_required: lateralityRequired,
      target_material_or_class: targetMaterialOrClass,
      anchor_concepts: anchors.map((anchor) => anchor.concept),
      endpoint_only_match_is_soft_negative: endpointSoftNegative,
    },
  };
}
