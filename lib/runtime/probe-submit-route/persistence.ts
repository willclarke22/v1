import {
  insertAttempt,
  insertRun,
  upsertTopicState,
} from "@/lib/persistence/myway";
import type {
  DeliveredProbe,
  InterventionModeDecision,
  LearningSpace,
  ModelSignals,
  MyWayRunResult,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type {
  buildJudgedAttempt,
  buildTopicMetricUpdate,
} from "@/lib/runtime/attempt-judging";
import type {
  buildNextProbePlan,
  buildNotApplicableProbePlan,
} from "@/lib/runtime/probe-runtime";
import { getEmbeddingPersistenceFields } from "./attempt-input";
import {
  appendPendingConfusionInsightScore,
  getProbeConfusionInsightScoringMode,
  getProbeConfusionInsightTimeoutMs,
  type JsonValue,
  type PendingConfusionInsightScore,
} from "./confusion-insight-queue";

export function buildProbeSubmitTopicJson(args: {
  topic: RouteTopic;
  topicLabel: string;
  pendingConfusionInsightScore: PendingConfusionInsightScore;
  bodyProbeId: string;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
  updatedTopicMetrics: ReturnType<typeof buildTopicMetricUpdate>;
  modelSignals: ModelSignals;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  nextDeliveredProbe: DeliveredProbe | null;
  learningSpace: LearningSpace;
  updatedPersistedTopic: RouteTopic;
}): JsonValue {
  const embeddingFields = getEmbeddingPersistenceFields(args.updatedPersistedTopic);

  return JSON.parse(
    JSON.stringify({
      ...appendPendingConfusionInsightScore({
        topicJson: args.topic.topic_json,
        pendingScore: args.pendingConfusionInsightScore,
      }),
      topic_id: args.topic.id,
      topic_label: args.topicLabel,
      next_step: args.nextProbePlan.text_plan.instructional_goal ?? args.topic.nextStep,
      previous_probe_id: args.bodyProbeId,
      judged_attempt: args.judgedAttempt,
      updated_topic_metrics: args.updatedTopicMetrics,
      probe_confusion_insight_signal: args.modelSignals,
      probe_confusion_insight_scoring_mode: getProbeConfusionInsightScoringMode(),
      probe_confusion_insight_timeout_ms: getProbeConfusionInsightTimeoutMs(),
      probe_confusion_insight_pending_score: args.pendingConfusionInsightScore,
      next_probe_plan: args.nextProbePlan,
      next_delivered_probe: args.nextDeliveredProbe,
      learning_space_topic:
        args.learningSpace.topics?.find((topic) => topic.topic_id === args.topic.id) ?? null,

      topic_position: args.updatedPersistedTopic.position,
      semantic_position: args.updatedPersistedTopic.semanticPosition ?? null,
      semantic_position_method:
        args.updatedPersistedTopic.semanticPositionMethod ?? null,
      semantic_position_updated_at:
        args.updatedPersistedTopic.semanticPositionUpdatedAt ?? null,

      topic_label_embedding_centroid: embeddingFields.topicLabelEmbeddingCentroid,
      topic_label_embedding_count: embeddingFields.topicLabelEmbeddingCount,
      topic_label_embedding_model: embeddingFields.topicLabelEmbeddingModel,
      topic_label_embedding_updated_at:
        embeddingFields.topicLabelEmbeddingUpdatedAt,

      topic_message_embedding_centroid:
        embeddingFields.topicMessageEmbeddingCentroid,
      topic_message_embedding_count: embeddingFields.topicMessageEmbeddingCount,
      topic_message_embedding_model: embeddingFields.topicMessageEmbeddingModel,
      topic_message_embedding_updated_at:
        embeddingFields.topicMessageEmbeddingUpdatedAt,
    }),
  ) as JsonValue;
}

export async function persistProbeSubmitRun(args: {
  runId: string;
  rawResponse: string;
  result: MyWayRunResult;
  judgedAttempt: ReturnType<typeof buildJudgedAttempt>;
  topic: RouteTopic;
  topicLabel: string;
  decision: InterventionModeDecision;
  replyText: string;
  suggestedAction: string;
  updatedTopicMetrics: ReturnType<typeof buildTopicMetricUpdate>;
  updatedPersistedTopic: RouteTopic;
  nextProbePlan:
    | ReturnType<typeof buildNextProbePlan>
    | ReturnType<typeof buildNotApplicableProbePlan>;
  topicJson: JsonValue;
}) {
  const runResultJson = JSON.parse(JSON.stringify(args.result));
  const attemptJson = JSON.parse(JSON.stringify(args.judgedAttempt));
  const embeddingFields = getEmbeddingPersistenceFields(args.updatedPersistedTopic);

  await insertRun({
    id: args.runId,
    runType: "probe_submit",
    userMessage: args.rawResponse,
    sourceMessageId: args.result.important_run_inputs.user_message.message_id,
    targetTopicId: args.topic.id,
    modeSelected: args.decision.mode_selected,
    activeDiagnosis: args.decision.active_diagnosis,
    replyText: args.replyText,
    suggestedAction: args.suggestedAction,
    runResultJson,
  });

  await insertAttempt({
    id: args.judgedAttempt.attempt_id,
    runId: args.runId,
    probeId: args.judgedAttempt.probe_id,
    topicId: args.judgedAttempt.topic_id,
    responseText:
      typeof args.judgedAttempt.raw_response.value === "string"
        ? args.judgedAttempt.raw_response.value
        : null,
    attemptJson,
  });

  await upsertTopicState({
    topicId: args.topic.id,
    lastRunId: args.runId,
    topicLabel: args.topicLabel,
    confusion: args.updatedTopicMetrics.confusion ?? null,
    insight: args.updatedTopicMetrics.insight ?? null,
    learningScore: args.updatedPersistedTopic.learningScore ?? null,
    diagnosis: args.decision.active_diagnosis,
    nextStep: args.nextProbePlan.text_plan.instructional_goal ?? args.topic.nextStep,
    topicJson: args.topicJson,
    topicPosition: args.updatedPersistedTopic.position,
    semanticPosition: args.updatedPersistedTopic.semanticPosition ?? null,
    semanticPositionMethod: args.updatedPersistedTopic.semanticPositionMethod ?? null,
    semanticPositionUpdatedAt:
      args.updatedPersistedTopic.semanticPositionUpdatedAt ?? null,
    ...embeddingFields,
  });
}
