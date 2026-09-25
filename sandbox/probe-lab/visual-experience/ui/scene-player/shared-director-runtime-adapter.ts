import {
  directorSceneStateBeforeMoment,
} from "../../../motion-program/director-scene-state-reducer";
import {
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "../../../scenes/ui/director-shot-runtime";
import type { PreparedSemanticScene } from "./semantic-scene-layout";

export const VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION =
  "visual_experience_shared_director_primary_v2" as const;

function actorSize(
  entity: PreparedSemanticScene["entities"][number],
): [number, number, number] {
  const dimensions = entity.resolved_asset?.dimensions_m;
  if (dimensions) {
    return dimensions.map((value) =>
      Math.max(0.08, Math.abs(value)),
    ) as [number, number, number];
  }
  return entity.scale.map((value) =>
    Math.max(0.08, Math.abs(value) * 2),
  ) as [number, number, number];
}

function baseActorPosition(
  entity: PreparedSemanticScene["entities"][number],
): [number, number, number] {
  const collectionPosition =
    entity.resolved_asset?.collection_membership?.runtime_transform.position;
  return collectionPosition
    ? [...collectionPosition]
    : [...entity.position];
}

function baseActorRotation(
  entity: PreparedSemanticScene["entities"][number],
): [number, number, number] {
  const collectionRotation =
    entity.resolved_asset?.collection_membership?.runtime_transform.rotation;
  return collectionRotation
    ? [...collectionRotation]
    : [0, 0, 0];
}

/**
 * Production runtime context for Visual Experience.
 *
 * When a canonical Director plan exists, this is the same Director/UMP/scene-state
 * execution boundary used by Asset Scene Builder. Visual Experience retains its
 * legacy renderer only as a no-Director compatibility fallback.
 */
export function buildVisualExperienceDirectorRuntimeContext(
  scene: PreparedSemanticScene,
) {
  const directorPlan = scene.director_plan;
  if (!directorPlan?.moments.length) return null;

  const momentIndex = Math.max(
    0,
    Math.min(
      directorPlan.moments.length - 1,
      scene.active_beat_index,
    ),
  );
  const moment = directorPlan.moments[momentIndex]!;
  const actors: DirectorRuntimeActor[] = scene.entities.map((entity) => ({
    id: entity.id,
    position: baseActorPosition(entity),
    rotation: baseActorRotation(entity),
    size: actorSize(entity),
  }));
  const sceneState = directorSceneStateBeforeMoment(
    directorPlan.moments,
    momentIndex,
    actors,
  );

  return {
    directorPlan,
    moment,
    momentIndex,
    actors,
    sceneState,
  };
}

export function buildVisualExperienceSharedDirectorSnapshot(
  scene: PreparedSemanticScene,
  progress: number,
) {
  const runtime = buildVisualExperienceDirectorRuntimeContext(scene);
  if (!runtime) {
    return {
      bridge_version: VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION,
      status: "legacy_fallback" as const,
      moment_id: null,
      moment_index: null,
      sampled_actor_count: 0,
      active_process_actor_count: 0,
      samples: [],
    };
  }

  const samples = runtime.actors.map((actor) => {
    const sampled = sampleDirectorActorState(
      runtime.moment,
      actor,
      progress,
      runtime.actors,
      runtime.sceneState,
    );
    return {
      actor_id: actor.id,
      position: sampled.position.toArray() as [number, number, number],
      rotation: [
        sampled.rotation.x,
        sampled.rotation.y,
        sampled.rotation.z,
      ] as [number, number, number],
      scale: sampled.scale.toArray() as [number, number, number],
      visible: sampled.visible !== false,
      process_track_count:
        sampled.process?.active_process_track_ids.length ?? 0,
    };
  });

  return {
    bridge_version: VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION,
    status: "shared_runtime_primary" as const,
    moment_id: runtime.moment.id,
    moment_index: runtime.momentIndex,
    sampled_actor_count: samples.length,
    active_process_actor_count: samples.filter(
      (sample) => sample.process_track_count > 0,
    ).length,
    samples,
  };
}
