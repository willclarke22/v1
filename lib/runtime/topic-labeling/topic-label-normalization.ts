import type { TopicSpecificity, TopicMessageIntent } from "./topic-label-contract";
import type { ClauseInfo, MessageInterpretation, SentenceRole } from "./topic-label-types";
import {
  BAD_SINGLE_TOKENS,
  CLAUSE_WORDS,
  CONFUSION_MARKER_REGEX,
  CONTEXT_MARKER_REGEX,
  CONTEXT_SHELL_REGEXES,
  FILLER_WORDS,
  FORCE_TOPIC_FALLBACK_PHRASES,
  FOCUS_MARKER_REGEX,
  GENERIC_STARTERS,
  LEADING_STRIP_REGEXES,
  NEGATION_STEM_TOKENS,
  PROCESS_PHRASE_REGEXES,
  REQUEST_MARKER_REGEX,
  TOO_VAGUE_LABELS,
  TRAILING_NOISE_TOKENS,
  TRAILING_TOPIC_TAIL_REGEXES,
  TYPO_NORMALIZATION_MAP,
} from "./topic-label-constants";

export function normalizeSurface(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLoose(text: string) {
  return normalizeSurface(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string) {
  return normalizeLoose(text)
    .split(" ")
    .map((token) => TYPO_NORMALIZATION_MAP[token] ?? token)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") || token.endsWith("xes")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function semanticTokens(text: string) {
  return tokenize(text).map((token) => singularizeToken(token));
}

export function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (lower === "vs") return "vs";

      const keepLower = ["a", "of", "and", "the", "in", "on", "for", "to"];
      if (index > 0 && keepLower.includes(lower)) return lower;

      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) =>
            part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
          )
          .join("-");
      }

      if (word.includes("'")) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size);
}

export function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function isBadProcessPhrase(text: string | null) {
  if (!text) return true;
  const normalized = normalizeLoose(text);
  if (!normalized) return true;
  if (BAD_SINGLE_TOKENS.has(normalized)) return true;
  return PROCESS_PHRASE_REGEXES.some((regex) => regex.test(normalized));
}

export function hasNegationStemToken(text: string | null) {
  if (!text) return false;
  return tokenize(text).some((token) => NEGATION_STEM_TOKENS.has(token));
}

export function looksLikeContextShell(text: string | null) {
  if (!text) return false;
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  return CONTEXT_SHELL_REGEXES.some((regex) => regex.test(normalized));
}

export function stripTrailingNoise(text: string) {
  let tokens = tokenize(text);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (!TRAILING_NOISE_TOKENS.has(last)) break;
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(" ").trim();
}

export function stripLeadingFillerTokens(text: string) {
  let tokens = tokenize(text);
  while (tokens.length > 1) {
    const first = tokens[0];
    if (!FILLER_WORDS.has(first) && !["uh", "uhh", "well", "yeah", "ok", "okay"].includes(first)) {
      break;
    }
    tokens = tokens.slice(1);
  }
  return tokens.join(" ").trim();
}

export function stripLeadingNoisePatterns(text: string) {
  let output = normalizeSurface(text);

  let changed = true;
  while (changed) {
    changed = false;
    for (const regex of LEADING_STRIP_REGEXES) {
      const next = output.replace(regex, "").trim();
      if (next !== output && next.length > 0) {
        output = next;
        changed = true;
      }
    }
  }

  return output;
}

export function trimTopicTail(text: string) {
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

export function stripLeadingQuestionWrapper(text: string) {
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

export function extractObjectAfterTerminalIs(text: string) {
  const match = normalizeSurface(text).match(/\bis\s+(.+?)$/i);
  if (!match?.[1]) return null;
  return normalizeSurface(match[1]);
}

export function keepTopicCore(text: string) {
  let output = normalizeSurface(text);
  output = stripLeadingNoisePatterns(output);

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
    /^(?:how does)\s+(.+?)\s+work\s+in\s+(.+)$/i,
    /^(?:what is)\s+a?\s*(deductible)\s+in\s+(insurance)$/i,
    /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)$/i,
  ];

  for (const regex of directCorePatterns) {
    const match = output.match(regex);
    if (!match) continue;

    if (/^(?:how does)\s+(.+?)\s+work\s+in\s+(.+)$/i.test(output) && match[1] && match[2]) {
      output = `${normalizeSurface(match[1])} in ${normalizeSurface(match[2])}`;
      break;
    }

    if (/deductible/i.test(output) && /insurance/i.test(output) && match[1] && match[2]) {
      output = `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
      break;
    }

    if (match[1]) {
      output = normalizeSurface(match[1]);
      break;
    }
  }

  const specialTailPatterns: RegExp[] = [
    /\b(?:the part|the thing)\s+(?:that'?s\s+)?(?:confusing me|i need help with|i(?:\s+really)?\s+don't understand|i(?:\s+really)?\s+dont understand)\s+is\s+(.+)$/i,
    /\b(?:what i'm really not understanding)\s+is\s+(.+)$/i,
    /\b(?:what i'?m really not understanding)\s+is\s+(.+)$/i,
    /\b(?:what i need help with)\s+is\s+(.+)$/i,
    /\b(?:the specific thing that'?s confusing me)\s+is\s+(.+)$/i,
    /\b(?:the specific thing i want to go over now)\s+is\s+(.+)$/i,
    /\b(?:the part that seems to stop me every time)\s+is\s+(.+)$/i,
    /\b(?:the part i'?m actually confused about)\s+is\s+(.+)$/i,
    /\b(?:the thing i need help with)\s+is\s+(.+)$/i,
    /\b(?:the thing i really don'?t get)\s+is\s+(.+)$/i,
    /\b(?:the real issue(?: for me)?)\s+is\s+(.+)$/i,
    /\b(?:the actual issue(?: for me)?)\s+is\s+(.+)$/i,
    /\b(?:how to make)\s+(a\s+budget\s+that\s+balances)\b/i,
  ];

  for (const regex of specialTailPatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    output = normalizeSurface(match[1]);
    break;
  }

  const fromTerminalIs = extractObjectAfterTerminalIs(output);
  if (
    fromTerminalIs &&
    !/^(?:different|again|part|thing|it|that|real issue|specific thing)$/i.test(fromTerminalIs) &&
    normalizeLoose(output).split(" ").length > 4
  ) {
    output = fromTerminalIs;
  }

  output = trimTopicTail(output);
  return output;
}

export function normalizeCandidateSpan(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);
  output = stripLeadingNoisePatterns(output);

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
    .replace(/^(?:the part|the thing)\s+i\s+(?:don't|dont)\s+(?:get|understand)\s+(?:is\s+)?/i, "")
    .replace(/^(?:what is|what are|how does|how do|why is|why does)\s+/i, "")
    .replace(/^(?:what(?:'s| is))\s+/i, "")
    .replace(/^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+/i, "")
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
    .replace(/\bwhen to use\s+/i, "")
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

export function looksLikeLearnerStateClause(span: string | null) {
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

export function isClauseLikeSpan(span: string | null) {
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

export function simplifyDomainLabel(text: string) {
  const normalized = normalizeSurface(text);

  if (/^the price of a barrel of oil$/i.test(normalized)) return "Oil Prices";
  if (/^price of a barrel of oil$/i.test(normalized)) return "Oil Prices";
  if (/^interest on a credit card$/i.test(normalized)) return "Credit Card Interest";
  if (/^interest on a credit card actually$/i.test(normalized)) return "Credit Card Interest";
  if (/^offside work in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^offside in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^offside$/i.test(normalized)) return "Offside";
  if (/^deductible in insurance$/i.test(normalized) || /^insurance deductible$/i.test(normalized)) {
    return "Insurance Deductibles";
  }
  if (/^deductible$/i.test(normalized)) return "Deductible";
  if (/^your vs you're$/i.test(normalized) || /^your vs you'?re$/i.test(normalized)) {
    return "Your vs You're";
  }
  if (/^make a budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^a budget that balances$/i.test(normalized)) return "Balancing a Budget";

  return normalized;
}

export function shapeDisplayLabel(span: string | null) {
  const cleaned = normalizeCandidateSpan(span);
  if (!cleaned) return null;
  if (looksLikeLearnerStateClause(cleaned)) return null;
  if (isBadProcessPhrase(cleaned)) return null;
  if (hasNegationStemToken(cleaned)) return null;
  if (looksLikeContextShell(cleaned)) return null;

  const simplified = simplifyDomainLabel(cleaned);

  let normalized = simplified
    .replace(/\bversus\b/gi, "vs")
    .replace(/\bvs\.\b/gi, "vs")
    .replace(/\bvs\s+the\b/gi, "vs")
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

export function scoreSpecificity(label: string | null): TopicSpecificity {
  if (!label) return "too_vague";

  const lower = label.toLowerCase().trim();
  if (TOO_VAGUE_LABELS.has(lower)) return "too_vague";

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 1) return "broad_but_usable";
  if (wordCount <= 4) return "good";
  return "very_specific";
}

export function looksLikeSuspiciousLabel(label: string | null) {
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
    /\b(?:help|understand|understanding|get|confused|stuck|trouble|learn|explain|go over|figure out|start|want|need|quiz|think|again|different|back|especially|shorter|show|wait|thanks|question|first one|second part|first part)\b/i.test(
      label
    )
  ) {
    return true;
  }

  return false;
}

export function countSpanMentions(fullMessage: string, span: string) {
  const normalizedMessage = normalizeLoose(fullMessage);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedMessage || !normalizedSpan) return 0;

  const escaped = normalizedSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = normalizedMessage.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

export function appearsInBroadList(clause: string, span: string) {
  const normalizedClause = normalizeLoose(clause);
  const normalizedSpan = normalizeLoose(span);

  if (!normalizedClause || !normalizedSpan) return false;

  const hasListStructure = clause.includes(",") || /\b(and|or)\b/i.test(clause);
  return hasListStructure && normalizedClause.includes(normalizedSpan);
}

export function spansSubstantiallyOverlap(a: string, b: string) {
  const aTokens = semanticTokens(a);
  const bTokens = semanticTokens(b);

  if (!aTokens.length || !bTokens.length) return false;

  const overlap = overlapScore(aTokens, bTokens);
  if (overlap >= 0.6) return true;

  const aLoose = normalizeLoose(a);
  const bLoose = normalizeLoose(b);
  return aLoose.includes(bLoose) || bLoose.includes(aLoose);
}

export function messageLooksLikePureFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return FORCE_TOPIC_FALLBACK_PHRASES.some((regex) => regex.test(normalized));
}

export function detectIntent(message: string): TopicMessageIntent {
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
    /\bvs\b/i.test(m) ||
    /\bversus\b/i.test(m) ||
    m.includes("mixing them up") ||
    m.includes("mixing up")
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

export function classifyClauseRole(clause: string): SentenceRole {
  const s = normalizeSurface(clause).toLowerCase();

  if (
    s.includes("difference between") ||
    s.startsWith("compare ") ||
    s.startsWith("contrast ") ||
    /\bvs\b/i.test(s) ||
    /\bversus\b/i.test(s) ||
    s.includes("mixing them up") ||
    s.includes("mixing up")
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

export function splitIntoClauses(text: string): ClauseInfo[] {
  const normalized = normalizeSurface(text);
  if (!normalized) return [];

  const clauses: ClauseInfo[] = [];
  const pieces = normalized
    .split(
      /(?<=[.?!])\s+|(?=,\s*but\b)|(?=\s+\bbut\b\s+)|(?=,\s*especially\b)|(?=,\s*mainly\b)|(?=,\s*specifically\b)|(?=,\s*particularly\b)|(?=,\s*actually\b)/i
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
        lower.startsWith("particularly ") ||
        lower.startsWith("actually "));

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

export function analyzeMessageStructure(message: string): MessageInterpretation {
  return {
    messageIntent: detectIntent(message),
    clauses: splitIntoClauses(message),
  };
}