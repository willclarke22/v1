import {
  DIRECTOR_CATEGORY_LABELS,
  type DirectorCapability,
  type DirectorCapabilityCategory,
} from "./director-capability-registry";
import type { DirectorQualificationCastSlotId } from "./director-qualification-cast";
import {
  defaultQualificationNormalizationPolicy,
  type DirectorQualificationNormalizationPolicy,
} from "./director-qualification-normalization";
import type { DirectorQualificationSceneId } from "./director-qualification-scenes";

export type DirectorQualificationCapabilityProfile = {
  suitable_primary_cast_slots: DirectorQualificationCastSlotId[];
  comparison_group: "tracking_relationship" | "mounted_camera" | null;
  requires_directional_facing: boolean;
  merge_compare_with_capability_id: string | null;
  qualification_note: string | null;
};

export type DirectorQualificationFamily = {
  key: string;
  label: string;
  category: DirectorCapabilityCategory;
  group: string;
  capability_ids: string[];
  recommended_scene_id: DirectorQualificationSceneId;
  primary_cast_slots: DirectorQualificationCastSlotId[];
  normalization_policy: DirectorQualificationNormalizationPolicy;
  capability_profiles: Record<string, DirectorQualificationCapabilityProfile>;
};

function inSet(id: string, values: readonly string[]) {
  return values.includes(id);
}

function auditionGroup(capability: DirectorCapability) {
  const { category, group, id } = capability;

  if (category === "camera_framing" && group === "Shot size") {
    if (
      inSet(id, [
        "macro",
        "insert",
        "two_shot",
        "group_shot",
        "over_shoulder",
        "point_of_view",
        "cutaway",
      ])
    ) {
      return "Detail & relationship framing";
    }
    return "Shot scale";
  }

  if (category === "camera_angle") {
    if (
      inSet(id, [
        "side_profile",
        "front_profile",
        "rear_profile",
        "three_quarter_front",
        "three_quarter_rear",
      ])
    ) {
      return "Profile & three-quarter views";
    }
    if (inSet(id, ["isometric", "object_attached", "inside_object"])) {
      return "Special viewpoints";
    }
    return "Vertical & expressive angles";
  }

  if (category === "camera_movement") {
    if (
      inSet(id, [
        "follow",
        "lead_subject",
        "lag_follow",
        "track_parallel",
        "camera_object_attached",
      ])
    ) {
      return "Tracking & attached camera";
    }
    if (
      inSet(id, [
        "orbit",
        "arc_left",
        "arc_right",
        "reverse_reveal",
        "rise_reveal",
      ])
    ) {
      return "Orbit, arc & reveal paths";
    }
    if (inSet(id, ["pan", "tilt", "reframe"])) {
      return "Rotational reframing";
    }
    if (inSet(id, ["spline", "pass_through"])) {
      return "Complex camera paths";
    }
    return "Linear camera travel";
  }

  if (category === "object_motion" && group === "Actor movement") {
    if (
      inSet(id, [
        "hinge",
        "slide",
        "roll",
        "spin",
        "lift",
        "lower",
        "object_open",
        "object_close",
      ])
    ) {
      return "Rigid mechanics";
    }
    if (
      inSet(id, [
        "attach",
        "detach",
        "insert_into",
        "remove_from",
        "assemble",
        "disassemble",
      ])
    ) {
      return "Object relationships";
    }
    if (
      inSet(id, [
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
      ])
    ) {
      return "Process & quantity motion";
    }
    return "Basic actor motion";
  }

  if (category === "blocking_placement") {
    if (inSet(id, ["on_ground", "on_surface", "inside"])) {
      return "Support & containment";
    }
    if (
      inSet(id, [
        "foreground",
        "midground",
        "background",
        "screen_left",
        "screen_right",
        "layered_depth",
      ])
    ) {
      return "Depth & screen placement";
    }
    if (
      inSet(id, [
        "surround",
        "form_line",
        "form_circle",
        "cluster",
        "symmetrical_pair",
      ])
    ) {
      return "Group formations";
    }
    return "Relative actor placement";
  }

  if (category === "lighting_emphasis") {
    if (
      inSet(id, [
        "spotlight_subject",
        "highlight_subject",
        "dim_environment",
        "emissive_subject",
        "track_spotlight",
      ])
    ) {
      return "Subject emphasis";
    }
    if (
      inSet(id, [
        "light_reveal",
        "shadow_projection",
        "volumetric_beam",
        "exposure_shift",
      ])
    ) {
      return "Lighting reveals & effects";
    }
    return "Lighting style & motivation";
  }

  if (category === "transition_continuity" && group === "Continuity constraints") {
    if (
      inSet(id, [
        "keep_visible",
        "preserve_visual_anchor",
        "avoid_occlusion",
        "preserve_screen_position",
        "preserve_relative_scale",
        "preserve_orientation",
      ])
    ) {
      return "Visual continuity";
    }
    return "Motion & axis continuity";
  }

  return group;
}

function recommendedScene(
  category: DirectorCapabilityCategory,
  group: string,
  ids: string[],
): DirectorQualificationSceneId {
  const haystack = `${group} ${ids.join(" ")}`.toLowerCase();

  if (
    category === "camera_framing" ||
    category === "camera_angle" ||
    category === "lighting_emphasis"
  ) {
    return "scene_c_hero_object";
  }

  if (
    category === "camera_movement" &&
    /(tracking|attached|linear camera travel|follow|lead|lag|track|travell|chase)/.test(
      haystack,
    )
  ) {
    return "scene_d_travelling_subject";
  }

  if (category === "narrative_attention") {
    if (group === "Scale & representation") return "scene_c_hero_object";
    return "scene_b_spatial_relationship";
  }

  if (category === "object_motion") {
    if (group === "Basic actor motion") return "scene_d_travelling_subject";
    return "scene_b_spatial_relationship";
  }

  if (
    /(enter|exit|approach|retreat|point.of.view|shoulder|follow|lead|lag)/.test(
      haystack,
    )
  ) {
    return "scene_a_character_target";
  }

  if (
    category === "blocking_placement" ||
    category === "transition_continuity" ||
    category === "camera_movement"
  ) {
    return "scene_b_spatial_relationship";
  }

  return "scene_b_spatial_relationship";
}

function castSlotsForFamily(
  category: DirectorCapabilityCategory,
  group: string,
): DirectorQualificationCastSlotId[] {
  if (category === "camera_framing") {
    return group === "Detail & relationship framing"
      ? ["character", "small_detail", "irregular_hero", "furniture", "compact_rigid"]
      : ["character", "irregular_hero", "furniture", "vehicle", "small_detail"];
  }

  if (category === "camera_angle") {
    if (group === "Profile & three-quarter views") {
      return ["character", "furniture", "organic_elongated", "vehicle", "small_asymmetric"];
    }
    if (group === "Special viewpoints") {
      return ["character", "vehicle", "furniture", "irregular_hero"];
    }
    return ["character", "irregular_hero", "furniture", "vehicle", "compact_rigid"];
  }

  if (category === "camera_movement") {
    if (group === "Tracking & attached camera") {
      return ["character", "vehicle", "organic_elongated", "furniture", "compact_rigid"];
    }
    if (group === "Orbit, arc & reveal paths") {
      return ["irregular_hero", "furniture", "compact_rigid", "organic_elongated", "vehicle"];
    }
    if (group === "Rotational reframing") {
      return ["character", "irregular_hero", "compact_rigid", "furniture", "small_detail"];
    }
    if (group === "Complex camera paths") {
      return ["character", "vehicle", "furniture", "irregular_hero"];
    }
    return ["character", "irregular_hero", "furniture", "vehicle", "compact_rigid"];
  }

  if (category === "object_motion") {
    if (group === "Rigid mechanics") {
      return ["simple_rigid", "small_asymmetric", "furniture", "vehicle", "small_detail"];
    }
    if (group === "Object relationships") {
      return ["simple_rigid", "small_detail", "irregular_hero", "furniture", "compact_rigid"];
    }
    if (group === "Process & quantity motion") {
      return ["small_detail", "simple_rigid", "irregular_hero", "small_asymmetric"];
    }
    return ["simple_rigid", "small_asymmetric", "organic_elongated", "furniture", "vehicle"];
  }

  if (category === "blocking_placement") {
    if (group === "Support & containment") {
      return ["small_detail", "simple_rigid", "irregular_hero", "furniture", "compact_rigid"];
    }
    if (group === "Group formations") {
      return ["compact_rigid", "simple_rigid", "character", "small_asymmetric"];
    }
    return ["character", "furniture", "compact_rigid", "irregular_hero", "simple_rigid"];
  }

  if (category === "lighting_emphasis") {
    return ["irregular_hero", "small_detail", "character", "small_asymmetric", "furniture"];
  }

  if (category === "transition_continuity") {
    return ["character", "vehicle", "irregular_hero", "furniture", "organic_elongated"];
  }

  if (category === "narrative_attention") {
    return ["irregular_hero", "character", "compact_rigid", "furniture", "small_detail"];
  }

  return ["character", "compact_rigid", "furniture", "irregular_hero"];
}

function capabilityProfile(
  familyCategory: DirectorCapabilityCategory,
  familyGroup: string,
  capabilityId: string,
  fallbackSlots: DirectorQualificationCastSlotId[],
): DirectorQualificationCapabilityProfile {
  if (
    familyCategory === "narrative_attention" &&
    familyGroup === "Attention sequence"
  ) {
    if (capabilityId === "orient") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "establish",
        qualification_note:
          "A.11A.44 closes Orient into Establish after cross-asset evidence showed the same establishing composition and spatial-information primitive. Keep `orient` as frozen compatibility / higher-level narrative intent, but canonical capability authoring resolves to Establish.",
      };
    }
    if (capabilityId === "introduce") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Introduce remains active as an explicitly compound narrative motif: preserve established context, bring the new actor into the argument, reframe attention, and settle after the reveal. Do not mislabel it as a new atomic renderer primitive.",
      };
    }
    if (capabilityId === "compare") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Compare is qualified by balanced simultaneous readability of the two actors. Any dashed relationship guide in Qualification is proof instrumentation only, not part of the production Compare primitive.",
      };
    }
  }
  if (
    familyCategory === "lighting_emphasis" &&
    familyGroup === "Subject emphasis"
  ) {
    if (capabilityId === "dim_environment") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "spotlight_subject",
        qualification_note:
          "A.11A.42 removes Dim environment from standalone active Qualification. Preserve it as a composable environment-dim lighting modifier / compatibility intent that can support Spotlight subject and other recipes instead of freezing a duplicate perceptual primitive.",
      };
    }
    if (capabilityId === "spotlight_subject") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Spotlight-subject qualification must prove a localized pool on the hero while a visible competitor remains materially subordinate outside the cone.",
      };
    }
    if (capabilityId === "track_spotlight") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Tracking-spotlight qualification must show large primary-subject travel while the stationary competitor remains comparatively dark and the real SpotLight stays attached to the moving hero.",
      };
    }
  }
  if (
    familyCategory === "camera_framing" &&
    familyGroup === "Detail & relationship framing"
  ) {
    if (capabilityId === "insert") {
      return {
        suitable_primary_cast_slots: ["small_detail", "compact_rigid", "irregular_hero"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Insert qualification uses a whole small/compact object as the explicit detail target. Baseline and Diversity must change the framed target asset rather than replaying one context GLB.",
      };
    }
    if (capabilityId === "two_shot") {
      return {
        suitable_primary_cast_slots: ["character", "furniture", "compact_rigid", "irregular_hero"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Two-shot qualification must keep both planned actors fully inside the projected safe frame.",
      };
    }
    if (capabilityId === "group_shot") {
      return {
        suitable_primary_cast_slots: ["character", "furniture", "compact_rigid", "irregular_hero"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Group-shot qualification is a compact three-actor cluster: primary, secondary, and context must all read as one functional group instead of forcing an extreme-wide fit around arbitrary Scene-C spacing.",
      };
    }
    if (capabilityId === "over_shoulder") {
      return {
        suitable_primary_cast_slots: ["character"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Over-shoulder qualification requires a Character foreground source so the near silhouette can truthfully read as a shoulder/body reference. Baseline and Diversity keep that source stable and vary the viewed target instead.",
      };
    }
    if (capabilityId === "point_of_view") {
      return {
        suitable_primary_cast_slots: ["character"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Point-of-view is deferred from active Qualification until reviewed/directable assets expose a semantic viewpoint anchor (eye/head/cockpit/tool-tip as appropriate) plus a trustworthy forward axis. A generic bounds-derived camera origin is not strong enough perceptual evidence; the frozen legacy POV id remains executable for compatibility.",
      };
    }
    if (capabilityId === "cutaway") {
      return {
        suitable_primary_cast_slots: ["character", "furniture", "irregular_hero", "compact_rigid"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "show_inside_outside",
        qualification_note:
          "Cutaway is deferred from atomic camera-framing qualification. Its cinematic meaning depends on before/after shot context and belongs in higher-order narrative/editing grammar such as Inside / outside, reveal_cutaway, and Return to context; the legacy framing id remains frozen for compatibility.",
      };
    }
  }

  if (familyCategory === "camera_framing" && familyGroup === "Shot scale") {
    if (
      inSet(capabilityId, [
        "medium_wide",
        "medium",
        "medium_close",
        "close",
      ])
    ) {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Shot-scale qualification uses the Character baseline to prove an ordered upper-subject crop ladder while Diversity remains free to stress arbitrary geometry. Tall/upright single subjects progressively raise the optical target and tighten occupancy from Medium-wide through Close; non-tall subjects retain the established geometric-centre behavior.",
      };
    }
    if (capabilityId === "extreme_close") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Extreme-close is deferred until a semantic region / feature anchor identifies what tiny region is meaningful. Magnifying an arbitrary bounds centre is not honest extreme-close evidence; retain the frozen capability for future anchored execution.",
      };
    }
  }

  if (familyCategory === "camera_framing" && familyGroup === "Lens") {
    if (
      inSet(capabilityId, [
        "lens_ultra_wide",
        "lens_wide",
        "lens_normal",
        "lens_portrait",
        "lens_telephoto",
      ])
    ) {
      return {
        suitable_primary_cast_slots: ["character"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Lens qualification is a controlled perspective-compression experiment. Every active focal-length sibling uses the same three assets and the same near/mid/far blocking within a pass; only focal length / FOV may change. Baseline and Diversity use separate stable cast sets.",
      };
    }
    if (capabilityId === "lens_macro") {
      return {
        suitable_primary_cast_slots: ["small_detail"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "macro",
        qualification_note:
          "Macro lens is deferred until semantic feature anchors and a real close-focus / magnification model exist. The current Three.js proof reduces Macro lens to a narrow FOV and cannot honestly distinguish it from ordinary telephoto framing; retain the frozen id as a future merge candidate with Macro framing.",
      };
    }
    if (capabilityId === "focus_shallow" || capabilityId === "focus_deep") {
      return {
        suitable_primary_cast_slots: ["character"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Depth-of-field qualification is deferred as a pair until the active preview path renders focus distance / aperture blur. Deep focus cannot be qualified honestly while every Three.js preview is effectively sharp, and Shallow focus is already declared approximate.",
      };
    }
  }

  if (
    familyCategory === "camera_angle" &&
    familyGroup === "Special viewpoints" &&
    capabilityId === "object_attached"
  ) {
    return {
      suitable_primary_cast_slots: ["vehicle"],
      comparison_group: "mounted_camera",
      requires_directional_facing: true,
      merge_compare_with_capability_id: null,
      qualification_note:
        "Object-attached qualification requires a directionally suitable solid-bodied vehicle with a visible hood/bodywork mount reference. Open-frame bicycles and non-vehicle hosts are not valid evidence for the canonical mounted-camera primitive.",
    };
  }

  if (
    familyCategory === "camera_movement" &&
    familyGroup === "Linear camera travel"
  ) {
    if (capabilityId === "push_in") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Push-in qualification keeps the optical target fixed while the camera advances toward it. Camera-to-target distance must close and the centered stationary subject should grow in frame; this is intentionally different from Dolly's whole-rig translation.",
      };
    }
    if (capabilityId === "dolly") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Dolly remains the generic parameterized whole-rig translation primitive. Qualification uses a bounded diagonal camera-relative rail so camera position and aim point translate together, camera-to-target distance stays effectively constant, and the stationary subject drifts/parallaxes in frame instead of reading as a second centered Push in.",
      };
    }
  }

  if (
    familyCategory === "camera_movement" &&
    familyGroup === "Rotational reframing"
  ) {
    if (capabilityId === "pan") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Pan qualification proves bounded horizontal rotation from a fixed camera position around one focus subject. It should move the subject laterally through frame without treating a second actor as the semantic destination; compare against Reframe's explicit A-to-B attention handoff.",
      };
    }
    if (capabilityId === "tilt") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Tilt qualification proves bounded vertical rotation from a fixed camera position while keeping the teaching subject meaningfully readable through the end. Empty-sky framing or losing most of the subject is a failure even when the numeric tilt is mechanically correct.",
      };
    }
    if (capabilityId === "reframe") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Reframe qualification is a two-actor compositional handoff: begin with the primary near optical centre, transfer attention, and finish with the secondary near optical centre while both remain readable. This is intentionally distinct from Pan's generic directional yaw.",
      };
    }
  }

  if (
    familyCategory === "camera_movement" &&
    familyGroup === "Orbit, arc & reveal paths"
  ) {
    if (capabilityId === "reverse_reveal") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Reverse-reveal qualification is an occlusion transition, not merely an arc plus reframe. The apparent result starts in front of a concealed source; camera parallax must separate the pair until the source is independently readable.",
      };
    }
    if (capabilityId === "rise_reveal") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Rise-and-reveal qualification requires a solid foreground occluder to substantially cover the teaching subject at the opening. The camera must rise over that occluder until the subject becomes independently readable, keeping the move perceptually distinct from Crane and Pedestal.",
      };
    }
    if (capabilityId === "orbit" || capabilityId === "arc_left" || capabilityId === "arc_right") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Orbit/Arc siblings retain the accepted three-actor spatial-reference stage. Judge direction, angular extent, and parallax without changing their already accepted camera semantics.",
      };
    }
  }

  if (
    familyCategory === "camera_movement" &&
    familyGroup === "Tracking & attached camera"
  ) {
    if (
      inSet(capabilityId, [
        "follow",
        "lead_subject",
        "lag_follow",
        "track_parallel",
      ])
    ) {
      return {
        suitable_primary_cast_slots: ["character", "vehicle"],
        comparison_group: "tracking_relationship",
        requires_directional_facing: true,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Compare Follow / Lead / Lag / Track Parallel on the same character, then the same vehicle. Asset facing is aligned to the authored travel heading before the camera relationship is judged.",
      };
    }
    if (capabilityId === "object_attached") {
      return {
        suitable_primary_cast_slots: ["vehicle"],
        comparison_group: "mounted_camera",
        requires_directional_facing: true,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Immediate mounted-camera comparison reference for legacy movement `camera_object_attached`. Use the same host, safe travel corridor, and canonical mounted primitive so the only intended difference is immediate mounted start versus blend-in timing.",
      };
    }
    if (capabilityId === "camera_object_attached") {
      return {
        suitable_primary_cast_slots: ["vehicle"],
        comparison_group: "mounted_camera",
        requires_directional_facing: true,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Merged legacy alias: same-host vehicle evidence closed `camera_object_attached` into canonical `object_attached`. The old id remains readable for backwards compatibility and maps to the canonical mounted primitive with blend-in entry timing, but it is no longer an independent active Qualification or authoring choice.",
      };
    }
  }

  if (
    familyCategory === "camera_movement" &&
    familyGroup === "Complex camera paths"
  ) {
    if (capabilityId === "spline") {
      return {
        suitable_primary_cast_slots: ["character", "vehicle", "furniture", "irregular_hero"],
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Spline qualification must exercise the real Catmull-Rom waypoint branch rather than the no-waypoint sinusoidal fallback. The demo authors a continuous target-relative multi-waypoint rail with distinct lateral, vertical, and depth phases while the teaching subject remains the optical target.",
      };
    }
    if (capabilityId === "pass_through") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "Pass through is deferred until scene/asset directability can identify a traversable opening or representation boundary with entry plane, forward normal, safe aperture, and destination clearance. Driving through an arbitrary solid GLB is not valid pass-through evidence.",
      };
    }
  }

  if (
    familyCategory === "object_motion" &&
    familyGroup === "Basic actor motion"
  ) {
    if (capabilityId === "pivot") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "rotate",
        qualification_note:
          "A.11A.55 closes Pivot out of independent Qualification. A visible pivot requires an authored contact/hinge anchor; without that semantic anchor arbitrary GLBs only read as another Rotate. Preserve Pivot as an anchored compound transform over Rotate rather than fabricating a qualification hinge.",
      };
    }
    if (capabilityId === "oscillate") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.55 treats Oscillate as a composable temporal motion modifier: repeat/reverse an already-declared motion around a rest pose. The vocabulary remains available, but it no longer consumes an independent primitive reel slot.",
      };
    }
    if (capabilityId === "align") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "rotate",
        qualification_note:
          "A.11A.55 closes Align out of independent Qualification. Alignment is a target-relative compound that requires an authored axis/reference; arbitrary assets otherwise reduce visually to Rotate with no perceptible alignment fact.",
      };
    }
    if (capabilityId === "aim_at") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: true,
        merge_compare_with_capability_id: "rotate",
        qualification_note:
          "A.11A.55 closes Aim at out of independent Qualification until the actor has a trustworthy semantic visual-forward axis. A mathematical root yaw is not perceptual proof that an arbitrary box, chair, or symmetric prop is aiming at anything.",
      };
    }
    if (capabilityId === "move_toward" || capabilityId === "move_away") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.55 relational staging keeps both actors readable at comparable presentation scale so the changing inter-actor distance—not perspective growth or shrinkage—proves the direction relationship.",
      };
    }
    if (capabilityId === "follow_target") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: "translate",
        qualification_note:
          "A.11A.56 closes Follow target out of independent Qualification. Cross-asset evidence remained visually equivalent to coordinated target-relative translation with a maintained follower offset; the useful Director verb is therefore a compound relational behavior rather than a new atomic motion primitive. Preserve the vocabulary/runtime recipe and compose it from reusable translation plus target-relative constraint semantics instead of adding leader badges, delays, or other proof-only cues.",
      };
    }
  }

  if (
    familyCategory === "object_motion" &&
    familyGroup === "Process & quantity motion"
  ) {
    if (capabilityId === "scatter") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Scatter out of independent Qualification. Scatter is an authored group-motion compound: preserve collection membership, then distribute per-member displacement away from a common region. Arbitrary extra actors, camera motion, or unrelated separation is not truthful scatter proof.",
      };
    }
    if (capabilityId === "expand" || capabilityId === "contract") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          capabilityId === "expand"
            ? "A.11A.59 closes Expand out of independent Qualification because Expand and Contract are opposite signs of one reusable geometric scale-animation modifier. Preserve the author verb as positive signed scale animation; this changes literal object extent and must not be confused with semantic representation-scale transitions."
            : "A.11A.59 closes Contract out of independent Qualification because Contract and Expand are opposite signs of one reusable geometric scale-animation modifier. Preserve the author verb as negative signed scale animation; this changes literal object extent and must not be confused with semantic representation-scale transitions.",
      };
    }
    if (capabilityId === "flow") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 preserves Flow as a high-value compound process motif rather than an atomic motion primitive. The successful cross-asset reel shows carrier instances travelling along a declared route with temporal staggering; truthful authoring still requires carrier/process semantics plus a route or destination.",
      };
    }
    if (capabilityId === "emit") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 preserves Emit as a high-value compound process motif rather than an atomic motion primitive. The successful reel shows repeated carriers leaving a source, but truthful authoring requires an emitter/source, an emission origin, and carrier/material/signal semantics instead of inventing particles around an arbitrary asset.",
      };
    }
    if (capabilityId === "fill") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Fill out of independent Qualification. Fill requires an authored fillable region or volume, quantity/capacity state, and a representation for the contents; guide marks or root-scale changes cannot manufacture empty-to-full semantic state on an arbitrary GLB.",
      };
    }
    if (capabilityId === "drain") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Drain out of independent Qualification. Drain requires an existing authored fill quantity in a fillable region and then reduces that persisted quantity state; ordinary motion or a guide overlay is not evidence that a container has drained.",
      };
    }
    if (capabilityId === "accumulate") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Accumulate out of independent Qualification. Accumulation needs an authored destination region/surface plus quantity or carrier identity and must visibly retain increasing quantity there; a destination ring alone is proof instrumentation, not accumulation semantics.",
      };
    }
    if (capabilityId === "split") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Split out of independent Qualification. Split is an authored identity/quantity transition: a declared source must map to declared result identities or partition semantics before reusable separation motion can visualize the change. Unrelated actors moving apart are not split proof.",
      };
    }
    if (capabilityId === "merge") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.59 closes Merge out of independent Qualification. Merge is an authored identity/quantity transition: declared inputs must map to a declared result identity or shared result state before reusable convergence motion can visualize the change. Unrelated actors approaching one another are not merge proof.",
      };
    }
  }

  if (
    familyCategory === "object_motion" &&
    familyGroup === "Object relationships"
  ) {
    if (capabilityId === "attach") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Attach out of independent Qualification. A truthful attachment requires an authored attachment site or relationship, then composes an approach motion with establishment of a persistent fixed-relative-transform state. Arbitrary overlap, disappearance, or proximity is not valid attachment proof.",
      };
    }
    if (capabilityId === "detach") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Detach out of independent Qualification. Detach requires a pre-existing authored attachment relationship, then releases that relation before optional independent movement. Translation away from an arbitrary nearby actor is not valid detachment proof.",
      };
    }
    if (capabilityId === "insert_into") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Insert into target out of independent Qualification. Insertion requires an authored receptacle, socket, or containment region plus compatible fit/clearance semantics; compose motion toward that authored region with a containment-state transition. Arbitrary GLB overlap or passing behind a target cannot manufacture an interior.",
      };
    }
    if (capabilityId === "remove_from") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Remove out of independent Qualification. Removal requires an existing authored containment/insertion relation, then releases that state before moving the actor away. Ordinary translation from an arbitrary target does not prove removal.",
      };
    }
    if (capabilityId === "assemble") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Assemble out of independent Qualification. Assembly requires authored part-whole membership plus target placements, sockets, or attachment relations, then composes already-qualified motion/orientation with semantic relationship-state changes. Unrelated actors converging along guide paths are not assembly proof.",
      };
    }
    if (capabilityId === "disassemble") {
      return {
        suitable_primary_cast_slots: fallbackSlots,
        comparison_group: null,
        requires_directional_facing: false,
        merge_compare_with_capability_id: null,
        qualification_note:
          "A.11A.58 closes Disassemble out of independent Qualification. Disassembly requires an existing authored assembled part-whole state and preserved component identity, then releases those relations and separates the components. Unrelated actors separating or replacing one another is not disassembly proof.",
      };
    }
  }

  if (
    familyCategory === "blocking_placement" &&
    familyGroup === "Support & containment" &&
    inSet(capabilityId, ["on_surface", "inside"])
  ) {
    return {
      // Support and containment are geometric relations. Do not ban source
      // semantics here: any qualification cast class may participate when the
      // measured source/receiver geometry actually fits.
      suitable_primary_cast_slots: [
        "character",
        "vehicle",
        "furniture",
        "irregular_hero",
        "compact_rigid",
        "simple_rigid",
        "small_asymmetric",
        "organic_elongated",
        "small_detail",
      ],
      comparison_group: null,
      requires_directional_facing: false,
      merge_compare_with_capability_id: null,
      qualification_note:
        capabilityId === "on_surface"
          ? "Physical support generalization proof: source semantics are unrestricted; each admitted pair must fit a measured exposed upward support region, reject floor-like/accidental ledges in qualification, and keep source identities distinct across the Cross-asset evidence pass."
          : "Physical containment proof: source semantics are unrestricted; the receiver must expose ray-confirmed open containment that fits the source at a plausible physical size. Bounding-box occupancy is never accepted as Inside, and later passes must use a distinct real source/receiver pair.",
    };
  }

  if (
    familyCategory === "blocking_placement" &&
    familyGroup === "Relative actor placement" &&
    capabilityId === "attached_to"
  ) {
    return {
      suitable_primary_cast_slots: [
        "small_detail",
        "simple_rigid",
        "compact_rigid",
        "small_asymmetric",
        "irregular_hero",
      ],
      comparison_group: null,
      requires_directional_facing: false,
      merge_compare_with_capability_id: null,
      qualification_note:
        "Physical surface-attachment proof: the receiver must expose a measured exterior contact region with a usable normal. Attached To remains a measured physical relation, but it is reviewed with relative placement rather than consuming Support & containment evidence slots.",
    };
  }

  if (
    familyCategory === "blocking_placement" &&
    familyGroup === "Relative actor placement" &&
    inSet(capabilityId, ["facing", "facing_away"])
  ) {
    return {
      suitable_primary_cast_slots: [
        "character",
        "small_asymmetric",
        "organic_elongated",
        "vehicle",
      ],
      comparison_group: null,
      requires_directional_facing: true,
      merge_compare_with_capability_id: null,
      qualification_note:
        "Orientation proof requires a primary with a readable forward axis. Use directional character / asymmetric / organic / vehicle silhouettes and judge the target-facing vector rather than an ambiguous symmetric prop.",
    };
  }

  return {
    suitable_primary_cast_slots: fallbackSlots,
    comparison_group: null,
    requires_directional_facing: false,
    merge_compare_with_capability_id: null,
    qualification_note: null,
  };
}

export function directorQualificationCapabilityProfile(
  family: DirectorQualificationFamily,
  capabilityId: string,
): DirectorQualificationCapabilityProfile {
  return (
    family.capability_profiles[capabilityId] ??
    capabilityProfile(
      family.category,
      family.group,
      capabilityId,
      family.primary_cast_slots,
    )
  );
}

export function buildDirectorQualificationFamilies(
  capabilities: DirectorCapability[],
): DirectorQualificationFamily[] {
  const grouped = new Map<
    string,
    {
      category: DirectorCapabilityCategory;
      group: string;
      ids: string[];
    }
  >();

  for (const capability of capabilities) {
    const derivedGroup = auditionGroup(capability);
    const key = `${capability.category}:${derivedGroup}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(capability.id);
    } else {
      grouped.set(key, {
        category: capability.category,
        group: derivedGroup,
        ids: [capability.id],
      });
    }
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => {
      const primaryCastSlots = castSlotsForFamily(value.category, value.group);
      return {
        key,
        label: `${DIRECTOR_CATEGORY_LABELS[value.category]} · ${value.group}`,
        category: value.category,
        group: value.group,
        capability_ids: value.ids,
        recommended_scene_id: recommendedScene(
          value.category,
          value.group,
          value.ids,
        ),
        primary_cast_slots: primaryCastSlots,
        normalization_policy: defaultQualificationNormalizationPolicy({
          category: value.category,
          group: value.group,
        }),
        capability_profiles: Object.fromEntries(
          value.ids.map((capabilityId) => [
            capabilityId,
            capabilityProfile(
              value.category,
              value.group,
              capabilityId,
              primaryCastSlots,
            ),
          ]),
        ),
      } satisfies DirectorQualificationFamily;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export const DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS = [
  "inside_object",
  "macro",
  "cutaway",
  "point_of_view",
  "lens_macro",
  "focus_shallow",
  "focus_deep",
  "extreme_close",
  "pass_through",
  // A.11A.39: cross-asset review found these two lighting styles too
  // renderer/asset-sensitive to freeze honestly. Keep the vocabulary/runtime
  // compatibility surface, but remove them from active Qualification coverage.
  "rim_lit",
  "warm_cool_contrast",
  // A.11A.40: final cross-asset review found Backlit still too
  // renderer/material-sensitive to freeze honestly across arbitrary GLBs.
  // Retain vocabulary/runtime compatibility, but defer active qualification.
  "backlit",
  // A.11A.41: Subject emphasis review found the current Emissive Subject
  // point-light approximation is not true surface/material emission and does
  // not generalize across arbitrary GLBs. Keep the Director vocabulary/runtime
  // compatibility surface, but defer active Qualification until emission is honest.
  "emissive_subject",
] as const;

/**
 * Successfully merged legacy aliases are not deferrals: their cinematic
 * behavior has been resolved into a canonical primitive, while the old id
 * remains in the frozen compatibility vocabulary.
 */
/**
 * A.11A.50 Pacing closeout: these remain valid Director narrative vocabulary,
 * but human review showed they are not independent visual primitives.
 *
 * Hold for understanding is a composable temporal modifier that preserves the
 * already-resolved composition. Summarize is a higher-order narrative verb that
 * composes existing visual operations and finishes with the understanding hold.
 * Both remain in the frozen 184-capability registry, but neither consumes an
 * independent Qualification reel slot.
 */
export const DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS = [
  "hold_for_understanding",
] as const;

export const DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS = [
  "summarize",
] as const;

export const DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_COMPONENTS_BY_ID = {
  summarize: ["return_to_context", "hold_for_understanding"],
} as const;

/**
 * A.11A.51 Reveal-grammar closeout: Conceal is a visibility/staging modifier,
 * not an independent camera primitive. Reverse assumption is a semantic
 * narrative composition whose contradiction must come from authored content.
 * Keep both ids in the frozen compatibility taxonomy, but remove them from
 * independent active Qualification coverage.
 */
export const DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS = [
  "conceal",
] as const;

export const DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS = [
  "reverse_assumption",
] as const;

export const DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_COMPONENTS_BY_ID = {
  reverse_assumption: ["isolate", "reveal", "hold_for_understanding"],
} as const;

/**
 * A.11A.54 Scale-and-representation semantic closeout: all three author-facing
 * verbs depend on authored representation semantics rather than claiming a new
 * asset-independent camera primitive. Enter system needs a real interior,
 * Change scale needs a source/target scale representation pair plus an anchor
 * mapping, and Inside / outside needs a true exterior/interior or cutaway pair.
 *
 * Keep all three in the frozen 184-capability compatibility vocabulary while
 * removing this family from independent Qualification coverage. Camera travel,
 * reframing, and settling continue to come from already-qualified primitives.
 */
export const DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS = [
  "enter_system",
  "change_scale",
  "show_inside_outside",
] as const;

export const DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_COMPONENTS_BY_ID = {
  enter_system: ["change_scale", "hold_for_understanding"],
  // The representation handoff itself is authored semantic data; the shot
  // compiler chooses already-qualified camera primitives around that handoff.
  change_scale: ["hold_for_understanding"],
  show_inside_outside: ["compare", "hold_for_understanding"],
} as const;


/**
 * A.11A.55 Basic-actor-motion semantic closeout found four labels that remain
 * useful Director vocabulary but do not earn separate asset-independent
 * primitive evidence:
 *
 * - Pivot requires an authored contact/hinge anchor and otherwise collapses to Rotate.
 * - Oscillate is a temporal repeat/reversal modifier over an underlying motion.
 * - Align requires an authored comparison axis/reference and otherwise reads as Rotate.
 * - Aim at requires a trustworthy semantic visual-forward axis on the actor.
 *
 * A.11A.56 completes the family closeout after the repaired cross-asset reel:
 * Follow target still cold-reads as coordinated translation with a maintained
 * relative offset, so it remains a useful compound relational verb rather than
 * an eighth atomic motion primitive.
 *
 * Keep all ids in the frozen 184-capability compatibility vocabulary. Only their
 * independent Qualification coverage changes.
 */
export const DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS = [
  "oscillate",
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS = [
  "pivot",
  "align",
  "aim_at",
  "follow_target",
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_COMPONENTS_BY_ID = {
  pivot: ["rotate"],
  align: ["rotate"],
  aim_at: ["rotate"],
  follow_target: ["translate"],
} as const;

/**
 * A.11A.57 Kinematic-constraints structural closeout: the five author-facing
 * constraint verbs remain useful Director/runtime vocabulary, but the
 * Baseline/Diversity reel did not expose a new asset-independent visual
 * primitive for any of them.
 *
 * Axis lock and Maintain distance constrain an underlying motion rather than
 * generating a distinct motion of their own. Persistent attachment and Rigid
 * link both cold-read as a fixed relative relationship even though their
 * runtime semantics remain distinct. Look-at constraint requires authored
 * semantic forward/orientation truth and composes existing orientation logic.
 *
 * Preserve the frozen 184-capability vocabulary and the historical five-member
 * family, but remove the empty Kinematic constraints family from independent
 * active Qualification rather than inventing proof-only axes, arrows, badges,
 * or other UI semantics.
 */
export const DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS = [
  "axis_lock",
  "maintain_distance",
] as const;

export const DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS = [
  "attach_constraint",
  "rigid_link",
] as const;

export const DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS = [
  "look_at_constraint",
] as const;

export const DIRECTOR_QUALIFICATION_KINEMATIC_COMPONENTS_BY_ID = {
  axis_lock: ["translate"],
  maintain_distance: ["translate"],
  look_at_constraint: ["aim_at"],
} as const;

export const DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_CANONICAL_MECHANISM_BY_ID = {
  attach_constraint: "fixed_relative_transform",
  rigid_link: "fixed_relative_transform",
} as const;

export function isDirectorQualificationCapabilityKinematicModifier(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_KINEMATIC_MODIFIER_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityKinematicRelationState(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_KINEMATIC_RELATION_STATE_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityKinematicOrientationCompound(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_KINEMATIC_ORIENTATION_COMPOUND_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

/**
 * A.11A.58 Object-relationships structural closeout: all six author-facing
 * relationship verbs remain useful Director/runtime vocabulary, but the
 * Baseline/Diversity reel did not expose a new asset-independent visual
 * primitive for any of them.
 *
 * Attach/Detach are relationship-state transitions. Insert/Remove require
 * authored receptacle/containment truth. Assemble/Disassemble require authored
 * part-whole membership and valid assembled/disassembled states. Preserve the
 * frozen historical family and runtime vocabulary, but remove the empty family
 * from independent active Qualification rather than inventing proof-only
 * interiors, sockets, part membership, arrows, or guide semantics.
 */
export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_STATE_TRANSITION_CAPABILITY_IDS = [
  "attach",
  "detach",
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_CONTAINMENT_COMPOUND_CAPABILITY_IDS = [
  "insert_into",
  "remove_from",
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_PART_WHOLE_COMPOUND_CAPABILITY_IDS = [
  "assemble",
  "disassemble",
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS = [
  ...DIRECTOR_QUALIFICATION_OBJECT_RELATION_STATE_TRANSITION_CAPABILITY_IDS,
  ...DIRECTOR_QUALIFICATION_OBJECT_RELATION_CONTAINMENT_COMPOUND_CAPABILITY_IDS,
  ...DIRECTOR_QUALIFICATION_OBJECT_RELATION_PART_WHOLE_COMPOUND_CAPABILITY_IDS,
] as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPONENTS_BY_ID = {
  attach: ["move_toward"],
  detach: ["move_away"],
  insert_into: ["move_toward"],
  remove_from: ["move_away"],
  assemble: ["move_toward", "rotate"],
  disassemble: ["move_away"],
} as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_CANONICAL_MECHANISM_BY_ID = {
  attach: "establish_fixed_relative_transform",
  detach: "release_fixed_relative_transform",
  insert_into: "establish_authored_containment",
  remove_from: "release_authored_containment",
  assemble: "establish_authored_part_whole_state",
  disassemble: "release_authored_part_whole_state",
} as const;

export const DIRECTOR_QUALIFICATION_OBJECT_RELATION_AUTHORED_STATE_REQUIREMENTS_BY_ID = {
  attach: ["target_actor", "authored_attachment_site_or_relation"],
  detach: ["existing_authored_attachment_relation"],
  insert_into: [
    "authored_receptacle_socket_or_containment_region",
    "compatible_fit_or_clearance",
  ],
  remove_from: ["existing_authored_containment_or_insertion_relation"],
  assemble: [
    "authored_part_whole_membership",
    "authored_target_placements_sockets_or_attachment_relations",
  ],
  disassemble: [
    "existing_authored_assembled_part_whole_state",
    "preserved_component_identity",
  ],
} as const;

export function isDirectorQualificationCapabilityObjectRelationCompound(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_OBJECT_RELATION_COMPOUND_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

/**
 * A.11A.59 Process-and-quantity structural closeout: the ten author-facing
 * verbs remain useful Director/runtime vocabulary, but the cross-asset reel
 * did not expose a new atomic visual primitive.
 *
 * Expand/Contract are opposite signs of one literal geometric scale-animation
 * modifier. Flow/Emit are successful reusable compound motifs built from
 * carrier instances, route/outward motion, and timing. Scatter is an authored
 * collection-dispersion compound. Fill/Drain/Accumulate/Split/Merge require
 * truthful authored quantity, region, or identity state.
 *
 * Preserve the frozen historical family and all existing runtime/compiler
 * lanes, but remove the now-empty Process & quantity motion family from
 * independent active Qualification rather than manufacturing fake fill
 * volumes, group membership, identity transitions, or particle semantics.
 */
export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS = [
  "expand",
  "contract",
] as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS = [
  "flow",
  "emit",
] as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS = [
  "scatter",
] as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS = [
  "fill",
  "drain",
  "accumulate",
  "split",
  "merge",
] as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_NON_ATOMIC_CAPABILITY_IDS = [
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
] as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_ANIMATION_MECHANISM =
  "signed_geometric_scale_animation" as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_DIRECTION_BY_ID = {
  expand: 1,
  contract: -1,
} as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPONENTS_BY_ID = {
  scatter: ["move_away"],
  flow: ["follow_path"],
  emit: ["translate"],
  split: ["move_away"],
  merge: ["move_toward"],
} as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_CANONICAL_MECHANISM_BY_ID = {
  scatter: "authored_collection_dispersion",
  expand: "signed_geometric_scale_animation",
  contract: "signed_geometric_scale_animation",
  flow: "carrier_instances_follow_path_with_temporal_stagger",
  fill: "interpolate_authored_fill_quantity",
  drain: "interpolate_authored_fill_quantity",
  emit: "authored_emitter_spawn_and_motion",
  accumulate: "increase_authored_retained_quantity_at_region",
  split: "authored_identity_quantity_partition",
  merge: "authored_identity_quantity_coalescence",
} as const;

export const DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_REQUIREMENTS_BY_ID = {
  scatter: ["authored_collection_membership"],
  flow: [
    "authored_flow_carrier_or_process_semantics",
    "authored_route_or_destination",
  ],
  fill: [
    "authored_fillable_region_or_volume",
    "authored_quantity_state_or_capacity",
    "authored_contents_representation",
  ],
  drain: [
    "existing_authored_fill_quantity_state",
    "authored_fillable_region_or_volume",
  ],
  emit: [
    "authored_emitter_source",
    "authored_emission_origin",
    "authored_carrier_material_or_signal_semantics",
  ],
  accumulate: [
    "authored_accumulation_region_or_surface",
    "authored_quantity_or_carrier_identity",
  ],
  split: [
    "authored_source_identity",
    "authored_result_identities_or_partition_semantics",
  ],
  merge: [
    "authored_input_identities",
    "authored_result_identity_or_shared_result_state",
  ],
} as const;

export function isDirectorQualificationCapabilityProcessQuantityScaleModifier(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_SCALE_MODIFIER_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityProcessQuantityCompoundMotif(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_COMPOUND_MOTIF_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityProcessQuantityGroupCompound(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_GROUP_COMPOUND_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityProcessQuantityAuthoredStateCompound(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_AUTHORED_STATE_COMPOUND_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityProcessQuantityNonAtomic(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_PROCESS_QUANTITY_NON_ATOMIC_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityObjectMotionModifier(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_MODIFIER_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityObjectMotionCompound(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_OBJECT_MOTION_COMPOUND_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityCompoundRepresentation(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_COMPOUND_REPRESENTATION_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityVisibilityModifier(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_VISIBILITY_MODIFIER_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityRevealCompoundNarrative(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_REVEAL_COMPOUND_NARRATIVE_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityComposableModifier(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_COMPOSABLE_MODIFIER_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityCompoundNarrative(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_COMPOUND_NARRATIVE_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

/**
 * Capabilities that remain useful Director vocabulary but should not be
 * qualified as independent perceptual primitives because human review found
 * that their behavior belongs inside another reusable primitive/modifier.
 *
 * Unlike DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS these are not completed
 * compatibility aliases yet; they remain explicit merge candidates.
 */
export const DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS = [
  // A.11A.42: Dim environment and Spotlight subject converge on the same
  // selective-lighting architecture. Keep environment dimming as a composable
  // modifier / compatibility intent, but stop claiming a separate visual primitive.
  "dim_environment",
] as const;

export const DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_TARGET_BY_ID = {
  dim_environment: "spotlight_subject",
} as const;

export const DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS = [
  "camera_object_attached",
  // A.11A.44: cross-asset Attention-sequence evidence showed Orient and
  // Establish are the same establishing/spatial-orientation visual primitive.
  // Keep the frozen id as compatibility narrative vocabulary but remove it from
  // active independent Qualification and canonical capability authoring.
  "orient",
] as const;

/**
 * Qualification-family lineage for successful merges. This survives removal
 * from the active family so campaign normalization can distinguish an
 * intentional merge closeout from an evidence-invalidating membership change.
 */
export const DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_FAMILY_KEY_BY_ID = {
  camera_object_attached: "camera_movement:Tracking & attached camera",
  orient: "narrative_attention:Attention sequence",
} as const;

export function directorQualificationMergedCapabilityIdsForFamily(
  familyKey: string,
) {
  return Object.entries(
    DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_FAMILY_KEY_BY_ID,
  )
    .filter(([, mergedFamilyKey]) => mergedFamilyKey === familyKey)
    .map(([capabilityId]) => capabilityId);
}

export function isDirectorQualificationCapabilityDeferred(capabilityId: string) {
  return (DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS as readonly string[]).includes(
    capabilityId,
  );
}

export function isDirectorQualificationCapabilityMergeCandidate(
  capabilityId: string,
) {
  return (
    DIRECTOR_QUALIFICATION_MERGE_CANDIDATE_CAPABILITY_IDS as readonly string[]
  ).includes(capabilityId);
}

export function isDirectorQualificationCapabilityMerged(capabilityId: string) {
  return (DIRECTOR_QUALIFICATION_MERGED_CAPABILITY_IDS as readonly string[]).includes(
    capabilityId,
  );
}

export function isDirectorQualificationCapabilityActive(capabilityId: string) {
  return (
    !isDirectorQualificationCapabilityDeferred(capabilityId) &&
    !isDirectorQualificationCapabilityMergeCandidate(capabilityId) &&
    !isDirectorQualificationCapabilityMerged(capabilityId) &&
    !isDirectorQualificationCapabilityComposableModifier(capabilityId) &&
    !isDirectorQualificationCapabilityCompoundNarrative(capabilityId) &&
    !isDirectorQualificationCapabilityVisibilityModifier(capabilityId) &&
    !isDirectorQualificationCapabilityRevealCompoundNarrative(capabilityId) &&
    !isDirectorQualificationCapabilityCompoundRepresentation(capabilityId) &&
    !isDirectorQualificationCapabilityObjectMotionModifier(capabilityId) &&
    !isDirectorQualificationCapabilityObjectMotionCompound(capabilityId) &&
    !isDirectorQualificationCapabilityKinematicModifier(capabilityId) &&
    !isDirectorQualificationCapabilityKinematicRelationState(capabilityId) &&
    !isDirectorQualificationCapabilityKinematicOrientationCompound(capabilityId) &&
    !isDirectorQualificationCapabilityObjectRelationCompound(capabilityId) &&
    !isDirectorQualificationCapabilityProcessQuantityNonAtomic(capabilityId)
  );
}

export function directorQualificationExpectedActiveCapabilityCount(
  capabilities: DirectorCapability[],
) {
  return capabilities.filter((capability) =>
    isDirectorQualificationCapabilityActive(capability.id),
  ).length;
}

/**
 * Active Qualification Room view of the frozen Director family taxonomy.
 *
 * Deferred, merge-candidate, successfully merged legacy capabilities, composable
 * modifiers, compound-only narrative verbs, authored-representation-dependent
 * verbs, object-motion labels that require authored anchors/axes or relational
 * orchestration, kinematic constraint states/modifiers, and authored
 * object-relationship state transitions remain in the 184-entry Director registry and in
 * buildDirectorQualificationFamilies(...) so historical compatibility evidence stays
 * stable. The live campaign excludes capabilities that either cannot yet be proven
 * truthfully, are awaiting/undergoing semantic consolidation, have already been
 * consolidated, require authored representation/process semantics, or do not
 * claim an independent visual primitive.
 */
export function buildActiveDirectorQualificationFamilies(
  capabilities: DirectorCapability[],
): DirectorQualificationFamily[] {
  return buildDirectorQualificationFamilies(capabilities)
    .map((family) => {
      const capabilityIds = family.capability_ids.filter(
        (capabilityId) => isDirectorQualificationCapabilityActive(capabilityId),
      );
      if (capabilityIds.length === family.capability_ids.length) return family;

      const activeCapabilitySet = new Set(capabilityIds);
      return {
        ...family,
        capability_ids: capabilityIds,
        capability_profiles: Object.fromEntries(
          Object.entries(family.capability_profiles).filter(([capabilityId]) =>
            activeCapabilitySet.has(capabilityId),
          ),
        ),
      };
    })
    .filter((family) => family.capability_ids.length > 0);
}
