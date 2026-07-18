import { writeFile } from "node:fs/promises";

import type {
  AssetResolveRequest,
  AssetResolveResult,
  MyWayAssetRecord,
} from "./asset-types";
import {
  assetWithFileStats,
  listMyWayAssets,
  touchAssetReuse,
} from "./asset-library.server";
import { projectPath } from "./paths.server";
import { acquireFromBlenderKit } from "./providers/blenderkit-provider.server";
import { makePrimitiveFallbackAsset } from "./providers/primitive-provider";
import { acquireFromTrellis } from "./providers/trellis-asset-provider.server";

const LOW_INFORMATION_TOKENS = new Set([
  "a",
  "an",
  "the",
  "generic",
  "simple",
  "basic",
  "realistic",
  "small",
  "large",
  "medium",
  "modern",
  "classic",
  "wooden",
  "plastic",
  "metal",
  "household",
  "home",
  "indoor",
  "outdoor",
  "object",
  "model",
]);

function tokenList(
  value: string | string[] | undefined,
) {
  const source = Array.isArray(value)
    ? value.join(" ")
    : value ?? "";

  return source
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function singular(value: string) {
  return value.endsWith("s") && value.length > 4
    ? value.slice(0, -1)
    : value;
}

function tokenMatches(a: string, b: string) {
  if (a === b) return true;
  if (singular(a) === singular(b)) return true;

  return (
    a.length >= 4 &&
    b.length >= 4 &&
    (a.includes(b) || b.includes(a))
  );
}

function coreConceptToken(request: AssetResolveRequest) {
  const conceptTokens = tokenList(request.concept);
  const meaningful = conceptTokens.filter(
    (token) => !LOW_INFORMATION_TOKENS.has(token),
  );

  return (meaningful.length ? meaningful : conceptTokens).at(-1) ?? null;
}

function searchableTokens(asset: MyWayAssetRecord) {
  return tokenList([
    asset.canonical_label,
    asset.display_name,
    ...asset.aliases,
    ...asset.semantic_tags,
    ...asset.style_tags,
  ]);
}

function hasCoreConceptMatch(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const core = coreConceptToken(request);
  if (!core) return false;

  return searchableTokens(asset).some((token) =>
    tokenMatches(core, token),
  );
}

function scoreAsset(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const wanted = [
    ...tokenList(request.concept),
    ...tokenList(request.aliases),
    ...tokenList(request.semantic_tags),
    ...tokenList(request.style_tags),
  ];
  const searchable = searchableTokens(asset);

  let score = 0;

  for (const wantedToken of wanted) {
    if (searchable.includes(wantedToken)) {
      score += 8;
    } else if (
      searchable.some((candidate) =>
        tokenMatches(wantedToken, candidate),
      )
    ) {
      score += 3;
    }
  }

  if (
    request.domain &&
    asset.domain === request.domain.trim().toLowerCase()
  ) {
    score += 5;
  }

  if (asset.scene_review_status === "approved") {
    score += 8;
  }

  score += asset.quality_score * 4;
  score += Math.min(asset.reuse_count, 20) * 0.1;

  return score;
}

async function debug(
  result: AssetResolveResult,
  request: AssetResolveRequest,
) {
  await writeFile(
    projectPath(
      "sandbox/probe-lab/assets/debug/latest-asset-resolution.json",
    ),
    `${JSON.stringify(
      {
        request,
        result,
        written_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);
}

function pendingReviewWarning(asset: MyWayAssetRecord) {
  return `Asset ${asset.asset_id} was acquired, but it remains scene-review pending. It must be inspected and approved in the Asset Library before automatic scene composition may select it.`;
}

export async function resolveMyWayAsset(
  request: AssetResolveRequest,
): Promise<AssetResolveResult> {
  const warnings: string[] = [];
  const attempts: AssetResolveResult["attempts"] = [];
  const requireSceneApproved =
    request.require_scene_approved !== false;
  const minimumScore = Math.max(
    8,
    Math.min(100, request.minimum_match_score ?? 18),
  );

  const candidates = await Promise.all(
    (await listMyWayAssets())
      .filter(
        (asset) =>
          asset.safe_to_use_in_sandbox &&
          asset.status !== "rejected" &&
          (!requireSceneApproved ||
            asset.scene_review_status === "approved") &&
          hasCoreConceptMatch(asset, request),
      )
      .map(async (asset) => ({
        asset,
        score: scoreAsset(asset, request),
        file: await assetWithFileStats(asset),
      })),
  );

  const existing = candidates
    .filter((candidate) => candidate.file.file_stats.exists)
    .sort((a, b) => b.score - a.score)[0];

  if (
    !request.force_refresh &&
    existing &&
    existing.score >= minimumScore
  ) {
    const asset =
      (await touchAssetReuse(existing.asset.asset_id)) ??
      existing.asset;
    const result: AssetResolveResult = {
      ok: true,
      source: "library",
      asset,
      warnings,
      attempts,
      match_score: existing.score,
      requires_scene_review: false,
    };
    await debug(result, request);
    return result;
  }

  if (existing && existing.score < minimumScore) {
    warnings.push(
      `The best scene-approved library match scored ${existing.score.toFixed(1)}, below the required ${minimumScore}.`,
    );
  } else if (requireSceneApproved) {
    warnings.push(
      "No scene-approved library asset passed strict core-concept and file checks.",
    );
  }

  if (request.allow_blenderkit !== false) {
    try {
      const registered = await acquireFromBlenderKit({
        concept: request.concept,
        aliases: request.aliases,
        semanticTags: request.semantic_tags,
        styleTags: request.style_tags,
        domain: request.domain,
        targetExtentM: request.target_extent_m,
      });
      attempts.push({ source: "blenderkit", ok: true });

      if (requireSceneApproved) {
        warnings.push(pendingReviewWarning(registered.asset));
      }

      const result: AssetResolveResult = {
        ok: true,
        source: "blenderkit",
        asset: registered.asset,
        warnings,
        attempts,
        match_score: null,
        requires_scene_review: requireSceneApproved,
      };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error =
        caught instanceof Error
          ? caught.message
          : String(caught);
      attempts.push({
        source: "blenderkit",
        ok: false,
        error,
      });
      warnings.push(
        `BlendKit acquisition failed; TRELLIS fallback considered. ${error}`,
      );
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

      if (requireSceneApproved) {
        warnings.push(pendingReviewWarning(registered.asset));
      }

      const result: AssetResolveResult = {
        ok: true,
        source: "trellis",
        asset: registered.asset,
        warnings,
        attempts,
        match_score: null,
        requires_scene_review: requireSceneApproved,
      };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error =
        caught instanceof Error
          ? caught.message
          : String(caught);
      attempts.push({
        source: "trellis",
        ok: false,
        error,
      });
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
      match_score: null,
      requires_scene_review: false,
    };
    await debug(result, request);
    return result;
  }

  const result: AssetResolveResult = {
    ok: false,
    source: "none",
    asset: null,
    warnings,
    attempts,
    match_score: null,
    requires_scene_review: false,
  };
  await debug(result, request);
  return result;
}
