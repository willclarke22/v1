import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const item = DIRECTOR_CAPABILITIES.find((candidate) => candidate.id === id);
  assert(item, `Director capability ${id} is missing.`);
  return item;
}

const cameraCapabilities = DIRECTOR_CAPABILITIES.filter((item) =>
  item.category === "camera_framing" ||
  item.category === "camera_angle" ||
  item.category === "camera_movement",
);

assert(
  cameraCapabilities.length === 66,
  `Expected 66 camera capabilities in the Phase 1B fidelity bench; found ${cameraCapabilities.length}.`,
);

const cutaway = capability("cutaway");
assert(
  cutaway.compiler.threejs === "compound",
  "Cutaway must be compound in Phase 1B; camera distance alone is not a truthful cutaway.",
);
assert(
  cutaway.compiler.fallback_capability_id === "medium_close",
  "Cutaway must fall back to medium_close.",
);

const isometric = capability("isometric");
assert(
  isometric.compiler.threejs === "approximate",
  "Isometric must be approximate while Three.js remains perspective-camera based.",
);
assert(
  isometric.compiler.fallback_capability_id === "three_quarter_front",
  "Isometric must fall back to three_quarter_front.",
);

assert(
  capability("inside_object").compiler.threejs === "approximate",
  "Inside-object must remain approximate until interior-safe asset metadata exists.",
);
assert(
  capability("focus_shallow").compiler.threejs === "approximate",
  "Shallow focus must remain approximate in the current Three.js preview.",
);
assert(
  capability("object_attached").compiler.threejs === "compound",
  "Object-attached angle should remain compound while using the shared actor-local runtime.",
);
for (const id of ["over_shoulder", "point_of_view"]) {
  assert(
    capability(id).compiler.threejs === "direct",
    `${id} should remain direct after actor-relative Phase 1B composition.`,
  );
}

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  'shot.composition.framing === "over_shoulder"',
  'shot.composition.framing === "point_of_view"',
  'shot.composition.angle === "object_attached"',
  ".applyEuler(sample.rotation)",
  "actorLocalMountedView",
  "solveDirectorMountedCameraRelationship",
  "cameraRelationshipActor",
  "actorEyePoint",
]) {
  assert(
    runtime.includes(marker),
    `Shared Director runtime is missing Phase 1B camera-fidelity marker: ${marker}.`,
  );
}

const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
for (const marker of [
  "Uses the declared foreground actor as the shoulder source",
  "Uses the declared foreground actor as the viewpoint source",
  "perspective camera with restrained FOV",
  "actor-local body-mounted viewpoint",
]) {
  assert(
    coverage.includes(marker),
    `Director runtime coverage is missing Phase 1B fidelity note: ${marker}.`,
  );
}

const registry = source(
  "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
);
for (const marker of [
  'id === "cutaway" ? "compound" : "direct"',
  'id === "inside_object" || id === "isometric"',
  'viewpoint_source_role:',
  'demo_object_attached_angle_subject_turn',
  'movement === "object_attached"',
]) {
  assert(
    registry.includes(marker),
    `Director capability registry is missing Phase 1B marker: ${marker}.`,
  );
}

const fidelity = source(
  "sandbox/probe-lab/motion-camera-library/director-camera-fidelity.ts",
);
for (const marker of [
  '"director_camera_fidelity_phase1b_v1"',
  "DIRECTOR_CAMERA_FIDELITY_PROGRESS",
  "sampleDirectorCameraPose",
  "finite_camera_samples",
  "pov_uses_viewpoint_actor",
  "over_shoulder_uses_foreground_actor",
  "object_attached_angle_local",
  "object_attached_local_mount",
  "lead_lag_direction",
  "visual_review_required: true",
]) {
  assert(
    fidelity.includes(marker),
    `Controlled camera fidelity bench is missing marker: ${marker}.`,
  );
}

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
// Phase 1B.6.1 simplified the visible Capability Library and retired the
// historical "controlled proof" labels. Protect the camera-fidelity wiring
// structurally instead of requiring those old page-facing strings.
for (const marker of [
  "buildDirectorCameraFidelityReport",
  "CameraFidelityEvidence",
  "Phase 1B camera fidelity evidence",
  "report={cameraFidelity}",
  "Known fidelity boundary",
]) {
  assert(
    library.includes(marker),
    `Director Capability Library is missing Phase 1B fidelity evidence marker: ${marker}.`,
  );
}

console.log("Director camera fidelity Phase 1B verification passed.");
console.log("Fidelity version: director_camera_fidelity_phase1b_v1.");
console.log(`Camera capabilities wired into controlled evidence: ${cameraCapabilities.length}.`);
console.log("Over-shoulder and POV use actor-relative compositions; object-attached cameras preserve actor-local mount and outward view orientation.");
console.log("Isometric is explicitly approximate; cutaway is explicitly compound; visual review remains required.");
