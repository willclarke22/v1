import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildRuntimeSceneBinding,
  validateRuntimeSceneBinding,
} from "../build-scene-runtime-binding";
import {
  runtimeSceneSourceFromPlanSource,
} from "../scene-runtime-adapters";
import type {
  RuntimeEnvironmentBindingV1,
} from "../environment-runtime-contract";
import type {
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";
import type {
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";

function model(
  entityId: string,
  assetId: string,
): RuntimeModelBindingV1 {
  return {
    schema_version: "myway_resource_runtime_v1",
    resource_kind: "model",
    scene_id: "source_scene",
    intent_id: `model_${entityId}`,
    entity_id: entityId,
    asset_id: assetId,
    variant_id: `${assetId}:glb`,
    public_url:
      `https://assets.example.test/${assetId}.glb`,
    content_hash: "a".repeat(64),
    storage_provider: "r2",
    registry_snapshot_id: "assets:test",
    registry_content_hash: "b".repeat(64),
    request_hash: "c".repeat(64),
    resolver_version:
      "myway_reviewed_scene_resource_resolver_v1",
    resolved_at: "2026-07-30T00:00:00.000Z",
    fallback: null,
    license: {
      license_kind: "cc0",
      license_status: "app_ready",
      attribution_required: false,
      attribution_text: null,
      source_url: null,
      license_record_path: null,
    },
  };
}

function material(
  id: string,
  entityId: string,
): RuntimeMaterialBindingV1 {
  return {
    schema_version: "myway_material_runtime_v1",
    resource_kind: "material",
    material_binding_id: id,
    material_resource_id: "ambientcg_material_test",
    variant_id: "2k-jpg",
    content_hash: "d".repeat(64),
    target_entity_id: entityId,
    target_slot: null,
    source_mode: "replace_all",
    display_name: "Test material",
    resolution: "2K",
    normal_map_convention: "opengl",
    maps: {},
    parameters: {
      base_color_factor: "#ffffff",
      roughness_factor: 0.7,
      metalness_factor: 0,
      opacity: 1,
      emissive_color: "#000000",
      emissive_intensity: 0,
      normal_scale: 1,
      displacement_scale: 0,
    },
    uv_transform: {
      repeat: [2, 2],
      offset: [0, 0],
      rotation_radians: 0,
      center: [0.5, 0.5],
    },
    registry_snapshot_id: "materials:test",
    registry_content_hash: "e".repeat(64),
    request_hash: "f".repeat(64),
    resolver_version:
      "myway_reviewed_material_resolver_v1",
    resolved_at: "2026-07-30T00:00:00.000Z",
    provenance: {
      source_type: "ambientcg",
      source_asset_id: "TestMaterial",
      source_url:
        "https://ambientcg.com/a/TestMaterial",
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
    },
    warnings: [],
  };
}

const environment: RuntimeEnvironmentBindingV1 = {
  schema_version: "myway_environment_runtime_v1",
  resource_kind: "environment",
  environment_binding_id: "environment:test",
  environment_resource_id: "ambientcg_hdri_test",
  variant_id: "2k-hdr",
  content_hash: "1".repeat(64),
  display_name: "Test HDRI",
  format: "hdr",
  lighting_mode: "hdri",
  background_mode: "solid_color",
  public_url:
    "https://assets.example.test/environment.hdr",
  object_key: "runtime/hdri/test/environment.hdr",
  intensity: 1,
  rotation_radians: 0,
  background_intensity: 1,
  background_blurriness: 0,
  background_color: "#0f172a",
  exposure: 1,
  shadow_policy: {
    enabled: true,
    quality: "medium",
    max_shadow_lights: 1,
    map_size: 1024,
    softness: 2,
    bias: -0.0002,
    normal_bias: 0.02,
  },
  fallback: {
    used: false,
    reason: null,
    rig: "studio_rig",
    ambient_intensity: 0.55,
    key_light_intensity: 2.6,
    fill_light_intensity: 1.15,
    rim_light_intensity: 1.5,
  },
  registry_snapshot_id: "environments:test",
  registry_content_hash: "2".repeat(64),
  request_hash: "3".repeat(64),
  resolver_version:
    "myway_reviewed_environment_resolver_v1",
  resolved_at: "2026-07-30T00:00:00.000Z",
  provenance: {
    source_type: "ambientcg",
    source_asset_id: "TestHDRI",
    source_url: "https://ambientcg.com/a/TestHDRI",
    license: "CC0-1.0",
    attribution_required: false,
    commercial_use_allowed: true,
    raw_distribution_allowed: true,
  },
  warnings: [],
};

async function main() {
  const primary = model("actor_primary", "apple_asset");
  const secondary = model("actor_secondary", "barrel_asset");
  const firstMaterial = material(
    "material:primary",
    primary.entity_id,
  );
  const secondMaterial = material(
    "material:secondary",
    secondary.entity_id,
  );

  const binding = buildRuntimeSceneBinding({
    scene_id: "phase2h_fixture",
    source: "resource_runtime_harness",
    models: [primary, secondary],
    materials: [firstMaterial, secondMaterial],
    environment,
    actor_transforms: {
      actor_primary: {
        position: [-1.5, 0, 0],
      },
      actor_secondary: {
        position: [1.5, 0, 0],
      },
    },
    created_at: "2026-07-30T00:00:00.000Z",
  });

  assert.equal(
    binding.schema_version,
    "myway_scene_runtime_v1",
  );
  assert.deepEqual(
    binding.actors.map((actor) => actor.entity_id),
    ["actor_primary", "actor_secondary"],
  );
  assert.deepEqual(
    binding.actors[0]?.material_binding_ids,
    ["material:primary"],
  );
  assert.deepEqual(
    binding.actors[1]?.material_binding_ids,
    ["material:secondary"],
  );
  assert.equal(
    binding.environment?.environment_resource_id,
    "ambientcg_hdri_test",
  );
  assert.equal(validateRuntimeSceneBinding(binding).valid, true);
  assert.equal(primary.scene_id, "source_scene");
  assert.equal(firstMaterial.target_entity_id, "actor_primary");

  assert.throws(
    () =>
      buildRuntimeSceneBinding({
        scene_id: "duplicates",
        source: "resource_runtime_harness",
        models: [primary, primary],
      }),
    /duplicate Director entity ids/i,
  );

  assert.throws(
    () =>
      buildRuntimeSceneBinding({
        scene_id: "missing_target",
        source: "resource_runtime_harness",
        models: [primary],
        materials: [
          material("material:missing", "missing_actor"),
        ],
      }),
    /targets missing entity/i,
  );

  assert.equal(
    runtimeSceneSourceFromPlanSource("primitive_builder"),
    "primitive_builder",
  );
  assert.equal(
    runtimeSceneSourceFromPlanSource("visual_experience"),
    "visual_experience",
  );
  assert.equal(
    runtimeSceneSourceFromPlanSource("manual_turn"),
    "manual_turn",
  );
  assert.equal(
    runtimeSceneSourceFromPlanSource("scaffold"),
    "compatibility_adapter",
  );

  await access(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/resource-runtime/ui/shared-scene-runtime-canvas.tsx",
    ),
  );
  await access(
    resolve(
      process.cwd(),
      "sandbox/probe-lab/resource-runtime/browser-scene-runtime.ts",
    ),
  );

  console.log("Phase 2H scene runtime fixture passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
