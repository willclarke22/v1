import type { DiagnosisType } from "@/types/contracts";

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function nowIso() {
  return new Date().toISOString();
}

const DIAGNOSIS_TYPES = new Set<DiagnosisType>([
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
]);

export function normalizeDiagnosis(raw: unknown): DiagnosisType | null {
  if (typeof raw !== "string") return null;

  return DIAGNOSIS_TYPES.has(raw as DiagnosisType)
    ? (raw as DiagnosisType)
    : null;
}

export function isPosition(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number")
  );
}

export function normalizeText(text: string) {
  return text.trim().toLowerCase();
}
