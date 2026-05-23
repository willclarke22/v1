import type { EmbeddingVector } from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import { nowIso } from "@/lib/runtime/shared";

export type RouteCentroidUpdatePlan = {
  topic_id: string;
  previous_embedding_count: number;
  new_embedding_count: number;
  update_method: "initialize" | "running_average" | "ema" | "none";
  alpha: number | null;
  embedding_model: string | null;
  updated_at: string;
  new_centroid: EmbeddingVector | null;
};

export function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

export function buildRunningAverageCentroid(args: {
  existingCentroid: EmbeddingVector;
  existingCount: number;
  newEmbedding: EmbeddingVector;
}): EmbeddingVector | null {
  const { existingCentroid, existingCount, newEmbedding } = args;

  if (existingCentroid.length !== newEmbedding.length) {
    return null;
  }

  const safeExistingCount = Math.max(0, Math.floor(existingCount));
  const nextCount = safeExistingCount + 1;

  if (nextCount <= 1) {
    return newEmbedding;
  }

  return existingCentroid.map((existingValue, index) => {
    const newValue = newEmbedding[index];

    return (existingValue * safeExistingCount + newValue) / nextCount;
  });
}

export function buildTargetTopicMessageEmbeddingPlan(args: {
  targetTopic: RouteTopic | null;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
}): RouteCentroidUpdatePlan | null {
  const { targetTopic, messageEmbedding, embeddingModel } = args;
  const newMessageEmbedding = asEmbeddingVector(messageEmbedding);

  if (!targetTopic || !newMessageEmbedding) return null;

  const existingCentroid = asEmbeddingVector(
    targetTopic.topic_message_embedding_centroid ?? null,
  );

  const previousEmbeddingCount =
    typeof targetTopic.topic_message_embedding_count === "number" &&
    Number.isFinite(targetTopic.topic_message_embedding_count)
      ? Math.max(0, Math.floor(targetTopic.topic_message_embedding_count))
      : 0;

  const canUseRunningAverage =
    Boolean(existingCentroid?.length) &&
    previousEmbeddingCount > 0 &&
    existingCentroid?.length === newMessageEmbedding.length;

  if (!canUseRunningAverage) {
    return {
      topic_id: targetTopic.id,
      previous_embedding_count: previousEmbeddingCount,
      new_embedding_count: 1,
      update_method: "initialize",
      alpha: null,
      embedding_model: embeddingModel,
      updated_at: nowIso(),
      new_centroid: newMessageEmbedding,
    };
  }

  const nextEmbeddingCount = previousEmbeddingCount + 1;
  const averagedCentroid = buildRunningAverageCentroid({
    existingCentroid,
    existingCount: previousEmbeddingCount,
    newEmbedding: newMessageEmbedding,
  });

  if (!averagedCentroid) {
    return {
      topic_id: targetTopic.id,
      previous_embedding_count: previousEmbeddingCount,
      new_embedding_count: 1,
      update_method: "initialize",
      alpha: null,
      embedding_model: embeddingModel,
      updated_at: nowIso(),
      new_centroid: newMessageEmbedding,
    };
  }

  return {
    topic_id: targetTopic.id,
    previous_embedding_count: previousEmbeddingCount,
    new_embedding_count: nextEmbeddingCount,
    update_method: "running_average",
    alpha: 1 / nextEmbeddingCount,
    embedding_model: embeddingModel,
    updated_at: nowIso(),
    new_centroid: averagedCentroid,
  };
}

export function isUsableCentroidUpdatePlan(
  plan: RouteCentroidUpdatePlan | null,
  targetTopicId: string,
): plan is RouteCentroidUpdatePlan {
  if (!plan) return false;
  if (plan.topic_id !== targetTopicId) return false;
  if (plan.update_method === "none") return false;
  if (plan.new_embedding_count <= plan.previous_embedding_count) return false;

  return Boolean(asEmbeddingVector(plan.new_centroid)?.length);
}

export function describeCentroidUpdatePlan(plan: RouteCentroidUpdatePlan | null) {
  if (!plan) {
    return {
      present: false,
      topic_id: null,
      update_method: null,
      previous_embedding_count: null,
      new_embedding_count: null,
      has_new_centroid: false,
    };
  }

  return {
    present: true,
    topic_id: plan.topic_id,
    update_method: plan.update_method,
    previous_embedding_count: plan.previous_embedding_count,
    new_embedding_count: plan.new_embedding_count,
    has_new_centroid: Boolean(asEmbeddingVector(plan.new_centroid)?.length),
  };
}

export function applyMessageEmbeddingUpdatePlanToTopics(
  topics: RouteTopic[],
  plan: RouteCentroidUpdatePlan | null,
): RouteTopic[] {
  if (!plan || !plan.new_centroid) return topics;

  return topics.map((topic) => {
    if (topic.id !== plan.topic_id) return topic;

    return {
      ...topic,
      topic_message_embedding_centroid: plan.new_centroid,
      topic_message_embedding_count: plan.new_embedding_count,
      topic_message_embedding_model: plan.embedding_model,
      topic_message_embedding_updated_at: plan.updated_at,
      topic_json: {
        ...(topic.topic_json ?? {}),
        topic_message_embedding_centroid: plan.new_centroid,
        topic_message_embedding_count: plan.new_embedding_count,
        topic_message_embedding_model: plan.embedding_model,
        topic_message_embedding_updated_at: plan.updated_at,
      },
    };
  });
}

export function getCanonicalEmbeddingPersistenceMetadata(topic: RouteTopic) {
  return {
    topicLabelEmbeddingCentroid: topic.topic_label_embedding_centroid ?? null,
    topicLabelEmbeddingCount: topic.topic_label_embedding_count ?? null,
    topicLabelEmbeddingModel: topic.topic_label_embedding_model ?? null,
    topicLabelEmbeddingUpdatedAt:
      topic.topic_label_embedding_updated_at ?? null,

    topicMessageEmbeddingCentroid:
      topic.topic_message_embedding_centroid ?? null,
    topicMessageEmbeddingCount: topic.topic_message_embedding_count ?? null,
    topicMessageEmbeddingModel: topic.topic_message_embedding_model ?? null,
    topicMessageEmbeddingUpdatedAt:
      topic.topic_message_embedding_updated_at ?? null,
  };
}
