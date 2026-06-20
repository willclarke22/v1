import { NextResponse } from "next/server";
import {
  buildLocalServiceThreeModelProbeSubmitResponse,
  shouldUseLocalServiceThreeModelProbeSubmitRoute,
} from "@/lib/api-routes/probe-submit/local-service-3model-response";
import { buildMockThreeModelProbeSubmitResponse } from "@/lib/api-routes/probe-submit/mock-3model-response";

/**
 * 3-model probe-submit route switch.
 *
 * Default remains the known-good mock submit path.
 *
 * Set MYWAY_USE_LOCAL_SERVICE_3MODEL=1, or the narrower
 * MYWAY_USE_LOCAL_SERVICE_3MODEL_PROBE_SUBMIT=1, to run the local service
 * Probe Attempt Evaluator and create a follow-up probe from the same answered
 * probe snapshot.
 *
 * Important latency rule:
 * This route does not run topic embeddings and does not re-route the topic from
 * scratch. The answered probe snapshot is the source of truth.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (shouldUseLocalServiceThreeModelProbeSubmitRoute()) {
      return NextResponse.json(
        await buildLocalServiceThreeModelProbeSubmitResponse(body),
      );
    }

    return NextResponse.json(await buildMockThreeModelProbeSubmitResponse(body));
  } catch (error) {
    console.error("POST /api/probe/submit 3-model route failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build 3-model probe-submit response.",
      },
      { status: 500 },
    );
  }
}
