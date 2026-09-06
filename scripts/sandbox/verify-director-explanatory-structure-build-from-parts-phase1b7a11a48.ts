import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  buildActiveDirectorQualificationFamilies,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

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
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const a47 = source(
    "scripts/sandbox/verify-director-causal-clarity-consequence-proof-phase1b7a11a47.ts",
  );
  const a10b = source(
    "scripts/sandbox/verify-director-qualification-evidence-integrity-phase1b7a10b.ts",
  );
  const a9 = source(
    "scripts/sandbox/verify-director-qualification-presentation-phase1b7a9.ts",
  );

  const explanatoryFamily = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Explanatory structure",
  );
  assert(explanatoryFamily, "Active Explanatory structure family is missing.");
  assert(
    explanatoryFamily.capability_ids.join("|") === "build_from_parts",
    `A.11A.48 must not change Explanatory-structure membership: ${explanatoryFamily.capability_ids.join("|")}.`,
  );

  const buildFromPartsCapability = capability("build_from_parts");
  assert(
    buildFromPartsCapability.compiler.threejs === "compound",
    "Build from parts must remain a compound explanatory motif.",
  );
  assert(
    buildFromPartsCapability.summary ===
      "Introduce components in a controlled order, then resolve them into one functioning system.",
    "Build-from-parts semantic contract drifted.",
  );

  const buildFromParts = directorCapabilityDemoMoment(buildFromPartsCapability);
  assert(buildFromParts.shot, "Build-from-parts demo shot is missing.");
  assert(
    buildFromParts.shot.composition.keep_visible_entity_ids.includes(
      "primary_subject",
    ) &&
      buildFromParts.shot.composition.keep_visible_entity_ids.includes(
        "secondary_subject",
      ) &&
      buildFromParts.shot.composition.keep_visible_entity_ids.includes(
        "context_subject",
      ),
    "Build-from-parts production shot must preserve all three component roles.",
  );

  const secondaryEvent = buildFromParts.events.find(
    (event) => event.id === "demo_build_part_secondary",
  );
  const contextEvent = buildFromParts.events.find(
    (event) => event.id === "demo_build_part_context",
  );
  assert(
    secondaryEvent?.behaviour === "move_to" &&
      secondaryEvent.start_ms === 650 &&
      secondaryEvent.duration_ms === 3200,
    "Build-from-parts production first-component event drifted.",
  );
  assert(
    contextEvent?.behaviour === "move_to" &&
      contextEvent.start_ms === 2200 &&
      contextEvent.duration_ms === 3000,
    "Build-from-parts production second-component event drifted.",
  );

  for (const marker of [
    'if (capability.id === "build_from_parts") {',
    "A.11A.48: Qualification keeps the authored Build-from-parts grammar",
    'event.id === "demo_build_part_secondary"',
    "duration_ms: 2300",
    'event.id === "demo_build_part_context"',
    "start_ms: 3150",
    "duration_ms: 2100",
    "start_position: [-3.6, 0, -1.6]",
    "DIRECTOR_BUILD_PARTS_SECONDARY_ATTENTION_START = 0.06",
    "DIRECTOR_BUILD_PARTS_SECONDARY_ATTENTION_END = 0.5",
    "DIRECTOR_BUILD_PARTS_CONTEXT_ATTENTION_START = 0.42",
    "DIRECTOR_BUILD_PARTS_CONTEXT_ATTENTION_END = 0.78",
    "DIRECTOR_BUILD_PARTS_RESOLUTION_START = 0.74",
    "DIRECTOR_BUILD_PARTS_RESOLUTION_END = 0.86",
    "function qualificationBuildFromPartsPartAttentionAmount",
    "function qualificationBuildFromPartsResolutionAmount",
    'qualificationVisibilityAssist && capability.id === "build_from_parts"',
    "const buildPartAttention = buildFromPartsProof",
    'color={buildPartAttentionColor}',
    'if (capability.id === "build_from_parts" && qualificationVisibilityAssist)',
    "const sampledPrimary = sampledRolePosition(",
    "const sampledSecondary = sampledRolePosition(",
    "const sampledContext = sampledRolePosition(",
    "const systemRadius = THREE.MathUtils.clamp(",
    'color="#22d3ee"',
    "points={[",
    "sampledPrimary,",
    "sampledSecondary,",
    "sampledContext,",
    "moment={moment}",
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.48 Build-from-parts qualification marker missing: ${marker}`,
    );
  }

  const buildProofStart = preview.indexOf(
    'if (capability.id === "build_from_parts" && qualificationVisibilityAssist)',
  );
  const connectCauseStart = preview.indexOf(
    'if (capability.id === "connect_cause") {',
    buildProofStart,
  );
  assert(
    buildProofStart >= 0 && connectCauseStart > buildProofStart,
    "Build-from-parts shared-system resolution block is missing.",
  );
  const buildProofBlock = preview.slice(buildProofStart, connectCauseStart);
  const sampledRoleHelperStart = preview.indexOf("function sampledRolePosition(");
  const teachingRelationshipStart = preview.indexOf(
    "function TeachingRelationship({",
    sampledRoleHelperStart,
  );
  assert(
    sampledRoleHelperStart >= 0 && teachingRelationshipStart > sampledRoleHelperStart,
    "Build-from-parts sampled-role helper is missing.",
  );
  const sampledRoleHelperBlock = preview.slice(
    sampledRoleHelperStart,
    teachingRelationshipStart,
  );
  assert(
    sampledRoleHelperBlock.includes("sampleDirectorActorState") &&
      buildProofBlock.includes("sampledRolePosition(") &&
      buildProofBlock.includes("<ringGeometry") &&
      buildProofBlock.includes("<Line") &&
      buildProofBlock.includes('color="#22d3ee"'),
    "Build-from-parts final proof must resolve sampled actors into one shared visual system.",
  );

  const animatedActorStart = preview.indexOf("function AnimatedActor({");
  const rolePositionStart = preview.indexOf(
    "function rolePosition(",
    animatedActorStart,
  );
  assert(
    animatedActorStart >= 0 && rolePositionStart > animatedActorStart,
    "Animated-actor qualification emphasis block is missing.",
  );
  const animatedActorBlock = preview.slice(animatedActorStart, rolePositionStart);
  assert(
    animatedActorBlock.includes("!buildFromPartsProof") &&
      animatedActorBlock.includes('"#a78bfa"') &&
      animatedActorBlock.includes('"#f59e0b"') &&
      animatedActorBlock.includes('"#38bdf8"'),
    "Build-from-parts must replace the generic primary-only cue with ordered component attention.",
  );

  assert(
    room.includes("qualificationVisibilityAssist") &&
      room.includes('fixtureMode="real_assets"'),
    "Qualification Room must continue to opt real-asset previews into qualification-only assists.",
  );

  assert(
    a47.includes(
      "Director Causal clarity Phase 1B.7A.11A.47 consequence-proof verification passed.",
    ),
    "A.11A.48 predecessor A.11A.47 lineage is incomplete.",
  );
  for (const [label, verifierSource] of [
    ["A.10B", a10b],
    ["A.9", a9],
  ] as const) {
    assert(
      verifierSource.includes("recognizedSupportKinds") &&
        verifierSource.includes("unknownSupportKinds.length === 0") &&
        !verifierSource.includes("supportCounts.direct === 102"),
      `${label} successor-safe support-classification guard regressed.`,
    );
  }

  console.log(
    "Director Explanatory structure Phase 1B.7A.11A.48 Build-from-parts qualification verification passed.",
  );
  console.log(
    "Build from parts remains compound and production-authored; Qualification now separates component arrivals, transfers temporary attention to each arriving part, and resolves the settled trio with a restrained shared-system cue.",
  );
}

main();
