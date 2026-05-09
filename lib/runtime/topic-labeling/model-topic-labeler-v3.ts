export type TopicReferenceTypeV3 =
  | "explicit_topic_reference"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

export type TopicLabelerV3RouteDecision =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "clarify_topic_intent"
  | "clarify_no_topic"
  | "error_unknown_reference_type";

export type TopicLabelerV3Request = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};

export type TopicLabelerV3ModelPrediction = {
  topic_reference_type: TopicReferenceTypeV3;
  extracted_label: string | null;
};

export type TopicLabelerV3Route = {
  route_decision: TopicLabelerV3RouteDecision;
  topic_reference_type: TopicReferenceTypeV3 | string;
  extracted_label: string | null;
  matched_topic_name: string | null;
  match_type: string | null;
  score: number | null;
  sequence_similarity?: number | null;
  token_f1?: number | null;
  reason: string;
};

export type TopicLabelerV3Response = {
  ok: boolean;
  model_version: string;
  model_prediction: TopicLabelerV3ModelPrediction;
  route: TopicLabelerV3Route;
};

export type TopicLabelerV3ClientResult =
  | {
      ok: true;
      source: "topic_labeler_v3";
      response: TopicLabelerV3Response;
      latency_ms: number;
    }
  | {
      ok: false;
      source: "topic_labeler_v3";
      error: string;
      latency_ms: number;
    };

const DEFAULT_TOPIC_LABELER_V3_URL = "http://127.0.0.1:8003/label-topic";

function getTopicLabelerV3Url(): string {
  return (
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

export function buildTopicLabelerV3Request(input: {
  message: string;
  activeTopicName?: string | null;
  currentTopicNames?: string[];
  previousUserMessages?: string[];
}): TopicLabelerV3Request {
  return {
    message: input.message,
    active_topic_name: input.activeTopicName?.trim() || null,
    current_topic_names: normalizeStringArray(input.currentTopicNames),
    previous_user_messages: normalizeStringArray(input.previousUserMessages).slice(
      -5
    ),
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
        source: "topic_labeler_v3",
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
        source: "topic_labeler_v3",
        error: `Topic labeler V3 returned HTTP ${response.status}: ${text}`,
        latency_ms: Date.now() - startedAt,
      };
    }

    let parsed: TopicLabelerV3Response;

    try {
      parsed = JSON.parse(text) as TopicLabelerV3Response;
    } catch {
      return {
        ok: false,
        source: "topic_labeler_v3",
        error: `Topic labeler V3 returned invalid JSON: ${text}`,
        latency_ms: Date.now() - startedAt,
      };
    }

    return {
      ok: true,
      source: "topic_labeler_v3",
      response: parsed,
      latency_ms: Date.now() - startedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Topic labeler V3 request timed out after ${timeoutMs}ms.`
          : error.message
        : "Unknown topic labeler V3 error.";

    return {
      ok: false,
      source: "topic_labeler_v3",
      error: message,
      latency_ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}