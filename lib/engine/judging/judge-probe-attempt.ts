import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ProbeContractSnapshot,
} from "@/types/contracts";
import {
  CONTRACT_JUDGING_VERSION,
  type ContractFailureMatch,
  type ContractJudgment,
  type ContractJudgmentOutcome,
  type ContractJudgingInput,
  type ContractMarkerMatch,
  type ContractMisconceptionMatch,
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

function getContractId(contract: ProbeContractSnapshot | null | undefined) {
  return typeof contract?.contract_id === "string" ? contract.contract_id : null;
}

function getJudgingSchema(contract: ProbeContractSnapshot | null | undefined) {
  return asRecord(contract?.judging_schema ?? null);
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

function textIncludesAny(text: string, needles: string[]) {
  const lower = text.toLowerCase();

  return needles.some((needle) => {
    const normalized = needle.trim().toLowerCase();
    return normalized.length >= 4 && lower.includes(normalized);
  });
}

function getEvidenceText(_input: ContractJudgingInput) {
  /**
   * AttemptInterpretation intentionally does not expose full raw text in V1.
   * This function is a future seam for richer text/multimodal judging once the
   * normalized evidence object is passed into this module too.
   */
  return "";
}

function buildSuccessMarkerMatches(input: ContractJudgingInput): ContractMarkerMatch[] {
  const markers = getSuccessMarkers(input.probeContractSnapshot);
  const base = interpretationSuccessBase(input);
  const evidenceText = getEvidenceText(input);

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

    const matchScore = clamp01(base * 0.88 + weight * 0.12 + textBonus);

    return {
      marker_id: typeof record.marker_id === "string" ? record.marker_id : null,
      label,
      description,
      match_score: matchScore,
      weight,
      required,
      reasons: [
        `Marker estimated from evidence strength ${input.attemptInterpretation.evidence_strength.toFixed(
          2,
        )}.`,
        `Judgment confidence was ${input.attemptInterpretation.judgment_confidence.toFixed(
          2,
        )}.`,
      ],
    };
  });
}

function buildFailureMarkerMatches(input: ContractJudgingInput): ContractFailureMatch[] {
  const markers = getFailureMarkers(input.probeContractSnapshot);
  const base = interpretationFailureBase(input);

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
    const matchScore = clamp01(base * 0.8 + severity * 0.2);

    return {
      marker_id: typeof record.marker_id === "string" ? record.marker_id : null,
      label,
      description,
      match_score: matchScore,
      severity,
      maps_to_diagnosis: diagnosis,
      diagnosis_delta: diagnosisDelta,
      reasons: [
        `Failure estimate used evidence weakness ${(1 - input.attemptInterpretation.evidence_strength).toFixed(
          2,
        )}.`,
        diagnosis
          ? `Failure marker maps to ${diagnosis}.`
          : "Failure marker did not provide a valid diagnosis mapping.",
      ],
    };
  });
}

function buildMisconceptionMatches(
  input: ContractJudgingInput,
  failureMatches: ContractFailureMatch[],
): ContractMisconceptionMatch[] {
  const mappings = getMisconceptionMappings(input.probeContractSnapshot);

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

    const matchScore = clamp01(
      relatedScore * 0.82 +
        input.attemptInterpretation.evidence_strength * 0.04 +
        input.attemptInterpretation.judgment_confidence * 0.06,
    );

    return {
      misconception_id:
        typeof record.misconception_id === "string"
          ? record.misconception_id
          : null,
      label,
      description,
      likely_diagnosis: diagnosis,
      match_score: matchScore,
      reasons: [
        relatedFailures.length
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
    return {
      recall_gap: delta.recall_gap * 0.65,
      representation_gap: delta.representation_gap * 0.65,
      procedure_gap: delta.procedure_gap * 0.65,
      discrimination_gap: delta.discrimination_gap * 0.65,
      transfer_gap: delta.transfer_gap * 0.65,
    };
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

export function judgeProbeAttemptAgainstContract(
  input: ContractJudgingInput,
): ContractJudgment {
  const judgedAt = input.judgedAt ?? nowIso();
  const contract = input.probeContractSnapshot ?? null;
  const hasContract = Boolean(contract);

  const successMarkerMatches = buildSuccessMarkerMatches(input);
  const failureMarkerMatches = buildFailureMarkerMatches(input);
  const misconceptionMatches = buildMisconceptionMatches(
    input,
    failureMarkerMatches,
  );

  const successScore = clamp01(averageWeightedSuccess(successMarkerMatches));
  const failureScore = clamp01(averageSeverityFailure(failureMarkerMatches));
  const misconceptionScore = clamp01(averageMisconception(misconceptionMatches));
  const evidenceStrength = clamp01(input.attemptInterpretation.evidence_strength);

  const outcome = deriveOutcome({
    hasContract,
    successScore,
    failureScore,
    evidenceStrength,
  });

  const diagnosisDelta = deriveContractDiagnosisDelta({
    outcome,
    failureMatches: failureMarkerMatches,
    attemptDiagnosisDelta: input.attemptInterpretation.diagnosis_delta,
    failureScore,
    misconceptionScore,
  });

  const suggestedActiveDiagnosis = getDominantDiagnosis(diagnosisDelta);

  const contractConfidence = clamp01(
    input.attemptInterpretation.judgment_confidence * 0.46 +
      evidenceStrength * 0.24 +
      Math.abs(successScore - failureScore) * 0.18 +
      (hasContract ? 0.12 : 0),
  );

  const cautions: string[] = [];

  if (!hasContract) {
    cautions.push("No probe contract snapshot was available, so contract judging could not run fully.");
  }

  if (!successMarkerMatches.length) {
    cautions.push("No success markers were available on the probe contract.");
  }

  if (!failureMarkerMatches.length) {
    cautions.push("No failure markers were available on the probe contract.");
  }

  cautions.push(
    "Contract Judging V1 is scaffold logic. Renderer-specific deterministic judging and rubric/model judging should replace generic marker estimation over time.",
  );

  return {
    version: CONTRACT_JUDGING_VERSION,
    judged_at: judgedAt,

    contract_id: getContractId(contract),
    probe_id: input.attemptInterpretation.linked_probe_id,
    topic_id: input.attemptInterpretation.linked_topic_id,

    outcome,
    contract_confidence: contractConfidence,
    evidence_strength: evidenceStrength,

    success_score: successScore,
    failure_score: failureScore,
    misconception_score: misconceptionScore,

    success_marker_matches: successMarkerMatches,
    failure_marker_matches: failureMarkerMatches,
    misconception_matches: misconceptionMatches,

    diagnosis_delta: diagnosisDelta,
    suggested_active_diagnosis: suggestedActiveDiagnosis,

    reasons: [
      hasContract
        ? `Judged attempt against probe contract ${getContractId(contract) ?? "unknown"}.`
        : "No probe contract snapshot was available.",
      `Contract success score was ${successScore.toFixed(2)}.`,
      `Contract failure score was ${failureScore.toFixed(2)}.`,
      `Outcome was ${outcome}.`,
    ],
    cautions,

    evidence_interpretation_snapshot: input.attemptInterpretation,
  };
}
