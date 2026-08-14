import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DirectorEvent,
  DirectorMoment,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  compileDirectorActorMotionProgram,
  sampleCompiledDirectorActorMotionProgram,
} from "../../sandbox/probe-lab/motion-program/director-motion-program-compiler";
import {
  directorSceneStateBeforeMoment,
} from "../../sandbox/probe-lab/motion-program/director-scene-state-reducer";
import {
  resolveDirectorActorWithSceneState,
  type DirectorSceneStateActor,
} from "../../sandbox/probe-lab/motion-program/director-scene-state";
import {
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(left: number, right: number, tolerance = 1e-6) {
  return Math.abs(left - right) <= tolerance;
}

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function normalizedProse(value: string) {
  return value
    .replace(/^[ \t]*\* ?/gm, "")
    .replace(/^[ \t]*\/\*\*? ?/gm, "")
    .replace(/^[ \t]*\/\/ ?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function event(
  id: string,
  behaviour: DirectorEvent["behaviour"],
  actorId: string,
  targetId: string | null,
  parameters: Record<string, unknown> = {},
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

function moment(id: string, events: DirectorEvent[]): DirectorMoment {
  return {
    id,
    title: id,
    learning_job: id,
    director_intent: id,
    source_explanation_piece_ids: [],
    duration_ms: 1000,
    introduces_entity_ids: [],
    keeps_visible_entity_ids: [],
    active_entity_ids: ["actor", "target"],
    camera: {
      shot_type: "medium",
      movement: "static",
      focus_entity_ids: ["actor"],
      framing_intent: id,
      keep_visible_entity_ids: ["actor"],
    },
    events,
    text_cues: [],
  };
}

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  DIRECTOR_CAPABILITIES.length === 183 &&
    supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.5A must not silently promote support: ${JSON.stringify(supportCounts)}.`,
);

// Roll must couple +X translation to clockwise / negative-Z rotation for a
// ground-supported wheel when the Director does not explicitly override turns.
const rollActor: DirectorSceneStateActor = {
  id: "actor",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  size: [1.08, 1.08, 0.34],
};
const rollMoment = moment("roll-proof", [
  event("roll", "roll", "actor", null, {
    direction: [1, 0, 0],
    distance_m: 2.4,
    axis: "z",
  }),
]);
const rollCompilation = compileDirectorActorMotionProgram(
  rollMoment,
  rollActor,
  [rollActor],
);
assert(rollCompilation.route === "motion_program", "Roll must stay on the MotionProgram route.");
const rollEnd = sampleCompiledDirectorActorMotionProgram(rollCompilation, 1);
assert(rollEnd, "Roll must produce a deterministic final sample.");
assert(approx(rollEnd.position[0], 2.4), `Roll should translate 2.4 m in +X, got ${rollEnd.position[0]}.`);
assert(
  rollEnd.rotation[2] < -4,
  `+X Roll around +Z must rotate clockwise/negative Z; got ${rollEnd.rotation[2]}.`,
);
assert(
  approx(rollEnd.position[1], 0),
  `Roll root must remain on its authored floor contact height; got y=${rollEnd.position[1]}.`,
);

// Cross-moment proof: an attachment made in moment 1 is supplied as incoming
// state to moment 2 and follows the target's current sampled motion.
const stateActors: DirectorRuntimeActor[] = [
  { id: "actor", position: [0, 0, 0], rotation: [0, 0, 0], size: [1, 1, 1] },
  { id: "target", position: [1, 0, 0], rotation: [0, 0, 0], size: [1, 1, 1] },
];
const attachMoment = moment("attach", [
  event("attach", "attach", "actor", "target", { offset: [0, 1, 0] }),
]);
const moveMoment = moment("move-target", [
  event("move-target", "move_to", "target", null, { target_position: [4, 0, 0] }),
]);
const incoming = directorSceneStateBeforeMoment(
  [attachMoment, moveMoment],
  1,
  stateActors,
);
const attachedResolved = resolveDirectorActorWithSceneState(stateActors[0]!, incoming);
assert(
  attachedResolved.attachment_state?.target_entity_id === "target",
  "Incoming scene state must retain the prior attachment relation.",
);
const attachedEnd = sampleDirectorActorState(
  moveMoment,
  stateActors[0]!,
  1,
  stateActors,
  incoming,
);
assert(
  attachedEnd.position.x > 3.5 && attachedEnd.position.y > 0.75,
  `Incoming attachment must follow target motion in the current moment; got ${attachedEnd.position.toArray().join(", ")}.`,
);

const preview = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  'capabilityId === "roll"',
  "rollVisualPivotY",
  "rotate the rendered body around its visual centre",
  "position={[0, 0.54, 0]}",
  "Open vessel",
  "Shallow receiving tray",
  "Source/nozzle fixture for Flow and Emit",
  'capabilityId !== "flow"',
  'capabilityId === "emit"',
  "process-level-",
]) {
  assert(preview.includes(marker), `Phase 1B.5A capability visual marker missing: ${marker}.`);
}
assert(
  !preview.includes("<Canvas"),
  "Capability preview must not introduce another Canvas/WebGL owner.",
);
const visualAudit = read(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
assert(
  visualAudit.includes('"lower", "expand", "contract"') &&
    visualAudit.includes('return "object_motion_rigid"') &&
    visualAudit.includes('capabilityId === "lower"') &&
    visualAudit.includes('position: [layout.position[0], 1.05, layout.position[2]]'),
  "Expand/Contract must use a rigid scale-readable fixture rather than the process nozzle fixture.",
);

const registry = read(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
assert(
  registry.includes('capability.id === "lift" || capability.id === "lower"') &&
    registry.includes("parameters.distance_m = 1.0"),
  "Lift/Lower controlled demos must keep both vertical endpoints inside the teaching frame.",
);

const recipes = read("sandbox/probe-lab/motion-program/director-motion-recipes.ts");
for (const marker of [
  "inferredRollingAxis",
  "rollingRotationSign",
  "n × v",
  "distance / rollingRadius) * rotationSign",
]) {
  assert(recipes.includes(marker), `Roll semantic correction missing: ${marker}.`);
}

const resolvedAsset = read("sandbox/probe-lab/scenes/ui/resolved-asset-model.tsx");
for (const marker of [
  'rotation_pivot?: "bounds_center"',
  "runtimePivotRef",
  "runtimeContentRef",
  "measured bounds centre",
  "group.visible = sampled.visible",
]) {
  assert(resolvedAsset.includes(marker), `Resolved asset roll pivot marker missing: ${marker}.`);
}

const processOverlay = read(
  "sandbox/probe-lab/scenes/ui/director-process-runtime-overlay.tsx",
);
for (const marker of [
  "DirectorProcessRuntimeOverlay",
  "sampleDirectorActorState",
]) {
  assert(processOverlay.includes(marker), `Process runtime overlay marker missing: ${marker}.`);
}
const normalizedProcessOverlay = normalizedProse(processOverlay);
for (const marker of [
  "semantic carriers and compact quantity gauges rather than pretending to simulate liquid, smoke, granular material",
]) {
  assert(
    normalizedProcessOverlay.includes(marker),
    `Process runtime overlay prose marker missing after whitespace normalization: ${marker}.`,
  );
}

const builder = read(
  "sandbox/probe-lab/primitive-builder/ui/primitive-builder-lab.tsx",
);
for (const marker of [
  "directorSceneStateBeforeMoment",
  "incomingDirectorSceneState",
  "DirectorProcessRuntimeOverlay",
  "sceneState={incomingDirectorSceneState}",
  "directabilityDiagnostics",
  "required evidence missing",
  'rotation_pivot: rolls',
  "visible: sampled.visible",
  "Director V2 · stateful runtime",
]) {
  assert(builder.includes(marker), `Primitive Builder convergence marker missing: ${marker}.`);
}

const sharedRuntime = read(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "sceneState?: DirectorSceneState | null",
  "sampleDirectorCameraPose(moment, runtimeProgress, actors, sceneState)",
  "targetActors(moment, shot, p, actors, sceneState)",
]) {
  assert(sharedRuntime.includes(marker), `Shared camera/light state marker missing: ${marker}.`);
}

const visualBridge = read(
  "sandbox/probe-lab/visual-experience/ui/scene-player/shared-director-runtime-adapter.ts",
);
for (const marker of [
  "VISUAL_EXPERIENCE_SHARED_DIRECTOR_BRIDGE_VERSION",
  "directorSceneStateBeforeMoment",
  "sampleDirectorActorState",
  'status: "shared_runtime_shadow"',
]) {
  assert(visualBridge.includes(marker), `Visual Experience convergence bridge missing: ${marker}.`);
}
assert(
  normalizedProse(visualBridge).includes(
    "without replacing Visual Experience rendering or camera behaviour yet",
  ),
  "Visual Experience convergence bridge prose boundary is missing after whitespace normalization.",
);
const visualCanvas = read(
  "sandbox/probe-lab/visual-experience/ui/scene-player/semantic-scene-canvas.tsx",
);
assert(
  visualCanvas.includes("Shared Director bridge") && visualCanvas.includes("buildVisualExperienceSharedDirectorSnapshot"),
  "Visual Experience must expose the shared-runtime shadow bridge for inspection.",
);

const visualQualification = read(
  "sandbox/probe-lab/motion-camera-library/PHASE1B5A_VISUAL_QUALIFICATION.md",
);
for (const marker of [
  "Roll — no floor penetration",
  "Lower — starts elevated",
  "Expand / Contract",
  "Flow — carriers clearly travel",
  "Emit — carriers spread outward",
  "Human review remains",
]) {
  assert(visualQualification.includes(marker), `Visual qualification report missing: ${marker}.`);
}

const capabilityLibrary = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
assert(
  !capabilityLibrary.includes("<Canvas"),
  "Phase 1B.5A must preserve zero direct Canvas elements in the library shell.",
);
const auditViewer = read(
  "sandbox/probe-lab/motion-camera-library/ui/director-audit-viewer.tsx",
);
assert(
  (auditViewer.match(/<Canvas/g) ?? []).length === 1,
  "Phase 1B.5A must preserve exactly one Canvas in the isolated audit viewer.",
);

console.log("Director runtime convergence + visual qualification Phase 1B.5A verification passed.");
console.log("Roll floor-contact/polarity, stateful Builder playback, real-scene process evidence, directability diagnostics, and Visual Experience shadow convergence passed.");
console.log("Camera qualifications, support counts, Builder collision authority, and honest no-physics/no-arbitrary-subpart boundaries remain protected.");
