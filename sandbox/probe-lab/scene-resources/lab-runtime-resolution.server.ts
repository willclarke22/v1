import {
  buildRuntimeModelBinding,
  fallbackForIntent,
} from "../resource-runtime/build-runtime-binding";
import {
  buildRuntimeSceneBinding,
} from "../resource-runtime/build-scene-runtime-binding";
import {
  adaptPrimitiveSceneNodesToRuntime,
} from "../resource-runtime/primitive-runtime-adapter";
import type {
  RuntimeSceneActorTransform,
  RuntimeSceneBindingV1,
  RuntimeSceneSource,
} from "../resource-runtime/scene-runtime-contract";
import {
  normalizeSceneResourcePlan,
} from "./normalize-scene-resource-plan";
import {
  resolveReviewedSceneResources,
} from "./resolve-reviewed-scene-resources.server";
import {
  DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
  type SceneEntityResourceIntent,
  type SceneResourcePlanSource,
  type SceneResourcePlanV1,
  type SceneSurfaceResourceIntent,
} from "./scene-resource-contract";

export type LabRuntimeMaterialOverride = {
  target_entity_id: string;
  preferred_material_id?: string | null;
  semantic_tags?: string[];
  appearance_tags?: string[];
  required_maps?: Array<
    | "base_color"
    | "normal"
    | "roughness"
    | "metalness"
    | "ambient_occlusion"
    | "height"
    | "opacity"
    | "emission"
  >;
  material_slot?: string | null;
  repeat?: [number, number];
  rotation_degrees?: number;
  preserve_original?: boolean;
};

export type LabRuntimeEnvironmentOverride = {
  preferred_environment_id?: string | null;
  background_mode?: "visible" | "lighting_only";
  exposure?: number;
  intensity?: number;
  rotation_degrees?: number;
};

export type ResolveLabRuntimeInput = {
  source: SceneResourcePlanSource;
  resource_plan: unknown;
  primitive_nodes?: unknown;
  preferred_asset_ids_by_intent?: Record<string, string>;
  material_override?: LabRuntimeMaterialOverride | null;
  environment_override?: LabRuntimeEnvironmentOverride | null;
  actor_transforms?: Record<
    string,
    Partial<RuntimeSceneActorTransform>
  >;
};

function runtimeSource(
  source: SceneResourcePlanSource,
): RuntimeSceneSource {
  if (
    source === "manual_turn" ||
    source === "primitive_builder" ||
    source === "visual_experience"
  ) {
    return source;
  }
  return "compatibility_adapter";
}

function cleanId(
  value: string,
  fallback: string,
) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) ||
    fallback
  );
}

function finite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        min,
        Math.min(max, value),
      )
    : fallback;
}

function ensureExecutionEntity(
  plan: SceneResourcePlanV1,
  entityId: string,
) {
  if (
    plan.entity_intents.some(
      (intent) =>
        intent.entity_id === entityId,
    )
  ) {
    return;
  }

  const intent:
    SceneEntityResourceIntent = {
      intent_id:
        `execution_entity_${entityId}`,
      entity_id: entityId,
      semantic_role:
        "execution-only primitive surface",
      instructional_purpose:
        "Preserve a stable primitive entity id while applying a reviewed runtime resource.",
      actor_kind:
        "procedural_primitive",
      resource_criticality:
        "optional",
      runtime_target: "both",
      model_requirement: null,
      fallback_policy: {
        preserve_entity_ids: true,
      },
    };
  plan.entity_intents.push(intent);
}

function applyMaterialOverride(
  plan: SceneResourcePlanV1,
  override:
    | LabRuntimeMaterialOverride
    | null
    | undefined,
) {
  if (
    !override?.target_entity_id
      ?.trim()
  ) {
    return null;
  }

  const targetEntityId =
    cleanId(
      override.target_entity_id,
      "runtime_surface",
    );
  ensureExecutionEntity(
    plan,
    targetEntityId,
  );
  const intentId =
    `execution_material_${targetEntityId}`;
  const intent:
    SceneSurfaceResourceIntent = {
      intent_id: intentId,
      target_entity_id:
        targetEntityId,
      material_slot:
        override.material_slot
          ?.trim() || "default",
      instructional_purpose:
        "Apply a reviewed material without regenerating or reinterpreting the educational direction.",
      runtime_target: "both",
      material_requirement: {
        semantic_tags:
          override.semantic_tags ?? [],
        appearance_tags:
          override.appearance_tags ??
          [],
        required_maps:
          override.required_maps?.length
            ? override.required_maps
            : ["base_color"],
        max_resolution_px:
          plan.performance_budget
            .max_texture_resolution_px,
        preferred_encoding:
          "automatic",
        transparency: "allowed",
        tiling:
          override.repeat &&
          override.repeat.length === 2
            ? [
                finite(
                  override.repeat[0],
                  1,
                  0.01,
                  128,
                ),
                finite(
                  override.repeat[1],
                  1,
                  0.01,
                  128,
                ),
              ]
            : [1, 1],
        rotation_degrees:
          finite(
            override.rotation_degrees,
            0,
            -1440,
            1440,
          ),
        uv_assumption:
          "generated_primitive_uv",
        color_tint_allowed: true,
        displacement: "forbidden",
        closeup_importance:
          "medium",
      },
    };

  plan.surface_intents =
    plan.surface_intents.filter(
      (entry) =>
        entry.intent_id !==
        intentId,
    );
  plan.surface_intents.push(intent);
  return intentId;
}

function applyEnvironmentOverride(
  plan: SceneResourcePlanV1,
  override:
    | LabRuntimeEnvironmentOverride
    | null
    | undefined,
) {
  if (!override) return;

  if (!plan.environment_intent) {
    plan.environment_intent = {
      intent_id:
        "execution_environment",
      instructional_purpose:
        "Provide reviewed lighting without changing educational direction.",
      runtime_target: "both",
      environment_requirement: {
        semantic_tags: [
          "educational",
          "readable",
        ],
        lighting_mood:
          "neutral studio",
        exposure: 1,
        intensity: 1,
        background_mode:
          "lighting_only",
        rotation_degrees: 0,
        shadow_softness: "soft",
        color_temperature_intent:
          "neutral",
        max_resolution_px:
          plan.performance_budget
            .max_hdri_resolution_px,
      },
    };
  }

  const requirement =
    plan.environment_intent
      .environment_requirement;
  requirement.background_mode =
    override.background_mode ??
    requirement.background_mode;
  requirement.exposure =
    finite(
      override.exposure,
      requirement.exposure,
      0.1,
      4,
    );
  requirement.intensity =
    finite(
      override.intensity,
      requirement.intensity,
      0,
      8,
    );
  requirement.rotation_degrees =
    finite(
      override.rotation_degrees,
      requirement.rotation_degrees,
      -1440,
      1440,
    );
}

function runtimeFallbackPolicy(
  plan: SceneResourcePlanV1,
) {
  return {
    preserve_entity_ids: true as const,
    preserve_direction: true as const,
    missing_model:
      plan.fallback_policy
        .missing_model,
    missing_material:
      plan.fallback_policy
          .missing_material ===
        "fail_scene"
        ? "fail_scene" as const
        : plan.fallback_policy
              .missing_material ===
            "solid_pbr"
          ? "neutral_material" as const
          : "preserve_original" as const,
    missing_environment:
      plan.fallback_policy
          .missing_environment ===
        "fail_scene"
        ? "fail_scene" as const
        : plan.fallback_policy
              .missing_environment ===
            "renderer_default"
          ? "renderer_default" as const
          : "studio_rig" as const,
  };
}

export async function resolveLabSceneRuntime(
  input: ResolveLabRuntimeInput,
) {
  const normalized =
    normalizeSceneResourcePlan(
      input.resource_plan,
      {
        source: input.source,
      },
    );
  const executionPlan:
    SceneResourcePlanV1 =
      structuredClone(
        normalized.plan,
      );
  executionPlan.source =
    input.source;
  executionPlan.fallback_policy = {
    ...DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
    ...executionPlan.fallback_policy,
    acquisition_policy: "never",
    preserve_entity_ids: true,
  };

  const materialIntentId =
    applyMaterialOverride(
      executionPlan,
      input.material_override,
    );
  applyEnvironmentOverride(
    executionPlan,
    input.environment_override,
  );

  const preferredMaterialIds:
    Record<string, string> = {};
  if (
    materialIntentId &&
    input.material_override
      ?.preferred_material_id
  ) {
    preferredMaterialIds[
      materialIntentId
    ] =
      input.material_override
        .preferred_material_id;
  }

  const resolution =
    await resolveReviewedSceneResources(
      executionPlan,
      {
        require_cloud_ready: true,
        preferred_asset_ids_by_intent:
          input.preferred_asset_ids_by_intent,
        preferred_material_ids_by_intent:
          preferredMaterialIds,
        preferred_environment_id:
          input.environment_override
            ?.preferred_environment_id ??
          null,
      },
    );

  const resolved =
    resolution.resolved_resources;
  const models =
    resolved.models.map((model) =>
      buildRuntimeModelBinding(
        resolved,
        model,
        fallbackForIntent(
          resolved,
          model.intent_id,
        ),
      ),
    );
  const resolvedModelIntentIds =
    new Set(
      resolved.models.map(
        (model) => model.intent_id,
      ),
    );
  const fallbackActors =
    executionPlan.entity_intents
      .filter(
        (intent) =>
          Boolean(intent.model_requirement) &&
          !resolvedModelIntentIds.has(intent.intent_id),
      )
      .map((intent) => {
        const fallback =
          resolved.fallbacks_used.find(
            (entry) =>
              entry.intent_id === intent.intent_id &&
              entry.resource_kind === "model",
          );
        return {
          entity_id: intent.entity_id,
          intent_id: intent.intent_id,
          label:
            fallback?.reason ??
            `No reviewed model was available for ${intent.semantic_role}.`,
          required:
            intent.resource_criticality === "required",
        };
      });
  const primitiveResult =
    adaptPrimitiveSceneNodesToRuntime(
      input.primitive_nodes,
      {
        exclude_entity_ids:
          models.map(
            (model) =>
              model.entity_id,
          ),
        max_primitives:
          executionPlan
            .performance_budget
            .max_models,
      },
    );
  const actorTransforms = {
    ...primitiveResult
      .actor_transforms,
    ...(input.actor_transforms ??
      {}),
  };
  const requiredEntityIds =
    executionPlan.entity_intents
      .filter(
        (intent) =>
          intent.resource_criticality ===
          "required",
      )
      .map(
        (intent) =>
          intent.entity_id,
      );
  const fallbackLabels =
    Object.fromEntries(
      resolved.fallbacks_used
        .filter(
          (fallback) =>
            Boolean(
              fallback
                .preserved_entity_id,
            ),
        )
        .map((fallback) => [
          fallback
            .preserved_entity_id as string,
          fallback.reason,
        ]),
    );

  const runtimeBinding:
    RuntimeSceneBindingV1 =
      buildRuntimeSceneBinding({
        scene_id:
          executionPlan.scene_id,
        source:
          runtimeSource(
            input.source,
          ),
        models,
        primitives:
          primitiveResult.primitives,
        fallback_actors:
          fallbackActors,
        materials:
          resolution
            .material_resolutions
            .map(
              (entry) =>
                entry.binding,
            )
            .filter(
              (
                binding,
              ): binding is NonNullable<
                typeof binding
              > => Boolean(binding),
            ),
        environment:
          resolution
            .environment_resolution
            ?.binding ?? null,
        actor_transforms:
          actorTransforms,
        required_entity_ids:
          requiredEntityIds,
        fallback_labels:
          fallbackLabels,
        fallback_policy:
          runtimeFallbackPolicy(
            executionPlan,
          ),
        warnings: Array.from(
          new Set([
            ...normalized.warnings,
            ...primitiveResult
              .warnings,
            ...resolved.warnings.map(
              (warning) =>
                warning.message,
            ),
          ]),
        ),
      });

  const inspector = {
    schema_version:
      "myway_phase2_run_inspector_v1",
    source: input.source,
    educational_direction: {
      director_schema_version:
        executionPlan
          .director_schema_version,
      scene_id:
        executionPlan.scene_id,
      preserved: true,
    },
    normalized_resource_intent:
      executionPlan,
    resolution: {
      registry_snapshot_id:
        resolved
          .registry_snapshot_id,
      registry_content_hash:
        resolved
          .registry_content_hash,
      model_diagnostics:
        resolved
          .model_resolution_diagnostics,
      material_diagnostics:
        resolution
          .material_resolutions
          .map((entry) => ({
            intent_id:
              entry.intent.intent_id,
            diagnostics:
              entry.diagnostics,
          })),
      environment_diagnostics:
        resolution
          .environment_resolution
          ?.diagnostics ?? null,
      auxiliary_diagnostics:
        resolution
          .auxiliary_resolutions,
      chosen_resources: {
        models:
          resolved.models,
        materials:
          resolved.materials,
        environment:
          resolved.environment,
        auxiliary:
          resolved.auxiliary,
      },
      fallbacks:
        resolved.fallbacks_used,
      warnings:
        resolved.warnings,
    },
    compiled_runtime_scene:
      runtimeBinding,
    invariants: {
      stable_entity_ids:
        true,
      resource_replacement_regenerates_direction:
        false,
      acquisition_invoked:
        false,
      r2_authoritative:
        true,
      primitive_generated_uvs:
        primitiveResult
          .primitives.every(
            (primitive) =>
              primitive.generated_uvs,
          ),
    },
  };

  return {
    resource_plan:
      executionPlan,
    resource_plan_validation:
      normalized.validation,
    resolved_resources:
      resolved,
    runtime_binding:
      runtimeBinding,
    inspector,
  };
}
