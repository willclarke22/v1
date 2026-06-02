"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  TOPIC_WEATHER_SUNBREAK_RENDER_ORDER,
  TOPIC_WEATHER_SUNBREAK_SCALE,
  TOPIC_WEATHER_SURFACE_RENDER_ORDER,
  TOPIC_WEATHER_SURFACE_SCALE,
} from "../constants";
import { createLearningWeatherTexture } from "./weather-textures";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function TopicWeatherAtmosphere({
  topic,
  visualRadius,
  isFocused,
  isSelected,
  isVisible = true,
}: {
  topic: LearningSpaceTopic;
  visualRadius: number;
  isFocused: boolean;
  isSelected: boolean;
  isVisible?: boolean;
}) {
  const surfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const sunbreakMeshRef = useRef<THREE.Mesh | null>(null);

  const weather = topic.learning_weather ?? {
    cloud_density: 0.3,
    storm_turbulence: 0.24,
    sunlight_intensity: 0.5,
    sunlight_breakthrough: 0.15,
    sky_clarity: 0.35,
    atmosphere_stability: 0.5,
  };

  const cloudDensity = clamp(weather.cloud_density, 0, 1);
  const turbulence = clamp(weather.storm_turbulence, 0, 1);
  const sunlight = clamp(weather.sunlight_intensity, 0, 1);
  const breakthrough = clamp(weather.sunlight_breakthrough, 0, 1);
  const clarity = clamp(weather.sky_clarity, 0, 1);
  const stability = clamp(weather.atmosphere_stability, 0, 1);

  const weatherSurfaceTexture = useMemo(
    () =>
      createLearningWeatherTexture({
        topicId: topic.topic_id,
        weather,
        kind: "surface",
      }),
    [topic.topic_id, weather],
  );

  const sunbreakTexture = useMemo(
    () =>
      createLearningWeatherTexture({
        topicId: topic.topic_id,
        weather,
        kind: "sunbreak",
      }),
    [topic.topic_id, weather],
  );

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const focusBoost = isFocused ? 1.04 : isSelected ? 1.02 : 1;
    const targetVisibility = isVisible ? 1 : 0;

    if (surfaceMeshRef.current) {
      /**
       * Keep the surface almost still. Sharp weather reads better when it is
       * not constantly sliding under the learner's eye.
       */
      surfaceMeshRef.current.rotation.y += delta * (0.003 + turbulence * 0.006);
      surfaceMeshRef.current.rotation.x =
        Math.sin(time * 0.045) * turbulence * 0.006;

      const material = surfaceMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity =
          targetVisibility *
          focusBoost *
          clamp(0.94 + cloudDensity * 0.04 + clarity * 0.03, 0, 1);
      }
    }

    if (sunbreakMeshRef.current) {
      sunbreakMeshRef.current.rotation.y -=
        delta * (0.002 + breakthrough * 0.007);
      sunbreakMeshRef.current.rotation.z =
        Math.sin(time * 0.08) * breakthrough * 0.008;

      const material = sunbreakMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const pulse =
          0.97 + Math.sin(time * (0.28 + breakthrough * 0.32)) * 0.03;
        material.opacity =
          targetVisibility *
          focusBoost *
          pulse *
          clamp(
            0.055 + sunlight * 0.07 + breakthrough * 0.38 + stability * 0.025,
            0,
            0.5,
          );
      }
    }
  });

  return (
    <group>
      <mesh
        ref={surfaceMeshRef}
        renderOrder={TOPIC_WEATHER_SURFACE_RENDER_ORDER}
        scale={visualRadius * TOPIC_WEATHER_SURFACE_SCALE}
        raycast={() => null}
      >
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial
          map={weatherSurfaceTexture}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
          blending={THREE.NormalBlending}
          side={THREE.FrontSide}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-12}
        />
      </mesh>

      <mesh
        ref={sunbreakMeshRef}
        renderOrder={TOPIC_WEATHER_SUNBREAK_RENDER_ORDER}
        scale={visualRadius * TOPIC_WEATHER_SUNBREAK_SCALE}
        raycast={() => null}
      >
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial
          map={sunbreakTexture}
          color="#fff4bd"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-5}
          polygonOffsetUnits={-16}
        />
      </mesh>
    </group>
  );
}
