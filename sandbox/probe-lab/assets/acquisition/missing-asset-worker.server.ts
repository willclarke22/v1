import {
  assetWithFileStats,
  listMyWayAssets,
  updateMyWayAsset,
} from "../asset-library.server";
import type {
  MyWayAssetRecord,
} from "../asset-types";
import {
  removeMyWayAssetCompletely,
} from "../asset-maintenance.server";
import {
  appearanceAcquisitionTerms,
} from "../appearance-request";
import {
  resolveMyWayAsset,
} from "../asset-resolver.server";
import {
  acquireFromBlenderKit,
} from "../providers/blenderkit-provider.server";
import {
  acquireFromTrellis,
} from "../providers/trellis-asset-provider.server";
import {
  getMissingAssetJob,
  markMissingAssetCandidateApproved,
  registerMissingAssetCandidate,
  setMissingAssetJobStatus,
} from "./missing-asset-store.server";
import type {
  MissingAssetAcquisitionJob,
  MissingAssetAcquisitionProvider,
} from "./missing-asset-types";

const runningJobs = new Map<
  string,
  Promise<void>
>();
let acquisitionTail: Promise<void> =
  Promise.resolve();

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function identityPhrases(
  asset: MyWayAssetRecord,
) {
  return uniqueStrings([
    asset.requested_concept ?? "",
    asset.verified_canonical_label ?? "",
    asset.canonical_label,
    ...(asset.verified_aliases ?? []),
    ...asset.aliases,
  ]).map(normalizePhrase);
}

function assetIdentityMatchesJob(
  asset: MyWayAssetRecord,
  job: MissingAssetAcquisitionJob,
) {
  return identityPhrases(asset).includes(
    job.concept_key,
  );
}


async function keepCandidateOnlyIfJobExists(input: {
  jobId: string;
  asset: MyWayAssetRecord;
  created: boolean;
}) {
  const current =
    await getMissingAssetJob(input.jobId);

  if (current) return true;

  if (input.created) {
    await removeMyWayAssetCompletely(
      input.asset.asset_id,
    ).catch(() => undefined);
  }

  return false;
}

async function registerExistingCandidate(
  job: MissingAssetAcquisitionJob,
  asset: MyWayAssetRecord,
) {
  if (
    !(await keepCandidateOnlyIfJobExists({
      jobId: job.job_id,
      asset,
      created: false,
    }))
  ) {
    return asset;
  }

  if (
    asset.status === "rejected" ||
    asset.scene_review_status === "rejected" ||
    asset.semantic_review_status === "mismatch" ||
    asset.semantic_review_status === "rejected"
  ) {
    throw new Error(
      `The downloaded geometry duplicated rejected asset ${asset.asset_id}.`,
    );
  }

  if (!assetIdentityMatchesJob(asset, job)) {
    throw new Error(
      `The downloaded geometry duplicated existing asset ${asset.asset_id}, whose verified identity does not match "${job.concept}".`,
    );
  }

  await registerMissingAssetCandidate(
    job.job_id,
    {
      assetId: asset.asset_id,
      sourceType: asset.source_type,
      sourceAssetId: asset.source_asset_id,
    },
  );

  if (
    asset.scene_review_status === "approved" &&
    asset.semantic_review_status === "verified"
  ) {
    await markMissingAssetCandidateApproved(
      asset.asset_id,
    );
  }

  return asset;
}

async function adoptExistingCandidate(
  job: MissingAssetAcquisitionJob,
) {
  const conceptKey =
    normalizePhrase(job.concept);
  const candidates = await Promise.all(
    (await listMyWayAssets())
      .filter(
        (asset) =>
          asset.status !== "rejected" &&
          asset.scene_review_status !==
            "rejected" &&
          asset.semantic_review_status !==
            "mismatch" &&
          asset.semantic_review_status !==
            "rejected" &&
          identityPhrases(asset).includes(
            conceptKey,
          ),
      )
      .map(async (asset) => ({
        asset,
        file:
          await assetWithFileStats(asset),
      })),
  );

  const approvedResolution =
    await resolveMyWayAsset({
      concept: job.concept,
      aliases: job.aliases,
      semantic_tags: job.semantic_tags,
      appearance_request:
        job.appearance_request,
      allow_blenderkit: false,
      allow_trellis: false,
      require_scene_approved: true,
      require_semantic_verified: true,
      minimum_match_score: 48,
      minimum_match_margin: 0,
      candidate_limit: 5,
      record_reuse: false,
    });

  if (
    approvedResolution.ok &&
    approvedResolution.source === "library" &&
    approvedResolution.asset
  ) {
    await registerMissingAssetCandidate(
      job.job_id,
      {
        assetId:
          approvedResolution.asset.asset_id,
        sourceType:
          approvedResolution.asset.source_type,
        sourceAssetId:
          approvedResolution.asset.source_asset_id,
      },
    );
    return {
      asset: approvedResolution.asset,
      approved: true,
    };
  }

  const pending = candidates
    .filter(
      ({ file }) => file.file_stats.exists,
    )
    .sort(
      (a, b) =>
        b.asset.updated_at.localeCompare(
          a.asset.updated_at,
        ),
    )[0];

  if (!pending) return null;

  await registerMissingAssetCandidate(
    job.job_id,
    {
      assetId: pending.asset.asset_id,
      sourceType:
        pending.asset.source_type,
      sourceAssetId:
        pending.asset.source_asset_id,
    },
  );

  return {
    asset: pending.asset,
    approved: false,
  };
}

async function prepareCandidate(
  job: MissingAssetAcquisitionJob,
  asset: MyWayAssetRecord,
) {
  return updateMyWayAsset(
    asset.asset_id,
    {
      canonical_label: job.concept_key,
      requested_concept: job.concept,
      aliases: uniqueStrings([
        ...asset.aliases,
        ...job.aliases,
      ]),
      semantic_tags: uniqueStrings([
        ...asset.semantic_tags,
        job.concept,
        ...job.semantic_tags,
      ]),
      domain: job.domain,
      scene_review_status: "pending",
      scene_reviewed_at: null,
      scene_review_notes: null,
      notes:
        `${asset.notes ?? ""}`.trim() +
        `${asset.notes ? " " : ""}` +
        `Automatically acquired for missing-asset job ${job.job_id}; requested by ${job.scene_references.length} scene(s).` +
        `${
          job.appearance_request?.visual_brief
            ? ` Desired appearance: ${job.appearance_request.visual_brief}`
            : ""
        }`,
    },
  );
}

function blendKitQueries(
  job: MissingAssetAcquisitionJob,
) {
  const traits =
    appearanceAcquisitionTerms(
      job.appearance_request,
    )
      .flatMap((value) =>
        value
          .replace(/[^a-zA-Z0-9 -]+/g, " ")
          .split(/[,;]+/),
      )
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3);

  return uniqueStrings([
    ...traits.map(
      (trait) =>
        `${job.concept} ${trait}`.slice(
          0,
          140,
        ),
    ),
    job.concept,
    ...job.aliases,
  ]).slice(0, 5);
}

async function acquireBlendKitCandidate(
  job: MissingAssetAcquisitionJob,
) {
  await setMissingAssetJobStatus(
    job.job_id,
    {
      status: "searching_blenderkit",
      provider: "blenderkit",
      error: null,
      incrementAttempt: true,
    },
  );

  const queries =
    blendKitQueries(job);
  const errors: string[] = [];

  for (const query of queries) {
    try {
      const result =
        await acquireFromBlenderKit({
          concept: job.concept,
          searchQuery: query,
          aliases: job.aliases,
          semanticTags:
            job.semantic_tags,
          acquisitionTerms:
            appearanceAcquisitionTerms(
              job.appearance_request,
            ),
          domain: job.domain,
          targetExtentM:
            job.target_extent_m,
          requiredLicenseKind: "cc0",
          excludedSourceAssetIds:
            job.excluded_source_asset_ids,
          jobTimeoutMs: 75_000,
        });

      if (!result.created) {
        return registerExistingCandidate(
          job,
          result.asset,
        );
      }

      if (
        !(await keepCandidateOnlyIfJobExists({
          jobId: job.job_id,
          asset: result.asset,
          created: true,
        }))
      ) {
        return result.asset;
      }

      const asset =
        await prepareCandidate(
          job,
          result.asset,
        );

      if (
        !(await keepCandidateOnlyIfJobExists({
          jobId: job.job_id,
          asset,
          created: true,
        }))
      ) {
        return asset;
      }

      try {
        await registerMissingAssetCandidate(
          job.job_id,
          {
            assetId: asset.asset_id,
            sourceType: asset.source_type,
            sourceAssetId:
              asset.source_asset_id,
          },
        );
      } catch (caught) {
        if (!(await getMissingAssetJob(job.job_id))) {
          await removeMyWayAssetCompletely(
            asset.asset_id,
          ).catch(() => undefined);
          return asset;
        }
        throw caught;
      }
      return asset;
    } catch (caught) {
      errors.push(
        `[${query}] ${
          caught instanceof Error
            ? caught.message
            : String(caught)
        }`,
      );
    }
  }

  throw new Error(
    errors.length
      ? errors.join("\n")
      : "BlendKit did not return an acceptable CC0 candidate.",
  );
}

async function acquireTrellisCandidate(
  job: MissingAssetAcquisitionJob,
) {
  await setMissingAssetJobStatus(
    job.job_id,
    {
      status: "generating_trellis",
      provider: "trellis",
      error: null,
      incrementAttempt: true,
    },
  );

  const result = await acquireFromTrellis({
    concept: job.concept,
    semanticTags:
      job.semantic_tags,
    acquisitionTerms: [
      ...appearanceAcquisitionTerms(
        job.appearance_request,
      ),
      "complete object",
      "clean detailed geometry",
      "accurate proportions",
    ],
    domain: job.domain,
    targetExtentM:
      job.target_extent_m,
    noTexture: true,
    seed:
      Math.floor(
        Math.random() *
          2_000_000_000,
      ) + 1,
    maxAttempts: 3,
  });

  if (!result.created) {
    return registerExistingCandidate(
      job,
      result.asset,
    );
  }

  if (
    !(await keepCandidateOnlyIfJobExists({
      jobId: job.job_id,
      asset: result.asset,
      created: true,
    }))
  ) {
    return result.asset;
  }

  const asset =
    await prepareCandidate(
      job,
      result.asset,
    );

  if (
    !(await keepCandidateOnlyIfJobExists({
      jobId: job.job_id,
      asset,
      created: true,
    }))
  ) {
    return asset;
  }

  try {
    await registerMissingAssetCandidate(
      job.job_id,
      {
        assetId: asset.asset_id,
        sourceType: asset.source_type,
        sourceAssetId:
          asset.source_asset_id,
      },
    );
  } catch (caught) {
    if (!(await getMissingAssetJob(job.job_id))) {
      await removeMyWayAssetCompletely(
        asset.asset_id,
      ).catch(() => undefined);
      return asset;
    }
    throw caught;
  }
  return asset;
}

async function runJob(
  jobId: string,
  mode:
    | "auto"
    | MissingAssetAcquisitionProvider,
) {
  const original =
    await getMissingAssetJob(jobId);

  if (!original) {
    throw new Error(
      `Missing-asset job was not found: ${jobId}`,
    );
  }

  if (
    mode === "auto" &&
    (original.status ===
      "awaiting_review" ||
      original.status === "approved")
  ) {
    return;
  }

  if (mode === "auto") {
    const adopted =
      await adoptExistingCandidate(original);
    if (adopted) {
      if (adopted.approved) {
        await markMissingAssetCandidateApproved(
          adopted.asset.asset_id,
        );
      }
      return;
    }
  }

  if (process.env.VERCEL === "1") {
    await setMissingAssetJobStatus(
      original.job_id,
      {
        status: "unavailable",
        provider: null,
        error:
          "Local Blender acquisition is unavailable in the Vercel runtime. Run the acquisition worker on the local MyWay development machine.",
      },
    );
    return;
  }

  if (mode === "trellis") {
    try {
      await acquireTrellisCandidate(
        original,
      );
    } catch (caught) {
      await setMissingAssetJobStatus(
        original.job_id,
        {
          status: "unavailable",
          provider: null,
          error:
            caught instanceof Error
              ? caught.message
              : String(caught),
        },
      );
    }
    return;
  }

  try {
    await acquireBlendKitCandidate(
      original,
    );
    return;
  } catch (blendKitError) {
    if (mode === "blenderkit") {
      await setMissingAssetJobStatus(
        original.job_id,
        {
          status: "unavailable",
          provider: null,
          error:
            blendKitError instanceof Error
              ? blendKitError.message
              : String(blendKitError),
        },
      );
      return;
    }

    const latest =
      await getMissingAssetJob(jobId);
    if (!latest) return;

    try {
      await acquireTrellisCandidate(
        latest,
      );
    } catch (trellisError) {
      await setMissingAssetJobStatus(
        original.job_id,
        {
          status: "unavailable",
          provider: null,
          error:
            `BlendKit failed: ${
              blendKitError instanceof Error
                ? blendKitError.message
                : String(blendKitError)
            }\nTRELLIS failed: ${
              trellisError instanceof Error
                ? trellisError.message
                : String(trellisError)
            }`,
        },
      );
    }
  }
}

export function startMissingAssetAcquisition(
  jobId: string,
  mode:
    | "auto"
    | MissingAssetAcquisitionProvider =
      "auto",
) {
  const existing =
    runningJobs.get(jobId);
  if (existing) return existing;

  const task = acquisitionTail
    .catch(() => undefined)
    .then(() => runJob(jobId, mode))
    .catch(async (caught) => {
      await setMissingAssetJobStatus(
        jobId,
        {
          status: "unavailable",
          provider: null,
          error:
            caught instanceof Error
              ? caught.message
              : String(caught),
        },
      ).catch(() => undefined);
    })
    .finally(() => {
      runningJobs.delete(jobId);
    });

  runningJobs.set(jobId, task);
  acquisitionTail = task.catch(
    () => undefined,
  );
  return task;
}

export function startMissingAssetAcquisitions(
  jobIds: string[],
) {
  for (const jobId of
    uniqueStrings(jobIds)) {
    void startMissingAssetAcquisition(
      jobId,
      "auto",
    );
  }
}
