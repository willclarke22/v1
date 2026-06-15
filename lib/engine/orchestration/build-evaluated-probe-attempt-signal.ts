import type {
  EvaluatedProbeAttemptSignal,
  ProbeAttemptEvaluatorOutput,
  ProbeAttemptType,
  ProbePrompt,
  ProbeType,
  DiagnosisLabel,
} from "../schemas";

export type BuildEvaluatedProbeAttemptSignalInput = {
  probe: {
    probe_type: ProbeType;
    expected_attempt_type: ProbeAttemptType;
    prompt: ProbePrompt;
    target_diagnosis?: DiagnosisLabel | null;
  };

  attempt: {
    attempt_type: ProbeAttemptType;
    response_summary?: string | null;
  };

  evaluation: ProbeAttemptEvaluatorOutput;
};

export function buildEvaluatedProbeAttemptSignal(
  input: BuildEvaluatedProbeAttemptSignalInput,
): EvaluatedProbeAttemptSignal {
  return {
    probe: {
      probe_type: input.probe.probe_type,
      expected_attempt_type: input.probe.expected_attempt_type,
      prompt: input.probe.prompt,
      target_diagnosis: input.probe.target_diagnosis ?? null,
    },
    attempt: {
      attempt_type: input.attempt.attempt_type,
      response_summary: input.attempt.response_summary ?? null,
    },
    evaluation: {
      correctness: input.evaluation.correctness,
      correctness_summary: input.evaluation.correctness_summary,
      understanding_evidence: input.evaluation.understanding_evidence,
      misconception_hits: input.evaluation.misconception_hits.map((hit) => ({
        misconception_id: hit.misconception_id,
        confidence: hit.confidence,
      })),
      next_action: input.evaluation.next_action,
      personalization_delta: input.evaluation.personalization_delta ?? null,
    },
  };
}

