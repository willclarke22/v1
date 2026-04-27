import { mockTopics } from "@/lib/mock-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { VectorInfo } from "@/types/contracts";
import { clamp, isPosition, normalizeDiagnosis } from "./shared";
import {
  type RetrievalCandidate,
  type TopicLabelingInput,
  type TopicLabelingResult,
  type TopicMessageIntent,
} from "./topic-labeling/topic-label-contract";
import { runDeterministicTopicLabeling } from "./topic-labeling/topic-label-deterministic";
import {
  dedupe,
  normalizeLoose,
  normalizeSurface,
  semanticTokens,
} from "./topic-labeling/topic-label-normalization";

type MockTopic = (typeof mockTopics)[number];
export type RouteTopic = MockTopic;

export type ResolutionDecisionAction =
  | "stay_on_active_topic"
  | "reuse_existing_topic"
  | "create_new_topic"
  | "no_confident_decision";

export type TopicMatchResult = {
  matchedTopic: RouteTopic | null;
  vectorInfo: VectorInfo;
  shouldCreateNewTopic: boolean;
  resolutionKind:
    | "matched_existing"
    | "created_new_candidate"
    | "fallback_active_topic"
    | "fallback_existing_topic"
    | "no_match";
  resolvedLabel: string | null;
  matchConfidence: number;
  resolutionTrace?: TopicResolutionTrace;
};

export type DeterministicTopicResolutionSnapshot = {
  resolutionKind:
    | "matched_existing"
    | "created_new_candidate"
    | "fallback_active_topic"
    | "fallback_existing_topic"
    | "no_match";
  resolvedLabel: string | null;
  matchConfidence: number;
  vectorInfo: VectorInfo;
};

type ResolutionTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

type ResolutionTimingDebug = {
  enabled: boolean;
  total_ms: number;
  cache_hits: number;
  cache_misses: number;
  steps: ResolutionTimingStep[];
};

type MessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

type GranularityHint = "broad" | "medium" | "narrow" | "unknown";

type FollowupSignals = {
  anaphoricFollowup: boolean;
  subpartFollowup: boolean;
  mixedFollowup: boolean;
  metaContinuation: boolean;
  returnToPrevious: boolean;
  explicitSwitch: boolean;
  explicitSwitchTarget: string | null;
};

type CandidateInterpretation = {
  canonicalLabel: string | null;
  conceptSpan: string | null;
  questionAboutTopic: string | null;
  frame: MessageFrame;
  labelConfidence: number;
  specificity:
    | "too_vague"
    | "broad_but_usable"
    | "good"
    | "very_specific"
    | string;
  granularityHint: GranularityHint;
  referencesActiveTopic: boolean;
  switchCue: boolean;
  continuationCue: boolean;
  subpartCue: boolean;
  explicitTopicSwitchTarget: string | null;
  suspiciousLabel: boolean;
  subpartLikeLabel: boolean;
  ambiguityFlags: string[];
  followupSignals: FollowupSignals;

  pairedTargetLike: boolean;
  bottleneckLike: boolean;
  mechanismLike: boolean;
  domainAnchorLike: boolean;
  terminologyBarrierLike: boolean;
  structureBarrierLike: boolean;
  conceptPhraseLike: boolean;
  questionSynthesisLike: boolean;
  questionSynthesisFrame: string | null;
  questionTriggerKind: string | null;
  questionWord: string | null;
  questionVerb: string | null;
  questionObject: string | null;
  synthesizedLabel: string | null;
  durableConceptLike: boolean;
  structurallyStrongLabel: boolean;
  nullOnlyEmotionalLike: boolean;
  labelerCreateRecommended: boolean;
};

type TopicScoreBreakdown = {
  exactNameMatch: number;
  containedMatch: number;
  conceptOverlap: number;
  questionOverlap: number;
  semanticRetrieval: number;
  retrievalRankBonus: number;
  activeTopicBonus: number;
  continuityBonus: number;
  switchPenalty: number;
  granularityAlignment: number;
  confidenceBonus: number;
  vaguePenalty: number;
  ambiguityPenalty: number;
  suspiciousLabelPenalty: number;
  pairedAlignment: number;
  bottleneckAlignment: number;
  mechanismAlignment: number;
  terminologyAlignment: number;
  domainCollapsePenalty: number;
  finalScore: number;
};

type ScoredTopic = {
  topic: RouteTopic;
  similarity: number;
  breakdown: TopicScoreBreakdown;
};

type ResolutionHypothesisKind =
  | "stay_active"
  | "switch_existing"
  | "create_new"
  | "ambiguous";

type ResolutionHypothesis = {
  kind: ResolutionHypothesisKind;
  score: number;
  reasons: string[];
  topic: RouteTopic | null;
  label: string | null;
};

type ResolutionAdjudication = {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  vectorInfo: VectorInfo;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopicScore: ScoredTopic | null;
  hypotheses: ResolutionHypothesis[];
  winner: ResolutionHypothesis;
  fallbackRecommended: boolean;
  decisionAction: ResolutionDecisionAction;
  trace: TopicResolutionTrace;
};

export type TopicResolutionTrace = {
  interpretation: {
    canonicalLabel: string | null;
    conceptSpan: string | null;
    questionAboutTopic: string | null;
    frame: MessageFrame;
    labelConfidence: number;
    specificity: string;
    granularityHint: GranularityHint;
    referencesActiveTopic: boolean;
    switchCue: boolean;
    continuationCue: boolean;
    subpartCue: boolean;
    suspiciousLabel: boolean;
    subpartLikeLabel: boolean;
    ambiguityFlags: string[];
    followupSignals: FollowupSignals;

    pairedTargetLike: boolean;
    bottleneckLike: boolean;
    mechanismLike: boolean;
    domainAnchorLike: boolean;
    terminologyBarrierLike: boolean;
    structureBarrierLike: boolean;
    conceptPhraseLike: boolean;
    questionSynthesisLike: boolean;
    questionSynthesisFrame: string | null;
    questionTriggerKind: string | null;
    questionWord: string | null;
    questionVerb: string | null;
    questionObject: string | null;
    synthesizedLabel: string | null;
    durableConceptLike: boolean;
    structurallyStrongLabel: boolean;
    nullOnlyEmotionalLike: boolean;
    labelerCreateRecommended: boolean;
  };
  candidates: Array<{
    topicId: string;
    topicName: string;
    similarity: number;
    breakdown: TopicScoreBreakdown;
  }>;
  hypotheses: Array<{
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicName: string | null;
    label: string | null;
  }>;
  winner: {
    kind: ResolutionHypothesisKind;
    score: number;
    reasons: string[];
    topicId: string | null;
    topicName: string | null;
    label: string | null;
  };
  topGap: number;
  decisionAction: ResolutionDecisionAction;
  fallbackRecommended: boolean;
  timing?: ResolutionTimingDebug;
};

const STRONG_REUSE_TOPIC_THRESHOLD = 0.66;
const MID_REUSE_TOPIC_THRESHOLD = 0.54;
const ACTIVE_TOPIC_FALLBACK_THRESHOLD = 0.46;
const CREATE_NEW_CONFIDENCE_THRESHOLD = 0.72;
const LOW_CONFIDENCE_CREATE_NEW_FLOOR = 0.55;
const CANDIDATE_COMPETITION_GAP_THRESHOLD = 0.08;
const AMBIGUOUS_WIN_THRESHOLD = 0.62;
const HIGH_USEFULNESS_MARGIN = 0.1;

function roundResolutionMs(value: number) {
  return Math.round(value * 100) / 100;
}

function createTopicResolutionTimer() {
  const enabled = process.env.MYWAY_TOPIC_RESOLUTION_TIMING !== "off";
  const startedAt = performance.now();
  let lastMark = startedAt;
  const steps: ResolutionTimingStep[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  function step(label: string) {
    if (!enabled) return;

    const now = performance.now();

    steps.push({
      label,
      duration_ms: roundResolutionMs(now - lastMark),
      elapsed_ms: roundResolutionMs(now - startedAt),
    });

    lastMark = now;
  }

  function recordCacheHit() {
    if (enabled) cacheHits += 1;
  }

  function recordCacheMiss() {
    if (enabled) cacheMisses += 1;
  }

  function finish(): ResolutionTimingDebug | undefined {
    if (!enabled) return undefined;

    return {
      enabled,
      total_ms: roundResolutionMs(performance.now() - startedAt),
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      steps,
    };
  }

  return {
    step,
    recordCacheHit,
    recordCacheMiss,
    finish,
  };
}

const LABELING_RESULT_CACHE_MAX_SIZE = 100;
const labelingResultCache = new Map<string, TopicLabelingResult>();

function makeLabelingResultCacheKey(input: TopicLabelingInput) {
  return JSON.stringify({
    raw_message: input.raw_message.trim().toLowerCase(),
    active_topic_id: input.active_topic_id ?? null,
    active_topic_name: input.active_topic_name ?? null,
    recent_topic_names: input.recent_topic_names,
    retrieval_candidates: input.retrieval_candidates.map((candidate) => ({
      topic_id: candidate.topic_id,
      topic_name: candidate.topic_name,
      similarity: roundResolutionMs(candidate.similarity),
    })),
  });
}

function rememberLabelingResult(cacheKey: string, result: TopicLabelingResult) {
  labelingResultCache.set(cacheKey, result);

  if (labelingResultCache.size <= LABELING_RESULT_CACHE_MAX_SIZE) return;

  const firstKey = labelingResultCache.keys().next().value;
  if (firstKey) labelingResultCache.delete(firstKey);
}

const NATURALISTIC_DURABLE_LABEL_REGEX =
  /\b(?:heat control|emulsification|knife skills|gluten development|zone defense|offside in soccer|earned runs|tennis scoring|behavioral interview questions|accomplishment-based resume bullets|informational interviews|salary negotiation|serving size|sleep cycles|systolic vs diastolic blood pressure|immune response|causes of the french revolution|primary source analysis|proxy wars|historical significance|asynchronous code|react state updates|api error handling|recursion|comma splices|subject-verb agreement|passive voice|task initiation|study planning|test anxiety|note-taking structure|rhythm notation|secondary dominants|interval recognition|circle of fifths|map scale|latitude vs longitude|rain shadow effect|types of plate boundaries|parallel parking|right of way|merge lanes|blind spot checks|one-point perspective|color mixing|negative space|shading values|separation of powers|federalism|electoral college|civil liberties vs civil rights|osmosis|natural selection|mitosis vs meiosis|activation energy|mole concept|balancing chemical equations|electronegativity vs ionization energy|ph scale|compound interest|apr|fixed vs variable expenses|index funds|torque vs horsepower|automatic transmission|anti-lock braking system|oil change intervals|photosynthesis|food chains vs food webs|pollination|ecological succession|p-trap|water pressure|shutoff valve|plumbing vent pipes|orbital velocity|moon phases|gravity vs weight|redshift|burden of proof|civil law vs criminal law|legal precedent|consideration in contracts|emotion regulation|rumination|cognitive reappraisal|monitoring understanding|concept mapping|affect vs effect|mean vs median|weather vs climate|sympathy vs empathy|maillard reaction|depreciation|baroque vs renaissance art)\b/i;

const QCS_SYNTHESIZED_LABEL_REGEX =
  /^(?:causes of .+|why .+ happens?|how .+ works?|.+ analysis|.+ evaluation|.+ criteria|.+ selection|.+ timing|monitoring .+|balancing .+|.+ vs .+)$/i;

function labelLooksQuestionSynthesisDurable(label: string | null) {
  if (!label) return false;
  return QCS_SYNTHESIZED_LABEL_REGEX.test(normalizeSurface(label));
}


const PROTECTED_DURABLE_RESOLUTION_LABEL_REGEX =
  /\b(?:earned runs|tennis scoring|merge lanes|shutoff valve|balancing chemical equations|zone defense|offside in soccer|right of way|knife skills|task initiation|civil liberties vs civil rights|gravity vs weight|weather vs climate|baroque vs renaissance art|your vs you're|systolic vs diastolic blood pressure|electronegativity vs ionization energy|fixed vs variable expenses|food chains vs food webs|mean vs median|consideration in contracts|causes of the french revolution|primary source analysis|monitoring understanding|apr)\b/i;

function labelLooksProtectedDurable(label: string | null) {
  if (!label) return false;
  const normalized = normalizeSurface(label);
  return (
    PROTECTED_DURABLE_RESOLUTION_LABEL_REGEX.test(normalized) ||
    labelLooksNaturalisticDurable(normalized) ||
    labelLooksQuestionSynthesisDurable(normalized) ||
    labelLooksStructurallyDurable(normalized)
  );
}

function labelLooksQcsOverSynthesized(label: string | null) {
  if (!label) return false;
  const normalized = normalizeLoose(label);
  if (!normalized) return false;

  return (
    /^causes of .{25,}$/.test(normalized) ||
    /^how to .{20,}$/.test(normalized) ||
    /\b(?:assignment matters vs not start|how to steer vs brake|dice mince vs chop|basketball team switch defenses)\b/i.test(normalized)
  );
}

function labelExplicitlyNullTopic(message: string) {
  const normalized = normalizeLoose(message);

  return (
    /\b(?:no|not|don'?t have|dont have|do not have)\b.*\b(?:specific|actual|clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:no specific|no actual|no clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:i|we)\s+(?:don'?t|dont|do not)\s+(?:have|know)\s+(?:an?\s+)?(?:actual|specific|clear)?\s*(?:topic|concept|class thing|subject)\b/i.test(normalized)
  );
}


const BROAD_UMBRELLA_TOPIC_NAMES = new Set([
  "spanish",
  "taxes",
  "tax",
  "forms",
  "neurotransmitters",
  "neurotransmission",
  "action potential",
  "action potentials",
  "meiosis",
  "mitosis",
  "budgeting",
  "waves",
  "sound",
  "triangles",
  "chemistry",
  "biology",
  "physics",
  "programming",
  "coding",
  "finance",
  "insurance",
  "cars",
  "driving",
  "law",
  "history",
  "geography",
  "music",
  "art",
  "politics",
  "cooking",
  "health",
  "nature",
  "space",
  "plumbing",
]);

const ACTIVE_TOPIC_ANAPHORIC_FOLLOWUP_REGEXES: RegExp[] = [
  /^(?:quiz me on (?:that|it))\.?$/i,
  /^(?:can you quiz me on (?:that|it))\??$/i,
  /^(?:test me on (?:that|it))\.?$/i,
  /^(?:can you test me on (?:that|it))\??$/i,
  /^(?:ask me about (?:that|it))\.?$/i,
  /^(?:can you ask me about (?:that|it))\??$/i,
  /^(?:go over (?:that|it) again)\.?$/i,
  /^(?:can we go over (?:that|it) again)\??$/i,
  /^(?:explain (?:that|it) again)\.?$/i,
  /^(?:can you explain (?:that|it) again)\??$/i,
  /^(?:wait,?\s+what happens right before that)\??$/i,
  /^(?:wait,?\s+what happens right before it)\??$/i,
  /^(?:yeah,?\s+that exact part)\.?$/i,
  /^(?:yeah,?\s+it'?s that one that keeps messing me up)\.?$/i,
  /^(?:i still (?:don't|dont) (?:really )?get it)\.?$/i,
  /^(?:i keep mixing them up in word problems)\.?$/i,
  /^(?:can we do that again)\??$/i,
  /^(?:show me another example)\.?$/i,
  /^(?:can you say that again(?: but shorter)?)\??$/i,
  /^(?:say that again(?: but shorter)?)\??$/i,
  /^(?:wait)\.?$/i,
  /^(?:wait,?\s+what do you mean)\??$/i,
  /^(?:what do you mean)\??$/i,
];

const ACTIVE_TOPIC_SUBPART_FOLLOWUP_REGEXES: RegExp[] = [
  /^(?:what about the .+ part)\??$/i,
  /^(?:especially the .+ part)\.?$/i,
  /^(?:no,?\s*i meant the .+ part)\.?$/i,
  /^(?:no,?\s*the .+ part)\.?$/i,
  /^(?:the .+ part)\.?$/i,
  /^(?:the scoring part)\.?$/i,
  /^(?:the sweeping part)\.?$/i,
  /^(?:no,?\s*the second part)\.?$/i,
  /^(?:no,?\s*the first part(?: of that)?)\.?$/i,
  /^(?:can we go over (?:that|it) again,\s*especially the .+ part)\??$/i,
  /^(?:go over (?:that|it) again,\s*especially the .+ part)\.?$/i,
  /^(?:explain (?:that|it) again,\s*especially the .+ part)\.?$/i,
  /^(?:can you explain (?:that|it) again,\s*especially the .+ part)\??$/i,
  /^(?:yeah,?\s*that exact part,\s*especially the .+ part)\.?$/i,
];

const META_CONTINUATION_REGEXES: RegExp[] = [
  /^(?:thanks(?:,?\s*that helped)?)\.?$/i,
  /^(?:show me another example)\.?$/i,
  /^(?:can you say that again(?: but shorter)?)\??$/i,
  /^(?:say that again(?: but shorter)?)\??$/i,
  /^(?:wait)\.?$/i,
  /^(?:wait,?\s*what do you mean)\??$/i,
  /^(?:what do you mean)\??$/i,
];

const RETURN_TO_PREVIOUS_TOPIC_REGEXES: RegExp[] = [
  /^(?:ok(?:ay)?\s+back to the first one)\.?$/i,
  /^(?:back to the first one)\.?$/i,
  /^(?:go back)\.?$/i,
  /^(?:never mind,?\s*go back)\.?$/i,
  /^(?:actually,?\s*go back)\.?$/i,
  /^(?:wait,?\s*go back)\.?$/i,
  /^(?:go back to the first one)\.?$/i,
];

const EXPLICIT_EXISTING_TOPIC_SWITCH_PREFIXES: RegExp[] = [
  /^(?:go back to)\s+(.+?)\.?$/i,
  /^(?:switch to)\s+(.+?)\.?$/i,
  /^(?:back to)\s+(.+?)\.?$/i,
  /^(?:actually,?\s*go back to)\s+(.+?)\.?$/i,
  /^(?:wait,?\s*go back to)\s+(.+?)\.?$/i,
  /^(?:let'?s talk about)\s+(.+?)\.?$/i,
  /^(?:now about)\s+(.+?)\.?$/i,
];

function emptyVectorInfo(): VectorInfo {
  return {
    top_k_topic_names: [],
    top_k_topic_ids: [],
    top_k_similarity_scores: [],
  };
}

function normalizeVectorInfo(vectorInfo?: VectorInfo | null): VectorInfo {
  if (!vectorInfo) {
    return emptyVectorInfo();
  }

  return {
    top_k_topic_names: Array.isArray(vectorInfo.top_k_topic_names)
      ? vectorInfo.top_k_topic_names.filter((item): item is string => typeof item === "string")
      : [],
    top_k_topic_ids: Array.isArray(vectorInfo.top_k_topic_ids)
      ? vectorInfo.top_k_topic_ids.filter((item): item is string => typeof item === "string")
      : [],
    top_k_similarity_scores: Array.isArray(vectorInfo.top_k_similarity_scores)
      ? vectorInfo.top_k_similarity_scores.filter(
          (item): item is number => typeof item === "number" && !Number.isNaN(item)
        )
      : [],
  };
}

function hasUsableVectorInfo(vectorInfo?: VectorInfo | null): boolean {
  const normalized = normalizeVectorInfo(vectorInfo);

  return (
    normalized.top_k_topic_ids.length > 0 ||
    normalized.top_k_topic_names.length > 0 ||
    normalized.top_k_similarity_scores.length > 0
  );
}

function mergeVectorInfos(
  primary?: VectorInfo | null,
  fallback?: VectorInfo | null
): VectorInfo {
  if (hasUsableVectorInfo(primary)) {
    return normalizeVectorInfo(primary);
  }

  if (hasUsableVectorInfo(fallback)) {
    return normalizeVectorInfo(fallback);
  }

  return emptyVectorInfo();
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

function semanticTokenize(text: string): string[] {
  return semanticTokens(text).map((token) => singularizeToken(token.toLowerCase()));
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

function normalizeTopicText(text: string) {
  return normalizeLoose(text);
}

function hasAmbiguityFlag(labeling: TopicLabelingResult, flag: string) {
  return labeling.diagnostics.ambiguity_flags.includes(flag);
}

function mapIntentToFrame(intent: TopicMessageIntent): MessageFrame {
  switch (intent) {
    case "quiz_request":
      return "quiz_request";
    case "confusion_help":
      return "confusion_help";
    case "explain_request":
      return "explain_request";
    case "compare_request":
      return "compare_request";
    case "apply_request":
      return "apply_request";
    case "attempt_like":
      return "attempt_like";
    case "general_question":
    case "unclear":
    default:
      return "general";
  }
}

function looksLikeActiveTopicAnaphoricFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return ACTIVE_TOPIC_ANAPHORIC_FOLLOWUP_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeActiveTopicSubpartFollowup(message: string) {
  const normalized = normalizeSurface(message);
  return ACTIVE_TOPIC_SUBPART_FOLLOWUP_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeMixedAnaphoricSubpartFollowup(message: string) {
  const normalized = normalizeSurface(message);

  const hasAnaphoricCue =
    /\b(?:that|it)\b/i.test(normalized) && /\b(?:again|exact part)\b/i.test(normalized);

  const hasSubpartCue =
    /\b(?:especially the .+ part|the .+ part|scoring part|sweeping part)\b/i.test(normalized);

  const hasGoOverCue = /\b(?:go over|explain)\b/i.test(normalized);

  return (hasAnaphoricCue && hasSubpartCue) || (hasGoOverCue && hasSubpartCue);
}

function looksLikeMetaContinuation(message: string) {
  const normalized = normalizeSurface(message);
  return META_CONTINUATION_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeReturnToPreviousTopic(message: string) {
  const normalized = normalizeSurface(message);
  return RETURN_TO_PREVIOUS_TOPIC_REGEXES.some((regex) => regex.test(normalized));
}

function looksLikeExplicitTopicSwitch(message: string) {
  const normalized = normalizeSurface(message);

  return (
    /\b(?:switch to|go back to|back to|now about|let'?s talk about)\b/i.test(normalized) ||
    /\b(?:another topic|different topic|separate topic|something else)\b/i.test(normalized)
  );
}

function buildFollowupSignals(message: string): FollowupSignals {
  return {
    anaphoricFollowup: looksLikeActiveTopicAnaphoricFollowup(message),
    subpartFollowup: looksLikeActiveTopicSubpartFollowup(message),
    mixedFollowup: looksLikeMixedAnaphoricSubpartFollowup(message),
    metaContinuation: looksLikeMetaContinuation(message),
    returnToPrevious: looksLikeReturnToPreviousTopic(message),
    explicitSwitch: looksLikeExplicitTopicSwitch(message),
    explicitSwitchTarget: extractExplicitSwitchTargetString(message),
  };
}

function computeGranularityHint(text: string | null): GranularityHint {
  if (!text) return "unknown";

  const tokens = semanticTokenize(text);
  if (!tokens.length) return "unknown";

  if (tokens.length >= 6) return "broad";
  if (tokens.length <= 1) return "narrow";

  if (
    /\b(?:how|why|when|where|difference|compare|versus|vs|rules of|parts of|steps of)\b/i.test(
      text
    )
  ) {
    return "medium";
  }

  if (tokens.length <= 2) return "narrow";
  if (tokens.length <= 4) return "medium";

  return "broad";
}

function labelLooksPairedTarget(label: string | null) {
  if (!label) return false;
  return /\b in \b|\b on \b|\b of \b|\b vs \b/i.test(label);
}

function labelLooksMechanismLike(label: string | null) {
  if (!label) return false;
  return /\bhow\b|\bwhy\b|\bprocess\b|\bmechanism\b|\bfunction\b|\brole\b|\bword order\b/i.test(
    label
  );
}

function labelLooksTerminologyBarrierLike(label: string | null) {
  if (!label) return false;
  return /\bterminology\b|\bjargon\b|\bforms?\b/i.test(label);
}

function labelLooksStructureBarrierLike(message: string, label: string | null) {
  if (!label) return false;
  return (
    /\bword order\b|\bse\b|\bsmall words\b/i.test(message) &&
    /\bword order\b|\bse\b|\bspanish\b/i.test(label)
  );
}


function labelLooksStructurallyDurable(label: string | null) {
  if (!label) return false;

  if (labelLooksQuestionSynthesisDurable(label)) return true;

  return (
    /\bvs\b/i.test(label) ||
    /\b of \b/i.test(label) ||
    /\b in \b/i.test(label) ||
    /\b on \b/i.test(label) ||
    /\bhow\b.*\bwork\b/i.test(label) ||
    /\bdifference between\b/i.test(label) ||
    /\bterminology\b/i.test(label) ||
    /\bjargon\b/i.test(label) ||
    /\bforms?\b/i.test(label) ||
    /\bword order\b/i.test(label)
  );
}

function labelLooksNaturalisticDurable(label: string | null) {
  if (!label) return false;
  return NATURALISTIC_DURABLE_LABEL_REGEX.test(label);
}

function labelLooksNaturalisticBottleneck(label: string | null) {
  if (!label) return false;

  return (
    labelLooksQuestionSynthesisDurable(label) ||
    labelLooksStructurallyDurable(label) ||
    labelLooksNaturalisticDurable(label) ||
    /\b(?:reuptake|depolarization|refractory period|crossing over|compound interest|speed of sound|law of cosines|law of sines|standard deviation|opportunity cost|subduction|negative feedback|event loop|secondary dominants|membrane potential|equilibrium constant|metaphase vs anaphase|se in spanish|tax jargon|tax terminology|balancing a budget)\b/i.test(label)
  );
}

function getStructuralCreateFloor(interpretation: CandidateInterpretation) {
  if (interpretation.nullOnlyEmotionalLike) return 1;
  if (interpretation.suspiciousLabel || interpretation.subpartLikeLabel) return 1;

  if (interpretation.questionSynthesisLike && interpretation.durableConceptLike) return 0.5;
  if (interpretation.structurallyStrongLabel || interpretation.durableConceptLike) return 0.52;
  if (interpretation.conceptPhraseLike || interpretation.questionSynthesisLike) return 0.53;
  if (interpretation.pairedTargetLike || interpretation.terminologyBarrierLike || interpretation.structureBarrierLike) return 0.54;
  if (interpretation.bottleneckLike || interpretation.mechanismLike) return 0.56;

  return LOW_CONFIDENCE_CREATE_NEW_FLOOR;
}

function labelLooksDomainAnchorLike(label: string | null) {
  if (!label) return false;
  if (labelLooksProtectedDurable(label)) return false;
  const normalized = normalizeLoose(label);
  if (!normalized) return false;

  const simpleAnchors = new Set([
    "spanish",
    "taxes",
    "tax",
    "forms",
    "neurotransmitters",
    "action potential",
    "action potentials",
    "meiosis",
    "mitosis",
    "budgeting",
    "waves",
  ]);

  return simpleAnchors.has(normalized) || BROAD_UMBRELLA_TOPIC_NAMES.has(normalized);
}

function findVectorCandidateIndexForTopic(
  topic: RouteTopic,
  vectorInfo?: VectorInfo | null
): number {
  const normalized = normalizeVectorInfo(vectorInfo);

  const byId = normalized.top_k_topic_ids.findIndex((topicId) => topicId === topic.id);
  if (byId >= 0) return byId;

  const topicNameLoose = normalizeLoose(topic.name);
  return normalized.top_k_topic_names.findIndex(
    (topicName) => normalizeLoose(topicName) === topicNameLoose
  );
}

function getSemanticSimilarityForTopic(topic: RouteTopic, vectorInfo?: VectorInfo | null): number {
  const normalized = normalizeVectorInfo(vectorInfo);
  const index = findVectorCandidateIndexForTopic(topic, normalized);

  if (index < 0) return 0;

  const score = normalized.top_k_similarity_scores[index] ?? 0;
  return clamp(score, 0, 1);
}

function getSemanticRetrievalSupport(
  topic: RouteTopic,
  vectorInfo?: VectorInfo | null
): {
  semanticSimilarity: number;
  retrievalRankBonus: number;
  combinedSupport: number;
} {
  const normalized = normalizeVectorInfo(vectorInfo);
  const index = findVectorCandidateIndexForTopic(topic, normalized);

  if (index < 0) {
    return {
      semanticSimilarity: 0,
      retrievalRankBonus: 0,
      combinedSupport: 0,
    };
  }

  const semanticSimilarity = clamp(normalized.top_k_similarity_scores[index] ?? 0, 0, 1);

  const retrievalRankBonus =
    index === 0 ? 0.12 : index === 1 ? 0.08 : index === 2 ? 0.05 : index === 3 ? 0.03 : 0.01;

  const combinedSupport = clamp(semanticSimilarity * 0.72 + retrievalRankBonus, 0, 1);

  return {
    semanticSimilarity,
    retrievalRankBonus,
    combinedSupport,
  };
}

function buildTopicLabelingInput(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): TopicLabelingInput {
  const retrievalCandidates: RetrievalCandidate[] = existingTopics.map((topic) => ({
    topic_id: topic.id,
    topic_name: topic.name,
    similarity: getSemanticSimilarityForTopic(topic, semanticVectorInfo),
  }));

  return {
    raw_message: message,
    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,
    recent_topic_names: existingTopics.slice(-8).map((topic) => topic.name),
    retrieval_candidates: retrievalCandidates,
  };
}

function buildLabelingResult(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null,
  timer?: ReturnType<typeof createTopicResolutionTimer>
) {
  const input = buildTopicLabelingInput(message, existingTopics, activeTopic, semanticVectorInfo);
  const cacheKey = makeLabelingResultCacheKey(input);
  const cached = labelingResultCache.get(cacheKey);

  if (cached) {
    timer?.recordCacheHit();
    return cached;
  }

  timer?.recordCacheMiss();
  const result = runDeterministicTopicLabeling(input);
  rememberLabelingResult(cacheKey, result);

  return result;
}


function findMatchingQuestionSynthesisCandidate(
  labeling: TopicLabelingResult,
  canonicalLabel: string | null
) {
  if (!canonicalLabel) return null;

  return (
    labeling.diagnostics.scored_candidates.find((candidate) => {
      const candidateLabel = candidate.display_label ?? candidate.span;
      return (
        normalizeLoose(candidateLabel) === normalizeLoose(canonicalLabel) &&
        (candidate.kind === "question_synthesis" ||
          candidate.qualifiers.includes("question_synthesis") ||
          Boolean(candidate.question_synthesis_frame) ||
          Boolean(candidate.synthesized_label))
      );
    }) ?? null
  );
}

function buildCandidateInterpretation(
  message: string,
  labeling: TopicLabelingResult
): CandidateInterpretation {
  const canonicalLabel = labeling.topic_decision.canonical_label ?? null;
  const conceptSpan = labeling.interpretation.concept_span ?? null;
  const questionAboutTopic = labeling.interpretation.question_about_topic ?? null;
  const referencesActiveTopic = labeling.interpretation.references_active_topic ?? false;
  const followupSignals = buildFollowupSignals(message);

  const continuationCue =
    followupSignals.anaphoricFollowup ||
    followupSignals.metaContinuation ||
    referencesActiveTopic;

  const subpartCue = followupSignals.subpartFollowup || followupSignals.mixedFollowup;
  const switchCue = followupSignals.explicitSwitch || Boolean(followupSignals.explicitSwitchTarget);
  const sourceForGranularity = canonicalLabel ?? conceptSpan ?? questionAboutTopic ?? null;
  const protectedDurableLabel = labelLooksProtectedDurable(canonicalLabel);
  const suspiciousLabel =
    protectedDurableLabel ? false : looksLikeSuspiciousResolvedLabel(canonicalLabel);
  const subpartLikeLabel =
    protectedDurableLabel ? false : looksLikeSubpartResolvedLabel(canonicalLabel);
  const ambiguityFlags = labeling.diagnostics.ambiguity_flags.slice();
  const qualifiers = labeling.interpretation.qualifiers ?? [];
  const matchingQuestionSynthesisCandidate = findMatchingQuestionSynthesisCandidate(
    labeling,
    canonicalLabel
  );

  const questionSynthesisLike = Boolean(
    matchingQuestionSynthesisCandidate ||
      qualifiers.includes("question_synthesis") ||
      qualifiers.includes("qcs") ||
      ambiguityFlags.includes("question_synthesis_winner")
  );

  const pairedTargetLike =
    qualifiers.includes("paired_with_domain_anchor") || labelLooksPairedTarget(canonicalLabel);

  const mechanismLike =
    qualifiers.includes("mechanism_target") || labelLooksMechanismLike(canonicalLabel);

  const terminologyBarrierLike =
    labelLooksTerminologyBarrierLike(canonicalLabel) || /\bterminology\b|\bjargon\b|\bforms?\b/i.test(message);

  const structureBarrierLike = labelLooksStructureBarrierLike(message, canonicalLabel);

  const bottleneckLike =
    qualifiers.includes("bottleneck_target") ||
    qualifiers.includes("focus_target") ||
    qualifiers.includes("late_focus_target") ||
    pairedTargetLike ||
    terminologyBarrierLike ||
    structureBarrierLike ||
    labelLooksNaturalisticBottleneck(canonicalLabel);

  const domainAnchorLike =
    qualifiers.includes("domain_anchor") ||
    (labelLooksDomainAnchorLike(canonicalLabel) &&
      !pairedTargetLike &&
      !mechanismLike &&
      !terminologyBarrierLike &&
      !structureBarrierLike &&
      !labelLooksStructurallyDurable(canonicalLabel));

  const nullOnlyEmotionalLike =
    ambiguityFlags.includes("null_only_emotional_overcreated") ||
    labelExplicitlyNullTopic(message);

  const conceptPhraseLike =
    protectedDurableLabel ||
    qualifiers.includes("concept_phrase") ||
    qualifiers.includes("durable_concept") ||
    labeling.diagnostics.scored_candidates.some((candidate) => {
      if (!canonicalLabel) return false;
      const candidateLabel = candidate.display_label ?? candidate.span;
      return (
        normalizeLoose(candidateLabel) === normalizeLoose(canonicalLabel) &&
        (candidate.kind === "concept_phrase" ||
          candidate.should_compete_as_topic === true ||
          candidate.is_subpart_reference === false)
      );
    });

  const qcsOverSynthesized = questionSynthesisLike && labelLooksQcsOverSynthesized(canonicalLabel);

  const durableConceptLike =
    conceptPhraseLike ||
    protectedDurableLabel ||
    (questionSynthesisLike && !qcsOverSynthesized) ||
    (labelLooksQuestionSynthesisDurable(canonicalLabel) && !qcsOverSynthesized) ||
    labelLooksNaturalisticDurable(canonicalLabel) ||
    labelLooksNaturalisticBottleneck(canonicalLabel);

  if (qcsOverSynthesized && !ambiguityFlags.includes("qcs_over_synthesis_winner")) {
    ambiguityFlags.push("qcs_over_synthesis_winner");
  }

  const structurallyStrongLabel = Boolean(
    canonicalLabel &&
      !suspiciousLabel &&
      !subpartLikeLabel &&
      !nullOnlyEmotionalLike &&
      (pairedTargetLike ||
        bottleneckLike ||
        mechanismLike ||
        terminologyBarrierLike ||
        structureBarrierLike ||
        conceptPhraseLike ||
        questionSynthesisLike ||
        durableConceptLike ||
        labelLooksStructurallyDurable(canonicalLabel) ||
        labelLooksNaturalisticBottleneck(canonicalLabel))
  );

  return {
    canonicalLabel,
    conceptSpan,
    questionAboutTopic,
    frame: mapIntentToFrame(labeling.interpretation.message_intent),
    labelConfidence: labeling.topic_decision.confidence,
    specificity: labeling.topic_decision.topic_specificity,
    granularityHint: computeGranularityHint(sourceForGranularity),
    referencesActiveTopic,
    switchCue,
    continuationCue,
    subpartCue,
    explicitTopicSwitchTarget: followupSignals.explicitSwitchTarget,
    suspiciousLabel,
    subpartLikeLabel,
    ambiguityFlags,
    followupSignals,

    pairedTargetLike: Boolean(pairedTargetLike),
    bottleneckLike: Boolean(bottleneckLike),
    mechanismLike: Boolean(mechanismLike),
    domainAnchorLike: Boolean(domainAnchorLike),
    terminologyBarrierLike: Boolean(terminologyBarrierLike),
    structureBarrierLike: Boolean(structureBarrierLike),
    conceptPhraseLike,
    questionSynthesisLike,
    questionSynthesisFrame:
      matchingQuestionSynthesisCandidate?.question_synthesis_frame ?? null,
    questionTriggerKind:
      matchingQuestionSynthesisCandidate?.question_trigger_kind ?? null,
    questionWord:
      matchingQuestionSynthesisCandidate?.question_word == null
        ? null
        : String(matchingQuestionSynthesisCandidate.question_word),
    questionVerb:
      matchingQuestionSynthesisCandidate?.question_verb ?? null,
    questionObject:
      matchingQuestionSynthesisCandidate?.question_object ?? null,
    synthesizedLabel:
      matchingQuestionSynthesisCandidate?.synthesized_label ?? null,
    durableConceptLike,
    structurallyStrongLabel,
    nullOnlyEmotionalLike,
    labelerCreateRecommended: labeling.topic_decision.should_create_new_topic,
  };
}

function inferPrimaryMessageFrameFromLabeling(labeling: TopicLabelingResult): MessageFrame {
  return mapIntentToFrame(labeling.interpretation.message_intent);
}

function canonicalizeTopicNameFromLabeling(labeling: TopicLabelingResult): string {
  return labeling.topic_decision.canonical_label ?? "New Topic";
}

function inferKeywordsFromSourceText(source: string): string[] {
  return dedupe(semanticTokenize(source).filter((token) => token.length > 2)).slice(0, 8);
}

export function inferPrimaryMessageFrame(message: string): MessageFrame {
  const labeling = buildLabelingResult(message, []);
  return inferPrimaryMessageFrameFromLabeling(labeling);
}

export function canonicalizeTopicNameFromMessage(message: string): string {
  const labeling = buildLabelingResult(message, []);
  return canonicalizeTopicNameFromLabeling(labeling);
}

export function titleCaseFromMessage(message: string) {
  return canonicalizeTopicNameFromMessage(message);
}

export function inferKeywordsFromTopicLabel(label: string): string[] {
  return inferKeywordsFromSourceText(label);
}

export function inferKeywordsFromMessage(message: string): string[] {
  const labeling = buildLabelingResult(message, []);
  const source =
    labeling.interpretation.concept_span ?? labeling.topic_decision.canonical_label ?? message;

  return inferKeywordsFromSourceText(source);
}

function computeLocalTopicSimilarity(
  candidateLabel: string | null,
  conceptSpan: string | null,
  topic: RouteTopic
) {
  const candidate = candidateLabel ?? conceptSpan ?? "";
  const normalizedCandidate = normalizeTopicText(candidate);
  const normalizedTopicName = normalizeTopicText(topic.name);

  if (!normalizedCandidate || !normalizedTopicName) return 0;

  const exactNameMatch = normalizedCandidate === normalizedTopicName ? 1 : 0;

  const containedMatch =
    normalizedCandidate.includes(normalizedTopicName) ||
    normalizedTopicName.includes(normalizedCandidate)
      ? 1
      : 0;

  const candidateTokens = semanticTokenize(candidate);
  const topicTokens = semanticTokenize(topic.name);
  const tokenScore = overlapScore(candidateTokens, topicTokens);

  const score = exactNameMatch * 1.0 + containedMatch * 0.84 + tokenScore * 0.8;
  return clamp(score, 0, 1);
}

function computeGranularityAlignment(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
): number {
  const topicGranularity = computeGranularityHint(topic.name);

  if (
    interpretation.granularityHint === "unknown" ||
    topicGranularity === "unknown" ||
    interpretation.subpartCue
  ) {
    return 0;
  }

  if (interpretation.granularityHint === topicGranularity) return 0.06;

  if (
    (interpretation.granularityHint === "narrow" && topicGranularity === "medium") ||
    (interpretation.granularityHint === "medium" && topicGranularity === "broad")
  ) {
    return 0.02;
  }

  if (
    (interpretation.granularityHint === "broad" && topicGranularity === "narrow") ||
    (interpretation.granularityHint === "narrow" && topicGranularity === "broad")
  ) {
    return -0.04;
  }

  return 0;
}

function computeContinuityBonus(
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): number {
  if (!activeTopic || topic.id !== activeTopic.id) return 0;

  let bonus = 0;

  if (interpretation.referencesActiveTopic) bonus += 0.08;
  if (interpretation.continuationCue) bonus += 0.12;
  if (interpretation.subpartCue) bonus += 0.16;
  if (interpretation.switchCue) bonus -= 0.08;

  if (
    interpretation.pairedTargetLike ||
    interpretation.bottleneckLike ||
    interpretation.mechanismLike
  ) {
    bonus -= 0.04;
  }

  return bonus;
}

function computeSwitchPenalty(
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  activeTopic?: RouteTopic | null
): number {
  if (!activeTopic) return 0;
  if (topic.id === activeTopic.id) return 0;
  if (!interpretation.switchCue) return 0;

  return 0.06;
}

function buildVectorInfoFromScoredTopics(
  scored: Array<{ topic: RouteTopic; similarity: number }>
): VectorInfo {
  return {
    top_k_topic_names: scored.slice(0, 5).map((item) => item.topic.name),
    top_k_topic_ids: scored.slice(0, 5).map((item) => item.topic.id),
    top_k_similarity_scores: scored.slice(0, 5).map((item) => clamp(item.similarity, 0, 0.98)),
  };
}

function computeNextTopicPosition(existingTopics: RouteTopic[]): [number, number, number] {
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

function inferSeededNextStepFromConceptAndFrame(
  concept: string,
  frame: MessageFrame
): string {
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
      return `Refine your thinking about ${concept} and explain your reasoning.`;
    case "explain_request":
    case "general":
    default:
      return `Explain ${concept} clearly in your own words.`;
  }
}

export function inferSeededNextStep(message: string) {
  const labeling = buildLabelingResult(message, []);
  const concept = canonicalizeTopicNameFromLabeling(labeling);
  const frame = inferPrimaryMessageFrameFromLabeling(labeling);

  return inferSeededNextStepFromConceptAndFrame(concept, frame);
}

export function inferSeededNextStepFromTopicLabel(label: string) {
  return inferSeededNextStepFromConceptAndFrame(label, "explain_request");
}

function looksLikeStrongDeterministicCreateLabel(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation
) {
  const specificity = labeling.topic_decision.topic_specificity;
  const confidence = labeling.topic_decision.confidence;

  if (!labeling.topic_decision.canonical_label) return false;
  if (specificity === "too_vague") return false;
  if (interpretation.suspiciousLabel) return false;
  if (interpretation.subpartLikeLabel) return false;
  if (interpretation.nullOnlyEmotionalLike) return false;
  if (interpretation.domainAnchorLike && !interpretation.pairedTargetLike && !interpretation.durableConceptLike && !labelLooksProtectedDurable(interpretation.canonicalLabel)) return false;
  if (hasAmbiguityFlag(labeling, "concept_span_clause_like") && !interpretation.conceptPhraseLike && !interpretation.questionSynthesisLike && !interpretation.durableConceptLike) return false;
  if (hasAmbiguityFlag(labeling, "residue_like_winner")) return false;
  if (hasAmbiguityFlag(labeling, "null_only_emotional_overcreated")) return false;
  if (hasAmbiguityFlag(labeling, "anchor_beating_bottleneck")) return false;
  if (hasAmbiguityFlag(labeling, "anchor_beating_terminology_target")) return false;
  if (hasAmbiguityFlag(labeling, "object_beating_mechanism")) return false;
  if (hasAmbiguityFlag(labeling, "qcs_over_synthesis_winner")) return false;

  const specificEnough = specificity === "good" || specificity === "very_specific";

  if (confidence >= CREATE_NEW_CONFIDENCE_THRESHOLD && specificEnough) return true;

  if (
    labelLooksProtectedDurable(interpretation.canonicalLabel) &&
    confidence >= 0.48 &&
    (specificEnough || interpretation.structurallyStrongLabel || interpretation.durableConceptLike)
  ) {
    return true;
  }

  if (
    interpretation.durableConceptLike &&
    confidence >= getStructuralCreateFloor(interpretation) &&
    (specificEnough ||
      interpretation.conceptPhraseLike ||
      interpretation.questionSynthesisLike ||
      labelLooksQuestionSynthesisDurable(interpretation.canonicalLabel) ||
      labelLooksNaturalisticDurable(interpretation.canonicalLabel))
  ) {
    return true;
  }

  if (
    interpretation.structurallyStrongLabel &&
    confidence >= 0.64 &&
    (specificEnough ||
      interpretation.pairedTargetLike ||
      interpretation.terminologyBarrierLike ||
      interpretation.structureBarrierLike ||
      labelLooksStructurallyDurable(interpretation.canonicalLabel))
  ) {
    return true;
  }

  if (
    interpretation.labelerCreateRecommended &&
    interpretation.structurallyStrongLabel &&
    confidence >= getStructuralCreateFloor(interpretation)
  ) {
    return true;
  }

  return false;
}

function topicLooksBroadRelativeToInterpretation(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
) {
  if (
    !interpretation.bottleneckLike &&
    !interpretation.pairedTargetLike &&
    !interpretation.mechanismLike &&
    !interpretation.terminologyBarrierLike &&
    !interpretation.structureBarrierLike &&
    !interpretation.conceptPhraseLike &&
    !interpretation.questionSynthesisLike &&
    !interpretation.durableConceptLike
  ) {
    return false;
  }

  const topicName = normalizeLoose(topic.name);
  const label = normalizeLoose(interpretation.canonicalLabel ?? interpretation.conceptSpan ?? "");

  if (!topicName || !label) return false;

  const topicTokens = semanticTokenize(topic.name);
  const labelTokens = semanticTokenize(interpretation.canonicalLabel ?? interpretation.conceptSpan ?? "");

  return (
    topicTokens.length < labelTokens.length &&
    (label.includes(topicName) || overlapScore(topicTokens, labelTokens) >= 0.75)
  );
}

function topicMatchesTerminologyBarrier(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
) {
  if (!interpretation.terminologyBarrierLike) return false;
  return /\bterminology\b|\bjargon\b|\bforms?\b/i.test(topic.name);
}

function topicMatchesMechanismBarrier(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
) {
  if (!interpretation.mechanismLike && !interpretation.structureBarrierLike) return false;
  return /\bhow\b|\bwhy\b|\bprocess\b|\bmechanism\b|\bfunction\b|\brole\b|\bword order\b|\bin spanish\b/i.test(
    topic.name
  );
}

function topicMatchesPairedTarget(
  interpretation: CandidateInterpretation,
  topic: RouteTopic
) {
  if (!interpretation.pairedTargetLike) return false;
  const label = interpretation.canonicalLabel ?? interpretation.conceptSpan ?? "";
  const topicName = topic.name;

  const labelTokens = semanticTokenize(label);
  const topicTokens = semanticTokenize(topicName);

  return (
    overlapScore(labelTokens, topicTokens) >= 0.6 ||
    normalizeLoose(label).includes(normalizeLoose(topicName)) ||
    normalizeLoose(topicName).includes(normalizeLoose(label))
  );
}

function buildScoreBreakdown(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation,
  topic: RouteTopic,
  semanticVectorInfo?: VectorInfo | null,
  activeTopic?: RouteTopic | null
): TopicScoreBreakdown {
  const candidateLabel = interpretation.canonicalLabel;
  const conceptSpan = interpretation.conceptSpan;
  const questionAboutTopic = interpretation.questionAboutTopic;

  const normalizedCandidate = normalizeTopicText(candidateLabel ?? conceptSpan ?? "");
  const normalizedTopicName = normalizeTopicText(topic.name);

  const exactNameMatch =
    normalizedCandidate && normalizedCandidate === normalizedTopicName ? 1 : 0;

  const containedMatch =
    normalizedCandidate &&
    (normalizedCandidate.includes(normalizedTopicName) ||
      normalizedTopicName.includes(normalizedCandidate))
      ? 1
      : 0;

  const conceptOverlap = computeLocalTopicSimilarity(candidateLabel, conceptSpan, topic);

  const questionOverlap = questionAboutTopic
    ? overlapScore(semanticTokenize(questionAboutTopic), semanticTokenize(topic.name)) * 0.18
    : 0;

  const semanticSupport = getSemanticRetrievalSupport(topic, semanticVectorInfo);
  const semanticRetrieval = semanticSupport.combinedSupport * 0.24;

  const activeTopicBonus =
    interpretation.referencesActiveTopic && activeTopic && activeTopic.id === topic.id ? 0.08 : 0;

  const continuityBonus = computeContinuityBonus(interpretation, topic, activeTopic);
  const switchPenalty = computeSwitchPenalty(interpretation, topic, activeTopic);
  const granularityAlignment = computeGranularityAlignment(interpretation, topic);

  const confidenceBonus = interpretation.labelConfidence * 0.08;

  const vaguePenalty = labeling.topic_decision.topic_specificity === "too_vague" ? 0.12 : 0;

  const ambiguityPenalty =
    hasAmbiguityFlag(labeling, "candidate_competition") ||
    hasAmbiguityFlag(labeling, "label_suspicious")
      ? 0.05
      : 0;

  const suspiciousLabelPenalty = interpretation.suspiciousLabel ? 0.08 : 0;

  let pairedAlignment = 0;
  let bottleneckAlignment = 0;
  let mechanismAlignment = 0;
  let terminologyAlignment = 0;
  let domainCollapsePenalty = 0;

  if (topicMatchesPairedTarget(interpretation, topic)) {
    pairedAlignment += 0.12;
  }

  if (interpretation.bottleneckLike && !interpretation.domainAnchorLike) {
    bottleneckAlignment += 0.08;
  }

  if (topicMatchesMechanismBarrier(interpretation, topic)) {
    mechanismAlignment += 0.1;
  }

  if (topicMatchesTerminologyBarrier(interpretation, topic)) {
    terminologyAlignment += 0.12;
  }

  if (topicLooksBroadRelativeToInterpretation(interpretation, topic)) {
    domainCollapsePenalty += 0.14;
  }

  const finalScore = clamp(
    conceptOverlap +
      questionOverlap +
      semanticRetrieval +
      activeTopicBonus +
      continuityBonus +
      granularityAlignment +
      confidenceBonus +
      pairedAlignment +
      bottleneckAlignment +
      mechanismAlignment +
      terminologyAlignment -
      switchPenalty -
      vaguePenalty -
      ambiguityPenalty -
      suspiciousLabelPenalty -
      domainCollapsePenalty,
    0,
    1
  );

  return {
    exactNameMatch,
    containedMatch,
    conceptOverlap,
    questionOverlap,
    semanticRetrieval,
    retrievalRankBonus: semanticSupport.retrievalRankBonus,
    activeTopicBonus,
    continuityBonus,
    switchPenalty,
    granularityAlignment,
    confidenceBonus,
    vaguePenalty,
    ambiguityPenalty,
    suspiciousLabelPenalty,
    pairedAlignment,
    bottleneckAlignment,
    mechanismAlignment,
    terminologyAlignment,
    domainCollapsePenalty,
    finalScore,
  };
}

export function scoreTopicMatch(
  message: string,
  topic: RouteTopic,
  semanticVectorInfo?: VectorInfo | null
): number {
  const labeling = buildLabelingResult(message, [], null, semanticVectorInfo);
  const interpretation = buildCandidateInterpretation(message, labeling);
  const breakdown = buildScoreBreakdown(labeling, interpretation, topic, semanticVectorInfo);
  return breakdown.finalScore;
}

function buildBaseTopicScores(
  labeling: TopicLabelingResult,
  interpretation: CandidateInterpretation,
  existingTopics: RouteTopic[],
  semanticVectorInfo?: VectorInfo | null,
  activeTopic?: RouteTopic | null
): ScoredTopic[] {
  return existingTopics
    .map((topic) => {
      const breakdown = buildScoreBreakdown(
        labeling,
        interpretation,
        topic,
        semanticVectorInfo,
        activeTopic
      );

      return {
        topic,
        similarity: breakdown.finalScore,
        breakdown,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

function scoreStayActiveHypothesis(args: {
  interpretation: CandidateInterpretation;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
}): ResolutionHypothesis {
  const { interpretation, activeTopic, activeTopicScore, topGap } = args;

  if (!activeTopic || !activeTopicScore) {
    return {
      kind: "stay_active",
      score: 0,
      reasons: ["No active topic is available to stay on."],
      topic: null,
      label: interpretation.canonicalLabel ?? null,
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const f = interpretation.followupSignals;

  score += activeTopicScore.similarity * 0.72;
  reasons.push(`Active topic similarity is ${activeTopicScore.similarity.toFixed(2)}.`);

  if (interpretation.referencesActiveTopic) {
    score += 0.12;
    reasons.push("Message appears to reference the active topic.");
  }

  if (interpretation.continuationCue) {
    score += 0.14;
    reasons.push("Follow-up continuity cue favors staying on the active topic.");
  }

  if (interpretation.subpartCue) {
    score += 0.18;
    reasons.push("Subpart wording favors staying within the active topic.");
  }

  if (activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD) {
    score += 0.06;
    reasons.push("Active topic clears the minimum continuity threshold.");
  }

  if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.03;
    reasons.push("No competing topic clearly separates from the active topic.");
  }

  if (interpretation.suspiciousLabel) {
    score += 0.05;
    reasons.push("Suspicious extracted label makes conservative continuity safer.");
  }

  if (f.anaphoricFollowup) {
    score += 0.24;
    reasons.push("Anaphoric follow-up strongly suggests staying on the active topic.");
  }

  if (f.subpartFollowup) {
    score += 0.28;
    reasons.push("Subpart follow-up strongly suggests staying on the active topic.");
  }

  if (f.mixedFollowup) {
    score += 0.32;
    reasons.push("Mixed anaphoric + subpart follow-up strongly favors staying.");
  }

  if (interpretation.switchCue) {
    score -= 0.12;
    reasons.push("Explicit switch cue weakens the stay-active case.");
  }

  if (
    interpretation.labelConfidence >= 0.82 &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    !interpretation.continuationCue &&
    !interpretation.subpartCue &&
    !interpretation.pairedTargetLike &&
    !interpretation.bottleneckLike
  ) {
    score -= 0.08;
    reasons.push("A strong clean label slightly weakens passive continuity.");
  }

  if (interpretation.pairedTargetLike || interpretation.mechanismLike || interpretation.terminologyBarrierLike || interpretation.conceptPhraseLike || interpretation.questionSynthesisLike || labelLooksProtectedDurable(interpretation.canonicalLabel)) {
    score -= labelLooksProtectedDurable(interpretation.canonicalLabel) ? 0.09 : 0.05;
    reasons.push("A narrower instructional bottleneck slightly weakens stay-active by default.");
  }

  return {
    kind: "stay_active",
    score: clamp(score, 0, 1),
    reasons,
    topic: activeTopic,
    label: interpretation.canonicalLabel ?? activeTopic.name,
  };
}

function scoreSwitchExistingHypothesis(args: {
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
  topGap: number;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis {
  const { interpretation, best, activeTopic, activeTopicScore, topGap, semanticVectorInfo } = args;

  if (!best) {
    return {
      kind: "switch_existing",
      score: 0,
      reasons: ["No existing topic candidate is available."],
      topic: null,
      label: interpretation.canonicalLabel ?? null,
    };
  }

  const switchingToActive = activeTopic && best.topic.id === activeTopic.id;
  let score = 0;
  const reasons: string[] = [];

  score += best.similarity * 0.8;
  reasons.push(`Best existing-topic similarity is ${best.similarity.toFixed(2)}.`);

  if (!switchingToActive) {
    score += 0.05;
    reasons.push("Best match is not merely the active topic.");
  }

  if (best.similarity >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score += 0.08;
    reasons.push("Best topic clears the strong reuse band.");
  } else if (best.similarity >= MID_REUSE_TOPIC_THRESHOLD) {
    score += 0.03;
    reasons.push("Best topic is in the mid reuse band.");
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.05;
    reasons.push("Best topic has a useful margin over alternatives.");
  }

  const semanticSupport = getSemanticRetrievalSupport(best.topic, semanticVectorInfo);
  if (semanticSupport.semanticSimilarity >= 0.22) {
    score += 0.06;
    reasons.push("Semantic retrieval also supports this existing topic.");
  }

  if (activeTopicScore && !switchingToActive) {
    const margin = best.similarity - activeTopicScore.similarity;
    if (margin > 0.06) {
      score += 0.08;
      reasons.push("Best topic clearly beats the active topic.");
    } else if (margin < 0.02) {
      score -= 0.05;
      reasons.push("Best topic does not clearly separate from the active topic.");
    }
  }

  if (interpretation.switchCue && !switchingToActive) {
    score += 0.08;
    reasons.push("Switch cue supports moving to another existing topic.");
  }

  if (interpretation.continuationCue && switchingToActive) {
    score += 0.03;
    reasons.push("Continuation cue still allows reuse of the active topic.");
  }

  if (interpretation.suspiciousLabel) {
    score -= 0.04;
    reasons.push("Suspicious extracted label reduces confidence in switching.");
  }

  if (interpretation.subpartCue && !switchingToActive) {
    score -= 0.05;
    reasons.push("Subpart phrasing makes cross-topic switching less safe.");
  }

  if (
    (interpretation.pairedTargetLike || interpretation.bottleneckLike || interpretation.mechanismLike) &&
    topicLooksBroadRelativeToInterpretation(interpretation, best.topic)
  ) {
    score -= 0.08;
    reasons.push("Broad existing topic is penalized relative to the narrower instructional target.");
  }

  return {
    kind: "switch_existing",
    score: clamp(score, 0, 1),
    reasons,
    topic: best.topic,
    label: interpretation.canonicalLabel ?? best.topic.name,
  };
}

function scoreCreateNewHypothesis(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic?: RouteTopic | null;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis {
  const { labeling, interpretation, best, second, topGap, activeTopic, semanticVectorInfo } = args;

  let score = 0;
  const reasons: string[] = [];
  const label = interpretation.canonicalLabel ?? null;

  if (!label) {
    return { kind: "create_new", score: 0, reasons: ["No canonical label is available for a new topic."], topic: null, label: null };
  }

  if (interpretation.nullOnlyEmotionalLike) {
    return { kind: "create_new", score: 0, reasons: ["Labeler identified this as an emotional/null-only message, so creation is blocked."], topic: null, label };
  }

  if (hasAmbiguityFlag(labeling, "qcs_over_synthesis_winner")) {
    return { kind: "create_new", score: 0, reasons: ["QCS label appears over-synthesized relative to a cleaner explicit concept, so creation is blocked."], topic: null, label };
  }

  score += interpretation.labelConfidence * 0.62;
  reasons.push(`Deterministic label confidence is ${interpretation.labelConfidence.toFixed(2)}.`);

  if (looksLikeStrongDeterministicCreateLabel(labeling, interpretation)) {
    score += 0.2;
    reasons.push("Deterministic label looks strong and create-worthy.");
  }

  if (interpretation.structurallyStrongLabel) {
    score += 0.14;
    reasons.push("Structured bottleneck label supports creation when reuse is weak or too broad.");
  }

  if (interpretation.specificity === "good" || interpretation.specificity === "very_specific") {
    score += 0.14;
    reasons.push("Label specificity supports a stable new topic.");
  } else if (interpretation.specificity === "broad_but_usable") {
    score += interpretation.structurallyStrongLabel ? 0.08 : 0.04;
    reasons.push("Label is broad but still potentially usable.");
  }

  if (interpretation.pairedTargetLike) { score += 0.1; reasons.push("Paired target structure supports a stable instructional topic."); }
  if (interpretation.conceptPhraseLike) { score += 0.12; reasons.push("Concept-phrase label is a durable teachable topic."); }
  if (interpretation.questionSynthesisLike && !hasAmbiguityFlag(labeling, "qcs_over_synthesis_winner")) {
    score += 0.06;
    reasons.push("Question-to-concept synthesis produced a durable teachable topic.");
  }
  if (labelLooksProtectedDurable(label)) {
    score += 0.14;
    reasons.push("Protected durable label supports clean topic creation.");
  }
  if (interpretation.durableConceptLike) { score += 0.1; reasons.push("Durable naturalistic/QCS concept supports creation when reuse is weak."); }
  if (interpretation.bottleneckLike && !interpretation.domainAnchorLike) { score += 0.08; reasons.push("Bottleneck-like label supports topic creation if reuse is weak or too broad."); }
  if (interpretation.mechanismLike || interpretation.terminologyBarrierLike || interpretation.structureBarrierLike) { score += 0.07; reasons.push("Mechanism, language-structure, or terminology barrier label is instructionally useful."); }

  const bestScore = best?.similarity ?? 0;
  const bestIsBroadRelative = best ? topicLooksBroadRelativeToInterpretation(interpretation, best.topic) : false;

  if (bestScore < MID_REUSE_TOPIC_THRESHOLD) {
    score += 0.16;
    reasons.push("No existing topic matches strongly enough to force reuse.");
  } else if (bestIsBroadRelative && interpretation.structurallyStrongLabel) {
    score += 0.1;
    reasons.push("Best existing topic is broader than the extracted instructional bottleneck.");
  } else if (bestScore >= STRONG_REUSE_TOPIC_THRESHOLD) {
    score -= 0.18;
    reasons.push("A strong existing-topic match argues against creating new.");
  }

  if (best && second) {
    const margin = best.similarity - second.similarity;
    if (margin < 0.03 && best.similarity >= MID_REUSE_TOPIC_THRESHOLD && !interpretation.structurallyStrongLabel) {
      score -= 0.05;
      reasons.push("Existing-topic field is crowded, making clean creation less safe.");
    }
  }

  if (topGap >= CANDIDATE_COMPETITION_GAP_THRESHOLD) { score += 0.03; reasons.push("The extracted label is not heavily contested."); }
  if (interpretation.switchCue && best && best.similarity >= MID_REUSE_TOPIC_THRESHOLD && !bestIsBroadRelative) { score -= 0.06; reasons.push("Switch cue plus plausible existing topic argues for reuse, not creation."); }
  if (interpretation.continuationCue && activeTopic && !interpretation.structurallyStrongLabel) { score -= 0.08; reasons.push("Continuation signal argues against splitting into a new topic."); }
  if (interpretation.subpartCue || interpretation.subpartLikeLabel) { score -= 0.12; reasons.push("Subpart-like phrasing should usually stay inside an existing topic."); }
  if (interpretation.suspiciousLabel) { score -= 0.14; reasons.push("Suspicious label weakens the create-new case."); }
  if (interpretation.domainAnchorLike && !interpretation.pairedTargetLike) { score -= 0.1; reasons.push("Broad anchor-like labels are not enough to justify creation alone."); }
  if (hasAmbiguityFlag(labeling, "candidate_competition") && !interpretation.structurallyStrongLabel) { score -= 0.08; reasons.push("Candidate competition weakens the create-new case."); }
  if (hasAmbiguityFlag(labeling, "concept_span_clause_like")) { score -= 0.07; reasons.push("Clause-like concept span weakens new-topic creation."); }

  if (best) {
    const semanticSupport = getSemanticRetrievalSupport(best.topic, semanticVectorInfo);
    if (semanticSupport.semanticSimilarity >= 0.22 && !bestIsBroadRelative) {
      score -= 0.09;
      reasons.push("Semantic retrieval found a meaningful nearby existing topic.");
    }

    if (interpretation.structurallyStrongLabel && bestIsBroadRelative && best.similarity < STRONG_REUSE_TOPIC_THRESHOLD + 0.08) {
      score += 0.06;
      reasons.push("Reuse candidate appears to be an umbrella topic, so creation remains useful.");
    } else if (
      (interpretation.pairedTargetLike || interpretation.bottleneckLike || interpretation.mechanismLike || interpretation.terminologyBarrierLike || interpretation.questionSynthesisLike) &&
      !bestIsBroadRelative &&
      !labelLooksProtectedDurable(label) &&
      best.similarity >= MID_REUSE_TOPIC_THRESHOLD
    ) {
      score -= 0.08;
      reasons.push("A reasonably aligned existing topic argues against unnecessary creation.");
    }
  }

  if (!labeling.topic_decision.should_create_new_topic && !interpretation.structurallyStrongLabel) { score -= 0.04; reasons.push("Deterministic topic decision was cautious about creation."); }
  if (interpretation.labelConfidence >= 0.82 && !interpretation.continuationCue && !interpretation.subpartCue && !interpretation.suspiciousLabel) { score += 0.06; reasons.push("A strong clean label supports creating a fresh topic if reuse is weak."); }

  return { kind: "create_new", score: clamp(score, 0, 1), reasons, topic: null, label };
}

function scoreAmbiguousHypothesis(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic: RouteTopic | null | undefined;
  activeTopicScore: ScoredTopic | null;
}): ResolutionHypothesis {
  const { labeling, interpretation, best, second, topGap, activeTopic, activeTopicScore } = args;

  let score = 0.08;
  const reasons: string[] = [];

  if (hasAmbiguityFlag(labeling, "candidate_competition")) {
    score += 0.22;
    reasons.push("Deterministic labeling reports candidate competition.");
  }

  if (hasAmbiguityFlag(labeling, "low_confidence")) {
    score += 0.16;
    reasons.push("Deterministic confidence is low.");
  }

  if (hasAmbiguityFlag(labeling, "needs_adjudication")) {
    score += 0.16;
    reasons.push("Deterministic output recommends adjudication.");
  }

  if (interpretation.suspiciousLabel) {
    score += 0.18;
    reasons.push("Suspicious extracted label increases ambiguity.");
  }

  if (hasAmbiguityFlag(labeling, "concept_extraction_weak")) {
    score += 0.18;
    reasons.push("Concept extraction appears weak.");
  }

  if (best && second && topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) {
    score += 0.12;
    reasons.push("Top existing-topic candidates are tightly clustered.");
  }

  if (
    activeTopic &&
    activeTopicScore &&
    best &&
    best.topic.id !== activeTopic.id &&
    Math.abs(best.similarity - activeTopicScore.similarity) < 0.05
  ) {
    score += 0.08;
    reasons.push("Active topic and best alternative are too close to separate confidently.");
  }

  if (interpretation.subpartCue && !interpretation.referencesActiveTopic && best?.similarity) {
    score += 0.05;
    reasons.push("Subpart wording without clean anchoring increases ambiguity.");
  }

  return {
    kind: "ambiguous",
    score: clamp(score, 0, 1),
    reasons,
    topic: null,
    label: interpretation.canonicalLabel ?? null,
  };
}

function buildResolutionHypotheses(args: {
  labeling: TopicLabelingResult;
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  best: ScoredTopic | null;
  second: ScoredTopic | null;
  topGap: number;
  activeTopic?: RouteTopic | null;
  semanticVectorInfo?: VectorInfo | null;
}): ResolutionHypothesis[] {
  const {
    labeling,
    interpretation,
    scoredTopics,
    best,
    second,
    topGap,
    activeTopic,
    semanticVectorInfo,
  } = args;

  const activeTopicScore = activeTopic
    ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
    : null;

  const stayActive = scoreStayActiveHypothesis({
    interpretation,
    activeTopic,
    activeTopicScore,
    topGap,
  });

  const switchExisting = scoreSwitchExistingHypothesis({
    interpretation,
    best,
    activeTopic,
    activeTopicScore,
    topGap,
    semanticVectorInfo,
  });

  const createNew = scoreCreateNewHypothesis({
    labeling,
    interpretation,
    best,
    second,
    topGap,
    activeTopic,
    semanticVectorInfo,
  });

  const ambiguous = scoreAmbiguousHypothesis({
    labeling,
    interpretation,
    best,
    second,
    topGap,
    activeTopic,
    activeTopicScore,
  });

  return [stayActive, switchExisting, createNew, ambiguous];
}

function chooseWinningHypothesis(hypotheses: ResolutionHypothesis[]): ResolutionHypothesis {
  const sorted = hypotheses.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (!best) {
    return {
      kind: "ambiguous",
      score: 1,
      reasons: ["No usable hypothesis was generated."],
      topic: null,
      label: null,
    };
  }

  const create = hypotheses.find((hypothesis) => hypothesis.kind === "create_new");
  const switchExisting = hypotheses.find((hypothesis) => hypothesis.kind === "switch_existing");
  const stayActive = hypotheses.find((hypothesis) => hypothesis.kind === "stay_active");

  if (
    create &&
    create.label &&
    labelLooksProtectedDurable(create.label) &&
    create.score >= 0.5 &&
    (!switchExisting || create.score >= switchExisting.score - 0.04) &&
    (!stayActive || create.score >= stayActive.score - 0.06)
  ) {
    return {
      ...create,
      reasons: [
        ...create.reasons,
        "Protected durable label wins close resolver competition.",
      ],
    };
  }

  return best;
}

function shouldRecommendFallbackAdjudication(
  winner: ResolutionHypothesis,
  interpretation: CandidateInterpretation,
  topGap: number
) {
  if (winner.kind === "ambiguous" && winner.score >= AMBIGUOUS_WIN_THRESHOLD) {
    return true;
  }

  if (interpretation.ambiguityFlags.includes("label_suspicious")) return true;
  if (interpretation.ambiguityFlags.includes("residue_like_winner")) return true;
  if (interpretation.ambiguityFlags.includes("null_only_emotional_overcreated")) return true;
  if (interpretation.ambiguityFlags.includes("qcs_over_synthesis_winner")) return true;

  if (!interpretation.structurallyStrongLabel) {
    if (interpretation.ambiguityFlags.includes("candidate_competition")) return true;
    if (interpretation.ambiguityFlags.includes("needs_adjudication")) return true;
    if (interpretation.ambiguityFlags.includes("low_confidence")) return true;
    if (topGap < CANDIDATE_COMPETITION_GAP_THRESHOLD) return true;
  }

  return false;
}

function inferDecisionAction(args: {
  winner: ResolutionHypothesis;
  best: ScoredTopic | null;
  activeTopic?: RouteTopic | null;
  activeTopicScore: ScoredTopic | null;
  interpretation: CandidateInterpretation;
}): ResolutionDecisionAction {
  const { winner, best, activeTopic, activeTopicScore, interpretation } = args;

  if (winner.kind === "stay_active" && activeTopic) {
    return "stay_on_active_topic";
  }

  if (winner.kind === "switch_existing" && winner.topic) {
    return winner.topic.id === activeTopic?.id
      ? "stay_on_active_topic"
      : "reuse_existing_topic";
  }

  if (
    winner.kind === "create_new" &&
    winner.label &&
    winner.score >= getStructuralCreateFloor(interpretation) &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    !interpretation.nullOnlyEmotionalLike &&
    !interpretation.ambiguityFlags.includes("qcs_over_synthesis_winner") &&
    (!interpretation.domainAnchorLike || interpretation.pairedTargetLike || interpretation.questionSynthesisLike || interpretation.durableConceptLike)
  ) {
    return "create_new_topic";
  }

  if (
    winner.kind === "create_new" &&
    winner.label &&
    interpretation.durableConceptLike &&
    winner.score >= Math.max(0.48, getStructuralCreateFloor(interpretation) - 0.04) &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    !interpretation.nullOnlyEmotionalLike &&
    !interpretation.ambiguityFlags.includes("qcs_over_synthesis_winner") &&
    (!interpretation.domainAnchorLike || interpretation.pairedTargetLike || interpretation.questionSynthesisLike || interpretation.durableConceptLike)
  ) {
    return "create_new_topic";
  }

  if (
    best &&
    best.similarity >= STRONG_REUSE_TOPIC_THRESHOLD &&
    (!interpretation.suspiciousLabel || best.topic.id === activeTopic?.id)
  ) {
    return best.topic.id === activeTopic?.id ? "stay_on_active_topic" : "reuse_existing_topic";
  }

  if (
    activeTopic &&
    activeTopicScore &&
    activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD &&
    (interpretation.continuationCue || interpretation.referencesActiveTopic || interpretation.subpartCue)
  ) {
    return "stay_on_active_topic";
  }

  return "no_confident_decision";
}

function buildResolutionTrace(args: {
  interpretation: CandidateInterpretation;
  scoredTopics: ScoredTopic[];
  hypotheses: ResolutionHypothesis[];
  winner: ResolutionHypothesis;
  topGap: number;
  decisionAction: ResolutionDecisionAction;
  fallbackRecommended: boolean;
  timing?: ResolutionTimingDebug;
}): TopicResolutionTrace {
  const {
    interpretation,
    scoredTopics,
    hypotheses,
    winner,
    topGap,
    decisionAction,
    fallbackRecommended,
    timing,
  } = args;

  return {
    interpretation: {
      canonicalLabel: interpretation.canonicalLabel,
      conceptSpan: interpretation.conceptSpan,
      questionAboutTopic: interpretation.questionAboutTopic,
      frame: interpretation.frame,
      labelConfidence: interpretation.labelConfidence,
      specificity: interpretation.specificity,
      granularityHint: interpretation.granularityHint,
      referencesActiveTopic: interpretation.referencesActiveTopic,
      switchCue: interpretation.switchCue,
      continuationCue: interpretation.continuationCue,
      subpartCue: interpretation.subpartCue,
      suspiciousLabel: interpretation.suspiciousLabel,
      subpartLikeLabel: interpretation.subpartLikeLabel,
      ambiguityFlags: interpretation.ambiguityFlags,
      followupSignals: interpretation.followupSignals,

      pairedTargetLike: interpretation.pairedTargetLike,
      bottleneckLike: interpretation.bottleneckLike,
      mechanismLike: interpretation.mechanismLike,
      domainAnchorLike: interpretation.domainAnchorLike,
      terminologyBarrierLike: interpretation.terminologyBarrierLike,
      structureBarrierLike: interpretation.structureBarrierLike,
      conceptPhraseLike: interpretation.conceptPhraseLike,
      questionSynthesisLike: interpretation.questionSynthesisLike,
      questionSynthesisFrame: interpretation.questionSynthesisFrame,
      questionTriggerKind: interpretation.questionTriggerKind,
      questionWord: interpretation.questionWord,
      questionVerb: interpretation.questionVerb,
      questionObject: interpretation.questionObject,
      synthesizedLabel: interpretation.synthesizedLabel,
      durableConceptLike: interpretation.durableConceptLike,
      structurallyStrongLabel: interpretation.structurallyStrongLabel,
      nullOnlyEmotionalLike: interpretation.nullOnlyEmotionalLike,
      labelerCreateRecommended: interpretation.labelerCreateRecommended,
    },
    candidates: scoredTopics.slice(0, 5).map((item) => ({
      topicId: item.topic.id,
      topicName: item.topic.name,
      similarity: item.similarity,
      breakdown: item.breakdown,
    })),
    hypotheses: hypotheses.map((hypothesis) => ({
      kind: hypothesis.kind,
      score: hypothesis.score,
      reasons: hypothesis.reasons,
      topicId: hypothesis.topic?.id ?? null,
      topicName: hypothesis.topic?.name ?? null,
      label: hypothesis.label,
    })),
    winner: {
      kind: winner.kind,
      score: winner.score,
      reasons: winner.reasons,
      topicId: winner.topic?.id ?? null,
      topicName: winner.topic?.name ?? null,
      label: winner.label,
    },
    topGap,
    decisionAction,
    fallbackRecommended,
    ...(timing ? { timing } : {}),
  };
}

function adjudicateTopicResolution(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): ResolutionAdjudication {
  const timer = createTopicResolutionTimer();

  const normalizedSemanticVectorInfo = normalizeVectorInfo(semanticVectorInfo);
  timer.step("normalize_vector_info");

  const labeling = buildLabelingResult(
    message,
    existingTopics,
    activeTopic,
    normalizedSemanticVectorInfo,
    timer
  );
  timer.step("build_labeling_result");

  const interpretation = buildCandidateInterpretation(message, labeling);
  timer.step("build_candidate_interpretation");

  const scoredTopics = buildBaseTopicScores(
    labeling,
    interpretation,
    existingTopics,
    normalizedSemanticVectorInfo,
    activeTopic
  );
  timer.step("build_base_topic_scores");

  const best = scoredTopics[0] ?? null;
  const second = scoredTopics[1] ?? null;
  const topGap = best ? Math.max(0, best.similarity - (second?.similarity ?? 0)) : 0;

  const activeTopicScore = activeTopic
    ? scoredTopics.find((item) => item.topic.id === activeTopic.id) ?? null
    : null;
  timer.step("derive_best_second_and_active_scores");

  const hypotheses = buildResolutionHypotheses({
    labeling,
    interpretation,
    scoredTopics,
    best,
    second,
    topGap,
    activeTopic,
    semanticVectorInfo: normalizedSemanticVectorInfo,
  });
  timer.step("build_resolution_hypotheses");

  const winner = chooseWinningHypothesis(hypotheses);
  const fallbackRecommended = shouldRecommendFallbackAdjudication(winner, interpretation, topGap);

  const decisionAction = inferDecisionAction({
    winner,
    best,
    activeTopic,
    activeTopicScore,
    interpretation,
  });
  timer.step("choose_winner_and_decision_action");

  const traceWithoutFinalTiming = buildResolutionTrace({
    interpretation,
    scoredTopics,
    hypotheses,
    winner,
    topGap,
    decisionAction,
    fallbackRecommended,
  });
  timer.step("build_resolution_trace");

  const trace: TopicResolutionTrace = {
    ...traceWithoutFinalTiming,
    timing: timer.finish(),
  };

  return {
    labeling,
    interpretation,
    scoredTopics,
    vectorInfo: mergeVectorInfos(
      normalizedSemanticVectorInfo,
      buildVectorInfoFromScoredTopics(scoredTopics)
    ),
    best,
    second,
    topGap,
    activeTopicScore,
    hypotheses,
    winner,
    fallbackRecommended,
    decisionAction,
    trace,
  };
}

function looksLikeSuspiciousResolvedLabel(label: string | null) {
  if (!label) return true;
  if (labelLooksProtectedDurable(label)) return false;

  if (labelLooksProtectedDurable(label)) return false;

  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  if (
    labelLooksQuestionSynthesisDurable(label) ||
    labelLooksNaturalisticBottleneck(label) ||
    labelLooksStructurallyDurable(label)
  ) {
    return false;
  }

  const suspiciousSingles = new Set([
    "i",
    "me",
    "you",
    "we",
    "they",
    "this",
    "that",
    "it",
    "it's",
    "part",
    "thing",
    "stuff",
    "help",
    "question",
    "new topic",
    "law works",
    "say",
    "helped",
    "mean",
    "another example",
    "happens right",
    "no the second",
    "no i meant the sweeping",
    "keep mixing",
    "scoring",
    "sweeping",
  ]);

  if (suspiciousSingles.has(normalized)) return true;
  if (normalized.split(" ").length > 8) return true;
  if (/\b(help|understand|get|confused|stuck|trouble)\b/i.test(label)) return true;
  if (/^(?:say|helped|mean|scoring|sweeping|wait|example)$/i.test(normalized)) return true;

  return false;
}

function looksLikeSubpartResolvedLabel(label: string | null) {
  if (!label) return false;
  if (labelLooksProtectedDurable(label)) return false;
  const normalized = normalizeLoose(label);
  return (
    normalized === "scoring" ||
    normalized === "sweeping" ||
    normalized === "first part" ||
    normalized === "second part" ||
    normalized === "that part" ||
    normalized === "this part"
  );
}

function findTopicByNameApprox(
  requested: string,
  topics: RouteTopic[],
  excludeTopicId?: string | null
): RouteTopic | null {
  const requestedTokens = semanticTokenize(requested);
  if (!requestedTokens.length) return null;

  let best: { topic: RouteTopic; score: number } | null = null;

  for (const topic of topics) {
    if (excludeTopicId && topic.id === excludeTopicId) continue;

    const score = overlapScore(requestedTokens, semanticTokenize(topic.name));
    const exact = normalizeTopicText(requested) === normalizeTopicText(topic.name) ? 1 : 0;
    const finalScore = Math.max(score, exact);

    if (!best || finalScore > best.score) {
      best = { topic, score: finalScore };
    }
  }

  if (!best) return null;
  if (best.score >= 0.62) return best.topic;
  return null;
}

function extractExplicitSwitchTargetString(message: string): string | null {
  const normalized = normalizeSurface(message);

  for (const regex of EXPLICIT_EXISTING_TOPIC_SWITCH_PREFIXES) {
    const match = normalized.match(regex);
    const requested = match?.[1]?.trim();
    if (requested) return requested;
  }

  if (/^(?:actually\s+can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    return normalized.replace(/^(?:actually\s+can we go back to)\s+/i, "").trim();
  }

  if (/^(?:can we go back to)\s+(.+?)\??$/i.test(normalized)) {
    return normalized.replace(/^(?:can we go back to)\s+/i, "").trim();
  }

  if (/^(?:wait,?\s*go back to)\s+(.+?)\.?$/i.test(normalized)) {
    return normalized.replace(/^(?:wait,?\s*go back to)\s+/i, "").trim();
  }

  return null;
}

function extractExplicitExistingTopicTarget(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): RouteTopic | null {
  const requested = extractExplicitSwitchTargetString(message);
  if (!requested) return null;

  return findTopicByNameApprox(requested, existingTopics, activeTopic?.id ?? null);
}

function findPreviousNonActiveTopic(
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null
): RouteTopic | null {
  if (!existingTopics.length) return null;
  if (!activeTopic) return existingTopics[existingTopics.length - 1] ?? null;

  const activeIndex = existingTopics.findIndex((topic) => topic.id === activeTopic.id);
  if (activeIndex <= 0) return null;

  return existingTopics[activeIndex - 1] ?? null;
}

export function shouldTryLLMTopicResolutionFallback(args: {
  resolutionKind: DeterministicTopicResolutionSnapshot["resolutionKind"];
  matchConfidence: number;
  resolvedLabel: string | null;
  existingTopicsCount: number;
  vectorInfo?: VectorInfo | null;
}) {
  const { resolutionKind, matchConfidence, resolvedLabel, existingTopicsCount, vectorInfo } = args;

  if (existingTopicsCount === 0) return false;

  const topSemanticScore = normalizeVectorInfo(vectorInfo).top_k_similarity_scores[0] ?? 0;

  if (looksLikeSuspiciousResolvedLabel(resolvedLabel)) return true;
  if (resolutionKind === "no_match") return true;

  if (
    resolutionKind === "fallback_existing_topic" &&
    matchConfidence < 0.66 &&
    topSemanticScore < 0.24
  ) {
    return true;
  }

  if (
    resolutionKind === "fallback_active_topic" &&
    matchConfidence < 0.58 &&
    topSemanticScore < 0.22
  ) {
    return true;
  }

  if (resolutionKind === "created_new_candidate") {
    const durableCreatedLabel =
      labelLooksNaturalisticBottleneck(resolvedLabel) ||
      labelLooksStructurallyDurable(resolvedLabel);
    return matchConfidence < (durableCreatedLabel ? 0.62 : 0.78);
  }

  return false;
}

export function buildDeterministicTopicResolutionSnapshot(
  match: TopicMatchResult
): DeterministicTopicResolutionSnapshot {
  return {
    resolutionKind: match.resolutionKind,
    resolvedLabel: match.resolvedLabel,
    matchConfidence: match.matchConfidence,
    vectorInfo: match.vectorInfo,
  };
}

function conceptualUsefulnessSupportsCreation(args: {
  best: ScoredTopic | null;
  interpretation: CandidateInterpretation;
  activeTopic?: RouteTopic | null;
}): boolean {
  const { best, interpretation, activeTopic } = args;

  if (interpretation.suspiciousLabel) return false;
  if (interpretation.nullOnlyEmotionalLike) return false;
  if (interpretation.subpartCue || interpretation.subpartLikeLabel) return false;
  if (interpretation.continuationCue && activeTopic && !interpretation.structurallyStrongLabel) return false;
  if (interpretation.domainAnchorLike && !interpretation.pairedTargetLike && !interpretation.durableConceptLike && !labelLooksProtectedDurable(interpretation.canonicalLabel)) return false;

  if (!best) return true;
  if (topicLooksBroadRelativeToInterpretation(interpretation, best.topic)) return true;
  if (interpretation.structurallyStrongLabel && best.similarity < STRONG_REUSE_TOPIC_THRESHOLD) return true;

  return best.similarity < MID_REUSE_TOPIC_THRESHOLD;
}

function shouldUseHardActiveFollowupOverride(
  interpretation: CandidateInterpretation,
  labeling: TopicLabelingResult
) {
  const f = interpretation.followupSignals;

  const strongNewInstructionalTarget =
    interpretation.labelConfidence >= 0.82 &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    (interpretation.pairedTargetLike ||
      interpretation.bottleneckLike ||
      interpretation.mechanismLike ||
      interpretation.conceptPhraseLike ||
      interpretation.durableConceptLike);

  if (strongNewInstructionalTarget && !interpretation.continuationCue && !interpretation.subpartCue) {
    return false;
  }

  if (f.mixedFollowup) return true;
  if (f.subpartFollowup) return true;
  if (
    (f.anaphoricFollowup || f.metaContinuation) &&
    !labeling.topic_decision.should_create_new_topic &&
    !strongNewInstructionalTarget
  ) {
    return true;
  }

  if (
    (interpretation.suspiciousLabel || interpretation.subpartLikeLabel) &&
    (f.anaphoricFollowup || f.subpartFollowup || f.mixedFollowup || f.metaContinuation)
  ) {
    return true;
  }

  return false;
}

function buildFinalMatchResultFromDecision(args: {
  adjudication: ResolutionAdjudication;
  activeTopic?: RouteTopic | null;
}): TopicMatchResult {
  const { adjudication, activeTopic } = args;
  const {
    labeling,
    interpretation,
    vectorInfo,
    best,
    second,
    winner,
    activeTopicScore,
    decisionAction,
    trace,
  } = adjudication;

  if (decisionAction === "stay_on_active_topic" && activeTopic) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: interpretation.canonicalLabel ?? activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, winner.score),
      resolutionTrace: trace,
    };
  }

  if (decisionAction === "reuse_existing_topic" && winner.topic) {
    const reuseTopic = winner.topic;
    const isActive = reuseTopic.id === activeTopic?.id;
    const confidence =
      second && best && best.similarity - second.similarity >= HIGH_USEFULNESS_MARGIN
        ? Math.max(best.similarity, winner.score)
        : Math.max(best?.similarity ?? 0, winner.score);

    return {
      matchedTopic: reuseTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: isActive ? "fallback_active_topic" : "matched_existing",
      resolvedLabel: interpretation.canonicalLabel ?? reuseTopic.name,
      matchConfidence: confidence,
      resolutionTrace: trace,
    };
  }

  if (
    decisionAction === "create_new_topic" &&
    interpretation.canonicalLabel &&
    (interpretation.labelConfidence >= getStructuralCreateFloor(interpretation) ||
      (interpretation.durableConceptLike && winner.score >= Math.max(0.48, getStructuralCreateFloor(interpretation) - 0.04))) &&
    conceptualUsefulnessSupportsCreation({
      best,
      interpretation,
      activeTopic,
    })
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: interpretation.canonicalLabel,
      matchConfidence: Math.max(winner.score, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  if (
    best &&
    best.similarity >= MID_REUSE_TOPIC_THRESHOLD &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel
  ) {
    return {
      matchedTopic: best.topic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        best.topic.id === activeTopic?.id ? "fallback_active_topic" : "fallback_existing_topic",
      resolvedLabel: interpretation.canonicalLabel ?? best.topic.name,
      matchConfidence: best.similarity,
      resolutionTrace: trace,
    };
  }

  if (
    activeTopic &&
    activeTopicScore &&
    activeTopicScore.similarity >= ACTIVE_TOPIC_FALLBACK_THRESHOLD &&
    (winner.kind !== "create_new" ||
      interpretation.suspiciousLabel ||
      interpretation.subpartLikeLabel ||
      interpretation.continuationCue)
  ) {
    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: activeTopicScore.similarity,
      resolutionTrace: trace,
    };
  }

  if (
    interpretation.canonicalLabel &&
    (interpretation.durableConceptLike || looksLikeStrongDeterministicCreateLabel(labeling, interpretation)) &&
    !interpretation.suspiciousLabel &&
    !interpretation.subpartLikeLabel &&
    !interpretation.nullOnlyEmotionalLike &&
    conceptualUsefulnessSupportsCreation({
      best,
      interpretation,
      activeTopic,
    })
  ) {
    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: true,
      resolutionKind: "created_new_candidate",
      resolvedLabel: interpretation.canonicalLabel,
      matchConfidence: Math.max(
        interpretation.labelConfidence,
        winner.score,
        getStructuralCreateFloor(interpretation)
      ),
      resolutionTrace: trace,
    };
  }

  return {
    matchedTopic: null,
    vectorInfo,
    shouldCreateNewTopic: false,
    resolutionKind: "no_match",
    resolvedLabel: interpretation.canonicalLabel ?? null,
    matchConfidence: Math.max(
      best?.similarity ?? 0,
      interpretation.labelConfidence * 0.7,
      winner.score * 0.7
    ),
    resolutionTrace: trace,
  };
}

export function resolveTopicForMessage(
  message: string,
  existingTopics: RouteTopic[],
  activeTopic?: RouteTopic | null,
  semanticVectorInfo?: VectorInfo | null
): TopicMatchResult {
  const normalizedSemanticVectorInfo = normalizeVectorInfo(semanticVectorInfo);

  const adjudication = adjudicateTopicResolution(
    message,
    existingTopics,
    activeTopic,
    normalizedSemanticVectorInfo
  );

  const {
    labeling,
    interpretation,
    vectorInfo,
    activeTopicScore,
    trace,
  } = adjudication;

  if (!existingTopics.length) {
    const createFloor = getStructuralCreateFloor(interpretation);
    const createConfidence =
      (labeling.topic_decision.should_create_new_topic || interpretation.structurallyStrongLabel) &&
      !interpretation.suspiciousLabel &&
      !interpretation.subpartLikeLabel &&
      !interpretation.nullOnlyEmotionalLike &&
      (!interpretation.domainAnchorLike || interpretation.pairedTargetLike || interpretation.questionSynthesisLike || interpretation.durableConceptLike)
        ? Math.max(labeling.topic_decision.confidence, interpretation.durableConceptLike ? getStructuralCreateFloor(interpretation) : 0)
        : 0;

    return {
      matchedTopic: null,
      vectorInfo,
      shouldCreateNewTopic: createConfidence >= createFloor,
      resolutionKind:
        createConfidence >= createFloor ? "created_new_candidate" : "no_match",
      resolvedLabel: labeling.topic_decision.canonical_label ?? null,
      matchConfidence:
        createConfidence >= createFloor
          ? createConfidence
          : labeling.topic_decision.confidence,
      resolutionTrace: trace,
    };
  }

  const explicitExistingTarget = extractExplicitExistingTopicTarget(message, existingTopics, activeTopic);
  if (explicitExistingTarget) {
    return {
      matchedTopic: explicitExistingTarget,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind:
        explicitExistingTarget.id === activeTopic?.id ? "fallback_active_topic" : "matched_existing",
      resolvedLabel: explicitExistingTarget.name,
      matchConfidence: 0.95,
      resolutionTrace: trace,
    };
  }

  if (interpretation.followupSignals.returnToPrevious) {
    const previousTopic = findPreviousNonActiveTopic(existingTopics, activeTopic);
    if (previousTopic) {
      return {
        matchedTopic: previousTopic,
        vectorInfo,
        shouldCreateNewTopic: false,
        resolutionKind: "fallback_existing_topic",
        resolvedLabel: previousTopic.name,
        matchConfidence: 0.9,
        resolutionTrace: trace,
      };
    }
  }

  if (activeTopic && shouldUseHardActiveFollowupOverride(interpretation, labeling)) {
    const hardFollowupFloor = interpretation.followupSignals.mixedFollowup
      ? 0.9
      : interpretation.followupSignals.subpartFollowup
        ? 0.88
        : interpretation.followupSignals.anaphoricFollowup || interpretation.followupSignals.metaContinuation
          ? 0.86
          : 0.84;

    return {
      matchedTopic: activeTopic,
      vectorInfo,
      shouldCreateNewTopic: false,
      resolutionKind: "fallback_active_topic",
      resolvedLabel: activeTopic.name,
      matchConfidence: Math.max(activeTopicScore?.similarity ?? 0, hardFollowupFloor, interpretation.labelConfidence),
      resolutionTrace: trace,
    };
  }

  return buildFinalMatchResultFromDecision({
    adjudication,
    activeTopic,
  });
}

function buildSeededTopic(args: {
  name: string;
  nextStep: string;
  existingTopics: RouteTopic[];
}): RouteTopic {
  const position = computeNextTopicPosition(args.existingTopics);

  return {
    id: makeId("topic"),
    name: args.name,
    diagnosis: "representation_gap",
    nextStep: args.nextStep,
    confusion: 0.58,
    insight: 0.34,
    learningScore: 0.22,
    position,
    scale: 1,
    messageCount: 1,
    lastUpdated: new Date().toISOString(),
    hasAvailableProbe: false,
  } as RouteTopic;
}

export function buildSeededTopicFromMessage(
  message: string,
  existingTopics: RouteTopic[]
): RouteTopic {
  const labeling = buildLabelingResult(message, []);
  const canonicalName = canonicalizeTopicNameFromLabeling(labeling);
  const frame = inferPrimaryMessageFrameFromLabeling(labeling);

  return buildSeededTopic({
    name: canonicalName,
    nextStep: inferSeededNextStepFromConceptAndFrame(canonicalName, frame),
    existingTopics,
  });
}

export function buildSeededTopicFromResolvedLabel(args: {
  resolvedLabel: string;
  existingTopics: RouteTopic[];
  frame?: MessageFrame;
}): RouteTopic {
  return buildSeededTopic({
    name: args.resolvedLabel,
    nextStep: inferSeededNextStepFromConceptAndFrame(
      args.resolvedLabel,
      args.frame ?? "explain_request"
    ),
    existingTopics: args.existingTopics,
  });
}

function extractPositionFromTopicJson(topicJson: unknown): [number, number, number] | null {
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  const json = topicJson as {
    learning_space_topic?: {
      position?: unknown;
    };
  };

  return isPosition(json.learning_space_topic?.position)
    ? json.learning_space_topic.position
    : null;
}

function mapRowsToTopics(
  rows: Awaited<ReturnType<typeof getLatestTopicState>>
): RouteTopic[] {
  if (!rows?.length) {
    return [];
  }

  return rows.map((row, index) => {
    const fallbackTopic = mockTopics[index % mockTopics.length];

    const position = extractPositionFromTopicJson(row.topic_json) ?? fallbackTopic.position;

    return {
      ...fallbackTopic,
      id: row.topic_id ?? fallbackTopic.id ?? makeId("topic"),
      name: row.topic_name?.trim() || fallbackTopic.name,
      diagnosis: normalizeDiagnosis(row.diagnosis ?? fallbackTopic.diagnosis),
      nextStep: row.next_step?.trim() || fallbackTopic.nextStep,
      confusion: clamp(Number(row.confusion ?? fallbackTopic.confusion), 0, 1),
      insight: clamp(Number(row.insight ?? fallbackTopic.insight), 0, 1),
      learningScore: clamp(Number(row.learning_score ?? fallbackTopic.learningScore), 0, 1),
      position,
      scale: fallbackTopic.scale ?? 1,
      messageCount: fallbackTopic.messageCount ?? 0,
      lastUpdated: row.updated_at ?? fallbackTopic.lastUpdated ?? null,
      hasAvailableProbe: false,
    } as RouteTopic;
  });
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  try {
    const rows = await getLatestTopicState();
    const mapped = mapRowsToTopics(rows);

    return mapped;
  } catch (error) {
    console.error(
      "Failed to read topic_state in loadRouteTopics; returning empty topic list:",
      error
    );
    return [];
  }
}