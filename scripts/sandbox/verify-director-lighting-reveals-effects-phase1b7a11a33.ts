import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );

  for (const marker of [
    'const shadowProjection = capabilityId === "shadow_projection";',
    '<mesh position={[0.8, 1.9, -2.4]} receiveShadow>',
    '<boxGeometry args={[9.2, 4.8, 0.12]} />',
    '<meshStandardMaterial color="#334155" roughness={0.96} metalness={0} />',
  ]) {
    assert(preview.includes(marker), `A.11A.33 shadow receiver marker missing: ${marker}`);
  }
  assert(
    !preview.includes('<planeGeometry args={[6.6, 3.6]} />'),
    "A.11A.33 must retire the small gray-card Shadow projection receiver.",
  );

  // A.11A.33 owns the durable semantic result, not one later-superseded beam mesh layout.
  // Later beam refinements may replace groups/sheets/billboards as long as the explicit
  // additive source-to-subject Volumetric Beam implementation remains present.
  for (const marker of [
    "function DirectorShadowProjectionKey",
    "const sourceOffsetRef = useRef(new THREE.Vector3(-2.7, 1.05, 5.2));",
    "targetPoint.y += actor ? Math.max(0.18, actor.size[1] * 0.48) : 0.75;",
    "<DirectorShadowProjectionKey",
    "function DirectorVolumetricBeam",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_SCALE = 0.34",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_MIN = 0.34",
    "DIRECTOR_VOLUMETRIC_BEAM_TARGET_RADIUS_MAX = 0.72",
    "THREE.AdditiveBlending",
  ]) {
    assert(runtime.includes(marker), `A.11A.33 durable lighting invariant missing: ${marker}`);
  }
  assert(
    !runtime.includes("const beamRef = useRef<THREE.Mesh>(null);"),
    "A.11A.33 must keep the retired original single hard-edged Volumetric-beam implementation retired.",
  );

  // The two siblings accepted from the A.11A.32 evidence remain untouched in semantics.
  for (const marker of [
    "return THREE.MathUtils.lerp(0.42, 1.58, shiftAmount);",
    "lightReveal ? 0.025",
    "shot.reveal_at = 0.34;",
    "shot.reveal_at = 0.16;",
  ]) {
    assert(
      runtime.includes(marker) || registry.includes(marker),
      `A.11A.33 must preserve frozen Light Reveal / Exposure Shift marker: ${marker}`,
    );
  }

  console.log(
    "Director Lighting reveals & effects Phase 1B.7A.11A.33 successor-safe verification passed.",
  );
  console.log(
    "Shadow projection retains its integrated receiver and subject-relative key; Volumetric Beam retains an explicit additive source-to-subject path without freezing a superseded mesh presentation, and Light Reveal / Exposure Shift remain unchanged.",
  );
}

main();
