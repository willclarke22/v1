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
import {
  appearanceAcquisitionTerms,
  normalizeAppearanceRequest,
} from "./appearance-request";
import {
  evaluateAppearanceRanking,
  type AssetAppearanceEvaluation,
} from "./appearance-ranking.server";
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

function tokenList(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value.join(" ") : value ?? "";

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
    (group) => group.includes(a as never) && group.includes(b as never),
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
    (left.includes(right) || right.includes(left))
  );
}

function unique(values: string[]) {
  return Array.from(
    new Set(values.map(normalizePhrase).filter(Boolean)),
  );
}

function effectiveCanonicalLabel(asset: MyWayAssetRecord) {
  return asset.verified_canonical_label?.trim() || asset.canonical_label;
}

function identityPhrases(asset: MyWayAssetRecord) {
  if (asset.semantic_review_status === "verified") {
    return unique([
      effectiveCanonicalLabel(asset),
      ...(asset.verified_aliases ?? []),
      ...asset.aliases,
    ]);
  }

  return unique([
    asset.source_display_name ?? asset.display_name,
  ]);
}

function identityTokens(asset: MyWayAssetRecord) {
  return tokenList(identityPhrases(asset));
}

function coreConceptToken(request: AssetResolveRequest) {
  const conceptTokens = tokenList(request.concept);
  const meaningful = conceptTokens.filter(
    (token) => !LOW_INFORMATION_TOKENS.has(token),
  );

  return (meaningful.length ? meaningful : conceptTokens).at(-1) ?? null;
}

function hasCoreConceptMatch(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const core = coreConceptToken(request);
  if (!core) return false;

  return identityTokens(asset).some((token) => tokenMatches(core, token));
}

function hasRequiredAffordances(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const required = unique(request.required_affordances ?? []);
  if (!required.length) return true;

  const available = unique(asset.affordances ?? []);
  return required.every((item) => available.includes(item));
}

function hasRequiredComposition(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const desired = request.desired_composition;
  if (!desired || desired === "unknown") return true;

  const actual =
    asset.object_composition ?? "unknown";

  // Phase 1 migrated many verified single-object assets before composition was
  // explicitly reviewed. Treat unknown as compatible with a separate-object
  // request, but do not let it satisfy object-set or environment requirements.
  if (desired === "single_object") {
    return (
      actual === "single_object" ||
      actual === "unknown"
    );
  }

  return actual === desired;
}

function isEligible(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
  requireSceneApproved: boolean,
  requireSemanticVerified: boolean,
) {
  return (
    asset.safe_to_use_in_sandbox &&
    asset.status !== "rejected" &&
    (!requireSceneApproved || asset.scene_review_status === "approved") &&
    (!requireSemanticVerified || asset.semantic_review_status === "verified") &&
    hasCoreConceptMatch(asset, request) &&
    hasRequiredAffordances(asset, request) &&
    hasRequiredComposition(asset, request)
  );
}

function exactPhraseScore(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
) {
  const concept = normalizePhrase(request.concept);
  const aliases = unique(request.aliases ?? []);
  const canonical = normalizePhrase(effectiveCanonicalLabel(asset));
  const verifiedAliases = unique(asset.verified_aliases ?? []);
  const sourceName = normalizePhrase(
    asset.source_display_name ?? asset.display_name,
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

function performancePenalty(asset: MyWayAssetRecord) {
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
  appearance?: AssetAppearanceEvaluation,
): AssetMatchScoreBreakdown {
  const wanted = [
    ...tokenList(request.concept),
    ...tokenList(request.aliases),
  ];
  const searchable = identityTokens(asset);

  let verifiedIdentity = 0;
  for (const wantedToken of wanted) {
    if (searchable.includes(wantedToken)) {
      verifiedIdentity += 5;
    } else if (
      searchable.some((candidate) => tokenMatches(wantedToken, candidate))
    ) {
      verifiedIdentity += 2;
    }
  }
  verifiedIdentity = Math.min(42, verifiedIdentity);

  const exactPhrase = exactPhraseScore(asset, request);
  const requiredAffordances = unique(request.required_affordances ?? []);
  const semanticRole = requiredAffordances.length * 14;

  let sceneContext = 0;
  if (
    request.domain &&
    asset.domain === request.domain.trim().toLowerCase()
  ) {
    sceneContext += 8;
  }

  const actualComposition =
    asset.object_composition ?? "unknown";
  const structuralFit =
    request.desired_composition &&
    request.desired_composition !== "unknown" &&
    actualComposition === request.desired_composition
      ? 12
      : 0;

  const quality =
    (asset.scene_review_status === "approved" ? 8 : 0) +
    (asset.semantic_review_status === "verified" ? 14 : 0) +
    asset.quality_score * 8 +
    Math.min(asset.reuse_count, 20) * 0.12;

  const normalizedConcept = normalizePhrase(request.concept);
  const preferredBonus =
    (request.preferred_asset_id === asset.asset_id ? 160 : 0) +
    ((asset.preferred_for_concepts ?? [])
      .map(normalizePhrase)
      .includes(normalizedConcept)
      ? 100
      : 0);

  const penalty = performancePenalty(asset);
  const contradictionPenalty =
    asset.semantic_review_status === "mismatch" ||
    asset.semantic_review_status === "rejected"
      ? 100
      : 0;

  const appearanceAdjustment =
    appearance?.adjustment ?? 0;
  const requiredAppearancePenalty =
    appearance && !appearance.eligible
      ? 180
      : 0;
  const total =
    verifiedIdentity +
    exactPhrase +
    semanticRole +
    sceneContext +
    structuralFit +
    quality +
    preferredBonus +
    appearanceAdjustment -
    penalty -
    contradictionPenalty -
    requiredAppearancePenalty;

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
    contradiction_penalty:
      contradictionPenalty +
      requiredAppearancePenalty,
    appearance_eligible:
      appearance?.eligible ?? true,
    appearance_status:
      appearance?.status ?? "not_requested",
    appearance_similarity:
      appearance?.similarity ?? null,
    appearance_similarity_bonus:
      appearance?.similarity_bonus ?? 0,
    required_trait_matches:
      appearance?.required_trait_matches ?? [],
    required_trait_unknown:
      appearance?.required_trait_unknown ?? [],
    required_trait_conflicts:
      appearance?.required_trait_conflicts ?? [],
    preferred_trait_matches:
      appearance?.preferred_trait_matches ?? [],
    avoid_trait_matches:
      appearance?.avoid_trait_matches ?? [],
    appearance_trait_bonus:
      appearance?.trait_bonus ?? 0,
    appearance_penalty:
      appearance?.penalty ?? 0,
    appearance_summary:
      appearance?.summary ?? null,
    total,
  };
}

function acquisitionSearchQuery(
  request: AssetResolveRequest,
) {
  const appearance = normalizeAppearanceRequest(
    request.appearance_request,
  );
  const terms = appearanceAcquisitionTerms(
    appearance,
  );
  const shortTraits = terms
    .flatMap((value) =>
      value
        .replace(/[^a-zA-Z0-9 -]+/g, " ")
        .trim()
        .split(/[,;]+/),
    )
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2);

  return [
    request.concept.trim(),
    ...shortTraits,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 140);
}

function failureReasonForRequest(input: {
  request: AssetResolveRequest;
  allAssets: MyWayAssetRecord[];
  requireSceneApproved: boolean;
  requireSemanticVerified: boolean;
  fileCheckedCandidateCount: number;
  rankedCandidateCount: number;
  appearanceEvaluations: AssetAppearanceEvaluation[];
}) {
  const identityMatches = input.allAssets.filter((asset) =>
    hasCoreConceptMatch(asset, input.request),
  );

  if (!identityMatches.length) {
    return `No registered asset matched the verified identity "${input.request.concept}". Identity matching is case-insensitive, so capitalization was not the cause.`;
  }

  const safeMatches = identityMatches.filter(
    (asset) =>
      asset.safe_to_use_in_sandbox &&
      asset.status !== "rejected",
  );
  if (!safeMatches.length) {
    return `A matching ${input.request.concept} exists, but it is rejected or not marked safe for sandbox use.`;
  }

  const reviewMatches = safeMatches.filter(
    (asset) =>
      (!input.requireSceneApproved ||
        asset.scene_review_status === "approved") &&
      (!input.requireSemanticVerified ||
        asset.semantic_review_status === "verified"),
  );
  if (!reviewMatches.length) {
    const statuses = safeMatches
      .map(
        (asset) =>
          `${asset.asset_id} (semantic ${asset.semantic_review_status ?? "pending"}; scene ${asset.scene_review_status ?? "pending"})`,
      )
      .slice(0, 3)
      .join(", ");
    return `A matching ${input.request.concept} exists but has not passed every required review: ${statuses}. Use Save identity & verify, then approve it for scene use.`;
  }

  const affordanceMatches = reviewMatches.filter((asset) =>
    hasRequiredAffordances(asset, input.request),
  );
  if (!affordanceMatches.length) {
    return `Approved ${input.request.concept} asset(s) exist, but none provide the required affordances: ${(input.request.required_affordances ?? []).join(", ") || "unspecified capability"}.`;
  }

  const compositionMatches = affordanceMatches.filter((asset) =>
    hasRequiredComposition(asset, input.request),
  );
  if (!compositionMatches.length) {
    return `Approved ${input.request.concept} asset(s) exist, but their composition metadata does not satisfy ${input.request.desired_composition ?? "the requested composition"}.`;
  }

  if (input.fileCheckedCandidateCount < 1) {
    return `Approved ${input.request.concept} metadata exists, but its GLB file could not be found or loaded.`;
  }

  if (input.rankedCandidateCount < 1) {
    const conflicts = input.appearanceEvaluations
      .flatMap((evaluation) =>
        evaluation.required_trait_conflicts.map(
          (conflict) =>
            `${evaluation.asset_id}: ${conflict}`,
        ),
      )
      .slice(0, 4);
    return conflicts.length
      ? `Approved identity matches were blocked by required appearance conflicts: ${conflicts.join("; ")}.`
      : `Approved ${input.request.concept} candidates were found, but none remained eligible after appearance checks.`;
  }

  return `A matching ${input.request.concept} was found, but it did not meet the resolver score or confidence margin. Review the candidate scores in latest-asset-resolution.json.`;
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
  return `Asset ${asset.asset_id} was acquired, but it remains scene-review and semantic-review pending. Inspect and verify it in the Asset Library before automatic scene composition may select it.`;
}

export async function resolveMyWayAsset(
  request: AssetResolveRequest,
): Promise<AssetResolveResult> {
  const warnings: string[] = [];
  const attempts: AssetResolveResult["attempts"] = [];
  const requireSceneApproved = request.require_scene_approved !== false;
  const requireSemanticVerified =
    request.require_semantic_verified ?? requireSceneApproved;
  const minimumScore = Math.max(
    12,
    Math.min(500, request.minimum_match_score ?? 48),
  );
  const minimumMargin = Math.max(
    0,
    Math.min(100, request.minimum_match_margin ?? 6),
  );
  const candidateLimit = Math.max(
    1,
    Math.min(10, request.candidate_limit ?? 5),
  );

  // Stage 1: strict identity, utility, review, composition, and file
  // eligibility. Appearance never makes an otherwise invalid asset eligible.
  const allAssets = await listMyWayAssets();
  const fileCheckedCandidates = (
    await Promise.all(
      allAssets
        .filter((asset) =>
          isEligible(
            asset,
            request,
            requireSceneApproved,
            requireSemanticVerified,
          ),
        )
        .map(async (asset) => ({
          asset,
          file: await assetWithFileStats(asset),
        })),
    )
  ).filter(
    (candidate) =>
      candidate.file.file_stats.exists,
  );

  // Stage 2: compare appearance only inside the already valid identity set.
  // Missing, stale, or corrupt vectors fall back to the original deterministic
  // identity/quality ranking.
  const appearanceRanking =
    await evaluateAppearanceRanking({
      concept: request.concept,
      request: request.appearance_request,
      candidates: fileCheckedCandidates.map(
        (candidate) => candidate.asset,
      ),
      enabled:
        request.appearance_ranking !== false,
    });
  warnings.push(
    ...appearanceRanking.warnings,
  );
  const appearanceByAssetId = new Map(
    appearanceRanking.evaluations.map(
      (evaluation) => [
        evaluation.asset_id,
        evaluation,
      ],
    ),
  );
  const scoredCandidates =
    fileCheckedCandidates.map(
      (candidate) => {
        const appearance =
          appearanceByAssetId.get(
            candidate.asset.asset_id,
          );
        return {
          ...candidate,
          appearance,
          score: scoreAsset(
            candidate.asset,
            request,
            appearance,
          ),
        };
      },
    );
  const ranked = scoredCandidates
    .filter(
      (candidate) =>
        candidate.appearance?.eligible !== false,
    )
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        a.asset.asset_id.localeCompare(
          b.asset.asset_id,
        ),
    );
  const diagnosticCandidates =
    [...scoredCandidates].sort(
      (a, b) =>
        b.score.total - a.score.total ||
        a.asset.asset_id.localeCompare(
          b.asset.asset_id,
        ),
    );
  const candidateScores =
    diagnosticCandidates
      .slice(0, candidateLimit)
      .map((candidate) => candidate.score);
  const existing = ranked[0];
  const runnerUp = ranked[1];
  const margin =
    existing && runnerUp
      ? existing.score.total - runnerUp.score.total
      : existing
        ? existing.score.total
        : null;
  const isExplicitlyPreferred =
    existing &&
    (request.preferred_asset_id === existing.asset.asset_id ||
      (existing.asset.preferred_for_concepts ?? [])
        .map(normalizePhrase)
        .includes(normalizePhrase(request.concept)));

  if (
    !request.force_refresh &&
    existing &&
    existing.score.total >= minimumScore &&
    (isExplicitlyPreferred || margin == null || margin >= minimumMargin)
  ) {
    const asset =
      request.record_reuse === false
        ? existing.asset
        : (await touchAssetReuse(
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
      appearance_ranking:
        appearanceRanking.diagnostics,
      failure_reason: null,
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
  } else if (requireSceneApproved || requireSemanticVerified) {
    warnings.push(
      "No scene-approved, semantically verified library asset passed identity, utility, composition, and file checks.",
    );
  }

  if (request.allow_blenderkit !== false) {
    try {
      const registered = await acquireFromBlenderKit({
        concept: request.concept,
        aliases: request.aliases,
        semanticTags: request.semantic_tags,
        acquisitionTerms:
          appearanceAcquisitionTerms(
            appearanceRanking.request,
          ),
        searchQuery:
          acquisitionSearchQuery(request),
        domain: request.domain,
        targetExtentM: request.target_extent_m,
      });
      attempts.push({ source: "blenderkit", ok: true });

      if (requireSceneApproved || requireSemanticVerified) {
        warnings.push(pendingReviewWarning(registered.asset));
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
        appearance_ranking:
          appearanceRanking.diagnostics,
        failure_reason: null,
        requires_scene_review:
          requireSceneApproved || requireSemanticVerified,
      };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      attempts.push({ source: "blenderkit", ok: false, error });
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
        acquisitionTerms: [
          ...appearanceAcquisitionTerms(
            appearanceRanking.request,
          ),
          "complete object",
          "clean detailed geometry",
          "accurate proportions",
        ],
        domain: request.domain,
        targetExtentM: request.target_extent_m,
      });
      attempts.push({ source: "trellis", ok: true });

      if (requireSceneApproved || requireSemanticVerified) {
        warnings.push(pendingReviewWarning(registered.asset));
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
        appearance_ranking:
          appearanceRanking.diagnostics,
        failure_reason: null,
        requires_scene_review:
          requireSceneApproved || requireSemanticVerified,
      };
      await debug(result, request);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      attempts.push({ source: "trellis", ok: false, error });
      warnings.push(`TRELLIS generation failed. ${error}`);
    }
  }

  if (request.allow_primitive_fallback === true) {
    warnings.push(
      "Primitive asset fallbacks are disabled. Missing assets remain unresolved until a library asset or generated asset is available.",
    );
  }

  const failureReason = failureReasonForRequest({
    request,
    allAssets,
    requireSceneApproved,
    requireSemanticVerified,
    fileCheckedCandidateCount:
      fileCheckedCandidates.length,
    rankedCandidateCount: ranked.length,
    appearanceEvaluations:
      appearanceRanking.evaluations,
  });
  if (!warnings.includes(failureReason)) {
    warnings.push(failureReason);
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
    appearance_ranking:
      appearanceRanking.diagnostics,
    failure_reason: failureReason,
    requires_scene_review: false,
  };
  await debug(result, request);
  return result;
}
