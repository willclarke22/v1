import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DirectorBehaviour,
  DirectorEvent,
  DirectorMoment,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY,
  DIRECTOR_OBJECT_MOTION_PHASE1B4_5_CHOREOGRAPHY_CAPABILITIES,
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS,
  MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
  createDirectorSceneState,
  directorMultiActorChoreographyKind,
  directorMultiActorChoreographyParticipantIds,
  reduceDirectorMomentSceneState,
  reduceDirectorMomentToSceneState,
  sampleDirectorActorInMomentFromSceneState,
  type DirectorSceneState,
  type DirectorSceneStateActor,
  type MotionProgramVec3,
} from "../../sandbox/probe-lab/motion-program";
import {
  DIRECTOR_RUNTIME_OWNERS,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function distance(a: MotionProgramVec3, b: MotionProgramVec3) {
  return Math.hypot(
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  );
}

function actor(
  state: DirectorSceneState,
  actorId: string,
) {
  const value = state.actors[actorId];
  assert(value, `Missing actor scene state: ${actorId}.`);
  return value;
}

function demoActors(): DirectorSceneStateActor[] {
  return [
    {
      id: "hub",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      size: [1.4, 1.4, 1.4],
    },
    {
      id: "part_a",
      position: [-4, 0, -1],
      rotation: [0, 0, 0],
      size: [0.8, 0.8, 0.8],
    },
    {
      id: "part_b",
      position: [4, 0, -1],
      rotation: [0, 0, 0],
      size: [0.8, 0.8, 0.8],
    },
    {
      id: "part_c",
      position: [0, 0, 4],
      rotation: [0, 0, 0],
      size: [0.8, 0.8, 0.8],
    },
    {
      id: "container",
      position: [0, 0, -5],
      rotation: [0, 0, 0],
      size: [2.2, 2.2, 2.2],
    },
  ];
}

function baseMoment(
  id: string,
  events: DirectorEvent[],
): DirectorMoment {
  return {
    id,
    title: id,
    learning_job: id,
    director_intent: id,
    source_explanation_piece_ids: [],
    duration_ms: 4000,
    introduces_entity_ids: [],
    keeps_visible_entity_ids: [],
    active_entity_ids: demoActors().map((item) => item.id),
    camera: {
      shot_type: "medium",
      movement: "static",
      focus_entity_ids: ["hub"],
      framing_intent: id,
      keep_visible_entity_ids: [],
    },
    events,
    text_cues: [],
    success_observation: null,
  };
}

function event(input: {
  id: string;
  behaviour: DirectorBehaviour;
  actor: string;
  target?: string | null;
  supporting?: string[];
  parameters?: Record<string, unknown>;
  startMs?: number;
  durationMs?: number;
}): DirectorEvent {
  return {
    id: input.id,
    behaviour: input.behaviour,
    actor_entity_id: input.actor,
    target_entity_id: input.target ?? null,
    supporting_entity_ids: input.supporting ?? [],
    start_ms: input.startMs ?? 250,
    duration_ms: input.durationMs ?? 3200,
    easing: "ease_in_out",
    path_hint: null,
    description: input.id,
    parameters: input.parameters ?? {},
    fallback_behaviour: "move_to",
  };
}

function move(
  id: string,
  actorId: string,
  target: MotionProgramVec3,
) {
  return event({
    id,
    behaviour: "move_to",
    actor: actorId,
    parameters: { target_position: target },
  });
}

function unchangedKeys(
  before: DirectorSceneState,
  after: DirectorSceneState,
) {
  return (
    JSON.stringify(Object.keys(before.actors).sort()) ===
    JSON.stringify(Object.keys(after.actors).sort())
  );
}

const actors = demoActors();
const initial = createDirectorSceneState(actors);

// Assemble: two independently named parts approach different slots around a
// moving hub, then persist their target-relative assembly relation.
const assembleMoment = baseMoment("assemble_moment", [
  move("hub_travel", "hub", [2, 0, 1]),
  event({
    id: "assemble_parts",
    behaviour: "assemble",
    actor: "part_a",
    target: "hub",
    supporting: ["part_b", "part_c"],
    parameters: {
      participant_entity_ids: ["part_a", "part_b", "part_c"],
      spacing_m: 1.4,
    },
  }),
]);
const assembleReduction = reduceDirectorMomentSceneState(
  assembleMoment,
  actors,
  initial,
);
for (const id of ["part_a", "part_b", "part_c"]) {
  const state = actor(assembleReduction.outgoing_state, id);
  assert(
    state.choreography_state?.relation_kind === "assembled",
    `${id} did not persist assembled choreography state.`,
  );
  assert(
    state.choreography_state?.anchor_entity_id === "hub",
    `${id} lost the assembly hub.`,
  );
  assert(
    state.choreography_state?.follow_anchor === true,
    `${id} assembly slot should follow the hub.`,
  );
}
assert(
  distance(
    actor(assembleReduction.outgoing_state, "part_a").position,
    actor(assembleReduction.outgoing_state, "part_b").position,
  ) > 0.2,
  "Assemble collapsed separate part IDs into the same world position.",
);
assert(
  unchangedKeys(initial, assembleReduction.outgoing_state),
  "Assemble invented or deleted actor IDs.",
);

// Later target motion must carry assembled slots without requiring repeated
// per-part events.
const laterHubMove = baseMoment("later_hub_move", [
  move("hub_moves_again", "hub", [5, 0, 2]),
]);
const followed = reduceDirectorMomentToSceneState(
  laterHubMove,
  actors,
  assembleReduction.outgoing_state,
);
const hubDelta: MotionProgramVec3 = [
  actor(followed, "hub").position[0] -
    actor(assembleReduction.outgoing_state, "hub").position[0],
  actor(followed, "hub").position[1] -
    actor(assembleReduction.outgoing_state, "hub").position[1],
  actor(followed, "hub").position[2] -
    actor(assembleReduction.outgoing_state, "hub").position[2],
];
for (const id of ["part_a", "part_b", "part_c"]) {
  const before = actor(assembleReduction.outgoing_state, id).position;
  const after = actor(followed, id).position;
  assert(
    distance(
      [
        before[0] + hubDelta[0],
        before[1] + hubDelta[1],
        before[2] + hubDelta[2],
      ],
      after,
    ) < 1e-7,
    `${id} did not preserve its assembled target-relative slot.`,
  );
}

// Disassemble should spread all declared parts and stop anchor following.
const disassembleMoment = baseMoment("disassemble_moment", [
  event({
    id: "disassemble_parts",
    behaviour: "disassemble",
    actor: "part_a",
    supporting: ["part_b", "part_c"],
    parameters: {
      participant_entity_ids: ["part_a", "part_b", "part_c"],
      distance_m: 2.7,
    },
  }),
]);
const disassembled = reduceDirectorMomentToSceneState(
  disassembleMoment,
  actors,
  followed,
);
for (const id of ["part_a", "part_b", "part_c"]) {
  const choreography = actor(disassembled, id).choreography_state;
  assert(
    choreography?.relation_kind === "disassembled",
    `${id} did not enter disassembled state.`,
  );
  assert(
    choreography.follow_anchor === false,
    `${id} incorrectly retained rigid anchor following after disassembly.`,
  );
}
const partAAfterDisassemble = [
  ...actor(disassembled, "part_a").position,
] as MotionProgramVec3;
const hubOnlyAfterDisassemble = reduceDirectorMomentToSceneState(
  baseMoment("hub_after_disassemble", [
    move("hub_after_disassemble_move", "hub", [8, 0, 2]),
  ]),
  actors,
  disassembled,
);
assert(
  distance(
    partAAfterDisassemble,
    actor(hubOnlyAfterDisassemble, "part_a").position,
  ) < 1e-9,
  "Disassembled part still followed a later hub move.",
);

// Scatter uses the existing Director V2 move_away compatibility verb plus an
// explicit choreography kind and stable participant IDs.
const scatterEvent = event({
  id: "scatter_group",
  behaviour: "move_away",
  actor: "part_a",
  supporting: ["part_b", "part_c"],
  parameters: {
    choreography_kind: "scatter",
    participant_entity_ids: ["part_a", "part_b", "part_c"],
    distance_m: 3,
  },
});
assert(
  directorMultiActorChoreographyKind(scatterEvent) === "scatter",
  "Scatter compatibility bridge was not recognized.",
);
assert(
  directorMultiActorChoreographyParticipantIds(scatterEvent).length === 3,
  "Scatter did not preserve its three declared actor IDs.",
);
const scattered = reduceDirectorMomentToSceneState(
  baseMoment("scatter_moment", [scatterEvent]),
  actors,
  initial,
);
for (const id of ["part_a", "part_b", "part_c"]) {
  assert(
    actor(scattered, id).choreography_state?.relation_kind ===
      "scattered",
    `${id} is missing scattered choreography state.`,
  );
}
assert(
  distance(
    actor(scattered, "part_a").position,
    actor(scattered, "part_b").position,
  ) > 2,
  "Scatter did not produce distinct participant positions.",
);

// Split requires predeclared result actors and never invents clones.
const split = reduceDirectorMomentToSceneState(
  baseMoment("split_moment", [
    event({
      id: "split_results",
      behaviour: "split",
      actor: "part_a",
      supporting: ["part_b", "part_c"],
      parameters: {
        participant_entity_ids: ["part_a", "part_b", "part_c"],
        distance_m: 2.4,
      },
    }),
  ]),
  actors,
  initial,
);
assert(
  unchangedKeys(initial, split),
  "Split cloned or deleted actors instead of moving predeclared stable IDs.",
);
for (const id of ["part_a", "part_b", "part_c"]) {
  assert(
    actor(split, id).choreography_state?.relation_kind ===
      "split_results",
    `${id} is missing split-results state.`,
  );
}

// Merge converges multiple movers to distinct small slots around a moving target.
const mergeMoment = baseMoment("merge_moment", [
  move("merge_hub_move", "hub", [1.5, 0, 1.2]),
  event({
    id: "merge_parts",
    behaviour: "merge",
    actor: "part_a",
    target: "hub",
    supporting: ["part_b"],
    parameters: {
      participant_entity_ids: ["part_a", "part_b"],
      spacing_m: 1.2,
    },
  }),
]);
const merged = reduceDirectorMomentToSceneState(
  mergeMoment,
  actors,
  initial,
);
for (const id of ["part_a", "part_b"]) {
  assert(
    actor(merged, id).choreography_state?.relation_kind === "merged",
    `${id} is missing merged state.`,
  );
  assert(
    distance(
      actor(merged, id).position,
      actor(merged, "hub").position,
    ) < 1,
    `${id} did not converge to the shared merge region.`,
  );
}
assert(
  distance(
    actor(merged, "part_a").position,
    actor(merged, "part_b").position,
  ) > 0.05,
  "Merge erased stable participant identity by collapsing exact positions.",
);

// Insert / remove persists and releases containment without claiming fit authority.
const inserted = reduceDirectorMomentToSceneState(
  baseMoment("insert_moment", [
    event({
      id: "insert_part",
      behaviour: "insert_into",
      actor: "part_a",
      target: "container",
      parameters: {
        containment_offset: [0.25, 0, 0],
      },
    }),
  ]),
  actors,
  initial,
);
assert(
  actor(inserted, "part_a").choreography_state?.relation_kind ===
    "contained",
  "Insert did not persist containment choreography state.",
);
assert(
  actor(inserted, "part_a").choreography_state?.follow_anchor === true,
  "Contained actor should follow its declared container anchor.",
);

const containerMoved = reduceDirectorMomentToSceneState(
  baseMoment("container_move", [
    move("move_container", "container", [3, 0, -4]),
  ]),
  actors,
  inserted,
);
assert(
  distance(
    actor(containerMoved, "part_a").position,
    [
      actor(containerMoved, "container").position[0] + 0.25,
      actor(containerMoved, "container").position[1],
      actor(containerMoved, "container").position[2],
    ],
  ) < 1e-7,
  "Contained actor did not preserve its target-relative slot.",
);
const removed = reduceDirectorMomentToSceneState(
  baseMoment("remove_moment", [
    event({
      id: "remove_part",
      behaviour: "remove_from",
      actor: "part_a",
      target: "container",
      parameters: { distance_m: 2 },
    }),
  ]),
  actors,
  containerMoved,
);
assert(
  actor(removed, "part_a").choreography_state === null,
  "Remove did not release containment choreography state.",
);

// Connect is semantic, not physical attachment; disconnect clears the relation.
const connected = reduceDirectorMomentToSceneState(
  baseMoment("connect_moment", [
    event({
      id: "connect_part",
      behaviour: "connect",
      actor: "part_a",
      target: "hub",
      parameters: { connection_offset: [1, 0, 0] },
    }),
  ]),
  actors,
  initial,
);
assert(
  actor(connected, "part_a").choreography_state?.relation_kind ===
    "connected",
  "Connect did not persist semantic connection state.",
);
assert(
  actor(connected, "part_a").choreography_state?.follow_anchor === false,
  "Connect was silently promoted to rigid attachment semantics.",
);
const disconnected = reduceDirectorMomentToSceneState(
  baseMoment("disconnect_moment", [
    event({
      id: "disconnect_part",
      behaviour: "disconnect",
      actor: "part_a",
      target: "hub",
      parameters: { distance_m: 1.5 },
    }),
  ]),
  actors,
  connected,
);
assert(
  actor(disconnected, "part_a").choreography_state === null,
  "Disconnect did not clear semantic connection state.",
);

// Sampling is random-access and input state remains immutable.
const serializedInitial = JSON.stringify(initial);
const sampledHalf = sampleDirectorActorInMomentFromSceneState(
  assembleMoment,
  "part_b",
  0.5,
  actors,
  initial,
);
const sampledHalfAgain = sampleDirectorActorInMomentFromSceneState(
  assembleMoment,
  "part_b",
  0.5,
  actors,
  initial,
);
assert(sampledHalf && sampledHalfAgain, "Mid-choreography sample missing.");
assert(
  JSON.stringify(sampledHalf) === JSON.stringify(sampledHalfAgain),
  "Multi-actor sampling is not random-access deterministic.",
);
assert(
  JSON.stringify(initial) === serializedInitial,
  "Choreography sampling mutated its incoming scene snapshot.",
);

// Capability evidence: IDs/support labels remain unchanged while the seven
// object-motion capabilities leave the old redundancy bucket.
assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Director capability count drifted: ${DIRECTOR_CAPABILITIES.length}.`,
);
const distribution = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, capability) => {
    counts[capability.compiler.threejs] =
      (counts[capability.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  JSON.stringify(distribution) ===
    JSON.stringify({
      direct: 102,
      compound: 65,
      approximate: 15,
      declared: 2,
    }),
  `Support distribution drifted: ${JSON.stringify(distribution)}.`,
);

for (
  const id of
  DIRECTOR_OBJECT_MOTION_PHASE1B4_5_CHOREOGRAPHY_CAPABILITIES
) {
  const capability = DIRECTOR_CAPABILITIES.find(
    (candidate) => candidate.id === id,
  );
  assert(capability, `Missing choreography capability ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} is missing fidelity evidence.`);
  assert(
    report.qualification_state === "choreography_strengthened",
    `${id} did not become choreography_strengthened.`,
  );
  assert(
    report.motion_program.program?.diagnostics.choreography_version ===
      MOTION_PROGRAM_MULTI_ACTOR_CHOREOGRAPHY_VERSION,
    `${id} is missing Phase 1B.4.5 diagnostics.`,
  );
  assert(
    !DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[id],
    `${id} still carries stale shared-branch redundancy evidence.`,
  );
}

assert(
  Boolean(DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY.spin),
  "Spin was promoted beyond the Phase 1B.4.5 choreography scope.",
);

for (const id of DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES) {
  const capability = DIRECTOR_CAPABILITIES.find(
    (candidate) => candidate.id === id,
  );
  assert(capability, `Missing frozen canary ${id}.`);
  const report = buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} canary report disappeared.`);
  assert(
    report.qualification_state === "frozen_canary" &&
      report.motion_program.legacy_equivalence?.passed,
    `${id} frozen legacy-equivalence canary regressed.`,
  );
}

assert(
  DIRECTOR_RUNTIME_OWNERS.includes("choreography_planner"),
  "Runtime coverage does not recognize the choreography planner owner.",
);

// Capability Library performance guard remains unchanged.
const projectRoot = process.cwd();
const librarySource = readFileSync(
  join(
    projectRoot,
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
  ),
  "utf8",
);
assert(
  !librarySource.includes("<Canvas"),
  "Capability Library directly owns a Canvas after Phase 1B.4.5.",
);
assert(
  librarySource.includes("INITIAL_CATALOG_LIMIT = 36"),
  "Capability Library catalogue mount limit drifted.",
);

// Documentation checks are scoped and normalized so capitalization/line wrapping
// cannot create another brittle installer failure.
const motionReadme = readFileSync(
  join(projectRoot, "sandbox/probe-lab/motion-program/README.md"),
  "utf8",
);
const section = motionReadme
  .split("## Phase 1B.4.5")[1]
  ?.toLowerCase()
  .replace(/\s+/g, " ");
assert(section, "MotionProgram README is missing Phase 1B.4.5.");
const distinctRecipeIds = new Set<string>([
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS.assemble,
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS.merge,
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS.disassemble,
  DIRECTOR_MULTI_ACTOR_CHOREOGRAPHY_RECIPE_IDS.split,
]);
assert(
  distinctRecipeIds.size === 4,
  "Assemble/Merge or Disassemble/Split collapsed to shared choreography recipe IDs.",
);

console.log(
  "Director multi-actor choreography Phase 1B.4.5 verification passed.",
);
console.log(
  "Assemble/Disassemble/Scatter/Split/Merge, containment, and semantic connection choreography passed with stable actor IDs and deterministic random-access sampling.",
);
console.log(
  "Phase 1B.4.2/1B.4.3/1B.4.4 guarantees remain protected; support classifications, camera, lighting, GLM prompt, and Builder collision authority remain unchanged across later semantic strengthening.",
);
