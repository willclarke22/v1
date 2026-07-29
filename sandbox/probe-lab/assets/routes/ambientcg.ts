
import { NextRequest, NextResponse } from "next/server";

import {
  searchAmbientCgCatalog,
  syncAmbientCgCatalogPage,
} from "../catalog/ambientcg/ambientcg-client.server";
import { cacheAmbientCgAsset } from "../catalog/ambientcg/ambientcg-download.server";
import {
  readAmbientCgDownloadJobs,
  readAmbientCgHdriRegistry,
  readAmbientCgMaterialRegistry,
  readAmbientCgSyncState,
} from "../catalog/ambientcg/ambientcg-store.server";

function errorResponse(caught: unknown, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
    },
    { status },
  );
}

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get("view") ?? "catalog";
    if (view === "status") {
      const [sync, materials, hdris, jobs] = await Promise.all([
        readAmbientCgSyncState(),
        readAmbientCgMaterialRegistry(),
        readAmbientCgHdriRegistry(),
        readAmbientCgDownloadJobs(),
      ]);
      return NextResponse.json({
        ok: true,
        sync,
        counts: {
          materials: materials.materials.length,
          hdris: hdris.hdris.length,
          jobs: jobs.jobs.length,
        },
      });
    }
    if (view === "materials") {
      const registry = await readAmbientCgMaterialRegistry();
      return NextResponse.json({ ok: true, ...registry });
    }
    if (view === "hdris") {
      const registry = await readAmbientCgHdriRegistry();
      return NextResponse.json({ ok: true, ...registry });
    }
    if (view === "jobs") {
      const registry = await readAmbientCgDownloadJobs();
      return NextResponse.json({ ok: true, ...registry });
    }

    const result = await searchAmbientCgCatalog({
      query: request.nextUrl.searchParams.get("q") ?? "",
      type: request.nextUrl.searchParams.get("type") ?? "all",
      status: request.nextUrl.searchParams.get("status") ?? "all",
      page: numberParam(request.nextUrl.searchParams.get("page"), 1),
      limit: numberParam(request.nextUrl.searchParams.get("limit"), 24),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    return errorResponse(caught, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "sync_page") {
      const result = await syncAmbientCgCatalogPage({
        restart: body.restart === true,
        pageLimit: typeof body.page_limit === "number" ? body.page_limit : undefined,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "cache") {
      const sourceAssetId = typeof body.source_asset_id === "string" ? body.source_asset_id.trim() : "";
      if (!sourceAssetId) throw new Error("source_asset_id is required.");
      const result = await cacheAmbientCgAsset({
        sourceAssetId,
        variantId: typeof body.variant_id === "string" ? body.variant_id : undefined,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    throw new Error("Unknown ambientCG action.");
  } catch (caught) {
    return errorResponse(caught);
  }
}
