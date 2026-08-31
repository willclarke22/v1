import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function main() {
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const prior = source(
    "scripts/sandbox/verify-director-volumetric-beam-soft-falloff-phase1b7a11a34.ts",
  );
  const priorA33 = source(
    "scripts/sandbox/verify-director-lighting-reveals-effects-phase1b7a11a33.ts",
  );

  for (const marker of [
    "function DirectorVolumetricBeam",
    'texture.name = "director-volumetric-beam-camera-facing-falloff";',
    "const beamMeshRef = useRef<THREE.Mesh>(null);",
    "const beamEndRef = useRef(new THREE.Vector3());",
    "const cameraFacingRef = useRef(new THREE.Vector3());",
    "const rightRef = useRef(new THREE.Vector3());",
    "const billboardMatrixRef = useRef(new THREE.Matrix4());",
    "const taper = THREE.MathUtils.lerp(",
    "const normalizedRadius = taper > 1e-6 ? radial / taper : 2;",
    "const outerHaze = Math.pow(",
    "const innerCore = Math.pow(",
    ".addScaledVector(direction, targetRadius * 0.85);",
    "useFrame(({ clock, camera }) => {",
    "cameraFacing.addScaledVector(direction, -cameraFacing.dot(direction));",
    ".crossVectors(direction, cameraFacing)",
    "billboardMatrixRef.current.makeBasis(right, direction, cameraFacing);",
    "beamMesh.quaternion.setFromRotationMatrix(billboardMatrixRef.current);",
    "targetRadius * DIRECTOR_VOLUMETRIC_BEAM_BILLBOARD_WIDTH",
    "alphaMap={beamFalloffTexture}",
    "THREE.AdditiveBlending",
    "penumbra={0.92}",
  ]) {
    assert(runtime.includes(marker), `A.11A.35 camera-facing beam marker missing: ${marker}`);
  }

  assert(
    occurrences(runtime, '<planeGeometry args={[1, 1, 1, 1]} />') === 1,
    "A.11A.35 must use exactly one camera-facing beam plane.",
  );

  for (const retired of [
    "const beamGroupRef = useRef<THREE.Group>(null);",
    "DIRECTOR_VOLUMETRIC_BEAM_SHEET_WIDTH",
    "DIRECTOR_VOLUMETRIC_BEAM_SHEET_OPACITY",
    "rotation={[0, Math.PI / 2, 0]}",
    "exactly two crossed soft-alpha beam sheets",
  ]) {
    assert(
      !runtime.includes(retired),
      `A.11A.35 must retire the crossed-sheet beam presentation: ${retired}`,
    );
  }

  assert(
    coverage.includes("camera-facing tapered soft-alpha beam surface") &&
      coverage.includes("through-subject extension"),
    "Runtime coverage must retain the camera-facing tapered Volumetric Beam contract.",
  );

  for (const stalePriorMarker of [
    "DIRECTOR_VOLUMETRIC_BEAM_SHEET_WIDTH = 2.6",
    "DIRECTOR_VOLUMETRIC_BEAM_SHEET_OPACITY = 0.12",
    "exactly two crossed soft-alpha beam sheets",
    "rotation={[0, Math.PI / 2, 0]}",
  ]) {
    assert(
      !prior.includes(stalePriorMarker),
      `A.11A.34 verifier must be successor-safe and not veto A.11A.35: ${stalePriorMarker}`,
    );
  }

  assert(
    !priorA33.includes("const beamGroupRef = useRef<THREE.Group>(null);") &&
      priorA33.includes("function DirectorVolumetricBeam") &&
      priorA33.includes("THREE.AdditiveBlending"),
    "A.11A.33 verifier must retain the explicit additive beam invariant without requiring a superseded beamGroupRef implementation.",
  );

  assert(
    runtime.includes("function DirectorShadowProjectionKey") &&
      runtime.includes("return THREE.MathUtils.lerp(0.42, 1.58, shiftAmount);") &&
      registry.includes("shot.reveal_at = 0.34;") &&
      registry.includes("shot.reveal_at = 0.16;") &&
      preview.includes('<mesh position={[0.8, 1.9, -2.4]} receiveShadow>'),
    "A.11A.35 successors must leave Light Reveal, Shadow Projection, and Exposure Shift unchanged.",
  );

  console.log(
    "Director Volumetric Beam Phase 1B.7A.11A.35 successor-safe camera-facing verification passed.",
  );
}

main();
