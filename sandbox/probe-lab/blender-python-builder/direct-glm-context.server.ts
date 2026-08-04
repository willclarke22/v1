import type {
  AssetDesignBriefV2,
} from "./asset-design-brief";
import type {
  FoundryResourcePlanV1,
} from "./foundry-resource-plan";
import type {
  FoundryBlenderRuntimeInfo,
} from "./blender-runtime.server";
import {
  NATIVE_VINTAGE_CAMERA_PROOF_CODE,
} from "./native-vintage-camera-proof";

export const DIRECT_GLM_CONTEXT_SCHEMA_VERSION =
  "myway_direct_glm_context_v2" as const;

export type DirectGlmContextPackage = {
  schema_version:
    typeof DIRECT_GLM_CONTEXT_SCHEMA_VERSION;
  modelling_strategy:
    "native_bpy_primary";
  runtime: {
    blender_version: string;
    python_version: string;
    execution_mode: string;
  };
  asset_contract: {
    asset_id: string;
    concept: string;
    asset_class: string;
    intended_use: string[];
    target_extent_m: number;
    axis_dimensions_m:
      | [number, number, number]
      | null;
    max_triangles: number;
    quality_mode: string;
    realism: string;
    style_tags: string[];
    silhouette:
      AssetDesignBriefV2["silhouette"];
    proportions: string[];
    visual_description:
      AssetDesignBriefV2["visual_description"] | null;
    required_parts: Array<{
      part_id: string;
      semantic_role: string;
      geometry_strategy: string[];
      parent_part_id: string | null;
      connection_strategy: string | null;
      material_slot_id: string | null;
      animation_role: string | null;
      pivot_requirement: string | null;
      identifying_features: string[];
    }>;
    optional_parts: Array<{
      part_id: string;
      semantic_role: string;
      geometry_strategy: string[];
      parent_part_id: string | null;
      connection_strategy: string | null;
      material_slot_id: string | null;
      animation_role: string | null;
      pivot_requirement: string | null;
      identifying_features: string[];
    }>;
    requirements:
      AssetDesignBriefV2["requirements"];
    acceptance_criteria: string[];
    benchmark_priorities: string[];
  };
  resources: {
    material_slots: Array<{
      slot_id: string;
      display_name: string;
      assigned_part_ids: string[];
      material_family: string;
      intent: string;
      semantic_tags: string[];
      color_hint: string | null;
      roughness_hint: string | null;
      metallic_hint: string | null;
      texture_hint: string | null;
      brightness_hint: string | null;
      avoid_tags: string[];
      physical_scale_m: number | null;
      required_maps: string[];
      procedural_fallback:
        AssetDesignBriefV2["material_slots"][number]["procedural_fallback"];
      selected_resource: {
        status: string;
        display_name: string;
        source_asset_id: string | null;
        resolution: string | null;
        file_format: string | null;
        published_to_r2: boolean;
        appearance_summary: string | null;
        dominant_colors: string[];
        brightness: "dark" | "medium" | "light" | null;
        match_confidence: number;
      } | null;
    }>;
    environment: {
      intent:
        AssetDesignBriefV2["environment"];
      selected_resource: {
        status: string;
        display_name: string;
        source_asset_id: string | null;
        resolution: string | null;
        file_format: string | null;
        published_to_r2: boolean;
        appearance_summary: string | null;
        match_confidence: number;
      } | null;
    };
  };
  model_boundary: {
    required_myway_helpers: string[];
    native_blender_modules: string[];
    trusted_appended_stages: string[];
    excluded_context: string[];
  };
  reference_example: {
    id: "native_vintage_camera";
    purpose: string;
    line_count: number;
    code: string;
  };
};

function compactPart(
  part:
    AssetDesignBriefV2["parts"][number],
) {
  return {
    part_id:
      part.part_id,
    semantic_role:
      part.semantic_role,
    geometry_strategy:
      part.geometry_strategy,
    parent_part_id:
      part.parent_part_id,
    connection_strategy:
      part.connection_strategy,
    material_slot_id:
      part.material_slot_id,
    animation_role:
      part.animation_role,
    pivot_requirement:
      part.pivot_requirement,
    identifying_features:
      part.identifying_features,
  };
}

export function buildDirectGlmContextPackage(
  input: {
    brief:
      AssetDesignBriefV2;
    resourcePlan:
      FoundryResourcePlanV1 | null;
    runtime:
      FoundryBlenderRuntimeInfo;
  },
): DirectGlmContextPackage {
  const bindingBySlot =
    new Map(
      input.resourcePlan
        ?.material_bindings
        .map((binding) => [
          binding.slot.slot_id,
          binding,
        ] as const) ?? [],
    );
  const requiredParts =
    input.brief.parts
      .filter((part) =>
        part.required,
      )
      .map(compactPart);
  const optionalParts =
    input.brief.parts
      .filter((part) =>
        !part.required,
      )
      .map(compactPart);

  return {
    schema_version:
      DIRECT_GLM_CONTEXT_SCHEMA_VERSION,
    modelling_strategy:
      "native_bpy_primary",
    runtime: {
      blender_version:
        input.runtime
          .blender_version,
      python_version:
        input.runtime
          .python_version,
      execution_mode:
        input.runtime
          .execution_mode,
    },
    asset_contract: {
      asset_id:
        input.brief.asset_id,
      concept:
        input.brief.concept,
      asset_class:
        input.brief.asset_class,
      intended_use:
        input.brief.intended_use,
      target_extent_m:
        input.brief.target_extent_m,
      axis_dimensions_m:
        input.brief.axis_dimensions_m,
      max_triangles:
        input.brief.max_triangles,
      quality_mode:
        input.brief.quality_mode,
      realism:
        input.brief.realism,
      style_tags:
        input.brief.style_tags,
      silhouette:
        input.brief.silhouette,
      proportions:
        input.brief.proportions,
      visual_description:
        input.brief.visual_description ??
        null,
      required_parts:
        requiredParts,
      optional_parts:
        optionalParts,
      requirements:
        input.brief.requirements,
      acceptance_criteria:
        input.brief.acceptance_criteria,
      benchmark_priorities:
        input.brief.benchmark_priorities,
    },
    resources: {
      material_slots:
        input.brief.material_slots.map(
          (slot) => {
            const binding =
              bindingBySlot.get(
                slot.slot_id,
              );
            return {
              slot_id:
                slot.slot_id,
              display_name:
                slot.display_name,
              assigned_part_ids:
                slot.assigned_part_ids,
              material_family:
                slot.material_family,
              intent:
                slot.intent,
              semantic_tags:
                slot.semantic_tags,
              color_hint:
                slot.color_hint,
              roughness_hint:
                slot.roughness_hint,
              metallic_hint:
                slot.metallic_hint,
              texture_hint:
                slot.texture_hint ?? null,
              brightness_hint:
                slot.brightness_hint ?? null,
              avoid_tags:
                slot.avoid_tags ?? [],
              physical_scale_m:
                slot.physical_scale_m,
              required_maps:
                slot.required_maps,
              procedural_fallback:
                slot.procedural_fallback,
              selected_resource:
                binding
                  ? {
                      status:
                        binding.status,
                      display_name:
                        binding.selected
                          .display_name,
                      source_asset_id:
                        binding.selected
                          .source_asset_id,
                      resolution:
                        binding.selected
                          .resolution,
                      file_format:
                        binding.selected
                          .file_format,
                      published_to_r2:
                        binding.selected
                          .published_to_r2,
                      appearance_summary:
                        binding.selected
                          .appearance_summary,
                      dominant_colors:
                        binding.selected
                          .dominant_colors,
                      brightness:
                        binding.selected
                          .brightness,
                      match_confidence:
                        binding.selected
                          .match_confidence,
                    }
                  : null,
            };
          },
        ),
      environment: {
        intent:
          input.brief.environment,
        selected_resource:
          input.resourcePlan
            ? {
                status:
                  input.resourcePlan
                    .environment
                    .status,
                display_name:
                  input.resourcePlan
                    .environment
                    .selected
                    .display_name,
                source_asset_id:
                  input.resourcePlan
                    .environment
                    .selected
                    .source_asset_id,
                resolution:
                  input.resourcePlan
                    .environment
                    .selected
                    .resolution,
                file_format:
                  input.resourcePlan
                    .environment
                    .selected
                    .file_format,
                published_to_r2:
                  input.resourcePlan
                    .environment
                    .selected
                    .published_to_r2,
                appearance_summary:
                  input.resourcePlan
                    .environment
                    .selected
                    .appearance_summary,
                match_confidence:
                  input.resourcePlan
                    .environment
                    .selected
                    .match_confidence,
              }
            : null,
      },
    },
    model_boundary: {
      required_myway_helpers: [
        "myway_reset_scene()",
        "myway_print_progress(message)",
        "myway_material_slot(slot_id, fallback_color=(...), metallic=0.0, roughness=0.55, part_id=None)",
        "myway_assign_material_slot(obj, slot_id, fallback_color=(...), metallic=0.0, roughness=0.55, part_id=None)",
        "myway_normalize_extent(target_extent, root_or_iterable)",
      ],
      native_blender_modules: [
        "bpy",
        "bmesh",
        "math",
        "mathutils",
      ],
      trusted_appended_stages: [
        "resource hydration",
        "UV fallback",
        "grounding",
        "studio or HDRI environment",
        "inspection renders",
        ".blend save",
        "GLB export",
      ],
      excluded_context: [
        "procedural asset specification",
        "deterministic geometry IR",
        "wheelchair reference",
        "rejected material candidates",
        "R2 credentials and object keys",
      ],
    },
    reference_example: {
      id:
        "native_vintage_camera",
      purpose:
        "Use only as a proven native-bpy construction and code-reliability example. Reuse its discipline, not its camera-specific dimensions, names, or geometry.",
      line_count:
        NATIVE_VINTAGE_CAMERA_PROOF_CODE
          .split(/\r?\n/)
          .length,
      code:
        NATIVE_VINTAGE_CAMERA_PROOF_CODE,
    },
  };
}

export function publicDirectGlmContextSummary(
  context:
    DirectGlmContextPackage,
) {
  return {
    schema_version:
      context.schema_version,
    modelling_strategy:
      context.modelling_strategy,
    runtime:
      context.runtime,
    asset_id:
      context.asset_contract
        .asset_id,
    asset_class:
      context.asset_contract
        .asset_class,
    required_part_count:
      context.asset_contract
        .required_parts.length,
    optional_part_count:
      context.asset_contract
        .optional_parts.length,
    visual_blueprint: {
      present:
        context.asset_contract
          .visual_description !==
        null,
      proportion_count:
        context.asset_contract
          .visual_description
          ?.normalized_proportions
          .length ?? 0,
      dimensioned_part_count:
        context.asset_contract
          .visual_description
          ?.part_layout
          .filter((part) =>
            Boolean(
              part.dimensions_m &&
              part.position_m,
            ),
          ).length ?? 0,
      visual_test_count:
        context.asset_contract
          .visual_description
          ?.visual_acceptance_tests
          .length ?? 0,
    },
    material_slot_count:
      context.resources
        .material_slots.length,
    selected_material_count:
      context.resources
        .material_slots.filter(
          (slot) =>
            slot.selected_resource !==
            null,
        ).length,
    environment_selected:
      context.resources
        .environment
        .selected_resource !==
      null,
    reference_example: {
      id:
        context.reference_example.id,
      line_count:
        context.reference_example
          .line_count,
      purpose:
        context.reference_example
          .purpose,
    },
    excluded_context:
      context.model_boundary
        .excluded_context,
  };
}
