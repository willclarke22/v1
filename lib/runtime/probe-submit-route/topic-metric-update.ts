import type { RouteTopic } from "@/lib/runtime/route-topics";
import {
  applyMetricUpdate,
  buildTopicMetricUpdate,
  type scoreResponse,
} from "@/lib/runtime/attempt-judging";

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
