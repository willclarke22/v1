import { NextResponse } from "next/server";

import type { CreativeVisualThesisRequest } from "../creative-thesis/contracts";
import { runCreativeVisualThesisBench } from "../creative-thesis/run.server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CreativeVisualThesisRequest>;
    const result = await runCreativeVisualThesisBench(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/creative-thesis",
        phase: "divergence_provider",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
