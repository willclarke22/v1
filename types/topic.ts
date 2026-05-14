import type { DiagnosisType, ISO8601String } from "@/types/contracts";

export type Topic = {
  id: string;

  /**
   * Canonical learner-facing concept label.
   * This is the field new MyWay contracts should prefer.
   */
  topic_label: string;

  /**
   * UI-friendly alias for topic_label. Kept so older components can migrate gradually.
   */
  label?: string;

  /**
   * @deprecated Use topic_label instead. Kept temporarily for existing UI code.
   */
  name?: string;

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

export function getTopicLabel(topic: Pick<Topic, "topic_label" | "label" | "name">): string {
  return topic.topic_label || topic.label || topic.name || "Untitled Topic";
}
