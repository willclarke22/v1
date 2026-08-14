import {
  directorSceneStateBeforeMoment,
} from "../../../motion-program/director-scene-state-reducer";
import {
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "../../../scenes/ui/director-shot-runtime";
import type { PreparedSemanticScene } from "./semantic-scene-layout";

export const VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION =
  "visual_experience_shared_director_bridge_phase1b5a_v1" as const;

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

/**
 * Shadow adapter used during runtime convergence. It samples the same canonical
 * Director/UMP/scene-state stack as the Asset Scene Builder without replacing
 * Visual Experience rendering or camera behaviour yet. That keeps the old player
 * visually stable while making divergence inspectable before the final cutover.
 */
export function buildVisualExperienceSharedDirectorSnapshot(
  scene: PreparedSemanticScene,
  progress: number,
) {
  const directorPlan = scene.director_plan;
  if (!directorPlan?.moments.length) {
    return {
      bridge_version: VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION,
      status: "no_director_plan" as const,
      moment_id: null,
      moment_index: null,
      sampled_actor_count: 0,
      active_process_actor_count: 0,
      samples: [],
    };
  }

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
    position: [...entity.position],
    rotation: [0, 0, 0],
    size: actorSize(entity),
  }));
  const incomingSceneState = directorSceneStateBeforeMoment(
    directorPlan.moments,
    momentIndex,
    actors,
  );
  const samples = actors.map((actor) => {
    const sampled = sampleDirectorActorState(
      moment,
      actor,
      progress,
      actors,
      incomingSceneState,
    );
    return {
      actor_id: actor.id,
      position: sampled.position.toArray() as [number, number, number],
      rotation: [
        sampled.rotation.x,
        sampled.rotation.y,
        sampled.rotation.z,
      ] as [number, number, number],
      process_track_count:
        sampled.process?.active_process_track_ids.length ?? 0,
    };
  });

  return {
    bridge_version: VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION,
    status: "shared_runtime_shadow" as const,
    moment_id: moment.id,
    moment_index: momentIndex,
    sampled_actor_count: samples.length,
    active_process_actor_count: samples.filter(
      (sample) => sample.process_track_count > 0,
    ).length,
    samples,
  };
}
