"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { DirectorMoment } from "../../director";
import type { DirectorSceneState } from "../../motion-program/director-scene-state";
import {
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "./director-shot-runtime";

const MAX_CARRIERS = 36;
const MAX_QUANTITY_GAUGES = 12;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return THREE.MathUtils.clamp(value, 0, 1);
}

function runtimeProgress(
  elapsedSeconds: number,
  moment: DirectorMoment,
  progress: number | undefined,
  autoLoop: boolean,
) {
  if (typeof progress === "number") return clamp01(progress);
  if (!autoLoop) return 0;
  const durationMs = Math.max(1000, moment.duration_ms);
  return ((elapsedSeconds * 1000) % durationMs) / durationMs;
}

/**
 * Renderer-side proof for Phase 1B.4.6 process samples in a real resolved scene.
 *
 * This deliberately renders semantic carriers and compact quantity gauges rather
 * than pretending to simulate liquid, smoke, granular material, or measured
 * containment. The MotionProgram remains the source of truth; a later asset-
 * aware effect renderer can replace this visualization without changing Director
 * semantics.
 */
export function DirectorProcessRuntimeOverlay({
  moment,
  actors,
  sceneState,
  progress,
  autoLoop = false,
}: {
  moment: DirectorMoment;
  actors: DirectorRuntimeActor[];
  sceneState?: DirectorSceneState | null;
  progress?: number;
  autoLoop?: boolean;
}) {
  const carrierRefs = useRef<Array<THREE.Mesh | null>>([]);
  const gaugeRefs = useRef<Array<THREE.Group | null>>([]);
  const gaugeFillRefs = useRef<Array<THREE.Mesh | null>>([]);

  const gaugeSlots = useMemo(
    () =>
      actors
        .slice(0, MAX_QUANTITY_GAUGES)
        .map((actor) => ({ actor_id: actor.id })),
    [actors],
  );

  useFrame(({ clock }) => {
    const p = runtimeProgress(clock.elapsedTime, moment, progress, autoLoop);
    const carriers: Array<{ position: [number, number, number] }> = [];
    const quantities = new Map<string, { value: number; actor: DirectorRuntimeActor; position: THREE.Vector3 }>();

    for (const actor of actors) {
      const sample = sampleDirectorActorState(moment, actor, p, actors, sceneState);
      for (const carrier of sample.process?.carriers ?? []) {
        carriers.push({ position: carrier.position });
      }
      if (sample.visible === false) continue;
      const processQuantities = sample.process?.quantities ?? {};
      const fill = processQuantities.fill_level;
      const accumulated = processQuantities.accumulated_amount;
      if (Number.isFinite(fill)) {
        quantities.set(actor.id, {
          value: clamp01(Number(fill)),
          actor,
          position: sample.position,
        });
      } else if (Number.isFinite(accumulated)) {
        const normalized = clamp01(Number(accumulated));
        quantities.set(actor.id, {
          value: clamp01(normalized),
          actor,
          position: sample.position,
        });
      }
    }

    for (let index = 0; index < MAX_CARRIERS; index += 1) {
      const mesh = carrierRefs.current[index];
      if (!mesh) continue;
      const carrier = carriers[index];
      mesh.visible = Boolean(carrier);
      if (carrier) mesh.position.set(...carrier.position);
    }

    gaugeSlots.forEach((slot, index) => {
      const group = gaugeRefs.current[index];
      const fillMesh = gaugeFillRefs.current[index];
      if (!group || !fillMesh) return;
      const quantity = quantities.get(slot.actor_id);
      group.visible = Boolean(quantity);
      if (!quantity) return;
      const height = Math.max(0.55, Math.abs(quantity.actor.size[1]) * 0.8);
      const xOffset = Math.max(0.36, Math.abs(quantity.actor.size[0]) * 0.7);
      group.position.set(
        quantity.position.x + xOffset,
        quantity.position.y + height * 0.5,
        quantity.position.z,
      );
      group.scale.setScalar(Math.max(0.6, Math.min(1.4, height)));
      fillMesh.scale.y = Math.max(0.02, quantity.value);
      fillMesh.position.y = -0.48 + quantity.value * 0.48;
    });
  });

  return (
    <group name="myway-director-process-runtime-overlay">
      {Array.from({ length: MAX_CARRIERS }, (_, index) => (
        <mesh
          key={`director-process-carrier-${index}`}
          ref={(node) => {
            carrierRefs.current[index] = node;
          }}
          visible={false}
          frustumCulled={false}
        >
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial
            color="#67e8f9"
            emissive="#0e7490"
            emissiveIntensity={0.55}
            roughness={0.3}
          />
        </mesh>
      ))}

      {gaugeSlots.map((slot, index) => (
        <group
          key={`director-process-quantity-${slot.actor_id}`}
          ref={(node) => {
            gaugeRefs.current[index] = node;
          }}
          visible={false}
        >
          <mesh>
            <boxGeometry args={[0.11, 1, 0.06]} />
            <meshBasicMaterial color="#e2e8f0" transparent opacity={0.18} wireframe />
          </mesh>
          <mesh
            ref={(node) => {
              gaugeFillRefs.current[index] = node;
            }}
          >
            <boxGeometry args={[0.075, 0.96, 0.04]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#075985"
              emissiveIntensity={0.35}
              transparent
              opacity={0.72}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
