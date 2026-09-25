import { NextResponse } from "next/server";

import { runStandaloneAssetSearchBench } from "../../assets/search/asset-search-bench.server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await runStandaloneAssetSearchBench(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/asset-search-bench",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
