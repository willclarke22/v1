import { NextResponse } from "next/server";
import type { ProbeAttemptPayload } from "@/lib/runtime/attempt-judging";
import type { RouteTopic } from "@/lib/runtime/route-topics";

export type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

export type ProbeSubmitBody = ProbeAttemptPayload & {
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];
};

export function readStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getBodyResponseType(body: ProbeSubmitBody): string | null {
  const widenedBody = body as ProbeSubmitBody & {
    responseType?: unknown;
  };

  return readStringField(widenedBody.responseType);
}

export function getBodyModality(body: ProbeSubmitBody): string | null {
  const widenedBody = body as ProbeSubmitBody & {
    deliveryContext?: {
      modality?: unknown;
    } | null;
  };

  return readStringField(widenedBody.deliveryContext?.modality);
}

export function normalizeProbeRawResponse(body: ProbeSubmitBody): string {
  return typeof body?.response === "string"
    ? body.response
    : JSON.stringify(body?.response ?? "");
}

export function validateProbeSubmitBody(args: {
  body: ProbeSubmitBody;
  rawResponse: string;
}): NextResponse | null {
  if (
    !args.body?.probeId ||
    !args.body?.topicId ||
    typeof args.rawResponse !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing required fields: probeId, topicId, response." },
      { status: 400 },
    );
  }

  return null;
}

export function getRouteTopicLabel(topic: RouteTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}
