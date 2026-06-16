import type {
  DiagnosisLabel,
  DiagnosisModelInput,
  DiagnosisModelOutput,
} from "../../schemas";
import type { DiagnosisModelProvider, EngineProviderResult } from "../types";
import { buildProviderMeta } from "../types";

const PROVIDER_NAME = "rule_based_diagnosis_provider_v1";

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function inferDiagnosisFromText(text: string): {
  diagnosis: DiagnosisLabel;
  confidence: number;
  suggested_question?: string | null;
} {
  if (!text || text.length < 8) {
    return {
      diagnosis: "unknown",
      confidence: 0.38,
      suggested_question: "What part feels confusing right now?",
    };
  }

  if (
    includesAny(text, ["don't get it", "dont get it", "do not get it", "confused", "lost"]) &&
    text.length < 80
  ) {
    return {
      diagnosis: "unknown",
      confidence: 0.46,
      suggested_question: "What topic or step are you stuck on?",
    };
  }

  if (includesAny(text, ["difference between", "tell apart", "confuse", "confusing", " vs ", "versus"])) {
    return { diagnosis: "discrimination_gap", confidence: 0.66 };
  }

  if (includesAny(text, ["step", "steps", "procedure", "solve", "calculate", "formula", "equation", "method"])) {
    return { diagnosis: "procedure_gap", confidence: 0.62 };
  }

  if (includesAny(text, ["apply", "transfer", "new situation", "new problem", "real world", "use it in"])) {
    return { diagnosis: "transfer_gap", confidence: 0.6 };
  }

  if (includesAny(text, ["strategy", "approach", "how to start", "where to start", "check my work"])) {
    return { diagnosis: "metacognitive_gap", confidence: 0.59 };
  }

  if (includesAny(text, ["what is", "define", "definition", "remember", "memorize", "fact", "term means"])) {
    return { diagnosis: "recall_gap", confidence: 0.58 };
  }

  if (includesAny(text, ["why", "meaning", "intuition", "picture", "mental model", "concept", "understand"])) {
    return { diagnosis: "representation_gap", confidence: 0.57 };
  }

  return {
    diagnosis: "unknown",
    confidence: 0.42,
    suggested_question: "What would you like MyWay to check or repair first?",
  };
}

function diagnoseEvaluatedProbeAttempt(
  input: DiagnosisModelInput,
): DiagnosisModelOutput {
  const signal = input.evaluated_probe_attempt;

  if (!signal) {
    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: "unknown",
      diagnosis_confidence: 0.3,
      next_action: "ask_clarifying_question",
      next_action_confidence: 0.55,
      suggested_question: "Can you try that again in your own words?",
    };
  }

  const correctness = signal.evaluation.correctness;
  const evidenceStrength = signal.evaluation.understanding_evidence.evidence_strength;
  const targetDiagnosis = signal.probe.target_diagnosis ?? "unknown";
  const needsVerification =
    signal.evaluation.understanding_evidence.may_be_lucky_guess ||
    signal.evaluation.understanding_evidence.needs_verification_probe;
  const hasMisconception = (signal.evaluation.misconception_hits ?? []).length > 0;

  if (hasMisconception) {
    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: targetDiagnosis,
      diagnosis_confidence: Math.max(0.58, Math.min(0.82, evidenceStrength + 0.15)),
      next_action: "generate_probe_contract",
      next_action_confidence: 0.78,
      suggested_question: null,
    };
  }

  if (correctness >= 0.85 && needsVerification) {
    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: targetDiagnosis,
      diagnosis_confidence: 0.52,
      next_action: "generate_probe_contract",
      next_action_confidence: 0.72,
      suggested_question: null,
    };
  }

  if (correctness >= 0.85 && evidenceStrength >= 0.75) {
    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: "no_gap_detected",
      diagnosis_confidence: 0.56,
      next_action: "give_feedback",
      next_action_confidence: 0.64,
      suggested_question: null,
    };
  }

  if (correctness >= 0.45) {
    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis: targetDiagnosis,
      diagnosis_confidence: 0.57,
      next_action: "give_feedback",
      next_action_confidence: 0.64,
      suggested_question: null,
    };
  }

  return {
    schema_version: "diagnosis_model_output_v1",
    diagnosis: targetDiagnosis,
    diagnosis_confidence: 0.64,
    next_action: "generate_probe_contract",
    next_action_confidence: 0.74,
    suggested_question: null,
  };
}

export function createRuleBasedDiagnosisProvider(): DiagnosisModelProvider {
  return {
    provider_name: PROVIDER_NAME,
    provider_kind: "rule_based_fallback",

    async runDiagnosis(
      input: DiagnosisModelInput,
    ): Promise<EngineProviderResult<DiagnosisModelOutput>> {
      const startedAtMs = Date.now();

      const output: DiagnosisModelOutput =
        input.input_kind === "evaluated_probe_attempt"
          ? diagnoseEvaluatedProbeAttempt(input)
          : (() => {
              const text = normalizeText(input.user_message?.text);
              const inferred = inferDiagnosisFromText(text);

              return {
                schema_version: "diagnosis_model_output_v1" as const,
                diagnosis: inferred.diagnosis,
                diagnosis_confidence: inferred.confidence,
                next_action:
                  inferred.diagnosis === "unknown"
                    ? "ask_clarifying_question"
                    : "generate_probe_contract",
                next_action_confidence:
                  inferred.diagnosis === "unknown" ? 0.68 : 0.62,
                suggested_question: inferred.suggested_question ?? null,
              };
            })();

      return {
        output,
        meta: buildProviderMeta({
          provider_name: PROVIDER_NAME,
          provider_kind: "rule_based_fallback",
          schema_version: output.schema_version,
          started_at_ms: startedAtMs,
          warnings: [
            "Rule-based diagnosis is a temporary fallback. Treat confidence as conservative.",
          ],
        }),
      };
    },
  };
}

export const ruleBasedDiagnosisProvider = createRuleBasedDiagnosisProvider();

