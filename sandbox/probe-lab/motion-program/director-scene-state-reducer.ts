import type { DirectorMoment } from "../director/director-contract";
import {
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
  type DirectorActorMotionProgramCompilation,
} from "./director-motion-program-compiler";
import type {
  MotionProgramInitialState,
  MotionProgramStateEffect,
  MotionProgramVec3,
} from "./motion-program-contract";
import {
  cloneDirectorSceneState,
  createDirectorSceneState,
  resolveDirectorActorWithSceneState,
  type DirectorActorSceneState,
  type DirectorSceneArticulationState,
  type DirectorSceneAttachmentState,
  type DirectorSceneChoreographyState,
  type DirectorSceneProcessState,
  type DirectorSceneState,
  type DirectorSceneStateActor,
} from "./director-scene-state";

export type DirectorSceneStateActorReduction = {
  actor_id: string;
  route: DirectorActorMotionProgramCompilation["route"];
  reason: string;
  sampled: boolean;
  finite: boolean;
  unsupported_event_ids: string[];
  applied_state_effect_ids: string[];
};

export type DirectorSceneStateMomentReduction = {
  moment_id: string;
  incoming_state: DirectorSceneState;
  outgoing_state: DirectorSceneState;
  actor_results: DirectorSceneStateActorReduction[];
};

export type DirectorSceneStateTimeline = {
  initial_state: DirectorSceneState;
  moment_results: DirectorSceneStateMomentReduction[];
  final_state: DirectorSceneState;
};

type SampleResult = {
  sample: MotionProgramInitialState;
  compilation: DirectorActorMotionProgramCompilation;
  finite: boolean;
};

function cloneVec3(value: MotionProgramVec3): MotionProgramVec3 {
  return [value[0], value[1], value[2]];
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
  return cloneVec3(fallback);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function actorById(
  actors: readonly DirectorSceneStateActor[],
  actorId: string,
) {
  return actors.find((actor) => actor.id === actorId) ?? null;
}

function stateResolvedActors(
  actors: readonly DirectorSceneStateActor[],
  state: DirectorSceneState,
) {
  return actors.map((actor) =>
    resolveDirectorActorWithSceneState(actor, state),
  );
}

function sampleActor(
  moment: DirectorMoment,
  actorId: string,
  progress: number,
  actors: readonly DirectorSceneStateActor[],
  incomingState: DirectorSceneState,
  stack: ReadonlySet<string>,
): SampleResult | null {
  const baseActor = actorById(actors, actorId);
  if (!baseActor || stack.has(actorId)) return null;

  const resolvedActors = stateResolvedActors(actors, incomingState);
  const actor = resolvedActors.find((candidate) => candidate.id === actorId);
  if (!actor) return null;

  const compilation = compileDirectorActorMotionProgram(
    moment,
    actor,
    resolvedActors,
  );
  if (compilation.route === "legacy_required") return null;
  if (!compilation.program) {
    return {
      sample: {
        position: cloneVec3(compilation.initial_state.position),
        rotation: cloneVec3(compilation.initial_state.rotation),
        scale: cloneVec3(compilation.initial_state.scale),
      },
      compilation,
      finite: true,
    };
  }

  const nextStack = new Set(stack);
  nextStack.add(actorId);
  const sampled = sampleCompiledDirectorActorMotionProgram(
    compilation,
    progress,
    {
      sample_entity_state: (targetId, targetProgress) =>
        sampleActor(
          moment,
          targetId,
          targetProgress,
          actors,
          incomingState,
          nextStack,
        )?.sample ?? null,
    },
  );
  if (!sampled) return null;

  return {
    sample: {
      position: cloneVec3(sampled.position),
      rotation: cloneVec3(sampled.rotation),
      scale: cloneVec3(sampled.scale),
    },
    compilation,
    finite:
      sampled.diagnostics.finite &&
      sampled.diagnostics.unsupported_track_ids.length === 0,
  };
}

function applyVisibilityFallback(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
) {
  for (const event of moment.events) {
    if (event.actor_entity_id !== actorState.actor_id) continue;
    if (event.behaviour === "show") actorState.visible = true;
    if (event.behaviour === "hide") actorState.visible = false;
  }
}

function articulationStateFromEffect(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
  effect: MotionProgramStateEffect,
): DirectorSceneArticulationState {
  const existing = actorState.articulation_state;
  return {
    openness: Math.max(
      0,
      Math.min(
        1,
        numberParam(
          effect.parameters.openness,
          effect.parameters.state === "open" ? 1 : 0,
        ),
      ),
    ),
    closed_position: vecParam(
      effect.parameters.closed_position,
      existing?.closed_position ?? actorState.position,
    ),
    closed_rotation: vecParam(
      effect.parameters.closed_rotation,
      existing?.closed_rotation ?? actorState.rotation,
    ),
    pivot_local: vecParam(
      effect.parameters.pivot_local,
      existing?.pivot_local ?? [0, 0, 0],
    ),
    axis:
      effect.parameters.axis === "x" || effect.parameters.axis === "z"
        ? effect.parameters.axis
        : "y",
    degrees: numberParam(
      effect.parameters.degrees,
      existing?.degrees ?? 90,
    ),
    updated_at_moment_id: moment.id,
  };
}

function attachmentStateFromEffect(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
  effect: MotionProgramStateEffect,
): DirectorSceneAttachmentState | null {
  if (effect.parameters.state === "detached") return null;
  const targetId =
    typeof effect.parameters.target_entity_id === "string"
      ? effect.parameters.target_entity_id
      : null;
  if (!targetId) return actorState.attachment_state;
  return {
    target_entity_id: targetId,
    offset_position: vecParam(
      effect.parameters.offset_position ?? effect.parameters.offset,
      actorState.attachment_state?.offset_position ?? [0, 0, 0],
    ),
    offset_rotation: vecParam(
      effect.parameters.offset_rotation,
      actorState.attachment_state?.offset_rotation ?? [0, 0, 0],
    ),
    bound_at_moment_id: moment.id,
  };
}

function choreographyStateFromEffect(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
  effect: MotionProgramStateEffect,
): DirectorSceneChoreographyState | null {
  if (effect.parameters.active === false) return null;

  const relationKind =
    typeof effect.parameters.relation_kind === "string"
      ? effect.parameters.relation_kind
      : null;
  const choreographyId =
    typeof effect.parameters.choreography_id === "string"
      ? effect.parameters.choreography_id
      : effect.id;
  const choreographyKind =
    typeof effect.parameters.choreography_kind === "string"
      ? effect.parameters.choreography_kind
      : "multi_actor";
  if (!relationKind) return actorState.choreography_state;

  return {
    choreography_id: choreographyId,
    choreography_kind: choreographyKind,
    relation_kind: relationKind,
    anchor_entity_id:
      typeof effect.parameters.anchor_entity_id === "string"
        ? effect.parameters.anchor_entity_id
        : null,
    peer_entity_ids: stringArray(effect.parameters.peer_entity_ids),
    participant_entity_ids: stringArray(
      effect.parameters.participant_entity_ids,
    ),
    slot_index: Math.max(
      0,
      Math.trunc(numberParam(effect.parameters.slot_index, 0)),
    ),
    slot_offset: vecParam(effect.parameters.slot_offset, [0, 0, 0]),
    follow_anchor: Boolean(effect.parameters.follow_anchor),
    updated_at_moment_id: moment.id,
  };
}


function processStateFromEffect(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
  effect: MotionProgramStateEffect,
): DirectorSceneProcessState {
  const existing = actorState.process_state;
  const quantities = {
    ...(existing?.quantities ?? {}),
  };
  const quantityKey =
    typeof effect.parameters.quantity_key === "string"
      ? effect.parameters.quantity_key
      : null;
  const value = Number(effect.parameters.value);
  if (quantityKey && Number.isFinite(value)) {
    quantities[quantityKey] = value;
  }

  return {
    quantities,
    last_process_kind:
      typeof effect.parameters.process_kind === "string"
        ? effect.parameters.process_kind
        : existing?.last_process_kind ?? null,
    source_entity_id:
      typeof effect.parameters.source_entity_id === "string"
        ? effect.parameters.source_entity_id
        : existing?.source_entity_id ?? actorState.actor_id,
    target_entity_id:
      typeof effect.parameters.target_entity_id === "string"
        ? effect.parameters.target_entity_id
        : null,
    updated_at_moment_id: moment.id,
  };
}

function applyStateEffect(
  moment: DirectorMoment,
  actorState: DirectorActorSceneState,
  effect: MotionProgramStateEffect,
) {
  if (effect.target_entity_id !== actorState.actor_id) return false;

  if (effect.kind === "visibility") {
    actorState.visible = Boolean(effect.parameters.visible);
    return true;
  }
  if (effect.kind === "attachment_state") {
    actorState.attachment_state = attachmentStateFromEffect(
      moment,
      actorState,
      effect,
    );
    return true;
  }
  if (effect.kind === "articulation_state") {
    actorState.articulation_state = articulationStateFromEffect(
      moment,
      actorState,
      effect,
    );
    return true;
  }
  if (effect.kind === "choreography_state") {
    actorState.choreography_state = choreographyStateFromEffect(
      moment,
      actorState,
      effect,
    );
    return true;
  }
  if (effect.kind === "process_state") {
    actorState.process_state = processStateFromEffect(
      moment,
      actorState,
      effect,
    );
    return true;
  }
  if (effect.kind === "custom_semantic_state") {
    const key =
      typeof effect.parameters.key === "string"
        ? effect.parameters.key
        : effect.id;
    actorState.custom_semantic_state[key] = effect.parameters.value;
    return true;
  }
  return false;
}

export function sampleDirectorActorInMomentFromSceneState(
  moment: DirectorMoment,
  actorId: string,
  progress: number,
  actors: readonly DirectorSceneStateActor[],
  incomingState: DirectorSceneState,
) {
  return sampleActor(
    moment,
    actorId,
    progress,
    actors,
    incomingState,
    new Set<string>(),
  )?.sample ?? null;
}

export function reduceDirectorMomentSceneState(
  moment: DirectorMoment,
  actors: readonly DirectorSceneStateActor[],
  incomingState?: DirectorSceneState | null,
): DirectorSceneStateMomentReduction {
  const incoming = incomingState
    ? cloneDirectorSceneState(incomingState)
    : createDirectorSceneState(actors);
  const outgoing = cloneDirectorSceneState(incoming);
  const actorResults: DirectorSceneStateActorReduction[] = [];

  for (const actor of actors) {
    const actorState = outgoing.actors[actor.id];
    if (!actorState) continue;
    const result = sampleActor(
      moment,
      actor.id,
      1,
      actors,
      incoming,
      new Set<string>(),
    );

    let compilation: DirectorActorMotionProgramCompilation;
    if (result) {
      compilation = result.compilation;
      if (result.finite) {
        actorState.position = cloneVec3(result.sample.position);
        actorState.rotation = cloneVec3(result.sample.rotation);
        actorState.scale = cloneVec3(result.sample.scale);
      }
    } else {
      const resolvedActors = stateResolvedActors(actors, incoming);
      const resolvedActor = resolvedActors.find(
        (candidate) => candidate.id === actor.id,
      )!;
      compilation = compileDirectorActorMotionProgram(
        moment,
        resolvedActor,
        resolvedActors,
      );
    }

    const appliedStateEffectIds: string[] = [];
    for (const effect of compilation.program?.state_effects ?? []) {
      if (applyStateEffect(moment, actorState, effect)) {
        appliedStateEffectIds.push(effect.id);
      }
    }
    // Visibility belongs to scene state even if another unsupported transform
    // forces this actor onto the legacy compatibility path for the moment.
    applyVisibilityFallback(moment, actorState);

    actorResults.push({
      actor_id: actor.id,
      route: compilation.route,
      reason: compilation.reason,
      sampled: Boolean(result),
      finite: result?.finite ?? compilation.route === "no_motion",
      unsupported_event_ids: [...compilation.unsupported_event_ids],
      applied_state_effect_ids: appliedStateEffectIds,
    });
  }

  return {
    moment_id: moment.id,
    incoming_state: incoming,
    outgoing_state: outgoing,
    actor_results: actorResults,
  };
}

export function reduceDirectorMomentToSceneState(
  moment: DirectorMoment,
  actors: readonly DirectorSceneStateActor[],
  incomingState?: DirectorSceneState | null,
) {
  return reduceDirectorMomentSceneState(
    moment,
    actors,
    incomingState,
  ).outgoing_state;
}

export function reduceDirectorMomentsToSceneState(
  moments: readonly DirectorMoment[],
  actors: readonly DirectorSceneStateActor[],
  initialState?: DirectorSceneState | null,
): DirectorSceneStateTimeline {
  const initial = initialState
    ? cloneDirectorSceneState(initialState)
    : createDirectorSceneState(actors);
  let current = cloneDirectorSceneState(initial);
  const momentResults: DirectorSceneStateMomentReduction[] = [];

  for (const moment of moments) {
    const result = reduceDirectorMomentSceneState(
      moment,
      actors,
      current,
    );
    momentResults.push(result);
    current = result.outgoing_state;
  }

  return {
    initial_state: initial,
    moment_results: momentResults,
    final_state: cloneDirectorSceneState(current),
  };
}

export function directorSceneStateBeforeMoment(
  moments: readonly DirectorMoment[],
  momentIndex: number,
  actors: readonly DirectorSceneStateActor[],
  initialState?: DirectorSceneState | null,
) {
  const safeIndex = Math.max(0, Math.min(moments.length, momentIndex));
  return reduceDirectorMomentsToSceneState(
    moments.slice(0, safeIndex),
    actors,
    initialState,
  ).final_state;
}

export function buildDirectorSceneStateInspectorSnapshot(
  moment: DirectorMoment,
  actors: readonly DirectorSceneStateActor[],
) {
  const reduction = reduceDirectorMomentSceneState(moment, actors);
  return {
    schema_version: reduction.outgoing_state.schema_version,
    moment_id: moment.id,
    incoming_state: reduction.incoming_state,
    outgoing_state: reduction.outgoing_state,
    actor_results: reduction.actor_results,
    note:
      "Phase 1B.4.4 separates deterministic motion sampling from persistent state; Phase 1B.4.5 adds explicit multi-actor choreography relations; Phase 1B.4.6 persists qualified quantity/process state without pretending transient carriers are physics simulation.",
  };
}
