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
  normalizeSurface,
  scoreSpecificity,
  semanticTokens,
  shapeDisplayLabel,
  tokenize,
  looksLikeSuspiciousLabel,
  analyzeMessageStructure,
} from "./topic-label-normalization";

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

    const score = exact * 1.0 + tokenScore * 0.7 + retrievalScore * 0.6;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore >= 0.82) return best;
  return null;
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
  if (looksLikeSuspiciousLabel(label)) return false;
  return confidence >= 0.74;
}

function getCandidateDisplayLabel(candidate: TopicCandidate) {
  return shapeDisplayLabel(candidate.coreText) ?? shapeDisplayLabel(candidate.span);
}

function candidateLooksClauseWrapped(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate);
  if (!label) return false;
  return /^(?:is|are|it'?s|it is|but|actually|after looking again|i think)\b/i.test(label);
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
    /\bmess(?:es)? me up\b/i.test(combined)
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
    /\btbh\b/.test(core) ||
    /\blol\b/.test(core) ||
    /\byet\b/.test(core) ||
    /\blose track\b/.test(core) ||
    /\bwhole thing confusing\b/.test(core) ||
    /\bmess(?:es)? me up\b/.test(core) ||
    /\btbh\b/.test(tail) ||
    /\blol\b/.test(tail)
  );
}

function candidateLooksAbstractButUseful(candidate: TopicCandidate, message: string) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    /\bhow\b/.test(label) &&
    /\bwork\b/.test(label) &&
    /\b(i want to learn about|would really like to learn about|help me understand|can you explain)\b/i.test(
      message
    )
  );
}

function candidateLooksProblemFraming(candidate: TopicCandidate) {
  const label = getCandidateDisplayLabel(candidate)?.toLowerCase() ?? "";
  if (!label) return false;

  return (
    /\bdeterministic code can'?t solve all\b/i.test(label) ||
    /\bsolve all my problems\b/i.test(label) ||
    /\bwhole thing confusing\b/i.test(label) ||
    /\blose track\b/i.test(label)
  );
}

function buildCandidateScoreBreakdown(args: {
  candidate: TopicCandidate;
  message: string;
  interpretation: MessageInterpretation;
  retrievalCandidates: RetrievalCandidate[];
}) {
  const { candidate, message, interpretation, retrievalCandidates } = args;
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
  let tailPenalty = 0;
  let abstractFocusWeight = 0;
  let problemFramingPenalty = 0;

  if (candidate.sourceRole === "confusion") roleWeight += 0.28;
  if (candidate.sourceRole === "question") roleWeight += 0.2;
  if (candidate.sourceRole === "request") roleWeight += 0.18;
  if (candidate.sourceRole === "comparison") roleWeight += 0.34;
  if (candidate.sourceRole === "context") roleWeight -= 0.04;

  if (candidate.qualifiers.includes("focus_target")) focusWeight += 0.22;
  if (candidate.qualifiers.includes("comparison_pair")) focusWeight += 0.16;
  if (candidate.qualifiers.includes("of_phrase")) focusWeight += 0.14;
  if (candidate.qualifiers.includes("named_concept")) focusWeight += 0.12;
  if (candidate.qualifiers.includes("explicit_switch")) focusWeight += 0.14;
  if (candidate.qualifiers.includes("cross_clause_recovery")) focusWeight += 0.14;
  if (candidate.qualifiers.includes("late_focus_target")) focusWeight += 0.18;
  if (candidate.qualifiers.includes("context_recovery")) focusWeight += 0.08;

  if (clause?.hasFocusMarker) focusWeight += 0.06;

  if (candidate.kind === "comparison_pair") focusWeight += 0.24;
  if (candidate.kind === "of_phrase") focusWeight += 0.14;
  if (candidate.kind === "domain_shaped") {
    focusWeight += 0.14;
    contextRecoveryWeight += 0.12;
  }
  if (candidate.kind === "context_anchor") contextRecoveryWeight += 0.18;
  if (candidate.kind === "followup_reference") focusWeight += 0.04;
  if (candidate.kind === "named_concept") focusWeight += 0.05;

  if (candidate.leftText && candidate.rightText) {
    focusWeight += 0.08;
  }

  if (candidate.domainText) {
    contextRecoveryWeight += 0.08;
  }

  if (candidate.tailText) {
    const tailTokens = tokenize(candidate.tailText).length;
    if (tailTokens >= 2) {
      clausePenalty += 0.06;
    }
  }

  if (!candidate.shouldCompeteAsTopic) {
    genericPenalty += 0.22;
  }

  if (candidate.isSubpartReference) {
    learnerStatePenalty += 0.18;
    genericPenalty += 0.1;
  }

  if (clause?.hasContrastBoundary) contrastWeight += 0.08;
  if (clause?.hasConfusionMarker) confusionAdjacencyWeight += 0.1;
  if (clause?.hasRequestMarker) requestAdjacencyWeight += 0.06;

  if (clause?.hasContextMarker && candidate.qualifiers.includes("context_recovery")) {
    contextRecoveryWeight += 0.22;
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

  if (appearsInBroadList(candidate.sourceClause, candidate.coreText)) {
    genericPenalty += 0.12;
  }

  if (
    candidate.coreText === "that" ||
    candidate.coreText === "it" ||
    candidate.coreText === "again"
  ) {
    learnerStatePenalty += 0.6;
  }

  if (isClauseLikeSpan(candidate.coreText)) {
    clausePenalty += 0.22;
  }

  if (looksLikeSuspiciousLabel(label)) {
    genericPenalty += 0.18;
  }

  const hasExplicitComparison =
    /\bvs\b|\bversus\b|\bdifference between\b|\bcompare\b|\bcontrast\b/i.test(message);
  const hasDomainShaping =
    /\bwork\s+in\b/i.test(message) ||
    /\bwork\s+on\b/i.test(message) ||
    /\bin insurance\b/i.test(message) ||
    /\bin a loan\b/i.test(message) ||
    /\bstudent loans?\b/i.test(message) ||
    /\bhockey\b/i.test(message);
  const hasWrapperComparison =
    /\b(?:keep forgetting|when to use|mess(?:es)? me up|mixing up)\b/i.test(message);
  const hasExplicitLearningRequest =
    /\b(?:i want to learn about|would really like to learn about|help me understand|can you explain|explain)\b/i.test(
      message
    );
  const looksClauseWrapped = candidateLooksClauseWrapped(candidate);

  if (hasExplicitComparison && candidate.kind !== "comparison_pair") {
    genericPenalty += 0.2;
  }

  if (hasExplicitComparison && candidate.kind === "comparison_pair") {
    focusWeight += 0.18;
  }

  if (
    hasDomainShaping &&
    !candidate.domainText &&
    tokenCount === 1 &&
    !candidate.qualifiers.includes("context_recovery")
  ) {
    genericPenalty += 0.14;
  }

  if (hasDomainShaping && candidate.domainText) {
    contextRecoveryWeight += 0.12;
    focusWeight += 0.06;
  }

  if (hasWrapperComparison && candidate.kind === "comparison_pair") {
    focusWeight += 0.12;
  }

  if (
    /\bbut\b/i.test(message) &&
    hasExplicitComparison &&
    candidate.kind !== "comparison_pair" &&
    candidate.clauseIndex < interpretation.clauses.length - 1
  ) {
    genericPenalty += 0.12;
  }

  if (looksClauseWrapped) {
    genericPenalty += 0.22;
    clausePenalty += 0.12;
  }

  if (candidateLooksTailHeavy(candidate)) {
    tailPenalty += 0.18;
  }

  if (candidateLooksNoisyResidue(candidate)) {
    tailPenalty += 0.28;
    genericPenalty += 0.12;
  }

  if (candidateLooksAbstractButUseful(candidate, message)) {
    abstractFocusWeight += 0.18;
  }

  if (hasExplicitLearningRequest && candidateLooksAbstractButUseful(candidate, message)) {
    abstractFocusWeight += 0.1;
  }

  if (candidateLooksProblemFraming(candidate)) {
    problemFramingPenalty += 0.22;
  }

  if (
    hasExplicitLearningRequest &&
    candidateLooksProblemFraming(candidate) &&
    !candidate.qualifiers.includes("focus_target")
  ) {
    problemFramingPenalty += 0.08;
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
    reuseHintWeight +
    abstractFocusWeight -
    genericPenalty -
    clausePenalty -
    learnerStatePenalty -
    lengthPenalty -
    tailPenalty -
    problemFramingPenalty;

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
    tailPenalty,
    abstractFocusWeight,
    problemFramingPenalty,
    total,
  };
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
      const breakdown = buildCandidateScoreBreakdown({
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
    (!bestCandidate || looksLikeSuspiciousLabel(getCandidateDisplayLabel(bestCandidate)))
  ) {
    bestCandidate = null;
  }

  let conceptSpan = normalizeCandidateSpan(bestCandidate?.coreText ?? bestCandidate?.span ?? null);
  let canonicalLabel = bestCandidate ? getCandidateDisplayLabel(bestCandidate) : null;

  if (
    !canonicalLabel &&
    input.active_topic_name &&
    messageLooksLikePureFollowup(normalizedMessage)
  ) {
    conceptSpan = input.active_topic_name;
    canonicalLabel = input.active_topic_name;
  }

  const specificity = scoreSpecificity(canonicalLabel);
  const reuseCandidate = findReuseCandidate(canonicalLabel, input.retrieval_candidates);
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

  if (bestCandidate?.kind === "comparison_pair") {
    confidence += 0.12;
  }

  if (bestCandidate?.kind === "of_phrase") {
    confidence += 0.08;
  }

  if (bestCandidate?.kind === "domain_shaped") {
    confidence += 0.1;
  }

  if (bestCandidate?.kind === "context_anchor") {
    confidence += 0.06;
  }

  if (bestCandidate?.qualifiers.includes("focus_target")) {
    confidence += 0.05;
  }

  if (bestCandidate?.qualifiers.includes("late_focus_target")) {
    confidence += 0.05;
  }

  if (bestCandidate?.qualifiers.includes("context_recovery")) {
    confidence += 0.04;
  }

  if (bestCandidate && candidateLooksAbstractButUseful(bestCandidate, normalizedMessage)) {
    confidence += 0.05;
  }

  if (!bestCandidate?.shouldCompeteAsTopic) {
    confidence -= 0.16;
  }

  if (bestCandidate?.isSubpartReference) {
    confidence -= 0.16;
  }

  if (conceptSpan && isClauseLikeSpan(conceptSpan)) {
    confidence -= 0.1;
  }

  if (bestCandidate && candidateLooksClauseWrapped(bestCandidate)) {
    confidence -= 0.16;
  }

  if (bestCandidate && candidateLooksTailHeavy(bestCandidate)) {
    confidence -= 0.1;
  }

  if (bestCandidate && candidateLooksNoisyResidue(bestCandidate)) {
    confidence -= 0.16;
  }

  if (bestCandidate && candidateLooksProblemFraming(bestCandidate)) {
    confidence -= 0.12;
  }

  if (looksLikeSuspiciousLabel(canonicalLabel)) {
    confidence -= 0.1;
  }

  if (scoredCandidates.length >= 2 && topGap < 0.1) {
    confidence -= 0.06;
  }

  if (interpretation.messageIntent !== "unclear" && scoredCandidates.length === 0) {
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
    bestCandidate,
  });

  const shouldCreate =
    !shouldReuse &&
    !ambiguityFlags.includes("label_too_vague") &&
    !ambiguityFlags.includes("label_suspicious") &&
    !ambiguityFlags.includes("candidate_non_topicish") &&
    !ambiguityFlags.includes("subpart_reference") &&
    !ambiguityFlags.includes("tail_residue_candidate") &&
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
        bestCandidate
          ? `Top candidate kind: ${bestCandidate.kind}.`
          : "No best candidate kind was selected.",
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
          ? ["Top candidate looks like a subpart reference that should usually attach to a parent topic."]
          : []),
        ...(bestCandidate && candidateLooksTailHeavy(bestCandidate)
          ? ["Top candidate still looks tail-heavy or residue-contaminated."]
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
        score: candidate.score,
        score_breakdown: candidate.scoreBreakdown,
        display_label: getCandidateDisplayLabel(candidate),
      })),
    },
  };
}