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
 * EQUIRECTANGULAR TEXTURE SURFACE GALLERY TEST
 *
 * Purpose:
 * - Show every available equirectangular planet/cloud texture in the Learning Space.
 * - Keep this simple: one texture per sphere, no blending, no overlays, no video.
 * - Use this to judge which textures look good on MyWay topic spheres.
 *
 * Put the downloaded images here:
 *
 * public/learning-space/weather/equirectangular-test/2k_neptune.jpg
 * public/learning-space/weather/equirectangular-test/4k_ceres_fictional.jpg
 * public/learning-space/weather/equirectangular-test/4k_eris_fictional.jpg
 * public/learning-space/weather/equirectangular-test/4k_makemake_fictional.jpg
 * public/learning-space/weather/equirectangular-test/8k_earth_clouds.jpg
 * public/learning-space/weather/equirectangular-test/8k_jupiter.jpg
 * public/learning-space/weather/equirectangular-test/8k_mars.jpg
 * public/learning-space/weather/equirectangular-test/8k_mercury.jpg
 * public/learning-space/weather/equirectangular-test/8k_saturn.jpg
 * public/learning-space/weather/equirectangular-test/8k_sun.jpg
 *
 * These are still images, not videos. They should map cleanly because they are
 * equirectangular / sphere-ready textures.
 */

const TEXTURE_BASE_PATH = "/learning-space/weather/equirectangular-test";

const EQUIRECTANGULAR_TEXTURE_URLS = {
  neptune: `${TEXTURE_BASE_PATH}/2k_neptune.jpg?v=equirect-gallery-v1`,
  ceres: `${TEXTURE_BASE_PATH}/4k_ceres_fictional.jpg?v=equirect-gallery-v1`,
  eris: `${TEXTURE_BASE_PATH}/4k_eris_fictional.jpg?v=equirect-gallery-v1`,
  makemake: `${TEXTURE_BASE_PATH}/4k_makemake_fictional.jpg?v=equirect-gallery-v1`,
  earthClouds: `${TEXTURE_BASE_PATH}/8k_earth_clouds.jpg?v=equirect-gallery-v1`,
  jupiter: `${TEXTURE_BASE_PATH}/8k_jupiter.jpg?v=equirect-gallery-v1`,
  mars: `${TEXTURE_BASE_PATH}/8k_mars.jpg?v=equirect-gallery-v1`,
  mercury: `${TEXTURE_BASE_PATH}/8k_mercury.jpg?v=equirect-gallery-v1`,
  saturn: `${TEXTURE_BASE_PATH}/8k_saturn.jpg?v=equirect-gallery-v1`,
  sun: `${TEXTURE_BASE_PATH}/8k_sun.jpg?v=equirect-gallery-v1`,
} as const;

const TEXTURE_ENTRIES = [
  { key: "neptune", url: EQUIRECTANGULAR_TEXTURE_URLS.neptune },
  { key: "ceres", url: EQUIRECTANGULAR_TEXTURE_URLS.ceres },
  { key: "eris", url: EQUIRECTANGULAR_TEXTURE_URLS.eris },
  { key: "makemake", url: EQUIRECTANGULAR_TEXTURE_URLS.makemake },
  { key: "earth_clouds", url: EQUIRECTANGULAR_TEXTURE_URLS.earthClouds },
  { key: "jupiter", url: EQUIRECTANGULAR_TEXTURE_URLS.jupiter },
  { key: "mars", url: EQUIRECTANGULAR_TEXTURE_URLS.mars },
  { key: "mercury", url: EQUIRECTANGULAR_TEXTURE_URLS.mercury },
  { key: "saturn", url: EQUIRECTANGULAR_TEXTURE_URLS.saturn },
  { key: "sun", url: EQUIRECTANGULAR_TEXTURE_URLS.sun },
] as const;

const TEXTURE_URL_LIST = TEXTURE_ENTRIES.map((entry) => entry.url);

type TextureGalleryMode =
  | "by_topic"
  | "all_neptune"
  | "all_ceres"
  | "all_eris"
  | "all_makemake"
  | "all_earth_clouds"
  | "all_jupiter"
  | "all_mars"
  | "all_mercury"
  | "all_saturn"
  | "all_sun";

/**
 * "by_topic" rotates deterministically through all textures by topic_id.
 * Change this to one of the all_* values if you want every sphere to show
 * the same texture for close inspection.
 */
const TEXTURE_GALLERY_MODE: TextureGalleryMode = "by_topic";

/**
 * Keep this false to judge pure wrapping/resolution.
 * Set true if you want a very slow globe-like drift.
 */
const ENABLE_SURFACE_DRIFT = false;

/**
 * 128 looks nicer. Try 96 if many topics make the scene heavy.
 */
const SPHERE_SEGMENTS = 128;

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

function textureIndexFromMode(mode: TextureGalleryMode, topicId: string) {
  if (mode === "all_neptune") return 0;
  if (mode === "all_ceres") return 1;
  if (mode === "all_eris") return 2;
  if (mode === "all_makemake") return 3;
  if (mode === "all_earth_clouds") return 4;
  if (mode === "all_jupiter") return 5;
  if (mode === "all_mars") return 6;
  if (mode === "all_mercury") return 7;
  if (mode === "all_saturn") return 8;
  if (mode === "all_sun") return 9;

  return hashString(topicId || "topic") % TEXTURE_ENTRIES.length;
}

function configureEquirectangularTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  /**
   * Mipmaps help reduce shimmer when zoomed out. They cost memory, but this is
   * only a texture gallery test. If performance becomes poor, change
   * generateMipmaps to false and minFilter to THREE.LinearFilter.
   */
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
}

function configureAllTextures(textures: THREE.Texture[]) {
  for (const texture of textures) {
    configureEquirectangularTexture(texture);
  }
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

  const loadedTextures = useLoader(
    THREE.TextureLoader,
    TEXTURE_URL_LIST as unknown as string[],
  ) as unknown as THREE.Texture[];

  useEffect(() => {
    configureAllTextures(loadedTextures);

    /**
     * Do not dispose these textures here. useLoader caches textures by URL, and
     * every topic sphere may share them. Disposing in one sphere could break
     * the others.
     */
  }, [loadedTextures]);

  const selectedTextureIndex = useMemo(() => {
    return textureIndexFromMode(TEXTURE_GALLERY_MODE, topic.topic_id);
  }, [topic.topic_id]);

  const surfaceTexture =
    loadedTextures[selectedTextureIndex] ?? loadedTextures[0];

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
    0.78 +
      clarity * 0.045 +
      sunlight * 0.035 +
      breakthrough * 0.02 +
      cloudDensity * 0.02 -
      turbulence * 0.018,
    0.68,
    0.96,
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
      ? 0.00055 +
        turbulence * 0.0016 +
        (1 - stability) * 0.00065 +
        breakthrough * 0.00035
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
        <sphereGeometry args={[1, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
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
