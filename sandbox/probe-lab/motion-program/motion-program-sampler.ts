import {
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  type MotionProgramInitialState,
  type MotionProgramSample,
  type MotionProgramSampleContext,
  type MotionProgramTrack,
  type MotionProgramVec3,
  type MyWayMotionProgramV1,
} from "./motion-program-contract";
import {
  resolveMotionVectorSpace,
  rotateMotionVectorAroundAxis,
} from "./motion-program-coordinate-space";
import {
  clampMotionProgress,
  sampleMotionEasing,
} from "./motion-program-easing";

function add(
  left: MotionProgramVec3,
  right: MotionProgramVec3,
): MotionProgramVec3 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
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

function multiply(
  value: MotionProgramVec3,
  scalar: number,
): MotionProgramVec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function lerp(
  from: MotionProgramVec3,
  to: MotionProgramVec3,
  t: number,
): MotionProgramVec3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function lerpScalar(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function samplePolyline(
  points: readonly MotionProgramVec3[],
  progress: number,
): MotionProgramVec3 {
  if (!points.length) return [0, 0, 0];
  if (points.length === 1) return [...points[0]!] as MotionProgramVec3;

  const segmentProgress = clampMotionProgress(progress) * (points.length - 1);
  const segmentIndex = Math.min(
    points.length - 2,
    Math.floor(segmentProgress),
  );
  const local = segmentProgress - segmentIndex;
  return lerp(points[segmentIndex]!, points[segmentIndex + 1]!, local);
}

function carrierProgress(
  processProgress: number,
  carrierIndex: number,
  carrierCount: number,
) {
  const count = Math.max(1, carrierCount);
  const offset = (carrierIndex / count) * 0.62;
  if (processProgress <= offset) return 0;
  return clampMotionProgress(
    (processProgress - offset) / Math.max(1e-9, 1 - offset),
  );
}

function length(value: MotionProgramVec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(
  value: MotionProgramVec3,
): MotionProgramVec3 {
  const magnitude = length(value);
  if (magnitude <= 1e-9) return [0, 0, 0];
  return multiply(value, 1 / magnitude);
}

function setAxis(
  value: MotionProgramVec3,
  axis: "x" | "y" | "z",
  next: number,
): MotionProgramVec3 {
  const output: MotionProgramVec3 = [...value];
  output[axis === "x" ? 0 : axis === "y" ? 1 : 2] = next;
  return output;
}

function addAxis(
  value: MotionProgramVec3,
  axis: "x" | "y" | "z",
  delta: number,
): MotionProgramVec3 {
  const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const output: MotionProgramVec3 = [...value];
  output[index] += delta;
  return output;
}

function trackLocalProgress(track: MotionProgramTrack, progress: number) {
  if (progress <= track.start_progress) {
    if (!track.apply_before_start) return null;
    const directed = track.reverse_progress ? 1 : 0;
    return sampleMotionEasing(directed, track.easing);
  }
  const span = Math.max(1e-9, track.end_progress - track.start_progress);
  const raw = clampMotionProgress((progress - track.start_progress) / span);
  const directed = track.reverse_progress ? 1 - raw : raw;
  return sampleMotionEasing(directed, track.easing);
}

function finiteVec(value: MotionProgramVec3) {
  return value.every(Number.isFinite);
}

function targetState(
  context: MotionProgramSampleContext | undefined,
  entityId: string,
  progress: number,
) {
  return context?.sample_entity_state?.(entityId, progress) ?? null;
}

function shortestAngleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function desiredYawForHorizontalAxis(
  axis: "x" | "z",
  fromPosition: MotionProgramVec3,
  targetPosition: MotionProgramVec3,
) {
  const delta = subtract(targetPosition, fromPosition);
  if (Math.hypot(delta[0], delta[2]) <= 1e-9) return null;
  if (axis === "x") {
    return Math.atan2(-delta[2], delta[0]);
  }
  return Math.atan2(delta[0], delta[2]);
}

export function sampleMotionProgram(
  program: MyWayMotionProgramV1,
  progress: number,
  initialState: MotionProgramInitialState,
  context?: MotionProgramSampleContext,
): MotionProgramSample {
  let position: MotionProgramVec3 = [...initialState.position];
  let rotation: MotionProgramVec3 = [...initialState.rotation];
  let scale: MotionProgramVec3 = [...initialState.scale];
  const quantities: Record<string, number> = {};
  const carriers: MotionProgramSample["process"]["carriers"] = [];
  const activeProcessTrackIds: string[] = [];
  const appliedTrackIds: string[] = [];
  const unsupportedTrackIds: string[] = [];
  const sampledProgress = clampMotionProgress(progress);

  const tracks = [...program.tracks].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );

  for (const track of tracks) {
    const channelSupported = (
      MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]
    ).includes(track.channel);
    const spaceSupported = (
      MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES as readonly string[]
    ).includes(track.coordinate_space);
    if (!channelSupported || !spaceSupported) {
      unsupportedTrackIds.push(track.id);
      continue;
    }

    const t = trackLocalProgress(track, sampledProgress);
    if (t === null) continue;

    switch (track.operation) {
      case "lerp_vector": {
        const value = lerp(
          track.parameters.from,
          track.parameters.to,
          t,
        );
        if (track.parameters.blend === "replace") {
          position = value;
        } else {
          const resolved = resolveMotionVectorSpace(
            value,
            track.coordinate_space,
            initialState.rotation,
          );
          if (!resolved) {
            unsupportedTrackIds.push(track.id);
            continue;
          }
          position = add(position, resolved);
        }
        break;
      }
      case "lerp_angle": {
        const angle =
          track.parameters.from_radians +
          (track.parameters.to_radians - track.parameters.from_radians) * t;
        rotation =
          track.parameters.blend === "replace"
            ? setAxis(rotation, track.parameters.axis, angle)
            : addAxis(rotation, track.parameters.axis, angle);
        break;
      }
      case "rotate_around_anchor": {
        const angle =
          track.parameters.from_radians +
          (track.parameters.to_radians - track.parameters.from_radians) * t;
        const arm = subtract(
          track.parameters.origin,
          track.parameters.anchor,
        );
        position = add(
          track.parameters.anchor,
          rotateMotionVectorAroundAxis(
            arm,
            track.parameters.axis,
            angle,
          ),
        );
        if (track.parameters.rotate_orientation) {
          rotation = addAxis(
            track.parameters.origin_rotation ?? initialState.rotation,
            track.parameters.axis,
            angle,
          );
        }
        break;
      }
      case "sample_periodic": {
        const direction = resolveMotionVectorSpace(
          normalize(track.parameters.direction),
          track.coordinate_space,
          initialState.rotation,
        );
        if (!direction) {
          unsupportedTrackIds.push(track.id);
          continue;
        }
        const displacement =
          Math.sin(
            t * Math.PI * 2 * track.parameters.cycles +
              track.parameters.phase_radians,
          ) * track.parameters.amplitude;
        position = add(
          track.parameters.origin,
          multiply(direction, displacement),
        );
        break;
      }
      case "sample_target_offset": {
        const target = targetState(
          context,
          track.parameters.target_entity_id,
          sampledProgress,
        );
        if (!target) {
          unsupportedTrackIds.push(track.id);
          continue;
        }
        const desired = add(
          target.position,
          track.parameters.offset,
        );
        position =
          track.parameters.mode === "approach"
            ? lerp(track.parameters.origin, desired, t)
            : desired;
        break;
      }
      case "orient_axis_toward_target": {
        const target = targetState(
          context,
          track.parameters.target_entity_id,
          sampledProgress,
        );
        if (!target) {
          unsupportedTrackIds.push(track.id);
          continue;
        }
        const desired = desiredYawForHorizontalAxis(
          track.parameters.axis,
          position,
          target.position,
        );
        if (desired === null) break;
        rotation = setAxis(
          rotation,
          "y",
          track.parameters.from_yaw_radians +
            shortestAngleDelta(
              track.parameters.from_yaw_radians,
              desired,
            ) * t,
        );
        break;
      }
      case "detach_from_target": {
        const targetAtDetach = targetState(
          context,
          track.parameters.target_entity_id,
          track.start_progress,
        );
        const origin = targetAtDetach
          ? add(
              targetAtDetach.position,
              track.parameters.attachment_offset,
            )
          : [...track.parameters.fallback_origin] as MotionProgramVec3;
        let direction = track.parameters.explicit_direction
          ? normalize(track.parameters.explicit_direction)
          : targetAtDetach
            ? normalize(subtract(origin, targetAtDetach.position))
            : normalize([-1, 0.25, 0]);
        if (length(direction) <= 1e-9) {
          direction = normalize([-1, 0.25, 0]);
        }
        position = add(
          origin,
          multiply(direction, track.parameters.distance * t),
        );
        break;
      }
      case "interpolate_quantity": {
        quantities[track.parameters.quantity_key] = lerpScalar(
          track.parameters.from,
          track.parameters.to,
          t,
        );
        activeProcessTrackIds.push(track.id);
        break;
      }
      case "sample_flow_path": {
        const destinationState = track.parameters.destination_entity_id
          ? targetState(
              context,
              track.parameters.destination_entity_id,
              sampledProgress,
            )
          : null;
        const destination = destinationState?.position ??
          track.parameters.fallback_destination;
        const route: MotionProgramVec3[] = [
          [...position] as MotionProgramVec3,
          ...track.parameters.route_points.map(
            (point) => [...point] as MotionProgramVec3,
          ),
          [...destination] as MotionProgramVec3,
        ];
        const count = Math.max(
          1,
          Math.trunc(track.parameters.carrier_count),
        );
        for (let index = 0; index < count; index += 1) {
          const carrierT = carrierProgress(t, index, count);
          carriers.push({
            id: `${track.id}:carrier:${index}`,
            source_entity_id: track.parameters.source_entity_id,
            destination_entity_id:
              track.parameters.destination_entity_id,
            position: samplePolyline(route, carrierT),
            progress: carrierT,
          });
        }
        activeProcessTrackIds.push(track.id);
        break;
      }
      case "emit_carriers": {
        const localDirection = normalize(track.parameters.direction);
        const resolvedDirection = resolveMotionVectorSpace(
          localDirection,
          track.coordinate_space,
          initialState.rotation,
        );
        if (!resolvedDirection) {
          unsupportedTrackIds.push(track.id);
          continue;
        }
        const count = Math.max(
          1,
          Math.trunc(track.parameters.carrier_count),
        );
        for (let index = 0; index < count; index += 1) {
          const carrierT = carrierProgress(t, index, count);
          const centered =
            count <= 1 ? 0 : index / (count - 1) - 0.5;
          const spreadDirection = rotateMotionVectorAroundAxis(
            resolvedDirection,
            "y",
            centered * track.parameters.spread_radians,
          );
          carriers.push({
            id: `${track.id}:carrier:${index}`,
            source_entity_id: track.parameters.source_entity_id,
            destination_entity_id: null,
            position: add(
              track.parameters.origin,
              multiply(
                normalize(spreadDirection),
                track.parameters.distance * carrierT,
              ),
            ),
            progress: carrierT,
          });
        }
        activeProcessTrackIds.push(track.id);
        break;
      }
    }

    appliedTrackIds.push(track.id);
  }

  const finite =
    finiteVec(position) &&
    finiteVec(rotation) &&
    finiteVec(scale) &&
    Object.values(quantities).every(Number.isFinite) &&
    carriers.every(
      (carrier) =>
        finiteVec(carrier.position) && Number.isFinite(carrier.progress),
    );

  return {
    position,
    rotation,
    scale,
    progress: sampledProgress,
    applied_track_ids: appliedTrackIds,
    process: {
      quantities,
      carriers,
      active_process_track_ids: [...new Set(activeProcessTrackIds)],
    },
    diagnostics: {
      finite,
      unsupported_track_ids: [...new Set(unsupportedTrackIds)],
    },
  };
}
