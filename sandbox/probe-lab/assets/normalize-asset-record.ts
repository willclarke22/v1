import type { MyWayAssetRecord, Vec3 } from "./asset-types";

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, all) => all.indexOf(item) === index);
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? number : fallback[index];
  }) as Vec3;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeAssetId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

export function normalizeMyWayAssetRecord(raw: unknown): MyWayAssetRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const assetId = safeAssetId(String(item.asset_id ?? ""));
  const publicPath = typeof item.public_path === "string" ? item.public_path.trim() : "";
  if (!assetId || !publicPath) return null;

  const now = new Date().toISOString();
  const sourceType = ["blenderkit", "trellis", "manual", "procedural"].includes(String(item.source_type))
    ? (item.source_type as MyWayAssetRecord["source_type"])
    : "manual";
  const status = ["inbox", "normalized", "approved", "rejected"].includes(String(item.status))
    ? (item.status as MyWayAssetRecord["status"])
    : "normalized";
  const licenseKind = ["cc0", "royalty_free", "self_owned", "unknown"].includes(String(item.license_kind))
    ? (item.license_kind as MyWayAssetRecord["license_kind"])
    : "unknown";
  const licenseStatus = ["recorded", "needs_review", "sandbox_only", "app_ready"].includes(String(item.license_status))
    ? (item.license_status as MyWayAssetRecord["license_status"])
    : "needs_review";

  const label = String(item.canonical_label ?? item.display_name ?? assetId).trim() || assetId;
  return {
    asset_id: assetId,
    canonical_label: label.toLowerCase(),
    display_name: String(item.display_name ?? label).trim() || label,
    aliases: stringList(item.aliases),
    semantic_tags: stringList(item.semantic_tags),
    style_tags: stringList(item.style_tags),
    asset_type: item.asset_type === "gltf" || item.asset_type === "primitive" ? item.asset_type : "glb",
    domain: String(item.domain ?? "generic").trim().toLowerCase() || "generic",
    source_type: sourceType,
    source_asset_id: typeof item.source_asset_id === "string" ? item.source_asset_id : null,
    source_prompt: typeof item.source_prompt === "string" ? item.source_prompt : null,
    source_url: typeof item.source_url === "string" ? item.source_url : null,
    source_path: typeof item.source_path === "string" ? item.source_path : null,
    public_path: publicPath,
    thumbnail_path: typeof item.thumbnail_path === "string" ? item.thumbnail_path : null,
    license_record_path: typeof item.license_record_path === "string" ? item.license_record_path : null,
    dimensions_m: vec3(item.dimensions_m, [1, 1, 1]),
    default_scale: Math.max(0.0001, numberOr(item.default_scale, 1)),
    default_rotation: vec3(item.default_rotation, [0, 0, 0]),
    ground_offset_m: numberOr(item.ground_offset_m, 0),
    polygon_count: item.polygon_count == null ? null : Math.max(0, Math.round(numberOr(item.polygon_count, 0))),
    rigged: item.rigged === true,
    animation_clips: stringList(item.animation_clips),
    content_hash: typeof item.content_hash === "string" ? item.content_hash : null,
    quality_score: Math.max(0, Math.min(1, numberOr(item.quality_score, 0.65))),
    reuse_count: Math.max(0, Math.round(numberOr(item.reuse_count, 0))),
    license_kind: licenseKind,
    license_status: licenseStatus,
    commercial_use_allowed: item.commercial_use_allowed !== false,
    raw_redistribution_allowed: item.raw_redistribution_allowed === true,
    safe_to_use_in_sandbox: item.safe_to_use_in_sandbox !== false,
    safe_to_promote_to_app: item.safe_to_promote_to_app === true,
    status,
    notes: typeof item.notes === "string" ? item.notes : null,
    created_at: typeof item.created_at === "string" ? item.created_at : now,
    updated_at: typeof item.updated_at === "string" ? item.updated_at : now,
  };
}
