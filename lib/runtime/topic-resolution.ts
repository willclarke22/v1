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

const FRAME_PATTERNS: Array<{
  frame: MessageFrame;
  patterns: RegExp[];
  score: number;
}> = [
  {
    frame: "quiz_request",
    score: 1,
    patterns: [
      /\bquiz me on\b/i,
      /\btest me on\b/i,
      /\bgive me a quiz on\b/i,
      /\bask me about\b/i,
      /\bcheck my understanding of\b/i,
    ],
  },
  {
    frame: "confusion_help",
    score: 1,
    patterns: [
      /\bi(?: am|'m)\s+confused about\b/i,
      /\bi don't understand\b/i,
      /\bi do not understand\b/i,
      /\bi(?: am|'m)\s+not sure about\b/i,
      /\bi kind of get\b/i,
      /\bi sort of get\b/i,
      /\bhelp me with\b/i,
      /\bhelp me understand\b/i,
    ],
  },
  {
    frame: "explain_request",
    score: 1,
    patterns: [
      /\bcan you explain\b/i,
      /\bexplain\b/i,
      /\bteach me about\b/i,
      /\btell me about\b/i,
      /\bwhat is\b/i,
      /\bwhat are\b/i,
      /\bhow does\b/i,
      /\bhow do\b/i,
    ],
  },
  {
    frame: "compare_request",
    score: 1,
    patterns: [
      /\bwhat(?:'s| is) the difference between\b/i,
      /\bcompare\b/i,
      /\bcontrast\b/i,
      /\bhow is .* different from\b/i,
    ],
  },
  {
    frame: "apply_request",
    score: 1,
    patterns: [
      /\bapply\b/i,
      /\buse this\b/i,
      /\bwhat would happen if\b/i,
      /\bpredict\b/i,
    ],
  },
  {
    frame: "attempt_like",
    score: 1,
    patterns: [
      /\bi think\b/i,
      /\bmaybe\b/i,
      /\bmy answer is\b/i,
      /\bit means\b/i,
      /\bso if\b/i,
      /\bbecause\b/i,
    ],
  },
];

const LEADING_FRAME_PATTERNS: RegExp[] = [
  /^\s*quiz me on\s+/i,
  /^\s*test me on\s+/i,
  /^\s*give me a quiz on\s+/i,
  /^\s*ask me about\s+/i,
  /^\s*check my understanding of\s+/i,

  /^\s*i(?: am|'m)\s+confused about\s+/i,
  /^\s*i don't understand\s+/i,
  /^\s*i do not understand\s+/i,
  /^\s*i(?: am|'m)\s+not sure about\s+/i,
  /^\s*help me with\s+/i,
  /^\s*help me understand\s+/i,

  /^\s*can you explain\s+/i,
  /^\s*explain\s+/i,
  /^\s*teach me about\s+/i,
  /^\s*tell me about\s+/i,
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

  if (scores.attempt_like > 0 && /[.!?]?$/.test(normalized)) {
    scores.attempt_like = Math.min(1, scores.attempt_like + 0.1);
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

  const explicitConfusionMatch =
    normalized.match(
      /^(?:i am|i'm)\s+confused\s+about\s+(.+?)(?:\.\s*.*)?$/i
    ) ||
    normalized.match(
      /^(?:i do not|i don't)\s+understand\s+(.+?)(?:\.\s*.*)?$/i
    ) ||
    normalized.match(
      /^(?:help me understand|help me with|can you explain|explain|quiz me on|test me on)\s+(.+?)(?:\.\s*.*)?$/i
    );

  let stripped =
    explicitConfusionMatch?.[1]?.trim() ?? stripLeadingFrame(normalized);

  if (!stripped || stripped.length < 2) {
    stripped = normalized.replace(/[?.!]+$/g, "");
  }

  stripped = stripped.replace(
    /^(?:the thing about|the part about|the idea of|something about)\s+/i,
    ""
  );

  stripped = stripped.split(/[.?!]/)[0]?.trim() ?? stripped;

  stripped = compactWhitespace(stripped);

  if (!stripped) {
    return "new topic";
  }

  return stripped;
}

export function canonicalizeTopicNameFromMessage(message: string): string {
  const concept = extractConceptCandidateFromMessage(message);
  const cleanedConcept = compactWhitespace(concept);

  if (!cleanedConcept) return "New Topic";

  const rawDisplayTokens = tokenize(cleanedConcept).filter(
    (token) => !LIGHT_STOPWORDS.has(token.toLowerCase())
  );

  const displayPhrase =
    rawDisplayTokens.length > 0 ? rawDisplayTokens.join(" ") : cleanedConcept;

  const titled = toTitleCase(displayPhrase);
  return titled.length > 48 ? `${titled.slice(0, 48).trim()}...` : titled;
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
  const concept = extractConceptCandidateFromMessage(message);
  return dedupe(
    semanticTokenize(concept).filter(
      (token) => token.length > 2 && !LIGHT_STOPWORDS.has(token)
    )
  ).slice(0, 8);
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
  const topicName = canonicalizeTopicNameFromMessage(message);

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
  const conceptCandidate = extractConceptCandidateFromMessage(message);
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

  const frame = inferPrimaryMessageFrame(message);
  const frameBonus =
    frame === "quiz_request" ||
    frame === "confusion_help" ||
    frame === "explain_request"
      ? 0.04
      : 0;

  const score =
    exactNameMatch * 1.0 +
    topicNameContained * 0.82 +
    semanticishScore * 0.78 +
    frameBonus;

  return clamp(score, 0, 1);
}

const REUSE_TOPIC_THRESHOLD = 0.54;

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[]
): TopicMatchResult {
  if (!existingTopics.length) {
    return {
      matchedTopic: null,
      vectorInfo: {
        top_k_topic_names: [],
        top_k_topic_ids: [],
        top_k_similarity_scores: [],
      },
      shouldCreateNewTopic: true,
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

  return {
    matchedTopic:
      best && best.similarity >= REUSE_TOPIC_THRESHOLD ? best.topic : null,
    vectorInfo: {
      top_k_topic_names: scored.slice(0, 3).map((item) => item.topic.name),
      top_k_topic_ids: scored.slice(0, 3).map((item) => item.topic.id),
      top_k_similarity_scores: scored
        .slice(0, 3)
        .map((item) => clamp(item.similarity, 0, 0.98)),
    },
    shouldCreateNewTopic: !best || best.similarity < REUSE_TOPIC_THRESHOLD,
  };
}