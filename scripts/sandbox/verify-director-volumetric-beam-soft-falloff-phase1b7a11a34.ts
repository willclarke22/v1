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
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );

  for (const marker of [
    "function DirectorVolumetricBeam",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_SCALE = 0.34",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_MIN = 0.34",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_MAX = 0.72",
    "DIRECTOR_VOLUMETRIC_BEAM_FALLOFF_TEXTURE_SIZE = 96",
    "function createDirectorVolumetricBeamFalloffTexture",
    "new THREE.DataTexture(",
    "texture.minFilter = THREE.LinearFilter;",
    "texture.magFilter = THREE.LinearFilter;",
    "alphaMap={beamFalloffTexture}",
    "beamFalloffTexture.dispose();",
    "THREE.AdditiveBlending",
  ]) {
    assert(runtime.includes(marker), `A.11A.34 soft-beam invariant missing: ${marker}`);
  }

  for (const retired of [
    "DIRECTOR_VOLUMETRIC_BEAM_OUTER_OPACITY",
    "DIRECTOR_VOLUMETRIC_BEAM_MIDDLE_OPACITY",
    "DIRECTOR_VOLUMETRIC_BEAM_CORE_OPACITY",
    '<cylinderGeometry args={[1, 0.12, 1, 48, 1, true]} />',
    '<cylinderGeometry args={[1, 0.1, 1, 48, 1, true]} />',
    '<cylinderGeometry args={[1, 0.08, 1, 36, 1, true]} />',
  ]) {
    assert(
      !runtime.includes(retired),
      `A.11A.34 must keep the discrete hard-edged beam shell retired: ${retired}`,
    );
  }

  assert(
    coverage.includes("soft-alpha beam") &&
      coverage.includes("source-to-subject axis"),
    "Runtime coverage must retain an explicit soft-alpha source-to-subject Volumetric-beam implementation.",
  );

  // Preserve the three siblings already accepted from earlier lighting evidence.
  for (const marker of [
    "function DirectorShadowProjectionKey",
    "return THREE.MathUtils.lerp(0.42, 1.58, shiftAmount);",
  ]) {
    assert(runtime.includes(marker), `A.11A.34 sibling-preservation marker missing: ${marker}`);
  }
  assert(
    registry.includes("shot.reveal_at = 0.34;") &&
      registry.includes("shot.reveal_at = 0.16;"),
    "A.11A.34 must preserve the accepted Light Reveal and Exposure Shift authored timings.",
  );
  assert(
    preview.includes('<mesh position={[0.8, 1.9, -2.4]} receiveShadow>') &&
      preview.includes('<boxGeometry args={[9.2, 4.8, 0.12]} />'),
    "A.11A.34 must preserve the accepted Shadow Projection receiver composition.",
  );

  console.log(
    "Director Volumetric Beam Phase 1B.7A.11A.34 successor-safe verification passed.",
  );
  console.log(
    "Volumetric Beam retains continuous soft-alpha falloff and an explicit source-to-subject path while later successors may refine the camera-facing presentation; Light Reveal, Shadow Projection, and Exposure Shift remain untouched.",
  );
}

main();
