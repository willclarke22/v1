import {
  createQdrantClient,
  hasQdrantConfig,
  TOPIC_COLLECTION,
} from "@/lib/vector/qdrant";
import { embedText } from "@/lib/vector/embed";
import type { EmbeddingVector, VectorInfo } from "@/types/contracts";

type QdrantTopicPayload = {
  topic_id?: unknown;
  topic_name?: unknown;
  topic_embedding_count?: unknown;
  topic_embedding_model?: unknown;
};

export type SemanticTopicCandidate = {
  topic_id: string;
  topic_name: string;
  similarity: number;
  rank: number;
  topic_embedding_count: number | null;
  topic_embedding_model: string | null;
};

export type SemanticTopicQueryResult = {
  vectorInfo: VectorInfo;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  candidates: SemanticTopicCandidate[];
  debug?: QueryTopicsTimingDebug;
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
    route: "querySemanticTopicCandidates" | "querySemanticTopicCandidatesWithEmbedding";
    requested_limit: number;
    returned_points: number;
    returned_topics: number;
    has_qdrant_config: boolean;
    skipped_reason: string | null;
    message_embedding_available: boolean;
    embedding_model: string | null;
  };
};

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function emptySemanticTopicQueryResult(args?: {
  route?: QueryTopicsTimingDebug["metadata"]["route"];
  requestedLimit?: number;
  skippedReason?: string | null;
  hasQdrant?: boolean;
  debug?: QueryTopicsTimingDebug;
}): SemanticTopicQueryResult {
  return {
    vectorInfo: emptyVectorInfo(),
    messageEmbedding: null,
    embeddingModel: null,
    candidates: [],
    debug: args?.debug,
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const numberValue = asNumber(value);
  if (numberValue == null) return null;
  return Math.max(0, Math.floor(numberValue));
}

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
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
    metadata: QueryTopicsTimingDebug["metadata"],
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
  console.info(`[${debug.metadata.route} timing]`, debug);
}

function normalizeRequestedLimit(limit: number) {
  if (!Number.isFinite(limit)) return 5;
  return Math.max(1, Math.min(10, Math.floor(limit)));
}

function getEmbeddingModelName() {
  return (
    process.env.MYWAY_EMBEDDING_MODEL ??
    process.env.EMBEDDING_MODEL ??
    "local-embedding-service"
  );
}

function vectorInfoFromCandidates(candidates: SemanticTopicCandidate[]): VectorInfo {
  return {
    top_k_topic_names: candidates.map((candidate) => candidate.topic_name),
    top_k_topic_ids: candidates.map((candidate) => candidate.topic_id),
    top_k_similarity_scores: candidates.map((candidate) => candidate.similarity),
  };
}

function normalizeQdrantCandidates(points: unknown[]): SemanticTopicCandidate[] {
  const candidates: SemanticTopicCandidate[] = [];

  for (const [index, pointUnknown] of points.entries()) {
    const point = pointUnknown as {
      payload?: unknown;
      score?: unknown;
    };

    const payload = (point.payload ?? {}) as QdrantTopicPayload;

    const topicId = asString(payload.topic_id);
    const topicName = asString(payload.topic_name);
    const score = asNumber(point.score);

    if (!topicId) continue;

    candidates.push({
      topic_id: topicId,
      topic_name: topicName ?? topicId,
      similarity: score ?? 0,
      rank: index,
      topic_embedding_count: asNonNegativeInteger(payload.topic_embedding_count),
      topic_embedding_model: asString(payload.topic_embedding_model),
    });
  }

  return candidates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * V3 semantic-centroid query.
 *
 * This is the preferred function for the new router because it returns the
 * message embedding as well as the top-k Qdrant topic candidates. That lets the
 * router update the selected topic centroid without embedding the same message
 * a second time.
 */
export async function querySemanticTopicCandidatesWithEmbedding(
  message: string,
  limit = 5,
): Promise<SemanticTopicQueryResult> {
  const timer = createQueryTopicsTimer();
  const requestedLimit = normalizeRequestedLimit(limit);
  const route = "querySemanticTopicCandidatesWithEmbedding" as const;
  const hasConfig = hasQdrantConfig();

  if (typeof message !== "string" || !message.trim()) {
    const debug = timer.finish({
      route,
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: hasConfig,
      skipped_reason: "empty_message",
      message_embedding_available: false,
      embedding_model: null,
    });

    logQueryTopicsTiming(debug);

    return emptySemanticTopicQueryResult({
      route,
      requestedLimit,
      skippedReason: "empty_message",
      hasQdrant: hasConfig,
      debug,
    });
  }

  timer.step("validate_message");

  let messageEmbedding: EmbeddingVector;

  try {
    messageEmbedding = asEmbeddingVector(await embedText(message)) ?? [];
  } catch (error) {
    timer.step("embed_text_failed");

    const debug = timer.finish({
      route,
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: hasConfig,
      skipped_reason:
        error instanceof Error
          ? `embed_text_failed: ${error.message}`
          : "embed_text_failed",
      message_embedding_available: false,
      embedding_model: null,
    });

    logQueryTopicsTiming(debug);
    throw error;
  }

  timer.step("embed_text");

  const embeddingModel = getEmbeddingModelName();

  if (!messageEmbedding.length) {
    const debug = timer.finish({
      route,
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: hasConfig,
      skipped_reason: "empty_embedding",
      message_embedding_available: false,
      embedding_model: embeddingModel,
    });

    logQueryTopicsTiming(debug);

    return {
      vectorInfo: emptyVectorInfo(),
      messageEmbedding: null,
      embeddingModel,
      candidates: [],
      debug,
    };
  }

  if (!hasConfig) {
    const debug = timer.finish({
      route,
      requested_limit: requestedLimit,
      returned_points: 0,
      returned_topics: 0,
      has_qdrant_config: false,
      skipped_reason: "missing_qdrant_config",
      message_embedding_available: true,
      embedding_model: embeddingModel,
    });

    logQueryTopicsTiming(debug);

    return {
      vectorInfo: emptyVectorInfo(),
      messageEmbedding,
      embeddingModel,
      candidates: [],
      debug,
    };
  }

  timer.step("check_qdrant_config");

  const qdrant = createQdrantClient();
  timer.step("create_qdrant_client");

  const result = await qdrant.query(TOPIC_COLLECTION, {
    query: messageEmbedding,
    limit: requestedLimit,
    // Keep this payload small. Supabase remains the source of truth, but these
    // fields help route-level debugging and avoid unnecessary topic_json pulls.
    with_payload: [
      "topic_id",
      "topic_name",
      "topic_embedding_count",
      "topic_embedding_model",
    ],
  });

  timer.step("qdrant_query");

  const points = Array.isArray(result.points) ? result.points : [];
  const candidates = normalizeQdrantCandidates(points);
  const vectorInfo = vectorInfoFromCandidates(candidates);

  timer.step("normalize_results");

  const debug = timer.finish({
    route,
    requested_limit: requestedLimit,
    returned_points: points.length,
    returned_topics: candidates.length,
    has_qdrant_config: true,
    skipped_reason: null,
    message_embedding_available: true,
    embedding_model: embeddingModel,
  });

  logQueryTopicsTiming(debug);

  return {
    vectorInfo,
    messageEmbedding,
    embeddingModel,
    candidates,
    debug,
  };
}

/**
 * Backward-compatible wrapper.
 *
 * Existing code can keep calling this while the message route is migrated.
 * New semantic-centroid routing should call querySemanticTopicCandidatesWithEmbedding
 * instead, so the message embedding can be reused for centroid updates.
 */
export async function querySemanticTopicCandidates(
  message: string,
  limit = 5,
): Promise<VectorInfo> {
  const result = await querySemanticTopicCandidatesWithEmbedding(message, limit);
  return result.vectorInfo;
}