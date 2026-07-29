import { NextRequest, NextResponse } from "next/server";

import { assetWithFileStats } from "../asset-library.server";
import { queueAssetEnrichment } from "../enrichment/asset-enrichment-worker.server";
import { acquireFromTrellis } from "../providers/trellis-asset-provider.server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const body = (await request.json()) as Record<string, unknown>;
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

    const semanticTags = stringArray(body.semantic_tags);
    const acquisitionTerms = stringArray(body.acquisition_terms);
    const targetExtentM =
      typeof body.target_extent_m === "number" &&
      Number.isFinite(body.target_extent_m) &&
      body.target_extent_m > 0
        ? Math.min(20, Math.max(0.05, body.target_extent_m))
        : 2;

    const result = await acquireFromTrellis({
      concept,
      semanticTags,
      acquisitionTerms,
      domain:
        typeof body.domain === "string"
          ? body.domain.trim() || "asset_library_manual_trellis"
          : "asset_library_manual_trellis",
      targetExtentM,
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

    const entry = queueAssetEnrichment(result.asset.asset_id, {
      force: true,
    });

    return NextResponse.json({
      ok: true,
      source: "trellis",
      created: result.created,
      asset: await assetWithFileStats(result.asset),
      enrichment_entry: entry,
      normalization_extent_m: targetExtentM,
      generated_prompt: result.asset.source_prompt ?? null,
      message:
        "TRELLIS generated the asset and MyWay queued its appearance and identity analysis. Review the generated model before approving it for scenes.",
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
