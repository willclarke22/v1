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

export async function attachApprovedAssetsToVisualTurn(
  resolved: MyWayResolvedVisualLearningTurn,
  output: VisualLearningTurnOutput,
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
