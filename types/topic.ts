import type { DiagnosisType, ISO8601String } from "@/types/contracts";
import type {
  TopicPosition3D,
  TopicPositionSource,
} from "@/lib/learning-space/topic-position";

export type Topic = {
  id: string;
  topic_label: string;
  diagnosis: DiagnosisType;
  nextStep: string;
  confusion: number;
  insight: number;
  learningScore: number;

  /**
   * Current committed renderer position.
   * This should correspond to topic_position_x/y/z when persisted.
   */
  position: TopicPosition3D;

  /**
   * Optional semantic target position.
   * This should correspond to semantic_position_x/y/z when available.
   */
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: ISO8601String | null;
  positionSource?: TopicPositionSource;

  scale?: number;
  messageCount?: number;
  lastUpdated?: ISO8601String | null;
  hasAvailableProbe?: boolean;
};

export function getTopicLabel(topic: Pick<Topic, "topic_label">): string {
  return topic.topic_label || "Untitled Topic";
}