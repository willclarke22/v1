import {
  Euler,
  Matrix3,
  Mesh,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { AssetDirectabilityVec3 } from "../directability/asset-directability-contract";
import type { DirectableAssetTopOpeningCandidateV1 } from "../directability/affordance-graph-contract";
import {
  chooseGeometryTopOpeningCandidate,
  inferGeometryShapeInspectionFromSamples,
} from "../directability/geometry-affordance-inference";

// A.11A.9 is a frozen predecessor contract. Keep this exact version for its
// historical verifier and layer A.11A.10 topology evidence beside it.
export const DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION =
  "director_qualification_physical_inspection_phase1b7a11a9_v1" as const;

export const DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION =
  "director_qualification_physical_topology_phase1b7a11a10_v1" as const;

export type DirectorQualificationPhysicalBounds = {
  min: AssetDirectabilityVec3;
  max: AssetDirectabilityVec3;
  size: AssetDirectabilityVec3;
  center: AssetDirectabilityVec3;
};

export type DirectorQualificationSurfaceTopologyEvidence =
  | {
      method: "point_cluster";
      side: "left" | "right" | "front" | "back";
      occupancy_ratio: number;
      contiguous_cell_count: number;
      tested_cell_count: number;
      center_hit: boolean;
      depth_variation_m: number;
      normal_alignment: number;
      center_height_ratio: number;
    }
  | {
      method: "raycast_contiguous_patch";
      side: "left" | "right" | "front" | "back";
      occupancy_ratio: number;
      contiguous_cell_count: number;
      tested_cell_count: number;
      center_hit: boolean;
      depth_variation_m: number;
      normal_alignment: number;
      center_height_ratio: number;
    };

export type DirectorQualificationSurfaceContactCandidate = {
  id: string;
  label: string;
  local_position: AssetDirectabilityVec3;
  local_normal: AssetDirectabilityVec3;
  contact_size: [number, number];
  side: "left" | "right" | "front" | "back";
  confidence: number;
  sample_count: number;
  evidence_method: "point_cluster" | "raycast_contiguous_patch";
  topology: DirectorQualificationSurfaceTopologyEvidence;
};

export type DirectorQualificationContainmentTopologyEvidence = {
  method: "raycast_open_cavity";
  local_center: AssetDirectabilityVec3;
  size: [number, number, number];
  access_direction: AssetDirectabilityVec3;
  confidence: number;
  sampled_ray_count: number;
  accessible_ray_count: number;
  access_clear_ratio: number;
  center_access_clear: boolean;
  cavity_depth_m: number;
  opening_size: [number, number];
  opening_occupancy_ratio: number;
};

export type DirectorQualificationPhysicalInspection = {
  version: typeof DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION;
  topology_version: typeof DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION;
  source: "browser_gltf_surface_sample";
  sample_count: number;
  triangle_count: number;
  local_bounds: DirectorQualificationPhysicalBounds;
  top_opening: DirectableAssetTopOpeningCandidateV1 | null;
  containment_topology: DirectorQualificationContainmentTopologyEvidence | null;
  surface_contact_candidates: DirectorQualificationSurfaceContactCandidate[];
};

type Point3 = [number, number, number];

export type DirectorQualificationRayContactHit = {
  u_index: number;
  v_index: number;
  local_position: AssetDirectabilityVec3;
  local_normal: AssetDirectabilityVec3;
};

export type DirectorQualificationCavityRayDepth = {
  u_index: number;
  v_index: number;
  depth_m: number | null;
};

/**
 * A.11A.17 broad top-access proposal for basin-like containers. This is never
 * positive containment evidence on its own: the exact rendered GLB must still
 * pass the connected downward-ray cavity test before the Qualification Room can
 * promote the region, and the Room separately requires container semantics.
 */
export function directorQualificationBroadTopAccessProposal(
  bounds: DirectorQualificationPhysicalBounds,
): DirectableAssetTopOpeningCandidateV1 {
  const width = Math.max(0.001, Math.abs(bounds.size[0]) * 0.82);
  const depth = Math.max(0.001, Math.abs(bounds.size[2]) * 0.82);
  return {
    axis_name: "y",
    axis: [0, 1, 0],
    score: 0.5,
    confidence: 0.5,
    center_void_score: 0,
    rim_angular_coverage: 0,
    opening_size_ratio: [0.82, 0.82],
    local_center: [bounds.center[0], bounds.max[1], bounds.center[2]],
    opening_size: [width, depth],
    access_direction: [0, 1, 0],
    note:
      "Bounds-derived broad top-access proposal for basin-shaped geometry; requires ray-confirmed open cavity before positive containment.",
  };
}

const MAX_VERTEX_SAMPLES = 7000;
const MAX_TRIANGLE_SAMPLES = 3500;
const MAX_TOTAL_POINT_SAMPLES = 22000;
const CONTACT_GRID = 12;
const RAY_CONTACT_GRID = 12;
const CAVITY_GRID = 7;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const ordered = values.slice().sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.round((ordered.length - 1) * q)),
  );
  return ordered[index] ?? 0;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length,
  );
}

function boundsForPoints(points: readonly Point3[]): DirectorQualificationPhysicalBounds {
  const min: Point3 = [Infinity, Infinity, Infinity];
  const max: Point3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  if (!points.length) {
    min[0] = min[1] = min[2] = 0;
    max[0] = max[1] = max[2] = 0;
  }
  const size: Point3 = [
    Math.max(1e-6, max[0] - min[0]),
    Math.max(1e-6, max[1] - min[1]),
    Math.max(1e-6, max[2] - min[2]),
  ];
  return {
    min,
    max,
    size,
    center: [
      (min[0] + max[0]) * 0.5,
      (min[1] + max[1]) * 0.5,
      (min[2] + max[2]) * 0.5,
    ],
  };
}

function sideGeometry(side: DirectorQualificationSurfaceContactCandidate["side"]) {
  const axis = side === "left" || side === "right" ? 0 : 2;
  const sign = side === "left" || side === "back" ? -1 : 1;
  const projectedAxes: [number, number] = axis === 0 ? [1, 2] : [0, 1];
  const outward: Point3 = [0, 0, 0];
  outward[axis] = sign;
  return { axis, sign, projectedAxes, outward };
}

function centerHeightRatio(
  localPosition: readonly number[],
  bounds: DirectorQualificationPhysicalBounds,
) {
  return clamp01(
    (Number(localPosition[1]) - bounds.min[1]) /
      Math.max(1e-6, bounds.size[1]),
  );
}

/**
 * A.11A.9 point-cluster inference is intentionally preserved for historical
 * canaries and diagnostics. It is no longer sufficient for positive Attached-To
 * qualification once the exact rendered GLB can be ray-tested.
 */
function pointContactCandidatesForSide(
  points: readonly Point3[],
  bounds: DirectorQualificationPhysicalBounds,
  side: DirectorQualificationSurfaceContactCandidate["side"],
) {
  const { axis, sign, projectedAxes } = sideGeometry(side);
  const [uIndex, vIndex] = projectedAxes;
  const uMin = bounds.min[uIndex];
  const vMin = bounds.min[vIndex];
  const uSpan = Math.max(1e-6, bounds.size[uIndex]);
  const vSpan = Math.max(1e-6, bounds.size[vIndex]);
  const largest = Math.max(...bounds.size);
  const depthTolerance = Math.max(bounds.size[axis] * 0.075, largest * 0.018, 0.003);

  type Cell = {
    key: string;
    u: number;
    v: number;
    points: Point3[];
    side_value: number;
  };
  const raw = new Map<string, { u: number; v: number; points: Point3[] }>();
  for (const point of points) {
    const u = Math.max(
      0,
      Math.min(CONTACT_GRID - 1, Math.floor(((point[uIndex] - uMin) / uSpan) * CONTACT_GRID)),
    );
    const v = Math.max(
      0,
      Math.min(CONTACT_GRID - 1, Math.floor(((point[vIndex] - vMin) / vSpan) * CONTACT_GRID)),
    );
    const key = `${u}:${v}`;
    const cell = raw.get(key) ?? { u, v, points: [] };
    cell.points.push(point);
    raw.set(key, cell);
  }

  const cells = new Map<string, Cell>();
  for (const [key, cell] of raw) {
    const sideValues = cell.points.map((point) => point[axis]);
    if (!sideValues.length) continue;
    cells.set(key, {
      ...cell,
      key,
      side_value: sign > 0 ? quantile(sideValues, 0.9) : quantile(sideValues, 0.1),
    });
  }

  const visited = new Set<string>();
  const clusters: Cell[][] = [];
  for (const start of cells.values()) {
    if (visited.has(start.key)) continue;
    visited.add(start.key);
    const queue = [start];
    const cluster: Cell[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      cluster.push(current);
      for (let du = -1; du <= 1; du += 1) {
        for (let dv = -1; dv <= 1; dv += 1) {
          if (du === 0 && dv === 0) continue;
          const neighbor = cells.get(`${current.u + du}:${current.v + dv}`);
          if (!neighbor || visited.has(neighbor.key)) continue;
          if (Math.abs(neighbor.side_value - current.side_value) > depthTolerance) continue;
          visited.add(neighbor.key);
          queue.push(neighbor);
        }
      }
    }
    clusters.push(cluster);
  }

  const output: DirectorQualificationSurfaceContactCandidate[] = [];
  for (const cluster of clusters) {
    const clusterPoints = cluster.flatMap((cell) => cell.points);
    if (clusterPoints.length < Math.max(6, Math.floor(points.length * 0.0015))) continue;
    const uValues = clusterPoints.map((point) => point[uIndex]);
    const vValues = clusterPoints.map((point) => point[vIndex]);
    const u0 = Math.min(...uValues);
    const u1 = Math.max(...uValues);
    const v0 = Math.min(...vValues);
    const v1 = Math.max(...vValues);
    const patchU = u1 - u0;
    const patchV = v1 - v0;
    if (patchU < Math.max(0.004, largest * 0.018) || patchV < Math.max(0.004, largest * 0.018)) continue;

    const sideValues = cluster.map((cell) => cell.side_value);
    const sideCoordinate = sideValues.reduce((sum, value) => sum + value, 0) / sideValues.length;
    const local: Point3 = [0, 0, 0];
    local[axis] = sideCoordinate;
    local[uIndex] = (u0 + u1) * 0.5;
    local[vIndex] = (v0 + v1) * 0.5;
    const normal: Point3 = [0, 0, 0];
    normal[axis] = sign;
    const uCells = cluster.map((cell) => cell.u);
    const vCells = cluster.map((cell) => cell.v);
    const minU = Math.min(...uCells);
    const maxU = Math.max(...uCells);
    const minV = Math.min(...vCells);
    const maxV = Math.max(...vCells);
    const rectangleCellCount = (maxU - minU + 1) * (maxV - minV + 1);
    const centerKey = `${Math.round((minU + maxU) / 2)}:${Math.round((minV + maxV) / 2)}`;
    const occupied = new Set(cluster.map((cell) => cell.key));
    const depthVariation = standardDeviation(sideValues);
    const smoothness = clamp01(1 - depthVariation / Math.max(depthTolerance, 1e-6));
    const areaRatio = clamp01((patchU * patchV) / Math.max(1e-8, uSpan * vSpan));
    const population = clamp01(clusterPoints.length / Math.max(12, points.length * 0.08));
    const confidence = clamp01(0.48 + population * 0.17 + Math.sqrt(areaRatio) * 0.18 + smoothness * 0.17);
    if (confidence < 0.5) continue;
    output.push({
      id: `render_contact_${side}_${output.length + 1}`,
      label: `Measured ${side} exterior mesh patch`,
      local_position: local,
      local_normal: normal,
      contact_size: [Math.max(0.001, patchU * 0.88), Math.max(0.001, patchV * 0.88)],
      side,
      confidence,
      sample_count: clusterPoints.length,
      evidence_method: "point_cluster",
      topology: {
        method: "point_cluster",
        side,
        occupancy_ratio: clamp01(cluster.length / Math.max(1, rectangleCellCount)),
        contiguous_cell_count: cluster.length,
        tested_cell_count: CONTACT_GRID * CONTACT_GRID,
        center_hit: occupied.has(centerKey),
        depth_variation_m: depthVariation,
        normal_alignment: 1,
        center_height_ratio: centerHeightRatio(local, bounds),
      },
    });
  }
  return output
    .sort(
      (left, right) =>
        right.confidence * Math.sqrt(right.contact_size[0] * right.contact_size[1]) -
          left.confidence * Math.sqrt(left.contact_size[0] * left.contact_size[1]) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 4)
    .map((candidate, index) => ({ ...candidate, id: `render_contact_${side}_${index + 1}` }));
}

/**
 * Converts first-hit side rays into contiguous occupied surface patches. A patch
 * is rejected if its centre is empty, if disconnected islands only look broad
 * after taking their bounding rectangle, or if depth/normal continuity is weak.
 */
export function inferDirectorQualificationSurfaceContactsFromRayHits(input: {
  side: DirectorQualificationSurfaceContactCandidate["side"];
  grid_size: number;
  local_bounds: DirectorQualificationPhysicalBounds;
  hits: DirectorQualificationRayContactHit[];
}): DirectorQualificationSurfaceContactCandidate[] {
  const gridSize = Math.max(3, Math.round(input.grid_size));
  const bounds = input.local_bounds;
  const { axis, projectedAxes, outward } = sideGeometry(input.side);
  const [uIndex, vIndex] = projectedAxes;
  const outwardVector = new Vector3(...outward).normalize();
  const largest = Math.max(...bounds.size);
  const depthTolerance = Math.max(bounds.size[axis] * 0.045, largest * 0.012, 0.002);

  type Cell = DirectorQualificationRayContactHit & {
    key: string;
    normal_alignment: number;
  };
  const cells = new Map<string, Cell>();
  for (const hit of input.hits) {
    const u = Math.round(hit.u_index);
    const v = Math.round(hit.v_index);
    if (u < 0 || u >= gridSize || v < 0 || v >= gridSize) continue;
    const normal = new Vector3(...hit.local_normal);
    if (normal.lengthSq() < 1e-8) normal.copy(outwardVector);
    normal.normalize();
    let alignment = normal.dot(outwardVector);
    if (alignment < 0) {
      normal.multiplyScalar(-1);
      alignment = -alignment;
    }
    if (alignment < 0.32) continue;
    cells.set(`${u}:${v}`, {
      ...hit,
      u_index: u,
      v_index: v,
      local_normal: [normal.x, normal.y, normal.z],
      key: `${u}:${v}`,
      normal_alignment: alignment,
    });
  }

  const visited = new Set<string>();
  const clusters: Cell[][] = [];
  for (const start of cells.values()) {
    if (visited.has(start.key)) continue;
    visited.add(start.key);
    const queue = [start];
    const cluster: Cell[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      cluster.push(current);
      // Strict four-neighbour topology prevents diagonal islands from becoming
      // one fake rectangular contact face.
      for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const neighbor = cells.get(`${current.u_index + du}:${current.v_index + dv}`);
        if (!neighbor || visited.has(neighbor.key)) continue;
        if (Math.abs(neighbor.local_position[axis] - current.local_position[axis]) > depthTolerance) continue;
        if (new Vector3(...neighbor.local_normal).dot(new Vector3(...current.local_normal)) < 0.72) continue;
        visited.add(neighbor.key);
        queue.push(neighbor);
      }
    }
    clusters.push(cluster);
  }

  const cellU = Math.max(1e-6, bounds.size[uIndex]) / gridSize;
  const cellV = Math.max(1e-6, bounds.size[vIndex]) / gridSize;
  const minimumPatchSpan = Math.max(0.004, largest * 0.018);
  const output: DirectorQualificationSurfaceContactCandidate[] = [];

  for (const cluster of clusters) {
    if (cluster.length < 5) continue;
    const minU = Math.min(...cluster.map((cell) => cell.u_index));
    const maxU = Math.max(...cluster.map((cell) => cell.u_index));
    const minV = Math.min(...cluster.map((cell) => cell.v_index));
    const maxV = Math.max(...cluster.map((cell) => cell.v_index));
    const rectangleCellCount = (maxU - minU + 1) * (maxV - minV + 1);
    const occupancyRatio = cluster.length / Math.max(1, rectangleCellCount);
    const centerU = Math.round((minU + maxU) / 2);
    const centerV = Math.round((minV + maxV) / 2);
    const centerHit = cluster.some(
      (cell) => cell.u_index === centerU && cell.v_index === centerV,
    );
    if (!centerHit || occupancyRatio < 0.68) continue;

    const patchU = (maxU - minU + 1) * cellU * 0.9;
    const patchV = (maxV - minV + 1) * cellV * 0.9;
    if (patchU < minimumPatchSpan || patchV < minimumPatchSpan) continue;

    const depthValues = cluster.map((cell) => cell.local_position[axis]);
    const depthVariation = standardDeviation(depthValues);
    if (depthVariation > depthTolerance * 1.25) continue;
    const local: Point3 = [0, 0, 0];
    local[axis] = quantile(depthValues, 0.5);
    local[uIndex] = cluster.reduce((sum, cell) => sum + cell.local_position[uIndex], 0) / cluster.length;
    local[vIndex] = cluster.reduce((sum, cell) => sum + cell.local_position[vIndex], 0) / cluster.length;

    const averageNormal = cluster.reduce(
      (sum, cell) => sum.add(new Vector3(...cell.local_normal)),
      new Vector3(),
    );
    if (averageNormal.lengthSq() < 1e-8) averageNormal.copy(outwardVector);
    averageNormal.normalize();
    if (averageNormal.dot(outwardVector) < 0) averageNormal.multiplyScalar(-1);
    const normalAlignment = clamp01(
      cluster.reduce((sum, cell) => sum + cell.normal_alignment, 0) / cluster.length,
    );
    const smoothness = clamp01(1 - depthVariation / Math.max(depthTolerance, 1e-6));
    const confidence = clamp01(
      0.42 + occupancyRatio * 0.22 + normalAlignment * 0.14 + smoothness * 0.14 +
        clamp01(cluster.length / (gridSize * gridSize * 0.2)) * 0.08,
    );
    if (confidence < 0.62) continue;

    output.push({
      id: `ray_contact_${input.side}_${output.length + 1}`,
      label: `Ray-confirmed ${input.side} contiguous mesh patch`,
      local_position: local,
      local_normal: [averageNormal.x, averageNormal.y, averageNormal.z],
      contact_size: [Math.max(0.001, patchU), Math.max(0.001, patchV)],
      side: input.side,
      confidence,
      sample_count: cluster.length,
      evidence_method: "raycast_contiguous_patch",
      topology: {
        method: "raycast_contiguous_patch",
        side: input.side,
        occupancy_ratio: occupancyRatio,
        contiguous_cell_count: cluster.length,
        tested_cell_count: gridSize * gridSize,
        center_hit: true,
        depth_variation_m: depthVariation,
        normal_alignment: normalAlignment,
        center_height_ratio: centerHeightRatio(local, bounds),
      },
    });
  }

  return output
    .sort((left, right) => {
      const leftScore = left.confidence * Math.sqrt(left.contact_size[0] * left.contact_size[1]) *
        (0.75 + left.topology.occupancy_ratio * 0.25);
      const rightScore = right.confidence * Math.sqrt(right.contact_size[0] * right.contact_size[1]) *
        (0.75 + right.topology.occupancy_ratio * 0.25);
      return rightScore - leftScore || left.id.localeCompare(right.id);
    })
    .slice(0, 4)
    .map((candidate, index) => ({ ...candidate, id: `ray_contact_${input.side}_${index + 1}` }));
}

/**
 * A top-opening point pattern is only a proposal. Positive containment requires
 * a connected grid of downward rays that passes below the rim and reaches a
 * measurable cavity floor. Closed lids therefore fail before semantic container
 * labels can promote a usable Inside region.
 */
export function inferDirectorQualificationOpenCavityFromRayDepths(input: {
  opening: DirectableAssetTopOpeningCandidateV1;
  local_bounds: DirectorQualificationPhysicalBounds;
  grid_size: number;
  sampled_opening_size: [number, number];
  depths: DirectorQualificationCavityRayDepth[];
}): DirectorQualificationContainmentTopologyEvidence | null {
  const gridSize = Math.max(3, Math.round(input.grid_size));
  const bounds = input.local_bounds;
  const topCenter = input.opening.local_center ?? [bounds.center[0], bounds.max[1], bounds.center[2]];
  const largest = Math.max(...bounds.size);
  const minimumCavityDepth = Math.max(bounds.size[1] * 0.16, largest * 0.035, 0.01);
  const samples = new Map(
    input.depths.map((sample) => [`${Math.round(sample.u_index)}:${Math.round(sample.v_index)}`, sample]),
  );
  const accessible = new Set<string>();
  for (const [key, sample] of samples) {
    if (
      sample.depth_m !== null && Number.isFinite(sample.depth_m) &&
      sample.depth_m >= minimumCavityDepth && sample.depth_m <= bounds.size[1] * 1.2
    ) {
      accessible.add(key);
    }
  }

  const centerIndex = Math.floor(gridSize / 2);
  const centerKey = `${centerIndex}:${centerIndex}`;
  if (!accessible.has(centerKey)) return null;
  const visited = new Set<string>([centerKey]);
  const queue = [centerKey];
  while (queue.length) {
    const key = queue.shift()!;
    const [u, v] = key.split(":").map(Number);
    for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nu = u + du;
      const nv = v + dv;
      const nextKey = `${nu}:${nv}`;
      if (
        nu < 0 || nu >= gridSize || nv < 0 || nv >= gridSize ||
        visited.has(nextKey) || !accessible.has(nextKey)
      ) continue;
      visited.add(nextKey);
      queue.push(nextKey);
    }
  }

  const keys = [...visited];
  const sampledRayCount = gridSize * gridSize;
  const accessibleRayCount = keys.length;
  const accessClearRatio = accessibleRayCount / sampledRayCount;
  if (accessClearRatio < 0.52) return null;
  const coordinates = keys.map((key) => key.split(":").map(Number) as [number, number]);
  const minU = Math.min(...coordinates.map(([u]) => u));
  const maxU = Math.max(...coordinates.map(([u]) => u));
  const minV = Math.min(...coordinates.map(([, v]) => v));
  const maxV = Math.max(...coordinates.map(([, v]) => v));
  const rectangleCellCount = (maxU - minU + 1) * (maxV - minV + 1);
  const openingOccupancyRatio = accessibleRayCount / Math.max(1, rectangleCellCount);
  if (openingOccupancyRatio < 0.72) return null;

  const depths = keys
    .map((key) => samples.get(key)?.depth_m ?? null)
    .filter((value): value is number => typeof value === "number");
  const cavityDepth = quantile(depths, 0.25);
  if (cavityDepth < minimumCavityDepth * 1.1) return null;

  const sampleWidth = Math.max(0.001, input.sampled_opening_size[0]);
  const sampleDepth = Math.max(0.001, input.sampled_opening_size[1]);
  const uStep = sampleWidth / Math.max(1, gridSize - 1);
  const vStep = sampleDepth / Math.max(1, gridSize - 1);
  const openingSize: [number, number] = [
    Math.max(0.001, (maxU - minU + 1) * uStep * 0.9),
    Math.max(0.001, (maxV - minV + 1) * vStep * 0.9),
  ];
  const offsetU = ((minU + maxU) * 0.5 - centerIndex) * uStep;
  const offsetV = ((minV + maxV) * 0.5 - centerIndex) * vStep;
  const localCenter: Point3 = [
    topCenter[0] + offsetU,
    topCenter[1] - cavityDepth * 0.5,
    topCenter[2] + offsetV,
  ];
  const confidence = clamp01(
    input.opening.confidence * 0.24 + accessClearRatio * 0.28 +
      openingOccupancyRatio * 0.2 + clamp01(cavityDepth / Math.max(bounds.size[1], 1e-6)) * 0.18 + 0.1,
  );
  if (confidence < 0.66) return null;

  return {
    method: "raycast_open_cavity",
    local_center: localCenter,
    size: [openingSize[0], Math.max(0.001, cavityDepth * 0.82), openingSize[1]],
    access_direction: [0, 1, 0],
    confidence,
    sampled_ray_count: sampledRayCount,
    accessible_ray_count: accessibleRayCount,
    access_clear_ratio: accessClearRatio,
    center_access_clear: true,
    cavity_depth_m: cavityDepth,
    opening_size: openingSize,
    opening_occupancy_ratio: openingOccupancyRatio,
  };
}

export function inferDirectorQualificationPhysicalInspectionFromPoints(
  points: readonly Point3[],
  triangleCount = 0,
): DirectorQualificationPhysicalInspection {
  const bounds = boundsForPoints(points);
  const shape = inferGeometryShapeInspectionFromSamples(points, triangleCount);
  const topOpening = chooseGeometryTopOpeningCandidate(shape);
  return {
    version: DIRECTOR_QUALIFICATION_PHYSICAL_INSPECTION_VERSION,
    topology_version: DIRECTOR_QUALIFICATION_PHYSICAL_TOPOLOGY_VERSION,
    source: "browser_gltf_surface_sample",
    sample_count: points.length,
    triangle_count: Math.max(0, Math.round(triangleCount)),
    local_bounds: bounds,
    top_opening: topOpening,
    containment_topology: null,
    surface_contact_candidates: (["left", "right", "front", "back"] as const)
      .flatMap((side) => pointContactCandidatesForSide(points, bounds, side))
      .sort(
        (left, right) =>
          right.confidence * Math.sqrt(right.contact_size[0] * right.contact_size[1]) -
            left.confidence * Math.sqrt(left.contact_size[0] * left.contact_size[1]) ||
          left.id.localeCompare(right.id),
      ),
  };
}

function triangleCountForGeometry(geometry: Mesh["geometry"] | undefined) {
  if (!geometry) return 0;
  const position = geometry.getAttribute("position");
  if (!position?.count) return 0;
  return geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(position.count / 3);
}

function correctedFirstHit(input: {
  raycaster: Raycaster;
  meshes: Mesh[];
  origin_corrected: Vector3;
  direction_corrected: Vector3;
  correction: Quaternion;
  inverse_correction: Quaternion;
  far: number;
}) {
  input.raycaster.set(
    input.origin_corrected.clone().applyQuaternion(input.inverse_correction),
    input.direction_corrected.clone().applyQuaternion(input.inverse_correction).normalize(),
  );
  input.raycaster.near = 0;
  input.raycaster.far = Math.max(0.001, input.far);
  const first = input.raycaster.intersectObjects(input.meshes, false)[0];
  if (!first) return null;
  const point = first.point.clone().applyQuaternion(input.correction);
  const normal = first.face?.normal
    ? first.face.normal
        .clone()
        .applyMatrix3(new Matrix3().getNormalMatrix(first.object.matrixWorld))
        .normalize()
        .applyQuaternion(input.correction)
        .normalize()
    : null;
  return { point, normal };
}

function raycastContactCandidatesForSide(input: {
  meshes: Mesh[];
  bounds: DirectorQualificationPhysicalBounds;
  side: DirectorQualificationSurfaceContactCandidate["side"];
  correction: Quaternion;
  inverse_correction: Quaternion;
}) {
  const { axis, sign, projectedAxes, outward } = sideGeometry(input.side);
  const [uIndex, vIndex] = projectedAxes;
  const largest = Math.max(...input.bounds.size);
  const axisSpan = Math.max(1e-6, input.bounds.size[axis]);
  const pad = Math.max(0.01, largest * 0.055);
  const maximumExteriorDepth = axisSpan * 0.58 + pad;
  const raycaster = new Raycaster();
  const outwardVector = new Vector3(...outward).normalize();
  const hits: DirectorQualificationRayContactHit[] = [];

  for (let u = 0; u < RAY_CONTACT_GRID; u += 1) {
    for (let v = 0; v < RAY_CONTACT_GRID; v += 1) {
      const origin: Point3 = [0, 0, 0];
      origin[axis] = sign > 0 ? input.bounds.max[axis] + pad : input.bounds.min[axis] - pad;
      origin[uIndex] = input.bounds.min[uIndex] + ((u + 0.5) / RAY_CONTACT_GRID) * input.bounds.size[uIndex];
      origin[vIndex] = input.bounds.min[vIndex] + ((v + 0.5) / RAY_CONTACT_GRID) * input.bounds.size[vIndex];
      const hit = correctedFirstHit({
        raycaster,
        meshes: input.meshes,
        origin_corrected: new Vector3(...origin),
        direction_corrected: outwardVector.clone().multiplyScalar(-1),
        correction: input.correction,
        inverse_correction: input.inverse_correction,
        far: axisSpan + pad * 2,
      });
      if (!hit) continue;
      const exteriorDepth = sign > 0
        ? input.bounds.max[axis] - hit.point.getComponent(axis)
        : hit.point.getComponent(axis) - input.bounds.min[axis];
      // If a ray passes through a gap and hits the far side, do not treat that far
      // surface as the exterior face presented from this direction.
      if (exteriorDepth < -pad * 0.5 || exteriorDepth > maximumExteriorDepth) continue;
      const normal = hit.normal ?? outwardVector.clone();
      if (Math.abs(normal.dot(outwardVector)) < 0.28) continue;
      if (normal.dot(outwardVector) < 0) normal.multiplyScalar(-1);
      hits.push({
        u_index: u,
        v_index: v,
        local_position: [hit.point.x, hit.point.y, hit.point.z],
        local_normal: [normal.x, normal.y, normal.z],
      });
    }
  }

  return inferDirectorQualificationSurfaceContactsFromRayHits({
    side: input.side,
    grid_size: RAY_CONTACT_GRID,
    local_bounds: input.bounds,
    hits,
  });
}

function raycastOpenCavityTopology(input: {
  meshes: Mesh[];
  bounds: DirectorQualificationPhysicalBounds;
  opening: DirectableAssetTopOpeningCandidateV1;
  correction: Quaternion;
  inverse_correction: Quaternion;
}) {
  const openingCenter = input.opening.local_center ?? [
    input.bounds.center[0],
    input.bounds.max[1],
    input.bounds.center[2],
  ];
  const rawOpeningSize = input.opening.opening_size ?? [
    input.bounds.size[0] * input.opening.opening_size_ratio[0],
    input.bounds.size[2] * input.opening.opening_size_ratio[1],
  ];
  // Inspect the central 62% of the apparent aperture so intended rim hits do not
  // mask whether there is actually open access through the middle.
  const sampledOpeningSize: [number, number] = [
    Math.max(0.001, rawOpeningSize[0] * 0.62),
    Math.max(0.001, rawOpeningSize[1] * 0.62),
  ];
  const largest = Math.max(...input.bounds.size);
  const pad = Math.max(0.01, largest * 0.045);
  const originY = Math.max(input.bounds.max[1], openingCenter[1]) + pad;
  const centerIndex = Math.floor(CAVITY_GRID / 2);
  const raycaster = new Raycaster();
  const depths: DirectorQualificationCavityRayDepth[] = [];

  for (let u = 0; u < CAVITY_GRID; u += 1) {
    for (let v = 0; v < CAVITY_GRID; v += 1) {
      const uFraction = (u - centerIndex) / Math.max(1, CAVITY_GRID - 1);
      const vFraction = (v - centerIndex) / Math.max(1, CAVITY_GRID - 1);
      const hit = correctedFirstHit({
        raycaster,
        meshes: input.meshes,
        origin_corrected: new Vector3(
          openingCenter[0] + uFraction * sampledOpeningSize[0],
          originY,
          openingCenter[2] + vFraction * sampledOpeningSize[1],
        ),
        direction_corrected: new Vector3(0, -1, 0),
        correction: input.correction,
        inverse_correction: input.inverse_correction,
        far: input.bounds.size[1] + pad * 2,
      });
      depths.push({
        u_index: u,
        v_index: v,
        depth_m: hit ? Math.max(0, openingCenter[1] - hit.point.y) : null,
      });
    }
  }

  return inferDirectorQualificationOpenCavityFromRayDepths({
    opening: input.opening,
    local_bounds: input.bounds,
    grid_size: CAVITY_GRID,
    sampled_opening_size: sampledOpeningSize,
    depths,
  });
}

export async function inspectDirectorQualificationPhysicalAsset(input: {
  public_url: string;
  default_rotation?: readonly number[] | null;
}): Promise<DirectorQualificationPhysicalInspection> {
  const gltf = await new GLTFLoader().loadAsync(input.public_url);
  gltf.scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh && object.visible !== false) meshes.push(object);
  });

  const totalVertexCount = meshes.reduce(
    (sum, mesh) => sum + (mesh.geometry.getAttribute("position")?.count ?? 0),
    0,
  );
  const triangleCount = meshes.reduce(
    (sum, mesh) => sum + triangleCountForGeometry(mesh.geometry),
    0,
  );
  const vertexStride = Math.max(1, Math.ceil(totalVertexCount / MAX_VERTEX_SAMPLES));
  const triangleStride = Math.max(1, Math.ceil(triangleCount / MAX_TRIANGLE_SAMPLES));
  const correctionEuler = new Euler(
    Number(input.default_rotation?.[0]) || 0,
    Number(input.default_rotation?.[1]) || 0,
    Number(input.default_rotation?.[2]) || 0,
    "XYZ",
  );
  const correction = new Quaternion().setFromEuler(correctionEuler);
  const inverseCorrection = correction.clone().invert();
  const points: Point3[] = [];
  const pushPoint = (point: Vector3) => {
    if (points.length >= MAX_TOTAL_POINT_SAMPLES) return;
    point.applyQuaternion(correction);
    points.push([point.x, point.y, point.z]);
  };

  for (const mesh of meshes) {
    if (points.length >= MAX_TOTAL_POINT_SAMPLES) break;
    const position = mesh.geometry.getAttribute("position");
    if (!position?.count) continue;
    const sampleVertex = (vertexIndex: number, target: Vector3) =>
      target
        .set(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex))
        .applyMatrix4(mesh.matrixWorld);
    const vertex = new Vector3();
    for (let index = 0; index < position.count && points.length < MAX_TOTAL_POINT_SAMPLES; index += vertexStride) {
      pushPoint(sampleVertex(index, vertex).clone());
    }
    const indexAttribute = mesh.geometry.index;
    const meshTriangleCount = triangleCountForGeometry(mesh.geometry);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let triangle = 0; triangle < meshTriangleCount && points.length < MAX_TOTAL_POINT_SAMPLES; triangle += triangleStride) {
      const offset = triangle * 3;
      const ia = indexAttribute ? indexAttribute.getX(offset) : offset;
      const ib = indexAttribute ? indexAttribute.getX(offset + 1) : offset + 1;
      const ic = indexAttribute ? indexAttribute.getX(offset + 2) : offset + 2;
      sampleVertex(ia, a);
      sampleVertex(ib, b);
      sampleVertex(ic, c);
      pushPoint(new Vector3().addVectors(a, b).multiplyScalar(0.5));
      pushPoint(new Vector3().addVectors(b, c).multiplyScalar(0.5));
      pushPoint(new Vector3().addVectors(c, a).multiplyScalar(0.5));
      pushPoint(new Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3));
    }
  }

  const sampled = inferDirectorQualificationPhysicalInspectionFromPoints(points, triangleCount);
  const rayContacts = (["left", "right", "front", "back"] as const)
    .flatMap((side) =>
      raycastContactCandidatesForSide({
        meshes,
        bounds: sampled.local_bounds,
        side,
        correction,
        inverse_correction: inverseCorrection,
      }),
    )
    .sort(
      (left, right) =>
        right.confidence * Math.sqrt(right.contact_size[0] * right.contact_size[1]) -
          left.confidence * Math.sqrt(left.contact_size[0] * left.contact_size[1]) ||
        left.id.localeCompare(right.id),
    );
  // Mug-like rim heuristics are useful when present, but wide/shallow basins
  // such as bathtubs may not produce that point-sample signature. In that case
  // only propose broad top access; the exact downward-ray topology remains the
  // authoritative gate and closed lids/non-cavities still fail closed.
  const openingProposal =
    sampled.top_opening ??
    directorQualificationBroadTopAccessProposal(sampled.local_bounds);
  const containmentTopology = raycastOpenCavityTopology({
    meshes,
    bounds: sampled.local_bounds,
    opening: openingProposal,
    correction,
    inverse_correction: inverseCorrection,
  });

  return {
    ...sampled,
    top_opening: openingProposal,
    containment_topology: containmentTopology,
    // Keep point clusters after ray candidates only for diagnostics/A.11A.9
    // lineage. Positive A.11A.10 Attached-To proof filters to raycast topology.
    surface_contact_candidates: [...rayContacts, ...sampled.surface_contact_candidates],
  };
}
