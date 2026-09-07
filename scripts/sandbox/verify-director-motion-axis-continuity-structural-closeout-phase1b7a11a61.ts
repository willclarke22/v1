import {
  DIRECTOR_CONTINUITY_RULES,
} from "../../sandbox/probe-lab/director/director-contract";
import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_CONTINUITY_AUTHORED_SEMANTIC_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_CONTINUITY_SCREEN_MOTION_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_CONTINUITY_SEQUENCE_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_CONTINUITY_SHARED_SCREEN_MOTION_MECHANISM,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityContinuityAuthoredSemanticPolicy,
  isDirectorQualificationCapabilityContinuityPolicy,
  isDirectorQualificationCapabilityContinuityScreenMotionPolicy,
  isDirectorQualificationCapabilityContinuitySequencePolicy,
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
    "A.11A.61 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenExpected = [
    "maintain_screen_direction",
    "maintain_axis",
    "eyeline_match",
    "preserve_actor_state",
    "preserve_action_continuity",
    "match_motion_direction",
  ];

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) =>
      family.key === "transition_continuity:Motion & axis continuity",
  );
  const activeFamily = activeFamilies.find(
    (family) =>
      family.key === "transition_continuity:Motion & axis continuity",
  );

  assert(
    frozenFamily,
    "A.11A.61 must preserve the frozen Transitions & continuity · Motion & axis continuity family.",
  );
  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.61 frozen Motion & axis continuity membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );
  assert(
    activeFamily === undefined,
    "A.11A.61 structurally closes Motion & axis continuity; no independent active primitive family should remain.",
  );

  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_SCREEN_MOTION_POLICY_CAPABILITY_IDS.join("|") ===
      "maintain_screen_direction|match_motion_direction",
    "A.11A.61 must preserve the two screen-motion author intents under one shared continuity mechanism.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_SEQUENCE_POLICY_CAPABILITY_IDS.join("|") ===
      "maintain_axis|preserve_actor_state|preserve_action_continuity",
    "A.11A.61 must classify Maintain axis / Preserve actor state / Preserve action continuity as sequence continuity policies.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_AUTHORED_SEMANTIC_POLICY_CAPABILITY_IDS.join("|") ===
      "eyeline_match",
    "A.11A.61 must classify Eyeline match as an authored-semantic continuity policy.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_CAPABILITY_IDS.join("|") ===
      frozenExpected.join("|"),
    "A.11A.61 all six Motion & axis continuity verbs must leave independent primitive Qualification.",
  );

  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_SHARED_SCREEN_MOTION_MECHANISM ===
      "screen_motion_direction_continuity" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.maintain_screen_direction ===
        DIRECTOR_QUALIFICATION_CONTINUITY_SHARED_SCREEN_MOTION_MECHANISM &&
      DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.match_motion_direction ===
        DIRECTOR_QUALIFICATION_CONTINUITY_SHARED_SCREEN_MOTION_MECHANISM,
    "A.11A.61 Maintain screen direction and Match motion direction must share one projected screen-motion continuity mechanism.",
  );
  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.maintain_axis ===
      "action_axis_half_space_continuity" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.eyeline_match ===
        "authored_gaze_eyeline_continuity" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_actor_state ===
        "cross_shot_actor_state_invariant" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_CANONICAL_MECHANISM_BY_ID.preserve_action_continuity ===
        "cross_shot_action_phase_continuity",
    "A.11A.61 continuity-policy canonical mechanisms drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.maintain_screen_direction.join("|") ===
      "tracked_actor_motion_across_transition|outgoing_and_incoming_screen_space_motion_direction" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.match_motion_direction.join("|") ===
        "tracked_actor_motion_across_transition|outgoing_and_incoming_screen_space_motion_direction" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.maintain_axis.join("|") ===
        "authored_or_derived_action_or_relational_axis|camera_side_or_allowed_half_space_before_transition" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.eyeline_match.join("|") ===
        "authored_eye_or_head_position_or_view_origin|authored_gaze_or_trustworthy_semantic_forward_axis|authored_gaze_target" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_actor_state.join("|") ===
        "stable_actor_identity_across_transition|pre_transition_actor_state_snapshot|explicitly_authorized_state_changes" &&
      DIRECTOR_QUALIFICATION_CONTINUITY_POLICY_REQUIREMENTS_BY_ID.preserve_action_continuity.join("|") ===
        "stable_action_identity_across_transition|pre_transition_action_phase_progress_or_trajectory|compatible_post_transition_motion_state",
    "A.11A.61 continuity truth/authority requirements drifted.",
  );

  for (const id of frozenExpected) {
    assert(
      DIRECTOR_CONTINUITY_RULES.includes(
        id as (typeof DIRECTOR_CONTINUITY_RULES)[number],
      ),
      `A.11A.61 must keep ${id} as canonical Director continuity-rule vocabulary.`,
    );
    assert(
      isDirectorQualificationCapabilityContinuityPolicy(id),
      `A.11A.61 ${id} must be classified as a continuity policy.`,
    );
    assert(
      !isDirectorQualificationCapabilityActive(id),
      `A.11A.61 ${id} must not remain independently active as a visual primitive.`,
    );
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.61"),
      `A.11A.61 ${id} must expose its structural-closeout rationale in the frozen Qualification profile.`,
    );
  }

  for (const id of ["maintain_screen_direction", "match_motion_direction"]) {
    assert(
      isDirectorQualificationCapabilityContinuityScreenMotionPolicy(id),
      `A.11A.61 ${id} must use the shared screen-motion continuity policy layer.`,
    );
  }
  for (const id of [
    "maintain_axis",
    "preserve_actor_state",
    "preserve_action_continuity",
  ]) {
    assert(
      isDirectorQualificationCapabilityContinuitySequencePolicy(id),
      `A.11A.61 ${id} must remain a sequence continuity policy.`,
    );
  }
  assert(
    isDirectorQualificationCapabilityContinuityAuthoredSemanticPolicy(
      "eyeline_match",
    ),
    "A.11A.61 Eyeline match must require authored semantic gaze authority.",
  );

  const supportExpectations = {
    maintain_screen_direction: [
      "compound",
      "keep_visible",
      "continuity_screen_direction",
    ],
    maintain_axis: [
      "compound",
      "maintain_screen_direction",
      "continuity_axis",
    ],
    eyeline_match: ["compound", "keep_visible", "continuity_eyeline"],
    preserve_actor_state: [
      "compound",
      "keep_visible",
      "continuity_actor_state",
    ],
    preserve_action_continuity: [
      "compound",
      "maintain_screen_direction",
      "continuity_action",
    ],
    match_motion_direction: [
      "compound",
      "maintain_screen_direction",
      "continuity_motion_direction",
    ],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "transition_continuity" &&
        item.group === "Continuity constraints",
      `A.11A.61 must preserve ${id} as canonical transition-continuity Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.61 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.61 must preserve ${id}'s runtime fallback ${fallback}; found ${String(item.compiler.fallback_capability_id)}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.61 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  const runtimeExpectations = {
    maintain_screen_direction: ["director_contract", "intentional_semantic"],
    maintain_axis: ["director_contract", "intentional_semantic"],
    eyeline_match: ["director_contract", "intentional_semantic"],
    preserve_actor_state: ["scene_state_reducer", "explicit"],
    preserve_action_continuity: ["director_contract", "intentional_semantic"],
    match_motion_direction: ["director_contract", "intentional_semantic"],
  } as const;

  for (const [id, [owner, mode]] of Object.entries(runtimeExpectations)) {
    const coverage =
      DIRECTOR_CONTINUITY_RUNTIME_COVERAGE[
        id as keyof typeof DIRECTOR_CONTINUITY_RUNTIME_COVERAGE
      ];
    assert(
      coverage.owner === owner && coverage.mode === mode,
      `A.11A.61 must preserve ${id}'s runtime ownership ${owner}/${mode}; found ${coverage.owner}/${coverage.mode}.`,
    );
  }

  const activeVisualContinuity = activeFamilies.find(
    (family) => family.key === "transition_continuity:Visual continuity",
  );
  assert(
    activeVisualContinuity?.capability_ids.join("|") ===
      "keep_visible|preserve_visual_anchor|avoid_occlusion|preserve_screen_position|preserve_relative_scale|preserve_orientation",
    "A.11A.61 must not accidentally remove the separate Visual continuity family from active Qualification.",
  );

  for (const closedKey of [
    "object_motion:Rigid mechanics",
    "object_motion:Process & quantity motion",
    "object_motion:Object relationships",
    "object_motion:Kinematic constraints",
  ]) {
    assert(
      activeFamilies.find((family) => family.key === closedKey) === undefined,
      `A.11A.61 must not regress prior structural closeout ${closedKey}.`,
    );
  }

  const activeBasicActorMotion = activeFamilies.find(
    (family) => family.key === "object_motion:Basic actor motion",
  );
  assert(
    activeBasicActorMotion?.capability_ids.join("|") ===
      "translate|rotate|follow_path|enter_frame|exit_frame|move_toward|move_away",
    "A.11A.61 must not regress the seven frozen Basic actor motion primitives.",
  );

  console.log(
    "A.11A.61 Motion & axis continuity structural closeout verified: all six author-facing continuity verbs remain first-class canonical Director continuity policy; Maintain screen direction and Match motion direction share one projected screen-motion invariant; Maintain axis / actor-state / action continuity remain sequence constraints; Eyeline match requires authored gaze semantics; the empty Motion & axis continuity family leaves independent primitive Qualification without visual retuning.",
  );
}

main();
