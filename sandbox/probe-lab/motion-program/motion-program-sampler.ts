import {
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  type MotionProgramInitialState,
  type MotionProgramSample,
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
  // Legacy Director event semantics skip ordinary motion exactly at t=0.
  if (progress <= track.start_progress) return null;
  const span = Math.max(1e-9, track.end_progress - track.start_progress);
  const raw = clampMotionProgress((progress - track.start_progress) / span);
  const directed = track.reverse_progress ? 1 - raw : raw;
  return sampleMotionEasing(directed, track.easing);
}

function finiteVec(value: MotionProgramVec3) {
  return value.every(Number.isFinite);
}

export function sampleMotionProgram(
  program: MyWayMotionProgramV1,
  progress: number,
  initialState: MotionProgramInitialState,
): MotionProgramSample {
  let position: MotionProgramVec3 = [...initialState.position];
  let rotation: MotionProgramVec3 = [...initialState.rotation];
  let scale: MotionProgramVec3 = [...initialState.scale];
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
            rotation,
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
    }

    appliedTrackIds.push(track.id);
  }

  const finite =
    finiteVec(position) && finiteVec(rotation) && finiteVec(scale);

  return {
    position,
    rotation,
    scale,
    progress: sampledProgress,
    applied_track_ids: appliedTrackIds,
    diagnostics: {
      finite,
      unsupported_track_ids: [...new Set(unsupportedTrackIds)],
    },
  };
}
