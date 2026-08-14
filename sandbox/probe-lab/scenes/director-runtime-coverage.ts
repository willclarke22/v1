import type {
  DirectorBehaviour,
  DirectorBlockingRelation,
  DirectorCameraAngle,
  DirectorCameraFraming,
  DirectorCameraLens,
  DirectorCameraMovement,
  DirectorContinuityRule,
  DirectorCoordinateSpace,
  DirectorKinematicConstraintKind,
  DirectorLightingIntent,
} from "../director";

/**
 * Phase 1A structural coverage only.
 *
 * These dispositions answer "where does this canonical Director primitive go?"
 * They intentionally do NOT claim visual fidelity. Phase 1B owns that audit and
 * the registry's direct / compound / approximate / declared support labels.
 */
export const DIRECTOR_RUNTIME_COVERAGE_VERSION = "director_runtime_parity_phase1a_v1" as const;

export const DIRECTOR_RUNTIME_EXECUTION_MODES = [
  "explicit",
  "shared",
  "derived",
  "compatibility_alias",
  "presentation_contract",
  "validation_contract",
  "intentional_semantic",
] as const;

export type DirectorRuntimeExecutionMode =
  (typeof DIRECTOR_RUNTIME_EXECUTION_MODES)[number];

export const DIRECTOR_RUNTIME_OWNERS = [
  "camera_sampler",
  "composition_solver",
  "normalizer",
  "actor_sampler",
  "motion_program_sampler",
  "choreography_planner",
  "scene_state_reducer",
  "blocking_solver",
  "lighting_rig",
  "shot_validator",
  "presentation_layer",
  "director_contract",
  "geometry_or_renderer_layer",
] as const;

export type DirectorRuntimeOwner =
  (typeof DIRECTOR_RUNTIME_OWNERS)[number];

export type DirectorRuntimeCoverageEntry = {
  owner: DirectorRuntimeOwner;
  mode: DirectorRuntimeExecutionMode;
  note: string;
  alias_of?: string;
};

function coverage(
  owner: DirectorRuntimeOwner,
  mode: DirectorRuntimeExecutionMode,
  note: string,
  alias_of?: string,
): DirectorRuntimeCoverageEntry {
  return {
    owner,
    mode,
    note,
    ...(alias_of ? { alias_of } : {}),
  };
}

/**
 * Canonical camera movement -> current Three.js execution path.
 * `track` is retained by the Director contract for compatibility, but it is not
 * a separate creative primitive in the V2 Capability Library. It intentionally
 * executes as `follow`; authors that need a lateral travelling shot should use
 * `track_parallel`.
 */
export const DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE = {
  static: coverage("camera_sampler", "explicit", "Intentional stationary camera step."),
  push_in: coverage("camera_sampler", "explicit", "Moves the camera toward its target."),
  pull_back: coverage("camera_sampler", "explicit", "Moves the camera away from its target."),
  dolly: coverage("camera_sampler", "explicit", "Translates camera and target along a declared direction."),
  truck: coverage("camera_sampler", "explicit", "Lateral camera-rig translation relative to the current camera basis."),
  pedestal: coverage("camera_sampler", "explicit", "Vertical camera-rig translation."),
  pan: coverage("camera_sampler", "explicit", "Changes target direction while preserving camera position."),
  tilt: coverage("camera_sampler", "explicit", "Changes target elevation while preserving camera position."),
  orbit: coverage("camera_sampler", "shared", "Rotates camera position around the target using the shared arc/orbit path."),
  arc_left: coverage("camera_sampler", "shared", "Partial leftward rotation around the target."),
  arc_right: coverage("camera_sampler", "shared", "Partial rightward rotation around the target."),
  follow: coverage("composition_solver", "derived", "Base composition samples the travelling target so framing follows actor motion."),
  lead_subject: coverage("camera_sampler", "shared", "Follow composition plus an intentionally strong forward look-point bias so lead reads distinctly from ordinary follow."),
  lag_follow: coverage("camera_sampler", "shared", "Follow composition plus an intentionally strong transient rearward look bias that visibly lets the actor pull ahead before catch-up."),
  track: coverage("camera_sampler", "compatibility_alias", "Legacy/general tracking spelling executes as follow. Use track_parallel for a lateral travelling shot.", "follow"),
  track_parallel: coverage("camera_sampler", "shared", "Starts on and preserves a second-rail side rig perpendicular to subject travel, keeping full-shot distance, apparent size, and a centered subject target stable; the audit player keeps the authored t=0 camera authoritative instead of handing it to paused orbit controls."),
  crane: coverage("camera_sampler", "explicit", "Combines vertical and depth movement."),
  reverse_reveal: coverage("camera_sampler", "shared", "Arc/reveal move that can retarget between two focus actors."),
  reframe: coverage("camera_sampler", "explicit", "Interpolates the camera target between focus actors."),
  rise_reveal: coverage("camera_sampler", "explicit", "Raises and pulls back the camera to reveal hidden context."),
  spline: coverage("camera_sampler", "explicit", "Samples a Catmull-Rom camera path when waypoints are supplied."),
  object_attached: coverage("camera_sampler", "explicit", "Attaches to a higher/back clearance-aware actor-local body mount and preserves a slightly downward-forward actor-local viewing direction while the actor translates and rotates."),
  pass_through: coverage("camera_sampler", "explicit", "Advances the camera through the target direction."),
  settle: coverage("camera_sampler", "explicit", "Applies a decaying micro-settle at the end of a move."),
  cut: coverage("camera_sampler", "explicit", "Performs a step-eased camera reposition at the cut boundary."),
  semantic: coverage("director_contract", "intentional_semantic", "Carries semantic camera intent without mutating the Three.js pose by itself."),
} satisfies Record<DirectorCameraMovement, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_CAMERA_FRAMING_RUNTIME_COVERAGE = {
  extreme_wide: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  wide: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  full: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  medium_wide: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  medium: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  medium_close: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  close: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  extreme_close: coverage("composition_solver", "explicit", "Resolved by framing distance."),
  macro: coverage("composition_solver", "explicit", "Supports a tiny controlled focus entity with geometric-centre targeting, authored-pose camera authority, and enough camera clearance to keep the complete feature inside the safe frame; production semantic sub-part anchors remain asset-directability work."),
  insert: coverage("composition_solver", "explicit", "Supports a tight meaningful sub-part insert distinct from the smaller Macro target; production semantic sub-part anchors remain asset-directability work."),
  two_shot: coverage("composition_solver", "explicit", "Resolved from the aggregate focus radius of multiple actors."),
  group_shot: coverage("composition_solver", "explicit", "Resolved from the aggregate focus radius of multiple actors."),
  over_shoulder: coverage("composition_solver", "explicit", "Uses the declared foreground actor as the shoulder source and the focus actor as the viewed target, with clearance-aware back/side offsets and a slightly lower optical centre."),
  point_of_view: coverage("composition_solver", "explicit", "Uses the declared foreground actor as the viewpoint source, clears its face volume, and targets the focus actor."),
  cutaway: coverage("composition_solver", "explicit", "Provides a supporting-detail framing primitive with a smaller focus radius; meaningful detail selection remains Director/asset dependent."),
} satisfies Record<DirectorCameraFraming, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_CAMERA_ANGLE_RUNTIME_COVERAGE = {
  eye_level: coverage("composition_solver", "explicit", "Resolved to the default eye-level direction."),
  low_angle: coverage("composition_solver", "explicit", "Resolved to a low camera direction with height clamping."),
  high_angle: coverage("composition_solver", "explicit", "Resolved to an elevated camera direction."),
  top_down: coverage("composition_solver", "explicit", "Resolved to a near-vertical camera direction."),
  ground_level: coverage("composition_solver", "explicit", "Resolved to a ground-height camera direction."),
  side_profile: coverage("composition_solver", "explicit", "Resolved to a side-profile camera direction."),
  front_profile: coverage("composition_solver", "explicit", "Resolved to a front-profile camera direction."),
  rear_profile: coverage("composition_solver", "explicit", "Resolved to a rear-profile camera direction."),
  three_quarter_front: coverage("composition_solver", "explicit", "Resolved to a three-quarter front direction."),
  three_quarter_rear: coverage("composition_solver", "explicit", "Resolved to a three-quarter rear direction."),
  isometric: coverage("composition_solver", "explicit", "Resolves a multi-actor diagonal technical overview with a perspective camera with restrained FOV; the registry remains honestly approximate rather than orthographic."),
  dutch_angle: coverage("composition_solver", "explicit", "Resolved to eye-level direction plus camera roll."),
  object_attached: coverage("composition_solver", "derived", "Builds an actor-local body-mounted viewpoint whose clearance-aware mount and outward local viewing direction rotate with the sampled foreground actor."),
  inside_object: coverage("composition_solver", "explicit", "Resolved to an inside-object direction; actual interior visibility depends on asset geometry."),
} satisfies Record<DirectorCameraAngle, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_CAMERA_LENS_RUNTIME_COVERAGE = {
  ultra_wide: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera."),
  wide: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera."),
  normal: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera."),
  portrait: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera."),
  telephoto: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera."),
  macro: coverage("normalizer", "derived", "Normalized to numeric focal length/FOV consumed by the perspective camera; optical DOF fidelity is Phase 1B."),
} satisfies Record<DirectorCameraLens, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE = {
  show: coverage("scene_state_reducer", "explicit", "Phase 1B.4.4 persists visible=true in the outgoing scene snapshot while current-shot presentation remains presentation-owned."),
  hide: coverage("scene_state_reducer", "explicit", "Phase 1B.4.4 persists visible=false in the outgoing scene snapshot while current-shot presentation remains presentation-owned."),
  highlight: coverage("presentation_layer", "presentation_contract", "Emphasis intent is owned by presentation/material layers rather than actor transforms."),
  dim_others: coverage("presentation_layer", "presentation_contract", "Scene-wide emphasis intent is owned by presentation/material layers."),
  move_to: coverage("motion_program_sampler", "explicit", "Phase 1B.4.2 compiles move_to to deterministic vector interpolation when the complete actor transform-event set is inside the qualified subset; mixed unsupported motion keeps the legacy actor sampler."),
  move_toward: coverage("actor_sampler", "explicit", "Moves actor toward a target direction."),
  move_away: coverage("actor_sampler", "explicit", "Moves actor away from a target direction."),
  move_along_path: coverage("actor_sampler", "explicit", "Samples path points or a deterministic fallback path."),
  follow_target: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 samples the moving target at arbitrary progress and preserves a semantic target-relative offset."),
  align: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 aligns the declared/fallback actor axis toward the current target direction using a distinct recipe."),
  aim_at: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 aims the actor visual-forward axis at the current sampled target using a distinct recipe."),
  rotate: coverage("motion_program_sampler", "explicit", "Phase 1B.4.2 compiles Rotate to a deterministic orientation track and dual-runs it against the frozen legacy canary."),
  spin: coverage("actor_sampler", "shared", "Uses the shared axial rotation path."),
  roll: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 composes translation and orientation tracks with angular distance derived from travel distance/radius."),
  pivot: coverage("motion_program_sampler", "explicit", "Phase 1B.4.2 freezes Pivot as the rotate-around-anchor canary; Phase 1B.4.3 reuses that generalized primitive for distinct Hinge/Open/Close recipes."),
  hinge: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 compiles hinge intent to rotate-around-anchor motion plus declared hinge directability requirements."),
  slide: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 compiles Slide to constrained actor-local translation while retaining future surface/rail metadata requirements."),
  lift: coverage("actor_sampler", "explicit", "Translates actor upward."),
  lower: coverage("actor_sampler", "explicit", "Translates actor downward."),
  oscillate: coverage("motion_program_sampler", "explicit", "Phase 1B.4.2 compiles Oscillate to deterministic periodic sampling with dense legacy-equivalence checks."),
  orbit: coverage("actor_sampler", "explicit", "Moves actor around a target/center."),
  pulse: coverage("actor_sampler", "explicit", "Applies oscillating scale."),
  trace: coverage("presentation_layer", "presentation_contract", "Path tracing is semantic/presentation intent, not an actor-transform mutation in this sampler."),
  merge: coverage("choreography_planner", "explicit", "Phase 1B.4.5 converges declared participants into a shared target region with stable per-actor slots and persistent choreography state."),
  split: coverage("choreography_planner", "explicit", "Phase 1B.4.5 spreads predeclared result actors from a shared region without cloning or deleting geometry."),
  transform: coverage("actor_sampler", "explicit", "Applies combined scale and rotation transform."),
  expand: coverage("actor_sampler", "explicit", "Scales actor outward."),
  contract: coverage("actor_sampler", "explicit", "Scales actor inward."),
  insert_into: coverage("choreography_planner", "explicit", "Phase 1B.4.5 moves the declared actor into a target-relative containment slot; measured fit remains Builder authority."),
  remove_from: coverage("choreography_planner", "explicit", "Phase 1B.4.5 releases containment choreography state and moves the actor outward while preserving identity."),
  attach: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 composes approach then target-relative binding; Phase 1B.4.4 persists that relation in immutable scene state across later moments."),
  detach: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 latches the release origin; Phase 1B.4.4 clears the persistent attachment relation while retaining the released world pose."),
  connect: coverage("choreography_planner", "explicit", "Phase 1B.4.5 records a semantic connection relation and stages the actor at a deterministic endpoint offset."),
  disconnect: coverage("choreography_planner", "explicit", "Phase 1B.4.5 clears the semantic connection relation and separates the actor deterministically."),
  flow: coverage("actor_sampler", "shared", "Uses the shared flow/emit transform approximation."),
  emit: coverage("actor_sampler", "shared", "Uses the shared flow/emit transform approximation."),
  accumulate: coverage("actor_sampler", "shared", "Uses the shared accumulate/fill scale approximation."),
  pour: coverage("actor_sampler", "explicit", "Applies pouring rotation."),
  fill: coverage("actor_sampler", "shared", "Uses the shared accumulate/fill scale approximation."),
  drain: coverage("actor_sampler", "explicit", "Applies draining scale approximation."),
  filter: coverage("presentation_layer", "presentation_contract", "Filtering remains semantic/presentation intent in the shared actor sampler."),
  open: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 compiles an opening hinge transition; Phase 1B.4.4 persists normalized openness and the canonical closed pose."),
  close: coverage("motion_program_sampler", "explicit", "Phase 1B.4.4 reconstructs Close from the incoming normalized openness/canonical closed pose instead of assuming a hidden fixed start state."),
  assemble: coverage("choreography_planner", "explicit", "Phase 1B.4.5 coordinates predeclared part actors into deterministic readable slots around an anchor."),
  disassemble: coverage("choreography_planner", "explicit", "Phase 1B.4.5 spreads predeclared component actors into readable positions while preserving stable identities."),
  replace: coverage("presentation_layer", "presentation_contract", "Representation replacement is a presentation/resource transition, not a transform mutation."),
  pause: coverage("director_contract", "intentional_semantic", "Timing/hold intent does not mutate actor transform by itself."),
  compare: coverage("director_contract", "intentional_semantic", "Comparison is a semantic directing instruction composed through blocking/camera/presentation."),
  reveal_cutaway: coverage("director_contract", "intentional_semantic", "Cutaway reveal is a semantic directing instruction composed through camera/presentation."),
  custom_semantic: coverage("director_contract", "intentional_semantic", "Explicit extension point with no implicit transform mutation."),
} satisfies Record<DirectorBehaviour, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_BLOCKING_RUNTIME_COVERAGE = {
  on_ground: coverage("blocking_solver", "explicit", "Places actor on the ground plane in the preview staging pass."),
  on_surface: coverage("blocking_solver", "explicit", "Places actor above target in preview staging; measured geometry owns production placement."),
  inside: coverage("blocking_solver", "explicit", "Places actor inside target in preview staging; measured geometry owns production containment."),
  attached_to: coverage("blocking_solver", "explicit", "Places actor at a target-relative attachment position in preview staging."),
  beside: coverage("blocking_solver", "explicit", "Places actor beside target with clearance."),
  in_front_of: coverage("blocking_solver", "explicit", "Places actor in front of target."),
  behind: coverage("blocking_solver", "explicit", "Places actor behind target."),
  between: coverage("blocking_solver", "explicit", "Places actor between available peer actors."),
  facing: coverage("blocking_solver", "shared", "Uses shared target-facing rotation."),
  facing_away: coverage("blocking_solver", "shared", "Uses shared target-facing rotation plus 180 degrees."),
  foreground: coverage("blocking_solver", "explicit", "Moves actor toward foreground depth."),
  midground: coverage("blocking_solver", "explicit", "Applies midground depth staging."),
  background: coverage("blocking_solver", "explicit", "Moves actor toward background depth."),
  screen_left: coverage("blocking_solver", "explicit", "Moves actor toward screen-left staging."),
  screen_right: coverage("blocking_solver", "explicit", "Moves actor toward screen-right staging."),
  surround: coverage("blocking_solver", "explicit", "Distributes actors around a circle."),
  form_line: coverage("blocking_solver", "explicit", "Distributes actors along a line."),
  form_circle: coverage("blocking_solver", "explicit", "Distributes actors around a circle."),
  cluster: coverage("blocking_solver", "explicit", "Pulls actor staging inward toward the scene center."),
  symmetrical_pair: coverage("blocking_solver", "explicit", "Places focus pair symmetrically."),
} satisfies Record<DirectorBlockingRelation, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_LIGHTING_RUNTIME_COVERAGE = {
  neutral_studio: coverage("lighting_rig", "derived", "Default ambient/hemisphere/directional rig when no stronger intent overrides it."),
  high_key: coverage("lighting_rig", "explicit", "Raises ambient/key illumination."),
  low_key: coverage("lighting_rig", "explicit", "Reduces ambient illumination and changes key balance."),
  backlit: coverage("lighting_rig", "shared", "Uses shared backlight/key placement."),
  rim_lit: coverage("lighting_rig", "explicit", "Raises rim/back directional light."),
  spotlight_subject: coverage("lighting_rig", "explicit", "Adds a spotlight rig."),
  warm_cool_contrast: coverage("lighting_rig", "explicit", "Uses warm/cool key and fill colors."),
  preserve_shadow: coverage("lighting_rig", "shared", "Uses the shared backlit/shadow-preserving setup."),
  motivated_source: coverage("lighting_rig", "explicit", "Tracks a point light to the motivated source actor."),
  light_reveal: coverage("lighting_rig", "explicit", "Animates reveal-light intensity from the declared reveal point."),
  dim_environment: coverage("lighting_rig", "shared", "Uses the low-key environment path."),
  emissive_subject: coverage("lighting_rig", "shared", "Adds subject-tracked point-light emphasis."),
  track_spotlight: coverage("lighting_rig", "explicit", "Tracks a point light to the emphasized actor."),
  shadow_projection: coverage("lighting_rig", "shared", "Uses shadow-casting backlight setup."),
  volumetric_beam: coverage("lighting_rig", "shared", "Currently uses subject-tracked emissive light; volumetric rendering fidelity is Phase 1B."),
  exposure_shift: coverage("lighting_rig", "explicit", "Changes key-light intensity to imply an exposure shift."),
} satisfies Record<DirectorLightingIntent, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_KINEMATIC_CONSTRAINT_RUNTIME_COVERAGE = {
  axis_lock: coverage("actor_sampler", "explicit", "Locks two position axes around a declared origin."),
  attach: coverage("actor_sampler", "explicit", "Pins actor to sampled target plus offset."),
  maintain_distance: coverage("actor_sampler", "explicit", "Projects actor onto a fixed-radius relationship around target."),
  rigid_link: coverage("actor_sampler", "explicit", "Positions/orients/scales link actor between two sampled targets."),
  look_at: coverage("actor_sampler", "explicit", "Rotates actor to face sampled target."),
} satisfies Record<DirectorKinematicConstraintKind, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_CONTINUITY_RUNTIME_COVERAGE = {
  keep_visible: coverage("shot_validator", "validation_contract", "Required actors are sampled for in-frame visibility across the shot."),
  maintain_screen_direction: coverage("director_contract", "intentional_semantic", "Continuity intent is carried by the shot and composed through camera/blocking rather than a standalone correction pass."),
  preserve_visual_anchor: coverage("director_contract", "intentional_semantic", "Continuity intent is carried by composition rather than a standalone correction pass."),
  avoid_occlusion: coverage("shot_validator", "validation_contract", "Sampled occlusion is checked against the shot's declared maximum."),
  maintain_axis: coverage("director_contract", "intentional_semantic", "Axis continuity is a directing/shot-composition contract; no hidden runtime rewrite is performed."),
  eyeline_match: coverage("director_contract", "intentional_semantic", "Eyeline continuity is composed through target/framing choices; no hidden runtime rewrite is performed."),
  preserve_actor_state: coverage("scene_state_reducer", "explicit", "Phase 1B.4.4 deterministically reduces each completed moment into an immutable actor-state snapshot that becomes the next moment's explicit input."),
  preserve_action_continuity: coverage("director_contract", "intentional_semantic", "Action continuity is a Director authoring contract; no hidden runtime rewrite is performed."),
  preserve_screen_position: coverage("director_contract", "intentional_semantic", "Screen-position continuity is a composition contract; no hidden runtime rewrite is performed."),
  preserve_relative_scale: coverage("composition_solver", "derived", "Composition keeps focus actors in a shared framing solve; dedicated visual fidelity is audited in Phase 1B."),
  preserve_orientation: coverage("director_contract", "intentional_semantic", "Orientation continuity is carried by actor/camera choices rather than a hidden correction pass."),
  match_motion_direction: coverage("director_contract", "intentional_semantic", "Motion-direction continuity is carried by authored motion/camera choices rather than a hidden correction pass."),
} satisfies Record<DirectorContinuityRule, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE = {
  world: coverage("camera_sampler", "explicit", "World-space vectors are consumed directly by supported camera/actor operations."),
  actor_local: coverage("geometry_or_renderer_layer", "intentional_semantic", "Actor-local intent is retained, but not every current preview operation rotates vectors through the actor frame; fidelity audit belongs to Phase 1B."),
  target_relative: coverage("motion_program_sampler", "explicit", "Phase 1B.4.3 target-relative actor tracks sample moving target state directly and remain deterministic under random-access sampling; camera target-relative use remains separate."),
  camera_relative: coverage("camera_sampler", "explicit", "Camera forward/right/up basis is used by supported camera operations."),
  screen_relative: coverage("composition_solver", "derived", "Screen-anchor/composition cues resolve screen-relative intent rather than raw world coordinates."),
  path_relative: coverage("actor_sampler", "derived", "Path/spline operations resolve relative progress along supplied waypoints."),
  surface_relative: coverage("geometry_or_renderer_layer", "intentional_semantic", "Surface-relative intent is reserved for measured geometry/placement rather than guessed in camera math."),
} satisfies Record<DirectorCoordinateSpace, DirectorRuntimeCoverageEntry>;

export const DIRECTOR_RUNTIME_COVERAGE = {
  camera_movement: DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE,
  camera_framing: DIRECTOR_CAMERA_FRAMING_RUNTIME_COVERAGE,
  camera_angle: DIRECTOR_CAMERA_ANGLE_RUNTIME_COVERAGE,
  camera_lens: DIRECTOR_CAMERA_LENS_RUNTIME_COVERAGE,
  behaviour: DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
  blocking: DIRECTOR_BLOCKING_RUNTIME_COVERAGE,
  lighting: DIRECTOR_LIGHTING_RUNTIME_COVERAGE,
  kinematic_constraint: DIRECTOR_KINEMATIC_CONSTRAINT_RUNTIME_COVERAGE,
  continuity: DIRECTOR_CONTINUITY_RUNTIME_COVERAGE,
  coordinate_space: DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE,
} as const;

export function assertDirectorRuntimeNever(
  value: never,
  context: string,
): never {
  throw new Error(`Unhandled canonical Director value in ${context}: ${String(value)}`);
}

export type DirectorExecutableCameraMovement = Exclude<DirectorCameraMovement, "track">;

export function directorCameraMovementRuntimeAlias(
  movement: DirectorCameraMovement,
): DirectorExecutableCameraMovement {
  if (movement !== "track") return movement;
  const alias = DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE.track.alias_of;
  if (alias !== "follow") {
    throw new Error(`Director track compatibility alias drifted: expected follow, got ${String(alias)}.`);
  }
  return alias;
}
