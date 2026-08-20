import { NextRequest, NextResponse } from "next/server";

import { getMyWayAsset } from "../../assets/asset-library.server";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isApprovedForSandbox(asset: NonNullable<Awaited<ReturnType<typeof getMyWayAsset>>>) {
  return (
    asset.status !== "rejected" &&
    asset.scene_review_status !== "rejected" &&
    asset.semantic_review_status !== "rejected" &&
    asset.semantic_review_status !== "mismatch" &&
    asset.safe_to_use_in_sandbox !== false
  );
}

/**
 * Same-origin browser bridge for reviewed remote model assets.
 *
 * Security boundary: callers supply only an Asset Library id. The upstream URL
 * is read from that reviewed registry record; this route never accepts an
 * arbitrary URL and therefore is not a generic SSRF proxy.
 */
export async function GET(request: NextRequest) {
  const assetId = request.nextUrl.searchParams.get("asset_id")?.trim() ?? "";
  if (!assetId) return errorResponse("asset_id is required.", 400);

  const asset = await getMyWayAsset(assetId);
  if (!asset) return errorResponse("Asset not found.", 404);

  if (!isApprovedForSandbox(asset)) {
    return errorResponse("Asset is not eligible for Sandbox real-asset proof.", 403);
  }

  if (asset.asset_type !== "glb" && asset.asset_type !== "gltf") {
    return errorResponse("Asset is not a browser-loadable model.", 415);
  }

  const publicUrl = asset.public_path.trim();
  if (!/^https:\/\//i.test(publicUrl)) {
    return errorResponse("This bridge is only used for reviewed remote HTTPS models.", 400);
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

  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ||
      (asset.asset_type === "glb" ? "model/gltf-binary" : "model/gltf+json"),
  );
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
