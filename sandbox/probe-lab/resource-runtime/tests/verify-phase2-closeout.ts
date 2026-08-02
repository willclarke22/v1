import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  classifyAuxiliaryResourceIntent,
  declaredRuntimeStatusForResourceKind,
} from "../../scene-resources/auxiliary-resource-policy";
import {
  normalizeProceduralAssetSpec,
  validateProceduralAssetSpec,
} from "../../blender-python-builder/procedural-asset-spec";
import {
  adaptPrimitiveSceneNodesToRuntime,
} from "../primitive-runtime-adapter";
import {
  buildRuntimeSceneBinding,
  validateRuntimeSceneBinding,
} from "../build-scene-runtime-binding";
import type {
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";

function material(
  entityId: string,
): RuntimeMaterialBindingV1 {
  return {
    schema_version: "myway_material_runtime_v1",
    resource_kind: "material",
    material_binding_id: `material:${entityId}`,
    material_resource_id: "ambientcg_test_material",
    variant_id: "2k-jpg",
    content_hash: "a".repeat(64),
    target_entity_id: entityId,
    target_slot: null,
    source_mode: "primitive_surface",
    display_name: "Test material",
    resolution: "2K",
    normal_map_convention: "opengl",
    maps: {},
    parameters: {
      base_color_factor: "#ffffff",
      roughness_factor: 0.6,
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
    registry_content_hash: "b".repeat(64),
    request_hash: "c".repeat(64),
    resolver_version: "myway_reviewed_material_resolver_v1",
    resolved_at: "2026-07-31T00:00:00.000Z",
    provenance: {
      source_type: "ambientcg",
      source_asset_id: "TestMaterial",
      source_url: "https://ambientcg.com/a/TestMaterial",
      license: "CC0-1.0",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: true,
    },
    warnings: [],
  };
}

async function fileContains(
  relativePath: string,
  terms: string[],
) {
  const text = await readFile(
    resolve(process.cwd(), relativePath),
    "utf8",
  );
  for (const term of terms) {
    assert.ok(
      text.includes(term),
      `${relativePath} must contain ${term}`,
    );
  }
}

async function main() {
  assert.equal(
    declaredRuntimeStatusForResourceKind("atlas"),
    "direct_runtime",
  );
  assert.equal(
    declaredRuntimeStatusForResourceKind("terrain"),
    "requires_compilation",
  );
  assert.equal(
    declaredRuntimeStatusForResourceKind("substance"),
    "blender_only",
  );

  const atlas = classifyAuxiliaryResourceIntent({
    intent_id: "atlas_leaves",
    resource_kind: "atlas",
    target_entity_id: null,
    target_surface: null,
    semantic_tags: ["foliage"],
    instructional_purpose: "Repeat readable foliage cards.",
    runtime_target: "both",
    required: true,
    max_resolution_px: 2048,
    metadata: {
      public_url: "https://assets.example.test/leaves.png",
      content_hash: "d".repeat(64),
    },
  });
  assert.equal(atlas.runtime_status, "direct_runtime");
  assert.equal(atlas.compiler, "atlas_billboard");
  assert.equal(atlas.fallback_required, false);

  const terrain = classifyAuxiliaryResourceIntent({
    intent_id: "terrain_ground",
    resource_kind: "terrain",
    target_entity_id: null,
    target_surface: "ground",
    semantic_tags: ["ground"],
    instructional_purpose: "Create a support surface.",
    runtime_target: "both",
    required: true,
    max_resolution_px: 2048,
    metadata: {},
  });
  assert.equal(terrain.runtime_status, "requires_compilation");
  assert.equal(terrain.compiler, "terrain_heightfield");
  assert.equal(terrain.fallback_required, true);

  const primitiveResult = adaptPrimitiveSceneNodesToRuntime([
    {
      id: "track_surface",
      kind: "box",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [8, 0.2, 3],
      color: "#334155",
    },
    {
      id: "piston",
      kind: "cylinder",
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [0.6, 1.4, 0.6],
    },
    {
      id: "compatibility_only",
      kind: "customMesh",
    },
  ]);
  assert.deepEqual(
    primitiveResult.primitives.map((item) => item.entity_id),
    ["track_surface", "piston"],
  );
  assert.ok(
    primitiveResult.primitives.every(
      (item) => item.generated_uvs,
    ),
  );
  assert.deepEqual(
    primitiveResult.skipped_node_ids,
    ["compatibility_only"],
  );

  const binding = buildRuntimeSceneBinding({
    scene_id: "phase2_closeout_fixture",
    source: "primitive_builder",
    models: [],
    primitives: primitiveResult.primitives,
    fallback_actors: [
      {
        entity_id: "missing_reviewed_actor",
        intent_id: "model_missing_reviewed_actor",
        label: "No reviewed model is available yet.",
        required: true,
      },
    ],
    materials: [material("track_surface")],
    actor_transforms: primitiveResult.actor_transforms,
    required_entity_ids: ["track_surface", "piston"],
    created_at: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(validateRuntimeSceneBinding(binding).valid, true);
  assert.equal(binding.actors.length, 3);
  assert.equal(binding.actors[0]?.primitive?.generated_uvs, true);
  assert.deepEqual(
    binding.actors[0]?.material_binding_ids,
    ["material:track_surface"],
  );
  assert.equal(binding.actors[0]?.entity_id, "track_surface");
  assert.equal(binding.actors[2]?.fallback_only, true);
  assert.equal(binding.actors[2]?.entity_id, "missing_reviewed_actor");

  const spec = normalizeProceduralAssetSpec(
    {
      concept: "wheel assembly",
      target_extent_m: 0.8,
      max_triangles: 18_000,
      parts: [
        {
          part_id: "tire",
          semantic_role: "rubber tire",
          geometry_intent: "torus",
          material_intent: "rubber",
          required: true,
        },
        {
          part_id: "rim",
          semantic_role: "metal rim",
          geometry_intent: "cylinder",
          parent_part_id: "tire",
          material_intent: "metal",
          required: true,
        },
      ],
      requirements: {
        uv_required: true,
        rig_required: false,
        movable_parts: ["tire", "rim"],
        collision_required: true,
        ground_contact_required: true,
      },
    },
    {
      concept: "wheel assembly",
      target_extent_m: 0.8,
      max_triangles: 18_000,
      animation_ready: true,
    },
  );
  const specValidation = validateProceduralAssetSpec(spec);
  assert.equal(specValidation.valid, true);
  assert.deepEqual(
    spec.parts.map((part) => part.part_id),
    ["tire", "rim"],
  );

  const invalidSpec = normalizeProceduralAssetSpec(
    {
      concept: "invalid",
      parts: [
        {
          part_id: "loop",
          parent_part_id: "loop",
          geometry_intent: "box",
          required: true,
        },
      ],
    },
    {
      concept: "invalid",
      target_extent_m: 1,
      max_triangles: 1000,
    },
  );
  assert.equal(
    validateProceduralAssetSpec(invalidSpec).valid,
    false,
  );

  await fileContains(
    "sandbox/probe-lab/manual-turn/ui/manual-turn-lab.tsx",
    ["LabSceneRuntimePanel", 'source="manual_turn"'],
  );
  await fileContains(
    "sandbox/probe-lab/primitive-builder/ui/primitive-builder-lab.tsx",
    ["LabSceneRuntimePanel", 'source="primitive_builder"'],
  );
  await fileContains(
    "sandbox/probe-lab/visual-experience/ui/visual-experience-lab.tsx",
    ["LabSceneRuntimePanel", 'source="visual_experience"'],
  );
  await fileContains(
    "sandbox/probe-lab/blender-python-builder/ui/blender-python-builder-lab.tsx",
    ["execute-with-repair", "Standardized inspection views"],
  );
  await fileContains(
    "next.config.ts",
    [
      "outputFileTracingExcludes",
      "/api/sandbox/probe-lab/resource-runtime/environments/blender-hydrate",
    ],
  );

  console.log("Phase 2 closeout integration fixture passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
