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
  const fixture = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-fixture-policy.ts",
  );
  const a39 = source(
    "scripts/sandbox/verify-director-lighting-style-closeout-phase1b7a11a39.ts",
  );
  const a38 = source(
    "scripts/sandbox/verify-director-lighting-style-motivation-phase1b7a11a38.ts",
  );

  const deferredStart = families.indexOf(
    "export const DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS = [",
  );
  assert(deferredStart >= 0, "Central deferred-capability set is missing.");
  const deferredEnd = families.indexOf("] as const;", deferredStart);
  assert(deferredEnd > deferredStart, "Central deferred-capability set is malformed.");
  const deferredBlock = families.slice(deferredStart, deferredEnd);
  for (const id of ["rim_lit", "warm_cool_contrast", "backlit"]) {
    assert(
      deferredBlock.includes(`"${id}"`),
      `A.11A.40 lighting deferral missing from central set: ${id}`,
    );
  }
  assert(
    deferredBlock.includes("A.11A.40") &&
      deferredBlock.includes("renderer/material-sensitive") &&
      deferredBlock.includes("defer active qualification"),
    "A.11A.40 must record why Backlit is deferred rather than deleting its vocabulary/runtime surface.",
  );

  for (const marker of [
    'const hideStageBoundaryGuide = capabilityId === "motivated_source";',
    "Motivated Source must be proved by the visible practical light",
    "{!hideStageBoundaryGuide ? (",
    '<ringGeometry args={[4.8, 4.84, 72]} />',
    "const lightingEffectOwnsAttention = [",
    "!lightingEffectOwnsAttention",
  ]) {
    assert(preview.includes(marker), `A.11A.40 preview marker missing: ${marker}`);
  }

  for (const marker of [
    'selectedFamily?.category === "lighting_emphasis"',
    'selectedFamily.group === "Lighting style & motivation"',
    "Rim lit, Warm / cool contrast, and Backlit are deferred from active",
    "The active reel now contains Neutral studio, High key, Low",
    "key, Preserve shadow, and Motivated source",
    "Motivated source also suppresses the generic stage-boundary",
  ]) {
    assert(room.includes(marker), `A.11A.40 Qualification Room marker missing: ${marker}`);
  }
  assert(
    !room.includes(
      "High key, Low key, Backlit, Preserve shadow, and Motivated source",
    ),
    "A.11A.40 must not keep describing deferred Backlit as active Qualification coverage.",
  );

  // Freeze the five accepted lighting implementations and the A.11A.37 effects
  // semantically. A.11A.40 does not re-author the runtime or fixture policy.
  for (const marker of [
    'mode === "high_key"',
    'const lowKey =',
    'intents.has("low_key")',
    'const preserveShadow = intents.has("preserve_shadow");',
    "function DirectorMotivatedSourceLight",
    "const sourceId = shot.lighting.motivated_source_entity_id;",
    "function DirectorVolumetricBeam",
    "function DirectorExposureShift",
    "function DirectorShadowProjectionKey",
    "lightReveal ? 0.025",
  ]) {
    assert(runtime.includes(marker), `A.11A.40 frozen runtime marker missing: ${marker}`);
  }
  for (const marker of [
    "DIRECTOR_LIGHTING_STYLE_MOTIVATION_FIXTURE_POLICY_VERSION",
    "directorQualificationLightingStyleMotivationAssetRoles",
  ]) {
    assert(fixture.includes(marker), `A.11A.40 frozen fixture marker missing: ${marker}`);
  }

  assert(
    a39.includes("Successor-safe: A.11A.39 owns the first two honest lighting deferrals") &&
      !a39.includes("High key, Low key, Backlit, Preserve shadow, and Motivated source"),
    "A.11A.39 predecessor verifier must be successor-safe for the final Backlit deferral.",
  );
  for (const marker of [
    "Director Lighting style & motivation Phase 1B.7A.11A.38 verification passed.",
    "chooseMotivatedSourceAsset",
  ]) {
    assert(a38.includes(marker), `A.11A.38 predecessor lineage marker missing: ${marker}`);
  }

  console.log(
    "Director Lighting style & motivation Phase 1B.7A.11A.40 verification passed.",
  );
  console.log(
    "Backlit joins Rim lit and Warm/Cool as an honest deferral; Motivated Source drops the stage-boundary guide; the five accepted lighting implementations remain frozen for final cross-asset evidence.",
  );
}

main();
