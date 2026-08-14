import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DirectorEvent,
  DirectorMoment,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY,
  DIRECTOR_OBJECT_MOTION_PHASE1B4_3_RECIPE_CAPABILITIES,
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
  directorObjectMotionFidelityFixtureActors,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS,
  MOTION_PROGRAM_CHANNELS,
  MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
  MOTION_PROGRAM_RUNTIME_CHANNELS,
  MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES,
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
  type DirectorMotionProgramActor,
  type MotionProgramInitialState,
} from "../../sandbox/probe-lab/motion-program";
import {
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
  DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";
import {
  sampleDirectorActorState,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function actorById(
  actors: DirectorMotionProgramActor[],
  id: string,
) {
  const found = actors.find((actor) => actor.id === id);
  assert(found, `Missing fixture actor ${id}.`);
  return found;
}

function distance(
  left: readonly number[],
  right: readonly number[],
) {
  return Math.hypot(
    left[0]! - right[0]!,
    left[1]! - right[1]!,
    left[2]! - right[2]!,
  );
}

function sampleTuple(
  moment: DirectorMoment,
  actor: DirectorMotionProgramActor,
  actors: DirectorMotionProgramActor[],
  progress: number,
) {
  const sample = sampleDirectorActorState(
    moment,
    actor,
    progress,
    actors,
  );
  return {
    position: [
      sample.position.x,
      sample.position.y,
      sample.position.z,
    ] as [number, number, number],
    rotation: [
      sample.rotation.x,
      sample.rotation.y,
      sample.rotation.z,
    ] as [number, number, number],
    scale: [
      sample.scale.x,
      sample.scale.y,
      sample.scale.z,
    ] as [number, number, number],
  };
}

function relativeOffset(
  subject: ReturnType<typeof sampleTuple>,
  target: ReturnType<typeof sampleTuple>,
) {
  return [
    subject.position[0] - target.position[0],
    subject.position[1] - target.position[1],
    subject.position[2] - target.position[2],
  ] as [number, number, number];
}

assert(
  MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION ===
    "director_relational_articulation_phase1b4_3_v1",
  "Phase 1B.4.3 strengthening version drifted.",
);
assert(
  (MOTION_PROGRAM_RUNTIME_COORDINATE_SPACES as readonly string[]).includes(
    "target_relative",
  ),
  "Phase 1B.4.3 must explicitly execute target_relative relationship sampling.",
);
assert(
  !(MOTION_PROGRAM_RUNTIME_CHANNELS as readonly string[]).includes(
    "articulation",
  ),
  "Phase 1B.4.3 must not falsely claim arbitrary articulation-channel execution.",
);
assert(
  (MOTION_PROGRAM_CHANNELS as readonly string[]).includes("articulation"),
  "Articulation intent disappeared from the renderer-neutral contract.",
);

const expectedRecipeCapabilities = [
  "follow_target",
  "attach",
  "detach",
  "align",
  "aim_at",
  "hinge",
  "object_open",
  "object_close",
  "slide",
  "roll",
];
assert(
  JSON.stringify(DIRECTOR_OBJECT_MOTION_PHASE1B4_3_RECIPE_CAPABILITIES) ===
    JSON.stringify(expectedRecipeCapabilities),
  "Phase 1B.4.3 recipe capability set drifted.",
);

for (const id of expectedRecipeCapabilities) {
  const report = buildDirectorObjectMotionFidelityReport(capability(id));
  assert(report, `${id} is missing object-motion fidelity evidence.`);
  assert(
    report.motion_program.route === "motion_program",
    `${id} did not route through the strengthened MotionProgram: ${report.motion_program.reason}`,
  );
  assert(
    report.qualification_state === "recipe_strengthened",
    `${id} did not surface recipe_strengthened qualification.`,
  );
  assert(
    report.strengthening_version ===
      MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
    `${id} is missing the Phase 1B.4.3 strengthening version.`,
  );
  assert(
    report.motion_program.program?.diagnostics.strengthening_version ===
      MOTION_PROGRAM_RELATIONAL_ARTICULATION_VERSION,
    `${id} program diagnostics are missing strengthening version.`,
  );
  assert(
    (report.motion_program.program?.diagnostics.recipe_ids?.length ?? 0) > 0,
    `${id} program is missing its semantic recipe id.`,
  );
  assert(
    report.checks.some(
      (check) =>
        check.id === "phase1b4_3_recipe_strengthening" &&
        check.passed,
    ),
    `${id} recipe-strengthening evidence did not pass.`,
  );
}

for (const [id, recipeId] of Object.entries(
  DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS,
)) {
  const registryId =
    id === "open"
      ? "object_open"
      : id === "close"
        ? "object_close"
        : id;
  const report = buildDirectorObjectMotionFidelityReport(
    capability(registryId),
  );
  assert(report?.motion_program.program, `${registryId} has no program.`);
  assert(
    report.motion_program.program.diagnostics.recipe_ids?.includes(recipeId),
    `${registryId} did not expose expected recipe ${recipeId}.`,
  );
}

for (const strengthened of [
  "attach",
  "follow_target",
  "align",
  "aim_at",
]) {
  assert(
    !DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[strengthened],
    `${strengthened} still carries stale Phase 1B.4.1 shared-branch redundancy evidence.`,
  );
}
for (const remaining of [
  "spin",
  "scatter",
  "insert_into",
  "assemble",
  "merge",
  "remove_from",
  "disassemble",
  "split",
  "flow",
  "emit",
  "fill",
  "accumulate",
]) {
  assert(
    Boolean(DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY[remaining]),
    `${remaining} lost unresolved semantic-overlap evidence prematurely.`,
  );
}

for (const id of DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES) {
  const report = buildDirectorObjectMotionFidelityReport(capability(id));
  assert(report, `${id} canary report disappeared.`);
  assert(
    report.qualification_state === "frozen_canary",
    `${id} lost its frozen canary state.`,
  );
  assert(
    report.motion_program.legacy_equivalence?.passed,
    `${id} no longer matches the frozen Phase 1B.4.2 legacy authority.`,
  );
}

const followCapability = capability("follow_target");
const followMoment = directorCapabilityDemoMoment(followCapability);
assert(
  followMoment.events.some(
    (event) =>
      event.actor_entity_id === "secondary_subject" &&
      event.behaviour === "move_to",
  ),
  "Follow target controlled demo must move the relationship target.",
);
const followActors = directorObjectMotionFidelityFixtureActors(
  followCapability,
);
const followPrimary = actorById(followActors, "primary_subject");
const followSecondary = actorById(followActors, "secondary_subject");
const followA = sampleTuple(
  followMoment,
  followPrimary,
  followActors,
  0.4,
);
const followATarget = sampleTuple(
  followMoment,
  followSecondary,
  followActors,
  0.4,
);
const followB = sampleTuple(
  followMoment,
  followPrimary,
  followActors,
  0.85,
);
const followBTarget = sampleTuple(
  followMoment,
  followSecondary,
  followActors,
  0.85,
);
assert(
  distance(
    relativeOffset(followA, followATarget),
    relativeOffset(followB, followBTarget),
  ) < 1e-6,
  "Follow target did not preserve its target-relative offset while the target moved.",
);
assert(
  distance(followATarget.position, followBTarget.position) > 0.5,
  "Follow target proof did not actually exercise a moving target.",
);

const attachCapability = capability("attach");
const attachMoment = directorCapabilityDemoMoment(attachCapability);
assert(
  attachMoment.events.some(
    (event) =>
      event.actor_entity_id === "secondary_subject" &&
      event.behaviour === "move_to",
  ),
  "Attach controlled demo must move the relationship target.",
);
const attachActors = directorObjectMotionFidelityFixtureActors(
  attachCapability,
);
const attachPrimary = actorById(attachActors, "primary_subject");
const attachSecondary = actorById(attachActors, "secondary_subject");
const attachLateA = sampleTuple(
  attachMoment,
  attachPrimary,
  attachActors,
  0.75,
);
const attachLateATarget = sampleTuple(
  attachMoment,
  attachSecondary,
  attachActors,
  0.75,
);
const attachLateB = sampleTuple(
  attachMoment,
  attachPrimary,
  attachActors,
  0.95,
);
const attachLateBTarget = sampleTuple(
  attachMoment,
  attachSecondary,
  attachActors,
  0.95,
);
assert(
  distance(
    relativeOffset(attachLateA, attachLateATarget),
    relativeOffset(attachLateB, attachLateBTarget),
  ) < 1e-6,
  "Attach did not preserve bound target-relative offset after its approach phase.",
);
const attachCompilation = compileDirectorActorMotionProgram(
  attachMoment,
  attachPrimary,
  attachActors,
);
assert(attachCompilation.program, "Attach did not compile.");
assert(
  attachCompilation.program.tracks.length === 2,
  `Attach should compose approach + bound tracks; found ${attachCompilation.program.tracks.length}.`,
);
assert(
  attachCompilation.program.state_effects.some(
    (effect) =>
      effect.kind === "attachment_state" &&
      effect.parameters.state === "attached",
  ),
  "Attach is missing its declared attachment state effect.",
);
assert(
  attachCompilation.recipe_ids[0] !==
    DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.follow_target,
  "Attach and Follow target still compile to the same semantic recipe id.",
);

const detachCapability = capability("detach");
const detachBaseMoment = directorCapabilityDemoMoment(detachCapability);
const detachActors = directorObjectMotionFidelityFixtureActors(
  detachCapability,
);
const detachPrimary = actorById(detachActors, "primary_subject");
const movingTargetEvent: DirectorEvent = {
  id: "phase1b4_3_detach_target_moves",
  behaviour: "move_to",
  actor_entity_id: "secondary_subject",
  target_entity_id: null,
  supporting_entity_ids: ["primary_subject"],
  start_ms: 450,
  duration_ms: 4700,
  easing: "ease_in_out",
  path_hint: "detach independence proof",
  description: "Move target after release.",
  parameters: { target_position: [4.8, 0.4, -2.2] },
  fallback_behaviour: null,
};
const movingDetachMoment: DirectorMoment = {
  ...detachBaseMoment,
  id: `${detachBaseMoment.id}_moving_target`,
  events: [movingTargetEvent, ...detachBaseMoment.events],
};
const alternateMovingDetachMoment: DirectorMoment = {
  ...detachBaseMoment,
  id: `${detachBaseMoment.id}_alternate_target`,
  events: [
    {
      ...movingTargetEvent,
      id: "phase1b4_3_detach_target_moves_elsewhere",
      parameters: { target_position: [-4.5, 1.2, 3.1] },
    },
    ...detachBaseMoment.events,
  ],
};
const detachEndA = sampleTuple(
  movingDetachMoment,
  detachPrimary,
  detachActors,
  0.95,
);
const detachEndB = sampleTuple(
  alternateMovingDetachMoment,
  detachPrimary,
  detachActors,
  0.95,
);
assert(
  distance(detachEndA.position, detachEndB.position) < 1e-6,
  "Detach still inherits target movement after the release origin is latched.",
);

const aimCapability = capability("aim_at");
const alignCapability = capability("align");
const aimMoment = directorCapabilityDemoMoment(aimCapability);
const alignMoment = directorCapabilityDemoMoment(alignCapability);
const aimActors = directorObjectMotionFidelityFixtureActors(aimCapability);
const alignActors = directorObjectMotionFidelityFixtureActors(alignCapability);
const aimEnd = sampleTuple(
  aimMoment,
  actorById(aimActors, "primary_subject"),
  aimActors,
  0.95,
);
const alignEnd = sampleTuple(
  alignMoment,
  actorById(alignActors, "primary_subject"),
  alignActors,
  0.95,
);
assert(
  Math.abs(aimEnd.rotation[1] - alignEnd.rotation[1]) >
    Math.PI / 4,
  "Aim at and Align still collapse to effectively the same yaw result in the controlled fixture.",
);

const hingeCapability = capability("hinge");
const hingeMoment = directorCapabilityDemoMoment(hingeCapability);
const hingeActors = directorObjectMotionFidelityFixtureActors(hingeCapability);
const hingePrimary = actorById(hingeActors, "primary_subject");
const hingeCompilation = compileDirectorActorMotionProgram(
  hingeMoment,
  hingePrimary,
  hingeActors,
);
assert(hingeCompilation.program, "Hinge did not compile.");
const hingeTrack = hingeCompilation.program.tracks.find(
  (track) => track.operation === "rotate_around_anchor",
);
assert(
  hingeTrack?.operation === "rotate_around_anchor",
  "Hinge did not compile to the generalized rotate-around-anchor primitive.",
);
const hingeContext = {
  sample_entity_state: (
    entityId: string,
    progress: number,
  ): MotionProgramInitialState | null => {
    const target = hingeActors.find((actor) => actor.id === entityId);
    if (!target) return null;
    const sampled = sampleTuple(
      hingeMoment,
      target,
      hingeActors,
      progress,
    );
    return sampled;
  },
};
const hingeEnd = sampleCompiledDirectorActorMotionProgram(
  hingeCompilation,
  1,
  hingeContext,
);
assert(hingeEnd, "Hinge sampling failed.");
const hingeAnchor = hingeTrack.parameters.anchor;
const hingeOrigin = hingeTrack.parameters.origin;
assert(
  Math.abs(
    distance(hingeEnd.position, hingeAnchor) -
      distance(hingeOrigin, hingeAnchor),
  ) < 1e-6,
  "Hinge failed to preserve radius around its declared/fallback anchor.",
);
assert(
  hingeCompilation.program.requirements.some(
    (requirement) =>
      requirement.semantic_name === "hinge_anchor" &&
      requirement.runtime_status === "declared",
  ),
  "Hinge is missing its honest unresolved asset-anchor requirement.",
);

const openReport = buildDirectorObjectMotionFidelityReport(
  capability("object_open"),
);
const closeReport = buildDirectorObjectMotionFidelityReport(
  capability("object_close"),
);
assert(openReport?.motion_program.program, "Open program missing.");
assert(closeReport?.motion_program.program, "Close program missing.");
assert(
  openReport.motion_program.program.state_effects.some(
    (effect) =>
      effect.kind === "articulation_state" &&
      effect.parameters.state === "open",
  ),
  "Open is missing declared open state.",
);
assert(
  closeReport.motion_program.program.state_effects.some(
    (effect) =>
      effect.kind === "articulation_state" &&
      effect.parameters.state === "closed",
  ),
  "Close is missing declared closed state.",
);
const closeCapability = capability("object_close");
const closeMoment = directorCapabilityDemoMoment(closeCapability);
const closeActors = directorObjectMotionFidelityFixtureActors(closeCapability);
const closePrimary = actorById(closeActors, "primary_subject");
const closeStart = sampleTuple(
  closeMoment,
  closePrimary,
  closeActors,
  0,
);
const closeEnd = sampleTuple(
  closeMoment,
  closePrimary,
  closeActors,
  1,
);
assert(
  distance(closeStart.position, closePrimary.position) > 0.1,
  "Close did not expose its open pre-state before the transition.",
);
assert(
  distance(closeEnd.position, closePrimary.position) < 1e-6,
  "Close did not return to the closed/base pose.",
);

const slideCapability = capability("slide");
const slideMoment = directorCapabilityDemoMoment(slideCapability);
const slideActors = directorObjectMotionFidelityFixtureActors(slideCapability);
const slidePrimary = actorById(slideActors, "primary_subject");
const rotatedSlidePrimary: DirectorMotionProgramActor = {
  ...slidePrimary,
  rotation: [0, Math.PI / 2, 0],
};
const rotatedSlideActors = slideActors.map((actor) =>
  actor.id === rotatedSlidePrimary.id
    ? rotatedSlidePrimary
    : actor,
);
const slideCompilation = compileDirectorActorMotionProgram(
  slideMoment,
  rotatedSlidePrimary,
  rotatedSlideActors,
);
const slideEnd = sampleCompiledDirectorActorMotionProgram(
  slideCompilation,
  1,
);
assert(slideEnd, "Slide sampling failed.");
const slideDelta = [
  slideEnd.position[0] - rotatedSlidePrimary.position[0],
  slideEnd.position[1] - rotatedSlidePrimary.position[1],
  slideEnd.position[2] - rotatedSlidePrimary.position[2],
] as [number, number, number];
assert(
  Math.abs(slideDelta[2]) > 1.5 &&
    Math.abs(slideDelta[0]) < 0.05,
  `Slide did not honor actor-local rail direction after a 90-degree yaw: ${JSON.stringify(slideDelta)}.`,
);

const rollCapability = capability("roll");
const rollMoment = directorCapabilityDemoMoment(rollCapability);
const rollActors = directorObjectMotionFidelityFixtureActors(rollCapability);
const rollPrimary = actorById(rollActors, "primary_subject");
const rollCompilation = compileDirectorActorMotionProgram(
  rollMoment,
  rollPrimary,
  rollActors,
);
const rollEnd = sampleCompiledDirectorActorMotionProgram(
  rollCompilation,
  1,
);
assert(rollCompilation.program && rollEnd, "Roll did not compile/sample.");
assert(
  rollCompilation.program.tracks.length === 2,
  "Roll should compile to parallel translation + orientation tracks.",
);
const rollTravel = distance(rollEnd.position, rollPrimary.position);
const rollRadius = Math.max(
  0.05,
  Math.min(...rollPrimary.size) * 0.5,
);
assert(
  Math.abs(Math.abs(rollEnd.rotation[2]) - rollTravel / rollRadius) <
    1e-6,
  `Roll angular distance is not coupled to travel/radius: travel=${rollTravel}, radius=${rollRadius}, rotation=${rollEnd.rotation[2]}.`,
);

const repeatA = sampleTuple(
  followMoment,
  followPrimary,
  followActors,
  0.73,
);
sampleTuple(followMoment, followPrimary, followActors, 0.21);
sampleTuple(followMoment, followPrimary, followActors, 0.94);
const repeatB = sampleTuple(
  followMoment,
  followPrimary,
  followActors,
  0.73,
);
assert(
  distance(repeatA.position, repeatB.position) < 1e-9 &&
    distance(repeatA.rotation, repeatB.rotation) < 1e-9,
  "Random-access sampling depends on evaluation history.",
);

const mixedMoment: DirectorMoment = {
  ...attachMoment,
  id: `${attachMoment.id}_mixed_unsupported`,
  events: [
    ...attachMoment.events,
    {
      id: "phase1b4_3_mixed_flow",
      behaviour: "flow",
      actor_entity_id: "primary_subject",
      target_entity_id: null,
      supporting_entity_ids: [],
      start_ms: 1200,
      duration_ms: 1800,
      easing: "linear",
      path_hint: null,
      description: "Intentional unsupported mixed-event safety proof.",
      parameters: {},
      fallback_behaviour: "move_to",
    },
  ],
};
const mixedCompilation = compileDirectorActorMotionProgram(
  mixedMoment,
  attachPrimary,
  attachActors,
);
assert(
  mixedCompilation.route === "legacy_required",
  "Mixed unsupported actor motion must still fail closed to the complete legacy path.",
);

for (const behaviour of [
  "follow_target",
  "attach",
  "detach",
  "align",
  "aim_at",
  "hinge",
  "open",
  "close",
  "slide",
  "roll",
] as const) {
  assert(
    DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE[behaviour].owner ===
      "motion_program_sampler",
    `${behaviour} runtime coverage did not move to the Phase 1B.4.3 MotionProgram owner.`,
  );
}
assert(
  DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE.target_relative.owner ===
    "motion_program_sampler",
  "target_relative runtime coverage is not owned by the strengthened MotionProgram sampler.",
);

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] =
      (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  JSON.stringify(supportCounts) ===
    JSON.stringify({
      direct: 101,
      compound: 65,
      approximate: 15,
      declared: 2,
    }),
  `Phase 1B.4.3 must not silently promote support classifications: ${JSON.stringify(supportCounts)}.`,
);

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "Phase 1B.4.3 adapter seam",
  "sampleDirectorActorEventStateWithStack",
  "sample_entity_state:",
  "nextStack.has(entityId)",
  "return sampleDirectorActorEventStateLegacy(",
]) {
  assert(
    runtime.includes(marker),
    `Phase 1B.4.3 runtime integration marker missing: ${marker}.`,
  );
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
for (const marker of [
  'capability.id === "follow_target" || capability.id === "attach"',
  "moving relationship target",
]) {
  assert(
    registry.includes(marker),
    `Phase 1B.4.3 controlled moving-target demo marker missing: ${marker}.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "Phase 1B.4.3 relational/articulation recipe",
  "diagnostics.recipe_ids",
  "Phase 1B.4.3 recipe strengthened",
]) {
  assert(
    library.includes(marker),
    `Capability Library recipe inspector marker missing: ${marker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Phase 1B.4.3 must not add a second WebGL Canvas to the capability library shell.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
const phaseHeading =
  "## Phase 1B.4.3 — relational + articulation motion recipes";
const phaseStart = readme.indexOf(phaseHeading);
assert(phaseStart >= 0, "Motion Camera README is missing Phase 1B.4.3 section.");
const phaseTail = readme.slice(phaseStart + phaseHeading.length);
const nextHeading = phaseTail.indexOf("\n## ");
const phaseSection =
  nextHeading >= 0 ? phaseTail.slice(0, nextHeading) : phaseTail;
for (const concept of [
  "Follow target",
  "Attach",
  "Detach",
  "Aim at",
  "Align",
  "Hinge",
  "Open",
  "Close",
  "Slide",
  "Roll",
  "target",
  "distance/radius",
  "Phase 1B.4.4",
]) {
  assert(
    phaseSection.includes(concept),
    `Phase 1B.4.3 README section is missing documented concept: ${concept}.`,
  );
}

console.log(
  "Director relational + articulation motion recipes Phase 1B.4.3 verification passed.",
);
console.log(
  "Follow/Attach/Detach moving-target semantics, Aim-vs-Align axis separation, hinge/open/close recipes, Slide local rail, and Roll distance/radius coupling passed.",
);
console.log(
  "Random-access determinism and the four Phase 1B.4.2 frozen canaries remain intact; unresolved multi-actor/process overlaps remain explicitly unqualified.",
);
console.log(
  "Articulation stays declared-not-executed as a subpart channel, support classifications remain unchanged, and the Capability Library still owns zero direct Canvas elements.",
);
