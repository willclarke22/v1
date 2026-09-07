import {
  DIRECTOR_CAPABILITIES,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityKinematicModifier,
  isDirectorQualificationCapabilityKinematicOrientationCompound,
  isDirectorQualificationCapabilityKinematicRelationState,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function capability(id: string): DirectorCapability {
  const found = DIRECTOR_CAPABILITIES.find((item) => item.id === id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.57 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "object_motion:Kinematic constraints",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Kinematic constraints",
  );

  assert(
    frozenFamily,
    "A.11A.57 must preserve the frozen Object motion · Kinematic constraints family.",
  );
  assert(
    activeFamily === undefined,
    "A.11A.57 structurally closes Kinematic constraints; no independent active family should remain.",
  );

  const frozenExpected = [
    "axis_lock",
    "attach_constraint",
    "maintain_distance",
    "rigid_link",
    "look_at_constraint",
  ];
  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.57 frozen Kinematic constraints membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );

  assert(
    DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS.join("|") ===
      "axis_lock|maintain_distance",
    "A.11A.57 must classify Axis lock and Maintain distance as motion/relationship modifiers.",
  );
  assert(
    DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS.join("|") ===
      "attach_constraint|rigid_link",
    "A.11A.57 must classify Persistent attachment and Rigid link as relation-state constraints.",
  );
  assert(
    DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS.join(
      "|",
    ) === "look_at_constraint",
    "A.11A.57 must classify Look-at constraint as an authored-orientation compound.",
  );

  assert(
    DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID.axis_lock.join("|") ===
      "translate" &&
      DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID.maintain_distance.join(
        "|",
      ) === "translate" &&
      DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID.look_at_constraint.join(
        "|",
      ) === "aim_at",
    "A.11A.57 reusable component mapping drifted for kinematic modifiers/orientation.",
  );
  assert(
    DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID.attach_constraint ===
      "fixed_relative_transform" &&
      DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID.rigid_link ===
        "fixed_relative_transform",
    "A.11A.57 Persistent attachment and Rigid link must share the same cold-read fixed-relative-transform mechanism.",
  );

  for (const id of ["axis_lock", "maintain_distance"]) {
    assert(
      isDirectorQualificationCapabilityKinematicModifier(id),
      `A.11A.57 ${id} must be excluded from independent Qualification as a modifier.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.57 ${id} must not remain independently active.`,
    );
  }

  for (const id of ["attach_constraint", "rigid_link"]) {
    assert(
      isDirectorQualificationCapabilityKinematicRelationState(id),
      `A.11A.57 ${id} must be excluded from independent Qualification as a persistent relation-state constraint.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.57 ${id} must not remain independently active.`,
    );
  }

  assert(
    isDirectorQualificationCapabilityKinematicOrientationCompound(
      "look_at_constraint",
    ),
    "A.11A.57 Look-at constraint must be excluded from independent Qualification as an authored-orientation compound.",
  );
  assert(
    !isDirectorQualificationCapabilityActive("look_at_constraint"),
    "A.11A.57 Look-at constraint must not remain independently active.",
  );

  const runtimeExpectations = {
    axis_lock: ["slide", "constraint_axis_lock"],
    attach_constraint: ["attach", "constraint_attach"],
    maintain_distance: ["follow_target", "constraint_distance"],
    rigid_link: ["align", "constraint_rigid_link"],
    look_at_constraint: ["aim_at", "constraint_look_at"],
  } as const;

  for (const [id, [fallback, demoKind]] of Object.entries(runtimeExpectations)) {
    const item = capability(id);
    assert(
      item.group === "Kinematic constraints",
      `A.11A.57 must preserve ${id} in the frozen Kinematic constraints vocabulary group.`,
    );
    assert(
      item.compiler.threejs === "compound",
      `A.11A.57 must preserve ${id}'s existing compound Three.js runtime support; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.57 must preserve ${id}'s runtime fallback ${fallback}; found ${item.compiler.fallback_capability_id}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.57 must preserve ${id}'s runtime demo/constraint lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.57 must not regress the seven frozen Basic actor motion primitives while closing Kinematic constraints.",
  );

  console.log(
    `A.11A.57 Kinematic constraints structural closeout verified: all five author-facing Director/runtime verbs remain in the frozen 184-capability vocabulary; Axis lock and Maintain distance are modifiers; Persistent attachment and Rigid link share a fixed-relative-transform constraint mechanism; Look-at constraint is an authored-orientation compound; the empty family is removed from independent active Qualification without visual retuning.`,
  );
}

main();
