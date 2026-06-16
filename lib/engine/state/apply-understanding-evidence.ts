import type {
  ConfidenceScore,
  CorrectnessScore,
  MisconceptionMarker,
  UnderstandingEvidence,
} from "../schemas";

import {
  clamp01,
  cloneLearningTopicState,
  getNowIso,
  type LearningTopicState,
  type MisconceptionState,
  type TopicStateUpdateResult,
} from "./learning-topic-state";

export type EvaluatedMisconceptionHit = {
  misconception_id: string;
  label?: string | null;
  confidence: ConfidenceScore;
};

export type ApplyUnderstandingEvidenceInput = {
  state: LearningTopicState;

  correctness: CorrectnessScore;
  correctness_summary?: string | null;
  understanding_evidence: UnderstandingEvidence;

  misconception_hits?: EvaluatedMisconceptionHit[];
  misconception_markers?: MisconceptionMarker[];

  now?: string | null;
};

function getMarkerLabel(
  misconceptionId: string,
  markers?: MisconceptionMarker[],
): string | null {
  return (
    markers?.find((marker) => marker.misconception_id === misconceptionId)?.label ??
    null
  );
}

function updateMisconceptionState(input: {
  previous?: MisconceptionState;
  hit: EvaluatedMisconceptionHit;
  markerLabel?: string | null;
  now: string;
}): MisconceptionState {
  const previousConfidence = input.previous?.confidence ?? 0;
  const nextConfidence = clamp01(
    previousConfidence * 0.65 + clamp01(input.hit.confidence) * 0.35,
  );

  return {
    misconception_id: input.hit.misconception_id,
    label: input.hit.label ?? input.markerLabel ?? input.previous?.label ?? null,
    confidence: nextConfidence,
    evidence_count: (input.previous?.evidence_count ?? 0) + 1,
    last_seen_at: input.now,
  };
}

export function applyUnderstandingEvidence(
  input: ApplyUnderstandingEvidenceInput,
): TopicStateUpdateResult {
  const state = cloneLearningTopicState(input.state);
  const applied_changes: string[] = [];
  const warnings: string[] = [];
  const now = getNowIso(input.now);

  const correctness = clamp01(input.correctness);
  const evidenceStrength = clamp01(input.understanding_evidence.evidence_strength);

  const previousScore = state.understanding.score;
  const possibleGuess =
    input.understanding_evidence.may_be_lucky_guess ||
    input.understanding_evidence.possible_guess === true;
  const needsVerification =
    input.understanding_evidence.needs_verification_probe || possibleGuess;

  // Correctness alone is not stable understanding.
  // Evidence strength carries more weight than correctness.
  const candidateScore = clamp01(correctness * 0.35 + evidenceStrength * 0.65);
  const nextScore = clamp01(previousScore * 0.7 + candidateScore * 0.3);

  state.understanding = {
    ...state.understanding,
    score: nextScore,
    evidence_count: state.understanding.evidence_count + 1,
    last_correctness: correctness,
    last_evidence_strength: evidenceStrength,
    may_be_lucky_guess: possibleGuess,
    needs_verification_probe: needsVerification,
    verification_reason: input.understanding_evidence.verification_reason ?? null,
    last_updated_at: now,
  };

  applied_changes.push(
    `understanding:${previousScore.toFixed(3)}->${nextScore.toFixed(3)}`,
  );

  if (needsVerification) {
    state.verification = {
      pending: true,
      reason: input.understanding_evidence.verification_reason ?? null,
      source: possibleGuess
        ? "lucky_guess"
        : "partial_success",
      last_requested_at: now,
    };

    applied_changes.push("verification:pending");
  } else if (correctness >= 0.9 && evidenceStrength >= 0.75) {
    state.verification = {
      ...state.verification,
      pending: false,
      reason: null,
      source: null,
    };

    applied_changes.push("verification:cleared");
  }

  const hits = input.misconception_hits ?? [];

  hits.forEach((hit) => {
    if (!hit.misconception_id || !Number.isFinite(hit.confidence)) {
      warnings.push("Ignored malformed misconception hit.");
      return;
    }

    const previous = state.misconceptions[hit.misconception_id];
    const markerLabel = getMarkerLabel(hit.misconception_id, input.misconception_markers);

    state.misconceptions[hit.misconception_id] = updateMisconceptionState({
      previous,
      hit,
      markerLabel,
      now,
    });

    applied_changes.push(`misconception:${hit.misconception_id}:updated`);
  });

  state.updated_at = now;

  return {
    state,
    applied_changes,
    warnings,
  };
}


