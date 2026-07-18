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
    asset.verified_canonical_label ??
      asset.canonical_label,
    ...(asset.verified_aliases ?? []),
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

const GENERIC_SCENE_NODE_TOKENS = new Set([
  "stage",
  "base",
  "floor",
  "ground",
  "environment",
  "background",
  "path",
  "wall",
  "platform",
]);

const IDENTITY_STOP_TOKENS = new Set([
  "small",
  "large",
  "wooden",
  "generic",
  "reusable",
  "realistic",
  "clean",
  "object",
  "asset",
  "set",
]);

function identityPhrases(asset: MyWayAssetRecord) {
  return uniqueStrings([
    asset.verified_canonical_label ??
      asset.canonical_label,
    ...(asset.verified_aliases ?? []),
    asset.source_display_name ??
      asset.display_name,
  ]);
}

function identityTokens(asset: MyWayAssetRecord) {
  return new Set(
    identityPhrases(asset)
      .flatMap(phraseTokens)
      .filter(
        (token) =>
          !IDENTITY_STOP_TOKENS.has(token),
      ),
  );
}

function isGenericEnvironmentNode(
  reference: SceneNodeReference,
) {
  const tokens = phraseTokens(
    `${reference.node.id} ${
      reference.node.display_name ?? ""
    }`,
  );

  return (
    tokens.length > 0 &&
    tokens.every((token) =>
      GENERIC_SCENE_NODE_TOKENS.has(token),
    )
  );
}

function nodeMatchScore(
  reference: SceneNodeReference,
  asset: MyWayAssetRecord,
) {
  if (isGenericEnvironmentNode(reference)) {
    return 0;
  }

  const nodeText = normalizePhrase(
    `${reference.node.id} ${
      reference.node.display_name ?? ""
    }`,
  );
  const nodeTokens = new Set(
    phraseTokens(nodeText).filter(
      (token) =>
        !IDENTITY_STOP_TOKENS.has(token),
    ),
  );
  const assetTokens = identityTokens(asset);
  let score = 0;

  for (const phrase of identityPhrases(asset)) {
    const normalized = normalizePhrase(phrase);
    if (!normalized) continue;

    if (nodeText === normalized) {
      score = Math.max(score, 180);
    } else if (
      ` ${nodeText} `.includes(
        ` ${normalized} `,
      ) ||
      ` ${normalized} `.includes(
        ` ${nodeText} `,
      )
    ) {
      score = Math.max(score, 120);
    }
  }

  let overlap = 0;
  for (const token of nodeTokens) {
    if (assetTokens.has(token)) {
      overlap += 1;
    }
  }

  score += overlap * 24;

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
  const requirementPhrases = uniqueStrings([
    requirement.concept,
    ...requirement.aliases,
  ]);
  const assetIdentityPhrases =
    identityPhrases(asset);
  let score = 0;

  for (const requested of requirementPhrases) {
    const normalizedRequested =
      normalizePhrase(requested);
    if (!normalizedRequested) continue;

    for (const candidate of assetIdentityPhrases) {
      const normalizedCandidate =
        normalizePhrase(candidate);
      if (!normalizedCandidate) continue;

      if (
        normalizedRequested ===
        normalizedCandidate
      ) {
        score = Math.max(score, 200);
      } else if (
        ` ${normalizedRequested} `.includes(
          ` ${normalizedCandidate} `,
        ) ||
        ` ${normalizedCandidate} `.includes(
          ` ${normalizedRequested} `,
        )
      ) {
        score = Math.max(score, 130);
      }
    }
  }

  const requestedTokens = new Set(
    requirementPhrases
      .flatMap(phraseTokens)
      .filter(
        (token) =>
          !IDENTITY_STOP_TOKENS.has(token),
      ),
  );
  const assetTokens = identityTokens(asset);
  let overlap = 0;

  for (const token of requestedTokens) {
    if (assetTokens.has(token)) {
      overlap += 1;
    }
  }

  score += overlap * 22;
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

function collectSubtreeNodeIds(
  nodes: PrimitiveSceneGraphNode[],
  nodeId: string | undefined,
) {
  const ids = new Set<string>();
  if (!nodeId) return ids;

  function visit(node: PrimitiveSceneGraphNode) {
    ids.add(node.id);
    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  function find(nodesToSearch: PrimitiveSceneGraphNode[]) {
    for (const node of nodesToSearch) {
      if (node.id === nodeId) {
        visit(node);
        return true;
      }
      if (find(node.children ?? [])) return true;
    }
    return false;
  }

  find(nodes);
  return ids;
}

const OWNERSHIP_STOP_TOKENS = new Set([
  "asset",
  "object",
  "scene",
  "outdoor",
  "indoor",
  "small",
  "large",
  "wooden",
  "generic",
]);

function ownershipTokens(
  requirement: PrimitiveBuilderAssetRequirement,
) {
  const meaningful = phraseTokens(
    [
      requirement.concept,
      ...requirement.aliases,
    ].join(" "),
  ).filter(
    (token) =>
      !OWNERSHIP_STOP_TOKENS.has(token),
  );

  return Array.from(new Set(meaningful));
}

function inferReplacementNodeIds(
  requirement: PrimitiveBuilderAssetRequirement,
  sceneGraph: PrimitiveSceneGraphV2,
) {
  const owned = collectSubtreeNodeIds(
    sceneGraph.nodes,
    requirement.fallback_node_id,
  );
  for (const id of requirement.replacement_node_ids) {
    owned.add(id);
  }

  const tokens = ownershipTokens(requirement);
  const references =
    flattenNodeReferences(sceneGraph.nodes);

  for (const reference of references) {
    const normalized = normalizePhrase(
      `${reference.node.id} ${
        reference.node.display_name ?? ""
      }`,
    );
    const nodeTokens = phraseTokens(normalized);
    const strongMatches = tokens.filter(
      (token) =>
        token.length >= 4 &&
        nodeTokens.some(
          (candidate) =>
            candidate === token ||
            candidate.startsWith(token) ||
            token.startsWith(candidate),
        ),
    );

    if (strongMatches.length > 0) {
      owned.add(reference.node.id);
    }
  }

  return Array.from(owned);
}

function hasAffordance(
  asset: MyWayAssetRecord | undefined,
  affordance: string,
) {
  return (asset?.affordances ?? []).includes(
    affordance,
  );
}

function supportRequirement(
  requirement: PrimitiveBuilderAssetRequirement,
  asset: MyWayAssetRecord | undefined,
) {
  const text = normalizePhrase(
    [
      requirement.concept,
      ...requirement.aliases,
      ...requirement.semantic_tags,
    ].join(" "),
  );

  return (
    hasAffordance(asset, "support_surface") ||
    /\b(table|desk|counter|shelf|workbench|stand)\b/.test(
      text,
    )
  );
}

function tabletopPropRequirement(
  requirement: PrimitiveBuilderAssetRequirement,
  asset: MyWayAssetRecord | undefined,
) {
  const text = normalizePhrase(
    [
      requirement.concept,
      ...requirement.aliases,
      ...requirement.semantic_tags,
    ].join(" "),
  );

  if (
    hasAffordance(asset, "floor_standing") ||
    /\b(plant|tree|lamp|chair|bench|table|cabinet|dresser|refrigerator)\b/.test(
      text,
    )
  ) {
    return false;
  }

  return (
    hasAffordance(asset, "tabletop_prop") ||
    requirement.target_extent_m <= 0.55 ||
    /\b(mug|cup|glass|apple|fruit|plate|bowl|book|bottle|tool|phone)\b/.test(
      text,
    )
  );
}

function explicitlyRequestsSurfacePlacement(
  requirement: PrimitiveBuilderAssetRequirement,
  userRequest: string,
) {
  const prompt = normalizePhrase(userRequest);
  const names = uniqueStrings([
    requirement.concept,
    ...requirement.aliases,
  ]).map(normalizePhrase);
  const surfaces =
    "(?:the )?(?:table|picnic table|desk|counter|shelf|workbench)";

  return names.some((name) => {
    if (!name) return false;

    return new RegExp(
      `\\b${name.replace(
        /[.*+?^${}()|[\\]\\\\]/g,
        "\\\\$&",
      )}\\b.{0,24}\\b(?:on|on top of|upon) ${surfaces}\\b`,
    ).test(prompt);
  });
}

function floorStandingRequirement(
  requirement: PrimitiveBuilderAssetRequirement,
  asset: MyWayAssetRecord | undefined,
) {
  const text = normalizePhrase(
    [
      requirement.concept,
      ...requirement.aliases,
      ...requirement.semantic_tags,
    ].join(" "),
  );

  return (
    supportRequirement(requirement, asset) ||
    hasAffordance(asset, "floor_standing") ||
    /\b(plant|tree|lamp|chair|bench|sofa|couch|cabinet|dresser|appliance)\b/.test(
      text,
    )
  );
}

function clampPlacementOffset(
  value: number,
  extent: number,
) {
  const limit = Math.max(0.15, extent * 0.28);
  return Math.max(-limit, Math.min(limit, value));
}

function decorateRequirementsForComposition(
  requirements: PrimitiveBuilderAssetRequirement[],
  sceneGraph: PrimitiveSceneGraphV2,
  assetsByInstanceId: Map<string, MyWayAssetRecord>,
  userRequest: string,
): PrimitiveBuilderAssetRequirement[] {
  const supportRequirements = requirements.filter(
    (requirement) =>
      supportRequirement(
        requirement,
        assetsByInstanceId.get(
          requirement.instance_id,
        ),
      ),
  );

  let propSlot = 0;

  return requirements.map((requirement) => {
    const asset = assetsByInstanceId.get(
      requirement.instance_id,
    );
    const next: PrimitiveBuilderAssetRequirement = {
      ...requirement,
      replacement_node_ids:
        inferReplacementNodeIds(
          requirement,
          sceneGraph,
        ),
    };

    if (
      next.placement_relation !== "absolute"
    ) {
      return next;
    }

    if (
      (
        explicitlyRequestsSurfacePlacement(
          next,
          userRequest,
        ) ||
        tabletopPropRequirement(next, asset)
      ) &&
      supportRequirements.length > 0
    ) {
      const target =
        supportRequirements[
          propSlot % supportRequirements.length
        ]!;
      const relativeX =
        next.position[0] - target.position[0];
      const relativeZ =
        next.position[2] - target.position[2];
      const fallbackOffsets: Vec3[] = [
        [-0.28, 0, -0.12],
        [0.22, 0, 0.08],
        [0, 0, 0.22],
        [0.34, 0, -0.22],
      ];
      const fallback =
        fallbackOffsets[
          propSlot % fallbackOffsets.length
        ]!;
      propSlot += 1;

      return {
        ...next,
        placement_relation: "on_surface" as const,
        placement_target_instance_id:
          target.instance_id,
        placement_anchor: "top",
        placement_offset: [
          Number.isFinite(relativeX)
            ? clampPlacementOffset(
                relativeX,
                target.target_extent_m,
              )
            : fallback[0],
          0,
          Number.isFinite(relativeZ)
            ? clampPlacementOffset(
                relativeZ,
                target.target_extent_m,
              )
            : fallback[2],
        ] as Vec3,
        clearance_m: Math.max(
          0.008,
          next.clearance_m,
        ),
      };
    }

    if (floorStandingRequirement(next, asset)) {
      return {
        ...next,
        placement_relation: "on_ground" as const,
        placement_anchor: "bottom",
        position: [
          next.position[0],
          0,
          next.position[2],
        ],
      };
    }

    return next;
  });
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
    asset.verified_canonical_label ??
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
    `${safeId(asset.verified_canonical_label ?? asset.canonical_label)}_asset_fallback`,
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
    display_name: asset.verified_canonical_label ?? asset.canonical_label,
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
  const verifiedLabel =
    asset.verified_canonical_label ??
    asset.canonical_label;

  return {
    instance_id:
      existing?.instance_id ??
      `${safeId(verifiedLabel)}_asset`,
    concept: verifiedLabel,
    aliases: uniqueStrings([
      ...(asset.verified_aliases ?? []),
      asset.source_display_name ??
        asset.display_name,
    ]),
    semantic_tags: uniqueStrings([
      ...asset.semantic_tags,
      ...(asset.affordances ?? []),
      ...(asset.contains ?? []),
      verifiedLabel,
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
    replacement_node_ids:
      existing?.replacement_node_ids ?? [
        reference.node.id,
      ],
    placement_relation:
      existing?.placement_relation ??
      "absolute",
    placement_target_instance_id:
      existing?.placement_target_instance_id,
    placement_anchor:
      existing?.placement_anchor ?? "center",
    placement_offset:
      existing?.placement_offset ?? [0, 0, 0],
    clearance_m:
      existing?.clearance_m ?? 0.01,
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
          asset.semantic_review_status === "verified" &&
          asset.safe_to_use_in_sandbox &&
          asset.status !== "rejected",
      )
      .map(async (asset) => ({
        asset,
        file: await assetWithFileStats(asset),
        phrase: mentionedPhrase(userRequest, asset),
      })),
  );
  const mentionedCandidates = fileChecked
    .filter(
      (
        candidate,
      ): candidate is typeof candidate & {
        phrase: string;
      } =>
        candidate.file.file_stats.exists &&
        typeof candidate.phrase === "string",
    )
    .sort((a, b) => {
      const concept =
        normalizePhrase(a.phrase);
      const aPreferred = (
        a.asset.preferred_for_concepts ?? []
      )
        .map(normalizePhrase)
        .includes(concept)
        ? 1
        : 0;
      const bPreferred = (
        b.asset.preferred_for_concepts ?? []
      )
        .map(normalizePhrase)
        .includes(
          normalizePhrase(b.phrase),
        )
        ? 1
        : 0;

      return (
        bPreferred - aPreferred ||
        b.asset.quality_score -
          a.asset.quality_score ||
        (a.asset.file_size_bytes ??
          Number.MAX_SAFE_INTEGER) -
          (b.asset.file_size_bytes ??
            Number.MAX_SAFE_INTEGER)
      );
    });
  const mentionedByPhrase = new Map<
    string,
    (typeof mentionedCandidates)[number]
  >();

  for (const candidate of mentionedCandidates) {
    const key = normalizePhrase(
      candidate.phrase,
    );
    if (!mentionedByPhrase.has(key)) {
      mentionedByPhrase.set(key, candidate);
    }
  }

  const mentioned = [
    ...mentionedByPhrase.values(),
  ]
    .sort(
      (a, b) =>
        phraseTokens(b.phrase).length -
          phraseTokens(a.phrase).length ||
        b.phrase.length - a.phrase.length,
    )
    .slice(0, 12);

  if (!mentioned.length) {
    sceneGraph.asset_requirements =
      decorateRequirementsForComposition(
        sceneGraph.asset_requirements,
        sceneGraph,
        new Map(),
        userRequest,
      );

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
  const assetsByInstanceId =
    new Map<string, MyWayAssetRecord>();

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
      existingRequirement.score >= 90
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

      if (bestNode && bestNode.score >= 70) {
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
      existingRequirement.score >= 90
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

    claimedRequirementIds.add(
      requirement.instance_id,
    );

    assetsByInstanceId.set(
      requirement.instance_id,
      asset,
    );

    inferredAssets.push({
      asset_id: asset.asset_id,
      canonical_label: asset.verified_canonical_label ?? asset.canonical_label,
      matched_phrase: phrase,
      fallback_node_id: reference.node.id,
      source,
    });
    warnings.push(
      `Prompt phrase "${phrase}" was bound to scene-approved library asset ${asset.asset_id} through ${reference.node.id}.`,
    );
  }

  sceneGraph.asset_requirements =
    decorateRequirementsForComposition(
      nextRequirements,
      sceneGraph,
      assetsByInstanceId,
      userRequest,
    );

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
  const placementTargets = new Set(
    sceneGraph.asset_requirements
      .map(
        (requirement) =>
          requirement.placement_target_instance_id,
      )
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          value.length > 0,
      ),
  );

  for (const requirement of sceneGraph.asset_requirements) {
    const result = await resolveMyWayAsset({
      concept: requirement.concept,
      aliases: requirement.aliases,
      semantic_tags: requirement.semantic_tags,
      style_tags: requirement.style_tags,
      target_extent_m: requirement.target_extent_m,
      required_affordances: [
        ...(placementTargets.has(
          requirement.instance_id,
        )
          ? ["support_surface"]
          : []),
        ...(requirement.placement_relation ===
        "on_surface"
          ? ["tabletop_prop"]
          : []),
      ],
      desired_composition:
        requirement.must_be_separate
          ? "single_object"
          : undefined,
      allow_blenderkit: false,
      allow_trellis: false,
      allow_primitive_fallback: false,
      require_scene_approved: true,
      require_semantic_verified: true,
      minimum_match_score: 48,
      minimum_match_margin: 6,
      candidate_limit: 5,
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
          matchMargin: result.match_margin,
          candidateScores:
            result.candidate_scores,
        }),
      );
      continue;
    }

    unresolved.push(requirement);
  }

  return {
    schema_version:
      "primitive_builder_scene_asset_resolution_v2",
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
