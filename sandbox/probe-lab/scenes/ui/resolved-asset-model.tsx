"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";

import type {
  MyWayAssetSupportSurface,
} from "../../assets/asset-types";
import type { ResolvedSceneAssetBinding } from "../resolved-scene";

export type Vec3 = [number, number, number];

export type ResolvedAssetRuntimeSupportSurface = {
  id: string;
  center_offset: Vec3;
  normal: Vec3;
  u_axis: Vec3;
  v_axis: Vec3;
  size: [number, number];
  area: number;
  confidence: number;
  height_ratio: number;
  size_ratio: [number, number];
};

export type ResolvedAssetRuntimeMetrics = {
  instance_id: string;
  source_size: Vec3;
  world_size: Vec3;
  bottom_center_offset: Vec3;
  support_surfaces: ResolvedAssetRuntimeSupportSurface[];
};

type LocalSupportSurface = {
  id: string;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  size: [number, number];
  area: number;
  confidence: number;
  heightRatio: number;
  sizeRatio: [number, number];
};

type SurfaceAccumulator = {
  height: number;
  area: number;
  weightedCenter: THREE.Vector3;
  weightedNormal: THREE.Vector3;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const MAX_TRIANGLES_TO_SAMPLE = 36_000;

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function motionNumber(
  motion: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
) {
  return finite(motion?.[key], fallback);
}

function motionVec3(
  value: unknown,
  fallback: Vec3,
): Vec3 {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  ];
}

function asVec3(value: THREE.Vector3): Vec3 {
  return [value.x, value.y, value.z];
}

function normalizedOr(
  value: THREE.Vector3,
  fallback: THREE.Vector3,
) {
  return value.lengthSq() > 1e-12
    ? value.normalize()
    : fallback.clone();
}

function localSurfaceFromRecord(
  surface: MyWayAssetSupportSurface,
  sourceSize: Vec3,
): LocalSupportSurface {
  const center = new THREE.Vector3(
    surface.center[0],
    surface.center[1],
    surface.center[2],
  );
  const normal = normalizedOr(
    new THREE.Vector3(
      surface.normal[0],
      surface.normal[1],
      surface.normal[2],
    ),
    new THREE.Vector3(0, 1, 0),
  );
  const uAxis = normalizedOr(
    new THREE.Vector3(
      surface.u_axis[0],
      surface.u_axis[1],
      surface.u_axis[2],
    ),
    new THREE.Vector3(1, 0, 0),
  );
  const vAxis = normalizedOr(
    new THREE.Vector3(
      surface.v_axis[0],
      surface.v_axis[1],
      surface.v_axis[2],
    ),
    new THREE.Vector3(0, 0, 1),
  );

  return {
    id: surface.id,
    center,
    normal,
    uAxis,
    vAxis,
    size: [
      Math.max(0.001, surface.size[0]),
      Math.max(0.001, surface.size[1]),
    ],
    area: Math.max(0, surface.area),
    confidence: Math.max(
      0,
      Math.min(1, surface.confidence),
    ),
    heightRatio:
      surface.height_ratio ??
      center.y / Math.max(sourceSize[1], 0.001),
    sizeRatio:
      surface.footprint_ratio ?? [
        surface.size[0] /
          Math.max(sourceSize[0], 0.001),
        surface.size[1] /
          Math.max(sourceSize[2], 0.001),
      ],
  };
}

function triangleVertex(
  position: THREE.BufferAttribute,
  index: THREE.BufferAttribute | null,
  triangleIndex: number,
  corner: number,
  target: THREE.Vector3,
) {
  const rawIndex = index
    ? index.getX(triangleIndex * 3 + corner)
    : triangleIndex * 3 + corner;

  target.set(
    position.getX(rawIndex),
    position.getY(rawIndex),
    position.getZ(rawIndex),
  );
}

function detectSupportSurfaces(
  root: THREE.Object3D,
  bounds: THREE.Box3,
): LocalSupportSurface[] {
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(
    size.x,
    size.y,
    size.z,
    0.001,
  );
  const heightTolerance = Math.max(
    0.004,
    longest * 0.012,
  );
  const minimumTriangleArea =
    longest * longest * 1e-7;
  const triangles: Array<{
    height: number;
    area: number;
    center: THREE.Vector3;
    normal: THREE.Vector3;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }> = [];

  root.updateMatrixWorld(true);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    const geometry = object.geometry;
    const position = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute | undefined;
    if (!position) return;

    const index = geometry.index;
    const triangleCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(position.count / 3);
    const stride = Math.max(
      1,
      Math.ceil(
        triangleCount /
          MAX_TRIANGLES_TO_SAMPLE,
      ),
    );
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();

    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += stride
    ) {
      triangleVertex(
        position,
        index,
        triangleIndex,
        0,
        a,
      );
      triangleVertex(
        position,
        index,
        triangleIndex,
        1,
        b,
      );
      triangleVertex(
        position,
        index,
        triangleIndex,
        2,
        c,
      );
      a.applyMatrix4(object.matrixWorld);
      b.applyMatrix4(object.matrixWorld);
      c.applyMatrix4(object.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      cross.crossVectors(ab, ac);
      const doubledArea = cross.length();
      if (
        doubledArea <= minimumTriangleArea * 2
      ) {
        continue;
      }

      const normal = cross
        .clone()
        .normalize();

      // Geometry—not an object name—decides whether this is an upward-facing
      // surface that can support another object.
      if (normal.y < 0.82) continue;

      const center = new THREE.Vector3()
        .add(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      triangles.push({
        height: center.y,
        area: doubledArea * 0.5 * stride,
        center,
        normal,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minZ: Math.min(a.z, b.z, c.z),
        maxZ: Math.max(a.z, b.z, c.z),
      });
    }
  });

  triangles.sort(
    (left, right) =>
      left.height - right.height,
  );
  const clusters: SurfaceAccumulator[] = [];

  for (const triangle of triangles) {
    let cluster: SurfaceAccumulator | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const candidate of clusters) {
      const delta = Math.abs(
        candidate.height - triangle.height,
      );
      if (
        delta <= heightTolerance &&
        delta < bestDelta
      ) {
        cluster = candidate;
        bestDelta = delta;
      }
    }

    if (!cluster) {
      cluster = {
        height: triangle.height,
        area: 0,
        weightedCenter: new THREE.Vector3(),
        weightedNormal: new THREE.Vector3(),
        minX: triangle.minX,
        maxX: triangle.maxX,
        minZ: triangle.minZ,
        maxZ: triangle.maxZ,
      };
      clusters.push(cluster);
    }

    const oldArea = cluster.area;
    const totalArea =
      oldArea + triangle.area;
    cluster.height =
      (cluster.height * oldArea +
        triangle.height * triangle.area) /
      Math.max(totalArea, 1e-9);
    cluster.area = totalArea;
    cluster.weightedCenter.addScaledVector(
      triangle.center,
      triangle.area,
    );
    cluster.weightedNormal.addScaledVector(
      triangle.normal,
      triangle.area,
    );
    cluster.minX = Math.min(
      cluster.minX,
      triangle.minX,
    );
    cluster.maxX = Math.max(
      cluster.maxX,
      triangle.maxX,
    );
    cluster.minZ = Math.min(
      cluster.minZ,
      triangle.minZ,
    );
    cluster.maxZ = Math.max(
      cluster.maxZ,
      triangle.maxZ,
    );
  }

  const maximumArea = Math.max(
    0,
    ...clusters.map((cluster) => cluster.area),
  );
  const footprintArea = Math.max(
    size.x * size.z,
    1e-9,
  );
  const minimumSurfaceArea = Math.max(
    footprintArea * 0.0025,
    maximumArea * 0.025,
  );
  const surfaces = clusters
    .filter((cluster) => {
      const width =
        cluster.maxX - cluster.minX;
      const depth =
        cluster.maxZ - cluster.minZ;

      return (
        cluster.area >= minimumSurfaceArea &&
        width >= longest * 0.015 &&
        depth >= longest * 0.015
      );
    })
    .map(
      (
        cluster,
        index,
      ): LocalSupportSurface => {
        const width =
          cluster.maxX - cluster.minX;
        const depth =
          cluster.maxZ - cluster.minZ;
        const center =
          cluster.weightedCenter
            .clone()
            .multiplyScalar(
              1 / Math.max(cluster.area, 1e-9),
            );
        center.y = cluster.height;
        const normal = normalizedOr(
          cluster.weightedNormal,
          new THREE.Vector3(0, 1, 0),
        );
        const areaRatio = Math.min(
          1,
          cluster.area / footprintArea,
        );
        const confidence = Math.max(
          0.05,
          Math.min(
            1,
            normal.y * 0.62 +
              Math.min(1, areaRatio * 4) *
                0.38,
          ),
        );

        return {
          id: `runtime_surface_${index + 1}`,
          center,
          normal,
          uAxis: new THREE.Vector3(1, 0, 0),
          vAxis: new THREE.Vector3(0, 0, 1),
          size: [width, depth],
          area: cluster.area,
          confidence,
          heightRatio:
            (cluster.height - bounds.min.y) /
            Math.max(size.y, 0.001),
          sizeRatio: [
            width / Math.max(size.x, 0.001),
            depth / Math.max(size.z, 0.001),
          ],
        };
      },
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.area - left.area,
    )
    .slice(0, 16);

  return surfaces;
}

export function fittedResolvedAssetScale(
  binding: ResolvedSceneAssetBinding,
  sourceSize: Vec3,
  targetExtentOverride?: number,
) {
  const dimensions = sourceSize.map((value) =>
    Math.max(0.001, Math.abs(value)),
  ) as Vec3;
  const largest = Math.max(...dimensions);
  const target = Math.max(
    0.05,
    targetExtentOverride ?? binding.target_extent_m,
  );
  const uniform =
    (target / largest) *
    Math.max(0.0001, binding.default_scale || 1);

  return [
    uniform * binding.scale[0],
    uniform * binding.scale[1],
    uniform * binding.scale[2],
  ] as Vec3;
}

export function ResolvedAssetModel({
  binding,
  active = false,
  positionOverride,
  rotationOverride,
  targetExtentOverride,
  onClick,
  onMetrics,
}: {
  binding: ResolvedSceneAssetBinding;
  active?: boolean;
  positionOverride?: Vec3;
  rotationOverride?: Vec3;
  targetExtentOverride?: number;
  onClick?: () => void;
  onMetrics?: (
    metrics: ResolvedAssetRuntimeMetrics,
  ) => void;
}) {
  const gltf = useGLTF(binding.public_path);
  const groupRef = useRef<THREE.Group>(null);

  const prepared = useMemo(() => {
    const clone = gltf.scene.clone(true);

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    clone.updateMatrixWorld(true);
    const initialBounds =
      new THREE.Box3().setFromObject(clone);
    const size = initialBounds.getSize(
      new THREE.Vector3(),
    );
    const center = initialBounds.getCenter(
      new THREE.Vector3(),
    );
    const offset = new THREE.Vector3(
      -center.x,
      -initialBounds.min.y,
      -center.z,
    );

    clone.position.add(offset);
    clone.updateMatrixWorld(true);

    const centeredBounds =
      new THREE.Box3().setFromObject(clone);
    const sourceSize: Vec3 = [
      Math.max(0.001, size.x),
      Math.max(0.001, size.y),
      Math.max(0.001, size.z),
    ];
    const persisted =
      binding.geometry_profile?.support_surfaces
        ?.filter(
          (surface) =>
            surface.source !== "legacy_ratio",
        )
        .map((surface) =>
          localSurfaceFromRecord(
            surface,
            sourceSize,
          ),
        ) ?? [];
    const detected = detectSupportSurfaces(
      clone,
      centeredBounds,
    );

    return {
      object: clone,
      sourceSize,
      bottomCenterOffset: [
        offset.x,
        offset.y,
        offset.z,
      ] as Vec3,
      localSupportSurfaces:
        persisted.length > 0
          ? persisted
          : detected,
    };
  }, [
    binding.geometry_profile,
    gltf.scene,
  ]);

  const basePosition =
    positionOverride ?? binding.position;
  const baseRotation: Vec3 = [
    (rotationOverride?.[0] ?? binding.rotation[0]) +
      binding.default_rotation[0],
    (rotationOverride?.[1] ?? binding.rotation[1]) +
      binding.default_rotation[1],
    (rotationOverride?.[2] ?? binding.rotation[2]) +
      binding.default_rotation[2],
  ];
  const baseScale = fittedResolvedAssetScale(
    binding,
    prepared.sourceSize,
    targetExtentOverride,
  );
  const worldSize: Vec3 = [
    prepared.sourceSize[0] * baseScale[0],
    prepared.sourceSize[1] * baseScale[1],
    prepared.sourceSize[2] * baseScale[2],
  ];
  const rotationQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          baseRotation[0],
          baseRotation[1],
          baseRotation[2],
          "XYZ",
        ),
      ),
    [
      baseRotation[0],
      baseRotation[1],
      baseRotation[2],
    ],
  );
  const worldSupportSurfaces =
    useMemo(
      () =>
        prepared.localSupportSurfaces.map(
          (
            surface,
          ): ResolvedAssetRuntimeSupportSurface => {
            const scaledCenter =
              surface.center.clone().multiply(
                new THREE.Vector3(
                  baseScale[0],
                  baseScale[1],
                  baseScale[2],
                ),
              );
            scaledCenter.applyQuaternion(
              rotationQuaternion,
            );

            const scaledU = surface.uAxis
              .clone()
              .multiply(
                new THREE.Vector3(
                  baseScale[0],
                  baseScale[1],
                  baseScale[2],
                ),
              );
            const scaledV = surface.vAxis
              .clone()
              .multiply(
                new THREE.Vector3(
                  baseScale[0],
                  baseScale[1],
                  baseScale[2],
                ),
              );
            const uFactor = Math.max(
              0.001,
              scaledU.length(),
            );
            const vFactor = Math.max(
              0.001,
              scaledV.length(),
            );
            scaledU
              .normalize()
              .applyQuaternion(rotationQuaternion);
            scaledV
              .normalize()
              .applyQuaternion(rotationQuaternion);
            const normal = surface.normal
              .clone()
              .applyQuaternion(rotationQuaternion)
              .normalize();

            return {
              id: surface.id,
              center_offset: asVec3(scaledCenter),
              normal: asVec3(normal),
              u_axis: asVec3(scaledU),
              v_axis: asVec3(scaledV),
              size: [
                surface.size[0] * uFactor,
                surface.size[1] * vFactor,
              ],
              area:
                surface.area *
                uFactor *
                vFactor,
              confidence: surface.confidence,
              height_ratio:
                surface.heightRatio,
              size_ratio:
                surface.sizeRatio,
            };
          },
        ),
      [
        baseScale,
        prepared.localSupportSurfaces,
        rotationQuaternion,
      ],
    );

  useEffect(() => {
    onMetrics?.({
      instance_id: binding.instance_id,
      source_size: prepared.sourceSize,
      world_size: worldSize,
      bottom_center_offset:
        prepared.bottomCenterOffset,
      support_surfaces:
        worldSupportSurfaces,
    });
  }, [
    binding.instance_id,
    onMetrics,
    prepared.bottomCenterOffset,
    prepared.sourceSize,
    worldSize,
    worldSupportSurfaces,
  ]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const motion = binding.motion;
    const type =
      typeof motion?.type === "string"
        ? motion.type
        : "";
    const time =
      clock.elapsedTime *
        motionNumber(motion, "speed", 1) +
      motionNumber(motion, "phase", 0);
    const amplitude = motionNumber(
      motion,
      "amplitude",
      0.25,
    );

    group.position.set(
      basePosition[0],
      basePosition[1] +
        binding.ground_offset_m * baseScale[1],
      basePosition[2],
    );
    group.rotation.set(...baseRotation);
    group.scale.set(...baseScale);

    if (type === "oscillateY" || type === "driftY") {
      group.position.y += Math.sin(time) * amplitude;
    } else if (type === "rotateX") {
      group.rotation.x += time;
    } else if (type === "rotateY") {
      group.rotation.y += time;
    } else if (type === "rotateZ") {
      group.rotation.z += time;
    } else if (
      type === "swingX" ||
      type === "swingY" ||
      type === "swingZ"
    ) {
      const minAngle = motionNumber(
        motion,
        "minAngle",
        -0.35,
      );
      const maxAngle = motionNumber(
        motion,
        "maxAngle",
        0.35,
      );
      const angle =
        minAngle +
        ((Math.sin(time) + 1) / 2) *
          (maxAngle - minAngle);
      if (type === "swingX") group.rotation.x += angle;
      if (type === "swingY") group.rotation.y += angle;
      if (type === "swingZ") group.rotation.z += angle;
    } else if (type === "orbitAround") {
      const center = motionVec3(
        motion?.center,
        basePosition,
      );
      const radius = motionNumber(
        motion,
        "radius",
        1,
      );
      group.position.x =
        center[0] + Math.cos(time) * radius;
      group.position.z =
        center[2] + Math.sin(time) * radius;
    } else if (type === "pulse") {
      const pulse = 1 + Math.sin(time) * 0.08;
      group.scale.multiplyScalar(
        active ? pulse * 1.015 : pulse,
      );
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <primitive object={prepared.object} />
    </group>
  );
}

export function preloadResolvedAsset(
  publicPath: string,
) {
  useGLTF.preload(publicPath);
}
