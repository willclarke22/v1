import { NextRequest, NextResponse } from "next/server";

import {
  auditBodyParts3dThumbnailBatch,
  backfillBodyParts3dThumbnail,
  backfillBodyParts3dThumbnailBatch,
  renderBodyParts3dThumbnailCalibration,
} from "../bodyparts3d-thumbnail-maintenance.server";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorText(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : String(caught);
}

export async function POST(request: NextRequest) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const action =
      typeof body.action === "string"
        ? body.action
        : "";
    const registryRevision =
      typeof body.registry_revision === "string"
        ? body.registry_revision
        : "0";

    if (action === "audit_batch") {
      const offset =
        typeof body.offset === "number"
          ? Math.max(0, Math.floor(body.offset))
          : 0;
      const limit =
        typeof body.limit === "number"
          ? Math.min(
              96,
              Math.max(1, Math.floor(body.limit)),
            )
          : 64;

      return NextResponse.json({
        ok: true,
        action,
        ...(await auditBodyParts3dThumbnailBatch({
          registryRevision,
          offset,
          limit,
        })),
      });
    }

    if (action === "render_appearance_calibration_one") {
      const assetId =
        typeof body.asset_id === "string"
          ? body.asset_id.trim()
          : "";

      if (!assetId) {
        return NextResponse.json(
          {
            ok: false,
            error: "asset_id is required.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        action,
        calibration:
          await renderBodyParts3dThumbnailCalibration({
            assetId,
            registryRevision,
          }),
      });
    }

    if (action === "regenerate_viewer_match_refined_batch") {
      const assetIds =
        Array.isArray(body.asset_ids)
          ? body.asset_ids
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
          : [];

      if (assetIds.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "asset_ids must include at least one anatomy asset ID.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        action,
        batch:
          await backfillBodyParts3dThumbnailBatch({
            assetIds,
            registryRevision,
            viewerMatchRefined: true,
          }),
      });
    }

    if (
      action === "backfill_one" ||
      action === "regenerate_visual_one" ||
      action === "regenerate_appearance_preview_one" ||
      action === "regenerate_viewer_match_refined_one"
    ) {
      const assetId =
        typeof body.asset_id === "string"
          ? body.asset_id.trim()
          : "";

      if (!assetId) {
        return NextResponse.json(
          {
            ok: false,
            error: "asset_id is required.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        action,
        repair:
          await backfillBodyParts3dThumbnail({
            assetId,
            registryRevision,
            forceRegenerate:
              action !== "backfill_one",
            appearancePreview:
              action === "regenerate_appearance_preview_one",
            viewerMatchRefined:
              action === "regenerate_viewer_match_refined_one",
          }),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "action must be audit_batch, backfill_one, regenerate_visual_one, regenerate_appearance_preview_one, regenerate_viewer_match_refined_one, regenerate_viewer_match_refined_batch, or render_appearance_calibration_one.",
      },
      { status: 400 },
    );
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: errorText(caught),
      },
      { status: 500 },
    );
  }
}
