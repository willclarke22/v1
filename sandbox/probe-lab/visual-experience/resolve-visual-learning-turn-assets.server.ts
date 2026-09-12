import { BODYPARTS3D_SLP_COLLECTION_ID } from "../assets/bodyparts3d-slp-pilot";
import type { MyWayAssetRecord } from "../assets/asset-types";
import {
  loadReviewedAssetResolverSnapshot,
  resolveReviewedAsset,
} from "../assets/reviewed-asset-resolver.server";
import {
  resolveReviewedSceneResources,
} from "../scene-resources/resolve-reviewed-scene-resources.server";
import type {
  MyWayResolvedVisualLearningTurn,
  RenderBinding,
  SemanticSceneEntity,
  VisualLearningTurnOutput,
} from "./visual-learning-turn";

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function entitiesFromOutput(
  output: VisualLearningTurnOutput,
): SemanticSceneEntity[] {
  if (output.turn_status !== "proceed") {
    return [];
  }

  const visualExperience = asRecord(
    output.visual_experience,
  );
  const scenePlan = asRecord(
    visualExperience?.semantic_scene_plan,
  );

  return Array.isArray(scenePlan?.entities)
    ? scenePlan.entities
        .map((value) => {
          const entity = asRecord(value);
          return entity as
            | SemanticSceneEntity
            | null;
        })
        .filter(
          (
            value,
          ): value is SemanticSceneEntity =>
            Boolean(value),
        )
    : [];
}

type AttachVisualAssetOptions = {
  sandbox_asset_collection_mode?: "bodyparts3d_slp_pilot" | null;
};

function normalizedSemanticName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function findSandboxBodyParts3dPilotAsset(
  assets: MyWayAssetRecord[],
  entity: SemanticSceneEntity,
) {
  const wanted = normalizedSemanticName(entity.display_name);
  const tags = new Set((entity.visual_need.semantic_tags ?? []).map(normalizedSemanticName));
  const candidates = assets.filter((asset) =>
    asset.collection_membership?.collection_id === BODYPARTS3D_SLP_COLLECTION_ID &&
    asset.safe_to_use_in_sandbox &&
    asset.status !== "rejected"
  );
  return candidates.find((asset) => {
    const names = [
      asset.collection_membership?.concept_name ?? "",
      asset.canonical_label,
      asset.display_name,
      ...asset.aliases,
    ].map(normalizedSemanticName).filter(Boolean);
    return names.includes(wanted) || names.some((name) => tags.has(name));
  }) ?? null;
}

function bindingForAsset(entity: SemanticSceneEntity, asset: MyWayAssetRecord, reason: string): RenderBinding {
  return {
    entity_id: entity.id,
    binding: {
      kind: "registered_asset",
      asset_id: asset.asset_id,
      public_path: asset.public_path,
      source_type: asset.source_type,
      scene_review_status: asset.scene_review_status ?? "pending",
      dimensions_m: asset.dimensions_m,
      default_scale: asset.default_scale,
      default_rotation: asset.default_rotation,
      ground_offset_m: asset.ground_offset_m,
      match_score: null,
      reason,
    },
  };
}

export async function attachApprovedAssetsToVisualTurn(
  resolved: MyWayResolvedVisualLearningTurn,
  output: VisualLearningTurnOutput,
  options: AttachVisualAssetOptions = {},
): Promise<MyWayResolvedVisualLearningTurn> {
  if (!resolved.source_output_valid) {
    return resolved;
  }

  const resourceExecution =
    resolved.resource_plan &&
    resolved.resource_plan_validation
      ?.valid !== false
      ? await resolveReviewedSceneResources(
          resolved.resource_plan,
          {
            require_cloud_ready: true,
          },
        )
      : null;
  const sharedSnapshot =
    resourceExecution?.snapshot ??
    (await loadReviewedAssetResolverSnapshot());
  const resultByEntityId =
    new Map(
      (
        resourceExecution
          ?.model_resolutions ?? []
      ).map((entry) => [
        entry.intent.entity_id,
        entry.result,
      ]),
    );

  const entities = entitiesFromOutput(output);
  const byId = new Map(
    entities.map((entity) => [entity.id, entity]),
  );
  const queuedByEntity = new Map(
    resolved.queued_asset_needs.map((need) => [
      need.source_entity_id,
      need,
    ]),
  );
  const bindings: RenderBinding[] = [];
  const resolvedEntityIds =
    new Set<string>();
  const warnings = [
    ...(resolved.asset_resolution_warnings ??
      []),
    ...(
      resourceExecution
        ?.resolved_resources.warnings ??
      []
    ).map((warning) =>
      warning.intent_id
        ? `${warning.intent_id}: ${warning.message}`
        : warning.message,
    ),
  ];

  for (const current of
    resolved.render_bindings) {
    const entity =
      byId.get(current.entity_id);
    const queued =
      queuedByEntity.get(
        current.entity_id,
      );

    if (!entity || !queued) {
      bindings.push(current);
      continue;
    }

    if (options.sandbox_asset_collection_mode === "bodyparts3d_slp_pilot") {
      const pilotAsset = findSandboxBodyParts3dPilotAsset(sharedSnapshot.registry.assets, entity);
      if (pilotAsset) {
        resolvedEntityIds.add(entity.id);
        bindings.push(bindingForAsset(
          entity,
          pilotAsset,
          `Sandbox-only BodyParts3D pilot binding to Needs Review asset ${pilotAsset.asset_id}. This does not approve the asset, verify its identity, or generate an embedding.`,
        ));
        warnings.push(`${entity.display_name}: BodyParts3D pilot used a Needs Review asset under the explicit sandbox collection exception.`);
        continue;
      }
    }

    const sharedResult =
      resultByEntityId.get(entity.id);
    const result =
      sharedResult ??
      (await resolveReviewedAsset(
        {
          concept:
            entity.display_name,
          aliases: [
            entity.visual_need
              .description,
          ],
          semantic_tags:
            entity.visual_need
              .semantic_tags,
          appearance_request: {
            schema_version:
              "myway_asset_appearance_request_v1",
            visual_brief:
              entity.visual_need
                .description,
            required_traits: [],
            preferred_traits: [],
            avoid_traits: [],
          },
          appearance_ranking: false,
          acquisition_policy: "never",
          require_scene_approved: true,
          require_semantic_verified: true,
          require_license_eligible: true,
          require_cloud_ready: true,
          minimum_match_score: 48,
          minimum_match_margin: 6,
          candidate_limit: 8,
          record_reuse: false,
          debug_write: false,
        },
        {
          snapshot:
            sharedSnapshot,
        },
      ));

    warnings.push(
      ...result.warnings.map(
        (warning) =>
          `${entity.display_name}: ${warning}`,
      ),
    );

    if (
      result.ok &&
      result.source === "library" &&
      result.asset
    ) {
      resolvedEntityIds.add(
        entity.id,
      );
      bindings.push({
        entity_id: entity.id,
        binding: {
          kind: "registered_asset",
          asset_id:
            result.asset.asset_id,
          public_path:
            result.asset.public_path,
          source_type:
            result.asset.source_type,
          scene_review_status:
            result.asset
              .scene_review_status ??
            "pending",
          dimensions_m:
            result.asset.dimensions_m,
          default_scale:
            result.asset.default_scale,
          default_rotation:
            result.asset
              .default_rotation,
          ground_offset_m:
            result.asset
              .ground_offset_m,
          match_score:
            result.match_score ??
            null,
          reason:
            result.selection_reason
              ?.summary ??
            `MyWay matched this entity to reviewed asset ${result.asset.asset_id}.`,
        },
      });
      continue;
    }

    bindings.push(current);
  }

  return {
    ...resolved,
    resolved_resources:
      resourceExecution
        ?.resolved_resources ??
      resolved.resolved_resources ??
      null,
    render_bindings: bindings,
    queued_asset_needs:
      resolved.queued_asset_needs.filter(
        (need) =>
          !resolvedEntityIds.has(
            need.source_entity_id,
          ),
      ),
    asset_resolution_warnings:
      Array.from(
        new Set(warnings),
      ),
  };
}
