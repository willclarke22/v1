import type { AssetDirectabilityVec3 } from "./asset-directability-contract";

export const DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION =
  "myway_directable_asset_affordance_graph_v1" as const;

export const DIRECTABLE_ASSET_COMPILER_VERSION =
  "director_directable_asset_compiler_phase1b5b_v1" as const;

export const DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION =
  "myway_directable_asset_structure_inspection_v1" as const;

export const DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION =
  "myway_directable_asset_geometry_shape_inspection_v1" as const;

export const DIRECTABLE_ASSET_EVIDENCE_HARDENING_VERSION =
  "director_affordance_evidence_hardening_phase1b5b2_v1" as const;

export type DirectableAssetRollAxisCandidateV1 = {
  axis_name: "x" | "y" | "z";
  axis: AssetDirectabilityVec3;
  score: number;
  confidence: number;
  effective_radius_ratio: number;
  projected_span_ratio: number;
  axial_span_ratio: number;
  angular_coverage: number;
  boundary_circularity: number;
  axial_radius_variation?: number;
  axial_radius_symmetry?: number;
  rolling_profile?: "spherical" | "cylindrical" | "wheel_or_ring" | "tapered" | "irregular";
  runtime_model?: "constant_radius" | "approximate_only";
  note: string;
};

export type DirectableAssetTopOpeningCandidateV1 = {
  axis_name: "y";
  axis: AssetDirectabilityVec3;
  score: number;
  confidence: number;
  center_void_score: number;
  rim_angular_coverage: number;
  opening_size_ratio: [number, number];
  local_center?: AssetDirectabilityVec3;
  opening_size?: [number, number];
  access_direction: AssetDirectabilityVec3;
  note: string;
};

export type DirectableAssetGeometryShapeInspectionV1 = {
  schema_version: typeof DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION;
  source: "browser_gltf_surface_sample";
  sample_count: number;
  triangle_count: number;
  local_bounds_size: AssetDirectabilityVec3;
  roll_candidates: DirectableAssetRollAxisCandidateV1[];
  top_opening_candidates?: DirectableAssetTopOpeningCandidateV1[];
};

export type DirectableAssetStructureInspectionV1 = {
  schema_version: typeof DIRECTABLE_ASSET_STRUCTURE_INSPECTION_SCHEMA_VERSION;
  source: "browser_gltf" | "asset_pipeline";
  node_names: string[];
  mesh_names: string[];
  bone_names: string[];
  animation_clip_names: string[];
  geometry_shape?: DirectableAssetGeometryShapeInspectionV1 | null;
};

export type DirectableAssetEvidenceAuthority =
  | "verified_manual"
  | "measured_geometry"
  | "geometry_inference"
  | "asset_structure"
  | "asset_metadata"
  | "fallback";

export type DirectableAssetQualificationLevel =
  | "verified"
  | "measured"
  | "inferred"
  | "suggested"
  | "unknown"
  | "contradicted";

export type DirectableAssetEvidence = {
  source:
    | "manual_override"
    | "geometry_profile"
    | "geometry_inference"
    | "asset_metadata"
    | "fallback_bounds";
  authority: DirectableAssetEvidenceAuthority;
  confidence: number;
  qualification: DirectableAssetQualificationLevel;
  executable: boolean;
  note: string;
};

export type DirectableAssetAffordanceKind =
  | "root_transform"
  | "orientation_frame"
  | "semantic_forward_frame"
  | "ground_contact"
  | "surface_contact_region"
  | "support_surface"
  | "containment_candidate"
  | "containment_volume"
  | "attachment_port"
  | "socket_port"
  | "inlet_port"
  | "outlet_port"
  | "pivot_joint"
  | "semantic_subpart"
  | "rolling"
  | "rig"
  | "animation_clip";

export type DirectableAssetAffordanceCommon = {
  id: string;
  kind: DirectableAssetAffordanceKind;
  semantic_names: string[];
  target_scope: "root" | "subpart";
  subpart_id: string | null;
  evidence: DirectableAssetEvidence;
};

export type DirectableAssetRootTransformAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "root_transform";
  };

export type DirectableAssetOrientationAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "orientation_frame" | "semantic_forward_frame";
    up_axis: AssetDirectabilityVec3;
    forward_axis: AssetDirectabilityVec3;
  };

export type DirectableAssetGroundContactAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "ground_contact";
    local_position: AssetDirectabilityVec3;
    local_normal: AssetDirectabilityVec3 | null;
    contact_size: [number, number] | null;
  };

export type DirectableAssetSurfaceContactAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "surface_contact_region";
    local_position: AssetDirectabilityVec3;
    local_normal: AssetDirectabilityVec3 | null;
    size: [number, number] | null;
  };

export type DirectableAssetSurfaceAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "support_surface";
    local_center: AssetDirectabilityVec3;
    normal: AssetDirectabilityVec3;
    size: [number, number];
    usable_size: [number, number] | null;
    area_m2: number | null;
    clearance_above_m: number | null;
    blocked_fraction: number | null;
    viability_score: number;
    viability: "strong_candidate" | "candidate" | "weak";
    context_requirements: string[];
  };

export type DirectableAssetContainmentAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "containment_candidate" | "containment_volume";
    local_center: AssetDirectabilityVec3;
    size: AssetDirectabilityVec3;
    access_direction: AssetDirectabilityVec3 | null;
    openness: "open" | "enclosed" | "unknown";
    usability_score: number;
    derivation: "manual" | "measured_interior" | "semantic_plus_geometry";
  };

export type DirectableAssetPortAffordance =
  DirectableAssetAffordanceCommon & {
    kind:
      | "attachment_port"
      | "socket_port"
      | "inlet_port"
      | "outlet_port";
    local_position: AssetDirectabilityVec3;
    local_normal: AssetDirectabilityVec3 | null;
    /**
     * Measured usable aperture in the port plane when known. This is not
     * manufactured for semantic/manual ports that do not carry geometry.
     */
    opening_size: [number, number] | null;
  };

export type DirectableAssetPivotAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "pivot_joint";
    local_position: AssetDirectabilityVec3;
    axis: AssetDirectabilityVec3;
    min_degrees: number | null;
    max_degrees: number | null;
  };

export type DirectableAssetSubpartAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "semantic_subpart";
    node_name: string | null;
    capabilities: string[];
    pivot_id: string | null;
    anchor_ids: string[];
  };

export type DirectableAssetRollingAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "rolling";
    radius_m: number;
    axis: AssetDirectabilityVec3;
    local_center: AssetDirectabilityVec3 | null;
    derivation: "explicit" | "geometry_inference";
    geometry_score: number | null;
    default_pose: "ready" | "requires_reorientation" | "unknown";
    context_requirements: string[];
    rolling_profile: "spherical" | "cylindrical" | "wheel_or_ring" | "tapered" | "irregular";
    runtime_model: "constant_radius" | "approximate_only";
  };

export type DirectableAssetRigAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "rig";
    semantic_bone_count: number;
  };

export type DirectableAssetAnimationClipAffordance =
  DirectableAssetAffordanceCommon & {
    kind: "animation_clip";
    clip_name: string;
  };

export type DirectableAssetAffordanceNode =
  | DirectableAssetRootTransformAffordance
  | DirectableAssetOrientationAffordance
  | DirectableAssetGroundContactAffordance
  | DirectableAssetSurfaceContactAffordance
  | DirectableAssetSurfaceAffordance
  | DirectableAssetContainmentAffordance
  | DirectableAssetPortAffordance
  | DirectableAssetPivotAffordance
  | DirectableAssetSubpartAffordance
  | DirectableAssetRollingAffordance
  | DirectableAssetRigAffordance
  | DirectableAssetAnimationClipAffordance;

export type DirectableAssetSuggestion = {
  id: string;
  label: string;
  source: "asset_metadata";
  qualification: "suggested";
  executable: false;
  note: string;
};

export type DirectableAssetCompilationDiagnostics = {
  geometry_status: "measured" | "review_required" | "missing";
  directability_override_status: "present" | "missing";
  rig_status: "rigged" | "not_rigged";
  animation_clip_count: number;
  structure_status: "inspected" | "not_inspected";
  structure_node_count: number;
  structure_mesh_count: number;
  structure_bone_count: number;
  geometry_shape_status: "inspected" | "not_inspected";
  geometry_shape_sample_count: number;
  inferred_affordance_count: number;
  executable_affordance_count: number;
  suggestion_count: number;
  warnings: string[];
};

export type DirectableAssetAffordanceGraphV1 = {
  schema_version: typeof DIRECTABLE_ASSET_AFFORDANCE_GRAPH_SCHEMA_VERSION;
  compiler_version: typeof DIRECTABLE_ASSET_COMPILER_VERSION;
  asset_id: string;
  display_name: string;
  coordinate_space: "normalized_glb_y_up";
  local_bounds_size: AssetDirectabilityVec3;
  /**
   * Local center of the measured/known bounds. Phase 1B.5C uses this to align
   * whole-asset insertion candidates without assuming every GLB is centered
   * on its scene root.
   */
  local_bounds_center: AssetDirectabilityVec3;
  affordances: DirectableAssetAffordanceNode[];
  suggestions: DirectableAssetSuggestion[];
  diagnostics: DirectableAssetCompilationDiagnostics;
};

export function executableAffordances(
  graph: DirectableAssetAffordanceGraphV1,
) {
  return graph.affordances.filter((item) => item.evidence.executable);
}
