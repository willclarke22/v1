// lib/learning-space/topic-position.ts

export type TopicPosition3D = [number, number, number];

export type TopicPositionSource =
  | "topic_position"
  | "semantic_position"
  | "topic_json"
  | "deterministic_fallback";

export type TopicLayoutMetadata = {
  position_source: TopicPositionSource;
  semantic_position: TopicPosition3D | null;
  semantic_position_method: string | null;
  semantic_position_updated_at: string | null;
};

export type ResolvedTopicLayout = TopicLayoutMetadata & {
  position: TopicPosition3D;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isTopicPosition3D(value: unknown): value is TopicPosition3D {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isFiniteNumber)
  );
}

function asTopicPosition3D(value: unknown): TopicPosition3D | null {
  return isTopicPosition3D(value) ? value : null;
}

function readNestedPosition(
  object: Record<string, unknown>,
  key: string,
): TopicPosition3D | null {
  const value = object[key];
  return asTopicPosition3D(value);
}

export function readTopicPositionFromJson(
  topicJson: Record<string, unknown> | null | undefined,
): TopicPosition3D | null {
  if (!topicJson || typeof topicJson !== "object") return null;

  const learningSpaceTopic =
    topicJson.learning_space_topic &&
    typeof topicJson.learning_space_topic === "object" &&
    !Array.isArray(topicJson.learning_space_topic)
      ? (topicJson.learning_space_topic as Record<string, unknown>)
      : null;

  return (
    readNestedPosition(topicJson, "topic_position") ??
    readNestedPosition(topicJson, "position") ??
    readNestedPosition(topicJson, "topic_centroid") ??
    (learningSpaceTopic
      ? readNestedPosition(learningSpaceTopic, "position")
      : null)
  );
}

export function readSemanticPositionFromJson(
  topicJson: Record<string, unknown> | null | undefined,
): TopicPosition3D | null {
  if (!topicJson || typeof topicJson !== "object") return null;

  return (
    readNestedPosition(topicJson, "semantic_position") ??
    readNestedPosition(topicJson, "semantic_target_position") ??
    readNestedPosition(topicJson, "learning_space_target_position")
  );
}

export function computeDeterministicTopicPosition(
  index: number,
): TopicPosition3D {
  if (index <= 0) {
    return [0, 0, 0];
  }

  const angle = index * 2.399963229728653; // golden angle
  const radius = 2.8 + Math.sqrt(index) * 1.35;
  const y = ((index % 5) - 2) * 0.42;

  return [
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius * 0.82,
  ];
}

export function computeNextTopicPosition(existingTopicCount: number) {
  return computeDeterministicTopicPosition(existingTopicCount);
}

export function resolveTopicLayout(args: {
  topicId: string;
  index: number;
  topicPosition?: TopicPosition3D | null;
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: string | null;
  topicJson?: Record<string, unknown> | null;
}): ResolvedTopicLayout {
  const jsonTopicPosition = readTopicPositionFromJson(args.topicJson);
  const jsonSemanticPosition = readSemanticPositionFromJson(args.topicJson);

  const semanticPosition =
    (isTopicPosition3D(args.semanticPosition) ? args.semanticPosition : null) ??
    jsonSemanticPosition;

  const semanticPositionMethod =
    args.semanticPositionMethod ??
    (typeof args.topicJson?.semantic_position_method === "string"
      ? args.topicJson.semantic_position_method
      : null);

  const semanticPositionUpdatedAt =
    args.semanticPositionUpdatedAt ??
    (typeof args.topicJson?.semantic_position_updated_at === "string"
      ? args.topicJson.semantic_position_updated_at
      : null);

  if (isTopicPosition3D(args.topicPosition)) {
    return {
      position: args.topicPosition,
      position_source: "topic_position",
      semantic_position: semanticPosition,
      semantic_position_method: semanticPositionMethod,
      semantic_position_updated_at: semanticPositionUpdatedAt,
    };
  }

  if (jsonTopicPosition) {
    return {
      position: jsonTopicPosition,
      position_source: "topic_json",
      semantic_position: semanticPosition,
      semantic_position_method: semanticPositionMethod,
      semantic_position_updated_at: semanticPositionUpdatedAt,
    };
  }

  if (semanticPosition) {
    return {
      position: semanticPosition,
      position_source: "semantic_position",
      semantic_position: semanticPosition,
      semantic_position_method: semanticPositionMethod,
      semantic_position_updated_at: semanticPositionUpdatedAt,
    };
  }

  return {
    position: computeDeterministicTopicPosition(args.index),
    position_source: "deterministic_fallback",
    semantic_position: null,
    semantic_position_method: semanticPositionMethod,
    semantic_position_updated_at: semanticPositionUpdatedAt,
  };
}