import { NextResponse } from "next/server";

import {
  geometryProfileQueueSnapshot,
  queueAllGeometryProfiles,
  queueAssetGeometryProfile,
} from "../geometry/geometry-profile-worker.server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    queue:
      geometryProfileQueueSnapshot(),
  });
}

export async function POST(
  request: Request,
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

    if (action === "profile_asset") {
      const assetId =
        typeof body.asset_id === "string"
          ? body.asset_id.trim()
          : "";
      if (!assetId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "asset_id is required.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        entry:
          queueAssetGeometryProfile(
            assetId,
            {
              force:
                body.force === true,
            },
          ),
      });
    }

    if (action === "profile_all") {
      const result =
        await queueAllGeometryProfiles({
          force: body.force === true,
        });
      return NextResponse.json({
        ok: true,
        queued_count:
          result.entries.length,
        skipped_count:
          result.skipped.length,
        entries: result.entries,
        skipped: result.skipped,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unsupported geometry action.",
      },
      { status: 400 },
    );
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      },
      { status: 500 },
    );
  }
}
