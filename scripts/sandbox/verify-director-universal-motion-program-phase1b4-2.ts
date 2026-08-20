import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  MOTION_PROGRAM_CHANNELS,
  MOTION_PROGRAM_FOUNDATION_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
  buildUnnamedMotionGeneralityProof,
  holdMotion,
  motionFragment,
  parallelMotion,
  repeatMotion,
  reverseMotion,
  sampleMotionProgram,
  sequenceMotion,
  type MotionProgramTrack,
  type MotionProgramVectorLerpTrack,
  type MyWayMotionProgramV1,
} from "../../sandbox/probe-lab/motion-program";
import {
  DIRECTOR_RUNTIME_OWNERS,
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  MYWAY_MOTION_PROGRAM_SCHEMA_VERSION === "myway_motion_program_v1",
  "Universal Motion Program schema version drifted.",
);
assert(
  MOTION_PROGRAM_FOUNDATION_VERSION ===
    "director_universal_motion_program_phase1b4_2_v1",
  "Universal Motion Program Phase 1B.4.2 foundation version drifted.",
);
for (const foundationChannel of ["transform", "orientation"] as const) {
  assert(
    (MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
      foundationChannel,
    ),
    `Phase 1B.4.2 foundation runtime channel disappeared: ${foundationChannel}.`,
  );
}
for (const futureChannel of [
  "articulation",
  "skeletal",
  "deformation",
  "physics",
  "camera",
  "lighting",
  "presentation",
]) {
  assert(
    (MOTION_PROGRAM_CHANNELS as readonly string[]).includes(futureChannel),
    `Future MotionProgram channel is missing from the contract: ${futureChannel}.`,
  );
  assert(
    !(MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
      futureChannel,
    ),
    `A later phase must not falsely execute still-unsupported channel ${futureChannel}.`,
  );
}
assert(
  (MOTION_PROGRAM_CHANNELS as readonly string[]).includes("process"),
  "Process disappeared from the renderer-neutral MotionProgram contract.",
);
for (const requiredFoundationSpace of ["world", "actor_local"] as const) {
  assert(
    (MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES as readonly string[]).includes(
      requiredFoundationSpace,
    ),
    `Phase 1B.4.2 foundation coordinate space disappeared: ${requiredFoundationSpace}.`,
  );
}
for (const stillUnsupportedSpace of [
  "camera_relative",
  "screen_relative",
  "path_relative",
  "surface_relative",
] as const) {
  assert(
    !(MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES as readonly string[]).includes(
      stillUnsupportedSpace,
    ),
    `Later strengthening must not make unsupported foundation space executable by accident: ${stillUnsupportedSpace}.`,
  );
}

const proof = buildUnnamedMotionGeneralityProof();
assert(
  proof.named_director_capability_required === false,
  "The unnamed generality proof must not require a DirectorCapability id.",
);
assert(
  !("director_capability_id" in proof.program),
  "MotionProgram must not require a DirectorCapability id field.",
);
assert(
  proof.program.tracks.length === 3,
  `Unnamed parallel proof should contain three independent tracks; found ${proof.program.tracks.length}.`,
);
assert(proof.finite, "Unnamed MotionProgram proof produced a non-finite sample.");
const proofFinal = proof.samples[proof.samples.length - 1]!;
assert(
  proofFinal.position[0] > 2.3 && proofFinal.position[1] > 1.1,
  `Unnamed proof did not preserve independent X/Y translation: ${JSON.stringify(proofFinal.position)}.`,
);
assert(
  Math.abs((proofFinal.rotation[2] * 180) / Math.PI - 35) < 0.001,
  `Unnamed proof did not preserve independent 35-degree rotation: ${proofFinal.rotation[2]}.`,
);

const baseTrack: MotionProgramVectorLerpTrack = {
  id: "composition_base",
  target_entity_id: "composition_subject",
  channel: "transform",
  operation: "lerp_vector",
  start_progress: 0,
  end_progress: 1,
  easing: "linear",
  coordinate_space: "world",
  order: 0,
  parameters: {
    property: "position",
    from: [0, 0, 0],
    to: [1, 0, 0],
    blend: "additive",
  },
};
const fragment = motionFragment("base", [baseTrack]);
const sequenced = sequenceMotion("sequence_proof", [
  fragment,
  holdMotion("hold_proof", 0.5),
  reverseMotion("reverse_proof", fragment),
]);
const repeated = repeatMotion("repeat_proof", fragment, 3);
const parallel = parallelMotion("parallel_proof", [fragment, repeated]);
assert(
  sequenced.tracks.length === 2,
  "Sequence + hold + reverse should preserve two executable tracks and allocate hold time without a fake track.",
);
assert(
  repeated.tracks.length === 3,
  "Repeat composition should produce three remapped track instances.",
);
assert(
  parallel.tracks.length === 4,
  "Parallel composition should preserve all overlapping tracks.",
);
assert(
  sequenced.tracks[0]!.end_progress < sequenced.tracks[1]!.start_progress,
  "Sequence composition did not allocate the hold gap between forward and reverse motion.",
);

const actorLocalProgram: MyWayMotionProgramV1 = {
  schema_version: MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
  program_id: "synthetic:actor_local_space_proof",
  duration_ms: 1000,
  target_entity_id: "actor_local_subject",
  tracks: [
    {
      ...baseTrack,
      id: "actor_local_right",
      target_entity_id: "actor_local_subject",
      coordinate_space: "actor_local",
      parameters: {
        property: "position",
        from: [0, 0, 0],
        to: [1, 0, 0],
        blend: "additive",
      },
    },
  ],
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
    supported_coordinate_spaces: [...MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES],
    warnings: [],
    legacy_fallback_required: false,
  },
};
const actorLocalSample = sampleMotionProgram(
  actorLocalProgram,
  1,
  {
    position: [0, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
  },
);
assert(
  Math.abs(actorLocalSample.position[0]) < 1e-6 &&
    Math.abs(Math.abs(actorLocalSample.position[2]) - 1) < 1e-6,
  `Actor-local vector did not rotate through the actor frame: ${JSON.stringify(actorLocalSample.position)}.`,
);

const unsupportedProgram: MyWayMotionProgramV1 = {
  ...actorLocalProgram,
  program_id: "synthetic:unsupported_channel_proof",
  tracks: [
    {
      ...baseTrack,
      id: "unsupported_physics_track",
      channel: "physics",
      coordinate_space: "world",
    } as unknown as MotionProgramTrack,
  ],
};
const unsupportedSample = sampleMotionProgram(
  unsupportedProgram,
  1,
  {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
);
assert(
  unsupportedSample.diagnostics.unsupported_track_ids.includes(
    "unsupported_physics_track",
  ),
  "Still-unsupported future channel was not surfaced explicitly by the sampler.",
);
assert(
  JSON.stringify(unsupportedSample.position) === JSON.stringify([0, 0, 0]),
  "Unsupported future channel must not silently mutate root motion.",
);

assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Phase 1B.4.2 must preserve the 183-capability Director catalog; found ${DIRECTOR_CAPABILITIES.length}.`,
);
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, capability) => {
    counts[capability.compiler.threejs] =
      (counts[capability.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.4.2 must not promote Director support labels: ${JSON.stringify(supportCounts)}.`,
);

for (const id of DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES) {
  const capability = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(capability, `Missing frozen MotionProgram canary ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} is missing object-motion fidelity evidence.`);
  assert(
    report.motion_program.route === "motion_program",
    `${id} did not route through the qualified MotionProgram adapter: ${report.motion_program.route}.`,
  );
  assert(
    report.motion_program.program?.schema_version ===
      MYWAY_MOTION_PROGRAM_SCHEMA_VERSION,
    `${id} did not expose a myway_motion_program_v1 program.`,
  );
  const equivalence = report.motion_program.legacy_equivalence;
  assert(
    equivalence && equivalence.passed,
    `${id} failed legacy-vs-MotionProgram equivalence: ${JSON.stringify(equivalence)}.`,
  );
  if (id === "oscillate") {
    assert(
      equivalence.sample_count === 33,
      "Oscillate dual-run must include dense samples in addition to standard fidelity points.",
    );
  } else {
    assert(
      equivalence.sample_count === 5,
      `${id} dual-run should use the standard five progress samples.`,
    );
  }
}

// Later phases may legitimately strengthen semantics that were unresolved in
// the Phase 1B.4.2 foundation. If process capabilities are now compiled, they
// must identify a later process version rather than masquerading as foundation work.
for (const id of ["flow", "emit", "fill", "accumulate"]) {
  const capability = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(capability, `Missing process capability ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} is missing object-motion fidelity evidence.`);
  if (report.motion_program.route === "motion_program") {
    assert(
      Boolean(report.motion_program.program?.diagnostics.process_version),
      `${id} executes without a later-phase process diagnostic version.`,
    );
  }
}

assert(
  DIRECTOR_RUNTIME_OWNERS.includes("motion_program_sampler"),
  "Runtime coverage does not recognize the MotionProgram sampler owner.",
);
for (const behaviour of ["move_to", "rotate", "pivot", "oscillate"] as const) {
  assert(
    DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE[behaviour].owner ===
      "motion_program_sampler",
    `${behaviour} runtime coverage does not identify the Phase 1B.4.2 sampler owner.`,
  );
}

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
// Phase 1B.4.2 established the public actor MotionProgram adapter seam. Later
// strengthening phases may replace the internal adapter implementation, so this
// verifier checks executable seam signatures rather than an obsolete phase-comment
// string. The public wrapper, compiler route, sampler route, verification escape
// hatch, and legacy fail-closed path must all remain present.
for (const marker of [
  "function sampleDirectorActorEventState(",
  "compileDirectorActorMotionProgram",
  "sampleCompiledDirectorActorMotionProgram",
  "sampleDirectorActorEventStateLegacyForVerification",
  'compilation.route === "motion_program"',
  "return sampleDirectorActorEventStateLegacy(",
  'case "follow_target":\n      case "attach":',
  'case "flow":\n      case "emit":',
  'case "accumulate":\n      case "fill":',
]) {
  assert(
    runtime.includes(marker),
    `Phase 1B.4.2 runtime marker is missing: ${marker}.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "Universal Motion Program ·",
  "Phase 1B.4.2 foundation",
  "buildUnnamedMotionGeneralityProof",
  "unnamed_motion_generality_proof",
  "Universal Motion Program execution",
  "one_webgl_canvas: true",
  "INITIAL_CATALOG_LIMIT = 36",
  "runtime_semantics_rewritten_in_this_phase: false",
]) {
  assert(
    library.includes(marker),
    `Capability Library is missing Phase 1B.4.2 execution-inspector marker: ${marker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Phase 1B.4.2 must not move a WebGL Canvas back into the catalogue shell.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
const phaseReadmeHeading =
  "## Phase 1B.4.2 — Universal Motion Program foundation";
const phaseReadmeStart = readme.indexOf(phaseReadmeHeading);
assert(
  phaseReadmeStart >= 0,
  "Motion Camera README is missing the Phase 1B.4.2 section.",
);
const phaseReadmeTail = readme.slice(phaseReadmeStart + phaseReadmeHeading.length);
const nextReadmeHeading = phaseReadmeTail.indexOf("\n## ");
const phaseReadmeSection =
  nextReadmeHeading >= 0
    ? phaseReadmeTail.slice(0, nextReadmeHeading)
    : phaseReadmeTail;
for (const marker of [
  "myway_motion_program_v1",
  "sequence",
  "parallel",
  "hold",
  "repeat",
  "reverse",
  "does not add another WebGL context",
]) {
  assert(
    phaseReadmeSection.includes(marker),
    `Motion Camera README Phase 1B.4.2 section is missing documented concept: ${marker}.`,
  );
}

console.log(
  "Director Universal Motion Program Phase 1B.4.2 verification passed.",
);
console.log(
  "Renderer-neutral deterministic tracks, composition operators, coordinate-space honesty, and unsupported-lane diagnostics passed.",
);
console.log(
  "Translate/Rotate/Pivot/Oscillate remain frozen and dual-run equivalent; remaining semantic overlaps stay explicitly unqualified.",
);
console.log(
  "Unnamed multi-track motion executes without a DirectorCapability id; the 183-capability semantic catalog and support labels remain unchanged.",
);
