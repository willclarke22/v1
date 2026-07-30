import type {
  AmbientCgCachedMaterial,
  AmbientCgMaterialRegistry,
  AmbientCgMaterialMaps,
} from "../assets/catalog/ambientcg/ambientcg-types";
import {
  stableJsonHash,
} from "../assets/content-hash.server";
import {
  MATERIAL_ROLE_POLICY,
} from "./material-map-policy";
import {
  MATERIAL_RUNTIME_SCHEMA_VERSION,
  type MaterialCandidateDiagnostic,
  type MaterialResolveDiagnostics,
  type MaterialTextureRole,
  type RuntimeMaterialBindingV1,
  type RuntimeMaterialParameters,
  type RuntimeMaterialSourceMode,
  type RuntimeMaterialUvTransform,
  type RuntimeTextureBindingV1,
} from "./material-runtime-contract";

export const REVIEWED_MATERIAL_RESOLVER_VERSION =
  "myway_reviewed_material_resolver_v1_1" as const;

export type ReviewedMaterialResolverRequest = {
  preferred_material_id?: string | null;
  query?: string | null;
  semantic_tags?: string[];
  required_maps?: MaterialTextureRole[];
  target_entity_id: string;
  target_slot?: string | null;
  source_mode?: RuntimeMaterialSourceMode;
  uv_transform?: Partial<RuntimeMaterialUvTransform>;
  parameters?: Partial<RuntimeMaterialParameters>;
};

export type ReviewedMaterialResolverSnapshot = {
  registry: AmbientCgMaterialRegistry;
  registry_snapshot_id: string;
  registry_content_hash: string;
};

export type ReviewedMaterialResolution = {
  binding: RuntimeMaterialBindingV1 | null;
  diagnostics: MaterialResolveDiagnostics;
};

function normalizedTokens(
  values: Array<
    string | null | undefined
  >,
) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          (value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .split(/\s+/),
        )
        .filter(
          (value) =>
            value.length > 1,
        ),
    ),
  ).sort();
}

function storageProvider(
  material: AmbientCgCachedMaterial,
) {
  return (
    material.storage?.provider ??
    material.storage_provider ??
    "local"
  );
}

function mapRoleUrl(
  maps: AmbientCgMaterialMaps,
  role: MaterialTextureRole,
) {
  switch (role) {
    case "base_color":
      return maps.base_color;
    case "normal":
      return (
        maps.normal_gl ??
        maps.normal_dx
      );
    case "roughness":
      return maps.roughness;
    case "metalness":
      return maps.metallic;
    case "ambient_occlusion":
      return maps.ambient_occlusion;
    case "opacity":
      return maps.opacity;
    case "emissive":
      return maps.emission;
    case "height":
      return maps.height;
    case "orm":
      return null;
  }
}

function eligibleMaterial(
  material: AmbientCgCachedMaterial,
) {
  const reasons: string[] = [];

  if (
    material.asset_type !==
    "material"
  ) {
    reasons.push(
      "resource is not a material",
    );
  }

  if (
    material.license !==
    "CC0-1.0"
  ) {
    reasons.push(
      "license is not CC0-1.0",
    );
  }

  if (
    material.published_to_r2 !==
    true ||
    storageProvider(material) !==
      "r2"
  ) {
    reasons.push(
      "material is not published to authoritative R2 storage",
    );
  }

  if (
    !material.content_sha256?.trim()
  ) {
    reasons.push(
      "material content hash is missing",
    );
  }

  if (
    !material.maps.base_color ||
    !/^https:\/\//i.test(
      material.maps.base_color,
    )
  ) {
    reasons.push(
      "an HTTPS base-colour map is required",
    );
  }

  for (const url of Object.values(
    material.maps,
  )) {
    if (
      url &&
      !/^https:\/\//i.test(url)
    ) {
      reasons.push(
        "all published material maps must use HTTPS",
      );
      break;
    }
  }

  return reasons;
}

function registryFingerprint(
  registry: AmbientCgMaterialRegistry,
) {
  return {
    schema_version:
      registry.schema_version,
    materials: registry.materials
      .map((material) => ({
        resource_id:
          material.resource_id,
        source_asset_id:
          material.source_asset_id,
        display_name:
          material.display_name,
        resolution:
          material.resolution,
        variant_id:
          material.variant_id,
        maps: material.maps,
        map_object_keys:
          material.map_object_keys ??
          {},
        semantic_tags:
          [...material.semantic_tags].sort(),
        content_sha256:
          material.content_sha256,
        published_to_r2:
          material.published_to_r2,
        storage_provider:
          storageProvider(material),
        license: material.license,
      }))
      .sort((left, right) =>
        left.resource_id.localeCompare(
          right.resource_id,
        ),
      ),
  };
}

export async function loadReviewedMaterialResolverSnapshot():
  Promise<ReviewedMaterialResolverSnapshot> {
  const {
    readAmbientCgMaterialRegistry,
  } = await import(
    "../assets/catalog/ambientcg/ambientcg-store.server"
  );
  const registry =
    await readAmbientCgMaterialRegistry();
  const fingerprint =
    registryFingerprint(registry);
  const registryContentHash =
    stableJsonHash(fingerprint);

  return {
    registry,
    registry_content_hash:
      registryContentHash,
    registry_snapshot_id:
      `ambientcg-materials:${registryContentHash.slice(0, 16)}`,
  };
}

function defaultUvTransform(
  partial:
    | Partial<RuntimeMaterialUvTransform>
    | undefined,
): RuntimeMaterialUvTransform {
  return {
    repeat:
      partial?.repeat ?? [1, 1],
    offset:
      partial?.offset ?? [0, 0],
    rotation_radians:
      partial?.rotation_radians ??
      0,
    center:
      partial?.center ?? [0.5, 0.5],
  };
}

function defaultParameters(
  partial:
    | Partial<RuntimeMaterialParameters>
    | undefined,
  material?:
    | AmbientCgCachedMaterial
    | null,
): RuntimeMaterialParameters {
  const hasMetalnessMap =
    Boolean(
      material?.maps.metallic,
    );
  const hasEmissiveMap =
    Boolean(
      material?.maps.emission,
    );

  return {
    base_color_factor:
      partial?.base_color_factor ??
      "#ffffff",
    roughness_factor:
      partial?.roughness_factor ??
      1,
    metalness_factor:
      partial?.metalness_factor ??
      (hasMetalnessMap
        ? 1
        : 0),
    opacity:
      partial?.opacity ?? 1,
    emissive_color:
      partial?.emissive_color ??
      (hasEmissiveMap
        ? "#ffffff"
        : "#000000"),
    emissive_intensity:
      partial?.emissive_intensity ??
      (hasEmissiveMap
        ? 1
        : 0),
    normal_scale:
      partial?.normal_scale ??
      1,
    displacement_scale:
      partial?.displacement_scale ??
      0,
  };
}

function objectKeyForRole(
  material: AmbientCgCachedMaterial,
  role: MaterialTextureRole,
) {
  const keys =
    material.map_object_keys ?? {};

  switch (role) {
    case "base_color":
      return keys.base_color ?? null;
    case "normal":
      return (
        keys.normal_gl ??
        keys.normal_dx ??
        null
      );
    case "roughness":
      return keys.roughness ?? null;
    case "metalness":
      return keys.metallic ?? null;
    case "ambient_occlusion":
      return (
        keys.ambient_occlusion ??
        null
      );
    case "opacity":
      return keys.opacity ?? null;
    case "emissive":
      return keys.emission ?? null;
    case "height":
      return keys.height ?? null;
    case "orm":
      return null;
  }
}

function runtimeMaps(
  material: AmbientCgCachedMaterial,
) {
  const result: Partial<
    Record<
      MaterialTextureRole,
      RuntimeTextureBindingV1
    >
  > = {};

  for (const role of [
    "base_color",
    "roughness",
    "metalness",
    "ambient_occlusion",
    "opacity",
    "emissive",
    "height",
  ] as MaterialTextureRole[]) {
    const publicUrl =
      mapRoleUrl(
        material.maps,
        role,
      );

    if (!publicUrl) continue;

    result[role] = {
      role,
      public_url: publicUrl,
      object_key:
        objectKeyForRole(
          material,
          role,
        ),
      content_hash: null,
      color_space:
        MATERIAL_ROLE_POLICY[role]
          .color_space,
      channel:
        MATERIAL_ROLE_POLICY[role]
          .channel,
    };
  }

  const normalUrl =
    material.maps.normal_gl ??
    material.maps.normal_dx;

  if (normalUrl) {
    result.normal = {
      role: "normal",
      public_url: normalUrl,
      object_key:
        objectKeyForRole(
          material,
          "normal",
        ),
      content_hash: null,
      color_space: "linear",
      channel: "rgb",
    };
  }

  return result;
}

function normalConvention(
  material: AmbientCgCachedMaterial,
) {
  if (material.maps.normal_gl) {
    return "opengl" as const;
  }

  if (material.maps.normal_dx) {
    return "directx" as const;
  }

  return "none" as const;
}

function materialBinding(
  material: AmbientCgCachedMaterial,
  request: ReviewedMaterialResolverRequest,
  snapshot: ReviewedMaterialResolverSnapshot,
  requestHash: string,
  resolvedAt: string,
): RuntimeMaterialBindingV1 {
  return {
    schema_version:
      MATERIAL_RUNTIME_SCHEMA_VERSION,
    resource_kind: "material",
    material_binding_id:
      `material:${request.target_entity_id}:${material.resource_id}`,
    material_resource_id:
      material.resource_id,
    variant_id:
      material.variant_id,
    content_hash:
      material.content_sha256,
    target_entity_id:
      request.target_entity_id,
    target_slot:
      request.target_slot?.trim() ||
      null,
    source_mode:
      request.source_mode ??
      "primitive_surface",
    display_name:
      material.display_name,
    resolution:
      material.resolution,
    normal_map_convention:
      normalConvention(material),
    maps: runtimeMaps(material),
    parameters:
      defaultParameters(
        request.parameters,
        material,
      ),
    uv_transform:
      defaultUvTransform(
        request.uv_transform,
      ),
    registry_snapshot_id:
      snapshot.registry_snapshot_id,
    registry_content_hash:
      snapshot.registry_content_hash,
    request_hash: requestHash,
    resolver_version:
      REVIEWED_MATERIAL_RESOLVER_VERSION,
    resolved_at: resolvedAt,
    provenance: {
      source_type: "ambientcg",
      source_asset_id:
        material.source_asset_id,
      source_url:
        material.source_url,
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
    },
    warnings: [],
  };
}

export function resolveReviewedMaterialFromRegistry(
  registry: AmbientCgMaterialRegistry,
  request: ReviewedMaterialResolverRequest,
  options: {
    resolved_at?: string;
  } = {},
): ReviewedMaterialResolution {
  const fingerprint =
    registryFingerprint(registry);
  const registryContentHash =
    stableJsonHash(fingerprint);
  const snapshot: ReviewedMaterialResolverSnapshot =
    {
      registry,
      registry_content_hash:
        registryContentHash,
      registry_snapshot_id:
        `ambientcg-materials:${registryContentHash.slice(0, 16)}`,
    };
  return resolveReviewedMaterialWithSnapshot(
    snapshot,
    request,
    options,
  );
}

export function resolveReviewedMaterialWithSnapshot(
  snapshot: ReviewedMaterialResolverSnapshot,
  request: ReviewedMaterialResolverRequest,
  options: {
    resolved_at?: string;
  } = {},
): ReviewedMaterialResolution {
  if (
    !request.target_entity_id?.trim()
  ) {
    throw new Error(
      "A target_entity_id is required for material resolution.",
    );
  }

  const requestShape = {
    preferred_material_id:
      request.preferred_material_id ??
      null,
    query: request.query ?? null,
    semantic_tags: [
      ...(request.semantic_tags ??
        []),
    ].sort(),
    required_maps: [
      ...(request.required_maps ??
        []),
    ].sort(),
    target_entity_id:
      request.target_entity_id,
    target_slot:
      request.target_slot ??
      null,
    source_mode:
      request.source_mode ??
      "primitive_surface",
    uv_transform:
      defaultUvTransform(
        request.uv_transform,
      ),
    parameters:
      defaultParameters(
        request.parameters,
      ),
  };
  const requestHash =
    stableJsonHash(requestShape);
  const queryTokens =
    normalizedTokens([
      request.query,
      ...(request.semantic_tags ??
        []),
    ]);
  const requiredMaps =
    request.required_maps ?? [
      "base_color",
    ];

  const candidateDiagnostics: MaterialCandidateDiagnostic[] =
    snapshot.registry.materials
      .map((material) => {
        const rejected =
          eligibleMaterial(material);
        const missingMaps =
          requiredMaps.filter(
            (role) =>
              !mapRoleUrl(
                material.maps,
                role,
              ),
          );

        if (missingMaps.length) {
          rejected.push(
            `missing required maps: ${missingMaps.join(", ")}`,
          );
        }

        const materialTokens =
          normalizedTokens([
            material.display_name,
            material.source_asset_id,
            ...material.semantic_tags,
          ]);
        const overlap =
          queryTokens.filter(
            (token) =>
              materialTokens.includes(
                token,
              ),
          ).length;
        let score =
          overlap * 20 +
          Object.values(
            material.maps,
          ).filter(Boolean).length;

        const reasons: string[] = [];

        if (
          request.preferred_material_id ===
          material.resource_id
        ) {
          score += 1000;
          reasons.push(
            "explicit preferred material id",
          );
        }

        if (overlap > 0) {
          reasons.push(
            `${overlap} semantic token matches`,
          );
        }

        reasons.push(
          `${Object.values(material.maps).filter(Boolean).length} available maps`,
        );

        return {
          resource_id:
            material.resource_id,
          eligible:
            rejected.length === 0,
          score,
          reasons,
          rejected_reasons:
            rejected,
        };
      })
      .sort((left, right) => {
        if (
          left.eligible !==
          right.eligible
        ) {
          return left.eligible
            ? -1
            : 1;
        }

        if (
          right.score !==
          left.score
        ) {
          return (
            right.score -
            left.score
          );
        }

        return left.resource_id.localeCompare(
          right.resource_id,
        );
      });

  const winner =
    candidateDiagnostics.find(
      (candidate) =>
        candidate.eligible,
    );
  const material = winner
    ? snapshot.registry.materials.find(
        (entry) =>
          entry.resource_id ===
          winner.resource_id,
      ) ?? null
    : null;
  const resolvedAt =
    options.resolved_at ??
    new Date().toISOString();

  return {
    binding: material
      ? materialBinding(
          material,
          request,
          snapshot,
          requestHash,
          resolvedAt,
        )
      : null,
    diagnostics: {
      resolver_version:
        REVIEWED_MATERIAL_RESOLVER_VERSION,
      registry_snapshot_id:
        snapshot.registry_snapshot_id,
      registry_content_hash:
        snapshot.registry_content_hash,
      request_hash:
        requestHash,
      selected_resource_id:
        material?.resource_id ??
        null,
      candidate_diagnostics:
        candidateDiagnostics,
      acquisition_attempted: false,
    },
  };
}

export async function resolveReviewedMaterial(
  request: ReviewedMaterialResolverRequest,
  options: {
    snapshot?: ReviewedMaterialResolverSnapshot;
    resolved_at?: string;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadReviewedMaterialResolverSnapshot());

  return resolveReviewedMaterialWithSnapshot(
    snapshot,
    request,
    {
      resolved_at:
        options.resolved_at,
    },
  );
}

export function isReviewedRuntimeMaterial(
  material: AmbientCgCachedMaterial,
) {
  return eligibleMaterial(material)
    .length === 0;
}