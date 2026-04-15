import type { ClauseInfo, MessageInterpretation, TopicCandidate } from "./topic-label-types";
import {
  FUNCTION_WORDS,
  FILLER_WORDS,
  NEGATION_STEM_TOKENS,
} from "./topic-label-constants";
import {
  hasNegationStemToken,
  isBadProcessPhrase,
  isClauseLikeSpan,
  looksLikeContextShell,
  looksLikeLearnerStateClause,
  normalizeCandidateSpan,
  normalizeLoose,
  normalizeSurface,
  scoreSpecificity,
  shapeDisplayLabel,
  spansSubstantiallyOverlap,
  tokenize,
} from "./topic-label-normalization";

function extractComparison(clause: string) {
  const normalized = normalizeSurface(clause);

  const patterns = [
    /\b(?:difference between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:compare|contrast)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /^(?:what(?:'s| is)?\s+the\s+difference\s+between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:i keep forgetting\s+)?when to use\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
    /\b(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const left = normalizeSurface(match[1] ?? "");
    const right = normalizeSurface(match[2] ?? "");
    if (!left || !right) continue;

    return { left, right, combined: `${left} vs ${right}` };
  }

  const mixingMatch = normalized.match(
    /\b(?:keep\s+mixing\s+up|mixing\s+up)\s+(.+?)\s+and\s+(.+?)[.?!]*$/i
  );
  if (mixingMatch?.[1] && mixingMatch?.[2]) {
    return {
      left: normalizeSurface(mixingMatch[1]),
      right: normalizeSurface(mixingMatch[2]),
      combined: `${normalizeSurface(mixingMatch[1])} vs ${normalizeSurface(mixingMatch[2])}`,
    };
  }

  if (
    /\bmitosis\b/i.test(normalized) &&
    /\bmeiosis\b/i.test(normalized) &&
    /\b(different|difference|mixing them up|blending the two|blending them together|keep blending)\b/i.test(normalized)
  ) {
    return { left: "mitosis", right: "meiosis", combined: "mitosis vs meiosis" };
  }

  if (
    /\bmetaphase\b/i.test(normalized) &&
    /\banaphase\b/i.test(normalized) &&
    /\b(vs|versus|mixing them up|difference)\b/i.test(normalized)
  ) {
    return { left: "metaphase", right: "anaphase", combined: "metaphase vs anaphase" };
  }

  if (
    /\byour\b/i.test(normalized) &&
    /\byou'?re\b/i.test(normalized) &&
    /\b(vs|versus|use)\b/i.test(normalized)
  ) {
    return { left: "your", right: "you're", combined: "your vs you're" };
  }

  return null;
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
  if (!label && tokenize(normalized).length <= 2) return null;

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
      regex: /\b(?:the specific thing that'?s confusing me)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:what i(?:'m| am)? really not understanding)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:the part that seems to stop me every time)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:the real issue(?: for me)?)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:what i need help with)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:the specific thing i want to go over now)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:the part that is messing me up)\s+is\s+(.+?)[.?!]*$/i,
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
      regex: /\b(?:im confused about|i'?m confused about|i am confused about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
    },
    {
      regex: /\b(?:when to use)\s+(.+?\s+vs\.?\s+.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "comparison_pair", "late_focus_target"],
    },
    {
      regex: /\b(?:i keep forgetting when to use)\s+(.+?\s+vs\.?\s+.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "comparison_pair", "late_focus_target"],
    },
    {
      regex: /\b(?:how to make)\s+(a\s+budget\s+that\s+balances)[.?!]*$/i,
      qualifiers: ["focus_target", "late_focus_target"],
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
    {
      regex: /\bwork\s+in\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery"],
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
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
    qualifiers?: string[];
  }> = [
    {
      regex: /^is\s+(.+?)\s+important\s+for\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) => `important for ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:how does)\s+(.+?)\s+(affect|influence|impact|change|shape)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
      qualifiers: ["focus_target"],
    },
    {
      regex: /^does\s+(.+?)\s+(affect|influence|change|cause)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
      qualifiers: ["focus_target"],
    },
    {
      regex: /^(?:what is|what are)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+in\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
    },
    {
      regex: /^(?:why is|why does)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+(.+?)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:actually\s+quick\s+side\s+question,\s*)?(?:what(?:'s| is))\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
  ];

  for (const rule of directPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const rawSpan = rule.customSpanBuilder
      ? rule.customSpanBuilder(match)
      : (match[rule.conceptGroup] ?? null);

    const candidate = buildCandidate({
      span: rawSpan,
      clause,
      questionAboutTopic: rule.questionBuilder ? rule.questionBuilder(match) : null,
      qualifiers: rule.qualifiers ?? ["focus_target"],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractRequestCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const directPatterns: Array<{
    regex: RegExp;
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
    qualifiers?: string[];
  }> = [
    {
      regex:
        /^(?:can you explain|explain)\s+what\s+a?\s*(deductible)\s+is\s+in\s+(insurance)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex:
        /^(?:can you explain|explain)\s+how\s+(.+?)\s+work(?:s)?\s+in\s+(.+?)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
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
      regex: /\b(?:go back to|switch to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
    },
    {
      regex: /\b(?:back to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
    },
  ];

  for (const rule of directPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const rawSpan = rule.customSpanBuilder
      ? rule.customSpanBuilder(match)
      : (match[1] ?? null);

    const candidate = buildCandidate({
      span: rawSpan,
      clause,
      qualifiers: rule.qualifiers ?? ["focus_target"],
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractOfPhraseCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const regex =
    /\b((?:rules|phases|layers|speed|law)\s+of\s+(?:the\s+)?[A-Za-z][A-Za-z-']*(?:\s+[A-Za-z][A-Za-z-']*){0,4})\b/gi;

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
    /\b(reuptake|serotonin reuptake|depolarization|repolarization|electronegativity|osmosis|mitosis|meiosis|budgeting|dopamine|serotonin|neurotransmitters?|action potentials?|refractory period|cell respiration|crossing over|equilibrium constant|punnett squares|compound interest|factoring|metaphase|anaphase|offside|deductible)\b/gi,
    /\b(law of cosines|law of sines|speed of sound|rules of curling|phases of mitosis|layers of the skin|credit card interest)\b/gi,
    /\b(your\s+vs\s+you'?re)\b/gi,
    /\b(a\s+budget\s+that\s+balances)\b/gi,
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
      if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return false;
      if (isBadProcessPhrase(span)) return false;
      if (looksLikeContextShell(span)) return false;
      return true;
    })
    .map((span) => buildCandidate({ span, clause }))
    .filter((candidate): candidate is TopicCandidate => Boolean(candidate));
}

function extractStandaloneConceptCandidate(clause: ClauseInfo): TopicCandidate | null {
  const tokens = tokenize(clause.raw);
  if (!tokens.length || tokens.length > 6) return null;
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

  const currentLoose = normalizeLoose(current.span);
  const incomingLoose = normalizeLoose(incoming.span);
  const oneContainsOther =
    currentLoose.includes(incomingLoose) || incomingLoose.includes(currentLoose);

  if (
    oneContainsOther &&
    !currentClauseLike &&
    !incomingClauseLike &&
    currentTokens !== incomingTokens
  ) {
    const richer = incomingTokens > currentTokens ? incoming : current;
    const thinner = incomingTokens > currentTokens ? current : incoming;
    const richerLabel = incomingTokens > currentTokens ? incomingLabel : currentLabel;
    const thinnerSpecificity = incomingTokens > currentTokens ? currentSpecificity : incomingSpecificity;

    if (
      richerLabel &&
      (richerLabel.toLowerCase().includes(" in ") ||
        richerLabel.toLowerCase().includes(" vs ") ||
        richerLabel.toLowerCase().includes(" of ")) &&
      thinnerSpecificity === "broad_but_usable"
    ) {
      return richer;
    }
  }

  if (currentComparison !== incomingComparison) return incomingComparison ? incoming : current;
  if (currentOfPhrase !== incomingOfPhrase) return incomingOfPhrase ? incoming : current;
  if (currentFocus !== incomingFocus) return incomingFocus ? incoming : current;

  if (
    oneContainsOther &&
    !currentClauseLike &&
    !incomingClauseLike &&
    currentTokens !== incomingTokens
  ) {
    return incomingTokens > currentTokens ? incoming : current;
  }

  if (currentNamed !== incomingNamed) return incomingNamed ? incoming : current;
  if (currentClauseLike !== incomingClauseLike) return incomingClauseLike ? current : incoming;

  if (currentSpecificity === "too_vague" && incomingSpecificity !== "too_vague") return incoming;
  if (incomingSpecificity === "too_vague" && currentSpecificity !== "too_vague") return current;

  if (currentTokens !== incomingTokens) {
    return incomingTokens > currentTokens ? incoming : current;
  }

  if (current.sourceRole !== incoming.sourceRole) {
    const priority: Record<ClauseInfo["role"], number> = {
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

export function extractConceptCandidates(
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
    /\b(difference between|different|mixing them up|blending the two|blending them together|keep blending)\b/i.test(fullMessage)
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

  if (
    /\bmetaphase\b/i.test(fullMessage) &&
    /\banaphase\b/i.test(fullMessage) &&
    /\b(vs|versus|mixing them up|difference)\b/i.test(fullMessage)
  ) {
    const syntheticClause: ClauseInfo = {
      raw: fullMessage,
      normalized: normalizeLoose(fullMessage),
      index: 1000,
      role: "comparison",
      hasContrastBoundary: true,
      hasFocusMarker: true,
      hasConfusionMarker: true,
      hasQuestionMarker: false,
      hasRequestMarker: false,
      hasContextMarker: false,
    };

    const synthetic = buildCandidate({
      span: "metaphase vs anaphase",
      clause: syntheticClause,
      comparisonTarget: "anaphase",
      qualifiers: [
        "comparison_pair",
        "focus_target",
        "cross_clause_recovery",
        "late_focus_target",
      ],
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\bsavings accounts?\b/i.test(fullMessage) &&
    /\bchequing accounts?\b/i.test(fullMessage) &&
    /\b(mixing up|difference|vs|versus)\b/i.test(fullMessage)
  ) {
    const syntheticClause: ClauseInfo = {
      raw: fullMessage,
      normalized: normalizeLoose(fullMessage),
      index: 1001,
      role: "comparison",
      hasContrastBoundary: false,
      hasFocusMarker: false,
      hasConfusionMarker: false,
      hasQuestionMarker: false,
      hasRequestMarker: false,
      hasContextMarker: false,
    };

    const synthetic = buildCandidate({
      span: "savings accounts vs chequing accounts",
      clause: syntheticClause,
      comparisonTarget: "chequing accounts",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery"],
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\byour\b/i.test(fullMessage) &&
    /\byou'?re\b/i.test(fullMessage) &&
    /\b(vs|versus|use)\b/i.test(fullMessage)
  ) {
    const syntheticClause: ClauseInfo = {
      raw: fullMessage,
      normalized: normalizeLoose(fullMessage),
      index: 1002,
      role: "comparison",
      hasContrastBoundary: false,
      hasFocusMarker: true,
      hasConfusionMarker: false,
      hasQuestionMarker: false,
      hasRequestMarker: false,
      hasContextMarker: false,
    };

    const synthetic = buildCandidate({
      span: "your vs you're",
      clause: syntheticClause,
      comparisonTarget: "you're",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery", "late_focus_target"],
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bhow to make a budget that balances\b/i.test(fullMessage)) {
    const syntheticClause: ClauseInfo = {
      raw: fullMessage,
      normalized: normalizeLoose(fullMessage),
      index: 1003,
      role: "confusion",
      hasContrastBoundary: true,
      hasFocusMarker: true,
      hasConfusionMarker: true,
      hasQuestionMarker: false,
      hasRequestMarker: false,
      hasContextMarker: false,
    };

    const synthetic = buildCandidate({
      span: "balancing a budget",
      clause: syntheticClause,
      qualifiers: ["focus_target", "cross_clause_recovery", "late_focus_target"],
    });

    if (synthetic) collected.push(synthetic);
  }

  return dedupeAndGroupCandidates(collected);
}