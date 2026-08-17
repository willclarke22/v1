/**
 * Shared asset-aware interaction geometry.
 *
 * This is deliberately renderer-neutral and state-free. It bridges three existing
 * MyWay authorities without creating a second execution language:
 *
 * - Directability: measured exterior regions are generic surface-contact evidence.
 * - Asset Scene Builder: measured bounds, clearance, collision rejection, and
 *   deterministic candidate search own literal physical validity.
 * - Director / Motion Program: semantic intent and timing remain upstream.
 *
 * The solver produces candidate transforms/paths only. It never activates a
 * persistent attachment, containment, or physics relationship.
 */

export type AssetInteractionVec3 = [number, number, number];

export type AssetInteractionSide =
  | "left"
  | "right"
  | "front"
  | "back"
  | "top"
  | "bottom"
  | "unknown";

export type AssetInteractionPose = {
  position: AssetInteractionVec3;
  rotation: AssetInteractionVec3;
  scale: number;
};

export type AssetInteractionLocalBounds = {
  min: AssetInteractionVec3;
  max: AssetInteractionVec3;
  center: AssetInteractionVec3;
  size: AssetInteractionVec3;
};

export type AssetInteractionContactRegion = {
  id: string;
  label: string;
  local_position: AssetInteractionVec3;
  local_normal: AssetInteractionVec3;
  size: [number, number] | null;
  confidence: number;
  source: "geometry_profile" | "runtime_bounds" | "manual";
  side: AssetInteractionSide;
};

export type AssetInteractionCollisionBox = {
  id: string;
  center: AssetInteractionVec3;
  size: AssetInteractionVec3;
  rotation: AssetInteractionVec3;
  confidence: number;
};

export type AssetInteractionGeometry = {
  local_bounds: AssetInteractionLocalBounds;
  contact_regions: AssetInteractionContactRegion[];
  collision_boxes: AssetInteractionCollisionBox[];
};

export type AssetInteractionObstacle = {
  id: string;
  pose: AssetInteractionPose;
  geometry: AssetInteractionGeometry;
  clearance_m?: number;
};

export type AssetInteractionIntent = {
  id: string;
  kind: "touch" | "nudge" | "push";
  approach_direction: AssetInteractionVec3;
  preferred_target_side?: AssetInteractionSide;
  contact_clearance_m?: number;
  obstacle_clearance_m?: number;
};

export type AssetInteractionPath = {
  start: AssetInteractionVec3;
  control_a: AssetInteractionVec3;
  control_b: AssetInteractionVec3;
  end: AssetInteractionVec3;
  collision_free: boolean;
  sampled_minimum_clearance_m: number;
  route_kind: "direct_arch" | "lateral_arch" | "max_clearance_fallback";
};

export type AssetInteractionContactSolution = {
  status: "resolved" | "bounds_fallback" | "blocked";
  source_region_id: string;
  target_region_id: string;
  source_region_source: AssetInteractionContactRegion["source"];
  target_region_source: AssetInteractionContactRegion["source"];
  source_pose: AssetInteractionPose;
  target_contact_point: AssetInteractionVec3;
  source_contact_point: AssetInteractionVec3;
  target_outward_normal: AssetInteractionVec3;
  surface_gap_m: number;
  normal_alignment: number;
};

export type AssetInteractionMotionSolution = {
  schema_version: "myway_asset_interaction_motion_solution_v1";
  intent_id: string;
  contact: AssetInteractionContactSolution;
  approach: AssetInteractionPath;
  retreat: AssetInteractionPath;
  diagnostics: {
    source_contact_evidence: "measured_surface" | "bounds_face";
    target_contact_evidence: "measured_surface" | "bounds_face";
    approach_collision_free: boolean;
    contact_collision_free: boolean;
    retreat_collision_free: boolean;
    minimum_swept_clearance_m: number;
    contact_obstacle_ids: string[];
    intended_contact_only: true;
  };
};

export type DirectionalClearanceSolution = {
  pose: AssetInteractionPose;
  current_surface_gap_m: number;
  applied_shift_m: number;
  desired_surface_gap_m: number;
};

type ProjectionInterval = {
  min: number;
  max: number;
};

type WorldAabb = {
  min: AssetInteractionVec3;
  max: AssetInteractionVec3;
};

const EPSILON = 1e-7;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function add(a: AssetInteractionVec3, b: AssetInteractionVec3): AssetInteractionVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: AssetInteractionVec3, b: AssetInteractionVec3): AssetInteractionVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: AssetInteractionVec3, scalar: number): AssetInteractionVec3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function dot(a: AssetInteractionVec3, b: AssetInteractionVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(value: AssetInteractionVec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(
  value: AssetInteractionVec3,
  fallback: AssetInteractionVec3 = [1, 0, 0],
): AssetInteractionVec3 {
  const magnitude = length(value);
  return magnitude > EPSILON ? scale(value, 1 / magnitude) : [...fallback];
}

function lerp(a: number, b: number, progress: number) {
  return a + (b - a) * progress;
}

function lerpVec3(
  a: AssetInteractionVec3,
  b: AssetInteractionVec3,
  progress: number,
): AssetInteractionVec3 {
  return [
    lerp(a[0], b[0], progress),
    lerp(a[1], b[1], progress),
    lerp(a[2], b[2], progress),
  ];
}

export function sampleAssetInteractionBezier(
  path: Pick<AssetInteractionPath, "start" | "control_a" | "control_b" | "end">,
  progress: number,
): AssetInteractionVec3 {
  const t = clamp(progress, 0, 1);
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return [
    path.start[0] * a + path.control_a[0] * b + path.control_b[0] * c + path.end[0] * d,
    path.start[1] * a + path.control_a[1] * b + path.control_b[1] * c + path.end[1] * d,
    path.start[2] * a + path.control_a[2] * b + path.control_b[2] * c + path.end[2] * d,
  ];
}

/**
 * Matches THREE.Euler's default XYZ intent closely enough for deterministic
 * geometry constraints while keeping this module renderer-neutral.
 */
function rotateEuler(
  value: AssetInteractionVec3,
  rotation: AssetInteractionVec3,
): AssetInteractionVec3 {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  const afterX: AssetInteractionVec3 = [
    value[0],
    value[1] * cx - value[2] * sx,
    value[1] * sx + value[2] * cx,
  ];
  const afterY: AssetInteractionVec3 = [
    afterX[0] * cy + afterX[2] * sy,
    afterX[1],
    -afterX[0] * sy + afterX[2] * cy,
  ];
  return [
    afterY[0] * cz - afterY[1] * sz,
    afterY[0] * sz + afterY[1] * cz,
    afterY[2],
  ];
}

function transformLocalPoint(
  local: AssetInteractionVec3,
  pose: AssetInteractionPose,
): AssetInteractionVec3 {
  return add(
    pose.position,
    rotateEuler(scale(local, Math.max(EPSILON, Math.abs(pose.scale))), pose.rotation),
  );
}

function transformLocalNormal(
  local: AssetInteractionVec3,
  pose: AssetInteractionPose,
): AssetInteractionVec3 {
  return normalize(rotateEuler(normalize(local), pose.rotation), [0, 1, 0]);
}

function boundsFaceRegions(
  geometry: AssetInteractionGeometry,
): AssetInteractionContactRegion[] {
  const { min, max } = geometry.local_bounds;
  const mid: AssetInteractionVec3 = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ];
  const width = Math.max(EPSILON, max[0] - min[0]);
  const height = Math.max(EPSILON, max[1] - min[1]);
  const depth = Math.max(EPSILON, max[2] - min[2]);
  const make = (
    side: AssetInteractionSide,
    point: AssetInteractionVec3,
    normalValue: AssetInteractionVec3,
    sizeValue: [number, number],
  ): AssetInteractionContactRegion => ({
    id: `bounds_face:${side}`,
    label: `${side} bounds contact face`,
    local_position: point,
    local_normal: normalValue,
    size: sizeValue,
    confidence: 0.2,
    source: "runtime_bounds",
    side,
  });

  return [
    make("left", [min[0], mid[1], mid[2]], [-1, 0, 0], [height, depth]),
    make("right", [max[0], mid[1], mid[2]], [1, 0, 0], [height, depth]),
    make("bottom", [mid[0], min[1], mid[2]], [0, -1, 0], [width, depth]),
    make("top", [mid[0], max[1], mid[2]], [0, 1, 0], [width, depth]),
    make("back", [mid[0], mid[1], min[2]], [0, 0, -1], [width, height]),
    make("front", [mid[0], mid[1], max[2]], [0, 0, 1], [width, height]),
  ];
}

function contactCandidates(geometry: AssetInteractionGeometry) {
  const measured = geometry.contact_regions.filter(
    (region) =>
      Number.isFinite(region.confidence) &&
      region.confidence >= 0.15 &&
      length(region.local_normal) > EPSILON,
  );
  return measured.length ? measured : boundsFaceRegions(geometry);
}

function regionWorldNormal(
  region: AssetInteractionContactRegion,
  pose: AssetInteractionPose,
) {
  return transformLocalNormal(region.local_normal, pose);
}

function preferredSideBonus(
  region: AssetInteractionContactRegion,
  preferred: AssetInteractionSide | undefined,
) {
  if (!preferred || preferred === "unknown") return 0;
  return region.side === preferred ? 0.2 : 0;
}

type ContactPairCandidate = {
  source: AssetInteractionContactRegion;
  target: AssetInteractionContactRegion;
  sourceNormal: AssetInteractionVec3;
  targetNormal: AssetInteractionVec3;
  score: number;
};

function contactPairCandidates(input: {
  sourceGeometry: AssetInteractionGeometry;
  sourcePose: AssetInteractionPose;
  targetGeometry: AssetInteractionGeometry;
  targetPose: AssetInteractionPose;
  intent: AssetInteractionIntent;
}): ContactPairCandidate[] {
  const travel = normalize(input.intent.approach_direction, [1, 0, 0]);
  const targetDesiredNormal = scale(travel, -1);
  const sourceCandidates = contactCandidates(input.sourceGeometry);
  const targetCandidates = contactCandidates(input.targetGeometry);
  const candidates: ContactPairCandidate[] = [];

  for (const source of sourceCandidates) {
    const sourceNormal = regionWorldNormal(source, input.sourcePose);
    for (const target of targetCandidates) {
      const targetNormal = regionWorldNormal(target, input.targetPose);
      const targetAlignment = Math.max(-1, dot(targetNormal, targetDesiredNormal));
      const opposedAlignment = Math.max(
        -1,
        dot(sourceNormal, scale(targetNormal, -1)),
      );
      const measuredBonus =
        (source.source === "runtime_bounds" ? 0 : 0.08) +
        (target.source === "runtime_bounds" ? 0 : 0.08);
      const scoreValue =
        targetAlignment * 0.42 +
        opposedAlignment * 0.34 +
        clamp(source.confidence, 0, 1) * 0.05 +
        clamp(target.confidence, 0, 1) * 0.05 +
        preferredSideBonus(target, input.intent.preferred_target_side) +
        measuredBonus;

      candidates.push({
        source,
        target,
        sourceNormal,
        targetNormal,
        score: scoreValue,
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      `${left.source.id}|${left.target.id}`.localeCompare(
        `${right.source.id}|${right.target.id}`,
      ),
  );
}

function localBoundsCorners(bounds: AssetInteractionLocalBounds) {
  const output: AssetInteractionVec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        output.push([x, y, z]);
      }
    }
  }
  return output;
}

function boxLocalBounds(box: AssetInteractionCollisionBox): AssetInteractionLocalBounds {
  const half: AssetInteractionVec3 = [
    Math.max(EPSILON, Math.abs(box.size[0])) * 0.5,
    Math.max(EPSILON, Math.abs(box.size[1])) * 0.5,
    Math.max(EPSILON, Math.abs(box.size[2])) * 0.5,
  ];
  return {
    min: [-half[0], -half[1], -half[2]],
    max: [half[0], half[1], half[2]],
    center: [0, 0, 0],
    size: [half[0] * 2, half[1] * 2, half[2] * 2],
  };
}

function worldCollisionPoints(
  geometry: AssetInteractionGeometry,
  pose: AssetInteractionPose,
): AssetInteractionVec3[][] {
  if (!geometry.collision_boxes.length) {
    return [localBoundsCorners(geometry.local_bounds).map((point) =>
      transformLocalPoint(point, pose),
    )];
  }

  return geometry.collision_boxes.map((box) => {
    const boxBounds = boxLocalBounds(box);
    return localBoundsCorners(boxBounds).map((corner) => {
      const inBox = add(rotateEuler(corner, box.rotation), box.center);
      return transformLocalPoint(inBox, pose);
    });
  });
}

function projectionInterval(
  points: AssetInteractionVec3[],
  axis: AssetInteractionVec3,
): ProjectionInterval {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const projection = dot(point, axis);
    minimum = Math.min(minimum, projection);
    maximum = Math.max(maximum, projection);
  }
  return { min: minimum, max: maximum };
}

function geometryProjectionInterval(
  geometry: AssetInteractionGeometry,
  pose: AssetInteractionPose,
  axis: AssetInteractionVec3,
): ProjectionInterval {
  // Contact separation uses the complete visible normalized hull, even when the
  // geometry profile also supplies smaller collision boxes. This fail-safe is
  // intentional: a coarse collision proxy must never let a thumb, tail, handle,
  // or other visible overhang penetrate the intended contact partner.
  return projectionInterval(
    localBoundsCorners(geometry.local_bounds).map((point) =>
      transformLocalPoint(point, pose),
    ),
    axis,
  );
}

function aabbFromPoints(points: AssetInteractionVec3[]): WorldAabb {
  const minimum: AssetInteractionVec3 = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const maximum: AssetInteractionVec3 = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
  }
  return { min: minimum, max: maximum };
}

function worldAabbs(
  geometry: AssetInteractionGeometry,
  pose: AssetInteractionPose,
  padding = 0,
): WorldAabb[] {
  return worldCollisionPoints(geometry, pose).map((points) => {
    const box = aabbFromPoints(points);
    return {
      min: [
        box.min[0] - padding,
        box.min[1] - padding,
        box.min[2] - padding,
      ],
      max: [
        box.max[0] + padding,
        box.max[1] + padding,
        box.max[2] + padding,
      ],
    };
  });
}

function aabbOverlap(a: WorldAabb, b: WorldAabb, tolerance = 0.001) {
  return (
    a.min[0] < b.max[0] - tolerance &&
    a.max[0] > b.min[0] + tolerance &&
    a.min[1] < b.max[1] - tolerance &&
    a.max[1] > b.min[1] + tolerance &&
    a.min[2] < b.max[2] - tolerance &&
    a.max[2] > b.min[2] + tolerance
  );
}

function axisGap(a: WorldAabb, b: WorldAabb) {
  const dx = Math.max(0, Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0]));
  const dy = Math.max(0, Math.max(a.min[1] - b.max[1], b.min[1] - a.max[1]));
  const dz = Math.max(0, Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2]));
  return Math.hypot(dx, dy, dz);
}

function minimumGeometryGap(
  sourceGeometry: AssetInteractionGeometry,
  sourcePose: AssetInteractionPose,
  targetGeometry: AssetInteractionGeometry,
  targetPose: AssetInteractionPose,
) {
  const sourceBoxes = worldAabbs(sourceGeometry, sourcePose);
  const targetBoxes = worldAabbs(targetGeometry, targetPose);
  let minimum = Number.POSITIVE_INFINITY;
  for (const source of sourceBoxes) {
    for (const target of targetBoxes) {
      if (aabbOverlap(source, target)) return -0.001;
      minimum = Math.min(minimum, axisGap(source, target));
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function poseAt(
  base: AssetInteractionPose,
  position: AssetInteractionVec3,
): AssetInteractionPose {
  return {
    position,
    rotation: [...base.rotation],
    scale: base.scale,
  };
}

function pathCollisionReport(input: {
  path: Pick<AssetInteractionPath, "start" | "control_a" | "control_b" | "end">;
  sourcePose: AssetInteractionPose;
  sourceGeometry: AssetInteractionGeometry;
  targetPose: AssetInteractionPose;
  targetGeometry: AssetInteractionGeometry;
  obstacles: AssetInteractionObstacle[];
  direction: "approach" | "retreat";
  clearance: number;
  targetClearance: number;
}) {
  let minimumClearance = Number.POSITIVE_INFINITY;
  let collision = false;
  const sampleCount = 36;

  for (let index = 1; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const position = sampleAssetInteractionBezier(input.path, progress);
    const sourcePose = poseAt(input.sourcePose, position);

    // The target is a physical obstacle through the motion corridor except for
    // the intentional contact tail/head of the path.
    const targetContactAllowance =
      input.direction === "approach" ? progress >= 0.955 : progress <= 0.045;
    if (!targetContactAllowance) {
      const gap = minimumGeometryGap(
        input.sourceGeometry,
        sourcePose,
        input.targetGeometry,
        input.targetPose,
      );
      minimumClearance = Math.min(minimumClearance, gap);
      if (gap < input.targetClearance - 0.0015) collision = true;
    }

    for (const obstacle of input.obstacles) {
      const gap = minimumGeometryGap(
        input.sourceGeometry,
        sourcePose,
        obstacle.geometry,
        obstacle.pose,
      );
      const required = Math.max(input.clearance, obstacle.clearance_m ?? 0);
      minimumClearance = Math.min(minimumClearance, gap);
      if (gap < required - 0.0015) collision = true;
    }
  }

  return {
    collision,
    minimumClearance: Number.isFinite(minimumClearance)
      ? minimumClearance
      : input.clearance,
  };
}

function horizontalSide(direction: AssetInteractionVec3): AssetInteractionVec3 {
  const side: AssetInteractionVec3 = [-direction[2], 0, direction[0]];
  return normalize(side, [0, 0, 1]);
}

function solveClearancePath(input: {
  start: AssetInteractionVec3;
  end: AssetInteractionVec3;
  sourcePose: AssetInteractionPose;
  sourceGeometry: AssetInteractionGeometry;
  targetPose: AssetInteractionPose;
  targetGeometry: AssetInteractionGeometry;
  obstacles: AssetInteractionObstacle[];
  direction: "approach" | "retreat";
  clearance: number;
  targetClearance: number;
  contactNormal: AssetInteractionVec3;
}): AssetInteractionPath {
  const travel = normalize(subtract(input.end, input.start), [1, 0, 0]);
  const side = horizontalSide(travel);
  const sourceHeight =
    Math.max(EPSILON, input.sourceGeometry.local_bounds.size[1]) *
    Math.max(EPSILON, Math.abs(input.sourcePose.scale));
  const baseLift = Math.max(0.22, sourceHeight * 0.62, input.clearance * 4);
  const sideStep = Math.max(0.14, input.sourceGeometry.local_bounds.size[0] *
    Math.max(EPSILON, Math.abs(input.sourcePose.scale)) * 0.55);

  const routeSpecs: Array<{
    lift: number;
    lateral: number;
    route_kind: AssetInteractionPath["route_kind"];
  }> = [];
  for (const multiplier of [0.7, 1.0, 1.35, 1.75, 2.2]) {
    routeSpecs.push({
      lift: baseLift * multiplier,
      lateral: 0,
      route_kind: "direct_arch",
    });
  }
  for (const multiplier of [1.0, 1.4, 1.9]) {
    for (const lateralSign of [1, -1]) {
      routeSpecs.push({
        lift: baseLift * multiplier,
        lateral: sideStep * lateralSign * multiplier,
        route_kind: "lateral_arch",
      });
    }
  }

  let bestFallback: AssetInteractionPath | null = null;
  const contactNormal = normalize(input.contactNormal, scale(travel, -1));
  const sourceNormalInterval = geometryProjectionInterval(
    input.sourceGeometry,
    input.sourcePose,
    contactNormal,
  );
  const sourceContactThickness = Math.max(
    EPSILON,
    sourceNormalInterval.max - sourceNormalInterval.min,
  );
  // Only the source thickness along the actual contact normal determines how
  // long the final normal-to-surface lead must be. Using the asset's longest
  // dimension made a forearm-length hand swing back through neighboring actors.
  const contactLeadDistance = Math.max(
    0.12,
    sourceContactThickness * 0.62,
    input.clearance * 5,
  );

  for (const spec of routeSpecs) {
    const offset = add([0, spec.lift, 0], scale(side, spec.lateral));
    const outwardContactControl =
      input.direction === "approach"
        ? add(input.end, scale(contactNormal, contactLeadDistance))
        : add(input.start, scale(contactNormal, contactLeadDistance));
    const candidateBase =
      input.direction === "approach"
        ? {
            start: [...input.start] as AssetInteractionVec3,
            control_a: add(lerpVec3(input.start, outwardContactControl, 0.48), offset),
            // Final derivative is exactly normal-to-surface: the source cannot
            // cut diagonally through the target on its last few frames.
            control_b: outwardContactControl,
            end: [...input.end] as AssetInteractionVec3,
          }
        : {
            start: [...input.start] as AssetInteractionVec3,
            // Retreat first moves away along the same contact normal before
            // bending back toward the staging/exit pose.
            control_a: outwardContactControl,
            control_b: add(lerpVec3(outwardContactControl, input.end, 0.52), offset),
            end: [...input.end] as AssetInteractionVec3,
          };
    const report = pathCollisionReport({
      path: candidateBase,
      sourcePose: input.sourcePose,
      sourceGeometry: input.sourceGeometry,
      targetPose: input.targetPose,
      targetGeometry: input.targetGeometry,
      obstacles: input.obstacles,
      direction: input.direction,
      clearance: input.clearance,
      targetClearance: input.targetClearance,
    });
    const candidate: AssetInteractionPath = {
      ...candidateBase,
      collision_free: !report.collision,
      sampled_minimum_clearance_m: report.minimumClearance,
      route_kind: spec.route_kind,
    };
    if (!bestFallback || candidate.sampled_minimum_clearance_m >
      bestFallback.sampled_minimum_clearance_m) {
      bestFallback = candidate;
    }
    if (candidate.collision_free) return candidate;
  }

  const fallback = bestFallback ?? {
    start: [...input.start] as AssetInteractionVec3,
    control_a: add(lerpVec3(input.start, input.end, 0.25), [0, baseLift * 2.6, 0]),
    control_b: add(lerpVec3(input.start, input.end, 0.75), [0, baseLift * 2.6, 0]),
    end: [...input.end] as AssetInteractionVec3,
    collision_free: false,
    sampled_minimum_clearance_m: -0.001,
    route_kind: "max_clearance_fallback" as const,
  };
  return {
    ...fallback,
    route_kind: "max_clearance_fallback",
  };
}

export function resolveAssetAwareInteractionMotion(input: {
  intent: AssetInteractionIntent;
  sourcePose: AssetInteractionPose;
  sourceGeometry: AssetInteractionGeometry;
  targetPose: AssetInteractionPose;
  targetGeometry: AssetInteractionGeometry;
  obstacles?: AssetInteractionObstacle[];
  retreatEnd?: AssetInteractionVec3;
}): AssetInteractionMotionSolution {
  const contactClearance = Math.max(
    0.001,
    input.intent.contact_clearance_m ?? 0.006,
  );
  const obstacleClearance = Math.max(
    contactClearance,
    input.intent.obstacle_clearance_m ?? 0.025,
  );
  const obstacles = input.obstacles ?? [];
  const pairs = contactPairCandidates({
    sourceGeometry: input.sourceGeometry,
    sourcePose: input.sourcePose,
    targetGeometry: input.targetGeometry,
    targetPose: input.targetPose,
    intent: input.intent,
  });

  if (!pairs.length) {
    throw new Error(
      "Asset-aware interaction solver could not construct contact candidates.",
    );
  }

  let bestFallback:
    | {
        solution: AssetInteractionMotionSolution;
        quality: number;
      }
    | null = null;

  for (const pair of pairs) {
    const targetPoint = transformLocalPoint(
      pair.target.local_position,
      input.targetPose,
    );
    const sourceOffset = rotateEuler(
      scale(
        pair.source.local_position,
        Math.max(EPSILON, Math.abs(input.sourcePose.scale)),
      ),
      input.sourcePose.rotation,
    );
    const targetNormal = normalize(
      pair.targetNormal,
      scale(normalize(input.intent.approach_direction), -1),
    );

    // Start from the Directability-style surface candidate, then let complete
    // visible-hull projection own the final separation. A coarse collision box
    // can never hide a thumb/handle/tail penetration at intended contact.
    let contactRoot = subtract(
      add(targetPoint, scale(targetNormal, contactClearance)),
      sourceOffset,
    );
    let contactPose = poseAt(input.sourcePose, contactRoot);
    const targetProjection = geometryProjectionInterval(
      input.targetGeometry,
      input.targetPose,
      targetNormal,
    );
    const sourceProjection = geometryProjectionInterval(
      input.sourceGeometry,
      contactPose,
      targetNormal,
    );
    const projectionCorrection =
      targetProjection.max + contactClearance - sourceProjection.min;
    contactRoot = add(contactRoot, scale(targetNormal, projectionCorrection));
    contactPose = poseAt(input.sourcePose, contactRoot);

    const sourceProjectionAfter = geometryProjectionInterval(
      input.sourceGeometry,
      contactPose,
      targetNormal,
    );
    const surfaceGap = sourceProjectionAfter.min - targetProjection.max;
    const sourceContactPoint = add(
      targetPoint,
      scale(targetNormal, Math.max(0, surfaceGap)),
    );

    const contactObstacleIds = obstacles
      .filter((obstacle) => {
        const gap = minimumGeometryGap(
          input.sourceGeometry,
          contactPose,
          obstacle.geometry,
          obstacle.pose,
        );
        return (
          gap <
          Math.max(obstacleClearance, obstacle.clearance_m ?? 0) - 0.0015
        );
      })
      .map((obstacle) => obstacle.id);

    const approach = solveClearancePath({
      start: input.sourcePose.position,
      end: contactRoot,
      sourcePose: input.sourcePose,
      sourceGeometry: input.sourceGeometry,
      targetPose: input.targetPose,
      targetGeometry: input.targetGeometry,
      obstacles,
      direction: "approach",
      clearance: obstacleClearance,
      targetClearance: contactClearance,
      contactNormal: targetNormal,
    });
    const retreat = solveClearancePath({
      start: contactRoot,
      end: input.retreatEnd ?? input.sourcePose.position,
      sourcePose: contactPose,
      sourceGeometry: input.sourceGeometry,
      targetPose: input.targetPose,
      targetGeometry: input.targetGeometry,
      obstacles,
      direction: "retreat",
      clearance: obstacleClearance,
      targetClearance: contactClearance,
      contactNormal: targetNormal,
    });

    const sourceMeasured = pair.source.source !== "runtime_bounds";
    const targetMeasured = pair.target.source !== "runtime_bounds";
    const physicallyValid =
      contactObstacleIds.length === 0 &&
      approach.collision_free &&
      retreat.collision_free;
    const solution: AssetInteractionMotionSolution = {
      schema_version: "myway_asset_interaction_motion_solution_v1",
      intent_id: input.intent.id,
      contact: {
        status: contactObstacleIds.length
          ? "blocked"
          : sourceMeasured && targetMeasured
            ? "resolved"
            : "bounds_fallback",
        source_region_id: pair.source.id,
        target_region_id: pair.target.id,
        source_region_source: pair.source.source,
        target_region_source: pair.target.source,
        source_pose: contactPose,
        target_contact_point: targetPoint,
        source_contact_point: sourceContactPoint,
        target_outward_normal: targetNormal,
        surface_gap_m: surfaceGap,
        normal_alignment: dot(
          pair.sourceNormal,
          scale(targetNormal, -1),
        ),
      },
      approach,
      retreat,
      diagnostics: {
        source_contact_evidence: sourceMeasured
          ? "measured_surface"
          : "bounds_face",
        target_contact_evidence: targetMeasured
          ? "measured_surface"
          : "bounds_face",
        approach_collision_free: approach.collision_free,
        contact_collision_free: contactObstacleIds.length === 0,
        retreat_collision_free: retreat.collision_free,
        minimum_swept_clearance_m: Math.min(
          approach.sampled_minimum_clearance_m,
          retreat.sampled_minimum_clearance_m,
        ),
        contact_obstacle_ids: contactObstacleIds,
        intended_contact_only: true,
      },
    };

    // Candidate ordering preserves semantic preference, but literal validity
    // outranks preference. This is the same "request a relation -> Builder may
    // adjust/reject exact placement" boundary used by Asset Scene Builder.
    if (physicallyValid) return solution;

    const quality =
      (contactObstacleIds.length === 0 ? 30 : 0) +
      (approach.collision_free ? 12 : 0) +
      (retreat.collision_free ? 8 : 0) +
      pair.score * 4 +
      Math.max(
        -1,
        Math.min(1, solution.diagnostics.minimum_swept_clearance_m),
      );
    if (!bestFallback || quality > bestFallback.quality) {
      bestFallback = { solution, quality };
    }
  }

  if (!bestFallback) {
    throw new Error("Asset-aware interaction solver produced no usable candidate.");
  }
  return bestFallback.solution;
}

/**
 * General pair-spacing primitive: preserve semantic direction while guaranteeing
 * a minimum visible-hull gap. This is useful for "behind", "beside", staging,
 * and negative-space constraints without hard-coding center-to-center distances.
 */
export function enforceDirectionalSurfaceClearance(input: {
  movingPose: AssetInteractionPose;
  movingGeometry: AssetInteractionGeometry;
  anchorPose: AssetInteractionPose;
  anchorGeometry: AssetInteractionGeometry;
  direction: AssetInteractionVec3;
  minimumSurfaceGapM: number;
}): DirectionalClearanceSolution {
  const direction = normalize(input.direction, [0, 0, -1]);
  const minimumGap = Math.max(0, input.minimumSurfaceGapM);
  const movingInterval = geometryProjectionInterval(
    input.movingGeometry,
    input.movingPose,
    direction,
  );
  const anchorInterval = geometryProjectionInterval(
    input.anchorGeometry,
    input.anchorPose,
    direction,
  );

  // The moving object is intended to sit farther along +direction than anchor.
  const currentGap = movingInterval.min - anchorInterval.max;
  const shift = Math.max(0, minimumGap - currentGap);
  return {
    pose: {
      ...input.movingPose,
      position: add(input.movingPose.position, scale(direction, shift)),
    },
    current_surface_gap_m: currentGap,
    applied_shift_m: shift,
    desired_surface_gap_m: minimumGap,
  };
}

export function assetInteractionGeometryOverlaps(input: {
  leftPose: AssetInteractionPose;
  leftGeometry: AssetInteractionGeometry;
  rightPose: AssetInteractionPose;
  rightGeometry: AssetInteractionGeometry;
  toleranceM?: number;
}) {
  const leftBoxes = worldAabbs(input.leftGeometry, input.leftPose);
  const rightBoxes = worldAabbs(input.rightGeometry, input.rightPose);
  return leftBoxes.some((left) =>
    rightBoxes.some((right) =>
      aabbOverlap(left, right, Math.max(0, input.toleranceM ?? 0.001)),
    ),
  );
}
