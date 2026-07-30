import type {
  AssetResolveResult,
  MyWayAssetRecord,
} from "../assets/asset-types";
import {
  loadReviewedAssetResolverSnapshot,
  resolveReviewedAsset,
  type ReviewedAssetResolverSnapshot,
} from "../assets/reviewed-asset-resolver.server";
import {
  stableJsonHash,
} from "../assets/content-hash.server";
import {
  RESOLVED_SCENE_RESOURCES_SCHEMA_VERSION,
  type ResolvedModelResourceBinding,
  type ResolvedSceneResourcesV1,
  type SceneEntityResourceIntent,
  type SceneModelResolutionDiagnostic,
  type SceneResourceFallbackRecord,
  type SceneResourcePlanV1,
  type SceneResourceResolutionWarning,
} from "./scene-resource-contract";
import {
  validateSceneResourcePlan,
} from "./validate-scene-resource-plan";

export const REVIEWED_SCENE_RESOURCE_RESOLVER_VERSION =
  "myway_reviewed_scene_resource_resolver_v1" as const;

export type SceneModelResolutionExecution = {
  intent: SceneEntityResourceIntent;
  result: AssetResolveResult | null;
};

export type ReviewedSceneResourceResolutionExecution = {
  resolved_resources: ResolvedSceneResourcesV1;
  model_resolutions: SceneModelResolutionExecution[];
  snapshot: ReviewedAssetResolverSnapshot;
};

function unique(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function conceptForIntent(
  intent: SceneEntityResourceIntent,
) {
  return (
    intent.model_requirement
      ?.aliases.find(Boolean) ??
    intent.semantic_role ??
    intent.entity_id
  );
}

function licenseReference(
  asset: MyWayAssetRecord,
) {
  return {
    license_kind: asset.license_kind,
    license_status:
      asset.license_status,
    attribution_required:
      asset.license_kind ===
      "cc_by_4_0",
    attribution_text:
      asset.license_kind ===
      "cc_by_4_0"
        ? asset.notes ??
          asset.display_name
        : null,
    source_url:
      asset.source_url ?? null,
    license_record_path:
      asset.license_record_path ??
      null,
  };
}

function modelBinding(
  intent: SceneEntityResourceIntent,
  result: AssetResolveResult,
): ResolvedModelResourceBinding | null {
  const asset = result.asset;
  const reason =
    result.selection_reason;

  if (
    !result.ok ||
    result.source !== "library" ||
    !asset ||
    !reason
  ) {
    return null;
  }

  return {
    intent_id: intent.intent_id,
    entity_id: intent.entity_id,
    asset_id: asset.asset_id,
    variant_id:
      asset.storage_object_key ??
      null,
    public_url: asset.public_path,
    content_hash:
      asset.content_hash ?? null,
    storage_provider:
      asset.storage_provider ??
      (/^https:\/\//i.test(
        asset.public_path,
      )
        ? "r2"
        : "local"),
    selection_reason: reason,
    license:
      licenseReference(asset),
  };
}

function modelDiagnostic(
  intent: SceneEntityResourceIntent,
  result: AssetResolveResult | null,
): SceneModelResolutionDiagnostic {
  const concept =
    conceptForIntent(intent);

  if (!intent.model_requirement) {
    return {
      intent_id: intent.intent_id,
      entity_id: intent.entity_id,
      concept,
      status: "not_requested",
      selected_asset_id: null,
      match_score: null,
      match_margin: null,
      failure_reason: null,
      candidate_scores: [],
      eligibility_diagnostics: [],
      appearance_ranking: null,
      warnings: [],
    };
  }

  return {
    intent_id: intent.intent_id,
    entity_id: intent.entity_id,
    concept,
    status:
      result?.ok &&
      result.source === "library" &&
      result.asset
        ? "resolved"
        : "fallback",
    selected_asset_id:
      result?.asset?.asset_id ?? null,
    match_score:
      result?.match_score ?? null,
    match_margin:
      result?.match_margin ?? null,
    failure_reason:
      result?.failure_reason ?? null,
    candidate_scores:
      result?.candidate_scores ?? [],
    eligibility_diagnostics:
      result?.eligibility_diagnostics ??
      [],
    appearance_ranking:
      result?.appearance_ranking ??
      null,
    warnings:
      result?.warnings ?? [],
  };
}

function modelFallback(
  plan: SceneResourcePlanV1,
  intent: SceneEntityResourceIntent,
  result: AssetResolveResult,
): SceneResourceFallbackRecord {
  const fallback =
    intent.fallback_policy
      ?.missing_model ??
    plan.fallback_policy.missing_model;

  return {
    intent_id: intent.intent_id,
    resource_kind: "model",
    fallback_used: fallback,
    reason:
      result.failure_reason ??
      "No reviewed model resource was available.",
    preserved_entity_id:
      intent.entity_id,
  };
}

export async function resolveReviewedSceneResources(
  plan: SceneResourcePlanV1,
  options: {
    snapshot?: ReviewedAssetResolverSnapshot;
    resolved_at?: string;
    require_cloud_ready?: boolean;
    preferred_asset_ids_by_intent?: Record<string, string>;
  } = {},
): Promise<ReviewedSceneResourceResolutionExecution> {
  const validation =
    validateSceneResourcePlan(plan);

  if (!validation.valid) {
    const errors = validation.issues
      .filter(
        (issue) =>
          issue.severity === "error",
      )
      .map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      );

    throw new Error(
      `Scene resource plan is invalid: ${errors.join("; ")}`,
    );
  }

  const snapshot =
    options.snapshot ??
    (await loadReviewedAssetResolverSnapshot());
  const resolvedAt =
    options.resolved_at ??
    new Date().toISOString();
  const warnings:
    SceneResourceResolutionWarning[] =
      [];
  const fallbacks:
    SceneResourceFallbackRecord[] =
      [];
  const models:
    ResolvedModelResourceBinding[] =
      [];
  const modelResolutions:
    SceneModelResolutionExecution[] =
      [];

  if (
    plan.fallback_policy
      .acquisition_policy !== "never"
  ) {
    warnings.push({
      code:
        "acquisition_policy_forced_never",
      intent_id: null,
      message:
        "Phase 2C reviewed scene resolution is pure. Acquisition was forced to never; queueing or synchronous acquisition must be requested separately.",
    });
  }

  for (const intent of
    plan.entity_intents) {
    if (!intent.model_requirement) {
      modelResolutions.push({
        intent,
        result: null,
      });
      continue;
    }

    const requirement =
      intent.model_requirement;
    const concept =
      conceptForIntent(intent);

    if (
      requirement.required_capabilities.length ||
      requirement.required_anchor_types.length
    ) {
      warnings.push({
        code:
          "model_capability_checks_partial",
        intent_id: intent.intent_id,
        message:
          `${concept}: rigging, animation clips, and explicit affordances are enforced in Phase 2C; broader capability and anchor-profile checks remain for the geometry/capability resolver.`,
      });
    }

    const result =
      await resolveReviewedAsset(
        {
          concept,
          aliases:
            requirement.aliases,
          semantic_tags:
            requirement.semantic_tags,
          target_extent_m:
            requirement.target_extent_m ??
            undefined,
          required_affordances:
            unique(
              requirement
                .required_affordances,
            ),
          desired_composition:
            requirement
              .preferred_composition ===
            "any"
              ? undefined
              : requirement
                  .preferred_composition,
          appearance_request: {
            schema_version:
              "myway_asset_appearance_request_v1",
            visual_brief:
              requirement.visual_brief,
            required_traits:
              requirement
                .required_appearance_traits,
            preferred_traits:
              requirement
                .preferred_appearance_traits,
            avoid_traits:
              requirement
                .avoided_appearance_traits,
          },
          preferred_asset_id:
            options.preferred_asset_ids_by_intent?.[
              intent.intent_id
            ],
          appearance_ranking: false,
          acquisition_policy: "never",
          require_scene_approved: true,
          require_semantic_verified: true,
          require_license_eligible: true,
          require_cloud_ready:
            options.require_cloud_ready !==
            false,
          require_rigged:
            requirement.rigging_required,
          required_animation_clips:
            requirement
              .required_animation_clips,
          minimum_match_score: 48,
          minimum_match_margin: 6,
          candidate_limit: 8,
          record_reuse: false,
          debug_write: false,
        },
        {
          snapshot,
          resolved_at: resolvedAt,
        },
      );

    modelResolutions.push({
      intent,
      result,
    });

    const binding =
      modelBinding(intent, result);
    if (binding) {
      models.push(binding);
      continue;
    }

    fallbacks.push(
      modelFallback(
        plan,
        intent,
        result,
      ),
    );
    warnings.push({
      code:
        "model_fallback_used",
      intent_id: intent.intent_id,
      message:
        `${concept}: ${result.failure_reason ?? "No reviewed model resource was available."}`,
    });
  }

  for (const intent of
    plan.surface_intents) {
    fallbacks.push({
      intent_id: intent.intent_id,
      resource_kind: "material",
      fallback_used:
        plan.fallback_policy
          .missing_material,
      reason:
        "Material registry resolution is intentionally deferred to Phase 2F.",
      preserved_entity_id:
        intent.target_entity_id,
    });
    warnings.push({
      code:
        "material_resolution_deferred",
      intent_id: intent.intent_id,
      message:
        "Material intent was preserved, but material selection is deferred to Phase 2F.",
    });
  }

  if (plan.environment_intent) {
    fallbacks.push({
      intent_id:
        plan.environment_intent
          .intent_id,
      resource_kind: "environment",
      fallback_used:
        plan.fallback_policy
          .missing_environment,
      reason:
        "Environment registry resolution is intentionally deferred to Phase 2G.",
      preserved_entity_id: null,
    });
    warnings.push({
      code:
        "environment_resolution_deferred",
      intent_id:
        plan.environment_intent
          .intent_id,
      message:
        "Environment intent was preserved, but HDRI/environment selection is deferred to Phase 2G.",
    });
  }

  for (const intent of
    plan.auxiliary_intents) {
    fallbacks.push({
      intent_id: intent.intent_id,
      resource_kind:
        intent.resource_kind,
      fallback_used:
        plan.fallback_policy
          .missing_auxiliary,
      reason:
        "Auxiliary resource resolution is deferred until the corresponding Phase 2 capability is implemented.",
      preserved_entity_id:
        intent.target_entity_id ??
        null,
    });
    warnings.push({
      code:
        "auxiliary_resolution_deferred",
      intent_id: intent.intent_id,
      message:
        `${intent.resource_kind} intent was preserved for a later Phase 2 resolver.`,
    });
  }

  const resolvedResources:
    ResolvedSceneResourcesV1 = {
      schema_version:
        RESOLVED_SCENE_RESOURCES_SCHEMA_VERSION,
      scene_id: plan.scene_id,
      resolver_version:
        REVIEWED_SCENE_RESOURCE_RESOLVER_VERSION,
      registry_snapshot_id:
        snapshot.registry_snapshot_id,
      registry_content_hash:
        snapshot.registry_content_hash,
      request_hash:
        stableJsonHash(plan),
      resolved_at: resolvedAt,
      acquisition_policy: "never",
      models,
      materials: [],
      environment: null,
      auxiliary: [],
      model_resolution_diagnostics:
        plan.entity_intents.map(
          (intent) => {
            const execution =
              modelResolutions.find(
                (entry) =>
                  entry.intent.intent_id ===
                  intent.intent_id,
              );
            return modelDiagnostic(
              intent,
              execution?.result ??
                null,
            );
          },
        ),
      warnings,
      fallbacks_used: fallbacks,
    };

  return {
    resolved_resources:
      resolvedResources,
    model_resolutions:
      modelResolutions,
    snapshot,
  };
}
