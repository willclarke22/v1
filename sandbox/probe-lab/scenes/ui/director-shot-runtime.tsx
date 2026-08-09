"use client";

import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type {
  DirectorCameraMovementStep,
  DirectorEvent,
  DirectorMoment,
  DirectorShotDirectionV2,
} from "../../director";

export type DirectorRuntimeVec3 = [number, number, number];

export type DirectorRuntimeActor = {
  id: string;
  position: DirectorRuntimeVec3;
  rotation?: DirectorRuntimeVec3;
  size: DirectorRuntimeVec3;
};

export type DirectorActorSample = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
};

export type DirectorCameraPose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
};

export type DirectorShotValidation = {
  sample_count: number;
  camera_path_clear: boolean;
  minimum_camera_clearance_m: number;
  required_visible_fraction: number;
  approximate_occlusion_ratio: number;
  approximate_actor_collision_ratio: number;
  actor_motion_clear: boolean;
  required_visible_entity_ids: string[];
  warnings: string[];
};

const UP = new THREE.Vector3(0, 1, 0);

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function numberParam(
  value: unknown,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vecParam(
  value: unknown,
  fallback: DirectorRuntimeVec3,
): THREE.Vector3 {
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Vector3(
      numberParam(value[0], fallback[0]),
      numberParam(value[1], fallback[1]),
      numberParam(value[2], fallback[2]),
    );
  }
  return new THREE.Vector3(...fallback);
}

function easeValue(
  value: number,
  easing: DirectorCameraMovementStep["easing"] | DirectorEvent["easing"] = "ease_in_out",
) {
  const t = clamp01(value);
  if (easing === "linear") return t;
  if (easing === "ease_in") return t * t;
  if (easing === "ease_out") return 1 - (1 - t) * (1 - t);
  if (easing === "step") return t >= 1 ? 1 : 0;
  if (easing === "spring") {
    const damped = 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 4.5);
    return THREE.MathUtils.clamp(damped, 0, 1.08);
  }
  return t * t * (3 - 2 * t);
}

function actorById(
  actors: DirectorRuntimeActor[],
  id: string | null | undefined,
) {
  return id ? actors.find((actor) => actor.id === id) ?? null : null;
}

function actorRadius(actor: DirectorRuntimeActor) {
  const [x, y, z] = actor.size.map((value) => Math.max(0.02, Math.abs(value))) as DirectorRuntimeVec3;
  return Math.max(0.12, Math.sqrt(x * x + y * y + z * z) * 0.34);
}


export function applyDirectorBlocking(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  options: { cinematic_only?: boolean } = {},
): DirectorRuntimeActor[] {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const output = actors.map((actor) => ({
    ...actor,
    position: [...actor.position] as DirectorRuntimeVec3,
    rotation: [...(actor.rotation ?? [0, 0, 0])] as DirectorRuntimeVec3,
    size: [...actor.size] as DirectorRuntimeVec3,
  }));
  const byId = new Map(output.map((actor) => [actor.id, actor]));
  const physical = new Set(["on_ground", "on_surface", "inside", "attached_to", "beside"]);

  for (const cue of shot.blocking) {
    if (options.cinematic_only && physical.has(cue.relation)) continue;
    const actor = byId.get(cue.actor_entity_id);
    if (!actor) continue;
    const target = cue.target_entity_id ? byId.get(cue.target_entity_id) ?? null : null;
    const targetPosition = target ? new THREE.Vector3(...target.position) : new THREE.Vector3();
    const targetRadius = target ? actorRadius(target) : 1;
    const actorRadiusValue = actorRadius(actor);
    const gap = Math.max(0.25, targetRadius + actorRadiusValue) * 0.75;
    const position = new THREE.Vector3(...actor.position);

    switch (cue.relation) {
      case "on_ground": position.y = 0; break;
      case "on_surface": if (target) position.set(targetPosition.x, targetPosition.y + Math.max(0.1, target.size[1]), targetPosition.z); break;
      case "inside": if (target) position.copy(targetPosition).add(new THREE.Vector3(0, Math.max(0.1, target.size[1] * 0.25), 0)); break;
      case "attached_to": if (target) position.copy(targetPosition).add(new THREE.Vector3(target.size[0] * 0.55, target.size[1] * 0.45, 0)); break;
      case "beside": if (target) position.copy(targetPosition).add(new THREE.Vector3(gap, 0, 0)); break;
      case "in_front_of": if (target) position.copy(targetPosition).add(new THREE.Vector3(0, 0, gap)); break;
      case "behind": if (target) position.copy(targetPosition).add(new THREE.Vector3(0.35 * gap, 0, -gap)); break;
      case "between": {
        const alternatives = output.filter((candidate) => candidate.id !== actor.id);
        if (alternatives.length >= 2) {
          position.lerpVectors(new THREE.Vector3(...alternatives[0].position), new THREE.Vector3(...alternatives[1].position), 0.5);
        }
        break;
      }
      case "foreground": position.z += Math.max(1.2, actorRadiusValue * 1.6); break;
      case "midground": position.z += 0.1; break;
      case "background": position.z -= Math.max(1.4, actorRadiusValue * 1.8); break;
      case "screen_left": position.x -= Math.max(1.2, actorRadiusValue * 1.5); break;
      case "screen_right": position.x += Math.max(1.2, actorRadiusValue * 1.5); break;
      case "facing":
      case "facing_away":
        if (target) {
          const delta = targetPosition.clone().sub(position);
          actor.rotation = [actor.rotation?.[0] ?? 0, Math.atan2(delta.x, delta.z) + (cue.relation === "facing_away" ? Math.PI : 0), actor.rotation?.[2] ?? 0];
        }
        break;
      case "surround": {
        const index = output.findIndex((candidate) => candidate.id === actor.id);
        const angle = (index / Math.max(1, output.length)) * Math.PI * 2;
        position.set(Math.cos(angle) * 2.2, position.y, Math.sin(angle) * 2.2);
        break;
      }
      case "form_line": {
        const index = output.findIndex((candidate) => candidate.id === actor.id);
        position.x = (index - (output.length - 1) / 2) * 1.7;
        break;
      }
      case "form_circle": {
        const index = output.findIndex((candidate) => candidate.id === actor.id);
        const angle = (index / Math.max(1, output.length)) * Math.PI * 2;
        position.set(Math.cos(angle) * 2.3, position.y, Math.sin(angle) * 2.3);
        break;
      }
      case "cluster": position.multiplyScalar(0.68); break;
      case "symmetrical_pair": position.x = actor.id === shot.camera.focus_entity_ids[0] ? -1.6 : 1.6; break;
      default: break;
    }
    actor.position = [position.x, position.y, position.z];
  }

  return output;
}

function setAxisRotation(
  rotation: THREE.Euler,
  axis: unknown,
  radians: number,
) {
  if (axis === "x") rotation.x += radians;
  else if (axis === "z") rotation.z += radians;
  else rotation.y += radians;
}

function eventLocalProgress(
  moment: DirectorMoment,
  event: DirectorEvent,
  progress: number,
) {
  const timeMs = clamp01(progress) * Math.max(1, moment.duration_ms);
  const duration = Math.max(1, event.duration_ms);
  return easeValue(
    (timeMs - event.start_ms) / duration,
    event.easing,
  );
}

function sampleDirectorActorEventState(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
): DirectorActorSample {
  const position = new THREE.Vector3(...actor.position);
  const rotation = new THREE.Euler(...(actor.rotation ?? [0, 0, 0]), "XYZ");
  const scale = new THREE.Vector3(1, 1, 1);
  const basePosition = position.clone();

  for (const event of moment.events) {
    if (event.actor_entity_id !== actor.id) continue;
    const t = eventLocalProgress(moment, event, progress);
    if (t <= 0 && event.behaviour !== "close") continue;

    const params = event.parameters ?? {};
    const targetActor = actorById(actors, event.target_entity_id);
    const target = targetActor
      ? new THREE.Vector3(...targetActor.position)
      : vecParam(params.target_position, actor.position);
    const distance = numberParam(params.distance_m, Math.max(0.75, actorRadius(actor) * 1.5));
    const amplitude = numberParam(params.amplitude_m, Math.max(0.25, actorRadius(actor) * 0.65));
    const turns = numberParam(params.turns, 1);
    const degrees = numberParam(params.degrees, 90);
    const axis = params.axis;

    switch (event.behaviour) {
      case "move_to": {
        const origin = Array.isArray(params.start_position)
          ? vecParam(params.start_position, actor.position)
          : basePosition;
        position.lerpVectors(origin, target, t);
        break;
      }
      case "move_toward": { const direction = target.clone().sub(basePosition).normalize(); position.copy(basePosition).addScaledVector(direction, distance * t); break; }
      case "move_away": { const direction = basePosition.clone().sub(target).normalize(); position.copy(basePosition).addScaledVector(direction, distance * t); break; }
      case "move_along_path": {
        const points = Array.isArray(params.path_points)
          ? params.path_points
              .map((point) => Array.isArray(point) && point.length >= 3 ? vecParam(point, actor.position) : null)
              .filter((point): point is THREE.Vector3 => Boolean(point))
          : [];
        if (points.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
          position.copy(curve.getPoint(clamp01(t)));
        } else {
          position.x = basePosition.x + distance * (t * 2 - 1);
          position.y = basePosition.y + Math.sin(t * Math.PI) * amplitude;
        }
        break;
      }
      case "follow_target":
      case "attach":
        if (targetActor) {
          const offset = vecParam(params.offset, [0, actorRadius(targetActor) * 0.9, 0]);
          position.lerpVectors(basePosition, target.clone().add(offset), t);
        }
        break;
      case "detach": {
        const away = targetActor
          ? basePosition.clone().sub(target).normalize()
          : new THREE.Vector3(-1, 0.25, 0).normalize();
        position.copy(basePosition).addScaledVector(away, distance * t);
        break;
      }
      case "slide": {
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        break;
      }
      case "lift":
        position.y = basePosition.y + distance * t;
        break;
      case "lower":
        position.y = basePosition.y - distance * t;
        break;
      case "oscillate": {
        const cycles = numberParam(params.cycles, 2);
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, Math.sin(t * Math.PI * 2 * cycles) * amplitude);
        break;
      }
      case "orbit": {
        const center = targetActor ? target : vecParam(params.center, actor.position);
        const radius = numberParam(params.radius_m, Math.max(distance, actorRadius(actor) * 2));
        const angle = THREE.MathUtils.degToRad(numberParam(params.degrees, 180)) * t;
        const start = basePosition.clone().sub(center);
        if (start.lengthSq() < 0.001) start.set(radius, 0, 0);
        start.setLength(radius).applyAxisAngle(UP, angle);
        position.copy(center).add(start);
        break;
      }
      case "rotate":
      case "spin":
        setAxisRotation(rotation, axis ?? "y", Math.PI * 2 * turns * t);
        break;
      case "roll": {
        const direction = vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        const rollingRadius = Math.max(0.05, Math.min(actor.size[0], actor.size[1], actor.size[2]) * 0.5);
        const explicitTurns = Number(params.turns);
        const rollingTurns = Number.isFinite(explicitTurns)
          ? explicitTurns
          : distance / Math.max(0.05, Math.PI * 2 * rollingRadius);
        setAxisRotation(rotation, axis ?? "z", Math.PI * 2 * rollingTurns * t);
        break;
      }
      case "pivot":
      case "hinge":
      case "open":
      case "close": {
        const localPivot = vecParam(
          params.pivot_local,
          [-Math.max(0.05, actor.size[0]) * 0.5, 0, 0],
        );
        const axisName = axis === "x" || axis === "z" ? axis : "y";
        const axisVector = axisName === "x"
          ? new THREE.Vector3(1, 0, 0)
          : axisName === "z"
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(0, 1, 0);
        const angle = THREE.MathUtils.degToRad(degrees) * (event.behaviour === "close" ? 1 - t : t);
        const pivotWorld = basePosition.clone().add(localPivot);
        const arm = basePosition.clone().sub(pivotWorld).applyAxisAngle(axisVector, angle);
        position.copy(pivotWorld).add(arm);
        setAxisRotation(rotation, axisName, angle);
        break;
      }
      case "aim_at":
      case "align":
        if (targetActor) {
          const delta = target.clone().sub(position);
          rotation.y = Math.atan2(delta.x, delta.z);
        }
        break;
      case "insert_into":
      case "merge":
      case "assemble":
      case "connect":
        if (targetActor) position.lerpVectors(basePosition, target, t);
        break;
      case "remove_from":
      case "split":
      case "disassemble":
      case "disconnect": {
        const direction = targetActor
          ? basePosition.clone().sub(target).normalize()
          : vecParam(params.direction, [1, 0, 0]).normalize();
        position.copy(basePosition).addScaledVector(direction, distance * t);
        break;
      }
      case "expand":
        scale.setScalar(1 + numberParam(params.amount, 0.45) * t);
        break;
      case "contract":
        scale.setScalar(Math.max(0.05, 1 - numberParam(params.amount, 0.45) * t));
        break;
      case "flow":
      case "emit":
        position.y += amplitude * t;
        scale.setScalar(1 + 0.18 * t);
        break;
      case "accumulate":
      case "fill":
        scale.setScalar(0.55 + 0.45 * t);
        break;
      case "drain":
        scale.setScalar(Math.max(0.08, 1 - 0.75 * t));
        break;
      case "pour":
        setAxisRotation(rotation, axis ?? "z", THREE.MathUtils.degToRad(numberParam(params.degrees, 70)) * t);
        break;
      case "transform":
        scale.setScalar(1 + numberParam(params.amount, 0.25) * t);
        setAxisRotation(rotation, axis ?? "y", THREE.MathUtils.degToRad(numberParam(params.degrees, 35)) * t);
        break;
      case "pulse": {
        const pulse = 1 + Math.sin(t * Math.PI * 4) * numberParam(params.amount, 0.08);
        scale.multiplyScalar(pulse);
        break;
      }
      default:
        break;
    }
  }

  return { position, rotation, scale };
}

function constraintAxisVector(axis: "x" | "y" | "z" | "auto") {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Applies semantic kinematic invariants after ordinary actor events. This is a
 * deterministic preview/Three.js compiler, not a rigid-body simulation. The
 * constraints keep relationships stable enough for educational mechanisms and
 * translate directly into stronger Blender/rig solvers later.
 */
export function sampleDirectorActorState(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor,
  progress: number,
  actors: DirectorRuntimeActor[],
): DirectorActorSample {
  const sampled = sampleDirectorActorEventState(moment, actor, progress, actors);
  const shot = moment.shot ?? legacyShotForMoment(moment);

  for (const constraint of shot.constraints) {
    if (constraint.actor_entity_id !== actor.id) continue;
    const targetActor = actorById(actors, constraint.target_entity_id);
    const secondActor = actorById(actors, constraint.secondary_target_entity_id);
    const targetSample = targetActor
      ? sampleDirectorActorEventState(moment, targetActor, progress, actors)
      : null;
    const secondSample = secondActor
      ? sampleDirectorActorEventState(moment, secondActor, progress, actors)
      : null;

    if (constraint.kind === "axis_lock") {
      const origin = vecParam(constraint.parameters.origin, actor.position);
      if (constraint.axis === "x") {
        sampled.position.y = origin.y;
        sampled.position.z = origin.z;
      } else if (constraint.axis === "z") {
        sampled.position.x = origin.x;
        sampled.position.y = origin.y;
      } else {
        sampled.position.x = origin.x;
        sampled.position.z = origin.z;
      }
      continue;
    }

    if (constraint.kind === "attach" && targetSample && targetActor) {
      const offset = vecParam(
        constraint.parameters.offset,
        [0, Math.max(0.05, targetActor.size[1] * 0.55), 0],
      );
      sampled.position.copy(targetSample.position).add(offset);
      continue;
    }

    if (constraint.kind === "maintain_distance" && targetSample) {
      const fallbackDistance = Math.max(
        0.05,
        new THREE.Vector3(...actor.position).distanceTo(targetSample.position),
      );
      const desired = Math.max(
        0.01,
        constraint.distance_m ?? numberParam(constraint.parameters.distance_m, fallbackDistance),
      );
      const direction = sampled.position.clone().sub(targetSample.position);
      if (direction.lengthSq() < 0.0001) direction.set(1, 0, 0);
      sampled.position.copy(targetSample.position).add(direction.normalize().multiplyScalar(desired));
      continue;
    }

    if (constraint.kind === "look_at" && targetSample) {
      const delta = targetSample.position.clone().sub(sampled.position);
      if (delta.lengthSq() > 0.0001) sampled.rotation.y = Math.atan2(delta.x, delta.z);
      continue;
    }

    if (constraint.kind === "rigid_link" && targetSample && secondSample) {
      const start = targetSample.position;
      const end = secondSample.position;
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length > 0.0001) {
        sampled.position.lerpVectors(start, end, 0.5);
        const localAxis = constraintAxisVector(constraint.axis === "auto" ? "z" : constraint.axis);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          localAxis.clone().normalize(),
          direction.clone().normalize(),
        );
        sampled.rotation.setFromQuaternion(quaternion, "XYZ");
        const axis = constraint.axis === "x" ? 0 : constraint.axis === "y" ? 1 : 2;
        const sourceLength = Math.max(0.05, actor.size[axis]);
        if (axis === 0) sampled.scale.x = length / sourceLength;
        else if (axis === 1) sampled.scale.y = length / sourceLength;
        else sampled.scale.z = length / sourceLength;
      }
    }
  }

  return sampled;
}

function framingFactor(framing: DirectorShotDirectionV2["composition"]["framing"]) {
  switch (framing) {
    case "extreme_wide": return 7.5;
    case "wide": return 5.8;
    case "group_shot": return 5.2;
    case "full": return 4.5;
    case "medium_wide": return 4.0;
    case "two_shot": return 3.9;
    case "medium": return 3.45;
    case "over_shoulder": return 3.1;
    case "medium_close": return 2.75;
    case "close": return 2.2;
    case "extreme_close": return 1.65;
    case "macro": return 1.25;
    case "insert": return 1.45;
    case "point_of_view": return 2.8;
    case "cutaway": return 3.6;
    default: return 3.4;
  }
}

function angleDirection(angle: DirectorShotDirectionV2["composition"]["angle"]) {
  switch (angle) {
    case "low_angle": return new THREE.Vector3(0.8, -0.28, 1);
    case "high_angle": return new THREE.Vector3(0.75, 0.9, 1);
    case "top_down": return new THREE.Vector3(0.01, 1, 0.01);
    case "ground_level": return new THREE.Vector3(0.8, -0.42, 1);
    case "side_profile": return new THREE.Vector3(1, 0.22, 0);
    case "front_profile": return new THREE.Vector3(0, 0.18, 1);
    case "rear_profile": return new THREE.Vector3(0, 0.18, -1);
    case "three_quarter_rear": return new THREE.Vector3(0.9, 0.35, -0.9);
    case "isometric": return new THREE.Vector3(1, 1, 1);
    case "object_attached": return new THREE.Vector3(0.3, 0.2, 0.9);
    case "inside_object": return new THREE.Vector3(0.05, 0.05, 0.3);
    case "three_quarter_front": return new THREE.Vector3(0.9, 0.35, 0.9);
    case "dutch_angle":
    case "eye_level":
    default: return new THREE.Vector3(0.65, 0.05, 1);
  }
}

function targetActors(
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  progress: number,
  actors: DirectorRuntimeActor[],
) {
  const ids = shot.camera.focus_entity_ids.length
    ? shot.camera.focus_entity_ids
    : moment.active_entity_ids;
  return ids
    .map((id) => actorById(actors, id))
    .filter((actor): actor is DirectorRuntimeActor => Boolean(actor))
    .map((actor) => ({ actor, sample: sampleDirectorActorState(moment, actor, progress, actors) }));
}

function averageTarget(
  samples: ReturnType<typeof targetActors>,
) {
  if (!samples.length) return new THREE.Vector3(0, 0.8, 0);
  const target = new THREE.Vector3();
  for (const entry of samples) target.add(entry.sample.position);
  target.multiplyScalar(1 / samples.length);
  const averageHeight = samples.reduce((sum, entry) => sum + Math.max(0.1, entry.actor.size[1]), 0) / samples.length;
  target.y += averageHeight * 0.45;
  return target;
}

function focusRadius(samples: ReturnType<typeof targetActors>) {
  if (!samples.length) return 1.2;
  let radius = 0.8;
  for (const entry of samples) radius = Math.max(radius, actorRadius(entry.actor));
  if (samples.length > 1) {
    const points = samples.map((entry) => entry.sample.position);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) radius = Math.max(radius, points[i].distanceTo(points[j]) * 0.65);
    }
  }
  return radius;
}

function stepProgress(step: DirectorCameraMovementStep, progress: number) {
  const span = Math.max(0.001, step.end_progress - step.start_progress);
  return easeValue((progress - step.start_progress) / span, step.easing);
}

function movementDistance(
  step: DirectorCameraMovementStep,
  radius: number,
  fallbackFactor: number,
) {
  return numberParam(step.parameters.distance_m, Math.max(0.35, radius * fallbackFactor)) * step.strength;
}

function actorTravelDelta(
  moment: DirectorMoment,
  actor: DirectorRuntimeActor | null,
  progress: number,
  actors: DirectorRuntimeActor[],
) {
  if (!actor) return new THREE.Vector3();
  const current = sampleDirectorActorState(moment, actor, progress, actors).position;
  return current.sub(new THREE.Vector3(...actor.position));
}

function applyMovementStep(
  pose: DirectorCameraPose,
  step: DirectorCameraMovementStep,
  t: number,
  moment: DirectorMoment,
  shot: DirectorShotDirectionV2,
  actors: DirectorRuntimeActor[],
  radius: number,
  progress: number,
) {
  if (t <= 0 || step.movement === "static") return;

  const targetActor = actorById(actors, step.target_entity_id ?? shot.camera.focus_entity_ids[0]);
  const offset = pose.position.clone().sub(pose.target);
  const distance = Math.max(0.1, offset.length());
  const forward = pose.target.clone().sub(pose.position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();

  switch (step.movement) {
    case "cut": {
      // `step` easing keeps t at zero until the cut boundary, then jumps to 1.
      if (t < 1) break;
      const degrees = numberParam(step.parameters.degrees, 62) * step.strength;
      const rotated = pose.position.clone().sub(pose.target).applyAxisAngle(UP, THREE.MathUtils.degToRad(degrees));
      pose.position.copy(pose.target).add(rotated);
      if (targetActor) {
        const targetSample = sampleDirectorActorState(moment, targetActor, progress, actors);
        pose.target.copy(targetSample.position).add(
          new THREE.Vector3(0, Math.max(0.1, targetActor.size[1]) * 0.45, 0),
        );
      }
      break;
    }
    case "push_in": {
      const amount = Math.min(distance * 0.72, movementDistance(step, radius, 1.8));
      pose.position.addScaledVector(forward, amount * t);
      break;
    }
    case "pull_back": {
      const amount = movementDistance(step, radius, 2.4);
      pose.position.addScaledVector(forward, -amount * t);
      break;
    }
    case "dolly": {
      const amount = movementDistance(step, radius, 2.0);
      const direction = vecParam(step.parameters.direction, [0, 0, 1]);
      if (step.coordinate_space === "camera_relative") {
        pose.position.addScaledVector(right, direction.x * amount * t);
        pose.position.y += direction.y * amount * t;
        pose.position.addScaledVector(forward, direction.z * amount * t);
        pose.target.addScaledVector(right, direction.x * amount * t);
        pose.target.y += direction.y * amount * t;
        pose.target.addScaledVector(forward, direction.z * amount * t);
      } else {
        pose.position.addScaledVector(direction.normalize(), amount * t);
        pose.target.addScaledVector(direction.normalize(), amount * t);
      }
      break;
    }
    case "truck":
    case "track_parallel": {
      const amount = movementDistance(step, radius, 2.2);
      const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
      pose.position.addScaledVector(right, amount * t * sign);
      pose.target.addScaledVector(right, amount * t * sign);
      break;
    }
    case "pedestal": {
      const amount = movementDistance(step, radius, 1.5);
      pose.position.y += amount * t;
      pose.target.y += amount * t * 0.4;
      break;
    }
    case "pan": {
      if (targetActor && shot.camera.focus_entity_ids.length > 1) {
        const targetSample = sampleDirectorActorState(moment, targetActor, progress, actors);
        const targetPoint = targetSample.position.clone().add(
          new THREE.Vector3(0, Math.max(0.1, targetActor.size[1]) * 0.45, 0),
        );
        pose.target.lerp(targetPoint, t);
      } else {
        const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
        pose.target.addScaledVector(right, movementDistance(step, radius, 1.8) * t * sign);
      }
      break;
    }
    case "tilt": {
      const sign = numberParam(step.parameters.direction_sign, 1) >= 0 ? 1 : -1;
      pose.target.y += movementDistance(step, radius, 1.4) * t * sign;
      break;
    }
    case "orbit":
    case "arc_left":
    case "arc_right":
    case "reverse_reveal": {
      const defaultDegrees = step.movement === "orbit" ? 110 : step.movement === "reverse_reveal" ? 52 : 38;
      const sign = step.movement === "arc_left" ? -1 : 1;
      const degrees = numberParam(step.parameters.degrees, defaultDegrees) * sign * step.strength;
      const rotated = pose.position.clone().sub(pose.target).applyAxisAngle(UP, THREE.MathUtils.degToRad(degrees) * t);
      pose.position.copy(pose.target).add(rotated);
      if (step.movement === "reverse_reveal" && shot.camera.focus_entity_ids.length > 1) {
        const first = actorById(actors, shot.camera.focus_entity_ids[0]);
        const second = actorById(actors, shot.camera.focus_entity_ids[1]);
        if (first && second) {
          const firstPos = sampleDirectorActorState(moment, first, progress, actors).position;
          const secondPos = sampleDirectorActorState(moment, second, progress, actors).position;
          pose.target.lerpVectors(firstPos, firstPos.clone().lerp(secondPos, 0.5), t);
        }
      }
      break;
    }
    case "follow":
    case "lead_subject":
    case "lag_follow": {
      // The base composition is already solved from the actor's sampled current
      // position, so ordinary follow needs no second copy of the actor travel.
      // Lead/lag only bias the composed camera relative to travel direction.
      const travel = actorTravelDelta(moment, targetActor, progress, actors);
      if (step.movement !== "follow" && travel.lengthSq() > 0.0001) {
        const direction = travel.clone().normalize();
        const sign = step.movement === "lag_follow" ? -1 : 1;
        const bias = direction.multiplyScalar(radius * step.strength * 0.7 * sign * t);
        pose.position.add(bias);
        pose.target.add(bias);
      }
      break;
    }
    case "crane": {
      const amount = movementDistance(step, radius, 2.2);
      pose.position.y += amount * t;
      pose.position.addScaledVector(forward, -amount * 0.65 * t);
      break;
    }
    case "reframe": {
      if (shot.camera.focus_entity_ids.length > 1) {
        const first = actorById(actors, shot.camera.focus_entity_ids[0]);
        const second = actorById(actors, shot.camera.focus_entity_ids[1]);
        if (first && second) {
          const a = sampleDirectorActorState(moment, first, progress, actors).position;
          const b = sampleDirectorActorState(moment, second, progress, actors).position;
          pose.target.lerpVectors(a, b, t);
        }
      }
      break;
    }
    case "rise_reveal": {
      const amount = movementDistance(step, radius, 2.0);
      pose.position.y += amount * t;
      pose.position.addScaledVector(forward, -amount * 0.35 * t);
      break;
    }
    case "spline": {
      const points = Array.isArray(step.parameters.points)
        ? step.parameters.points
            .map((point) => Array.isArray(point) && point.length >= 3 ? vecParam(point, [0, 0, 0]) : null)
            .filter((point): point is THREE.Vector3 => Boolean(point))
        : [];
      if (points.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
        pose.position.copy(curve.getPoint(clamp01(t)));
      } else {
        pose.position.addScaledVector(right, Math.sin(t * Math.PI) * radius * step.strength);
        pose.position.y += Math.sin(t * Math.PI) * radius * 0.35 * step.strength;
      }
      break;
    }
    case "object_attached": {
      if (targetActor) {
        const sample = sampleDirectorActorState(moment, targetActor, progress, actors);
        const localOffset = vecParam(step.parameters.offset, [0, targetActor.size[1] * 0.55, targetActor.size[2] * 0.9 + radius]);
        pose.position.copy(sample.position).add(localOffset);
        pose.target.copy(sample.position).add(new THREE.Vector3(0, targetActor.size[1] * 0.4, 0));
      }
      break;
    }
    case "pass_through": {
      const amount = Math.min(distance * 1.45, movementDistance(step, radius, 4.5));
      pose.position.addScaledVector(forward, amount * t);
      break;
    }
    case "settle": {
      const micro = (1 - t) * Math.sin(t * Math.PI * 2) * radius * 0.035 * step.strength;
      pose.position.addScaledVector(right, micro);
      break;
    }
    case "semantic":
    default:
      break;
  }
}

function screenAnchorOffset(
  shot: DirectorShotDirectionV2,
  position: THREE.Vector3,
  target: THREE.Vector3,
  radius: number,
) {
  const forward = target.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const offset = new THREE.Vector3();
  const horizontal = radius * 0.48;
  const vertical = radius * 0.34;
  switch (shot.composition.screen_anchor) {
    case "left_third": offset.addScaledVector(right, horizontal); break;
    case "right_third": offset.addScaledVector(right, -horizontal); break;
    case "center_left": offset.addScaledVector(right, horizontal * 0.6); break;
    case "center_right": offset.addScaledVector(right, -horizontal * 0.6); break;
    case "upper_third": offset.y -= vertical; break;
    case "lower_third": offset.y += vertical; break;
    default: break;
  }
  if (shot.composition.negative_space_side === "left") offset.addScaledVector(right, -horizontal * 0.45);
  if (shot.composition.negative_space_side === "right") offset.addScaledVector(right, horizontal * 0.45);
  return offset;
}

export function sampleDirectorCameraPose(
  moment: DirectorMoment,
  progress: number,
  actors: DirectorRuntimeActor[],
): DirectorCameraPose {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const p = clamp01(progress);
  const actorRelativeCamera =
    shot.composition.angle === "object_attached" ||
    shot.camera.movement_steps.some((step) =>
      ["follow", "lead_subject", "lag_follow", "track_parallel", "object_attached"].includes(step.movement),
    );
  // Camera composition is world-fixed unless the Director explicitly selects an
  // actor-relative tracking move. This keeps `static` truly static and prevents
  // ordinary dollies/orbits from silently inheriting follow behavior.
  const compositionProgress = actorRelativeCamera ? p : 0;
  const samples = targetActors(moment, shot, compositionProgress, actors);
  const target = averageTarget(samples);
  const startsOnFirstFocus = shot.camera.movement_steps.some((step) =>
    step.movement === "reframe" ||
    step.movement === "reverse_reveal" ||
    step.movement === "pan"
  );
  if (startsOnFirstFocus && shot.camera.focus_entity_ids.length > 1) {
    const first = actorById(actors, shot.camera.focus_entity_ids[0]);
    if (first) {
      const firstSample = sampleDirectorActorState(moment, first, compositionProgress, actors);
      target.copy(firstSample.position).add(new THREE.Vector3(0, first.size[1] * 0.45, 0));
    }
  }
  const radius = focusRadius(samples);
  const fov = THREE.MathUtils.clamp(shot.lens.field_of_view_degrees || 44, 10, 100);
  const framing = framingFactor(shot.composition.framing);
  const perspectiveCompensation = 44 / fov;
  const distance = Math.max(1.2, radius * framing * perspectiveCompensation);
  const direction = angleDirection(shot.composition.angle).normalize();
  const position = target.clone().add(direction.multiplyScalar(distance));
  if (shot.composition.angle === "ground_level") {
    position.y = Math.max(0.12, Math.min(position.y, 0.2));
  } else if (shot.composition.angle === "low_angle") {
    position.y = Math.max(0.18, Math.min(position.y, target.y * 0.55));
  }

  const resolvedFov = shot.composition.angle === "isometric"
    ? Math.min(fov, 30)
    : fov;
  const pose: DirectorCameraPose = {
    position,
    target: target.clone(),
    fov: resolvedFov,
    roll: shot.composition.angle === "dutch_angle" ? THREE.MathUtils.degToRad(12) : 0,
  };

  pose.target.add(screenAnchorOffset(shot, pose.position, pose.target, radius));

  for (const step of shot.camera.movement_steps) {
    applyMovementStep(pose, step, stepProgress(step, p), moment, shot, actors, radius, p);
  }

  return pose;
}

export function legacyShotForMoment(moment: DirectorMoment): DirectorShotDirectionV2 {
  const legacyShot = moment.camera.shot_type;
  const framing = legacyShot === "wide"
    ? "wide"
    : legacyShot === "close_up"
      ? "close"
      : legacyShot === "macro"
        ? "macro"
        : "medium";
  const angle = legacyShot === "top_down"
    ? "top_down"
    : legacyShot === "isometric"
      ? "isometric"
      : legacyShot === "side_profile"
        ? "side_profile"
        : "three_quarter_front";
  return {
    narrative_job: "orient",
    visual_claim: moment.director_intent,
    composition: {
      framing,
      angle,
      screen_anchor: "center",
      keep_visible_entity_ids: moment.camera.keep_visible_entity_ids,
      foreground_entity_ids: [],
      background_entity_ids: [],
      preserve_relationship_entity_ids: [],
      preserve_relative_scale: false,
      caption_safe_region: "auto",
      negative_space_side: "none",
    },
    lens: {
      preset: framing === "wide" ? "wide" : framing === "macro" ? "macro" : "normal",
      focal_length_mm: framing === "wide" ? 28 : framing === "macro" ? 100 : 50,
      field_of_view_degrees: framing === "wide" ? 58 : framing === "macro" ? 28 : 44,
      depth_of_field: "deep",
      aperture_f: 5.6,
      focus_entity_id: moment.camera.focus_entity_ids[0] ?? null,
    },
    camera: {
      focus_entity_ids: moment.camera.focus_entity_ids,
      movement_steps: [{
        movement: moment.camera.movement,
        start_progress: 0,
        end_progress: 1,
        strength: moment.camera.movement === "static" ? 0 : 0.55,
        easing: "ease_in_out",
        coordinate_space: "target_relative",
        target_entity_id: moment.camera.focus_entity_ids[0] ?? null,
        parameters: {},
      }],
      start_intent: moment.camera.framing_intent,
      end_intent: moment.camera.framing_intent,
      movement_reason: moment.camera.framing_intent,
    },
    blocking: [],
    constraints: [],
    lighting: {
      intents: ["neutral_studio"],
      motivated_source_entity_id: null,
      emphasized_entity_ids: moment.active_entity_ids,
      preserve_shadow_entity_ids: [],
    },
    continuity: {
      rules: ["keep_visible", "avoid_occlusion"],
      maximum_occlusion_ratio: 0.2,
      maintain_axis_entity_ids: [],
    },
    reveal_at: null,
    hold_after_ms: 600,
    success_observation: moment.success_observation ?? null,
  };
}

function buildPerspectiveCamera(pose: DirectorCameraPose) {
  const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.05, 200);
  camera.position.copy(pose.position);
  camera.up.copy(UP);
  camera.lookAt(pose.target);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function isCenterOccluded(
  cameraPosition: THREE.Vector3,
  targetActor: DirectorRuntimeActor,
  targetPosition: THREE.Vector3,
  actors: DirectorRuntimeActor[],
  moment: DirectorMoment,
  progress: number,
) {
  const direction = targetPosition.clone().sub(cameraPosition);
  const targetDistance = direction.length();
  if (targetDistance < 0.01) return false;
  const ray = new THREE.Ray(cameraPosition.clone(), direction.normalize());
  for (const actor of actors) {
    if (actor.id === targetActor.id) continue;
    const sampled = sampleDirectorActorState(moment, actor, progress, actors);
    const sphere = new THREE.Sphere(
      sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0)),
      actorRadius(actor) * 0.72,
    );
    const hit = ray.intersectSphere(sphere, new THREE.Vector3());
    if (hit && hit.distanceTo(cameraPosition) < targetDistance - actorRadius(targetActor) * 0.35) return true;
  }
  return false;
}

function allowedMotionContact(
  moment: DirectorMoment,
  leftId: string,
  rightId: string,
) {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const pairMatches = (a: string | null | undefined, b: string | null | undefined) =>
    (a === leftId && b === rightId) || (a === rightId && b === leftId);
  if (shot.blocking.some((cue) =>
    ["on_surface", "inside", "attached_to"].includes(cue.relation) &&
    pairMatches(cue.actor_entity_id, cue.target_entity_id)
  )) return true;
  return shot.constraints.some((cue) =>
    (cue.kind === "attach" && pairMatches(cue.actor_entity_id, cue.target_entity_id)) ||
    (cue.kind === "rigid_link" && (
      pairMatches(cue.actor_entity_id, cue.target_entity_id) ||
      pairMatches(cue.actor_entity_id, cue.secondary_target_entity_id)
    ))
  );
}

export function validateDirectorShot(
  moment: DirectorMoment,
  actors: DirectorRuntimeActor[],
  sampleCount = 13,
): DirectorShotValidation {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const required = Array.from(new Set([
    ...shot.composition.keep_visible_entity_ids,
    ...moment.keeps_visible_entity_ids,
    ...shot.camera.focus_entity_ids,
  ])).filter((id) => actors.some((actor) => actor.id === id));

  let visibleChecks = 0;
  let visibleHits = 0;
  let occlusionChecks = 0;
  let occlusionHits = 0;
  let actorCollisionChecks = 0;
  let actorCollisionHits = 0;
  let minimumClearance = Number.POSITIVE_INFINITY;
  let pathClear = true;

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const pose = sampleDirectorCameraPose(moment, progress, actors);
    const camera = buildPerspectiveCamera(pose);

    for (const actor of actors) {
      const sampled = sampleDirectorActorState(moment, actor, progress, actors);
      const center = sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0));
      const clearance = pose.position.distanceTo(center) - actorRadius(actor);
      if (!shot.camera.focus_entity_ids.includes(actor.id)) {
        minimumClearance = Math.min(minimumClearance, clearance);
        if (clearance < Math.max(0.08, actorRadius(actor) * 0.12)) pathClear = false;
      }
    }

    for (let leftIndex = 0; leftIndex < actors.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < actors.length; rightIndex += 1) {
        const left = actors[leftIndex]!;
        const rightActor = actors[rightIndex]!;
        if (allowedMotionContact(moment, left.id, rightActor.id)) continue;
        const leftSample = sampleDirectorActorState(moment, left, progress, actors);
        const rightSample = sampleDirectorActorState(moment, rightActor, progress, actors);
        const threshold = (actorRadius(left) + actorRadius(rightActor)) * 0.58;
        actorCollisionChecks += 1;
        if (leftSample.position.distanceTo(rightSample.position) < threshold) actorCollisionHits += 1;
      }
    }

    for (const id of required) {
      const actor = actorById(actors, id);
      if (!actor) continue;
      const sampled = sampleDirectorActorState(moment, actor, progress, actors);
      const center = sampled.position.clone().add(new THREE.Vector3(0, actor.size[1] * 0.45, 0));
      const ndc = center.clone().project(camera);
      visibleChecks += 1;
      if (ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 0.96 && Math.abs(ndc.y) <= 0.92) visibleHits += 1;
      occlusionChecks += 1;
      if (isCenterOccluded(pose.position, actor, center, actors, moment, progress)) occlusionHits += 1;
    }
  }

  const visibleFraction = visibleChecks ? visibleHits / visibleChecks : 1;
  const occlusionRatio = occlusionChecks ? occlusionHits / occlusionChecks : 0;
  const actorCollisionRatio = actorCollisionChecks ? actorCollisionHits / actorCollisionChecks : 0;
  const allowedOcclusion = shot.continuity.maximum_occlusion_ratio;
  const warnings: string[] = [];
  if (!pathClear) warnings.push("The sampled camera path enters another actor's clearance volume.");
  if (visibleFraction < 0.88) warnings.push("A required teaching actor leaves the safe frame during part of the shot.");
  if (occlusionRatio > allowedOcclusion) warnings.push(`Approximate occlusion ${Math.round(occlusionRatio * 100)}% exceeds the declared ${Math.round(allowedOcclusion * 100)}% limit.`);
  if (actorCollisionRatio > 0.04) warnings.push(`Sampled actor motion overlaps in ${Math.round(actorCollisionRatio * 100)}% of non-contact pair checks; review motion constraints or spacing.`);

  return {
    sample_count: sampleCount,
    camera_path_clear: pathClear,
    minimum_camera_clearance_m: Number.isFinite(minimumClearance) ? Number(minimumClearance.toFixed(3)) : 999,
    required_visible_fraction: Number(visibleFraction.toFixed(3)),
    approximate_occlusion_ratio: Number(occlusionRatio.toFixed(3)),
    approximate_actor_collision_ratio: Number(actorCollisionRatio.toFixed(3)),
    actor_motion_clear: actorCollisionRatio <= 0.04,
    required_visible_entity_ids: required,
    warnings,
  };
}


function runtimeProgressFor(
  clockElapsedSeconds: number,
  moment: DirectorMoment,
  progress: number | undefined,
  autoLoop: boolean,
) {
  if (typeof progress === "number") return clamp01(progress);
  if (!autoLoop) return 0;
  const duration = Math.max(1000, moment.duration_ms);
  return ((clockElapsedSeconds * 1000) % duration) / duration;
}

function DirectorMotivatedLight({
  moment,
  actors,
  progress,
  autoLoop,
  mode,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  autoLoop: boolean;
  mode: "motivated" | "track" | "reveal" | "emissive";
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  const shot = moment.shot ?? legacyShotForMoment(moment);

  useFrame(({ clock }) => {
    const light = lightRef.current;
    if (!light) return;
    const p = runtimeProgressFor(clock.elapsedTime, moment, progress, autoLoop);
    const sourceId = mode === "motivated"
      ? shot.lighting.motivated_source_entity_id
      : shot.lighting.emphasized_entity_ids[0] ?? shot.camera.focus_entity_ids[0];
    const actor = actorById(actors, sourceId);
    const sample = actor
      ? sampleDirectorActorState(moment, actor, p, actors)
      : null;
    const base = sample?.position ?? averageTarget(targetActors(moment, shot, p, actors));
    light.position.copy(base).add(new THREE.Vector3(0, actor ? actor.size[1] * 0.65 : 1.6, 0.5));
    const revealStart = shot.reveal_at ?? 0.48;
    const revealAmount = mode === "reveal"
      ? easeValue((p - revealStart) / Math.max(0.08, 1 - revealStart), "ease_out")
      : 1;
    const intensity = mode === "track"
      ? 4.4
      : mode === "emissive"
        ? 3.2
        : mode === "motivated"
          ? 3.6
          : 4.8 * revealAmount;
    light.intensity = intensity;
  });

  return (
    <pointLight
      ref={lightRef}
      castShadow={mode !== "emissive"}
      intensity={mode === "reveal" ? 0 : 3.4}
      color={mode === "track" ? "#f8fafc" : mode === "emissive" ? "#67e8f9" : "#fb923c"}
      distance={mode === "track" ? 8 : 10}
      decay={2}
    />
  );
}

/**
 * Semantic light rig shared by the isolated Capability Library and the
 * Asset Scene Builder. It intentionally stays renderer-neutral in contract:
 * Blender may compile the same intents into a much richer production rig.
 */
export function DirectorShotLightingRig({
  moment,
  actors,
  progress,
  autoLoop = false,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  autoLoop?: boolean;
}) {
  const shot = moment.shot ?? legacyShotForMoment(moment);
  const intents = new Set(shot.lighting.intents);
  const lowKey = intents.has("low_key") || intents.has("dim_environment");
  const highKey = intents.has("high_key");
  const backlit = intents.has("backlit") || intents.has("preserve_shadow") || intents.has("shadow_projection");
  const rim = intents.has("rim_lit");
  const spotlight = intents.has("spotlight_subject");
  const warmCool = intents.has("warm_cool_contrast");
  const exposureShift = intents.has("exposure_shift");

  return (
    <>
      <ambientLight intensity={lowKey ? 0.1 : highKey ? 0.95 : 0.42} />
      <hemisphereLight
        args={[highKey ? "#ffffff" : "#dbeafe", "#0f172a", highKey ? 1.35 : lowKey ? 0.35 : 0.68]}
        position={[0, 6, 0]}
      />
      <directionalLight
        castShadow
        position={backlit ? [-4, 6, -6] : [5, 7, 5]}
        intensity={exposureShift ? 1.3 : lowKey ? 0.9 : highKey ? 2.7 : 1.9}
        color={warmCool ? "#f59e0b" : backlit ? "#fef3c7" : "#ffffff"}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight
        position={rim ? [-4, 4, -4] : [-4, 2, 2]}
        intensity={rim ? 3.1 : lowKey ? 0.28 : 0.72}
        color={warmCool ? "#38bdf8" : rim ? "#7dd3fc" : "#93c5fd"}
      />
      {spotlight ? (
        <spotLight
          castShadow
          position={[0, 7.5, 3.4]}
          angle={0.38}
          penumbra={0.62}
          intensity={6.2}
          color="#f8fafc"
        />
      ) : null}
      {intents.has("motivated_source") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} mode="motivated" />
      ) : null}
      {intents.has("track_spotlight") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} mode="track" />
      ) : null}
      {intents.has("light_reveal") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} mode="reveal" />
      ) : null}
      {intents.has("emissive_subject") || intents.has("volumetric_beam") ? (
        <DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} mode="emissive" />
      ) : null}
    </>
  );
}

export function DirectorShotCameraController({
  moment,
  actors,
  progress,
  isPlaying = true,
  autoLoop = false,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  progress?: number;
  isPlaying?: boolean;
  autoLoop?: boolean;
}) {
  const { camera } = useThree();
  const lastPausedProgress = useRef<number | null>(null);
  const lastRuntimeProgress = useRef<number | null>(null);
  const lastMomentId = useRef<string | null>(null);
  const smoothedTarget = useRef(new THREE.Vector3());
  const targetReady = useRef(false);

  useFrame(({ clock }, delta) => {
    const runtimeProgress = typeof progress === "number"
      ? clamp01(progress)
      : autoLoop
        ? ((clock.elapsedTime * 1000) % Math.max(1000, moment.duration_ms)) / Math.max(1000, moment.duration_ms)
        : 0;
    if (!isPlaying && lastPausedProgress.current === runtimeProgress) return;

    const pose = sampleDirectorCameraPose(moment, runtimeProgress, actors);
    const rewound = lastRuntimeProgress.current !== null && runtimeProgress + 0.02 < lastRuntimeProgress.current;
    const changedMoment = lastMomentId.current !== moment.id;
    const snap = !isPlaying && !autoLoop || rewound || changedMoment || !targetReady.current;
    const positionAlpha = 1 - Math.exp(-9.5 * Math.min(0.05, Math.max(0, delta)));
    const targetAlpha = 1 - Math.exp(-12 * Math.min(0.05, Math.max(0, delta)));

    if (snap) {
      camera.position.copy(pose.position);
      smoothedTarget.current.copy(pose.target);
      targetReady.current = true;
    } else {
      camera.position.lerp(pose.position, positionAlpha);
      smoothedTarget.current.lerp(pose.target, targetAlpha);
    }

    camera.up.copy(UP);
    camera.lookAt(smoothedTarget.current);
    if (pose.roll) camera.rotateZ(pose.roll);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = snap
        ? pose.fov
        : THREE.MathUtils.lerp(camera.fov, pose.fov, targetAlpha);
      camera.updateProjectionMatrix();
    }

    lastPausedProgress.current = isPlaying || autoLoop ? null : runtimeProgress;
    lastRuntimeProgress.current = runtimeProgress;
    lastMomentId.current = moment.id;
  });

  return null;
}

export function DirectorShotPathGuide({
  moment,
  actors,
  color = "#38bdf8",
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  color?: string;
}) {
  const points = useMemo(
    () => Array.from({ length: 48 }, (_, index) => sampleDirectorCameraPose(moment, index / 47, actors).position),
    [actors, moment],
  );
  return (
    <group>
      <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.72} />
      <mesh position={points[0]}><sphereGeometry args={[0.08, 14, 14]} /><meshBasicMaterial color="#22c55e" /></mesh>
      <mesh position={points[points.length - 1]}><sphereGeometry args={[0.08, 14, 14]} /><meshBasicMaterial color="#f97316" /></mesh>
    </group>
  );
}
