import type {
  TopicLabelerClientResult,
  TopicLabelerProviderId,
  TopicLabelerRequest,
  TopicLabelerResponse,
  TopicLabelerRoute,
  TopicLabelerRouteDecision,
  TopicReferenceType,
} from "./contract";

export type TopicReferenceTypeV3 = TopicReferenceType;

export type TopicLabelerV3RouteDecision = TopicLabelerRouteDecision;

export type TopicLabelerV3Request = TopicLabelerRequest;

export type TopicLabelerV3ModelPrediction = {
  topic_reference_type: TopicReferenceTypeV3 | string;
  extracted_label: string | null;
};

export type TopicLabelerV3Route = TopicLabelerRoute;

export type TopicLabelerV3RawResponse = {
  ok: boolean;
  model_version: string;
  model_prediction: TopicLabelerV3ModelPrediction;
  route: TopicLabelerV3Route;
  timing?: unknown;
};

export type TopicLabelerV3Response = TopicLabelerResponse;

export type TopicLabelerV3ClientResult = TopicLabelerClientResult;

const TOPIC_LABELER_V3_PROVIDER: TopicLabelerProviderId = "v3";

/**
 * Match the local FastAPI service command we have been using:
 *
 * python -m uvicorn services.topic_labeler_v3.app:app --host 127.0.0.1 --port 8002 --reload
 *
 * The env var still wins, so this default is only a fallback.
 */
const DEFAULT_TOPIC_LABELER_V3_URL = "http://127.0.0.1:8002/label-topic";

function getTopicLabelerV3Url(): string {
  return (
    process.env.MYWAY_TOPIC_LABELER_V3_URL?.trim() ||
    process.env.TOPIC_LABELER_V3_URL?.trim() ||
    DEFAULT_TOPIC_LABELER_V3_URL
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeV3Route(rawRoute: TopicLabelerV3RawResponse["route"]): TopicLabelerRoute {
  return {
    route_decision: rawRoute.route_decision,
    topic_reference_type: rawRoute.topic_reference_type,
    extracted_label: normalizeNullableString(rawRoute.extracted_label),
    matched_topic_label: normalizeNullableString(rawRoute.matched_topic_label),
    match_type: normalizeNullableString(rawRoute.match_type),
    score: normalizeNumber(rawRoute.score),
    sequence_similarity: normalizeNumber(rawRoute.sequence_similarity),
    token_f1: normalizeNumber(rawRoute.token_f1),
    reason:
      typeof rawRoute.reason === "string" && rawRoute.reason.trim()
        ? rawRoute.reason.trim()
        : "No route reason returned by topic labeler V3.",
  };
}

function normalizeTopicLabelerV3Response(
  raw: TopicLabelerV3RawResponse
): TopicLabelerResponse {
  return {
    ok: Boolean(raw.ok),
    provider: TOPIC_LABELER_V3_PROVIDER,
    model_version:
      typeof raw.model_version === "string" && raw.model_version.trim()
        ? raw.model_version.trim()
        : "topic-labeler-v3-unknown",
    model_prediction: {
      topic_reference_type: raw.model_prediction?.topic_reference_type,
      extracted_label: normalizeNullableString(
        raw.model_prediction?.extracted_label
      ),
    },
    route: normalizeV3Route(raw.route),
    raw,
  };
}

export function buildTopicLabelerV3Request(input: {
  message: string;
  activeTopicLabel?: string | null;
  currentTopicLabels?: string[];
  previousUserMessages?: string[];
}): TopicLabelerV3Request {
  return {
    message: input.message,
    active_topic_label: input.activeTopicLabel?.trim() || null,
    current_topic_labels: normalizeStringArray(input.currentTopicLabels),
    previous_user_messages: normalizeStringArray(
      input.previousUserMessages
    ).slice(-5),
  };
}

export async function callTopicLabelerV3(
  request: TopicLabelerV3Request,
  options?: {
    timeoutMs?: number;
  }
): Promise<TopicLabelerV3ClientResult> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const url = getTopicLabelerV3Url();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!request.message.trim()) {
      return {
        ok: false,
        source: "topic_labeler",
        provider: TOPIC_LABELER_V3_PROVIDER,
        error: "Cannot call topic labeler V3 with an empty message.",
        latency_ms: Date.now() - startedAt,
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        source: "topic_labeler",
        provider: TOPIC_LABELER_V3_PROVIDER,
        error: `Topic labeler V3 returned HTTP ${response.status}: ${text}`,
        latency_ms: Date.now() - startedAt,
      };
    }

    let parsed: TopicLabelerV3RawResponse;

    try {
      parsed = JSON.parse(text) as TopicLabelerV3RawResponse;
    } catch {
      return {
        ok: false,
        source: "topic_labeler",
        provider: TOPIC_LABELER_V3_PROVIDER,
        error: `Topic labeler V3 returned invalid JSON: ${text}`,
        latency_ms: Date.now() - startedAt,
      };
    }

    return {
      ok: true,
      source: "topic_labeler",
      provider: TOPIC_LABELER_V3_PROVIDER,
      response: normalizeTopicLabelerV3Response(parsed),
      latency_ms: Date.now() - startedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message || `Topic labeler V3 request failed after ${timeoutMs}ms.`
        : "Unknown topic labeler V3 error.";

    return {
      ok: false,
      source: "topic_labeler",
      provider: TOPIC_LABELER_V3_PROVIDER,
      error: message,
      latency_ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}