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
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
  directorObjectMotionFidelityFixtureActors,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  compileDirectorActorMotionProgram,
} from "../../sandbox/probe-lab/motion-program/director-motion-program-compiler";
import {
  DIRECTOR_SCENE_STATE_SCHEMA_VERSION,
  createDirectorSceneState,
  directorSceneStateActorVisible,
} from "../../sandbox/probe-lab/motion-program/director-scene-state";
import {
  directorSceneStateBeforeMoment,
  reduceDirectorMomentSceneState,
  reduceDirectorMomentToSceneState,
  reduceDirectorMomentsToSceneState,
  sampleDirectorActorInMomentFromSceneState,
} from "../../sandbox/probe-lab/motion-program/director-scene-state-reducer";
import {
  MOTION_PROGRAM_SCENE_STATE_VERSION,
} from "../../sandbox/probe-lab/motion-program/motion-program-contract";
import {
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
  DIRECTOR_CONTINUITY_RUNTIME_COVERAGE,
  DIRECTOR_RUNTIME_OWNERS,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const result = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(result, `Missing Director capability: ${id}.`);
  return result;
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

function actorState(
  state: ReturnType<typeof createDirectorSceneState>,
  actorId = "primary_subject",
) {
  const result = state.actors[actorId];
  assert(result, `Missing actor scene state: ${actorId}.`);
  return result;
}

function holdMoment(sourceMoment: DirectorMoment, id: string): DirectorMoment {
  return {
    ...sourceMoment,
    id,
    title: `${sourceMoment.title} hold`,
    events: [],
  };
}

function stateEventMoment(
  sourceMoment: DirectorMoment,
  behaviour: "show" | "hide",
  id: string,
): DirectorMoment {
  const template = sourceMoment.events[0];
  assert(template, "State-event fixture needs one template event.");
  const event: DirectorEvent = {
    ...template,
    id: `${id}_${behaviour}`,
    behaviour,
    actor_entity_id: "primary_subject",
    target_entity_id: null,
    supporting_entity_ids: [],
    start_ms: 300,
    duration_ms: 700,
    easing: "linear",
    path_hint: null,
    description: `${behaviour} persistence fixture`,
    parameters: {},
    fallback_behaviour: null,
  };
  return {
    ...sourceMoment,
    id,
    title: `${behaviour} fixture`,
    events: [event],
  };
}

function targetMoveOnlyMoment(
  sourceMoment: DirectorMoment,
  id: string,
  targetPosition: [number, number, number],
): DirectorMoment {
  const targetTemplate = sourceMoment.events.find(
    (event) => event.actor_entity_id === "secondary_subject",
  );
  assert(targetTemplate, "Moving-target fixture is missing its target event.");
  return {
    ...sourceMoment,
    id,
    title: `${sourceMoment.title} target move`,
    events: [
      {
        ...targetTemplate,
        id: `${id}_target_move`,
        parameters: {
          ...targetTemplate.parameters,
          target_position: targetPosition,
        },
      },
    ],
  };
}

assert(
  DIRECTOR_SCENE_STATE_SCHEMA_VERSION ===
    "director_scene_state_phase1b4_4_v1",
  "Unexpected DirectorSceneState schema version.",
);
assert(
  MOTION_PROGRAM_SCENE_STATE_VERSION ===
    "director_scene_state_phase1b4_4_v1",
  "MotionProgram scene-state version drifted from the canonical reducer version.",
);
assert(
  directorSceneStateActorVisible(createDirectorSceneState([]), "missing_actor") === true,
  "DirectorSceneState visibility accessor export is unavailable or its default changed.",
);

// Pose continuity: completed Translate and Rotate become the next moment's base.
for (const id of ["translate", "rotate"] as const) {
  const cap = capability(id);
  const moment = directorCapabilityDemoMoment(cap);
  const actors = directorObjectMotionFidelityFixtureActors(cap);
  const initial = createDirectorSceneState(actors);
  const afterMotion = reduceDirectorMomentToSceneState(
    moment,
    actors,
    initial,
  );
  const afterHold = reduceDirectorMomentToSceneState(
    holdMoment(moment, `${moment.id}_hold`),
    actors,
    afterMotion,
  );
  const moved = actorState(afterMotion);
  const held = actorState(afterHold);
  assert(
    distance(moved.position, held.position) < 1e-9,
    `${id} position did not persist into the next hold moment.`,
  );
  assert(
    distance(moved.rotation, held.rotation) < 1e-9,
    `${id} rotation did not persist into the next hold moment.`,
  );
}

// Articulation continuity: Open persists, Hold does not reset it, Close begins
// exactly from the incoming open pose and reduces back to canonical closed state.
const openCapability = capability("object_open");
const openMoment = directorCapabilityDemoMoment(openCapability);
const openActors = directorObjectMotionFidelityFixtureActors(openCapability);
const openInitial = createDirectorSceneState(openActors);
const afterOpen = reduceDirectorMomentToSceneState(
  openMoment,
  openActors,
  openInitial,
);
const openActorState = actorState(afterOpen);
assert(
  openActorState.articulation_state?.openness === 1,
  "Open did not persist normalized openness=1.",
);
const openHold = holdMoment(openMoment, `${openMoment.id}_state_hold`);
const afterOpenHold = reduceDirectorMomentToSceneState(
  openHold,
  openActors,
  afterOpen,
);
assert(
  actorState(afterOpenHold).articulation_state?.openness === 1,
  "Open articulation state reset during a hold moment.",
);
assert(
  distance(actorState(afterOpenHold).position, openActorState.position) < 1e-9,
  "Open world pose reset during a hold moment.",
);

const closeMoment = directorCapabilityDemoMoment(capability("object_close"));
const closeStart = sampleDirectorActorInMomentFromSceneState(
  closeMoment,
  "primary_subject",
  0,
  openActors,
  afterOpenHold,
);
assert(closeStart, "Close could not sample from incoming Open state.");
assert(
  distance(closeStart.position, actorState(afterOpenHold).position) < 1e-6,
  "Close did not begin from the actual incoming open pose.",
);
const afterClose = reduceDirectorMomentToSceneState(
  closeMoment,
  openActors,
  afterOpenHold,
);
assert(
  actorState(afterClose).articulation_state?.openness === 0,
  "Close did not persist normalized openness=0.",
);
assert(
  distance(actorState(afterClose).position, actorState(openInitial).position) < 1e-6,
  "Close did not return to the canonical closed position.",
);
assert(
  distance(actorState(afterClose).rotation, actorState(openInitial).rotation) < 1e-6,
  "Close did not return to the canonical closed rotation.",
);

// Attachment continuity: Attach persists as a relation. A later moment moves only
// the target, and the attached actor still follows via the stored offset.
const attachCapability = capability("attach");
const attachMoment = directorCapabilityDemoMoment(attachCapability);
const attachActors = directorObjectMotionFidelityFixtureActors(attachCapability);
const attachInitial = createDirectorSceneState(attachActors);
const afterAttach = reduceDirectorMomentToSceneState(
  attachMoment,
  attachActors,
  attachInitial,
);
const attached = actorState(afterAttach);
assert(
  attached.attachment_state?.target_entity_id === "secondary_subject",
  "Attach did not persist its target relationship.",
);
const attachmentOffset = attached.attachment_state?.offset_position;
assert(attachmentOffset, "Attach did not persist its target-relative offset.");

const laterTargetMove = targetMoveOnlyMoment(
  attachMoment,
  `${attachMoment.id}_later_target_move`,
  [4.4, 0.65, -1.8],
);
const afterLaterTargetMove = reduceDirectorMomentToSceneState(
  laterTargetMove,
  attachActors,
  afterAttach,
);
const laterPrimary = actorState(afterLaterTargetMove);
const laterTarget = actorState(afterLaterTargetMove, "secondary_subject");
const expectedAttachedPosition: [number, number, number] = [
  laterTarget.position[0] + attachmentOffset[0],
  laterTarget.position[1] + attachmentOffset[1],
  laterTarget.position[2] + attachmentOffset[2],
];
assert(
  distance(laterPrimary.position, expectedAttachedPosition) < 1e-6,
  `Persistent attachment did not follow the later moving target: expected ${JSON.stringify(expectedAttachedPosition)}, found ${JSON.stringify(laterPrimary.position)}.`,
);

// Detach clears the relation, preserves the released result, and later target
// travel no longer pulls the actor along.
const detachMoment = directorCapabilityDemoMoment(capability("detach"));
const afterDetach = reduceDirectorMomentToSceneState(
  detachMoment,
  attachActors,
  afterLaterTargetMove,
);
const detached = actorState(afterDetach);
assert(
  detached.attachment_state === null,
  "Detach did not clear the persistent attachment relation.",
);
const detachedPosition = [...detached.position] as [number, number, number];
const postDetachTargetMove = targetMoveOnlyMoment(
  attachMoment,
  `${attachMoment.id}_post_detach_target_move`,
  [-3.7, 0.2, 2.3],
);
const afterPostDetachMove = reduceDirectorMomentToSceneState(
  postDetachTargetMove,
  attachActors,
  afterDetach,
);
assert(
  distance(actorState(afterPostDetachMove).position, detachedPosition) < 1e-6,
  "Detached actor inherited target motion in a later moment.",
);

// Visibility is state, not fake geometry/scale. Hide persists through a hold until Show.
const visibilityBase = directorCapabilityDemoMoment(capability("translate"));
const visibilityActors = directorObjectMotionFidelityFixtureActors(
  capability("translate"),
);
const visibilityInitial = createDirectorSceneState(visibilityActors);
const hideMoment = stateEventMoment(
  visibilityBase,
  "hide",
  "phase1b4_4_hide",
);
const afterHide = reduceDirectorMomentToSceneState(
  hideMoment,
  visibilityActors,
  visibilityInitial,
);
assert(!actorState(afterHide).visible, "Hide did not persist visible=false.");
const afterHiddenHold = reduceDirectorMomentToSceneState(
  holdMoment(visibilityBase, "phase1b4_4_hidden_hold"),
  visibilityActors,
  afterHide,
);
assert(
  !actorState(afterHiddenHold).visible,
  "Hidden state reset during a later hold moment.",
);
const showMoment = stateEventMoment(
  visibilityBase,
  "show",
  "phase1b4_4_show",
);
const afterShow = reduceDirectorMomentToSceneState(
  showMoment,
  visibilityActors,
  afterHiddenHold,
);
assert(actorState(afterShow).visible, "Show did not persist visible=true.");

// Reducers must be pure: input snapshots are never mutated and repeated/random-access
// reconstruction returns byte-equivalent canonical JSON.
const immutableInput = createDirectorSceneState(openActors);
const immutableBefore = JSON.stringify(immutableInput);
reduceDirectorMomentSceneState(openMoment, openActors, immutableInput);
assert(
  JSON.stringify(immutableInput) === immutableBefore,
  "Scene-state reduction mutated its incoming snapshot.",
);

const sequence = [openMoment, openHold, closeMoment];
const firstTimeline = reduceDirectorMomentsToSceneState(
  sequence,
  openActors,
  openInitial,
);
const secondTimeline = reduceDirectorMomentsToSceneState(
  sequence,
  openActors,
  openInitial,
);
assert(
  JSON.stringify(firstTimeline.final_state) ===
    JSON.stringify(secondTimeline.final_state),
  "Repeated scene-state reconstruction is not deterministic.",
);
const beforeCloseDirect = directorSceneStateBeforeMoment(
  sequence,
  2,
  openActors,
  openInitial,
);
assert(
  JSON.stringify(beforeCloseDirect) ===
    JSON.stringify(firstTimeline.moment_results[1]!.outgoing_state),
  "Random-access state reconstruction before Moment N differs from sequential reduction.",
);

// Unsupported legacy motion remains honest: state reduction does not fabricate a
// persistent transform for a behaviour that still belongs to a later lane.
const spinCapability = capability("spin");
const spinMoment = directorCapabilityDemoMoment(spinCapability);
const spinActors = directorObjectMotionFidelityFixtureActors(spinCapability);
const spinInitial = createDirectorSceneState(spinActors);
const spinReduction = reduceDirectorMomentSceneState(
  spinMoment,
  spinActors,
  spinInitial,
);
const spinResult = spinReduction.actor_results.find(
  (result) => result.actor_id === "primary_subject",
);
assert(spinResult, "Spin scene-state result missing.");
assert(
  spinResult.route === "legacy_required",
  `Spin must remain legacy_required, found ${spinResult.route}.`,
);
assert(
  distance(
    actorState(spinReduction.outgoing_state).position,
    actorState(spinInitial).position,
  ) < 1e-9,
  "Phase 1B.4.4 invented persistent Spin transform state.",
);

// Supported state effects are carried inside MotionProgram rather than being hidden
// renderer mutations.
const attachResolvedActors = attachActors.map((actor) => ({ ...actor }));
const attachCompilation = compileDirectorActorMotionProgram(
  attachMoment,
  attachResolvedActors.find((actor) => actor.id === "primary_subject")!,
  attachResolvedActors,
);
assert(attachCompilation.program, "Attach MotionProgram disappeared.");
assert(
  attachCompilation.program.state_effects.some(
    (effect) =>
      effect.kind === "attachment_state" &&
      effect.runtime_status === "supported" &&
      effect.parameters.persistence_scope === "cross_moment_scene_state",
  ),
  "Attach is missing its supported cross-moment state effect.",
);
const openCompilation = compileDirectorActorMotionProgram(
  openMoment,
  openActors.find((actor) => actor.id === "primary_subject")!,
  openActors,
);
assert(openCompilation.program, "Open MotionProgram disappeared.");
assert(
  openCompilation.program.state_effects.some(
    (effect) =>
      effect.kind === "articulation_state" &&
      effect.runtime_status === "supported" &&
      effect.parameters.openness === 1,
  ),
  "Open is missing supported normalized articulation state.",
);

// Existing qualified canaries remain frozen.
for (const id of DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES) {
  const report = buildDirectorObjectMotionFidelityReport(capability(id));
  assert(report, `${id} fidelity report missing.`);
  assert(
    report.qualification_state === "frozen_canary",
    `${id} lost frozen-canary qualification.`,
  );
  assert(
    report.motion_program.legacy_equivalence?.passed === true,
    `${id} lost MotionProgram legacy equivalence.`,
  );
}

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
  `Phase 1B.4.4 must not promote support classifications: ${JSON.stringify(supportCounts)}.`,
);

assert(
  DIRECTOR_RUNTIME_OWNERS.includes("scene_state_reducer"),
  "Runtime coverage does not recognize the scene-state reducer owner.",
);
assert(
  DIRECTOR_CONTINUITY_RUNTIME_COVERAGE.preserve_actor_state.owner ===
    "scene_state_reducer",
  "preserve_actor_state is not owned by the deterministic scene-state reducer.",
);
assert(
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE.show.owner === "scene_state_reducer" &&
    DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE.hide.owner === "scene_state_reducer",
  "Show/Hide persistent visibility state is not owned by the scene-state reducer.",
);

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "Phase 1B.4.3 adapter seam",
  "directorSceneStateActorVisible",
  "resolveDirectorActorWithSceneState",
  "sceneState?: DirectorSceneState | null",
  "sampleDirectorActorStateAcrossMoments",
  "directorSceneStateBeforeMoment",
]) {
  assert(
    runtime.includes(marker),
    `Phase 1B.4.4 runtime integration marker missing: ${marker}.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "buildDirectorSceneStateInspectorSnapshot",
  "scene_state_continuity",
  "Scene state continuity",
  "Phase 1B.4.4 immutable incoming/outgoing snapshots",
]) {
  assert(
    library.includes(marker),
    `Capability Library scene-state inspector marker missing: ${marker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Phase 1B.4.4 must not add a WebGL Canvas to the capability-library shell.",
);

const motionReadme = source("sandbox/probe-lab/motion-program/README.md");
const motionSectionStart = motionReadme.indexOf(
  "## Phase 1B.4.4 — scene state + cross-moment continuity",
);
assert(motionSectionStart >= 0, "MotionProgram README is missing Phase 1B.4.4.");
const motionSection = motionReadme.slice(motionSectionStart);
const normalizedMotionSection = motionSection.toLowerCase().replace(/\s+/g, " ");
for (const marker of [
  "DirectorSceneState",
  "reduceDirectorMomentSceneState()",
  "reduceDirectorMomentsToSceneState()",
  "visibility",
  "attachment",
  "openness",
  "unsupported legacy transform semantics",
]) {
  const normalizedMarker = marker.toLowerCase().replace(/\s+/g, " ");
  assert(
    normalizedMotionSection.includes(normalizedMarker),
    `MotionProgram Phase 1B.4.4 documentation is missing concept: ${marker}.`,
  );
}

console.log(
  "Director scene state + cross-moment continuity Phase 1B.4.4 verification passed.",
);
console.log(
  "Pose, visibility, attachment, and normalized articulation state persist through deterministic immutable snapshots.",
);
console.log(
  "Open→Hold→Close, Attach→later target motion→Detach, Hide→Hold→Show, input immutability, and random-access reconstruction passed.",
);
console.log(
  "Phase 1B.4.2/1B.4.3 canaries remain intact; unsupported legacy motion and support classifications remain honest across later strengthening phases.",
);
