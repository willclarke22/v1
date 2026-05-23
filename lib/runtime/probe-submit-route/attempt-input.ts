import type {
  EmbeddingVector,
  ImportantRunInputs,
  ModelSignals,
  TopicState,
  VectorInfo,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type { ProbeAttemptPayload } from "@/lib/runtime/attempt-judging";
import { nowIso } from "@/lib/runtime/shared";
import { getRouteTopicLabel } from "./request-context";

export function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

export function asPositiveCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function buildEmbeddingSummary(args: {
  centroid?: EmbeddingVector | null;
  count?: number | null;
  model?: string | null;
  updatedAt?: string | null;
}) {
  const centroid = asEmbeddingVector(args.centroid ?? null);

  return {
    available: Boolean(centroid?.length),
    dimension: centroid?.length ?? 0,
    count: args.count ?? 0,
    model: args.model ?? null,
    updated_at: args.updatedAt ?? null,
    preview: centroid ? centroid.slice(0, 5) : [],
  };
}

export function getEmbeddingPersistenceFields(topic: RouteTopic) {
  const topicLabelCentroid = asEmbeddingVector(
    topic.topic_label_embedding_centroid,
  );

  const topicLabelCount = asPositiveCount(topic.topic_label_embedding_count);
  const topicLabelModel = topic.topic_label_embedding_model ?? null;
  const topicLabelUpdatedAt = topic.topic_label_embedding_updated_at ?? null;

  const topicMessageCentroid = asEmbeddingVector(
    topic.topic_message_embedding_centroid,
  );

  const topicMessageCount = asPositiveCount(
    topic.topic_message_embedding_count,
  );

  const topicMessageModel = topic.topic_message_embedding_model ?? null;
  const topicMessageUpdatedAt =
    topic.topic_message_embedding_updated_at ?? null;

  return {
    topicLabelEmbeddingCentroid: topicLabelCentroid,
    topicLabelEmbeddingCount: topicLabelCount,
    topicLabelEmbeddingModel: topicLabelModel,
    topicLabelEmbeddingUpdatedAt: topicLabelUpdatedAt,

    topicMessageEmbeddingCentroid: topicMessageCentroid,
    topicMessageEmbeddingCount: topicMessageCount,
    topicMessageEmbeddingModel: topicMessageModel,
    topicMessageEmbeddingUpdatedAt: topicMessageUpdatedAt,
  };
}

export function buildImportantRunInputs(args: {
  body: ProbeAttemptPayload;
  topic: RouteTopic;
  vectorInfo: VectorInfo;
  modelSignals: ModelSignals;
  rawResponse: string;
}): ImportantRunInputs {
  const { body, topic, vectorInfo, modelSignals, rawResponse } = args;
  const topicLabel = getRouteTopicLabel(topic);

  return {
    user_message: {
      message_id: null,
      timestamp: body.submittedAt || nowIso(),
      content: rawResponse,
    },
    model_signals: modelSignals,
    current_interaction_context: {
      run_kind: "attempt_run",
      is_response_to_delivered_probe: true,
      prior_mode_selected: "probe",
      prior_probe_was_applicable: true,
      prior_probe_id: body.probeId,
      prior_mode_outcome_available: true,
    },
    new_attempt: {
      status: "present",
      attempt_id: body.attemptId ?? null,
      timestamp: body.submittedAt || nowIso(),
      originating_run_id: null,
      source_message_id: null,
      linked_probe_id: body.probeId,
      linked_stimulus_id: null,
      linked_topic_id: body.topicId,
      linked_cluster_id: null,
      linked_resolution_contract_id: null,
      response_type: body.responseType ?? "text",
      completion_status:
        typeof body.response === "string" && body.response.trim().length === 0
          ? "skipped"
          : "complete",
      raw_response:
        typeof body.response === "string" || typeof body.response === "object"
          ? body.response
          : null,
      delivery_context: {
        renderer_type: body.deliveryContext?.renderer_type ?? "text_renderer",
        generator: body.deliveryContext?.generator ?? "chatgpt",
        modality: body.deliveryContext?.modality ?? "text",
        tone: body.deliveryContext?.tone ?? "encouraging",
        pacing: body.deliveryContext?.pacing ?? "normal",
        language_style: body.deliveryContext?.language_style ?? "plain",
        context_framing:
          body.deliveryContext?.context_framing ??
          `Probe response for ${topicLabel}.`,
      },
      submission_metadata: {
        latency_ms: body.metadata?.latencyMs ?? null,
        revision_count: body.metadata?.revisionCount ?? null,
        used_hint: body.metadata?.usedHint ?? null,
        requested_clarification_before_answering:
          body.metadata?.requestedClarificationBeforeAnswering ?? null,
      },
    },
    vector_info: vectorInfo,
    uploaded_content: [],
  };
}

export function buildTopicStates(updatedTopics: RouteTopic[]): TopicState[] {
  return updatedTopics.map((topic) => {
    const topicLabel = getRouteTopicLabel(topic);

    return {
      topic_id: topic.id,
      topic_label: topicLabel,
      topic_confusion_average: topic.confusion,
      topic_insight_average: topic.insight,
      topic_learning_score: topic.learningScore,
      topic_learning_velocity: 0,
      topic_novelty_score: 0.5,
      topic_message_count: topic.messageCount ?? 1,
      topic_difficulty: 0.5,
      topic_decay_rate: 0.05,
      topic_link_threshold: 0.5,
      topic_last_update: nowIso(),
      topic_centroid: topic.position as [number, number, number],

      topic_label_embedding: buildEmbeddingSummary({
        centroid: topic.topic_label_embedding_centroid ?? null,
        count: topic.topic_label_embedding_count ?? 0,
        model: topic.topic_label_embedding_model ?? null,
        updatedAt: topic.topic_label_embedding_updated_at ?? null,
      }),

      topic_message_embedding: buildEmbeddingSummary({
        centroid: topic.topic_message_embedding_centroid ?? null,
        count: topic.topic_message_embedding_count ?? 0,
        model: topic.topic_message_embedding_model ?? null,
        updatedAt: topic.topic_message_embedding_updated_at ?? null,
      }),
    };
  });
}
