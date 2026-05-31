import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ISO8601String,
} from "@/types/contracts";
import type { AttemptInterpretation } from "@/lib/engine/evidence";

/**
 * Diagnosis State V1
 *
 * JSON-backed diagnosis belief state for MyWay's first persistent diagnosis
 * brain layer.
 *
 * active_diagnosis remains the simple compatibility label.
 * beliefs keep a distribution across possible learner gaps.
 * confidence tracks evidence stability separately from belief direction.
 */

export const DIAGNOSIS_TYPES = [
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
] as const satisfies readonly DiagnosisType[];

export const DIAGNOSIS_STATE_VERSION = "diagnosis_state_v1" as const;

export type DiagnosisStateVersion = typeof DIAGNOSIS_STATE_VERSION;

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
   * Last normalized delta applied to this gap.
   */
  last_delta: number;

  /**
   * Last update timestamp for this specific gap.
   */
  updated_at: ISO8601String | null;
};

export type DiagnosisBeliefMap = Record<DiagnosisType, DiagnosisBeliefEntry>;

export type DiagnosisStateLastUpdate = {
  source: "probe_submit_engine_evidence_v1" | "manual_seed" | "unknown";
  attempt_id: EntityId | null;
  probe_id: EntityId | null;
  active_diagnosis_before: DiagnosisType | null;
  active_diagnosis_after: DiagnosisType | null;
  diagnosis_delta: DiagnosisDelta;
  evidence_strength: number;
  judgment_confidence: number;
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
  attemptInterpretation: AttemptInterpretation;
  updatedAt?: ISO8601String | null;
  source?: DiagnosisStateLastUpdate["source"];
};

export type DiagnosisStateUpdateResult = {
  diagnosis_state: DiagnosisState;
  active_diagnosis: DiagnosisType | null;
  changed: boolean;
  reasons: string[];
};
