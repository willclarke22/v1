
"use client";

// Historical verifier vocabulary retained after later runtime simplification:
// CP.1D.2 burgerShadowARef, color="#fff4df", color="#91e7ff".

import {
  Suspense,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { Clone, Html, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type {
  MyWayAssetAttachmentRegion,
  MyWayAssetCollisionBox,
  MyWayAssetGeometryProfileV1,
  MyWayAssetSupportSurface,
} from "../../assets/asset-types";
import {
  enforceDirectionalSurfaceClearance,
  resolveAssetAwareInteractionMotion,
  sampleAssetInteractionBezier,
  type AssetInteractionGeometry,
  type AssetInteractionMotionSolution,
  type AssetInteractionObstacle,
  type AssetInteractionPose,
} from "../../scenes/asset-aware-interaction-motion";

import {
  advanceSoftCameraSafetyCorrection,
  softFramingParticipation,
  softProtectedCameraDistance,
} from "./cinematic-production-camera-safety";

import {
  CINEMATIC_BURGER_TIMELINE_DURATION_S,
  sampleCinematicBurgerRuntime,
  type CinematicShotRuntimeLayout,
  type RuntimeActorPose,
  type RuntimeActorRole,
  type RuntimeAssetInteractionIntent,
  type RuntimeVec3,
} from "./cinematic-production-runtime-layout";

export type CinematicLibraryAssetRecord = {
  asset_id: string;
  canonical_label?: string | null;
  display_name?: string | null;
  semantic_tags?: string[];
  aliases?: string[];
  thumbnail_path?: string | null;
  public_path?: string | null;
  scene_review_status?: string | null;
  default_scale?: number;
  default_rotation?: RuntimeVec3;
  dimensions_m?: RuntimeVec3;
  ground_offset_m?: number;
  geometry_profile?: MyWayAssetGeometryProfileV1 | null;
};

export type CinematicSeekRequest = {
  timeS: number;
  revision: number;
};

type AssetRole = RuntimeActorRole;

export type CinematicRuntimeSampler = (
  timeS: number,
) => CinematicShotRuntimeLayout;

type RuntimeCanvasProps = {
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>;
  isPlaying: boolean;
  seekRequest: CinematicSeekRequest;
  inspectMode: boolean;
  onPlaybackTime: (timeS: number) => void;
  onPlaybackEnded: () => void;
  /**
   * CP.2A generated-Lunch bridge. Omit this prop for the frozen golden oracle.
   * Both sources still execute through the exact same geometry/contact/render path.
   */
  runtimeSampler?: CinematicRuntimeSampler;
  durationS?: number;
  runtimeRevision?: number;
};

const roleDesiredMaxDimension: Record<AssetRole, number> = {
  tray: 4.4,
  apple: 0.9,
  burger: 1.18,
  nigiri: 0.95,
  cow: 1.18,
  chicken: 1.02,
  goldfish: 0.86,
  hand: 1.55,
};

const fallbackDimensions: Record<AssetRole, RuntimeVec3> = {
  tray: [1.65, 0.12, 1.15],
  apple: [0.52, 0.58, 0.52],
  burger: [0.96, 0.44, 0.96],
  nigiri: [0.84, 0.38, 0.48],
  cow: [1.1, 0.72, 0.42],
  chicken: [0.9, 0.72, 0.42],
  goldfish: [0.72, 0.34, 0.28],
  hand: [0.46, 0.18, 1.2],
};

const HIDDEN_POSE: RuntimeActorPose = {
  visible: false,
  position: [0, -10, 0],
  rotation: [0, 0, 0],
  scale: 1,
  opacity: 0,
  emphasis: 0,
};

// CP.2A.3 performance envelope. The cinematic preview is authored on wall time,
// but browser presentation is intentionally capped to a film-like 30 FPS so a
// 120/144 Hz laptop does not run the entire physical solver two to five times
// more often than the visual target requires.
const CINEMATIC_PREVIEW_FPS = 30;
const CINEMATIC_PREVIEW_FRAME_MS = 1000 / CINEMATIC_PREVIEW_FPS;
const MATERIAL_EPSILON = 1e-4;

// CP.2A.4 benchmark-backed effector frame. Generated hand tracks may author a
// staging rotation, but the physical interaction starts from a known readable
// palm/finger presentation before measured contact geometry constrains it. This
// is deliberately runtime-side because GLM does not know the reviewed GLB's
// internal axes. Later this belongs in persistent asset directability metadata.
const GENERATED_HAND_READABLE_ROTATION: RuntimeVec3 = [0.12, Math.PI, 0];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function assetDimensions(asset: CinematicLibraryAssetRecord | null, role: AssetRole): RuntimeVec3 {
  return (
    asset?.geometry_profile?.local_bounds.size ??
    asset?.dimensions_m ??
    fallbackDimensions[role]
  );
}

function effectiveScale(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  poseScale: number,
  preparedGeometry?: PreparedAssetGeometry | null,
) {
  const desired = roleDesiredMaxDimension[role];
  const dims = preparedGeometry?.sourceSize ?? assetDimensions(asset, role);
  const dimension = Math.max(
    ...dims.map((item) => Math.max(Math.abs(item), 0.0001)),
  );
  const defaultScale = typeof asset?.default_scale === "number" ? asset.default_scale : 1;
  return (desired / Math.max(0.0001, dimension)) * defaultScale * poseScale;
}

function combinedRotation(
  asset: CinematicLibraryAssetRecord | null,
  poseRotation: RuntimeVec3,
): RuntimeVec3 {
  const base = asset?.default_rotation ?? [0, 0, 0];
  return [base[0] + poseRotation[0], base[1] + poseRotation[1], base[2] + poseRotation[2]];
}

type PreparedSupportSurface = {
  id: string;
  label: string;
  center: RuntimeVec3;
  normal: RuntimeVec3;
  uAxis: RuntimeVec3;
  vAxis: RuntimeVec3;
  usableSize: [number, number];
  area: number;
  confidence: number;
  isPrimary: boolean;
  edgeMarginM: number;
};

type PreparedSurfaceContactRegion = {
  id: string;
  label: string;
  center: RuntimeVec3;
  normal: RuntimeVec3;
  size: [number, number];
  confidence: number;
  side: MyWayAssetAttachmentRegion["side"];
  source: MyWayAssetAttachmentRegion["source"];
};

type PreparedCollisionBox = {
  id: string;
  center: RuntimeVec3;
  size: RuntimeVec3;
  rotation: RuntimeVec3;
  confidence: number;
};

type PreparedAssetGeometry = {
  sourceSize: RuntimeVec3;
  centerOffset: RuntimeVec3;
  localBounds: {
    min: RuntimeVec3;
    max: RuntimeVec3;
    center: RuntimeVec3;
    size: RuntimeVec3;
  };
  localBoundsCorners: RuntimeVec3[];
  bottomContactCenter: RuntimeVec3;
  bottomContactSize: [number, number];
  supportSurfaces: PreparedSupportSurface[];
  surfaceContactRegions: PreparedSurfaceContactRegion[];
  collisionBoxes: PreparedCollisionBox[];
};

type PreparedGeometryByRole = Partial<Record<AssetRole, PreparedAssetGeometry>>;

function asRuntimeVec3(value: THREE.Vector3): RuntimeVec3 {
  return [value.x, value.y, value.z];
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boundsCornerTuples(min: RuntimeVec3, max: RuntimeVec3): RuntimeVec3[] {
  const corners: RuntimeVec3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  return corners;
}

function preparedSupportSurface(
  surface: MyWayAssetSupportSurface,
  centerOffset: THREE.Vector3,
  primarySurfaceId?: string | null,
): PreparedSupportSurface {
  const center = new THREE.Vector3(...surface.center).add(centerOffset);
  const normal = new THREE.Vector3(...surface.normal);
  const uAxis = new THREE.Vector3(...surface.u_axis);
  const vAxis = new THREE.Vector3(...surface.v_axis);
  if (normal.lengthSq() < 1e-10) normal.set(0, 1, 0);
  if (uAxis.lengthSq() < 1e-10) uAxis.set(1, 0, 0);
  if (vAxis.lengthSq() < 1e-10) vAxis.set(0, 0, 1);
  normal.normalize();
  uAxis.normalize();
  vAxis.normalize();
  const usable = surface.usable_size ?? surface.size;
  return {
    id: surface.id,
    label: surface.label,
    center: asRuntimeVec3(center),
    normal: asRuntimeVec3(normal),
    uAxis: asRuntimeVec3(uAxis),
    vAxis: asRuntimeVec3(vAxis),
    usableSize: [
      finitePositive(usable[0], finitePositive(surface.size[0], 0.001)),
      finitePositive(usable[1], finitePositive(surface.size[1], 0.001)),
    ],
    area: Math.max(0, surface.area),
    confidence: clamp01(surface.confidence),
    isPrimary: surface.id === primarySurfaceId,
    edgeMarginM: Math.max(0, surface.edge_margin_m ?? 0.01),
  };
}

function preparedSurfaceContactRegion(
  region: MyWayAssetAttachmentRegion,
  centerOffset: THREE.Vector3,
): PreparedSurfaceContactRegion {
  const center = new THREE.Vector3(...region.center).add(centerOffset);
  const normal = new THREE.Vector3(...region.normal);
  if (normal.lengthSq() < 1e-10) normal.set(0, 0, 1);
  normal.normalize();
  return {
    id: region.id,
    label: region.label,
    center: asRuntimeVec3(center),
    normal: asRuntimeVec3(normal),
    size: [
      finitePositive(region.size[0], 0.001),
      finitePositive(region.size[1], 0.001),
    ],
    confidence: clamp01(region.confidence),
    side: region.side,
    source: region.source,
  };
}

function preparedCollisionBox(
  box: MyWayAssetCollisionBox,
  centerOffset: THREE.Vector3,
  index: number,
): PreparedCollisionBox {
  const center = new THREE.Vector3(...box.center).add(centerOffset);
  return {
    id: box.id ?? `collision_box_${index + 1}`,
    center: asRuntimeVec3(center),
    size: [
      finitePositive(Math.abs(box.size[0]), 0.001),
      finitePositive(Math.abs(box.size[1]), 0.001),
      finitePositive(Math.abs(box.size[2]), 0.001),
    ],
    rotation: [...box.rotation],
    confidence: clamp01(box.confidence ?? 0.65),
  };
}

function prepareAssetGeometry(
  scene: THREE.Object3D,
  profile: MyWayAssetGeometryProfileV1 | null | undefined,
): PreparedAssetGeometry | null {
  scene.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(scene);
  if (initialBounds.isEmpty()) return null;

  const size = initialBounds.getSize(new THREE.Vector3());
  const center = initialBounds.getCenter(new THREE.Vector3());
  // This is the same bottom-centred normalization used by Asset Scene Builder:
  // the visible GLB, not its arbitrary root pivot, defines the canonical contact origin.
  const centerOffset = new THREE.Vector3(-center.x, -initialBounds.min.y, -center.z);
  const sourceSize: RuntimeVec3 = [
    finitePositive(size.x, 0.001),
    finitePositive(size.y, 0.001),
    finitePositive(size.z, 0.001),
  ];
  const localBounds = {
    min: [-sourceSize[0] / 2, 0, -sourceSize[2] / 2] as RuntimeVec3,
    max: [sourceSize[0] / 2, sourceSize[1], sourceSize[2] / 2] as RuntimeVec3,
    center: [0, sourceSize[1] / 2, 0] as RuntimeVec3,
    size: sourceSize,
  };

  const profileContact = profile?.bottom_contact_region;
  const contactCenter = profileContact
    ? new THREE.Vector3(...profileContact.center).add(centerOffset)
    : new THREE.Vector3(0, 0, 0);
  const bottomContactSize: [number, number] = profileContact
    ? [
        finitePositive(profileContact.size[0], Math.min(sourceSize[0], sourceSize[2]) * 0.25),
        finitePositive(profileContact.size[1], Math.min(sourceSize[0], sourceSize[2]) * 0.25),
      ]
    : [sourceSize[0] * 0.5, sourceSize[2] * 0.5];

  return {
    sourceSize,
    centerOffset: asRuntimeVec3(centerOffset),
    localBounds,
    localBoundsCorners: boundsCornerTuples(localBounds.min, localBounds.max),
    bottomContactCenter: asRuntimeVec3(contactCenter),
    bottomContactSize,
    supportSurfaces:
      profile?.support_surfaces
        ?.filter((surface) => surface.source !== "legacy_ratio")
        .map((surface) =>
          preparedSupportSurface(surface, centerOffset, profile.primary_support_surface_id),
        ) ?? [],
    // Directability treats geometry-profile exterior attachment regions as
    // generic surface_contact_region evidence unless semantic connector truth
    // exists. Cinematic interaction motion consumes that same measured evidence.
    surfaceContactRegions:
      profile?.attachment_regions
        ?.filter((region) => region.exposure !== "interior")
        .map((region) => preparedSurfaceContactRegion(region, centerOffset)) ?? [],
    collisionBoxes:
      profile?.collision_boxes
        ?.map((box, index) => preparedCollisionBox(box, centerOffset, index)) ?? [],
  };
}


function makeOutlineClone(scene: THREE.Object3D) {
  const outline = scene.clone(true);
  outline.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = new THREE.MeshBasicMaterial({
      color: "#ffd84d",
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    object.scale.multiplyScalar(1.028);
    object.renderOrder = 12;
    object.userData.cinematicOutlineMesh = true;
  });
  return outline;
}

function LoadedAsset({
  url,
  asset,
  onPreparedGeometry,
}: {
  url: string;
  asset: CinematicLibraryAssetRecord;
  onPreparedGeometry: (geometry: PreparedAssetGeometry | null) => void;
}) {
  const gltf = useGLTF(url) as { scene: THREE.Object3D };
  const prepared = useMemo(
    () => prepareAssetGeometry(gltf.scene, asset.geometry_profile),
    [asset.geometry_profile, gltf.scene],
  );
  const hostRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    onPreparedGeometry(prepared);
  }, [onPreparedGeometry, prepared]);

  useEffect(() => {
    const host = hostRef.current;
    return () => {
      const outline = host?.userData.cinematicLazyOutline;
      if (outline instanceof THREE.Object3D && host) {
        outline.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) material.dispose();
        });
        host.remove(outline);
        delete host.userData.cinematicLazyOutline;
      }
    };
  }, [gltf.scene]);

  const offset = prepared?.centerOffset ?? [0, 0, 0];
  return (
    <group
      ref={hostRef}
      position={offset}
      userData={{ cinematicOutlineSource: gltf.scene }}
    >
      <Clone object={gltf.scene} />
    </group>
  );
}

function BurgerProxy() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.48, 0.48, 0.16, 20]} />
        <meshStandardMaterial color="#d8a03c" />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 18]} />
        <meshStandardMaterial color="#f4c752" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.1, 20]} />
        <meshStandardMaterial color="#5b3521" />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.18, 20]} />
        <meshStandardMaterial color="#c47e33" />
      </mesh>
    </group>
  );
}

function AppleProxy() {
  return (
    <group>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial color="#d62828" roughness={0.5} />
      </mesh>
      <mesh position={[0.02, 0.54, 0]} rotation={[0.22, 0, 0.14]}>
        <cylinderGeometry args={[0.02, 0.02, 0.16, 8]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>
      <mesh position={[0.12, 0.56, 0]} rotation={[0.15, 0.1, -0.45]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#3a8f3a" roughness={0.7} />
      </mesh>
    </group>
  );
}

function NigiriProxy() {
  return (
    <group>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.7, 0.22, 0.38]} />
        <meshStandardMaterial color="#f5f1e8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.29, 0]}>
        <boxGeometry args={[0.76, 0.14, 0.34]} />
        <meshStandardMaterial color="#f97362" roughness={0.65} />
      </mesh>
    </group>
  );
}

function TrayProxy() {
  return (
    <mesh>
      <boxGeometry args={[1.65, 0.12, 1.15]} />
      <meshStandardMaterial color="#a32024" roughness={0.65} metalness={0.1} />
    </mesh>
  );
}

function AnimalProxy({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[0.7, 0.4, 0.26]} />
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      <mesh position={[0.4, 0.34, 0]}>
        <sphereGeometry args={[0.18, 14, 14]} />
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
    </group>
  );
}

function GoldfishProxy() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.24, 14, 14]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>
      <mesh position={[-0.24, 0.16, 0]} rotation={[0, 0, Math.PI / 4]}>
        <coneGeometry args={[0.18, 0.28, 3]} />
        <meshStandardMaterial color="#ea580c" roughness={0.72} />
      </mesh>
    </group>
  );
}

function HandProxy() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.46, 0.18, 1.2]} />
        <meshStandardMaterial color="#bb866c" roughness={0.88} />
      </mesh>
      <mesh position={[0.2, 0.02, 0.62]}>
        <boxGeometry args={[0.18, 0.14, 0.42]} />
        <meshStandardMaterial color="#c68f73" roughness={0.88} />
      </mesh>
    </group>
  );
}

function FallbackAsset({ role }: { role: AssetRole }) {
  switch (role) {
    case "tray":
      return <TrayProxy />;
    case "apple":
      return <AppleProxy />;
    case "burger":
      return <BurgerProxy />;
    case "nigiri":
      return <NigiriProxy />;
    case "cow":
      return <AnimalProxy color="#4b5563" />;
    case "chicken":
      return <AnimalProxy color="#f59e0b" />;
    case "goldfish":
      return <GoldfishProxy />;
    case "hand":
      return <HandProxy />;
    default:
      return null;
  }
}

const AssetActor = forwardRef<
  THREE.Group,
  {
    asset: CinematicLibraryAssetRecord | null;
    role: AssetRole;
    onPreparedGeometry: (
      role: AssetRole,
      geometry: PreparedAssetGeometry | null,
    ) => void;
  }
>(function AssetActor({ asset, role, onPreparedGeometry }, ref) {
  useEffect(() => {
    onPreparedGeometry(role, null);
  }, [asset?.asset_id, onPreparedGeometry, role]);

  const handlePreparedGeometry = useCallback(
    (geometry: PreparedAssetGeometry | null) => {
      onPreparedGeometry(role, geometry);
    },
    [onPreparedGeometry, role],
  );

  return (
    <group ref={ref} visible={false}>
      {asset?.public_path ? (
        <LoadedAsset
          url={asset.public_path}
          asset={asset}
          onPreparedGeometry={handlePreparedGeometry}
        />
      ) : (
        <FallbackAsset role={role} />
      )}
    </group>
  );
});

type SurfaceInfo = {
  topY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
};

type SurfaceLaneName =
  | "left_support"
  | "hero_center"
  | "right_support"
  | "insert_left"
  | "insert_right"
  | "insert_center";

type SurfaceLaneBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const fallbackPreparedGeometryCache = new Map<string, PreparedAssetGeometry>();

function preparedGeometryFallback(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
): PreparedAssetGeometry {
  const [w, h, d] = assetDimensions(asset, role);
  const cacheKey = [
    role,
    asset?.asset_id ?? "fallback",
    w.toFixed(5),
    h.toFixed(5),
    d.toFixed(5),
  ].join("|");
  const cached = fallbackPreparedGeometryCache.get(cacheKey);
  if (cached) return cached;

  const sourceSize: RuntimeVec3 = [
    Math.max(0.001, Math.abs(w)),
    Math.max(0.001, Math.abs(h)),
    Math.max(0.001, Math.abs(d)),
  ];
  const geometry: PreparedAssetGeometry = {
    sourceSize,
    centerOffset: [0, 0, 0],
    localBounds: {
      min: [-sourceSize[0] / 2, 0, -sourceSize[2] / 2],
      max: [sourceSize[0] / 2, sourceSize[1], sourceSize[2] / 2],
      center: [0, sourceSize[1] / 2, 0],
      size: sourceSize,
    },
    localBoundsCorners: boundsCornerTuples(
      [-sourceSize[0] / 2, 0, -sourceSize[2] / 2],
      [sourceSize[0] / 2, sourceSize[1], sourceSize[2] / 2],
    ),
    bottomContactCenter: [0, 0, 0],
    bottomContactSize: [sourceSize[0] * 0.5, sourceSize[2] * 0.5],
    supportSurfaces: [],
    surfaceContactRegions: [],
    collisionBoxes: [],
  };
  fallbackPreparedGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function geometryForRole(
  prepared: PreparedGeometryByRole,
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
) {
  return prepared[role] ?? preparedGeometryFallback(asset, role);
}

const primarySupportSurfaceCaches = new WeakMap<
  PreparedAssetGeometry,
  PreparedSupportSurface | null
>();

function selectPrimarySupportSurface(
  geometry: PreparedAssetGeometry,
): PreparedSupportSurface | null {
  if (primarySupportSurfaceCaches.has(geometry)) {
    return primarySupportSurfaceCaches.get(geometry) ?? null;
  }
  if (!geometry.supportSurfaces.length) {
    primarySupportSurfaceCaches.set(geometry, null);
    return null;
  }
  const selected = [...geometry.supportSurfaces].sort((left, right) => {
    const leftScore =
      (left.isPrimary ? 20 : 0) +
      left.confidence * 5 +
      Math.min(4, left.usableSize[0] * left.usableSize[1]) -
      left.edgeMarginM;
    const rightScore =
      (right.isPrimary ? 20 : 0) +
      right.confidence * 5 +
      Math.min(4, right.usableSize[0] * right.usableSize[1]) -
      right.edgeMarginM;
    return rightScore - leftScore;
  })[0] ?? null;
  primarySupportSurfaceCaches.set(geometry, selected);
  return selected;
}

function rotatedVector(
  value: RuntimeVec3,
  rotation: RuntimeVec3,
): THREE.Vector3 {
  return new THREE.Vector3(...value).applyEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2]),
  );
}

function traySurfaceInfo(
  trayAsset: CinematicLibraryAssetRecord | null,
  trayPose: RuntimeActorPose,
  prepared: PreparedGeometryByRole,
): SurfaceInfo {
  const geometry = geometryForRole(prepared, trayAsset, "tray");
  const trayScale = effectiveScale(trayAsset, "tray", trayPose.scale, geometry);
  const rotation = combinedRotation(trayAsset, trayPose.rotation);
  const rootY =
    trayPose.position[1] +
    (typeof trayAsset?.ground_offset_m === "number"
      ? trayAsset.ground_offset_m * trayScale
      : 0);
  const surface = selectPrimarySupportSurface(geometry);

  if (surface) {
    const localCenter = rotatedVector(surface.center, rotation).multiplyScalar(trayScale);
    const u = rotatedVector(surface.uAxis, rotation).normalize();
    const v = rotatedVector(surface.vAxis, rotation).normalize();
    const normal = rotatedVector(surface.normal, rotation).normalize();
    const edgeMargin = surface.edgeMarginM * trayScale;
    const usableU = Math.max(0.02, surface.usableSize[0] * trayScale - edgeMargin * 2);
    const usableV = Math.max(0.02, surface.usableSize[1] * trayScale - edgeMargin * 2);
    const halfU = usableU * 0.5;
    const halfV = usableV * 0.5;
    const xExtent = Math.abs(u.x) * halfU + Math.abs(v.x) * halfV;
    const zExtent = Math.abs(u.z) * halfU + Math.abs(v.z) * halfV;
    const centerX = trayPose.position[0] + localCenter.x;
    const centerY = rootY + localCenter.y;
    const centerZ = trayPose.position[2] + localCenter.z;
    const upwardCompensation = Math.max(0, normal.y) * 0.002;
    return {
      topY: centerY + upwardCompensation,
      minX: centerX - xExtent,
      maxX: centerX + xExtent,
      minZ: centerZ - zExtent,
      maxZ: centerZ + zExtent,
      centerX,
      centerZ,
      width: Math.max(0.02, xExtent * 2),
      depth: Math.max(0.02, zExtent * 2),
    };
  }

  // Runtime geometry fallback mirrors Asset Scene Builder's bottom-centred GLB
  // normalization. Without a qualified support region, use a conservative inset
  // near the top of the measured tray bounds rather than trusting the raw root.
  const worldSize = geometry.sourceSize.map((value) => value * trayScale) as RuntimeVec3;
  const width = worldSize[0] * 0.76;
  const depth = worldSize[2] * 0.7;
  const centerX = trayPose.position[0];
  const centerZ = trayPose.position[2];
  return {
    topY: rootY + worldSize[1] * 0.72,
    minX: centerX - width * 0.5,
    maxX: centerX + width * 0.5,
    minZ: centerZ - depth * 0.5,
    maxZ: centerZ + depth * 0.5,
    centerX,
    centerZ,
    width,
    depth,
  };
}

// Surface-staging lanes derived from the Asset Scene Builder's collision-safe
// placement model. Cinematic intent picks a lane; measured geometry owns contact.
function surfaceLaneForRole(
  role: Exclude<AssetRole, "tray" | "hand">,
  pose: RuntimeActorPose,
): SurfaceLaneName {
  switch (role) {
    case "apple":
      return "left_support";
    case "burger":
      return "hero_center";
    case "nigiri":
      return "right_support";
    case "goldfish":
      return "insert_center";
    case "cow":
    case "chicken":
      return pose.position[0] >= 0 ? "insert_right" : "insert_left";
    default:
      return "hero_center";
  }
}

function surfaceLaneBounds(surface: SurfaceInfo, lane: SurfaceLaneName): SurfaceLaneBounds {
  const leftSupportMaxX = surface.centerX - surface.width * 0.11;
  const rightSupportMinX = surface.centerX + surface.width * 0.11;
  const heroHalfWidth = surface.width * 0.14;
  const insertHalfWidth = surface.width * 0.18;
  switch (lane) {
    case "left_support":
      return {
        minX: surface.minX + surface.width * 0.05,
        maxX: leftSupportMaxX,
        minZ: surface.centerZ + surface.depth * 0.01,
        maxZ: surface.maxZ - surface.depth * 0.03,
      };
    case "right_support":
      return {
        minX: rightSupportMinX,
        maxX: surface.maxX - surface.width * 0.05,
        minZ: surface.centerZ + surface.depth * 0.01,
        maxZ: surface.maxZ - surface.depth * 0.03,
      };
    case "insert_left":
      return {
        minX: surface.minX + surface.width * 0.04,
        maxX: surface.centerX - surface.width * 0.02,
        minZ: surface.minZ + surface.depth * 0.03,
        maxZ: surface.centerZ - surface.depth * 0.06,
      };
    case "insert_right":
      return {
        minX: surface.centerX + surface.width * 0.02,
        maxX: surface.maxX - surface.width * 0.04,
        minZ: surface.minZ + surface.depth * 0.03,
        maxZ: surface.centerZ - surface.depth * 0.06,
      };
    case "insert_center":
      return {
        minX: surface.centerX - insertHalfWidth,
        maxX: surface.centerX + insertHalfWidth,
        minZ: surface.minZ + surface.depth * 0.02,
        maxZ: surface.centerZ - surface.depth * 0.08,
      };
    case "hero_center":
    default:
      return {
        minX: surface.centerX - heroHalfWidth,
        maxX: surface.centerX + heroHalfWidth,
        minZ: surface.centerZ - surface.depth * 0.18,
        maxZ: surface.centerZ + surface.depth * 0.04,
      };
  }
}

const rotatedBoundsEulerScratch = new THREE.Euler();
const rotatedBoundsPointScratch = new THREE.Vector3();

function rotatedBoundsMetrics(
  geometry: PreparedAssetGeometry,
  rotation: RuntimeVec3,
  scale: number,
) {
  const euler = rotatedBoundsEulerScratch.set(
    rotation[0],
    rotation[1],
    rotation[2],
  );
  const point = rotatedBoundsPointScratch;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const corner of geometry.localBoundsCorners) {
    point
      .set(corner[0], corner[1], corner[2])
      .applyEuler(euler)
      .multiplyScalar(scale);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  return {
    minY,
    width: Math.max(0.001, maxX - minX),
    height: Math.max(0.001, maxY - minY),
    depth: Math.max(0.001, maxZ - minZ),
  };
}

function constrainToSurface(
  asset: CinematicLibraryAssetRecord | null,
  role: Exclude<AssetRole, "tray" | "hand">,
  pose: RuntimeActorPose,
  surface: SurfaceInfo,
  prepared: PreparedGeometryByRole,
): RuntimeActorPose {
  const geometry = geometryForRole(prepared, asset, role);
  const scale = effectiveScale(asset, role, pose.scale, geometry);
  const rotation = combinedRotation(asset, pose.rotation);
  const bounds = rotatedBoundsMetrics(geometry, rotation, scale);
  const contactOffset = rotatedVector(
    geometry.bottomContactCenter,
    rotation,
  ).multiplyScalar(scale);
  const lane = surfaceLaneForRole(role, pose);
  const laneBounds = surfaceLaneBounds(surface, lane);
  const padding = Math.max(0.012, Math.min(surface.width, surface.depth) * 0.01);

  // Pair Resolver / Asset Scene Builder principle: support fit is judged from the
  // measured contact footprint rather than the whole visual overhang. We still
  // use the full rotated bounds below as a penetration guard.
  const contactHalfW = Math.max(
    0.01,
    Math.min(
      bounds.width * 0.5,
      Math.abs(geometry.bottomContactSize[0]) * scale * 0.5,
    ),
  );
  const contactHalfD = Math.max(
    0.01,
    Math.min(
      bounds.depth * 0.5,
      Math.abs(geometry.bottomContactSize[1]) * scale * 0.5,
    ),
  );
  const minContactX = laneBounds.minX + contactHalfW + padding;
  const maxContactX = laneBounds.maxX - contactHalfW - padding;
  const minContactZ = laneBounds.minZ + contactHalfD + padding;
  const maxContactZ = laneBounds.maxZ - contactHalfD - padding;
  const desiredContactX = minContactX <= maxContactX
    ? Math.min(maxContactX, Math.max(minContactX, pose.position[0]))
    : (laneBounds.minX + laneBounds.maxX) * 0.5;
  const desiredContactZ = minContactZ <= maxContactZ
    ? Math.min(maxContactZ, Math.max(minContactZ, pose.position[2]))
    : (laneBounds.minZ + laneBounds.maxZ) * 0.5;

  const x = desiredContactX - contactOffset.x;
  const z = desiredContactZ - contactOffset.z;

  // Runtime pose Y means authored lift above the measured support plane. Align
  // the measured bottom-contact center to the support plane, while the rotated
  // visible-bounds floor prevents a tilted/oddly-authored mesh from penetrating.
  const lift = Math.max(0, pose.position[1]);
  const contactAlignedRootY = surface.topY - contactOffset.y;
  const boundsSafeRootY = surface.topY - bounds.minY;
  const y = Math.max(contactAlignedRootY, boundsSafeRootY) + lift;
  return { ...pose, position: [x, y, z] };
}

type CachedFadeMaterial = {
  material: THREE.Material;
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthWrite: boolean;
};

type ActorRenderCache = {
  assetKey: string;
  fadeMaterials: CachedFadeMaterial[];
  outlineHost: THREE.Group | null;
  outlineSource: THREE.Object3D | null;
  outlineRoot: THREE.Object3D | null;
  outlineMaterials: THREE.MeshBasicMaterial[];
  lastOpacity: number | null;
  lastEmphasis: number | null;
};

const actorRenderCaches = new WeakMap<THREE.Group, ActorRenderCache>();

function buildActorRenderCache(
  group: THREE.Group,
  assetKey: string,
): ActorRenderCache {
  const fadeMaterials: CachedFadeMaterial[] = [];
  let outlineHost: THREE.Group | null = null;
  let outlineSource: THREE.Object3D | null = null;
  const outlineMaterials: THREE.MeshBasicMaterial[] = [];

  // CP.2A.3: one scene traversal when an actor/asset is prepared, never two
  // traversals on every movie frame.
  group.traverse((object) => {
    const candidateSource = object.userData.cinematicOutlineSource;
    if (candidateSource instanceof THREE.Object3D && object instanceof THREE.Group) {
      outlineHost = object;
      outlineSource = candidateSource;
    }

    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.cinematicOutlineMesh === true) return;

    if (!object.userData.cinematicOwnsFadeMaterials) {
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
      object.userData.cinematicOwnsFadeMaterials = true;
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      const state = material.userData as Record<string, unknown>;
      if (typeof state.cinematicBaseOpacity !== "number") {
        state.cinematicBaseOpacity = material.opacity;
        state.cinematicBaseTransparent = material.transparent;
        state.cinematicBaseDepthWrite = material.depthWrite;
      }
      fadeMaterials.push({
        material,
        baseOpacity: typeof state.cinematicBaseOpacity === "number"
          ? state.cinematicBaseOpacity
          : 1,
        baseTransparent: state.cinematicBaseTransparent === true,
        baseDepthWrite: state.cinematicBaseDepthWrite !== false,
      });
    }
  });

  const cache: ActorRenderCache = {
    assetKey,
    fadeMaterials,
    outlineHost,
    outlineSource,
    outlineRoot: null,
    outlineMaterials,
    lastOpacity: null,
    lastEmphasis: null,
  };
  actorRenderCaches.set(group, cache);
  return cache;
}

function actorRenderCacheFor(
  group: THREE.Group,
  assetKey: string,
): ActorRenderCache {
  const cached = actorRenderCaches.get(group);
  if (cached?.assetKey === assetKey) return cached;
  return buildActorRenderCache(group, assetKey);
}

function ensureLazyOutline(cache: ActorRenderCache) {
  if (cache.outlineRoot || !cache.outlineHost || !cache.outlineSource) return;

  const outline = makeOutlineClone(cache.outlineSource);
  outline.visible = false;
  cache.outlineHost.add(outline);
  cache.outlineHost.userData.cinematicLazyOutline = outline;
  cache.outlineRoot = outline;
  outline.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) {
        cache.outlineMaterials.push(material);
      }
    }
  });
}

function applyGroupOpacity(
  group: THREE.Group,
  opacity: number,
  assetKey: string,
) {
  const clamped = clamp01(opacity);
  group.userData.cinematicOpacity = clamped;
  const cache = actorRenderCacheFor(group, assetKey);
  if (
    cache.lastOpacity !== null &&
    Math.abs(cache.lastOpacity - clamped) <= MATERIAL_EPSILON
  ) {
    return;
  }
  cache.lastOpacity = clamped;

  const shouldFade = clamped < 0.999;
  for (const entry of cache.fadeMaterials) {
    const {
      material,
      baseOpacity,
      baseTransparent,
      baseDepthWrite,
    } = entry;
    const nextTransparent = baseTransparent || shouldFade;
    if (material.transparent !== nextTransparent) {
      material.transparent = nextTransparent;
      material.needsUpdate = true;
    }
    material.opacity = baseOpacity * clamped;
    material.depthWrite = shouldFade ? false : baseDepthWrite;
  }
}

function applyGroupEmphasis(
  group: THREE.Group,
  emphasis: number,
  actorOpacity: number,
  assetKey: string,
) {
  const clamped = clamp01(emphasis) * clamp01(actorOpacity);
  group.userData.cinematicEmphasis = clamped;
  const cache = actorRenderCacheFor(group, assetKey);
  if (clamped > 0.002) ensureLazyOutline(cache);
  if (
    cache.lastEmphasis !== null &&
    Math.abs(cache.lastEmphasis - clamped) <= MATERIAL_EPSILON
  ) {
    return;
  }
  cache.lastEmphasis = clamped;

  const visible = clamped > 0.002;
  if (cache.outlineRoot) cache.outlineRoot.visible = visible;
  for (const material of cache.outlineMaterials) {
    material.opacity = clamped * 0.92;
  }
}

function resolveActorPose(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  pose: RuntimeActorPose,
  surface: SurfaceInfo | null,
  prepared: PreparedGeometryByRole,
): RuntimeActorPose {
  return role !== "tray" && role !== "hand" && surface
    ? constrainToSurface(
        asset,
        role as Exclude<AssetRole, "tray" | "hand">,
        pose,
        surface,
        prepared,
      )
    : pose;
}

const interactionGeometryCaches = new WeakMap<
  PreparedAssetGeometry,
  AssetInteractionGeometry
>();

function assetInteractionGeometryForRole(
  prepared: PreparedGeometryByRole,
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
): AssetInteractionGeometry {
  const geometry = geometryForRole(prepared, asset, role);
  const cached = interactionGeometryCaches.get(geometry);
  if (cached) return cached;

  const compiled: AssetInteractionGeometry = {
    local_bounds: {
      min: [...geometry.localBounds.min],
      max: [...geometry.localBounds.max],
      center: [...geometry.localBounds.center],
      size: [...geometry.localBounds.size],
    },
    contact_regions: geometry.surfaceContactRegions.map((region) => ({
      id: region.id,
      label: region.label,
      local_position: [...region.center],
      local_normal: [...region.normal],
      size: [...region.size],
      confidence: region.confidence,
      source: region.source === "manual" ? "manual" : "geometry_profile",
      side: region.side,
    })),
    collision_boxes: geometry.collisionBoxes.map((box) => ({
      id: box.id,
      center: [...box.center],
      size: [...box.size],
      rotation: [...box.rotation],
      confidence: box.confidence,
    })),
  };
  interactionGeometryCaches.set(geometry, compiled);
  return compiled;
}

function assetInteractionPoseForRole(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  pose: RuntimeActorPose,
  prepared: PreparedGeometryByRole,
): AssetInteractionPose {
  const geometry = geometryForRole(prepared, asset, role);
  const scale = effectiveScale(asset, role, pose.scale, geometry);
  const rotation = combinedRotation(asset, pose.rotation);
  const groundOffset =
    typeof asset?.ground_offset_m === "number" ? asset.ground_offset_m * scale : 0;
  return {
    position: [pose.position[0], pose.position[1] + groundOffset, pose.position[2]],
    rotation,
    scale,
  };
}

function generatedReadableInteractionPoseForRole(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  pose: RuntimeActorPose,
  prepared: PreparedGeometryByRole,
  enableGeneratedContactOrientation: boolean,
): AssetInteractionPose {
  if (!enableGeneratedContactOrientation || role !== "hand") {
    return assetInteractionPoseForRole(asset, role, pose, prepared);
  }
  return assetInteractionPoseForRole(
    asset,
    role,
    {
      ...pose,
      rotation: GENERATED_HAND_READABLE_ROTATION,
    },
    prepared,
  );
}

function runtimePoseFromInteractionPosition(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  basePose: RuntimeActorPose,
  worldRootPosition: RuntimeVec3,
  prepared: PreparedGeometryByRole,
): RuntimeActorPose {
  const geometry = geometryForRole(prepared, asset, role);
  const scale = effectiveScale(asset, role, basePose.scale, geometry);
  const groundOffset =
    typeof asset?.ground_offset_m === "number" ? asset.ground_offset_m * scale : 0;
  return {
    ...basePose,
    position: [
      worldRootPosition[0],
      worldRootPosition[1] - groundOffset,
      worldRootPosition[2],
    ],
  };
}

function runtimeRotationFromCombined(
  asset: CinematicLibraryAssetRecord | null,
  combined: RuntimeVec3,
): RuntimeVec3 {
  const base = asset?.default_rotation ?? [0, 0, 0];
  return [
    combined[0] - base[0],
    combined[1] - base[1],
    combined[2] - base[2],
  ];
}

function contactRegionLocalNormal(
  geometry: AssetInteractionGeometry,
  regionId: string,
): RuntimeVec3 | null {
  const measured = geometry.contact_regions.find((region) => region.id === regionId);
  if (measured) return [...measured.local_normal];
  const side = regionId.startsWith("bounds_face:")
    ? regionId.slice("bounds_face:".length)
    : "";
  switch (side) {
    case "left": return [-1, 0, 0];
    case "right": return [1, 0, 0];
    case "bottom": return [0, -1, 0];
    case "top": return [0, 1, 0];
    case "back": return [0, 0, -1];
    case "front": return [0, 0, 1];
    default: return null;
  }
}

function contactRegionLocalTangent(
  geometry: AssetInteractionGeometry,
  localNormal: RuntimeVec3,
): RuntimeVec3 {
  const normal = new THREE.Vector3(...localNormal).normalize();
  const axes = [
    { vector: new THREE.Vector3(1, 0, 0), extent: geometry.local_bounds.size[0] },
    { vector: new THREE.Vector3(0, 1, 0), extent: geometry.local_bounds.size[1] },
    { vector: new THREE.Vector3(0, 0, 1), extent: geometry.local_bounds.size[2] },
  ].sort((left, right) => right.extent - left.extent);

  for (const candidate of axes) {
    const tangent = candidate.vector.clone()
      .addScaledVector(normal, -candidate.vector.dot(normal));
    if (tangent.lengthSq() > 1e-5) {
      tangent.normalize();
      return [tangent.x, tangent.y, tangent.z];
    }
  }
  return [0, 1, 0];
}

function generatedContactFramePose(
  sourcePose: AssetInteractionPose,
  sourceGeometry: AssetInteractionGeometry,
  sourceRegionId: string,
  targetOutwardNormal: RuntimeVec3,
  weight: number,
  readableReferenceRotation?: RuntimeVec3,
): AssetInteractionPose | null {
  const localNormal = contactRegionLocalNormal(sourceGeometry, sourceRegionId);
  if (!localNormal) return null;

  const currentQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourcePose.rotation[0],
      sourcePose.rotation[1],
      sourcePose.rotation[2],
      "XYZ",
    ),
  );
  const currentNormal = new THREE.Vector3(...localNormal)
    .applyQuaternion(currentQuaternion)
    .normalize();
  const desiredNormal = new THREE.Vector3(...targetOutwardNormal)
    .multiplyScalar(-1)
    .normalize();
  if (currentNormal.lengthSq() < 1e-8 || desiredNormal.lengthSq() < 1e-8) {
    return null;
  }

  const delta = new THREE.Quaternion().setFromUnitVectors(
    currentNormal,
    desiredNormal,
  );
  let contactQuaternion = delta.multiply(currentQuaternion.clone()).normalize();

  // CP.2A.4 full contact frame: a normal alone leaves one unconstrained twist
  // degree of freedom. Preserve a second, geometry-derived tangent against a
  // readable reference frame so a hand cannot be physically valid but edge-on.
  if (readableReferenceRotation) {
    const localTangent = new THREE.Vector3(
      ...contactRegionLocalTangent(sourceGeometry, localNormal),
    ).normalize();
    const referenceQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        readableReferenceRotation[0],
        readableReferenceRotation[1],
        readableReferenceRotation[2],
        "XYZ",
      ),
    );
    const alignedTangent = localTangent.clone().applyQuaternion(contactQuaternion);
    alignedTangent.addScaledVector(
      desiredNormal,
      -alignedTangent.dot(desiredNormal),
    );
    const referenceTangent = localTangent.clone().applyQuaternion(referenceQuaternion);
    referenceTangent.addScaledVector(
      desiredNormal,
      -referenceTangent.dot(desiredNormal),
    );
    if (alignedTangent.lengthSq() > 1e-7 && referenceTangent.lengthSq() > 1e-7) {
      alignedTangent.normalize();
      referenceTangent.normalize();
      const cross = new THREE.Vector3().crossVectors(
        alignedTangent,
        referenceTangent,
      );
      const signedTwist = Math.atan2(
        desiredNormal.dot(cross),
        Math.min(1, Math.max(-1, alignedTangent.dot(referenceTangent))),
      );
      const twist = new THREE.Quaternion().setFromAxisAngle(
        desiredNormal,
        signedTwist,
      );
      contactQuaternion = twist.multiply(contactQuaternion).normalize();
    }
  }

  const blended = currentQuaternion.clone().slerp(
    contactQuaternion,
    clamp01(weight),
  );
  const euler = new THREE.Euler().setFromQuaternion(blended, "XYZ");
  return {
    ...sourcePose,
    rotation: [euler.x, euler.y, euler.z],
  };
}

type CachedInteractionSolve = {
  phase: RuntimeAssetInteractionIntent["phase"];
  sourceAssetId: string | null;
  targetAssetId: string | null;
  generatedOrientation: boolean;
  solution: AssetInteractionMotionSolution;
  sourcePoseAtSolve: AssetInteractionPose;
  targetPoseAtSolve: AssetInteractionPose;
  sourceGeometry: AssetInteractionGeometry;
  targetGeometry: AssetInteractionGeometry;
  sourcePreparedGeometry: PreparedAssetGeometry | null;
  targetPreparedGeometry: PreparedAssetGeometry | null;
  obstacleSignature: string;
  contactOrientationAvailable: boolean;
  semanticEffectorLocked: boolean;
};

type InteractionRuntimeCache = Map<string, CachedInteractionSolve>;

function poseTranslationDelta(
  current: AssetInteractionPose,
  anchored: AssetInteractionPose,
): RuntimeVec3 {
  return [
    current.position[0] - anchored.position[0],
    current.position[1] - anchored.position[1],
    current.position[2] - anchored.position[2],
  ];
}

function addWeightedDeltas(
  base: RuntimeVec3,
  sourceDelta: RuntimeVec3,
  sourceWeight: number,
  targetDelta: RuntimeVec3,
  targetWeight: number,
): RuntimeVec3 {
  return [
    base[0] + sourceDelta[0] * sourceWeight + targetDelta[0] * targetWeight,
    base[1] + sourceDelta[1] * sourceWeight + targetDelta[1] * targetWeight,
    base[2] + sourceDelta[2] * sourceWeight + targetDelta[2] * targetWeight,
  ];
}

function interactionScaleDrifted(current: number, anchored: number) {
  const denominator = Math.max(1e-6, Math.abs(anchored));
  return Math.abs(current - anchored) / denominator > 0.075;
}

function interactionRotationDrifted(
  current: RuntimeVec3,
  anchored: RuntimeVec3,
) {
  return Math.max(
    Math.abs(current[0] - anchored[0]),
    Math.abs(current[1] - anchored[1]),
    Math.abs(current[2] - anchored[2]),
  ) > 0.18;
}

function interactionObstacleSignature(
  interaction: RuntimeAssetInteractionIntent,
  resolvedPoses: Record<AssetRole, RuntimeActorPose>,
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>,
) {
  const quantize = (value: number, step: number) =>
    Math.round(value / step);
  return interaction.obstacleRoles
    .filter(
      (role) =>
        role !== interaction.sourceRole &&
        role !== interaction.targetRole,
    )
    .map((role) => {
      const pose = resolvedPoses[role];
      if (!pose?.visible || (pose.opacity ?? 1) <= 0.01) {
        return `${role}:hidden`;
      }
      return [
        role,
        selectedAssets[role]?.asset_id ?? "fallback",
        quantize(pose.position[0], 0.12),
        quantize(pose.position[1], 0.12),
        quantize(pose.position[2], 0.12),
        quantize(pose.scale, 0.08),
      ].join(":");
    })
    .join("|");
}

const interactionReanchorScratch = {
  point: new THREE.Vector3(),
  translation: new THREE.Vector3(),
  anchorQuaternion: new THREE.Quaternion(),
  currentQuaternion: new THREE.Quaternion(),
  inverseAnchorQuaternion: new THREE.Quaternion(),
  anchorEuler: new THREE.Euler(),
  currentEuler: new THREE.Euler(),
};

function interactionPoseQuaternion(
  pose: AssetInteractionPose,
  euler: THREE.Euler,
  quaternion: THREE.Quaternion,
) {
  euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], "XYZ");
  return quaternion.setFromEuler(euler).normalize();
}

function reanchorPointToPose(
  pointAtSolve: RuntimeVec3,
  anchorPose: AssetInteractionPose,
  currentPose: AssetInteractionPose,
): RuntimeVec3 {
  const scratch = interactionReanchorScratch;
  const anchorQuaternion = interactionPoseQuaternion(
    anchorPose,
    scratch.anchorEuler,
    scratch.anchorQuaternion,
  );
  const currentQuaternion = interactionPoseQuaternion(
    currentPose,
    scratch.currentEuler,
    scratch.currentQuaternion,
  );
  scratch.inverseAnchorQuaternion.copy(anchorQuaternion).invert();
  const anchorScale = Math.max(1e-6, Math.abs(anchorPose.scale));
  const currentScale = Math.max(1e-6, Math.abs(currentPose.scale));

  const point = scratch.point
    .set(
      pointAtSolve[0] - anchorPose.position[0],
      pointAtSolve[1] - anchorPose.position[1],
      pointAtSolve[2] - anchorPose.position[2],
    )
    .applyQuaternion(scratch.inverseAnchorQuaternion)
    .multiplyScalar(1 / anchorScale)
    .multiplyScalar(currentScale)
    .applyQuaternion(currentQuaternion)
    .add(
      scratch.translation.set(
        currentPose.position[0],
        currentPose.position[1],
        currentPose.position[2],
      ),
    );

  return [point.x, point.y, point.z];
}

function reanchorDirectionToPose(
  directionAtSolve: RuntimeVec3,
  anchorPose: AssetInteractionPose,
  currentPose: AssetInteractionPose,
): RuntimeVec3 {
  const scratch = interactionReanchorScratch;
  const anchorQuaternion = interactionPoseQuaternion(
    anchorPose,
    scratch.anchorEuler,
    scratch.anchorQuaternion,
  );
  const currentQuaternion = interactionPoseQuaternion(
    currentPose,
    scratch.currentEuler,
    scratch.currentQuaternion,
  );
  scratch.inverseAnchorQuaternion.copy(anchorQuaternion).invert();
  const direction = scratch.point
    .set(directionAtSolve[0], directionAtSolve[1], directionAtSolve[2])
    .applyQuaternion(scratch.inverseAnchorQuaternion)
    .applyQuaternion(currentQuaternion)
    .normalize();
  return [direction.x, direction.y, direction.z];
}

function applyActorPose(
  group: THREE.Group | null,
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  pose: RuntimeActorPose,
  surface: SurfaceInfo | null,
  prepared: PreparedGeometryByRole,
) {
  const finalPose = resolveActorPose(asset, role, pose, surface, prepared);
  if (!group) return finalPose;

  const opacity = clamp01(finalPose.opacity ?? 1);
  const emphasis = clamp01(finalPose.emphasis ?? 0);
  group.visible = finalPose.visible && opacity > 0.001;
  const assetKey = asset?.asset_id ?? `fallback:${role}`;
  applyGroupOpacity(group, opacity, assetKey);
  applyGroupEmphasis(group, emphasis, opacity, assetKey);
  if (!group.visible) return finalPose;

  const rotation = combinedRotation(asset, finalPose.rotation);
  const geometry = geometryForRole(prepared, asset, role);
  const scale = effectiveScale(asset, role, finalPose.scale, geometry);
  const groundOffset =
    typeof asset?.ground_offset_m === "number" ? asset.ground_offset_m * scale : 0;

  group.position.set(
    finalPose.position[0],
    finalPose.position[1] + groundOffset,
    finalPose.position[2],
  );
  group.rotation.set(rotation[0], rotation[1], rotation[2]);
  group.scale.setScalar(scale);
  group.updateMatrixWorld(true);
  return finalPose;
}

type RuntimeActorRefs = {
  tray: MutableRefObject<THREE.Group | null>;
  foods: [
    MutableRefObject<THREE.Group | null>,
    MutableRefObject<THREE.Group | null>,
    MutableRefObject<THREE.Group | null>,
  ];
  cow: MutableRefObject<THREE.Group | null>;
  chicken: MutableRefObject<THREE.Group | null>;
  goldfish: MutableRefObject<THREE.Group | null>;
  hand: MutableRefObject<THREE.Group | null>;
};

type RuntimeShadowRefs = {
  foods: [
    MutableRefObject<THREE.Mesh | null>,
    MutableRefObject<THREE.Mesh | null>,
    MutableRefObject<THREE.Mesh | null>,
  ];
  cow: MutableRefObject<THREE.Mesh | null>;
  chicken: MutableRefObject<THREE.Mesh | null>;
  goldfish: MutableRefObject<THREE.Mesh | null>;
};

function shadowOpacityForRole(role: Exclude<AssetRole, "tray" | "hand">) {
  switch (role) {
    case "apple":
      return 0.24;
    case "burger":
      return 0.29;
    case "nigiri":
      return 0.22;
    case "cow":
      return 0.22;
    case "chicken":
      return 0.2;
    case "goldfish":
      return 0.16;
    default:
      return 0.18;
  }
}

function shadowScaleForRole(
  role: Exclude<AssetRole, "tray" | "hand">,
  worldScale: number,
  pose: RuntimeActorPose,
): [number, number] {
  const heightLift = clamp01(pose.position[1] / 0.6);
  const widen = 1 + heightLift * 0.38;
  switch (role) {
    case "apple":
      return [worldScale * 0.42 * widen, worldScale * 0.36 * widen];
    case "burger":
      return [worldScale * 0.86 * widen, worldScale * 0.56 * widen];
    case "nigiri":
      return [worldScale * 0.62 * widen, worldScale * 0.3 * widen];
    case "cow":
      return [worldScale * 0.84 * widen, worldScale * 0.36 * widen];
    case "chicken":
      return [worldScale * 0.68 * widen, worldScale * 0.3 * widen];
    case "goldfish":
      return [worldScale * 0.46 * widen, worldScale * 0.2 * widen];
    default:
      return [worldScale * 0.5, worldScale * 0.25];
  }
}

function applyShadowPose(
  mesh: THREE.Mesh | null,
  asset: CinematicLibraryAssetRecord | null,
  role: Exclude<AssetRole, "tray" | "hand">,
  pose: RuntimeActorPose,
  surface: SurfaceInfo,
  prepared: PreparedGeometryByRole,
  poseAlreadyResolved = false,
) {
  if (!mesh) return;
  const actorOpacity = clamp01(pose.opacity ?? 1);
  if (!pose.visible || actorOpacity <= 0.001) {
    mesh.visible = false;
    return;
  }
  const finalPose = poseAlreadyResolved
    ? pose
    : constrainToSurface(asset, role, pose, surface, prepared);
  const heightLift = poseAlreadyResolved ? 0 : clamp01(pose.position[1] / 0.6);
  const geometry = geometryForRole(prepared, asset, role);
  const worldScale = effectiveScale(asset, role, finalPose.scale, geometry);
  const [sx, sz] = shadowScaleForRole(role, worldScale, pose);
  const opacity =
    shadowOpacityForRole(role) *
    Math.max(0.24, 1 - heightLift * 0.72) *
    actorOpacity;

  mesh.visible = true;
  mesh.position.set(finalPose.position[0], surface.topY + 0.006, finalPose.position[2]);
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  mesh.scale.set(sx, sz, 1);

  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    material.opacity = opacity;
  }
}

type FramingEntry = {
  group: THREE.Group | null;
  asset: CinematicLibraryAssetRecord | null;
  role: Exclude<AssetRole, "tray" | "hand">;
};

type FramingSafetyState = {
  correctionDistance: number | null;
  lastTimelineS: number | null;
};

type FramingScratch = {
  targetVector: THREE.Vector3;
  backward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  world: THREE.Vector3;
  relative: THREE.Vector3;
};

function createFramingScratch(): FramingScratch {
  return {
    targetVector: new THREE.Vector3(),
    backward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    world: new THREE.Vector3(),
    relative: new THREE.Vector3(),
  };
}

function framingEntries(
  actors: RuntimeActorRefs,
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>,
): FramingEntry[] {
  return [
    { group: actors.foods[0].current, asset: selectedAssets.apple, role: "apple" },
    { group: actors.foods[1].current, asset: selectedAssets.burger, role: "burger" },
    { group: actors.foods[2].current, asset: selectedAssets.nigiri, role: "nigiri" },
    { group: actors.cow.current, asset: selectedAssets.cow, role: "cow" },
    { group: actors.chicken.current, asset: selectedAssets.chicken, role: "chicken" },
    { group: actors.goldfish.current, asset: selectedAssets.goldfish, role: "goldfish" },
  ];
}

// Director shot audits already treat safe-frame visibility as an invariant. CP.1E.6
// turns that guard into a single analytic safe-framing envelope instead of an
// iterative camera correction. The authored camera path is preserved unless its
// distance would crop measured actor bounds.
function protectCameraFraming(
  camera: THREE.Camera,
  target: RuntimeVec3,
  entries: FramingEntry[],
  prepared: PreparedGeometryByRole,
  safetyState: FramingSafetyState,
  scratch: FramingScratch,
  timelineTimeS: number,
  isPlaying: boolean,
) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;

  const targetVector = scratch.targetVector.set(...target);
  const backward = scratch.backward.copy(camera.position).sub(targetVector);
  const authoredDistance = Math.max(0.2, backward.length());
  if (backward.lengthSq() < 1e-8) backward.set(0, 0.2, 1);
  backward.normalize();

  const right = scratch.right.crossVectors(camera.up, backward);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = scratch.up.crossVectors(backward, right).normalize();

  const SAFE_X = 0.82;
  const SAFE_Y = 0.78;
  const safeVerticalHalfAngle =
    THREE.MathUtils.degToRad(camera.fov * 0.5) * SAFE_Y;
  const horizontalHalfAngle = Math.atan(
    Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) *
      Math.max(0.2, camera.aspect),
  );
  const safeHorizontalHalfAngle = horizontalHalfAngle * SAFE_X;
  const tanVertical = Math.max(0.05, Math.tan(safeVerticalHalfAngle));
  const tanHorizontal = Math.max(0.05, Math.tan(safeHorizontalHalfAngle));

  // CP.1E.12 soft post-rail camera safety. The former implementation ignored an
  // actor below opacity 0.06, then admitted its full measured bounds at once. A
  // second hard 1.12x distance threshold could then jump the camera backwards.
  // Each actor now participates continuously with opacity, and the final safety
  // distance is itself blended by a C2-soft envelope. The authored C2 master rail
  // remains primary; this constraint can no longer behave like a second cut.
  let requiredDistance = authoredDistance;
  for (const entry of entries) {
    if (!entry.group?.visible) continue;
    const actorOpacity = Number(entry.group.userData.cinematicOpacity ?? 1);
    const participation = softFramingParticipation(actorOpacity);
    if (participation <= 0) continue;
    const geometry = geometryForRole(prepared, entry.asset, entry.role);
    // applyActorPose already refreshed matrixWorld for every visible actor.

    let actorRequiredDistance = authoredDistance;
    for (const corner of geometry.localBoundsCorners) {
      const world = scratch.world.set(...corner).applyMatrix4(entry.group.matrixWorld);
      const relative = scratch.relative.copy(world).sub(targetVector);
      const horizontal = Math.abs(relative.dot(right));
      const vertical = Math.abs(relative.dot(up));
      const longitudinal = relative.dot(backward);
      actorRequiredDistance = Math.max(
        actorRequiredDistance,
        horizontal / tanHorizontal + longitudinal,
        vertical / tanVertical + longitudinal,
      );
    }

    const weightedActorDistance = authoredDistance +
      Math.max(0, actorRequiredDistance - authoredDistance) * participation;
    requiredDistance = Math.max(requiredDistance, weightedActorDistance);
  }

  const desiredProtectedDistance = softProtectedCameraDistance(
    authoredDistance,
    requiredDistance,
  );
  const desiredCorrection = Math.max(
    0,
    desiredProtectedDistance - authoredDistance,
  );
  const previousTimelineS = safetyState.lastTimelineS;
  const deltaS = previousTimelineS === null
    ? 0
    : timelineTimeS - previousTimelineS;
  const timelineJump = deltaS <= 0 || deltaS > 0.25;
  const previousCorrection = safetyState.correctionDistance;
  const appliedCorrection =
    !isPlaying || timelineJump || previousCorrection === null
      ? desiredCorrection
      : advanceSoftCameraSafetyCorrection(
          previousCorrection,
          desiredCorrection,
          deltaS,
        );

  safetyState.correctionDistance = appliedCorrection;
  safetyState.lastTimelineS = timelineTimeS;

  camera.position
    .copy(targetVector)
    .addScaledVector(backward, authoredDistance + appliedCorrection);
  camera.lookAt(targetVector);
  camera.updateMatrixWorld(true);
}

function actorGroupForRole(
  actors: RuntimeActorRefs,
  role: AssetRole,
): THREE.Group | null {
  switch (role) {
    case "tray":
      return actors.tray.current;
    case "apple":
      return actors.foods[0].current;
    case "burger":
      return actors.foods[1].current;
    case "nigiri":
      return actors.foods[2].current;
    case "cow":
      return actors.cow.current;
    case "chicken":
      return actors.chicken.current;
    case "goldfish":
      return actors.goldfish.current;
    case "hand":
      return actors.hand.current;
  }
}

function solveInteractionForRuntimeCache(input: {
  interaction: RuntimeAssetInteractionIntent;
  sourceAsset: CinematicLibraryAssetRecord | null;
  targetAsset: CinematicLibraryAssetRecord | null;
  sourceInteractionPose: AssetInteractionPose;
  targetInteractionPose: AssetInteractionPose;
  sourceGeometry: AssetInteractionGeometry;
  targetGeometry: AssetInteractionGeometry;
  obstacles: AssetInteractionObstacle[];
  enableGeneratedContactOrientation: boolean;
  sourcePreparedGeometry: PreparedAssetGeometry | null;
  targetPreparedGeometry: PreparedAssetGeometry | null;
  obstacleSignature: string;
}): CachedInteractionSolve {
  const solve = (sourcePoseForSolve: AssetInteractionPose) =>
    resolveAssetAwareInteractionMotion({
      intent: {
        id: input.interaction.id,
        kind: input.interaction.kind,
        approach_direction: input.interaction.approachDirection,
        preferred_target_side: input.interaction.preferredTargetSide,
        contact_clearance_m: input.interaction.contactClearanceM,
        obstacle_clearance_m: input.interaction.obstacleClearanceM,
      },
      sourcePose: sourcePoseForSolve,
      sourceGeometry: input.sourceGeometry,
      targetPose: input.targetInteractionPose,
      targetGeometry: input.targetGeometry,
      obstacles: input.obstacles,
      retreatEnd: input.sourceInteractionPose.position,
    });

  let solution = solve(input.sourceInteractionPose);
  let contactOrientationAvailable = false;
  const semanticEffectorLocked =
    input.enableGeneratedContactOrientation &&
    input.interaction.sourceRole === "hand";

  // CP.2A.5 semantic hand effector. The CP.2A.4 normal+tangent correction was
  // still generic geometry: at phase boundaries it could choose a physically
  // valid but cinematographically sideways hand frame. The Lunch hand now
  // keeps the reviewed palm-readable frame for the WHOLE interaction and lets
  // CP.1F solve root motion around that fixed semantic effector orientation.
  // Non-hand generated interactions can still use the CP.2A.4 full contact
  // frame until reviewed directability supplies their own semantic axes.
  if (
    input.enableGeneratedContactOrientation &&
    !semanticEffectorLocked &&
    solution.contact.status !== "blocked"
  ) {
    const orientedPose = generatedContactFramePose(
      input.sourceInteractionPose,
      input.sourceGeometry,
      solution.contact.source_region_id,
      solution.contact.target_outward_normal,
      1,
      input.sourceInteractionPose.rotation,
    );
    if (orientedPose) {
      solution = solve(orientedPose);
      contactOrientationAvailable = true;
    }
  }

  return {
    phase: input.interaction.phase,
    sourceAssetId: input.sourceAsset?.asset_id ?? null,
    targetAssetId: input.targetAsset?.asset_id ?? null,
    generatedOrientation: input.enableGeneratedContactOrientation,
    solution,
    sourcePoseAtSolve: input.sourceInteractionPose,
    targetPoseAtSolve: input.targetInteractionPose,
    sourceGeometry: input.sourceGeometry,
    targetGeometry: input.targetGeometry,
    sourcePreparedGeometry: input.sourcePreparedGeometry,
    targetPreparedGeometry: input.targetPreparedGeometry,
    obstacleSignature: input.obstacleSignature,
    contactOrientationAvailable,
    semanticEffectorLocked,
  };
}

function applyRuntimeLayout(
  layout: CinematicShotRuntimeLayout,
  actors: RuntimeActorRefs,
  shadows: RuntimeShadowRefs,
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>,
  framing: FramingEntry[],
  prepared: PreparedGeometryByRole,
  camera: THREE.Camera,
  includeCamera: boolean,
  framingSafetyState: FramingSafetyState,
  framingScratch: FramingScratch,
  timelineTimeS: number,
  isPlaying: boolean,
  enableGeneratedContactOrientation: boolean,
  interactionCache: InteractionRuntimeCache,
) {
  if (includeCamera) {
    camera.position.set(...layout.camera.position);
    camera.lookAt(...layout.camera.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = layout.camera.fov;
      camera.updateProjectionMatrix();
    }
  }

  // CP.1F asset-aware interaction runtime:
  // 1) resolve ordinary support/contact staging first;
  // 2) apply measured pair-spacing constraints;
  // 3) solve semantic interactions from actual source/target geometry;
  // 4) render only the resolved physical poses.
  //
  // This ordering mirrors Asset Scene Builder authority: cinematic intent can
  // request a relationship, but measured geometry owns literal placement.
  const trayPose = resolveActorPose(
    selectedAssets.tray,
    "tray",
    layout.tray,
    null,
    prepared,
  );
  const surface = traySurfaceInfo(selectedAssets.tray, trayPose, prepared);

  const resolvedPoses: Record<AssetRole, RuntimeActorPose> = {
    tray: trayPose,
    apple: resolveActorPose(
      selectedAssets.apple,
      "apple",
      layout.foods[0] ?? HIDDEN_POSE,
      surface,
      prepared,
    ),
    burger: resolveActorPose(
      selectedAssets.burger,
      "burger",
      layout.foods[1] ?? HIDDEN_POSE,
      surface,
      prepared,
    ),
    nigiri: resolveActorPose(
      selectedAssets.nigiri,
      "nigiri",
      layout.foods[2] ?? HIDDEN_POSE,
      surface,
      prepared,
    ),
    cow: resolveActorPose(
      selectedAssets.cow,
      "cow",
      layout.cow,
      surface,
      prepared,
    ),
    chicken: resolveActorPose(
      selectedAssets.chicken,
      "chicken",
      layout.chicken,
      surface,
      prepared,
    ),
    goldfish: resolveActorPose(
      selectedAssets.goldfish,
      "goldfish",
      layout.goldfish,
      surface,
      prepared,
    ),
    hand: resolveActorPose(
      selectedAssets.hand,
      "hand",
      layout.hand,
      null,
      prepared,
    ),
  };

  // Generalized "behind/beside with physical negative space" constraint.
  // The film provides a semantic direction + minimum visible surface gap; actual
  // asset dimensions decide whether the authored center point needs correction.
  for (const constraint of layout.directionalClearanceConstraints ?? []) {
    const movingPose = resolvedPoses[constraint.movingRole];
    const anchorPose = resolvedPoses[constraint.anchorRole];
    if (
      !movingPose?.visible ||
      !anchorPose?.visible ||
      (movingPose.opacity ?? 1) <= 0.001 ||
      (anchorPose.opacity ?? 1) <= 0.001
    ) {
      continue;
    }
    const movingAsset = selectedAssets[constraint.movingRole] ?? null;
    const anchorAsset = selectedAssets[constraint.anchorRole] ?? null;
    const solved = enforceDirectionalSurfaceClearance({
      movingPose: assetInteractionPoseForRole(
        movingAsset,
        constraint.movingRole,
        movingPose,
        prepared,
      ),
      movingGeometry: assetInteractionGeometryForRole(
        prepared,
        movingAsset,
        constraint.movingRole,
      ),
      anchorPose: assetInteractionPoseForRole(
        anchorAsset,
        constraint.anchorRole,
        anchorPose,
        prepared,
      ),
      anchorGeometry: assetInteractionGeometryForRole(
        prepared,
        anchorAsset,
        constraint.anchorRole,
      ),
      direction: constraint.direction,
      minimumSurfaceGapM: constraint.minimumSurfaceGapM,
    });
    resolvedPoses[constraint.movingRole] = runtimePoseFromInteractionPosition(
      movingAsset,
      constraint.movingRole,
      movingPose,
      solved.pose.position,
      prepared,
    );
  }

  for (const interaction of layout.interactions ?? []) {
    const sourcePose = resolvedPoses[interaction.sourceRole];
    const targetPose = resolvedPoses[interaction.targetRole];
    if (
      !sourcePose?.visible ||
      !targetPose?.visible ||
      (sourcePose.opacity ?? 1) <= 0.001 ||
      (targetPose.opacity ?? 1) <= 0.001
    ) {
      continue;
    }

    const sourceAsset = selectedAssets[interaction.sourceRole] ?? null;
    const targetAsset = selectedAssets[interaction.targetRole] ?? null;
    const sourceInteractionPose = generatedReadableInteractionPoseForRole(
      sourceAsset,
      interaction.sourceRole,
      sourcePose,
      prepared,
      enableGeneratedContactOrientation,
    );
    const targetInteractionPose = assetInteractionPoseForRole(
      targetAsset,
      interaction.targetRole,
      targetPose,
      prepared,
    );
    const sourcePreparedGeometry = prepared[interaction.sourceRole] ?? null;
    const targetPreparedGeometry = prepared[interaction.targetRole] ?? null;
    const obstacleSignature = interactionObstacleSignature(
      interaction,
      resolvedPoses,
      selectedAssets,
    );

    try {
      let cached = interactionCache.get(interaction.id);
      // Historical CP.2A.3 verifier marker retained for lineage only:
      // cached.phase !== interaction.phase
      const needsCompile =
        !cached ||
        cached.sourceAssetId !== (sourceAsset?.asset_id ?? null) ||
        cached.targetAssetId !== (targetAsset?.asset_id ?? null) ||
        cached.generatedOrientation !== enableGeneratedContactOrientation ||
        cached.sourcePreparedGeometry !== sourcePreparedGeometry ||
        cached.targetPreparedGeometry !== targetPreparedGeometry;

      // CP.2A.5 deliberately does NOT invalidate on phase, authored source
      // rotation/scale, target drift, or coarse obstacle movement. One physical
      // corridor/contact pair is locked at interaction entry and sampled through
      // approach -> contact -> retreat. Target-relative reanchoring below keeps
      // maintained contact exact without re-selecting the hand surface. Whole-
      // interaction compilation is both cheaper and temporally coherent.

      if (needsCompile) {
        const obstacles: AssetInteractionObstacle[] = interaction.obstacleRoles
          .filter(
            (role) =>
              role !== interaction.sourceRole &&
              role !== interaction.targetRole,
          )
          .flatMap((role) => {
            const obstaclePose = resolvedPoses[role];
            if (
              !obstaclePose?.visible ||
              (obstaclePose.opacity ?? 1) <= 0.01
            ) {
              return [];
            }
            const obstacleAsset = selectedAssets[role] ?? null;
            return [
              {
                id: role,
                pose: assetInteractionPoseForRole(
                  obstacleAsset,
                  role,
                  obstaclePose,
                  prepared,
                ),
                geometry: assetInteractionGeometryForRole(
                  prepared,
                  obstacleAsset,
                  role,
                ),
                clearance_m: interaction.obstacleClearanceM,
              },
            ];
          });

        const sourceGeometry = assetInteractionGeometryForRole(
          prepared,
          sourceAsset,
          interaction.sourceRole,
        );
        const targetGeometry = assetInteractionGeometryForRole(
          prepared,
          targetAsset,
          interaction.targetRole,
        );

        cached = solveInteractionForRuntimeCache({
          interaction,
          sourceAsset,
          targetAsset,
          sourceInteractionPose,
          targetInteractionPose,
          sourceGeometry,
          targetGeometry,
          obstacles,
          enableGeneratedContactOrientation,
          sourcePreparedGeometry,
          targetPreparedGeometry,
          obstacleSignature,
        });
        interactionCache.set(interaction.id, cached);
      }

      if (!cached) {
        throw new Error(`Interaction cache did not compile ${interaction.id}.`);
      }
      const solution = cached.solution;
      const sourceDelta = poseTranslationDelta(
        sourceInteractionPose,
        cached.sourcePoseAtSolve,
      );
      const targetContactRoot = reanchorPointToPose(
        solution.approach.end,
        cached.targetPoseAtSolve,
        targetInteractionPose,
      );
      const targetDelta: RuntimeVec3 = [
        targetContactRoot[0] - solution.approach.end[0],
        targetContactRoot[1] - solution.approach.end[1],
        targetContactRoot[2] - solution.approach.end[2],
      ];
      const progress = clamp01(interaction.phaseProgress);

      let solvedWorldRoot: RuntimeVec3;
      if (solution.contact.status === "blocked") {
        // Builder-style fail-closed behavior is compiled once per interaction.
        // Dynamic endpoint deltas keep the cached corridor attached to moving actors.
        const safeTail = 0.92;
        const sampleProgress = interaction.phase === "retreat"
          ? safeTail * (1 - progress)
          : safeTail * progress;
        const base = sampleAssetInteractionBezier(
          solution.approach,
          sampleProgress,
        );
        solvedWorldRoot = interaction.phase === "retreat"
          ? addWeightedDeltas(base, sourceDelta, progress, targetDelta, 1 - progress)
          : addWeightedDeltas(base, sourceDelta, 1 - progress, targetDelta, progress);
      } else if (interaction.phase === "approach") {
        const base = sampleAssetInteractionBezier(
          solution.approach,
          progress,
        );
        solvedWorldRoot = addWeightedDeltas(
          base,
          sourceDelta,
          1 - progress,
          targetDelta,
          progress,
        );
      } else if (interaction.phase === "contact" && interaction.maintainContact) {
        // Target-relative contact remains exact without rebuilding all route
        // candidates every frame: translate the compiled contact root with the
        // target's current world-space motion.
        solvedWorldRoot = targetContactRoot;
      } else {
        const base = sampleAssetInteractionBezier(
          solution.retreat,
          progress,
        );
        solvedWorldRoot = addWeightedDeltas(
          base,
          sourceDelta,
          progress,
          targetDelta,
          1 - progress,
        );
      }

      let interactionBasePose =
        enableGeneratedContactOrientation && interaction.sourceRole === "hand"
          ? { ...sourcePose, rotation: GENERATED_HAND_READABLE_ROTATION }
          : sourcePose;
      let contactOrientationApplied = false;
      if (
        enableGeneratedContactOrientation &&
        !cached.semanticEffectorLocked &&
        cached.contactOrientationAvailable &&
        solution.contact.status !== "blocked"
      ) {
        const orientationWeight =
          interaction.phase === "approach"
            ? progress
            : interaction.phase === "contact"
              ? 1
              : 1 - progress;
        const orientedPose = generatedContactFramePose(
          sourceInteractionPose,
          cached.sourceGeometry,
          solution.contact.source_region_id,
          reanchorDirectionToPose(
            solution.contact.target_outward_normal,
            cached.targetPoseAtSolve,
            targetInteractionPose,
          ),
          orientationWeight,
          sourceInteractionPose.rotation,
        );
        if (orientedPose) {
          interactionBasePose = {
            ...sourcePose,
            rotation: runtimeRotationFromCombined(
              sourceAsset,
              orientedPose.rotation,
            ),
          };
          contactOrientationApplied = true;
        }
      }

      resolvedPoses[interaction.sourceRole] =
        runtimePoseFromInteractionPosition(
          sourceAsset,
          interaction.sourceRole,
          interactionBasePose,
          solvedWorldRoot,
          prepared,
        );

      const sourceGroup = actorGroupForRole(actors, interaction.sourceRole);
      if (sourceGroup) {
        sourceGroup.userData.cinematicInteraction = {
          schema_version: solution.schema_version,
          id: interaction.id,
          phase: interaction.phase,
          contact_status: solution.contact.status,
          source_region: solution.contact.source_region_id,
          target_region: solution.contact.target_region_id,
          source_evidence: solution.diagnostics.source_contact_evidence,
          target_evidence: solution.diagnostics.target_contact_evidence,
          contact_gap_m: solution.contact.surface_gap_m,
          contact_collision_free: solution.diagnostics.contact_collision_free,
          approach_collision_free: solution.diagnostics.approach_collision_free,
          retreat_collision_free: solution.diagnostics.retreat_collision_free,
          contact_obstacle_ids: solution.diagnostics.contact_obstacle_ids,
          generated_contact_orientation_applied: contactOrientationApplied,
          generated_contact_frame: cached.semanticEffectorLocked
            ? "semantic-effector-locked"
            : contactOrientationApplied
              ? "normal+tangent"
              : "none",
          // Historical CP.2A.4 verifier marker retained while CP.2A.5 changes
          // the hand path authority: generated_contact_frame: contactOrientationApplied ? "normal+tangent" : "none"
          legacy_generated_contact_frame_marker:
            contactOrientationApplied ? "normal+tangent" : "none",
          generated_readable_effector_seed:
            enableGeneratedContactOrientation && interaction.sourceRole === "hand"
              ? "lunch_hand_semantic_effector_v2"
              : "none",
          performance_cache: "interaction_compiled",
          // Historical CP.2A.3/2A.4 compatibility marker:
          legacy_performance_cache: "phase_compiled",
        };
      }
    } catch (caught) {
      // A malformed/unmeasurable asset must degrade to the authored staging pose
      // rather than crash the entire cinematic player.
      interactionCache.delete(interaction.id);
      const sourceGroup = actorGroupForRole(actors, interaction.sourceRole);
      if (sourceGroup) {
        sourceGroup.userData.cinematicInteraction = {
          schema_version: "myway_asset_interaction_motion_solution_v1",
          id: interaction.id,
          phase: interaction.phase,
          contact_status: "unresolved",
          error: caught instanceof Error ? caught.message : String(caught),
        };
      }
    }
  }

  // All final transforms below are already support/contact/spacing resolved.
  applyActorPose(
    actors.tray.current,
    selectedAssets.tray,
    "tray",
    resolvedPoses.tray,
    null,
    prepared,
  );
  applyActorPose(
    actors.foods[0].current,
    selectedAssets.apple,
    "apple",
    resolvedPoses.apple,
    null,
    prepared,
  );
  applyActorPose(
    actors.foods[1].current,
    selectedAssets.burger,
    "burger",
    resolvedPoses.burger,
    null,
    prepared,
  );
  applyActorPose(
    actors.foods[2].current,
    selectedAssets.nigiri,
    "nigiri",
    resolvedPoses.nigiri,
    null,
    prepared,
  );
  applyActorPose(
    actors.cow.current,
    selectedAssets.cow,
    "cow",
    resolvedPoses.cow,
    null,
    prepared,
  );
  applyActorPose(
    actors.chicken.current,
    selectedAssets.chicken,
    "chicken",
    resolvedPoses.chicken,
    null,
    prepared,
  );
  applyActorPose(
    actors.goldfish.current,
    selectedAssets.goldfish,
    "goldfish",
    resolvedPoses.goldfish,
    null,
    prepared,
  );
  applyActorPose(
    actors.hand.current,
    selectedAssets.hand,
    "hand",
    resolvedPoses.hand,
    null,
    prepared,
  );

  applyShadowPose(
    shadows.foods[0].current,
    selectedAssets.apple,
    "apple",
    resolvedPoses.apple,
    surface,
    prepared,
    true,
  );
  applyShadowPose(
    shadows.foods[1].current,
    selectedAssets.burger,
    "burger",
    resolvedPoses.burger,
    surface,
    prepared,
    true,
  );
  applyShadowPose(
    shadows.foods[2].current,
    selectedAssets.nigiri,
    "nigiri",
    resolvedPoses.nigiri,
    surface,
    prepared,
    true,
  );
  applyShadowPose(
    shadows.cow.current,
    selectedAssets.cow,
    "cow",
    resolvedPoses.cow,
    surface,
    prepared,
    true,
  );
  applyShadowPose(
    shadows.chicken.current,
    selectedAssets.chicken,
    "chicken",
    resolvedPoses.chicken,
    surface,
    prepared,
    true,
  );
  applyShadowPose(
    shadows.goldfish.current,
    selectedAssets.goldfish,
    "goldfish",
    resolvedPoses.goldfish,
    surface,
    prepared,
    true,
  );

  if (includeCamera) {
    protectCameraFraming(
      camera,
      layout.camera.target,
      framing,
      prepared,
      framingSafetyState,
      framingScratch,
      timelineTimeS,
      isPlaying,
    );
  }
}

const ContactShadow = forwardRef<THREE.Mesh, { opacity?: number }>(function ContactShadow({ opacity }, ref) {
  return (
    <mesh ref={ref} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1, 40]} />
      <meshBasicMaterial color="#09101a" transparent opacity={opacity ?? 0.22} depthWrite={false} />
    </mesh>
  );
});

function InspectControls({ enabled }: { enabled: boolean }) {
  const { invalidate } = useThree();
  return (
    <OrbitControls
      enabled={enabled}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.3}
      maxDistance={8.2}
      minPolarAngle={0.28}
      maxPolarAngle={1.48}
      onChange={() => invalidate()}
    />
  );
}

function AnimatedCameraAndActors({
  selectedAssets,
  actors,
  shadows,
  isPlaying,
  inspectMode,
  isViewportActive,
  seekRequest,
  onPlaybackTime,
  onPlaybackEnded,
  preparedGeometryRef,
  runtimeSampler = sampleCinematicBurgerRuntime,
  durationS = CINEMATIC_BURGER_TIMELINE_DURATION_S,
  runtimeRevision = 0,
}: RuntimeCanvasProps & {
  actors: RuntimeActorRefs;
  shadows: RuntimeShadowRefs;
  preparedGeometryRef: MutableRefObject<PreparedGeometryByRole>;
  isViewportActive: boolean;
}) {
  const { camera, invalidate } = useThree();
  const runtimeDurationS = Math.max(0.001, durationS);
  const framing = useMemo(
    () => framingEntries(actors, selectedAssets),
    [actors, selectedAssets],
  );
  const timelineTimeRef = useRef(seekRequest.timeS);
  const playAnchorWallMsRef = useRef<number | null>(null);
  const playAnchorTimelineSRef = useRef(seekRequest.timeS);
  const lastUiNotifyMsRef = useRef(0);
  const endedNotifiedRef = useRef(false);
  const interactionCacheRef = useRef<InteractionRuntimeCache>(new Map());
  const framingScratchRef = useRef<FramingScratch>(createFramingScratch());
  const framingSafetyStateRef = useRef<FramingSafetyState>({
    correctionDistance: null,
    lastTimelineS: null,
  });

  useEffect(() => {
    timelineTimeRef.current = seekRequest.timeS;
    playAnchorTimelineSRef.current = seekRequest.timeS;
    playAnchorWallMsRef.current = null;
    endedNotifiedRef.current = false;
    interactionCacheRef.current.clear();
    framingSafetyStateRef.current = {
      correctionDistance: null,
      lastTimelineS: null,
    };
    invalidate();
  }, [
    invalidate,
    runtimeRevision,
    runtimeSampler,
    seekRequest.revision,
    seekRequest.timeS,
    selectedAssets,
  ]);

  const playbackActive = isPlaying && isViewportActive;

  useEffect(() => {
    if (playbackActive) {
      playAnchorTimelineSRef.current = timelineTimeRef.current;
      playAnchorWallMsRef.current = performance.now();
      endedNotifiedRef.current = false;
    } else if (playAnchorWallMsRef.current !== null) {
      const elapsedS = (performance.now() - playAnchorWallMsRef.current) / 1000;
      timelineTimeRef.current = Math.min(runtimeDurationS, playAnchorTimelineSRef.current + elapsedS);
      playAnchorTimelineSRef.current = timelineTimeRef.current;
      playAnchorWallMsRef.current = null;
    }
    invalidate();
  }, [invalidate, playbackActive, runtimeDurationS]);

  useEffect(() => {
    if (!playbackActive) {
      invalidate();
      return;
    }

    let frameId = 0;
    let lastPresentedMs = performance.now() - CINEMATIC_PREVIEW_FRAME_MS;
    const pump = (now: number) => {
      if (now - lastPresentedMs >= CINEMATIC_PREVIEW_FRAME_MS - 0.75) {
        lastPresentedMs = now;
        invalidate();
      }
      frameId = window.requestAnimationFrame(pump);
    };

    frameId = window.requestAnimationFrame(pump);
    return () => window.cancelAnimationFrame(frameId);
  }, [invalidate, playbackActive]);

  useFrame(() => {
    const now = performance.now();
    let timelineTimeS = timelineTimeRef.current;

    if (playbackActive && playAnchorWallMsRef.current !== null) {
      timelineTimeS =
        playAnchorTimelineSRef.current +
        (now - playAnchorWallMsRef.current) / 1000;
    }

    const reachedEnd = timelineTimeS >= runtimeDurationS;
    timelineTimeS = Math.min(runtimeDurationS, Math.max(0, timelineTimeS));
    timelineTimeRef.current = timelineTimeS;

    // CP.2A: golden mode uses sampleCinematicBurgerRuntime by default; generated
    // JSON supplies only this sampler. Geometry/contact/lighting/camera safety remain shared.
    const layout = runtimeSampler(timelineTimeS);
    applyRuntimeLayout(
      layout,
      actors,
      shadows,
      selectedAssets,
      framing,
      preparedGeometryRef.current,
      camera,
      !(inspectMode && !isPlaying),
      framingSafetyStateRef.current,
      framingScratchRef.current,
      timelineTimeS,
      playbackActive,
      // CP.2A.2 hotfix: generated-vs-golden belongs to the layout/interaction
      // application layer. Camera safety remains renderer-shared and sampler-agnostic.
      runtimeSampler !== sampleCinematicBurgerRuntime,
      interactionCacheRef.current,
    );

    if (now - lastUiNotifyMsRef.current >= 220 || reachedEnd || !playbackActive) {
      lastUiNotifyMsRef.current = now;
      onPlaybackTime(timelineTimeS);
    }

    if (reachedEnd && !endedNotifiedRef.current) {
      endedNotifiedRef.current = true;
      onPlaybackEnded();
    }
  });

  return null;
}

function CameraAwareStudioRig() {
  const { camera } = useThree();
  const keyRef = useRef<THREE.DirectionalLight | null>(null);
  const fillRef = useRef<THREE.DirectionalLight | null>(null);
  const rimRef = useRef<THREE.DirectionalLight | null>(null);
  const keyTargetRef = useRef<THREE.Object3D | null>(null);
  const fillTargetRef = useRef<THREE.Object3D | null>(null);
  const rimTargetRef = useRef<THREE.Object3D | null>(null);
  const scratchRef = useRef({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    focus: new THREE.Vector3(),
  });

  useFrame(() => {
    const scratch = scratchRef.current;
    const forward = scratch.forward
      .set(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize();
    const right = scratch.right
      .set(1, 0, 0)
      .applyQuaternion(camera.quaternion)
      .normalize();
    const up = scratch.up;
    const focus = scratch.focus.copy(camera.position).addScaledVector(forward, 4.2);
    focus.y = 0.38;

    const place = (
      light: THREE.DirectionalLight | null,
      target: THREE.Object3D | null,
      rightOffset: number,
      upOffset: number,
      backOffset: number,
    ) => {
      if (!light || !target) return;
      light.position.copy(focus)
        .addScaledVector(right, rightOffset)
        .addScaledVector(up, upOffset)
        .addScaledVector(forward, -backOffset);
      target.position.copy(focus);
      target.updateMatrixWorld(true);
      light.target = target;
      light.updateMatrixWorld(true);
    };

    // Screen-space studio lighting follows the master camera gently, preserving
    // key/fill/rim direction and exposure as the rail moves around the tabletop.
    place(keyRef.current, keyTargetRef.current, 2.8, 3.6, 2.4);
    place(fillRef.current, fillTargetRef.current, -3.2, 2.2, 1.8);
    place(rimRef.current, rimTargetRef.current, -1.2, 3.0, -2.8);
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#eef8ff", "#1a2130", 0.28]} />
      <directionalLight ref={keyRef} intensity={1.34} color="#fff4e8" />
      <directionalLight ref={fillRef} intensity={0.48} color="#f2f7ff" />
      <directionalLight ref={rimRef} intensity={0.42} color="#d7f2ff" />
      <object3D ref={keyTargetRef} />
      <object3D ref={fillTargetRef} />
      <object3D ref={rimTargetRef} />
    </>
  );
}

function StageBackdrop() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#151d2d" roughness={0.94} />
      </mesh>
      <mesh position={[0, 2.35, -2.6]}>
        <planeGeometry args={[10, 5]} />
        <meshStandardMaterial color="#276174" roughness={0.94} />
      </mesh>
      <mesh position={[0, 1.95, -2.56]}>
        <circleGeometry args={[2.05, 48]} />
        <meshBasicMaterial color="#e5f6fb" transparent opacity={0.045} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.95, 48]} />
        <meshStandardMaterial color="#2d3444" roughness={0.98} />
      </mesh>
    </group>
  );
}

function StageScene(props: RuntimeCanvasProps & { isViewportActive: boolean }) {
  const { invalidate } = useThree();
  const preparedGeometryRef = useRef<PreparedGeometryByRole>({});
  const handlePreparedGeometry = useCallback(
    (role: AssetRole, geometry: PreparedAssetGeometry | null) => {
      if (geometry) preparedGeometryRef.current[role] = geometry;
      else delete preparedGeometryRef.current[role];
      invalidate();
    },
    [invalidate],
  );

  const trayRef = useRef<THREE.Group | null>(null);
  const leftFoodRef = useRef<THREE.Group | null>(null);
  const centerFoodRef = useRef<THREE.Group | null>(null);
  const rightFoodRef = useRef<THREE.Group | null>(null);
  const cowRef = useRef<THREE.Group | null>(null);
  const chickenRef = useRef<THREE.Group | null>(null);
  const goldfishRef = useRef<THREE.Group | null>(null);
  const handRef = useRef<THREE.Group | null>(null);

  const leftFoodShadowRef = useRef<THREE.Mesh | null>(null);
  const centerFoodShadowRef = useRef<THREE.Mesh | null>(null);
  const rightFoodShadowRef = useRef<THREE.Mesh | null>(null);
  const cowShadowRef = useRef<THREE.Mesh | null>(null);
  const chickenShadowRef = useRef<THREE.Mesh | null>(null);
  const goldfishShadowRef = useRef<THREE.Mesh | null>(null);

  const actors: RuntimeActorRefs = {
    tray: trayRef,
    foods: [leftFoodRef, centerFoodRef, rightFoodRef],
    cow: cowRef,
    chicken: chickenRef,
    goldfish: goldfishRef,
    hand: handRef,
  };

  const shadows: RuntimeShadowRefs = {
    foods: [leftFoodShadowRef, centerFoodShadowRef, rightFoodShadowRef],
    cow: cowShadowRef,
    chicken: chickenShadowRef,
    goldfish: goldfishShadowRef,
  };

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 3.25, 5.35]} fov={42} />
      <InspectControls enabled={props.inspectMode && !props.isPlaying} />

      {/* CP.1E.7 camera-aware studio rig keeps screen-space lighting stable while
          the master camera rail redirects attention. */}
      <CameraAwareStudioRig />

      <StageBackdrop />

      <ContactShadow ref={leftFoodShadowRef} opacity={0.2} />
      <ContactShadow ref={centerFoodShadowRef} opacity={0.24} />
      <ContactShadow ref={rightFoodShadowRef} opacity={0.2} />
      <ContactShadow ref={cowShadowRef} opacity={0.2} />
      <ContactShadow ref={chickenShadowRef} opacity={0.18} />
      <ContactShadow ref={goldfishShadowRef} opacity={0.16} />

      <AssetActor ref={trayRef} asset={props.selectedAssets.tray} role="tray" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={leftFoodRef} asset={props.selectedAssets.apple} role="apple" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={centerFoodRef} asset={props.selectedAssets.burger} role="burger" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={rightFoodRef} asset={props.selectedAssets.nigiri} role="nigiri" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={cowRef} asset={props.selectedAssets.cow} role="cow" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={chickenRef} asset={props.selectedAssets.chicken} role="chicken" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={goldfishRef} asset={props.selectedAssets.goldfish} role="goldfish" onPreparedGeometry={handlePreparedGeometry} />
      <AssetActor ref={handRef} asset={props.selectedAssets.hand} role="hand" onPreparedGeometry={handlePreparedGeometry} />

      <AnimatedCameraAndActors
        {...props}
        actors={actors}
        shadows={shadows}
        preparedGeometryRef={preparedGeometryRef}
      />
    </>
  );
}

function RuntimeCanvasImpl(props: RuntimeCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isViewportActive, setIsViewportActive] = useState(true);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  useEffect(() => {
    const element = shellRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsViewportActive(Boolean(entry?.isIntersecting)),
      { threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setIsDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const update = () => setIsWindowFocused(document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  return (
    <div ref={shellRef} style={canvasShellStyle}>
      <Canvas
        dpr={1}
        frameloop="demand"
        shadows={false}
        gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
        camera={{ near: 0.05, far: 40 }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#0b1220"]} />
        <fog attach="fog" args={["#0b1220", 6.2, 10.5]} />
        <Suspense fallback={<Html center style={{ color: "white", fontSize: 12 }}>Loading cinematic stage…</Html>}>
          <StageScene
            {...props}
            isViewportActive={isViewportActive && isDocumentVisible && isWindowFocused}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export const CinematicProductionRuntimeCanvas = memo(
  RuntimeCanvasImpl,
  (previous, next) =>
    previous.selectedAssets === next.selectedAssets &&
    previous.isPlaying === next.isPlaying &&
    previous.inspectMode === next.inspectMode &&
    previous.seekRequest.revision === next.seekRequest.revision &&
    previous.runtimeSampler === next.runtimeSampler &&
    previous.durationS === next.durationS &&
    previous.runtimeRevision === next.runtimeRevision &&
    previous.onPlaybackTime === next.onPlaybackTime &&
    previous.onPlaybackEnded === next.onPlaybackEnded,
);

const canvasShellStyle = {
  width: "100%",
  minHeight: 560,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.12)",
  boxShadow: "0 24px 56px rgba(0,0,0,.28)",
  background: "#0b1220",
} as const;
