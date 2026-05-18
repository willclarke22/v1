// app/api/semantic-layout/recompute-pending/route.ts

import { NextResponse } from "next/server";
import {
  getLatestTopicState,
  type TopicPosition,
} from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import type { EmbeddingVector } from "@/types/contracts";
import {
  computeDeterministicTopicPosition,
  isTopicPosition3D,
  readTopicPositionFromJson,
} from "@/lib/learning-space/topic-position";

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

type SemanticNeighborRole =
  | "near_duplicate_candidate"
  | "strong_attractor"
  | "moderate_attractor"
  | "weak_attractor"
  | "visible_context";

type SemanticDistanceRelationshipFit =
  | "context_only"
  | "too_close"
  | "close_to_expected"
  | "too_far";

type SemanticNeighbor = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  raw_similarity: number;
  normalized_similarity: number;
  reliability: number;
  force_weight: number;
  desired_distance: number;
  actual_distance_after_layout: number;
  position: TopicPosition;
  semantic_role: SemanticNeighborRole;
  topic_label_embedding_count: number;
  topic_label_embedding_source: ResolvedTopicLabelEmbedding["source"];
};

type SemanticDistanceDiagnostic = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  raw_similarity: number;
  normalized_similarity: number;
  reliability: number;
  force_weight: number;
  semantic_role: SemanticNeighborRole;
  diagnostic_scope: "force_neighbor" | "near_duplicate" | "context_only";
  spacing_safety: "collision_safe" | "collision_violation";
  collision_min_distance: number;
  desired_distance: number;
  actual_distance_after_layout: number;
  distance_error: number;
  normalized_distance_error: number;
  tolerance: number;
  relationship_fit: SemanticDistanceRelationshipFit;
  interpretation: string;
};

type LayoutParameters = {
  enriched_topic_count: number;

  /**
   * These thresholds are now diagnostic labels only. They do not drive the
   * geometry. The geometry is continuous and pairwise, using the actual cosine
   * similarity from embeddings.
   */
  strong_attraction_similarity: number;
  moderate_attraction_similarity: number;
  weak_attraction_similarity: number;
  visible_context_similarity: number;
  near_duplicate_similarity: number;

  min_repulsion_distance: number;
  min_visual_breathing_room: number;
  max_visual_collision_radius: number;
  repulsion_strength: number;
  repulsion_iterations: number;
  max_planar_y_magnitude: number;
  y_axis_dampening: number;
  max_semantic_pull_alpha: number;
  min_semantic_pull_alpha: number;
  stability_anchor_strength: number;
  min_display_force_weight: number;

  /**
   * Continuous pairwise layout controls.
   */
  stress_iterations: number;
  stress_learning_rate: number;
  stress_max_pair_step: number;
  semantic_min_distance_padding: number;
  semantic_max_distance: number;
  normalization_low_percentile: number;
  normalization_high_percentile: number;
  similarity_curve_power: number;
  minimum_pair_weight: number;
  rank_diagnostic_sample_size: number;

  /**
   * Extra continuous correction pass after normal stress layout.
   * This is not a bucketed high/medium/low layout. It reinforces the global
   * monotonic contract: if sim(A,B) > sim(C,D), A/B should generally be closer.
   */
  rank_correction_iterations: number;
  rank_correction_learning_rate: number;
  rank_correction_max_pair_step: number;
  rank_high_similarity_pull_boost: number;
  rank_low_similarity_push_boost: number;
};

type SemanticLayoutDecision = {
  method: string;
  reason: string;
  semantic_neighbors: SemanticNeighbor[];
  force_neighbors: SemanticNeighbor[];
  layout_parameters: LayoutParameters;
  top_similarity: number | null;
  second_similarity: number | null;
  top_second_margin: number | null;
  total_attraction_weight: number;
  semantic_pull_alpha: number;
  emergent_region_signal: number;
};

type ComputedSemanticPosition = {
  position: TopicPosition;
  semantic_pull_position: TopicPosition;
  pre_repulsion_position: TopicPosition;
  method: string;
  semantic_neighbors: SemanticNeighbor[];
  force_neighbors: SemanticNeighbor[];
  semantic_distance_diagnostics: SemanticDistanceDiagnostic[];
  near_duplicate_candidates: SemanticNeighbor[];
  reason: string;
  layout_decision: SemanticLayoutDecision;
  repulsion_applied: boolean;
  repulsion_vector: TopicPosition;
  final_spacing_enforcement_applied: boolean;
  final_spacing_enforcement_vector: TopicPosition;
  final_spacing_enforcement_count: number;
};

type GlobalSemanticPairwiseDiagnostic = {
  topic_a_id: string;
  topic_a_label: string;
  topic_b_id: string;
  topic_b_label: string;
  similarity: number;
  raw_similarity: number;
  normalized_similarity: number;
  semantic_role: SemanticNeighborRole;
  diagnostic_scope: "force_candidate" | "near_duplicate" | "context_only";
  collision_min_distance: number;
  desired_distance: number;
  actual_distance_after_layout: number;
  distance_error: number;
  normalized_distance_error: number;
  tolerance: number;
  relationship_fit: SemanticDistanceRelationshipFit;
  spacing_safety: "collision_safe" | "collision_violation";
};

type GlobalLayoutContext = {
  allTopics: LayoutCandidate[];
  enrichedTopics: LayoutCandidate[];
  layoutParameters: LayoutParameters;
};

type PairwiseRelation = {
  key: string;
  topicA: LayoutCandidate;
  topicB: LayoutCandidate;
  topicAIndex: number;
  topicBIndex: number;
  similarity: number;
  normalizedSimilarity: number;
  reliability: number;
  weight: number;
  collisionMinDistance: number;
  desiredDistance: number;
  semanticRole: SemanticNeighborRole;
};

type PairwiseNormalization = {
  low_similarity: number;
  high_similarity: number;
  similarity_range: number;
  min_similarity: number;
  max_similarity: number;
  pair_count: number;
};

type RankViolationDiagnostic = {
  stronger_pair: {
    topic_a_id: string;
    topic_a_label: string;
    topic_b_id: string;
    topic_b_label: string;
    similarity: number;
    distance: number;
  };
  weaker_pair: {
    topic_a_id: string;
    topic_a_label: string;
    topic_b_id: string;
    topic_b_label: string;
    similarity: number;
    distance: number;
  };
  violation_margin: number;
  interpretation: string;
};

type ContinuousLayoutQuality = {
  similarity_distance_correlation: number | null;
  rank_violation_count_sampled: number;
  rank_comparison_count_sampled: number;
  rank_violation_rate_sampled: number | null;
  worst_rank_violations: RankViolationDiagnostic[];
  closest_neighbor_matches_most_similar_neighbor_count: number;
  closest_neighbor_topic_count: number;
  closest_neighbor_match_rate: number | null;
  collision_violation_count: number;
  pair_count: number;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TOP_K_NEIGHBORS = 10;

const OUTER_RING_RADIUS = 9.25;
const DEFAULT_RENDER_BASE_SCALE = 0.7;
const RENDER_BASE_SCALE_FACTOR = 0.9;
const RENDER_LEARNING_SCORE_RADIUS_FACTOR = 1.0;
const CONFUSION_SHAPE_EXPANSION_MAX = 0.18;
const FUTURE_BADGE_AND_SATELLITE_BUFFER = 0.18;
const MAX_CANONICAL_Y_MAGNITUDE = 1.25;

const SEMANTIC_LAYOUT_VERSION =
  "semantic_solar_plane_v13_rank_preserving_continuous_layout";

/**
 * Diagnostic only. The layout itself uses all available pairwise similarities.
 */
const MIN_DISPLAY_FORCE_WEIGHT = 0.01;

function nowIso() {
  return new Date().toISOString();
}

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");

  if (!raw) return DEFAULT_LIMIT;
  if (raw === "all") return MAX_LIMIT;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(parsed, MAX_LIMIT);
}

function parseBoolean(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);

  return raw === "true" || raw === "1" || raw === "yes";
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

function asTopicPosition(value: unknown): TopicPosition | null {
  return isTopicPosition3D(value) ? value : null;
}

function getTopicLabel(topic: LayoutCandidate) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function hasSemanticPosition(topic: LayoutCandidate) {
  return isTopicPosition3D(topic.semantic_position);
}

function resolveTopicLabelEmbedding(
  topic: LayoutCandidate,
): ResolvedTopicLabelEmbedding {
  const topicLabelCentroid = asEmbeddingVector(
    topic.topic_label_embedding_centroid,
  );

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

  return Boolean(
    resolved.centroid && resolved.centroid.length > 0 && resolved.count > 0,
  );
}

function fallbackRingPosition(
  index: number,
  radius = OUTER_RING_RADIUS,
): TopicPosition {
  const base = computeDeterministicTopicPosition(index);
  const length = Math.sqrt(base[0] * base[0] + base[2] * base[2]);

  if (!length) return [radius, base[1], 0];

  const scale = radius / length;

  return [base[0] * scale, base[1], base[2] * scale];
}

function getVisualPosition(
  topic: LayoutCandidate,
  fallbackIndex: number,
): TopicPosition {
  const topicPosition = asTopicPosition(topic.topic_position);

  if (topicPosition) return topicPosition;

  const jsonTopicPosition = readTopicPositionFromJson(topic.topic_json);

  if (jsonTopicPosition) return jsonTopicPosition;

  const semanticPosition = asTopicPosition(topic.semantic_position);

  if (semanticPosition) return semanticPosition;

  return fallbackRingPosition(fallbackIndex, OUTER_RING_RADIUS);
}

function estimateTopicRenderRadius(topic: LayoutCandidate) {
  const learningScore = clamp(topic.learning_score ?? 0.5, 0, 1);

  return clamp(
    DEFAULT_RENDER_BASE_SCALE * RENDER_BASE_SCALE_FACTOR +
      learningScore * RENDER_LEARNING_SCORE_RADIUS_FACTOR,
    0.48,
    1.58,
  );
}

function estimateTopicCollisionRadius(topic: LayoutCandidate) {
  const confusion = clamp(topic.confusion ?? 0.3, 0, 1);
  const renderRadius = estimateTopicRenderRadius(topic);
  const shapeExpansion = 1 + confusion * CONFUSION_SHAPE_EXPANSION_MAX;

  return clamp(
    renderRadius * shapeExpansion + FUTURE_BADGE_AND_SATELLITE_BUFFER,
    renderRadius + 0.16,
    2.05,
  );
}

function estimateTopicVisualRadius(topic: LayoutCandidate) {
  return estimateTopicCollisionRadius(topic);
}

function semanticBreathingRoomFactor(similarity: number) {
  return clamp(1 - Math.max(0, similarity) * 0.42, 0.62, 1);
}

function radiusAwareMinDistance(args: {
  targetTopic: LayoutCandidate;
  otherTopic: LayoutCandidate;
  similarity: number;
  parameters: LayoutParameters;
}) {
  const targetRadius = Math.min(
    estimateTopicVisualRadius(args.targetTopic),
    args.parameters.max_visual_collision_radius,
  );
  const otherRadius = Math.min(
    estimateTopicVisualRadius(args.otherTopic),
    args.parameters.max_visual_collision_radius,
  );

  const breathingRoom =
    args.parameters.min_visual_breathing_room *
    semanticBreathingRoomFactor(args.similarity);

  return Math.max(
    args.parameters.min_repulsion_distance,
    targetRadius + otherRadius + breathingRoom,
  );
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundPosition(position: TopicPosition): TopicPosition {
  return [round4(position[0]), round4(position[1]), round4(position[2])];
}

function centroidReliability(topicLabelEmbeddingCount: number) {
  if (topicLabelEmbeddingCount >= 5) return 1;
  if (topicLabelEmbeddingCount >= 3) return 0.86;
  if (topicLabelEmbeddingCount >= 2) return 0.74;
  return 0.6;
}

function getLayoutParameters(enrichedTopicCount: number): LayoutParameters {
  const semanticMaxDistance =
    enrichedTopicCount < 8
      ? 10.4
      : enrichedTopicCount < 30
        ? 13.25
        : 16.5;

  return {
    enriched_topic_count: enrichedTopicCount,

    /**
     * Debug labels only.
     */
    strong_attraction_similarity: 0.54,
    moderate_attraction_similarity: 0.4,
    weak_attraction_similarity: 0.24,
    visible_context_similarity: 0,
    near_duplicate_similarity: 0.72,

    min_repulsion_distance: enrichedTopicCount < 30 ? 2.55 : 2.45,
    min_visual_breathing_room: enrichedTopicCount < 30 ? 0.72 : 0.62,
    max_visual_collision_radius: 2.05,
    repulsion_strength: 0.82,
    repulsion_iterations: 28,
    max_planar_y_magnitude: MAX_CANONICAL_Y_MAGNITUDE,
    y_axis_dampening: 0.22,
    max_semantic_pull_alpha: 1,
    min_semantic_pull_alpha: 1,
    stability_anchor_strength: 0.2,
    min_display_force_weight: MIN_DISPLAY_FORCE_WEIGHT,

    stress_iterations: enrichedTopicCount < 16 ? 320 : 380,
    stress_learning_rate: 0.062,
    stress_max_pair_step: 0.34,
    semantic_min_distance_padding: 0.08,
    semantic_max_distance: semanticMaxDistance,
    normalization_low_percentile: 0.08,
    normalization_high_percentile: 0.92,
    similarity_curve_power: 1.62,
    minimum_pair_weight: 0.28,
    rank_diagnostic_sample_size: 1400,
    rank_correction_iterations: enrichedTopicCount < 16 ? 120 : 150,
    rank_correction_learning_rate: 0.052,
    rank_correction_max_pair_step: 0.3,
    rank_high_similarity_pull_boost: 1.75,
    rank_low_similarity_push_boost: 1.35,
  };
}

function classifyNeighbor(args: {
  similarity: number;
  parameters: LayoutParameters;
}): SemanticNeighborRole {
  if (args.similarity >= args.parameters.near_duplicate_similarity) {
    return "near_duplicate_candidate";
  }

  if (args.similarity >= args.parameters.strong_attraction_similarity) {
    return "strong_attractor";
  }

  if (args.similarity >= args.parameters.moderate_attraction_similarity) {
    return "moderate_attractor";
  }

  if (args.similarity >= args.parameters.weak_attraction_similarity) {
    return "weak_attractor";
  }

  return "visible_context";
}

function addPositions(a: TopicPosition, b: TopicPosition): TopicPosition {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractPositions(a: TopicPosition, b: TopicPosition): TopicPosition {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scalePosition(a: TopicPosition, scalar: number): TopicPosition {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function constrainToSemanticPlane(
  position: TopicPosition,
  parameters: LayoutParameters,
): TopicPosition {
  return [
    position[0],
    clamp(
      position[1] * parameters.y_axis_dampening,
      -parameters.max_planar_y_magnitude,
      parameters.max_planar_y_magnitude,
    ),
    position[2],
  ];
}

function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function percentile(sortedValues: number[], p: number) {
  if (!sortedValues.length) return 0;

  const clamped = clamp(p, 0, 1);
  const index = (sortedValues.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower];

  const fraction = index - lower;

  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

function normalizeSimilarity(args: {
  similarity: number;
  normalization: PairwiseNormalization;
}) {
  return clamp(
    (args.similarity - args.normalization.low_similarity) /
      Math.max(0.001, args.normalization.similarity_range),
    0,
    1,
  );
}

function desiredDistanceForNormalizedSimilarity(args: {
  normalizedSimilarity: number;
  collisionMinDistance: number;
  parameters: LayoutParameters;
}) {
  const semanticCloseness = Math.pow(
    clamp(args.normalizedSimilarity, 0, 1),
    args.parameters.similarity_curve_power,
  );

  const minDistance =
    args.collisionMinDistance + args.parameters.semantic_min_distance_padding;
  const maxDistance = Math.max(args.parameters.semantic_max_distance, minDistance);

  return minDistance + (maxDistance - minDistance) * (1 - semanticCloseness);
}

function buildPairwiseNormalization(similarities: number[]): PairwiseNormalization {
  const sorted = [...similarities].sort((a, b) => a - b);

  if (!sorted.length) {
    return {
      low_similarity: 0,
      high_similarity: 1,
      similarity_range: 1,
      min_similarity: 0,
      max_similarity: 0,
      pair_count: 0,
    };
  }

  const minSimilarity = sorted[0];
  const maxSimilarity = sorted[sorted.length - 1];
  let low = percentile(sorted, 0.08);
  let high = percentile(sorted, 0.92);

  /**
   * Keep the range real even when the current learning space has a narrow
   * similarity distribution. This preserves continuous behavior without letting
   * numerical noise explode the layout.
   */
  if (high - low < 0.12) {
    const center = (high + low) / 2;
    low = center - 0.06;
    high = center + 0.06;
  }

  return {
    low_similarity: round4(low),
    high_similarity: round4(high),
    similarity_range: round4(high - low),
    min_similarity: round4(minSimilarity),
    max_similarity: round4(maxSimilarity),
    pair_count: sorted.length,
  };
}

function buildInitialPositions(args: {
  topics: LayoutCandidate[];
}): Map<string, TopicPosition> {
  const positions = new Map<string, TopicPosition>();

  for (const [index, topic] of args.topics.entries()) {
    positions.set(topic.topic_id, getVisualPosition(topic, index));
  }

  return positions;
}

function buildPairwiseRelations(args: {
  context: GlobalLayoutContext;
  normalization: PairwiseNormalization;
}): PairwiseRelation[] {
  const relations: PairwiseRelation[] = [];

  for (
    let outerIndex = 0;
    outerIndex < args.context.enrichedTopics.length;
    outerIndex += 1
  ) {
    const topicA = args.context.enrichedTopics[outerIndex];
    const embeddingA = resolveTopicLabelEmbedding(topicA).centroid;

    if (!embeddingA) continue;

    for (
      let innerIndex = outerIndex + 1;
      innerIndex < args.context.enrichedTopics.length;
      innerIndex += 1
    ) {
      const topicB = args.context.enrichedTopics[innerIndex];
      const embeddingB = resolveTopicLabelEmbedding(topicB).centroid;

      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      const normalizedSimilarity = normalizeSimilarity({
        similarity,
        normalization: args.normalization,
      });
      const reliability = Math.min(
        centroidReliability(resolveTopicLabelEmbedding(topicA).count),
        centroidReliability(resolveTopicLabelEmbedding(topicB).count),
      );
      const collisionMinDistance = radiusAwareMinDistance({
        targetTopic: topicA,
        otherTopic: topicB,
        similarity,
        parameters: args.context.layoutParameters,
      });
      const desiredDistance = desiredDistanceForNormalizedSimilarity({
        normalizedSimilarity,
        collisionMinDistance,
        parameters: args.context.layoutParameters,
      });

      /**
       * All pairs contribute continuously. Weak pairs still matter because they
       * define far-distance structure and prevent random close neighbors.
       * Stronger pairs simply receive more precision.
       */
      const weight =
        reliability *
        (args.context.layoutParameters.minimum_pair_weight +
          (1 - args.context.layoutParameters.minimum_pair_weight) *
            Math.pow(normalizedSimilarity, 1.25));

      relations.push({
        key: pairKey(topicA.topic_id, topicB.topic_id),
        topicA,
        topicB,
        topicAIndex: outerIndex,
        topicBIndex: innerIndex,
        similarity,
        normalizedSimilarity,
        reliability,
        weight,
        collisionMinDistance,
        desiredDistance,
        semanticRole: classifyNeighbor({
          similarity,
          parameters: args.context.layoutParameters,
        }),
      });
    }
  }

  return relations;
}

function buildRelationsByTopic(relations: PairwiseRelation[]) {
  const byTopic = new Map<string, PairwiseRelation[]>();

  for (const relation of relations) {
    const aList = byTopic.get(relation.topicA.topic_id) ?? [];
    const bList = byTopic.get(relation.topicB.topic_id) ?? [];

    aList.push(relation);
    bList.push(relation);

    byTopic.set(relation.topicA.topic_id, aList);
    byTopic.set(relation.topicB.topic_id, bList);
  }

  for (const [topicId, list] of byTopic.entries()) {
    byTopic.set(
      topicId,
      list.sort((a, b) => b.similarity - a.similarity),
    );
  }

  return byTopic;
}

function getOtherTopicFromRelation(
  relation: PairwiseRelation,
  topicId: string,
) {
  return relation.topicA.topic_id === topicId ? relation.topicB : relation.topicA;
}

function getOtherTopicIndexFromRelation(
  relation: PairwiseRelation,
  topicId: string,
) {
  return relation.topicA.topic_id === topicId
    ? relation.topicBIndex
    : relation.topicAIndex;
}

function meanPosition(positions: Map<string, TopicPosition>) {
  let count = 0;
  let total: TopicPosition = [0, 0, 0];

  for (const position of positions.values()) {
    total = addPositions(total, position);
    count += 1;
  }

  if (!count) return [0, 0, 0] satisfies TopicPosition;

  return scalePosition(total, 1 / count);
}

function recenterPositions(positions: Map<string, TopicPosition>) {
  const center = meanPosition(positions);

  for (const [topicId, position] of positions.entries()) {
    positions.set(topicId, subtractPositions(position, center));
  }
}

function applyPairwiseStressLayout(args: {
  context: GlobalLayoutContext;
  relations: PairwiseRelation[];
  initialPositions: Map<string, TopicPosition>;
}) {
  const positions = new Map<string, TopicPosition>();

  for (const [topicId, position] of args.initialPositions.entries()) {
    positions.set(topicId, position);
  }

  const anchorPositions = new Map(args.initialPositions);

  for (
    let iteration = 0;
    iteration < args.context.layoutParameters.stress_iterations;
    iteration += 1
  ) {
    const progress =
      iteration / Math.max(1, args.context.layoutParameters.stress_iterations - 1);
    const learningRate =
      args.context.layoutParameters.stress_learning_rate * (1 - progress * 0.52);

    for (const relation of args.relations) {
      const positionA = positions.get(relation.topicA.topic_id);
      const positionB = positions.get(relation.topicB.topic_id);

      if (!positionA || !positionB) continue;

      const delta = subtractPositions(positionB, positionA);
      const distance = Math.max(0.001, distanceBetween(positionA, positionB));
      const direction = scalePosition(delta, 1 / distance);
      const error = distance - relation.desiredDistance;
      const step = clamp(
        error * relation.weight * learningRate,
        -args.context.layoutParameters.stress_max_pair_step,
        args.context.layoutParameters.stress_max_pair_step,
      );
      const correction = scalePosition(direction, step * 0.5);

      positions.set(
        relation.topicA.topic_id,
        constrainToSemanticPlane(
          addPositions(positionA, correction),
          args.context.layoutParameters,
        ),
      );
      positions.set(
        relation.topicB.topic_id,
        constrainToSemanticPlane(
          subtractPositions(positionB, correction),
          args.context.layoutParameters,
        ),
      );
    }

    /**
     * Low-strength stability: established topics should keep some spatial
     * memory, but semantic truth is primary. Fresh topics with no prior
     * semantic_position are treated as provisional and receive little anchoring.
     */
    for (const topic of args.context.enrichedTopics) {
      const current = positions.get(topic.topic_id);
      const anchor = anchorPositions.get(topic.topic_id);

      if (!current || !anchor) continue;

      const anchorAlpha = hasSemanticPosition(topic)
        ? 0.0025 * args.context.layoutParameters.stability_anchor_strength
        : 0.0004;

      positions.set(
        topic.topic_id,
        constrainToSemanticPlane(
          [
            current[0] + (anchor[0] - current[0]) * anchorAlpha,
            current[1] + (anchor[1] - current[1]) * anchorAlpha,
            current[2] + (anchor[2] - current[2]) * anchorAlpha,
          ],
          args.context.layoutParameters,
        ),
      );
    }

    if (iteration % 10 === 0) {
      recenterPositions(positions);
    }
  }

  recenterPositions(positions);

  return positions;
}

function applyRankPreservingCorrection(args: {
  context: GlobalLayoutContext;
  relations: PairwiseRelation[];
  positions: Map<string, TopicPosition>;
}) {
  const positions = new Map(args.positions);

  /**
   * Sort high-similarity pairs first so the most meaningful relationships get
   * first claim on local geometry, then let weak pairs push apart later in the
   * same iteration. This is still continuous: every pair participates using its
   * normalized embedding similarity and desired distance.
   */
  const orderedRelations = [...args.relations].sort((a, b) => {
    const aPriority = Math.abs(a.normalizedSimilarity - 0.5);
    const bPriority = Math.abs(b.normalizedSimilarity - 0.5);

    if (bPriority !== aPriority) return bPriority - aPriority;
    return b.normalizedSimilarity - a.normalizedSimilarity;
  });

  for (
    let iteration = 0;
    iteration < args.context.layoutParameters.rank_correction_iterations;
    iteration += 1
  ) {
    const progress =
      iteration /
      Math.max(1, args.context.layoutParameters.rank_correction_iterations - 1);
    const learningRate =
      args.context.layoutParameters.rank_correction_learning_rate *
      (1 - progress * 0.58);

    for (const relation of orderedRelations) {
      const positionA = positions.get(relation.topicA.topic_id);
      const positionB = positions.get(relation.topicB.topic_id);

      if (!positionA || !positionB) continue;

      const delta = subtractPositions(positionB, positionA);
      const distance = Math.max(0.001, distanceBetween(positionA, positionB));
      const direction = scalePosition(delta, 1 / distance);
      const error = distance - relation.desiredDistance;

      /**
       * High similarity pairs get stronger pull when too far.
       * Low similarity pairs get stronger push when too close.
       * Middle pairs still participate, but less aggressively.
       */
      const highSimilarityPull =
        args.context.layoutParameters.rank_high_similarity_pull_boost *
        Math.pow(relation.normalizedSimilarity, 1.35);
      const lowSimilarityPush =
        args.context.layoutParameters.rank_low_similarity_push_boost *
        Math.pow(1 - relation.normalizedSimilarity, 1.2);
      const directionalBoost = error > 0 ? highSimilarityPull : lowSimilarityPush;
      const priority = clamp(
        relation.weight * (0.85 + directionalBoost),
        args.context.layoutParameters.minimum_pair_weight * 0.55,
        2.4,
      );
      const rawStep = error * priority * learningRate;
      const step = clamp(
        rawStep,
        -args.context.layoutParameters.rank_correction_max_pair_step,
        args.context.layoutParameters.rank_correction_max_pair_step,
      );
      const correction = scalePosition(direction, step * 0.5);

      positions.set(
        relation.topicA.topic_id,
        constrainToSemanticPlane(
          addPositions(positionA, correction),
          args.context.layoutParameters,
        ),
      );
      positions.set(
        relation.topicB.topic_id,
        constrainToSemanticPlane(
          subtractPositions(positionB, correction),
          args.context.layoutParameters,
        ),
      );
    }

    if (iteration % 8 === 0) {
      recenterPositions(positions);
    }
  }

  recenterPositions(positions);

  return positions;
}

function enforceGlobalReadableSpacing(args: {
  context: GlobalLayoutContext;
  relations: PairwiseRelation[];
  positions: Map<string, TopicPosition>;
}) {
  const positions = new Map(args.positions);
  let correctionCount = 0;
  let totalCorrection: TopicPosition = [0, 0, 0];

  for (
    let iteration = 0;
    iteration < args.context.layoutParameters.repulsion_iterations;
    iteration += 1
  ) {
    let iterationCorrected = false;

    for (const relation of args.relations) {
      const positionA = positions.get(relation.topicA.topic_id);
      const positionB = positions.get(relation.topicB.topic_id);

      if (!positionA || !positionB) continue;

      const minimumDistance =
        relation.collisionMinDistance +
        args.context.layoutParameters.semantic_min_distance_padding;
      const distance = distanceBetween(positionA, positionB);

      if (distance >= minimumDistance) continue;

      const direction =
        distance > 0.001
          ? scalePosition(subtractPositions(positionB, positionA), 1 / distance)
          : [1, 0, 0] satisfies TopicPosition;

      const correctionDistance = (minimumDistance - Math.max(distance, 0.001)) * 0.54;
      const correction = scalePosition(direction, correctionDistance * 0.5);

      positions.set(
        relation.topicA.topic_id,
        constrainToSemanticPlane(
          subtractPositions(positionA, correction),
          args.context.layoutParameters,
        ),
      );
      positions.set(
        relation.topicB.topic_id,
        constrainToSemanticPlane(
          addPositions(positionB, correction),
          args.context.layoutParameters,
        ),
      );

      totalCorrection = addPositions(totalCorrection, correction);
      correctionCount += 1;
      iterationCorrected = true;
    }

    if (!iterationCorrected) break;
  }

  recenterPositions(positions);

  return {
    positions,
    correctedCount: correctionCount,
    correctionVector: totalCorrection,
  };
}

function buildSemanticNeighborFromRelation(args: {
  relation: PairwiseRelation;
  topic: LayoutCandidate;
  positions: Map<string, TopicPosition>;
}) {
  const otherTopic = getOtherTopicFromRelation(args.relation, args.topic.topic_id);
  const otherPosition =
    args.positions.get(otherTopic.topic_id) ??
    getVisualPosition(otherTopic, getOtherTopicIndexFromRelation(args.relation, args.topic.topic_id));
  const actualDistance = distanceBetween(
    args.positions.get(args.topic.topic_id) ?? getVisualPosition(args.topic, 0),
    otherPosition,
  );
  const otherEmbedding = resolveTopicLabelEmbedding(otherTopic);

  return {
    topic_id: otherTopic.topic_id,
    topic_label: getTopicLabel(otherTopic),
    similarity: round4(args.relation.similarity),
    raw_similarity: args.relation.similarity,
    normalized_similarity: round4(args.relation.normalizedSimilarity),
    reliability: args.relation.reliability,
    force_weight: round4(args.relation.weight),
    desired_distance: round4(args.relation.desiredDistance),
    actual_distance_after_layout: round4(actualDistance),
    position: roundPosition(otherPosition),
    semantic_role: args.relation.semanticRole,
    topic_label_embedding_count: otherEmbedding.count,
    topic_label_embedding_source: otherEmbedding.source,
  } satisfies SemanticNeighbor;
}

function diagnosticScopeForNeighbor(neighbor: SemanticNeighbor) {
  if (neighbor.semantic_role === "near_duplicate_candidate") {
    return "near_duplicate" as const;
  }

  return "force_neighbor" as const;
}

function interpretDistanceFit(args: {
  distanceError: number;
  tolerance: number;
  diagnosticScope: "force_neighbor" | "near_duplicate" | "context_only";
}): SemanticDistanceRelationshipFit {
  if (args.diagnosticScope === "context_only") return "context_only";
  if (args.distanceError < -args.tolerance) return "too_close";
  if (args.distanceError > args.tolerance) return "too_far";
  return "close_to_expected";
}

function buildDistanceInterpretation(args: {
  topicLabel: string;
  neighborLabel: string;
  similarity: number;
  normalizedSimilarity: number;
  desiredDistance: number;
  actualDistance: number;
  relationshipFit: SemanticDistanceRelationshipFit;
  spacingSafety: "collision_safe" | "collision_violation";
}) {
  const similarityText = args.similarity.toFixed(3);
  const normalizedText = args.normalizedSimilarity.toFixed(3);
  const desiredText = args.desiredDistance.toFixed(3);
  const actualText = args.actualDistance.toFixed(3);
  const safetyText =
    args.spacingSafety === "collision_violation"
      ? " The pair is below the readable spacing floor."
      : " The pair remains readable.";

  if (args.relationshipFit === "close_to_expected") {
    return `${args.topicLabel} and ${args.neighborLabel} are close to the continuous embedding-distance target; similarity=${similarityText}, normalized=${normalizedText}, desired≈${desiredText}, actual≈${actualText}.${safetyText}`;
  }

  if (args.relationshipFit === "too_close") {
    return `${args.topicLabel} and ${args.neighborLabel} are closer than the continuous embedding-distance target; similarity=${similarityText}, normalized=${normalizedText}, desired≈${desiredText}, actual≈${actualText}.${safetyText}`;
  }

  return `${args.topicLabel} and ${args.neighborLabel} are farther than the continuous embedding-distance target; similarity=${similarityText}, normalized=${normalizedText}, desired≈${desiredText}, actual≈${actualText}.${safetyText}`;
}

function buildSemanticDistanceDiagnostics(args: {
  topic: LayoutCandidate;
  topicLabel: string;
  finalPosition: TopicPosition;
  context: GlobalLayoutContext;
  semanticNeighbors: SemanticNeighbor[];
  relationsByKey: Map<string, PairwiseRelation>;
}): SemanticDistanceDiagnostic[] {
  return args.semanticNeighbors.map((neighbor) => {
    const relation = args.relationsByKey.get(
      pairKey(args.topic.topic_id, neighbor.topic_id),
    );
    const neighborTopic = args.context.allTopics.find(
      (candidate) => candidate.topic_id === neighbor.topic_id,
    );
    const collisionMinDistance =
      relation?.collisionMinDistance ??
      (neighborTopic
        ? radiusAwareMinDistance({
            targetTopic: args.topic,
            otherTopic: neighborTopic,
            similarity: neighbor.raw_similarity,
            parameters: args.context.layoutParameters,
          })
        : args.context.layoutParameters.min_repulsion_distance);
    const desiredDistance = relation?.desiredDistance ?? neighbor.desired_distance;
    const actualDistance = distanceBetween(args.finalPosition, neighbor.position);
    const distanceError = actualDistance - desiredDistance;
    const tolerance = Math.max(0.38, collisionMinDistance * 0.18);
    const diagnosticScope = diagnosticScopeForNeighbor(neighbor);
    const spacingSafety =
      actualDistance + 0.001 < collisionMinDistance
        ? "collision_violation"
        : "collision_safe";
    const relationshipFit = interpretDistanceFit({
      distanceError,
      tolerance,
      diagnosticScope,
    });

    return {
      topic_id: neighbor.topic_id,
      topic_label: neighbor.topic_label,
      similarity: neighbor.similarity,
      raw_similarity: round4(neighbor.raw_similarity),
      normalized_similarity: neighbor.normalized_similarity,
      reliability: round4(neighbor.reliability),
      force_weight: neighbor.force_weight,
      semantic_role: neighbor.semantic_role,
      diagnostic_scope: diagnosticScope,
      spacing_safety: spacingSafety,
      collision_min_distance: round4(collisionMinDistance),
      desired_distance: round4(desiredDistance),
      actual_distance_after_layout: round4(actualDistance),
      distance_error: round4(distanceError),
      normalized_distance_error: round4(
        distanceError / Math.max(desiredDistance, 0.001),
      ),
      tolerance: round4(tolerance),
      relationship_fit: relationshipFit,
      interpretation: buildDistanceInterpretation({
        topicLabel: args.topicLabel,
        neighborLabel: neighbor.topic_label,
        similarity: neighbor.raw_similarity,
        normalizedSimilarity: neighbor.normalized_similarity,
        desiredDistance,
        actualDistance,
        relationshipFit,
        spacingSafety,
      }),
    };
  });
}

function buildComputedSemanticPositions(args: {
  context: GlobalLayoutContext;
  positions: Map<string, TopicPosition>;
  initialPositions: Map<string, TopicPosition>;
  relationsByTopic: Map<string, PairwiseRelation[]>;
  relationsByKey: Map<string, PairwiseRelation>;
  spacingCorrectedCount: number;
  spacingCorrectionVector: TopicPosition;
}): Map<string, ComputedSemanticPosition> {
  const computedByTopic = new Map<string, ComputedSemanticPosition>();

  for (const [index, topic] of args.context.enrichedTopics.entries()) {
    const finalPosition = roundPosition(
      args.positions.get(topic.topic_id) ?? getVisualPosition(topic, index),
    );
    const initialPosition = roundPosition(
      args.initialPositions.get(topic.topic_id) ?? getVisualPosition(topic, index),
    );
    const relations = args.relationsByTopic.get(topic.topic_id) ?? [];
    const semanticNeighbors = relations
      .slice(0, TOP_K_NEIGHBORS)
      .map((relation) =>
        buildSemanticNeighborFromRelation({
          relation,
          topic,
          positions: args.positions,
        }),
      );
    const forceNeighbors = semanticNeighbors.filter(
      (neighbor) => neighbor.force_weight >= MIN_DISPLAY_FORCE_WEIGHT,
    );
    const topSimilarity = semanticNeighbors[0]?.raw_similarity ?? null;
    const secondSimilarity = semanticNeighbors[1]?.raw_similarity ?? null;
    const totalAttractionWeight = semanticNeighbors.reduce(
      (sum, neighbor) => sum + neighbor.force_weight,
      0,
    );
    const semanticDistanceDiagnostics = buildSemanticDistanceDiagnostics({
      topic,
      topicLabel: getTopicLabel(topic),
      finalPosition,
      context: args.context,
      semanticNeighbors,
      relationsByKey: args.relationsByKey,
    });

    computedByTopic.set(topic.topic_id, {
      position: finalPosition,
      semantic_pull_position: finalPosition,
      pre_repulsion_position: initialPosition,
      method: "continuous_pairwise_embedding_stress_v2_rank_preserving_topic_label_embedding",
      semantic_neighbors: semanticNeighbors,
      force_neighbors: forceNeighbors,
      semantic_distance_diagnostics: semanticDistanceDiagnostics,
      near_duplicate_candidates: semanticNeighbors.filter(
        (neighbor) => neighbor.semantic_role === "near_duplicate_candidate",
      ),
      reason:
        "Computed semantic_position by fitting all enriched topic pairs to a continuous embedding-derived desired-distance matrix, then applying a rank-preserving correction pass so more similar pairs are more likely to be closer globally. No high/medium/low buckets drive geometry; thresholds are diagnostic labels only.",
      layout_decision: {
        method: "continuous_pairwise_embedding_stress_v2_rank_preserving_topic_label_embedding",
        reason:
          "Continuous pairwise stress layout with rank-preserving correction: every embedding pair contributes to the geometry using cosine similarity mapped to desired distance, then high-similarity-too-far and low-similarity-too-close errors are corrected continuously.",
        semantic_neighbors: semanticNeighbors,
        force_neighbors: forceNeighbors,
        layout_parameters: args.context.layoutParameters,
        top_similarity: topSimilarity === null ? null : round4(topSimilarity),
        second_similarity:
          secondSimilarity === null ? null : round4(secondSimilarity),
        top_second_margin:
          topSimilarity !== null && secondSimilarity !== null
            ? round4(topSimilarity - secondSimilarity)
            : null,
        total_attraction_weight: round4(totalAttractionWeight),
        semantic_pull_alpha: 1,
        emergent_region_signal: round4(
          clamp(totalAttractionWeight / Math.max(semanticNeighbors.length, 1), 0, 1),
        ),
      },
      repulsion_applied: args.spacingCorrectedCount > 0,
      repulsion_vector: roundPosition(args.spacingCorrectionVector),
      final_spacing_enforcement_applied: args.spacingCorrectedCount > 0,
      final_spacing_enforcement_vector: roundPosition(args.spacingCorrectionVector),
      final_spacing_enforcement_count: args.spacingCorrectedCount,
    });
  }

  return computedByTopic;
}

function pearsonCorrelation(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;

  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean;
    const y = ys[index] - yMean;

    numerator += x * y;
    xDenominator += x * x;
    yDenominator += y * y;
  }

  const denominator = Math.sqrt(xDenominator * yDenominator);

  if (!denominator) return null;

  return numerator / denominator;
}

function buildRankViolation(args: {
  stronger: PairwiseRelation;
  strongerDistance: number;
  weaker: PairwiseRelation;
  weakerDistance: number;
}): RankViolationDiagnostic {
  const margin = args.weakerDistance - args.strongerDistance;

  return {
    stronger_pair: {
      topic_a_id: args.stronger.topicA.topic_id,
      topic_a_label: getTopicLabel(args.stronger.topicA),
      topic_b_id: args.stronger.topicB.topic_id,
      topic_b_label: getTopicLabel(args.stronger.topicB),
      similarity: round4(args.stronger.similarity),
      distance: round4(args.strongerDistance),
    },
    weaker_pair: {
      topic_a_id: args.weaker.topicA.topic_id,
      topic_a_label: getTopicLabel(args.weaker.topicA),
      topic_b_id: args.weaker.topicB.topic_id,
      topic_b_label: getTopicLabel(args.weaker.topicB),
      similarity: round4(args.weaker.similarity),
      distance: round4(args.weakerDistance),
    },
    violation_margin: round4(Math.abs(margin)),
    interpretation:
      "A weaker-similarity pair is closer than a stronger-similarity pair. Some violations are unavoidable in a 2D/planar projection, but this should trend downward as the layout improves.",
  };
}

function buildContinuousLayoutQuality(args: {
  relations: PairwiseRelation[];
  positions: Map<string, TopicPosition>;
  context: GlobalLayoutContext;
}): ContinuousLayoutQuality {
  const similarities: number[] = [];
  const negativeDistances: number[] = [];
  const distancesByKey = new Map<string, number>();
  let collisionViolationCount = 0;

  for (const relation of args.relations) {
    const positionA = args.positions.get(relation.topicA.topic_id);
    const positionB = args.positions.get(relation.topicB.topic_id);

    if (!positionA || !positionB) continue;

    const distance = distanceBetween(positionA, positionB);

    distancesByKey.set(relation.key, distance);
    similarities.push(relation.similarity);
    negativeDistances.push(-distance);

    if (distance + 0.001 < relation.collisionMinDistance) {
      collisionViolationCount += 1;
    }
  }

  const sortedBySimilarity = [...args.relations].sort(
    (a, b) => b.similarity - a.similarity,
  );
  const sampleSize = Math.min(
    args.context.layoutParameters.rank_diagnostic_sample_size,
    sortedBySimilarity.length * Math.max(0, sortedBySimilarity.length - 1) * 0.5,
  );
  let comparisons = 0;
  let violations = 0;
  const worstViolations: RankViolationDiagnostic[] = [];

  for (
    let i = 0;
    i < sortedBySimilarity.length && comparisons < sampleSize;
    i += 1
  ) {
    for (
      let j = i + 1;
      j < sortedBySimilarity.length && comparisons < sampleSize;
      j += 1
    ) {
      const stronger = sortedBySimilarity[i];
      const weaker = sortedBySimilarity[j];
      const strongerDistance = distancesByKey.get(stronger.key);
      const weakerDistance = distancesByKey.get(weaker.key);

      if (
        strongerDistance === undefined ||
        weakerDistance === undefined ||
        stronger.similarity <= weaker.similarity
      ) {
        continue;
      }

      comparisons += 1;

      if (strongerDistance > weakerDistance + 0.001) {
        violations += 1;

        const violation = buildRankViolation({
          stronger,
          strongerDistance,
          weaker,
          weakerDistance,
        });

        worstViolations.push(violation);
        worstViolations.sort((a, b) => b.violation_margin - a.violation_margin);

        if (worstViolations.length > 8) {
          worstViolations.pop();
        }
      }
    }
  }

  let closestMatchCount = 0;
  let closestTopicCount = 0;

  for (const topic of args.context.enrichedTopics) {
    const topicRelations = args.relations
      .filter(
        (relation) =>
          relation.topicA.topic_id === topic.topic_id ||
          relation.topicB.topic_id === topic.topic_id,
      )
      .sort((a, b) => b.similarity - a.similarity);

    if (!topicRelations.length) continue;

    closestTopicCount += 1;

    const mostSimilar = topicRelations[0];
    const closest = [...topicRelations].sort((a, b) => {
      const distanceA = distancesByKey.get(a.key) ?? Number.POSITIVE_INFINITY;
      const distanceB = distancesByKey.get(b.key) ?? Number.POSITIVE_INFINITY;

      return distanceA - distanceB;
    })[0];

    if (closest?.key === mostSimilar.key) {
      closestMatchCount += 1;
    }
  }

  return {
    similarity_distance_correlation:
      pearsonCorrelation(similarities, negativeDistances) === null
        ? null
        : round4(pearsonCorrelation(similarities, negativeDistances) ?? 0),
    rank_violation_count_sampled: violations,
    rank_comparison_count_sampled: comparisons,
    rank_violation_rate_sampled:
      comparisons > 0 ? round4(violations / comparisons) : null,
    worst_rank_violations: worstViolations,
    closest_neighbor_matches_most_similar_neighbor_count: closestMatchCount,
    closest_neighbor_topic_count: closestTopicCount,
    closest_neighbor_match_rate:
      closestTopicCount > 0 ? round4(closestMatchCount / closestTopicCount) : null,
    collision_violation_count: collisionViolationCount,
    pair_count: distancesByKey.size,
  };
}

function buildGlobalPairwiseDiagnostics(args: {
  context: GlobalLayoutContext;
  relations: PairwiseRelation[];
  positions: Map<string, TopicPosition>;
}): GlobalSemanticPairwiseDiagnostic[] {
  const diagnostics = args.relations.map((relation) => {
    const positionA =
      args.positions.get(relation.topicA.topic_id) ??
      getVisualPosition(relation.topicA, relation.topicAIndex);
    const positionB =
      args.positions.get(relation.topicB.topic_id) ??
      getVisualPosition(relation.topicB, relation.topicBIndex);
    const actualDistance = distanceBetween(positionA, positionB);
    const distanceError = actualDistance - relation.desiredDistance;
    const tolerance = Math.max(0.38, relation.collisionMinDistance * 0.18);
    const diagnosticScope: GlobalSemanticPairwiseDiagnostic["diagnostic_scope"] =
      relation.semanticRole === "near_duplicate_candidate"
        ? "near_duplicate"
        : "force_candidate";
    const relationshipFit =
      diagnosticScope === "near_duplicate"
        ? interpretDistanceFit({
            distanceError,
            tolerance,
            diagnosticScope: "near_duplicate",
          })
        : interpretDistanceFit({
            distanceError,
            tolerance,
            diagnosticScope: "force_neighbor",
          });

    return {
      topic_a_id: relation.topicA.topic_id,
      topic_a_label: getTopicLabel(relation.topicA),
      topic_b_id: relation.topicB.topic_id,
      topic_b_label: getTopicLabel(relation.topicB),
      similarity: round4(relation.similarity),
      raw_similarity: round4(relation.similarity),
      normalized_similarity: round4(relation.normalizedSimilarity),
      semantic_role: relation.semanticRole,
      diagnostic_scope: diagnosticScope,
      collision_min_distance: round4(relation.collisionMinDistance),
      desired_distance: round4(relation.desiredDistance),
      actual_distance_after_layout: round4(actualDistance),
      distance_error: round4(distanceError),
      normalized_distance_error: round4(
        distanceError / Math.max(relation.desiredDistance, 0.001),
      ),
      tolerance: round4(tolerance),
      relationship_fit: relationshipFit,
      spacing_safety:
        actualDistance + 0.001 < relation.collisionMinDistance
          ? "collision_violation"
          : "collision_safe",
    } satisfies GlobalSemanticPairwiseDiagnostic;
  });

  return diagnostics
    .sort((a, b) => {
      if (a.spacing_safety !== b.spacing_safety) {
        return a.spacing_safety === "collision_violation" ? -1 : 1;
      }

      if (a.relationship_fit !== b.relationship_fit) {
        const rank = {
          too_close: 0,
          too_far: 1,
          close_to_expected: 2,
          context_only: 3,
        } satisfies Record<SemanticDistanceRelationshipFit, number>;

        return rank[a.relationship_fit] - rank[b.relationship_fit];
      }

      return b.similarity - a.similarity;
    })
    .slice(0, 60);
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

function getJsonObjectChild(
  object: JsonObject,
  key: string,
): JsonObject | null {
  const child = object[key];

  if (child && typeof child === "object" && !Array.isArray(child)) {
    return child;
  }

  return null;
}

function buildLearningSpaceTopicSnapshot(args: {
  topic: LayoutCandidate;
  computed: ComputedSemanticPosition;
  updatedAt: string;
}) {
  return {
    topic_id: args.topic.topic_id,
    topic_label: getTopicLabel(args.topic),
    position: asTopicPosition(args.topic.topic_position) ?? args.computed.position,
    layout: {
      position_source: "topic_position",
      semantic_position: args.computed.position,
      semantic_position_method: args.computed.method,
      semantic_position_updated_at: args.updatedAt,
    },
    semantic_position: args.computed.position,
    semantic_position_method: args.computed.method,
    semantic_position_updated_at: args.updatedAt,
  } satisfies JsonObject;
}

function hasStaleLearningSpaceTopicLayout(topic: LayoutCandidate) {
  const base = topicJsonObject(topic);
  const semanticStatus = getJsonObjectChild(base, "semantic_enrichment_status");
  const semanticLayout = getJsonObjectChild(base, "semantic_layout");
  const learningSpaceTopic = getJsonObjectChild(base, "learning_space_topic");
  const layout = learningSpaceTopic
    ? getJsonObjectChild(learningSpaceTopic, "layout")
    : null;

  const statusVersion =
    typeof semanticStatus?.semantic_layout_version === "string"
      ? semanticStatus.semantic_layout_version
      : null;
  const layoutVersion =
    typeof semanticLayout?.version === "string" ? semanticLayout.version : null;
  const method =
    typeof layout?.semantic_position_method === "string"
      ? layout.semantic_position_method
      : null;

  return (
    statusVersion !== SEMANTIC_LAYOUT_VERSION ||
    layoutVersion !== SEMANTIC_LAYOUT_VERSION ||
    method !== "continuous_pairwise_embedding_stress_v2_rank_preserving_topic_label_embedding"
  );
}

function mergeSemanticLayoutIntoTopicJson(args: {
  topic: LayoutCandidate;
  computed: ComputedSemanticPosition;
  updatedAt: string;
  topicLabelEmbedding: ResolvedTopicLabelEmbedding;
  globalLayoutSummary: JsonObject;
  normalization: PairwiseNormalization;
  layoutQuality: ContinuousLayoutQuality;
}) {
  const base = topicJsonObject(args.topic);
  const existingSemanticStatus =
    getJsonObjectChild(base, "semantic_enrichment_status") ?? {};

  base.topic_label = getTopicLabel(args.topic);
  base.semantic_position = args.computed.position;
  base.semantic_position_method = args.computed.method;
  base.semantic_position_updated_at = args.updatedAt;
  base.learning_space_topic = buildLearningSpaceTopicSnapshot({
    topic: args.topic,
    computed: args.computed,
    updatedAt: args.updatedAt,
  });
  base.semantic_layout = {
    ...args.globalLayoutSummary,
    normalization: args.normalization,
    layout_quality: args.layoutQuality,
    semantic_position: args.computed.position,
    semantic_pull_position: args.computed.semantic_pull_position,
    pre_repulsion_position: args.computed.pre_repulsion_position,
    estimated_render_radius: round4(estimateTopicRenderRadius(args.topic)),
    estimated_collision_radius: round4(estimateTopicCollisionRadius(args.topic)),
    final_spacing_enforcement_applied:
      args.computed.final_spacing_enforcement_applied,
    final_spacing_enforcement_vector: args.computed.final_spacing_enforcement_vector,
    final_spacing_enforcement_count: args.computed.final_spacing_enforcement_count,
    distance_diagnostic_policy:
      "Continuous pairwise objective: every embedding pair maps to a desired distance, followed by a rank-preserving correction pass. Diagnostics report how well final layout distances match those continuous targets and global rank ordering.",
  };
  base.semantic_distance_diagnostics =
    args.computed.semantic_distance_diagnostics.map((diagnostic) => ({
      topic_id: diagnostic.topic_id,
      topic_label: diagnostic.topic_label,
      similarity: diagnostic.similarity,
      raw_similarity: diagnostic.raw_similarity,
      normalized_similarity: diagnostic.normalized_similarity,
      reliability: diagnostic.reliability,
      semantic_role: diagnostic.semantic_role,
      diagnostic_scope: diagnostic.diagnostic_scope,
      spacing_safety: diagnostic.spacing_safety,
      force_weight: diagnostic.force_weight,
      collision_min_distance: diagnostic.collision_min_distance,
      desired_distance: diagnostic.desired_distance,
      actual_distance_after_layout: diagnostic.actual_distance_after_layout,
      distance_error: diagnostic.distance_error,
      normalized_distance_error: diagnostic.normalized_distance_error,
      tolerance: diagnostic.tolerance,
      relationship_fit: diagnostic.relationship_fit,
      interpretation: diagnostic.interpretation,
    }));
  base.near_duplicate_candidates = args.computed.near_duplicate_candidates.map(
    (neighbor) => ({
      topic_id: neighbor.topic_id,
      topic_label: neighbor.topic_label,
      similarity: neighbor.similarity,
      normalized_similarity: neighbor.normalized_similarity,
      force_weight: neighbor.force_weight,
      reliability: neighbor.reliability,
      desired_distance: neighbor.desired_distance,
      actual_distance_after_layout: neighbor.actual_distance_after_layout,
      topic_label_embedding_count: neighbor.topic_label_embedding_count,
      topic_label_embedding_source: neighbor.topic_label_embedding_source,
    }),
  );
  base.force_neighbors = args.computed.force_neighbors.map((neighbor) => ({
    topic_id: neighbor.topic_id,
    topic_label: neighbor.topic_label,
    similarity: neighbor.similarity,
    normalized_similarity: neighbor.normalized_similarity,
    semantic_role: neighbor.semantic_role,
    force_weight: neighbor.force_weight,
    reliability: neighbor.reliability,
    desired_distance: neighbor.desired_distance,
    actual_distance_after_layout: neighbor.actual_distance_after_layout,
    topic_label_embedding_count: neighbor.topic_label_embedding_count,
    topic_label_embedding_source: neighbor.topic_label_embedding_source,
  }));
  base.semantic_neighbors = args.computed.semantic_neighbors.map((neighbor) => ({
    topic_id: neighbor.topic_id,
    topic_label: neighbor.topic_label,
    similarity: neighbor.similarity,
    normalized_similarity: neighbor.normalized_similarity,
    semantic_role: neighbor.semantic_role,
    force_weight: neighbor.force_weight,
    reliability: neighbor.reliability,
    desired_distance: neighbor.desired_distance,
    actual_distance_after_layout: neighbor.actual_distance_after_layout,
    topic_label_embedding_count: neighbor.topic_label_embedding_count,
    topic_label_embedding_source: neighbor.topic_label_embedding_source,
  }));
  base.semantic_enrichment_status = {
    ...existingSemanticStatus,
    status: "centroid_ready",
    needs_embedding_centroid: false,
    should_schedule_enrichment: false,
    layout_status: "semantic_position_ready",
    embedding_skip_reason: null,
    semantic_position_method: args.computed.method,
    semantic_layout_embedding_source: "topic_label_embedding_centroid",
    semantic_layout_resolved_embedding_source: args.topicLabelEmbedding.source,
    semantic_layout_version: SEMANTIC_LAYOUT_VERSION,
  };
  base.layout_status = "semantic_position_ready";
  base.needs_embedding_centroid = false;
  base.should_schedule_enrichment = false;
  base.embedding_skip_reason = null;

  return base;
}

function findPendingLayoutTopics(args: {
  rows: LayoutCandidate[];
  force: boolean;
}) {
  return args.rows.filter(
    (topic) =>
      hasTopicLabelEmbedding(topic) &&
      (args.force ||
        !hasSemanticPosition(topic) ||
        hasStaleLearningSpaceTopicLayout(topic)),
  );
}

function enrichedTopics(rows: LayoutCandidate[]) {
  return rows.filter(hasTopicLabelEmbedding);
}

function buildGlobalLayoutContext(
  rows: LayoutCandidate[],
): GlobalLayoutContext {
  const enriched = enrichedTopics(rows);

  return {
    allTopics: rows,
    enrichedTopics: enriched,
    layoutParameters: getLayoutParameters(enriched.length),
  };
}

function buildAllPairwiseSimilarities(context: GlobalLayoutContext) {
  const similarities: number[] = [];

  for (let outerIndex = 0; outerIndex < context.enrichedTopics.length; outerIndex += 1) {
    const topicA = context.enrichedTopics[outerIndex];
    const embeddingA = resolveTopicLabelEmbedding(topicA).centroid;

    if (!embeddingA) continue;

    for (
      let innerIndex = outerIndex + 1;
      innerIndex < context.enrichedTopics.length;
      innerIndex += 1
    ) {
      const topicB = context.enrichedTopics[innerIndex];
      const embeddingB = resolveTopicLabelEmbedding(topicB).centroid;

      if (!embeddingB) continue;

      similarities.push(cosineSimilarity(embeddingA, embeddingB));
    }
  }

  return similarities;
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams);
  const force = parseBoolean(url.searchParams, "force");

  try {
    const rows = await getLatestTopicState();
    const context = buildGlobalLayoutContext(rows);
    const allPendingLayoutTopics = findPendingLayoutTopics({
      rows,
      force,
    });
    const pendingTopics = allPendingLayoutTopics.slice(0, limit);
    const initialPositions = buildInitialPositions({
      topics: context.enrichedTopics,
    });
    const normalization = buildPairwiseNormalization(
      buildAllPairwiseSimilarities(context),
    );
    const relations = buildPairwiseRelations({
      context,
      normalization,
    });
    const relationsByTopic = buildRelationsByTopic(relations);
    const relationsByKey = new Map(
      relations.map((relation) => [relation.key, relation] as const),
    );
    const stressPositions = applyPairwiseStressLayout({
      context,
      relations,
      initialPositions,
    });
    const rankCorrectedPositions = applyRankPreservingCorrection({
      context,
      relations,
      positions: stressPositions,
    });
    const spacingResult = enforceGlobalReadableSpacing({
      context,
      relations,
      positions: rankCorrectedPositions,
    });
    const positions = spacingResult.positions;
    const layoutQuality = buildContinuousLayoutQuality({
      relations,
      positions,
      context,
    });

    const globalLayoutSummary: JsonObject = {
      version: SEMANTIC_LAYOUT_VERSION,
      force,
      enriched_topic_count: context.enrichedTopics.length,
      total_topics_seen: rows.length,
      layout_parameters: context.layoutParameters,
      normalization,
      layout_quality: layoutQuality,
      strategy:
        "Compute a mostly planar semantic solar-system map by fitting all enriched topic pairs to a continuous embedding-derived desired-distance matrix. Higher cosine similarity continuously maps to shorter desired distance; lower similarity continuously maps to longer desired distance. A second continuous rank-preserving pass reduces cases where weaker pairs end up closer than stronger pairs.",
      cluster_policy:
        "Clusters are not assigned by this route. Emergent regions should be inferred later from stable geometry and pairwise diagnostics.",
      movement_policy:
        "This route writes semantic_position only. commit-pending then makes topic_position truthful immediately; SpaceCanvas animates the visual migration.",
      spacing_policy:
        "Readable spacing is enforced after the continuous pairwise stress pass. Collision spacing is secondary to semantic distance but still prevents unreadable overlap.",
      distance_diagnostic_policy:
        "All pair similarities are continuous. Diagnostic labels such as weak/strong/visible_context are retained only for human debugging and do not create layout buckets.",
    };

    const computedByTopic = buildComputedSemanticPositions({
      context,
      positions,
      initialPositions,
      relationsByTopic,
      relationsByKey,
      spacingCorrectedCount: spacingResult.correctedCount,
      spacingCorrectionVector: spacingResult.correctionVector,
    });

    const results = [];
    const processedPositions = new Map<string, TopicPosition>();

    for (const [index, topic] of pendingTopics.entries()) {
      const topicLabel = getTopicLabel(topic);
      const topicLabelEmbedding = resolveTopicLabelEmbedding(topic);
      const hadStaleLearningSpaceTopicLayout =
        hasStaleLearningSpaceTopicLayout(topic);
      const computed = computedByTopic.get(topic.topic_id);

      if (!computed) continue;

      processedPositions.set(topic.topic_id, computed.position);

      const updatedAt = nowIso();
      const topicJson = mergeSemanticLayoutIntoTopicJson({
        topic,
        computed,
        updatedAt,
        topicLabelEmbedding,
        globalLayoutSummary,
        normalization,
        layoutQuality,
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
        stale_learning_space_topic_layout_refreshed:
          hadStaleLearningSpaceTopicLayout,
        committed_visual_position: getVisualPosition(topic, index),
        estimated_render_radius: round4(estimateTopicRenderRadius(topic)),
        estimated_collision_radius: round4(estimateTopicCollisionRadius(topic)),
        estimated_visual_radius: round4(estimateTopicVisualRadius(topic)),
        semantic_position: computed.position,
        semantic_pull_position: computed.semantic_pull_position,
        pre_repulsion_position: computed.pre_repulsion_position,
        semantic_position_method: computed.method,
        semantic_layout_version: SEMANTIC_LAYOUT_VERSION,
        semantic_layout_embedding_source: "topic_label_embedding_centroid",
        resolved_embedding_source: topicLabelEmbedding.source,
        topic_label_embedding_count: topicLabelEmbedding.count,
        reason: computed.reason,
        final_spacing_enforcement_applied:
          computed.final_spacing_enforcement_applied,
        final_spacing_enforcement_vector:
          computed.final_spacing_enforcement_vector,
        final_spacing_enforcement_count:
          computed.final_spacing_enforcement_count,
        near_duplicate_candidates: computed.near_duplicate_candidates.map(
          (neighbor) => ({
            topic_id: neighbor.topic_id,
            topic_label: neighbor.topic_label,
            similarity: neighbor.similarity,
            normalized_similarity: neighbor.normalized_similarity,
            force_weight: neighbor.force_weight,
            reliability: neighbor.reliability,
            desired_distance: neighbor.desired_distance,
            actual_distance_after_layout: neighbor.actual_distance_after_layout,
          }),
        ),
        layout_decision: {
          emergent_region_signal:
            computed.layout_decision.emergent_region_signal,
          total_attraction_weight:
            computed.layout_decision.total_attraction_weight,
          semantic_pull_alpha: computed.layout_decision.semantic_pull_alpha,
          top_similarity: computed.layout_decision.top_similarity,
          second_similarity: computed.layout_decision.second_similarity,
          top_second_margin: computed.layout_decision.top_second_margin,
          repulsion_applied: computed.repulsion_applied,
          repulsion_vector: computed.repulsion_vector,
          layout_parameters: computed.layout_decision.layout_parameters,
        },
        force_neighbors: computed.force_neighbors.map((neighbor) => ({
          topic_id: neighbor.topic_id,
          topic_label: neighbor.topic_label,
          similarity: neighbor.similarity,
          normalized_similarity: neighbor.normalized_similarity,
          semantic_role: neighbor.semantic_role,
          force_weight: neighbor.force_weight,
          reliability: neighbor.reliability,
          desired_distance: neighbor.desired_distance,
          actual_distance_after_layout: neighbor.actual_distance_after_layout,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
          visual_anchor_position: neighbor.position,
        })),
        semantic_neighbors: computed.semantic_neighbors.map((neighbor) => ({
          topic_id: neighbor.topic_id,
          topic_label: neighbor.topic_label,
          similarity: neighbor.similarity,
          normalized_similarity: neighbor.normalized_similarity,
          semantic_role: neighbor.semantic_role,
          force_weight: neighbor.force_weight,
          reliability: neighbor.reliability,
          desired_distance: neighbor.desired_distance,
          actual_distance_after_layout: neighbor.actual_distance_after_layout,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
          visual_anchor_position: neighbor.position,
        })),
        semantic_distance_diagnostics:
          computed.semantic_distance_diagnostics.map((diagnostic) => ({
            topic_id: diagnostic.topic_id,
            topic_label: diagnostic.topic_label,
            similarity: diagnostic.similarity,
            raw_similarity: diagnostic.raw_similarity,
            normalized_similarity: diagnostic.normalized_similarity,
            reliability: diagnostic.reliability,
            semantic_role: diagnostic.semantic_role,
            diagnostic_scope: diagnostic.diagnostic_scope,
            spacing_safety: diagnostic.spacing_safety,
            force_weight: diagnostic.force_weight,
            collision_min_distance: diagnostic.collision_min_distance,
            desired_distance: diagnostic.desired_distance,
            actual_distance_after_layout:
              diagnostic.actual_distance_after_layout,
            distance_error: diagnostic.distance_error,
            normalized_distance_error: diagnostic.normalized_distance_error,
            tolerance: diagnostic.tolerance,
            relationship_fit: diagnostic.relationship_fit,
            interpretation: diagnostic.interpretation,
          })),
      });
    }

    const global_pairwise_distance_diagnostics = buildGlobalPairwiseDiagnostics(
      {
        context,
        relations,
        positions,
      },
    );

    return NextResponse.json({
      ok: true,
      route: "POST /api/semantic-layout/recompute-pending",
      duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      limit,
      force,
      total_topics_seen: rows.length,
      topic_label_enriched_topic_count: context.enrichedTopics.length,
      pending_layout_topics_found: allPendingLayoutTopics.length,
      processed_count: pendingTopics.length,
      updated_count: results.length,
      semantic_layout_version: SEMANTIC_LAYOUT_VERSION,
      global_layout_summary: globalLayoutSummary,
      global_pairwise_distance_diagnostics,
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
