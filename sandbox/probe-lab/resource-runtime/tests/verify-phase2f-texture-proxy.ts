import assert from "node:assert/strict";

import type {
  AmbientCgMaterialRegistry,
} from "../../assets/catalog/ambientcg/ambientcg-types";
import {
  stableJsonHash,
} from "../../assets/content-hash.server";
import {
  findReviewedMaterialTextureByUrl,
} from "../material-texture-proxy.server";

const approvedUrl =
  "https://assets.example.test/materials/wood/basecolor.jpg";

const registry: AmbientCgMaterialRegistry = {
  schema_version:
    "myway_ambientcg_material_registry_v1",
  updated_at: null,
  materials: [
    {
      resource_id: "wood_material",
      source_asset_id: "Wood001",
      source_type: "ambientcg",
      asset_type: "material",
      display_name: "Wood",
      source_url:
        "https://ambientcg.com/view?id=Wood001",
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
      resolution: "2K",
      file_format: "jpg",
      variant_id: "2K-JPG",
      public_root:
        "https://assets.example.test/materials/wood",
      thumbnail_url: null,
      maps: {
        base_color: approvedUrl,
        normal_gl: null,
        normal_dx: null,
        roughness: null,
        metallic: null,
        ambient_occlusion: null,
        height: null,
        opacity: null,
        emission: null,
      },
      physical_dimensions: null,
      semantic_tags: ["wood"],
      content_sha256: "a".repeat(64),
      cached_at: "2026-07-30T00:00:00.000Z",
      published_to_r2: true,
      storage_provider: "r2",
      storage: {
        provider: "r2",
        runtime_prefix: "materials/wood",
        manifest_url: null,
        manifest_object_key: null,
        thumbnail_object_key: null,
        source_metadata_object_key: null,
        license_object_key: null,
      },
    },
  ],
};

const fingerprint = {
  schema_version: registry.schema_version,
  materials: registry.materials,
};
const hash = stableJsonHash(fingerprint);
const snapshot = {
  registry,
  registry_snapshot_id:
    `fixture:${hash.slice(0, 16)}`,
  registry_content_hash: hash,
};

const approved =
  findReviewedMaterialTextureByUrl(
    snapshot,
    approvedUrl,
  );
assert.equal(
  approved?.resource_id,
  "wood_material",
);
assert.equal(
  approved?.role,
  "base_color",
);
assert.equal(
  findReviewedMaterialTextureByUrl(
    snapshot,
    "https://untrusted.example.test/texture.jpg",
  ),
  null,
);
assert.equal(
  findReviewedMaterialTextureByUrl(
    snapshot,
    "file:///tmp/texture.jpg",
  ),
  null,
);

console.log(
  "Phase 2F texture proxy fixture passed.",
);
