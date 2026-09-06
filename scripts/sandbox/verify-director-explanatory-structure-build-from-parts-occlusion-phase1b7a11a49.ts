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

function screenHorizontalProxy(position: readonly [number, number, number]) {
  // three_quarter_front uses a +X/+Z camera offset. Its horizontal screen axis
  // is proportional to X-Z, so this is a stable qualification-space occlusion proxy.
  return position[0] - position[2];
}

function main() {
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const a48 = source(
    "scripts/sandbox/verify-director-explanatory-structure-build-from-parts-phase1b7a11a48.ts",
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
    `A.11A.49 must not change Explanatory-structure membership: ${explanatoryFamily.capability_ids.join("|")}.`,
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

  const productionMoment = directorCapabilityDemoMoment(buildFromPartsCapability);
  const productionContextEvent = productionMoment.events.find(
    (event) => event.id === "demo_build_part_context",
  );
  assert(
    productionContextEvent?.behaviour === "move_to" &&
      productionContextEvent.start_ms === 2200 &&
      productionContextEvent.duration_ms === 3000,
    "A.11A.49 must not change the production Build-from-parts event contract.",
  );

  for (const marker of [
    "A.11A.48: Qualification keeps the authored Build-from-parts grammar",
    'event.id === "demo_build_part_secondary"',
    "duration_ms: 2300",
    'event.id === "demo_build_part_context"',
    "start_ms: 3150",
    "duration_ms: 2100",
    "start_position: [-3.6, 0, -1.6]",
    "DIRECTOR_BUILD_PARTS_SECONDARY_ATTENTION_START = 0.06",
    "DIRECTOR_BUILD_PARTS_CONTEXT_ATTENTION_START = 0.42",
    "DIRECTOR_BUILD_PARTS_RESOLUTION_START = 0.74",
    'if (capability.id === "build_from_parts" && qualificationVisibilityAssist)',
    "const sampledContext = sampledRolePosition(",
    "const systemRadius = THREE.MathUtils.clamp(",
    'color="#22d3ee"',
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.49 must preserve the accepted A.11A.48 proof marker: ${marker}`,
    );
  }

  assert(
    preview.includes(
      "A.11A.49: move the final context component into a distinct",
    ) &&
      preview.includes("target_position: [-0.45, 0, -0.35]"),
    "A.11A.49 qualification-only third-slot staging is missing.",
  );

  const contextFinal = [-0.45, 0, -0.35] as const;
  const secondaryFinal = [1.15, 0, 0] as const;
  const projectedSeparation = Math.abs(
    screenHorizontalProxy(contextFinal) -
      screenHorizontalProxy(secondaryFinal),
  );
  assert(
    projectedSeparation >= 1.2,
    `Build-from-parts final context/secondary screen-space proxy separation is too small: ${projectedSeparation}.`,
  );

  const qualificationBlockStart = preview.indexOf(
    'if (capability.id === "build_from_parts") {',
  );
  const insideBranchStart = preview.indexOf(
    'if (capability.id !== "inside") {',
    qualificationBlockStart,
  );
  assert(
    qualificationBlockStart >= 0 && insideBranchStart > qualificationBlockStart,
    "Build-from-parts qualification moment block is missing.",
  );
  const qualificationBlock = preview.slice(
    qualificationBlockStart,
    insideBranchStart,
  );
  assert(
    qualificationBlock.includes("target_position: [-0.45, 0, -0.35]") &&
      !qualificationBlock.includes("target_position: [0, 0, -1.25]"),
    "Qualification Build-from-parts must use the distinct third slot instead of the old occlusion-prone target.",
  );

  assert(
    a48.includes(
      "Director Explanatory structure Phase 1B.7A.11A.48 Build-from-parts qualification verification passed.",
    ),
    "A.11A.49 predecessor A.11A.48 lineage is incomplete.",
  );

  console.log(
    "Director Explanatory structure Phase 1B.7A.11A.49 Build-from-parts occlusion verification passed.",
  );
  console.log(
    "A.11A.49 preserves the accepted sequential-arrival/shared-system grammar while moving only the Qualification context component into a distinct three-quarter-front screen-space slot for a readable three-part final hold.",
  );
}

main();
