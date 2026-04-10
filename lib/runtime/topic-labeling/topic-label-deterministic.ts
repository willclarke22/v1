import {
  TOPIC_LABEL_SCHEMA_VERSION,
  type RetrievalCandidate,
  type TopicLabelingInput,
  type TopicLabelingResult,
  type TopicMessageIntent,
  type TopicSpecificity,
  clampTopicConfidence,
} from "./topic-label-contract";

type SentenceRole =
  | "confusion"
  | "question"
  | "comparison"
  | "request"
  | "attempt"
  | "context"
  | "other";

type TopicCandidate = {
  span: string;
  sourceSentence: string;
  sourceRole: SentenceRole;
  questionAboutTopic: string | null;
  comparisonTarget: string | null;
  qualifiers: string[];
  score: number;
};

const TOO_VAGUE_LABELS = new Set([
  "this",
  "that",
  "it",
  "thing",
  "stuff",
  "part",
  "formula",
  "equation",
  "graph",
  "chapter",
  "textbook",
  "problem",
  "help",
]);

const GENERIC_STARTERS = [
  "a ",
  "an ",
  "the ",
  "this ",
  "that ",
  "these ",
  "those ",
];

const CLAUSE_STARTERS = [
  "how ",
  "why ",
  "what ",
  "when ",
  "where ",
  "whether ",
  "if ",
  "can ",
  "could ",
  "would ",
  "should ",
  "is ",
  "are ",
  "does ",
  "do ",
  "did ",
  "i need help with ",
  "help me with ",
  "help me understand ",
  "i want to learn about ",
  "can we go over ",
  "could we go over ",
  "walk me through ",
  "explain ",
  "can you explain ",
  "i'm confused about ",
  "i am confused about ",
  "i don't understand ",
  "i dont understand ",
  "i don't get ",
  "i dont get ",
  "the thing i don't get is ",
  "the thing i dont get is ",
  "the part i don't understand is ",
  "the part i dont understand is ",
  "the part i don't get is ",
  "the part i dont get is ",
];

function normalizeSurface(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[–—]/g, "-")
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

function tokenize(text: string) {
  return normalizeLoose(text)
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

function semanticTokens(text: string) {
  return tokenize(text).map((token) => singularizeToken(token));
}

function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toLowerCase() === "vs") return "vs";
      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) =>
            part ? part.charAt(0).toUpperCase() + part.slice(1) : part
          )
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
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

function splitIntoSentences(text: string): string[] {
  const normalized = normalizeSurface(text);
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.?!])\s+|\s+\bbut\b\s+/i)
    .map((sentence) => normalizeSurface(sentence))
    .filter(Boolean);
}

function hasFocusMarker(text: string) {
  return /\b(mainly|mostly|especially|specifically|particularly|the part|the thing)\b/i.test(
    text
  );
}

function hasHelpRequestMarker(text: string) {
  return /\b(i need help with|help me with|help me understand)\b/i.test(text);
}

function detectIntent(message: string): TopicMessageIntent {
  const m = normalizeSurface(message).toLowerCase();

  if (
    m.startsWith("quiz me on ") ||
    m.startsWith("test me on ") ||
    m.startsWith("ask me about ")
  ) {
    return "quiz_request";
  }

  if (
    m.includes("i don't understand") ||
    m.includes("i dont understand") ||
    m.includes("i'm confused") ||
    m.includes("i am confused") ||
    m.includes("help me understand") ||
    m.includes("help me with") ||
    m.includes("i need help with") ||
    m.includes("struggling with") ||
    m.includes("i don't get it") ||
    m.includes("i dont get it") ||
    /\b(?:don't|dont)\s+get\s+\w+/i.test(m) ||
    /\b(?:don't|dont)\s+understand\s+\w+/i.test(m)
  ) {
    return "confusion_help";
  }

  if (
    m.startsWith("compare ") ||
    m.startsWith("contrast ") ||
    m.includes("difference between")
  ) {
    return "compare_request";
  }

  if (
    m.startsWith("can we go over ") ||
    m.startsWith("could we go over ") ||
    m.startsWith("walk me through ") ||
    m.startsWith("explain ") ||
    m.startsWith("can you explain ") ||
    m.startsWith("i want to learn about ")
  ) {
    return "explain_request";
  }

  if (
    m.startsWith("apply ") ||
    m.startsWith("what would happen if ") ||
    m.startsWith("predict ")
  ) {
    return "apply_request";
  }

  if (
    m.startsWith("i think ") ||
    m.startsWith("my answer is ") ||
    m.startsWith("because ") ||
    m.startsWith("maybe ")
  ) {
    return "attempt_like";
  }

  if (m.endsWith("?")) {
    return "general_question";
  }

  return "unclear";
}

function classifySentenceRole(sentence: string): SentenceRole {
  const s = normalizeSurface(sentence).toLowerCase();

  if (
    s.includes("i don't understand") ||
    s.includes("i dont understand") ||
    s.includes("i'm confused") ||
    s.includes("i am confused") ||
    s.includes("help me understand") ||
    s.includes("help me with") ||
    s.includes("i need help with") ||
    s.includes("struggling with") ||
    s.includes("i don't get it") ||
    s.includes("i dont get it") ||
    /\b(?:don't|dont)\s+get\s+\w+/i.test(s) ||
    /\b(?:don't|dont)\s+understand\s+\w+/i.test(s)
  ) {
    return "confusion";
  }

  if (
    s.startsWith("compare ") ||
    s.startsWith("contrast ") ||
    s.includes("difference between")
  ) {
    return "comparison";
  }

  if (
    s.startsWith("can we go over ") ||
    s.startsWith("could we go over ") ||
    s.startsWith("walk me through ") ||
    s.startsWith("explain ") ||
    s.startsWith("can you explain ") ||
    s.startsWith("quiz me on ") ||
    s.startsWith("test me on ") ||
    s.startsWith("i want to learn about ")
  ) {
    return "request";
  }

  if (s.endsWith("?")) {
    return "question";
  }

  if (
    s.startsWith("i think ") ||
    s.startsWith("my answer is ") ||
    s.startsWith("because ") ||
    s.startsWith("maybe ")
  ) {
    return "attempt";
  }

  if (
    s.includes("textbook") ||
    s.includes("chapter") ||
    s.includes("notes") ||
    s.includes("teacher") ||
    s.includes("lecture") ||
    s.includes("class")
  ) {
    return "context";
  }

  return "other";
}

function extractComparison(sentence: string) {
  const normalized = normalizeSurface(sentence);
  const match =
    normalized.match(
      /\b(?:difference between|compare|contrast)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)\??$/i
    ) ?? null;

  if (!match) return null;

  const left = normalizeSurface(match[1] ?? "");
  const right = normalizeSurface(match[2] ?? "");

  if (!left || !right) return null;

  return {
    left,
    right,
    combined: `${left} vs ${right}`,
  };
}

function extractFocusedConfusionSpan(sentence: string): string | null {
  const normalized = normalizeSurface(sentence);

  const patterns: RegExp[] = [
    /\b(?:mainly|mostly|especially|specifically|particularly)\s+(?:don't|dont)\s+get\s+(.+?)[.?!]*$/i,
    /\b(?:mainly|mostly|especially|specifically|particularly)\s+(?:don't|dont)\s+understand\s+(.+?)[.?!]*$/i,
    /\b(?:mainly|mostly|especially|specifically|particularly)\s+confused about\s+(.+?)[.?!]*$/i,
    /\b(?:the part|the thing)\s+i\s+(?:don't|dont)\s+get\s+(?:is\s+)?(.+?)[.?!]*$/i,
    /\b(?:the part|the thing)\s+i\s+(?:don't|dont)\s+understand\s+(?:is\s+)?(.+?)[.?!]*$/i,
    /\b(?:i need help with|help me with)\s+(.+?)[.?!]*$/i,
    /\b(?:don't|dont)\s+get\s+(.+?)[.?!]*$/i,
    /\b(?:don't|dont)\s+understand\s+(.+?)[.?!]*$/i,
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (match?.[1]) {
      return normalizeSurface(match[1]);
    }
  }

  return null;
}

function looksLikeLearnerStateClause(span: string | null) {
  if (!span) return true;

  const normalized = normalizeLoose(span);

  if (!normalized) return true;

  return (
    normalized === "i don t get it" ||
    normalized === "i dont get it" ||
    normalized === "i don t understand" ||
    normalized === "i dont understand" ||
    normalized === "i am confused" ||
    normalized === "i m confused" ||
    normalized === "help me understand" ||
    normalized === "help me with" ||
    normalized === "i need help with" ||
    normalized === "don t get it" ||
    normalized === "dont get it" ||
    normalized === "don t understand it" ||
    normalized === "dont understand it"
  );
}

function stripClauseStarter(text: string) {
  let output = normalizeSurface(text);

  for (const starter of CLAUSE_STARTERS) {
    if (output.toLowerCase().startsWith(starter)) {
      output = output.slice(starter.length).trim();
      break;
    }
  }

  return output;
}

function reduceToHeadConcept(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);

  output = stripClauseStarter(output);

  output = output
    .replace(/\bhow\s+(.+?)\s+works?$/i, "$1")
    .replace(/\bhow\s+(.+?)\s+work$/i, "$1")
    .replace(/\bthe way\s+(.+?)\s+works?$/i, "$1")
    .replace(/\bthe part where\s+(.+?)$/i, "$1")
    .replace(/\bwhat happens when\s+(.+?)$/i, "$1")
    .replace(/\bwhy\s+(.+?)$/i, "$1")
    .replace(/\bhow\s+(.+?)$/i, "$1")
    .replace(/\bthe thing about\s+(.+?)$/i, "$1")
    .replace(/\bthe idea of\s+(.+?)$/i, "$1")
    .replace(/\bthe concept of\s+(.+?)$/i, "$1")
    .trim();

  output = output
    .replace(/\bworks?$|happens?$|mean(?:s)?$|does$|do$|is$|are$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  output = output
    .replace(/\bfor me$|\bat all$|\bright now$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return output || null;
}

function cleanupSpan(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);

  output = output
    .replace(/\b(really|honestly|basically|just|actually|still)\b/gi, "")
    .replace(/\b(at all)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  output = output.replace(/[?.!,:;]+$/g, "").trim();

  for (const starter of GENERIC_STARTERS) {
    if (output.toLowerCase().startsWith(starter)) {
      output = output.slice(starter.length).trim();
      break;
    }
  }

  output = output
    .replace(/\bbut I (?:don't|dont) get it\b/i, "")
    .replace(/\bbut I (?:don't|dont) understand\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  output = reduceToHeadConcept(output);

  if (looksLikeLearnerStateClause(output)) {
    return null;
  }

  return output || null;
}

function simplifyEconomicLabel(text: string) {
  const normalized = normalizeSurface(text);

  if (/^the price of a barrel of oil$/i.test(normalized)) {
    return "Oil Prices";
  }

  if (/^price of a barrel of oil$/i.test(normalized)) {
    return "Oil Prices";
  }

  return normalized;
}

function canonicalizeLabel(span: string | null) {
  const cleaned = cleanupSpan(span);
  if (!cleaned) return null;

  const simplified = simplifyEconomicLabel(cleaned);

  const normalized = simplified
    .replace(/\bversus\b/gi, "vs")
    .replace(/\bvs\.\b/gi, "vs")
    .replace(/\s+/g, " ")
    .trim();

  return toTitleCase(normalized);
}

function scoreSpecificity(label: string | null): TopicSpecificity {
  if (!label) return "too_vague";

  const lower = label.toLowerCase().trim();

  if (TOO_VAGUE_LABELS.has(lower)) {
    return "too_vague";
  }

  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 1) return "broad_but_usable";
  if (wordCount <= 4) return "good";
  return "very_specific";
}

function isClauseLikeSpan(span: string | null) {
  if (!span) return true;

  const normalized = normalizeLoose(span);
  if (!normalized) return true;

  if (CLAUSE_STARTERS.some((starter) => normalized.startsWith(starter.trim()))) {
    return true;
  }

  const tokens = tokenize(span);
  const clauseWords = new Set([
    "how",
    "why",
    "what",
    "when",
    "where",
    "if",
    "can",
    "could",
    "would",
    "should",
    "does",
    "do",
    "did",
    "is",
    "are",
    "am",
    "was",
    "were",
    "work",
    "works",
    "happen",
    "happens",
  ]);

  let clauseWordCount = 0;
  for (const token of tokens) {
    if (clauseWords.has(token)) clauseWordCount += 1;
  }

  return clauseWordCount >= 2;
}

function findReuseCandidate(
  label: string | null,
  candidates: RetrievalCandidate[]
): RetrievalCandidate | null {
  if (!label || !candidates.length) return null;

  const normalizedLabel = label.toLowerCase();
  const labelTokens = semanticTokens(label);

  let best: RetrievalCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateName = candidate.topic_name.toLowerCase();
    const exact = candidateName === normalizedLabel ? 1 : 0;
    const tokenScore = overlapScore(
      labelTokens,
      semanticTokens(candidate.topic_name)
    );
    const retrievalScore = candidate.similarity ?? 0;

    const score = exact * 1.0 + tokenScore * 0.7 + retrievalScore * 0.6;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore >= 0.82) return best;
  return null;
}

function buildCandidate(
  span: string | null,
  sourceSentence: string,
  sourceRole: SentenceRole,
  questionAboutTopic: string | null = null,
  comparisonTarget: string | null = null,
  qualifiers: string[] = []
): TopicCandidate | null {
  const cleaned = cleanupSpan(span);
  if (!cleaned) return null;

  return {
    span: cleaned,
    sourceSentence,
    sourceRole,
    questionAboutTopic,
    comparisonTarget,
    qualifiers,
    score: 0,
  };
}

function extractStandaloneConceptCandidate(
  sentence: string
): TopicCandidate | null {
  const normalized = normalizeSurface(sentence);
  const role = classifySentenceRole(normalized);
  const tokens = tokenize(normalized);

  if (!tokens.length || tokens.length > 5) return null;

  const cleaned = cleanupSpan(normalized);
  if (!cleaned) return null;

  const label = canonicalizeLabel(cleaned);
  const specificity = scoreSpecificity(label);

  if (specificity === "too_vague") return null;
  if (isClauseLikeSpan(cleaned)) return null;

  return buildCandidate(cleaned, normalized, role, null, null, []);
}

function extractTailConceptCandidate(sentence: string): TopicCandidate | null {
  const normalized = normalizeSurface(sentence);

  const tailPatterns: RegExp[] = [
    /(?:learn about|understand|review|study)\s+(.+?)[.?!]*$/i,
    /(?:confused about|struggling with|help me understand|help me with|i need help with)\s+(.+?)[.?!]*$/i,
  ];

  for (const regex of tailPatterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const candidate = buildCandidate(
      match[1] ?? null,
      normalized,
      classifySentenceRole(normalized),
      null,
      null,
      hasHelpRequestMarker(normalized) ? ["focus_target"] : []
    );

    if (candidate) return candidate;
  }

  return null;
}

function appearsInBroadList(sentence: string, span: string) {
  const normalizedSentence = normalizeLoose(sentence);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedSentence || !normalizedSpan) return false;

  const hasListStructure =
    sentence.includes(",") || /\b(and|or)\b/i.test(sentence);

  return hasListStructure && normalizedSentence.includes(normalizedSpan);
}

function countSpanMentions(fullMessage: string, span: string) {
  const normalizedMessage = normalizeLoose(fullMessage);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedMessage || !normalizedSpan) return 0;

  const escaped = normalizedSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = normalizedMessage.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

function spansSubstantiallyOverlap(a: string, b: string) {
  const aTokens = semanticTokens(a);
  const bTokens = semanticTokens(b);

  if (!aTokens.length || !bTokens.length) return false;

  const overlap = overlapScore(aTokens, bTokens);
  if (overlap >= 0.6) return true;

  const aLoose = normalizeLoose(a);
  const bLoose = normalizeLoose(b);

  return aLoose.includes(bLoose) || bLoose.includes(aLoose);
}

function choosePreferredOverlappingCandidate(
  current: TopicCandidate,
  incoming: TopicCandidate
) {
  const currentLabel = canonicalizeLabel(current.span);
  const incomingLabel = canonicalizeLabel(incoming.span);

  const currentSpecificity = scoreSpecificity(currentLabel);
  const incomingSpecificity = scoreSpecificity(incomingLabel);

  const currentClauseLike = isClauseLikeSpan(current.span);
  const incomingClauseLike = isClauseLikeSpan(incoming.span);

  const currentTokens = tokenize(current.span).length;
  const incomingTokens = tokenize(incoming.span).length;

  const currentFocus = current.qualifiers.includes("focus_target");
  const incomingFocus = incoming.qualifiers.includes("focus_target");

  if (currentFocus !== incomingFocus) {
    return incomingFocus ? incoming : current;
  }

  if (currentClauseLike !== incomingClauseLike) {
    return incomingClauseLike ? current : incoming;
  }

  if (
    currentSpecificity === "too_vague" &&
    incomingSpecificity !== "too_vague"
  ) {
    return incoming;
  }

  if (
    incomingSpecificity === "too_vague" &&
    currentSpecificity !== "too_vague"
  ) {
    return current;
  }

  if (currentTokens !== incomingTokens) {
    return incomingTokens < currentTokens ? incoming : current;
  }

  if (current.sourceRole !== incoming.sourceRole) {
    const priority: Record<SentenceRole, number> = {
      confusion: 6,
      comparison: 5,
      question: 4,
      request: 3,
      context: 2,
      attempt: 1,
      other: 0,
    };

    return priority[incoming.sourceRole] > priority[current.sourceRole]
      ? incoming
      : current;
  }

  return incoming;
}

function dedupeAndGroupCandidates(candidates: TopicCandidate[]) {
  const grouped: TopicCandidate[] = [];

  for (const candidate of candidates) {
    const existingIndex = grouped.findIndex((existing) =>
      spansSubstantiallyOverlap(existing.span, candidate.span)
    );

    if (existingIndex === -1) {
      grouped.push(candidate);
      continue;
    }

    grouped[existingIndex] = choosePreferredOverlappingCandidate(
      grouped[existingIndex],
      candidate
    );
  }

  return grouped;
}

function extractCandidatesFromSentence(sentence: string): TopicCandidate[] {
  const normalized = normalizeSurface(sentence);
  const role = classifySentenceRole(normalized);
  const candidates: TopicCandidate[] = [];

  const comparison = extractComparison(normalized);
  if (comparison) {
    const candidate = buildCandidate(
      comparison.combined,
      normalized,
      "comparison",
      null,
      comparison.right,
      []
    );
    if (candidate) candidates.push(candidate);
    return candidates;
  }

  const focusedConfusionSpan = extractFocusedConfusionSpan(normalized);
  if (focusedConfusionSpan) {
    const focusedCandidate = buildCandidate(
      focusedConfusionSpan,
      normalized,
      "confusion",
      null,
      null,
      hasFocusMarker(normalized) || hasHelpRequestMarker(normalized)
        ? ["focus_target"]
        : []
    );
    if (focusedCandidate) candidates.push(focusedCandidate);
  }

  const directPatterns: Array<{
    regex: RegExp;
    conceptGroup: number;
    questionBuilder?: (match: RegExpMatchArray) => string | null;
    qualifiers?: string[];
  }> = [
    {
      regex:
        /^(?:i don't really understand|i dont really understand|i don't understand|i dont understand|i'm confused about|i am confused about|help me understand|help me with|i need help with)\s+(.+?)(?:\s+at all)?[.?!]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|i want to learn about)\s+(.+?)[.?!]*$/i,
      conceptGroup: 1,
    },
    {
      regex: /^is\s+(.+?)\s+important\s+for\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) => `important for ${normalizeSurface(m[2] ?? "")}`,
    },
    {
      regex:
        /^(?:how does)\s+(.+?)\s+(affect|influence|impact|change|shape)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
    },
    {
      regex: /^does\s+(.+?)\s+(affect|influence|change|cause)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
    },
    {
      regex: /^(?:what is|what are)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
    },
    {
      regex:
        /^(?:my notes mention|my textbook mentions|we learned about|it talks about)\s+(.+?)[.?!]*$/i,
      conceptGroup: 1,
    },
  ];

  for (const rule of directPatterns) {
    const match = normalized.match(rule.regex);
    if (!match) continue;

    const candidate = buildCandidate(
      match[rule.conceptGroup] ?? null,
      normalized,
      role,
      rule.questionBuilder ? rule.questionBuilder(match) : null,
      null,
      rule.qualifiers ?? []
    );

    if (candidate) candidates.push(candidate);
  }

  const embeddedPatterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
  }> = [
    {
      regex:
        /\b(?:formula|equation|graph|section|chapter|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex:
        /\bhas\s+a\s+(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex: /\bit says\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex: /\babout\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex: /\bregarding\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex: /\bmainly confused about\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\bconfused about\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
  ];

  for (const rule of embeddedPatterns) {
    const match = normalized.match(rule.regex);
    if (!match) continue;

    const raw = normalizeSurface(match[1] ?? "");
    const refined =
      raw.match(/^(?:the\s+)?(.+?)\s+(?:formula|equation)$/i)?.[1] ??
      raw.match(
        /^(.+?)\s+(?:for learning|in the brain|in physics|in biology)$/i
      )?.[1] ??
      raw;

    const candidate = buildCandidate(
      refined,
      normalized,
      role,
      null,
      null,
      rule.qualifiers ?? []
    );
    if (candidate) candidates.push(candidate);
  }

  if (role === "question") {
    const subjectQuestionPatterns: RegExp[] = [
      /^is\s+(.+?)\s+(?:important|necessary|useful|relevant)\b/i,
      /^does\s+(.+?)\s+\w+\b/i,
      /^can\s+(.+?)\s+\w+\b/i,
      /^why is\s+(.+?)\s+\w+\b/i,
    ];

    for (const regex of subjectQuestionPatterns) {
      const match = normalized.match(regex);
      if (!match) continue;
      const candidate = buildCandidate(
        match[1] ?? null,
        normalized,
        role,
        null,
        null,
        []
      );
      if (candidate) candidates.push(candidate);
    }
  }

  const tailCandidate = extractTailConceptCandidate(normalized);
  if (tailCandidate) {
    candidates.push(tailCandidate);
  }

  const standaloneCandidate = extractStandaloneConceptCandidate(normalized);
  if (standaloneCandidate) {
    candidates.push(standaloneCandidate);
  }

  return candidates;
}

function scoreCandidate(candidate: TopicCandidate, fullMessage: string): number {
  let score = 0.25;

  const label = canonicalizeLabel(candidate.span);
  const specificity = scoreSpecificity(label);
  const spanTokens = tokenize(candidate.span);

  if (candidate.sourceRole === "confusion") score += 0.28;
  if (candidate.sourceRole === "question") score += 0.2;
  if (candidate.sourceRole === "request") score += 0.18;
  if (candidate.sourceRole === "comparison") score += 0.26;
  if (candidate.sourceRole === "context") score -= 0.05;

  if (candidate.qualifiers.includes("focus_target")) score += 0.24;

  if (candidate.questionAboutTopic) score += 0.08;
  if (candidate.comparisonTarget) score += 0.1;

  if (specificity === "good") score += 0.18;
  if (specificity === "very_specific") score += 0.14;
  if (specificity === "broad_but_usable") score += 0.08;
  if (specificity === "too_vague") score -= 0.35;

  if (spanTokens.length >= 2 && spanTokens.length <= 5) score += 0.12;
  if (spanTokens.length === 1) score += 0.08;
  if (spanTokens.length > 8) score -= 0.16;

  const fullLower = normalizeLoose(fullMessage);
  const spanLower = normalizeLoose(candidate.span);

  if (spanLower && fullLower.includes(spanLower)) {
    score += 0.05;
  }

  if (
    /\b(?:don't understand|dont understand|confused|don't get it|dont get it|i need help with|help me with)\b/i.test(
      fullMessage
    )
  ) {
    score += 0.06;
  }

  if (appearsInBroadList(candidate.sourceSentence, candidate.span)) {
    score -= 0.12;
  }

  const mentionCount = countSpanMentions(fullMessage, candidate.span);
  if (mentionCount >= 2) score += 0.14;

  if (looksLikeLearnerStateClause(candidate.span)) {
    score -= 0.6;
  }

  if (isClauseLikeSpan(candidate.span)) {
    score -= 0.22;
  }

  if (
    /\b(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\b/i.test(
      candidate.sourceSentence
    ) &&
    candidate.sourceRole === "context"
  ) {
    score += 0.18;
  }

  return clampTopicConfidence(score);
}

function chooseBestCandidate(candidates: TopicCandidate[]): TopicCandidate | null {
  if (!candidates.length) return null;

  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: candidate.score,
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

function collectCandidates(message: string): TopicCandidate[] {
  const sentences = splitIntoSentences(message);
  const collected: TopicCandidate[] = [];

  for (const sentence of sentences) {
    const sentenceCandidates = extractCandidatesFromSentence(sentence);
    for (const candidate of sentenceCandidates) {
      collected.push(candidate);
    }
  }

  return dedupeAndGroupCandidates(collected);
}

function isCreateWorthyBroadLabel(
  label: string | null,
  confidence: number,
  specificity: TopicSpecificity
) {
  if (!label) return false;
  if (specificity !== "broad_but_usable") return false;

  const normalized = label.toLowerCase().trim();
  if (TOO_VAGUE_LABELS.has(normalized)) return false;

  return confidence >= 0.72;
}

export function runDeterministicTopicLabeling(
  input: TopicLabelingInput
): TopicLabelingResult {
  const normalizedMessage = normalizeSurface(input.raw_message);
  const intent = detectIntent(normalizedMessage);

  const rawCandidates = collectCandidates(normalizedMessage);

  const scoredCandidates = rawCandidates.map((candidate) => ({
    ...candidate,
    score: scoreCandidate(candidate, normalizedMessage),
  }));

  const bestCandidate = chooseBestCandidate(scoredCandidates);

  const conceptSpan = cleanupSpan(bestCandidate?.span ?? null);
  const canonicalLabel = canonicalizeLabel(conceptSpan);
  const specificity = scoreSpecificity(canonicalLabel);
  const reuseCandidate = findReuseCandidate(
    canonicalLabel,
    input.retrieval_candidates
  );

  const shouldReuse = Boolean(reuseCandidate);

  let confidence = 0.22;

  if (scoredCandidates.length > 0) confidence += 0.12;
  if (bestCandidate) confidence += bestCandidate.score * 0.28;
  if (conceptSpan) confidence += 0.16;
  if (canonicalLabel) confidence += 0.12;
  if (specificity === "good") confidence += 0.08;
  if (specificity === "very_specific") confidence += 0.07;
  if (specificity === "broad_but_usable") confidence += 0.05;
  if (shouldReuse) confidence += 0.12;

  if (bestCandidate && bestCandidate.qualifiers.includes("focus_target")) {
    confidence += 0.06;
  }

  if (conceptSpan && isClauseLikeSpan(conceptSpan)) {
    confidence -= 0.1;
  }

  confidence = clampTopicConfidence(confidence);

  const shouldCreate =
    !shouldReuse &&
    (specificity === "good" ||
      specificity === "very_specific" ||
      isCreateWorthyBroadLabel(canonicalLabel, confidence, specificity));

  return {
    schema_version: TOPIC_LABEL_SCHEMA_VERSION,
    input,
    interpretation: {
      message_intent: intent,
      is_topic_reference_to_existing_topic: shouldReuse ? true : null,
      references_active_topic:
        input.active_topic_name && canonicalLabel
          ? input.active_topic_name.toLowerCase() === canonicalLabel.toLowerCase()
          : null,
      concept_span: conceptSpan,
      concept_span_start:
        conceptSpan && normalizedMessage.includes(conceptSpan)
          ? normalizedMessage.indexOf(conceptSpan)
          : null,
      concept_span_end:
        conceptSpan && normalizedMessage.includes(conceptSpan)
          ? normalizedMessage.indexOf(conceptSpan) + conceptSpan.length
          : null,
      question_about_topic: bestCandidate?.questionAboutTopic ?? null,
      qualifiers: bestCandidate?.qualifiers ?? [],
      comparison_target: bestCandidate?.comparisonTarget ?? null,
    },
    topic_decision: {
      canonical_label: canonicalLabel,
      label_short: canonicalLabel,
      label_plurality: null,
      resolution_decision: shouldReuse
        ? "reuse_existing"
        : shouldCreate
          ? "create_new"
          : "no_persistent_topic_yet",
      should_reuse_existing_topic: shouldReuse,
      reused_topic_id: reuseCandidate?.topic_id ?? null,
      reused_topic_name: reuseCandidate?.topic_name ?? null,
      should_create_new_topic: shouldCreate,
      topic_specificity: specificity,
      confidence,
    },
    diagnostics: {
      reasoning_summary: [
        scoredCandidates.length > 0
          ? `Generated ${scoredCandidates.length} candidate topic spans after grouping.`
          : "No topic candidates were extracted.",
        conceptSpan
          ? `Selected concept span: ${conceptSpan}.`
          : "Could not confidently select a concept span.",
        canonicalLabel
          ? `Canonical label candidate: ${canonicalLabel}.`
          : "No canonical label candidate was formed.",
        shouldReuse
          ? `A reusable existing topic was found: ${reuseCandidate?.topic_name}.`
          : shouldCreate
            ? "The label looks specific enough to create a new topic."
            : "The message is not yet specific enough for a persistent topic.",
      ],
      rejection_reasons:
        specificity === "too_vague"
          ? ["Concept span is too vague for a persistent topic."]
          : conceptSpan && isClauseLikeSpan(conceptSpan)
            ? ["Concept span still looks too clause-like for a strong persistent topic label."]
            : [],
      ambiguity_flags:
        confidence < 0.75
          ? ["low_confidence_labeling"]
          : [],
    },
  };
}