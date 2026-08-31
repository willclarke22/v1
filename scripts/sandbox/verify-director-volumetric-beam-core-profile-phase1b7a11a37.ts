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
  const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
  const prior = source(
    "scripts/sandbox/verify-director-volumetric-beam-brightness-phase1b7a11a36.ts",
  );

  for (const marker of [
    "DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH = 3.7",
    "DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_OPACITY = 0.42",
    "DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_OUTER_OPACITY = 0.28",
    "DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_CORE_OPACITY = 1",
    "DIRECTOR_VOLUMETRIC_BEAM_SPOT_ANGLE = 0.29",
    "DIRECTOR_VOLUMETRIC_BEAM_SPOT_INTENSITY = 8.4",
    "const targetCoreBoost = THREE.MathUtils.lerp(",
    "0.94,",
    "1.14,",
    "THREE.MathUtils.smoothstep(v, 0.2, 0.9)",
    "const outerHaze = Math.pow(Math.max(0, edgeFade), 1.55);",
    "2.15,",
    "outerHaze * 0.36 + innerCore * 0.78 * targetCoreBoost",
    "longitudinalFade *",
    "1.03,",
  ]) {
    assert(runtime.includes(marker), `A.11A.37 core-profile marker missing: ${marker}`);
  }

  for (const retired of [
    "DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH = 4.0",
    "const outerHaze = Math.pow(Math.max(0, edgeFade), 0.9);",
    "outerHaze * (0.72 + innerCore * 0.43) * longitudinalFade * 1.08",
  ]) {
    assert(
      !runtime.includes(retired),
      `A.11A.37 must retire the over-broad/uniform A.11A.36 profile: ${retired}`,
    );
  }

  assert(
    coverage.includes("brighter, fuller camera-facing tapered soft-alpha beam surface") &&
      coverage.includes("visible light volume"),
    "A.11A.37 must preserve the A.11A.36 brightness/body runtime contract.",
  );

  assert(
    !prior.includes('DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH = 4.0') &&
      !prior.includes('const outerHaze = Math.pow(Math.max(0, edgeFade), 0.9);') &&
      prior.includes('A.11A.36 bright-beam invariant missing'),
    "A.11A.36 verifier must be successor-safe and must not pin the superseded uniform profile.",
  );

  console.log(
    "Director Volumetric Beam Phase 1B.7A.11A.37 core-profile verification passed.",
  );
  console.log(
    "Volumetric Beam keeps A.11A.36 brightness while narrowing the shaft, reducing outer-haze energy, strengthening center-to-edge contrast, and biasing core energy toward the subject.",
  );
}

main();
