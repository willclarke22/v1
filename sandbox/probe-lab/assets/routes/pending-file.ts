import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getMyWayAsset,
} from "../asset-library.server";
import {
  readPendingAssetReviewObject,
} from "../storage/pending-asset-storage.server";

export const maxDuration = 300;

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        "Cache-Control":
          "private, no-store",
      },
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  const assetId =
    request.nextUrl.searchParams
      .get("asset_id")
      ?.trim() ?? "";
  const kind =
    request.nextUrl.searchParams
      .get("kind");

  if (!assetId) {
    return errorResponse(
      "asset_id is required.",
      400,
    );
  }

  if (
    kind !== "model" &&
    kind !== "thumbnail"
  ) {
    return errorResponse(
      "kind must be model or thumbnail.",
      400,
    );
  }

  try {
    const asset =
      await getMyWayAsset(assetId);

    if (!asset) {
      return errorResponse(
        "Asset was not found.",
        404,
      );
    }

    if (
      kind === "model" &&
      asset.storage_provider !==
        "r2_private_pending"
    ) {
      return errorResponse(
        "This asset is not a private pending model.",
        404,
      );
    }

    if (
      kind === "thumbnail" &&
      asset.thumbnail_storage_provider !==
        "r2_private_pending"
    ) {
      return errorResponse(
        "This asset does not have a private pending thumbnail.",
        404,
      );
    }

    // Callers choose asset_id + kind only, never an arbitrary R2 key.
    const object =
      await readPendingAssetReviewObject(
        asset,
        kind,
      );

    if (!object) {
      return errorResponse(
        "The private pending R2 object was not found.",
        404,
      );
    }

    const contentType =
      object.content_type ??
      (
        kind === "model"
          ? asset.asset_type === "gltf"
            ? "model/gltf+json"
            : "model/gltf-binary"
          : "image/png"
      );

    return new NextResponse(
      Buffer.from(object.body),
      {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length":
            String(object.size_bytes),
          "Cache-Control":
            "private, no-store",
          "X-Content-Type-Options":
            "nosniff",
          "Content-Disposition":
            "inline",
        },
      },
    );
  }
  catch (caught) {
    return errorResponse(
      caught instanceof Error
        ? caught.message
        : String(caught),
      500,
    );
  }
}
