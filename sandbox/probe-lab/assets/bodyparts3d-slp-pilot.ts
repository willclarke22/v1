import type { MyWayAssetCollectionMembershipV1 } from "./asset-types";

export const BODYPARTS3D_SLP_COLLECTION_ID = "bodyparts3d_4_0_slp_pilot" as const;
export const BODYPARTS3D_SLP_COLLECTION_NAME = "BodyParts3D 4.0 · Speech-Language Pathology Pilot" as const;
export const BODYPARTS3D_FULL_COLLECTION_ID = "bodyparts3d_4_0_full_atlas" as const;
export const BODYPARTS3D_FULL_COLLECTION_NAME = "BodyParts3D 4.0 · Full Human Anatomy Atlas" as const;
export const BODYPARTS3D_SOURCE_ARCHIVE = "isa_BP3D_4.0_obj_99.zip" as const;
export const BODYPARTS3D_SOURCE_URL = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" as const;
export const BODYPARTS3D_LICENSE_URL = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" as const;
export const BODYPARTS3D_ISA_PARTS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt" as const;
export const BODYPARTS3D_ISA_ELEMENTS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_element_parts.txt" as const;
export const BODYPARTS3D_PARTOF_PARTS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt" as const;
export const BODYPARTS3D_PARTOF_ELEMENTS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_element_parts.txt" as const;
export const BODYPARTS3D_ISA_RELATIONS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_inclusion_relation_list.txt" as const;
export const BODYPARTS3D_PARTOF_RELATIONS_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_inclusion_relation_list.txt" as const;
export const BODYPARTS3D_ATTRIBUTION = "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" as const;
export const BODYPARTS3D_EXPECTED_ELEMENT_COUNT = 2234 as const;

export type BodyParts3dSemanticMaterialClass =
  | "bone"
  | "muscle"
  | "cartilage"
  | "ligament"
  | "respiratory"
  | "digestive";

export type BodyParts3dSystemId =
  | "skeletal"
  | "muscular"
  | "cardiac"
  | "sensory"
  | "arterial"
  | "venous"
  | "nervous"
  | "respiratory"
  | "digestive"
  | "urinary"
  | "lymphatic"
  | "endocrine"
  | "reproductive"
  | "integumentary"
  | "connective";

export type BodyParts3dSemanticMaterialV1 = {
  schema_version: "myway_bodyparts3d_semantic_material_v1";
  tissue_class: string;
  label: string;
  base_color: string;
  roughness: number;
  metalness: number;
  source: "myway_semantic_anatomy_palette_v1";
};

export const BODYPARTS3D_SEMANTIC_MATERIALS: Record<
  BodyParts3dSemanticMaterialClass,
  BodyParts3dSemanticMaterialV1
> = {
  bone: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "bone", label: "bone · ivory", base_color: "#E2D9BA", roughness: 0.62, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  muscle: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "muscle", label: "muscle · muted red", base_color: "#A85B50", roughness: 0.58, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  cartilage: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "cartilage", label: "cartilage · pale blue-green", base_color: "#AEC3BB", roughness: 0.55, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  ligament: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "ligament", label: "ligament · warm cream", base_color: "#D6C8A5", roughness: 0.68, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  respiratory: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "respiratory", label: "respiratory · muted rose", base_color: "#B98991", roughness: 0.6, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  digestive: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "digestive", label: "digestive · warm tan", base_color: "#B8916B", roughness: 0.62, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
};

export const BODYPARTS3D_SYSTEM_MATERIALS: Record<BodyParts3dSystemId, BodyParts3dSemanticMaterialV1> = {
  skeletal: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "skeletal", label: "skeletal · ivory", base_color: "#E2D9BA", roughness: 0.62, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  muscular: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "muscular", label: "muscular · muted red", base_color: "#A85B50", roughness: 0.58, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  cardiac: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "cardiac", label: "cardiac · warm red", base_color: "#B96760", roughness: 0.56, metalness: 0.01, source: "myway_semantic_anatomy_palette_v1" },
  sensory: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "sensory", label: "sensory · pale blue", base_color: "#B0C8CE", roughness: 0.52, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  arterial: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "arterial", label: "arterial · red", base_color: "#C05245", roughness: 0.5, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  venous: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "venous", label: "venous · blue", base_color: "#527C9F", roughness: 0.5, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  nervous: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "nervous", label: "nervous · gold", base_color: "#D8B565", roughness: 0.56, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  respiratory: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "respiratory", label: "respiratory · muted rose", base_color: "#B98991", roughness: 0.6, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  digestive: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "digestive", label: "digestive · warm tan", base_color: "#B8916B", roughness: 0.62, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  urinary: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "urinary", label: "urinary · russet", base_color: "#B47961", roughness: 0.6, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  lymphatic: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "lymphatic", label: "lymphatic · sage", base_color: "#879F7C", roughness: 0.58, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  endocrine: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "endocrine", label: "endocrine · dusty rose", base_color: "#C5A09A", roughness: 0.58, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  reproductive: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "reproductive", label: "reproductive · mauve", base_color: "#BDA098", roughness: 0.58, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  integumentary: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "integumentary", label: "body surface · tan", base_color: "#BA9B7D", roughness: 0.65, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
  connective: { schema_version: "myway_bodyparts3d_semantic_material_v1", tissue_class: "connective", label: "connective · pale blue-green", base_color: "#AEC3BB", roughness: 0.6, metalness: 0.0, source: "myway_semantic_anatomy_palette_v1" },
};

export type BodyParts3dSlpPilotMember = {
  representation_id: string;
  concept_id: string;
  element_file_ids: string[];
  name: string;
  groups: string[];
  tags: string[];
  material_class: BodyParts3dSemanticMaterialClass;
};

export const BODYPARTS3D_SLP_PILOT_MEMBERS: BodyParts3dSlpPilotMember[] = [
  { representation_id: "BP9090", concept_id: "FMA54640", element_file_ids: ["FJ2761"], name: "tongue", groups: ["speech_production", "swallowing"], tags: ["articulation", "oral_phase", "bolus_control"], material_class: "muscle" },
  { representation_id: "BP8107", concept_id: "FMA52748", element_file_ids: ["FJ3289"], name: "mandible", groups: ["speech_production", "oral_mechanism"], tags: ["jaw", "articulation", "mastication"], material_class: "bone" },
  { representation_id: "BP8836", concept_id: "FMA52749", element_file_ids: ["FJ2772", "FJ3201"], name: "hyoid bone", groups: ["swallowing", "voice"], tags: ["hyolaryngeal", "airway_protection", "phonation"], material_class: "bone" },
  { representation_id: "BP9263", concept_id: "FMA55130", element_file_ids: ["FJ2770"], name: "epiglottis", groups: ["swallowing", "airway"], tags: ["airway_protection", "larynx", "deglutition"], material_class: "cartilage" },
  { representation_id: "BP7901", concept_id: "FMA55099", element_file_ids: ["FJ2808"], name: "thyroid cartilage", groups: ["voice", "swallowing"], tags: ["larynx", "phonation", "airway"], material_class: "cartilage" },
  { representation_id: "BP9249", concept_id: "FMA55113", element_file_ids: ["FJ2792"], name: "right arytenoid cartilage", groups: ["voice", "airway"], tags: ["larynx", "phonation", "vocal_fold_position"], material_class: "cartilage" },
  { representation_id: "BP8314", concept_id: "FMA55114", element_file_ids: ["FJ2775"], name: "left arytenoid cartilage", groups: ["voice", "airway"], tags: ["larynx", "phonation", "vocal_fold_position"], material_class: "cartilage" },
  { representation_id: "BP9026", concept_id: "FMA55245", element_file_ids: ["FJ2805"], name: "right vocal ligament", groups: ["voice"], tags: ["vocal_fold", "phonation", "larynx"], material_class: "ligament" },
  { representation_id: "BP8188", concept_id: "FMA55246", element_file_ids: ["FJ2787"], name: "left vocal ligament", groups: ["voice"], tags: ["vocal_fold", "phonation", "larynx"], material_class: "ligament" },
  { representation_id: "BP7849", concept_id: "FMA7394", element_file_ids: ["FJ2541"], name: "trachea", groups: ["airway", "swallowing", "voice"], tags: ["airway", "respiration", "larynx_context"], material_class: "respiratory" },
  { representation_id: "BP9222", concept_id: "FMA7131", element_file_ids: ["FJ2563"], name: "esophagus", groups: ["swallowing"], tags: ["deglutition", "bolus_path", "airway_contrast"], material_class: "digestive" },
  { representation_id: "BP8636", concept_id: "FMA46621", element_file_ids: ["FJ2747", "FJ2759"], name: "superior pharyngeal constrictor", groups: ["swallowing", "speech_production"], tags: ["pharynx", "pharyngeal_phase", "resonance"], material_class: "muscle" },
];

export function bodyParts3dSemanticMaterialForMember(
  memberId: string | null | undefined,
): BodyParts3dSemanticMaterialV1 | null {
  const member = BODYPARTS3D_SLP_PILOT_MEMBERS.find(
    (candidate) => candidate.representation_id === memberId,
  );
  return member ? BODYPARTS3D_SEMANTIC_MATERIALS[member.material_class] : null;
}

export function bodyParts3dSemanticMaterialForSystem(
  systemId: string | null | undefined,
): BodyParts3dSemanticMaterialV1 | null {
  if (!systemId) return null;
  return BODYPARTS3D_SYSTEM_MATERIALS[systemId as BodyParts3dSystemId] ?? null;
}

export function bodyParts3dSystemFromGroupTags(groupTags: string[] | null | undefined) {
  const marker = (groupTags ?? []).find((value) => value.startsWith("system:"));
  return marker?.slice("system:".length) ?? null;
}

export function makeBodyParts3dCollectionMembership(
  member: BodyParts3dSlpPilotMember,
  runtimeTransform: MyWayAssetCollectionMembershipV1["runtime_transform"],
): MyWayAssetCollectionMembershipV1 {
  return {
    schema_version: "myway_asset_collection_membership_v1",
    collection_id: BODYPARTS3D_SLP_COLLECTION_ID,
    collection_name: BODYPARTS3D_SLP_COLLECTION_NAME,
    collection_version: "4.0",
    member_id: member.representation_id,
    concept_id: member.concept_id,
    concept_name: member.name,
    source_units: "millimeters",
    source_up_axis: "z",
    runtime_collection_space: "glb_y_up_meters",
    runtime_transform: runtimeTransform,
    group_tags: member.groups,
    source_archive: BODYPARTS3D_SOURCE_ARCHIVE,
    source_member_path: member.element_file_ids.map((id) => `${id}.obj`).join(" + "),
    source_element_ids: member.element_file_ids,
    provenance_notes: "Member-local GLB preserves an inverse collection transform so the source anatomy can be reconstructed in shared BodyParts3D space.",
  };
}

export function makeBodyParts3dFullElementMembership(input: {
  elementId: string;
  conceptId: string | null;
  conceptName: string;
  systemId: BodyParts3dSystemId;
  runtimeTransform: MyWayAssetCollectionMembershipV1["runtime_transform"];
}): MyWayAssetCollectionMembershipV1 {
  return {
    schema_version: "myway_asset_collection_membership_v1",
    collection_id: BODYPARTS3D_FULL_COLLECTION_ID,
    collection_name: BODYPARTS3D_FULL_COLLECTION_NAME,
    collection_version: "4.0",
    member_id: input.elementId,
    concept_id: input.conceptId,
    concept_name: input.conceptName,
    source_units: "millimeters",
    source_up_axis: "z",
    runtime_collection_space: "glb_y_up_meters",
    runtime_transform: input.runtimeTransform,
    group_tags: ["bodyparts3d_full_atlas", `system:${input.systemId}`],
    source_archive: BODYPARTS3D_SOURCE_ARCHIVE,
    source_member_path: `${input.elementId}.obj`,
    source_element_ids: [input.elementId],
    provenance_notes: "Element-local GLB preserves an inverse collection transform so the source mesh can be reconstructed in shared BodyParts3D space. Named compound concepts are stored separately in the BodyParts3D catalog index rather than duplicating geometry.",
  };
}
