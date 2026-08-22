import type { DirectorQualificationCastSlotId } from "./director-qualification-cast";

export const DIRECTOR_QUALIFICATION_SCENE_IDS = [
  "scene_a_character_target",
  "scene_b_spatial_relationship",
  "scene_c_hero_object",
  "scene_d_travelling_subject",
] as const;

export type DirectorQualificationSceneId =
  (typeof DIRECTOR_QUALIFICATION_SCENE_IDS)[number];

export type DirectorQualificationScene = {
  id: DirectorQualificationSceneId;
  version: string;
  short_label: string;
  title: string;
  purpose: string;
  primary_cast_slots: DirectorQualificationCastSlotId[];
  secondary_cast_slot: DirectorQualificationCastSlotId;
  context_cast_slot: DirectorQualificationCastSlotId;
  blocking: {
    primary: [number, number, number];
    secondary: [number, number, number];
    context: [number, number, number];
  };
  normalization: {
    presentation_role_multipliers: {
      primary: number;
      secondary: number;
      context: number;
    };
    physical_min_extent_m: number;
    physical_max_extent_m: number;
    minimum_clearance_m: number;
  };
};

export const DIRECTOR_QUALIFICATION_SCENES: DirectorQualificationScene[] = [
  {
    id: "scene_a_character_target",
    version: "scene_a_v1",
    short_label: "Scene A",
    title: "Character + target",
    purpose:
      "Actor-relative direction: approach, entry/exit, follow/lead/lag, viewpoint, and relationship framing.",
    primary_cast_slots: ["character", "organic_elongated", "compact_rigid", "furniture"],
    secondary_cast_slot: "compact_rigid",
    context_cast_slot: "furniture",
    blocking: {
      primary: [-2.1, 0, 0.35],
      secondary: [1.65, 0, -0.3],
      context: [0, 0, -2.65],
    },
    normalization: {
      presentation_role_multipliers: { primary: 1, secondary: 0.85, context: 0.82 },
      physical_min_extent_m: 0.12,
      physical_max_extent_m: 3.6,
      minimum_clearance_m: 0.5,
    },
  },
  {
    id: "scene_b_spatial_relationship",
    version: "scene_b_v1",
    short_label: "Scene B",
    title: "Spatial relationship stage",
    purpose:
      "Three-object spatial comprehension: orbit, reveal, occlusion, pan, blocking, handoff, and context preservation.",
    primary_cast_slots: ["compact_rigid", "furniture", "simple_rigid", "irregular_hero", "character"],
    secondary_cast_slot: "furniture",
    context_cast_slot: "small_asymmetric",
    blocking: {
      primary: [-1.65, 0, 0.55],
      secondary: [1.7, 0, -0.35],
      context: [0.2, 0, -2.55],
    },
    normalization: {
      presentation_role_multipliers: { primary: 1, secondary: 0.95, context: 0.82 },
      physical_min_extent_m: 0.12,
      physical_max_extent_m: 3.4,
      minimum_clearance_m: 0.55,
    },
  },
  {
    id: "scene_c_hero_object",
    version: "scene_c_v1",
    short_label: "Scene C",
    title: "Hero object stage",
    purpose:
      "Presentation and emphasis: macro/insert, push/pull, angle, isolation, lighting, highlight, and readable holds.",
    primary_cast_slots: ["irregular_hero", "small_detail", "small_asymmetric", "furniture", "compact_rigid"],
    secondary_cast_slot: "small_detail",
    context_cast_slot: "small_asymmetric",
    blocking: {
      primary: [0, 0, 0.2],
      secondary: [2.25, 0, -1.4],
      context: [-2.25, 0, -1.75],
    },
    normalization: {
      presentation_role_multipliers: { primary: 1.12, secondary: 0.72, context: 0.72 },
      physical_min_extent_m: 0.08,
      physical_max_extent_m: 2.6,
      minimum_clearance_m: 0.48,
    },
  },
  {
    id: "scene_d_travelling_subject",
    version: "scene_d_v1",
    short_label: "Scene D",
    title: "Travelling subject",
    purpose:
      "Relative camera/subject motion: follow, lead/lag, parallel tracking, mounted views, and moving-subject composition.",
    primary_cast_slots: ["character", "vehicle", "organic_elongated", "furniture", "compact_rigid"],
    secondary_cast_slot: "compact_rigid",
    context_cast_slot: "simple_rigid",
    blocking: {
      primary: [-2.4, 0, 0],
      secondary: [2.6, 0, -1.85],
      context: [-2.6, 0, -1.85],
    },
    normalization: {
      presentation_role_multipliers: { primary: 1.02, secondary: 0.8, context: 0.8 },
      physical_min_extent_m: 0.12,
      physical_max_extent_m: 5.5,
      minimum_clearance_m: 0.65,
    },
  },
];

export function directorQualificationScene(id: DirectorQualificationSceneId) {
  return (
    DIRECTOR_QUALIFICATION_SCENES.find((scene) => scene.id === id) ??
    DIRECTOR_QUALIFICATION_SCENES[0]
  );
}
