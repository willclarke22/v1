import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  isDirectorQualificationCapabilityRevealCompoundNarrative,
  isDirectorQualificationCapabilityVisibilityModifier,
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
  const runtime = source(
    "sandbox/probe-lab/scenes/ui/director-shot-runtime.tsx",
  );
  const a50 = source(
    "scripts/sandbox/verify-director-pacing-return-to-context-closeout-phase1b7a11a50.ts",
  );
  const a49 = source(
    "scripts/sandbox/verify-director-explanatory-structure-build-from-parts-occlusion-phase1b7a11a49.ts",
  );
  const a46 = source(
    "scripts/sandbox/verify-director-attention-sequence-reveal-readability-phase1b7a11a46.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.51 must preserve the frozen 184-capability compatibility vocabulary.",
  );

  const frozenReveal = buildDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Reveal grammar",
  );
  const activeReveal = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Reveal grammar",
  );
  assert(
    frozenReveal && activeReveal,
    "Reveal-grammar qualification family is missing.",
  );
  assert(
    frozenReveal.capability_ids.join("|") ===
      "conceal|foreshadow|reverse_assumption",
    `Frozen Reveal-grammar compatibility membership drifted: ${frozenReveal.capability_ids.join("|")}.`,
  );
  assert(
    activeReveal.capability_ids.join("|") === "foreshadow",
    `Active Reveal grammar must independently qualify only Foreshadow: ${activeReveal.capability_ids.join("|")}.`,
  );

  assert(
    DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS.join("|") ===
      "conceal" &&
      isDirectorQualificationCapabilityVisibilityModifier("conceal"),
    "Conceal must be recorded as a composable visibility/staging modifier.",
  );
  assert(
    DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS.join("|") ===
      "reverse_assumption" &&
      isDirectorQualificationCapabilityRevealCompoundNarrative(
        "reverse_assumption",
      ),
    "Reverse assumption must be recorded as a compound-only narrative verb.",
  );
  assert(
    DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_COMPONENTS_BY_ID.reverse_assumption.join(
      "|",
    ) === "isolate|reveal|hold_for_understanding",
    "Reverse assumption must compose existing attention/reveal/hold operations rather than claim a unique camera primitive.",
  );

  const conceal = capability("conceal");
  const foreshadow = capability("foreshadow");
  const reverseAssumption = capability("reverse_assumption");

  assert(
    conceal.compiler.threejs === "compound" &&
      conceal.director_instruction["operation_kind"] ===
        "visibility_modifier" &&
      conceal.director_instruction["concealed_role"] ===
        "secondary_subject" &&
      Array.isArray(conceal.director_instruction["allowed_visibility_mechanisms"]) &&
      conceal.director_instruction["resolve_with_capability_id"] === "reveal",
    "Conceal must encode visibility/staging semantics rather than a standalone visual primitive.",
  );
  assert(
    foreshadow.compiler.threejs === "compound" &&
      foreshadow.director_instruction["operation_kind"] ===
        "compound_visual_motif" &&
      foreshadow.director_instruction["clue_role"] === "secondary_subject" &&
      foreshadow.director_instruction["forbid_full_reveal"] === true &&
      Array.isArray(foreshadow.director_instruction["visibility_progression"]),
    "Foreshadow must remain an active compound visual motif with an explicitly unresolved clue.",
  );
  assert(
    reverseAssumption.compiler.threejs === "compound" &&
      reverseAssumption.director_instruction["operation_kind"] ===
        "compound_narrative" &&
      Array.isArray(
        reverseAssumption.director_instruction["compose_capability_ids"],
      ) &&
      reverseAssumption.director_instruction[
        "require_authored_assumption"
      ] === true &&
      reverseAssumption.director_instruction[
        "require_authored_contradicting_evidence"
      ] === true,
    "Reverse assumption must depend on authored semantic contradiction rather than arbitrary fixture choreography.",
  );

  // A.11A.51 must not rewrite the production Foreshadow demo recipe.
  const productionForeshadow = directorCapabilityDemoMoment(foreshadow);
  assert(
    productionForeshadow.shot,
    "Foreshadow production demo shot is missing.",
  );
  const productionMove =
    productionForeshadow.shot.camera.movement_steps[0];
  assert(
    productionForeshadow.shot.composition.framing === "medium_close" &&
      productionForeshadow.shot.camera.focus_entity_ids.join("|") ===
        "primary_subject|secondary_subject" &&
      productionMove?.movement === "reverse_reveal" &&
      productionMove?.parameters?.degrees === 20 &&
      productionForeshadow.shot.reveal_at === 0.72 &&
      productionForeshadow.shot.hold_after_ms === 1100,
    "A.11A.51 must keep production Foreshadow cinematography unchanged; stronger proof belongs only to Qualification.",
  );

  for (const marker of [
    'if (capability.id === "foreshadow") {',
    "A.11A.51: Qualification proves Foreshadow as hidden information ->",
    'keepVisibleEntityIds = ["primary_subject"]',
    'framing: "medium_close" as const',
    'screen_anchor: "left_third" as const',
    'focus_entity_ids: ["primary_subject"]',
    'movement: "reverse_reveal" as const',
    "parameters: { degrees: 14 }",
    'movement: "settle" as const',
    "reveal_at: null",
    "hold_after_ms: 1500",
    "DIRECTOR_FORESHADOW_CLUE_START = 0.46",
    "DIRECTOR_FORESHADOW_CLUE_END = 0.64",
    "DIRECTOR_FORESHADOW_CLUE_MAX_OPACITY = 0.24",
    "function qualificationForeshadowClueOpacity",
    "foreshadowClueScene",
    'color: "#94a3b8"',
    "depthWrite: false",
    "foreshadowClueOpacity={foreshadowClueOpacity}",
  ]) {
    assert(
      preview.includes(marker),
      `A.11A.51 Foreshadow Qualification marker missing: ${marker}`,
    );
  }

  const proofStart = preview.indexOf(
    'if (capability.id === "foreshadow") {',
  );
  const returnStart = preview.indexOf(
    'if (capability.id === "return_to_context") {',
    proofStart,
  );
  assert(
    proofStart >= 0 && returnStart > proofStart,
    "Foreshadow Qualification proof must execute before the frozen Return-to-context branch.",
  );
  const proofBlock = preview.slice(proofStart, returnStart);
  assert(
    proofBlock.includes('focus_entity_ids: ["primary_subject"]') &&
      proofBlock.includes("parameters: { degrees: 14 }") &&
      proofBlock.includes("reveal_at: null") &&
      proofBlock.includes("hold_after_ms: 1500"),
    "Foreshadow proof must establish the primary, make only a small clue move, forbid full reveal, and hold unresolved.",
  );

  const clueStart = preview.indexOf(
    "const foreshadowClueScene = useMemo(() => {",
  );
  const clueEnd = preview.indexOf(
    "const renderedGroundOffset",
    clueStart,
  );
  assert(
    clueStart >= 0 && clueEnd > clueStart,
    "Could not isolate the Foreshadow real-asset clue renderer.",
  );
  const clueBlock = preview.slice(clueStart, clueEnd);
  assert(
    clueBlock.includes("gltf.scene.clone(true)") &&
      clueBlock.includes("new THREE.MeshBasicMaterial") &&
      clueBlock.includes("transparent: true") &&
      clueBlock.includes("depthWrite: false") &&
      clueBlock.includes("material.opacity = opacity"),
    "Foreshadow clue must use the exact sampled asset geometry as a faint non-occluding silhouette.",
  );
  assert(
    preview.includes(
      "{foreshadowClueScene ? (",
    ) &&
      preview.includes(
        "<Clone object={gltf.scene} castShadow receiveShadow />",
      ),
    "Foreshadow Qualification must replace, not layer over, the normally materialized clue-role asset.",
  );
  assert(
    preview.includes("!foreshadowProof &&"),
    "The generic cyan primary ring must be suppressed during Foreshadow proof so the unresolved clue owns the visual event.",
  );

  // Existing Reveal remains the resolution primitive; A.11A.51 must not leak
  // Foreshadow into the dedicated A.11A.46 Reveal-only readability fill.
  assert(
    runtime.includes(
      'mode === "reveal" && shot.narrative_job === "reveal"',
    ) &&
      a46.includes(
        '!motivatedBlock.includes(\'shot.narrative_job === "foreshadow"\')',
      ),
    "Foreshadow must remain excluded from the dedicated Reveal-only readability fill.",
  );

  assert(
    familiesSource.includes(
      "DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS",
    ) &&
      familiesSource.includes(
        "DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS",
      ) &&
      familiesSource.includes(
        "!isDirectorQualificationCapabilityVisibilityModifier(capabilityId)",
      ) &&
      familiesSource.includes(
        "!isDirectorQualificationCapabilityRevealCompoundNarrative(capabilityId)",
      ),
    "A.11A.51 active-family Reveal-grammar filtering markers are missing.",
  );
  assert(
    registry.includes('operation_kind: "visibility_modifier"') &&
      registry.includes('operation_kind: "compound_visual_motif"') &&
      registry.includes(
        'compose_capability_ids: ["isolate", "reveal", "hold_for_understanding"]',
      ),
    "A.11A.51 Reveal-grammar registry semantics are missing.",
  );

  // Frozen predecessor lineages must remain in place.
  assert(
    a50.includes(
      "Director Pacing Phase 1B.7A.11A.50 Return-to-context closeout verification passed.",
    ) &&
      a49.includes(
        "Director Explanatory structure Phase 1B.7A.11A.49 Build-from-parts occlusion verification passed.",
      ),
    "A.11A.51 predecessor lineage is incomplete.",
  );

  console.log(
    "Director Reveal grammar Phase 1B.7A.11A.51 Foreshadow closeout verification passed.",
  );
  console.log(
    "A.11A.51 preserves Conceal/Foreshadow/Reverse assumption as compatibility vocabulary, treats Conceal as a visibility modifier, treats Reverse assumption as a semantic compound narrative verb, and independently qualifies only Foreshadow with hidden -> partial clue -> unresolved hold proof.",
  );
}

main();
