"use client";

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

import type { MyWayAssetGeometryProfileV1, MyWayAssetSupportSurface } from "../../assets/asset-types";

import {
  CINEMATIC_BURGER_TIMELINE_DURATION_S,
  sampleCinematicBurgerRuntime,
  type CinematicShotRuntimeLayout,
  type RuntimeActorPose,
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

type AssetRole =
  | "tray"
  | "apple"
  | "burger"
  | "nigiri"
  | "cow"
  | "chicken"
  | "goldfish"
  | "hand";

type RuntimeCanvasProps = {
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>;
  isPlaying: boolean;
  seekRequest: CinematicSeekRequest;
  inspectMode: boolean;
  onPlaybackTime: (timeS: number) => void;
  onPlaybackEnded: () => void;
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

type PreparedAssetGeometry = {
  sourceSize: RuntimeVec3;
  centerOffset: RuntimeVec3;
  localBounds: {
    min: RuntimeVec3;
    max: RuntimeVec3;
    center: RuntimeVec3;
    size: RuntimeVec3;
  };
  bottomContactCenter: RuntimeVec3;
  bottomContactSize: [number, number];
  supportSurfaces: PreparedSupportSurface[];
};

type PreparedGeometryByRole = Partial<Record<AssetRole, PreparedAssetGeometry>>;

function asRuntimeVec3(value: THREE.Vector3): RuntimeVec3 {
  return [value.x, value.y, value.z];
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
    bottomContactCenter: asRuntimeVec3(contactCenter),
    bottomContactSize,
    supportSurfaces:
      profile?.support_surfaces
        ?.filter((surface) => surface.source !== "legacy_ratio")
        .map((surface) =>
          preparedSupportSurface(surface, centerOffset, profile.primary_support_surface_id),
        ) ?? [],
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
  const outlineScene = useMemo(() => makeOutlineClone(gltf.scene), [gltf.scene]);

  useEffect(() => {
    onPreparedGeometry(prepared);
  }, [onPreparedGeometry, prepared]);

  const offset = prepared?.centerOffset ?? [0, 0, 0];
  return (
    <group position={offset}>
      <Clone object={gltf.scene} />
      <primitive object={outlineScene} />
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

function preparedGeometryFallback(
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
): PreparedAssetGeometry {
  const [w, h, d] = assetDimensions(asset, role);
  const sourceSize: RuntimeVec3 = [
    Math.max(0.001, Math.abs(w)),
    Math.max(0.001, Math.abs(h)),
    Math.max(0.001, Math.abs(d)),
  ];
  return {
    sourceSize,
    centerOffset: [0, 0, 0],
    localBounds: {
      min: [-sourceSize[0] / 2, 0, -sourceSize[2] / 2],
      max: [sourceSize[0] / 2, sourceSize[1], sourceSize[2] / 2],
      center: [0, sourceSize[1] / 2, 0],
      size: sourceSize,
    },
    bottomContactCenter: [0, 0, 0],
    bottomContactSize: [sourceSize[0] * 0.5, sourceSize[2] * 0.5],
    supportSurfaces: [],
  };
}

function geometryForRole(
  prepared: PreparedGeometryByRole,
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
) {
  return prepared[role] ?? preparedGeometryFallback(asset, role);
}

function selectPrimarySupportSurface(
  geometry: PreparedAssetGeometry,
): PreparedSupportSurface | null {
  if (!geometry.supportSurfaces.length) return null;
  return [...geometry.supportSurfaces].sort((left, right) => {
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

function rotatedBoundsMetrics(
  geometry: PreparedAssetGeometry,
  rotation: RuntimeVec3,
  scale: number,
) {
  const box = geometry.localBounds;
  const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2]);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const point = new THREE.Vector3(x, y, z).applyEuler(euler).multiplyScalar(scale);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        minZ = Math.min(minZ, point.z);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
        maxZ = Math.max(maxZ, point.z);
      }
    }
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

function applyGroupOpacity(group: THREE.Group, opacity: number) {
  const clamped = clamp01(opacity);
  group.userData.cinematicOpacity = clamped;

  group.traverse((object) => {
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
      const baseOpacity = typeof state.cinematicBaseOpacity === "number"
        ? state.cinematicBaseOpacity
        : 1;
      const baseTransparent = state.cinematicBaseTransparent === true;
      const baseDepthWrite = state.cinematicBaseDepthWrite !== false;
      const shouldFade = clamped < 0.999;
      const nextTransparent = baseTransparent || shouldFade;
      if (material.transparent !== nextTransparent) {
        material.transparent = nextTransparent;
        material.needsUpdate = true;
      }
      material.opacity = baseOpacity * clamped;
      material.depthWrite = shouldFade ? false : baseDepthWrite;
    }
  });
}

function applyGroupEmphasis(group: THREE.Group, emphasis: number, actorOpacity: number) {
  const clamped = clamp01(emphasis) * clamp01(actorOpacity);
  group.userData.cinematicEmphasis = clamped;

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.cinematicOutlineMesh !== true) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.visible = clamped > 0.002;
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = clamped * 0.92;
      }
    }
  });
}

function applyActorPose(
  group: THREE.Group | null,
  asset: CinematicLibraryAssetRecord | null,
  role: AssetRole,
  pose: RuntimeActorPose,
  surface: SurfaceInfo | null,
  prepared: PreparedGeometryByRole,
) {
  if (!group) return;
  const opacity = clamp01(pose.opacity ?? 1);
  const emphasis = clamp01(pose.emphasis ?? 0);
  group.visible = pose.visible && opacity > 0.001;
  applyGroupOpacity(group, opacity);
  applyGroupEmphasis(group, emphasis, opacity);
  if (!group.visible) return;

  const finalPose =
    role !== "tray" && role !== "hand" && surface
      ? constrainToSurface(
          asset,
          role as Exclude<AssetRole, "tray" | "hand">,
          pose,
          surface,
          prepared,
        )
      : pose;

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
) {
  if (!mesh) return;
  const actorOpacity = clamp01(pose.opacity ?? 1);
  if (!pose.visible || actorOpacity <= 0.001) {
    mesh.visible = false;
    return;
  }
  const finalPose = constrainToSurface(asset, role, pose, surface, prepared);
  const heightLift = clamp01(pose.position[1] / 0.6);
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

function localBoundsCorners(geometry: PreparedAssetGeometry) {
  const { min, max } = geometry.localBounds;
  const corners: THREE.Vector3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
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
) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;

  const targetVector = new THREE.Vector3(...target);
  const backward = camera.position.clone().sub(targetVector);
  const authoredDistance = Math.max(0.2, backward.length());
  if (backward.lengthSq() < 1e-8) backward.set(0, 0.2, 1);
  backward.normalize();

  const right = new THREE.Vector3().crossVectors(camera.up, backward);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(backward, right).normalize();

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

  let requiredDistance = authoredDistance;
  for (const entry of entries) {
    if (!entry.group?.visible) continue;
    const actorOpacity = Number(entry.group.userData.cinematicOpacity ?? 1);
    if (actorOpacity <= 0.06) continue;
    const geometry = geometryForRole(prepared, entry.asset, entry.role);
    entry.group.updateMatrixWorld(true);

    for (const corner of localBoundsCorners(geometry)) {
      const world = corner.applyMatrix4(entry.group.matrixWorld);
      const relative = world.sub(targetVector);
      const horizontal = Math.abs(relative.dot(right));
      const vertical = Math.abs(relative.dot(up));
      const longitudinal = relative.dot(backward);
      requiredDistance = Math.max(
        requiredDistance,
        horizontal / tanHorizontal + longitudinal,
        vertical / tanVertical + longitudinal,
      );
    }
  }

  if (requiredDistance > authoredDistance + 0.005) {
    camera.position.copy(targetVector).addScaledVector(
      backward,
      requiredDistance * 1.025,
    );
  }
  camera.lookAt(targetVector);
  camera.updateMatrixWorld(true);
}

function applyRuntimeLayout(
  layout: CinematicShotRuntimeLayout,
  actors: RuntimeActorRefs,
  shadows: RuntimeShadowRefs,
  selectedAssets: Record<string, CinematicLibraryAssetRecord | null>,
  prepared: PreparedGeometryByRole,
  camera: THREE.Camera,
  includeCamera: boolean,
) {
  if (includeCamera) {
    camera.position.set(...layout.camera.position);
    camera.lookAt(...layout.camera.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = layout.camera.fov;
      camera.updateProjectionMatrix();
    }
  }

  applyActorPose(
    actors.tray.current,
    selectedAssets.tray,
    "tray",
    layout.tray,
    null,
    prepared,
  );
  const surface = traySurfaceInfo(selectedAssets.tray, layout.tray, prepared);

  applyActorPose(actors.foods[0].current, selectedAssets.apple, "apple", layout.foods[0] ?? HIDDEN_POSE, surface, prepared);
  applyActorPose(actors.foods[1].current, selectedAssets.burger, "burger", layout.foods[1] ?? HIDDEN_POSE, surface, prepared);
  applyActorPose(actors.foods[2].current, selectedAssets.nigiri, "nigiri", layout.foods[2] ?? HIDDEN_POSE, surface, prepared);
  applyActorPose(actors.cow.current, selectedAssets.cow, "cow", layout.cow, surface, prepared);
  applyActorPose(actors.chicken.current, selectedAssets.chicken, "chicken", layout.chicken, surface, prepared);
  applyActorPose(actors.goldfish.current, selectedAssets.goldfish, "goldfish", layout.goldfish, surface, prepared);
  applyActorPose(actors.hand.current, selectedAssets.hand, "hand", layout.hand, null, prepared);

  applyShadowPose(shadows.foods[0].current, selectedAssets.apple, "apple", layout.foods[0] ?? HIDDEN_POSE, surface, prepared);
  applyShadowPose(shadows.foods[1].current, selectedAssets.burger, "burger", layout.foods[1] ?? HIDDEN_POSE, surface, prepared);
  applyShadowPose(shadows.foods[2].current, selectedAssets.nigiri, "nigiri", layout.foods[2] ?? HIDDEN_POSE, surface, prepared);
  applyShadowPose(shadows.cow.current, selectedAssets.cow, "cow", layout.cow, surface, prepared);
  applyShadowPose(shadows.chicken.current, selectedAssets.chicken, "chicken", layout.chicken, surface, prepared);
  applyShadowPose(shadows.goldfish.current, selectedAssets.goldfish, "goldfish", layout.goldfish, surface, prepared);

  if (includeCamera) {
    protectCameraFraming(
      camera,
      layout.camera.target,
      framingEntries(actors, selectedAssets),
      prepared,
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
}: RuntimeCanvasProps & {
  actors: RuntimeActorRefs;
  shadows: RuntimeShadowRefs;
  preparedGeometryRef: MutableRefObject<PreparedGeometryByRole>;
  isViewportActive: boolean;
}) {
  const { camera, invalidate } = useThree();
  const timelineTimeRef = useRef(seekRequest.timeS);
  const playAnchorWallMsRef = useRef<number | null>(null);
  const playAnchorTimelineSRef = useRef(seekRequest.timeS);
  const lastUiNotifyMsRef = useRef(0);
  const endedNotifiedRef = useRef(false);

  useEffect(() => {
    timelineTimeRef.current = seekRequest.timeS;
    playAnchorTimelineSRef.current = seekRequest.timeS;
    playAnchorWallMsRef.current = null;
    endedNotifiedRef.current = false;
    invalidate();
  }, [invalidate, seekRequest.revision, seekRequest.timeS]);

  useEffect(() => {
    if (isPlaying) {
      playAnchorTimelineSRef.current = timelineTimeRef.current;
      playAnchorWallMsRef.current = performance.now();
      endedNotifiedRef.current = false;
    } else if (playAnchorWallMsRef.current !== null) {
      const elapsedS = (performance.now() - playAnchorWallMsRef.current) / 1000;
      timelineTimeRef.current = Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, playAnchorTimelineSRef.current + elapsedS);
      playAnchorTimelineSRef.current = timelineTimeRef.current;
      playAnchorWallMsRef.current = null;
    }
    invalidate();
  }, [invalidate, isPlaying]);

  useEffect(() => {
    if (!isPlaying || !isViewportActive) {
      invalidate();
      return;
    }

    let frameId = 0;
    const pump = () => {
      invalidate();
      frameId = window.requestAnimationFrame(pump);
    };

    frameId = window.requestAnimationFrame(pump);
    return () => window.cancelAnimationFrame(frameId);
  }, [invalidate, isPlaying, isViewportActive]);

  useFrame(() => {
    const now = performance.now();
    let timelineTimeS = timelineTimeRef.current;

    if (isPlaying && playAnchorWallMsRef.current !== null) {
      timelineTimeS =
        playAnchorTimelineSRef.current +
        (now - playAnchorWallMsRef.current) / 1000;
    }

    const reachedEnd = timelineTimeS >= CINEMATIC_BURGER_TIMELINE_DURATION_S;
    timelineTimeS = Math.min(CINEMATIC_BURGER_TIMELINE_DURATION_S, Math.max(0, timelineTimeS));
    timelineTimeRef.current = timelineTimeS;

    const layout = sampleCinematicBurgerRuntime(timelineTimeS);
    applyRuntimeLayout(
      layout,
      actors,
      shadows,
      selectedAssets,
      preparedGeometryRef.current,
      camera,
      !(inspectMode && !isPlaying),
    );

    if (now - lastUiNotifyMsRef.current >= 220 || reachedEnd || !isPlaying) {
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

function StageBackdrop() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#151d2d" roughness={0.94} />
      </mesh>
      <mesh position={[0, 2.35, -2.6]}>
        <planeGeometry args={[10, 5]} />
        <meshStandardMaterial color="#1d8097" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.95, -2.56]}>
        <circleGeometry args={[2.05, 48]} />
        <meshBasicMaterial color="#d9f6ff" transparent opacity={0.07} depthWrite={false} />
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

      {/* Stable cinematic key/fill/rim rig: camera movement should not change the
          perceived exposure or color balance of the tabletop set. */}
      <ambientLight intensity={0.44} />
      <directionalLight position={[3.8, 5.6, 4.6]} intensity={1.58} color="#fff2df" />
      <directionalLight position={[-4.2, 3.2, 3.4]} intensity={0.42} color="#eef8ff" />
      <directionalLight position={[-2.5, 4.1, -3.8]} intensity={0.58} color="#bdeeff" />
      <hemisphereLight args={["#e7f8ff", "#121827", 0.24]} />

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
          <StageScene {...props} isViewportActive={isViewportActive && isDocumentVisible} />
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
