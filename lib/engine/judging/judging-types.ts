import type {
  DiagnosisDelta,
  DiagnosisType,
  EntityId,
  ISO8601String,
  ProbeContractSnapshot,
} from "@/types/contracts";
import type { AttemptInterpretation } from "@/lib/engine/evidence";

/**
 * Contract Judging V1
 *
 * This module is the bridge between:
 * - generic evidence interpretation
 * - Probe Contract V1 success/failure markers
 * - diagnosis-state updates
 *
 * V1 is conservative. It does not replace route scoring yet. It produces an
 * inspectable contract-aware judgment that can later feed diagnosis deltas,
 * probe policy, and renderer-specific scoring.
 */

export const CONTRACT_JUDGING_VERSION = "contract_judging_v1" as const;

export type ContractJudgingVersion = typeof CONTRACT_JUDGING_VERSION;

export type ContractJudgmentOutcome =
  | "contract_success"
  | "contract_partial"
  | "contract_failure"
  | "insufficient_evidence"
  | "no_contract";

export type ContractMarkerMatch = {
  marker_id: EntityId | null;
  label: string;
  description: string | null;
  match_score: number;
  weight: number;
  required: boolean;
  reasons: string[];
};

export type ContractFailureMatch = {
  marker_id: EntityId | null;
  label: string;
  description: string | null;
  match_score: number;
  severity: number;
  maps_to_diagnosis: DiagnosisType | null;
  diagnosis_delta: DiagnosisDelta;
  reasons: string[];
};

export type ContractMisconceptionMatch = {
  misconception_id: EntityId | null;
  label: string;
  description: string | null;
  likely_diagnosis: DiagnosisType | null;
  match_score: number;
  reasons: string[];
};

export type ContractJudgingInput = {
  attemptInterpretation: AttemptInterpretation;
  probeContractSnapshot?: ProbeContractSnapshot | null;
  judgedAt?: ISO8601String | null;
};

export type ContractJudgment = {
  version: ContractJudgingVersion;
  judged_at: ISO8601String;

  contract_id: EntityId | null;
  probe_id: EntityId | null;
  topic_id: EntityId | null;

  outcome: ContractJudgmentOutcome;
  contract_confidence: number;
  evidence_strength: number;

  success_score: number;
  failure_score: number;
  misconception_score: number;

  success_marker_matches: ContractMarkerMatch[];
  failure_marker_matches: ContractFailureMatch[];
  misconception_matches: ContractMisconceptionMatch[];

  diagnosis_delta: DiagnosisDelta;
  suggested_active_diagnosis: DiagnosisType | null;

  reasons: string[];
  cautions: string[];

  /**
   * Original generic evidence interpretation kept for audit/debug.
   */
  evidence_interpretation_snapshot: AttemptInterpretation;
};
