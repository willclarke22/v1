import type { DiagnosisType, ISO8601String } from "@/types/contracts";
import type {
  LearningSpaceRelationship,
  LearningSpaceRelationshipType,
} from "@/types/learning-space";
import type { TopicPosition3D } from "@/lib/learning-space/topic-position";

/**
 * Relationship Graph Types V1.1
 *
 * The relationship graph is a derived learning-space layer. It should not
 * become the authoritative learning state.
 *
 * V1.1 keeps the existing shallow topic fields for backward compatibility, but
 * adds optional evidence-aware diagnosis fields so shared diagnosis
 * relationships can be based on belief/confidence/evidence_count instead of
 * message count alone.
 *
 * This file is learning-space-local. It must not import archive/old-engine.
 */

export type DiagnosisBeliefStatus = string;

export type RelationshipEvidenceTier =
  | "model_only"
  | "message_average"
  | "generic_attempt_interpretation"
  | "contract_marker_estimate"
  | "deterministic_structured_judgment"
  | "llm_rubric_judgment"
  | "hybrid_structured_and_rubric_judgment"
  | "repeated_judged_pattern"
  | "unknown";

/**
 * Local projection-only equivalent of the evidence tier label formerly imported
 * from the archived judging code.
 */
export type EvidenceJudgingTier = RelationshipEvidenceTier;

/**
 * Local projection-only diagnosis belief entry shape.
 *
 * Runtime diagnosis persistence can keep extra fields. The relationship graph
 * only needs these stable fields to derive relationship evidence.
 */
export type DiagnosisBeliefEntry = {
  belief?: number | null;
  confidence?: number | null;
  evidence_count?: number | null;
  resolution_pressure?: number | null;
  status?: DiagnosisBeliefStatus | null;
  evidence_judging_tier?: EvidenceJudgingTier | null;
  strongest_evidence_tier?: EvidenceJudgingTier | null;
  updated_at?: ISO8601String | string | null;
  [key: string]: unknown;
};

/**
 * Local projection-only diagnosis state shape.
 *
 * build-learning-space only reads stable fields from topic_json; diagnosis
 * updating remains owned by the runtime/state layer.
 */
export type DiagnosisState = {
  version: string;
  active_diagnosis: DiagnosisType | null;
  beliefs: Record<string, DiagnosisBeliefEntry | undefined>;
  history: unknown[];
  [key: string]: unknown;
};

export type RelationshipDiagnosisEvidence = {
  active_diagnosis: DiagnosisType | null;
  belief: number | null;
  confidence: number | null;
  evidence_count: number | null;
  resolution_pressure?: number | null;
  status?: DiagnosisBeliefStatus | null;
  strongest_evidence_tier?: EvidenceJudgingTier | null;
  last_updated_at?: ISO8601String | null;
};

export type RelationshipSignalEvidence = {
  value: number | null;
  confidence?: number | null;
  evidence_count?: number | null;
  source?: string | null;
  updated_at?: ISO8601String | null;
};

export type RelationshipGraphTopic = {
  id: string;
  topic_label: string;

  /**
   * Backward-compatible shallow active diagnosis label.
   *
   * Prefer diagnosisEvidence when available.
   */
  diagnosis?: DiagnosisType | null;

  /**
   * Optional richer diagnosis state. The relationship builder can derive
   * diagnosisEvidence from this if a caller has not already flattened it.
   */
  diagnosisState?: DiagnosisState | null;

  /**
   * Preferred V1.1 relationship-facing diagnosis summary.
   */
  diagnosisEvidence?: RelationshipDiagnosisEvidence | null;

  /**
   * Backward-compatible shallow signal averages.
   */
  confusion?: number | null;
  insight?: number | null;

  /**
   * Optional richer signal summaries for future relationship confidence.
   */
  confusionEvidence?: RelationshipSignalEvidence | null;
  insightEvidence?: RelationshipSignalEvidence | null;

  learningScore?: number | null;
  position: TopicPosition3D;
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: ISO8601String | null;
  messageCount?: number | null;
};

export type BuiltTopicRelationshipType = Extract<
  LearningSpaceRelationshipType,
  | "shared_diagnosis"
  | "shared_confusion_pattern"
  | "shared_insight_pattern"
>;

export type RelationshipGraphBuildOptions = {
  /**
   * Global cap for derived non-semantic relationships.
   */
  maxRelationships?: number;

  /**
   * Per-topic cap so one broad/default state cannot connect every topic to
   * every other topic.
   *
   * In the current type-balanced builder, this cap is applied per topic AND per
   * relationship type. This lets the sidebar lenses work independently: strong
   * confusion relationships should not consume the whole budget before insight
   * relationships get a chance to appear.
   */
  maxRelationshipsPerTopic?: number;

  /**
   * Maximum allowed value gap for confusion/insight pattern relationships.
   */
  maxConfusionGap?: number;
  maxInsightGap?: number;

  /**
   * Minimum average signal required before a shared confusion/insight pattern is
   * meaningful enough to emit.
   */
  minAverageConfusionForPattern?: number;
  minAverageInsightForPattern?: number;

  /**
   * Weak relationships below this strength are omitted.
   *
   * Some relationship types may use softer visual-test thresholds inside the
   * builder while their underlying model is still being calibrated. Those links
   * remain hidden by default and non-layout-affecting.
   */
  minStrength?: number;

  /**
   * Legacy fallback gate for shared diagnosis when richer diagnosisEvidence is
   * unavailable.
   */
  minMessageCountForDiagnosisOnly?: number;
  allowSharedDiagnosisWithSupportingSignals?: boolean;

  /**
   * V1.1 evidence-aware shared diagnosis gates.
   *
   * These should be used when diagnosisEvidence / diagnosisState is available.
   */
  minDiagnosisBeliefForSharedDiagnosis?: number;
  minDiagnosisConfidenceForSharedDiagnosis?: number;
  minDiagnosisEvidenceCountForSharedDiagnosis?: number;
  allowWeakeningDiagnosisRelationships?: boolean;
  allowResolvedDiagnosisRelationships?: boolean;

  generatedAt?: ISO8601String | null;
};

export type RelationshipGraphCandidate = {
  relationship_type: BuiltTopicRelationshipType;
  source_topic_id: string;
  target_topic_id: string;
  source_topic_label: string;
  target_topic_label: string;
  strength: number;
  confidence: number;
  evidence_count: number;
  evidence_source: string[];
  evidence_summary: string | null;
  reasons: string[];
  affects_layout: boolean;
  visible_by_default: boolean;
  diagnostic_method: string;

  /**
   * V1.1.
   *
   * Lets renderers/debug surfaces distinguish weak model/signal relationships
   * from stronger judged evidence-backed relationships.
   */
  evidence_tier?: RelationshipEvidenceTier;

  /**
   * V1.1.
   *
   * Optional detail for shared diagnosis relationships.
   */
  diagnosis_type?: DiagnosisType | null;
  diagnosis_belief?: number | null;
  diagnosis_confidence?: number | null;
  diagnosis_status?: DiagnosisBeliefStatus | null;

  /**
   * V1.1.
   *
   * Optional raw signal basis for confusion/insight relationships.
   */
  signal_gap?: number | null;
  signal_average?: number | null;
  signal_similarity?: number | null;

  /**
   * Caps are applied per topic across derived relationships.
   */
  participating_topic_ids: [string, string];
};

export type RelationshipGraphBuildResult = {
  relationships: LearningSpaceRelationship[];
  generated_at: ISO8601String | null;
  candidate_count: number;
  emitted_count: number;
  omitted_count: number;
};
