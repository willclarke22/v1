import type { LearningSpaceRelationship } from "@/types/learning-space";
import {
  buildRelationshipDisplayPolicy,
  clamp01,
  DEFAULT_RELATIONSHIP_GRAPH_OPTIONS,
  derivedRelationshipEvidenceSource,
  makeRelationshipId,
  makeRelationshipKey,
  normalizeTopicLabel,
  round4,
} from "./relationship-policy";
import type {
  RelationshipDiagnosisEvidence,
  RelationshipEvidenceTier,
  RelationshipGraphBuildOptions,
  RelationshipGraphBuildResult,
  RelationshipGraphCandidate,
  RelationshipGraphTopic,
} from "./relationship-types";
import type { DiagnosisType } from "@/types/contracts";

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function messageCount(topic: RelationshipGraphTopic) {
  return Math.max(0, Math.floor(safeNumber(topic.messageCount) ?? 0));
}

function pairEvidenceCount(
  topicA: RelationshipGraphTopic,
  topicB: RelationshipGraphTopic,
) {
  const aCount = messageCount(topicA);
  const bCount = messageCount(topicB);

  return Math.max(1, Math.min(aCount || 1, bCount || 1));
}

function canonicalPair(
  topicA: RelationshipGraphTopic,
  topicB: RelationshipGraphTopic,
) {
  return topicA.id < topicB.id
    ? { source: topicA, target: topicB }
    : { source: topicB, target: topicA };
}

function evidenceTierRank(tier: RelationshipEvidenceTier | null | undefined) {
  switch (tier) {
    case "model_only":
      return 1;
    case "message_average":
      return 2;
    case "generic_attempt_interpretation":
      return 3;
    case "contract_marker_estimate":
      return 4;
    case "deterministic_structured_judgment":
      return 5;
    case "llm_rubric_judgment":
      return 6;
    case "hybrid_structured_and_rubric_judgment":
      return 7;
    case "repeated_judged_pattern":
      return 8;
    case "unknown":
    default:
      return 0;
  }
}

function mapEvidenceTier(
  tier: RelationshipDiagnosisEvidence["strongest_evidence_tier"],
): RelationshipEvidenceTier {
  if (!tier) return "unknown";

  switch (tier) {
    case "model_only":
    case "generic_attempt_interpretation":
    case "contract_marker_estimate":
    case "deterministic_structured_judgment":
    case "llm_rubric_judgment":
    case "hybrid_structured_and_rubric_judgment":
    case "repeated_judged_pattern":
      return tier;
    default:
      return "unknown";
  }
}

function strongestRelationshipEvidenceTier(
  a: RelationshipEvidenceTier,
  b: RelationshipEvidenceTier,
): RelationshipEvidenceTier {
  return evidenceTierRank(b) >= evidenceTierRank(a) ? b : a;
}

function diagnosisEvidenceFromState(
  topic: RelationshipGraphTopic,
): RelationshipDiagnosisEvidence | null {
  if (topic.diagnosisEvidence) return topic.diagnosisEvidence;

  const activeDiagnosis =
    topic.diagnosisState?.active_diagnosis ?? topic.diagnosis ?? null;

  if (!activeDiagnosis) return null;

  const beliefEntry = topic.diagnosisState?.beliefs?.[activeDiagnosis] ?? null;

  if (!beliefEntry) {
    return {
      active_diagnosis: activeDiagnosis,
      belief: null,
      confidence: null,
      evidence_count: null,
      resolution_pressure: null,
      status: null,
      strongest_evidence_tier: null,
      last_updated_at: null,
    };
  }

  return {
    active_diagnosis: activeDiagnosis,
    belief: safeNumber(beliefEntry.belief),
    confidence: safeNumber(beliefEntry.confidence),
    evidence_count: safeNumber(beliefEntry.evidence_count),
    resolution_pressure: safeNumber(beliefEntry.resolution_pressure),
    status: beliefEntry.status ?? null,
    strongest_evidence_tier: beliefEntry.strongest_evidence_tier ?? null,
    last_updated_at: beliefEntry.updated_at ?? null,
  };
}

function activeDiagnosis(topic: RelationshipGraphTopic): DiagnosisType | null {
  return diagnosisEvidenceFromState(topic)?.active_diagnosis ?? topic.diagnosis ?? null;
}

function topicDiagnosisConfidence(topic: RelationshipGraphTopic) {
  const evidence = diagnosisEvidenceFromState(topic);
  const explicitConfidence = safeNumber(evidence?.confidence ?? null);

  if (explicitConfidence !== null) return clamp01(explicitConfidence);
  if (!activeDiagnosis(topic)) return 0;

  const learningScore = safeNumber(topic.learningScore) ?? 0.5;

  return clamp01(0.34 + learningScore * 0.16 + Math.min(messageCount(topic), 8) * 0.05);
}

function topicSignalConfidence(topic: RelationshipGraphTopic, signal: "confusion" | "insight") {
  const evidence =
    signal === "confusion" ? topic.confusionEvidence : topic.insightEvidence;
  const explicitConfidence = safeNumber(evidence?.confidence ?? null);

  if (explicitConfidence !== null) return clamp01(explicitConfidence);

  const learningScore = safeNumber(topic.learningScore) ?? 0.5;

  return clamp01(0.32 + Math.min(messageCount(topic), 8) * 0.045 + learningScore * 0.18);
}

function topicSignalValue(topic: RelationshipGraphTopic, signal: "confusion" | "insight") {
  const evidence =
    signal === "confusion" ? topic.confusionEvidence : topic.insightEvidence;

  return safeNumber(evidence?.value ?? null) ?? safeNumber(topic[signal]);
}

function topicSignalEvidenceCount(
  topic: RelationshipGraphTopic,
  signal: "confusion" | "insight",
) {
  const evidence =
    signal === "confusion" ? topic.confusionEvidence : topic.insightEvidence;
  return Math.max(1, Math.floor(safeNumber(evidence?.evidence_count ?? null) ?? messageCount(topic) ?? 1));
}

function areSignalsCloseEnough(args: {
  valueA: number | null;
  valueB: number | null;
  maxGap: number;
}) {
  if (args.valueA === null || args.valueB === null) {
    return {
      close: false,
      gap: null,
      similarity: 0,
      average: null,
    };
  }

  const gap = Math.abs(args.valueA - args.valueB);
  const similarity = clamp01(1 - gap / Math.max(0.001, args.maxGap));

  return {
    close: gap <= args.maxGap,
    gap,
    similarity,
    average: (args.valueA + args.valueB) / 2,
  };
}

function hasSupportingSignalSimilarity(args: {
  topicA: RelationshipGraphTopic;
  topicB: RelationshipGraphTopic;
  maxConfusionGap: number;
  maxInsightGap: number;
  minAverageConfusionForPattern: number;
  minAverageInsightForPattern: number;
}) {
  const confusion = areSignalsCloseEnough({
    valueA: topicSignalValue(args.topicA, "confusion"),
    valueB: topicSignalValue(args.topicB, "confusion"),
    maxGap: args.maxConfusionGap,
  });

  const insight = areSignalsCloseEnough({
    valueA: topicSignalValue(args.topicA, "insight"),
    valueB: topicSignalValue(args.topicB, "insight"),
    maxGap: args.maxInsightGap,
  });

  const confusionSupports =
    confusion.close &&
    confusion.average !== null &&
    confusion.average >= args.minAverageConfusionForPattern;

  const insightSupports =
    insight.close &&
    insight.average !== null &&
    insight.average >= args.minAverageInsightForPattern;

  return {
    supported: confusionSupports || insightSupports,
    confusion,
    insight,
    reasons: [
      confusionSupports
        ? `supporting_confusion_similarity:${round4(confusion.similarity)}`
        : null,
      insightSupports ? `supporting_insight_similarity:${round4(insight.similarity)}` : null,
    ].filter((reason): reason is string => Boolean(reason)),
  };
}

function hasEvidenceAwareDiagnosisSupport(args: {
  evidenceA: RelationshipDiagnosisEvidence | null;
  evidenceB: RelationshipDiagnosisEvidence | null;
  options: Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>;
}) {
  if (!args.evidenceA || !args.evidenceB) {
    return {
      supported: false,
      reason: "missing_diagnosis_evidence",
      belief: null,
      confidence: null,
      evidenceCount: null,
      evidenceTier: "unknown" as RelationshipEvidenceTier,
      status: null,
    };
  }

  const beliefA = safeNumber(args.evidenceA.belief) ?? 0;
  const beliefB = safeNumber(args.evidenceB.belief) ?? 0;
  const confidenceA = safeNumber(args.evidenceA.confidence) ?? 0;
  const confidenceB = safeNumber(args.evidenceB.confidence) ?? 0;
  const evidenceCountA = Math.max(0, Math.floor(safeNumber(args.evidenceA.evidence_count) ?? 0));
  const evidenceCountB = Math.max(0, Math.floor(safeNumber(args.evidenceB.evidence_count) ?? 0));
  const statusA = args.evidenceA.status ?? null;
  const statusB = args.evidenceB.status ?? null;

  const statusBlocked =
    (!args.options.allowResolvedDiagnosisRelationships &&
      (statusA === "resolved" || statusB === "resolved")) ||
    (!args.options.allowWeakeningDiagnosisRelationships &&
      (statusA === "weakening" || statusB === "weakening"));

  if (statusBlocked) {
    return {
      supported: false,
      reason: `diagnosis_status_blocked:${statusA ?? "unknown"}:${statusB ?? "unknown"}`,
      belief: Math.min(beliefA, beliefB),
      confidence: Math.min(confidenceA, confidenceB),
      evidenceCount: Math.min(evidenceCountA, evidenceCountB),
      evidenceTier: "unknown" as RelationshipEvidenceTier,
      status: statusA ?? statusB,
    };
  }

  const belief = Math.min(beliefA, beliefB);
  const confidence = Math.min(confidenceA, confidenceB);
  const evidenceCount = Math.min(evidenceCountA, evidenceCountB);
  const tierA = mapEvidenceTier(args.evidenceA.strongest_evidence_tier);
  const tierB = mapEvidenceTier(args.evidenceB.strongest_evidence_tier);
  const evidenceTier = strongestRelationshipEvidenceTier(tierA, tierB);

  const supported =
    belief >= args.options.minDiagnosisBeliefForSharedDiagnosis &&
    confidence >= args.options.minDiagnosisConfidenceForSharedDiagnosis &&
    evidenceCount >= args.options.minDiagnosisEvidenceCountForSharedDiagnosis;

  return {
    supported,
    reason: supported
      ? "evidence_aware_diagnosis_gate_passed"
      : "evidence_aware_diagnosis_gate_failed",
    belief,
    confidence,
    evidenceCount,
    evidenceTier,
    status: statusA === statusB ? statusA : null,
  };
}

function buildSharedDiagnosisCandidate(
  topicA: RelationshipGraphTopic,
  topicB: RelationshipGraphTopic,
  options: Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>,
): RelationshipGraphCandidate | null {
  const diagnosisA = activeDiagnosis(topicA);
  const diagnosisB = activeDiagnosis(topicB);

  if (!diagnosisA || !diagnosisB) return null;
  if (diagnosisA !== diagnosisB) return null;

  const diagnosisEvidenceA = diagnosisEvidenceFromState(topicA);
  const diagnosisEvidenceB = diagnosisEvidenceFromState(topicB);
  const evidenceSupport = hasEvidenceAwareDiagnosisSupport({
    evidenceA: diagnosisEvidenceA,
    evidenceB: diagnosisEvidenceB,
    options,
  });

  const hasRicherDiagnosisEvidence =
    diagnosisEvidenceA?.belief !== null &&
    diagnosisEvidenceA?.belief !== undefined &&
    diagnosisEvidenceB?.belief !== null &&
    diagnosisEvidenceB?.belief !== undefined;

  const minCount = options.minMessageCountForDiagnosisOnly;
  const hasEnoughDirectEvidence =
    messageCount(topicA) >= minCount && messageCount(topicB) >= minCount;

  const support = hasSupportingSignalSimilarity({
    topicA,
    topicB,
    maxConfusionGap: options.maxConfusionGap,
    maxInsightGap: options.maxInsightGap,
    minAverageConfusionForPattern: options.minAverageConfusionForPattern,
    minAverageInsightForPattern: options.minAverageInsightForPattern,
  });

  if (hasRicherDiagnosisEvidence && !evidenceSupport.supported) {
    return null;
  }

  if (
    !hasRicherDiagnosisEvidence &&
    !hasEnoughDirectEvidence &&
    (!options.allowSharedDiagnosisWithSupportingSignals || !support.supported)
  ) {
    return null;
  }

  const { source, target } = canonicalPair(topicA, topicB);
  const confidence = hasRicherDiagnosisEvidence
    ? clamp01(evidenceSupport.confidence ?? 0)
    : Math.min(topicDiagnosisConfidence(topicA), topicDiagnosisConfidence(topicB));
  const evidenceCount = hasRicherDiagnosisEvidence
    ? Math.max(1, Math.floor(evidenceSupport.evidenceCount ?? 1))
    : pairEvidenceCount(source, target);
  const supportBoost = support.supported ? 0.08 : 0;
  const evidenceBoost = Math.min(evidenceCount, 5) * 0.025;
  const beliefBoost = hasRicherDiagnosisEvidence
    ? clamp01(((evidenceSupport.belief ?? 0.5) - 0.5) * 0.36)
    : 0;
  const tierBoost = evidenceTierRank(evidenceSupport.evidenceTier) * 0.008;
  const strength = clamp01(
    0.5 + confidence * 0.22 + supportBoost + evidenceBoost + beliefBoost + tierBoost,
  );

  return {
    relationship_type: "shared_diagnosis",
    source_topic_id: source.id,
    target_topic_id: target.id,
    source_topic_label: normalizeTopicLabel(source.topic_label),
    target_topic_label: normalizeTopicLabel(target.topic_label),
    strength,
    confidence,
    evidence_count: evidenceCount,
    evidence_source: derivedRelationshipEvidenceSource(
      "shared_diagnosis",
      evidenceSupport.evidenceTier,
    ),
    evidence_summary: `${normalizeTopicLabel(source.topic_label)} and ${normalizeTopicLabel(
      target.topic_label,
    )} currently share the ${diagnosisA} diagnosis${
      hasRicherDiagnosisEvidence
        ? ` with belief ${round4(evidenceSupport.belief ?? 0)} and confidence ${round4(confidence)}`
        : ""
    }.`,
    reasons: [
      "same_active_diagnosis",
      `diagnosis:${diagnosisA}`,
      hasRicherDiagnosisEvidence
        ? evidenceSupport.reason
        : hasEnoughDirectEvidence
          ? "enough_topic_evidence"
          : "diagnosis_supported_by_signal_similarity",
      ...support.reasons,
    ],
    affects_layout: false,
    visible_by_default: false,
    diagnostic_method: hasRicherDiagnosisEvidence
      ? "evidence_aware_shared_diagnosis_v1_1"
      : "same_active_topic_diagnosis_selective_v2",
    evidence_tier: hasRicherDiagnosisEvidence
      ? evidenceSupport.evidenceTier
      : "message_average",
    diagnosis_type: diagnosisA,
    diagnosis_belief: hasRicherDiagnosisEvidence ? evidenceSupport.belief : null,
    diagnosis_confidence: hasRicherDiagnosisEvidence ? confidence : null,
    diagnosis_status: hasRicherDiagnosisEvidence ? evidenceSupport.status : null,
    signal_gap: null,
    signal_average: null,
    signal_similarity: null,
    participating_topic_ids: [source.id, target.id],
  };
}

function buildSharedConfusionCandidate(
  topicA: RelationshipGraphTopic,
  topicB: RelationshipGraphTopic,
  options: Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>,
): RelationshipGraphCandidate | null {
  const confusion = areSignalsCloseEnough({
    valueA: topicSignalValue(topicA, "confusion"),
    valueB: topicSignalValue(topicB, "confusion"),
    maxGap: options.maxConfusionGap,
  });

  if (!confusion.close || confusion.gap === null || confusion.average === null) {
    return null;
  }

  /**
   * Avoid "both are vaguely midrange" relationships. Shared confusion should
   * mark a meaningfully high confusion pattern.
   */
  if (confusion.average < options.minAverageConfusionForPattern) return null;

  const { source, target } = canonicalPair(topicA, topicB);
  const confidence = Math.min(
    topicSignalConfidence(topicA, "confusion"),
    topicSignalConfidence(topicB, "confusion"),
  );
  const evidenceCount = Math.max(
    1,
    Math.min(
      topicSignalEvidenceCount(source, "confusion"),
      topicSignalEvidenceCount(target, "confusion"),
    ),
  );
  const strength = clamp01(
    confusion.average * 0.62 + confusion.similarity * 0.32 + confidence * 0.06,
  );

  return {
    relationship_type: "shared_confusion_pattern",
    source_topic_id: source.id,
    target_topic_id: target.id,
    source_topic_label: normalizeTopicLabel(source.topic_label),
    target_topic_label: normalizeTopicLabel(target.topic_label),
    strength,
    confidence,
    evidence_count: evidenceCount,
    evidence_source: derivedRelationshipEvidenceSource("shared_confusion_pattern"),
    evidence_summary: `${normalizeTopicLabel(source.topic_label)} and ${normalizeTopicLabel(
      target.topic_label,
    )} have similar elevated confusion levels (${round4(
      topicSignalValue(topicA, "confusion") ?? 0,
    )} vs ${round4(topicSignalValue(topicB, "confusion") ?? 0)}).`,
    reasons: [
      "similar_elevated_topic_confusion_average",
      `confusion_gap:${round4(confusion.gap)}`,
      `average_confusion:${round4(confusion.average)}`,
    ],
    affects_layout: false,
    visible_by_default: false,
    diagnostic_method: "topic_confusion_average_gap_selective_v2",
    evidence_tier: "message_average",
    diagnosis_type: null,
    diagnosis_belief: null,
    diagnosis_confidence: null,
    diagnosis_status: null,
    signal_gap: confusion.gap,
    signal_average: confusion.average,
    signal_similarity: confusion.similarity,
    participating_topic_ids: [source.id, target.id],
  };
}

function buildSharedInsightCandidate(
  topicA: RelationshipGraphTopic,
  topicB: RelationshipGraphTopic,
  options: Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>,
): RelationshipGraphCandidate | null {
  const insight = areSignalsCloseEnough({
    valueA: topicSignalValue(topicA, "insight"),
    valueB: topicSignalValue(topicB, "insight"),
    maxGap: options.maxInsightGap,
  });

  if (!insight.close || insight.gap === null || insight.average === null) {
    return null;
  }

  /**
   * Shared insight should mark emerging clarity, but this threshold is softer
   * than confusion while the insight model is still being calibrated. These
   * relationships remain hidden by default and non-layout-affecting; the sidebar
   * Insight lens explicitly opts into showing them.
   */
  if (insight.average < options.minAverageInsightForPattern) return null;

  const { source, target } = canonicalPair(topicA, topicB);
  const confidence = Math.min(
    topicSignalConfidence(topicA, "insight"),
    topicSignalConfidence(topicB, "insight"),
  );
  const evidenceCount = Math.max(
    1,
    Math.min(
      topicSignalEvidenceCount(source, "insight"),
      topicSignalEvidenceCount(target, "insight"),
    ),
  );
  /**
   * Visual-testing calibration:
   *
   * Insight relationships should be able to appear even while the current model
   * still produces conservative/midrange values. Keep the relationship hidden by
   * default and non-layout-affecting, but give close insight matches enough
   * strength to survive the global minStrength and appear in the Insight view.
   */
  const strength = clamp01(
    0.28 + insight.average * 0.38 + insight.similarity * 0.32 + confidence * 0.04,
  );

  return {
    relationship_type: "shared_insight_pattern",
    source_topic_id: source.id,
    target_topic_id: target.id,
    source_topic_label: normalizeTopicLabel(source.topic_label),
    target_topic_label: normalizeTopicLabel(target.topic_label),
    strength,
    confidence,
    evidence_count: evidenceCount,
    evidence_source: derivedRelationshipEvidenceSource("shared_insight_pattern"),
    evidence_summary: `${normalizeTopicLabel(source.topic_label)} and ${normalizeTopicLabel(
      target.topic_label,
    )} have similar insight levels (${round4(
      topicSignalValue(topicA, "insight") ?? 0,
    )} vs ${round4(topicSignalValue(topicB, "insight") ?? 0)}).`,
    reasons: [
      "similar_topic_insight_average_visual_test",
      `insight_gap:${round4(insight.gap)}`,
      `average_insight:${round4(insight.average)}`,
    ],
    affects_layout: false,
    visible_by_default: false,
    diagnostic_method: "topic_insight_average_gap_visual_test_v3",
    evidence_tier: "message_average",
    diagnosis_type: null,
    diagnosis_belief: null,
    diagnosis_confidence: null,
    diagnosis_status: null,
    signal_gap: insight.gap,
    signal_average: insight.average,
    signal_similarity: insight.similarity,
    participating_topic_ids: [source.id, target.id],
  };
}

function candidateToRelationship(
  candidate: RelationshipGraphCandidate,
  generatedAt: string | null,
): LearningSpaceRelationship {
  const displayPolicy = buildRelationshipDisplayPolicy({
    relationshipType: candidate.relationship_type,
    strength: candidate.strength,
    confidence: candidate.confidence,
    affectsLayout: candidate.affects_layout,
    visibleByDefault: candidate.visible_by_default,
    evidenceTier: candidate.evidence_tier,
  });

  return {
    relationship_id: makeRelationshipId({
      relationshipType: candidate.relationship_type,
      sourceTopicId: candidate.source_topic_id,
      targetTopicId: candidate.target_topic_id,
    }),
    source_topic_id: candidate.source_topic_id,
    target_topic_id: candidate.target_topic_id,
    relationship_type: candidate.relationship_type,
    strength: round4(candidate.strength),
    confidence: round4(candidate.confidence),
    evidence_count: candidate.evidence_count,
    evidence_source: candidate.evidence_source,
    evidence_summary: candidate.evidence_summary,
    affects_layout: candidate.affects_layout,
    visible_by_default: candidate.visible_by_default,
    reasons: candidate.reasons,
    updated_at: generatedAt,
    basis: {
      similarity: round4(candidate.signal_similarity ?? candidate.strength),
      normalized_similarity: round4(candidate.strength),
      desired_distance: null,
      actual_distance: null,
      diagnostic_method: candidate.diagnostic_method,
    },
    display_policy: displayPolicy,
  };
}

const RELATIONSHIP_TYPE_BUDGETS: Record<
  LearningSpaceRelationship["relationship_type"],
  number
> = {
  semantic: 16,
  semantic_similarity: 16,
  shared_diagnosis: 12,
  shared_confusion_pattern: 24,
  shared_insight_pattern: 24,
  prerequisite: 12,
  blocks: 12,
  transfer_bridge: 12,
  analogy: 12,
  same_cluster: 12,
  co_attempted: 12,
  content_source_overlap: 12,
  shared_confusion: 12,
  strategy: 12,
  temporal: 12,
};

const VISUAL_TEST_MIN_STRENGTH_BY_TYPE: Partial<
  Record<LearningSpaceRelationship["relationship_type"], number>
> = {
  /**
   * Insight model values are still provisional. For now, reserve enough insight
   * relationships to test the green visual lens even when insight strengths are
   * not as high as confusion strengths.
   */
  shared_insight_pattern: 0.42,
  shared_confusion_pattern: 0.5,
};

function minStrengthForCandidate(
  candidate: RelationshipGraphCandidate,
  globalMinStrength: number,
) {
  return Math.min(
    globalMinStrength,
    VISUAL_TEST_MIN_STRENGTH_BY_TYPE[candidate.relationship_type] ??
      globalMinStrength,
  );
}

function buildCandidates(
  topics: RelationshipGraphTopic[],
  options: Required<Omit<RelationshipGraphBuildOptions, "generatedAt">>,
) {
  const candidates: RelationshipGraphCandidate[] = [];

  for (let outerIndex = 0; outerIndex < topics.length; outerIndex += 1) {
    for (let innerIndex = outerIndex + 1; innerIndex < topics.length; innerIndex += 1) {
      const topicA = topics[outerIndex];
      const topicB = topics[innerIndex];

      const sharedDiagnosis = buildSharedDiagnosisCandidate(topicA, topicB, options);
      if (sharedDiagnosis) candidates.push(sharedDiagnosis);

      const sharedConfusion = buildSharedConfusionCandidate(topicA, topicB, options);
      if (sharedConfusion) candidates.push(sharedConfusion);

      const sharedInsight = buildSharedInsightCandidate(topicA, topicB, options);
      if (sharedInsight) candidates.push(sharedInsight);
    }
  }

  return candidates;
}

function relationshipTopicCapKey(relationship: LearningSpaceRelationship, topicId: string) {
  return `${relationship.relationship_type}:${topicId}`;
}

function applyPerTopicCap(
  relationships: LearningSpaceRelationship[],
  maxRelationshipsPerTopic: number,
) {
  /**
   * Cap per topic *and per relationship type*.
   *
   * Without type-aware caps, the first strong confusion relationships can use up
   * a topic's entire relationship budget before insight relationships get a
   * chance to appear. Since the sidebar now lets the learner switch relationship
   * lenses, each relationship type needs its own small budget.
   */
  const countsByTopicAndType = new Map<string, number>();
  const capped: LearningSpaceRelationship[] = [];

  for (const relationship of relationships) {
    const sourceKey = relationshipTopicCapKey(
      relationship,
      relationship.source_topic_id,
    );
    const targetKey = relationshipTopicCapKey(
      relationship,
      relationship.target_topic_id,
    );
    const sourceCount = countsByTopicAndType.get(sourceKey) ?? 0;
    const targetCount = countsByTopicAndType.get(targetKey) ?? 0;

    if (
      sourceCount >= maxRelationshipsPerTopic ||
      targetCount >= maxRelationshipsPerTopic
    ) {
      continue;
    }

    capped.push(relationship);
    countsByTopicAndType.set(sourceKey, sourceCount + 1);
    countsByTopicAndType.set(targetKey, targetCount + 1);
  }

  return capped;
}

function rankRelationships(relationships: LearningSpaceRelationship[]) {
  return [...relationships].sort((a, b) => {
    const priorityA = a.display_policy.priority ?? a.strength;
    const priorityB = b.display_policy.priority ?? b.strength;

    if (priorityB !== priorityA) return priorityB - priorityA;
    if (b.strength !== a.strength) return b.strength - a.strength;

    return a.relationship_id.localeCompare(b.relationship_id);
  });
}

function applyTypeBudgets(relationships: LearningSpaceRelationship[]) {
  const relationshipsByType = new Map<
    LearningSpaceRelationship["relationship_type"],
    LearningSpaceRelationship[]
  >();

  for (const relationship of relationships) {
    const existing = relationshipsByType.get(relationship.relationship_type) ?? [];
    existing.push(relationship);
    relationshipsByType.set(relationship.relationship_type, existing);
  }

  const selected: LearningSpaceRelationship[] = [];

  for (const [relationshipType, typeRelationships] of relationshipsByType) {
    const typeBudget = RELATIONSHIP_TYPE_BUDGETS[relationshipType] ?? 12;
    selected.push(...rankRelationships(typeRelationships).slice(0, typeBudget));
  }

  return selected;
}

export function buildTopicRelationships(
  topics: RelationshipGraphTopic[],
  options: RelationshipGraphBuildOptions = {},
): RelationshipGraphBuildResult {
  const resolvedOptions = {
    ...DEFAULT_RELATIONSHIP_GRAPH_OPTIONS,
    ...options,
  };
  const generatedAt = options.generatedAt ?? null;

  const candidates = buildCandidates(topics, resolvedOptions);
  const relationshipsByKey = new Map<string, LearningSpaceRelationship>();

  for (const candidate of candidates) {
    if (
      candidate.strength <
      minStrengthForCandidate(candidate, resolvedOptions.minStrength)
    ) {
      continue;
    }

    const key = makeRelationshipKey({
      relationshipType: candidate.relationship_type,
      sourceTopicId: candidate.source_topic_id,
      targetTopicId: candidate.target_topic_id,
    });

    const relationship = candidateToRelationship(candidate, generatedAt);
    const existing = relationshipsByKey.get(key);

    if (!existing || relationship.strength > existing.strength) {
      relationshipsByKey.set(key, relationship);
    }
  }

  const typeBalancedRelationships = applyTypeBudgets([
    ...relationshipsByKey.values(),
  ]);

  const cappedRelationships = applyPerTopicCap(
    rankRelationships(typeBalancedRelationships),
    resolvedOptions.maxRelationshipsPerTopic,
  ).slice(0, resolvedOptions.maxRelationships);

  return {
    relationships: cappedRelationships,
    generated_at: generatedAt,
    candidate_count: candidates.length,
    emitted_count: cappedRelationships.length,
    omitted_count: Math.max(0, candidates.length - cappedRelationships.length),
  };
}
