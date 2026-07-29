import { NextRequest, NextResponse } from "next/server";

import { executeBlenderPython } from "../blender-python-runner.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const code = String(body.code ?? "");
    const assetName = String(body.asset_name ?? "generated_asset");

    const result = await executeBlenderPython({
      code,
      assetName,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      },
      { status: 502 },
    );
  }
}
