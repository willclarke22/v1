import { NextRequest, NextResponse } from "next/server";

import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  registerMyWayAsset,
  reviewMyWayAssetForScenes,
} from "../asset-library.server";

function errorResponse(caught: unknown, status = 400) {
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

export async function GET(request: NextRequest) {
  try {
    const assetId = request.nextUrl.searchParams.get("asset_id");

    if (assetId) {
      const asset = await getMyWayAsset(assetId);

      if (!asset) {
        return NextResponse.json(
          { ok: false, error: "Asset not found." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        asset: await assetWithFileStats(asset),
      });
    }

    const assets = await Promise.all(
      (await listMyWayAssets()).map(assetWithFileStats),
    );

    return NextResponse.json({
      ok: true,
      count: assets.length,
      assets,
    });
  } catch (caught) {
    return errorResponse(caught, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await registerMyWayAsset(body.asset ?? body);
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    return errorResponse(caught);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id
        : "";
    const sceneReviewStatus = body.scene_review_status;

    if (!assetId.trim()) {
      throw new Error("asset_id is required");
    }

    if (
      sceneReviewStatus !== "pending" &&
      sceneReviewStatus !== "approved" &&
      sceneReviewStatus !== "rejected"
    ) {
      throw new Error(
        "scene_review_status must be pending, approved, or rejected",
      );
    }

    const asset = await reviewMyWayAssetForScenes({
      assetId,
      sceneReviewStatus,
      notes:
        typeof body.scene_review_notes === "string"
          ? body.scene_review_notes
          : null,
    });

    return NextResponse.json({
      ok: true,
      asset: await assetWithFileStats(asset),
    });
  } catch (caught) {
    return errorResponse(caught);
  }
}
