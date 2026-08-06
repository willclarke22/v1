import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  assetWithFileStats,
  getMyWayAsset,
} from "../asset-library.server";
import {
  approveAndPublishAsset,
  rejectAndRemoveMissingAsset,
  rejectAndRetryMissingAsset,
} from "../acquisition/missing-asset-review.server";
import {
  getMissingAssetJob,
  listMissingAssetJobs,
  removeMissingAssetJob,
  setMissingAssetJobStatus,
} from "../acquisition/missing-asset-store.server";
import {
  startMissingAssetAcquisition,
} from "../acquisition/missing-asset-worker.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(
  caught: unknown,
  status = 400,
) {
  return NextResponse.json(
    {
      ok: false,
      error:
        caught instanceof Error
          ? caught.message
          : String(caught),
    },
    { status },
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const sceneSessionId =
      request.nextUrl.searchParams.get(
        "scene_session_id",
      );
    const summaryOnly =
      request.nextUrl.searchParams.get(
        "summary",
      ) === "1";
    const jobs =
      await listMissingAssetJobs({
        sceneSessionId,
      });
    if (summaryOnly) {
      return NextResponse.json({
        ok: true,
        count: jobs.length,
        jobs,
      });
    }

    const candidates =
      await Promise.all(
        jobs.map(async (job) => {
          if (
            !job.current_candidate_asset_id
          ) {
            return null;
          }

          const asset =
            await getMyWayAsset(
              job.current_candidate_asset_id,
            );

          return asset
            ? await assetWithFileStats(asset)
            : null;
        }),
      );

    return NextResponse.json({
      ok: true,
      count: jobs.length,
      jobs,
      current_candidates:
        candidates.filter(Boolean),
    });
  } catch (caught) {
    return errorResponse(caught, 500);
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;
    const action =
      typeof body.action === "string"
        ? body.action
        : "";
    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id.trim()
        : "";
    const jobId =
      typeof body.job_id === "string"
        ? body.job_id.trim()
        : "";
    const note =
      typeof body.note === "string"
        ? body.note
        : null;
    const confirmManualLicenseReview =
      body.confirm_manual_license_review ===
      true;

    if (action === "approve_publish") {
      if (!assetId) {
        throw new Error(
          "asset_id is required.",
        );
      }

      const result =
        await approveAndPublishAsset(
          assetId,
          {
            confirmManualLicenseReview,
          },
        );

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (action === "reject_remove") {
      if (!assetId) {
        throw new Error(
          "asset_id is required.",
        );
      }

      const result =
        await rejectAndRemoveMissingAsset({
          assetId,
          note,
        });

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (action === "cancel_job") {
      if (!jobId) {
        throw new Error(
          "job_id is required.",
        );
      }

      const removedJob =
        await removeMissingAssetJob(jobId);

      return NextResponse.json({
        ok: true,
        removed_job_id: removedJob.job_id,
        removed_job: removedJob,
      });
    }

    if (
      action === "retry_blenderkit" ||
      action === "generate_trellis"
    ) {
      const provider =
        action === "generate_trellis"
          ? "trellis"
          : "blenderkit";

      if (assetId) {
        const result =
          await rejectAndRetryMissingAsset(
            {
              assetId,
              provider,
              note,
            },
          );

        return NextResponse.json({
          ok: true,
          ...result,
        });
      }

      if (!jobId) {
        throw new Error(
          "asset_id or job_id is required.",
        );
      }

      const job =
        await getMissingAssetJob(jobId);
      if (!job) {
        throw new Error(
          `Missing-asset job was not found: ${jobId}`,
        );
      }

      await setMissingAssetJobStatus(
        job.job_id,
        {
          status:
            provider === "trellis"
              ? "generating_trellis"
              : "searching_blenderkit",
          provider,
          error: null,
        },
      );
      void startMissingAssetAcquisition(
        job.job_id,
        provider,
      );

      return NextResponse.json({
        ok: true,
        job:
          await getMissingAssetJob(
            job.job_id,
          ),
      });
    }

    throw new Error(
      "action must be approve_publish, reject_remove, cancel_job, retry_blenderkit, or generate_trellis.",
    );
  } catch (caught) {
    return errorResponse(caught);
  }
}
