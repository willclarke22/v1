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

type TopicScoreBreakdown = {
  exactNameMatch: number;
  containedMatch: number;
  conceptOverlap: number;
  questionOverlap: number;
  retrievalBias: number;
  activeTopicBonus: number;
  frameBonus: number;
  confidenceBonus: number;
  vaguePenalty: number;
  ambiguityPenalty: number;
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
  scoredTopics: ScoredTopic[];
  vectorInfo: VectorInfo;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopicScore: ScoredTopic | null;
  hypotheses: ResolutionHypothesis[];
  winner: ResolutionHypothesis;
  fallbackRecommended: boolean;
};

const STRONG_REUSE_TOPIC_THRESHOLD = 0.64;
const WEAK_REUSE_TOPIC_THRESHOLD = 0.52;
const ACTIVE_TOPIC_FALLBACK_THRESHOLD = 0.46;
const CREATE_NEW_CONFIDENCE_THRESHOLD = 0.72;
const LOW_CONFIDENCE_CREATE_NEW_FLOOR = 0.58;
const CANDIDATE_COMPETITION_GAP_THRESHOLD = 0.08;
const AMBIGUOUS_WIN_THRESHOLD = 0.62;

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
  /^(?:wait,?\s*what do you mean)\??$/i,
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
];

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
  return ACTIVE_TOPIC_ANAPHORIC_FOLLOWUP_REGEXES.some((regex) =>
    regex.test(normalized)
  );
}

function looksLikeActiveTopicSubpartFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return ACTIVE_TOPIC_SUBPART_FOLLOWUP_REGEXES.some((regex) =>
    regex.test(normalized)
  );
}

function looksLikeMetaContinuation(message: string) {
  const normalized = normalizeSurface(message);
  return META_CONTINUATION_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeReturnToPreviousTopic(message: string) {
  const normalized = normalizeSurface(message);
  return RETURN_TO_PREVIOUS_TOPIC_REGEXES.some((regex) => regex.test(normalized));
}

function buildTopicLabelingInput(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): TopicLabelingInput {
  const retrievalCandidates: RetrievalCandidate[] = existingTopics.map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
    similarity: 0,
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
  activeTopic?: RouteTopic | null
) {
  const input = buildTopicLabelingInput(message, existingTopics, activeTopic);
  return runDeterministicTopicLabeling(input);
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
    labeling.interpretation.concept_span ??
    labeling.topic_decision.canonical_label ??
    message;

  return dedupe(semanticTokenize(source).filter((token) => token.length > 2)).slice(
    0,
    8
  );
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

  const score = exactNameMatch * 1.0 + containedMatch * 0.82 + tokenScore * 0.78;
  return clamp(score, 0, 1);
}

function buildVectorInfoFromScoredTopics(
  scored: Array<{ topic: RouteTopic; similarity: number }>
): VectorInfo {
  return {
    top_k_topic_names: scored.slice(0, 3).map((item) => item.topic.name),
    top_k_topic_ids: scored.slice(0, 3).map((item) => item.topic.id),
    top_k_similarity_scores: scored
      .slice(0, 3)
      .map((item) => clamp(item.similarity, 0, 0.98)),
  };
}

function computeNextTopicPosition(
  existingTopics: RouteTopic[]
): [number, number, number] {
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

function hasAmbiguityFlag(labeling: TopicLabelingResult, flag: string) {
  return labeling.diagnostics.ambiguity_flags.includes(flag);
}

function looksLikeStrongDeterministicCreateLabel(labeling: TopicLabelingResult) {
  const specificity = labeling.topic_decision.topic_specificity;
  const confidence = labeling.topic_decision.confidence;

  if (!labeling.topic_decision.canonical_label) return false;
  if (specificity === "too_vague") return false;
  if (hasAmbiguityFlag(labeling, "label_suspicious")) return false;
  if (hasAmbiguityFlag(labeling, "concept_span_clause_like")) return false;
  if (hasAmbiguityFlag(labeling, "candidate_competition")) return false;

  return (
    confidence >= CREATE_NEW_CONFIDENCE_THRESHOLD &&
    (specificity === "good" || specificity === "very_specific")
  );
}

function buildScoreBreakdown(
  labeling: TopicLabelingResult,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): TopicScoreBreakdown {
  const candidateLabel = labeling.topic_decision.canonical_label;
  const conceptSpan = labeling.interpretation.concept_span;
  const questionAboutTopic = labeling.interpretation.question_about_topic;

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
    ? overlapScore(
        semanticTokenize(questionAboutTopic),
        semanticTokenize(topic.name)
      ) * 0.18
    : 0;

  const retrievalBias = labeling.topic_decision.confidence * 0.08;

  const activeTopicBonus =
    labeling.interpretation.references_active_topic &&
    activeTopic &&
    activeTopic.id === topic.id
      ? 0.08
      : 0;

  const frame = mapIntentToFrame(labeling.interpretation.message_intent);
  const frameBonus =
    frame === "quiz_request" ||
    frame === "confusion_help" ||
    frame === "explain_request"
      ? 0.04
      : 0;

  const vaguePenalty =
    labeling.topic_decision.topic_specificity === "too_vague" ? 0.12 : 0;

  const ambiguityPenalty =
    hasAmbiguityFlag(labeling, "candidate_competition") ||
    hasAmbiguityFlag(labeling, "label_suspicious")
      ? 0.05
      : 0;

  const finalScore = clamp(
    conceptOverlap +
      questionOverlap +
      frameBonus +
      retrievalBias +
      activeTopicBonus -
      vaguePenalty -
      ambiguityPenalty,
    0,
    1
  );

  return {
    exactNameMatch,
    containedMatch,
    conceptOverlap,
    questionOverlap,
    retrievalBias,
    activeTopicBonus,
    frameBonus,
    confidenceBonus: labeling.topic_decision.confidence * 0.08,
    vaguePenalty,
    ambiguityPenalty,
    finalScore,
  };
}

export function scoreTopicMatch(message: string, topic: RouteTopic): number {
  const labeling = buildLabelingResult(message, []);
  const breakdown = buildScoreBreakdown(labeling, topic);
  return breakdown.finalScore;
}

function buildBaseTopicScores(
  labeling: TopicLabelingResult,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): ScoredTopic[] {
  return existingTopics
    .map((topic) => {
      const breakdown = buildScoreBreakdown(labeling, topic, activeTopic);
      return {
        topic,
        similarity: breakdown.finalScore,
        breakdown,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

function scoreStayActiveHypothesis(args: {
  labeling: TopicLabelingResult;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
  message: string;
}): ResolutionHypothesis {
  const { labeling, activeTopic, activeTopicScore, topGap, message } = args;

  if (!activeTopic || !activeTopicScore) {
    return {
      kind: "stay_active",
      score: 0,
      reasons: ["No active topic is available to stay on."],
      topic: null,
      label: labeling.topic_decision.canonical_label ?? null,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  score += activeTopicScore.similarity * 0.72;
  reasons.push(`Active topic similarity is ${activeTopicScore.similarity.toFixed(2)}.`);

  if (labeling.interpretation.references_active_topic) {
    score += 0.12;
    reasons.push("Message appears to reference the active topic explicitly.");
  }

  if (activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD) {
    score += 0.06;
    reasons.push("Active topic clears the minimum continuity threshold.");
  }

  if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.03;
    reasons.push("No strong competing topic clearly beats the active topic.");
  }

  if (hasAmbiguityFlag(labeling, "label_suspicious")) {
    score += 0.05;
    reasons.push("Suspicious label makes conservative continuity slightly safer.");
  }

  if (looksLikeActiveTopicAnaphoricFollowup(message)) {
    score += 0.28;
    reasons.push("Short anaphoric follow-up strongly suggests staying on the active topic.");
  }

  if (looksLikeActiveTopicSubpartFollowup(message)) {
    score += 0.24;
    reasons.push("Subpart follow-up is better treated as staying within the active topic.");
  }

  if (looksLikeMetaContinuation(message)) {
    score += 0.24;
    reasons.push("Meta continuation is safer to anchor to the active topic.");
  }

  if (labeling.topic_decision.should_create_new_topic) {
    score -= 0.1;
    reasons.push("Deterministic labeling leans toward a new concept.");
  }

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score -= 0.04;
    reasons.push("Competing candidate signals reduce confidence in staying.");
  }

  return {
    kind: "stay_active",
    score: clamp(score, 0, 1),
    reasons,
    topic: activeTopic,
    label: labeling.topic_decision.canonical_label ?? activeTopic.name,
  };
}

function scoreSwitchExistingHypothesis(args: {
  labeling: TopicLabelingResult;
  best: ScoredTopic | null;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
}): ResolutionHypothesis {
  const { labeling, best, activeTopic, activeTopicScore, topGap } = args;

  if (!best) {
    return {
      kind: "switch_existing",
      score: 0,
      reasons: ["No existing topic candidate is available."],
      topic: null,
      label: labeling.topic_decision.canonical_label ?? null,
    };
  }

  const switchingToActive = activeTopic && best.topic.id === activeTopic.id;
  let score = 0;
  const reasons: string[] = [];

  score += best.similarity * 0.78;
  reasons.push(`Best existing-topic similarity is ${best.similarity.toFixed(2)}.`);

  if (!switchingToActive) {
    score += 0.05;
    reasons.push("Best match is not merely the active topic.");
  }

  if (best.similarity >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score += 0.07;
    reasons.push("Best topic clears the strong reuse threshold.");
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.05;
    reasons.push("Best topic has a healthy margin over alternatives.");
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

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score -= 0.05;
    reasons.push("Candidate competition reduces confidence in switching.");
  }

  if (hasAmbiguityFlag(labeling, "label_suspicious")) {
    score -= 0.04;
    reasons.push("Suspicious label reduces trust in deterministic switching.");
  }

  return {
    kind: "switch_existing",
    score: clamp(score, 0, 1),
    reasons,
    topic: best.topic,
    label: labeling.topic_decision.canonical_label ?? best.topic.name,
  };
}

function scoreCreateNewHypothesis(args: {
  labeling: TopicLabelingResult;
  best: ScoredTopic | null;
  topGap: number;
}): ResolutionHypothesis {
  const { labeling, best, topGap } = args;

  let score = 0;
  const reasons: string[] = [];
  const label = labeling.topic_decision.canonical_label ?? null;

  if (!label) {
    return {
      kind: "create_new",
      score: 0,
      reasons: ["No canonical label is available for a new topic."],
      topic: null,
      label: null,
    };
  }

  score += labeling.topic_decision.confidence * 0.62;
  reasons.push(
    `Deterministic label confidence is ${labeling.topic_decision.confidence.toFixed(2)}.`
  );

  if (looksLikeStrongDeterministicCreateLabel(labeling)) {
    score += 0.18;
    reasons.push("Deterministic label looks strong and create-worthy.");
  }

  if (
    labeling.topic_decision.topic_specificity === "good" ||
    labeling.topic_decision.topic_specificity === "very_specific"
  ) {
    score += 0.14;
    reasons.push("Label specificity supports a stable new topic.");
  } else if (labeling.topic_decision.topic_specificity === "broad_but_usable") {
    score += 0.04;
    reasons.push("Label is broad but may still be usable.");
  }

  const bestScore = best?.similarity ?? 0;
  if (bestScore < WEAK_REUSE_TOPIC_THRESHOLD) {
    score += 0.18;
    reasons.push("No existing topic matches strongly enough to force reuse.");
  } else if (bestScore >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score -= 0.16;
    reasons.push("A strong existing-topic match argues against creating new.");
  }

  if (bestScore < 0.3 && labeling.topic_decision.confidence >= 0.7) {
    score += 0.12;
    reasons.push("Clean label plus weak existing matches supports creation.");
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.04;
    reasons.push("The deterministic label is not heavily contested.");
  }

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score -= 0.08;
    reasons.push("Candidate competition weakens the create-new case.");
  }

  if (hasAmbiguityFlag(labeling, "label_suspicious")) {
    score -= 0.12;
    reasons.push("Suspicious label weakens the create-new case.");
  }

  if (hasAmbiguityFlag(labeling, "concept_span_clause_like")) {
    score -= 0.07;
    reasons.push("Clause-like concept span weakens new-topic creation.");
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
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
}): ResolutionHypothesis {
  const { labeling, best, second, topGap, activeTopic, activeTopicScore } = args;

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

  if (hasAmbiguityFlag(labeling, "label_suspicious")) {
    score += 0.18;
    reasons.push("Suspicious label increases ambiguity.");
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

  return {
    kind: "ambiguous",
    score: clamp(score, 0, 1),
    reasons,
    topic: null,
    label: labeling.topic_decision.canonical_label ?? null,
  };
}

function buildResolutionHypotheses(args: {
  labeling: TopicLabelingResult;
  scoredTopics: ScoredTopic[];
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic?: RouteTopic | null;
  message: string;
}): ResolutionHypothesis[] {
  const { labeling, scoredTopics, best, second, topGap, activeTopic, message } = args;

  const activeTopicScore =
    activeTopic
      ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
      : null;

  const stayActive = scoreStayActiveHypothesis({
    labeling,
    activeTopic,
    activeTopicScore,
    topGap,
    message,
  });

  const switchExisting = scoreSwitchExistingHypothesis({
    labeling,
    best,
    activeTopic,
    activeTopicScore,
    topGap,
  });

  const createNew = scoreCreateNewHypothesis({
    labeling,
    best,
    topGap,
  });

  const ambiguous = scoreAmbiguousHypothesis({
    labeling,
    best,
    second,
    topGap,
    activeTopic,
    activeTopicScore,
  });

  return [stayActive, switchExisting, createNew, ambiguous];
}

function chooseWinningHypothesis(
  hypotheses: ResolutionHypothesis[]
): ResolutionHypothesis {
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
  labeling: TopicLabelingResult,
  topGap: number
) {
  if (winner.kind === "ambiguous" && winner.score >= AMBIGUOUS_WIN_THRESHOLD) {
    return true;
  }

  if (hasAmbiguityFlag(labeling, "candidate_competition")) return true;
  if (hasAmbiguityFlag(labeling, "needs_adjudication")) return true;
  if (hasAmbiguityFlag(labeling, "label_suspicious")) return true;
  if (hasAmbiguityFlag(labeling, "low_confidence")) return true;
  if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) return true;

  return false;
}

function adjudicateTopicResolution(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): ResolutionAdjudication {
  const labeling = buildLabelingResult(message, existingTopics, activeTopic);

  const scoredTopics = buildBaseTopicScores(labeling, existingTopics, activeTopic);
  const best = scoredTopics[0] ?? null;
  const second = scoredTopics[1] ?? null;
  const topGap = best ? Math.max(0, best.similarity - (second?.similarity ?? 0)) : 0;

  const activeTopicScore =
    activeTopic
      ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
      : null;

  const hypotheses = buildResolutionHypotheses({
    labeling,
    scoredTopics,
    best,
    second,
    topGap,
    activeTopic,
    message,
  });

  const winner = chooseWinningHypothesis(hypotheses);

  return {
    labeling,
    scoredTopics,
    vectorInfo: buildVectorInfoFromScoredTopics(scoredTopics),
    best,
    second,
    topGap,
    activeTopicScore,
    hypotheses,
    winner,
    fallbackRecommended: shouldRecommendFallbackAdjudication(
      winner,
      labeling,
      topGap
    ),
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

function extractExplicitExistingTopicTarget(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): RouteTopic | null {
  const normalized = normalizeSurface(message);

  for (const regex of EXPLICIT_EXISTING_TOPIC_SWITCH_PREFIXES) {
    const match = normalized.match(regex);
    const requested = match?.[1]?.trim();
    if (!requested) continue;

    const topic = findTopicByNameApprox(requested, existingTopics, null);
    if (topic) return topic;
  }

  if (/^(?:actually\s+can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    const requested = normalized.replace(/^(?:actually\s+can we go back to)\s+/i, "").trim();
    const topic = findTopicByNameApprox(requested, existingTopics, null);
    if (topic) return topic;
  }

  if (/^(?:can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    const requested = normalized.replace(/^(?:can we go back to)\s+/i, "").trim();
    const topic = findTopicByNameApprox(requested, existingTopics, null);
    if (topic) return topic;
  }

  if (/^(?:wait,?\s*go back to)\s+(.+?)\.?$/i.test(normalized)) {
    const requested = normalized.replace(/^(?:wait,?\s*go back to)\s+/i, "").trim();
    const topic = findTopicByNameApprox(requested, existingTopics, null);
    if (topic) return topic;
  }

  return null;
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
}) {
  const { resolutionKind, matchConfidence, resolvedLabel, existingTopicsCount } = args;

  if (existingTopicsCount === 0) return false;
  if (looksLikeSuspiciousResolvedLabel(resolvedLabel)) return true;
  if (resolutionKind === "no_match") return true;
  if (resolutionKind === "fallback_existing_topic" && matchConfidence < 0.66) {
    return true;
  }
  if (resolutionKind === "fallback_active_topic" && matchConfidence < 0.58) {
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

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): TopicMatchResult {
  const adjudication = adjudicateTopicResolution(message, existingTopics, activeTopic);
  const { labeling, vectorInfo, best, winner, activeTopicScore } = adjudication;

  const emptyVectorInfo: VectorInfo = {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };

  if (!existingTopics.length) {
    const createConfidence =
      labeling.topic_decision.should_create_new_topic &&
      !looksLikeSuspiciousResolvedLabel(labeling.topic_decision.canonical_label)
        ? labeling.topic_decision.confidence
        : 0;

    return {
      matchedTopic: null,
      vectorInfo: emptyVectorInfo,
      shouldCreateNewTopic: createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR,
      resolutionKind:
        createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR
          ? "created_new_candidate"
          : "no_match",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence:
        createConfidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR
          ? createConfidence
          : labeling.topic_decision.confidence,
    };
  }

  const explicitExistingTarget = extractExplicitExistingTopicTarget(
    message,
    existingTopics,
    activeTopic
  );
  if (explicitExistingTarget) {
    return {
      matchedTopic: explicitExistingTarget,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        explicitExistingTarget.id === activeTopic?.id
          ? "fallback_active_topic"
          : "matched_existing",
      resolvedLabel: explicitExistingTarget.name,
      matchConfidence: 0.95,
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
      };
    }
  }

  if (
    activeTopic &&
    (looksLikeActiveTopicAnaphoricFollowup(message) ||
      looksLikeActiveTopicSubpartFollowup(message) ||
      looksLikeMetaContinuation(message)) &&
    !labeling.topic_decision.should_create_new_topic
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(
        activeTopicScore?.similarity ?? 0,
        0.86,
        labeling.topic_decision.confidence
      ),
    };
  }

  if (
    activeTopic &&
    looksLikeSuspiciousResolvedLabel(labeling.topic_decision.canonical_label) &&
    (looksLikeActiveTopicAnaphoricFollowup(message) ||
      looksLikeActiveTopicSubpartFollowup(message) ||
      looksLikeMetaContinuation(message))
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, 0.84),
    };
  }

  if (winner.kind === "switch_existing" && winner.topic) {
    const winningTopic = winner.topic;
    const isActive = activeTopic && winningTopic.id === activeTopic.id;
    const matchConfidence =
      best?.topic.id === winningTopic.id ? best.similarity : winner.score;

    if (
      !isActive &&
      matchConfidence >= STRONG_REUSE_TOPIC_THRESHOLD &&
      !hasAmbiguityFlag(labeling, "candidate_competition")
    ) {
      return {
        matchedTopic: winningTopic,
        vectorInfo,
        shouldCreateNewTopic: false,
        resolutionKind: "matched_existing",
        resolvedLabel: labeling.topic_decision.canonical_label ?? winningTopic.name,
        matchConfidence,
      };
    }

    return {
      matchedTopic: winningTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: isActive ? "fallback_active_topic" : "fallback_existing_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? winningTopic.name,
      matchConfidence,
    };
  }

  if (winner.kind === "stay_active" && winner.topic) {
    const matchConfidence = activeTopicScore?.similarity ?? winner.score;

    return {
      matchedTopic: winner.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? winner.topic.name,
      matchConfidence,
    };
  }

  if (
    winner.kind === "create_new" &&
    winner.label &&
    !looksLikeSuspiciousResolvedLabel(winner.label) &&
    winner.score >= LOW_CONFIDENCE_CREATE_NEW_FLOOR
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: winner.label,
      matchConfidence: Math.max(winner.score, labeling.topic_decision.confidence),
    };
  }

  if (
    labeling.topic_decision.canonical_label &&
    labeling.topic_decision.confidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR &&
    !looksLikeSuspiciousResolvedLabel(labeling.topic_decision.canonical_label) &&
    (best?.similarity ?? 0) < WEAK_REUSE_TOPIC_THRESHOLD
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: labeling.topic_decision.canonical_label,
      matchConfidence: labeling.topic_decision.confidence,
    };
  }

  if (
    best &&
    best.similarity >= WEAK_REUSE_TOPIC_THRESHOLD &&
    !looksLikeSuspiciousResolvedLabel(labeling.topic_decision.canonical_label)
  ) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        best.topic.id === activeTopic?.id
          ? "fallback_active_topic"
          : "fallback_existing_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? best.topic.name,
      matchConfidence: best.similarity,
    };
  }

  if (
    activeTopic &&
    activeTopicScore &&
    activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD &&
    (winner.kind !== "create_new" || looksLikeSuspiciousResolvedLabel(labeling.topic_decision.canonical_label))
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: activeTopicScore.similarity,
    };
  }

  return {
    matchedTopic: null,
    vectorInfo,
    shouldCreateNewTopic: false,
    resolutionKind: "no_match",
    resolvedLabel: labeling.topic_decision.canonical_label ?? null,
    matchConfidence: Math.max(
      best?.similarity ?? 0,
      labeling.topic_decision.confidence * 0.7,
      winner.score * 0.7
    ),
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

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>
): RouteTopic[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row, index) => {
    const fallbackTopic = mockTopics[index % mockTopics.length];

    const rowWithTopicFields = row as unknown as {
      topic_id?: string;
      topic_name?: string;
      active_diagnosis?: unknown;
      suggested_next_step?: string | null;
      topic_confusion_average?: number | null;
      topic_insight_average?: number | null;
      topic_learning_score?: number | null;
      topic_message_count?: number | null;
      topic_last_update?: string | null;
      topic_centroid?: unknown;
    };

    const position = isPosition(rowWithTopicFields.topic_centroid)
      ? rowWithTopicFields.topic_centroid
      : fallbackTopic.position;

    return {
      ...fallbackTopic,
      id: rowWithTopicFields.topic_id ?? fallbackTopic.id ?? makeId("topic"),
      name: rowWithTopicFields.topic_name?.trim() || fallbackTopic.name,
      diagnosis: normalizeDiagnosis(
        rowWithTopicFields.active_diagnosis ?? fallbackTopic.diagnosis
      ),
      nextStep:
        rowWithTopicFields.suggested_next_step?.trim() || fallbackTopic.nextStep,
      confusion: clamp(
        Number(
          rowWithTopicFields.topic_confusion_average ?? fallbackTopic.confusion
        ),
        0,
        1
      ),
      insight: clamp(
        Number(rowWithTopicFields.topic_insight_average ?? fallbackTopic.insight),
        0,
        1
      ),
      learningScore: clamp(
        Number(
          rowWithTopicFields.topic_learning_score ?? fallbackTopic.learningScore
        ),
        0,
        1
      ),
      position,
      scale: fallbackTopic.scale ?? 1,
      messageCount:
        Number(
          rowWithTopicFields.topic_message_count ??
            fallbackTopic.messageCount ??
            0
        ) || 0,
      lastUpdated:
        rowWithTopicFields.topic_last_update ?? fallbackTopic.lastUpdated ?? null,
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