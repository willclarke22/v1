import type {
  AnswerKey,
  MisconceptionMarker,
  ProbeAttemptEvaluatorInput,
  ProbeAttemptEvaluatorOutput,
} from "../../schemas";
import type { EngineProviderResult, ProbeAttemptEvaluatorProvider } from "../types";
import { buildProviderMeta } from "../types";

const PROVIDER_NAME = "deterministic_attempt_evaluator_v1";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function sameStringSet(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameStringRecord(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = Object.keys(right);

  if (keys.length === 0) return false;

  return keys.every((key) => left[key] === right[key]);
}

function countExpectedIdeas(text: string, expectedIdeas: string[] | undefined): {
  matched: number;
  total: number;
} {
  const ideas = expectedIdeas ?? [];
  if (ideas.length === 0) return { matched: 0, total: 0 };

  const matched = ideas.filter((idea) => {
    const normalizedIdea = normalizeText(idea);
    return normalizedIdea.length > 0 && text.includes(normalizedIdea);
  }).length;

  return { matched, total: ideas.length };
}

function scoreWithAnswerKey(input: ProbeAttemptEvaluatorInput): number {
  const { answer_key: answerKey, attempt } = input;

  if (!answerKey) return 0;

  if (answerKey.correct_option_id != null) {
    return attempt.selected_option_id === answerKey.correct_option_id ? 1 : 0;
  }

  if ((answerKey.correct_option_ids ?? []).length > 0) {
    return sameStringSet(attempt.selected_option_ids, answerKey.correct_option_ids) ? 1 : 0;
  }

  if ((answerKey.correct_order ?? []).length > 0) {
    return sameStringSet(attempt.ordered_item_ids, answerKey.correct_order) ? 1 : 0;
  }

  if (answerKey.correct_placements) {
    return sameStringRecord(attempt.placements, answerKey.correct_placements) ? 1 : 0;
  }

  if (answerKey.correct_numeric_range && attempt.numeric_response != null) {
    const { min, max } = answerKey.correct_numeric_range;
    return attempt.numeric_response >= min && attempt.numeric_response <= max ? 1 : 0;
  }

  if ((answerKey.correct_graph_features ?? []).length > 0) {
    return sameStringSet(attempt.graph_features, answerKey.correct_graph_features) ? 1 : 0;
  }

  if (answerKey.correct_click_interval && attempt.selected_click_seconds != null) {
    const { start_seconds: start, end_seconds: end } = answerKey.correct_click_interval;
    return attempt.selected_click_seconds >= start && attempt.selected_click_seconds <= end ? 1 : 0;
  }

  if ((answerKey.expected_ideas ?? []).length > 0) {
    const responseText = normalizeText(
      attempt.text_response ?? attempt.audio_response_transcript,
    );
    const { matched, total } = countExpectedIdeas(responseText, answerKey.expected_ideas);
    return total === 0 ? 0 : matched / total;
  }

  return 0;
}

function findMisconceptionHits(
  attemptText: string,
  markers: MisconceptionMarker[] | undefined,
): ProbeAttemptEvaluatorOutput["misconception_hits"] {
  return (markers ?? [])
    .filter((marker) => {
      const normalizedMarker = normalizeText(marker.marker);
      return normalizedMarker.length > 0 && attemptText.includes(normalizedMarker);
    })
    .map((marker) => ({
      misconception_id: marker.misconception_id,
      confidence: 0.72,
    }));
}

function inferEvidenceStrength(input: ProbeAttemptEvaluatorInput, correctness: number): number {
  if (correctness <= 0) return 0.12;

  switch (input.attempt.attempt_type) {
    case "text":
    case "audio_response":
      return clamp01(0.45 + correctness * 0.45);

    case "numeric":
    case "ordered_items":
    case "drag_drop_placements":
    case "graph":
    case "video_click":
      return clamp01(0.28 + correctness * 0.48);

    case "single_choice":
    case "multi_choice":
      return clamp01(0.2 + correctness * 0.38);

    case "none":
    case "unknown":
    default:
      return clamp01(0.18 + correctness * 0.25);
  }
}

function hasOnlyRecognitionEvidence(input: ProbeAttemptEvaluatorInput): boolean {
  return input.attempt.attempt_type === "single_choice" || input.attempt.attempt_type === "multi_choice";
}

function buildCorrectnessSummary(input: {
  correctness: number;
  answerKey?: AnswerKey | null;
  misconceptionHitCount: number;
}): string {
  if (input.misconceptionHitCount > 0) {
    return "The attempt matched one or more misconception markers.";
  }

  if (!input.answerKey) {
    return "No answer key was provided, so deterministic evaluation could only produce weak evidence.";
  }

  if (input.correctness >= 0.95) {
    return "The attempt matched the deterministic answer key.";
  }

  if (input.correctness > 0) {
    return "The attempt partially matched the deterministic answer key.";
  }

  return "The attempt did not match the deterministic answer key.";
}

export function createDeterministicAttemptEvaluator(): ProbeAttemptEvaluatorProvider {
  return {
    provider_name: PROVIDER_NAME,
    provider_kind: "deterministic_fallback",

    async runAttemptEvaluation(
      input: ProbeAttemptEvaluatorInput,
    ): Promise<EngineProviderResult<ProbeAttemptEvaluatorOutput>> {
      const startedAtMs = Date.now();
      const correctness = clamp01(scoreWithAnswerKey(input));
      const attemptText = normalizeText(
        input.attempt.text_response ?? input.attempt.audio_response_transcript,
      );
      const misconceptionHits = findMisconceptionHits(
        attemptText,
        input.misconception_markers,
      );
      const evidenceStrength = inferEvidenceStrength(input, correctness);
      const mayBeLuckyGuess = correctness >= 0.85 && hasOnlyRecognitionEvidence(input);
      const needsVerificationProbe =
        mayBeLuckyGuess || (correctness >= 0.7 && evidenceStrength < 0.7);

      const output: ProbeAttemptEvaluatorOutput = {
        schema_version: "probe_attempt_evaluator_output_v1",
        correctness,
        correctness_summary: buildCorrectnessSummary({
          correctness,
          answerKey: input.answer_key,
          misconceptionHitCount: misconceptionHits.length,
        }),
        understanding_evidence: {
          evidence_strength: evidenceStrength,
          may_be_lucky_guess: mayBeLuckyGuess,
          needs_verification_probe: needsVerificationProbe,
          verification_reason: needsVerificationProbe
            ? "The answer may be correct, but the attempt does not yet show stable reasoning or transfer."
            : null,
        },
        misconception_hits: misconceptionHits,
        diagnosis_delta:
          misconceptionHits.length > 0 && input.probe.target_diagnosis
            ? { [input.probe.target_diagnosis]: 0.18 }
            : undefined,
        next_action:
          misconceptionHits.length > 0
            ? "target_misconception"
            : needsVerificationProbe
              ? "generate_followup_probe"
              : correctness >= 0.75
                ? "give_feedback"
                : "generate_followup_probe",
        next_action_confidence:
          misconceptionHits.length > 0
            ? 0.78
            : needsVerificationProbe
              ? 0.7
              : correctness >= 0.75
                ? 0.62
                : 0.66,
      };

      return {
        output,
        meta: buildProviderMeta({
          provider_name: PROVIDER_NAME,
          provider_kind: "deterministic_fallback",
          schema_version: output.schema_version,
          started_at_ms: startedAtMs,
          warnings: [
            "Deterministic attempt evaluation is a temporary fallback and should be replaced or verified by a richer evaluator for text-heavy probes.",
          ],
        }),
      };
    },
  };
}

export const deterministicAttemptEvaluator = createDeterministicAttemptEvaluator();
