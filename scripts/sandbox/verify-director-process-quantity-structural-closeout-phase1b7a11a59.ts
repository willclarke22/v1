import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_NON_ATOMIC_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_ANIMATION_MECHANISM,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_DIRECTION_BY_ID,
  DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityProcessQuantityAuthoredStateCompound,
  isDirectorQualificationCapabilityProcessQuantityCompoundMotif,
  isDirectorQualificationCapabilityProcessQuantityGroupCompound,
  isDirectorQualificationCapabilityProcessQuantityNonAtomic,
  isDirectorQualificationCapabilityProcessQuantityScaleModifier,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS,
  DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS,
} from "../../sandbox/probe-lab/motion-program/director-process-quantity";

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
    "A.11A.59 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "object_motion:Process & quantity motion",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "object_motion:Process & quantity motion",
  );

  assert(
    frozenFamily,
    "A.11A.59 must preserve the frozen Object motion · Process & quantity motion family.",
  );
  assert(
    activeFamily === undefined,
    "A.11A.59 structurally closes Process & quantity motion; no independent active family should remain.",
  );

  const frozenExpected = [
    "scatter",
    "expand",
    "contract",
    "flow",
    "fill",
    "drain",
    "emit",
    "accumulate",
    "split",
    "merge",
  ];

  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.59 frozen Process & quantity membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );

  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS.join("|") ===
      "expand|contract",
    "A.11A.59 must collapse Expand/Contract into one signed geometric scale-animation modifier.",
  );
  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS.join("|") ===
      "flow|emit",
    "A.11A.59 must preserve Flow/Emit as reusable compound process motifs.",
  );
  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS.join("|") ===
      "scatter",
    "A.11A.59 must classify Scatter as an authored group-motion compound.",
  );
  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS.join("|") ===
      "fill|drain|accumulate|split|merge",
    "A.11A.59 must classify Fill/Drain/Accumulate/Split/Merge as authored-state compounds.",
  );
  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_NON_ATOMIC_CAPABILITY_IDS.join("|") ===
      frozenExpected.join("|"),
    "A.11A.59 all ten Process & quantity verbs must be excluded from independent Qualification.",
  );

  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_ANIMATION_MECHANISM ===
      "signed_geometric_scale_animation" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_DIRECTION_BY_ID.expand === 1 &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_DIRECTION_BY_ID.contract === -1,
    "A.11A.59 signed scale-animation mechanism drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID.scatter.join("|") ===
      "move_away" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID.flow.join("|") ===
        "follow_path" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID.emit.join("|") ===
        "translate" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID.split.join("|") ===
        "move_away" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID.merge.join("|") ===
        "move_toward",
    "A.11A.59 reusable component mapping drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.scatter ===
      "authored_collection_dispersion" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.expand ===
        "signed_geometric_scale_animation" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.contract ===
        "signed_geometric_scale_animation" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.flow ===
        "carrier_instances_follow_path_with_temporal_stagger" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.fill ===
        "interpolate_authored_fill_quantity" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.drain ===
        "interpolate_authored_fill_quantity" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.emit ===
        "authored_emitter_spawn_and_motion" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.accumulate ===
        "increase_authored_retained_quantity_at_region" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.split ===
        "authored_identity_quantity_partition" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID.merge ===
        "authored_identity_quantity_coalescence",
    "A.11A.59 canonical Process & quantity mechanisms drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.scatter.join(
      "|",
    ) === "authored_collection_membership" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.flow.join(
        "|",
      ) ===
        "authored_flow_carrier_or_process_semantics|authored_route_or_destination" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.fill.join(
        "|",
      ) ===
        "authored_fillable_region_or_volume|authored_quantity_state_or_capacity|authored_contents_representation" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.drain.join(
        "|",
      ) ===
        "existing_authored_fill_quantity_state|authored_fillable_region_or_volume" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.emit.join(
        "|",
      ) ===
        "authored_emitter_source|authored_emission_origin|authored_carrier_material_or_signal_semantics" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.accumulate.join(
        "|",
      ) ===
        "authored_accumulation_region_or_surface|authored_quantity_or_carrier_identity" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.split.join(
        "|",
      ) ===
        "authored_source_identity|authored_result_identities_or_partition_semantics" &&
      DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID.merge.join(
        "|",
      ) ===
        "authored_input_identities|authored_result_identity_or_shared_result_state",
    "A.11A.59 authored Process & quantity state requirements drifted.",
  );

  for (const id of frozenExpected) {
    assert(
      isDirectorQualificationCapabilityProcessQuantityNonAtomic(id),
      `A.11A.59 ${id} must be classified as non-atomic Process & quantity vocabulary.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.59 ${id} must not remain independently active.`,
    );
  }

  for (const id of ["expand", "contract"]) {
    assert(
      isDirectorQualificationCapabilityProcessQuantityScaleModifier(id),
      `A.11A.59 ${id} must be a signed scale-animation modifier.`,
    );
  }
  for (const id of ["flow", "emit"]) {
    assert(
      isDirectorQualificationCapabilityProcessQuantityCompoundMotif(id),
      `A.11A.59 ${id} must remain a reusable compound motif.`,
    );
  }
  assert(
    isDirectorQualificationCapabilityProcessQuantityGroupCompound("scatter"),
    "A.11A.59 Scatter must be a group-motion compound.",
  );
  for (const id of ["fill", "drain", "accumulate", "split", "merge"]) {
    assert(
      isDirectorQualificationCapabilityProcessQuantityAuthoredStateCompound(id),
      `A.11A.59 ${id} must be an authored-state compound.`,
    );
  }

  const supportExpectations = {
    scatter: ["compound", "translate", "motion_scatter"],
    expand: ["direct", undefined, "motion_expand"],
    contract: ["direct", undefined, "motion_contract"],
    flow: ["compound", "translate", "motion_flow"],
    fill: ["approximate", undefined, "motion_fill"],
    drain: ["approximate", undefined, "motion_drain"],
    emit: ["compound", "translate", "motion_emit"],
    accumulate: ["approximate", undefined, "motion_accumulate"],
    split: ["compound", "translate", "motion_split"],
    merge: ["compound", "translate", "motion_merge"],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "object_motion",
      `A.11A.59 must preserve ${id} as object-motion Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.59 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.59 must preserve ${id}'s runtime fallback ${String(fallback)}; found ${String(item.compiler.fallback_capability_id)}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.59 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  assert(
    DIRECTOR_PROCESS_QUANTITY_BEHAVIOURS.join("|") ===
      "flow|emit|fill|drain|accumulate",
    "A.11A.59 must preserve the Phase 1B.4.6 MotionProgram process lane.",
  );
  assert(
    DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS.flow ===
      "flow_carriers_along_declared_route" &&
      DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS.emit ===
        "emit_independent_carriers_from_source" &&
      DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS.fill ===
        "fill_occupied_quantity_level" &&
      DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS.drain ===
        "drain_occupied_quantity_level" &&
      DIRECTOR_PROCESS_QUANTITY_RECIPE_IDS.accumulate ===
        "accumulate_quantity_at_region",
    "A.11A.59 must preserve the five existing Process & quantity runtime recipes.",
  );

  for (const id of frozenExpected) {
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.59"),
      `A.11A.59 ${id} must expose its structural-closeout rationale in the frozen Qualification profile.`,
    );
  }

  assert(
    activeFamilies.find(
      (family) => family.key === "object_motion:Object relationships",
    ) === undefined,
    "A.11A.59 must not regress the A.11A.58 Object relationships structural closeout.",
  );
  assert(
    activeFamilies.find(
      (family) => family.key === "object_motion:Kinematic constraints",
    ) === undefined,
    "A.11A.59 must not regress the A.11A.57 Kinematic constraints structural closeout.",
  );

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.59 must not regress the seven frozen Basic actor motion primitives.",
  );

  console.log(
    "A.11A.59 Process & quantity structural closeout verified: all ten author-facing Director/runtime verbs remain in the frozen 184-capability vocabulary; Expand/Contract collapse to one signed geometric scale-animation modifier; Flow/Emit remain reusable compound motifs; Scatter is group-motion composition; Fill/Drain/Accumulate/Split/Merge require truthful authored state; the empty family is removed from independent active Qualification without visual retuning.",
  );
}

main();
