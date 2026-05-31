import type { DiagnosisDelta, DiagnosisType } from "@/types/contracts";
import {
  DIAGNOSIS_STATE_VERSION,
  DIAGNOSIS_TYPES,
  type DiagnosisBeliefEntry,
  type DiagnosisBeliefMap,
  type DiagnosisState,
  type DiagnosisStateLastUpdate,
  type DiagnosisStateUpdateInput,
  type DiagnosisStateUpdateResult,
} from "./diagnosis-types";

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

function createBeliefEntry(args?: Partial<DiagnosisBeliefEntry>): DiagnosisBeliefEntry {
  return {
    belief: clamp01(args?.belief ?? 0.5),
    confidence: clamp01(args?.confidence ?? 0.08),
    evidence_count: Math.max(0, Math.floor(safeNumber(args?.evidence_count, 0))),
    last_delta: safeNumber(args?.last_delta, 0),
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
      updated_at: null,
    });
  }

  return beliefs;
}

function isDiagnosisType(value: unknown): value is DiagnosisType {
  return typeof value === "string" && DIAGNOSIS_TYPES.includes(value as DiagnosisType);
}

function parseBeliefEntry(value: unknown): DiagnosisBeliefEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<DiagnosisBeliefEntry>;

  return createBeliefEntry({
    belief: safeNumber(candidate.belief, 0.5),
    confidence: safeNumber(candidate.confidence, 0.08),
    evidence_count: safeNumber(candidate.evidence_count, 0),
    last_delta: safeNumber(candidate.last_delta, 0),
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
    const score = entry.belief * 0.72 + entry.confidence * 0.28;

    if (score > bestScore) {
      bestScore = score;
      bestType = diagnosisType;
    }
  }

  return bestType;
}

function shouldSwitchActiveDiagnosis(args: {
  previousActiveDiagnosis: DiagnosisType | null;
  candidateDiagnosis: DiagnosisType | null;
  beliefs: DiagnosisBeliefMap;
}) {
  if (!args.candidateDiagnosis) return false;
  if (!args.previousActiveDiagnosis) return true;
  if (args.candidateDiagnosis === args.previousActiveDiagnosis) return true;

  const current = args.beliefs[args.previousActiveDiagnosis];
  const candidate = args.beliefs[args.candidateDiagnosis];

  const currentScore = current.belief * 0.72 + current.confidence * 0.28;
  const candidateScore = candidate.belief * 0.72 + candidate.confidence * 0.28;

  /**
   * Hysteresis: require a meaningfully stronger new diagnosis before switching.
   * This prevents the active diagnosis label from bouncing between gaps.
   */
  return candidateScore >= currentScore + 0.08 && candidate.confidence >= 0.18;
}

function updateBeliefEntry(args: {
  entry: DiagnosisBeliefEntry;
  rawDelta: number;
  evidenceStrength: number;
  judgmentConfidence: number;
  updatedAt: string;
}) {
  const normalizedDelta = clamp01(args.rawDelta);
  const evidenceWeight = clamp01(
    0.06 + args.evidenceStrength * 0.12 + args.judgmentConfidence * 0.1,
  );

  /**
   * Positive deltas nudge belief upward. No delta does not strongly disprove a
   * gap yet; it only gently decays toward uncertainty.
   */
  const targetBelief =
    normalizedDelta > 0 ? clamp01(0.5 + normalizedDelta * 0.5) : 0.5;

  const belief =
    normalizedDelta > 0
      ? clamp01(args.entry.belief * (1 - evidenceWeight) + targetBelief * evidenceWeight)
      : clamp01(args.entry.belief * 0.985 + 0.5 * 0.015);

  const confidenceGain =
    normalizedDelta > 0 ? evidenceWeight * 0.72 : evidenceWeight * 0.14;

  return createBeliefEntry({
    belief,
    confidence: clamp01(args.entry.confidence + confidenceGain),
    evidence_count: args.entry.evidence_count + (normalizedDelta > 0 ? 1 : 0),
    last_delta: normalizedDelta,
    updated_at: args.updatedAt,
  });
}

export function updateDiagnosisBeliefs(
  input: DiagnosisStateUpdateInput,
): DiagnosisStateUpdateResult {
  const updatedAt = input.updatedAt ?? nowIso();
  const interpretation = input.attemptInterpretation;
  const diagnosisDelta = interpretation.diagnosis_delta ?? emptyDiagnosisDelta();

  const previousState = parsePreviousState(
    input.previousState,
    input.currentActiveDiagnosis ?? null,
  );

  const nextBeliefs = { ...previousState.beliefs } as DiagnosisBeliefMap;

  for (const diagnosisType of DIAGNOSIS_TYPES) {
    nextBeliefs[diagnosisType] = updateBeliefEntry({
      entry: previousState.beliefs[diagnosisType],
      rawDelta: getDeltaForDiagnosis(diagnosisDelta, diagnosisType),
      evidenceStrength: interpretation.evidence_strength,
      judgmentConfidence: interpretation.judgment_confidence,
      updatedAt,
    });
  }

  const dominantDiagnosis = getDominantDiagnosis(nextBeliefs);
  const activeDiagnosis = shouldSwitchActiveDiagnosis({
    previousActiveDiagnosis: previousState.active_diagnosis,
    candidateDiagnosis: dominantDiagnosis,
    beliefs: nextBeliefs,
  })
    ? dominantDiagnosis
    : previousState.active_diagnosis;

  const reasons = [
    `Diagnosis state updated from ${interpretation.modality} evidence.`,
    `Evidence outcome was ${interpretation.outcome}.`,
    `Evidence strength was ${interpretation.evidence_strength.toFixed(2)}.`,
    `Judgment confidence was ${interpretation.judgment_confidence.toFixed(2)}.`,
  ];

  if (activeDiagnosis !== previousState.active_diagnosis) {
    reasons.push(
      `Active diagnosis moved from ${
        previousState.active_diagnosis ?? "none"
      } to ${activeDiagnosis ?? "none"}.`,
    );
  } else {
    reasons.push(
      `Active diagnosis stayed at ${activeDiagnosis ?? "none"} because no alternative passed the switch threshold.`,
    );
  }

  const lastUpdate: DiagnosisStateLastUpdate = {
    source: input.source ?? "probe_submit_engine_evidence_v1",
    attempt_id: interpretation.evidence_id,
    probe_id: interpretation.linked_probe_id,
    active_diagnosis_before: previousState.active_diagnosis,
    active_diagnosis_after: activeDiagnosis,
    diagnosis_delta: diagnosisDelta,
    evidence_strength: interpretation.evidence_strength,
    judgment_confidence: interpretation.judgment_confidence,
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
