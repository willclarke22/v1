import type { DiagnosisType, ISO8601String } from "@/types/contracts";
import type {
  LearningSpaceRelationship,
  LearningSpaceRelationshipType,
} from "@/types/learning-space";
import type { TopicPosition3D } from "@/lib/learning-space/topic-position";

export type RelationshipGraphTopic = {
  id: string;
  topic_label: string;
  diagnosis?: DiagnosisType | null;
  confusion?: number | null;
  insight?: number | null;
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
   * A shared diagnosis relationship is too broad when both topics are one-touch
   * default/fallback topics. Require either enough evidence or supporting
   * confusion/insight similarity.
   */
  minMessageCountForDiagnosisOnly?: number;
  allowSharedDiagnosisWithSupportingSignals?: boolean;

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
