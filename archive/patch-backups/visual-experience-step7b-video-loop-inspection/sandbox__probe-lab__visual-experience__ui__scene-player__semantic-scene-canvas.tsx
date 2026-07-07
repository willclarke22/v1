"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import type { PreparedSemanticScene, PreparedSemanticSceneEntity } from "./semantic-scene-layout";

function materialForEntity(entity: PreparedSemanticSceneEntity) {
  if (entity.is_action_target) return { color: "#fbbf24", emissive: "#7c2d12", emissiveIntensity: 0.35 };
  if (entity.is_active) return { color: "#38bdf8", emissive: "#075985", emissiveIntensity: 0.2 };
  if (entity.render_kind === "particle") return { color: "#c4b5fd", emissive: "#4c1d95", emissiveIntensity: 0.16 };
  if (entity.render_kind === "path") return { color: "#7dd3fc", emissive: "#0f172a", emissiveIntensity: 0.05 };
  return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.05 };
}

function EntityLabel({ entity }: { entity: PreparedSemanticSceneEntity }) {
  return (
    <Html center position={[0, 0.62, 0]} distanceFactor={8} occlude={false}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 999,
          padding: "0.28rem 0.52rem",
          color: "rgba(255,255,255,0.92)",
          background: entity.is_active ? "rgba(14,165,233,0.46)" : "rgba(2,6,23,0.68)",
          fontSize: 11,
          fontWeight: 750,
          whiteSpace: "nowrap",
          boxShadow: "0 10px 30px rgba(0,0,0,0.32)",
        }}
      >
        {entity.display_name}
      </div>
    </Html>
  );
}

function PrimitiveEntity({ entity }: { entity: PreparedSemanticSceneEntity }) {
  const material = materialForEntity(entity);
  const scale = entity.is_active ? 1.14 : 1;
  const position = new THREE.Vector3(...entity.position);

  if (entity.render_kind === "path") {
    return (
      <group position={position}>
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
      <group position={position} scale={scale}>
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
      <group position={position} scale={scale}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial {...material} roughness={0.32} metalness={0.08} />
        </mesh>
        <EntityLabel entity={entity} />
      </group>
    );
  }

  if (entity.render_kind === "arrow") {
    return (
      <group position={position} scale={scale}>
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
    <group position={position} scale={scale}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.34, 32, 32]} />
        <meshStandardMaterial {...material} roughness={0.38} metalness={0.08} />
      </mesh>
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

          return [
            <Line
              key={`${relationship.id}-${targetId}`}
              points={[
                [source[0], source[1] + 0.08, source[2]],
                [target[0], target[1] + 0.08, target[2]],
              ]}
              color={active ? "#fbbf24" : "#94a3b8"}
              lineWidth={active ? 2.5 : 1.2}
              transparent
              opacity={active ? 0.75 : 0.24}
            />,
          ];
        });
      })}
    </>
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
            <meshBasicMaterial color="#fef3c7" transparent opacity={0.45} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function SemanticSceneCanvas({ scene }: { scene: PreparedSemanticScene }) {
  return (
    <div
      style={{
        height: 520,
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 24,
        overflow: "hidden",
        background: "radial-gradient(circle at top, rgba(14,165,233,0.18), rgba(2,6,23,0.96) 62%)",
      }}
    >
      <Canvas camera={{ position: [4.8, 3.9, 5.2], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 6, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, -5]} intensity={0.8} />
        <gridHelper args={[7, 14, "#334155", "#1e293b"]} position={[0, -0.32, 0]} />
        <RelationshipLines scene={scene} />
        {scene.entities.map((entity) => <PrimitiveEntity key={entity.id} entity={entity} />)}
        <BeatActionHints scene={scene} />
        <OrbitControls makeDefault enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}
