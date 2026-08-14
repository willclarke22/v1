import type {
  MotionProgramAxis,
  MotionProgramVec3,
} from "./motion-program-contract";

export const DIRECTOR_SCENE_STATE_SCHEMA_VERSION =
  "director_scene_state_phase1b4_4_v1" as const;

export type DirectorSceneAttachmentState = {
  target_entity_id: string;
  offset_position: MotionProgramVec3;
  offset_rotation: MotionProgramVec3;
  bound_at_moment_id: string;
};

export type DirectorSceneArticulationState = {
  openness: number;
  closed_position: MotionProgramVec3;
  closed_rotation: MotionProgramVec3;
  pivot_local: MotionProgramVec3;
  axis: MotionProgramAxis;
  degrees: number;
  updated_at_moment_id: string;
};

export type DirectorSceneChoreographyState = {
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
};

export type DirectorActorSceneState = {
  actor_id: string;
  position: MotionProgramVec3;
  rotation: MotionProgramVec3;
  scale: MotionProgramVec3;
  visible: boolean;
  attachment_state: DirectorSceneAttachmentState | null;
  articulation_state: DirectorSceneArticulationState | null;
  choreography_state: DirectorSceneChoreographyState | null;
  custom_semantic_state: Record<string, unknown>;
};

export type DirectorSceneState = {
  schema_version: typeof DIRECTOR_SCENE_STATE_SCHEMA_VERSION;
  actors: Record<string, DirectorActorSceneState>;
};

export type DirectorSceneStateActor = {
  id: string;
  position: MotionProgramVec3;
  rotation?: MotionProgramVec3;
  scale?: MotionProgramVec3;
  size: MotionProgramVec3;
  articulation_state?: DirectorSceneArticulationState | null;
  attachment_state?: DirectorSceneAttachmentState | null;
  choreography_state?: DirectorSceneChoreographyState | null;
};

function cloneVec3(value: MotionProgramVec3): MotionProgramVec3 {
  return [value[0], value[1], value[2]];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeDirectorSceneArticulationState(
  state: DirectorSceneArticulationState | null | undefined,
): DirectorSceneArticulationState | null {
  if (!state) return null;
  return {
    ...state,
    openness: clamp01(state.openness),
    closed_position: cloneVec3(state.closed_position),
    closed_rotation: cloneVec3(state.closed_rotation),
    pivot_local: cloneVec3(state.pivot_local),
  };
}

export function cloneDirectorSceneChoreographyState(
  state: DirectorSceneChoreographyState | null | undefined,
): DirectorSceneChoreographyState | null {
  if (!state) return null;
  return {
    ...state,
    peer_entity_ids: [...state.peer_entity_ids],
    participant_entity_ids: [...state.participant_entity_ids],
    slot_offset: cloneVec3(state.slot_offset),
  };
}

export function cloneDirectorActorSceneState(
  state: DirectorActorSceneState,
): DirectorActorSceneState {
  return {
    actor_id: state.actor_id,
    position: cloneVec3(state.position),
    rotation: cloneVec3(state.rotation),
    scale: cloneVec3(state.scale),
    visible: state.visible,
    attachment_state: state.attachment_state
      ? {
          ...state.attachment_state,
          offset_position: cloneVec3(state.attachment_state.offset_position),
          offset_rotation: cloneVec3(state.attachment_state.offset_rotation),
        }
      : null,
    articulation_state: normalizeDirectorSceneArticulationState(
      state.articulation_state,
    ),
    choreography_state: cloneDirectorSceneChoreographyState(
      state.choreography_state,
    ),
    custom_semantic_state: { ...state.custom_semantic_state },
  };
}

export function cloneDirectorSceneState(
  state: DirectorSceneState,
): DirectorSceneState {
  return {
    schema_version: DIRECTOR_SCENE_STATE_SCHEMA_VERSION,
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([actorId, actorState]) => [
        actorId,
        cloneDirectorActorSceneState(actorState),
      ]),
    ),
  };
}

export function createDirectorSceneState(
  actors: readonly DirectorSceneStateActor[],
): DirectorSceneState {
  return {
    schema_version: DIRECTOR_SCENE_STATE_SCHEMA_VERSION,
    actors: Object.fromEntries(
      actors.map((actor) => [
        actor.id,
        {
          actor_id: actor.id,
          position: cloneVec3(actor.position),
          rotation: cloneVec3(actor.rotation ?? [0, 0, 0]),
          scale: cloneVec3(actor.scale ?? [1, 1, 1]),
          visible: true,
          attachment_state: actor.attachment_state
            ? {
                ...actor.attachment_state,
                offset_position: cloneVec3(
                  actor.attachment_state.offset_position,
                ),
                offset_rotation: cloneVec3(
                  actor.attachment_state.offset_rotation,
                ),
              }
            : null,
          articulation_state: normalizeDirectorSceneArticulationState(
            actor.articulation_state,
          ),
          choreography_state: cloneDirectorSceneChoreographyState(
            actor.choreography_state,
          ),
          custom_semantic_state: {},
        } satisfies DirectorActorSceneState,
      ]),
    ),
  };
}

export function directorActorSceneState(
  state: DirectorSceneState | null | undefined,
  actorId: string,
) {
  return state?.actors[actorId] ?? null;
}

export function directorSceneStateActorVisible(
  state: DirectorSceneState | null | undefined,
  actorId: string,
) {
  return directorActorSceneState(state, actorId)?.visible ?? true;
}

export function resolveDirectorActorWithSceneState<
  T extends {
    id: string;
    position: MotionProgramVec3;
    rotation?: MotionProgramVec3;
    size: MotionProgramVec3;
  },
>(
  actor: T,
  state: DirectorSceneState | null | undefined,
): T & DirectorSceneStateActor {
  const actorState = directorActorSceneState(state, actor.id);
  return {
    ...actor,
    position: cloneVec3(actorState?.position ?? actor.position),
    rotation: cloneVec3(
      actorState?.rotation ?? actor.rotation ?? [0, 0, 0],
    ),
    size: cloneVec3(actor.size),
    scale: cloneVec3(actorState?.scale ?? [1, 1, 1]),
    attachment_state: actorState?.attachment_state
      ? {
          ...actorState.attachment_state,
          offset_position: cloneVec3(
            actorState.attachment_state.offset_position,
          ),
          offset_rotation: cloneVec3(
            actorState.attachment_state.offset_rotation,
          ),
        }
      : null,
    articulation_state: normalizeDirectorSceneArticulationState(
      actorState?.articulation_state,
    ),
    choreography_state: cloneDirectorSceneChoreographyState(
      actorState?.choreography_state,
    ),
  };
}
