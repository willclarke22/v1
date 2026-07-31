"use client";

import {
  Html,
  OrbitControls,
} from "@react-three/drei";
import {
  Canvas,
  useThree,
} from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as THREE from "three";

import {
  acquireRuntimeScene,
} from "../browser-scene-runtime";
import {
  fallbackRigLights,
  type RuntimeFallbackLight,
} from "../environment-runtime-policy";
import type {
  RuntimeSceneBindingV1,
  RuntimeSceneState,
} from "../scene-runtime-contract";

function FallbackLight({
  light,
  shadowMapSize,
  shadowBias,
  shadowNormalBias,
}: {
  light: RuntimeFallbackLight;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
}) {
  if (light.kind === "ambient") {
    return (
      <ambientLight
        color={light.color}
        intensity={light.intensity}
      />
    );
  }

  if (light.kind === "hemisphere") {
    return (
      <hemisphereLight
        color={light.color}
        groundColor={
          light.ground_color ?? "#334155"
        }
        intensity={light.intensity}
      />
    );
  }

  if (light.kind === "spot") {
    return (
      <spotLight
        color={light.color}
        intensity={light.intensity}
        position={light.position ?? [4, 7, 4]}
        angle={0.65}
        penumbra={0.8}
        decay={2}
        distance={28}
        castShadow={light.cast_shadow}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={shadowBias}
        shadow-normalBias={shadowNormalBias}
      />
    );
  }

  return (
    <directionalLight
      color={light.color}
      intensity={light.intensity}
      position={light.position ?? [4, 7, 5]}
      castShadow={light.cast_shadow}
      shadow-mapSize-width={shadowMapSize}
      shadow-mapSize-height={shadowMapSize}
      shadow-bias={shadowBias}
      shadow-normalBias={shadowNormalBias}
    />
  );
}

function SceneController({
  binding,
  verifyHash,
  simulateFailureEntityId,
  onState,
  onFallbackActive,
}: {
  binding: RuntimeSceneBindingV1;
  verifyHash: boolean;
  simulateFailureEntityId: string | null;
  onState: (state: RuntimeSceneState) => void;
  onFallbackActive: (active: boolean) => void;
}) {
  const { gl, scene } = useThree();
  const [group, setGroup] =
    useState<THREE.Group | null>(null);

  useEffect(() => {
    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    const previousOutput = gl.outputColorSpace;

    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = binding.renderer.exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;

    return () => {
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
      gl.outputColorSpace = previousOutput;
    };
  }, [binding.renderer.exposure, gl]);

  useEffect(() => {
    const dynamicScene = scene as THREE.Scene & {
      environmentIntensity?: number;
      backgroundIntensity?: number;
      backgroundBlurriness?: number;
      environmentRotation?: THREE.Euler;
      backgroundRotation?: THREE.Euler;
    };
    const environment = binding.environment;

    dynamicScene.environmentIntensity =
      environment?.intensity ?? 1;
    dynamicScene.backgroundIntensity =
      environment?.background_intensity ?? 1;
    dynamicScene.backgroundBlurriness =
      environment?.background_blurriness ?? 0;
    dynamicScene.environmentRotation?.set(
      0,
      environment?.rotation_radians ?? 0,
      0,
    );
    dynamicScene.backgroundRotation?.set(
      0,
      environment?.rotation_radians ?? 0,
      0,
    );
    gl.toneMappingExposure = binding.renderer.exposure;
  }, [binding, gl, scene]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const previousEnvironment = scene.environment;
    const previousBackground = scene.background;
    let release: (() => void) | null = null;

    setGroup(null);
    onFallbackActive(true);

    acquireRuntimeScene(binding, gl, {
      signal: controller.signal,
      verify_hash: verifyHash,
      simulate_failure_entity_id:
        simulateFailureEntityId,
      on_progress: (state) => {
        if (active) onState(state);
      },
    })
      .then((instance) => {
        if (!active) {
          instance.release();
          return;
        }

        release = instance.release;
        setGroup(instance.group);

        const environmentBinding = binding.environment;
        if (instance.environment) {
          scene.environment =
            instance.environment.environment_texture;

          if (
            environmentBinding?.background_mode ===
            "environment"
          ) {
            scene.background =
              instance.environment.source_texture;
          } else if (
            environmentBinding?.background_mode ===
            "solid_color"
          ) {
            scene.background = new THREE.Color(
              environmentBinding.background_color,
            );
          } else {
            scene.background = null;
          }
          onFallbackActive(false);
        } else {
          scene.environment = null;
          scene.background =
            environmentBinding?.background_mode ===
            "solid_color"
              ? new THREE.Color(
                  environmentBinding.background_color,
                )
              : new THREE.Color("#0f172a");
          onFallbackActive(true);
        }
      })
      .catch((error) => {
        if (!active) return;
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        onFallbackActive(true);
      });

    return () => {
      active = false;
      controller.abort();
      setGroup(null);
      release?.();
      scene.environment = previousEnvironment;
      scene.background = previousBackground;
    };
  }, [
    binding,
    gl,
    onFallbackActive,
    onState,
    scene,
    simulateFailureEntityId,
    verifyHash,
  ]);

  if (!group) {
    return (
      <Html center position={[0, 1.4, 0]}>
        <div
          style={{
            border:
              "1px solid rgba(125,211,252,0.42)",
            borderRadius: "0.8rem",
            background: "rgba(2,6,23,0.9)",
            color: "#dbeafe",
            padding: "0.65rem 0.85rem",
            fontSize: "0.75rem",
            whiteSpace: "nowrap",
          }}
        >
          Hydrating and composing shared scene…
        </div>
      </Html>
    );
  }

  return <primitive object={group} />;
}

export function SharedSceneRuntimeCanvas({
  binding,
  verifyHash,
  simulateFailureEntityId,
  onState,
}: {
  binding: RuntimeSceneBindingV1;
  verifyHash: boolean;
  simulateFailureEntityId: string | null;
  onState: (state: RuntimeSceneState) => void;
}) {
  const [fallbackActive, setFallbackActive] =
    useState(true);

  const environment = binding.environment;
  const shadowPolicy = binding.renderer.shadow_policy;
  const fallbackLights = useMemo(
    () =>
      fallbackRigLights(
        environment?.fallback.rig ?? "studio_rig",
        {
          ambient:
            environment?.fallback.ambient_intensity ??
            0.55,
          key:
            environment?.fallback.key_light_intensity ??
            2.6,
          fill:
            environment?.fallback.fill_light_intensity ??
            1.15,
          rim:
            environment?.fallback.rim_light_intensity ??
            1.5,
        },
      ),
    [environment],
  );

  const onFallbackChange = useCallback(
    (active: boolean) => setFallbackActive(active),
    [],
  );

  return (
    <div
      style={{
        height: "min(72vh, 760px)",
        minHeight: "540px",
        overflow: "hidden",
        borderRadius: "1rem",
        border:
          "1px solid rgba(34,211,238,0.28)",
        background:
          "linear-gradient(180deg, #0f172a, #020617)",
      }}
    >
      <Canvas
        shadows={binding.renderer.shadows_enabled}
        camera={{
          position: [7.5, 4.8, 9.5],
          fov: 40,
          near: 0.05,
          far: 140,
        }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure =
            binding.renderer.exposure;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <SceneController
          binding={binding}
          verifyHash={verifyHash}
          simulateFailureEntityId={
            simulateFailureEntityId
          }
          onState={onState}
          onFallbackActive={onFallbackChange}
        />

        {fallbackActive
          ? fallbackLights.map((light, index) => (
              <FallbackLight
                key={`${light.role}:${index}`}
                light={light}
                shadowMapSize={shadowPolicy.map_size}
                shadowBias={shadowPolicy.bias}
                shadowNormalBias={
                  shadowPolicy.normal_bias
                }
              />
            ))
          : null}

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[26, 20]} />
          <meshStandardMaterial
            color="#475569"
            roughness={0.84}
            metalness={0}
          />
        </mesh>

        <gridHelper
          args={[26, 26, "#64748b", "#334155"]}
          position={[0, 0.006, 0]}
        />

        <OrbitControls
          makeDefault
          target={[0, 1.1, 0]}
          enableDamping
        />
      </Canvas>
    </div>
  );
}
