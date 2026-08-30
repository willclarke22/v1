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
        merge_compare_with_capability_id: "object_attached",
        qualification_note:
          "Mounted-camera evidence is vehicle-gated. This legacy movement ID now compiles through the same canonical mounted-camera primitive as camera-angle `object_attached`; compare blend-in versus immediate modes on the same host before deprecating or retaining the extra vocabulary entry.",
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
] as const;

export function isDirectorQualificationCapabilityDeferred(capabilityId: string) {
  return (DIRECTOR_QUALIFICATION_DEFERRED_CAPABILITY_IDS as readonly string[]).includes(
    capabilityId,
  );
}

/**
 * Active Qualification Room view of the frozen Director family taxonomy.
 *
 * Deferred capabilities remain in the 184-entry Director registry and in
 * buildDirectorQualificationFamilies(...) so historical coverage/regression
 * evidence stays stable. The live campaign removes only capabilities that
 * cannot currently be proven truthfully with the available qualification
 * assets/runtime metadata.
 */
export function buildActiveDirectorQualificationFamilies(
  capabilities: DirectorCapability[],
): DirectorQualificationFamily[] {
  return buildDirectorQualificationFamilies(capabilities)
    .map((family) => {
      const capabilityIds = family.capability_ids.filter(
        (capabilityId) => !isDirectorQualificationCapabilityDeferred(capabilityId),
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
