import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../director/director-contract";
import type {
  AssetDirectabilityProfileV1,
} from "../directability";
import {
  directabilityForwardHorizontalAxis,
  directabilityForwardVector,
  directabilityRollingAxis,
  directabilityRollingRadiusForActor,
} from "../directability";
import {
  MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
  type MotionProgramDirectabilityRequirement,
  type MotionProgramEasing,
  type MotionProgramStateEffect,
  type MotionProgramTrack,
  type MotionProgramVec3,
} from "./motion-program-contract";

export const DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS = [
  "follow_target",
  "attach",
  "detach",
  "aim_at",
  "align",
  "hinge",
  "open",
  "close",
  "slide",
  "roll",
] as const satisfies readonly DirectorBehaviour[];

export const DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS = {
  follow_target: "follow_dynamic_target_offset",
  attach: "attach_approach_then_bind",
  detach: "detach_latched_release",
  aim_at: "aim_visual_forward_at_target",
  align: "align_declared_axis_to_target",
  hinge: "hinge_about_declared_anchor_axis",
  open: "open_hinge_transition",
  close: "close_hinge_transition",
  slide: "slide_constrained_axis",
  roll: "roll_translation_rotation_coupled",
} as const satisfies Record<
  (typeof DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS)[number],
  string
>;

export type DirectorMotionRecipeActor = {
  id: string;
  position: MotionProgramVec3;
  rotation?: MotionProgramVec3;
  scale?: MotionProgramVec3;
  size: MotionProgramVec3;
  directability?: AssetDirectabilityProfileV1 | null;
  attachment_state?: {
    target_entity_id: string;
    offset_position: MotionProgramVec3;
    offset_rotation: MotionProgramVec3;
  } | null;
  articulation_state?: {
    openness: number;
    closed_position: MotionProgramVec3;
    closed_rotation: MotionProgramVec3;
    pivot_local: MotionProgramVec3;
    axis: "x" | "y" | "z";
    degrees: number;
  } | null;
  choreography_state?: {
    choreography_id: string;
    choreography_kind: string;
    relation_kind: string;
    anchor_entity_id: string | null;
    peer_entity_ids: string[];
    participant_entity_ids: string[];
    slot_index: number;
    slot_offset: MotionProgramVec3;
    follow_anchor: boolean;
    updated_at_moment_id: string;
  } | null;
  process_state?: {
    quantities: Record<string, number>;
    last_process_kind: string | null;
    source_entity_id: string | null;
    target_entity_id: string | null;
    updated_at_moment_id: string | null;
  } | null;
};

export type DirectorRelationalArticulationRecipe = {
  version: typeof MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION;
  behaviour:
    (typeof DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS)[number];
  recipe_id: string;
  tracks: MotionProgramTrack[];
  requirements: MotionProgramDirectabilityRequirement[];
  state_effects: MotionProgramStateEffect[];
  warnings: string[];
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function numberParam(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vecParam(
  value: unknown,
  fallback: MotionProgramVec3,
): MotionProgramVec3 {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      numberParam(value[0], fallback[0]),
      numberParam(value[1], fallback[1]),
      numberParam(value[2], fallback[2]),
    ];
  }
  return [...fallback];
}

function subtract(
  left: MotionProgramVec3,
  right: MotionProgramVec3,
): MotionProgramVec3 {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function normalize(value: MotionProgramVec3): MotionProgramVec3 {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (magnitude <= 1e-9) return [0, 0, 0];
  return [
    value[0] / magnitude,
    value[1] / magnitude,
    value[2] / magnitude,
  ];
}

function actorById(
  actors: DirectorMotionRecipeActor[],
  id: string | null | undefined,
) {
  return id
    ? actors.find((actor) => actor.id === id) ?? null
    : null;
}

function actorRadius(actor: DirectorMotionRecipeActor) {
  const [x, y, z] = actor.size.map((value) =>
    Math.max(0.02, Math.abs(value)),
  ) as MotionProgramVec3;
  return Math.max(
    0.12,
    Math.sqrt(x * x + y * y + z * z) * 0.34,
  );
}

function axisParam(value: unknown): "x" | "y" | "z" {
  return value === "x" || value === "z" ? value : "y";
}

function horizontalAxisParam(value: unknown): "x" | "z" {
  return value === "z" ? "z" : "x";
}

function axisVector(axis: "x" | "y" | "z"): MotionProgramVec3 {
  if (axis === "x") return [1, 0, 0];
  if (axis === "z") return [0, 0, 1];
  return [0, 1, 0];
}

function inferredRollingAxis(
  direction: MotionProgramVec3,
): "x" | "z" {
  const horizontal = normalize([direction[0], 0, direction[2]]);
  // n × v = [vz, 0, -vx]. Choose the dominant horizontal angular axis.
  return Math.abs(horizontal[2]) > Math.abs(horizontal[0]) ? "x" : "z";
}

function rollingRotationSign(
  direction: MotionProgramVec3,
  axis: "x" | "y" | "z",
) {
  const horizontal = normalize([direction[0], 0, direction[2]]);
  if (Math.hypot(horizontal[0], horizontal[2]) <= 1e-9) return 1;

  // For a ground-supported roll, angular velocity follows n × v where
  // n is world up. This makes +X travel around +Z rotate clockwise rather
  // than visually scrubbing backwards across the floor.
  const expectedAngular: MotionProgramVec3 = [
    horizontal[2],
    0,
    -horizontal[0],
  ];
  const axisDirection = axisVector(axis);
  const projection =
    expectedAngular[0] * axisDirection[0] +
    expectedAngular[1] * axisDirection[1] +
    expectedAngular[2] * axisDirection[2];
  return Math.abs(projection) <= 1e-6 ? 1 : Math.sign(projection);
}

function eventWindow(moment: DirectorMoment, event: DirectorEvent) {
  const durationMs = Math.max(1, moment.duration_ms);
  const start = clamp01(event.start_ms / durationMs);
  const end = clamp01(
    (event.start_ms + Math.max(1, event.duration_ms)) / durationMs,
  );
  return {
    start,
    end: Math.max(start + Number.EPSILON, end),
  };
}

function baseTrack(
  actor: DirectorMotionRecipeActor,
  event: DirectorEvent,
  order: number,
  start: number,
  end: number,
  easing: MotionProgramEasing = event.easing as MotionProgramEasing,
) {
  return {
    target_entity_id: actor.id,
    start_progress: start,
    end_progress: end,
    easing,
    order,
  };
}

function hingeRequirement(
  actor: DirectorMotionRecipeActor,
  event: DirectorEvent,
): MotionProgramDirectabilityRequirement[] {
  return [
    {
      id: `director:${event.id}:hinge_anchor_requirement`,
      target_entity_id: actor.id,
      kind: "anchor",
      semantic_name: "hinge_anchor",
      required: true,
      runtime_status: "declared",
    },
    {
      id: `director:${event.id}:hinge_axis_requirement`,
      target_entity_id: actor.id,
      kind: "axis",
      semantic_name: "hinge_axis",
      required: true,
      runtime_status: "declared",
    },
  ];
}

function articulationStateEffect(
  actor: DirectorMotionRecipeActor,
  event: DirectorEvent,
  state: "open" | "closed",
  effectiveProgress: number,
  details: {
    openness: number;
    closed_position: MotionProgramVec3;
    closed_rotation: MotionProgramVec3;
    pivot_local: MotionProgramVec3;
    axis: "x" | "y" | "z";
    degrees: number;
  },
): MotionProgramStateEffect {
  return {
    id: `director:${event.id}:articulation_state`,
    target_entity_id: actor.id,
    kind: "articulation_state",
    parameters: {
      state,
      openness: clamp01(details.openness),
      closed_position: [...details.closed_position],
      closed_rotation: [...details.closed_rotation],
      pivot_local: [...details.pivot_local],
      axis: details.axis,
      degrees: details.degrees,
      effective_progress: effectiveProgress,
      persistence_scope: "cross_moment_scene_state",
    },
    runtime_status: "supported",
  };
}

export function compileDirectorRelationalArticulationRecipe(input: {
  moment: DirectorMoment;
  event: DirectorEvent;
  actor: DirectorMotionRecipeActor;
  actors: DirectorMotionRecipeActor[];
  order: number;
}): DirectorRelationalArticulationRecipe | null {
  const {
    moment,
    event,
    actor,
    actors,
    order,
  } = input;
  if (
    !(
      DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS as readonly string[]
    ).includes(event.behaviour)
  ) {
    return null;
  }

  const behaviour =
    event.behaviour as DirectorRelationalArticulationRecipe["behaviour"];
  const params = event.parameters ?? {};
  const { start, end } = eventWindow(moment, event);
  const target = actorById(actors, event.target_entity_id);
  const recipeId =
    DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS[behaviour];

  if (behaviour === "follow_target") {
    if (!target) return null;
    const offset = Array.isArray(params.offset)
      ? vecParam(params.offset, subtract(actor.position, target.position))
      : subtract(actor.position, target.position);
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, end),
          id: `director:${event.id}:follow_target`,
          channel: "transform",
          operation: "sample_target_offset",
          coordinate_space: "target_relative",
          parameters: {
            target_entity_id: target.id,
            origin: [...actor.position],
            offset,
            mode: "replace",
          },
        },
      ],
      requirements: [],
      state_effects: [],
      warnings: [],
    };
  }

  if (behaviour === "attach") {
    if (!target) return null;
    const offset = vecParam(
      params.offset,
      [0, actorRadius(target) * 0.9, 0],
    );
    const bindProgress =
      start + (end - start) * clamp01(
        numberParam(params.bind_fraction, 0.42),
      );
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, bindProgress),
          id: `director:${event.id}:attach_approach`,
          channel: "transform",
          operation: "sample_target_offset",
          coordinate_space: "target_relative",
          parameters: {
            target_entity_id: target.id,
            origin: [...actor.position],
            offset,
            mode: "approach",
          },
        },
        {
          ...baseTrack(
            actor,
            event,
            order + 1,
            bindProgress,
            end,
            "linear",
          ),
          id: `director:${event.id}:attach_bound`,
          channel: "transform",
          operation: "sample_target_offset",
          coordinate_space: "target_relative",
          parameters: {
            target_entity_id: target.id,
            origin: [...actor.position],
            offset,
            mode: "replace",
          },
        },
      ],
      requirements: [
        {
          id: `director:${event.id}:attachment_anchor_requirement`,
          target_entity_id: actor.id,
          kind: "anchor",
          semantic_name: "attachment_anchor",
          required: false,
          runtime_status: "declared",
        },
      ],
      state_effects: [
        {
          id: `director:${event.id}:attachment_state`,
          target_entity_id: actor.id,
          kind: "attachment_state",
          parameters: {
            state: "attached",
            target_entity_id: target.id,
            offset,
            offset_position: offset,
            offset_rotation: [
              (actor.rotation?.[0] ?? 0) - (target.rotation?.[0] ?? 0),
              (actor.rotation?.[1] ?? 0) - (target.rotation?.[1] ?? 0),
              (actor.rotation?.[2] ?? 0) - (target.rotation?.[2] ?? 0),
            ],
            effective_progress: bindProgress,
            persistence_scope: "cross_moment_scene_state",
          },
          runtime_status: "supported",
        },
      ],
      warnings: [
        "Attachment binding is deterministic and emits a supported cross-moment scene-state relation; semantic sockets remain future asset-directability metadata.",
      ],
    };
  }

  if (behaviour === "detach") {
    if (!target) return null;
    const attachmentOffset = Array.isArray(params.offset)
      ? vecParam(params.offset, subtract(actor.position, target.position))
      : actor.attachment_state?.target_entity_id === target.id
        ? [...actor.attachment_state.offset_position] as MotionProgramVec3
        : subtract(actor.position, target.position);
    const explicitDirection = Array.isArray(params.direction)
      ? normalize(vecParam(params.direction, [-1, 0.25, 0]))
      : null;
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, end),
          id: `director:${event.id}:detach_release`,
          channel: "transform",
          operation: "detach_from_target",
          coordinate_space: "target_relative",
          parameters: {
            target_entity_id: target.id,
            fallback_origin: [...actor.position],
            attachment_offset: attachmentOffset,
            explicit_direction: explicitDirection,
            distance: numberParam(
              params.distance_m,
              Math.max(0.75, actorRadius(actor) * 1.5),
            ),
          },
        },
      ],
      requirements: [],
      state_effects: [
        {
          id: `director:${event.id}:attachment_state`,
          target_entity_id: actor.id,
          kind: "attachment_state",
          parameters: {
            state: "detached",
            target_entity_id: target.id,
            effective_progress: start,
            persistence_scope: "cross_moment_scene_state",
          },
          runtime_status: "supported",
        },
      ],
      warnings: [
        "Detach latches the target-relative release origin at the event start so later target motion is not inherited.",
      ],
    };
  }

  if (behaviour === "aim_at" || behaviour === "align") {
    if (!target) return null;
    const axis =
      behaviour === "aim_at"
        ? "z"
        : params.axis != null
          ? horizontalAxisParam(params.axis)
          : directabilityForwardHorizontalAxis(actor.directability) ?? "x";
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, end),
          id: `director:${event.id}:${behaviour}`,
          channel: "orientation",
          operation: "orient_axis_toward_target",
          coordinate_space: "target_relative",
          parameters: {
            target_entity_id: target.id,
            axis,
            from_yaw_radians: actor.rotation?.[1] ?? 0,
          },
        },
      ],
      requirements:
        behaviour === "align"
          ? [
              {
                id: `director:${event.id}:alignment_axis_requirement`,
                target_entity_id: actor.id,
                kind: "axis",
                semantic_name: `alignment_axis_${axis}`,
                required: false,
                runtime_status: "declared",
              },
            ]
          : [],
      state_effects: [],
      warnings:
        behaviour === "align" && !("axis" in params)
          ? actor.directability
            ? [
                `Align selected actor-local +${axis.toUpperCase()} from the Phase 1B.5 asset orientation frame.`,
              ]
            : [
                "Align defaults to the actor-local +X axis when no directability orientation frame is attached.",
              ]
          : [],
    };
  }

  if (
    behaviour === "hinge" ||
    behaviour === "open" ||
    behaviour === "close"
  ) {
    const previousArticulation = actor.articulation_state ?? null;
    const articulationBasis =
      behaviour === "hinge" ? null : previousArticulation;
    const localPivot = vecParam(
      params.pivot_local,
      articulationBasis?.pivot_local ??
        [-Math.max(0.05, actor.size[0]) * 0.5, 0, 0],
    );
    const closedPosition = articulationBasis
      ? [...articulationBasis.closed_position] as MotionProgramVec3
      : [...actor.position] as MotionProgramVec3;
    const closedRotation = articulationBasis
      ? [...articulationBasis.closed_rotation] as MotionProgramVec3
      : [...(actor.rotation ?? [0, 0, 0])] as MotionProgramVec3;
    const anchor: MotionProgramVec3 = [
      closedPosition[0] + localPivot[0],
      closedPosition[1] + localPivot[1],
      closedPosition[2] + localPivot[2],
    ];
    const axis = axisParam(params.axis ?? articulationBasis?.axis);
    const degrees = numberParam(
      params.degrees,
      articulationBasis?.degrees ?? 90,
    );
    const radians = (degrees * Math.PI) / 180;
    const defaultOpenness = behaviour === "close" ? 1 : 0;
    const currentOpenness =
      behaviour === "hinge"
        ? 0
        : clamp01(articulationBasis?.openness ?? defaultOpenness);
    const targetOpenness =
      behaviour === "open" ? 1 : behaviour === "close" ? 0 : 1;
    const fromRadians = currentOpenness * radians;
    const toRadians = targetOpenness * radians;
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, end),
          id: `director:${event.id}:${behaviour}_hinge`,
          channel: "transform",
          operation: "rotate_around_anchor",
          coordinate_space: "world",
          apply_before_start: Math.abs(fromRadians) > 1e-9,
          parameters: {
            origin: closedPosition,
            anchor,
            axis,
            from_radians: fromRadians,
            to_radians: toRadians,
            rotate_orientation: true,
            origin_rotation: closedRotation,
          },
        },
      ],
      requirements: hingeRequirement(actor, event),
      state_effects:
        behaviour === "open"
          ? [
              articulationStateEffect(actor, event, "open", end, {
                openness: 1,
                closed_position: closedPosition,
                closed_rotation: closedRotation,
                pivot_local: localPivot,
                axis,
                degrees,
              }),
            ]
          : behaviour === "close"
            ? [
                articulationStateEffect(actor, event, "closed", end, {
                  openness: 0,
                  closed_position: closedPosition,
                  closed_rotation: closedRotation,
                  pivot_local: localPivot,
                  axis,
                  degrees,
                }),
              ]
            : [],
      warnings: [
        "The current Three.js proof uses a whole-actor hinge fallback. Scene state now preserves normalized openness and a canonical closed pose, while real articulated GLBs still require semantic subpart/hinge metadata.",
      ],
    };
  }

  if (behaviour === "slide") {
    const direction = normalize(
      vecParam(
        params.direction,
        directabilityForwardVector(actor.directability) ?? [1, 0, 0],
      ),
    );
    const distance = numberParam(
      params.distance_m,
      Math.max(0.75, actorRadius(actor) * 1.5),
    );
    return {
      version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
      behaviour,
      recipe_id: recipeId,
      tracks: [
        {
          ...baseTrack(actor, event, order, start, end),
          id: `director:${event.id}:slide_axis`,
          channel: "transform",
          operation: "lerp_vector",
          coordinate_space: "actor_local",
          parameters: {
            property: "position",
            from: [0, 0, 0],
            to: [
              direction[0] * distance,
              direction[1] * distance,
              direction[2] * distance,
            ],
            blend: "additive",
          },
        },
      ],
      requirements: [
        {
          id: `director:${event.id}:slide_axis_requirement`,
          target_entity_id: actor.id,
          kind: "axis",
          semantic_name: "slide_axis",
          required: false,
          runtime_status: "declared",
        },
      ],
      state_effects: [],
      warnings: [],
    };
  }

  const direction = normalize(
    vecParam(
      params.direction,
      directabilityForwardVector(actor.directability) ?? [1, 0, 0],
    ),
  );
  const distance = numberParam(
    params.distance_m,
    Math.max(0.75, actorRadius(actor) * 1.5),
  );
  const directabilityRadius = directabilityRollingRadiusForActor(
    actor.directability,
    actor.size,
  );
  const rollingRadius = Math.max(
    0.05,
    numberParam(
      params.rolling_radius_m,
      directabilityRadius ??
        // For a ground-supported fallback, vertical half-height is the honest
        // contact radius. Using the thinnest bound badly over-rotates wheels
        // whose axle/thickness dimension is much smaller than their diameter.
        actor.size[1] * 0.5,
    ),
  );
  const rollingAxis =
    params.axis != null
      ? axisParam(params.axis)
      : directabilityRollingAxis(actor.directability) ?? inferredRollingAxis(direction);
  const explicitTurns = Number(params.turns);
  const rotationSign = rollingRotationSign(direction, rollingAxis);
  const radians = Number.isFinite(explicitTurns)
    ? Math.PI * 2 * explicitTurns
    : (distance / rollingRadius) * rotationSign;
  return {
    version: MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
    behaviour,
    recipe_id: recipeId,
    tracks: [
      {
        ...baseTrack(actor, event, order, start, end),
        id: `director:${event.id}:roll_translation`,
        channel: "transform",
        operation: "lerp_vector",
        coordinate_space: "actor_local",
        parameters: {
          property: "position",
          from: [0, 0, 0],
          to: [
            direction[0] * distance,
            direction[1] * distance,
            direction[2] * distance,
          ],
          blend: "additive",
        },
      },
      {
        ...baseTrack(actor, event, order + 1, start, end),
        id: `director:${event.id}:roll_rotation`,
        channel: "orientation",
        operation: "lerp_angle",
        coordinate_space: "actor_local",
        parameters: {
          axis: rollingAxis,
          from_radians: 0,
          to_radians: radians,
          blend: "additive",
        },
      },
    ],
    requirements: [
      {
        id: `director:${event.id}:rolling_radius_requirement`,
        target_entity_id: actor.id,
        kind: "geometry_region",
        semantic_name: "rolling_radius",
        required: false,
        runtime_status: "declared",
      },
      {
        id: `director:${event.id}:rolling_axis_requirement`,
        target_entity_id: actor.id,
        kind: "axis",
        semantic_name: "rolling_axis",
        required: false,
        runtime_status: "declared",
      },
    ],
    state_effects: [],
    warnings: [
      ...(directabilityRadius != null
        ? [
            `Roll uses Phase 1B.5 directability rolling metadata (${rollingRadius.toFixed(3)} m world radius, ${rollingAxis.toUpperCase()} axis).`,
          ]
        : [
            "Rolling radius falls back to half the smallest actor extent because no trustworthy rolling metadata is attached.",
          ]),
      `Roll rotation sign is coupled to travel direction (${rotationSign < 0 ? "negative" : "positive"} ${rollingAxis.toUpperCase()}) so the ground-contact direction does not visually scrub backwards.`,
    ],
  };
}
