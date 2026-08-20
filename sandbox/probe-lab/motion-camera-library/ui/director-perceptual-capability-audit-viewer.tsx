

/**
 * Single-Canvas perceptual/composite Director real-asset viewer.
 * Reviewed Asset Library GLBs execute against the normalized role-space sampler.
 * The viewer is qualification evidence only; it is not allowed to become
 * production coordinate authority.
 */

"use client";

import { Clone, Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { MyWayAssetRecord } from "../../assets/asset-types";
import type { DirectorPerceptualCapability } from "../director-perceptual-capabilities";
import {
  directorPerceptualPreviewSlots,
  sampleDirectorPerceptualCapabilityRuntime,
  type DirectorPerceptualCapabilityPreviewSlot,
  type DirectorPerceptualCapabilityRuntimeSample,
  type DirectorPerceptualTravelDirection,
} from "../director-perceptual-runtime";
import {
  DirectorRealAssetLoadBoundary,
  directorRealAssetBrowserUrl,
} from "./director-real-asset-browser";

export type DirectorPerceptualLibraryAsset = MyWayAssetRecord & {
  file_stats: {
    exists: boolean;
    remote_url?: string | null;
  };
};

export type ResolvedPerceptualPreviewSlot = {
  slot: DirectorPerceptualCapabilityPreviewSlot;
  asset: DirectorPerceptualLibraryAsset | null;
};


type Props = {
  capability: DirectorPerceptualCapability;
  resolvedSlots: ResolvedPerceptualPreviewSlot[];
  realAssetsLoaded: boolean;
  realAssetsLoading: boolean;
  realAssetCount: number;
  realAssetError: string | null;
  onRequestRealAssets: () => void;
  directionDegrees: number;
  travelDirection: DirectorPerceptualTravelDirection;
  roleYawOffsets: Record<string, number>;
};

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function assetLabel(asset: DirectorPerceptualLibraryAsset) {
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

function LibraryAssetMesh({
  asset,
  targetExtent,
  yawOffsetDegrees,
  highlightValue,
}: {
  asset: DirectorPerceptualLibraryAsset;
  targetExtent: number;
  yawOffsetDegrees: number;
  highlightValue: number;
}) {
  const gltf = useGLTF(directorRealAssetBrowserUrl(asset));
  const dimensions = asset.dimensions_m ?? [1, 1, 1];
  const largestDimension = Math.max(
    0.001,
    ...dimensions.map((value) => Math.abs(Number(value) || 0)),
  );
  const scale = THREE.MathUtils.clamp(targetExtent / largestDimension, 0.04, 10);
  const rotation = asset.default_rotation ?? [0, 0, 0];
  const groundOffset = Number(asset.ground_offset_m) || 0;
  const outlineScene = useMemo(() => {
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
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
      });
    });
    return clone;
  }, [gltf.scene]);

  useEffect(() => () => {
    outlineScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }, [outlineScene]);

  const highlightActive = highlightValue >= 0.34;

  return (
    <group
      scale={scale}
      rotation={[
        rotation[0],
        rotation[1] + THREE.MathUtils.degToRad(yawOffsetDegrees),
        rotation[2],
      ]}
      position={[0, -groundOffset, 0]}
    >
      {highlightActive ? (
        <primitive object={outlineScene} scale={1.028} />
      ) : null}
      <Clone object={gltf.scene} />
    </group>
  );
}


function MissingRealAssetMarker({ label }: { label: string }) {
  return (
    <Html center>
      <div style={missingAssetPillStyle}>Select real asset · {label}</div>
    </Html>
  );
}

function PerceptualCameraController({
  sample,
  inspectMode,
}: {
  sample: DirectorPerceptualCapabilityRuntimeSample;
  inspectMode: boolean;
}) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    if (inspectMode) return;
    camera.position.set(...sample.camera.position);
    camera.lookAt(new THREE.Vector3(...sample.camera.target));
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = sample.camera.fov_degrees;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, inspectMode, invalidate, sample]);

  return null;
}

function PerceptualScene({
  capability,
  slots,
  progress,
  showLabels,
  showCameraPath,
  inspectMode,
  directionDegrees,
  travelDirection,
  roleYawOffsets,
}: {
  capability: DirectorPerceptualCapability;
  slots: ResolvedPerceptualPreviewSlot[];
  progress: number;
  showLabels: boolean;
  showCameraPath: boolean;
  inspectMode: boolean;
  directionDegrees: number;
  travelDirection: DirectorPerceptualTravelDirection;
  roleYawOffsets: Record<string, number>;
}) {
  const sample = useMemo(
    () => sampleDirectorPerceptualCapabilityRuntime(capability, progress, {
      direction_degrees: directionDegrees,
      travel_direction: travelDirection,
    }),
    [capability, directionDegrees, progress, travelDirection],
  );
  const slotMap = useMemo(
    () => new Map(slots.map((entry) => [entry.slot.slot_id, entry])),
    [slots],
  );
  const cameraPath = useMemo(
    () =>
      Array.from({ length: 41 }, (_, index) =>
        sampleDirectorPerceptualCapabilityRuntime(capability, index / 40, {
          direction_degrees: directionDegrees,
          travel_direction: travelDirection,
        }).camera.position,
      ),
    [capability, directionDegrees, travelDirection],
  );

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[5, 8, 6]} intensity={2.2} />
      <directionalLight position={[-4, 3, 2]} intensity={0.8} />
      <PerceptualCameraController sample={sample} inspectMode={inspectMode} />
      {inspectMode ? (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          target={[0, 0.65, 0]}
        />
      ) : null}

      <gridHelper args={[16, 16, "#1e3a8a", "#0f172a"]} position={[0, 0, 0]} />
      <mesh position={[0, -0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#07101f" roughness={0.94} />
      </mesh>

      {showCameraPath ? (
        <Line
          points={cameraPath}
          color="#93c5fd"
          lineWidth={1.25}
          transparent
          opacity={0.58}
        />
      ) : null}

      {sample.actor_poses.map((pose) => {
        const entry = slotMap.get(pose.slot_id);
        if (!entry || !pose.visible) return null;
        const label = entry.asset ? assetLabel(entry.asset) : entry.slot.label;
        return (
          <group
            key={pose.slot_id}
            position={pose.position}
            rotation={pose.rotation}
            scale={pose.scale_multiplier}
          >
            {entry.asset ? (
              <DirectorRealAssetLoadBoundary
                resetKey={`${entry.asset.asset_id}:${entry.asset.public_path}`}
                assetLabel={label}
                fallback={<MissingRealAssetMarker label={`${label} failed to load`} />}
              >
                <Suspense
                  fallback={
                    <Html center>
                      <div style={loadingPillStyle}>Loading {label}…</div>
                    </Html>
                  }
                >
                  <LibraryAssetMesh
                    asset={entry.asset}
                    targetExtent={entry.slot.target_extent_m}
                    yawOffsetDegrees={roleYawOffsets[pose.slot_id] ?? 0}
                    highlightValue={pose.emphasis}
                  />
                </Suspense>
              </DirectorRealAssetLoadBoundary>
            ) : (
              <MissingRealAssetMarker label={entry.slot.label} />
            )}
            {showLabels ? (
              <Html position={[0, entry.slot.target_extent_m * 0.82, 0]} center>
                <div style={roleLabelStyle}>{label}</div>
              </Html>
            ) : null}
          </group>
        );
      })}
    </>
  );
}

export function DirectorPerceptualCapabilityAuditViewer({
  capability,
  resolvedSlots,
  realAssetsLoaded,
  realAssetsLoading,
  realAssetCount,
  realAssetError,
  onRequestRealAssets,
  directionDegrees,
  travelDirection,
  roleYawOffsets,
}: Props) {
  const slots = useMemo(() => directorPerceptualPreviewSlots(capability), [capability]);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showCameraPath, setShowCameraPath] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProgress(0);
    setIsPlaying(false);
    setInspectMode(false);
    setShowCameraPath(false);
  }, [capability.id]);

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setIsIntersecting(entries[0]?.isIntersecting ?? true),
      { rootMargin: "140px", threshold: 0.02 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const effectivePlaying = isPlaying && isIntersecting && documentVisible;

  useEffect(() => {
    if (!effectivePlaying) return;
    const stepMs = 50;
    const durationMs = capability.id === "occlusion_to_parallax_discovery" ? 5600 : 4800;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + stepMs / durationMs;
        return next >= 1 ? next - 1 : next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [effectivePlaying, capability.id]);

  const currentSample = useMemo(
    () => sampleDirectorPerceptualCapabilityRuntime(capability, progress, {
      direction_degrees: directionDegrees,
      travel_direction: travelDirection,
    }),
    [capability, directionDegrees, progress, travelDirection],
  );
  const requiredSlots = slots.filter((slot) => slot.required);
  const realRequiredResolved = resolvedSlots.filter(
    (entry) => entry.slot.required && Boolean(entry.asset),
  ).length;


  return (
    <div ref={hostRef} style={shellStyle}>
      <div style={modeBarStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Real-asset perceptual execution</strong>
          <small style={mutedStyle}>
            One shared WebGL Canvas executes the capability directly with selected
            Asset Library GLBs.
          </small>
        </div>
      </div>

      <div style={viewerStyle}>
        {!realAssetsLoaded && !realAssetsLoading && !realAssetError ? (
          <div style={viewerMessageStyle}>
            <strong>Load the reviewed Asset Library to test this capability with real GLBs.</strong>
            <button type="button" onClick={onRequestRealAssets} style={buttonStyle}>Load Asset Library</button>
          </div>
        ) : realAssetsLoading ? (
          <div style={viewerMessageStyle}><strong>Loading reviewed Asset Library snapshot…</strong></div>
        ) : realAssetError ? (
          <div style={viewerMessageStyle}>
            <strong>Real-asset proof unavailable.</strong>
            <span>{realAssetError}</span>
            <button type="button" onClick={onRequestRealAssets} style={buttonStyle}>Retry Asset Library</button>
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 2.7, 7.2], fov: 42, near: 0.05, far: 90 }}
            dpr={1}
            frameloop="demand"
            gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
            shadows={false}
          >
            <PerceptualScene
              capability={capability}
              slots={resolvedSlots}
              progress={progress}
              showLabels={showLabels}
              showCameraPath={showCameraPath}
              inspectMode={inspectMode}
              directionDegrees={directionDegrees}
              travelDirection={travelDirection}
              roleYawOffsets={roleYawOffsets}
            />
          </Canvas>
        )}
        <div style={overlayStyle}>
          <span>{currentSample.phase_label}</span>
          <span>{Math.round(directionDegrees)}° capability direction</span>
          <span>{travelDirection === "reverse" ? "reverse path" : "forward path"}</span>
          <span>DPR 1 · demand render</span>
          <span>{realRequiredResolved}/{requiredSlots.length} required real roles</span>
          <span>{effectivePlaying ? (inspectMode ? "playing · inspect camera" : "playing") : inspectMode ? "inspect camera · paused" : !documentVisible ? "sleeping: tab hidden" : !isIntersecting ? "sleeping: offscreen" : "paused"}</span>
          <span>{realAssetCount} loadable assets</span>
        </div>
        <div style={safeFrameStyle} aria-hidden="true" />
      </div>

      <div style={transportStyle}>
        <button type="button" onClick={() => setIsPlaying((value) => !value)} style={buttonStyle}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => { setProgress(0); setIsPlaying(false); }} style={buttonStyle}>Reset</button>
        <button type="button" onClick={() => setInspectMode((value) => !value)} style={{ ...buttonStyle, ...(inspectMode ? activeButtonStyle : null) }}>
          {inspectMode ? "Exit inspect" : "Inspect scene"}
        </button>
        <label style={toggleLabelStyle}><input type="checkbox" checked={showCameraPath} onChange={(event) => setShowCameraPath(event.target.checked)} /> camera path</label>
        <label style={toggleLabelStyle}><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> role labels</label>
        <input
          aria-label="Perceptual capability progress"
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(event) => { setProgress(Number(event.target.value) / 1000); setIsPlaying(false); }}
          style={{ flex: "1 1 260px" }}
        />
        <code style={progressStyle}>{Math.round(progress * 100)}%</code>
        <span style={inspectPlaybackHintStyle}>
          Inspect keeps your manual camera while playback continues; exit inspect returns to the Director camera.
        </span>
      </div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(2,6,23,0.76)",
};

const modeBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  flexWrap: "wrap",
};


const viewerStyle: CSSProperties = {
  position: "relative",
  minHeight: 470,
  height: "min(58vh, 650px)",
  overflow: "hidden",
  borderRadius: 16,
  border: "1px solid rgba(148,163,184,0.15)",
  background: "#020617",
};

const viewerMessageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeContent: "center",
  justifyItems: "center",
  gap: 12,
  padding: 28,
  textAlign: "center",
  color: "rgba(255,255,255,0.72)",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  pointerEvents: "none",
};

const safeFrameStyle: CSSProperties = {
  position: "absolute",
  inset: "7% 6%",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  pointerEvents: "none",
};

const transportStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  background: "rgba(15,23,42,0.88)",
  color: "rgba(255,255,255,0.8)",
  padding: "8px 11px",
  fontWeight: 800,
  cursor: "pointer",
};

const activeButtonStyle: CSSProperties = {
  border: "1px solid rgba(56,189,248,0.5)",
  background: "rgba(14,116,144,0.24)",
};

const toggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(255,255,255,0.58)",
  fontSize: 11,
};

const progressStyle: CSSProperties = {
  color: "#bae6fd",
  minWidth: 44,
  textAlign: "right",
};

const inspectPlaybackHintStyle: CSSProperties = {
  flexBasis: "100%",
  color: "rgba(186,230,253,0.66)",
  fontSize: 10,
};

const mutedStyle: CSSProperties = {
  color: "rgba(255,255,255,0.5)",
};

const missingAssetPillStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 9px",
  color: "#fecaca",
  background: "rgba(69,10,10,0.88)",
  border: "1px solid rgba(248,113,113,0.28)",
  fontSize: 10,
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const loadingPillStyle: CSSProperties = {
  padding: "7px 9px",
  borderRadius: 999,
  background: "rgba(2,6,23,0.9)",
  border: "1px solid rgba(125,211,252,0.3)",
  color: "#e0f2fe",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const roleLabelStyle: CSSProperties = {
  padding: "5px 7px",
  borderRadius: 999,
  background: "rgba(2,6,23,0.88)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#f8fafc",
  fontSize: 10,
  whiteSpace: "nowrap",
};


