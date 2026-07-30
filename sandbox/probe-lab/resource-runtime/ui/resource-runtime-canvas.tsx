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
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import {
  acquireRuntimeGlb,
  clearRuntimeGlbCache,
  disposeRuntimeScene,
  runtimeGlbCacheSnapshot,
} from "../browser-glb-runtime";
import {
  EMPTY_RESOURCE_RUNTIME_METRICS,
  type ResourceRuntimeEvent,
  type ResourceRuntimeMetrics,
  type ResourceRuntimePhase,
  type RuntimeModelBindingV1,
} from "../resource-runtime-contract";

type InstanceState = {
  phase: ResourceRuntimePhase;
  error: string | null;
  metrics: ResourceRuntimeMetrics;
  events: ResourceRuntimeEvent[];
};

const EMPTY_INSTANCE_STATE: InstanceState = {
  phase: "idle",
  error: null,
  metrics:
    EMPTY_RESOURCE_RUNTIME_METRICS,
  events: [],
};

function event(
  phase: ResourceRuntimePhase,
  message: string,
): ResourceRuntimeEvent {
  return {
    phase,
    message,
    at: new Date().toISOString(),
  };
}

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
  const scale = 2.5 / largest;

  scene.position.sub(center);
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  const fittedBounds =
    new THREE.Box3().setFromObject(
      scene,
    );
  scene.position.y -=
    fittedBounds.min.y;

  return scene;
}

function FallbackProxy({
  entityId,
  label,
  position = [0, 0, 0],
}: {
  entityId: string;
  label: string;
  position?: [
    number,
    number,
    number,
  ];
}) {
  return (
    <group position={position}>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.8, 0]}
      >
        <boxGeometry
          args={[1.5, 1.5, 1.5]}
        />
        <meshStandardMaterial
          color="#f59e0b"
          roughness={0.55}
          metalness={0.08}
          wireframe
        />
      </mesh>
      <Html
        center
        position={[0, 1.9, 0]}
        distanceFactor={8}
      >
        <div
          style={{
            width: "210px",
            padding: "0.55rem 0.7rem",
            borderRadius: "0.7rem",
            background:
              "rgba(15,23,42,0.92)",
            border:
              "1px solid rgba(245,158,11,0.7)",
            color: "#fef3c7",
            textAlign: "center",
            fontSize: "0.75rem",
            lineHeight: 1.45,
          }}
        >
          <strong>
            Declared fallback proxy
          </strong>
          <div>{label}</div>
          <div
            style={{
              marginTop: "0.2rem",
              opacity: 0.72,
            }}
          >
            Entity: {entityId}
          </div>
        </div>
      </Html>
    </group>
  );
}

function LoadingLabel({
  phase,
}: {
  phase: ResourceRuntimePhase;
}) {
  return (
    <Html center>
      <div
        style={{
          border:
            "1px solid rgba(147,197,253,0.4)",
          borderRadius: "0.85rem",
          padding: "0.7rem 0.9rem",
          background:
            "rgba(2,6,23,0.88)",
          color: "#dbeafe",
          whiteSpace: "nowrap",
          fontSize: "0.8rem",
        }}
      >
        {phase === "idle"
          ? "Waiting for binding…"
          : `${phase}…`}
      </div>
    </Html>
  );
}

function RuntimeModelInstance({
  binding,
  verifyHash,
  position,
  onState,
}: {
  binding: RuntimeModelBindingV1;
  verifyHash: boolean;
  position: [
    number,
    number,
    number,
  ];
  onState: (
    state: InstanceState,
  ) => void;
}) {
  const [scene, setScene] =
    useState<THREE.Group | null>(
      null,
    );
  const [
    instanceState,
    setInstanceState,
  ] = useState<InstanceState>({
    ...EMPTY_INSTANCE_STATE,
    phase: "resolved",
    events: [
      event(
        "resolved",
        `Resolved ${binding.asset_id}.`,
      ),
    ],
  });
  const stateRef =
    useRef<InstanceState>(
      instanceState,
    );

  useEffect(() => {
    let active = true;
    const controller =
      new AbortController();
    let release:
      | (() => void)
      | null = null;
    let ownedScene:
      | THREE.Group
      | null = null;

    const publish = (
      phase: ResourceRuntimePhase,
      message: string,
      updates: Partial<InstanceState> = {},
    ) => {
      const next: InstanceState = {
        ...stateRef.current,
        ...updates,
        phase,
        events: [
          ...stateRef.current.events,
          event(phase, message),
        ].slice(-18),
      };
      stateRef.current = next;
      setInstanceState(next);
      onState(next);
    };

    publish(
      "resolved",
      `Binding ${binding.asset_id} to ${binding.entity_id}.`,
      {
        error: null,
        metrics:
          EMPTY_RESOURCE_RUNTIME_METRICS,
      },
    );

    acquireRuntimeGlb(
      binding,
      {
        signal:
          controller.signal,
        verify_hash: verifyHash,
        on_phase: (
          phase,
          message,
        ) => {
          if (active) {
            publish(
              phase,
              message,
            );
          }
        },
      },
    )
      .then((instance) => {
        if (!active) {
          disposeRuntimeScene(
            instance.scene,
          );
          instance.release();
          return;
        }

        release =
          instance.release;
        ownedScene =
          fitScene(
            instance.scene,
          );
        setScene(ownedScene);
        publish(
          "ready",
          `${binding.asset_id} is rendered.`,
          {
            metrics:
              instance.metrics,
          },
        );
      })
      .catch((error) => {
        if (!active) return;

        const cancelled =
          error instanceof
            DOMException &&
          error.name ===
            "AbortError";

        publish(
          cancelled
            ? "cancelled"
            : "failed",
          cancelled
            ? "Resource load was cancelled."
            : "Resource load failed.",
          {
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );
      });

    return () => {
      active = false;
      controller.abort();

      const finalEvent =
        ownedScene
          ? (() => {
              const disposed =
                disposeRuntimeScene(
                  ownedScene,
                );
              return event(
                "disposed",
                `Disposed ${disposed.geometry_count} geometries, ${disposed.material_count} materials, and ${disposed.texture_count} textures.`,
              );
            })()
          : event(
              "cancelled",
              "The pending resource instance was cancelled.",
            );
      const finalState: InstanceState = {
        ...stateRef.current,
        phase:
          finalEvent.phase,
        events: [
          ...stateRef.current.events,
          finalEvent,
        ].slice(-18),
      };

      stateRef.current =
        finalState;
      onState(finalState);
      release?.();
    };
  }, [
    binding,
    onState,
    verifyHash,
  ]);

  if (
    instanceState.phase ===
      "failed"
  ) {
    return (
      <FallbackProxy
        entityId={
          binding.entity_id
        }
        label={
          instanceState
            .error ??
          "Runtime load failed."
        }
        position={position}
      />
    );
  }

  if (!scene) {
    return (
      <group position={position}>
        <LoadingLabel
          phase={
            instanceState.phase
          }
        />
      </group>
    );
  }

  return (
    <group position={position}>
      <primitive object={scene} />
    </group>
  );
}

function RuntimeScene({
  binding,
  fallbackLabel,
  showDuplicate,
  verifyHash,
  onPrimaryState,
  onDuplicateState,
}: {
  binding: RuntimeModelBindingV1 | null;
  fallbackLabel: string | null;
  showDuplicate: boolean;
  verifyHash: boolean;
  onPrimaryState: (
    state: InstanceState,
  ) => void;
  onDuplicateState: (
    state: InstanceState,
  ) => void;
}) {
  const primaryPosition:
    [number, number, number] =
      showDuplicate
        ? [-1.7, 0, 0]
        : [0, 0, 0];
  const duplicatePosition:
    [number, number, number] =
      [1.7, 0, 0];

  return (
    <>
      <color
        attach="background"
        args={["#07111f"]}
      />
      <ambientLight
        intensity={0.8}
      />
      <directionalLight
        position={[5, 8, 4]}
        intensity={2.2}
        castShadow
      />
      <directionalLight
        position={[-4, 3, -5]}
        intensity={0.7}
      />
      <gridHelper
        args={[
          14,
          28,
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
          args={[14, 14]}
        />
        <shadowMaterial
          opacity={0.24}
        />
      </mesh>

      {binding ? (
        <>
          <RuntimeModelInstance
            key={`primary:${binding.asset_id}:${binding.variant_id ?? ""}:${verifyHash}`}
            binding={binding}
            verifyHash={verifyHash}
            position={
              primaryPosition
            }
            onState={
              onPrimaryState
            }
          />
          {showDuplicate ? (
            <RuntimeModelInstance
              key={`duplicate:${binding.asset_id}:${binding.variant_id ?? ""}:${verifyHash}`}
              binding={binding}
              verifyHash={
                verifyHash
              }
              position={
                duplicatePosition
              }
              onState={
                onDuplicateState
              }
            />
          ) : null}
        </>
      ) : (
        <FallbackProxy
          entityId="resource_runtime_actor"
          label={
            fallbackLabel ??
            "No reviewed resource binding is available."
          }
        />
      )}

      <OrbitControls
        makeDefault
        target={[0, 1, 0]}
        minDistance={3}
        maxDistance={14}
      />
    </>
  );
}

export function ResourceRuntimeCanvas({
  binding,
  fallbackLabel,
  showDuplicate,
  verifyHash,
  onPrimaryState,
  onDuplicateState,
}: {
  binding: RuntimeModelBindingV1 | null;
  fallbackLabel: string | null;
  showDuplicate: boolean;
  verifyHash: boolean;
  onPrimaryState: (
    state: InstanceState,
  ) => void;
  onDuplicateState: (
    state: InstanceState,
  ) => void;
}) {
  return (
    <div
      style={{
        minHeight: "540px",
        overflow: "hidden",
        borderRadius: "1.25rem",
        border:
          "1px solid rgba(148,163,184,0.22)",
        background: "#07111f",
      }}
    >
      <Canvas
        shadows
        camera={{
          position: [4.8, 3.5, 6.8],
          fov: 42,
          near: 0.1,
          far: 100,
        }}
      >
        <RuntimeScene
          binding={binding}
          fallbackLabel={
            fallbackLabel
          }
          showDuplicate={
            showDuplicate
          }
          verifyHash={
            verifyHash
          }
          onPrimaryState={
            onPrimaryState
          }
          onDuplicateState={
            onDuplicateState
          }
        />
      </Canvas>
    </div>
  );
}

export {
  clearRuntimeGlbCache,
  runtimeGlbCacheSnapshot,
};

export type {
  InstanceState as ResourceRuntimeInstanceState,
};
