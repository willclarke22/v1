import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  access,
} from "node:fs/promises";

import {
  buildRuntimeModelBinding,
  validateRuntimeModelUrl,
} from "../build-runtime-binding";
import {
  hydrateResolvedModelForBlender,
  readHydratedModelBytes,
} from "../hydrate-resolved-model-for-blender.server";
import type {
  ResolvedModelResourceBinding,
  ResolvedSceneResourcesV1,
  SceneResourceFallbackRecord,
} from "../../scene-resources/scene-resource-contract";

async function main() {
  const bytes = Buffer.from(
    "myway-phase2d-runtime-fixture",
    "utf8",
  );
  const hash = createHash("sha256")
    .update(bytes)
    .digest("hex");

  const model: ResolvedModelResourceBinding = {
    intent_id: "fixture_model_intent",
    entity_id: "fixture_director_entity",
    asset_id: "fixture_reviewed_asset",
    variant_id: "models/fixture.glb",
    public_url:
      "https://assets.example.test/models/fixture.glb",
    content_hash: hash,
    storage_provider: "r2",
    selection_reason: {
      summary:
        "Fixture reviewed selection.",
      eligibility_checks: [
        "scene approved",
        "semantic identity verified",
        "license eligible",
        "cloud ready",
      ],
      score_components: {
        total: 100,
      },
      candidate_rank: 1,
    },
    license: {
      license_kind: "cc0",
      license_status: "app_ready",
      attribution_required: false,
      attribution_text: null,
      source_url: null,
      license_record_path: null,
    },
  };

  const fallback: SceneResourceFallbackRecord = {
    intent_id: model.intent_id,
    resource_kind: "model",
    fallback_used:
      "diagrammatic_proxy",
    reason:
      "Fixture fallback.",
    preserved_entity_id:
      model.entity_id,
  };

  const resolved: ResolvedSceneResourcesV1 = {
    schema_version:
      "myway_resolved_scene_resources_v1",
    scene_id: "fixture_scene",
    resolver_version:
      "myway_reviewed_scene_resource_resolver_v1",
    registry_snapshot_id:
      "fixture_registry_snapshot",
    registry_content_hash:
      "fixture_registry_hash",
    request_hash:
      "fixture_request_hash",
    resolved_at:
      "2026-07-30T00:00:00.000Z",
    acquisition_policy: "never",
    models: [model],
    materials: [],
    environment: null,
    auxiliary: [],
    model_resolution_diagnostics: [],
    warnings: [],
    fallbacks_used: [],
  };

  const binding =
    buildRuntimeModelBinding(
      resolved,
      model,
      fallback,
    );

  assert.equal(
    binding.entity_id,
    model.entity_id,
    "The Director entity id must survive runtime binding.",
  );
  assert.equal(
    binding.fallback
      ?.preserved_entity_id,
    model.entity_id,
    "Fallback metadata must preserve the same entity id.",
  );
  assert.equal(
    binding.public_url,
    model.public_url,
  );
  assert.equal(
    binding.content_hash,
    hash,
  );

  assert.throws(
    () =>
      validateRuntimeModelUrl(
        "http://assets.example.test/model.glb",
        "r2",
      ),
    /HTTPS/,
    "R2 bindings must reject non-HTTPS URLs.",
  );

  let fetchCount = 0;
  const mockFetch: typeof fetch =
    async () => {
      fetchCount += 1;
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type":
            "model/gltf-binary",
        },
      });
    };

  const hydration =
    await hydrateResolvedModelForBlender(
      binding,
      {
        verify_hash: true,
        fetch_impl: mockFetch,
      },
    );

  assert.equal(fetchCount, 1);
  assert.equal(
    hydration.hash_verified,
    true,
  );
  assert.equal(
    hydration.actual_content_hash,
    hash,
  );
  assert.equal(
    hydration.byte_size,
    bytes.length,
  );
  assert.deepEqual(
    await readHydratedModelBytes(
      hydration,
    ),
    bytes,
  );

  await hydration.cleanup();

  await assert.rejects(
    access(
      hydration.temporary_directory,
    ),
    "Temporary Blender hydration directories must be removed.",
  );

  console.log(
    "Phase 2D runtime fixture passed.",
  );

}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
