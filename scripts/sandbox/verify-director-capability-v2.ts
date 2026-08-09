import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_BLOCKING_RELATIONS,
  DIRECTOR_CAMERA_ANGLES,
  DIRECTOR_CAMERA_FRAMINGS,
  DIRECTOR_CAMERA_LENSES,
  DIRECTOR_CAMERA_MOVEMENTS,
  DIRECTOR_CONTINUITY_RULES,
  DIRECTOR_COORDINATE_SPACES,
  DIRECTOR_KINEMATIC_CONSTRAINTS,
  DIRECTOR_LIGHTING_INTENTS,
  DIRECTOR_NARRATIVE_JOBS,
} from "../../sandbox/probe-lab/director";
import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_CAPABILITY_CATEGORIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const ids = DIRECTOR_CAPABILITIES.map((capability) => capability.id);
const uniqueIds = new Set(ids);
assert(
  uniqueIds.size === ids.length,
  `Director capability ids must be unique. Found ${ids.length - uniqueIds.size} duplicate(s).`,
);
assert(
  DIRECTOR_CAPABILITIES.length >= 150,
  `Expected the V2 vocabulary expansion (>=150 capabilities); found ${DIRECTOR_CAPABILITIES.length}.`,
);

for (const category of DIRECTOR_CAPABILITY_CATEGORIES) {
  assert(
    DIRECTOR_CAPABILITIES.some((capability) => capability.category === category),
    `No capability exists for category ${category}.`,
  );
}

for (const capability of DIRECTOR_CAPABILITIES) {
  const fallback = capability.compiler.fallback_capability_id;
  assert(!fallback || uniqueIds.has(fallback), `${capability.id} points to missing fallback ${fallback}.`);
  const moment = directorCapabilityDemoMoment(capability);
  assert(moment.shot, `${capability.id} did not compile to a V2 demo shot.`);
  assert(moment.shot.camera.movement_steps.length >= 1, `${capability.id} has no camera movement step.`);
  assert(Array.isArray(moment.shot.constraints), `${capability.id} did not expose the V2 constraints array.`);
  for (const step of moment.shot.camera.movement_steps) {
    assert(step.start_progress >= 0 && step.start_progress < 1, `${capability.id} has invalid movement start.`);
    assert(step.end_progress > step.start_progress && step.end_progress <= 1, `${capability.id} has invalid movement end.`);
  }
}

for (const requiredId of [
  "reveal",
  "reverse_assumption",
  "change_scale",
  "arc_left",
  "arc_right",
  "dolly",
  "lead_subject",
  "lag_follow",
  "reframe",
  "rise_reveal",
  "spline",
  "camera_object_attached",
  "pass_through",
  "settle",
  "move_toward",
  "hinge",
  "flow",
  "axis_lock",
  "rigid_link",
  "maintain_distance",
  "motivated_source",
  "light_reveal",
  "maintain_axis",
  "preserve_action_continuity",
]) {
  assert(uniqueIds.has(requiredId), `Missing required V2 capability ${requiredId}.`);
}

assert(DIRECTOR_CAMERA_MOVEMENTS.includes("arc_right"), "Canonical Director lacks arc_right.");
assert(DIRECTOR_CAMERA_MOVEMENTS.includes("pass_through"), "Canonical Director lacks pass_through.");
assert(DIRECTOR_CAMERA_FRAMINGS.includes("medium_close"), "Canonical Director lacks medium_close framing.");
assert(DIRECTOR_CAMERA_ANGLES.includes("three_quarter_rear"), "Canonical Director lacks three_quarter_rear angle.");
assert(DIRECTOR_CAMERA_LENSES.includes("telephoto"), "Canonical Director lacks telephoto lens intent.");
assert(DIRECTOR_COORDINATE_SPACES.includes("target_relative"), "Canonical Director lacks target_relative coordinates.");
assert(DIRECTOR_NARRATIVE_JOBS.includes("reverse_assumption"), "Canonical Director lacks reverse_assumption.");
assert(DIRECTOR_BLOCKING_RELATIONS.includes("foreground"), "Canonical Director lacks cinematic foreground blocking.");
assert(DIRECTOR_LIGHTING_INTENTS.includes("motivated_source"), "Canonical Director lacks motivated lighting.");
assert(DIRECTOR_CONTINUITY_RULES.includes("avoid_occlusion"), "Canonical Director lacks occlusion continuity.");
assert(DIRECTOR_KINEMATIC_CONSTRAINTS.includes("rigid_link"), "Canonical Director lacks rigid-link constraints.");

const revealCapability = DIRECTOR_CAPABILITIES.find((capability) => capability.id === "reveal");
assert(revealCapability, "Reveal capability missing.");
const reveal = directorCapabilityDemoMoment(revealCapability);
assert(reveal.shot, "Reveal demo has no V2 shot.");
assert(reveal.shot.camera.movement_steps.length >= 2, "Reveal should demonstrate composed camera movement.");
assert(reveal.shot.blocking.some((cue) => cue.relation === "behind"), "Reveal should demonstrate blocking.");
assert(reveal.shot.lighting.intents.includes("light_reveal"), "Reveal should demonstrate a lighting reveal.");
assert(reveal.shot.continuity.rules.includes("avoid_occlusion"), "Reveal should preserve occlusion continuity.");

const rigidCapability = DIRECTOR_CAPABILITIES.find((capability) => capability.id === "rigid_link");
assert(rigidCapability, "Rigid-link capability missing.");
const rigid = directorCapabilityDemoMoment(rigidCapability);
assert(rigid.shot?.constraints.some((constraint) => constraint.kind === "rigid_link"), "Rigid-link demo did not compile its constraint.");

const builder = source("sandbox/probe-lab/primitive-builder/ui/primitive-builder-lab.tsx");
for (const marker of [
  "stagedBaseAssetPositions",
  "applyDirectorBlocking",
  "DirectorShotCameraController",
  "DirectorShotLightingRig",
  "runtimeMotion",
  "validateDirectorShot",
  "SceneBoundsGate",
]) {
  assert(builder.includes(marker), `Asset Scene Builder bridge is missing ${marker}.`);
}

const resolvedModel = source("sandbox/probe-lab/scenes/ui/resolved-asset-model.tsx");
assert(resolvedModel.includes("ResolvedAssetRuntimeMotion"), "ResolvedAssetModel lacks the shared runtime-motion hook.");
assert(resolvedModel.includes("runtimeMotion.sample"), "ResolvedAssetModel is not sampling Director motion.");

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "sampleDirectorCameraPose",
  "sampleDirectorActorState",
  "DirectorShotLightingRig",
  "approximate_actor_collision_ratio",
  "rigid_link",
  "camera_relative",
]) {
  assert(runtime.includes(marker), `Shared Director runtime is missing ${marker}.`);
}

const request = source("sandbox/probe-lab/primitive-builder/primitive-build-request.ts");
assert(request.includes('capability_language_version: "v2"'), "Primitive Builder model contract is not requesting V2 direction.");
assert(request.includes("shot.constraints"), "Primitive Builder prompt does not explain kinematic constraints.");
assert(request.includes("movement_steps"), "Primitive Builder prompt does not expose composable camera steps.");

const normalizer = source("sandbox/probe-lab/director/normalize-director-plan.ts");
assert(normalizer.includes("normalizeShotDirectionV2"), "Canonical normalizer does not normalize V2 shots.");
assert(normalizer.includes("kinematicConstraintSet"), "Canonical normalizer does not normalize V2 constraints.");

const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>((counts, capability) => {
  counts[capability.compiler.threejs] = (counts[capability.compiler.threejs] ?? 0) + 1;
  return counts;
}, {});

console.log("Director Capability V2 verification passed.");
console.log(`Capabilities: ${DIRECTOR_CAPABILITIES.length} across ${DIRECTOR_CAPABILITY_CATEGORIES.length} categories.`);
console.log(`Three.js support: ${JSON.stringify(supportCounts)}.`);
console.log("Canonical Director, shared runtime, and Asset Scene Builder bridge markers are present.");
