import { NextResponse } from "next/server";
import { buildMockThreeModelMessageRouteResponse } from "@/lib/api-routes/message/mock-3model-response";

function getMessageText(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  const record = body as Record<string, unknown>;
  const messageText =
    typeof record.messageText === "string"
      ? record.messageText
      : typeof record.message === "string"
        ? record.message
        : "";

  return messageText.trim();
}

/**
 * Temporary 3-model pipeline route.
 *
 * The old /api/message path mixed topic routing, model-signal queues,
 * deterministic intervention planning, legacy probe-plan building, persistence,
 * and learning-space projection in one active route.
 *
 * For the 3-model buildout phase, this route now proves the clean loop:
 *
 *   models/diagnosis
 *   â†’ models/probe-contract
 *   â†’ lib/engine
 *   â†’ EngineRenderableProbe
 *   â†’ frontend probe renderer
 *
 * The previous full route is backed up under archive/ by the step-23a script.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = getMessageText(body) || "mock 3-model message";

    return NextResponse.json(
      await buildMockThreeModelMessageRouteResponse({ message }),
    );
  } catch (error) {
    console.error("POST /api/message mock 3-model route failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build mock 3-model message response.",
      },
      { status: 500 },
    );
  }
}
