import assert from "node:assert/strict";
import { access } from "node:fs/promises";

import type {
  AmbientCgCachedMaterial,
  AmbientCgMaterialRegistry,
} from "../../assets/catalog/ambientcg/ambientcg-types";
import {
  MATERIAL_ROLE_POLICY,
  normalScaleY,
  uniqueTextureUrls,
} from "../material-map-policy";
import {
  resolveReviewedMaterialFromRegistry,
} from "../reviewed-material-resolver.server";
import {
  hydrateRuntimeMaterialForBlender,
} from "../hydrate-runtime-material-for-blender.server";

function material(
  input: {
    id: string;
    name: string;
    tags: string[];
    published?: boolean;
    baseColor?: string | null;
    metallic?: string | null;
    emission?: string | null;
  },
): AmbientCgCachedMaterial {
  return {
    resource_id: input.id,
    source_asset_id:
      input.id.replace(
        /^mat_/,
        "",
      ),
    source_type: "ambientcg",
    asset_type: "material",
    display_name: input.name,
    source_url:
      `https://ambientcg.com/view?id=${input.id}`,
    license: "CC0-1.0",
    attribution_required: false,
    commercial_use_allowed: true,
    raw_distribution_allowed: true,
    resolution: "2K",
    file_format: "PNG",
    variant_id: "2K-PNG",
    public_root:
      `https://assets.example.test/${input.id}`,
    thumbnail_url: null,
    maps: {
      base_color:
        input.baseColor ===
        undefined
          ? `https://assets.example.test/${input.id}/base_color.png`
          : input.baseColor,
      normal_gl:
        `https://assets.example.test/${input.id}/normal.png`,
      normal_dx: null,
      roughness:
        `https://assets.example.test/${input.id}/roughness.png`,
      metallic:
        input.metallic ??
        null,
      ambient_occlusion:
        `https://assets.example.test/${input.id}/ao.png`,
      height: null,
      opacity: null,
      emission:
        input.emission ??
        null,
    },
    physical_dimensions: null,
    semantic_tags:
      input.tags,
    content_sha256:
      "a".repeat(64),
    cached_at:
      "2026-07-30T00:00:00.000Z",
    published_to_r2:
      input.published ??
      true,
    storage_provider: "r2",
    storage: {
      provider: "r2",
      runtime_prefix:
        `runtime/materials/${input.id}`,
      manifest_url:
        `https://assets.example.test/${input.id}/manifest.json`,
      manifest_object_key:
        `runtime/materials/${input.id}/manifest.json`,
      thumbnail_object_key:
        null,
      source_metadata_object_key:
        null,
      license_object_key:
        null,
    },
  };
}

const registry: AmbientCgMaterialRegistry =
  {
    schema_version:
      "myway_ambientcg_material_registry_v1",
    updated_at:
      "2026-07-30T00:00:00.000Z",
    materials: [
      material({
        id: "mat_wood_oak",
        name: "Oak Wood",
        tags: [
          "wood",
          "oak",
          "floor",
        ],
      }),
      material({
        id: "mat_wood_pine",
        name: "Pine Wood",
        tags: [
          "wood",
          "pine",
        ],
      }),
      material({
        id: "mat_metal_emissive",
        name: "Metal Emissive",
        tags: [
          "metal",
          "emissive",
        ],
        metallic:
          "https://assets.example.test/mat_metal_emissive/metallic.png",
        emission:
          "https://assets.example.test/mat_metal_emissive/emission.png",
      }),
      material({
        id: "mat_unpublished",
        name: "Unpublished Wood",
        tags: ["wood"],
        published: false,
      }),
      material({
        id: "mat_missing_base",
        name: "Missing Base",
        tags: ["wood"],
        baseColor: null,
      }),
    ],
  };

const first =
  resolveReviewedMaterialFromRegistry(
    registry,
    {
      preferred_material_id:
        "mat_wood_oak",
      query: "wood",
      semantic_tags: [
        "wood",
      ],
      required_maps: [
        "base_color",
      ],
      target_entity_id:
        "actor_1",
      source_mode:
        "replace_all",
      uv_transform: {
        repeat: [2, 2],
      },
    },
    {
      resolved_at:
        "2026-07-30T00:00:00.000Z",
    },
  );

assert.equal(
  first.binding
    ?.material_resource_id,
  "mat_wood_oak",
);
assert.equal(
  first.binding
    ?.target_entity_id,
  "actor_1",
);
assert.equal(
  first.binding
    ?.maps.base_color
    ?.color_space,
  "srgb",
);
assert.equal(
  first.binding?.maps.normal
    ?.color_space,
  "linear",
);
assert.equal(
  first.binding?.parameters
    .metalness_factor,
  0,
);
assert.equal(
  first.binding?.parameters
    .emissive_color,
  "#000000",
);
assert.equal(
  first.binding?.parameters
    .emissive_intensity,
  0,
);
assert.equal(
  first.diagnostics
    .acquisition_attempted,
  false,
);
assert.equal(
  first.diagnostics
    .candidate_diagnostics.find(
      (candidate) =>
        candidate.resource_id ===
        "mat_unpublished",
    )?.eligible,
  false,
);
assert.equal(
  first.diagnostics
    .candidate_diagnostics.find(
      (candidate) =>
        candidate.resource_id ===
        "mat_missing_base",
    )?.eligible,
  false,
);

const metalEmissive =
  resolveReviewedMaterialFromRegistry(
    registry,
    {
      preferred_material_id:
        "mat_metal_emissive",
      required_maps: [
        "base_color",
      ],
      target_entity_id:
        "actor_2",
      source_mode:
        "replace_all",
    },
    {
      resolved_at:
        "2026-07-30T00:00:00.000Z",
    },
  );

assert.equal(
  metalEmissive.binding
    ?.parameters
    .metalness_factor,
  1,
);
assert.equal(
  metalEmissive.binding
    ?.parameters
    .emissive_color,
  "#ffffff",
);
assert.equal(
  metalEmissive.binding
    ?.parameters
    .emissive_intensity,
  1,
);

const registryWithMutableDates = {
  ...registry,
  updated_at:
    "2026-08-01T00:00:00.000Z",
  materials:
    registry.materials.map(
      (entry) => ({
        ...entry,
        cached_at:
          "2026-08-01T00:00:00.000Z",
      }),
    ),
};

const second =
  resolveReviewedMaterialFromRegistry(
    registryWithMutableDates,
    {
      preferred_material_id:
        "mat_wood_oak",
      query: "wood",
      semantic_tags: [
        "wood",
      ],
      required_maps: [
        "base_color",
      ],
      target_entity_id:
        "actor_1",
      source_mode:
        "replace_all",
      uv_transform: {
        repeat: [2, 2],
      },
    },
    {
      resolved_at:
        "2026-07-30T00:00:00.000Z",
    },
  );

assert.equal(
  second.binding
    ?.material_resource_id,
  first.binding
    ?.material_resource_id,
);
assert.equal(
  second.diagnostics
    .registry_content_hash,
  first.diagnostics
    .registry_content_hash,
);
assert.equal(
  second.diagnostics
    .request_hash,
  first.diagnostics
    .request_hash,
);

assert.equal(
  MATERIAL_ROLE_POLICY
    .base_color.color_space,
  "srgb",
);
assert.equal(
  MATERIAL_ROLE_POLICY
    .emissive.color_space,
  "srgb",
);
assert.equal(
  MATERIAL_ROLE_POLICY
    .roughness.color_space,
  "linear",
);
assert.equal(
  MATERIAL_ROLE_POLICY
    .normal.color_space,
  "linear",
);
assert.equal(
  normalScaleY("opengl"),
  1,
);
assert.equal(
  normalScaleY("directx"),
  -1,
);
assert.deepEqual(
  uniqueTextureUrls({
    orm: {
      public_url:
        "https://assets.example.test/orm.png",
    },
    roughness: {
      public_url:
        "https://assets.example.test/orm.png",
    },
    metalness: {
      public_url:
        "https://assets.example.test/orm.png",
    },
  }),
  [
    "https://assets.example.test/orm.png",
  ],
);

async function verifyBlenderHydration() {
  assert.ok(first.binding);

  const hydration =
    await hydrateRuntimeMaterialForBlender(
      first.binding,
      {
        fetch_impl: async () =>
          new Response(
            new Uint8Array([
              137,
              80,
              78,
              71,
            ]),
            {
              status: 200,
              headers: {
                "content-type":
                  "image/png",
              },
            },
          ),
      },
    );

  assert.ok(
    hydration.files.length >= 3,
  );
  assert.equal(
    hydration.files.find(
      (file) =>
        file.role ===
        "base_color",
    )?.blender_color_space,
    "sRGB",
  );
  assert.equal(
    hydration.files.find(
      (file) =>
        file.role ===
        "roughness",
    )?.blender_color_space,
    "Non-Color",
  );

  const temporaryDirectory =
    hydration.temporary_directory;
  await access(
    temporaryDirectory,
  );
  await hydration.cleanup();
  await assert.rejects(
    access(temporaryDirectory),
  );
}

verifyBlenderHydration()
  .then(() => {
    console.log(
      "Phase 2F material runtime fixture passed.",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });