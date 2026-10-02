import { compileSearchQueryPacketV2 } from "../../assets/search/asset-search-query-v2";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, limit)
    : [];
}

export function compileVisualOrchestrationSearchPacketsV2Shadow(value: unknown) {
  const output = asRecord(value);
  if (!output || !Array.isArray(output.required_visual_concepts)) return [];

  const relationships = Array.isArray(output.relationships)
    ? output.relationships.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  return output.required_visual_concepts.flatMap((item) => {
    const concept = asRecord(item);
    const semanticName = text(concept?.semantic_name);
    if (!concept || !semanticName) return [];
    const visualRole = text(concept.role);
    const semanticTags = stringList(concept.semantic_tags);
    const normalizedName = semanticName.toLowerCase();
    const relevantRelationships = relationships.filter((relationship) => {
      const source = text(relationship.source_semantic_name).toLowerCase();
      const target = text(relationship.target_semantic_name).toLowerCase();
      return source === normalizedName || target === normalizedName;
    });
    const anchors: Array<{ concept: string; role: string }> = [];
    const seenAnchors = new Set<string>();
    const requestedRelationships = relevantRelationships.flatMap((relationship) => {
      const source = text(relationship.source_semantic_name);
      const target = text(relationship.target_semantic_name);
      const relationshipType = text(relationship.relationship);
      if (!source || !target || !relationshipType) return [];
      const other = source.toLowerCase() === normalizedName ? target : source;
      const key = other.toLowerCase();
      if (!seenAnchors.has(key)) {
        seenAnchors.add(key);
        anchors.push({
          concept: other,
          role: source.toLowerCase() === normalizedName
            ? "relationship_target"
            : "relationship_source",
        });
      }
      return [{
        type: relationshipType,
        from: source,
        to: target,
      }];
    });

    return [
      compileSearchQueryPacketV2({
        requirement_id: `stage_shadow_${semanticName}`,
        semantic_name: semanticName,
        visual_role: visualRole,
        semantic_tags: semanticTags,
        target_entity_kind: "anatomical_structure",
        ...(anchors.length ? { anchors } : {}),
        ...(requestedRelationships.length
          ? { requested_relationships: requestedRelationships }
          : {}),
      }),
    ];
  });
}
