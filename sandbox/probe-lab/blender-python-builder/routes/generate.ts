import { NextRequest, NextResponse } from "next/server";

import { generateBlenderPython } from "../glm-blender-python.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const buildRequest = String(body.request ?? "").trim();

    if (!buildRequest) {
      return NextResponse.json(
        { ok: false, error: "A build request is required." },
        { status: 400 },
      );
    }

    const targetExtentM = Math.min(
      20,
      Math.max(0.05, Number(body.target_extent_m ?? 2)),
    );
    const maxTriangles = Math.min(
      250_000,
      Math.max(500, Math.round(Number(body.max_triangles ?? 30_000))),
    );

    const result = await generateBlenderPython({
      request: buildRequest,
      style: String(body.style ?? "clean stylized").trim() || "clean stylized",
      animationReady: body.animation_ready !== false,
      targetExtentM,
      maxTriangles,
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
