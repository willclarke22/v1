import type { Topic } from "@/types/topic";

export type ProgressSummary = {
  totalTopics: number;
  averageConfusion: number;
  averageInsight: number;
  averageLearningScore: number;
  focusedTopicName: string | null;
  strongestTopicName: string | null;
  needsAttentionTopicName: string | null;
};

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function deriveProgressSummary(
  topics: Topic[],
  focusedTopicId: string | null
): ProgressSummary {
  if (!topics.length) {
    return {
      totalTopics: 0,
      averageConfusion: 0,
      averageInsight: 0,
      averageLearningScore: 0,
      focusedTopicName: null,
      strongestTopicName: null,
      needsAttentionTopicName: null,
    };
  }

  const totals = topics.reduce(
    (acc, topic) => {
      acc.confusion += topic.confusion ?? 0;
      acc.insight += topic.insight ?? 0;
      acc.learningScore += topic.learningScore ?? 0;
      return acc;
    },
    { confusion: 0, insight: 0, learningScore: 0 }
  );

  const strongestTopic = topics.reduce((best, current) => {
    if (!best) return current;
    return current.learningScore > best.learningScore ? current : best;
  }, topics[0]);

  const needsAttentionTopic = topics.reduce((mostNeedsAttention, current) => {
    if (!mostNeedsAttention) return current;

    const currentPriority =
      current.confusion - current.learningScore - current.insight * 0.25;
    const existingPriority =
      mostNeedsAttention.confusion -
      mostNeedsAttention.learningScore -
      mostNeedsAttention.insight * 0.25;

    return currentPriority > existingPriority ? current : mostNeedsAttention;
  }, topics[0]);

  const focusedTopic =
    (focusedTopicId
      ? topics.find((topic) => topic.id === focusedTopicId)
      : null) ?? null;

  return {
    totalTopics: topics.length,
    averageConfusion: roundToTwo(totals.confusion / topics.length),
    averageInsight: roundToTwo(totals.insight / topics.length),
    averageLearningScore: roundToTwo(totals.learningScore / topics.length),
    focusedTopicName: focusedTopic?.name ?? null,
    strongestTopicName: strongestTopic?.name ?? null,
    needsAttentionTopicName: needsAttentionTopic?.name ?? null,
  };
}