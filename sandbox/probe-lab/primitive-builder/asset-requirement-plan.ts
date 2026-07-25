import type {
  MyWayAssetAppearanceRequestV1,
} from "../assets/asset-types";
import {
  normalizeAppearanceRequest,
} from "../assets/appearance-request";

export type PrimitiveBuilderVec3 = [number, number, number];

export const PRIMITIVE_BUILDER_LAYOUT_PROXY_KINDS = [
  "box",
  "softBox",
  "cylinder",
  "sphere",
  "group",
  "none",
] as const;

// Compatibility aliases for saved pre-asset-first scenes and older callers.
export const PRIMITIVE_BUILDER_FALLBACK_KINDS =
  PRIMITIVE_BUILDER_LAYOUT_PROXY_KINDS;

export const PRIMITIVE_BUILDER_PLACEMENT_RELATIONS = [
  "absolute",
  "on_ground",
  "on_surface",
  "beside",
  "inside",
  "attached_to",
] as const;


export const PRIMITIVE_BUILDER_REGION_KINDS = [
  "any",
  "support",
  "containment",
  "attachment",
  "adjacent",
] as const;

export const PRIMITIVE_BUILDER_REGION_EXPOSURES = [
  "any",
  "exterior",
  "interior",
] as const;

export const PRIMITIVE_BUILDER_REGION_ORIENTATIONS = [
  "any",
  "upward",
  "vertical",
  "downward",
  "sloped",
] as const;

export const PRIMITIVE_BUILDER_VERTICAL_RANKS = [
  "any",
  "highest",
  "upper",
  "middle",
  "lower",
  "lowest",
] as const;

export const PRIMITIVE_BUILDER_OPENNESS = [
  "any",
  "open",
  "enclosed",
] as const;

export const PRIMITIVE_BUILDER_SIDES = [
  "any",
  "left",
  "right",
  "front",
  "back",
] as const;

export type PrimitiveBuilderPlacementRegionPreference = {
  region_kind: (typeof PRIMITIVE_BUILDER_REGION_KINDS)[number];
  exposure: (typeof PRIMITIVE_BUILDER_REGION_EXPOSURES)[number];
  orientation: (typeof PRIMITIVE_BUILDER_REGION_ORIENTATIONS)[number];
  vertical_rank: (typeof PRIMITIVE_BUILDER_VERTICAL_RANKS)[number];
  openness: (typeof PRIMITIVE_BUILDER_OPENNESS)[number];
  side: (typeof PRIMITIVE_BUILDER_SIDES)[number];
  require_ground_contact: boolean;
  allow_intersection: boolean;
};

export type PrimitiveBuilderLayoutProxyKind =
  (typeof PRIMITIVE_BUILDER_LAYOUT_PROXY_KINDS)[number];

// Compatibility alias. New code should use PrimitiveBuilderLayoutProxyKind.
export type PrimitiveBuilderFallbackKind =
  PrimitiveBuilderLayoutProxyKind;

export type PrimitiveBuilderPlacementRelation =
  (typeof PRIMITIVE_BUILDER_PLACEMENT_RELATIONS)[number];

export type PrimitiveBuilderSurfaceReference = {
  center: PrimitiveBuilderVec3;
  normal: PrimitiveBuilderVec3;
  size: [number, number];
  height_ratio: number;
  center_ratio: [number, number];
  size_ratio: [number, number];
  area_ratio: number;
  confidence: number;
};

export type PrimitiveBuilderAssetRequirement = {
  instance_id: string;
  concept: string;
  aliases: string[];
  semantic_tags: string[];
  appearance_request?: MyWayAssetAppearanceRequestV1;
  motion_role: string;
  must_be_separate: boolean;
  reusable: boolean;
  required: boolean;
  target_extent_m: number;
  // Primitive geometry is an invisible layout proxy. It is never rendered as
  // a substitute for a missing asset in the asset-first scene runtime.
  layout_proxy_kind: PrimitiveBuilderLayoutProxyKind;
  layout_proxy_node_id?: string;
  layout_proxy_node_ids: string[];
  parent_id?: string;

  // Read-only compatibility fields accepted from older saved scenes. Normalized
  // requirements are emitted with layout_proxy_* fields instead.
  fallback_primitive?: PrimitiveBuilderFallbackKind;
  fallback_node_id?: string;
  replacement_node_ids?: string[];

  // Relationship-aware placement is resolved after actual GLB bounds load.
  placement_relation: PrimitiveBuilderPlacementRelation;
  placement_target_instance_id?: string;
  placement_anchor: string;
  placement_region: PrimitiveBuilderPlacementRegionPreference;
  placement_source: "explicit" | "inferred";
  placement_offset: PrimitiveBuilderVec3;
  placement_uv: [number, number];
  primitive_support_surface?: PrimitiveBuilderSurfaceReference;
  layout_priority: number;
  clearance_m: number;

  position: PrimitiveBuilderVec3;
  rotation: PrimitiveBuilderVec3;
  scale: PrimitiveBuilderVec3;
};

export type PrimitiveBuilderAssetRequirementPlan = {
  schema_version: "primitive_builder_asset_requirements_v4";
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

function vec2(
  value: unknown,
  fallback: [number, number],
): [number, number] {
  const source = list(value);
  if (source.length < 2) return fallback;

  return [
    number(source[0], fallback[0]),
    number(source[1], fallback[1]),
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

function surfaceReference(
  value: unknown,
): PrimitiveBuilderSurfaceReference | undefined {
  const item = record(value);
  if (!item) return undefined;

  const size = vec2(item.size, [1, 1]);
  const centerRatio = vec2(
    item.center_ratio,
    [0, 0],
  );
  const sizeRatio = vec2(
    item.size_ratio,
    [1, 1],
  );

  return {
    center: vec3(item.center, [0, 0, 0]),
    normal: vec3(item.normal, [0, 1, 0]),
    size: [
      Math.max(0.001, Math.abs(size[0])),
      Math.max(0.001, Math.abs(size[1])),
    ],
    height_ratio: Math.max(
      0,
      Math.min(
        1.5,
        number(item.height_ratio, 1),
      ),
    ),
    center_ratio: [
      Math.max(-2, Math.min(2, centerRatio[0])),
      Math.max(-2, Math.min(2, centerRatio[1])),
    ],
    size_ratio: [
      Math.max(
        0.001,
        Math.min(2, Math.abs(sizeRatio[0])),
      ),
      Math.max(
        0.001,
        Math.min(2, Math.abs(sizeRatio[1])),
      ),
    ],
    area_ratio: Math.max(
      0,
      Math.min(
        4,
        number(item.area_ratio, 1),
      ),
    ),
    confidence: Math.max(
      0,
      Math.min(
        1,
        number(item.confidence, 0.5),
      ),
    ),
  };
}

function allowedString<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function placementRegion(
  value: unknown,
  relation: PrimitiveBuilderPlacementRelation,
): PrimitiveBuilderPlacementRegionPreference {
  const item = record(value) ?? {};
  const defaultKind =
    relation === "on_surface"
      ? "support"
      : relation === "inside"
        ? "containment"
        : relation === "attached_to"
          ? "attachment"
          : relation === "beside"
            ? "adjacent"
            : "any";

  return {
    region_kind: allowedString(
      item.region_kind,
      PRIMITIVE_BUILDER_REGION_KINDS,
      defaultKind,
    ),
    exposure: allowedString(
      item.exposure,
      PRIMITIVE_BUILDER_REGION_EXPOSURES,
      "any",
    ),
    orientation: allowedString(
      item.orientation,
      PRIMITIVE_BUILDER_REGION_ORIENTATIONS,
      relation === "on_surface" ? "upward" : "any",
    ),
    vertical_rank: allowedString(
      item.vertical_rank,
      PRIMITIVE_BUILDER_VERTICAL_RANKS,
      "any",
    ),
    openness: allowedString(
      item.openness,
      PRIMITIVE_BUILDER_OPENNESS,
      "any",
    ),
    side: allowedString(
      item.side,
      PRIMITIVE_BUILDER_SIDES,
      "any",
    ),
    require_ground_contact:
      item.require_ground_contact === true ||
      relation === "beside",
    allow_intersection:
      item.allow_intersection === true,
  };
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

      const rawLayoutProxyKind =
        item.layout_proxy_kind ??
        item.fallback_primitive;
      const layoutProxyKind =
        typeof rawLayoutProxyKind === "string" &&
        (
          PRIMITIVE_BUILDER_LAYOUT_PROXY_KINDS as readonly string[]
        ).includes(rawLayoutProxyKind)
          ? (rawLayoutProxyKind as PrimitiveBuilderLayoutProxyKind)
          : "softBox";

      const rawLayoutProxyNodeId =
        item.layout_proxy_node_id ??
        item.fallback_node_id;
      const layoutProxyNodeId =
        typeof rawLayoutProxyNodeId === "string"
          ? id(rawLayoutProxyNodeId, "")
          : undefined;
      const validLayoutProxyNodeId =
        layoutProxyNodeId &&
        knownNodeIds.has(layoutProxyNodeId)
          ? layoutProxyNodeId
          : undefined;

      if (
        layoutProxyNodeId &&
        !validLayoutProxyNodeId
      ) {
        warnings.push(
          `Asset requirement ${instanceId} referenced missing layout proxy node ${layoutProxyNodeId}.`,
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
      const placementWasExplicit =
        typeof rawRelation === "string" &&
        rawRelation !== "absolute";
      const placementRelation =
        typeof rawRelation === "string" &&
        (
          PRIMITIVE_BUILDER_PLACEMENT_RELATIONS as readonly string[]
        ).includes(rawRelation)
          ? (rawRelation as PrimitiveBuilderPlacementRelation)
          : "absolute";

      const layoutProxyNodeIds = Array.from(
        new Set([
          ...strings(
            item.layout_proxy_node_ids ??
              item.replacement_node_ids,
          )
            .map((value) => id(value, ""))
            .filter(
              (value) =>
                value && knownNodeIds.has(value),
            ),
          ...(validLayoutProxyNodeId
            ? [validLayoutProxyNodeId]
            : []),
        ]),
      );

      return {
        instance_id: instanceId,
        concept,
        aliases: strings(item.aliases),
        semantic_tags: strings(item.semantic_tags),
        appearance_request:
          normalizeAppearanceRequest(
            item.appearance_request ??
              item.appearance,
          ),
        motion_role: text(item.motion_role, "static_scene_object"),
        must_be_separate: item.must_be_separate !== false,
        reusable: item.reusable !== false,
        required: item.required !== false,
        target_extent_m: (() => {
          const requested = number(
            item.target_extent_m,
            0,
          );
          return requested > 0
            ? Math.max(
                0.02,
                Math.min(30, requested),
              )
            : 0;
        })(),
        layout_proxy_kind: layoutProxyKind,
        layout_proxy_node_id:
          validLayoutProxyNodeId,
        layout_proxy_node_ids:
          layoutProxyNodeIds,
        parent_id: validParentId,
        placement_relation: placementRelation,
        placement_target_instance_id:
          typeof item.placement_target_instance_id === "string"
            ? id(item.placement_target_instance_id, "")
            : undefined,
        placement_anchor: text(item.placement_anchor, "center"),
        placement_region: placementRegion(
          item.placement_region ??
            item.region_preference,
          placementRelation,
        ),
        placement_source:
          placementWasExplicit
            ? "explicit"
            : "inferred",
        placement_offset: vec3(
          item.placement_offset,
          [0, 0, 0],
        ),
        placement_uv: vec2(
          item.placement_uv,
          [0, 0],
        ).map((entry) =>
          Math.max(-0.95, Math.min(0.95, entry)),
        ) as [number, number],
        primitive_support_surface:
          surfaceReference(
            item.primitive_support_surface,
          ),
        layout_priority: Math.max(
          -100,
          Math.min(
            100,
            number(item.layout_priority, 0),
          ),
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
        placement_source: "inferred" as const,
        placement_region: placementRegion(
          undefined,
          "absolute",
        ),
      };
    }

    return requirement;
  });
}
