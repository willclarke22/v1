import { NextRequest, NextResponse } from "next/server";

import { removeMyWayAssetCompletely } from "../asset-maintenance.server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id.trim()
        : "";

    if (!assetId) {
      return NextResponse.json(
        {
          ok: false,
          error: "asset_id is required",
        },
        { status: 400 },
      );
    }

    const result =
      await removeMyWayAssetCompletely(assetId);

    return NextResponse.json({
      ok: true,
      removed_asset_id: result.asset.asset_id,
      removed_local_files:
        result.removed_local_files,
      removed_remote_objects:
        result.removed_remote_objects,
    });
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
