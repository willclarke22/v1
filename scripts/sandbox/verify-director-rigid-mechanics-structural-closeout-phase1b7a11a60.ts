import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_ARTICULATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPOUND_MECHANIC_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_NON_ATOMIC_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_PRIMITIVE_ALIAS_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_RIGID_MECHANICS_VERTICAL_DIRECTION_BY_ID,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityRigidMechanicsArticulationCompound,
  isDirectorQualificationCapabilityRigidMechanicsCompoundMechanic,
  isDirectorQualificationCapabilityRigidMechanicsNonAtomic,
  isDirectorQualificationCapabilityRigidMechanicsPrimitiveAlias,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS,
} from "../../sandbox/probe-lab/motion-program/director-motion-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string): DirectorCapability {
  const found = directorCapabilityById(id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.60 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "object_motion:Rigid mechanics",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Rigid mechanics",
  );

  assert(
    frozenFamily,
    "A.11A.60 must preserve the frozen Object motion · Rigid mechanics family.",
  );
  assert(
    activeFamily === undefined,
    "A.11A.60 structurally closes Rigid mechanics; no independent active family should remain.",
  );

  const frozenExpected = [
    "hinge",
    "slide",
    "roll",
    "spin",
    "lift",
    "lower",
    "object_open",
    "object_close",
  ];

  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.60 frozen Rigid mechanics membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );

  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPOUND_MECHANIC_CAPABILITY_IDS.join("|") ===
      "hinge|roll",
    "A.11A.60 must preserve Hinge/Roll as high-value compound mechanics.",
  );
  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_PRIMITIVE_ALIAS_CAPABILITY_IDS.join("|") ===
      "slide|spin|lift|lower",
    "A.11A.60 must classify Slide/Spin/Lift/Lower as aliases or modifiers over qualified primitives.",
  );
  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_ARTICULATION_COMPOUND_CAPABILITY_IDS.join("|") ===
      "object_open|object_close",
    "A.11A.60 must classify Open/Close as authored articulation compounds.",
  );
  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_NON_ATOMIC_CAPABILITY_IDS.join("|") ===
      frozenExpected.join("|"),
    "A.11A.60 all eight Rigid mechanics verbs must be excluded from independent Qualification.",
  );

  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.hinge.join("|") ===
      "rotate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.slide.join("|") ===
        "translate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.roll.join("|") ===
        "translate|rotate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.spin.join("|") ===
        "rotate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.lift.join("|") ===
        "translate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.lower.join("|") ===
        "translate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.object_open.join("|") ===
        "rotate|translate" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_COMPONENTS_BY_ID.object_close.join("|") ===
        "rotate|translate",
    "A.11A.60 reusable primitive/component mapping drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.hinge ===
      "authored_fixed_pivot_rotation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.slide ===
        "constrained_linear_translation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.roll ===
        "coupled_translation_rotation_with_contact" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.spin ===
        "repeated_axis_rotation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.lift ===
        "signed_vertical_translation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.lower ===
        "signed_vertical_translation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.object_open ===
        "authored_articulation_state_transition" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_CANONICAL_MECHANISM_BY_ID.object_close ===
        "authored_articulation_state_transition",
    "A.11A.60 canonical Rigid mechanics mechanisms drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_VERTICAL_DIRECTION_BY_ID.lift === 1 &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_VERTICAL_DIRECTION_BY_ID.lower === -1,
    "A.11A.60 Lift/Lower signed vertical direction mapping drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.hinge.join(
      "|",
    ) ===
      "authored_pivot_or_hinge_anchor|authored_rotation_axis_or_degree_of_freedom" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.slide.join(
        "|",
      ) === "declared_linear_axis_surface_or_rail" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.roll.join(
        "|",
      ) ===
        "rollable_geometry_or_authored_rolling_axis|authored_contact_surface_or_contact_relation" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.spin.join(
        "|",
      ) === "declared_rotation_axis" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.object_open.join(
        "|",
      ) ===
        "authored_openable_subpart|authored_hinge_or_slider_articulation|authored_pivot_or_rail_and_allowed_range|authored_current_and_target_articulation_state" &&
      DIRECTOR_QUALIFICATION_RIGID_MECHANICS_AUTHORED_STATE_REQUIREMENTS_BY_ID.object_close.join(
        "|",
      ) ===
        "authored_openable_subpart|authored_hinge_or_slider_articulation|authored_pivot_or_rail_and_allowed_range|existing_authored_open_or_current_articulation_state|authored_target_closed_state",
    "A.11A.60 authored mechanical/directability requirements drifted.",
  );

  for (const id of frozenExpected) {
    assert(
      isDirectorQualificationCapabilityRigidMechanicsNonAtomic(id),
      `A.11A.60 ${id} must be classified as non-atomic Rigid mechanics vocabulary.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.60 ${id} must not remain independently active.`,
    );
  }

  for (const id of ["hinge", "roll"]) {
    assert(
      isDirectorQualificationCapabilityRigidMechanicsCompoundMechanic(id),
      `A.11A.60 ${id} must remain a reusable compound mechanic.`,
    );
  }
  for (const id of ["slide", "spin", "lift", "lower"]) {
    assert(
      isDirectorQualificationCapabilityRigidMechanicsPrimitiveAlias(id),
      `A.11A.60 ${id} must be an alias/modifier over qualified motion primitives.`,
    );
  }
  for (const id of ["object_open", "object_close"]) {
    assert(
      isDirectorQualificationCapabilityRigidMechanicsArticulationCompound(id),
      `A.11A.60 ${id} must require authored articulation state.`,
    );
  }

  const supportExpectations = {
    hinge: ["compound", "translate", "motion_hinge"],
    slide: ["direct", undefined, "motion_slide"],
    roll: ["compound", "translate", "motion_roll"],
    spin: ["direct", undefined, "motion_spin"],
    lift: ["direct", undefined, "motion_lift"],
    lower: ["direct", undefined, "motion_lower"],
    object_open: ["approximate", undefined, "motion_object_open"],
    object_close: ["approximate", undefined, "motion_object_close"],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "object_motion",
      `A.11A.60 must preserve ${id} as object-motion Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.60 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.60 must preserve ${id}'s runtime fallback ${String(fallback)}; found ${String(item.compiler.fallback_capability_id)}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.60 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  assert(
    DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.hinge ===
      "hinge_about_declared_anchor_axis" &&
      DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.open ===
        "open_hinge_transition" &&
      DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.close ===
        "close_hinge_transition" &&
      DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.slide ===
        "slide_constrained_axis" &&
      DIRECTOR_RELATIONAL_ARTICULATION_RECIPE_IDS.roll ===
        "roll_translation_rotation_coupled",
    "A.11A.60 must preserve the existing Phase 1B.4.3 Hinge/Open/Close/Slide/Roll recipes.",
  );

  for (const id of frozenExpected) {
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.60"),
      `A.11A.60 ${id} must expose its structural-closeout rationale in the frozen Qualification profile.`,
    );
  }

  for (const closedKey of [
    "object_motion:Process & quantity motion",
    "object_motion:Object relationships",
    "object_motion:Kinematic constraints",
  ]) {
    assert(
      activeFamilies.find((family) => family.key === closedKey) === undefined,
      `A.11A.60 must not regress prior structural closeout ${closedKey}.`,
    );
  }

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.60 must not regress the seven frozen Basic actor motion primitives.",
  );

  console.log(
    "A.11A.60 Rigid mechanics structural closeout verified: all eight author-facing Director/runtime verbs remain in the frozen 184-capability vocabulary; Hinge/Roll remain high-value compound mechanics; Slide/Spin/Lift/Lower reduce to constrained or directional aliases over Translate/Rotate; Open/Close require truthful authored articulation state; the empty Rigid mechanics family is removed from independent active Qualification without visual retuning.",
  );
}

main();
