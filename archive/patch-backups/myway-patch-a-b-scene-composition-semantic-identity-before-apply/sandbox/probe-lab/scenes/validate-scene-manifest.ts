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
