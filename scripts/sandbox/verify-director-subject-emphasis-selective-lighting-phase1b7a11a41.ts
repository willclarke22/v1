import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const families = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const runtime = source(
    "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
  );
  const coverage = source(
    "sandbox/probe-lab/scenes/director-runtime-coverage.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const a40 = source(
    "scripts/sandbox/verify-director-lighting-style-family-closeout-phase1b7a11a40.ts",
  );
  const a24 = source(
    "scripts/sandbox/verify-director-lens-perspective-qualification-phase1b7a11a24.ts",
  );
  const a23 = source(
    "scripts/sandbox/verify-director-detail-relationship-closeout-phase1b7a11a23.ts",
  );
  const a20 = source(
    "scripts/sandbox/verify-director-composition-thirds-negative-space-phase1b7a11a20.ts",
  );

  const deferredStart = families.indexOf(
    "export const DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS = [",
  );
  assert(deferredStart >= 0, "Central deferred-capability set is missing.");
  const deferredEnd = families.indexOf("] as const;", deferredStart);
  assert(
    deferredEnd > deferredStart,
    "Central deferred-capability set is malformed.",
  );
  const deferredBlock = families.slice(deferredStart, deferredEnd);
  for (const id of [
    "rim_lit",
    "warm_cool_contrast",
    "backlit",
    "emissive_subject",
  ]) {
    assert(
      deferredBlock.includes(`"${id}"`),
      `A.11A.41 expected lighting deferral missing from central set: ${id}`,
    );
  }
  assert(
    deferredBlock.includes("A.11A.41") &&
      deferredBlock.includes("not true surface/material emission") &&
      deferredBlock.includes("defer active Qualification"),
    "A.11A.41 must record why Emissive Subject is deferred rather than silently deleting its vocabulary/runtime surface.",
  );

  for (const marker of [
    'id === "emissive_subject"',
    '? "approximate"',
    '["spotlight_subject", "dim_environment", "track_spotlight"].includes(',
    'shot.composition.keep_visible_entity_ids = [',
    '"primary_subject",',
    '"secondary_subject",',
    'shot.camera.focus_entity_ids = ["primary_subject", "secondary_subject"];',
    'shot.lens.depth_of_field = "deep";',
  ]) {
    assert(
      registry.includes(marker),
      `A.11A.41 registry semantic-proof marker missing: ${marker}`,
    );
  }

  for (const marker of [
    "type DirectorSubjectSpotlightMode =",
    'mode: DirectorSubjectSpotlightMode;',
    "const spotRef = useRef<THREE.SpotLight>(null);",
    "spot.target = targetObject;",
    'const dimEnvironment = intents.has("dim_environment");',
    'const trackSpotlight = intents.has("track_spotlight");',
    'mode="spotlight"',
    'mode="dim_environment"',
    'mode="track"',
    "lightReveal ? 0.025",
    "function DirectorMotivatedSourceLight",
    "function DirectorVolumetricBeam",
    "function DirectorExposureShift",
  ]) {
    assert(
      runtime.includes(marker),
      `A.11A.41 runtime marker missing: ${marker}`,
    );
  }

  assert(
    runtime.includes(
      'const lowKey =\n    intents.has("low_key") ||\n    lightReveal ||\n    volumetricBeam;',
    ),
    "Dim Environment must no longer alias the accepted Low-key branch.",
  );
  assert(
    !runtime.includes(
      '<DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="track" />',
    ),
    "Tracking Spotlight must not route through the old point-light tracker.",
  );

  // Successor-safe: preserve runtime ownership/classification without freezing
  // later descriptive wording or photometric refinements.
  for (const marker of [
    'spotlight_subject: coverage("lighting_rig", "explicit",',
    'dim_environment: coverage("lighting_rig", "explicit",',
    'emissive_subject: coverage("lighting_rig", "shared",',
    'track_spotlight: coverage("lighting_rig", "explicit",',
  ]) {
    assert(
      coverage.includes(marker),
      `A.11A.41 runtime-coverage marker missing: ${marker}`,
    );
  }

  for (const marker of [
    'selectedFamily.group === "Subject emphasis"',
    "Emissive subject",
    "subject remains the accepted",
    "Tracking spotlight",
  ]) {
    assert(
      room.includes(marker),
      `A.11A.41 Qualification Room marker missing: ${marker}`,
    );
  }

  // Highlight Subject is already accepted. Preserve the renderer-owned Golden
  // Lunch outline path rather than accidentally folding it into the new light rig.
  for (const marker of [
    'const goldenHighlight = capability.id === "highlight_subject"',
    "<AtomicGoldenControlledOutline",
    "goldenHighlight={goldenHighlight}",
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.41 frozen Highlight Subject marker missing: ${marker}`,
    );
  }

  assert(
    a40.includes(
      "Director Lighting style & motivation Phase 1B.7A.11A.40 verification passed.",
    ),
    "A.11A.40 predecessor lineage verifier is missing.",
  );

  // A.11A.41 honestly reclassifies Emissive Subject from direct to approximate.
  // Older composition/detail/lens verifiers must therefore protect their own durable
  // semantics without vetoing legitimate later compiler-support reclassification.
  for (const [label, verifier] of [
    ["A.11A.24", a24],
    ["A.11A.23", a23],
    ["A.11A.20", a20],
  ] as const) {
    assert(
      verifier.includes("support-class accounting must remain internally complete") &&
        verifier.includes('const supportKinds = ["direct", "compound", "approximate", "declared"] as const;') &&
        !verifier.includes("supportCounts.direct === 102") &&
        !verifier.includes("supportCounts.approximate === 15"),
      `${label} historical verifier must be successor-safe for legitimate Level 2 support reclassification.`,
    );
  }

  console.log(
    "Director Subject emphasis Phase 1B.7A.11A.41 successor-safe verification passed.",
  );
  console.log(
    "A.11A.41 durable semantics remain: Emissive Subject is honestly deferred, Highlight Subject stays frozen, selective-lighting compatibility remains available, and Tracking Spotlight uses a true actor-tracked SpotLight; later successors may consolidate Dim Environment and strengthen proof presentation.",
  );
}

main();
