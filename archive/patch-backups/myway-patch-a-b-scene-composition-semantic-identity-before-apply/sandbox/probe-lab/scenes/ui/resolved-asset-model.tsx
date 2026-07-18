"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { ResolvedSceneAssetBinding } from "../resolved-scene";

type Vec3 = [number, number, number];

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

function fittedScale(
  binding: ResolvedSceneAssetBinding,
  targetExtentOverride?: number,
) {
  const dimensions = binding.dimensions_m.map((value) =>
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
}: {
  binding: ResolvedSceneAssetBinding;
  active?: boolean;
  positionOverride?: Vec3;
  rotationOverride?: Vec3;
  targetExtentOverride?: number;
  onClick?: () => void;
}) {
  const gltf = useGLTF(binding.public_path);
  const groupRef = useRef<THREE.Group>(null);
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [gltf.scene]);

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
  const baseScale = fittedScale(
    binding,
    targetExtentOverride,
  );

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
        active ? pulse * 1.03 : pulse,
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
      <primitive object={object} />
      {active ? (
        <mesh scale={1.08}>
          <sphereGeometry args={[0.56, 18, 12]} />
          <meshBasicMaterial
            color="#67e8f9"
            transparent
            opacity={0.12}
            wireframe
          />
        </mesh>
      ) : null}
    </group>
  );
}

export function preloadResolvedAsset(
  publicPath: string,
) {
  useGLTF.preload(publicPath);
}
