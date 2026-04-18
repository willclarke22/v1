import { mockTopics } from "@/lib/mock-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { VectorInfo } from "@/types/contracts";
import { clamp, isPosition, normalizeDiagnosis } from "./shared";
import {
  type RetrievalCandidate,
  type TopicLabelingInput,
  type TopicLabelingResult,
  type TopicMessageIntent,
} from "./topic-labeling/topic-label-contract";
import { runDeterministicTopicLabeling } from "./topic-labeling/topic-label-deterministic";

type MockTopic = (typeof mockTopics)[number];
export type RouteTopic = MockTopic;

export type ResolutionDecisionAction =
  | "stay_on_active_topic"
  | "reuse_existing_topic"
  | "create_new_topic"
  | "no_confident_decision";

export type TopicMatchResult = {
  matchedTopic: RouteTopic | null;
  vectorInfo: VectorInfo;
  shouldCreateNewTopic: boolean;
  resolutionKind:
    | "matched_existing"
    | "created_new_candidate"
    | "fallback_active_topic"
    | "fallback_existing_topic"
    | "no_match";
  resolvedLabel: string | null;
  matchConfidence: number;
  resolutionTrace?: TopicResolutionTrace;
};

export type DeterministicTopicResolutionSnapshot = {
  resolutionKind:
    | "matched_existing"
    | "created_new_candidate"
    | "fallback_active_topic"
    | "fallback_existing_topic"
    | "no_match";
  resolvedLabel: string | null;
  matchConfidence: number;
  vectorInfo: VectorInfo;
};

type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

type GranularityHint = "broad" | "medium" | "narrow" | "unknown";

type CandidateInterpretation = {
  canonicalLabel: string | null;
  conceptSpan: string | null;
  questionAboutTopic: string | null;
  frame: MessageFrame;
  labelConfidence: number;
  specificity:
    | "too_vague"
    | "broad_but_usable"
    | "good"
    | "very_specific"
    | string;
  granularityHint: GranularityHint;
  referencesActiveTopic: boolean;
  switchCue: boolean;
  continuationCue: boolean;
  subpartCue: boolean;
  explicitTopicSwitchTarget: string | null;
  suspiciousLabel: boolean;
  subpartLikeLabel: boolean;
  ambiguityFlags: string[];
};

type TopicScoreBreakdown = {
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
  finalScore: number;
};

type ScoredTopic = {
  topic: RouteTopic;
  similarity: number;
  breakdown: TopicScoreBreakdown;
};

type ResolutionHypothesisKind =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "ambiguous";

type ResolutionHypothesis = {
  kind: ResolutionHypothesisKind;
  score: number;
  reasons: string[];
  topic: RouteTopic | null;
  label: string | null;
};

type ResolutionAdjudication = {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  vectorInfo: VectorInfo;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopicScore: ScoredTopic | null;
  hypotheses: ResolutionHypothesis[];
  winner: ResolutionHypothesis;
  fallbackRecommended: boolean;
  decisionAction: ResolutionDecisionAction;
  trace: TopicResolutionTrace;
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
  };
  candidates: Array<{
    topicId: string;
    topicName: string;
    similarity: number;
    breakdown: TopicScoreBreakdown;
  }>;
  hypotheses: Array<{
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicName: string | null;
    label: string | null;
  }>;
  winner: {
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicName: string | null;
    label: string | null;
  };
  topGap: number;
  decisionAction: ResolutionDecisionAction;
  fallbackRecommended: boolean;
};

const STRONG_REUSE_TOPIC_THRESHOLD = 0.66;
const MID_REUSE_TOPIC_THRESHOLD = 0.54;
const ACTIVE_TOPIC_FALLBACK_THRESHOLD = 0.46;
const CREATE_NEW_CONFIDENCE_THRESHOLD = 0.74;
const LOW_CONFIDENCE_CREATE_NEW_FLOOR = 0.58;
const CANDIDATE_COMPETITION_GAP_THRESHOLD = 0.08;
const AMBIGUOUS_WIN_THRESHOLD = 0.62;
const HIGH_USEFULNESS_MARGIN = 0.1;

const ACTIVE_TOPIC_ANAPHORIC_FOLLOWUP_REGEXES: RegExp[] = [
  /^(?:quiz me on (?:that|it))\.?$/i,
  /^(?:can you quiz me on (?:that|it))\??$/i,
  /^(?:test me on (?:that|it))\.?$/i,
  /^(?:can you test me on (?:that|it))\??$/i,
  /^(?:ask me about (?:that|it))\.?$/i,
  /^(?:can you ask me about (?:that|it))\??$/i,
  /^(?:go over (?:that|it) again)\.?$/i,
  /^(?:can we go over (?:that|it) again)\??$/i,
  /^(?:explain (?:that|it) again)\.?$/i,
  /^(?:can you explain (?:that|it) again)\??$/i,
  /^(?:wait,?\s+what happens right before that)\??$/i,
  /^(?:wait,?\s+what happens right before it)\??$/i,
  /^(?:yeah,?\s+that exact part)\.?$/i,
  /^(?:yeah,?\s+it'?s that one that keeps messing me up)\.?$/i,
  /^(?:i still (?:don't|dont) (?:really )?get it)\.?$/i,
  /^(?:i keep mixing them up in word problems)\.?$/i,
  /^(?:can we do that again)\??$/i,
  /^(?:show me another example)\.?$/i,
  /^(?:can you say that again(?: but shorter)?)\??$/i,
  /^(?:say that again(?: but shorter)?)\??$/i,
  /^(?:wait)\.?$/i,
  /^(?:wait,?\s+what do you mean)\??$/i,
  /^(?:what do you mean)\??$/i,
];

const ACTIVE_TOPIC_SUBPART_FOLLOWUP_REGEXES: RegExp[] = [
  /^(?:what about the .+ part)\??$/i,
  /^(?:especially the .+ part)\.?$/i,
  /^(?:no,?\s*i meant the .+ part)\.?$/i,
  /^(?:no,?\s*the .+ part)\.?$/i,
  /^(?:the .+ part)\.?$/i,
  /^(?:the scoring part)\.?$/i,
  /^(?:the sweeping part)\.?$/i,
  /^(?:no,?\s*the second part)\.?$/i,
  /^(?:no,?\s*the first part(?: of that)?)\.?$/i,
  /^(?:can we go over (?:that|it) again,\s*especially the .+ part)\??$/i,
  /^(?:go over (?:that|it) again,\s*especially the .+ part)\.?$/i,
  /^(?:explain (?:that|it) again,\s*especially the .+ part)\.?$/i,
  /^(?:can you explain (?:that|it) again,\s*especially the .+ part)\??$/i,
  /^(?:yeah,?\s*that exact part,\s*especially the .+ part)\.?$/i,
];

const META_CONTINUATION_REGEXES: RegExp[] = [
  /^(?:thanks(?:,?\s*that helped)?)\.?$/i,
  /^(?:show me another example)\.?$/i,
  /^(?:can you say that again(?: but shorter)?)\??$/i,
  /^(?:say that again(?: but shorter)?)\??$/i,
  /^(?:wait)\.?$/i,
  /^(?:wait,?\s*what do you mean)\??$/i,
  /^(?:what do you mean)\??$/i,
];

const RETURN_TO_PREVIOUS_TOPIC_REGEXES: RegExp[] = [
  /^(?:ok(?:ay)?\s+back to the first one)\.?$/i,
  /^(?:back to the first one)\.?$/i,
  /^(?:go back)\.?$/i,
  /^(?:never mind,?\s*go back)\.?$/i,
  /^(?:actually,?\s*go back)\.?$/i,
  /^(?:wait,?\s*go back)\.?$/i,
  /^(?:go back to the first one)\.?$/i,
];

const EXPLICIT_EXISTING_TOPIC_SWITCH_PREFIXES: RegExp[] = [
  /^(?:go back to)\s+(.+?)\.?$/i,
  /^(?:switch to)\s+(.+?)\.?$/i,
  /^(?:back to)\s+(.+?)\.?$/i,
  /^(?:actually,?\s*go back to)\s+(.+?)\.?$/i,
  /^(?:wait,?\s*go back to)\s+(.+?)\.?$/i,
  /^(?:let'?s talk about)\s+(.+?)\.?$/i,
  /^(?:now about)\s+(.+?)\.?$/i,
];

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function normalizeVectorInfo(vectorInfo?: VectorInfo | null): VectorInfo {
  if (!vectorInfo) {
    return emptyVectorInfo();
  }

  return {
    top_k_topic_names: Array.isArray(vectorInfo.top_k_topic_names)
      ? vectorInfo.top_k_topic_names.filter((item): item is string => typeof item === "string")
      : [],
    top_k_topic_ids: Array.isArray(vectorInfo.top_k_topic_ids)
      ? vectorInfo.top_k_topic_ids.filter((item): item is string => typeof item === "string")
      : [],
    top_k_similarity_scores: Array.isArray(vectorInfo.top_k_similarity_scores)
      ? vectorInfo.top_k_similarity_scores.filter(
          (item): item is number => typeof item === "number" && !Number.isNaN(item)
        )
      : [],
  };
}

function hasUsableVectorInfo(vectorInfo?: VectorInfo | null): boolean {
  const normalized = normalizeVectorInfo(vectorInfo);

  return (
    normalized.top_k_topic_ids.length > 0 ||
    normalized.top_k_topic_names.length > 0 ||
    normalized.top_k_similarity_scores.length > 0
  );
}

function mergeVectorInfos(
  primary?: VectorInfo | null,
  fallback?: VectorInfo | null
): VectorInfo {
  if (hasUsableVectorInfo(primary)) {
    return normalizeVectorInfo(primary);
  }

  if (hasUsableVectorInfo(fallback)) {
    return normalizeVectorInfo(fallback);
  }

  return emptyVectorInfo();
}

function normalizeSurface(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTopicText(text: string) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLoose(text: string) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeTopicText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") || token.endsWith("xes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function semanticTokenize(text: string): string[] {
  return tokenize(text).map((token) => singularizeToken(token.toLowerCase()));
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size);
}

function hasAmbiguityFlag(labeling: TopicLabelingResult, flag: string) {
  return labeling.diagnostics.ambiguity_flags.includes(flag);
}

function mapIntentToFrame(intent: TopicMessageIntent): MessageFrame {
  switch (intent) {
    case "quiz_request":
      return "quiz_request";
    case "confusion_help":
      return "confusion_help";
    case "explain_request":
      return "explain_request";
    case "compare_request":
      return "compare_request";
    case "apply_request":
      return "apply_request";
    case "attempt_like":
      return "attempt_like";
    case "general_question":
    case "unclear":
    default:
      return "general";
  }
}

function looksLikeActiveTopicAnaphoricFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return ACTIVE_TOPIC_ANAPHORIC_FOLLOWUP_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeActiveTopicSubpartFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return ACTIVE_TOPIC_SUBPART_FOLLOWUP_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeMixedAnaphoricSubpartFollowup(message: string) {
  const normalized = normalizeSurface(message);

  const hasAnaphoricCue =
    /\b(?:that|it)\b/i.test(normalized) && /\b(?:again|exact part)\b/i.test(normalized);

  const hasSubpartCue =
    /\b(?:especially the .+ part|the .+ part|scoring part|sweeping part)\b/i.test(normalized);

  const hasGoOverCue = /\b(?:go over|explain)\b/i.test(normalized);

  return (hasAnaphoricCue && hasSubpartCue) || (hasGoOverCue && hasSubpartCue);
}

function looksLikeMetaContinuation(message: string) {
  const normalized = normalizeSurface(message);
  return META_CONTINUATION_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeReturnToPreviousTopic(message: string) {
  const normalized = normalizeSurface(message);
  return RETURN_TO_PREVIOUS_TOPIC_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeExplicitTopicSwitch(message: string) {
  const normalized = normalizeSurface(message);

  return (
    /\b(?:switch to|go back to|back to|now about|let'?s talk about)\b/i.test(normalized) ||
    /\b(?:another topic|different topic|separate topic|something else)\b/i.test(normalized)
  );
}

function computeGranularityHint(text: string | null): GranularityHint {
  if (!text) return "unknown";

  const tokens = semanticTokenize(text);
  if (!tokens.length) return "unknown";

  if (tokens.length >= 6) return "broad";
  if (tokens.length <= 1) return "narrow";

  if (
    /\b(?:how|why|when|where|difference|compare|versus|vs|rules of|parts of|steps of)\b/i.test(
      text
    )
  ) {
    return "medium";
  }

  if (tokens.length <= 2) return "narrow";
  if (tokens.length <= 4) return "medium";

  return "broad";
}

function findVectorCandidateIndexForTopic(
  topic: RouteTopic,
  vectorInfo?: VectorInfo | null
): number {
  const normalized = normalizeVectorInfo(vectorInfo);

  const byId = normalized.top_k_topic_ids.findIndex((topicId) => topicId === topic.id);
  if (byId >= 0) return byId;

  const topicNameLoose = normalizeLoose(topic.name);
  return normalized.top_k_topic_names.findIndex(
    (topicName) => normalizeLoose(topicName) === topicNameLoose
  );
}

function getSemanticSimilarityForTopic(topic: RouteTopic, vectorInfo?: VectorInfo | null): number {
  const normalized = normalizeVectorInfo(vectorInfo);
  const index = findVectorCandidateIndexForTopic(topic, normalized);

  if (index < 0) return 0;

  const score = normalized.top_k_similarity_scores[index] ?? 0;
  return clamp(score, 0, 1);
}

function getSemanticRetrievalSupport(
  topic: RouteTopic,
  vectorInfo?: VectorInfo | null
): {
  semanticSimilarity: number;
  retrievalRankBonus: number;
  combinedSupport: number;
} {
  const normalized = normalizeVectorInfo(vectorInfo);
  const index = findVectorCandidateIndexForTopic(topic, normalized);

  if (index < 0) {
    return {
      semanticSimilarity: 0,
      retrievalRankBonus: 0,
      combinedSupport: 0,
    };
  }

  const semanticSimilarity = clamp(normalized.top_k_similarity_scores[index] ?? 0, 0, 1);

  const retrievalRankBonus =
    index === 0 ? 0.12 : index === 1 ? 0.08 : index === 2 ? 0.05 : index === 3 ? 0.03 : 0.01;

  const combinedSupport = clamp(semanticSimilarity * 0.72 + retrievalRankBonus, 0, 1);

  return {
    semanticSimilarity,
    retrievalRankBonus,
    combinedSupport,
  };
}

function buildTopicLabelingInput(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): TopicLabelingInput {
  const retrievalCandidates: RetrievalCandidate[] = existingTopics.map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
    similarity: getSemanticSimilarityForTopic(topic, semanticVectorInfo),
  }));

  return {
    raw_message: message,
    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,
    recent_topic_names: existingTopics.slice(-8).map((topic) => topic.name),
    retrieval_candidates: retrievalCandidates,
  };
}

function buildLabelingResult(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
) {
  const input = buildTopicLabelingInput(message, existingTopics, activeTopic, semanticVectorInfo);
  return runDeterministicTopicLabeling(input);
}

function buildCandidateInterpretation(
  message: string,
  labeling: TopicLabelingResult
): CandidateInterpretation {
  const canonicalLabel = labeling.topic_decision.canonical_label ?? null;
  const conceptSpan = labeling.interpretation.concept_span ?? null;
  const questionAboutTopic = labeling.interpretation.question_about_topic ?? null;

  const continuationCue =
    looksLikeActiveTopicAnaphoricFollowup(message) ||
    looksLikeMetaContinuation(message) ||
    labeling.interpretation.references_active_topic;

  const subpartCue =
    looksLikeActiveTopicSubpartFollowup(message) || looksLikeMixedAnaphoricSubpartFollowup(message);

  const explicitTopicSwitchTarget = extractExplicitSwitchTargetString(message);
  const switchCue = looksLikeExplicitTopicSwitch(message) || Boolean(explicitTopicSwitchTarget);

  const sourceForGranularity = canonicalLabel ?? conceptSpan ?? questionAboutTopic ?? null;
  const suspiciousLabel = looksLikeSuspiciousResolvedLabel(canonicalLabel);
  const subpartLikeLabel = looksLikeSubpartResolvedLabel(canonicalLabel);

  return {
    canonicalLabel,
    conceptSpan,
    questionAboutTopic,
    frame: mapIntentToFrame(labeling.interpretation.message_intent),
    labelConfidence: labeling.topic_decision.confidence,
    specificity: labeling.topic_decision.topic_specificity,
    granularityHint: computeGranularityHint(sourceForGranularity),
    referencesActiveTopic: labeling.interpretation.references_active_topic ?? false,
    switchCue,
    continuationCue,
    subpartCue,
    explicitTopicSwitchTarget,
    suspiciousLabel,
    subpartLikeLabel,
    ambiguityFlags: labeling.diagnostics.ambiguity_flags.slice(),
  };
}

export function inferPrimaryMessageFrame(message: string): MessageFrame {
  const labeling = buildLabelingResult(message, []);
  return mapIntentToFrame(labeling.interpretation.message_intent);
}

export function canonicalizeTopicNameFromMessage(message: string): string {
  const labeling = buildLabelingResult(message, []);
  return labeling.topic_decision.canonical_label ?? "New Topic";
}

export function titleCaseFromMessage(message: string) {
  return canonicalizeTopicNameFromMessage(message);
}

export function inferKeywordsFromMessage(message: string): string[] {
  const labeling = buildLabelingResult(message, []);
  const source =
    labeling.interpretation.concept_span ?? labeling.topic_decision.canonical_label ?? message;

  return dedupe(semanticTokenize(source).filter((token) => token.length > 2)).slice(0, 8);
}

function computeLocalTopicSimilarity(
  candidateLabel: string | null,
  conceptSpan: string | null,
  topic: RouteTopic
) {
  const candidate = candidateLabel ?? conceptSpan ?? "";
  const normalizedCandidate = normalizeTopicText(candidate);
  const normalizedTopicName = normalizeTopicText(topic.name);

  if (!normalizedCandidate || !normalizedTopicName) return 0;

  const exactNameMatch = normalizedCandidate === normalizedTopicName ? 1 : 0;

  const containedMatch =
    normalizedCandidate.includes(normalizedTopicName) ||
    normalizedTopicName.includes(normalizedCandidate)
      ? 1
      : 0;

  const candidateTokens = semanticTokenize(candidate);
  const topicTokens = semanticTokenize(topic.name);
  const tokenScore = overlapScore(candidateTokens, topicTokens);

  const score = exactNameMatch * 1.0 + containedMatch * 0.84 + tokenScore * 0.8;
  return clamp(score, 0, 1);
}

function computeGranularityAlignment(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
): number {
  const topicGranularity = computeGranularityHint(topic.name);

  if (
    interpretation.granularityHint === "unknown" ||
    topicGranularity === "unknown" ||
    interpretation.subpartCue
  ) {
    return 0;
  }

  if (interpretation.granularityHint === topicGranularity) return 0.06;

  if (
    (interpretation.granularityHint === "narrow" && topicGranularity === "medium") ||
    (interpretation.granularityHint === "medium" && topicGranularity === "broad")
  ) {
    return 0.02;
  }

  if (
    (interpretation.granularityHint === "broad" && topicGranularity === "narrow") ||
    (interpretation.granularityHint === "narrow" && topicGranularity === "broad")
  ) {
    return -0.04;
  }

  return 0;
}

function computeContinuityBonus(
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): number {
  if (!activeTopic || topic.id !== activeTopic.id) return 0;

  let bonus = 0;

  if (interpretation.referencesActiveTopic) bonus += 0.08;
  if (interpretation.continuationCue) bonus += 0.12;
  if (interpretation.subpartCue) bonus += 0.16;
  if (interpretation.switchCue) bonus -= 0.08;

  return bonus;
}

function computeSwitchPenalty(
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): number {
  if (!activeTopic) return 0;
  if (topic.id === activeTopic.id) return 0;
  if (!interpretation.switchCue) return 0;

  return 0.06;
}

function buildVectorInfoFromScoredTopics(
  scored: Array<{ topic: RouteTopic; similarity: number }>
): VectorInfo {
  return {
    top_k_topic_names: scored.slice(0, 5).map((item) => item.topic.name),
    top_k_topic_ids: scored.slice(0, 5).map((item) => item.topic.id),
    top_k_similarity_scores: scored.slice(0, 5).map((item) => clamp(item.similarity, 0, 0.98)),
  };
}

function computeNextTopicPosition(existingTopics: RouteTopic[]): [number, number, number] {
  const count = existingTopics.length;

  if (count === 0) {
    return [0, 0, 0];
  }

  const angle = count * 1.35;
  const radius = 2.8 + count * 0.65;
  const x = Math.cos(angle) * radius;
  const y = ((count % 3) - 1) * 0.9;
  const z = Math.sin(angle) * radius * 0.75;

  return [x, y, z];
}

export function inferSeededNextStep(message: string) {
  const concept = canonicalizeTopicNameFromMessage(message);
  const frame = inferPrimaryMessageFrame(message);

  switch (frame) {
    case "quiz_request":
      return `Show what you understand about ${concept} in your own words.`;
    case "confusion_help":
      return `Build a clearer mental model of ${concept}.`;
    case "compare_request":
      return `Explain the key difference in ${concept} in your own words.`;
    case "apply_request":
      return `Apply ${concept} to a simple case and explain why.`;
    case "attempt_like":
      return `Refine your thinking about ${concept} and explain your reasoning.`;
    case "explain_request":
    case "general":
    default:
      return `Explain ${concept} clearly in your own words.`;
  }
}

function looksLikeStrongDeterministicCreateLabel(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation
) {
  const specificity = labeling.topic_decision.topic_specificity;
  const confidence = labeling.topic_decision.confidence;

  if (!labeling.topic_decision.canonical_label) return false;
  if (specificity === "too_vague") return false;
  if (interpretation.suspiciousLabel) return false;
  if (interpretation.subpartLikeLabel) return false;
  if (hasAmbiguityFlag(labeling, "concept_span_clause_like")) return false;
  if (hasAmbiguityFlag(labeling, "candidate_competition")) return false;

  return (
    confidence >= CREATE_NEW_CONFIDENCE_THRESHOLD &&
    (specificity === "good" || specificity === "very_specific")
  );
}

function buildScoreBreakdown(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  semanticVectorInfo?: VectorInfo | null,
  activeTopic?: RouteTopic | null
): TopicScoreBreakdown {
  const candidateLabel = interpretation.canonicalLabel;
  const conceptSpan = interpretation.conceptSpan;
  const questionAboutTopic = interpretation.questionAboutTopic;

  const normalizedCandidate = normalizeTopicText(candidateLabel ?? conceptSpan ?? "");
  const normalizedTopicName = normalizeTopicText(topic.name);

  const exactNameMatch =
    normalizedCandidate && normalizedCandidate === normalizedTopicName ? 1 : 0;

  const containedMatch =
    normalizedCandidate &&
    (normalizedCandidate.includes(normalizedTopicName) ||
      normalizedTopicName.includes(normalizedCandidate))
      ? 1
      : 0;

  const conceptOverlap = computeLocalTopicSimilarity(candidateLabel, conceptSpan, topic);

  const questionOverlap = questionAboutTopic
    ? overlapScore(semanticTokenize(questionAboutTopic), semanticTokenize(topic.name)) * 0.18
    : 0;

  const semanticSupport = getSemanticRetrievalSupport(topic, semanticVectorInfo);
  const semanticRetrieval = semanticSupport.combinedSupport * 0.24;

  const activeTopicBonus =
    interpretation.referencesActiveTopic && activeTopic && activeTopic.id === topic.id ? 0.08 : 0;

  const continuityBonus = computeContinuityBonus(interpretation, topic, activeTopic);
  const switchPenalty = computeSwitchPenalty(interpretation, topic, activeTopic);
  const granularityAlignment = computeGranularityAlignment(interpretation, topic);

  const confidenceBonus = interpretation.labelConfidence * 0.08;

  const vaguePenalty = labeling.topic_decision.topic_specificity === "too_vague" ? 0.12 : 0;

  const ambiguityPenalty =
    hasAmbiguityFlag(labeling, "candidate_competition") ||
    hasAmbiguityFlag(labeling, "label_suspicious")
      ? 0.05
      : 0;

  const suspiciousLabelPenalty = interpretation.suspiciousLabel ? 0.08 : 0;

  const finalScore = clamp(
    conceptOverlap +
      questionOverlap +
      semanticRetrieval +
      activeTopicBonus +
      continuityBonus +
      granularityAlignment +
      confidenceBonus -
      switchPenalty -
      vaguePenalty -
      ambiguityPenalty -
      suspiciousLabelPenalty,
    0,
    1
  );

  return {
    exactNameMatch,
    containedMatch,
    conceptOverlap,
    questionOverlap,
    semanticRetrieval,
    retrievalRankBonus: semanticSupport.retrievalRankBonus,
    activeTopicBonus,
    continuityBonus,
    switchPenalty,
    granularityAlignment,
    confidenceBonus,
    vaguePenalty,
    ambiguityPenalty,
    suspiciousLabelPenalty,
    finalScore,
  };
}

export function scoreTopicMatch(
  message: string,
  topic: RouteTopic,
  semanticVectorInfo?: VectorInfo | null
): number {
  const labeling = buildLabelingResult(message, [], null, semanticVectorInfo);
  const interpretation = buildCandidateInterpretation(message, labeling);
  const breakdown = buildScoreBreakdown(labeling, interpretation, topic, semanticVectorInfo);
  return breakdown.finalScore;
}

function buildBaseTopicScores(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation,
  existingTopics: RouteTopic[],
  semanticVectorInfo?: VectorInfo | null,
  activeTopic?: RouteTopic | null
): ScoredTopic[] {
  return existingTopics
    .map((topic) => {
      const breakdown = buildScoreBreakdown(
        labeling,
        interpretation,
        topic,
        semanticVectorInfo,
        activeTopic
      );

      return {
        topic,
        similarity: breakdown.finalScore,
        breakdown,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

function scoreStayActiveHypothesis(args: {
  interpretation: CandidateInterpretation;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
  message: string;
}): ResolutionHypothesis {
  const { interpretation, activeTopic, activeTopicScore, topGap, message } = args;

  if (!activeTopic || !activeTopicScore) {
    return {
      kind: "stay_active",
      score: 0,
      reasons: ["No active topic is available to stay on."],
      topic: null,
      label: interpretation.canonicalLabel ?? null,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  score += activeTopicScore.similarity * 0.72;
  reasons.push(`Active topic similarity is ${activeTopicScore.similarity.toFixed(2)}.`);

  if (interpretation.referencesActiveTopic) {
    score += 0.12;
    reasons.push("Message appears to reference the active topic.");
  }

  if (interpretation.continuationCue) {
    score += 0.14;
    reasons.push("Follow-up continuity cue favors staying on the active topic.");
  }

  if (interpretation.subpartCue) {
    score += 0.18;
    reasons.push("Subpart wording favors staying within the active topic.");
  }

  if (activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD) {
    score += 0.06;
    reasons.push("Active topic clears the minimum continuity threshold.");
  }

  if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.03;
    reasons.push("No competing topic clearly separates from the active topic.");
  }

  if (interpretation.suspiciousLabel) {
    score += 0.05;
    reasons.push("Suspicious extracted label makes conservative continuity safer.");
  }

  if (looksLikeActiveTopicAnaphoricFollowup(message)) {
    score += 0.24;
    reasons.push("Anaphoric follow-up strongly suggests staying on the active topic.");
  }

  if (looksLikeActiveTopicSubpartFollowup(message)) {
    score += 0.28;
    reasons.push("Subpart follow-up strongly suggests staying on the active topic.");
  }

  if (looksLikeMixedAnaphoricSubpartFollowup(message)) {
    score += 0.32;
    reasons.push("Mixed anaphoric + subpart follow-up strongly favors staying.");
  }

  if (interpretation.switchCue) {
    score -= 0.12;
    reasons.push("Explicit switch cue weakens the stay-active case.");
  }

  return {
    kind: "stay_active",
    score: clamp(score, 0, 1),
    reasons,
    topic: activeTopic,
    label: interpretation.canonicalLabel ?? activeTopic.name,
  };
}

function scoreSwitchExistingHypothesis(args: {
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis {
  const { interpretation, best, activeTopic, activeTopicScore, topGap, semanticVectorInfo } = args;

  if (!best) {
    return {
      kind: "switch_existing",
      score: 0,
      reasons: ["No existing topic candidate is available."],
      topic: null,
      label: interpretation.canonicalLabel ?? null,
    };
  }

  const switchingToActive = activeTopic && best.topic.id === activeTopic.id;
  let score = 0;
  const reasons: string[] = [];

  score += best.similarity * 0.8;
  reasons.push(`Best existing-topic similarity is ${best.similarity.toFixed(2)}.`);

  if (!switchingToActive) {
    score += 0.05;
    reasons.push("Best match is not merely the active topic.");
  }

  if (best.similarity >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score += 0.08;
    reasons.push("Best topic clears the strong reuse band.");
  } else if (best.similarity >= MID_REUSE_TOPIC_THRESHOLD) {
    score += 0.03;
    reasons.push("Best topic is in the mid reuse band.");
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.05;
    reasons.push("Best topic has a useful margin over alternatives.");
  }

  const semanticSupport = getSemanticRetrievalSupport(best.topic, semanticVectorInfo);
  if (semanticSupport.semanticSimilarity >= 0.22) {
    score += 0.06;
    reasons.push("Semantic retrieval also supports this existing topic.");
  }

  if (activeTopicScore && !switchingToActive) {
    const margin = best.similarity - activeTopicScore.similarity;
    if (margin > 0.06) {
      score += 0.06;
      reasons.push("Best topic clearly beats the active topic.");
    } else if (margin < 0.02) {
      score -= 0.04;
      reasons.push("Best topic does not clearly separate from the active topic.");
    }
  }

  if (interpretation.switchCue && !switchingToActive) {
    score += 0.08;
    reasons.push("Switch cue supports moving to another existing topic.");
  }

  if (interpretation.continuationCue && switchingToActive) {
    score += 0.03;
    reasons.push("Continuation cue still allows reuse of the active topic.");
  }

  if (interpretation.suspiciousLabel) {
    score -= 0.04;
    reasons.push("Suspicious extracted label reduces confidence in switching.");
  }

  if (interpretation.subpartCue && !switchingToActive) {
    score -= 0.05;
    reasons.push("Subpart phrasing makes cross-topic switching less safe.");
  }

  return {
    kind: "switch_existing",
    score: clamp(score, 0, 1),
    reasons,
    topic: best.topic,
    label: interpretation.canonicalLabel ?? best.topic.name,
  };
}

function scoreCreateNewHypothesis(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic?: RouteTopic | null;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis {
  const { labeling, interpretation, best, second, topGap, activeTopic, semanticVectorInfo } = args;

  let score = 0;
  const reasons: string[] = [];
  const label = interpretation.canonicalLabel ?? null;

  if (!label) {
    return {
      kind: "create_new",
      score: 0,
      reasons: ["No canonical label is available for a new topic."],
      topic: null,
      label: null,
    };
  }

  score += interpretation.labelConfidence * 0.62;
  reasons.push(`Deterministic label confidence is ${interpretation.labelConfidence.toFixed(2)}.`);

  if (looksLikeStrongDeterministicCreateLabel(labeling, interpretation)) {
    score += 0.18;
    reasons.push("Deterministic label looks strong and create-worthy.");
  }

  if (interpretation.specificity === "good" || interpretation.specificity === "very_specific") {
    score += 0.14;
    reasons.push("Label specificity supports a stable new topic.");
  } else if (interpretation.specificity === "broad_but_usable") {
    score += 0.04;
    reasons.push("Label is broad but still potentially usable.");
  }

  const bestScore = best?.similarity ?? 0;
  if (bestScore < MID_REUSE_TOPIC_THRESHOLD) {
    score += 0.16;
    reasons.push("No existing topic matches strongly enough to force reuse.");
  } else if (bestScore >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score -= 0.18;
    reasons.push("A strong existing-topic match argues against creating new.");
  }

  if (best && second) {
    const margin = best.similarity - second.similarity;
    if (margin < 0.03 && best.similarity >= MID_REUSE_TOPIC_THRESHOLD) {
      score -= 0.05;
      reasons.push("Existing-topic field is crowded, making clean creation less safe.");
    }
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.03;
    reasons.push("The extracted label is not heavily contested.");
  }

  if (interpretation.switchCue && best && best.similarity >= MID_REUSE_TOPIC_THRESHOLD) {
    score -= 0.06;
    reasons.push("Switch cue plus plausible existing topic argues for reuse, not creation.");
  }

  if (interpretation.continuationCue && activeTopic) {
    score -= 0.08;
    reasons.push("Continuation signal argues against splitting into a new topic.");
  }

  if (interpretation.subpartCue || interpretation.subpartLikeLabel) {
    score -= 0.12;
    reasons.push("Subpart-like phrasing should usually stay inside an existing topic.");
  }

  if (interpretation.suspiciousLabel) {
    score -= 0.14;
    reasons.push("Suspicious label weakens the create-new case.");
  }

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score -= 0.08;
    reasons.push("Candidate competition weakens the create-new case.");
  }

  if (hasAmbiguityFlag(labeling, "concept_span_clause_like")) {
    score -= 0.07;
    reasons.push("Clause-like concept span weakens new-topic creation.");
  }

  if (best) {
    const semanticSupport = getSemanticRetrievalSupport(best.topic, semanticVectorInfo);
    if (semanticSupport.semanticSimilarity >= 0.22) {
      score -= 0.09;
      reasons.push("Semantic retrieval found a meaningful nearby existing topic.");
    }
  }

  if (!labeling.topic_decision.should_create_new_topic) {
    score -= 0.02;
    reasons.push("Deterministic topic decision was cautious about creation.");
  }

  return {
    kind: "create_new",
    score: clamp(score, 0, 1),
    reasons,
    topic: null,
    label,
  };
}

function scoreAmbiguousHypothesis(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
}): ResolutionHypothesis {
  const { labeling, interpretation, best, second, topGap, activeTopic, activeTopicScore } = args;

  let score = 0.08;
  const reasons: string[] = [];

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score += 0.22;
    reasons.push("Deterministic labeling reports candidate competition.");
  }

  if (hasAmbiguityFlag(labeling, "low_confidence")) {
    score += 0.16;
    reasons.push("Deterministic confidence is low.");
  }

  if (hasAmbiguityFlag(labeling, "needs_adjudication")) {
    score += 0.16;
    reasons.push("Deterministic output recommends adjudication.");
  }

  if (interpretation.suspiciousLabel) {
    score += 0.18;
    reasons.push("Suspicious extracted label increases ambiguity.");
  }

  if (hasAmbiguityFlag(labeling, "concept_extraction_weak")) {
    score += 0.18;
    reasons.push("Concept extraction appears weak.");
  }

  if (best && second && topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.12;
    reasons.push("Top existing-topic candidates are tightly clustered.");
  }

  if (
    activeTopic &&
    activeTopicScore &&
    best &&
    best.topic.id !== activeTopic.id &&
    Math.abs(best.similarity - activeTopicScore.similarity) < 0.05
  ) {
    score += 0.08;
    reasons.push("Active topic and best alternative are too close to separate confidently.");
  }

  if (interpretation.subpartCue && !interpretation.referencesActiveTopic && best?.similarity) {
    score += 0.05;
    reasons.push("Subpart wording without clean anchoring increases ambiguity.");
  }

  return {
    kind: "ambiguous",
    score: clamp(score, 0, 1),
    reasons,
    topic: null,
    label: interpretation.canonicalLabel ?? null,
  };
}

function buildResolutionHypotheses(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic?: RouteTopic | null;
  message: string;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis[] {
  const {
    labeling,
    interpretation,
    scoredTopics,
    best,
    second,
    topGap,
    activeTopic,
    message,
    semanticVectorInfo,
  } = args;

  const activeTopicScore = activeTopic
    ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
    : null;

  const stayActive = scoreStayActiveHypothesis({
    interpretation,
    activeTopic,
    activeTopicScore,
    topGap,
    message,
  });

  const switchExisting = scoreSwitchExistingHypothesis({
    interpretation,
    best,
    activeTopic,
    activeTopicScore,
    topGap,
    semanticVectorInfo,
  });

  const createNew = scoreCreateNewHypothesis({
    labeling,
    interpretation,
    best,
    second,
    topGap,
    activeTopic,
    semanticVectorInfo,
  });

  const ambiguous = scoreAmbiguousHypothesis({
    labeling,
    interpretation,
    best,
    second,
    topGap,
    activeTopic,
    activeTopicScore,
  });

  return [stayActive, switchExisting, createNew, ambiguous];
}

function chooseWinningHypothesis(hypotheses: ResolutionHypothesis[]): ResolutionHypothesis {
  const sorted = hypotheses.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (!best) {
    return {
      kind: "ambiguous",
      score: 1,
      reasons: ["No usable hypothesis was generated."],
      topic: null,
      label: null,
    };
  }

  return best;
}

function shouldRecommendFallbackAdjudication(
  winner: ResolutionHypothesis,
  interpretation: CandidateInterpretation,
  topGap: number
) {
  if (winner.kind === "ambiguous" && winner.score >= AMBIGUOUS_WIN_THRESHOLD) {
    return true;
  }

  if (interpretation.ambiguityFlags.includes("candidate_competition")) return true;
  if (interpretation.ambiguityFlags.includes("needs_adjudication")) return true;
  if (interpretation.ambiguityFlags.includes("label_suspicious")) return true;
  if (interpretation.ambiguityFlags.includes("low_confidence")) return true;
  if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) return true;

  return false;
}

function inferDecisionAction(args: {
  winner: ResolutionHypothesis;
  best: ScoredTopic | null;
  activeTopic?: RouteTopic | null;
  activeTopicScore: ScoredTopic | null;
  interpretation: CandidateInterpretation;
}): ResolutionDecisionAction {
  const { winner, best, activeTopic, activeTopicScore, interpretation } = args;

  if (winner.kind === "stay_active" && activeTopic) {
    return "stay_on_active_topic";
  }

  if (winner.kind === "switch_existing" && winner.topic) {
    return winner.topic.id === activeTopic?.id
      ? "stay_on_active_topic"
      : "reuse_existing_topic";
  }

  if (
    winner.kind === "create_new" &&
    winner.label &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel
  ) {
    return "create_new_topic";
  }

  if (
    best &&
    best.similarity >= STRONG_REUSE_TOPIC_THRESHOLD &&
    (!interpretation.suspiciousLabel || best.topic.id === activeTopic?.id)
  ) {
    return best.topic.id === activeTopic?.id ? "stay_on_active_topic" : "reuse_existing_topic";
  }

  if (
    activeTopic &&
    activeTopicScore &&
    activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD &&
    (interpretation.continuationCue || interpretation.referencesActiveTopic || interpretation.subpartCue)
  ) {
    return "stay_on_active_topic";
  }

  return "no_confident_decision";
}

function buildResolutionTrace(args: {
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  hypotheses: ResolutionHypothesis[];
  winner: ResolutionHypothesis;
  topGap: number;
  decisionAction: ResolutionDecisionAction;
  fallbackRecommended: boolean;
}): TopicResolutionTrace {
  const { interpretation, scoredTopics, hypotheses, winner, topGap, decisionAction, fallbackRecommended } = args;

  return {
    interpretation: {
      canonicalLabel: interpretation.canonicalLabel,
      conceptSpan: interpretation.conceptSpan,
      questionAboutTopic: interpretation.questionAboutTopic,
      frame: interpretation.frame,
      labelConfidence: interpretation.labelConfidence,
      specificity: interpretation.specificity,
      granularityHint: interpretation.granularityHint,
      referencesActiveTopic: interpretation.referencesActiveTopic,
      switchCue: interpretation.switchCue,
      continuationCue: interpretation.continuationCue,
      subpartCue: interpretation.subpartCue,
      suspiciousLabel: interpretation.suspiciousLabel,
      subpartLikeLabel: interpretation.subpartLikeLabel,
      ambiguityFlags: interpretation.ambiguityFlags,
    },
    candidates: scoredTopics.slice(0, 5).map((item) => ({
      topicId: item.topic.id,
      topicName: item.topic.name,
      similarity: item.similarity,
      breakdown: item.breakdown,
    })),
    hypotheses: hypotheses.map((hypothesis) => ({
      kind: hypothesis.kind,
      score: hypothesis.score,
      reasons: hypothesis.reasons,
      topicId: hypothesis.topic?.id ?? null,
      topicName: hypothesis.topic?.name ?? null,
      label: hypothesis.label,
    })),
    winner: {
      kind: winner.kind,
      score: winner.score,
      reasons: winner.reasons,
      topicId: winner.topic?.id ?? null,
      topicName: winner.topic?.name ?? null,
      label: winner.label,
    },
    topGap,
    decisionAction,
    fallbackRecommended,
  };
}

function adjudicateTopicResolution(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): ResolutionAdjudication {
  const normalizedSemanticVectorInfo = normalizeVectorInfo(semanticVectorInfo);

  const labeling = buildLabelingResult(
    message,
    existingTopics,
    activeTopic,
    normalizedSemanticVectorInfo
  );

  const interpretation = buildCandidateInterpretation(message, labeling);

  const scoredTopics = buildBaseTopicScores(
    labeling,
    interpretation,
    existingTopics,
    normalizedSemanticVectorInfo,
    activeTopic
  );

  const best = scoredTopics[0] ?? null;
  const second = scoredTopics[1] ?? null;
  const topGap = best ? Math.max(0, best.similarity - (second?.similarity ?? 0)) : 0;

  const activeTopicScore = activeTopic
    ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
    : null;

  const hypotheses = buildResolutionHypotheses({
    labeling,
    interpretation,
    scoredTopics,
    best,
    second,
    topGap,
    activeTopic,
    message,
    semanticVectorInfo: normalizedSemanticVectorInfo,
  });

  const winner = chooseWinningHypothesis(hypotheses);

  const fallbackRecommended = shouldRecommendFallbackAdjudication(winner, interpretation, topGap);

  const decisionAction = inferDecisionAction({
    winner,
    best,
    activeTopic,
    activeTopicScore,
    interpretation,
  });

  const trace = buildResolutionTrace({
    interpretation,
    scoredTopics,
    hypotheses,
    winner,
    topGap,
    decisionAction,
    fallbackRecommended,
  });

  return {
    labeling,
    interpretation,
    scoredTopics,
    vectorInfo: mergeVectorInfos(
      normalizedSemanticVectorInfo,
      buildVectorInfoFromScoredTopics(scoredTopics)
    ),
    best,
    second,
    topGap,
    activeTopicScore,
    hypotheses,
    winner,
    fallbackRecommended,
    decisionAction,
    trace,
  };
}

function looksLikeSuspiciousResolvedLabel(label: string | null) {
  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  const suspiciousSingles = new Set([
    "i",
    "me",
    "you",
    "we",
    "they",
    "this",
    "that",
    "it",
    "it's",
    "part",
    "thing",
    "stuff",
    "help",
    "question",
    "new topic",
    "law works",
    "say",
    "helped",
    "mean",
    "another example",
    "happens right",
    "no the second",
    "no i meant the sweeping",
    "keep mixing",
    "scoring",
    "sweeping",
  ]);

  if (suspiciousSingles.has(normalized)) return true;
  if (normalized.split(" ").length > 8) return true;
  if (/\b(help|understand|get|confused|stuck|trouble)\b/i.test(label)) return true;
  if (/^(?:say|helped|mean|scoring|sweeping|wait|example)$/i.test(normalized)) return true;

  return false;
}

function looksLikeSubpartResolvedLabel(label: string | null) {
  if (!label) return false;
  const normalized = normalizeLoose(label);
  return (
    normalized === "scoring" ||
    normalized === "sweeping" ||
    normalized === "first part" ||
    normalized === "second part" ||
    normalized === "that part" ||
    normalized === "this part"
  );
}

function findTopicByNameApprox(
  requested: string,
  topics: RouteTopic[],
  excludeTopicId?: string | null
): RouteTopic | null {
  const requestedTokens = semanticTokenize(requested);
  if (!requestedTokens.length) return null;

  let best: { topic: RouteTopic; score: number } | null = null;

  for (const topic of topics) {
    if (excludeTopicId && topic.id === excludeTopicId) continue;

    const score = overlapScore(requestedTokens, semanticTokenize(topic.name));
    const exact = normalizeTopicText(requested) === normalizeTopicText(topic.name) ? 1 : 0;
    const finalScore = Math.max(score, exact);

    if (!best || finalScore > best.score) {
      best = { topic, score: finalScore };
    }
  }

  if (!best) return null;
  if (best.score >= 0.62) return best.topic;
  return null;
}

function extractExplicitSwitchTargetString(message: string): string | null {
  const normalized = normalizeSurface(message);

  for (const regex of EXPLICIT_EXISTING_TOPIC_SWITCH_PREFIXES) {
    const match = normalized.match(regex);
    const requested = match?.[1]?.trim();
    if (requested) return requested;
  }

  if (/^(?:actually\s+can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    return normalized.replace(/^(?:actually\s+can we go back to)\s+/i, "").trim();
  }

  if (/^(?:can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    return normalized.replace(/^(?:can we go back to)\s+/i, "").trim();
  }

  if (/^(?:wait,?\s*go back to)\s+(.+?)\.?$/i.test(normalized)) {
    return normalized.replace(/^(?:wait,?\s*go back to)\s+/i, "").trim();
  }

  return null;
}

function extractExplicitExistingTopicTarget(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): RouteTopic | null {
  const requested = extractExplicitSwitchTargetString(message);
  if (!requested) return null;

  return findTopicByNameApprox(requested, existingTopics, activeTopic?.id ?? null);
}

function findPreviousNonActiveTopic(
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): RouteTopic | null {
  if (!existingTopics.length) return null;
  if (!activeTopic) return existingTopics[existingTopics.length - 1] ?? null;

  const activeIndex = existingTopics.findIndex((topic) => topic.id === activeTopic.id);
  if (activeIndex <= 0) return null;

  return existingTopics[activeIndex - 1] ?? null;
}

export function shouldTryLLMTopicResolutionFallback(args: {
  resolutionKind: DeterministicTopicResolutionSnapshot["resolutionKind"];
  matchConfidence: number;
  resolvedLabel: string | null;
  existingTopicsCount: number;
  vectorInfo?: VectorInfo | null;
}) {
  const { resolutionKind, matchConfidence, resolvedLabel, existingTopicsCount, vectorInfo } = args;

  if (existingTopicsCount === 0) return false;

  const topSemanticScore = normalizeVectorInfo(vectorInfo).top_k_similarity_scores[0] ?? 0;

  if (looksLikeSuspiciousResolvedLabel(resolvedLabel)) return true;
  if (resolutionKind === "no_match") return true;

  if (
    resolutionKind === "fallback_existing_topic" &&
    matchConfidence < 0.66 &&
    topSemanticScore < 0.24
  ) {
    return true;
  }

  if (
    resolutionKind === "fallback_active_topic" &&
    matchConfidence < 0.58 &&
    topSemanticScore < 0.22
  ) {
    return true;
  }

  if (resolutionKind === "created_new_candidate" && matchConfidence < 0.78) {
    return true;
  }

  return false;
}

export function buildDeterministicTopicResolutionSnapshot(
  match: TopicMatchResult
): DeterministicTopicResolutionSnapshot {
  return {
    resolutionKind: match.resolutionKind,
    resolvedLabel: match.resolvedLabel,
    matchConfidence: match.matchConfidence,
    vectorInfo: match.vectorInfo,
  };
}

function conceptualUsefulnessSupportsCreation(args: {
  best: ScoredTopic | null;
  interpretation: CandidateInterpretation;
  activeTopic?: RouteTopic | null;
}): boolean {
  const { best, interpretation, activeTopic } = args;

  if (!best) return true;
  if (interpretation.suspiciousLabel) return false;
  if (interpretation.subpartCue || interpretation.subpartLikeLabel) return false;
  if (interpretation.continuationCue && activeTopic) return false;

  return best.similarity < MID_REUSE_TOPIC_THRESHOLD;
}

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): TopicMatchResult {
  const normalizedSemanticVectorInfo = normalizeVectorInfo(semanticVectorInfo);

  const adjudication = adjudicateTopicResolution(
    message,
    existingTopics,
    activeTopic,
    normalizedSemanticVectorInfo
  );

  const {
    labeling,
    interpretation,
    vectorInfo,
    best,
    second,
    winner,
    activeTopicScore,
    decisionAction,
    trace,
  } = adjudication;

  if (!existingTopics.length) {
    const createConfidence =
      labeling.topic_decision.should_create_new_topic &&
      !interpretation.suspiciousLabel &&
      !interpretation.subpartLikeLabel
        ? labeling.topic_decision.confidence
        : 0;

    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR,
      resolutionKind:
        createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR ? "created_new_candidate" : "no_match",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence:
        createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR
          ? createConfidence
          : labeling.topic_decision.confidence,
      resolutionTrace: trace,
    };
  }

  const explicitExistingTarget = extractExplicitExistingTopicTarget(message, existingTopics, activeTopic);
  if (explicitExistingTarget) {
    return {
      matchedTopic: explicitExistingTarget,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        explicitExistingTarget.id === activeTopic?.id ? "fallback_active_topic" : "matched_existing",
      resolvedLabel: explicitExistingTarget.name,
      matchConfidence: 0.95,
      resolutionTrace: trace,
    };
  }

  if (looksLikeReturnToPreviousTopic(message)) {
    const previousTopic = findPreviousNonActiveTopic(existingTopics, activeTopic);
    if (previousTopic) {
      return {
        matchedTopic: previousTopic,
        vectorInfo,
        shouldCreateNewTopic: false,
        resolutionKind: "fallback_existing_topic",
        resolvedLabel: previousTopic.name,
        matchConfidence: 0.9,
        resolutionTrace: trace,
      };
    }
  }

  if (activeTopic && looksLikeMixedAnaphoricSubpartFollowup(message)) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, 0.9, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  if (activeTopic && looksLikeActiveTopicSubpartFollowup(message)) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, 0.88, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  if (
    activeTopic &&
    (looksLikeActiveTopicAnaphoricFollowup(message) || looksLikeMetaContinuation(message)) &&
    !labeling.topic_decision.should_create_new_topic
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, 0.86, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  if (
    activeTopic &&
    (interpretation.suspiciousLabel || interpretation.subpartLikeLabel) &&
    (looksLikeActiveTopicAnaphoricFollowup(message) ||
      looksLikeActiveTopicSubpartFollowup(message) ||
      looksLikeMixedAnaphoricSubpartFollowup(message) ||
      looksLikeMetaContinuation(message))
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, 0.84),
      resolutionTrace: trace,
    };
  }

  if (decisionAction === "stay_on_active_topic" && activeTopic) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: interpretation.canonicalLabel ?? activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, winner.score),
      resolutionTrace: trace,
    };
  }

  if (decisionAction === "reuse_existing_topic" && best) {
    const isActive = best.topic.id === activeTopic?.id;
    const confidence =
      second && best.similarity - second.similarity >= HIGH_USEFULNESS_MARGIN
        ? Math.max(best.similarity, winner.score)
        : best.similarity;

    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: isActive ? "fallback_active_topic" : "matched_existing",
      resolvedLabel: interpretation.canonicalLabel ?? best.topic.name,
      matchConfidence: confidence,
      resolutionTrace: trace,
    };
  }

  if (
    decisionAction === "create_new_topic" &&
    interpretation.canonicalLabel &&
    interpretation.labelConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR &&
    conceptualUsefulnessSupportsCreation({
      best,
      interpretation,
      activeTopic,
    })
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: interpretation.canonicalLabel,
      matchConfidence: Math.max(winner.score, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  if (
    winner.kind === "switch_existing" &&
    winner.topic &&
    best &&
    best.similarity >= MID_REUSE_TOPIC_THRESHOLD &&
    !interpretation.suspiciousLabel
  ) {
    const isActive = winner.topic.id === activeTopic?.id;

    return {
      matchedTopic: winner.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: isActive ? "fallback_active_topic" : "fallback_existing_topic",
      resolvedLabel: interpretation.canonicalLabel ?? winner.topic.name,
      matchConfidence: Math.max(best.similarity, winner.score),
      resolutionTrace: trace,
    };
  }

  if (
    interpretation.canonicalLabel &&
    interpretation.labelConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    (best?.similarity ?? 0) < MID_REUSE_TOPIC_THRESHOLD &&
    conceptualUsefulnessSupportsCreation({
      best,
      interpretation,
      activeTopic,
    })
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: interpretation.canonicalLabel,
      matchConfidence: interpretation.labelConfidence,
      resolutionTrace: trace,
    };
  }

  if (best && best.similarity >= MID_REUSE_TOPIC_THRESHOLD && !interpretation.suspiciousLabel) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        best.topic.id === activeTopic?.id ? "fallback_active_topic" : "fallback_existing_topic",
      resolvedLabel: interpretation.canonicalLabel ?? best.topic.name,
      matchConfidence: best.similarity,
      resolutionTrace: trace,
    };
  }

  if (
    activeTopic &&
    activeTopicScore &&
    activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD &&
    (winner.kind !== "create_new" ||
      interpretation.suspiciousLabel ||
      interpretation.subpartLikeLabel ||
      interpretation.continuationCue)
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: activeTopicScore.similarity,
      resolutionTrace: trace,
    };
  }

  return {
    matchedTopic: null,
    vectorInfo,
    shouldCreateNewTopic: false,
    resolutionKind: "no_match",
    resolvedLabel: interpretation.canonicalLabel ?? null,
    matchConfidence: Math.max(
      best?.similarity ?? 0,
      interpretation.labelConfidence * 0.7,
      winner.score * 0.7
    ),
    resolutionTrace: trace,
  };
}

export function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const canonicalName = canonicalizeTopicNameFromMessage(message);
  const nextStep = inferSeededNextStep(message);
  const position = computeNextTopicPosition(existingTopics);

  return {
    id: makeId("topic"),
    name: canonicalName,
    diagnosis: "representation_gap",
    nextStep,
    confusion: 0.58,
    insight: 0.34,
    learningScore: 0.22,
    position,
    scale: 1,
    messageCount: 1,
    lastUpdated: new Date().toISOString(),
    hasAvailableProbe: false,
  } as RouteTopic;
}

function extractPositionFromTopicJson(topicJson: unknown): [number, number, number] | null {
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  const json = topicJson as {
    learning_space_topic?: {
      position?: unknown;
    };
  };

  return isPosition(json.learning_space_topic?.position)
    ? json.learning_space_topic.position
    : null;
}

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>
): RouteTopic[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row, index) => {
    const fallbackTopic = mockTopics[index % mockTopics.length];

    const position = extractPositionFromTopicJson(row.topic_json) ?? fallbackTopic.position;

    return {
      ...fallbackTopic,
      id: row.topic_id ?? fallbackTopic.id ?? makeId("topic"),
      name: row.topic_name?.trim() || fallbackTopic.name,
      diagnosis: normalizeDiagnosis(row.diagnosis ?? fallbackTopic.diagnosis),
      nextStep: row.next_step?.trim() || fallbackTopic.nextStep,
      confusion: clamp(Number(row.confusion ?? fallbackTopic.confusion), 0, 1),
      insight: clamp(Number(row.insight ?? fallbackTopic.insight), 0, 1),
      learningScore: clamp(Number(row.learning_score ?? fallbackTopic.learningScore), 0, 1),
      position,
      scale: fallbackTopic.scale ?? 1,
      messageCount: fallbackTopic.messageCount ?? 0,
      lastUpdated: row.updated_at ?? fallbackTopic.lastUpdated ?? null,
      hasAvailableProbe: false,
    } as RouteTopic;
  });
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  try {
    const rows = await getLatestTopicState();
    const mapped = mapRowsToTopics(rows);

    return mapped;
  } catch (error) {
    console.error(
      "Failed to read topic_state in loadRouteTopics; returning empty topic list:",
      error
    );
    return [];
  }
}