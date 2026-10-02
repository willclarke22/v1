import type { AssetSearchRequirementV1 } from "../../assets/search/asset-lexical-search";
import {
  compileSearchQueryPacketV2,
  type SearchQueryPacketV2,
} from "../../assets/search/asset-search-query-v2";
import type {
  VisualAssetIntent,
  VisualAssetIntentImportance,
  VisualAssetIntentLaterality,
  VisualAssetIntentRole,
} from "./contracts";

export type VisualAssetIntentGroundingRequest = {
  intent: VisualAssetIntent;
  lexical_requirement: AssetSearchRequirementV1;
  query_packet: SearchQueryPacketV2;
  appearance_request: VisualAssetIntent["appearance"] | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function role(value: unknown): VisualAssetIntentRole {
  return value === "context" || value === "supporting" || value === "environment" || value === "effect"
    ? value
    : "primary_subject";
}

function importance(value: unknown): VisualAssetIntentImportance {
  return value === "preferred" || value === "optional" ? value : "required";
}

function laterality(value: unknown): VisualAssetIntentLaterality {
  return value === "left" || value === "right" || value === "bilateral" ? value : "unspecified";
}

function appearance(value: unknown): VisualAssetIntent["appearance"] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const normalized = {
    ...(text(record.color) ? { color: text(record.color) } : {}),
    ...(text(record.material) ? { material: text(record.material) } : {}),
    ...(text(record.style) ? { style: text(record.style) } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizeVisualAssetIntents(value: unknown): VisualAssetIntent[] {
  const output = asRecord(value);
  if (!output) return [];
  if (Array.isArray(output.asset_intents)) {
    return output.asset_intents.flatMap((item) => {
      const record = asRecord(item);
      const concept = text(record?.concept);
      if (!record || !concept) return [];
      return [{
        concept,
        role: role(record.role),
        importance: importance(record.importance),
        quantity: Math.max(1, Math.min(12, Math.round(Number(record.quantity) || 1))),
        laterality: laterality(record.laterality),
        ...(appearance(record.appearance) ? { appearance: appearance(record.appearance) } : {}),
      }];
    });
  }

  // Legacy adapter: preserve old calibration fixtures without asking GLM to keep emitting them.
  if (!Array.isArray(output.required_visual_concepts)) return [];
  return output.required_visual_concepts.flatMap((item, index) => {
    const record = asRecord(item);
    const concept = text(record?.semantic_name);
    if (!record || !concept) return [];
    return [{
      concept,
      role: index === 0 ? "primary_subject" : "context",
      importance: "required",
      quantity: 1,
      laterality: "unspecified",
    } satisfies VisualAssetIntent];
  });
}

export function compileVisualAssetIntentGroundingRequests(
  value: unknown,
): VisualAssetIntentGroundingRequest[] {
  const output = asRecord(value);
  const intents = normalizeVisualAssetIntents(value);
  const relationships = Array.isArray(output?.relationships)
    ? output.relationships.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];

  return intents.map((intent, index) => {
    const normalizedConcept = intent.concept.toLowerCase();
    const relevantRelationships = relationships.filter((relationship) => {
      const source = text(relationship.source_concept ?? relationship.source_semantic_name).toLowerCase();
      const target = text(relationship.target_concept ?? relationship.target_semantic_name).toLowerCase();
      return source === normalizedConcept || target === normalizedConcept;
    });
    const anchors: Array<{ concept: string; role: string }> = [];
    const requestedRelationships: Array<{ type: string; from?: string; to?: string }> = [];
    const seenAnchors = new Set<string>();

    for (const relationship of relevantRelationships) {
      const source = text(relationship.source_concept ?? relationship.source_semantic_name);
      const target = text(relationship.target_concept ?? relationship.target_semantic_name);
      const relationshipType = text(relationship.relationship);
      if (!source || !target || !relationshipType) continue;
      const other = source.toLowerCase() === normalizedConcept ? target : source;
      const key = other.toLowerCase();
      if (!seenAnchors.has(key)) {
        seenAnchors.add(key);
        anchors.push({ concept: other, role: source.toLowerCase() === normalizedConcept ? "relationship_target" : "relationship_source" });
      }
      requestedRelationships.push({ type: relationshipType, from: source, to: target });
    }

    const queryPacket = compileSearchQueryPacketV2({
      requirement_id: `asset_intent_${index + 1}_${intent.concept}`,
      semantic_name: intent.concept,
      visual_role: intent.role,
      target_entity_kind: "visual_resource",
      laterality: {
        value: intent.laterality ?? "unspecified",
        required: intent.laterality !== undefined && intent.laterality !== "unspecified",
      },
      quantity: {
        minimum: intent.importance === "required" ? intent.quantity ?? 1 : 1,
        preferred: intent.quantity ?? 1,
      },
      visual_importance: intent.importance,
      ...(anchors.length ? { anchors } : {}),
      ...(requestedRelationships.length ? { requested_relationships: requestedRelationships } : {}),
    });

    return {
      intent,
      lexical_requirement: queryPacket.lexical_requirement,
      query_packet: queryPacket,
      appearance_request: intent.appearance ?? null,
    };
  });
}
