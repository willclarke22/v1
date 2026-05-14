/**
 * Dormant semantic-centroid routing module.
 *
 * This file is not currently used by the primary /api/message topic-routing path.
 * The active path is V3 model-first routing in lib/runtime/topic-labeling-model/*.
 *
 * Keep this module for a future local-centroid routing layer:
 * V3 labeler result + topic_concept_embedding centroids
 * -> switch/create/create-and-link decisions.
 *
 * Do not reintroduce the archived deterministic topic labeler here.
 */

import type {
  CurrentInteractionContext,
  EmbeddingVector,
  VectorInfo,
} from "@/types/contracts";
import {
  buildVectorInfoFromCentroidRanking,
  getSemanticCentroidCountForTopic,
  getSemanticCentroidForTopic,
  rankTopicsByEmbeddingCentroid,
  updateCentroidRunningAverage,
  type SemanticCentroidRankedTopic,
  type TopicWithSemanticCentroid,
} from "./topic-centroids";
import {
  DEFAULT_SEMANTIC_CENTROID_ROUTING_THRESHOLDS,
  decideSemanticCentroidRoutingPolicy,
} from "./topic-routing-policy";
import type {
  SemanticCentroidPolicyInput,
  SemanticCentroidRouteInput,
  SemanticCentroidRoutingResult,
  SemanticCentroidRoutingThresholds,
  TopicCentroidUpdatePlan,
  TopicLabelingResult,
  TopicNameSuggestion,
  TopicRoutingCandidateEvidence,
  TopicRoutingDebug,
  TopicRoutingDecision,
  TopicRoutingTinyFollowupSignal,
} from "./topic-routing-types";

function normalizeSurface(text: string | null | undefined) {
  return (text ?? "")
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

function normalizeLoose(text: string | null | undefined) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseSimple(text: string) {
  const smallWords = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "from",
    "in",
    "into",
    "nor",
    "of",
    "on",
    "or",
    "the",
    "to",
    "vs",
    "with",
  ]);

  return normalizeSurface(text)
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();

      if (lower === "vs" || lower === "versus") return "vs";
      if (index > 0 && smallWords.has(lower)) return lower;
      if (/^[A-Z0-9+#'-]+$/.test(word) && word.length <= 6) return word;

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function tokenCount(text: string) {
  const normalized = normalizeLoose(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function stripTrailingPunctuation(text: string) {
  return normalizeSurface(text).replace(/[.?!,;:]+$/g, "").trim();
}

function cleanTopicName(text: string | null | undefined) {
  if (!text) return null;

  const cleaned = stripTrailingPunctuation(text)
    .replace(/^(?:about|on|with|for)\s+/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const tokens = tokenCount(cleaned);
  if (tokens === 0 || tokens > 10) return null;

  return titleCaseSimple(cleaned);
}

function getCandidateLabel(labeling?: TopicLabelingResult | null) {
  return cleanTopicName(labeling?.topic_decision?.canonical_label ?? null);
}

function getCandidateConfidence(labeling?: TopicLabelingResult | null) {
  const confidence = labeling?.topic_decision?.confidence;
  return typeof confidence === "number" && Number.isFinite(confidence)
    ? confidence
    : null;
}

function getCandidateShouldCreateNew(labeling?: TopicLabelingResult | null) {
  const value = labeling?.topic_decision?.should_create_new_topic;
  return typeof value === "boolean" ? value : null;
}

function getCandidateShouldReuseExisting(labeling?: TopicLabelingResult | null) {
  const value = labeling?.topic_decision?.should_reuse_existing_topic;
  return typeof value === "boolean" ? value : null;
}

function getCandidateAmbiguityFlags(labeling?: TopicLabelingResult | null) {
  const flags = labeling?.diagnostics?.ambiguity_flags;
  return Array.isArray(flags)
    ? flags.filter((flag): flag is string => typeof flag === "string")
    : [];
}

function getInterpretationFallbackLabel(labeling?: TopicLabelingResult | null) {
  const conceptSpan = cleanTopicName(labeling?.interpretation?.concept_span ?? null);
  if (conceptSpan) return conceptSpan;

  const questionAboutTopic = cleanTopicName(
    labeling?.interpretation?.question_about_topic ?? null,
  );
  if (questionAboutTopic) return questionAboutTopic;

  const synthesizedLabel = cleanTopicName(
    labeling?.interpretation?.synthesized_label ?? null,
  );
  if (synthesizedLabel) return synthesizedLabel;

  return null;
}

/**
 * Topic naming is intentionally separate from routing.
 *
 * The V3 router should decide create/switch primarily from embedding-centroid
 * similarity. This helper only suggests a label if the policy decides a new
 * topic should be created.
 */
export function suggestTopicNameFromLabeling(args: {
  rawMessage: string;
  labeling?: TopicLabelingResult | null;
}): TopicNameSuggestion {
  const { rawMessage, labeling } = args;

  const candidateLabel = getCandidateLabel(labeling);
  if (candidateLabel) {
    return {
      label: candidateLabel,
      source: "candidate_labeler",
      confidence: getCandidateConfidence(labeling),
      reasons: ["Candidate labeler produced a canonical topic label."],
    };
  }

  const interpretationLabel = getInterpretationFallbackLabel(labeling);
  if (interpretationLabel) {
    return {
      label: interpretationLabel,
      source: "candidate_interpretation",
      confidence: getCandidateConfidence(labeling),
      reasons: ["Candidate interpretation produced a usable topic phrase."],
    };
  }

  const fallback = cleanTopicName(rawMessage);

  return {
    label: fallback,
    source: fallback ? "raw_message_fallback" : "none",
    confidence: fallback ? 0.35 : null,
    reasons: fallback
      ? ["No candidate label was available, so the raw message was used as a temporary topic name."]
      : ["No usable topic label was available."],
  };
}

function normalizeVectorInfo(vectorInfo?: VectorInfo | null): VectorInfo {
  if (!vectorInfo) {
    return {
      top_k_topic_ids: [],
      top_k_topic_names: [],
      top_k_similarity_scores: [],
    };
  }

  return {
    top_k_topic_ids: Array.isArray(vectorInfo.top_k_topic_ids)
      ? vectorInfo.top_k_topic_ids.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    top_k_topic_names: Array.isArray(vectorInfo.top_k_topic_names)
      ? vectorInfo.top_k_topic_names.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    top_k_similarity_scores: Array.isArray(vectorInfo.top_k_similarity_scores)
      ? vectorInfo.top_k_similarity_scores.filter(
          (item): item is number =>
            typeof item === "number" && Number.isFinite(item),
        )
      : [],
  };
}

function mergeThresholds(
  override?: Partial<SemanticCentroidRoutingThresholds>,
): SemanticCentroidRoutingThresholds {
  return {
    ...DEFAULT_SEMANTIC_CENTROID_ROUTING_THRESHOLDS,
    ...(override ?? {}),
  };
}

function findActiveTopic(
  topics: TopicWithSemanticCentroid[],
  activeTopicId?: string | null,
) {
  if (!activeTopicId) return null;
  return topics.find((topic) => topic.id === activeTopicId) ?? null;
}

/**
 * The only wording-based exception in V3.
 *
 * Embeddings should do the real routing. This function exists because tiny
 * messages like "why?", "again?", or "what do you mean?" are not semantically
 * meaningful without the active conversation context.
 */
export function detectTinyFollowupSignal(args: {
  rawMessage: string;
  currentInteractionContext?: CurrentInteractionContext | null;
}): TopicRoutingTinyFollowupSignal {
  const raw = normalizeSurface(args.rawMessage);
  const loose = normalizeLoose(raw);
  const count = tokenCount(raw);

  if (
    args.currentInteractionContext?.run_kind === "clarify_followup" ||
    args.currentInteractionContext?.is_response_to_delivered_probe === true
  ) {
    return {
      is_tiny_followup: true,
      reason: "current_interaction_context_continuation",
      token_count: count,
    };
  }

  const tinyFollowupPhrases = new Set([
    "why",
    "why?",
    "how",
    "how?",
    "what",
    "what?",
    "huh",
    "wait",
    "again",
    "again?",
    "more",
    "explain more",
    "what do you mean",
    "what do you mean?",
    "say that again",
    "explain that again",
    "can you explain that again",
    "can you say that again",
    "another example",
    "show me another example",
  ]);

  if (tinyFollowupPhrases.has(loose)) {
    return {
      is_tiny_followup: true,
      reason: "tiny_followup_phrase",
      token_count: count,
    };
  }

  if (
    count <= 3 &&
    /\b(?:that|this|it|again|more|example|why|how|what)\b/i.test(loose)
  ) {
    return {
      is_tiny_followup: true,
      reason: "short_anaphoric_followup",
      token_count: count,
    };
  }

  return {
    is_tiny_followup: false,
    reason: null,
    token_count: count,
  };
}

function candidateEvidenceFromRanked(
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

function buildDebug(args: {
  rawMessage: string;
  decisionKind: TopicRoutingDecision["kind"];
  policyPath: TopicRoutingDecision["debug"]["policy_path"];
  decisionTarget: TopicWithSemanticCentroid | null;
  newTopicLabel: string | null;
  activeTopic: TopicWithSemanticCentroid | null;
  vectorInfo: VectorInfo;
  centroidEvidence: ReturnType<typeof rankTopicsByEmbeddingCentroid>;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  tinyFollowupSignal: TopicRoutingTinyFollowupSignal;
  labeling?: TopicLabelingResult | null;
  thresholds: SemanticCentroidRoutingThresholds;
  reasons: string[];
}): TopicRoutingDebug {
  const {
    rawMessage,
    decisionKind,
    policyPath,
    decisionTarget,
    newTopicLabel,
    activeTopic,
    centroidEvidence,
    messageEmbedding,
    embeddingModel,
    tinyFollowupSignal,
    labeling,
    thresholds,
    reasons,
  } = args;

  const best = centroidEvidence.best;
  const second = centroidEvidence.second;
  const active = centroidEvidence.active;

  return {
    router_version: "semantic-centroid-v3",
    raw_message: rawMessage,

    decision_kind: decisionKind,
    policy_path: policyPath,

    selected_topic_id: decisionTarget?.id ?? null,
    selected_topic_name: decisionTarget?.name ?? null,
    new_topic_label: newTopicLabel,

    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,

    best_topic_id: best?.topic_id ?? null,
    best_topic_name: best?.topic_name ?? null,
    best_similarity: best?.similarity ?? null,

    second_topic_id: second?.topic_id ?? null,
    second_topic_name: second?.topic_name ?? null,
    second_similarity: second?.similarity ?? null,

    active_topic_similarity: active?.similarity ?? null,
    similarity_gap: centroidEvidence.gap,

    top_candidates: centroidEvidence.ranked
      .slice(0, 5)
      .map(candidateEvidenceFromRanked),

    message_embedding_available:
      Array.isArray(messageEmbedding) && messageEmbedding.length > 0,
    message_embedding_model: embeddingModel,
    topic_centroids_available: centroidEvidence.topic_centroids_available,
    topic_count_considered: centroidEvidence.topic_count_considered,

    tiny_followup_signal: tinyFollowupSignal,
    centroid_evidence: centroidEvidence,

    candidate_label: getCandidateLabel(labeling),
    candidate_confidence: getCandidateConfidence(labeling),
    candidate_should_create_new_topic: getCandidateShouldCreateNew(labeling),
    candidate_should_reuse_existing_topic: getCandidateShouldReuseExisting(labeling),
    candidate_ambiguity_flags: getCandidateAmbiguityFlags(labeling),

    thresholds,
    reasons,
  };
}

function makeRoutingDecision(args: {
  rawMessage: string;
  kind: TopicRoutingDecision["kind"];
  targetTopic?: TopicWithSemanticCentroid | null;
  newTopicLabel?: string | null;
  linkedTopic?: TopicWithSemanticCentroid | null;
  confidence: number;
  reasons: string[];
  policyPath: TopicRoutingDecision["debug"]["policy_path"];
  activeTopic: TopicWithSemanticCentroid | null;
  vectorInfo: VectorInfo;
  centroidEvidence: ReturnType<typeof rankTopicsByEmbeddingCentroid>;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  tinyFollowupSignal: TopicRoutingTinyFollowupSignal;
  labeling?: TopicLabelingResult | null;
  thresholds: SemanticCentroidRoutingThresholds;
}): TopicRoutingDecision {
  const {
    rawMessage,
    kind,
    targetTopic = null,
    newTopicLabel = null,
    linkedTopic = null,
    confidence,
    reasons,
    policyPath,
    activeTopic,
    vectorInfo,
    centroidEvidence,
    messageEmbedding,
    embeddingModel,
    tinyFollowupSignal,
    labeling,
    thresholds,
  } = args;

  return {
    kind,
    target_topic_id: targetTopic?.id ?? null,
    target_topic_name: targetTopic?.name ?? null,
    target_topic: targetTopic,

    new_topic_label: newTopicLabel,

    linked_topic_id: linkedTopic?.id ?? null,
    linked_topic_name: linkedTopic?.name ?? null,
    linked_topic: linkedTopic,

    confidence: Math.max(0, Math.min(1, confidence)),
    reasons,
    debug: buildDebug({
      rawMessage,
      decisionKind: kind,
      policyPath,
      decisionTarget: targetTopic,
      newTopicLabel,
      activeTopic,
      vectorInfo,
      centroidEvidence,
      messageEmbedding,
      embeddingModel,
      tinyFollowupSignal,
      labeling,
      thresholds,
      reasons,
    }),
  };
}

function buildCentroidUpdatePlan(args: {
  decision: TopicRoutingDecision;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
}): TopicCentroidUpdatePlan | null {
  const { decision, messageEmbedding, embeddingModel } = args;

  if (!messageEmbedding?.length) return null;

  const targetTopic = decision.target_topic as TopicWithSemanticCentroid | null;
  if (!targetTopic) return null;

  if (decision.kind !== "switch_existing" && decision.kind !== "stay_active") {
    return null;
  }

  const previousCentroid = getSemanticCentroidForTopic(targetTopic);
  const previousCount = getSemanticCentroidCountForTopic(targetTopic);

  const update = updateCentroidRunningAverage({
    previousCentroid,
    previousCount,
    newEmbedding: messageEmbedding,
  });

  return {
    topic_id: targetTopic.id,
    previous_embedding_count: update.previous_count,
    new_embedding_count: update.new_count,
    update_method: update.method,
    alpha: update.alpha,
    embedding_model: embeddingModel,
    updated_at: new Date().toISOString(),
    new_centroid: update.centroid,
  };
}

/**
 * V3 semantic-centroid topic router.
 *
 * Primary responsibility:
 * - decide whether the incoming message belongs to an existing topic centroid
 *   or should create a new topic.
 *
 * Non-responsibility:
 * - deeply parse the message wording.
 *
 * Optional candidate-label metadata is used here only to suggest a new topic name.
 */
export function routeTopicV3(
  input: SemanticCentroidRouteInput,
): SemanticCentroidRoutingResult {
  const rawMessage = normalizeSurface(input.rawMessage);
  const topics = Array.isArray(input.topics) ? input.topics : [];
  const activeTopic = findActiveTopic(topics, input.activeTopicId ?? null);
  const thresholds = mergeThresholds(input.thresholds);
  const messageEmbedding = input.messageEmbedding?.length
    ? input.messageEmbedding
    : null;
  const embeddingModel = input.embeddingModel ?? null;

  const centroidEvidence = rankTopicsByEmbeddingCentroid({
    messageEmbedding,
    topics,
    activeTopicId: activeTopic?.id ?? null,
  });

  const centroidVectorInfo = buildVectorInfoFromCentroidRanking(
    centroidEvidence.ranked,
    5,
  );

  const incomingVectorInfo = normalizeVectorInfo(input.vectorInfo);

  /**
   * Prefer local Supabase centroid ranking when available.
   * Otherwise preserve the vectorInfo provided by Qdrant for debugging and
   * backward-compatible output.
   */
  const vectorInfo =
    centroidEvidence.ranked.length > 0 ? centroidVectorInfo : incomingVectorInfo;

  const topicNameSuggestion = suggestTopicNameFromLabeling({
    rawMessage,
    labeling: input.labeling ?? null,
  });

  const tinyFollowupSignal = detectTinyFollowupSignal({
    rawMessage,
    currentInteractionContext: input.currentInteractionContext ?? null,
  });

  const policyInput: SemanticCentroidPolicyInput = {
    rawMessage,
    messageEmbedding,
    embeddingModel,

    topics,
    activeTopic,

    labeling: input.labeling ?? null,
    candidateLabel: topicNameSuggestion.label,

    vectorInfo,
    centroidEvidence,
    thresholds,
    tinyFollowupSignal,
  };

  const policyDecision = decideSemanticCentroidRoutingPolicy(policyInput);

  const newTopicLabel =
    policyDecision.kind === "create_new" ||
    policyDecision.kind === "create_and_link"
      ? policyDecision.newTopicLabel ?? topicNameSuggestion.label
      : null;

  const decision = makeRoutingDecision({
    rawMessage,
    kind: policyDecision.kind,
    targetTopic: policyDecision.targetTopic,
    newTopicLabel,
    linkedTopic: policyDecision.linkedTopic,
    confidence: policyDecision.confidence,
    reasons: [
      ...policyDecision.reasons,
      ...(newTopicLabel && topicNameSuggestion.reasons.length
        ? topicNameSuggestion.reasons.map(
            (reason) => `Topic name suggestion: ${reason}`,
          )
        : []),
    ],
    policyPath: policyDecision.policyPath,
    activeTopic,
    vectorInfo,
    centroidEvidence,
    messageEmbedding,
    embeddingModel,
    tinyFollowupSignal,
    labeling: input.labeling ?? null,
    thresholds,
  });

  const centroidUpdatePlan = buildCentroidUpdatePlan({
    decision,
    messageEmbedding,
    embeddingModel,
  });

  return {
    ...decision,
    centroid_update_plan: centroidUpdatePlan,
    vectorInfo,
  };
}
