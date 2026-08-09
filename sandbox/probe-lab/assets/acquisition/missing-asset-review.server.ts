import {
  assetWithFileStats,
  getMyWayAsset,
  reviewMyWayAssetForScenes,
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

export async function approveAndPublishAsset(
  assetId: string,
  options: {
    confirmManualLicenseReview?: boolean;
  } = {},
) {
  const current =
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
        nextProvider:
          input.provider,
      },
    );

  void startMissingAssetAcquisition(
    job.job_id,
    input.provider,
  );

  return {
    job: updated,
    rejected_asset_id:
      asset.asset_id,
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
