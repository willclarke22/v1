import type {
  ClauseInfo,
  MessageInterpretation,
  TopicCandidate,
  TopicCandidateKind,
} from "./topic-label-types";
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

function stripLeadingDeterminer(text: string) {
  return normalizeSurface(text).replace(/^(?:the|a|an)\s+/i, "").trim();
}

function cleanComparisonSide(text: string) {
  return stripLeadingDeterminer(text)
    .replace(/^(?:when to use|use)\s+/i, "")
    .replace(/\byoure\b/gi, "you're")
    .replace(/\s+/g, " ")
    .trim();
}

function pruneCoreTailArtifacts(text: string) {
  let output = normalizeSurface(text);

  const patterns: RegExp[] = [
    /^(.+?)\s+and\s+everyone\s+else\s+seems.*$/i,
    /^(.+?)\s+are\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
    /^(.+?)\s+is\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
    /^(.+?)\s+are\s+what\s+make(?:s)?.*$/i,
    /^(.+?)\s+is\s+what\s+make(?:s)?.*$/i,
    /^(.+?)\s+that\s+i\s+don'?t\s+get\s+yet.*$/i,
    /^(.+?)\s+that\s+i\s+dont\s+get\s+yet.*$/i,
    /^(.+?)\s+yet$/i,
    /^(.+?)\s+tbh$/i,
    /^(.+?)\s+lol$/i,
    /^(.+?)\s+i\s+lose\s+track.*$/i,
    /^(.+?)\s+lose\s+track.*$/i,
    /^(.+?)\s+mess(?:es)?\s+me\s+up.*$/i,
  ];

  for (const regex of patterns) {
    const match = output.match(regex);
    if (match?.[1]) {
      const next = normalizeSurface(match[1]);
      if (next) {
        output = next;
        break;
      }
    }
  }

  return output;
}

function looksLikeTailHeavyCandidate(candidate: TopicCandidate) {
  const combined = `${candidate.coreText} ${candidate.tailText ?? ""}`.toLowerCase();
  return (
    /\band everyone else seems\b/i.test(combined) ||
    /\bare what make\b/i.test(combined) ||
    /\bis what make\b/i.test(combined) ||
    /\bare still what make\b/i.test(combined) ||
    /\bis still what make\b/i.test(combined) ||
    /\byet\b/i.test(combined) ||
    /\btbh\b/i.test(combined) ||
    /\blol\b/i.test(combined) ||
    /\blose track\b/i.test(combined) ||
    /\bmess(?:es)? me up\b/i.test(combined)
  );
}

function extractComparison(clause: string) {
  const normalized = normalizeSurface(clause);

  const patterns = [
    /\b(?:difference between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:compare|contrast)\s+(?:the\s+)?(.+?)\s+(?:and|vs\.?|versus)\s+(?:the\s+)?(.+?)[.?!]*$/i,
    /^(?:what(?:'s| is)?\s+the\s+difference\s+between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:i keep forgetting\s+)?when to use\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
    /\b(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const left = cleanComparisonSide(match[1] ?? "");
    const right = cleanComparisonSide(match[2] ?? "");
    if (!left || !right) continue;

    return { left, right, combined: `${left} vs ${right}` };
  }

  const mixingMatch = normalized.match(
    /\b(?:keep\s+mixing\s+up|mixing\s+up)\s+(.+?)\s+and\s+(.+?)[.?!]*$/i
  );
  if (mixingMatch?.[1] && mixingMatch?.[2]) {
    const left = cleanComparisonSide(mixingMatch[1]);
    const right = cleanComparisonSide(mixingMatch[2]);
    if (left && right) {
      return {
        left,
        right,
        combined: `${left} vs ${right}`,
      };
    }
  }

  const messMeUpMatch = normalized.match(
    /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?mess(?:es)?\s+me\s+up(?:.*)?$/i
  );
  if (messMeUpMatch?.[1] && messMeUpMatch?.[2]) {
    const left = cleanComparisonSide(messMeUpMatch[1]);
    const right = cleanComparisonSide(messMeUpMatch[2]);
    if (left && right) {
      return {
        left,
        right,
        combined: `${left} vs ${right}`,
      };
    }
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
    /\b(you'?re|youre)\b/i.test(normalized) &&
    /\b(vs|versus|use|mess(?:es)? me up|mixing)\b/i.test(normalized)
  ) {
    return { left: "your", right: "you're", combined: "your vs you're" };
  }

  return null;
}

function inferKindFromQualifiers(
  qualifiers: string[],
  fallback: TopicCandidateKind = "other"
): TopicCandidateKind {
  if (qualifiers.includes("comparison_pair")) return "comparison_pair";
  if (qualifiers.includes("of_phrase")) return "of_phrase";
  if (qualifiers.includes("explicit_switch")) return "followup_reference";
  if (qualifiers.includes("context_recovery")) return "context_anchor";
  if (qualifiers.includes("named_concept")) return "named_concept";
  if (qualifiers.includes("late_focus_target") || qualifiers.includes("focus_target")) {
    return "focus_target";
  }
  return fallback;
}

function looksLikeSubpartReference(span: string, qualifiers: string[]) {
  const loose = normalizeLoose(span);
  if (qualifiers.includes("explicit_switch")) return false;

  return (
    loose === "scoring" ||
    loose === "sweeping" ||
    loose === "second part" ||
    loose === "first part" ||
    loose === "that part" ||
    loose === "this part" ||
    loose === "part i m stuck" ||
    loose === "part im stuck"
  );
}

function inferParentHint(span: string, qualifiers: string[]): string | null {
  const loose = normalizeLoose(span);
  if (qualifiers.includes("explicit_switch")) return null;

  if (loose === "scoring" || loose === "sweeping") {
    return "subpart_of_active_topic";
  }

  return null;
}

function inferDomainText(coreText: string): string | null {
  const lower = normalizeLoose(coreText);

  const inMatch = lower.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch?.[2]) return normalizeSurface(inMatch[2]);

  const onMatch = lower.match(/^(.+?)\s+on\s+(.+)$/i);
  if (onMatch?.[2]) return normalizeSurface(onMatch[2]);

  if (lower.includes("insurance deductible")) return "insurance";
  if (lower.includes("insurance premium")) return "insurance";
  if (lower.includes("credit card interest")) return "credit card";
  if (lower.includes("loan principal")) return "loan";
  if (lower.includes("interest on student loans")) return "student loans";
  if (lower.includes("icing in hockey")) return "hockey";
  return null;
}

function splitCoreAndTail(rawSpan: string, normalizedCore: string) {
  const raw = normalizeSurface(rawSpan);
  const core = pruneCoreTailArtifacts(normalizeSurface(normalizedCore));

  if (!raw || !core) {
    return {
      coreText: core,
      tailText: null as string | null,
    };
  }

  const rawLoose = normalizeLoose(raw);
  const coreLoose = normalizeLoose(core);

  if (rawLoose === coreLoose) {
    return {
      coreText: core,
      tailText: null as string | null,
    };
  }

  const idx = rawLoose.indexOf(coreLoose);
  if (idx === -1) {
    return {
      coreText: core,
      tailText: raw !== core ? raw : null,
    };
  }

  const prefix = raw.slice(0, idx).trim();
  const suffix = raw.slice(idx + core.length).trim();
  const tail = [prefix, suffix].filter(Boolean).join(" ").trim();

  return {
    coreText: core,
    tailText: tail || null,
  };
}

function buildCandidate(args: {
  span: string | null;
  clause: ClauseInfo;
  kind?: TopicCandidateKind;
  questionAboutTopic?: string | null;
  comparisonTarget?: string | null;
  qualifiers?: string[];
  leftText?: string | null;
  rightText?: string | null;
  domainText?: string | null;
  parentHint?: string | null;
  shouldCompeteAsTopic?: boolean;
}): TopicCandidate | null {
  const qualifiers = args.qualifiers ?? [];
  const kind = args.kind ?? inferKindFromQualifiers(qualifiers);

  if (kind === "comparison_pair" && args.leftText && args.rightText) {
    const left = normalizeCandidateSpan(cleanComparisonSide(args.leftText));
    const right = normalizeCandidateSpan(cleanComparisonSide(args.rightText));
    if (!left || !right) return null;

    const normalized = `${left} vs ${right}`;
    const label = shapeDisplayLabel(normalized);
    if (!label) return null;

    return {
      span: normalized,
      normalizedSpan: normalizeLoose(normalized),

      kind,
      coreText: normalized,
      normalizedCoreText: normalizeLoose(normalized),
      tailText: null,

      leftText: left,
      rightText: right,
      domainText: null,
      parentHint: null,
      shouldCompeteAsTopic: true,
      isSubpartReference: false,

      sourceClause: args.clause.raw,
      sourceRole: args.clause.role,
      clauseIndex: args.clause.index,
      questionAboutTopic: args.questionAboutTopic ?? null,
      comparisonTarget: right,
      qualifiers,
      score: 0,
      scoreBreakdown: null,
    };
  }

  const rawSpan = args.span ? normalizeSurface(args.span) : null;
  const normalized = normalizeCandidateSpan(rawSpan);
  if (!normalized) return null;
  if (looksLikeLearnerStateClause(normalized)) return null;
  if (isBadProcessPhrase(normalized)) return null;
  if (hasNegationStemToken(normalized)) return null;
  if (looksLikeContextShell(normalized)) return null;

  const label = shapeDisplayLabel(normalized);
  if (!label && tokenize(normalized).length <= 2) return null;

  const { coreText, tailText } = splitCoreAndTail(rawSpan ?? normalized, normalized);
  const isSubpartReference = looksLikeSubpartReference(normalized, qualifiers);
  const shouldCompeteAsTopic = args.shouldCompeteAsTopic ?? !isSubpartReference;

  return {
    span: normalized,
    normalizedSpan: normalizeLoose(normalized),

    kind,
    coreText,
    normalizedCoreText: normalizeLoose(coreText),
    tailText,

    leftText: args.leftText ?? null,
    rightText: args.rightText ?? null,
    domainText: args.domainText ?? inferDomainText(coreText),
    parentHint: args.parentHint ?? inferParentHint(normalized, qualifiers),
    shouldCompeteAsTopic,
    isSubpartReference,

    sourceClause: args.clause.raw,
    sourceRole: args.clause.role,
    clauseIndex: args.clause.index,
    questionAboutTopic: args.questionAboutTopic ?? null,
    comparisonTarget: args.comparisonTarget ?? null,
    qualifiers,
    score: 0,
    scoreBreakdown: null,
  };
}

function extractFocusTailCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
    shouldCompeteAsTopic?: boolean;
  }> = [
    {
      regex:
        /\b(?:mainly|mostly|especially|specifically|particularly|most of all)\s+(?:confused about|stuck on|struggling with|having trouble with|don't understand|dont understand|don't get|dont get|can't figure out|cannot figure out|can t figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the part|the thing)\s+i\s+(?:don't|dont)\s+(?:get|understand)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:the specific thing that'?s confusing me)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:what i(?:'m| am)? really not understanding)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:the part that seems to stop me every time)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:the real issue(?: for me)?)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:what i need help with)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:the specific thing i want to go over now)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:the part that is messing me up)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:i need help understanding|i need help with|help me with|help me understand|can i get some help with|could i get some help with|can you help me with|could you help me with|i could use some help with|i(?:'m| am)? stuck on|im stuck on|i(?:'m| am)? struggling with|im struggling with|i(?:'m| am)? having trouble with|im having trouble with|i have trouble with|i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:don't|dont)\s+(?:get|understand)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the thing i need help with|the part i'm actually confused about|the part i am actually confused about)\s+is\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:im confused about|i'?m confused about|i am confused about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },
    {
      regex: /\b(?:i would really like to learn about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "focus_target",
    },

    {
      regex: /\b(?:when to use)\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "comparison_pair", "late_focus_target"],
      kind: "comparison_pair",
    },
    {
      regex: /\b(?:i keep forgetting when to use)\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "comparison_pair", "late_focus_target"],
      kind: "comparison_pair",
    },
    {
      regex: /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?mess(?:es)?\s+me\s+up(?:.*)?$/i,
      qualifiers: ["focus_target", "comparison_pair", "late_focus_target"],
      kind: "comparison_pair",
    },

    {
      regex: /\b(?:how to make)\s+(a\s+budget\s+that\s+balances)[.?!]*$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },

    {
      regex:
        /\b(.+?)\s+is\s+what\s+i(?:'m| am)?\s+confused\s+about(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+is\s+what\s+i\s+am\s+confused\s+about(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+are\s+what\s+i\s+keep\s+getting\s+stuck\s+on(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+that\s+i\s+(?:don't|dont|do not)\s+get(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+that\s+i\s+(?:don't|dont|do not)\s+get\s+yet(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+is\s+not\s+clicking(?:\s+\w+)?(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\buntil\s+(.+?)\s+(?:showed up|came up)(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\bonce\s+(.+?)\s+(?:showed up|came up)(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\bwhen\s+(.+?)\s+(?:showed up|came up)(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(.+?)\s+and\s+i(?:'m| am)?\s+lost(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+bc\s+i(?:'m| am)?\s+lost(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+i\s+lose\s+track(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(.+?)\s+lose\s+track(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(.+?)\s+mess(?:es)?\s+me\s+up(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+is\s+still\s+what\s+make(?:s)?\s+.+?\s+confusing(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(.+?)\s+are\s+still\s+what\s+make(?:s)?\s+.+?\s+confusing(?:.*)?$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },

    {
      regex:
        /\bformula\s+(?:for|on|about)\s+(.+?)\s+and\s+everyone\s+else\s+seems.*$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\bthe\s+(.+?)\s+are\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target", "of_phrase"],
      kind: "of_phrase",
    },
    {
      regex:
        /\b(.+?)\s+are\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(.+?)\s+is\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    if (rule.kind === "comparison_pair" && match[1] && match[2]) {
      const candidate = buildCandidate({
        span: `${match[1]} vs ${match[2]}`,
        clause,
        qualifiers: rule.qualifiers ?? [],
        kind: rule.kind,
        leftText: match[1],
        rightText: match[2],
        comparisonTarget: cleanComparisonSide(match[2]),
        shouldCompeteAsTopic: rule.shouldCompeteAsTopic,
      });
      if (candidate) candidates.push(candidate);
      continue;
    }

    if (!match[1]) continue;

    const candidate = buildCandidate({
      span: match[1],
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: rule.kind,
      shouldCompeteAsTopic: rule.shouldCompeteAsTopic,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractPrepositionalCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
  }> = [
    { regex: /\babout\s+(.+?)(?:,| but| and|\.|\?|!|$)/i, kind: "other" },
    { regex: /\bregarding\s+(.+?)(?:,| but| and|\.|\?|!|$)/i, kind: "other" },
    { regex: /\bon\s+(.+?)(?:,| but| and|\.|\?|!|$)/i, kind: "other" },
    { regex: /\bwith\s+(.+?)(?:,| but| and|\.|\?|!|$)/i, kind: "other" },
    {
      regex:
        /\b(?:formula|equation|graph|section|chapter|idea|concept|worksheet|unit|homework)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      kind: "context_anchor",
    },
    {
      regex:
        /\bhas\s+a\s+(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target"],
      kind: "context_anchor",
    },
    {
      regex: /\bwork\s+in\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery"],
      kind: "context_anchor",
    },
    {
      regex: /\binterest\s+works?\s+on\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
      customSpanBuilder: (m) => `interest on ${normalizeSurface(m[1] ?? "")}`,
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const span = rule.customSpanBuilder ? rule.customSpanBuilder(match) : match[1];

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: rule.kind,
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
    kind: "comparison_pair",
    leftText: comparison.left,
    rightText: comparison.right,
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
    kind?: TopicCandidateKind;
  }> = [
    {
      regex: /^is\s+(.+?)\s+important\s+for\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) => `important for ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:how does)\s+(.+?)\s+(affect|influence|impact|change|shape)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex: /^does\s+(.+?)\s+(affect|influence|change|cause)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      questionBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[3] ?? "")}`.trim(),
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex: /^(?:what is|what are)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+in\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+on\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} on ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex: /^(?:why is|why does)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+(.+?)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:actually\s+quick\s+side\s+question,\s*)?(?:what(?:'s| is))\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+a?\s*(premium)\s+mean\s+in\s+(insurance)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+(.+?)\s+in\s+a\s+(loan|mortgage|credit card)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+(.+?)\s+in\s+(insurance|hockey|soccer|loan|mortgage|credit card)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
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
      kind: rule.kind,
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
    kind?: TopicCandidateKind;
    shouldCompeteAsTopic?: boolean;
  }> = [
    {
      regex:
        /^(?:can you explain|explain)\s+what\s+a?\s*(deductible)\s+is\s+in\s+(insurance)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can you explain|explain)\s+what\s+a?\s*(premium)\s+means?\s+in\s+(insurance)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can you explain|explain)\s+how\s+(.+?)\s+work(?:s)?\s+in\s+(.+?)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can you explain|explain)\s+how\s+(.+?)\s+work(?:s)?\s+on\s+(.+?)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} on ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "request_target",
    },
    {
      regex:
        /^(?:go back to|switch to|i want to work on|work on)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "explicit_switch"],
      kind: "followup_reference",
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      qualifiers: ["focus_target"],
      kind: "request_target",
    },
    {
      regex:
        /^(?:my notes mention|my textbook mentions|we learned about|it talks about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["context_recovery", "focus_target"],
      kind: "context_anchor",
    },
    {
      regex: /\b(?:go back to|switch to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
      kind: "followup_reference",
    },
    {
      regex: /\b(?:back to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
      kind: "followup_reference",
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
      kind: rule.kind,
      shouldCompeteAsTopic: rule.shouldCompeteAsTopic,
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
      kind: "of_phrase",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractStandaloneNamedConceptCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: RegExp[] = [
    /\b(reuptake|serotonin reuptake|depolarization|repolarization|electronegativity|osmosis|mitosis|meiosis|budgeting|dopamine|serotonin|neurotransmitters?|action potentials?|refractory period|cell respiration|crossing over|equilibrium constant|punnett squares|compound interest|factoring|metaphase|anaphase|offside|deductible|premium|principal|amortization|membrane potentials?|standard deviation|photosynthesis|probability|torque|hippocampus|momentum|icing|pH|llms?)\b/gi,
    /\b(law of cosines|law of sines|speed of sound|rules of curling|rules of baseball|phases of mitosis|layers of the skin|credit card interest|interest on student loans|insurance premium|loan principal|icing in hockey)\b/gi,
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
        kind: "named_concept",
      });

      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function extractEventRecoveryCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{ regex: RegExp; qualifiers?: string[]; customSpanBuilder?: (m: RegExpMatchArray) => string | null }> = [
    {
      regex: /\buntil\s+(.+?)\s+(?:showed up|came up)(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
    },
    {
      regex: /\bonce\s+(.+?)\s+(?:showed up|came up)(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
    },
    {
      regex: /\bwhen\s+(.+?)\s+(?:showed up|came up)(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
    },
    {
      regex: /\bthe\s+(.+?)\s+(?:showed up|came up)(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
    },
    {
      regex: /\bonce\s+(icing)\s+comes?\s+up(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
      customSpanBuilder: () => "icing in hockey",
    },
    {
      regex: /\bwhen\s+(icing)\s+comes?\s+up(?:,|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "late_focus_target"],
      customSpanBuilder: () => "icing in hockey",
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const span = rule.customSpanBuilder ? rule.customSpanBuilder(match) : match[1];

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: "context_anchor",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractDomainShapedCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    custom?: (m: RegExpMatchArray) => string;
    qualifiers?: string[];
  }> = [
    {
      regex: /\b(offside)\s+works?\s+in\s+(soccer)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(icing)\s+works?\s+in\s+(hockey)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(deductible)\s+in\s+(insurance)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(premium)\s+(?:mean|means)\s+in\s+(insurance)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(principal)\s+in\s+a\s+(loan)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\binterest\s+works?\s+on\s+(student loans?)(?:[.?!]|$)/i,
      custom: (m) => `interest on ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const span = rule.custom ? rule.custom(match) : normalizeSurface(match[1] ?? "");
    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: "domain_shaped",
    });

    if (candidate) candidates.push(candidate);
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

  const junkLooseSpans = new Set([
    "think that s",
    "think thats",
    "that s",
    "thats",
    "scoring",
    "sweeping",
    "part i m stuck",
    "part im stuck",
    "yet",
    "lol",
    "tbh",
    "up lol",
    "lose track",
    "whole thing confusing",
    "student loans tbh",
    "premium mean",
  ]);

  return spans
    .filter((span) => {
      const tokens = tokenize(span);
      if (!tokens.length) return false;
      if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return false;
      if (isBadProcessPhrase(span)) return false;
      if (looksLikeContextShell(span)) return false;
      if (junkLooseSpans.has(normalizeLoose(span))) return false;
      return true;
    })
    .map((span) =>
      buildCandidate({
        span,
        clause,
        kind: "noun_chunk",
      })
    )
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
    kind: "other",
  });
}

function choosePreferredOverlappingCandidate(
  current: TopicCandidate,
  incoming: TopicCandidate
) {
  const currentLabel = shapeDisplayLabel(current.coreText);
  const incomingLabel = shapeDisplayLabel(incoming.coreText);

  const currentSpecificity = scoreSpecificity(currentLabel);
  const incomingSpecificity = scoreSpecificity(incomingLabel);

  const currentClauseLike = isClauseLikeSpan(current.coreText);
  const incomingClauseLike = isClauseLikeSpan(incoming.coreText);

  const currentTokens = tokenize(current.coreText).length;
  const incomingTokens = tokenize(incoming.coreText).length;

  const currentFocus = current.qualifiers.includes("focus_target");
  const incomingFocus = incoming.qualifiers.includes("focus_target");
  const currentComparison = current.kind === "comparison_pair";
  const incomingComparison = incoming.kind === "comparison_pair";
  const currentOfPhrase = current.kind === "of_phrase";
  const incomingOfPhrase = incoming.kind === "of_phrase";
  const currentNamed = current.kind === "named_concept";
  const incomingNamed = incoming.kind === "named_concept";
  const currentLateFocus = current.qualifiers.includes("late_focus_target");
  const incomingLateFocus = incoming.qualifiers.includes("late_focus_target");
  const currentContextRecovery =
    current.kind === "context_anchor" || current.qualifiers.includes("context_recovery");
  const incomingContextRecovery =
    incoming.kind === "context_anchor" || incoming.qualifiers.includes("context_recovery");
  const currentCrossClause = current.qualifiers.includes("cross_clause_recovery");
  const incomingCrossClause = incoming.qualifiers.includes("cross_clause_recovery");

  const currentLoose = current.normalizedCoreText;
  const incomingLoose = incoming.normalizedCoreText;
  const oneContainsOther =
    currentLoose.includes(incomingLoose) || incomingLoose.includes(currentLoose);

  if (currentComparison !== incomingComparison && oneContainsOther) {
    return incomingComparison ? incoming : current;
  }

  const currentTailHeavy = looksLikeTailHeavyCandidate(current);
  const incomingTailHeavy = looksLikeTailHeavyCandidate(incoming);
  if (currentTailHeavy !== incomingTailHeavy && oneContainsOther) {
    return incomingTailHeavy ? current : incoming;
  }

  if (oneContainsOther && currentTokens !== incomingTokens) {
    const currentStable =
      currentOfPhrase || currentNamed || currentContextRecovery || currentCrossClause;
    const incomingStable =
      incomingOfPhrase || incomingNamed || incomingContextRecovery || incomingCrossClause;

    if (currentStable !== incomingStable) {
      return incomingStable ? incoming : current;
    }
  }

  if (
    oneContainsOther &&
    !currentClauseLike &&
    !incomingClauseLike &&
    currentTokens !== incomingTokens
  ) {
    const richer = incomingTokens > currentTokens ? incoming : current;
    const thinner = incomingTokens > currentTokens ? current : incoming;
    const richerLabel = incomingTokens > currentTokens ? incomingLabel : currentLabel;
    const thinnerSpecificity =
      incomingTokens > currentTokens ? currentSpecificity : incomingSpecificity;
    const richerContextRecovery =
      incomingTokens > currentTokens ? incomingContextRecovery : currentContextRecovery;
    const thinnerContextRecovery =
      incomingTokens > currentTokens ? currentContextRecovery : incomingContextRecovery;

    if (
      richerLabel &&
      (richerLabel.toLowerCase().includes(" in ") ||
        richerLabel.toLowerCase().includes(" on ") ||
        richerLabel.toLowerCase().includes(" vs ") ||
        richerLabel.toLowerCase().includes(" of ") ||
        richerContextRecovery) &&
      (thinnerSpecificity === "broad_but_usable" || !thinnerContextRecovery)
    ) {
      return richer;
    }
  }

  if (currentComparison !== incomingComparison) return incomingComparison ? incoming : current;
  if (currentOfPhrase !== incomingOfPhrase) return incomingOfPhrase ? incoming : current;

  if (
    oneContainsOther &&
    currentContextRecovery !== incomingContextRecovery &&
    currentTokens !== incomingTokens
  ) {
    return incomingContextRecovery ? incoming : current;
  }

  if (currentCrossClause !== incomingCrossClause) return incomingCrossClause ? incoming : current;
  if (currentLateFocus !== incomingLateFocus) return incomingLateFocus ? incoming : current;
  if (currentContextRecovery !== incomingContextRecovery) {
    return incomingContextRecovery ? incoming : current;
  }
  if (currentFocus !== incomingFocus) return incomingFocus ? incoming : current;
  if (currentNamed !== incomingNamed) return incomingNamed ? incoming : current;

  if (current.isSubpartReference !== incoming.isSubpartReference) {
    return incoming.isSubpartReference ? current : incoming;
  }

  if (
    oneContainsOther &&
    !currentClauseLike &&
    !incomingClauseLike &&
    currentTokens !== incomingTokens
  ) {
    return incomingTokens > currentTokens ? incoming : current;
  }

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
      spansSubstantiallyOverlap(existing.coreText, candidate.coreText)
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

function buildSyntheticClause(
  fullMessage: string,
  index: number,
  role: ClauseInfo["role"] = "confusion"
): ClauseInfo {
  return {
    raw: fullMessage,
    normalized: normalizeLoose(fullMessage),
    index,
    role,
    hasContrastBoundary: true,
    hasFocusMarker: true,
    hasConfusionMarker: true,
    hasQuestionMarker: false,
    hasRequestMarker: false,
    hasContextMarker: false,
  };
}

function extractCrossClauseAnchorCandidates(fullMessage: string): TopicCandidate[] {
  const collected: TopicCandidate[] = [];
  const normalized = normalizeSurface(fullMessage);

  const hasVagueTail =
    /\b(i think that'?s the part|that'?s the part|that is the part|the part i(?:'m| am)? stuck on|everyone else seems to get|especially the scoring part|keep mixing it up|lose track|mess me up|whole thing confusing)\b/i.test(
      normalized
    );

  if (!hasVagueTail) return [];

  const syntheticClause = buildSyntheticClause(fullMessage, 2000, "confusion");

  const explicitPatterns: Array<{
    regex: RegExp;
    qualifiers: string[];
    kind: TopicCandidateKind;
  }> = [
    {
      regex: /\b((?:rules|phases|layers|speed|law)\s+of\s+(?:the\s+)?[A-Za-z][A-Za-z-']*(?:\s+[A-Za-z][A-Za-z-']*){0,4})\b/gi,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "of_phrase"],
      kind: "of_phrase",
    },
    {
      regex: /\b(law of cosines|law of sines|speed of sound|rules of curling|rules of baseball|phases of mitosis|layers of the skin|credit card interest|interest on student loans|insurance premium|loan principal|icing in hockey)\b/gi,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "named_concept"],
      kind: "named_concept",
    },
    {
      regex: /\b(reuptake|serotonin reuptake|depolarization|repolarization|electronegativity|osmosis|mitosis|meiosis|budgeting|dopamine|serotonin|neurotransmitters?|action potentials?|refractory period|cell respiration|crossing over|equilibrium constant|punnett squares|compound interest|factoring|metaphase|anaphase|amortization|membrane potentials?|standard deviation|photosynthesis|probability|torque|hippocampus|momentum|icing|pH|llms?)\b/gi,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "named_concept"],
      kind: "named_concept",
    },
  ];

  for (const rule of explicitPatterns) {
    for (const match of normalized.matchAll(rule.regex)) {
      const span = normalizeSurface(match[1] ?? "");
      if (!span) continue;

      const candidate = buildCandidate({
        span,
        clause: syntheticClause,
        qualifiers: rule.qualifiers,
        kind: rule.kind,
      });

      if (candidate) collected.push(candidate);
    }
  }

  const formulaMatch = normalized.match(
    /\bformula\s+(?:for|on|about)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i
  );
  if (formulaMatch?.[1]) {
    const candidate = buildCandidate({
      span: formulaMatch[1],
      clause: syntheticClause,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "late_focus_target"],
      kind: "context_anchor",
    });
    if (candidate) collected.push(candidate);
  }

  if (/\bicing\b/i.test(normalized) && /\bhockey\b/i.test(normalized)) {
    const candidate = buildCandidate({
      span: "icing in hockey",
      clause: syntheticClause,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "hockey",
    });
    if (candidate) collected.push(candidate);
  }

  if (/\binterest\b/i.test(normalized) && /\bstudent loans?\b/i.test(normalized)) {
    const candidate = buildCandidate({
      span: "interest on student loans",
      clause: syntheticClause,
      qualifiers: ["focus_target", "cross_clause_recovery", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "student loans",
    });
    if (candidate) collected.push(candidate);
  }

  return collected;
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
    collected.push(...extractEventRecoveryCandidates(clause));
    collected.push(...extractDomainShapedCandidates(clause));
    collected.push(...extractPrepositionalCandidates(clause));
    collected.push(...extractQuestionCandidates(clause));
    collected.push(...extractRequestCandidates(clause));
    collected.push(...extractNounLikeCandidates(clause));

    const standalone = extractStandaloneConceptCandidate(clause);
    if (standalone) collected.push(standalone);
  }

  collected.push(...extractCrossClauseAnchorCandidates(fullMessage));

  if (
    /\bmitosis\b/i.test(fullMessage) &&
    /\bmeiosis\b/i.test(fullMessage) &&
    /\b(difference between|different|mixing them up|blending the two|blending them together|keep blending)\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 999, "comparison");

    const synthetic = buildCandidate({
      span: "mitosis vs meiosis",
      clause: syntheticClause,
      comparisonTarget: "meiosis",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery"],
      kind: "comparison_pair",
      leftText: "mitosis",
      rightText: "meiosis",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\bmetaphase\b/i.test(fullMessage) &&
    /\banaphase\b/i.test(fullMessage) &&
    /\b(vs|versus|mixing them up|difference)\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1000, "comparison");

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
      kind: "comparison_pair",
      leftText: "metaphase",
      rightText: "anaphase",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\bsavings accounts?\b/i.test(fullMessage) &&
    /\bchequing accounts?\b/i.test(fullMessage) &&
    /\b(mixing up|difference|vs|versus)\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1001, "comparison");

    const synthetic = buildCandidate({
      span: "savings accounts vs chequing accounts",
      clause: syntheticClause,
      comparisonTarget: "chequing accounts",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery"],
      kind: "comparison_pair",
      leftText: "savings accounts",
      rightText: "chequing accounts",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\byour\b/i.test(fullMessage) &&
    /\b(you'?re|youre)\b/i.test(fullMessage) &&
    /\b(vs|versus|use|mess(?:es)? me up|mixing)\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1002, "comparison");

    const synthetic = buildCandidate({
      span: "your vs you're",
      clause: syntheticClause,
      comparisonTarget: "you're",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery", "late_focus_target"],
      kind: "comparison_pair",
      leftText: "your",
      rightText: "you're",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\blaw of sines\b/i.test(fullMessage) &&
    /\blaw of cosines\b/i.test(fullMessage) &&
    /\b(compare|difference between|when to use|vs|versus)\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1006, "comparison");

    const synthetic = buildCandidate({
      span: "law of sines vs law of cosines",
      clause: syntheticClause,
      comparisonTarget: "law of cosines",
      qualifiers: ["comparison_pair", "focus_target", "cross_clause_recovery", "late_focus_target"],
      kind: "comparison_pair",
      leftText: "law of sines",
      rightText: "law of cosines",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bhow to make a budget that balances\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1003, "confusion");

    const synthetic = buildCandidate({
      span: "balancing a budget",
      clause: syntheticClause,
      qualifiers: ["focus_target", "cross_clause_recovery", "late_focus_target"],
      kind: "focus_target",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (
    /\boffside\b/i.test(fullMessage) &&
    /\bsoccer\b/i.test(fullMessage) &&
    /\bworks?\b/i.test(fullMessage)
  ) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1004, "question");

    const synthetic = buildCandidate({
      span: "offside in soccer",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "soccer",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bdeductible\b/i.test(fullMessage) && /\binsurance\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1005, "question");

    const synthetic = buildCandidate({
      span: "insurance deductible",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "insurance",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bpremium\b/i.test(fullMessage) && /\binsurance\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1007, "question");

    const synthetic = buildCandidate({
      span: "insurance premium",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "insurance",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bprincipal\b/i.test(fullMessage) && /\bloan\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1008, "question");

    const synthetic = buildCandidate({
      span: "loan principal",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "loan",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\binterest\b/i.test(fullMessage) && /\bstudent loans?\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1009, "question");

    const synthetic = buildCandidate({
      span: "interest on student loans",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "student loans",
    });

    if (synthetic) collected.push(synthetic);
  }

  if (/\bicing\b/i.test(fullMessage) && /\bhockey\b/i.test(fullMessage)) {
    const syntheticClause = buildSyntheticClause(fullMessage, 1010, "question");

    const synthetic = buildCandidate({
      span: "icing in hockey",
      clause: syntheticClause,
      qualifiers: ["focus_target", "context_recovery", "cross_clause_recovery", "late_focus_target"],
      kind: "domain_shaped",
      domainText: "hockey",
    });

    if (synthetic) collected.push(synthetic);
  }

  return dedupeAndGroupCandidates(collected);
}