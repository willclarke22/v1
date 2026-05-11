import type {
  CurrentInteractionContext,
  EmbeddingVector,
  EntityId,
  VectorInfo,
} from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type {
  SemanticCentroidEvidence,
  SemanticCentroidRankedTopic,
  TopicWithSemanticCentroid,
  CentroidUpdateMethod,
} from "./topic-centroids";

export type TopicLabelingResult = {
  topic_decision?: {
    canonical_label?: string | null;
    should_create_new_topic?: boolean | null;
    should_reuse_existing_topic?: boolean | null;
    confidence?: number | null;
  } | null;
  diagnostics?: {
    ambiguity_flags?: string[] | null;
  } | null;
  interpretation?: {
    concept_span?: string | null;
    question_about_topic?: string | null;
    synthesized_label?: string | null;
  } | null;
};

/* ------------------------------------------------------------------ */
/* SEMANTIC CENTROID ROUTING - V3 */
/* ------------------------------------------------------------------ */

export type TopicRoutingDecisionKind =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "create_and_link"
  | "clarify_topic_intent"
  | "no_decision";

export type TopicRoutingRouterVersion =
  | "semantic-centroid-v3"
  | "legacy"
  /**
   * Temporary compatibility only.
   * Remove once topic-router.ts / topic-routing-policy.ts are fully replaced.
   */
  | "topic-router-v2";

export type SemanticCentroidPolicyPath =
  | "strong_centroid_match"
  | "medium_centroid_match_with_gap"
  | "active_topic_tiny_followup"
  | "all_centroid_matches_weak_create_new"
  | "exact_existing_topic_match"
  | "create_and_link_to_related_topic"
  | "ambiguous_centroid_competition"
  | "missing_message_embedding"
  | "missing_topic_centroids"
  | "legacy_fallback"
  | "fallback_create_new"
  | "fallback_clarify_topic_intent"
  | "no_decision";

export type TopicRoutingPolicyPath =
  | SemanticCentroidPolicyPath
  /**
   * Legacy compatibility paths.
   * These are kept only so the old V2 policy file compiles during migration.
   */
  | "exact_label_match_existing_topic"
  | "explicit_switch_to_existing_topic"
  | "explicit_switch_create_new_topic"
  | "followup_stay_active"
  | "strong_semantic_switch"
  | "medium_semantic_switch_with_label_support"
  | "active_topic_semantic_followup"
  | "clean_phrase_create_new_low_similarity"
  | "labeler_recommended_create_new"
  | "narrow_candidate_create_and_link_to_broad_topic"
  | "vague_or_meta_clarify_topic_intent"
  | "no_label_clarify_topic_intent"
  | "weak_match_clarify_topic_intent";

export type SemanticCentroidRoutingThresholds = {
  /**
   * Strong enough to confidently route/switch to an existing topic.
   */
  strong_centroid_match: number;

  /**
   * Usable match only if the best-vs-second gap is also strong enough.
   */
  medium_centroid_match: number;

  /**
   * Below this, an existing topic should usually not be trusted.
   */
  weak_centroid_match: number;

  /**
   * Best similarity must beat second-best by this much for medium-match routing.
   */
  min_similarity_gap: number;

  /**
   * Only used for tiny/contextual follow-ups.
   * Active topic fallback should not happen just because a topic is active.
   */
  active_followup_match: number;

  /**
   * If best match is below this, create a new topic unless the message is a
   * tiny contextual follow-up.
   */
  create_new_below: number;

  /**
   * Similar enough to a related topic to create-and-link rather than create alone.
   */
  related_topic_link_min: number;

  /**
   * Above this, prefer switching to the existing topic instead of create/link.
   */
  related_topic_link_max: number;
};

export type TopicRoutingCandidateEvidence = {
  topic_id: EntityId;
  topic_name: string;
  similarity: number;
  rank: number;
  embedding_count: number | null;
  embedding_model: string | null;
};

export type TopicRoutingTinyFollowupSignal = {
  is_tiny_followup: boolean;
  reason: string | null;
  token_count: number;
};

export type TopicRoutingDebug = {
  router_version: TopicRoutingRouterVersion;
  raw_message: string;

  decision_kind: TopicRoutingDecisionKind;
  policy_path: TopicRoutingPolicyPath;

  selected_topic_id: string | null;
  selected_topic_name: string | null;
  new_topic_label: string | null;

  active_topic_id: string | null;
  active_topic_name: string | null;

  best_topic_id: string | null;
  best_topic_name: string | null;
  best_similarity: number | null;

  second_topic_id: string | null;
  second_topic_name: string | null;
  second_similarity: number | null;

  active_topic_similarity: number | null;
  similarity_gap: number | null;

  top_candidates: TopicRoutingCandidateEvidence[];

  message_embedding_available: boolean;
  message_embedding_model: string | null;
  topic_centroids_available: number;
  topic_count_considered: number;

  tiny_followup_signal: TopicRoutingTinyFollowupSignal;
  centroid_evidence: SemanticCentroidEvidence | null;

  deterministic_label: string | null;
  deterministic_confidence: number | null;
  deterministic_should_create_new_topic: boolean | null;
  deterministic_should_reuse_existing_topic: boolean | null;
  deterministic_ambiguity_flags: string[];

  thresholds: SemanticCentroidRoutingThresholds | null;
  reasons: string[];

  /**
   * Temporary compatibility with the old V2 debug shape.
   * Remove after topic-router.ts and topic-routing-policy.ts are replaced.
   */
  candidate_label?: string | null;
  candidate_label_source?: TopicRoutingCandidateLabelSource;
  message_shape?: TopicRoutingMessageShape;
};

export type TopicRoutingDecision = {
  kind: TopicRoutingDecisionKind;

  target_topic_id: string | null;
  target_topic_name: string | null;
  target_topic: RouteTopic | null;

  new_topic_label: string | null;

  linked_topic_id: string | null;
  linked_topic_name: string | null;
  linked_topic: RouteTopic | null;

  confidence: number;
  reasons: string[];
  debug: TopicRoutingDebug;
};

export type SemanticCentroidRouteInput = {
  rawMessage: string;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel?: string | null;

  topics: TopicWithSemanticCentroid[];
  activeTopicId?: string | null;

  vectorInfo?: VectorInfo | null;
  labeling?: TopicLabelingResult | null;
  currentInteractionContext?: CurrentInteractionContext | null;

  thresholds?: Partial<SemanticCentroidRoutingThresholds>;
};

export type SemanticCentroidPolicyInput = {
  rawMessage: string;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;

  topics: TopicWithSemanticCentroid[];
  activeTopic: TopicWithSemanticCentroid | null;

  labeling: TopicLabelingResult | null;
  candidateLabel: string | null;

  vectorInfo: VectorInfo;
  centroidEvidence: SemanticCentroidEvidence;
  thresholds: SemanticCentroidRoutingThresholds;
  tinyFollowupSignal: TopicRoutingTinyFollowupSignal;
};

export type SemanticCentroidPolicyDecision = {
  kind: TopicRoutingDecisionKind;
  targetTopic: TopicWithSemanticCentroid | null;
  newTopicLabel: string | null;
  linkedTopic: TopicWithSemanticCentroid | null;
  confidence: number;
  policyPath: SemanticCentroidPolicyPath;
  reasons: string[];
};

export type TopicCentroidUpdatePlan = {
  topic_id: EntityId;
  previous_embedding_count: number;
  new_embedding_count: number;
  update_method: CentroidUpdateMethod;
  alpha: number | null;
  embedding_model: string | null;
  updated_at: string;
  new_centroid: EmbeddingVector | null;
};

export type SemanticCentroidRoutingResult = TopicRoutingDecision & {
  centroid_update_plan: TopicCentroidUpdatePlan | null;
  vectorInfo: VectorInfo;
};

/* ------------------------------------------------------------------ */
/* NEW-TOPIC NAMING SUPPORT */
/* ------------------------------------------------------------------ */

export type TopicRoutingCandidateLabelSource =
  | "deterministic_labeler"
  | "deterministic_interpretation"
  | "raw_message_fallback"
  | "explicit_switch_target"
  | "none";

export type TopicNameSuggestion = {
  label: string | null;
  source: TopicRoutingCandidateLabelSource;
  confidence: number | null;
  reasons: string[];
};

/* ------------------------------------------------------------------ */
/* LEGACY COMPATIBILITY TYPES */
/* ------------------------------------------------------------------ */

/**
 * Legacy V2 threshold shape.
 *
 * Kept temporarily because the old topic-routing-policy.ts and the compatibility
 * functions in topic-centroids.ts still reference these names. Once V3 policy is
 * fully wired, this can be deleted.
 */
export type LegacyTopicRoutingThresholds = {
  strongExistingMatch: number;
  mediumExistingMatch: number;
  weakExistingMatch: number;
  minSwitchGap: number;
  activeFollowupStay: number;
  createWhenBestBelow: number;
  createCleanPhraseConfidence: number;
  labelerCreateConfidence: number;
  clarifyWhenNoLabelAndNoFollowup: number;
  broadTopicLinkMinSimilarity: number;
  broadTopicLinkMaxSimilarity: number;
};

/**
 * Temporary alias for old files.
 * New semantic-centroid code should use SemanticCentroidRoutingThresholds.
 */
export type TopicRoutingThresholds = LegacyTopicRoutingThresholds;

export type TopicSimilarityEvidence = {
  topic_id: string;
  topic_name: string;
  similarity: number;
  rank: number;
  topic: RouteTopic | null;
};

export type TopicCentroidEvidence = {
  ranked: TopicSimilarityEvidence[];
  best: TopicSimilarityEvidence | null;
  second: TopicSimilarityEvidence | null;
  active: TopicSimilarityEvidence | null;
  gap: number | null;
  hasStrongMatch: boolean;
  hasMediumMatch: boolean;
  allMatchesWeak: boolean;
};

export type TopicRoutingMessageShape = {
  clean_standalone_phrase: boolean;
  followup_like: boolean;
  explicit_switch_like: boolean;
  vague_or_meta: boolean;
  probable_attempt_like: boolean;
  has_question_mark: boolean;
  token_count: number;
};

export type RouteTopicV2Input = {
  rawMessage: string;
  topics: RouteTopic[];
  activeTopicId?: string | null;
  vectorInfo?: VectorInfo | null;
  labeling?: TopicLabelingResult | null;
  currentInteractionContext?: CurrentInteractionContext | null;
  thresholds?: Partial<TopicRoutingThresholds>;
};

export type TopicRoutingPolicyInput = {
  rawMessage: string;
  topics: RouteTopic[];
  activeTopic: RouteTopic | null;

  candidateLabel: string | null;
  candidateLabelSource: TopicRoutingCandidateLabelSource;

  deterministicLabel: string | null;
  deterministicConfidence: number | null;
  deterministicShouldCreateNewTopic: boolean | null;
  deterministicShouldReuseExistingTopic: boolean | null;
  deterministicAmbiguityFlags: string[];

  messageShape: TopicRoutingMessageShape;
  centroidEvidence: TopicCentroidEvidence;
  thresholds: TopicRoutingThresholds;
};

/* ------------------------------------------------------------------ */
/* HELPERS */
/* ------------------------------------------------------------------ */

export function semanticCandidateEvidenceFromRankedTopic(
  ranked: SemanticCentroidRankedTopic,
): TopicRoutingCandidateEvidence {
  return {
    topic_id: ranked.topic_id,
    topic_name: ranked.topic_name,
    similarity: ranked.similarity,
    rank: ranked.rank,
    embedding_count: ranked.embedding_count,
    embedding_model: ranked.embedding_model,
  };
}
