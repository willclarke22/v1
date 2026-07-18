import type { MyWaySceneManifestV1 } from "./scene-manifest";

export function safeSceneId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

export function validateSceneManifest(raw: unknown): { ok: true; scene: MyWaySceneManifestV1 } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Scene must be an object."] };
  const item = raw as Record<string, unknown>;
  const sceneId = safeSceneId(String(item.scene_id ?? item.title ?? ""));
  if (!sceneId) errors.push("scene_id or title is required");
  const now = new Date().toISOString();
  const scene: MyWaySceneManifestV1 = {
    schema_version: "myway_scene_manifest_v1",
    scene_id: sceneId,
    title: String(item.title ?? sceneId),
    original_prompt: String(item.original_prompt ?? ""),
    assets: Array.isArray(item.assets) ? item.assets as MyWaySceneManifestV1["assets"] : [],
    procedural_nodes: Array.isArray(item.procedural_nodes) ? item.procedural_nodes : [],
    camera: item.camera && typeof item.camera === "object" ? item.camera as Record<string, unknown> : {},
    lights: item.lights && typeof item.lights === "object" ? item.lights as Record<string, unknown> : {},
    timeline: Array.isArray(item.timeline) ? item.timeline : [],
    created_at: typeof item.created_at === "string" ? item.created_at : now,
    updated_at: now,
  };
  return errors.length ? { ok: false, errors } : { ok: true, scene };
}
