import { resolveMyWayAsset } from "../assets/asset-resolver.server";
import { acquireFromTrellis } from "../assets/providers/trellis-asset-provider.server";
import type { PrimitiveBuilderAssetRequirement } from "../primitive-builder/asset-requirement-plan";
import type {
  PrimitiveSceneGraphNode,
  PrimitiveSceneGraphV2,
} from "../primitive-builder/primitive-scene-graph";
import {
  makeResolvedSceneAssetBinding,
  type PrimitiveBuilderSceneAssetResolution,
} from "./resolved-scene";

function findNode(
  nodes: PrimitiveSceneGraphNode[],
  nodeId: string | undefined,
): PrimitiveSceneGraphNode | null {
  if (!nodeId) return null;

  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const nested = findNode(node.children ?? [], nodeId);
    if (nested) return nested;
  }

  return null;
}

export async function resolvePrimitiveBuilderSceneAssets(
  sceneGraph: PrimitiveSceneGraphV2,
): Promise<PrimitiveBuilderSceneAssetResolution> {
  const bindings: PrimitiveBuilderSceneAssetResolution["bindings"] = [];
  const unresolved: PrimitiveBuilderAssetRequirement[] = [];
  const warnings: string[] = [];

  for (const requirement of sceneGraph.asset_requirements) {
    const result = await resolveMyWayAsset({
      concept: requirement.concept,
      aliases: requirement.aliases,
      semantic_tags: requirement.semantic_tags,
      style_tags: requirement.style_tags,
      target_extent_m: requirement.target_extent_m,
      allow_blenderkit: false,
      allow_trellis: false,
      allow_primitive_fallback: false,
      require_scene_approved: true,
      minimum_match_score: 18,
    });

    warnings.push(
      ...result.warnings.map(
        (warning) => `${requirement.concept}: ${warning}`,
      ),
    );

    if (
      result.ok &&
      result.source === "library" &&
      result.asset
    ) {
      const fallbackNode = findNode(
        sceneGraph.nodes,
        requirement.fallback_node_id,
      );

      bindings.push(
        makeResolvedSceneAssetBinding({
          requirement,
          asset: result.asset,
          motion:
            fallbackNode?.motion as
              | Record<string, unknown>
              | undefined,
          matchScore: result.match_score,
        }),
      );
      continue;
    }

    unresolved.push(requirement);
  }

  return {
    schema_version:
      "primitive_builder_scene_asset_resolution_v1",
    bindings,
    unresolved_requirements: unresolved,
    warnings,
  };
}

export async function generateTrellisPreviewForRequirement(
  requirement: PrimitiveBuilderAssetRequirement,
) {
  const result = await acquireFromTrellis({
    concept: requirement.concept,
    semanticTags: requirement.semantic_tags,
    styleTags: [
      ...requirement.style_tags,
      "complete object",
      "clean detailed geometry",
      "accurate proportions",
    ],
    domain: "primitive_builder_scene",
    targetExtentM: requirement.target_extent_m,
    noTexture: true,
    seed: Math.floor(Math.random() * 2_000_000_000) + 1,
    maxAttempts: 3,
  });

  return {
    asset: result.asset,
    binding: makeResolvedSceneAssetBinding({
      requirement,
      asset: result.asset,
      previewOnly: true,
    }),
  };
}
