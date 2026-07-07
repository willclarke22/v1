"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { PreparedSemanticScene, PreparedSemanticSceneEntity } from "./semantic-scene-layout";

function materialForEntity(entity: PreparedSemanticSceneEntity) {
  if (entity.selected) return { color: "#fde68a", emissive: "#92400e", emissiveIntensity: 0.44 };
  if (entity.is_action_target) return { color: "#fbbf24", emissive: "#7c2d12", emissiveIntensity: 0.35 };
  if (entity.is_active) return { color: "#38bdf8", emissive: "#075985", emissiveIntensity: 0.2 };
  if (entity.render_kind === "particle") return { color: "#c4b5fd", emissive: "#4c1d95", emissiveIntensity: 0.16 };
  if (entity.render_kind === "path") return { color: "#7dd3fc", emissive: "#0f172a", emissiveIntensity: 0.05 };
  return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.05 };
}

function labelText(entity: PreparedSemanticSceneEntity) {
  if (!entity.display_name.includes("(")) return entity.display_name;
  return entity.display_name.replace(/\s*\([^)]*\)/g, "").trim() || entity.display_name;
}

function EntityLabel({ entity }: { entity: PreparedSemanticSceneEntity }) {
  return (
    <Html center position={[0, 0.72, 0]} distanceFactor={8} occlude={false}>
      <div
        style={{
          border: entity.selected ? "1px solid rgba(253,230,138,0.74)" : "1px solid rgba(255,255,255,0.2)",
          borderRadius: 999,
          padding: "0.28rem 0.52rem",
          color: "rgba(255,255,255,0.94)",
          background: entity.selected
            ? "rgba(180,83,9,0.72)"
            : entity.is_active
              ? "rgba(14,165,233,0.46)"
              : "rgba(2,6,23,0.68)",
          fontSize: 11,
          fontWeight: 750,
          whiteSpace: "nowrap",
          boxShadow: "0 10px 30px rgba(0,0,0,0.32)",
        }}
      >
        {labelText(entity)}
      </div>
    </Html>
  );
}

function usePointerCursor() {
  return {
    onPointerOver: () => {
      if (typeof document !== "undefined") document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      if (typeof document !== "undefined") document.body.style.cursor = "default";
    },
  };
}

function SelectionHalo({ entity }: { entity: PreparedSemanticSceneEntity }) {
  if (!entity.selected && !entity.is_action_target) return null;

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
      <torusGeometry args={[entity.unit_count > 1 ? 0.58 : 0.48, 0.014, 8, 64]} />
      <meshBasicMaterial color={entity.selected ? "#fde68a" : "#fef3c7"} transparent opacity={entity.selected ? 0.72 : 0.46} />
    </mesh>
  );
}

function beadOffsets(count: number): Array<[number, number, number]> {
  if (count <= 1) return [[0, 0, 0]];
  if (count === 2) return [[-0.18, 0, 0], [0.18, 0, 0]];
  if (count === 3) return [[-0.23, 0, 0], [0, 0.04, 0], [0.23, 0, 0]];

  const offsets: Array<[number, number, number]> = [];
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 0.2;
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    offsets.push([(col - (columns - 1) / 2) * spacing, 0, (row - 0.5) * spacing]);
  }
  return offsets;
}

function BeadCluster({ entity }: { entity: PreparedSemanticSceneEntity }) {
  const material = materialForEntity(entity);
  const offsets = beadOffsets(entity.unit_count);
  const beadRadius = entity.unit_count > 4 ? 0.13 : entity.unit_count > 1 ? 0.16 : 0.34;

  return (
    <group>
      {offsets.map((offset, index) => (
        <mesh key={`${entity.id}-bead-${index}`} position={offset} castShadow receiveShadow>
          <sphereGeometry args={[beadRadius, 28, 28]} />
          <meshStandardMaterial {...material} roughness={0.34} metalness={0.08} transparent opacity={entity.render_kind === "particle" ? 0.78 : 1} />
        </mesh>
      ))}
    </group>
  );
}

function PrimitiveEntity({
  entity,
  onSelectEntity,
}: {
  entity: PreparedSemanticSceneEntity;
  onSelectEntity?: (entityId: string) => void;
}) {
  const material = materialForEntity(entity);
  const scale = entity.selected ? 1.22 : entity.is_active ? 1.12 : 1;
  const position = new THREE.Vector3(...entity.position);
  const pointerProps = usePointerCursor();
  const clickProps = {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelectEntity?.(entity.id);
    },
    ...pointerProps,
  };

  if (entity.render_kind === "path") {
    return (
      <group position={position} {...clickProps}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.15, 0.025, 12, 96]} />
          <meshStandardMaterial color="#38bdf8" emissive="#082f49" emissiveIntensity={0.24} transparent opacity={0.86} />
        </mesh>
        <mesh position={[0, 0.03, -2.15]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.14, 0.34, 24]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#075985" emissiveIntensity={0.3} />
        </mesh>
        <EntityLabel entity={entity} />
      </group>
    );
  }

  if (entity.render_kind === "box") {
    return (
      <group position={position} scale={scale} {...clickProps}>
        <SelectionHalo entity={entity} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.42, 0.58]} />
          <meshStandardMaterial {...material} roughness={0.5} metalness={0.05} />
        </mesh>
        <EntityLabel entity={entity} />
      </group>
    );
  }

  if (entity.render_kind === "particle") {
    return (
      <group position={position} scale={scale} {...clickProps}>
        <SelectionHalo entity={entity} />
        <mesh castShadow>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial {...material} roughness={0.32} metalness={0.08} transparent opacity={0.78} />
        </mesh>
        <EntityLabel entity={entity} />
      </group>
    );
  }

  if (entity.render_kind === "arrow") {
    return (
      <group position={position} scale={scale} {...clickProps}>
        <SelectionHalo entity={entity} />
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.18, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.78, 18]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.32, 0, 0]}>
          <coneGeometry args={[0.16, 0.34, 24]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <EntityLabel entity={entity} />
      </group>
    );
  }

  return (
    <group position={position} scale={scale} {...clickProps}>
      <SelectionHalo entity={entity} />
      <BeadCluster entity={entity} />
      <EntityLabel entity={entity} />
    </group>
  );
}

function RelationshipLines({ scene }: { scene: PreparedSemanticScene }) {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity.position]));

  return (
    <>
      {scene.relationships.flatMap((relationship) => {
        const source = byId.get(relationship.source_entity_id);
        if (!source) return [];

        return relationship.target_entity_ids.flatMap((targetId) => {
          const target = byId.get(targetId);
          if (!target) return [];

          const active = scene.active_beat?.active_entity_ids.includes(relationship.source_entity_id) ||
            scene.active_beat?.active_entity_ids.includes(targetId);
          const isCycleBack = relationship.relationship_type === "cycles_back";
          const isLeaves = relationship.relationship_type === "leaves";

          return [
            <Line
              key={`${relationship.id}-${targetId}`}
              points={[
                [source[0], source[1] + 0.08, source[2]],
                [(source[0] + target[0]) / 2, 0.18 + (isCycleBack ? 0.48 : 0.14), (source[2] + target[2]) / 2],
                [target[0], target[1] + 0.08, target[2]],
              ]}
              color={active ? "#fbbf24" : isLeaves ? "#c4b5fd" : "#94a3b8"}
              lineWidth={active ? 2.8 : isCycleBack ? 1.8 : 1.15}
              transparent
              opacity={active ? 0.82 : isCycleBack ? 0.36 : 0.22}
            />,
          ];
        });
      })}
    </>
  );
}

function LoopTrack({ scene }: { scene: PreparedSemanticScene }) {
  if (!scene.has_loop_layout || !scene.loop_points.length) return null;

  const progressIndex = Math.max(3, Math.round((scene.active_beat_index + 1) / Math.max(1, scene.beat_count) * 96));
  const progressPoints = scene.loop_points.slice(0, Math.min(scene.loop_points.length, progressIndex + 1));
  const marker = scene.active_loop_position;

  return (
    <group>
      <Line points={scene.loop_points} color="#38bdf8" lineWidth={1.5} transparent opacity={0.36} />
      <Line points={progressPoints} color="#fbbf24" lineWidth={4} transparent opacity={0.82} />
      {marker ? (
        <group position={[marker[0], 0.04, marker[2]]}>
          <mesh>
            <sphereGeometry args={[0.09, 24, 24]} />
            <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.7} />
          </mesh>
          <Html center position={[0, 0.32, 0]} distanceFactor={8}>
            <div
              style={{
                borderRadius: 999,
                padding: "0.22rem 0.45rem",
                background: "rgba(146,64,14,0.82)",
                color: "white",
                fontSize: 10,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              current step
            </div>
          </Html>
        </group>
      ) : null}
    </group>
  );
}

function BeatActionHints({ scene }: { scene: PreparedSemanticScene }) {
  const targets = scene.actions
    .map((action) => scene.entities.find((entity) => entity.id === action.target_entity_id))
    .filter((entity): entity is PreparedSemanticSceneEntity => Boolean(entity))
    .slice(0, 4);

  return (
    <>
      {targets.map((entity, index) => (
        <group key={`${entity.id}-pulse-${index}`} position={entity.position}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.52 + index * 0.04, 0.012, 8, 48]} />
            <meshBasicMaterial color="#fef3c7" transparent opacity={0.52} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function SemanticSceneCanvas({
  scene,
  selectedEntityId,
  onSelectEntity,
}: {
  scene: PreparedSemanticScene;
  selectedEntityId?: string | null;
  onSelectEntity?: (entityId: string | null) => void;
}) {
  return (
    <div
      style={{
        height: 560,
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 24,
        overflow: "hidden",
        background: "radial-gradient(circle at top, rgba(14,165,233,0.18), rgba(2,6,23,0.96) 62%)",
      }}
    >
      <Canvas
        camera={{ position: scene.has_loop_layout ? [0, 5.7, 5.6] : [4.8, 3.9, 5.2], fov: 44 }}
        dpr={[1, 1.5]}
        onPointerMissed={() => onSelectEntity?.(null)}
      >
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 6, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, -5]} intensity={0.8} />
        <gridHelper args={[7, 14, "#334155", "#1e293b"]} position={[0, -0.32, 0]} />
        <LoopTrack scene={scene} />
        <RelationshipLines scene={scene} />
        {scene.entities.map((entity) => (
          <PrimitiveEntity key={entity.id} entity={{ ...entity, selected: selectedEntityId === entity.id }} onSelectEntity={onSelectEntity ?? undefined} />
        ))}
        <BeatActionHints scene={scene} />
        <OrbitControls makeDefault enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}
