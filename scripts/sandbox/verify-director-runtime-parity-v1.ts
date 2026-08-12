import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_BEHAVIOURS,
  DIRECTOR_BLOCKING_RELATIONS,
  DIRECTOR_CAMERA_ANGLES,
  DIRECTOR_CAMERA_FRAMINGS,
  DIRECTOR_CAMERA_LENSES,
  DIRECTOR_CAMERA_MOVEMENTS,
  DIRECTOR_CONTINUITY_RULES,
  DIRECTOR_COORDINATE_SPACES,
  DIRECTOR_KINEMATIC_CONSTRAINTS,
  DIRECTOR_LIGHTING_INTENTS,
} from "../../sandbox/probe-lab/director";
import {
  DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE,
  DIRECTOR_BLOCKING_RUNTIME_COVERAGE,
  DIRECTOR_CAMERA_ANGLE_RUNTIME_COVERAGE,
  DIRECTOR_CAMERA_FRAMING_RUNTIME_COVERAGE,
  DIRECTOR_CAMERA_LENS_RUNTIME_COVERAGE,
  DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE,
  DIRECTOR_CONTINUITY_RUNTIME_COVERAGE,
  DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE,
  DIRECTOR_KINEMATIC_CONSTRAINT_RUNTIME_COVERAGE,
  DIRECTOR_LIGHTING_RUNTIME_COVERAGE,
  DIRECTOR_RUNTIME_COVERAGE_VERSION,
  DIRECTOR_RUNTIME_EXECUTION_MODES,
  DIRECTOR_RUNTIME_OWNERS,
  type DirectorRuntimeCoverageEntry,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function sorted(values: readonly string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertExactCoverage(
  label: string,
  canonicalValues: readonly string[],
  coverageRecord: Record<string, DirectorRuntimeCoverageEntry>,
) {
  const canonical = sorted(canonicalValues);
  const covered = sorted(Object.keys(coverageRecord));
  assert(
    JSON.stringify(canonical) === JSON.stringify(covered),
    `${label} runtime coverage drifted. Canonical=${JSON.stringify(canonical)} covered=${JSON.stringify(covered)}.`,
  );

  for (const value of canonicalValues) {
    const entry = coverageRecord[value];
    assert(entry, `${label} ${value} has no runtime coverage entry.`);
    assert(DIRECTOR_RUNTIME_OWNERS.includes(entry.owner), `${label} ${value} has invalid owner ${entry.owner}.`);
    assert(DIRECTOR_RUNTIME_EXECUTION_MODES.includes(entry.mode), `${label} ${value} has invalid mode ${entry.mode}.`);
    assert(entry.note.trim().length >= 12, `${label} ${value} needs a meaningful structural coverage note.`);
    if (entry.mode === "compatibility_alias") {
      assert(entry.alias_of, `${label} ${value} is a compatibility alias without alias_of.`);
      assert(canonicalValues.includes(entry.alias_of), `${label} ${value} aliases unknown canonical value ${entry.alias_of}.`);
      assert(entry.alias_of !== value, `${label} ${value} may not alias itself.`);
    } else {
      assert(!entry.alias_of, `${label} ${value} declares alias_of without compatibility_alias mode.`);
    }
  }
}

assertExactCoverage("DirectorCameraMovement", DIRECTOR_CAMERA_MOVEMENTS, DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE);
assertExactCoverage("DirectorCameraFraming", DIRECTOR_CAMERA_FRAMINGS, DIRECTOR_CAMERA_FRAMING_RUNTIME_COVERAGE);
assertExactCoverage("DirectorCameraAngle", DIRECTOR_CAMERA_ANGLES, DIRECTOR_CAMERA_ANGLE_RUNTIME_COVERAGE);
assertExactCoverage("DirectorCameraLens", DIRECTOR_CAMERA_LENSES, DIRECTOR_CAMERA_LENS_RUNTIME_COVERAGE);
assertExactCoverage("DirectorBehaviour", DIRECTOR_BEHAVIOURS, DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE);
assertExactCoverage("DirectorBlockingRelation", DIRECTOR_BLOCKING_RELATIONS, DIRECTOR_BLOCKING_RUNTIME_COVERAGE);
assertExactCoverage("DirectorLightingIntent", DIRECTOR_LIGHTING_INTENTS, DIRECTOR_LIGHTING_RUNTIME_COVERAGE);
assertExactCoverage("DirectorKinematicConstraintKind", DIRECTOR_KINEMATIC_CONSTRAINTS, DIRECTOR_KINEMATIC_CONSTRAINT_RUNTIME_COVERAGE);
assertExactCoverage("DirectorContinuityRule", DIRECTOR_CONTINUITY_RULES, DIRECTOR_CONTINUITY_RUNTIME_COVERAGE);
assertExactCoverage("DirectorCoordinateSpace", DIRECTOR_COORDINATE_SPACES, DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE);

const trackCoverage = DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE.track;
assert(trackCoverage.mode === "compatibility_alias", "Canonical track must be explicit compatibility_alias in Phase 1A.");
assert(trackCoverage.alias_of === "follow", "Canonical track must execute through follow; track_parallel remains the distinct lateral capability.");

const canonicalMovementSet = new Set<string>(DIRECTOR_CAMERA_MOVEMENTS);
const canonicalFramingSet = new Set<string>(DIRECTOR_CAMERA_FRAMINGS);
const canonicalAngleSet = new Set<string>(DIRECTOR_CAMERA_ANGLES);
const canonicalLensSet = new Set<string>(DIRECTOR_CAMERA_LENSES);
const canonicalBehaviourSet = new Set<string>(DIRECTOR_BEHAVIOURS);
const canonicalBlockingSet = new Set<string>(DIRECTOR_BLOCKING_RELATIONS);
const canonicalLightingSet = new Set<string>(DIRECTOR_LIGHTING_INTENTS);
const canonicalConstraintSet = new Set<string>(DIRECTOR_KINEMATIC_CONSTRAINTS);
const canonicalContinuitySet = new Set<string>(DIRECTOR_CONTINUITY_RULES);
const canonicalCoordinateSet = new Set<string>(DIRECTOR_COORDINATE_SPACES);

for (const capability of DIRECTOR_CAPABILITIES) {
  const moment = directorCapabilityDemoMoment(capability);
  const shot = moment.shot;
  assert(shot, `${capability.id} did not compile to a V2 shot during runtime parity verification.`);

  assert(canonicalFramingSet.has(shot.composition.framing), `${capability.id} compiled unknown framing ${shot.composition.framing}.`);
  assert(DIRECTOR_CAMERA_FRAMING_RUNTIME_COVERAGE[shot.composition.framing], `${capability.id} framing ${shot.composition.framing} has no runtime coverage.`);
  assert(canonicalAngleSet.has(shot.composition.angle), `${capability.id} compiled unknown angle ${shot.composition.angle}.`);
  assert(DIRECTOR_CAMERA_ANGLE_RUNTIME_COVERAGE[shot.composition.angle], `${capability.id} angle ${shot.composition.angle} has no runtime coverage.`);
  assert(canonicalLensSet.has(shot.lens.preset), `${capability.id} compiled unknown lens ${shot.lens.preset}.`);
  assert(DIRECTOR_CAMERA_LENS_RUNTIME_COVERAGE[shot.lens.preset], `${capability.id} lens ${shot.lens.preset} has no runtime coverage.`);

  for (const step of shot.camera.movement_steps) {
    assert(canonicalMovementSet.has(step.movement), `${capability.id} compiled unknown camera movement ${step.movement}.`);
    assert(DIRECTOR_CAMERA_MOVEMENT_RUNTIME_COVERAGE[step.movement], `${capability.id} movement ${step.movement} has no runtime coverage.`);
    assert(canonicalCoordinateSet.has(step.coordinate_space), `${capability.id} compiled unknown coordinate space ${step.coordinate_space}.`);
    assert(DIRECTOR_COORDINATE_SPACE_RUNTIME_COVERAGE[step.coordinate_space], `${capability.id} coordinate space ${step.coordinate_space} has no runtime coverage.`);
  }

  for (const cue of shot.blocking) {
    assert(canonicalBlockingSet.has(cue.relation), `${capability.id} compiled unknown blocking relation ${cue.relation}.`);
    assert(DIRECTOR_BLOCKING_RUNTIME_COVERAGE[cue.relation], `${capability.id} blocking relation ${cue.relation} has no runtime coverage.`);
  }

  for (const constraint of shot.constraints) {
    assert(canonicalConstraintSet.has(constraint.kind), `${capability.id} compiled unknown constraint ${constraint.kind}.`);
    assert(DIRECTOR_KINEMATIC_CONSTRAINT_RUNTIME_COVERAGE[constraint.kind], `${capability.id} constraint ${constraint.kind} has no runtime coverage.`);
  }

  for (const intent of shot.lighting.intents) {
    assert(canonicalLightingSet.has(intent), `${capability.id} compiled unknown lighting intent ${intent}.`);
    assert(DIRECTOR_LIGHTING_RUNTIME_COVERAGE[intent], `${capability.id} lighting intent ${intent} has no runtime coverage.`);
  }

  for (const rule of shot.continuity.rules) {
    assert(canonicalContinuitySet.has(rule), `${capability.id} compiled unknown continuity rule ${rule}.`);
    assert(DIRECTOR_CONTINUITY_RUNTIME_COVERAGE[rule], `${capability.id} continuity rule ${rule} has no runtime coverage.`);
  }

  for (const event of moment.events) {
    assert(canonicalBehaviourSet.has(event.behaviour), `${capability.id} compiled unknown behaviour ${event.behaviour}.`);
    assert(DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE[event.behaviour], `${capability.id} behaviour ${event.behaviour} has no runtime coverage.`);
    if (event.fallback_behaviour) {
      assert(canonicalBehaviourSet.has(event.fallback_behaviour), `${capability.id} compiled unknown fallback behaviour ${event.fallback_behaviour}.`);
      assert(DIRECTOR_BEHAVIOUR_RUNTIME_COVERAGE[event.fallback_behaviour], `${capability.id} fallback behaviour ${event.fallback_behaviour} has no runtime coverage.`);
    }
  }
}

// Capability fallbacks were previously checked only for existence. Phase 1A
// also proves that every fallback chain terminates and cannot cycle forever.
const capabilityById = new Map(DIRECTOR_CAPABILITIES.map((capability) => [capability.id, capability]));
for (const capability of DIRECTOR_CAPABILITIES) {
  const seen = new Set<string>();
  let cursor = capability;
  while (cursor.compiler.fallback_capability_id) {
    assert(!seen.has(cursor.id), `Capability fallback cycle detected from ${capability.id}: ${[...seen, cursor.id].join(" -> ")}.`);
    seen.add(cursor.id);
    const next = capabilityById.get(cursor.compiler.fallback_capability_id);
    assert(next, `${cursor.id} points to missing fallback ${cursor.compiler.fallback_capability_id}.`);
    cursor = next;
  }
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  'directorCameraMovementRuntimeAlias(step.movement)',
  '["follow", "track", "lead_subject", "lag_follow", "track_parallel", "object_attached"]',
  'assertDirectorRuntimeNever(cue.relation, "DirectorBlockingRelation")',
  'assertDirectorRuntimeNever(event.behaviour, "DirectorBehaviour")',
  'assertDirectorRuntimeNever(constraint.kind, "DirectorKinematicConstraintKind")',
  'assertDirectorRuntimeNever(runtimeMovement, "DirectorCameraMovement")',
  'assertDirectorRuntimeNever(framing, "DirectorCameraFraming")',
  'assertDirectorRuntimeNever(angle, "DirectorCameraAngle")',
  'assertDirectorRuntimeNever(shot.composition.screen_anchor, "DirectorScreenAnchor")',
]) {
  assert(runtime.includes(marker), `Shared Director runtime is missing Phase 1A exhaustiveness marker: ${marker}.`);
}

console.log("Director runtime parity Phase 1A verification passed.");
console.log(`Coverage version: ${DIRECTOR_RUNTIME_COVERAGE_VERSION}.`);
console.log(`Canonical primitives covered: movements=${DIRECTOR_CAMERA_MOVEMENTS.length}, framings=${DIRECTOR_CAMERA_FRAMINGS.length}, angles=${DIRECTOR_CAMERA_ANGLES.length}, lenses=${DIRECTOR_CAMERA_LENSES.length}, behaviours=${DIRECTOR_BEHAVIOURS.length}, blocking=${DIRECTOR_BLOCKING_RELATIONS.length}, lighting=${DIRECTOR_LIGHTING_INTENTS.length}, constraints=${DIRECTOR_KINEMATIC_CONSTRAINTS.length}, continuity=${DIRECTOR_CONTINUITY_RULES.length}, coordinate_spaces=${DIRECTOR_COORDINATE_SPACES.length}.`);
console.log(`Capability compilation checked: ${DIRECTOR_CAPABILITIES.length} capability demos.`);
console.log("Legacy track is explicit follow compatibility; track_parallel remains the distinct lateral travelling capability.");
