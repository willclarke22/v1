import type { AssetDirectabilityVec3 } from "./asset-directability-contract";
import {
  DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION,
  type DirectableAssetGeometryShapeInspectionV1,
  type DirectableAssetRollAxisCandidateV1,
  type DirectableAssetTopOpeningCandidateV1,
} from "./affordance-graph-contract";

export const DIRECTABLE_ASSET_CONTEXTUAL_INFERENCE_VERSION =
  "director_contextual_affordance_inference_phase1b5b1_v1" as const;

export const DIRECTABLE_ASSET_ROLL_ANGLE_BINS = 24;

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const AXIS_VECTOR: Record<"x" | "y" | "z", AssetDirectabilityVec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

type Point3 = readonly [number, number, number];

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)),
  );
  return sorted[index] ?? 0;
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return 1;
  const average = mean(values);
  if (average <= 1e-8) return 1;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / average;
}

function pointBounds(points: readonly Point3[]) {
  const min: AssetDirectabilityVec3 = [Infinity, Infinity, Infinity];
  const max: AssetDirectabilityVec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let index = 0; index < 3; index += 1) {
      min[index] = Math.min(min[index], point[index]);
      max[index] = Math.max(max[index], point[index]);
    }
  }
  const size: AssetDirectabilityVec3 = [
    Math.max(0, max[0] - min[0]),
    Math.max(0, max[1] - min[1]),
    Math.max(0, max[2] - min[2]),
  ];
  const center: AssetDirectabilityVec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  return { min, max, size, center };
}

function axialRadiusProfileMetrics(
  points: readonly Point3[],
  center: AssetDirectabilityVec3,
  boundsSize: AssetDirectabilityVec3,
  axisName: "x" | "y" | "z",
) {
  const axisIndex = AXIS_INDEX[axisName];
  const projectedIndices = [0, 1, 2].filter((index) => index !== axisIndex);
  const axisSpan = Math.max(boundsSize[axisIndex], 1e-6);
  const bins = Array.from({ length: 9 }, () => [] as number[]);
  for (const point of points) {
    const normalizedAxis =
      (point[axisIndex] - (center[axisIndex] - axisSpan / 2)) / axisSpan;
    const binIndex = Math.max(
      0,
      Math.min(bins.length - 1, Math.floor(normalizedAxis * bins.length)),
    );
    const a = point[projectedIndices[0]] - center[projectedIndices[0]];
    const b = point[projectedIndices[1]] - center[projectedIndices[1]];
    bins[binIndex].push(Math.hypot(a, b));
  }
  const sliceRadii = bins.map((values) => {
    if (values.length < 3) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * 0.9)] ?? null;
  });

  const present = sliceRadii.filter(
    (value): value is number => value !== null && value > 1e-8,
  );
  const variation =
    present.length >= 3
      ? clamp01(coefficientOfVariation(present) / 0.75)
      : 1;

  const pairScores: number[] = [];
  for (let index = 0; index < Math.floor(sliceRadii.length / 2); index += 1) {
    const left = sliceRadii[index];
    const right = sliceRadii[sliceRadii.length - 1 - index];
    if (
      left === null ||
      right === null ||
      Math.max(left, right) <= 1e-8
    ) {
      continue;
    }
    pairScores.push(
      1 - Math.abs(left - right) / Math.max(left, right),
    );
  }
  const symmetry =
    pairScores.length >= 2
      ? clamp01(mean(pairScores))
      : 0;

  return { variation, symmetry };
}

export function rollingProfileForCandidate(
  candidate: DirectableAssetRollAxisCandidateV1,
) {
  if (candidate.rolling_profile) return candidate.rolling_profile;
  if (
    candidate.boundary_circularity < 0.58 ||
    candidate.angular_coverage < 0.45
  ) {
    return "irregular" as const;
  }
  if (candidate.axial_span_ratio <= 0.45) {
    return "wheel_or_ring" as const;
  }
  const variation = candidate.axial_radius_variation ?? 0;
  const symmetry = candidate.axial_radius_symmetry ?? 1;
  if (
    candidate.axial_span_ratio >= 0.78 &&
    candidate.axial_span_ratio <= 1.22 &&
    candidate.projected_span_ratio >= 0.86 &&
    variation >= 0.16 &&
    symmetry >= 0.78
  ) {
    return "spherical" as const;
  }
  if (variation <= 0.22) return "cylindrical" as const;
  if (variation <= 0.62 || symmetry < 0.72) return "tapered" as const;
  return "irregular" as const;
}

export function runtimeModelForRollCandidate(
  candidate: DirectableAssetRollAxisCandidateV1,
) {
  const profile = rollingProfileForCandidate(candidate);
  return profile === "wheel_or_ring" ||
    profile === "spherical" ||
    profile === "cylindrical"
    ? "constant_radius" as const
    : "approximate_only" as const;
}

function scoreTopOpeningFromPointSamples(
  points: readonly Point3[],
  bounds: ReturnType<typeof pointBounds>,
): DirectableAssetTopOpeningCandidateV1 | null {
  const [spanX, spanY, spanZ] = bounds.size;
  if (spanX <= 1e-7 || spanY <= 1e-7 || spanZ <= 1e-7) return null;

  const topThreshold = bounds.max[1] - spanY * 0.18;
  const topBand = points.filter((point) => point[1] >= topThreshold);
  if (topBand.length < 24) return null;

  const centerX = percentile(topBand.map((point) => point[0]), 0.5);
  const centerZ = percentile(topBand.map((point) => point[2]), 0.5);
  const halfX = Math.max(
    percentile(
      topBand.map((point) => Math.abs(point[0] - centerX)),
      0.9,
    ),
    spanX * 0.12,
    1e-6,
  );
  const halfZ = Math.max(
    percentile(
      topBand.map((point) => Math.abs(point[2] - centerZ)),
      0.9,
    ),
    spanZ * 0.12,
    1e-6,
  );
  const angleBins = Array<boolean>(DIRECTABLE_ASSET_ROLL_ANGLE_BINS).fill(false);
  let centerCount = 0;
  let rimCount = 0;

  for (const point of topBand) {
    const nx = (point[0] - centerX) / halfX;
    const nz = (point[2] - centerZ) / halfZ;
    const radius = Math.hypot(nx, nz);
    if (radius <= 0.34) centerCount += 1;
    if (radius >= 0.62 && radius <= 1.28) {
      rimCount += 1;
      const angle = (Math.atan2(nz, nx) + Math.PI * 2) % (Math.PI * 2);
      const bin = Math.min(
        DIRECTABLE_ASSET_ROLL_ANGLE_BINS - 1,
        Math.floor(
          (angle / (Math.PI * 2)) * DIRECTABLE_ASSET_ROLL_ANGLE_BINS,
        ),
      );
      angleBins[bin] = true;
    }
  }

  const centerFraction = centerCount / topBand.length;
  const centerVoidScore = clamp01(1 - centerFraction / 0.13);
  const rimAngularCoverage =
    angleBins.filter(Boolean).length / DIRECTABLE_ASSET_ROLL_ANGLE_BINS;
  const rimPopulation = clamp01(rimCount / Math.max(20, topBand.length * 0.18));
  const score = clamp01(
    0.48 * centerVoidScore +
      0.4 * rimAngularCoverage +
      0.12 * rimPopulation,
  );
  const confidence = clamp01(
    0.55 * score +
      0.25 * centerVoidScore +
      0.2 * rimAngularCoverage,
  );

  if (
    score < 0.74 ||
    centerVoidScore < 0.72 ||
    rimAngularCoverage < 0.58
  ) {
    return null;
  }

  return {
    axis_name: "y",
    axis: [0, 1, 0],
    score,
    confidence,
    center_void_score: centerVoidScore,
    rim_angular_coverage: rimAngularCoverage,
    opening_size_ratio: [
      clamp01((halfX * 2) / Math.max(spanX, 1e-6)),
      clamp01((halfZ * 2) / Math.max(spanZ, 1e-6)),
    ],
    local_center: [centerX, bounds.max[1], centerZ],
    opening_size: [halfX * 2, halfZ * 2],
    access_direction: [0, 1, 0],
    note:
      `Geometry-only top-opening candidate: ${Math.round(centerVoidScore * 100)}% center-void score, ` +
      `${Math.round(rimAngularCoverage * 100)}% rim angular coverage. ` +
      "This does not by itself prove semantic containment.",
  };
}

export function scoreRollAxisFromPointSamples(
  points: readonly Point3[],
  center: AssetDirectabilityVec3,
  boundsSize: AssetDirectabilityVec3,
  axisName: "x" | "y" | "z",
): DirectableAssetRollAxisCandidateV1 | null {
  const axisIndex = AXIS_INDEX[axisName];
  const projectedIndices = [0, 1, 2].filter((index) => index !== axisIndex);
  const spanA = boundsSize[projectedIndices[0]] ?? 0;
  const spanB = boundsSize[projectedIndices[1]] ?? 0;
  const projectedMax = Math.max(spanA, spanB);
  const projectedMin = Math.min(spanA, spanB);
  if (projectedMax <= 1e-7) return null;

  const binMax = Array<number>(DIRECTABLE_ASSET_ROLL_ANGLE_BINS).fill(0);
  let radialMax = 0;
  for (const point of points) {
    const a = point[projectedIndices[0]] - center[projectedIndices[0]];
    const b = point[projectedIndices[1]] - center[projectedIndices[1]];
    const radius = Math.hypot(a, b);
    if (radius <= 1e-8) continue;
    radialMax = Math.max(radialMax, radius);
    const angle = (Math.atan2(b, a) + Math.PI * 2) % (Math.PI * 2);
    const bin = Math.min(
      DIRECTABLE_ASSET_ROLL_ANGLE_BINS - 1,
      Math.floor(
        (angle / (Math.PI * 2)) * DIRECTABLE_ASSET_ROLL_ANGLE_BINS,
      ),
    );
    binMax[bin] = Math.max(binMax[bin], radius);
  }
  if (radialMax <= 1e-8) return null;

  const boundary = binMax.filter((value) => value > radialMax * 0.18);
  const angularCoverage = boundary.length / DIRECTABLE_ASSET_ROLL_ANGLE_BINS;
  const boundaryCv = coefficientOfVariation(boundary);
  const boundaryCircularity = clamp01(1 - boundaryCv / 0.12);
  const projectedSpanRatio = clamp01(projectedMin / projectedMax);
  const axialSpan = boundsSize[axisIndex] ?? 0;
  const axialSpanRatio = axialSpan / Math.max(projectedMax, 1e-6);
  const axialReasonableness = clamp01(1 - Math.max(0, axialSpanRatio - 3) / 3);
  const score = clamp01(
    0.45 * angularCoverage +
      0.35 * boundaryCircularity +
      0.15 * projectedSpanRatio +
      0.05 * axialReasonableness,
  );
  const confidence = clamp01(
    0.5 * score +
      0.25 * angularCoverage +
      0.25 * boundaryCircularity,
  );
  const axialProfile = axialRadiusProfileMetrics(
    points,
    center,
    boundsSize,
    axisName,
  );

  return {
    axis_name: axisName,
    axis: [...AXIS_VECTOR[axisName]],
    score,
    confidence,
    effective_radius_ratio: radialMax / projectedMax,
    projected_span_ratio: projectedSpanRatio,
    axial_span_ratio: axialSpanRatio,
    angular_coverage: angularCoverage,
    boundary_circularity: boundaryCircularity,
    axial_radius_variation: axialProfile.variation,
    axial_radius_symmetry: axialProfile.symmetry,
    rolling_profile: undefined,
    runtime_model: undefined,
    note:
      `Geometry-only candidate around local ${axisName.toUpperCase()} axis: ` +
      `${Math.round(angularCoverage * 100)}% angular coverage, ` +
      `${Math.round(boundaryCircularity * 100)}% boundary circularity. ` +
      "This is an affordance inference, not semantic identity or physics proof.",
  };
}

export function inferGeometryShapeInspectionFromSamples(
  points: readonly Point3[],
  triangleCount: number,
): DirectableAssetGeometryShapeInspectionV1 | null {
  if (points.length < 12) return null;
  const bounds = pointBounds(points);
  const rollCandidates = (["x", "y", "z"] as const)
    .map((axisName) =>
      scoreRollAxisFromPointSamples(
        points,
        bounds.center,
        bounds.size,
        axisName,
      ),
    )
    .filter((item): item is DirectableAssetRollAxisCandidateV1 => Boolean(item))
    .filter(
      (item) =>
        item.score >= 0.58 &&
        item.angular_coverage >= 0.3 &&
        item.projected_span_ratio >= 0.5,
    )
    .map((item) => {
      const rollingProfile = rollingProfileForCandidate(item);
      return {
        ...item,
        rolling_profile: rollingProfile,
        runtime_model: runtimeModelForRollCandidate({
          ...item,
          rolling_profile: rollingProfile,
        }),
      };
    })
    .sort((a, b) => b.score - a.score);

  const topOpening = scoreTopOpeningFromPointSamples(points, bounds);

  return {
    schema_version: DIRECTABLE_ASSET_GEOMETRY_SHAPE_INSPECTION_SCHEMA_VERSION,
    source: "browser_gltf_surface_sample",
    sample_count: points.length,
    triangle_count: Math.max(0, Math.round(triangleCount)),
    local_bounds_size: [...bounds.size],
    roll_candidates: rollCandidates,
    top_opening_candidates: topOpening ? [topOpening] : [],
  };
}

function dot(a: AssetDirectabilityVec3, b: AssetDirectabilityVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalized(vec: AssetDirectabilityVec3): AssetDirectabilityVec3 {
  const length = Math.hypot(vec[0], vec[1], vec[2]);
  return length > 1e-8
    ? [vec[0] / length, vec[1] / length, vec[2] / length]
    : [0, 1, 0];
}

export function rollCandidateDefaultPose(
  candidate: DirectableAssetRollAxisCandidateV1,
  upAxis: AssetDirectabilityVec3,
) {
  const alignment = Math.abs(dot(normalized(candidate.axis), normalized(upAxis)));
  return alignment >= 0.72 ? "requires_reorientation" as const : "ready" as const;
}

export function rollingRadiusFromCandidate(
  candidate: DirectableAssetRollAxisCandidateV1,
  localBoundsSize: AssetDirectabilityVec3,
) {
  const axisIndex = AXIS_INDEX[candidate.axis_name];
  const projected = localBoundsSize.filter((_, index) => index !== axisIndex);
  const projectedSpan = Math.max(projected[0] ?? 0, projected[1] ?? 0, 1e-4);
  return Math.max(1e-4, candidate.effective_radius_ratio * projectedSpan);
}

export function contextualRequirementsForRollCandidate(
  candidate: DirectableAssetRollAxisCandidateV1,
  upAxis: AssetDirectabilityVec3,
) {
  const requirements = [
    "a compatible support plane or surface at the rolling contact",
  ];
  if (rollCandidateDefaultPose(candidate, upAxis) === "requires_reorientation") {
    requirements.push(
      "reorient the asset so the inferred rolling axis is approximately horizontal",
    );
  }
  requirements.push(
    "a travel direction perpendicular to the rolling axis",
  );
  return requirements;
}

export function qualifiedGeometryRollCandidates(
  inspection: DirectableAssetGeometryShapeInspectionV1 | null | undefined,
) {
  if (!inspection) return [];
  return inspection.roll_candidates
    .filter(
      (candidate) =>
        candidate.score >= 0.74 &&
        candidate.confidence >= 0.68 &&
        candidate.angular_coverage >= 0.45 &&
        candidate.boundary_circularity >= 0.58,
    )
    .sort((a, b) => b.score - a.score);
}

export function chooseGeometryRollCandidate(
  inspection: DirectableAssetGeometryShapeInspectionV1 | null | undefined,
) {
  return qualifiedGeometryRollCandidates(inspection)[0] ?? null;
}

export function chooseGeometryTopOpeningCandidate(
  inspection: DirectableAssetGeometryShapeInspectionV1 | null | undefined,
) {
  return [...(inspection?.top_opening_candidates ?? [])]
    .filter(
      (candidate) =>
        candidate.score >= 0.76 &&
        candidate.confidence >= 0.7 &&
        candidate.center_void_score >= 0.72 &&
        candidate.rim_angular_coverage >= 0.58,
    )
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

export function rollInferenceConfidence(
  candidate: DirectableAssetRollAxisCandidateV1,
) {
  return clamp01(
    0.55 * candidate.score +
      0.25 * candidate.boundary_circularity +
      0.2 * candidate.angular_coverage,
  );
}

export function geometryAxisVector(axisName: "x" | "y" | "z") {
  return [...AXIS_VECTOR[axisName]] as AssetDirectabilityVec3;
}
