import {
  MOTION_PROGRAM_FOUNDATION_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
  type MotionProgramAngleLerpTrack,
  type MotionProgramInitialState,
  type MotionProgramVectorLerpTrack,
  type MyWayMotionProgramV1,
} from "./motion-program-contract";
import {
  motionFragment,
  parallelMotion,
} from "./motion-program-compose";
import { sampleMotionProgram } from "./motion-program-sampler";

const target = "synthetic_subject";

function translationTrack(
  id: string,
  to: [number, number, number],
  start: number,
  end: number,
  easing: "linear" | "ease_in" | "ease_out" | "ease_in_out",
): MotionProgramVectorLerpTrack {
  return {
    id,
    target_entity_id: target,
    channel: "transform",
    operation: "lerp_vector",
    start_progress: start,
    end_progress: end,
    easing,
    coordinate_space: "world",
    order: 0,
    parameters: {
      property: "position",
      from: [0, 0, 0],
      to,
      blend: "additive",
    },
  };
}

const rotateTrack: MotionProgramAngleLerpTrack = {
  id: "unnamed_rotate_35deg",
  target_entity_id: target,
  channel: "orientation",
  operation: "lerp_angle",
  start_progress: 0.05,
  end_progress: 0.95,
  easing: "linear",
  coordinate_space: "world",
  order: 0,
  parameters: {
    axis: "z",
    from_radians: 0,
    to_radians: (35 * Math.PI) / 180,
    blend: "additive",
  },
};

export function buildUnnamedMotionGeneralityProof() {
  const parallel = parallelMotion("unnamed_parallel", [
    motionFragment(
      "translate_x",
      [translationTrack("unnamed_translate_x", [2.4, 0, 0], 0, 1, "ease_out")],
      1,
    ),
    motionFragment(
      "translate_y",
      [translationTrack("unnamed_translate_y", [0, 1.2, 0], 0.15, 0.85, "ease_in_out")],
      1,
    ),
    motionFragment("rotate", [rotateTrack], 1),
  ]);

  const program: MyWayMotionProgramV1 = {
    schema_version: MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
    program_id: "synthetic:unnamed_parallel_translation_rotation",
    duration_ms: 2400,
    target_entity_id: target,
    tracks: parallel.tracks,
    constraints: [],
    state_effects: [],
    requirements: [],
    diagnostics: {
      foundation_version: MOTION_PROGRAM_FOUNDATION_VERSION,
      source_kind: "synthetic",
      source_event_ids: [],
      compiled_event_ids: [],
      ignored_event_ids: [],
      unsupported_event_ids: [],
      supported_runtime_channels: [...MOTION_PROGRAM_RUNTIME_CHANNELS],
      supported_coordinate_spaces: [
        ...MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
      ],
      warnings: [],
      legacy_fallback_required: false,
    },
  };
  const initialState: MotionProgramInitialState = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const samples = [0, 0.25, 0.5, 0.75, 1].map((progress) =>
    sampleMotionProgram(program, progress, initialState),
  );

  return {
    proof_id: "phase1b4_2_unnamed_composition",
    named_director_capability_required: false,
    description:
      "Two independent translations with different timing/easing overlap a 35-degree rotation without any DirectorCapability id.",
    composition_operator: "parallel",
    program,
    samples,
    finite: samples.every((sample) => sample.diagnostics.finite),
  };
}
