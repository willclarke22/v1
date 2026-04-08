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
    m.includes("struggling with") ||
    m.includes("i don't get it") ||
    m.includes("i dont get it")
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
    s.includes("struggling with") ||
    s.includes("i don't get it") ||
    s.includes("i dont get it")
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
    normalized === "don t get it" ||
    normalized === "dont get it" ||
    normalized === "don t understand it" ||
    normalized === "dont understand it"
  );
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

  if (looksLikeLearnerStateClause(output)) {
    return null;
  }

  return output || null;
}

function canonicalizeLabel(span: string | null) {
  const cleaned = cleanupSpan(span);
  if (!cleaned) return null;

  const normalized = cleaned
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

function extractStandaloneConceptCandidate(sentence: string): TopicCandidate | null {
  const normalized = normalizeSurface(sentence);
  const role = classifySentenceRole(normalized);
  const tokens = tokenize(normalized);

  if (!tokens.length || tokens.length > 5) return null;

  const cleaned = cleanupSpan(normalized);
  if (!cleaned) return null;

  const label = canonicalizeLabel(cleaned);
  const specificity = scoreSpecificity(label);

  if (specificity === "too_vague") return null;

  return buildCandidate(cleaned, normalized, role, null, null, []);
}

function extractTailConceptCandidate(sentence: string): TopicCandidate | null {
  const normalized = normalizeSurface(sentence);

  const tailPatterns: RegExp[] = [
    /(?:learn about|understand|review|study)\s+(.+?)[.?!]*$/i,
    /(?:confused about|struggling with|help me understand)\s+(.+?)[.?!]*$/i,
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
      []
    );

    if (candidate) return candidate;
  }

  return null;
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

  const directPatterns: Array<{
    regex: RegExp;
    conceptGroup: number;
    questionBuilder?: (match: RegExpMatchArray) => string | null;
  }> = [
    {
      regex:
        /^(?:i don't really understand|i dont really understand|i don't understand|i dont understand|i'm confused about|i am confused about|help me understand)\s+(.+?)(?:\s+at all)?[.?!]*$/i,
      conceptGroup: 1,
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
      regex: /^does\s+(.+?)\s+(affect|influence|change|cause)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
    },
    {
      regex: /^(?:what is|what are|how does|how do)\s+(.+?)[?]*$/i,
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
      []
    );

    if (candidate) candidates.push(candidate);
  }

  const embeddedPatterns: RegExp[] = [
    /\b(?:formula|equation|graph|section|chapter|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\bhas\s+a\s+(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\bit says\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\babout\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\bregarding\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\bmainly confused about\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
    /\bconfused about\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
  ];

  for (const regex of embeddedPatterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const raw = normalizeSurface(match[1] ?? "");
    const refined =
      raw.match(/^(?:the\s+)?(.+?)\s+(?:formula|equation)$/i)?.[1] ??
      raw.match(
        /^(.+?)\s+(?:for learning|in the brain|in physics|in biology)$/i
      )?.[1] ??
      raw;

    const candidate = buildCandidate(refined, normalized, role, null, null, []);
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
    /\b(?:don't understand|dont understand|confused|don't get it|dont get it)\b/i.test(
      fullMessage
    )
  ) {
    score += 0.06;
  }

  if (looksLikeLearnerStateClause(candidate.span)) {
    score -= 0.6;
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

  return collected;
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

  confidence = clampTopicConfidence(confidence);

  const shouldCreate =
    !shouldReuse &&
    (
      specificity === "good" ||
      specificity === "very_specific" ||
      isCreateWorthyBroadLabel(canonicalLabel, confidence, specificity)
    );

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
          ? `Generated ${scoredCandidates.length} candidate topic spans.`
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
          : [],
      ambiguity_flags:
        confidence < 0.75
          ? ["low_confidence_labeling"]
          : [],
    },
  };
}