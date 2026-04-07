import { mockTopics } from "@/lib/mock-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { VectorInfo } from "@/types/contracts";
import { clamp, isPosition, normalizeDiagnosis } from "./shared";

type MockTopic = (typeof mockTopics)[number];
export type RouteTopic = MockTopic;

export type TopicMatchResult = {
  matchedTopic: RouteTopic | null;
  vectorInfo: VectorInfo;
  shouldCreateNewTopic: boolean;
};

type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

type FrameScores = Record<MessageFrame, number>;

type TopicInterpretation = {
  rawMessage: string;
  normalizedMessage: string;
  frameScores: FrameScores;
  primaryFrame: MessageFrame;
  conceptCandidate: string;
  canonicalLabel: string;
  semanticKeywords: string[];
  candidateConfidence: number;
  isBroadOrVague: boolean;
  isGoodNewTopicCandidate: boolean;
};

const FRAME_PATTERNS: Array<{
  frame: MessageFrame;
  patterns: RegExp[];
  score: number;
}> = [
  {
    frame: "quiz_request",
    score: 1,
    patterns: [
      /^\s*quiz me on\b/i,
      /^\s*test me on\b/i,
      /^\s*give me a quiz on\b/i,
      /^\s*ask me about\b/i,
      /^\s*check my understanding of\b/i,
      /^\s*can you quiz me on\b/i,
      /^\s*could you quiz me on\b/i,
    ],
  },
  {
    frame: "confusion_help",
    score: 1,
    patterns: [
      /^\s*i(?: am|'m)\s+confused about\b/i,
      /^\s*i(?: am|'m)\s+struggling with\b/i,
      /^\s*i(?: still)?\s*don't understand\b/i,
      /^\s*i(?: still)?\s*do not understand\b/i,
      /^\s*i(?: am|'m)\s+not sure about\b/i,
      /^\s*i(?: kind of|sort of)\s+get\b/i,
      /^\s*help me with\b/i,
      /^\s*help me understand\b/i,
      /^\s*could you help me understand\b/i,
      /^\s*can you help me understand\b/i,
      /^\s*i want to understand\b/i,
    ],
  },
  {
    frame: "explain_request",
    score: 1,
    patterns: [
      /^\s*can you explain\b/i,
      /^\s*could you explain\b/i,
      /^\s*explain\b/i,
      /^\s*teach me about\b/i,
      /^\s*tell me about\b/i,
      /^\s*walk me through\b/i,
      /^\s*go over\b/i,
      /^\s*can we go over\b/i,
      /^\s*could we go over\b/i,
      /^\s*what is\b/i,
      /^\s*what are\b/i,
      /^\s*how does\b/i,
      /^\s*how do\b/i,
    ],
  },
  {
    frame: "compare_request",
    score: 1,
    patterns: [
      /^\s*what(?:'s| is) the difference between\b/i,
      /^\s*compare\b/i,
      /^\s*contrast\b/i,
      /^\s*how is .+ different from .+$/i,
    ],
  },
  {
    frame: "apply_request",
    score: 1,
    patterns: [
      /^\s*apply\b/i,
      /^\s*use this\b/i,
      /^\s*what would happen if\b/i,
      /^\s*predict\b/i,
      /^\s*how would .+ change if .+$/i,
    ],
  },
  {
    frame: "attempt_like",
    score: 1,
    patterns: [
      /^\s*i think\b/i,
      /^\s*maybe\b/i,
      /^\s*my answer is\b/i,
      /^\s*it means\b/i,
      /^\s*so if\b/i,
      /^\s*because\b/i,
      /^\s*is it because\b/i,
      /^\s*would it be\b/i,
    ],
  },
];

const LEADING_FRAME_PATTERNS: RegExp[] = [
  /^\s*quiz me on\s+/i,
  /^\s*test me on\s+/i,
  /^\s*give me a quiz on\s+/i,
  /^\s*ask me about\s+/i,
  /^\s*check my understanding of\s+/i,
  /^\s*can you quiz me on\s+/i,
  /^\s*could you quiz me on\s+/i,

  /^\s*i(?: am|'m)\s+confused about\s+/i,
  /^\s*i(?: am|'m)\s+struggling with\s+/i,
  /^\s*i(?: still)?\s*don't understand\s+/i,
  /^\s*i(?: still)?\s*do not understand\s+/i,
  /^\s*i(?: am|'m)\s+not sure about\s+/i,
  /^\s*i(?: kind of|sort of)\s+get\s+/i,
  /^\s*help me with\s+/i,
  /^\s*help me understand\s+/i,
  /^\s*could you help me understand\s+/i,
  /^\s*can you help me understand\s+/i,
  /^\s*i want to understand\s+/i,

  /^\s*can you explain\s+/i,
  /^\s*could you explain\s+/i,
  /^\s*explain\s+/i,
  /^\s*teach me about\s+/i,
  /^\s*tell me about\s+/i,
  /^\s*walk me through\s+/i,
  /^\s*go over\s+/i,
  /^\s*can we go over\s+/i,
  /^\s*could we go over\s+/i,
  /^\s*what is\s+/i,
  /^\s*what are\s+/i,
  /^\s*how does\s+/i,
  /^\s*how do\s+/i,
];

const TRAILING_FILLER_PATTERNS: RegExp[] = [
  /\s+please\s*$/i,
  /\s+for me\s*$/i,
  /\s+a bit\s*$/i,
  /\s+right now\s*$/i,
  /\s+again\s*$/i,
  /\s+really quickly\s*$/i,
  /\s+real quick\s*$/i,
];

const LIGHT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "what",
  "when",
  "why",
  "with",
  "you",
  "your",
]);

const GENERIC_TOPIC_TOKENS = new Set([
  "concept",
  "concepts",
  "idea",
  "ideas",
  "topic",
  "topics",
  "thing",
  "things",
  "stuff",
  "part",
  "parts",
  "question",
  "questions",
  "problem",
  "problems",
]);

const WEAK_TRAILING_TOKENS = new Set([
  "work",
  "works",
  "working",
  "happen",
  "happens",
  "happening",
  "mean",
  "means",
  "thing",
  "things",
  "stuff",
  "part",
  "parts",
]);

function normalizeMessageSurface(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function compactWhitespace(text: string) {
  return normalizeMessageSurface(text).replace(/\s+/g, " ").trim();
}

function normalizeTopicText(text: string) {
  return normalizeMessageSurface(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return normalizeTopicText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
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

function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function normalizeSemanticToken(token: string) {
  return singularizeToken(token.toLowerCase());
}

function semanticTokenize(text: string): string[] {
  return tokenize(text).map(normalizeSemanticToken).filter(Boolean);
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function firstSentence(text: string) {
  return compactWhitespace(text).split(/[.?!]/)[0]?.trim() ?? "";
}

function hasComparisonStructure(text: string) {
  return /\b(?:vs\.?|versus|and)\b/i.test(text);
}

function stripLeadingFrame(text: string) {
  let output = compactWhitespace(text);

  for (const pattern of LEADING_FRAME_PATTERNS) {
    output = output.replace(pattern, "");
  }

  for (const pattern of TRAILING_FILLER_PATTERNS) {
    output = output.replace(pattern, "");
  }

  output = output.replace(/[?.!]+$/g, "").trim();

  return compactWhitespace(output);
}

function extractCompareConcept(text: string) {
  const cleaned = compactWhitespace(text).replace(/[?.!]+$/g, "");
  const match =
    cleaned.match(
      /\b(?:what(?:'s| is) the difference between|compare|contrast)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)$/i
    ) ?? null;

  if (!match) return null;

  const left = compactWhitespace(match[1] ?? "");
  const right = compactWhitespace(match[2] ?? "");

  if (!left || !right) return null;

  return `${left} vs ${right}`;
}

function cleanupConceptCandidate(text: string) {
  let output = firstSentence(text);

  output = output.replace(
    /^(?:the thing about|the part about|the idea of|something about)\s+/i,
    ""
  );

  output = output.replace(
    /^(?:how|why|what)\s+(?:the\s+)?(.+?)\s+(?:works?|happens?|means?)$/i,
    "$1"
  );

  output = output.replace(/^(?:how|why|what)\s+/i, "");
  output = output.replace(/\s+(?:works?|happens?|means?)$/i, "");

  output = output.replace(
    /^(?:a|an|the)\s+/i,
    ""
  );

  output = compactWhitespace(output);

  return output;
}

function scoreConceptCandidateQuality(candidate: string): number {
  const normalized = normalizeTopicText(candidate);
  const tokens = tokenize(candidate);

  if (!normalized || !tokens.length) return 0.05;
  if (normalized === "new topic") return 0.05;
  if (tokens.length === 1 && GENERIC_TOPIC_TOKENS.has(tokens[0])) return 0.1;

  let score = 0.35;

  const contentTokens = tokens.filter(
    (token) =>
      !LIGHT_STOPWORDS.has(token) &&
      !GENERIC_TOPIC_TOKENS.has(token) &&
      token.length > 2
  );

  score += Math.min(0.35, contentTokens.length * 0.12);

  if (tokens.length >= 2 && tokens.length <= 5) {
    score += 0.12;
  }

  if (tokens.length > 8) {
    score -= 0.18;
  }

  const lastToken = tokens[tokens.length - 1];
  if (lastToken && WEAK_TRAILING_TOKENS.has(lastToken)) {
    score -= 0.18;
  }

  if (hasComparisonStructure(candidate)) {
    score += 0.08;
  }

  if (contentTokens.length === 0) {
    score -= 0.22;
  }

  return clamp(score, 0.05, 0.95);
}

function isBroadOrVagueConcept(candidate: string): boolean {
  const normalized = normalizeTopicText(candidate);
  const tokens = tokenize(candidate);

  if (!normalized) return true;
  if (normalized === "new topic") return true;
  if (tokens.length === 0) return true;

  if (tokens.length === 1) {
    return GENERIC_TOPIC_TOKENS.has(tokens[0]);
  }

  const meaningfulTokens = tokens.filter(
    (token) =>
      !LIGHT_STOPWORDS.has(token) &&
      !GENERIC_TOPIC_TOKENS.has(token) &&
      token.length > 2
  );

  if (meaningfulTokens.length === 0) return true;

  const lastToken = tokens[tokens.length - 1];
  if (lastToken && WEAK_TRAILING_TOKENS.has(lastToken)) {
    return true;
  }

  return false;
}

function canonicalizeDisplayPhrase(candidate: string): string {
  const cleaned = cleanupConceptCandidate(candidate);
  const normalized = compactWhitespace(cleaned);

  if (!normalized) return "New Topic";

  const tokens = tokenize(normalized).filter((token) => {
    const lower = token.toLowerCase();

    if (LIGHT_STOPWORDS.has(lower)) return false;

    if (
      token === "vs" ||
      token === "versus"
    ) {
      return true;
    }

    return true;
  });

  let displayPhrase = tokens.join(" ").trim();

  if (!displayPhrase) {
    displayPhrase = normalized;
  }

  displayPhrase = displayPhrase
    .replace(/\bvs\b/gi, "vs")
    .replace(/\bversus\b/gi, "vs");

  const titled = toTitleCase(displayPhrase);
  return titled.length > 48 ? `${titled.slice(0, 48).trim()}...` : titled;
}

export function detectMessageFrameScores(message: string): FrameScores {
  const scores: FrameScores = {
    quiz_request: 0,
    confusion_help: 0,
    explain_request: 0,
    compare_request: 0,
    apply_request: 0,
    attempt_like: 0,
    general: 0.2,
  };

  const normalized = compactWhitespace(message);

  for (const rule of FRAME_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        scores[rule.frame] = Math.max(scores[rule.frame], rule.score);
      }
    }
  }

  if (
    /^\s*(can we|could we)\s+go over\b/i.test(normalized) ||
    /^\s*walk me through\b/i.test(normalized)
  ) {
    scores.explain_request = Math.max(scores.explain_request, 1);
  }

  if (
    /^\s*i(?: am|'m)\s+confused\b/i.test(normalized) ||
    /^\s*i(?: still)?\s*don't understand\b/i.test(normalized)
  ) {
    scores.confusion_help = Math.max(scores.confusion_help, 1);
  }

  if (scores.attempt_like > 0 && normalized.length > 8) {
    scores.attempt_like = Math.min(1, scores.attempt_like + 0.08);
  }

  return scores;
}

export function inferPrimaryMessageFrame(message: string): MessageFrame {
  const scores = detectMessageFrameScores(message);
  const ordered = (Object.keys(scores) as MessageFrame[]).sort(
    (a, b) => scores[b] - scores[a]
  );
  return ordered[0] ?? "general";
}

export function extractConceptCandidateFromMessage(message: string): string {
  const cleaned = compactWhitespace(message);

  if (!cleaned) {
    return "new topic";
  }

  const compareCandidate = extractCompareConcept(cleaned);
  if (compareCandidate) {
    return compareCandidate;
  }

  const normalized = normalizeMessageSurface(cleaned);

  const explicitMatch =
    normalized.match(
      /^(?:i am|i'm)\s+confused\s+about\s+(.+?)(?:\.\s*.*)?$/i
    ) ||
    normalized.match(
      /^(?:i am|i'm)\s+struggling\s+with\s+(.+?)(?:\.\s*.*)?$/i
    ) ||
    normalized.match(
      /^(?:i do not|i don't)\s+understand\s+(.+?)(?:\.\s*.*)?$/i
    ) ||
    normalized.match(
      /^(?:help me understand|help me with|can you explain|could you explain|explain|quiz me on|test me on|teach me about|tell me about|walk me through|go over|can we go over|could we go over)\s+(.+?)(?:\.\s*.*)?$/i
    );

  let stripped = explicitMatch?.[1]?.trim() ?? stripLeadingFrame(normalized);

  if (!stripped || stripped.length < 2) {
    stripped = normalized.replace(/[?.!]+$/g, "");
  }

  stripped = cleanupConceptCandidate(stripped);

  if (!stripped) {
    return "new topic";
  }

  return stripped;
}

function interpretTopicCandidate(message: string): TopicInterpretation {
  const normalizedMessage = compactWhitespace(message);
  const frameScores = detectMessageFrameScores(normalizedMessage);
  const primaryFrame = inferPrimaryMessageFrame(normalizedMessage);
  const conceptCandidate = extractConceptCandidateFromMessage(normalizedMessage);
  const canonicalLabel = canonicalizeDisplayPhrase(conceptCandidate);
  const semanticKeywords = dedupe(
    semanticTokenize(conceptCandidate).filter(
      (token) => token.length > 2 && !LIGHT_STOPWORDS.has(token)
    )
  ).slice(0, 8);

  const candidateConfidence = scoreConceptCandidateQuality(conceptCandidate);
  const isBroadOrVague = isBroadOrVagueConcept(conceptCandidate);
  const isGoodNewTopicCandidate =
    !isBroadOrVague && candidateConfidence >= 0.5 && canonicalLabel !== "New Topic";

  return {
    rawMessage: message,
    normalizedMessage,
    frameScores,
    primaryFrame,
    conceptCandidate,
    canonicalLabel,
    semanticKeywords,
    candidateConfidence,
    isBroadOrVague,
    isGoodNewTopicCandidate,
  };
}

export function canonicalizeTopicNameFromMessage(message: string): string {
  const interpretation = interpretTopicCandidate(message);

  if (interpretation.isGoodNewTopicCandidate) {
    return interpretation.canonicalLabel;
  }

  if (interpretation.primaryFrame === "compare_request") {
    return interpretation.canonicalLabel;
  }

  if (interpretation.semanticKeywords.length > 0) {
    const fallback = toTitleCase(interpretation.semanticKeywords.slice(0, 3).join(" "));
    return fallback.length > 48 ? `${fallback.slice(0, 48).trim()}...` : fallback;
  }

  return "New Topic";
}

export function titleCaseFromMessage(message: string) {
  return canonicalizeTopicNameFromMessage(message);
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

export function inferKeywordsFromMessage(message: string): string[] {
  return interpretTopicCandidate(message).semanticKeywords;
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

export function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const baseMock = mockTopics[0];
  const interpretation = interpretTopicCandidate(message);
  const topicName = interpretation.isGoodNewTopicCandidate
    ? interpretation.canonicalLabel
    : interpretation.semanticKeywords.length > 0
      ? toTitleCase(interpretation.semanticKeywords.slice(0, 3).join(" "))
      : "New Topic";

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

function getTopicKeywords(topicId: string): string[] {
  switch (topicId) {
    case "topic-1":
      return ["neural", "neuron", "neurons", "signal", "signaling"];
    case "topic-2":
      return ["synaptic", "plasticity", "synapse", "learning", "change"];
    case "topic-3":
      return [
        "action",
        "potential",
        "potentials",
        "depolarization",
        "repolarization",
        "membrane",
      ];
    case "topic-4":
      return [
        "neurotransmitter",
        "neurotransmitters",
        "dopamine",
        "serotonin",
        "gaba",
        "glutamate",
      ];
    default:
      return [];
  }
}

function getDynamicTopicKeywords(topic: RouteTopic): string[] {
  const fromName = inferKeywordsFromMessage(topic.name);
  const fallbackKeywords = getTopicKeywords(topic.id);

  return dedupe([
    ...fallbackKeywords.map(normalizeSemanticToken),
    ...fromName.map(normalizeSemanticToken),
  ]);
}

export function scoreTopicMatch(message: string, topic: RouteTopic): number {
  const interpretation = interpretTopicCandidate(message);
  const conceptCandidate = interpretation.conceptCandidate;
  const normalizedConcept = normalizeTopicText(conceptCandidate);

  const messageTokens = semanticTokenize(conceptCandidate);
  const topicNameTokens = semanticTokenize(topic.name);
  const topicKeywords = getDynamicTopicKeywords(topic);

  const normalizedTopicName = normalizeTopicText(topic.name);

  const exactNameMatch = normalizedConcept === normalizedTopicName ? 1 : 0;

  const topicNameContained =
    normalizedConcept.includes(normalizedTopicName) ||
    normalizedTopicName.includes(normalizedConcept)
      ? 1
      : 0;

  const keywordHits = topicKeywords.reduce((count, keyword) => {
    return count + (messageTokens.includes(keyword) ? 1 : 0);
  }, 0);

  const keywordScore =
    topicKeywords.length > 0 ? keywordHits / topicKeywords.length : 0;

  const tokenOverlap = overlapScore(messageTokens, topicNameTokens);
  const semanticishScore = Math.max(keywordScore, tokenOverlap);

  const frameBonus =
    interpretation.primaryFrame === "quiz_request" ||
    interpretation.primaryFrame === "confusion_help" ||
    interpretation.primaryFrame === "explain_request"
      ? 0.04
      : 0;

  const confidenceBonus = interpretation.candidateConfidence * 0.08;
  const broadPenalty = interpretation.isBroadOrVague ? 0.12 : 0;

  const score =
    exactNameMatch * 1.0 +
    topicNameContained * 0.82 +
    semanticishScore * 0.78 +
    frameBonus +
    confidenceBonus -
    broadPenalty;

  return clamp(score, 0, 1);
}

const REUSE_TOPIC_THRESHOLD = 0.56;

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[]
): TopicMatchResult {
  const interpretation = interpretTopicCandidate(message);

  if (!existingTopics.length) {
    return {
      matchedTopic: null,
      vectorInfo: {
        top_k_topic_names: [],
        top_k_topic_ids: [],
        top_k_similarity_scores: [],
      },
      shouldCreateNewTopic: interpretation.isGoodNewTopicCandidate,
    };
  }

  const scored = existingTopics
    .map((topic) => {
      const similarity = scoreTopicMatch(message, topic);

      return {
        topic,
        similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0] ?? null;
  const bestScore = best?.similarity ?? 0;

  const matchedTopic =
    best && bestScore >= REUSE_TOPIC_THRESHOLD ? best.topic : null;

  const shouldCreateNewTopic =
    !matchedTopic && interpretation.isGoodNewTopicCandidate;

  return {
    matchedTopic,
    vectorInfo: {
      top_k_topic_names: scored.slice(0, 3).map((item) => item.topic.name),
      top_k_topic_ids: scored.slice(0, 3).map((item) => item.topic.id),
      top_k_similarity_scores: scored
        .slice(0, 3)
        .map((item) => clamp(item.similarity, 0, 0.98)),
    },
    shouldCreateNewTopic,
  };
}