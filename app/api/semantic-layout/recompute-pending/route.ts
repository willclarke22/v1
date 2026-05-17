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

type SemanticDistanceRelationshipFit =
  | "context_only"
  | "too_close"
  | "close_to_expected"
  | "too_far";

type SemanticDistanceDiagnostic = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  raw_similarity: number;
  reliability: number;
  force_weight: number;
  semantic_role: SemanticNeighborRole;
  diagnostic_scope: "force_neighbor" | "near_duplicate" | "context_only";
  spacing_safety: "collision_safe" | "collision_violation";

  /**
   * Minimum physically readable center-to-center distance after accounting for
   * estimated visual/collision radii and breathing room.
   */
  collision_min_distance: number;

  /**
   * Human/debug-facing target distance implied by similarity.
   * This is diagnostic only for now; the force layout still controls position.
   */
  desired_distance: number;

  /**
   * Distance from this topic's newly computed semantic_position to the
   * neighbor's current committed visual anchor.
   */
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
   * Diagnostic thresholds only. These label force roles; they do not decide
   * whether a topic is "clustered."
   */
  strong_attraction_similarity: number;
  moderate_attraction_similarity: number;
  weak_attraction_similarity: number;
  visible_context_similarity: number;
  near_duplicate_similarity: number;

  /**
   * Geometry controls.
   *
   * min_repulsion_distance is now only a coarse floor. Actual separation is
   * radius-aware: target_visual_radius + neighbor_visual_radius + breathing room.
   */
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

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TOP_K_NEIGHBORS = 10;

/**
 * These radii are intentionally larger than the earlier layout.
 * Semantic similarity should create regions, but topics should not visually
 * overlap just because they are moderately related.
 */
const NEIGHBOR_OFFSET_RADIUS = 1.45;
const FALLBACK_OFFSET_RADIUS = 1.05;
const OUTER_RING_RADIUS = 9.25;

/**
 * Keep this approximately aligned with lib/build-learning-space.ts.
 * The layout route cannot import the renderer builder without creating an
 * awkward dependency, so it carries a lightweight visual-radius estimate.
 */
const DEFAULT_RENDER_BASE_SCALE = 0.7;
const RENDER_BASE_SCALE_FACTOR = 0.9;
const RENDER_LEARNING_SCORE_RADIUS_FACTOR = 1.0;
const CONFUSION_SHAPE_EXPANSION_MAX = 0.18;
const FUTURE_BADGE_AND_SATELLITE_BUFFER = 0.18;
const MAX_CANONICAL_Y_MAGNITUDE = 1.25;

const SEMANTIC_LAYOUT_VERSION =
  "semantic_solar_plane_v9_spacing_truth_diagnostics";

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
  const messageCount =
    typeof topic.topic_json === "object" && topic.topic_json !== null ? 0 : 0;

  /**
   * Mirrors lib/build-learning-space.ts at the contract level:
   * visible radius is not enough for layout. Confusion/blobiness, rings, badges,
   * and future satellites need a slightly larger envelope.
   */
  const renderRadius = estimateTopicRenderRadius(topic);
  const shapeExpansion = 1 + confusion * CONFUSION_SHAPE_EXPANSION_MAX;
  const satelliteBuffer = Math.min(0.18, Math.max(0, messageCount) * 0.018);

  return clamp(
    renderRadius * shapeExpansion +
      FUTURE_BADGE_AND_SATELLITE_BUFFER +
      satelliteBuffer,
    renderRadius + 0.16,
    2.05,
  );
}

function estimateTopicVisualRadius(topic: LayoutCandidate) {
  return estimateTopicCollisionRadius(topic);
}

function semanticBreathingRoomFactor(similarity: number) {
  /**
   * Similar topics may sit closer than unrelated topics, but not overlap.
   * High similarity reduces only the extra breathing room, not the physical
   * collision radius of either sphere.
   */
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
  if (enrichedTopicCount < 8) {
    return {
      enriched_topic_count: enrichedTopicCount,
      strong_attraction_similarity: 0.6,
      moderate_attraction_similarity: 0.42,
      weak_attraction_similarity: 0.18,
      visible_context_similarity: 0,
      near_duplicate_similarity: 0.72,
      min_repulsion_distance: 3.05,
      min_visual_breathing_room: 1.05,
      max_visual_collision_radius: 2.05,
      repulsion_strength: 1.12,
      repulsion_iterations: 4,
      max_planar_y_magnitude: MAX_CANONICAL_Y_MAGNITUDE,
      y_axis_dampening: 0.22,
      max_semantic_pull_alpha: 0.5,
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
      near_duplicate_similarity: 0.72,
      min_repulsion_distance: 3.15,
      min_visual_breathing_room: 1.15,
      max_visual_collision_radius: 2.05,
      repulsion_strength: 1.18,
      repulsion_iterations: 4,
      max_planar_y_magnitude: MAX_CANONICAL_Y_MAGNITUDE,
      y_axis_dampening: 0.22,
      max_semantic_pull_alpha: 0.52,
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
    near_duplicate_similarity: 0.72,
    min_repulsion_distance: 2.95,
    min_visual_breathing_room: 0.95,
    max_visual_collision_radius: 2.0,
    repulsion_strength: 1.02,
    repulsion_iterations: 3,
    max_planar_y_magnitude: MAX_CANONICAL_Y_MAGNITUDE,
    y_axis_dampening: 0.2,
    max_semantic_pull_alpha: 0.54,
    min_semantic_pull_alpha: 0.1,
    stability_anchor_strength: 0.54,
    min_display_force_weight: MIN_DISPLAY_FORCE_WEIGHT,
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
  const y = elevationSeed * 0.18;

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

function planarizeDirection(
  direction: TopicPosition,
  parameters: LayoutParameters,
): TopicPosition {
  return [
    direction[0],
    direction[1] * parameters.y_axis_dampening,
    direction[2],
  ];
}

function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function desiredDistanceForSimilarity(args: {
  similarity: number;
  collisionMinDistance: number;
  parameters: LayoutParameters;
}) {
  /**
   * This is a diagnostic distance policy, not yet a hard layout constraint.
   *
   * The purpose is to make the invisible semantic-distance rule inspectable:
   * - high similarity should imply a distance close to the collision-safe floor
   * - medium similarity should imply a middle distance
   * - low/negative similarity should imply a farther contextual distance
   */
  const similarity01 = clamp(Math.max(0, args.similarity), 0, 1);
  const farDistance = Math.max(
    args.collisionMinDistance + 0.75,
    OUTER_RING_RADIUS * 0.86,
  );
  const inverseSimilarity = 1 - similarity01;
  const curvedDistanceFactor = Math.pow(inverseSimilarity, 1.12);

  return (
    args.collisionMinDistance +
    (farDistance - args.collisionMinDistance) * curvedDistanceFactor
  );
}

function getDiagnosticScope(neighbor: SemanticNeighbor) {
  if (neighbor.semantic_role === "near_duplicate_candidate") {
    return "near_duplicate" as const;
  }

  if (neighbor.force_weight > 0) {
    return "force_neighbor" as const;
  }

  return "context_only" as const;
}

function isActionableSemanticNeighbor(neighbor: SemanticNeighbor) {
  return (
    neighbor.force_weight > 0 ||
    neighbor.semantic_role === "near_duplicate_candidate"
  );
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
  desiredDistance: number;
  actualDistance: number;
  relationshipFit: SemanticDistanceRelationshipFit;
  diagnosticScope: "force_neighbor" | "near_duplicate" | "context_only";
  spacingSafety: "collision_safe" | "collision_violation";
}) {
  const similarityText = args.similarity.toFixed(3);
  const desiredText = args.desiredDistance.toFixed(3);
  const actualText = args.actualDistance.toFixed(3);

  if (args.relationshipFit === "context_only") {
    return `${args.topicLabel} and ${args.neighborLabel} are context-only neighbors at similarity ${similarityText}; desired≈${desiredText}, actual≈${actualText}. Because this pair has no active force weight and is not a near-duplicate, it is not judged as too close/too far.`;
  }

  const safetyText =
    args.spacingSafety === "collision_violation"
      ? " The pair is below the collision-safe spacing floor, so this should be treated as a spacing issue."
      : " The pair remains collision-safe.";

  if (args.relationshipFit === "close_to_expected") {
    return `${args.topicLabel} and ${args.neighborLabel} are close to the diagnostic distance expected from similarity ${similarityText}; desired≈${desiredText}, actual≈${actualText}.${safetyText}`;
  }

  if (args.relationshipFit === "too_close") {
    return `${args.topicLabel} and ${args.neighborLabel} are closer than the diagnostic distance expected from similarity ${similarityText}; desired≈${desiredText}, actual≈${actualText}.${safetyText}`;
  }

  return `${args.topicLabel} and ${args.neighborLabel} are farther than the diagnostic distance expected from similarity ${similarityText}; desired≈${desiredText}, actual≈${actualText}. This can happen when stability, offset placement, or collision repulsion from other topics pulls the region apart.`;
}

function buildSemanticDistanceDiagnostics(args: {
  topic: LayoutCandidate;
  topicLabel: string;
  finalPosition: TopicPosition;
  context: GlobalLayoutContext;
  semanticNeighbors: SemanticNeighbor[];
}): SemanticDistanceDiagnostic[] {
  return args.semanticNeighbors.map((neighbor) => {
    const neighborTopic = args.context.allTopics.find(
      (topic) => topic.topic_id === neighbor.topic_id,
    );

    const collisionMinDistance = neighborTopic
      ? radiusAwareMinDistance({
          targetTopic: args.topic,
          otherTopic: neighborTopic,
          similarity: neighbor.raw_similarity,
          parameters: args.context.layoutParameters,
        })
      : args.context.layoutParameters.min_repulsion_distance;

    const desiredDistance = desiredDistanceForSimilarity({
      similarity: neighbor.raw_similarity,
      collisionMinDistance,
      parameters: args.context.layoutParameters,
    });

    const actualDistance = distanceBetween(
      args.finalPosition,
      neighbor.position,
    );
    const distanceError = actualDistance - desiredDistance;
    const tolerance = Math.max(0.42, collisionMinDistance * 0.18);
    const diagnosticScope = getDiagnosticScope(neighbor);
    const spacingSafety =
      actualDistance + 0.001 < collisionMinDistance
        ? "collision_violation"
        : "collision_safe";
    const relationshipFit = interpretDistanceFit({
      distanceError,
      tolerance,
      diagnosticScope,
    });
    const normalizedDistanceError =
      distanceError / Math.max(desiredDistance, 0.001);

    return {
      topic_id: neighbor.topic_id,
      topic_label: neighbor.topic_label,
      similarity: neighbor.similarity,
      raw_similarity: round4(neighbor.raw_similarity),
      reliability: round4(neighbor.reliability),
      force_weight: neighbor.force_weight,
      semantic_role: neighbor.semantic_role,
      diagnostic_scope: diagnosticScope,
      spacing_safety: spacingSafety,
      collision_min_distance: round4(collisionMinDistance),
      desired_distance: round4(desiredDistance),
      actual_distance_after_layout: round4(actualDistance),
      distance_error: round4(distanceError),
      normalized_distance_error: round4(normalizedDistanceError),
      tolerance: round4(tolerance),
      relationship_fit: relationshipFit,
      interpretation: buildDistanceInterpretation({
        topicLabel: args.topicLabel,
        neighborLabel: neighbor.topic_label,
        similarity: neighbor.raw_similarity,
        desiredDistance,
        actualDistance,
        relationshipFit,
        diagnosticScope,
        spacingSafety,
      }),
    };
  });
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
  const forceNeighbors = neighbors.filter(
    (neighbor) => neighbor.force_weight > 0,
  );

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
  const targetTopicLabelEmbedding = resolveTopicLabelEmbedding(
    args.targetTopic,
  );
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

      if (
        similarity < args.context.layoutParameters.visible_context_similarity
      ) {
        return null;
      }

      const reliability = centroidReliability(
        candidateTopicLabelEmbedding.count,
      );
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
    (neighbor) =>
      neighbor.force_weight >= args.parameters.min_display_force_weight,
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
      ? "semantic_continuous_force_v6_radius_aware_topic_label_embedding"
      : "semantic_continuous_force_v6_radius_aware_stable_fallback";

  const reason =
    allForceNeighbors.length > 0
      ? "Computed semantic target from continuous attraction forces, then applied radius-aware spacing so related topics can form regions without visually overlapping."
      : "No neighbor passed the weak attraction floor, so the topic kept a stable fallback semantic target with radius-aware spacing.";

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
  let currentPosition = args.proposedPosition;
  let totalRepulsion: TopicPosition = [0, 0, 0];
  let applied = false;

  const neighborSimilarityById = new Map(
    args.semanticNeighbors.map((neighbor) => [
      neighbor.topic_id,
      neighbor.raw_similarity,
    ]),
  );

  const iterations = Math.max(
    1,
    args.context.layoutParameters.repulsion_iterations,
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let iterationRepulsion: TopicPosition = [0, 0, 0];
    let iterationApplied = false;

    for (const [index, other] of args.context.allTopics.entries()) {
      if (other.topic_id === args.topic.topic_id) continue;

      const otherPosition = getVisualPosition(other, index);
      const distance = distanceBetween(currentPosition, otherPosition);
      const similarity = neighborSimilarityById.get(other.topic_id) ?? 0;
      const minDistance = radiusAwareMinDistance({
        targetTopic: args.topic,
        otherTopic: other,
        similarity,
        parameters: args.context.layoutParameters,
      });

      if (distance >= minDistance) continue;

      /**
       * If two anchors are exactly identical, use a deterministic direction so
       * repulsion still produces a stable separation rather than doing nothing.
       */
      const rawAway =
        distance > 0.001
          ? planarizeDirection(
              subtractPositions(currentPosition, otherPosition),
              args.context.layoutParameters,
            )
          : deterministicOffset(
              `${args.topic.topic_id}:${other.topic_id}`,
              1.2,
            );

      const safeDistance = Math.max(distance, 0.001);

      /**
       * Similar topics can be closer, but visual overlap should still be treated
       * as an error state. Dampening is therefore intentionally bounded.
       */
      const semanticDampening = clamp(
        1 - Math.max(0, similarity) * 0.28,
        0.72,
        1,
      );
      const overlapRatio = (minDistance - safeDistance) / minDistance;
      const strength =
        overlapRatio *
        args.context.layoutParameters.repulsion_strength *
        semanticDampening;

      const normalizedAway = scalePosition(
        rawAway,
        1 / Math.max(safeDistance, 0.001),
      );
      const contribution = scalePosition(normalizedAway, strength);

      iterationRepulsion = addPositions(iterationRepulsion, contribution);
      iterationApplied = true;
      applied = true;
    }

    if (!iterationApplied) break;

    currentPosition = constrainToSemanticPlane(
      addPositions(currentPosition, iterationRepulsion),
      args.context.layoutParameters,
    );
    totalRepulsion = addPositions(totalRepulsion, iterationRepulsion);
  }

  if (!applied) {
    return {
      position: args.proposedPosition,
      repulsionVector: [0, 0, 0] satisfies TopicPosition,
      applied: false,
    };
  }

  return {
    position: currentPosition,
    repulsionVector: totalRepulsion,
    applied: true,
  };
}


type FinalSpacingEnforcementResult = {
  position: TopicPosition;
  enforcementVector: TopicPosition;
  applied: boolean;
  correctedCount: number;
};

function enforceCriticalNeighborSpacing(args: {
  topic: LayoutCandidate;
  proposedPosition: TopicPosition;
  context: GlobalLayoutContext;
  semanticNeighbors: SemanticNeighbor[];
}): FinalSpacingEnforcementResult {
  let currentPosition = args.proposedPosition;
  let totalCorrection: TopicPosition = [0, 0, 0];
  let applied = false;
  let correctedCount = 0;

  const criticalNeighbors = args.semanticNeighbors.filter(
    isActionableSemanticNeighbor,
  );

  if (!criticalNeighbors.length) {
    return {
      position: args.proposedPosition,
      enforcementVector: [0, 0, 0],
      applied: false,
      correctedCount: 0,
    };
  }

  for (let iteration = 0; iteration < 3; iteration += 1) {
    let iterationApplied = false;

    for (const neighbor of criticalNeighbors) {
      const otherTopic = args.context.allTopics.find(
        (topic) => topic.topic_id === neighbor.topic_id,
      );

      if (!otherTopic) continue;

      const distance = distanceBetween(currentPosition, neighbor.position);
      const minimumDistance = radiusAwareMinDistance({
        targetTopic: args.topic,
        otherTopic,
        similarity: neighbor.raw_similarity,
        parameters: args.context.layoutParameters,
      });

      const requiredDistance =
        minimumDistance +
        (neighbor.semantic_role === "near_duplicate_candidate" ? 0.08 : 0.03);

      if (distance >= requiredDistance) continue;

      const rawAway =
        distance > 0.001
          ? planarizeDirection(
              subtractPositions(currentPosition, neighbor.position),
              args.context.layoutParameters,
            )
          : deterministicOffset(
              `${args.topic.topic_id}:${neighbor.topic_id}:final-spacing`,
              1.0,
            );

      const awayLength = Math.max(
        0.001,
        Math.sqrt(
          rawAway[0] * rawAway[0] +
            rawAway[1] * rawAway[1] +
            rawAway[2] * rawAway[2],
        ),
      );

      const correctionDistance = requiredDistance - distance;
      const correction = scalePosition(rawAway, correctionDistance / awayLength);

      currentPosition = constrainToSemanticPlane(
        addPositions(currentPosition, correction),
        args.context.layoutParameters,
      );
      totalCorrection = addPositions(totalCorrection, correction);
      applied = true;
      iterationApplied = true;
      correctedCount += 1;
    }

    if (!iterationApplied) break;
  }

  return {
    position: currentPosition,
    enforcementVector: totalCorrection,
    applied,
    correctedCount,
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

    semanticPullPosition = roundPosition(
      constrainToSemanticPlane(neighborTarget, args.context.layoutParameters),
    );

    /**
     * Stability guard:
     * semantic_position can move toward meaning, but the visual map should not
     * teleport. topic_position still remains unchanged here.
     */
    preRepulsionPosition = constrainToSemanticPlane(
      lerpPosition(
        currentVisualPosition,
        neighborTarget,
        decision.semantic_pull_alpha,
      ),
      args.context.layoutParameters,
    );
  } else {
    semanticPullPosition = addPositions(
      currentVisualPosition,
      deterministicOffset(args.targetTopic.topic_id, FALLBACK_OFFSET_RADIUS),
    );

    preRepulsionPosition = constrainToSemanticPlane(
      semanticPullPosition,
      args.context.layoutParameters,
    );
  }

  const repelled = applyRepulsion({
    topic: args.targetTopic,
    proposedPosition: preRepulsionPosition,
    context: args.context,
    semanticNeighbors,
  });

  const finalSpacing = enforceCriticalNeighborSpacing({
    topic: args.targetTopic,
    proposedPosition: repelled.position,
    context: args.context,
    semanticNeighbors: decision.semantic_neighbors,
  });

  const finalPosition = roundPosition(finalSpacing.position);
  const semanticDistanceDiagnostics = buildSemanticDistanceDiagnostics({
    topic: args.targetTopic,
    topicLabel: getTopicLabel(args.targetTopic),
    finalPosition,
    context: args.context,
    semanticNeighbors: decision.semantic_neighbors,
  });

  return {
    position: finalPosition,
    semantic_pull_position: roundPosition(semanticPullPosition),
    pre_repulsion_position: roundPosition(preRepulsionPosition),
    method: decision.method,
    semantic_neighbors: decision.semantic_neighbors,
    force_neighbors: decision.force_neighbors,
    semantic_distance_diagnostics: semanticDistanceDiagnostics,
    near_duplicate_candidates: decision.semantic_neighbors.filter(
      (neighbor) => neighbor.semantic_role === "near_duplicate_candidate",
    ),
    reason: decision.reason,
    layout_decision: decision,
    repulsion_applied: repelled.applied || finalSpacing.applied,
    repulsion_vector: roundPosition(
      addPositions(repelled.repulsionVector, finalSpacing.enforcementVector),
    ),
    final_spacing_enforcement_applied: finalSpacing.applied,
    final_spacing_enforcement_vector: roundPosition(
      finalSpacing.enforcementVector,
    ),
    final_spacing_enforcement_count: finalSpacing.correctedCount,
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

function getJsonObjectChild(
  object: JsonObject,
  key: string,
): JsonObject | null {
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
    semantic_distance_diagnostics:
      args.computed.semantic_distance_diagnostics.map((diagnostic) => ({
        topic_id: diagnostic.topic_id,
        topic_label: diagnostic.topic_label,
        similarity: diagnostic.similarity,
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
        estimated_render_radius: round4(estimateTopicRenderRadius(args.topic)),
        estimated_collision_radius: round4(
          estimateTopicCollisionRadius(args.topic),
        ),
        final_spacing_enforcement_applied:
          args.computed.final_spacing_enforcement_applied,
        final_spacing_enforcement_vector:
          args.computed.final_spacing_enforcement_vector,
        final_spacing_enforcement_count:
          args.computed.final_spacing_enforcement_count,
        distance_diagnostic_policy:
          "Diagnostic only: desired_distance maps higher similarity to shorter readable distance, while actual_distance_after_layout shows where the current force/collision layout placed the pair.",
      },
      semantic_distance_diagnostics:
        args.computed.semantic_distance_diagnostics.map((diagnostic) => ({
          topic_id: diagnostic.topic_id,
          topic_label: diagnostic.topic_label,
          similarity: diagnostic.similarity,
          raw_similarity: diagnostic.raw_similarity,
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
        })),
      near_duplicate_candidates: args.computed.near_duplicate_candidates.map(
        (neighbor) => ({
          topic_id: neighbor.topic_id,
          topic_label: neighbor.topic_label,
          similarity: neighbor.similarity,
          force_weight: neighbor.force_weight,
          reliability: neighbor.reliability,
          topic_label_embedding_count: neighbor.topic_label_embedding_count,
          topic_label_embedding_source: neighbor.topic_label_embedding_source,
        }),
      ),
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
      semantic_layout_resolved_embedding_source:
        args.topicLabelEmbedding.source,
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


function buildGlobalPairwiseDiagnostics(args: {
  rows: LayoutCandidate[];
  context: GlobalLayoutContext;
  processedPositions: Map<string, TopicPosition>;
}): GlobalSemanticPairwiseDiagnostic[] {
  const diagnostics: GlobalSemanticPairwiseDiagnostic[] = [];

  for (let outerIndex = 0; outerIndex < args.context.enrichedTopics.length; outerIndex += 1) {
    const topicA = args.context.enrichedTopics[outerIndex];
    const embeddingA = resolveTopicLabelEmbedding(topicA).centroid;

    if (!embeddingA) continue;

    for (let innerIndex = outerIndex + 1; innerIndex < args.context.enrichedTopics.length; innerIndex += 1) {
      const topicB = args.context.enrichedTopics[innerIndex];
      const embeddingB = resolveTopicLabelEmbedding(topicB).centroid;

      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      const semanticRole = classifyNeighbor({
        similarity,
        parameters: args.context.layoutParameters,
      });

      const forceWeight = semanticForceWeight({
        similarity,
        reliability: Math.min(
          centroidReliability(resolveTopicLabelEmbedding(topicA).count),
          centroidReliability(resolveTopicLabelEmbedding(topicB).count),
        ),
        parameters: args.context.layoutParameters,
      });

      const diagnosticScope: GlobalSemanticPairwiseDiagnostic["diagnostic_scope"] =
        semanticRole === "near_duplicate_candidate"
          ? "near_duplicate"
          : forceWeight > 0
            ? "force_candidate"
            : "context_only";

      const positionA =
        args.processedPositions.get(topicA.topic_id) ??
        getVisualPosition(topicA, outerIndex);
      const positionB =
        args.processedPositions.get(topicB.topic_id) ??
        getVisualPosition(topicB, innerIndex);

      const collisionMinDistance = radiusAwareMinDistance({
        targetTopic: topicA,
        otherTopic: topicB,
        similarity,
        parameters: args.context.layoutParameters,
      });

      const desiredDistance = desiredDistanceForSimilarity({
        similarity,
        collisionMinDistance,
        parameters: args.context.layoutParameters,
      });

      const actualDistance = distanceBetween(positionA, positionB);
      const distanceError = actualDistance - desiredDistance;
      const tolerance = Math.max(0.42, collisionMinDistance * 0.18);
      const relationshipFit: SemanticDistanceRelationshipFit =
        diagnosticScope === "context_only"
          ? "context_only"
          : interpretDistanceFit({
              distanceError,
              tolerance,
              diagnosticScope:
                diagnosticScope === "near_duplicate"
                  ? "near_duplicate"
                  : "force_neighbor",
            });

      diagnostics.push({
        topic_a_id: topicA.topic_id,
        topic_a_label: getTopicLabel(topicA),
        topic_b_id: topicB.topic_id,
        topic_b_label: getTopicLabel(topicB),
        similarity: round4(similarity),
        raw_similarity: round4(similarity),
        semantic_role: semanticRole,
        diagnostic_scope: diagnosticScope,
        collision_min_distance: round4(collisionMinDistance),
        desired_distance: round4(desiredDistance),
        actual_distance_after_layout: round4(actualDistance),
        distance_error: round4(distanceError),
        normalized_distance_error: round4(
          distanceError / Math.max(desiredDistance, 0.001),
        ),
        tolerance: round4(tolerance),
        relationship_fit: relationshipFit,
        spacing_safety:
          actualDistance + 0.001 < collisionMinDistance
            ? "collision_violation"
            : "collision_safe",
      });
    }
  }

  return diagnostics
    .sort((a, b) => {
      if (a.spacing_safety !== b.spacing_safety) {
        return a.spacing_safety === "collision_violation" ? -1 : 1;
      }

      if (a.diagnostic_scope !== b.diagnostic_scope) {
        const rank = {
          near_duplicate: 0,
          force_candidate: 1,
          context_only: 2,
        } satisfies Record<GlobalSemanticPairwiseDiagnostic["diagnostic_scope"], number>;

        return rank[a.diagnostic_scope] - rank[b.diagnostic_scope];
      }

      return b.similarity - a.similarity;
    })
    .slice(0, 40);
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
        "Compute semantic target positions as a mostly planar semantic solar-system map. Similar topics form regions on the plane, while radius-aware collision clearance prevents rendered topic spheres from overlapping. The third dimension is restrained for parallax/readability rather than used as an arbitrary semantic axis.",
      cluster_policy:
        "Clusters are not assigned by this route. Emergent regions are inferred later from stable semantic geometry.",
      movement_policy:
        "This route writes semantic_position only. It does not mutate committed topic_position.",
      spacing_policy:
        "Repulsion is radius-aware: visible radius plus future shape/ring/badge/satellite buffer determines minimum center distance, so larger or blobier spheres get more room. Similar topics may be close, but should remain visibly separated unless a future compound/merge rendering intentionally replaces separate spheres.",
      distance_diagnostic_policy:
        "Each processed topic reports semantic_distance_diagnostics. Context-only pairs are no longer judged as too_close/too_far; actual force neighbors and near-duplicates receive stricter spacing checks. The response also includes global_pairwise_distance_diagnostics after all processed positions are known.",
    };

    const results = [];
    const processedPositions = new Map<string, TopicPosition>();

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

      processedPositions.set(topic.topic_id, computed.position);

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
            force_weight: neighbor.force_weight,
            reliability: neighbor.reliability,
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
        semantic_distance_diagnostics:
          computed.semantic_distance_diagnostics.map((diagnostic) => ({
            topic_id: diagnostic.topic_id,
            topic_label: diagnostic.topic_label,
            similarity: diagnostic.similarity,
            raw_similarity: diagnostic.raw_similarity,
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

    const global_pairwise_distance_diagnostics = buildGlobalPairwiseDiagnostics({
      rows,
      context,
      processedPositions,
    });

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
