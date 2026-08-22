import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_QUALIFICATION_SCENES,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-scenes";
import {
  applyDirectorBlocking,
  projectDirectorActorCenter,
  projectDirectorActorEnvelope,
  sampleDirectorCameraPose,
  type DirectorRuntimeActor,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string) {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability: ${id}`);
  return found;
}

function requireSceneB() {
  const found = DIRECTOR_QUALIFICATION_SCENES.find(
    (scene) => scene.id === "scene_b_spatial_relationship",
  );
  assert(found, "Scene B qualification fixture is missing.");
  return found;
}

const sceneB = requireSceneB();
const families = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
const depthFamily = families.find(
  (family) =>
    family.category === "blocking_placement" &&
    family.group === "Depth & screen placement",
);
assert(depthFamily, "Depth & screen placement audition family is missing.");
assert(
  depthFamily.normalization_policy === "presentation_normalized",
  "Depth & screen placement baseline/diversity must use fair-display normalization rather than physical-context sizing.",
);

const room = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
);
assert(
  room.includes('input.pass_kind === "physical_stress"') &&
    room.includes('? "physical_context"') &&
    room.includes(': input.family.normalization_policy'),
  "Full-cast physical stress must remain a first-class physical-context pass after the fair-display baseline/diversity block.",
);

function sceneBActors(): DirectorRuntimeActor[] {
  return [
    {
      id: "primary_subject",
      position: [...sceneB.blocking.primary],
      rotation: [0, 0, 0],
      size: [0.66, 1.75, 0.52],
    },
    {
      id: "secondary_subject",
      position: [...sceneB.blocking.secondary],
      rotation: [0, 0, 0],
      size: [0.82, 1.10, 0.82],
    },
    {
      id: "context_subject",
      position: [...sceneB.blocking.context],
      rotation: [0, 0, 0],
      size: [0.46, 0.90, 0.46],
    },
  ];
}

const layered = capability("layered_depth");
const moment = directorCapabilityDemoMoment(layered);
const actors = applyDirectorBlocking(moment, sceneBActors());
const pose = sampleDirectorCameraPose(moment, 0, actors);
const cameraDistance = pose.position.distanceTo(pose.target);

assert(
  cameraDistance >= 3.2 && cameraDistance <= 8.25,
  `Layered-depth projected fit should stay in a readable group-shot distance band; got ${cameraDistance.toFixed(2)}m.`,
);

const ids = [
  "primary_subject",
  "secondary_subject",
  "context_subject",
] as const;
const centres = ids.map((id) => {
  const projected = projectDirectorActorCenter(moment, actors, id, 0);
  assert(projected, `Missing layered-depth centre evidence for ${id}.`);
  return projected;
});
const envelopes = ids.map((id) => {
  const projected = projectDirectorActorEnvelope(moment, actors, id, 0);
  assert(projected, `Missing layered-depth envelope evidence for ${id}.`);
  return projected;
});

assert(
  centres[0].camera_depth_m + 0.35 < centres[1].camera_depth_m &&
    centres[1].camera_depth_m + 0.35 < centres[2].camera_depth_m,
  `Layered depth lost foreground/midground/background order: ${centres
    .map((item) => item.camera_depth_m.toFixed(2))
    .join(" / ")}m.`,
);

for (const envelope of envelopes) {
  assert(
    envelope.fully_inside_safe_frame,
    `${envelope.actor_id} leaves the projected qualification safe frame.`,
  );
  assert(
    envelope.height_ndc >= 0.18,
    `${envelope.actor_id} became too small to judge vertically (NDC height ${envelope.height_ndc.toFixed(3)}).`,
  );
  assert(
    envelope.screen_area_fraction >= 0.006,
    `${envelope.actor_id} became visually negligible (screen area ${envelope.screen_area_fraction.toFixed(4)}).`,
  );
}

const combinedMinX = Math.min(...envelopes.map((item) => item.min_ndc_x));
const combinedMaxX = Math.max(...envelopes.map((item) => item.max_ndc_x));
const combinedMinY = Math.min(...envelopes.map((item) => item.min_ndc_y));
const combinedMaxY = Math.max(...envelopes.map((item) => item.max_ndc_y));
const combinedWidth = combinedMaxX - combinedMinX;
const combinedHeight = combinedMaxY - combinedMinY;
assert(
  combinedWidth >= 0.5 && combinedHeight >= 0.5,
  `Layered-depth composition is still microscopic in the 16:9 viewport (combined NDC ${combinedWidth.toFixed(3)} × ${combinedHeight.toFixed(3)}).`,
);

const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
for (const marker of [
  "isLayeredDepthComposition",
  "layeredDepthProjectedFitDistance",
  "Depth separation is evidence, not a reason to turn a three-layer composition",
  "projectDirectorActorEnvelope",
  "safeHalfWidth = 0.78",
  "safeHalfHeight = 0.74",
]) {
  assert(runtime.includes(marker), `Layered-depth readability marker missing: ${marker}`);
}
assert(
  runtime.includes("radius * framing * perspectiveCompensation"),
  "Ordinary Director camera framing must retain the established focus-radius path outside layered depth.",
);

const normalization = source(
  "sandbox/probe-lab/motion-camera-library/director-qualification-normalization.ts",
);
assert(
  normalization.includes('input.group === "Depth & screen placement"') &&
    normalization.includes('return "presentation_normalized";'),
  "Depth/screen qualification normalization override is missing.",
);

const readme = source(
  "sandbox/probe-lab/motion-camera-library/README.md",
);
assert(
  readme.includes("Phase 1B.7A.4 — layered-depth readability + fair-display evidence"),
  "Director README is missing the Phase 1B.7A.4 qualification note.",
);

console.log(
  "Director Qualification Room Phase 1B.7A.4 layered-depth readability verification passed.",
);
console.log(
  `Projected camera fit holds all three ordered layers at ${cameraDistance.toFixed(2)}m with minimum actor NDC height ${Math.min(...envelopes.map((item) => item.height_ndc)).toFixed(3)}.`,
);
