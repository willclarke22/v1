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

type ResolutionAdjudication = {
  labeling: TopicLabelingResult;
  scoredTopics: ScoredTopic[];
  vectorInfo: VectorInfo;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  strongDeterministicLabel: boolean;
  weakFallbackAllowed: boolean;
  fallbackRecommended: boolean;
};

const STRONG_REUSE_TOPIC_THRESHOLD = 0.64;
const WEAK_REUSE_TOPIC_THRESHOLD = 0.52;
const ACTIVE_TOPIC_FALLBACK_THRESHOLD = 0.46;
const CREATE_NEW_CONFIDENCE_THRESHOLD = 0.72;
const LOW_CONFIDENCE_CREATE_NEW_FLOOR = 0.58;
const CANDIDATE_COMPETITION_GAP_THRESHOLD = 0.08;

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
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLoose(text: string) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
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

function isStrongDeterministicLabel(labeling: TopicLabelingResult) {
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

function shouldAllowWeakFallbackToExistingTopic(labeling: TopicLabelingResult) {
  if (labeling.topic_decision.topic_specificity === "too_vague") return true;
  if (hasAmbiguityFlag(labeling, "low_confidence")) return true;
  if (hasAmbiguityFlag(labeling, "candidate_competition")) return true;
  if (hasAmbiguityFlag(labeling, "needs_adjudication")) return true;
  if (hasAmbiguityFlag(labeling, "label_suspicious")) return true;

  return labeling.topic_decision.confidence < CREATE_NEW_CONFIDENCE_THRESHOLD;
}

function shouldRecommendFallbackAdjudication(labeling: TopicLabelingResult) {
  return (
    hasAmbiguityFlag(labeling, "candidate_competition") ||
    hasAmbiguityFlag(labeling, "needs_adjudication") ||
    hasAmbiguityFlag(labeling, "label_suspicious") ||
    hasAmbiguityFlag(labeling, "low_confidence")
  );
}

function scoreTopicMatchFromLabeling(
  labeling: TopicLabelingResult,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): number {
  const candidateLabel = labeling.topic_decision.canonical_label;
  const conceptSpan = labeling.interpretation.concept_span;
  const questionAboutTopic = labeling.interpretation.question_about_topic;

  const baseScore = computeLocalTopicSimilarity(candidateLabel, conceptSpan, topic);

  const questionScore = questionAboutTopic
    ? overlapScore(
        semanticTokenize(questionAboutTopic),
        semanticTokenize(topic.name)
      ) * 0.18
    : 0;

  const frame = mapIntentToFrame(labeling.interpretation.message_intent);
  const frameBonus =
    frame === "quiz_request" ||
    frame === "confusion_help" ||
    frame === "explain_request"
      ? 0.04
      : 0;

  const confidenceBonus = labeling.topic_decision.confidence * 0.08;

  const vaguePenalty =
    labeling.topic_decision.topic_specificity === "too_vague" ? 0.12 : 0;

  const ambiguityPenalty =
    hasAmbiguityFlag(labeling, "candidate_competition") ||
    hasAmbiguityFlag(labeling, "label_suspicious")
      ? 0.05
      : 0;

  const activeTopicReferenceBonus =
    labeling.interpretation.references_active_topic &&
    activeTopic &&
    topic.id === activeTopic.id
      ? 0.08
      : 0;

  return clamp(
    baseScore +
      questionScore +
      frameBonus +
      confidenceBonus +
      activeTopicReferenceBonus -
      vaguePenalty -
      ambiguityPenalty,
    0,
    1
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

  const finalScore = scoreTopicMatchFromLabeling(labeling, topic, activeTopic);

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
  return scoreTopicMatchFromLabeling(labeling, topic);
}

function adjudicateTopicResolution(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): ResolutionAdjudication {
  const labeling = buildLabelingResult(message, existingTopics, activeTopic);

  const scoredTopics = existingTopics
    .map((topic) => {
      const breakdown = buildScoreBreakdown(labeling, topic, activeTopic);
      return {
        topic,
        similarity: breakdown.finalScore,
        breakdown,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const best = scoredTopics[0] ?? null;
  const second = scoredTopics[1] ?? null;
  const topGap = best ? Math.max(0, best.similarity - (second?.similarity ?? 0)) : 0;

  return {
    labeling,
    scoredTopics,
    vectorInfo: buildVectorInfoFromScoredTopics(scoredTopics),
    best,
    second,
    topGap,
    strongDeterministicLabel: isStrongDeterministicLabel(labeling),
    weakFallbackAllowed: shouldAllowWeakFallbackToExistingTopic(labeling),
    fallbackRecommended: shouldRecommendFallbackAdjudication(labeling),
  };
}

function shouldCreateNewTopicFromAdjudication(
  adjudication: ResolutionAdjudication
): boolean {
  const { labeling, best, topGap, strongDeterministicLabel } = adjudication;

  if (!labeling.topic_decision.canonical_label) return false;
  if (!labeling.topic_decision.should_create_new_topic) return false;
  if (labeling.topic_decision.topic_specificity === "too_vague") return false;
  if (hasAmbiguityFlag(labeling, "label_suspicious")) return false;

  const confidence = labeling.topic_decision.confidence;
  const bestScore = best?.similarity ?? 0;

  if (strongDeterministicLabel && bestScore < STRONG_REUSE_TOPIC_THRESHOLD) {
    return true;
  }

  if (
    confidence >= LOW_CONFIDENCE_CREATE_NEW_FLOOR &&
    bestScore < WEAK_REUSE_TOPIC_THRESHOLD &&
    topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD
  ) {
    return true;
  }

  return false;
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
    "part",
    "thing",
    "stuff",
    "help",
    "question",
    "new topic",
    "law works",
  ]);

  if (suspiciousSingles.has(normalized)) return true;
  if (normalized.split(" ").length > 8) return true;
  if (/\b(help|understand|get|confused|stuck|trouble)\b/i.test(label)) return true;

  return false;
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
  const {
    labeling,
    vectorInfo,
    best,
    topGap,
    strongDeterministicLabel,
    weakFallbackAllowed,
  } = adjudication;

  const emptyVectorInfo: VectorInfo = {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };

  if (!existingTopics.length) {
    const shouldCreate = shouldCreateNewTopicFromAdjudication(adjudication);

    return {
      matchedTopic: null,
      vectorInfo: emptyVectorInfo,
      shouldCreateNewTopic: shouldCreate,
      resolutionKind: shouldCreate ? "created_new_candidate" : "no_match",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence: labeling.topic_decision.confidence,
    };
  }

  const bestScore = best?.similarity ?? 0;

  if (best && strongDeterministicLabel && bestScore >= STRONG_REUSE_TOPIC_THRESHOLD) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "matched_existing",
      resolvedLabel: labeling.topic_decision.canonical_label ?? best.topic.name,
      matchConfidence: bestScore,
    };
  }

  if (
    activeTopic &&
    labeling.interpretation.references_active_topic &&
    best &&
    best.topic.id === activeTopic.id &&
    bestScore >= ACTIVE_TOPIC_FALLBACK_THRESHOLD
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? activeTopic.name,
      matchConfidence: bestScore,
    };
  }

  if (shouldCreateNewTopicFromAdjudication(adjudication)) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence: labeling.topic_decision.confidence,
    };
  }

  if (best && weakFallbackAllowed && bestScore >= WEAK_REUSE_TOPIC_THRESHOLD) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        best.topic.id === activeTopic?.id
          ? "fallback_active_topic"
          : "fallback_existing_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? best.topic.name,
      matchConfidence: bestScore,
    };
  }

  if (
    activeTopic &&
    !labeling.topic_decision.should_create_new_topic &&
    best &&
    best.topic.id === activeTopic.id &&
    bestScore >= ACTIVE_TOPIC_FALLBACK_THRESHOLD
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: labeling.topic_decision.canonical_label ?? activeTopic.name,
      matchConfidence: bestScore,
    };
  }

  return {
    matchedTopic: null,
    vectorInfo,
    shouldCreateNewTopic: false,
    resolutionKind: "no_match",
    resolvedLabel: labeling.topic_decision.canonical_label ?? null,
    matchConfidence: Math.max(bestScore, labeling.topic_decision.confidence * 0.7),
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

    const position = isPosition((row as { topic_centroid?: unknown }).topic_centroid)
      ? ((row as { topic_centroid: [number, number, number] }).topic_centroid)
      : fallbackTopic.position;

    return {
      ...fallbackTopic,
      id:
        (row as { topic_id?: string }).topic_id ??
        fallbackTopic.id ??
        makeId("topic"),
      name:
        (row as { topic_name?: string }).topic_name?.trim() ||
        fallbackTopic.name,
      diagnosis: normalizeDiagnosis(
        (row as { active_diagnosis?: unknown }).active_diagnosis ??
          fallbackTopic.diagnosis
      ),
      nextStep:
        (row as { suggested_next_step?: string | null }).suggested_next_step?.trim() ||
        fallbackTopic.nextStep,
      confusion: clamp(
        Number(
          (row as { topic_confusion_average?: number | null })
            .topic_confusion_average ?? fallbackTopic.confusion
        ),
        0,
        1
      ),
      insight: clamp(
        Number(
          (row as { topic_insight_average?: number | null }).topic_insight_average ??
            fallbackTopic.insight
        ),
        0,
        1
      ),
      learningScore: clamp(
        Number(
          (row as { topic_learning_score?: number | null }).topic_learning_score ??
            fallbackTopic.learningScore
        ),
        0,
        1
      ),
      position,
      scale: fallbackTopic.scale ?? 1,
      messageCount:
        Number(
          (row as { topic_message_count?: number | null }).topic_message_count ??
            fallbackTopic.messageCount ??
            0
        ) || 0,
      lastUpdated:
        (row as { topic_last_update?: string | null }).topic_last_update ??
        fallbackTopic.lastUpdated ??
        null,
      hasAvailableProbe: false,
    } as RouteTopic;
  });
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  try {
    const rows = await getLatestTopicState();
    const mapped = mapRowsToTopics(rows);

    if (mapped.length > 0) {
      return mapped;
    }
  } catch (error) {
    console.error("Failed to read topic_state, falling back to mock topics:", error);
  }

  return mockTopics as RouteTopic[];
}