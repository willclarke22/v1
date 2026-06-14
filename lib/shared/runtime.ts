import type { DiagnosisType } from "@/types/contracts";

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeDiagnosis(raw: unknown): DiagnosisType | null {
  if (
    raw === "recall_gap" ||
    raw === "representation_gap" ||
    raw === "procedure_gap" ||
    raw === "discrimination_gap" ||
    raw === "transfer_gap"
  ) {
    return raw;
  }

  return null;
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