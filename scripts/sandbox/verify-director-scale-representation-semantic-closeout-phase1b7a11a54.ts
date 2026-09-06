import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  isDirectorQualificationCapabilityCompoundRepresentation,
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
  const a53 = source(
    "scripts/sandbox/verify-director-scale-representation-change-scale-roi-phase1b7a11a53.ts",
  );
  const a52 = source(
    "scripts/sandbox/verify-director-scale-representation-change-scale-closeout-phase1b7a11a52.ts",
  );
  const a51 = source(
    "scripts/sandbox/verify-director-reveal-grammar-foreshadow-closeout-phase1b7a11a51.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.54 must preserve the frozen 184-capability compatibility vocabulary.",
  );

  const frozenScale = buildDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Scale & representation",
  );
  const activeScale = buildActiveDirectorQualificationFamilies(
    DIRECTOR_CAPABILITIES,
  ).find(
    (family) =>
      family.category === "narrative_attention" &&
      family.group === "Scale & representation",
  );

  assert(
    frozenScale,
    "Frozen Scale & representation compatibility family is missing.",
  );
  assert(
    frozenScale.capability_ids.join("|") ===
      "enter_system|change_scale|show_inside_outside",
    `Frozen Scale & representation compatibility membership drifted: ${frozenScale.capability_ids.join("|")}.`,
  );
  assert(
    activeScale === undefined,
    "A.11A.54 closes Scale & representation structurally; no independently qualified active family should remain.",
  );

  assert(
    DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS.join("|") ===
      "enter_system|change_scale|show_inside_outside",
    "All three Scale & representation entries must be classified as authored-representation-dependent compound verbs.",
  );
  for (const id of [
    "enter_system",
    "change_scale",
    "show_inside_outside",
  ]) {
    assert(
      isDirectorQualificationCapabilityCompoundRepresentation(id),
      `${id} must be excluded from independent Qualification as a compound representation verb.`,
    );
  }

  assert(
    DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID.enter_system.join(
      "|",
    ) === "change_scale|hold_for_understanding" &&
      DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID.change_scale.join(
        "|",
      ) === "hold_for_understanding" &&
      DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID.show_inside_outside.join(
        "|",
      ) === "compare|hold_for_understanding",
    "Scale representation composition metadata drifted.",
  );

  const enterSystem = capability("enter_system");
  const changeScale = capability("change_scale");
  const insideOutside = capability("show_inside_outside");

  assert(
    enterSystem.compiler.threejs === "compound" &&
      enterSystem.director_instruction["operation_kind"] ===
        "compound_representation_verb" &&
      enterSystem.director_instruction[
        "require_authored_interior_representation"
      ] === true &&
      enterSystem.director_instruction[
        "forbid_fake_interior_from_unrelated_assets"
      ] === true,
    "Enter system must continue to require a real authored interior.",
  );

  assert(
    changeScale.compiler.threejs === "compound" &&
      changeScale.director_instruction["operation_kind"] ===
        "compound_representation_verb" &&
      changeScale.director_instruction["source_representation_role"] ===
        "primary_subject" &&
      changeScale.director_instruction["target_representation_role"] ===
        "secondary_subject" &&
      changeScale.director_instruction[
        "require_authored_scale_representation_pair"
      ] === true &&
      changeScale.director_instruction["require_shared_anchor_mapping"] ===
        true &&
      changeScale.director_instruction["camera_transition_policy"] ===
        "compose_from_qualified_camera_primitives" &&
      changeScale.director_instruction["preserve_visual_anchor"] === true &&
      changeScale.director_instruction[
        "forbid_single_representation_zoom_as_scale_change"
      ] === true &&
      changeScale.director_instruction[
        "forbid_fake_target_representation_from_unrelated_assets"
      ] === true,
    "Change scale must require a truthful source/target representation pair and shared anchor mapping rather than freezing a single-GLB zoom.",
  );

  assert(
    insideOutside.compiler.threejs === "compound" &&
      insideOutside.director_instruction["operation_kind"] ===
        "compound_representation_verb" &&
      insideOutside.director_instruction[
        "require_authored_representation_pair"
      ] === true &&
      insideOutside.director_instruction[
        "forbid_fake_interior_from_unrelated_assets"
      ] === true,
    "Inside / outside must continue to require a truthful exterior/interior or cutaway pair.",
  );

  const productionChangeScale = directorCapabilityDemoMoment(changeScale);
  assert(
    productionChangeScale.shot,
    "Change-scale compatibility demo shot is missing.",
  );
  const productionMoves =
    productionChangeScale.shot.camera.movement_steps.map(
      (step) => step.movement,
    );
  assert(
    productionMoves.join("|") === "push_in|settle" &&
      !productionMoves.includes("pass_through") &&
      productionChangeScale.shot.continuity.rules.includes(
        "preserve_visual_anchor",
      ),
    "The compatibility demo may retain its non-pass-through camera fallback, but that fallback must not be treated as independent Scale-change Qualification.",
  );

  for (const marker of [
    "DIRECTOR_CHANGE_SCALE_ROI_CUE_START",
    "DIRECTOR_CHANGE_SCALE_ROI_CUE_END",
    "DIRECTOR_CHANGE_SCALE_APPROACH_START",
    "DIRECTOR_CHANGE_SCALE_APPROACH_END",
    "qualificationChangeScaleRoiOpacity",
    "changeScaleProof",
    "changeScaleRoiOpacity",
    "changeScaleRoiPosition",
    "changeScaleRoiRadius",
    "<Billboard",
    "A.11A.53: Qualification keeps the A.11A.52 whole -> detail grammar",
  ]) {
    assert(
      !preview.includes(marker),
      `A.11A.54 must remove obsolete Change-scale Qualification/blue-ROI scaffolding: ${marker}`,
    );
  }
  assert(
    !preview.includes('if (capability.id === "change_scale") {'),
    "A.11A.54 must remove the special Qualification-only Change-scale camera branch.",
  );
  assert(
    !preview.includes(
      'import { Billboard, Clone, Html, Line, OrbitControls, useGLTF } from "@react-three/drei";',
    ),
    "A.11A.54 must remove the now-unused Billboard import introduced only for the blue ROI cue.",
  );

  assert(
    familiesSource.includes(
      "A.11A.54 Scale-and-representation semantic closeout",
    ) &&
      familiesSource.includes(
        "!isDirectorQualificationCapabilityCompoundRepresentation(capabilityId)",
      ),
    "A.11A.54 active-family policy must explicitly close authored representation verbs out of independent Qualification.",
  );

  for (const marker of [
    'operation_kind: "compound_representation_verb"',
    "require_authored_scale_representation_pair: true",
    "require_shared_anchor_mapping: true",
    'camera_transition_policy: "compose_from_qualified_camera_primitives"',
    "forbid_single_representation_zoom_as_scale_change: true",
    "forbid_fake_target_representation_from_unrelated_assets: true",
  ]) {
    assert(
      registry.includes(marker),
      `A.11A.54 registry semantic marker missing: ${marker}`,
    );
  }

  assert(
    a53.includes(
      "A.11A.53 predecessor invariants remain successor-safe after A.11A.54 removes the temporary ROI proof",
    ) &&
      a52.includes(
        "A.11A.52 predecessor invariants remain successor-safe under the A.11A.54 semantic closeout.",
      ),
    "A.11A.52/A.11A.53 predecessor verifiers were not made successor-safe.",
  );
  assert(
    a51.includes(
      "Director Reveal grammar Phase 1B.7A.11A.51 Foreshadow closeout verification passed.",
    ),
    "A.11A.51 Reveal-grammar lineage regressed.",
  );

  console.log(
    "Director Scale & representation Phase 1B.7A.11A.54 semantic closeout verification passed.",
  );
  console.log(
    "Enter system, Change scale, and Inside / outside remain authorable compound representation verbs; the temporary blue ROI proof is removed and Scale & representation has no independent Qualification primitive left to render.",
  );
}

main();
