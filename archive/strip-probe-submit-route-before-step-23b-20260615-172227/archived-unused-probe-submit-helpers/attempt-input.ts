import type {
  EmbeddingVector,
  ImportantRunInputs,
  ModelSignals,
  ProbeExpectedResponseType,
  ProbeType,
  TopicState,
  VectorInfo,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import type { ProbeAttemptPayload } from "@/lib/learning-evaluation/attempt-judging";
import type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/lib/learning-evaluation/attempt-evidence";
import {
  interpretAttemptEvidence,
  normalizeAttemptEvidence,
} from "@/lib/learning-evaluation/attempt-evidence";
import { nowIso } from "@/lib/shared/runtime";
import { getRouteTopicLabel } from "./request-context";

export type AttemptEvidencePackage = {
  importantRunInputs: ImportantRunInputs;
  normalizedEvidence: NormalizedEvidenceInput;
  attemptInterpretation: AttemptInterpretation;
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

function isEmptyRawResponse(value: ProbeAttemptPayload["response"]) {
  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}

function normalizeRawAttemptResponse(value: ProbeAttemptPayload["response"]) {
  return typeof value === "string" || (value && typeof value === "object")
    ? value
    : null;
}

function expectedResponseTypeFromAttempt(
  value: ImportantRunInputs["new_attempt"]["response_type"],
): ProbeExpectedResponseType | null {
  switch (value) {
    case "choice":
    case "multiple_choice":
    case "ordering":
    case "predict":
    case "audio":
    case "video":
    case "interactive_action":
    case "dynamic_task":
    case "text":
      return value;
    case "classify":
      /**
       * There is no separate ProbeExpectedResponseType branch for classify in
       * the current contracts. Classification is treated as structured /
       * interactive evidence downstream.
       */
      return "interactive_action";
    case "transform":
      return "text";
    default:
      return null;
  }
}

function inferredProbeTypeFromResponseType(
  value: ImportantRunInputs["new_attempt"]["response_type"],
): ProbeType | null {
  switch (value) {
    case "predict":
      return "predict";
    case "choice":
    case "multiple_choice":
    case "classify":
      return "discriminate";
    case "ordering":
    case "interactive_action":
    case "dynamic_task":
    case "transform":
      return "transform";
    case "text":
    case "audio":
    case "video":
    default:
      return null;
  }
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
  const timestamp = body.submittedAt || nowIso();
  const rawAttemptResponse = normalizeRawAttemptResponse(body.response);

  return {
    user_message: {
      message_id: null,
      timestamp,
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
      timestamp,
      originating_run_id: null,
      source_message_id: null,
      linked_probe_id: body.probeId,
      linked_stimulus_id: null,
      linked_topic_id: body.topicId,
      linked_cluster_id: null,
      linked_resolution_contract_id: null,
      response_type: body.responseType ?? "text",
      completion_status: isEmptyRawResponse(body.response) ? "skipped" : "complete",
      raw_response: rawAttemptResponse,
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

export function buildAttemptEvidencePackage(args: {
  body: ProbeAttemptPayload;
  topic: RouteTopic;
  vectorInfo: VectorInfo;
  modelSignals: ModelSignals;
  rawResponse: string;
  activeDiagnosis?: string | null;
}): AttemptEvidencePackage {
  const importantRunInputs = buildImportantRunInputs(args);
  const expectedResponseType = expectedResponseTypeFromAttempt(
    importantRunInputs.new_attempt.response_type,
  );
  const probeType = inferredProbeTypeFromResponseType(
    importantRunInputs.new_attempt.response_type,
  );

  const normalizedEvidenceBase = normalizeAttemptEvidence(
    importantRunInputs.new_attempt,
  );

  const normalizedEvidence: NormalizedEvidenceInput = {
    ...normalizedEvidenceBase,
    expected_response_type: expectedResponseType,
    probe_type: probeType,
  };

  const attemptInterpretation = interpretAttemptEvidence(normalizedEvidence, {
    modelSignals: args.modelSignals,
    activeDiagnosis: args.activeDiagnosis ?? null,
    probeType,
    expectedResponseType,
  });

  return {
    importantRunInputs,
    normalizedEvidence,
    attemptInterpretation,
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



