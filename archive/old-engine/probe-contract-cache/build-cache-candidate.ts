import { makeId } from "@/lib/utils/ids";
import type {
  ProbeContract,
} from "@/archive/old-engine/probes/probe-types";
import type {
  ProbeContractQualityEvaluation,
  ProbeContractQualityMissingRequirement,
  ProbeContractReuseStatus,
} from "@/archive/old-engine/probe-contract-quality/quality-types";
import {
  PROBE_CONTRACT_CACHE_VERSION,
  type ProbeContractCacheAction,
  type ProbeContractCacheCandidate,
  type ProbeContractPromotionRequirement,
} from "./cache-types";

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cacheActionForReuseStatus(
  reuseStatus: ProbeContractReuseStatus,
): ProbeContractCacheAction {
  switch (reuseStatus) {
    case "trusted_reusable":
      return "promote_to_trusted_library";
    case "cache_as_candidate":
      return "store_candidate";
    case "cache_for_debug":
      return "debug_only";
    case "do_not_cache":
    default:
      return "do_not_store";
  }
}

function hasMissing(
  quality: ProbeContractQualityEvaluation | null,
  requirement: ProbeContractQualityMissingRequirement,
) {
  return quality?.missing_requirements.includes(requirement) ?? false;
}

function promotionRequirementsFor(
  contract: ProbeContract,
  quality: ProbeContractQualityEvaluation | null,
): ProbeContractPromotionRequirement[] {
  if (quality?.reuse_status === "trusted_reusable") {
    return ["no_promotion_needed"];
  }

  const requirements: ProbeContractPromotionRequirement[] = [];
  const source = contract.source_metadata ?? null;
  const generation = contract.generation_metadata ?? null;

  if (
    hasMissing(quality, "no_grounding_sources") ||
    !source?.grounding_source_ids.length ||
    !source?.source_refs.length
  ) {
    requirements.push("attach_grounding_source", "add_source_refs");
  }

  if (
    hasMissing(quality, "template_only_source") ||
    hasMissing(quality, "generic_scaffold_content") ||
    generation?.generation_mode === "generic_scaffold"
  ) {
    requirements.push("replace_generic_scaffold_content");
  }

  if (
    hasMissing(quality, "missing_success_markers") ||
    contract.judging_schema.success_markers.length > 0
  ) {
    requirements.push("human_review_success_markers");
  }

  if (
    hasMissing(quality, "missing_failure_markers") ||
    contract.judging_schema.failure_markers.length > 0
  ) {
    requirements.push("human_review_failure_markers");
  }

  if (
    contract.judging_schema.deterministic_judging_available ||
    contract.input_schema.renderer_kind === "multiple_choice" ||
    contract.input_schema.renderer_kind === "ordering" ||
    contract.input_schema.renderer_kind === "slider_prediction" ||
    contract.input_schema.renderer_kind === "drag_drop_match" ||
    contract.input_schema.renderer_kind === "graph_match"
  ) {
    requirements.push("human_review_answer_key");
  }

  if (contract.judging_schema.misconception_mappings.length > 0) {
    requirements.push("validate_distractors_or_misconceptions");
  }

  if (hasMissing(quality, "low_content_confidence")) {
    requirements.push("raise_content_confidence");
  }

  if (hasMissing(quality, "low_pedagogical_confidence")) {
    requirements.push("raise_pedagogical_confidence");
  }

  requirements.push("validate_with_successful_attempts");

  return [...new Set(requirements)];
}

function sourceLabel(contract: ProbeContract) {
  const source = contract.source_metadata;
  if (!source) return "unknown source";

  return `${source.contract_source}; claim=${source.allowed_claim_strength ?? "unknown"}`;
}

function qualityLabel(quality: ProbeContractQualityEvaluation | null) {
  if (!quality) return "quality unavailable";
  return `score=${quality.quality_score.toFixed(2)}; reuse=${quality.reuse_status}`;
}

function reviewLabel(quality: ProbeContractQualityEvaluation | null) {
  if (!quality) return "review unknown";
  return `review=${quality.review_priority}; safe_reuse=${quality.safe_to_reuse_without_review}`;
}

export function buildProbeContractCacheCandidate(
  contract: ProbeContract,
): ProbeContractCacheCandidate {
  const quality = contract.quality_metadata ?? null;
  const reuseStatus = quality?.reuse_status ?? "cache_for_debug";
  const cacheAction = cacheActionForReuseStatus(reuseStatus);
  const qualityScore = clamp01(quality?.quality_score ?? 0);

  const promoteWhen = promotionRequirementsFor(contract, quality);

  const reasons = [
    `Cache action is ${cacheAction}.`,
    `Reuse status is ${reuseStatus}.`,
    `Quality score is ${qualityScore.toFixed(2)}.`,
    `Contract source is ${contract.source_metadata?.contract_source ?? "unknown"}.`,
  ];

  if (quality?.reasons.length) {
    reasons.push(...quality.reasons);
  }

  const cautions: string[] = [];

  if (cacheAction === "debug_only") {
    cautions.push(
      "Store only for debugging/analytics. Do not reuse as a learning object yet.",
    );
  }

  if (cacheAction === "do_not_store") {
    cautions.push(
      "Do not store this contract unless needed for immediate error/debug inspection.",
    );
  }

  if (!contract.source_metadata?.can_make_strong_correctness_claim) {
    cautions.push("This candidate does not support strong correctness claims yet.");
  }

  if (!quality?.safe_to_reuse_without_review) {
    cautions.push(
      "This candidate requires review or stronger source grounding before trusted reuse.",
    );
  }

  if (quality?.cautions.length) {
    cautions.push(...quality.cautions);
  }

  return {
    cache_version: PROBE_CONTRACT_CACHE_VERSION,
    candidate_id: makeId("probe-cache-candidate"),
    created_at: nowIso(),

    contract_id: contract.contract_id,
    contract_version: contract.version,
    topic_id: contract.target_topic_id,
    topic_label: contract.target_topic_label,
    target_diagnosis: contract.target_diagnosis,

    renderer_kind: contract.renderer_kind,
    assessment_target: contract.assessment_target,

    generation_metadata: contract.generation_metadata ?? null,
    source_metadata: contract.source_metadata ?? null,
    quality_metadata: quality,

    quality_score: qualityScore,
    reuse_status: reuseStatus,
    cache_action: cacheAction,

    can_be_cached_as_learning_object:
      quality?.can_be_cached_as_learning_object ?? false,
    safe_to_reuse_without_review:
      quality?.safe_to_reuse_without_review ?? false,

    promote_when: promoteWhen,

    summary: {
      title: `${contract.target_topic_label} / ${contract.renderer_kind}`,
      topic_label: contract.target_topic_label,
      renderer_kind: contract.renderer_kind,
      source_label: sourceLabel(contract),
      quality_label: qualityLabel(quality),
      review_label: reviewLabel(quality),
    },

    reasons,
    cautions,
  };
}

