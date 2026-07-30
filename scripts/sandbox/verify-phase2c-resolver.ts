import assert from "node:assert/strict";

import type {
  MyWayAssetRecord,
  MyWayAssetRegistryV2,
} from "../../sandbox/probe-lab/assets/asset-types";
import {
  makeReviewedAssetResolverSnapshot,
  resolveReviewedAsset,
} from "../../sandbox/probe-lab/assets/reviewed-asset-resolver.server";
import {
  DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
  DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
  SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
  type SceneResourcePlanV1,
} from "../../sandbox/probe-lab/scene-resources/scene-resource-contract";
import {
  resolveReviewedSceneResources,
} from "../../sandbox/probe-lab/scene-resources/resolve-reviewed-scene-resources.server";

function fixtureAsset(
  assetId: string,
  overrides: Partial<MyWayAssetRecord> = {},
): MyWayAssetRecord {
  return {
    asset_id: assetId,
    canonical_label: "microscope",
    display_name: "Microscope",
    aliases: ["lab microscope"],
    semantic_tags: [
      "microscope",
      "science",
    ],
    asset_type: "primitive",
    domain: "science",
    verified_canonical_label:
      "microscope",
    verified_aliases: [
      "lab microscope",
    ],
    semantic_review_status:
      "verified",
    object_composition:
      "single_object",
    affordances: ["inspect"],
    source_type: "procedural",
    source_asset_id: assetId,
    source_url: null,
    source_path: null,
    public_path:
      `/sandbox-assets/myway/models/${assetId}.glb`,
    thumbnail_path: null,
    license_record_path: null,
    storage_provider: "local",
    storage_object_key: null,
    storage_etag: null,
    file_size_bytes: 1024,
    dimensions_m: [1, 1, 1],
    default_scale: 1,
    default_rotation: [0, 0, 0],
    ground_offset_m: 0,
    polygon_count: 100,
    rigged: false,
    animation_clips: [],
    content_hash:
      `hash_${assetId}`,
    quality_score: 1,
    reuse_count: 0,
    license_kind: "cc0",
    license_status: "recorded",
    commercial_use_allowed: true,
    raw_redistribution_allowed: true,
    safe_to_use_in_sandbox: true,
    safe_to_promote_to_app: true,
    status: "approved",
    scene_review_status: "approved",
    scene_reviewed_at:
      "2026-07-30T00:00:00.000Z",
    scene_review_notes: null,
    notes: null,
    created_at:
      "2026-07-30T00:00:00.000Z",
    updated_at:
      "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function registry(
  assets: MyWayAssetRecord[],
  updatedAt: string,
): MyWayAssetRegistryV2 {
  return {
    schema_version:
      "myway_asset_registry_v2",
    updated_at: updatedAt,
    asset_root_public_url:
      "/sandbox-assets/myway",
    notes: "fixture",
    assets,
  };
}

async function main() {
  const firstSnapshot =
    makeReviewedAssetResolverSnapshot(
      registry(
        [
          fixtureAsset(
            "microscope_a",
            { reuse_count: 0 },
          ),
          fixtureAsset(
            "microscope_b",
            {
              reuse_count: 999,
              quality_score: 0.1,
            },
          ),
          fixtureAsset(
            "microscope_pending",
            {
              scene_review_status:
                "pending",
            },
          ),
        ],
        "2026-07-30T00:00:00.000Z",
      ),
    );
  const secondSnapshot =
    makeReviewedAssetResolverSnapshot(
      registry(
        [
          fixtureAsset(
            "microscope_a",
            { reuse_count: 5000 },
          ),
          fixtureAsset(
            "microscope_b",
            {
              reuse_count: 0,
              quality_score: 0.1,
            },
          ),
          fixtureAsset(
            "microscope_pending",
            {
              scene_review_status:
                "pending",
            },
          ),
        ],
        "2026-07-31T00:00:00.000Z",
      ),
    );

  assert.equal(
    firstSnapshot.registry_content_hash,
    secondSnapshot.registry_content_hash,
    "reuse counters and registry timestamps must not change the deterministic selection snapshot",
  );

  const request = {
    concept: "microscope",
    aliases: ["lab microscope"],
    required_affordances: [
      "inspect",
    ],
    desired_composition:
      "single_object" as const,
    acquisition_policy:
      "never" as const,
    require_cloud_ready: false,
    minimum_match_margin: 0,
    record_reuse: false,
    debug_write: false,
  };

  const first =
    await resolveReviewedAsset(
      request,
      {
        snapshot: firstSnapshot,
        resolved_at:
          "2026-07-30T00:00:00.000Z",
      },
    );
  const second =
    await resolveReviewedAsset(
      request,
      {
        snapshot: secondSnapshot,
        resolved_at:
          "2026-07-30T00:00:00.000Z",
      },
    );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(
    first.asset?.asset_id,
    "microscope_a",
    "stable asset id must break an exact score tie",
  );
  assert.equal(
    second.asset?.asset_id,
    "microscope_a",
    "reuse_count must not alter ranking",
  );
  assert.equal(
    first.request_hash,
    second.request_hash,
  );
  assert.deepEqual(first.attempts, []);
  assert.equal(
    first.acquisition_policy,
    "never",
  );
  assert.ok(
    first.eligibility_diagnostics.some(
      (entry) =>
        entry.asset_id ===
          "microscope_pending" &&
        entry.reasons.includes(
          "scene_review_not_approved",
        ),
    ),
  );

  const plan: SceneResourcePlanV1 = {
    schema_version:
      SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
    source: "scaffold",
    scene_id: "resolver_fixture",
    director_schema_version: null,
    entity_intents: [
      {
        intent_id:
          "model_scope",
        entity_id: "scope",
        semantic_role:
          "microscope",
        instructional_purpose:
          "Show a reviewed microscope.",
        actor_kind:
          "physical_asset",
        resource_criticality:
          "required",
        runtime_target: "both",
        model_requirement: {
          semantic_tags: [
            "microscope",
          ],
          aliases: [
            "microscope",
          ],
          required_capabilities: [],
          required_anchor_types: [],
          required_affordances: [
            "inspect",
          ],
          preferred_composition:
            "single_object",
          target_extent_m: 1,
          rigging_required: false,
          required_animation_clips: [],
          closeup_importance:
            "medium",
          visual_brief:
            "A clear lab microscope.",
          required_appearance_traits: [],
          preferred_appearance_traits: [],
          avoided_appearance_traits: [],
        },
        fallback_policy: null,
      },
    ],
    surface_intents: [],
    environment_intent: null,
    auxiliary_intents: [],
    fallback_policy: {
      ...DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
      acquisition_policy: "never",
    },
    performance_budget: {
      ...DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
    },
  };

  const scene =
    await resolveReviewedSceneResources(
      plan,
      {
        snapshot: firstSnapshot,
        resolved_at:
          "2026-07-30T00:00:00.000Z",
        require_cloud_ready: false,
      },
    );

  assert.equal(
    scene.resolved_resources
      .models[0]?.entity_id,
    "scope",
    "stable Director entity ids must survive resource binding",
  );
  assert.equal(
    scene.resolved_resources
      .models[0]?.asset_id,
    "microscope_a",
  );
  assert.equal(
    scene.resolved_resources
      .acquisition_policy,
    "never",
  );
  assert.equal(
    scene.resolved_resources
      .model_resolution_diagnostics[0]
      ?.status,
    "resolved",
  );

  console.log(
    "Phase 2C resolver fixture passed.",
  );
  console.log(
    JSON.stringify(
      {
        resolver_version:
          first.resolver_version,
        registry_snapshot_id:
          first.registry_snapshot_id,
        selected_asset_id:
          first.asset?.asset_id,
        request_hash:
          first.request_hash,
        scene_model_count:
          scene.resolved_resources
            .models.length,
        acquisition_policy:
          scene.resolved_resources
            .acquisition_policy,
      },
      null,
      2,
    ),
  );
}

void main();
