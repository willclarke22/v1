import type {
  TopicRoutingState,
  VectorInfo,
} from "@/types/contracts";
import type { TopicResolutionTrace } from "@/lib/topic-routing/topic-routing-trace";
import {
  buildSeededTopicFromResolvedLabel as buildSeededRouteTopicFromResolvedLabel,
  type RouteTopic,
} from "@/lib/topic-routing/route-topics";
import {
  isModelPolicySafePositiveDecision,
  type ModelFirstTopicResolutionOutcome,
  type ModelRouteContinuationPolicy,
  type SemanticEnrichmentStatus,
} from "@/lib/topic-routing/topic-labeler/resolution";
import type { ModelTopicRoutePolicyDecision } from "@/lib/topic-routing/topic-labeler/policy";
import type { RouteResolutionKind } from "./confusion-insight-queue";
import type { TopicLabelingMode } from "./timing";
import type { RouteCentroidUpdatePlan } from "./semantic-message-embedding";

export type TopicResolutionDebug = {
  topic_labeling_mode: TopicLabelingMode;
  llm_fallback_allowed_by_mode: boolean;
  llm_fallback_recommended_by_policy: boolean;
  llm_fallback_attempted: boolean;
  llm_fallback_used: boolean;
  deterministic_trusted_without_llm: boolean;
  deterministic_create_blocked_as_suspicious: boolean;
  structurally_strong_resolved_label: boolean;
  narrower_than_active_broad_topic: boolean;
  resolution_kind: RouteResolutionKind;
  resolved_label: string | null;
  match_confidence: number;
  resolution_trace: TopicResolutionTrace | null;
};

export type TopicResolutionOutcome = {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: RouteResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  usedLLMFallback: boolean;
  resolutionTrace: TopicResolutionTrace | null;
  semanticTopicRouting: TopicRoutingState | null;
  centroidUpdatePlan: RouteCentroidUpdatePlan | null;
  debug: TopicResolutionDebug;
};

export type ResolvedMessageFrame =
  TopicResolutionTrace["interpretation"]["frame"];
export type RoutePreferredModality = "text" | "video" | "interactive";

export function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_labels: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

export function getMessageEmbeddingSkipReason(args: {
  decision: ModelTopicRoutePolicyDecision | null;
  continuationPolicy: ModelRouteContinuationPolicy | null;
  topicLabelerEnabled: boolean;
}): string | null {
  const { decision, continuationPolicy, topicLabelerEnabled } = args;

  if (isModelPolicySafePositiveDecision(decision)) {
    return "model_policy_safe_authoritative_decision";
  }

  if (
    topicLabelerEnabled &&
    continuationPolicy &&
    (continuationPolicy.kind === "stay_active_after_model_failure" ||
      continuationPolicy.kind === "ask_lightweight_retry" ||
      continuationPolicy.kind === "invite_word_vomit" ||
      continuationPolicy.kind === "no_learning_space_change")
  ) {
    return `model_continuation_policy_${continuationPolicy.kind}`;
  }

  return null;
}

export function normalizeVectorInfoFallback(
  matchVectorInfo: VectorInfo,
  topic: RouteTopic,
  createdTopic: boolean,
): VectorInfo {
  const topKTopicLabels = matchVectorInfo.top_k_topic_labels.length
    ? matchVectorInfo.top_k_topic_labels
    : [topic.topic_label];

  return {
    ...matchVectorInfo,
    top_k_topic_labels: topKTopicLabels,
    top_k_topic_ids:
      matchVectorInfo.top_k_topic_ids.length > 0
        ? matchVectorInfo.top_k_topic_ids
        : [topic.id],
    top_k_similarity_scores:
      matchVectorInfo.top_k_similarity_scores.length > 0
        ? matchVectorInfo.top_k_similarity_scores
        : [createdTopic ? 0.24 : 0.52],
  };
}

export function getResolvedMessageFrame(
  resolutionTrace: TopicResolutionTrace | null,
): ResolvedMessageFrame {
  return resolutionTrace?.interpretation?.frame ?? "general";
}

export function derivePreferredModalityFromResolutionFrame(
  frame: ResolvedMessageFrame,
): RoutePreferredModality {
  if (frame === "apply_request") {
    return "interactive";
  }

  return "text";
}

export function deriveClarifySeekingFromResolutionFrame(
  frame: ResolvedMessageFrame,
) {
  return frame === "confusion_help" || frame === "explain_request";
}

function normalizeTextLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRouteTopicFromResolvedLabel(args: {
  existingTopics: RouteTopic[];
  resolvedLabel: string;
}): RouteTopic {
  return buildSeededRouteTopicFromResolvedLabel({
    existingTopics: args.existingTopics,
    resolvedLabel: args.resolvedLabel,
  });
}

export function buildTopicResolutionDebug(args: {
  topicLabelingMode: TopicLabelingMode;
  llmFallbackAllowedByMode: boolean;
  llmFallbackRecommendedByPolicy: boolean;
  llmFallbackAttempted: boolean;
  llmFallbackUsed: boolean;
  deterministicTrustedWithoutLLM: boolean;
  deterministicCreateBlockedAsSuspicious: boolean;
  structurallyStrongResolvedLabel: boolean;
  narrowerThanActiveBroadTopic: boolean;
  resolutionKind: RouteResolutionKind;
  resolvedLabel: string | null;
  matchConfidence: number;
  resolutionTrace: TopicResolutionTrace | null;
}): TopicResolutionDebug {
  return {
    topic_labeling_mode: args.topicLabelingMode,
    llm_fallback_allowed_by_mode: args.llmFallbackAllowedByMode,
    llm_fallback_recommended_by_policy: args.llmFallbackRecommendedByPolicy,
    llm_fallback_attempted: args.llmFallbackAttempted,
    llm_fallback_used: args.llmFallbackUsed,
    deterministic_trusted_without_llm: args.deterministicTrustedWithoutLLM,
    deterministic_create_blocked_as_suspicious:
      args.deterministicCreateBlockedAsSuspicious,
    structurally_strong_resolved_label: args.structurallyStrongResolvedLabel,
    narrower_than_active_broad_topic: args.narrowerThanActiveBroadTopic,
    resolution_kind: args.resolutionKind,
    resolved_label: args.resolvedLabel,
    match_confidence: args.matchConfidence,
    resolution_trace: args.resolutionTrace,
  };
}

export function buildResolvedOutcome(args: {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: RouteResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  usedLLMFallback: boolean;
  resolutionTrace: TopicResolutionTrace | null;
  semanticTopicRouting?: TopicRoutingState | null;
  centroidUpdatePlan?: RouteCentroidUpdatePlan | null;
  topicLabelingMode: TopicLabelingMode;
  llmFallbackAllowedByMode: boolean;
  llmFallbackRecommendedByPolicy: boolean;
  llmFallbackAttempted: boolean;
  deterministicTrustedWithoutLLM?: boolean;
  deterministicCreateBlockedAsSuspicious?: boolean;
  structurallyStrongResolvedLabel?: boolean;
  narrowerThanActiveBroadTopic?: boolean;
}): TopicResolutionOutcome {
  return {
    topic: args.topic,
    createdTopic: args.createdTopic,
    routeTopics: args.routeTopics,
    resolutionKind: args.resolutionKind,
    vectorInfo: args.vectorInfo,
    resolvedLabel: args.resolvedLabel,
    matchConfidence: args.matchConfidence,
    usedLLMFallback: args.usedLLMFallback,
    resolutionTrace: args.resolutionTrace,
    semanticTopicRouting: args.semanticTopicRouting ?? null,
    centroidUpdatePlan: args.centroidUpdatePlan ?? null,
    debug: buildTopicResolutionDebug({
      topicLabelingMode: args.topicLabelingMode,
      llmFallbackAllowedByMode: args.llmFallbackAllowedByMode,
      llmFallbackRecommendedByPolicy: args.llmFallbackRecommendedByPolicy,
      llmFallbackAttempted: args.llmFallbackAttempted,
      llmFallbackUsed: args.usedLLMFallback,
      deterministicTrustedWithoutLLM:
        args.deterministicTrustedWithoutLLM ?? false,
      deterministicCreateBlockedAsSuspicious:
        args.deterministicCreateBlockedAsSuspicious ?? false,
      structurallyStrongResolvedLabel:
        args.structurallyStrongResolvedLabel ?? false,
      narrowerThanActiveBroadTopic: args.narrowerThanActiveBroadTopic ?? false,
      resolutionKind: args.resolutionKind,
      resolvedLabel: args.resolvedLabel,
      matchConfidence: args.matchConfidence,
      resolutionTrace: args.resolutionTrace,
    }),
  };
}

export function adaptModelFirstTopicResolutionOutcome(
  outcome: ModelFirstTopicResolutionOutcome,
): TopicResolutionOutcome {
  return buildResolvedOutcome({
    topic: outcome.topic,
    createdTopic: outcome.createdTopic,
    routeTopics: outcome.routeTopics,
    resolutionKind: outcome.resolutionKind,
    vectorInfo: outcome.vectorInfo,
    resolvedLabel: outcome.resolvedLabel,
    matchConfidence: outcome.matchConfidence,
    usedLLMFallback: false,
    resolutionTrace: outcome.resolutionTrace,
    semanticTopicRouting: outcome.semanticTopicRouting,
    centroidUpdatePlan: outcome.centroidUpdatePlan,
    topicLabelingMode: "topic_labeler_primary",
    llmFallbackAllowedByMode: false,
    llmFallbackRecommendedByPolicy: false,
    llmFallbackAttempted: false,
    deterministicTrustedWithoutLLM: false,
    deterministicCreateBlockedAsSuspicious: false,
    structurallyStrongResolvedLabel: false,
    narrowerThanActiveBroadTopic: false,
  });
}

export function shouldUseModelContinuationPolicyInsteadOfDeterministic(
  policy: ModelRouteContinuationPolicy | null,
) {
  if (!policy) return false;

  return (
    policy.kind === "invite_word_vomit" ||
    policy.kind === "choose_best_learning_target" ||
    policy.kind === "stay_active_after_model_failure" ||
    policy.kind === "ask_lightweight_retry" ||
    policy.kind === "no_learning_space_change"
  );
}

function buildRouteTopicForContinuationOnly(args: {
  existingTopics: RouteTopic[];
  fallbackLabel: string;
}): RouteTopic {
  return buildRouteTopicFromResolvedLabel({
    existingTopics: args.existingTopics,
    resolvedLabel: args.fallbackLabel,
  });
}

export function buildContinuationPolicyTopicResolutionOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopic: RouteTopic | null;
  modelRouteContinuationPolicy: ModelRouteContinuationPolicy;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  semanticVectorInfo: VectorInfo;
}): TopicResolutionOutcome {
  const {
    existingTopics,
    activeTopic,
    modelRouteContinuationPolicy,
    semanticVectorInfo,
  } = args;

  const chosenTarget =
    modelRouteContinuationPolicy.chosen_target?.trim() || null;

  if (
    modelRouteContinuationPolicy.kind === "choose_best_learning_target" &&
    chosenTarget
  ) {
    const looseChosen = normalizeTextLoose(chosenTarget);
    const existingMatch =
      existingTopics.find(
        (topic) => normalizeTextLoose(topic.topic_label) === looseChosen,
      ) ?? null;

    if (existingMatch) {
      return buildResolvedOutcome({
        topic: existingMatch,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind:
          activeTopic?.id === existingMatch.id
            ? "fallback_active_topic"
            : "matched_existing",
        vectorInfo: semanticVectorInfo,
        resolvedLabel: existingMatch.topic_label,
        matchConfidence: 0.62,
        usedLLMFallback: false,
        resolutionTrace: null,
        topicLabelingMode: "topic_labeler_primary",
        llmFallbackAllowedByMode: false,
        llmFallbackRecommendedByPolicy: false,
        llmFallbackAttempted: false,
      });
    }

    const createdTopic = buildRouteTopicFromResolvedLabel({
      existingTopics,
      resolvedLabel: chosenTarget,
    });

    return buildResolvedOutcome({
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: chosenTarget,
      matchConfidence: 0.62,
      usedLLMFallback: false,
      resolutionTrace: null,
      topicLabelingMode: "topic_labeler_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
    });
  }

  if (activeTopic) {
    return buildResolvedOutcome({
      topic: activeTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo: semanticVectorInfo,
      resolvedLabel: activeTopic.topic_label,
      matchConfidence:
        modelRouteContinuationPolicy.kind === "stay_active_after_model_failure"
          ? 0.3
          : 0.22,
      usedLLMFallback: false,
      resolutionTrace: null,
      topicLabelingMode: "topic_labeler_primary",
      llmFallbackAllowedByMode: false,
      llmFallbackRecommendedByPolicy: false,
      llmFallbackAttempted: false,
    });
  }

  const fallbackTopic = buildRouteTopicForContinuationOnly({
    existingTopics,
    fallbackLabel:
      modelRouteContinuationPolicy.kind === "invite_word_vomit"
        ? "Orientation"
        : "Unresolved Topic Intent",
  });

  return buildResolvedOutcome({
    topic: fallbackTopic,
    createdTopic: null,
    routeTopics: existingTopics,
    resolutionKind: "no_match",
    vectorInfo: semanticVectorInfo,
    resolvedLabel: null,
    matchConfidence: 0,
    usedLLMFallback: false,
    resolutionTrace: null,
    topicLabelingMode: "topic_labeler_primary",
    llmFallbackAllowedByMode: false,
    llmFallbackRecommendedByPolicy: false,
    llmFallbackAttempted: false,
  });
}

export function shouldPersistLearningSpaceForContinuation(
  policy: ModelRouteContinuationPolicy | null,
) {
  return policy?.should_update_learning_space !== false;
}

export function shouldOverrideLearnerMessageWithContinuationPolicy(
  policy: ModelRouteContinuationPolicy | null,
) {
  if (!policy?.suggested_learner_message) return false;

  return (
    policy.kind === "invite_word_vomit" ||
    policy.kind === "choose_best_learning_target" ||
    policy.kind === "stay_active_after_model_failure" ||
    policy.kind === "ask_lightweight_retry"
  );
}

export function buildSemanticEnrichmentStatusForContinuationPolicy(args: {
  policy: ModelRouteContinuationPolicy;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
}): SemanticEnrichmentStatus {
  const { policy, modelPolicyDecision } = args;
  const isModelFailure =
    !modelPolicyDecision ||
    modelPolicyDecision.decision_kind === "unusable_model_result";

  return {
    status: isModelFailure ? "blocked_model_failure" : "not_needed",
    needs_embedding_centroid: false,
    centroid_source: null,
    embedding_skip_reason: isModelFailure
      ? "model_failure_or_timeout"
      : "not_a_real_learning_topic",
    layout_status: policy.should_update_learning_space
      ? "temporary_position"
      : "no_learning_space_change",
    should_schedule_enrichment: false,
    enrichment_prompt_text: null,
  };
}
