import type { AssetDirectabilityVec3 } from "./asset-directability-contract";
import type {
  DirectableAssetQualificationLevel,
} from "./affordance-graph-contract";

export const DIRECTABLE_ASSET_PAIR_INTERACTION_SCHEMA_VERSION =
  "myway_directable_asset_pair_interaction_resolution_v1" as const;

export const DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION =
  "director_asset_pair_interaction_resolver_phase1b5c2_v1" as const;

export const DIRECTABLE_ASSET_PAIR_FIT_HARDENING_VERSION =
  "director_scene_scale_pair_fit_hardening_phase1b5c2_v1" as const;

export type DirectableAssetPairInteractionId =
  | "place_on"
  | "surface_attach"
  | "precise_attach"
  | "insert"
  | "flow";

export const DIRECTABLE_ASSET_PAIR_INTERACTION_IDS = [
  "place_on",
  "surface_attach",
  "precise_attach",
  "insert",
  "flow",
] as const satisfies readonly DirectableAssetPairInteractionId[];

export type DirectableAssetPairResolutionStatus =
  | "resolved_candidate"
  | "contextual_candidate"
  | "requires_asset_authoring"
  | "fallback_only";

export type DirectableAssetPairRelationshipType =
  | "support_contact"
  | "persistent_attachment"
  | "containment_membership"
  | "directed_flow_link";

export type DirectableAssetPairRelationshipActivationState = "proposed";

export type DirectableAssetPairRelationshipPlan = {
  type: DirectableAssetPairRelationshipType;
  activation_state: DirectableAssetPairRelationshipActivationState;
  persistent_after_activation: boolean;
  source_follows_target_after_activation: boolean;
  inverse_operation: "detach" | "remove" | null;
  source_evidence_id: string | null;
  target_evidence_id: string | null;
  activation_requirements: string[];
  note: string;
};

export type DirectableAssetPairScaleAuthority =
  | "scene_instance"
  | "explicit_context"
  | "asset_baseline"
  | "assumed_unit";

export type DirectableAssetPairContextV1 = {
  /**
   * Optional final/scenario dimensions. When supplied they take precedence over
   * raw scale and let the resolver compare pair geometry in scene metres.
   */
  source_dimensions_m?: AssetDirectabilityVec3 | null;
  target_dimensions_m?: AssetDirectabilityVec3 | null;

  /**
   * Dimensions without an explicit authority are treated conservatively as
   * Asset Library baseline dimensions. Runtime/Director callers that know final
   * scene dimensions must opt into `scene_instance` or `explicit_context`.
   */
  source_dimensions_authority?: Exclude<
    DirectableAssetPairScaleAuthority,
    "assumed_unit"
  > | null;
  target_dimensions_authority?: Exclude<
    DirectableAssetPairScaleAuthority,
    "assumed_unit"
  > | null;

  /**
   * Optional instance scale vectors. Explicit scale defaults to
   * `scene_instance` authority because it is expected to come from a resolved
   * scene actor. Callers may override that authority when using preview data.
   */
  source_scale?: AssetDirectabilityVec3 | null;
  target_scale?: AssetDirectabilityVec3 | null;
  source_scale_authority?: Exclude<
    DirectableAssetPairScaleAuthority,
    "assumed_unit"
  > | null;
  target_scale_authority?: Exclude<
    DirectableAssetPairScaleAuthority,
    "assumed_unit"
  > | null;

  clearance_m?: number | null;
  requested_source_semantic?: string | null;
  requested_target_semantic?: string | null;
  medium?: string | null;
};

export type DirectableAssetPairEvidenceSelection = {
  source_evidence_ids: string[];
  target_evidence_ids: string[];
  source_qualification_levels: DirectableAssetQualificationLevel[];
  target_qualification_levels: DirectableAssetQualificationLevel[];
  source_confidence: number | null;
  target_confidence: number | null;
  shared_semantic_tokens: string[];
};

export type DirectableAssetPairFitAssessment = {
  mode:
    | "surface_2d"
    | "volume_3d"
    | "semantic_port"
    | "directed_route"
    | "not_applicable";
  fits: boolean | null;
  score: number | null;
  source_size_m: number[] | null;
  target_size_m: number[] | null;
  margin_m: number[] | null;
  orientation_variant: string | null;
  note: string;
};

export type DirectableAssetPairCandidateTransform = {
  coordinate_space: "target_scaled_local";
  source_origin_translation_m: AssetDirectabilityVec3;
  source_rotation_quaternion_xyzw: [number, number, number, number];
  source_anchor_local_m: AssetDirectabilityVec3;
  target_anchor_local_m: AssetDirectabilityVec3;
  source_normal_local: AssetDirectabilityVec3 | null;
  target_normal_local: AssetDirectabilityVec3 | null;
  alignment_rule:
    | "source_up_to_target_normal"
    | "opposed_contact_normals"
    | "source_anchor_to_target_anchor"
    | "target_access_axis"
    | "none";
  note: string;
};

export type DirectableAssetPairRoutePlan = {
  source_point_local_m: AssetDirectabilityVec3;
  target_point_local_m: AssetDirectabilityVec3;
  source_direction_local: AssetDirectabilityVec3 | null;
  target_access_direction_local: AssetDirectabilityVec3 | null;
  route_mode: "direct_segment_candidate";
  note: string;
};

export type DirectableAssetPairResolutionDiagnostics = {
  source_scale_source: DirectableAssetPairScaleAuthority;
  target_scale_source: DirectableAssetPairScaleAuthority;
  candidate_count: number;
  rejected_candidate_count: number;
  warnings: string[];
};

export type DirectableAssetPairInteractionResolutionV1 = {
  schema_version: typeof DIRECTABLE_ASSET_PAIR_INTERACTION_SCHEMA_VERSION;
  resolver_version: typeof DIRECTABLE_ASSET_PAIR_RESOLVER_VERSION;
  interaction_id: DirectableAssetPairInteractionId;
  label: string;
  source_asset_id: string;
  target_asset_id: string;
  status: DirectableAssetPairResolutionStatus;
  score: number | null;
  evidence: DirectableAssetPairEvidenceSelection;
  fit: DirectableAssetPairFitAssessment;
  candidate_transform: DirectableAssetPairCandidateTransform | null;
  route: DirectableAssetPairRoutePlan | null;
  proposed_relationship: DirectableAssetPairRelationshipPlan | null;
  context_requirements: string[];
  builder_validation_handoff: string[];
  missing_requirements: string[];
  note: string;
  diagnostics: DirectableAssetPairResolutionDiagnostics;
};
