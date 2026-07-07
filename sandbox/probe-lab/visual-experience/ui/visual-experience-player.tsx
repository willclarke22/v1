"use client";

import { Suspense, useMemo } from "react";
import { Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import type { VisualAssetWithStats } from "../schema";

function LoadedGlbModel({ src }: { src: string }) {
  const gltf = useGLTF(src);

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.4 / maxDimension;

    cloned.position.sub(center);
    cloned.scale.setScalar(scale);

    cloned.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    return cloned;
  }, [gltf.scene]);

  return <primitive object={scene} />;
}

function LoadingCard() {
  return (
    <Html center>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: "1rem",
          padding: "0.75rem 1rem",
          color: "rgba(255,255,255,0.8)",
          background: "rgba(2,6,23,0.72)",
          whiteSpace: "nowrap",
        }}
      >
        Loading GLB…
      </div>
    </Html>
  );
}

export function VisualExperiencePlayer({ asset }: { asset: VisualAssetWithStats | null }) {
  if (!asset) {
    return (
      <div
        style={{
          display: "grid",
          minHeight: "520px",
          placeItems: "center",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "1.5rem",
          background: "rgba(255,255,255,0.045)",
          color: "rgba(255,255,255,0.62)",
        }}
      >
        Select a registered asset to preview it.
      </div>
    );
  }

  if (!asset.file_stats.exists) {
    return (
      <div
        style={{
          display: "grid",
          minHeight: "520px",
          placeItems: "center",
          border: "1px solid rgba(248,113,113,0.32)",
          borderRadius: "1.5rem",
          background: "rgba(127,29,29,0.16)",
          color: "rgba(254,226,226,0.86)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <strong>Asset file missing.</strong>
          <div style={{ marginTop: "0.5rem", opacity: 0.78 }}>{asset.public_path}</div>
        </div>
      </div>
    );
  }

  if (asset.asset_type !== "glb" && asset.asset_type !== "gltf") {
    return (
      <div
        style={{
          display: "grid",
          minHeight: "520px",
          placeItems: "center",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "1.5rem",
          background: "rgba(255,255,255,0.045)",
          color: "rgba(255,255,255,0.62)",
        }}
      >
        Preview for {asset.asset_type} assets comes later.
      </div>
    );
  }

  return (
    <div
      style={{
        height: "620px",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "1.5rem",
        overflow: "hidden",
        background: "rgba(255,255,255,0.045)",
        boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
      }}
    >
      <Canvas camera={{ position: [3.2, 2.4, 4.2], fov: 45 }} dpr={[1, 1.6]}>
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[4, 6, 5]} intensity={2.25} />
        <directionalLight position={[-4, 3, -5]} intensity={0.85} />

        <Suspense fallback={<LoadingCard />}>
          <Environment preset="city" />
          <LoadedGlbModel key={asset.public_path} src={asset.public_path} />
        </Suspense>

        <OrbitControls makeDefault enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}
