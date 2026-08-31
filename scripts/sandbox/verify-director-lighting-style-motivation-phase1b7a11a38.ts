import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const fixture = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy.ts",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );

  // Frozen siblings: Neutral studio remains the default branch and Low key keeps
  // the exact accepted base intensities from the reviewed evidence.
  for (const marker of [
    ': 0.42',
    '? 0.35',
    '? 0.9',
    '? 0.28',
    'const lowKey =',
    'intents.has("low_key")',
  ]) {
    assert(runtime.includes(marker), `A.11A.38 frozen Neutral/Low-key marker missing: ${marker}`);
  }

  // Preserve the accepted reveal/effects predecessor canaries. A.11A.38 owns
  // only Lighting style & motivation and must not re-author those siblings.
  for (const marker of [
    "function DirectorVolumetricBeam",
    "THREE.AdditiveBlending",
    "function DirectorExposureShift",
    "gl.toneMappingExposure = directorExposureShiftForProgress",
    "lightReveal ? 0.025",
    "function DirectorShadowProjectionKey",
  ]) {
    assert(runtime.includes(marker), `A.11A.38 accepted lighting-sibling marker missing: ${marker}`);
  }

  for (const marker of [
    "type DirectorStyleAccentMode =",
    'mode === "high_key"',
    'mode === "backlit"',
    'mode === "rim_lit"',
    'mode === "warm_cool_contrast"',
    ".addScaledVector(toCamera, -2.7)",
    ".addScaledVector(right, 2.1)",
    'color="#ffb45e"',
    '? "#38bdf8"',
    'const preserveShadow = intents.has("preserve_shadow");',
    'const backlit = intents.has("backlit") || shadowProjection;',
    "function DirectorMotivatedSourceLight",
    "const sourceId = shot.lighting.motivated_source_entity_id;",
    "spot.target = targetObject;",
    "glow.position.copy(sourcePoint);",
    "<DirectorMotivatedSourceLight",
  ]) {
    assert(runtime.includes(marker), `A.11A.38 runtime marker missing: ${marker}`);
  }

  assert(
    !runtime.includes(
      'intents.has("backlit") || intents.has("preserve_shadow") || shadowProjection',
    ),
    "Preserve shadow must no longer alias the shared Backlit branch.",
  );
  assert(
    !runtime.includes(
      '<DirectorMotivatedLight moment={moment} actors={actors} progress={progress} autoLoop={autoLoop} sceneState={sceneState} mode="motivated" />',
    ),
    "Motivated source must use its dedicated source-to-subject practical-light rig.",
  );

  for (const marker of [
    "DIRECTOR_LIGHTING_STYLE_MOTIVATION_FIXTURE_POLICY_VERSION",
    "director_lighting_style_motivation_fixture_policy_phase1b7a11a38_v1",
    "isLightingStyleMotivationQualificationFamily",
    "directorQualificationLightingStyleMotivationAssetRoles",
    'capability.id !== "motivated_source"',
    'role.role === "context_subject"',
  ]) {
    assert(fixture.includes(marker), `A.11A.38 fixture-policy marker missing: ${marker}`);
  }

  for (const marker of [
    "DIRECTOR_MOTIVATED_SOURCE_CAST_SLOT",
    '"small_asymmetric"',
    "DIRECTOR_MOTIVATED_SOURCE_HINTS",
    '"lantern"',
    '"lamp"',
    "motivatedSourceAssetScore",
    "chooseMotivatedSourceAsset",
    'input.capability.id === "motivated_source"',
    'role.role === "context_subject"',
  ]) {
    assert(room.includes(marker), `A.11A.38 Qualification Room marker missing: ${marker}`);
  }

  assert(
    registry.includes('shot.lighting.motivated_source_entity_id = "context_subject";'),
    "Motivated-source demo must remain semantically bound to context_subject.",
  );

  for (const marker of [
    'high_key: coverage("lighting_rig", "explicit", "Uses a bright low-contrast base plus camera-relative bilateral front fill',
    'backlit: coverage("lighting_rig", "explicit", "Places a dedicated camera-relative source behind',
    'rim_lit: coverage("lighting_rig", "explicit", "Uses paired camera-relative rear-side lights',
    'warm_cool_contrast: coverage("lighting_rig", "explicit", "Uses opposing camera-relative warm and cool sources',
    'preserve_shadow: coverage("lighting_rig", "explicit", "Uses a strong readable key with deliberately restrained fill',
    'motivated_source: coverage("lighting_rig", "explicit", "Tracks a visible practical-source glow plus warm spotlight/spill',
  ]) {
    assert(coverage.includes(marker), `A.11A.38 runtime-coverage marker missing: ${marker}`);
  }

  console.log(
    "Director Lighting style & motivation Phase 1B.7A.11A.38 verification passed.",
  );
  console.log(
    "High key, Backlit, Rim lit, Warm/Cool, Preserve shadow, and Motivated source now own distinct visual semantics; Neutral studio and Low key remain frozen.",
  );
}

main();
