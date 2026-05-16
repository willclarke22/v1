// app/api/semantic-layout/recompute-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
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
  | "strong_attractor"
  | "moderate_attractor"
  | "weak_attractor"
  | "visible_context";

type SemanticNeighbor = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  raw_similarity: number;
  reliability: number;

  /**
   * Continuous force weight.
   *
   * This is not a cluster assignment. It is only the strength of semantic pull
   * this neighbor applies to the target topic's semantic_position.
   */
  force_weight: number;

  /**
   * Neighbor anchor position.
   *
   * This should be the neighbor's current committed visual position whenever
   * possible, not the neighbor's semantic target position.
   */
  position: TopicPosition;

  semantic_role: SemanticNeighborRole;
  topic_label_embedding_count: number;
  topic_label_embedding_source: ResolvedTopicLabelEmbedding["source"];
};

type LayoutParameters = {
  enriched_topic_count: number;

  /**
   * Diagnostic thresholds only. These label force roles; they do not decide
   * whether a topic is "clustered."
   */
  strong_attraction_similarity: number;
  moderate_attraction_similarity: number;
  weak_attraction_similarity: number;
  visible_context_similarity: number;

  /**
   * Geometry controls.
   */
  min_repulsion_distance: number;
  max_semantic_pull_alpha: number;
  min_semantic_pull_alpha: number;
  stability_anchor_strength: number;

  /**
   * Diagnostic/output threshold only.
   * The layout math can still use smaller nonzero force weights.
   */
  min_display_force_weight: number;
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
  reason: string;
  layout_decision: SemanticLayoutDecision;
  repulsion_applied: boolean;
  repulsion_vector: TopicPosition;
};

type GlobalLayoutContext = {
  allTopics: LayoutCandidate[];
  enrichedTopics: LayoutCandidate[];
  layoutParameters: LayoutParameters;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TOP_K_NEIGHBORS = 10;
const NEIGHBOR_OFFSET_RADIUS = 0.72;
const FALLBACK_OFFSET_RADIUS = 0.38;
const OUTER_RING_RADIUS = 5.5;

const SEMANTIC_LAYOUT_VERSION = "semantic_continuous_force_v5";

/**
 * Human/debug-facing cutoff.
 *
 * Values below this may still contribute to the continuous semantic force math,
 * but they are too small to explain meaningful movement in force_neighbors.
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

  if (!length) {
    return [radius, base[1], 0];
  }

  const scale = radius / length;

  return [base[0] * scale, base[1], base[2] * scale];
}

/**
 * Resolve the current visual anchor for layout calculations.
 *
 * Important invariant:
 * - topic_position = current committed visual position
 * - semantic_position = computed semantic target
 *
 * Therefore this function intentionally prefers topic_position and topic_json
 * visual position before falling back to semantic_position.
 */
function getVisualPosition(
  topic: LayoutCandidate,
  fallbackIndex: number,
): TopicPosition {
  const topicPosition = asTopicPosition(topic.topic_position);

  if (topicPosition) {
    return topicPosition;
  }

  const jsonTopicPosition = readTopicPositionFromJson(topic.topic_json);

  if (jsonTopicPosition) {
    return jsonTopicPosition;
  }

  const semanticPosition = asTopicPosition(topic.semantic_position);

  if (semanticPosition) {
    return semanticPosition;
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
  if (enrichedTopicCount < 8) {
    return {
      enriched_topic_count: enrichedTopicCount,
      strong_attraction_similarity: 0.6,
      moderate_attraction_similarity: 0.42,
      weak_attraction_similarity: 0.18,
      visible_context_similarity: 0,
      min_repulsion_distance: 1.55,
      max_semantic_pull_alpha: 0.58,
      min_semantic_pull_alpha: 0.14,
      stability_anchor_strength: 0.62,
      min_display_force_weight: MIN_DISPLAY_FORCE_WEIGHT,
    };
  }

  if (enrichedTopicCount < 30) {
    return {
      enriched_topic_count: enrichedTopicCount,
      strong_attraction_similarity: 0.56,
      moderate_attraction_similarity: 0.38,
      weak_attraction_similarity: 0.16,
      visible_context_similarity: 0,
      min_repulsion_distance: 1.45,
      max_semantic_pull_alpha: 0.62,
      min_semantic_pull_alpha: 0.12,
      stability_anchor_strength: 0.58,
      min_display_force_weight: MIN_DISPLAY_FORCE_WEIGHT,
    };
  }

  return {
    enriched_topic_count: enrichedTopicCount,
    strong_attraction_similarity: 0.52,
    moderate_attraction_similarity: 0.34,
    weak_attraction_similarity: 0.14,
    visible_context_similarity: 0,
    min_repulsion_distance: 1.35,
    max_semantic_pull_alpha: 0.66,
    min_semantic_pull_alpha: 0.1,
    stability_anchor_strength: 0.54,
    min_display_force_weight: MIN_DISPLAY_FORCE_WEIGHT,
  };
}

function classifyNeighbor(args: {
  similarity: number;
  parameters: LayoutParameters;
}): SemanticNeighborRole {
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

function semanticForceWeight(args: {
  similarity: number;
  reliability: number;
  parameters: LayoutParameters;
}) {
  if (args.similarity < args.parameters.weak_attraction_similarity) {
    return 0;
  }

  const normalized = clamp(
    (args.similarity - args.parameters.weak_attraction_similarity) /
      Math.max(0.001, 1 - args.parameters.weak_attraction_similarity),
    0,
    1,
  );

  /**
   * Squared curve:
   * - weak relationships create very small pull
   * - medium relationships matter
   * - strong relationships dominate without hard gating
   */
  return normalized * normalized * args.reliability;
}

function stableHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function deterministicOffset(
  topicId: string,
  radius = NEIGHBOR_OFFSET_RADIUS,
): TopicPosition {
  const hash = stableHash(topicId);
  const angle = ((hash % 3600) / 3600) * Math.PI * 2;
  const elevationSeed = ((Math.floor(hash / 3600) % 1000) / 1000) * 2 - 1;
  const y = elevationSeed * 0.42;

  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
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

function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerpPosition(a: TopicPosition, b: TopicPosition, alpha: number) {
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ] satisfies TopicPosition;
}

function weightedAveragePosition(
  neighbors: SemanticNeighbor[],
): TopicPosition | null {
  const forceNeighbors = neighbors.filter((neighbor) => neighbor.force_weight > 0);

  if (!forceNeighbors.length) return null;

  let totalWeight = 0;
  let x = 0;
  let y = 0;
  let z = 0;

  for (const neighbor of forceNeighbors) {
    totalWeight += neighbor.force_weight;
    x += neighbor.position[0] * neighbor.force_weight;
    y += neighbor.position[1] * neighbor.force_weight;
    z += neighbor.position[2] * neighbor.force_weight;
  }

  if (!totalWeight) return null;

  return [x / totalWeight, y / totalWeight, z / totalWeight];
}

function enrichedTopics(rows: LayoutCandidate[]) {
  return rows.filter(hasTopicLabelEmbedding);
}

function findSemanticNeighbors(args: {
  targetTopic: LayoutCandidate;
  context: GlobalLayoutContext;
}) {
  const targetTopicLabelEmbedding = resolveTopicLabelEmbedding(args.targetTopic);
  const targetCentroid = targetTopicLabelEmbedding.centroid;

  if (!targetCentroid) return [];

  return args.context.enrichedTopics
    .filter((candidate) => candidate.topic_id !== args.targetTopic.topic_id)
    .map((candidate, index): SemanticNeighbor | null => {
      const candidateTopicLabelEmbedding =
        resolveTopicLabelEmbedding(candidate);
      const candidateCentroid = candidateTopicLabelEmbedding.centroid;

      if (!candidateCentroid) return null;

      const similarity = cosineSimilarity(targetCentroid, candidateCentroid);

      if (similarity < args.context.layoutParameters.visible_context_similarity) {
        return null;
      }

      const reliability = centroidReliability(candidateTopicLabelEmbedding.count);
      const semanticRole = classifyNeighbor({
        similarity,
        parameters: args.context.layoutParameters,
      });

      return {
        topic_id: candidate.topic_id,
        topic_label: getTopicLabel(candidate),
        similarity: round4(similarity),
        raw_similarity: similarity,
        reliability,
        force_weight: round4(
          semanticForceWeight({
            similarity,
            reliability,
            parameters: args.context.layoutParameters,
          }),
        ),
        position: getVisualPosition(candidate, index),
        semantic_role: semanticRole,
        topic_label_embedding_count: candidateTopicLabelEmbedding.count,
        topic_label_embedding_source: candidateTopicLabelEmbedding.source,
      };
    })
    .filter((match): match is SemanticNeighbor => Boolean(match))
    .sort((a, b) => {
      if (b.force_weight !== a.force_weight) {
        return b.force_weight - a.force_weight;
      }

      return b.raw_similarity - a.raw_similarity;
    })
    .slice(0, TOP_K_NEIGHBORS);
}

function decideSemanticLayout(args: {
  semanticNeighbors: SemanticNeighbor[];
  parameters: LayoutParameters;
}): SemanticLayoutDecision {
  /**
   * allForceNeighbors = mathematical force contributors.
   * displayForceNeighbors = human/debug-facing explanation list.
   *
   * This preserves tiny continuous pulls in the geometry while preventing
   * near-zero/noisy relationships from looking important in the output.
   */
  const allForceNeighbors = args.semanticNeighbors.filter(
    (neighbor) => neighbor.force_weight > 0,
  );

  const displayForceNeighbors = allForceNeighbors.filter(
    (neighbor) => neighbor.force_weight >= args.parameters.min_display_force_weight,
  );

  const [topNeighbor, secondNeighbor] = args.semanticNeighbors;
  const topSimilarity = topNeighbor?.raw_similarity ?? null;
  const secondSimilarity = secondNeighbor?.raw_similarity ?? null;

  const topSecondMargin =
    topSimilarity !== null && secondSimilarity !== null
      ? topSimilarity - secondSimilarity
      : null;

  const totalAttractionWeight = allForceNeighbors.reduce(
    (sum, neighbor) => sum + neighbor.force_weight,
    0,
  );

  const strongestWeight = allForceNeighbors[0]?.force_weight ?? 0;

  /**
   * This is a continuous "region signal," not a cluster assignment.
   * It estimates how likely this topic is part of an emergent dense semantic area.
   */
  const emergentRegionSignal = clamp(
    totalAttractionWeight * 1.8 + strongestWeight * 0.8,
    0,
    1,
  );

  const semanticPullAlpha =
    allForceNeighbors.length > 0
      ? clamp(
          args.parameters.min_semantic_pull_alpha +
            emergentRegionSignal *
              (args.parameters.max_semantic_pull_alpha -
                args.parameters.min_semantic_pull_alpha),
          args.parameters.min_semantic_pull_alpha,
          args.parameters.max_semantic_pull_alpha,
        )
      : 0;

  const method =
    allForceNeighbors.length > 0
      ? "semantic_continuous_force_v5_topic_label_embedding"
      : "semantic_continuous_force_v5_stable_fallback";

  const reason =
    allForceNeighbors.length > 0
      ? "Computed semantic target from continuous attraction forces. Similar topics pull more strongly, weak topics pull lightly, and clusters are left to emerge from geometry."
      : "No neighbor passed the weak attraction floor, so the topic kept a stable fallback semantic target near its current visual position.";

  return {
    method,
    reason,
    semantic_neighbors: args.semanticNeighbors,

    /**
     * Output/debug list only. The math still uses all nonzero force neighbors
     * through semantic_neighbors when computing weighted position.
     */
    force_neighbors: displayForceNeighbors,

    layout_parameters: args.parameters,
    top_similarity: topSimilarity === null ? null : round4(topSimilarity),
    second_similarity:
      secondSimilarity === null ? null : round4(secondSimilarity),
    top_second_margin:
      topSecondMargin === null ? null : round4(topSecondMargin),
    total_attraction_weight: round4(totalAttractionWeight),
    semantic_pull_alpha: round4(semanticPullAlpha),
    emergent_region_signal: round4(emergentRegionSignal),
  };
}
function applyRepulsion(args: {
  topic: LayoutCandidate;
  proposedPosition: TopicPosition;
  context: GlobalLayoutContext;
  semanticNeighbors: SemanticNeighbor[];
}) {
  let repulsion: TopicPosition = [0, 0, 0];
  let applied = false;

  const neighborSimilarityById = new Map(
    args.semanticNeighbors.map((neighbor) => [
      neighbor.topic_id,
      neighbor.raw_similarity,
    ]),
  );

  for (const [index, other] of args.context.allTopics.entries()) {
    if (other.topic_id === args.topic.topic_id) continue;

    const otherPosition = getVisualPosition(other, index);
    const distance = distanceBetween(args.proposedPosition, otherPosition);
    const minDistance = args.context.layoutParameters.min_repulsion_distance;

    if (distance <= 0 || distance >= minDistance) continue;

    const similarity = neighborSimilarityById.get(other.topic_id) ?? 0;

    /**
     * Similar topics should not repel much; unrelated close topics should repel.
     */
    const semanticDampening = clamp(1 - Math.max(0, similarity), 0.08, 1);
    const away = subtractPositions(args.proposedPosition, otherPosition);
    const strength =
      ((minDistance - distance) / minDistance) * 0.42 * semanticDampening;
    const normalizedAway = scalePosition(away, 1 / Math.max(distance, 0.001));

    repulsion = addPositions(repulsion, scalePosition(normalizedAway, strength));
    applied = true;
  }

  if (!applied) {
    return {
      position: args.proposedPosition,
      repulsionVector: [0, 0, 0] satisfies TopicPosition,
      applied: false,
    };
  }

  return {
    position: addPositions(args.proposedPosition, repulsion),
    repulsionVector: repulsion,
    applied: true,
  };
}

function computeSemanticPosition(args: {
  targetTopic: LayoutCandidate;
  context: GlobalLayoutContext;
  fallbackIndex: number;
}): ComputedSemanticPosition {
  const semanticNeighbors = findSemanticNeighbors({
    targetTopic: args.targetTopic,
    context: args.context,
  });

  const decision = decideSemanticLayout({
    semanticNeighbors,
    parameters: args.context.layoutParameters,
  });

  const currentVisualPosition = getVisualPosition(
    args.targetTopic,
    args.fallbackIndex,
  );

  const forceAverage = weightedAveragePosition(
    decision.semantic_neighbors.filter((neighbor) => neighbor.force_weight > 0),
  );

  let semanticPullPosition: TopicPosition;
  let preRepulsionPosition: TopicPosition;

  if (forceAverage) {
    const neighborTarget = addPositions(
      forceAverage,
      deterministicOffset(args.targetTopic.topic_id, NEIGHBOR_OFFSET_RADIUS),
    );

    semanticPullPosition = roundPosition(neighborTarget);

    /**
     * Stability guard:
     * semantic_position can move toward meaning, but the visual map should not
     * teleport. topic_position still remains unchanged here.
     */
    preRepulsionPosition = lerpPosition(
      currentVisualPosition,
      neighborTarget,
      decision.semantic_pull_alpha,
    );
  } else {
    semanticPullPosition = addPositions(
      currentVisualPosition,
      deterministicOffset(args.targetTopic.topic_id, FALLBACK_OFFSET_RADIUS),
    );

    preRepulsionPosition = semanticPullPosition;
  }

  const repelled = applyRepulsion({
    topic: args.targetTopic,
    proposedPosition: preRepulsionPosition,
    context: args.context,
    semanticNeighbors,
  });

  return {
    position: roundPosition(repelled.position),
    semantic_pull_position: roundPosition(semanticPullPosition),
    pre_repulsion_position: roundPosition(preRepulsionPosition),
    method: decision.method,
    semantic_neighbors: decision.semantic_neighbors,
    force_neighbors: decision.force_neighbors,
    reason: decision.reason,
    layout_decision: decision,
    repulsion_applied: repelled.applied,
    repulsion_vector: roundPosition(repelled.repulsionVector),
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

function getJsonObjectChild(object: JsonObject, key: string): JsonObject | null {
  const child = object[key];

  if (child && typeof child === "object" && !Array.isArray(child)) {
    return child as JsonObject;
  }

  return null;
}

function buildLearningSpaceTopicSnapshot(args: {
  base: JsonObject;
  topic: LayoutCandidate;
  computed: ComputedSemanticPosition;
  updatedAt: string;
}) {
  const existingLearningSpaceTopic =
    getJsonObjectChild(args.base, "learning_space_topic") ?? {};

  const existingLayout =
    getJsonObjectChild(existingLearningSpaceTopic, "layout") ?? {};

  const currentPosition =
    asTopicPosition(existingLearningSpaceTopic.position) ??
    getVisualPosition(args.topic, 0);

  const renderState =
    getJsonObjectChild(existingLearningSpaceTopic, "render_state") ?? null;

  const satellites = Array.isArray(existingLearningSpaceTopic.satellites)
    ? existingLearningSpaceTopic.satellites
    : [];

  return {
    ...existingLearningSpaceTopic,
    topic_id: args.topic.topic_id,
    topic_label: getTopicLabel(args.topic),
    position: currentPosition,
    layout: {
      ...existingLayout,
      position_source:
        typeof existingLayout.position_source === "string"
          ? existingLayout.position_source
          : args.topic.topic_position
            ? "topic_position"
            : "topic_json",
      semantic_position: args.computed.position,
      semantic_position_method: args.computed.method,
      semantic_position_updated_at: args.updatedAt,
    },
    ...(renderState ? { render_state: renderState } : {}),
    satellite_count:
      typeof existingLearningSpaceTopic.satellite_count === "number"
        ? existingLearningSpaceTopic.satellite_count
        : satellites.length,
    satellites,
  } satisfies JsonObject;
}

function hasStaleLearningSpaceTopicLayout(topic: LayoutCandidate) {
  if (!hasSemanticPosition(topic)) {
    return false;
  }

  const base = topicJsonObject(topic);
  const learningSpaceTopic = getJsonObjectChild(base, "learning_space_topic");

  if (!learningSpaceTopic) {
    return false;
  }

  const layout = getJsonObjectChild(learningSpaceTopic, "layout");

  if (!layout) {
    return true;
  }

  const layoutSemanticPosition = asTopicPosition(layout.semantic_position);
  const layoutMethod =
    typeof layout.semantic_position_method === "string"
      ? layout.semantic_position_method
      : null;
  const layoutUpdatedAt =
    typeof layout.semantic_position_updated_at === "string"
      ? layout.semantic_position_updated_at
      : null;

  if (!layoutSemanticPosition) return true;
  if (!layoutMethod) return true;
  if (!layoutUpdatedAt) return true;

  return false;
}

function mergeSemanticLayoutIntoTopicJson(args: {
  topic: LayoutCandidate;
  computed: ComputedSemanticPosition;
  updatedAt: string;
  topicLabelEmbedding: ResolvedTopicLabelEmbedding;
  globalLayoutSummary: JsonObject;
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
    learning_space_topic: buildLearningSpaceTopicSnapshot({
      base,
      topic: args.topic,
      computed: args.computed,
      updatedAt: args.updatedAt,
    }),
    semantic_neighbors: args.computed.semantic_neighbors.map((neighbor) => ({
      topic_id: neighbor.topic_id,
      topic_label: neighbor.topic_label,
      similarity: neighbor.similarity,
      semantic_role: neighbor.semantic_role,
      force_weight: neighbor.force_weight,
      reliability: neighbor.reliability,
      topic_label_embedding_count: neighbor.topic_label_embedding_count,
      topic_label_embedding_source: neighbor.topic_label_embedding_source,
    })),
    semantic_layout: {
      version: SEMANTIC_LAYOUT_VERSION,
      method: args.computed.method,
      embedding_source: "topic_label_embedding_centroid",
      resolved_embedding_source: args.topicLabelEmbedding.source,
      updated_at: args.updatedAt,
      reason: args.computed.reason,
      global_layout_summary: args.globalLayoutSummary,
      layout_decision: {
        emergent_region_signal:
          args.computed.layout_decision.emergent_region_signal,
        total_attraction_weight:
          args.computed.layout_decision.total_attraction_weight,
        semantic_pull_alpha: args.computed.layout_decision.semantic_pull_alpha,
        top_similarity: args.computed.layout_decision.top_similarity,
        second_similarity: args.computed.layout_decision.second_similarity,
        top_second_margin: args.computed.layout_decision.top_second_margin,
        layout_parameters: args.computed.layout_decision.layout_parameters,
        repulsion_applied: args.computed.repulsion_applied,
        repulsion_vector: args.computed.repulsion_vector,
        semantic_pull_position: args.computed.semantic_pull_position,
        pre_repulsion_position: args.computed.pre_repulsion_position,
      },
      force_neighbors: args.computed.force_neighbors.map((neighbor) => ({
        topic_id: neighbor.topic_id,
        topic_label: neighbor.topic_label,
        similarity: neighbor.similarity,
        semantic_role: neighbor.semantic_role,
        force_weight: neighbor.force_weight,
        reliability: neighbor.reliability,
        topic_label_embedding_count: neighbor.topic_label_embedding_count,
        topic_label_embedding_source: neighbor.topic_label_embedding_source,
      })),
      semantic_neighbors: args.computed.semantic_neighbors.map((neighbor) => ({
        topic_id: neighbor.topic_id,
        topic_label: neighbor.topic_label,
        similarity: neighbor.similarity,
        semantic_role: neighbor.semantic_role,
        force_weight: neighbor.force_weight,
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
      semantic_layout_version: SEMANTIC_LAYOUT_VERSION,
    },
    layout_status: "semantic_position_ready",
    needs_embedding_centroid: false,
    should_schedule_enrichment: false,
    embedding_skip_reason: null,
  } satisfies JsonObject;
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

function buildGlobalLayoutContext(rows: LayoutCandidate[]): GlobalLayoutContext {
  const enriched = enrichedTopics(rows);

  return {
    allTopics: rows,
    enrichedTopics: enriched,
    layoutParameters: getLayoutParameters(enriched.length),
  };
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

    const globalLayoutSummary: JsonObject = {
      version: SEMANTIC_LAYOUT_VERSION,
      force,
      enriched_topic_count: context.enrichedTopics.length,
      total_topics_seen: rows.length,
      layout_parameters: context.layoutParameters,
      strategy:
        "Compute semantic target positions with continuous attraction forces from topic_label embeddings. Similar topics pull more strongly, weakly related topics pull lightly, unrelated topics mainly provide context/repulsion, and clusters are discovered later from geometry rather than assigned here.",
      cluster_policy:
        "Clusters are not assigned by this route. Emergent regions are inferred later from stable semantic geometry.",
      movement_policy:
        "This route writes semantic_position only. It does not mutate committed topic_position.",
    };

    const results = [];

    for (const [index, topic] of pendingTopics.entries()) {
      const topicLabel = getTopicLabel(topic);
      const topicLabelEmbedding = resolveTopicLabelEmbedding(topic);
      const hadStaleLearningSpaceTopicLayout =
        hasStaleLearningSpaceTopicLayout(topic);

      const computed = computeSemanticPosition({
        targetTopic: topic,
        context,
        fallbackIndex: index,
      });

      const updatedAt = nowIso();
      const topicJson = mergeSemanticLayoutIntoTopicJson({
        topic,
        computed,
        updatedAt,
        topicLabelEmbedding,
        globalLayoutSummary,
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

        /**
         * Intentionally do not pass topicPosition here.
         *
         * This route computes semantic target positions. It should not mutate
         * committed visual positions until we add an explicit commit/ease step.
         */

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
        semantic_position: computed.position,
        semantic_pull_position: computed.semantic_pull_position,
        pre_repulsion_position: computed.pre_repulsion_position,
        semantic_position_method: computed.method,
        semantic_layout_version: SEMANTIC_LAYOUT_VERSION,
        semantic_layout_embedding_source: "topic_label_embedding_centroid",
        resolved_embedding_source: topicLabelEmbedding.source,
        topic_label_embedding_count: topicLabelEmbedding.count,
        reason: computed.reason,
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
          semantic_role: neighbor.semantic_role,
          force_weight: neighbor.force_weight,
          reliability: neighbor.reliability,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
          visual_anchor_position: neighbor.position,
        })),
        semantic_neighbors: computed.semantic_neighbors.map((neighbor) => ({
          topic_id: neighbor.topic_id,
          topic_label: neighbor.topic_label,
          similarity: neighbor.similarity,
          semantic_role: neighbor.semantic_role,
          force_weight: neighbor.force_weight,
          reliability: neighbor.reliability,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
          visual_anchor_position: neighbor.position,
        })),
      });
    }

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
