import { NextRequest, NextResponse } from "next/server";

import { createMyWayAssetReplacement } from "../asset-maintenance.server";
import { assetWithFileStats } from "../asset-library.server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id.trim()
        : "";
    const provider =
      body.provider === "trellis"
        ? "trellis"
        : body.provider === "blenderkit"
          ? "blenderkit"
          : null;

    if (!assetId || !provider) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "asset_id and provider (blenderkit or trellis) are required",
        },
        { status: 400 },
      );
    }

    const result =
      await createMyWayAssetReplacement({
        assetId,
        provider,
      });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      original_asset_id:
        result.original.asset_id,
      asset: await assetWithFileStats(
        result.replacement,
      ),
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
