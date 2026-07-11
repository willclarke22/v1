export type PrimitiveBuilderAssetRequirement = {
  instance_id: string;
  concept: string;
  aliases: string[];
  semantic_tags: string[];
  style_tags: string[];
  motion_role: string;
  must_be_separate: boolean;
  reusable: boolean;
};

export type PrimitiveBuilderAssetRequirementPlan = {
  schema_version: "primitive_builder_asset_requirements_v1";
  scene_request: string;
  requirements: PrimitiveBuilderAssetRequirement[];
};
