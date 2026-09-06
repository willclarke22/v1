import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS,
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
  const a51 = source(
    "scripts/sandbox/verify-director-reveal-grammar-foreshadow-closeout-phase1b7a11a51.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.52 lineage must preserve the frozen 184-capability compatibility vocabulary.",
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
    "Frozen Scale-and-representation compatibility family is missing.",
  );
  assert(
    frozenScale.capability_ids.join("|") ===
      "enter_system|change_scale|show_inside_outside",
    `Frozen Scale & representation compatibility membership drifted: ${frozenScale.capability_ids.join("|")}.`,
  );

  const semanticCloseout =
    isDirectorQualificationCapabilityCompoundRepresentation("change_scale");

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
    "Enter system must continue to require a truthful authored interior representation.",
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
    "Inside / outside must continue to require a truthful authored representation pair.",
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
    "A.11A.52 camera fallback must remain distinct from Enter system and must never claim a pass-through interior.",
  );

  if (semanticCloseout) {
    assert(
      activeScale === undefined,
      "A.11A.54 successor closes independent Scale & representation Qualification; no active family should remain.",
    );
    assert(
      DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS.join("|") ===
        "enter_system|change_scale|show_inside_outside" &&
        isDirectorQualificationCapabilityCompoundRepresentation(
          "enter_system",
        ) &&
        isDirectorQualificationCapabilityCompoundRepresentation(
          "show_inside_outside",
        ),
      "A.11A.54 successor must classify all three Scale & representation verbs as authored-representation-dependent compounds.",
    );
    assert(
      changeScale.director_instruction["operation_kind"] ===
        "compound_representation_verb" &&
        changeScale.director_instruction[
          "require_authored_scale_representation_pair"
        ] === true &&
        changeScale.director_instruction["require_shared_anchor_mapping"] ===
          true &&
        changeScale.director_instruction[
          "forbid_single_representation_zoom_as_scale_change"
        ] === true,
      "A.11A.54 successor must stop treating a single-representation zoom as a qualified Change-scale motif.",
    );
    for (const removedMarker of [
      "DIRECTOR_CHANGE_SCALE_ROI_CUE_START",
      "qualificationChangeScaleRoiOpacity",
      "changeScaleRoiPosition",
      "changeScaleRoiRadius",
      "changeScaleProof",
      "<Billboard",
      "A.11A.53: Qualification keeps the A.11A.52 whole -> detail grammar",
    ]) {
      assert(
        !preview.includes(removedMarker),
        `A.11A.54 successor must remove obsolete Change-scale Qualification scaffolding: ${removedMarker}`,
      );
    }
    assert(
      familiesSource.includes(
        "A.11A.54 Scale-and-representation semantic closeout",
      ),
      "A.11A.54 successor family-policy marker is missing.",
    );
  } else {
    assert(
      activeScale?.capability_ids.join("|") === "change_scale",
      `A.11A.52/A.11A.53 state must independently qualify only Change scale: ${activeScale?.capability_ids.join("|") ?? "missing"}.`,
    );
    assert(
      DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS.join("|") ===
        "enter_system|show_inside_outside",
      "Pre-A.11A.54 Scale representation classification drifted.",
    );
    assert(
      changeScale.director_instruction["operation_kind"] ===
        "compound_visual_motif" &&
        changeScale.director_instruction["preserve_visual_anchor"] === true,
      "Pre-A.11A.54 Change scale must remain the anchored visual motif.",
    );
  }

  assert(
    familiesSource.includes(
      "!isDirectorQualificationCapabilityCompoundRepresentation(capabilityId)",
    ),
    "Active Qualification policy must centrally exclude authored-representation-dependent verbs.",
  );
  assert(
    a51.includes(
      "Director Reveal grammar Phase 1B.7A.11A.51 Foreshadow closeout verification passed.",
    ),
    "A.11A.51 Reveal-grammar closeout lineage regressed.",
  );
  assert(
    registry.includes('id: "enter_system"') &&
      registry.includes('id: "change_scale"') &&
      registry.includes('id: "show_inside_outside"'),
    "Frozen Scale & representation registry entries disappeared.",
  );

  console.log(
    "Director Scale & representation Phase 1B.7A.11A.52 Change-scale closeout verification passed.",
  );
  console.log(
    semanticCloseout
      ? "A.11A.52 predecessor invariants remain successor-safe under the A.11A.54 semantic closeout."
      : "A.11A.52/A.11A.53 predecessor state remains valid.",
  );
}

main();
