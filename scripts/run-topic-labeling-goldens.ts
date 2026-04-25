// scripts/run-topic-labeling-goldens.ts

import { runDeterministicTopicLabeling } from "../lib/runtime/topic-labeling/topic-label-deterministic";
import {
  resolveTopicForMessage,
  inferSeededNextStep,
  type RouteTopic,
} from "../lib/runtime/topic-resolution";
import {
  TOPIC_LABELING_GOLDENS,
  TOPIC_LABELING_SEQUENCES,
  TOPIC_LABELING_HARD_GOLDENS,
  TOPIC_LABELING_HARD_SEQUENCES,
  type GoldensTopic,
  type ResolutionKind,
  type TopicGoldenCase,
  type TopicGoldenSequence,
  type TopicGoldenSequenceStep,
} from "./topic-labeling-goldens";
import {
  TOPIC_LABELING_HOLDOUT_GOLDENS,
  TOPIC_LABELING_HOLDOUT_SEQUENCES,
} from "./topic-labeling-holdout";
import {
  blindV2Isolated,
  blindV2Sequence,
} from "./topic-labeling-goldens-blind-v2";
import {
  TOPIC_LABELING_NATURALISTIC_DIVERSE_GOLDENS,
} from "./topic-labeling-naturalistic-diverse";

type ResultScope =
  | "baseline-isolated"
  | "baseline-sequence"
  | "hard-isolated"
  | "hard-sequence"
  | "holdout-isolated"
  | "holdout-sequence"
  | "blindv2-isolated"
  | "blindv2-sequence"
  | "naturalistic-diverse";

type FailureLayer = "label" | "resolution" | "matched_topic" | "create_flag" | "forbidden";

type LayeredFailure = {
  layer: FailureLayer;
  message: string;
};

type CandidateDebug = {
  rank: number;
  label: string | null;
  span: string | null;
  coreText: string | null;
  normalizedCoreText: string | null;
  kind: string | null;
  score: number | null;
  sourceRole: string | null;
  clauseIndex: number | null;
  qualifiers: string[];
  family: string | null;
  shouldCompeteAsTopic: boolean | null;
  isSubpartReference: boolean | null;
  isDurableConcept: boolean | null;
  isWeakNounChunk: boolean | null;
  residueRisk: string | null;
  conceptPhraseShape: string | null;
  conceptHead: string | null;
  conceptModifiers: string[];
  questionSynthesisFrame: string | null;
  questionTriggerKind: string | null;
  questionWord: string | null;
  questionObject: string | null;
  synthesizedLabel: string | null;
  tailText: string | null;
  domainText: string | null;
  sourceClause: string | null;
  scoreTotal: number | null;
  pfapProtected: boolean;
  pfapMalformed: boolean;
  pfapRejectReasons: string[];
  pfapTier: string;
};

type LabelingDebug = {
  reasoningSummary: string[];
  rejectionReasons: string[];
  ambiguityFlags: string[];
  discourseProfile: {
    hasBroadToNarrowShape: boolean | null;
    hasLateBottleneckShape: boolean | null;
    hasComparisonShape: boolean | null;
    hasNullOnlyEmotionalShape: boolean | null;
    domainHints: string[];
    notes: string[];
  } | null;
};

type PfapCaseDebug = {
  expectedCandidateFound: boolean;
  expectedCandidateRank: number | null;
  actualCandidateRank: number | null;
  protectedCandidates: CandidateDebug[];
  malformedCandidates: CandidateDebug[];
  pfapFlags: string[];
  pfapLikelyIssue: string | null;
};

type ResolutionTraceDebug = {
  winnerKind: string | null;
  winnerScore: number | null;
  winnerTopicName: string | null;
  winnerLabel: string | null;
  decisionAction: string | null;
  fallbackRecommended: boolean | null;
  topGap: number | null;
  hypotheses: Array<{
    kind: string | null;
    score: number | null;
    topicName: string | null;
    label: string | null;
    reasons: string[];
  }>;
};

type CaseResult = {
  suite: "isolated" | "sequence";
  scope: ResultScope;
  id: string;
  description: string;
  message: string;

  expectedLabel: string | null | undefined;
  expectedResolutionKind: ResolutionKind | undefined;
  expectedShouldCreate: boolean | undefined;
  expectedMatchedTopicName: string | null | undefined;

  actualLabel: string | null;
  actualResolutionKind: ResolutionKind;
  actualShouldCreate: boolean;
  actualMatchedTopicName: string | null;
  actualConfidence: number;

  labelPass: boolean;
  resolutionPass: boolean;
  createPass: boolean;
  matchedTopicPass: boolean;
  forbiddenPass: boolean;
  endToEndPass: boolean;

  pass: boolean;
  failures: string[];
  layeredFailures: LayeredFailure[];

  notes?: string;
  category: string | null;

  candidateDebug: CandidateDebug[];
  labelingDebug: LabelingDebug;
  pfapDebug: PfapCaseDebug;
  resolutionTraceDebug: ResolutionTraceDebug | null;
  likelyFailureClass: string | null;
};

type CliOptions = {
  suite:
    | "all"
    | "baseline"
    | "hard"
    | "holdout"
    | "blindv2"
    | "isolated"
    | "sequence"
    | "baseline-isolated"
    | "baseline-sequence"
    | "hard-isolated"
    | "hard-sequence"
    | "holdout-isolated"
    | "holdout-sequence"
    | "blindv2-isolated"
    | "blindv2-sequence"
    | "naturalistic-diverse";
  grep: string | null;
  onlyFailures: boolean;
  debugCandidates: boolean;
  debugAll: boolean;
};

type BlindV2Case = {
  id: string;
  category?: string;
  description: string;
  message: string;
  expectedLabel?: string;
  expectedResolution?: ResolutionKind;
  expectedMatchedTopic?: string;
  expectedShouldCreate?: boolean;
  activeTopicName?: string;
  existingTopics?: string[];
  notes?: string;
};

type BlindV2SequenceStep = {
  id: string;
  category?: string;
  description: string;
  message: string;
  expectedLabel?: string;
  expectedResolution?: ResolutionKind;
  expectedMatchedTopic?: string;
  expectedShouldCreate?: boolean;
  existingTopics?: string[];
  activeTopicName?: string;
  notes?: string;
};

type ExpectedSpec = {
  expectedLabel: string | null | undefined;
  expectedResolutionKind: ResolutionKind | undefined;
  expectedShouldCreate: boolean | undefined;
  expectedMatchedTopicName: string | null | undefined;
  forbiddenResolutionKinds: ResolutionKind[] | undefined;
};

type ActualSpec = {
  actualLabel: string | null;
  actualResolutionKind: ResolutionKind;
  actualShouldCreate: boolean;
  actualMatchedTopicName: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    suite: "all",
    grep: null,
    onlyFailures: false,
    debugCandidates: false,
    debugAll: false,
  };

  for (const arg of argv) {
    if (arg === "--suite=baseline") {
      options.suite = "baseline";
    } else if (arg === "--suite=hard") {
      options.suite = "hard";
    } else if (arg === "--suite=holdout") {
      options.suite = "holdout";
    } else if (arg === "--suite=blindv2") {
      options.suite = "blindv2";
    } else if (arg === "--suite=naturalistic-diverse") {
      options.suite = "naturalistic-diverse";
    } else if (arg === "--suite=isolated") {
      options.suite = "isolated";
    } else if (arg === "--suite=sequence") {
      options.suite = "sequence";
    } else if (arg === "--suite=baseline-isolated") {
      options.suite = "baseline-isolated";
    } else if (arg === "--suite=baseline-sequence") {
      options.suite = "baseline-sequence";
    } else if (arg === "--suite=hard-isolated") {
      options.suite = "hard-isolated";
    } else if (arg === "--suite=hard-sequence") {
      options.suite = "hard-sequence";
    } else if (arg === "--suite=holdout-isolated") {
      options.suite = "holdout-isolated";
    } else if (arg === "--suite=holdout-sequence") {
      options.suite = "holdout-sequence";
    } else if (arg === "--suite=blindv2-isolated") {
      options.suite = "blindv2-isolated";
    } else if (arg === "--suite=blindv2-sequence") {
      options.suite = "blindv2-sequence";
    } else if (arg.startsWith("--grep=")) {
      options.grep = arg.slice("--grep=".length).trim() || null;
    } else if (arg === "--only-failures") {
      options.onlyFailures = true;
    } else if (arg === "--debug-candidates") {
      options.debugCandidates = true;
    } else if (arg === "--debug-all") {
      options.debugAll = true;
      options.debugCandidates = true;
    }
  }

  return options;
}

function extractCategory(notes?: string, explicitCategory?: string): string | null {
  if (explicitCategory?.trim()) {
    return explicitCategory.trim().toLowerCase();
  }

  if (!notes) return null;

  const match = notes.match(/\[category:([^\]]+)\]/i);
  if (!match?.[1]) return null;

  return match[1].trim().toLowerCase();
}

function makeRouteTopics(topics: GoldensTopic[]): RouteTopic[] {
  return topics.map((topic, index) => ({
    id: topic.id,
    name: topic.name,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(topic.name),
    confusion: 0.5,
    insight: 0.3,
    learningScore: 0.2,
    position: [index * 2, 0, 0] as [number, number, number],
    scale: 1,
    messageCount: 1,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    hasAvailableProbe: false,
  })) as RouteTopic[];
}

function makeRouteTopicsFromNames(names: string[]): RouteTopic[] {
  return names.map((name, index) => ({
    id: `seed-${index}-${name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")}`,
    name,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(name),
    confusion: 0.5,
    insight: 0.3,
    learningScore: 0.2,
    position: [index * 2, 0, 0] as [number, number, number],
    scale: 1,
    messageCount: 1,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    hasAvailableProbe: false,
  })) as RouteTopic[];
}

function makeCreatedTopic(label: string, index: number): RouteTopic {
  return {
    id: `created-${index}-${label.toLowerCase().replace(/\s+/g, "-")}`,
    name: label,
    diagnosis: "representation_gap",
    nextStep: inferSeededNextStep(label),
    confusion: 0.5,
    insight: 0.3,
    learningScore: 0.2,
    position: [index * 2, 0, 0] as [number, number, number],
    scale: 1,
    messageCount: 1,
    lastUpdated: "2026-01-01T00:00:00.000Z",
    hasAvailableProbe: false,
  } as RouteTopic;
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function readPath(root: unknown, path: string[]): unknown {
  let cursor = root;

  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }

  return cursor;
}

function readArrayPath(root: unknown, path: string[]): unknown[] {
  const value = readPath(root, path);
  return Array.isArray(value) ? value : [];
}

function normalizeBlindV2ExpectedResolution(
  source: BlindV2Case | BlindV2SequenceStep
): ResolutionKind | undefined {
  return source.expectedResolution;
}

function normalizeBlindV2ExpectedMatchedTopic(
  source: BlindV2Case | BlindV2SequenceStep
): string | null | undefined {
  if (!hasOwn(source, "expectedMatchedTopic")) return undefined;
  return source.expectedMatchedTopic ?? null;
}

function getExpectedSpec(
  source: TopicGoldenCase | TopicGoldenSequenceStep
): ExpectedSpec {
  return {
    expectedLabel: hasOwn(source, "expectedLabel") ? source.expectedLabel ?? null : undefined,
    expectedResolutionKind: hasOwn(source, "expectedResolutionKind")
      ? source.expectedResolutionKind
      : undefined,
    expectedShouldCreate: hasOwn(source, "expectedShouldCreate")
      ? source.expectedShouldCreate
      : undefined,
    expectedMatchedTopicName: hasOwn(source, "expectedMatchedTopicName")
      ? source.expectedMatchedTopicName ?? null
      : undefined,
    forbiddenResolutionKinds: source.forbiddenResolutionKinds,
  };
}

function getBlindV2ExpectedSpec(
  source: BlindV2Case | BlindV2SequenceStep
): ExpectedSpec {
  return {
    expectedLabel: hasOwn(source, "expectedLabel") ? source.expectedLabel ?? null : undefined,
    expectedResolutionKind: normalizeBlindV2ExpectedResolution(source),
    expectedShouldCreate: hasOwn(source, "expectedShouldCreate")
      ? source.expectedShouldCreate ?? false
      : undefined,
    expectedMatchedTopicName: normalizeBlindV2ExpectedMatchedTopic(source),
    forbiddenResolutionKinds: undefined,
  };
}

function evaluateLayeredExpectations(
  expected: ExpectedSpec,
  actual: ActualSpec
): {
  labelPass: boolean;
  resolutionPass: boolean;
  createPass: boolean;
  matchedTopicPass: boolean;
  forbiddenPass: boolean;
  endToEndPass: boolean;
  layeredFailures: LayeredFailure[];
  failures: string[];
} {
  const layeredFailures: LayeredFailure[] = [];

  const labelPass = labelsEquivalent(expected.expectedLabel, actual.actualLabel);

  if (!labelPass) {
    layeredFailures.push({
      layer: "label",
      message: `expectedLabel=${JSON.stringify(
        expected.expectedLabel
      )} actualLabel=${JSON.stringify(actual.actualLabel)}`,
    });
  }

  const resolutionPass =
    expected.expectedResolutionKind === undefined ||
    expected.expectedResolutionKind === actual.actualResolutionKind;

  if (!resolutionPass) {
    layeredFailures.push({
      layer: "resolution",
      message: `expectedResolutionKind=${expected.expectedResolutionKind} actualResolutionKind=${actual.actualResolutionKind}`,
    });
  }

  const createPass =
    expected.expectedShouldCreate === undefined ||
    expected.expectedShouldCreate === actual.actualShouldCreate;

  if (!createPass) {
    layeredFailures.push({
      layer: "create_flag",
      message: `expectedShouldCreate=${expected.expectedShouldCreate} actualShouldCreate=${actual.actualShouldCreate}`,
    });
  }

  const matchedTopicPass =
    expected.expectedMatchedTopicName === undefined ||
    expected.expectedMatchedTopicName === actual.actualMatchedTopicName;

  if (!matchedTopicPass) {
    layeredFailures.push({
      layer: "matched_topic",
      message: `expectedMatchedTopicName=${JSON.stringify(
        expected.expectedMatchedTopicName
      )} actualMatchedTopicName=${JSON.stringify(actual.actualMatchedTopicName)}`,
    });
  }

  const forbiddenPass = !(
    Array.isArray(expected.forbiddenResolutionKinds) &&
    expected.forbiddenResolutionKinds.includes(actual.actualResolutionKind)
  );

  if (!forbiddenPass) {
    layeredFailures.push({
      layer: "forbidden",
      message: `forbiddenResolutionKindHit=${actual.actualResolutionKind}`,
    });
  }

  return {
    labelPass,
    resolutionPass,
    createPass,
    matchedTopicPass,
    forbiddenPass,
    endToEndPass:
      labelPass && resolutionPass && createPass && matchedTopicPass && forbiddenPass,
    layeredFailures,
    failures: layeredFailures.map((failure) => failure.message),
  };
}

function labelLooksMalformedForPfap(label: string | null): boolean {
  const normalized = normalizeForLooseCompare(label);
  if (!normalized) return true;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const badEdgeWords = new Set([
    "a", "an", "the", "of", "in", "on", "for", "to", "with", "and", "or", "but",
    "if", "when", "where", "why", "how", "is", "are", "was", "were", "be", "being", "been",
    "make", "makes", "made", "feel", "feels", "seem", "seems", "look", "looks", "sound", "sounds",
    "blur", "together",
  ]);

  if (badEdgeWords.has(tokens[0]) || badEdgeWords.has(tokens[tokens.length - 1])) return true;

  return (
    /^(?:few of|blur together in|food webs make|where to start|where to even start|whole thing|the whole thing|what is going on|what s going on)$/i.test(normalized) ||
    /\b(?:lol|tbh|rn|pretending|panic|feels? stupid|feels? fake|whole thing confusing|lost track|throwing me off|tripping me up)\b/i.test(normalized) ||
    /\b(?:make|makes|made|feel|feels|seem|seems|look|looks|sound|sounds)\s*$/i.test(normalized)
  );
}

function candidateLooksPfapProtected(candidate: CandidateDebug): boolean {
  const label = normalizeForLooseCompare(candidate.label ?? candidate.coreText ?? candidate.span);
  if (!label) return false;
  if (candidate.pfapMalformed) return false;
  if (candidate.shouldCompeteAsTopic === false) return false;
  if (candidate.isSubpartReference === true) return false;
  if (candidate.isWeakNounChunk === true) return false;
  if (candidate.residueRisk === "high") return false;

  const hasProtectionQualifier =
    candidateHasQualifier(candidate, "strong_phrase_match") ||
    candidateHasQualifier(candidate, "durable_concept") ||
    candidateHasQualifier(candidate, "concept_phrase") ||
    candidateHasQualifier(candidate, "bottleneck_target") ||
    candidateHasQualifier(candidate, "late_focus_target") ||
    candidateHasQualifier(candidate, "paired_with_domain_anchor") ||
    candidateHasQualifier(candidate, "cross_clause_recovery") ||
    candidateHasQualifier(candidate, "question_synthesis") ||
    candidateHasQualifier(candidate, "qcs_candidate");

  const protectedKind =
    candidate.kind === "concept_phrase" ||
    candidate.kind === "named_concept" ||
    candidate.kind === "comparison_pair" ||
    candidate.kind === "domain_shaped" ||
    candidate.kind === "of_phrase" ||
    candidate.kind === "question_synthesis" ||
    candidate.kind === "focus_target";

  const protectedShape =
    /\b(?:earned runs|tennis scoring|merge lanes|shutoff valve|knife skills|offside in soccer|primary source analysis|causes of the french revolution|systolic vs diastolic blood pressure|civil liberties vs civil rights|mitosis vs meiosis|food chains vs food webs|consideration in contracts|monitoring understanding|comma splices)\b/i.test(label) ||
    /\bvs\b/.test(label) ||
    /\b(?:of|in|on|for)\b/.test(label) ||
    /\b(?:analysis|scoring|skills?|checks?|cycles?|response|significance|agreement|voice|planning|anxiety|notation|recognition|scale|boundaries|parking|lanes|values|powers|selection|equations?|transmission|intervals|pollination|succession|velocity|phases|proof|precedent|regulation|reappraisal|mapping|reaction|depreciation)\b/.test(label);

  return Boolean(candidate.isDurableConcept || hasProtectionQualifier || protectedKind || protectedShape);
}

function getPfapTier(candidate: CandidateDebug): string {
  if (!candidate.pfapProtected) return "unprotected";
  if (
    candidateHasQualifier(candidate, "bottleneck_target") ||
    candidateHasQualifier(candidate, "late_focus_target") ||
    candidateHasQualifier(candidate, "cross_clause_recovery") ||
    candidateHasQualifier(candidate, "paired_with_domain_anchor")
  ) return "protected_bottleneck";
  if (candidate.kind === "comparison_pair" || /\bvs\b/i.test(candidate.label ?? "")) return "protected_comparison";
  if (candidate.kind === "domain_shaped" || candidate.domainText) return "protected_domain_shaped";
  if (candidate.kind === "question_synthesis" || candidate.questionSynthesisFrame) return "protected_qcs";
  return "protected_concept";
}

function buildPfapRejectReasons(candidate: CandidateDebug): string[] {
  const reasons: string[] = [];
  if (candidate.pfapMalformed) reasons.push("malformed_topic_label");
  if (candidate.shouldCompeteAsTopic === false) reasons.push("non_competing_candidate");
  if (candidate.isSubpartReference === true) reasons.push("subpart_reference");
  if (candidate.isWeakNounChunk === true) reasons.push("weak_noun_chunk");
  if (candidate.residueRisk === "high") reasons.push("high_residue_risk");
  if (candidate.tailText) reasons.push("tail_text_present");
  return reasons;
}

function extractLabelingDebug(labeling: unknown): LabelingDebug {
  const discourse = readPath(labeling, ["diagnostics", "discourse_profile"]);
  const discourseRecord = isRecord(discourse) ? discourse : null;

  return {
    reasoningSummary: asStringArray(readPath(labeling, ["diagnostics", "reasoning_summary"])),
    rejectionReasons: asStringArray(readPath(labeling, ["diagnostics", "rejection_reasons"])),
    ambiguityFlags: asStringArray(readPath(labeling, ["diagnostics", "ambiguity_flags"])),
    discourseProfile: discourseRecord
      ? {
          hasBroadToNarrowShape: asBoolean(discourseRecord.has_broad_to_narrow_shape),
          hasLateBottleneckShape: asBoolean(discourseRecord.has_late_bottleneck_shape),
          hasComparisonShape: asBoolean(discourseRecord.has_comparison_shape),
          hasNullOnlyEmotionalShape: asBoolean(discourseRecord.has_null_only_emotional_shape),
          domainHints: asStringArray(discourseRecord.domain_hints),
          notes: asStringArray(discourseRecord.notes),
        }
      : null,
  };
}

function extractCandidateDebug(labeling: unknown): CandidateDebug[] {
  const possibleArrays = [
    readArrayPath(labeling, ["diagnostics", "candidates"]),
    readArrayPath(labeling, ["diagnostics", "candidate_debug"]),
    readArrayPath(labeling, ["diagnostics", "scored_candidates"]),
    readArrayPath(labeling, ["candidate_debug"]),
    readArrayPath(labeling, ["candidates"]),
  ];

  const source = possibleArrays.find((items) => items.length > 0) ?? [];

  return source.filter(isRecord).map((candidate, index): CandidateDebug => {
    const scoreBreakdown = isRecord(candidate.scoreBreakdown)
      ? candidate.scoreBreakdown
      : isRecord(candidate.score_breakdown)
        ? candidate.score_breakdown
        : null;

    const coreText = asString(candidate.coreText) ?? asString(candidate.core_text) ?? asString(candidate.core) ?? asString(candidate.span) ?? null;
    const span = asString(candidate.span) ?? asString(candidate.normalizedSpan) ?? asString(candidate.normalized_span) ?? null;
    const label = asString(candidate.label) ?? asString(candidate.displayLabel) ?? asString(candidate.display_label) ?? coreText ?? span;

    const draft: CandidateDebug = {
      rank: index + 1,
      label,
      span,
      coreText,
      normalizedCoreText: asString(candidate.normalizedCoreText) ?? asString(candidate.normalized_core_text) ?? asString(candidate.normalized_span) ?? null,
      kind: asString(candidate.kind),
      score: asNumber(candidate.score),
      sourceRole: asString(candidate.sourceRole) ?? asString(candidate.source_role),
      clauseIndex: asNumber(candidate.clauseIndex) ?? asNumber(candidate.clause_index),
      qualifiers: asStringArray(candidate.qualifiers),
      family: asString(candidate.family) ?? asString(candidate.candidateFamily) ?? asString(candidate.candidate_family),
      shouldCompeteAsTopic: asBoolean(candidate.shouldCompeteAsTopic) ?? asBoolean(candidate.should_compete_as_topic),
      isSubpartReference: asBoolean(candidate.isSubpartReference) ?? asBoolean(candidate.is_subpart_reference),
      isDurableConcept: asBoolean(candidate.isDurableConcept) ?? asBoolean(candidate.is_durable_concept),
      isWeakNounChunk: asBoolean(candidate.isWeakNounChunk) ?? asBoolean(candidate.is_weak_noun_chunk),
      residueRisk: asString(candidate.residueRisk) ?? asString(candidate.residue_risk),
      conceptPhraseShape: asString(candidate.conceptPhraseShape) ?? asString(candidate.concept_phrase_shape),
      conceptHead: asString(candidate.conceptHead) ?? asString(candidate.concept_head),
      conceptModifiers: asStringArray(candidate.conceptModifiers).length > 0 ? asStringArray(candidate.conceptModifiers) : asStringArray(candidate.concept_modifiers),
      questionSynthesisFrame: asString(candidate.questionSynthesisFrame) ?? asString(candidate.question_synthesis_frame),
      questionTriggerKind: asString(candidate.questionTriggerKind) ?? asString(candidate.question_trigger_kind),
      questionWord: asString(candidate.questionWord) ?? asString(candidate.question_word),
      questionObject: asString(candidate.questionObject) ?? asString(candidate.question_object),
      synthesizedLabel: asString(candidate.synthesizedLabel) ?? asString(candidate.synthesized_label),
      tailText: asString(candidate.tailText) ?? asString(candidate.tail_text),
      domainText: asString(candidate.domainText) ?? asString(candidate.domain_text),
      sourceClause: asString(candidate.sourceClause) ?? asString(candidate.source_clause),
      scoreTotal: scoreBreakdown == null ? null : asNumber(scoreBreakdown.total) ?? asNumber(scoreBreakdown.score),
      pfapProtected: false,
      pfapMalformed: false,
      pfapRejectReasons: [],
      pfapTier: "unprotected",
    };

    draft.pfapMalformed = labelLooksMalformedForPfap(draft.label ?? draft.coreText ?? draft.span);
    draft.pfapRejectReasons = buildPfapRejectReasons(draft);
    draft.pfapProtected = candidateLooksPfapProtected(draft);
    draft.pfapTier = getPfapTier(draft);

    return draft;
  });
}

function extractResolutionTraceDebug(resolution: unknown): ResolutionTraceDebug | null {
  const trace = readPath(resolution, ["resolutionTrace"]);
  if (!isRecord(trace)) return null;

  const winner = readPath(trace, ["winner"]);
  const winnerRecord = isRecord(winner) ? winner : null;

  const hypothesesRaw = readArrayPath(trace, ["hypotheses"]);
  const hypotheses = hypothesesRaw.filter(isRecord).map((hypothesis) => ({
    kind: asString(hypothesis.kind),
    score: asNumber(hypothesis.score),
    topicName: asString(hypothesis.topicName) ?? asString(hypothesis.topic_name),
    label: asString(hypothesis.label),
    reasons: asStringArray(hypothesis.reasons),
  }));

  return {
    winnerKind: winnerRecord ? asString(winnerRecord.kind) : null,
    winnerScore: winnerRecord ? asNumber(winnerRecord.score) : null,
    winnerTopicName: winnerRecord
      ? asString(winnerRecord.topicName) ?? asString(winnerRecord.topic_name)
      : null,
    winnerLabel: winnerRecord ? asString(winnerRecord.label) : null,
    decisionAction: asString(trace.decisionAction) ?? asString(trace.decision_action),
    fallbackRecommended: asBoolean(trace.fallbackRecommended),
    topGap: asNumber(trace.topGap),
    hypotheses,
  };
}

function candidateHasQualifier(candidate: CandidateDebug, qualifier: string): boolean {
  return candidate.qualifiers.includes(qualifier);
}

function candidateMatchesLabel(candidate: CandidateDebug, label: string | null | undefined): boolean {
  const target = normalizeForLooseCompare(label);
  if (!target) return false;

  const options = [candidate.label, candidate.coreText, candidate.span, candidate.normalizedCoreText, candidate.synthesizedLabel];
  return options.some((option) => normalizeForLooseCompare(option) === target);
}

function candidateContainsLabel(candidate: CandidateDebug, label: string | null | undefined): boolean {
  const target = normalizeForLooseCompare(label);
  if (!target) return false;

  const options = [candidate.label, candidate.coreText, candidate.span, candidate.normalizedCoreText, candidate.synthesizedLabel].map(normalizeForLooseCompare);
  return options.some((option) => option === target || option.includes(target) || target.includes(option));
}

function buildPfapCaseDebug(args: {
  expectedLabel: string | null | undefined;
  actualLabel: string | null;
  candidateDebug: CandidateDebug[];
  labelingDebug: LabelingDebug;
  actualResolutionKind: ResolutionKind;
  actualShouldCreate: boolean;
  layeredFailures: LayeredFailure[];
}): PfapCaseDebug {
  const { expectedLabel, actualLabel, candidateDebug, labelingDebug, actualResolutionKind, actualShouldCreate, layeredFailures } = args;

  const expectedCandidate = candidateDebug.find((candidate) => candidateMatchesLabel(candidate, expectedLabel));
  const actualCandidate = candidateDebug.find((candidate) => candidateMatchesLabel(candidate, actualLabel));
  const protectedCandidates = candidateDebug.filter((candidate) => candidate.pfapProtected);
  const malformedCandidates = candidateDebug.filter((candidate) => candidate.pfapMalformed);
  const pfapFlags: string[] = [];

  if (protectedCandidates.length > 0) pfapFlags.push("protected_candidates_present");
  if (expectedCandidate?.pfapProtected) pfapFlags.push("expected_candidate_pfap_protected");
  if (expectedCandidate && !expectedCandidate.pfapProtected) pfapFlags.push("expected_candidate_extracted_but_unprotected");
  if (actualCandidate?.pfapMalformed) pfapFlags.push("malformed_actual_candidate");
  if (actualLabel == null && protectedCandidates.length > 0) pfapFlags.push("protected_candidate_nulled_or_resolver_blocked");
  if (actualResolutionKind === "no_match" && protectedCandidates.length > 0) pfapFlags.push("protected_candidate_reached_no_match");
  if (!actualShouldCreate && expectedCandidate?.pfapProtected) pfapFlags.push("protected_candidate_creation_blocked");
  pfapFlags.push(...labelingDebug.ambiguityFlags.filter((flag) => flag.startsWith("pfap_")));

  const hasLabelFailure = layeredFailures.some((failure) => failure.layer === "label");
  const expectedLoose = normalizeForLooseCompare(expectedLabel);
  const actualLoose = normalizeForLooseCompare(actualLabel);

  let pfapLikelyIssue: string | null = null;
  if (hasLabelFailure && expectedCandidate?.pfapProtected && actualLabel == null) pfapLikelyIssue = "pfap_protected_candidate_nulled";
  else if (hasLabelFailure && expectedCandidate?.pfapProtected && actualCandidate?.pfapMalformed) pfapLikelyIssue = "pfap_malformed_candidate_beat_protected_candidate";
  else if (hasLabelFailure && expectedCandidate?.pfapProtected) pfapLikelyIssue = "pfap_protected_candidate_lost_final_arbitration";
  else if (hasLabelFailure && expectedCandidate && !expectedCandidate.pfapProtected) pfapLikelyIssue = "pfap_expected_candidate_needs_protection_metadata";
  else if (hasLabelFailure && expectedLoose && candidateDebug.some((candidate) => candidateContainsLabel(candidate, expectedLabel))) pfapLikelyIssue = "pfap_expected_label_partially_extracted_canonicalization_needed";
  else if (hasLabelFailure && expectedLoose && actualLoose && expectedLoose.includes(actualLoose)) pfapLikelyIssue = "pfap_domain_shaping_or_specificity_needed";
  else if (hasLabelFailure && actualCandidate?.pfapMalformed) pfapLikelyIssue = "pfap_malformed_candidate_won";
  else if (hasLabelFailure && actualLabel == null && protectedCandidates.length === 0) pfapLikelyIssue = "pfap_extraction_or_candidate_protection_missing";

  return {
    expectedCandidateFound: Boolean(expectedCandidate),
    expectedCandidateRank: expectedCandidate?.rank ?? null,
    actualCandidateRank: actualCandidate?.rank ?? null,
    protectedCandidates,
    malformedCandidates,
    pfapFlags: dedupe(pfapFlags),
    pfapLikelyIssue,
  };
}

function normalizeForLooseCompare(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelsEquivalent(
  expectedLabel: string | null | undefined,
  actualLabel: string | null | undefined
): boolean {
  if (expectedLabel === undefined) return true;
  if (expectedLabel === null || actualLabel === null) {
    return expectedLabel === actualLabel;
  }

  return normalizeForLooseCompare(expectedLabel) === normalizeForLooseCompare(actualLabel);
}

function classifyLikelyFailure(args: {
  resultLabel: string | null;
  expectedLabel: string | null | undefined;
  message: string;
  candidateDebug: CandidateDebug[];
  actualResolutionKind: ResolutionKind;
  actualShouldCreate: boolean;
  layeredFailures: LayeredFailure[];
}): string | null {
  const {
    resultLabel,
    expectedLabel,
    message,
    candidateDebug,
    actualResolutionKind,
    actualShouldCreate,
    layeredFailures,
  } = args;

  const hasLabelFailure = layeredFailures.some((failure) => failure.layer === "label");
  const hasResolutionFailure = layeredFailures.some(
    (failure) =>
      failure.layer === "resolution" ||
      failure.layer === "matched_topic" ||
      failure.layer === "create_flag" ||
      failure.layer === "forbidden"
  );

  const messageLoose = normalizeForLooseCompare(message);
  const actualLoose = normalizeForLooseCompare(resultLabel);
  const expectedLoose = normalizeForLooseCompare(expectedLabel);

  const expectedCandidate = candidateDebug.find((candidate) => {
    const labelLoose = normalizeForLooseCompare(candidate.label);
    const coreLoose = normalizeForLooseCompare(candidate.coreText);
    const spanLoose = normalizeForLooseCompare(candidate.span);

    return (
      expectedLoose.length > 0 &&
      (labelLoose === expectedLoose ||
        coreLoose === expectedLoose ||
        spanLoose === expectedLoose)
    );
  });

  const actualCandidate = candidateDebug.find((candidate) => {
    const labelLoose = normalizeForLooseCompare(candidate.label);
    const coreLoose = normalizeForLooseCompare(candidate.coreText);
    const spanLoose = normalizeForLooseCompare(candidate.span);

    return (
      actualLoose.length > 0 &&
      (labelLoose === actualLoose || coreLoose === actualLoose || spanLoose === actualLoose)
    );
  });

  const protectedCandidates = candidateDebug.filter((candidate) => candidate.pfapProtected);

  if (!hasLabelFailure && hasResolutionFailure) {
    if (actualResolutionKind === "no_match" && protectedCandidates.length > 0) {
      return "pfap_protected_label_but_resolver_no_match";
    }

    if (actualResolutionKind === "no_match") {
      return "good_label_but_resolver_no_match";
    }

    if (!actualShouldCreate && actualResolutionKind !== "matched_existing") {
      return "good_label_but_creation_blocked";
    }

    return "good_label_but_resolution_failed";
  }

  if (hasLabelFailure && expectedCandidate?.pfapProtected && resultLabel == null) {
    return "pfap_protected_candidate_nulled";
  }

  if (hasLabelFailure && expectedCandidate?.pfapProtected && actualCandidate?.pfapMalformed) {
    return "pfap_malformed_candidate_beat_protected_candidate";
  }

  if (hasLabelFailure && expectedCandidate?.pfapProtected) {
    return "pfap_protected_candidate_lost_final_arbitration";
  }

  if (hasLabelFailure && expectedCandidate) {
    return "expected_label_extracted_but_lost_competition";
  }

  if (hasLabelFailure && !expectedCandidate && expectedLoose && messageLoose.includes(expectedLoose)) {
    return "expected_label_present_in_message_but_not_extracted";
  }

  if (hasLabelFailure && actualCandidate) {
    const isActualAnchor =
      candidateHasQualifier(actualCandidate, "domain_anchor") ||
      candidateHasQualifier(actualCandidate, "domain_anchor_context") ||
      actualCandidate.kind === "context_anchor";

    const hasExpectedBottleneckShape =
      expectedCandidate != null &&
      (candidateHasQualifier(expectedCandidate, "bottleneck_target") ||
        candidateHasQualifier(expectedCandidate, "focus_target") ||
        candidateHasQualifier(expectedCandidate, "narrowed_target") ||
        candidateHasQualifier(expectedCandidate, "late_focus_target") ||
        candidateHasQualifier(expectedCandidate, "paired_with_domain_anchor"));

    if (isActualAnchor && (hasExpectedBottleneckShape || /\bbut\b|\bactual\b|\bmainly\b|\breally\b/i.test(message))) {
      return "broad_anchor_beat_buried_bottleneck";
    }

    const actualLooksResidue =
      /\b(?:where to start|feel|feels|stupid|fake|pretending|whole thing|messing me up|throwing me off|tripping me up|lost|confusing|annoyed|panic)\b/i.test(
        resultLabel ?? ""
      ) ||
      (actualCandidate.tailText != null && actualCandidate.tailText.length > 0);

    if (actualCandidate.pfapMalformed) {
      return "pfap_malformed_candidate_won";
    }

    if (actualLooksResidue) {
      return "residue_or_tail_contamination_won";
    }

    if (
      expectedLoose.includes(" in ") ||
      expectedLoose.includes(" of ") ||
      expectedLoose.includes(" and forms") ||
      expectedLoose.includes("jargon") ||
      expectedLoose.includes("terminology")
    ) {
      return "domain_shaping_failed";
    }
  }

  if (hasLabelFailure && expectedLabel == null && resultLabel != null) {
    return "null_case_overcreated_topic";
  }

  if (hasLabelFailure && resultLabel == null && expectedLabel != null) {
    if (protectedCandidates.length > 0) return "pfap_protected_candidate_nulled";
    return "topicful_message_returned_null";
  }

  return hasLabelFailure || hasResolutionFailure ? "uncategorized_failure" : null;
}

function buildCaseResult(args: {
  suite: "isolated" | "sequence";
  scope: ResultScope;
  id: string;
  description: string;
  message: string;
  expected: ExpectedSpec;
  actual: ActualSpec & { actualConfidence: number };
  notes?: string;
  category: string | null;
  labeling: unknown;
  resolution: unknown;
}): CaseResult {
  const evaluation = evaluateLayeredExpectations(args.expected, args.actual);
  const candidateDebug = extractCandidateDebug(args.labeling);
  const labelingDebug = extractLabelingDebug(args.labeling);
  const resolutionTraceDebug = extractResolutionTraceDebug(args.resolution);
  const pfapDebug = buildPfapCaseDebug({
    expectedLabel: args.expected.expectedLabel,
    actualLabel: args.actual.actualLabel,
    candidateDebug,
    labelingDebug,
    actualResolutionKind: args.actual.actualResolutionKind,
    actualShouldCreate: args.actual.actualShouldCreate,
    layeredFailures: evaluation.layeredFailures,
  });

  const likelyFailureClass = classifyLikelyFailure({
    resultLabel: args.actual.actualLabel,
    expectedLabel: args.expected.expectedLabel,
    message: args.message,
    candidateDebug,
    actualResolutionKind: args.actual.actualResolutionKind,
    actualShouldCreate: args.actual.actualShouldCreate,
    layeredFailures: evaluation.layeredFailures,
  }) ?? pfapDebug.pfapLikelyIssue;

  return {
    suite: args.suite,
    scope: args.scope,
    id: args.id,
    description: args.description,
    message: args.message,

    expectedLabel: args.expected.expectedLabel,
    expectedResolutionKind: args.expected.expectedResolutionKind,
    expectedShouldCreate: args.expected.expectedShouldCreate,
    expectedMatchedTopicName: args.expected.expectedMatchedTopicName,

    actualLabel: args.actual.actualLabel,
    actualResolutionKind: args.actual.actualResolutionKind,
    actualShouldCreate: args.actual.actualShouldCreate,
    actualMatchedTopicName: args.actual.actualMatchedTopicName,
    actualConfidence: args.actual.actualConfidence,

    labelPass: evaluation.labelPass,
    resolutionPass: evaluation.resolutionPass,
    createPass: evaluation.createPass,
    matchedTopicPass: evaluation.matchedTopicPass,
    forbiddenPass: evaluation.forbiddenPass,
    endToEndPass: evaluation.endToEndPass,

    pass: evaluation.endToEndPass,
    failures: evaluation.failures,
    layeredFailures: evaluation.layeredFailures,

    notes: args.notes,
    category: args.category,

    candidateDebug,
    labelingDebug,
    pfapDebug,
    resolutionTraceDebug,
    likelyFailureClass,
  };
}

function evaluateCase(
  testCase: TopicGoldenCase,
  scope:
    | "baseline-isolated"
    | "hard-isolated"
    | "holdout-isolated"
    | "naturalistic-diverse"
): CaseResult {
  const existingTopics = makeRouteTopics(testCase.existingTopics);
  const activeTopic =
    testCase.activeTopicId == null
      ? null
      : existingTopics.find((topic) => topic.id === testCase.activeTopicId) ?? null;

  const labeling = runDeterministicTopicLabeling({
    raw_message: testCase.message,
    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,
    recent_topic_names: existingTopics.map((t) => t.name),
    retrieval_candidates: existingTopics.map((topic) => ({
      topic_id: topic.id,
      topic_name: topic.name,
      similarity: 0,
    })),
  });

  const resolution = resolveTopicForMessage(testCase.message, existingTopics, activeTopic);

  const actualLabel = labeling.topic_decision.canonical_label ?? null;
  const actualResolutionKind = resolution.resolutionKind;
  const actualShouldCreate = resolution.shouldCreateNewTopic;
  const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
  const actualConfidence = resolution.matchConfidence;

  return buildCaseResult({
    suite: "isolated",
    scope,
    id: testCase.id,
    description: testCase.description,
    message: testCase.message,
    expected: getExpectedSpec(testCase),
    actual: {
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
      actualConfidence,
    },
    notes: testCase.notes,
    category: extractCategory(testCase.notes),
    labeling,
    resolution,
  });
}

function evaluateBlindV2Case(
  testCase: BlindV2Case,
  scope: "blindv2-isolated"
): CaseResult {
  const existingTopics = makeRouteTopicsFromNames(testCase.existingTopics ?? []);
  const activeTopic =
    testCase.activeTopicName == null
      ? null
      : existingTopics.find((topic) => topic.name === testCase.activeTopicName) ?? null;

  const labeling = runDeterministicTopicLabeling({
    raw_message: testCase.message,
    active_topic_id: activeTopic?.id ?? null,
    active_topic_name: activeTopic?.name ?? null,
    recent_topic_names: existingTopics.map((t) => t.name),
    retrieval_candidates: existingTopics.map((topic) => ({
      topic_id: topic.id,
      topic_name: topic.name,
      similarity: 0,
    })),
  });

  const resolution = resolveTopicForMessage(testCase.message, existingTopics, activeTopic);

  const actualLabel = labeling.topic_decision.canonical_label ?? null;
  const actualResolutionKind = resolution.resolutionKind;
  const actualShouldCreate = resolution.shouldCreateNewTopic;
  const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
  const actualConfidence = resolution.matchConfidence;

  return buildCaseResult({
    suite: "isolated",
    scope,
    id: testCase.id,
    description: testCase.description,
    message: testCase.message,
    expected: getBlindV2ExpectedSpec(testCase),
    actual: {
      actualLabel,
      actualResolutionKind,
      actualShouldCreate,
      actualMatchedTopicName,
      actualConfidence,
    },
    notes: testCase.notes,
    category: extractCategory(testCase.notes, testCase.category),
    labeling,
    resolution,
  });
}

function evaluateSequence(
  sequence: TopicGoldenSequence,
  scope: "baseline-sequence" | "hard-sequence" | "holdout-sequence"
): CaseResult[] {
  let existingTopics = makeRouteTopics(sequence.initialTopics);
  let activeTopic =
    sequence.initialActiveTopicId == null
      ? null
      : existingTopics.find((topic) => topic.id === sequence.initialActiveTopicId) ?? null;

  const results: CaseResult[] = [];

  sequence.steps.forEach((step, index) => {
    const labeling = runDeterministicTopicLabeling({
      raw_message: step.message,
      active_topic_id: activeTopic?.id ?? null,
      active_topic_name: activeTopic?.name ?? null,
      recent_topic_names: existingTopics.map((t) => t.name),
      retrieval_candidates: existingTopics.map((topic) => ({
        topic_id: topic.id,
        topic_name: topic.name,
        similarity: 0,
      })),
    });

    const resolution = resolveTopicForMessage(step.message, existingTopics, activeTopic);

    const actualLabel = labeling.topic_decision.canonical_label ?? null;
    const actualResolutionKind = resolution.resolutionKind;
    const actualShouldCreate = resolution.shouldCreateNewTopic;
    const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
    const actualConfidence = resolution.matchConfidence;

    results.push(
      buildCaseResult({
        suite: "sequence",
        scope,
        id: `${sequence.id}:${step.id}`,
        description: `${sequence.description} :: ${step.id}`,
        message: step.message,
        expected: getExpectedSpec(step),
        actual: {
          actualLabel,
          actualResolutionKind,
          actualShouldCreate,
          actualMatchedTopicName,
          actualConfidence,
        },
        notes: step.notes ?? sequence.notes,
        category: extractCategory(step.notes ?? sequence.notes),
        labeling,
        resolution,
      })
    );

    if (resolution.matchedTopic) {
      activeTopic = resolution.matchedTopic;
    } else if (resolution.shouldCreateNewTopic && actualLabel) {
      const createdTopic = makeCreatedTopic(actualLabel, existingTopics.length + index);
      existingTopics = [...existingTopics, createdTopic];
      activeTopic = createdTopic;
    }
  });

  return results;
}

function evaluateBlindV2Sequence(
  steps: BlindV2SequenceStep[],
  scope: "blindv2-sequence"
): CaseResult[] {
  let existingTopics: RouteTopic[] = [];
  let activeTopic: RouteTopic | null = null;
  const results: CaseResult[] = [];

  steps.forEach((step, index) => {
    if (Array.isArray(step.existingTopics) && step.existingTopics.length > 0) {
      existingTopics = makeRouteTopicsFromNames(step.existingTopics);
    }

    if (step.activeTopicName != null) {
      activeTopic =
        existingTopics.find((topic) => topic.name === step.activeTopicName) ?? null;
    }

    const labeling = runDeterministicTopicLabeling({
      raw_message: step.message,
      active_topic_id: activeTopic?.id ?? null,
      active_topic_name: activeTopic?.name ?? null,
      recent_topic_names: existingTopics.map((t) => t.name),
      retrieval_candidates: existingTopics.map((topic) => ({
        topic_id: topic.id,
        topic_name: topic.name,
        similarity: 0,
      })),
    });

    const resolution = resolveTopicForMessage(step.message, existingTopics, activeTopic);

    const actualLabel = labeling.topic_decision.canonical_label ?? null;
    const actualResolutionKind = resolution.resolutionKind;
    const actualShouldCreate = resolution.shouldCreateNewTopic;
    const actualMatchedTopicName = resolution.matchedTopic?.name ?? null;
    const actualConfidence = resolution.matchConfidence;

    results.push(
      buildCaseResult({
        suite: "sequence",
        scope,
        id: step.id,
        description: step.description,
        message: step.message,
        expected: getBlindV2ExpectedSpec(step),
        actual: {
          actualLabel,
          actualResolutionKind,
          actualShouldCreate,
          actualMatchedTopicName,
          actualConfidence,
        },
        notes: step.notes,
        category: extractCategory(step.notes, step.category),
        labeling,
        resolution,
      })
    );

    if (resolution.matchedTopic) {
      activeTopic = resolution.matchedTopic;
    } else if (resolution.shouldCreateNewTopic && actualLabel) {
      const createdTopic = makeCreatedTopic(actualLabel, existingTopics.length + index);
      existingTopics = [...existingTopics, createdTopic];
      activeTopic = createdTopic;
    }
  });

  return results;
}

function filterResults(results: CaseResult[], options: CliOptions): CaseResult[] {
  return results.filter((result) => {
    if (options.suite === "baseline") {
      if (!result.scope.startsWith("baseline")) return false;
    } else if (options.suite === "hard") {
      if (!result.scope.startsWith("hard")) return false;
    } else if (options.suite === "holdout") {
      if (!result.scope.startsWith("holdout")) return false;
    } else if (options.suite === "blindv2") {
      if (!result.scope.startsWith("blindv2")) return false;
    } else if (options.suite === "naturalistic-diverse") {
      if (result.scope !== "naturalistic-diverse") return false;
    } else if (options.suite === "isolated") {
      if (result.suite !== "isolated") return false;
    } else if (options.suite === "sequence") {
      if (result.suite !== "sequence") return false;
    } else if (options.suite === "baseline-isolated") {
      if (result.scope !== "baseline-isolated") return false;
    } else if (options.suite === "baseline-sequence") {
      if (result.scope !== "baseline-sequence") return false;
    } else if (options.suite === "hard-isolated") {
      if (result.scope !== "hard-isolated") return false;
    } else if (options.suite === "hard-sequence") {
      if (result.scope !== "hard-sequence") return false;
    } else if (options.suite === "holdout-isolated") {
      if (result.scope !== "holdout-isolated") return false;
    } else if (options.suite === "holdout-sequence") {
      if (result.scope !== "holdout-sequence") return false;
    } else if (options.suite === "blindv2-isolated") {
      if (result.scope !== "blindv2-isolated") return false;
    } else if (options.suite === "blindv2-sequence") {
      if (result.scope !== "blindv2-sequence") return false;
    }

    if (options.grep) {
      const haystack = [
        result.id,
        result.description,
        result.message,
        result.expectedLabel ?? "",
        result.actualLabel ?? "",
        result.actualMatchedTopicName ?? "",
        result.scope,
        result.category ?? "",
        result.notes ?? "",
        result.likelyFailureClass ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(options.grep.toLowerCase())) {
        return false;
      }
    }

    if (options.onlyFailures && result.pass) {
      return false;
    }

    return true;
  });
}

function countPassed(results: CaseResult[], key: keyof Pick<
  CaseResult,
  "labelPass" | "resolutionPass" | "createPass" | "matchedTopicPass" | "endToEndPass"
>): number {
  return results.filter((result) => result[key]).length;
}

function printScopeBreakdown(results: CaseResult[]) {
  const scopes: ResultScope[] = [
    "baseline-isolated",
    "baseline-sequence",
    "hard-isolated",
    "hard-sequence",
    "holdout-isolated",
    "holdout-sequence",
    "blindv2-isolated",
    "blindv2-sequence",
    "naturalistic-diverse",
  ];

  console.log("=== Scope Breakdown ===");
  for (const scope of scopes) {
    const scopeResults = results.filter((r) => r.scope === scope);
    if (scopeResults.length === 0) {
      console.log(`${scope}: total=0`);
      continue;
    }

    const labelPassed = countPassed(scopeResults, "labelPass");
    const resolutionPassed = countPassed(scopeResults, "resolutionPass");
    const endToEndPassed = countPassed(scopeResults, "endToEndPass");
    const failed = scopeResults.length - endToEndPassed;

    console.log(
      `${scope}: total=${scopeResults.length} label=${labelPassed}/${scopeResults.length} resolution=${resolutionPassed}/${scopeResults.length} endToEnd=${endToEndPassed}/${scopeResults.length} failed=${failed}`
    );
  }
  console.log("");
}

function printSuiteBreakdown(results: CaseResult[]) {
  const suites: Array<CaseResult["suite"]> = ["isolated", "sequence"];

  console.log("=== Suite Breakdown ===");
  for (const suite of suites) {
    const suiteResults = results.filter((r) => r.suite === suite);
    if (suiteResults.length === 0) {
      console.log(`${suite}: total=0`);
      continue;
    }

    const labelPassed = countPassed(suiteResults, "labelPass");
    const resolutionPassed = countPassed(suiteResults, "resolutionPass");
    const endToEndPassed = countPassed(suiteResults, "endToEndPass");
    const failed = suiteResults.length - endToEndPassed;

    console.log(
      `${suite}: total=${suiteResults.length} label=${labelPassed}/${suiteResults.length} resolution=${resolutionPassed}/${suiteResults.length} endToEnd=${endToEndPassed}/${suiteResults.length} failed=${failed}`
    );
  }
  console.log("");
}

function printFamilyBreakdown(results: CaseResult[]) {
  const categorized = results.filter((r) => r.category);

  if (categorized.length === 0) {
    return;
  }

  const families = Array.from(
    new Set(categorized.map((r) => r.category).filter(Boolean))
  ).sort();

  console.log("=== Category Breakdown ===");
  for (const family of families) {
    const familyResults = categorized.filter((r) => r.category === family);
    const labelPassed = countPassed(familyResults, "labelPass");
    const resolutionPassed = countPassed(familyResults, "resolutionPass");
    const endToEndPassed = countPassed(familyResults, "endToEndPass");
    const failed = familyResults.length - endToEndPassed;

    console.log(
      `${family}: total=${familyResults.length} label=${labelPassed}/${familyResults.length} resolution=${resolutionPassed}/${familyResults.length} endToEnd=${endToEndPassed}/${familyResults.length} failed=${failed}`
    );
  }
  console.log("");
}

function printLikelyFailureBreakdown(results: CaseResult[]) {
  const failedResults = results.filter((r) => !r.pass);
  if (failedResults.length === 0) return;

  const classes = Array.from(
    new Set(failedResults.map((r) => r.likelyFailureClass ?? "unknown"))
  ).sort();

  console.log("=== Likely Failure Class Breakdown ===");
  for (const failureClass of classes) {
    const classResults = failedResults.filter(
      (r) => (r.likelyFailureClass ?? "unknown") === failureClass
    );
    console.log(`${failureClass}: ${classResults.length}`);
  }
  console.log("");
}

function printPfapBreakdown(results: CaseResult[]) {
  const failedResults = results.filter((r) => !r.pass);
  if (failedResults.length === 0) return;

  const withProtected = failedResults.filter((r) => r.pfapDebug.protectedCandidates.length > 0).length;
  const expectedFound = failedResults.filter((r) => r.pfapDebug.expectedCandidateFound).length;
  const expectedProtected = failedResults.filter((r) => r.pfapDebug.pfapFlags.includes("expected_candidate_pfap_protected")).length;
  const malformedActual = failedResults.filter((r) => r.pfapDebug.pfapFlags.includes("malformed_actual_candidate")).length;
  const classes = Array.from(new Set(failedResults.map((r) => r.pfapDebug.pfapLikelyIssue ?? "unknown"))).sort();

  console.log("=== PFAP Breakdown ===");
  console.log(`failed cases with protected candidates: ${withProtected}/${failedResults.length}`);
  console.log(`failed cases where expected candidate was extracted: ${expectedFound}/${failedResults.length}`);
  console.log(`failed cases where expected candidate was PFAP-protected: ${expectedProtected}/${failedResults.length}`);
  console.log(`failed cases where actual winner looked malformed: ${malformedActual}/${failedResults.length}`);
  console.log("PFAP likely issue classes:");
  for (const cls of classes) {
    const count = failedResults.filter((r) => (r.pfapDebug.pfapLikelyIssue ?? "unknown") === cls).length;
    console.log(`  ${cls}: ${count}`);
  }
  console.log("");
}

function printLayerBreakdown(results: CaseResult[]) {
  const failedResults = results.filter((r) => !r.pass);
  if (failedResults.length === 0) return;

  const labelFailures = failedResults.filter((r) =>
    r.layeredFailures.some((f) => f.layer === "label")
  ).length;
  const resolutionFailures = failedResults.filter((r) =>
    r.layeredFailures.some((f) => f.layer === "resolution")
  ).length;
  const createFailures = failedResults.filter((r) =>
    r.layeredFailures.some((f) => f.layer === "create_flag")
  ).length;
  const matchedTopicFailures = failedResults.filter((r) =>
    r.layeredFailures.some((f) => f.layer === "matched_topic")
  ).length;
  const forbiddenFailures = failedResults.filter((r) =>
    r.layeredFailures.some((f) => f.layer === "forbidden")
  ).length;

  console.log("=== Failure Layer Breakdown ===");
  console.log(`label failures: ${labelFailures}`);
  console.log(`resolution-kind failures: ${resolutionFailures}`);
  console.log(`create-flag failures: ${createFailures}`);
  console.log(`matched-topic failures: ${matchedTopicFailures}`);
  console.log(`forbidden-resolution failures: ${forbiddenFailures}`);
  console.log("");
}

function printLabelingDebug(result: CaseResult) {
  const debug = result.labelingDebug;

  if (debug.ambiguityFlags.length > 0) {
    console.log(`Ambiguity flags: ${debug.ambiguityFlags.join(", ")}`);
  }

  if (debug.rejectionReasons.length > 0) {
    console.log("Rejection reasons:");
    for (const reason of debug.rejectionReasons) console.log(`  - ${reason}`);
  }

  if (debug.discourseProfile) {
    console.log(
      `Discourse profile: broadToNarrow=${debug.discourseProfile.hasBroadToNarrowShape ?? "n/a"} lateBottleneck=${debug.discourseProfile.hasLateBottleneckShape ?? "n/a"} comparison=${debug.discourseProfile.hasComparisonShape ?? "n/a"} nullOnly=${debug.discourseProfile.hasNullOnlyEmotionalShape ?? "n/a"}`
    );
    if (debug.discourseProfile.domainHints.length > 0) console.log(`Domain hints: ${debug.discourseProfile.domainHints.join(", ")}`);
    if (debug.discourseProfile.notes.length > 0) console.log(`Discourse notes: ${debug.discourseProfile.notes.join(", ")}`);
  }
}

function printPfapDebug(result: CaseResult) {
  const debug = result.pfapDebug;

  console.log("PFAP debug:");
  console.log(
    `  expectedCandidateFound=${debug.expectedCandidateFound} expectedRank=${debug.expectedCandidateRank ?? "n/a"} actualRank=${debug.actualCandidateRank ?? "n/a"}`
  );
  console.log(
    `  protectedCandidates=${debug.protectedCandidates.length} malformedCandidates=${debug.malformedCandidates.length} likelyIssue=${debug.pfapLikelyIssue ?? "n/a"}`
  );

  if (debug.pfapFlags.length > 0) console.log(`  flags=${debug.pfapFlags.join(", ")}`);

  if (debug.protectedCandidates.length > 0) {
    console.log("  top protected candidates:");
    for (const candidate of debug.protectedCandidates.slice(0, 5)) {
      const scoreText = candidate.score != null ? candidate.score.toFixed(3) : candidate.scoreTotal != null ? candidate.scoreTotal.toFixed(3) : "n/a";
      console.log(
        `    ${candidate.rank}. label=${JSON.stringify(candidate.label)} score=${scoreText} tier=${candidate.pfapTier} kind=${candidate.kind ?? "n/a"} family=${candidate.family ?? "n/a"}`
      );
      if (candidate.pfapRejectReasons.length > 0) console.log(`       rejectReasons=${candidate.pfapRejectReasons.join(", ")}`);
    }
  }
}

function printCandidateDebug(result: CaseResult) {
  if (result.candidateDebug.length === 0) {
    console.log("Candidate debug: unavailable");
    return;
  }

  console.log("Candidate debug:");
  for (const candidate of result.candidateDebug.slice(0, 10)) {
    const scoreText =
      candidate.score != null
        ? candidate.score.toFixed(3)
        : candidate.scoreTotal != null
          ? candidate.scoreTotal.toFixed(3)
          : "n/a";

    console.log(
      `  ${candidate.rank}. label=${JSON.stringify(candidate.label)} score=${scoreText} kind=${candidate.kind ?? "n/a"} family=${candidate.family ?? "n/a"} role=${candidate.sourceRole ?? "n/a"} clause=${candidate.clauseIndex ?? "n/a"}`
    );

    console.log(
      `     pfapProtected=${candidate.pfapProtected} tier=${candidate.pfapTier} malformed=${candidate.pfapMalformed} compete=${candidate.shouldCompeteAsTopic ?? "n/a"} subpart=${candidate.isSubpartReference ?? "n/a"} durable=${candidate.isDurableConcept ?? "n/a"} weakNoun=${candidate.isWeakNounChunk ?? "n/a"} residueRisk=${candidate.residueRisk ?? "n/a"}`
    );

    if (candidate.pfapRejectReasons.length > 0) {
      console.log(`     pfapRejectReasons=${candidate.pfapRejectReasons.join(", ")}`);
    }

    if (candidate.coreText || candidate.tailText || candidate.domainText || candidate.conceptHead) {
      console.log(
        `     core=${JSON.stringify(candidate.coreText)} head=${JSON.stringify(candidate.conceptHead)} tail=${JSON.stringify(candidate.tailText)} domain=${JSON.stringify(candidate.domainText)}`
      );
    }

    if (candidate.questionSynthesisFrame || candidate.synthesizedLabel) {
      console.log(
        `     qcsFrame=${candidate.questionSynthesisFrame ?? "n/a"} trigger=${candidate.questionTriggerKind ?? "n/a"} object=${JSON.stringify(candidate.questionObject)} synthesized=${JSON.stringify(candidate.synthesizedLabel)}`
      );
    }

    if (candidate.qualifiers.length > 0) {
      console.log(`     qualifiers=${candidate.qualifiers.join(", ")}`);
    }

    if (candidate.sourceClause) {
      console.log(`     source=${JSON.stringify(candidate.sourceClause)}`);
    }
  }
}

function printResolutionTraceDebug(result: CaseResult) {
  const trace = result.resolutionTraceDebug;
  if (!trace) {
    console.log("Resolution trace: unavailable");
    return;
  }

  console.log("Resolution trace:");
  console.log(
    `  winner=${trace.winnerKind ?? "n/a"} score=${
      trace.winnerScore != null ? trace.winnerScore.toFixed(3) : "n/a"
    } topic=${JSON.stringify(trace.winnerTopicName)} label=${JSON.stringify(trace.winnerLabel)}`
  );
  console.log(
    `  decisionAction=${trace.decisionAction ?? "n/a"} fallbackRecommended=${trace.fallbackRecommended ?? "n/a"} topGap=${
      trace.topGap != null ? trace.topGap.toFixed(3) : "n/a"
    }`
  );

  if (trace.hypotheses.length > 0) {
    console.log("  hypotheses:");
    for (const hypothesis of trace.hypotheses.slice(0, 6)) {
      console.log(
        `    - kind=${hypothesis.kind ?? "n/a"} score=${
          hypothesis.score != null ? hypothesis.score.toFixed(3) : "n/a"
        } topic=${JSON.stringify(hypothesis.topicName)} label=${JSON.stringify(hypothesis.label)} reasons=${hypothesis.reasons.join("; ")}`
      );
    }
  }
}

function printSummary(results: CaseResult[], options: CliOptions) {
  const labelPassed = countPassed(results, "labelPass");
  const resolutionPassed = countPassed(results, "resolutionPass");
  const createPassed = countPassed(results, "createPass");
  const matchedTopicPassed = countPassed(results, "matchedTopicPass");
  const endToEndPassed = countPassed(results, "endToEndPass");
  const failed = results.length - endToEndPassed;

  console.log("");
  console.log("=== Topic Labeling Goldens Summary ===");
  console.log(`Total: ${results.length}`);
  console.log(`Label passed: ${labelPassed}`);
  console.log(`Resolution-kind passed: ${resolutionPassed}`);
  console.log(`Create-flag passed: ${createPassed}`);
  console.log(`Matched-topic passed: ${matchedTopicPassed}`);
  console.log(`End-to-end passed: ${endToEndPassed}`);
  console.log(`Failed: ${failed}`);
  console.log("");

  printScopeBreakdown(results);
  printSuiteBreakdown(results);
  printFamilyBreakdown(results);
  printLayerBreakdown(results);
  printLikelyFailureBreakdown(results);
  printPfapBreakdown(results);

  const tableRows = results.map((r) => ({
    scope: r.scope,
    suite: r.suite,
    category: r.category ?? "",
    id: r.id,
    e2e: r.endToEndPass ? "PASS" : "FAIL",
    labelPass: r.labelPass ? "Y" : "N",
    resolutionPass: r.resolutionPass ? "Y" : "N",
    expectedLabel: r.expectedLabel ?? "",
    actualLabel: r.actualLabel ?? "",
    expectedResolution: r.expectedResolutionKind ?? "",
    actualResolution: r.actualResolutionKind,
    matched: r.actualMatchedTopicName ?? "",
    create: r.actualShouldCreate,
    confidence: r.actualConfidence.toFixed(2),
    likelyFailure: r.likelyFailureClass ?? "",
    pfapIssue: r.pfapDebug.pfapLikelyIssue ?? "",
    pfapProtected: r.pfapDebug.protectedCandidates.length,
    expectedRank: r.pfapDebug.expectedCandidateRank ?? "",
  }));

  console.table(tableRows);

  const failedCases = results.filter((r) => !r.pass);
  if (failedCases.length > 0) {
    console.log("");
    console.log("=== Failed Cases ===");

    for (const failedCase of failedCases) {
      console.log(`\n[${failedCase.scope}] [${failedCase.id}] ${failedCase.description}`);
      console.log(`Message: ${failedCase.message}`);
      console.log(`Category: ${failedCase.category ?? "n/a"}`);
      console.log(`Expected label: ${failedCase.expectedLabel ?? "n/a"}`);
      console.log(`Actual label: ${failedCase.actualLabel}`);
      console.log(`Expected resolution: ${failedCase.expectedResolutionKind ?? "n/a"}`);
      console.log(`Actual resolution: ${failedCase.actualResolutionKind}`);
      console.log(`Expected should create: ${failedCase.expectedShouldCreate ?? "n/a"}`);
      console.log(`Actual should create: ${failedCase.actualShouldCreate}`);
      console.log(`Expected matched topic: ${failedCase.expectedMatchedTopicName ?? "n/a"}`);
      console.log(`Actual matched topic: ${failedCase.actualMatchedTopicName}`);
      console.log(`Actual confidence: ${failedCase.actualConfidence.toFixed(2)}`);
      console.log(`Likely failure class: ${failedCase.likelyFailureClass ?? "unknown"}`);

      if (failedCase.notes) {
        console.log(`Notes: ${failedCase.notes}`);
      }

      console.log("Layered failures:");
      for (const failure of failedCase.layeredFailures) {
        console.log(`  - [${failure.layer}] ${failure.message}`);
      }

      printLabelingDebug(failedCase);
      printPfapDebug(failedCase);

      if (options.debugCandidates || options.debugAll || failedCase.candidateDebug.length > 0) {
        printCandidateDebug(failedCase);
      }

      if (options.debugAll || failedCase.resolutionTraceDebug) {
        printResolutionTraceDebug(failedCase);
      }
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const baselineIsolatedResults = TOPIC_LABELING_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "baseline-isolated")
  );
  const baselineSequenceResults = TOPIC_LABELING_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "baseline-sequence")
  );

  const hardIsolatedResults = TOPIC_LABELING_HARD_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "hard-isolated")
  );
  const hardSequenceResults = TOPIC_LABELING_HARD_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "hard-sequence")
  );

  const holdoutIsolatedResults = TOPIC_LABELING_HOLDOUT_GOLDENS.map((testCase) =>
    evaluateCase(testCase, "holdout-isolated")
  );
  const holdoutSequenceResults = TOPIC_LABELING_HOLDOUT_SEQUENCES.flatMap((sequence) =>
    evaluateSequence(sequence, "holdout-sequence")
  );

  const blindV2IsolatedResults = (blindV2Isolated as BlindV2Case[]).map((testCase) =>
    evaluateBlindV2Case(testCase, "blindv2-isolated")
  );
  const blindV2SequenceResults = evaluateBlindV2Sequence(
    blindV2Sequence as BlindV2SequenceStep[],
    "blindv2-sequence"
  );

  const naturalisticDiverseResults =
    TOPIC_LABELING_NATURALISTIC_DIVERSE_GOLDENS.map((testCase) =>
      evaluateCase(testCase, "naturalistic-diverse")
    );

  const allResults = [
    ...baselineIsolatedResults,
    ...baselineSequenceResults,
    ...hardIsolatedResults,
    ...hardSequenceResults,
    ...holdoutIsolatedResults,
    ...holdoutSequenceResults,
    ...blindV2IsolatedResults,
    ...blindV2SequenceResults,
    ...naturalisticDiverseResults,
  ];

  const filteredResults = filterResults(allResults, options);

  if (filteredResults.length === 0) {
    console.log("No topic-labeling golden cases matched the current filters.");
    console.log(
      "Try without filters, or use something like --suite=naturalistic-diverse --grep=cooking --only-failures."
    );
    process.exitCode = 1;
    return;
  }

  printSummary(filteredResults, options);

  const hasFailure = filteredResults.some((r) => !r.pass);
  if (hasFailure) {
    process.exitCode = 1;
  }
}

main();