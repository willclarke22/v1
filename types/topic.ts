import type { DiagnosisType, ISO8601String } from "@/types/contracts";

export type Topic = {
  id: string;
  topic_label: string;
  diagnosis: DiagnosisType;
  nextStep: string;
  confusion: number;
  insight: number;
  learningScore: number;
  position: [number, number, number];
  scale?: number;
  messageCount?: number;
  lastUpdated?: ISO8601String | null;
  hasAvailableProbe?: boolean;
};

export function getTopicLabel(topic: Pick<Topic, "topic_label">): string {
  return topic.topic_label || "Untitled Topic";
}
