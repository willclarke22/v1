import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../director/director-contract";
import type { DirectorMotionRecipeActor } from "./director-motion-recipes";
import {
  MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
  type MotionProgramDirectabilityRequirement,
  type MotionProgramEasing,
  type MotionProgramStateEffect,
  type MotionProgramTrack,
  type MotionProgramVec3,
} from "./motion-program-contract";

export const DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_BEHAVIOURS = [
  "assemble",
  "disassemble",
  "merge",
  "split",
  "insert_into",
  "remove_from",
  "connect",
  "disconnect",
] as const satisfies readonly DirectorBehaviour[];

export const DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS = {
  assemble: "assemble_parts_into_readable_slots",
  disassemble: "disassemble_parts_to_readable_spread",
  scatter: "scatter_group_radially",
  merge: "merge_actors_into_shared_region",
  split: "split_declared_results_from_shared_region",
  insert_into: "insert_actor_into_containment_slot",
  remove_from: "remove_actor_from_containment_slot",
  connect: "connect_actor_to_semantic_endpoint",
  disconnect: "disconnect_actor_from_semantic_endpoint",
} as const;

export type DirectorMultiActorChoreographyKind =
  keyof typeof DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS;

export type DirectorMultiActorChoreographyRecipe = {
  version: typeof MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION;
  kind: DirectorMultiActorChoreographyKind;
  recipe_id: string;
  event_id: string;
  participant_entity_ids: string[];
  anchor_entity_id: string | null;
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function actorById(
  actors: readonly DirectorMotionRecipeActor[],
  actorId: string | null | undefined,
) {
  return actorId
    ? actors.find((actor) => actor.id === actorId) ?? null
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

function averagePosition(
  actors: readonly DirectorMotionRecipeActor[],
): MotionProgramVec3 {
  if (!actors.length) return [0, 0, 0];
  const total = actors.reduce<MotionProgramVec3>(
    (sum, actor) => [
      sum[0] + actor.position[0],
      sum[1] + actor.position[1],
      sum[2] + actor.position[2],
    ],
    [0, 0, 0],
  );
  return [
    total[0] / actors.length,
    total[1] / actors.length,
    total[2] / actors.length,
  ];
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

function explicitParticipantIds(event: DirectorEvent) {
  return stringArray(event.parameters.participant_entity_ids);
}

export function directorMultiActorChoreographyKind(
  event: DirectorEvent,
): DirectorMultiActorChoreographyKind | null {
  if (
    event.behaviour === "move_away" &&
    (
      event.parameters.choreography_kind === "scatter" ||
      event.parameters.choreography_kind === "scatter_group"
    )
  ) {
    return "scatter";
  }

  if (
    (
      DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_BEHAVIOURS as readonly string[]
    ).includes(event.behaviour)
  ) {
    return event.behaviour as Exclude<
      DirectorMultiActorChoreographyKind,
      "scatter"
    >;
  }

  return null;
}

export function directorMultiActorChoreographyParticipantIds(
  event: DirectorEvent,
) {
  const kind = directorMultiActorChoreographyKind(event);
  const explicit = explicitParticipantIds(event);
  const base = explicit.length
    ? unique(explicit)
    : unique([
        event.actor_entity_id,
        ...event.supporting_entity_ids,
      ]);

  const targetActsAsAnchor =
    kind === "assemble" ||
    kind === "merge" ||
    kind === "insert_into" ||
    kind === "connect";

  return targetActsAsAnchor &&
    event.target_entity_id &&
    event.target_entity_id !== event.actor_entity_id
    ? base.filter((id) => id !== event.target_entity_id)
    : base;
}

export function directorMultiActorChoreographyEventsForActor(
  moment: DirectorMoment,
  actorId: string,
) {
  return moment.events.filter((event) => {
    if (!directorMultiActorChoreographyKind(event)) return false;
    return directorMultiActorChoreographyParticipantIds(event).includes(
      actorId,
    );
  });
}

function slotOffsetsObject(event: DirectorEvent) {
  const value = event.parameters.slot_offsets_by_entity;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function defaultSpacing(
  participantActors: readonly DirectorMotionRecipeActor[],
) {
  const largest = Math.max(
    0.35,
    ...participantActors.map((actor) => actorRadius(actor)),
  );
  return largest * 2.35;
}

function radialOffset(
  index: number,
  count: number,
  radius: number,
  phaseRadians = Math.PI / 6,
): MotionProgramVec3 {
  if (count <= 1 || radius <= 1e-9) return [0, 0, 0];
  const angle =
    phaseRadians +
    (Math.PI * 2 * index) / count;
  return [
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ];
}

function relationForKind(kind: DirectorMultiActorChoreographyKind) {
  switch (kind) {
    case "assemble":
      return {
        relation_kind: "assembled",
        active: true,
        follow_anchor: true,
      } as const;
    case "merge":
      return {
        relation_kind: "merged",
        active: true,
        follow_anchor: true,
      } as const;
    case "insert_into":
      return {
        relation_kind: "contained",
        active: true,
        follow_anchor: true,
      } as const;
    case "connect":
      return {
        relation_kind: "connected",
        active: true,
        follow_anchor: false,
      } as const;
    case "disassemble":
      return {
        relation_kind: "disassembled",
        active: true,
        follow_anchor: false,
      } as const;
    case "scatter":
      return {
        relation_kind: "scattered",
        active: true,
        follow_anchor: false,
      } as const;
    case "split":
      return {
        relation_kind: "split_results",
        active: true,
        follow_anchor: false,
      } as const;
    case "remove_from":
    case "disconnect":
      return {
        relation_kind: null,
        active: false,
        follow_anchor: false,
      } as const;
  }
}

function needsMultipleMovingActors(kind: DirectorMultiActorChoreographyKind) {
  return (
    kind === "assemble" ||
    kind === "disassemble" ||
    kind === "scatter" ||
    kind === "split"
  );
}

function slotOffsetFor(
  kind: DirectorMultiActorChoreographyKind,
  event: DirectorEvent,
  actor: DirectorMotionRecipeActor,
  index: number,
  participantActors: readonly DirectorMotionRecipeActor[],
): MotionProgramVec3 {
  const explicit =
    slotOffsetsObject(event)?.[actor.id];
  if (explicit) return vecParam(explicit, [0, 0, 0]);

  const spacing = numberParam(
    event.parameters.spacing_m,
    defaultSpacing(participantActors),
  );
  const count = Math.max(1, participantActors.length);

  if (kind === "assemble") {
    return radialOffset(index, count, spacing * 0.34);
  }
  if (kind === "merge") {
    return radialOffset(index, count, spacing * 0.12);
  }
  if (kind === "insert_into") {
    return vecParam(
      event.parameters.containment_offset,
      [0, 0, 0],
    );
  }
  if (kind === "connect") {
    return vecParam(
      event.parameters.connection_offset,
      radialOffset(index, count, spacing * 0.45),
    );
  }
  return [0, 0, 0];
}

function spreadTargetFor(
  kind: "disassemble" | "scatter" | "split" | "remove_from" | "disconnect",
  event: DirectorEvent,
  actor: DirectorMotionRecipeActor,
  index: number,
  participantActors: readonly DirectorMotionRecipeActor[],
  center: MotionProgramVec3,
  anchor: DirectorMotionRecipeActor | null,
) {
  const count = Math.max(1, participantActors.length);
  const distance = numberParam(
    event.parameters.distance_m,
    defaultSpacing(participantActors) *
      (kind === "scatter" ? 1.45 : kind === "split" ? 1.15 : 1.0),
  );

  if (kind === "remove_from" || kind === "disconnect") {
    const origin = anchor?.position ?? center;
    const dx = actor.position[0] - origin[0];
    const dy = actor.position[1] - origin[1];
    const dz = actor.position[2] - origin[2];
    const magnitude = Math.hypot(dx, dy, dz);
    const direction =
      magnitude > 1e-9
        ? [dx / magnitude, dy / magnitude, dz / magnitude] as MotionProgramVec3
        : vecParam(event.parameters.direction, [1, 0, 0]);
    return [
      actor.position[0] + direction[0] * distance,
      actor.position[1] + direction[1] * distance,
      actor.position[2] + direction[2] * distance,
    ] as MotionProgramVec3;
  }

  const offset = radialOffset(
    index,
    count,
    distance,
    kind === "scatter" ? Math.PI / 9 : Math.PI / 6,
  );
  return [
    center[0] + offset[0],
    center[1] + offset[1],
    center[2] + offset[2],
  ] as MotionProgramVec3;
}

export function compileDirectorMultiActorChoreographyRecipe(input: {
  moment: DirectorMoment;
  event: DirectorEvent;
  actor: DirectorMotionRecipeActor;
  actors: readonly DirectorMotionRecipeActor[];
  order: number;
}): DirectorMultiActorChoreographyRecipe | null {
  const { moment, event, actor, actors, order } = input;
  const kind = directorMultiActorChoreographyKind(event);
  if (!kind) return null;

  const participantIds =
    directorMultiActorChoreographyParticipantIds(event);
  if (!participantIds.includes(actor.id)) return null;

  const participantActors = participantIds
    .map((id) => actorById(actors, id))
    .filter(
      (candidate): candidate is DirectorMotionRecipeActor =>
        Boolean(candidate),
    );

  if (
    needsMultipleMovingActors(kind) &&
    participantActors.length < 2
  ) {
    return null;
  }

  const index = participantIds.indexOf(actor.id);
  if (index < 0) return null;

  const anchor = actorById(
    actors,
    typeof event.target_entity_id === "string"
      ? event.target_entity_id
      : null,
  );
  const center = vecParam(
    event.parameters.group_center,
    anchor?.position ?? averagePosition(participantActors),
  );
  const { start, end } = eventWindow(moment, event);
  const relation = relationForKind(kind);
  const peers = unique([
    ...participantIds.filter((id) => id !== actor.id),
    ...(event.target_entity_id &&
    event.target_entity_id !== actor.id
      ? [event.target_entity_id]
      : []),
  ]);
  const warnings: string[] = [];
  const requirements: MotionProgramDirectabilityRequirement[] = [];

  if (
    (kind === "insert_into" || kind === "remove_from") &&
    event.target_entity_id
  ) {
    requirements.push({
      id: `director:${event.id}:${actor.id}:containment_region`,
      target_entity_id: event.target_entity_id,
      kind: "geometry_region",
      semantic_name: "containment/interior region",
      required: false,
      runtime_status: "declared",
    });
    warnings.push(
      "Containment motion uses semantic target-relative staging; measured fit/clearance remains Asset Scene Builder authority.",
    );
  }

  const tracks: MotionProgramTrack[] = [];
  let slotOffset: MotionProgramVec3 = [0, 0, 0];

  if (
    kind === "assemble" ||
    kind === "merge" ||
    kind === "insert_into" ||
    kind === "connect"
  ) {
    slotOffset = slotOffsetFor(
      kind,
      event,
      actor,
      index,
      participantActors,
    );

    if (anchor) {
      tracks.push({
        id: `director:${event.id}:${actor.id}:${kind}`,
        target_entity_id: actor.id,
        channel: "transform",
        operation: "sample_target_offset",
        start_progress: start,
        end_progress: end,
        easing: event.easing as MotionProgramEasing,
        coordinate_space: "target_relative",
        order,
        parameters: {
          target_entity_id: anchor.id,
          origin: [...actor.position],
          offset: [...slotOffset],
          mode: "approach",
        },
      });
    } else {
      tracks.push({
        id: `director:${event.id}:${actor.id}:${kind}`,
        target_entity_id: actor.id,
        channel: "transform",
        operation: "lerp_vector",
        start_progress: start,
        end_progress: end,
        easing: event.easing as MotionProgramEasing,
        coordinate_space: "world",
        order,
        parameters: {
          property: "position",
          from: [...actor.position],
          to: [
            center[0] + slotOffset[0],
            center[1] + slotOffset[1],
            center[2] + slotOffset[2],
          ],
          blend: "replace",
        },
      });
    }
  } else {
    const target = spreadTargetFor(
      kind,
      event,
      actor,
      index,
      participantActors,
      center,
      anchor,
    );
    slotOffset = [
      target[0] - center[0],
      target[1] - center[1],
      target[2] - center[2],
    ];
    tracks.push({
      id: `director:${event.id}:${actor.id}:${kind}`,
      target_entity_id: actor.id,
      channel: "transform",
      operation: "lerp_vector",
      start_progress: start,
      end_progress: end,
      easing: event.easing as MotionProgramEasing,
      coordinate_space: "world",
      order,
      parameters: {
        property: "position",
        from: [...actor.position],
        to: target,
        blend: "replace",
      },
    });
  }

  const stateEffects: MotionProgramStateEffect[] = [
    {
      id: `director:${event.id}:${actor.id}:choreography_state`,
      target_entity_id: actor.id,
      kind: "choreography_state",
      parameters: {
        choreography_id: event.id,
        choreography_kind: kind,
        relation_kind: relation.relation_kind,
        active: relation.active,
        follow_anchor:
          relation.follow_anchor && Boolean(anchor),
        anchor_entity_id: anchor?.id ?? null,
        peer_entity_ids: peers,
        participant_entity_ids: participantIds,
        slot_index: index,
        slot_offset: [...slotOffset],
        effective_progress: end,
        persistence_scope: "cross_moment_scene_state",
      },
      runtime_status: "supported",
    },
  ];

  return {
    version: MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
    kind,
    recipe_id: DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS[kind],
    event_id: event.id,
    participant_entity_ids: participantIds,
    anchor_entity_id: anchor?.id ?? null,
    tracks,
    requirements,
    state_effects: stateEffects,
    warnings,
  };
}
