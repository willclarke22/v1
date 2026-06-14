import type {
  EmbeddingVector,
  ImportantRunInputs,
  TopicRoutingState,
  VectorInfo,
} from "@/types/contracts";
import {
  buildSeededTopicFromResolvedLabel,
  type RouteTopic,
} from "@/lib/topic-routing/route-topics";
import type { TopicResolutionTrace } from "@/lib/topic-routing/topic-routing-trace";
import type {
  ModelTopicRouteDecisionKind,
  ModelTopicRoutePolicyDecision,
} from "./policy";

export type ModelFirstTopicResolutionKind =
  | "matched_existing"
  | "created_new_candidate"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match";

export type ModelFirstTopicLabelingMode =
  | "topic_labeler_primary"
  | "topic_labeler_fallback"
  | "topic_labeler_unusable";

export type ModelRouteContinuationPolicyKind =
  | "route_authoritatively"
  | "invite_word_vomit"
  | "choose_best_learning_target"
  | "stay_active_after_model_failure"
  | "ask_lightweight_retry"
  | "no_learning_space_change";

export type ModelRouteContinuationPolicy = {
  kind: ModelRouteContinuationPolicyKind;
  should_create_learning_topic: boolean;
  should_update_learning_space: boolean;
  should_treat_as_learning_evidence: boolean;
  should_ask_user_to_choose: boolean;
  should_myway_choose_target: boolean;
  learner_message_intent:
    | "continue_routed_topic"
    | "invite_messy_context"
    | "guided_target_choice"
    | "service_recovery"
    | "silent_internal_fallback";
  suggested_learner_message: string | null;
  rationale: string;
  candidate_targets: string[];
  chosen_target: string | null;
};

export type SemanticEnrichmentStatusKind =
  | "not_needed"
  | "pending_embedding"
  | "embedding_ready"
  | "pending_centroid"
  | "centroid_ready"
  | "skipped_for_fast_model_route"
  | "blocked_model_failure";

export type SemanticEnrichmentStatus = {
  status: SemanticEnrichmentStatusKind;
  needs_embedding_centroid: boolean;
  centroid_source:
    | "topic_label_embedding"
    | "topic_message_embedding"
    | "topic_label_and_message_embedding"
    | "topic_label_only"
    | "topic_label_plus_initial_message"
    | "message_embedding"
    | null;
  embedding_skip_reason:
    | "model_policy_safe_authoritative_decision"
    | "model_failure_or_timeout"
    | "not_a_real_learning_topic"
    | null;
  layout_status:
    | "semantic_position_ready"
    | "temporary_position"
    | "no_learning_space_change";
  should_schedule_enrichment: boolean;
  enrichment_prompt_text: string | null;
};

export type ModelFirstRouteCentroidUpdatePlan = {
  topic_id: string;
  previous_embedding_count: number;
  new_embedding_count: number;
  update_method: "initialize" | "running_average" | "ema" | "none";
  alpha: number | null;
  embedding_model: string | null;
  updated_at: string;
  new_centroid: EmbeddingVector | null;
};

export type ModelFirstTopicResolutionDebug = {
  topic_labeling_mode: ModelFirstTopicLabelingMode;
  authority_source: "topic_labeler_policy" | "topic_labeler_fallback";
  model_policy_used_as_authority: boolean;
  model_policy_decision_kind: ModelTopicRouteDecisionKind | null;
  model_policy_usable: boolean | null;
  model_policy_reasons: string[];
  resolution_kind: ModelFirstTopicResolutionKind;
  resolved_label: string | null;
  match_confidence: number;
  resolution_trace: TopicResolutionTrace | null;
  model_route_continuation_policy: ModelRouteContinuationPolicy;
  semantic_enrichment_status: SemanticEnrichmentStatus;
};

export type ModelFirstTopicResolutionOutcome = {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: ModelFirstTopicResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  usedLLMFallback: false;
  resolutionTrace: TopicResolutionTrace | null;
  semanticTopicRouting: TopicRoutingState | null;
  centroidUpdatePlan: ModelFirstRouteCentroidUpdatePlan | null;
  modelRouteContinuationPolicy: ModelRouteContinuationPolicy;
  semanticEnrichmentStatus: SemanticEnrichmentStatus;
  debug: ModelFirstTopicResolutionDebug;
};

const MODEL_AUTHORITY_SOURCE = "topic_labeler_policy" as const;
const MODEL_FALLBACK_AUTHORITY_SOURCE = "topic_labeler_fallback" as const;

type ModelResolutionAuthoritySource =
  | typeof MODEL_AUTHORITY_SOURCE
  | typeof MODEL_FALLBACK_AUTHORITY_SOURCE;

const MODEL_MATCH_CONFIDENCE = {
  stayActive: 0.86,
  switchExisting: 0.88,
  createNew: 0.86,
  conservativeActiveFallback: 0.32,
  conservativeNoMatch: 0,
} as const;

function compactUniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const key = normalizeTextLoose(trimmed);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(trimmed);
  }

  return output;
}

function getPolicyResolvedLabel(
  decision: ModelTopicRoutePolicyDecision | null,
  activeTopic: RouteTopic | null,
) {
  return (
    decision?.extracted_label?.trim() ||
    getPolicyMatchedTopicLabel(decision) ||
    getRouteTopicLabel(decision?.target_topic ?? null) ||
    getRouteTopicLabel(activeTopic) ||
    null
  );
}

function isModelFailureDecision(
  decision: ModelTopicRoutePolicyDecision | null,
) {
  return !decision || decision.decision_kind === "unusable_model_result";
}

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_labels: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTextLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRouteTopicLabel(topic: RouteTopic | null): string | null {
  return topic?.topic_label?.trim() || null;
}

function getPolicyMatchedTopicLabel(
  decision: ModelTopicRoutePolicyDecision | null,
): string | null {
  return decision?.matched_topic_label?.trim() || null;
}

function findTopicByLabel(existingTopics: RouteTopic[], label: string | null) {
  if (!label) return null;

  const target = normalizeTextLoose(label);

  return (
    existingTopics.find((topic) => {
      const topicLabel = getRouteTopicLabel(topic);
      return topicLabel ? normalizeTextLoose(topicLabel) === target : false;
    }) ?? null
  );
}

function asEmbeddingVector(value: unknown): EmbeddingVector | null {
  if (!Array.isArray(value)) return null;

  const vector = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (!vector.length) return null;
  if (vector.length !== value.length) return null;

  return vector;
}

function topicHasTopicLabelEmbedding(topic: RouteTopic | null): boolean {
  if (!topic) return false;

  return Boolean(asEmbeddingVector(topic.topic_label_embedding_centroid ?? null));
}

function topicHasTopicMessageEmbedding(topic: RouteTopic | null): boolean {
  if (!topic) return false;

  return Boolean(
    asEmbeddingVector(topic.topic_message_embedding_centroid ?? null),
  );
}

function topicHasCanonicalEmbeddings(topic: RouteTopic | null): boolean {
  return (
    topicHasTopicLabelEmbedding(topic) && topicHasTopicMessageEmbedding(topic)
  );
}

function buildTopicMessageEnrichmentPrompt(args: {
  topicLabel: string;
  initialMessage?: string | null;
}) {
  const { topicLabel, initialMessage } = args;

  return initialMessage
    ? `Topic: ${topicLabel}
Learner context: ${initialMessage}`
    : `Topic: ${topicLabel}`;
}

function buildCreatedTopicMessageEmbeddingPlan(args: {
  createdTopic: RouteTopic | null;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
}): ModelFirstRouteCentroidUpdatePlan | null {
  const { createdTopic, messageEmbedding, embeddingModel } = args;
  const centroid = asEmbeddingVector(messageEmbedding);

  if (!createdTopic || !centroid) return null;

  return {
    topic_id: createdTopic.id,
    previous_embedding_count: 0,
    new_embedding_count: 1,
    update_method: "initialize",
    alpha: null,
    embedding_model: embeddingModel,
    updated_at: nowIso(),
    new_centroid: centroid,
  };
}

function buildAuthoritativeContinuationPolicy(args: {
  decisionKind: "create_new" | "switch_existing" | "stay_active";
  resolvedLabel: string | null;
  activeTopicLabel: string | null;
}): ModelRouteContinuationPolicy {
  const { decisionKind, resolvedLabel, activeTopicLabel } = args;
  const chosenTarget = resolvedLabel ?? activeTopicLabel;

  return {
    kind: "route_authoritatively",
    should_create_learning_topic: decisionKind === "create_new",
    should_update_learning_space: true,
    should_treat_as_learning_evidence: true,
    should_ask_user_to_choose: false,
    should_myway_choose_target: true,
    learner_message_intent: "continue_routed_topic",
    suggested_learner_message: null,
    rationale:
      decisionKind === "stay_active"
        ? "The model judged the message as a continuation of the active topic."
        : decisionKind === "switch_existing"
          ? "The model judged the message as referring to an existing topic."
          : "The model judged the message as a clean new learning topic.",
    candidate_targets: chosenTarget ? [chosenTarget] : [],
    chosen_target: chosenTarget,
  };
}

function buildClarifyNoTopicContinuationPolicy(): ModelRouteContinuationPolicy {
  return {
    kind: "invite_word_vomit",
    should_create_learning_topic: false,
    should_update_learning_space: false,
    should_treat_as_learning_evidence: false,
    should_ask_user_to_choose: false,
    should_myway_choose_target: false,
    learner_message_intent: "invite_messy_context",
    suggested_learner_message:
      "I don’t need the exact topic label yet. Just dump whatever feels confusing — words, examples, feelings, half-thoughts, anything. I’ll help turn it into something we can work with.",
    rationale:
      "The model found no stable topic object yet, so MyWay should invite raw context rather than create a permanent topic.",
    candidate_targets: [],
    chosen_target: null,
  };
}

function buildClarifyTopicIntentContinuationPolicy(args: {
  candidateTargets: string[];
  chosenTarget: string | null;
}): ModelRouteContinuationPolicy {
  const { candidateTargets, chosenTarget } = args;
  const listedTargets = candidateTargets.length
    ? candidateTargets.join(", ")
    : "a few possible directions";

  return {
    kind: "choose_best_learning_target",
    should_create_learning_topic: Boolean(chosenTarget),
    should_update_learning_space: Boolean(chosenTarget),
    should_treat_as_learning_evidence: Boolean(chosenTarget),
    should_ask_user_to_choose: false,
    should_myway_choose_target: true,
    learner_message_intent: "guided_target_choice",
    suggested_learner_message: chosenTarget
      ? `I see a few possible targets here: ${listedTargets}. I’m going to start with ${chosenTarget}, because that seems like the best starting point for making the rest easier.`
      : `I see a few possible targets here: ${listedTargets}. I’m going to start with the piece that seems most foundational, then we can connect the rest after.`,
    rationale:
      "The model found multiple plausible topic targets. MyWay should choose the most helpful instructional starting point instead of forcing the learner to choose manually.",
    candidate_targets: candidateTargets,
    chosen_target: chosenTarget,
  };
}

function buildModelFailureContinuationPolicy(args: {
  activeTopic: RouteTopic | null;
  reason: string;
}): ModelRouteContinuationPolicy {
  const { activeTopic, reason } = args;
  const activeTopicLabel = getRouteTopicLabel(activeTopic);

  if (activeTopic && activeTopicLabel) {
    return {
      kind: "stay_active_after_model_failure",
      should_create_learning_topic: false,
      should_update_learning_space: true,
      should_treat_as_learning_evidence: false,
      should_ask_user_to_choose: false,
      should_myway_choose_target: false,
      learner_message_intent: "service_recovery",
      suggested_learner_message:
        "I’m having trouble classifying that cleanly right now, so I’m going to keep us anchored on the current topic for the moment. Add one more sentence, even messy, and I’ll re-check the target.",
      rationale: `The model result was unusable (${reason}). MyWay should avoid creating a permanent topic and stay anchored to the active topic.`,
      candidate_targets: [activeTopicLabel],
      chosen_target: activeTopicLabel,
    };
  }

  return {
    kind: "ask_lightweight_retry",
    should_create_learning_topic: false,
    should_update_learning_space: false,
    should_treat_as_learning_evidence: false,
    should_ask_user_to_choose: false,
    should_myway_choose_target: false,
    learner_message_intent: "service_recovery",
    suggested_learner_message:
      "I’m having trouble turning that into a stable topic right now. Add one more messy sentence about what part feels confusing, and I’ll try again.",
    rationale: `The model result was unusable (${reason}). With no active topic, MyWay should avoid polluting the learning space.`,
    candidate_targets: [],
    chosen_target: null,
  };
}

function buildNoLearningSpaceChangePolicy(args: {
  reason: string;
}): ModelRouteContinuationPolicy {
  return {
    kind: "no_learning_space_change",
    should_create_learning_topic: false,
    should_update_learning_space: false,
    should_treat_as_learning_evidence: false,
    should_ask_user_to_choose: false,
    should_myway_choose_target: false,
    learner_message_intent: "silent_internal_fallback",
    suggested_learner_message: null,
    rationale: args.reason,
    candidate_targets: [],
    chosen_target: null,
  };
}

function buildSemanticEnrichmentStatus(args: {
  createdTopic: RouteTopic | null;
  targetTopic?: RouteTopic | null;
  messageEmbeddingPlan: ModelFirstRouteCentroidUpdatePlan | null;
  messageEmbedding: EmbeddingVector | null;
  embeddingSkippedForFastRoute: boolean;
  blockedByModelFailure: boolean;
  initialMessage?: string | null;
  resolvedLabel?: string | null;
}): SemanticEnrichmentStatus {
  const {
    createdTopic,
    targetTopic,
    messageEmbeddingPlan,
    messageEmbedding,
    embeddingSkippedForFastRoute,
    blockedByModelFailure,
    initialMessage,
    resolvedLabel,
  } = args;

  if (blockedByModelFailure) {
    return {
      status: "blocked_model_failure",
      needs_embedding_centroid: false,
      centroid_source: null,
      embedding_skip_reason: "model_failure_or_timeout",
      layout_status: "no_learning_space_change",
      should_schedule_enrichment: false,
      enrichment_prompt_text: null,
    };
  }

  const topicForSemanticCheck = createdTopic ?? targetTopic ?? null;
  const topicLabel =
    resolvedLabel?.trim() ??
    getRouteTopicLabel(createdTopic) ??
    getRouteTopicLabel(targetTopic ?? null) ??
    null;

  if (!topicForSemanticCheck || !topicLabel) {
    return {
      status: "not_needed",
      needs_embedding_centroid: false,
      centroid_source: null,
      embedding_skip_reason: null,
      layout_status: "no_learning_space_change",
      should_schedule_enrichment: false,
      enrichment_prompt_text: null,
    };
  }

  const hasExistingCanonicalEmbeddings =
    topicHasCanonicalEmbeddings(topicForSemanticCheck);
  const hasTopicLabelEmbedding =
    topicHasTopicLabelEmbedding(topicForSemanticCheck);
  const hasTopicMessageEmbedding =
    topicHasTopicMessageEmbedding(topicForSemanticCheck);

  const hasFreshMessageEmbedding =
    Boolean(messageEmbeddingPlan?.new_centroid) &&
    Boolean(asEmbeddingVector(messageEmbedding)?.length);

  if (hasExistingCanonicalEmbeddings) {
    return {
      status: "embedding_ready",
      needs_embedding_centroid: false,
      centroid_source: "topic_label_and_message_embedding",
      embedding_skip_reason: null,
      layout_status: "semantic_position_ready",
      should_schedule_enrichment: false,
      enrichment_prompt_text: null,
    };
  }

  const enrichmentPromptText = buildTopicMessageEnrichmentPrompt({
    topicLabel,
    initialMessage: initialMessage ?? null,
  });

  if (hasFreshMessageEmbedding) {
    return {
      status: hasTopicLabelEmbedding ? "embedding_ready" : "pending_embedding",
      needs_embedding_centroid: !hasTopicLabelEmbedding,
      centroid_source: hasTopicLabelEmbedding
        ? "topic_label_and_message_embedding"
        : "topic_message_embedding",
      embedding_skip_reason: null,
      layout_status: hasTopicLabelEmbedding
        ? "semantic_position_ready"
        : "temporary_position",
      should_schedule_enrichment: true,
      enrichment_prompt_text: enrichmentPromptText,
    };
  }

  return {
    status: embeddingSkippedForFastRoute
      ? "skipped_for_fast_model_route"
      : "pending_embedding",
    needs_embedding_centroid: true,
    centroid_source:
      hasTopicLabelEmbedding || hasTopicMessageEmbedding
        ? hasTopicLabelEmbedding
          ? "topic_label_embedding"
          : "topic_message_embedding"
        : "topic_label_plus_initial_message",
    embedding_skip_reason: embeddingSkippedForFastRoute
      ? "model_policy_safe_authoritative_decision"
      : null,
    layout_status: "temporary_position",
    should_schedule_enrichment: true,
    enrichment_prompt_text: enrichmentPromptText,
  };
}

function buildModelResolutionDebug(args: {
  authoritySource: ModelResolutionAuthoritySource;
  modelPolicyUsedAsAuthority: boolean;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  resolutionKind: ModelFirstTopicResolutionKind;
  resolvedLabel: string | null;
  matchConfidence: number;
  continuationPolicy: ModelRouteContinuationPolicy;
  semanticEnrichmentStatus: SemanticEnrichmentStatus;
  resolutionTrace?: TopicResolutionTrace | null;
}): ModelFirstTopicResolutionDebug {
  return {
    topic_labeling_mode: args.modelPolicyUsedAsAuthority
      ? "topic_labeler_primary"
      : args.modelPolicyDecision
        ? "topic_labeler_fallback"
        : "topic_labeler_unusable",
    authority_source: args.authoritySource,
    model_policy_used_as_authority: args.modelPolicyUsedAsAuthority,
    model_policy_decision_kind: args.modelPolicyDecision?.decision_kind ?? null,
    model_policy_usable: args.modelPolicyDecision?.usable ?? null,
    model_policy_reasons: args.modelPolicyDecision?.reasons ?? [],
    resolution_kind: args.resolutionKind,
    resolved_label: args.resolvedLabel,
    match_confidence: args.matchConfidence,
    resolution_trace: args.resolutionTrace ?? null,
    model_route_continuation_policy: args.continuationPolicy,
    semantic_enrichment_status: args.semanticEnrichmentStatus,
  };
}

function buildOutcome(args: {
  topic: RouteTopic;
  createdTopic: RouteTopic | null;
  routeTopics: RouteTopic[];
  resolutionKind: ModelFirstTopicResolutionKind;
  vectorInfo: VectorInfo;
  resolvedLabel: string | null;
  matchConfidence: number;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  modelPolicyUsedAsAuthority: boolean;
  authoritySource: ModelResolutionAuthoritySource;
  continuationPolicy: ModelRouteContinuationPolicy;
  semanticEnrichmentStatus: SemanticEnrichmentStatus;
  centroidUpdatePlan?: ModelFirstRouteCentroidUpdatePlan | null;
  semanticTopicRouting?: TopicRoutingState | null;
  resolutionTrace?: TopicResolutionTrace | null;
}): ModelFirstTopicResolutionOutcome {
  return {
    topic: args.topic,
    createdTopic: args.createdTopic,
    routeTopics: args.routeTopics,
    resolutionKind: args.resolutionKind,
    vectorInfo: args.vectorInfo,
    resolvedLabel: args.resolvedLabel,
    matchConfidence: args.matchConfidence,
    usedLLMFallback: false,
    resolutionTrace: args.resolutionTrace ?? null,
    semanticTopicRouting: args.semanticTopicRouting ?? null,
    centroidUpdatePlan: args.centroidUpdatePlan ?? null,
    modelRouteContinuationPolicy: args.continuationPolicy,
    semanticEnrichmentStatus: args.semanticEnrichmentStatus,
    debug: buildModelResolutionDebug({
      authoritySource: args.authoritySource,
      modelPolicyUsedAsAuthority: args.modelPolicyUsedAsAuthority,
      modelPolicyDecision: args.modelPolicyDecision,
      resolutionKind: args.resolutionKind,
      resolvedLabel: args.resolvedLabel,
      matchConfidence: args.matchConfidence,
      continuationPolicy: args.continuationPolicy,
      semanticEnrichmentStatus: args.semanticEnrichmentStatus,
      resolutionTrace: args.resolutionTrace ?? null,
    }),
  };
}

function buildRouteTopicFromResolvedLabel(args: {
  existingTopics: RouteTopic[];
  resolvedLabel: string;
}): RouteTopic {
  return buildSeededTopicFromResolvedLabel({
    existingTopics: args.existingTopics,
    resolvedLabel: args.resolvedLabel,
  });
}

export function isModelPolicySafePositiveDecision(
  decision: ModelTopicRoutePolicyDecision | null,
): decision is ModelTopicRoutePolicyDecision & {
  usable: true;
  decision_kind: "create_new" | "switch_existing" | "stay_active";
} {
  if (!decision?.usable) return false;

  return (
    decision.decision_kind === "create_new" ||
    decision.decision_kind === "switch_existing" ||
    decision.decision_kind === "stay_active"
  );
}

export function buildModelRouteContinuationPolicy(args: {
  activeTopic: RouteTopic | null;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
}): ModelRouteContinuationPolicy {
  const { activeTopic, modelPolicyDecision } = args;
  const activeTopicLabel = getRouteTopicLabel(activeTopic);
  const matchedTopicLabel = getPolicyMatchedTopicLabel(modelPolicyDecision);

  if (isModelPolicySafePositiveDecision(modelPolicyDecision)) {
    return buildAuthoritativeContinuationPolicy({
      decisionKind: modelPolicyDecision.decision_kind,
      resolvedLabel: getPolicyResolvedLabel(modelPolicyDecision, activeTopic),
      activeTopicLabel,
    });
  }

  if (!modelPolicyDecision) {
    return buildModelFailureContinuationPolicy({
      activeTopic,
      reason: "missing_model_policy_decision",
    });
  }

  if (modelPolicyDecision.decision_kind === "clarify_no_topic") {
    return buildClarifyNoTopicContinuationPolicy();
  }

  if (modelPolicyDecision.decision_kind === "clarify_topic_intent") {
    const targetTopicLabel = getRouteTopicLabel(
      modelPolicyDecision.target_topic ?? null,
    );
    const candidateTargets = compactUniqueStrings([
      modelPolicyDecision.extracted_label,
      matchedTopicLabel,
      targetTopicLabel,
    ]);

    return buildClarifyTopicIntentContinuationPolicy({
      candidateTargets,
      chosenTarget:
        targetTopicLabel ??
        modelPolicyDecision.extracted_label?.trim() ??
        matchedTopicLabel ??
        null,
    });
  }

  if (modelPolicyDecision.decision_kind === "unusable_model_result") {
    return buildModelFailureContinuationPolicy({
      activeTopic,
      reason: modelPolicyDecision.reasons.join("; ") || "unusable_model_result",
    });
  }

  return buildNoLearningSpaceChangePolicy({
    reason: `Unhandled model policy decision: ${String(
      modelPolicyDecision.decision_kind,
    )}`,
  });
}

export function buildModelFirstTopicResolutionOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopic: RouteTopic | null;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  semanticVectorInfo?: VectorInfo | null;
  messageEmbedding?: EmbeddingVector | null;
  embeddingModel?: string | null;
  initialMessage?: string | null;
  embeddingSkippedForFastRoute?: boolean;
}): ModelFirstTopicResolutionOutcome | null {
  const {
    existingTopics,
    activeTopic,
    modelPolicyDecision,
    semanticVectorInfo,
    messageEmbedding,
    embeddingModel,
    initialMessage,
    embeddingSkippedForFastRoute,
  } = args;

  const vectorInfo = semanticVectorInfo ?? emptyVectorInfo();

  if (!isModelPolicySafePositiveDecision(modelPolicyDecision)) {
    return null;
  }

  if (modelPolicyDecision.decision_kind === "stay_active") {
    if (!activeTopic) return null;

    const activeTopicLabel = getRouteTopicLabel(activeTopic);

    const continuationPolicy = buildModelRouteContinuationPolicy({
      activeTopic,
      modelPolicyDecision,
    });

    const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
      createdTopic: null,
      targetTopic: activeTopic,
      messageEmbeddingPlan: null,
      messageEmbedding: messageEmbedding ?? null,
      embeddingSkippedForFastRoute: Boolean(embeddingSkippedForFastRoute),
      blockedByModelFailure: false,
      initialMessage: initialMessage ?? null,
      resolvedLabel: activeTopicLabel,
    });

    return buildOutcome({
      topic: activeTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo,
      resolvedLabel: activeTopicLabel,
      matchConfidence: MODEL_MATCH_CONFIDENCE.stayActive,
      modelPolicyDecision,
      modelPolicyUsedAsAuthority: true,
      authoritySource: MODEL_AUTHORITY_SOURCE,
      continuationPolicy,
      semanticEnrichmentStatus,
    });
  }

  if (modelPolicyDecision.decision_kind === "switch_existing") {
    const matchedTopic =
      modelPolicyDecision.target_topic ??
      findTopicByLabel(
        existingTopics,
        getPolicyMatchedTopicLabel(modelPolicyDecision),
      );

    if (!matchedTopic) return null;

    const matchedTopicLabel = getRouteTopicLabel(matchedTopic);

    const continuationPolicy = buildModelRouteContinuationPolicy({
      activeTopic,
      modelPolicyDecision,
    });

    const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
      createdTopic: null,
      targetTopic: matchedTopic,
      messageEmbeddingPlan: null,
      messageEmbedding: messageEmbedding ?? null,
      embeddingSkippedForFastRoute: Boolean(embeddingSkippedForFastRoute),
      blockedByModelFailure: false,
      initialMessage: initialMessage ?? null,
      resolvedLabel: modelPolicyDecision.extracted_label ?? matchedTopicLabel,
    });

    return buildOutcome({
      topic: matchedTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind:
        activeTopic?.id === matchedTopic.id
          ? "fallback_active_topic"
          : "matched_existing",
      vectorInfo,
      resolvedLabel: modelPolicyDecision.extracted_label ?? matchedTopicLabel,
      matchConfidence: MODEL_MATCH_CONFIDENCE.switchExisting,
      modelPolicyDecision,
      modelPolicyUsedAsAuthority: true,
      authoritySource: MODEL_AUTHORITY_SOURCE,
      continuationPolicy,
      semanticEnrichmentStatus,
    });
  }

  if (modelPolicyDecision.decision_kind === "create_new") {
    const resolvedLabel = modelPolicyDecision.extracted_label;
    if (!resolvedLabel) return null;

    const existingMatch = findTopicByLabel(existingTopics, resolvedLabel);

    if (existingMatch) {
      const continuationPolicy = buildModelRouteContinuationPolicy({
        activeTopic,
        modelPolicyDecision: {
          ...modelPolicyDecision,
          target_topic: existingMatch,
        },
      });

      const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
        createdTopic: null,
        targetTopic: existingMatch,
        messageEmbeddingPlan: null,
        messageEmbedding: messageEmbedding ?? null,
        embeddingSkippedForFastRoute: Boolean(embeddingSkippedForFastRoute),
        blockedByModelFailure: false,
        initialMessage: initialMessage ?? null,
        resolvedLabel,
      });

      return buildOutcome({
        topic: existingMatch,
        createdTopic: null,
        routeTopics: existingTopics,
        resolutionKind:
          activeTopic?.id === existingMatch.id
            ? "fallback_active_topic"
            : "matched_existing",
        vectorInfo,
        resolvedLabel,
        matchConfidence: MODEL_MATCH_CONFIDENCE.switchExisting,
        modelPolicyDecision,
        modelPolicyUsedAsAuthority: true,
        authoritySource: MODEL_AUTHORITY_SOURCE,
        continuationPolicy,
        semanticEnrichmentStatus,
      });
    }

    const createdTopic = buildRouteTopicFromResolvedLabel({
      existingTopics,
      resolvedLabel,
    });

    const messageEmbeddingPlan = buildCreatedTopicMessageEmbeddingPlan({
      createdTopic,
      messageEmbedding: messageEmbedding ?? null,
      embeddingModel: embeddingModel ?? null,
    });

    const continuationPolicy = buildModelRouteContinuationPolicy({
      activeTopic,
      modelPolicyDecision,
    });

    const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
      createdTopic,
      targetTopic: createdTopic,
      messageEmbeddingPlan,
      messageEmbedding: messageEmbedding ?? null,
      embeddingSkippedForFastRoute: Boolean(embeddingSkippedForFastRoute),
      blockedByModelFailure: false,
      initialMessage: initialMessage ?? null,
      resolvedLabel,
    });

    return buildOutcome({
      topic: createdTopic,
      createdTopic,
      routeTopics: [...existingTopics, createdTopic],
      resolutionKind: "created_new_candidate",
      vectorInfo,
      resolvedLabel,
      matchConfidence: MODEL_MATCH_CONFIDENCE.createNew,
      modelPolicyDecision,
      modelPolicyUsedAsAuthority: true,
      authoritySource: MODEL_AUTHORITY_SOURCE,
      continuationPolicy,
      semanticEnrichmentStatus,
      centroidUpdatePlan: messageEmbeddingPlan,
    });
  }

  return null;
}

export function buildModelFirstConservativeFallbackOutcome(args: {
  existingTopics: RouteTopic[];
  activeTopic: RouteTopic | null;
  modelPolicyDecision: ModelTopicRoutePolicyDecision | null;
  semanticVectorInfo?: VectorInfo | null;
  currentInteractionContext?: ImportantRunInputs["current_interaction_context"];
}): ModelFirstTopicResolutionOutcome {
  const { existingTopics, activeTopic, modelPolicyDecision, semanticVectorInfo } =
    args;

  const vectorInfo = semanticVectorInfo ?? emptyVectorInfo();
  const continuationPolicy = buildModelRouteContinuationPolicy({
    activeTopic,
    modelPolicyDecision,
  });

  const blockedByModelFailure = isModelFailureDecision(modelPolicyDecision);

  if (activeTopic) {
    const activeTopicLabel = getRouteTopicLabel(activeTopic);

    const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
      createdTopic: null,
      targetTopic: activeTopic,
      messageEmbeddingPlan: null,
      messageEmbedding: null,
      embeddingSkippedForFastRoute: false,
      blockedByModelFailure,
      resolvedLabel: activeTopicLabel,
    });

    return buildOutcome({
      topic: activeTopic,
      createdTopic: null,
      routeTopics: existingTopics,
      resolutionKind: "fallback_active_topic",
      vectorInfo,
      resolvedLabel: activeTopicLabel,
      matchConfidence: MODEL_MATCH_CONFIDENCE.conservativeActiveFallback,
      modelPolicyDecision,
      modelPolicyUsedAsAuthority: false,
      authoritySource: MODEL_FALLBACK_AUTHORITY_SOURCE,
      continuationPolicy,
      semanticEnrichmentStatus,
    });
  }

  const semanticEnrichmentStatus = buildSemanticEnrichmentStatus({
    createdTopic: null,
    messageEmbeddingPlan: null,
    messageEmbedding: null,
    embeddingSkippedForFastRoute: false,
    blockedByModelFailure: true,
  });

  const fallbackTopic = buildRouteTopicFromResolvedLabel({
    existingTopics,
    resolvedLabel: "Untitled Topic",
  });

  return buildOutcome({
    topic: fallbackTopic,
    createdTopic: null,
    routeTopics: existingTopics,
    resolutionKind: "no_match",
    vectorInfo,
    resolvedLabel: null,
    matchConfidence: MODEL_MATCH_CONFIDENCE.conservativeNoMatch,
    modelPolicyDecision,
    modelPolicyUsedAsAuthority: false,
    authoritySource: MODEL_FALLBACK_AUTHORITY_SOURCE,
    continuationPolicy,
    semanticEnrichmentStatus,
  });
}
