import type { Topic } from "@/types/topic";

export type ProgressSummary = {
  totalTopics: number;
  averageConfusion: number;
  averageInsight: number;
  averageLearningScore: number;
  focusedTopicLabel: string | null;
  strongestTopicLabel: string | null;
  needsAttentionTopicLabel: string | null;

  /**
   * Confusion/insight are worker-backed model signals. New topics can briefly
   * carry provisional fallback values before the local worker scores them.
   *
   * These counts let the UI explain whether progress metrics are fully
   * model-backed or still waiting on background scoring.
   */
  modelReadySignalTopics: number;
  pendingSignalTopics: number;
  provisionalSignalTopics: number;
  signalMetricTopicCount: number;
  signalMetricScope: "model_ready" | "all_topics_fallback" | "empty";
};

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function isModelReadySignalTopic(topic: Topic) {
  return topic.confusionInsightStatus?.hasModelScore === true;
}

function isPendingSignalTopic(topic: Topic) {
  return topic.confusionInsightStatus?.isPending === true;
}

function getSignalMetricTopics(topics: Topic[]) {
  const modelReadyTopics = topics.filter(isModelReadySignalTopic);

  /**
   * Prefer model-backed confusion/insight values. During early startup or before
   * the worker has processed any topic, fall back to all topics so the progress
   * tab remains populated instead of showing zeros.
   */
  return modelReadyTopics.length > 0 ? modelReadyTopics : topics;
}

function sumTopicSignals(topics: Topic[]) {
  return topics.reduce(
    (acc, topic) => {
      acc.confusion += topic.confusion ?? 0;
      acc.insight += topic.insight ?? 0;
      acc.learningScore += topic.learningScore ?? 0;
      return acc;
    },
    { confusion: 0, insight: 0, learningScore: 0 },
  );
}

function topicAttentionPriority(topic: Topic) {
  /**
   * If the topic is still waiting for a real confusion/insight model score, do
   * not let provisional fallback values make it look like the highest-priority
   * topic. It can become attention-worthy once the worker-backed signal arrives.
   */
  const provisionalPenalty = isPendingSignalTopic(topic) ? 0.35 : 0;

  return (
    topic.confusion -
    topic.learningScore -
    topic.insight * 0.25 -
    provisionalPenalty
  );
}

export function deriveProgressSummary(
  topics: Topic[],
  focusedTopicId: string | null,
): ProgressSummary {
  if (!topics.length) {
    return {
      totalTopics: 0,
      averageConfusion: 0,
      averageInsight: 0,
      averageLearningScore: 0,
      focusedTopicLabel: null,
      strongestTopicLabel: null,
      needsAttentionTopicLabel: null,
      modelReadySignalTopics: 0,
      pendingSignalTopics: 0,
      provisionalSignalTopics: 0,
      signalMetricTopicCount: 0,
      signalMetricScope: "empty",
    };
  }

  const modelReadySignalTopics = topics.filter(isModelReadySignalTopic).length;
  const pendingSignalTopics = topics.filter(isPendingSignalTopic).length;
  const provisionalSignalTopics = Math.max(
    0,
    topics.length - modelReadySignalTopics,
  );

  const signalMetricTopics = getSignalMetricTopics(topics);
  const signalTotals = sumTopicSignals(signalMetricTopics);
  const allTopicTotals = sumTopicSignals(topics);

  const strongestTopic = topics.reduce((best, current) => {
    if (!best) return current;
    return current.learningScore > best.learningScore ? current : best;
  }, topics[0]);

  const needsAttentionTopic = topics.reduce((mostNeedsAttention, current) => {
    if (!mostNeedsAttention) return current;

    return topicAttentionPriority(current) >
      topicAttentionPriority(mostNeedsAttention)
      ? current
      : mostNeedsAttention;
  }, topics[0]);

  const focusedTopic =
    (focusedTopicId
      ? topics.find((topic) => topic.id === focusedTopicId)
      : null) ?? null;

  return {
    totalTopics: topics.length,
    averageConfusion: roundToTwo(
      signalTotals.confusion / signalMetricTopics.length,
    ),
    averageInsight: roundToTwo(signalTotals.insight / signalMetricTopics.length),
    averageLearningScore: roundToTwo(allTopicTotals.learningScore / topics.length),
    focusedTopicLabel: focusedTopic?.topic_label ?? null,
    strongestTopicLabel: strongestTopic?.topic_label ?? null,
    needsAttentionTopicLabel: needsAttentionTopic?.topic_label ?? null,
    modelReadySignalTopics,
    pendingSignalTopics,
    provisionalSignalTopics,
    signalMetricTopicCount: signalMetricTopics.length,
    signalMetricScope:
      modelReadySignalTopics > 0 ? "model_ready" : "all_topics_fallback",
  };
}
