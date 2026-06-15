import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ProbeContractSnapshot,
} from "@/types/contracts";
import {
  isUsableStructuredJudgment,
  runStructuredJudge,
  structuredNotApplicable,
} from "./deterministic";
import {
  isUsableRubricJudgment,
  runRubricJudge,
} from "./rubric";
import {
  CONTRACT_JUDGING_VERSION,
  type ContractFailureMatch,
  type ContractJudgment,
  type ContractJudgmentOutcome,
  type ContractJudgingInput,
  type ContractMarkerMatch,
  type ContractMisconceptionMatch,
  type ContractAllowedClaimStrength,
  type ContractSourcePolicySnapshot,
  type EvidenceJudgingTier,
  type JudgingMethod,
  type RubricJudgment,
  type RubricMarkerScore,
  type RubricMisconceptionScore,
  type SourceGroundedRubricSignal,
  type StructuredJudgment,
} from "./judging-types";

const DIAGNOSIS_TYPES: DiagnosisType[] = [
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
];

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function emptyDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function isDiagnosisType(value: unknown): value is DiagnosisType {
  return typeof value === "string" && DIAGNOSIS_TYPES.includes(value as DiagnosisType);
}

function mergeDiagnosisDeltas(
  base: DiagnosisDelta,
  incoming: DiagnosisDelta,
  weight = 1,
): DiagnosisDelta {
  return {
    recall_gap: clamp01(base.recall_gap + incoming.recall_gap * weight),
    representation_gap: clamp01(
      base.representation_gap + incoming.representation_gap * weight,
    ),
    procedure_gap: clamp01(base.procedure_gap + incoming.procedure_gap * weight),
    discrimination_gap: clamp01(
      base.discrimination_gap + incoming.discrimination_gap * weight,
    ),
    transfer_gap: clamp01(base.transfer_gap + incoming.transfer_gap * weight),
  };
}

function scaleDiagnosisDelta(delta: DiagnosisDelta, scale: number): DiagnosisDelta {
  return {
    recall_gap: clamp01(delta.recall_gap * scale),
    representation_gap: clamp01(delta.representation_gap * scale),
    procedure_gap: clamp01(delta.procedure_gap * scale),
    discrimination_gap: clamp01(delta.discrimination_gap * scale),
    transfer_gap: clamp01(delta.transfer_gap * scale),
  };
}

function normalizeDiagnosisDelta(value: unknown): DiagnosisDelta {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDelta();
  }

  const record = value as Partial<Record<DiagnosisType, unknown>>;

  return {
    recall_gap: clamp01(safeNumber(record.recall_gap, 0)),
    representation_gap: clamp01(safeNumber(record.representation_gap, 0)),
    procedure_gap: clamp01(safeNumber(record.procedure_gap, 0)),
    discrimination_gap: clamp01(safeNumber(record.discrimination_gap, 0)),
    transfer_gap: clamp01(safeNumber(record.transfer_gap, 0)),
  };
}

function getDominantDiagnosis(delta: DiagnosisDelta): DiagnosisType | null {
  let best: DiagnosisType | null = null;
  let bestValue = 0;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    const value = delta[diagnosisType];
    if (value > bestValue) {
      best = diagnosisType;
      bestValue = value;
    }
  }

  return bestValue > 0.03 ? best : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getContractId(contract: ProbeContractSnapshot | null | undefined) {
  return typeof contract?.contract_id === "string" ? contract.contract_id : null;
}

function getJudgingSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord(contract?.judging_schema ?? null);
}

function getTargetDiagnosis(contract: ProbeContractSnapshot | null | undefined) {
  const candidate = (contract as { target_diagnosis?: unknown } | null | undefined)
    ?.target_diagnosis;
  return isDiagnosisType(candidate) ? candidate : null;
}

function getSourceMetadata(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord((contract as { source_metadata?: unknown } | null | undefined)?.source_metadata);
}

function asClaimStrength(value: unknown): ContractAllowedClaimStrength | null {
  return value === "none" ||
    value === "conservative" ||
    value === "moderate" ||
    value === "strong"
    ? value
    : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveSourcePolicySnapshot(
  contract: ProbeContractSnapshot | null | undefined,
): ContractSourcePolicySnapshot | null {
  if (!contract) return null;

  const source = getSourceMetadata(contract);

  const contentConfidence = asNullableNumber(source.content_confidence);
  const authoringConfidence = asNullableNumber(source.authoring_confidence);
  const pedagogicalConfidence = asNullableNumber(source.pedagogical_confidence);
  const requiresReview = asNullableBoolean(source.requires_review);

  const canMakeStrong =
    source.can_make_strong_correctness_claim === true;
  const canMakeModerate =
    source.can_make_moderate_correctness_claim === true || canMakeStrong;

  const inferredClaimStrength =
    asClaimStrength(source.allowed_claim_strength) ??
    (canMakeStrong
      ? "strong"
      : canMakeModerate
        ? "moderate"
        : contentConfidence !== null && contentConfidence >= 0.3
          ? "conservative"
          : "none");

  const sourcePolicyReasons = Array.isArray(source.source_policy_reasons)
    ? source.source_policy_reasons.filter(
        (reason): reason is string => typeof reason === "string",
      )
    : [];

  return {
    contract_source:
      typeof source.contract_source === "string" ? source.contract_source : null,
    confidence_level:
      typeof source.confidence_level === "string" ? source.confidence_level : null,
    allowed_claim_strength: inferredClaimStrength,
    content_confidence: contentConfidence,
    authoring_confidence: authoringConfidence,
    pedagogical_confidence: pedagogicalConfidence,
    requires_review: requiresReview,
    can_make_strong_correctness_claim: canMakeStrong,
    can_make_moderate_correctness_claim: canMakeModerate,
    should_invite_source_upload: source.should_invite_source_upload === true,
    source_policy_reasons: sourcePolicyReasons,
  };
}

function defaultSourcePolicySnapshot(
  hasContract: boolean,
): ContractSourcePolicySnapshot {
  return {
    contract_source: hasContract ? "unknown" : null,
    confidence_level: hasContract ? "very_low" : null,
    allowed_claim_strength: hasContract ? "conservative" : "none",
    content_confidence: null,
    authoring_confidence: null,
    pedagogical_confidence: null,
    requires_review: hasContract ? true : null,
    can_make_strong_correctness_claim: false,
    can_make_moderate_correctness_claim: false,
    should_invite_source_upload: hasContract,
    source_policy_reasons: hasContract
      ? ["No source metadata was available on the probe contract snapshot."]
      : ["No probe contract was available."],
  };
}

function applySourcePolicyToOutcome(args: {
  outcome: ContractJudgmentOutcome;
  successScore: number;
  sourcePolicy: ContractSourcePolicySnapshot;
}): ContractJudgmentOutcome {
  if (args.outcome !== "contract_success") return args.outcome;

  if (args.sourcePolicy.can_make_strong_correctness_claim) return args.outcome;

  if (
    args.sourcePolicy.allowed_claim_strength === "moderate" &&
    args.sourcePolicy.can_make_moderate_correctness_claim &&
    args.successScore >= 0.82
  ) {
    return args.outcome;
  }

  return "contract_partial";
}

function confidenceCapForClaimStrength(
  claimStrength: ContractAllowedClaimStrength,
) {
  switch (claimStrength) {
    case "strong":
      return 1;
    case "moderate":
      return 0.82;
    case "conservative":
      return 0.66;
    case "none":
    default:
      return 0.42;
  }
}

function getSuccessMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).success_markers);
}

function getFailureMarkers(contract: ProbeContractSnapshot | null | undefined) {
  return asArray(getJudgingSchema(contract).failure_markers);
}

function getMisconceptionMappings(
  contract: ProbeContractSnapshot | null | undefined,
) {
  return asArray(getJudgingSchema(contract).misconception_mappings);
}

function getEvidenceText(input: ContractJudgingInput) {
  const value = input.normalizedEvidence?.value;
  return value?.kind === "text" ? value.text : "";
}

function textIncludesAny(text: string, needles: string[]) {
  const lower = text.toLowerCase();

  return needles.some((needle) => {
    const normalized = needle.trim().toLowerCase();
    return normalized.length >= 4 && lower.includes(normalized);
  });
}

function interpretationSuccessBase(input: ContractJudgingInput) {
  const interpretation = input.attemptInterpretation;
  const coherence = safeNumber(interpretation.features.conceptual_coherence, 0);
  const discrimination = safeNumber(
    interpretation.features.discrimination_accuracy,
    0,
  );
  const prediction = safeNumber(interpretation.features.prediction_accuracy, 0);
  const procedure = safeNumber(
    interpretation.features.procedure_order_quality,
    0,
  );
  const representation = safeNumber(
    interpretation.features.representation_quality,
    0,
  );

  const strongestFeature = Math.max(
    coherence,
    discrimination,
    prediction,
    procedure,
    representation,
  );

  const outcomeBoost =
    interpretation.outcome === "strong_evidence"
      ? 0.16
      : interpretation.outcome === "partial_evidence"
        ? 0.08
        : interpretation.outcome === "weak_evidence"
          ? -0.06
          : -0.18;

  return clamp01(
    interpretation.evidence_strength * 0.48 +
      interpretation.judgment_confidence * 0.28 +
      strongestFeature * 0.2 +
      outcomeBoost,
  );
}

function interpretationFailureBase(input: ContractJudgingInput) {
  const interpretation = input.attemptInterpretation;
  const confusion = safeNumber(interpretation.model_signals_used.confusion, 0.5);
  const insight = safeNumber(interpretation.model_signals_used.insight, 0.35);
  const evidenceWeakness = 1 - interpretation.evidence_strength;
  const confidence = interpretation.judgment_confidence;

  const outcomeBoost =
    interpretation.outcome === "no_evidence"
      ? 0.38
      : interpretation.outcome === "uninterpretable"
        ? 0.32
        : interpretation.outcome === "weak_evidence"
          ? 0.2
          : interpretation.outcome === "partial_evidence"
            ? 0.08
            : -0.08;

  return clamp01(
    evidenceWeakness * 0.38 +
      confusion * 0.22 +
      (1 - insight) * 0.18 +
      confidence * 0.08 +
      outcomeBoost,
  );
}

function applyStructuredSuccess(
  estimatedScore: number,
  structuredJudgment: StructuredJudgment | null,
) {
  if (!isUsableStructuredJudgment(structuredJudgment)) return estimatedScore;

  return clamp01(
    structuredJudgment.performance_score * 0.72 +
      estimatedScore * 0.18 +
      structuredJudgment.confidence * 0.1,
  );
}

function applyStructuredFailure(
  estimatedScore: number,
  structuredJudgment: StructuredJudgment | null,
) {
  if (!isUsableStructuredJudgment(structuredJudgment)) return estimatedScore;

  return clamp01(
    (1 - structuredJudgment.performance_score) * 0.76 +
      estimatedScore * 0.16 +
      structuredJudgment.confidence * 0.08,
  );
}

function findRubricMarkerScore(
  scores: RubricMarkerScore[],
  markerId: EntityId | null,
  label: string,
): RubricMarkerScore | null {
  return (
    scores.find((score) => markerId && score.marker_id === markerId) ??
    scores.find((score) => score.label === label) ??
    null
  );
}

function findRubricMisconceptionScore(
  scores: RubricMisconceptionScore[],
  misconceptionId: EntityId | null,
  label: string,
): RubricMisconceptionScore | null {
  return (
    scores.find(
      (score) => misconceptionId && score.misconception_id === misconceptionId,
    ) ??
    scores.find((score) => score.label === label) ??
    null
  );
}


function getUsableRubricJudgment(
  rubricJudgment: RubricJudgment | null,
): RubricJudgment | null {
  if (!rubricJudgment) return null;
  return isUsableRubricJudgment(rubricJudgment) ? rubricJudgment : null;
}

function applyRubricSuccess(
  estimatedScore: number,
  rubricJudgment: RubricJudgment | null,
  markerScore: RubricMarkerScore | null,
) {
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);
  if (!usableRubricJudgment) return estimatedScore;

  const rubricScore =
    markerScore?.score ?? usableRubricJudgment.performance_score;
  const rubricConfidence =
    markerScore?.confidence ?? usableRubricJudgment.confidence;

  return clamp01(
    rubricScore * 0.66 + estimatedScore * 0.22 + rubricConfidence * 0.12,
  );
}

function applyRubricFailure(
  estimatedScore: number,
  rubricJudgment: RubricJudgment | null,
  markerScore: RubricMarkerScore | null,
) {
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);
  if (!usableRubricJudgment) return estimatedScore;

  const rubricScore =
    markerScore?.score ?? clamp01(1 - usableRubricJudgment.performance_score);
  const rubricConfidence =
    markerScore?.confidence ?? usableRubricJudgment.confidence;

  return clamp01(
    rubricScore * 0.66 + estimatedScore * 0.22 + rubricConfidence * 0.12,
  );
}

function buildSuccessMarkerMatches(
  input: ContractJudgingInput,
  structuredJudgment: StructuredJudgment | null,
  rubricJudgment: RubricJudgment | null,
): ContractMarkerMatch[] {
  const markers = getSuccessMarkers(input.probeContractSnapshot);
  const base = interpretationSuccessBase(input);
  const evidenceText = getEvidenceText(input);
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);

  return markers.map((marker) => {
    const record = asRecord(marker);
    const label = typeof record.label === "string" ? record.label : "Success marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const weight = clamp01(safeNumber(record.weight, 0.25));
    const required = record.required === true;
    const textBonus =
      description && evidenceText
        ? textIncludesAny(evidenceText, description.split(/\s+/).slice(0, 5))
          ? 0.08
          : 0
        : 0;

    const estimatedMatchScore = clamp01(base * 0.88 + weight * 0.12 + textBonus);
    const markerId = typeof record.marker_id === "string" ? record.marker_id : null;
    const rubricMarkerScore = findRubricMarkerScore(
      rubricJudgment?.success_marker_scores ?? [],
      markerId,
      label,
    );
    const structuredAnchoredScore = applyStructuredSuccess(
      estimatedMatchScore,
      structuredJudgment,
    );
    const matchScore = applyRubricSuccess(
      structuredAnchoredScore,
      rubricJudgment,
      rubricMarkerScore,
    );

    return {
      marker_id: markerId,
      label,
      description,
      match_score: matchScore,
      weight,
      required,
      reasons: [
        isUsableStructuredJudgment(structuredJudgment)
          ? `Marker score was anchored by deterministic structured performance ${structuredJudgment.performance_score.toFixed(
              2,
            )}.`
          : usableRubricJudgment
            ? `Marker score was anchored by rubric performance ${usableRubricJudgment.performance_score.toFixed(
                2,
              )}.`
            : `Marker estimated from evidence strength ${input.attemptInterpretation.evidence_strength.toFixed(
                2,
              )}.`,
        rubricMarkerScore
          ? `Rubric marker score was ${rubricMarkerScore.score.toFixed(2)}.`
          : `Judgment confidence was ${input.attemptInterpretation.judgment_confidence.toFixed(
              2,
            )}.`,
      ],
    };
  });
}

function buildFailureMarkerMatches(
  input: ContractJudgingInput,
  structuredJudgment: StructuredJudgment | null,
  rubricJudgment: RubricJudgment | null,
): ContractFailureMatch[] {
  const markers = getFailureMarkers(input.probeContractSnapshot);
  const base = interpretationFailureBase(input);
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);

  return markers.map((marker) => {
    const record = asRecord(marker);
    const label = typeof record.label === "string" ? record.label : "Failure marker";
    const description =
      typeof record.description === "string" ? record.description : null;
    const severity = clamp01(safeNumber(record.severity, 0.5));
    const diagnosis = isDiagnosisType(record.maps_to_diagnosis)
      ? record.maps_to_diagnosis
      : null;
    const diagnosisDelta = normalizeDiagnosisDelta(record.diagnosis_delta);
    const estimatedMatchScore = clamp01(base * 0.8 + severity * 0.2);
    const markerId = typeof record.marker_id === "string" ? record.marker_id : null;
    const rubricMarkerScore = findRubricMarkerScore(
      rubricJudgment?.failure_marker_scores ?? [],
      markerId,
      label,
    );
    const structuredAnchoredScore = applyStructuredFailure(
      estimatedMatchScore,
      structuredJudgment,
    );
    const matchScore = applyRubricFailure(
      structuredAnchoredScore,
      rubricJudgment,
      rubricMarkerScore,
    );

    return {
      marker_id: markerId,
      label,
      description,
      match_score: matchScore,
      severity,
      maps_to_diagnosis: diagnosis,
      diagnosis_delta: diagnosisDelta,
      reasons: [
        isUsableStructuredJudgment(structuredJudgment)
          ? `Failure score was anchored by deterministic structured error rate ${(
              1 - structuredJudgment.performance_score
            ).toFixed(2)}.`
          : usableRubricJudgment
            ? `Failure score was anchored by rubric performance ${(
                1 - usableRubricJudgment.performance_score
              ).toFixed(2)}.`
            : `Failure estimate used evidence weakness ${(
                1 - input.attemptInterpretation.evidence_strength
              ).toFixed(2)}.`,
        rubricMarkerScore
          ? `Rubric failure marker score was ${rubricMarkerScore.score.toFixed(2)}.`
          : diagnosis
            ? `Failure marker maps to ${diagnosis}.`
            : "Failure marker did not provide a valid diagnosis mapping.",
      ],
    };
  });
}

function buildMisconceptionMatches(
  input: ContractJudgingInput,
  failureMatches: ContractFailureMatch[],
  rubricJudgment: RubricJudgment | null,
): ContractMisconceptionMatch[] {
  const mappings = getMisconceptionMappings(input.probeContractSnapshot);
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);

  return mappings.map((mapping) => {
    const record = asRecord(mapping);
    const label =
      typeof record.label === "string" ? record.label : "Possible misconception";
    const description =
      typeof record.description === "string" ? record.description : null;
    const diagnosis = isDiagnosisType(record.likely_diagnosis)
      ? record.likely_diagnosis
      : null;

    const failureMarkerIds = new Set(
      asArray(record.failure_marker_ids).filter(
        (id): id is EntityId => typeof id === "string",
      ),
    );

    const relatedFailures = failureMatches.filter(
      (failure) => failure.marker_id && failureMarkerIds.has(failure.marker_id),
    );

    const relatedScore = relatedFailures.length
      ? relatedFailures.reduce((sum, failure) => sum + failure.match_score, 0) /
        relatedFailures.length
      : 0;

    const misconceptionId =
      typeof record.misconception_id === "string"
        ? record.misconception_id
        : null;
    const rubricMisconceptionScore = findRubricMisconceptionScore(
      rubricJudgment?.misconception_scores ?? [],
      misconceptionId,
      label,
    );

    const estimatedScore = clamp01(
      relatedScore * 0.82 +
        input.attemptInterpretation.evidence_strength * 0.04 +
        input.attemptInterpretation.judgment_confidence * 0.06,
    );
    const matchScore = usableRubricJudgment
      ? clamp01(
          (rubricMisconceptionScore?.score ??
            usableRubricJudgment.performance_score) *
            0.66 +
            estimatedScore * 0.24 +
            (rubricMisconceptionScore?.confidence ??
              usableRubricJudgment.confidence) *
              0.1,
        )
      : estimatedScore;

    return {
      misconception_id: misconceptionId,
      label,
      description,
      likely_diagnosis: diagnosis,
      match_score: matchScore,
      reasons: [
        rubricMisconceptionScore
          ? `Rubric misconception score was ${rubricMisconceptionScore.score.toFixed(2)}.`
          : relatedFailures.length
            ? `Matched through ${relatedFailures.length} related failure marker(s).`
            : "No related failure markers were strongly matched yet.",
      ],
    };
  });
}

function averageWeightedSuccess(matches: ContractMarkerMatch[]) {
  if (!matches.length) return 0;

  const weightTotal = matches.reduce((sum, match) => sum + match.weight, 0);
  if (weightTotal <= 0) {
    return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
  }

  return matches.reduce(
    (sum, match) => sum + match.match_score * match.weight,
    0,
  ) / weightTotal;
}

function averageSeverityFailure(matches: ContractFailureMatch[]) {
  if (!matches.length) return 0;

  const severityTotal = matches.reduce((sum, match) => sum + match.severity, 0);
  if (severityTotal <= 0) {
    return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
  }

  return matches.reduce(
    (sum, match) => sum + match.match_score * match.severity,
    0,
  ) / severityTotal;
}

function averageMisconception(matches: ContractMisconceptionMatch[]) {
  if (!matches.length) return 0;

  return matches.reduce((sum, match) => sum + match.match_score, 0) / matches.length;
}

function deriveOutcome(args: {
  hasContract: boolean;
  successScore: number;
  failureScore: number;
  evidenceStrength: number;
}): ContractJudgmentOutcome {
  if (!args.hasContract) return "no_contract";
  if (args.evidenceStrength < 0.18) return "insufficient_evidence";

  if (args.successScore >= 0.68 && args.successScore >= args.failureScore + 0.12) {
    return "contract_success";
  }

  if (args.failureScore >= 0.62 && args.failureScore >= args.successScore + 0.1) {
    return "contract_failure";
  }

  return "contract_partial";
}

function deriveContractDiagnosisDelta(args: {
  outcome: ContractJudgmentOutcome;
  failureMatches: ContractFailureMatch[];
  attemptDiagnosisDelta: DiagnosisDelta;
  failureScore: number;
  misconceptionScore: number;
}) {
  let delta = args.attemptDiagnosisDelta;

  if (args.outcome === "contract_success") {
    return scaleDiagnosisDelta(delta, 0.35);
  }

  for (const failure of args.failureMatches) {
    const weight = clamp01(
      failure.match_score * 0.5 + failure.severity * 0.3 + args.failureScore * 0.2,
    );
    delta = mergeDiagnosisDeltas(delta, failure.diagnosis_delta, weight);
  }

  if (args.outcome === "insufficient_evidence") {
    delta = mergeDiagnosisDeltas(delta, {
      ...emptyDelta(),
      representation_gap: 0.08,
      recall_gap: 0.05,
    });
  }

  if (args.misconceptionScore > 0.5) {
    const dominant = getDominantDiagnosis(delta) ?? "representation_gap";
    delta = mergeDiagnosisDeltas(delta, {
      ...emptyDelta(),
      [dominant]: 0.06,
    });
  }

  return delta;
}

function deriveResolutionDelta(args: {
  outcome: ContractJudgmentOutcome;
  successScore: number;
  contractConfidence: number;
  targetDiagnosis: DiagnosisType | null;
  diagnosisDelta: DiagnosisDelta;
}) {
  if (args.outcome !== "contract_success" && args.outcome !== "contract_partial") {
    return emptyDelta();
  }

  const diagnosisToResolve =
    args.targetDiagnosis ?? getDominantDiagnosis(args.diagnosisDelta);

  if (!diagnosisToResolve) return emptyDelta();

  const outcomeMultiplier = args.outcome === "contract_success" ? 1 : 0.32;
  const amount = clamp01(
    args.successScore * args.contractConfidence * 0.42 * outcomeMultiplier,
  );

  return {
    ...emptyDelta(),
    [diagnosisToResolve]: amount,
  };
}

function deriveEvidenceTier(args: {
  hasContract: boolean;
  structuredJudgment: StructuredJudgment | null;
  rubricJudgment: RubricJudgment | null;
}): EvidenceJudgingTier {
  const hasStructured = isUsableStructuredJudgment(args.structuredJudgment);
  const hasRubric = Boolean(getUsableRubricJudgment(args.rubricJudgment));

  if (hasStructured && hasRubric) return "hybrid_structured_and_rubric_judgment";
  if (hasStructured) return "deterministic_structured_judgment";
  if (hasRubric) return "heuristic_rubric_judgment";

  if (args.hasContract) return "contract_marker_estimate";

  return "generic_attempt_interpretation";
}

function deriveJudgingMethods(args: {
  hasContract: boolean;
  structuredJudgment: StructuredJudgment | null;
  rubricJudgment: RubricJudgment | null;
}): JudgingMethod[] {
  const methods: JudgingMethod[] = [];
  const structuredJudgment = args.structuredJudgment;
  const rubricJudgment = getUsableRubricJudgment(args.rubricJudgment);

  if (isUsableStructuredJudgment(structuredJudgment)) {
    methods.push(structuredJudgment.method);
  }

  if (rubricJudgment) {
    methods.push(rubricJudgment.method);
  }

  if (args.hasContract) methods.push("contract_marker_estimate");
  if (!methods.length) methods.push("generic_attempt_interpretation");

  return uniqueStrings(methods) as JudgingMethod[];
}

function getSourceGroundedSignal(
  rubricJudgment: RubricJudgment | null,
): SourceGroundedRubricSignal | null {
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);
  if (!usableRubricJudgment) return null;

  return usableRubricJudgment.source_grounded_signal ?? null;
}

export function judgeProbeAttemptAgainstContract(
  input: ContractJudgingInput,
): ContractJudgment {
  const judgedAt = input.judgedAt ?? nowIso();
  const contract = input.probeContractSnapshot ?? null;
  const hasContract = Boolean(contract);

  const structuredJudgment = runStructuredJudge(input);
  const rubricJudgment = runRubricJudge(input);
  const successMarkerMatches = buildSuccessMarkerMatches(
    input,
    structuredJudgment,
    rubricJudgment,
  );
  const failureMarkerMatches = buildFailureMarkerMatches(
    input,
    structuredJudgment,
    rubricJudgment,
  );
  const misconceptionMatches = buildMisconceptionMatches(
    input,
    failureMarkerMatches,
    rubricJudgment,
  );

  const successScore = clamp01(averageWeightedSuccess(successMarkerMatches));
  const failureScore = clamp01(averageSeverityFailure(failureMarkerMatches));
  const misconceptionScore = clamp01(averageMisconception(misconceptionMatches));
  const evidenceStrength = clamp01(input.attemptInterpretation.evidence_strength);

  const rawOutcome = deriveOutcome({
    hasContract,
    successScore,
    failureScore,
    evidenceStrength,
  });
  const sourcePolicy =
    deriveSourcePolicySnapshot(contract) ?? defaultSourcePolicySnapshot(hasContract);
  const outcome = applySourcePolicyToOutcome({
    outcome: rawOutcome,
    successScore,
    sourcePolicy,
  });

  const diagnosisDelta = deriveContractDiagnosisDelta({
    outcome,
    failureMatches: failureMarkerMatches,
    attemptDiagnosisDelta: input.attemptInterpretation.diagnosis_delta,
    failureScore,
    misconceptionScore,
  });

  const suggestedActiveDiagnosis = getDominantDiagnosis(diagnosisDelta);

  const structuredConfidence = isUsableStructuredJudgment(structuredJudgment)
    ? structuredJudgment.confidence
    : 0;
  const usableRubricJudgment = getUsableRubricJudgment(rubricJudgment);
  const rubricConfidence = usableRubricJudgment?.confidence ?? 0;
  const sourceGroundedSignal = getSourceGroundedSignal(rubricJudgment);

  const uncappedContractConfidence = clamp01(
    input.attemptInterpretation.judgment_confidence * 0.28 +
      evidenceStrength * 0.16 +
      Math.abs(successScore - failureScore) * 0.16 +
      structuredConfidence * 0.16 +
      rubricConfidence * 0.12 +
      (hasContract ? 0.12 : 0),
  );
  const contractConfidence = Math.min(
    uncappedContractConfidence,
    confidenceCapForClaimStrength(sourcePolicy.allowed_claim_strength),
  );

  const resolutionDelta = deriveResolutionDelta({
    outcome,
    successScore,
    contractConfidence,
    targetDiagnosis: getTargetDiagnosis(contract),
    diagnosisDelta,
  });

  const evidenceTier = deriveEvidenceTier({
    hasContract,
    structuredJudgment,
    rubricJudgment,
  });

  const judgingMethods = deriveJudgingMethods({
    hasContract,
    structuredJudgment,
    rubricJudgment,
  });

  const cautions: string[] = [];

  if (!hasContract) {
    cautions.push(
      "No probe contract snapshot was available, so contract judging could not run fully.",
    );
  }

  if (!input.normalizedEvidence) {
    cautions.push(
      "No normalized evidence was provided, so deterministic answer-aware judging could not inspect the raw submitted response.",
    );
  }

  if (!successMarkerMatches.length) {
    cautions.push("No success markers were available on the probe contract.");
  }

  if (!failureMarkerMatches.length) {
    cautions.push("No failure markers were available on the probe contract.");
  }

  if (structuredJudgment?.outcome === "unjudgeable") {
    cautions.push(...structuredJudgment.cautions);
  }

  if (rubricJudgment) {
    cautions.push(...rubricJudgment.cautions);
  }

  if (!isUsableStructuredJudgment(structuredJudgment) && !usableRubricJudgment) {
    cautions.push(
      "Contract Judging V1.5 still uses scaffold marker estimation when deterministic structured judging and rubric judging are unavailable.",
    );
  }

  if (usableRubricJudgment) {
    cautions.push(
      "Text rubric judging is currently a cheap local heuristic. It should later be upgraded with source-grounded rubric/model support when stronger correctness claims are needed.",
    );
  }

  if (sourceGroundedSignal) {
    cautions.push(
      "Source-grounded rubric signal was preserved for downstream diagnosis as a provisional hint, not as reviewed semantic correctness proof.",
    );

    if (sourceGroundedSignal.possible_surface_word_match) {
      cautions.push(
        "Source-grounded signal suggests the response may be using source-related words without fully explaining the relationship or mechanism.",
      );
    }

    if (sourceGroundedSignal.possible_overclaim) {
      cautions.push(
        "Source-grounded signal detected possible overclaiming; downstream updates should remain conservative.",
      );
    }
  }

  if (!sourcePolicy.can_make_strong_correctness_claim) {
    cautions.push(
      `Source policy only allows ${sourcePolicy.allowed_claim_strength} claims for this probe contract.`,
    );
  }

  if (rawOutcome !== outcome) {
    cautions.push(
      `Source policy converted raw outcome ${rawOutcome} to ${outcome} to avoid overclaiming correctness.`,
    );
  }

  if (sourcePolicy.should_invite_source_upload) {
    cautions.push(
      "Source policy suggests inviting source upload or source selection before making stronger correctness claims.",
    );
  }

  return {
    version: CONTRACT_JUDGING_VERSION,
    judged_at: judgedAt,

    contract_id: getContractId(contract),
    probe_id: input.attemptInterpretation.linked_probe_id,
    topic_id: input.attemptInterpretation.linked_topic_id,

    outcome,
    contract_confidence: contractConfidence,
    evidence_strength: evidenceStrength,
    evidence_tier: evidenceTier,

    allowed_claim_strength: sourcePolicy.allowed_claim_strength,
    can_make_strong_correctness_claim: sourcePolicy.can_make_strong_correctness_claim,
    source_policy: sourcePolicy,

    judging_methods: judgingMethods,

    success_score: successScore,
    failure_score: failureScore,
    misconception_score: misconceptionScore,

    success_marker_matches: successMarkerMatches,
    failure_marker_matches: failureMarkerMatches,
    misconception_matches: misconceptionMatches,

    diagnosis_delta: diagnosisDelta,
    resolution_delta: resolutionDelta,
    suggested_active_diagnosis: suggestedActiveDiagnosis,

    structured_judgment: structuredJudgment ?? structuredNotApplicable(),
    rubric_judgment: rubricJudgment,
    source_grounded_signal: sourceGroundedSignal,

    reasons: [
      hasContract
        ? `Judged attempt against probe contract ${getContractId(contract) ?? "unknown"}.`
        : "No probe contract snapshot was available.",
      `Judging methods: ${judgingMethods.join(", ")}.`,
      `Evidence tier: ${evidenceTier}.`,
      `Allowed claim strength: ${sourcePolicy.allowed_claim_strength}.`,
      `Contract source: ${sourcePolicy.contract_source ?? "unknown"}.`,
      sourceGroundedSignal
        ? `Source-grounded signal confidence was ${sourceGroundedSignal.confidence.toFixed(2)}.`
        : "No source-grounded rubric signal was available on this judgment.",
      `Contract success score was ${successScore.toFixed(2)}.`,
      `Contract failure score was ${failureScore.toFixed(2)}.`,
      rawOutcome === outcome
        ? `Outcome was ${outcome}.`
        : `Raw outcome was ${rawOutcome}, adjusted outcome was ${outcome}.`,
    ],
    cautions,

    evidence_interpretation_snapshot: input.attemptInterpretation,
  };
}
