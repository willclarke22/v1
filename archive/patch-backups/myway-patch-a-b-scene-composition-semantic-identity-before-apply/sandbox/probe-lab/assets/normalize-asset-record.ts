import type {
  MyWayAssetRecord,
  MyWayAssetStorageProvider,
  Vec3,
} from "./asset-types";

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number)
      ? number
      : fallback[index];
  }) as Vec3;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function storageProvider(
  value: unknown,
  fallback: MyWayAssetStorageProvider | null,
) {
  return value === "local" || value === "r2"
    ? value
    : fallback;
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

export function normalizeMyWayAssetRecord(
  raw: unknown,
): MyWayAssetRecord | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const assetId = safeAssetId(
    String(item.asset_id ?? ""),
  );
  const publicPath =
    typeof item.public_path === "string"
      ? item.public_path.trim()
      : "";

  if (!assetId || !publicPath) return null;

  const now = new Date().toISOString();
  const sourceType = [
    "blenderkit",
    "trellis",
    "manual",
    "procedural",
  ].includes(String(item.source_type))
    ? (item.source_type as MyWayAssetRecord["source_type"])
    : "manual";

  const status = [
    "inbox",
    "normalized",
    "approved",
    "rejected",
  ].includes(String(item.status))
    ? (item.status as MyWayAssetRecord["status"])
    : "normalized";

  const sceneReviewStatus = [
    "pending",
    "approved",
    "rejected",
  ].includes(String(item.scene_review_status))
    ? (item.scene_review_status as MyWayAssetRecord["scene_review_status"])
    : "pending";

  const licenseKind = [
    "cc0",
    "royalty_free",
    "self_owned",
    "unknown",
  ].includes(String(item.license_kind))
    ? (item.license_kind as MyWayAssetRecord["license_kind"])
    : "unknown";

  const licenseStatus = [
    "recorded",
    "needs_review",
    "sandbox_only",
    "app_ready",
  ].includes(String(item.license_status))
    ? (item.license_status as MyWayAssetRecord["license_status"])
    : "needs_review";

  const label =
    String(
      item.canonical_label ??
        item.display_name ??
        assetId,
    ).trim() || assetId;

  const inferredStorageProvider =
    /^https?:\/\//i.test(publicPath)
      ? "r2"
      : "local";

  return {
    asset_id: assetId,
    canonical_label: label.toLowerCase(),
    display_name:
      String(item.display_name ?? label).trim() ||
      label,
    aliases: stringList(item.aliases),
    semantic_tags: stringList(item.semantic_tags),
    style_tags: stringList(item.style_tags),
    asset_type:
      item.asset_type === "gltf" ||
      item.asset_type === "primitive"
        ? item.asset_type
        : "glb",
    domain:
      String(item.domain ?? "generic")
        .trim()
        .toLowerCase() || "generic",

    source_type: sourceType,
    source_asset_id: nullableString(
      item.source_asset_id,
    ),
    source_prompt: nullableString(item.source_prompt),
    source_url: nullableString(item.source_url),
    source_path: nullableString(item.source_path),

    public_path: publicPath,
    thumbnail_path: nullableString(
      item.thumbnail_path,
    ),
    license_record_path: nullableString(
      item.license_record_path,
    ),

    storage_provider:
      storageProvider(
        item.storage_provider,
        inferredStorageProvider,
      ) ?? inferredStorageProvider,
    storage_object_key: nullableString(
      item.storage_object_key,
    ),
    storage_etag: nullableString(item.storage_etag),
    file_size_bytes: nullableNumber(
      item.file_size_bytes,
    ),

    thumbnail_storage_provider: storageProvider(
      item.thumbnail_storage_provider,
      item.thumbnail_path
        ? /^https?:\/\//i.test(
            String(item.thumbnail_path),
          )
          ? "r2"
          : "local"
        : null,
    ),
    thumbnail_object_key: nullableString(
      item.thumbnail_object_key,
    ),
    thumbnail_etag: nullableString(
      item.thumbnail_etag,
    ),
    thumbnail_file_size_bytes: nullableNumber(
      item.thumbnail_file_size_bytes,
    ),

    source_storage_provider: storageProvider(
      item.source_storage_provider,
      null,
    ),
    source_object_key: nullableString(
      item.source_object_key,
    ),
    source_storage_etag: nullableString(
      item.source_storage_etag,
    ),
    source_file_size_bytes: nullableNumber(
      item.source_file_size_bytes,
    ),
    source_archived_at: nullableString(
      item.source_archived_at,
    ),

    promoted_at: nullableString(item.promoted_at),
    license_review_id: nullableString(
      item.license_review_id,
    ),

    dimensions_m: vec3(
      item.dimensions_m,
      [1, 1, 1],
    ),
    default_scale: Math.max(
      0.0001,
      numberOr(item.default_scale, 1),
    ),
    default_rotation: vec3(
      item.default_rotation,
      [0, 0, 0],
    ),
    ground_offset_m: numberOr(
      item.ground_offset_m,
      0,
    ),
    polygon_count:
      item.polygon_count == null
        ? null
        : Math.max(
            0,
            Math.floor(
              numberOr(item.polygon_count, 0),
            ),
          ),
    rigged: booleanOr(item.rigged, false),
    animation_clips: stringList(
      item.animation_clips,
    ),

    content_hash: nullableString(item.content_hash),
    quality_score: Math.min(
      1,
      Math.max(
        0,
        numberOr(item.quality_score, 0.5),
      ),
    ),
    reuse_count: Math.max(
      0,
      Math.floor(numberOr(item.reuse_count, 0)),
    ),

    license_kind: licenseKind,
    license_status: licenseStatus,
    commercial_use_allowed: booleanOr(
      item.commercial_use_allowed,
      false,
    ),
    raw_redistribution_allowed: booleanOr(
      item.raw_redistribution_allowed,
      false,
    ),
    safe_to_use_in_sandbox: booleanOr(
      item.safe_to_use_in_sandbox,
      false,
    ),
    safe_to_promote_to_app: booleanOr(
      item.safe_to_promote_to_app,
      false,
    ),
    status,

    scene_review_status: sceneReviewStatus,
    scene_reviewed_at: nullableString(
      item.scene_reviewed_at,
    ),
    scene_review_notes: nullableString(
      item.scene_review_notes,
    ),

    notes: nullableString(item.notes),
    created_at:
      nullableString(item.created_at) ?? now,
    updated_at:
      nullableString(item.updated_at) ?? now,
  };
}

