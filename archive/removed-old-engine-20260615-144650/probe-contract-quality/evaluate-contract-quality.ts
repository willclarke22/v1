import type {
  ProbeContract,
  ProbeContractSourceMetadata,
} from "@/archive/old-engine/probes/probe-types";
import {
  PROBE_CONTRACT_QUALITY_VERSION,
  type ProbeContractQualityEvaluation,
  type ProbeContractQualityMissingRequirement,
  type ProbeContractReuseStatus,
  type ProbeContractReviewPriority,
} from "./quality-types";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function scoreBool(value: boolean, points: number) {
  return value ? points : 0;
}

function hasItems<T>(value: T[] | null | undefined) {
  return Array.isArray(value) && value.length > 0;
}

function getSourceMetadata(contract: ProbeContract): ProbeContractSourceMetadata | null {
  return contract.source_metadata ?? null;
}

function baseCompletenessScore(contract: ProbeContract) {
  const judging = contract.judging_schema;

  return clamp01(
    scoreBool(Boolean(contract.input_schema), 0.12) +
      scoreBool(Boolean(contract.renderer_config), 0.1) +
      scoreBool(Boolean(judging), 0.1) +
      scoreBool(hasItems(judging?.success_markers), 0.14) +
      scoreBool(hasItems(judging?.failure_markers), 0.14) +
      scoreBool(hasItems(judging?.misconception_mappings), 0.08) +
      scoreBool(Boolean(contract.generation_metadata), 0.08) +
      scoreBool(Boolean(contract.source_metadata), 0.12) +
      scoreBool(Boolean(contract.renderer_kind), 0.06) +
      scoreBool(Boolean(contract.assessment_target), 0.06),
  );
}

function sourceScore(source: ProbeContractSourceMetadata | null) {
  if (!source) return 0.1;

  const authoring = clamp01(source.authoring_confidence);
  const content = clamp01(source.content_confidence);
  const pedagogical = clamp01(source.pedagogical_confidence);

  const confidenceScore = authoring * 0.28 + content * 0.44 + pedagogical * 0.28;

  const sourceAuthority =
    source.contract_source === "human_reviewed_library"
      ? 0.18
      : source.contract_source === "uploaded_source" ||
          source.contract_source === "trusted_public_source"
        ? 0.12
        : source.contract_source === "cached_generated"
          ? 0.06
          : source.contract_source === "llm_general_prior"
            ? 0.02
            : 0;

  const reviewPenalty = source.requires_review ? 0.14 : 0;
  const groundingBonus = hasItems(source.grounding_source_ids) || hasItems(source.source_refs)
    ? 0.08
    : 0;

  return clamp01(confidenceScore + sourceAuthority + groundingBonus - reviewPenalty);
}

function judgingSupportScore(contract: ProbeContract) {
  const judging = contract.judging_schema;
  const source = getSourceMetadata(contract);
  const deterministic = judging.deterministic_judging_available === true;
  const expectedTier = judging.expected_evidence_tier ?? null;

  const methodScore = hasItems(judging.expected_judging_methods)
    ? 0.14
    : 0.04;

  const tierScore =
    expectedTier === "deterministic_structured_judgment"
      ? 0.2
      : expectedTier === "heuristic_rubric_judgment"
        ? 0.12
        : expectedTier === "contract_marker_estimate"
          ? 0.06
          : 0.04;

  const sourceClaimBonus =
    source?.can_make_strong_correctness_claim === true
      ? 0.18
      : source?.can_make_moderate_correctness_claim === true
        ? 0.1
        : 0;

  return clamp01(
    scoreBool(deterministic, 0.16) +
      methodScore +
      tierScore +
      scoreBool(judging.allow_partial_credit, 0.04) +
      sourceClaimBonus,
  );
}

function collectMissingRequirements(
  contract: ProbeContract,
): ProbeContractQualityMissingRequirement[] {
  const missing: ProbeContractQualityMissingRequirement[] = [];
  const source = getSourceMetadata(contract);
  const judging = contract.judging_schema;

  if (!source) missing.push("missing_source_metadata");
  if (!contract.generation_metadata) missing.push("missing_generation_metadata");
  if (!contract.input_schema) missing.push("missing_input_schema");
  if (!contract.renderer_config) missing.push("missing_renderer_config");
  if (!judging) missing.push("missing_judging_schema");

  if (!hasItems(judging?.success_markers)) {
    missing.push("missing_success_markers");
  }

  if (!hasItems(judging?.failure_markers)) {
    missing.push("missing_failure_markers");
  }

  if (!hasItems(judging?.misconception_mappings)) {
    missing.push("missing_misconception_mappings");
  }

  if (source?.requires_review) missing.push("requires_review");

  if ((source?.content_confidence ?? 0) < 0.55) {
    missing.push("low_content_confidence");
  }

  if ((source?.authoring_confidence ?? 0) < 0.55) {
    missing.push("low_authoring_confidence");
  }

  if ((source?.pedagogical_confidence ?? 0) < 0.55) {
    missing.push("low_pedagogical_confidence");
  }

  if (source?.contract_source === "template_only") {
    missing.push("template_only_source");
  }

  if (source?.can_make_strong_correctness_claim !== true) {
    missing.push("no_strong_correctness_claims_allowed");
  }

  if (contract.generation_metadata?.generation_mode === "generic_scaffold") {
    missing.push("generic_scaffold_content");
  }

  if (
    !hasItems(source?.grounding_source_ids) &&
    !hasItems(source?.source_refs) &&
    !hasItems(contract.generation_metadata?.source_content_ids) &&
    !hasItems(contract.generation_metadata?.source_topic_ids)
  ) {
    missing.push("no_grounding_sources");
  }

  return [...new Set(missing)];
}

function deriveReuseStatus(args: {
  qualityScore: number;
  source: ProbeContractSourceMetadata | null;
  missing: ProbeContractQualityMissingRequirement[];
}): ProbeContractReuseStatus {
  if (!args.source) return "cache_for_debug";

  if (
    args.qualityScore >= 0.82 &&
    args.source.can_make_strong_correctness_claim === true &&
    !args.source.requires_review
  ) {
    return "trusted_reusable";
  }

  if (
    args.qualityScore >= 0.58 &&
    args.source.can_make_moderate_correctness_claim === true &&
    !args.missing.includes("missing_success_markers") &&
    !args.missing.includes("missing_failure_markers")
  ) {
    return "cache_as_candidate";
  }

  if (args.qualityScore >= 0.28) return "cache_for_debug";

  return "do_not_cache";
}

function deriveReviewPriority(args: {
  source: ProbeContractSourceMetadata | null;
  missing: ProbeContractQualityMissingRequirement[];
  reuseStatus: ProbeContractReuseStatus;
}): ProbeContractReviewPriority {
  if (args.reuseStatus === "trusted_reusable") return "none";

  if (
    args.missing.includes("missing_success_markers") ||
    args.missing.includes("missing_failure_markers") ||
    args.missing.includes("missing_input_schema")
  ) {
    return "high";
  }

  if (
    args.source?.requires_review ||
    args.missing.includes("template_only_source") ||
    args.missing.includes("no_grounding_sources")
  ) {
    return "medium";
  }

  if (args.reuseStatus === "cache_as_candidate") return "low";

  return "medium";
}

function collectStrengths(contract: ProbeContract) {
  const strengths: string[] = [];
  const source = getSourceMetadata(contract);
  const judging = contract.judging_schema;

  if (hasItems(judging.success_markers)) {
    strengths.push("Contract includes success markers.");
  }

  if (hasItems(judging.failure_markers)) {
    strengths.push("Contract includes failure markers mapped to diagnosis deltas.");
  }

  if (hasItems(judging.misconception_mappings)) {
    strengths.push("Contract includes misconception mapping scaffolds.");
  }

  if (judging.deterministic_judging_available) {
    strengths.push("Renderer supports deterministic answer-shape judging.");
  }

  if (source?.can_make_moderate_correctness_claim) {
    strengths.push("Source policy allows at least moderate correctness claims.");
  }

  if (source?.can_make_strong_correctness_claim) {
    strengths.push("Source policy allows strong correctness claims.");
  }

  if (contract.personalization_application) {
    strengths.push("Contract records personalization application.");
  }

  return strengths;
}

export function evaluateContractQuality(
  contract: ProbeContract,
): ProbeContractQualityEvaluation {
  const source = getSourceMetadata(contract);
  const completeness = baseCompletenessScore(contract);
  const sourceAuthority = sourceScore(source);
  const judgingSupport = judgingSupportScore(contract);

  const qualityScore = clamp01(
    completeness * 0.38 + sourceAuthority * 0.38 + judgingSupport * 0.24,
  );

  const missing = collectMissingRequirements(contract);
  const reuseStatus = deriveReuseStatus({
    qualityScore,
    source,
    missing,
  });
  const reviewPriority = deriveReviewPriority({
    source,
    missing,
    reuseStatus,
  });
  const strengths = collectStrengths(contract);

  const canBeCachedAsLearningObject =
    reuseStatus === "cache_as_candidate" || reuseStatus === "trusted_reusable";

  const safeToReuseWithoutReview =
    reuseStatus === "trusted_reusable" && reviewPriority === "none";

  const reasons = [
    `Contract quality score is ${qualityScore.toFixed(2)}.`,
    `Completeness contribution was ${completeness.toFixed(2)}.`,
    `Source authority contribution was ${sourceAuthority.toFixed(2)}.`,
    `Judging support contribution was ${judgingSupport.toFixed(2)}.`,
    `Reuse status is ${reuseStatus}.`,
    `Review priority is ${reviewPriority}.`,
  ];

  const cautions: string[] = [];

  if (!safeToReuseWithoutReview) {
    cautions.push(
      "This contract should not be treated as a trusted reusable learning object without review or stronger source grounding.",
    );
  }

  if (reuseStatus === "cache_for_debug") {
    cautions.push(
      "This contract can be kept for debugging and analytics, but not promoted as a reusable library object yet.",
    );
  }

  if (missing.includes("template_only_source")) {
    cautions.push(
      "The contract is template-only, so it can reveal learner behavior but should not be treated as authoritative content.",
    );
  }

  if (missing.includes("no_grounding_sources")) {
    cautions.push(
      "No grounding sources were attached to the contract.",
    );
  }

  return {
    quality_version: PROBE_CONTRACT_QUALITY_VERSION,
    quality_score: qualityScore,
    reuse_status: reuseStatus,
    review_priority: reviewPriority,
    can_be_cached_as_learning_object: canBeCachedAsLearningObject,
    safe_to_reuse_without_review: safeToReuseWithoutReview,
    missing_requirements: missing,
    strengths,
    reasons,
    cautions,
  };
}

