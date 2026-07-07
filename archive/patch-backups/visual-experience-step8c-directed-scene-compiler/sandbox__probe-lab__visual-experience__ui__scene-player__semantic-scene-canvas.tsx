"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { PreparedSemanticScene, PreparedSemanticSceneEntity } from "./semantic-scene-layout";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function materialForEntity(entity: PreparedSemanticSceneEntity, opacity = 1) {
  const base = (() => {
    if (entity.selected) return { color: "#fde68a", emissive: "#92400e", emissiveIntensity: 0.48 };
    if (entity.is_action_target) return { color: "#fbbf24", emissive: "#7c2d12", emissiveIntensity: 0.42 };
    if (entity.is_story_focus) return { color: "#38bdf8", emissive: "#075985", emissiveIntensity: 0.28 };
    if (entity.is_active) return { color: "#7dd3fc", emissive: "#075985", emissiveIntensity: 0.18 };
    if (entity.render_kind === "particle") return { color: "#c4b5fd", emissive: "#4c1d95", emissiveIntensity: 0.22 };
    if (entity.render_kind === "path") return { color: "#7dd3fc", emissive: "#0f172a", emissiveIntensity: 0.05 };
    if (entity.is_output_like) return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.08 };
    return { color: "#dbeafe", emissive: "#0f172a", emissiveIntensity: 0.05 };
  })();

  return {
    ...base,
    transparent: opacity < 0.98 || entity.render_kind === "particle",
    opacity: entity.render_kind === "particle" ? Math.min(opacity, 0.86) : opacity,
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
      position={[0, entity.unit_count > 3 ? 0.62 : 0.72, 0]}
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

function SelectionHalo({ entity, progress }: { entity: PreparedSemanticSceneEntity; progress: number }) {
  if (!entity.selected && !entity.is_action_target && !entity.is_story_focus) return null;

  const baseRadius = entity.unit_count > 3 ? 0.66 : entity.unit_count > 1 ? 0.58 : 0.48;
  const pulse = entity.is_action_target ? Math.sin(progress * Math.PI) * 0.1 : 0;

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
      <torusGeometry args={[baseRadius + pulse, 0.014, 8, 64]} />
      <meshBasicMaterial
        color={entity.selected ? "#fde68a" : entity.is_story_focus ? "#67e8f9" : "#fef3c7"}
        transparent
        opacity={entity.selected ? 0.72 : 0.48}
      />
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

function actionOpacity(entity: PreparedSemanticSceneEntity, progress: number) {
  if (entity.action_types.includes("fade_out")) return Math.max(0.18, 1 - progress * 0.76);
  return 1;
}

function actionOffset(entity: PreparedSemanticSceneEntity, progress: number) {
  if (!entity.action_types.includes("move_entity")) return [0, 0, 0] as [number, number, number];

  const position = new THREE.Vector3(...entity.position);
  const direction = position.clone();
  direction.y = 0;
  if (direction.lengthSq() < 0.01) direction.set(1, 0, 0);
  direction.normalize();

  if (entity.is_output_like) {
    const eased = 1 - Math.pow(1 - progress, 2);
    return [direction.x * eased * 0.82, 0.1 + progress * 0.22, direction.z * eased * 0.82] as [number, number, number];
  }

  const entering = (1 - progress) * 0.95;
  return [-direction.x * entering, 0.05 * Math.sin(progress * Math.PI), -direction.z * entering] as [number, number, number];
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
  const scale = 0.88 + Math.sin(progress * Math.PI) * 0.22;

  return (
    <group scale={scale}>
      <mesh castShadow>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial {...material} roughness={0.24} metalness={0.12} />
      </mesh>
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <mesh key={`${entity.id}-ray-${index}`} position={[Math.cos(angle) * 0.34, 0, Math.sin(angle) * 0.34]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.18, 0.028, 0.028]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.45} />
          </mesh>
        );
      })}
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
  const material = materialForEntity(entity, actionOpacity(entity, progress));
  const pulse = entity.is_action_target || entity.is_story_focus ? Math.sin(progress * Math.PI) * 0.1 : 0;
  const desiredScale = entity.selected ? 1.22 : entity.is_active ? 1.08 + pulse : 1;
  const offset = actionOffset(entity, progress);
  const targetPosition = useMemo(
    () => new THREE.Vector3(entity.position[0] + offset[0], entity.position[1] + offset[1], entity.position[2] + offset[2]),
    [entity.position, offset],
  );
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const damp = Math.min(1, delta * 5.5);
    groupRef.current.position.lerp(targetPosition, damp);
    const nextScale = THREE.MathUtils.lerp(groupRef.current.scale.x, desiredScale, damp);
    groupRef.current.scale.setScalar(nextScale);
  });

  const clickProps = {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelectEntity?.(entity.id);
    },
  };

  if (entity.render_kind === "path") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} {...clickProps}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.15, 0.025, 12, 96]} />
          <meshStandardMaterial color="#38bdf8" emissive="#082f49" emissiveIntensity={0.24} transparent opacity={0.86} />
        </mesh>
        <mesh position={[0, 0.03, -2.15]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.14, 0.34, 24]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#075985" emissiveIntensity={0.3} />
        </mesh>
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_kind === "box") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.42, 0.58]} />
          <meshStandardMaterial {...material} roughness={0.5} metalness={0.05} />
        </mesh>
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_kind === "particle") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <Starburst entity={entity} progress={progress} />
        <EntityLabel entity={entity} storyMode={storyMode} isPlaying={isPlaying} />
      </group>
    );
  }

  if (entity.render_kind === "arrow") {
    return (
      <group ref={groupRef} position={targetPosition.toArray()} scale={desiredScale} {...clickProps}>
        <SelectionHalo entity={entity} progress={progress} />
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.18, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.78, 18]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.32, 0, 0]}>
          <coneGeometry args={[0.16, 0.34, 24]} />
          <meshStandardMaterial {...material} />
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

          const active =
            scene.active_beat?.active_entity_ids.includes(relationship.source_entity_id) ||
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
              opacity={active ? 0.75 : isCycleBack ? 0.28 : 0.16}
            />,
          ];
        });
      })}
    </>
  );
}

function LoopTrack({ scene }: { scene: PreparedSemanticScene }) {
  if (!scene.has_loop_layout || !scene.loop_points.length) return null;

  const progressIndex = Math.max(4, Math.round(((scene.active_beat_index + 1) / Math.max(1, scene.beat_count)) * 128));
  const progressPoints = scene.loop_points.slice(0, Math.min(scene.loop_points.length, progressIndex + 1));
  const marker = scene.active_loop_position;

  return (
    <group>
      <Line points={scene.loop_points} color="#38bdf8" lineWidth={1.5} transparent opacity={0.32} />
      <Line points={progressPoints} color="#fbbf24" lineWidth={4} transparent opacity={0.84} />
      {marker ? (
        <group position={[marker[0], 0.04, marker[2]]}>
          <mesh>
            <sphereGeometry args={[0.09, 24, 24]} />
            <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={0.72} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function BeatActionHints({ scene, progress }: { scene: PreparedSemanticScene; progress: number }) {
  const targets = scene.actions
    .map((action) => scene.entities.find((entity) => entity.id === action.target_entity_id))
    .filter((entity): entity is PreparedSemanticSceneEntity => Boolean(entity))
    .slice(0, 4);

  return (
    <>
      {targets.map((entity, index) => (
        <group key={`${entity.id}-pulse-${index}`} position={entity.position}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.52 + index * 0.04 + Math.sin(progress * Math.PI) * 0.07, 0.012, 8, 48]} />
            <meshBasicMaterial color="#fef3c7" transparent opacity={0.42} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function getDirectedCameraNotes(scene: PreparedSemanticScene) {
  const beat = asRecord(scene.directed_story_beat);
  const camera = asRecord(beat?.camera);
  const shotType = text(camera?.shot_type, "").toLowerCase();
  const movement = text(camera?.movement, "").toLowerCase();
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
    let orbitAmount = isPlaying ? 0.24 : 0.07;

    if (directedCamera.shotType.includes("wide")) blend = 0.12;
    if (directedCamera.shotType.includes("close") || directedCamera.shotType.includes("push")) blend = 0.84;
    if (directedCamera.shotType.includes("medium")) blend = 0.48;
    if (directedCamera.shotType.includes("overhead")) blend = 0.28;
    if (directedCamera.movement.includes("orbit")) orbitAmount += 0.15;

    const desired = wide.clone().lerp(close, blend);

    if (directedCamera.shotType.includes("overhead")) {
      desired.x = lookTarget.x + 0.2;
      desired.y = Math.max(desired.y, 5.4);
      desired.z = lookTarget.z + 0.3;
    }

    if (directedCamera.shotType.includes("side")) {
      desired.x = lookTarget.x + 4.4;
      desired.y = Math.max(2.4, desired.y * 0.8);
      desired.z = lookTarget.z + 0.9;
    }

    if (scene.has_loop_layout || directedCamera.movement.includes("orbit")) {
      const angle = state.clock.elapsedTime * orbitAmount + scene.active_beat_index * 0.38;
      desired.x += Math.cos(angle) * 0.44;
      desired.z += Math.sin(angle) * 0.44;
    }

    camera.position.lerp(desired, Math.min(1, delta * 2.2));
    targetRef.current.lerp(lookTarget, Math.min(1, delta * 2.4));
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
  const easedProgress = normalizedProgress * normalizedProgress * (3 - 2 * normalizedProgress);
  const captionText = storyMode
    ? storyCaption || ""
    : scene.active_narration_text || scene.orientation_text || scene.target_takeaway;
  const showCaption = captionText.trim().length > 0;

  return (
    <div
      style={{
        height: 600,
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
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 6, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, -5]} intensity={0.8} />
        <gridHelper args={[7, 14, "#334155", "#1e293b"]} position={[0, -0.32, 0]} />
        <CameraRig scene={scene} isPlaying={Boolean(isPlaying)} storyMode={Boolean(storyMode)} />
        <LoopTrack scene={scene} />
        <RelationshipLines scene={scene} />
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
                fontSize: storyMode ? 54 : 18,
                lineHeight: storyMode ? 1.02 : 1.45,
                fontWeight: 850,
                letterSpacing: storyMode ? "0.01em" : undefined,
                textAlign: storyMode ? "center" : "left",
                minHeight: storyMode ? 60 : undefined,
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
