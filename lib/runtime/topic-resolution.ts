import { mockTopics } from "@/lib/mock-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { VectorInfo } from "@/types/contracts";
import { clamp, isPosition, normalizeDiagnosis } from "./shared";
import {
  type RetrievalCandidate,
  type TopicLabelingInput,
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

type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

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
      return `Clarify and strengthen your explanation of ${concept}.`;
    case "explain_request":
    case "general":
    default:
      return `Explain ${concept} in your own words.`;
  }
}

export function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const baseMock = mockTopics[0];
  const labeling = buildLabelingResult(message, existingTopics);

  const topicName =
    labeling.topic_decision.canonical_label ??
    labeling.interpretation.concept_span ??
    "New Topic";

  return {
    ...baseMock,
    id: makeId("topic"),
    name: topicName,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(message),
    confusion: 0.72,
    insight: 0.24,
    learningScore: 0.12,
    position: computeNextTopicPosition(existingTopics),
    scale: baseMock.scale,
  };
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  const rows = await getLatestTopicState();

  if (!rows.length) {
    return [];
  }

  return rows.map((row, index) => {
    const fallback =
      mockTopics.find((topic) => topic.id === row.topic_id) ??
      mockTopics[index % Math.max(mockTopics.length, 1)];

    const topicJson =
      row.topic_json && typeof row.topic_json === "object" ? row.topic_json : {};

    const learningSpaceTopic =
      "learning_space_topic" in topicJson &&
      topicJson.learning_space_topic &&
      typeof topicJson.learning_space_topic === "object"
        ? (topicJson.learning_space_topic as Record<string, unknown>)
        : null;

    const storedPosition = learningSpaceTopic?.position;
    const storedNextStep =
      typeof topicJson.next_step === "string"
        ? topicJson.next_step
        : typeof row.next_step === "string" && row.next_step.trim().length > 0
          ? row.next_step
          : fallback?.nextStep ?? "Continue learning";

    return {
      ...(fallback ?? mockTopics[0]),
      id: row.topic_id,
      name: row.topic_name,
      confusion: clamp(row.confusion ?? fallback?.confusion ?? 0.5, 0, 1),
      insight: clamp(row.insight ?? fallback?.insight ?? 0.5, 0, 1),
      learningScore: clamp(
        row.learning_score ?? fallback?.learningScore ?? 0.5,
        0,
        1
      ),
      position: isPosition(storedPosition)
        ? storedPosition
        : (fallback?.position ?? [0, 0, 0]),
      nextStep: storedNextStep,
      diagnosis:
        normalizeDiagnosis(row.diagnosis) ??
        normalizeDiagnosis(
          (fallback as { diagnosis?: unknown } | undefined)?.diagnosis
        ) ??
        "representation_gap",
    };
  });
}

function isStrongDeterministicLabel(
  labeling: ReturnType<typeof runDeterministicTopicLabeling>
) {
  return (
    Boolean(labeling.topic_decision.canonical_label) &&
    labeling.topic_decision.topic_specificity !== "too_vague" &&
    labeling.topic_decision.confidence >= 0.62
  );
}

function shouldAllowWeakFallbackToExistingTopic(
  labeling: ReturnType<typeof runDeterministicTopicLabeling>
) {
  return (
    !labeling.topic_decision.should_create_new_topic &&
    labeling.topic_decision.topic_specificity === "too_vague"
  );
}

function scoreTopicMatchFromLabeling(
  labeling: ReturnType<typeof runDeterministicTopicLabeling>,
  topic: RouteTopic
): number {
  const candidateLabel = labeling.topic_decision.canonical_label;
  const conceptSpan = labeling.interpretation.concept_span;

  const baseScore = computeLocalTopicSimilarity(candidateLabel, conceptSpan, topic);

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

  const activeTopicReferenceBonus =
    labeling.interpretation.references_active_topic ? 0.08 : 0;

  return clamp(
    baseScore + frameBonus + confidenceBonus + activeTopicReferenceBonus - vaguePenalty,
    0,
    1
  );
}

export function scoreTopicMatch(message: string, topic: RouteTopic): number {
  const labeling = buildLabelingResult(message, []);
  return scoreTopicMatchFromLabeling(labeling, topic);
}

const STRONG_REUSE_TOPIC_THRESHOLD = 0.62;
const WEAK_REUSE_TOPIC_THRESHOLD = 0.5;
const ACTIVE_TOPIC_FALLBACK_THRESHOLD = 0.44;

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): TopicMatchResult {
  const labeling = buildLabelingResult(message, existingTopics, activeTopic);

  const emptyVectorInfo: VectorInfo = {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };

  if (!existingTopics.length) {
    return {
      matchedTopic: null,
      vectorInfo: emptyVectorInfo,
      shouldCreateNewTopic: labeling.topic_decision.should_create_new_topic,
      resolutionKind: labeling.topic_decision.should_create_new_topic
        ? "created_new_candidate"
        : "no_match",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence: labeling.topic_decision.confidence,
    };
  }

  const scored = existingTopics
    .map((topic) => ({
      topic,
      similarity: scoreTopicMatchFromLabeling(labeling, topic),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0] ?? null;
  const bestScore = best?.similarity ?? 0;
  const vectorInfo = buildVectorInfoFromScoredTopics(scored);

  const strongLabel = isStrongDeterministicLabel(labeling);
  const weakFallbackAllowed = shouldAllowWeakFallbackToExistingTopic(labeling);

  if (best && strongLabel && bestScore >= STRONG_REUSE_TOPIC_THRESHOLD) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "matched_existing",
      resolvedLabel: labeling.topic_decision.canonical_label ?? best.topic.name,
      matchConfidence: bestScore,
    };
  }

  if (best && weakFallbackAllowed && bestScore >= WEAK_REUSE_TOPIC_THRESHOLD) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_existing_topic",
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

  if (labeling.topic_decision.should_create_new_topic) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence: labeling.topic_decision.confidence,
    };
  }

  return {
    matchedTopic: null,
    vectorInfo,
    shouldCreateNewTopic: false,
    resolutionKind: "no_match",
    resolvedLabel: labeling.topic_decision.canonical_label ?? null,
    matchConfidence: bestScore,
  };
}