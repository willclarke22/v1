import { NextResponse } from "next/server";

import {
  assetEnrichmentQueueSnapshot,
  queueAllAssetEnrichment,
  queueAssetEmbeddingRefresh,
  queueAssetEnrichment,
  queueNextAssetEnrichment,
} from "../enrichment/asset-enrichment-worker.server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    queue: assetEnrichmentQueueSnapshot(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "analyze_vision") {
      const assetId =
        typeof body.asset_id === "string" ? body.asset_id.trim() : "";
      if (!assetId) {
        return NextResponse.json(
          { ok: false, error: "asset_id is required." },
          { status: 400 },
        );
      }
      const entry = queueAssetEnrichment(assetId, {
        force: body.force === true,
        runEmbedding: false,
      });
      return NextResponse.json({ ok: true, entry });
    }

    if (action === "refresh_embedding") {
      const assetId =
        typeof body.asset_id === "string" ? body.asset_id.trim() : "";
      if (!assetId) {
        return NextResponse.json(
          { ok: false, error: "asset_id is required." },
          { status: 400 },
        );
      }
      const entry = queueAssetEmbeddingRefresh(assetId);
      return NextResponse.json({ ok: true, entry });
    }

    if (action === "enrich_asset") {
      const assetId =
        typeof body.asset_id === "string" ? body.asset_id.trim() : "";
      if (!assetId) {
        return NextResponse.json(
          { ok: false, error: "asset_id is required." },
          { status: 400 },
        );
      }

      const entry = queueAssetEnrichment(assetId, {
        force: body.force === true,
      });
      return NextResponse.json({ ok: true, entry });
    }


    if (action === "enrich_all") {
      const result =
        await queueAllAssetEnrichment({
          force: body.force === true,
        });
      return NextResponse.json({
        ok: true,
        queued_count:
          result.entries.length,
        skipped_count:
          result.skipped.length,
        entries: result.entries,
        skipped: result.skipped,
      });
    }

    if (action === "backfill_next") {
      const entry = await queueNextAssetEnrichment();
      return NextResponse.json({ ok: true, entry });
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported enrichment action." },
      { status: 400 },
    );
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      },
      { status: 500 },
    );
  }
}
