import type { VectorInfo } from "@/types/contracts";

export type ResolutionDecisionAction =
  | "stay_on_active_topic"
  | "reuse_existing_topic"
  | "create_new_topic"
  | "no_confident_decision";

export type ResolutionTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

export type ResolutionTimingDebug = {
  enabled: boolean;
  total_ms: number;
  cache_hits: number;
  cache_misses: number;
  steps: ResolutionTimingStep[];
};

export type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

export type GranularityHint = "broad" | "medium" | "narrow" | "unknown";

export type FollowupSignals = {
  anaphoricFollowup: boolean;
  subpartFollowup: boolean;
  mixedFollowup: boolean;
  metaContinuation: boolean;
  returnToPrevious: boolean;
  explicitSwitch: boolean;
  explicitSwitchTarget: string | null;
};

export type TopicScoreBreakdown = {
  /** Canonical label-match score for new traces. */
  exactLabelMatch?: number;
  /** @deprecated Use exactLabelMatch instead. */
  exactNameMatch: number;
  containedMatch: number;
  conceptOverlap: number;
  questionOverlap: number;
  semanticRetrieval: number;
  retrievalRankBonus: number;
  activeTopicBonus: number;
  continuityBonus: number;
  switchPenalty: number;
  granularityAlignment: number;
  confidenceBonus: number;
  vaguePenalty: number;
  ambiguityPenalty: number;
  suspiciousLabelPenalty: number;
  pairedAlignment: number;
  bottleneckAlignment: number;
  mechanismAlignment: number;
  terminologyAlignment: number;
  domainCollapsePenalty: number;
  finalScore: number;
};

export type ResolutionHypothesisKind =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "ambiguous";

/**
 * Lightweight local trace shape for the archived/dormant topic-routing V3 path.
 *
 * This intentionally replaces the old dependency on:
 *   ./topic-routing/topic-routing-types
 *
 * That old folder is no longer used by the primary /api/message routing path
 * and can now be archived without breaking this trace contract.
 */
export type TopicRouterV3Debug = {
  enabled?: boolean;
  route?: string;
  route_version?: string;
  decision_kind?: string;
  selected_topic_id?: string | null;
  selected_topic_label?: string | null;
  /** @deprecated Use selected_topic_label instead. */
  selected_topic_name?: string | null;
  created_topic_label?: string | null;
  /** @deprecated Use created_topic_label instead. */
  created_topic_name?: string | null;
  confidence?: number | null;
  reasons?: string[];
  warnings?: string[];
  vector_info?: VectorInfo | null;
  [key: string]: unknown;
};

export type TopicResolutionTrace = {
  interpretation: {
    canonicalLabel: string | null;
    conceptSpan: string | null;
    questionAboutTopic: string | null;
    frame: MessageFrame;
    labelConfidence: number;
    specificity: string;
    granularityHint: GranularityHint;
    referencesActiveTopic: boolean;
    switchCue: boolean;
    continuationCue: boolean;
    subpartCue: boolean;
    suspiciousLabel: boolean;
    subpartLikeLabel: boolean;
    ambiguityFlags: string[];
    followupSignals: FollowupSignals;

    pairedTargetLike: boolean;
    bottleneckLike: boolean;
    mechanismLike: boolean;
    domainAnchorLike: boolean;
    terminologyBarrierLike: boolean;
    structureBarrierLike: boolean;
    conceptPhraseLike: boolean;
    questionSynthesisLike: boolean;
    questionSynthesisFrame: string | null;
    questionTriggerKind: string | null;
    questionWord: string | null;
    questionVerb: string | null;
    questionObject: string | null;
    synthesizedLabel: string | null;
    durableConceptLike: boolean;
    structurallyStrongLabel: boolean;
    nullOnlyEmotionalLike: boolean;
    labelerCreateRecommended: boolean;
  };

  candidates: Array<{
    topicId: string;
    topicLabel?: string;
    /** @deprecated Use topicLabel instead. */
    topicName: string;
    similarity: number;
    breakdown: TopicScoreBreakdown;
  }>;

  hypotheses: Array<{
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicLabel?: string | null;
    /** @deprecated Use topicLabel instead. */
    topicName: string | null;
    label: string | null;
  }>;

  winner: {
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicLabel?: string | null;
    /** @deprecated Use topicLabel instead. */
    topicName: string | null;
    label: string | null;
  };

  topGap: number;
  decisionAction: ResolutionDecisionAction;
  fallbackRecommended: boolean;
  timing?: ResolutionTimingDebug;

  /**
   * Optional archived-router debug payload.
   *
   * Kept for compatibility with older traces, but no longer imports types from
   * the dormant topic-routing folder.
   */
  topic_router_v3?: TopicRouterV3Debug;
};

export function emptyTopicResolutionTrace(): TopicResolutionTrace {
  return {
    interpretation: {
      canonicalLabel: null,
      conceptSpan: null,
      questionAboutTopic: null,
      frame: "general",
      labelConfidence: 0,
      specificity: "unknown",
      granularityHint: "unknown",
      referencesActiveTopic: false,
      switchCue: false,
      continuationCue: false,
      subpartCue: false,
      suspiciousLabel: false,
      subpartLikeLabel: false,
      ambiguityFlags: [],
      followupSignals: {
        anaphoricFollowup: false,
        subpartFollowup: false,
        mixedFollowup: false,
        metaContinuation: false,
        returnToPrevious: false,
        explicitSwitch: false,
        explicitSwitchTarget: null,
      },

      pairedTargetLike: false,
      bottleneckLike: false,
      mechanismLike: false,
      domainAnchorLike: false,
      terminologyBarrierLike: false,
      structureBarrierLike: false,
      conceptPhraseLike: false,
      questionSynthesisLike: false,
      questionSynthesisFrame: null,
      questionTriggerKind: null,
      questionWord: null,
      questionVerb: null,
      questionObject: null,
      synthesizedLabel: null,
      durableConceptLike: false,
      structurallyStrongLabel: false,
      nullOnlyEmotionalLike: false,
      labelerCreateRecommended: false,
    },
    candidates: [],
    hypotheses: [],
    winner: {
      kind: "ambiguous",
      score: 0,
      reasons: [],
      topicId: null,
      topicLabel: null,
      topicName: null,
      label: null,
    },
    topGap: 0,
    decisionAction: "no_confident_decision",
    fallbackRecommended: false,
  };
}

export function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_labels: [],
    // Legacy alias; remove after all callers migrate.
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}
