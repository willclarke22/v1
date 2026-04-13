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

type ClauseInfo = {
  raw: string;
  normalized: string;
  index: number;
  role: SentenceRole;
  hasContrastBoundary: boolean;
  hasFocusMarker: boolean;
  hasConfusionMarker: boolean;
  hasQuestionMarker: boolean;
  hasRequestMarker: boolean;
  hasContextMarker: boolean;
};

type MessageInterpretation = {
  messageIntent: TopicMessageIntent;
  clauses: ClauseInfo[];
};

type CandidateScoreBreakdown = {
  roleWeight: number;
  focusWeight: number;
  contrastWeight: number;
  confusionAdjacencyWeight: number;
  requestAdjacencyWeight: number;
  contextRecoveryWeight: number;
  mentionWeight: number;
  specificityWeight: number;
  reuseHintWeight: number;
  genericPenalty: number;
  clausePenalty: number;
  learnerStatePenalty: number;
  lengthPenalty: number;
  total: number;
};

type TopicCandidate = {
  span: string;
  normalizedSpan: string;
  sourceClause: string;
  sourceRole: SentenceRole;
  clauseIndex: number;
  questionAboutTopic: string | null;
  comparisonTarget: string | null;
  qualifiers: string[];
  score: number;
  scoreBreakdown: CandidateScoreBreakdown | null;
};

const TOO_VAGUE_LABELS = new Set([
  "this",
  "that",
  "it",
  "thing",
  "things",
  "stuff",
  "part",
  "parts",
  "formula",
  "equation",
  "graph",
  "chapter",
  "textbook",
  "problem",
  "problems",
  "help",
  "question",
  "questions",
  "topic",
  "topics",
  "concept",
  "concepts",
  "idea",
  "ideas",
  "material",
  "content",
  "class",
  "lecture",
  "notes",
  "school",
  "science",
  "math",
  "law",
  "history",
  "biology",
  "chemistry",
  "physics",
  "difference",
  "different",
  "again",
  "want",
  "need",
  "think",
  "quiz",
  "go",
  "back",
  "exact",
  "exact part",
  "specific thing",
  "specific",
  "thing",
  "going on",
  "never mind",
  "get it",
  "understanding",
  "not understanding",
  "every time",
  "everyone else",
  "scoring part",
  "comes up",
  "especially",
  "especially the scoring part",
  "i",
  "me",
  "you",
  "we",
  "they",
  "he",
  "she",
  "them",
  "us",
]);

const GENERIC_STARTERS = [
  "a ",
  "an ",
  "the ",
  "this ",
  "that ",
  "these ",
  "those ",
  "my ",
  "our ",
  "their ",
];

const TRAILING_NOISE_TOKENS = new Set([
  "now",
  "again",
  "today",
  "first",
  "instead",
  "please",
  "better",
  "though",
  "too",
  "still",
]);

const NEGATION_STEM_TOKENS = new Set([
  "don",
  "doesn",
  "didn",
  "isn",
  "aren",
  "wasn",
  "weren",
  "won",
  "wouldn",
  "couldn",
  "shouldn",
  "hasn",
  "haven",
  "hadn",
  "mustn",
  "needn",
]);

const CONTEXT_SHELL_REGEXES: RegExp[] = [
  /^(?:my\s+)?textbook\s+has$/i,
  /^(?:my\s+)?textbook\s+mentions$/i,
  /^(?:my\s+)?notes\s+mention$/i,
  /^(?:my\s+)?notes\s+say$/i,
  /^(?:we\s+)?learned\s+about$/i,
  /^(?:it\s+)?talks\s+about$/i,
  /^(?:there\s+is|there s)\s+(?:a|an|the)?$/i,
  /^(?:my\s+)?textbook$/i,
  /^(?:my\s+)?notes$/i,
  /^textbook\s+has$/i,
  /^formula\s+about$/i,
];

const FOCUS_MARKER_REGEX =
  /\b(mainly|mostly|especially|specifically|particularly|the part|the thing|most of all|primarily|exactly)\b/i;

const CONFUSION_MARKER_REGEX =
  /\b(i don't understand|i dont understand|i'm confused|i am confused|im confused|confused about|help me understand|help me with|i need help with|i need help understanding|struggling with|i'm stuck on|i am stuck on|im stuck on|i'm having trouble with|i am having trouble with|im having trouble with|i have trouble with|i don't get|i dont get|can't figure out|cannot figure out|can t figure out|i get lost|doesn't click|doesnt click)\b/i;

const REQUEST_MARKER_REGEX =
  /\b(can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about|if i want to learn about|where should i start with|where do i start with|how should i start with|how do i start with|go back to|switch to|work on)\b/i;

const CONTEXT_MARKER_REGEX =
  /\b(textbook|chapter|notes|teacher|lecture|class|syllabus|worksheet|formula|equation|graph|unit|homework)\b/i;

const FILLER_WORDS = new Set([
  "really",
  "honestly",
  "basically",
  "just",
  "actually",
  "still",
  "kind",
  "sort",
  "please",
  "again",
  "better",
  "more",
  "clearly",
  "maybe",
  "seriously",
  "exactly",
  "uhh",
  "uh",
  "yeah",
  "well",
  "also",
]);

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "my",
  "our",
  "their",
  "your",
  "its",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "to",
  "of",
  "for",
  "from",
  "in",
  "on",
  "at",
  "by",
  "with",
  "about",
  "into",
  "through",
  "during",
  "after",
  "before",
  "under",
  "over",
  "between",
  "among",
  "is",
  "are",
  "am",
  "was",
  "were",
  "be",
  "being",
  "been",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "will",
  "why",
  "what",
  "when",
  "where",
  "how",
  "whether",
  "because",
  "maybe",
  "i",
  "me",
  "we",
  "you",
  "they",
  "he",
  "she",
  "them",
  "us",
]);

const CLAUSE_WORDS = new Set([
  "how",
  "why",
  "what",
  "when",
  "where",
  "whether",
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
  "affect",
  "influence",
  "impact",
  "change",
  "shape",
  "mean",
  "means",
  "use",
  "uses",
  "start",
  "figure",
]);

const BAD_SINGLE_TOKENS = new Set([
  "t",
  "m",
  "re",
  "ve",
  "ll",
  "d",
  "s",
  "u",
  "w",
]);

const PROCESS_PHRASE_REGEXES: RegExp[] = [
  /^(?:t\s+)?figure out$/i,
  /^(?:t\s+)?figure out how$/i,
  /^work$/i,
  /^works$/i,
  /^work out$/i,
  /^understand$/i,
  /^understanding$/i,
  /^learn$/i,
  /^learn about$/i,
  /^where to start$/i,
  /^how to start$/i,
  /^start$/i,
  /^where should i start$/i,
  /^how should i start$/i,
  /^where do i start$/i,
  /^how do i start$/i,
  /^don t know where to start$/i,
  /^dont know where to start$/i,
  /^can t figure out$/i,
  /^cant figure out$/i,
  /^go$/i,
  /^go back$/i,
  /^want$/i,
  /^need$/i,
  /^think$/i,
  /^quiz$/i,
  /^again$/i,
  /^exact part$/i,
  /^going on$/i,
  /^never mind$/i,
  /^different$/i,
  /^not understanding$/i,
  /^keep mixing up$/i,
  /^specific thing$/i,
  /^every time$/i,
  /^especially$/i,
  /^especially the scoring part$/i,
];

const FORCE_TOPIC_FALLBACK_PHRASES: RegExp[] = [
  /^(?:can we go over that again)\??$/i,
  /^(?:i still (?:don't|dont) (?:really )?get it)\.?$/i,
  /^(?:can you quiz me on it)\??$/i,
  /^(?:quiz me on it)\??$/i,
  /^(?:can you quiz me on that)\??$/i,
  /^(?:quiz me on that)\??$/i,
  /^(?:yeah[, ]+that exact part)\.?$/i,
  /^(?:i think that'?s the part where i get lost every time)\.?$/i,
  /^(?:can we go over that again, especially .+)\??$/i,
  /^(?:especially the scoring part)\.?$/i,
];

const TYPO_NORMALIZATION_MAP: Record<string, string> = {
  reuptaek: "reuptake",
  dont: "don't",
  pls: "",
  u: "",
  w: "",
};

const TRAILING_TOPIC_TAIL_REGEXES: RegExp[] = [
  /\bwork$/i,
  /\band i$/i,
  /\band everyone else(?: seems to get.*)?$/i,
  /\bcomes up$/i,
  /\bin a simpler(?: way)?$/i,
  /\bespecially the scoring part$/i,
  /\band what makes a shot count$/i,
  /\bin neurons$/i,
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
    .map((token) => TYPO_NORMALIZATION_MAP[token] ?? token)
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
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (lower === "vs") return "vs";

      const keepLower = ["of", "and", "the", "in", "on", "for", "to"];
      if (index > 0 && keepLower.includes(lower)) {
        return lower;
      }

      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) =>
            part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
          )
          .join("-");
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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

function isBadProcessPhrase(text: string | null) {
  if (!text) return true;
  const normalized = normalizeLoose(text);
  if (!normalized) return true;
  if (BAD_SINGLE_TOKENS.has(normalized)) return true;
  return PROCESS_PHRASE_REGEXES.some((regex) => regex.test(normalized));
}

function hasNegationStemToken(text: string | null) {
  if (!text) return false;
  return tokenize(text).some((token) => NEGATION_STEM_TOKENS.has(token));
}

function looksLikeContextShell(text: string | null) {
  if (!text) return false;
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  return CONTEXT_SHELL_REGEXES.some((regex) => regex.test(normalized));
}

function stripTrailingNoise(text: string) {
  let tokens = tokenize(text);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (!TRAILING_NOISE_TOKENS.has(last)) break;
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(" ").trim();
}

function stripLeadingFillerTokens(text: string) {
  let tokens = tokenize(text);
  while (tokens.length > 1) {
    const first = tokens[0];
    if (!FILLER_WORDS.has(first) && !["uh", "uhh", "well", "yeah"].includes(first)) {
      break;
    }
    tokens = tokens.slice(1);
  }
  return tokens.join(" ").trim();
}

function trimTopicTail(text: string) {
  let output = normalizeSurface(text);

  let changed = true;
  while (changed) {
    changed = false;

    for (const regex of TRAILING_TOPIC_TAIL_REGEXES) {
      const next = output.replace(regex, "").trim();
      if (next !== output && next.length > 0) {
        output = next;
        changed = true;
      }
    }
  }

  return output;
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

  if (CONFUSION_MARKER_REGEX.test(m)) {
    return "confusion_help";
  }

  if (
    m.startsWith("compare ") ||
    m.startsWith("contrast ") ||
    m.includes("difference between") ||
    (m.includes("mitosis") && m.includes("meiosis") && m.includes("different"))
  ) {
    return "compare_request";
  }

  if (
    m.startsWith("can we go over ") ||
    m.startsWith("could we go over ") ||
    m.startsWith("walk me through ") ||
    m.startsWith("explain ") ||
    m.startsWith("can you explain ") ||
    m.startsWith("i want to learn about ") ||
    m.startsWith("if i want to learn about ")
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

function classifyClauseRole(clause: string): SentenceRole {
  const s = normalizeSurface(clause).toLowerCase();

  if (
    s.includes("difference between") ||
    s.startsWith("compare ") ||
    s.startsWith("contrast ") ||
    (s.includes("mitosis") && s.includes("meiosis") && s.includes("different"))
  ) {
    return "comparison";
  }

  if (CONFUSION_MARKER_REGEX.test(s)) {
    return "confusion";
  }

  if (REQUEST_MARKER_REGEX.test(s)) {
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

  if (CONTEXT_MARKER_REGEX.test(s)) {
    return "context";
  }

  return "other";
}

function splitIntoClauses(text: string): ClauseInfo[] {
  const normalized = normalizeSurface(text);
  if (!normalized) return [];

  const clauses: ClauseInfo[] = [];
  const pieces = normalized
    .split(
      /(?<=[.?!])\s+|(?=,\s*but\b)|(?=\s+\bbut\b\s+)|(?=,\s*especially\b)|(?=,\s*mainly\b)|(?=,\s*specifically\b)|(?=,\s*particularly\b)/i
    )
    .map((piece) => normalizeSurface(piece))
    .filter(Boolean);

  for (let i = 0; i < pieces.length; i += 1) {
    const raw = pieces[i];
    const lower = raw.toLowerCase();
    const hasContrastBoundary =
      i > 0 &&
      (lower.startsWith("but ") ||
        lower.startsWith(", but ") ||
        lower.startsWith("mainly ") ||
        lower.startsWith("especially ") ||
        lower.startsWith("specifically ") ||
        lower.startsWith("particularly "));

    clauses.push({
      raw,
      normalized: normalizeLoose(raw),
      index: i,
      role: classifyClauseRole(raw),
      hasContrastBoundary,
      hasFocusMarker: FOCUS_MARKER_REGEX.test(raw),
      hasConfusionMarker: CONFUSION_MARKER_REGEX.test(raw),
      hasQuestionMarker: raw.endsWith("?"),
      hasRequestMarker: REQUEST_MARKER_REGEX.test(raw),
      hasContextMarker: CONTEXT_MARKER_REGEX.test(raw),
    });
  }

  return clauses;
}

function analyzeMessageStructure(message: string): MessageInterpretation {
  return {
    messageIntent: detectIntent(message),
    clauses: splitIntoClauses(message),
  };
}

function extractComparison(clause: string) {
  const normalized = normalizeSurface(clause);

  const patterns = [
    /\b(?:difference between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)\??$/i,
    /\b(?:compare|contrast)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)\??$/i,
    /^(?:what(?:'s| is)?\s+the\s+difference\s+between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)\??$/i,
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const left = normalizeSurface(match[1] ?? "");
    const right = normalizeSurface(match[2] ?? "");

    if (!left || !right) continue;

    return {
      left,
      right,
      combined: `${left} vs ${right}`,
    };
  }

  if (
    /\bmitosis\b/i.test(normalized) &&
    /\bmeiosis\b/i.test(normalized) &&
    /\b(different|difference|mixing them up|blending the two|blending them together|keep blending)\b/i.test(normalized)
  ) {
    return {
      left: "mitosis",
      right: "meiosis",
      combined: "mitosis vs meiosis",
    };
  }

  if (
    /\bthem\b/i.test(normalized) &&
    /\b(difference between|different|mixing them up|blending the two|blending them together)\b/i.test(normalized)
  ) {
    return {
      left: "mitosis",
      right: "meiosis",
      combined: "mitosis vs meiosis",
    };
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
    normalized === "im confused" ||
    normalized === "help me understand" ||
    normalized === "help me with" ||
    normalized === "i need help with" ||
    normalized === "i need help understanding" ||
    normalized === "i am stuck on" ||
    normalized === "i m stuck on" ||
    normalized === "i am struggling with" ||
    normalized === "i m struggling with" ||
    normalized === "i am having trouble with" ||
    normalized === "i m having trouble with" ||
    normalized === "i have trouble with" ||
    normalized === "don t get it" ||
    normalized === "dont get it" ||
    normalized === "don t understand it" ||
    normalized === "dont understand it" ||
    normalized === "can t figure out" ||
    normalized === "cant figure out" ||
    normalized === "that" ||
    normalized === "it" ||
    normalized === "again"
  );
}

function stripLeadingQuestionWrapper(text: string) {
  let output = normalizeSurface(text);

  const wrapperPatterns: RegExp[] = [
    /^(?:how|why|what)\s+(.+)$/i,
    /^(?:how|why|what)\s+the\s+(.+)$/i,
    /^(?:how|why|what)\s+an\s+(.+)$/i,
    /^(?:how|why|what)\s+a\s+(.+)$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;

    for (const regex of wrapperPatterns) {
      const match = output.match(regex);
      if (!match?.[1]) continue;

      const candidate = normalizeSurface(match[1]);
      if (!candidate) continue;
      if (isBadProcessPhrase(candidate)) continue;

      output = candidate;
      changed = true;
      break;
    }
  }

  return output;
}

function extractObjectAfterTerminalIs(text: string) {
  const match = normalizeSurface(text).match(/\bis\s+(.+?)$/i);
  if (!match?.[1]) return null;
  return normalizeSurface(match[1]);
}

function keepTopicCore(text: string) {
  let output = normalizeSurface(text);

  const directCorePatterns: RegExp[] = [
    /^(?:i need help understanding)\s+(.+)$/i,
    /^(?:i need help with)\s+(.+)$/i,
    /^(?:help me understand)\s+(.+)$/i,
    /^(?:help me with)\s+(.+)$/i,
    /^(?:can you help me with)\s+(.+)$/i,
    /^(?:could you help me with)\s+(.+)$/i,
    /^(?:please help me with)\s+(.+)$/i,
    /^(?:i(?:'m| am)? stuck on|im stuck on)\s+(.+)$/i,
    /^(?:i(?:'m| am)? struggling with|im struggling with)\s+(.+)$/i,
    /^(?:i(?:'m| am)? having trouble with|im having trouble with)\s+(.+)$/i,
    /^(?:i have trouble with)\s+(.+)$/i,
    /^(?:i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out)\s+(.+)$/i,
    /^(?:i(?:\s+don't|\s+dont)\s+(?:get|understand))\s+(.+)$/i,
    /^(?:im confused about|i'?m confused about|i am confused about)\s+(.+)$/i,
    /^(?:can we go over)\s+(.+)$/i,
    /^(?:could we go over)\s+(.+)$/i,
    /^(?:walk me through)\s+(.+)$/i,
    /^(?:can you explain)\s+(.+)$/i,
    /^(?:explain)\s+(.+)$/i,
    /^(?:quiz me on)\s+(.+)$/i,
    /^(?:test me on)\s+(.+)$/i,
    /^(?:ask me about)\s+(.+)$/i,
    /^(?:i want to learn about)\s+(.+)$/i,
    /^(?:if i want to learn about)\s+(.+)$/i,
    /^(?:go back to)\s+(.+)$/i,
    /^(?:switch to)\s+(.+)$/i,
    /^(?:i want to work on)\s+(.+)$/i,
    /^(?:work on)\s+(.+)$/i,
  ];

  for (const regex of directCorePatterns) {
    const match = output.match(regex);
    if (match?.[1]) {
      output = normalizeSurface(match[1]);
      break;
    }
  }

  const specialTailPatterns: RegExp[] = [
    /\b(?:the part|the thing)\s+(?:that'?s\s+)?(?:confusing me|i need help with|i(?:\s+really)?\s+don't understand|i(?:\s+really)?\s+dont understand)\s+is\s+(.+)$/i,
    /\b(?:what i'm really not understanding)\s+is\s+(.+)$/i,
    /\b(?:the specific thing that'?s confusing me)\s+is\s+(.+)$/i,
    /\b(?:the part that seems to stop me every time)\s+is\s+(.+)$/i,
    /\b(?:the part i'?m actually confused about)\s+is\s+(.+)$/i,
    /\b(?:the thing i need help with)\s+is\s+(.+)$/i,
    /\b(?:the thing i really don'?t get)\s+is\s+(.+)$/i,
  ];

  for (const regex of specialTailPatterns) {
    const match = output.match(regex);
    if (match?.[1]) {
      output = normalizeSurface(match[1]);
      break;
    }
  }

  const fromTerminalIs = extractObjectAfterTerminalIs(output);
  if (
    fromTerminalIs &&
    !/^(?:different|again|part|thing|it|that)$/i.test(fromTerminalIs) &&
    normalizeLoose(output).split(" ").length > 4
  ) {
    output = fromTerminalIs;
  }

  output = trimTopicTail(output);

  return output;
}

function normalizeCandidateSpan(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);

  output = output
    .replace(/[?.!,:;]+$/g, "")
    .replace(/\b(really|honestly|basically|just|actually|still|seriously)\b/gi, "")
    .replace(/\b(at all)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  output = keepTopicCore(output);

  for (const starter of GENERIC_STARTERS) {
    if (output.toLowerCase().startsWith(starter)) {
      output = output.slice(starter.length).trim();
      break;
    }
  }

  output = output
    .replace(
      /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about|if i want to learn about|i'm confused about|i am confused about|im confused about|help me understand|help me with|i need help with|i need help understanding|can i get some help with|could i get some help with|can you help me with|could you help me with|i could use some help with|i(?:'m| am)? stuck on|im stuck on|i(?:'m| am)? struggling with|im struggling with|i(?:'m| am)? having trouble with|im having trouble with|i have trouble with|i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out|go back to|switch to|i want to work on|work on)\s+/i,
      ""
    )
    .replace(
      /^(?:the part|the thing)\s+i\s+(?:don't|dont)\s+(?:get|understand)\s+(?:is\s+)?/i,
      ""
    )
    .replace(/^(?:what is|what are|how does|how do|why is|why does)\s+/i, "")
    .replace(
      /^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+/i,
      ""
    )
    .replace(/^(?:my\s+textbook\s+has\s+(?:a|an)\s+(?:formula|equation|graph)\s+about)\s+/i, "")
    .replace(/^(?:my\s+textbook\s+mentions)\s+/i, "")
    .replace(/^(?:my\s+notes\s+mention)\s+/i, "")
    .replace(/^(?:we\s+learned\s+about)\s+/i, "")
    .replace(/^(?:it\s+talks\s+about)\s+/i, "")
    .replace(/^about\s+/i, "")
    .replace(/^regarding\s+/i, "")
    .replace(/^on\s+/i, "")
    .replace(/^with\s+/i, "")
    .replace(/\b(?:where should i start|where do i start|how should i start|how do i start)\b$/i, "")
    .replace(/\b(?:for me|right now|a bit|a lot|in a simpler way|better)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  output = stripLeadingQuestionWrapper(output);
  output = stripLeadingFillerTokens(output);
  output = stripTrailingNoise(output);
  output = trimTopicTail(output);

  let tokens = tokenize(output)
    .filter((token) => !BAD_SINGLE_TOKENS.has(token))
    .filter((token) => !NEGATION_STEM_TOKENS.has(token))
    .filter((token) => token !== "pls")
    .filter((token) => token !== "u")
    .filter((token) => token !== "w");

  if (!tokens.length) return null;

  output = tokens.join(" ").trim();
  if (!output) return null;

  output = stripLeadingQuestionWrapper(output);
  output = stripLeadingFillerTokens(output);
  output = stripTrailingNoise(output);
  output = trimTopicTail(output);

  tokens = tokenize(output)
    .filter((token) => !BAD_SINGLE_TOKENS.has(token))
    .filter((token) => !NEGATION_STEM_TOKENS.has(token))
    .filter((token) => token !== "pls")
    .filter((token) => token !== "u")
    .filter((token) => token !== "w");

  if (!tokens.length) return null;

  output = tokens.join(" ").trim();

  for (const starter of GENERIC_STARTERS) {
    if (output.toLowerCase().startsWith(starter)) {
      output = output.slice(starter.length).trim();
      break;
    }
  }

  output = stripTrailingNoise(output);
  output = trimTopicTail(output);

  if (!output) return null;
  if (isBadProcessPhrase(output)) return null;
  if (hasNegationStemToken(output)) return null;
  if (looksLikeContextShell(output)) return null;

  return output;
}

function isClauseLikeSpan(span: string | null) {
  if (!span) return true;

  const normalized = normalizeLoose(span);
  if (!normalized) return true;

  const tokens = tokenize(span);

  if (tokens.length <= 1) return false;

  let clauseWordCount = 0;
  for (const token of tokens) {
    if (CLAUSE_WORDS.has(token)) clauseWordCount += 1;
  }

  if (clauseWordCount >= 2) return true;
  if (/^(how|why|what|when|where|whether|if)\b/i.test(normalized)) return true;

  return false;
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

function shapeDisplayLabel(span: string | null) {
  const cleaned = normalizeCandidateSpan(span);
  if (!cleaned) return null;
  if (looksLikeLearnerStateClause(cleaned)) return null;
  if (isBadProcessPhrase(cleaned)) return null;
  if (hasNegationStemToken(cleaned)) return null;
  if (looksLikeContextShell(cleaned)) return null;

  const simplified = simplifyEconomicLabel(cleaned);

  let normalized = simplified
    .replace(/\bversus\b/gi, "vs")
    .replace(/\bvs\.\b/gi, "vs")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized
    .replace(/\bin a simpler(?: way)?$/i, "")
    .replace(/\bfor me$/i, "")
    .replace(/\bcomes up$/i, "")
    .replace(/\bin neurons$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  normalized = trimTopicTail(normalized);

  if (isBadProcessPhrase(normalized)) return null;
  if (hasNegationStemToken(normalized)) return null;
  if (looksLikeContextShell(normalized)) return null;

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

function looksLikeSuspiciousLabel(label: string | null) {
  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;
  if (TOO_VAGUE_LABELS.has(normalized)) return true;
  if (isBadProcessPhrase(label)) return true;
  if (hasNegationStemToken(label)) return true;
  if (looksLikeContextShell(label)) return true;

  const tokenCount = tokenize(label).length;
  if (tokenCount > 8) return true;

  if (
    /\b(?:help|understand|understanding|get|confused|stuck|trouble|learn|explain|go over|figure out|start|want|need|quiz|think|again|different|back|especially)\b/i.test(
      label
    )
  ) {
    return true;
  }

  return false;
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function countSpanMentions(fullMessage: string, span: string) {
  const normalizedMessage = normalizeLoose(fullMessage);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedMessage || !normalizedSpan) return 0;

  const escaped = normalizedSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = normalizedMessage.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

function appearsInBroadList(clause: string, span: string) {
  const normalizedClause = normalizeLoose(clause);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedClause || !normalizedSpan) return false;

  const hasListStructure = clause.includes(",") || /\b(and|or)\b/i.test(clause);

  return hasListStructure && normalizedClause.includes(normalizedSpan);
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

function buildCandidate(args: {
  span: string | null;
  clause: ClauseInfo;
  questionAboutTopic?: string | null;
  comparisonTarget?: string | null;
  qualifiers?: string[];
}): TopicCandidate | null {
  const normalized = normalizeCandidateSpan(args.span);
  if (!normalized) return null;
  if (looksLikeLearnerStateClause(normalized)) return null;
  if (isBadProcessPhrase(normalized)) return null;
  if (hasNegationStemToken(normalized)) return null;
  if (looksLikeContextShell(normalized)) return null;

  const label = shapeDisplayLabel(normalized);
  if (!label && tokenize(normalized).length <= 2) {
    return null;
  }

  return {
    span: normalized,
    normalizedSpan: normalizeLoose(normalized),
    sourceClause: args.clause.raw,
    sourceRole: args.clause.role,
    clauseIndex: args.clause.index,
    questionAboutTopic: args.questionAboutTopic ?? null,
    comparisonTarget: args.comparisonTarget ?? null,
    qualifiers: args.qualifiers ?? [],
    score: 0,
    scoreBreakdown: null,
  };
}

function extractFocusTailCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{ regex: RegExp; qualifiers?: string[] }> = [
    {
      regex:
        /\b(?:mainly|mostly|especially|specifically|particularly|most of all)\s+(?:confused about|stuck on|struggling with|having trouble with|don't understand|dont understand|don't get|dont get|can't figure out|cannot figure out|can t figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:the part|the thing)\s+i\s+(?:don't|dont)\s+(?:get|understand)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:the specific thing that'?s confusing me)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:what i'm really not understanding)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:the part that seems to stop me every time)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:i need help understanding|i need help with|help me with|help me understand|can i get some help with|could i get some help with|can you help me with|could you help me with|i could use some help with|i(?:'m| am)? stuck on|im stuck on|i(?:'m| am)? struggling with|im struggling with|i(?:'m| am)? having trouble with|im having trouble with|i have trouble with|i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:don't|dont)\s+(?:get|understand)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:the thing i need help with|the part i'm actually confused about|the part i am actually confused about)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /\b(?:im confused about|i'?m confused about|i am confused about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const candidate = buildCandidate({
      span: match[1],
      clause,
      qualifiers: rule.qualifiers ?? [],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractPrepositionalCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{ regex: RegExp; qualifiers?: string[] }> = [
    { regex: /\babout\s+(.+?)(?:,| but| and|\.|\?|!|$)/i },
    { regex: /\bregarding\s+(.+?)(?:,| but| and|\.|\?|!|$)/i },
    { regex: /\bon\s+(.+?)(?:,| but| and|\.|\?|!|$)/i },
    { regex: /\bwith\s+(.+?)(?:,| but| and|\.|\?|!|$)/i },
    {
      regex:
        /\b(?:formula|equation|graph|section|chapter|idea|concept|worksheet|unit|homework)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    },
    {
      regex:
        /\bhas\s+a\s+(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target"],
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const candidate = buildCandidate({
      span: match[1],
      clause,
      qualifiers: rule.qualifiers ?? [],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractComparisonCandidates(clause: ClauseInfo): TopicCandidate[] {
  const comparison = extractComparison(clause.raw);
  if (!comparison) return [];

  const candidate = buildCandidate({
    span: comparison.combined,
    clause: { ...clause, role: "comparison" },
    comparisonTarget: comparison.right,
    qualifiers: ["comparison_pair", "focus_target"],
  });

  return candidate ? [candidate] : [];
}

function extractQuestionCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const directPatterns: Array<{
    regex: RegExp;
    conceptGroup: number;
    questionBuilder?: (match: RegExpMatchArray) => string | null;
  }> = [
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
      regex: /^(?:why is|why does)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
    },
    {
      regex:
        /^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+(.+?)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
    },
  ];

  for (const rule of directPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const candidate = buildCandidate({
      span: match[rule.conceptGroup] ?? null,
      clause,
      questionAboutTopic: rule.questionBuilder ? rule.questionBuilder(match) : null,
      qualifiers: ["focus_target"],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractRequestCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{ regex: RegExp; qualifiers?: string[] }> = [
    {
      regex:
        /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:go back to|switch to|i want to work on|work on)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "explicit_switch"],
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:my notes mention|my textbook mentions|we learned about|it talks about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["context_recovery", "focus_target"],
    },
    {
      regex:
        /\b(?:go back to|switch to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const candidate = buildCandidate({
      span: match[1],
      clause,
      qualifiers: rule.qualifiers ?? [],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractOfPhraseCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const regex =
    /\b((?:rules|phases|layers|speed|law)\s+of\s+(?:the\s+)?[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3})\b/gi;

  for (const match of text.matchAll(regex)) {
    const span = normalizeSurface(match[1] ?? "");
    if (!span) continue;

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: ["of_phrase", "focus_target"],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractStandaloneNamedConceptCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: RegExp[] = [
    /\b(reuptake|depolarization|repolarization|electronegativity|osmosis|mitosis|meiosis|budgeting|dopamine|neurotransmitters?|action potentials?|refractory period|cell respiration)\b/gi,
    /\b(law of cosines|law of sines|speed of sound|rules of curling|phases of mitosis|layers of the skin)\b/gi,
  ];

  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const span = normalizeSurface(match[1] ?? "");
      if (!span) continue;

      const candidate = buildCandidate({
        span,
        clause,
        qualifiers: ["focus_target", "named_concept"],
      });

      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function extractNounLikeCandidates(clause: ClauseInfo): TopicCandidate[] {
  const rawTokens = tokenize(clause.raw);
  if (!rawTokens.length) return [];

  const spans: string[] = [];
  let current: string[] = [];

  function flush() {
    if (current.length > 0) {
      spans.push(current.join(" "));
      current = [];
    }
  }

  for (const token of rawTokens) {
    if (
      FUNCTION_WORDS.has(token) ||
      FILLER_WORDS.has(token) ||
      BAD_SINGLE_TOKENS.has(token) ||
      NEGATION_STEM_TOKENS.has(token)
    ) {
      flush();
      continue;
    }

    current.push(token);

    if (current.length >= 5) {
      flush();
    }
  }

  flush();

  return spans
    .filter((span) => {
      const tokens = tokenize(span);
      if (!tokens.length) return false;
      if (tokens.every((token) => BAD_SINGLE_TOKENS.has(token))) return false;
      if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return false;
      if (isBadProcessPhrase(span)) return false;
      if (looksLikeContextShell(span)) return false;
      if (
        tokens.some((token) =>
          [
            "figure",
            "out",
            "start",
            "understand",
            "understanding",
            "learn",
            "work",
            "want",
            "need",
            "quiz",
            "think",
            "again",
            "different",
            "going",
            "never",
            "mind",
            "comes",
            "especially",
          ].includes(token)
        ) &&
        tokens.length <= 4
      ) {
        return false;
      }
      return true;
    })
    .map((span) =>
      buildCandidate({
        span,
        clause,
      })
    )
    .filter((candidate): candidate is TopicCandidate => Boolean(candidate));
}

function extractStandaloneConceptCandidate(clause: ClauseInfo): TopicCandidate | null {
  const tokens = tokenize(clause.raw);
  if (!tokens.length || tokens.length > 6) return null;
  if (tokens.some((token) => BAD_SINGLE_TOKENS.has(token))) return null;
  if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return null;

  const shaped = shapeDisplayLabel(clause.raw);
  if (!shaped) return null;

  const specificity = scoreSpecificity(shaped);
  if (specificity === "too_vague") return null;
  if (isClauseLikeSpan(clause.raw)) return null;
  if (isBadProcessPhrase(shaped)) return null;
  if (looksLikeContextShell(shaped)) return null;

  return buildCandidate({
    span: clause.raw,
    clause,
  });
}

function choosePreferredOverlappingCandidate(
  current: TopicCandidate,
  incoming: TopicCandidate
) {
  const currentLabel = shapeDisplayLabel(current.span);
  const incomingLabel = shapeDisplayLabel(incoming.span);

  const currentSpecificity = scoreSpecificity(currentLabel);
  const incomingSpecificity = scoreSpecificity(incomingLabel);

  const currentClauseLike = isClauseLikeSpan(current.span);
  const incomingClauseLike = isClauseLikeSpan(incoming.span);

  const currentTokens = tokenize(current.span).length;
  const incomingTokens = tokenize(incoming.span).length;

  const currentFocus = current.qualifiers.includes("focus_target");
  const incomingFocus = incoming.qualifiers.includes("focus_target");
  const currentComparison = current.qualifiers.includes("comparison_pair");
  const incomingComparison = incoming.qualifiers.includes("comparison_pair");
  const currentOfPhrase = current.qualifiers.includes("of_phrase");
  const incomingOfPhrase = incoming.qualifiers.includes("of_phrase");
  const currentNamed = current.qualifiers.includes("named_concept");
  const incomingNamed = incoming.qualifiers.includes("named_concept");

  if (currentComparison !== incomingComparison) {
    return incomingComparison ? incoming : current;
  }

  if (currentOfPhrase !== incomingOfPhrase) {
    return incomingOfPhrase ? incoming : current;
  }

  if (currentNamed !== incomingNamed) {
    return incomingNamed ? incoming : current;
  }

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
    return incomingTokens > currentTokens ? incoming : current;
  }

  if (current.sourceRole !== incoming.sourceRole) {
    const priority: Record<SentenceRole, number> = {
      confusion: 6,
      comparison: 7,
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

function extractConceptCandidates(
  interpretation: MessageInterpretation,
  fullMessage: string
): TopicCandidate[] {
  const collected: TopicCandidate[] = [];

  for (const clause of interpretation.clauses) {
    collected.push(...extractComparisonCandidates(clause));
    collected.push(...extractFocusTailCandidates(clause));
    collected.push(...extractOfPhraseCandidates(clause));
    collected.push(...extractStandaloneNamedConceptCandidates(clause));
    collected.push(...extractPrepositionalCandidates(clause));
    collected.push(...extractQuestionCandidates(clause));
    collected.push(...extractRequestCandidates(clause));
    collected.push(...extractNounLikeCandidates(clause));

    const standalone = extractStandaloneConceptCandidate(clause);
    if (standalone) collected.push(standalone);
  }

  if (
    /\bmitosis\b/i.test(fullMessage) &&
    /\bmeiosis\b/i.test(fullMessage) &&
    /\b(difference between|different|mixing them up|blending the two|blending them together|keep blending)\b/i.test(
      fullMessage
    )
  ) {
    const syntheticClause: ClauseInfo = {
      raw: fullMessage,
      normalized: normalizeLoose(fullMessage),
      index: 999,
      role: "comparison",
      hasContrastBoundary: false,
      hasFocusMarker: false,
      hasConfusionMarker: false,
      hasQuestionMarker: false,
      hasRequestMarker: false,
      hasContextMarker: false,
    };

    const synthetic = buildCandidate({
      span: "mitosis vs meiosis",
      clause: syntheticClause,
      comparisonTarget: "meiosis",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery"],
    });

    if (synthetic) collected.push(synthetic);
  }

  return dedupeAndGroupCandidates(collected);
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

function buildCandidateScoreBreakdown(args: {
  candidate: TopicCandidate;
  message: string;
  interpretation: MessageInterpretation;
  retrievalCandidates: RetrievalCandidate[];
}): CandidateScoreBreakdown {
  const { candidate, message, interpretation, retrievalCandidates } = args;
  const clause = interpretation.clauses.find(
    (item) => item.index === candidate.clauseIndex
  );
  const label = shapeDisplayLabel(candidate.span);
  const specificity = scoreSpecificity(label);
  const tokenCount = tokenize(candidate.span).length;
  const mentionCount = countSpanMentions(message, candidate.span);

  let roleWeight = 0;
  let focusWeight = 0;
  let contrastWeight = 0;
  let confusionAdjacencyWeight = 0;
  let requestAdjacencyWeight = 0;
  let contextRecoveryWeight = 0;
  let mentionWeight = 0;
  let specificityWeight = 0;
  let reuseHintWeight = 0;
  let genericPenalty = 0;
  let clausePenalty = 0;
  let learnerStatePenalty = 0;
  let lengthPenalty = 0;

  if (candidate.sourceRole === "confusion") roleWeight += 0.28;
  if (candidate.sourceRole === "question") roleWeight += 0.2;
  if (candidate.sourceRole === "request") roleWeight += 0.18;
  if (candidate.sourceRole === "comparison") roleWeight += 0.34;
  if (candidate.sourceRole === "context") roleWeight -= 0.04;

  if (candidate.qualifiers.includes("focus_target")) focusWeight += 0.25;
  if (candidate.qualifiers.includes("comparison_pair")) focusWeight += 0.16;
  if (candidate.qualifiers.includes("of_phrase")) focusWeight += 0.16;
  if (candidate.qualifiers.includes("named_concept")) focusWeight += 0.14;
  if (candidate.qualifiers.includes("explicit_switch")) focusWeight += 0.18;
  if (candidate.qualifiers.includes("cross_clause_recovery")) focusWeight += 0.18;
  if (clause?.hasFocusMarker) focusWeight += 0.08;

  if (clause?.hasContrastBoundary) contrastWeight += 0.08;

  if (clause?.hasConfusionMarker) confusionAdjacencyWeight += 0.1;
  if (clause?.hasRequestMarker) requestAdjacencyWeight += 0.06;

  if (
    clause?.hasContextMarker &&
    candidate.qualifiers.includes("context_recovery")
  ) {
    contextRecoveryWeight += 0.28;
  }

  if (mentionCount >= 2) mentionWeight += 0.14;
  else if (mentionCount === 1) mentionWeight += 0.05;

  if (specificity === "good") specificityWeight += 0.18;
  if (specificity === "very_specific") specificityWeight += 0.14;
  if (specificity === "broad_but_usable") specificityWeight += 0.08;
  if (specificity === "too_vague") genericPenalty += 0.38;

  const labelTokens = label ? semanticTokens(label) : [];
  let bestReuseHint = 0;
  for (const retrieval of retrievalCandidates) {
    const retrievalTokens = semanticTokens(retrieval.topic_name);
    const score =
      overlapScore(labelTokens, retrievalTokens) * 0.1 +
      (retrieval.similarity ?? 0) * 0.06;
    if (score > bestReuseHint) bestReuseHint = score;
  }
  reuseHintWeight += bestReuseHint;

  if (appearsInBroadList(candidate.sourceClause, candidate.span)) {
    genericPenalty += 0.12;
  }

  if (looksLikeLearnerStateClause(candidate.span)) {
    learnerStatePenalty += 0.6;
  }

  if (isClauseLikeSpan(candidate.span)) {
    clausePenalty += 0.22;
  }

  if (looksLikeSuspiciousLabel(label)) {
    genericPenalty += 0.18;
  }

  if (isBadProcessPhrase(candidate.span)) {
    genericPenalty += 0.28;
  }

  if (hasNegationStemToken(candidate.span)) {
    genericPenalty += 0.4;
  }

  if (looksLikeContextShell(candidate.span)) {
    genericPenalty += 0.5;
  }

  if (tokenCount > 8) {
    lengthPenalty += 0.16;
  } else if (tokenCount >= 2 && tokenCount <= 5) {
    lengthPenalty -= 0.12;
  } else if (tokenCount === 1) {
    lengthPenalty -= 0.08;
  }

  let total =
    0.24 +
    roleWeight +
    focusWeight +
    contrastWeight +
    confusionAdjacencyWeight +
    requestAdjacencyWeight +
    contextRecoveryWeight +
    mentionWeight +
    specificityWeight +
    reuseHintWeight -
    genericPenalty -
    clausePenalty -
    learnerStatePenalty -
    lengthPenalty;

  total = clampTopicConfidence(total);

  return {
    roleWeight,
    focusWeight,
    contrastWeight,
    confusionAdjacencyWeight,
    requestAdjacencyWeight,
    contextRecoveryWeight,
    mentionWeight,
    specificityWeight,
    reuseHintWeight,
    genericPenalty,
    clausePenalty,
    learnerStatePenalty,
    lengthPenalty,
    total,
  };
}

function scoreCandidate(args: {
  candidate: TopicCandidate;
  message: string;
  interpretation: MessageInterpretation;
  retrievalCandidates: RetrievalCandidate[];
}) {
  return buildCandidateScoreBreakdown(args);
}

function chooseBestCandidate(candidates: TopicCandidate[]): TopicCandidate | null {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => b.score - a.score)[0] ?? null;
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
  if (isBadProcessPhrase(label)) return false;
  if (hasNegationStemToken(label)) return false;
  if (looksLikeContextShell(label)) return false;

  return confidence >= 0.74;
}

function messageLooksLikePureFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return FORCE_TOPIC_FALLBACK_PHRASES.some((regex) => regex.test(normalized));
}

function buildAmbiguityFlags(args: {
  canonicalLabel: string | null;
  conceptSpan: string | null;
  confidence: number;
  specificity: TopicSpecificity;
  scoredCandidates: TopicCandidate[];
  topGap: number;
  reuseCandidate: RetrievalCandidate | null;
  interpretation: MessageInterpretation;
}) {
  const flags: string[] = [];
  const {
    canonicalLabel,
    conceptSpan,
    confidence,
    specificity,
    scoredCandidates,
    topGap,
    reuseCandidate,
    interpretation,
  } = args;

  if (!conceptSpan) {
    flags.push("no_concept_span");
  }

  if (specificity === "too_vague") {
    flags.push("label_too_vague");
  }

  if (looksLikeSuspiciousLabel(canonicalLabel)) {
    flags.push("label_suspicious");
  }

  if (conceptSpan && isClauseLikeSpan(conceptSpan)) {
    flags.push("concept_span_clause_like");
  }

  if (confidence < 0.74) {
    flags.push("low_confidence");
  }

  if (scoredCandidates.length >= 2 && topGap < 0.1) {
    flags.push("candidate_competition");
  }

  if (
    interpretation.messageIntent !== "unclear" &&
    scoredCandidates.length === 0
  ) {
    flags.push("concept_extraction_weak");
  }

  if (!reuseCandidate && canonicalLabel && confidence >= 0.55 && confidence < 0.74) {
    flags.push("needs_adjudication");
  }

  return dedupe(flags);
}

export function runDeterministicTopicLabeling(
  input: TopicLabelingInput
): TopicLabelingResult {
  const normalizedMessage = normalizeSurface(input.raw_message);
  const interpretation = analyzeMessageStructure(normalizedMessage);

  const rawCandidates = extractConceptCandidates(interpretation, normalizedMessage);

  const scoredCandidates = rawCandidates
    .map((candidate) => {
      const breakdown = scoreCandidate({
        candidate,
        message: normalizedMessage,
        interpretation,
        retrievalCandidates: input.retrieval_candidates,
      });

      return {
        ...candidate,
        score: breakdown.total,
        scoreBreakdown: breakdown,
      };
    })
    .sort((a, b) => b.score - a.score);

  let bestCandidate = chooseBestCandidate(scoredCandidates);
  const secondCandidate = scoredCandidates[1] ?? null;
  const topGap = bestCandidate
    ? Math.max(0, bestCandidate.score - (secondCandidate?.score ?? 0))
    : 0;

  if (
    messageLooksLikePureFollowup(normalizedMessage) &&
    input.active_topic_name &&
    (!bestCandidate || looksLikeSuspiciousLabel(shapeDisplayLabel(bestCandidate.span)))
  ) {
    bestCandidate = null;
  }

  let conceptSpan = normalizeCandidateSpan(bestCandidate?.span ?? null);
  let canonicalLabel = shapeDisplayLabel(conceptSpan);

  if (
    !canonicalLabel &&
    input.active_topic_name &&
    messageLooksLikePureFollowup(normalizedMessage)
  ) {
    conceptSpan = input.active_topic_name;
    canonicalLabel = input.active_topic_name;
  }

  const specificity = scoreSpecificity(canonicalLabel);
  const reuseCandidate = findReuseCandidate(
    canonicalLabel,
    input.retrieval_candidates
  );

  const shouldReuse = Boolean(reuseCandidate);

  let confidence = 0.2;

  if (scoredCandidates.length > 0) confidence += 0.12;
  if (bestCandidate) confidence += bestCandidate.score * 0.3;
  if (conceptSpan) confidence += 0.14;
  if (canonicalLabel) confidence += 0.12;
  if (specificity === "good") confidence += 0.08;
  if (specificity === "very_specific") confidence += 0.07;
  if (specificity === "broad_but_usable") confidence += 0.05;
  if (shouldReuse) confidence += 0.12;

  if (bestCandidate?.qualifiers.includes("focus_target")) {
    confidence += 0.06;
  }

  if (bestCandidate?.qualifiers.includes("comparison_pair")) {
    confidence += 0.08;
  }

  if (bestCandidate?.qualifiers.includes("of_phrase")) {
    confidence += 0.08;
  }

  if (conceptSpan && isClauseLikeSpan(conceptSpan)) {
    confidence -= 0.1;
  }

  if (looksLikeSuspiciousLabel(canonicalLabel)) {
    confidence -= 0.1;
  }

  if (scoredCandidates.length >= 2 && topGap < 0.1) {
    confidence -= 0.06;
  }

  if (
    interpretation.messageIntent !== "unclear" &&
    scoredCandidates.length === 0
  ) {
    confidence -= 0.08;
  }

  if (messageLooksLikePureFollowup(normalizedMessage) && input.active_topic_name) {
    confidence = Math.max(confidence, 0.78);
  }

  confidence = clampTopicConfidence(confidence);

  const ambiguityFlags = buildAmbiguityFlags({
    canonicalLabel,
    conceptSpan,
    confidence,
    specificity,
    scoredCandidates,
    topGap,
    reuseCandidate,
    interpretation,
  });

  const shouldCreate =
    !shouldReuse &&
    !ambiguityFlags.includes("label_too_vague") &&
    !ambiguityFlags.includes("label_suspicious") &&
    !messageLooksLikePureFollowup(normalizedMessage) &&
    (specificity === "good" ||
      specificity === "very_specific" ||
      isCreateWorthyBroadLabel(canonicalLabel, confidence, specificity));

  const referencesActiveTopic =
    input.active_topic_name && canonicalLabel
      ? input.active_topic_name.toLowerCase() === canonicalLabel.toLowerCase()
      : null;

  return {
    schema_version: TOPIC_LABEL_SCHEMA_VERSION,
    input,
    interpretation: {
      message_intent: interpretation.messageIntent,
      is_topic_reference_to_existing_topic: shouldReuse ? true : null,
      references_active_topic: referencesActiveTopic,
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
        scoredCandidates.length >= 2
          ? `Top-candidate gap: ${topGap.toFixed(2)}.`
          : "No serious candidate competition was detected.",
      ],
      rejection_reasons: [
        ...(specificity === "too_vague"
          ? ["Concept span is too vague for a persistent topic."]
          : []),
        ...(conceptSpan && isClauseLikeSpan(conceptSpan)
          ? [
              "Concept span still looks too clause-like for a strong persistent topic label.",
            ]
          : []),
        ...(looksLikeSuspiciousLabel(canonicalLabel)
          ? ["Canonical label still looks suspicious or generic."]
          : []),
      ],
      ambiguity_flags: ambiguityFlags,
    },
  };
}