export const ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION =
  "myway_asset_directability_profile_v1" as const;

export const ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION =
  "myway_asset_directability_overrides_v1" as const;

export const DIRECTOR_ASSET_DIRECTABILITY_VERSION =
  "director_asset_directability_phase1b5_v1" as const;

export type AssetDirectabilityVec3 = [number, number, number];

export type AssetDirectabilityEvidenceSource =
  | "geometry_profile"
  | "asset_metadata"
  | "manual_override"
  | "fallback_bounds";

export type AssetDirectabilityTargetScope = "root" | "subpart";

export type AssetDirectabilityAnchorKind =
  | "focus"
  | "view"
  | "attachment"
  | "socket"
  | "contact"
  | "inlet"
  | "outlet"
  | "other";

export type AssetDirectabilitySubpartCapability =
  | "rotate"
  | "translate"
  | "visibility"
  | "articulate"
  | "attach"
  | "contain";

export type AssetDirectabilityOrientation = {
  up_axis: AssetDirectabilityVec3;
  forward_axis: AssetDirectabilityVec3;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityAnchor = {
  id: string;
  semantic_names: string[];
  kind: AssetDirectabilityAnchorKind;
  local_position: AssetDirectabilityVec3;
  local_normal: AssetDirectabilityVec3 | null;
  target_scope: AssetDirectabilityTargetScope;
  subpart_id: string | null;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityPivot = {
  id: string;
  semantic_names: string[];
  local_position: AssetDirectabilityVec3;
  axis: AssetDirectabilityVec3;
  target_scope: AssetDirectabilityTargetScope;
  subpart_id: string | null;
  min_degrees: number | null;
  max_degrees: number | null;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilitySurface = {
  id: string;
  semantic_names: string[];
  local_center: AssetDirectabilityVec3;
  normal: AssetDirectabilityVec3;
  size: [number, number];
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityContainmentRegion = {
  id: string;
  semantic_names: string[];
  local_center: AssetDirectabilityVec3;
  size: AssetDirectabilityVec3;
  access_direction: AssetDirectabilityVec3 | null;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilitySubpart = {
  id: string;
  semantic_names: string[];
  node_name: string | null;
  capabilities: AssetDirectabilitySubpartCapability[];
  pivot_id: string | null;
  anchor_ids: string[];
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityRolling = {
  radius_m: number;
  axis: AssetDirectabilityVec3;
  local_center: AssetDirectabilityVec3 | null;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityRig = {
  rigged: boolean;
  available_clips: string[];
  bone_map: Record<string, string>;
  clip_map: Record<string, string>;
  source: AssetDirectabilityEvidenceSource;
  confidence: number;
};

export type AssetDirectabilityDiagnostics = {
  geometry_profile_available: boolean;
  geometry_profile_audit_status: "measured" | "review_required" | "missing";
  feature_kinds: string[];
  warnings: string[];
};

export type AssetDirectabilityRequirementResolution = {
  requirement_id: string;
  resolved: boolean;
  evidence_kind:
    | "orientation"
    | "anchor"
    | "pivot"
    | "surface"
    | "containment"
    | "subpart"
    | "rig"
    | "animation_clip"
    | "rolling"
    | null;
  evidence_id: string | null;
  confidence: number | null;
  note: string;
};

export type AssetDirectabilityProfileV1 = {
  schema_version: typeof ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION;
  directability_version: typeof DIRECTOR_ASSET_DIRECTABILITY_VERSION;
  asset_id: string;
  coordinate_space: "normalized_glb_y_up";
  local_bounds_size: AssetDirectabilityVec3;
  orientation: AssetDirectabilityOrientation;
  anchors: AssetDirectabilityAnchor[];
  pivots: AssetDirectabilityPivot[];
  surfaces: AssetDirectabilitySurface[];
  containment_regions: AssetDirectabilityContainmentRegion[];
  subparts: AssetDirectabilitySubpart[];
  rolling: AssetDirectabilityRolling | null;
  rig: AssetDirectabilityRig;
  diagnostics: AssetDirectabilityDiagnostics;
};

export type AssetDirectabilityOverridesV1 = {
  schema_version: typeof ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION;
  orientation?: {
    up_axis?: AssetDirectabilityVec3;
    forward_axis?: AssetDirectabilityVec3;
    confidence?: number;
  } | null;
  anchors?: Array<{
    id: string;
    semantic_names?: string[];
    kind?: AssetDirectabilityAnchorKind;
    local_position: AssetDirectabilityVec3;
    local_normal?: AssetDirectabilityVec3 | null;
    target_scope?: AssetDirectabilityTargetScope;
    subpart_id?: string | null;
    confidence?: number;
  }>;
  pivots?: Array<{
    id: string;
    semantic_names?: string[];
    local_position: AssetDirectabilityVec3;
    axis: AssetDirectabilityVec3;
    target_scope?: AssetDirectabilityTargetScope;
    subpart_id?: string | null;
    min_degrees?: number | null;
    max_degrees?: number | null;
    confidence?: number;
  }>;
  subparts?: Array<{
    id: string;
    semantic_names?: string[];
    node_name?: string | null;
    capabilities?: AssetDirectabilitySubpartCapability[];
    pivot_id?: string | null;
    anchor_ids?: string[];
    confidence?: number;
  }>;
  rolling?: {
    radius_m: number;
    axis: AssetDirectabilityVec3;
    local_center?: AssetDirectabilityVec3 | null;
    confidence?: number;
  } | null;
  rig?: {
    bone_map?: Record<string, string>;
    clip_map?: Record<string, string>;
    confidence?: number;
  } | null;
};

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value: unknown, fallback = 0.5) {
  return Math.max(0, Math.min(1, finiteNumber(value, fallback)));
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedId(value: unknown, fallback: string) {
  const raw = nullableString(value) ?? fallback;
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || fallback
  );
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && Boolean(entry[1].trim()),
      )
      .map(([key, item]) => [key.trim(), item.trim()])
      .filter(([key]) => Boolean(key)),
  );
}

function vec3(
  value: unknown,
  fallback: AssetDirectabilityVec3,
): AssetDirectabilityVec3 {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ];
}

function normalizedVec3(
  value: unknown,
  fallback: AssetDirectabilityVec3,
): AssetDirectabilityVec3 {
  const result = vec3(value, fallback);
  const magnitude = Math.hypot(result[0], result[1], result[2]);
  if (magnitude <= 1e-9) return [...fallback];
  return [
    result[0] / magnitude,
    result[1] / magnitude,
    result[2] / magnitude,
  ];
}

function anchorKind(value: unknown): AssetDirectabilityAnchorKind {
  return value === "focus" ||
    value === "view" ||
    value === "attachment" ||
    value === "socket" ||
    value === "contact" ||
    value === "inlet" ||
    value === "outlet"
    ? value
    : "other";
}

function targetScope(value: unknown): AssetDirectabilityTargetScope {
  return value === "subpart" ? "subpart" : "root";
}

const SUBPART_CAPABILITIES = new Set<AssetDirectabilitySubpartCapability>([
  "rotate",
  "translate",
  "visibility",
  "articulate",
  "attach",
  "contain",
]);

function subpartCapabilities(value: unknown) {
  return stringList(value).filter(
    (item): item is AssetDirectabilitySubpartCapability =>
      SUBPART_CAPABILITIES.has(item as AssetDirectabilitySubpartCapability),
  );
}

export function normalizeAssetDirectabilityOverrides(
  value: unknown,
): AssetDirectabilityOverridesV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (
    item.schema_version !==
    ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION
  ) {
    return null;
  }

  const orientation =
    item.orientation &&
    typeof item.orientation === "object" &&
    !Array.isArray(item.orientation)
      ? (() => {
          const raw = item.orientation as Record<string, unknown>;
          return {
            up_axis: normalizedVec3(raw.up_axis, [0, 1, 0]),
            forward_axis: normalizedVec3(raw.forward_axis, [0, 0, 1]),
            confidence: clamp01(raw.confidence, 1),
          };
        })()
      : undefined;

  const anchors = Array.isArray(item.anchors)
    ? item.anchors
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const raw = entry as Record<string, unknown>;
          const id = normalizedId(raw.id, `anchor_${index + 1}`);
          return {
            id,
            semantic_names: stringList(raw.semantic_names),
            kind: anchorKind(raw.kind),
            local_position: vec3(raw.local_position, [0, 0, 0]),
            local_normal:
              raw.local_normal == null
                ? null
                : normalizedVec3(raw.local_normal, [0, 0, 1]),
            target_scope: targetScope(raw.target_scope),
            subpart_id: nullableString(raw.subpart_id),
            confidence: clamp01(raw.confidence, 1),
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> => Boolean(entry),
        )
        .slice(0, 64)
    : [];

  const pivots = Array.isArray(item.pivots)
    ? item.pivots
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const raw = entry as Record<string, unknown>;
          return {
            id: normalizedId(raw.id, `pivot_${index + 1}`),
            semantic_names: stringList(raw.semantic_names),
            local_position: vec3(raw.local_position, [0, 0, 0]),
            axis: normalizedVec3(raw.axis, [0, 1, 0]),
            target_scope: targetScope(raw.target_scope),
            subpart_id: nullableString(raw.subpart_id),
            min_degrees:
              raw.min_degrees == null
                ? null
                : finiteNumber(raw.min_degrees, 0),
            max_degrees:
              raw.max_degrees == null
                ? null
                : finiteNumber(raw.max_degrees, 0),
            confidence: clamp01(raw.confidence, 1),
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> => Boolean(entry),
        )
        .slice(0, 64)
    : [];

  const subparts = Array.isArray(item.subparts)
    ? item.subparts
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const raw = entry as Record<string, unknown>;
          return {
            id: normalizedId(raw.id, `subpart_${index + 1}`),
            semantic_names: stringList(raw.semantic_names),
            node_name: nullableString(raw.node_name),
            capabilities: subpartCapabilities(raw.capabilities),
            pivot_id: nullableString(raw.pivot_id),
            anchor_ids: stringList(raw.anchor_ids),
            confidence: clamp01(raw.confidence, 1),
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> => Boolean(entry),
        )
        .slice(0, 128)
    : [];

  const rolling =
    item.rolling &&
    typeof item.rolling === "object" &&
    !Array.isArray(item.rolling)
      ? (() => {
          const raw = item.rolling as Record<string, unknown>;
          const radius = finiteNumber(raw.radius_m, 0);
          if (!(radius > 0)) return null;
          return {
            radius_m: radius,
            axis: normalizedVec3(raw.axis, [0, 0, 1]),
            local_center:
              raw.local_center == null
                ? null
                : vec3(raw.local_center, [0, 0, 0]),
            confidence: clamp01(raw.confidence, 1),
          };
        })()
      : null;

  const rig =
    item.rig &&
    typeof item.rig === "object" &&
    !Array.isArray(item.rig)
      ? (() => {
          const raw = item.rig as Record<string, unknown>;
          return {
            bone_map: stringRecord(raw.bone_map),
            clip_map: stringRecord(raw.clip_map),
            confidence: clamp01(raw.confidence, 1),
          };
        })()
      : undefined;

  return {
    schema_version: ASSET_DIRECTABILITY_OVERRIDES_SCHEMA_VERSION,
    orientation,
    anchors,
    pivots,
    subparts,
    rolling,
    rig,
  };
}
