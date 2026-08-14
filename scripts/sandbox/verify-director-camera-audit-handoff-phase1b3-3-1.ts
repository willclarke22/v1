import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function capability(id: string) {
  const item = DIRECTOR_CAPABILITIES.find((candidate) => candidate.id === id);
  assert(item, `Missing Director capability ${id}.`);
  return item;
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");

for (const marker of [
  'import { useEffect, useMemo, useRef } from "react";',
  "const { camera, invalidate } = useThree();",
  "useEffect(() => {",
  "invalidate();",
  "}, [actors, invalidate, moment, progress]);",
  "}, [invalidate, sceneState]);",
  "const changedMoment = lastMomentId.current !== moment.id;",
  "lastPausedProgress.current === runtimeProgress",
  "!changedMoment",
  "const authoredStart = runtimeProgress <= 0.001;",
  "sampleDirectorCameraPose(moment, runtimeProgress, actors, sceneState)",
]) {
  assert(
    runtime.includes(marker),
    `Phase 1B.3.3.1 paused-camera marker missing: ${marker}.`,
  );
}

// This ordering is the regression guard. The old controller returned on an
// unchanged paused progress value before it checked whether the selected
// Director moment had changed.
const changedMomentIndex = runtime.indexOf(
  "const changedMoment = lastMomentId.current !== moment.id;",
);
const pausedCacheIndex = runtime.indexOf(
  "lastPausedProgress.current === runtimeProgress",
);
const samplePoseIndex = runtime.indexOf(
  "const pose = sampleDirectorCameraPose(moment, runtimeProgress, actors, sceneState);",
);
assert(changedMomentIndex >= 0, "Changed-moment check is missing.");
assert(
  pausedCacheIndex > changedMomentIndex,
  "Paused-cache check must follow changed-moment detection.",
);
assert(
  samplePoseIndex > pausedCacheIndex,
  "Camera sampling should occur after the guarded paused-cache check.",
);

// Preserve the semantic distinction already qualified visually:
// object_attached is a mounted angle at t=0; camera_object_attached is a camera
// movement that intentionally transitions into an attached rig.
const angle = capability("object_attached");
const movement = capability("camera_object_attached");
const angleMoment = directorCapabilityDemoMoment(angle);
const movementMoment = directorCapabilityDemoMoment(movement);

assert(
  angleMoment.shot?.composition.angle === "object_attached",
  "Object-attached must remain authored as the mounted camera angle.",
);
assert(
  movementMoment.shot?.camera.movement_steps.some(
    (step) => step.movement === "object_attached",
  ),
  "Camera-object-attached must retain its intentional attachment movement step.",
);
assert(
  angle.category === "camera_angle" &&
    movement.category === "camera_movement",
  "Mounted angle and mounted movement must remain distinct Director capabilities.",
);

// Frozen support distribution.
const supportCounts = DIRECTOR_CAPABILITIES.reduce<Record<string, number>>(
  (counts, item) => {
    counts[item.compiler.threejs] = (counts[item.compiler.threejs] ?? 0) + 1;
    return counts;
  },
  {},
);
assert(
  supportCounts.direct === 101 &&
    supportCounts.compound === 65 &&
    supportCounts.approximate === 15 &&
    supportCounts.declared === 2,
  `Phase 1B.3.3.1 must not change support classifications: ${JSON.stringify(supportCounts)}.`,
);

console.log("Director camera audit handoff Phase 1B.3.3.1 verification passed.");
console.log("Paused demand-rendered capability changes invalidate and bypass stale progress caching; Phase 1B.5A scene-state wake-up is additive.");
console.log("Object-attached angle retains mounted t=0 while camera-object-attached retains its intentional transition.");
