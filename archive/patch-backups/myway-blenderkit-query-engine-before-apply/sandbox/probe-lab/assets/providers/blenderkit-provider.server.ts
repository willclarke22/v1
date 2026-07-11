import path from "node:path";

import type { MyWayAssetRecord } from "../asset-types";
import { hashFile } from "../content-hash.server";
import { registerMyWayAsset } from "../asset-library.server";
import { createBlenderKitJob } from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import { safeAssetId } from "../normalize-asset-record";
import { ensureAssetDirectories, projectPath } from "../paths.server";

function licenseKind(value: string | null | undefined): MyWayAssetRecord["license_kind"] {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("cc0")) return "cc0";
  if (normalized.includes("royalty")) return "royalty_free";
  return "unknown";
}

export async function acquireFromBlenderKit(input: {
  concept: string;
  semanticTags?: string[];
  styleTags?: string[];
  domain?: string;
  targetExtentM?: number;
}) {
  await ensureAssetDirectories();
  const baseId = safeAssetId(input.concept) || `blenderkit_${Date.now()}`;
  const assetId = `${baseId}_bk_${Date.now().toString(36)}`;
  const outputPath = projectPath("public/sandbox-assets/myway/models/blenderkit", `${assetId}.glb`);
  const thumbnailPath = projectPath("public/sandbox-assets/myway/thumbnails", `${assetId}.png`);
  const { jobPath } = await createBlenderKitJob({
    kind: "blenderkit_acquire",
    query: input.concept,
    output_path: outputPath,
    thumbnail_path: thumbnailPath,
    target_extent_m: input.targetExtentM ?? 2,
    resolution: "resolution_1K",
    free_only: true,
    result: null,
    error: null,
  });
  const completed = await runBlenderJob(jobPath);
  if (!completed.result) throw new Error("Blender completed without returning asset metadata.");
  const result = completed.result;
  const contentHash = await hashFile(outputPath);
  const sourceRecordPath = projectPath("sandbox/probe-lab/assets/library/source-records", `${assetId}.json`);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(sourceRecordPath, `${JSON.stringify(result.source_record ?? {}, null, 2)}\n`, "utf8"),
  );

  const record: MyWayAssetRecord = {
    asset_id: assetId,
    canonical_label: input.concept.toLowerCase(),
    display_name: result.source_asset_name || input.concept,
    aliases: [],
    semantic_tags: [input.concept, ...(input.semanticTags ?? [])],
    style_tags: input.styleTags ?? [],
    asset_type: "glb",
    domain: input.domain ?? "generic",
    source_type: "blenderkit",
    source_asset_id: result.source_asset_id ?? null,
    source_prompt: input.concept,
    source_url: result.source_url ?? null,
    source_path: path.relative(process.cwd(), outputPath).replace(/\\/g, "/"),
    public_path: `/sandbox-assets/myway/models/blenderkit/${assetId}.glb`,
    thumbnail_path: `/sandbox-assets/myway/thumbnails/${assetId}.png`,
    license_record_path: path.relative(process.cwd(), sourceRecordPath).replace(/\\/g, "/"),
    dimensions_m: result.dimensions_m,
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    polygon_count: result.polygon_count,
    rigged: result.rigged,
    animation_clips: result.animation_clips,
    content_hash: contentHash,
    quality_score: 0.78,
    reuse_count: 0,
    license_kind: licenseKind(result.source_license),
    license_status: result.source_license ? "recorded" : "needs_review",
    commercial_use_allowed: true,
    raw_redistribution_allowed: false,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: false,
    status: "normalized",
    notes: `Automatically acquired and normalized from BlendKit${result.source_author ? ` by ${result.source_author}` : ""}.`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return registerMyWayAsset(record);
}
