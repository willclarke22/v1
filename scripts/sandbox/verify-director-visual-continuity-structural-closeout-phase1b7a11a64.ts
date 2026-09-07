import {
  DIRECTOR_CONTINUITY_RULES,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_ACTOR_STATE_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_BASE_POLICY_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_FRAMING_VISIBILITY_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_OCCLUSION_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_PROJECTED_SCALE_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SCREEN_ANCHOR_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SHARED_SCREEN_ANCHOR_MECHANISM,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityVisualContinuityPolicy,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";
import {
  DIRECTOR_CONTINUITY_RUNTIME_COVERAGE,
} from "../../sandbox/probe-lab/scenes/director-runtime-coverage";

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
    "A.11A.64 must preserve the frozen 184-capability Director vocabulary.",
  );

  const expected = [
    "keep_visible",
    "preserve_visual_anchor",
    "avoid_occlusion",
    "preserve_screen_position",
    "preserve_relative_scale",
    "preserve_orientation",
  ];

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "transition_continuity:Visual continuity",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "transition_continuity:Visual continuity",
  );

  assert(
    frozenFamily,
    "A.11A.64 must preserve the frozen Transitions & continuity · Visual continuity family.",
  );
  assert(
    frozenFamily.capability_ids.join("|") === expected.join("|"),
    `A.11A.64 frozen Visual continuity membership drifted: ${frozenFamily.capability_ids.join("|")}.`,
  );
  assert(
    activeFamily === undefined,
    `A.11A.64 structurally closes Visual continuity; no independent active primitive family should remain, found ${activeFamily?.capability_ids.join("|") ?? "<missing>"}.`,
  );

  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_FRAMING_VISIBILITY_POLICY_CAPABILITY_IDS.join("|") ===
      "keep_visible",
    "A.11A.64 Keep visible must remain the framing-visibility continuity constraint.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SCREEN_ANCHOR_POLICY_CAPABILITY_IDS.join("|") ===
      "preserve_visual_anchor|preserve_screen_position",
    "A.11A.64 Preserve visual anchor and Preserve screen position must share one screen-anchor policy layer.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_OCCLUSION_POLICY_CAPABILITY_IDS.join("|") ===
      "avoid_occlusion",
    "A.11A.64 Avoid occlusion must remain a distinct line-of-sight policy.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_PROJECTED_SCALE_POLICY_CAPABILITY_IDS.join("|") ===
      "preserve_relative_scale",
    "A.11A.64 Preserve relative scale must remain a projected-composition invariant.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_ACTOR_STATE_POLICY_CAPABILITY_IDS.join("|") ===
      "preserve_orientation",
    "A.11A.64 Preserve orientation must remain an actor-state continuity specialization.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_CAPABILITY_IDS.join("|") ===
      expected.join("|"),
    "A.11A.64 all six Visual continuity verbs must leave independent primitive Qualification.",
  );

  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SHARED_SCREEN_ANCHOR_MECHANISM ===
      "screen_anchor_continuity" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_visual_anchor ===
        DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SHARED_SCREEN_ANCHOR_MECHANISM &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_screen_position ===
        DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_SHARED_SCREEN_ANCHOR_MECHANISM,
    "A.11A.64 Preserve visual anchor and Preserve screen position must share one screen-anchor continuity mechanism.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.keep_visible ===
      "framing_visibility_constraint" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.avoid_occlusion ===
        "line_of_sight_occlusion_constraint" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_relative_scale ===
        "projected_relative_scale_continuity" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_orientation ===
        "actor_orientation_state_invariant",
    "A.11A.64 Visual continuity canonical mechanisms drifted.",
  );
  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_BASE_POLICY_BY_ID.preserve_orientation ===
      "preserve_actor_state",
    "A.11A.64 Preserve orientation must explicitly specialize Preserve actor state.",
  );

  assert(
    DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.keep_visible.join("|") ===
      "stable_actor_identity|projected_actor_bounds_or_screen_envelope|authored_safe_frame_or_frustum_bounds" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_visual_anchor.join("|") ===
        "stable_actor_identity|outgoing_projected_anchor|authored_target_screen_anchor_or_region" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_screen_position.join("|") ===
        "stable_actor_identity|outgoing_projected_anchor|authored_target_screen_anchor_or_region" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.avoid_occlusion.join("|") ===
        "stable_actor_identity|camera_to_subject_line_of_sight_or_occlusion_estimate|maximum_allowed_occlusion_ratio" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_relative_scale.join("|") ===
        "stable_actor_or_pair_identity|outgoing_projected_size_or_size_ratio|incoming_projected_size_or_size_ratio|continuity_tolerance" &&
      DIRECTOR_QUALIFICATION_VISUAL_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_orientation.join("|") ===
        "stable_actor_identity|pre_transition_authored_orientation_state|explicitly_authorized_orientation_changes",
    "A.11A.64 Visual continuity truth/authority requirements drifted.",
  );

  for (const id of expected) {
    assert(
      DIRECTOR_CONTINUITY_RULES.includes(
        id as (typeof DIRECTOR_CONTINUITY_RULES)[number],
      ),
      `A.11A.64 must keep ${id} as canonical Director continuity-rule vocabulary.`,
    );
    assert(
      isDirectorQualificationCapabilityVisualContinuityPolicy(id),
      `A.11A.64 ${id} must be classified as a Visual continuity policy.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.64 ${id} must not remain independently active as a visual primitive.`,
    );
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.64"),
      `A.11A.64 ${id} must expose its structural-closeout rationale in the frozen Qualification profile.`,
    );
  }

  assert(
    directorQualificationCapabilityProfile(frozenFamily, "preserve_screen_position")
      .merge_compare_with_capability_id === "preserve_visual_anchor",
    "A.11A.64 Preserve screen position must point to Preserve visual anchor as the shared-mechanism comparison.",
  );
  assert(
    directorQualificationCapabilityProfile(frozenFamily, "preserve_orientation")
      .merge_compare_with_capability_id === "preserve_actor_state",
    "A.11A.64 Preserve orientation must point to Preserve actor state as its continuity-base comparison.",
  );

  const supportExpectations = {
    keep_visible: ["direct", undefined, "continuity_keep_visible"],
    preserve_visual_anchor: ["direct", undefined, "continuity_visual_anchor"],
    avoid_occlusion: ["approximate", "keep_visible", "continuity_avoid_occlusion"],
    preserve_screen_position: ["compound", "preserve_visual_anchor", "continuity_screen_position"],
    preserve_relative_scale: ["compound", "keep_visible", "continuity_relative_scale"],
    preserve_orientation: ["compound", "maintain_screen_direction", "continuity_orientation"],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "transition_continuity" &&
        item.group === "Continuity constraints",
      `A.11A.64 must preserve ${id} as canonical transition-continuity Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.64 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.64 must preserve ${id}'s runtime fallback ${String(fallback)}; found ${String(item.compiler.fallback_capability_id)}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.64 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  const runtimeExpectations = {
    keep_visible: ["shot_validator", "validation_contract"],
    preserve_visual_anchor: ["director_contract", "intentional_semantic"],
    avoid_occlusion: ["shot_validator", "validation_contract"],
    preserve_screen_position: ["director_contract", "intentional_semantic"],
    preserve_relative_scale: ["composition_solver", "derived"],
    preserve_orientation: ["director_contract", "intentional_semantic"],
  } as const;

  for (const [id, [owner, mode]] of Object.entries(runtimeExpectations)) {
    const coverage =
      DIRECTOR_CONTINUITY_RUNTIME_COVERAGE[
        id as keyof typeof DIRECTOR_CONTINUITY_RUNTIME_COVERAGE
      ];
    assert(
      coverage.owner === owner && coverage.mode === mode,
      `A.11A.64 must preserve ${id}'s runtime ownership ${owner}/${mode}; found ${coverage.owner}/${coverage.mode}.`,
    );
  }

  for (const closedKey of [
    "transition_continuity:Motion & axis continuity",
    "transition_continuity:Transitions",
    "object_motion:Rigid mechanics",
    "object_motion:Process & quantity motion",
    "object_motion:Object relationships",
    "object_motion:Kinematic constraints",
  ]) {
    assert(
      activeFamilies.find((family) => family.key === closedKey) === undefined,
      `A.11A.64 must not regress prior structural closeout ${closedKey}.`,
    );
  }

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.64 must not regress the seven frozen Basic actor motion primitives.",
  );

  console.log(
    "A.11A.64 Visual continuity structural closeout verified: all six author-facing continuity verbs remain canonical Director policy vocabulary; Preserve visual anchor / Preserve screen position share one screen-anchor invariant; Keep visible / Avoid occlusion remain distinct framing and line-of-sight constraints; Preserve relative scale remains a projected-composition invariant; Preserve orientation specializes actor-state continuity; the empty Visual continuity family leaves independent primitive Qualification without visual retuning.",
  );
}

main();
