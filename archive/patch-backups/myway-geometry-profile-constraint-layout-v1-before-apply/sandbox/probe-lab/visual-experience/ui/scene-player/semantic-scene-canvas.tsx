"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { PreparedSemanticScene, PreparedSemanticSceneEntity } from "./semantic-scene-layout";
import { ResolvedAssetModel } from "@/sandbox/probe-lab/scenes/ui";
import type { ResolvedSceneAssetBinding } from "@/sandbox/probe-lab/scenes/resolved-scene";
import type { Vec3 } from "./directed-scene-compiler";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function ease(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function materialForEntity(entity: PreparedSemanticSceneEntity, opacity = 1) {
  const isGlow = entity.event_types.includes("glow") || entity.motion_tracks.some((track) => track.kind === "glow");
  const isPop = entity.event_types.includes("pop") || entity.motion_tracks.some((track) => track.kind === "pop");
  const base = (() => {
    if (entity.selected) return { color: "#fde68a", emissive: "#92400e", emissiveIntensity: 0.5 };
    if (entity.is_action_target || isGlow || isPop) return { color: "#fbbf24", emissive: "#7c2d12", emissiveIntensity: isGlow || isPop ? 0.66 : 0.42 };
    if (entity.is_story_focus) return { color: "#38bdf8", emissive: "#075985", emissiveIntensity: 0.3 };
    if (entity.is_active) return { color: "#7dd3fc", emissive: "#075985", emissiveIntensity: 0.18 };
    if (entity.render_role === "transparent_container") return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.06 };
    if (entity.render_role === "particle_burst") return { color: "#fde68a", emissive: "#92400e", emissiveIntensity: 0.56 };
    if (entity.is_output_like) return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.08 };
    return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.05 };
  })();

  const transparentRole = entity.render_role === "transparent_container" || entity.render_role === "cylindrical_container" || entity.render_role === "particle_burst";

  return {
    ...base,
    transparent: transparentRole || opacity < 0.98,
    opacity: entity.render_role === "transparent_container" || entity.render_role === "cylindrical_container" ? Math.min(opacity, 0.28) : entity.render_role === "particle_burst" ? Math.min(opacity, 0.86) : opacity,
  };
}

function labelText(entity: PreparedSemanticSceneEntity) {
  if (!entity.display_name.includes("(")) return entity.display_name;
  return entity.display_name.replace(/\s*\([^)]*\)/g, "").trim() || entity.display_name;
}

function shouldShowLabel(entity: PreparedSemanticSceneEntity, storyMode: boolean, isPlaying: boolean) {
  if (entity.selected) return true;
  if (storyMode && isPlaying) return false;
  if (storyMode) return entity.is_story_focus || entity.is_action_target;
  return entity.should_show_label || entity.is_active;
}

function EntityLabel({
  entity,
  storyMode,
  isPlaying,
}: {
  entity: PreparedSemanticSceneEntity;
  storyMode: boolean;
  isPlaying: boolean;
}) {
  if (!shouldShowLabel(entity, storyMode, isPlaying)) return null;

  return (
    <Html
      center
      position={entity.label_anchor}
      distanceFactor={9}
      occlude={false}
      zIndexRange={[80, 20]}
    >
      <div
        style={{
          border: entity.selected ? "1px solid rgba(253,230,138,0.74)" : "1px solid rgba(255,255,255,0.14)",
          borderRadius: 999,
          padding: storyMode ? "0.18rem 0.42rem" : "0.24rem 0.46rem",
          color: "rgba(255,255,255,0.94)",
          background: entity.selected
            ? "rgba(180,83,9,0.72)"
            : entity.is_action_target || entity.is_story_focus
              ? "rgba(14,165,233,0.42)"
              : "rgba(2,6,23,0.52)",
          fontSize: storyMode ? 9 : 10,
          fontWeight: 740,
          whiteSpace: "nowrap",
          maxWidth: storyMode ? 180 : 210,
          overflow: "hidden",
          textOverflow: "ellipsis",
          boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
          pointerEvents: "none",
        }}
      >
        {labelText(entity)}
      </div>
    </Html>
  );
}

function directionVector(direction: string | undefined, axis: string | undefined): Vec3 {
  if (direction === "down") return [0, -1, 0];
  if (direction === "up") return [0, 1, 0];
  if (direction === "left") return [-1, 0, 0];
  if (direction === "right") return [1, 0, 0];
  if (direction === "forward") return [0, 0, -1];
  if (direction === "back") return [0, 0, 1];
  if (axis === "x") return [1, 0, 0];
  if (axis === "z") return [0, 0, 1];
  return [0, -1, 0];
}

function animatedOffset(entity: PreparedSemanticSceneEntity, progress: number): Vec3 {
  let offset: Vec3 = [0, 0, 0];
  const t = ease(progress);

  for (const track of entity.motion_tracks) {
    if (track.kind !== "slide") continue;
    const direction = directionVector(track.direction, track.axis);
    const amount = track.amount ?? 0.7;
    offset = [offset[0] + direction[0] * amount * t, offset[1] + direction[1] * amount * t, offset[2] + direction[2] * amount * t];
  }

  return offset;
}

function animatedPosition(entity: PreparedSemanticSceneEntity, progress: number): Vec3 {
  const offset = animatedOffset(entity, progress);
  return [entity.position[0] + offset[0], entity.position[1] + offset[1], entity.position[2] + offset[2]];
}

function actionOpacity(entity: PreparedSemanticSceneEntity, progress: number) {
  if (entity.motion_tracks.some((track) => track.kind === "fade")) return Math.max(0.22, ease(progress));
  if (entity.action_types.includes("fade_out")) return Math.max(0.18, 1 - progress * 0.76);
  return 1;
}

function animatedScale(entity: PreparedSemanticSceneEntity, progress: number) {
  const t = ease(progress);
  const isPop = entity.motion_tracks.some((track) => track.kind === "pop") || entity.event_types.includes("pop");
  const isGlow = entity.motion_tracks.some((track) => track.kind === "glow") || entity.event_types.includes("glow");
  const pulse = entity.is_action_target || entity.is_story_focus || isGlow ? Math.sin(progress * Math.PI) * 0.1 : 0;
  const pop = isPop ? Math.sin(progress * Math.PI) * 0.68 : 0;
  const base = entity.selected ? 1.22 : entity.is_active ? 1.04 + pulse : 1;
  return base + pop * (1 - t * 0.25);
}

function animatedRotation(entity: PreparedSemanticSceneEntity, progress: number) {
  const rotation: Vec3 = [0, 0, 0];
  const t = ease(progress);
  for (const track of entity.motion_tracks) {
    if (track.kind !== "rotate" && track.kind !== "transform") continue;
    const amount = track.rotate_amount ?? Math.PI * 2;
    if (track.rotate_axis === "x") rotation[0] += amount * t;
    else if (track.rotate_axis === "y") rotation[1] += amount * t;
    else rotation[2] += amount * t;
  }
  if (entity.render_role === "rotating_body" && entity.is_active) rotation[2] += t * Math.PI * 1.5;
  return rotation;
}

function SelectionHalo({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  if (!entity.selected && !entity.is_action_target && !entity.is_story_focus) return null;

  const radius = Math.max(entity.scale[0], entity.scale[2], 0.46) * 0.62;
  const pulse = entity.is_action_target ? Math.sin(progress * Math.PI) * 0.1 : 0;

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
      <torusGeometry args={[radius + pulse, 0.014, 8, 64]} />
      <meshBasicMaterial
        color={entity.selected ? "#fde68a" : entity.is_story_focus ? "#67e8f9" : "#fef3c7"}
        transparent
        opacity={entity.selected ? 0.72 : 0.48}
      />
    </mesh>
  );
}

function beadOffsets(count: number): Array<Vec3> {
  if (count <= 1) return [[0, 0, 0]];
  if (count === 2) return [[-0.18, 0, 0], [0.18, 0, 0]];
  if (count === 3) return [[-0.23, 0, 0], [0, 0.04, 0], [0.23, 0, 0]];

  const offsets: Array<Vec3> = [];
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 0.2;
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    offsets.push([(col - (columns - 1) / 2) * spacing, 0, (row - 0.5) * spacing]);
  }
  return offsets;
}

function BeadCluster({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const opacity = actionOpacity(entity, progress);
  const material = materialForEntity(entity, opacity);
  const offsets = beadOffsets(entity.unit_count);
  const beadRadius = entity.unit_count > 4 ? 0.13 : entity.unit_count > 1 ? 0.16 : 0.34;
  const rearrange = entity.action_types.includes("highlight_entity") ? Math.sin(progress * Math.PI) * 0.06 : 0;

  return (
    <group>
      {offsets.map((offset, index) => (
        <mesh
          key={`${entity.id}-bead-${index}`}
          position={[
            offset[0] + rearrange * Math.sin(index + 1),
            offset[1] + rearrange * 0.35,
            offset[2] + rearrange * Math.cos(index + 1),
          ]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[beadRadius, 28, 28]} />
          <meshStandardMaterial {...material} roughness={0.34} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function Starburst({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const scale = 0.78 + Math.sin(progress * Math.PI) * 0.48;

  return (
    <group scale={scale}>
      <mesh castShadow>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial {...material} roughness={0.24} metalness={0.12} />
      </mesh>
      {Array.from({ length: 10 }).map((_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <mesh key={`${entity.id}-ray-${index}`} position={[Math.cos(angle) * 0.34, Math.sin(angle) * 0.34, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.18, 0.028, 0.028]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.45} />
          </mesh>
        );
      })}
    </group>
  );
}

function CylindricalContainer({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));

  return (
    <group>
      <mesh castShadow receiveShadow scale={entity.scale}>
        <cylinderGeometry args={[0.5, 0.5, 1, 48, 1, true]} />
        <meshStandardMaterial {...material} roughness={0.18} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh scale={[entity.scale[0] * 1.02, entity.scale[1] * 1.02, entity.scale[2] * 1.02]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 48, 1, true]} />
        <meshBasicMaterial color="#bfdbfe" transparent opacity={0.24} wireframe side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function PistonBody({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));

  return (
    <group scale={entity.scale}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 1, 56]} />
        <meshStandardMaterial {...material} roughness={0.42} metalness={0.35} />
      </mesh>
      {[-0.42, -0.2, 0.2, 0.42].map((y) => (
        <mesh key={`${entity.id}-ring-${y}`} position={[0, y, 0]}>
          <torusGeometry args={[0.51, 0.014, 8, 56]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.44} />
        </mesh>
      ))}
    </group>
  );
}

function WheelBody({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const glow = entity.event_types.includes("glow") || entity.motion_tracks.some((track) => track.kind === "glow");

  return (
    <group scale={entity.scale}>
      <mesh>
        <torusGeometry args={[0.48, 0.055, 16, 80]} />
        <meshStandardMaterial {...material} roughness={0.34} metalness={0.24} />
      </mesh>
      {Array.from({ length: 6 }).map((_, index) => (
        <mesh key={`${entity.id}-spoke-${index}`} rotation={[0, 0, (index / 6) * Math.PI]}>
          <boxGeometry args={[0.86, 0.018, 0.028]} />
          <meshStandardMaterial {...material} roughness={0.36} metalness={0.18} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial {...material} roughness={0.3} metalness={0.3} />
      </mesh>
      {glow ? (
        <mesh>
          <torusGeometry args={[0.6 + Math.sin(progress * Math.PI) * 0.06, 0.018, 12, 80]} />
          <meshBasicMaterial color="#fef3c7" transparent opacity={0.38} />
        </mesh>
      ) : null}
    </group>
  );
}

function ShaftBody({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const crankAngle = progress * Math.PI * 2;

  return (
    <group scale={entity.scale}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 1.15, 24]} />
        <meshStandardMaterial {...material} roughness={0.28} metalness={0.34} />
      </mesh>
      <group rotation={[0, 0, crankAngle]}>
        <mesh position={[0.28, 0, 0]}>
          <sphereGeometry args={[0.08, 20, 20]} />
          <meshStandardMaterial color="#fde68a" emissive="#92400e" emissiveIntensity={0.52} />
        </mesh>
        <Line points={[[0, 0, 0], [0.28, 0, 0]]} color="#fef3c7" lineWidth={3} transparent opacity={0.82} />
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.02, 8, 64]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function RotatingBody({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const glow = entity.event_types.includes("glow") || entity.motion_tracks.some((track) => track.kind === "glow");

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.055, 16, 72]} />
        <meshStandardMaterial {...material} roughness={0.32} metalness={0.22} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial {...material} roughness={0.24} metalness={0.28} />
      </mesh>
      <mesh position={[0.32, 0.04, 0]}>
        <sphereGeometry args={[0.08, 18, 18]} />
        <meshStandardMaterial color="#fde68a" emissive="#92400e" emissiveIntensity={0.45 + Math.sin(progress * Math.PI) * 0.24} />
      </mesh>
      {glow ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.54 + Math.sin(progress * Math.PI) * 0.06, 0.018, 12, 72]} />
          <meshBasicMaterial color="#fef3c7" transparent opacity={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}

function PrimitiveEntity({
  entity,
  onSelectEntity,
  progress,
  storyMode,
  isPlaying,
}: {
  entity: PreparedSemanticSceneEntity;
  onSelectEntity?: (entityId: string) => void;
  progress: number;
  storyMode: boolean;
  isPlaying: boolean;
}) {
  if (entity.render_role === "connector" || entity.render_role === "rod_connector") return null;

  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const desiredScale = animatedScale(entity, progress);
  const rotation = animatedRotation(entity, progress);
  const targetPosition = useMemo(() => new THREE.Vector3(...animatedPosition(entity, progress)), [entity, progress]);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const damp = Math.min(1, delta * 5.8);
    groupRef.current.position.lerp(targetPosition, damp);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, rotation[0], damp);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotation[1], damp);
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, rotation[2], damp);
    const nextScale = THREE.MathUtils.lerp(groupRef.current.scale.x, desiredScale, damp);
    groupRef.current.scale.setScalar(nextScale);
  });

  const clickProps = {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelectEntity?.(entity.id);
    },
  };

  if (
    entity.render_kind === "registered_asset" &&
    entity.resolved_asset
  ) {
    const binding: ResolvedSceneAssetBinding = {
      instance_id: entity.id,
      concept: entity.display_name,
      asset_id: entity.resolved_asset.asset_id,
      public_path: entity.resolved_asset.public_path,
      source_type:
        entity.resolved_asset.source_type as ResolvedSceneAssetBinding["source_type"],
      scene_review_status:
        entity.resolved_asset.scene_review_status,
      dimensions_m:
        entity.resolved_asset.dimensions_m,
      default_scale:
        entity.resolved_asset.default_scale,
      default_rotation:
        entity.resolved_asset.default_rotation,
      ground_offset_m:
        entity.resolved_asset.ground_offset_m,
      target_extent_m: 1,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      replacement_node_ids: [],
      placement_relation: "absolute",
      placement_anchor: "center",
      placement_offset: [0, 0, 0],
      clearance_m: 0.01,
      preview_only: false,
      match_score:
        entity.resolved_asset.match_score ?? null,
      match_margin: null,
      candidate_scores: [],
    };

    return (
      <group
        ref={groupRef}
        position={targetPosition.toArray()}
        scale={desiredScale}
        {...clickProps}
      >
        <SelectionHalo
          entity={entity}
          progress={progress}
        />
        <ResolvedAssetModel
          binding={binding}
          active={
            entity.is_active ||
            entity.selected
          }
          positionOverride={[0, 0, 0]}
          targetExtentOverride={1}
        />
        <EntityLabel
          entity={entity}
          storyMode={storyMode}
          isPlaying={isPlaying}
        />
      </group>
    );
  }

  if (entity.render_role === "cylindrical_container") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <CylindricalContainer entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "piston_body") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <PistonBody entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "wheel_body") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <WheelBody entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "shaft_body") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <ShaftBody entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "transparent_container") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <mesh castShadow receiveShadow scale={entity.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial {...material} roughness={0.22} metalness={0.05} wireframe={false} />
        </mesh>
        <mesh scale={[entity.scale[0] * 1.02, entity.scale[1] * 1.02, entity.scale[2] * 1.02]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={0.18} wireframe />
        </mesh>
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "particle_burst" || entity.render_kind === "particle") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <Starburst entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_role === "rotating_body") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <RotatingBody entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_kind === "path") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.15, 0.025, 12, 96]} />
          <meshStandardMaterial color="#38bdf8" emissive="#082f49" emissiveIntensity={0.24} transparent opacity={0.86} />
        </mesh>
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_kind === "box" || entity.render_role === "moving_body" || entity.render_role === "solid_body") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <mesh castShadow receiveShadow scale={entity.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial {...material} roughness={0.5} metalness={0.08} />
        </mesh>
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  return (
    <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
      <SelectionHalo entity={entity} progress={progress} />
      <BeadCluster entity={entity} progress={progress} />
      <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
    </group>
  );
}

function ConnectorLines({ scene, progress }: { scene: PreparedSemanticScene; progress: number }) {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const connectors = scene.entities.filter((entity) => (entity.render_role === "connector" || entity.render_role === "rod_connector") && entity.connector_from_id && entity.connector_to_id);

  return (
    <>
      {connectors.map((connector) => {
        const from = byId.get(String(connector.connector_from_id));
        const to = byId.get(String(connector.connector_to_id));
        const start = from ? animatedPosition(from, progress) : connector.connector_from_position;
        const end = to ? animatedPosition(to, progress) : connector.connector_to_position;
        if (!start || !end) return null;
        const midpoint: Vec3 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
        const active = connector.is_active || connector.is_action_target || connector.render_role === "rod_connector";
        return (
          <group key={`${connector.id}-connector`}>
            <Line
              points={[start, midpoint, end]}
              color={active ? "#fbbf24" : "#93c5fd"}
              lineWidth={active ? 5 : 3}
              transparent
              opacity={active ? 0.92 : 0.54}
            />
            <mesh position={midpoint}>
              <sphereGeometry args={[active ? 0.07 : 0.05, 16, 16]} />
              <meshBasicMaterial color={active ? "#fef3c7" : "#bfdbfe"} transparent opacity={active ? 0.86 : 0.5} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function RelationshipLines({ scene, progress }: { scene: PreparedSemanticScene; progress: number }) {
  const byId = new Map(scene.entities.map((entity) => [entity.id, entity]));

  return (
    <>
      {scene.relationships.flatMap((relationship) => {
        const source = byId.get(relationship.source_entity_id);
        if (!source) return [];

        return relationship.target_entity_ids.flatMap((targetId) => {
          const target = byId.get(targetId);
          if (!target) return [];

          const sourcePosition = animatedPosition(source, progress);
          const targetPosition = animatedPosition(target, progress);
          const active = source.is_active || target.is_active;
          const isCausal = relationship.relationship_type === "causes" || relationship.relationship_type === "becomes";

          return [
            <Line
              key={`${relationship.id}-${targetId}`}
              points={[
                [sourcePosition[0], sourcePosition[1] + 0.08, sourcePosition[2]],
                [(sourcePosition[0] + targetPosition[0]) / 2, (sourcePosition[1] + targetPosition[1]) / 2 + 0.18, (sourcePosition[2] + targetPosition[2]) / 2],
                [targetPosition[0], targetPosition[1] + 0.08, targetPosition[2]],
              ]}
              color={active ? "#fbbf24" : isCausal ? "#7dd3fc" : "#94a3b8"}
              lineWidth={active ? 2.4 : 1.1}
              transparent
              opacity={active ? 0.58 : 0.12}
            />,
          ];
        });
      })}
    </>
  );
}

function TraceLines({ scene, progress }: { scene: PreparedSemanticScene; progress: number }) {
  const tracing = scene.entities.filter((entity) => entity.event_types.includes("trace") || entity.motion_tracks.some((track) => track.kind === "trace"));
  if (!tracing.length) return null;

  return (
    <>
      {tracing.map((entity) => {
        const path = scene.entities.filter((candidate) => candidate.is_active || candidate.is_action_target || candidate.is_story_focus);
        const points = path.length >= 2 ? path.map((candidate) => animatedPosition(candidate, progress)) : [entity.position, animatedPosition(entity, progress)];
        return <Line key={`${entity.id}-trace`} points={points} color="#fef3c7" lineWidth={4} transparent opacity={0.72} />;
      })}
    </>
  );
}

function BeatActionHints({ scene, progress }: { scene: PreparedSemanticScene; progress: number }) {
  const targets = scene.actions
    .map((action) => scene.entities.find((entity) => entity.id === action.target_entity_id))
    .filter((entity): entity is PreparedSemanticSceneEntity => Boolean(entity))
    .slice(0, 4);

  return (
    <>
      {targets.map((entity, index) => {
        if (entity.render_role === "connector" || entity.render_role === "rod_connector") return null;
        const position = animatedPosition(entity, progress);
        return (
          <group key={`${entity.id}-pulse-${index}`} position={position}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[Math.max(entity.scale[0], entity.scale[2], 0.46) * 0.62 + index * 0.04 + Math.sin(progress * Math.PI) * 0.07, 0.012, 8, 48]} />
              <meshBasicMaterial color="#fef3c7" transparent opacity={0.32} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function getDirectedCameraNotes(scene: PreparedSemanticScene) {
  const beat = asRecord(scene.directed_story_beat);
  const camera = asRecord(beat?.camera);
  const shotType = text(camera?.shot_type, scene.camera.shot_type).toLowerCase();
  const movement = text(camera?.movement, scene.camera.movement).toLowerCase();
  return { shotType, movement };
}

function CameraRig({ scene, isPlaying, storyMode }: { scene: PreparedSemanticScene; isPlaying: boolean; storyMode: boolean }) {
  const { camera } = useThree();
  const lookTarget = useMemo(() => new THREE.Vector3(...scene.camera.target), [scene.camera.target]);
  const wide = useMemo(() => new THREE.Vector3(...scene.camera.wide_position), [scene.camera.wide_position]);
  const close = useMemo(() => new THREE.Vector3(...scene.camera.close_position), [scene.camera.close_position]);
  const targetRef = useRef(new THREE.Vector3(...scene.camera.target));
  const directedCamera = useMemo(() => getDirectedCameraNotes(scene), [scene]);

  useFrame((state, delta) => {
    if (!storyMode && !isPlaying) return;

    let blend = isPlaying ? 0.36 + Math.sin(state.clock.elapsedTime * 0.42) * 0.08 : 0.2;
    let orbitAmount = isPlaying ? 0.08 : 0.03;

    if (directedCamera.shotType.includes("wide")) blend = 0.08;
    if (directedCamera.shotType.includes("close") || directedCamera.shotType.includes("push")) blend = 0.88;
    if (directedCamera.shotType.includes("medium")) blend = 0.48;
    if (directedCamera.shotType.includes("pull")) blend = 0.18;
    if (directedCamera.movement.includes("orbit")) orbitAmount += 0.12;

    const desired = wide.clone().lerp(close, blend);

    if (directedCamera.movement.includes("side") || directedCamera.movement.includes("profile")) {
      desired.x = lookTarget.x + 3.6;
      desired.y = Math.max(1.8, desired.y * 0.74);
      desired.z = lookTarget.z + 3.4;
    }

    if (directedCamera.movement.includes("orbit")) {
      const angle = state.clock.elapsedTime * orbitAmount + scene.active_beat_index * 0.22;
      desired.x += Math.cos(angle) * 0.32;
      desired.z += Math.sin(angle) * 0.32;
    }

    camera.position.lerp(desired, Math.min(1, delta * 2.4));
    targetRef.current.lerp(lookTarget, Math.min(1, delta * 2.6));
    camera.lookAt(targetRef.current);
  });

  return null;
}

export function SemanticSceneCanvas({
  scene,
  selectedEntityId,
  onSelectEntity,
  storyCaption,
  storyProgress,
  storyMode,
  isPlaying,
}: {
  scene: PreparedSemanticScene;
  selectedEntityId?: string | null;
  onSelectEntity?: (entityId: string | null) => void;
  storyCaption?: string;
  storyProgress?: number;
  storyMode?: boolean;
  isPlaying?: boolean;
}) {
  const normalizedProgress = Math.max(0.08, Math.min(1, storyProgress ?? 1));
  const easedProgress = ease(normalizedProgress);
  const captionText = storyMode
    ? storyCaption || ""
    : scene.active_narration_text || scene.orientation_text || scene.target_takeaway;
  const showCaption = captionText.trim().length > 0;

  return (
    <div
      style={{
        height: 620,
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 24,
        overflow: "hidden",
        position: "relative",
        background: "radial-gradient(circle at top, rgba(14,165,233,0.18), rgba(2,6,23,0.96) 62%)",
      }}
    >
      <Canvas
        camera={{ position: scene.camera.wide_position, fov: 44 }}
        dpr={[1, 1.5]}
        onPointerMissed={() => onSelectEntity?.(null)}
      >
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={1.02} />
        <directionalLight position={[4, 6, 5]} intensity={2.45} />
        <directionalLight position={[-4, 2, -5]} intensity={0.8} />
        <gridHelper args={[7, 14, "#334155", "#1e293b"]} position={[0, -2.28, 0]} />
        <CameraRig scene={scene} isPlaying={Boolean(isPlaying)} storyMode={Boolean(storyMode)} />
        <RelationshipLines scene={scene} progress={easedProgress} />
        <ConnectorLines scene={scene} progress={easedProgress} />
        <TraceLines scene={scene} progress={easedProgress} />
        {scene.entities.map((entity) => (
          <PrimitiveEntity
            key={entity.id}
            entity={{ ...entity, selected: selectedEntityId === entity.id }}
            onSelectEntity={onSelectEntity ?? undefined}
            progress={easedProgress}
            storyMode={Boolean(storyMode)}
            isPlaying={Boolean(isPlaying)}
          />
        ))}
        <BeatActionHints scene={scene} progress={easedProgress} />
        <OrbitControls makeDefault enablePan enableZoom enableRotate enabled={!isPlaying} />
      </Canvas>

      {scene.faithfulness_warnings.length ? (
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            maxWidth: 360,
            borderRadius: 16,
            padding: "10px 12px",
            background: "rgba(120,53,15,0.54)",
            border: "1px solid rgba(251,191,36,0.28)",
            color: "rgba(255,255,255,0.86)",
            fontSize: 12,
            lineHeight: 1.45,
            pointerEvents: "none",
          }}
        >
          <strong>Compiler warning:</strong> {scene.faithfulness_warnings[0]}
        </div>
      ) : null}

      {showCaption ? (
        <div
          style={{
            position: "absolute",
            left: 22,
            right: 22,
            bottom: 18,
            display: "grid",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: `${Math.max(8, Math.min(100, normalizedProgress * 100))}%`,
              height: 3,
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(125,211,252,0.35), rgba(251,191,36,0.92))",
              boxShadow: "0 0 22px rgba(251,191,36,0.28)",
            }}
          />
          <div
            style={{
              maxWidth: storyMode ? 360 : 920,
              margin: storyMode ? "0 auto" : undefined,
              borderRadius: 18,
              padding: storyMode ? "10px 14px" : "12px 14px",
              background: "linear-gradient(135deg, rgba(2,6,23,0.74), rgba(15,23,42,0.64))",
              border: "1px solid rgba(125,211,252,0.2)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                color: "white",
                fontSize: storyMode ? 30 : 18,
                lineHeight: storyMode ? 1.16 : 1.45,
                fontWeight: 850,
                letterSpacing: storyMode ? "0.01em" : undefined,
                textAlign: storyMode ? "center" : "left",
                minHeight: storyMode ? 74 : undefined,
                textShadow: "0 2px 24px rgba(0,0,0,0.72)",
              }}
            >
              {captionText}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
