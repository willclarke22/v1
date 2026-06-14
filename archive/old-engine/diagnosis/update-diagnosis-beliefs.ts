import type { DiagnosisDelta, DiagnosisType } from "@/types/contracts";
import {
  DIAGNOSIS_STATE_VERSION,
  DIAGNOSIS_TYPES,
  type DiagnosisBeliefEntry,
  type DiagnosisBeliefMap,
  type DiagnosisBeliefStatus,
  type DiagnosisState,
  type DiagnosisStateLastUpdate,
  type DiagnosisStateUpdateInput,
  type DiagnosisStateUpdateResult,
} from "./diagnosis-types";
import type { EvidenceJudgingTier } from "@/archive/old-engine/judging";

/**
 * Diagnosis Belief Update V1.2
 *
 * This updater now supports two separate evidence directions:
 *
 * - diagnosis_delta: gap-pressure evidence
 * - resolution_delta: evidence that a gap may be weakening/resolving
 *
 * Generic AttemptInterpretation remains the fallback input. When a
 * ContractJudgment is provided, this updater prefers the contract judgment's
 * diagnosis_delta, resolution_delta, confidence, and evidence tier.
 *
 * V1.2 adds a cautious interpretation of ContractJudgment.source_grounded_signal.
 * That signal may add small diagnosis pressure / resolution pressure, but it
 * must not override the main contract judgment or upgrade source claim strength.
 */

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyDiagnosisDelta(): DiagnosisDelta {
  return {
    recall_gap: 0,
    representation_gap: 0,
    procedure_gap: 0,
    discrimination_gap: 0,
    transfer_gap: 0,
  };
}

function mergeDiagnosisDelta(
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

function singleDiagnosisDelta(
  diagnosisType: DiagnosisType,
  amount: number,
): DiagnosisDelta {
  const delta = emptyDiagnosisDelta();
  delta[diagnosisType] = clamp01(amount);
  return delta;
}

function claimStrengthPressureScale(value: unknown) {
  switch (value) {
    case "strong":
      return 1;
    case "moderate":
      return 0.9;
    case "conservative":
      return 0.7;
    case "none":
      return 0.45;
    default:
      return 0.55;
  }
}

function claimStrengthResolutionScale(value: unknown) {
  switch (value) {
    case "strong":
      return 0.8;
    case "moderate":
      return 0.55;
    case "conservative":
      return 0.25;
    case "none":
      return 0;
    default:
      return 0.12;
  }
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readSourceGroundedSignal(contractJudgment: DiagnosisStateUpdateInput["contractJudgment"]) {
  const signal = contractJudgment?.source_grounded_signal;

  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    return null;
  }

  return {
    used_source_focus: readBoolean(signal.used_source_focus),
    addressed_relationship_or_mechanism: readBoolean(
      signal.addressed_relationship_or_mechanism,
    ),
    possible_surface_word_match: readBoolean(signal.possible_surface_word_match),
    possible_overclaim: readBoolean(signal.possible_overclaim),
    confidence: clamp01(safeNumber(signal.confidence, 0)),
    reasons: readStringArray(signal.reasons),
    cautions: readStringArray(signal.cautions),
  };
}

function deriveSourceGroundedDiagnosisAdjustment(args: {
  contractJudgment: DiagnosisStateUpdateInput["contractJudgment"];
  fallbackTargetDiagnosis: DiagnosisType | null;
}) {
  const signal = readSourceGroundedSignal(args.contractJudgment);

  if (!signal || signal.confidence <= 0) {
    return {
      diagnosis_delta: emptyDiagnosisDelta(),
      resolution_delta: emptyDiagnosisDelta(),
      applied: false,
      confidence: 0,
      reasons: [] as string[],
      cautions: [] as string[],
    };
  }

  const contractConfidence = clamp01(
    safeNumber(args.contractJudgment?.contract_confidence, signal.confidence),
  );
  const sourcePolicy = args.contractJudgment?.source_policy;
  const allowedClaimStrength =
    args.contractJudgment?.allowed_claim_strength ??
    sourcePolicy?.allowed_claim_strength ??
    "conservative";

  const confidenceScale = clamp01(
    signal.confidence * 0.62 + contractConfidence * 0.24 + 0.14,
  );
  const pressureScale =
    confidenceScale * claimStrengthPressureScale(allowedClaimStrength);
  const resolutionScale =
    confidenceScale * claimStrengthResolutionScale(allowedClaimStrength);

  let diagnosisDelta = emptyDiagnosisDelta();
  let resolutionDelta = emptyDiagnosisDelta();
  const reasons: string[] = [
    "Applied cautious source-grounded diagnosis shaping from the contract judgment signal.",
  ];
  const cautions: string[] = [
    "Source-grounded diagnosis shaping is heuristic and cannot prove correctness by itself.",
  ];

  if (signal.used_source_focus === false) {
    diagnosisDelta = mergeDiagnosisDelta(diagnosisDelta, {
      ...emptyDiagnosisDelta(),
      recall_gap: 0.035,
      representation_gap: 0.025,
    }, pressureScale);
    reasons.push("The response did not clearly use the source focus, adding small recall/representation gap pressure.");
  }

  if (signal.addressed_relationship_or_mechanism === false) {
    diagnosisDelta = mergeDiagnosisDelta(diagnosisDelta, {
      ...emptyDiagnosisDelta(),
      representation_gap: 0.055,
    }, pressureScale);
    reasons.push("The response did not clearly explain the relationship or mechanism, adding representation gap pressure.");
  }

  if (signal.possible_surface_word_match === true) {
    diagnosisDelta = mergeDiagnosisDelta(diagnosisDelta, {
      ...emptyDiagnosisDelta(),
      recall_gap: 0.035,
      representation_gap: 0.055,
    }, pressureScale);
    reasons.push("Possible surface-word matching was detected, adding small recall/representation gap pressure.");
    cautions.push("Surface-word matching should prevent strong diagnosis resolution from this attempt.");
  }

  if (signal.possible_overclaim === true) {
    diagnosisDelta = mergeDiagnosisDelta(diagnosisDelta, {
      ...emptyDiagnosisDelta(),
      discrimination_gap: 0.045,
      transfer_gap: 0.025,
    }, pressureScale);
    reasons.push("Possible overclaiming beyond the source was detected, adding discrimination/transfer gap pressure.");
  }

  const canAddResolution =
    signal.used_source_focus === true &&
    signal.addressed_relationship_or_mechanism === true &&
    signal.possible_surface_word_match !== true &&
    signal.possible_overclaim !== true &&
    resolutionScale > 0;

  if (canAddResolution) {
    const targetDiagnosis =
      args.fallbackTargetDiagnosis ??
      args.contractJudgment?.suggested_active_diagnosis ??
      null;

    const resolutionAmount = clamp01(0.035 * resolutionScale);

    if (targetDiagnosis) {
      resolutionDelta = singleDiagnosisDelta(targetDiagnosis, resolutionAmount);
      reasons.push(
        `The response used the source focus and explained a mechanism, adding tiny resolution pressure for ${targetDiagnosis}.`,
      );
    } else {
      resolutionDelta = {
        ...emptyDiagnosisDelta(),
        representation_gap: resolutionAmount,
      };
      reasons.push(
        "The response used the source focus and explained a mechanism, adding tiny representation-gap resolution pressure.",
      );
    }
  }

  if (allowedClaimStrength === "none" || allowedClaimStrength === "conservative") {
    cautions.push(
      `Resolution pressure was capped because source policy allows only ${allowedClaimStrength} claims.`,
    );
  }

  return {
    diagnosis_delta: diagnosisDelta,
    resolution_delta: resolutionDelta,
    applied: true,
    confidence: signal.confidence,
    reasons,
    cautions,
  };
}

function createBeliefStatus(args: {
  belief: number;
  confidence: number;
  evidenceCount: number;
  resolutionPressure: number;
}): DiagnosisBeliefStatus {
  if (
    args.resolutionPressure >= 0.36 &&
    args.belief <= 0.48 &&
    args.confidence >= 0.24
  ) {
    return "resolved";
  }

  if (args.resolutionPressure >= 0.18 && args.belief <= 0.56) {
    return "weakening";
  }

  if (args.belief >= 0.57 && args.confidence >= 0.18 && args.evidenceCount > 0) {
    return "active";
  }

  return "uncertain";
}

function evidenceTierRank(tier: EvidenceJudgingTier | null | undefined) {
  switch (tier) {
    case "model_only":
      return 1;
    case "generic_attempt_interpretation":
      return 2;
    case "contract_marker_estimate":
      return 3;
    case "deterministic_structured_judgment":
      return 4;
    case "heuristic_rubric_judgment":
      return 4.5;
    case "llm_rubric_judgment":
      return 5;
    case "hybrid_structured_and_rubric_judgment":
      return 6;
    case "repeated_judged_pattern":
      return 7;
    default:
      return 0;
  }
}

function strongestEvidenceTier(
  current: EvidenceJudgingTier | null | undefined,
  incoming: EvidenceJudgingTier | null | undefined,
): EvidenceJudgingTier | null {
  if (!current && !incoming) return null;
  if (!current) return incoming ?? null;
  if (!incoming) return current;

  return evidenceTierRank(incoming) >= evidenceTierRank(current)
    ? incoming
    : current;
}

function createBeliefEntry(args?: Partial<DiagnosisBeliefEntry>): DiagnosisBeliefEntry {
  const belief = clamp01(args?.belief ?? 0.5);
  const confidence = clamp01(args?.confidence ?? 0.08);
  const evidenceCount = Math.max(0, Math.floor(safeNumber(args?.evidence_count, 0)));
  const resolutionPressure = clamp01(safeNumber(args?.resolution_pressure, 0));

  return {
    belief,
    confidence,
    evidence_count: evidenceCount,
    last_delta: safeNumber(args?.last_delta, 0),
    resolution_pressure: resolutionPressure,
    last_resolution_delta: safeNumber(args?.last_resolution_delta, 0),
    status:
      args?.status ??
      createBeliefStatus({
        belief,
        confidence,
        evidenceCount,
        resolutionPressure,
      }),
    strongest_evidence_tier: args?.strongest_evidence_tier ?? null,
    updated_at: args?.updated_at ?? null,
  };
}

function createInitialBeliefs(activeDiagnosis: DiagnosisType | null): DiagnosisBeliefMap {
  const beliefs = {} as DiagnosisBeliefMap;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    beliefs[diagnosisType] = createBeliefEntry({
      belief: diagnosisType === activeDiagnosis ? 0.58 : 0.5,
      confidence: diagnosisType === activeDiagnosis ? 0.16 : 0.08,
      evidence_count: 0,
      last_delta: 0,
      resolution_pressure: 0,
      last_resolution_delta: 0,
      strongest_evidence_tier: null,
      updated_at: null,
    });
  }

  return beliefs;
}

function isDiagnosisType(value: unknown): value is DiagnosisType {
  return typeof value === "string" && DIAGNOSIS_TYPES.includes(value as DiagnosisType);
}

function isEvidenceTier(value: unknown): value is EvidenceJudgingTier {
  return (
    value === "model_only" ||
    value === "generic_attempt_interpretation" ||
    value === "contract_marker_estimate" ||
    value === "deterministic_structured_judgment" ||
    value === "heuristic_rubric_judgment" ||
    value === "llm_rubric_judgment" ||
    value === "hybrid_structured_and_rubric_judgment" ||
    value === "repeated_judged_pattern"
  );
}

function isBeliefStatus(value: unknown): value is DiagnosisBeliefStatus {
  return (
    value === "uncertain" ||
    value === "active" ||
    value === "weakening" ||
    value === "resolved"
  );
}

function parseBeliefEntry(value: unknown): DiagnosisBeliefEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<DiagnosisBeliefEntry>;

  return createBeliefEntry({
    belief: safeNumber(candidate.belief, 0.5),
    confidence: safeNumber(candidate.confidence, 0.08),
    evidence_count: safeNumber(candidate.evidence_count, 0),
    last_delta: safeNumber(candidate.last_delta, 0),
    resolution_pressure: safeNumber(candidate.resolution_pressure, 0),
    last_resolution_delta: safeNumber(candidate.last_resolution_delta, 0),
    status: isBeliefStatus(candidate.status) ? candidate.status : undefined,
    strongest_evidence_tier: isEvidenceTier(candidate.strongest_evidence_tier)
      ? candidate.strongest_evidence_tier
      : null,
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : null,
  });
}

function parsePreviousState(
  value: unknown,
  fallbackActiveDiagnosis: DiagnosisType | null,
): DiagnosisState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      version: DIAGNOSIS_STATE_VERSION,
      active_diagnosis: fallbackActiveDiagnosis,
      beliefs: createInitialBeliefs(fallbackActiveDiagnosis),
      last_update: null,
      history: [],
    };
  }

  const candidate = value as Partial<DiagnosisState>;
  const activeDiagnosis = isDiagnosisType(candidate.active_diagnosis)
    ? candidate.active_diagnosis
    : fallbackActiveDiagnosis;

  const beliefs = createInitialBeliefs(activeDiagnosis);
  const previousBeliefs =
    candidate.beliefs && typeof candidate.beliefs === "object"
      ? candidate.beliefs
      : null;

  if (previousBeliefs) {
    for (const diagnosisType of DIAGNOSIS_TYPES) {
      const parsed = parseBeliefEntry(
        (previousBeliefs as Partial<DiagnosisBeliefMap>)[diagnosisType],
      );
      if (parsed) beliefs[diagnosisType] = parsed;
    }
  }

  const history = Array.isArray(candidate.history)
    ? candidate.history
        .filter(
          (item): item is DiagnosisStateLastUpdate =>
            Boolean(item) &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            typeof (item as DiagnosisStateLastUpdate).updated_at === "string",
        )
        .slice(-12)
    : [];

  return {
    version: DIAGNOSIS_STATE_VERSION,
    active_diagnosis: activeDiagnosis,
    beliefs,
    last_update: candidate.last_update ?? null,
    history,
  };
}

function getDeltaForDiagnosis(delta: DiagnosisDelta, diagnosisType: DiagnosisType) {
  return safeNumber(delta[diagnosisType], 0);
}

function getDominantDiagnosis(beliefs: DiagnosisBeliefMap): DiagnosisType | null {
  let bestType: DiagnosisType | null = null;
  let bestScore = -Infinity;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    const entry = beliefs[diagnosisType];

    /**
     * Resolution pressure should make active diagnosis selection more cautious.
     * A gap can still have high confidence, but if it is weakening/resolving,
     * it should not dominate purely because it was historically active.
     */
    const resolutionPenalty = clamp01(entry.resolution_pressure ?? 0) * 0.18;
    const score = entry.belief * 0.72 + entry.confidence * 0.28 - resolutionPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestType = diagnosisType;
    }
  }

  return bestType;
}

function shouldClearActiveDiagnosis(args: {
  activeDiagnosis: DiagnosisType | null;
  beliefs: DiagnosisBeliefMap;
}) {
  if (!args.activeDiagnosis) return false;

  const entry = args.beliefs[args.activeDiagnosis];
  if (!entry) return true;

  return (
    entry.status === "resolved" ||
    (entry.belief <= 0.49 &&
      clamp01(entry.resolution_pressure ?? 0) >= 0.28 &&
      entry.confidence >= 0.22)
  );
}

function shouldSwitchActiveDiagnosis(args: {
  previousActiveDiagnosis: DiagnosisType | null;
  candidateDiagnosis: DiagnosisType | null;
  beliefs: DiagnosisBeliefMap;
}) {
  if (!args.candidateDiagnosis) return false;

  if (shouldClearActiveDiagnosis({
    activeDiagnosis: args.previousActiveDiagnosis,
    beliefs: args.beliefs,
  })) {
    return true;
  }

  if (!args.previousActiveDiagnosis) return true;
  if (args.candidateDiagnosis === args.previousActiveDiagnosis) return true;

  const current = args.beliefs[args.previousActiveDiagnosis];
  const candidate = args.beliefs[args.candidateDiagnosis];

  const currentScore =
    current.belief * 0.72 +
    current.confidence * 0.28 -
    clamp01(current.resolution_pressure ?? 0) * 0.18;
  const candidateScore =
    candidate.belief * 0.72 +
    candidate.confidence * 0.28 -
    clamp01(candidate.resolution_pressure ?? 0) * 0.18;

  /**
   * Hysteresis: require a meaningfully stronger new diagnosis before switching.
   * This prevents the active diagnosis label from bouncing between gaps.
   */
  return candidateScore >= currentScore + 0.08 && candidate.confidence >= 0.18;
}

function updateBeliefEntry(args: {
  entry: DiagnosisBeliefEntry;
  rawDelta: number;
  rawResolutionDelta: number;
  evidenceStrength: number;
  judgmentConfidence: number;
  updatedAt: string;
  evidenceTier: EvidenceJudgingTier | null;
}) {
  const normalizedDelta = clamp01(args.rawDelta);
  const normalizedResolutionDelta = clamp01(args.rawResolutionDelta);
  const evidenceWeight = clamp01(
    0.06 + args.evidenceStrength * 0.12 + args.judgmentConfidence * 0.1,
  );

  /**
   * Positive diagnosis deltas nudge belief upward.
   * Resolution deltas nudge belief downward, but cautiously.
   *
   * This keeps success from being treated as merely "less failure" while still
   * avoiding over-resolving a gap from one good attempt.
   */
  const pressureTarget =
    normalizedDelta > 0 ? clamp01(0.5 + normalizedDelta * 0.5) : 0.5;

  const afterPressure =
    normalizedDelta > 0
      ? clamp01(args.entry.belief * (1 - evidenceWeight) + pressureTarget * evidenceWeight)
      : clamp01(args.entry.belief * 0.988 + 0.5 * 0.012);

  const resolutionWeight = clamp01(
    evidenceWeight * (0.45 + args.judgmentConfidence * 0.35),
  );

  const resolutionTarget = clamp01(0.5 - normalizedResolutionDelta * 0.3);
  const belief =
    normalizedResolutionDelta > 0
      ? clamp01(afterPressure * (1 - resolutionWeight) + resolutionTarget * resolutionWeight)
      : afterPressure;

  const confidenceGain =
    normalizedDelta > 0 || normalizedResolutionDelta > 0
      ? evidenceWeight * 0.7
      : evidenceWeight * 0.1;

  const previousResolutionPressure = clamp01(args.entry.resolution_pressure ?? 0);
  const nextResolutionPressure =
    normalizedResolutionDelta > 0
      ? clamp01(
          previousResolutionPressure * 0.9 +
            normalizedResolutionDelta * (0.18 + args.judgmentConfidence * 0.16),
        )
      : clamp01(previousResolutionPressure * 0.985);

  const evidenceCountIncrement =
    normalizedDelta > 0 || normalizedResolutionDelta > 0 ? 1 : 0;
  const evidenceCount = args.entry.evidence_count + evidenceCountIncrement;
  const confidence = clamp01(args.entry.confidence + confidenceGain);

  return createBeliefEntry({
    belief,
    confidence,
    evidence_count: evidenceCount,
    last_delta: normalizedDelta,
    resolution_pressure: nextResolutionPressure,
    last_resolution_delta: normalizedResolutionDelta,
    strongest_evidence_tier: strongestEvidenceTier(
      args.entry.strongest_evidence_tier,
      args.evidenceTier,
    ),
    updated_at: args.updatedAt,
  });
}

function activeDiagnosisAfterUpdate(args: {
  previousActiveDiagnosis: DiagnosisType | null;
  dominantDiagnosis: DiagnosisType | null;
  beliefs: DiagnosisBeliefMap;
}) {
  if (
    shouldClearActiveDiagnosis({
      activeDiagnosis: args.previousActiveDiagnosis,
      beliefs: args.beliefs,
    })
  ) {
    return null;
  }

  return shouldSwitchActiveDiagnosis({
    previousActiveDiagnosis: args.previousActiveDiagnosis,
    candidateDiagnosis: args.dominantDiagnosis,
    beliefs: args.beliefs,
  })
    ? args.dominantDiagnosis
    : args.previousActiveDiagnosis;
}

export function updateDiagnosisBeliefs(
  input: DiagnosisStateUpdateInput,
): DiagnosisStateUpdateResult {
  const updatedAt = input.updatedAt ?? nowIso();
  const interpretation = input.attemptInterpretation;
  const contractJudgment = input.contractJudgment ?? null;

  const baseDiagnosisDelta =
    contractJudgment?.diagnosis_delta ??
    interpretation.diagnosis_delta ??
    emptyDiagnosisDelta();

  const baseResolutionDelta = contractJudgment?.resolution_delta ?? emptyDiagnosisDelta();

  const sourceGroundedAdjustment = deriveSourceGroundedDiagnosisAdjustment({
    contractJudgment,
    fallbackTargetDiagnosis:
      contractJudgment?.suggested_active_diagnosis ??
      input.currentActiveDiagnosis ??
      null,
  });

  const diagnosisDelta = mergeDiagnosisDelta(
    baseDiagnosisDelta,
    sourceGroundedAdjustment.diagnosis_delta,
  );

  const resolutionDelta = mergeDiagnosisDelta(
    baseResolutionDelta,
    sourceGroundedAdjustment.resolution_delta,
  );

  const evidenceStrength = clamp01(
    contractJudgment?.evidence_strength ?? interpretation.evidence_strength,
  );

  const judgmentConfidence = clamp01(
    contractJudgment?.contract_confidence ?? interpretation.judgment_confidence,
  );

  const evidenceTier =
    contractJudgment?.evidence_tier ??
    (contractJudgment ? "contract_marker_estimate" : "generic_attempt_interpretation");

  const previousState = parsePreviousState(
    input.previousState,
    input.currentActiveDiagnosis ?? null,
  );

  const nextBeliefs = { ...previousState.beliefs } as DiagnosisBeliefMap;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    nextBeliefs[diagnosisType] = updateBeliefEntry({
      entry: previousState.beliefs[diagnosisType],
      rawDelta: getDeltaForDiagnosis(diagnosisDelta, diagnosisType),
      rawResolutionDelta: getDeltaForDiagnosis(resolutionDelta, diagnosisType),
      evidenceStrength,
      judgmentConfidence,
      updatedAt,
      evidenceTier,
    });
  }

  const dominantDiagnosis = getDominantDiagnosis(nextBeliefs);
  const activeDiagnosis = activeDiagnosisAfterUpdate({
    previousActiveDiagnosis: previousState.active_diagnosis,
    dominantDiagnosis,
    beliefs: nextBeliefs,
  });

  const reasons = [
    contractJudgment
      ? `Diagnosis state updated from ${contractJudgment.evidence_tier} contract judgment.`
      : `Diagnosis state updated from ${interpretation.modality} evidence.`,
    `Evidence outcome was ${interpretation.outcome}.`,
    contractJudgment ? `Contract outcome was ${contractJudgment.outcome}.` : null,
    `Evidence strength was ${evidenceStrength.toFixed(2)}.`,
    `Judgment confidence was ${judgmentConfidence.toFixed(2)}.`,
    sourceGroundedAdjustment.applied
      ? `Source-grounded diagnosis shaping applied with signal confidence ${sourceGroundedAdjustment.confidence.toFixed(
          2,
        )}.`
      : null,
    ...sourceGroundedAdjustment.reasons,
    ...sourceGroundedAdjustment.cautions.map(
      (caution) => `Source-grounded diagnosis caution: ${caution}`,
    ),
  ].filter((reason): reason is string => Boolean(reason));

  if (activeDiagnosis !== previousState.active_diagnosis) {
    reasons.push(
      `Active diagnosis moved from ${
        previousState.active_diagnosis ?? "none"
      } to ${activeDiagnosis ?? "none"}.`,
    );
  } else {
    reasons.push(
      `Active diagnosis stayed at ${activeDiagnosis ?? "none"} because no alternative passed the switch/clear threshold.`,
    );
  }

  const lastUpdate: DiagnosisStateLastUpdate = {
    source:
      input.source ??
      (contractJudgment ? "contract_judgment_v1_1" : "probe_submit_engine_evidence_v1_1"),
    attempt_id: interpretation.evidence_id,
    probe_id: interpretation.linked_probe_id,
    active_diagnosis_before: previousState.active_diagnosis,
    active_diagnosis_after: activeDiagnosis,
    diagnosis_delta: diagnosisDelta,
    resolution_delta: resolutionDelta,
    evidence_strength: evidenceStrength,
    judgment_confidence: judgmentConfidence,
    contract_id: contractJudgment?.contract_id ?? null,
    contract_outcome: contractJudgment?.outcome ?? null,
    contract_confidence: contractJudgment?.contract_confidence ?? null,
    evidence_tier: evidenceTier,
    updated_at: updatedAt,
    reasons,
  };

  const diagnosisState: DiagnosisState = {
    version: DIAGNOSIS_STATE_VERSION,
    active_diagnosis: activeDiagnosis,
    beliefs: nextBeliefs,
    last_update: lastUpdate,
    history: [...previousState.history, lastUpdate].slice(-12),
  };

  return {
    diagnosis_state: diagnosisState,
    active_diagnosis: activeDiagnosis,
    changed:
      JSON.stringify(previousState.beliefs) !== JSON.stringify(nextBeliefs) ||
      previousState.active_diagnosis !== activeDiagnosis,
    reasons,
  };
}

