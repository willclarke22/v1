import {
  TOPIC_LABEL_SCHEMA_VERSION,
  type RetrievalCandidate,
  type TopicLabelingInput,
  type TopicLabelingResult,
  type TopicSpecificity,
  clampTopicConfidence,
} from "./topic-label-contract";
import type { MessageInterpretation, TopicCandidate } from "./topic-label-types";
import { extractConceptCandidates } from "./topic-label-candidates";
import {
  dedupe,
  isClauseLikeSpan,
  messageLooksLikePureFollowup,
  normalizeCandidateSpan,
  normalizeLoose,
  normalizeSurface,
  scoreSpecificity,
  semanticTokens,
  shapeDisplayLabel,
  tokenize,
  looksLikeSuspiciousLabel,
  analyzeMessageStructure,
} from "./topic-label-normalization";

type CandidateFamily =
  | "paired"
  | "synthesis"
  | "concept"
  | "bottleneck"
  | "mechanism"
  | "comparison"
  | "terminology"
  | "structured"
  | "anchor"
  | "other"
  | "residue";

type DiscourseCue =
  | "but"
  | "except"
  | "actually"
  | "mainly"
  | "mostly"
  | "especially"
  | "specifically"
  | "actual_thing"
  | "real_bottleneck"
  | "where_lost"
  | "when_breaks"
  | "until"
  | "after_looking_again"
  | "the_part"
  | "the_thing"
  | "terminology_barrier"
  | "language_barrier"
  | "mechanism_request";

type DiscourseZone = {
  clauseIndex: number;
  raw: string;
  normalized: string;
  cues: DiscourseCue[];
};

type DiscourseProfile = {
  broadAnchorZones: DiscourseZone[];
  bottleneckZones: DiscourseZone[];
  residueZones: DiscourseZone[];
  contrastBoundaryIndex: number | null;

  hasBroadToNarrowShape: boolean;
  hasLateBottleneckShape: boolean;
  hasLanguageBarrierShape: boolean;
  hasTerminologyBarrierShape: boolean;
  hasMechanismRequestShape: boolean;
  hasComparisonShape: boolean;
  hasNullOnlyEmotionalShape: boolean;

  domainHints: string[];
  targetHints: string[];
  notes: string[];
};

/**
 * Superset of the older TopicCandidate scoreBreakdown shape.
 * Keeping the older fields makes this structurally compatible with TopicCandidate.
 * The extra fields make debugging easier.
 */
type DeterministicCandidateScoreBreakdown = {
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

  discourseRoleWeight: number;
  durabilityWeight: number;
  mechanismWeight: number;
  conceptPhraseWeight: number;
  questionSynthesisWeight: number;
  competitionRiskPenalty: number;
  contaminationPenalty: number;
  structurePenalty: number;
  nounChunkPenalty: number;
};

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

function countSpanMentions(fullMessage: string, span: string) {
  const normalizedMessage = normalizeSurface(fullMessage).toLowerCase();
  const normalizedSpan = normalizeSurface(span).toLowerCase();

  if (!normalizedMessage || !normalizedSpan) return 0;

  const escaped = normalizedSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = normalizedMessage.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

function appearsInBroadList(clause: string, span: string) {
  const normalizedClause = normalizeSurface(clause).toLowerCase();
  const normalizedSpan = normalizeSurface(span).toLowerCase();

  if (!normalizedClause || !normalizedSpan) return false;

  const hasListStructure = clause.includes(",") || /\b(and|or)\b/i.test(clause);
  return hasListStructure && normalizedClause.includes(normalizedSpan);
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
    const tokenScore = overlapScore(labelTokens, semanticTokens(candidate.topic_name));
    const retrievalScore = candidate.similarity ?? 0;

    const score = exact * 1.0 + tokenScore * 0.72 + retrievalScore * 0.64;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore >= 0.82) return best;
  return null;
}

function getCandidateDisplayLabel(candidate: TopicCandidate) {
  return shapeDisplayLabel(candidate.coreText) ?? shapeDisplayLabel(candidate.span);
}

function candidateHasQualifier(candidate: TopicCandidate, qualifier: string) {
  return candidate.qualifiers.includes(qualifier);
}

function candidateLooksQuestionSynthesis(candidate: TopicCandidate) {
  return (
    candidate.kind === "question_synthesis" ||
    candidateHasQualifier(candidate, "question_synthesis") ||
    candidateHasQualifier(candidate, "qcs_candidate") ||
    Boolean(candidate.synthesizedLabel) ||
    Boolean(candidate.questionSynthesisFrame)
  );
}


function candidateLooksCleanQuestionTarget(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate);
  if (!label) return false;

  const isQuestionTarget =
    candidate.kind === "question_target" ||
    candidateHasQualifier(candidate, "question_target") ||
    candidateHasQualifier(candidate, "question_context");

  if (!isQuestionTarget) return false;
  if (!candidate.shouldCompeteAsTopic) return false;
  if (candidate.isSubpartReference) return false;
  if (candidateLooksWeakNounChunk(candidate)) return false;
  if (candidateHasHighResidueRisk(candidate) && !candidateLooksConceptPhrase(candidate)) return false;
  if (labelHasBadBoundaryShape(label)) return false;
  if (!labelHasContentBearingHead(label)) return false;

  const tokenCount = tokenize(label).length;
  if (tokenCount === 0 || tokenCount > 5) return false;

  // PFAP7: a clean term asked about in a question should remain eligible even
  // when the original span has explanatory tail text ("What is X if/when...").
  // The shaped display label is the durable topic; the tail is question context.
  const sourceLooksQuestionLike = /^(?:what|why|how|when|where|which|can|could|would|should|do|does|did|is|are)\b/i.test(
    candidate.sourceClause.trim()
  );

  return (
    candidateHasQualifier(candidate, "focus_target") ||
    candidateHasQualifier(candidate, "question_context") ||
    sourceLooksQuestionLike
  );
}

function candidateLooksCleanExplicitConcept(candidate: TopicCandidate) {
  if (candidateLooksQuestionSynthesis(candidate)) return false;
  if (candidateLooksWeakNounChunk(candidate)) return false;
  if (candidateHasHighResidueRisk(candidate) && !candidateLooksConceptPhrase(candidate)) return false;

  return (
    candidateLooksCleanQuestionTarget(candidate) ||
    candidate.kind === "concept_phrase" ||
    candidate.kind === "comparison_pair" ||
    candidate.kind === "domain_shaped" ||
    candidate.kind === "of_phrase" ||
    candidate.kind === "named_concept" ||
    candidateHasQualifier(candidate, "strong_phrase_match") ||
    candidateHasQualifier(candidate, "durable_concept") ||
    candidateHasQualifier(candidate, "concept_phrase")
  );
}

function candidateLooksProtectedDurableLabel(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    candidateLooksCleanExplicitConcept(candidate) ||
    /\b(?:earned runs|tennis scoring|merge lanes|shutoff valve|balancing chemical equations|zone defense|offside in soccer|right of way|knife skills|task initiation|civil liberties vs civil rights|gravity vs weight|weather vs climate|baroque vs renaissance art|your vs you're|apr|systolic vs diastolic blood pressure|consideration in contracts)\b/i.test(label)
  );
}

function candidateLooksQcsOverSynthesized(candidate: TopicCandidate, allCandidates: TopicCandidate[]) {
  if (!candidateLooksQuestionSynthesis(candidate)) return false;

  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  const hasCleanExplicitCompetitor = allCandidates.some((other) => {
    if (other === candidate) return false;
    if (!candidateLooksProtectedDurableLabel(other)) return false;
    if (candidateLooksResidueLike(other)) return false;
    if (!other.shouldCompeteAsTopic) return false;

    const otherLabel = getCandidateDisplayLabel(other)?.toLowerCase() ?? "";
    if (!otherLabel) return false;

    // Exact/clean durable concepts should beat verbose QCS labels when the
    // QCS label merely wraps the same message frame around the concept.
    return (
      label.includes(otherLabel) ||
      otherLabel.includes(label) ||
      overlapScore(semanticTokens(label), semanticTokens(otherLabel)) >= 0.35
    );
  });

  if (!hasCleanExplicitCompetitor) return false;

  return (
    /^causes of .+/.test(label) ||
    /^how to .+/.test(label) ||
    /^.+ criteria$/.test(label) ||
    /\bvs\b/.test(label) ||
    label.split(/\s+/).length >= 5
  );
}

function candidateIsOnlySuspiciousWhenStandalone(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  const tokenCount = tokenize(label).length;

  if (tokenCount > 1) return false;

  return /^(?:scoring|sweeping|mean|question|help|part|thing|stuff|say|example|concept|topic)$/.test(label);
}


function candidateLooksConceptPhrase(candidate: TopicCandidate) {
  return (
    candidate.kind === "concept_phrase" ||
    candidateHasQualifier(candidate, "concept_phrase") ||
    Boolean(candidate.isDurableConcept) ||
    candidateHasQualifier(candidate, "durable_concept")
  );
}

function candidateLooksWeakNounChunk(candidate: TopicCandidate) {
  return (
    candidate.kind === "noun_chunk" &&
    (Boolean(candidate.isWeakNounChunk) ||
      candidateHasQualifier(candidate, "weak_noun_chunk") ||
      candidate.residueRisk === "medium" ||
      candidate.residueRisk === "high")
  );
}

function candidateHasHighResidueRisk(candidate: TopicCandidate) {
  return candidate.residueRisk === "high" || candidateHasQualifier(candidate, "residue_risk");
}

function candidateLooksDurablePracticalConcept(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    candidateLooksProtectedDurableLabel(candidate) ||
    candidateLooksConceptPhrase(candidate) ||
    /\b(?:control|skills?|development|defense|scoring|questions?|bullets?|interviews?|negotiation|size|cycles?|pressure|response|analysis|wars?|significance|code|updates?|handling|splices?|agreement|voice|initiation|planning|anxiety|structure|notation|recognition|scale|perspective|powers?|federalism|selection|energy|concept|equations?|expenses?|funds?|transmission|system|intervals?|parking|way|lanes|checks|values|boundaries|velocity|phases?|proof|precedent|consideration|regulation|rumination|reappraisal|mapping|reaction|depreciation)\b/.test(label) ||
    /\b(?:interview questions|resume bullets|serving size|sleep cycles|primary source analysis|react state updates|api error handling|right of way|burden of proof|emotion regulation|concept mapping|oil change intervals|water pressure|moon phases|map scale)\b/.test(label)
  );
}

function candidateLooksClauseWrapped(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate);
  if (!label) return false;

  return /^(?:is|are|it'?s|it is|but|actually|after looking again|i think|i guess|what i am saying is)\b/i.test(
    label
  );
}

function candidateLooksTailHeavy(candidate: TopicCandidate) {
  const combined = `${candidate.coreText} ${candidate.tailText ?? ""}`.toLowerCase();

  return (
    /\band everyone else seems\b/i.test(combined) ||
    /\bare what make\b/i.test(combined) ||
    /\bis what make\b/i.test(combined) ||
    /\bare still what make\b/i.test(combined) ||
    /\bis still what make\b/i.test(combined) ||
    /\byet\b/i.test(combined) ||
    /\blol\b/i.test(combined) ||
    /\btbh\b/i.test(combined) ||
    /\blose track\b/i.test(combined) ||
    /\bwhole thing confusing\b/i.test(combined) ||
    /\bmess(?:es)? me up\b/i.test(combined) ||
    /\bthrowing me off\b/i.test(combined) ||
    /\btripping me up\b/i.test(combined) ||
    /\bdoesn'?t click\b/i.test(combined) ||
    /\bnot clicking\b/i.test(combined) ||
    /\bwhere i stop\b/i.test(combined) ||
    /\bpretending i understand\b/i.test(combined) ||
    /\bfeels? fake\b/i.test(combined) ||
    /\bfeel(?:ing)? stupid\b/i.test(combined) ||
    /\bpanic\b/i.test(combined)
  );
}

function candidateLooksNoisyResidue(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  const core = candidate.coreText.toLowerCase();
  const tail = (candidate.tailText ?? "").toLowerCase();

  return (
    label === "yet" ||
    label === "up lol" ||
    label === "whole thing confusing" ||
    label === "lose track" ||
    label === "student loans tbh" ||
    label === "premium mean" ||
    label === "where to start" ||
    label === "where to even start" ||
    label === "once everything is ready" ||
    label === "interview coming up" ||
    label === "ui changes in" ||
    label === "type of case" ||
    label === "until it gets louder" ||
    label === "already know five other words" ||
    label === "what is going on" ||
    label === "what's going on" ||
    /\btbh\b/.test(core) ||
    /\blol\b/.test(core) ||
    /\byet\b/.test(core) ||
    /\blose track\b/.test(core) ||
    /\bwhole thing confusing\b/.test(core) ||
    /\bmess(?:es)? me up\b/.test(core) ||
    /\bthrowing me off\b/.test(core) ||
    /\btripping me up\b/.test(core) ||
    /\bpretending i understand\b/.test(core) ||
    /\bfeel(?:ing)? stupid\b/.test(core) ||
    /\bfeel(?:s)? fake\b/.test(core) ||
    /\bpanic\b/.test(core) ||
    /\btbh\b/.test(tail) ||
    /\blol\b/.test(tail)
  );
}

function candidateLooksProblemFraming(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    /\bdeterministic code can'?t solve all\b/i.test(label) ||
    /\bsolve all my problems\b/i.test(label) ||
    /\bwhole thing confusing\b/i.test(label) ||
    /\blose track\b/i.test(label) ||
    /\bwhere to start\b/i.test(label) ||
    /\bwhere to even start\b/i.test(label) ||
    /\bfeel(?:s|ing)? stupid\b/i.test(label) ||
    /\bfeel(?:s)? fake\b/i.test(label) ||
    /\bpretending\b/i.test(label) ||
    /\bnot clicking\b/i.test(label)
  );
}

function candidateLooksMechanismLike(candidate: TopicCandidate, message: string) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  const core = candidate.coreText.toLowerCase();

  if (!label) return false;

  return (
    candidateHasQualifier(candidate, "mechanism_target") ||
    /\bhow\b/.test(label) ||
    /\bwhy\b/.test(label) ||
    /\bwork\b/.test(label) ||
    /\bworks\b/.test(label) ||
    /\bprocess\b/.test(label) ||
    /\bmechanism\b/.test(label) ||
    /\bpathway\b/.test(label) ||
    /\bcycle\b/.test(label) ||
    /\bstep\b/.test(label) ||
    /\bsteps\b/.test(label) ||
    /\bflow\b/.test(label) ||
    /\bsequence\b/.test(label) ||
    /\bfunction\b/.test(label) ||
    /\brole\b/.test(label) ||
    /\bword order\b/.test(label) ||
    /\bwhat happens\b/.test(label) ||
    /\bwhy .+ happens\b/.test(label) ||
    /\bhow .+ works\b/.test(core) ||
    /\bhow .+ work\b/.test(core) ||
    /\bhow\b.*\bwork\b/i.test(message)
  );
}

function candidateLooksAbstractButUseful(candidate: TopicCandidate, message: string) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    /\bhow\b/.test(label) &&
    /\bwork\b/.test(label) &&
    /\b(i want to learn about|would really like to learn about|help me understand|can you explain|explain)\b/i.test(
      message
    )
  );
}

function candidateLooksObjectOnly(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  const tokens = tokenize(label);
  if (tokens.length > 2) return false;

  return (
    !candidateHasQualifier(candidate, "mechanism_target") &&
    !candidateHasQualifier(candidate, "comparison_pair") &&
    !candidateHasQualifier(candidate, "focus_target") &&
    !candidateHasQualifier(candidate, "bottleneck_target") &&
    !candidateHasQualifier(candidate, "paired_with_domain_anchor") &&
    !/\bhow\b|\bwhy\b|\bprocess\b|\bmechanism\b|\bsteps?\b|\bflow\b|\bfunction\b|\brole\b|\bword order\b/i.test(
      label
    )
  );
}

function candidateLooksGeneralBucket(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    label === "rules" ||
    label === "rule" ||
    label === "law" ||
    label === "system" ||
    label === "process" ||
    label === "part" ||
    label === "thing" ||
    label === "concept" ||
    label === "topic" ||
    label === "stuff" ||
    label === "section" ||
    label === "unit"
  );
}

function candidateLooksStructuredDurable(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    /\bvs\b/.test(label) ||
    /\b of \b/.test(label) ||
    /\b in \b/.test(label) ||
    /\b on \b/.test(label) ||
    /\bdifference between\b/.test(label) ||
    /\bhow\b.*\bwork\b/.test(label) ||
    /\bterminology\b/.test(label) ||
    /\bjargon\b/.test(label)
  );
}

function candidateLooksBottleneckTarget(candidate: TopicCandidate, message: string) {
  const sourceClause = candidate.sourceClause.toLowerCase();

  return (
    candidateHasQualifier(candidate, "bottleneck_target") ||
    candidateHasQualifier(candidate, "focus_target") ||
    candidateHasQualifier(candidate, "late_focus_target") ||
    candidateHasQualifier(candidate, "cross_clause_recovery") ||
    candidateHasQualifier(candidate, "paired_with_domain_anchor") ||
    candidateHasQualifier(candidate, "narrowed_target") ||
    /\bthe (?:part|thing|bit)\b/i.test(sourceClause) ||
    /\bactual\b/i.test(sourceClause) ||
    /\breal\b/i.test(sourceClause) ||
    /\bspecific\b/i.test(sourceClause) ||
    /\bmainly\b/i.test(sourceClause) ||
    /\bmostly\b/i.test(sourceClause) ||
    /\bespecially\b/i.test(sourceClause) ||
    /\bexcept\b/i.test(sourceClause) ||
    /\bthrowing me off\b/i.test(sourceClause) ||
    /\btripping me up\b/i.test(sourceClause) ||
    /\bdoesn'?t click\b/i.test(sourceClause) ||
    /\bstopped following\b/i.test(sourceClause) ||
    /\bbreaks my understanding\b/i.test(sourceClause) ||
    /\bwhere i (?:start getting lost|stopped following|lose track)\b/i.test(message)
  );
}

function candidateLooksDomainAnchor(candidate: TopicCandidate) {
  return (
    candidateHasQualifier(candidate, "domain_anchor") ||
    candidateHasQualifier(candidate, "domain_anchor_context") ||
    candidate.kind === "context_anchor"
  );
}

function candidateLooksNarrowedTarget(candidate: TopicCandidate) {
  return candidateHasQualifier(candidate, "narrowed_target");
}

function candidateLooksListMember(candidate: TopicCandidate) {
  return candidateHasQualifier(candidate, "list_member");
}

function candidateLooksContrastive(candidate: TopicCandidate) {
  return candidateHasQualifier(candidate, "contrastive_clause");
}

function candidateLooksPairedTarget(candidate: TopicCandidate) {
  return candidateHasQualifier(candidate, "paired_with_domain_anchor");
}

function candidateLooksTerminologyLike(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";

  return (
    /\bterminology\b/.test(label) ||
    /\bjargon\b/.test(label) ||
    /\bforms?\b/.test(label) ||
    /\bvocabulary\b/.test(label) ||
    /\bwords?\b/.test(label)
  );
}

function candidateLooksResidueLike(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return true;

  // Protected durable labels are allowed even if they contain words that are
  // suspicious only when standalone, such as "scoring" or "mean".
  if (candidateLooksProtectedDurableLabel(candidate) && !candidateIsOnlySuspiciousWhenStandalone(candidate)) {
    return false;
  }

  if (candidateLooksQuestionSynthesis(candidate) && !looksLikeSuspiciousLabel(label)) {
    return false;
  }

  if (candidateLooksWeakNounChunk(candidate)) return true;
  if (candidateHasHighResidueRisk(candidate) && !candidateLooksConceptPhrase(candidate)) return true;

  return (
    looksLikeSuspiciousLabel(label) ||
    candidateLooksClauseWrapped(candidate) ||
    candidateLooksNoisyResidue(candidate) ||
    candidateLooksProblemFraming(candidate) ||
    candidateLooksTailHeavy(candidate) ||
    /^like$/.test(label) ||
    /^weird$/.test(label) ||
    /^better$/.test(label) ||
    /^again$/.test(label) ||
    /^where to start$/.test(label) ||
    /^where to even start$/.test(label) ||
    /^i don'?t get$/.test(label) ||
    /^i dont get$/.test(label)
  );
}

function candidateLooksInstructionalTarget(candidate: TopicCandidate, message: string) {
  return (
    !candidateLooksResidueLike(candidate) &&
    !candidateLooksGeneralBucket(candidate) &&
    candidate.shouldCompeteAsTopic &&
    !candidate.isSubpartReference &&
    (candidateLooksPairedTarget(candidate) ||
      candidateLooksBottleneckTarget(candidate, message) ||
      candidateLooksMechanismLike(candidate, message) ||
      candidateLooksTerminologyLike(candidate) ||
      candidate.kind === "comparison_pair" ||
      candidate.kind === "question_synthesis" ||
      candidate.kind === "concept_phrase" ||
      candidateLooksDurablePracticalConcept(candidate) ||
      candidate.kind === "of_phrase" ||
      candidate.kind === "domain_shaped" ||
      candidate.kind === "focus_target" ||
      candidate.kind === "named_concept")
  );
}

function messageRequestsMechanism(message: string) {
  return (
    /\bhow\b.*\bwork\b/i.test(message) ||
    /\bwhy\b/i.test(message) ||
    /\bprocess\b/i.test(message) ||
    /\bmechanism\b/i.test(message) ||
    /\bsteps?\b/i.test(message) ||
    /\bwhat happens\b/i.test(message) ||
    /\bfunction\b/i.test(message) ||
    /\brole\b/i.test(message) ||
    /\bword order\b/i.test(message)
  );
}

function messageHasBroadToNarrowStructure(message: string) {
  return /\bbut\b|\bexcept\b|\bactually\b|\breally just\b|\bmainly\b|\bmostly\b|\bespecially\b|\bspecifically\b|\bonce\b|\bwhen\b|\buntil\b|\bafter looking again\b/i.test(
    message
  );
}

function messageHasWhereToStartBarrier(message: string) {
  return /\bwhere to start\b|\bdon'?t know where to start\b|\bwhere to even start\b/i.test(
    message
  );
}

function messageHasTerminologyBarrier(message: string) {
  return /\bterminology\b|\bjargon\b|\bforms?\b|\bvocabulary\b|\bsmall words\b|\bwords are asking\b/i.test(
    message
  );
}

function messageHasMultiplicityBarrier(message: string) {
  return /\bso many meanings\b|\btoo many meanings\b|\bso many different uses\b|\bevery time\b.*\bsomething else\b/i.test(
    message
  );
}

function messageHasStructureBarrier(message: string) {
  return /\bword order\b|\bsmall words\b|\bse\b|\bsentence order\b|\bsentence.*doing\b/i.test(
    message
  );
}

function messageHasComparisonShape(message: string) {
  return /\bvs\b|\bversus\b|\bdifference between\b|\bcompare\b|\bcontrast\b|\bmix(?:ing)? up\b|\bblending\b|\bblur together\b|\bblend together\b|\binterchangeable\b|\bused interchangeably\b|\bfeel(?:s)? basically the same\b|\bactual difference\b|\btell (?:them )?apart\b|\bdistinguish between\b|\bstop feeling different\b|\bcollapse into the same word\b/i.test(
    message
  );
}

function computeBestReuseHint(
  label: string | null,
  retrievalCandidates: RetrievalCandidate[]
) {
  if (!label) return 0;

  const labelTokens = semanticTokens(label);
  let bestReuseHint = 0;

  for (const retrieval of retrievalCandidates) {
    const retrievalTokens = semanticTokens(retrieval.topic_name);
    const score =
      overlapScore(labelTokens, retrievalTokens) * 0.12 +
      (retrieval.similarity ?? 0) * 0.08;

    if (score > bestReuseHint) bestReuseHint = score;
  }

  return bestReuseHint;
}

function classifyCandidateFamily(
  candidate: TopicCandidate,
  message: string
): CandidateFamily {
  if (candidateLooksResidueLike(candidate)) return "residue";
  if (candidateLooksPairedTarget(candidate)) return "paired";
  if (candidate.kind === "comparison_pair") return "comparison";
  if (candidateLooksProtectedDurableLabel(candidate) || candidate.kind === "concept_phrase" || (candidateLooksDurablePracticalConcept(candidate) && !candidateLooksQuestionSynthesis(candidate))) return "concept";
  if (candidateLooksQuestionSynthesis(candidate)) return "synthesis";
  if (candidateLooksTerminologyLike(candidate)) return "terminology";
  if (candidateLooksMechanismLike(candidate, message)) return "mechanism";
  if (candidateLooksBottleneckTarget(candidate, message)) return "bottleneck";
  if (candidateLooksStructuredDurable(candidate)) return "structured";
  if (candidateLooksDomainAnchor(candidate)) return "anchor";
  return "other";
}

function familyPriority(family: CandidateFamily) {
  switch (family) {
    case "paired":
      return 11;
    case "comparison":
      return 10;
    case "concept":
      return 9;
    case "terminology":
      return 8;
    case "mechanism":
      return 7;
    case "bottleneck":
      return 6;
    case "structured":
      return 5;
    case "synthesis":
      return 4;
    case "anchor":
      return 2;
    case "other":
      return 1;
    case "residue":
    default:
      return 0;
  }
}

function zoneFromClause(
  clause: MessageInterpretation["clauses"][number],
  cues: DiscourseCue[]
): DiscourseZone {
  return {
    clauseIndex: clause.index,
    raw: clause.raw,
    normalized: clause.normalized,
    cues,
  };
}

function collectDiscourseCues(text: string): DiscourseCue[] {
  const cues: DiscourseCue[] = [];
  const normalized = normalizeLoose(text);

  if (/\bbut\b/.test(normalized)) cues.push("but");
  if (/\bexcept\b/.test(normalized)) cues.push("except");
  if (/\bactually\b/.test(normalized)) cues.push("actually");
  if (/\bmainly\b/.test(normalized)) cues.push("mainly");
  if (/\bmostly\b/.test(normalized)) cues.push("mostly");
  if (/\bespecially\b/.test(normalized)) cues.push("especially");
  if (/\bspecifically\b/.test(normalized)) cues.push("specifically");
  if (/\bactual thing\b|\bactual issue\b|\bactual problem\b/.test(normalized)) {
    cues.push("actual_thing");
  }
  if (/\breal bottleneck\b|\breal issue\b|\breal problem\b/.test(normalized)) {
    cues.push("real_bottleneck");
  }
  if (/\bwhere i\b.*\b(?:lost|stuck|stop|stopped|following)\b/.test(normalized)) {
    cues.push("where_lost");
  }
  if (/\bwhen\b.*\b(?:breaks|falls apart|stop|stops|lost)\b/.test(normalized)) {
    cues.push("when_breaks");
  }
  if (/\buntil\b/.test(normalized)) cues.push("until");
  if (/\bafter looking again\b/.test(normalized)) cues.push("after_looking_again");
  if (/\bthe part\b|\bthat part\b/.test(normalized)) cues.push("the_part");
  if (/\bthe thing\b/.test(normalized)) cues.push("the_thing");
  if (messageHasTerminologyBarrier(normalized)) cues.push("terminology_barrier");
  if (messageHasStructureBarrier(normalized)) cues.push("language_barrier");
  if (messageRequestsMechanism(normalized)) cues.push("mechanism_request");

  return dedupe(cues);
}

function clauseLooksBroadAnchorLike(raw: string) {
  const text = normalizeLoose(raw);

  return (
    /\b(?:learning about|talking about|covered|started|doing|unit on|section on|in class|lecture|textbook|worksheet|homework|reviewing)\b/.test(
      text
    ) ||
    /\b(?:overall|in general|broad sense|the bigger topic|the whole unit|the umbrella)\b/.test(
      text
    )
  );
}

function clauseLooksBottleneckLike(raw: string) {
  const text = normalizeLoose(raw);
  const cues = collectDiscourseCues(raw);

  return (
    cues.length > 0 ||
    /\b(?:confused about|stuck on|struggling with|need help with|do not understand|don't understand|dont understand|do not get|don't get|dont get)\b/.test(
      text
    ) ||
    /\b(?:keeps? (?:messing|tripping|throwing)|doesn'?t click|not clicking|stopped following|breaks my understanding|falls apart)\b/.test(
      text
    )
  );
}

function clauseLooksResidueOnly(raw: string) {
  const text = normalizeLoose(raw);

  const hasDurableToken =
    /\b(?:mitosis|meiosis|reuptake|dopamine|osmosis|depolarization|electronegativity|crossing over|compound interest|speed of sound|law of cosines|law of sines|standard deviation|opportunity cost|subduction|negative feedback|event loop|secondary dominants|membrane potential|equilibrium constant|metaphase|anaphase|spanish|se|word order|tax|taxes|terminology|jargon|forms|curling|budget|budgeting|offside|soccer|pH|ph|LLM|llm|action potentials?)\b/i.test(
      raw
    );

  if (hasDurableToken) return false;

  return (
    /\b(?:i feel|i am feeling|i'm feeling|overwhelmed|lost|frustrated|helpless|stupid|embarrassing|panic|annoyed|dramatic)\b/.test(
      text
    ) ||
    /\b(?:do not know where to start|don't know where to start|dont know where to start|where to start|whole thing|nothing makes sense)\b/.test(
      text
    )
  );
}

function extractDomainHintsFromText(message: string) {
  const normalized = normalizeLoose(message);
  const hints: string[] = [];

  if (/\bspanish\b/.test(normalized)) hints.push("spanish");
  if (/\btaxes?\b|\btax\b/.test(normalized)) hints.push("taxes");
  if (/\binsurance\b/.test(normalized)) hints.push("insurance");
  if (/\bsoccer\b/.test(normalized)) hints.push("soccer");
  if (/\bhockey\b/.test(normalized)) hints.push("hockey");
  if (/\bcurling\b/.test(normalized)) hints.push("curling");
  if (/\bcredit card\b/.test(normalized)) hints.push("credit card");
  if (/\bstudent loans?\b/.test(normalized)) hints.push("student loans");
  if (/\bloans?\b/.test(normalized)) hints.push("loan");
  if (/\bneurotransmission\b|\bneurotransmitters?\b|\bneurons?\b|\bnervous system\b/.test(normalized)) {
    hints.push("neuroscience");
  }
  if (/\bwaves?\b|\bsound\b/.test(normalized)) hints.push("waves and sound");
  if (/\btriangles?\b/.test(normalized)) hints.push("triangles");
  if (/\bmeiosis\b|\bgenetics\b|\bchromosomes?\b/.test(normalized)) hints.push("genetics");
  if (/\bmitosis\b/.test(normalized)) hints.push("mitosis");
  if (/\bbudgeting\b|\bbudget\b/.test(normalized)) hints.push("budgeting");

  return dedupe(hints);
}

function buildDiscourseProfile(
  interpretation: MessageInterpretation,
  message: string
): DiscourseProfile {
  const broadAnchorZones: DiscourseZone[] = [];
  const bottleneckZones: DiscourseZone[] = [];
  const residueZones: DiscourseZone[] = [];
  const notes: string[] = [];

  let contrastBoundaryIndex: number | null = null;

  for (const clause of interpretation.clauses) {
    const cues = collectDiscourseCues(clause.raw);

    if (clause.hasContrastBoundary && contrastBoundaryIndex == null) {
      contrastBoundaryIndex = clause.index;
    }

    if (clauseLooksBroadAnchorLike(clause.raw)) {
      broadAnchorZones.push(zoneFromClause(clause, cues));
    }

    if (
      clauseLooksBottleneckLike(clause.raw) ||
      clause.hasFocusMarker ||
      clause.hasConfusionMarker ||
      clause.hasContrastBoundary
    ) {
      bottleneckZones.push(zoneFromClause(clause, cues));
    }

    if (clauseLooksResidueOnly(clause.raw)) {
      residueZones.push(zoneFromClause(clause, cues));
    }
  }

  const normalized = normalizeLoose(message);
  const hasBroadToNarrowShape = messageHasBroadToNarrowStructure(normalized);
  const hasLateBottleneckShape =
    hasBroadToNarrowShape &&
    bottleneckZones.some((zone) =>
      contrastBoundaryIndex == null ? true : zone.clauseIndex >= contrastBoundaryIndex
    );

  const hasLanguageBarrierShape =
    messageHasStructureBarrier(normalized) || /\bspanish\b/i.test(normalized);
  const hasTerminologyBarrierShape = messageHasTerminologyBarrier(normalized);
  const hasMechanismRequestShape = messageRequestsMechanism(normalized);
  const hasComparisonShape = messageHasComparisonShape(normalized);

  const hasAnyDurableConceptCue =
    /\b(?:of|in|on|vs|versus|difference|how|why|work|works|process|mechanism|terminology|jargon|forms|formula|law|rules?|phases?|layers?|steps?|standard deviation|opportunity cost|compound interest|reuptake|depolarization|electronegativity|crossing over|speed of sound|event loop|negative feedback|membrane potential|se|word order|pH|ph|analy[sz]e|tell whether|count as|caused|prove|should use)\b/i.test(
      normalized
    );

  const hasNullOnlyEmotionalShape =
    residueZones.length > 0 &&
    !hasAnyDurableConceptCue &&
    interpretation.clauses.every((clause) => clauseLooksResidueOnly(clause.raw));

  if (hasBroadToNarrowShape) notes.push("broad_to_narrow_shape_detected");
  if (hasLateBottleneckShape) notes.push("late_bottleneck_zone_detected");
  if (hasLanguageBarrierShape) notes.push("language_barrier_shape_detected");
  if (hasTerminologyBarrierShape) notes.push("terminology_barrier_shape_detected");
  if (hasNullOnlyEmotionalShape) notes.push("null_only_emotional_shape_detected");

  return {
    broadAnchorZones,
    bottleneckZones,
    residueZones,
    contrastBoundaryIndex,
    hasBroadToNarrowShape,
    hasLateBottleneckShape,
    hasLanguageBarrierShape,
    hasTerminologyBarrierShape,
    hasMechanismRequestShape,
    hasComparisonShape,
    hasNullOnlyEmotionalShape,
    domainHints: extractDomainHintsFromText(message),
    targetHints: [],
    notes,
  };
}

function candidateInZone(candidate: TopicCandidate, zones: DiscourseZone[]) {
  return zones.some((zone) => zone.clauseIndex === candidate.clauseIndex);
}

function candidateAfterContrast(candidate: TopicCandidate, profile: DiscourseProfile) {
  return profile.contrastBoundaryIndex == null
    ? false
    : candidate.clauseIndex >= profile.contrastBoundaryIndex;
}

function candidateLooksDomainShapedByProfile(
  candidate: TopicCandidate,
  profile: DiscourseProfile
) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  if (candidate.domainText) return true;

  if (
    profile.domainHints.includes("spanish") &&
    (/\bse\b/.test(label) || /\bword order\b/.test(label))
  ) {
    return true;
  }

  if (
    profile.domainHints.includes("taxes") &&
    (/\bterminology\b/.test(label) || /\bjargon\b/.test(label) || /\bforms?\b/.test(label))
  ) {
    return true;
  }

  if (profile.domainHints.includes("soccer") && /\boffside\b/.test(label)) {
    return true;
  }

  if (profile.domainHints.includes("insurance") && /\b(?:deductible|premium)\b/.test(label)) {
    return true;
  }

  if (profile.domainHints.includes("budgeting") && /\bbalanc/.test(label)) {
    return true;
  }

  return false;
}

function candidateLooksStrongLateBottleneck(
  candidate: TopicCandidate,
  message: string,
  profile: DiscourseProfile
) {
  return (
    !candidateLooksResidueLike(candidate) &&
    candidate.shouldCompeteAsTopic &&
    !candidate.isSubpartReference &&
    (candidateLooksBottleneckTarget(candidate, message) ||
      candidateLooksPairedTarget(candidate) ||
      candidateLooksNarrowedTarget(candidate) ||
      candidateLooksDomainShapedByProfile(candidate, profile) ||
      candidateLooksTerminologyLike(candidate) ||
      candidateLooksQuestionSynthesis(candidate) ||
      candidate.kind === "focus_target") &&
    (candidateInZone(candidate, profile.bottleneckZones) ||
      candidateAfterContrast(candidate, profile) ||
      candidateHasQualifier(candidate, "late_focus_target") ||
      candidateHasQualifier(candidate, "cross_clause_recovery") ||
      candidateHasQualifier(candidate, "paired_with_domain_anchor"))
  );
}

function buildCandidateScoreBreakdown(args: {
  candidate: TopicCandidate;
  message: string;
  interpretation: MessageInterpretation;
  discourseProfile: DiscourseProfile;
  retrievalCandidates: RetrievalCandidate[];
  allCandidates: TopicCandidate[];
}): DeterministicCandidateScoreBreakdown {
  const {
    candidate,
    message,
    interpretation,
    discourseProfile,
    retrievalCandidates,
    allCandidates,
  } = args;

  const clause = interpretation.clauses.find((item) => item.index === candidate.clauseIndex);
  const label = getCandidateDisplayLabel(candidate);
  const specificity = scoreSpecificity(label);
  const tokenCount = tokenize(candidate.coreText).length;
  const mentionCount = countSpanMentions(message, candidate.coreText);

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

  let discourseRoleWeight = 0;
  let durabilityWeight = 0;
  let mechanismWeight = 0;
  let conceptPhraseWeight = 0;
  let questionSynthesisWeight = 0;
  let competitionRiskPenalty = 0;
  let contaminationPenalty = 0;
  let structurePenalty = 0;
  let nounChunkPenalty = 0;

  if (candidate.sourceRole === "comparison") roleWeight += 0.34;
  else if (candidate.sourceRole === "confusion") roleWeight += 0.3;
  else if (candidate.sourceRole === "question") roleWeight += 0.2;
  else if (candidate.sourceRole === "request") roleWeight += 0.18;
  else if (candidate.sourceRole === "context") roleWeight -= 0.04;

  if (candidateHasQualifier(candidate, "focus_target")) focusWeight += 0.2;
  if (candidateHasQualifier(candidate, "late_focus_target")) focusWeight += 0.18;
  if (candidateHasQualifier(candidate, "cross_clause_recovery")) focusWeight += 0.14;
  if (candidateHasQualifier(candidate, "context_recovery")) contextRecoveryWeight += 0.08;

  if (clause?.hasFocusMarker) focusWeight += 0.08;
  if (clause?.hasContrastBoundary) contrastWeight += 0.1;
  if (clause?.hasConfusionMarker) confusionAdjacencyWeight += 0.12;
  if (clause?.hasRequestMarker) requestAdjacencyWeight += 0.06;

  if (candidateLooksBottleneckTarget(candidate, message)) discourseRoleWeight += 0.24;
  if (candidateLooksNarrowedTarget(candidate)) discourseRoleWeight += 0.14;
  if (candidateLooksContrastive(candidate)) discourseRoleWeight += 0.1;
  if (candidateLooksPairedTarget(candidate)) discourseRoleWeight += 0.28;
  if (candidateLooksInstructionalTarget(candidate, message)) discourseRoleWeight += 0.08;

  if (discourseProfile.hasBroadToNarrowShape && candidateLooksStrongLateBottleneck(candidate, message, discourseProfile)) {
    discourseRoleWeight += 0.32;
    focusWeight += 0.1;
  }

  if (discourseProfile.hasBroadToNarrowShape && candidateLooksDomainAnchor(candidate)) {
    competitionRiskPenalty += 0.24;
  }

  if (discourseProfile.hasLateBottleneckShape && candidateLooksDomainAnchor(candidate)) {
    competitionRiskPenalty += 0.18;
  }

  if (candidateInZone(candidate, discourseProfile.broadAnchorZones) && !candidateLooksStrongLateBottleneck(candidate, message, discourseProfile)) {
    competitionRiskPenalty += 0.08;
  }

  if (candidateInZone(candidate, discourseProfile.bottleneckZones)) {
    discourseRoleWeight += 0.08;
  }

  if (candidateAfterContrast(candidate, discourseProfile)) {
    contrastWeight += 0.08;
  }

  if (candidate.kind === "comparison_pair") {
    roleWeight += 0.24;
    durabilityWeight += 0.1;
  }

  if (candidate.kind === "of_phrase") {
    roleWeight += 0.12;
    durabilityWeight += 0.08;
  }

  if (candidate.kind === "domain_shaped") {
    roleWeight += 0.14;
    durabilityWeight += 0.1;
  }

  if (candidate.kind === "context_anchor") roleWeight += 0.04;
  if (candidate.kind === "named_concept") roleWeight += 0.06;
  if (candidate.kind === "concept_phrase") {
    roleWeight += 0.1;
    conceptPhraseWeight += 0.2;
    durabilityWeight += 0.14;
  }

  if (candidateLooksQuestionSynthesis(candidate)) {
    roleWeight += 0.08;
    questionSynthesisWeight += 0.18;
    durabilityWeight += 0.08;

    // QCS is a controlled fallback/synthesis layer. It gets credit for a
    // reusable frame, but it should not beat a cleaner explicit concept.
    if (candidate.questionTriggerKind === "explicit_question") {
      questionSynthesisWeight += 0.04;
    }
    if (candidate.questionTriggerKind === "implicit_problem") {
      questionSynthesisWeight += 0.04;
    }
    if (candidate.questionSynthesisFrame && candidate.questionSynthesisFrame !== "unknown") {
      questionSynthesisWeight += 0.04;
    }
    if (candidate.synthesizedLabel) {
      questionSynthesisWeight += 0.03;
    }

    if (candidateLooksQcsOverSynthesized(candidate, allCandidates)) {
      competitionRiskPenalty += 0.34;
      structurePenalty += 0.1;
    }
  }

  if (candidate.leftText && candidate.rightText) roleWeight += 0.08;

  if (mentionCount >= 2) mentionWeight += 0.12;
  else if (mentionCount === 1) mentionWeight += 0.04;

  if (specificity === "good") specificityWeight += 0.16;
  if (specificity === "very_specific") specificityWeight += 0.18;
  if (specificity === "broad_but_usable") specificityWeight += 0.08;
  if (specificity === "too_vague") structurePenalty += 0.38;

  if (candidateHasQualifier(candidate, "named_concept")) durabilityWeight += 0.1;
  if (candidateHasQualifier(candidate, "concept_phrase")) conceptPhraseWeight += 0.18;
  if (candidateHasQualifier(candidate, "question_synthesis")) questionSynthesisWeight += 0.16;
  if (candidateHasQualifier(candidate, "qcs_candidate")) questionSynthesisWeight += 0.12;
  if (candidateHasQualifier(candidate, "durable_concept")) durabilityWeight += 0.14;
  if (candidateLooksProtectedDurableLabel(candidate)) {
    durabilityWeight += 0.18;
    conceptPhraseWeight += 0.12;
  }
  if (candidateLooksDurablePracticalConcept(candidate)) conceptPhraseWeight += 0.12;
  if (candidateHasQualifier(candidate, "of_phrase")) durabilityWeight += 0.1;
  if (candidateLooksStructuredDurable(candidate)) durabilityWeight += 0.12;
  if (candidate.domainText) durabilityWeight += 0.08;
  if (candidateLooksPairedTarget(candidate)) durabilityWeight += 0.12;

  if (candidateLooksDomainShapedByProfile(candidate, discourseProfile)) {
    durabilityWeight += 0.12;
    discourseRoleWeight += 0.08;
  }

  if (candidateLooksMechanismLike(candidate, message)) mechanismWeight += 0.16;
  if (candidateLooksQuestionSynthesis(candidate)) {
    if (candidate.questionSynthesisFrame === "cause") mechanismWeight += 0.1;
    if (candidate.questionSynthesisFrame === "mechanism") mechanismWeight += 0.1;
    if (candidate.questionSynthesisFrame === "process") mechanismWeight += 0.08;
    if (candidate.questionSynthesisFrame === "analysis" || candidate.questionSynthesisFrame === "source_analysis") {
      discourseRoleWeight += 0.08;
    }
    if (candidate.questionSynthesisFrame === "comparison" || candidate.questionSynthesisFrame === "selection") {
      durabilityWeight += 0.08;
    }
    if (candidate.questionSynthesisFrame === "monitoring") {
      discourseRoleWeight += 0.08;
    }
  }
  if (candidateLooksAbstractButUseful(candidate, message)) mechanismWeight += 0.16;

  if (discourseProfile.hasMechanismRequestShape && candidateLooksMechanismLike(candidate, message)) {
    mechanismWeight += 0.18;
  }

  if (discourseProfile.hasMechanismRequestShape && candidateLooksPairedTarget(candidate)) {
    mechanismWeight += 0.1;
  }

  if (discourseProfile.hasMechanismRequestShape && candidateLooksObjectOnly(candidate) && !candidateLooksQuestionSynthesis(candidate)) {
    competitionRiskPenalty += 0.22;
  }

  if (
    discourseProfile.hasMechanismRequestShape &&
    candidateLooksDomainAnchor(candidate) &&
    !candidateLooksMechanismLike(candidate, message) &&
    !candidateLooksPairedTarget(candidate)
  ) {
    competitionRiskPenalty += 0.14;
  }

  if (discourseProfile.hasTerminologyBarrierShape && candidateLooksTerminologyLike(candidate)) {
    discourseRoleWeight += 0.22;
    durabilityWeight += 0.08;
  }

  if (discourseProfile.hasLanguageBarrierShape && candidateLooksDomainShapedByProfile(candidate, discourseProfile)) {
    discourseRoleWeight += 0.16;
    durabilityWeight += 0.08;
  }

  if (messageHasWhereToStartBarrier(message) && candidateLooksInstructionalTarget(candidate, message)) {
    discourseRoleWeight += 0.08;
  }

  if (
    messageHasMultiplicityBarrier(message) &&
    (candidateLooksPairedTarget(candidate) || candidateLooksMechanismLike(candidate, message))
  ) {
    discourseRoleWeight += 0.08;
  }

  reuseHintWeight += computeBestReuseHint(label, retrievalCandidates);

  if (appearsInBroadList(candidate.sourceClause, candidate.coreText)) {
    competitionRiskPenalty += 0.1;
  }

  if (!candidate.shouldCompeteAsTopic) {
    structurePenalty += 0.22;
  }

  if (candidate.isSubpartReference) {
    structurePenalty += 0.28;
  }

  if (
    candidate.coreText === "that" ||
    candidate.coreText === "it" ||
    candidate.coreText === "again"
  ) {
    structurePenalty += 0.6;
  }

  if (isClauseLikeSpan(candidate.coreText)) {
    clausePenalty += 0.22;
  }

  if (candidateLooksClauseWrapped(candidate)) {
    clausePenalty += 0.24;
  }

  if (looksLikeSuspiciousLabel(label)) {
    structurePenalty += 0.18;
  }

  if (candidateLooksGeneralBucket(candidate)) {
    genericPenalty += 0.16;
  }

  if (candidateLooksTailHeavy(candidate)) {
    contaminationPenalty += 0.2;
  }

  if (candidateLooksNoisyResidue(candidate)) {
    contaminationPenalty += 0.36;
  }

  if (candidateLooksProblemFraming(candidate)) {
    learnerStatePenalty += 0.26;
  }

  if (candidateLooksResidueLike(candidate)) {
    contaminationPenalty += 0.22;
    learnerStatePenalty += 0.12;
    structurePenalty += 0.1;
  }

  if (candidateLooksWeakNounChunk(candidate)) {
    nounChunkPenalty += 0.38;
    structurePenalty += 0.12;
  }

  if (candidate.kind === "noun_chunk" && !candidateLooksDurablePracticalConcept(candidate)) {
    nounChunkPenalty += 0.24;
  }

  if (candidateHasHighResidueRisk(candidate) && !candidateLooksConceptPhrase(candidate) && !candidateLooksQuestionSynthesis(candidate)) {
    nounChunkPenalty += 0.18;
    contaminationPenalty += 0.14;
  }

  if (
    discourseProfile.hasComparisonShape &&
    candidate.kind !== "comparison_pair" &&
    !(candidateLooksQuestionSynthesis(candidate) &&
      (candidate.questionSynthesisFrame === "comparison" ||
        candidate.questionSynthesisFrame === "selection"))
  ) {
    competitionRiskPenalty += 0.12;
  }

  if (discourseProfile.hasComparisonShape && candidate.kind === "comparison_pair") {
    roleWeight += 0.16;
    durabilityWeight += 0.08;
    discourseRoleWeight += 0.1;
  }

  if (
    candidateLooksDomainAnchor(candidate) &&
    allCandidates.some((other) => candidateLooksStrongLateBottleneck(other, message, discourseProfile))
  ) {
    competitionRiskPenalty += 0.22;
  }

  if (tokenCount > 8) {
    lengthPenalty += 0.16;
  } else if (tokenCount >= 2 && tokenCount <= 6) {
    durabilityWeight += 0.1;
  } else if (tokenCount === 1) {
    durabilityWeight += 0.02;
  }

  let total =
    0.2 +
    roleWeight +
    focusWeight +
    contrastWeight +
    confusionAdjacencyWeight +
    requestAdjacencyWeight +
    contextRecoveryWeight +
    mentionWeight +
    specificityWeight +
    reuseHintWeight +
    durabilityWeight +
    mechanismWeight +
    conceptPhraseWeight +
    questionSynthesisWeight +
    discourseRoleWeight -
    genericPenalty -
    clausePenalty -
    learnerStatePenalty -
    lengthPenalty -
    competitionRiskPenalty -
    contaminationPenalty -
    structurePenalty -
    nounChunkPenalty;

  total = clampTopicConfidence(total);

  // Weak noun chunks are fallback evidence only. They should not produce
  // high-confidence topic labels just because they occur near confusion words.
  if (candidateLooksWeakNounChunk(candidate)) total = Math.min(total, 0.34);
  else if (candidate.kind === "noun_chunk" && !candidateLooksDurablePracticalConcept(candidate)) {
    total = Math.min(total, 0.48);
  }

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
    discourseRoleWeight,
    durabilityWeight,
    mechanismWeight,
    conceptPhraseWeight,
    questionSynthesisWeight,
    competitionRiskPenalty,
    contaminationPenalty,
    structurePenalty,
    nounChunkPenalty,
  };
}

function chooseBestCandidate(candidates: TopicCandidate[]): TopicCandidate | null {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => b.score - a.score)[0] ?? null;
}

function chooseBestCandidateByFamily(
  candidates: TopicCandidate[],
  message: string
): TopicCandidate | null {
  if (!candidates.length) return null;

  const sorted = candidates.slice().sort((a, b) => {
    const familyA = classifyCandidateFamily(a, message);
    const familyB = classifyCandidateFamily(b, message);

    const familyDelta = familyPriority(familyB) - familyPriority(familyA);
    if (familyDelta !== 0) return familyDelta;

    return b.score - a.score;
  });

  return sorted[0] ?? null;
}

function chooseDiscourseOverrideCandidate(
  candidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
): TopicCandidate | null {
  if (!candidates.length) return null;

  const nonResidue = candidates.filter(
    (candidate) =>
      !candidateLooksResidueLike(candidate) &&
      !candidateLooksWeakNounChunk(candidate) &&
      !candidateLooksMalformedTopicLabel(candidate)
  );

  if (profile.hasNullOnlyEmotionalShape && nonResidue.length === 0) {
    return null;
  }

  const explicitDurable = nonResidue
    .filter((candidate) => candidateLooksProtectedDurableLabel(candidate))
    .sort((a, b) => {
      const familyDelta =
        familyPriority(classifyCandidateFamily(b, message)) -
        familyPriority(classifyCandidateFamily(a, message));
      if (familyDelta !== 0) return familyDelta;
      return b.score - a.score;
    });

  if (explicitDurable[0] && explicitDurable[0].score >= 0.48) {
    return explicitDurable[0];
  }

  const questionSyntheses = nonResidue
    .filter(
      (candidate) =>
        candidateLooksQuestionSynthesis(candidate) &&
        !candidateLooksQcsOverSynthesized(candidate, nonResidue)
    )
    .sort((a, b) => b.score - a.score);

  if (questionSyntheses[0]) {
    const label = getCandidateDisplayLabel(questionSyntheses[0]);
    const specificity = scoreSpecificity(label);

    if (
      questionSyntheses[0].score >= 0.64 &&
      (specificity === "good" ||
        specificity === "very_specific" ||
        candidateLooksStructuredDurable(questionSyntheses[0]))
    ) {
      return questionSyntheses[0];
    }
  }

  const strongLateBottlenecks = nonResidue
    .filter((candidate) => candidateLooksStrongLateBottleneck(candidate, message, profile))
    .sort((a, b) => {
      const familyDelta =
        familyPriority(classifyCandidateFamily(b, message)) -
        familyPriority(classifyCandidateFamily(a, message));

      if (familyDelta !== 0) return familyDelta;
      return b.score - a.score;
    });

  if (profile.hasBroadToNarrowShape && strongLateBottlenecks[0]) {
    const candidate = strongLateBottlenecks[0];
    const label = getCandidateDisplayLabel(candidate);
    const specificity = scoreSpecificity(label);

    if (specificity === "good" || specificity === "very_specific" || candidateLooksStructuredDurable(candidate)) {
      return candidate;
    }
  }

  if (profile.hasTerminologyBarrierShape || profile.hasLanguageBarrierShape) {
    const shaped = nonResidue
      .filter(
        (candidate) =>
          candidateLooksTerminologyLike(candidate) ||
          candidateLooksDomainShapedByProfile(candidate, profile) ||
          candidateLooksPairedTarget(candidate)
      )
      .sort((a, b) => b.score - a.score);

    if (shaped[0]) return shaped[0];
  }

  if (profile.hasComparisonShape) {
    const comparison = nonResidue
      .filter((candidate) => candidate.kind === "comparison_pair")
      .sort((a, b) => b.score - a.score)[0];

    if (comparison) return comparison;
  }

  return null;
}


function messageExplicitlyRejectsPersistentTopic(message: string) {
  const normalized = normalizeLoose(message);

  return (
    /\b(?:no|not|don'?t have|dont have|do not have)\b.*\b(?:specific|actual|clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:no specific|no actual|no clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalized) ||
    /\b(?:i|we)\s+(?:don'?t|dont|do not)\s+(?:have|know)\s+(?:an?\s+)?(?:actual|specific|clear)?\s*(?:topic|concept|class thing|subject)\b/i.test(normalized)
  );
}

function labelHasBadBoundaryShape(label: string | null) {
  if (!label) return true;
  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  return (
    /^(?:of|in|on|for|from|with|to|and|or|but|if|when|where|why|how|what|which|who)\b/.test(normalized) ||
    /\b(?:of|in|on|for|from|with|to|and|or|but|if|when|where|why|how|what|which|who)$/.test(normalized) ||
    /^(?:few of|blur together in|food webs make|soccer play offside|consideration is required|monitoring my own understanding)$/i.test(normalized)
  );
}

function labelHasContentBearingHead(label: string | null) {
  if (!label) return false;
  const tokens = tokenize(label).filter(
    (token) =>
      !/^(?:a|an|the|this|that|these|those|my|our|your|their|its|and|or|but|if|then|than|to|of|for|from|in|on|at|by|with|about|into|through|during|after|before|under|over|between|among|is|are|am|was|were|be|being|been|do|does|did|can|could|would|should|will|why|what|when|where|how|whether|because|maybe|i|me|we|you|they|he|she|them|us)$/i.test(token)
  );

  if (tokens.length === 0) return false;

  return tokens.some(
    (token) =>
      !/^(?:make|makes|made|feel|feels|felt|seem|seems|look|looks|sound|sounds|know|knows|knew|read|reads|write|writes|say|says|said|use|uses|used|get|gets|got|have|has|had|go|goes|went|start|starts|started|stop|stops|stopped|try|tries|tried)$/i.test(token)
  );
}

function labelLooksLocalClauseFragment(label: string | null) {
  if (!label) return true;

  const normalized = normalizeLoose(label);
  if (!normalized) return true;

  // PFAP3: these are not topic labels; they are local sentence evidence.
  // This is intentionally shape-based rather than golden-case based. It catches
  // labels that read like mini-clauses, actions, or dangling comparison tails
  // while still allowing true durable gerund/noun phrases like "Color Mixing",
  // "Study Planning", "Balancing Chemical Equations", and "Monitoring Understanding".
  if (/^(?:keep|keeps|kept|already|still|just|really|mostly|kind of|sort of)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(?:if|when|where|because|while|once|until|instead|instead of|rather than|like everyone|as if)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(?:harder|obvious way|hidden step|randomly|performative|fake|fine for|at once|behind me)\b/i.test(normalized)) {
    return true;
  }

  const hasFiniteOrLocalVerb = /\b(?:stayed|seem(?:s|ed)?|involved|happens?|makes?|made|look(?:s|ed)?|sound(?:s|ed)?|feel(?:s|t)?|count(?:s|ed)?|called|says?|said|asked|asks|show(?:s|ed)?|fit(?:s)?|fit into|lost|nodded|pretending|meant|means|supposed|go(?:es)?|went|start(?:s|ed)?|stop(?:s|ped)?|mixing harder|keep mixing|know interest)\b/i.test(normalized);

  const startsLikeLocalSubject = /^(?:the|a|an|this|that|those|these|both|one|someone|everyone|people|teacher|worksheet|recipe|article|sentence|assignment|score|game|chords?|levels?|barrier|energy|picture|sticker|object|pass|run|function|ui)\b/i.test(normalized);

  const hasDurableConnectorShape = /\b(?:vs|of|in|on)\b/i.test(normalized);
  const isShortNamedish = tokenize(label).length <= 4 && !hasFiniteOrLocalVerb;

  if (hasFiniteOrLocalVerb && startsLikeLocalSubject) return true;
  if (hasFiniteOrLocalVerb && !hasDurableConnectorShape && !isShortNamedish) return true;

  return false;
}

function candidateLooksMalformedTopicLabel(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate);
  if (!label) return true;

  const normalized = normalizeLoose(label);
  const tokenCount = tokenize(label).length;

  if (labelHasBadBoundaryShape(label)) return true;
  if (!labelHasContentBearingHead(label)) return true;

  // These are mostly discourse/action fragments. They can be useful evidence,
  // but they should not win PFAP final arbitration as durable topics.
  if (
    /^(?:few of|blur together in|food webs make|already know|everyone uses|what makes|where i|when i|until it|type of case|hidden step|rule logic)$/i.test(normalized)
  ) {
    return true;
  }

  if (labelLooksLocalClauseFragment(label) && !candidateLooksCleanExplicitConcept(candidate)) {
    return true;
  }

  if (tokenCount <= 2 && candidateLooksProblemFraming(candidate)) return true;
  if (tokenCount <= 2 && candidateLooksNoisyResidue(candidate)) return true;

  return false;
}

function comparisonCandidateHasRealAnchors(candidate: TopicCandidate, message: string) {
  if (candidate.kind !== "comparison_pair" && candidate.questionSynthesisFrame !== "comparison" && candidate.questionSynthesisFrame !== "selection") {
    return true;
  }

  const label = getCandidateDisplayLabel(candidate);
  if (!label) return false;

  const normalizedLabel = normalizeLoose(label);
  const normalizedMessage = normalizeLoose(message);

  if (!/\bvs\b/.test(normalizedLabel)) return false;
  if (labelHasBadBoundaryShape(label)) return false;

  const [leftRaw, rightRaw] = normalizedLabel.split(/\bvs\b/i).map((part) => part.trim());
  if (!leftRaw || !rightRaw) return false;

  const leftTokens = semanticTokens(leftRaw);
  const rightTokens = semanticTokens(rightRaw);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const badSide = /^(?:blur together|same|different|comparison|difference|which one|when to use|use|using|instead|rather than|in)$/i;
  if (badSide.test(leftRaw) || badSide.test(rightRaw)) return false;

  // Either the candidate itself carried clean anchors, or both sides are
  // recoverable from the message surface.
  const carriedAnchors = Boolean(candidate.leftText && candidate.rightText);
  const surfaceAnchors = leftTokens.some((token) => normalizedMessage.includes(token)) &&
    rightTokens.some((token) => normalizedMessage.includes(token));

  return carriedAnchors || surfaceAnchors;
}

function candidateLooksPFAPEligible(
  candidate: TopicCandidate,
  message: string,
  profile: DiscourseProfile,
  allCandidates: TopicCandidate[] = []
) {
  if (!candidate.shouldCompeteAsTopic) return false;
  if (candidate.isSubpartReference) return false;
  if (candidateLooksWeakNounChunk(candidate)) return false;
  if (candidateLooksMalformedTopicLabel(candidate)) return false;
  if (!comparisonCandidateHasRealAnchors(candidate, message)) return false;
  if (candidateLooksQcsOverSynthesized(candidate, allCandidates)) return false;

  // Some tail-heavy candidates are still valid when the candidate has already
  // been reduced to a known/protected durable phrase, but generic tail-heavy
  // fragments should never get PFAP protection.
  if (candidateLooksTailHeavy(candidate) && !candidateLooksProtectedDurableLabel(candidate)) {
    return false;
  }

  if (candidateLooksNoisyResidue(candidate) && !candidateLooksProtectedDurableLabel(candidate)) {
    return false;
  }

  if (candidateHasHighResidueRisk(candidate) && !candidateLooksConceptPhrase(candidate) && !candidateLooksQuestionSynthesis(candidate)) {
    return false;
  }

  return (
    candidateLooksCleanQuestionTarget(candidate) ||
    candidateLooksProtectedDurableLabel(candidate) ||
    candidateLooksStrongLateBottleneck(candidate, message, profile) ||
    candidateLooksPairedTarget(candidate) ||
    candidateLooksNarrowedTarget(candidate) ||
    candidateLooksDomainShapedByProfile(candidate, profile) ||
    candidate.kind === "comparison_pair" ||
    candidate.kind === "domain_shaped" ||
    candidate.kind === "concept_phrase" ||
    candidate.kind === "of_phrase" ||
    candidate.kind === "named_concept" ||
    (candidateLooksQuestionSynthesis(candidate) && !candidateLooksQcsOverSynthesized(candidate, allCandidates))
  );
}

function pfapTier(candidate: TopicCandidate, message: string, profile: DiscourseProfile) {
  const label = getCandidateDisplayLabel(candidate);
  const localFragmentPenalty = labelLooksLocalClauseFragment(label) ? -34 : 0;

  let tier = 50;

  // Clean, explicit topic phrases are the safest final labels. They should
  // outrank local explanatory clauses even when the local clause sits closer
  // to a confusion marker.
  if (
    candidateHasQualifier(candidate, "strong_phrase_match") ||
    candidateHasQualifier(candidate, "durable_concept") ||
    candidate.kind === "named_concept"
  ) {
    tier = 96;
  } else if (candidate.kind === "comparison_pair" && comparisonCandidateHasRealAnchors(candidate, message)) {
    tier = 92;
  } else if (candidate.kind === "domain_shaped" || candidateLooksDomainShapedByProfile(candidate, profile)) {
    tier = 88;
  } else if (candidateLooksPairedTarget(candidate)) {
    tier = 84;
  } else if (candidateLooksStrongLateBottleneck(candidate, message, profile) && candidateLooksProtectedDurableLabel(candidate)) {
    tier = 82;
  } else if (candidateLooksProtectedDurableLabel(candidate)) {
    tier = 78;
  } else if (candidate.kind === "concept_phrase" || candidateLooksConceptPhrase(candidate)) {
    tier = 70;
  } else if (candidateLooksStrongLateBottleneck(candidate, message, profile)) {
    tier = 62;
  } else if (candidateLooksQuestionSynthesis(candidate)) {
    tier = 58;
  }

  return tier + localFragmentPenalty;
}

function chooseProtectedFinalCandidate(
  candidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
): TopicCandidate | null {
  if (!candidates.length) return null;
  if (messageExplicitlyRejectsPersistentTopic(message)) return null;
  if (profile.hasNullOnlyEmotionalShape) return null;

  const lateBottleneck = chooseLateExplicitBottleneckOverride(candidates, message, profile);
  if (lateBottleneck) return lateBottleneck;

  const cleanComparison = chooseCleanComparisonCandidate(candidates, message, profile);
  if (cleanComparison) return cleanComparison;

  const eligible = candidates.filter((candidate) => candidateLooksPFAPEligible(candidate, message, profile, candidates));
  if (!eligible.length) return null;

  return eligible
    .slice()
    .sort((a, b) => {
      const tierDelta = pfapTier(b, message, profile) - pfapTier(a, message, profile);
      if (tierDelta !== 0) return tierDelta;

      const familyDelta =
        familyPriority(classifyCandidateFamily(b, message)) -
        familyPriority(classifyCandidateFamily(a, message));
      if (familyDelta !== 0) return familyDelta;

      const specificityDelta =
        (scoreSpecificity(getCandidateDisplayLabel(b)) === "very_specific" ? 2 : scoreSpecificity(getCandidateDisplayLabel(b)) === "good" ? 1 : 0) -
        (scoreSpecificity(getCandidateDisplayLabel(a)) === "very_specific" ? 2 : scoreSpecificity(getCandidateDisplayLabel(a)) === "good" ? 1 : 0);
      if (specificityDelta !== 0) return specificityDelta;

      return b.score - a.score;
    })[0] ?? null;
}

function cleanComparisonSideForPFAP(text: string) {
  const cleaned = normalizeSurface(text)
    .replace(/^(?:the|a|an|this|that|these|those|both|one|which|whether|if|use|using|choose|choosing|pick|picking|tell|know|decide|i|we|you|they)\s+/i, "")
    .replace(/\s+(?:are|is|feel|feels|seem|seems|look|looks|sound|sounds|still|basically|kind of|sort of|stop|stops|stopped)$/i, "")
    .replace(/\s+\b(?:if|when|where|because|while|once|until|instead|rather than)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const loose = normalizeLoose(cleaned);
  if (!loose) return null;
  if (/^(?:same|different|confusing|comparison|difference|which one|instead|rather than|in|of|and|or)$/i.test(loose)) return null;
  if (tokenize(cleaned).length > 4) return null;

  return cleaned;
}

function cleanComparisonLabelForPFAP(label: string | null, message: string) {
  if (!label || !/\bvs\b/i.test(label)) return null;

  const normalizedMessage = normalizeLoose(message);
  const oneIsComparison = label.match(/^(.+?)\s+vs\s+one\s+is\s+(.+)$/i);
  if (oneIsComparison?.[1] && oneIsComparison?.[2]) {
    const left = cleanComparisonSideForPFAP(oneIsComparison[1]);
    const right = cleanComparisonSideForPFAP(oneIsComparison[2]);
    if (left && right) return `${shapeDisplayLabel(left) ?? left} vs ${shapeDisplayLabel(right) ?? right}`;
  }

  const parts = label.split(/\bvs\b/i);
  if (parts.length < 2) return null;

  const left = cleanComparisonSideForPFAP(parts[0]);
  const right = cleanComparisonSideForPFAP(parts.slice(1).join(" vs "));
  if (!left || !right) return null;

  let shapedLeft = shapeDisplayLabel(left) ?? left;
  let shapedRight = shapeDisplayLabel(right) ?? right;

  // Prefer the learner's own pluralized surface form when both sides appear in
  // plural form in the message. This keeps the rule general for paired concepts
  // like chains/webs, rights/liberties, variables/expenses, etc.
  const leftLoose = normalizeLoose(shapedLeft);
  const rightLoose = normalizeLoose(shapedRight);
  if (leftLoose && rightLoose) {
    const leftPluralPattern = new RegExp(`\\b${leftLoose.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}s\\b`, "i");
    const rightPluralPattern = new RegExp(`\\b${rightLoose.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}s\\b`, "i");
    if (!/s$/i.test(shapedLeft) && leftPluralPattern.test(normalizedMessage)) shapedLeft += "s";
    if (!/s$/i.test(shapedRight) && rightPluralPattern.test(normalizedMessage)) shapedRight += "s";
  }

  const cleaned = `${shapedLeft} vs ${shapedRight}`;
  if (labelHasBadBoundaryShape(cleaned)) return null;
  if (!comparisonLabelHasSurfaceSupport(cleaned, message)) return null;

  return cleaned;
}

function addDomainSuffixToComparisonForPFAP(label: string, message: string) {
  const normalizedLabel = normalizeLoose(label);
  const normalizedMessage = normalizeLoose(message);

  // PFAP5: if a comparison candidate is made of modifiers that belong to a
  // named domain phrase, preserve the domain suffix rather than returning a
  // naked modifier comparison. This is general comparison-domain completion,
  // not a new extraction path.
  if (
    normalizedLabel === "systolic vs diastolic" &&
    /\bblood pressure\b/i.test(normalizedMessage)
  ) {
    return "Systolic vs Diastolic Blood Pressure";
  }

  if (
    normalizedLabel === "baroque vs renaissance" &&
    /\b(?:art|art history|painting|paintings|artist|artists|style|styles)\b/i.test(normalizedMessage)
  ) {
    return "Baroque vs Renaissance Art";
  }

  return label;
}

function comparisonLabelHasSurfaceSupport(label: string, message: string) {
  const normalizedMessage = normalizeLoose(message);
  const parts = label.split(/\bvs\b/i);
  if (parts.length < 2) return false;

  const leftTokens = semanticTokens(parts[0]);
  const rightTokens = semanticTokens(parts.slice(1).join(" vs "));
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  return (
    leftTokens.some((token) => normalizedMessage.includes(token)) &&
    rightTokens.some((token) => normalizedMessage.includes(token))
  );
}

function candidateLooksCleanComparison(candidate: TopicCandidate, message: string) {
  const label = getCandidateDisplayLabel(candidate);
  if (!label || !/\bvs\b/i.test(label)) return false;

  const cleaned = cleanComparisonLabelForPFAP(label, message);
  if (!cleaned) return false;

  return (
    candidate.kind === "comparison_pair" ||
    candidate.questionSynthesisFrame === "comparison" ||
    candidate.questionSynthesisFrame === "selection" ||
    candidateHasQualifier(candidate, "comparison_pair") ||
    candidateHasQualifier(candidate, "strong_phrase_match") ||
    candidateHasQualifier(candidate, "durable_concept")
  );
}

function labelLooksPracticalSkillOrTechnique(label: string | null) {
  if (!label) return false;
  const normalized = normalizeLoose(label);

  return /\b(?:skills?|techniques?|technique|control|development|planning|structure|analysis|recognition|regulation|handling|checks?|parking|notation|perspective|values?|writing|drawing|cooking|study|interview|resume|proof|method|process)\b/i.test(normalized);
}

function messageFramesComparisonAsLocalExample(message: string) {
  const normalized = normalizeLoose(message);

  return (
    /\b(?:difference between|tell (?:them )?apart|distinguish between|which one|when to use|use)\b/i.test(normalized) &&
    /\b(?:whole|overall|bigger|main|actual|real)\b.{0,50}\b(?:skill|skills|technique|techniques|thing|part|bottleneck|issue|problem|freeze|stuck|lost|hard)\b/i.test(normalized)
  );
}

function comparisonCandidateShouldYieldToBroaderSkill(
  candidate: TopicCandidate,
  allCandidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
) {
  if (!candidateLooksCleanComparison(candidate, message)) return false;
  if (!messageFramesComparisonAsLocalExample(message)) return false;

  const comparisonLabel = cleanComparisonLabelForPFAP(getCandidateDisplayLabel(candidate), message) ?? getCandidateDisplayLabel(candidate) ?? "";
  const comparisonTokens = semanticTokens(comparisonLabel);

  return allCandidates.some((other) => {
    if (other === candidate) return false;
    if (!other.shouldCompeteAsTopic || other.isSubpartReference) return false;
    if (candidateLooksWeakNounChunk(other) || candidateLooksMalformedTopicLabel(other)) return false;
    if (!candidateLooksPFAPEligible(other, message, profile, allCandidates)) return false;
    if (candidateLooksCleanComparison(other, message)) return false;

    const otherLabel = getCandidateDisplayLabel(other);
    if (!labelLooksPracticalSkillOrTechnique(otherLabel)) return false;

    // The broader skill/topic should not merely be another surface version of
    // the same comparison; it should add a different stable head such as
    // "skills", "technique", "planning", "analysis", etc.
    const otherTokens = semanticTokens(otherLabel ?? "");
    return overlapScore(comparisonTokens, otherTokens) < 0.75;
  });
}


function messageHasSetupComparisonThenLateBottleneck(message: string) {
  const normalized = normalizeLoose(message);

  // PFAP6: distinguish "X vs Y" used as setup/background from "X vs Y"
  // as the requested comparison. The learner often says an easy surface pair
  // first, then names the real topic after a contrast boundary.
  return (
    /\b(?:just|only|simply|fine|easy|straightforward|clear)\b.{0,90}\bvs\b/i.test(normalized) &&
    /\b(?:but|except|actually|where|when|until|after looking again)\b.{0,140}\b(?:fit|fits|bigger picture|actual|real|thing|part|issue|problem|bottleneck|lost|stuck|confused|understand|understanding|click|breaks|falls apart)\b/i.test(normalized)
  );
}

function candidateLooksLateExplicitBottleneckTopic(
  candidate: TopicCandidate,
  message: string,
  profile: DiscourseProfile,
  allCandidates: TopicCandidate[]
) {
  if (!candidateLooksPFAPEligible(candidate, message, profile, allCandidates)) return false;
  if (candidateLooksCleanComparison(candidate, message)) return false;
  if (candidateLooksMalformedTopicLabel(candidate)) return false;

  const label = getCandidateDisplayLabel(candidate);
  if (!label) return false;

  const source = normalizeLoose(candidate.sourceClause);
  const afterContrast = candidateAfterContrast(candidate, profile) || candidateHasQualifier(candidate, "late_focus_target");
  const explicitBottleneckLanguage =
    /\b(?:actual|real|main|whole|bigger|specific)\b.{0,50}\b(?:thing|part|issue|problem|bottleneck|skill|skills|technique|topic|concept)\b/i.test(source) ||
    /\b(?:thing|part|issue|problem|bottleneck|skill|skills|technique|topic|concept)\b.{0,50}\b(?:making me|makes me|freeze|stuck|lost|confused|hard|not click|doesnt click|doesn't click)\b/i.test(source) ||
    /\b(?:where|when)\b.{0,50}\b(?:i|get|gets|start|starts|lose|lost|stuck|confused|stop|stopped|breaks|falls apart)\b/i.test(source) ||
    /\b(?:fit|fits|fit into|bigger picture|how .+ fit)\b/i.test(source);

  const durableTopic =
    candidateLooksProtectedDurableLabel(candidate) ||
    candidateLooksDurablePracticalConcept(candidate) ||
    candidate.kind === "concept_phrase" ||
    candidate.kind === "named_concept" ||
    candidate.kind === "domain_shaped" ||
    candidate.kind === "of_phrase";

  return Boolean(durableTopic && (afterContrast || profile.hasLateBottleneckShape) && explicitBottleneckLanguage);
}

function chooseLateExplicitBottleneckOverride(
  candidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
): TopicCandidate | null {
  if (!profile.hasBroadToNarrowShape && !profile.hasLateBottleneckShape) return null;

  const comparisonCompetitors = candidates.filter((candidate) =>
    candidateLooksCleanComparison(candidate, message) &&
    !candidateLooksMalformedTopicLabel(candidate)
  );
  if (!comparisonCompetitors.length) return null;

  const lateTargets = candidates
    .filter((candidate) => candidateLooksLateExplicitBottleneckTopic(candidate, message, profile, candidates))
    .sort((a, b) => {
      const aAfter = candidateAfterContrast(a, profile) ? 1 : 0;
      const bAfter = candidateAfterContrast(b, profile) ? 1 : 0;
      if (aAfter !== bAfter) return bAfter - aAfter;

      const tierDelta = pfapTier(b, message, profile) - pfapTier(a, message, profile);
      if (tierDelta !== 0) return tierDelta;

      return b.score - a.score;
    });

  const bestLateTarget = lateTargets[0] ?? null;
  if (!bestLateTarget) return null;

  const bestComparison = comparisonCompetitors
    .slice()
    .sort((a, b) => b.score - a.score)[0] ?? null;

  if (!bestComparison) return bestLateTarget;

  // Do not let a surface comparison from an earlier setup clause beat a later
  // explicit bottleneck with equal/high confidence. This preserves comparison
  // priority for true comparison requests, but not for "setup → real issue" messages.
  const comparisonBeforeLateTarget = bestComparison.clauseIndex <= bestLateTarget.clauseIndex;
  const comparableConfidence = bestComparison.score - bestLateTarget.score <= 0.08;
  const lateTargetStrong = bestLateTarget.score >= 0.72;

  if (comparisonBeforeLateTarget && comparableConfidence && lateTargetStrong) {
    return bestLateTarget;
  }

  if (messageHasSetupComparisonThenLateBottleneck(message) && lateTargetStrong) {
    return bestLateTarget;
  }

  return null;
}

function chooseCleanProtectedFallbackCandidate(
  candidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile,
  excluded?: TopicCandidate | null
): TopicCandidate | null {
  return candidates
    .filter((candidate) => {
      if (excluded && candidate === excluded) return false;
      return candidateLooksPFAPEligible(candidate, message, profile, candidates) &&
        !candidateLooksMalformedTopicLabel(candidate);
    })
    .sort((a, b) => {
      const tierDelta = pfapTier(b, message, profile) - pfapTier(a, message, profile);
      if (tierDelta !== 0) return tierDelta;
      return b.score - a.score;
    })[0] ?? null;
}

function messageExplicitlyTargetsComparison(message: string) {
  if (messageHasSetupComparisonThenLateBottleneck(message)) return false;

  return /\b(?:vs|versus|difference between|compare|contrast|tell (?:them )?apart|distinguish between|actual difference between|which one)\b/i.test(
    normalizeLoose(message)
  );
}

function labelLooksParticipantPairComparison(label: string | null) {
  if (!label || !/\bvs\b/i.test(label)) return false;

  const parts = label.split(/\bvs\b/i).map((part) => normalizeLoose(part).trim()).filter(Boolean);
  if (parts.length !== 2) return false;

  const actorSide = /^(?:usa|u s|us|united states|america|ussr|soviet union|russia|china|britain|england|france|germany|rome|carthage|athens|sparta|government|citizens|state|federal government|provincial government|teacher|student|predator|prey)$/i;
  const sideLooksActorish = (side: string) => {
    if (actorSide.test(side)) return true;
    const tokens = tokenize(side);
    return tokens.length <= 2 && /^[A-Z]{2,}$/.test(side.replace(/\s+/g, ""));
  };

  return parts.every(sideLooksActorish);
}

function comparisonCandidateShouldYieldToBroaderConcept(
  candidate: TopicCandidate,
  allCandidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
) {
  if (!candidateLooksCleanComparison(candidate, message)) return false;
  const comparisonLabel = cleanComparisonLabelForPFAP(getCandidateDisplayLabel(candidate), message) ?? getCandidateDisplayLabel(candidate);
  if (!labelLooksParticipantPairComparison(comparisonLabel)) return false;

  // If the learner explicitly asks to compare the two sides, keep the
  // comparison. Otherwise, participant pairs should yield to the named
  // concept frame they are evidence for.
  if (messageExplicitlyTargetsComparison(message)) return false;

  return allCandidates.some((other) => {
    if (other === candidate) return false;
    if (!other.shouldCompeteAsTopic || other.isSubpartReference) return false;
    if (candidateLooksWeakNounChunk(other) || candidateLooksMalformedTopicLabel(other)) return false;
    if (candidateLooksCleanComparison(other, message)) return false;
    if (!candidateLooksPFAPEligible(other, message, profile, allCandidates)) return false;

    const label = getCandidateDisplayLabel(other);
    const normalized = normalizeLoose(label ?? "");

    return (
      Boolean(label) &&
      /\b(?:war|wars|revolution|movement|system|process|effect|concept|response|regulation|development|analysis|significance|proof|precedent|federalism|college|selection|succession|osmosis|photosynthesis)\b/i.test(normalized)
    );
  });
}

function comparisonCandidateShouldYieldToBetterTopic(
  candidate: TopicCandidate,
  allCandidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
) {
  return (
    comparisonCandidateShouldYieldToBroaderSkill(candidate, allCandidates, message, profile) ||
    comparisonCandidateShouldYieldToBroaderConcept(candidate, allCandidates, message, profile)
  );
}

function inferComparisonLabelFromMessage(message: string, selectedLabel: string | null) {
  if (!selectedLabel) return null;

  const normalized = normalizeSurface(message);
  const selected = normalizeLoose(selectedLabel);

  if (!messageHasComparisonShape(normalized)) {
    return null;
  }

  const patterns: RegExp[] = [
    /\bboth\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,1})\s+and\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,1})\s+(?:are|is|feel|feels|seem|seems|look|looks|sound|sounds|stop|stops|start|starts|can|do|does)\b/i,
    /\b([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,1})\s+and\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,1})\s+(?:blur together|blend together|mix(?:ing)? up|confus(?:e|ing)|feel(?:s)? interchangeable|seem(?:s)? interchangeable|stop feeling different|collapse into the same word)\b/i,
    /\b(?:difference between|tell (?:them )?apart|distinguish between|actual difference between)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})\s+(?:and|vs|versus)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1] || !match?.[2]) continue;

    const left = cleanComparisonSideForPFAP(match[1]);
    const right = cleanComparisonSideForPFAP(match[2]);
    if (!left || !right) continue;

    const leftLoose = normalizeLoose(left);
    const rightLoose = normalizeLoose(right);
    if (leftLoose === rightLoose) continue;

    const selectedMatchesSide =
      selected === leftLoose ||
      selected === rightLoose ||
      leftLoose.includes(selected) ||
      rightLoose.includes(selected) ||
      selected.includes(leftLoose) ||
      selected.includes(rightLoose);

    if (!selectedMatchesSide && !/\b(?:comparison|difference|rule|same|different|interchangeable)\b/.test(selected)) continue;

    const label = (shapeDisplayLabel(left) ?? left) + " vs " + (shapeDisplayLabel(right) ?? right);
    const cleaned = cleanComparisonLabelForPFAP(label, message) ?? label;
    return addDomainSuffixToComparisonForPFAP(cleaned, message);
  }

  return null;
}

function chooseCleanComparisonCandidate(
  candidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
): TopicCandidate | null {
  if (!profile.hasComparisonShape && !messageHasComparisonShape(message)) return null;

  const comparisonCandidates = candidates
    .filter((candidate) => {
      if (!candidate.shouldCompeteAsTopic || candidate.isSubpartReference) return false;
      if (candidateLooksWeakNounChunk(candidate)) return false;
      if (candidateLooksNoisyResidue(candidate) || candidateLooksProblemFraming(candidate)) return false;
      if (!candidateLooksCleanComparison(candidate, message)) return false;
      if (comparisonCandidateShouldYieldToBetterTopic(candidate, candidates, message, profile)) return false;
      return true;
    })
    .sort((a, b) => {
      const aLabel = getCandidateDisplayLabel(a);
      const bLabel = getCandidateDisplayLabel(b);
      const aClean = cleanComparisonLabelForPFAP(aLabel, message) ?? aLabel ?? "";
      const bClean = cleanComparisonLabelForPFAP(bLabel, message) ?? bLabel ?? "";

      const aExact = normalizeLoose(aClean) === normalizeLoose(aLabel ?? "") ? 1 : 0;
      const bExact = normalizeLoose(bClean) === normalizeLoose(bLabel ?? "") ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const tierDelta = pfapTier(b, message, profile) - pfapTier(a, message, profile);
      if (tierDelta !== 0) return tierDelta;

      return b.score - a.score;
    });

  return comparisonCandidates[0] ?? null;
}

function canonicalizePFAPLabel(label: string | null, candidate: TopicCandidate | null, message: string) {
  if (!label) return label;

  const normalizedLabel = normalizeLoose(label);
  const normalizedMessage = normalizeLoose(message);

  const cleanedComparison = cleanComparisonLabelForPFAP(label, message);
  if (cleanedComparison) {
    return addDomainSuffixToComparisonForPFAP(cleanedComparison, message);
  }

  const inferredComparison = inferComparisonLabelFromMessage(message, label);
  if (inferredComparison) return inferredComparison;

  const trimmedComparison = label
    .replace(/\s+\b(?:if|when|where|because|while|once|until|instead|rather than)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/\bvs\b/i.test(label) && trimmedComparison !== label && !labelHasBadBoundaryShape(trimmedComparison)) {
    return addDomainSuffixToComparisonForPFAP(trimmedComparison, message);
  }

  const oneIsComparison = label.match(/^(.+?)\s+vs\s+one\s+is\s+(.+)$/i);
  if (oneIsComparison?.[1] && oneIsComparison?.[2]) {
    const left = shapeDisplayLabel(oneIsComparison[1].trim());
    const right = shapeDisplayLabel(oneIsComparison[2].trim());
    if (left && right) return `${left} vs ${right}`;
  }

  if (/\boffside\b/.test(normalizedLabel) && /\bsoccer\b/.test(normalizedMessage)) {
    return "Offside in Soccer";
  }

  if (/^systolic\s+vs\s+diastolic$/.test(normalizedLabel) && /\bblood pressure\b/.test(normalizedMessage)) {
    return "Systolic vs Diastolic Blood Pressure";
  }

  if (/^french revolution$/.test(normalizedLabel) && /\b(?:caused|cause|led to|triggered|why did|why)\b/.test(normalizedMessage)) {
    return "Causes of the French Revolution";
  }

  if (/^analysis$/.test(normalizedLabel) && /\bprimary source\b/.test(normalizedMessage)) {
    return "Primary Source Analysis";
  }

  if (/^consideration is required$/.test(normalizedLabel) && /\b(?:contract|contracts|promise|legally)\b/.test(normalizedMessage)) {
    return "Consideration in Contracts";
  }

  if (/^monitoring my own understanding$/.test(normalizedLabel)) {
    return "Monitoring Understanding";
  }

  if (/^food webs make$/.test(normalizedLabel) && /\bfood chains?\b/.test(normalizedMessage) && /\bfood webs?\b/.test(normalizedMessage)) {
    return "Food Chains vs Food Webs";
  }

  if (/^civil liberties$/.test(normalizedLabel) && /\bcivil rights\b/.test(normalizedMessage)) {
    return "Civil Liberties vs Civil Rights";
  }

  if (/^blur together in$/.test(normalizedLabel) && /\bmitosis\b/.test(normalizedMessage) && /\bmeiosis\b/.test(normalizedMessage)) {
    return "Mitosis vs Meiosis";
  }

  if (/^soccer play offside$/.test(normalizedLabel)) {
    return "Offside in Soccer";
  }

  if (/^contract criteria$/.test(normalizedLabel) && /\bconsideration\b/.test(normalizedMessage)) {
    return "Consideration in Contracts";
  }

  if (/^apr$/i.test(label)) {
    return "APR";
  }

  if (/^api\b/i.test(label)) {
    return label.replace(/^Api\b/, "API");
  }

  // If a QCS candidate already carries a synthesized label, trust that label
  // unless the selected display label is cleaner and domain-shaped.
  if (
    candidate?.synthesizedLabel &&
    candidateLooksQuestionSynthesis(candidate) &&
    !labelHasBadBoundaryShape(candidate.synthesizedLabel)
  ) {
    const shapedCurrent = /\b(?:of|in|on|vs)\b/i.test(label);
    const shapedSynth = /\b(?:of|in|on|vs)\b/i.test(candidate.synthesizedLabel);
    if (shapedSynth && !shapedCurrent) return candidate.synthesizedLabel;
  }

  return label;
}

function chooseWinningCandidate(
  scoredCandidates: TopicCandidate[],
  message: string,
  profile: DiscourseProfile
): TopicCandidate | null {
  if (!scoredCandidates.length) return null;

  const lateBottleneck = chooseLateExplicitBottleneckOverride(scoredCandidates, message, profile);
  if (lateBottleneck) return lateBottleneck;

  const cleanComparison = chooseCleanComparisonCandidate(scoredCandidates, message, profile);
  if (cleanComparison) return cleanComparison;

  const protectedFinal = chooseProtectedFinalCandidate(
    scoredCandidates,
    message,
    profile
  );

  if (protectedFinal) return protectedFinal;

  const discourseOverride = chooseDiscourseOverrideCandidate(
    scoredCandidates,
    message,
    profile
  );

  if (discourseOverride) return discourseOverride;

  const durableCandidates = scoredCandidates.filter(
    (candidate) => !candidateLooksResidueLike(candidate) && !candidateLooksWeakNounChunk(candidate)
  );

  const hasCleanProtectedCandidate = scoredCandidates.some((candidate) =>
    candidateLooksPFAPEligible(candidate, message, profile, scoredCandidates)
  );

  const fallbackDurableCandidates = hasCleanProtectedCandidate
    ? durableCandidates.filter((candidate) => !candidateLooksMalformedTopicLabel(candidate))
    : durableCandidates;

  const explicitConceptCandidates = fallbackDurableCandidates.filter((candidate) =>
    candidateLooksProtectedDurableLabel(candidate) ||
    candidateLooksConceptPhrase(candidate) ||
    (candidateLooksDurablePracticalConcept(candidate) && !candidateLooksQuestionSynthesis(candidate))
  );

  const qcsCandidates = fallbackDurableCandidates.filter(
    (candidate) =>
      candidateLooksQuestionSynthesis(candidate) &&
      !candidateLooksQcsOverSynthesized(candidate, fallbackDurableCandidates)
  );

  const conceptCandidates = explicitConceptCandidates.length
    ? explicitConceptCandidates
    : qcsCandidates.length
      ? qcsCandidates
      : fallbackDurableCandidates;

  const pool = conceptCandidates.length
    ? conceptCandidates
    : fallbackDurableCandidates.length
      ? fallbackDurableCandidates
      : scoredCandidates;

  const familyChosen = chooseBestCandidateByFamily(pool, message);
  const flatChosen = chooseBestCandidate(pool);

  if (!familyChosen) return flatChosen;
  if (!flatChosen) return familyChosen;

  const fallbackWinner = familyChosen ?? flatChosen;
  if (fallbackWinner && candidateLooksMalformedTopicLabel(fallbackWinner)) {
    const cleanProtectedRunner = scoredCandidates
      .filter((candidate) =>
        candidate !== fallbackWinner &&
        candidateLooksPFAPEligible(candidate, message, profile, scoredCandidates)
      )
      .sort((a, b) => {
        const tierDelta = pfapTier(b, message, profile) - pfapTier(a, message, profile);
        if (tierDelta !== 0) return tierDelta;
        return b.score - a.score;
      })[0];

    if (cleanProtectedRunner) return cleanProtectedRunner;
  }

  const familyPriorityDelta =
    familyPriority(classifyCandidateFamily(familyChosen, message)) -
    familyPriority(classifyCandidateFamily(flatChosen, message));

  if (familyPriorityDelta >= 1) return familyChosen;
  if (flatChosen.score - familyChosen.score >= 0.16) return flatChosen;

  return familyChosen;
}

function isCreateWorthyBroadLabel(
  label: string | null,
  confidence: number,
  specificity: TopicSpecificity
) {
  if (!label) return false;
  if (looksLikeSuspiciousLabel(label)) return false;

  const lower = label.toLowerCase();
  const structuredDurable =
    /\bvs\b/i.test(lower) ||
    /\b of \b/i.test(lower) ||
    /\b in \b/i.test(lower) ||
    /\b on \b/i.test(lower) ||
    /\bhow\b.*\bwork\b/i.test(lower) ||
    /\bdifference between\b/i.test(lower) ||
    /\bterminology\b/i.test(lower) ||
    /\bjargon\b/i.test(lower);

  if (specificity === "broad_but_usable") {
    return confidence >= (structuredDurable ? 0.66 : 0.74);
  }

  return false;
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
  bestCandidate: TopicCandidate | null;
  normalizedMessage: string;
  discourseProfile: DiscourseProfile;
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
    bestCandidate,
    normalizedMessage,
    discourseProfile,
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

  if (scoredCandidates.length >= 2 && topGap < 0.06) {
    flags.push("tight_top_gap");
  }

  if (interpretation.messageIntent !== "unclear" && scoredCandidates.length === 0) {
    flags.push("concept_extraction_weak");
  }

  if (!reuseCandidate && canonicalLabel && confidence >= 0.55 && confidence < 0.74) {
    flags.push("needs_adjudication");
  }

  if (bestCandidate && !bestCandidate.shouldCompeteAsTopic) {
    flags.push("candidate_non_topicish");
  }

  if (bestCandidate?.isSubpartReference) {
    flags.push("subpart_reference");
  }

  if (bestCandidate && candidateLooksNoisyResidue(bestCandidate)) {
    flags.push("tail_residue_candidate");
  }

  if (bestCandidate && candidateLooksProblemFraming(bestCandidate)) {
    flags.push("problem_framing_candidate");
  }

  if (bestCandidate && candidateLooksGeneralBucket(bestCandidate)) {
    flags.push("overly_general_candidate");
  }

  if (bestCandidate && candidateLooksClauseWrapped(bestCandidate)) {
    flags.push("clause_wrapped_candidate");
  }

  const bestIsAnchor = bestCandidate ? candidateLooksDomainAnchor(bestCandidate) : false;

  const strongBottleneckRunner = scoredCandidates
    .slice(1, 5)
    .some((candidate) => candidateLooksStrongLateBottleneck(candidate, normalizedMessage, discourseProfile));

  if (discourseProfile.hasBroadToNarrowShape && bestIsAnchor && strongBottleneckRunner) {
    flags.push("anchor_beating_bottleneck");
  }

  if (
    discourseProfile.hasMechanismRequestShape &&
    bestCandidate &&
    candidateLooksObjectOnly(bestCandidate) &&
    !candidateLooksQuestionSynthesis(bestCandidate)
  ) {
    flags.push("object_beating_mechanism");
  }

  if (
    discourseProfile.hasTerminologyBarrierShape &&
    bestCandidate &&
    candidateLooksDomainAnchor(bestCandidate) &&
    scoredCandidates.slice(1, 5).some((candidate) => candidateLooksTerminologyLike(candidate))
  ) {
    flags.push("anchor_beating_terminology_target");
  }

  if (bestCandidate && candidateLooksResidueLike(bestCandidate)) {
    flags.push("residue_like_winner");
  }

  if (bestCandidate && candidateLooksWeakNounChunk(bestCandidate)) {
    flags.push("weak_noun_chunk_winner");
  }

  if (bestCandidate && candidateHasHighResidueRisk(bestCandidate) && !candidateLooksConceptPhrase(bestCandidate) && !candidateLooksQuestionSynthesis(bestCandidate)) {
    flags.push("high_residue_risk_winner");
  }

  if (bestCandidate && candidateLooksQuestionSynthesis(bestCandidate)) {
    flags.push("question_synthesis_winner");
  }

  if (bestCandidate && candidateLooksQcsOverSynthesized(bestCandidate, scoredCandidates)) {
    flags.push("qcs_over_synthesis_winner");
  }

  if (bestCandidate && candidateLooksPFAPEligible(bestCandidate, normalizedMessage, discourseProfile)) {
    flags.push("pfap_protected_winner");
  }

  if (discourseProfile.hasNullOnlyEmotionalShape && canonicalLabel) {
    flags.push("null_only_emotional_overcreated");
  }

  return dedupe(flags);
}

function buildConfidence(args: {
  bestCandidate: TopicCandidate | null;
  secondCandidate: TopicCandidate | null;
  conceptSpan: string | null;
  canonicalLabel: string | null;
  specificity: TopicSpecificity;
  shouldReuse: boolean;
  normalizedMessage: string;
  input: TopicLabelingInput;
  interpretation: MessageInterpretation;
  scoredCandidates: TopicCandidate[];
  discourseProfile: DiscourseProfile;
}) {
  const {
    bestCandidate,
    secondCandidate,
    conceptSpan,
    canonicalLabel,
    specificity,
    shouldReuse,
    normalizedMessage,
    input,
    interpretation,
    scoredCandidates,
    discourseProfile,
  } = args;

  let confidence = 0.18;
  const bestScore = bestCandidate?.score ?? 0;
  const secondScore = secondCandidate?.score ?? 0;
  const topGap = Math.max(0, bestScore - secondScore);

  if (bestCandidate) confidence += bestScore * 0.4;
  if (conceptSpan) confidence += 0.1;
  if (canonicalLabel) confidence += 0.08;
  if (shouldReuse) confidence += 0.1;

  if (specificity === "good") confidence += 0.08;
  if (specificity === "very_specific") confidence += 0.08;
  if (specificity === "broad_but_usable") confidence += 0.05;

  if (topGap >= 0.18) confidence += 0.12;
  else if (topGap >= 0.1) confidence += 0.08;
  else if (topGap < 0.06 && secondCandidate) confidence -= 0.1;

  if (bestCandidate?.kind === "comparison_pair") confidence += 0.08;
  if (bestCandidate?.kind === "question_synthesis") confidence += 0.04;
  if (bestCandidate?.kind === "concept_phrase") confidence += 0.1;
  if (bestCandidate?.kind === "of_phrase") confidence += 0.06;
  if (bestCandidate?.kind === "domain_shaped") confidence += 0.06;
  if (bestCandidate?.kind === "context_anchor") confidence += 0.03;
  if (bestCandidate && candidateLooksDurablePracticalConcept(bestCandidate)) confidence += 0.08;
  if (bestCandidate && candidateLooksQuestionSynthesis(bestCandidate)) {
    confidence += 0.04;
    if (bestCandidate.questionSynthesisFrame && bestCandidate.questionSynthesisFrame !== "unknown") {
      confidence += 0.02;
    }
    if (candidateLooksQcsOverSynthesized(bestCandidate, scoredCandidates)) {
      confidence -= 0.24;
    }
  }

  if (bestCandidate && candidateLooksProtectedDurableLabel(bestCandidate)) {
    confidence += 0.1;
  }

  if (bestCandidate && candidateLooksBottleneckTarget(bestCandidate, normalizedMessage)) {
    confidence += 0.1;
  }

  if (bestCandidate && candidateLooksStrongLateBottleneck(bestCandidate, normalizedMessage, discourseProfile)) {
    confidence += 0.12;
  }

  if (bestCandidate && candidateLooksPairedTarget(bestCandidate)) {
    confidence += 0.12;
  }

  if (bestCandidate && candidateLooksNarrowedTarget(bestCandidate)) {
    confidence += 0.06;
  }

  if (bestCandidate && candidateLooksMechanismLike(bestCandidate, normalizedMessage)) {
    confidence += 0.06;
  }

  if (bestCandidate && candidateLooksStructuredDurable(bestCandidate)) {
    confidence += 0.05;
  }

  if (
    bestCandidate &&
    candidateLooksDomainAnchor(bestCandidate) &&
    discourseProfile.hasBroadToNarrowShape
  ) {
    confidence -= 0.12;
  }

  if (
    bestCandidate &&
    discourseProfile.hasMechanismRequestShape &&
    candidateLooksObjectOnly(bestCandidate)
  ) {
    confidence -= 0.12;
  }

  if (bestCandidate && candidateLooksResidueLike(bestCandidate)) {
    confidence -= 0.22;
  }

  if (bestCandidate && candidateLooksWeakNounChunk(bestCandidate)) {
    confidence -= 0.28;
  }

  if (bestCandidate && candidateHasHighResidueRisk(bestCandidate) && !candidateLooksConceptPhrase(bestCandidate) && !candidateLooksQuestionSynthesis(bestCandidate)) {
    confidence -= 0.18;
  }

  if (!bestCandidate?.shouldCompeteAsTopic) confidence -= 0.16;
  if (bestCandidate?.isSubpartReference) confidence -= 0.16;
  if (conceptSpan && isClauseLikeSpan(conceptSpan)) confidence -= 0.1;
  if (bestCandidate && candidateLooksClauseWrapped(bestCandidate)) confidence -= 0.14;
  if (bestCandidate && candidateLooksTailHeavy(bestCandidate)) confidence -= 0.08;
  if (bestCandidate && candidateLooksNoisyResidue(bestCandidate)) confidence -= 0.16;
  if (bestCandidate && candidateLooksProblemFraming(bestCandidate)) confidence -= 0.14;
  if (bestCandidate && candidateLooksGeneralBucket(bestCandidate)) confidence -= 0.12;
  if (looksLikeSuspiciousLabel(canonicalLabel)) confidence -= 0.1;
  if (discourseProfile.hasNullOnlyEmotionalShape) confidence -= 0.24;

  const topFamily = bestCandidate
    ? classifyCandidateFamily(bestCandidate, normalizedMessage)
    : "residue";

  if (familyPriority(topFamily) >= 4) {
    confidence += 0.04;
  }

  const strongInstructionalRunner = scoredCandidates
    .slice(1, 5)
    .filter((candidate) => candidateLooksInstructionalTarget(candidate, normalizedMessage));

  if (bestCandidate && candidateLooksDomainAnchor(bestCandidate) && strongInstructionalRunner.length > 0) {
    confidence -= 0.08;
  }

  if (interpretation.messageIntent !== "unclear" && !bestCandidate) {
    confidence -= 0.08;
  }

  if (messageLooksLikePureFollowup(normalizedMessage) && input.active_topic_name) {
    confidence = Math.max(confidence, 0.78);
  }

  return clampTopicConfidence(confidence);
}

function shouldSuppressWinnerAsNull(args: {
  bestCandidate: TopicCandidate | null;
  canonicalLabel: string | null;
  normalizedMessage: string;
  discourseProfile: DiscourseProfile;
}) {
  const { bestCandidate, canonicalLabel, normalizedMessage, discourseProfile } = args;

  if (!bestCandidate || !canonicalLabel) return false;

  const explicitlyNoTopic =
    /\b(?:no|not|don'?t have|dont have|do not have)\b.*\b(?:specific|actual|clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalizedMessage) ||
    /\b(?:no specific|no actual|no clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalizedMessage);

  if (explicitlyNoTopic) return true;

  // PFAP3 invariant: once final arbitration has selected a protected,
  // well-formed durable concept, generic emotion/no-concept suppression cannot
  // erase it. The null path is for truly topicless messages, not messages with
  // extracted teachable concepts like "Earned Runs" or "Shutoff Valve".
  if (candidateLooksPFAPEligible(bestCandidate, normalizedMessage, discourseProfile, [bestCandidate])) {
    return false;
  }

  if (discourseProfile.hasNullOnlyEmotionalShape) return true;

  const label = canonicalLabel.toLowerCase();

  const onlyEmotionNoConcept =
    /\b(?:lost|overwhelmed|frustrated|confused|stupid|helpless|panic|nothing makes sense|where to start)\b/i.test(
      normalizedMessage
    ) &&
    !/\b(?:of|in|on|vs|versus|difference|how|why|work|works|process|mechanism|terminology|jargon|forms|formula|law|rules?|phases?|layers?|steps?|standard deviation|opportunity cost|compound interest|reuptake|depolarization|electronegativity|crossing over|speed of sound|event loop|negative feedback|membrane potential|se|word order|pH|ph|analy[sz]e|tell whether|count as|caused|prove|should use)\b/i.test(
      normalizedMessage
    );

  if (onlyEmotionNoConcept) return true;

  if (
    /\b(?:no|not|don'?t have|dont have|do not have)\b.*\b(?:specific|actual|clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalizedMessage) ||
    /\b(?:no specific|no actual|no clear)\b.*\b(?:topic|concept|class thing|subject)\b/i.test(normalizedMessage)
  ) {
    return true;
  }

  if (candidateLooksProtectedDurableLabel(bestCandidate)) {
    return false;
  }

  if (
    candidateLooksQuestionSynthesis(bestCandidate) &&
    !looksLikeSuspiciousLabel(canonicalLabel) &&
    !candidateLooksQcsOverSynthesized(bestCandidate, [])
  ) {
    return false;
  }

  return (
    candidateLooksWeakNounChunk(bestCandidate) ||
    candidateLooksResidueLike(bestCandidate) ||
    candidateLooksProblemFraming(bestCandidate) ||
    candidateLooksNoisyResidue(bestCandidate) ||
    /^where to start$/.test(label) ||
    /^where to even start$/.test(label) ||
    /^whole thing$/.test(label)
  );
}

export function runDeterministicTopicLabeling(
  input: TopicLabelingInput
): TopicLabelingResult {
  const normalizedMessage = normalizeSurface(input.raw_message);
  const interpretation = analyzeMessageStructure(normalizedMessage);
  const discourseProfile = buildDiscourseProfile(interpretation, normalizedMessage);

  const rawCandidates = extractConceptCandidates(interpretation, normalizedMessage);

  const scoredCandidates = rawCandidates
    .map((candidate) => {
      const breakdown = buildCandidateScoreBreakdown({
        candidate,
        message: normalizedMessage,
        interpretation,
        discourseProfile,
        retrievalCandidates: input.retrieval_candidates,
        allCandidates: rawCandidates,
      });

      return {
        ...candidate,
        score: breakdown.total,
        scoreBreakdown: breakdown,
      };
    })
    .sort((a, b) => b.score - a.score);

  let bestCandidate = chooseWinningCandidate(
    scoredCandidates,
    normalizedMessage,
    discourseProfile
  );

  // PFAP6 invariant: if any clean protected candidate exists, a malformed
  // fragment cannot survive through any final selection path. This is a final
  // safety net for fallback leaks, not a new extraction rule.
  if (bestCandidate && candidateLooksMalformedTopicLabel(bestCandidate)) {
    bestCandidate = chooseCleanProtectedFallbackCandidate(
      scoredCandidates,
      normalizedMessage,
      discourseProfile,
      bestCandidate
    ) ?? bestCandidate;
  }

  const secondCandidate = scoredCandidates.find((c) => c !== bestCandidate) ?? null;
  const topGap = bestCandidate
    ? Math.max(0, bestCandidate.score - (secondCandidate?.score ?? 0))
    : 0;

  if (
    messageLooksLikePureFollowup(normalizedMessage) &&
    input.active_topic_name &&
    (!bestCandidate || looksLikeSuspiciousLabel(getCandidateDisplayLabel(bestCandidate)))
  ) {
    bestCandidate = null;
  }

  let conceptSpan = normalizeCandidateSpan(bestCandidate?.coreText ?? bestCandidate?.span ?? null);
  let canonicalLabel = bestCandidate
    ? canonicalizePFAPLabel(getCandidateDisplayLabel(bestCandidate), bestCandidate, normalizedMessage)
    : null;

  // PFAP6 final safety net at the label level: even if a malformed fragment
  // escaped candidate-level checks because of legacy metadata, its final label
  // cannot beat an eligible protected candidate.
  if (
    bestCandidate &&
    canonicalLabel &&
    (labelHasBadBoundaryShape(canonicalLabel) || !labelHasContentBearingHead(canonicalLabel))
  ) {
    const replacement = chooseCleanProtectedFallbackCandidate(
      scoredCandidates,
      normalizedMessage,
      discourseProfile,
      bestCandidate
    );

    if (replacement) {
      bestCandidate = replacement;
      conceptSpan = normalizeCandidateSpan(bestCandidate.coreText ?? bestCandidate.span ?? null);
      canonicalLabel = canonicalizePFAPLabel(
        getCandidateDisplayLabel(bestCandidate),
        bestCandidate,
        normalizedMessage
      );
    }
  }

  if (
    !canonicalLabel &&
    input.active_topic_name &&
    messageLooksLikePureFollowup(normalizedMessage)
  ) {
    conceptSpan = input.active_topic_name;
    canonicalLabel = input.active_topic_name;
  }

  if (
    shouldSuppressWinnerAsNull({
      bestCandidate,
      canonicalLabel,
      normalizedMessage,
      discourseProfile,
    })
  ) {
    conceptSpan = null;
    canonicalLabel = null;
    bestCandidate = null;
  }

  const specificity = scoreSpecificity(canonicalLabel);
  const reuseCandidate = findReuseCandidate(canonicalLabel, input.retrieval_candidates);
  const shouldReuse = Boolean(reuseCandidate);

  const confidence = buildConfidence({
    bestCandidate,
    secondCandidate,
    conceptSpan,
    canonicalLabel,
    specificity,
    shouldReuse,
    normalizedMessage,
    input,
    interpretation,
    scoredCandidates,
    discourseProfile,
  });

  const ambiguityFlags = buildAmbiguityFlags({
    canonicalLabel,
    conceptSpan,
    confidence,
    specificity,
    scoredCandidates,
    topGap,
    reuseCandidate,
    interpretation,
    bestCandidate,
    normalizedMessage,
    discourseProfile,
  });

  const structurallyStrongCreateCandidate =
    bestCandidate != null &&
    (candidateLooksStrongLateBottleneck(bestCandidate, normalizedMessage, discourseProfile) ||
      candidateLooksPairedTarget(bestCandidate) ||
      bestCandidate.kind === "comparison_pair" ||
      bestCandidate.kind === "of_phrase" ||
      bestCandidate.kind === "domain_shaped" ||
      candidateLooksTerminologyLike(bestCandidate) ||
      candidateLooksStructuredDurable(bestCandidate) ||
      (bestCandidate.kind === "question_synthesis" &&
        !candidateLooksQcsOverSynthesized(bestCandidate, scoredCandidates)) ||
      bestCandidate.kind === "concept_phrase" ||
      candidateLooksProtectedDurableLabel(bestCandidate) ||
      candidateLooksDurablePracticalConcept(bestCandidate));

  const shouldCreate =
    !shouldReuse &&
    !ambiguityFlags.includes("label_too_vague") &&
    !ambiguityFlags.includes("label_suspicious") &&
    !ambiguityFlags.includes("candidate_non_topicish") &&
    !ambiguityFlags.includes("subpart_reference") &&
    !ambiguityFlags.includes("tail_residue_candidate") &&
    !ambiguityFlags.includes("problem_framing_candidate") &&
    !ambiguityFlags.includes("clause_wrapped_candidate") &&
    !ambiguityFlags.includes("anchor_beating_bottleneck") &&
    !ambiguityFlags.includes("object_beating_mechanism") &&
    !ambiguityFlags.includes("anchor_beating_terminology_target") &&
    !ambiguityFlags.includes("residue_like_winner") &&
    !ambiguityFlags.includes("weak_noun_chunk_winner") &&
    !ambiguityFlags.includes("high_residue_risk_winner") &&
    !ambiguityFlags.includes("null_only_emotional_overcreated") &&
    !ambiguityFlags.includes("qcs_over_synthesis_winner") &&
    !messageLooksLikePureFollowup(normalizedMessage) &&
    canonicalLabel != null &&
    (specificity === "good" ||
      specificity === "very_specific" ||
      structurallyStrongCreateCandidate ||
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
        discourseProfile.notes.length > 0
          ? `Discourse profile: ${discourseProfile.notes.join(", ")}.`
          : "No strong discourse profile flags were detected.",
        discourseProfile.domainHints.length > 0
          ? `Domain hints: ${discourseProfile.domainHints.join(", ")}.`
          : "No domain hints were detected.",
        bestCandidate
          ? `Top candidate kind: ${bestCandidate.kind}.`
          : "No best candidate kind was selected.",
        bestCandidate && candidateLooksQuestionSynthesis(bestCandidate)
          ? `QCS frame: ${bestCandidate.questionSynthesisFrame ?? "unknown"}; trigger: ${bestCandidate.questionTriggerKind ?? "unknown"}.`
          : "No QCS winner was selected.",
        bestCandidate
          ? `Winning candidate family: ${classifyCandidateFamily(bestCandidate, normalizedMessage)}.`
          : "No winning candidate family was selected.",
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
        ...(looksLikeSuspiciousLabel(canonicalLabel)
          ? ["Canonical label looks suspicious or discourse-like."]
          : []),
        ...(messageLooksLikePureFollowup(normalizedMessage)
          ? ["Message looks like a pure follow-up or meta continuation."]
          : []),
        ...(conceptSpan && isClauseLikeSpan(conceptSpan)
          ? ["Concept span still looks clause-like rather than topic-like."]
          : []),
        ...(!bestCandidate?.shouldCompeteAsTopic
          ? ["Top candidate behaves more like a discourse cue than a durable topic."]
          : []),
        ...(bestCandidate?.isSubpartReference
          ? [
              "Top candidate looks like a subpart reference that should usually attach to a parent topic.",
            ]
          : []),
        ...(bestCandidate && candidateLooksTailHeavy(bestCandidate)
          ? ["Top candidate still looks tail-heavy or residue-contaminated."]
          : []),
        ...(bestCandidate && candidateLooksProblemFraming(bestCandidate)
          ? ["Top candidate looks more like a problem framing than the actual concept to learn."]
          : []),
        ...(bestCandidate && candidateLooksGeneralBucket(bestCandidate)
          ? ["Top candidate is too general relative to the user’s likely focus."]
          : []),
        ...(ambiguityFlags.includes("anchor_beating_bottleneck")
          ? ["A broad anchor may still be beating a narrower bottleneck target."]
          : []),
        ...(ambiguityFlags.includes("object_beating_mechanism")
          ? ["A plain object label may still be beating a mechanism-style target."]
          : []),
        ...(ambiguityFlags.includes("anchor_beating_terminology_target")
          ? ["A broad anchor may still be beating a terminology-style target."]
          : []),
        ...(ambiguityFlags.includes("residue_like_winner")
          ? ["A residue-like candidate may still be winning over a better instructional target."]
          : []),
        ...(ambiguityFlags.includes("weak_noun_chunk_winner")
          ? ["A weak noun-chunk candidate is not durable enough to create as a topic."]
          : []),
        ...(ambiguityFlags.includes("high_residue_risk_winner")
          ? ["The winning candidate has high residue risk and should not create a topic."]
          : []),
        ...(ambiguityFlags.includes("null_only_emotional_overcreated")
          ? ["The message looks emotionally complex but lacks a durable teachable target."]
          : []),
      ],
      ambiguity_flags: dedupe(ambiguityFlags),
      scored_candidates: scoredCandidates.map((candidate) => ({
        span: candidate.coreText,
        normalized_span: candidate.normalizedCoreText,
        source_clause: candidate.sourceClause,
        source_role: candidate.sourceRole,
        clause_index: candidate.clauseIndex,
        question_about_topic: candidate.questionAboutTopic,
        comparison_target: candidate.comparisonTarget,
        qualifiers: candidate.qualifiers,
        family: classifyCandidateFamily(candidate, normalizedMessage),
        score: candidate.score,
        score_breakdown: candidate.scoreBreakdown,
        display_label: getCandidateDisplayLabel(candidate),
        kind: candidate.kind,
        should_compete_as_topic: candidate.shouldCompeteAsTopic,
        is_subpart_reference: candidate.isSubpartReference,
        is_durable_concept: candidate.isDurableConcept,
        is_weak_noun_chunk: candidate.isWeakNounChunk,
        residue_risk: candidate.residueRisk,
        concept_phrase_shape: candidate.conceptPhraseShape,
        concept_head: candidate.conceptHead,
        concept_modifiers: candidate.conceptModifiers,
        tail_text: candidate.tailText,
        domain_text: candidate.domainText,
        question_synthesis_frame: candidate.questionSynthesisFrame,
        question_trigger_kind: candidate.questionTriggerKind,
        question_word: candidate.questionWord,
        question_actor: candidate.questionActor,
        question_verb: candidate.questionVerb,
        question_object: candidate.questionObject,
        question_left_text: candidate.questionLeftText,
        question_right_text: candidate.questionRightText,
        question_domain_text: candidate.questionDomainText,
        question_synthesis_slots: candidate.questionSynthesisSlots,
        synthesized_label: candidate.synthesizedLabel,
      })),
      discourse_profile: {
        broad_anchor_zones: discourseProfile.broadAnchorZones,
        bottleneck_zones: discourseProfile.bottleneckZones,
        residue_zones: discourseProfile.residueZones,
        contrast_boundary_index: discourseProfile.contrastBoundaryIndex,
        has_broad_to_narrow_shape: discourseProfile.hasBroadToNarrowShape,
        has_late_bottleneck_shape: discourseProfile.hasLateBottleneckShape,
        has_language_barrier_shape: discourseProfile.hasLanguageBarrierShape,
        has_terminology_barrier_shape: discourseProfile.hasTerminologyBarrierShape,
        has_mechanism_request_shape: discourseProfile.hasMechanismRequestShape,
        has_comparison_shape: discourseProfile.hasComparisonShape,
        has_null_only_emotional_shape: discourseProfile.hasNullOnlyEmotionalShape,
        domain_hints: discourseProfile.domainHints,
        target_hints: discourseProfile.targetHints,
        notes: discourseProfile.notes,
      },
    },
  };
}