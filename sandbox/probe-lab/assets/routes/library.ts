import { NextRequest, NextResponse } from "next/server";

import { assetWithFileStats, getMyWayAsset, listMyWayAssets, registerMyWayAsset } from "../asset-library.server";

export async function GET(request: NextRequest) {
  const assetId = request.nextUrl.searchParams.get("asset_id");
  if (assetId) {
    const asset = await getMyWayAsset(assetId);
    if (!asset) return NextResponse.json({ ok: false, error: "Asset not found." }, { status: 404 });
    return NextResponse.json({ ok: true, asset: await assetWithFileStats(asset) });
  }
  const assets = await Promise.all((await listMyWayAssets()).map(assetWithFileStats));
  return NextResponse.json({ ok: true, count: assets.length, assets });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await registerMyWayAsset(body.asset ?? body);
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : String(caught) }, { status: 400 });
  }
}
