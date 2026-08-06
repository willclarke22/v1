import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  buildThirdPartyAssetManifest,
  renderThirdPartyAssetLicensesText,
} from "../asset-attribution";
import {
  getMyWayAsset,
} from "../asset-library.server";

export const runtime = "nodejs";

function assetIds(request: NextRequest) {
  return Array.from(
    new Set(
      (request.nextUrl.searchParams
        .get("asset_ids") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 200);
}

export async function GET(
  request: NextRequest,
) {
  try {
    const ids = assetIds(request);
    if (!ids.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "asset_ids is required and must contain one or more comma-separated asset IDs.",
        },
        { status: 400 },
      );
    }

    const assets = (
      await Promise.all(
        ids.map((id) =>
          getMyWayAsset(id),
        ),
      )
    ).filter(
      (asset): asset is NonNullable<
        Awaited<ReturnType<typeof getMyWayAsset>>
      > => Boolean(asset),
    );
    const manifest =
      buildThirdPartyAssetManifest(
        assets,
      );
    const format =
      request.nextUrl.searchParams
        .get("format")
        ?.toLowerCase();

    if (format === "text") {
      return new NextResponse(
        renderThirdPartyAssetLicensesText(
          manifest,
        ),
        {
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="THIRD_PARTY_LICENSES.txt"',
          },
        },
      );
    }

    return NextResponse.json({
      ok: true,
      requested_asset_ids: ids,
      found_asset_ids:
        assets.map(
          (asset) => asset.asset_id,
        ),
      manifest,
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
