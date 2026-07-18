import { NextRequest, NextResponse } from "next/server";

import {
  assetWithFileStats,
  getMyWayAsset,
  listMyWayAssets,
  registerMyWayAsset,
  reviewMyWayAssetForScenes,
  reviewMyWayAssetSemanticIdentity,
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

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const assetId =
      typeof body.asset_id === "string"
        ? body.asset_id
        : "";

    if (!assetId.trim()) {
      throw new Error("asset_id is required");
    }

    if (body.action === "semantic_identity") {
      const semanticReviewStatus =
        body.semantic_review_status;

      if (
        semanticReviewStatus !== "pending" &&
        semanticReviewStatus !== "verified" &&
        semanticReviewStatus !== "mismatch" &&
        semanticReviewStatus !== "rejected"
      ) {
        throw new Error(
          "semantic_review_status must be pending, verified, mismatch, or rejected",
        );
      }

      const objectComposition =
        body.object_composition === "single_object" ||
        body.object_composition === "object_set" ||
        body.object_composition === "environment_piece" ||
        body.object_composition === "unknown"
          ? body.object_composition
          : "unknown";

      const asset =
        await reviewMyWayAssetSemanticIdentity({
          assetId,
          semanticReviewStatus,
          verifiedCanonicalLabel:
            typeof body.verified_canonical_label === "string"
              ? body.verified_canonical_label
              : null,
          verifiedAliases: stringList(
            body.verified_aliases,
          ),
          objectComposition,
          contains: stringList(body.contains),
          affordances: stringList(body.affordances),
          preferredForConcepts: stringList(
            body.preferred_for_concepts,
          ),
          notes:
            typeof body.semantic_review_notes === "string"
              ? body.semantic_review_notes
              : null,
        });

      return NextResponse.json({
        ok: true,
        asset: await assetWithFileStats(asset),
      });
    }

    const sceneReviewStatus = body.scene_review_status;

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
