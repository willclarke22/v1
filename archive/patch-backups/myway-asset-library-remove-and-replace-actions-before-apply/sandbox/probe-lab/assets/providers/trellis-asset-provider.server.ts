import path from "node:path";

import type { MyWayAssetRecord } from "../asset-types";
import { registerMyWayAsset } from "../asset-library.server";
import { createNormalizeJob } from "../blender/blender-job-store.server";
import { runBlenderJob } from "../blender/blender-bridge.server";
import { hashFile } from "../content-hash.server";
import { safeAssetId } from "../normalize-asset-record";
import {
  ensureAssetDirectories,
  projectPath,
} from "../paths.server";
import { requestTrellisGlb } from "./trellis-provider.server";

function compactTrellisPrompt(input: {
  concept: string;
  semanticTags?: string[];
  styleTags?: string[];
}) {
  const values = [
    input.concept,
    ...(input.styleTags ?? []),
    ...(input.semanticTags ?? []),
  ];

  const parts: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");

    if (!normalized) continue;

    const key = normalized.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);

    const candidate = [...parts, normalized].join(", ");

    if (candidate.length <= 77) {
      parts.push(normalized);
      continue;
    }

    if (parts.length === 0) {
      parts.push(normalized.slice(0, 77).trim());
    }

    break;
  }

  return parts.join(", ").slice(0, 77).trim();
}

export async function acquireFromTrellis(input: {
  concept: string;
  semanticTags?: string[];
  styleTags?: string[];
  domain?: string;
  targetExtentM?: number;
  noTexture?: boolean;
  seed?: number;
  maxAttempts?: number;
}) {
  await ensureAssetDirectories();

  const baseId =
    safeAssetId(input.concept) || `trellis_${Date.now()}`;
  const assetId = `${baseId}_tr_${Date.now().toString(36)}`;
  const inboxPath = projectPath(
    "sandbox/probe-lab/assets/inbox/trellis",
    `${assetId}-raw.glb`,
  );
  const outputPath = projectPath(
    "public/sandbox-assets/myway/models/trellis",
    `${assetId}.glb`,
  );
  const thumbnailPath = projectPath(
    "public/sandbox-assets/myway/thumbnails",
    `${assetId}.png`,
  );

  const prompt = compactTrellisPrompt(input);

  const generated = await requestTrellisGlb({
    prompt,
    destinationPath: inboxPath,
    noTexture: input.noTexture,
    seed: input.seed,
    maxAttempts: input.maxAttempts,
  });

  const { jobPath } = await createNormalizeJob({
    kind: "normalize_asset",
    input_path: inboxPath,
    output_path: outputPath,
    thumbnail_path: thumbnailPath,
    target_extent_m: input.targetExtentM ?? 2,
    source_type: "trellis",
    result: null,
    error: null,
  });

  const completed = await runBlenderJob(jobPath);

  if (!completed.result) {
    throw new Error(
      "Blender completed without returning normalized TRELLIS metadata.",
    );
  }

  const result = completed.result;
  const record: MyWayAssetRecord = {
    asset_id: assetId,
    canonical_label: input.concept.toLowerCase(),
    display_name: input.concept,
    aliases: [],
    semantic_tags: [
      input.concept,
      ...(input.semanticTags ?? []),
    ],
    style_tags: input.styleTags ?? [],
    asset_type: "glb",
    domain: input.domain ?? "generic",
    source_type: "trellis",
    source_asset_id: null,
    source_prompt: generated.prompt,
    source_url: "https://build.nvidia.com/microsoft/trellis",
    source_path: path
      .relative(process.cwd(), inboxPath)
      .replace(/\\/g, "/"),
    public_path:
      `/sandbox-assets/myway/models/trellis/${assetId}.glb`,
    thumbnail_path:
      `/sandbox-assets/myway/thumbnails/${assetId}.png`,
    license_record_path: null,
    dimensions_m: result.dimensions_m,
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    polygon_count: result.polygon_count,
    rigged: result.rigged,
    animation_clips: result.animation_clips,
    content_hash: await hashFile(outputPath),
    quality_score: 0.68,
    reuse_count: 0,
    license_kind: "unknown",
    license_status: "sandbox_only",
    commercial_use_allowed: false,
    raw_redistribution_allowed: false,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: false,
    status: "normalized",
    notes:
      "Generated with NVIDIA-hosted Microsoft TRELLIS and normalized " +
      `by Blender. no_texture=${generated.no_texture}; ` +
      `NVIDIA attempts=${generated.attempts}. Review output and license ` +
      "before production promotion.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return registerMyWayAsset(record);
}
