import {
  loadReviewedAssetResolverSnapshot,
  resolveReviewedAsset,
} from "../assets/reviewed-asset-resolver.server";
import {
  applyLogicalAssetSizing,
  logicalAssetSizeDecision,
} from "../assets/logical-asset-size";
import {
  assetWithFileStats,
  listMyWayAssets,
} from "../assets/asset-library.server";
import type { MyWayAssetRecord, Vec3 } from "../assets/asset-types";
import type { PrimitiveBuilderAssetRequirement } from "../primitive-builder/asset-requirement-plan";
import type {
  PrimitiveSceneGraphNode,
  PrimitiveSceneGraphV2,
} from "../primitive-builder/primitive-scene-graph";
import {
  makeResolvedSceneAssetBinding,
  type PrimitiveBuilderSceneAssetResolution,
} from "./resolved-scene";
import {
  compilePrimitiveGeometryConstraints,
} from "./primitive-geometry-constraints";
import {
  resolveReviewedSceneResources,
} from "../scene-resources/resolve-reviewed-scene-resources.server";

type SceneNodeReference = {
  node: PrimitiveSceneGraphNode;
  parent_id?: string;
  world_position: Vec3;
};

type PromptAssetInference = {
  asset_id: string;
  canonical_label: string;
  matched_phrase: string;
  layout_proxy_node_id: string;
  source:
    | "existing_model_requirement"
    | "matched_scene_node"
    | "created_layout_proxy";
};

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

function assetRuntimeDimensions(
  asset: MyWayAssetRecord,
): Vec3 {
  if (asset.geometry_profile?.local_bounds.size) {
    return asset.geometry_profile.local_bounds.size;
  }

  // Legacy Blender records were captured in Blender Z-up order
  // [x, depth, height]. Runtime scenes are Y-up.
  return [
    asset.dimensions_m[0],
    asset.dimensions_m[2],
    asset.dimensions_m[1],
  ];
}

function targetExtentFor(
  asset: MyWayAssetRecord,
  reference?: SceneNodeReference,
) {
  const proxyHint =
    reference && reference.node.kind !== "group"
      ? Math.max(
          ...(reference.node.scale ?? [0, 0, 0]).map(
            (value) => Math.abs(value),
          ),
        )
      : 0;

  return logicalAssetSizeDecision({
    concept:
      asset.verified_canonical_label ??
      asset.canonical_label,
    aliases: [
      ...(asset.verified_aliases ?? []),
      ...asset.aliases,
    ],
    semanticTags: asset.semantic_tags,
    requestedTargetExtentM:
      Number.isFinite(proxyHint) &&
      proxyHint >= 0.05
        ? proxyHint
        : 0,
  }).target_extent_m;
}

function layoutProxyKindForNode(
  node: PrimitiveSceneGraphNode,
): PrimitiveBuilderAssetRequirement["layout_proxy_kind"] {
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

function isolateLayoutProxyOwnership(
  requirements: PrimitiveBuilderAssetRequirement[],
  sceneGraph: PrimitiveSceneGraphV2,
): PrimitiveBuilderAssetRequirement[] {
  const subtrees = new Map<string, Set<string>>();

  for (const requirement of requirements) {
    subtrees.set(
      requirement.instance_id,
      collectSubtreeNodeIds(
        sceneGraph.nodes,
        requirement.layout_proxy_node_id,
      ),
    );
  }

  return requirements.map((requirement) => {
    const owned = new Set(
      subtrees.get(requirement.instance_id) ?? [],
    );

    // A parent proxy may contain independent child asset proxies. Those child
    // subtrees belong only to their own requirements and must not be consumed
    // by the parent asset.
    for (const other of requirements) {
      if (
        other.instance_id ===
        requirement.instance_id
      ) {
        continue;
      }

      const otherRoot =
        other.layout_proxy_node_id;
      if (!otherRoot || !owned.has(otherRoot)) {
        continue;
      }

      for (
        const nodeId of
        subtrees.get(other.instance_id) ?? []
      ) {
        owned.delete(nodeId);
      }
    }

    if (requirement.layout_proxy_node_id) {
      owned.add(requirement.layout_proxy_node_id);
    }

    return {
      ...requirement,
      layout_proxy_node_ids:
        Array.from(owned),
    };
  });
}

function decorateRequirementsForComposition(
  requirements: PrimitiveBuilderAssetRequirement[],
  sceneGraph: PrimitiveSceneGraphV2,
  _assetsByInstanceId: Map<string, MyWayAssetRecord>,
  userRequest: string,
  warnings: string[],
): PrimitiveBuilderAssetRequirement[] {
  const withOwnership =
    isolateLayoutProxyOwnership(
      requirements,
      sceneGraph,
    );

  return compilePrimitiveGeometryConstraints(
    sceneGraph,
    withOwnership,
    userRequest,
    warnings,
  );
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

function generatedLayoutProxyPosition(
  asset: MyWayAssetRecord,
  index: number,
  largestExtent: number,
): Vec3 {
  const extent = targetExtentFor(asset);
  const goldenAngle =
    Math.PI * (3 - Math.sqrt(5));
  const radius =
    index === 0
      ? 0
      : Math.max(
          largestExtent * 0.65,
          extent,
        ) *
        Math.sqrt(index) *
        0.85;
  const angle = index * goldenAngle;

  return [
    Math.cos(angle) * radius,
    extent * 0.5,
    Math.sin(angle) * radius,
  ];
}

function createLayoutProxyNode(
  sceneGraph: PrimitiveSceneGraphV2,
  asset: MyWayAssetRecord,
  index: number,
  largestExtent: number,
  existingIds: Set<string>,
): SceneNodeReference {
  const nodeId = uniqueNodeId(
    `${safeId(asset.verified_canonical_label ?? asset.canonical_label)}_layout_proxy`,
    existingIds,
  );
  const extent = targetExtentFor(asset);
  const position = generatedLayoutProxyPosition(
    asset,
    index,
    largestExtent,
  );
  const natural = assetRuntimeDimensions(asset);
  const longest = Math.max(
    0.001,
    ...natural.map((value) =>
      Math.abs(value),
    ),
  );
  const node: PrimitiveSceneGraphNode = {
    id: nodeId,
    kind: "softBox",
    display_name: asset.verified_canonical_label ?? asset.canonical_label,
    position,
    scale: natural.map((value) =>
      Math.max(
        0.04,
        (Math.abs(value) / longest) * extent,
      ),
    ) as Vec3,
    rotation: [0, 0, 0],
    color: "#64748b",
    radius: 0.08,
    metalness: 0.08,
    roughness: 0.55,
    opacity: 0.82,
    render_policy: "layout_proxy",
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
      ...asset.aliases,
      asset.source_display_name ??
        asset.display_name,
    ]),
    semantic_tags: uniqueStrings([
      ...asset.semantic_tags,
      ...(asset.contains ?? []),
      verifiedLabel,
    ]),
    appearance_request:
      existing?.appearance_request,
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
    layout_proxy_kind: layoutProxyKindForNode(
      reference.node,
    ),
    layout_proxy_node_id: reference.node.id,
    parent_id:
      existing?.parent_id ??
      reference.parent_id,
    layout_proxy_node_ids:
      existing?.layout_proxy_node_ids ?? [
        reference.node.id,
      ],
    placement_relation:
      existing?.placement_relation ??
      "absolute",
    placement_target_instance_id:
      existing?.placement_target_instance_id,
    placement_anchor:
      existing?.placement_anchor ?? "center",
    placement_region:
      existing?.placement_region ?? {
        region_kind: "any",
        exposure: "any",
        orientation: "any",
        vertical_rank: "any",
        openness: "any",
        side: "any",
        require_ground_contact: false,
        allow_intersection: false,
      },
    placement_source:
      existing?.placement_source ?? "inferred",
    placement_offset:
      existing?.placement_offset ?? [0, 0, 0],
    placement_uv:
      existing?.placement_uv ?? [0, 0],
    primitive_support_surface:
      existing?.primitive_support_surface,
    layout_priority:
      existing?.layout_priority ?? 0,
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
        warnings,
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
            .layout_proxy_node_id,
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
        reference = createLayoutProxyNode(
          sceneGraph,
          asset,
          index,
          largestExtent,
          existingIds,
        );
        source = "created_layout_proxy";
      }
    }

    if (!reference) {
      reference = createLayoutProxyNode(
        sceneGraph,
        asset,
        index,
        largestExtent,
        existingIds,
      );
      source = "created_layout_proxy";
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
      layout_proxy_node_id: reference.node.id,
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
      warnings,
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
  const unresolvedDiagnostics:
    NonNullable<
      PrimitiveBuilderSceneAssetResolution["unresolved_diagnostics"]
    > = [];
  const warnings: string[] = [];
  const sized = applyLogicalAssetSizing(
    sceneGraph.asset_requirements,
    sceneGraph.user_request,
  );
  sceneGraph.asset_requirements =
    sized.requirements;

  const resourceExecution =
    sceneGraph.resource_plan &&
    sceneGraph.resource_plan_validation
      ?.valid !== false
      ? await resolveReviewedSceneResources(
          sceneGraph.resource_plan,
          {
            require_cloud_ready: true,
          },
        )
      : null;
  const resourceResultByEntityId =
    new Map(
      (
        resourceExecution
          ?.model_resolutions ?? []
      ).map((entry) => [
        entry.intent.entity_id,
        entry.result,
      ]),
    );
  const sharedSnapshot =
    resourceExecution?.snapshot ??
    (await loadReviewedAssetResolverSnapshot());

  if (resourceExecution) {
    warnings.push(
      ...resourceExecution
        .resolved_resources.warnings.map(
          (warning) =>
            warning.intent_id
              ? `${warning.intent_id}: ${warning.message}`
              : warning.message,
        ),
    );
  }

  for (const requirement of sized.requirements) {
    const sizeDecision =
      sized.decisions.get(
        requirement.instance_id,
      );

    if (
      sizeDecision &&
      sizeDecision.requested_target_extent_m > 0 &&
      Math.abs(
        sizeDecision.target_extent_m -
          sizeDecision.requested_target_extent_m,
      ) >= 0.08
    ) {
      warnings.push(
        `${requirement.concept}: logical size adjusted from ${sizeDecision.requested_target_extent_m.toFixed(2)} m to ${sizeDecision.target_extent_m.toFixed(2)} m. ${sizeDecision.reason}`,
      );
    }
    const sharedResult =
      resourceResultByEntityId.get(
        requirement.instance_id,
      );
    const result =
      sharedResult ??
      (await resolveReviewedAsset(
        {
          concept:
            requirement.concept,
          aliases:
            requirement.aliases,
          semantic_tags:
            requirement.semantic_tags,
          appearance_request:
            requirement.appearance_request,
          appearance_ranking: false,
          target_extent_m:
            requirement.target_extent_m,
          desired_composition:
            requirement.must_be_separate
              ? "single_object"
              : undefined,
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
          snapshot: sharedSnapshot,
        },
      ));

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
        requirement.layout_proxy_node_id,
      );
      const positionedRequirement = requirement;

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
          appearanceRanking:
            result.appearance_ranking,
          selectedScore:
            result.candidate_scores?.find(
              (candidate) =>
                candidate.asset_id ===
                result.asset?.asset_id,
            ),
          sizeDecision,
        }),
      );
      continue;
    }

    unresolved.push(requirement);
    unresolvedDiagnostics.push({
      instance_id: requirement.instance_id,
      concept: requirement.concept,
      reason:
        result.failure_reason ??
        `No approved ${requirement.concept} asset could be resolved.`,
      warnings: result.warnings,
      candidate_scores:
        result.candidate_scores ?? [],
      appearance_ranking:
        result.appearance_ranking,
    });
  }

  return {
    schema_version:
      "primitive_builder_scene_asset_resolution_v2",
    director_plan:
      sceneGraph.director_plan,
    director_validation:
      sceneGraph.director_validation,
    resource_plan:
      sceneGraph.resource_plan,
    resource_plan_validation:
      sceneGraph.resource_plan_validation,
    resolved_resources:
      resourceExecution
        ?.resolved_resources,
    bindings,
    unresolved_requirements: unresolved,
    unresolved_diagnostics:
      unresolvedDiagnostics,
    warnings,
  };
}
