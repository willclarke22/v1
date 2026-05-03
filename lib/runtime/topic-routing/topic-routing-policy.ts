import type {
  SemanticCentroidPolicyDecision,
  SemanticCentroidPolicyInput,
  SemanticCentroidPolicyPath,
  SemanticCentroidRoutingThresholds,
} from "./topic-routing-types";
import type { TopicWithSemanticCentroid } from "./topic-centroids";

/**
 * V3 semantic-centroid routing thresholds.
 *
 * These are intentionally lower than the earlier V2 defaults because the live
 * Qdrant scores you showed were often around 0.07-0.18 for unrelated topics.
 *
 * The first practical calibration rule is:
 * - Scores around ~0.18 to unrelated topics should NOT trigger active fallback.
 * - Strong/medium thresholds should be adjusted after collecting real logs.
 */
export const DEFAULT_SEMANTIC_CENTROID_ROUTING_THRESHOLDS: SemanticCentroidRoutingThresholds =
  {
    strong_centroid_match: 0.62,
    medium_centroid_match: 0.48,
    weak_centroid_match: 0.28,
    min_similarity_gap: 0.06,
    active_followup_match: 0.28,
    create_new_below: 0.32,
    related_topic_link_min: 0.36,
    related_topic_link_max: 0.62,
  };

/**
 * Temporary alias so older imports do not immediately break during migration.
 * Once topic-router.ts is fully replaced by V3, prefer the semantic name above.
 */
export const DEFAULT_TOPIC_ROUTING_THRESHOLDS =
  DEFAULT_SEMANTIC_CENTROID_ROUTING_THRESHOLDS;

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeTopicText(text: string | null | undefined) {
  return (text ?? "")
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}+#' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stripLeadingArticle(text: string) {
  return text.replace(/^(?:the|a|an)\s+/i, "").trim();
}

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") || token.endsWith("xes")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function topicComparable(text: string | null | undefined) {
  return stripLeadingArticle(normalizeTopicText(text))
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

function exactTopicNameMatch(
  label: string | null,
  topics: TopicWithSemanticCentroid[],
): TopicWithSemanticCentroid | null {
  if (!label) return null;

  const normalizedLabel = topicComparable(label);
  if (!normalizedLabel) return null;

  return (
    topics.find((topic) => topicComparable(topic.name) === normalizedLabel) ??
    null
  );
}

function clampConfidence(value: number) {
  return clamp(value, 0, 1);
}

function bestSimilarity(input: SemanticCentroidPolicyInput) {
  return input.centroidEvidence.best?.similarity ?? null;
}

function secondSimilarity(input: SemanticCentroidPolicyInput) {
  return input.centroidEvidence.second?.similarity ?? null;
}

function activeSimilarity(input: SemanticCentroidPolicyInput) {
  return input.centroidEvidence.active?.similarity ?? null;
}

function similarityGap(input: SemanticCentroidPolicyInput) {
  return input.centroidEvidence.gap ?? null;
}

function hasSufficientGap(input: SemanticCentroidPolicyInput) {
  const gap = similarityGap(input);
  return gap != null && gap >= input.thresholds.min_similarity_gap;
}

function makePolicyDecision(args: {
  kind: SemanticCentroidPolicyDecision["kind"];
  targetTopic?: TopicWithSemanticCentroid | null;
  newTopicLabel?: string | null;
  linkedTopic?: TopicWithSemanticCentroid | null;
  confidence: number;
  policyPath: SemanticCentroidPolicyPath;
  reasons: string[];
}): SemanticCentroidPolicyDecision {
  return {
    kind: args.kind,
    targetTopic: args.targetTopic ?? null,
    newTopicLabel: args.newTopicLabel ?? null,
    linkedTopic: args.linkedTopic ?? null,
    confidence: clampConfidence(args.confidence),
    policyPath: args.policyPath,
    reasons: args.reasons,
  };
}

function deterministicLabel(input: SemanticCentroidPolicyInput) {
  return input.candidateLabel;
}

function fallbackNewTopicLabel(input: SemanticCentroidPolicyInput) {
  return deterministicLabel(input) ?? (input.rawMessage.trim() || null);
}

/**
 * This is deliberately tiny.
 *
 * V3 should not inspect rich wording for routing. The only context exception is
 * short, low-content follow-ups that are semantically weak by themselves:
 * - why?
 * - what do you mean?
 * - again?
 * - explain that again
 *
 * The router should not use broad regex extraction to find topics.
 */
function tinyFollowupAllowsActiveTopic(input: SemanticCentroidPolicyInput) {
  return (
    Boolean(input.activeTopic) &&
    input.tinyFollowupSignal.is_tiny_followup &&
    (activeSimilarity(input) ?? 0) >= input.thresholds.active_followup_match
  );
}

function topicLooksBroad(topic: TopicWithSemanticCentroid | null | undefined) {
  if (!topic) return false;

  const comparable = topicComparable(topic.name);
  if (!comparable) return false;

  const broadNames = new Set([
    "spanish",
    "tax",
    "taxes",
    "form",
    "forms",
    "neurotransmitter",
    "neurotransmitters",
    "neurotransmission",
    "biology",
    "chemistry",
    "physics",
    "math",
    "mathematics",
    "history",
    "geography",
    "law",
    "finance",
    "personal finance",
    "programming",
    "coding",
    "computer science",
    "car",
    "cars",
    "driving",
    "health",
    "medicine",
    "music",
    "art",
    "language",
    "grammar",
    "cooking",
    "plumbing",
    "space",
    "nature",
  ]);

  if (broadNames.has(comparable)) return true;

  const tokenCount = comparable.split(/\s+/).filter(Boolean).length;
  return tokenCount <= 1 && comparable.endsWith("s");
}

function labelLooksNarrowerThanTopic(
  label: string | null,
  topic: TopicWithSemanticCentroid | null,
) {
  if (!label || !topic) return false;

  const normalizedLabel = topicComparable(label);
  const normalizedTopic = topicComparable(topic.name);

  if (!normalizedLabel || !normalizedTopic) return false;
  if (normalizedLabel === normalizedTopic) return false;

  const labelTokens = normalizedLabel.split(/\s+/).filter(Boolean);
  const topicTokens = normalizedTopic.split(/\s+/).filter(Boolean);

  if (labelTokens.length > topicTokens.length) return true;

  return /\b(?:cycle|process|mechanism|pathway|phase|step|law|equation|formula|reaction|reuptake|difference|vs|versus)\b/i.test(
    label,
  );
}

/**
 * Main V3 routing policy.
 *
 * Core rule:
 * Low similarity to all existing topics should create a new topic, not fall
 * back to the active topic.
 */
export function decideSemanticCentroidRoutingPolicy(
  input: SemanticCentroidPolicyInput,
): SemanticCentroidPolicyDecision {
  const label = deterministicLabel(input);
  const exactMatch = exactTopicNameMatch(label, input.topics);

  if (exactMatch) {
    return makePolicyDecision({
      kind: "switch_existing",
      targetTopic: exactMatch,
      confidence: 0.96,
      policyPath: "exact_existing_topic_match",
      reasons: [
        `Candidate label "${label}" exactly matches existing topic "${exactMatch.name}".`,
      ],
    });
  }

  if (!input.messageEmbedding) {
    return makePolicyDecision({
      kind: "no_decision",
      confidence: 0.15,
      policyPath: "missing_message_embedding",
      reasons: [
        "No message embedding was available, so semantic-centroid routing could not run.",
      ],
    });
  }

  if (input.centroidEvidence.topic_centroids_available === 0) {
    return makePolicyDecision({
      kind: "create_new",
      newTopicLabel: fallbackNewTopicLabel(input),
      confidence: 0.72,
      policyPath: "missing_topic_centroids",
      reasons: [
        "No existing topic embedding centroids are available yet.",
        "The message has an embedding, so initialize a new topic centroid from this message.",
      ],
    });
  }

  const best = input.centroidEvidence.best;
  const second = input.centroidEvidence.second;
  const bestScore = bestSimilarity(input);
  const secondScore = secondSimilarity(input);
  const gap = similarityGap(input);

  if (
    best &&
    bestScore != null &&
    bestScore >= input.thresholds.strong_centroid_match
  ) {
    return makePolicyDecision({
      kind: "switch_existing",
      targetTopic: best.topic,
      confidence: Math.max(0.82, bestScore),
      policyPath: "strong_centroid_match",
      reasons: [
        `Best topic "${best.topic_name}" is a strong centroid match (${bestScore.toFixed(
          3,
        )}).`,
      ],
    });
  }

  if (
    best &&
    bestScore != null &&
    bestScore >= input.thresholds.medium_centroid_match &&
    hasSufficientGap(input)
  ) {
    return makePolicyDecision({
      kind: "switch_existing",
      targetTopic: best.topic,
      confidence: Math.max(0.68, bestScore),
      policyPath: "medium_centroid_match_with_gap",
      reasons: [
        `Best topic "${best.topic_name}" is a medium centroid match (${bestScore.toFixed(
          3,
        )}) with a sufficient gap (${(gap ?? 0).toFixed(3)}).`,
      ],
    });
  }

  if (tinyFollowupAllowsActiveTopic(input)) {
    return makePolicyDecision({
      kind: "stay_active",
      targetTopic: input.activeTopic,
      confidence: 0.72,
      policyPath: "active_topic_tiny_followup",
      reasons: [
        `Message is a tiny contextual follow-up: ${
          input.tinyFollowupSignal.reason ?? "short contextual follow-up"
        }.`,
        `Active topic similarity is sufficient (${(
          activeSimilarity(input) ?? 0
        ).toFixed(3)}).`,
      ],
    });
  }

  if (
    best &&
    label &&
    topicLooksBroad(best.topic) &&
    labelLooksNarrowerThanTopic(label, best.topic) &&
    bestScore != null &&
    bestScore >= input.thresholds.related_topic_link_min &&
    bestScore < input.thresholds.related_topic_link_max
  ) {
    return makePolicyDecision({
      kind: "create_and_link",
      newTopicLabel: label,
      linkedTopic: best.topic,
      confidence: 0.7,
      policyPath: "create_and_link_to_related_topic",
      reasons: [
        `"${label}" looks narrower than related topic "${best.topic_name}".`,
        "Create the narrower topic and link it instead of collapsing into the broader topic.",
      ],
    });
  }

  if (bestScore == null || bestScore < input.thresholds.create_new_below) {
    return makePolicyDecision({
      kind: "create_new",
      newTopicLabel: fallbackNewTopicLabel(input),
      confidence: 0.74,
      policyPath: "all_centroid_matches_weak_create_new",
      reasons: [
        bestScore == null
          ? "No usable centroid match was found."
          : `Best existing-topic similarity is weak (${bestScore.toFixed(3)}).`,
        "Weak similarity to all existing topics should create a new topic rather than falling back to the active topic.",
      ],
    });
  }

  if (
    best &&
    second &&
    bestScore != null &&
    secondScore != null &&
    bestScore >= input.thresholds.weak_centroid_match &&
    !hasSufficientGap(input)
  ) {
    return makePolicyDecision({
      kind: "clarify_topic_intent",
      confidence: 0.56,
      policyPath: "ambiguous_centroid_competition",
      reasons: [
        `Best topic "${best.topic_name}" (${bestScore.toFixed(
          3,
        )}) and second topic "${second.topic_name}" (${secondScore.toFixed(
          3,
        )}) are too close to confidently route.`,
      ],
    });
  }

  /**
   * Product-bias fallback:
   * If semantic evidence is not strong enough to route, prefer creating a topic.
   *
   * This is the crucial correction from the old behavior.
   */
  return makePolicyDecision({
    kind: "create_new",
    newTopicLabel: fallbackNewTopicLabel(input),
    confidence: 0.62,
    policyPath: "fallback_create_new",
    reasons: [
      "No existing topic was semantically strong enough to route confidently.",
      "The active topic is not used as a fallback unless the message is a tiny contextual follow-up.",
    ],
  });
}

/**
 * Temporary legacy export.
 *
 * The old topic-router.ts expected decideTopicRoutingPolicy(...). While we are
 * replacing it, keep this function as a hard error so accidental V2 usage is
 * obvious rather than silently reintroducing old routing behavior.
 */
export function decideTopicRoutingPolicy(): never {
  throw new Error(
    "decideTopicRoutingPolicy is deprecated. Use decideSemanticCentroidRoutingPolicy for V3 routing.",
  );
}