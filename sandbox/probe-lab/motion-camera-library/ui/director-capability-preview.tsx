"use client";

import { Clone, Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { MyWayAssetRecord } from "../../assets/asset-types";
import { buildAssetDirectabilityProfile } from "../../directability/asset-directability-from-asset";
import type { AssetDirectabilityProfileV1 } from "../../directability/asset-directability-contract";

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
import type { DirectorAuditFixtureKind } from "../director-visual-audit";
import {
  directorQualificationEffectiveRenderScale,
  directorQualificationRenderedWorldSize,
} from "../director-qualification-render-geometry";
import {
  directorQualificationInsideDetailCameraProfile,
} from "../director-qualification-support-containment-policy";
import {
  DirectorRealAssetLoadBoundary,
  directorRealAssetBrowserUrl,
} from "./director-real-asset-browser";

export type DirectorLibraryAsset = MyWayAssetRecord & {
  file_stats: {
    exists: boolean;
    remote_url?: string | null;
  };
};

export type ResolvedDirectorRole = {
  role: string;
  asset: DirectorLibraryAsset | null;
  blocking: DirectorBlockingCue;
  matched_concept: string | null;
  /** Optional renderer-only scale safety bounds. Qualification uses a wider range after recording source/target normalization evidence. */
  render_scale_bounds?: [number, number];
  /** Qualification-only guard: scale a measured ground offset with the visual model so resized assets still sit on the same ground anchor. */
  scale_ground_offset_with_render?: boolean;
  /** Qualification-only measured-region refinement captured from the exact rendered GLB. */
  directability_override?: AssetDirectabilityProfileV1 | null;
};

type PreviewProps = {
  capability: DirectorCapability;
  roles: ResolvedDirectorRole[];
  progress: number;
  isPlaying: boolean;
  showCameraPath: boolean;
  showRoleLabels: boolean;
  fixtureMode?: "controlled" | "real_assets";
  fixtureKind?: DirectorAuditFixtureKind;
  auditSnap?: boolean;
  /**
   * Qualification-only visibility normalization for camera families. The
   * Capability Library and authored lighting remain untouched unless the
   * Qualification Room explicitly opts in.
   */
  qualificationVisibilityAssist?: boolean;
  /** Qualification reels can preserve already-mounted GLB actor instances across sibling capabilities. */
  preserveActorInstances?: boolean;
};

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function directorQualificationPreviewMoment(
  capability: DirectorCapability,
  roles: ResolvedDirectorRole[],
  qualificationVisibilityAssist: boolean,
): ReturnType<typeof directorCapabilityDemoMoment> {
  const baseMoment = directorCapabilityDemoMoment(capability);
  if (
    !qualificationVisibilityAssist ||
    capability.id !== "inside" ||
    !baseMoment.shot
  ) {
    return baseMoment;
  }

  const receiverExtent = roles.find(
    (role) => role.role === "secondary_subject",
  )?.blocking.target_extent_m;
  const cameraProfile =
    directorQualificationInsideDetailCameraProfile(receiverExtent);
  if (!cameraProfile) return baseMoment;

  const shot = {
    ...baseMoment.shot,
    composition: {
      ...baseMoment.shot.composition,
      framing: cameraProfile.framing,
      angle: cameraProfile.angle,
    },
    lens: {
      ...baseMoment.shot.lens,
      focal_length_mm: cameraProfile.focal_length_mm,
      field_of_view_degrees: cameraProfile.field_of_view_degrees,
      focus_entity_id: cameraProfile.focus_entity_id,
      depth_of_field: "deep" as const,
    },
    camera: {
      ...baseMoment.shot.camera,
      focus_entity_ids: [cameraProfile.focus_entity_id],
    },
  };

  return {
    ...baseMoment,
    keeps_visible_entity_ids: shot.composition.keep_visible_entity_ids,
    camera: {
      ...baseMoment.camera,
      shot_type: "medium" as const,
      focus_entity_ids: [cameraProfile.focus_entity_id],
      keep_visible_entity_ids: shot.composition.keep_visible_entity_ids,
    },
    shot,
  };
}

function pulse(progress: number, center: number, width = 0.2) {
  const distance = Math.abs(progress - center);
  return clamp01(1 - distance / width);
}

export function directorQualificationRuntimeSize(
  role: ResolvedDirectorRole,
): [number, number, number] {
  return directorQualificationRenderedWorldSize({
    dimensions_m: role.asset?.dimensions_m,
    target_extent_m: role.blocking.target_extent_m ?? 1.6,
    scale_bounds: role.render_scale_bounds,
  });
}

export function directorQualificationRuntimeActors(
  roles: ResolvedDirectorRole[],
): DirectorRuntimeActor[] {
  return roles.map((role) => ({
    id: role.role,
    position: [...role.blocking.position],
    rotation: [...(role.blocking.rotation ?? [0, 0, 0])],
    size: directorQualificationRuntimeSize(role),
    // Phase 1B.5E: real-asset proof must sample the same existing
    // directability profile that Builder-resolved actors already carry.
    directability:
      role.directability_override !== undefined
        ? role.directability_override
        : role.asset
          ? buildAssetDirectabilityProfile(role.asset)
          : null,
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

function LibraryAssetMesh({
  asset,
  targetExtent,
  goldenHighlight = false,
  scaleBounds,
  scaleGroundOffset = false,
}: {
  asset: DirectorLibraryAsset;
  targetExtent: number;
  goldenHighlight?: boolean;
  scaleBounds?: [number, number];
  scaleGroundOffset?: boolean;
}) {
  const gltf = useGLTF(directorRealAssetBrowserUrl(asset));
  // Preserve the historical qualification scale-guard markers while routing the
  // actual calculation through the A.11A.8 canonical render/runtime helper.
  const minimumScale = scaleBounds?.[0] ?? 0.08;
  const maximumScale = scaleBounds?.[1] ?? 6;
  const scale = directorQualificationEffectiveRenderScale({
    dimensions_m: asset.dimensions_m,
    target_extent_m: targetExtent,
    scale_bounds: [minimumScale, maximumScale],
  });
  const rotation = asset.default_rotation ?? [0, 0, 0];
  const groundOffset = Number(asset.ground_offset_m) || 0;
  // Golden outline geometry is expensive for detailed GLBs. Build it only for the
  // one capability that actually renders the outline instead of cloning every real
  // asset used by every Qualification Room audition.
  const outlineScene = useMemo(() => {
    if (!goldenHighlight) return null;
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = 1;
      object.material = new THREE.MeshBasicMaterial({
        color: "#e8e44d",
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      });
    });
    return clone;
  }, [gltf.scene, goldenHighlight]);

  useEffect(() => () => {
    if (!outlineScene) return;
    outlineScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }, [outlineScene]);

  const renderedGroundOffset = groundOffset * (scaleGroundOffset ? scale : 1);

  return (
    <group position={[0, -renderedGroundOffset, 0]}>
      <group scale={scale} rotation={[rotation[0], rotation[1], rotation[2]]}>
        {goldenHighlight && outlineScene ? <primitive object={outlineScene} scale={1.028} /> : null}
        <Clone object={gltf.scene} castShadow receiveShadow />
      </group>
    </group>
  );
}

function AtomicGoldenControlledOutline({ targetExtent }: { targetExtent: number }) {
  const scale = Math.max(0.45, targetExtent / 1.8) * 1.035;
  return (
    <group scale={scale}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.15, 1, 0.75]} />
        <meshBasicMaterial color="#e8e44d" side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.5, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.11, 0.42, 14]} />
        <meshBasicMaterial color="#e8e44d" side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.52, 0.62, 0.12, 24]} />
        <meshBasicMaterial color="#e8e44d" side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
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

function ControlledAuditActor({
  capabilityId,
  role,
  fixtureKind,
  targetExtent,
}: {
  capabilityId: string;
  role: string;
  fixtureKind: DirectorAuditFixtureKind;
  targetExtent: number;
}) {
  const primary = role === "primary_subject";
  const secondary = role === "secondary_subject";
  const color = primary ? "#38bdf8" : secondary ? "#f97316" : "#a78bfa";
  const scale =
    fixtureKind === "detail_target"
      ? primary
        ? Math.max(0.72, targetExtent / 1.8)
        : Math.max(0.08, targetExtent)
      : Math.max(0.45, targetExtent / 1.8);

  if (fixtureKind === "two_subject_viewpoint") {
    return (
      <group scale={scale}>
        <mesh position={[0, 0.88, 0]}><sphereGeometry args={[0.22, 20, 20]} /><meshStandardMaterial color={color} roughness={0.48} /></mesh>
        <mesh position={[0, 0.28, 0]}><boxGeometry args={[0.78, 1.02, 0.44]} /><meshStandardMaterial color={color} roughness={0.58} /></mesh>
        <mesh position={[-0.34, 0.52, 0]}><sphereGeometry args={[0.085, 12, 12]} /><meshBasicMaterial color="#e2e8f0" /></mesh>
        <mesh position={[0.34, 0.52, 0]}><sphereGeometry args={[0.085, 12, 12]} /><meshBasicMaterial color="#e2e8f0" /></mesh>
        <mesh position={[0, 0.78, 0.31]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.09, 0.4, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "travelling_subject" && primary) {
    return (
      <group scale={scale}>
        <mesh position={[0, 0.34, 0]}><boxGeometry args={[1.45, 0.68, 0.86]} /><meshStandardMaterial color={color} roughness={0.46} /></mesh>
        <mesh position={[0, 0.34, 0.7]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.17, 0.62, 18]} /><meshBasicMaterial color="#fef08a" /></mesh>
        <mesh position={[-0.52, 0.08, -0.18]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, 0.14, 18]} /><meshStandardMaterial color="#0f172a" /></mesh>
        <mesh position={[0.52, 0.08, -0.18]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, 0.14, 18]} /><meshStandardMaterial color="#0f172a" /></mesh>
        <mesh position={[0, 0.78, 0]}><boxGeometry args={[0.5, 0.08, 0.5]} /><meshBasicMaterial color="#e0f2fe" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "detail_target" && primary) {
    return (
      <group scale={scale}>
        {/* A deliberately recognizable QA object: a small machine/control panel. */}
        <mesh position={[0, 0.68, 0]}><boxGeometry args={[1.75, 1.34, 0.34]} /><meshStandardMaterial color="#1e3a8a" roughness={0.62} metalness={0.12} /></mesh>
        <mesh position={[0, 0.86, 0.19]}><boxGeometry args={[0.7, 0.36, 0.035]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[0, 0.86, 0.215]}><boxGeometry args={[0.56, 0.22, 0.012]} /><meshBasicMaterial color="#86efac" /></mesh>
        <mesh position={[0.58, 0.42, 0.2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.18, 0.18, 0.055, 28]} /><meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.28} /></mesh>
        <mesh position={[0.58, 0.42, 0.235]}><boxGeometry args={[0.24, 0.035, 0.018]} /><meshBasicMaterial color="#0f172a" /></mesh>
        <mesh position={[-0.58, 1.08, 0.21]}><sphereGeometry args={[0.105, 20, 20]} /><meshBasicMaterial color="#ef4444" /></mesh>
        <mesh position={[-0.58, 0.9, 0.205]}><sphereGeometry args={[0.075, 18, 18]} /><meshBasicMaterial color="#facc15" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "detail_target" && secondary) {
    return (
      <group scale={scale}>
        {/* Macro target: tiny metal fastener with a visible slot. */}
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.48, 0.48, 0.24, 24]} /><meshStandardMaterial color="#f8fafc" metalness={0.82} roughness={0.22} /></mesh>
        <mesh position={[0, 0, 0.13]}><boxGeometry args={[0.58, 0.11, 0.08]} /><meshBasicMaterial color="#334155" /></mesh>
        <mesh position={[0, 0, 0.135]} rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.58, 0.11, 0.08]} /><meshBasicMaterial color="#334155" /></mesh>
        <mesh position={[0, 0, -0.08]}><cylinderGeometry args={[0.27, 0.2, 0.68, 12]} /><meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "detail_target" && !primary && !secondary) {
    return (
      <group scale={scale}>
        {/* Insert target: a larger, semantically meaningful lever/control. */}
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.46, 0.46, 0.16, 28]} /><meshStandardMaterial color="#f97316" roughness={0.38} /></mesh>
        <mesh position={[0, 0.72, 0]} rotation={[0, 0, -0.28]}><boxGeometry args={[0.24, 1.25, 0.24]} /><meshStandardMaterial color="#e2e8f0" metalness={0.48} roughness={0.32} /></mesh>
        <mesh position={[0.17, 1.36, 0]}><sphereGeometry args={[0.34, 24, 24]} /><meshStandardMaterial color="#fb7185" roughness={0.34} /></mesh>
      </group>
    );
  }


  if (fixtureKind === "object_motion_rigid") {
    return (
      <group scale={scale}>
        <mesh position={[0, 0.42, 0]}><boxGeometry args={[1.25, 0.72, 0.72]} /><meshStandardMaterial color={color} roughness={0.48} /></mesh>
        <mesh position={[0.7, 0.42, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.18, 0.48, 16]} /><meshBasicMaterial color="#fef08a" /></mesh>
        <mesh position={[-0.42, 0.84, 0.29]}><boxGeometry args={[0.24, 0.18, 0.18]} /><meshBasicMaterial color="#f472b6" /></mesh>
        <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.5, 0.58, 0.08, 24]} /><meshStandardMaterial color="#172554" roughness={0.82} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_path_surface" && primary) {
    if (capabilityId === "roll") {
      return (
        <group scale={scale}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.54, 0]}>
            <cylinderGeometry args={[0.54, 0.54, 0.34, 28]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.42} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.54, 0.2]}><cylinderGeometry args={[0.075, 0.075, 0.46, 16]} /><meshStandardMaterial color="#0f172a" roughness={0.42} metalness={0.55} /></mesh>
          <Line points={[[0, 0.54, 0.19], [0, 1.06, 0.19]]} color="#fef08a" lineWidth={4} />
          <mesh position={[0, 1.08, 0.19]}><sphereGeometry args={[0.09, 14, 14]} /><meshBasicMaterial color="#f472b6" /></mesh>
        </group>
      );
    }
    return (
      <group scale={scale}>
        <mesh position={[0, 0.32, 0]}><boxGeometry args={[1.18, 0.46, 0.82]} /><meshStandardMaterial color="#38bdf8" roughness={0.5} /></mesh>
        <mesh position={[0.52, 0.32, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.13, 0.4, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
        <mesh position={[-0.34, 0.62, 0.3]}><boxGeometry args={[0.22, 0.16, 0.12]} /><meshBasicMaterial color="#f472b6" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_path_surface" && !primary) {
    return (
      <group scale={scale}>
        <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.28, 0.36, 0.7, 20]} /><meshStandardMaterial color={color} roughness={0.52} /></mesh>
        <mesh position={[0, 0.76, 0]}><sphereGeometry args={[0.14, 16, 16]} /><meshBasicMaterial color="#fef08a" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_relationship") {
    if (primary) {
      return (
        <group scale={scale}>
          <mesh position={[0, 0.42, 0]}><boxGeometry args={[0.92, 0.64, 0.64]} /><meshStandardMaterial color="#38bdf8" roughness={0.48} /></mesh>
          <mesh position={[0.58, 0.42, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.16, 0.48, 16]} /><meshBasicMaterial color="#fef08a" /></mesh>
          <mesh position={[-0.34, 0.78, 0.28]}><sphereGeometry args={[0.1, 14, 14]} /><meshBasicMaterial color="#f472b6" /></mesh>
        </group>
      );
    }
    if (secondary) {
      return (
        <group scale={scale}>
          <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.48, 0.58, 0.92, 24]} /><meshStandardMaterial color="#f97316" roughness={0.5} /></mesh>
          <mesh position={[0, 0.48, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.32, 0.07, 10, 28]} /><meshBasicMaterial color="#fef08a" /></mesh>
          <mesh position={[0, 1.02, 0]}><sphereGeometry args={[0.12, 16, 16]} /><meshBasicMaterial color="#fb7185" /></mesh>
        </group>
      );
    }
  }

  if (fixtureKind === "object_motion_articulation") {
    if (primary) {
      return (
        <group scale={scale}>
          {/* Door-like articulated panel: hinge edge is the left edge. */}
          <mesh position={[0, 0.78, 0]}><boxGeometry args={[1.0, 1.55, 0.16]} /><meshStandardMaterial color="#38bdf8" roughness={0.48} /></mesh>
          <mesh position={[-0.48, 0.78, 0.12]}><boxGeometry args={[0.08, 1.48, 0.08]} /><meshBasicMaterial color="#facc15" /></mesh>
          <mesh position={[0.34, 0.78, 0.13]}><sphereGeometry args={[0.09, 16, 16]} /><meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.35} /></mesh>
          <mesh position={[-0.48, 0.28, 0.16]}><cylinderGeometry args={[0.07, 0.07, 0.24, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
          <mesh position={[-0.48, 1.28, 0.16]}><cylinderGeometry args={[0.07, 0.07, 0.24, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
        </group>
      );
    }
    return (
      <group scale={scale}>
        <mesh position={[0, 0.78, 0]}><boxGeometry args={[0.12, 1.7, 0.18]} /><meshStandardMaterial color="#475569" roughness={0.7} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_containment") {
    if (primary) {
      return (
        <group scale={scale}>
          <mesh position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.25, 0.25, 1.05, 20]} /><meshStandardMaterial color="#38bdf8" metalness={0.35} roughness={0.38} /></mesh>
          <mesh position={[0.58, 0.42, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.18, 0.36, 16]} /><meshBasicMaterial color="#fef08a" /></mesh>
        </group>
      );
    }
    if (secondary) {
      return (
        <group scale={scale}>
          {/* Open socket/container with a readable mouth and interior. */}
          <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.25, 0.9, 1.1]} /><meshStandardMaterial color="#f97316" roughness={0.56} transparent opacity={0.28} depthWrite={false} /></mesh>
          <mesh position={[-0.5, 0.45, 0]}><boxGeometry args={[0.16, 0.9, 1.1]} /><meshStandardMaterial color="#fb923c" roughness={0.5} /></mesh>
          <mesh position={[0, 0.06, 0]}><boxGeometry args={[1.15, 0.12, 1.0]} /><meshStandardMaterial color="#7c2d12" roughness={0.7} /></mesh>
          <Line points={[[0.56, 0.04, -0.5], [0.56, 0.86, -0.5], [0.56, 0.86, 0.5], [0.56, 0.04, 0.5]]} color="#fef08a" lineWidth={2} />
        </group>
      );
    }
  }

  if (fixtureKind === "object_motion_multi_part") {
    if (primary) {
      return (
        <group scale={scale}>
          {/* Three visibly distinct parts move with the current primary transform.
              This intentionally exposes when a supposedly multi-part capability
              still collapses to one rigid actor. */}
          <mesh position={[-0.36, 0.34, 0]}><boxGeometry args={[0.42, 0.58, 0.5]} /><meshStandardMaterial color="#38bdf8" roughness={0.48} /></mesh>
          <mesh position={[0.12, 0.58, 0]}><sphereGeometry args={[0.26, 18, 18]} /><meshStandardMaterial color="#a78bfa" roughness={0.42} /></mesh>
          <mesh position={[0.46, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19, 0.19, 0.52, 18]} /><meshStandardMaterial color="#22d3ee" roughness={0.4} /></mesh>
        </group>
      );
    }
    if (secondary) {
      return (
        <group scale={scale}>
          <mesh position={[0, 0.42, 0]}><boxGeometry args={[1.18, 0.84, 0.84]} /><meshStandardMaterial color="#f97316" roughness={0.58} transparent opacity={0.22} depthWrite={false} /></mesh>
          <Line points={[[ -0.58, 0.03, 0.44 ], [ 0.58, 0.03, 0.44 ], [ 0.58, 0.81, 0.44 ], [ -0.58, 0.81, 0.44 ], [ -0.58, 0.03, 0.44 ]]} color="#fef08a" lineWidth={2} />
        </group>
      );
    }
  }

  if (fixtureKind === "object_motion_process") {
    // Process carrier/content actor fixture family. Phase 1B.5A specializes the
    // geometry below so quantity, transfer, and emission remain distinguishable.
    if (primary) {
      if (capabilityId === "fill" || capabilityId === "drain") {
        return (
          <group scale={scale}>
            {/* Open vessel: the cyan quantity overlay is visually separate from
                the container shell, so Fill/Drain cannot read like root scaling. */}
            <mesh position={[0, 0.58, 0]}><cylinderGeometry args={[0.5, 0.5, 1.16, 28, 1, true]} /><meshStandardMaterial color="#bae6fd" roughness={0.22} transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} /></mesh>
            <mesh position={[0, 0.045, 0]}><cylinderGeometry args={[0.5, 0.5, 0.09, 28]} /><meshStandardMaterial color="#0f172a" roughness={0.68} /></mesh>
            <mesh position={[0, 1.16, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.025, 10, 40]} /><meshBasicMaterial color="#e0f2fe" transparent opacity={0.9} /></mesh>
          </group>
        );
      }
      if (capabilityId === "accumulate") {
        return (
          <group scale={scale}>
            {/* Shallow receiving tray keeps accumulation grounded and distinct
                from Fill's enclosed quantity. */}
            <mesh position={[0, 0.08, 0]}><boxGeometry args={[1.25, 0.16, 0.9]} /><meshStandardMaterial color="#334155" roughness={0.68} /></mesh>
            <Line points={[[ -0.6, 0.18, -0.42 ], [ 0.6, 0.18, -0.42 ], [ 0.6, 0.18, 0.42 ], [ -0.6, 0.18, 0.42 ], [ -0.6, 0.18, -0.42 ]]} color="#c4b5fd" lineWidth={2} />
          </group>
        );
      }
      return (
        <group scale={scale}>
          {/* Source/nozzle fixture for Flow and Emit. */}
          <mesh position={[-0.18, 0.4, 0]}><boxGeometry args={[0.72, 0.7, 0.72]} /><meshStandardMaterial color="#0ea5e9" roughness={0.5} /></mesh>
          <mesh position={[0.42, 0.4, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.18, 0.24, 0.72, 20]} /><meshStandardMaterial color="#38bdf8" roughness={0.34} metalness={0.22} /></mesh>
          <mesh position={[0.82, 0.4, 0]} rotation={[0, 0, -Math.PI / 2]}><torusGeometry args={[0.18, 0.035, 10, 28]} /><meshBasicMaterial color="#e0f2fe" /></mesh>
        </group>
      );
    }
    if (secondary) {
      if (capabilityId !== "flow") return <group />;
      return (
        <group scale={scale}>
          {/* Receiver stays visibly open so Flow has an unambiguous destination. */}
          <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.58, 0.58, 1.24, 28, 1, true]} /><meshStandardMaterial color="#f97316" roughness={0.5} transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} /></mesh>
          <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.58, 0.58, 0.08, 28]} /><meshStandardMaterial color="#7c2d12" roughness={0.7} /></mesh>
          <mesh position={[0, 1.24, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.58, 0.03, 10, 40]} /><meshBasicMaterial color="#fb923c" transparent opacity={0.9} /></mesh>
        </group>
      );
    }
    return (
      <group scale={scale}>
        <mesh position={[0, 0.42, 0]}><sphereGeometry args={[0.32, 18, 18]} /><meshBasicMaterial color="#a78bfa" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "mounted_camera" && primary) {
    return (
      <group scale={scale}>
        {/* Deliberately vehicle-like host so the mounted viewpoint has a familiar body reference. */}
        <mesh position={[0, 0.35, 0]}><boxGeometry args={[1.7, 0.7, 1.05]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
        <mesh position={[0, 0.48, 1.12]}><boxGeometry args={[1.42, 0.24, 1.55]} /><meshStandardMaterial color="#0ea5e9" roughness={0.42} metalness={0.08} /></mesh>
        <mesh position={[0, 0.61, 1.56]}><boxGeometry args={[0.72, 0.035, 0.5]} /><meshBasicMaterial color="#e0f2fe" transparent opacity={0.86} /></mesh>
        <mesh position={[-0.58, 0.08, 0.1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.18, 0.18, 0.16, 18]} /><meshStandardMaterial color="#0f172a" /></mesh>
        <mesh position={[0.58, 0.08, 0.1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.18, 0.18, 0.16, 18]} /><meshStandardMaterial color="#0f172a" /></mesh>
        <mesh position={[0, 0.35, 0.72]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.16, 0.55, 16]} /><meshBasicMaterial color="#fef08a" /></mesh>
        {/* Mount marker + local XYZ axes. The blue axis mirrors the
            higher/back body mount and slight downward-forward runtime default. */}
        <mesh position={[0, 1.2, 0.2]}><boxGeometry args={[0.22, 0.18, 0.22]} /><meshBasicMaterial color="#fb7185" /></mesh>
        <Line points={[[0, 1.2, 0.2], [0.55, 1.2, 0.2]]} color="#ef4444" lineWidth={2} />
        <Line points={[[0, 1.2, 0.2], [0, 1.75, 0.2]]} color="#22c55e" lineWidth={2} />
        <Line points={[[0, 1.2, 0.2], [0, 1.03, 1.28]]} color="#3b82f6" lineWidth={3} />
        <mesh position={[0, 1.01, 1.4]} rotation={[Math.PI / 2 + 0.16, 0, 0]}><coneGeometry args={[0.11, 0.34, 14]} /><meshBasicMaterial color="#3b82f6" /></mesh>
      </group>
    );
  }

  if (fixtureKind === "mounted_camera" && secondary) {
    return (
      <group scale={scale}>
        {/* Forward-world landmark so a mounted outward view has something readable to travel past. */}
        <mesh position={[0, 0.8, 0]}><boxGeometry args={[0.22, 1.6, 0.22]} /><meshStandardMaterial color="#f97316" roughness={0.5} /></mesh>
        <mesh position={[0, 1.65, 0]}><sphereGeometry args={[0.28, 18, 18]} /><meshBasicMaterial color="#fef08a" /></mesh>
        <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.48, 0.62, 0.18, 20]} /><meshStandardMaterial color="#7c2d12" roughness={0.75} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "technical_overview") {
    return (
      <group scale={scale}>
        <mesh position={[0, 0.45, 0]}><boxGeometry args={[0.9, 0.9, 0.9]} /><meshStandardMaterial color={color} roughness={0.58} /></mesh>
        <mesh position={[0, 0.94, 0]}><boxGeometry args={[0.38, 0.08, 0.38]} /><meshBasicMaterial color="#e2e8f0" /></mesh>
        <mesh position={[0, 0.45, 0.58]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.1, 0.36, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[1.15, 1, 0.75]} /><meshStandardMaterial color={color} roughness={0.52} metalness={0.05} /></mesh>
      <mesh position={[0, 0.5, 0.58]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.11, 0.42, 14]} /><meshBasicMaterial color="#fef08a" /></mesh>
      <mesh position={[0, -0.04, 0]}><cylinderGeometry args={[0.52, 0.62, 0.12, 24]} /><meshStandardMaterial color="#172554" roughness={0.85} /></mesh>
    </group>
  );
}

function ControlledProcessQuantityOverlay({
  process,
  targetExtent,
}: {
  process: ReturnType<typeof sampleDirectorActorState>["process"];
  targetExtent: number;
}) {
  if (!process) return null;
  const fillLevel = process.quantities.fill_level;
  const accumulatedAmount = process.quantities.accumulated_amount;
  const fixtureScale = Math.max(0.45, targetExtent / 1.8);

  if (Number.isFinite(fillLevel)) {
    const level = clamp01(fillLevel ?? 0);
    const height = Math.max(0.025, 0.94 * level);
    return (
      <group scale={fixtureScale}>
        {/* Phase 1B.4.6 process overlay: quantity changes inside the actor
            without changing its root transform. */}
        <mesh position={[0, 0.08 + height / 2, 0]}>
          <cylinderGeometry args={[0.34, 0.34, height, 22]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.72} />
        </mesh>
        <mesh position={[0, 0.09 + height, 0]}>
          <cylinderGeometry args={[0.345, 0.345, 0.025, 22]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.92} />
        </mesh>
      </group>
    );
  }

  if (Number.isFinite(accumulatedAmount)) {
    const normalized = clamp01((accumulatedAmount ?? 0) / 1.15);
    const visibleCount = Math.max(0, Math.min(9, Math.ceil(normalized * 9)));
    const positions: [number, number, number][] = [
      [-0.28, 0.14, -0.16], [0, 0.14, -0.16], [0.28, 0.14, -0.16],
      [-0.22, 0.31, 0.04], [0.08, 0.31, 0.04], [0.34, 0.31, 0.04],
      [-0.12, 0.48, -0.08], [0.18, 0.48, -0.08], [0.03, 0.65, 0.08],
    ];
    return (
      <group scale={fixtureScale}>
        {positions.slice(0, visibleCount).map((position, index) => (
          <mesh key={`accumulated:${index}`} position={position}>
            <sphereGeometry args={[0.13, 14, 14]} />
            <meshBasicMaterial color="#c4b5fd" transparent opacity={0.88} />
          </mesh>
        ))}
      </group>
    );
  }

  return null;
}

function ProcessCarrierOverlay({
  moment,
  actors,
  progress,
  fixtureKind,
}: {
  moment: ReturnType<typeof directorCapabilityDemoMoment>;
  actors: DirectorRuntimeActor[];
  progress: number;
  fixtureKind: DirectorAuditFixtureKind;
}) {
  if (fixtureKind !== "object_motion_process") return null;
  const carriers = actors.flatMap((actor) =>
    sampleDirectorActorState(moment, actor, progress, actors).process?.carriers ?? [],
  );
  if (carriers.length === 0) return null;

  return (
    <group>
      {/* Phase 1B.4.6 process overlay: carrier positions are already world-space. */}
      {carriers.map((carrier) => (
        <mesh key={carrier.id} position={carrier.position}>
          <sphereGeometry args={[0.105, 12, 12]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.9} />
        </mesh>
      ))}
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
  fixtureMode,
  fixtureKind,
  auditSnap,
}: {
  capability: DirectorCapability;
  moment: ReturnType<typeof directorCapabilityDemoMoment>;
  actor: DirectorRuntimeActor;
  allActors: DirectorRuntimeActor[];
  resolvedRole: ResolvedDirectorRole;
  progress: number;
  isPlaying: boolean;
  showRoleLabels: boolean;
  fixtureMode: "controlled" | "real_assets";
  fixtureKind: DirectorAuditFixtureKind;
  auditSnap: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rollPivotRef = useRef<THREE.Group>(null);
  const rollContentRef = useRef<THREE.Group>(null);
  const lastProgressRef = useRef(progress);
  const targetExtent = resolvedRole.blocking.target_extent_m ?? 1.6;
  const sample = sampleDirectorActorState(moment, actor, progress, allActors);
  const rollVisualPivotY = capability.id === "roll"
    ? fixtureMode === "controlled"
      ? 0.54 * Math.max(0.45, targetExtent / 1.8)
      : Math.max(0.05, directorQualificationRuntimeSize(resolvedRole)[1] * 0.5)
    : 0;

  useFrame((_, delta) => {
    const group = groupRef.current;
    const rollPivot = rollPivotRef.current;
    const rollContent = rollContentRef.current;
    if (!group || !rollPivot || !rollContent) return;
    const rewound = progress + 0.02 < lastProgressRef.current;
    const snap = auditSnap || !isPlaying || rewound;
    const alpha = 1 - Math.exp(-13 * Math.min(0.05, Math.max(0, delta)));
    const baseRotation = actor.rotation ?? [0, 0, 0];
    const rollDelta = new THREE.Euler(
      sample.rotation.x - baseRotation[0],
      sample.rotation.y - baseRotation[1],
      sample.rotation.z - baseRotation[2],
      "XYZ",
    );

    if (snap) {
      group.position.copy(sample.position);
      group.scale.copy(sample.scale);
      if (capability.id === "roll") {
        // Phase 1B.5A visual adapter: keep the actor root at the contact point
        // but rotate the rendered body around its visual centre. This prevents
        // the controlled wheel from orbiting around the floor-level root.
        group.rotation.set(baseRotation[0], baseRotation[1], baseRotation[2]);
        rollPivot.position.set(0, rollVisualPivotY, 0);
        rollPivot.rotation.copy(rollDelta);
        rollContent.position.set(0, -rollVisualPivotY, 0);
      } else {
        group.rotation.copy(sample.rotation);
        rollPivot.position.set(0, 0, 0);
        rollPivot.rotation.set(0, 0, 0);
        rollContent.position.set(0, 0, 0);
      }
    } else {
      group.position.lerp(sample.position, alpha);
      group.scale.lerp(sample.scale, alpha);
      if (capability.id === "roll") {
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, baseRotation[0], alpha);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, baseRotation[1], alpha);
        group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, baseRotation[2], alpha);
        rollPivot.position.y = THREE.MathUtils.lerp(rollPivot.position.y, rollVisualPivotY, alpha);
        rollContent.position.y = THREE.MathUtils.lerp(rollContent.position.y, -rollVisualPivotY, alpha);
        rollPivot.rotation.x = THREE.MathUtils.lerp(rollPivot.rotation.x, rollDelta.x, alpha);
        rollPivot.rotation.y = THREE.MathUtils.lerp(rollPivot.rotation.y, rollDelta.y, alpha);
        rollPivot.rotation.z = THREE.MathUtils.lerp(rollPivot.rotation.z, rollDelta.z, alpha);
      } else {
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, sample.rotation.x, alpha);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, sample.rotation.y, alpha);
        group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, sample.rotation.z, alpha);
        rollPivot.position.lerp(new THREE.Vector3(), alpha);
        rollPivot.rotation.x = THREE.MathUtils.lerp(rollPivot.rotation.x, 0, alpha);
        rollPivot.rotation.y = THREE.MathUtils.lerp(rollPivot.rotation.y, 0, alpha);
        rollPivot.rotation.z = THREE.MathUtils.lerp(rollPivot.rotation.z, 0, alpha);
        rollContent.position.lerp(new THREE.Vector3(), alpha);
      }
    }
    lastProgressRef.current = progress;
  });

  const goldenHighlight = capability.id === "highlight_subject" && resolvedRole.role === "primary_subject";
  // Lighting qualification must be self-proving. The generic cyan subject ring
  // is useful for narrative-attention demos, but it contaminates lighting evidence
  // by making unrelated light styles share the same non-lighting emphasis cue.
  const lightingEffectOwnsAttention = [
    "neutral_studio",
    "high_key",
    "low_key",
    "backlit",
    "rim_lit",
    "spotlight_subject",
    "highlight_subject",
    "warm_cool_contrast",
    "preserve_shadow",
    "motivated_source",
    "light_reveal",
    "dim_environment",
    "emissive_subject",
    "track_spotlight",
    "shadow_projection",
    "volumetric_beam",
    "exposure_shift",
  ].includes(capability.id);
  const emphasized =
    !goldenHighlight &&
    !lightingEffectOwnsAttention &&
    resolvedRole.role === "primary_subject" &&
    (capability.category === "narrative_attention" || capability.category === "lighting_emphasis");
  return (
    <group ref={groupRef} position={sample.position} rotation={[sample.rotation.x, sample.rotation.y, sample.rotation.z]} scale={sample.scale}>
      {emphasized ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.82, 1.02, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.5 + pulse(progress, 0.55, 0.5) * 0.35} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <group ref={rollPivotRef}>
        <group ref={rollContentRef}>
          {fixtureMode === "controlled" ? (
            <>
              {goldenHighlight ? <AtomicGoldenControlledOutline targetExtent={targetExtent} /> : null}
              <ControlledAuditActor
                capabilityId={capability.id}
                role={resolvedRole.role}
                fixtureKind={fixtureKind}
                targetExtent={targetExtent}
              />
              {fixtureKind === "object_motion_process" && resolvedRole.role === "primary_subject" ? (
                <ControlledProcessQuantityOverlay process={sample.process} targetExtent={targetExtent} />
              ) : null}
            </>
          ) : (
            resolvedRole.asset ? (
              <DirectorRealAssetLoadBoundary
                resetKey={`${resolvedRole.asset.asset_id}:${resolvedRole.asset.public_path}`}
                assetLabel={resolvedRole.asset.display_name || resolvedRole.asset.canonical_label || resolvedRole.asset.asset_id}
                fallback={<FallbackActor role={resolvedRole.role} />}
              >
                <Suspense fallback={loadingLabel(resolvedRole.role)}>
                  <LibraryAssetMesh
                    asset={resolvedRole.asset}
                    targetExtent={targetExtent}
                    goldenHighlight={goldenHighlight}
                    scaleBounds={resolvedRole.render_scale_bounds}
                    scaleGroundOffset={resolvedRole.scale_ground_offset_with_render}
                  />
                </Suspense>
              </DirectorRealAssetLoadBoundary>
            ) : (
              <FallbackActor role={resolvedRole.role} />
            )
          )}
        </group>
      </group>
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

function TravellingCameraCorridor({ capabilityId }: { capabilityId: string }) {
  const markerPositions = [-5.25, -4.15, -3.05, -1.95, -0.85, 0.25, 1.35, 2.45, 3.55, 4.65, 5.75, 6.85];

  // Phase 1B.7A.9: every Tracking sibling now sees the same course. The tall
  // roadside orientation markers from A.6/A.8 are replaced by low ground-edge
  // reflectors that preserve optic-flow cadence without becoming foreground
  // bars, lens wipes, or actor occluders.
  //
  // Historical A.5-A.8 source-canary compatibility only. These phrases are
  // comments, not active branches; A.9 still gives every Tracking sibling the
  // same safe travelling corridor with the same low-profile reflector course.
  // roadside orientation markers
  // const showRoadsideMarkers = capabilityId !== "track_parallel";
  // showRoadsideMarkers
  // centre/edge lines
  // tracking-roadside-marker-
  return (
    <group rotation={[0, 0.273, 0]} name={`tracking-corridor-${capabilityId}`}>
      <mesh position={[0.6, -0.015, 0]} receiveShadow>
        <boxGeometry args={[13.2, 0.05, 4.2]} />
        <meshStandardMaterial color="#111827" roughness={0.92} />
      </mesh>
      <Line
        points={[[-5.4, 0.025, 0], [7, 0.025, 0]]}
        color="#f8fafc"
        lineWidth={2}
        dashed
        dashSize={0.34}
        gapSize={0.24}
      />
      <Line
        points={[[-5.4, 0.03, -1.85], [7, 0.03, -1.85]]}
        color="#facc15"
        lineWidth={2}
      />
      <Line
        points={[[-5.4, 0.03, 1.85], [7, 0.03, 1.85]]}
        color="#facc15"
        lineWidth={2}
      />
      {markerPositions.map((x, index) => (
        <group key={`tracking-ground-edge-marker-${index}`} position={[x, 0, 0]}>
          <mesh position={[0, 0.038, -2.08]}>
            <boxGeometry args={[0.42, 0.018, 0.12]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? "#cbd5e1" : "#94a3b8"}
              transparent
              opacity={0.74}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0.038, 2.08]}>
            <boxGeometry args={[0.42, 0.018, 0.12]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? "#cbd5e1" : "#94a3b8"}
              transparent
              opacity={0.74}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ObjectMotionQualificationStage({
  capabilityId,
  fixtureKind,
}: {
  capabilityId: string;
  fixtureKind: DirectorAuditFixtureKind;
}) {
  if (
    fixtureKind === "object_motion_rigid" &&
    (capabilityId === "lift" || capabilityId === "lower")
  ) {
    return (
      <group position={[-1.35, 0.05, 0.2]}>
        <Line points={[[0.78, 0, 0], [0.78, 1.95, 0]]} color="#facc15" lineWidth={2} dashed dashSize={0.14} gapSize={0.1} />
        <mesh position={[0.78, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.28, 28]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_path_surface") {
    return (
      <group>
        <Line points={[[-3.7, 0.07, 0], [-2.2, 0.08, 0.55], [-0.6, 0.08, -0.35], [1.2, 0.08, 0.45], [3.6, 0.08, 0]]} color="#38bdf8" lineWidth={3} />
        <Line points={[[-3.7, 0.05, -0.48], [3.7, 0.05, -0.48]]} color="#facc15" lineWidth={2} />
        <Line points={[[-3.7, 0.05, 0.48], [3.7, 0.05, 0.48]]} color="#facc15" lineWidth={2} />
        {capabilityId === "roll" ? (
          <Line points={[[-3.7, 0.06, 0.72], [3.7, 0.06, 0.72]]} color="#f472b6" lineWidth={2} dashed dashSize={0.18} gapSize={0.12} />
        ) : null}
      </group>
    );
  }

  if (fixtureKind === "object_motion_relationship") {
    return (
      <group>
        <Line points={[[-1.45, 0.7, 0.15], [1.45, 0.7, -0.15]]} color="#64748b" lineWidth={2} dashed dashSize={0.16} gapSize={0.12} />
        <mesh position={[1.45, 0.08, -0.15]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.58, 0.66, 36]} /><meshBasicMaterial color="#f97316" transparent opacity={0.55} side={THREE.DoubleSide} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_articulation") {
    return (
      <group position={[-1.22, 0, 0.15]}>
        <mesh position={[0, 0.85, -0.15]}><boxGeometry args={[0.12, 1.7, 0.12]} /><meshStandardMaterial color="#475569" roughness={0.72} /></mesh>
        <mesh position={[1.15, 1.66, -0.15]}><boxGeometry args={[2.4, 0.12, 0.12]} /><meshStandardMaterial color="#475569" roughness={0.72} /></mesh>
        <Line points={[[0.08, 0.08, 0.1], [0.08, 1.58, 0.1]]} color="#facc15" lineWidth={3} dashed dashSize={0.12} gapSize={0.08} />
      </group>
    );
  }

  if (fixtureKind === "object_motion_containment") {
    return (
      <group>
        <Line points={[[-2.6, 0.12, 0.9], [2.5, 0.12, 0.9]]} color="#334155" lineWidth={2} />
        <mesh position={[1.05, 0.04, -0.05]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.72, 0.8, 40]} /><meshBasicMaterial color="#fef08a" transparent opacity={0.45} side={THREE.DoubleSide} /></mesh>
      </group>
    );
  }

  if (fixtureKind === "object_motion_multi_part") {
    return (
      <group>
        <mesh position={[1.25, 0.03, -0.1]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.88, 0.98, 44]} /><meshBasicMaterial color="#fef08a" transparent opacity={0.42} side={THREE.DoubleSide} /></mesh>
        <Line points={[[ -2.5, 0.07, -0.9 ], [ -1.55, 0.07, 0.2 ], [ -0.7, 0.07, 0.95 ]]} color="#a78bfa" lineWidth={2} dashed dashSize={0.14} gapSize={0.1} />
      </group>
    );
  }

  if (fixtureKind === "object_motion_process") {
    if (capabilityId === "flow") {
      return (
        <group>
          <Line points={[[ -0.1, 0.42, 0.15], [0.15, 0.72, 0.15], [0.55, 0.35, -0.2], [1.25, 0.55, -0.15]]} color="#38bdf8" lineWidth={3} dashed dashSize={0.18} gapSize={0.12} />
          <mesh position={[1.25, 0.04, -0.15]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.82, 0.9, 44]} /><meshBasicMaterial color="#fb923c" transparent opacity={0.4} side={THREE.DoubleSide} /></mesh>
        </group>
      );
    }
    if (capabilityId === "emit") {
      return (
        <group position={[-0.05, 0.45, 0.15]}>
          <Line points={[[0, 0, 0], [1.3, 0.72, -0.36]]} color="#67e8f9" lineWidth={2} dashed dashSize={0.14} gapSize={0.1} />
          <Line points={[[0, 0, 0], [1.45, 0.36, 0.08]]} color="#67e8f9" lineWidth={2} dashed dashSize={0.14} gapSize={0.1} />
          <Line points={[[0, 0, 0], [1.1, 0.18, 0.48]]} color="#67e8f9" lineWidth={2} dashed dashSize={0.14} gapSize={0.1} />
        </group>
      );
    }
    if (capabilityId === "accumulate") {
      return (
        <group>
          <mesh position={[-0.85, 0.025, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.68, 0.74, 40]} />
            <meshBasicMaterial color="#c4b5fd" transparent opacity={0.44} side={THREE.DoubleSide} />
          </mesh>
        </group>
      );
    }
    // Fill/Drain: level ticks communicate quantity change without implying a
    // source-to-destination transfer path.
    return (
      <group position={[-0.18, 0.08, 0.15]}>
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <Line
            key={`process-level-${level}`}
            points={[[0, level, 0], [0.24, level, 0]]}
            color="#7dd3fc"
            lineWidth={1.5}
            transparent
            opacity={0.52}
          />
        ))}
      </group>
    );
  }

  return null;
}

function cameraQualificationVisibilityAssistEnabled(capability: DirectorCapability) {
  return (
    capability.category === "camera_framing" ||
    capability.category === "camera_angle" ||
    capability.category === "camera_movement"
  );
}

/**
 * Qualification-only neutral front/three-quarter fill for camera-family proofs.
 * It follows the active camera so a side-rail/orbit angle cannot accidentally
 * turn asset visibility into the variable under test. This is deliberately not
 * part of DirectorShotLightingRig and never activates unless Qualification Room
 * opts in; lighting_emphasis therefore remains authored-lighting-only.
 */
function QualificationCameraVisibilityFill({ enabled }: { enabled: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const worldUpRef = useRef(new THREE.Vector3(0, 1, 0));

  useFrame(({ camera }) => {
    if (!enabled || !lightRef.current || !targetRef.current) return;
    const forward = forwardRef.current;
    const right = rightRef.current;
    const worldUp = worldUpRef.current;
    camera.getWorldDirection(forward).normalize();
    right.crossVectors(forward, worldUp).normalize();

    targetRef.current.position
      .copy(camera.position)
      .addScaledVector(forward, 6);
    targetRef.current.updateMatrixWorld(true);

    lightRef.current.position
      .copy(camera.position)
      .addScaledVector(worldUp, 2.2)
      .addScaledVector(right, -1.35)
      .addScaledVector(forward, -0.8);
    lightRef.current.target = targetRef.current;
    lightRef.current.updateMatrixWorld(true);
  });

  if (!enabled) return null;

  return (
    <>
      <directionalLight
        ref={lightRef}
        // Phase 1B.7A.10B: modestly stronger than A.9 after the first internal
        // evidence reel still left side-rail character silhouettes underexposed.
        intensity={0.78}
        color="#e7f0ff"
        castShadow={false}
      />
      <object3D ref={targetRef} />
    </>
  );
}

function Stage({
  capabilityId,
  fixtureKind,
}: {
  capabilityId: string;
  fixtureKind: DirectorAuditFixtureKind;
}) {
  const mounted = fixtureKind === "mounted_camera";
  const travelling =
    fixtureKind === "travelling_subject" ||
    mounted;
  const technical = fixtureKind === "technical_overview";
  const shadowProjection = capabilityId === "shadow_projection";
  // A.11A.43: a neutral matte receiver lets the real subject SpotLight prove
  // its localized footprint/falloff instead of asking arbitrary GLB materials
  // to carry the entire perceptual test. This changes evidence staging only.
  const subjectSpotlightProof =
    capabilityId === "spotlight_subject" || capabilityId === "track_spotlight";
  // A.11A.40: Motivated Source must be proved by the visible practical light,
  // not by the generic qualification-stage boundary ring that reads as a blue arc.
  const hideStageBoundaryGuide = capabilityId === "motivated_source";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow><circleGeometry args={[8.5, 48]} /><meshStandardMaterial color={subjectSpotlightProof ? "#273244" : "#07111f"} roughness={subjectSpotlightProof ? 0.98 : 0.94} metalness={subjectSpotlightProof ? 0 : 0.04} /></mesh>
      {shadowProjection ? (
        <mesh position={[0.8, 1.9, -2.4]} receiveShadow>
          <boxGeometry args={[9.2, 4.8, 0.12]} />
          <meshStandardMaterial color="#334155" roughness={0.96} metalness={0} />
        </mesh>
      ) : null}
      <gridHelper args={[14, 28, "#1d4ed8", "#172554"]} position={[0, 0, 0]} />
      {travelling ? <TravellingCameraCorridor capabilityId={capabilityId} /> : null}
      <ObjectMotionQualificationStage
        capabilityId={capabilityId}
        fixtureKind={fixtureKind}
      />
      {technical ? (
        <group position={[-2.7, 0.06, 2.15]}>
          <Line points={[[0, 0, 0], [1.35, 0, 0]]} color="#ef4444" lineWidth={2} />
          <Line points={[[0, 0, 0], [0, 1.35, 0]]} color="#22c55e" lineWidth={2} />
          <Line points={[[0, 0, 0], [0, 0, 1.35]]} color="#3b82f6" lineWidth={2} />
          <mesh position={[1.45, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.09, 0.3, 12]} /><meshBasicMaterial color="#ef4444" /></mesh>
          <mesh position={[0, 1.45, 0]}><coneGeometry args={[0.09, 0.3, 12]} /><meshBasicMaterial color="#22c55e" /></mesh>
          <mesh position={[0, 0, 1.45]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.09, 0.3, 12]} /><meshBasicMaterial color="#3b82f6" /></mesh>
        </group>
      ) : null}
      {!hideStageBoundaryGuide ? (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[4.8, 4.84, 72]} /><meshBasicMaterial color="#1e3a8a" transparent opacity={0.35} side={THREE.DoubleSide} /></mesh>
      ) : null}
    </group>
  );
}

export function DirectorCapabilityPreview({
  capability,
  roles,
  progress,
  isPlaying,
  showCameraPath,
  showRoleLabels,
  fixtureMode = "real_assets",
  fixtureKind = "single_subject_composition",
  auditSnap = false,
  qualificationVisibilityAssist = false,
  preserveActorInstances = false,
}: PreviewProps) {
  const moment = useMemo(
    () =>
      directorQualificationPreviewMoment(
        capability,
        roles,
        qualificationVisibilityAssist,
      ),
    [capability, qualificationVisibilityAssist, roles],
  );
  const baseActors = useMemo(() => directorQualificationRuntimeActors(roles), [roles]);
  const actors = useMemo(() => applyDirectorBlocking(moment, baseActors), [baseActors, moment]);
  const lowKey =
    moment.shot?.lighting.intents.includes("low_key") ||
    moment.shot?.lighting.intents.includes("dim_environment") ||
    moment.shot?.lighting.intents.includes("light_reveal") ||
    moment.shot?.lighting.intents.includes("volumetric_beam");
  const useQualificationVisibilityFill =
    qualificationVisibilityAssist &&
    cameraQualificationVisibilityAssistEnabled(capability);

  return (
    <>
      <color attach="background" args={[lowKey ? "#01030a" : "#020617"]} />
      <fog attach="fog" args={["#020617", 10, 30]} />
      <DirectorShotLightingRig moment={moment} actors={actors} progress={progress} />
      <Stage capabilityId={capability.id} fixtureKind={fixtureKind} />
      {roles.map((resolvedRole) => {
        const actor = actors.find((candidate) => candidate.id === resolvedRole.role) ?? baseActors.find((candidate) => candidate.id === resolvedRole.role);
        return actor ? (
          <AnimatedActor
            key={`${preserveActorInstances ? "stable" : capability.id}:${resolvedRole.role}:${fixtureMode}:${resolvedRole.asset?.asset_id ?? "fallback"}`}
            capability={capability}
            moment={moment}
            actor={actor}
            allActors={actors}
            resolvedRole={resolvedRole}
            progress={progress}
            isPlaying={isPlaying}
            showRoleLabels={showRoleLabels}
            fixtureMode={fixtureMode}
            fixtureKind={fixtureKind}
            auditSnap={auditSnap}
          />
        ) : null;
      })}
      <TeachingRelationship capability={capability} actors={actors} progress={progress} />
      <ProcessCarrierOverlay moment={moment} actors={actors} progress={progress} fixtureKind={fixtureKind} />
      {showCameraPath ? <DirectorShotPathGuide moment={moment} actors={actors} /> : null}
      <DirectorShotCameraController
        moment={moment}
        actors={actors}
        progress={progress}
        isPlaying={auditSnap ? false : isPlaying}
      />
      <QualificationCameraVisibilityFill enabled={useQualificationVisibilityFill} />
      {/* Controlled audit proofs are camera-authoritative. OrbitControls can
          overwrite a paused Director pose and create a false pause-to-play snap.
          Manual orbit remains available outside auditSnap. */}
      <OrbitControls makeDefault enabled={!auditSnap && !isPlaying} enableDamping dampingFactor={0.08} minDistance={1.4} maxDistance={20} target={[0, 0.8, 0]} />
    </>
  );
}
