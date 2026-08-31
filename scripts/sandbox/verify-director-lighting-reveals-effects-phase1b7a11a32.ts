import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildActiveDirectorQualificationFamilies,
  directorQualificationExpectedActiveCapabilityCount,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  directorVisualAuditDefinition,
} from "../../sandbox/probe-lab/motion-camera-library/director-visual-audit";
import {
  DIRECTOR_LIGHTING_RUNTIME_COVERAGE,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";
import {
  directorExposureShiftForProgress,
  directorLightingRevealAmount,
} from "../../sandbox/probe-lab/scenes/ui/director-shot-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  const ids = [
    "light_reveal",
    "shadow_projection",
    "volumetric_beam",
    "exposure_shift",
  ] as const;

  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const family = activeFamilies.find(
    (item) =>
      item.category === "lighting_emphasis" &&
      item.group === "Lighting reveals & effects",
  );
  assert(family, "Lighting reveals & effects qualification family is missing.");
  assert(
    family.capability_ids.join("|") === ids.join("|"),
    `Unexpected Lighting reveals & effects membership: ${family.capability_ids.join("|")}.`,
  );

  const activeCount = activeFamilies.reduce(
    (sum, item) => sum + item.capability_ids.length,
    0,
  );
  assert(
    activeCount === directorQualificationExpectedActiveCapabilityCount(DIRECTOR_CAPABILITIES),
    `A.11A.32 must preserve centralized active Qualification membership. Got ${activeCount}.`,
  );

  for (const id of ids) {
    const item = capability(id);
    const moment = directorCapabilityDemoMoment(item);
    const shot = moment.shot;
    assert(shot, `${id} demo must author a Director shot.`);
    assert(
      shot.lighting.intents.length === 1 &&
        shot.lighting.intents[0] === id &&
        shot.lighting.emphasized_entity_ids.join("|") === "primary_subject",
      `${id} must author its own lighting intent on the primary teaching subject.`,
    );
    const audit = directorVisualAuditDefinition(item);
    assert(
      audit.fixture === "lighting_stage" && audit.expected_behavior.length >= 4,
      `${id} must carry capability-specific lighting-stage perceptual expectations.`,
    );
  }

  const revealMoment = directorCapabilityDemoMoment(capability("light_reveal"));
  const revealShot = revealMoment.shot;
  assert(revealShot, "Light reveal demo must author a Director shot.");
  assert(
    revealShot.reveal_at === 0.34 &&
      revealShot.composition.keep_visible_entity_ids.join("|") ===
        "primary_subject",
    "Light reveal must use the bounded single-subject reveal demo authored at 0.34 progress.",
  );
  const revealBefore = directorLightingRevealAmount(0.2, 0.34);
  const revealMiddle = directorLightingRevealAmount(0.48, 0.34);
  const revealHeld = directorLightingRevealAmount(0.72, 0.34);
  assert(
    revealBefore === 0 && revealMiddle >= 0.7 && revealHeld === 1,
    `Light reveal must stay dark before the cue, ramp strongly, then hold. before=${revealBefore.toFixed(3)} middle=${revealMiddle.toFixed(3)} held=${revealHeld.toFixed(3)}.`,
  );

  const exposureMoment = directorCapabilityDemoMoment(capability("exposure_shift"));
  const exposureShot = exposureMoment.shot;
  assert(exposureShot, "Exposure shift demo must author a Director shot.");
  assert(
    exposureShot.reveal_at === 0.16,
    "Exposure shift must author the qualification transition start explicitly.",
  );
  const exposureStart = directorExposureShiftForProgress(0, 0.16);
  const exposureMiddle = directorExposureShiftForProgress(0.41, 0.16);
  const exposureEnd = directorExposureShiftForProgress(0.9, 0.16);
  assert(
    exposureStart <= 0.43 &&
      exposureMiddle > 0.9 &&
      exposureMiddle < 1.2 &&
      exposureEnd >= 1.57 &&
      exposureEnd - exposureStart >= 1.1,
    `Exposure shift must create an unmistakable whole-frame dynamic range. start=${exposureStart.toFixed(3)} middle=${exposureMiddle.toFixed(3)} end=${exposureEnd.toFixed(3)}.`,
  );

  assert(
    DIRECTOR_LIGHTING_RUNTIME_COVERAGE.shadow_projection.mode === "explicit" &&
      DIRECTOR_LIGHTING_RUNTIME_COVERAGE.volumetric_beam.mode === "explicit" &&
      DIRECTOR_LIGHTING_RUNTIME_COVERAGE.exposure_shift.mode === "explicit",
    "Shadow projection, Volumetric beam, and Exposure shift must no longer be shared/fallback lighting approximations.",
  );

  const runtime = source("sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx");
  for (const marker of [
    "function DirectorVolumetricBeam",
    "THREE.AdditiveBlending",
    "function DirectorExposureShift",
    "gl.toneMappingExposure = directorExposureShiftForProgress",
    "lightReveal ? 0.025",
    "function DirectorShadowProjectionKey",
  ]) {
    assert(runtime.includes(marker), `A.11A.32 lighting runtime marker missing: ${marker}`);
  }
  assert(
    !runtime.includes(
      'intents.has("emissive_subject") || intents.has("volumetric_beam")',
    ),
    "Volumetric beam must not route through the old emissive-subject fallback.",
  );

  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  for (const marker of [
    "const lightingEffectOwnsAttention = [",
    'const shadowProjection = capabilityId === "shadow_projection";',
    'receiveShadow',
    'moment.shot?.lighting.intents.includes("volumetric_beam")',
  ]) {
    assert(preview.includes(marker), `A.11A.32 preview marker missing: ${marker}`);
  }

  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  assert(
    room.includes("const qualificationShadowsEnabled =") &&
      room.includes('previewCapability.id === "shadow_projection"') &&
      room.includes('previewCapability.id === "preserve_shadow"') &&
      room.includes("shadows={qualificationShadowsEnabled}"),
    "Qualification must enable renderer shadows only for the shadow-dependent lighting proofs rather than globally disabling them.",
  );

  const coverage = source("sandbox/probe-lab/scenes/director-runtime-coverage.ts");
  assert(
    !coverage.includes("Currently uses subject-tracked emissive light; volumetric rendering fidelity is Phase 1B.") &&
      !coverage.includes("Changes key-light intensity to imply an exposure shift."),
    "Runtime coverage documentation must not retain the superseded Volumetric-beam or Exposure-shift approximations.",
  );

  console.log(
    "Director Lighting reveals & effects Phase 1B.7A.11A.32 verification passed.",
  );
  console.log(
    "Light reveal now proves selective dark-to-readable illumination, Shadow projection has a real receiver/shadow-map proof, Volumetric beam owns a visible light shaft, and Exposure shift owns global renderer exposure.",
  );
}

main();
