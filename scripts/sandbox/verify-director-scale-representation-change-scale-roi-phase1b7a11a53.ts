import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityDemoMoment,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
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
  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  const familiesSource = source(
    "sandbox/probe-lab/motion-camera-library/director-qualification-families.ts",
  );
  const a52 = source(
    "scripts/sandbox/verify-director-scale-representation-change-scale-closeout-phase1b7a11a52.ts",
  );
  const a51 = source(
    "scripts/sandbox/verify-director-reveal-grammar-foreshadow-closeout-phase1b7a11a51.ts",
  );

  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.53 lineage must preserve the frozen 184-capability compatibility vocabulary.",
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
    frozenScale?.capability_ids.join("|") ===
      "enter_system|change_scale|show_inside_outside",
    "Frozen Scale & representation compatibility membership drifted.",
  );

  const changeScale = capability("change_scale");
  const productionChangeScale = directorCapabilityDemoMoment(changeScale);
  assert(
    productionChangeScale.shot,
    "Change-scale production/compatibility demo shot is missing.",
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
    "A.11A.53 predecessor must preserve the A.11A.52 non-pass-through camera fallback.",
  );

  const semanticCloseout =
    isDirectorQualificationCapabilityCompoundRepresentation("change_scale");

  if (semanticCloseout) {
    assert(
      activeScale === undefined,
      "A.11A.54 successor must remove Scale & representation from active independent Qualification.",
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
      "A.11A.54 successor must replace the A.11A.53 single-GLB visual proof with authored representation semantics.",
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
        `A.11A.54 successor must remove the obsolete adaptive ROI proof marker: ${marker}`,
      );
    }
    assert(
      familiesSource.includes(
        "A.11A.54 Scale-and-representation semantic closeout",
      ),
      "A.11A.54 successor family marker is missing.",
    );
    assert(
      a52.includes(
        "A.11A.52 predecessor invariants remain successor-safe under the A.11A.54 semantic closeout.",
      ),
      "A.11A.52 predecessor verifier was not made successor-safe for A.11A.54.",
    );
  } else {
    assert(
      activeScale?.capability_ids.join("|") === "change_scale",
      "A.11A.53 pre-closeout state must independently qualify only Change scale.",
    );
    assert(
      changeScale.director_instruction["operation_kind"] ===
        "compound_visual_motif" &&
        changeScale.director_instruction["preserve_visual_anchor"] === true,
      "A.11A.53 pre-closeout semantic authority drifted.",
    );
    for (const marker of [
      "A.11A.53: Qualification keeps the A.11A.52 whole -> detail grammar",
      "DIRECTOR_CHANGE_SCALE_ROI_CUE_START = 0.14",
      "DIRECTOR_CHANGE_SCALE_ROI_CUE_END = 0.28",
      "DIRECTOR_CHANGE_SCALE_APPROACH_START = 0.3",
      "DIRECTOR_CHANGE_SCALE_APPROACH_END = 0.72",
      "function qualificationChangeScaleRoiOpacity",
      "changeScaleRoiPosition",
      "changeScaleRoiRadius",
      "<Billboard",
    ]) {
      assert(
        preview.includes(marker),
        `A.11A.53 adaptive ROI marker missing: ${marker}`,
      );
    }
  }

  assert(
    a51.includes(
      "Director Reveal grammar Phase 1B.7A.11A.51 Foreshadow closeout verification passed.",
    ),
    "A.11A.51 Reveal-grammar lineage regressed.",
  );

  console.log(
    "Director Scale & representation Phase 1B.7A.11A.53 adaptive ROI verification passed.",
  );
  console.log(
    semanticCloseout
      ? "A.11A.53 predecessor invariants remain successor-safe after A.11A.54 removes the temporary ROI proof and closes the family semantically."
      : "A.11A.53 adaptive ROI proof remains intact.",
  );
}

main();
