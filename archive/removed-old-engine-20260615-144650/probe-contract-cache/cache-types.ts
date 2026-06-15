import type {
  EntityId,
  ISO8601String,
} from "@/types/contracts";
import type {
  ProbeAssessmentTarget,
  ProbeContractSourceMetadata,
  ProbeGenerationMetadata,
  ProbeRendererKind,
} from "@/archive/old-engine/probes/probe-types";
import type {
  ProbeContractQualityEvaluation,
  ProbeContractReuseStatus,
} from "@/archive/old-engine/probe-contract-quality/quality-types";

/**
 * Probe Contract Cache V1
 *
 * This is not persistence yet. It creates a stable cache-candidate payload that
 * later persistence/library code can store, review, promote, or ignore.
 *
 * The goal is to let the Progressive Intelligence Library grow from real
 * generated contracts without pretending every generated scaffold is reusable.
 */

export const PROBE_CONTRACT_CACHE_VERSION =
  "probe_contract_cache_v1" as const;

export const PROBE_CONTRACT_CACHE_PERSISTENCE_POLICY_VERSION =
  "probe_contract_cache_persistence_policy_v1" as const;

export type ProbeContractCacheVersion = typeof PROBE_CONTRACT_CACHE_VERSION;

export type ProbeContractCachePersistencePolicyVersion =
  typeof PROBE_CONTRACT_CACHE_PERSISTENCE_POLICY_VERSION;

export type ProbeContractCacheAction =
  | "do_not_store"
  | "debug_only"
  | "store_candidate"
  | "promote_to_trusted_library";

export type ProbeContractPromotionRequirement =
  | "attach_grounding_source"
  | "human_review_success_markers"
  | "human_review_failure_markers"
  | "human_review_answer_key"
  | "replace_generic_scaffold_content"
  | "validate_with_successful_attempts"
  | "validate_distractors_or_misconceptions"
  | "add_source_refs"
  | "raise_content_confidence"
  | "raise_pedagogical_confidence"
  | "no_promotion_needed";

export type ProbeContractCacheCandidate = {
  cache_version: ProbeContractCacheVersion;
  candidate_id: EntityId;
  created_at: ISO8601String;

  contract_id: EntityId;
  contract_version: string;
  topic_id: EntityId | null;
  topic_label: string;
  target_diagnosis: string | null;

  renderer_kind: ProbeRendererKind;
  assessment_target: ProbeAssessmentTarget;

  generation_metadata: ProbeGenerationMetadata | null;
  source_metadata: ProbeContractSourceMetadata | null;
  quality_metadata: ProbeContractQualityEvaluation | null;

  quality_score: number;
  reuse_status: ProbeContractReuseStatus;
  cache_action: ProbeContractCacheAction;

  can_be_cached_as_learning_object: boolean;
  safe_to_reuse_without_review: boolean;

  promote_when: ProbeContractPromotionRequirement[];

  summary: {
    title: string;
    topic_label: string;
    renderer_kind: ProbeRendererKind;
    source_label: string;
    quality_label: string;
    review_label: string;
  };

  reasons: string[];
  cautions: string[];
};

export type ProbeContractPersistenceTarget =
  | "none"
  | "debug_log"
  | "candidate_library"
  | "trusted_library";

export type ProbeContractPersistenceRetention =
  | "none"
  | "short_debug"
  | "review_queue"
  | "long_term_library";

export type ProbeContractPersistenceReviewQueue =
  | "none"
  | "source_grounding"
  | "pedagogy_review"
  | "answer_key_review"
  | "trusted_library_review";

export type ProbeContractCachePersistencePolicy = {
  policy_version: ProbeContractCachePersistencePolicyVersion;
  evaluated_at: ISO8601String;

  candidate_id: EntityId;
  contract_id: EntityId;

  should_persist: boolean;
  persistence_target: ProbeContractPersistenceTarget;
  retention: ProbeContractPersistenceRetention;
  review_queue: ProbeContractPersistenceReviewQueue;

  /**
   * Persistence safety controls. These are policy recommendations only.
   * Persistence code can later enforce them before writing to Supabase.
   */
  include_full_contract_snapshot: boolean;
  include_source_metadata: boolean;
  include_quality_metadata: boolean;
  include_cache_candidate: boolean;
  include_attempt_links: boolean;
  include_learner_response_text: boolean;
  redact_contract_body: boolean;

  persistence_reason: string;
  reasons: string[];
  cautions: string[];
};

