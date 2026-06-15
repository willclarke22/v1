import type {
  ContractJudgingInput,
  RubricJudgment,
} from "@/lib/learning-evaluation/contract-judgment/judging-types";

/**
 * Rubric Judging V1
 *
 * This layer is for open-ended learner responses where deterministic comparison
 * is not enough. The first implementation is intentionally cheap and local:
 * it uses normalized text, attempt interpretation features, contract markers,
 * and provisional source-grounded scaffold hints when a contract provides them.
 * It does not call an LLM yet.
 *
 * Important invariant:
 * source_grounded_signal is a cautious evidence hint. It is not a reviewed
 * answer key, it must not upgrade claim strength, and it must not be treated as
 * strong semantic correctness proof.
 */

export const RUBRIC_JUDGING_VERSION = "rubric_judging_v1" as const;

export type RubricJudgingVersion = typeof RUBRIC_JUDGING_VERSION;

export type TextRubricJudgingInput = ContractJudgingInput;

export type SourceGroundedRubricSignal = {
  scaffold_available: boolean;
  scaffold_is_provisional: boolean;
  used_source_focus: boolean;
  addressed_relationship_or_mechanism: boolean;
  possible_surface_word_match: boolean;
  possible_overclaim: boolean;
  source_focus_overlap_score: number;
  relationship_overlap_score: number;
  mechanism_language_score: number;
  confidence: number;
  source_terms_used: string[];
  relationship_terms_used: string[];
  evidence_excerpt: string | null;
  reasons: string[];
  cautions: string[];
};

export type TextRubricSignalSummary = {
  word_count: number;
  unique_word_count: number;
  marker_overlap_score: number;
  length_score: number;
  interpretation_quality_score: number;
  explanation_shape_score: number;
  source_grounded_signal: SourceGroundedRubricSignal | null;
  confidence: number;
};

/**
 * Keep this as an extension instead of editing the shared RubricJudgment core
 * type yet. That lets Source-Grounded Attempt Judging V1 stay narrow: the text
 * rubric can emit the new signal, while the broader judged-attempt contract can
 * decide later whether to promote this field into the canonical judgment type.
 */
export type TextRubricJudgment = RubricJudgment & {
  source_grounded_signal?: SourceGroundedRubricSignal | null;
};

export type TextRubricJudgingResult = {
  rubric_judgment: TextRubricJudgment;
  signal_summary: TextRubricSignalSummary;
};


