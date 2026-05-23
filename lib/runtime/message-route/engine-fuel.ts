import { nowIso } from "@/lib/runtime/shared";
import type {
  EmbeddingVector,
  EngineFuel,
  ImportantRunInputs,
  InterventionModeDecision,
  PreviousModeOutcome,
  ProbePlan,
  RunMetadata,
  TopicRoutingState,
  TopicState,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function buildEmbeddingSummary(args: {
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

export function buildTopicStates(updatedTopics: RouteTopic[]): TopicState[] {
  return updatedTopics.map((topic) => {
    const topicWithOptionalMetrics = topic as RouteTopic & {
      learningVelocity?: number;
      noveltyScore?: number;
      difficulty?: number;
      decayRate?: number;
      linkThreshold?: number;
    };

    return {
      topic_id: topic.id,
      topic_label: topic.topic_label,
      topic_learning_score: topic.learningScore,
      topic_confusion_average: topic.confusion,
      topic_insight_average: topic.insight,
      topic_learning_velocity: topicWithOptionalMetrics.learningVelocity ?? 0,
      topic_novelty_score: topicWithOptionalMetrics.noveltyScore ?? 0,
      topic_difficulty: topicWithOptionalMetrics.difficulty ?? 0.5,
      topic_decay_rate: topicWithOptionalMetrics.decayRate ?? 0.1,
      topic_link_threshold: topicWithOptionalMetrics.linkThreshold ?? 0.5,
      topic_message_count: topic.messageCount ?? 0,
      topic_last_update: topic.lastUpdated ?? nowIso(),
      topic_centroid: topic.position,

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

export function buildPreviousModeOutcome(
  runKind: ImportantRunInputs["current_interaction_context"]["run_kind"],
): PreviousModeOutcome {
  return {
    mode_selected: runKind === "clarify_followup" ? "clarify" : "probe",
    reasons: [],
    confidence: 0.5,
    clarify_outcome:
      runKind === "clarify_followup" ? "sufficient" : "not_applicable",
  };
}

export function buildEngineFuel(
  updatedTopics: RouteTopic[],
  decision: InterventionModeDecision,
  probePlan: ProbePlan,
  previousModeOutcome: PreviousModeOutcome,
  topicRouting: TopicRoutingState | null,
): EngineFuel {
  return {
    topics: buildTopicStates(updatedTopics),
    clusters: [],
    linked_pairs: [],
    previous_mode_outcome: previousModeOutcome,
    intervention_mode_decision: decision,
    probe_plan: probePlan,
    topic_routing: topicRouting ?? undefined,
    attempts: [],
  };
}

export function buildRunMetadata(
  engineFuel: EngineFuel,
  runId: string,
): RunMetadata {
  return {
    run_id: runId,
    timestamp: nowIso(),
    engine_version:
      "runtime-topic-labeler-provider-message-embedding-confusion-insight-v1_1",
    previous_run_id: null,
    topic_count: engineFuel.topics.length,
    cluster_count: engineFuel.clusters.length,
    linked_pair_count: engineFuel.linked_pairs.length,
  };
}
