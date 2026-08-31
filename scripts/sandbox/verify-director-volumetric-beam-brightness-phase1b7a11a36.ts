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
    "scripts/sandbox/verify-director-volumetric-beam-camera-facing-phase1b7a11a35.ts",
  );

  for (const marker of [
    "DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH",
    "DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_OPACITY",
    "DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_OUTER_OPACITY",
    "DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_CORE_OPACITY",
    "DIRECTOR_VOLUMETRIC_BEAM_SPOT_ANGLE",
    "DIRECTOR_VOLUMETRIC_BEAM_SPOT_INTENSITY",
    "const outerHaze = Math.pow(",
    "const innerCore = Math.pow(",
    "opacity={DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_OUTER_OPACITY}",
    "opacity={DIRECTOR_VOLUMETRIC_BEAM_SOURCE_GLOW_CORE_OPACITY}",
    "angle={DIRECTOR_VOLUMETRIC_BEAM_SPOT_ANGLE}",
    "intensity={DIRECTOR_VOLUMETRIC_BEAM_SPOT_INTENSITY}",
  ]) {
    assert(runtime.includes(marker), `A.11A.36 bright-beam invariant missing: ${marker}`);
  }

  assert(
    coverage.includes("brighter, fuller camera-facing tapered soft-alpha beam surface") &&
      coverage.includes("visible light volume"),
    "Runtime coverage must retain the brighter/fuller A.11A.36 Volumetric Beam contract.",
  );

  assert(
    !prior.includes('DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH = 3.35') &&
      !prior.includes('DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_OPACITY = 0.24') &&
      prior.includes('A.11A.35 camera-facing beam marker missing'),
    "A.11A.35 verifier must remain successor-safe and must not hardcode the old dim tuning.",
  );

  console.log(
    "Director Volumetric Beam Phase 1B.7A.11A.36 successor-safe brightness/body verification passed.",
  );
}

main();
