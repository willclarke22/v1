"use client";

import { Clone, Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  applyDirectorBlocking,
  DirectorShotCameraController,
  DirectorShotLightingRig,
  DirectorShotPathGuide,
  sampleDirectorActorState,
  type DirectorRuntimeActor,
} from "../../scenes/ui";
import {
  directorCapabilityDemoMoment,
  type DirectorBlockingCue,
  type DirectorCapability,
} from "../director-capability-registry";

export type DirectorLibraryAsset = {
  asset_id: string;
  canonical_label: string;
  display_name: string;
  aliases: string[];
  semantic_tags: string[];
  asset_type: "glb" | "gltf" | "primitive";
  public_path: string;
  dimensions_m: [number, number, number];
  default_scale: number;
  default_rotation: [number, number, number];
  ground_offset_m: number;
  quality_score: number;
  status: "inbox" | "normalized" | "approved" | "rejected";
  scene_review_status: "pending" | "approved" | "rejected";
  semantic_review_status: "pending" | "verified" | "mismatch" | "rejected";
  safe_to_use_in_sandbox: boolean;
  license_kind: string;
  attribution?: { required: boolean; text: string | null } | null;
  file_stats: { exists: boolean; remote_url?: string | null };
};

export type ResolvedDirectorRole = {
  role: string;
  asset: DirectorLibraryAsset | null;
  blocking: DirectorBlockingCue;
  matched_concept: string | null;
};

type PreviewProps = {
  capability: DirectorCapability;
  roles: ResolvedDirectorRole[];
  progress: number;
  isPlaying: boolean;
  showCameraPath: boolean;
  showRoleLabels: boolean;
};

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function pulse(progress: number, center: number, width = 0.2) {
  const distance = Math.abs(progress - center);
  return clamp01(1 - distance / width);
}

function runtimeSize(role: ResolvedDirectorRole): [number, number, number] {
  const target = Math.max(0.25, role.blocking.target_extent_m ?? 1.6);
  const source = role.asset?.dimensions_m ?? [1, 1, 1];
  const largest = Math.max(0.001, ...source.map((value) => Math.abs(Number(value) || 0)));
  const scale = target / largest;
  return source.map((value) => Math.max(0.05, Math.abs(Number(value) || 1) * scale)) as [number, number, number];
}

function runtimeActorsFor(roles: ResolvedDirectorRole[]): DirectorRuntimeActor[] {
  return roles.map((role) => ({
    id: role.role,
    position: [...role.blocking.position],
    rotation: [...(role.blocking.rotation ?? [0, 0, 0])],
    size: runtimeSize(role),
  }));
}

function loadingLabel(label: string) {
  return (
    <Html center>
      <div style={{ padding: "8px 10px", borderRadius: 999, background: "rgba(2,6,23,0.9)", border: "1px solid rgba(125,211,252,0.3)", color: "#e0f2fe", fontSize: 12, whiteSpace: "nowrap" }}>
        Loading {label}…
      </div>
    </Html>
  );
}

function LibraryAssetMesh({ asset, targetExtent }: { asset: DirectorLibraryAsset; targetExtent: number }) {
  const gltf = useGLTF(asset.public_path);
  const largestDimension = Math.max(0.001, ...(asset.dimensions_m ?? [1, 1, 1]).map((value) => Math.abs(Number(value) || 0)));
  const scale = THREE.MathUtils.clamp(targetExtent / largestDimension, 0.08, 6);
  const rotation = asset.default_rotation ?? [0, 0, 0];
  const groundOffset = Number(asset.ground_offset_m) || 0;
  return (
    <group scale={scale} rotation={[rotation[0], rotation[1], rotation[2]]} position={[0, -groundOffset, 0]}>
      <Clone object={gltf.scene} castShadow receiveShadow />
    </group>
  );
}

function FallbackActor({ role }: { role: string }) {
  const color = role === "primary_subject" ? "#38bdf8" : role === "secondary_subject" ? "#f97316" : "#a78bfa";
  return (
    <group>
      <mesh castShadow receiveShadow><dodecahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color={color} roughness={0.35} metalness={0.15} /></mesh>
      <mesh position={[0, -0.82, 0]} receiveShadow><cylinderGeometry args={[0.62, 0.78, 0.16, 28]} /><meshStandardMaterial color="#172554" roughness={0.8} /></mesh>
    </group>
  );
}

function AnimatedActor({
  capability,
  moment,
  actor,
  allActors,
  resolvedRole,
  progress,
  isPlaying,
  showRoleLabels,
}: {
  capability: DirectorCapability;
  moment: ReturnType<typeof directorCapabilityDemoMoment>;
  actor: DirectorRuntimeActor;
  allActors: DirectorRuntimeActor[];
  resolvedRole: ResolvedDirectorRole;
  progress: number;
  isPlaying: boolean;
  showRoleLabels: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lastProgressRef = useRef(progress);
  const targetExtent = resolvedRole.blocking.target_extent_m ?? 1.6;
  const sample = sampleDirectorActorState(moment, actor, progress, allActors);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const rewound = progress + 0.02 < lastProgressRef.current;
    const snap = !isPlaying || rewound;
    const alpha = 1 - Math.exp(-13 * Math.min(0.05, Math.max(0, delta)));
    if (snap) {
      group.position.copy(sample.position);
      group.rotation.copy(sample.rotation);
      group.scale.copy(sample.scale);
    } else {
      group.position.lerp(sample.position, alpha);
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, sample.rotation.x, alpha);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, sample.rotation.y, alpha);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, sample.rotation.z, alpha);
      group.scale.lerp(sample.scale, alpha);
    }
    lastProgressRef.current = progress;
  });

  const emphasized = resolvedRole.role === "primary_subject" && (capability.category === "narrative_attention" || capability.category === "lighting_emphasis");
  return (
    <group ref={groupRef} position={sample.position} rotation={[sample.rotation.x, sample.rotation.y, sample.rotation.z]} scale={sample.scale}>
      {emphasized ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.82, 1.02, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.5 + pulse(progress, 0.55, 0.5) * 0.35} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <Suspense fallback={loadingLabel(resolvedRole.role)}>
        {resolvedRole.asset ? <LibraryAssetMesh asset={resolvedRole.asset} targetExtent={targetExtent} /> : <FallbackActor role={resolvedRole.role} />}
      </Suspense>
      {showRoleLabels ? (
        <Html position={[0, targetExtent * 0.72 + 0.35, 0]} center distanceFactor={7}>
          <div style={{ borderRadius: 999, padding: "5px 8px", color: "white", background: "rgba(2,6,23,0.86)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
            {resolvedRole.role.replace(/_/g, " ")}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function rolePosition(actors: DirectorRuntimeActor[], id: string) {
  const actor = actors.find((candidate) => candidate.id === id);
  return actor ? new THREE.Vector3(...actor.position).add(new THREE.Vector3(0, actor.size[1] * 0.45, 0)) : new THREE.Vector3();
}

function TeachingRelationship({ capability, actors, progress }: { capability: DirectorCapability; actors: DirectorRuntimeActor[]; progress: number }) {
  const primary = rolePosition(actors, "primary_subject");
  const secondary = rolePosition(actors, "secondary_subject");
  const context = rolePosition(actors, "context_subject");
  if (capability.id === "connect_cause") {
    const firstEnd = primary.clone().lerp(context, clamp01(progress * 2));
    const secondEnd = context.clone().lerp(secondary, clamp01((progress - 0.48) * 2));
    return <group><Line points={[primary, firstEnd]} color="#38bdf8" lineWidth={4} />{progress > 0.48 ? <Line points={[context, secondEnd]} color="#f97316" lineWidth={4} /> : null}</group>;
  }
  if (capability.id === "compare" || capability.id === "two_subject_balance") return <Line points={[primary, secondary]} color="#a78bfa" lineWidth={2} dashed dashSize={0.18} gapSize={0.12} />;
  if (capability.id === "show_consequence") return <Line points={[primary, primary.clone().lerp(secondary, progress)]} color="#facc15" lineWidth={3} />;
  return null;
}

function Stage() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.04, 0]}><circleGeometry args={[8.5, 72]} /><meshStandardMaterial color="#07111f" roughness={0.94} metalness={0.04} /></mesh>
      <gridHelper args={[14, 28, "#1d4ed8", "#172554"]} position={[0, 0, 0]} />
      <mesh position={[0, 3.2, -5.2]} receiveShadow><planeGeometry args={[16, 8]} /><meshStandardMaterial color="#030712" roughness={1} /></mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[4.8, 4.84, 96]} /><meshBasicMaterial color="#1e3a8a" transparent opacity={0.5} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

export function DirectorCapabilityPreview({ capability, roles, progress, isPlaying, showCameraPath, showRoleLabels }: PreviewProps) {
  const moment = useMemo(() => directorCapabilityDemoMoment(capability), [capability]);
  const baseActors = useMemo(() => runtimeActorsFor(roles), [roles]);
  const actors = useMemo(() => applyDirectorBlocking(moment, baseActors), [baseActors, moment]);
  const lowKey = moment.shot?.lighting.intents.includes("low_key") || moment.shot?.lighting.intents.includes("dim_environment");

  return (
    <>
      <color attach="background" args={[lowKey ? "#01030a" : "#020617"]} />
      <fog attach="fog" args={["#020617", 10, 30]} />
      <DirectorShotLightingRig moment={moment} actors={actors} progress={progress} />
      <Stage />
      {roles.map((resolvedRole) => {
        const actor = actors.find((candidate) => candidate.id === resolvedRole.role) ?? baseActors.find((candidate) => candidate.id === resolvedRole.role);
        return actor ? <AnimatedActor key={`${capability.id}:${resolvedRole.role}:${resolvedRole.asset?.asset_id ?? "fallback"}`} capability={capability} moment={moment} actor={actor} allActors={actors} resolvedRole={resolvedRole} progress={progress} isPlaying={isPlaying} showRoleLabels={showRoleLabels} /> : null;
      })}
      <TeachingRelationship capability={capability} actors={actors} progress={progress} />
      {showCameraPath ? <DirectorShotPathGuide moment={moment} actors={actors} /> : null}
      <DirectorShotCameraController moment={moment} actors={actors} progress={progress} isPlaying={isPlaying} />
      <OrbitControls makeDefault enabled={!isPlaying} enableDamping dampingFactor={0.08} minDistance={1.4} maxDistance={20} target={[0, 0.8, 0]} />
    </>
  );
}
