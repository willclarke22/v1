import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ISO8601String,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type {
  AttemptInterpretation,
  NormalizedEvidenceInput,
} from "@/lib/learning-evaluation/attempt-evidence";

/**
 * Contract Judging V1.5
 *
 * This module defines the shared judgment contract used by:
 * - generic evidence interpretation
 * - deterministic structured judges
 * - cheap local heuristic rubric judges
 * - future LLM/model rubric judges
 * - probe-contract success/failure/misconception markers
 * - probe source/confidence policy
 * - provisional source-grounded scaffold hints
 * - diagnosis-state updates
 *
 * Core idea:
 * A judgment should not only say "correct" or "incorrect." It should say what
 * was judged, how it was judged, how confident the system is, what gap pressure
 * it creates, what resolution evidence it creates, and what claim strength is
 * allowed by the source grounding behind the probe contract.
 */

export const CONTRACT_JUDGING_VERSION = "contract_judging_v1_5" as const;

export type ContractJudgingVersion = typeof CONTRACT_JUDGING_VERSION;

export type ContractJudgmentOutcome =
  | "contract_success"
  | "contract_partial"
  | "contract_failure"
  | "insufficient_evidence"
  | "no_contract";

export type ContractAllowedClaimStrength =
  | "none"
  | "conservative"
  | "moderate"
  | "strong";

export type ContractSourcePolicySnapshot = {
  contract_source: string | null;
  confidence_level: string | null;
  allowed_claim_strength: ContractAllowedClaimStrength;
  content_confidence: number | null;
  authoring_confidence: number | null;
  pedagogical_confidence: number | null;
  requires_review: boolean | null;
  can_make_strong_correctness_claim: boolean;
  can_make_moderate_correctness_claim: boolean;
  should_invite_source_upload: boolean;
  source_policy_reasons: string[];
};

/**
 * Evidence tiers let downstream systems know how much trust to place in a
 * judgment or relationship.
 *
 * This is especially important for relationship lines:
 * - model_only / generic_attempt_interpretation should stay cautious
 * - deterministic_structured_judgment can be trusted more for answer-shape evidence
 * - heuristic_rubric_judgment is useful but should stay conservative
 * - source policy controls how strong correctness claims can be
 * - repeated_judged_pattern can eventually drive stronger visual meaning
 */
export type EvidenceJudgingTier =
  | "model_only"
  | "generic_attempt_interpretation"
  | "contract_marker_estimate"
  | "deterministic_structured_judgment"
  | "heuristic_rubric_judgment"
  | "llm_rubric_judgment"
  | "hybrid_structured_and_rubric_judgment"
  | "repeated_judged_pattern";

/**
 * How the current judgment was produced.
 *
 * Multiple methods may be used in one judgment. For example:
 * - deterministic_multiple_choice + contract_marker_estimate
 * - heuristic_rubric_text + contract_marker_estimate
 * - llm_rubric_text later when a real model judge is added
 */
export type JudgingMethod =
  | "none"
  | "generic_attempt_interpretation"
  | "contract_marker_estimate"
  | "deterministic_multiple_choice"
  | "deterministic_ordering"
  | "deterministic_slider"
  | "deterministic_drag_drop"
  | "deterministic_graph_match"
  | "deterministic_classification"
  | "deterministic_simulation"
  | "heuristic_rubric_text"
  | "heuristic_rubric_audio_transcript"
  | "heuristic_rubric_video_checkpoint"
  | "llm_rubric_text"
  | "llm_rubric_audio_transcript"
  | "llm_rubric_video_checkpoint"
  | "hybrid";

/**
 * Structured correctness is for probe formats where the engine can compare the
 * learner's submitted response to a known contract:
 *
 * - selected option id vs correct option
 * - ordering sequence vs correct positions
 * - slider value vs acceptable range
 * - drag/drop pairs vs correct matches
 * - selected graph edges vs correct edges
 *
 * This is not meant for open-ended semantic interpretation.
 */
export type StructuredJudgmentOutcome =
  | "correct"
  | "partially_correct"
  | "incorrect"
  | "unjudgeable"
  | "not_applicable";

export type StructuredJudgment = {
  method: JudgingMethod;
  outcome: StructuredJudgmentOutcome;

  /**
   * Performance on the structured task itself.
   * Example: 1.0 for correct multiple choice, 0.66 for 2/3 ordering positions.
   */
  performance_score: number;

  /**
   * Confidence in the structured comparison.
   * This is usually high when the submitted shape and contract shape are valid.
   */
  confidence: number;

  /**
   * How many structured items were evaluated.
   */
  item_count: number;

  /**
   * How many structured items were correct.
   */
  correct_count: number;

  /**
   * How many structured items were incorrect.
   */
  incorrect_count: number;

  reasons: string[];
  cautions: string[];
};

/**
 * Source-grounded rubric signal is a provisional, source-aware hint for
 * open-ended responses. It can say whether the response appears to engage the
 * source focus, relationship, or mechanism, but it must not be treated as a
 * reviewed answer key or strong correctness proof.
 */
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

/**
 * Rubric judgments are for open-ended responses where correctness cannot be
 * fully determined by simple comparison.
 *
 * This can be produced by a cheap heuristic judge, an LLM judge, a specialized
 * model, or a human review tool. The important thing is that it still maps back
 * to the same contract success/failure/misconception markers.
 */
export type RubricMarkerScore = {
  marker_id: EntityId | null;
  label: string;
  score: number;
  confidence: number;
  evidence_excerpt: string | null;
  reasons: string[];
};

export type RubricMisconceptionScore = {
  misconception_id: EntityId | null;
  label: string;
  score: number;
  confidence: number;
  evidence_excerpt: string | null;
  reasons: string[];
};

export type RubricJudgment = {
  method: JudgingMethod;

  /**
   * Overall estimated quality of the open-ended response.
   */
  performance_score: number;

  /**
   * Estimated conceptual understanding shown by the open-ended response.
   * This may differ from performance_score when the learner gets an answer
   * right but explains it poorly, or gets close with uncertainty.
   */
  understanding_score: number;

  confidence: number;

  success_marker_scores: RubricMarkerScore[];
  failure_marker_scores: RubricMarkerScore[];
  misconception_scores: RubricMisconceptionScore[];

  /**
   * Provisional source-aware signal, when the probe contract supplied
   * judging_schema.source_grounded_judging_scaffold and the rubric judge could
   * read it. This is not a semantic correctness verdict.
   */
  source_grounded_signal?: SourceGroundedRubricSignal | null;

  reasons: string[];
  cautions: string[];
};

export type ContractMarkerMatch = {
  marker_id: EntityId | null;
  label: string;
  description: string | null;
  match_score: number;
  weight: number;
  required: boolean;
  reasons: string[];
};

export type ContractFailureMatch = {
  marker_id: EntityId | null;
  label: string;
  description: string | null;
  match_score: number;
  severity: number;
  maps_to_diagnosis: DiagnosisType | null;
  diagnosis_delta: DiagnosisDelta;
  reasons: string[];
};

export type ContractMisconceptionMatch = {
  misconception_id: EntityId | null;
  label: string;
  description: string | null;
  likely_diagnosis: DiagnosisType | null;
  match_score: number;
  reasons: string[];
};

export type ContractJudgingInput = {
  attemptInterpretation: AttemptInterpretation;

  /**
   * The normalized submitted evidence. Deterministic and rubric judges inspect
   * this to find the learner's selected option, ordering sequence, slider value,
   * drag/drop matches, graph edge selections, text, etc.
   */
  normalizedEvidence?: NormalizedEvidenceInput | null;

  probeContractSnapshot?: ProbeContractSnapshot | null;
  judgedAt?: ISO8601String | null;
};

export type ContractJudgment = {
  version: ContractJudgingVersion;
  judged_at: ISO8601String;

  contract_id: EntityId | null;
  probe_id: EntityId | null;
  topic_id: EntityId | null;

  outcome: ContractJudgmentOutcome;

  /**
   * Overall confidence in this contract-aware judgment.
   */
  contract_confidence: number;

  /**
   * How much usable evidence was present.
   * This is not the same thing as correctness.
   */
  evidence_strength: number;

  /**
   * Allows downstream diagnosis/relationships/UI to know whether this judgment
   * came from weak scaffold logic, deterministic structured comparison, rubric
   * judging, or a hybrid.
   */
  evidence_tier: EvidenceJudgingTier;

  /**
   * Source policy decides what strength of correctness claim this judgment may
   * support. Example: a generic scaffold can reveal progress without proving
   * strong correctness.
   */
  allowed_claim_strength: ContractAllowedClaimStrength;
  can_make_strong_correctness_claim: boolean;
  source_policy: ContractSourcePolicySnapshot | null;

  /**
   * The methods used to produce this judgment.
   */
  judging_methods: JudgingMethod[];

  success_score: number;
  failure_score: number;
  misconception_score: number;

  success_marker_matches: ContractMarkerMatch[];
  failure_marker_matches: ContractFailureMatch[];
  misconception_matches: ContractMisconceptionMatch[];

  /**
   * Gap-pressure evidence.
   * This says which diagnosis gaps became more plausible.
   */
  diagnosis_delta: DiagnosisDelta;

  /**
   * Resolution evidence.
   * This says which diagnosis gaps became less plausible or more resolved.
   */
  resolution_delta: DiagnosisDelta;

  suggested_active_diagnosis: DiagnosisType | null;

  /**
   * Structured deterministic result, when available.
   */
  structured_judgment: StructuredJudgment | null;

  /**
   * Rubric/model judgment, when available.
   */
  rubric_judgment: RubricJudgment | null;

  /**
   * Pass-through of rubric_judgment.source_grounded_signal for downstream code
   * that should not need to inspect the nested rubric object. This remains a
   * provisional source-awareness hint, not a strong correctness claim.
   */
  source_grounded_signal: SourceGroundedRubricSignal | null;

  reasons: string[];
  cautions: string[];

  /**
   * Original generic evidence interpretation kept for audit/debug.
   */
  evidence_interpretation_snapshot: AttemptInterpretation;
};


