// lib/build-learning-space.ts

import type { LearningSpace } from "@/types/contracts";
import type {
  TopicPosition3D,
  TopicPositionSource,
} from "@/lib/learning-space/topic-position";

type LearningSpaceInputTopic = {
  id: string;
  topic_label: string;
  confusion?: number | null;
  insight?: number | null;
  learningScore?: number | null;

  /**
   * Current committed renderer position.
   */
  position: TopicPosition3D;

  /**
   * Optional semantic target position.
   */
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: string | null;
  positionSource?: TopicPositionSource | null;

  scale?: number | null;
  messageCount?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeTopicPosition(topic: LearningSpaceInputTopic): TopicPosition3D {
  return topic.position;
}

function getTopicLabel(topic: LearningSpaceInputTopic) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function buildRenderState(topic: LearningSpaceInputTopic) {
  const learningScore = clamp(topic.learningScore ?? 0.5, 0, 1);
  const confusion = clamp(topic.confusion ?? 0.3, 0, 1);
  const insight = clamp(topic.insight ?? 0.5, 0, 1);
  const baseScale = topic.scale ?? 0.7;

  return {
    radius: round(baseScale + learningScore * 1.2),
    surface_noise: round(confusion),
    spin_rate: round(0.002 + (1 - confusion) * 0.003),
    saturation: round(clamp(0.35 + insight * 0.5, 0.2, 1)),
    is_star: learningScore > 0.9 && confusion < 0.15,
  };
}

function buildSatelliteCount(topic: LearningSpaceInputTopic) {
  const messageCount =
    typeof topic.messageCount === "number" && Number.isFinite(topic.messageCount)
      ? topic.messageCount
      : 0;

  /**
   * Keep this capped for scalability. Later, satellites can represent attempts,
   * not raw message count.
   */
  return Math.min(5, Math.max(0, Math.floor(messageCount)));
}

export function buildLearningSpace(
  topics: LearningSpaceInputTopic[],
): LearningSpace {
  return {
    space_version: "v1",
    topics: topics.map((topic) => {
      const topicLabel = getTopicLabel(topic);
      const satelliteCount = buildSatelliteCount(topic);

      return {
        topic_id: topic.id,
        topic_label: topicLabel,
        position: normalizeTopicPosition(topic),
        layout: {
          position_source: topic.positionSource ?? "topic_position",
          semantic_position: topic.semanticPosition ?? null,
          semantic_position_method: topic.semanticPositionMethod ?? null,
          semantic_position_updated_at: topic.semanticPositionUpdatedAt ?? null,
        },
        render_state: buildRenderState(topic),
        satellite_count: satelliteCount,
        satellites: Array.from({ length: satelliteCount }, (_, index) => ({
          satellite_id: `${topic.id}-sat-${index}`,
          orbit_angle: (index / Math.max(1, satelliteCount)) * Math.PI * 2,
          linked_attempt_id: null,
        })),
      };
    }),
    clusters: [],
  };
}