import type {
  MotionProgramCoordinateSpace,
  MotionProgramVec3,
} from "./motion-program-contract";

function rotateX(value: MotionProgramVec3, radians: number): MotionProgramVec3 {
  const [x, y, z] = value;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [x, y * c - z * s, y * s + z * c];
}

function rotateY(value: MotionProgramVec3, radians: number): MotionProgramVec3 {
  const [x, y, z] = value;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateZ(value: MotionProgramVec3, radians: number): MotionProgramVec3 {
  const [x, y, z] = value;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [x * c - y * s, x * s + y * c, z];
}

/**
 * Basic Phase 1B.4.2 vector-space resolver. World and actor-local are executable.
 * Other semantic spaces stay explicit in the contract and are rejected by the
 * sampler until geometry/camera/path-aware resolvers are introduced.
 */
export function resolveMotionVectorSpace(
  vector: MotionProgramVec3,
  coordinateSpace: MotionProgramCoordinateSpace,
  actorRotation: MotionProgramVec3,
): MotionProgramVec3 | null {
  if (coordinateSpace === "world") return [...vector];
  if (coordinateSpace !== "actor_local") return null;

  // THREE.Euler(..., "XYZ") parity for a local direction is represented here as
  // the equivalent ordered axis application. Canaries remain world-resolved;
  // actor-local support is exercised by the synthetic foundation verifier.
  return rotateZ(
    rotateY(
      rotateX(vector, actorRotation[0]),
      actorRotation[1],
    ),
    actorRotation[2],
  );
}

export function rotateMotionVectorAroundAxis(
  vector: MotionProgramVec3,
  axis: "x" | "y" | "z",
  radians: number,
): MotionProgramVec3 {
  if (axis === "x") return rotateX(vector, radians);
  if (axis === "z") return rotateZ(vector, radians);
  return rotateY(vector, radians);
}
