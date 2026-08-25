import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M,
  directorQualificationInsideDetailCameraProfile,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-support-containment-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const mugScale = directorQualificationInsideDetailCameraProfile(0.13);
const thresholdScale = directorQualificationInsideDetailCameraProfile(
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M,
);
const aboveThreshold = directorQualificationInsideDetailCameraProfile(
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M + 0.0001,
);
const bathtubScale = directorQualificationInsideDetailCameraProfile(1.7);
const invalidScale = directorQualificationInsideDetailCameraProfile(0);

assert(
  DIRECTOR_QUALIFICATION_INSIDE_DETAIL_RECEIVER_MAX_EXTENT_M === 0.35,
  "A.11A.18 small-Inside receiver boundary must remain 0.35 m.",
);
assert(
  mugScale?.framing === "insert" &&
    mugScale.angle === "high_angle" &&
    mugScale.focal_length_mm === 72 &&
    mugScale.field_of_view_degrees === 34 &&
    mugScale.focus_entity_id === "secondary_subject",
  `A.11A.18 mug-scale camera profile is wrong: ${JSON.stringify(mugScale)}.`,
);
assert(
  thresholdScale !== null &&
    aboveThreshold === null &&
    bathtubScale === null &&
    invalidScale === null,
  "A.11A.18 detail camera must apply only to valid small receivers and must leave bathtub-scale containers on the established Inside camera.",
);

const preview = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
);
for (const marker of [
  "directorQualificationInsideDetailCameraProfile",
  "directorQualificationPreviewMoment",
  "qualificationVisibilityAssist",
  'capability.id !== "inside"',
  'role.role === "secondary_subject"',
  "?.blocking.target_extent_m",
  "framing: cameraProfile.framing",
  "angle: cameraProfile.angle",
  "field_of_view_degrees: cameraProfile.field_of_view_degrees",
  "focus_entity_ids: [cameraProfile.focus_entity_id]",
]) {
  assert(
    preview.includes(marker),
    `A.11A.18 Qualification preview integration marker missing: ${marker}.`,
  );
}
assert(
  !preview.includes("coffee_mug_bk_mritny8x") &&
    !preview.includes("apple_in_existing_mug"),
  "A.11A.18 camera refinement must be receiver-scale-driven, not keyed to the Apple/Mug fixture identity.",
);

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
assert(
  runtime.includes('case "insert": return 1.45') &&
    runtime.includes('shot.composition.framing === "insert"') &&
    runtime.includes("? 0.42"),
  "A.11A.18 depends on the existing shared Insert camera primitive rather than introducing a second camera solver.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
assert(
  room.includes("qualificationVisibilityAssist") &&
    room.includes("preserveActorInstances"),
  "A.11A.18 must remain inside the existing Qualification preview seam and preserve the established reel performance path.",
);

const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
assert(
  readme.includes("Phase 1B.7A.11A.18 — Small Inside perceptual framing") &&
    readme.includes("The trigger is receiver scale, not an Apple/Mug asset ID"),
  "Director README is missing the A.11A.18 camera-only boundary.",
);

console.log(
  "Director Support & containment Phase 1B.7A.11A.18 small-Inside framing verification passed.",
);
console.log(
  "Small Inside receivers use the existing high-angle Insert camera primitive with receiver-first focus; bathtub-scale containers retain the established camera, and no fixture asset identity is used to trigger the refinement.",
);
