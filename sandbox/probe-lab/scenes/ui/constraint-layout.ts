import type {
  ResolvedAssetRuntimeMetrics,
  ResolvedAssetRuntimeSupportSurface,
  Vec3,
} from "./resolved-asset-model";
import type {
  ResolvedSceneAssetBinding,
} from "../resolved-scene";

type SurfacePlacement = {
  target_instance_id: string;
  surface: ResolvedAssetRuntimeSupportSurface;
  preferred_uv: [number, number];
};

type Rect2 = {
  center: [number, number];
  half: [number, number];
};

const EPSILON = 1e-6;

function add(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
  ];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [
    value[0] * scalar,
    value[1] * scalar,
    value[2] * scalar,
  ];
}

function distanceScore(
  surface: ResolvedAssetRuntimeSupportSurface,
  binding: ResolvedSceneAssetBinding,
) {
  const reference =
    binding.primitive_support_surface;

  if (!reference) {
    return (
      surface.confidence * 3 +
      Math.min(2, surface.area)
    );
  }

  const heightDelta = Math.abs(
    surface.height_ratio -
      reference.height_ratio,
  );
  const sizeDelta =
    Math.abs(
      Math.log(
        Math.max(
          EPSILON,
          surface.size_ratio[0],
        ) /
          Math.max(
            EPSILON,
            reference.size_ratio[0],
          ),
      ),
    ) +
    Math.abs(
      Math.log(
        Math.max(
          EPSILON,
          surface.size_ratio[1],
        ) /
          Math.max(
            EPSILON,
            reference.size_ratio[1],
          ),
      ),
    );
  const areaDelta = Math.abs(
    Math.log(
      Math.max(
        EPSILON,
        surface.size_ratio[0] *
          surface.size_ratio[1],
      ) /
        Math.max(
          EPSILON,
          reference.area_ratio,
        ),
    ),
  );

  return (
    surface.confidence * 4 -
    heightDelta * 6 -
    sizeDelta * 1.4 -
    areaDelta * 0.8
  );
}

function fallbackSurface(
  metrics: ResolvedAssetRuntimeMetrics,
): ResolvedAssetRuntimeSupportSurface {
  return {
    id: "bounds_top_fallback",
    center_offset: [
      0,
      metrics.world_size[1],
      0,
    ],
    normal: [0, 1, 0],
    u_axis: [1, 0, 0],
    v_axis: [0, 0, 1],
    size: [
      metrics.world_size[0],
      metrics.world_size[2],
    ],
    area:
      metrics.world_size[0] *
      metrics.world_size[2],
    confidence: 0.08,
    height_ratio: 1,
    size_ratio: [1, 1],
  };
}

function selectSurface(
  binding: ResolvedSceneAssetBinding,
  targetMetrics: ResolvedAssetRuntimeMetrics,
) {
  const candidates =
    targetMetrics.support_surfaces.length > 0
      ? targetMetrics.support_surfaces
      : [fallbackSurface(targetMetrics)];

  return [...candidates].sort(
    (left, right) =>
      distanceScore(right, binding) -
      distanceScore(left, binding),
  )[0]!;
}

function worldPointOnSurface(
  targetPosition: Vec3,
  surface: ResolvedAssetRuntimeSupportSurface,
  uv: [number, number],
  clearance: number,
): Vec3 {
  const center = add(
    targetPosition,
    surface.center_offset,
  );
  const alongU = scale(
    surface.u_axis,
    uv[0] * surface.size[0] * 0.5,
  );
  const alongV = scale(
    surface.v_axis,
    uv[1] * surface.size[1] * 0.5,
  );
  const alongNormal = scale(
    surface.normal,
    clearance,
  );

  return add(
    add(add(center, alongU), alongV),
    alongNormal,
  );
}

function overlaps(a: Rect2, b: Rect2) {
  return (
    Math.abs(a.center[0] - b.center[0]) <
      a.half[0] + b.half[0] &&
    Math.abs(a.center[1] - b.center[1]) <
      a.half[1] + b.half[1]
  );
}

function clampUv(
  value: [number, number],
  half: [number, number],
): [number, number] {
  return [
    Math.max(
      -1 + half[0],
      Math.min(1 - half[0], value[0]),
    ),
    Math.max(
      -1 + half[1],
      Math.min(1 - half[1], value[1]),
    ),
  ];
}

function candidateUvs(
  preferred: [number, number],
  half: [number, number],
) {
  const candidates: [number, number][] = [
    clampUv(preferred, half),
  ];
  const goldenAngle =
    Math.PI * (3 - Math.sqrt(5));

  for (let index = 1; index <= 96; index += 1) {
    const radius = Math.min(
      1.35,
      Math.sqrt(index / 96) * 1.35,
    );
    const angle = index * goldenAngle;
    candidates.push(
      clampUv(
        [
          preferred[0] +
            Math.cos(angle) * radius,
          preferred[1] +
            Math.sin(angle) * radius,
        ],
        half,
      ),
    );
  }

  return candidates;
}

function footprintHalf(
  metrics: ResolvedAssetRuntimeMetrics | undefined,
  surface: ResolvedAssetRuntimeSupportSurface,
  clearance: number,
): [number, number] {
  const width =
    metrics?.world_size[0] ?? 0.18;
  const depth =
    metrics?.world_size[2] ?? 0.18;

  return [
    Math.min(
      0.95,
      Math.max(
        0.02,
        (width + clearance * 2) /
          Math.max(surface.size[0], EPSILON),
      ),
    ),
    Math.min(
      0.95,
      Math.max(
        0.02,
        (depth + clearance * 2) /
          Math.max(surface.size[1], EPSILON),
      ),
    ),
  ];
}

function packSurfaceChildren(input: {
  bindings: ResolvedSceneAssetBinding[];
  placements: Map<string, SurfacePlacement>;
  positions: Map<string, Vec3>;
  metrics: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const groups = new Map<
    string,
    ResolvedSceneAssetBinding[]
  >();

  for (const binding of input.bindings) {
    const placement = input.placements.get(
      binding.instance_id,
    );
    if (!placement) continue;

    const key =
      `${placement.target_instance_id}:` +
      placement.surface.id;
    const group = groups.get(key) ?? [];
    group.push(binding);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort((left, right) => {
      const leftMetrics = input.metrics.get(
        left.instance_id,
      );
      const rightMetrics = input.metrics.get(
        right.instance_id,
      );
      const leftArea =
        (leftMetrics?.world_size[0] ?? 0.2) *
        (leftMetrics?.world_size[2] ?? 0.2);
      const rightArea =
        (rightMetrics?.world_size[0] ?? 0.2) *
        (rightMetrics?.world_size[2] ?? 0.2);

      return (
        rightArea - leftArea ||
        right.layout_priority -
          left.layout_priority ||
        left.instance_id.localeCompare(
          right.instance_id,
        )
      );
    });

    const occupied: Rect2[] = [];

    for (const binding of group) {
      const placement = input.placements.get(
        binding.instance_id,
      )!;
      const targetPosition = input.positions.get(
        placement.target_instance_id,
      );
      if (!targetPosition) continue;

      const half = footprintHalf(
        input.metrics.get(binding.instance_id),
        placement.surface,
        binding.clearance_m,
      );
      let selected = clampUv(
        placement.preferred_uv,
        half,
      );
      let bestCost = Number.POSITIVE_INFINITY;

      for (const candidate of candidateUvs(
        placement.preferred_uv,
        half,
      )) {
        const rect: Rect2 = {
          center: candidate,
          half,
        };
        const collisionCount = occupied.filter(
          (other) => overlaps(rect, other),
        ).length;
        const displacement = Math.hypot(
          candidate[0] -
            placement.preferred_uv[0],
          candidate[1] -
            placement.preferred_uv[1],
        );
        const cost =
          collisionCount * 1000 +
          displacement;

        if (cost < bestCost) {
          bestCost = cost;
          selected = candidate;
        }

        if (collisionCount === 0) break;
      }

      occupied.push({
        center: selected,
        half,
      });
      input.positions.set(
        binding.instance_id,
        worldPointOnSurface(
          targetPosition,
          placement.surface,
          selected,
          Math.max(
            0.002,
            binding.clearance_m,
          ),
        ),
      );
    }
  }
}

function relaxRootCollisions(input: {
  bindings: ResolvedSceneAssetBinding[];
  positions: Map<string, Vec3>;
  metrics: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const roots = input.bindings.filter(
    (binding) =>
      !binding.placement_target_instance_id,
  );

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let moved = false;

    for (
      let leftIndex = 0;
      leftIndex < roots.length;
      leftIndex += 1
    ) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < roots.length;
        rightIndex += 1
      ) {
        const left = roots[leftIndex]!;
        const right = roots[rightIndex]!;
        const leftPosition = input.positions.get(
          left.instance_id,
        );
        const rightPosition = input.positions.get(
          right.instance_id,
        );
        if (!leftPosition || !rightPosition) {
          continue;
        }

        const leftMetrics = input.metrics.get(
          left.instance_id,
        );
        const rightMetrics = input.metrics.get(
          right.instance_id,
        );
        const leftHalf: [number, number] = [
          (leftMetrics?.world_size[0] ??
            left.target_extent_m) /
            2,
          (leftMetrics?.world_size[2] ??
            left.target_extent_m) /
            2,
        ];
        const rightHalf: [number, number] = [
          (rightMetrics?.world_size[0] ??
            right.target_extent_m) /
            2,
          (rightMetrics?.world_size[2] ??
            right.target_extent_m) /
            2,
        ];
        const overlapX =
          leftHalf[0] +
          rightHalf[0] +
          0.04 -
          Math.abs(
            rightPosition[0] - leftPosition[0],
          );
        const overlapZ =
          leftHalf[1] +
          rightHalf[1] +
          0.04 -
          Math.abs(
            rightPosition[2] - leftPosition[2],
          );

        if (overlapX <= 0 || overlapZ <= 0) {
          continue;
        }

        const moveRight =
          right.layout_priority <=
          left.layout_priority;
        const target = moveRight
          ? rightPosition
          : leftPosition;
        const other = moveRight
          ? leftPosition
          : rightPosition;
        const directionX =
          target[0] >= other[0] ? 1 : -1;
        const directionZ =
          target[2] >= other[2] ? 1 : -1;
        const next: Vec3 = [...target] as Vec3;

        if (overlapX < overlapZ) {
          next[0] +=
            directionX * overlapX;
        } else {
          next[2] +=
            directionZ * overlapZ;
        }

        input.positions.set(
          moveRight
            ? right.instance_id
            : left.instance_id,
          next,
        );
        moved = true;
      }
    }

    if (!moved) break;
  }
}

export function solveResolvedAssetLayout(input: {
  bindings: ResolvedSceneAssetBinding[];
  basePositions: Map<string, Vec3>;
  metrics: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const byId = new Map(
    input.bindings.map((binding) => [
      binding.instance_id,
      binding,
    ]),
  );
  const positions = new Map<string, Vec3>();
  const placements = new Map<
    string,
    SurfacePlacement
  >();
  const resolving = new Set<string>();

  function basePosition(
    binding: ResolvedSceneAssetBinding,
  ) {
    return (
      input.basePositions.get(
        binding.instance_id,
      ) ?? binding.position
    );
  }

  function resolveOne(
    binding: ResolvedSceneAssetBinding,
  ): Vec3 {
    const cached = positions.get(
      binding.instance_id,
    );
    if (cached) return cached;

    if (resolving.has(binding.instance_id)) {
      return basePosition(binding);
    }
    resolving.add(binding.instance_id);

    const base = basePosition(binding);
    const offset =
      binding.placement_offset ?? [0, 0, 0];
    let position: Vec3 = [...base] as Vec3;

    if (
      binding.placement_relation === "on_ground"
    ) {
      position = [
        base[0] + offset[0],
        Math.max(0, offset[1]),
        base[2] + offset[2],
      ];
    } else if (
      binding.placement_relation ===
        "on_surface" &&
      binding.placement_target_instance_id
    ) {
      const target = byId.get(
        binding.placement_target_instance_id,
      );
      const targetMetrics = input.metrics.get(
        binding.placement_target_instance_id,
      );

      if (target && targetMetrics) {
        const targetPosition =
          resolveOne(target);
        const surface = selectSurface(
          binding,
          targetMetrics,
        );
        const preferredUv =
          binding.placement_uv ?? [0, 0];
        placements.set(binding.instance_id, {
          target_instance_id:
            target.instance_id,
          surface,
          preferred_uv: preferredUv,
        });
        position = worldPointOnSurface(
          targetPosition,
          surface,
          preferredUv,
          Math.max(
            0.002,
            binding.clearance_m,
          ),
        );
      }
    } else if (
      binding.placement_target_instance_id
    ) {
      const target = byId.get(
        binding.placement_target_instance_id,
      );
      if (target) {
        const targetPosition =
          resolveOne(target);
        position = add(
          targetPosition,
          offset,
        );
      }
    } else if (
      binding.placement_relation !== "absolute"
    ) {
      position = add(base, offset);
    }

    resolving.delete(binding.instance_id);
    positions.set(binding.instance_id, position);
    return position;
  }

  for (const binding of input.bindings) {
    resolveOne(binding);
  }

  packSurfaceChildren({
    bindings: input.bindings,
    placements,
    positions,
    metrics: input.metrics,
  });
  relaxRootCollisions({
    bindings: input.bindings,
    positions,
    metrics: input.metrics,
  });

  return {
    positions,
    surface_placements: placements,
  };
}
