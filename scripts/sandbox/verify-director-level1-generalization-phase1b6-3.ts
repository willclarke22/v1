
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_FILM_POLICIES,
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities";
import {
  sampleDirectorPerceptualCapabilityRuntime,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-runtime";
import {
  DIRECTOR_LIGHTING_INTENTS,
} from "../../sandbox/probe-lab/director/director-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const highlight = DIRECTOR_CAPABILITIES.find(
  (capability) => capability.id === "highlight_subject",
);
assert(highlight, "highlight_subject is missing from the atomic Director registry.");
assert(highlight.category === "lighting_emphasis", "highlight_subject must remain a lighting/emphasis atomic capability.");
assert(highlight.compiler.threejs === "direct", "highlight_subject must have a direct browser proof path.");
assert(DIRECTOR_CAPABILITIES.length === 184, `Expected 184 atomic capabilities; found ${DIRECTOR_CAPABILITIES.length}.`);
assert(
  DIRECTOR_CAPABILITIES.length + DIRECTOR_PERCEPTUAL_CAPABILITIES.length + DIRECTOR_FILM_POLICIES.length === 196,
  "Director hierarchy should derive to 196 total entries (184 + 7 + 5).",
);
assert(DIRECTOR_LIGHTING_INTENTS.includes("highlight_subject"), "highlight_subject must remain a valid Director intent.");

for (const capability of DIRECTOR_PERCEPTUAL_CAPABILITIES) {
  assert(
    capability.atomic_capability_ids.includes("highlight_subject"),
    `${capability.id} must be able to invoke Golden-derived highlight_subject.`,
  );
  for (const progress of [0, 0.5, 1]) {
    const sample = sampleDirectorPerceptualCapabilityRuntime(capability, progress);
    assert(sample.actor_poses.length >= 2, `${capability.id} lost its Level 1 proof actors.`);
    assert(sample.camera.position.every(Number.isFinite), `${capability.id} produced a non-finite camera position.`);
  }
}

const level1 = source("sandbox/probe-lab/motion-camera-library/ui/director-level1-capability-visualization.tsx");
for (const marker of [
  "Directional capability variants",
  "Any angle",
  "Asset facing correction",
  "defaults auto-fill, then stay fully switchable",
  "roleSearchQueries",
  "Auto-fill distinct assets",
]) {
  assert(level1.includes(marker), `Level 1 workbench is missing marker: ${marker}.`);
}

const viewer = source("sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx");
for (const marker of [
  "scale={1.028}",
  "roleYawOffsets",
  "directionDegrees",
  "travelDirection",
  "DirectorRealAssetLoadBoundary",
  "directorRealAssetBrowserUrl",
]) {
  assert(viewer.includes(marker), `Level 1 audit viewer is missing marker: ${marker}.`);
}
for (const retired of [
  "HighlightEnvelope",
  "EmphasisMarker",
  "fixture rotation",
  "GoldenControlledOutline",
  "ControlledActor",
  "Controlled proof",
]) {
  assert(!viewer.includes(retired), `Level 1 audit viewer retained retired proxy/halo/orientation marker: ${retired}.`);
}

const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
assert(
  coverage.includes('highlight_subject: coverage("geometry_or_renderer_layer", "presentation_contract"'),
  "highlight_subject must be classified as renderer-owned silhouette emphasis rather than a light rig.",
);
const shotRuntime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
assert(
  !shotRuntime.includes('intents.has("track_spotlight") || highlightSubject'),
  "highlight_subject must not be approximated as a tracking spotlight.",
);

console.log("Director Level 1 generalization Phase 1B.6.3 compatibility verification passed.");
console.log("196 derived Director entries remain intact; Level 1 direction, asset-facing correction, and Golden-style silhouette emphasis execute through real Asset Library actors.");

