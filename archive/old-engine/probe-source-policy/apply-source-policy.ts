import type {
  ProbeContractSource,
  ProbeContractSourceMetadata,
} from "@/archive/old-engine/probes/probe-types";
import {
  allowedClaimStrengthFor,
  averageConfidence,
  clamp01,
  confidenceLevel,
  defaultConfidenceForSource,
} from "./source-confidence";
import {
  PROBE_SOURCE_POLICY_VERSION,
  type ProbeSourcePolicyEvaluation,
  type ProbeSourcePolicyInput,
  type SourcePolicyRuntimeRecommendation,
} from "./source-policy-types";

function inferContractSource(input: ProbeSourcePolicyInput): ProbeContractSource {
  if (input.providedSourceMetadata?.contract_source) {
    return input.providedSourceMetadata.contract_source;
  }

  switch (input.generationMode) {
    case "manual":
      return "human_reviewed_library";
    case "user_uploaded_content_grounded":
      return "uploaded_source";
    case "retrieval_grounded":
    case "content_grounded":
      return input.sourceContentIds.length ? "trusted_public_source" : "cached_generated";
    case "generic_scaffold":
      return "template_only";
    case "unknown":
    default:
      return "unknown";
  }
}

function inferRuntimeJudgingMode(input: ProbeSourcePolicyInput): ProbeContractSourceMetadata["runtime_judging_mode"] {
  if (input.providedSourceMetadata?.runtime_judging_mode) {
    return input.providedSourceMetadata.runtime_judging_mode;
  }

  if (input.deterministicJudgingAvailable) return "deterministic";

  if (
    input.rendererKind === "text_explanation" ||
    input.rendererKind === "audio_explanation" ||
    input.rendererKind === "video_checkpoint"
  ) {
    return "rubric_then_llm_if_needed";
  }

  return "rubric";
}

function normalizeProvidedConfidence(
  value: number | null | undefined,
  fallback: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp01(value)
    : fallback;
}

export function evaluateProbeSourcePolicy(
  input: ProbeSourcePolicyInput,
): ProbeSourcePolicyEvaluation {
  const contractSource = inferContractSource(input);
  const defaults = defaultConfidenceForSource(contractSource);
  const provided = input.providedSourceMetadata ?? null;

  const authoringConfidence = normalizeProvidedConfidence(
    provided?.authoring_confidence,
    defaults.authoring_confidence,
  );
  const contentConfidence = normalizeProvidedConfidence(
    provided?.content_confidence,
    defaults.content_confidence,
  );
  const pedagogicalConfidence = normalizeProvidedConfidence(
    provided?.pedagogical_confidence,
    defaults.pedagogical_confidence,
  );

  const hasGroundingSources =
    input.sourceContentIds.length > 0 ||
    input.sourceTopicIds.length > 0 ||
    Boolean(provided?.grounding_source_ids?.length) ||
    Boolean(provided?.source_refs?.length);

  const requiresReview =
    provided?.requires_review ??
    (contractSource === "template_only" ||
      contractSource === "llm_general_prior" ||
      contractSource === "cached_generated" ||
      contractSource === "unknown");

  const allowedClaimStrength = allowedClaimStrengthFor({
    contentConfidence,
    authoringConfidence,
    pedagogicalConfidence,
    requiresReview,
    contractSource,
  });

  const aggregateConfidence = averageConfidence([
    authoringConfidence,
    contentConfidence,
    pedagogicalConfidence,
  ]);

  const shouldInviteSourceUpload =
    contractSource === "template_only" ||
    contractSource === "llm_general_prior" ||
    contractSource === "unknown" ||
    !hasGroundingSources;

  const shouldPreferLowStakesProbe =
    allowedClaimStrength === "none" ||
    allowedClaimStrength === "conservative" ||
    contentConfidence < 0.55;

  const canMakeStrongCorrectnessClaim =
    allowedClaimStrength === "strong" &&
    contentConfidence >= 0.82 &&
    !requiresReview;

  const canMakeModerateCorrectnessClaim =
    (allowedClaimStrength === "moderate" || allowedClaimStrength === "strong") &&
    contentConfidence >= 0.55;

  const recommendations: SourcePolicyRuntimeRecommendation[] = [];

  if (shouldPreferLowStakesProbe) {
    recommendations.push("use_as_low_stakes_probe");
  }

  if (canMakeModerateCorrectnessClaim) {
    recommendations.push("use_for_moderate_progress_evidence");
  }

  if (canMakeStrongCorrectnessClaim) {
    recommendations.push("allow_strong_correctness_if_judging_supports_it");
  }

  if (shouldInviteSourceUpload) {
    recommendations.push("invite_source_upload");
  }

  if (requiresReview && !canMakeStrongCorrectnessClaim) {
    recommendations.push("requires_review_before_strong_claims");
  }

  const reasons = [
    `Contract source resolved to ${contractSource}.`,
    `Generation mode was ${input.generationMode ?? "unknown"}.`,
    `Allowed claim strength is ${allowedClaimStrength}.`,
    `Content confidence is ${contentConfidence.toFixed(2)}.`,
    input.deterministicJudgingAvailable
      ? "Renderer can produce deterministic answer-shape evidence."
      : "Renderer cannot produce deterministic answer-shape evidence.",
  ];

  if (contractSource === "template_only") {
    reasons.push(
      "The probe was generated from a generic scaffold rather than grounded source content.",
    );
  }

  const cautions: string[] = [];

  if (!canMakeStrongCorrectnessClaim) {
    cautions.push(
      "This probe should not be used for strong correctness claims without stronger source grounding.",
    );
  }

  if (shouldInviteSourceUpload) {
    cautions.push(
      "Consider inviting the learner to upload or select source material before making authoritative correctness judgments.",
    );
  }

  if (requiresReview) {
    cautions.push(
      "This probe contract requires review or stronger grounding before it can support high-authority claims.",
    );
  }

  const sourceMetadata: ProbeContractSourceMetadata = {
    contract_source: contractSource,
    grounding_source_ids:
      provided?.grounding_source_ids ??
      [...new Set([...input.sourceContentIds, ...input.sourceTopicIds])],
    source_refs: provided?.source_refs ?? [],
    authoring_confidence: authoringConfidence,
    content_confidence: contentConfidence,
    pedagogical_confidence: pedagogicalConfidence,
    requires_review: requiresReview,
    runtime_judging_mode: inferRuntimeJudgingMode(input),
    source_summary:
      provided?.source_summary ??
      (contractSource === "template_only"
        ? "Generic scaffold probe with no grounded source content."
        : null),

    policy_version: PROBE_SOURCE_POLICY_VERSION,
    confidence_level: confidenceLevel(aggregateConfidence),
    allowed_claim_strength: allowedClaimStrength,
    can_make_strong_correctness_claim: canMakeStrongCorrectnessClaim,
    can_make_moderate_correctness_claim: canMakeModerateCorrectnessClaim,
    should_invite_source_upload: shouldInviteSourceUpload,
    source_policy_reasons: reasons,
  };

  return {
    policy_version: PROBE_SOURCE_POLICY_VERSION,
    source_metadata: sourceMetadata,
    contract_source: contractSource,
    confidence_level: confidenceLevel(aggregateConfidence),
    allowed_claim_strength: allowedClaimStrength,
    can_make_strong_correctness_claim: canMakeStrongCorrectnessClaim,
    can_make_moderate_correctness_claim: canMakeModerateCorrectnessClaim,
    should_invite_source_upload: shouldInviteSourceUpload,
    should_prefer_low_stakes_probe: shouldPreferLowStakesProbe,
    requires_review_before_strong_claims: requiresReview && !canMakeStrongCorrectnessClaim,
    runtime_recommendations: recommendations,
    reasons,
    cautions,
  };
}

