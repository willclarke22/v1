import {
  DIRECTOR_CAPABILITIES,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_CONTAINMENT_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_PART_WHOLE_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_OBJECT_RELATION_STATE_TRANSITION_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityObjectRelationCompound,
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
    "A.11A.58 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "object_motion:Object relationships",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Object relationships",
  );

  assert(
    frozenFamily,
    "A.11A.58 must preserve the frozen Object motion · Object relationships family.",
  );
  assert(
    activeFamily === undefined,
    "A.11A.58 structurally closes Object relationships; no independent active family should remain.",
  );

  const frozenExpected = [
    "attach",
    "detach",
    "insert_into",
    "remove_from",
    "assemble",
    "disassemble",
  ];
  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.58 frozen Object relationships membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );

  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_STATE_TRANSITION_CAPABILITY_IDS.join("|") ===
      "attach|detach",
    "A.11A.58 must classify Attach/Detach as authored relationship-state transitions.",
  );
  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_CONTAINMENT_COMPOUND_CAPABILITY_IDS.join(
      "|",
    ) === "insert_into|remove_from",
    "A.11A.58 must classify Insert/Remove as authored containment compounds.",
  );
  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_PART_WHOLE_COMPOUND_CAPABILITY_IDS.join(
      "|",
    ) === "assemble|disassemble",
    "A.11A.58 must classify Assemble/Disassemble as authored part-whole compounds.",
  );
  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS.join("|") ===
      frozenExpected.join("|"),
    "A.11A.58 all six Object relationships verbs must be excluded from independent Qualification.",
  );

  for (const id of frozenExpected) {
    assert(
      isDirectorQualificationCapabilityObjectRelationCompound(id),
      `A.11A.58 ${id} must be classified as an Object-relationship compound.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.58 ${id} must not remain independently active.`,
    );
  }

  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.attach.join("|") ===
      "move_toward" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.detach.join("|") ===
        "move_away" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.insert_into.join(
        "|",
      ) === "move_toward" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.remove_from.join(
        "|",
      ) === "move_away" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.assemble.join(
        "|",
      ) === "move_toward|rotate" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID.disassemble.join(
        "|",
      ) === "move_away",
    "A.11A.58 reusable motion-component mapping drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.attach ===
      "establish_fixed_relative_transform" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.detach ===
        "release_fixed_relative_transform" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.insert_into ===
        "establish_authored_containment" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.remove_from ===
        "release_authored_containment" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.assemble ===
        "establish_authored_part_whole_state" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID.disassemble ===
        "release_authored_part_whole_state",
    "A.11A.58 canonical relationship mechanisms drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.attach.join(
      "|",
    ) === "target_actor|authored_attachment_site_or_relation" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.detach.join(
        "|",
      ) === "existing_authored_attachment_relation" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.insert_into.join(
        "|",
      ) ===
        "authored_receptacle_socket_or_containment_region|compatible_fit_or_clearance" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.remove_from.join(
        "|",
      ) === "existing_authored_containment_or_insertion_relation" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.assemble.join(
        "|",
      ) ===
        "authored_part_whole_membership|authored_target_placements_sockets_or_attachment_relations" &&
      DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID.disassemble.join(
        "|",
      ) ===
        "existing_authored_assembled_part_whole_state|preserved_component_identity",
    "A.11A.58 authored relationship-state requirements drifted.",
  );

  const supportExpectations = {
    attach: ["declared", "translate", "motion_attach"],
    detach: ["declared", "translate", "motion_detach"],
    insert_into: ["compound", "translate", "motion_insert_into"],
    remove_from: ["compound", "translate", "motion_remove_from"],
    assemble: ["compound", "translate", "motion_assemble"],
    disassemble: ["compound", "translate", "motion_disassemble"],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "object_motion",
      `A.11A.58 must preserve ${id} as object-motion Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.58 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.58 must preserve ${id}'s runtime fallback ${fallback}; found ${item.compiler.fallback_capability_id}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.58 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  for (const id of frozenExpected) {
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.58"),
      `A.11A.58 ${id} must expose its structural-closeout rationale in the frozen Qualification profile.`,
    );
  }

  const activeKinematic = activeFamilies.find(
    (family) => family.key === "object_motion:Kinematic constraints",
  );
  assert(
    activeKinematic === undefined,
    "A.11A.58 must not regress the A.11A.57 Kinematic constraints structural closeout.",
  );

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.58 must not regress the seven frozen Basic actor motion primitives.",
  );

  console.log(
    "A.11A.58 Object relationships structural closeout verified: all six author-facing Director/runtime verbs remain in the frozen 184-capability vocabulary; Attach/Detach are authored relation-state transitions; Insert/Remove require truthful authored containment; Assemble/Disassemble require authored part-whole state; the empty family is removed from independent active Qualification without visual retuning.",
  );
}

main();
