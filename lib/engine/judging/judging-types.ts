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
} from "@/lib/engine/evidence";

/**
 * Contract Judging V1.1
 *
 * This module is the bridge between:
 * - generic evidence interpretation
 * - normalized learner evidence
 * - deterministic structured judging
 * - future rubric/model judging
 * - Probe Contract V1 success/failure markers
 * - diagnosis-state updates
 *
 * Core idea:
 * A judgment should not only say "correct" or "incorrect."
 * It should say what kind of evidence was judged, how it was judged, how
 * confident the system is, what gap pressure it creates, and what resolution
 * evidence it creates.
 */

export const CONTRACT_JUDGING_VERSION = "contract_judging_v1_1" as const;

export type ContractJudgingVersion = typeof CONTRACT_JUDGING_VERSION;

export type ContractJudgmentOutcome =
  | "contract_success"
  | "contract_partial"
  | "contract_failure"
  | "insufficient_evidence"
  | "no_contract";

/**
 * Evidence tiers let downstream systems know how much trust to place in a
 * judgment or relationship.
 *
 * This is especially important for relationship lines:
 * - model_only / generic_attempt_interpretation should stay cautious
 * - deterministic_structured_judgment can be trusted more for correctness
 * - repeated_judged_pattern can eventually drive stronger visual meaning
 */
export type EvidenceJudgingTier =
  | "model_only"
  | "generic_attempt_interpretation"
  | "contract_marker_estimate"
  | "deterministic_structured_judgment"
  | "llm_rubric_judgment"
  | "hybrid_structured_and_rubric_judgment"
  | "repeated_judged_pattern";

/**
 * How the current judgment was produced.
 *
 * Multiple methods may be used in one judgment. For example:
 * - deterministic_multiple_choice + llm_rubric_text
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
 * Rubric judgments are for open-ended responses where correctness cannot be
 * fully determined by simple comparison.
 *
 * This can later be produced by an LLM judge, a specialized model, or a human
 * review tool. The important thing is that it still maps back to the same
 * contract success/failure/misconception markers.
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
   * New in V1.1.
   *
   * The previous judge only received AttemptInterpretation, which meant it
   * could not inspect the learner's actual submitted text, selected option,
   * ordering sequence, slider value, drag/drop matches, etc.
   *
   * This optional field lets deterministic and rubric judges inspect the real
   * submitted evidence while preserving backward compatibility.
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
   * New in V1.1.
   *
   * Allows downstream diagnosis/relationships/UI to know whether this judgment
   * came from weak scaffold logic, deterministic structured comparison, rubric
   * judging, or a hybrid.
   */
  evidence_tier: EvidenceJudgingTier;

  /**
   * New in V1.1.
   *
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
   *
   * The current diagnosis updater may not use this yet, but adding the field now
   * makes room for the next diagnosis upgrade.
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

  reasons: string[];
  cautions: string[];

  /**
   * Original generic evidence interpretation kept for audit/debug.
   */
  evidence_interpretation_snapshot: AttemptInterpretation;
};