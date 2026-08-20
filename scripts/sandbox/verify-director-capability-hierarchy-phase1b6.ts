
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_FILM_POLICIES,
  DIRECTOR_PERCEPTUAL_CAPABILITIES,
  DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION,
  FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities";
import {
  directorPerceptualPreviewSlots,
  sampleDirectorPerceptualCapabilityRuntime,
} from "../../sandbox/probe-lab/motion-camera-library/director-perceptual-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

assert(
  DIRECTOR_CAPABILITIES.length === 184,
  `Phase 1B.6 must preserve the historical atomic registry plus highlight_subject; found ${DIRECTOR_CAPABILITIES.length}.`,
);
assert(
  DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION ===
    "director_perceptual_capabilities_phase1b6_v1",
  `Unexpected Phase 1B.6 perceptual capability version: ${DIRECTOR_PERCEPTUAL_CAPABILITY_VERSION}.`,
);
assert(
  DIRECTOR_PERCEPTUAL_CAPABILITIES.length === 7,
  `Expected 7 Golden-derived perceptual/composite capabilities, found ${DIRECTOR_PERCEPTUAL_CAPABILITIES.length}.`,
);
assert(
  FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS.length === 5,
  `Expected 5 first-build perceptual capabilities, found ${FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS.length}.`,
);
assert(
  DIRECTOR_FILM_POLICIES.length === 5,
  `Expected 5 film-wide policies, found ${DIRECTOR_FILM_POLICIES.length}.`,
);

const atomicIds = new Set(DIRECTOR_CAPABILITIES.map((capability) => capability.id));
assert(atomicIds.has("highlight_subject"), "Phase 1B.6.3 must include highlight_subject.");
const perceptualIds = DIRECTOR_PERCEPTUAL_CAPABILITIES.map((capability) => capability.id);
assert(
  new Set(perceptualIds).size === perceptualIds.length,
  "Perceptual/composite capability IDs must be unique.",
);

for (const capability of DIRECTOR_PERCEPTUAL_CAPABILITIES) {
  assert(
    capability.level === "perceptual_composite",
    `${capability.id} must remain in the perceptual/composite hierarchy layer.`,
  );
  assert(
    capability.source.film === "Golden Lunch",
    `${capability.id} must retain Golden Lunch as provenance evidence.`,
  );
  assert(
    capability.roles.some((role) => role.required),
    `${capability.id} needs at least one required semantic role.`,
  );
  assert(
    capability.phases.length >= 4,
    `${capability.id} needs a meaningful phase grammar.`,
  );
  assert(
    capability.hard_rules.length >= 3,
    `${capability.id} needs hard perceptual rules.`,
  );
  assert(
    capability.qualification.some((check) => check.kind === "hard"),
    `${capability.id} needs at least one hard qualification target.`,
  );
  assert(
    capability.fallbacks.length >= 2,
    `${capability.id} needs deterministic/fail-closed fallbacks.`,
  );
  assert(
    capability.atomic_capability_ids.length >= 3,
    `${capability.id} must explicitly compose existing atomic Director capabilities.`,
  );
  for (const atomicId of capability.atomic_capability_ids) {
    assert(
      atomicIds.has(atomicId),
      `${capability.id} references missing atomic Director capability ${atomicId}.`,
    );
  }

  const slots = directorPerceptualPreviewSlots(capability);
  assert(slots.length >= 2, `${capability.id} must expose at least two controlled/real-asset proof slots.`);
  assert(slots.some((slot) => slot.required), `${capability.id} must expose a required proof role.`);

  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const sample = sampleDirectorPerceptualCapabilityRuntime(capability, progress);
    assert(sample.capability_id === capability.id, `${capability.id} sample changed identity.`);
    assert(sample.actor_poses.length >= 2, `${capability.id} must produce at least two proof actor poses.`);
    assert(sample.camera.position.every(Number.isFinite), `${capability.id} camera position must be finite.`);
    assert(sample.camera.target.every(Number.isFinite), `${capability.id} camera target must be finite.`);
    assert(Number.isFinite(sample.camera.fov_degrees), `${capability.id} FOV must be finite.`);
  }
}

for (const id of FIRST_BUILD_PERCEPTUAL_CAPABILITY_IDS) {
  const capability = DIRECTOR_PERCEPTUAL_CAPABILITIES.find((candidate) => candidate.id === id);
  assert(capability, `First-build perceptual capability is missing: ${id}.`);
  assert(capability.status === "first_build", `${id} must retain first_build status.`);
}

const runtime = source(
  "sandbox/probe-lab/motion-camera-library/director-perceptual-runtime.ts",
);
for (const forbidden of [
  "cinematic-production",
  "benchmark-burger",
  "cheeseburger_ms193r4w",
]) {
  assert(
    !runtime.includes(forbidden),
    `Perceptual proof runtime must not depend on Golden implementation detail: ${forbidden}.`,
  );
}
for (const marker of [
  "normalized role-space audit fixture",
  "not production",
  "Library geometry/directability",
]) {
  assert(runtime.includes(marker), `Perceptual runtime is missing non-hardcoding boundary marker: ${marker}.`);
}

const viewer = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-audit-viewer.tsx",
);
assert(
  (viewer.match(/<Canvas/g) ?? []).length === 1,
  "Perceptual/composite viewer must own exactly one WebGL Canvas.",
);
for (const marker of [
  'frameloop="demand"',
  'dpr={1}',
  'powerPreference: "low-power"',
  "Real-asset",
]) {
  assert(viewer.includes(marker), `Perceptual viewer is missing performance/proof marker: ${marker}.`);
}
assert(
  !viewer.includes("Controlled proof") && !viewer.includes('type PreviewMode = "controlled" | "real_assets"'),
  "Perceptual viewer must expose real-asset execution only on the canonical page.",
);

const library = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-capability-library-lab.tsx",
);
for (const marker of [
  "One workbench for perceptual/composite direction",
  "All levels ·",
  "Level 1 · Perceptual / Composite",
  "Level 2 · Atomic Execution",
  "Level 3 · Film-wide Policies",
  "Visible capabilities",
  "totalCapabilityCount",
  "Real-asset proof & qualification",
  "Advanced inspector & diagnostics",
]) {
  assert(library.includes(marker), `Director Capability Library is missing hierarchy/layout marker: ${marker}.`);
}
for (const retiredUiMarker of [
  "setLibraryLayer(",
  "hierarchyLayerGridStyle",
  "Christopher Nolan Principle",
  "DirectorPerceptualCapabilityLibraryLab",
]) {
  assert(
    !library.includes(retiredUiMarker),
    `Director Capability Library retained retired split-page UI marker: ${retiredUiMarker}.`,
  );
}
assert(
  !library.includes("<Canvas"),
  "Director Capability Library shell must continue delegating Canvas ownership to the selected proof viewer.",
);

const perceptualLab = source(
  "sandbox/probe-lab/motion-camera-library/ui/director-perceptual-capability-lab.tsx",
);
for (const marker of [
  "/api/sandbox/probe-lab/assets/library",
  "Perceptual intent, not authored coordinates.",
  "Golden-derived perceptual/composite capabilities",
  "atomic_capability_ids",
  "Film-wide policies",
]) {
  assert(
    perceptualLab.includes(marker) ||
      source("sandbox/probe-lab/motion-camera-library/director-perceptual-capabilities.ts").includes(marker),
    `Perceptual Director layer is missing marker: ${marker}.`,
  );
}
assert(
  !perceptualLab.includes("<Canvas"),
  "Perceptual workbench shell must delegate the single Canvas to its audit viewer.",
);

const probeIndex = source("app/sandbox/probe-lab/page.tsx");
assert(
  !probeIndex.includes('href: "/sandbox/probe-lab/cinematic-motif-library"'),
  "Probe Lab must no longer expose a separate Cinematic Motif Library route.",
);
assert(
  probeIndex.includes("hierarchical directing + real-asset proof"),
  "Probe Lab Director card must describe the merged hierarchy.",
);

for (const retired of [
  "app/sandbox/probe-lab/cinematic-motif-library/page.tsx",
  "sandbox/probe-lab/cinematic-motif-library/cinematic-motif-registry.ts",
  "sandbox/probe-lab/cinematic-motif-library/cinematic-motif-runtime.ts",
  "sandbox/probe-lab/cinematic-motif-library/ui/cinematic-motif-audit-viewer.tsx",
  "sandbox/probe-lab/cinematic-motif-library/ui/cinematic-motif-library-lab.tsx",
  "scripts/sandbox/verify-cinematic-motif-library-cm1.ts",
  "scripts/sandbox/verify-cinematic-motif-library-cm1-1.ts",
]) {
  assert(!existsSync(join(process.cwd(), retired)), `Retired Motif Library artifact still exists: ${retired}.`);
}

const readme = source("sandbox/probe-lab/motion-camera-library/README.md");
for (const marker of [
  "Phase 1B.6 — Hierarchical Director capabilities",
  "visual intent, not Golden coordinates",
  "Reference-video growth loop",
  "fail closed",
]) {
  assert(readme.includes(marker), `Director README is missing Phase 1B.6 marker: ${marker}.`);
}

console.log("Director Capability Library hierarchy Phase 1B.6 verification passed.");
console.log("184 atomic capabilities preserved; 7 Golden-derived perceptual/composite capabilities + 5 film policies merged into the canonical Director library (196 total)." );
console.log("Separate Cinematic Motif Library route/files retired; one-Canvas real-asset execution and non-hardcoded production boundary preserved.");

