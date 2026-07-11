import type { MyWayAssetRecord } from "../asset-types";
import { safeAssetId } from "../normalize-asset-record";

export function makePrimitiveFallbackAsset(concept: string): MyWayAssetRecord {
  const now = new Date().toISOString();
  return {
    asset_id: `primitive_${safeAssetId(concept) || "object"}`,
    canonical_label: concept.toLowerCase(),
    display_name: `${concept} primitive fallback`,
    aliases: [],
    semantic_tags: [concept.toLowerCase(), "primitive_fallback"],
    style_tags: ["procedural"],
    asset_type: "primitive",
    domain: "generic",
    source_type: "procedural",
    source_asset_id: null,
    source_prompt: concept,
    source_url: null,
    source_path: null,
    public_path: "/sandbox-assets/myway/models/procedural/placeholder.glb",
    thumbnail_path: null,
    license_record_path: null,
    dimensions_m: [1, 1, 1],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    polygon_count: null,
    rigged: false,
    animation_clips: [],
    content_hash: null,
    quality_score: 0.2,
    reuse_count: 0,
    license_kind: "self_owned",
    license_status: "app_ready",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "approved",
    notes: "Runtime primitive fallback; no external file is required.",
    created_at: now,
    updated_at: now,
  };
}
