import { NextRequest, NextResponse } from "next/server";

import { getMyWayAsset } from "../asset-library.server";
import { promoteMyWayAssetToR2 } from "../asset-promotion.server";

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
        { ok: false, error: "asset_id is required" },
        { status: 400 },
      );
    }

    const asset = await getMyWayAsset(assetId);

    if (!asset) {
      return NextResponse.json(
        { ok: false, error: "Asset not found." },
        { status: 404 },
      );
    }

    if (
      asset.source_type !== "blenderkit" ||
      asset.license_kind !== "cc0"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The review button only promotes BlendKit assets whose captured license is exactly CC0.",
        },
        { status: 409 },
      );
    }

    if (!asset.safe_to_promote_to_app) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The asset is not cleared for public promotion.",
        },
        { status: 409 },
      );
    }

    const result = await promoteMyWayAssetToR2({
      assetId,
      archiveSource: false,
    });

    return NextResponse.json({
      ok: true,
      ...result,
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
