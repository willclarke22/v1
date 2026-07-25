import type {
  MyWaySceneManifestV2,
  SceneAssetInstance,
} from "./scene-manifest";

export function safeSceneId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function vec3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    Number.isFinite(Number(value[0]))
      ? Number(value[0])
      : fallback[0],
    Number.isFinite(Number(value[1]))
      ? Number(value[1])
      : fallback[1],
    Number.isFinite(Number(value[2]))
      ? Number(value[2])
      : fallback[2],
  ];
}

function placementRegion(value: unknown) {
  const item = record(value) ?? {};
  const allowed = <T extends string>(
    raw: unknown,
    values: readonly T[],
    fallback: T,
  ): T =>
    typeof raw === "string" &&
    values.includes(raw as T)
      ? (raw as T)
      : fallback;

  return {
    region_kind: allowed(
      item.region_kind,
      [
        "any",
        "support",
        "containment",
        "attachment",
        "adjacent",
      ] as const,
      "any",
    ),
    exposure: allowed(
      item.exposure,
      ["any", "exterior", "interior"] as const,
      "any",
    ),
    orientation: allowed(
      item.orientation,
      [
        "any",
        "upward",
        "vertical",
        "downward",
        "sloped",
      ] as const,
      "any",
    ),
    vertical_rank: allowed(
      item.vertical_rank,
      [
        "any",
        "highest",
        "upper",
        "middle",
        "lower",
        "lowest",
      ] as const,
      "any",
    ),
    openness: allowed(
      item.openness,
      ["any", "open", "enclosed"] as const,
      "any",
    ),
    side: allowed(
      item.side,
      ["any", "left", "right", "front", "back"] as const,
      "any",
    ),
    require_ground_contact:
      item.require_ground_contact === true,
    allow_intersection:
      item.allow_intersection === true,
  };
}

function normalizeAssetInstance(
  value: unknown,
  index: number,
): SceneAssetInstance | null {
  const item = record(value);
  if (!item) return null;

  const assetId =
    typeof item.asset_id === "string"
      ? item.asset_id.trim()
      : "";
  if (!assetId) return null;

  return {
    ...(item as unknown as SceneAssetInstance),
    instance_id:
      typeof item.instance_id === "string" &&
      item.instance_id.trim()
        ? safeSceneId(item.instance_id)
        : `asset_${index + 1}`,
    asset_id: assetId,
    position: vec3(item.position, [0, 0, 0]),
    rotation: vec3(item.rotation, [0, 0, 0]),
    scale: vec3(item.scale, [1, 1, 1]).map(
      (entry) => Math.max(0.001, Math.abs(entry)),
    ) as [number, number, number],
    layout_proxy_node_id:
      typeof item.layout_proxy_node_id ===
        "string"
        ? item.layout_proxy_node_id
        : typeof item.fallback_node_id ===
            "string"
          ? item.fallback_node_id
          : undefined,
    layout_proxy_node_ids: Array.isArray(
      item.layout_proxy_node_ids,
    )
      ? item.layout_proxy_node_ids.filter(
          (entry): entry is string =>
            typeof entry === "string" &&
            entry.trim().length > 0,
        )
      : Array.isArray(
            item.replacement_node_ids,
          )
        ? item.replacement_node_ids.filter(
            (entry): entry is string =>
              typeof entry === "string" &&
              entry.trim().length > 0,
          )
        : [],
    placement_relation:
      item.placement_relation === "on_ground" ||
      item.placement_relation === "on_surface" ||
      item.placement_relation === "beside" ||
      item.placement_relation === "inside" ||
      item.placement_relation === "attached_to"
        ? item.placement_relation
        : "absolute",
    placement_target_instance_id:
      typeof item.placement_target_instance_id === "string"
        ? item.placement_target_instance_id
        : undefined,
    placement_anchor:
      typeof item.placement_anchor === "string"
        ? item.placement_anchor
        : "center",
    placement_region: placementRegion(
      item.placement_region,
    ),
    placement_source:
      item.placement_source === "explicit"
        ? "explicit"
        : "inferred",
    placement_offset: vec3(
      item.placement_offset,
      [0, 0, 0],
    ),
    clearance_m:
      Number.isFinite(Number(item.clearance_m))
        ? Math.max(0, Number(item.clearance_m))
        : 0.01,
  };
}

export function validateSceneManifest(
  raw: unknown,
):
  | { ok: true; scene: MyWaySceneManifestV2 }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const item = record(raw);

  if (!item) {
    return {
      ok: false,
      errors: ["Scene must be an object."],
    };
  }

  const sceneId = safeSceneId(
    String(item.scene_id ?? item.title ?? ""),
  );
  if (!sceneId) {
    errors.push("scene_id or title is required");
  }

  const now = new Date().toISOString();
  const source =
    item.source === "visual_experience"
      ? "visual_experience"
      : "primitive_builder";
  const assets = Array.isArray(item.assets)
    ? item.assets
        .map(normalizeAssetInstance)
        .filter(
          (
            value,
          ): value is SceneAssetInstance =>
            Boolean(value),
        )
    : [];

  const scene: MyWaySceneManifestV2 = {
    schema_version: "myway_scene_manifest_v2",
    scene_id: sceneId,
    title: String(item.title ?? sceneId),
    original_prompt: String(
      item.original_prompt ?? "",
    ),
    source,
    assets,
    procedural_nodes: Array.isArray(
      item.procedural_nodes,
    )
      ? item.procedural_nodes
      : [],
    scene_graph: item.scene_graph ?? null,
    primitive_plan: item.primitive_plan ?? null,
    asset_requirements: Array.isArray(
      item.asset_requirements,
    )
      ? item.asset_requirements
      : [],
    unresolved_requirements: Array.isArray(
      item.unresolved_requirements,
    )
      ? item.unresolved_requirements
      : [],
    camera:
      record(item.camera) ?? {},
    lights:
      record(item.lights) ?? {},
    timeline: Array.isArray(item.timeline)
      ? item.timeline
      : [],
    created_at:
      typeof item.created_at === "string"
        ? item.created_at
        : now,
    updated_at: now,
  };

  return errors.length
    ? { ok: false, errors }
    : { ok: true, scene };
}
