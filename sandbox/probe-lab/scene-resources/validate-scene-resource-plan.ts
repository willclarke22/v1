import {
  SCENE_RESOURCE_ACQUISITION_POLICIES,
  SCENE_RESOURCE_KINDS,
  SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
  SCENE_RESOURCE_PLAN_SOURCES,
  SCENE_RESOURCE_REQUIRED_MAPS,
  SCENE_RESOURCE_RUNTIME_TARGETS,
  type SceneResourcePlanV1,
  type SceneResourcePlanValidationReport,
  type SceneResourceValidationIssue,
} from "./scene-resource-contract";

const sourceSet = new Set<string>(
  SCENE_RESOURCE_PLAN_SOURCES,
);
const resourceKindSet = new Set<string>(
  SCENE_RESOURCE_KINDS,
);
const runtimeTargetSet = new Set<string>(
  SCENE_RESOURCE_RUNTIME_TARGETS,
);
const acquisitionPolicySet = new Set<string>(
  SCENE_RESOURCE_ACQUISITION_POLICIES,
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

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function finitePositive(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0;
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  });

  return Array.from(duplicates).sort();
}

function issue(
  issues: SceneResourceValidationIssue[],
  severity: SceneResourceValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
) {
  issues.push({
    severity,
    code,
    path,
    message,
  });
}

export function validateSceneResourcePlan(
  raw: unknown,
): SceneResourcePlanValidationReport {
  const issues: SceneResourceValidationIssue[] = [];
  const root = record(raw);

  if (!root) {
    issue(
      issues,
      "error",
      "resource_plan_not_object",
      "$",
      "Scene resource plan must be an object.",
    );

    return {
      valid: false,
      entity_intent_count: 0,
      surface_intent_count: 0,
      auxiliary_intent_count: 0,
      unresolved_reference_count: 0,
      duplicate_intent_ids: [],
      duplicate_entity_ids: [],
      issues,
    };
  }

  if (
    root.schema_version !==
    SCENE_RESOURCE_PLAN_SCHEMA_VERSION
  ) {
    issue(
      issues,
      "error",
      "resource_plan_schema_version_invalid",
      "schema_version",
      `Expected ${SCENE_RESOURCE_PLAN_SCHEMA_VERSION}.`,
    );
  }

  if (!sourceSet.has(text(root.source))) {
    issue(
      issues,
      "error",
      "resource_plan_source_invalid",
      "source",
      "Scene resource plan source is not recognized.",
    );
  }

  if (!text(root.scene_id)) {
    issue(
      issues,
      "error",
      "resource_plan_scene_id_missing",
      "scene_id",
      "Scene resource plan requires a stable scene_id.",
    );
  }

  const entityIntents = list(root.entity_intents);
  const surfaceIntents = list(root.surface_intents);
  const auxiliaryIntents = list(root.auxiliary_intents);
  const environmentIntent = record(
    root.environment_intent,
  );
  const fallbackPolicy = record(
    root.fallback_policy,
  );
  const performanceBudget = record(
    root.performance_budget,
  );

  const entityIds: string[] = [];
  const intentIds: string[] = [];

  entityIntents.forEach((value, index) => {
    const item = record(value);
    const path = `entity_intents[${index}]`;

    if (!item) {
      issue(
        issues,
        "error",
        "entity_intent_not_object",
        path,
        "Entity resource intent must be an object.",
      );
      return;
    }

    const intentId = text(item.intent_id);
    const entityId = text(item.entity_id);
    if (intentId) intentIds.push(intentId);
    if (entityId) entityIds.push(entityId);

    if (!intentId) {
      issue(
        issues,
        "error",
        "entity_intent_id_missing",
        `${path}.intent_id`,
        "Entity resource intent requires an intent_id.",
      );
    }

    if (!entityId) {
      issue(
        issues,
        "error",
        "entity_reference_missing",
        `${path}.entity_id`,
        "Entity resource intent requires an entity_id.",
      );
    }

    if (!text(item.semantic_role)) {
      issue(
        issues,
        "warning",
        "entity_semantic_role_missing",
        `${path}.semantic_role`,
        "Entity resource intent should retain the Director semantic role.",
      );
    }

    if (!runtimeTargetSet.has(text(item.runtime_target))) {
      issue(
        issues,
        "error",
        "entity_runtime_target_invalid",
        `${path}.runtime_target`,
        "Entity runtime target is not recognized.",
      );
    }

    const modelRequirement = record(
      item.model_requirement,
    );
    if (modelRequirement) {
      const targetExtent =
        modelRequirement.target_extent_m;
      if (
        targetExtent !== null &&
        !finitePositive(targetExtent)
      ) {
        issue(
          issues,
          "error",
          "model_target_extent_invalid",
          `${path}.model_requirement.target_extent_m`,
          "Model target extent must be null or a positive finite number.",
        );
      }
    }
  });

  const duplicateIntentIds = duplicateValues(
    intentIds,
  );
  const duplicateEntityIds = duplicateValues(
    entityIds,
  );

  duplicateIntentIds.forEach((id) => {
    issue(
      issues,
      "error",
      "duplicate_resource_intent_id",
      "entity_intents",
      `Resource intent id ${id} is duplicated.`,
    );
  });

  duplicateEntityIds.forEach((id) => {
    issue(
      issues,
      "error",
      "duplicate_entity_resource_intent",
      "entity_intents",
      `Entity ${id} has more than one entity resource intent.`,
    );
  });

  const entityIdSet = new Set(entityIds);
  let unresolvedReferenceCount = 0;
  const surfaceKeys: string[] = [];

  surfaceIntents.forEach((value, index) => {
    const item = record(value);
    const path = `surface_intents[${index}]`;

    if (!item) {
      issue(
        issues,
        "error",
        "surface_intent_not_object",
        path,
        "Surface resource intent must be an object.",
      );
      return;
    }

    const intentId = text(item.intent_id);
    const targetEntityId = text(
      item.target_entity_id,
    );
    const materialSlot = text(
      item.material_slot,
    );

    if (intentId) intentIds.push(intentId);
    if (targetEntityId && materialSlot) {
      surfaceKeys.push(
        `${targetEntityId}::${materialSlot}`,
      );
    }

    if (!intentId) {
      issue(
        issues,
        "error",
        "surface_intent_id_missing",
        `${path}.intent_id`,
        "Surface resource intent requires an intent_id.",
      );
    }

    if (!targetEntityId) {
      issue(
        issues,
        "error",
        "surface_target_missing",
        `${path}.target_entity_id`,
        "Surface resource intent requires a target entity.",
      );
    } else if (!entityIdSet.has(targetEntityId)) {
      unresolvedReferenceCount += 1;
      issue(
        issues,
        "error",
        "surface_target_unknown",
        `${path}.target_entity_id`,
        `Surface resource intent references unknown entity ${targetEntityId}.`,
      );
    }

    if (!materialSlot) {
      issue(
        issues,
        "error",
        "material_slot_missing",
        `${path}.material_slot`,
        "Surface resource intent requires a material_slot.",
      );
    }

    if (!runtimeTargetSet.has(text(item.runtime_target))) {
      issue(
        issues,
        "error",
        "surface_runtime_target_invalid",
        `${path}.runtime_target`,
        "Surface runtime target is not recognized.",
      );
    }

    const materialRequirement = record(
      item.material_requirement,
    );
    if (!materialRequirement) {
      issue(
        issues,
        "error",
        "material_requirement_missing",
        `${path}.material_requirement`,
        "Surface resource intent requires a material requirement.",
      );
      return;
    }

    list(materialRequirement.required_maps).forEach(
      (map, mapIndex) => {
        if (!requiredMapSet.has(text(map))) {
          issue(
            issues,
            "error",
            "material_map_unknown",
            `${path}.material_requirement.required_maps[${mapIndex}]`,
            `Unknown material map ${String(map)}.`,
          );
        }
      },
    );

    if (
      !finitePositive(
        materialRequirement.max_resolution_px,
      )
    ) {
      issue(
        issues,
        "error",
        "material_resolution_invalid",
        `${path}.material_requirement.max_resolution_px`,
        "Material maximum resolution must be a positive finite number.",
      );
    }
  });

  duplicateValues(surfaceKeys).forEach((key) => {
    issue(
      issues,
      "error",
      "duplicate_surface_material_intent",
      "surface_intents",
      `Surface material target ${key} is duplicated.`,
    );
  });

  if (environmentIntent) {
    const intentId = text(environmentIntent.intent_id);
    if (intentId) intentIds.push(intentId);

    if (!intentId) {
      issue(
        issues,
        "error",
        "environment_intent_id_missing",
        "environment_intent.intent_id",
        "Environment resource intent requires an intent_id.",
      );
    }

    if (
      !runtimeTargetSet.has(
        text(environmentIntent.runtime_target),
      ) ||
      environmentIntent.runtime_target ===
        "authoring_only"
    ) {
      issue(
        issues,
        "error",
        "environment_runtime_target_invalid",
        "environment_intent.runtime_target",
        "Environment runtime target must be browser, blender, or both.",
      );
    }

    const environmentRequirement = record(
      environmentIntent.environment_requirement,
    );
    if (!environmentRequirement) {
      issue(
        issues,
        "error",
        "environment_requirement_missing",
        "environment_intent.environment_requirement",
        "Environment resource intent requires an environment requirement.",
      );
    } else if (
      !finitePositive(
        environmentRequirement.max_resolution_px,
      )
    ) {
      issue(
        issues,
        "error",
        "environment_resolution_invalid",
        "environment_intent.environment_requirement.max_resolution_px",
        "Environment maximum resolution must be a positive finite number.",
      );
    }
  }

  auxiliaryIntents.forEach((value, index) => {
    const item = record(value);
    const path = `auxiliary_intents[${index}]`;

    if (!item) {
      issue(
        issues,
        "error",
        "auxiliary_intent_not_object",
        path,
        "Auxiliary resource intent must be an object.",
      );
      return;
    }

    const intentId = text(item.intent_id);
    const kind = text(item.resource_kind);
    const targetEntityId = text(
      item.target_entity_id,
    );

    if (intentId) intentIds.push(intentId);

    if (!intentId) {
      issue(
        issues,
        "error",
        "auxiliary_intent_id_missing",
        `${path}.intent_id`,
        "Auxiliary resource intent requires an intent_id.",
      );
    }

    if (
      !resourceKindSet.has(kind) ||
      kind === "model" ||
      kind === "material" ||
      kind === "environment"
    ) {
      issue(
        issues,
        "error",
        "auxiliary_resource_kind_invalid",
        `${path}.resource_kind`,
        "Auxiliary resource kind must be a supported non-model, non-material, non-environment type.",
      );
    }

    if (!runtimeTargetSet.has(text(item.runtime_target))) {
      issue(
        issues,
        "error",
        "auxiliary_runtime_target_invalid",
        `${path}.runtime_target`,
        "Auxiliary runtime target is not recognized.",
      );
    }

    if (
      targetEntityId &&
      !entityIdSet.has(targetEntityId)
    ) {
      unresolvedReferenceCount += 1;
      issue(
        issues,
        "error",
        "auxiliary_target_unknown",
        `${path}.target_entity_id`,
        `Auxiliary resource intent references unknown entity ${targetEntityId}.`,
      );
    }
  });

  const allDuplicateIntentIds = duplicateValues(
    intentIds,
  );
  allDuplicateIntentIds.forEach((id) => {
    if (
      duplicateIntentIds.includes(id)
    ) {
      return;
    }
    issue(
      issues,
      "error",
      "duplicate_resource_intent_id",
      "$",
      `Resource intent id ${id} is duplicated across resource intent collections.`,
    );
  });

  if (!fallbackPolicy) {
    issue(
      issues,
      "error",
      "fallback_policy_missing",
      "fallback_policy",
      "Scene resource plan requires an explicit fallback policy.",
    );
  } else {
    if (
      !acquisitionPolicySet.has(
        text(
          fallbackPolicy.acquisition_policy,
        ),
      )
    ) {
      issue(
        issues,
        "error",
        "acquisition_policy_invalid",
        "fallback_policy.acquisition_policy",
        "Acquisition policy is not recognized.",
      );
    }

    if (
      fallbackPolicy.preserve_entity_ids !== true
    ) {
      issue(
        issues,
        "error",
        "entity_preservation_disabled",
        "fallback_policy.preserve_entity_ids",
        "Resource fallback must preserve stable Director entity ids.",
      );
    }
  }

  if (!performanceBudget) {
    issue(
      issues,
      "error",
      "performance_budget_missing",
      "performance_budget",
      "Scene resource plan requires an explicit performance budget.",
    );
  } else {
    [
      "max_models",
      "max_total_triangles",
      "max_texture_resolution_px",
      "max_hdri_resolution_px",
      "max_total_texture_bytes",
      "max_simultaneous_animated_models",
    ].forEach((field) => {
      if (!finitePositive(performanceBudget[field])) {
        issue(
          issues,
          "error",
          "performance_budget_value_invalid",
          `performance_budget.${field}`,
          `${field} must be a positive finite number.`,
        );
      }
    });
  }

  return {
    valid: !issues.some(
      (entry) => entry.severity === "error",
    ),
    entity_intent_count:
      entityIntents.length,
    surface_intent_count:
      surfaceIntents.length,
    auxiliary_intent_count:
      auxiliaryIntents.length,
    unresolved_reference_count:
      unresolvedReferenceCount,
    duplicate_intent_ids:
      allDuplicateIntentIds,
    duplicate_entity_ids:
      duplicateEntityIds,
    issues,
  };
}

export function isSceneResourcePlanV1(
  value: unknown,
): value is SceneResourcePlanV1 {
  return validateSceneResourcePlan(value).valid;
}
