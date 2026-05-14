import {
  createQdrantClient,
  hasQdrantConfig,
  TOPIC_COLLECTION,
} from "@/lib/vector/qdrant";
import { embedText } from "@/lib/vector/embed";
import type { EmbeddingVector, VectorInfo } from "@/types/contracts";

type QdrantTopicPayload = {
  topic_id?: unknown;

  // Canonical topic label payload field.
  topic_label?: unknown;

  // Temporary legacy payload field.
  topic_name?: unknown;

  /**
   * Canonical topic-label embedding metadata.
   */
  topic_label_embedding_count?: unknown;
  topic_label_embedding_model?: unknown;
  topic_label_embedding_updated_at?: unknown;
  vector_source?: unknown;
  vector_semantics?: unknown;
};

export type SemanticTopicCandidate = {
  topic_id: string;
  topic_label: string;

  // Temporary legacy alias for older routing/debug code.
  topic_name: string;

  similarity: number;
  rank: number;

  /**
   * Canonical metadata for the stored Qdrant topic vector.
   */
  topic_label_embedding_count: number | null;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;
  vector_source: string | null;
  vector_semantics: string | null;
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

type QueryTopicsRoute =
  | "embedMessageForSemanticRouting"
  | "querySemanticTopicCandidatesFromEmbedding"
  | "querySemanticTopicCandidatesWithEmbedding"
  | "querySemanticTopicCandidates";

type QueryTopicsTimingDebug = {
  enabled: boolean;
  total_ms: number;
  steps: QueryTopicsTimingStep[];
  metadata: {
    route: QueryTopicsRoute;
    requested_limit: number;
    returned_points: number;
    returned_topics: number;
    has_qdrant_config: boolean;
    skipped_reason: string | null;

    /**
     * Query-side vector metadata.
     *
     * This is the learner message vector used to search Qdrant.
     */
    message_embedding_available: boolean;
    embedding_model: string | null;

    /**
     * Qdrant-side metadata.
     *
     * Qdrant topic points are expected to store topic_label_embedding vectors.
     */
    qdrant_query_attempted: boolean;
    qdrant_timeout_ms: number;
  };
};

export type SemanticMessageEmbeddingResult = {
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  debug?: QueryTopicsTimingDebug;
};

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_labels: [],

    // Temporary legacy alias for older debug/UI consumers.
    top_k_topic_names: [],

    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function emptySemanticTopicQueryResult(args?: {
  debug?: QueryTopicsTimingDebug;
  messageEmbedding?: EmbeddingVector | null;
  embeddingModel?: string | null;
}): SemanticTopicQueryResult {
  return {
    vectorInfo: emptyVectorInfo(),
    messageEmbedding: args?.messageEmbedding ?? null,
    embeddingModel: args?.embeddingModel ?? null,
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value || !value.trim()) return fallback;

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getQdrantQueryTimeoutMs() {
  return parsePositiveInteger(
    process.env.MYWAY_QDRANT_QUERY_TIMEOUT_MS ??
      process.env.QDRANT_QUERY_TIMEOUT_MS,
    1500,
  );
}

function getEmbeddingModelName() {
  return (
    process.env.MYWAY_EMBEDDING_MODEL ??
    process.env.EMBEDDING_MODEL ??
    "local-embedding-service"
  );
}

function vectorInfoFromCandidates(candidates: SemanticTopicCandidate[]): VectorInfo {
  const topicLabels = candidates.map((candidate) => candidate.topic_label);

  return {
    top_k_topic_labels: topicLabels,

    // Temporary legacy alias for older debug/UI consumers.
    top_k_topic_names: topicLabels,

    top_k_topic_ids: candidates.map((candidate) => candidate.topic_id),
    top_k_similarity_scores: candidates.map((candidate) => candidate.similarity),
  };
}

function getPayloadTopicLabelEmbeddingCount(payload: QdrantTopicPayload) {
  return asNonNegativeInteger(payload.topic_label_embedding_count);
}

function getPayloadTopicLabelEmbeddingModel(payload: QdrantTopicPayload) {
  return asString(payload.topic_label_embedding_model);
}

function getPayloadTopicLabelEmbeddingUpdatedAt(payload: QdrantTopicPayload) {
  return asString(payload.topic_label_embedding_updated_at);
}

function getPayloadTopicLabel(payload: QdrantTopicPayload, fallbackTopicId: string) {
  return (
    asString(payload.topic_label) ||
    asString(payload.topic_name) ||
    fallbackTopicId
  );
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
    const score = asNumber(point.score);

    if (!topicId) continue;

    const topicLabel = getPayloadTopicLabel(payload, topicId);

    candidates.push({
      topic_id: topicId,
      topic_label: topicLabel,

      // Temporary legacy alias for older routing/debug code.
      topic_name: topicLabel,

      similarity: score ?? 0,
      rank: index,

      topic_label_embedding_count: getPayloadTopicLabelEmbeddingCount(payload),
      topic_label_embedding_model: getPayloadTopicLabelEmbeddingModel(payload),
      topic_label_embedding_updated_at:
        getPayloadTopicLabelEmbeddingUpdatedAt(payload),
      vector_source: asString(payload.vector_source),
      vector_semantics: asString(payload.vector_semantics),
    });
  }

  return candidates.sort((a, b) => b.similarity - a.similarity);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildDebug(args: {
  timer: ReturnType<typeof createQueryTopicsTimer>;
  route: QueryTopicsRoute;
  requestedLimit: number;
  returnedPoints: number;
  returnedTopics: number;
  hasQdrant: boolean;
  skippedReason: string | null;
  messageEmbeddingAvailable: boolean;
  embeddingModel: string | null;
  qdrantQueryAttempted: boolean;
  qdrantTimeoutMs: number;
}) {
  const debug = args.timer.finish({
    route: args.route,
    requested_limit: args.requestedLimit,
    returned_points: args.returnedPoints,
    returned_topics: args.returnedTopics,
    has_qdrant_config: args.hasQdrant,
    skipped_reason: args.skippedReason,
    message_embedding_available: args.messageEmbeddingAvailable,
    embedding_model: args.embeddingModel,
    qdrant_query_attempted: args.qdrantQueryAttempted,
    qdrant_timeout_ms: args.qdrantTimeoutMs,
  });

  logQueryTopicsTiming(debug);
  return debug;
}

/**
 * Embeds the learner's message once without querying Qdrant.
 *
 * This is the query-side vector. It is not the vector stored on topic rows.
 * Topic rows/Qdrant points use topic_label_embedding vectors.
 */
export async function embedMessageForSemanticRouting(
  message: string,
): Promise<SemanticMessageEmbeddingResult> {
  const timer = createQueryTopicsTimer();
  const route = "embedMessageForSemanticRouting" as const;
  const qdrantTimeoutMs = getQdrantQueryTimeoutMs();
  const hasConfig = hasQdrantConfig();

  if (typeof message !== "string" || !message.trim()) {
    const debug = buildDebug({
      timer,
      route,
      requestedLimit: 0,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: hasConfig,
      skippedReason: "empty_message",
      messageEmbeddingAvailable: false,
      embeddingModel: null,
      qdrantQueryAttempted: false,
      qdrantTimeoutMs,
    });

    return {
      messageEmbedding: null,
      embeddingModel: null,
      debug,
    };
  }

  timer.step("validate_message");

  let messageEmbedding: EmbeddingVector;

  try {
    messageEmbedding = asEmbeddingVector(await embedText(message)) ?? [];
  } catch (error) {
    timer.step("embed_text_failed");

    const debug = buildDebug({
      timer,
      route,
      requestedLimit: 0,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: hasConfig,
      skippedReason:
        error instanceof Error
          ? `embed_text_failed: ${error.message}`
          : "embed_text_failed",
      messageEmbeddingAvailable: false,
      embeddingModel: null,
      qdrantQueryAttempted: false,
      qdrantTimeoutMs,
    });

    throw Object.assign(
      error instanceof Error ? error : new Error("embed_text_failed"),
      { debug },
    );
  }

  timer.step("embed_text");

  const embeddingModel = getEmbeddingModelName();

  if (!messageEmbedding.length) {
    const debug = buildDebug({
      timer,
      route,
      requestedLimit: 0,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: hasConfig,
      skippedReason: "empty_embedding",
      messageEmbeddingAvailable: false,
      embeddingModel,
      qdrantQueryAttempted: false,
      qdrantTimeoutMs,
    });

    return {
      messageEmbedding: null,
      embeddingModel,
      debug,
    };
  }

  const debug = buildDebug({
    timer,
    route,
    requestedLimit: 0,
    returnedPoints: 0,
    returnedTopics: 0,
    hasQdrant: hasConfig,
    skippedReason: null,
    messageEmbeddingAvailable: true,
    embeddingModel,
    qdrantQueryAttempted: false,
    qdrantTimeoutMs,
  });

  return {
    messageEmbedding,
    embeddingModel,
    debug,
  };
}

/**
 * Queries Qdrant with a learner-message embedding.
 *
 * Qdrant candidate vectors are expected to represent topic_label_embedding.
 * So the similarity means:
 *
 * learner message embedding -> stored topic-label embedding
 */
export async function querySemanticTopicCandidatesFromEmbedding(
  messageEmbedding: EmbeddingVector | null,
  limit = 5,
  embeddingModel: string | null = getEmbeddingModelName(),
): Promise<SemanticTopicQueryResult> {
  const timer = createQueryTopicsTimer();
  const requestedLimit = normalizeRequestedLimit(limit);
  const route = "querySemanticTopicCandidatesFromEmbedding" as const;
  const hasConfig = hasQdrantConfig();
  const qdrantTimeoutMs = getQdrantQueryTimeoutMs();

  if (!messageEmbedding?.length) {
    const debug = buildDebug({
      timer,
      route,
      requestedLimit,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: hasConfig,
      skippedReason: "missing_message_embedding",
      messageEmbeddingAvailable: false,
      embeddingModel,
      qdrantQueryAttempted: false,
      qdrantTimeoutMs,
    });

    return emptySemanticTopicQueryResult({
      debug,
      messageEmbedding: null,
      embeddingModel,
    });
  }

  timer.step("validate_message_embedding");

  if (!hasConfig) {
    const debug = buildDebug({
      timer,
      route,
      requestedLimit,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: false,
      skippedReason: "missing_qdrant_config",
      messageEmbeddingAvailable: true,
      embeddingModel,
      qdrantQueryAttempted: false,
      qdrantTimeoutMs,
    });

    return emptySemanticTopicQueryResult({
      debug,
      messageEmbedding,
      embeddingModel,
    });
  }

  timer.step("check_qdrant_config");

  let result: Awaited<
    ReturnType<ReturnType<typeof createQdrantClient>["query"]>
  >;

  try {
    const qdrant = createQdrantClient();
    timer.step("create_qdrant_client");

    result = await withTimeout(
      qdrant.query(TOPIC_COLLECTION, {
        query: messageEmbedding,
        limit: requestedLimit,
        // Supabase remains the source of truth. This payload is only for
        // route-level debugging and lightweight candidate evidence.
        with_payload: [
          "topic_id",
          "topic_label",
          "topic_name",
          "topic_label_embedding_count",
          "topic_label_embedding_model",
          "topic_label_embedding_updated_at",
          "vector_source",
          "vector_semantics",
        ],
      }),
      qdrantTimeoutMs,
      "Qdrant topic query",
    );
  } catch (error) {
    timer.step("qdrant_query_failed");

    const isTimeout =
      error instanceof Error &&
      error.message.toLowerCase().includes("timed out");

    const debug = buildDebug({
      timer,
      route,
      requestedLimit,
      returnedPoints: 0,
      returnedTopics: 0,
      hasQdrant: true,
      skippedReason: isTimeout
        ? "qdrant_query_timeout"
        : error instanceof Error
          ? `qdrant_query_failed: ${error.message}`
          : "qdrant_query_failed",
      messageEmbeddingAvailable: true,
      embeddingModel,
      qdrantQueryAttempted: true,
      qdrantTimeoutMs,
    });

    return emptySemanticTopicQueryResult({
      debug,
      messageEmbedding,
      embeddingModel,
    });
  }

  timer.step("qdrant_query");

  const points = Array.isArray(result.points) ? result.points : [];
  const candidates = normalizeQdrantCandidates(points);
  const vectorInfo = vectorInfoFromCandidates(candidates);

  timer.step("normalize_results");

  const debug = buildDebug({
    timer,
    route,
    requestedLimit,
    returnedPoints: points.length,
    returnedTopics: candidates.length,
    hasQdrant: true,
    skippedReason: null,
    messageEmbeddingAvailable: true,
    embeddingModel,
    qdrantQueryAttempted: true,
    qdrantTimeoutMs,
  });

  return {
    vectorInfo,
    messageEmbedding,
    embeddingModel,
    candidates,
    debug,
  };
}

/**
 * Backward-compatible combined helper.
 *
 * Flow:
 *   embed learner message once
 *   -> query Qdrant topic-label vectors
 */
export async function querySemanticTopicCandidatesWithEmbedding(
  message: string,
  limit = 5,
): Promise<SemanticTopicQueryResult> {
  const route = "querySemanticTopicCandidatesWithEmbedding" as const;
  const requestedLimit = normalizeRequestedLimit(limit);
  const hasConfig = hasQdrantConfig();
  const qdrantTimeoutMs = getQdrantQueryTimeoutMs();

  let embeddingResult: SemanticMessageEmbeddingResult;

  try {
    embeddingResult = await embedMessageForSemanticRouting(message);
  } catch (error) {
    const debug =
      error && typeof error === "object" && "debug" in error
        ? (error as { debug?: QueryTopicsTimingDebug }).debug
        : undefined;

    if (debug) {
      return emptySemanticTopicQueryResult({
        debug: {
          ...debug,
          metadata: {
            ...debug.metadata,
            route,
            requested_limit: requestedLimit,
            has_qdrant_config: hasConfig,
            qdrant_timeout_ms: qdrantTimeoutMs,
          },
        },
      });
    }

    throw error;
  }

  if (!embeddingResult.messageEmbedding?.length) {
    return emptySemanticTopicQueryResult({
      debug: embeddingResult.debug
        ? {
            ...embeddingResult.debug,
            metadata: {
              ...embeddingResult.debug.metadata,
              route,
              requested_limit: requestedLimit,
              has_qdrant_config: hasConfig,
              qdrant_timeout_ms: qdrantTimeoutMs,
            },
          }
        : undefined,
      messageEmbedding: null,
      embeddingModel: embeddingResult.embeddingModel,
    });
  }

  const qdrantResult = await querySemanticTopicCandidatesFromEmbedding(
    embeddingResult.messageEmbedding,
    requestedLimit,
    embeddingResult.embeddingModel,
  );

  return {
    ...qdrantResult,
    debug: qdrantResult.debug
      ? {
          ...qdrantResult.debug,
          metadata: {
            ...qdrantResult.debug.metadata,
            route,
          },
        }
      : qdrantResult.debug,
  };
}

/**
 * Backward-compatible wrapper.
 *
 * Existing code can keep calling this while route code migrates. New routing
 * code should prefer:
 *
 * embedMessageForSemanticRouting
 * querySemanticTopicCandidatesFromEmbedding
 */
export async function querySemanticTopicCandidates(
  message: string,
  limit = 5,
): Promise<VectorInfo> {
  const result = await querySemanticTopicCandidatesWithEmbedding(message, limit);
  return result.vectorInfo;
}