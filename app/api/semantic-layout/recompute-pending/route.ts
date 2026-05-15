import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import type { EmbeddingVector } from "@/types/contracts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonObject = { [key: string]: JsonValue };

type LayoutCandidate = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type ResolvedTopicLabelEmbedding = {
  centroid: EmbeddingVector | null;
  count: number;
  model: string | null;
  updated_at: string | null;
  source: "topic_label_embedding" | "missing";
};

type NeighborMatch = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  raw_similarity: number;
  weight: number;
  reliability: number;
  position: TopicPosition;
  topic_label_embedding_count: number;
  topic_label_embedding_source: ResolvedTopicLabelEmbedding["source"];
};

type LayoutThresholds = {
  enriched_topic_count: number;
  strong_similarity: number;
  moderate_similarity: number;
  margin_required: number;
  multi_neighbor_similarity: number;
  min_supporting_neighbors: number;
};

type SemanticLayoutDecision = {
  should_cluster: boolean;
  method: string;
  reason: string;
  usable_neighbors: NeighborMatch[];
  thresholds: LayoutThresholds;
  top_similarity: number | null;
  second_similarity: number | null;
  top_second_margin: number | null;
  supporting_neighbor_count: number;
};

type ComputedSemanticPosition = {
  position: TopicPosition;
  method: string;
  neighbor_matches: NeighborMatch[];
  reason: string;
  layout_decision: SemanticLayoutDecision;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const TOP_K_NEIGHBORS = 5;
const MIN_VISIBLE_CANDIDATE_SIMILARITY = -1;
const NEIGHBOR_OFFSET_RADIUS = 1.25;
const FALLBACK_OFFSET_RADIUS = 0.65;
const OUTER_RING_RADIUS = 5.5;

function nowIso() {
  return new Date().toISOString();
}

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");

  if (!raw) return DEFAULT_LIMIT;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(parsed, MAX_LIMIT);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(isFiniteNumber);

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function getTopicLabel(topic: LayoutCandidate) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function hasSemanticPosition(topic: LayoutCandidate) {
  return (
    Array.isArray(topic.semantic_position) &&
    topic.semantic_position.length === 3 &&
    topic.semantic_position.every(isFiniteNumber)
  );
}

function resolveTopicLabelEmbedding(
  topic: LayoutCandidate,
): ResolvedTopicLabelEmbedding {
  const topicLabelCentroid = asEmbeddingVector(topic.topic_label_embedding_centroid);

  if (topicLabelCentroid && topic.topic_label_embedding_count > 0) {
    return {
      centroid: topicLabelCentroid,
      count: topic.topic_label_embedding_count,
      model: topic.topic_label_embedding_model,
      updated_at: topic.topic_label_embedding_updated_at,
      source: "topic_label_embedding",
    };
  }

  return {
    centroid: null,
    count: 0,
    model: null,
    updated_at: null,
    source: "missing",
  };
}

function hasTopicLabelEmbedding(topic: LayoutCandidate) {
  const resolved = resolveTopicLabelEmbedding(topic);

  return Boolean(resolved.centroid && resolved.centroid.length > 0 && resolved.count > 0);
}

function getVisualPosition(topic: LayoutCandidate, fallbackIndex: number): TopicPosition {
  if (hasSemanticPosition(topic) && topic.semantic_position) {
    return topic.semantic_position;
  }

  if (
    Array.isArray(topic.topic_position) &&
    topic.topic_position.length === 3 &&
    topic.topic_position.every(isFiniteNumber)
  ) {
    return topic.topic_position;
  }

  return fallbackRingPosition(fallbackIndex, OUTER_RING_RADIUS);
}

function dotProduct(a: EmbeddingVector, b: EmbeddingVector) {
  const length = Math.min(a.length, b.length);
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    sum += a[index] * b[index];
  }

  return sum;
}

function vectorNorm(vector: EmbeddingVector) {
  let sum = 0;

  for (const value of vector) {
    sum += value * value;
  }

  return Math.sqrt(sum);
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector) {
  if (!a.length || !b.length) return 0;

  const denominator = vectorNorm(a) * vectorNorm(b);

  if (!denominator) return 0;

  return dotProduct(a, b) / denominator;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function centroidReliability(topicLabelEmbeddingCount: number) {
  if (topicLabelEmbeddingCount >= 5) return 1;
  if (topicLabelEmbeddingCount >= 3) return 0.85;
  if (topicLabelEmbeddingCount >= 2) return 0.72;
  return 0.58;
}

function getLayoutThresholds(enrichedTopicCount: number): LayoutThresholds {
  if (enrichedTopicCount < 8) {
    return {
      enriched_topic_count: enrichedTopicCount,
      strong_similarity: 0.65,
      moderate_similarity: 0.58,
      margin_required: 0.14,
      multi_neighbor_similarity: 0.56,
      min_supporting_neighbors: 2,
    };
  }

  if (enrichedTopicCount < 30) {
    return {
      enriched_topic_count: enrichedTopicCount,
      strong_similarity: 0.6,
      moderate_similarity: 0.5,
      margin_required: 0.1,
      multi_neighbor_similarity: 0.5,
      min_supporting_neighbors: 2,
    };
  }

  return {
    enriched_topic_count: enrichedTopicCount,
    strong_similarity: 0.55,
    moderate_similarity: 0.47,
    margin_required: 0.08,
    multi_neighbor_similarity: 0.47,
    min_supporting_neighbors: 2,
  };
}

function normalizeSimilarityToWeight(args: {
  similarity: number;
  thresholds: LayoutThresholds;
  reliability: number;
}) {
  const similarityStrength = Math.max(
    0.001,
    args.similarity - args.thresholds.moderate_similarity + 0.05,
  );

  return similarityStrength * args.reliability;
}

function stableHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function deterministicOffset(topicId: string, radius = NEIGHBOR_OFFSET_RADIUS): TopicPosition {
  const hash = stableHash(topicId);
  const angle = ((hash % 3600) / 3600) * Math.PI * 2;
  const elevationSeed = ((Math.floor(hash / 3600) % 1000) / 1000) * 2 - 1;
  const y = elevationSeed * 0.7;

  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function addPositions(a: TopicPosition, b: TopicPosition): TopicPosition {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function fallbackRingPosition(index: number, radius = OUTER_RING_RADIUS): TopicPosition {
  const angle = index * 2.399963229728653;
  const y = ((index % 5) - 2) * 0.45;

  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function weightedAveragePosition(neighbors: NeighborMatch[]): TopicPosition | null {
  if (!neighbors.length) return null;

  let totalWeight = 0;
  let x = 0;
  let y = 0;
  let z = 0;

  for (const neighbor of neighbors) {
    totalWeight += neighbor.weight;
    x += neighbor.position[0] * neighbor.weight;
    y += neighbor.position[1] * neighbor.weight;
    z += neighbor.position[2] * neighbor.weight;
  }

  if (!totalWeight) return null;

  return [x / totalWeight, y / totalWeight, z / totalWeight];
}

function enrichedTopics(rows: LayoutCandidate[]) {
  return rows.filter(hasTopicLabelEmbedding);
}

function findNeighborMatches(args: {
  targetTopic: LayoutCandidate;
  allTopics: LayoutCandidate[];
  thresholds: LayoutThresholds;
}) {
  const targetTopicLabelEmbedding = resolveTopicLabelEmbedding(args.targetTopic);
  const targetCentroid = targetTopicLabelEmbedding.centroid;

  if (!targetCentroid) return [];

  return args.allTopics
    .filter((candidate) => candidate.topic_id !== args.targetTopic.topic_id)
    .filter(hasTopicLabelEmbedding)
    .map((candidate, index): NeighborMatch | null => {
      const candidateTopicLabelEmbedding = resolveTopicLabelEmbedding(candidate);
      const candidateCentroid = candidateTopicLabelEmbedding.centroid;

      if (!candidateCentroid) return null;

      const similarity = cosineSimilarity(targetCentroid, candidateCentroid);

      if (similarity < MIN_VISIBLE_CANDIDATE_SIMILARITY) return null;

      const reliability = centroidReliability(candidateTopicLabelEmbedding.count);

      return {
        topic_id: candidate.topic_id,
        topic_label: getTopicLabel(candidate),
        similarity: round4(similarity),
        raw_similarity: similarity,
        reliability,
        weight: normalizeSimilarityToWeight({
          similarity,
          thresholds: args.thresholds,
          reliability,
        }),
        position: getVisualPosition(candidate, index),
        topic_label_embedding_count: candidateTopicLabelEmbedding.count,
        topic_label_embedding_source: candidateTopicLabelEmbedding.source,
      };
    })
    .filter((match): match is NeighborMatch => Boolean(match))
    .sort((a, b) => b.raw_similarity - a.raw_similarity)
    .slice(0, TOP_K_NEIGHBORS);
}

function decideSemanticLayout(args: {
  neighborMatches: NeighborMatch[];
  thresholds: LayoutThresholds;
}): SemanticLayoutDecision {
  const [topNeighbor, secondNeighbor] = args.neighborMatches;
  const topSimilarity = topNeighbor?.raw_similarity ?? null;
  const secondSimilarity = secondNeighbor?.raw_similarity ?? null;

  const topSecondMargin =
    topSimilarity !== null && secondSimilarity !== null
      ? topSimilarity - secondSimilarity
      : null;

  const strongNeighbors = args.neighborMatches.filter(
    (neighbor) => neighbor.raw_similarity >= args.thresholds.strong_similarity,
  );

  const supportingNeighbors = args.neighborMatches.filter(
    (neighbor) => neighbor.raw_similarity >= args.thresholds.multi_neighbor_similarity,
  );

  const hasVeryStrongSingleNeighbor = Boolean(
    topSimilarity && topSimilarity >= args.thresholds.strong_similarity,
  );

  const hasModerateNeighborWithClearMargin = Boolean(
    topSimilarity &&
      secondSimilarity !== null &&
      topSimilarity >= args.thresholds.moderate_similarity &&
      topSecondMargin !== null &&
      topSecondMargin >= args.thresholds.margin_required,
  );

  const hasMultiNeighborSupport =
    supportingNeighbors.length >= args.thresholds.min_supporting_neighbors;

  if (hasVeryStrongSingleNeighbor) {
    return {
      should_cluster: true,
      method: "semantic_confident_single_neighbor_v3_topic_label_embedding",
      reason:
        "Placed near semantic neighbors because the top topic-label neighbor passed the strong-similarity threshold.",
      usable_neighbors: strongNeighbors.length ? strongNeighbors : [topNeighbor],
      thresholds: args.thresholds,
      top_similarity: topSimilarity === null ? null : round4(topSimilarity),
      second_similarity: secondSimilarity === null ? null : round4(secondSimilarity),
      top_second_margin: topSecondMargin === null ? null : round4(topSecondMargin),
      supporting_neighbor_count: supportingNeighbors.length,
    };
  }

  if (hasModerateNeighborWithClearMargin && topNeighbor) {
    return {
      should_cluster: true,
      method: "semantic_moderate_with_clear_margin_v3_topic_label_embedding",
      reason:
        "Placed near the top topic-label neighbor because it had moderate similarity and clearly beat the second-best neighbor.",
      usable_neighbors: [topNeighbor],
      thresholds: args.thresholds,
      top_similarity: topSimilarity === null ? null : round4(topSimilarity),
      second_similarity: secondSimilarity === null ? null : round4(secondSimilarity),
      top_second_margin: topSecondMargin === null ? null : round4(topSecondMargin),
      supporting_neighbor_count: supportingNeighbors.length,
    };
  }

  if (hasMultiNeighborSupport) {
    return {
      should_cluster: true,
      method: "semantic_multi_neighbor_support_v3_topic_label_embedding",
      reason:
        "Placed near topic-label neighbors because multiple neighbors provided supporting similarity.",
      usable_neighbors: supportingNeighbors,
      thresholds: args.thresholds,
      top_similarity: topSimilarity === null ? null : round4(topSimilarity),
      second_similarity: secondSimilarity === null ? null : round4(secondSimilarity),
      top_second_margin: topSecondMargin === null ? null : round4(topSecondMargin),
      supporting_neighbor_count: supportingNeighbors.length,
    };
  }

  return {
    should_cluster: false,
    method: "fallback_insufficient_topic_label_semantic_confidence_v3",
    reason:
      "No topic-label neighbor had enough confidence to justify clustering, so the topic kept a stable fallback placement.",
    usable_neighbors: [],
    thresholds: args.thresholds,
    top_similarity: topSimilarity === null ? null : round4(topSimilarity),
    second_similarity: secondSimilarity === null ? null : round4(secondSimilarity),
    top_second_margin: topSecondMargin === null ? null : round4(topSecondMargin),
    supporting_neighbor_count: supportingNeighbors.length,
  };
}

function computeSemanticPosition(args: {
  targetTopic: LayoutCandidate;
  allTopics: LayoutCandidate[];
  fallbackIndex: number;
}): ComputedSemanticPosition {
  const enrichedTopicCount = enrichedTopics(args.allTopics).length;
  const thresholds = getLayoutThresholds(enrichedTopicCount);

  const neighborMatches = findNeighborMatches({
    targetTopic: args.targetTopic,
    allTopics: args.allTopics,
    thresholds,
  });

  const decision = decideSemanticLayout({
    neighborMatches,
    thresholds,
  });

  if (decision.should_cluster) {
    const average = weightedAveragePosition(decision.usable_neighbors);

    if (average) {
      return {
        position: addPositions(
          average,
          deterministicOffset(args.targetTopic.topic_id, NEIGHBOR_OFFSET_RADIUS),
        ),
        method: decision.method,
        neighbor_matches: decision.usable_neighbors,
        reason: decision.reason,
        layout_decision: decision,
      };
    }
  }

  const existingPosition =
    args.targetTopic.topic_position ??
    fallbackRingPosition(args.fallbackIndex, OUTER_RING_RADIUS);

  return {
    position: addPositions(
      existingPosition,
      deterministicOffset(args.targetTopic.topic_id, FALLBACK_OFFSET_RADIUS),
    ),
    method: decision.method,
    neighbor_matches: neighborMatches,
    reason: decision.reason,
    layout_decision: decision,
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (typeof value === "object") {
    const output: JsonObject = {};

    for (const [key, childValue] of Object.entries(value)) {
      output[key] = toJsonValue(childValue);
    }

    return output;
  }

  return null;
}

function topicJsonObject(topic: LayoutCandidate): JsonObject {
  const topicJson = toJsonValue(topic.topic_json ?? {});

  if (topicJson && typeof topicJson === "object" && !Array.isArray(topicJson)) {
    return topicJson;
  }

  return {};
}

function mergeSemanticLayoutIntoTopicJson(args: {
  topic: LayoutCandidate;
  computed: ComputedSemanticPosition;
  updatedAt: string;
  topicLabelEmbedding: ResolvedTopicLabelEmbedding;
}) {
  const base = topicJsonObject(args.topic);

  delete base.topic_embedding_centroid;
  delete base.topic_embedding_count;
  delete base.topic_embedding_model;
  delete base.topic_embedding_updated_at;
  delete base.topic_concept_embedding_centroid;
  delete base.topic_concept_embedding_count;
  delete base.topic_concept_embedding_model;
  delete base.topic_concept_embedding_updated_at;
  delete base.learning_pattern_embedding_centroid;
  delete base.learning_pattern_embedding_count;
  delete base.learning_pattern_embedding_model;
  delete base.learning_pattern_embedding_updated_at;

  const existingSemanticStatus =
    base.semantic_enrichment_status &&
    typeof base.semantic_enrichment_status === "object" &&
    !Array.isArray(base.semantic_enrichment_status)
      ? (base.semantic_enrichment_status as JsonObject)
      : {};

  return {
    ...base,
    topic_label: getTopicLabel(args.topic),
    semantic_position: args.computed.position,
    semantic_position_updated_at: args.updatedAt,
    semantic_position_method: args.computed.method,
    semantic_layout: {
      method: args.computed.method,
      embedding_source: "topic_label_embedding_centroid",
      resolved_embedding_source: args.topicLabelEmbedding.source,
      updated_at: args.updatedAt,
      reason: args.computed.reason,
      layout_decision: {
        should_cluster: args.computed.layout_decision.should_cluster,
        top_similarity: args.computed.layout_decision.top_similarity,
        second_similarity: args.computed.layout_decision.second_similarity,
        top_second_margin: args.computed.layout_decision.top_second_margin,
        supporting_neighbor_count:
          args.computed.layout_decision.supporting_neighbor_count,
        thresholds: args.computed.layout_decision.thresholds,
        visible_candidate_similarity_floor: MIN_VISIBLE_CANDIDATE_SIMILARITY,
      },
      neighbor_matches: args.computed.neighbor_matches.map((neighbor) => ({
        topic_id: neighbor.topic_id,
        topic_label: neighbor.topic_label,
        similarity: neighbor.similarity,
        weight: round4(neighbor.weight),
        reliability: neighbor.reliability,
        topic_label_embedding_count: neighbor.topic_label_embedding_count,
        topic_label_embedding_source: neighbor.topic_label_embedding_source,
      })),
    },
    semantic_enrichment_status: {
      ...existingSemanticStatus,
      status: "centroid_ready",
      needs_embedding_centroid: false,
      should_schedule_enrichment: false,
      layout_status: "semantic_position_ready",
      embedding_skip_reason: null,
      semantic_position_method: args.computed.method,
      semantic_layout_embedding_source: "topic_label_embedding_centroid",
      semantic_layout_resolved_embedding_source: args.topicLabelEmbedding.source,
    },
    layout_status: "semantic_position_ready",
    needs_embedding_centroid: false,
    should_schedule_enrichment: false,
    embedding_skip_reason: null,
  } satisfies JsonObject;
}

function findPendingLayoutTopics(rows: LayoutCandidate[]) {
  return rows
    .filter(hasTopicLabelEmbedding)
    .filter((topic) => !hasSemanticPosition(topic));
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams);

  try {
    const rows = await getLatestTopicState();
    const allPendingLayoutTopics = findPendingLayoutTopics(rows);
    const pendingTopics = allPendingLayoutTopics.slice(0, limit);

    const results = [];

    for (const [index, topic] of pendingTopics.entries()) {
      const topicLabel = getTopicLabel(topic);
      const topicLabelEmbedding = resolveTopicLabelEmbedding(topic);

      const computed = computeSemanticPosition({
        targetTopic: topic,
        allTopics: rows,
        fallbackIndex: index,
      });

      const updatedAt = nowIso();
      const topicJson = mergeSemanticLayoutIntoTopicJson({
        topic,
        computed,
        updatedAt,
        topicLabelEmbedding,
      });

      await upsertTopicState({
        topicId: topic.topic_id,
        lastRunId: topic.last_run_id,
        topicLabel,
        confusion: topic.confusion,
        insight: topic.insight,
        learningScore: topic.learning_score,
        diagnosis: topic.diagnosis,
        nextStep: topic.next_step,
        topicJson,

        topicLabelEmbeddingCentroid: topicLabelEmbedding.centroid,
        topicLabelEmbeddingCount: topicLabelEmbedding.count,
        topicLabelEmbeddingModel: topicLabelEmbedding.model,
        topicLabelEmbeddingUpdatedAt: topicLabelEmbedding.updated_at,

        topicMessageEmbeddingCentroid: topic.topic_message_embedding_centroid,
        topicMessageEmbeddingCount: topic.topic_message_embedding_count,
        topicMessageEmbeddingModel: topic.topic_message_embedding_model,
        topicMessageEmbeddingUpdatedAt:
          topic.topic_message_embedding_updated_at,

        semanticPosition: computed.position,
        semanticPositionUpdatedAt: updatedAt,
        semanticPositionMethod: computed.method,
      });

      results.push({
        topic_id: topic.topic_id,
        topic_label: topicLabel,
        status: "semantic_position_saved",
        semantic_position: computed.position,
        semantic_position_method: computed.method,
        semantic_layout_embedding_source: "topic_label_embedding_centroid",
        resolved_embedding_source: topicLabelEmbedding.source,
        topic_label_embedding_count: topicLabelEmbedding.count,
        visible_candidate_similarity_floor: MIN_VISIBLE_CANDIDATE_SIMILARITY,
        reason: computed.reason,
        layout_decision: {
          should_cluster: computed.layout_decision.should_cluster,
          top_similarity: computed.layout_decision.top_similarity,
          second_similarity: computed.layout_decision.second_similarity,
          top_second_margin: computed.layout_decision.top_second_margin,
          supporting_neighbor_count:
            computed.layout_decision.supporting_neighbor_count,
          thresholds: computed.layout_decision.thresholds,
        },
        neighbor_matches: computed.neighbor_matches.map((neighbor) => ({
          topic_id: neighbor.topic_id,
          topic_label: neighbor.topic_label,
          similarity: neighbor.similarity,
          reliability: neighbor.reliability,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      route: "POST /api/semantic-layout/recompute-pending",
      duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      limit,
      total_topics_seen: rows.length,
      topic_label_enriched_topic_count: enrichedTopics(rows).length,
      pending_layout_topics_found: allPendingLayoutTopics.length,
      processed_count: pendingTopics.length,
      updated_count: results.length,
      visible_candidate_similarity_floor: MIN_VISIBLE_CANDIDATE_SIMILARITY,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: "POST /api/semantic-layout/recompute-pending",
        duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
        error:
          error instanceof Error
            ? error.message
            : "Unknown semantic-layout recompute error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}