"use client";

import {
  Html,
  OrbitControls,
} from "@react-three/drei";
import {
  Canvas,
} from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import * as THREE from "three";

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
  MaterialRuntimeInstanceState,
  MaterialTextureRole,
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

  scene.position.sub(center);
  scene.scale.setScalar(
    2.2 / largest,
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

function MaterialFallback({
  position,
  label,
}: {
  position: [number, number, number];
  label: string;
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, 0.85, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[1.35, 1.35, 1.35]}
        />
        <meshStandardMaterial
          color="#94a3b8"
          roughness={0.8}
          wireframe
        />
      </mesh>
      <Html
        center
        position={[0, 1.85, 0]}
      >
        <div
          style={{
            width: "180px",
            borderRadius:
              "0.65rem",
            border:
              "1px solid rgba(248,113,113,0.45)",
            background:
              "rgba(15,23,42,0.94)",
            padding:
              "0.5rem 0.6rem",
            color: "#fecaca",
            fontSize: "0.7rem",
            textAlign: "center",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function PrimitiveMaterialActor({
  binding,
  position,
  geometryKind,
  simulateFailureRole,
  onState,
}: {
  binding: RuntimeMaterialBindingV1;
  position: [number, number, number];
  geometryKind:
    | "box"
    | "sphere";
  simulateFailureRole:
    | MaterialTextureRole
    | null;
  onState: (
    state: MaterialRuntimeInstanceState,
  ) => void;
}) {
  const [material, setMaterial] =
    useState<THREE.MeshStandardMaterial | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(
      null,
    );
  const geometry =
    useMemo(
      () =>
        geometryKind ===
        "sphere"
          ? new THREE.SphereGeometry(
              0.9,
              64,
              32,
            )
          : new THREE.BoxGeometry(
              1.45,
              1.45,
              1.45,
              4,
              4,
              4,
            ),
      [geometryKind],
    );

  useEffect(() => {
    let active = true;
    const controller =
      new AbortController();
    let release:
      | (() => void)
      | null = null;
    let ownedMaterial:
      | THREE.MeshStandardMaterial
      | null = null;

    onState({
      phase: "loading",
      error: null,
      metrics: null,
      warnings: [],
    });

    acquireRuntimeMaterial(
      binding,
      {
        signal:
          controller.signal,
        simulate_failure_role:
          simulateFailureRole,
      },
    )
      .then((instance) => {
        if (!active) {
          disposeRuntimeMaterial(
            instance.material,
          );
          instance.release();
          return;
        }

        ownedMaterial =
          instance.material;
        release =
          instance.release;
        setMaterial(
          ownedMaterial,
        );
        setError(null);
        onState({
          phase: "ready",
          error: null,
          metrics: {
            ...instance.metrics,
            applied_mesh_count:
              1,
            applied_slot_count:
              1,
          },
          warnings:
            instance.warnings,
        });
      })
      .catch((caught) => {
        if (!active) return;
        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);
        setError(message);
        onState({
          phase: "failed",
          error: message,
          metrics: null,
          warnings: [],
        });
      });

    return () => {
      active = false;
      controller.abort();
      if (ownedMaterial) {
        disposeRuntimeMaterial(
          ownedMaterial,
        );
      }
      release?.();
      onState({
        phase: "disposed",
        error: null,
        metrics: null,
        warnings: [],
      });
    };
  }, [
    binding,
    onState,
    simulateFailureRole,
  ]);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  if (error) {
    return (
      <MaterialFallback
        position={position}
        label={error}
      />
    );
  }

  if (!material) {
    return (
      <group position={position}>
        <Html center>
          <div
            style={{
              borderRadius:
                "0.65rem",
              background:
                "rgba(15,23,42,0.9)",
              color: "#dbeafe",
              padding:
                "0.45rem 0.6rem",
              whiteSpace:
                "nowrap",
              fontSize: "0.72rem",
            }}
          >
            Loading material…
          </div>
        </Html>
      </group>
    );
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[
        position[0],
        position[1] + 0.9,
        position[2],
      ]}
      castShadow
      receiveShadow
    />
  );
}

function MaterializedModelActor({
  modelBinding,
  materialBinding,
  position,
  simulateFailureRole,
  onState,
}: {
  modelBinding: RuntimeModelBindingV1;
  materialBinding: RuntimeMaterialBindingV1;
  position: [number, number, number];
  simulateFailureRole:
    | MaterialTextureRole
    | null;
  onState: (
    state: MaterialRuntimeInstanceState,
  ) => void;
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

    onState({
      phase: "loading",
      error: null,
      metrics: null,
      warnings: [],
    });

    Promise.all([
      acquireRuntimeGlb(
        modelBinding,
        {
          signal:
            controller.signal,
        },
      ),
      materialBinding.source_mode ===
      "preserve_original"
        ? Promise.resolve(null)
        : acquireRuntimeMaterial(
            materialBinding,
            {
              signal:
                controller.signal,
              simulate_failure_role:
                simulateFailureRole,
            },
          ),
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

          let metrics =
            material?.metrics ??
            null;
          let warnings =
            material?.warnings ??
            [];

          if (material) {
            materialRelease =
              material.release;
            const applied =
              applyRuntimeMaterialToScene(
                ownedScene,
                material.material,
                materialBinding,
              );
            metrics = {
              ...material.metrics,
              applied_mesh_count:
                applied.applied_mesh_count,
              applied_slot_count:
                applied.applied_slot_count,
              application:
                applied.application,
            };
            if (
              applied.warning
            ) {
              warnings = [
                ...warnings,
                applied.warning,
              ];
            }
          }

          setScene(ownedScene);
          setError(null);
          onState({
            phase: "ready",
            error: null,
            metrics,
            warnings,
          });
        },
      )
      .catch((caught) => {
        if (!active) return;
        const message =
          caught instanceof Error
            ? caught.message
            : String(caught);
        setError(message);
        onState({
          phase: "failed",
          error: message,
          metrics: null,
          warnings: [],
        });
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
      onState({
        phase: "disposed",
        error: null,
        metrics: null,
        warnings: [],
      });
    };
  }, [
    materialBinding,
    modelBinding,
    onState,
    simulateFailureRole,
  ]);

  if (error) {
    return (
      <MaterialFallback
        position={position}
        label={error}
      />
    );
  }

  if (!scene) {
    return (
      <group position={position}>
        <Html center>
          <div
            style={{
              borderRadius:
                "0.65rem",
              background:
                "rgba(15,23,42,0.9)",
              color: "#dbeafe",
              padding:
                "0.45rem 0.6rem",
              whiteSpace:
                "nowrap",
              fontSize: "0.72rem",
            }}
          >
            Loading model material…
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={position}>
      <primitive object={scene} />
    </group>
  );
}

export function MaterialRuntimeCanvas({
  binding,
  modelBinding,
  duplicateRepeat,
  duplicateRoughness,
  simulateFailureRole,
  onPrimaryState,
  onDuplicateState,
  onModelState,
}: {
  binding: RuntimeMaterialBindingV1 | null;
  modelBinding: RuntimeModelBindingV1 | null;
  duplicateRepeat: number;
  duplicateRoughness: number;
  simulateFailureRole:
    | MaterialTextureRole
    | null;
  onPrimaryState: (
    state: MaterialRuntimeInstanceState,
  ) => void;
  onDuplicateState: (
    state: MaterialRuntimeInstanceState,
  ) => void;
  onModelState: (
    state: MaterialRuntimeInstanceState,
  ) => void;
}) {
  const duplicateBinding =
    useMemo(
      () =>
        binding
          ? {
              ...binding,
              material_binding_id:
                `${binding.material_binding_id}:duplicate`,
              uv_transform: {
                ...binding.uv_transform,
                repeat: [
                  duplicateRepeat,
                  duplicateRepeat,
                ] as [
                  number,
                  number,
                ],
              },
              parameters: {
                ...binding.parameters,
                roughness_factor:
                  duplicateRoughness,
              },
            }
          : null,
      [
        binding,
        duplicateRepeat,
        duplicateRoughness,
      ],
    );

  const modelMaterialBinding =
    useMemo(
      () =>
        binding && modelBinding
          ? {
              ...binding,
              target_entity_id:
                modelBinding.entity_id,
            }
          : null,
      [
        binding,
        modelBinding?.entity_id,
      ],
    );

  return (
    <div
      style={{
        minHeight: "520px",
        overflow: "hidden",
        borderRadius:
          "1.15rem",
        border:
          "1px solid rgba(148,163,184,0.22)",
        background: "#07111f",
      }}
    >
      <Canvas
        shadows
        camera={{
          position: [
            6.8,
            4.2,
            8.2,
          ],
          fov: 42,
          near: 0.1,
          far: 100,
        }}
      >
        <color
          attach="background"
          args={["#07111f"]}
        />
        <ambientLight
          intensity={0.75}
        />
        <directionalLight
          position={[5, 8, 4]}
          intensity={2.2}
          castShadow
        />
        <directionalLight
          position={[-5, 4, -4]}
          intensity={0.65}
        />
        <gridHelper
          args={[
            16,
            32,
            "#334155",
            "#1e293b",
          ]}
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
            args={[16, 16]}
          />
          <shadowMaterial
            opacity={0.25}
          />
        </mesh>

        {binding ? (
          <>
            <PrimitiveMaterialActor
              key={`box:${binding.material_binding_id}`}
              binding={binding}
              position={[
                -2.8,
                0,
                0,
              ]}
              geometryKind="box"
              simulateFailureRole={
                simulateFailureRole
              }
              onState={
                onPrimaryState
              }
            />
            {duplicateBinding ? (
              <PrimitiveMaterialActor
                key={`sphere:${duplicateBinding.material_binding_id}:${duplicateRepeat}:${duplicateRoughness}`}
                binding={
                  duplicateBinding
                }
                position={[
                  0,
                  0,
                  0,
                ]}
                geometryKind="sphere"
                simulateFailureRole={
                  null
                }
                onState={
                  onDuplicateState
                }
              />
            ) : null}
            {modelBinding &&
            modelMaterialBinding ? (
              <MaterializedModelActor
                key={`model:${modelBinding.asset_id}:${modelMaterialBinding.material_binding_id}:${modelMaterialBinding.source_mode}:${modelMaterialBinding.target_slot ?? ""}`}
                modelBinding={
                  modelBinding
                }
                materialBinding={
                  modelMaterialBinding
                }
                position={[
                  2.9,
                  0,
                  0,
                ]}
                simulateFailureRole={
                  simulateFailureRole
                }
                onState={
                  onModelState
                }
              />
            ) : null}
          </>
        ) : (
          <MaterialFallback
            position={[0, 0, 0]}
            label="Resolve a reviewed material to begin."
          />
        )}

        <OrbitControls
          makeDefault
          target={[0, 1, 0]}
          minDistance={4}
          maxDistance={18}
        />
      </Canvas>
    </div>
  );
}