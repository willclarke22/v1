export type PrimitiveBuilderVec3 = [number, number, number];

export const PRIMITIVE_BUILDER_FALLBACK_KINDS = [
  "box",
  "softBox",
  "cylinder",
  "sphere",
  "group",
  "none",
] as const;

export const PRIMITIVE_BUILDER_PLACEMENT_RELATIONS = [
  "absolute",
  "on_ground",
  "on_surface",
  "beside",
  "inside",
  "attached_to",
] as const;

export type PrimitiveBuilderFallbackKind =
  (typeof PRIMITIVE_BUILDER_FALLBACK_KINDS)[number];

export type PrimitiveBuilderPlacementRelation =
  (typeof PRIMITIVE_BUILDER_PLACEMENT_RELATIONS)[number];

export type PrimitiveBuilderAssetRequirement = {
  instance_id: string;
  concept: string;
  aliases: string[];
  semantic_tags: string[];
  style_tags: string[];
  motion_role: string;
  must_be_separate: boolean;
  reusable: boolean;
  required: boolean;
  target_extent_m: number;
  fallback_primitive: PrimitiveBuilderFallbackKind;
  fallback_node_id?: string;
  parent_id?: string;

  // Explicit replacement ownership prevents primitive fragments from leaking
  // into a scene after the GLB replaces its fallback.
  replacement_node_ids: string[];

  // Relationship-aware placement is resolved after actual GLB bounds load.
  placement_relation: PrimitiveBuilderPlacementRelation;
  placement_target_instance_id?: string;
  placement_anchor: string;
  placement_offset: PrimitiveBuilderVec3;
  clearance_m: number;

  position: PrimitiveBuilderVec3;
  rotation: PrimitiveBuilderVec3;
  scale: PrimitiveBuilderVec3;
};

export type PrimitiveBuilderAssetRequirementPlan = {
  schema_version: "primitive_builder_asset_requirements_v3";
  scene_request: string;
  requirements: PrimitiveBuilderAssetRequirement[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown) {
  return Array.from(
    new Set(
      list(value)
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function id(value: unknown, fallback: string) {
  const source =
    typeof value === "string" && value.trim()
      ? value.trim()
      : fallback;

  return (
    source
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function vec3(
  value: unknown,
  fallback: PrimitiveBuilderVec3,
): PrimitiveBuilderVec3 {
  const source = list(value);
  if (source.length < 3) return fallback;

  return [
    number(source[0], fallback[0]),
    number(source[1], fallback[1]),
    number(source[2], fallback[2]),
  ];
}

function positiveVec3(
  value: unknown,
  fallback: PrimitiveBuilderVec3,
): PrimitiveBuilderVec3 {
  return vec3(value, fallback).map((entry, index) =>
    Math.max(0.02, Math.min(24, Math.abs(entry || fallback[index] || 1))),
  ) as PrimitiveBuilderVec3;
}

export function normalizePrimitiveBuilderAssetRequirements(
  raw: unknown,
  knownNodeIds: Set<string>,
  warnings: string[],
) {
  const seen = new Set<string>();

  const requirements = list(raw)
    .map((value, index): PrimitiveBuilderAssetRequirement | null => {
      const item = record(value);
      if (!item) return null;

      let instanceId = id(
        item.instance_id ?? item.id,
        `asset_requirement_${index + 1}`,
      );

      if (seen.has(instanceId)) {
        const base = instanceId;
        let suffix = 2;
        while (seen.has(`${base}_${suffix}`)) suffix += 1;
        instanceId = `${base}_${suffix}`;
        warnings.push(
          `Duplicate asset requirement id ${base} renamed to ${instanceId}.`,
        );
      }
      seen.add(instanceId);

      const concept = text(item.concept, "");
      if (!concept) {
        warnings.push(
          `Asset requirement ${instanceId} had no concept and was removed.`,
        );
        return null;
      }

      const rawFallback = item.fallback_primitive;
      const fallbackPrimitive =
        typeof rawFallback === "string" &&
        (PRIMITIVE_BUILDER_FALLBACK_KINDS as readonly string[]).includes(
          rawFallback,
        )
          ? (rawFallback as PrimitiveBuilderFallbackKind)
          : "softBox";

      const fallbackNodeId =
        typeof item.fallback_node_id === "string"
          ? id(item.fallback_node_id, "")
          : undefined;
      const validFallbackNodeId =
        fallbackNodeId && knownNodeIds.has(fallbackNodeId)
          ? fallbackNodeId
          : undefined;

      if (fallbackNodeId && !validFallbackNodeId) {
        warnings.push(
          `Asset requirement ${instanceId} referenced missing fallback node ${fallbackNodeId}.`,
        );
      }

      const parentId =
        typeof item.parent_id === "string"
          ? id(item.parent_id, "")
          : undefined;
      const validParentId =
        parentId && knownNodeIds.has(parentId)
          ? parentId
          : undefined;

      if (parentId && !validParentId) {
        warnings.push(
          `Asset requirement ${instanceId} referenced missing parent ${parentId}; parent cleared.`,
        );
      }

      const rawRelation = item.placement_relation;
      const placementRelation =
        typeof rawRelation === "string" &&
        (
          PRIMITIVE_BUILDER_PLACEMENT_RELATIONS as readonly string[]
        ).includes(rawRelation)
          ? (rawRelation as PrimitiveBuilderPlacementRelation)
          : "absolute";

      const replacementNodeIds = Array.from(
        new Set([
          ...strings(item.replacement_node_ids)
            .map((value) => id(value, ""))
            .filter(
              (value) =>
                value && knownNodeIds.has(value),
            ),
          ...(validFallbackNodeId
            ? [validFallbackNodeId]
            : []),
        ]),
      );

      return {
        instance_id: instanceId,
        concept,
        aliases: strings(item.aliases),
        semantic_tags: strings(item.semantic_tags),
        style_tags: strings(item.style_tags),
        motion_role: text(item.motion_role, "static_scene_object"),
        must_be_separate: item.must_be_separate !== false,
        reusable: item.reusable !== false,
        required: item.required !== false,
        target_extent_m: Math.max(
          0.1,
          Math.min(20, number(item.target_extent_m, 1)),
        ),
        fallback_primitive: fallbackPrimitive,
        fallback_node_id: validFallbackNodeId,
        parent_id: validParentId,
        replacement_node_ids: replacementNodeIds,
        placement_relation: placementRelation,
        placement_target_instance_id:
          typeof item.placement_target_instance_id === "string"
            ? id(item.placement_target_instance_id, "")
            : undefined,
        placement_anchor: text(item.placement_anchor, "center"),
        placement_offset: vec3(
          item.placement_offset,
          [0, 0, 0],
        ),
        clearance_m: Math.max(
          0,
          Math.min(2, number(item.clearance_m, 0.01)),
        ),
        position: vec3(item.position, [0, 0, 0]),
        rotation: vec3(item.rotation, [0, 0, 0]),
        scale: positiveVec3(item.scale, [1, 1, 1]),
      };
    })
    .filter(
      (requirement): requirement is PrimitiveBuilderAssetRequirement =>
        Boolean(requirement),
    )
    .slice(0, 32);

  const knownRequirementIds = new Set(
    requirements.map(
      (requirement) => requirement.instance_id,
    ),
  );

  return requirements.map((requirement) => {
    if (
      requirement.placement_target_instance_id &&
      !knownRequirementIds.has(
        requirement.placement_target_instance_id,
      )
    ) {
      warnings.push(
        `Asset requirement ${requirement.instance_id} referenced missing placement target ${requirement.placement_target_instance_id}; relation reset to absolute.`,
      );
      return {
        ...requirement,
        placement_relation: "absolute" as const,
        placement_target_instance_id: undefined,
      };
    }

    return requirement;
  });
}
