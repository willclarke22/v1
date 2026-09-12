import { NextRequest, NextResponse } from "next/server";

import { getMyWayAsset } from "../../assets/asset-library.server";
import type { MyWayAssetRecord } from "../../assets/asset-types";
import { getAssetBrowserRegistryAsset } from "../../assets/asset-browser-snapshot.server";
import {
  getR2RuntimeStorage,
} from "../../assets/storage/r2-asset-storage.server";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isApprovedForSandbox(asset: MyWayAssetRecord) {
  return (
    asset.status !== "rejected" &&
    asset.scene_review_status !== "rejected" &&
    asset.semantic_review_status !== "rejected" &&
    asset.semantic_review_status !== "mismatch" &&
    asset.safe_to_use_in_sandbox !== false
  );
}

function browserContentType(
  asset: MyWayAssetRecord,
  storedContentType?: string | null,
) {
  return (
    storedContentType ||
    (asset.asset_type === "glb"
      ? "model/gltf-binary"
      : "model/gltf+json")
  );
}

function browserHeaders(input: {
  contentType: string;
  contentLength?: number | null;
  etag?: string | null;
  source: "runtime_r2_object_key" | "legacy_public_url";
}) {
  const headers = new Headers();
  headers.set(
    "content-type",
    input.contentType,
  );
  headers.set(
    "cache-control",
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  headers.set(
    "x-myway-model-source",
    input.source,
  );
  if (
    typeof input.contentLength ===
      "number" &&
    Number.isFinite(
      input.contentLength,
    )
  ) {
    headers.set(
      "content-length",
      String(input.contentLength),
    );
  }
  if (input.etag) {
    headers.set(
      "etag",
      input.etag,
    );
  }
  return headers;
}

/**
 * Same-origin browser bridge for reviewed remote model assets.
 *
 * Security boundary: callers supply only an Asset Library id. The model is read
 * from the exact runtime-R2 object key stored on that reviewed registry record.
 * A legacy public-URL fallback remains only for older reviewed records that do
 * not yet have a runtime object key. This route never accepts an arbitrary URL.
 */
export async function GET(request: NextRequest) {
  const assetId = request.nextUrl.searchParams.get("asset_id")?.trim() ?? "";
  if (!assetId) return errorResponse("asset_id is required.", 400);

  const revision =
    request.nextUrl.searchParams.get("revision")?.trim() ?? "";
  const asset = revision
    ? await getAssetBrowserRegistryAsset(assetId, revision)
    : await getMyWayAsset(assetId);
  if (!asset) return errorResponse("Asset not found.", 404);

  if (!isApprovedForSandbox(asset)) {
    return errorResponse("Asset is not eligible for Sandbox real-asset proof.", 403);
  }

  if (asset.asset_type !== "glb" && asset.asset_type !== "gltf") {
    return errorResponse("Asset is not a browser-loadable model.", 415);
  }

  if (
    asset.storage_provider === "r2" &&
    asset.storage_object_key
  ) {
    try {
      const stored =
        await getR2RuntimeStorage().read(
          asset.storage_object_key,
        );

      if (!stored) {
        return errorResponse(
          `Runtime R2 object is missing for asset ${asset.asset_id}: ${asset.storage_object_key}`,
          404,
        );
      }

      return new NextResponse(
        Buffer.from(stored.body),
        {
          status: 200,
          headers: browserHeaders({
            contentType:
              browserContentType(
                asset,
                stored.content_type,
              ),
            contentLength:
              stored.size_bytes,
            etag:
              stored.etag,
            source:
              "runtime_r2_object_key",
          }),
        },
      );
    } catch (caught) {
      return errorResponse(
        `Runtime R2 read failed for asset ${asset.asset_id}: ${
          caught instanceof Error ? caught.message : String(caught)
        }`,
        502,
      );
    }
  }

  const publicUrl = asset.public_path.trim();
  if (!/^https:\/\//i.test(publicUrl)) {
    return errorResponse(
      "This bridge requires a runtime R2 object key or a reviewed remote HTTPS model.",
      400,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(publicUrl, { cache: "force-cache" });
  } catch (caught) {
    return errorResponse(
      `Reviewed model could not be reached upstream: ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
      502,
    );
  }

  if (!upstream.ok) {
    return errorResponse(
      `Reviewed model download failed upstream (${upstream.status} ${upstream.statusText}).`,
      502,
    );
  }

  return new NextResponse(
    upstream.body,
    {
      status: 200,
      headers: browserHeaders({
        contentType:
          browserContentType(
            asset,
            upstream.headers.get(
              "content-type",
            ),
          ),
        contentLength:
          Number(
            upstream.headers.get(
              "content-length",
            ),
          ) || null,
        etag:
          upstream.headers.get(
            "etag",
          ),
        source:
          "legacy_public_url",
      }),
    },
  );
}
