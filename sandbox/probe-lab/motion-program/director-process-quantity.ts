import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../director/director-contract";
import type { DirectorMotionRecipeActor } from "./director-motion-recipes";
import {
  MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
  type MotionProgramEasing,
  type MotionProgramStateEffect,
  type MotionProgramTrack,
  type MotionProgramVec3,
} from "./motion-program-contract";

export const DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS = [
  "flow",
  "emit",
  "fill",
  "drain",
  "accumulate",
] as const satisfies readonly DirectorBehaviour[];

export const DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS = {
  flow: "flow_carriers_along_declared_route",
  emit: "emit_independent_carriers_from_source",
  fill: "fill_occupied_quantity_level",
  drain: "drain_occupied_quantity_level",
  accumulate: "accumulate_quantity_at_region",
} as const satisfies Record<
  (typeof DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS)[number],
  string
>;

export type DirectorProcessQuantityRecipe = {
  version: typeof MOTION_PROGRAM_PROCESS_QUANTITY_VERSION;
  behaviour: (typeof DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS)[number];
  recipe_id: string;
  tracks: MotionProgramTrack[];
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

function vecArray(value: unknown): MotionProgramVec3[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => Array.isArray(item) && item.length >= 3)
    .map((item) => vecParam(item, [0, 0, 0]));
}

function actorById(
  actors: readonly DirectorMotionRecipeActor[],
  actorId: string | null | undefined,
) {
  return actorId
    ? actors.find((actor) => actor.id === actorId) ?? null
    : null;
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
    id: `director:${event.id}:process`,
    target_entity_id: event.actor_entity_id,
    ...eventWindow(moment, event),
    easing: event.easing as MotionProgramEasing,
    order,
  };
}

function currentQuantity(
  actor: DirectorMotionRecipeActor,
  key: string,
  fallback: number,
) {
  const value = actor.process_state?.quantities[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

function processStateEffect(
  event: DirectorEvent,
  processKind: string,
  quantityKey: string | null,
  value: number | null,
): MotionProgramStateEffect {
  return {
    id: `director:${event.id}:process_state`,
    target_entity_id: event.actor_entity_id,
    kind: "process_state",
    parameters: {
      process_kind: processKind,
      quantity_key: quantityKey,
      value,
      source_entity_id: event.actor_entity_id,
      target_entity_id: event.target_entity_id ?? null,
      persistence_scope: "cross_moment_scene_state",
    },
    runtime_status: "supported",
  };
}

export function compileDirectorProcessQuantityRecipe({
  moment,
  event,
  actor,
  actors,
  order,
}: {
  moment: DirectorMoment;
  event: DirectorEvent;
  actor: DirectorMotionRecipeActor;
  actors: readonly DirectorMotionRecipeActor[];
  order: number;
}): DirectorProcessQuantityRecipe | null {
  if (
    !(DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS as readonly string[]).includes(
      event.behaviour,
    )
  ) {
    return null;
  }

  const behaviour =
    event.behaviour as (typeof DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS)[number];
  const params = event.parameters ?? {};
  const warnings: string[] = [];
  const tracks: MotionProgramTrack[] = [];
  const stateEffects: MotionProgramStateEffect[] = [];
  const base = trackBase(moment, event, order);

  if (behaviour === "fill" || behaviour === "drain") {
    const key = "fill_level";
    const existing = currentQuantity(
      actor,
      key,
      behaviour === "fill" ? 0 : 1,
    );
    const from = clamp01(
      numberParam(params.start_level, existing),
    );
    const to = clamp01(
      numberParam(
        params.target_level,
        behaviour === "fill" ? 1 : 0,
      ),
    );
    tracks.push({
      ...base,
      channel: "process",
      operation: "interpolate_quantity",
      coordinate_space: "world",
      apply_before_start: true,
      parameters: {
        quantity_key: key,
        from,
        to,
      },
    });
    stateEffects.push(
      processStateEffect(event, behaviour, key, to),
    );
  } else if (behaviour === "accumulate") {
    const key = "accumulated_amount";
    const existing = Math.max(
      0,
      currentQuantity(actor, key, 0),
    );
    const from = Math.max(
      0,
      numberParam(params.start_amount, existing),
    );
    const explicitTarget = Number(params.target_amount);
    const to = Number.isFinite(explicitTarget)
      ? Math.max(0, explicitTarget)
      : Math.max(
          0,
          from + numberParam(params.amount, 1),
        );
    tracks.push({
      ...base,
      channel: "process",
      operation: "interpolate_quantity",
      coordinate_space: "world",
      apply_before_start: true,
      parameters: {
        quantity_key: key,
        from,
        to,
      },
    });
    stateEffects.push(
      processStateEffect(event, behaviour, key, to),
    );
  } else if (behaviour === "flow") {
    const target = actorById(actors, event.target_entity_id);
    const routePoints = vecArray(params.path_points);
    const fallbackDestination = target
      ? [...target.position] as MotionProgramVec3
      : vecParam(
          params.destination_position,
          [
            actor.position[0] + numberParam(params.distance_m, 2.4),
            actor.position[1],
            actor.position[2],
          ],
        );
    if (!target && routePoints.length === 0) {
      warnings.push(
        "Flow has no explicit target/path; deterministic fallback destination is used for preview execution.",
      );
    }
    tracks.push({
      ...base,
      channel: "process",
      operation: "sample_flow_path",
      coordinate_space: "world",
      parameters: {
        source_entity_id: actor.id,
        destination_entity_id: target?.id ?? null,
        route_points: routePoints,
        fallback_destination: fallbackDestination,
        carrier_count: Math.max(
          1,
          Math.trunc(numberParam(params.carrier_count, 7)),
        ),
      },
    });
    stateEffects.push(
      processStateEffect(event, behaviour, null, null),
    );
  } else {
    const direction = vecParam(params.direction, [0, 1, 0]);
    tracks.push({
      ...base,
      channel: "process",
      operation: "emit_carriers",
      coordinate_space: "actor_local",
      parameters: {
        source_entity_id: actor.id,
        origin: [...actor.position],
        direction,
        distance: Math.max(
          0.05,
          numberParam(
            params.distance_m,
            Math.max(1.25, actor.size[1] * 1.8),
          ),
        ),
        carrier_count: Math.max(
          1,
          Math.trunc(numberParam(params.carrier_count, 7)),
        ),
        spread_radians:
          (Math.max(
            0,
            numberParam(params.spread_degrees, 34),
          ) *
            Math.PI) /
          180,
      },
    });
    stateEffects.push(
      processStateEffect(event, behaviour, null, null),
    );
  }

  return {
    version: MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
    behaviour,
    recipe_id: DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS[behaviour],
    tracks,
    state_effects: stateEffects,
    warnings: [
      ...warnings,
      "Phase 1B.4.6 process tracks are deterministic semantic carriers/quantity samples, not fluid, smoke, granular, or particle physics simulation.",
    ],
  };
}
