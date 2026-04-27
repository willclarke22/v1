import {
  createQdrantClient,
  hasQdrantConfig,
  TOPIC_COLLECTION,
} from "@/lib/vector/qdrant";
import { embedText } from "@/lib/vector/embed";
import type { VectorInfo } from "@/types/contracts";

type QdrantTopicPayload = {
  topic_id?: unknown;
  topic_name?: unknown;
};

type QueryTopicsTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

type QueryTopicsTimingDebug = {
  enabled: boolean;
  total_ms: number;
  steps: QueryTopicsTimingStep[];
  metadata: {
    route: "querySemanticTopicCandidates";
    requested_limit: number;
    returned_points: number;
    returned_topics: number;
    has_qdrant_config: boolean;
    skipped_reason: string | null;
  };
};

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function createQueryTopicsTimer() {
  const enabled = process.env.MYWAY_VECTOR_QUERY_TIMING !== "off";
  const startedAt = performance.now();
  let lastMark = startedAt;
  const steps: QueryTopicsTimingStep[] = [];

  function step(label: string) {
    if (!enabled) return;

    const now = performance.now();

    steps.push({
      label,
      duration_ms: roundMs(now - lastMark),
      elapsed_ms: roundMs(now - startedAt),
    });

    lastMark = now;
  }

  function finish(
    metadata: QueryTopicsTimingDebug["metadata"]
  ): QueryTopicsTimingDebug {
    return {
      enabled,
      total_ms: roundMs(performance.now() - startedAt),
      steps,
      metadata,
    };
  }

  return {
    step,
    finish,
  };
}

function logQueryTopicsTiming(debug: QueryTopicsTimingDebug) {
  if (!debug.enabled) return;
  console.info("[querySemanticTopicCandidates timing]", debug);
}

function normalizeRequestedLimit(limit: number) {
  if (!Number.isFinite(limit)) return 5;
  return Math.max(1, Math.min(10, Math.floor(limit)));
}

export async function querySemanticTopicCandidates(
  message: string,
  limit = 5
): Promise<VectorInfo> {
  const timer = createQueryTopicsTimer();
  const requestedLimit = normalizeRequestedLimit(limit);

  if (typeof message !== "string" || !message.trim()) {
    const debug = timer.finish({
      route: "querySemanticTopicCandidates",
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: hasQdrantConfig(),
      skipped_reason: "empty_message",
    });

    logQueryTopicsTiming(debug);
    return emptyVectorInfo();
  }

  timer.step("validate_message");

  const hasConfig = hasQdrantConfig();

  if (!hasConfig) {
    const debug = timer.finish({
      route: "querySemanticTopicCandidates",
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: false,
      skipped_reason: "missing_qdrant_config",
    });

    logQueryTopicsTiming(debug);
    return emptyVectorInfo();
  }

  timer.step("check_qdrant_config");

  let vector: number[];

  try {
    vector = await embedText(message);
  } catch (error) {
    timer.step("embed_text_failed");
    const debug = timer.finish({
      route: "querySemanticTopicCandidates",
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: true,
      skipped_reason:
        error instanceof Error
          ? `embed_text_failed: ${error.message}`
          : "embed_text_failed",
    });
    logQueryTopicsTiming(debug);
    throw error;
  }

  timer.step("embed_text");

  const qdrant = createQdrantClient();
  timer.step("create_qdrant_client");

  const result = await qdrant.query(TOPIC_COLLECTION, {
    query: vector,
    limit: requestedLimit,
    // Only request the payload fields needed for route-level topic matching.
    // This avoids pulling large topic JSON payloads from Qdrant if they exist.
    with_payload: ["topic_id", "topic_name"],
  });
  timer.step("qdrant_query");

  const top_k_topic_names: string[] = [];
  const top_k_topic_ids: string[] = [];
  const top_k_similarity_scores: number[] = [];

  const points = Array.isArray(result.points) ? result.points : [];

  for (const point of points) {
    const payload = (point.payload ?? {}) as QdrantTopicPayload;

    const topicId = asString(payload.topic_id);
    const topicName = asString(payload.topic_name);
    const score = asNumber(point.score);

    if (!topicId) {
      continue;
    }

    top_k_topic_ids.push(topicId);
    top_k_topic_names.push(topicName ?? topicId);
    top_k_similarity_scores.push(score ?? 0);
  }

  timer.step("normalize_results");

  const debug = timer.finish({
    route: "querySemanticTopicCandidates",
    requested_limit: requestedLimit,
    returned_points: points.length,
    returned_topics: top_k_topic_ids.length,
    has_qdrant_config: true,
    skipped_reason: null,
  });

  logQueryTopicsTiming(debug);

  return {
    top_k_topic_names,
    top_k_topic_ids,
    top_k_similarity_scores,
  };
}
