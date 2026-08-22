import type { DirectorQualificationNormalizationPolicy } from "./director-qualification-normalization";

export const DIRECTOR_QUALIFICATION_SCHEMA_VERSION =
  "director_qualification_phase1b7a_v1" as const;

export const DIRECTOR_QUALIFICATION_COVERAGE_VERSION =
  "director_qualification_coverage_phase1b7a1_v1" as const;

export const DIRECTOR_QUALIFICATION_DECISIONS = [
  "unreviewed",
  "qualified",
  "fix",
  "merge_candidate",
  "redefine",
  "restrict",
  "retire",
  "blocked",
] as const;

export type DirectorQualificationDecision =
  (typeof DIRECTOR_QUALIFICATION_DECISIONS)[number];

export const DIRECTOR_QUALIFICATION_DECISION_LABELS: Record<
  DirectorQualificationDecision,
  string
> = {
  unreviewed: "Unreviewed",
  qualified: "Qualified",
  fix: "Fix",
  merge_candidate: "Merge candidate",
  redefine: "Redefine",
  restrict: "Restrict",
  retire: "Retire",
  blocked: "Blocked",
};

export type DirectorQualificationCoverageMode =
  | "baseline"
  | "cross_asset"
  | "full_cast";

export type DirectorQualificationPassKind =
  | "baseline"
  | "diversity"
  | "physical_stress";

export type DirectorQualificationCapabilityReview = {
  capability_id: string;
  decision: DirectorQualificationDecision;
  notes: string;
  evidence_run_id: string | null;
  updated_at: string | null;
};

export type DirectorQualificationState = {
  schema_version: typeof DIRECTOR_QUALIFICATION_SCHEMA_VERSION;
  reviews: Record<string, DirectorQualificationCapabilityReview>;
};

export type DirectorQualificationRunAsset = {
  cast_slot_id: string;
  role: string;
  asset_id: string | null;
  asset_label: string | null;
  facing_correction_degrees: number;
  normalization_policy: DirectorQualificationNormalizationPolicy;
  source_dimensions_m: [number, number, number] | null;
  source_largest_extent_m: number | null;
  logical_extent_m: number | null;
  logical_extent_source: string | null;
  target_extent_m: number;
  render_scale_multiplier: number | null;
  normalization_reason: string;
  normalization_warning: string | null;
  blocking_position: [number, number, number];
};

export type DirectorQualificationRunClip = {
  run_id: string;
  sequence_index: number;
  capability_id: string;
  capability_label: string;
  capability_group: string;
  family_key: string;
  family_label: string;
  scene_id: string;
  scene_version: string;
  primary_cast_slot_id: string;
  pass_kind: DirectorQualificationPassKind;
  normalization_policy: DirectorQualificationNormalizationPolicy;
  duration_ms: number;
  slate_ms: number;
  gap_ms: number;
  recording_start_offset_ms: number;
  relationship_direction_degrees: number | null;
  travel_direction: "forward" | "reverse" | null;
  evidence_block_label: string | null;
  qualification_note: string | null;
  merge_compare_with_capability_id: string | null;
  assets: DirectorQualificationRunAsset[];
};

export type DirectorQualificationRecordingManifest = {
  schema_version: typeof DIRECTOR_QUALIFICATION_SCHEMA_VERSION;
  coverage_version: typeof DIRECTOR_QUALIFICATION_COVERAGE_VERSION;
  reel_id: string;
  created_at: string;
  family_key: string;
  family_label: string;
  scene_id: string;
  scene_version: string;
  coverage_mode: DirectorQualificationCoverageMode;
  clip_count: number;
  distinct_asset_count: number;
  represented_cast_slots: string[];
  estimated_recording_duration_ms: number;
  clips: DirectorQualificationRunClip[];
};

export function emptyDirectorQualificationState(): DirectorQualificationState {
  return {
    schema_version: DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
    reviews: {},
  };
}

export function normalizeDirectorQualificationState(
  value: unknown,
): DirectorQualificationState {
  if (!value || typeof value !== "object") return emptyDirectorQualificationState();
  const input = value as Partial<DirectorQualificationState>;
  const reviews =
    input.reviews && typeof input.reviews === "object" ? input.reviews : {};

  const normalized: DirectorQualificationState["reviews"] = {};
  for (const [capabilityId, candidate] of Object.entries(reviews)) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Partial<DirectorQualificationCapabilityReview>;
    const decision = DIRECTOR_QUALIFICATION_DECISIONS.includes(
      record.decision as DirectorQualificationDecision,
    )
      ? (record.decision as DirectorQualificationDecision)
      : "unreviewed";
    normalized[capabilityId] = {
      capability_id: capabilityId,
      decision,
      notes: typeof record.notes === "string" ? record.notes : "",
      evidence_run_id:
        typeof record.evidence_run_id === "string"
          ? record.evidence_run_id
          : null,
      updated_at:
        typeof record.updated_at === "string" ? record.updated_at : null,
    };
  }

  return {
    schema_version: DIRECTOR_QUALIFICATION_SCHEMA_VERSION,
    reviews: normalized,
  };
}

export function qualificationReviewForCapability(
  state: DirectorQualificationState,
  capabilityId: string,
): DirectorQualificationCapabilityReview {
  return (
    state.reviews[capabilityId] ?? {
      capability_id: capabilityId,
      decision: "unreviewed",
      notes: "",
      evidence_run_id: null,
      updated_at: null,
    }
  );
}
