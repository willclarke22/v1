"use client";

import { Canvas } from "@react-three/fiber";
import type { ChangeEvent, CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DirectorBlockingCue,
  DirectorCapability,
} from "../director-capability-registry";
import {
  directorControlledAuditRoleLayout,
  directorVisualAuditDefinition,
  type DirectorAuditFixtureKind,
} from "../director-visual-audit";
import {
  DirectorCapabilityPreview,
  type ResolvedDirectorRole,
} from "./director-capability-preview";

type DirectorAuditViewerProps = {
  capability: DirectorCapability;
  realRoles: ResolvedDirectorRole[];
  realAssetCount: number;
  realAssetsLoaded: boolean;
  realAssetsLoading: boolean;
  realAssetError: string | null;
  onRequestRealAssets: () => void;
};

type PreviewMode = "controlled" | "real_assets";

function controlledRolesFor(
  capability: DirectorCapability,
  fixtureKind: DirectorAuditFixtureKind,
): ResolvedDirectorRole[] {
  return capability.demo.asset_roles.map((role) => {
    const layout = directorControlledAuditRoleLayout(fixtureKind, role.role, capability.id);
    const blocking: DirectorBlockingCue = {
      role: role.role,
      position: [...layout.position],
      rotation: [...layout.rotation],
      target_extent_m: layout.target_extent_m,
    };

    return {
      role: role.role,
      asset: null,
      blocking,
      matched_concept: "controlled audit fixture",
    };
  });
}

export function DirectorAuditViewer({
  capability,
  realRoles,
  realAssetCount,
  realAssetsLoaded,
  realAssetsLoading,
  realAssetError,
  onRequestRealAssets,
}: DirectorAuditViewerProps) {
  const definition = useMemo(
    () => directorVisualAuditDefinition(capability),
    [capability],
  );
  const controlledRoles = useMemo(
    () => controlledRolesFor(capability, definition.fixture),
    [capability, definition.fixture],
  );

  const [mode, setMode] = useState<PreviewMode>("controlled");
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCameraPath, setShowCameraPath] = useState(false);
  const [showRoleLabels, setShowRoleLabels] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProgress(0);
    setIsPlaying(false);
    setShowCameraPath(false);
  }, [capability.id]);

  useEffect(() => {
    const onVisibility = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setIsIntersecting(entries[0]?.isIntersecting ?? true);
      },
      { rootMargin: "120px", threshold: 0.02 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const effectivePlaying = isPlaying && isIntersecting && documentVisible;

  useEffect(() => {
    if (!effectivePlaying) return;
    const duration = Math.max(1000, capability.demo.duration_ms);
    const stepMs = 66;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + stepMs / duration;
        return next >= 1 ? next - 1 : next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [capability.demo.duration_ms, effectivePlaying]);

  const roles = mode === "controlled" ? controlledRoles : realRoles;
  const realModeUnavailable =
    mode === "real_assets" && !realAssetsLoaded && !realAssetsLoading;

  function chooseMode(next: PreviewMode) {
    setMode(next);
    setProgress(0);
    setIsPlaying(false);
    if (next === "real_assets" && !realAssetsLoaded && !realAssetsLoading) {
      onRequestRealAssets();
    }
  }

  return (
    <div ref={hostRef} style={shellStyle}>
      <div style={modeBarStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Audit viewer</strong>
          <small style={mutedStyle}>
            Controlled proof is the qualification fixture. Real assets are an
            optional generalization check.
          </small>
        </div>
        <div style={segmentedStyle}>
          <button
            type="button"
            onClick={() => chooseMode("controlled")}
            style={{
              ...segmentButtonStyle,
              ...(mode === "controlled" ? activeSegmentStyle : null),
            }}
          >
            Controlled proof
          </button>
          <button
            type="button"
            onClick={() => chooseMode("real_assets")}
            style={{
              ...segmentButtonStyle,
              ...(mode === "real_assets" ? activeSegmentStyle : null),
            }}
          >
            Real-asset proof
          </button>
        </div>
      </div>

      <div style={viewerStyle}>
        {realModeUnavailable ? (
          <div style={viewerMessageStyle}>
            <strong>Real assets have not been loaded.</strong>
            <button
              type="button"
              onClick={onRequestRealAssets}
              style={buttonStyle}
            >
              Load Asset Library
            </button>
          </div>
        ) : realAssetsLoading && mode === "real_assets" ? (
          <div style={viewerMessageStyle}>
            <strong>Loading reviewed Asset Library snapshot…</strong>
          </div>
        ) : realAssetError && mode === "real_assets" ? (
          <div style={viewerMessageStyle}>
            <strong>Real-asset proof unavailable.</strong>
            <span>{realAssetError}</span>
            <button
              type="button"
              onClick={onRequestRealAssets}
              style={buttonStyle}
            >
              Retry Asset Library
            </button>
          </div>
        ) : (
          <Canvas
            camera={{
              position: [5.8, 3.1, 6.8],
              fov: 42,
              near: 0.05,
              far: 80,
            }}
            dpr={1}
            frameloop="demand"
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: "low-power",
            }}
            shadows={false}
          >
            <DirectorCapabilityPreview
              capability={capability}
              roles={roles}
              progress={progress}
              isPlaying={effectivePlaying}
              showCameraPath={showCameraPath}
              showRoleLabels={showRoleLabels}
              fixtureMode={mode}
              fixtureKind={definition.fixture}
              auditSnap
            />
          </Canvas>
        )}

        <div style={overlayStyle}>
          <span>{definition.fixture.replace(/_/g, " ")}</span>
          <span>DPR 1 · demand render</span>
          <span>
            {effectivePlaying
              ? "playing"
              : !documentVisible
                ? "sleeping: tab hidden"
                : !isIntersecting
                  ? "sleeping: offscreen"
                  : "paused"}
          </span>
          {mode === "real_assets" ? (
            <span>{realAssetCount} browser-loadable assets</span>
          ) : (
            <span>no GLB required</span>
          )}
        </div>
        <div style={safeFrameStyle} aria-hidden="true" />
      </div>

      <div style={transportStyle}>
        <button
          type="button"
          onClick={() => setIsPlaying((value) => !value)}
          style={primaryButtonStyle}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setProgress(0);
          }}
          style={buttonStyle}
        >
          Restart
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setIsPlaying(false);
            setProgress(Number(event.target.value));
          }}
          style={{ flex: 1, minWidth: 180 }}
          aria-label="Capability timeline"
        />
        <span style={timeStyle}>
          {Math.round(progress * capability.demo.duration_ms)} /{" "}
          {capability.demo.duration_ms} ms
        </span>
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={showCameraPath}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setShowCameraPath(event.target.checked)
            }
          />
          camera path
        </label>
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={showRoleLabels}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setShowRoleLabels(event.target.checked)
            }
          />
          role labels
        </label>
      </div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const modeBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(125,211,252,0.18)",
  background: "rgba(2,6,23,0.78)",
};

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  borderRadius: 12,
  background: "rgba(15,23,42,0.82)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const segmentButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "8px 10px",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 11,
};

const activeSegmentStyle: CSSProperties = {
  background: "rgba(14,165,233,0.18)",
  color: "#e0f2fe",
};

const viewerStyle: CSSProperties = {
  position: "relative",
  minHeight: "clamp(500px, 60vh, 740px)",
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid rgba(125,211,252,0.22)",
  background: "#020617",
  boxShadow: "0 24px 80px rgba(0,0,0,0.36)",
};

const viewerMessageStyle: CSSProperties = {
  minHeight: 500,
  display: "grid",
  placeContent: "center",
  justifyItems: "center",
  gap: 10,
  padding: 24,
  textAlign: "center",
  color: "rgba(226,232,240,0.72)",
  background: "#020617",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  zIndex: 5,
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
  pointerEvents: "none",
  color: "#dbeafe",
  fontSize: 10,
};

const safeFrameStyle: CSSProperties = {
  position: "absolute",
  inset: "9% 8%",
  zIndex: 4,
  border: "1px dashed rgba(255,255,255,0.14)",
  borderRadius: 8,
  pointerEvents: "none",
};

const transportStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.78)",
};

const buttonStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 850,
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(135deg, #0284c7, #2563eb)",
  borderColor: "rgba(125,211,252,0.65)",
};

const timeStyle: CSSProperties = {
  color: "#bae6fd",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 11,
};

const toggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(226,232,240,0.72)",
  fontSize: 11,
};

const mutedStyle: CSSProperties = {
  color: "rgba(226,232,240,0.62)",
};
