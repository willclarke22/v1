import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_OBJECT_MOTION_FIDELITY_PROGRESS,
  DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION,
  DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY,
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES,
  buildDirectorObjectMotionFidelityReport,
} from "../../sandbox/probe-lab/motion-camera-library/director-object-motion-fidelity";
import {
  DIRECTOR_AUDIT_FIXTURE_KINDS,
  directorVisualAuditDefinition,
} from "../../sandbox/probe-lab/motion-camera-library/director-visual-audit";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(
    join(process.cwd(), relativePath),
    "utf8",
  );
}

const objectMotions = DIRECTOR_CAPABILITIES.filter(
  (capability) =>
    capability.category === "object_motion" &&
    capability.group === "Actor movement",
);

assert(
  objectMotions.length === 36,
  `Phase 1B.4.1 expects 36 Actor movement capabilities; found ${objectMotions.length}.`,
);

assert(
  JSON.stringify(DIRECTOR_OBJECT_MOTION_FIDELITY_PROGRESS) ===
    JSON.stringify([0, 0.25, 0.5, 0.75, 1]),
  "Object-motion fidelity must sample 0/25/50/75/100%.",
);

const expectedFixtureIds = [
  "object_motion_rigid",
  "object_motion_path_surface",
  "object_motion_relationship",
  "object_motion_articulation",
  "object_motion_containment",
  "object_motion_multi_part",
  "object_motion_process",
];

for (const fixture of expectedFixtureIds) {
  assert(
    (DIRECTOR_AUDIT_FIXTURE_KINDS as readonly string[]).includes(fixture),
    `Phase 1B.4.1 fixture kind is missing: ${fixture}.`,
  );
}

const expectedFixtures: Record<string, string[]> = {
  object_motion_rigid: [
    "translate",
    "rotate",
    "pivot",
    "oscillate",
    "enter_frame",
    "exit_frame",
    "move_toward",
    "move_away",
    "spin",
    "lift",
    "lower",
    // Phase 1B.5A visual qualification moves root-scale semantics out of the
    // process fixture; their original support/runtime classification is unchanged.
    "expand",
    "contract",
  ],
  object_motion_path_surface: [
    "follow_path",
    "slide",
    "roll",
  ],
  object_motion_relationship: [
    "attach",
    "detach",
    "follow_target",
    "align",
    "aim_at",
  ],
  object_motion_articulation: [
    "hinge",
    "object_open",
    "object_close",
  ],
  object_motion_containment: [
    "insert_into",
    "remove_from",
  ],
  object_motion_multi_part: [
    "assemble",
    "disassemble",
    "scatter",
    "split",
    "merge",
  ],
  object_motion_process: [
    "flow",
    "fill",
    "drain",
    "emit",
    "accumulate",
  ],
};

const fixtureCounts: Record<string, number> = {};
for (const capability of objectMotions) {
  const definition = directorVisualAuditDefinition(capability);
  fixtureCounts[definition.fixture] =
    (fixtureCounts[definition.fixture] ?? 0) + 1;

  const expected = Object.entries(expectedFixtures).find(
    ([, ids]) => ids.includes(capability.id),
  )?.[0];

  assert(
    expected === definition.fixture,
    `${capability.id} should use ${expected}; found ${definition.fixture}.`,
  );

  const report =
    buildDirectorObjectMotionFidelityReport(capability);
  assert(
    report,
    `${capability.id} is missing Phase 1B.4.1 fidelity evidence.`,
  );
  assert(
    report.schema_version ===
      DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION,
    `${capability.id} object-motion fidelity version drifted.`,
  );
  assert(
    report.samples.length === 5,
    `${capability.id} should expose five standard fidelity samples.`,
  );
  assert(
    report.checks.some(
      (check) =>
        check.id === "finite_actor_samples" &&
        check.passed,
    ),
    `${capability.id} has non-finite controlled actor samples.`,
  );
}

for (const [fixture, ids] of Object.entries(expectedFixtures)) {
  assert(
    fixtureCounts[fixture] === ids.length,
    `${fixture} should own ${ids.length} Actor movement capabilities; found ${fixtureCounts[fixture] ?? 0}.`,
  );
}

for (
  const id of
  DIRECTOR_OBJECT_MOTION_REGRESSION_CANARIES
) {
  const capability = objectMotions.find(
    (candidate) => candidate.id === id,
  );
  assert(capability, `Missing regression canary ${id}.`);
  const report =
    buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} is missing fidelity evidence.`);
  assert(
    report.qualification_state === "frozen_canary",
    `${id} should be frozen as a Phase 1B.4.1 regression canary; found ${report.qualification_state}.`,
  );
  assert(
    report.automated_status === "pass",
    `${id} automated regression canary did not pass.`,
  );
  assert(
    report.checks
      .filter((check) => check.kind === "regression_canary")
      .every((check) => check.passed),
    `${id} regression-canary check failed.`,
  );
}

for (
  const [id, diagnostic] of
  Object.entries(
    DIRECTOR_OBJECT_MOTION_KNOWN_REDUNDANCY,
  )
) {
  const capability = objectMotions.find(
    (candidate) => candidate.id === id,
  );
  assert(
    capability,
    `Known redundancy references missing capability ${id}.`,
  );
  const report =
    buildDirectorObjectMotionFidelityReport(capability);
  assert(report, `${id} is missing fidelity evidence.`);
  assert(
    report.qualification_state ===
      "needs_semantic_strengthening",
    `${id} should remain explicitly unqualified until semantic strengthening.`,
  );
  assert(
    report.automated_status === "known_redundancy",
    `${id} should surface known redundancy rather than claim pass.`,
  );
  assert(
    diagnostic.peers.every(
      (peer) => report.redundancy_peers.includes(peer),
    ),
    `${id} redundancy peers drifted.`,
  );
}

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  'case "follow_target":\n      case "attach":',
  'case "aim_at":\n      case "align":',
  'case "insert_into":\n      case "merge":\n      case "assemble":',
  'case "remove_from":\n      case "split":\n      case "disassemble":',
  'case "flow":\n      case "emit":',
  'case "accumulate":\n      case "fill":',
]) {
  assert(
    runtime.includes(marker),
    `Phase 1B.4.1 redundancy evidence marker is missing from runtime: ${marker}.`,
  );
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
assert(
  registry.includes(
    'if (id === "scatter") return "move_away";',
  ),
  "Phase 1B.4.1 must continue surfacing the current Scatter → move_away alias until strengthening.",
);
assert(
  registry.includes(
    'if (["rotate", "spin"].includes(capability.id)) { parameters.axis = "y"; parameters.turns = 1; }',
  ),
  "Phase 1B.4.1 must continue surfacing the current Rotate/Spin demo overlap until strengthening.",
);

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "ObjectMotionQualificationStage",
  'fixtureKind === "object_motion_path_surface"',
  'fixtureKind === "object_motion_relationship"',
  'fixtureKind === "object_motion_articulation"',
  'fixtureKind === "object_motion_containment"',
  'fixtureKind === "object_motion_multi_part"',
  'fixtureKind === "object_motion_process"',
  "Door-like articulated panel",
  "Open socket/container",
  "Three visibly distinct parts",
  "Process carrier/content actor",
]) {
  assert(
    preview.includes(marker),
    `Phase 1B.4.1 controlled fixture marker is missing: ${marker}.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "buildDirectorObjectMotionFidelityReport",
  "Phase 1B.4.1 controlled object-motion proof",
  "known semantic overlap",
  "runtime_semantics_rewritten_in_this_phase: false",
]) {
  assert(
    library.includes(marker),
    `Director Capability Library is missing Phase 1B.4.1 evidence marker: ${marker}.`,
  );
}

for (const id of [
  "translate",
  "rotate",
  "pivot",
  "oscillate",
]) {
  const capability = objectMotions.find(
    (candidate) => candidate.id === id,
  );
  assert(capability, `Missing object-motion canary ${id}.`);
  const moment = directorCapabilityDemoMoment(capability);
  assert(
    moment.events.length > 0,
    `${id} canary no longer compiles an actor event.`,
  );
}

console.log(
  "Director object-motion qualification foundation Phase 1B.4.1 verification passed.",
);
console.log(
  `Fidelity version: ${DIRECTOR_OBJECT_MOTION_FIDELITY_VERSION}.`,
);
console.log(
  `Actor movement capabilities: ${objectMotions.length}; specialized fixture families: ${expectedFixtureIds.length}.`,
);
console.log(
  "Translate/Rotate/Pivot/Oscillate are frozen regression canaries.",
);
console.log(
  "Known shared runtime branches remain explicitly unqualified for the next semantic-strengthening pass.",
);
