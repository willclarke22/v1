import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadMyWayAssetRegistry,
} from "../../assets/asset-library.server";
import {
  loadReviewedAssetResolverSnapshot,
} from "../../assets/reviewed-asset-resolver.server";
import {
  resolveReviewedSceneResources,
} from "../../scene-resources/resolve-reviewed-scene-resources.server";
import {
  DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
  DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
  SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
  type SceneResourcePlanV1,
} from "../../scene-resources/scene-resource-contract";
import {
  buildRuntimeModelBinding,
  fallbackForIntent,
} from "../build-runtime-binding";
import type {
  ResourceRuntimeAssetSummary,
} from "../resource-runtime-contract";

export const maxDuration = 300;

function eligibleForHarness(asset: {
  asset_type: string;
  status: string;
  scene_review_status?: string;
  semantic_review_status?: string;
  license_status: string;
  safe_to_use_in_sandbox: boolean;
  public_path: string;
  storage_provider?: string;
  storage_object_key?: string | null;
  content_hash?: string | null;
}) {
  return (
    (asset.asset_type === "glb" ||
      asset.asset_type === "gltf") &&
    asset.status === "approved" &&
    asset.scene_review_status === "approved" &&
    asset.semantic_review_status === "verified" &&
    asset.safe_to_use_in_sandbox === true &&
    (asset.license_status === "app_ready" ||
      asset.license_status === "recorded") &&
    asset.storage_provider === "r2" &&
    /^https:\/\//i.test(asset.public_path) &&
    Boolean(asset.storage_object_key) &&
    Boolean(asset.content_hash)
  );
}

function summary(asset: Awaited<ReturnType<typeof loadMyWayAssetRegistry>>["assets"][number]): ResourceRuntimeAssetSummary {
  return {
    asset_id: asset.asset_id,
    display_name: asset.display_name,
    canonical_label:
      asset.verified_canonical_label ??
      asset.canonical_label,
    public_url: asset.public_path,
    content_hash: asset.content_hash ?? null,
    file_size_bytes:
      asset.file_size_bytes ?? null,
    source_type: asset.source_type,
  };
}

function planForAsset(
  asset: Awaited<ReturnType<typeof loadMyWayAssetRegistry>>["assets"][number],
  simulateFailure: boolean,
): SceneResourcePlanV1 {
  const entityId = "resource_runtime_actor";
  const intentId = "resource_runtime_model";

  return {
    schema_version:
      SCENE_RESOURCE_PLAN_SCHEMA_VERSION,
    source: "scaffold",
    scene_id: simulateFailure
      ? "resource_runtime_failure_test"
      : `resource_runtime_${asset.asset_id}`,
    director_schema_version: null,
    entity_intents: [
      {
        intent_id: intentId,
        entity_id: entityId,
        semantic_role: simulateFailure
          ? "missing_resource_test_actor"
          : asset.verified_canonical_label ??
            asset.canonical_label,
        instructional_purpose:
          "Verify deterministic reviewed-resource hydration without changing educational direction.",
        actor_kind: "concrete_object",
        resource_criticality: "required",
        runtime_target: "both",
        model_requirement: {
          semantic_tags: simulateFailure
            ? [
                "__myway_intentional_missing_resource__",
              ]
            : asset.semantic_tags,
          aliases: simulateFailure
            ? [
                "__myway_intentional_missing_resource__",
              ]
            : Array.from(
                new Set([
                  asset.verified_canonical_label ??
                    asset.canonical_label,
                  asset.display_name,
                  ...asset.aliases,
                ]),
              ),
          required_capabilities: [],
          required_anchor_types: [],
          required_affordances: [],
          preferred_composition:
            asset.object_composition &&
            asset.object_composition !==
              "unknown"
              ? asset.object_composition
              : "any",
          target_extent_m:
            Math.max(...asset.dimensions_m) ||
            1,
          rigging_required: false,
          required_animation_clips: [],
          closeup_importance: "high",
          visual_brief: simulateFailure
            ? "An intentionally unavailable resource used to verify the declared fallback path."
            : `Render the reviewed ${asset.display_name} exactly as stored, preserving original materials and vertex colours.`,
          required_appearance_traits: [],
          preferred_appearance_traits: [],
          avoided_appearance_traits: [],
        },
      },
    ],
    surface_intents: [],
    environment_intent: null,
    auxiliary_intents: [],
    fallback_policy: {
      ...DEFAULT_SCENE_RESOURCE_FALLBACK_POLICY,
      acquisition_policy: "never",
      missing_model: "diagrammatic_proxy",
    },
    performance_budget:
      DEFAULT_SCENE_RESOURCE_PERFORMANCE_BUDGET,
  };
}

export async function GET() {
  try {
    const registry =
      await loadMyWayAssetRegistry();

    const assets = registry.assets
      .filter(eligibleForHarness)
      .sort((left, right) =>
        (
          left.verified_canonical_label ??
          left.canonical_label
        ).localeCompare(
          right.verified_canonical_label ??
            right.canonical_label,
        ),
      )
      .map(summary);

    return NextResponse.json({
      ok: true,
      assets,
      default_asset_id:
        assets[0]?.asset_id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        assets: [],
        default_asset_id: null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as
        Record<string, unknown>;
    const simulateFailure =
      body.simulate_failure === true;
    const requestedAssetId =
      typeof body.asset_id === "string"
        ? body.asset_id.trim()
        : "";

    const snapshot =
      await loadReviewedAssetResolverSnapshot();
    const available = snapshot.registry.assets
      .filter(eligibleForHarness)
      .sort((left, right) =>
        left.asset_id.localeCompare(
          right.asset_id,
        ),
      );
    const selected =
      available.find(
        (asset) =>
          asset.asset_id ===
          requestedAssetId,
      ) ?? available[0];

    if (!selected) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No reviewed, scene-approved, semantically verified R2 GLB is available for the runtime harness.",
        },
        { status: 404 },
      );
    }

    const resourcePlan =
      planForAsset(
        selected,
        simulateFailure,
      );
    const intentId =
      resourcePlan.entity_intents[0]
        .intent_id;
    const execution =
      await resolveReviewedSceneResources(
        resourcePlan,
        {
          snapshot,
          require_cloud_ready: true,
          preferred_asset_ids_by_intent:
            simulateFailure
              ? undefined
              : {
                  [intentId]:
                    selected.asset_id,
                },
        },
      );
    const resolved =
      execution.resolved_resources;
    const runtimeBinding =
      resolved.models[0]
        ? buildRuntimeModelBinding(
            resolved,
            resolved.models[0],
          )
        : null;
    const fallback =
      fallbackForIntent(
        resolved,
        intentId,
      );

    return NextResponse.json({
      ok:
        Boolean(runtimeBinding) ||
        Boolean(fallback),
      resource_plan: resourcePlan,
      resolved_resources: resolved,
      runtime_binding:
        runtimeBinding,
      fallback,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
}
