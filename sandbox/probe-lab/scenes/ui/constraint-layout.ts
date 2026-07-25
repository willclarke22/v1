import type {
  ResolvedAssetRuntimeAttachmentRegion,
  ResolvedAssetRuntimeInteriorVolume,
  ResolvedAssetRuntimeMetrics,
  ResolvedAssetRuntimeSupportSurface,
  Vec3,
} from "./resolved-asset-model";
import type {
  ResolvedSceneAssetBinding,
} from "../resolved-scene";

export type ResolvedPlacementStatus =
  | "placed"
  | "adjusted"
  | "provisional"
  | "unresolved";

export type ResolvedPlacementDiagnostic = {
  instance_id: string;
  concept: string;
  status: ResolvedPlacementStatus;
  relation: ResolvedSceneAssetBinding["placement_relation"];
  target_instance_id: string | null;
  region_id: string | null;
  region_label: string | null;
  reason: string | null;
  messages: string[];
  collisions: string[];
  position: Vec3 | null;
};

type SurfacePlacement = {
  target_instance_id: string;
  surface: ResolvedAssetRuntimeSupportSurface;
  preferred_uv: [number, number];
  selected_uv: [number, number];
};

type Aabb = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
};

const EPSILON = 1e-6;
const DEFAULT_CLEARANCE = 0.01;
const MAX_LAYOUT_RADIUS = 12;

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function length(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vec3, fallback: Vec3): Vec3 {
  const magnitude = length(value);
  return magnitude > EPSILON
    ? scale(value, 1 / magnitude)
    : fallback;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fallbackSurface(
  metrics: ResolvedAssetRuntimeMetrics,
): ResolvedAssetRuntimeSupportSurface {
  return {
    id: "bounds_top_fallback",
    label: "Bounds-top provisional region",
    source: "runtime_geometry",
    is_primary: false,
    center_offset: [0, metrics.world_size[1], 0],
    normal: [0, 1, 0],
    u_axis: [1, 0, 0],
    v_axis: [0, 0, 1],
    size: [metrics.world_size[0], metrics.world_size[2]],
    usable_size: [
      Math.max(0.001, metrics.world_size[0] * 0.9),
      Math.max(0.001, metrics.world_size[2] * 0.9),
    ],
    area: metrics.world_size[0] * metrics.world_size[2],
    confidence: 0.08,
    height_ratio: 1,
    size_ratio: [1, 1],
    exposure: "unknown",
    orientation: "upward",
    openness: "unknown",
    vertical_rank: 0,
    clearance_above_m: null,
    blocked_fraction: 0,
    enclosure_confidence: 0,
    edge_margin_m: Math.max(
      0.005,
      Math.min(metrics.world_size[0], metrics.world_size[2]) * 0.05,
    ),
  };
}

function fallbackMetrics(
  binding: ResolvedSceneAssetBinding,
): ResolvedAssetRuntimeMetrics {
  const target = Math.max(0.05, binding.target_extent_m || 1);
  const source = binding.dimensions_m.map((value) =>
    Math.max(0.001, Math.abs(value)),
  ) as Vec3;
  const longest = Math.max(...source);
  const factor = target / Math.max(longest, EPSILON);
  const worldSize = source.map((value) => value * factor) as Vec3;
  const metrics: ResolvedAssetRuntimeMetrics = {
    instance_id: binding.instance_id,
    source_size: source,
    world_size: worldSize,
    bottom_center_offset: [0, 0, 0],
    support_surfaces: [],
    interior_volumes: [],
    attachment_regions: [],
    geometry_confidence: 0.1,
  };
  metrics.support_surfaces = [fallbackSurface(metrics)];
  return metrics;
}

function metricsFor(
  binding: ResolvedSceneAssetBinding,
  metrics: Map<string, ResolvedAssetRuntimeMetrics>,
) {
  return metrics.get(binding.instance_id) ?? fallbackMetrics(binding);
}

function rotationMatrix(binding: ResolvedSceneAssetBinding) {
  const x = binding.rotation[0] + binding.default_rotation[0];
  const y = binding.rotation[1] + binding.default_rotation[1];
  const z = binding.rotation[2] + binding.default_rotation[2];
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  return [
    cy * cz,
    cz * sx * sy - cx * sz,
    sx * sz + cx * cz * sy,
    cy * sz,
    cx * cz + sx * sy * sz,
    cx * sy * sz - cz * sx,
    -sy,
    cy * sx,
    cx * cy,
  ] as const;
}

function rotatedSize(
  binding: ResolvedSceneAssetBinding,
  size: Vec3,
): Vec3 {
  const matrix = rotationMatrix(binding);
  return [
    Math.abs(matrix[0]) * size[0] +
      Math.abs(matrix[1]) * size[1] +
      Math.abs(matrix[2]) * size[2],
    Math.abs(matrix[3]) * size[0] +
      Math.abs(matrix[4]) * size[1] +
      Math.abs(matrix[5]) * size[2],
    Math.abs(matrix[6]) * size[0] +
      Math.abs(matrix[7]) * size[1] +
      Math.abs(matrix[8]) * size[2],
  ];
}

function aabbFor(
  binding: ResolvedSceneAssetBinding,
  position: Vec3,
  metrics: ResolvedAssetRuntimeMetrics,
  padding = 0,
): Aabb {
  const size = rotatedSize(binding, metrics.world_size);
  const center: Vec3 = [
    position[0],
    position[1] + size[1] / 2,
    position[2],
  ];
  return {
    min: [
      center[0] - size[0] / 2 - padding,
      center[1] - size[1] / 2 - padding,
      center[2] - size[2] / 2 - padding,
    ],
    max: [
      center[0] + size[0] / 2 + padding,
      center[1] + size[1] / 2 + padding,
      center[2] + size[2] / 2 + padding,
    ],
    center,
    size,
  };
}

function aabbOverlap(a: Aabb, b: Aabb, tolerance = 0.002) {
  return (
    a.min[0] < b.max[0] - tolerance &&
    a.max[0] > b.min[0] + tolerance &&
    a.min[1] < b.max[1] - tolerance &&
    a.max[1] > b.min[1] + tolerance &&
    a.min[2] < b.max[2] - tolerance &&
    a.max[2] > b.min[2] + tolerance
  );
}

function hierarchyDepth(
  binding: ResolvedSceneAssetBinding,
  byId: Map<string, ResolvedSceneAssetBinding>,
  seen = new Set<string>(),
): number {
  const targetId = binding.placement_target_instance_id;
  if (!targetId || seen.has(targetId)) return 0;
  const target = byId.get(targetId);
  if (!target) return 0;
  seen.add(targetId);
  return 1 + hierarchyDepth(target, byId, seen);
}

function collidingIds(input: {
  binding: ResolvedSceneAssetBinding;
  position: Vec3;
  metrics: ResolvedAssetRuntimeMetrics;
  positions: Map<string, Vec3>;
  bindingsById: Map<string, ResolvedSceneAssetBinding>;
  metricsById: Map<string, ResolvedAssetRuntimeMetrics>;
  exclude?: Set<string>;
}) {
  if (input.binding.placement_region.allow_intersection) return [];
  const candidate = aabbFor(
    input.binding,
    input.position,
    input.metrics,
    Math.max(0.001, input.binding.clearance_m * 0.25),
  );
  const collisions: string[] = [];

  for (const [otherId, otherPosition] of input.positions) {
    if (otherId === input.binding.instance_id || input.exclude?.has(otherId)) {
      continue;
    }
    const other = input.bindingsById.get(otherId);
    if (!other || other.placement_region.allow_intersection) continue;
    const otherMetrics = metricsFor(other, input.metricsById);
    if (aabbOverlap(candidate, aabbFor(other, otherPosition, otherMetrics))) {
      collisions.push(otherId);
    }
  }
  return collisions;
}

function worldPointOnSurface(
  targetPosition: Vec3,
  surface: ResolvedAssetRuntimeSupportSurface,
  uv: [number, number],
  clearance: number,
): Vec3 {
  const center = add(targetPosition, surface.center_offset);
  const alongU = scale(
    surface.u_axis,
    uv[0] * surface.usable_size[0] * 0.5,
  );
  const alongV = scale(
    surface.v_axis,
    uv[1] * surface.usable_size[1] * 0.5,
  );
  return add(
    add(add(center, alongU), alongV),
    scale(surface.normal, clearance),
  );
}

function surfaceFit(
  surface: ResolvedAssetRuntimeSupportSurface,
  child: ResolvedAssetRuntimeMetrics,
  clearance: number,
) {
  const width = child.world_size[0] + clearance * 2;
  const depth = child.world_size[2] + clearance * 2;
  const height = child.world_size[1] + clearance;
  return {
    width,
    depth,
    height,
    fitsFootprint:
      width <= surface.usable_size[0] + EPSILON &&
      depth <= surface.usable_size[1] + EPSILON,
    fitsClearance:
      surface.clearance_above_m == null ||
      height <= surface.clearance_above_m + EPSILON,
    halfUv: [
      clamp(width / Math.max(surface.usable_size[0], EPSILON), 0.01, 0.98),
      clamp(depth / Math.max(surface.usable_size[1], EPSILON), 0.01, 0.98),
    ] as [number, number],
  };
}

function surfacePreferenceScore(
  binding: ResolvedSceneAssetBinding,
  surface: ResolvedAssetRuntimeSupportSurface,
) {
  const preference = binding.placement_region;
  let score = surface.confidence * 4 + Math.min(2, surface.area);
  if (surface.is_primary) score += 1;

  if (preference.exposure !== "any") {
    score += surface.exposure === preference.exposure ? 6 : -10;
  }
  if (preference.orientation !== "any") {
    score += surface.orientation === preference.orientation ? 4 : -8;
  }
  if (preference.openness !== "any") {
    score += surface.openness === preference.openness ? 4 : -7;
  }
  if (preference.vertical_rank === "highest") {
    score += surface.vertical_rank === 0 ? 8 : -surface.vertical_rank * 2;
  } else if (preference.vertical_rank === "upper") {
    score += surface.height_ratio * 5;
  } else if (preference.vertical_rank === "lowest") {
    score += surface.height_ratio <= 0.15 ? 8 : -surface.height_ratio * 5;
  } else if (preference.vertical_rank === "lower") {
    score += (1 - surface.height_ratio) * 5;
  } else if (preference.vertical_rank === "middle") {
    score += 4 - Math.abs(surface.height_ratio - 0.5) * 8;
  }

  const reference = binding.primitive_support_surface;
  if (reference) {
    score -= Math.abs(surface.height_ratio - reference.height_ratio) * 3;
  }
  return score;
}

function candidateUvs(
  preferred: [number, number],
  halfUv: [number, number],
) {
  const clampUv = (value: [number, number]): [number, number] => [
    clamp(value[0], -1 + halfUv[0], 1 - halfUv[0]),
    clamp(value[1], -1 + halfUv[1], 1 - halfUv[1]),
  ];
  const output: [number, number][] = [clampUv(preferred)];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 1; index <= 128; index += 1) {
    const radius = Math.sqrt(index / 128) * 1.45;
    const angle = index * goldenAngle;
    output.push(
      clampUv([
        preferred[0] + Math.cos(angle) * radius,
        preferred[1] + Math.sin(angle) * radius,
      ]),
    );
  }
  return output;
}

function sideOrder(binding: ResolvedSceneAssetBinding) {
  const preferred = binding.placement_region.side;
  const sides = ["right", "left", "front", "back"] as const;
  return preferred === "any"
    ? sides
    : [preferred, ...sides.filter((side) => side !== preferred)];
}

function placeOnSurface(input: {
  binding: ResolvedSceneAssetBinding;
  target: ResolvedSceneAssetBinding;
  targetPosition: Vec3;
  childMetrics: ResolvedAssetRuntimeMetrics;
  targetMetrics: ResolvedAssetRuntimeMetrics;
  positions: Map<string, Vec3>;
  bindingsById: Map<string, ResolvedSceneAssetBinding>;
  metricsById: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const rawCandidates =
    input.targetMetrics.support_surfaces.length > 0
      ? input.targetMetrics.support_surfaces
      : [fallbackSurface(input.targetMetrics)];
  const preference = input.binding.placement_region;
  const candidates = rawCandidates
    .filter((surface) => {
      if (input.binding.placement_source !== "explicit") return true;
      if (
        preference.exposure !== "any" &&
        surface.exposure !== preference.exposure
      ) {
        return false;
      }
      if (
        preference.orientation !== "any" &&
        surface.orientation !== preference.orientation
      ) {
        return false;
      }
      if (
        preference.openness !== "any" &&
        surface.openness !== preference.openness
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        surfacePreferenceScore(input.binding, right) -
        surfacePreferenceScore(input.binding, left),
    );
  const messages: string[] = [];

  for (const surface of candidates) {
    const fit = surfaceFit(
      surface,
      input.childMetrics,
      Math.max(DEFAULT_CLEARANCE, input.binding.clearance_m),
    );
    if (!fit.fitsFootprint) {
      messages.push(
        `${surface.label} is too small for the asset footprint.`,
      );
      continue;
    }
    if (!fit.fitsClearance) {
      messages.push(
        `${surface.label} has ${surface.clearance_above_m?.toFixed(2)} m clearance above, less than the asset requires.`,
      );
      continue;
    }

    for (const uv of candidateUvs(input.binding.placement_uv, fit.halfUv)) {
      const position = worldPointOnSurface(
        input.targetPosition,
        surface,
        uv,
        Math.max(0.002, input.binding.clearance_m),
      );
      const collisions = collidingIds({
        binding: input.binding,
        position,
        metrics: input.childMetrics,
        positions: input.positions,
        bindingsById: input.bindingsById,
        metricsById: input.metricsById,
        exclude: new Set([input.target.instance_id]),
      });
      if (!collisions.length) {
        return { position, surface, uv, messages, collisions };
      }
    }
    messages.push(`${surface.label} had no collision-free position.`);
  }

  return {
    position: null,
    surface: null,
    uv: null,
    messages,
    collisions: [],
  };
}

function volumeScore(
  binding: ResolvedSceneAssetBinding,
  volume: ResolvedAssetRuntimeInteriorVolume,
) {
  let score = volume.confidence * 5;
  const preference = binding.placement_region;
  if (preference.exposure !== "any") {
    score += volume.exposure === preference.exposure ? 4 : -6;
  }
  if (preference.openness !== "any") {
    score += volume.openness === preference.openness ? 3 : -4;
  }
  return score;
}

function placeInside(input: {
  binding: ResolvedSceneAssetBinding;
  target: ResolvedSceneAssetBinding;
  targetPosition: Vec3;
  childMetrics: ResolvedAssetRuntimeMetrics;
  targetMetrics: ResolvedAssetRuntimeMetrics;
  positions: Map<string, Vec3>;
  bindingsById: Map<string, ResolvedSceneAssetBinding>;
  metricsById: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const preference = input.binding.placement_region;
  const volumes = [...input.targetMetrics.interior_volumes]
    .filter((volume) => {
      if (input.binding.placement_source !== "explicit") return true;
      if (
        preference.exposure !== "any" &&
        volume.exposure !== preference.exposure
      ) {
        return false;
      }
      if (
        preference.openness !== "any" &&
        volume.openness !== preference.openness
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        volumeScore(input.binding, right) - volumeScore(input.binding, left),
    );
  for (const volume of volumes) {
    const margin = Math.max(0.004, input.binding.clearance_m);
    if (
      input.childMetrics.world_size[0] + margin * 2 > volume.size[0] ||
      input.childMetrics.world_size[1] + margin * 2 > volume.size[1] ||
      input.childMetrics.world_size[2] + margin * 2 > volume.size[2]
    ) {
      continue;
    }
    const center = add(input.targetPosition, volume.center_offset);
    const position: Vec3 = [
      center[0],
      center[1] - input.childMetrics.world_size[1] / 2,
      center[2],
    ];
    const collisions = collidingIds({
      binding: input.binding,
      position,
      metrics: input.childMetrics,
      positions: input.positions,
      bindingsById: input.bindingsById,
      metricsById: input.metricsById,
      exclude: new Set([input.target.instance_id]),
    });
    if (!collisions.length) {
      return { position, volume, collisions };
    }
  }
  return { position: null, volume: null, collisions: [] as string[] };
}

function placeBeside(input: {
  binding: ResolvedSceneAssetBinding;
  target: ResolvedSceneAssetBinding;
  targetPosition: Vec3;
  childMetrics: ResolvedAssetRuntimeMetrics;
  targetMetrics: ResolvedAssetRuntimeMetrics;
  positions: Map<string, Vec3>;
  bindingsById: Map<string, ResolvedSceneAssetBinding>;
  metricsById: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const targetBox = aabbFor(input.target, input.targetPosition, input.targetMetrics);
  const childSize = rotatedSize(input.binding, input.childMetrics.world_size);
  const clearance = Math.max(0.03, input.binding.clearance_m);

  for (const side of sideOrder(input.binding)) {
    const base: Vec3 = [
      targetBox.center[0],
      input.binding.placement_region.require_ground_contact
        ? 0
        : targetBox.min[1],
      targetBox.center[2],
    ];
    if (side === "right") {
      base[0] = targetBox.max[0] + childSize[0] / 2 + clearance;
    } else if (side === "left") {
      base[0] = targetBox.min[0] - childSize[0] / 2 - clearance;
    } else if (side === "front") {
      base[2] = targetBox.max[2] + childSize[2] / 2 + clearance;
    } else {
      base[2] = targetBox.min[2] - childSize[2] / 2 - clearance;
    }
    const position = add(base, input.binding.placement_offset);
    const collisions = collidingIds({
      binding: input.binding,
      position,
      metrics: input.childMetrics,
      positions: input.positions,
      bindingsById: input.bindingsById,
      metricsById: input.metricsById,
    });
    if (!collisions.length) return { position, side, collisions };
  }
  return { position: null, side: null, collisions: [] as string[] };
}

function attachmentScore(
  binding: ResolvedSceneAssetBinding,
  region: ResolvedAssetRuntimeAttachmentRegion,
) {
  let score = region.confidence * 5;
  const preference = binding.placement_region;
  if (preference.side !== "any") {
    score += region.side === preference.side ? 8 : -8;
  }
  if (preference.exposure !== "any") {
    score += region.exposure === preference.exposure ? 3 : -5;
  }
  if (preference.orientation !== "any") {
    score += region.orientation === preference.orientation ? 3 : -5;
  }
  return score;
}

function placeAttached(input: {
  binding: ResolvedSceneAssetBinding;
  target: ResolvedSceneAssetBinding;
  targetPosition: Vec3;
  childMetrics: ResolvedAssetRuntimeMetrics;
  targetMetrics: ResolvedAssetRuntimeMetrics;
  positions: Map<string, Vec3>;
  bindingsById: Map<string, ResolvedSceneAssetBinding>;
  metricsById: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const preference = input.binding.placement_region;
  const regions = [...input.targetMetrics.attachment_regions]
    .filter((region) => {
      if (input.binding.placement_source !== "explicit") return true;
      if (preference.side !== "any" && region.side !== preference.side) {
        return false;
      }
      if (
        preference.exposure !== "any" &&
        region.exposure !== preference.exposure
      ) {
        return false;
      }
      if (
        preference.orientation !== "any" &&
        region.orientation !== preference.orientation
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        attachmentScore(input.binding, right) - attachmentScore(input.binding, left),
    );
  for (const region of regions) {
    const child = input.childMetrics.world_size;
    const fits =
      child[0] <= Math.max(region.size[0], region.size[1]) * 1.05 &&
      child[1] <= Math.max(region.size[0], region.size[1]) * 1.05;
    if (!fits) continue;

    const faceCenter = add(input.targetPosition, region.center_offset);
    const normal = normalize(region.normal, [0, 0, 1]);
    const normalExtent =
      Math.abs(normal[0]) * child[0] / 2 +
      Math.abs(normal[1]) * child[1] / 2 +
      Math.abs(normal[2]) * child[2] / 2;
    const center = add(
      faceCenter,
      scale(normal, normalExtent + Math.max(0.002, input.binding.clearance_m)),
    );
    const position: Vec3 = [
      center[0],
      center[1] - child[1] / 2,
      center[2],
    ];
    const collisions = collidingIds({
      binding: input.binding,
      position,
      metrics: input.childMetrics,
      positions: input.positions,
      bindingsById: input.bindingsById,
      metricsById: input.metricsById,
      exclude: new Set([input.target.instance_id]),
    });
    if (!collisions.length) return { position, region, collisions };
  }
  return { position: null, region: null, collisions: [] as string[] };
}

function rootCandidates(base: Vec3, step: number) {
  const candidates: Vec3[] = [base];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 1; index <= 96; index += 1) {
    const radius = Math.min(MAX_LAYOUT_RADIUS, Math.sqrt(index) * step);
    const angle = index * goldenAngle;
    candidates.push([
      base[0] + Math.cos(angle) * radius,
      base[1],
      base[2] + Math.sin(angle) * radius,
    ]);
  }
  return candidates;
}

function directParentPair(
  left: ResolvedSceneAssetBinding,
  right: ResolvedSceneAssetBinding,
) {
  const allowsParentContact = (binding: ResolvedSceneAssetBinding) =>
    binding.placement_relation === "on_surface" ||
    binding.placement_relation === "inside" ||
    binding.placement_relation === "attached_to";

  return (
    (left.placement_target_instance_id === right.instance_id &&
      allowsParentContact(left)) ||
    (right.placement_target_instance_id === left.instance_id &&
      allowsParentContact(right))
  );
}

export function solveResolvedAssetLayout(input: {
  bindings: ResolvedSceneAssetBinding[];
  basePositions: Map<string, Vec3>;
  metrics: Map<string, ResolvedAssetRuntimeMetrics>;
}) {
  const bindingsById = new Map(
    input.bindings.map((binding) => [binding.instance_id, binding]),
  );
  const positions = new Map<string, Vec3>();
  const surfacePlacements = new Map<string, SurfacePlacement>();
  const diagnostics = new Map<string, ResolvedPlacementDiagnostic>();
  const unresolvedIds = new Set<string>();
  const allMetricsReady = input.bindings.every((binding) =>
    input.metrics.has(binding.instance_id),
  );

  const ordered = [...input.bindings].sort((left, right) => {
    const depthDelta =
      hierarchyDepth(left, bindingsById) -
      hierarchyDepth(right, bindingsById);
    if (depthDelta) return depthDelta;
    const leftMetrics = metricsFor(left, input.metrics);
    const rightMetrics = metricsFor(right, input.metrics);
    const leftVolume = leftMetrics.world_size.reduce((a, b) => a * b, 1);
    const rightVolume = rightMetrics.world_size.reduce((a, b) => a * b, 1);
    return (
      right.layout_priority - left.layout_priority ||
      rightVolume - leftVolume ||
      left.instance_id.localeCompare(right.instance_id)
    );
  });

  for (const binding of ordered) {
    const metrics = metricsFor(binding, input.metrics);
    const base = input.basePositions.get(binding.instance_id) ?? binding.position;
    const targetId = binding.placement_target_instance_id;
    const target = targetId ? bindingsById.get(targetId) : undefined;
    const targetPosition = targetId ? positions.get(targetId) : undefined;
    const targetMetrics = target ? metricsFor(target, input.metrics) : undefined;
    let position: Vec3 | null = null;
    let regionId: string | null = null;
    let regionLabel: string | null = null;
    let status: ResolvedPlacementStatus = allMetricsReady ? "placed" : "provisional";
    let reason: string | null = null;
    const messages: string[] = [];
    let collisions: string[] = [];

    if (targetId && (!target || !targetPosition || unresolvedIds.has(targetId))) {
      reason = "placement_target_unavailable";
      messages.push("The requested placement target is unavailable or unresolved.");
    } else if (binding.placement_relation === "on_surface" && target && targetPosition && targetMetrics) {
      const result = placeOnSurface({
        binding,
        target,
        targetPosition,
        childMetrics: metrics,
        targetMetrics,
        positions,
        bindingsById,
        metricsById: input.metrics,
      });
      position = result.position;
      messages.push(...result.messages);
      collisions = result.collisions;
      if (result.surface && result.uv) {
        regionId = result.surface.id;
        regionLabel = result.surface.label;
        surfacePlacements.set(binding.instance_id, {
          target_instance_id: target.instance_id,
          surface: result.surface,
          preferred_uv: binding.placement_uv,
          selected_uv: result.uv,
        });
        if (
          result.uv[0] !== binding.placement_uv[0] ||
          result.uv[1] !== binding.placement_uv[1]
        ) {
          status = allMetricsReady ? "adjusted" : "provisional";
        }
      } else {
        reason = messages.some((message) => message.includes("clearance"))
          ? "insufficient_clearance"
          : messages.some((message) => message.includes("too small"))
            ? "insufficient_region_size"
            : "no_collision_free_support_position";
      }
    } else if (binding.placement_relation === "inside" && target && targetPosition && targetMetrics) {
      const result = placeInside({
        binding,
        target,
        targetPosition,
        childMetrics: metrics,
        targetMetrics,
        positions,
        bindingsById,
        metricsById: input.metrics,
      });
      position = result.position;
      collisions = result.collisions;
      regionId = result.volume?.id ?? null;
      regionLabel = result.volume?.label ?? null;
      if (!position) reason = "no_fitting_containment_region";
    } else if (binding.placement_relation === "beside" && target && targetPosition && targetMetrics) {
      const result = placeBeside({
        binding,
        target,
        targetPosition,
        childMetrics: metrics,
        targetMetrics,
        positions,
        bindingsById,
        metricsById: input.metrics,
      });
      position = result.position;
      collisions = result.collisions;
      regionId = result.side;
      regionLabel = result.side ? `${result.side} adjacent region` : null;
      if (!position) reason = "no_collision_free_adjacent_position";
    } else if (binding.placement_relation === "attached_to" && target && targetPosition && targetMetrics) {
      const result = placeAttached({
        binding,
        target,
        targetPosition,
        childMetrics: metrics,
        targetMetrics,
        positions,
        bindingsById,
        metricsById: input.metrics,
      });
      position = result.position;
      collisions = result.collisions;
      regionId = result.region?.id ?? null;
      regionLabel = result.region?.label ?? null;
      if (!position) reason = "no_fitting_attachment_region";
    } else {
      const initial: Vec3 = binding.placement_relation === "on_ground"
        ? [
            base[0] + binding.placement_offset[0],
            Math.max(0, binding.placement_offset[1]),
            base[2] + binding.placement_offset[2],
          ]
        : add(base, binding.placement_offset);
      const step = Math.max(
        0.1,
        Math.max(metrics.world_size[0], metrics.world_size[2]) * 0.7,
      );
      for (const candidate of rootCandidates(initial, step)) {
        const candidateCollisions = collidingIds({
          binding,
          position: candidate,
          metrics,
          positions,
          bindingsById,
          metricsById: input.metrics,
        });
        if (!candidateCollisions.length) {
          position = candidate;
          if (candidate !== initial) {
            status = allMetricsReady ? "adjusted" : "provisional";
          }
          break;
        }
        collisions = candidateCollisions;
      }
      if (!position) reason = "no_collision_free_root_position";
    }

    if (!position) {
      status = allMetricsReady ? "unresolved" : "provisional";
      if (allMetricsReady) unresolvedIds.add(binding.instance_id);
    } else {
      positions.set(binding.instance_id, position);
    }

    diagnostics.set(binding.instance_id, {
      instance_id: binding.instance_id,
      concept: binding.concept,
      status,
      relation: binding.placement_relation,
      target_instance_id: targetId ?? null,
      region_id: regionId,
      region_label: regionLabel,
      reason,
      messages,
      collisions,
      position,
    });
  }

  if (allMetricsReady) {
    const placed = input.bindings.filter((binding) => positions.has(binding.instance_id));
    for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
        const left = placed[leftIndex]!;
        const right = placed[rightIndex]!;
        if (
          left.placement_region.allow_intersection ||
          right.placement_region.allow_intersection ||
          directParentPair(left, right)
        ) {
          continue;
        }
        const leftPosition = positions.get(left.instance_id)!;
        const rightPosition = positions.get(right.instance_id)!;
        const overlap = aabbOverlap(
          aabbFor(left, leftPosition, metricsFor(left, input.metrics)),
          aabbFor(right, rightPosition, metricsFor(right, input.metrics)),
        );
        if (!overlap) continue;

        const loser =
          left.layout_priority < right.layout_priority
            ? left
            : right.layout_priority < left.layout_priority
              ? right
              : right;
        unresolvedIds.add(loser.instance_id);
        positions.delete(loser.instance_id);
        const previous = diagnostics.get(loser.instance_id)!;
        diagnostics.set(loser.instance_id, {
          ...previous,
          status: "unresolved",
          reason: "global_collision_detected",
          collisions: Array.from(
            new Set([...previous.collisions, loser === left ? right.instance_id : left.instance_id]),
          ),
          position: null,
        });
      }
    }
  }

  return {
    positions,
    surface_placements: surfacePlacements,
    placement_diagnostics: diagnostics,
    unresolved_ids: unresolvedIds,
    all_metrics_ready: allMetricsReady,
  };
}
