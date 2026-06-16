import type { RouteTopic } from "@/lib/topic-routing/route-topics";
import {
  applyMetricUpdate,
  buildTopicMetricUpdate,
  type scoreResponse,
} from "@/lib/learning-evaluation/attempt-judging";

/**
 * Probe-submit topic metric update.
 *
 * No V1.1 engine changes are needed here yet. ContractJudgment affects
 * diagnosis persistence and decision metadata first; the old topic metric update
 * stays route-scoring based until we intentionally recalibrate confusion,
 * insight, and learningScore from structured/rubric judgments.
 */
export function buildUpdatedTopicsAfterProbeSubmit(args: {
  routeTopics: RouteTopic[];
  topicId: string;
  scoring: ReturnType<typeof scoreResponse>;
}) {
  const updatedTopicMetrics = buildTopicMetricUpdate(args.topicId, args.scoring);
  const updatedTopics = args.routeTopics.map((topic) =>
    applyMetricUpdate(topic, updatedTopicMetrics),
  );

  return {
    updatedTopicMetrics,
    updatedTopics,
  };
}
