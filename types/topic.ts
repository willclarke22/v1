import type { DiagnosisType, ISO8601String } from "@/types/contracts";

export type Topic = {
  id: string;
  name: string;
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