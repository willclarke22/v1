import {
  DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
  DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
  SCENE_RESOURCE_ACQUISITION_POLICIES,
  SCENE_RESOURCE_DEVICE_TIERS,
  SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
  SCENE_RESOURCE_PLAN_SOURCES,
  SCENE_RESOURCE_REQUIRED_MAPS,
  SCENE_RESOURCE_RUNTIME_TARGETS,
  type SceneAuxiliaryResourceIntent,
  type SceneEntityResourceIntent,
  type SceneEnvironmentResourceIntent,
  type SceneResourceAcquisitionPolicy,
  type SceneResourceCloseupImportance,
  type SceneResourceDeviceTier,
  type SceneResourceFallbackPolicy,
  type SceneResourceMaterialRequirement,
  type SceneResourcePerformanceBudget,
  type SceneResourcePlanSource,
  type SceneResourcePlanV1,
  type SceneResourceRuntimeTarget,
  type SceneSurfaceResourceIntent,
} from "./scene-resource-contract";
import {
  validateSceneResourcePlan,
} from "./validate-scene-resource-plan";

export type SceneResourcePlanNormalizationContext = {
  source?: SceneResourcePlanSource;
  scene_id?: string;
  director_schema_version?:
    | "myway_educational_scene_director_v1"
    | null;
};

export type SceneResourcePlanNormalizationResult = {
  plan: SceneResourcePlanV1;
  validation: ReturnType<
    typeof validateSceneResourcePlan
  >;
  warnings: string[];
};

const sourceSet = new Set<string>(
  SCENE_RESOURCE_PLAN_SOURCES,
);
const runtimeTargetSet = new Set<string>(
  SCENE_RESOURCE_RUNTIME_TARGETS,
);
const acquisitionPolicySet = new Set<string>(
  SCENE_RESOURCE_ACQUISITION_POLICIES,
);
const deviceTierSet = new Set<string>(
  SCENE_RESOURCE_DEVICE_TIERS,
);
const requiredMapSet = new Set<string>(
  SCENE_RESOURCE_REQUIRED_MAPS,
);

function record(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function cleanId(
  value: unknown,
  fallback: string,
): string {
  const source = text(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return source || fallback;
}

function strings(
  value: unknown,
  max = 32,
): string[] {
  return Array.from(
    new Set(
      list(value)
        .map((item) => text(item))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function finite(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function bounded(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.max(
    min,
    Math.min(max, finite(value, fallback)),
  );
}

function oneOf<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  return typeof value === "string" &&
    allowed.has(value)
    ? (value as T)
    : fallback;
}

function closeupImportance(
  value: unknown,
): SceneResourceCloseupImportance {
  return value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : "medium";
}

function normalizeFallbackPolicy(
  raw: unknown,
): SceneResourceFallbackPolicy {
  const source = record(raw) ?? {};

  return {
    acquisition_policy:
      oneOf<SceneResourceAcquisitionPolicy>(
        source.acquisition_policy,
        acquisitionPolicySet,
        DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY
          .acquisition_policy,
      ),
    missing_model:
      source.missing_model ===
        "abstract_proxy" ||
      source.missing_model ===
        "preserve_direction_without_actor" ||
      source.missing_model ===
        "fail_scene"
        ? source.missing_model
        : "diagrammatic_proxy",
    missing_material:
      source.missing_material ===
        "preserve_original_material" ||
      source.missing_material ===
        "omit_override" ||
      source.missing_material ===
        "fail_scene"
        ? source.missing_material
        : "solid_pbr",
    missing_environment:
      source.missing_environment ===
        "renderer_default" ||
      source.missing_environment ===
        "fail_scene"
        ? source.missing_environment
        : "neutral_studio",
    missing_auxiliary:
      source.missing_auxiliary ===
        "diagrammatic_fallback" ||
      source.missing_auxiliary ===
        "fail_scene"
        ? source.missing_auxiliary
        : "omit_with_warning",
    preserve_entity_ids: true,
  };
}

function normalizePerformanceBudget(
  raw: unknown,
): SceneResourcePerformanceBudget {
  const source = record(raw) ?? {};
  const defaults =
    DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET;

  return {
    target_device:
      oneOf<SceneResourceDeviceTier>(
        source.target_device,
        deviceTierSet,
        defaults.target_device,
      ),
    max_models: Math.round(
      bounded(
        source.max_models,
        defaults.max_models,
        1,
        500,
      ),
    ),
    max_total_triangles: Math.round(
      bounded(
        source.max_total_triangles,
        defaults.max_total_triangles,
        1_000,
        100_000_000,
      ),
    ),
    max_texture_resolution_px: Math.round(
      bounded(
        source.max_texture_resolution_px,
        defaults.max_texture_resolution_px,
        128,
        16_384,
      ),
    ),
    max_hdri_resolution_px: Math.round(
      bounded(
        source.max_hdri_resolution_px,
        defaults.max_hdri_resolution_px,
        128,
        32_768,
      ),
    ),
    max_total_texture_bytes: Math.round(
      bounded(
        source.max_total_texture_bytes,
        defaults.max_total_texture_bytes,
        1_048_576,
        8 * 1024 * 1024 * 1024,
      ),
    ),
    max_simultaneous_animated_models:
      Math.round(
        bounded(
          source.max_simultaneous_animated_models,
          defaults.max_simultaneous_animated_models,
          1,
          200,
        ),
      ),
  };
}

function normalizeEntityIntent(
  raw: unknown,
  index: number,
): SceneEntityResourceIntent | null {
  const source = record(raw);
  if (!source) return null;

  const entityId = cleanId(
    source.entity_id,
    `entity_${index + 1}`,
  );
  const model = record(
    source.model_requirement,
  );

  return {
    intent_id: cleanId(
      source.intent_id,
      `model_${entityId}`,
    ),
    entity_id: entityId,
    semantic_role: text(
      source.semantic_role,
      "scene actor",
    ),
    instructional_purpose: text(
      source.instructional_purpose,
      "Preserve the actor required by the educational direction.",
    ),
    actor_kind: text(
      source.actor_kind,
      "any",
    ),
    resource_criticality:
      source.resource_criticality ===
        "optional" ||
      source.resource_criticality ===
        "important"
        ? source.resource_criticality
        : "required",
    runtime_target:
      oneOf<SceneResourceRuntimeTarget>(
        source.runtime_target,
        runtimeTargetSet,
        "both",
      ),
    model_requirement: model
      ? {
          semantic_tags: strings(
            model.semantic_tags,
          ),
          aliases: strings(model.aliases),
          required_capabilities: strings(
            model.required_capabilities,
          ),
          required_anchor_types: strings(
            model.required_anchor_types,
          ),
          required_affordances: strings(
            model.required_affordances,
          ),
          preferred_composition:
            model.preferred_composition ===
              "single_object" ||
            model.preferred_composition ===
              "object_set" ||
            model.preferred_composition ===
              "environment_piece"
              ? model.preferred_composition
              : "any",
          target_extent_m:
            typeof model.target_extent_m ===
              "number" &&
            Number.isFinite(
              model.target_extent_m,
            )
              ? bounded(
                  model.target_extent_m,
                  1,
                  0.02,
                  1_000,
                )
              : null,
          rigging_required:
            model.rigging_required === true,
          required_animation_clips: strings(
            model.required_animation_clips,
          ),
          closeup_importance:
            closeupImportance(
              model.closeup_importance,
            ),
          visual_brief: text(
            model.visual_brief,
            `A clear ${entityId.replace(/_/g, " ")} actor.`,
          ),
          required_appearance_traits: strings(
            model.required_appearance_traits,
          ),
          preferred_appearance_traits: strings(
            model.preferred_appearance_traits,
          ),
          avoided_appearance_traits: strings(
            model.avoided_appearance_traits,
          ),
        }
      : null,
    fallback_policy:
      record(source.fallback_policy)
        ? normalizeFallbackPolicy(
            source.fallback_policy,
          )
        : null,
  };
}

function normalizeMaterialRequirement(
  raw: unknown,
): SceneResourceMaterialRequirement {
  const source = record(raw) ?? {};
  const tiling = list(source.tiling);

  return {
    semantic_tags: strings(
      source.semantic_tags,
    ),
    appearance_tags: strings(
      source.appearance_tags,
    ),
    required_maps: Array.from(
      new Set(
        list(source.required_maps)
          .map((item) => text(item))
          .filter((item) =>
            requiredMapSet.has(item),
          ),
      ),
    ) as SceneResourceMaterialRequirement["required_maps"],
    max_resolution_px: Math.round(
      bounded(
        source.max_resolution_px,
        2048,
        128,
        16_384,
      ),
    ),
    preferred_encoding:
      source.preferred_encoding === "jpg" ||
      source.preferred_encoding === "png"
        ? source.preferred_encoding
        : "automatic",
    transparency:
      source.transparency === "required" ||
      source.transparency === "forbidden"
        ? source.transparency
        : "allowed",
    tiling: [
      bounded(tiling[0], 1, 0.01, 100),
      bounded(tiling[1], 1, 0.01, 100),
    ],
    rotation_degrees: bounded(
      source.rotation_degrees,
      0,
      -360,
      360,
    ),
    uv_assumption:
      source.uv_assumption ===
        "existing_uv" ||
      source.uv_assumption ===
        "generated_primitive_uv" ||
      source.uv_assumption ===
        "triplanar_allowed"
        ? source.uv_assumption
        : "unknown",
    color_tint_allowed:
      source.color_tint_allowed !== false,
    displacement:
      source.displacement === "allowed"
        ? "allowed"
        : "forbidden",
    closeup_importance:
      closeupImportance(
        source.closeup_importance,
      ),
  };
}

function normalizeSurfaceIntent(
  raw: unknown,
  index: number,
): SceneSurfaceResourceIntent | null {
  const source = record(raw);
  if (!source) return null;

  const targetEntityId = cleanId(
    source.target_entity_id,
    `entity_${index + 1}`,
  );
  const materialSlot = cleanId(
    source.material_slot,
    "default",
  );

  return {
    intent_id: cleanId(
      source.intent_id,
      `material_${targetEntityId}_${materialSlot}`,
    ),
    target_entity_id: targetEntityId,
    material_slot: materialSlot,
    instructional_purpose: text(
      source.instructional_purpose,
      "Support visual clarity without changing the lesson.",
    ),
    runtime_target:
      oneOf<SceneResourceRuntimeTarget>(
        source.runtime_target,
        runtimeTargetSet,
        "both",
      ),
    material_requirement:
      normalizeMaterialRequirement(
        source.material_requirement,
      ),
  };
}

function normalizeEnvironmentIntent(
  raw: unknown,
): SceneEnvironmentResourceIntent | null {
  const source = record(raw);
  if (!source) return null;
  const requirement =
    record(
      source.environment_requirement,
    ) ?? {};
  const runtimeTarget =
    oneOf<SceneResourceRuntimeTarget>(
      source.runtime_target,
      runtimeTargetSet,
      "both",
    );

  return {
    intent_id: cleanId(
      source.intent_id,
      "scene_environment",
    ),
    instructional_purpose: text(
      source.instructional_purpose,
      "Provide readable lighting without distracting from the teaching sequence.",
    ),
    runtime_target:
      runtimeTarget === "authoring_only"
        ? "both"
        : runtimeTarget,
    environment_requirement: {
      semantic_tags: strings(
        requirement.semantic_tags,
      ),
      lighting_mood: text(
        requirement.lighting_mood,
        "neutral studio",
      ),
      exposure: bounded(
        requirement.exposure,
        1,
        0.05,
        8,
      ),
      intensity: bounded(
        requirement.intensity,
        1,
        0,
        20,
      ),
      background_mode:
        requirement.background_mode ===
        "visible"
          ? "visible"
          : "lighting_only",
      rotation_degrees: bounded(
        requirement.rotation_degrees,
        0,
        -360,
        360,
      ),
      shadow_softness:
        requirement.shadow_softness ===
          "hard" ||
        requirement.shadow_softness ===
          "medium"
          ? requirement.shadow_softness
          : "soft",
      color_temperature_intent: text(
        requirement.color_temperature_intent,
        "neutral",
      ),
      max_resolution_px: Math.round(
        bounded(
          requirement.max_resolution_px,
          2048,
          128,
          32_768,
        ),
      ),
    },
  };
}

function normalizeAuxiliaryIntent(
  raw: unknown,
  index: number,
): SceneAuxiliaryResourceIntent | null {
  const source = record(raw);
  if (!source) return null;
  const kind = text(source.resource_kind);

  if (
    kind === "model" ||
    kind === "material" ||
    kind === "environment" ||
    ![
      "decal",
      "terrain",
      "atlas",
      "image",
      "brush",
      "substance",
      "hdri_element",
    ].includes(kind)
  ) {
    return null;
  }

  return {
    intent_id: cleanId(
      source.intent_id,
      `auxiliary_${index + 1}`,
    ),
    resource_kind:
      kind as SceneAuxiliaryResourceIntent["resource_kind"],
    target_entity_id: text(
      source.target_entity_id,
    ) || null,
    target_surface: text(
      source.target_surface,
    ) || null,
    semantic_tags: strings(
      source.semantic_tags,
    ),
    instructional_purpose: text(
      source.instructional_purpose,
      "Support the requested visual execution.",
    ),
    runtime_target:
      oneOf<SceneResourceRuntimeTarget>(
        source.runtime_target,
        runtimeTargetSet,
        kind === "brush" ||
          kind === "substance"
          ? "authoring_only"
          : "both",
      ),
    required: source.required === true,
    max_resolution_px:
      typeof source.max_resolution_px ===
        "number" &&
      Number.isFinite(
        source.max_resolution_px,
      )
        ? Math.round(
            bounded(
              source.max_resolution_px,
              2048,
              128,
              32_768,
            ),
          )
        : null,
    metadata:
      record(source.metadata) ?? {},
  };
}

export function normalizeSceneResourcePlan(
  raw: unknown,
  context: SceneResourcePlanNormalizationContext = {},
): SceneResourcePlanNormalizationResult {
  const root = record(raw) ?? {};
  const warnings: string[] = [];

  const entityIntents = list(
    root.entity_intents,
  )
    .map(normalizeEntityIntent)
    .filter(
      (
        item,
      ): item is SceneEntityResourceIntent =>
        Boolean(item),
    );
  const surfaceIntents = list(
    root.surface_intents,
  )
    .map(normalizeSurfaceIntent)
    .filter(
      (
        item,
      ): item is SceneSurfaceResourceIntent =>
        Boolean(item),
    );
  const auxiliaryIntents = list(
    root.auxiliary_intents,
  )
    .map(normalizeAuxiliaryIntent)
    .filter(
      (
        item,
      ): item is SceneAuxiliaryResourceIntent =>
        Boolean(item),
    );

  if (
    list(root.auxiliary_intents).length !==
    auxiliaryIntents.length
  ) {
    warnings.push(
      "Unsupported auxiliary resource intents were omitted during normalization.",
    );
  }

  const source = oneOf<SceneResourcePlanSource>(
    root.source,
    sourceSet,
    context.source ?? "compatibility_adapter",
  );

  const plan: SceneResourcePlanV1 = {
    schema_version:
      SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
    source,
    scene_id: cleanId(
      root.scene_id,
      cleanId(
        context.scene_id,
        "scene",
      ),
    ),
    director_schema_version:
      root.director_schema_version ===
        "myway_educational_scene_director_v1" ||
      context.director_schema_version ===
        "myway_educational_scene_director_v1"
        ? "myway_educational_scene_director_v1"
        : null,
    entity_intents: entityIntents,
    surface_intents: surfaceIntents,
    environment_intent:
      normalizeEnvironmentIntent(
        root.environment_intent,
      ),
    auxiliary_intents: auxiliaryIntents,
    fallback_policy:
      normalizeFallbackPolicy(
        root.fallback_policy,
      ),
    performance_budget:
      normalizePerformanceBudget(
        root.performance_budget,
      ),
  };

  const validation =
    validateSceneResourcePlan(plan);
  warnings.push(
    ...validation.issues
      .filter(
        (entry) =>
          entry.severity === "warning",
      )
      .map((entry) => entry.message),
  );

  return {
    plan,
    validation,
    warnings: Array.from(
      new Set(warnings),
    ),
  };
}
