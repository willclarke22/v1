import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  reviewMyWayAssetForScenes,
  updateMyWayAssetProvenance,
} from "../asset-library.server";
import {
  removeMyWayAssetCompletely,
} from "../asset-maintenance.server";
import {
  promoteMyWayAssetToR2,
} from "../asset-promotion.server";
import {
  buildManualCc0LicenseReview,
  buildPolyPizzaManualLicenseReview,
  isManualCc0PublicSceneCandidate,
  isPolyPizzaManualLicenseCandidate,
} from "../licensing/asset-license-review";
import {
  MYWAY_ASSET_LIBRARY_PROJECT_PATH,
} from "../paths.server";
import {
  MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE,
} from "../asset-attribution";
import {
  needsReviewSceneApprovalMetadataBlocker,
} from "../needs-review-scene-approval-policy";
import {
  writeDurableAssetJson,
} from "../storage/asset-durable-artifacts.server";
import {
  findMissingAssetJobForAsset,
  markMissingAssetCandidateApproved,
  rejectMissingAssetCandidate,
  rejectMissingAssetCandidateAndPause,
} from "./missing-asset-store.server";
import {
  startMissingAssetAcquisition,
} from "./missing-asset-worker.server";
import type {
  MissingAssetAcquisitionProvider,
} from "./missing-asset-types";

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

function identityPhrase(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .filter(Boolean)
    .map(singularToken)
    .join(" ");
}

function verifiedIdentityMatches(
  asset: Awaited<
    ReturnType<typeof getMyWayAsset>
  >,
  conceptKey: string,
) {
  if (!asset) return false;

  const normalizedConcept = identityPhrase(conceptKey);
  const identities = [
    asset.verified_canonical_label ?? "",
    ...(asset.verified_aliases ?? []),
    ...asset.aliases,
  ]
    .map(identityPhrase)
    .filter(Boolean);

  return identities.some(
    (identity) =>
      identity === normalizedConcept ||
      ` ${identity} `.includes(
        ` ${normalizedConcept} `,
      ) ||
      ` ${normalizedConcept} `.includes(
        ` ${identity} `,
      ),
  );
}


async function writeApprovedPolyPizzaLicenseReview(
  asset: NonNullable<
    Awaited<ReturnType<typeof getMyWayAsset>>
  >,
) {
  const review =
    buildPolyPizzaManualLicenseReview(
      asset,
    );
  const relativePath =
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/licenses/${asset.asset_id}.review.json`;

  await writeDurableAssetJson(
    relativePath,
    review,
  );

  return relativePath;
}

async function writeApprovedManualCc0LicenseReview(
  asset: NonNullable<
    Awaited<ReturnType<typeof getMyWayAsset>>
  >,
) {
  const review =
    buildManualCc0LicenseReview(
      asset,
    );
  const relativePath =
    `${MYWAY_ASSET_LIBRARY_PROJECT_PATH}/licenses/${asset.asset_id}.review.json`;

  await writeDurableAssetJson(
    relativePath,
    review,
  );

  return relativePath;
}


async function ensureStandardPolyPizzaModificationNotice(
  asset: NonNullable<
    Awaited<ReturnType<typeof getMyWayAsset>>
  >,
) {
  if (
    !isPolyPizzaManualLicenseCandidate(asset) ||
    asset.storage_provider === "r2" ||
    asset.attribution?.modification_notice?.trim()
  ) {
    return {
      asset,
      backfilled: false,
    };
  }

  const attribution = asset.attribution;
  const sourceProvider =
    attribution?.source_provider?.trim() ?? "";
  const sourceAssetId =
    asset.source_asset_id?.trim() ?? "";
  const sourceUrl =
    asset.source_url?.trim() ?? "";
  const assetTitle =
    attribution?.asset_title?.trim() ?? "";
  const creatorName =
    attribution?.creator_name?.trim() ?? "";
  const expectedLicenseName =
    asset.license_kind === "cc0"
      ? "CC0"
      : asset.license_kind === "cc_by_4_0"
        ? "CC BY 4.0"
        : "CC BY";
  const attributionRequired =
    asset.license_kind === "cc_by" ||
    asset.license_kind === "cc_by_4_0";

  // Only repair the deterministic MyWay processing notice. If any real
  // provenance field is missing, leave the record untouched so the existing
  // public-approval authority reports the precise human-review blocker.
  if (
    !attribution ||
    !sourceProvider ||
    !sourceAssetId ||
    !sourceUrl ||
    !assetTitle ||
    !creatorName ||
    attribution.source_asset_id?.trim() !==
      sourceAssetId ||
    attribution.source_url?.trim() !==
      sourceUrl ||
    attribution.license_name !==
      expectedLicenseName ||
    (attributionRequired &&
      !attribution.text?.trim()) ||
    !asset.commercial_use_allowed ||
    !asset.raw_redistribution_allowed
  ) {
    return {
      asset,
      backfilled: false,
    };
  }

  const updated =
    await updateMyWayAssetProvenance({
      assetId: asset.asset_id,
      sourceProvider,
      sourceAssetId,
      sourceUrl,
      assetTitle,
      creatorName,
      licenseKind: asset.license_kind,
      licenseVersion:
        attribution.license_version,
      attributionText:
        attribution.text,
      modificationNotice:
        MYWAY_STANDARD_RUNTIME_MODIFICATION_NOTICE,
      downloadedAt:
        attribution.downloaded_at,
      // Undefined intentionally preserves any existing durable provenance
      // notes while updateMyWayAssetProvenance rewrites the attribution.
      provenanceNotes: undefined,
    });

  return {
    asset: updated.asset,
    backfilled: true,
  };
}


export type NeedsReviewBulkSceneApprovalSkip = {
  asset_id: string;
  reason:
    | "not_safe_for_scene_use"
    | "semantic_identity_not_verified"
    | "vision_not_ready"
    | "embedding_not_ready"
    | "runtime_file_missing"
    | "approval_failed";
  detail: string;
};

export async function approveAllNeedsReviewAssetsForSceneUse() {
  const needsReviewAssets =
    (await listMyWayAssets()).filter(
      (asset) =>
        asset.scene_review_status ===
        "pending",
    );

  const approvedAssetIds: string[] = [];
  const publishedAssetIds: string[] = [];
  const localSceneOnlyAssetIds: string[] =
    [];
  const modificationNoticeBackfilledAssetIds:
    string[] = [];
  const skipped: NeedsReviewBulkSceneApprovalSkip[] =
    [];

  for (const candidate of needsReviewAssets) {
    const metadataBlocker =
      needsReviewSceneApprovalMetadataBlocker(
        candidate,
      );

    if (metadataBlocker) {
      skipped.push({
        asset_id: candidate.asset_id,
        reason: metadataBlocker,
        detail:
          metadataBlocker ===
          "not_safe_for_scene_use"
            ? "The asset is rejected or is not marked safe for sandbox scene use."
            : metadataBlocker ===
                "semantic_identity_not_verified"
              ? "The asset semantic identity is not verified."
              : metadataBlocker ===
                  "vision_not_ready"
                ? "Omni vision analysis is not ready."
                : "The durable appearance embedding is not ready.",
      });
      continue;
    }

    try {
      const file =
        await assetWithFileStats(candidate);
      if (!file.file_stats.exists) {
        skipped.push({
          asset_id: candidate.asset_id,
          reason: "runtime_file_missing",
          detail:
            "The registered runtime model file is missing.",
        });
        continue;
      }

      // Reuse the exact individual approval/publication authority instead of
      // duplicating licence, R2, identity-match, and acquisition bookkeeping.
      // The one bulk confirmation in the UI stands in for the individual
      // manual-licence confirmations for eligible CC0 / Poly Pizza candidates.
      const result =
        await approveAndPublishAsset(
          candidate.asset_id,
          {
            confirmManualLicenseReview:
              true,
          },
        );

      approvedAssetIds.push(
        result.asset.asset_id,
      );
      if (
        result.modification_notice_backfilled
      ) {
        modificationNoticeBackfilledAssetIds.push(
          result.asset.asset_id,
        );
      }
      if (result.published) {
        publishedAssetIds.push(
          result.asset.asset_id,
        );
      } else {
        localSceneOnlyAssetIds.push(
          result.asset.asset_id,
        );
      }
    } catch (caught) {
      skipped.push({
        asset_id: candidate.asset_id,
        reason: "approval_failed",
        detail:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    needs_review_count:
      needsReviewAssets.length,
    approved_count:
      approvedAssetIds.length,
    published_count:
      publishedAssetIds.length,
    local_scene_only_count:
      localSceneOnlyAssetIds.length,
    modification_notice_backfilled_count:
      modificationNoticeBackfilledAssetIds.length,
    modification_notice_backfilled_asset_ids:
      modificationNoticeBackfilledAssetIds,
    skipped_count: skipped.length,
    approved_asset_ids:
      approvedAssetIds,
    published_asset_ids:
      publishedAssetIds,
    local_scene_only_asset_ids:
      localSceneOnlyAssetIds,
    skipped,
  };
}

export async function approveAndPublishAsset(
  assetId: string,
  options: {
    confirmManualLicenseReview?: boolean;
  } = {},
) {
  let current =
    await getMyWayAsset(assetId);

  if (!current) {
    throw new Error(
      `Asset was not found: ${assetId}`,
    );
  }

  if (
    current.semantic_review_status !==
    "verified"
  ) {
    throw new Error(
      "Verify or edit the asset identity before approving it.",
    );
  }

  if (
    !current.safe_to_use_in_sandbox ||
    current.status === "rejected"
  ) {
    throw new Error(
      "This asset is not safe for scene use.",
    );
  }

  const modificationNoticeRepair =
    await ensureStandardPolyPizzaModificationNotice(
      current,
    );
  current =
    modificationNoticeRepair.asset;

  const linkedJob =
    await findMissingAssetJobForAsset(
      current.asset_id,
    );

  if (
    linkedJob &&
    !verifiedIdentityMatches(
      current,
      linkedJob.concept_key,
    )
  ) {
    throw new Error(
      `The verified identity does not match the missing concept "${linkedJob.concept}". Correct the identity or try another candidate.`,
    );
  }

  let asset = current;
  let published =
    current.storage_provider === "r2";
  let reviewFile: string | null = null;

  const polyPizzaManualCandidate =
    isPolyPizzaManualLicenseCandidate(
      current,
    );
  const manualCc0Candidate =
    !polyPizzaManualCandidate &&
    isManualCc0PublicSceneCandidate(
      current,
    );

  if (
    !published &&
    !current.safe_to_promote_to_app &&
    polyPizzaManualCandidate
  ) {
    if (
      options.confirmManualLicenseReview !==
      true
    ) {
      throw new Error(
        "Confirm the Poly Pizza source page, licence, creator credit, redistribution permission, and absence of known third-party restrictions before approving this asset for public scene use.",
      );
    }

    reviewFile =
      await writeApprovedPolyPizzaLicenseReview(
        current,
      );
  } else if (
    !published &&
    !current.safe_to_promote_to_app &&
    manualCc0Candidate
  ) {
    if (
      options.confirmManualLicenseReview !==
      true
    ) {
      throw new Error(
        "Confirm the recorded source, CC0 licence, redistribution permission, and absence of known third-party restrictions before approving this asset for public scene use.",
      );
    }

    reviewFile =
      await writeApprovedManualCc0LicenseReview(
        current,
      );
  }

  if (
    !published &&
    (current.safe_to_promote_to_app ||
      reviewFile)
  ) {
    const promoted =
      await promoteMyWayAssetToR2({
        assetId: current.asset_id,
        reviewFile,
        archiveSource: true,
        removeLocalAfterVerification: true,
      });
    asset = promoted.asset;
    published = true;
  }

  if (
    !published &&
    current.storage_provider ===
      "r2_private_pending"
  ) {
    throw new Error(
      "This review candidate is safely stored in private R2, but it cannot be approved for automatic scene use until its licence/provenance clears public runtime-R2 promotion.",
    );
  }

  asset =
    await reviewMyWayAssetForScenes({
      assetId: asset.asset_id,
      sceneReviewStatus: "approved",
      notes: published
        ? "Approved for automatic scene use and published to Cloudflare R2."
        : "Approved for local sandbox scene use. Public promotion remains blocked by the asset license record.",
    });

  const jobs =
    await markMissingAssetCandidateApproved(
      asset.asset_id,
    );

  return {
    asset:
      await assetWithFileStats(asset),
    published,
    license_review_created:
      Boolean(reviewFile),
    modification_notice_backfilled:
      modificationNoticeRepair.backfilled,
    jobs,
  };
}

export async function rejectAndRetryMissingAsset(
  input: {
    assetId: string;
    provider:
      MissingAssetAcquisitionProvider;
    note?: string | null;
  },
) {
  const asset =
    await getMyWayAsset(input.assetId);

  if (!asset) {
    throw new Error(
      `Asset was not found: ${input.assetId}`,
    );
  }

  const job =
    await findMissingAssetJobForAsset(
      asset.asset_id,
    );

  if (!job) {
    throw new Error(
      "This asset is not linked to a missing-scene acquisition job.",
    );
  }

  await reviewMyWayAssetForScenes({
    assetId: asset.asset_id,
    sceneReviewStatus: "rejected",
    notes:
      input.note?.trim() ||
      `Rejected while requesting another ${input.provider} candidate for ${job.concept}.`,
  });

  const updated =
    await rejectMissingAssetCandidate(
      job.job_id,
      {
        assetId: asset.asset_id,
        note: input.note ?? null,
        nextProvider: input.provider,
      },
    );

  // Candidate history is already durable in the acquisition queue.
  await removeMyWayAssetCompletely(
    asset.asset_id,
  );

  void startMissingAssetAcquisition(
    job.job_id,
    input.provider,
  );

  return {
    job: updated,
    rejected_asset_id: asset.asset_id,
  };
}

export async function rejectAndRemoveMissingAsset(
  input: {
    assetId: string;
    note?: string | null;
  },
) {
  const asset =
    await getMyWayAsset(input.assetId);

  if (!asset) {
    throw new Error(
      `Asset was not found: ${input.assetId}`,
    );
  }

  const job =
    await findMissingAssetJobForAsset(
      asset.asset_id,
    );

  if (!job) {
    throw new Error(
      "This asset is not linked to a missing-scene acquisition job.",
    );
  }

  const note =
    input.note?.trim() ||
    `Rejected and removed while reviewing the candidate for ${job.concept}.`;

  await reviewMyWayAssetForScenes({
    assetId: asset.asset_id,
    sceneReviewStatus: "rejected",
    notes: note,
  });

  const updatedJob =
    await rejectMissingAssetCandidateAndPause(
      job.job_id,
      {
        assetId: asset.asset_id,
        note,
      },
    );

  const removed =
    await removeMyWayAssetCompletely(
      asset.asset_id,
    );

  return {
    job: updatedJob,
    removed_asset_id:
      removed.asset.asset_id,
    removed_local_files:
      removed.removed_local_files,
    removed_remote_objects:
      removed.removed_remote_objects,
  };
}
