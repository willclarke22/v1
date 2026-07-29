
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

export const DIRECTOR_BEHAVIOURS = [
  "show",
  "hide",
  "highlight",
  "dim_others",
  "move_to",
  "move_along_path",
  "rotate",
  "orbit",
  "pulse",
  "trace",
  "merge",
  "split",
  "transform",
  "insert_into",
  "remove_from",
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

export const DIRECTOR_CAMERA_MOVEMENTS = [
  "static",
  "push_in",
  "pull_back",
  "follow",
  "orbit",
  "pan",
  "tilt",
  "track",
  "cut",
  "semantic",
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

export type DirectorCameraCue = {
  shot_type: DirectorCameraShot;
  movement: DirectorCameraMovement;
  focus_entity_ids: string[];
  framing_intent: string;
  keep_visible_entity_ids: string[];
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
  events: DirectorEvent[];
  text_cues: DirectorTextCue[];
  success_observation?: string | null;
};

export type EducationalSceneDirectorPlanV1 = {
  schema_version: "myway_educational_scene_director_v1";
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
