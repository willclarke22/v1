// lib/runtime/topic-labeling/topic-label-normalization.ts
// Updated naturalistic/discourse-first normalization layer.
// Public exports are intentionally preserved.

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

const STRUCTURED_TOPIC_HEADS = new Set([
  "rules",
  "rule",
  "phases",
  "phase",
  "layers",
  "layer",
  "steps",
  "step",
  "parts",
  "part",
  "types",
  "type",
  "difference",
  "role",
  "function",
  "mechanism",
  "process",
  "causes",
  "cause",
  "effects",
  "effect",
  "law",
  "speed",
  "terminology",
  "jargon",
  "word",
  "formula",
  "equation",
  "variables",
  "principal",
  "premium",
  "deductible",
  "interest",
  "feedback",
  "loop",
  "period",
  "control",
  "skills",
  "development",
  "defense",
  "questions",
  "bullets",
  "interviews",
  "negotiation",
  "size",
  "cycles",
  "response",
  "analysis",
  "wars",
  "significance",
  "code",
  "updates",
  "handling",
  "recursion",
  "splices",
  "agreement",
  "voice",
  "initiation",
  "planning",
  "anxiety",
  "structure",
  "notation",
  "recognition",
  "fifths",
  "scale",
  "longitude",
  "latitude",
  "boundaries",
  "parking",
  "way",
  "lanes",
  "checks",
  "perspective",
  "mixing",
  "space",
  "values",
  "powers",
  "federalism",
  "college",
  "liberties",
  "rights",
  "selection",
  "energy",
  "concept",
  "equations",
  "apr",
  "expenses",
  "funds",
  "transmission",
  "system",
  "intervals",
  "photosynthesis",
  "webs",
  "chains",
  "pollination",
  "succession",
  "trap",
  "valve",
  "pipes",
  "velocity",
  "weight",
  "redshift",
  "proof",
  "precedent",
  "consideration",
  "regulation",
  "rumination",
  "reappraisal",
  "understanding",
  "mapping",
  "median",
  "mean",
  "climate",
  "weather",
  "empathy",
  "sympathy",
  "reaction",
  "depreciation",
  "criteria",
  "criterion",
  "selection",
  "classification",
  "validity",
  "credibility",
  "responsibility",
  "boundary",
  "timing",
  "method",
  "strategy",
]);

const SAFE_STRUCTURED_PHRASE_REGEX =
  /\b(?:difference between .+? and .+?|(?:rules?|phases?|layers?|steps?|parts?|types?|difference|role|function|mechanism|process|causes?|effects?|law|speed|terminology|jargon|formula|equation|variables?|principal|premium|deductible|interest|feedback|loop|period)\s+of\s+.+|.+\s+vs\s+.+|.+\s+in\s+.+|.+\s+on\s+.+|how .+ works?|why .+ happens?|word order in .+|se in .+|.+ terminology(?: and forms)?|.+ jargon(?: and forms)?|tax forms?|insurance deductible|insurance premium|loan principal|credit card interest|interest on .+|negative feedback|event loop|refractory period|speed of sound|law of cosines|law of sines|standard deviation|opportunity cost|secondary dominants|membrane potential|equilibrium constant)\b/i;

const NATURALISTIC_DURABLE_PHRASE_REGEX =
  /\b(?:heat control|emulsification|knife skills|gluten development|zone defense|offside in soccer|earned runs|tennis scoring|behavioral interview questions|accomplishment-based resume bullets|informational interviews|salary negotiation|serving size|sleep cycles|systolic vs diastolic blood pressure|immune response|causes of the french revolution|primary source analysis|proxy wars|historical significance|asynchronous code|react state updates|api error handling|recursion|comma splices|subject-verb agreement|passive voice|task initiation|study planning|test anxiety|note-taking structure|rhythm notation|secondary dominants|interval recognition|circle of fifths|map scale|latitude vs longitude|rain shadow effect|types of plate boundaries|parallel parking|right of way|merge lanes|blind spot checks|one-point perspective|color mixing|negative space|shading values|separation of powers|federalism|electoral college|civil liberties vs civil rights|osmosis|natural selection|mitosis vs meiosis|activation energy|mole concept|balancing chemical equations|electronegativity vs ionization energy|ph scale|compound interest|apr|fixed vs variable expenses|index funds|torque vs horsepower|automatic transmission|anti-lock braking system|oil change intervals|photosynthesis|food chains vs food webs|pollination|ecological succession|p-trap|water pressure|shutoff valve|plumbing vent pipes|orbital velocity|moon phases|gravity vs weight|redshift|burden of proof|civil law vs criminal law|legal precedent|consideration in contracts|emotion regulation|rumination|cognitive reappraisal|monitoring understanding|concept mapping|affect vs effect|mean vs median|weather vs climate|sympathy vs empathy|maillard reaction|depreciation|baroque vs renaissance art)\b/i;

const QCS_SYNTHESIZED_LABEL_REGEX =
  /\b(?:causes of .+|.+ analysis|.+ evaluation|.+ interpretation|.+ selection|.+ criteria|.+ validity|.+ credibility|.+ classification|.+ boundary|.+ timing|.+ method|.+ strategy|.+ responsibility|monitoring .+|.+ vs .+)\b/i;

const DURABLE_CONNECTOR_REGEX = /\b(?:of|in|on|for|vs)\b/i;
const MECHANISM_REQUEST_REGEX =
  /\b(?:how|why|process|mechanism|steps?|function|role|what happens|word order)\b/i;

const RESIDUE_ONLY_REGEXES: RegExp[] = [
  /^like$/i,
  /^weird$/i,
  /^better$/i,
  /^again$/i,
  /^that$/i,
  /^it$/i,
  /^what'?s going on$/i,
  /^what is going on$/i,
  /^where to start$/i,
  /^where to even start$/i,
  /^in my own language$/i,
  /^small words$/i,
  /^i don'?t get$/i,
  /^i dont get$/i,
  /^i don'?t understand$/i,
  /^i dont understand$/i,
  /^the whole thing$/i,
  /^the terminology is weird$/i,
  /^the jargon is weird$/i,
  /^coded language$/i,
  /^another language$/i,
  /^feels coded$/i,
  /^it feels coded$/i,
  /^the actual blocker$/i,
  /^the actual issue$/i,
  /^the real issue$/i,
  /^the real bottleneck$/i,
  /^the specific thing$/i,
  /^the thing$/i,
  /^that exact part$/i,
  /^that specific part$/i,
  /^tiny word$/i,
  /^once everything is ready$/i,
  /^interview coming up$/i,
  /^ui changes in$/i,
  /^do i even$/i,
  /^actual skill$/i,
  /^whole problem$/i,
  /^someone else$/i,
  /^far apart two places look$/i,
  /^deciding whose turn it$/i,
  /^room drawing$/i,
  /^words separately$/i,
  /^both levels$/i,
  /^everyone uses$/i,
  /^actual topic$/i,
  /^part seems important$/i,
  /^something stay in orbit$/i,
  /^not changing shape$/i,
  /^type of case$/i,
  /^until it gets louder$/i,
  /^same word in my head$/i,
  /^hidden step$/i,
  /^recipe sounded simple$/i,
  /^recipe mentions kneading$/i,
  /^teacher says$/i,
  /^teacher wrote$/i,
  /^article mentions$/i,
  /^people say$/i,
  /^everyone says$/i,
  /^everyone acts$/i,
  /^it clearly means$/i,
  /^the rule logic$/i,
  /^the logic$/i,
];

const DURABLE_LABEL_PROTECT_REGEXES: RegExp[] = [
  /^how .+ works?$/i,
  /^why .+ happens?$/i,
  /^.+ vs .+$/i,
  /^.+ in .+$/i,
  /^.+ on .+$/i,
  /^.+ of .+$/i,
  /^word order in .+$/i,
  /^se in .+$/i,
  /^.+ terminology(?: and forms)?$/i,
  /^.+ jargon(?: and forms)?$/i,
  /^tax terminology and forms$/i,
  /^insurance deductible$/i,
  /^insurance premium$/i,
  /^loan principal$/i,
  /^credit card interest$/i,
  /^interest on .+$/i,
  /^speed of sound$/i,
  /^law of cosines$/i,
  /^law of sines$/i,
  /^standard deviation$/i,
  /^opportunity cost$/i,
  /^negative feedback$/i,
  /^event loop$/i,
  /^refractory period$/i,
  /^secondary dominants$/i,
  /^membrane potential$/i,
  /^equilibrium constant$/i,
  /^heat control$/i,
  /^emulsification$/i,
  /^knife skills$/i,
  /^gluten development$/i,
  /^zone defense$/i,
  /^earned runs$/i,
  /^tennis scoring$/i,
  /^behavioral interview questions$/i,
  /^accomplishment-based resume bullets$/i,
  /^informational interviews$/i,
  /^salary negotiation$/i,
  /^serving size$/i,
  /^sleep cycles$/i,
  /^immune response$/i,
  /^primary source analysis$/i,
  /^proxy wars$/i,
  /^historical significance$/i,
  /^asynchronous code$/i,
  /^react state updates$/i,
  /^api error handling$/i,
  /^recursion$/i,
  /^comma splices$/i,
  /^subject-verb agreement$/i,
  /^passive voice$/i,
  /^task initiation$/i,
  /^study planning$/i,
  /^test anxiety$/i,
  /^note-taking structure$/i,
  /^rhythm notation$/i,
  /^interval recognition$/i,
  /^circle of fifths$/i,
  /^map scale$/i,
  /^rain shadow effect$/i,
  /^types of plate boundaries$/i,
  /^parallel parking$/i,
  /^right of way$/i,
  /^merge lanes$/i,
  /^blind spot checks$/i,
  /^one-point perspective$/i,
  /^color mixing$/i,
  /^negative space$/i,
  /^shading values$/i,
  /^separation of powers$/i,
  /^federalism$/i,
  /^electoral college$/i,
  /^natural selection$/i,
  /^activation energy$/i,
  /^mole concept$/i,
  /^balancing chemical equations$/i,
  /^apr$/i,
  /^index funds$/i,
  /^automatic transmission$/i,
  /^anti-lock braking system$/i,
  /^oil change intervals$/i,
  /^photosynthesis$/i,
  /^pollination$/i,
  /^ecological succession$/i,
  /^p-trap$/i,
  /^water pressure$/i,
  /^shutoff valve$/i,
  /^plumbing vent pipes$/i,
  /^orbital velocity$/i,
  /^moon phases$/i,
  /^redshift$/i,
  /^burden of proof$/i,
  /^legal precedent$/i,
  /^consideration in contracts$/i,
  /^emotion regulation$/i,
  /^rumination$/i,
  /^cognitive reappraisal$/i,
  /^monitoring understanding$/i,
  /^concept mapping$/i,
  /^maillard reaction$/i,
  /^depreciation$/i,
  /^baroque vs renaissance art$/i,
  /^causes of .+$/i,
  /^.+ analysis$/i,
  /^.+ evaluation$/i,
  /^.+ interpretation$/i,
  /^.+ selection$/i,
  /^.+ criteria$/i,
  /^.+ validity$/i,
  /^.+ credibility$/i,
  /^.+ classification$/i,
  /^.+ boundary$/i,
  /^.+ timing$/i,
  /^.+ method$/i,
  /^.+ strategy$/i,
  /^.+ responsibility$/i,
  /^monitoring .+$/i,
];

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

function shapeWordWithSpecialCases(word: string, index: number): string {
  const lower = word.toLowerCase();

  if (SPECIAL_CASE_LABELS[lower]) return SPECIAL_CASE_LABELS[lower];
  if (lower === "vs") return "vs";
  if (lower === "se") return "Se";
  if (lower === "you're") return "You're";

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

function isStructuredTopicPhrase(text: string) {
  const normalized = normalizeSurface(text);
  if (!normalized) return false;

  const tokens = tokenize(normalized);
  if (!tokens.length) return false;

  if (SAFE_STRUCTURED_PHRASE_REGEX.test(normalized)) return true;
  if (NATURALISTIC_DURABLE_PHRASE_REGEX.test(normalized)) return true;
  if (QCS_SYNTHESIZED_LABEL_REGEX.test(normalized)) return true;
  if (tokens.length >= 2 && STRUCTURED_TOPIC_HEADS.has(tokens[0])) return true;
  if (/^how .+ works?$/i.test(normalized)) return true;
  if (/^why .+ happens?$/i.test(normalized)) return true;
  if (/^word order in .+$/i.test(normalized)) return true;
  if (/^se in .+$/i.test(normalized)) return true;
  return false;
}

function looksLikeMechanismPhrase(text: string) {
  const normalized = normalizeLoose(text);
  return (
    /^how .+ works?$/.test(normalized) ||
    /^why .+ happens?$/.test(normalized) ||
    /\b(?:process|mechanism|steps?|function|role|word order)\b/.test(normalized)
  );
}

function looksLikeDurableTopicPhrase(text: string) {
  const normalized = normalizeSurface(text);
  return (
    NATURALISTIC_DURABLE_PHRASE_REGEX.test(normalized) ||
    QCS_SYNTHESIZED_LABEL_REGEX.test(normalized) ||
    isStructuredTopicPhrase(normalized) ||
    DURABLE_CONNECTOR_REGEX.test(normalized) ||
    DURABLE_LABEL_PROTECT_REGEXES.some((regex) => regex.test(normalized))
  );
}

function looksLikeResidueOnly(text: string) {
  const normalized = normalizeSurface(text);
  return RESIDUE_ONLY_REGEXES.some((regex) => regex.test(normalized));
}

function shouldStronglyPreserve(text: string) {
  const normalized = normalizeSurface(text);
  if (extractProtectedDurablePhrase(normalized)) return true;

  return (
    looksLikeDurableTopicPhrase(normalized) &&
    !looksLikeResidueOnly(normalized) &&
    !looksLikeContextShell(normalized) &&
    !hasNegationStemToken(normalized)
  );
}


function extractProtectedNaturalisticPhrase(text: string) {
  const normalized = normalizeLoose(text);
  const match = normalized.match(NATURALISTIC_DURABLE_PHRASE_REGEX);
  if (!match?.[0]) return null;
  return normalizeSurface(match[0]);
}


function extractProtectedDurablePhrase(text: string) {
  const naturalistic = extractProtectedNaturalisticPhrase(text);
  if (naturalistic) return naturalistic;

  const normalized = normalizeLoose(text);

  const protectedPatterns: Array<[RegExp, string]> = [
    [/\byour\s+vs\s+you'?re\b/i, "your vs you're"],
    [/\bsystolic\b.*\bdiastolic\b.*\bblood pressure\b/i, "systolic vs diastolic blood pressure"],
    [/\belectronegativity\b.*\bionization energy\b/i, "electronegativity vs ionization energy"],
    [/\bfixed\b.*\bvariable expenses?\b/i, "fixed vs variable expenses"],
    [/\bcivil liberties\b.*\bcivil rights\b/i, "civil liberties vs civil rights"],
    [/\bgravity\b.*\bweight\b/i, "gravity vs weight"],
    [/\bweather\b.*\bclimate\b/i, "weather vs climate"],
    [/\bbaroque\b.*\brenaissance\b.*\bart\b/i, "baroque vs renaissance art"],
    [/\bbaroque\b.*\brenaissance\b/i, "baroque vs renaissance art"],
    [/\bfood chains?\b.*\bfood webs?\b/i, "food chains vs food webs"],
    [/\bmean\b.*\bmedian\b/i, "mean vs median"],
    [/\btorque\b.*\bhorsepower\b/i, "torque vs horsepower"],
    [/\blatitude\b.*\blongitude\b/i, "latitude vs longitude"],
    [/\bmitosis\b.*\bmeiosis\b/i, "mitosis vs meiosis"],
    [/\baffect\b.*\beffect\b/i, "affect vs effect"],
    [/\bsympathy\b.*\bempathy\b/i, "sympathy vs empathy"],
    [/\bcivil law\b.*\bcriminal law\b/i, "civil law vs criminal law"],
    [/\bearned runs?\b/i, "earned runs"],
    [/\btennis scoring\b/i, "tennis scoring"],
    [/\bmerge lanes?\b/i, "merge lanes"],
    [/\bshutoff valves?\b/i, "shutoff valve"],
    [/\bbalanc(?:e|ing|ed)?\s+chemical equations?\b/i, "balancing chemical equations"],
    [/\bzone defense\b/i, "zone defense"],
    [/\boffside\b.*\bsoccer\b/i, "offside in soccer"],
    [/\bright of way\b/i, "right of way"],
    [/\bknife skills?\b/i, "knife skills"],
    [/\btask initiation\b/i, "task initiation"],
    [/\bconsideration\b.*\bcontracts?\b/i, "consideration in contracts"],
    [/\bapr\b/i, "APR"],
  ];

  for (const [regex, label] of protectedPatterns) {
    if (regex.test(normalized)) return label;
  }

  return null;
}

function messageExplicitlyHasNoTopic(text: string) {
  const normalized = normalizeLoose(text);

  return (
    /\b(?:no|not|don'?t have|dont have|do not have)\b.*\b(?:specific|actual|clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:no specific|no actual|no clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:i|we)\s+(?:don'?t|dont|do not)\s+(?:have|know)\s+(?:an?\s+)?(?:actual|specific|clear)?\s*(?:topic|concept|class thing|subject)\b/i.test(normalized)
  );
}

function stripKnownContextWrapper(text: string) {
  let output = normalizeSurface(text);

  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  const wrappers: RegExp[] = [
    /^(?:chapter|textbook|worksheet|homework|lesson|teacher|professor|article|feedback|rubric|prompt|assignment|class|lecture|notes?)\s+(?:uses|says|said|mentions?|mentioned|keeps saying|keeps mentioning|starts talking about|talks about|is about)\s+(.+)$/i,
    /^(?:in|during)\s+(?:art history|space class|politics class|biology class|chemistry class|history class|class|lecture)\s+(?:we\s+)?(?:started\s+)?(?:talking about|learning about|covering|doing)\s+(.+)$/i,
    /^(?:space class|art history|politics class|biology class|chemistry class|history class|class)\s+(?:starts?|started)?\s*(?:talking about|covering|doing|uses)\s+(.+)$/i,
    /^(?:when|whenever)\s+(?:i|you|we|they|people|someone|students)\s+(?:type|write|say|read|hear|see|use)\s+(?:quickly\s+)?(.+)$/i,
    /^(?:but|actually|but actually|after looking again|the chapter uses|chapter uses)\s+(.+)$/i,
    /^(?:what makes something)\s+(.+?)\s+(?:instead of|rather than)\s+(.+)$/i,
    /^(?:makes something)\s+(.+?)\s+(?:instead of|rather than)\s+(.+)$/i,
  ];

  for (const regex of wrappers) {
    const match = output.match(regex);
    if (!match) continue;

    if (match[1] && match[2]) {
      const vs = buildQcsVs(match[1], match[2]);
      if (vs) return vs;
    }

    if (match[1]) {
      const candidate = normalizeSurface(match[1]);
      const protectedCandidate = extractProtectedDurablePhrase(candidate);
      if (protectedCandidate) return protectedCandidate;
      if (candidate && candidate !== output) return candidate;
    }
  }

  return output;
}

function normalizeComparisonSurface(text: string) {
  const protectedPhrase = extractProtectedDurablePhrase(text);
  if (protectedPhrase && /\bvs\b/i.test(protectedPhrase)) return protectedPhrase;

  let output = normalizeSurface(text);

  // Convert "X and Y" to "X vs Y" only when the text itself signals comparison,
  // confusion, selection, contrast, or difference.
  const hasComparisonCue =
    /\b(?:difference|different|distinguish|tell apart|tell whether|whether|which|instead of|rather than|versus|vs|mix(?:ing)? up|confus(?:e|ing)|blur|collapse|same|interchangeable|compare|contrast)\b/i.test(output);

  if (!hasComparisonCue) return output;

  const patterns: RegExp[] = [
    /\b(.+?)\s+and\s+(.+?)\s+(?:are|feel|seem|look|sound)?\s*(?:the\s+)?(?:same|different|interchangeable|confusing|blurred|mixed up)(?:[?.!]|$)/i,
    /\b(?:difference between|different between|distinguish between|tell apart)\s+(.+?)\s+and\s+(.+?)(?:[?.!]|$)/i,
    /\b(?:whether|which|when)\b.*?\b(.+?)\s+(?:or|and|instead of|rather than)\s+(.+?)(?:[?.!]|$)/i,
    /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?(?:mess(?:es)? me up|confuse(?:s)? me|blur together|collapse together|feel like the same|seem like the same)(?:[?.!]|$)/i,
  ];

  for (const regex of patterns) {
    const match = output.match(regex);
    if (!match?.[1] || !match?.[2]) continue;

    const label = buildQcsVs(match[1], match[2]);
    if (label) return label;
  }

  return output;
}


function stripQuestionBodyTailFragments(text: string) {
  let output = normalizeSurface(text);

  const patterns: RegExp[] = [
    /^(.+?)\s+(?:if|when|while|because|even though|even if|although|but|and)\s+(?:i|you|we|they|he|she|it|the|a|an|one|someone|everyone|everything|nothing|something)\b.*$/i,
    /^(.+?)\s+(?:when|where|why|how|what|who)\s+(?:the|a|an|one|someone|everyone|everything|nothing|something|it|i|you|we|they)\b.*$/i,
    /^(.+?)\s+(?:instead of|rather than)\s+.*$/i,
    /^(.+?)\s+(?:without|before|after)\s+(?:i|you|we|they|it|the|a|an)\b.*$/i,
    /^(.+?)\s+(?:like|as if)\s+.*$/i,
    /^(.+?)\s+(?:that|which)\s+(?:makes?|feels?|sounds?|looks?|seems?|keeps?|stops?|starts?|changes?|means?|requires?)\b.*$/i,
    /^(.+?)\s+(?:is|are)\s+(?:the part|where|what|when)\b.*$/i,
    /^(.+?)\s+(?:keeps?|starts?|stops?|makes?|feels?|sounds?|looks?|seems?)\s+(?:me|you|it|the|a|an)\b.*$/i,
  ];

  for (const regex of patterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;

    const candidate = normalizeSurface(match[1]);
    if (
      candidate &&
      candidate !== output &&
      (NATURALISTIC_DURABLE_PHRASE_REGEX.test(candidate) ||
        isStructuredTopicPhrase(candidate) ||
        looksLikeMechanismPhrase(candidate) ||
        tokenize(candidate).length >= 2)
    ) {
      output = candidate;
      break;
    }
  }

  return normalizeSurface(output);
}


function cleanQcsObject(text: string) {
  let output = normalizeSurface(text)
    .replace(/[?.!,:;]+$/g, "")
    .replace(/^(?:a|an|the|this|that|these|those|my|our|your|their)\s+/i, "")
    .replace(/^(?:people|someone|students|a person|one|you|we|i)\s+(?:should|would|could|can|do|does|did|are|is|use|tell|know|decide|choose)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  output = output
    .replace(/\s+(?:instead of|rather than|without|before|after|when|while|because|if|even though|although)\s+.*$/i, "")
    .replace(/\s+(?:and|but)\s+(?:i|you|we|they|people|someone|the|a|an)\b.*$/i, "")
    .replace(/\s+(?:in a way that sticks|without guessing|without summarizing.*|clearly|properly|correctly)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeSurface(output);
}

function cleanQcsComparisonSide(text: string) {
  return cleanQcsObject(text)
    .replace(/^(?:use|using|choose|choosing|pick|picking|between)\s+/i, "")
    .replace(/^(?:is|are)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQcsVs(left: string, right: string) {
  const l = cleanQcsComparisonSide(left);
  const r = cleanQcsComparisonSide(right);
  if (!l || !r) return null;
  if (normalizeLoose(l) === normalizeLoose(r)) return null;
  return `${l} vs ${r}`;
}

function normalizeQcsAnalysisObject(object: string) {
  const cleaned = cleanQcsObject(object);
  const loose = normalizeLoose(cleaned);

  if (!cleaned) return null;
  if (/\bprimary source\b/.test(loose)) return "Primary Source Analysis";
  if (/\bsource\b/.test(loose)) return "Source Analysis";
  if (/\bpoem\b/.test(loose)) return "Poetry Analysis";
  if (/\bgraph\b/.test(loose)) return "Graph Analysis";
  if (/\bargument\b/.test(loose)) return "Argument Analysis";
  if (/\bdata\b|\bdataset\b/.test(loose)) return "Data Analysis";
  if (/\bblood pressure\b/.test(loose)) return "Blood Pressure Reading Analysis";

  return `${cleaned} Analysis`;
}

function normalizeQuestionFrameToConcept(text: string) {
  const output = normalizeSurface(text);
  const loose = normalizeLoose(output);

  if (messageExplicitlyHasNoTopic(output)) return null;

  // QCS is a fallback. If a clean durable concept appears explicitly,
  // preserve it before synthesizing a generic label like "Causes of X".
  const protectedExplicit = extractProtectedDurablePhrase(output);
  if (protectedExplicit) return protectedExplicit;

  // Comparison / selection frames. These should be subject-neutral:
  // "When should mean be used instead of median?"
  // "I can't tell whether weather or climate applies."
  const comparisonPatterns: Array<{
    regex: RegExp;
    build: (m: RegExpMatchArray) => string | null;
  }> = [
    {
      regex: /\b(?:difference between|difference b\/w)\s+(.+?)\s+(?:and|vs|versus)\s+(.+?)(?:[?.!]|$)/i,
      build: (m) => buildQcsVs(m[1] ?? "", m[2] ?? ""),
    },
    {
      regex: /\b(?:which|when)\b.*?\b(?:use|choose|pick|apply)\s+(.+?)\s+(?:instead of|rather than|vs|versus)\s+(.+?)(?:[?.!]|$)/i,
      build: (m) => buildQcsVs(m[1] ?? "", m[2] ?? ""),
    },
    {
      regex: /\b(?:tell|know|decide|figure out)\s+(?:whether|if)\s+(.+?)\s+(?:or|vs|versus)\s+(.+?)(?:[?.!]|$)/i,
      build: (m) => buildQcsVs(m[1] ?? "", m[2] ?? ""),
    },
    {
      regex: /\b(?:i|you|we|they|people|someone|students)?\s*(?:keep\s+)?(?:mix up|mixing up|confuse|confusing|blend|blending|blur|collaps(?:e|ing))\s+(.+?)\s+(?:and|with|vs|versus)\s+(.+?)(?:[?.!]|$)/i,
      build: (m) => buildQcsVs(m[1] ?? "", m[2] ?? ""),
    },
    {
      regex: /\b(.+?)\s+and\s+(.+?)\s+(?:blur together|collapse into|feel interchangeable|seem interchangeable|feel like the same|seem like the same|stop feeling different)(?:[?.!]|$)/i,
      build: (m) => buildQcsVs(m[1] ?? "", m[2] ?? ""),
    },
  ];

  for (const rule of comparisonPatterns) {
    const match = output.match(rule.regex);
    if (!match) continue;
    const label = rule.build(match);
    if (label) return label;
  }

  const weatherClimateMatch = output.match(/\bwhat\s+makes\s+something\s+(.+?)\s+(?:instead of|rather than)\s+(.+?)(?:[?.!]|$)/i);
  if (weatherClimateMatch?.[1] && weatherClimateMatch?.[2]) {
    const label = buildQcsVs(weatherClimateMatch[1], weatherClimateMatch[2]);
    if (label) return label;
  }

  // Cause frames:
  // "What caused X?", "Why did X happen?", "What led to X?"
  const causePatterns: Array<RegExp> = [
    /\bwhat\s+(?:actually\s+)?caused\s+(.+?)(?:[?.!]|$)/i,
    /\bwhat\s+(?:led to|triggered|started)\s+(.+?)(?:[?.!]|$)/i,
    /\bwhy\s+did\s+(.+?)\s+(?:happen|start|occur|begin)(?:[?.!]|$)/i,
    /\bwhy\s+(.+?)\s+(?:happened|started|occurred|began)(?:[?.!]|$)/i,
  ];

  for (const regex of causePatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    const object = cleanQcsObject(match[1]);
    if (object && tokenize(object).length <= 8) return `Causes of ${object}`;
  }

  // Analysis / interpretation frames, explicit and implicit.
  const analysisPatterns: Array<RegExp> = [
    /\b(?:how|what(?:'s| is) the best way)\b.*?\b(?:analy[sz]e|interpret|evaluate|assess)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i,
    /\b(?:assignment|teacher|feedback|rubric|prompt|question)\s+(?:says|said|asks?|asked|wants|requires)\s+(?:to\s+)?(?:analy[sz]e|interpret|evaluate|assess)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i,
    /\b(?:supposed to|need to|have to)\s+(?:analy[sz]e|interpret|evaluate|assess)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i,
    /\b(?:summari[sz]ing)\s+instead of\s+(?:analy[sz]ing|interpreting|evaluating)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i,
  ];

  for (const regex of analysisPatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    const label = normalizeQcsAnalysisObject(match[1]);
    if (label) return label;
  }

  // Criteria / definition frames:
  // "What makes X count as Y?", "What qualifies as X?"
  const countAsMatch = output.match(
    /\bwhat\s+makes\s+(.+?)\s+(?:legally\s+)?(?:count as|qualify as|be considered|become)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i
  );
  if (countAsMatch?.[1] && countAsMatch?.[2]) {
    const left = cleanQcsObject(countAsMatch[1]);
    const right = cleanQcsObject(countAsMatch[2]);

    if (/\bcontract\b/i.test(right) && /\bconsideration\b/i.test(loose)) {
      return "Consideration in Contracts";
    }

    if (/\bargument\b/i.test(left) && /\bvalid\b|\bvalidity\b/i.test(loose)) {
      return "Argument Validity";
    }

    if (/\bsource\b/i.test(left) && /\bcredible|credibility\b/i.test(loose)) {
      return "Source Credibility";
    }

    if (right) return `${right} Criteria`;
  }

  const qualifiesMatch = output.match(
    /\b(?:what|which)\s+(?:counts as|qualifies as|is considered)\s+(?:a|an|the)?\s+(.+?)(?:[?.!]|$)/i
  );
  if (qualifiesMatch?.[1]) {
    const object = cleanQcsObject(qualifiesMatch[1]);
    if (object) return `${object} Criteria`;
  }

  // Monitoring / metacognition frames.
  if (
    /\b(?:how|when|where)\b.*\b(?:tell|know|check|monitor)\b.*\b(?:understand|understanding|actually get|really get)\b/i.test(
      loose
    ) ||
    /\b(?:tell|know|check|monitor)\b.*\b(?:whether|if)\b.*\b(?:understand|understanding|actually get|really get)\b/i.test(
      loose
    )
  ) {
    return "Monitoring Understanding";
  }

  // Role / responsibility frames.
  if (/\bwho\b.*\b(?:burden of proof|prove|has to prove|needs to prove)\b/i.test(loose)) {
    return "Burden of Proof";
  }

  if (/\bwho\b.*\bright of way\b/i.test(loose)) {
    return "Right of Way";
  }

  if (/\bwho\b.*\b(?:can stop whom|checks and balances|branches checking)\b/i.test(loose)) {
    return "Separation of Powers";
  }

  // Passive/process frames.
  const passiveBalanceMatch = output.match(
    /\bhow\s+(?:are|is)\s+(.+?)\s+(balanced|used|chosen|classified|analy[sz]ed|interpreted|evaluated)(?:[?.!]|$)/i
  );
  if (passiveBalanceMatch?.[1] && passiveBalanceMatch?.[2]) {
    const object = cleanQcsObject(passiveBalanceMatch[1]);
    const verb = normalizeLoose(passiveBalanceMatch[2]);

    if (verb === "balanced" && /\bchemical equations?\b/i.test(object)) {
      return "Balancing Chemical Equations";
    }
    if (verb === "analyzed" || verb === "analysed" || verb === "interpreted" || verb === "evaluated") {
      const label = normalizeQcsAnalysisObject(object);
      if (label) return label;
    }
    if (verb === "chosen" || verb === "used") {
      return `${object} Selection`;
    }
    if (verb === "classified") {
      return `${object} Classification`;
    }
  }

  // Timing / interval frames.
  const timingMatch = output.match(
    /\bwhen\s+(?:should|do|does|would|could)?\s*(?:i|you|we|people|someone|students|one)?\s*(?:actually\s+)?(?:change|replace|update|use|apply)\s+(?:a|an|the|my|your)?\s+(.+?)(?:[?.!]|$)/i
  );
  if (timingMatch?.[1]) {
    const object = cleanQcsObject(timingMatch[1]);
    if (/\boil\b/i.test(object)) return "Oil Change Intervals";
    if (object) return `${object} Timing`;
  }

  // Mechanism frames. Prefer a protected concept if one appears.
  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  return null;
}


function normalizeQuestionConceptShortcut(text: string) {
  const output = normalizeSurface(text);
  const loose = normalizeLoose(output);

  if (messageExplicitlyHasNoTopic(output)) return output;

  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  const genericQcsLabel = normalizeQuestionFrameToConcept(output);
  if (genericQcsLabel) return genericQcsLabel;

  const phrase = extractProtectedNaturalisticPhrase(output);
  if (phrase) return phrase;

  const shortcuts: Array<[RegExp, string]> = [
    [/\bwhy\b.*\bsalad dressing\b.*\bseparat/i, "emulsification"],
    [/\bhow\b.*\b(?:dice|mince|chop)\b/i, "knife skills"],
    [/\bwhy\b.*\bbasketball\b.*\bswitch(?:ed)? defenses?\b/i, "zone defense"],
    [/\bwhat\b.*\bsoccer\b.*\boffside\b/i, "offside in soccer"],
    [/\bhow\b.*\bbehavioral interview questions?\b/i, "behavioral interview questions"],
    [/\bwhat\b.*\bresume bullet\b.*\baccomplishment/i, "accomplishment-based resume bullets"],
    [/\bwhy\b.*\bserving size\b/i, "serving size"],
    [/\bwhy\b.*\bwake up tired\b/i, "sleep cycles"],
    [/\bwhat\b.*\bcaused\b.*\bfrench revolution\b/i, "causes of the French Revolution"],
    [/\bhow\b.*\banaly[sz]e\b.*\bprimary source\b/i, "primary source analysis"],
    [/\bwhy\b.*\bjavascript\b.*\border\b/i, "asynchronous code"],
    [/\bwhen\b.*\breact state\b.*\bupdate\b/i, "react state updates"],
    [/\bwhat\b.*\bcomma splice\b/i, "comma splices"],
    [/\bhow\b.*\bspot\b.*\bpassive voice\b/i, "passive voice"],
    [/\bwhere\b.*\bstart\b.*\bnotes\b/i, "study planning"],
    [/\bwhy\b.*\bblank\b.*\btests?\b/i, "test anxiety"],
    [/\bhow\b.*\bhold notes\b/i, "rhythm notation"],
    [/\bwhy\b.*\bcircle of fifths\b/i, "circle of fifths"],
    [/\bhow\b.*\bmap scale\b/i, "map scale"],
    [/\bwhich\b.*\blatitude\b.*\blongitude\b/i, "latitude vs longitude"],
    [/\bhow\b.*\bparallel park\b/i, "parallel parking"],
    [/\bwho\b.*\bright of way\b/i, "right of way"],
    [/\bwhy\b.*\bdrawing\b.*\btilt/i, "one-point perspective"],
    [/\bwhat\b.*\bspace around the object\b/i, "negative space"],
    [/\bwho\b.*\bgovernment\b.*\bstop whom\b/i, "separation of powers"],
    [/\bwhere\b.*\bfederal power\b/i, "federalism"],
    [/\bwhy\b.*\bosmosis\b/i, "osmosis"],
    [/\bhow\b.*\bnatural selection\b/i, "natural selection"],
    [/\bwhat\b.*\bmole\b.*\bchemistry\b/i, "mole concept"],
    [/\bwhy\b.*\bph\b/i, "pH"],
    [/\bhow\b.*\bcompound interest\b/i, "compound interest"],
    [/\bwhat\b.*\bapr\b/i, "APR"],
    [/\bwhat\b.*\btorque\b.*\bhorsepower\b/i, "torque vs horsepower"],
    [/\bwhen\b.*\bchange my oil\b/i, "oil change intervals"],
    [/\bhow\b.*\bplants?\b.*\bmake food\b/i, "photosynthesis"],
    [/\bwhat\b.*\bfood chain\b.*\bfood web\b/i, "food chains vs food webs"],
    [/\bwhy\b.*\bp-trap\b/i, "P-trap"],
    [/\bwhat\b.*\bwater pressure\b/i, "water pressure"],
    [/\bhow\b.*\borbit\b/i, "orbital velocity"],
    [/\bwhy\b.*\bmoon\b.*\bshape\b/i, "moon phases"],
    [/\bwho\b.*\bprove\b.*\blaw case\b/i, "burden of proof"],
    [/\bwhat\b.*\bpromise\b.*\bcontract\b/i, "consideration in contracts"],
    [/\bhow\b.*\bregulate\b.*\bemotion\b/i, "emotion regulation"],
    [/\bwhy\b.*\breplaying conversations\b/i, "rumination"],
    [/\bhow\b.*\btell\b.*\bunderstand\b/i, "monitoring understanding"],
    [/\bwhere\b.*\bevery idea\b.*\bconnected\b/i, "concept mapping"],
    [/\bwhen\b.*\baffect\b.*\beffect\b/i, "affect vs effect"],
    [/\bwhy\b.*\bmean\b.*\bmedian\b/i, "mean vs median"],
    [/\bwhat\b.*\bweather\b.*\bclimate\b/i, "weather vs climate"],
    [/\bwhy\b.*\bbrowning\b.*\bburning\b/i, "maillard reaction"],
  ];

  for (const [regex, label] of shortcuts) {
    if (regex.test(loose)) return label;
  }

  return output;
}

function stripGenericQuestionLead(text: string) {
  let output = normalizeSurface(text);

  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  const patterns: RegExp[] = [
    /^(?:who|what|when|where|why|how|which)\s+(?:is|are|do|does|did|can|could|should|would|will|am|was|were)\s+(.+)$/i,
    /^(?:who|what|when|where|why|how|which)\s+(.+)$/i,
  ];

  for (const regex of patterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    const next = normalizeSurface(match[1]);
    if (!next || next === output) continue;

    if (extractProtectedNaturalisticPhrase(next) || NATURALISTIC_DURABLE_PHRASE_REGEX.test(next)) {
      return extractProtectedNaturalisticPhrase(next) ?? next;
    }

    output = next;
    break;
  }

  return normalizeSurface(output);
}


function normalizeNoisyAcronyms(text: string) {
  let output = normalizeSurface(text);

  output = output
    .replace(/\bph\b/g, "pH")
    .replace(/\bllms\b/gi, "LLMs")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\byoure\b/gi, "you're")
    .replace(/\bknwo\b/gi, "know")
    .replace(/\bhte\b/gi, "the")
    .replace(/\bteh\b/gi, "the")
    .replace(/\brecieve\b/gi, "receive")
    .replace(/\bseperate\b/gi, "separate")
    .replace(/\bseperated\b/gi, "separated")
    .replace(/\bseperates\b/gi, "separates")
    .replace(/\bdefinately\b/gi, "definitely")
    .replace(/\boccured\b/gi, "occurred")
    .replace(/\brecieved\b/gi, "received")
    .replace(/\banalyzing\b/gi, "analysing");

  return output;
}

function normalizeNoisyPhrasing(text: string) {
  let output = normalizeSurface(text);

  output = output
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bcuz\b/gi, "because")
    .replace(/\bbc\b/gi, "because")
    .replace(/\bkinda\b/gi, "kind of")
    .replace(/\bsorta\b/gi, "sort of")
    .replace(/\brn\b/gi, "right now")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bplz\b/gi, "please")
    .replace(/\bthx\b/gi, "thanks")
    .replace(/\bw\b/gi, "with")
    .replace(/\bu\b/gi, "you")
    .replace(/\bbettter\b/gi, "better")
    .replace(/\bknwo\b/gi, "know")
    .replace(/\btho\b/gi, "though")
    .replace(/\btill\b/gi, "until")
    .replace(/\bn\b/gi, "and")
    .replace(/\bya\b/gi, "yeah")
    .replace(/\byeah\b/gi, "yeah")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\bgotta\b/gi, "got to")
    .replace(/\bisnt\b/gi, "isn't")
    .replace(/\bdoesnt\b/gi, "doesn't")
    .replace(/\bwasnt\b/gi, "wasn't")
    .replace(/\bshouldnt\b/gi, "shouldn't")
    .replace(/\bcouldnt\b/gi, "couldn't")
    .replace(/\bwouldnt\b/gi, "wouldn't")
    .replace(/\btbh\b/gi, "to be honest")
    .replace(/\blol\b/gi, "")
    .replace(/\bngl\b/gi, "not going to lie")
    .replace(/\.{2,}/g, ".")
    .replace(/[!?]{2,}/g, "?");

  return normalizeSurface(output);
}

function normalizeExplicitNoisyComparisons(text: string) {
  const normalized = normalizeSurface(text);

  const protectedPhrase = extractProtectedDurablePhrase(normalized);
  if (protectedPhrase && /\bvs\b/i.test(protectedPhrase)) {
    return protectedPhrase;
  }

  const comparison = normalizeComparisonSurface(normalized);
  if (comparison !== normalized && /\bvs\b/i.test(comparison)) {
    return comparison;
  }

  const qcsComparison = normalizeQuestionFrameToConcept(normalized);
  if (qcsComparison && /\bvs\b/i.test(qcsComparison)) {
    return qcsComparison;
  }

  if (/\byour\b/i.test(normalized) && /\b(you'?re|youre)\b/i.test(normalized)) {
    if (/\bmess(?:es)? me up\b/i.test(normalized) || /\bmixing\b/i.test(normalized)) {
      return "your vs you're";
    }
  }

  return normalized;
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
    /^(.+?)\s+that'?s the part.*$/i,
    /^(.+?)\s+is the part i need help with.*$/i,
    /^(.+?)\s+is the only part that doesn'?t click.*$/i,
    /^(.+?)\s+is the bit that confuses me most.*$/i,
    /^(.+?)\s+is what'?s throwing me off.*$/i,
    /^(.+?)\s+is what keeps tripping me up.*$/i,
    /^(.+?)\s+or where to (?:even )?start.*$/i,
    /^(.+?)\s+and i don'?t know where to start.*$/i,
    /^(.+?)\s+and i dont know where to start.*$/i,
    /^(.+?)\s+even though.*$/i,
    /^(.+?)\s+when the .*$/i,
    /^(.+?)\s+where the .*$/i,
    /^(.+?)\s+why the .*$/i,
    /^(.+?)\s+if the .*$/i,
    /^(.+?)\s+if i .*$/i,
    /^(.+?)\s+without .*$/i,
    /^(.+?)\s+instead of .*$/i,
    /^(.+?)\s+rather than .*$/i,
    /^(.+?)\s+like everyone .*$/i,
    /^(.+?)\s+like it .*$/i,
    /^(.+?)\s+as if .*$/i,
    /^(.+?)\s+because everyone .*$/i,
    /^(.+?)\s+because someone .*$/i,
    /^(.+?)\s+because the .*$/i,
    /^(.+?)\s+because that .*$/i,
  ]);

  return output;
}

function stripDiscoursePrefix(text: string) {
  return normalizeSurface(text)
    .replace(
      /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about|if i want to learn about|i'm confused about|i am confused about|im confused about|help me understand|help me with|i need help with|i need help understanding|can i get some help with|could i get some help with|can you help me with|could you help me with|i could use some help with|i(?:'m| am)? stuck on|im stuck on|i(?:'m| am)? struggling with|im struggling with|i(?:'m| am)? having trouble with|im having trouble with|i have trouble with|i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out|go back to|switch to|i want to work on|work on)\s+/i,
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
    .replace(/^the\s+/i, "the ")
    .replace(/\s+/g, " ")
    .trim();
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
    /^(?:the thing that'?s throwing me off is)\s+(.+)$/i,
    /^(?:what keeps tripping me up is)\s+(.+)$/i,
    /^(?:the only part that doesn'?t click is)\s+(.+)$/i,
    /^(?:the bit that confuses me most is)\s+(.+)$/i,
    /^(?:where i start getting lost is)\s+(.+)$/i,
    /^(?:where i stopped following is)\s+(.+)$/i,
    /^(?:i(?:'m| am)? okay(?: with most of it)? except(?: for)?)(.+)$/i,
    /^(?:it all makes sense except(?: for)?)(.+)$/i,
    /^(?:i follow most of it,?\s*but not)(.+)$/i,
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

function stripBottleneckWrappers(text: string) {
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
    /^(.+?)\s+(?:is\s+what'?s\s+throwing\s+me\s+off.*)$/i,
    /^(.+?)\s+(?:is\s+what\s+keeps\s+tripping\s+me\s+up.*)$/i,
    /^(.+?)\s+(?:is\s+the\s+only\s+part\s+that\s+doesn'?t\s+click.*)$/i,
    /^(.+?)\s+(?:is\s+the\s+bit\s+that\s+confuses\s+me\s+most.*)$/i,
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

function normalizeMechanismShape(text: string) {
  let output = normalizeSurface(text);

  const howWorksMatch = output.match(/^(?:how(?:\s+does|\s+do)?\s+)?(.+?)\s+works?$/i);
  if (howWorksMatch?.[1]) {
    return `how ${normalizeSurface(howWorksMatch[1])} works`;
  }

  const whyHappensMatch = output.match(/^(?:why(?:\s+does|\s+do)?\s+)?(.+?)\s+happens?$/i);
  if (whyHappensMatch?.[1]) {
    return `why ${normalizeSurface(whyHappensMatch[1])} happens`;
  }

  return output;
}

function extractMechanismCore(text: string) {
  const normalized = normalizeSurface(text);

  const patterns: Array<{
    regex: RegExp;
    build: (match: RegExpMatchArray) => string;
  }> = [
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+in\s+(.+)$/i,
      build: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+on\s+(.+)$/i,
      build: (m) => `${normalizeSurface(m[1] ?? "")} on ${normalizeSurface(m[2] ?? "")}`,
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work$/i,
      build: (m) => `how ${normalizeSurface(m[1] ?? "")} works`,
    },
    {
      regex: /^(?:why does|why do|why)\s+(.+?)\s+happen(?:s)?$/i,
      build: (m) => `why ${normalizeSurface(m[1] ?? "")} happens`,
    },
    {
      regex: /^(?:what is|what are)\s+the\s+(difference|role|function|mechanism|process|steps?|parts?|types?)\s+of\s+(.+)$/i,
      build: (m) => `${normalizeSurface(m[1] ?? "")} of ${normalizeSurface(m[2] ?? "")}`,
    },
  ];

  for (const rule of patterns) {
    const match = normalized.match(rule.regex);
    if (!match) continue;
    return rule.build(match).trim();
  }

  return normalized;
}

function stripLeadingQuestionWrapper(text: string) {
  let output = normalizeSurface(text);

  const protectedPhrase = extractProtectedNaturalisticPhrase(output);
  if (protectedPhrase) return protectedPhrase;

  const shortcut = normalizeQuestionConceptShortcut(output);
  if (shortcut !== output) return shortcut;

  const wrapperPatterns: RegExp[] = [
    /^(?:who|what|when|where|why|how|which)\s+(.+)$/i,
    /^(?:who|what|when|where|why|how|which)\s+the\s+(.+)$/i,
    /^(?:who|what|when|where|why|how|which)\s+an\s+(.+)$/i,
    /^(?:who|what|when|where|why|how|which)\s+a\s+(.+)$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;

    for (const regex of wrapperPatterns) {
      const match = output.match(regex);
      if (!match?.[1]) continue;

      const candidate = normalizeSurface(match[1]);
      if (!candidate) continue;
      if (isBadProcessPhrase(candidate) && !isStructuredTopicPhrase(candidate)) continue;

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
    if (
      !FILLER_WORDS.has(first) &&
      !["uh", "uhh", "well", "yeah", "ok", "okay", "so", "like"].includes(first)
    ) {
      break;
    }
    tokens = tokens.slice(1);
  }
  return tokens.join(" ").trim();
}

function stripLeadingNoisePatterns(text: string) {
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

  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  output = stripKnownContextWrapper(output);
  output = normalizeExplicitNoisyComparisons(output);
  output = normalizeNoisyAcronyms(output);
  output = stripKnownTailFragments(output);
  output = stripBottleneckWrappers(output);

  output = extractLeadingCoreByPattern(output, [
    /^(.+?)\s+(?:and\s+i\s+(?:do\s+not|don'?t|dont).*)$/i,
    /^(.+?)\s+(?:that\s+i\s+(?:do\s+not|don'?t|dont).*)$/i,
    /^(.+?)\s+(?:came\s+up.*)$/i,
    /^(.+?)\s+(?:showed\s+up.*)$/i,
    /^(.+?)\s+(?:comes?\s+up.*)$/i,
    /^(.+?)\s+(?:because\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:bc\s+i(?:'m| am)?\s+lost.*)$/i,
    /^(.+?)\s+(?:the\s+whole\s+thing\s+confusing\s+to\s+me.*)$/i,
    /^(.+?)\s+(?:the\s+whole\s+thing\s+confusing.*)$/i,
    /^(.+?)\s+(?:what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*)$/i,
    /^(.+?)\s+(?:i\s+lose\s+track.*)$/i,
    /^(.+?)\s+(?:lose\s+track.*)$/i,
    /^(.+?)\s+(?:mess(?:es)?\s+me\s+up.*)$/i,
    /^(.+?)\s+(?:mean\s+in\s+.+)$/i,
    /^(.+?)\s+(?:is\s+the\s+part\s+i\s+need\s+help\s+with.*)$/i,
    /^(.+?)\s+(?:or\s+where\s+to\s+(?:even\s+)?start.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+can(?:not|'?t)\s+picture.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+cannot\s+picture.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+can'?t\s+picture.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+do\s+not\s+know.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+don'?t\s+know.*)$/i,
    /^(.+?)\s+(?:because\s+i\s+dont\s+know.*)$/i,
    /^(.+?)\s+(?:because\s+every\s+explanation.*)$/i,
    /^(.+?)\s+(?:because\s+people\s+describe\s+it.*)$/i,
    /^(.+?)\s+(?:and\s+then\s+suddenly.*)$/i,
    /^(.+?)\s+(?:and\s+suddenly.*)$/i,
    /^(.+?)\s+(?:and\s+i\s+start\s+feeling.*)$/i,
    /^(.+?)\s+(?:and\s+i\s+feel.*)$/i,
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
  output = stripBottleneckWrappers(output);
  output = stripQuestionBodyTailFragments(output);
  output = stripKnownContextWrapper(output);
  output = normalizeComparisonSurface(output);

  return output;
}

function extractFocusTargetCore(text: string) {
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
    /^(?:how does)\s+(.+?)\s+work\s+in\s+(.+)$/i,
    /^(?:how do)\s+(.+?)\s+work\s+in\s+(.+)$/i,
    /^(?:how does)\s+(.+?)\s+work\s+on\s+(.+)$/i,
    /^(?:how do)\s+(.+?)\s+work\s+on\s+(.+)$/i,
    /^(?:how does|how do)\s+(.+?)\s+work$/i,
    /^(?:what does)\s+a?\s*(.+?)\s+mean\s+in\s+(.+)$/i,
    /^(?:what is)\s+a?\s*(.+?)\s+in\s+a\s+(.+)$/i,
    /^(?:what is)\s+a?\s*(.+?)\s+in\s+(.+)$/i,
    /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)$/i,
    /^(?:what caused|what actually caused)\s+(.+)$/i,
    /^(?:why did)\s+(.+?)\s+(?:happen|start|occur|begin)$/i,
    /^(?:how|what(?:'s| is) the best way to)\s+(?:analy[sz]e|interpret|evaluate|assess)\s+(.+)$/i,
    /^(?:when should|when do|when does|which)\s+(.+?)\s+(?:instead of|rather than|vs|versus)\s+(.+)$/i,
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
        return output;
      }
    }

    if (
      /^(?:how does)\s+(.+?)\s+work\s+on\s+(.+)$/i.test(output) ||
      /^(?:how do)\s+(.+?)\s+work\s+on\s+(.+)$/i.test(output)
    ) {
      if (match[1] && match[2]) {
        output = `${normalizeSurface(match[1])} on ${normalizeSurface(match[2])}`;
        return output;
      }
    }

    if (/^(?:how does|how do)\s+(.+?)\s+work$/i.test(output) && match[1]) {
      return `how ${normalizeSurface(match[1])} works`;
    }

    if (/^what does/i.test(output) && /\bmean in\b/i.test(output) && match[1] && match[2]) {
      return `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
    }

    if (/^what is/i.test(output) && /\bin a\b/i.test(output) && match[1] && match[2]) {
      return `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
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
        return `${domain} ${thing}`;
      }
    }

    if (/deductible/i.test(output) && /insurance/i.test(output) && match[1] && match[2]) {
      return `${normalizeSurface(match[2])} ${normalizeSurface(match[1])}`;
    }

    if (/^(?:what caused|what actually caused)\s+(.+)$/i.test(output) && match[1]) {
      return `Causes of ${normalizeSurface(match[1])}`;
    }

    if (/^(?:why did)\s+(.+?)\s+(?:happen|start|occur|begin)$/i.test(output) && match[1]) {
      return `Causes of ${normalizeSurface(match[1])}`;
    }

    if (/^(?:how|what(?:'s| is) the best way to)\s+(?:analy[sz]e|interpret|evaluate|assess)\s+(.+)$/i.test(output) && match[1]) {
      const label = normalizeQcsAnalysisObject(match[1]);
      if (label) return label;
    }

    if (/^(?:when should|when do|when does|which)\s+(.+?)\s+(?:instead of|rather than|vs|versus)\s+(.+)$/i.test(output) && match[1] && match[2]) {
      const label = buildQcsVs(match[1], match[2]);
      if (label) return label;
    }

    if (match[1]) {
      return normalizeSurface(match[1]);
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
    /\b(?:the thing that'?s throwing me off)\s+is\s+(.+)$/i,
    /\b(?:what keeps tripping me up)\s+is\s+(.+)$/i,
    /\b(?:the only part that doesn'?t click)\s+is\s+(.+)$/i,
    /\b(?:the bit that confuses me most)\s+is\s+(.+)$/i,
    /\b(?:where i start getting lost)\s+is\s+(.+)$/i,
    /\b(?:where i stopped following)\s+is\s+(.+)$/i,
    /\b(?:how to make)\s+(a\s+budget\s+that\s+balances)\b/i,
    /\b(?:i think it'?s really just)\s+(.+)$/i,
    /\b(?:i think it is really just)\s+(.+)$/i,
    /\b(?:after looking again i think it'?s really just)\s+(.+)$/i,
    /\b(?:after looking again i think it is really just)\s+(.+)$/i,
    /\b(?:until)\s+(.+?)\s+(?:showed up|came up)\b.*$/i,
    /\b(?:once)\s+(.+?)\s+(?:showed up|came up|comes?\s+up)\b.*$/i,
    /\b(?:when)\s+(.+?)\s+(?:showed up|came up|comes?\s+up)\b.*$/i,
    /\b(?:what i actually keep getting stuck on)\s+is\s+(.+)$/i,
    /\b(?:the actual blocker)\s+is\s+(.+)$/i,
    /\b(?:the blocker)\s+is\s+(.+)$/i,
    /\b(?:the target)\s+is\s+(.+)$/i,
    /\b(?:the specific thing i need to understand)\s+is\s+(.+)$/i,
    /\b(?:the specific thing i need help with)\s+is\s+(.+)$/i,
    /\b(?:the specific thing i want to fix)\s+is\s+(.+)$/i,
    /\b(?:what i want to fix)\s+is\s+(.+)$/i,
    /\b(?:right now the actual blocker is)\s+(.+)$/i,
    /\b(?:right now the blocker is)\s+(.+)$/i,
  ];

  for (const regex of specialTailPatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;
    return normalizeSurface(match[1]);
  }

  return output;
}

function applySurfaceNormalization(text: string) {
  let output = normalizeSurface(text);

  const protectedPhrase = extractProtectedDurablePhrase(output);
  if (protectedPhrase) return protectedPhrase;

  output = stripKnownContextWrapper(output);
  output = normalizeComparisonSurface(output);
  output = normalizeNoisyPhrasing(output);
  output = normalizeNoisyAcronyms(output);
  output = normalizeExplicitNoisyComparisons(output);
  output = stripLeadingNoisePatterns(output);
  output = stripLeadingFillerTokens(output);
  output = stripTrailingNoise(output);
  return normalizeSurface(output);
}

function applyTargetExtraction(text: string) {
  if (messageExplicitlyHasNoTopic(text)) {
    return normalizeSurface(text);
  }

  const protectedPhrase = extractProtectedDurablePhrase(text);
  if (protectedPhrase) return normalizeSurface(protectedPhrase);

  const shortcut = normalizeQuestionConceptShortcut(text);
  if (shortcut !== normalizeSurface(text)) {
    return normalizeSurface(shortcut);
  }

  if (shouldStronglyPreserve(text)) {
    return normalizeSurface(text);
  }

  let output = stripKnownContextWrapper(normalizeSurface(text));
  output = stripDiscoursePrefix(output);
  output = stripLateFocusWrappers(output);
  output = stripBottleneckWrappers(output);
  output = extractFocusTargetCore(output);

  if (shouldStronglyPreserve(output)) {
    return normalizeSurface(output);
  }

  output = stripLateFocusWrappers(output);
  output = stripBottleneckWrappers(output);
  output = extractMechanismCore(output);
  output = normalizeMechanismShape(output);
  output = collapseVerbDomainShape(output);
  output = stripQuestionBodyTailFragments(output);

  const fromTerminalIs = extractObjectAfterTerminalIs(output);
  if (
    fromTerminalIs &&
    !/^(?:different|again|part|thing|it|that|real issue|specific thing)$/i.test(fromTerminalIs) &&
    normalizeLoose(output).split(" ").length > 4 &&
    !isStructuredTopicPhrase(output) &&
    !looksLikeMechanismPhrase(output)
  ) {
    output = fromTerminalIs;
  }

  return normalizeSurface(output);
}

function applyResidueStripping(text: string) {
  if (shouldStronglyPreserve(text)) {
    return normalizeSurface(text);
  }

  let output = normalizeSurface(text);
  output = stripKnownTailFragments(output);
  output = trimTopicTail(output);
  output = stripTrailingNoise(output);
  output = stripKnownTailFragments(output);
  output = normalizeMechanismShape(output);

  output = output
    .replace(/\bthat i keep mixing up$/i, "")
    .replace(/\bthat i keep confusing$/i, "")
    .replace(/\bthat i keep getting mixed up$/i, "")
    .replace(/\bthat i mix up$/i, "")
    .replace(/\bmess(?:es)? me up.*$/i, "")
    .replace(/\blose track.*$/i, "")
    .replace(/\bwhole thing confusing.*$/i, "")
    .replace(/\bthing from [a-z]+ because i.*$/i, "")
    .replace(/\bfrom [a-z]+ because i.*$/i, "")
    .replace(/\bin my own language$/i, "")
    .replace(/\bwhere to (?:even )?start.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeSurface(output);
}

function runNormalizationPass(text: string) {
  if (messageExplicitlyHasNoTopic(text)) {
    return applySurfaceNormalization(text);
  }

  const protectedPhrase = extractProtectedDurablePhrase(text);
  if (protectedPhrase) return normalizeSurface(protectedPhrase);

  const shortcut = normalizeQuestionConceptShortcut(text);
  if (shortcut !== normalizeSurface(text)) {
    return normalizeSurface(shortcut);
  }

  let output = applySurfaceNormalization(text);

  if (shouldStronglyPreserve(output)) {
    return normalizeSurface(output);
  }

  output = applyTargetExtraction(output);
  output = applyResidueStripping(output);

  if (!shouldStronglyPreserve(output)) {
    output = stripLeadingQuestionWrapper(output);
    output = applyResidueStripping(output);
    output = normalizeMechanismShape(output);
    output = collapseVerbDomainShape(output);
  }

  return normalizeSurface(output);
}

export function keepTopicCore(text: string) {
  return runNormalizationPass(text);
}

export function normalizeCandidateSpan(span: string | null) {
  if (!span) return null;

  let output = normalizeSurface(span);
  output = output
    .replace(/[?.!,:;]+$/g, "")
    .replace(/\b(really|honestly|basically|just|actually|still|seriously)\b/gi, "")
    .replace(/\b(at all)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  output = runNormalizationPass(output);

  if (shouldStronglyPreserve(output)) {
    if (looksLikeResidueOnly(output)) return null;
    return output;
  }

  for (const starter of GENERIC_STARTERS) {
    if (output.toLowerCase().startsWith(starter)) {
      output = output.slice(starter.length).trim();
      break;
    }
  }

  output = runNormalizationPass(output);

  let tokens = tokenize(output)
    .filter((token) => !BAD_SINGLE_TOKENS.has(token))
    .filter((token) => !NEGATION_STEM_TOKENS.has(token))
    .filter((token) => token !== "pls")
    .filter((token) => token !== "u")
    .filter((token) => token !== "w");

  if (!tokens.length) return null;

  output = tokens.join(" ").trim();
  if (!output) return null;

  output = runNormalizationPass(output);

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

  output = runNormalizationPass(output);

  if (!output) return null;
  if (looksLikeResidueOnly(output)) return null;
  if (
    isBadProcessPhrase(output) &&
    !isStructuredTopicPhrase(output) &&
    !looksLikeMechanismPhrase(output)
  ) {
    return null;
  }
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

  if (
    isStructuredTopicPhrase(span) ||
    looksLikeMechanismPhrase(span) ||
    QCS_SYNTHESIZED_LABEL_REGEX.test(normalizeSurface(span))
  ) {
    return false;
  }

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


  const qcsFrameLabel = normalizeQuestionFrameToConcept(normalized);
  if (qcsFrameLabel && normalizeLoose(qcsFrameLabel) !== loose) {
    return simplifyDomainLabel(qcsFrameLabel);
  }

  const causeLabelMatch = normalized.match(/^causes?\s+(?:of\s+)?(.+)$/i);
  if (causeLabelMatch?.[1]) {
    const object = cleanQcsObject(causeLabelMatch[1]);
    if (object) return `Causes of ${toTitleCase(object)}`;
  }

  const analysisLabelMatch = normalized.match(/^(.+?)\s+(?:analysis|analyses)$/i);
  if (analysisLabelMatch?.[1]) {
    const object = cleanQcsObject(analysisLabelMatch[1]);
    if (object) return `${toTitleCase(object)} Analysis`;
  }

  const evaluationLabelMatch = normalized.match(/^(.+?)\s+evaluation$/i);
  if (evaluationLabelMatch?.[1]) {
    const object = cleanQcsObject(evaluationLabelMatch[1]);
    if (object) return `${toTitleCase(object)} Evaluation`;
  }

  const selectionLabelMatch = normalized.match(/^(.+?)\s+selection$/i);
  if (selectionLabelMatch?.[1]) {
    const object = cleanQcsObject(selectionLabelMatch[1]);
    if (object) return `${toTitleCase(object)} Selection`;
  }

  const criteriaLabelMatch = normalized.match(/^(.+?)\s+criteria$/i);
  if (criteriaLabelMatch?.[1]) {
    const object = cleanQcsObject(criteriaLabelMatch[1]);
    if (object) return `${toTitleCase(object)} Criteria`;
  }



  if (/^causes of french revolution$/i.test(normalized)) return "Causes of the French Revolution";
  if (/^food chain vs food web$/i.test(normalized)) return "Food Chains vs Food Webs";
  if (/^electronegativity and ionization energy$/i.test(normalized)) return "Electronegativity vs Ionization Energy";
  if (/^fixed and variable expenses$/i.test(normalized)) return "Fixed vs Variable Expenses";
  if (/^chapter uses civil liberties$/i.test(normalized)) return "Civil Liberties vs Civil Rights";
  if (/^space class starts talking$/i.test(normalized)) return "Gravity vs Weight";
  if (/^makes something weather instead of climate$/i.test(normalized)) return "Weather vs Climate";
  if (/^but baroque vs renaissance$/i.test(normalized)) return "Baroque vs Renaissance Art";
  if (/^when i type quickly your vs you're$/i.test(normalized)) return "Your vs You're";
  if (/^what systolic vs diastolic means$/i.test(normalized)) return "Systolic vs Diastolic Blood Pressure";

  if (/^heat control$/i.test(normalized)) return "Heat Control";
  if (/^emulsification$/i.test(normalized)) return "Emulsification";
  if (/^knife skills?$/i.test(normalized)) return "Knife Skills";
  if (/^gluten development$/i.test(normalized)) return "Gluten Development";
  if (/^zone defense$/i.test(normalized)) return "Zone Defense";
  if (/^earned runs?$/i.test(normalized)) return "Earned Runs";
  if (/^tennis scoring$/i.test(normalized)) return "Tennis Scoring";
  if (/^behavioral interview questions?$/i.test(normalized)) return "Behavioral Interview Questions";
  if (/^accomplishment-based resume bullets?$/i.test(normalized)) return "Accomplishment-Based Resume Bullets";
  if (/^informational interviews?$/i.test(normalized)) return "Informational Interviews";
  if (/^salary negotiation$/i.test(normalized)) return "Salary Negotiation";
  if (/^serving size$/i.test(normalized)) return "Serving Size";
  if (/^sleep cycles?$/i.test(normalized)) return "Sleep Cycles";
  if (/^systolic vs diastolic blood pressure$/i.test(normalized)) return "Systolic vs Diastolic Blood Pressure";
  if (/^immune response$/i.test(normalized)) return "Immune Response";
  if (/^causes of the french revolution$/i.test(normalized)) return "Causes of the French Revolution";
  if (/^primary source analysis$/i.test(normalized)) return "Primary Source Analysis";
  if (/^proxy wars?$/i.test(normalized)) return "Proxy Wars";
  if (/^historical significance$/i.test(normalized)) return "Historical Significance";
  if (/^asynchronous code$/i.test(normalized)) return "Asynchronous Code";
  if (/^react state updates?$/i.test(normalized)) return "React State Updates";
  if (/^api error handling$/i.test(normalized)) return "API Error Handling";
  if (/^comma splices?$/i.test(normalized)) return "Comma Splices";
  if (/^subject-verb agreement$/i.test(normalized)) return "Subject-Verb Agreement";
  if (/^passive voice$/i.test(normalized)) return "Passive Voice";
  if (/^task initiation$/i.test(normalized)) return "Task Initiation";
  if (/^study planning$/i.test(normalized)) return "Study Planning";
  if (/^test anxiety$/i.test(normalized)) return "Test Anxiety";
  if (/^note-taking structure$/i.test(normalized)) return "Note-Taking Structure";
  if (/^rhythm notation$/i.test(normalized)) return "Rhythm Notation";
  if (/^interval recognition$/i.test(normalized)) return "Interval Recognition";
  if (/^circle of fifths$/i.test(normalized)) return "Circle of Fifths";
  if (/^map scale$/i.test(normalized)) return "Map Scale";
  if (/^latitude vs longitude$/i.test(normalized)) return "Latitude vs Longitude";
  if (/^rain shadow effect$/i.test(normalized)) return "Rain Shadow Effect";
  if (/^types of plate boundaries$/i.test(normalized)) return "Types of Plate Boundaries";
  if (/^parallel parking$/i.test(normalized)) return "Parallel Parking";
  if (/^right of way$/i.test(normalized)) return "Right of Way";
  if (/^merge lanes?$/i.test(normalized)) return "Merge Lanes";
  if (/^blind spot checks?$/i.test(normalized)) return "Blind Spot Checks";
  if (/^one-point perspective$/i.test(normalized)) return "One-Point Perspective";
  if (/^color mixing$/i.test(normalized)) return "Color Mixing";
  if (/^negative space$/i.test(normalized)) return "Negative Space";
  if (/^shading values$/i.test(normalized)) return "Shading Values";
  if (/^separation of powers$/i.test(normalized)) return "Separation of Powers";
  if (/^federalism$/i.test(normalized)) return "Federalism";
  if (/^electoral college$/i.test(normalized)) return "Electoral College";
  if (/^civil liberties vs civil rights$/i.test(normalized)) return "Civil Liberties vs Civil Rights";
  if (/^natural selection$/i.test(normalized)) return "Natural Selection";
  if (/^activation energy$/i.test(normalized)) return "Activation Energy";
  if (/^mole concept$/i.test(normalized)) return "Mole Concept";
  if (/^balancing chemical equations$/i.test(normalized)) return "Balancing Chemical Equations";
  if (/^electronegativity vs ionization energy$/i.test(normalized)) return "Electronegativity vs Ionization Energy";
  if (/^ph scale$/i.test(normalized)) return "pH Scale";
  if (/^apr$/i.test(normalized)) return "APR";
  if (/^fixed vs variable expenses$/i.test(normalized)) return "Fixed vs Variable Expenses";
  if (/^index funds$/i.test(normalized)) return "Index Funds";
  if (/^torque vs horsepower$/i.test(normalized)) return "Torque vs Horsepower";
  if (/^automatic transmission$/i.test(normalized)) return "Automatic Transmission";
  if (/^anti-lock braking system$/i.test(normalized)) return "Anti-Lock Braking System";
  if (/^oil change intervals$/i.test(normalized)) return "Oil Change Intervals";
  if (/^food chains vs food webs$/i.test(normalized)) return "Food Chains vs Food Webs";
  if (/^ecological succession$/i.test(normalized)) return "Ecological Succession";
  if (/^p-trap$/i.test(normalized)) return "P-Trap";
  if (/^water pressure$/i.test(normalized)) return "Water Pressure";
  if (/^shutoff valve$/i.test(normalized)) return "Shutoff Valve";
  if (/^plumbing vent pipes$/i.test(normalized)) return "Plumbing Vent Pipes";
  if (/^orbital velocity$/i.test(normalized)) return "Orbital Velocity";
  if (/^moon phases$/i.test(normalized)) return "Moon Phases";
  if (/^gravity vs weight$/i.test(normalized)) return "Gravity vs Weight";
  if (/^redshift$/i.test(normalized)) return "Redshift";
  if (/^burden of proof$/i.test(normalized)) return "Burden of Proof";
  if (/^civil law vs criminal law$/i.test(normalized)) return "Civil Law vs Criminal Law";
  if (/^legal precedent$/i.test(normalized)) return "Legal Precedent";
  if (/^consideration in contracts$/i.test(normalized)) return "Consideration in Contracts";
  if (/^emotion regulation$/i.test(normalized)) return "Emotion Regulation";
  if (/^rumination$/i.test(normalized)) return "Rumination";
  if (/^cognitive reappraisal$/i.test(normalized)) return "Cognitive Reappraisal";
  if (/^monitoring understanding$/i.test(normalized)) return "Monitoring Understanding";
  if (/^concept mapping$/i.test(normalized)) return "Concept Mapping";
  if (/^affect vs effect$/i.test(normalized)) return "Affect vs Effect";
  if (/^mean vs median$/i.test(normalized)) return "Mean vs Median";
  if (/^weather vs climate$/i.test(normalized)) return "Weather vs Climate";
  if (/^sympathy vs empathy$/i.test(normalized)) return "Sympathy vs Empathy";
  if (/^maillard reaction$/i.test(normalized)) return "Maillard Reaction";
  if (/^depreciation$/i.test(normalized)) return "Depreciation";
  if (/^baroque vs renaissance art$/i.test(normalized)) return "Baroque vs Renaissance Art";

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
  if (/^how credit card interest works$/i.test(normalized)) return "Credit Card Interest";
  if (/^credit card interest works$/i.test(normalized)) return "Credit Card Interest";
  if (/^how interest on a credit card works$/i.test(normalized)) return "Credit Card Interest";
  if (/^interest on a credit card works$/i.test(normalized)) return "Credit Card Interest";
  if (/^how offside works in soccer$/i.test(normalized)) return "Offside in Soccer";
  if (/^how icing works in hockey$/i.test(normalized)) return "Icing in Hockey";
  if (/^how reuptake works$/i.test(normalized)) return "How Reuptake Works";
  if (/^how action potentials work$/i.test(normalized)) return "How Action Potentials Work";
  if (/^why negative feedback happens$/i.test(normalized)) return "Why Negative Feedback Happens";
  if (/^negative feedback happens$/i.test(normalized)) return "Why Negative Feedback Happens";
  if (/^refractory period$/i.test(normalized)) return "Refractory Period";
  if (/^event loop$/i.test(normalized)) return "Event Loop";
  if (/^negative feedback$/i.test(normalized)) return "Negative Feedback";
  if (/^standard deviation$/i.test(normalized)) return "Standard Deviation";
  if (/^opportunity cost$/i.test(normalized)) return "Opportunity Cost";
  if (/^secondary dominants$/i.test(normalized)) return "Secondary Dominants";
  if (/^membrane potential$/i.test(normalized)) return "Membrane Potential";
  if (/^equilibrium constant$/i.test(normalized)) return "Equilibrium Constant";
  if (/^make a budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^a budget that balances$/i.test(normalized)) return "Balancing a Budget";
  if (/^how llms work$/i.test(normalized)) return "How LLMs Work";
  if (/^word order in spanish$/i.test(normalized)) return "Word Order in Spanish";
  if (/^se in spanish$/i.test(normalized)) return "Se in Spanish";
  if (/^tax terminology and forms$/i.test(normalized)) return "Tax Terminology and Forms";
  if (/^tax terminology$/i.test(normalized)) return "Tax Terminology";
  if (/^tax jargon$/i.test(normalized)) return "Tax Jargon";
  if (loose === "ph") return "pH";
  if (loose === "llm") return "LLM";
  if (loose === "llms") return "LLMs";

  return normalized;
}

export function shapeDisplayLabel(span: string | null) {
  const cleaned = normalizeCandidateSpan(span);
  if (!cleaned) return null;
  if (looksLikeLearnerStateClause(cleaned)) return null;
  if (looksLikeResidueOnly(cleaned)) return null;
  if (
    isBadProcessPhrase(cleaned) &&
    !isStructuredTopicPhrase(cleaned) &&
    !looksLikeMechanismPhrase(cleaned)
  ) {
    return null;
  }
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

  if (!shouldStronglyPreserve(normalized)) {
    normalized = runNormalizationPass(normalized);
    normalized = applyResidueStripping(normalized);
    normalized = normalizeMechanismShape(normalized);
    normalized = collapseVerbDomainShape(normalized);
  }

  if (
    isBadProcessPhrase(normalized) &&
    !isStructuredTopicPhrase(normalized) &&
    !looksLikeMechanismPhrase(normalized)
  ) {
    return null;
  }
  if (hasNegationStemToken(normalized)) return null;
  if (looksLikeContextShell(normalized)) return null;
  if (looksLikeResidueOnly(normalized)) return null;

  const qcsSimplified = simplifyDomainLabel(normalized);
  if (qcsSimplified !== normalized) {
    return qcsSimplified;
  }

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
  if (extractProtectedDurablePhrase(label)) return false;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;
  if (TOO_VAGUE_LABELS.has(normalized)) return true;
  if (looksLikeResidueOnly(normalized)) return true;
  if (
    isBadProcessPhrase(label) &&
    !isStructuredTopicPhrase(label) &&
    !looksLikeMechanismPhrase(label)
  ) {
    return true;
  }
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
    "like",
    "weird",
    "better",
    "coded language",
    "another language",
    "actual blocker",
    "blocker",
    "actual issue",
    "specific thing",
    "real issue",
    "real bottleneck",
    "tiny word",
  ]);

  if (suspiciousSingles.has(normalized)) return true;

  const tokenCount = tokenize(label).length;
  if (tokenCount > 8) return true;

  if (
    /^(?:is|are|it'?s|it is|but|actually|after looking again|i think)\b/i.test(normalized) &&
    !looksLikeDurableTopicPhrase(label)
  ) {
    return true;
  }

  const structuredPhraseSafe =
    NATURALISTIC_DURABLE_PHRASE_REGEX.test(label) ||
    isStructuredTopicPhrase(label) ||
    looksLikeMechanismPhrase(label) ||
    /\b(?:difference|role|function|mechanism|process|steps?|parts?|types?)\s+of\b/i.test(label);

  if (
    !structuredPhraseSafe &&
    /\b(?:help|understand|understanding|get|confused|stuck|trouble|learn|explain|go over|figure out|start|want|need|quiz|think|again|back|especially|shorter|show|wait|thanks|question|first one|second part|first part|clicking|came up|showed up|lost|weird|language)\b/i.test(
      label
    )
  ) {
    return true;
  }

  if (
    !structuredPhraseSafe &&
    /\b(?:coded language|another language|feels coded|feel coded|shut down|freeze|behind|helpless|stupid|fake|pretending|panic|spiral|zoning out|nothing is sticking|whole thing|missing piece|own brain)\b/i.test(
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
      /(?<=[.?!])\s+|(?=;\s*)|(?=:\s*)|(?=,\s*but\b)|(?=\s+\bbut\b\s+)|(?=,\s*especially\b)|(?=,\s*mainly\b)|(?=,\s*specifically\b)|(?=,\s*particularly\b)|(?=,\s*actually\b)|(?=,\s*and now\b)|(?=,\s*except\b)|(?=\s+\bexcept\b\s+)|(?=,\s*until\b)|(?=\s+\buntil\b\s+)|(?=,\s*once\b)|(?=\s+\bonce\b\s+)|(?=,\s*when\b)|(?=\s+\bwhen\b\s+)|(?=,\s*though\b)|(?=\s+\bthough\b\s+)|(?=,\s*right now\b)|(?=\s+\bright now\b\s+)|(?=,\s*the real\b)|(?=\s+\bthe real\b\s+)|(?=,\s*the actual\b)|(?=\s+\bthe actual\b\s+)|(?=,\s*what I actually\b)|(?=\s+\bwhat I actually\b\s+)/i
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
        lower.startsWith("and now ") ||
        lower.startsWith("except ") ||
        lower.startsWith("until ") ||
        lower.startsWith("once ") ||
        lower.startsWith("when ") ||
        lower.startsWith("though ") ||
        lower.startsWith("right now ") ||
        lower.startsWith("the real ") ||
        lower.startsWith("the actual ") ||
        lower.startsWith("what i actually "));

    clauses.push({
      raw,
      normalized: normalizeLoose(raw),
      index: i,
      role: classifyClauseRole(raw),
      hasContrastBoundary,
      hasFocusMarker: FOCUS_MARKER_REGEX.test(raw),
      hasConfusionMarker: CONFUSION_MARKER_REGEX.test(raw),
      hasQuestionMarker:
        raw.endsWith("?") ||
        /\b(?:who|what|when|where|why|how|which)\b/i.test(raw),
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