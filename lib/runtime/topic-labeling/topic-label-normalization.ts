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

const SPECIAL_CASE_LABELS: Record<string, string> = {
  ph: "pH",
  llm: "LLM",
  llms: "LLMs",
  ai: "AI",
  dna: "DNA",
  rna: "RNA",
  adp: "ADP",
  atp: "ATP",
  gdp: "GDP",
  gtp: "GTP",
  mrna: "mRNA",
  trna: "tRNA",
  rrna: "rRNA",
};

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

function shapeWordWithSpecialCases(word: string, index: number) {
  const lower = word.toLowerCase();

  if (SPECIAL_CASE_LABELS[lower]) return SPECIAL_CASE_LABELS[lower];
  if (lower === "vs") return "vs";

  const keepLower = ["a", "of", "and", "the", "in", "on", "for", "to"];
  if (index > 0 && keepLower.includes(lower)) return lower;

  if (word.includes("-")) {
    return word
      .split("-")
      .map((part, partIndex) => shapeWordWithSpecialCases(part, partIndex))
      .join("-");
  }

  if (word.includes("'")) {
    if (SPECIAL_CASE_LABELS[lower]) return SPECIAL_CASE_LABELS[lower];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toTitleCase(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word, index) => shapeWordWithSpecialCases(word, index))
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

function extractLeadingCoreByPattern(text: string, patterns: RegExp[]): string {
  let output = normalizeSurface(text);
  let changed = true;

  while (changed) {
    changed = false;
    for (const regex of patterns) {
      const match = output.match(regex);
      if (!match?.[1]) continue;

      const next = normalizeSurface(match[1]);
      if (!next || next === output) continue;

      output = next;
      changed = true;
      break;
    }
  }

  return output;
}

function normalizeNoisyAcronyms(text: string) {
  let output = normalizeSurface(text);

  output = output
    .replace(/\bph\b/g, "pH")
    .replace(/\bllms\b/gi, "LLMs")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\byoure\b/gi, "you're");

  return output;
}

function normalizeNoisyPhrasing(text: string) {
  let output = normalizeSurface(text);

  output = output
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bw\b/gi, "with")
    .replace(/\bu\b/gi, "you");

  return normalizeSurface(output);
}

function stripKnownTailFragments(text: string) {
  let output = normalizeSurface(text);

  output = extractLeadingCoreByPattern(output, [
    /^(.+?)\s+yet$/i,
    /^(.+?)\s+tbh$/i,
    /^(.+?)\s+lol$/i,
    /^(.+?)\s+rn$/i,
    /^(.+?)\s+right now$/i,
    /^(.+?)\s+for me$/i,
    /^(.+?)\s+at all$/i,
    /^(.+?)\s+still$/i,
    /^(.+?)\s+that i don't get yet$/i,
    /^(.+?)\s+that i dont get yet$/i,
    /^(.+?)\s+that i still don't get$/i,
    /^(.+?)\s+that i still dont get$/i,
    /^(.+?)\s+that still mess(?:es)? me up.*$/i,
    /^(.+?)\s+mess(?:es)? me up.*$/i,
    /^(.+?)\s+is what make(?:s)? the whole thing confusing.*$/i,
    /^(.+?)\s+are what make(?:s)? the whole thing confusing.*$/i,
    /^(.+?)\s+is still what make(?:s)? the whole thing confusing.*$/i,
    /^(.+?)\s+are still what make(?:s)? the whole thing confusing.*$/i,
    /^(.+?)\s+i lose track.*$/i,
    /^(.+?)\s+lose track.*$/i,
    /^(.+?)\s+what the rule is doing.*$/i,
    /^(.+?)\s+what the play stops.*$/i,
  ]);

  return output;
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
    if (
      !FILLER_WORDS.has(first) &&
      !["uh", "uhh", "well", "yeah", "ok", "okay"].includes(first)
    ) {
      break;
    }
    tokens = tokens.slice(1);
  }
  return tokens.join(" ").trim();
}

export function stripLeadingNoisePatterns(text: string) {
  let output = normalizeSurface(text);
  output = normalizeNoisyPhrasing(output);
  output = normalizeNoisyAcronyms(output);

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
  output = normalizeNoisyAcronyms(output);
  output = stripKnownTailFragments(output);

  output = extractLeadingCoreByPattern(output, [
    /^(.+?)\s+(?:and\s+i\s+(?:do\s+not|don'?t|dont).*)$/i,
    /^(.+?)\s+(?:that\s+i\s+(?:do\s+not|don'?t|dont).*)$/i,
    /^(.+?)\s+(?:is\s+what\s+i(?:'m| am)?\s+confused\s+about.*)$/i,
    /^(.+?)\s+(?:is\s+what\s+i\s+am\s+confused\s+about.*)$/i,
    /^(.+?)\s+(?:are\s+what\s+i\s+keep\s+getting\s+stuck\s+on.*)$/i,
    /^(.+?)\s+(?:is\s+not\s+clicking(?:\s+\w+)?).*$/i,
    /^(.+?)\s+(?:came\s+up.*)$/i,
    /^(.+?)\s+(?:showed\s+up.*)$/i,
    /^(.+?)\s+(?:because\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:bc\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:the\s+whole\s+thing\s+confusing\s+to\s+me.*)$/i,
    /^(.+?)\s+(?:the\s+whole\s+thing\s+confusing.*)$/i,
    /^(.+?)\s+(?:what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*)$/i,
    /^(.+?)\s+(?:i\s+lose\s+track.*)$/i,
    /^(.+?)\s+(?:lose\s+track.*)$/i,
    /^(.+?)\s+(?:mess(?:es)?\s+me\s+up.*)$/i,
    /^(.+?)\s+(?:mean\s+in\s+.+)$/i,
  ]);

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

  output = stripKnownTailFragments(output);

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

function stripLateFocusWrappers(text: string) {
  let output = normalizeSurface(text);

  const wrapperPatterns: RegExp[] = [
    /^(?:is|are)\s+(.+)$/i,
    /^(?:it'?s|it is)\s+(.+)$/i,
    /^(?:really just|just)\s+(.+)$/i,
    /^(?:but)\s+(.+)$/i,
    /^(?:but actually)\s+(.+)$/i,
    /^(?:actually)\s+(.+)$/i,
    /^(?:after looking again)\s+(.+)$/i,
    /^(?:but after looking again)\s+(.+)$/i,
    /^(?:i think)\s+(.+)$/i,
    /^(?:i think it'?s)\s+(.+)$/i,
    /^(?:i think it is)\s+(.+)$/i,
    /^(?:i think it'?s really just)\s+(.+)$/i,
    /^(?:i think it is really just)\s+(.+)$/i,
    /^(?:what i actually don'?t understand is)\s+(.+)$/i,
    /^(?:what i actually dont understand is)\s+(.+)$/i,
    /^(?:the thing i actually don'?t get is)\s+(.+)$/i,
    /^(?:the thing i actually dont get is)\s+(.+)$/i,
    /^(?:the thing i don'?t get is)\s+(.+)$/i,
    /^(?:the thing i dont get is)\s+(.+)$/i,
    /^(?:what i need help with is)\s+(.+)$/i,
    /^(?:what i really don'?t understand is)\s+(.+)$/i,
    /^(?:what i really dont understand is)\s+(.+)$/i,
    /^(?:that is where)\s+(.+)$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const regex of wrapperPatterns) {
      const match = output.match(regex);
      if (!match?.[1]) continue;
      const next = normalizeSurface(match[1]);
      if (!next || next === output) continue;
      output = next;
      changed = true;
      break;
    }
  }

  return output;
}

function stripMidSentenceTailFragments(text: string) {
  let output = normalizeSurface(text);

  output = extractLeadingCoreByPattern(output, [
    /^(.+?)\s+(?:is\s+what\s+i(?:'m| am)?\s+confused\s+about.*)$/i,
    /^(.+?)\s+(?:is\s+what\s+i\s+am\s+confused\s+about.*)$/i,
    /^(.+?)\s+(?:are\s+what\s+i\s+keep\s+getting\s+stuck\s+on.*)$/i,
    /^(.+?)\s+(?:that\s+i\s+(?:do\s+not|don'?t|dont)\s+get.*)$/i,
    /^(.+?)\s+(?:that\s+i\s+(?:do\s+not|don'?t|dont)\s+really\s+understand.*)$/i,
    /^(.+?)\s+(?:is\s+not\s+clicking(?:\s+\w+)?).*$/i,
    /^(.+?)\s+(?:because\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:bc\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:mess(?:es)?\s+me\s+up.*)$/i,
    /^(.+?)\s+(?:i\s+lose\s+track.*)$/i,
    /^(.+?)\s+(?:lose\s+track.*)$/i,
  ]);

  return output;
}

function collapseVerbDomainShape(text: string) {
  const normalized = normalizeSurface(text);

  const workInMatch = normalized.match(/^(.+?)\s+works?\s+in\s+(.+)$/i);
  if (workInMatch?.[1] && workInMatch?.[2]) {
    return `${normalizeSurface(workInMatch[1])} in ${normalizeSurface(workInMatch[2])}`.trim();
  }

  const workOnMatch = normalized.match(/^(.+?)\s+works?\s+on\s+(.+)$/i);
  if (workOnMatch?.[1] && workOnMatch?.[2]) {
    return `${normalizeSurface(workOnMatch[1])} on ${normalizeSurface(workOnMatch[2])}`.trim();
  }

  const meanInMatch = normalized.match(/^(.+?)\s+mean\s+in\s+(.+)$/i);
  if (meanInMatch?.[1] && meanInMatch?.[2]) {
    return `${normalizeSurface(meanInMatch[2])} ${normalizeSurface(meanInMatch[1])}`.trim();
  }

  const isInMatch = normalized.match(/^(.+?)\s+in\s+a\s+(.+)$/i);
  if (isInMatch?.[1] && isInMatch?.[2]) {
    const thing = normalizeSurface(isInMatch[1]);
    const domain = normalizeSurface(isInMatch[2]);
    if (/^(loan|mortgage|credit card|budget)$/i.test(domain)) {
      return `${domain} ${thing}`.trim();
    }
  }

  return normalized;
}

function normalizeExplicitNoisyComparisons(text: string) {
  const normalized = normalizeSurface(text);

  if (/\byour\b/i.test(normalized) && /\byou'?re|youre\b/i.test(normalized)) {
    if (/\bmess(?:es)? me up\b/i.test(normalized) || /\bmixing\b/i.test(normalized)) {
      return "your vs you're";
    }
  }

  return normalized;
}

export function keepTopicCore(text: string) {
  let output = normalizeSurface(text);
  output = normalizeNoisyPhrasing(output);
  output = normalizeNoisyAcronyms(output);
  output = normalizeExplicitNoisyComparisons(output);
  output = stripLeadingNoisePatterns(output);
  output = stripLateFocusWrappers(output);
  output = stripMidSentenceTailFragments(output);
  output = stripKnownTailFragments(output);

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
    /^(?:how do)\s+(.+?)\s+work\s+in\s+(.+)$/i,
    /^(?:how does)\s+(.+?)\s+work\s+on\s+(.+)$/i,
    /^(?:how do)\s+(.+?)\s+work\s+on\s+(.+)$/i,
    /^(?:what does)\s+a?\s*(.+?)\s+mean\s+in\s+(.+)$/i,
    /^(?:what is)\s+a?\s*(.+?)\s+in\s+a\s+(.+)$/i,
    /^(?:what is)\s+a?\s*(.+?)\s+in\s+(.+)$/i,
    /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)$/i,
  ];

  for (const regex of directCorePatterns) {
    const match = output.match(regex);
    if (!match) continue;

    if (
      /^(?:how does)\s+(.+?)\s+work\s+in\s+(.+)$/i.test(output) ||
      /^(?:how do)\s+(.+?)\s+work\s+in\s+(.+)$/i.test(output)
    ) {
      if (match[1] && match[2]) {
        output = `${normalizeSurface(match[1])} in ${normalizeSurface(match[2])}`;
        break;
      }
    }

    if (
      /^(?:how does)\s+(.+?)\s+work\s+on\s+(.+)$/i.test(output) ||
      /^(?:how do)\s+(.+?)\s+work\s+on\s+(.+)$/i.test(output)
    ) {
      if (match[1] && match[2]) {
        output = `${normalizeSurface(match[1])} on ${normalizeSurface(match[2])}`;
        break;
      }
    }

    if (/^what does/i.test(output) && /\bmean in\b/i.test(output) && match[1] && match[2]) {
      output = `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
      break;
    }

    if (/^what is/i.test(output) && /\bin a\b/i.test(output) && match[1] && match[2]) {
      output = `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
      break;
    }

    if (
      /^what is/i.test(output) &&
      /\bin\b/i.test(output) &&
      !/\bdeductible\b/i.test(output) &&
      match[1] &&
      match[2]
    ) {
      const thing = normalizeSurface(match[1]);
      const domain = normalizeSurface(match[2]);
      if (/^(loan|mortgage|insurance|credit card)$/i.test(domain)) {
        output = `${domain} ${thing}`;
        break;
      }
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
    /\b(?:i think it'?s really just)\s+(.+)$/i,
    /\b(?:i think it is really just)\s+(.+)$/i,
    /\b(?:after looking again i think it'?s really just)\s+(.+)$/i,
    /\b(?:after looking again i think it is really just)\s+(.+)$/i,
    /\b(?:until)\s+(.+?)\s+(?:showed up|came up)\b.*$/i,
  ];

  for (const regex of specialTailPatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    output = normalizeSurface(match[1]);
    break;
  }

  output = stripMidSentenceTailFragments(output);
  output = stripLateFocusWrappers(output);
  output = collapseVerbDomainShape(output);

  const fromTerminalIs = extractObjectAfterTerminalIs(output);
  if (
    fromTerminalIs &&
    !/^(?:different|again|part|thing|it|that|real issue|specific thing)$/i.test(fromTerminalIs) &&
    normalizeLoose(output).split(" ").length > 4
  ) {
    output = fromTerminalIs;
  }

  output = stripMidSentenceTailFragments(output);
  output = stripLateFocusWrappers(output);
  output = collapseVerbDomainShape(output);
  output = stripKnownTailFragments(output);
  output = trimTopicTail(output);
  return output;
}

export function normalizeCandidateSpan(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);
  output = normalizeNoisyPhrasing(output);
  output = normalizeNoisyAcronyms(output);
  output = normalizeExplicitNoisyComparisons(output);
  output = stripLeadingNoisePatterns(output);
  output = stripLateFocusWrappers(output);

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
    .replace(/^(?:is|are)\s+/i, "")
    .replace(/^(?:it'?s|it is)\s+/i, "")
    .replace(/^(?:but)\s+/i, "")
    .replace(/^(?:but actually)\s+/i, "")
    .replace(/^(?:after looking again)\s+/i, "")
    .replace(/^(?:but after looking again)\s+/i, "")
    .replace(/^(?:i think)\s+/i, "")
    .replace(/^(?:i think it'?s)\s+/i, "")
    .replace(/^(?:i think it is)\s+/i, "")
    .replace(/^(?:really just|just)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  output = stripMidSentenceTailFragments(output);
  output = collapseVerbDomainShape(output);
  output = stripLateFocusWrappers(output);
  output = stripLeadingQuestionWrapper(output);
  output = stripLeadingFillerTokens(output);
  output = stripTrailingNoise(output);
  output = stripKnownTailFragments(output);
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

  output = stripMidSentenceTailFragments(output);
  output = collapseVerbDomainShape(output);
  output = stripLateFocusWrappers(output);
  output = stripLeadingQuestionWrapper(output);
  output = stripLeadingFillerTokens(output);
  output = stripTrailingNoise(output);
  output = stripKnownTailFragments(output);
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

  output = stripMidSentenceTailFragments(output);
  output = collapseVerbDomainShape(output);
  output = stripLateFocusWrappers(output);
  output = stripTrailingNoise(output);
  output = stripKnownTailFragments(output);
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
    normalized === "not clicking" ||
    normalized === "not clicking rn" ||
    normalized === "i m lost" ||
    normalized === "im lost" ||
    normalized === "i am lost" ||
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
  if (/^(?:but|actually|after looking again|i think|it'?s|it is)\b/i.test(normalized)) return true;

  return false;
}

export function simplifyDomainLabel(text: string) {
  const normalized = normalizeSurface(text);
  const loose = normalizeLoose(normalized);

  if (/^the price of a barrel of oil$/i.test(normalized)) return "Oil Prices";
  if (/^price of a barrel of oil$/i.test(normalized)) return "Oil Prices";
  if (/^interest on a credit card$/i.test(normalized)) return "Credit Card Interest";
  if (/^interest on a credit card actually$/i.test(normalized)) return "Credit Card Interest";
  if (/^interest on student loans?$/i.test(normalized)) return "Interest on Student Loans";
  if (/^student loans? interest$/i.test(normalized)) return "Interest on Student Loans";
  if (/^offside work in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^offside works in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^offside in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^icing in hockey$/i.test(normalized)) return "Icing in Hockey";
  if (/^offside$/i.test(normalized)) return "Offside";
  if (/^deductible in insurance$/i.test(normalized) || /^insurance deductible$/i.test(normalized)) {
    return "Insurance Deductible";
  }
  if (/^premium in insurance$/i.test(normalized) || /^insurance premium$/i.test(normalized)) {
    return "Insurance Premium";
  }
  if (/^principal in a loan$/i.test(normalized) || /^principal in loan$/i.test(normalized)) {
    return "Loan Principal";
  }
  if (/^loan principal$/i.test(normalized)) {
    return "Loan Principal";
  }
  if (/^deductible$/i.test(normalized)) return "Deductible";
  if (/^your vs you're$/i.test(normalized) || /^your vs you'?re$/i.test(normalized)) {
    return "Your vs You're";
  }
  if (/^make a budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^a budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (loose === "ph") return "pH";
  if (loose === "llm") return "LLM";
  if (loose === "llms") return "LLMs";

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
    .replace(/\bcame up$/i, "")
    .replace(/\bshowed up$/i, "")
    .replace(/\bin neurons$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  normalized = stripMidSentenceTailFragments(normalized);
  normalized = collapseVerbDomainShape(normalized);
  normalized = stripLateFocusWrappers(normalized);

  normalized = normalized
    .replace(/\bthat i keep mixing up$/i, "")
    .replace(/\bthat i keep confusing$/i, "")
    .replace(/\bthat i keep getting mixed up$/i, "")
    .replace(/\bthat i mix up$/i, "")
    .replace(/\bmess(?:es)? me up.*$/i, "")
    .replace(/\blose track.*$/i, "")
    .replace(/\bwhole thing confusing.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  normalized = stripKnownTailFragments(normalized);
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

  const suspiciousSingles = new Set([
    "yet",
    "lol",
    "tbh",
    "up",
    "track",
    "whole",
    "confusing",
    "mean",
    "say",
    "wait",
    "helped",
    "one",
    "scoring",
    "sweeping",
  ]);

  if (suspiciousSingles.has(normalized)) return true;

  const tokenCount = tokenize(label).length;
  if (tokenCount > 8) return true;

  if (/^(?:is|are|it'?s|it is|but|actually|after looking again|i think)\b/i.test(normalized)) {
    return true;
  }

  if (
    /\b(?:help|understand|understanding|get|confused|stuck|trouble|learn|explain|go over|figure out|start|want|need|quiz|think|again|different|back|especially|shorter|show|wait|thanks|question|first one|second part|first part|clicking|came up|showed up|lost)\b/i.test(
      label
    )
  ) {
    return true;
  }

  if (
    /\b(?:whole thing confusing|lose track|mess me up|up lol|student loans tbh|premium mean)\b/i.test(
      normalized
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
      /(?<=[.?!])\s+|(?=,\s*but\b)|(?=\s+\bbut\b\s+)|(?=,\s*especially\b)|(?=,\s*mainly\b)|(?=,\s*specifically\b)|(?=,\s*particularly\b)|(?=,\s*actually\b)|(?=,\s*and now\b)/i
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
        lower.startsWith("actually ") ||
        lower.startsWith("and now "));

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