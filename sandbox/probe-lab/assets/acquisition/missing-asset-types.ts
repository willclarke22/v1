import type {
  MyWayAssetAppearanceRequestV1,
  MyWayAssetSourceType,
} from "../asset-types";

export type MissingAssetAcquisitionStatus =
  | "missing"
  | "searching_blenderkit"
  | "generating_trellis"
  | "awaiting_review"
  | "approved"
  | "unavailable";

export type MissingAssetAcquisitionProvider =
  | "blenderkit"
  | "trellis";

export type MissingAssetCandidateStatus =
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "superseded";

export type MissingAssetSceneReference = {
  scene_session_id: string;
  scene_id?: string | null;
  source:
    | "primitive_builder"
    | "visual_experience";
  title?: string | null;
  original_prompt?: string | null;
  requirement_instance_ids: string[];
  requested_at: string;
};

export type MissingAssetCandidateHistoryEntry = {
  asset_id: string;
  source_type: MyWayAssetSourceType;
  source_asset_id?: string | null;
  status: MissingAssetCandidateStatus;
  created_at: string;
  reviewed_at?: string | null;
  review_note?: string | null;
};

export type MissingAssetAcquisitionJob = {
  schema_version:
    "myway_missing_asset_acquisition_job_v1";
  job_id: string;
  concept_key: string;
  requirement_key: string;
  concept: string;
  aliases: string[];
  semantic_tags: string[];
  appearance_request?: MyWayAssetAppearanceRequestV1;
  domain: string;
  target_extent_m: number;
  status: MissingAssetAcquisitionStatus;
  active_provider:
    | MissingAssetAcquisitionProvider
    | null;
  current_candidate_asset_id: string | null;
  candidate_history:
    MissingAssetCandidateHistoryEntry[];
  excluded_source_asset_ids: string[];
  scene_references: MissingAssetSceneReference[];
  request_count: number;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type MissingAssetAcquisitionQueueV1 = {
  schema_version:
    "myway_missing_asset_acquisition_queue_v1";
  updated_at: string;
  jobs: MissingAssetAcquisitionJob[];
};

export type MissingAssetAcquisitionJobSummary =
  MissingAssetAcquisitionJob & {
    linked_scene_count: number;
    refresh_ready: boolean;
  };
