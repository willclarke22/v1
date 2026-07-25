import type {
  PrimitiveBuilderAssetRequirement,
  PrimitiveBuilderSurfaceReference,
  PrimitiveBuilderVec3,
} from "../primitive-builder/asset-requirement-plan";
import type {
  PrimitiveSceneGraphNode,
  PrimitiveSceneGraphV2,
  Vec3,
} from "../primitive-builder/primitive-scene-graph";

type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

type Bounds3 = {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
};

type PrimitiveSurface = {
  node_id: string;
  center: Vec3;
  normal: Vec3;
  u_axis: Vec3;
  v_axis: Vec3;
  size: [number, number];
  area: number;
  confidence: number;
};

type WorldNode = {
  node: PrimitiveSceneGraphNode;
  matrix: Mat4;
  bounds: Bounds3 | null;
  support_surface: PrimitiveSurface | null;
  ancestor_ids: string[];
};

const EPSILON = 1e-6;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
  ];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  ];
}

function multiplyScalar(value: Vec3, scalar: number): Vec3 {
  return [
    value[0] * scalar,
    value[1] * scalar,
    value[2] * scalar,
  ];
}

function dot(a: Vec3, b: Vec3) {
  return (
    a[0] * b[0] +
    a[1] * b[1] +
    a[2] * b[2]
  );
}

function length(value: Vec3) {
  return Math.hypot(
    value[0],
    value[1],
    value[2],
  );
}

function normalize(
  value: Vec3,
  fallback: Vec3,
): Vec3 {
  const magnitude = length(value);
  if (magnitude <= EPSILON) return fallback;

  return multiplyScalar(value, 1 / magnitude);
}

function identityMatrix(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function multiplyMatrix(a: Mat4, b: Mat4): Mat4 {
  const output = new Array(16).fill(0) as Mat4;

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;

      for (let index = 0; index < 4; index += 1) {
        value +=
          a[row * 4 + index] *
          b[index * 4 + column];
      }

      output[row * 4 + column] = value;
    }
  }

  return output;
}

function translationMatrix(value: Vec3): Mat4 {
  return [
    1, 0, 0, value[0],
    0, 1, 0, value[1],
    0, 0, 1, value[2],
    0, 0, 0, 1,
  ];
}

function scaleMatrix(value: Vec3): Mat4 {
  return [
    value[0], 0, 0, 0,
    0, value[1], 0, 0,
    0, 0, value[2], 0,
    0, 0, 0, 1,
  ];
}

function rotationMatrix(value: Vec3): Mat4 {
  const [x, y, z] = value;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  const rotateX: Mat4 = [
    1, 0, 0, 0,
    0, cx, -sx, 0,
    0, sx, cx, 0,
    0, 0, 0, 1,
  ];
  const rotateY: Mat4 = [
    cy, 0, sy, 0,
    0, 1, 0, 0,
    -sy, 0, cy, 0,
    0, 0, 0, 1,
  ];
  const rotateZ: Mat4 = [
    cz, -sz, 0, 0,
    sz, cz, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];

  return multiplyMatrix(
    multiplyMatrix(rotateZ, rotateY),
    rotateX,
  );
}

function localMatrix(
  node: PrimitiveSceneGraphNode,
): Mat4 {
  return multiplyMatrix(
    translationMatrix(node.position ?? [0, 0, 0]),
    multiplyMatrix(
      rotationMatrix(node.rotation ?? [0, 0, 0]),
      scaleMatrix(
        node.kind === "group"
          ? [1, 1, 1]
          : node.scale ?? [1, 1, 1],
      ),
    ),
  );
}

function transformPoint(
  matrix: Mat4,
  point: Vec3,
): Vec3 {
  return [
    matrix[0] * point[0] +
      matrix[1] * point[1] +
      matrix[2] * point[2] +
      matrix[3],
    matrix[4] * point[0] +
      matrix[5] * point[1] +
      matrix[6] * point[2] +
      matrix[7],
    matrix[8] * point[0] +
      matrix[9] * point[1] +
      matrix[10] * point[2] +
      matrix[11],
  ];
}

function transformDirection(
  matrix: Mat4,
  direction: Vec3,
): Vec3 {
  return normalize(
    [
      matrix[0] * direction[0] +
        matrix[1] * direction[1] +
        matrix[2] * direction[2],
      matrix[4] * direction[0] +
        matrix[5] * direction[1] +
        matrix[6] * direction[2],
      matrix[8] * direction[0] +
        matrix[9] * direction[1] +
        matrix[10] * direction[2],
    ],
    direction,
  );
}

function boundsFromPoints(
  points: Vec3[],
): Bounds3 | null {
  if (!points.length) return null;

  const minimum: Vec3 = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const maximum: Vec3 = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(
        minimum[axis],
        point[axis],
      );
      maximum[axis] = Math.max(
        maximum[axis],
        point[axis],
      );
    }
  }

  const size: Vec3 = [
    Math.max(EPSILON, maximum[0] - minimum[0]),
    Math.max(EPSILON, maximum[1] - minimum[1]),
    Math.max(EPSILON, maximum[2] - minimum[2]),
  ];

  return {
    min: minimum,
    max: maximum,
    size,
    center: [
      (minimum[0] + maximum[0]) / 2,
      (minimum[1] + maximum[1]) / 2,
      (minimum[2] + maximum[2]) / 2,
    ],
  };
}

function primitiveBounds(
  node: PrimitiveSceneGraphNode,
  matrix: Mat4,
): Bounds3 | null {
  if (node.kind === "group") return null;

  // Scene primitives use a unit local contract. The matrix already applies
  // model-authored scale and rotation.
  const points: Vec3[] = [];

  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        points.push(
          transformPoint(matrix, [x, y, z]),
        );
      }
    }
  }

  return boundsFromPoints(points);
}

function supportSurface(
  node: PrimitiveSceneGraphNode,
  matrix: Mat4,
  bounds: Bounds3 | null,
): PrimitiveSurface | null {
  if (!bounds || node.kind === "group") return null;

  const normal = transformDirection(
    matrix,
    [0, 1, 0],
  );

  // A support plane is a geometric property: an upward-facing top with a
  // non-trivial two-dimensional footprint. Primitive names are irrelevant.
  if (normal[1] < 0.58) return null;

  const uAxis = transformDirection(
    matrix,
    [1, 0, 0],
  );
  const vAxis = transformDirection(
    matrix,
    [0, 0, 1],
  );
  const center = transformPoint(
    matrix,
    [0, 0.5, 0],
  );
  const uLength = Math.max(
    EPSILON,
    length(
      subtract(
        transformPoint(matrix, [0.5, 0.5, 0]),
        transformPoint(matrix, [-0.5, 0.5, 0]),
      ),
    ),
  );
  const vLength = Math.max(
    EPSILON,
    length(
      subtract(
        transformPoint(matrix, [0, 0.5, 0.5]),
        transformPoint(matrix, [0, 0.5, -0.5]),
      ),
    ),
  );

  return {
    node_id: node.id,
    center,
    normal,
    u_axis: uAxis,
    v_axis: vAxis,
    size: [uLength, vLength],
    area: uLength * vLength,
    confidence:
      node.kind === "plane" ||
      node.kind === "box" ||
      node.kind === "softBox" ||
      node.kind === "cylinder"
        ? 0.9
        : 0.62,
  };
}

function collectWorldNodes(
  nodes: PrimitiveSceneGraphNode[],
  parentMatrix = identityMatrix(),
  output: WorldNode[] = [],
  ancestorIds: string[] = [],
) {
  for (const node of nodes) {
    const matrix = multiplyMatrix(
      parentMatrix,
      localMatrix(node),
    );
    const bounds = primitiveBounds(node, matrix);

    output.push({
      node,
      matrix,
      bounds,
      support_surface: supportSurface(
        node,
        matrix,
        bounds,
      ),
      ancestor_ids: ancestorIds,
    });

    collectWorldNodes(
      node.children ?? [],
      matrix,
      output,
      [...ancestorIds, node.id],
    );
  }

  return output;
}

function mergeBounds(
  values: Array<Bounds3 | null>,
): Bounds3 | null {
  const points: Vec3[] = [];

  for (const value of values) {
    if (!value) continue;
    points.push(value.min, value.max);
  }

  return boundsFromPoints(points);
}

function requirementNodeIds(
  requirement: PrimitiveBuilderAssetRequirement,
  worldById: Map<string, WorldNode>,
) {
  const roots = new Set([
    ...requirement.layout_proxy_node_ids,
    ...(requirement.layout_proxy_node_id
      ? [requirement.layout_proxy_node_id]
      : []),
  ]);
  const expanded = new Set(roots);

  for (const entry of worldById.values()) {
    if (
      entry.ancestor_ids.some((ancestorId) =>
        roots.has(ancestorId),
      )
    ) {
      expanded.add(entry.node.id);
    }
  }

  return expanded;
}

function requirementBounds(
  requirement: PrimitiveBuilderAssetRequirement,
  worldById: Map<string, WorldNode>,
) {
  return mergeBounds(
    [...requirementNodeIds(
      requirement,
      worldById,
    )].map(
      (nodeId) =>
        worldById.get(nodeId)?.bounds ?? null,
    ),
  );
}

function requirementSurfaces(
  requirement: PrimitiveBuilderAssetRequirement,
  worldById: Map<string, WorldNode>,
) {
  return [...requirementNodeIds(
    requirement,
    worldById,
  )]
    .map(
      (nodeId) =>
        worldById.get(nodeId)?.support_surface ??
        null,
    )
    .filter(
      (
        value,
      ): value is PrimitiveSurface =>
        Boolean(value),
    );
}

function surfaceReference(
  surface: PrimitiveSurface,
  targetBounds: Bounds3,
): PrimitiveBuilderSurfaceReference {
  const footprintArea = Math.max(
    EPSILON,
    targetBounds.size[0] *
      targetBounds.size[2],
  );

  return {
    center: surface.center,
    normal: surface.normal,
    size: surface.size,
    height_ratio: Math.max(
      0,
      Math.min(
        1.5,
        (surface.center[1] -
          targetBounds.min[1]) /
          targetBounds.size[1],
      ),
    ),
    center_ratio: [
      (surface.center[0] -
        targetBounds.center[0]) /
        targetBounds.size[0],
      (surface.center[2] -
        targetBounds.center[2]) /
        targetBounds.size[2],
    ],
    size_ratio: [
      surface.size[0] /
        targetBounds.size[0],
      surface.size[1] /
        targetBounds.size[2],
    ],
    area_ratio:
      surface.area / footprintArea,
    confidence: surface.confidence,
  };
}

function preferredUv(
  point: Vec3,
  surface: PrimitiveSurface,
): [number, number] {
  const delta = subtract(point, surface.center);

  return [
    Math.max(
      -0.95,
      Math.min(
        0.95,
        dot(delta, surface.u_axis) /
          Math.max(
            EPSILON,
            surface.size[0] / 2,
          ),
      ),
    ),
    Math.max(
      -0.95,
      Math.min(
        0.95,
        dot(delta, surface.v_axis) /
          Math.max(
            EPSILON,
            surface.size[1] / 2,
          ),
      ),
    ),
  ];
}

function relationCandidate(input: {
  childBounds: Bounds3;
  targetBounds: Bounds3;
  surface: PrimitiveSurface;
  sceneScale: number;
}) {
  const bottom: Vec3 = [
    input.childBounds.center[0],
    input.childBounds.min[1],
    input.childBounds.center[2],
  ];
  const delta = subtract(
    bottom,
    input.surface.center,
  );
  const verticalGap = dot(
    delta,
    input.surface.normal,
  );
  const u = dot(delta, input.surface.u_axis);
  const v = dot(delta, input.surface.v_axis);
  const uLimit =
    input.surface.size[0] / 2 +
    input.childBounds.size[0] * 0.35;
  const vLimit =
    input.surface.size[1] / 2 +
    input.childBounds.size[2] * 0.35;
  const outsideU = Math.max(
    0,
    Math.abs(u) - uLimit,
  );
  const outsideV = Math.max(
    0,
    Math.abs(v) - vLimit,
  );
  const maxGap = Math.max(
    input.sceneScale * 0.08,
    input.childBounds.size[1] * 1.25,
  );

  if (
    verticalGap < -input.sceneScale * 0.025 ||
    verticalGap > maxGap ||
    outsideU > input.sceneScale * 0.08 ||
    outsideV > input.sceneScale * 0.08
  ) {
    return null;
  }

  const normalizedGap =
    Math.abs(verticalGap) /
    Math.max(input.sceneScale, EPSILON);
  const outsidePenalty =
    (outsideU + outsideV) /
    Math.max(input.sceneScale, EPSILON);
  const areaFit =
    Math.min(
      1,
      input.surface.area /
        Math.max(
          input.childBounds.size[0] *
            input.childBounds.size[2],
          EPSILON,
        ),
    );

  return {
    score:
      input.surface.confidence * 4 +
      areaFit * 2 -
      normalizedGap * 18 -
      outsidePenalty * 20,
    uv: preferredUv(bottom, input.surface),
  };
}

function meaningfulTokens(value: string) {
  const stop = new Set([
    "a",
    "an",
    "and",
    "the",
    "with",
    "of",
    "in",
    "on",
    "to",
    "for",
    "small",
    "large",
    "scene",
    "build",
    "create",
    "show",
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 && !stop.has(token),
    );
}

function hasRequestEvidence(
  node: PrimitiveSceneGraphNode,
  userRequest: string,
) {
  const requested = new Set(
    meaningfulTokens(userRequest),
  );

  return meaningfulTokens(
    `${node.id} ${node.display_name ?? ""}`,
  ).some((token) => requested.has(token));
}

function pruneDecorativeSurfaces(
  sceneGraph: PrimitiveSceneGraphV2,
  requirements: PrimitiveBuilderAssetRequirement[],
  userRequest: string,
  warnings: string[],
) {
  const owned = new Set(
    requirements.flatMap((requirement) => [
      ...requirement.layout_proxy_node_ids,
      ...(requirement.layout_proxy_node_id
        ? [requirement.layout_proxy_node_id]
        : []),
    ]),
  );
  const worldNodes = collectWorldNodes(
    sceneGraph.nodes,
  );
  const boundsById = new Map(
    worldNodes.map((entry) => [
      entry.node.id,
      entry.bounds,
    ]),
  );
  const geometricAreas = worldNodes
    .filter((entry) => entry.bounds)
    .map(
      (entry) =>
        entry.bounds!.size[0] *
        entry.bounds!.size[2],
    )
    .sort((a, b) => a - b);
  const medianArea =
    geometricAreas[
      Math.floor(geometricAreas.length / 2)
    ] ?? 1;
  const removed = new Set<string>();

  function filterNodes(
    nodes: PrimitiveSceneGraphNode[],
  ): PrimitiveSceneGraphNode[] {
    return nodes.flatMap((node) => {
      const children = filterNodes(
        node.children ?? [],
      );
      const candidate = {
        ...node,
        children:
          node.kind === "group"
            ? children
            : node.children,
      };

      if (
        owned.has(node.id) ||
        hasRequestEvidence(node, userRequest) ||
        node.render_policy ===
          "procedural_required"
      ) {
        return [candidate];
      }

      const bounds = boundsById.get(node.id);
      if (!bounds || node.kind === "group") {
        // Empty layout-only groups have no spatial value after their children
        // are removed.
        return node.kind === "group" &&
          children.length === 0
          ? []
          : [candidate];
      }

      const horizontalArea =
        bounds.size[0] * bounds.size[2];
      const isPlanar =
        node.kind === "plane" ||
        bounds.size[1] <=
          Math.max(
            0.08,
            Math.min(
              bounds.size[0],
              bounds.size[2],
            ) * 0.08,
          );
      const dominatesScene =
        horizontalArea >= medianArea * 4;

      if (isPlanar && dominatesScene) {
        removed.add(node.id);
        warnings.push(
          `Removed unrequested layout surface ${node.id} because it dominated the requested composition.`,
        );
        return [];
      }

      return [candidate];
    });
  }

  sceneGraph.nodes = filterNodes(
    sceneGraph.nodes,
  );

  if (!removed.size) return;

  for (const beat of sceneGraph.beats) {
    beat.reveal = beat.reveal.filter(
      (id) => !removed.has(id),
    );
    beat.emphasize = beat.emphasize?.filter(
      (id) => !removed.has(id),
    );
  }
}

function breakPlacementCycles(
  requirements: PrimitiveBuilderAssetRequirement[],
  sceneFloor: number,
  boundsByRequirement: Map<string, Bounds3>,
) {
  const byId = new Map(
    requirements.map((requirement) => [
      requirement.instance_id,
      requirement,
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(
    requirement: PrimitiveBuilderAssetRequirement,
    path: string[],
  ) {
    if (visited.has(requirement.instance_id)) {
      return;
    }

    if (visiting.has(requirement.instance_id)) {
      const cycleStart = path.indexOf(
        requirement.instance_id,
      );
      const cycleIds =
        cycleStart >= 0
          ? path.slice(cycleStart)
          : [requirement.instance_id];
      const candidates = cycleIds
        .map((id) => byId.get(id))
        .filter(
          (
            value,
          ): value is PrimitiveBuilderAssetRequirement =>
            Boolean(value),
        )
        .sort(
          (left, right) =>
            right.target_extent_m -
            left.target_extent_m,
        );
      const root = candidates[0];

      if (root) {
        const bounds =
          boundsByRequirement.get(
            root.instance_id,
          );
        const floorGap = bounds
          ? bounds.min[1] - sceneFloor
          : 0;
        root.placement_relation =
          Math.abs(floorGap) <= 0.08
            ? "on_ground"
            : "absolute";
        root.placement_target_instance_id =
          undefined;
        root.primitive_support_surface =
          undefined;
        root.placement_uv = [0, 0];
      }

      return;
    }

    visiting.add(requirement.instance_id);
    const targetId =
      requirement.placement_target_instance_id;
    const target = targetId
      ? byId.get(targetId)
      : undefined;

    if (target) {
      visit(target, [
        ...path,
        requirement.instance_id,
      ]);
    }

    visiting.delete(requirement.instance_id);
    visited.add(requirement.instance_id);
  }

  for (const requirement of requirements) {
    visit(requirement, []);
  }
}

function explicitPrimitiveSurface(
  requirement: PrimitiveBuilderAssetRequirement,
  target: PrimitiveBuilderAssetRequirement,
  worldById: Map<string, WorldNode>,
) {
  const surfaces = requirementSurfaces(
    target,
    worldById,
  );
  if (!surfaces.length) return undefined;

  const rank =
    requirement.placement_region.vertical_rank;
  const sorted = [...surfaces].sort((left, right) => {
    if (rank === "highest" || rank === "upper") {
      return right.center[1] - left.center[1];
    }
    if (rank === "lowest" || rank === "lower") {
      return left.center[1] - right.center[1];
    }
    return right.area - left.area;
  });
  return sorted[0];
}

export function compilePrimitiveGeometryConstraints(
  sceneGraph: PrimitiveSceneGraphV2,
  requirements: PrimitiveBuilderAssetRequirement[],
  userRequest: string,
  warnings: string[],
) {
  const worldNodes = collectWorldNodes(
    sceneGraph.nodes,
  );
  const worldById = new Map(
    worldNodes.map((entry) => [
      entry.node.id,
      entry,
    ]),
  );
  const boundsByRequirement = new Map<
    string,
    Bounds3
  >();

  for (const requirement of requirements) {
    const bounds = requirementBounds(
      requirement,
      worldById,
    );
    if (bounds) {
      boundsByRequirement.set(
        requirement.instance_id,
        bounds,
      );
    }
  }

  const sceneBounds = mergeBounds([
    ...boundsByRequirement.values(),
  ]);
  const sceneScale = Math.max(
    1,
    ...(sceneBounds?.size ?? [1, 1, 1]),
  );
  const sceneFloor =
    sceneBounds?.min[1] ?? 0;

  const compiled =
    requirements.map((requirement) => {
      const childBounds =
        boundsByRequirement.get(
          requirement.instance_id,
        );
      const replacementNodeIds = Array.from(
        requirementNodeIds(
          requirement,
          worldById,
        ),
      );

      if (!childBounds) {
        return {
          ...requirement,
          layout_proxy_node_ids:
            replacementNodeIds,
          placement_relation:
            "absolute" as const,
          placement_target_instance_id:
            undefined,
          primitive_support_surface:
            undefined,
          placement_uv: [0, 0] as [
            number,
            number,
          ],
        };
      }

      let best:
        | {
            target: PrimitiveBuilderAssetRequirement;
            targetBounds: Bounds3;
            surface: PrimitiveSurface;
            score: number;
            uv: [number, number];
          }
        | undefined;

      for (const target of requirements) {
        if (
          target.instance_id ===
          requirement.instance_id
        ) {
          continue;
        }

        const targetBounds =
          boundsByRequirement.get(
            target.instance_id,
          );
        if (!targetBounds) continue;

        for (const surface of requirementSurfaces(
          target,
          worldById,
        )) {
          const candidate = relationCandidate({
            childBounds,
            targetBounds,
            surface,
            sceneScale,
          });
          if (
            candidate &&
            (!best ||
              candidate.score > best.score)
          ) {
            best = {
              target,
              targetBounds,
              surface,
              score: candidate.score,
              uv: candidate.uv,
            };
          }
        }
      }

      const extent = Math.max(
        ...childBounds.size,
      );
      const base = {
        ...requirement,
        layout_proxy_node_ids:
          replacementNodeIds,
        target_extent_m: Math.max(
          0.05,
          Math.min(20, extent),
        ),
        // Imported GLBs use a bottom-centre local origin. Convert the
        // invisible layout-proxy bounds to the same contract before asset rendering.
        position: [
          childBounds.center[0],
          childBounds.min[1],
          childBounds.center[2],
        ] as Vec3,
        layout_priority: best ? 10 : 0,
      };

      if (requirement.placement_source === "explicit") {
        if (requirement.placement_relation === "on_ground") {
          return {
            ...base,
            placement_relation: "on_ground" as const,
            placement_target_instance_id: undefined,
            primitive_support_surface: undefined,
          };
        }

        const explicitTarget =
          requirement.placement_target_instance_id
            ? requirements.find(
                (candidate) =>
                  candidate.instance_id ===
                  requirement.placement_target_instance_id,
              )
            : undefined;
        if (explicitTarget) {
          const targetBounds =
            boundsByRequirement.get(
              explicitTarget.instance_id,
            );
          const surface =
            requirement.placement_relation ===
            "on_surface"
              ? explicitPrimitiveSurface(
                  requirement,
                  explicitTarget,
                  worldById,
                )
              : undefined;

          return {
            ...base,
            placement_relation:
              requirement.placement_relation,
            placement_target_instance_id:
              explicitTarget.instance_id,
            primitive_support_surface:
              surface && targetBounds
                ? surfaceReference(
                    surface,
                    targetBounds,
                  )
                : requirement.primitive_support_surface,
          };
        }
      }

      if (best && best.score > 0.35) {
        return {
          ...base,
          placement_relation:
            "on_surface" as const,
          placement_source: "inferred" as const,
          placement_target_instance_id:
            best.target.instance_id,
          placement_anchor:
            "geometry_support_surface",
          placement_offset: [0, 0, 0] as Vec3,
          placement_uv: best.uv,
          primitive_support_surface:
            surfaceReference(
              best.surface,
              best.targetBounds,
            ),
        };
      }

      const floorGap =
        childBounds.min[1] - sceneFloor;
      if (
        Math.abs(floorGap) <=
        Math.max(0.04, sceneScale * 0.025)
      ) {
        return {
          ...base,
          placement_relation:
            "on_ground" as const,
          placement_source: "inferred" as const,
          placement_target_instance_id:
            undefined,
          placement_anchor:
            "bottom_contact",
          placement_offset: [
            0,
            -floorGap,
            0,
          ] as Vec3,
          placement_uv: [0, 0] as [
            number,
            number,
          ],
          primitive_support_surface:
            undefined,
        };
      }

      return {
        ...base,
        placement_relation:
          "absolute" as const,
        placement_source: "inferred" as const,
        placement_target_instance_id:
          undefined,
        placement_anchor: "center",
        placement_offset: [0, 0, 0] as Vec3,
        placement_uv: [0, 0] as [
          number,
          number,
        ],
        primitive_support_surface:
          undefined,
      };
    });

  breakPlacementCycles(
    compiled,
    sceneFloor,
    boundsByRequirement,
  );

  pruneDecorativeSurfaces(
    sceneGraph,
    compiled,
    userRequest,
    warnings,
  );

  return compiled;
}
