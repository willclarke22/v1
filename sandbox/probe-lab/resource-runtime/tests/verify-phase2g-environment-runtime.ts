import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";

import type {
  AmbientCgCachedHdri,
  AmbientCgHdriRegistry,
} from "../../assets/catalog/ambientcg/ambientcg-types";
import {
  findReviewedEnvironmentByUrl,
} from "../environment-proxy.server";
import {
  fallbackRigLights,
  environmentFormatFromUrl,
  planBrowserEnvironmentTexture,
} from "../environment-runtime-policy";
import {
  hydrateRuntimeEnvironmentForBlender,
} from "../hydrate-runtime-environment-for-blender.server";
import {
  buildReviewedEnvironmentResolverSnapshot,
  isReviewedRuntimeEnvironment,
  resolveReviewedEnvironment,
} from "../reviewed-environment-resolver.server";

const bytes =
  new TextEncoder().encode(
    "phase-2g-reviewed-hdri",
  );

function hdri(
  overrides:
    Partial<AmbientCgCachedHdri> = {},
): AmbientCgCachedHdri {
  return {
    resource_id:
      "ambientcg_hdri_StudioSmall09_2k-hdr",
    source_asset_id:
      "StudioSmall09",
    source_type:
      "ambientcg",
    asset_type: "hdri",
    display_name:
      "Studio Small 09",
    source_url:
      "https://ambientcg.com/a/StudioSmall09",
    license: "CC0-1.0",
    attribution_required:
      false,
    commercial_use_allowed:
      true,
    raw_distribution_allowed:
      true,
    resolution: "2K",
    file_format: "HDR",
    variant_id:
      "2k-hdr-1",
    environment_url:
      "https://r2.example.test/runtime/hdri/StudioSmall09/2k/environment.hdr",
    environment_object_key:
      "runtime/hdri/StudioSmall09/2k/environment.hdr",
    thumbnail_url:
      "https://r2.example.test/runtime/hdri/StudioSmall09/thumbnail.jpg",
    semantic_tags: [
      "studio",
      "neutral",
      "indoor",
    ],
    content_sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    cached_at:
      "2026-07-30T00:00:00.000Z",
    published_to_r2:
      true,
    storage_provider:
      "r2",
    storage: {
      provider: "r2",
      runtime_prefix:
        "runtime/hdri/StudioSmall09/2k",
      manifest_url:
        "https://r2.example.test/runtime/hdri/StudioSmall09/2k/manifest.json",
      manifest_object_key:
        "runtime/hdri/StudioSmall09/2k/manifest.json",
      thumbnail_object_key:
        "runtime/hdri/StudioSmall09/thumbnail.jpg",
      source_metadata_object_key:
        "private/ambientcg/StudioSmall09/source.json",
      license_object_key:
        "private/ambientcg/StudioSmall09/license.json",
    },
    ...overrides,
  };
}

function registry(
  updatedAt: string,
  cachedAt: string,
): AmbientCgHdriRegistry {
  return {
    schema_version:
      "myway_ambientcg_hdri_registry_v1",
    updated_at:
      updatedAt,
    hdris: [
      hdri({
        cached_at:
          cachedAt,
      }),
      hdri({
        resource_id:
          "unpublished_environment",
        environment_url:
          "https://r2.example.test/unpublished.exr",
        environment_object_key:
          null,
        published_to_r2:
          false,
        storage_provider:
          "local",
        storage: {
          provider: "local",
          runtime_prefix:
            "public/local",
          manifest_url:
            null,
          manifest_object_key:
            null,
          thumbnail_object_key:
            null,
          source_metadata_object_key:
            null,
          license_object_key:
            null,
        },
      }),
    ],
  };
}

async function main() {
  assert.equal(
    environmentFormatFromUrl(
      "https://example.test/studio.HDR?version=1",
    ),
    "hdr",
  );
  assert.equal(
    environmentFormatFromUrl(
      "/sandbox-assets/myway/hdri/room.exr",
    ),
    "exr",
  );
  assert.equal(
    environmentFormatFromUrl(
      "https://example.test/room.jpg",
    ),
    null,
  );

  const halfFloat8kPlan =
    planBrowserEnvironmentTexture({
      source_width: 8192,
      source_height: 4096,
      channels: 4,
      bytes_per_channel: 2,
      max_texture_size: 16384,
      is_webgl2: true,
    });
  assert.equal(
    halfFloat8kPlan.target_width,
    4096,
  );
  assert.equal(
    halfFloat8kPlan.target_height,
    2048,
  );
  assert.equal(
    halfFloat8kPlan.downsampled,
    true,
  );

  const float8kPlan =
    planBrowserEnvironmentTexture({
      source_width: 8192,
      source_height: 4096,
      channels: 4,
      bytes_per_channel: 4,
      max_texture_size: 16384,
      is_webgl2: true,
    });
  assert.equal(
    float8kPlan.target_width,
    2048,
  );
  assert.equal(
    float8kPlan.target_height,
    1024,
  );

  const halfFloat4kPlan =
    planBrowserEnvironmentTexture({
      source_width: 4096,
      source_height: 2048,
      channels: 4,
      bytes_per_channel: 2,
      max_texture_size: 16384,
      is_webgl2: true,
    });
  assert.equal(
    halfFloat4kPlan.target_width,
    4096,
  );
  assert.equal(
    halfFloat4kPlan.downsampled,
    false,
  );

  const firstSnapshot =
    buildReviewedEnvironmentResolverSnapshot(
      registry(
        "2026-07-30T00:00:00.000Z",
        "2026-07-30T00:00:00.000Z",
      ),
    );
  const secondSnapshot =
    buildReviewedEnvironmentResolverSnapshot(
      registry(
        "2027-01-01T00:00:00.000Z",
        "2027-01-01T00:00:00.000Z",
      ),
    );

  assert.equal(
    firstSnapshot.registry_content_hash,
    secondSnapshot.registry_content_hash,
    "Mutable registry timestamps must not affect deterministic environment hashes.",
  );

  assert.equal(
    isReviewedRuntimeEnvironment(
      firstSnapshot.registry.hdris[0]!,
    ),
    true,
  );
  assert.equal(
    isReviewedRuntimeEnvironment(
      firstSnapshot.registry.hdris[1]!,
    ),
    false,
  );

  const resolved =
    resolveReviewedEnvironment(
      {
        preferred_environment_id:
          "ambientcg_hdri_StudioSmall09_2k-hdr",
        intent:
          "neutral studio lighting",
        background_mode:
          "solid_color",
      },
      firstSnapshot,
    );

  assert.equal(
    resolved.binding.lighting_mode,
    "hdri",
  );
  assert.equal(
    resolved.binding.format,
    "hdr",
  );
  assert.equal(
    resolved.diagnostics.acquisition_attempted,
    false,
  );
  assert.equal(
    resolved.diagnostics.selected_resource_id,
    "ambientcg_hdri_StudioSmall09_2k-hdr",
  );

  const fallback =
    resolveReviewedEnvironment(
      {
        force_fallback:
          true,
        fallback_rig:
          "diagrammatic_rig",
      },
      firstSnapshot,
    );

  assert.equal(
    fallback.binding.lighting_mode,
    "diagrammatic_rig",
  );
  assert.equal(
    fallback.binding.fallback.used,
    true,
  );
  assert.equal(
    fallback.binding.public_url,
    null,
  );

  const proxyMatch =
    findReviewedEnvironmentByUrl(
      firstSnapshot,
      firstSnapshot.registry.hdris[0]!
        .environment_url,
    );
  assert.equal(
    proxyMatch?.format,
    "hdr",
  );
  assert.equal(
    findReviewedEnvironmentByUrl(
      firstSnapshot,
      "https://attacker.invalid/environment.hdr",
    ),
    null,
  );

  const studioLights =
    fallbackRigLights(
      "studio_rig",
      {
        ambient: 0.5,
        key: 2,
        fill: 1,
        rim: 1.2,
      },
    );
  assert.equal(
    studioLights.some(
      (light) =>
        light.role ===
        "key" &&
        light.cast_shadow,
    ),
    true,
  );

  let fetchCount = 0;
  const mockFetch:
    typeof fetch = async () => {
      fetchCount += 1;
      return new Response(
        new Uint8Array(
          bytes,
        ),
        {
          status: 200,
          headers: {
            "content-type":
              "image/vnd.radiance",
          },
        },
      );
    };

  const hydrated =
    await hydrateRuntimeEnvironmentForBlender(
      resolved.binding,
      {
        fetch_impl:
          mockFetch,
      },
    );

  assert.equal(
    fetchCount,
    1,
  );
  assert.equal(
    hydrated.format,
    "hdr",
  );
  assert.equal(
    hydrated.visible_background,
    false,
  );
  assert.deepEqual(
    new Uint8Array(
      await readFile(
        hydrated.local_path,
      ),
    ),
    bytes,
  );

  await hydrated.cleanup();

  await assert.rejects(
    () =>
      access(
        hydrated.temporary_directory,
      ),
  );

  console.log(
    "Phase 2G environment runtime fixture passed.",
  );
}

void main();
