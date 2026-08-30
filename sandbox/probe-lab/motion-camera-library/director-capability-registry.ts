import type {
  DirectorCameraMovement,
  DirectorEvent,
  DirectorMoment,
  DirectorShotDirectionV2,
} from "../director";


export const DIRECTOR_CAPABILITY_CATEGORIES = [
  "narrative_attention",
  "camera_framing",
  "camera_angle",
  "camera_movement",
  "object_motion",
  "blocking_placement",
  "lighting_emphasis",
  "transition_continuity",
] as const;

export const DIRECTOR_CAPABILITY_SUPPORT_LEVELS = [
  "direct",
  "compound",
  "approximate",
  "declared",
] as const;

export type DirectorCapabilityCategory =
  (typeof DIRECTOR_CAPABILITY_CATEGORIES)[number];
export type DirectorCapabilitySupportLevel =
  (typeof DIRECTOR_CAPABILITY_SUPPORT_LEVELS)[number];

export type DirectorDemoRole = {
  role: string;
  /** Optional deterministic fixture preference. Normal scene direction never chooses asset ids. */
  preferred_asset_ids?: string[];
  preferred_concepts: string[];
  optional?: boolean;
};

export type DirectorBlockingCue = {
  role: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  target_extent_m?: number;
};

export type DirectorCapabilityParameter = {
  name: string;
  kind: "number" | "boolean" | "enum" | "entity" | "vec3" | "text";
  description: string;
  default_value?: unknown;
  min?: number;
  max?: number;
  unit?: string;
  options?: string[];
};

export type DirectorCapability = {
  id: string;
  label: string;
  category: DirectorCapabilityCategory;
  group: string;
  summary: string;
  semantic_intent: string;
  director_instruction: Record<string, unknown>;
  parameters?: DirectorCapabilityParameter[];
  compatible_with?: DirectorCapabilityCategory[];
  coordinate_spaces?: string[];
  compiler: {
    compiler_id: string;
    threejs: DirectorCapabilitySupportLevel;
    blender: DirectorCapabilitySupportLevel;
    fallback_capability_id?: string;
  };
  demo: {
    kind: string;
    duration_ms: number;
    narration: string;
    asset_roles: DirectorDemoRole[];
    blocking: DirectorBlockingCue[];
    required_visible_roles: string[];
    camera_path_clear_required: boolean;
    maximum_occlusion_ratio?: number;
    shot?: DirectorShotDirectionV2;
    events?: DirectorEvent[];
  };
};

const defaultRoles: DirectorDemoRole[] = [
  {
    role: "primary_subject",
    preferred_asset_ids: ["soldier_polyp_ul46oxezyk"],
    preferred_concepts: [
      "soldier",
      "character",
      "human",
      "person",
    ],
  },
  {
    role: "secondary_subject",
    preferred_asset_ids: ["fire_hydrant_bk_mrjsn0wl"],
    preferred_concepts: [
      "fire hydrant",
      "hydrant",
    ],
  },
  {
    role: "context_subject",
    preferred_asset_ids: ["lantern_bk_mrqk238f"],
    preferred_concepts: [
      "lantern",
      "lamp",
      "light source",
    ],
    optional: true,
  },
];

const defaultBlocking: DirectorBlockingCue[] = [
  { role: "primary_subject", position: [-1.6, 0, 0], target_extent_m: 1.8 },
  { role: "secondary_subject", position: [1.6, 0, 0], target_extent_m: 1.35 },
  { role: "context_subject", position: [0, 0, -2.45], target_extent_m: 1.1 },
];

type CapabilitySeed = Omit<DirectorCapability, "demo"> & {
  demo?: Partial<DirectorCapability["demo"]>;
};

function capability(seed: CapabilitySeed): DirectorCapability {
  return {
    ...seed,
    demo: {
      kind: seed.demo?.kind ?? seed.id,
      duration_ms: seed.demo?.duration_ms ?? 7000,
      narration: seed.demo?.narration ?? seed.summary,
      asset_roles: seed.demo?.asset_roles ?? defaultRoles,
      blocking: seed.demo?.blocking ?? defaultBlocking,
      required_visible_roles:
        seed.demo?.required_visible_roles ?? ["primary_subject"],
      camera_path_clear_required:
        seed.demo?.camera_path_clear_required ?? true,
      maximum_occlusion_ratio:
        seed.demo?.maximum_occlusion_ratio ?? 0.2,
    },
  };
}

function simpleCapability(input: {
  id: string;
  label: string;
  category: DirectorCapabilityCategory;
  group: string;
  summary: string;
  semanticIntent?: string;
  compilerId?: string;
  threejs?: DirectorCapabilitySupportLevel;
  blender?: DirectorCapabilitySupportLevel;
  fallback?: string;
  instruction?: Record<string, unknown>;
  parameters?: DirectorCapabilityParameter[];
  compatibleWith?: DirectorCapabilityCategory[];
  coordinateSpaces?: string[];
  demo?: Partial<DirectorCapability["demo"]>;
}) {
  return capability({
    id: input.id,
    label: input.label,
    category: input.category,
    group: input.group,
    summary: input.summary,
    semantic_intent: input.semanticIntent ?? input.summary,
    director_instruction:
      input.instruction ?? {
        capability_id: input.id,
        intent: input.semanticIntent ?? input.summary,
      },
    parameters: input.parameters,
    compatible_with: input.compatibleWith ?? DIRECTOR_CAPABILITY_CATEGORIES.filter((category) => category !== input.category),
    coordinate_spaces: input.coordinateSpaces,
    compiler: {
      compiler_id: input.compilerId ?? input.id,
      threejs: input.threejs ?? "direct",
      blender: input.blender ?? "declared",
      fallback_capability_id: input.fallback,
    },
    demo: input.demo,
  });
}

const narrativeAttention: DirectorCapability[] = [
  simpleCapability({
    id: "establish",
    label: "Establish",
    category: "narrative_attention",
    group: "Attention sequence",
    summary: "Begin wide enough to orient the viewer to the actors and their spatial relationship.",
    instruction: {
      narrative_job: "establish",
      attention_sequence: ["environment", "primary_subject", "relationship"],
      camera_intent: "begin wide, then settle on the teaching subject",
    },
    demo: { kind: "narrative_establish", required_visible_roles: ["primary_subject", "secondary_subject", "context_subject"] },
  }),
  simpleCapability({
    id: "isolate",
    label: "Isolate",
    category: "narrative_attention",
    group: "Attention sequence",
    summary: "Reduce competing visual weight so one subject becomes unmistakably important.",
    instruction: {
      narrative_job: "isolate",
      primary_subject_role: "primary_subject",
      dim_other_roles: ["secondary_subject", "context_subject"],
      camera_intent: "push toward the primary subject while preserving context",
    },
    demo: { kind: "narrative_isolate" },
  }),
  simpleCapability({
    id: "compare",
    label: "Compare",
    category: "narrative_attention",
    group: "Attention sequence",
    summary: "Stage two subjects at comparable scale and visibility so their differences can be read fairly.",
    instruction: {
      narrative_job: "compare",
      compared_roles: ["primary_subject", "secondary_subject"],
      preserve_relative_scale: true,
      camera_intent: "balanced two-subject composition",
    },
    demo: { kind: "narrative_compare", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "reveal",
    label: "Reveal",
    category: "narrative_attention",
    group: "Attention sequence",
    summary: "Begin with important information concealed, then move so the source and result become readable together.",
    instruction: {
      narrative_job: "reveal",
      initially_concealed_role: "secondary_subject",
      reveal_with: "camera_and_blocking",
      end_visibility_roles: ["primary_subject", "secondary_subject"],
      hold_after_reveal_ms: 1200,
    },
    compilerId: "reverse_reveal_controller",
    threejs: "compound",
    fallback: "truck_right",
    demo: { kind: "narrative_reveal", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "connect_cause",
    label: "Connect cause",
    category: "narrative_attention",
    group: "Causal clarity",
    summary: "Move attention from the initiating actor through the relationship to the resulting actor.",
    instruction: {
      narrative_job: "connect_cause",
      cause_role: "primary_subject",
      mechanism_role: "context_subject",
      effect_role: "secondary_subject",
      attention_sequence: ["cause", "mechanism", "effect"],
    },
    compilerId: "causal_attention_controller",
    threejs: "compound",
    fallback: "pan",
    demo: { kind: "narrative_connect_cause", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "show_consequence",
    label: "Show consequence",
    category: "narrative_attention",
    group: "Causal clarity",
    summary: "Hold on the changed end state long enough for the audience to register what the action produced.",
    instruction: {
      narrative_job: "show_consequence",
      action_role: "primary_subject",
      consequence_role: "secondary_subject",
      end_state_hold_ms: 1400,
      preserve_cause_in_context: true,
    },
    compilerId: "consequence_hold_controller",
    threejs: "compound",
    fallback: "static",
    demo: { kind: "narrative_show_consequence", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({ id: "orient", label: "Orient", category: "narrative_attention", group: "Attention sequence", summary: "Establish the viewer's location, direction, and the spatial rule they need before the action begins.", demo: { kind: "narrative_orient" } }),
  simpleCapability({ id: "introduce", label: "Introduce", category: "narrative_attention", group: "Attention sequence", summary: "Bring a new actor into the visual argument without stealing attention from the existing relationship.", demo: { kind: "narrative_introduce" } }),
  simpleCapability({ id: "conceal", label: "Conceal", category: "narrative_attention", group: "Reveal grammar", summary: "Keep a source, mechanism, or answer deliberately hidden while preserving enough context to create a useful question.", threejs: "compound", fallback: "isolate", demo: { kind: "narrative_conceal" } }),
  simpleCapability({ id: "foreshadow", label: "Foreshadow", category: "narrative_attention", group: "Reveal grammar", summary: "Give a small visual clue about a later relationship without fully revealing it.", threejs: "compound", fallback: "isolate", demo: { kind: "narrative_foreshadow" } }),
  simpleCapability({ id: "reverse_assumption", label: "Reverse assumption", category: "narrative_attention", group: "Reveal grammar", summary: "Begin from the viewer's likely interpretation, then redirect attention to evidence that overturns it.", threejs: "compound", fallback: "reveal", demo: { kind: "narrative_reverse_assumption" } }),
  simpleCapability({ id: "build_from_parts", label: "Build from parts", category: "narrative_attention", group: "Explanatory structure", summary: "Introduce components in a controlled order, then resolve them into one functioning system.", threejs: "compound", fallback: "establish", demo: { kind: "narrative_build_from_parts" } }),
  simpleCapability({ id: "enter_system", label: "Enter system", category: "narrative_attention", group: "Scale & representation", summary: "Move from an exterior overview into the interior of an object or system while preserving orientation.", threejs: "compound", fallback: "push_in", demo: { kind: "narrative_enter_system" } }),
  simpleCapability({ id: "change_scale", label: "Change scale", category: "narrative_attention", group: "Scale & representation", summary: "Transition between meaningful scales while keeping a visual anchor that tells the learner where they are.", threejs: "compound", fallback: "push_in", demo: { kind: "narrative_change_scale" } }),
  simpleCapability({ id: "show_inside_outside", label: "Inside / outside", category: "narrative_attention", group: "Scale & representation", summary: "Preserve the exterior context while revealing an internal structure or cutaway relationship.", threejs: "compound", fallback: "compare", demo: { kind: "narrative_inside_outside" } }),
  simpleCapability({ id: "hold_for_understanding", label: "Hold for understanding", category: "narrative_attention", group: "Pacing", summary: "Stop camera escalation and leave the resolved relationship readable long enough to be understood.", demo: { kind: "narrative_hold" } }),
  simpleCapability({ id: "return_to_context", label: "Return to context", category: "narrative_attention", group: "Pacing", summary: "Pull back from a detail to show where that detail belongs in the larger system.", threejs: "compound", fallback: "pull_out", demo: { kind: "narrative_return_context" } }),
  simpleCapability({ id: "summarize", label: "Summarize", category: "narrative_attention", group: "Pacing", summary: "Finish on a composition where the key actors and their relationship can be read together at a glance.", demo: { kind: "narrative_summarize", required_visible_roles: ["primary_subject", "secondary_subject"] } }),
];

const framingSeeds = [
  ["extreme_wide", "Extreme wide", "Show the full environment and all major spatial relationships."],
  ["wide", "Wide", "Frame the complete action area with comfortable environmental context."],
  ["full", "Full", "Show the complete primary subject while keeping enough context to read its role."],
  ["medium_wide", "Medium wide", "Keep a full action readable while moving closer than an establishing wide shot."],
  ["medium", "Medium", "Balance subject detail with nearby relationships."],
  ["medium_close", "Medium close", "Prioritize the subject while retaining a small amount of context."],
  ["close", "Close", "Make one subject or mechanism visually dominant."],
  ["extreme_close", "Extreme close", "Concentrate attention on a small but meaningful region."],
  ["macro", "Macro", "Inspect a tiny mechanism or surface-level change at exaggerated scale."],
  ["insert", "Insert shot", "Frame a small object or sub-part as the only important visual information."],
  ["two_shot", "Two shot", "Keep two actors readable in one relationship-focused frame."],
  ["group_shot", "Group shot", "Keep several actors legible as one functional group without losing the primary subject."],
  ["over_shoulder", "Over shoulder", "Frame one subject through another to preserve point of view and relationship."],
  ["point_of_view", "Point of view", "Place the camera where an actor or moving part experiences the scene."],
  ["cutaway", "Cutaway", "Temporarily isolate an internal or supporting detail while preserving the larger context."],
] as const;

const cameraFraming = framingSeeds.map(([id, label, summary]) =>
  simpleCapability({
    id,
    label,
    category: "camera_framing",
    group: "Shot size",
    summary,
    threejs: id === "cutaway" ? "compound" : "direct",
    fallback: id === "cutaway" ? "medium_close" : undefined,
    instruction: {
      camera: {
        framing: id,
        primary_subject_role: "primary_subject",
        keep_visible_roles:
          id === "two_shot" || id === "over_shoulder"
            ? ["primary_subject", "secondary_subject"]
            : id === "point_of_view" || id === "cutaway"
              ? ["secondary_subject"]
              : ["primary_subject"],
        viewpoint_source_role:
          id === "over_shoulder" || id === "point_of_view"
            ? "primary_subject"
            : null,
      },
    },
    demo: {
      kind: `framing_${id}`,
      required_visible_roles:
        id === "two_shot" || id === "extreme_wide" || id === "over_shoulder"
          ? ["primary_subject", "secondary_subject"]
          : id === "point_of_view" || id === "cutaway" || id === "macro"
            ? ["secondary_subject"]
            : id === "insert"
              ? ["context_subject"]
              : ["primary_subject"],
    },
  }),
);

const compositionLens: DirectorCapability[] = [
  simpleCapability({ id: "anchor_center", label: "Center anchor", category: "camera_framing", group: "Composition", summary: "Keep the primary subject centered as the stable visual anchor.", instruction: { composition: { screen_anchor: "center" } } }),
  simpleCapability({ id: "left_third", label: "Left third", category: "camera_framing", group: "Composition", summary: "Place the primary subject near the left third while preserving useful space to the right.", instruction: { composition: { screen_anchor: "left_third" } } }),
  simpleCapability({ id: "right_third", label: "Right third", category: "camera_framing", group: "Composition", summary: "Place the primary subject near the right third while preserving useful space to the left.", instruction: { composition: { screen_anchor: "right_third" } } }),
  simpleCapability({ id: "negative_space_left", label: "Negative space left", category: "camera_framing", group: "Composition", summary: "Reserve readable empty space on the left for anticipation, comparison, or text.", instruction: { composition: { negative_space_side: "left" } } }),
  simpleCapability({ id: "negative_space_right", label: "Negative space right", category: "camera_framing", group: "Composition", summary: "Reserve readable empty space on the right for anticipation, comparison, or text.", instruction: { composition: { negative_space_side: "right" } } }),
  simpleCapability({ id: "two_subject_balance", label: "Two-subject balance", category: "camera_framing", group: "Composition", summary: "Solve framing so two teaching actors remain comparably readable without forcing equal world scale.", threejs: "compound", fallback: "two_shot", instruction: { composition: { preserve_relative_scale: true, keep_visible_roles: ["primary_subject", "secondary_subject"] } }, demo: { required_visible_roles: ["primary_subject", "secondary_subject"] } }),
  ...([[
    "lens_ultra_wide", "Ultra-wide lens", "Exaggerate depth and proximity when spatial expansion itself helps the explanation.", "ultra_wide",
  ], ["lens_wide", "Wide lens", "Show strong spatial context while keeping perspective readable.", "wide"], ["lens_normal", "Normal lens", "Use a neutral perspective for most explanatory scenes.", "normal"], ["lens_portrait", "Portrait lens", "Compress perspective modestly and isolate a subject without extreme telephoto flattening.", "portrait"], ["lens_telephoto", "Telephoto lens", "Compress foreground/background distance when the relation should read as spatially tight.", "telephoto"], ["lens_macro", "Macro lens", "Frame very small details with a lens intent that translates cleanly to Blender later.", "macro"]] as const).map(([id, label, summary, preset]) =>
    simpleCapability({ id, label, category: "camera_framing", group: "Lens", summary, instruction: { lens: { preset } } }),
  ),
  simpleCapability({ id: "focus_shallow", label: "Shallow focus", category: "camera_framing", group: "Lens", summary: "Use selective focus as an attention tool while preserving the focused teaching actor.", threejs: "approximate", fallback: "isolate", instruction: { lens: { depth_of_field: "shallow" } } }),
  simpleCapability({ id: "focus_deep", label: "Deep focus", category: "camera_framing", group: "Lens", summary: "Keep foreground and background teaching relationships readable together.", instruction: { lens: { depth_of_field: "deep" } }, demo: { required_visible_roles: ["primary_subject", "secondary_subject"] } }),
];

const angleSeeds = [
  ["eye_level", "Eye level", "Observe the subject neutrally from its natural viewing height."],
  ["low_angle", "Low angle", "Look upward to emphasize height, dominance, or the underside of a mechanism."],
  ["high_angle", "High angle", "Look downward to clarify layout and relative position."],
  ["top_down", "Top down", "Read arrangement, paths, and containment from directly above."],
  ["ground_level", "Ground level", "Place the camera near the support surface to emphasize contact and scale."],
  ["side_profile", "Side profile", "Make lateral motion and mechanical linkage easy to trace."],
  ["front_profile", "Front profile", "Look directly toward the front-facing identity or motion axis."],
  ["rear_profile", "Rear profile", "Look from behind to preserve travel direction or reveal what lies ahead."],
  ["three_quarter_front", "Three-quarter front", "Show front identity and side depth at the same time."],
  ["three_quarter_rear", "Three-quarter rear", "Keep directional movement readable while revealing depth behind the subject."],
  ["isometric", "Isometric", "Present a stable technical overview with minimal perspective distortion."],
  ["dutch_angle", "Dutch angle", "Roll the horizon slightly when instability or a changed frame of reference is part of the visual argument."],
  ["object_attached", "Object-attached view", "Anchor the camera to a moving actor while preserving a useful local view."],
  ["inside_object", "Inside-object view", "Place the camera within an enclosing system for an interior explanation."],
] as const;

const cameraAngles = angleSeeds.map(([id, label, summary]) =>
  simpleCapability({
    id,
    label,
    category: "camera_angle",
    group: "View orientation",
    summary,
    threejs: id === "inside_object" || id === "isometric"
      ? "approximate"
      : id === "object_attached"
        ? "compound"
        : "direct",
    fallback: id === "inside_object"
      ? "cutaway"
      : id === "isometric"
        ? "three_quarter_front"
        : id === "object_attached"
          ? "follow"
          : undefined,
    instruction: {
      camera: {
        angle: id,
        focus_role: "primary_subject",
        preserve_ground_reference: id !== "top_down",
      },
    },
    demo: { kind: `angle_${id}` },
  }),
);

const movementSeeds = [
  ["static", "Static", "Hold the camera still while scene motion carries the explanation.", "direct"],
  ["push_in", "Push in", "Move closer to increase emphasis without changing the subject relationship.", "direct"],
  ["pull_out", "Pull out", "Move away to reveal surrounding context or a larger system.", "direct"],
  ["dolly", "Dolly", "Translate the whole camera rig along a declared camera-relative or target-relative direction.", "direct"],
  ["truck_right", "Truck", "Move laterally while maintaining orientation and subject height.", "direct"],
  ["pedestal_up", "Pedestal", "Move vertically without tilting the camera.", "direct"],
  ["pan", "Pan", "Rotate horizontally from a fixed camera position.", "direct"],
  ["tilt", "Tilt", "Rotate vertically from a fixed camera position.", "direct"],
  ["orbit", "Orbit", "Travel around a target while keeping it centered.", "direct"],
  ["arc_left", "Arc left", "Curve left around the teaching subject without completing a full orbit.", "direct"],
  ["arc_right", "Arc right", "Curve right around the teaching subject without completing a full orbit.", "direct"],
  ["follow", "Follow", "Move with a travelling subject while preserving readable framing.", "compound"],
  ["lead_subject", "Lead subject", "Travel ahead of a moving actor so the frame reveals where the action is going.", "compound"],
  ["lag_follow", "Lag follow", "Let the actor pull away slightly before the camera catches up, preserving readable direction.", "compound"],
  ["track_parallel", "Track parallel", "Travel beside the subject so its lateral motion remains easy to compare.", "compound"],
  ["crane", "Crane", "Combine vertical and depth movement to reveal scale and spatial hierarchy.", "compound"],
  ["reverse_reveal", "Reverse reveal", "Move from an apparent result to the hidden source that created it.", "compound"],
  ["reframe", "Reframe", "Shift composition or focus between actors without treating the change as a completely new shot.", "compound"],
  ["rise_reveal", "Rise and reveal", "Lift the camera so an occluding foreground element gives way to the hidden subject.", "compound"],
  ["spline", "Spline path", "Travel through several semantic waypoints in one controlled continuous shot.", "compound"],
  ["camera_object_attached", "Object-attached camera", "Ride with a moving actor or mechanism using a stable local offset.", "compound"],
  ["pass_through", "Pass through", "Move through an opening, cutaway, or representation boundary to enter a system.", "compound"],
  ["settle", "Settle", "Decelerate into a stable final composition instead of ending a move abruptly.", "direct"],
] as const;

const cameraMovements = movementSeeds.map(([id, label, summary, support]) =>
  simpleCapability({
    id,
    label,
    category: "camera_movement",
    group: "Camera path",
    summary,
    threejs: support,
    coordinateSpaces: ["target_relative", "camera_relative", "world"],
    parameters: [
      { name: "strength", kind: "number", description: "How strongly the movement changes the base composition.", default_value: 0.55, min: 0, max: 1.5 },
      { name: "distance_m", kind: "number", description: "Optional world-distance override after scene geometry is known.", min: 0, max: 50, unit: "m" },
      { name: "degrees", kind: "number", description: "Optional angular travel for orbit and arc families.", min: -360, max: 360, unit: "deg" },
    ],
    fallback: support === "compound" ? "static" : undefined,
    instruction: {
      camera: {
        movement: id,
        focus_role: "primary_subject",
        keep_visible_roles: ["primary_subject"],
        movement_reason: summary,
      },
    },
    demo: { kind: `camera_${id}` },
  }),
);

const motionSeeds = [
  ["translate", "Translate", "Move an asset between two positions along a readable path.", "direct"],
  ["rotate", "Rotate", "Turn an asset around its own centre or a declared pivot.", "direct"],
  ["pivot", "Pivot", "Rotate around a meaningful contact point such as a hinge or support.", "compound"],
  ["oscillate", "Oscillate", "Repeat a back-and-forth motion from one controlled phase.", "compound"],
  ["follow_path", "Follow path", "Move an asset along a visible curved route.", "compound"],
  ["attach", "Attach", "Bind one actor to another actor or anchor while preserving identity.", "declared"],
  ["detach", "Detach", "Release a previously bound actor and continue with independent motion.", "declared"],
  ["enter_frame", "Enter frame", "Begin offscreen and move into the composition at a controlled time.", "direct"],
  ["exit_frame", "Exit frame", "Leave the composition without deleting the actor from the scene plan.", "direct"],
  ["scatter", "Scatter", "Move a group away from a common region while preserving group membership.", "compound"],
  ["move_toward", "Move toward", "Move relative to another actor so the direction remains correct after final layout.", "direct"],
  ["move_away", "Move away", "Move away from another actor without relying on a fixed world axis.", "direct"],
  ["follow_target", "Follow target", "Maintain a semantic following relationship to another moving actor.", "compound"],
  ["align", "Align", "Rotate or translate an actor until its declared axis lines up with a target.", "compound"],
  ["aim_at", "Aim at", "Orient an actor toward another actor or target point.", "direct"],
  ["hinge", "Hinge", "Rotate around a declared hinge axis or attachment region.", "compound"],
  ["slide", "Slide", "Translate along a declared local, surface, or target-relative axis.", "direct"],
  ["roll", "Roll", "Translate or rotate with rolling orientation preserved.", "compound"],
  ["spin", "Spin", "Rotate repeatedly around a declared local axis.", "direct"],
  ["lift", "Lift", "Raise an actor relative to its current support or local frame.", "direct"],
  ["lower", "Lower", "Lower an actor relative to its current support or local frame.", "direct"],
  ["object_open", "Open", "Move an articulated-looking actor through an opening motion using a declared axis or fallback whole-object hinge.", "approximate"],
  ["object_close", "Close", "Reverse an opening motion while preserving the same pivot intent.", "approximate"],
  ["insert_into", "Insert into target", "Move an actor into another actor's containment relationship while respecting allowed intersection.", "compound"],
  ["remove_from", "Remove", "Move an actor out of a containment relationship while preserving the source container.", "compound"],
  ["assemble", "Assemble", "Bring several parts into one readable assembled relationship.", "compound"],
  ["disassemble", "Disassemble", "Separate a system into readable component positions while preserving identity.", "compound"],
  ["expand", "Expand", "Increase visible extent to communicate growth, pressure, or magnification.", "direct"],
  ["contract", "Contract", "Decrease visible extent to communicate compression, emptying, or shrinking.", "direct"],
  ["flow", "Flow", "Move a process or carrier along a directional route through a system.", "compound"],
  ["fill", "Fill", "Increase occupied extent inside a container or region over time.", "approximate"],
  ["drain", "Drain", "Decrease occupied extent while maintaining the container as context.", "approximate"],
  ["emit", "Emit", "Move material, particles, or signals outward from a source actor.", "compound"],
  ["accumulate", "Accumulate", "Build up visible quantity at a target region over time.", "approximate"],
  ["split", "Split", "Separate one represented state into multiple spatially distinct results.", "compound"],
  ["merge", "Merge", "Bring represented actors together into one shared result region.", "compound"],
] as const;

const objectMotions = motionSeeds.map(([id, label, summary, support]) =>
  simpleCapability({
    id,
    label,
    category: "object_motion",
    group: "Actor movement",
    summary,
    threejs: support,
    coordinateSpaces: ["actor_local", "target_relative", "world", "surface_relative", "path_relative"],
    parameters: [
      { name: "distance_m", kind: "number", description: "Optional travel distance resolved after real asset scale is known.", min: 0, max: 50, unit: "m" },
      { name: "axis", kind: "enum", description: "Local or semantic axis for rotation/hinge/slide families.", options: ["x", "y", "z"] },
      { name: "degrees", kind: "number", description: "Angular travel for pivot, hinge, open, and close.", min: -360, max: 360, unit: "deg" },
      { name: "target_entity_id", kind: "entity", description: "Optional semantic target actor." },
    ],
    fallback: support === "compound" || support === "declared" ? "translate" : undefined,
    instruction: {
      event: {
        behaviour: motionBehaviourAlias(id as string),
        actor_role: "primary_subject",
        target_role: ["attach", "detach", "move_toward", "move_away", "follow_target", "align", "aim_at", "insert_into", "remove_from", "assemble", "merge", "flow"].includes(id as string) ? "secondary_subject" : null,
        description: summary,
      },
    },
    demo: { kind: `motion_${id}` },
  }),
);

const kinematicConstraints: DirectorCapability[] = [
  simpleCapability({
    id: "axis_lock",
    label: "Axis lock",
    category: "object_motion",
    group: "Kinematic constraints",
    summary: "Constrain an actor to one semantic motion axis so mechanisms such as pistons cannot drift sideways.",
    threejs: "compound",
    fallback: "slide",
    instruction: { constraint: { kind: "axis_lock", actor_role: "primary_subject", axis: "x" } },
    demo: { kind: "constraint_axis_lock" },
  }),
  simpleCapability({
    id: "attach_constraint",
    label: "Persistent attachment",
    category: "object_motion",
    group: "Kinematic constraints",
    summary: "Keep one actor attached to a moving target with a stable semantic offset for the full shot.",
    threejs: "compound",
    fallback: "attach",
    instruction: { constraint: { kind: "attach", actor_role: "primary_subject", target_role: "secondary_subject" } },
    demo: { kind: "constraint_attach", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "maintain_distance",
    label: "Maintain distance",
    category: "object_motion",
    group: "Kinematic constraints",
    summary: "Preserve a declared distance between two actors while other movement continues.",
    threejs: "compound",
    fallback: "follow_target",
    instruction: { constraint: { kind: "maintain_distance", actor_role: "primary_subject", target_role: "secondary_subject", distance_m: 2 } },
    demo: { kind: "constraint_distance", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "rigid_link",
    label: "Rigid link",
    category: "object_motion",
    group: "Kinematic constraints",
    summary: "Keep a link actor spanning two moving endpoints, preserving connection while its angle and visible length update.",
    threejs: "compound",
    fallback: "align",
    instruction: { constraint: { kind: "rigid_link", actor_role: "primary_subject", endpoint_roles: ["secondary_subject", "context_subject"] } },
    demo: { kind: "constraint_rigid_link", required_visible_roles: ["primary_subject", "secondary_subject", "context_subject"] },
  }),
  simpleCapability({
    id: "look_at_constraint",
    label: "Look-at constraint",
    category: "object_motion",
    group: "Kinematic constraints",
    summary: "Keep an actor oriented toward a target while either actor moves.",
    threejs: "compound",
    fallback: "aim_at",
    instruction: { constraint: { kind: "look_at", actor_role: "primary_subject", target_role: "secondary_subject" } },
    demo: { kind: "constraint_look_at", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
];

const blockingSeeds = [
  ["on_ground", "On ground", "Keep an actor grounded while the cinematic composition changes around it."],
  ["on_surface", "On surface", "Place one actor on a visible support region of another."],
  ["attached_to", "Attached to", "Bind an actor to a measured attachment region on another actor."],
  ["inside", "Inside", "Place one actor within another actor's measured containment region."],
  ["beside", "Beside", "Place actors adjacent with ground contact and readable clearance."],
  ["in_front_of", "In front of", "Order actors in depth while keeping the rear actor partly readable."],
  ["behind", "Behind", "Place an actor behind another to support concealment or depth."],
  ["between", "Between", "Place the primary actor between two reference actors."],
  ["facing", "Facing", "Orient one actor toward another actor or process."],
  ["facing_away", "Facing away", "Orient an actor away from another actor while preserving the relationship in frame."],
  ["foreground", "Foreground", "Reserve a near-camera layer for an actor without letting it obscure the teaching subject."],
  ["midground", "Midground", "Stage an actor in the middle visual layer so foreground and background remain legible."],
  ["background", "Background", "Keep context visible behind the main action without competing for attention."],
  ["screen_left", "Screen left", "Bias an actor toward the left side of the composed frame after the camera is solved."],
  ["screen_right", "Screen right", "Bias an actor toward the right side of the composed frame after the camera is solved."],
  ["surround", "Surround", "Arrange supporting actors around a primary subject while preserving a readable center."],
  ["form_line", "Form line", "Arrange actors along a readable line or process axis."],
  ["form_circle", "Form circle", "Arrange actors around a center to communicate cyclic or surrounding structure."],
  ["cluster", "Cluster", "Group related actors tightly while preserving individual readability."],
  ["symmetrical_pair", "Symmetrical pair", "Balance two actors around a visual center for direct comparison."],
  ["layered_depth", "Foreground / midground / background", "Stage three actors across depth to create readable visual hierarchy."],
] as const;

const blockingPlacement = blockingSeeds.map(([id, label, summary]) => {
  const groupFormation = [
    "surround",
    "form_line",
    "form_circle",
    "cluster",
    "symmetrical_pair",
  ].includes(id);
  const groupParticipants =
    id === "symmetrical_pair"
      ? ["primary_subject", "secondary_subject"]
      : ["primary_subject", "secondary_subject", "context_subject"];

  return simpleCapability({
    id,
    label,
    category: "blocking_placement",
    group: "Spatial relationship",
    summary,
    threejs: id === "on_surface" || id === "inside" || id === "attached_to" ? "approximate" : "direct",
    fallback: id === "inside" ? "beside" : undefined,
    instruction: {
      blocking: groupFormation
        ? {
            relation: id,
            actor_role: "primary_subject",
            target_role:
              id === "symmetrical_pair" ? "secondary_subject" : null,
            participant_roles: groupParticipants,
            center_role: id === "surround" ? "primary_subject" : null,
            semantic_scope: "participant_set",
            preserve_clearance: true,
            allow_intersection: false,
          }
        : id === "between"
          ? {
              relation: id,
              actor_role: "primary_subject",
              target_role: "secondary_subject",
              reference_roles: ["secondary_subject", "context_subject"],
              semantic_scope: "three_actor_relationship",
              preserve_clearance: true,
              allow_intersection: false,
            }
          : {
              relation: id,
              actor_role: "primary_subject",
              target_role: "secondary_subject",
              preserve_clearance: true,
              allow_intersection: false,
            },
    },
    demo: {
      kind: `blocking_${id}`,
      required_visible_roles:
        id === "layered_depth" ||
        id === "between" ||
        ["surround", "form_line", "form_circle", "cluster"].includes(id)
          ? ["primary_subject", "secondary_subject", "context_subject"]
          : ["primary_subject", "secondary_subject"],
    },
  });
});

const lightingSeeds = [
  ["neutral_studio", "Neutral studio", "Use balanced light so shape, material, and motion remain easy to inspect."],
  ["high_key", "High key", "Use bright, low-contrast lighting for maximum clarity."],
  ["low_key", "Low key", "Use controlled darkness and selective illumination to focus attention."],
  ["backlit", "Backlit", "Place the main source behind the subject to reveal outline and depth."],
  ["rim_lit", "Rim lit", "Add a narrow edge light to separate the subject from the background."],
  ["spotlight_subject", "Spotlight subject", "Concentrate illumination on the active subject while dimming competitors."],
  ["highlight_subject", "Highlight subject", "Temporarily add a tight high-contrast silhouette outline to the active subject, matching the Golden Lunch emphasis grammar without adding a halo volume or moving the actor."],
  ["warm_cool_contrast", "Warm / cool contrast", "Separate roles using contrasting light temperatures."],
  ["preserve_shadow", "Preserve shadow", "Keep a cast shadow readable because it carries part of the explanation."],
  ["motivated_source", "Motivated source", "Tie the visible light to a scene actor such as a lamp, fire, screen, or glowing process."],
  ["light_reveal", "Light reveal", "Use a timed lighting change to reveal an actor or relationship instead of moving the camera alone."],
  ["dim_environment", "Dim environment", "Reduce environmental light so the current teaching subject has clear priority."],
  ["emissive_subject", "Emissive subject", "Let the active process appear to emit light when that supports the explanation."],
  ["track_spotlight", "Tracking spotlight", "Keep a moving subject selectively illuminated as it travels."],
  ["shadow_projection", "Shadow projection", "Treat the projected shadow as an explicit explanatory actor that must remain readable."],
  ["volumetric_beam", "Volumetric beam", "Use a visible light path to clarify direction, source, or occlusion."],
  ["exposure_shift", "Exposure shift", "Shift overall exposure deliberately to support a reveal or transition in visual priority."],
] as const;

const lightingEmphasis = lightingSeeds.map(([id, label, summary]) =>
  simpleCapability({
    id,
    label,
    category: "lighting_emphasis",
    group: "Light intent",
    summary,
    threejs: ["preserve_shadow", "motivated_source", "light_reveal", "track_spotlight", "shadow_projection", "volumetric_beam", "exposure_shift"].includes(id as string) ? "compound" : "direct",
    fallback: id === "preserve_shadow" || id === "shadow_projection" ? "backlit" : undefined,
    instruction: {
      lighting: {
        intent: id,
        emphasized_role: "primary_subject",
        preserve_shadow_role: id === "preserve_shadow" ? "primary_subject" : null,
      },
    },
    demo: { kind: `lighting_${id}` },
  }),
);

const transitionContinuity: DirectorCapability[] = [
  simpleCapability({
    id: "hard_cut",
    label: "Hard cut",
    category: "transition_continuity",
    group: "Transitions",
    summary: "Switch instantly between two deliberate camera compositions.",
    instruction: { transition: "hard_cut", preserve_visual_anchor_role: "primary_subject" },
    demo: { kind: "transition_hard_cut" },
  }),
  simpleCapability({
    id: "smooth_blend",
    label: "Smooth blend",
    category: "transition_continuity",
    group: "Transitions",
    summary: "Interpolate between camera poses while retaining the subject as a visual anchor.",
    instruction: { transition: "smooth_blend", preserve_visual_anchor_role: "primary_subject" },
    demo: { kind: "transition_smooth_blend" },
  }),
  simpleCapability({
    id: "match_cut",
    label: "Match cut",
    category: "transition_continuity",
    group: "Transitions",
    summary: "Cut between compositions that preserve a matching shape, position, or action.",
    threejs: "approximate",
    fallback: "hard_cut",
    instruction: { transition: "match_cut", match_role: "primary_subject", match_property: "screen_position_and_scale" },
    demo: { kind: "transition_match_cut" },
  }),
  simpleCapability({
    id: "continuous_take",
    label: "Continuous take",
    category: "transition_continuity",
    group: "Transitions",
    summary: "Carry several attention changes through one uninterrupted camera path.",
    threejs: "compound",
    fallback: "smooth_blend",
    instruction: { transition: "continuous_take", attention_sequence: ["primary_subject", "secondary_subject", "context_subject"] },
    demo: { kind: "transition_continuous_take", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({ id: "cut_on_action", label: "Cut on action", category: "transition_continuity", group: "Transitions", summary: "Place a cut inside an ongoing action so the motion bridges the edit.", threejs: "approximate", fallback: "hard_cut", demo: { kind: "transition_cut_on_action" } }),
  simpleCapability({ id: "crossfade", label: "Crossfade", category: "transition_continuity", group: "Transitions", summary: "Blend between representations when continuity matters more than a hard spatial cut.", threejs: "approximate", fallback: "smooth_blend", demo: { kind: "transition_crossfade" } }),
  simpleCapability({ id: "camera_pass_transition", label: "Camera pass-through transition", category: "transition_continuity", group: "Transitions", summary: "Use a camera move through a surface or cutaway boundary to transition into another scale or representation.", threejs: "compound", fallback: "smooth_blend", demo: { kind: "transition_camera_pass" } }),
  simpleCapability({ id: "scale_transition", label: "Scale transition", category: "transition_continuity", group: "Transitions", summary: "Move between macro and micro scales while preserving a stable visual anchor.", threejs: "compound", fallback: "smooth_blend", demo: { kind: "transition_scale" } }),
  simpleCapability({ id: "hold", label: "Hold", category: "transition_continuity", group: "Transitions", summary: "Pause on a resolved composition before the next shot or representation change.", demo: { kind: "transition_hold" } }),
  simpleCapability({
    id: "keep_visible",
    label: "Keep visible",
    category: "transition_continuity",
    group: "Continuity constraints",
    summary: "Maintain one or more actors in frame throughout the camera move.",
    instruction: { continuity: { keep_visible_roles: ["primary_subject", "secondary_subject"] } },
    demo: { kind: "continuity_keep_visible", required_visible_roles: ["primary_subject", "secondary_subject"] },
  }),
  simpleCapability({
    id: "maintain_screen_direction",
    label: "Maintain screen direction",
    category: "transition_continuity",
    group: "Continuity constraints",
    summary: "Keep travel direction consistent across camera changes so motion remains easy to follow.",
    threejs: "compound",
    fallback: "keep_visible",
    instruction: { continuity: { maintain_screen_direction: true, actor_role: "primary_subject" } },
    demo: { kind: "continuity_screen_direction" },
  }),
  simpleCapability({
    id: "preserve_visual_anchor",
    label: "Preserve visual anchor",
    category: "transition_continuity",
    group: "Continuity constraints",
    summary: "Keep the teaching subject near a stable screen position during reframing.",
    instruction: { continuity: { preserve_visual_anchor_role: "primary_subject", anchor_region: "center_left" } },
    demo: { kind: "continuity_visual_anchor" },
  }),
  simpleCapability({
    id: "avoid_occlusion",
    label: "Avoid occlusion",
    category: "transition_continuity",
    group: "Continuity constraints",
    summary: "Choose a camera path that does not allow foreground actors to hide the teaching subject.",
    threejs: "approximate",
    fallback: "keep_visible",
    instruction: { continuity: { avoid_occlusion_roles: ["primary_subject"], maximum_occlusion_ratio: 0.2 } },
    demo: { kind: "continuity_avoid_occlusion", maximum_occlusion_ratio: 0.2 },
  }),
  simpleCapability({ id: "maintain_axis", label: "Maintain axis", category: "transition_continuity", group: "Continuity constraints", summary: "Stay on a consistent side of the action axis unless the direction explicitly motivates crossing it.", threejs: "compound", fallback: "maintain_screen_direction", demo: { kind: "continuity_axis" } }),
  simpleCapability({ id: "eyeline_match", label: "Eyeline match", category: "transition_continuity", group: "Continuity constraints", summary: "Preserve where an actor appears to be looking across a camera change.", threejs: "compound", fallback: "keep_visible", demo: { kind: "continuity_eyeline" } }),
  simpleCapability({ id: "preserve_actor_state", label: "Preserve actor state", category: "transition_continuity", group: "Continuity constraints", summary: "Carry object visibility, pose, attachment, and transformed state into the next shot.", threejs: "compound", fallback: "keep_visible", demo: { kind: "continuity_actor_state" } }),
  simpleCapability({ id: "preserve_action_continuity", label: "Preserve action continuity", category: "transition_continuity", group: "Continuity constraints", summary: "Keep action timing and progress coherent across a cut or reframe.", threejs: "compound", fallback: "maintain_screen_direction", demo: { kind: "continuity_action" } }),
  simpleCapability({ id: "preserve_screen_position", label: "Preserve screen position", category: "transition_continuity", group: "Continuity constraints", summary: "Keep the teaching actor near the same screen coordinate across a transition.", threejs: "compound", fallback: "preserve_visual_anchor", demo: { kind: "continuity_screen_position" } }),
  simpleCapability({ id: "preserve_relative_scale", label: "Preserve relative scale", category: "transition_continuity", group: "Continuity constraints", summary: "Avoid changing the apparent comparison between actors merely because the camera changed.", threejs: "compound", fallback: "keep_visible", demo: { kind: "continuity_relative_scale" } }),
  simpleCapability({ id: "preserve_orientation", label: "Preserve orientation", category: "transition_continuity", group: "Continuity constraints", summary: "Keep actor-facing and system orientation stable across reframing.", threejs: "compound", fallback: "maintain_screen_direction", demo: { kind: "continuity_orientation" } }),
  simpleCapability({ id: "match_motion_direction", label: "Match motion direction", category: "transition_continuity", group: "Continuity constraints", summary: "Make outgoing and incoming motion point in a consistent screen direction.", threejs: "compound", fallback: "maintain_screen_direction", demo: { kind: "continuity_motion_direction" } }),
];

export const DIRECTOR_CAPABILITIES: DirectorCapability[] = [
  ...narrativeAttention,
  ...cameraFraming,
  ...compositionLens,
  ...cameraAngles,
  ...cameraMovements,
  ...objectMotions,
  ...kinematicConstraints,
  ...blockingPlacement,
  ...lightingEmphasis,
  ...transitionContinuity,
];

export const DIRECTOR_CATEGORY_LABELS: Record<DirectorCapabilityCategory, string> = {
  narrative_attention: "Narrative & attention",
  camera_framing: "Camera framing",
  camera_angle: "Camera angle",
  camera_movement: "Camera movement",
  object_motion: "Object motion",
  blocking_placement: "Blocking & placement",
  lighting_emphasis: "Lighting & emphasis",
  transition_continuity: "Transitions & continuity",
};

export function directorCapabilityById(id: string) {
  return DIRECTOR_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}

export const DIRECTOR_LINEAR_CAMERA_TRAVEL_DEMO_POLICY_VERSION =
  "director_linear_camera_travel_demo_phase1b7a11a28_v1" as const;

/**
 * Qualification-only Dolly cue.
 *
 * The production `dolly` runtime is already a generic whole-rig translation:
 * camera position and aim point move together. The old empty-parameter demo
 * inherited the runtime's [0, 0, 1] camera-forward default, which made a
 * stationary subject read almost exactly like Push in. A bounded diagonal rail
 * exposes the actual rig-translation contract without changing production
 * camera behavior.
 */
export const DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION = [
  0.7,
  0,
  0.7,
] as const;

export const DIRECTOR_DOLLY_DEMO_DISTANCE_M = 0.8 as const;

export const DIRECTOR_REVERSE_REVEAL_DEMO_DEGREES = 72 as const;
export const DIRECTOR_RISE_REVEAL_DEMO_DISTANCE_M = 1.6 as const;

function movementAlias(id: string): DirectorCameraMovement {
  if (id === "pull_out") return "pull_back";
  if (id === "truck_right") return "truck";
  if (id === "pedestal_up") return "pedestal";
  if (id === "camera_object_attached") return "object_attached";
  if ([
    "static", "push_in", "dolly", "pan", "tilt", "orbit", "arc_left", "arc_right",
    "follow", "lead_subject", "lag_follow", "track_parallel", "crane", "reverse_reveal",
    "reframe", "rise_reveal", "spline", "pass_through", "settle",
  ].includes(id)) return id as DirectorCameraMovement;
  return "static";
}

function motionBehaviourAlias(id: string): DirectorEvent["behaviour"] {
  if (id === "object_open") return "open";
  if (id === "object_close") return "close";
  if (id === "translate" || id === "enter_frame" || id === "exit_frame") return "move_to";
  if (id === "follow_path") return "move_along_path";
  if (id === "scatter") return "move_away";
  if ([
    "rotate", "pivot", "oscillate", "attach", "detach", "move_toward", "move_away",
    "follow_target", "align", "aim_at", "hinge", "slide", "roll", "spin", "lift", "lower",
    "open", "close", "insert_into", "remove_from", "assemble", "disassemble", "expand", "contract",
    "flow", "fill", "drain", "emit", "accumulate", "split", "merge",
  ].includes(id)) return id as DirectorEvent["behaviour"];
  return "move_to";
}

export const DIRECTOR_SPLINE_DEMO_POLICY_VERSION =
  "director_spline_demo_waypoints_phase1b7a11a26_v1" as const;

/**
 * Demo/evidence spline rail expressed relative to the current optical target.
 * The runtime prepends the already-solved camera pose, so the capability enters
 * the Catmull-Rom rail continuously instead of jumping to an absolute world point.
 */
export const DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS = [
  [1.15, 1.05, 2.85],
  [-0.75, 1.35, 2.6],
  [-2.25, 0.85, 1.45],
  [-2.4, 1.2, -0.35],
] as const;

function baseShot(capability: DirectorCapability): DirectorShotDirectionV2 {
  return {
    narrative_job: "orient",
    visual_claim: capability.semantic_intent,
    composition: {
      framing: "medium",
      angle: "three_quarter_front",
      screen_anchor: "center",
      keep_visible_entity_ids: ["primary_subject"],
      foreground_entity_ids: [],
      background_entity_ids: ["context_subject"],
      preserve_relationship_entity_ids: [],
      preserve_relative_scale: false,
      caption_safe_region: "auto",
      negative_space_side: "none",
    },
    lens: {
      preset: "normal",
      focal_length_mm: 50,
      field_of_view_degrees: 44,
      depth_of_field: "deep",
      aperture_f: 5.6,
      focus_entity_id: "primary_subject",
    },
    camera: {
      focus_entity_ids: ["primary_subject"],
      movement_steps: [{
        movement: "static",
        start_progress: 0,
        end_progress: 1,
        strength: 0,
        easing: "ease_in_out",
        coordinate_space: "target_relative",
        target_entity_id: "primary_subject",
        parameters: {},
      }],
      start_intent: capability.summary,
      end_intent: "Settle with the teaching subject readable.",
      movement_reason: capability.summary,
    },
    blocking: [],
    constraints: [],
    lighting: {
      intents: ["neutral_studio"],
      motivated_source_entity_id: null,
      emphasized_entity_ids: ["primary_subject"],
      preserve_shadow_entity_ids: [],
    },
    continuity: {
      rules: ["keep_visible", "avoid_occlusion"],
      maximum_occlusion_ratio: capability.demo.maximum_occlusion_ratio ?? 0.2,
      maintain_axis_entity_ids: [],
    },
    reveal_at: null,
    hold_after_ms: 650,
    success_observation: capability.demo.narration,
  };
}

function narrativeJobForId(id: string): DirectorShotDirectionV2["narrative_job"] {
  const allowed = [
    "establish", "orient", "introduce", "isolate", "compare", "conceal", "foreshadow", "reveal",
    "reverse_assumption", "connect_cause", "show_consequence", "build_from_parts", "enter_system",
    "change_scale", "show_inside_outside", "hold_for_understanding", "return_to_context", "summarize",
  ];
  return allowed.includes(id) ? id as DirectorShotDirectionV2["narrative_job"] : "orient";
}

export function directorCapabilityDemoShot(capability: DirectorCapability): DirectorShotDirectionV2 {
  const shot = baseShot(capability);

  if (capability.category === "narrative_attention") {
    shot.narrative_job = narrativeJobForId(capability.id);
    if (capability.id === "establish" || capability.id === "orient") {
      shot.composition.framing = "wide";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "push_in", start_progress: 0.12, end_progress: 0.78, strength: 0.28, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.76, end_progress: 1, strength: 0.5, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }];
    } else if (capability.id === "isolate") {
      shot.composition.framing = "medium_close";
      shot.composition.screen_anchor = "left_third";
      shot.lens.preset = "portrait"; shot.lens.focal_length_mm = 85; shot.lens.field_of_view_degrees = 34; shot.lens.depth_of_field = "shallow";
      shot.camera.movement_steps = [{ movement: "push_in", start_progress: 0, end_progress: 0.72, strength: 0.48, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.7, end_progress: 1, strength: 0.4, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }];
      shot.lighting.intents = ["low_key", "spotlight_subject", "rim_lit"];
      shot.continuity.rules.push("preserve_visual_anchor");
    } else if (capability.id === "compare") {
      shot.composition.framing = "two_shot"; shot.composition.angle = "eye_level"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"]; shot.composition.preserve_relative_scale = true;
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"]; shot.lens.depth_of_field = "deep";
      shot.continuity.rules.push("preserve_relative_scale");
    } else if (capability.id === "introduce") {
      shot.composition.framing = "medium_wide";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.screen_anchor = "center_left";
      shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.18, end_progress: 0.7, strength: 0.72, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.68, end_progress: 0.94, strength: 0.48, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }];
      shot.lighting.intents = ["neutral_studio", "light_reveal"];
      shot.reveal_at = 0.22;
    } else if (capability.id === "build_from_parts") {
      shot.composition.framing = "medium_wide";
      shot.composition.angle = "three_quarter_front";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.movement_steps = [{ movement: "push_in", start_progress: 0.08, end_progress: 0.68, strength: 0.3, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.66, end_progress: 0.96, strength: 0.45, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }];
      shot.continuity.rules.push("preserve_action_continuity");
    } else if (capability.id === "show_inside_outside") {
      shot.composition.framing = "two_shot";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.25, end_progress: 0.68, strength: 0.72, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: {} }, { movement: "settle", start_progress: 0.66, end_progress: 0.94, strength: 0.42, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
      shot.composition.preserve_relative_scale = true;
      shot.continuity.rules.push("preserve_relative_scale");
    } else if (["conceal", "foreshadow", "reveal", "reverse_assumption"].includes(capability.id)) {
      shot.composition.framing = "medium_close"; shot.composition.screen_anchor = "left_third"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.blocking = [{ relation: "behind", actor_entity_id: "secondary_subject", target_entity_id: "primary_subject", screen_region: "center_right", preserve_clearance: true, parameters: {} }];
      shot.camera.movement_steps = capability.id === "conceal"
        ? [{ movement: "static", start_progress: 0, end_progress: 1, strength: 0, easing: "linear", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }]
        : [{ movement: "reverse_reveal", start_progress: 0.15, end_progress: 0.72, strength: 0.8, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: { degrees: capability.id === "foreshadow" ? 20 : 48 } }, { movement: "settle", start_progress: 0.72, end_progress: 1, strength: 0.55, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
      shot.lighting.intents = capability.id === "conceal" ? ["low_key", "rim_lit"] : ["low_key", "light_reveal", "rim_lit"];
      shot.reveal_at = capability.id === "conceal" ? null : capability.id === "foreshadow" ? 0.72 : 0.52;
      shot.hold_after_ms = 1100;
    } else if (capability.id === "connect_cause") {
      shot.composition.framing = "medium_wide"; shot.composition.angle = "side_profile"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "context_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.12, end_progress: 0.8, strength: 0.9, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: {} }, { movement: "track_parallel", start_progress: 0.1, end_progress: 0.82, strength: 0.3, easing: "ease_in_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.8, end_progress: 1, strength: 0.4, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
    } else if (capability.id === "show_consequence") {
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"]; shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.45, end_progress: 0.72, strength: 0.9, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: {} }, { movement: "settle", start_progress: 0.7, end_progress: 1, strength: 0.55, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
      shot.hold_after_ms = 1400;
    } else if (capability.id === "enter_system" || capability.id === "change_scale") {
      shot.composition.framing = "wide"; shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "push_in", start_progress: 0, end_progress: 0.42, strength: 0.65, easing: "ease_in", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "pass_through", start_progress: 0.35, end_progress: 0.78, strength: 0.75, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.78, end_progress: 1, strength: 0.5, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
    } else if (capability.id === "return_to_context" || capability.id === "summarize") {
      shot.composition.framing = "wide"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"]; shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.movement_steps = [{ movement: "pull_back", start_progress: 0, end_progress: 0.72, strength: 0.58, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.7, end_progress: 1, strength: 0.45, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }];
    } else if (capability.id === "hold_for_understanding") {
      shot.camera.movement_steps = [{ movement: "settle", start_progress: 0, end_progress: 0.35, strength: 0.45, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "static", start_progress: 0.35, end_progress: 1, strength: 0, easing: "linear", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }];
      shot.hold_after_ms = 1700;
    }
  }

  if (capability.category === "camera_framing") {
    const framingIds = ["extreme_wide", "wide", "full", "medium_wide", "medium", "medium_close", "close", "extreme_close", "macro", "insert", "two_shot", "group_shot", "over_shoulder", "point_of_view", "cutaway"];
    if (framingIds.includes(capability.id)) shot.composition.framing = capability.id as DirectorShotDirectionV2["composition"]["framing"];
    if (capability.id === "two_shot") {
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.preserve_relationship_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.preserve_relative_scale = true;
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
    }
    if (capability.id === "group_shot") {
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.composition.preserve_relationship_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.composition.preserve_relative_scale = true;
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
    }
    if (capability.id === "macro" || capability.id === "insert") {
      // Phase 1B.3.1 gives the two detail framings different semantic proof
      // targets: Macro inspects the tiny fastener (secondary), while Insert
      // isolates the larger lever/control (context). Real assets can use the
      // same grammar once feature/sub-part anchors become directable.
      const detailRole = capability.id === "macro"
        ? "secondary_subject"
        : "context_subject";
      shot.composition.keep_visible_entity_ids = [detailRole];
      shot.composition.preserve_relationship_entity_ids = ["primary_subject", detailRole];
      shot.camera.focus_entity_ids = [detailRole];
      shot.lens.focus_entity_id = detailRole;
      shot.lens.preset = capability.id === "macro" ? "macro" : "portrait";
      shot.lens.focal_length_mm = capability.id === "macro" ? 100 : 72;
      shot.lens.field_of_view_degrees = capability.id === "macro" ? 24 : 34;
    }
    if (capability.id === "left_third") shot.composition.screen_anchor = "left_third";
    if (capability.id === "right_third") shot.composition.screen_anchor = "right_third";
    if (capability.id === "negative_space_left") shot.composition.negative_space_side = "left";
    if (capability.id === "negative_space_right") shot.composition.negative_space_side = "right";
    if (capability.id === "two_subject_balance") { shot.composition.framing = "two_shot"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"]; shot.composition.preserve_relative_scale = true; shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"]; }
    if (capability.id === "over_shoulder") {
      shot.composition.foreground_entity_ids = ["primary_subject"];
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.camera.focus_entity_ids = ["secondary_subject"];
      shot.lens.focus_entity_id = "secondary_subject";
    }
    if (capability.id === "point_of_view") {
      shot.composition.foreground_entity_ids = ["primary_subject"];
      const qualificationHasContextReference =
        capability.demo.required_visible_roles.includes("context_subject");
      shot.composition.keep_visible_entity_ids = qualificationHasContextReference
        ? ["secondary_subject", "context_subject"]
        : ["secondary_subject"];
      shot.composition.preserve_relationship_entity_ids =
        qualificationHasContextReference
          ? ["secondary_subject", "context_subject"]
          : [];
      shot.camera.focus_entity_ids = ["secondary_subject"];
      shot.lens.focus_entity_id = "secondary_subject";
    }
    if (capability.id === "cutaway") {
      // A.11A.21 compatibility path. A.11A.22 defers Cutaway from active atomic
      // framing qualification because its cinematic meaning depends on before/after
      // shot context, but the frozen legacy id remains executable for old plans.
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.preserve_relationship_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.preserve_relative_scale = true;
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.lens.focus_entity_id = "secondary_subject";
      shot.lens.preset = "portrait";
      shot.lens.focal_length_mm = 70;
      shot.lens.field_of_view_degrees = 36;
    }
    const lens = capability.id.replace(/^lens_/, "");
    if (["ultra_wide", "wide", "normal", "portrait", "telephoto", "macro"].includes(lens) && capability.id.startsWith("lens_")) {
      shot.lens.preset = lens as DirectorShotDirectionV2["lens"]["preset"];
      const settings: Record<string, [number, number]> = { ultra_wide: [18, 72], wide: [28, 58], normal: [50, 44], portrait: [85, 34], telephoto: [135, 24], macro: [100, 28] };
      [shot.lens.focal_length_mm, shot.lens.field_of_view_degrees] = settings[lens];
      // Ordinary demos retain the historical two-actor lens comparison. A.11A.24
      // Qualification promotes context_subject into required_visible_roles; when
      // that controlled depth reference is present, frame the exact same near /
      // mid / far trio for every focal-length sibling so only lens perspective
      // changes across the comparison block.
      const qualificationHasDepthReference =
        capability.demo.required_visible_roles.includes("context_subject");
      const lensEvidenceRoles = qualificationHasDepthReference
        ? ["primary_subject", "secondary_subject", "context_subject"]
        : ["primary_subject", "secondary_subject"];
      shot.composition.framing = "two_shot";
      shot.composition.keep_visible_entity_ids = lensEvidenceRoles;
      shot.composition.preserve_relationship_entity_ids = lensEvidenceRoles;
      shot.composition.preserve_relative_scale = true;
      shot.camera.focus_entity_ids = lensEvidenceRoles;
      shot.lens.focus_entity_id = "secondary_subject";
    }
    if (capability.id === "focus_shallow") { shot.lens.depth_of_field = "shallow"; shot.lens.aperture_f = 2.4; }
    if (capability.id === "focus_deep") { shot.lens.depth_of_field = "deep"; shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"]; shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"]; }
  }

  if (capability.category === "camera_angle") {
    shot.composition.angle = capability.id as DirectorShotDirectionV2["composition"]["angle"];
    if (capability.id === "isometric") {
      // A technical overview needs a multi-actor spatial envelope; focusing only
      // the primary actor made the old proof aim at empty floor/context.
      shot.composition.framing = "wide";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.lens.focus_entity_id = "primary_subject";
      shot.lens.focal_length_mm = 70;
      shot.lens.field_of_view_degrees = 28;
    }
    if (capability.id === "object_attached") {
      shot.composition.foreground_entity_ids = ["primary_subject"];
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.lens.focus_entity_id = "primary_subject";
    }
  }

  if (capability.category === "camera_movement") {
    const movement = movementAlias(capability.id);
    const targetEntityId = movement === "pan" || movement === "reframe"
      ? "secondary_subject"
      : "primary_subject";
    const movementParameters =
      movement === "arc_left" || movement === "arc_right"
        ? { degrees: 48 }
        : movement === "track_parallel"
          ? { direction_sign: 1, distance_m: 3.15 }
          : movement === "dolly"
            ? {
                direction: [...DIRECTOR_DOLLY_DEMO_CAMERA_RELATIVE_DIRECTION],
                distance_m: DIRECTOR_DOLLY_DEMO_DISTANCE_M,
              }
            : movement === "reverse_reveal"
              ? { degrees: DIRECTOR_REVERSE_REVEAL_DEMO_DEGREES }
              : movement === "rise_reveal"
                ? { distance_m: DIRECTOR_RISE_REVEAL_DEMO_DISTANCE_M }
                : movement === "object_attached"
              ? { view_direction: [0, -0.12, 1], look_distance_m: 5.0 }
              : movement === "spline"
                ? {
                    target_relative_points:
                      DIRECTOR_SPLINE_DEMO_TARGET_RELATIVE_WAYPOINTS.map(
                        (point) => [...point],
                      ),
                    prepend_current_pose: true,
                  }
                : {};
    shot.camera.movement_steps = movement === "settle"
      ? [
          { movement: "push_in", start_progress: 0.05, end_progress: 0.56, strength: 0.34, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} },
          { movement: "settle", start_progress: 0.5, end_progress: 0.94, strength: 0.75, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} },
        ]
      : [{
          movement,
          // Track-parallel is a stable shot relationship, so the controlled
          // proof starts on the side rail instead of zooming into it after 5%.
          start_progress: movement === "track_parallel" ? 0 : 0.05,
          end_progress: movement === "track_parallel" ? 1 : 0.9,
          strength: movement === "static" ? 0 : 0.78,
          easing:
            movement === "track_parallel" || movement === "spline"
              ? "linear"
              : "ease_in_out",
          coordinate_space: movement === "dolly" ? "camera_relative" : "target_relative",
          target_entity_id: targetEntityId,
          parameters: movementParameters,
        }];
    if (["follow", "lead_subject", "lag_follow", "track_parallel", "object_attached"].includes(movement)) {
      shot.composition.framing = "medium_wide";
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.lens.focus_entity_id = "primary_subject";
    }
    if (["pan", "reframe", "reverse_reveal"].includes(movement)) {
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.composition.keep_visible_entity_ids =
        movement === "reverse_reveal"
          ? ["primary_subject"]
          : ["primary_subject", "secondary_subject"];
    }
    if (movement === "reverse_reveal") {
      shot.composition.preserve_relationship_entity_ids = [
        "primary_subject",
        "secondary_subject",
      ];
      shot.lens.focus_entity_id = "secondary_subject";
      shot.continuity.rules = ["preserve_action_continuity"];
      shot.reveal_at = 0.5;
      shot.hold_after_ms = 1100;
      shot.success_observation =
        "The source begins substantially concealed behind the apparent result, then becomes separately readable through camera parallax.";
    }
    if (movement === "rise_reveal") {
      shot.composition.keep_visible_entity_ids = [];
      shot.composition.foreground_entity_ids = ["secondary_subject"];
      shot.composition.background_entity_ids = ["primary_subject"];
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.lens.focus_entity_id = "primary_subject";
      shot.continuity.rules = ["preserve_action_continuity"];
      shot.reveal_at = 0.48;
      shot.hold_after_ms = 1100;
      shot.success_observation =
        "The foreground occluder substantially covers the subject at the opening, then the rising camera exposes the subject above it.";
    }
  }

  if (["axis_lock", "attach_constraint", "maintain_distance", "rigid_link", "look_at_constraint"].includes(capability.id)) {
    shot.composition.framing = "medium_wide";
    shot.composition.angle = "side_profile";
    shot.composition.keep_visible_entity_ids = capability.id === "rigid_link"
      ? ["primary_subject", "secondary_subject", "context_subject"]
      : ["primary_subject", "secondary_subject"];
    shot.camera.focus_entity_ids = capability.id === "rigid_link"
      ? ["primary_subject", "secondary_subject", "context_subject"]
      : ["primary_subject", "secondary_subject"];
    const kind = capability.id === "attach_constraint"
      ? "attach"
      : capability.id === "look_at_constraint"
        ? "look_at"
        : capability.id as "axis_lock" | "maintain_distance" | "rigid_link";
    shot.constraints = [{
      kind,
      actor_entity_id: "primary_subject",
      target_entity_id: capability.id === "axis_lock" ? null : "secondary_subject",
      secondary_target_entity_id: capability.id === "rigid_link" ? "context_subject" : null,
      axis: capability.id === "axis_lock" ? "x" : capability.id === "rigid_link" ? "z" : "auto",
      distance_m: capability.id === "maintain_distance" ? 2 : null,
      parameters: capability.id === "attach_constraint" ? { offset: [0.9, 0.6, 0] } : {},
    }];
    shot.continuity.rules = ["keep_visible", "avoid_occlusion", "preserve_action_continuity"];
  }

  if (capability.category === "blocking_placement") {
    const groupFormationIds = [
      "surround",
      "form_line",
      "form_circle",
      "cluster",
      "symmetrical_pair",
    ];
    const relativeActorIds = [
      "beside",
      "in_front_of",
      "behind",
      "between",
      "facing",
      "facing_away",
    ];
    if (capability.id === "layered_depth") {
      shot.blocking = [
        { relation: "foreground", actor_entity_id: "primary_subject", target_entity_id: null, screen_region: "center_left", preserve_clearance: true, parameters: {} },
        { relation: "midground", actor_entity_id: "secondary_subject", target_entity_id: null, screen_region: "center_right", preserve_clearance: true, parameters: {} },
        { relation: "background", actor_entity_id: "context_subject", target_entity_id: null, screen_region: "center", preserve_clearance: true, parameters: {} },
      ];
      // Three-layer staging cannot be judged if the camera solves only around the
      // foreground actor. Keep all three layers in the optical solve and use a
      // group framing so the near layer never erases mid/background evidence.
      shot.composition.framing = "group_shot";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject", "context_subject"];
      shot.lens.focus_entity_id = "secondary_subject";
    } else if (groupFormationIds.includes(capability.id)) {
      const relation =
        capability.id as DirectorShotDirectionV2["blocking"][number]["relation"];
      const participants = [...capability.demo.required_visible_roles];

      // Group formation vocabulary is one semantic instruction over a participant
      // set, not a request for GLM to author N repeated per-actor cues. The shared
      // runtime expands this cue across the declared focus/visibility set. A.11A.4
      // also lets qualification promote additional planned support roles into the
      // demo visibility contract, so Surround and Form Circle can prove perceptual
      // enclosure/ring structure without hard-coding a maximum of three actors.
      shot.blocking = [{
        relation,
        actor_entity_id: "primary_subject",
        target_entity_id: "secondary_subject",
        screen_region: null,
        preserve_clearance: true,
        parameters: {
          participant_entity_ids: participants,
          center_entity_id:
            capability.id === "surround" ? "primary_subject" : null,
        },
      }];
      shot.composition.framing = "group_shot";
      shot.composition.keep_visible_entity_ids = participants;
      shot.composition.preserve_relationship_entity_ids = participants;
      shot.camera.focus_entity_ids = participants;
      shot.lens.focus_entity_id = "primary_subject";
      shot.lens.depth_of_field = "deep";
      shot.composition.angle =
        capability.id === "symmetrical_pair"
          ? "three_quarter_front"
          : "high_angle";
    } else if (relativeActorIds.includes(capability.id)) {
      const relation =
        capability.id as DirectorShotDirectionV2["blocking"][number]["relation"];
      const participants = [...capability.demo.required_visible_roles];
      const between = capability.id === "between";
      const orientation =
        capability.id === "facing" || capability.id === "facing_away";

      shot.blocking = [{
        relation,
        actor_entity_id: "primary_subject",
        target_entity_id: "secondary_subject",
        screen_region: null,
        preserve_clearance: true,
        parameters: between
          ? {
              reference_entity_ids: ["secondary_subject", "context_subject"],
            }
          : {},
      }];
      shot.composition.keep_visible_entity_ids = participants;
      shot.composition.preserve_relationship_entity_ids = participants;
      shot.camera.focus_entity_ids = participants;
      shot.lens.focus_entity_id = "primary_subject";
      shot.lens.depth_of_field = "deep";
      shot.composition.framing = between
        ? "group_shot"
        : orientation
          ? "two_shot"
          : "two_shot";
      shot.composition.angle = orientation
        ? "front_profile"
        : between
          ? "front_profile"
          : capability.id === "beside"
            ? "eye_level"
            : "three_quarter_front";
      if (orientation) {
        shot.lens.focal_length_mm = 58;
        shot.lens.field_of_view_degrees = 38;
      }
      if (capability.id === "in_front_of" || capability.id === "behind") {
        shot.continuity.maximum_occlusion_ratio = 0.6;
      }
    } else if (["on_surface", "attached_to", "inside"].includes(capability.id)) {
      const relation =
        capability.id as DirectorShotDirectionV2["blocking"][number]["relation"];
      shot.blocking = [{
        relation,
        actor_entity_id: "primary_subject",
        target_entity_id: "secondary_subject",
        screen_region: null,
        preserve_clearance: true,
        parameters: {
          physical_region_required: true,
          // A.11A.10 qualification readability: Attached-To should be judged
          // from an oblique view of the contact plane rather than straight down
          // its normal. The selected patch itself still comes from mesh truth.
          physical_contact_readability_oblique: capability.id === "attached_to",
          // A.11A.11 qualification-only presentation: once Inside has already
          // passed measured containment truth, move the source toward the verified
          // opening while keeping its full bounds inside the cavity. Production
          // authored Inside cues do not receive this flag automatically.
          physical_containment_readability_near_opening: capability.id === "inside",
        },
      }];
      shot.composition.framing = "two_shot";
      shot.composition.keep_visible_entity_ids = [
        "primary_subject",
        "secondary_subject",
      ];
      shot.composition.preserve_relationship_entity_ids = [
        "primary_subject",
        "secondary_subject",
      ];
      shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
      shot.lens.focus_entity_id = "primary_subject";
      shot.lens.depth_of_field = "deep";
      shot.lens.focal_length_mm = capability.id === "inside" ? 52 : 58;
      shot.lens.field_of_view_degrees = capability.id === "inside" ? 42 : 38;
      shot.composition.angle =
        capability.id === "inside"
          ? "high_angle"
          : "three_quarter_front";
      shot.continuity.maximum_occlusion_ratio =
        capability.id === "inside" ? 0.72 : 0.48;
    } else {
      const relation = capability.id as DirectorShotDirectionV2["blocking"][number]["relation"];
      shot.blocking = [{ relation, actor_entity_id: "primary_subject", target_entity_id: ["on_ground", "foreground", "midground", "background", "screen_left", "screen_right"].includes(capability.id) ? null : "secondary_subject", screen_region: capability.id === "screen_left" ? "left_third" : capability.id === "screen_right" ? "right_third" : null, preserve_clearance: true, parameters: {} }];
      shot.composition.keep_visible_entity_ids = capability.id === "on_ground" ? ["primary_subject"] : ["primary_subject", "secondary_subject"];
      if (shot.composition.keep_visible_entity_ids.length > 1) shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];
    }
  }

  if (capability.category === "lighting_emphasis") {
    const intent = capability.id as DirectorShotDirectionV2["lighting"]["intents"][number];
    shot.lighting.intents = [intent];
    if (capability.id === "motivated_source") {
      shot.lighting.motivated_source_entity_id = "context_subject";
      shot.composition.keep_visible_entity_ids = ["primary_subject", "context_subject"];
      shot.camera.focus_entity_ids = ["primary_subject", "context_subject"];
    }
    if (capability.id === "preserve_shadow" || capability.id === "shadow_projection") shot.lighting.preserve_shadow_entity_ids = ["primary_subject"];
  }

  if (capability.category === "transition_continuity") {
    const ruleIds = ["keep_visible", "maintain_screen_direction", "preserve_visual_anchor", "avoid_occlusion", "maintain_axis", "eyeline_match", "preserve_actor_state", "preserve_action_continuity", "preserve_screen_position", "preserve_relative_scale", "preserve_orientation", "match_motion_direction"];
    if (ruleIds.includes(capability.id)) shot.continuity.rules = [capability.id as DirectorShotDirectionV2["continuity"]["rules"][number]];
    shot.composition.keep_visible_entity_ids = ["primary_subject", "secondary_subject"];
    shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];

    if (capability.id === "hard_cut") {
      shot.camera.movement_steps = [{ movement: "cut", start_progress: 0.48, end_progress: 0.5, strength: 1, easing: "step", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: { degrees: 72 } }];
    }
    if (capability.id === "continuous_take") shot.camera.movement_steps = [{ movement: "spline", start_progress: 0, end_progress: 0.9, strength: 0.7, easing: "ease_in_out", coordinate_space: "world", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.88, end_progress: 1, strength: 0.4, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "secondary_subject", parameters: {} }];
    if (["smooth_blend", "match_cut", "crossfade"].includes(capability.id)) shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.34, end_progress: 0.72, strength: 0.9, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: {} }];
    if (capability.id === "cut_on_action") shot.camera.movement_steps = [{ movement: "cut", start_progress: 0.5, end_progress: 0.52, strength: 1, easing: "step", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: { degrees: 58 } }];
    if (capability.id === "camera_pass_transition" || capability.id === "scale_transition") shot.camera.movement_steps = [{ movement: "pass_through", start_progress: 0.18, end_progress: 0.78, strength: 0.8, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }];
    if (capability.id === "hold") shot.camera.movement_steps = [{ movement: "push_in", start_progress: 0.05, end_progress: 0.42, strength: 0.22, easing: "ease_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "settle", start_progress: 0.38, end_progress: 0.68, strength: 0.65, easing: "ease_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: {} }, { movement: "static", start_progress: 0.68, end_progress: 1, strength: 0, easing: "linear", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }];

    if (capability.id === "keep_visible") {
      shot.composition.framing = "two_shot";
      shot.camera.movement_steps = [{ movement: "arc_right", start_progress: 0.08, end_progress: 0.86, strength: 0.55, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: { degrees: 34 } }];
    }
    if (capability.id === "maintain_screen_direction" || capability.id === "maintain_axis" || capability.id === "match_motion_direction") {
      shot.composition.framing = "medium_wide";
      shot.composition.angle = "side_profile";
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.composition.keep_visible_entity_ids = ["primary_subject"];
      shot.camera.movement_steps = capability.id === "maintain_axis"
        ? [{ movement: "truck", start_progress: 0.08, end_progress: 0.86, strength: 0.22, easing: "ease_in_out", coordinate_space: "camera_relative", target_entity_id: "primary_subject", parameters: { direction_sign: 1 } }]
        : [{ movement: "static", start_progress: 0, end_progress: 1, strength: 0, easing: "linear", coordinate_space: "world", target_entity_id: "primary_subject", parameters: {} }];
    }
    if (capability.id === "preserve_visual_anchor" || capability.id === "preserve_screen_position") {
      shot.composition.framing = "medium_wide";
      shot.composition.screen_anchor = "left_third";
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.composition.keep_visible_entity_ids = ["primary_subject"];
      shot.camera.movement_steps = [{ movement: "follow", start_progress: 0, end_progress: 1, strength: 0.6, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: {} }];
    }
    if (capability.id === "avoid_occlusion") {
      shot.composition.framing = "medium_close";
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.composition.keep_visible_entity_ids = ["primary_subject"];
      shot.blocking = [{ relation: "foreground", actor_entity_id: "secondary_subject", target_entity_id: null, screen_region: "center_right", preserve_clearance: true, parameters: {} }];
      shot.camera.movement_steps = [{ movement: "arc_left", start_progress: 0.06, end_progress: 0.88, strength: 0.72, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: { degrees: 42 } }];
      shot.continuity.maximum_occlusion_ratio = 0.2;
    }
    if (capability.id === "eyeline_match") {
      shot.composition.framing = "two_shot";
      shot.camera.movement_steps = [{ movement: "reframe", start_progress: 0.28, end_progress: 0.7, strength: 0.85, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: {} }];
    }
    if (capability.id === "preserve_actor_state" || capability.id === "preserve_action_continuity") {
      shot.camera.movement_steps = [{ movement: "cut", start_progress: 0.5, end_progress: 0.52, strength: 1, easing: "step", coordinate_space: "target_relative", target_entity_id: "secondary_subject", parameters: { degrees: 52 } }];
    }
    if (capability.id === "preserve_relative_scale") {
      shot.composition.framing = "two_shot";
      shot.composition.preserve_relative_scale = true;
      shot.camera.movement_steps = [{ movement: "arc_right", start_progress: 0.1, end_progress: 0.84, strength: 0.38, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: { degrees: 26 } }];
    }
    if (capability.id === "preserve_orientation") {
      shot.camera.focus_entity_ids = ["primary_subject"];
      shot.composition.keep_visible_entity_ids = ["primary_subject"];
      shot.camera.movement_steps = [{ movement: "orbit", start_progress: 0.08, end_progress: 0.88, strength: 0.46, easing: "ease_in_out", coordinate_space: "target_relative", target_entity_id: "primary_subject", parameters: { degrees: 70 } }];
    }
  }

  return shot;
}

export function directorCapabilityDemoEvents(capability: DirectorCapability): DirectorEvent[] {
  if (capability.category === "narrative_attention") {
    if (capability.id === "introduce") {
      return [{
        id: "demo_introduce_primary",
        behaviour: "move_to",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["secondary_subject"],
        start_ms: 700,
        duration_ms: 3500,
        easing: "ease_out",
        path_hint: "primary enters from outside the established relationship and settles into frame",
        description: capability.summary,
        parameters: { start_position: [-4.8, 0, 0.8], target_position: [-1.6, 0, 0] },
        fallback_behaviour: null,
      }];
    }
    if (capability.id === "build_from_parts") {
      return [
        { id: "demo_build_part_secondary", behaviour: "move_to", actor_entity_id: "secondary_subject", target_entity_id: null, supporting_entity_ids: ["primary_subject"], start_ms: 650, duration_ms: 3200, easing: "ease_out", path_hint: "secondary component moves into the assembly", description: capability.summary, parameters: { start_position: [3.8, 0, 1.2], target_position: [1.15, 0, 0] }, fallback_behaviour: null },
        { id: "demo_build_part_context", behaviour: "move_to", actor_entity_id: "context_subject", target_entity_id: null, supporting_entity_ids: ["primary_subject", "secondary_subject"], start_ms: 2200, duration_ms: 3000, easing: "ease_out", path_hint: "context component joins after the first relation is clear", description: capability.summary, parameters: { start_position: [0, 0, -4.2], target_position: [0, 0, -1.25] }, fallback_behaviour: null },
      ];
    }
    return [];
  }
  if (capability.category === "camera_angle" && capability.id === "object_attached") {
    return [
      {
        id: "demo_object_attached_angle_subject_travel",
        behaviour: "move_to",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["secondary_subject"],
        start_ms: 500,
        duration_ms: 5000,
        easing: "ease_in_out",
        path_hint: "moving subject proves that the view remains actor-relative",
        description: capability.summary,
        parameters: { start_position: [-2.3, 0, 0.65], target_position: [2.35, 0, -0.65] },
        fallback_behaviour: null,
      },
      {
        id: "demo_object_attached_angle_subject_turn",
        behaviour: "rotate",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: [],
        start_ms: 900,
        duration_ms: 4200,
        easing: "ease_in_out",
        path_hint: "subject rotates while the camera keeps its actor-local offset",
        description: "Rotate the source actor so actor-local camera orientation is visibly testable.",
        parameters: { axis: "y", degrees: 105 },
        fallback_behaviour: null,
      },
    ];
  }
  if (capability.category === "camera_movement") {
    const movement = movementAlias(capability.id);
    if (["static", "follow", "lead_subject", "lag_follow", "track_parallel", "object_attached"].includes(movement)) {
      const travel: DirectorEvent = {
        id: `demo_camera_subject_travel_${capability.id}`,
        behaviour: "move_to",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["secondary_subject"],
        start_ms: 500,
        duration_ms: 5000,
        easing: "ease_in_out",
        path_hint: "subject travels through the set so the camera relationship is visible",
        description: `Move the primary subject so ${capability.label.toLowerCase()} can be judged against real subject travel.`,
        parameters: { start_position: [-2.3, 0, 0.65], target_position: [2.35, 0, -0.65] },
        fallback_behaviour: null,
      };
      if (movement === "object_attached") {
        // Phase 1B.7A.6: the movement-form audition proves the blend into the
        // canonical mounted-camera relationship while the host continues along
        // the travel corridor. Actor-local rotation is already exercised by the
        // immediate object_attached angle proof; adding a 105-degree turn here
        // made a vehicle point away from its own path and contaminated the shot.
        return [travel];
      }
      return [travel];
    }
    return [];
  }
  if (capability.category === "transition_continuity") {
    if (["maintain_screen_direction", "preserve_visual_anchor", "preserve_screen_position", "preserve_action_continuity", "match_motion_direction", "cut_on_action"].includes(capability.id)) {
      return [{
        id: `demo_continuity_travel_${capability.id}`,
        behaviour: "move_to",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["secondary_subject"],
        start_ms: 450,
        duration_ms: 5200,
        easing: "linear",
        path_hint: "left-to-right action makes the continuity rule visually testable",
        description: capability.summary,
        parameters: { start_position: [-2.5, 0, 0.3], target_position: [2.5, 0, 0.3] },
        fallback_behaviour: null,
      }];
    }
    if (capability.id === "eyeline_match") {
      return [{
        id: "demo_eyeline_match_orientation",
        behaviour: "aim_at",
        actor_entity_id: "primary_subject",
        target_entity_id: "secondary_subject",
        supporting_entity_ids: [],
        start_ms: 250,
        duration_ms: 4200,
        easing: "ease_in_out",
        path_hint: "primary maintains its look direction while the camera reframes",
        description: capability.summary,
        parameters: {},
        fallback_behaviour: null,
      }];
    }
    if (capability.id === "preserve_actor_state") {
      return [{
        id: "demo_preserve_actor_state_rotation",
        behaviour: "rotate",
        actor_entity_id: "primary_subject",
        target_entity_id: null,
        supporting_entity_ids: [],
        start_ms: 350,
        duration_ms: 5300,
        easing: "linear",
        path_hint: "rotation remains continuous across the camera cut",
        description: capability.summary,
        parameters: { axis: "y", turns: 0.75 },
        fallback_behaviour: null,
      }];
    }
    return [];
  }
  if (capability.category !== "object_motion") return [];
  if (["axis_lock", "attach_constraint", "maintain_distance", "rigid_link", "look_at_constraint"].includes(capability.id)) {
    if (capability.id === "rigid_link") {
      return [{
        id: "demo_rigid_link_endpoint_motion",
        behaviour: "oscillate",
        actor_entity_id: "secondary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["primary_subject", "context_subject"],
        start_ms: 350,
        duration_ms: 5600,
        easing: "ease_in_out",
        path_hint: "endpoint moves while the primary link remains connected to both endpoints",
        description: capability.summary,
        parameters: { amplitude_m: 1.1, cycles: 1, direction: [1, 0.25, 0] },
        fallback_behaviour: "move_to",
      }];
    }
    if (capability.id === "attach_constraint") {
      return [{
        id: "demo_attachment_target_motion",
        behaviour: "move_to",
        actor_entity_id: "secondary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["primary_subject"],
        start_ms: 450,
        duration_ms: 4700,
        easing: "ease_in_out",
        path_hint: "target travels while attachment follows",
        description: capability.summary,
        parameters: { target_position: [2.8, 0, -0.8] },
        fallback_behaviour: null,
      }];
    }
    return [{
      id: `demo_${capability.id}_motion`,
      behaviour: capability.id === "look_at_constraint" ? "move_to" : capability.id === "axis_lock" ? "move_to" : "orbit",
      actor_entity_id: "primary_subject",
      target_entity_id: capability.id === "axis_lock" ? null : "secondary_subject",
      supporting_entity_ids: [],
      start_ms: 450,
      duration_ms: 4700,
      easing: "ease_in_out",
      path_hint: null,
      description: capability.summary,
      parameters: capability.id === "axis_lock"
        ? { target_position: [2.8, 1.6, 1.4] }
        : capability.id === "look_at_constraint"
          ? { target_position: [2.2, 0, 1.2] }
          : { radius_m: 2.7, degrees: 160 },
      fallback_behaviour: "move_to",
    }];
  }
  const behaviour = motionBehaviourAlias(capability.id);
  const targetBased = ["move_toward", "move_away", "follow_target", "align", "aim_at", "attach", "detach", "insert_into", "remove_from", "assemble", "merge", "flow"].includes(behaviour);
  const parameters: Record<string, unknown> = {};
  let targetEntityId: string | null =
    targetBased ? "secondary_subject" : null;
  let supportingEntityIds: string[] = [];
  if (capability.id === "translate") parameters.target_position = [2.1, 0, 0];
  if (capability.id === "enter_frame") { parameters.start_position = [-5.5, 0, 0]; parameters.target_position = [-1.45, 0, 0]; }
  if (capability.id === "exit_frame") parameters.target_position = [5.5, 0, 0];
  if (capability.id === "follow_path") parameters.path_points = [[-2.3, 0, 0], [-0.7, 1.25, -0.5], [1.2, 0.7, 0.5], [2.4, 0, 0]];
  if (["pivot", "hinge", "object_open", "object_close"].includes(capability.id)) {
    parameters.axis = "z";
    parameters.degrees = 75;
    parameters.pivot_local = [-0.48, 0.05, 0];
  }
  if (capability.id === "oscillate") { parameters.amplitude_m = 1.1; parameters.cycles = 2; parameters.direction = [1, 0, 0]; }
  if (["rotate", "spin"].includes(capability.id)) { parameters.axis = "y"; parameters.turns = 1; }
  if (capability.id === "roll") {
    parameters.axis = "z";
    parameters.distance_m = 2.4;
    parameters.direction = [1, 0, 0];
  }
  if (["move_toward", "move_away", "slide", "lift", "lower", "detach", "remove_from", "split"].includes(capability.id)) parameters.distance_m = 1.8;
  // Qualification fixtures for vertical travel use a bounded one-metre move so
  // both endpoints remain inside the authored static teaching frame.
  if (capability.id === "lift" || capability.id === "lower") parameters.distance_m = 1.0;
  if (capability.id === "slide") parameters.direction = [1, 0, 0];
  if (capability.id === "expand" || capability.id === "contract") parameters.amount = 0.45;
  if (capability.id === "flow") {
    targetEntityId = "secondary_subject";
    supportingEntityIds = ["context_subject"];
    parameters.path_points = [[-0.15, 0.75, 0.35], [0.55, 0.35, -0.2]];
    parameters.carrier_count = 7;
  }
  if (capability.id === "emit") {
    parameters.direction = [0.45, 0.8, 0.15];
    parameters.distance_m = 2.2;
    parameters.carrier_count = 7;
    parameters.spread_degrees = 38;
  }
  if (capability.id === "fill") {
    parameters.start_level = 0.15;
    parameters.target_level = 0.9;
  }
  if (capability.id === "drain") {
    parameters.start_level = 0.9;
    parameters.target_level = 0.1;
  }
  if (capability.id === "accumulate") {
    parameters.start_amount = 0.15;
    parameters.target_amount = 1.15;
  }

  if (capability.id === "scatter") {
    targetEntityId = null;
    supportingEntityIds = ["secondary_subject", "context_subject"];
    parameters.choreography_kind = "scatter";
    parameters.participant_entity_ids = [
      "primary_subject",
      "secondary_subject",
      "context_subject",
    ];
    parameters.distance_m = 2.35;
  }
  if (capability.id === "assemble" || capability.id === "merge") {
    supportingEntityIds = ["context_subject"];
    parameters.participant_entity_ids = [
      "primary_subject",
      "context_subject",
    ];
    parameters.spacing_m = 1.15;
  }
  if (capability.id === "disassemble" || capability.id === "split") {
    supportingEntityIds = ["secondary_subject", "context_subject"];
    parameters.participant_entity_ids = [
      "primary_subject",
      "secondary_subject",
      "context_subject",
    ];
    parameters.distance_m = capability.id === "split" ? 2.15 : 2.45;
  }

  const primaryEvent: DirectorEvent = {
    id: `demo_${capability.id}`,
    behaviour,
    actor_entity_id: "primary_subject",
    target_entity_id: targetEntityId,
    supporting_entity_ids: supportingEntityIds,
    start_ms: 450,
    duration_ms: 4700,
    easing: "ease_in_out",
    path_hint: null,
    description: capability.summary,
    parameters,
    fallback_behaviour:
      ["flow", "emit", "fill", "drain", "accumulate"].includes(behaviour)
        ? null
        : behaviour === "move_to"
          ? null
          : "move_to",
  };

  if (capability.id === "follow_target" || capability.id === "attach") {
    return [
      {
        id: `demo_${capability.id}_moving_target`,
        behaviour: "move_to",
        actor_entity_id: "secondary_subject",
        target_entity_id: null,
        supporting_entity_ids: ["primary_subject"],
        start_ms: 450,
        duration_ms: 4700,
        easing: "ease_in_out",
        path_hint: "moving relationship target",
        description:
          "Move the relationship target so Follow target and Attach must sample current target state rather than its original pose.",
        parameters: {
          target_position: [2.6, 0.35, -1.1],
        },
        fallback_behaviour: null,
      },
      primaryEvent,
    ];
  }

  return [primaryEvent];
}

export function directorCapabilityDemoMoment(capability: DirectorCapability): DirectorMoment {
  const shot = directorCapabilityDemoShot(capability);
  const events = directorCapabilityDemoEvents(capability);
  return {
    id: `demo_moment_${capability.id}`,
    title: capability.label,
    learning_job: capability.semantic_intent,
    director_intent: capability.semantic_intent,
    source_explanation_piece_ids: [],
    duration_ms: capability.demo.duration_ms,
    introduces_entity_ids: ["primary_subject", "secondary_subject", "context_subject"],
    keeps_visible_entity_ids: shot.composition.keep_visible_entity_ids,
    active_entity_ids: ["primary_subject", ...(shot.camera.focus_entity_ids.includes("secondary_subject") ? ["secondary_subject"] : [])],
    camera: {
      shot_type: shot.composition.framing === "wide" || shot.composition.framing === "extreme_wide" ? "wide" : shot.composition.framing === "macro" ? "macro" : shot.composition.framing === "close" || shot.composition.framing === "medium_close" || shot.composition.framing === "extreme_close" ? "close_up" : "medium",
      movement: shot.camera.movement_steps[0]?.movement ?? "static",
      focus_entity_ids: shot.camera.focus_entity_ids,
      framing_intent: shot.visual_claim,
      keep_visible_entity_ids: shot.composition.keep_visible_entity_ids,
    },
    shot,
    events,
    text_cues: [],
    success_observation: shot.success_observation ?? capability.demo.narration,
  };
}

// Phase 1B.6.3 extends the historical 183 atomic entries with the Golden-derived highlight_subject capability while exposing
// higher-level perceptual/composite Director capability authority from the same
// motion-camera-library module family.
export {
  DIRECTOR_FILM_POLICIES,
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
  DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION,
  DIRECTOR_PERCEPTUAL_CATEGORY_LABELS,
  FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS,
  type DirectorFilmPolicy,
  type DirectorPerceptualCapability,
  type DirectorPerceptualCapabilityCategory,
  type DirectorPerceptualCapabilityStatus,
} from "./director-perceptual-capabilities";
