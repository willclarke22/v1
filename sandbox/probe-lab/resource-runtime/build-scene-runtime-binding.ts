import {
  DEFAULT_ENVIRONMENT_SHADOW_POLICY,
  type RuntimeEnvironmentBindingV1,
} from "./environment-runtime-contract";
import type {
  RuntimeMaterialBindingV1,
} from "./material-runtime-contract";
import {
  DEFAULT_RUNTIME_SCENE_FALLBACK_POLICY,
  SCENE_RUNTIME_SCHEMA_VERSION,
  type RuntimeSceneActorTransform,
  type RuntimeSceneBindingV1,
  type RuntimeSceneFallbackPolicy,
  type RuntimeSceneSource,
} from "./scene-runtime-contract";
import type {
  RuntimeModelBindingV1,
} from "./resource-runtime-contract";

export const SCENE_RUNTIME_ADAPTER_VERSION =
  "myway_scene_runtime_adapter_v1" as const;

const DEFAULT_TRANSFORM: RuntimeSceneActorTransform = {
  position: [0, 0, 0],
  rotation_radians: [0, 0, 0],
  scale: 1,
};

function cleanId(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`${label} cannot be empty.`);
  }
  return cleaned;
}

function finiteTuple(
  value: [number, number, number] | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (
    value &&
    value.length === 3 &&
    value.every(Number.isFinite)
  ) {
    return [...value] as [number, number, number];
  }
  return [...fallback];
}

function defaultActorPosition(
  index: number,
  count: number,
): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  const spacing = 3.2;
  return [
    (index - (count - 1) / 2) * spacing,
    0,
    0,
  ];
}

export type BuildRuntimeSceneBindingInput = {
  scene_id: string;
  source: RuntimeSceneSource;
  models: RuntimeModelBindingV1[];
  materials?: RuntimeMaterialBindingV1[];
  environment?: RuntimeEnvironmentBindingV1 | null;
  actor_transforms?: Record<
    string,
    Partial<RuntimeSceneActorTransform>
  >;
  required_entity_ids?: string[];
  fallback_labels?: Record<string, string>;
  fallback_policy?: Partial<RuntimeSceneFallbackPolicy>;
  created_at?: string;
  warnings?: string[];
};

export function validateRuntimeSceneBinding(
  binding: RuntimeSceneBindingV1,
) {
  const issues: string[] = [];

  if (
    binding.schema_version !==
    SCENE_RUNTIME_SCHEMA_VERSION
  ) {
    issues.push("Unsupported scene runtime schema.");
  }
  if (!binding.scene_id.trim()) {
    issues.push("scene_id is required.");
  }

  const entityIds = binding.actors.map(
    (actor) => actor.entity_id,
  );
  const duplicateEntityIds = entityIds.filter(
    (value, index) =>
      entityIds.indexOf(value) !== index,
  );
  if (duplicateEntityIds.length) {
    issues.push(
      `Duplicate actor entity ids: ${Array.from(
        new Set(duplicateEntityIds),
      ).join(", ")}.`,
    );
  }

  const materialIds = binding.materials.map(
    (material) => material.material_binding_id,
  );
  const duplicateMaterialIds = materialIds.filter(
    (value, index) =>
      materialIds.indexOf(value) !== index,
  );
  if (duplicateMaterialIds.length) {
    issues.push(
      `Duplicate material binding ids: ${Array.from(
        new Set(duplicateMaterialIds),
      ).join(", ")}.`,
    );
  }

  const entitySet = new Set(entityIds);
  for (const material of binding.materials) {
    if (!entitySet.has(material.target_entity_id)) {
      issues.push(
        `Material ${material.material_binding_id} targets missing entity ${material.target_entity_id}.`,
      );
    }
  }

  for (const actor of binding.actors) {
    if (
      actor.model &&
      actor.model.entity_id !== actor.entity_id
    ) {
      issues.push(
        `Actor ${actor.entity_id} does not match model entity ${actor.model.entity_id}.`,
      );
    }
    for (const materialId of actor.material_binding_ids) {
      if (!materialIds.includes(materialId)) {
        issues.push(
          `Actor ${actor.entity_id} references missing material binding ${materialId}.`,
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function buildRuntimeSceneBinding(
  input: BuildRuntimeSceneBindingInput,
): RuntimeSceneBindingV1 {
  const sceneId = cleanId(input.scene_id, "scene_id");
  const modelEntityIds = input.models.map((model) =>
    cleanId(model.entity_id, "model entity_id"),
  );
  const duplicateModelIds = modelEntityIds.filter(
    (value, index) =>
      modelEntityIds.indexOf(value) !== index,
  );
  if (duplicateModelIds.length) {
    throw new Error(
      `Runtime scene models contain duplicate Director entity ids: ${Array.from(
        new Set(duplicateModelIds),
      ).join(", ")}.`,
    );
  }

  const required = new Set(
    input.required_entity_ids ?? modelEntityIds,
  );
  const materials: RuntimeMaterialBindingV1[] =
    (input.materials ?? []).map((material) => ({
      ...material,
      maps: { ...material.maps },
      parameters: { ...material.parameters },
      uv_transform: {
        ...material.uv_transform,
        repeat: [
          ...material.uv_transform.repeat,
        ] as [number, number],
        offset: [
          ...material.uv_transform.offset,
        ] as [number, number],
        center: [
          ...material.uv_transform.center,
        ] as [number, number],
      },
      warnings: [...material.warnings],
    }));

  const actors = input.models.map((model, index) => {
    const override =
      input.actor_transforms?.[model.entity_id];
    const transform: RuntimeSceneActorTransform = {
      position: finiteTuple(
        override?.position,
        defaultActorPosition(index, input.models.length),
      ),
      rotation_radians: finiteTuple(
        override?.rotation_radians,
        DEFAULT_TRANSFORM.rotation_radians,
      ),
      scale:
        typeof override?.scale === "number" &&
        Number.isFinite(override.scale) &&
        override.scale > 0
          ? override.scale
          : 1,
    };

    return {
      entity_id: model.entity_id,
      intent_id: model.intent_id,
      model: {
        ...model,
        scene_id: sceneId,
      },
      material_binding_ids: materials
        .filter(
          (material) =>
            material.target_entity_id === model.entity_id,
        )
        .map((material) => material.material_binding_id),
      required: required.has(model.entity_id),
      transform,
      fallback_label:
        input.fallback_labels?.[model.entity_id] ??
        model.fallback?.reason ??
        null,
    };
  });

  const environment = input.environment
    ? {
        ...input.environment,
        shadow_policy: {
          ...input.environment.shadow_policy,
        },
        fallback: {
          ...input.environment.fallback,
        },
        provenance: {
          ...input.environment.provenance,
        },
        warnings: [...input.environment.warnings],
      }
    : null;

  const binding: RuntimeSceneBindingV1 = {
    schema_version: SCENE_RUNTIME_SCHEMA_VERSION,
    scene_id: sceneId,
    source: input.source,
    actors,
    materials,
    environment,
    renderer: {
      tone_mapping: "ACESFilmic",
      output_color_space: "srgb",
      exposure: environment?.exposure ?? 1,
      shadows_enabled:
        environment?.shadow_policy.enabled ?? true,
      shadow_policy: {
        ...(environment?.shadow_policy ??
          DEFAULT_ENVIRONMENT_SHADOW_POLICY),
      },
    },
    fallback_policy: {
      ...DEFAULT_RUNTIME_SCENE_FALLBACK_POLICY,
      ...input.fallback_policy,
      preserve_entity_ids: true,
      preserve_direction: true,
    },
    created_at:
      input.created_at ?? new Date().toISOString(),
    adapter_version: SCENE_RUNTIME_ADAPTER_VERSION,
    warnings: [...(input.warnings ?? [])],
  };

  const validation = validateRuntimeSceneBinding(binding);
  if (!validation.valid) {
    throw new Error(
      `Runtime scene binding is invalid: ${validation.issues.join(
        "; ",
      )}`,
    );
  }

  return binding;
}
