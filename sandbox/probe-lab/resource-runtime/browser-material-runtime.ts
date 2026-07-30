"use client";

import * as THREE from "three";

import {
  MATERIAL_ROLE_POLICY,
  normalScaleY,
  validateUnitFactor,
  validateUvPair,
} from "./material-map-policy";
import type {
  MaterialRuntimeMetrics,
  MaterialTextureMetric,
  MaterialTextureRole,
  RuntimeMaterialBindingV1,
} from "./material-runtime-contract";
import {
  acquireRuntimeTexture,
} from "./browser-texture-runtime";

export type RuntimeMaterialInstance = {
  material: THREE.MeshStandardMaterial;
  metrics: MaterialRuntimeMetrics;
  warnings: string[];
  release: () => void;
};

function applyTextureTransform(
  texture: THREE.Texture,
  binding: RuntimeMaterialBindingV1,
) {
  const transform =
    binding.uv_transform;

  texture.wrapS =
    THREE.RepeatWrapping;
  texture.wrapT =
    THREE.RepeatWrapping;
  texture.repeat.set(
    transform.repeat[0],
    transform.repeat[1],
  );
  texture.offset.set(
    transform.offset[0],
    transform.offset[1],
  );
  texture.center.set(
    transform.center[0],
    transform.center[1],
  );
  texture.rotation =
    transform.rotation_radians;
  texture.needsUpdate = true;
}

function validateBinding(
  binding: RuntimeMaterialBindingV1,
) {
  if (
    binding.schema_version !==
    "myway_material_runtime_v1"
  ) {
    throw new Error(
      "Unsupported runtime material schema.",
    );
  }

  if (
    !binding.target_entity_id.trim()
  ) {
    throw new Error(
      "Runtime material binding is missing target_entity_id.",
    );
  }

  validateUvPair(
    binding.uv_transform.repeat,
    "uv repeat",
  );
  validateUvPair(
    binding.uv_transform.offset,
    "uv offset",
  );
  validateUvPair(
    binding.uv_transform.center,
    "uv center",
  );
  validateUnitFactor(
    binding.parameters
      .roughness_factor,
    "roughness_factor",
  );
  validateUnitFactor(
    binding.parameters
      .metalness_factor,
    "metalness_factor",
  );
  validateUnitFactor(
    binding.parameters.opacity,
    "opacity",
  );

  if (
    binding.uv_transform.repeat.some(
      (value) => value === 0,
    )
  ) {
    throw new Error(
      "UV repeat values cannot be zero.",
    );
  }
}

function disposeTextureSet(
  material: THREE.Material,
) {
  const textures =
    new Set<THREE.Texture>();

  for (const value of Object.values(
    material as unknown as
      Record<string, unknown>,
  )) {
    if (
      value instanceof
      THREE.Texture
    ) {
      textures.add(value);
    }
  }

  textures.forEach((texture) =>
    texture.dispose(),
  );
}

export function disposeRuntimeMaterial(
  material: THREE.Material,
) {
  disposeTextureSet(material);
  material.dispose();
}

function cloneMaterialOwned(
  source: THREE.MeshStandardMaterial,
) {
  const clone =
    source.clone();
  const textureMap =
    new Map<
      THREE.Texture,
      THREE.Texture
    >();

  for (
    const [key, value] of
    Object.entries(
      clone as unknown as
        Record<string, unknown>,
    )
  ) {
    if (
      value instanceof
      THREE.Texture
    ) {
      const existing =
        textureMap.get(value);
      const texture =
        existing ??
        value.clone();

      if (!existing) {
        texture.needsUpdate =
          true;
        textureMap.set(
          value,
          texture,
        );
      }

      (
        clone as unknown as
          Record<string, unknown>
      )[key] = texture;
    }
  }

  return clone;
}

function ensureUv2(
  geometry: THREE.BufferGeometry,
) {
  const uv =
    geometry.getAttribute("uv");

  if (!uv) return;

  if (
    !geometry.getAttribute("uv1")
  ) {
    geometry.setAttribute(
      "uv1",
      uv,
    );
  }

  if (
    !geometry.getAttribute("uv2")
  ) {
    geometry.setAttribute(
      "uv2",
      uv,
    );
  }
}

function oldMaterials(
  scene: THREE.Object3D,
) {
  const materials =
    new Set<THREE.Material>();

  scene.traverse((object) => {
    if (
      !(object instanceof
        THREE.Mesh)
    ) {
      return;
    }

    const entries =
      Array.isArray(
        object.material,
      )
        ? object.material
        : [object.material];

    entries.forEach((entry) =>
      materials.add(entry),
    );
  });

  return materials;
}


function attachedMaterialMaps(
  material: THREE.MeshStandardMaterial,
): MaterialTextureRole[] {
  const roles:
    MaterialTextureRole[] = [];

  if (material.map) {
    roles.push("base_color");
  }
  if (material.normalMap) {
    roles.push("normal");
  }
  if (material.roughnessMap) {
    roles.push("roughness");
  }
  if (material.metalnessMap) {
    roles.push("metalness");
  }
  if (material.aoMap) {
    roles.push(
      "ambient_occlusion",
    );
  }
  if (material.alphaMap) {
    roles.push("opacity");
  }
  if (material.emissiveMap) {
    roles.push("emissive");
  }
  if (
    material.displacementMap &&
    material.displacementScale !==
      0
  ) {
    roles.push("height");
  }

  return roles;
}

function inspectSceneMaterials(
  scene: THREE.Object3D,
) {
  const meshNames =
    new Set<string>();
  const slotNames =
    new Set<string>();
  const meshesMissingUvs =
    new Set<string>();
  let discoveredMeshCount = 0;
  let discoveredSlotCount = 0;

  scene.traverse((object) => {
    if (
      !(object instanceof
        THREE.Mesh)
    ) {
      return;
    }

    discoveredMeshCount += 1;
    const meshName =
      object.name.trim() ||
      `mesh_${discoveredMeshCount}`;
    meshNames.add(meshName);

    if (
      !object.geometry.getAttribute(
        "uv",
      )
    ) {
      meshesMissingUvs.add(
        meshName,
      );
    }

    const entries =
      Array.isArray(
        object.material,
      )
        ? object.material
        : [object.material];

    discoveredSlotCount +=
      entries.length;
    entries.forEach(
      (material, index) => {
        slotNames.add(
          material.name.trim() ||
            `${meshName}:slot_${index}`,
        );
      },
    );
  });

  return {
    discovered_mesh_count:
      discoveredMeshCount,
    discovered_slot_count:
      discoveredSlotCount,
    mesh_names:
      Array.from(
        meshNames,
      ).sort(),
    material_slot_names:
      Array.from(
        slotNames,
      ).sort(),
    meshes_missing_uvs:
      Array.from(
        meshesMissingUvs,
      ).sort(),
  };
}

export function applyRuntimeMaterialToScene(
  scene: THREE.Object3D,
  source: THREE.MeshStandardMaterial,
  binding: RuntimeMaterialBindingV1,
) {
  const inspection =
    inspectSceneMaterials(
      scene,
    );

  if (
    binding.source_mode ===
    "preserve_original"
  ) {
    return {
      applied_mesh_count: 0,
      applied_slot_count: 0,
      warning: null,
      application: {
        source_mode:
          binding.source_mode,
        target_slot:
          binding.target_slot,
        ...inspection,
        applied_mesh_count: 0,
        applied_slot_count: 0,
        attached_maps: [],
      },
    };
  }

  const previous =
    oldMaterials(scene);
  let appliedMeshCount = 0;
  let appliedSlotCount = 0;
  let sourceUsed = false;
  const targetSlot =
    binding.target_slot?.trim() ??
    null;

  scene.traverse((object) => {
    if (
      !(object instanceof
        THREE.Mesh)
    ) {
      return;
    }

    ensureUv2(
      object.geometry,
    );

    if (
      binding.source_mode ===
      "replace_all"
    ) {
      object.material =
        sourceUsed
          ? cloneMaterialOwned(
              source,
            )
          : source;
      sourceUsed = true;
      appliedMeshCount += 1;
      appliedSlotCount +=
        Array.isArray(
          object.material,
        )
          ? object.material.length
          : 1;
      return;
    }

    if (
      binding.source_mode ===
        "replace_slot" &&
      targetSlot
    ) {
      const entries =
        Array.isArray(
          object.material,
        )
          ? object.material
          : [object.material];
      let matched = false;

      const replaced =
        entries.map(
          (material) => {
            if (
              material.name ===
                targetSlot ||
              object.name ===
                targetSlot
            ) {
              matched = true;
              appliedSlotCount += 1;
              return sourceUsed
                ? cloneMaterialOwned(
                    source,
                  )
                : source;
            }

            return material;
          },
        );

      if (matched) {
        sourceUsed = true;
        appliedMeshCount += 1;
        object.material =
          Array.isArray(
            object.material,
          )
            ? replaced
            : replaced[0];
      }
    }
  });

  if (
    binding.source_mode ===
      "replace_slot" &&
    appliedSlotCount === 0
  ) {
    throw new Error(
      `Material slot or mesh "${targetSlot ?? ""}" was not found.`,
    );
  }

  for (const material of
    previous) {
    if (
      !sceneUsesMaterial(
        scene,
        material,
      )
    ) {
      disposeRuntimeMaterial(
        material,
      );
    }
  }

  return {
    applied_mesh_count:
      appliedMeshCount,
    applied_slot_count:
      appliedSlotCount,
    warning:
      appliedMeshCount === 0
        ? "No compatible mesh received the material."
        : null,
    application: {
      source_mode:
        binding.source_mode,
      target_slot:
        binding.target_slot,
      ...inspection,
      applied_mesh_count:
        appliedMeshCount,
      applied_slot_count:
        appliedSlotCount,
      attached_maps:
        attachedMaterialMaps(
          source,
        ),
    },
  };
}

function sceneUsesMaterial(
  scene: THREE.Object3D,
  target: THREE.Material,
) {
  let found = false;

  scene.traverse((object) => {
    if (
      found ||
      !(object instanceof
        THREE.Mesh)
    ) {
      return;
    }

    const entries =
      Array.isArray(
        object.material,
      )
        ? object.material
        : [object.material];

    if (
      entries.includes(target)
    ) {
      found = true;
    }
  });

  return found;
}

export async function acquireRuntimeMaterial(
  binding: RuntimeMaterialBindingV1,
  options: {
    signal?: AbortSignal;
    simulate_failure_role?: MaterialTextureRole | null;
  } = {},
): Promise<RuntimeMaterialInstance> {
  validateBinding(binding);

  const startedAt =
    performance.now();
  const releases:
    Array<() => void> = [];
  const textureMetrics:
    MaterialTextureMetric[] =
      [];
  const warnings = [
    ...binding.warnings,
  ];
  const fallbackRoles:
    MaterialTextureRole[] =
      [];
  const textures: Partial<
    Record<
      MaterialTextureRole,
      THREE.Texture
    >
  > = {};

  const entries =
    (
      Object.entries(
        binding.maps,
      ) as Array<
        [
          MaterialTextureRole,
          NonNullable<
            RuntimeMaterialBindingV1["maps"][MaterialTextureRole]
          >,
        ]
      >
    ).filter(([role]) => {
      if (
        role === "height" &&
        binding.parameters
          .displacement_scale ===
          0
      ) {
        return false;
      }

      if (
        role === "emissive" &&
        binding.parameters
          .emissive_intensity ===
          0
      ) {
        return false;
      }

      if (
        role === "metalness" &&
        binding.parameters
          .metalness_factor ===
          0
      ) {
        return false;
      }

      return true;
    });

  for (const [role, map] of
    entries) {
    try {
      const acquired =
        await acquireRuntimeTexture(
          map,
          {
            signal:
              options.signal,
            simulate_failure:
              options.simulate_failure_role ===
              role,
          },
        );

      applyTextureTransform(
        acquired.texture,
        binding,
      );
      textures[role] =
        acquired.texture;
      releases.push(
        acquired.release,
      );
      textureMetrics.push({
        role,
        cache_key:
          acquired.cache_key,
        cache_hit:
          acquired.cache_hit,
        byte_size:
          acquired.byte_size,
        download_ms:
          acquired.download_ms,
        decode_ms:
          acquired.decode_ms,
        color_space:
          acquired.color_space,
      });
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      ) {
        releases.forEach(
          (release) =>
            release(),
        );
        Object.values(
          textures,
        ).forEach(
          (texture) =>
            texture?.dispose(),
        );
        throw error;
      }

      fallbackRoles.push(role);
      warnings.push(
        `${role} map fallback: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  const material =
    new THREE.MeshStandardMaterial({
      color:
        binding.parameters
          .base_color_factor,
      roughness:
        binding.parameters
          .roughness_factor,
      metalness:
        binding.parameters
          .metalness_factor,
      opacity:
        binding.parameters.opacity,
      transparent:
        binding.parameters.opacity <
          1 ||
        Boolean(
          textures.opacity,
        ),
      emissive:
        binding.parameters
          .emissive_color,
      emissiveIntensity:
        binding.parameters
          .emissive_intensity,
    });

  material.name =
    binding.material_resource_id;
  material.map =
    textures.base_color ??
    null;
  material.normalMap =
    textures.normal ?? null;
  material.normalScale.set(
    binding.parameters
      .normal_scale,
    binding.parameters
      .normal_scale *
      normalScaleY(
        binding.normal_map_convention,
      ),
  );
  material.roughnessMap =
    textures.roughness ??
    textures.orm ??
    null;
  material.metalnessMap =
    textures.metalness ??
    textures.orm ??
    null;
  material.aoMap =
    textures.ambient_occlusion ??
    textures.orm ??
    null;
  material.alphaMap =
    textures.opacity ?? null;
  material.emissiveMap =
    textures.emissive ?? null;
  material.displacementMap =
    textures.height ?? null;
  material.displacementScale =
    binding.parameters
      .displacement_scale;
  material.needsUpdate = true;

  if (!material.map) {
    material.color.set(
      "#94a3b8",
    );
    fallbackRoles.push(
      "base_color",
    );
    warnings.push(
      "Base-colour map unavailable; using the neutral declared fallback colour.",
    );
  }

  const uniqueKeys =
    new Set(
      textureMetrics.map(
        (metric) =>
          metric.cache_key,
      ),
    );
  const metrics: MaterialRuntimeMetrics =
    {
      material_resource_id:
        binding.material_resource_id,
      texture_count:
        textureMetrics.length,
      unique_texture_count:
        uniqueKeys.size,
      cache_hits:
        textureMetrics.filter(
          (metric) =>
            metric.cache_hit,
        ).length,
      cache_misses:
        textureMetrics.filter(
          (metric) =>
            !metric.cache_hit,
        ).length,
      total_bytes:
        Array.from(
          new Map(
            textureMetrics.map(
              (metric) => [
                metric.cache_key,
                metric.byte_size,
              ],
            ),
          ).values(),
        ).reduce(
          (sum, value) =>
            sum + value,
          0,
        ),
      total_ms:
        performance.now() -
        startedAt,
      texture_metrics:
        textureMetrics,
      fallback_roles:
        Array.from(
          new Set(
            fallbackRoles,
          ),
        ),
      applied_mesh_count: 0,
      applied_slot_count: 0,
      application: null,
    };

  let released = false;

  return {
    material,
    metrics,
    warnings,
    release: () => {
      if (released) return;
      released = true;
      releases.forEach(
        (release) =>
          release(),
      );
    },
  };
}