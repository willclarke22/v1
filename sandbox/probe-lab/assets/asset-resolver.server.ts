import { writeFile } from "node:fs/promises";

import type {
  AssetMatchScoreBreakdown,
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

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenList(
  value: string | string[] | undefined,
) {
  const source = Array.isArray(value)
    ? value.join(" ")
    : value ?? "";

  return normalizePhrase(source)
    .split(" ")
    .filter(Boolean);
}

function singular(value: string) {
  return value.endsWith("s") && value.length > 4
    ? value.slice(0, -1)
    : value;
}

const TOKEN_EQUIVALENCE_GROUPS = [
  ["mug", "cup"],
  ["sofa", "couch"],
  ["refrigerator", "fridge"],
  ["automobile", "car"],
  ["television", "tv"],
  ["trash", "garbage"],
  ["bin", "can"],
  ["stool", "seat"],
  ["flashlight", "torch"],
  ["sneaker", "shoe"],
] as const;

function equivalentToken(a: string, b: string) {
  return TOKEN_EQUIVALENCE_GROUPS.some(
    (group) =>
      group.includes(a as never) &&
      group.includes(b as never),
  );
}

function tokenMatches(a: string, b: string) {
  if (a === b) return true;

  const left = singular(a);
  const right = singular(b);

  if (left === right) return true;
  if (equivalentToken(left, right)) return true;

  return (
    left.length >= 4 &&
    right.length >= 4 &&
    (left.includes(right) ||
      right.includes(left))
  );
}

function unique(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(normalizePhrase)
        .filter(Boolean),
    ),
  );
}

function effectiveCanonicalLabel(
  asset: MyWayAssetRecord,
) {
  return (
    asset.verified_canonical_label?.trim() ||
    asset.canonical_label
  );
}

function verifiedIdentityPhrases(
  asset: MyWayAssetRecord,
) {
  if (
    asset.semantic_review_status === "verified"
  ) {
    return unique([
      effectiveCanonicalLabel(asset),
      ...(asset.verified_aliases ?? []),
    ]);
  }

  return unique([
    asset.source_display_name ??
      asset.display_name,
  ]);
}

function searchableTokens(asset: MyWayAssetRecord) {
  return tokenList([
    ...verifiedIdentityPhrases(asset),
    ...asset.semantic_tags,
    ...asset.style_tags,
    ...(asset.affordances ?? []),
    ...(asset.contains ?? []),
  ]);
}

function coreConceptToken(request: AssetResolveRequest) {
  const conceptTokens = tokenList(
    request.concept,
  );
  const meaningful = conceptTokens.filter(
    (token) =>
      !LOW_INFORMATION_TOKENS.has(token),
  );

  return (
    (meaningful.length
      ? meaningful
      : conceptTokens
    ).at(-1) ?? null
  );
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

function exactPhraseScore(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const concept = normalizePhrase(request.concept);
  const aliases = unique(request.aliases ?? []);
  const canonical = normalizePhrase(
    effectiveCanonicalLabel(asset),
  );
  const verifiedAliases = unique(
    asset.verified_aliases ?? [],
  );
  const sourceName = normalizePhrase(
    asset.source_display_name ??
      asset.display_name,
  );

  if (concept === canonical) return 80;
  if (verifiedAliases.includes(concept)) return 68;
  if (aliases.includes(canonical)) return 62;
  if (
    asset.semantic_review_status !== "verified" &&
    concept === sourceName
  ) {
    return 55;
  }

  if (
    canonical &&
    (` ${concept} `.includes(` ${canonical} `) ||
      ` ${canonical} `.includes(` ${concept} `))
  ) {
    return 38;
  }

  return 0;
}

function performancePenalty(
  asset: MyWayAssetRecord,
) {
  const bytes = asset.file_size_bytes ?? 0;
  if (bytes <= 20 * 1024 * 1024) return 0;
  if (bytes <= 50 * 1024 * 1024) return 5;
  if (bytes <= 100 * 1024 * 1024) return 12;
  if (bytes <= 200 * 1024 * 1024) return 22;
  return 34;
}

function scoreAsset(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
): AssetMatchScoreBreakdown {
  const wanted = [
    ...tokenList(request.concept),
    ...tokenList(request.aliases),
    ...tokenList(request.semantic_tags),
    ...tokenList(request.style_tags),
  ];
  const searchable = searchableTokens(asset);

  let verifiedIdentity = 0;
  for (const wantedToken of wanted) {
    if (searchable.includes(wantedToken)) {
      verifiedIdentity += 5;
    } else if (
      searchable.some((candidate) =>
        tokenMatches(wantedToken, candidate),
      )
    ) {
      verifiedIdentity += 2;
    }
  }
  verifiedIdentity = Math.min(
    42,
    verifiedIdentity,
  );

  const exactPhrase =
    exactPhraseScore(asset, request);

  const requiredAffordances = unique(
    request.required_affordances ?? [],
  );
  const assetAffordances = unique(
    asset.affordances ?? [],
  );
  const semanticRole = requiredAffordances.reduce(
    (score, affordance) =>
      score +
      (assetAffordances.includes(affordance)
        ? 14
        : -10),
    0,
  );

  let sceneContext = 0;
  if (
    request.domain &&
    asset.domain ===
      request.domain.trim().toLowerCase()
  ) {
    sceneContext += 8;
  }

  const requestedStyles = unique(
    request.style_tags ?? [],
  );
  const assetStyles = unique(asset.style_tags);
  sceneContext += requestedStyles.filter(
    (style) => assetStyles.includes(style),
  ).length * 2;

  let structuralFit = 0;
  if (
    request.desired_composition &&
    request.desired_composition !== "unknown"
  ) {
    structuralFit +=
      asset.object_composition ===
      request.desired_composition
        ? 12
        : -12;
  }

  const quality =
    (asset.scene_review_status === "approved"
      ? 8
      : 0) +
    (asset.semantic_review_status === "verified"
      ? 14
      : 0) +
    asset.quality_score * 8 +
    Math.min(asset.reuse_count, 20) * 0.12;

  const normalizedConcept =
    normalizePhrase(request.concept);
  const preferredBonus =
    (request.preferred_asset_id ===
    asset.asset_id
      ? 160
      : 0) +
    ((asset.preferred_for_concepts ?? [])
      .map(normalizePhrase)
      .includes(normalizedConcept)
      ? 100
      : 0);

  const penalty = performancePenalty(asset);

  let contradictionPenalty = 0;
  const core = coreConceptToken(request);
  if (
    core &&
    !verifiedIdentityPhrases(asset)
      .flatMap(tokenList)
      .some((token) =>
        tokenMatches(core, token),
      )
  ) {
    contradictionPenalty += 45;
  }

  if (
    asset.semantic_review_status === "mismatch" ||
    asset.semantic_review_status === "rejected"
  ) {
    contradictionPenalty += 100;
  }

  const total =
    verifiedIdentity +
    exactPhrase +
    semanticRole +
    sceneContext +
    structuralFit +
    quality +
    preferredBonus -
    penalty -
    contradictionPenalty;

  return {
    asset_id: asset.asset_id,
    verified_identity: verifiedIdentity,
    exact_phrase: exactPhrase,
    semantic_role: semanticRole,
    scene_context: sceneContext,
    structural_fit: structuralFit,
    quality,
    preferred_bonus: preferredBonus,
    performance_penalty: penalty,
    contradiction_penalty: contradictionPenalty,
    total,
  };
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

function pendingReviewWarning(
  asset: MyWayAssetRecord,
) {
  return `Asset ${asset.asset_id} was acquired, but it remains scene-review and semantic-review pending. Inspect and verify it in the Asset Library before automatic scene composition may select it.`;
}

export async function resolveMyWayAsset(
  request: AssetResolveRequest,
): Promise<AssetResolveResult> {
  const warnings: string[] = [];
  const attempts: AssetResolveResult["attempts"] = [];
  const requireSceneApproved =
    request.require_scene_approved !== false;
  const requireSemanticVerified =
    request.require_semantic_verified ??
    requireSceneApproved;
  const minimumScore = Math.max(
    12,
    Math.min(
      500,
      request.minimum_match_score ?? 48,
    ),
  );
  const minimumMargin = Math.max(
    0,
    Math.min(
      100,
      request.minimum_match_margin ?? 6,
    ),
  );
  const candidateLimit = Math.max(
    1,
    Math.min(10, request.candidate_limit ?? 5),
  );

  const candidates = await Promise.all(
    (await listMyWayAssets())
      .filter(
        (asset) =>
          asset.safe_to_use_in_sandbox &&
          asset.status !== "rejected" &&
          (!requireSceneApproved ||
            asset.scene_review_status === "approved") &&
          (!requireSemanticVerified ||
            asset.semantic_review_status === "verified") &&
          hasCoreConceptMatch(asset, request),
      )
      .map(async (asset) => ({
        asset,
        score: scoreAsset(asset, request),
        file: await assetWithFileStats(asset),
      })),
  );

  const ranked = candidates
    .filter(
      (candidate) =>
        candidate.file.file_stats.exists,
    )
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        a.asset.asset_id.localeCompare(
          b.asset.asset_id,
        ),
    );

  const candidateScores = ranked
    .slice(0, candidateLimit)
    .map((candidate) => candidate.score);
  const existing = ranked[0];
  const runnerUp = ranked[1];
  const margin =
    existing && runnerUp
      ? existing.score.total -
        runnerUp.score.total
      : existing
        ? existing.score.total
        : null;
  const isExplicitlyPreferred =
    existing &&
    (request.preferred_asset_id ===
      existing.asset.asset_id ||
      (existing.asset.preferred_for_concepts ?? [])
        .map(normalizePhrase)
        .includes(
          normalizePhrase(request.concept),
        ));

  if (
    !request.force_refresh &&
    existing &&
    existing.score.total >= minimumScore &&
    (isExplicitlyPreferred ||
      margin == null ||
      margin >= minimumMargin)
  ) {
    const asset =
      (await touchAssetReuse(
        existing.asset.asset_id,
      )) ?? existing.asset;
    const result: AssetResolveResult = {
      ok: true,
      source: "library",
      asset,
      warnings,
      attempts,
      match_score: existing.score.total,
      match_margin: margin,
      candidate_scores: candidateScores,
      requires_scene_review: false,
    };
    await debug(result, request);
    return result;
  }

  if (existing && existing.score.total < minimumScore) {
    warnings.push(
      `The best verified library match scored ${existing.score.total.toFixed(1)}, below the required ${minimumScore}.`,
    );
  } else if (
    existing &&
    !isExplicitlyPreferred &&
    margin != null &&
    margin < minimumMargin
  ) {
    warnings.push(
      `The top two verified library candidates were too close (${margin.toFixed(1)} point margin; ${minimumMargin} required). Mark a preferred asset for this concept or improve the identity metadata.`,
    );
  } else if (
    requireSceneApproved ||
    requireSemanticVerified
  ) {
    warnings.push(
      "No scene-approved, semantically verified library asset passed identity and file checks.",
    );
  }

  if (request.allow_blenderkit !== false) {
    try {
      const registered =
        await acquireFromBlenderKit({
          concept: request.concept,
          aliases: request.aliases,
          semanticTags:
            request.semantic_tags,
          styleTags: request.style_tags,
          domain: request.domain,
          targetExtentM:
            request.target_extent_m,
        });
      attempts.push({
        source: "blenderkit",
        ok: true,
      });

      if (
        requireSceneApproved ||
        requireSemanticVerified
      ) {
        warnings.push(
          pendingReviewWarning(
            registered.asset,
          ),
        );
      }

      const result: AssetResolveResult = {
        ok: true,
        source: "blenderkit",
        asset: registered.asset,
        warnings,
        attempts,
        match_score: null,
        match_margin: null,
        candidate_scores: candidateScores,
        requires_scene_review:
          requireSceneApproved ||
          requireSemanticVerified,
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
      const registered =
        await acquireFromTrellis({
          concept: request.concept,
          semanticTags:
            request.semantic_tags,
          styleTags: request.style_tags,
          domain: request.domain,
          targetExtentM:
            request.target_extent_m,
        });
      attempts.push({
        source: "trellis",
        ok: true,
      });

      if (
        requireSceneApproved ||
        requireSemanticVerified
      ) {
        warnings.push(
          pendingReviewWarning(
            registered.asset,
          ),
        );
      }

      const result: AssetResolveResult = {
        ok: true,
        source: "trellis",
        asset: registered.asset,
        warnings,
        attempts,
        match_score: null,
        match_margin: null,
        candidate_scores: candidateScores,
        requires_scene_review:
          requireSceneApproved ||
          requireSemanticVerified,
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
      warnings.push(
        `TRELLIS generation failed. ${error}`,
      );
    }
  }


  if (request.allow_primitive_fallback === true) {
    warnings.push(
      "Primitive asset fallbacks are disabled. Missing assets remain unresolved until a library asset or generated asset is available.",
    );
  }

  const result: AssetResolveResult = {
    ok: false,
    source: "none",
    asset: null,
    warnings,
    attempts,
    match_score: null,
    match_margin: null,
    candidate_scores: candidateScores,
    requires_scene_review: false,
  };
  await debug(result, request);
  return result;
}
