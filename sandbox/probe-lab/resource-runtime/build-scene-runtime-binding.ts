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
  type RuntimeScenePrimitiveBindingV1,
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

function thirdPartyAssetCredits(
  models: RuntimeModelBindingV1[],
) {
  const seen = new Set<string>();
  return models
    .filter(
      (model) =>
        model.license
          .attribution_required &&
        Boolean(
          model.license
            .attribution_text,
        ),
    )
    .map((model) => ({
      schema_version:
        "myway_third_party_asset_credit_v1" as const,
      asset_id: model.asset_id,
      asset_title:
        model.license.asset_title ??
        model.asset_id,
      creator_name:
        model.license.creator_name ??
        null,
      source_provider:
        model.license.source_provider ??
        null,
      source_asset_id:
        model.license.source_asset_id ??
        null,
      source_url:
        model.license.source_url,
      license_kind:
        model.license.license_kind as
          | "cc0"
          | "cc_by"
          | "cc_by_4_0"
          | "royalty_free"
          | "self_owned"
          | "unknown",
      license_name:
        model.license.license_name ??
        model.license.license_kind,
      license_version:
        model.license.license_version ??
        null,
      license_url:
        model.license.license_url ??
        null,
      attribution_text:
        model.license
          .attribution_text!,
      modification_notice:
        model.license
          .modification_notice ?? null,
    }))
    .filter((credit) => {
      const key = [
        credit.source_provider ?? "",
        credit.source_asset_id ?? "",
        credit.attribution_text,
      ].join("|").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type BuildRuntimeSceneBindingInput = {
  scene_id: string;
  source: RuntimeSceneSource;
  models: RuntimeModelBindingV1[];
  primitives?: RuntimeScenePrimitiveBindingV1[];
  fallback_actors?: Array<{
    entity_id: string;
    intent_id: string;
    label: string;
    required: boolean;
  }>;
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
      !actor.model &&
      !actor.primitive &&
      !actor.fallback_only
    ) {
      issues.push(
        `Actor ${actor.entity_id} has neither a model, primitive, nor declared fallback binding.`,
      );
    }
    if (
      actor.fallback_only &&
      (actor.model || actor.primitive)
    ) {
      issues.push(
        `Fallback-only actor ${actor.entity_id} cannot bind a model or primitive.`,
      );
    }
    if (actor.model && actor.primitive) {
      issues.push(
        `Actor ${actor.entity_id} cannot bind both a model and a primitive.`,
      );
    }
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
  const primitiveBindings =
    (input.primitives ?? []).map((primitive) => ({
      ...primitive,
      entity_id: cleanId(
        primitive.entity_id,
        "primitive entity_id",
      ),
      dimensions: [
        ...primitive.dimensions,
      ] as [number, number, number],
    }));
  const primitiveEntityIds =
    primitiveBindings.map(
      (primitive) => primitive.entity_id,
    );
  const fallbackActors =
    (input.fallback_actors ?? []).map((actor) => ({
      entity_id: cleanId(actor.entity_id, "fallback actor entity_id"),
      intent_id: cleanId(actor.intent_id, "fallback actor intent_id"),
      label: actor.label.trim() || "Reviewed model unavailable.",
      required: actor.required,
    }));
  const fallbackEntityIds =
    fallbackActors.map((actor) => actor.entity_id);
  const allEntityIds = [
    ...modelEntityIds,
    ...primitiveEntityIds,
    ...fallbackEntityIds,
  ];
  const duplicateEntityIds = allEntityIds.filter(
    (value, index) =>
      allEntityIds.indexOf(value) !== index,
  );
  if (duplicateEntityIds.length) {
    throw new Error(
      `Runtime scene actors contain duplicate Director entity ids: ${Array.from(
        new Set(duplicateEntityIds),
      ).join(", ")}.`,
    );
  }

  const required = new Set(
    input.required_entity_ids ?? allEntityIds,
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

  const modelActors = input.models.map((model, index) => {
    const override =
      input.actor_transforms?.[model.entity_id];
    const transform: RuntimeSceneActorTransform = {
      position: finiteTuple(
        override?.position,
        defaultActorPosition(index, allEntityIds.length),
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
      primitive: null,
      fallback_only: false,
      fallback_reason: null,
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

  const primitiveActors =
    primitiveBindings.map(
      (primitive, primitiveIndex) => {
        const actorIndex =
          input.models.length +
          primitiveIndex;
        const override =
          input.actor_transforms?.[
            primitive.entity_id
          ];
        const transform:
          RuntimeSceneActorTransform = {
            position: finiteTuple(
              override?.position,
              defaultActorPosition(
                actorIndex,
                allEntityIds.length,
              ),
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
          entity_id:
            primitive.entity_id,
          intent_id:
            `primitive_${primitive.entity_id}`,
          model: null,
          primitive,
          fallback_only: false,
          fallback_reason: null,
          material_binding_ids:
            materials
              .filter(
                (material) =>
                  material.target_entity_id ===
                  primitive.entity_id,
              )
              .map(
                (material) =>
                  material.material_binding_id,
              ),
          required:
            required.has(
              primitive.entity_id,
            ),
          transform,
          fallback_label: null,
        };
      },
    );

  const fallbackOnlyActors =
    fallbackActors.map(
      (fallbackActor, fallbackIndex) => {
        const actorIndex =
          input.models.length +
          primitiveBindings.length +
          fallbackIndex;
        const override =
          input.actor_transforms?.[
            fallbackActor.entity_id
          ];
        return {
          entity_id: fallbackActor.entity_id,
          intent_id: fallbackActor.intent_id,
          model: null,
          primitive: null,
          fallback_only: true,
          fallback_reason: fallbackActor.label,
          material_binding_ids: [],
          required: fallbackActor.required,
          transform: {
            position: finiteTuple(
              override?.position,
              defaultActorPosition(
                actorIndex,
                allEntityIds.length,
              ),
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
          },
          fallback_label: fallbackActor.label,
        };
      },
    );

  const actors = [
    ...modelActors,
    ...primitiveActors,
    ...fallbackOnlyActors,
  ];

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
    third_party_assets:
      thirdPartyAssetCredits(
        input.models,
      ),
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
