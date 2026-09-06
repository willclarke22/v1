import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  isDirectorQualificationCapabilityComposableModifier,
  isDirectorQualificationCapabilityCompoundNarrative,
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
  const registry = source(
    "sandbox/probe-lab/motion-camera-library/director-capability-registry.ts",
  );
  const familiesSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const room = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-qualification-room.tsx",
  );
  const a49 = source(
    "scripts/sandbox/verify-director-explanatory-structure-build-from-parts-occlusion-phase1b7a11a49.ts",
  );
  const a10b = source(
    "scripts/sandbox/verify-director-qualification-evidence-integrity-phase1b7a10b.ts",
  );
  const a9 = source(
    "scripts/sandbox/verify-director-qualification-presentation-phase1b7a9.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.50 must preserve the frozen 184-capability compatibility vocabulary.",
  );

  const frozenPacing = buildDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Pacing",
  );
  const activePacing = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Pacing",
  );
  assert(frozenPacing && activePacing, "Pacing qualification family is missing.");
  assert(
    frozenPacing.capability_ids.join("|") ===
      "hold_for_understanding|return_to_context|summarize",
    `Frozen Pacing compatibility membership drifted: ${frozenPacing.capability_ids.join("|")}.`,
  );
  assert(
    activePacing.capability_ids.join("|") === "return_to_context",
    `Active Pacing must independently qualify only Return to context: ${activePacing.capability_ids.join("|")}.`,
  );

  assert(
    DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS.join("|") ===
      "hold_for_understanding" &&
      isDirectorQualificationCapabilityComposableModifier(
        "hold_for_understanding",
      ),
    "Hold for understanding must be recorded as a composable pacing modifier.",
  );
  assert(
    DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS.join("|") ===
      "summarize" &&
      isDirectorQualificationCapabilityCompoundNarrative("summarize"),
    "Summarize must be recorded as a compound-only narrative verb.",
  );
  assert(
    DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_COMPONENTS_BY_ID.summarize.join(
      "|",
    ) === "return_to_context|hold_for_understanding",
    "Summarize must compose Return to context plus Hold for understanding.",
  );

  const hold = capability("hold_for_understanding");
  const returnToContext = capability("return_to_context");
  const summarize = capability("summarize");

  assert(
    hold.compiler.threejs === "compound" &&
      hold.director_instruction["operation_kind"] === "pacing_modifier" &&
      hold.director_instruction["preserve_preceding_resolved_composition"] ===
        true &&
      hold.director_instruction["camera_escalation"] === "stop" &&
      hold.director_instruction["terminal_hold_ms"] === 1700,
    "Hold for understanding must encode temporal preservation rather than a standalone visual primitive.",
  );
  assert(
    returnToContext.compiler.threejs === "compound" &&
      returnToContext.compiler.fallback_capability_id === "pull_out" &&
      returnToContext.director_instruction["operation_kind"] ===
        "visual_operation" &&
      returnToContext.director_instruction["primary_detail_role"] ===
        "primary_subject" &&
      Array.isArray(returnToContext.director_instruction["reveal_context_roles"]),
    "Return to context must remain the independent visual operation in Pacing.",
  );
  assert(
    summarize.compiler.threejs === "compound" &&
      summarize.compiler.fallback_capability_id === "return_to_context" &&
      summarize.director_instruction["operation_kind"] === "compound_narrative" &&
      Array.isArray(summarize.director_instruction["compose_capability_ids"]) &&
      summarize.director_instruction["finish_with_understanding_hold"] === true,
    "Summarize must compile as a higher-order narrative composition.",
  );

  // A.11A.50 must not rewrite the production Return-to-context demo recipe.
  const productionReturn = directorCapabilityDemoMoment(returnToContext);
  assert(productionReturn.shot, "Return-to-context production demo shot is missing.");
  assert(
    productionReturn.shot.composition.framing === "wide" &&
      productionReturn.shot.camera.focus_entity_ids.join("|") ===
        "primary_subject|secondary_subject" &&
      productionReturn.shot.camera.movement_steps[0]?.movement === "pull_back" &&
      productionReturn.shot.camera.movement_steps[0]?.strength === 0.58 &&
      productionReturn.shot.camera.movement_steps[0]?.end_progress === 0.72,
    "A.11A.50 must keep production Return-to-context cinematography unchanged; the stronger proof belongs only to Qualification.",
  );

  for (const marker of [
    'if (capability.id === "return_to_context") {',
    "A.11A.50: Qualification proves an actual detail -> context transition.",
    'framing: "close" as const',
    'focus_entity_ids: ["primary_subject"]',
    'movement: "pull_back" as const',
    "start_progress: 0.08",
    "end_progress: 0.72",
    "parameters: { distance_m: 4.8 }",
    'movement: "settle" as const',
    "hold_after_ms: 1200",
    'shot_type: "close_up" as const',
    'keepVisibleEntityIds = ["primary_subject"]',
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.50 Return-to-context Qualification marker missing: ${marker}`,
    );
  }

  const returnProofStart = preview.indexOf(
    'if (capability.id === "return_to_context") {',
  );
  const insideStart = preview.indexOf(
    'if (capability.id !== "inside") {',
    returnProofStart,
  );
  assert(
    returnProofStart >= 0 && insideStart > returnProofStart,
    "Return-to-context Qualification proof must execute before the generic Inside branch.",
  );
  const returnProofBlock = preview.slice(returnProofStart, insideStart);
  assert(
    returnProofBlock.includes('focus_entity_ids: ["primary_subject"]') &&
      returnProofBlock.includes("parameters: { distance_m: 4.8 }") &&
      returnProofBlock.includes("hold_after_ms: 1200"),
    "Return-to-context proof must begin on the detail, pull back materially, and settle for comprehension.",
  );

  // Keep the already-qualified Explanatory-structure lineage untouched.
  assert(
    preview.includes(
      "A.11A.49: move the final context component into a distinct",
    ) &&
      preview.includes("target_position: [-0.45, 0, -0.35]") &&
      a49.includes(
        "Director Explanatory structure Phase 1B.7A.11A.49 Build-from-parts occlusion verification passed.",
      ),
    "A.11A.50 must preserve the frozen A.11A.49 Build-from-parts proof.",
  );

  assert(
    familiesSource.includes(
      "DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS",
    ) &&
      familiesSource.includes(
        "DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS",
      ) &&
      familiesSource.includes(
        "!isDirectorQualificationCapabilityComposableModifier(capabilityId)",
      ) &&
      familiesSource.includes(
        "!isDirectorQualificationCapabilityCompoundNarrative(capabilityId)",
      ),
    "A.11A.50 active-family filtering markers are missing.",
  );
  assert(
    registry.includes('operation_kind: "pacing_modifier"') &&
      registry.includes('operation_kind: "compound_narrative"') &&
      registry.includes(
        'compose_capability_ids: ["return_to_context", "hold_for_understanding"]',
      ),
    "A.11A.50 Pacing registry semantics are missing.",
  );
  assert(
    room.includes("buildActiveDirectorQualificationFamilies"),
    "Qualification Room must continue to consume the active-family view.",
  );

  assert(
    a10b.includes(
      "classifiedCapabilityCount === DIRECTOR_CAPABILITIES.length",
    ) &&
      a10b.includes("unknownSupportKinds.length === 0"),
    "A.10B must remain successor-safe after Pacing support reclassification.",
  );
  assert(
    a9.includes("classifiedCapabilityCount === DIRECTOR_CAPABILITIES.length") &&
      a9.includes("unknownSupportKinds.length === 0"),
    "A.9 must remain successor-safe after Pacing support reclassification.",
  );

  console.log(
    "Director Pacing Phase 1B.7A.11A.50 Return-to-context closeout verification passed.",
  );
  console.log(
    "A.11A.50 preserves all three Pacing ids as compatibility vocabulary, treats Hold for understanding as a composable temporal modifier, treats Summarize as a compound narrative verb, and independently qualifies only Return to context with a close-detail -> pull-back -> context -> settle proof.",
  );
}

main();
