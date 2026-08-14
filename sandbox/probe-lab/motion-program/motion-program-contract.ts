import {
  DIRECTOR_ASSET_DIRECTABILITY_VERSION,
  type AssetDirectabilityRequirementResolution,
} from "../directability/asset-directability-contract";

export const MYWAY_MOTION_PROGRAM_SCHEMA_VERSION =
  "myway_motion_program_v1" as const;

export const MOTION_PROGRAM_FOUNDATION_VERSION =
  "director_universal_motion_program_phase1b4_2_v1" as const;

export const MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION =
  "director_relational_articulation_phase1b4_3_v1" as const;

export const MOTION_PROGRAM_SCENE_STATE_VERSION =
  "director_scene_state_phase1b4_4_v1" as const;

export const MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION =
  "director_multi_actor_choreography_phase1b4_5_v1" as const;

export const MOTION_PROGRAM_PROCESS_QUANTITY_VERSION =
  "director_process_quantity_phase1b4_6_v1" as const;

/**
 * Renderer-neutral execution channels. Phase 1B.4.6 executes transform,
 * orientation, and process channels. Articulation semantics are carried as recipes,
 * requirements, and declared state effects until asset-directability metadata
 * can resolve real subparts/anchors without pretending root motion is a rig.
 */
export const MOTION_PROGRAM_CHANNELS = [
  "transform",
  "orientation",
  "articulation",
  "skeletal",
  "deformation",
  "process",
  "physics",
  "camera",
  "lighting",
  "presentation",
] as const;

export const MOTION_PROGRAM_RUNTIME_CHANNELS = [
  "transform",
  "orientation",
  "process",
] as const;

export const MOTION_PROGRAM_COORDINATE_SPACES = [
  "world",
  "actor_local",
  "target_relative",
  "camera_relative",
  "screen_relative",
  "path_relative",
  "surface_relative",
] as const;

export const MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES = [
  "world",
  "actor_local",
  "target_relative",
] as const;

export const MOTION_PROGRAM_EASINGS = [
  "linear",
  "ease_in",
  "ease_out",
  "ease_in_out",
  "spring",
  "step",
] as const;

export const MOTION_PROGRAM_OPERATIONS = [
  "lerp_vector",
  "lerp_angle",
  "rotate_around_anchor",
  "sample_periodic",
  "sample_target_offset",
  "orient_axis_toward_target",
  "detach_from_target",
  "interpolate_quantity",
  "sample_flow_path",
  "emit_carriers",
] as const;

export type MotionProgramChannel =
  (typeof MOTION_PROGRAM_CHANNELS)[number];
export type MotionProgramRuntimeChannel =
  (typeof MOTION_PROGRAM_RUNTIME_CHANNELS)[number];
export type MotionProgramCoordinateSpace =
  (typeof MOTION_PROGRAM_COORDINATE_SPACES)[number];
export type MotionProgramEasing =
  (typeof MOTION_PROGRAM_EASINGS)[number];
export type MotionProgramOperation =
  (typeof MOTION_PROGRAM_OPERATIONS)[number];
export type MotionProgramVec3 = [number, number, number];
export type MotionProgramAxis = "x" | "y" | "z";
export type MotionProgramHorizontalAxis = "x" | "z";
export type MotionProgramBlendMode = "replace" | "additive";

export type MotionProgramTrackBase = {
  id: string;
  target_entity_id: string;
  channel: MotionProgramChannel;
  operation: MotionProgramOperation;
  start_progress: number;
  end_progress: number;
  easing: MotionProgramEasing;
  coordinate_space: MotionProgramCoordinateSpace;
  /** Stable authoring/application order for overlapping tracks. */
  order: number;
  /** Used by the generalized reverse composition operator. */
  reverse_progress?: boolean;
  /** Allows semantic pre-state tracks such as Close to expose their from-pose before the event window begins. */
  apply_before_start?: boolean;
};

export type MotionProgramVectorLerpTrack = MotionProgramTrackBase & {
  channel: "transform";
  operation: "lerp_vector";
  parameters: {
    property: "position";
    from: MotionProgramVec3;
    to: MotionProgramVec3;
    blend: MotionProgramBlendMode;
  };
};

export type MotionProgramAngleLerpTrack = MotionProgramTrackBase & {
  channel: "orientation";
  operation: "lerp_angle";
  parameters: {
    axis: MotionProgramAxis;
    from_radians: number;
    to_radians: number;
    blend: MotionProgramBlendMode;
  };
};

export type MotionProgramRotateAroundAnchorTrack = MotionProgramTrackBase & {
  channel: "transform";
  operation: "rotate_around_anchor";
  parameters: {
    origin: MotionProgramVec3;
    anchor: MotionProgramVec3;
    axis: MotionProgramAxis;
    from_radians: number;
    to_radians: number;
    rotate_orientation: boolean;
    /** Canonical zero-angle orientation for persistent articulation reconstruction. */
    origin_rotation?: MotionProgramVec3;
  };
};

export type MotionProgramPeriodicTrack = MotionProgramTrackBase & {
  channel: "transform";
  operation: "sample_periodic";
  parameters: {
    property: "position";
    origin: MotionProgramVec3;
    direction: MotionProgramVec3;
    amplitude: number;
    cycles: number;
    phase_radians: number;
  };
};

export type MotionProgramTargetOffsetTrack = MotionProgramTrackBase & {
  channel: "transform";
  operation: "sample_target_offset";
  coordinate_space: "target_relative";
  parameters: {
    target_entity_id: string;
    origin: MotionProgramVec3;
    offset: MotionProgramVec3;
    mode: "approach" | "replace";
  };
};

export type MotionProgramOrientAxisTowardTargetTrack =
  MotionProgramTrackBase & {
    channel: "orientation";
    operation: "orient_axis_toward_target";
    coordinate_space: "target_relative";
    parameters: {
      target_entity_id: string;
      axis: MotionProgramHorizontalAxis;
      from_yaw_radians: number;
    };
  };

export type MotionProgramDetachFromTargetTrack = MotionProgramTrackBase & {
  channel: "transform";
  operation: "detach_from_target";
  coordinate_space: "target_relative";
  parameters: {
    target_entity_id: string;
    fallback_origin: MotionProgramVec3;
    attachment_offset: MotionProgramVec3;
    explicit_direction: MotionProgramVec3 | null;
    distance: number;
  };
};

export type MotionProgramQuantityTrack = MotionProgramTrackBase & {
  channel: "process";
  operation: "interpolate_quantity";
  parameters: {
    quantity_key: string;
    from: number;
    to: number;
  };
};

export type MotionProgramFlowPathTrack = MotionProgramTrackBase & {
  channel: "process";
  operation: "sample_flow_path";
  parameters: {
    source_entity_id: string;
    destination_entity_id: string | null;
    route_points: MotionProgramVec3[];
    fallback_destination: MotionProgramVec3;
    carrier_count: number;
  };
};

export type MotionProgramEmitCarriersTrack = MotionProgramTrackBase & {
  channel: "process";
  operation: "emit_carriers";
  parameters: {
    source_entity_id: string;
    origin: MotionProgramVec3;
    direction: MotionProgramVec3;
    distance: number;
    carrier_count: number;
    spread_radians: number;
  };
};

export type MotionProgramTrack =
  | MotionProgramVectorLerpTrack
  | MotionProgramAngleLerpTrack
  | MotionProgramRotateAroundAnchorTrack
  | MotionProgramPeriodicTrack
  | MotionProgramTargetOffsetTrack
  | MotionProgramOrientAxisTowardTargetTrack
  | MotionProgramDetachFromTargetTrack
  | MotionProgramQuantityTrack
  | MotionProgramFlowPathTrack
  | MotionProgramEmitCarriersTrack;

export type MotionProgramConstraint = {
  id: string;
  kind: string;
  target_entity_id: string;
  parameters: Record<string, unknown>;
  runtime_status: "declared" | "supported";
};

export type MotionProgramStateEffect = {
  id: string;
  target_entity_id: string;
  kind: string;
  parameters: Record<string, unknown>;
  runtime_status: "declared" | "supported";
};

export type MotionProgramDirectabilityRequirement = {
  id: string;
  target_entity_id: string;
  kind:
    | "anchor"
    | "axis"
    | "subpart"
    | "surface"
    | "rig"
    | "animation_clip"
    | "geometry_region"
    | "other";
  semantic_name: string;
  required: boolean;
  runtime_status: "declared" | "resolved";
};

export type MotionProgramDiagnostics = {
  foundation_version: typeof MOTION_PROGRAM_FOUNDATION_VERSION;
  strengthening_version?:
    | typeof MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION
    | null;
  scene_state_version?:
    | typeof MOTION_PROGRAM_SCENE_STATE_VERSION
    | null;
  choreography_version?:
    | typeof MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION
    | null;
  process_version?:
    | typeof MOTION_PROGRAM_PROCESS_QUANTITY_VERSION
    | null;
  directability_version?:
    | typeof DIRECTOR_ASSET_DIRECTABILITY_VERSION
    | null;
  directability?: {
    profile_present: boolean;
    profile_asset_id: string | null;
    resolved_requirement_ids: string[];
    unresolved_required_requirement_ids: string[];
    unresolved_optional_requirement_ids: string[];
    resolutions: AssetDirectabilityRequirementResolution[];
  };
  source_kind: "director_events" | "synthetic";
  source_event_ids: string[];
  compiled_event_ids: string[];
  ignored_event_ids: string[];
  unsupported_event_ids: string[];
  recipe_ids?: string[];
  supported_runtime_channels: MotionProgramRuntimeChannel[];
  supported_coordinate_spaces: Array<
    (typeof MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES)[number]
  >;
  warnings: string[];
  legacy_fallback_required: boolean;
};

export type MyWayMotionProgramV1 = {
  schema_version: typeof MYWAY_MOTION_PROGRAM_SCHEMA_VERSION;
  program_id: string;
  duration_ms: number;
  target_entity_id: string;
  tracks: MotionProgramTrack[];
  constraints: MotionProgramConstraint[];
  state_effects: MotionProgramStateEffect[];
  requirements: MotionProgramDirectabilityRequirement[];
  diagnostics: MotionProgramDiagnostics;
};

export type MotionProgramInitialState = {
  position: MotionProgramVec3;
  rotation: MotionProgramVec3;
  scale: MotionProgramVec3;
};

export type MotionProgramSampleContext = {
  sample_entity_state?: (
    entityId: string,
    progress: number,
  ) => MotionProgramInitialState | null;
};

export type MotionProgramProcessCarrierSample = {
  id: string;
  source_entity_id: string;
  destination_entity_id: string | null;
  position: MotionProgramVec3;
  progress: number;
};

export type MotionProgramProcessSample = {
  quantities: Record<string, number>;
  carriers: MotionProgramProcessCarrierSample[];
  active_process_track_ids: string[];
};

export type MotionProgramSample = MotionProgramInitialState & {
  progress: number;
  applied_track_ids: string[];
  process: MotionProgramProcessSample;
  diagnostics: {
    finite: boolean;
    unsupported_track_ids: string[];
  };
};
