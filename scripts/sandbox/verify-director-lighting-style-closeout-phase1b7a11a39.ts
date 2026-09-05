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
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const a31 = source(
    "scripts/sandbox/verify-director-tracking-mounted-merge-closeout-phase1b7a11a31.ts",
  );
  const a38 = source(
    "scripts/sandbox/verify-director-lighting-style-motivation-phase1b7a11a38.ts",
  );

  for (const marker of [
    '"inside_object"',
    '"macro"',
    '"cutaway"',
    '"point_of_view"',
    '"lens_macro"',
    '"focus_shallow"',
    '"focus_deep"',
    '"extreme_close"',
    '"pass_through"',
    '"rim_lit"',
    '"warm_cool_contrast"',
  ]) {
    assert(
      families.includes(marker),
      `A.11A.39 deferred-capability lineage marker missing: ${marker}`,
    );
  }
  assert(
    families.includes("renderer/asset-sensitive to freeze honestly") &&
      families.includes("remove them from active Qualification coverage"),
    "A.11A.39 must record why Rim lit and Warm/Cool are deferred rather than silently deleting vocabulary.",
  );

  for (const marker of [
    "Lighting qualification must be self-proving",
    '"neutral_studio"',
    '"high_key"',
    '"low_key"',
    '"backlit"',
    '"rim_lit"',
    '"spotlight_subject"',
    '"highlight_subject"',
    '"warm_cool_contrast"',
    '"preserve_shadow"',
    '"motivated_source"',
    '"light_reveal"',
    '"dim_environment"',
    '"emissive_subject"',
    '"track_spotlight"',
    '"shadow_projection"',
    '"volumetric_beam"',
    '"exposure_shift"',
    "const lightingEffectOwnsAttention = [",
    "<ringGeometry args={[0.82, 1.02, 48]} />",
  ]) {
    assert(preview.includes(marker), `A.11A.39 lighting-ring marker missing: ${marker}`);
  }
  assert(
    preview.includes("!lightingEffectOwnsAttention") &&
      preview.includes('capability.category === "narrative_attention" || capability.category === "lighting_emphasis"'),
    "A.11A.39 must suppress the generic cyan ring for lighting while retaining the shared narrative-attention actor path.",
  );

  // Successor-safe: A.11A.39 owns the first two honest lighting deferrals and
  // retirement of the generic cyan subject ring, not the forever-active sibling list.
  for (const marker of [
    'selectedFamily?.category === "lighting_emphasis"',
    'selectedFamily.group === "Lighting style & motivation"',
    "Rim lit",
    "Warm / cool contrast",
    "deferred from active",
    "Qualification Room coverage",
    "Neutral studio",
    "High key",
    "Preserve shadow",
    "Motivated source",
    "generic cyan subject ring",
  ]) {
    assert(room.includes(marker), `A.11A.39 Qualification Room successor-safe marker missing: ${marker}`);
  }

  for (const marker of [
    'mode === "backlit"',
    ".addScaledVector(toCamera, -2.7)",
    ".addScaledVector(right, -0.55)",
    "lightA.intensity = 13;",
    "lightB.intensity = 5;",
    'intensity={mode === "backlit" ? 13',
    'intensity={mode === "backlit" ? 5',
    "const preserveShadow = intents.has(\"preserve_shadow\");",
    "function DirectorMotivatedSourceLight",
    "function DirectorVolumetricBeam",
    "function DirectorExposureShift",
    "lightReveal ? 0.025",
  ]) {
    assert(runtime.includes(marker), `A.11A.39 runtime/frozen-sibling marker missing: ${marker}`);
  }

  // Successor-safe lineage: A.11A.31 must delegate the global active count to
  // the centralized live policy. Later phases may add truthful non-active
  // categories (for example merge candidates) without rewriting mounted-camera
  // semantics. Keep the original completed-merge canary, but do not freeze an
  // A.11A.31-era arithmetic decomposition of every future exclusion category.
  assert(
    !a31.includes("expectedActive === 174") &&
      !a31.includes("DIRECTOR_CAPABILITIES.length -") &&
      a31.includes("directorQualificationExpectedActiveCapabilityCount(") &&
      a31.includes("centralized live Qualification-active policy") &&
      !a31.includes("merged.length === 1") &&
      a31.includes("merged.includes(legacyId)") &&
      a31.includes("camera_object_attached"),
    "A.11A.31 must derive global active coverage from the centralized live policy while retaining its mounted-camera completed-merge invariant without freezing future merged-alias cardinality.",
  );

  for (const marker of [
    "Director Lighting style & motivation Phase 1B.7A.11A.38 verification passed.",
    "DIRECTOR_LIGHTING_STYLE_MOTIVATION_FIXTURE_POLICY_VERSION",
    "chooseMotivatedSourceAsset",
  ]) {
    assert(a38.includes(marker), `A.11A.38 predecessor lineage marker missing: ${marker}`);
  }

  console.log(
    "Director Lighting style & motivation Phase 1B.7A.11A.39 verification passed.",
  );
  console.log(
    "Generic cyan lighting rings are retired; Rim lit and Warm/Cool are deferred from active qualification; Backlit gets one final readability polish; accepted siblings and A.11A.37 effects remain protected.",
  );
}

main();
