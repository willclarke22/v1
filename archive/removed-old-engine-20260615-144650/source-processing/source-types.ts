import type {
  EntityId,
  ISO8601String,
  LearningSourceKind,
  LearningSourceProcessingStatus,
  LearningSourceRightsScope,
  LearningSourceTrustLevel,
} from "@/types/contracts";

/**
 * Source Processing V1
 *
 * This layer is the bridge from user/course/source material into grounded
 * MyWay learning objects.
 *
 * It does not author probe contracts yet. It only normalizes source material
 * into safe, inspectable source records and chunks that future probe-authoring
 * code can use.
 */

export const SOURCE_PROCESSING_VERSION = "source_processing_v1" as const;

export type SourceProcessingVersion = typeof SOURCE_PROCESSING_VERSION;

export type RawLearningSourceInput = {
  source_id?: EntityId | null;
  source_kind: LearningSourceKind;
  title?: string | null;
  text: string;
  origin_label?: string | null;
  rights_scope?: LearningSourceRightsScope | null;
  trust_level?: LearningSourceTrustLevel | null;
  topic_labels?: string[] | null;
  created_at?: ISO8601String | null;
};

export type NormalizedLearningSource = {
  source_id: EntityId;
  source_kind: LearningSourceKind;
  source_title: string;
  origin_label: string | null;
  rights_scope: LearningSourceRightsScope;
  trust_level: LearningSourceTrustLevel;
  processing_status: LearningSourceProcessingStatus;
  created_at: ISO8601String;
  topic_labels: string[];
  text_length: number;
  chunk_count: number;
  usable_for_probe_authoring: boolean;
  usable_for_strong_correctness_claims: boolean;
  reasons: string[];
  cautions: string[];
};

export type NormalizedLearningSourceChunk = {
  chunk_id: EntityId;
  source_id: EntityId;
  source_kind: LearningSourceKind;
  source_title: string;
  chunk_index: number;
  text: string;
  character_start: number;
  character_end: number;
  topic_labels: string[];
  rights_scope: LearningSourceRightsScope;
  trust_level: LearningSourceTrustLevel;
  confidence: number;
  usable_for_probe_authoring: boolean;
  usable_for_strong_correctness_claims: boolean;
  source_summary: string | null;
  reasons: string[];
  cautions: string[];
};

export type NormalizeSourceInputOptions = {
  max_chunk_chars?: number;
  min_chunk_chars?: number;
};

export type NormalizeSourceInputResult = {
  version: SourceProcessingVersion;
  source: NormalizedLearningSource;
  chunks: NormalizedLearningSourceChunk[];
};
