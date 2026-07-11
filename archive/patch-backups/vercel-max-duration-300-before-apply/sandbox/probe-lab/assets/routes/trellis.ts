import { NextRequest, NextResponse } from "next/server";

import { acquireFromTrellis } from "../providers/trellis-asset-provider.server";

export const maxDuration = 900;

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function nonnegativeInteger(
  value: unknown,
  fallback: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? Math.floor(value)
    : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const concept =
      typeof body.concept === "string"
        ? body.concept.trim()
        : "";

    if (!concept) {
      return NextResponse.json(
        {
          ok: false,
          error: "concept is required",
        },
        { status: 400 },
      );
    }

    const result = await acquireFromTrellis({
      concept,
      semanticTags: stringArray(body.semantic_tags),
      styleTags: stringArray(body.style_tags),
      domain:
        typeof body.domain === "string"
          ? body.domain.trim() || "generic"
          : "generic",
      targetExtentM:
        typeof body.target_extent_m === "number" &&
        Number.isFinite(body.target_extent_m) &&
        body.target_extent_m > 0
          ? body.target_extent_m
          : 2,
      noTexture: body.no_texture === true,
      seed: nonnegativeInteger(body.seed, 0),
      maxAttempts: Math.min(
        3,
        Math.max(
          1,
          nonnegativeInteger(body.max_attempts, 3),
        ),
      ),
    });

    return NextResponse.json({
      ok: true,
      source: "trellis",
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
        debug_path:
          "sandbox/probe-lab/assets/debug/latest-trellis-response.json",
      },
      { status: 502 },
    );
  }
}
