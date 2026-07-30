import type {
  DirectorEntityIntent,
  EducationalSceneDirectorPlanV1,
} from "../director";
import {
  DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
  DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
  SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
  type SceneEntityResourceIntent,
  type SceneEnvironmentResourceIntent,
  type SceneResourcePlanSource,
  type SceneResourcePlanV1,
  type SceneResourcePlanValidationReport,
} from "./scene-resource-contract";
import {
  validateSceneResourcePlan,
} from "./validate-scene-resource-plan";

export type PrimitiveAssetRequirementLike = {
  instance_id: string;
  concept?: string;
  aliases?: string[];
  semantic_tags?: string[];
  motion_role?: string;
  required?: boolean;
  target_extent_m?: number;
  required_affordances?: string[];
  placement_anchor?: string;
  appearance_request?: {
    visual_brief?: string;
    required_traits?: string[];
    preferred_traits?: string[];
    avoid_traits?: string[];
  } | null;
};

export type SceneResourcePlanAdapterOptions = {
  source: SceneResourcePlanSource;
  scene_id?: string;
  primitive_requirements?: PrimitiveAssetRequirementLike[];
  include_environment_intent?: boolean;
  environment_background_mode?:
    | "visible"
    | "lighting_only";
};

export type SceneResourcePlanAdapterResult = {
  plan: SceneResourcePlanV1;
  validation: SceneResourcePlanValidationReport;
  warnings: string[];
};

function cleanId(
  value: string | null | undefined,
  fallback: string,
) {
  const source = (value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return source || fallback;
}

function uniqueStrings(
  values: Array<string | null | undefined>,
) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function requirementByEntityId(
  requirements: PrimitiveAssetRequirementLike[],
) {
  return new Map(
    requirements.map((requirement) => [
      cleanId(
        requirement.instance_id,
        requirement.instance_id,
      ),
      requirement,
    ]),
  );
}

function shouldRequestModel(
  entity: DirectorEntityIntent,
) {
  return (
    entity.actor_kind === "physical_asset" ||
    entity.asset_policy.asset_required
  );
}

function criticalityForEntity(
  entity: DirectorEntityIntent,
) {
  if (entity.asset_policy.asset_required) {
    return "required" as const;
  }
  if (entity.actor_kind === "physical_asset") {
    return "important" as const;
  }
  return "optional" as const;
}

function entityIntent(
  entity: DirectorEntityIntent,
  requirement:
    | PrimitiveAssetRequirementLike
    | undefined,
): SceneEntityResourceIntent {
  const entityId = cleanId(
    entity.id,
    "entity",
  );
  const appearance =
    requirement?.appearance_request ?? null;
  const requestModel =
    shouldRequestModel(entity);

  return {
    intent_id: `model_${entityId}`,
    entity_id: entityId,
    semantic_role: entity.semantic_role,
    instructional_purpose:
      entity.visual_need ||
      `Preserve the ${entity.display_name} actor required by the educational direction.`,
    actor_kind: entity.actor_kind,
    resource_criticality:
      criticalityForEntity(entity),
    runtime_target: "both",
    model_requirement: requestModel
      ? {
          semantic_tags: uniqueStrings([
            ...entity.semantic_tags,
            ...(requirement?.semantic_tags ?? []),
          ]),
          aliases: uniqueStrings([
            entity.display_name,
            requirement?.concept,
            ...(requirement?.aliases ?? []),
          ]),
          required_capabilities:
            uniqueStrings([
              ...entity.asset_policy
                .capability_needs,
              requirement?.motion_role,
            ]),
          required_anchor_types:
            uniqueStrings([
              ...entity.asset_policy
                .anchor_needs,
              requirement?.placement_anchor,
            ]),
          required_affordances:
            uniqueStrings(
              requirement?.required_affordances ??
                [],
            ),
          preferred_composition:
            "any",
          target_extent_m:
            typeof requirement
              ?.target_extent_m === "number" &&
            Number.isFinite(
              requirement.target_extent_m,
            )
              ? Math.max(
                  0.02,
                  requirement.target_extent_m,
                )
              : null,
          rigging_required: false,
          required_animation_clips: [],
          closeup_importance:
            entity.asset_policy
              .capability_needs.some((need) =>
                /close|detail|macro/i.test(
                  need,
                ),
              )
              ? "high"
              : "medium",
          visual_brief:
            appearance?.visual_brief ||
            entity.visual_need ||
            `A clear ${entity.display_name} actor.`,
          required_appearance_traits:
            uniqueStrings(
              appearance?.required_traits ??
                [],
            ),
          preferred_appearance_traits:
            uniqueStrings(
              appearance?.preferred_traits ??
                [],
            ),
          avoided_appearance_traits:
            uniqueStrings(
              appearance?.avoid_traits ?? [],
            ),
        }
      : null,
    fallback_policy: {
      missing_model:
        entity.asset_policy
          .fallback_representation ===
        "abstract_proxy"
          ? "abstract_proxy"
          : entity.asset_policy
                .fallback_representation ===
              "preserve_direction_without_actor"
            ? "preserve_direction_without_actor"
            : "diagrammatic_proxy",
      preserve_entity_ids: true,
    },
  };
}

function environmentIntent(
  plan: EducationalSceneDirectorPlanV1,
  backgroundMode:
    | "visible"
    | "lighting_only",
): SceneEnvironmentResourceIntent {
  return {
    intent_id: "scene_environment",
    instructional_purpose:
      "Provide readable lighting and continuity without changing the educational direction.",
    runtime_target: "both",
    environment_requirement: {
      semantic_tags: uniqueStrings([
        plan.style.look,
        plan.style.mood,
        "educational",
        "readable",
      ]),
      lighting_mood:
        plan.style.mood ||
        "neutral studio",
      exposure: 1,
      intensity: 1,
      background_mode: backgroundMode,
      rotation_degrees: 0,
      shadow_softness: "soft",
      color_temperature_intent:
        plan.style.mood || "neutral",
      max_resolution_px:
        DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET
          .max_hdri_resolution_px,
    },
  };
}

export function buildSceneResourcePlanFromDirector(
  directorPlan: EducationalSceneDirectorPlanV1,
  options: SceneResourcePlanAdapterOptions,
): SceneResourcePlanAdapterResult {
  const requirementMap =
    requirementByEntityId(
      options.primitive_requirements ?? [],
    );
  const warnings: string[] = [];

  const entityIntents =
    directorPlan.entities.map((entity) => {
      const requirement =
        requirementMap.get(
          cleanId(entity.id, entity.id),
        );

      if (
        shouldRequestModel(entity) &&
        !requirement &&
        entity.actor_kind === "physical_asset"
      ) {
        warnings.push(
          `Director entity ${entity.id} requests a physical actor but has no builder-specific size or appearance requirement yet.`,
        );
      }

      return entityIntent(
        entity,
        requirement,
      );
    });

  const plan: SceneResourcePlanV1 = {
    schema_version:
      SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
    source: options.source,
    scene_id: cleanId(
      options.scene_id,
      cleanId(
        directorPlan.title,
        "scene",
      ),
    ),
    director_schema_version:
      directorPlan.schema_version,
    entity_intents: entityIntents,
    surface_intents: [],
    environment_intent:
      options.include_environment_intent ===
      false
        ? null
        : environmentIntent(
            directorPlan,
            options.environment_background_mode ??
              "lighting_only",
          ),
    auxiliary_intents: [],
    fallback_policy: {
      ...DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
      acquisition_policy: "never",
    },
    performance_budget: {
      ...DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
    },
  };

  const validation =
    validateSceneResourcePlan(plan);

  return {
    plan,
    validation,
    warnings: Array.from(
      new Set([
        ...warnings,
        ...validation.issues
          .filter(
            (entry) =>
              entry.severity === "warning",
          )
          .map((entry) => entry.message),
      ]),
    ),
  };
}
