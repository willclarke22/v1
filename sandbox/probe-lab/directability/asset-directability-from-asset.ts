import type {
  MyWayAssetAttachmentRegion,
  MyWayAssetInteriorVolume,
  MyWayAssetRecord,
  MyWayAssetSupportSurface,
  Vec3,
} from "../assets/asset-types";
import {
  ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION,
  DIRECTOR_ASSET_DIRECTABILITY_VERSION,
  type AssetDirectabilityAnchor,
  type AssetDirectabilityContainmentRegion,
  type AssetDirectabilityOverridesV1,
  type AssetDirectabilityPivot,
  type AssetDirectabilityProfileV1,
  type AssetDirectabilityRig,
  type AssetDirectabilitySubpart,
  type AssetDirectabilitySurface,
  type AssetDirectabilityVec3,
} from "./asset-directability-contract";

function clamp01(value: number, fallback = 0.5) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalize(value: Vec3, fallback: AssetDirectabilityVec3) {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (magnitude <= 1e-9) return [...fallback] as AssetDirectabilityVec3;
  return [
    value[0] / magnitude,
    value[1] / magnitude,
    value[2] / magnitude,
  ] as AssetDirectabilityVec3;
}

function semanticNames(...values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          value
            ? [
                value,
                value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_+|_+$/g, ""),
              ]
            : [],
        )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function geometryConfidence(asset: MyWayAssetRecord) {
  const audit = asset.geometry_profile?.audit;
  if (!asset.geometry_profile) return 0;
  if (!audit) return 0.55;
  return clamp01(audit.confidence, audit.status === "measured" ? 0.7 : 0.35);
}

function supportSurface(
  surface: MyWayAssetSupportSurface,
  primarySurfaceId?: string | null,
): AssetDirectabilitySurface {
  return {
    id: surface.id,
    semantic_names: semanticNames(
      surface.id,
      surface.label,
      "support_surface",
      surface.orientation === "upward" ? "top_surface" : null,
    ),
    local_center: [...surface.center],
    normal: normalize(surface.normal, [0, 1, 0]),
    size: [...surface.size],
    usable_size: [...(surface.usable_size ?? surface.size)],
    clearance_above_m: surface.clearance_above_m,
    blocked_fraction: surface.blocked_fraction,
    exposure: surface.exposure,
    orientation: surface.orientation,
    openness: surface.openness,
    vertical_rank: surface.vertical_rank,
    height_ratio: surface.height_ratio,
    is_primary: primarySurfaceId === surface.id,
    source:
      surface.source === "manual"
        ? "manual_override"
        : "geometry_profile",
    confidence: clamp01(surface.confidence, 0.5),
  };
}

function containmentRegion(
  volume: MyWayAssetInteriorVolume,
): AssetDirectabilityContainmentRegion {
  return {
    id: volume.id,
    semantic_names: semanticNames(
      volume.id,
      volume.label,
      "containment_region",
      "interior",
      volume.openness === "open" ? "fillable_region" : null,
    ),
    local_center: [...volume.center],
    size: [...volume.size],
    access_direction: volume.access_direction
      ? normalize(volume.access_direction, [0, 1, 0])
      : null,
    openness: volume.openness,
    exposure: volume.exposure,
    source:
      volume.source === "manual"
        ? "manual_override"
        : "geometry_profile",
    confidence: clamp01(volume.confidence, 0.5),
  };
}

function attachmentAnchor(
  region: MyWayAssetAttachmentRegion,
): AssetDirectabilityAnchor {
  return {
    id: region.id,
    semantic_names: semanticNames(
      region.id,
      region.label,
      "attachment_anchor",
      `${region.side}_attachment`,
    ),
    kind: "attachment",
    local_position: [...region.center],
    local_normal: normalize(region.normal, [0, 0, 1]),
    target_scope: "root",
    subpart_id: null,
    source:
      region.source === "manual"
        ? "manual_override"
        : "geometry_profile",
    confidence: clamp01(region.confidence, 0.5),
    contact_size: [...region.size],
  };
}

function mergeById<T extends { id: string }>(
  base: T[],
  additions: T[],
) {
  const output = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of additions) output.set(entry.id, entry);
  return [...output.values()];
}

function overrideAnchors(
  overrides: AssetDirectabilityOverridesV1 | null | undefined,
): AssetDirectabilityAnchor[] {
  return (overrides?.anchors ?? []).map((anchor) => ({
    id: anchor.id,
    semantic_names: semanticNames(
      anchor.id,
      ...(anchor.semantic_names ?? []),
      anchor.kind === "attachment" || anchor.kind === "socket"
        ? "attachment_anchor"
        : null,
      anchor.kind === "outlet" ? "flow_outlet" : null,
      anchor.kind === "inlet" ? "flow_inlet" : null,
    ),
    kind: anchor.kind ?? "other",
    local_position: [...anchor.local_position],
    local_normal: anchor.local_normal
      ? [...anchor.local_normal]
      : null,
    target_scope: anchor.target_scope ?? "root",
    subpart_id: anchor.subpart_id ?? null,
    source: "manual_override",
    confidence: clamp01(anchor.confidence ?? 1, 1),
  }));
}

function overridePivots(
  overrides: AssetDirectabilityOverridesV1 | null | undefined,
): AssetDirectabilityPivot[] {
  return (overrides?.pivots ?? []).map((pivot) => ({
    id: pivot.id,
    semantic_names: semanticNames(
      pivot.id,
      ...(pivot.semantic_names ?? []),
      "hinge_anchor",
      "hinge_axis",
    ),
    local_position: [...pivot.local_position],
    axis: [...pivot.axis],
    target_scope: pivot.target_scope ?? "root",
    subpart_id: pivot.subpart_id ?? null,
    min_degrees: pivot.min_degrees ?? null,
    max_degrees: pivot.max_degrees ?? null,
    source: "manual_override",
    confidence: clamp01(pivot.confidence ?? 1, 1),
  }));
}

function overrideSubparts(
  overrides: AssetDirectabilityOverridesV1 | null | undefined,
): AssetDirectabilitySubpart[] {
  return (overrides?.subparts ?? []).map((subpart) => ({
    id: subpart.id,
    semantic_names: semanticNames(
      subpart.id,
      subpart.node_name,
      ...(subpart.semantic_names ?? []),
    ),
    node_name: subpart.node_name ?? null,
    capabilities: [...(subpart.capabilities ?? [])],
    pivot_id: subpart.pivot_id ?? null,
    anchor_ids: [...(subpart.anchor_ids ?? [])],
    source: "manual_override",
    confidence: clamp01(subpart.confidence ?? 1, 1),
  }));
}

function rigProfile(asset: MyWayAssetRecord): AssetDirectabilityRig {
  const override = asset.directability_overrides?.rig;
  const hasOverride =
    Boolean(override) &&
    (Object.keys(override?.bone_map ?? {}).length > 0 ||
      Object.keys(override?.clip_map ?? {}).length > 0);
  return {
    rigged: asset.rigged,
    available_clips: [...asset.animation_clips],
    bone_map: { ...(override?.bone_map ?? {}) },
    clip_map: { ...(override?.clip_map ?? {}) },
    source: hasOverride ? "manual_override" : "asset_metadata",
    confidence: hasOverride
      ? clamp01(override?.confidence ?? 1, 1)
      : asset.rigged
        ? 0.65
        : 0.25,
  };
}

export function buildAssetDirectabilityProfile(
  asset: MyWayAssetRecord,
): AssetDirectabilityProfileV1 {
  const geometry = asset.geometry_profile ?? null;
  const overrides = asset.directability_overrides ?? null;
  const boundsSize = geometry?.local_bounds.size ?? asset.dimensions_m;
  const geometryScore = geometryConfidence(asset);

  const geometryOrientation = geometry?.orientation;
  const overrideOrientation = overrides?.orientation;
  const orientation = overrideOrientation
    ? {
        up_axis: [...(overrideOrientation.up_axis ?? geometryOrientation?.up_axis ?? [0, 1, 0])] as AssetDirectabilityVec3,
        forward_axis: [...(overrideOrientation.forward_axis ?? geometryOrientation?.forward_axis ?? [0, 0, 1])] as AssetDirectabilityVec3,
        source: "manual_override" as const,
        confidence: clamp01(overrideOrientation.confidence ?? 1, 1),
      }
    : geometryOrientation
      ? {
          up_axis: normalize(geometryOrientation.up_axis, [0, 1, 0]),
          forward_axis: normalize(geometryOrientation.forward_axis, [0, 0, 1]),
          source: "geometry_profile" as const,
          confidence: geometryScore,
        }
      : {
          up_axis: [0, 1, 0] as AssetDirectabilityVec3,
          forward_axis: [0, 0, 1] as AssetDirectabilityVec3,
          source: "fallback_bounds" as const,
          confidence: 0.1,
        };

  const focusAnchor: AssetDirectabilityAnchor = {
    id: "focus_center",
    semantic_names: ["focus_center", "focus", "view_target", "object_center"],
    kind: "focus",
    local_position: geometry
      ? [...geometry.local_bounds.center]
      : [0, boundsSize[1] * 0.5, 0],
    local_normal: null,
    target_scope: "root",
    subpart_id: null,
    source: geometry ? "geometry_profile" : "fallback_bounds",
    confidence: geometry ? Math.max(0.35, geometryScore * 0.8) : 0.1,
  };
  const bottomContactAnchor: AssetDirectabilityAnchor | null = geometry
    ? {
        id: geometry.bottom_contact_region.id,
        semantic_names: semanticNames(
          geometry.bottom_contact_region.id,
          "bottom_contact",
          "ground_contact",
          "contact_anchor",
        ),
        kind: "contact",
        local_position: [...geometry.bottom_contact_region.center],
        local_normal: normalize(
          geometry.bottom_contact_region.normal,
          [0, 1, 0],
        ),
        target_scope: "root",
        subpart_id: null,
        source: "geometry_profile",
        confidence: clamp01(
          geometry.bottom_contact_region.confidence,
          geometryScore,
        ),
      }
    : null;

  const geometryAnchors = [
    focusAnchor,
    ...(bottomContactAnchor ? [bottomContactAnchor] : []),
    ...(geometry?.attachment_regions
      .filter((region) => region.source !== "legacy_ratio")
      .map(attachmentAnchor) ?? []),
  ];
  const anchors = mergeById(
    geometryAnchors,
    overrideAnchors(overrides),
  );
  const pivots = overridePivots(overrides);
  const subparts = overrideSubparts(overrides);
  const surfaces =
    geometry?.support_surfaces
      .filter((surface) => surface.source !== "legacy_ratio")
      .map((surface) =>
        supportSurface(surface, geometry.primary_support_surface_id),
      ) ?? [];
  const containmentRegions =
    geometry?.interior_volumes
      .filter((region) => region.source !== "legacy_ratio")
      .map(containmentRegion) ?? [];

  const rolling = overrides?.rolling
    ? {
        radius_m: Math.max(0.0001, overrides.rolling.radius_m),
        axis: [...overrides.rolling.axis] as AssetDirectabilityVec3,
        local_center: overrides.rolling.local_center
          ? [...overrides.rolling.local_center] as AssetDirectabilityVec3
          : null,
        source: "manual_override" as const,
        confidence: clamp01(overrides.rolling.confidence ?? 1, 1),
      }
    : null;

  const featureKinds = [
    "orientation",
    anchors.length ? "anchors" : null,
    pivots.length ? "pivots" : null,
    surfaces.length ? "surfaces" : null,
    containmentRegions.length ? "containment" : null,
    subparts.length ? "subparts" : null,
    rolling ? "rolling" : null,
    asset.rigged ? "rig" : null,
    asset.animation_clips.length ? "animation_clips" : null,
  ].filter((item): item is string => Boolean(item));

  const warnings: string[] = [];
  if (!geometry) {
    warnings.push(
      "No measured geometry profile is available; orientation/focus defaults are low-confidence and no surfaces, containment regions, or attachment regions are invented.",
    );
  }
  if (!pivots.length) {
    warnings.push(
      "No semantic pivot/hinge override is available; articulated recipes must retain their qualified fallback rather than inventing a subpart hinge.",
    );
  }
  if (!subparts.length) {
    warnings.push(
      "No semantic subpart map is available; Phase 1B.5 does not infer mesh-part identity from node names.",
    );
  }
  if (asset.rigged && !Object.keys(overrides?.rig?.bone_map ?? {}).length) {
    warnings.push(
      "The asset is marked rigged, but no semantic bone map is declared.",
    );
  }

  return {
    schema_version: ASSET_DIRECTABILITY_PROFILE_SCHEMA_VERSION,
    directability_version: DIRECTOR_ASSET_DIRECTABILITY_VERSION,
    asset_id: asset.asset_id,
    coordinate_space: "normalized_glb_y_up",
    local_bounds_size: [...boundsSize],
    orientation,
    anchors,
    pivots,
    surfaces,
    containment_regions: containmentRegions,
    subparts,
    rolling,
    rig: rigProfile(asset),
    diagnostics: {
      geometry_profile_available: Boolean(geometry),
      geometry_profile_audit_status:
        geometry?.audit?.status ?? (geometry ? "measured" : "missing"),
      feature_kinds: featureKinds,
      warnings,
    },
  };
}
