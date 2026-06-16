import { NextResponse } from "next/server";
import { buildMockThreeModelProbeSubmitResponse } from "@/lib/api-routes/probe-submit/mock-3model-response";

/**
 * Temporary 3-model probe-submit route.
 *
 * During the model-pipeline cleanup phase, probe submission no longer uses the
 * old heuristic attempt evidence / contract-judgment / follow-up planning path.
 *
 * It now proves this loop:
 *
 *   submitted structured attempt
 *   â†’ mock Probe Attempt Evaluator output
 *   â†’ engine next-action route
 *   â†’ mock Probe Contract output
 *   â†’ EngineRenderableProbe
 *   â†’ frontend probe loop
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    return NextResponse.json(
      await buildMockThreeModelProbeSubmitResponse(body),
    );
  } catch (error) {
    console.error("POST /api/probe/submit mock 3-model route failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build mock 3-model probe-submit response.",
      },
      { status: 500 },
    );
  }
}
