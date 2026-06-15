import { NextResponse } from "next/server";
import type { ProbeAttemptPayload } from "@/lib/learning-evaluation/attempt-judging";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import type {
  EngineRenderableProbe,
  ProbeAttemptType,
} from "@/lib/engine";
import type { ProbeContractSnapshot } from "@/types/contracts";

export type IncomingChatTurn = {
  role?: string;
  text?: string;
  content?: string;
};

export type StructuredProbeAttemptSnapshot = {
  attempt_type?: ProbeAttemptType | string | null;
  [key: string]: unknown;
};

export type ProbeSubmitBody = Omit<ProbeAttemptPayload, "response"> & {
  /**
   * Keep response unknown at the request boundary because the frontend can now
   * send structured probe answers. normalizeProbeRawResponse projects this into
   * a legacy string for old scoring, while buildAttemptEvidencePackage should
   * receive the structured attempt when one exists.
   */
  response?: unknown;

  chat_history?: string;
  recent_turns?: IncomingChatTurn[];
  conversation_turns?: IncomingChatTurn[];

  /**
   * Structured answer produced by the renderer.
   *
   * During migration both names are accepted:
   * - structuredAttempt is the explicit route-boundary name.
   * - attempt mirrors the frontend renderer payload name.
   */
  structuredAttempt?: StructuredProbeAttemptSnapshot | null;
  attempt?: StructuredProbeAttemptSnapshot | null;

  /**
   * Engine-native probe rendered by the client. This lets the future evaluator
   * path reconstruct what was answered without reverse-engineering old snapshots.
   */
  engineRenderableProbe?: EngineRenderableProbe | null;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isEngineRenderableProbe(
  value: unknown,
): value is EngineRenderableProbe {
  return (
    isRecord(value) &&
    value.schema_version === "engine_renderable_probe_v1" &&
    typeof value.probe_type === "string" &&
    typeof value.expected_attempt_type === "string" &&
    isRecord(value.prompt)
  );
}

export function getStructuredProbeAttempt(
  body: ProbeSubmitBody,
): StructuredProbeAttemptSnapshot | null {
  const candidate =
    body.structuredAttempt ??
    body.attempt ??
    (isRecord(body.response) ? body.response : null);

  if (!isRecord(candidate)) {
    return null;
  }

  return cloneJson(candidate) as StructuredProbeAttemptSnapshot;
}

export function getBodyEngineRenderableProbe(
  body: ProbeSubmitBody,
): EngineRenderableProbe | null {
  if (!isEngineRenderableProbe(body.engineRenderableProbe)) {
    return null;
  }

  return cloneJson(body.engineRenderableProbe);
}

export function getEngineRenderableProbeFromContractSnapshot(
  snapshot: ProbeContractSnapshot | null | undefined,
): EngineRenderableProbe | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const candidate = snapshot.engine_renderable_probe;

  if (!isEngineRenderableProbe(candidate)) {
    return null;
  }

  return cloneJson(candidate);
}

export function getAnsweredEngineRenderableProbe(args: {
  body: ProbeSubmitBody;
  answeredProbeContractSnapshot: ProbeContractSnapshot | null;
}): EngineRenderableProbe | null {
  return (
    getBodyEngineRenderableProbe(args.body) ??
    getEngineRenderableProbeFromContractSnapshot(
      args.answeredProbeContractSnapshot,
    )
  );
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

  return cloneJson(candidate) as ProbeContractSnapshot;
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

  const structuredAttempt = getStructuredProbeAttempt(body);

  if (structuredAttempt) {
    try {
      return JSON.stringify(structuredAttempt);
    } catch {
      return String(structuredAttempt);
    }
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

