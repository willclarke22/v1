import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  DIRECTOR_CAPABILITY_SUPPORT_LEVELS,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);

for (const marker of [
  "function QualificationCameraVisibilityFill",
  "qualificationVisibilityAssist?: boolean",
  'capability.category === "camera_framing"',
  'capability.category === "camera_angle"',
  'capability.category === "camera_movement"',
  "lighting_emphasis therefore remains authored-lighting-only",
  "tracking-ground-edge-marker-",
  "<boxGeometry args={[0.42, 0.018, 0.12]} />",
  'name={`tracking-corridor-${capabilityId}`}',
  "roadside orientation markers",
  "same safe travelling corridor",
  'const showRoadsideMarkers = capabilityId !== "track_parallel"',
  "showRoadsideMarkers",
  "centre/edge lines",
  "tracking-roadside-marker-",
]) {
  assert(
    preview.includes(marker),
    `A.9 Qualification presentation marker missing: ${marker}`,
  );
}

const previewWithoutLineComments = preview.replace(/\/\/.*$/gm, "");
assert(
  !previewWithoutLineComments.includes("showRoadsideMarkers"),
  "A.9 must not branch the active Tracking corridor by capability; every sibling should see the same ground-marker course.",
);
assert(
  !preview.includes("<boxGeometry args={[0.1, 0.56, 0.1]} />"),
  "A.9 must retire the tall 0.56 m roadside posts from active Tracking evidence.",
);
const visibilityGate =
  preview.match(
    /function cameraQualificationVisibilityAssistEnabled\(capability: DirectorCapability\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
assert(
  visibilityGate.length > 0 && !visibilityGate.includes("lighting_emphasis"),
  "A.9 camera-family visibility gate must exclude lighting-emphasis evidence.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
assert(
  room.includes("qualificationVisibilityAssist"),
  "Qualification Room must explicitly opt its shared preview into the camera-family visibility assist.",
);

const runtime = source(
  "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
);
for (const marker of [
  "const leadEstablish = THREE.MathUtils.smootherstep(",
  "clamp01(t),",
  "0.05,",
  "0.34,",
  ") * leadEstablish;",
  "Math.max(0.22, radius * 0.44) * leadEstablish",
  "constrainLeadTargetConstantTime",
  "pose.position.addScaledVector(direction, -lagDistance * 0.18)",
  "pose.target.addScaledVector(direction, -lagDistance * 1.05)",
]) {
  assert(runtime.includes(marker), `A.9 Lead/frozen-runtime marker missing: ${marker}`);
}
assert(
  !runtime.includes("constrainLeadTargetToSafeEnvelope") &&
    !runtime.includes("for (let iteration = 0; iteration < 10; iteration += 1)"),
  "A.9 must preserve the A.8 constant-time Lead hot path.",
);

const audit = source(
  "sandbox/probe-lab/motion-camera-library/director-visual-audit.ts",
);
for (const marker of [
  "establish its safe rear-third composition within roughly the first third",
  "same low-profile ground-edge markers used by the other Tracking siblings",
  "Qualification visibility fill may normalize readability",
]) {
  assert(audit.includes(marker), `A.9 visual-audit marker missing: ${marker}`);
}

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
for (const marker of [
  "Phase 1B.7A.9 — Qualification presentation polish",
  "low-profile ground-edge",
  "Qualification-only camera visibility fill",
  "brief near-Follow opening → establish during the first third → hold",
  "Neutralize variables that are not under test",
  "Recording automation is intentionally not introduced here",
]) {
  assert(readme.includes(marker), `A.9 README marker missing: ${marker}`);
}

// A.9 predates later Qualification closeout work that legitimately reclassified
// some Director capabilities between direct/compound/approximate while preserving
// the 184-capability vocabulary. Keep this presentation verifier successor-safe:
// protect vocabulary cardinality and recognized support kinds, not a one-time count.
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
const recognizedSupportKinds = new Set<string>(
  DIRECTOR_CAPABILITY_SUPPORT_LEVELS,
);
const unknownSupportKinds = Object.keys(supportCounts).filter(
  (kind) => !recognizedSupportKinds.has(kind),
);
const classifiedCapabilityCount = Object.values(supportCounts).reduce(
  (sum, count) => sum + count,
  0,
);

assert(
  DIRECTOR_CAPABILITIES.length === 184 &&
    classifiedCapabilityCount === DIRECTOR_CAPABILITIES.length &&
    unknownSupportKinds.length === 0,
  `A.9 must preserve the 184-capability vocabulary and recognized support classifications: ${DIRECTOR_CAPABILITIES.length} ${JSON.stringify(supportCounts)} unknown=${JSON.stringify(unknownSupportKinds)}.`,
);

console.log("Director Qualification Room Phase 1B.7A.9 presentation verification passed.");
console.log("Tracking now uses one low-profile ground-marker course; camera-family qualification gets neutral visibility assist; Lead establishes early then holds while A.8 performance/runtime semantics remain frozen.");
