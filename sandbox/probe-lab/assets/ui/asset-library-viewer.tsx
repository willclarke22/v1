"use client";

import { Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo } from "react";
import type { ErrorInfo, ReactNode } from "react";
import * as THREE from "three";

import {
  BODYPARTS3D_SLP_COLLECTION_ID,
  bodyParts3dSemanticMaterialForMember,
  BODYPARTS3D_FULL_COLLECTION_ID,
  bodyParts3dSemanticMaterialForSystem,
  bodyParts3dSystemFromGroupTags,
} from "../bodyparts3d-slp-pilot";
import type { BodyParts3dSemanticMaterialV1 } from "../bodyparts3d-slp-pilot";

type Vec3 = [number, number, number];

type ViewerAsset = {
  asset_id: string;
  public_path: string;
  storage_provider?: "local" | "r2_private_pending" | "r2";
  asset_type: "glb" | "gltf" | "primitive";
  dimensions_m: Vec3;
  file_stats: { exists: boolean };
  geometry_profile?: {
    local_bounds: { min: Vec3; max: Vec3; size: Vec3; center: Vec3 };
  } | null;
  collection_membership?: {
    collection_id: string;
    member_id: string;
    group_tags?: string[];
  } | null;
};

type ViewerFraming = {
  center: Vec3;
  position: Vec3;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  gridY: number;
  gridSize: number;
};

function localAssetBounds(asset: ViewerAsset) {
  if (asset.geometry_profile?.local_bounds) return asset.geometry_profile.local_bounds;
  const size: Vec3 = [
    Math.max(asset.dimensions_m[0], 0.001),
    Math.max(asset.dimensions_m[2], 0.001),
    Math.max(asset.dimensions_m[1], 0.001),
  ];
  return {
    min: [-size[0] / 2, 0, -size[2] / 2] as Vec3,
    max: [size[0] / 2, size[1], size[2] / 2] as Vec3,
    size,
    center: [0, size[1] / 2, 0] as Vec3,
  };
}

function framingFromBox(box: THREE.Box3): ViewerFraming {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.025);
  const distance = Math.max(
    radius / Math.tan(THREE.MathUtils.degToRad(42) / 2) * 1.6,
    radius * 2.4,
    0.16,
  );
  const position = center.clone().addScaledVector(
    new THREE.Vector3(1.15, 0.72, 1.35).normalize(),
    distance,
  );
  const maxExtent = Math.max(size.x, size.y, size.z, 0.05);
  return {
    center: center.toArray() as Vec3,
    position: position.toArray() as Vec3,
    near: Math.max(0.002, distance - radius * 2.2),
    far: Math.max(25, distance + radius * 16),
    minDistance: Math.max(radius * 0.35, 0.015),
    maxDistance: Math.max(distance * 6, radius * 16, 2),
    gridY: box.min.y,
    gridSize: Math.max(0.5, maxExtent * 5),
  };
}

function assetViewerFraming(asset: ViewerAsset) {
  const bounds = localAssetBounds(asset);
  return framingFromBox(
    new THREE.Box3(
      new THREE.Vector3(...bounds.min),
      new THREE.Vector3(...bounds.max),
    ),
  );
}

function withRevision(url: string, registryRevision: string) {
  if (!registryRevision) return url;
  return `${url}${url.includes("?") ? "&" : "?"}revision=${encodeURIComponent(registryRevision)}`;
}

function modelUrl(
  asset: ViewerAsset,
  registryRevision: string,
) {
  const publicPath = asset.public_path.trim();
  if (asset.storage_provider === "r2_private_pending") {
    return withRevision(publicPath, registryRevision);
  }
  if (/^https:\/\//i.test(publicPath)) {
    return withRevision(
      `/api/sandbox/probe-lab/resource-runtime/models/file?asset_id=${encodeURIComponent(asset.asset_id)}`,
      registryRevision,
    );
  }
  return publicPath;
}

function LoadedAsset({ src }: { src: string }) {
  const gltf = useGLTF(src);
  return <Clone object={gltf.scene} castShadow receiveShadow />;
}

function semanticMaterial(asset: ViewerAsset) {
  const membership = asset.collection_membership;
  if (!membership) return null;
  if (membership.collection_id === BODYPARTS3D_SLP_COLLECTION_ID) {
    return bodyParts3dSemanticMaterialForMember(membership.member_id);
  }
  if (membership.collection_id === BODYPARTS3D_FULL_COLLECTION_ID) {
    return bodyParts3dSemanticMaterialForSystem(
      bodyParts3dSystemFromGroupTags(membership.group_tags ?? []),
    );
  }
  return null;
}

function SemanticMaterialAsset({ src, material }: { src: string; material: BodyParts3dSemanticMaterialV1 }) {
  const gltf = useGLTF(src);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const recolored = sourceMaterials.map((sourceMaterial) => {
        const nextMaterial = sourceMaterial.clone();
        if ("color" in nextMaterial && nextMaterial.color instanceof THREE.Color) nextMaterial.color.set(material.base_color);
        if ("roughness" in nextMaterial && typeof nextMaterial.roughness === "number") nextMaterial.roughness = material.roughness;
        if ("metalness" in nextMaterial && typeof nextMaterial.metalness === "number") nextMaterial.metalness = material.metalness;
        nextMaterial.needsUpdate = true;
        return nextMaterial;
      });
      mesh.material = Array.isArray(mesh.material) ? recolored : recolored[0];
    });
    return clone;
  }, [gltf.scene, material.base_color, material.metalness, material.roughness]);

  useEffect(() => () => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((entry) => entry.dispose());
    });
  }, [scene]);

  return <primitive object={scene} />;
}

function ViewerLoading() {
  return <Html center><div className="asset-library-loading">Loading 3D asset…</div></Html>;
}

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Asset library GLB preview unavailable.", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return <div className="asset-library-viewer-message"><strong>The GLB could not be previewed.</strong><span>{this.state.error}</span></div>;
    }
    return this.props.children;
  }
}

export function AssetLibraryViewer({
  asset,
  registryRevision = "",
}: {
  asset: ViewerAsset | null;
  registryRevision?: string;
}) {
  if (!asset) return <div className="asset-library-viewer-message">Select an asset to inspect it in 3D.</div>;
  if (!asset.file_stats.exists || (asset.asset_type !== "glb" && asset.asset_type !== "gltf")) {
    return <div className="asset-library-viewer-message"><strong>No browser-loadable 3D file is available.</strong><span>This entry is either procedural or its registered file is missing.</span></div>;
  }
  const framing = assetViewerFraming(asset);
  const material = semanticMaterial(asset);
  const previewUrl = modelUrl(asset, registryRevision);
  return (
    <ViewerErrorBoundary key={asset.asset_id}>
      <Canvas camera={{ position: framing.position, fov: 42, near: framing.near, far: framing.far }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={0.75} />
        <hemisphereLight args={["#f8fafc", "#172554", 1.15]} position={[0, 4, 0]} />
        <directionalLight intensity={2.2} position={[4, 6, 5]} />
        <directionalLight intensity={0.85} position={[-4, 2, -3]} />
        <Suspense fallback={<ViewerLoading />}>
          {material ? <SemanticMaterialAsset src={previewUrl} material={material} /> : <LoadedAsset src={previewUrl} />}
        </Suspense>
        <gridHelper args={[framing.gridSize, 20, "#334155", "#172033"]} position={[framing.center[0], framing.gridY, framing.center[2]]} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={framing.center} minDistance={framing.minDistance} maxDistance={framing.maxDistance} />
      </Canvas>
    </ViewerErrorBoundary>
  );
}
