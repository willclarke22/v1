import { NextResponse } from "next/server";
import type { ProbeAttemptPayload } from "@/lib/learning-evaluation/attempt-judging";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import type { ProbeContractSnapshot } from "@/types/contracts";

export type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

export type ProbeSubmitBody = ProbeAttemptPayload & {
  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];

  /**
   * Contract snapshot for the probe the learner actually answered.
   *
   * During migration both names are accepted:
   * - answeredProbeContractSnapshot is the explicit preferred name.
   * - probeContractSnapshot is the shorter frontend compatibility name.
   */
  answeredProbeContractSnapshot?: ProbeContractSnapshot | null;
  probeContractSnapshot?: ProbeContractSnapshot | null;
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

export function getAnsweredProbeContractSnapshot(
  body: ProbeSubmitBody,
): ProbeContractSnapshot | null {
  const candidate =
    body.answeredProbeContractSnapshot ?? body.probeContractSnapshot ?? null;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  return JSON.parse(JSON.stringify(candidate)) as ProbeContractSnapshot;
}

/**
 * Returns a text representation for legacy route scoring, model queues, and run
 * user_message content.
 *
 * Important:
 * Do not feed this value back into buildAttemptEvidencePackage as
 * body.response. The engine evidence normalizer needs the original structured
 * response object when the probe is multiple choice, ordering, slider,
 * drag/drop, graph match, etc.
 */
export function normalizeProbeRawResponse(body: ProbeSubmitBody): string {
  if (typeof body?.response === "string") {
    return body.response;
  }

  try {
    return JSON.stringify(body?.response ?? "");
  } catch {
    return String(body?.response ?? "");
  }
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
