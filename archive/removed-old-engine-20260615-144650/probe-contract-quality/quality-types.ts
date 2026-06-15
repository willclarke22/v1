/**
 * Probe Contract Quality V1
 *
 * This is the first small step toward the Progressive Intelligence Library.
 *
 * A probe contract can be useful immediately without being trusted forever.
 * This quality layer records whether a generated contract is safe to reuse,
 * needs review, or should only be kept for debugging/learning signals.
 */

export const PROBE_CONTRACT_QUALITY_VERSION =
  "probe_contract_quality_v1" as const;

export type ProbeContractQualityVersion =
  typeof PROBE_CONTRACT_QUALITY_VERSION;

export type ProbeContractReuseStatus =
  | "do_not_cache"
  | "cache_for_debug"
  | "cache_as_candidate"
  | "trusted_reusable";

export type ProbeContractReviewPriority =
  | "none"
  | "low"
  | "medium"
  | "high";

export type ProbeContractQualityMissingRequirement =
  | "missing_source_metadata"
  | "missing_generation_metadata"
  | "missing_success_markers"
  | "missing_failure_markers"
  | "missing_misconception_mappings"
  | "missing_input_schema"
  | "missing_renderer_config"
  | "missing_judging_schema"
  | "requires_review"
  | "low_content_confidence"
  | "low_authoring_confidence"
  | "low_pedagogical_confidence"
  | "template_only_source"
  | "no_strong_correctness_claims_allowed"
  | "generic_scaffold_content"
  | "no_grounding_sources";

export type ProbeContractQualityEvaluation = {
  quality_version: ProbeContractQualityVersion;

  /**
   * Overall quality estimate for this contract as a reusable learning object.
   * This is not learner performance. It is contract quality.
   */
  quality_score: number;

  reuse_status: ProbeContractReuseStatus;
  review_priority: ProbeContractReviewPriority;

  /**
   * Useful for future cache/library logic.
   */
  can_be_cached_as_learning_object: boolean;
  safe_to_reuse_without_review: boolean;

  missing_requirements: ProbeContractQualityMissingRequirement[];
  strengths: string[];
  reasons: string[];
  cautions: string[];
};
