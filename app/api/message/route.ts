import { NextResponse } from "next/server";
import { buildLocalServiceThreeModelMessageRouteResponse } from "@/lib/api-routes/message/local-service-3model-response";
import { buildMockThreeModelMessageRouteResponse } from "@/lib/api-routes/message/mock-3model-response";
import { shouldUseLocalServiceThreeModelMessageRoute } from "@/lib/api-routes/message/local-service-3model-response";

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
 * 3-model pipeline route switch.
 *
 * Default remains the known-good mock path.
 *
 * Set MYWAY_USE_LOCAL_SERVICE_3MODEL=1 to let /api/message call the real local
 * service clients and deliver their ProbeContractModelOutput through the normal
 * frontend probe renderer path.
 *
 * Important latency rule:
 * This foreground route does not start the heavy embedding service. It passes
 * request context into the local-service adapter, which uses a cheap foreground
 * topic resolver. Embedding-backed semantic enrichment stays in the local-dev
 * semantic worker.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = getMessageText(body) || "mock 3-model message";

    if (shouldUseLocalServiceThreeModelMessageRoute()) {
      return NextResponse.json(
        await buildLocalServiceThreeModelMessageRouteResponse({
          message,
          requestBody: body,
        }),
      );
    }

    return NextResponse.json(
      await buildMockThreeModelMessageRouteResponse({ message }),
    );
  } catch (error) {
    console.error("POST /api/message 3-model route failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build 3-model message response.",
      },
      { status: 500 },
    );
  }
}
