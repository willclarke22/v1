"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { LearningSpaceTopic } from "@/types/learning-space";
import {
  TOPIC_WEATHER_SUNBREAK_RENDER_ORDER,
  TOPIC_WEATHER_SUNBREAK_SCALE,
  TOPIC_WEATHER_SURFACE_RENDER_ORDER,
  TOPIC_WEATHER_SURFACE_SCALE,
} from "../constants";
import {
  createLearningWeatherTexture,
  type WeatherMaskImages,
} from "./weather-textures";

/**
 * The sunbreak system is procedural in weather-textures.ts now.
 * This loader should only bring in cloud source assets. Do not load
 * /learning-space/weather/sunbreak-mask.png here, because old generated
 * sun assets can contaminate the procedural sun look.
 */
const WEATHER_MASK_URLS: string[] = [
  "/learning-space/weather/cloud-mask-soft.png",
  "/learning-space/weather/cloud-mask-wispy.png",
  "/learning-space/weather/cloud-mask-dense.png",
];

type AnimatedWeather = {
  cloudDensity: number;
  turbulence: number;
  sunlight: number;
  breakthrough: number;
  clarity: number;
  stability: number;
  visible: number;
};

/**
 * Hybrid v3 sunlight tuning.
 *
 * Diagnostic mode proved the layer works. This keeps the sunbreak readable
 * while avoiding the large center wash and the heavy outer golden rim.
 */
const SUNBREAK_HYBRID_MODE = true;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

function seededUnit(value: string) {
  return (hashString(value) % 10000) / 10000;
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
  const sunGlowMeshRef = useRef<THREE.Mesh | null>(null);
  const sunbreakMeshRef = useRef<THREE.Mesh | null>(null);

  /**
   * This keeps the renderer from visually snapping when learning_weather changes.
   * The texture is still regenerated at state-change boundaries, but the visible
   * layer strengths ease toward the new state over frames.
   */
  const animatedWeatherRef = useRef<AnimatedWeather | null>(null);

  /**
   * Stable, topic-specific sun orientation. The procedural sun texture is UV
   * based; this puts the sun layer in a more likely front/side visible zone
   * instead of allowing the warm area to hide on the far side for long periods.
   */
  const sunYawOffset = useMemo(() => {
    return SUNBREAK_HYBRID_MODE
      ? -0.02
      : lerp(-0.72, 0.72, seededUnit(`${topic.topic_id}:sun-yaw:v2`));
  }, [topic.topic_id]);

  const sunPitchOffset = useMemo(() => {
    return SUNBREAK_HYBRID_MODE
      ? -0.035
      : lerp(-0.16, 0.14, seededUnit(`${topic.topic_id}:sun-pitch:v2`));
  }, [topic.topic_id]);

  /**
   * R3F's useLoader overload can infer a single Texture when the URL list is
   * a readonly tuple. Keep the URL list mutable/string[] and cast the result to
   * the array shape we actually request, so production type-checking stays
   * stable under Next/Turbopack.
   */
  const weatherMaskTextures = useLoader(
    THREE.TextureLoader,
    WEATHER_MASK_URLS,
  ) as unknown as THREE.Texture[];

  const [cloudSoftTexture, cloudWispyTexture, cloudDenseTexture] =
    weatherMaskTextures;

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

  const rawStormPressure = cloudDensity * 0.38 + turbulence * 0.62;
  const rawSunSignal = clamp01(
    sunlight * 0.42 +
      breakthrough * 0.74 +
      clarity * 0.18 -
      rawStormPressure * 0.08,
  );

  const focusBoost = isFocused ? 1.05 : isSelected ? 1.025 : 1;

  const weatherKey = `${cloudDensity.toFixed(3)}:${turbulence.toFixed(3)}:${sunlight.toFixed(3)}:${breakthrough.toFixed(3)}:${clarity.toFixed(3)}:${stability.toFixed(3)}`;

  const weatherMasks = useMemo<WeatherMaskImages>(
    () => ({
      cloudSoft: cloudSoftTexture?.image as CanvasImageSource | null,
      cloudWispy: cloudWispyTexture?.image as CanvasImageSource | null,
      cloudDense: cloudDenseTexture?.image as CanvasImageSource | null,
    }),
    [cloudSoftTexture, cloudWispyTexture, cloudDenseTexture],
  );

  const weatherSurfaceTexture = useMemo(
    () =>
      createLearningWeatherTexture({
        topicId: topic.topic_id,
        weather,
        kind: "surface",
        masks: weatherMasks,
      }),
    [topic.topic_id, weatherKey, weather, weatherMasks],
  );

  const sunbreakTexture = useMemo(
    () =>
      createLearningWeatherTexture({
        topicId: topic.topic_id,
        weather,
        kind: "sunbreak",
        masks: weatherMasks,
      }),
    [topic.topic_id, weatherKey, weather, weatherMasks],
  );

  useEffect(() => {
    return () => {
      weatherSurfaceTexture.dispose();
    };
  }, [weatherSurfaceTexture]);

  useEffect(() => {
    return () => {
      sunbreakTexture.dispose();
    };
  }, [sunbreakTexture]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    if (!animatedWeatherRef.current) {
      animatedWeatherRef.current = {
        cloudDensity,
        turbulence,
        sunlight,
        breakthrough,
        clarity,
        stability,
        visible: isVisible ? 1 : 0,
      };
    }

    const animated = animatedWeatherRef.current;

    animated.cloudDensity = damp(animated.cloudDensity, cloudDensity, 2.2, delta);
    animated.turbulence = damp(animated.turbulence, turbulence, 2.1, delta);
    animated.sunlight = damp(animated.sunlight, sunlight, 2.8, delta);
    animated.breakthrough = damp(animated.breakthrough, breakthrough, 3.2, delta);
    animated.clarity = damp(animated.clarity, clarity, 2.4, delta);
    animated.stability = damp(animated.stability, stability, 2.0, delta);
    animated.visible = damp(animated.visible, isVisible ? 1 : 0, 8.0, delta);

    const aCloudDensity = animated.cloudDensity;
    const aTurbulence = animated.turbulence;
    const aSunlight = animated.sunlight;
    const aBreakthrough = animated.breakthrough;
    const aClarity = animated.clarity;
    const aStability = animated.stability;

    const stormPressure = aCloudDensity * 0.38 + aTurbulence * 0.62;
    const sunSignal = clamp01(
      aSunlight * 0.42 +
        aBreakthrough * 0.74 +
        aClarity * 0.18 -
        stormPressure * 0.08,
    );

    const calm = aStability;
    const instability = 1 - calm;
    const targetVisibility = animated.visible;

    if (surfaceMeshRef.current) {
      /**
       * Keep the cloud surface in the Sphere-style display-skin family. The
       * key change here is that strong breakthrough now thins the cloud layer
       * slightly, so the procedural sun has room to show through.
       */
      const drift = 0.0011 + aTurbulence * 0.0042 + instability * 0.0011;
      surfaceMeshRef.current.rotation.y += delta * drift;
      surfaceMeshRef.current.rotation.x =
        Math.sin(time * 0.038) * aTurbulence * 0.0045;
      surfaceMeshRef.current.rotation.z =
        Math.sin(time * 0.026) * instability * 0.0025;

      const material = surfaceMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const shapedCloudThin = SUNBREAK_HYBRID_MODE ? 0.02 : 0;

        const cloudBody =
          0.61 +
          aCloudDensity * 0.17 +
          aClarity * 0.038 +
          stormPressure * 0.075 -
          shapedCloudThin;

        /**
         * When sunlight_breakthrough is high, lower the top cloud layer just
         * enough that the additive sun layers can be visible. This is the
         * diagnostic/visibility correction missing in the previous screenshot.
         */
        const breakthroughThinning =
          aBreakthrough *
          (SUNBREAK_HYBRID_MODE
            ? 0.085 + aSunlight * 0.05 + aClarity * 0.03
            : 0.045 + aSunlight * 0.035 + aClarity * 0.02);

        const targetOpacity =
          targetVisibility *
          focusBoost *
          clamp(
            cloudBody - breakthroughThinning,
            SUNBREAK_HYBRID_MODE ? 0.42 : 0.48,
            SUNBREAK_HYBRID_MODE ? 0.81 : 0.88,
          );

        material.opacity = damp(material.opacity, targetOpacity, 7.5, delta);
      }
    }

    if (sunGlowMeshRef.current) {
      /**
       * Broad atmospheric glow. This should now be visible with the breakthrough
       * test preset, but still soft enough not to look like a sticker.
       *
       * Use absolute-ish orientation instead of accumulating unbounded rotation,
       * so the glow stays near a visible front-facing zone.
       */
      sunGlowMeshRef.current.rotation.y =
        sunYawOffset +
        Math.sin(time * (0.035 + aTurbulence * 0.018)) *
          (0.028 + aBreakthrough * 0.026);
      sunGlowMeshRef.current.rotation.x =
        sunPitchOffset + Math.sin(time * 0.03) * aSunlight * 0.004;
      sunGlowMeshRef.current.rotation.z =
        Math.sin(time * 0.045) * aBreakthrough * 0.006;

      const material = sunGlowMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const pulse = 0.96 + Math.sin(time * (0.15 + sunSignal * 0.2)) * 0.04;

        const glowOpacity = SUNBREAK_HYBRID_MODE
          ? 0.06 +
            aSunlight * 0.13 +
            aBreakthrough * 0.31 +
            aClarity * 0.05 -
            stormPressure * 0.022
          : 0.025 +
            aSunlight * 0.11 +
            aBreakthrough * 0.32 +
            aClarity * 0.045 -
            stormPressure * 0.025;

        const targetOpacity =
          targetVisibility *
          focusBoost *
          pulse *
          clamp(glowOpacity, 0, SUNBREAK_HYBRID_MODE ? 0.56 : 0.52);

        material.opacity = damp(material.opacity, targetOpacity, 6.4, delta);
      }
    }

    if (sunbreakMeshRef.current) {
      /**
       * Sharper breakthrough/ray layer. This has been boosted for diagnostic
       * visibility: with high sunlight_breakthrough, there should now be a warm
       * opening or faint ray structure on the sphere.
       */
      sunbreakMeshRef.current.rotation.y =
        sunYawOffset +
        Math.sin(time * (0.055 + aBreakthrough * 0.035)) *
          (0.035 + aBreakthrough * 0.04) -
        aBreakthrough * 0.025;
      sunbreakMeshRef.current.rotation.x =
        sunPitchOffset +
        Math.sin(time * 0.041) * aSunlight * 0.005 +
        aBreakthrough * 0.015;
      sunbreakMeshRef.current.rotation.z =
        Math.sin(time * 0.064) * aBreakthrough * 0.012;

      const material = sunbreakMeshRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const pulse =
          0.955 + Math.sin(time * (0.22 + aBreakthrough * 0.35)) * 0.045;

        const rayOpacity = SUNBREAK_HYBRID_MODE
          ? 0.09 +
            aSunlight * 0.11 +
            aBreakthrough * 0.58 +
            aClarity * 0.05 -
            stormPressure * 0.024
          : 0.018 +
            aSunlight * 0.07 +
            aBreakthrough * 0.54 +
            aClarity * 0.035 -
            stormPressure * 0.035;

        const targetOpacity =
          targetVisibility *
          focusBoost *
          pulse *
          clamp(rayOpacity, 0, SUNBREAK_HYBRID_MODE ? 0.72 : 0.68);

        material.opacity = damp(material.opacity, targetOpacity, 7.0, delta);
      }
    }
  });

  const shapedScaleBoost = SUNBREAK_HYBRID_MODE ? 1.004 : 1;

  const sunGlowScale =
    visualRadius *
    TOPIC_WEATHER_SUNBREAK_SCALE *
    lerp(1.004, 1.024, rawSunSignal) *
    shapedScaleBoost;
  const sunbreakScale =
    visualRadius *
    TOPIC_WEATHER_SUNBREAK_SCALE *
    lerp(1.004, 1.02, breakthrough) *
    shapedScaleBoost;

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
        ref={sunGlowMeshRef}
        renderOrder={TOPIC_WEATHER_SUNBREAK_RENDER_ORDER - 1}
        scale={sunGlowScale}
        raycast={() => null}
      >
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial
          map={sunbreakTexture}
          color={SUNBREAK_HYBRID_MODE ? "#ffd48a" : "#ffd78b"}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-5}
          polygonOffsetUnits={-15}
        />
      </mesh>

      <mesh
        ref={sunbreakMeshRef}
        renderOrder={TOPIC_WEATHER_SUNBREAK_RENDER_ORDER}
        scale={sunbreakScale}
        raycast={() => null}
      >
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial
          map={sunbreakTexture}
          color={SUNBREAK_HYBRID_MODE ? "#fff0b0" : "#fff0ba"}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-6}
          polygonOffsetUnits={-18}
        />
      </mesh>
    </group>
  );
}
