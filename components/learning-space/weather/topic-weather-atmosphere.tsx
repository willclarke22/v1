"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  TOPIC_WEATHER_SURFACE_RENDER_ORDER,
  TOPIC_WEATHER_SURFACE_SCALE,
} from "../constants";

/**
 * EQUIRECTANGULAR TEXTURE SURFACE TEST
 *
 * Purpose:
 * - Test true equirectangular 8k still images on the topic spheres.
 * - Remove video decoding, procedural cloud masks, and procedural sun/ray layers.
 * - Judge whether high-resolution equirectangular maps wrap cleanly onto spheres.
 *
 * Put the downloaded images here:
 *
 * public/learning-space/weather/equirectangular-test/8k_mars.jpg
 * public/learning-space/weather/equirectangular-test/8k_earth_clouds.jpg
 * public/learning-space/weather/equirectangular-test/8k_jupiter.jpg
 *
 * These are still images, not videos. They should map much more correctly than
 * normal 16:9 clips because they are designed for sphere/equirectangular use.
 */
const EQUIRECTANGULAR_TEXTURE_URLS = [
  "/learning-space/weather/equirectangular-test/8k_mars.jpg?v=equirect-test-2",
  "/learning-space/weather/equirectangular-test/8k_earth_clouds.jpg?v=equirect-test-2",
  "/learning-space/weather/equirectangular-test/8k_jupiter.jpg?v=equirect-test-2",
] as const;

type TextureTestMode =
  | "all_mars"
  | "all_clouds"
  | "all_jupiter"
  | "by_topic";

/**
 * Choose how to apply the test textures:
 *
 * "all_mars"    -> every sphere uses the Mars surface map.
 * "all_clouds"  -> every sphere uses the Earth cloud map.
 * "all_jupiter" -> every sphere uses the Jupiter surface map.
 * "by_topic"    -> topics rotate deterministically between all three textures.
 */
const TEXTURE_TEST_MODE: TextureTestMode = "by_topic";

/**
 * Keep this false to judge the texture mapping itself.
 * Set true only if you want a slow globe-like drift.
 */
const ENABLE_SURFACE_DRIFT = false;

type AnimatedSurface = {
  visibility: number;
  driftSpeed: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function damp(current: number, target: number, smoothing: number, delta: number) {
  return THREE.MathUtils.damp(current, target, smoothing, delta);
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function chooseTextureUrlForTopic(topicId: string) {
  if (TEXTURE_TEST_MODE === "all_mars") {
    return EQUIRECTANGULAR_TEXTURE_URLS[0];
  }

  if (TEXTURE_TEST_MODE === "all_clouds") {
    return EQUIRECTANGULAR_TEXTURE_URLS[1];
  }

  if (TEXTURE_TEST_MODE === "all_jupiter") {
    return EQUIRECTANGULAR_TEXTURE_URLS[2];
  }

  const index =
    hashString(topicId || "topic") % EQUIRECTANGULAR_TEXTURE_URLS.length;
  return EQUIRECTANGULAR_TEXTURE_URLS[index];
}

function configureEquirectangularTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  /**
   * Mipmaps help reduce shimmer when zoomed out. They cost memory, but this is
   * only a resolution/mapping test. If performance becomes poor, change
   * generateMipmaps to false and minFilter to THREE.LinearFilter.
   */
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  return texture;
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
  const animatedSurfaceRef = useRef<AnimatedSurface | null>(null);

  const selectedTextureUrl = useMemo(() => {
    return chooseTextureUrlForTopic(topic.topic_id);
  }, [topic.topic_id]);

  const surfaceTexture = useLoader(THREE.TextureLoader, selectedTextureUrl);

  useEffect(() => {
    configureEquirectangularTexture(surfaceTexture);

    /**
     * Do not dispose this texture here. useLoader caches textures by URL, and
     * multiple spheres may share the same loaded texture. Disposing in one
     * sphere could break the others.
     */
  }, [surfaceTexture]);

  const weather = topic.learning_weather ?? {
    cloud_density: 0.3,
    storm_turbulence: 0.24,
    sunlight_intensity: 0.5,
    sunlight_breakthrough: 0.15,
    sky_clarity: 0.35,
    atmosphere_stability: 0.5,
  };

  const cloudDensity = clamp01(weather.cloud_density);
  const turbulence = clamp01(weather.storm_turbulence);
  const sunlight = clamp01(weather.sunlight_intensity);
  const breakthrough = clamp01(weather.sunlight_breakthrough);
  const clarity = clamp01(weather.sky_clarity);
  const stability = clamp01(weather.atmosphere_stability);

  /**
   * Keep learning_weather lightly involved without hiding the texture:
   * this is just opacity variation for the test, not final weather logic.
   */
  const surfaceOpacityTarget = clamp(
    0.76 +
      clarity * 0.05 +
      sunlight * 0.04 +
      breakthrough * 0.025 +
      cloudDensity * 0.025 -
      turbulence * 0.02,
    0.68,
    0.94,
  );

  const focusBoost = isFocused ? 1.045 : isSelected ? 1.02 : 1;

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    if (!animatedSurfaceRef.current) {
      animatedSurfaceRef.current = {
        visibility: isVisible ? 1 : 0,
        driftSpeed: 0.0012,
      };
    }

    const animated = animatedSurfaceRef.current;
    animated.visibility = damp(animated.visibility, isVisible ? 1 : 0, 8, delta);

    const targetDriftSpeed = ENABLE_SURFACE_DRIFT
      ? 0.0006 +
        turbulence * 0.0018 +
        (1 - stability) * 0.0007 +
        breakthrough * 0.0004
      : 0;

    animated.driftSpeed = damp(
      animated.driftSpeed,
      targetDriftSpeed,
      2.4,
      delta,
    );

    if (surfaceMeshRef.current) {
      if (ENABLE_SURFACE_DRIFT) {
        surfaceMeshRef.current.rotation.y += delta * animated.driftSpeed;
        surfaceMeshRef.current.rotation.x =
          Math.sin(time * 0.035) * turbulence * 0.0025;
        surfaceMeshRef.current.rotation.z =
          Math.sin(time * 0.026) * (1 - stability) * 0.0018;
      } else {
        surfaceMeshRef.current.rotation.set(0, 0, 0);
      }

      const material = surfaceMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const targetOpacity =
          animated.visibility * focusBoost * surfaceOpacityTarget;

        material.opacity = damp(material.opacity, targetOpacity, 7.5, delta);
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
          map={surfaceTexture}
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
    </group>
  );
}
