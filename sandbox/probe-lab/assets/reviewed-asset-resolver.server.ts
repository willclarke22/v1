import { writeFile } from "node:fs/promises";

import type {
  AssetCandidateEligibilityDiagnostic,
  AssetMatchScoreBreakdown,
  AssetResolveRequest,
  AssetResolveResult,
  AssetSelectionReason,
  MyWayAssetRecord,
  MyWayAssetRegistryV2,
} from "./asset-types";
import {
  assetWithFileStats,
  loadMyWayAssetRegistry,
} from "./asset-library.server";
import {
  evaluateAppearanceRanking,
  type AssetAppearanceEvaluation,
} from "./appearance-ranking.server";
import {
  stableJsonHash,
} from "./content-hash.server";
import {
  attributionCompletenessIssues,
  isAttributionRequiredLicense,
} from "./asset-attribution";
import { projectPath } from "./paths.server";

export const REVIEWED_ASSET_RESOLVER_VERSION =
  "myway_reviewed_asset_resolver_v1" as const;

export type ReviewedAssetResolverSnapshot = {
  registry: MyWayAssetRegistryV2;
  registry_snapshot_id: string;
  registry_content_hash: string;
};

function selectionRegistryView(
  registry: MyWayAssetRegistryV2,
) {
  return {
    schema_version: registry.schema_version,
    asset_root_public_url:
      registry.asset_root_public_url,
    assets: registry.assets
      .map((asset) =>
        Object.fromEntries(
          Object.entries(asset).filter(
            ([key]) =>
              ![
                "reuse_count",
                "updated_at",
                "created_at",
              ].includes(key),
          ),
        ),
      )
      .sort((a, b) =>
        String(a.asset_id).localeCompare(
          String(b.asset_id),
        ),
      ),
  };
}

export function makeReviewedAssetResolverSnapshot(
  registry: MyWayAssetRegistryV2,
): ReviewedAssetResolverSnapshot {
  const registryContentHash =
    stableJsonHash(
      selectionRegistryView(registry),
    );

  return {
    registry,
    registry_snapshot_id:
      `asset_registry_${registryContentHash.slice(0, 16)}`,
    registry_content_hash:
      registryContentHash,
  };
}

export async function loadReviewedAssetResolverSnapshot() {
  return makeReviewedAssetResolverSnapshot(
    await loadMyWayAssetRegistry(),
  );
}

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

function cloudReady(asset: MyWayAssetRecord) {
  return (
    asset.storage_provider === "r2" &&
    /^https:\/\//i.test(asset.public_path) &&
    Boolean(asset.storage_object_key) &&
    Boolean(asset.content_hash)
  );
}

function licenseEligible(asset: MyWayAssetRecord) {
  const attributionReady =
    !isAttributionRequiredLicense(
      asset.license_kind,
    ) ||
    attributionCompletenessIssues(
      asset.attribution,
    ).length === 0;

  return (
    asset.license_kind !== "unknown" &&
    asset.license_status !== "needs_review" &&
    asset.safe_to_use_in_sandbox &&
    attributionReady
  );
}

function metadataEligibilityReasons(
  asset: MyWayAssetRecord,
  request: AssetResolveRequest,
  requireSceneApproved: boolean,
  requireSemanticVerified: boolean,
  requireLicenseEligible: boolean,
  requireCloudReady: boolean,
) {
  const reasons: string[] = [];

  if (!asset.safe_to_use_in_sandbox) {
    reasons.push("not_safe_for_sandbox");
  }
  if (asset.status === "rejected") {
    reasons.push("asset_rejected");
  }
  if (
    requireSceneApproved &&
    asset.scene_review_status !== "approved"
  ) {
    reasons.push("scene_review_not_approved");
  }
  if (
    requireSemanticVerified &&
    asset.semantic_review_status !== "verified"
  ) {
    reasons.push("semantic_identity_not_verified");
  }
  if (
    requireLicenseEligible &&
    !licenseEligible(asset)
  ) {
    reasons.push("license_not_eligible");
  }
  if (
    requireCloudReady &&
    !cloudReady(asset)
  ) {
    reasons.push("cloud_not_ready");
  }
  if (!hasCoreConceptMatch(asset, request)) {
    reasons.push("identity_mismatch");
  }
  if (!hasRequiredAffordances(asset, request)) {
    reasons.push("missing_required_affordance");
  }
  if (!hasRequiredComposition(asset, request)) {
    reasons.push("composition_mismatch");
  }
  if (
    request.require_rigged === true &&
    !asset.rigged
  ) {
    reasons.push("rigging_required");
  }

  const requiredClips = unique(
    request.required_animation_clips ?? [],
  );
  const availableClips = unique(
    asset.animation_clips ?? [],
  );
  if (
    requiredClips.some(
      (clip) => !availableClips.includes(clip),
    )
  ) {
    reasons.push("required_animation_clip_missing");
  }

  return reasons;
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
    asset.quality_score * 8;

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



function canonicalRequest(
  request: AssetResolveRequest,
) {
  return {
    concept: normalizePhrase(request.concept),
    aliases: unique(request.aliases ?? []),
    semantic_tags: unique(
      request.semantic_tags ?? [],
    ),
    domain: normalizePhrase(
      request.domain ?? "",
    ),
    target_extent_m:
      request.target_extent_m ?? null,
    required_affordances: unique(
      request.required_affordances ?? [],
    ),
    desired_composition:
      request.desired_composition ?? null,
    preferred_asset_id:
      request.preferred_asset_id ?? null,
    appearance_request:
      request.appearance_request ?? null,
    appearance_ranking:
      request.appearance_ranking === true,
    require_scene_approved:
      request.require_scene_approved !== false,
    require_semantic_verified:
      request.require_semantic_verified !== false,
    require_license_eligible:
      request.require_license_eligible !== false,
    require_cloud_ready:
      request.require_cloud_ready !== false,
    require_rigged:
      request.require_rigged === true,
    required_animation_clips: unique(
      request.required_animation_clips ?? [],
    ),
    minimum_match_score:
      request.minimum_match_score ?? 48,
    minimum_match_margin:
      request.minimum_match_margin ?? 6,
  };
}

function scoreComponents(
  score: AssetMatchScoreBreakdown,
) {
  return {
    verified_identity:
      score.verified_identity,
    exact_phrase: score.exact_phrase,
    semantic_role: score.semantic_role,
    scene_context: score.scene_context,
    structural_fit: score.structural_fit,
    quality: score.quality,
    preferred_bonus: score.preferred_bonus,
    appearance_similarity_bonus:
      score.appearance_similarity_bonus,
    appearance_trait_bonus:
      score.appearance_trait_bonus,
    performance_penalty:
      -score.performance_penalty,
    contradiction_penalty:
      -score.contradiction_penalty,
    appearance_penalty:
      -score.appearance_penalty,
    total: score.total,
  };
}

function selectionReason(
  asset: MyWayAssetRecord,
  score: AssetMatchScoreBreakdown,
): AssetSelectionReason {
  return {
    summary:
      `Selected reviewed asset ${asset.asset_id} using deterministic identity, capability, appearance-profile, quality, and performance scoring.`,
    eligibility_checks: [
      "sandbox_safe",
      "not_rejected",
      "scene_review_approved",
      "semantic_identity_verified",
      "license_eligible",
      "cloud_ready_when_required",
      "file_exists",
      "identity_match",
      "required_affordances",
      "composition_fit",
      "rigging_and_animation_fit",
    ],
    score_components:
      scoreComponents(score),
    candidate_rank: 1,
  };
}

function failureReason(
  request: AssetResolveRequest,
  diagnostics: AssetCandidateEligibilityDiagnostic[],
  rankedCount: number,
) {
  const identityCandidates =
    diagnostics.filter(
      (entry) =>
        !entry.reasons.includes(
          "identity_mismatch",
        ),
    );

  if (!identityCandidates.length) {
    return `No registered asset matched the verified identity "${request.concept}".`;
  }

  const reasonCounts = new Map<string, number>();
  for (const entry of identityCandidates) {
    for (const reason of entry.reasons) {
      reasonCounts.set(
        reason,
        (reasonCounts.get(reason) ?? 0) + 1,
      );
    }
  }

  const common = [...reasonCounts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, 4)
    .map(([reason, count]) =>
      `${reason} (${count})`,
    );

  if (!rankedCount) {
    return `Matching asset metadata exists, but no candidate passed every reviewed-runtime eligibility gate${
      common.length
        ? `: ${common.join(", ")}`
        : "."
    }`;
  }

  return `A reviewed candidate existed for "${request.concept}", but it did not meet the required score or confidence margin.`;
}

async function writeDebug(
  request: AssetResolveRequest,
  result: AssetResolveResult,
) {
  if (request.debug_write !== true) {
    return;
  }

  await writeFile(
    projectPath(
      "sandbox/probe-lab/assets/debug/latest-reviewed-asset-resolution.json",
    ),
    `${JSON.stringify(
      {
        request,
        result,
        written_at:
          new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);
}

export async function resolveReviewedAsset(
  request: AssetResolveRequest,
  options: {
    snapshot?: ReviewedAssetResolverSnapshot;
    resolved_at?: string;
  } = {},
): Promise<AssetResolveResult> {
  const snapshot =
    options.snapshot ??
    (await loadReviewedAssetResolverSnapshot());
  const resolvedAt =
    options.resolved_at ??
    new Date().toISOString();
  const requestHash =
    stableJsonHash(canonicalRequest(request));
  const warnings: string[] = [];
  const requireSceneApproved =
    request.require_scene_approved !== false;
  const requireSemanticVerified =
    request.require_semantic_verified !== false;
  const requireLicenseEligible =
    request.require_license_eligible !== false;
  const requireCloudReady =
    request.require_cloud_ready !== false;
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
    Math.min(
      20,
      request.candidate_limit ?? 5,
    ),
  );

  if (request.force_refresh === true) {
    warnings.push(
      "force_refresh is ignored by pure reviewed-resource resolution. Acquisition must be requested separately.",
    );
  }
  if (request.record_reuse !== false) {
    warnings.push(
      "Canonical reviewed-resource resolution does not mutate reuse counters. Record usage as separate telemetry after selection.",
    );
  }
  if (request.appearance_ranking === true) {
    warnings.push(
      "Provider-backed appearance vector reranking was explicitly enabled. Normal scene-runtime callers should leave appearance_ranking disabled for strict Phase 2 determinism.",
    );
  }

  const diagnosticsByAssetId =
    new Map<
      string,
      AssetCandidateEligibilityDiagnostic
    >();
  const metadataEligible:
    MyWayAssetRecord[] = [];

  for (const asset of
    snapshot.registry.assets) {
    const reasons =
      metadataEligibilityReasons(
        asset,
        request,
        requireSceneApproved,
        requireSemanticVerified,
        requireLicenseEligible,
        requireCloudReady,
      );
    const diagnostic:
      AssetCandidateEligibilityDiagnostic = {
        asset_id: asset.asset_id,
        eligible: reasons.length === 0,
        reasons,
        scene_review_status:
          asset.scene_review_status ??
          "pending",
        semantic_review_status:
          asset.semantic_review_status ??
          "pending",
        license_status:
          asset.license_status,
        storage_provider:
          asset.storage_provider ??
          "local",
        cloud_ready:
          cloudReady(asset),
        file_exists: null,
      };
    diagnosticsByAssetId.set(
      asset.asset_id,
      diagnostic,
    );
    if (diagnostic.eligible) {
      metadataEligible.push(asset);
    }
  }

  const fileChecked = await Promise.all(
    metadataEligible.map(async (asset) => {
      const file =
        await assetWithFileStats(asset);
      const diagnostic =
        diagnosticsByAssetId.get(
          asset.asset_id,
        )!;
      diagnostic.file_exists =
        file.file_stats.exists;
      if (!file.file_stats.exists) {
        diagnostic.eligible = false;
        diagnostic.reasons.push(
          "runtime_file_missing",
        );
      }
      return {
        asset,
        file,
      };
    }),
  );
  const fileEligible =
    fileChecked.filter(
      (candidate) =>
        candidate.file.file_stats.exists,
    );

  const appearanceRanking =
    await evaluateAppearanceRanking({
      concept: request.concept,
      request:
        request.appearance_request,
      candidates:
        fileEligible.map(
          (candidate) =>
            candidate.asset,
        ),
      enabled: true,
      vectorSimilarity:
        request.appearance_ranking === true,
    });
  warnings.push(
    ...appearanceRanking.warnings,
  );

  const appearanceByAssetId =
    new Map(
      appearanceRanking.evaluations.map(
        (evaluation) => [
          evaluation.asset_id,
          evaluation,
        ],
      ),
    );

  const scored = fileEligible.map(
    (candidate) => {
      const appearance =
        appearanceByAssetId.get(
          candidate.asset.asset_id,
        );
      const score = scoreAsset(
        candidate.asset,
        request,
        appearance,
      );

      if (
        appearance?.eligible === false
      ) {
        const diagnostic =
          diagnosticsByAssetId.get(
            candidate.asset.asset_id,
          )!;
        diagnostic.eligible = false;
        diagnostic.reasons.push(
          "required_appearance_conflict",
        );
      }

      return {
        ...candidate,
        appearance,
        score,
      };
    },
  );

  const ranked = scored
    .filter(
      (candidate) =>
        candidate.appearance?.eligible !==
        false,
    )
    .sort(
      (a, b) =>
        b.score.total -
          a.score.total ||
        a.asset.asset_id.localeCompare(
          b.asset.asset_id,
        ),
    );
  const diagnosticRanked = [...scored].sort(
    (a, b) =>
      b.score.total -
        a.score.total ||
      a.asset.asset_id.localeCompare(
        b.asset.asset_id,
      ),
  );
  const candidateScores =
    diagnosticRanked
      .slice(0, candidateLimit)
      .map(
        (candidate) =>
          candidate.score,
      );
  const best = ranked[0];
  const runnerUp = ranked[1];
  const margin =
    best && runnerUp
      ? best.score.total -
        runnerUp.score.total
      : best
        ? best.score.total
        : null;
  const normalizedConcept =
    normalizePhrase(request.concept);
  const explicitlyPreferred =
    Boolean(best) &&
    (request.preferred_asset_id ===
      best?.asset.asset_id ||
      (
        best?.asset
          .preferred_for_concepts ?? []
      )
        .map(normalizePhrase)
        .includes(normalizedConcept));

  const selected =
    best &&
    best.score.total >= minimumScore &&
    (explicitlyPreferred ||
      margin == null ||
      margin >= minimumMargin)
      ? best
      : null;

  if (
    best &&
    best.score.total < minimumScore
  ) {
    warnings.push(
      `The best reviewed match scored ${best.score.total.toFixed(1)}, below the required ${minimumScore}.`,
    );
  } else if (
    best &&
    !explicitlyPreferred &&
    margin != null &&
    margin < minimumMargin
  ) {
    warnings.push(
      `The top reviewed candidates were too close (${margin.toFixed(1)} point margin; ${minimumMargin} required). Set a preferred asset or improve verified identity metadata.`,
    );
  }

  const eligibilityDiagnostics =
    [...diagnosticsByAssetId.values()]
      .filter(
        (entry) =>
          !entry.reasons.includes(
            "identity_mismatch",
          ) ||
          entry.asset_id ===
            request.preferred_asset_id,
      )
      .sort(
        (a, b) =>
          Number(b.eligible) -
            Number(a.eligible) ||
          a.asset_id.localeCompare(
            b.asset_id,
          ),
      )
      .slice(0, 50);

  if (selected) {
    const result: AssetResolveResult = {
      ok: true,
      source: "library",
      asset: selected.asset,
      warnings: Array.from(
        new Set(warnings),
      ),
      attempts: [],
      resolver_version:
        REVIEWED_ASSET_RESOLVER_VERSION,
      registry_snapshot_id:
        snapshot.registry_snapshot_id,
      registry_content_hash:
        snapshot.registry_content_hash,
      request_hash: requestHash,
      resolved_at: resolvedAt,
      acquisition_policy: "never",
      selection_reason:
        selectionReason(
          selected.asset,
          selected.score,
        ),
      eligibility_diagnostics:
        eligibilityDiagnostics,
      match_score:
        selected.score.total,
      match_margin: margin,
      candidate_scores:
        candidateScores,
      appearance_ranking:
        appearanceRanking.diagnostics,
      failure_reason: null,
      requires_scene_review: false,
    };
    await writeDebug(request, result);
    return result;
  }

  const reason = failureReason(
    request,
    eligibilityDiagnostics,
    ranked.length,
  );
  warnings.push(reason);
  const result: AssetResolveResult = {
    ok: false,
    source: "none",
    asset: null,
    warnings: Array.from(
      new Set(warnings),
    ),
    attempts: [],
    resolver_version:
      REVIEWED_ASSET_RESOLVER_VERSION,
    registry_snapshot_id:
      snapshot.registry_snapshot_id,
    registry_content_hash:
      snapshot.registry_content_hash,
    request_hash: requestHash,
    resolved_at: resolvedAt,
    acquisition_policy: "never",
    selection_reason: null,
    eligibility_diagnostics:
      eligibilityDiagnostics,
    match_score: null,
    match_margin: margin,
    candidate_scores:
      candidateScores,
    appearance_ranking:
      appearanceRanking.diagnostics,
    failure_reason: reason,
    requires_scene_review: false,
  };
  await writeDebug(request, result);
  return result;
}
