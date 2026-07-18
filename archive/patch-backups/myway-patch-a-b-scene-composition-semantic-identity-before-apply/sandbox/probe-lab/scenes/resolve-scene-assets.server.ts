import { resolveMyWayAsset } from "../assets/asset-resolver.server";
import {
  assetWithFileStats,
  listMyWayAssets,
} from "../assets/asset-library.server";
import type { MyWayAssetRecord, Vec3 } from "../assets/asset-types";
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

type SceneNodeReference = {
  node: PrimitiveSceneGraphNode;
  parent_id?: string;
  world_position: Vec3;
};

type PromptAssetInference = {
  asset_id: string;
  canonical_label: string;
  matched_phrase: string;
  fallback_node_id: string;
  source:
    | "existing_model_requirement"
    | "matched_scene_node"
    | "created_fallback_node";
};

const TARGET_EXTENT_HINTS: Array<[
  RegExp,
  number,
]> = [
  [/\bpicnic table\b/i, 2.2],
  [/\bcoffee mug\b|\bmug\b|\bcup\b/i, 0.18],
  [/\bapple\b/i, 0.13],
  [/\bpotted plant\b|\bhouse plant\b/i, 0.8],
  [/\bchair\b|\bstool\b/i, 1],
  [/\bbench\b/i, 1.8],
  [/\btable\b/i, 1.8],
  [/\bbarrel\b/i, 0.9],
  [/\bcamera\b/i, 0.3],
  [/\bpot\b|\bpan\b/i, 0.45],
];

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function phraseTokens(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .filter(Boolean);
}

function promptContainsPhrase(
  prompt: string,
  phrase: string,
) {
  const normalizedPrompt =
    ` ${normalizePhrase(prompt)} `;
  const normalizedCandidate =
    normalizePhrase(phrase);

  return (
    normalizedCandidate.length > 0 &&
    normalizedPrompt.includes(
      ` ${normalizedCandidate} `,
    )
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function assetPhrases(asset: MyWayAssetRecord) {
  return uniqueStrings([
    asset.canonical_label,
    asset.display_name,
    ...asset.aliases,
  ]).sort(
    (a, b) =>
      phraseTokens(b).length -
        phraseTokens(a).length ||
      b.length - a.length,
  );
}

function mentionedPhrase(
  prompt: string,
  asset: MyWayAssetRecord,
) {
  return assetPhrases(asset).find((phrase) =>
    promptContainsPhrase(prompt, phrase),
  );
}

function addPosition(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
  ];
}

function flattenNodeReferences(
  nodes: PrimitiveSceneGraphNode[],
  parentPosition: Vec3 = [0, 0, 0],
  parentId?: string,
  output: SceneNodeReference[] = [],
) {
  for (const node of nodes) {
    const worldPosition = addPosition(
      parentPosition,
      node.position ?? [0, 0, 0],
    );
    output.push({
      node,
      parent_id: parentId,
      world_position: worldPosition,
    });
    flattenNodeReferences(
      node.children ?? [],
      worldPosition,
      node.id,
      output,
    );
  }

  return output;
}

function searchableAssetTokens(
  asset: MyWayAssetRecord,
) {
  return new Set(
    uniqueStrings([
      asset.canonical_label,
      asset.display_name,
      ...asset.aliases,
      ...asset.semantic_tags,
    ]).flatMap(phraseTokens),
  );
}

function nodeMatchScore(
  reference: SceneNodeReference,
  asset: MyWayAssetRecord,
) {
  const nodeText = normalizePhrase(
    `${reference.node.id} ${
      reference.node.display_name ?? ""
    }`,
  );
  const nodeTokens = phraseTokens(nodeText);
  const assetTokens = searchableAssetTokens(asset);
  let score = 0;

  for (const phrase of assetPhrases(asset)) {
    const normalized = normalizePhrase(phrase);
    if (!normalized) continue;
    if (nodeText === normalized) score += 140;
    else if (
      ` ${nodeText} `.includes(` ${normalized} `)
    ) {
      score += 90;
    }
  }

  for (const token of nodeTokens) {
    if (assetTokens.has(token)) score += 18;
  }

  if (
    reference.node.kind === "group" &&
    score > 0
  ) {
    score += 12;
  }

  return score;
}

function requirementMatchScore(
  requirement: PrimitiveBuilderAssetRequirement,
  asset: MyWayAssetRecord,
) {
  const requirementText = normalizePhrase(
    [
      requirement.concept,
      ...requirement.aliases,
      ...requirement.semantic_tags,
    ].join(" "),
  );
  const requirementTokens =
    new Set(phraseTokens(requirementText));
  const assetTokens = searchableAssetTokens(asset);
  let score = 0;

  for (const phrase of assetPhrases(asset)) {
    const normalized = normalizePhrase(phrase);
    if (
      normalized &&
      ` ${requirementText} `.includes(
        ` ${normalized} `,
      )
    ) {
      score += 100;
    }
  }

  for (const token of requirementTokens) {
    if (assetTokens.has(token)) score += 15;
  }

  return score;
}

function targetExtentFor(
  asset: MyWayAssetRecord,
  reference?: SceneNodeReference,
) {
  if (reference && reference.node.kind !== "group") {
    const scale =
      reference.node.scale ?? [1, 1, 1];
    const nodeExtent = Math.max(
      ...scale.map((value) =>
        Math.abs(value),
      ),
    );
    if (
      Number.isFinite(nodeExtent) &&
      nodeExtent >= 0.08
    ) {
      return Math.min(6, nodeExtent);
    }
  }

  const searchable = [
    asset.canonical_label,
    asset.display_name,
    ...asset.aliases,
  ].join(" ");

  for (const [pattern, extent] of TARGET_EXTENT_HINTS) {
    if (pattern.test(searchable)) return extent;
  }

  return Math.max(
    0.12,
    Math.min(
      3,
      Math.max(...asset.dimensions_m),
    ),
  );
}

function fallbackKindForNode(
  node: PrimitiveSceneGraphNode,
): PrimitiveBuilderAssetRequirement["fallback_primitive"] {
  if (node.kind === "group") return "group";
  if (node.kind === "softBox") return "softBox";
  if (node.kind === "box") return "box";
  if (node.kind === "cylinder") return "cylinder";
  if (node.kind === "sphere") return "sphere";
  return "softBox";
}

function safeId(value: string) {
  return normalizePhrase(value)
    .replace(/\s+/g, "_")
    .slice(0, 80) || "asset";
}

function uniqueNodeId(
  base: string,
  existingIds: Set<string>,
) {
  let candidate = base;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  existingIds.add(candidate);
  return candidate;
}

function generatedFallbackPosition(
  asset: MyWayAssetRecord,
  index: number,
  largestExtent: number,
): Vec3 {
  const label = normalizePhrase(
    asset.canonical_label,
  );
  const surfaceProp =
    /\b(mug|cup|apple|plate|bowl|bottle|glass)\b/.test(
      label,
    );

  if (index === 0) {
    return [0, largestExtent * 0.24, 0];
  }

  if (surfaceProp) {
    const slot = index - 1;
    return [
      (slot % 3 - 1) * 0.48,
      largestExtent * 0.58,
      Math.floor(slot / 3) * 0.42 - 0.2,
    ];
  }

  const angle = index * 2.25;
  const radius = largestExtent * 0.78 + 0.8;

  return [
    Math.cos(angle) * radius,
    targetExtentFor(asset) * 0.5,
    Math.sin(angle) * radius,
  ];
}

function createFallbackNode(
  sceneGraph: PrimitiveSceneGraphV2,
  asset: MyWayAssetRecord,
  index: number,
  largestExtent: number,
  existingIds: Set<string>,
): SceneNodeReference {
  const nodeId = uniqueNodeId(
    `${safeId(asset.canonical_label)}_asset_fallback`,
    existingIds,
  );
  const extent = targetExtentFor(asset);
  const position = generatedFallbackPosition(
    asset,
    index,
    largestExtent,
  );
  const node: PrimitiveSceneGraphNode = {
    id: nodeId,
    kind: "softBox",
    display_name: asset.canonical_label,
    position,
    scale: [
      extent,
      Math.max(0.08, extent * 0.55),
      Math.max(0.08, extent * 0.8),
    ],
    rotation: [0, 0, 0],
    color: "#64748b",
    radius: 0.08,
    metalness: 0.08,
    roughness: 0.55,
    opacity: 0.82,
  };

  sceneGraph.nodes.push(node);

  for (const beat of sceneGraph.beats) {
    if (!beat.reveal.includes(nodeId)) {
      beat.reveal.push(nodeId);
    }
  }

  return {
    node,
    world_position: position,
  };
}

function requirementForAsset(
  asset: MyWayAssetRecord,
  reference: SceneNodeReference,
  existing?:
    | PrimitiveBuilderAssetRequirement
    | undefined,
): PrimitiveBuilderAssetRequirement {
  return {
    instance_id:
      existing?.instance_id ??
      `${safeId(asset.canonical_label)}_asset`,
    concept: asset.canonical_label,
    aliases: uniqueStrings([
      ...asset.aliases,
      asset.display_name,
    ]),
    semantic_tags: uniqueStrings([
      ...asset.semantic_tags,
      asset.canonical_label,
    ]),
    style_tags: uniqueStrings(asset.style_tags),
    motion_role:
      existing?.motion_role ??
      "static reusable scene object",
    must_be_separate:
      existing?.must_be_separate ?? true,
    reusable: true,
    required: existing?.required ?? true,
    target_extent_m:
      existing?.target_extent_m &&
      existing.target_extent_m >= 0.08
        ? existing.target_extent_m
        : targetExtentFor(asset, reference),
    fallback_primitive: fallbackKindForNode(
      reference.node,
    ),
    fallback_node_id: reference.node.id,
    parent_id:
      existing?.parent_id ??
      reference.parent_id,
    position: reference.world_position,
    rotation:
      existing?.rotation ??
      reference.node.rotation ??
      [0, 0, 0],
    scale: existing?.scale ?? [1, 1, 1],
  };
}

export async function preparePrimitiveBuilderSceneAssets(
  sceneGraph: PrimitiveSceneGraphV2,
  userRequest: string,
): Promise<{
  scene_graph: PrimitiveSceneGraphV2;
  inferred_assets: PromptAssetInference[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const inferredAssets: PromptAssetInference[] = [];
  const fileChecked = await Promise.all(
    (await listMyWayAssets())
      .filter(
        (asset) =>
          asset.scene_review_status === "approved" &&
          asset.safe_to_use_in_sandbox &&
          asset.status !== "rejected",
      )
      .map(async (asset) => ({
        asset,
        file: await assetWithFileStats(asset),
        phrase: mentionedPhrase(userRequest, asset),
      })),
  );
  const mentioned = fileChecked
    .filter(
      (
        candidate,
      ): candidate is typeof candidate & {
        phrase: string;
      } =>
        candidate.file.file_stats.exists &&
        typeof candidate.phrase === "string",
    )
    .sort(
      (a, b) =>
        phraseTokens(b.phrase).length -
          phraseTokens(a.phrase).length ||
        b.phrase.length - a.phrase.length,
    )
    .slice(0, 12);

  if (!mentioned.length) {
    return {
      scene_graph: sceneGraph,
      inferred_assets: [],
      warnings,
    };
  }

  const existingIds = new Set(
    flattenNodeReferences(sceneGraph.nodes).map(
      (reference) => reference.node.id,
    ),
  );
  const largestExtent = Math.max(
    ...mentioned.map(({ asset }) =>
      targetExtentFor(asset),
    ),
    1,
  );
  const nextRequirements = [
    ...sceneGraph.asset_requirements,
  ];
  const claimedRequirementIds = new Set<string>();
  const claimedNodeIds = new Set<string>();

  for (const [index, candidate] of mentioned.entries()) {
    const { asset, phrase } = candidate;
    const references =
      flattenNodeReferences(sceneGraph.nodes);
    const existingRequirement = nextRequirements
      .filter(
        (requirement) =>
          !claimedRequirementIds.has(
            requirement.instance_id,
          ),
      )
      .map((requirement) => ({
        requirement,
        score: requirementMatchScore(
          requirement,
          asset,
        ),
      }))
      .sort((a, b) => b.score - a.score)[0];

    let source: PromptAssetInference["source"];
    let reference: SceneNodeReference | undefined;

    if (
      existingRequirement &&
      existingRequirement.score >= 30
    ) {
      claimedRequirementIds.add(
        existingRequirement.requirement.instance_id,
      );
      reference = references.find(
        (item) =>
          item.node.id ===
          existingRequirement.requirement
            .fallback_node_id,
      );
      source = "existing_model_requirement";
    } else {
      const bestNode = references
        .filter(
          (item) =>
            !claimedNodeIds.has(item.node.id),
        )
        .map((item) => ({
          reference: item,
          score: nodeMatchScore(item, asset),
        }))
        .sort((a, b) => b.score - a.score)[0];

      if (bestNode && bestNode.score >= 18) {
        reference = bestNode.reference;
        source = "matched_scene_node";
      } else {
        reference = createFallbackNode(
          sceneGraph,
          asset,
          index,
          largestExtent,
          existingIds,
        );
        source = "created_fallback_node";
      }
    }

    if (!reference) {
      reference = createFallbackNode(
        sceneGraph,
        asset,
        index,
        largestExtent,
        existingIds,
      );
      source = "created_fallback_node";
    }

    claimedNodeIds.add(reference.node.id);
    const requirement = requirementForAsset(
      asset,
      reference,
      existingRequirement?.score &&
      existingRequirement.score >= 30
        ? existingRequirement.requirement
        : undefined,
    );
    const existingIndex = nextRequirements.findIndex(
      (item) =>
        item.instance_id === requirement.instance_id,
    );

    if (existingIndex >= 0) {
      nextRequirements[existingIndex] = requirement;
    } else {
      nextRequirements.push(requirement);
    }

    inferredAssets.push({
      asset_id: asset.asset_id,
      canonical_label: asset.canonical_label,
      matched_phrase: phrase,
      fallback_node_id: reference.node.id,
      source,
    });
    warnings.push(
      `Prompt phrase "${phrase}" was bound to scene-approved library asset ${asset.asset_id} through ${reference.node.id}.`,
    );
  }

  sceneGraph.asset_requirements =
    nextRequirements;

  return {
    scene_graph: sceneGraph,
    inferred_assets: inferredAssets,
    warnings,
  };
}

function findNode(
  nodes: PrimitiveSceneGraphNode[],
  nodeId: string | undefined,
  parentPosition: Vec3 = [0, 0, 0],
): SceneNodeReference | null {
  if (!nodeId) return null;

  for (const node of nodes) {
    const worldPosition = addPosition(
      parentPosition,
      node.position ?? [0, 0, 0],
    );

    if (node.id === nodeId) {
      return {
        node,
        world_position: worldPosition,
      };
    }

    const nested = findNode(
      node.children ?? [],
      nodeId,
      worldPosition,
    );
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
      const positionedRequirement = fallbackNode
        ? {
            ...requirement,
            position: fallbackNode.world_position,
            rotation:
              fallbackNode.node.rotation ??
              requirement.rotation,
          }
        : requirement;

      bindings.push(
        makeResolvedSceneAssetBinding({
          requirement: positionedRequirement,
          asset: result.asset,
          motion:
            fallbackNode?.node.motion as
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
