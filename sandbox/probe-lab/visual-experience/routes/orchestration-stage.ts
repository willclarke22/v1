import { NextResponse } from "next/server";

import { runVisualOrchestrationStage } from "../orchestration/run-stage.server";
import type { VisualOrchestrationRequest } from "../orchestration/contracts";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<VisualOrchestrationRequest>;
    const result = await runVisualOrchestrationStage(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "visual-experience/orchestration-stage",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
