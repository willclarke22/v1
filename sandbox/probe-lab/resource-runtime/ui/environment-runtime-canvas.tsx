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
  acquireRuntimeEnvironment,
  runtimeEnvironmentCacheSnapshot,
} from "../browser-environment-runtime";
import {
  acquireRuntimeGlb,
  disposeRuntimeScene,
} from "../browser-glb-runtime";
import {
  acquireRuntimeMaterial,
  applyRuntimeMaterialToScene,
  disposeRuntimeMaterial,
} from "../browser-material-runtime";
import type {
  EnvironmentRuntimeState,
  RuntimeEnvironmentBindingV1,
} from "../environment-runtime-contract";
import {
  fallbackRigLights,
  type RuntimeFallbackLight,
} from "../environment-runtime-policy";
import type {
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";
import type {
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";

function fitScene(
  scene: THREE.Group,
) {
  scene.updateMatrixWorld(true);
  const bounds =
    new THREE.Box3().setFromObject(
      scene,
    );
  const size =
    bounds.getSize(
      new THREE.Vector3(),
    );
  const center =
    bounds.getCenter(
      new THREE.Vector3(),
    );
  const largest =
    Math.max(
      size.x,
      size.y,
      size.z,
      0.001,
    );

  scene.position.sub(
    center,
  );
  scene.scale.setScalar(
    2.6 / largest,
  );
  scene.updateMatrixWorld(true);

  const fitted =
    new THREE.Box3().setFromObject(
      scene,
    );
  scene.position.y -=
    fitted.min.y;

  return scene;
}

function RuntimePreviewActor({
  modelBinding,
  materialBinding,
}: {
  modelBinding:
    | RuntimeModelBindingV1
    | null;
  materialBinding:
    | RuntimeMaterialBindingV1
    | null;
}) {
  const [scene, setScene] =
    useState<THREE.Group | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    if (!modelBinding) {
      setScene(null);
      setError(null);
      return;
    }

    let active = true;
    const controller =
      new AbortController();
    let modelRelease:
      | (() => void)
      | null = null;
    let materialRelease:
      | (() => void)
      | null = null;
    let ownedScene:
      | THREE.Group
      | null = null;

    Promise.all([
      acquireRuntimeGlb(
        modelBinding,
        {
          signal:
            controller.signal,
        },
      ),
      materialBinding &&
      materialBinding.source_mode !==
        "preserve_original"
        ? acquireRuntimeMaterial(
            materialBinding,
            {
              signal:
                controller.signal,
            },
          )
        : Promise.resolve(null),
    ])
      .then(
        ([
          model,
          material,
        ]) => {
          if (!active) {
            disposeRuntimeScene(
              model.scene,
            );
            model.release();
            if (material) {
              disposeRuntimeMaterial(
                material.material,
              );
              material.release();
            }
            return;
          }

          modelRelease =
            model.release;
          ownedScene =
            fitScene(
              model.scene,
            );

          if (material) {
            materialRelease =
              material.release;
            applyRuntimeMaterialToScene(
              ownedScene,
              material.material,
              materialBinding!,
            );
          }

          setScene(
            ownedScene,
          );
          setError(null);
        },
      )
      .catch((caught) => {
        if (!active) return;
        if (
          caught instanceof DOMException &&
          caught.name ===
            "AbortError"
        ) {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      });

    return () => {
      active = false;
      controller.abort();
      if (ownedScene) {
        disposeRuntimeScene(
          ownedScene,
        );
      }
      materialRelease?.();
      modelRelease?.();
    };
  }, [
    materialBinding,
    modelBinding,
  ]);

  if (!modelBinding) {
    return (
      <group>
        <mesh
          position={[
            -1.1,
            1.05,
            0,
          ]}
          castShadow
          receiveShadow
        >
          <sphereGeometry
            args={[1, 64, 32]}
          />
          <meshStandardMaterial
            color="#cbd5e1"
            roughness={0.22}
            metalness={0.65}
          />
        </mesh>
        <mesh
          position={[
            1.35,
            1.05,
            0,
          ]}
          rotation={[
            Math.PI / 2,
            0,
            0,
          ]}
          castShadow
          receiveShadow
        >
          <torusKnotGeometry
            args={[
              0.72,
              0.24,
              180,
              32,
            ]}
          />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.72}
            metalness={0}
          />
        </mesh>
      </group>
    );
  }

  if (error) {
    return (
      <Html
        center
        position={[0, 1.4, 0]}
      >
        <div
          style={{
            maxWidth: "280px",
            padding:
              "0.6rem 0.75rem",
            borderRadius:
              "0.75rem",
            border:
              "1px solid rgba(248,113,113,0.42)",
            background:
              "rgba(127,29,29,0.9)",
            color: "#fee2e2",
            fontSize:
              "0.72rem",
          }}
        >
          {error}
        </div>
      </Html>
    );
  }

  if (!scene) {
    return (
      <Html
        center
        position={[0, 1.4, 0]}
      >
        <div
          style={{
            padding:
              "0.45rem 0.65rem",
            borderRadius:
              "0.65rem",
            background:
              "rgba(15,23,42,0.9)",
            color: "#dbeafe",
            fontSize:
              "0.72rem",
          }}
        >
          Loading reviewed actor…
        </div>
      </Html>
    );
  }

  return (
    <primitive
      object={scene}
    />
  );
}

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
  if (
    light.kind ===
    "ambient"
  ) {
    return (
      <ambientLight
        color={light.color}
        intensity={
          light.intensity
        }
      />
    );
  }

  if (
    light.kind ===
    "hemisphere"
  ) {
    return (
      <hemisphereLight
        color={light.color}
        groundColor={
          light.ground_color ??
          "#334155"
        }
        intensity={
          light.intensity
        }
      />
    );
  }

  if (
    light.kind ===
    "spot"
  ) {
    return (
      <spotLight
        color={light.color}
        intensity={
          light.intensity
        }
        position={
          light.position ??
          [4, 7, 4]
        }
        angle={0.65}
        penumbra={0.8}
        decay={2}
        distance={24}
        castShadow={
          light.cast_shadow
        }
        shadow-mapSize-width={
          shadowMapSize
        }
        shadow-mapSize-height={
          shadowMapSize
        }
        shadow-bias={
          shadowBias
        }
        shadow-normalBias={
          shadowNormalBias
        }
      />
    );
  }

  return (
    <directionalLight
      color={light.color}
      intensity={
        light.intensity
      }
      position={
        light.position ??
        [4, 7, 5]
      }
      castShadow={
        light.cast_shadow
      }
      shadow-mapSize-width={
        shadowMapSize
      }
      shadow-mapSize-height={
        shadowMapSize
      }
      shadow-bias={
        shadowBias
      }
      shadow-normalBias={
        shadowNormalBias
      }
    />
  );
}

function EnvironmentController({
  binding,
  verifyHash,
  onState,
  onFallbackActive,
  onRenderer,
}: {
  binding:
    | RuntimeEnvironmentBindingV1
    | null;
  verifyHash: boolean;
  onState: (
    state: EnvironmentRuntimeState,
  ) => void;
  onFallbackActive: (
    active: boolean,
  ) => void;
  onRenderer: (
    renderer: THREE.WebGLRenderer,
  ) => void;
}) {
  const {
    gl,
    scene,
  } = useThree();

  const stableFallbackState =
    useCallback(
      (
        activeBinding:
          | RuntimeEnvironmentBindingV1
          | null,
        reason:
          | string
          | null,
      ) => {
        const effective =
          activeBinding;
        onState({
          phase:
            effective
              ? "fallback"
              : "idle",
          environment_resource_id:
            effective
              ?.environment_resource_id ??
            null,
          lighting_mode:
            effective
              ?.fallback.rig ??
            "studio_rig",
          environment_attached:
            false,
          background_attached:
            false,
          fallback_lights_active:
            true,
          error: reason,
          warnings:
            effective?.warnings ??
            [],
          metrics: null,
          effective: {
            tone_mapping:
              "ACESFilmic",
            output_color_space:
              "srgb",
            exposure:
              effective
                ?.exposure ??
              1,
            environment_intensity:
              effective
                ?.intensity ??
              1,
            rotation_radians:
              effective
                ?.rotation_radians ??
              0,
            background_mode:
              effective
                ?.background_mode ??
              "solid_color",
            background_blurriness:
              effective
                ?.background_blurriness ??
              0,
            shadow_policy:
              effective
                ?.shadow_policy ?? {
                enabled: true,
                quality:
                  "medium",
                max_shadow_lights:
                  1,
                map_size:
                  1024,
                softness: 2,
                bias:
                  -0.0002,
                normal_bias:
                  0.02,
              },
          },
        });
      },
      [onState],
    );

  useEffect(() => {
    onRenderer(gl);
  }, [gl, onRenderer]);

  useEffect(() => {
    const previousToneMapping =
      gl.toneMapping;
    const previousExposure =
      gl.toneMappingExposure;
    const previousOutput =
      gl.outputColorSpace;

    gl.toneMapping =
      THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure =
      binding?.exposure ?? 1;
    gl.outputColorSpace =
      THREE.SRGBColorSpace;

    return () => {
      gl.toneMapping =
        previousToneMapping;
      gl.toneMappingExposure =
        previousExposure;
      gl.outputColorSpace =
        previousOutput;
    };
  }, [
    binding?.exposure,
    gl,
  ]);

  useEffect(() => {
    const dynamicScene =
      scene as THREE.Scene & {
        environmentIntensity?: number;
        backgroundIntensity?: number;
        backgroundBlurriness?: number;
        environmentRotation?: THREE.Euler;
        backgroundRotation?: THREE.Euler;
      };

    dynamicScene.environmentIntensity =
      binding?.intensity ?? 1;
    dynamicScene.backgroundIntensity =
      binding?.background_intensity ??
      1;
    dynamicScene.backgroundBlurriness =
      binding?.background_blurriness ??
      0;

    dynamicScene.environmentRotation?.set(
      0,
      binding?.rotation_radians ??
        0,
      0,
    );
    dynamicScene.backgroundRotation?.set(
      0,
      binding?.rotation_radians ??
        0,
      0,
    );

    gl.toneMappingExposure =
      binding?.exposure ?? 1;
  }, [
    binding?.background_blurriness,
    binding?.background_intensity,
    binding?.exposure,
    binding?.intensity,
    binding?.rotation_radians,
    gl,
    scene,
  ]);

  useEffect(() => {
    const previousEnvironment =
      scene.environment;
    const previousBackground =
      scene.background;
    let active = true;
    let release:
      | (() => void)
      | null = null;

    const applyBackground = (
      sourceTexture:
        | THREE.Texture
        | null,
    ) => {
      if (!binding) {
        scene.background =
          new THREE.Color(
            "#0f172a",
          );
        return false;
      }

      if (
        binding.background_mode ===
          "environment" &&
        sourceTexture
      ) {
        scene.background =
          sourceTexture;
        return true;
      }

      if (
        binding.background_mode ===
        "solid_color"
      ) {
        scene.background =
          new THREE.Color(
            binding.background_color,
          );
        return false;
      }

      scene.background =
        null;
      return false;
    };

    if (
      !binding ||
      binding.lighting_mode !==
        "hdri" ||
      !binding.public_url
    ) {
      scene.environment =
        null;
      applyBackground(null);
      onFallbackActive(true);
      stableFallbackState(
        binding,
        binding?.fallback.reason ??
          null,
      );

      return () => {
        scene.environment =
          previousEnvironment;
        scene.background =
          previousBackground;
      };
    }

    onState({
      phase: "downloading",
      environment_resource_id:
        binding.environment_resource_id,
      lighting_mode:
        binding.lighting_mode,
      environment_attached:
        false,
      background_attached:
        false,
      fallback_lights_active:
        false,
      error: null,
      warnings:
        binding.warnings,
      metrics: null,
      effective: {
        tone_mapping:
          "ACESFilmic",
        output_color_space:
          "srgb",
        exposure:
          binding.exposure,
        environment_intensity:
          binding.intensity,
        rotation_radians:
          binding.rotation_radians,
        background_mode:
          binding.background_mode,
        background_blurriness:
          binding.background_blurriness,
        shadow_policy:
          binding.shadow_policy,
      },
    });

    acquireRuntimeEnvironment(
      binding,
      gl,
      {
        verify_hash:
          verifyHash,
      },
    )
      .then((instance) => {
        if (!active) {
          instance.release();
          return;
        }

        release =
          instance.release;
        scene.environment =
          instance.environment_texture;
        const backgroundAttached =
          applyBackground(
            instance.source_texture,
          );
        onFallbackActive(false);
        onState({
          phase: "ready",
          environment_resource_id:
            binding.environment_resource_id,
          lighting_mode:
            binding.lighting_mode,
          environment_attached:
            true,
          background_attached:
            backgroundAttached,
          fallback_lights_active:
            false,
          error: null,
          warnings:
            binding.warnings,
          metrics:
            instance.metrics,
          effective: {
            tone_mapping:
              "ACESFilmic",
            output_color_space:
              "srgb",
            exposure:
              binding.exposure,
            environment_intensity:
              binding.intensity,
            rotation_radians:
              binding.rotation_radians,
            background_mode:
              binding.background_mode,
            background_blurriness:
              binding.background_blurriness,
            shadow_policy:
              binding.shadow_policy,
          },
        });
      })
      .catch((caught) => {
        if (!active) return;
        if (
          caught instanceof DOMException &&
          caught.name ===
            "AbortError"
        ) {
          return;
        }

        scene.environment =
          null;
        applyBackground(null);
        onFallbackActive(true);
        stableFallbackState(
          binding,
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      });

    return () => {
      active = false;
      release?.();
      scene.environment =
        previousEnvironment;
      scene.background =
        previousBackground;
    };
  }, [
    binding,
    gl,
    onFallbackActive,
    onState,
    scene,
    stableFallbackState,
    verifyHash,
  ]);

  return null;
}

export function EnvironmentRuntimeCanvas({
  binding,
  modelBinding,
  materialBinding,
  verifyHash,
  onState,
  onRenderer,
}: {
  binding:
    | RuntimeEnvironmentBindingV1
    | null;
  modelBinding:
    | RuntimeModelBindingV1
    | null;
  materialBinding:
    | RuntimeMaterialBindingV1
    | null;
  verifyHash: boolean;
  onState: (
    state: EnvironmentRuntimeState,
  ) => void;
  onRenderer: (
    renderer: THREE.WebGLRenderer,
  ) => void;
}) {
  const [
    fallbackActive,
    setFallbackActive,
  ] = useState(true);

  const fallbackLights =
    useMemo(
      () =>
        fallbackRigLights(
          binding?.fallback.rig ??
            "studio_rig",
          {
            ambient:
              binding?.fallback
                .ambient_intensity ??
              0.55,
            key:
              binding?.fallback
                .key_light_intensity ??
              2.6,
            fill:
              binding?.fallback
                .fill_light_intensity ??
              1.15,
            rim:
              binding?.fallback
                .rim_light_intensity ??
              1.5,
          },
        ),
      [
        binding?.fallback
          .ambient_intensity,
        binding?.fallback
          .fill_light_intensity,
        binding?.fallback
          .key_light_intensity,
        binding?.fallback
          .rim_light_intensity,
        binding?.fallback.rig,
      ],
    );

  const shadowPolicy =
    binding?.shadow_policy ?? {
      enabled: true,
      quality: "medium" as const,
      max_shadow_lights: 1,
      map_size: 1024 as const,
      softness: 2,
      bias: -0.0002,
      normal_bias: 0.02,
    };

  return (
    <div
      style={{
        height:
          "min(68vh, 700px)",
        minHeight: "500px",
        overflow: "hidden",
        borderRadius:
          "1rem",
        border:
          "1px solid rgba(56,189,248,0.22)",
        background:
          "linear-gradient(180deg, #0f172a, #020617)",
      }}
    >
      <Canvas
        shadows={
          shadowPolicy.enabled
        }
        camera={{
          position:
            [4.8, 3.5, 6.2],
          fov: 42,
          near: 0.05,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
        }}
        onCreated={({
          gl,
        }) => {
          gl.toneMapping =
            THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure =
            binding?.exposure ??
            1;
          gl.outputColorSpace =
            THREE.SRGBColorSpace;
        }}
      >
        <EnvironmentController
          binding={binding}
          verifyHash={
            verifyHash
          }
          onState={onState}
          onFallbackActive={
            setFallbackActive
          }
          onRenderer={
            onRenderer
          }
        />

        {fallbackActive
          ? fallbackLights.map(
              (
                light,
                index,
              ) => (
                <FallbackLight
                  key={`${light.role}:${index}`}
                  light={light}
                  shadowMapSize={
                    shadowPolicy.map_size
                  }
                  shadowBias={
                    shadowPolicy.bias
                  }
                  shadowNormalBias={
                    shadowPolicy.normal_bias
                  }
                />
              ),
            )
          : null}

        <RuntimePreviewActor
          modelBinding={
            modelBinding
          }
          materialBinding={
            materialBinding
          }
        />

        <mesh
          rotation={[
            -Math.PI / 2,
            0,
            0,
          ]}
          receiveShadow
        >
          <planeGeometry
            args={[18, 18]}
          />
          <meshStandardMaterial
            color="#475569"
            roughness={0.82}
            metalness={0}
          />
        </mesh>

        <gridHelper
          args={[
            18,
            18,
            "#64748b",
            "#334155",
          ]}
          position={[
            0,
            0.006,
            0,
          ]}
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

export {
  runtimeEnvironmentCacheSnapshot,
};
