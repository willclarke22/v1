import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../director/director-contract";
import {
  DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS,
  compileDirectorRelationalArticulationRecipe,
  type DirectorMotionRecipeActor,
} from "./director-motion-recipes";
import {
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_BEHAVIOURS,
  compileDirectorMultiActorChoreographyRecipe,
  directorMultiActorChoreographyEventsForActor,
} from "./director-multi-actor-choreography";
import {
  DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS,
  compileDirectorProcessQuantityRecipe,
} from "./director-process-quantity";
import {
  DIRECTOR_ASSET_DIRECTABILITY_VERSION,
} from "../directability/asset-directability-contract";
import {
  resolveMotionProgramDirectabilityRequirementsByEntity,
} from "../directability/asset-directability-resolver";
import {
  MOTION_PROGRAM_FOUNDATION_VERSION,
  MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
  MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
  MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
  MOTION_PROGRAM_SCENE_STATE_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
  type MotionProgramAxis,
  type MotionProgramEasing,
  type MotionProgramInitialState,
  type MotionProgramSampleContext,
  type MotionProgramTrack,
  type MotionProgramVec3,
  type MyWayMotionProgramV1,
} from "./motion-program-contract";
import { sampleMotionProgram } from "./motion-program-sampler";

export const DIRECTOR_MOTION_PROGRAM_FOUNDATION_BEHAVIOURS = [
  "move_to",
  "rotate",
  "pivot",
  "oscillate",
] as const satisfies readonly DirectorBehaviour[];

export const DIRECTOR_MOTION_PROGRAM_COMPILED_BEHAVIOURS = [
  ...DIRECTOR_MOTION_PROGRAM_FOUNDATION_BEHAVIOURS,
  ...DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS,
  ...DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_BEHAVIOURS,
  ...DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS,
] as const satisfies readonly DirectorBehaviour[];

export const DIRECTOR_MOTION_PROGRAM_STATE_BEHAVIOURS = [
  "show",
  "hide",
] as const satisfies readonly DirectorBehaviour[];

const DIRECTOR_MOTION_PROGRAM_IGNORED_BEHAVIOURS = [
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

export type DirectorMotionProgramActor = DirectorMotionRecipeActor;

export type DirectorActorMotionProgramCompilation = {
  route: "motion_program" | "legacy_required" | "no_motion";
  program: MyWayMotionProgramV1 | null;
  initial_state: MotionProgramInitialState;
  compiled_event_ids: string[];
  ignored_event_ids: string[];
  unsupported_event_ids: string[];
  recipe_ids: string[];
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

function compileFoundationTrack(
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
    scale: [...(actor.scale ?? [1, 1, 1])],
  };
  const actorEvents = moment.events.filter(
    (event) => event.actor_entity_id === actor.id,
  );
  const choreographyEvents =
    directorMultiActorChoreographyEventsForActor(moment, actor.id);
  const compiled: DirectorEvent[] = [];
  const ignored: DirectorEvent[] = [];
  const unsupported: DirectorEvent[] = [];
  const tracks: MotionProgramTrack[] = [];
  const requirements: MyWayMotionProgramV1["requirements"] = [];
  const stateEffects: MyWayMotionProgramV1["state_effects"] = [];
  const recipeIds: string[] = [];
  const warnings: string[] = [];
  let sceneStateSemanticsUsed = false;
  let choreographySemanticsUsed = false;
  let processSemanticsUsed = false;

  if (actor.attachment_state?.target_entity_id) {
    tracks.push({
      id: `scene-state:${actor.id}:persistent_attachment`,
      target_entity_id: actor.id,
      channel: "transform",
      operation: "sample_target_offset",
      start_progress: 0,
      end_progress: 1,
      easing: "linear",
      coordinate_space: "target_relative",
      order: -10_000,
      parameters: {
        target_entity_id: actor.attachment_state.target_entity_id,
        origin: [...actor.position],
        offset: [...actor.attachment_state.offset_position],
        mode: "replace",
      },
    });
    recipeIds.push("persist_attachment_relation");
    sceneStateSemanticsUsed = true;
  }

  if (
    !actor.attachment_state &&
    actor.choreography_state?.follow_anchor &&
    actor.choreography_state.anchor_entity_id
  ) {
    tracks.push({
      id: `scene-state:${actor.id}:persistent_choreography`,
      target_entity_id: actor.id,
      channel: "transform",
      operation: "sample_target_offset",
      start_progress: 0,
      end_progress: 1,
      easing: "linear",
      coordinate_space: "target_relative",
      order: -9_000,
      parameters: {
        target_entity_id:
          actor.choreography_state.anchor_entity_id,
        origin: [...actor.position],
        offset: [...actor.choreography_state.slot_offset],
        mode: "replace",
      },
    });
    recipeIds.push("persist_multi_actor_choreography_relation");
    sceneStateSemanticsUsed = true;
    choreographySemanticsUsed = true;
  }

  const choreographyHandledEventIds = new Set<string>();
  choreographyEvents.forEach((event) => {
    const eventIndex = moment.events.findIndex(
      (candidate) => candidate.id === event.id,
    );
    const recipe = compileDirectorMultiActorChoreographyRecipe({
      moment,
      event,
      actor,
      actors,
      order: Math.max(0, eventIndex) * 100,
    });
    if (!recipe) return;

    choreographyHandledEventIds.add(event.id);
    compiled.push(event);
    tracks.push(...recipe.tracks);
    requirements.push(...recipe.requirements);
    stateEffects.push(...recipe.state_effects);
    recipeIds.push(recipe.recipe_id);
    warnings.push(...recipe.warnings);
    sceneStateSemanticsUsed = true;
    choreographySemanticsUsed = true;
  });

  actorEvents.forEach((event, index) => {
    if (choreographyHandledEventIds.has(event.id)) return;
    const order = index * 100;

    if (
      (
        DIRECTOR_MOTION_PROGRAM_FOUNDATION_BEHAVIOURS as readonly string[]
      ).includes(event.behaviour)
    ) {
      compiled.push(event);
      tracks.push(
        compileFoundationTrack(
          moment,
          event,
          actor,
          actors,
          order,
        ),
      );
      return;
    }

    if (
      (
        DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_BEHAVIOURS as readonly string[]
      ).includes(event.behaviour)
    ) {
      const recipe = compileDirectorRelationalArticulationRecipe({
        moment,
        event,
        actor,
        actors,
        order,
      });
      if (!recipe) {
        unsupported.push(event);
        return;
      }
      compiled.push(event);
      tracks.push(...recipe.tracks);
      requirements.push(...recipe.requirements);
      stateEffects.push(...recipe.state_effects);
      if (recipe.state_effects.length) sceneStateSemanticsUsed = true;
      recipeIds.push(recipe.recipe_id);
      warnings.push(...recipe.warnings);
      return;
    }

    if (
      (DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS as readonly string[]).includes(
        event.behaviour,
      )
    ) {
      const recipe = compileDirectorProcessQuantityRecipe({
        moment,
        event,
        actor,
        actors,
        order,
      });
      if (!recipe) {
        unsupported.push(event);
        return;
      }
      compiled.push(event);
      tracks.push(...recipe.tracks);
      requirements.push(...recipe.requirements);
      stateEffects.push(...recipe.state_effects);
      recipeIds.push(recipe.recipe_id);
      warnings.push(...recipe.warnings);
      sceneStateSemanticsUsed = true;
      processSemanticsUsed = true;
      return;
    }

    if (
      (DIRECTOR_MOTION_PROGRAM_STATE_BEHAVIOURS as readonly string[]).includes(
        event.behaviour,
      )
    ) {
      compiled.push(event);
      stateEffects.push({
        id: `director:${event.id}:visibility`,
        target_entity_id: actor.id,
        kind: "visibility",
        parameters: {
          visible: event.behaviour === "show",
          effective_progress: eventWindow(moment, event).end_progress,
          persistence_scope: "cross_moment_scene_state",
        },
        runtime_status: "supported",
      });
      recipeIds.push(`visibility_${event.behaviour}`);
      sceneStateSemanticsUsed = true;
      return;
    }

    if (
      (
        DIRECTOR_MOTION_PROGRAM_IGNORED_BEHAVIOURS as readonly string[]
      ).includes(event.behaviour)
    ) {
      ignored.push(event);
      return;
    }

    unsupported.push(event);
  });

  if (unsupported.length) {
    return {
      route: "legacy_required",
      program: null,
      initial_state: initialState,
      compiled_event_ids: compiled.map((event) => event.id),
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: unsupported.map((event) => event.id),
      recipe_ids: recipeIds,
      reason:
        "At least one transform-semantic event is outside the qualified MotionProgram recipe/choreography set, so the complete actor stays on the legacy compatibility path to preserve event ordering.",
    };
  }

  const directabilityResolution =
    resolveMotionProgramDirectabilityRequirementsByEntity(
      requirements,
      (entityId) =>
        actorById(actors, entityId)?.directability ??
        (entityId === actor.id ? actor.directability : null),
    );
  if (
    directabilityResolution.unresolved_required_requirement_ids.length
  ) {
    warnings.push(
      `Asset directability is missing required evidence for ${directabilityResolution.unresolved_required_requirement_ids.join(", ")}; qualified compatibility execution remains explicit rather than inventing asset anatomy.`,
    );
  }

  if (!compiled.length && !tracks.length && !stateEffects.length) {
    return {
      route: "no_motion",
      program: null,
      initial_state: initialState,
      compiled_event_ids: [],
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: [],
      recipe_ids: [],
      reason:
        "This actor has no qualified Universal Motion Program transform/orientation event to compile.",
    };
  }

  const program: MyWayMotionProgramV1 = {
    schema_version: MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
    program_id: `director:${moment.id}:${actor.id}:${processSemanticsUsed ? "phase1b4_6" : choreographySemanticsUsed ? "phase1b4_5" : sceneStateSemanticsUsed ? "phase1b4_4" : "phase1b4_3"}`,
    duration_ms: Math.max(1, moment.duration_ms),
    target_entity_id: actor.id,
    tracks,
    constraints: [],
    state_effects: stateEffects,
    requirements: directabilityResolution.requirements,
    diagnostics: {
      foundation_version: MOTION_PROGRAM_FOUNDATION_VERSION,
      strengthening_version:
        !choreographySemanticsUsed &&
        recipeIds.some((recipeId) =>
          !recipeId.startsWith("visibility_") &&
          recipeId !== "persist_attachment_relation",
        )
          ? MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION
          : null,
      scene_state_version:
        sceneStateSemanticsUsed
          ? MOTION_PROGRAM_SCENE_STATE_VERSION
          : null,
      choreography_version:
        choreographySemanticsUsed
          ? MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION
          : null,
      process_version:
        processSemanticsUsed
          ? MOTION_PROGRAM_PROCESS_QUANTITY_VERSION
          : null,
      directability_version:
        actor.directability
          ? DIRECTOR_ASSET_DIRECTABILITY_VERSION
          : null,
      directability: {
        profile_present: Boolean(actor.directability),
        profile_asset_id: actor.directability?.asset_id ?? null,
        resolved_requirement_ids:
          directabilityResolution.resolved_requirement_ids,
        unresolved_required_requirement_ids:
          directabilityResolution.unresolved_required_requirement_ids,
        unresolved_optional_requirement_ids:
          directabilityResolution.unresolved_optional_requirement_ids,
        resolutions: directabilityResolution.resolutions,
      },
      source_kind: "director_events",
      source_event_ids: [
        ...new Set([
          ...actorEvents.map((event) => event.id),
          ...choreographyEvents.map((event) => event.id),
        ]),
      ],
      compiled_event_ids: compiled.map((event) => event.id),
      ignored_event_ids: ignored.map((event) => event.id),
      unsupported_event_ids: [],
      recipe_ids: recipeIds,
      supported_runtime_channels: [...MOTION_PROGRAM_RUNTIME_CHANNELS],
      supported_coordinate_spaces: [
        ...MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
      ],
      warnings: [...new Set(warnings)],
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
    recipe_ids: recipeIds,
    reason:
      processSemanticsUsed
        ? "Qualified process/quantity semantics compile to deterministic Phase 1B.4.6 process tracks plus persistent quantity state without mutating the source actor root transform."
        : choreographySemanticsUsed
          ? "Qualified multi-actor choreography compiles each declared participant to deterministic Phase 1B.4.5 tracks plus persistent choreography state."
          : sceneStateSemanticsUsed
            ? "Qualified actor motion/state semantics compile to deterministic MotionProgram tracks plus supported Phase 1B.4.4 scene-state effects/relations."
            : recipeIds.length
              ? "All actor transform events are inside the qualified MotionProgram set; Phase 1B.4.3 relational/articulation semantics compile to deterministic recipes."
              : "All actor transform events are inside the frozen Phase 1B.4.2 subset and compile to deterministic MotionProgram tracks.",
  };
}

export function sampleCompiledDirectorActorMotionProgram(
  compilation: DirectorActorMotionProgramCompilation,
  progress: number,
  context?: MotionProgramSampleContext,
) {
  if (!compilation.program) return null;
  return sampleMotionProgram(
    compilation.program,
    progress,
    compilation.initial_state,
    context,
  );
}
