import type { Topic } from "@/types/topic";
import type { LearningSpace } from "@/types/contracts";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTopicPosition(topic: Topic): [number, number, number] {
  return topic.position;
}

function buildRenderState(topic: Topic) {
  const learningScore = topic.learningScore ?? 0.5;
  const confusion = topic.confusion ?? 0.3;
  const insight = topic.insight ?? 0.5;
  const mastery = clamp(learningScore, 0, 1);

  return {
    radius: topic.scale ?? 0.7 + mastery * 1.2,
    surface_noise: clamp(confusion, 0, 1),
    spin_rate: 0.002 + (1 - confusion) * 0.003,
    saturation: clamp(0.35 + insight * 0.5, 0.2, 1),
    is_star: mastery > 0.9 && confusion < 0.15,
  };
}

export function buildLearningSpace(topics: Topic[]): LearningSpace {
  return {
    space_version: "v1",
    topics: topics.map((topic) => ({
      topic_id: topic.id,
      topic_name: topic.name,
      position: normalizeTopicPosition(topic),
      render_state: buildRenderState(topic),
      satellite_count: 0,
      satellites: [],
    })),
    clusters: [],
  };
}