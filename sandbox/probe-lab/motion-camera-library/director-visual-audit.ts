import type {
  DirectorCapability,
  DirectorCapabilityCategory,
} from "./director-capability-registry";

export const DIRECTOR_VISUAL_AUDIT_VERSION =
  "director_visual_audit_phase1b2_v1" as const;

export const DIRECTOR_VISUAL_AUDIT_STATUSES = [
  "unreviewed",
  "pass",
  "needs_work",
  "blocked",
  "approximate_ok",
] as const;

export type DirectorVisualAuditStatus =
  (typeof DIRECTOR_VISUAL_AUDIT_STATUSES)[number];

export const DIRECTOR_AUDIT_FIXTURE_KINDS = [
  "single_subject_composition",
  "two_subject_relationship",
  "two_subject_viewpoint",
  "travelling_subject",
  "mounted_camera",
  "technical_overview",
  "detail_target",
  "camera_path",
  "object_motion",
  "object_motion_rigid",
  "object_motion_path_surface",
  "object_motion_relationship",
  "object_motion_articulation",
  "object_motion_containment",
  "object_motion_multi_part",
  "object_motion_process",
  "blocking_stage",
  "lighting_stage",
  "continuity_stage",
  "narrative_stage",
] as const;

export type DirectorAuditFixtureKind =
  (typeof DIRECTOR_AUDIT_FIXTURE_KINDS)[number];

export type DirectorControlledAuditRoleLayout = {
  position: [number, number, number];
  rotation: [number, number, number];
  target_extent_m: number;
};

const DEFAULT_CONTROLLED_ROLE_LAYOUTS: Record<
  string,
  DirectorControlledAuditRoleLayout
> = {
  primary_subject: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    target_extent_m: 1.6,
  },
  secondary_subject: {
    position: [2.2, 0, -1.2],
    rotation: [0, 0, 0],
    target_extent_m: 1.15,
  },
  context_subject: {
    position: [-2.2, 0, -1.8],
    rotation: [0, 0, 0],
    target_extent_m: 0.95,
  },
};

export const DIRECTOR_CONTROLLED_AUDIT_LAYOUTS: Record<
  DirectorAuditFixtureKind,
  Partial<Record<string, DirectorControlledAuditRoleLayout>>
> = {
  single_subject_composition: {},
  two_subject_relationship: {
    primary_subject: { position: [-1.5, 0, 0.25], rotation: [0, 0.75, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [1.5, 0, -0.15], rotation: [0, -1.2, 0], target_extent_m: 1.25 },
  },
  two_subject_viewpoint: {
    primary_subject: { position: [-1.5, 0, 0.6], rotation: [0, 1.88, 0], target_extent_m: 1.7 },
    secondary_subject: { position: [1.45, 0, -0.35], rotation: [0, -1.26, 0], target_extent_m: 1.55 },
    context_subject: { position: [0, 0, -2.8], rotation: [0, 0, 0], target_extent_m: 0.75 },
  },
  travelling_subject: {
    primary_subject: { position: [0, 0, 0], rotation: [0, 1.84, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [2.8, 0, -1.75], rotation: [0, 0, 0], target_extent_m: 0.7 },
    context_subject: { position: [-2.8, 0, -1.75], rotation: [0, 0, 0], target_extent_m: 0.7 },
  },
  mounted_camera: {
    primary_subject: { position: [0, 0, 0], rotation: [0, 1.84, 0], target_extent_m: 1.7 },
    // Static roadside landmarks complement the course gates rendered by the
    // controlled preview, making actor-local rotation obvious from the view.
    secondary_subject: { position: [2.5, 0, -1.45], rotation: [0, 0, 0], target_extent_m: 0.72 },
    context_subject: { position: [-1.9, 0, 1.55], rotation: [0, 0, 0], target_extent_m: 0.72 },
  },
  technical_overview: {
    primary_subject: { position: [-1.35, 0, 0.85], rotation: [0, 0.35, 0], target_extent_m: 1.0 },
    secondary_subject: { position: [0, 0.22, -0.45], rotation: [0, -0.25, 0], target_extent_m: 1.35 },
    context_subject: { position: [1.35, 0.45, -1.7], rotation: [0, 0.55, 0], target_extent_m: 1.7 },
  },
  detail_target: {
    // Recognizable control-panel fixture:
    // primary = host panel, secondary = tiny screw (Macro),
    // context = larger lever/control (Insert).
    primary_subject: { position: [0, 0, 0], rotation: [0, 0, 0], target_extent_m: 2.0 },
    secondary_subject: { position: [0.52, 0.84, 0.27], rotation: [0, 0, 0], target_extent_m: 0.11 },
    context_subject: { position: [-0.48, 0.62, 0.27], rotation: [0, 0, 0], target_extent_m: 0.34 },
  },
  camera_path: {},
  object_motion: {
    primary_subject: { position: [-1.4, 0, 0.25], rotation: [0, 0, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [1.45, 0, -0.2], rotation: [0, 0, 0], target_extent_m: 1.15 },
  },
  object_motion_rigid: {
    primary_subject: { position: [-1.35, 0, 0.2], rotation: [0, 0, 0], target_extent_m: 1.45 },
    secondary_subject: { position: [1.45, 0, -0.15], rotation: [0, 0, 0], target_extent_m: 0.95 },
    context_subject: { position: [0, 0, -2.1], rotation: [0, 0, 0], target_extent_m: 0.7 },
  },
  object_motion_path_surface: {
    primary_subject: { position: [-1.7, 0, 0.15], rotation: [0, 0, 0], target_extent_m: 1.15 },
    secondary_subject: { position: [1.55, 0, -0.25], rotation: [0, 0, 0], target_extent_m: 0.75 },
    context_subject: { position: [0, 0, -2.2], rotation: [0, 0, 0], target_extent_m: 0.7 },
  },
  object_motion_relationship: {
    primary_subject: { position: [-1.45, 0, 0.15], rotation: [0, 0, 0], target_extent_m: 1.05 },
    secondary_subject: { position: [1.45, 0, -0.15], rotation: [0, 0, 0], target_extent_m: 1.05 },
    context_subject: { position: [0, 0, -2.0], rotation: [0, 0, 0], target_extent_m: 0.65 },
  },
  object_motion_articulation: {
    primary_subject: { position: [-0.45, 0, 0.15], rotation: [0, 0, 0], target_extent_m: 1.6 },
    secondary_subject: { position: [1.1, 0, -0.2], rotation: [0, 0, 0], target_extent_m: 0.8 },
    context_subject: { position: [-1.45, 0, -0.1], rotation: [0, 0, 0], target_extent_m: 0.7 },
  },
  object_motion_containment: {
    primary_subject: { position: [-1.55, 0, 0.15], rotation: [0, 0, 0], target_extent_m: 0.9 },
    secondary_subject: { position: [1.05, 0, -0.05], rotation: [0, 0, 0], target_extent_m: 1.55 },
    context_subject: { position: [0, 0, -2.1], rotation: [0, 0, 0], target_extent_m: 0.65 },
  },
  object_motion_multi_part: {
    primary_subject: { position: [-1.55, 0, 0.2], rotation: [0, 0, 0], target_extent_m: 1.05 },
    secondary_subject: { position: [1.25, 0, -0.1], rotation: [0, 0, 0], target_extent_m: 1.15 },
    context_subject: { position: [0, 0, -1.9], rotation: [0, 0, 0], target_extent_m: 0.75 },
  },
  object_motion_process: {
    primary_subject: { position: [-0.85, 0, 0.15], rotation: [0, 0, 0], target_extent_m: 1.0 },
    secondary_subject: { position: [1.25, 0, -0.15], rotation: [0, 0, 0], target_extent_m: 1.4 },
    context_subject: { position: [0, 0, -2.15], rotation: [0, 0, 0], target_extent_m: 0.7 },
  },
  blocking_stage: {
    primary_subject: { position: [-1.5, 0, 0.3], rotation: [0, 0, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [1.5, 0, -0.2], rotation: [0, 0, 0], target_extent_m: 1.15 },
  },
  lighting_stage: {},
  continuity_stage: {
    primary_subject: { position: [-1.5, 0, 0.3], rotation: [0, 0, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [1.5, 0, -0.3], rotation: [0, 0, 0], target_extent_m: 1.15 },
  },
  narrative_stage: {
    primary_subject: { position: [-1.4, 0, 0.25], rotation: [0, 0, 0], target_extent_m: 1.55 },
    secondary_subject: { position: [1.4, 0, -0.25], rotation: [0, 0, 0], target_extent_m: 1.15 },
  },
};

export function directorControlledAuditRoleLayout(
  fixture: DirectorAuditFixtureKind,
  role: string,
  capabilityId?: string,
): DirectorControlledAuditRoleLayout {
  const layout =
    DIRECTOR_CONTROLLED_AUDIT_LAYOUTS[fixture][role] ??
    DEFAULT_CONTROLLED_ROLE_LAYOUTS[role] ??
    {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      target_extent_m: 1,
    };

  if (capabilityId === "lower" && role === "primary_subject") {
    // The Lower proof starts elevated so a 1.8 m downward move remains visible
    // above the qualification floor instead of disappearing underneath it.
    return {
      ...layout,
      position: [layout.position[0], 1.05, layout.position[2]],
    };
  }

  return layout;
}

export type DirectorVisualAuditDefinition = {
  capability_id: string;
  fixture: DirectorAuditFixtureKind;
  expected_behavior: string[];
  compare_capability_ids: string[];
  human_review_prompt: string;
};

export type DirectorVisualAuditReview = {
  capability_id: string;
  status: DirectorVisualAuditStatus;
  notes: string;
  updated_at: string | null;
};

export type DirectorVisualAuditState = {
  schema_version: typeof DIRECTOR_VISUAL_AUDIT_VERSION;
  reviews: Record<string, DirectorVisualAuditReview>;
};

const CATEGORY_EXPECTATIONS: Record<
  DirectorCapabilityCategory,
  string[]
> = {
  narrative_attention: [
    "The visual change should make the named narrative job obvious without relying on text.",
    "The learner's attention should land on the intended actor or relationship.",
  ],
  camera_framing: [
    "The selected framing should be visually distinct from nearby shot-size choices.",
    "Required teaching actors should remain readable and unclipped.",
  ],
  camera_angle: [
    "The camera orientation should match the named viewpoint.",
    "The angle should preserve enough spatial context to understand the subject.",
  ],
  camera_movement: [
    "The camera path should visibly match the named movement.",
    "The movement should remain stable, readable, and meaningfully different from neighboring movement choices.",
  ],
  object_motion: [
    "The actor motion should visibly match the named behavior.",
    "The motion should preserve the intended relationship to targets, constraints, and scene context.",
  ],
  blocking_placement: [
    "Actor placement should make the named spatial relationship immediately legible.",
    "The composition should avoid accidental overlap or ambiguous depth.",
  ],
  lighting_emphasis: [
    "The lighting change should visibly direct attention for the declared reason.",
    "The subject should remain readable without the effect becoming decorative noise.",
  ],
  transition_continuity: [
    "The transition or continuity rule should preserve the relationship it claims to protect.",
    "The result should feel intentional rather than like an accidental camera or actor discontinuity.",
  ],
};

const CAMERA_COMPARISONS: Record<string, string[]> = {
  wide: ["medium_wide", "medium"],
  medium_wide: ["wide", "medium"],
  medium: ["medium_wide", "medium_close"],
  medium_close: ["medium", "close"],
  close: ["medium_close", "extreme_close"],
  extreme_close: ["close", "macro", "insert"],
  macro: ["extreme_close", "insert"],
  insert: ["macro", "close"],
  two_shot: ["group_shot", "over_shoulder"],
  group_shot: ["two_shot", "wide"],
  over_shoulder: ["two_shot", "point_of_view"],
  point_of_view: ["over_shoulder", "object_attached"],
  cutaway: ["insert", "medium_close"],
  eye_level: ["low_angle", "high_angle"],
  low_angle: ["eye_level", "ground_level"],
  high_angle: ["eye_level", "top_down"],
  top_down: ["high_angle", "isometric"],
  ground_level: ["low_angle", "eye_level"],
  side_profile: ["front_profile", "three_quarter_front"],
  front_profile: ["side_profile", "three_quarter_front"],
  rear_profile: ["three_quarter_rear", "side_profile"],
  three_quarter_front: ["front_profile", "isometric"],
  three_quarter_rear: ["rear_profile", "side_profile"],
  isometric: ["three_quarter_front", "top_down"],
  dutch_angle: ["eye_level", "high_angle"],
  object_attached: ["point_of_view", "follow"],
  inside_object: ["point_of_view", "cutaway"],
  static: ["push_in", "follow"],
  push_in: ["pull_out", "dolly"],
  pull_out: ["push_in", "dolly"],
  dolly: ["push_in", "truck_right"],
  truck_right: ["track_parallel", "dolly"],
  pedestal_up: ["crane", "rise_reveal"],
  pan: ["reframe", "truck_right"],
  tilt: ["pedestal_up", "crane"],
  orbit: ["arc_left", "arc_right"],
  arc_left: ["orbit", "arc_right"],
  arc_right: ["orbit", "arc_left"],
  follow: ["lead_subject", "lag_follow", "track_parallel"],
  lead_subject: ["follow", "lag_follow"],
  lag_follow: ["follow", "lead_subject"],
  track_parallel: ["follow", "truck_right"],
  crane: ["pedestal_up", "rise_reveal"],
  reverse_reveal: ["reframe", "pull_out"],
  reframe: ["pan", "reverse_reveal"],
  rise_reveal: ["crane", "pedestal_up"],
  spline: ["orbit", "dolly"],
  camera_object_attached: ["object_attached"],
  pass_through: ["push_in", "cutaway"],
  settle: ["static", "push_in"],
};

const OBJECT_MOTION_COMPARISONS: Record<string, string[]> = {
  translate: ["slide", "move_toward"],
  rotate: ["spin", "pivot"],
  pivot: ["hinge", "rotate"],
  oscillate: ["translate"],
  follow_path: ["slide"],
  slide: ["follow_path", "roll"],
  roll: ["slide", "spin"],
  attach: ["follow_target", "detach"],
  detach: ["attach"],
  follow_target: ["attach", "move_toward"],
  align: ["aim_at"],
  aim_at: ["align"],
  hinge: ["object_open", "object_close"],
  object_open: ["hinge", "object_close"],
  object_close: ["hinge", "object_open"],
  insert_into: ["remove_from", "merge"],
  remove_from: ["insert_into", "split"],
  assemble: ["merge", "disassemble"],
  disassemble: ["assemble", "split"],
  scatter: ["move_away", "split"],
  split: ["scatter", "disassemble"],
  merge: ["assemble", "insert_into"],
  expand: ["fill", "accumulate"],
  contract: ["drain"],
  flow: ["emit"],
  fill: ["expand", "accumulate"],
  drain: ["contract", "fill"],
  emit: ["flow"],
  accumulate: ["fill", "expand"],
};


function objectMotionFixture(
  capability: DirectorCapability,
): DirectorAuditFixtureKind {
  if (capability.group !== "Actor movement") return "object_motion";

  if ([
    "translate", "rotate", "pivot", "oscillate", "enter_frame", "exit_frame",
    "move_toward", "move_away", "spin", "lift", "lower", "expand", "contract",
  ].includes(capability.id)) {
    return "object_motion_rigid";
  }
  if (["follow_path", "slide", "roll"].includes(capability.id)) {
    return "object_motion_path_surface";
  }
  if (["attach", "detach", "follow_target", "align", "aim_at"].includes(capability.id)) {
    return "object_motion_relationship";
  }
  if (["hinge", "object_open", "object_close"].includes(capability.id)) {
    return "object_motion_articulation";
  }
  if (["insert_into", "remove_from"].includes(capability.id)) {
    return "object_motion_containment";
  }
  if (["assemble", "disassemble", "scatter", "split", "merge"].includes(capability.id)) {
    return "object_motion_multi_part";
  }
  return "object_motion_process";
}

function cameraFixture(capability: DirectorCapability): DirectorAuditFixtureKind {
  if (capability.category === "camera_framing") {
    if (capability.id === "over_shoulder" || capability.id === "point_of_view") {
      return "two_subject_viewpoint";
    }
    if (
      capability.id === "macro" ||
      capability.id === "insert" ||
      capability.id === "cutaway"
    ) {
      return "detail_target";
    }
    if (capability.id === "two_shot" || capability.id === "group_shot") {
      return "two_subject_relationship";
    }
    return "single_subject_composition";
  }

  if (capability.category === "camera_angle") {
    if (capability.id === "isometric") return "technical_overview";
    if (capability.id === "object_attached" || capability.id === "inside_object") {
      return "mounted_camera";
    }
    return "single_subject_composition";
  }

  if (capability.category === "camera_movement") {
    if (
      capability.id === "follow" ||
      capability.id === "lead_subject" ||
      capability.id === "lag_follow" ||
      capability.id === "track_parallel"
    ) {
      return "travelling_subject";
    }
    if (capability.id === "camera_object_attached") return "mounted_camera";
    return "camera_path";
  }

  return "single_subject_composition";
}

function fixtureFor(capability: DirectorCapability): DirectorAuditFixtureKind {
  if (
    capability.category === "camera_framing" ||
    capability.category === "camera_angle" ||
    capability.category === "camera_movement"
  ) {
    return cameraFixture(capability);
  }

  switch (capability.category) {
    case "object_motion":
      return objectMotionFixture(capability);
    case "blocking_placement":
      return "blocking_stage";
    case "lighting_emphasis":
      return "lighting_stage";
    case "transition_continuity":
      return "continuity_stage";
    case "narrative_attention":
      return "narrative_stage";
    default:
      return "single_subject_composition";
  }
}

function objectMotionExpectations(
  capability: DirectorCapability,
): string[] {
  const fixture = objectMotionFixture(capability);
  switch (fixture) {
    case "object_motion_rigid":
      return [
        "The asymmetric rigid-body fixture should make translation, rotation, pivoting, oscillation, vertical motion, and entry/exit direction visually distinguishable.",
        "The proof should preserve object identity while making the intended transform obvious enough to compare against nearby motion verbs.",
      ];
    case "object_motion_path_surface":
      return [
        "The visible rail/path and contact surface should make route-following, constrained sliding, and rolling visually distinguishable.",
        "Roll should read as coupled translation plus rotation, while Slide should preserve orientation and Follow path should visibly honor the curved route.",
      ];
    case "object_motion_relationship":
      return [
        "Both actors should remain visible so target-relative motion and orientation can be judged as a relationship rather than as isolated world-space motion.",
        "Attach/Follow target and Align/Aim at should be treated as known semantic-overlap probes until their runtime behavior is strengthened.",
      ];
    case "object_motion_articulation":
      return [
        "The door-panel fixture should expose the hinge edge and make the angular state change readable.",
        "Hinge is the articulation mechanism; Open and Close should be judged as opposite semantic state transitions around that same pivot.",
      ];
    case "object_motion_containment":
      return [
        "The peg and open socket/container should make inside-versus-outside state readable throughout the motion.",
        "Insert should finish contained and Remove should finish outside while the container remains stable.",
      ];
    case "object_motion_multi_part":
      return [
        "The fixture should expose several recognizable parts and a shared assembly/result region so one-actor motion cannot masquerade as a multi-part semantic action.",
        "Assemble, Disassemble, Scatter, Split, and Merge remain review targets until multiple actors visibly participate in the promised topology change.",
      ];
    case "object_motion_process":
      return [
        "The container/source/route fixture should separate object extent changes from quantity, flow, emission, and accumulation semantics.",
        "Fill/Drain must read as changing occupied content, Emit/Flow as directional transport, and Accumulate as visible build-up rather than generic scaling.",
      ];
    default:
      return [];
  }
}

function specialExpectations(capability: DirectorCapability): string[] {
  if (capability.category === "object_motion") {
    return objectMotionExpectations(capability);
  }

  switch (capability.id) {
    case "push_in":
      return [
        "The stationary teaching subject should remain on the optical axis while the camera advances toward a fixed aim point.",
        "Camera-to-target distance should visibly close; compare against Dolly to ensure this is not whole-rig translation with a moving aim point.",
      ];
    case "dolly":
      return [
        "The whole camera rig should translate on the authored diagonal rail: camera position and aim point move together while their mutual distance stays stable.",
        "The stationary subject should drift/parallax across the frame with only moderate scale change, making Dolly visibly different from centered Push in and pure-lateral Truck.",
      ];
    case "pan":
      return [
        "The camera position should remain fixed while the view yaws horizontally by a bounded amount around one teaching subject.",
        "The subject should travel laterally through frame without a second actor becoming the authored destination; compare against Reframe's explicit A-to-B centre handoff.",
      ];
    case "tilt":
      return [
        "The camera position should remain fixed while the viewing direction changes vertically enough to read as a Tilt.",
        "The teaching subject must remain meaningfully visible through the final composition; a frame dominated by empty sky or a subject dropped almost entirely below frame is a qualification failure.",
      ];
    case "reframe":
      return [
        "The opening should privilege the primary subject near optical centre and the ending should privilege the secondary subject near optical centre while both remain readable.",
        "The camera should stay in place as attention transfers from A to B; compare against Pan so this reads as semantic compositional handoff rather than generic horizontal rotation.",
      ];
    case "reverse_reveal":
      return [
        "The source should begin substantially concealed behind the apparent result rather than already reading as a separate second actor.",
        "The arc must create visible parallax until the source separates from the result and becomes independently readable; compare against Reframe so this does not collapse into a simple attention handoff.",
      ];
    case "rise_reveal":
      return [
        "A solid foreground occluder should substantially cover the teaching subject in the opening composition.",
        "As the camera rises, the occluder should fall away in screen space and expose the subject; compare against Crane and Pedestal so the move proves a reveal rather than generic vertical travel.",
      ];
    case "over_shoulder":
      return [
        "A controlled foreground shoulder/head should occupy only a modest edge of frame.",
        "The focus actor should remain clearly readable beyond the foreground actor.",
      ];
    case "point_of_view":
      return [
        "The camera should feel located at the viewpoint actor rather than intersecting its visible body.",
        "The target actor should define the direction of gaze.",
      ];
    case "object_attached":
      return [
        "The view should read like a camera mounted high/back on a directionally suitable host: only a restrained hood/body edge should remain along the lower frame while roadside markers and the travel surface provide external orientation.",
        "The camera should inherit the actor's local orientation and look outward with a slight downward pitch so road/support context survives without looking back at the host centre.",
      ];
    case "camera_object_attached":
      return [
        "Legacy compatibility only: this id should ease from the external travelling view onto the canonical high/back Object-attached mounted relationship, with no independent settled-camera semantics.",
        "Do not qualify this as a separate creative primitive. Its only preserved distinction is blend-in entry timing before the same restrained host-body reference, horizon/travel surface, and stable slightly downward-forward local view are restored.",
      ];
    case "follow":
      return [
        "The moving subject should stay compositionally stable while the world moves around it.",
        "Camera-to-subject offset should remain nearly constant through the travel.",
        "Qualification visibility fill may normalize readability for camera-family evidence, but it must not become part of the authored Director lighting contract.",
      ];
    case "lead_subject":
      return [
        "The actor should sit visibly behind centre in the direction opposite its screen travel, leaving unmistakable look room ahead while apparent size stays Follow-like on both character and wide-vehicle geometry.",
        "After a brief near-Follow opening, Lead should establish its safe rear-third composition within roughly the first third of the audition and then hold it; the preferred placement must still yield before the actor's projected silhouette crowds the rear safe-frame edge.",
      ];
    case "lag_follow":
      return [
        "Lag should read as a temporal event: begin near the normal Follow relation, let the actor visibly pull ahead after a short response delay, hold that asymmetry briefly, then deliberately recover without a dramatic looming/zoom-like size change on either character or vehicle geometry.",
        "The lag should come primarily from delayed look relationship rather than a large physical camera retreat, returning close to ordinary Follow by the end while projected silhouette area stays restrained.",
      ];
    case "track_parallel":
      return [
        "The paused 0% proof should already sit on its second rail at the first frame, and the first playback frame should be the exact same second-rail composition, with nearly constant apparent subject size and screen position through 100%.",
        "The camera-to-subject vector should stay predominantly perpendicular to travel without an entry zoom, control handoff snap, forward look drift, or diagonal collapse; the same low-profile ground-edge markers used by the other Tracking siblings should provide optic flow without crossing the side-rail lens.",
      ];
    case "light_reveal":
      return [
        "The opening should withhold meaningful subject detail under a deliberately subdued environment rather than showing an already-readable hero with a later brightness bump.",
        "A bounded local reveal light should make the teaching subject become clearly readable, then hold the revealed state while the broader environment stays comparatively subdued.",
      ];
    case "shadow_projection":
      return [
        "A cast silhouette must be visibly projected onto a distinct receiving surface with enough lateral separation from the source actor to read as its own explanatory shape.",
        "The proof fails if the viewer can only see dark object shading; the projected shadow itself must remain readable and attributable to the source actor.",
      ];
    case "volumetric_beam":
      return [
        "A visible shaft of light must occupy space between an identifiable source direction and the emphasized subject; ordinary emissive or point-light brightening is not sufficient.",
        "The beam path should remain readable as a directional volume without becoming an opaque solid prop or obscuring the subject it is meant to explain.",
      ];
    case "exposure_shift":
      return [
        "The whole rendered scene should undergo an obvious exposure change, affecting the subject and surrounding surfaces together rather than only changing one key light.",
        "Compare against Light reveal: Exposure shift is a global image-state transition, while Light reveal remains selective/local illumination of the teaching subject.",
      ];
    case "isometric":
      return [
        "The controlled technical fixture should remain fully in frame from a stable three-axis overview.",
        "Perspective distortion should remain restrained enough for diagram-like reading.",
      ];
    case "macro":
      return [
        "The tiny cross-head screw/fastener should dominate the frame while the complete circular head stays inside the safe frame at every sampled state.",
        "The authored Macro pose should remain centered from pause into playback, with enough blue panel surface around the fastener to make its host relationship immediately obvious.",
      ];
    case "insert":
      return [
        "The larger lever/control on the panel should become the only important visual information.",
        "The insert should be clearly specific to that meaningful sub-part without pretending to be microscopic.",
      ];
    case "cutaway":
      return [
        "The supporting detail should be isolated without destroying the viewer's understanding of the larger relationship.",
        "The controlled detail target should be framed as a purposeful supporting view rather than a generic medium shot.",
      ];
    default:
      return [];
  }
}

export function directorVisualAuditDefinition(
  capability: DirectorCapability,
): DirectorVisualAuditDefinition {
  const expected = [
    ...CATEGORY_EXPECTATIONS[capability.category],
    ...specialExpectations(capability),
  ];

  return {
    capability_id: capability.id,
    fixture: fixtureFor(capability),
    expected_behavior: Array.from(new Set(expected)),
    compare_capability_ids:
      CAMERA_COMPARISONS[capability.id] ??
      OBJECT_MOTION_COMPARISONS[capability.id] ??
      [],
    human_review_prompt:
      "Does this controlled proof look like the capability name promises, and would you trust GLM to choose it deliberately in an educational scene?",
  };
}

export function emptyDirectorVisualAuditState(): DirectorVisualAuditState {
  return {
    schema_version: DIRECTOR_VISUAL_AUDIT_VERSION,
    reviews: {},
  };
}

function isAuditStatus(value: unknown): value is DirectorVisualAuditStatus {
  return (
    typeof value === "string" &&
    (DIRECTOR_VISUAL_AUDIT_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeDirectorVisualAuditState(
  value: unknown,
): DirectorVisualAuditState {
  const state = emptyDirectorVisualAuditState();
  if (!value || typeof value !== "object") return state;

  const rawReviews = (value as { reviews?: unknown }).reviews;
  if (!rawReviews || typeof rawReviews !== "object") return state;

  for (const [capabilityId, rawReview] of Object.entries(
    rawReviews as Record<string, unknown>,
  )) {
    if (!rawReview || typeof rawReview !== "object") continue;
    const item = rawReview as Record<string, unknown>;
    const status = isAuditStatus(item.status) ? item.status : "unreviewed";
    state.reviews[capabilityId] = {
      capability_id: capabilityId,
      status,
      notes: typeof item.notes === "string" ? item.notes : "",
      updated_at:
        typeof item.updated_at === "string" ? item.updated_at : null,
    };
  }

  return state;
}

export function reviewForCapability(
  state: DirectorVisualAuditState,
  capabilityId: string,
): DirectorVisualAuditReview {
  return (
    state.reviews[capabilityId] ?? {
      capability_id: capabilityId,
      status: "unreviewed",
      notes: "",
      updated_at: null,
    }
  );
}

export function reviewedCapabilityCount(
  state: DirectorVisualAuditState,
): number {
  return Object.values(state.reviews).filter(
    (review) => review.status !== "unreviewed",
  ).length;
}
