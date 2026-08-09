export const DIRECTOR_REPRESENTATION_MODES = [
  "literal_3d",
  "mechanistic_3d",
  "animated_diagram",
  "graph_symbolic",
  "mixed_representation",
] as const;

export const DIRECTOR_ACTOR_KINDS = [
  "physical_asset",
  "procedural_effect",
  "diagrammatic_actor",
  "path",
  "label",
  "symbolic_actor",
  "any",
] as const;

export const DIRECTOR_FALLBACK_REPRESENTATIONS = [
  "diagrammatic_proxy",
  "abstract_proxy",
  "path_or_label",
  "preserve_direction_without_actor",
  "none",
] as const;

/**
 * Renderer-neutral semantic behaviours. These are verbs the Director may use;
 * renderer-specific controllers decide how to execute them against real assets.
 */
export const DIRECTOR_BEHAVIOURS = [
  "show",
  "hide",
  "highlight",
  "dim_others",
  "move_to",
  "move_toward",
  "move_away",
  "move_along_path",
  "follow_target",
  "align",
  "aim_at",
  "rotate",
  "spin",
  "roll",
  "pivot",
  "hinge",
  "slide",
  "lift",
  "lower",
  "oscillate",
  "orbit",
  "pulse",
  "trace",
  "merge",
  "split",
  "transform",
  "expand",
  "contract",
  "insert_into",
  "remove_from",
  "attach",
  "detach",
  "connect",
  "disconnect",
  "flow",
  "emit",
  "accumulate",
  "pour",
  "fill",
  "drain",
  "filter",
  "open",
  "close",
  "assemble",
  "disassemble",
  "replace",
  "pause",
  "compare",
  "reveal_cutaway",
  "custom_semantic",
] as const;

/** Legacy V1 shot names retained for compatibility. */
export const DIRECTOR_CAMERA_SHOTS = [
  "wide",
  "medium",
  "close_up",
  "macro",
  "top_down",
  "isometric",
  "side_profile",
  "follow",
  "orbit",
  "push_in",
  "pull_back",
  "cutaway",
] as const;

/**
 * V2 camera movement primitives. Multiple movement steps may be composed in a
 * single shot. Old names remain valid so existing plans continue to normalize.
 */
export const DIRECTOR_CAMERA_MOVEMENTS = [
  "static",
  "push_in",
  "pull_back",
  "dolly",
  "truck",
  "pedestal",
  "pan",
  "tilt",
  "orbit",
  "arc_left",
  "arc_right",
  "follow",
  "lead_subject",
  "lag_follow",
  "track",
  "track_parallel",
  "crane",
  "reverse_reveal",
  "reframe",
  "rise_reveal",
  "spline",
  "object_attached",
  "pass_through",
  "settle",
  "cut",
  "semantic",
] as const;

export const DIRECTOR_NARRATIVE_JOBS = [
  "establish",
  "orient",
  "introduce",
  "isolate",
  "compare",
  "conceal",
  "foreshadow",
  "reveal",
  "reverse_assumption",
  "connect_cause",
  "show_consequence",
  "build_from_parts",
  "enter_system",
  "change_scale",
  "show_inside_outside",
  "hold_for_understanding",
  "return_to_context",
  "summarize",
] as const;

export const DIRECTOR_CAMERA_FRAMINGS = [
  "extreme_wide",
  "wide",
  "full",
  "medium_wide",
  "medium",
  "medium_close",
  "close",
  "extreme_close",
  "macro",
  "insert",
  "two_shot",
  "group_shot",
  "over_shoulder",
  "point_of_view",
  "cutaway",
] as const;

export const DIRECTOR_CAMERA_ANGLES = [
  "eye_level",
  "low_angle",
  "high_angle",
  "top_down",
  "ground_level",
  "side_profile",
  "front_profile",
  "rear_profile",
  "three_quarter_front",
  "three_quarter_rear",
  "isometric",
  "dutch_angle",
  "object_attached",
  "inside_object",
] as const;

export const DIRECTOR_CAMERA_LENSES = [
  "ultra_wide",
  "wide",
  "normal",
  "portrait",
  "telephoto",
  "macro",
] as const;

export const DIRECTOR_SCREEN_ANCHORS = [
  "center",
  "left_third",
  "right_third",
  "upper_third",
  "lower_third",
  "center_left",
  "center_right",
] as const;

export const DIRECTOR_CAPTION_SAFE_REGIONS = [
  "auto",
  "left",
  "right",
  "top",
  "bottom",
  "none",
] as const;

export const DIRECTOR_COORDINATE_SPACES = [
  "world",
  "actor_local",
  "target_relative",
  "camera_relative",
  "screen_relative",
  "path_relative",
  "surface_relative",
] as const;

export const DIRECTOR_BLOCKING_RELATIONS = [
  "on_ground",
  "on_surface",
  "inside",
  "attached_to",
  "beside",
  "in_front_of",
  "behind",
  "between",
  "facing",
  "facing_away",
  "foreground",
  "midground",
  "background",
  "screen_left",
  "screen_right",
  "surround",
  "form_line",
  "form_circle",
  "cluster",
  "symmetrical_pair",
] as const;

export const DIRECTOR_LIGHTING_INTENTS = [
  "neutral_studio",
  "high_key",
  "low_key",
  "backlit",
  "rim_lit",
  "spotlight_subject",
  "warm_cool_contrast",
  "preserve_shadow",
  "motivated_source",
  "light_reveal",
  "dim_environment",
  "emissive_subject",
  "track_spotlight",
  "shadow_projection",
  "volumetric_beam",
  "exposure_shift",
] as const;

export const DIRECTOR_KINEMATIC_CONSTRAINTS = [
  "axis_lock",
  "attach",
  "maintain_distance",
  "rigid_link",
  "look_at",
] as const;

export const DIRECTOR_CONTINUITY_RULES = [
  "keep_visible",
  "maintain_screen_direction",
  "preserve_visual_anchor",
  "avoid_occlusion",
  "maintain_axis",
  "eyeline_match",
  "preserve_actor_state",
  "preserve_action_continuity",
  "preserve_screen_position",
  "preserve_relative_scale",
  "preserve_orientation",
  "match_motion_direction",
] as const;

export const DIRECTOR_TEXT_KINDS = [
  "object_anchor",
  "world_label",
  "screen_caption",
  "screen_center",
] as const;

export const DIRECTOR_TEXT_PLACEMENTS = [
  "above",
  "below",
  "left",
  "right",
  "center",
  "top",
  "bottom",
  "auto",
] as const;

export const DIRECTOR_EASINGS = [
  "linear",
  "ease_in",
  "ease_out",
  "ease_in_out",
  "spring",
  "step",
] as const;

export type DirectorRepresentationMode =
  (typeof DIRECTOR_REPRESENTATION_MODES)[number];
export type DirectorActorKind =
  (typeof DIRECTOR_ACTOR_KINDS)[number];
export type DirectorFallbackRepresentation =
  (typeof DIRECTOR_FALLBACK_REPRESENTATIONS)[number];
export type DirectorBehaviour =
  (typeof DIRECTOR_BEHAVIOURS)[number];
export type DirectorCameraShot =
  (typeof DIRECTOR_CAMERA_SHOTS)[number];
export type DirectorCameraMovement =
  (typeof DIRECTOR_CAMERA_MOVEMENTS)[number];
export type DirectorNarrativeJob =
  (typeof DIRECTOR_NARRATIVE_JOBS)[number];
export type DirectorCameraFraming =
  (typeof DIRECTOR_CAMERA_FRAMINGS)[number];
export type DirectorCameraAngle =
  (typeof DIRECTOR_CAMERA_ANGLES)[number];
export type DirectorCameraLens =
  (typeof DIRECTOR_CAMERA_LENSES)[number];
export type DirectorScreenAnchor =
  (typeof DIRECTOR_SCREEN_ANCHORS)[number];
export type DirectorCaptionSafeRegion =
  (typeof DIRECTOR_CAPTION_SAFE_REGIONS)[number];
export type DirectorCoordinateSpace =
  (typeof DIRECTOR_COORDINATE_SPACES)[number];
export type DirectorBlockingRelation =
  (typeof DIRECTOR_BLOCKING_RELATIONS)[number];
export type DirectorLightingIntent =
  (typeof DIRECTOR_LIGHTING_INTENTS)[number];
export type DirectorKinematicConstraintKind =
  (typeof DIRECTOR_KINEMATIC_CONSTRAINTS)[number];
export type DirectorContinuityRule =
  (typeof DIRECTOR_CONTINUITY_RULES)[number];
export type DirectorTextKind =
  (typeof DIRECTOR_TEXT_KINDS)[number];
export type DirectorTextPlacement =
  (typeof DIRECTOR_TEXT_PLACEMENTS)[number];
export type DirectorEasing =
  (typeof DIRECTOR_EASINGS)[number];

export type DirectorEntityIntent = {
  id: string;
  display_name: string;
  semantic_role: string;
  visual_need: string;
  semantic_tags: string[];
  actor_kind: DirectorActorKind;
  asset_policy: {
    asset_required: boolean;
    can_use_proxy_until_asset_ready: boolean;
    fallback_representation: DirectorFallbackRepresentation;
    capability_needs: string[];
    anchor_needs: string[];
  };
};

export type DirectorRelationshipIntent = {
  id: string;
  source_entity_id: string;
  target_entity_ids: string[];
  relationship_type: string;
  explanation: string;
};

/** Legacy V1 camera cue. Kept as a compact compatibility surface. */
export type DirectorCameraCue = {
  shot_type: DirectorCameraShot;
  movement: DirectorCameraMovement;
  focus_entity_ids: string[];
  framing_intent: string;
  keep_visible_entity_ids: string[];
};

export type DirectorCameraMovementStep = {
  movement: DirectorCameraMovement;
  start_progress: number;
  end_progress: number;
  strength: number;
  easing: DirectorEasing;
  coordinate_space: DirectorCoordinateSpace;
  target_entity_id?: string | null;
  parameters: Record<string, unknown>;
};

export type DirectorCompositionCue = {
  framing: DirectorCameraFraming;
  angle: DirectorCameraAngle;
  screen_anchor: DirectorScreenAnchor;
  keep_visible_entity_ids: string[];
  foreground_entity_ids: string[];
  background_entity_ids: string[];
  preserve_relationship_entity_ids: string[];
  preserve_relative_scale: boolean;
  caption_safe_region: DirectorCaptionSafeRegion;
  negative_space_side?: "left" | "right" | "none";
};

export type DirectorLensCue = {
  preset: DirectorCameraLens;
  focal_length_mm: number;
  field_of_view_degrees: number;
  depth_of_field: "deep" | "moderate" | "shallow";
  aperture_f: number;
  focus_entity_id?: string | null;
};

export type DirectorBlockingConstraint = {
  relation: DirectorBlockingRelation;
  actor_entity_id: string;
  target_entity_id?: string | null;
  screen_region?: DirectorScreenAnchor | null;
  preserve_clearance: boolean;
  parameters: Record<string, unknown>;
};

export type DirectorLightingCue = {
  intents: DirectorLightingIntent[];
  motivated_source_entity_id?: string | null;
  emphasized_entity_ids: string[];
  preserve_shadow_entity_ids: string[];
};

export type DirectorKinematicConstraint = {
  kind: DirectorKinematicConstraintKind;
  actor_entity_id: string;
  target_entity_id?: string | null;
  secondary_target_entity_id?: string | null;
  axis: "x" | "y" | "z" | "auto";
  distance_m?: number | null;
  parameters: Record<string, unknown>;
};

export type DirectorContinuityCue = {
  rules: DirectorContinuityRule[];
  maximum_occlusion_ratio: number;
  maintain_axis_entity_ids: string[];
};

/**
 * Director Capability Language V2. This is deliberately semantic: GLM directs
 * the shot; MyWay resolves exact coordinates, geometry constraints and renderer
 * implementation from the final asset layout.
 */
export type DirectorShotDirectionV2 = {
  narrative_job: DirectorNarrativeJob;
  visual_claim: string;
  composition: DirectorCompositionCue;
  lens: DirectorLensCue;
  camera: {
    focus_entity_ids: string[];
    movement_steps: DirectorCameraMovementStep[];
    start_intent: string;
    end_intent: string;
    movement_reason: string;
  };
  blocking: DirectorBlockingConstraint[];
  constraints: DirectorKinematicConstraint[];
  lighting: DirectorLightingCue;
  continuity: DirectorContinuityCue;
  reveal_at?: number | null;
  hold_after_ms: number;
  success_observation?: string | null;
};

export type DirectorTextCue = {
  id: string;
  kind: DirectorTextKind;
  text: string;
  anchor_entity_id?: string | null;
  placement: DirectorTextPlacement;
  start_ms: number;
  end_ms: number;
  emphasis_words: string[];
  entrance: "fade" | "fade_up" | "pop" | "type_on" | "none";
  exit: "fade" | "hold" | "none";
};

export type DirectorEvent = {
  id: string;
  behaviour: DirectorBehaviour;
  actor_entity_id: string;
  target_entity_id?: string | null;
  supporting_entity_ids: string[];
  start_ms: number;
  duration_ms: number;
  easing: DirectorEasing;
  path_hint?: string | null;
  description: string;
  parameters: Record<string, unknown>;
  fallback_behaviour?: DirectorBehaviour | null;
};

export type DirectorMoment = {
  id: string;
  title: string;
  learning_job: string;
  director_intent: string;
  source_explanation_piece_ids: string[];
  duration_ms: number;
  introduces_entity_ids: string[];
  keeps_visible_entity_ids: string[];
  active_entity_ids: string[];
  camera: DirectorCameraCue;
  /** Rich composable direction. Always normalized when the V2 patch is active. */
  shot?: DirectorShotDirectionV2;
  events: DirectorEvent[];
  text_cues: DirectorTextCue[];
  success_observation?: string | null;
};

export type EducationalSceneDirectorPlanV1 = {
  schema_version: "myway_educational_scene_director_v1";
  /** Non-breaking capability-language upgrade layered onto the V1 plan envelope. */
  capability_language_version?: "v2";
  source:
    | "visual_experience"
    | "primitive_builder"
    | "scaffold"
    | "compatibility_adapter";
  title: string;
  scene_thesis: string;
  learner_takeaway: string;
  representation_strategy: {
    primary_mode: DirectorRepresentationMode;
    secondary_modes: DirectorRepresentationMode[];
    reason: string;
    fidelity_priority:
      | "causal_clarity"
      | "spatial_clarity"
      | "comparison_clarity"
      | "literal_fidelity";
  };
  style: {
    look: string;
    mood: string;
    continuity: string;
    attention_policy: string;
  };
  entities: DirectorEntityIntent[];
  relationships: DirectorRelationshipIntent[];
  moments: DirectorMoment[];
  global_text_policy: {
    max_words_per_cue: number;
    max_lines: number;
    avoid_covering_core_motion: boolean;
    prefer_object_anchored_text: boolean;
  };
  execution_policy: {
    direction_survives_missing_assets: true;
    preserve_entity_ids_for_late_binding: true;
    asset_resolution_owner: "myway";
    renderer_compiles_behaviours: true;
    allow_abstract_proxy_until_asset_ready: boolean;
  };
};

export type EducationalSceneDirectorValidationIssue = {
  severity: "warning" | "error";
  code: string;
  path: string;
  message: string;
};

export type EducationalSceneDirectorValidationReport = {
  valid: boolean;
  entity_count: number;
  relationship_count: number;
  moment_count: number;
  event_count: number;
  text_cue_count: number;
  unresolved_reference_count: number;
  uncovered_entity_ids: string[];
  issues: EducationalSceneDirectorValidationIssue[];
};
