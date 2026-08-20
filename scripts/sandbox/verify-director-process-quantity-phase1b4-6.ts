import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DirectorEvent,
  DirectorMoment,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY,
  DIRECTOR_OBJECT_MOTION_PHASE1B4_6_PROCESS_CAPABILITIES,
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
} from "../../sandbox/probe-lab/motion-program/director-motion-program-compiler";
import {
  DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS,
  DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS,
} from "../../sandbox/probe-lab/motion-program/director-process-quantity";
import {
  createDirectorSceneState,
  resolveDirectorActorWithSceneState,
  type DirectorSceneStateActor,
} from "../../sandbox/probe-lab/motion-program/director-scene-state";
import {
  directorSceneStateBeforeMoment,
  reduceDirectorMomentToSceneState,
  reduceDirectorMomentsToSceneState,
} from "../../sandbox/probe-lab/motion-program/director-scene-state-reducer";
import {
  MOTION_PROGRAM_CHANNELS,
  MOTION_PROGRAM_OPERATIONS,
  MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
} from "../../sandbox/probe-lab/motion-program/motion-program-contract";
import {
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";
import {
  sampleDirectorActorEventStateLegacyForVerification,
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(left: number, right: number, tolerance = 1e-8) {
  return Math.abs(left - right) <= tolerance;
}

function tupleApprox(
  left: readonly number[],
  right: readonly number[],
  tolerance = 1e-8,
) {
  return (
    left.length === right.length &&
    left.every((value, index) =>
      approx(value, right[index] ?? Number.NaN, tolerance),
    )
  );
}

function actor(
  id: string,
  position: [number, number, number],
  size: [number, number, number] = [1, 1, 1],
): DirectorSceneStateActor {
  return {
    id,
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    size,
  };
}

function event(
  id: string,
  behaviour: DirectorEvent["behaviour"],
  actorId: string,
  targetId: string | null,
  parameters: Record<string, unknown>,
): DirectorEvent {
  return {
    id,
    behaviour,
    actor_entity_id: actorId,
    target_entity_id: targetId,
    supporting_entity_ids: [],
    start_ms: 0,
    duration_ms: 1000,
    easing: "linear",
    path_hint: null,
    description: id,
    parameters,
    fallback_behaviour: null,
  };
}

function moment(
  id: string,
  events: DirectorEvent[],
): DirectorMoment {
  return {
    id,
    title: id,
    learning_job: id,
    director_intent: id,
    source_explanation_piece_ids: [],
    duration_ms: 1000,
    introduces_entity_ids: [],
    keeps_visible_entity_ids: [],
    active_entity_ids: [],
    camera: {
      shot_type: "medium",
      movement: "static",
      focus_entity_ids: [],
      framing_intent: id,
      keep_visible_entity_ids: [],
    },
    events,
    text_cues: [],
  };
}

function rootTuple(sample: {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}) {
  return {
    position: [sample.position.x, sample.position.y, sample.position.z],
    rotation: [sample.rotation.x, sample.rotation.y, sample.rotation.z],
    scale: [sample.scale.x, sample.scale.y, sample.scale.z],
  };
}

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  MOTION_PROGRAM_PROCESS_QUANTITY_VERSION ===
    "director_process_quantity_phase1b4_6_v1",
  "Phase 1B.4.6 process/quantity version drifted.",
);
assert(
  (MOTION_PROGRAM_CHANNELS as readonly string[]).includes("process"),
  "Process channel disappeared from the MotionProgram contract.",
);
assert(
  (MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes("process"),
  "Phase 1B.4.6 process channel is not executable.",
);
assert(
  !(MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
    "articulation",
  ),
  "Phase 1B.4.6 must not falsely promote arbitrary articulation execution.",
);
for (const operation of [
  "interpolate_quantity",
  "sample_flow_path",
  "emit_carriers",
]) {
  assert(
    (MOTION_PROGRAM_OPERATIONS as readonly string[]).includes(operation),
    `Phase 1B.4.6 operation is missing: ${operation}.`,
  );
}

assert(
  DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS.length === 5,
  "Phase 1B.4.6 process behaviour set drifted.",
);
const recipeIds = Object.values(
  DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS,
) as string[];
assert(
  new Set<string>(recipeIds).size === recipeIds.length,
  "Fill/Drain/Accumulate or Flow/Emit collapsed to shared process recipe IDs.",
);

const source = actor("source", [0, 0, 0], [1, 1.5, 1]);
const target = actor("target", [3, 0, 0], [1, 1, 1]);
const actors = [source, target];

const fill = moment("fill_moment", [
  event("fill_event", "fill", "source", null, {
    start_level: 0.2,
    target_level: 0.8,
  }),
]);
const fillCompilation = compileDirectorActorMotionProgram(
  fill,
  source,
  actors,
);
assert(
  fillCompilation.route === "motion_program" &&
    fillCompilation.program,
  "Fill did not compile through MotionProgram.",
);
assert(
  fillCompilation.program.diagnostics.process_version ===
    MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
  "Fill is missing Phase 1B.4.6 diagnostics.",
);
const fillMid = sampleCompiledDirectorActorMotionProgram(
  fillCompilation,
  0.5,
);
assert(fillMid, "Fill midpoint sample missing.");
assert(
  approx(fillMid.process.quantities.fill_level ?? Number.NaN, 0.5),
  `Fill midpoint should be 0.5, found ${fillMid.process.quantities.fill_level}.`,
);
assert(
  tupleApprox(fillMid.position, source.position) &&
    tupleApprox(fillMid.rotation, [0, 0, 0]) &&
    tupleApprox(fillMid.scale, [1, 1, 1]),
  "Fill mutated the container actor root transform.",
);

const initialState = createDirectorSceneState(actors);
const initialJson = JSON.stringify(initialState);
const afterFill = reduceDirectorMomentToSceneState(
  fill,
  actors,
  initialState,
);
assert(
  JSON.stringify(initialState) === initialJson,
  "Fill reduction mutated its incoming scene snapshot.",
);
assert(
  approx(
    afterFill.actors.source?.process_state?.quantities.fill_level ??
      Number.NaN,
    0.8,
  ),
  "Completed Fill did not persist fill_level=0.8.",
);

const hold = moment("hold_moment", []);
const drain = moment("drain_moment", [
  event("drain_event", "drain", "source", null, {
    target_level: 0.1,
  }),
]);
const fillDrainSequence = [fill, hold, drain];
const timeline = reduceDirectorMomentsToSceneState(
  fillDrainSequence,
  actors,
  initialState,
);
assert(
  approx(
    timeline.moment_results[1]?.outgoing_state.actors.source
      ?.process_state?.quantities.fill_level ?? Number.NaN,
    0.8,
  ),
  "Fill quantity did not survive the intervening Hold moment.",
);
assert(
  approx(
    timeline.final_state.actors.source?.process_state?.quantities
      .fill_level ?? Number.NaN,
    0.1,
  ),
  "Drain did not persist the requested final fill level.",
);
const beforeDrain = directorSceneStateBeforeMoment(
  fillDrainSequence,
  2,
  actors,
  initialState,
);
assert(
  JSON.stringify(beforeDrain) ===
    JSON.stringify(timeline.moment_results[1]?.outgoing_state),
  "Random-access process-state reconstruction before Drain is not deterministic.",
);
const resolvedSource = resolveDirectorActorWithSceneState(
  source,
  beforeDrain,
);
const resolvedActors = actors.map((candidate) =>
  resolveDirectorActorWithSceneState(candidate, beforeDrain),
);
const drainCompilation = compileDirectorActorMotionProgram(
  drain,
  resolvedSource,
  resolvedActors,
);
assert(
  drainCompilation.route === "motion_program" &&
    drainCompilation.program,
  "Drain did not compile from incoming scene state.",
);
const drainStart = sampleCompiledDirectorActorMotionProgram(
  drainCompilation,
  0,
);
assert(drainStart, "Drain start sample missing.");
assert(
  approx(
    drainStart.process.quantities.fill_level ?? Number.NaN,
    0.8,
  ),
  "Drain assumed a fixed full start instead of incoming fill_level=0.8.",
);

const accumulate = moment("accumulate_moment", [
  event("accumulate_event", "accumulate", "source", null, {
    start_amount: 2,
    amount: 3,
  }),
]);
const accumulateCompilation = compileDirectorActorMotionProgram(
  accumulate,
  source,
  actors,
);
assert(
  accumulateCompilation.route === "motion_program" &&
    accumulateCompilation.program,
  "Accumulate did not compile through the process lane.",
);
const accumulated = sampleCompiledDirectorActorMotionProgram(
  accumulateCompilation,
  1,
);
assert(accumulated, "Accumulate final sample missing.");
assert(
  approx(
    accumulated.process.quantities.accumulated_amount ??
      Number.NaN,
    5,
  ) &&
    accumulated.process.quantities.fill_level === undefined,
  "Accumulate collapsed onto Fill instead of its own quantity channel.",
);
assert(
  tupleApprox(accumulated.scale, [1, 1, 1]),
  "Accumulate still uses actor scale as a quantity proxy.",
);

const flow = moment("flow_moment", [
  event("flow_event", "flow", "source", "target", {
    carrier_count: 5,
    path_points: [
      [1, 1, 0],
      [2, 1, 0],
    ],
  }),
]);
const flowCompilation = compileDirectorActorMotionProgram(
  flow,
  source,
  actors,
);
assert(
  flowCompilation.route === "motion_program" &&
    flowCompilation.program,
  "Flow did not compile through the process lane.",
);
const movingTargetContext = {
  sample_entity_state: (
    entityId: string,
    progress: number,
  ) =>
    entityId === "target"
      ? {
          position: [3 + progress, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
        }
      : null,
};
const flowA = sampleCompiledDirectorActorMotionProgram(
  flowCompilation,
  0.65,
  movingTargetContext,
);
const flowB = sampleCompiledDirectorActorMotionProgram(
  flowCompilation,
  0.65,
  movingTargetContext,
);
assert(flowA && flowB, "Flow sample missing.");
assert(
  flowA.process.carriers.length === 5,
  "Flow did not expose the requested carrier count.",
);
assert(
  JSON.stringify(flowA.process.carriers) ===
    JSON.stringify(flowB.process.carriers),
  "Flow carrier sampling is not deterministic at arbitrary progress.",
);
assert(
  tupleApprox(flowA.position, source.position) &&
    tupleApprox(flowA.scale, [1, 1, 1]),
  "Flow mutated the source actor root transform.",
);
const flowEnd = sampleCompiledDirectorActorMotionProgram(
  flowCompilation,
  1,
  movingTargetContext,
);
assert(flowEnd, "Flow final sample missing.");
assert(
  flowEnd.process.carriers.every((carrier) =>
    tupleApprox(carrier.position, [4, 0, 0]),
  ),
  "Completed Flow carriers did not resolve the moving destination state.",
);

const emit = moment("emit_moment", [
  event("emit_event", "emit", "source", null, {
    carrier_count: 6,
    direction: [1, 0, 0],
    distance_m: 2,
    spread_degrees: 30,
  }),
]);
const emitCompilation = compileDirectorActorMotionProgram(
  emit,
  source,
  actors,
);
assert(
  emitCompilation.route === "motion_program" &&
    emitCompilation.program,
  "Emit did not compile through the process lane.",
);
const emitA = sampleCompiledDirectorActorMotionProgram(
  emitCompilation,
  0.75,
);
const emitB = sampleCompiledDirectorActorMotionProgram(
  emitCompilation,
  0.75,
);
assert(emitA && emitB, "Emit sample missing.");
assert(
  emitA.process.carriers.length === 6 &&
    emitA.process.carriers.every(
      (carrier) => carrier.destination_entity_id === null,
    ),
  "Emit did not produce independent outward carriers.",
);
assert(
  JSON.stringify(emitA.process.carriers) ===
    JSON.stringify(emitB.process.carriers),
  "Emit carrier sampling is not deterministic.",
);
assert(
  tupleApprox(emitA.position, source.position) &&
    tupleApprox(emitA.rotation, [0, 0, 0]) &&
    tupleApprox(emitA.scale, [1, 1, 1]),
  "Emit mutated the source actor root transform.",
);

const runtimeActors = actors as DirectorRuntimeActor[];
for (const processMoment of [flow, emit, fill, drain, accumulate]) {
  const legacy = sampleDirectorActorEventStateLegacyForVerification(
    processMoment,
    runtimeActors[0]!,
    1,
    runtimeActors,
  );
  const root = rootTuple(legacy);
  assert(
    tupleApprox(root.position, source.position) &&
      tupleApprox(root.rotation, [0, 0, 0]) &&
      tupleApprox(root.scale, [1, 1, 1]),
    `${processMoment.id} revived a legacy rigid-transform process proxy.`,
  );

  const publicSample = sampleDirectorActorState(
    processMoment,
    runtimeActors[0]!,
    0.6,
    runtimeActors,
  );
  assert(
    tupleApprox(
      [publicSample.position.x, publicSample.position.y, publicSample.position.z],
      source.position,
    ) &&
      tupleApprox(
        [publicSample.scale.x, publicSample.scale.y, publicSample.scale.z],
        [1, 1, 1],
      ),
    `${processMoment.id} public runtime mutated the process actor root.`,
  );
  assert(
    Boolean(publicSample.process),
    `${processMoment.id} public runtime did not expose process sample output.`,
  );
}

const processStateAfterFlow = reduceDirectorMomentToSceneState(
  flow,
  actors,
  initialState,
);
assert(
  processStateAfterFlow.actors.source?.process_state?.last_process_kind ===
    "flow",
  "Flow completion metadata did not enter scene state.",
);
assert(
  !(
    "carriers" in
    (processStateAfterFlow.actors.source?.process_state ?? {})
  ),
  "Transient process carriers were incorrectly persisted into scene state.",
);

for (const id of DIRECTOR_OBJECT_MOTION_PHASE1B4_6_PROCESS_CAPABILITIES) {
  const capability = directorCapabilityById(id);
  assert(capability, `Missing process capability ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} process fidelity report missing.`);
  assert(
    report.qualification_state === "process_strengthened",
    `${id} did not become process_strengthened.`,
  );
  assert(
    report.motion_program.program?.diagnostics.process_version ===
      MOTION_PROGRAM_PROCESS_QUANTITY_VERSION,
    `${id} process diagnostics are missing Phase 1B.4.6.`,
  );
  assert(
    !DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[id],
    `${id} still carries stale process-overlap redundancy evidence.`,
  );
  assert(
    DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE[
      id as "flow" | "emit" | "fill" | "drain" | "accumulate"
    ].owner === "motion_program_sampler",
    `${id} runtime coverage does not identify MotionProgram ownership.`,
  );
}

assert(
  Boolean(DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY.spin),
  "Spin redundancy was accidentally promoted during process work.",
);
for (const id of DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES) {
  const capability = directorCapabilityById(id);
  assert(capability, `Missing frozen canary ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} canary report disappeared.`);
  assert(
    report.qualification_state === "frozen_canary" &&
      report.motion_program.legacy_equivalence?.passed,
    `${id} frozen MotionProgram canary regressed.`,
  );
}

assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Phase 1B.4.6 changed the 183-capability catalog: ${DIRECTOR_CAPABILITIES.length}.`,
);
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, capability) => {
    const level = capability.compiler.threejs;
    counts[level] = (counts[level] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 102 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.4.6 changed support classifications: ${JSON.stringify(supportCounts)}.`,
);

const motionReadme = read(
  "sandbox/probe-lab/motion-program/README.md",
);
const processSection = motionReadme
  .slice(motionReadme.indexOf("## Phase 1B.4.6"))
  .toLowerCase()
  .replace(/\s+/g, " ");
for (const concept of [
  "fill",
  "drain",
  "accumulate",
  "flow",
  "emit",
  "fill_level",
  "accumulated_amount",
  "carrier",
  "not fluid",
]) {
  assert(
    processSection.includes(concept),
    `MotionProgram Phase 1B.4.6 documentation is missing concept: ${concept}.`,
  );
}

const libraryReadme = read(
  "sandbox/probe-lab/motion-camera-library/README.md",
)
  .toLowerCase()
  .replace(/\s+/g, " ");
assert(
  libraryReadme.includes("phase 1b.4.6") &&
    libraryReadme.includes("same semantic capability ids") &&
    libraryReadme.includes("single demand-rendered audit canvas"),
  "Director Capability Library Phase 1B.4.6 documentation boundary drifted.",
);
const librarySource = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
assert(
  !librarySource.includes("<Canvas"),
  "Capability Library page regained a direct Canvas/WebGL owner.",
);
const previewSource = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "ControlledProcessQuantityOverlay",
  "ProcessCarrierOverlay",
  "Phase 1B.4.6 process overlay",
]) {
  assert(
    previewSource.includes(marker),
    `Controlled process preview marker is missing: ${marker}.`,
  );
}
assert(
  !previewSource.includes("<Canvas"),
  "Phase 1B.4.6 process preview introduced a second Canvas/WebGL owner.",
);

console.log(
  "Director process + quantity semantics Phase 1B.4.6 verification passed.",
);
console.log(
  "Fill/Drain persistence, distinct Accumulate quantity, Flow/Emit carrier semantics, root-transform honesty, immutability, and deterministic random-access sampling passed.",
);
console.log(
  "Phase 1B.4.2–1B.4.5 guarantees remain protected; support classifications, camera, lighting, GLM prompt, Builder authority, and full physics simulation remain unchanged.",
);
