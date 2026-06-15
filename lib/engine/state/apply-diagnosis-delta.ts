import type {
  ConfidenceScore,
  DiagnosisLabel,
} from "../schemas";

import {
  clamp01,
  cloneLearningTopicState,
  getNowIso,
  type LearningTopicState,
  type TopicStateUpdateResult,
} from "./learning-topic-state";

const ALL_DIAGNOSIS_LABELS: DiagnosisLabel[] = [
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
];

function isDiagnosisLabel(value: string): value is DiagnosisLabel {
  return ALL_DIAGNOSIS_LABELS.includes(value as DiagnosisLabel);
}

export type ApplyDiagnosisDeltaInput = {
  state: LearningTopicState;

  diagnosis?: DiagnosisLabel | null;
  diagnosis_confidence?: ConfidenceScore | null;

  // Positive delta strengthens a diagnosis belief.
  // Negative delta weakens a diagnosis belief.
  diagnosis_delta?: Partial<Record<DiagnosisLabel, number>> | null;

  summary?: string | null;
  now?: string | null;
};

function applySingleDiagnosisChange(input: {
  state: LearningTopicState;
  diagnosis: DiagnosisLabel;
  delta: number;
  summary?: string | null;
  now: string;
  applied_changes: string[];
}): void {
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    return;
  }

  const previous = input.state.diagnosis_beliefs[input.diagnosis];

  const previousScore = previous?.score ?? 0;
  const previousEvidenceCount = previous?.evidence_count ?? 0;

  const nextScore = clamp01(previousScore + input.delta);

  input.state.diagnosis_beliefs[input.diagnosis] = {
    diagnosis: input.diagnosis,
    score: nextScore,
    evidence_count: previousEvidenceCount + 1,
    last_updated_at: input.now,
    summary: input.summary ?? previous?.summary ?? null,
  };

  input.applied_changes.push(
    `diagnosis:${input.diagnosis}:${previousScore.toFixed(3)}->${nextScore.toFixed(3)}`,
  );
}

export function applyDiagnosisDelta(
  input: ApplyDiagnosisDeltaInput,
): TopicStateUpdateResult {
  const state = cloneLearningTopicState(input.state);
  const applied_changes: string[] = [];
  const warnings: string[] = [];
  const now = getNowIso(input.now);

  if (input.diagnosis) {
    const confidence = typeof input.diagnosis_confidence === "number"
      ? clamp01(input.diagnosis_confidence)
      : 0;

    if (input.diagnosis === "no_gap_detected" && confidence < 0.75) {
      warnings.push(
        "Skipped strong no_gap_detected update because confidence was below 0.75.",
      );
    } else {
      const delta = input.diagnosis === "no_gap_detected"
        ? Math.min(0.12, confidence * 0.12)
        : Math.min(0.2, confidence * 0.2);

      applySingleDiagnosisChange({
        state,
        diagnosis: input.diagnosis,
        delta,
        summary: input.summary,
        now,
        applied_changes,
      });
    }
  }

  if (input.diagnosis_delta) {
    Object.entries(input.diagnosis_delta).forEach(([diagnosis, delta]) => {
      if (!isDiagnosisLabel(diagnosis)) {
        warnings.push(`Ignored unknown diagnosis_delta key: ${diagnosis}`);
        return;
      }

      if (typeof delta !== "number" || !Number.isFinite(delta)) {
        warnings.push(`Ignored non-finite diagnosis_delta for ${diagnosis}`);
        return;
      }

      applySingleDiagnosisChange({
        state,
        diagnosis,
        delta,
        summary: input.summary,
        now,
        applied_changes,
      });
    });
  }

  state.updated_at = now;

  return {
    state,
    applied_changes,
    warnings,
  };
}

