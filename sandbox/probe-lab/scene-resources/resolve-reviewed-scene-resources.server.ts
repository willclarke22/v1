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
  buildThirdPartyAssetManifest,
  isAttributionRequiredLicense,
} from "../assets/asset-attribution";
import {
  resolveReviewedEnvironment,
  loadReviewedEnvironmentResolverSnapshot,
  type ReviewedEnvironmentResolverSnapshot,
} from "../resource-runtime/reviewed-environment-resolver.server";
import {
  loadReviewedMaterialResolverSnapshot,
  resolveReviewedMaterialWithSnapshot,
  type ReviewedMaterialResolverSnapshot,
} from "../resource-runtime/reviewed-material-resolver.server";
import type {
  EnvironmentResolverDiagnostics,
  RuntimeEnvironmentBindingV1,
} from "../resource-runtime/environment-runtime-contract";
import type {
  MaterialResolveDiagnostics,
  MaterialTextureRole,
  RuntimeMaterialBindingV1,
} from "../resource-runtime/material-runtime-contract";
import {
  classifyAuxiliaryResourceIntent,
  type AuxiliaryResourceRuntimeDescriptor,
} from "./auxiliary-resource-policy";
import {
  RESOLVED_SCENE_RESOURCES_SCHEMA_VERSION,
  type ResolvedAuxiliaryResourceBinding,
  type ResolvedEnvironmentResourceBinding,
  type ResolvedMaterialResourceBinding,
  type ResolvedModelResourceBinding,
  type ResolvedResourceLicenseReference,
  type ResolvedResourceSelectionReason,
  type ResolvedSceneResourcesV1,
  type SceneAuxiliaryResourceIntent,
  type SceneEntityResourceIntent,
  type SceneEnvironmentResourceIntent,
  type SceneModelResolutionDiagnostic,
  type SceneResourceFallbackRecord,
  type SceneResourcePlanV1,
  type SceneResourceResolutionWarning,
  type SceneSurfaceResourceIntent,
} from "./scene-resource-contract";
import {
  validateSceneResourcePlan,
} from "./validate-scene-resource-plan";

export const REVIEWED_SCENE_RESOURCE_RESOLVER_VERSION =
  "myway_reviewed_scene_resource_resolver_v2" as const;

export type SceneModelResolutionExecution = {
  intent: SceneEntityResourceIntent;
  result: AssetResolveResult | null;
};

export type SceneMaterialResolutionExecution = {
  intent: SceneSurfaceResourceIntent;
  binding: RuntimeMaterialBindingV1 | null;
  diagnostics: MaterialResolveDiagnostics;
};

export type SceneEnvironmentResolutionExecution = {
  intent: SceneEnvironmentResourceIntent;
  binding: RuntimeEnvironmentBindingV1;
  diagnostics: EnvironmentResolverDiagnostics;
};

export type SceneAuxiliaryResolutionExecution = {
  intent: SceneAuxiliaryResourceIntent;
  descriptor: AuxiliaryResourceRuntimeDescriptor;
};

export type ReviewedSceneResourceResolutionExecution = {
  resolved_resources: ResolvedSceneResourcesV1;
  model_resolutions: SceneModelResolutionExecution[];
  material_resolutions: SceneMaterialResolutionExecution[];
  environment_resolution: SceneEnvironmentResolutionExecution | null;
  auxiliary_resolutions: SceneAuxiliaryResolutionExecution[];
  snapshot: ReviewedAssetResolverSnapshot;
  material_snapshot: ReviewedMaterialResolverSnapshot;
  environment_snapshot: ReviewedEnvironmentResolverSnapshot;
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
): ResolvedResourceLicenseReference {
  const attribution =
    asset.attribution ?? null;
  return {
    license_kind: asset.license_kind,
    license_status:
      asset.license_status,
    attribution_required:
      isAttributionRequiredLicense(
        asset.license_kind,
      ),
    attribution_text:
      attribution?.text ?? null,
    asset_title:
      attribution?.asset_title ??
      asset.display_name,
    creator_name:
      attribution?.creator_name ?? null,
    source_provider:
      attribution?.source_provider ?? null,
    source_asset_id:
      attribution?.source_asset_id ??
      asset.source_asset_id ??
      null,
    license_name:
      attribution?.license_name ?? null,
    license_version:
      attribution?.license_version ?? null,
    license_url:
      attribution?.license_url ?? null,
    modification_notice:
      attribution?.modification_notice ??
      null,
    source_url:
      attribution?.source_url ??
      asset.source_url ?? null,
    license_record_path:
      asset.license_record_path ??
      null,
  };
}

function runtimeLicenseReference(input: {
  license: string;
  attribution_required: boolean;
  source_url: string | null;
}): ResolvedResourceLicenseReference {
  return {
    license_kind: input.license,
    license_status: "approved",
    attribution_required:
      input.attribution_required,
    attribution_text:
      input.attribution_required
        ? input.source_url
        : null,
    source_url: input.source_url,
    license_record_path: null,
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
    !reason ||
    asset.storage_provider ===
      "r2_private_pending"
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

function materialRole(
  value: string,
): MaterialTextureRole | null {
  if (value === "emission") {
    return "emissive";
  }
  if (
    value === "base_color" ||
    value === "normal" ||
    value === "roughness" ||
    value === "metalness" ||
    value === "ambient_occlusion" ||
    value === "height" ||
    value === "opacity"
  ) {
    return value;
  }
  return null;
}

function selectionReasonFromCandidate(
  resourceId: string,
  candidates: Array<{
    resource_id: string;
    score: number;
    reasons: string[];
    eligible: boolean;
  }>,
): ResolvedResourceSelectionReason {
  const eligible = candidates.filter(
    (candidate) => candidate.eligible,
  );
  const index = eligible.findIndex(
    (candidate) =>
      candidate.resource_id ===
      resourceId,
  );
  const selected =
    candidates.find(
      (candidate) =>
        candidate.resource_id ===
        resourceId,
    );

  return {
    summary: selected
      ? `Selected ${resourceId} through deterministic reviewed-resource ranking.`
      : `Selected ${resourceId}.`,
    eligibility_checks:
      selected?.reasons ?? [],
    score_components: {
      deterministic_score:
        selected?.score ?? 0,
    },
    candidate_rank:
      index >= 0 ? index + 1 : 1,
  };
}

function materialSummary(
  intent: SceneSurfaceResourceIntent,
  binding: RuntimeMaterialBindingV1,
  diagnostics: MaterialResolveDiagnostics,
): ResolvedMaterialResourceBinding {
  const mapUrls: ResolvedMaterialResourceBinding["map_urls"] =
    {};

  for (const [role, map] of Object.entries(
    binding.maps,
  )) {
    if (!map) continue;
    const contractRole =
      role === "emissive"
        ? "emission"
        : role;
    if (
      contractRole === "base_color" ||
      contractRole === "normal" ||
      contractRole === "roughness" ||
      contractRole === "metalness" ||
      contractRole === "ambient_occlusion" ||
      contractRole === "height" ||
      contractRole === "opacity" ||
      contractRole === "emission"
    ) {
      mapUrls[contractRole] =
        map.public_url;
    }
  }

  return {
    intent_id: intent.intent_id,
    target_entity_id:
      intent.target_entity_id,
    material_slot:
      intent.material_slot,
    resource_id:
      binding.material_resource_id,
    variant_id:
      binding.variant_id,
    map_urls: mapUrls,
    content_hash:
      binding.content_hash,
    storage_provider: "r2",
    selection_reason:
      selectionReasonFromCandidate(
        binding.material_resource_id,
        diagnostics.candidate_diagnostics,
      ),
    license:
      runtimeLicenseReference({
        license:
          binding.provenance.license,
        attribution_required:
          binding.provenance
            .attribution_required,
        source_url:
          binding.provenance.source_url,
      }),
  };
}

function environmentSummary(
  intent: SceneEnvironmentResourceIntent,
  binding: RuntimeEnvironmentBindingV1,
  diagnostics: EnvironmentResolverDiagnostics,
): ResolvedEnvironmentResourceBinding | null {
  if (
    !binding.environment_resource_id ||
    !binding.public_url ||
    !binding.content_hash ||
    !binding.variant_id
  ) {
    return null;
  }

  return {
    intent_id: intent.intent_id,
    resource_id:
      binding.environment_resource_id,
    variant_id:
      binding.variant_id,
    environment_url:
      binding.public_url,
    content_hash:
      binding.content_hash,
    storage_provider: "r2",
    selection_reason:
      selectionReasonFromCandidate(
        binding.environment_resource_id,
        diagnostics.candidate_diagnostics,
      ),
    license:
      runtimeLicenseReference({
        license:
          binding.provenance.license,
        attribution_required:
          binding.provenance
            .attribution_required,
        source_url:
          binding.provenance.source_url,
      }),
  };
}

function auxiliaryBinding(
  intent: SceneAuxiliaryResourceIntent,
  descriptor: AuxiliaryResourceRuntimeDescriptor,
): ResolvedAuxiliaryResourceBinding | null {
  if (
    descriptor.runtime_status !==
      "direct_runtime" ||
    !descriptor.primary_url ||
    !descriptor.content_hash
  ) {
    return null;
  }

  const metadata =
    intent.metadata ?? {};
  const resourceId =
    typeof metadata.resource_id === "string" &&
    metadata.resource_id.trim()
      ? metadata.resource_id.trim()
      : `aux:${intent.intent_id}`;
  const variantId =
    typeof metadata.variant_id === "string" &&
    metadata.variant_id.trim()
      ? metadata.variant_id.trim()
      : null;
  const sourceUrl =
    typeof metadata.source_url === "string"
      ? metadata.source_url
      : descriptor.primary_url;
  const licenseKind =
    typeof metadata.license_kind === "string"
      ? metadata.license_kind
      : "internal";

  return {
    intent_id: intent.intent_id,
    resource_kind:
      intent.resource_kind,
    resource_id: resourceId,
    variant_id: variantId,
    primary_url:
      descriptor.primary_url,
    file_urls:
      descriptor.file_urls,
    content_hash:
      descriptor.content_hash,
    storage_provider: "r2",
    selection_reason: {
      summary:
        "Accepted an explicit reviewed auxiliary derivative through the Phase 2 runtime policy.",
      eligibility_checks:
        descriptor.reasons,
      score_components: {
        direct_runtime: 1,
      },
      candidate_rank: 1,
    },
    license: {
      license_kind: licenseKind,
      license_status:
        typeof metadata.license_status === "string"
          ? metadata.license_status
          : "approved",
      attribution_required:
        metadata.attribution_required === true,
      attribution_text:
        typeof metadata.attribution_text === "string"
          ? metadata.attribution_text
          : null,
      source_url: sourceUrl,
      license_record_path:
        typeof metadata.license_record_path === "string"
          ? metadata.license_record_path
          : null,
    },
    runtime_status:
      descriptor.runtime_status,
    compiler:
      descriptor.compiler,
    runtime_target:
      descriptor.runtime_target,
  };
}

export async function resolveReviewedSceneResources(
  plan: SceneResourcePlanV1,
  options: {
    snapshot?: ReviewedAssetResolverSnapshot;
    material_snapshot?: ReviewedMaterialResolverSnapshot;
    environment_snapshot?: ReviewedEnvironmentResolverSnapshot;
    resolved_at?: string;
    require_cloud_ready?: boolean;
    preferred_asset_ids_by_intent?: Record<string, string>;
    preferred_material_ids_by_intent?: Record<string, string>;
    preferred_environment_id?: string | null;
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

  const [
    snapshot,
    materialSnapshot,
    environmentSnapshot,
  ] = await Promise.all([
    options.snapshot ??
      loadReviewedAssetResolverSnapshot(),
    options.material_snapshot ??
      loadReviewedMaterialResolverSnapshot(),
    options.environment_snapshot ??
      loadReviewedEnvironmentResolverSnapshot(),
  ]);
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
  const materials:
    ResolvedMaterialResourceBinding[] =
      [];
  const auxiliary:
    ResolvedAuxiliaryResourceBinding[] =
      [];
  const modelResolutions:
    SceneModelResolutionExecution[] =
      [];
  const materialResolutions:
    SceneMaterialResolutionExecution[] =
      [];
  const auxiliaryResolutions:
    SceneAuxiliaryResolutionExecution[] =
      [];
  let environmentResolution:
    SceneEnvironmentResolutionExecution | null =
      null;
  let environment:
    ResolvedEnvironmentResourceBinding | null =
      null;

  if (
    plan.fallback_policy
      .acquisition_policy !== "never"
  ) {
    warnings.push({
      code:
        "acquisition_policy_forced_never",
      intent_id: null,
      message:
        "Reviewed scene resolution is pure. Acquisition was forced to never; queueing or generation must be requested separately.",
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
          `${concept}: rigging, animation clips, explicit affordances, and reviewed geometry gates are enforced; broad semantic capability interpretation remains deterministic and conservative.`,
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
    const requirement =
      intent.material_requirement;
    const resolution =
      resolveReviewedMaterialWithSnapshot(
        materialSnapshot,
        {
          preferred_material_id:
            options.preferred_material_ids_by_intent?.[
              intent.intent_id
            ] ?? null,
          query:
            requirement.appearance_tags.join(
              " ",
            ),
          semantic_tags: [
            ...requirement.semantic_tags,
            ...requirement.appearance_tags,
          ],
          required_maps:
            requirement.required_maps
              .map(materialRole)
              .filter(
                (
                  value,
                ): value is MaterialTextureRole =>
                  Boolean(value),
              ),
          target_entity_id:
            intent.target_entity_id,
          target_slot:
            intent.material_slot ===
            "default"
              ? null
              : intent.material_slot,
          source_mode:
            requirement.uv_assumption ===
            "generated_primitive_uv"
              ? "primitive_surface"
              : intent.material_slot &&
                  intent.material_slot !==
                    "default"
                ? "replace_slot"
                : "replace_all",
          uv_transform: {
            repeat:
              requirement.tiling,
            rotation_radians:
              (requirement.rotation_degrees *
                Math.PI) /
              180,
          },
          parameters: {
            opacity:
              requirement.transparency ===
              "required"
                ? 0.82
                : 1,
            displacement_scale:
              requirement.displacement ===
              "allowed"
                ? 0.04
                : 0,
          },
        },
        {
          resolved_at: resolvedAt,
        },
      );

    materialResolutions.push({
      intent,
      binding:
        resolution.binding,
      diagnostics:
        resolution.diagnostics,
    });

    if (resolution.binding) {
      materials.push(
        materialSummary(
          intent,
          resolution.binding,
          resolution.diagnostics,
        ),
      );
      continue;
    }

    fallbacks.push({
      intent_id: intent.intent_id,
      resource_kind: "material",
      fallback_used:
        plan.fallback_policy
          .missing_material,
      reason:
        "No reviewed R2 material satisfied the deterministic material requirement.",
      preserved_entity_id:
        intent.target_entity_id,
    });
    warnings.push({
      code:
        "material_fallback_used",
      intent_id: intent.intent_id,
      message:
        "No reviewed material matched. The declared material fallback remains active without changing the entity or educational direction.",
    });
  }

  if (plan.environment_intent) {
    const requirement =
      plan.environment_intent
        .environment_requirement;
    const resolvedEnvironment =
      resolveReviewedEnvironment(
        {
          preferred_environment_id:
            options.preferred_environment_id ??
            null,
          intent:
            requirement.lighting_mood,
          semantic_tags:
            requirement.semantic_tags,
          background_mode:
            requirement.background_mode ===
            "visible"
              ? "environment"
              : "none",
          intensity:
            requirement.intensity,
          rotation_radians:
            (requirement.rotation_degrees *
              Math.PI) /
            180,
          exposure:
            requirement.exposure,
          fallback_rig:
            plan.fallback_policy
                .missing_environment ===
              "renderer_default"
              ? "diagrammatic_rig"
              : "studio_rig",
        },
        environmentSnapshot,
      );

    environmentResolution = {
      intent:
        plan.environment_intent,
      binding:
        resolvedEnvironment.binding,
      diagnostics:
        resolvedEnvironment.diagnostics,
    };
    environment =
      environmentSummary(
        plan.environment_intent,
        resolvedEnvironment.binding,
        resolvedEnvironment.diagnostics,
      );

    if (
      resolvedEnvironment.diagnostics
        .fallback_used
    ) {
      fallbacks.push({
        intent_id:
          plan.environment_intent
            .intent_id,
        resource_kind: "environment",
        fallback_used:
          plan.fallback_policy
            .missing_environment,
        reason:
          resolvedEnvironment.binding
            .fallback.reason ??
          "No reviewed environment was eligible.",
        preserved_entity_id: null,
      });
      warnings.push({
        code:
          "environment_fallback_used",
        intent_id:
          plan.environment_intent
            .intent_id,
        message:
          resolvedEnvironment.binding
            .fallback.reason ??
          "The deterministic environment fallback is active.",
      });
    }
  }

  for (const intent of
    plan.auxiliary_intents) {
    const descriptor =
      classifyAuxiliaryResourceIntent(
        intent,
      );
    auxiliaryResolutions.push({
      intent,
      descriptor,
    });

    const binding =
      auxiliaryBinding(
        intent,
        descriptor,
      );
    if (binding) {
      auxiliary.push(binding);
      continue;
    }

    if (
      descriptor.fallback_required ||
      intent.required
    ) {
      fallbacks.push({
        intent_id: intent.intent_id,
        resource_kind:
          intent.resource_kind,
        fallback_used:
          plan.fallback_policy
            .missing_auxiliary,
        reason:
          descriptor.reasons.join(
            " ",
          ),
        preserved_entity_id:
          intent.target_entity_id ??
          null,
      });
    }

    warnings.push({
      code:
        `auxiliary_${descriptor.runtime_status}`,
      intent_id: intent.intent_id,
      message:
        `${intent.resource_kind}: ${descriptor.reasons.join(" ")}`,
    });
  }

  const thirdPartyAssets =
    buildThirdPartyAssetManifest(
      modelResolutions
        .map((entry) =>
          entry.result?.asset ?? null,
        )
        .filter(
          (asset): asset is MyWayAssetRecord =>
            Boolean(asset),
        ),
      resolvedAt,
    ).assets;

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
      materials,
      environment,
      auxiliary,
      third_party_assets:
        thirdPartyAssets,
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
    material_resolutions:
      materialResolutions,
    environment_resolution:
      environmentResolution,
    auxiliary_resolutions:
      auxiliaryResolutions,
    snapshot,
    material_snapshot:
      materialSnapshot,
    environment_snapshot:
      environmentSnapshot,
  };
}
