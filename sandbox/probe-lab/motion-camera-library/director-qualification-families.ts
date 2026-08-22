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
    if (inSet(id, ["on_ground", "on_surface", "attached_to", "inside"])) {
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
    if (capabilityId === "camera_object_attached") {
      return {
        suitable_primary_cast_slots: ["vehicle"],
        comparison_group: "mounted_camera",
        requires_directional_facing: true,
        merge_compare_with_capability_id: "object_attached",
        qualification_note:
          "Mounted-camera evidence is vehicle-gated. This legacy movement ID now compiles through the same canonical mounted-camera primitive as camera-angle `object_attached`; compare blend-in versus immediate modes before deprecating or retaining the extra vocabulary entry.",
      };
    }
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
