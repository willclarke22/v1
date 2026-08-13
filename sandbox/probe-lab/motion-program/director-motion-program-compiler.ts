import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../director/director-contract";
import {
  MOTION_PROGRAM_FOUNDATION_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
  type MotionProgramAxis,
  type MotionProgramEasing,
  type MotionProgramInitialState,
  type MotionProgramTrack,
  type MotionProgramVec3,
  type MyWayMotionProgramV1,
} from "./motion-program-contract";
import { sampleMotionProgram } from "./motion-program-sampler";

export const DIRECTOR_MOTION_PROGRAM_COMPILED_BEHAVIOURS = [
  "move_to",
  "rotate",
  "pivot",
  "oscillate",
] as const satisfies readonly DirectorBehaviour[];

const DIRECTOR_MOTION_PROGRAM_IGNORED_BEHAVIOURS = [
  "show",
  "hide",
  "highlight",
  "dim_others",
  "trace",
  "filter",
  "replace",
  "pause",
  "compare",
  "reveal_cutaway",
  "custom_semantic",
] as const satisfies readonly DirectorBehaviour[];

export type DirectorMotionProgramActor = {
  id: string;
  position: MotionProgramVec3;
  rotation?: MotionProgramVec3;
  size: MotionProgramVec3;
};

export type DirectorActorMotionProgramCompilation = {
  route: "motion_program" | "legacy_required" | "no_motion";
  program: MyWayMotionProgramV1 | null;
  initial_state: MotionProgramInitialState;
  compiled_event_ids: string[];
  ignored_event_ids: string[];
  unsupported_event_ids: string[];
  reason: string;
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

function actorById(
  actors: DirectorMotionProgramActor[],
  id: string | null | undefined,
) {
  return id
    ? actors.find((actor) => actor.id === id) ?? null
    : null;
}

function actorRadius(actor: DirectorMotionProgramActor) {
  const [x, y, z] = actor.size.map((value) =>
    Math.max(0.02, Math.abs(value)),
  ) as MotionProgramVec3;
  return Math.max(
    0.12,
    Math.sqrt(x * x + y * y + z * z) * 0.34,
  );
}

function axisParam(value: unknown): MotionProgramAxis {
  return value === "x" || value === "z" ? value : "y";
}

function eventWindow(moment: DirectorMoment, event: DirectorEvent) {
  const durationMs = Math.max(1, moment.duration_ms);
  const start = clamp01(event.start_ms / durationMs);
  const end = clamp01(
    (event.start_ms + Math.max(1, event.duration_ms)) / durationMs,
  );
  return {
    start_progress: start,
    end_progress: Math.max(start + Number.EPSILON, end),
  };
}

function trackBase(
  moment: DirectorMoment,
  event: DirectorEvent,
  order: number,
) {
  return {
    id: `director:${event.id}`,
    target_entity_id: event.actor_entity_id,
    ...eventWindow(moment, event),
    easing: event.easing as MotionProgramEasing,
    coordinate_space: "world" as const,
    order,
  };
}

function compileEventTrack(
  moment: DirectorMoment,
  event: DirectorEvent,
  actor: DirectorMotionProgramActor,
  actors: DirectorMotionProgramActor[],
  order: number,
): MotionProgramTrack {
  const params = event.parameters ?? {};
  const basePosition: MotionProgramVec3 = [...actor.position];

  if (event.behaviour === "move_to") {
    const targetActor = actorById(actors, event.target_entity_id);
    const target = targetActor
      ? ([...targetActor.position] as MotionProgramVec3)
      : vecParam(params.target_position, actor.position);
    const origin = Array.isArray(params.start_position)
      ? vecParam(params.start_position, actor.position)
      : basePosition;
    return {
      ...trackBase(moment, event, order),
      channel: "transform",
      operation: "lerp_vector",
      parameters: {
        property: "position",
        from: origin,
        to: target,
        blend: "replace",
      },
    };
  }

  if (event.behaviour === "rotate") {
    const turns = numberParam(params.turns, 1);
    return {
      ...trackBase(moment, event, order),
      channel: "orientation",
      operation: "lerp_angle",
      parameters: {
        axis: axisParam(params.axis),
        from_radians: 0,
        to_radians: Math.PI * 2 * turns,
        blend: "additive",
      },
    };
  }

  if (event.behaviour === "pivot") {
    const localPivot = vecParam(
      params.pivot_local,
      [-Math.max(0.05, actor.size[0]) * 0.5, 0, 0],
    );
    const anchor: MotionProgramVec3 = [
      basePosition[0] + localPivot[0],
      basePosition[1] + localPivot[1],
      basePosition[2] + localPivot[2],
    ];
    return {
      ...trackBase(moment, event, order),
      channel: "transform",
      operation: "rotate_around_anchor",
      parameters: {
        origin: basePosition,
        anchor,
        axis: axisParam(params.axis),
        from_radians: 0,
        to_radians:
          (numberParam(params.degrees, 90) * Math.PI) / 180,
        rotate_orientation: true,
      },
    };
  }

  const amplitude = numberParam(
    params.amplitude_m,
    Math.max(0.25, actorRadius(actor) * 0.65),
  );
  return {
    ...trackBase(moment, event, order),
    channel: "transform",
    operation: "sample_periodic",
    parameters: {
      property: "position",
      origin: basePosition,
      direction: vecParam(params.direction, [1, 0, 0]),
      amplitude,
      cycles: numberParam(params.cycles, 2),
      phase_radians: 0,
    },
  };
}

export function compileDirectorActorMotionProgram(
  moment: DirectorMoment,
  actor: DirectorMotionProgramActor,
  actors: DirectorMotionProgramActor[],
): DirectorActorMotionProgramCompilation {
  const initialState: MotionProgramInitialState = {
    position: [...actor.position],
    rotation: [...(actor.rotation ?? [0, 0, 0])],
    scale: [1, 1, 1],
  };
  const actorEvents = moment.events.filter(
    (event) => event.actor_entity_id === actor.id,
  );
  const compiled: DirectorEvent[] = [];
  const ignored: DirectorEvent[] = [];
  const unsupported: DirectorEvent[] = [];

  for (const event of actorEvents) {
    if (
      (DIRECTOR_MOTION_PROGRAM_COMPILED_BEHAVIOURS as readonly string[]).includes(
        event.behaviour,
      )
    ) {
      compiled.push(event);
    } else if (
      (DIRECTOR_MOTION_PROGRAM_IGNORED_BEHAVIOURS as readonly string[]).includes(
        event.behaviour,
      )
    ) {
      ignored.push(event);
    } else {
      unsupported.push(event);
    }
  }

  if (unsupported.length) {
    return {
      route: "legacy_required",
      program: null,
      initial_state: initialState,
      compiled_event_ids: compiled.map((event) => event.id),
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: unsupported.map((event) => event.id),
      reason:
        "At least one transform-semantic event is outside the Phase 1B.4.2 qualified subset, so the complete actor stays on the legacy compatibility path to preserve event ordering.",
    };
  }

  if (!compiled.length) {
    return {
      route: "no_motion",
      program: null,
      initial_state: initialState,
      compiled_event_ids: [],
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: [],
      reason:
        "This actor has no Phase 1B.4.2 transform/orientation event to compile.",
    };
  }

  const tracks = compiled.map((event, index) =>
    compileEventTrack(moment, event, actor, actors, index),
  );
  const program: MyWayMotionProgramV1 = {
    schema_version: MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
    program_id: `director:${moment.id}:${actor.id}:phase1b4_2`,
    duration_ms: Math.max(1, moment.duration_ms),
    target_entity_id: actor.id,
    tracks,
    constraints: [],
    state_effects: [],
    requirements: [],
    diagnostics: {
      foundation_version: MOTION_PROGRAM_FOUNDATION_VERSION,
      source_kind: "director_events",
      source_event_ids: actorEvents.map((event) => event.id),
      compiled_event_ids: compiled.map((event) => event.id),
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: [],
      supported_runtime_channels: [...MOTION_PROGRAM_RUNTIME_CHANNELS],
      supported_coordinate_spaces: [
        ...MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
      ],
      warnings: [],
      legacy_fallback_required: false,
    },
  };

  return {
    route: "motion_program",
    program,
    initial_state: initialState,
    compiled_event_ids: compiled.map((event) => event.id),
    ignored_event_ids: ignored.map((event) => event.id),
    unsupported_event_ids: [],
    reason:
      "All actor transform events are inside the frozen Phase 1B.4.2 subset and compile to deterministic MotionProgram tracks.",
  };
}

export function sampleCompiledDirectorActorMotionProgram(
  compilation: DirectorActorMotionProgramCompilation,
  progress: number,
) {
  if (!compilation.program) return null;
  return sampleMotionProgram(
    compilation.program,
    progress,
    compilation.initial_state,
  );
}
