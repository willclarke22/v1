import { NextRequest, NextResponse } from "next/server";

import { repairBlenderPython } from "../glm-blender-python.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const code = String(body.code ?? "");
    const blenderError = String(body.error ?? body.blender_error ?? "");

    const result = await repairBlenderPython({
      code,
      blenderError,
      request: String(body.request ?? ""),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      line_count: result.code.split(/\r?\n/).length,
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
