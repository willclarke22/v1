import { writeFile } from "node:fs/promises";

import type { AssetResolveRequest, AssetResolveResult, MyWayAssetRecord } from "./asset-types";
import { listMyWayAssets, touchAssetReuse } from "./asset-library.server";
import { projectPath } from "./paths.server";
import { acquireFromBlenderKit } from "./providers/blenderkit-provider.server";
import { makePrimitiveFallbackAsset } from "./providers/primitive-provider";
import { acquireFromTrellis } from "./providers/trellis-asset-provider.server";

function tokens(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value.join(" ") : value ?? "";
  return new Set(source.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function scoreAsset(asset: MyWayAssetRecord, request: AssetResolveRequest) {
  const wanted = new Set([...tokens(request.concept), ...tokens(request.aliases), ...tokens(request.semantic_tags), ...tokens(request.style_tags)]);
  const searchable = new Set([
    ...tokens(asset.canonical_label),
    ...tokens(asset.display_name),
    ...tokens(asset.aliases),
    ...tokens(asset.semantic_tags),
    ...tokens(asset.style_tags),
  ]);
  let score = 0;
  for (const token of wanted) {
    if (searchable.has(token)) score += 8;
    else if ([...searchable].some((term) => term.includes(token) || token.includes(term))) score += 2;
  }
  if (asset.status === "approved") score += 5;
  if (asset.status === "normalized") score += 3;
  score += asset.quality_score * 4;
  score += Math.min(asset.reuse_count, 20) * 0.1;
  return score;
}

async function debug(result: AssetResolveResult, request: AssetResolveRequest) {
  await writeFile(
    projectPath("sandbox/probe-lab/assets/debug/latest-asset-resolution.json"),
    `${JSON.stringify({ request, result, written_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  ).catch(() => undefined);
}

export async function resolveMyWayAsset(request: AssetResolveRequest): Promise<AssetResolveResult> {
  const warnings: string[] = [];
  const attempts: AssetResolveResult["attempts"] = [];
  const existing = (await listMyWayAssets())
    .filter((asset) => asset.safe_to_use_in_sandbox && asset.status !== "rejected")
    .map((asset) => ({ asset, score: scoreAsset(asset, request) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!request.force_refresh && existing && existing.score >= 10) {
    const asset = (await touchAssetReuse(existing.asset.asset_id)) ?? existing.asset;
    const result: AssetResolveResult = { ok: true, source: "library", asset, warnings, attempts };
    await debug(result, request);
    return result;
  }

  if (request.allow_blenderkit !== false) {
    try {
      const registered = await acquireFromBlenderKit({
        concept: request.concept,
        semanticTags: request.semantic_tags,
        styleTags: request.style_tags,
        domain: request.domain,
        targetExtentM: request.target_extent_m,
      });
      attempts.push({ source: "blenderkit", ok: true });
      const result: AssetResolveResult = { ok: true, source: "blenderkit", asset: registered.asset, warnings, attempts };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      attempts.push({ source: "blenderkit", ok: false, error });
      warnings.push(`BlendKit acquisition failed; TRELLIS fallback considered. ${error}`);
    }
  }

  if (request.allow_trellis !== false) {
    try {
      const registered = await acquireFromTrellis({
        concept: request.concept,
        semanticTags: request.semantic_tags,
        styleTags: request.style_tags,
        domain: request.domain,
        targetExtentM: request.target_extent_m,
      });
      attempts.push({ source: "trellis", ok: true });
      const result: AssetResolveResult = { ok: true, source: "trellis", asset: registered.asset, warnings, attempts };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      attempts.push({ source: "trellis", ok: false, error });
      warnings.push(`TRELLIS generation failed. ${error}`);
    }
  }

  if (request.allow_primitive_fallback !== false) {
    const result: AssetResolveResult = {
      ok: true,
      source: "primitive",
      asset: makePrimitiveFallbackAsset(request.concept),
      warnings,
      attempts,
    };
    await debug(result, request);
    return result;
  }

  const result: AssetResolveResult = { ok: false, source: "none", asset: null, warnings, attempts };
  await debug(result, request);
  return result;
}
