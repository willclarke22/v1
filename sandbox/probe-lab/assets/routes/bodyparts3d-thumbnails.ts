import { NextRequest, NextResponse } from "next/server";

import {
  auditBodyParts3dThumbnailBatch,
  backfillBodyParts3dThumbnail,
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

    if (action === "backfill_one") {
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
          }),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "action must be audit_batch or backfill_one.",
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
