import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIRECTOR_CAPABILITIES,
  directorCapabilityById,
  type DirectorCapability,
} from "../../sandbox/probe-lab/motion-camera-library/director-capability-registry";
import {
  DIRECTOR_QUALIFICATION_TRANSITION_ACTIVE_REPAIR_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CAMERA_INTERPOLATION_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID,
  DIRECTOR_QUALIFICATION_TRANSITION_COMPOUND_MOTIF_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_CONTINUITY_COMPOUND_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_FROZEN_PRIMITIVE_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_NON_ATOMIC_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID,
  DIRECTOR_QUALIFICATION_TRANSITION_SEQUENCE_POLICY_CAPABILITY_IDS,
  DIRECTOR_QUALIFICATION_TRANSITION_TIMING_MODIFIER_CAPABILITY_IDS,
  buildActiveDirectorQualificationFamilies,
  buildDirectorQualificationFamilies,
  directorQualificationCapabilityProfile,
  isDirectorQualificationCapabilityActive,
  isDirectorQualificationCapabilityTransitionActiveRepair,
  isDirectorQualificationCapabilityTransitionFrozenPrimitive,
  isDirectorQualificationCapabilityTransitionNonAtomic,
} from "../../sandbox/probe-lab/motion-camera-library/director-qualification-families";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function capability(id: string): DirectorCapability {
  const found = directorCapabilityById(id);
  assert(found, `Missing Director capability ${id}.`);
  return found;
}

function main() {
  assert(
    DIRECTOR_CAPABILITIES.length === 184,
    "A.11A.63 must preserve the frozen 184-capability Director vocabulary.",
  );

  const frozenExpected = [
    "hard_cut",
    "smooth_blend",
    "match_cut",
    "continuous_take",
    "cut_on_action",
    "crossfade",
    "camera_pass_transition",
    "scale_transition",
    "hold",
  ];

  const frozenFamilies = buildDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const activeFamilies = buildActiveDirectorQualificationFamilies(DIRECTOR_CAPABILITIES);
  const frozenFamily = frozenFamilies.find(
    (family) => family.key === "transition_continuity:Transitions",
  );
  const activeFamily = activeFamilies.find(
    (family) => family.key === "transition_continuity:Transitions",
  );

  assert(
    frozenFamily,
    "A.11A.63 must preserve the frozen Transitions & continuity · Transitions family.",
  );
  assert(
    frozenFamily.capability_ids.join("|") === frozenExpected.join("|"),
    `A.11A.63 frozen Transitions membership drifted: ${frozenFamily.capability_ids.join("|")}`,
  );
  assert(
    activeFamily === undefined,
    `A.11A.63 final closeout must remove the now-empty active Transitions family; found ${activeFamily?.capability_ids.join("|") ?? "<missing>"}.`,
  );

  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_FROZEN_PRIMITIVE_CAPABILITY_IDS.join("|") ===
      "hard_cut|crossfade",
    "A.11A.63 must freeze Hard cut and Crossfade as the two foundational atomic edit transitions.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_ACTIVE_REPAIR_CAPABILITY_IDS.length === 0,
    "A.11A.63 must leave no unresolved active Transition repair.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_CAMERA_INTERPOLATION_CAPABILITY_IDS.join("|") ===
      "smooth_blend",
    "A.11A.63 Smooth blend classification drifted.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_CONTINUITY_COMPOUND_CAPABILITY_IDS.join("|") ===
      "match_cut|cut_on_action",
    "A.11A.63 continuity-aware transition compound classification drifted.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_SEQUENCE_POLICY_CAPABILITY_IDS.join("|") ===
      "continuous_take",
    "A.11A.63 Continuous take must remain a no-cut sequence policy.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_COMPOUND_MOTIF_CAPABILITY_IDS.join("|") ===
      "camera_pass_transition|scale_transition",
    "A.11A.63 transition motif classification drifted.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_TIMING_MODIFIER_CAPABILITY_IDS.join("|") ===
      "hold",
    "A.11A.63 Hold must remain a pacing/timing modifier.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_NON_ATOMIC_CAPABILITY_IDS.join("|") ===
      "smooth_blend|match_cut|continuous_take|cut_on_action|camera_pass_transition|scale_transition|hold",
    "A.11A.63 seven non-atomic Transition verbs drifted.",
  );

  for (const id of ["hard_cut", "crossfade"] as const) {
    assert(
      isDirectorQualificationCapabilityTransitionFrozenPrimitive(id) &&
        !isDirectorQualificationCapabilityActive(id),
      `A.11A.63 ${id} must remain frozen and absent from another active reel slot.`,
    );
  }
  assert(
    !isDirectorQualificationCapabilityTransitionActiveRepair("crossfade"),
    "A.11A.63 Crossfade must graduate out of active-repair status.",
  );
  for (const id of DIRECTOR_QUALIFICATION_TRANSITION_NON_ATOMIC_CAPABILITY_IDS) {
    assert(
      isDirectorQualificationCapabilityTransitionNonAtomic(id) &&
        !isDirectorQualificationCapabilityActive(id),
      `A.11A.63 ${id} must remain outside independent primitive Qualification.`,
    );
  }

  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.hard_cut ===
      "instantaneous_shot_boundary" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.crossfade ===
        "two_shot_alpha_composite" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.smooth_blend ===
        "continuous_camera_state_interpolation" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.match_cut ===
        "hard_cut_with_cross_shot_visual_correspondence" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.cut_on_action ===
        "hard_cut_with_action_phase_continuity" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.continuous_take ===
        "forbid_cut_interval" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.camera_pass_transition ===
        "camera_occlusion_pass_transition" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.scale_transition ===
        "authored_endpoint_scale_transition" &&
      DIRECTOR_QUALIFICATION_TRANSITION_CANONICAL_MECHANISM_BY_ID.hold ===
        "shot_dwell_timing",
    "A.11A.63 canonical Transition mechanisms drifted.",
  );

  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID.crossfade.join("|") ===
      "complete_outgoing_shot_state|complete_incoming_shot_state|simultaneous_two_shot_render_authority|deterministic_image_space_alpha_composite",
    "A.11A.63 Crossfade must preserve its two-complete-shot deterministic alpha-composite requirements.",
  );
  assert(
    DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID.match_cut.includes(
      "measured_or_authored_cross_shot_visual_correspondence",
    ) &&
      DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID.scale_transition.includes(
        "shared_visual_anchor_mapping",
      ) &&
      DIRECTOR_QUALIFICATION_TRANSITION_REQUIREMENTS_BY_ID.camera_pass_transition.includes(
        "truthful_foreground_occluder_or_pass_boundary",
      ),
    "A.11A.63 must preserve semantic authority requirements for Match cut / Scale transition / Camera pass transition.",
  );

  const hardCutProfile = directorQualificationCapabilityProfile(
    frozenFamily,
    "hard_cut",
  );
  const crossfadeProfile = directorQualificationCapabilityProfile(
    frozenFamily,
    "crossfade",
  );
  assert(
    hardCutProfile.qualification_note?.includes("A.11A.63") &&
      hardCutProfile.qualification_note.includes("two foundational edit transitions"),
    "A.11A.63 Hard cut profile must record the final two-primitive Transitions closeout.",
  );
  assert(
    crossfadeProfile.qualification_note?.includes("A.11A.63") &&
      crossfadeProfile.qualification_note.includes("Baseline + Diversity") &&
      crossfadeProfile.qualification_note.includes("deterministic image-space dissolve") &&
      crossfadeProfile.qualification_note.includes("two-render-target compositor"),
    "A.11A.63 Crossfade profile must record the repaired cross-asset confirmation and preserve the truthful compositor.",
  );
  for (const id of DIRECTOR_QUALIFICATION_TRANSITION_NON_ATOMIC_CAPABILITY_IDS) {
    const profile = directorQualificationCapabilityProfile(frozenFamily, id);
    assert(
      profile.qualification_note?.includes("A.11A.62"),
      `A.11A.63 must preserve ${id}'s A.11A.62 higher-level taxonomy rationale.`,
    );
  }

  const supportExpectations = {
    hard_cut: ["direct", undefined, "transition_hard_cut"],
    smooth_blend: ["direct", undefined, "transition_smooth_blend"],
    match_cut: ["approximate", "hard_cut", "transition_match_cut"],
    continuous_take: ["compound", "smooth_blend", "transition_continuous_take"],
    cut_on_action: ["approximate", "hard_cut", "transition_cut_on_action"],
    crossfade: ["approximate", "smooth_blend", "transition_crossfade"],
    camera_pass_transition: ["compound", "smooth_blend", "transition_camera_pass"],
    scale_transition: ["compound", "smooth_blend", "transition_scale"],
    hold: ["direct", undefined, "transition_hold"],
  } as const;

  for (const [id, [support, fallback, demoKind]] of Object.entries(
    supportExpectations,
  )) {
    const item = capability(id);
    assert(
      item.category === "transition_continuity" && item.group === "Transitions",
      `A.11A.63 must preserve ${id} as canonical Transitions Director vocabulary.`,
    );
    assert(
      item.compiler.threejs === support,
      `A.11A.63 must preserve ${id}'s existing Three.js support ${support}; found ${item.compiler.threejs}.`,
    );
    assert(
      item.compiler.fallback_capability_id === fallback,
      `A.11A.63 must preserve ${id}'s existing fallback ${String(fallback)}; found ${String(item.compiler.fallback_capability_id)}.`,
    );
    assert(
      item.demo.kind === demoKind,
      `A.11A.63 must preserve ${id}'s runtime demo lane ${demoKind}; found ${item.demo.kind}.`,
    );
  }

  const sharedRuntime = source(
    "sandbox/probe-lab/scenes/ui/director-transition-runtime.tsx",
  );
  for (const marker of [
    "DirectorShotCrossfadeCompositor",
    "new THREE.WebGLRenderTarget",
    "uFromShot",
    "uToShot",
    "gl_FragColor = mix(fromShot, toShot, uMix)",
    "sampleDirectorCameraPose",
    "gl.render(scene, fromCamera)",
    "gl.render(scene, toCamera)",
    "gl.render(composite.scene, composite.camera)",
    "useFrame(() =>",
    "}, 1);",
  ]) {
    assert(
      sharedRuntime.includes(marker),
      `A.11A.63 shared Crossfade runtime marker missing: ${marker}`,
    );
  }
  assert(
    !sharedRuntime.includes("Html") &&
      !sharedRuntime.includes("document.") &&
      !sharedRuntime.includes("createElement"),
    "A.11A.63 Crossfade must remain a shared WebGL compositor, not a DOM/UI proof overlay.",
  );

  const sceneUiIndex = source("sandbox/probe-lab/scenes/ui/index.ts");
  assert(
    sceneUiIndex.includes("DirectorShotCrossfadeCompositor") &&
      sceneUiIndex.includes('from "./director-transition-runtime"'),
    "A.11A.63 shared scene runtime must continue exporting the Crossfade compositor.",
  );

  const preview = source(
    "sandbox/probe-lab/motion-camera-library/ui/director-capability-preview.tsx",
  );
  assert(
    preview.includes('capability.id === "crossfade" && qualificationVisibilityAssist') &&
      preview.includes("<DirectorShotCrossfadeCompositor") &&
      preview.includes("fromProgress={0.22}") &&
      preview.includes("toProgress={0.82}") &&
      preview.includes("blendStartProgress={0.34}") &&
      preview.includes("blendEndProgress={0.66}"),
    "A.11A.63 must preserve the repaired deterministic Crossfade evidence path even after it leaves the active family.",
  );

  const a62Source = source(
    "scripts/sandbox/verify-director-transitions-crossfade-repair-phase1b7a11a62.ts",
  );
  for (const marker of [
    "A.11A.62 successor safety",
    "crossfadeFinalFrozen",
    "later verified Crossfade freeze",
    "shared deterministic two-render-target compositor",
  ]) {
    assert(
      a62Source.includes(marker),
      `A.11A.63 predecessor A.11A.62 verifier is not successor-safe: ${marker}`,
    );
  }

  const activeMotionAxis = activeFamilies.find(
    (family) => family.key === "transition_continuity:Motion & axis continuity",
  );
  assert(
    activeMotionAxis === undefined,
    "A.11A.63 must not regress the A.11A.61 Motion & axis continuity closeout.",
  );

  console.log(
    "A.11A.63 final Transitions closeout verified: Hard cut and the repaired Crossfade are frozen as the two foundational edit primitives; the repaired shared alpha compositor remains protected; Smooth blend / Match cut / Continuous take / Cut on action / Camera pass / Scale transition / Hold remain canonical higher-level Director vocabulary; the active Transitions family is intentionally empty.",
  );
}

main();
