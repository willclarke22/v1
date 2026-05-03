import type { EmbeddingVector, VectorInfo } from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/topic-resolution";
import type {
  TopicCentroidEvidence,
  TopicRoutingThresholds,
  TopicSimilarityEvidence,
} from "./topic-routing-types";

function asCleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTopicName(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function findTopicByIdOrName(args: {
  topics: RouteTopic[];
  topicId: string | null;
  topicName: string | null;
}) {
  const { topics, topicId, topicName } = args;
  const normalizedName = topicName ? normalizeTopicName(topicName) : null;

  return (
    topics.find((topic) => topicId && topic.id === topicId) ??
    topics.find(
      (topic) =>
        normalizedName && normalizeTopicName(topic.name) === normalizedName,
    ) ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* LEGACY / COMPATIBILITY: VectorInfo summarization */
/* ------------------------------------------------------------------ */

export function normalizeRoutingVectorInfo(
  vectorInfo?: VectorInfo | null,
): TopicSimilarityEvidence[] {
  if (!vectorInfo) return [];

  const ids = Array.isArray(vectorInfo.top_k_topic_ids)
    ? vectorInfo.top_k_topic_ids
    : [];
  const names = Array.isArray(vectorInfo.top_k_topic_names)
    ? vectorInfo.top_k_topic_names
    : [];
  const scores = Array.isArray(vectorInfo.top_k_similarity_scores)
    ? vectorInfo.top_k_similarity_scores
    : [];

  const maxLength = Math.max(ids.length, names.length, scores.length);
  const rows: TopicSimilarityEvidence[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const topicId = asCleanString(ids[index]);
    const topicName = asCleanString(names[index]);
    const similarity = asFiniteNumber(scores[index]);

    if (!topicId && !topicName) continue;
    if (similarity == null) continue;

    rows.push({
      topic_id: topicId ?? topicName ?? `unknown-topic-${index}`,
      topic_name: topicName ?? topicId ?? `Unknown topic ${index + 1}`,
      similarity,
      rank: index,
      topic: null,
    });
  }

  return rows.sort((a, b) => b.similarity - a.similarity);
}

export function summarizeTopicCentroidEvidence(args: {
  vectorInfo?: VectorInfo | null;
  topics: RouteTopic[];
  activeTopicId?: string | null;
  thresholds: TopicRoutingThresholds;
}): TopicCentroidEvidence {
  const { vectorInfo, topics, activeTopicId, thresholds } = args;

  const ranked = normalizeRoutingVectorInfo(vectorInfo).map((item) => {
    const topic = findTopicByIdOrName({
      topics,
      topicId: item.topic_id,
      topicName: item.topic_name,
    });

    return {
      ...item,
      topic,
      topic_id: topic?.id ?? item.topic_id,
      topic_name: topic?.name ?? item.topic_name,
    };
  });

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  const active =
    activeTopicId == null
      ? null
      : ranked.find((item) => item.topic_id === activeTopicId) ??
        (() => {
          const topic = topics.find(
            (candidate) => candidate.id === activeTopicId,
          );
          return topic
            ? {
                topic_id: topic.id,
                topic_name: topic.name,
                similarity: 0,
                rank: Number.POSITIVE_INFINITY,
                topic,
              }
            : null;
        })();

  const gap =
    best && second ? Math.max(0, best.similarity - second.similarity) : null;

  const hasStrongMatch = Boolean(
    best && best.similarity >= thresholds.strongExistingMatch,
  );

  const hasMediumMatch = Boolean(
    best && best.similarity >= thresholds.mediumExistingMatch,
  );

  const allMatchesWeak =
    ranked.length === 0 ||
    ranked.every((item) => item.similarity < thresholds.createWhenBestBelow);

  return {
    ranked,
    best,
    second,
    active,
    gap,
    hasStrongMatch,
    hasMediumMatch,
    allMatchesWeak,
  };
}

export function getSimilarityForTopic(
  evidence: TopicCentroidEvidence,
  topicId: string | null | undefined,
) {
  if (!topicId) return null;
  return (
    evidence.ranked.find((item) => item.topic_id === topicId)?.similarity ?? null
  );
}

/* ------------------------------------------------------------------ */
/* V3 SEMANTIC CENTROID UTILITIES */
/* ------------------------------------------------------------------ */

export type TopicWithSemanticCentroid = RouteTopic & {
  topic_embedding_centroid?: EmbeddingVector | null;
  topic_embedding_count?: number | null;
  topic_embedding_model?: string | null;
  topic_embedding_updated_at?: string | null;
};

export type SemanticCentroidRankedTopic = {
  topic: TopicWithSemanticCentroid;
  topic_id: string;
  topic_name: string;
  similarity: number;
  rank: number;
  embedding_count: number;
  embedding_model: string | null;
  has_embedding_centroid: boolean;
};

export type SemanticCentroidEvidence = {
  ranked: SemanticCentroidRankedTopic[];
  best: SemanticCentroidRankedTopic | null;
  second: SemanticCentroidRankedTopic | null;
  active: SemanticCentroidRankedTopic | null;
  gap: number | null;
  topic_count_considered: number;
  topic_centroids_available: number;
};

export type CentroidUpdateMethod = "initialize" | "running_average" | "ema" | "none";

export type CentroidUpdateResult = {
  centroid: EmbeddingVector | null;
  previous_count: number;
  new_count: number;
  method: CentroidUpdateMethod;
  alpha: number | null;
};

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function getTopicEmbeddingCentroid(
  topic: TopicWithSemanticCentroid,
): EmbeddingVector | null {
  const direct = asEmbeddingVector(topic.topic_embedding_centroid);
  if (direct) return direct;

  const topicJson = (topic as { topic_json?: unknown }).topic_json;
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  return asEmbeddingVector(
    (topicJson as Record<string, unknown>).topic_embedding_centroid,
  );
}

function getTopicEmbeddingCount(topic: TopicWithSemanticCentroid): number {
  const direct = topic.topic_embedding_count;

  if (typeof direct === "number" && Number.isFinite(direct)) {
    return Math.max(0, Math.floor(direct));
  }

  const topicJson = (topic as { topic_json?: unknown }).topic_json;
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return 0;
  }

  const value = (topicJson as Record<string, unknown>).topic_embedding_count;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  return 0;
}

function getTopicEmbeddingModel(topic: TopicWithSemanticCentroid): string | null {
  if (
    typeof topic.topic_embedding_model === "string" &&
    topic.topic_embedding_model.trim()
  ) {
    return topic.topic_embedding_model.trim();
  }

  const topicJson = (topic as { topic_json?: unknown }).topic_json;
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  const value = (topicJson as Record<string, unknown>).topic_embedding_model;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeEmbeddingVector(
  vector: EmbeddingVector | null | undefined,
): EmbeddingVector | null {
  const clean = asEmbeddingVector(vector);
  if (!clean) return null;

  const norm = Math.sqrt(clean.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) return clean.map(() => 0);

  return clean.map((value) => value / norm);
}

export function cosineSimilarity(
  a: EmbeddingVector | null | undefined,
  b: EmbeddingVector | null | undefined,
): number | null {
  const aNorm = normalizeEmbeddingVector(a);
  const bNorm = normalizeEmbeddingVector(b);

  if (!aNorm || !bNorm) return null;
  if (aNorm.length !== bNorm.length) return null;

  let dot = 0;

  for (let index = 0; index < aNorm.length; index += 1) {
    dot += aNorm[index] * bNorm[index];
  }

  if (!Number.isFinite(dot)) return null;

  // Most embedding cosine scores are already in [-1, 1], but for routing we
  // clamp only for safety and leave negative scores possible.
  return Math.max(-1, Math.min(1, dot));
}

export function rankTopicsByEmbeddingCentroid(args: {
  messageEmbedding: EmbeddingVector | null | undefined;
  topics: TopicWithSemanticCentroid[];
  activeTopicId?: string | null;
}): SemanticCentroidEvidence {
  const { messageEmbedding, topics, activeTopicId } = args;

  const ranked: SemanticCentroidRankedTopic[] = [];
  let topicCentroidsAvailable = 0;

  for (const topic of topics) {
    const centroid = getTopicEmbeddingCentroid(topic);
    const embeddingCount = getTopicEmbeddingCount(topic);
    const embeddingModel = getTopicEmbeddingModel(topic);

    if (!centroid) continue;

    topicCentroidsAvailable += 1;

    const similarity = cosineSimilarity(messageEmbedding, centroid);

    if (similarity == null) continue;

    ranked.push({
      topic,
      topic_id: topic.id,
      topic_name: topic.name,
      similarity,
      rank: 0,
      embedding_count: embeddingCount,
      embedding_model: embeddingModel,
      has_embedding_centroid: true,
    });
  }

  ranked.sort((a, b) => b.similarity - a.similarity);

  const rankedWithRank = ranked.map((item, index) => ({
    ...item,
    rank: index,
  }));

  const best = rankedWithRank[0] ?? null;
  const second = rankedWithRank[1] ?? null;

  const active =
    activeTopicId == null
      ? null
      : rankedWithRank.find((item) => item.topic_id === activeTopicId) ?? null;

  const gap =
    best && second ? Math.max(0, best.similarity - second.similarity) : null;

  return {
    ranked: rankedWithRank,
    best,
    second,
    active,
    gap,
    topic_count_considered: topics.length,
    topic_centroids_available: topicCentroidsAvailable,
  };
}

export function buildVectorInfoFromCentroidRanking(
  ranked: SemanticCentroidRankedTopic[],
  limit = 5,
): VectorInfo {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(10, Math.floor(limit)))
    : 5;

  const top = ranked.slice(0, normalizedLimit);

  return {
    top_k_topic_names: top.map((item) => item.topic_name),
    top_k_topic_ids: top.map((item) => item.topic_id),
    top_k_similarity_scores: top.map((item) => item.similarity),
  };
}

export function updateCentroidRunningAverage(args: {
  previousCentroid: EmbeddingVector | null | undefined;
  previousCount: number | null | undefined;
  newEmbedding: EmbeddingVector | null | undefined;
}): CentroidUpdateResult {
  const previous = asEmbeddingVector(args.previousCentroid);
  const incoming = asEmbeddingVector(args.newEmbedding);
  const previousCount =
    typeof args.previousCount === "number" && Number.isFinite(args.previousCount)
      ? Math.max(0, Math.floor(args.previousCount))
      : 0;

  if (!incoming) {
    return {
      centroid: previous,
      previous_count: previousCount,
      new_count: previousCount,
      method: "none",
      alpha: null,
    };
  }

  if (!previous || previous.length !== incoming.length || previousCount <= 0) {
    return {
      centroid: incoming,
      previous_count: previousCount,
      new_count: 1,
      method: "initialize",
      alpha: null,
    };
  }

  const newCount = previousCount + 1;
  const previousWeight = previousCount / newCount;
  const incomingWeight = 1 / newCount;

  const centroid = previous.map((value, index) => {
    return value * previousWeight + incoming[index] * incomingWeight;
  });

  return {
    centroid,
    previous_count: previousCount,
    new_count: newCount,
    method: "running_average",
    alpha: incomingWeight,
  };
}

export function updateCentroidEma(args: {
  previousCentroid: EmbeddingVector | null | undefined;
  previousCount: number | null | undefined;
  newEmbedding: EmbeddingVector | null | undefined;
  alpha?: number | null;
}): CentroidUpdateResult {
  const previous = asEmbeddingVector(args.previousCentroid);
  const incoming = asEmbeddingVector(args.newEmbedding);
  const previousCount =
    typeof args.previousCount === "number" && Number.isFinite(args.previousCount)
      ? Math.max(0, Math.floor(args.previousCount))
      : 0;

  const alpha =
    typeof args.alpha === "number" && Number.isFinite(args.alpha)
      ? Math.max(0, Math.min(1, args.alpha))
      : 0.15;

  if (!incoming) {
    return {
      centroid: previous,
      previous_count: previousCount,
      new_count: previousCount,
      method: "none",
      alpha,
    };
  }

  if (!previous || previous.length !== incoming.length || previousCount <= 0) {
    return {
      centroid: incoming,
      previous_count: previousCount,
      new_count: 1,
      method: "initialize",
      alpha,
    };
  }

  const centroid = previous.map((value, index) => {
    return value * (1 - alpha) + incoming[index] * alpha;
  });

  return {
    centroid,
    previous_count: previousCount,
    new_count: previousCount + 1,
    method: "ema",
    alpha,
  };
}

export function getSemanticCentroidForTopic(
  topic: TopicWithSemanticCentroid | null | undefined,
): EmbeddingVector | null {
  if (!topic) return null;
  return getTopicEmbeddingCentroid(topic);
}

export function getSemanticCentroidCountForTopic(
  topic: TopicWithSemanticCentroid | null | undefined,
): number {
  if (!topic) return 0;
  return getTopicEmbeddingCount(topic);
}

export function getSemanticCentroidModelForTopic(
  topic: TopicWithSemanticCentroid | null | undefined,
): string | null {
  if (!topic) return null;
  return getTopicEmbeddingModel(topic);
}