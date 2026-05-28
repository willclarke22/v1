import type { DiagnosisType, ISO8601String } from "@/types/contracts";
import type {
  LearningSpaceProjectionMetadata,
  LearningSpaceRelationship,
  LearningSpaceViewpoint,
} from "@/types/learning-space";
import type {
  TopicPosition3D,
  TopicPositionSource,
} from "@/lib/learning-space/topic-position";

export type TopicModelSignalStatus =
  | "pending"
  | "ready"
  | "unavailable"
  | "error"
  | "unknown";

export type TopicConfusionInsightStatus = {
  /**
   * Whether the displayed confusion / insight values are backed by a real
   * confusion-insight model score yet.
   *
   * New topics may briefly show provisional fallback values while the local
   * worker scores the structured v1_1 payload. During that window, UI should
   * usually show a loading state instead of treating the numeric values as
   * final model-backed signals.
   */
  status: TopicModelSignalStatus;

  /**
   * True when the top-level confusion/insight numbers are temporary fallback
   * values, usually from the foreground message route before the worker has
   * finished scoring.
   */
  isPending: boolean;

  /**
   * True when at least one real model-backed score has been persisted for this
   * topic.
   */
  hasModelScore: boolean;

  /**
   * True when the most recent persisted score used the structured v1_1 payload.
   */
  hasStructuredV1Score?: boolean;

  /**
   * Number of pending confusion/insight scoring queue items still waiting for
   * worker processing.
   */
  pendingCount?: number;

  /**
   * Number of real confusion/insight model signals already applied to this
   * topic.
   */
  signalCount?: number;

  /**
   * Audit metadata from topic_json.last_confusion_insight_score when available.
   */
  lastScore?: {
    scoreId?: string | null;
    processedAt?: ISO8601String | null;
    modelVersion?: string | null;
    inferenceMode?: "service" | "local" | string | null;
    modelConfusion?: number | null;
    modelInsight?: number | null;
    alphaApplied?: number | null;
    persistenceSource?: string | null;
    payloadShape?: "structured_v1_1" | "legacy_text" | string | null;
  } | null;
};

export type Topic = {
  id: string;
  topic_label: string;
  diagnosis: DiagnosisType;
  nextStep: string;
  confusion: number;
  insight: number;
  learningScore: number;

  /**
   * Runtime/model-signal status for confusion and insight.
   *
   * This lets UI distinguish real model-backed values from provisional fallback
   * values used while worker-mode scoring is still pending.
   */
  confusionInsightStatus?: TopicConfusionInsightStatus;

  /**
   * Current committed renderer position.
   * This should correspond to topic_position_x/y/z when persisted.
   */
  position: TopicPosition3D;

  /**
   * Optional semantic target position.
   * This should correspond to semantic_position_x/y/z when available.
   */
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: ISO8601String | null;
  positionSource?: TopicPositionSource;

  scale?: number;
  messageCount?: number;
  lastUpdated?: ISO8601String | null;
  hasAvailableProbe?: boolean;

  /**
   * Relationship/viewpoint layer carried through bootstrap refreshes.
   *
   * These are global learning-space structures, not topic-local facts. They are
   * attached to each bootstrapped topic only as a transport mechanism so
   * buildLearningSpace(topics) can reconstruct the full scene after realtime or
   * fallback-poll refreshes.
   *
   * In the next relationship-graph pass, these will be populated by a derived
   * relationship builder rather than manually authored clusters/links.
   */
  learningSpaceRelationships?: LearningSpaceRelationship[];
  learningSpaceViewpoints?: LearningSpaceViewpoint[];
  learningSpaceProjection?: LearningSpaceProjectionMetadata | null;
};

export function getTopicLabel(topic: Pick<Topic, "topic_label">): string {
  return topic.topic_label || "Untitled Topic";
}

export function isConfusionInsightPending(topic: Pick<Topic, "confusionInsightStatus">) {
  return topic.confusionInsightStatus?.isPending === true;
}

export function hasModelBackedConfusionInsight(
  topic: Pick<Topic, "confusionInsightStatus">,
) {
  return topic.confusionInsightStatus?.hasModelScore === true;
}
