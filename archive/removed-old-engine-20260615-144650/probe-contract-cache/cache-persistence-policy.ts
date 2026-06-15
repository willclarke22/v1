import {
  PROBE_CONTRACT_CACHE_PERSISTENCE_POLICY_VERSION,
  type ProbeContractCacheCandidate,
  type ProbeContractCachePersistencePolicy,
  type ProbeContractPersistenceReviewQueue,
  type ProbeContractPersistenceRetention,
  type ProbeContractPersistenceTarget,
} from "./cache-types";

function nowIso() {
  return new Date().toISOString();
}

function persistenceTargetFor(
  candidate: ProbeContractCacheCandidate,
): ProbeContractPersistenceTarget {
  switch (candidate.cache_action) {
    case "promote_to_trusted_library":
      return "trusted_library";
    case "store_candidate":
      return "candidate_library";
    case "debug_only":
      return "debug_log";
    case "do_not_store":
    default:
      return "none";
  }
}

function retentionFor(
  target: ProbeContractPersistenceTarget,
): ProbeContractPersistenceRetention {
  switch (target) {
    case "trusted_library":
      return "long_term_library";
    case "candidate_library":
      return "review_queue";
    case "debug_log":
      return "short_debug";
    case "none":
    default:
      return "none";
  }
}

function reviewQueueFor(
  candidate: ProbeContractCacheCandidate,
): ProbeContractPersistenceReviewQueue {
  if (candidate.cache_action === "promote_to_trusted_library") {
    return "trusted_library_review";
  }

  if (candidate.promote_when.includes("attach_grounding_source")) {
    return "source_grounding";
  }

  if (
    candidate.promote_when.includes("human_review_answer_key") ||
    candidate.promote_when.includes("validate_distractors_or_misconceptions")
  ) {
    return "answer_key_review";
  }

  if (
    candidate.promote_when.includes("human_review_success_markers") ||
    candidate.promote_when.includes("human_review_failure_markers") ||
    candidate.promote_when.includes("raise_pedagogical_confidence")
  ) {
    return "pedagogy_review";
  }

  return "none";
}

function persistenceReasonFor(args: {
  candidate: ProbeContractCacheCandidate;
  target: ProbeContractPersistenceTarget;
}) {
  if (args.target === "trusted_library") {
    return "Candidate is already safe enough to be considered for trusted library promotion.";
  }

  if (args.target === "candidate_library") {
    return "Candidate has enough quality and source confidence to enter the reviewable candidate library.";
  }

  if (args.target === "debug_log") {
    return "Candidate is useful for diagnostics and analytics, but should not be reused as a learning object yet.";
  }

  return "Candidate policy says it should not be persisted.";
}

/**
 * Decides what persistence code should do with a cache candidate.
 *
 * This function does not write anything. It is a boundary policy:
 * cache candidate says "what this generated contract is";
 * persistence policy says "what should happen to it later."
 */
export function evaluateProbeContractCachePersistencePolicy(
  candidate: ProbeContractCacheCandidate,
): ProbeContractCachePersistencePolicy {
  const target = persistenceTargetFor(candidate);
  const retention = retentionFor(target);
  const reviewQueue = reviewQueueFor(candidate);
  const shouldPersist = target !== "none";

  const includeFullContractSnapshot =
    target === "trusted_library" || target === "candidate_library";
  const includeSourceMetadata = target !== "none";
  const includeQualityMetadata = target !== "none";
  const includeCacheCandidate = target !== "none";

  const includeAttemptLinks = false;
  const includeLearnerResponseText = false;

  const redactContractBody = target === "debug_log";

  const reasons = [
    `Persistence target is ${target}.`,
    `Retention policy is ${retention}.`,
    `Review queue is ${reviewQueue}.`,
    `Candidate cache action was ${candidate.cache_action}.`,
    `Candidate reuse status was ${candidate.reuse_status}.`,
    `Candidate quality score was ${candidate.quality_score.toFixed(2)}.`,
  ];

  if (candidate.promote_when.length) {
    reasons.push(`Promotion requirements: ${candidate.promote_when.join(", ")}.`);
  }

  const cautions: string[] = [];

  if (target === "debug_log") {
    cautions.push(
      "Debug-only persistence should avoid becoming a hidden reusable curriculum library.",
    );
  }

  if (!candidate.safe_to_reuse_without_review) {
    cautions.push(
      "Candidate is not safe to reuse without review.",
    );
  }

  if (!candidate.source_metadata?.can_make_strong_correctness_claim) {
    cautions.push(
      "Candidate does not support strong correctness claims.",
    );
  }

  if (!includeLearnerResponseText) {
    cautions.push(
      "Learner response text should not be included in this cache policy output.",
    );
  }

  return {
    policy_version: PROBE_CONTRACT_CACHE_PERSISTENCE_POLICY_VERSION,
    evaluated_at: nowIso(),

    candidate_id: candidate.candidate_id,
    contract_id: candidate.contract_id,

    should_persist: shouldPersist,
    persistence_target: target,
    retention,
    review_queue: reviewQueue,

    include_full_contract_snapshot: includeFullContractSnapshot,
    include_source_metadata: includeSourceMetadata,
    include_quality_metadata: includeQualityMetadata,
    include_cache_candidate: includeCacheCandidate,
    include_attempt_links: includeAttemptLinks,
    include_learner_response_text: includeLearnerResponseText,
    redact_contract_body: redactContractBody,

    persistence_reason: persistenceReasonFor({ candidate, target }),
    reasons,
    cautions,
  };
}
