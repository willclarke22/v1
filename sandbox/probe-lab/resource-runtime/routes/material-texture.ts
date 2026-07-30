import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  MAX_RUNTIME_TEXTURE_BYTES,
  resolveReviewedMaterialTextureUrl,
} from "../material-texture-proxy.server";

export const maxDuration = 300;

export async function GET(
  request: NextRequest,
) {
  try {
    const requestedUrl =
      request.nextUrl.searchParams
        .get("url")
        ?.trim() ?? "";

    if (!requestedUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A reviewed material texture URL is required.",
        },
        { status: 400 },
      );
    }

    const match =
      await resolveReviewedMaterialTextureUrl(
        requestedUrl,
      );

    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The requested URL is not part of a reviewed, R2-published material binding.",
        },
        { status: 403 },
      );
    }

    const upstream = await fetch(
      match.public_url,
      {
        cache: "force-cache",
      },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `The authoritative texture download failed (${upstream.status} ${upstream.statusText}).`,
        },
        { status: 502 },
      );
    }

    const announcedBytes = Number(
      upstream.headers.get(
        "content-length",
      ) ?? "0",
    );

    if (
      Number.isFinite(announcedBytes) &&
      announcedBytes > MAX_RUNTIME_TEXTURE_BYTES
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The reviewed texture exceeds the 64 MB runtime safety limit.",
        },
        { status: 413 },
      );
    }

    const bytes =
      await upstream.arrayBuffer();

    if (
      bytes.byteLength >
      MAX_RUNTIME_TEXTURE_BYTES
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The reviewed texture exceeds the 64 MB runtime safety limit.",
        },
        { status: 413 },
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type":
          upstream.headers.get(
            "content-type",
          ) ??
          "application/octet-stream",
        "content-length":
          String(bytes.byteLength),
        "cache-control":
          "public, max-age=31536000, immutable",
        "x-content-type-options":
          "nosniff",
        "x-myway-material-resource-id":
          match.resource_id,
        "x-myway-material-texture-role":
          match.role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
