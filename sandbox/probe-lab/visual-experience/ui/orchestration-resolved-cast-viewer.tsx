"use client";

import {
  Center,
  Clone,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { CSSProperties, ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import {
  bodyParts3dSemanticMaterialForSystem,
  bodyParts3dSystemFromGroupTags,
} from "../../assets/bodyparts3d-slp-pilot";
import {
  DirectorRealAssetLoadBoundary,
  directorRealAssetBrowserUrl,
} from "../../motion-camera-library/ui/director-real-asset-browser";

type RecordValue = Record<string, unknown>;
type GroundingStatus =
  | "resolved"
  | "ambiguous"
  | "candidate_below_threshold"
  | "missing";

type GroundedAsset = {
  asset_id: string;
  public_path: string;
  canonical_label: string | null;
  display_name: string | null;
  dimensions_m: [number, number, number] | null;
  default_rotation: [number, number, number] | null;
  ground_offset_m: number;
  collection_membership: {
    collection_id: string | null;
    concept_name: string | null;
    group_tags: string[];
  } | null;
};

type GroundedCastEntry = {
  key: string;
  concept: string;
  role: string;
  laterality: string;
  status: GroundingStatus;
  method: string;
  confidence: string;
  asset: GroundedAsset | null;
  candidateCount: number;
  presentationChoiceOnly: boolean;
  appearanceRequest: RecordValue | null;
};

const shell: CSSProperties = {
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.7)",
  overflow: "hidden",
};

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const parsed = value.slice(0, 3).map((item) => Number(item));
  return parsed.every(Number.isFinite)
    ? ([parsed[0]!, parsed[1]!, parsed[2]!] as [number, number, number])
    : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseAsset(value: unknown): GroundedAsset | null {
  const asset = asRecord(value);
  if (!asset) return null;
  const assetId = text(asset.asset_id);
  const publicPath = text(asset.public_path);
  if (!assetId || !publicPath) return null;
  const membership = asRecord(asset.collection_membership);
  return {
    asset_id: assetId,
    public_path: publicPath,
    canonical_label: text(asset.canonical_label) || null,
    display_name: text(asset.display_name) || null,
    dimensions_m: vec3(asset.dimensions_m),
    default_rotation: vec3(asset.default_rotation),
    ground_offset_m: number(asset.ground_offset_m),
    collection_membership: membership
      ? {
          collection_id: text(membership.collection_id) || null,
          concept_name: text(membership.concept_name) || null,
          group_tags: stringList(membership.group_tags),
        }
      : null,
  };
}

function parseGrounding(value: unknown): GroundedCastEntry[] {
  const grounding = asRecord(value);
  const results = Array.isArray(grounding?.results) ? grounding.results : [];
  return results.flatMap((raw, index) => {
    const result = asRecord(raw);
    const intent = asRecord(result?.intent);
    if (!result || !intent) return [];
    const statusValue = text(result.status) as GroundingStatus;
    const status: GroundingStatus = [
      "resolved",
      "ambiguous",
      "candidate_below_threshold",
      "missing",
    ].includes(statusValue)
      ? statusValue
      : "missing";
    const diagnostics = asRecord(result.diagnostics);
    const concept = text(intent.concept, `asset ${index + 1}`);
    const asset = status === "resolved" ? parseAsset(result.resolved_asset) : null;
    return [
      {
        key: `${concept}-${asset?.asset_id ?? index}`,
        concept,
        role: text(intent.role, "visual asset"),
        laterality: text(intent.laterality, "unspecified"),
        status,
        method: text(result.method, "none"),
        confidence: text(result.confidence, "low"),
        asset,
        candidateCount: Array.isArray(result.candidates) ? result.candidates.length : 0,
        presentationChoiceOnly: diagnostics?.presentation_choice_only === true,
        appearanceRequest: asRecord(result.appearance_request),
      },
    ];
  });
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetLabel(asset: GroundedAsset) {
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

function statusStyle(status: GroundingStatus): CSSProperties {
  if (status === "resolved") {
    return {
      color: "#bbf7d0",
      background: "rgba(34,197,94,0.1)",
      border: "1px solid rgba(74,222,128,0.22)",
    };
  }
  if (status === "ambiguous") {
    return {
      color: "#fde68a",
      background: "rgba(245,158,11,0.1)",
      border: "1px solid rgba(251,191,36,0.22)",
    };
  }
  if (status === "candidate_below_threshold") {
    return {
      color: "#bae6fd",
      background: "rgba(14,165,233,0.1)",
      border: "1px solid rgba(56,189,248,0.22)",
    };
  }
  return {
    color: "#cbd5e1",
    background: "rgba(148,163,184,0.08)",
    border: "1px solid rgba(148,163,184,0.16)",
  };
}

function appearanceSummary(value: RecordValue | null) {
  if (!value) return null;
  const pairs = Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && String(item).trim())
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${String(item)}`);
  return pairs.length ? pairs.join(" · ") : null;
}

function bodyPartsMaterial(asset: GroundedAsset) {
  const membership = asset.collection_membership;
  if (!membership?.collection_id?.startsWith("bodyparts3d_")) return null;
  const system = bodyParts3dSystemFromGroupTags(membership.group_tags);
  return bodyParts3dSemanticMaterialForSystem(system);
}

function ResolvedCastModel({ asset }: { asset: GroundedAsset }) {
  const url = directorRealAssetBrowserUrl(asset);
  const gltf = useGLTF(url);
  const semanticMaterial = bodyPartsMaterial(asset);
  const semanticScene = useMemo(() => {
    if (!semanticMaterial) return null;
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = new THREE.MeshStandardMaterial({
        color: semanticMaterial.base_color,
        roughness: semanticMaterial.roughness,
        metalness: semanticMaterial.metalness,
      });
    });
    return clone;
  }, [gltf.scene, semanticMaterial]);

  useEffect(() => () => {
    semanticScene?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }, [semanticScene]);

  const dimensions = asset.dimensions_m ?? [1, 1, 1];
  const largestDimension = Math.max(
    0.001,
    ...dimensions.map((value) => Math.abs(Number(value) || 0)),
  );
  const displayScale = THREE.MathUtils.clamp(2.55 / largestDimension, 0.03, 18);
  const rotation = asset.default_rotation ?? [0, 0, 0];

  return (
    <Center bottom>
      <group scale={displayScale} rotation={rotation}>
        {semanticScene ? (
          <primitive object={semanticScene} />
        ) : (
          <Clone object={gltf.scene} />
        )}
      </group>
    </Center>
  );
}

function LoadingAsset() {
  return (
    <Html center>
      <div
        style={{
          borderRadius: 999,
          border: "1px solid rgba(125,211,252,0.28)",
          background: "rgba(2,6,23,0.9)",
          color: "#e0f2fe",
          padding: "8px 11px",
          fontSize: 11,
          fontWeight: 750,
          whiteSpace: "nowrap",
        }}
      >
        Loading grounded GLB…
      </div>
    </Html>
  );
}

function LoadFallback() {
  return (
    <mesh position={[0, 0.6, 0]}>
      <boxGeometry args={[1, 1.2, 1]} />
      <meshStandardMaterial color="#334155" roughness={0.85} />
    </mesh>
  );
}

function ViewerCanvas({ entry }: { entry: GroundedCastEntry }) {
  if (!entry.asset) {
    return (
      <div
        style={{
          minHeight: 460,
          display: "grid",
          placeItems: "center",
          padding: 28,
          textAlign: "center",
          color: "rgba(226,232,240,0.58)",
          background:
            "radial-gradient(circle at 50% 35%, rgba(30,64,175,0.12), rgba(2,6,23,0.9) 62%)",
        }}
      >
        No resolved GLB is available for this cast item.
      </div>
    );
  }

  const label = assetLabel(entry.asset);
  return (
    <div style={{ minHeight: 460, height: "min(58vh, 620px)" }}>
      <Canvas
        frameloop="demand"
        shadows
        camera={{ position: [3.7, 2.55, 4.65], fov: 36, near: 0.01, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#07101d"]} />
        <ambientLight intensity={0.78} />
        <hemisphereLight args={["#f8fafc", "#172554", 1.08]} position={[0, 5, 0]} />
        <directionalLight castShadow intensity={2.35} position={[4.5, 6, 5]} />
        <directionalLight intensity={0.8} position={[-4, 2.5, -3]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#0b1422" roughness={1} />
        </mesh>
        <Suspense fallback={<LoadingAsset />}>
          <DirectorRealAssetLoadBoundary
            resetKey={entry.asset.asset_id}
            assetLabel={label}
            fallback={<LoadFallback />}
          >
            <ResolvedCastModel asset={entry.asset} />
          </DirectorRealAssetLoadBoundary>
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          target={[0, 1.15, 0]}
          minDistance={2.2}
          maxDistance={11}
        />
      </Canvas>
    </div>
  );
}

function EmptyViewer({ children }: { children: ReactNode }) {
  return (
    <section style={{ ...shell, minHeight: 300, display: "grid", placeItems: "center", padding: 28 }}>
      <div style={{ maxWidth: 560, textAlign: "center", color: "rgba(226,232,240,0.58)", lineHeight: 1.6 }}>
        {children}
      </div>
    </section>
  );
}

export function OrchestrationResolvedCastViewer({
  groundingValue,
}: {
  groundingValue: unknown;
}) {
  const entries = useMemo(() => parseGrounding(groundingValue), [groundingValue]);
  const resolvedEntries = useMemo(
    () => entries.filter((entry) => entry.status === "resolved" && entry.asset),
    [entries],
  );
  const signature = resolvedEntries.map((entry) => entry.key).join("|");
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    setSelectedKey((current) =>
      resolvedEntries.some((entry) => entry.key === current)
        ? current
        : (resolvedEntries[0]?.key ?? ""),
    );
  }, [signature, resolvedEntries]);

  if (!entries.length) return null;

  const selected =
    resolvedEntries.find((entry) => entry.key === selectedKey) ??
    resolvedEntries[0] ??
    null;
  const resolvedCount = entries.filter((entry) => entry.status === "resolved").length;
  const unresolvedCount = entries.length - resolvedCount;

  if (!selected) {
    return (
      <EmptyViewer>
        <strong style={{ display: "block", color: "#f8fafc", marginBottom: 6 }}>
          No grounded asset is ready to inspect yet.
        </strong>
        MyWay kept {entries.length} cast requirement{entries.length === 1 ? "" : "s"} honest rather than rendering an ambiguous, below-threshold, or missing candidate as though it were resolved.
      </EmptyViewer>
    );
  }

  const selectedAppearance = appearanceSummary(selected.appearanceRequest);

  return (
    <section style={shell}>
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.09)",
          background: "rgba(2,6,23,0.34)",
        }}
      >
        <div>
          <div style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 850, letterSpacing: 0.8 }}>
            RESOLVED CAST INSPECTOR
          </div>
          <h3 style={{ margin: "4px 0 0", fontSize: 19 }}>Grounded assets, before scene composition</h3>
        </div>
        <div style={{ color: "rgba(226,232,240,0.58)", fontSize: 12 }}>
          {resolvedCount} resolved{unresolvedCount ? ` · ${unresolvedCount} unresolved` : ""}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
          minHeight: 460,
        }}
      >
        <div style={{ position: "relative", minWidth: 0 }}>
          <ViewerCanvas entry={selected} />
          <div
            style={{
              position: "absolute",
              left: 14,
              bottom: 14,
              borderRadius: 999,
              padding: "7px 10px",
              background: "rgba(2,6,23,0.76)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(226,232,240,0.66)",
              fontSize: 11,
              backdropFilter: "blur(8px)",
              pointerEvents: "none",
            }}
          >
            Drag to rotate · scroll to zoom
          </div>
        </div>

        <aside
          style={{
            borderLeft: "1px solid rgba(255,255,255,0.09)",
            padding: 14,
            display: "grid",
            alignContent: "start",
            gap: 9,
            background: "rgba(2,6,23,0.46)",
            maxHeight: "min(58vh, 620px)",
            overflow: "auto",
          }}
        >
          <div style={{ color: "rgba(226,232,240,0.5)", fontSize: 10, fontWeight: 850, letterSpacing: 0.7 }}>
            CAST
          </div>
          {entries.map((entry) => {
            const selectedEntry = entry.key === selected.key;
            const clickable = entry.status === "resolved" && Boolean(entry.asset);
            return (
              <button
                type="button"
                key={entry.key}
                disabled={!clickable}
                onClick={() => clickable && setSelectedKey(entry.key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 13,
                  padding: 11,
                  cursor: clickable ? "pointer" : "default",
                  color: "#f8fafc",
                  background: selectedEntry ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.035)",
                  border: selectedEntry
                    ? "1px solid rgba(56,189,248,0.38)"
                    : "1px solid rgba(255,255,255,0.08)",
                  opacity: clickable ? 1 : 0.72,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                  <div>
                    <strong style={{ display: "block", fontSize: 13 }}>{titleCase(entry.concept)}</strong>
                    <span style={{ display: "block", marginTop: 3, color: "rgba(226,232,240,0.5)", fontSize: 10 }}>
                      {entry.role.replaceAll("_", " ")}
                    </span>
                  </div>
                  <span style={{ ...statusStyle(entry.status), borderRadius: 999, padding: "4px 7px", fontSize: 9, fontWeight: 850, whiteSpace: "nowrap" }}>
                    {entry.status === "candidate_below_threshold" ? "candidate" : entry.status}
                  </span>
                </div>
                {entry.asset ? (
                  <div style={{ marginTop: 8, color: "rgba(226,232,240,0.7)", fontSize: 11 }}>
                    {assetLabel(entry.asset)}
                  </div>
                ) : entry.candidateCount > 0 ? (
                  <div style={{ marginTop: 8, color: "rgba(226,232,240,0.48)", fontSize: 10 }}>
                    {entry.candidateCount} candidate{entry.candidateCount === 1 ? "" : "s"} retained
                  </div>
                ) : null}
              </button>
            );
          })}

          <div style={{ marginTop: 3, padding: "12px 3px 2px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color: "rgba(226,232,240,0.45)", fontSize: 10 }}>Inspecting</div>
            <strong style={{ display: "block", marginTop: 3 }}>{selected.asset ? assetLabel(selected.asset) : selected.concept}</strong>
            <div style={{ marginTop: 8, display: "grid", gap: 5, color: "rgba(226,232,240,0.58)", fontSize: 10, lineHeight: 1.45 }}>
              <span>{selected.method.replaceAll("_", " ")} · {selected.confidence} confidence</span>
              <span>semantic laterality: {selected.laterality}</span>
              {selected.presentationChoiceOnly ? <span>presentation variant only · semantic side unchanged</span> : null}
              {selectedAppearance ? <span>appearance request: {selectedAppearance} · not applied in this inspector</span> : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
