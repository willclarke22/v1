import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ISO8601String,
} from "@/types/contracts";
import type { AttemptInterpretation } from "@/archive/old-engine/evidence";
import type { ContractJudgment, EvidenceJudgingTier } from "@/archive/old-engine/judging";

/**
 * Diagnosis State V1.1
 *
 * JSON-backed diagnosis belief state for MyWay's first persistent diagnosis
 * brain layer.
 *
 * active_diagnosis remains the simple compatibility label.
 * beliefs keep a distribution across possible learner gaps.
 * confidence tracks evidence stability separately from belief direction.
 *
 * V1.1 adds room for resolution evidence and judgment provenance without
 * forcing every caller to provide those fields immediately.
 */

export const DIAGNOSIS_TYPES = [
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
] as const satisfies readonly DiagnosisType[];

export const DIAGNOSIS_STATE_VERSION = "diagnosis_state_v1_1" as const;

export type DiagnosisStateVersion = typeof DIAGNOSIS_STATE_VERSION;

export type DiagnosisBeliefStatus =
  | "uncertain"
  | "active"
  | "weakening"
  | "resolved";

export type DiagnosisEvidenceSource =
  | "probe_submit_engine_evidence_v1"
  | "probe_submit_engine_evidence_v1_1"
  | "contract_judgment_v1_1"
  | "manual_seed"
  | "unknown";

export type DiagnosisBeliefEntry = {
  /**
   * Estimated likelihood that this gap is currently part of the learner's block.
   */
  belief: number;

  /**
   * Evidence stability for the belief. Low confidence means the engine should
   * keep exploring and avoid overcommitting.
   */
  confidence: number;

  /**
   * Number of evidence events that directly updated this gap.
   */
  evidence_count: number;

  /**
   * Last normalized gap-pressure delta applied to this gap.
   */
  last_delta: number;

  /**
   * New in V1.1.
   *
   * Cumulative evidence that this gap is weakening or resolving.
   * This should be interpreted cautiously until update-diagnosis-beliefs is
   * upgraded to use contract judgment resolution_delta consistently.
   */
  resolution_pressure?: number;

  /**
   * New in V1.1.
   *
   * Last normalized resolution delta applied to this gap.
   */
  last_resolution_delta?: number;

  /**
   * New in V1.1.
   *
   * Lightweight status derived from belief, confidence, evidence_count, and
   * resolution pressure. This is a convenience label, not the source of truth.
   */
  status?: DiagnosisBeliefStatus;

  /**
   * New in V1.1.
   *
   * Strongest evidence tier that has contributed to this diagnosis belief.
   */
  strongest_evidence_tier?: EvidenceJudgingTier | null;

  /**
   * Last update timestamp for this specific gap.
   */
  updated_at: ISO8601String | null;
};

export type DiagnosisBeliefMap = Record<DiagnosisType, DiagnosisBeliefEntry>;

export type DiagnosisStateLastUpdate = {
  source: DiagnosisEvidenceSource;
  attempt_id: EntityId | null;
  probe_id: EntityId | null;
  active_diagnosis_before: DiagnosisType | null;
  active_diagnosis_after: DiagnosisType | null;

  /**
   * Gap-pressure evidence from generic interpretation and/or contract judgment.
   */
  diagnosis_delta: DiagnosisDelta;

  /**
   * New in V1.1.
   *
   * Evidence that a suspected gap may be resolving. This is intentionally
   * separate from diagnosis_delta so success does not merely mean "less failure."
   */
  resolution_delta?: DiagnosisDelta;

  evidence_strength: number;
  judgment_confidence: number;

  /**
   * New in V1.1.
   *
   * If a contract judgment was available, these fields preserve its provenance
   * so relationships and debug surfaces can distinguish weak estimates from
   * stronger deterministic/rubric judgments.
   */
  contract_id?: EntityId | null;
  contract_outcome?: ContractJudgment["outcome"] | null;
  contract_confidence?: number | null;
  evidence_tier?: EvidenceJudgingTier | null;

  updated_at: ISO8601String;
  reasons: string[];
};

export type DiagnosisState = {
  version: DiagnosisStateVersion;
  active_diagnosis: DiagnosisType | null;
  beliefs: DiagnosisBeliefMap;
  last_update: DiagnosisStateLastUpdate | null;
  history: DiagnosisStateLastUpdate[];
};

export type DiagnosisStateUpdateInput = {
  previousState?: unknown;
  currentActiveDiagnosis?: DiagnosisType | null;

  /**
   * Generic evidence interpretation remains the minimum required input.
   */
  attemptInterpretation: AttemptInterpretation;

  /**
   * New in V1.1.
   *
   * Optional contract-aware judgment. When provided, the diagnosis updater
   * should prefer the contract judgment's diagnosis_delta / resolution_delta /
   * confidence metadata over generic interpretation alone.
   */
  contractJudgment?: ContractJudgment | null;

  updatedAt?: ISO8601String | null;
  source?: DiagnosisStateLastUpdate["source"];
};

export type DiagnosisStateUpdateResult = {
  diagnosis_state: DiagnosisState;
  active_diagnosis: DiagnosisType | null;
  changed: boolean;
  reasons: string[];
};

