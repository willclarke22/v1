"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { MyWayAssetRecord } from "../../assets/asset-types";
import type {
  DirectableAssetQualificationLevel,
  DirectableAssetStructureInspectionV1,
} from "../affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../directable-asset-compiler";
import { inspectBrowserAssetStructure } from "./browser-asset-structure-inspection";
import {
  buildDirectableAssetLibraryAudit,
} from "../directable-asset-library-audit";
import {
  DIRECTABLE_ASSET_OPERATOR_SPECS,
  type DirectableAssetOperatorId,
} from "../interaction-operator-contract";
import {
  qualifyDirectableAssetForAllOperators,
  type DirectableAssetOperatorQualificationStatus,
} from "../interaction-operator-resolver";

const OPERATOR_IDS = DIRECTABLE_ASSET_OPERATOR_SPECS.map(
  (item) => item.id,
) as DirectableAssetOperatorId[];

type LibraryResponse = {
  ok: boolean;
  assets?: MyWayAssetRecord[];
  error?: string;
};

const STATUS_COPY: Record<
  DirectableAssetOperatorQualificationStatus,
  { label: string; color: string; background: string }
> = {
  executable_as_is: {
    label: "Executable as-is",
    color: "#86efac",
    background: "rgba(34,197,94,0.14)",
  },
  conditional: {
    label: "Conditional",
    color: "#93c5fd",
    background: "rgba(59,130,246,0.14)",
  },
  contextual_candidate: {
    label: "Contextual candidate",
    color: "#fcd34d",
    background: "rgba(245,158,11,0.14)",
  },
  asset_ready_runtime_pending: {
    label: "Asset ready · runtime pending",
    color: "#c4b5fd",
    background: "rgba(139,92,246,0.14)",
  },
  requires_asset_authoring: {
    label: "Needs asset authoring",
    color: "#fdba74",
    background: "rgba(249,115,22,0.14)",
  },
  fallback_only: {
    label: "Fallback only",
    color: "#fca5a5",
    background: "rgba(239,68,68,0.12)",
  },
};

const QUALIFICATION_COPY: Record<
  DirectableAssetQualificationLevel,
  { label: string; color: string }
> = {
  verified: { label: "Verified", color: "#86efac" },
  measured: { label: "Measured", color: "#67e8f9" },
  inferred: { label: "Inferred", color: "#fcd34d" },
  suggested: { label: "Suggested", color: "#fdba74" },
  unknown: { label: "Unknown", color: "#cbd5e1" },
  contradicted: { label: "Contradicted", color: "#fca5a5" },
};

function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 18,
        background: "rgba(15,23,42,0.66)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        padding: "0.8rem 0.9rem",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.035)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.48)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 650 }}>{value}</div>
    </div>
  );
}

export function DirectableAssetQualificationLab() {
  const [assets, setAssets] = useState<MyWayAssetRecord[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [structureResult, setStructureResult] = useState<{
    asset_id: string;
    inspection: DirectableAssetStructureInspectionV1;
  } | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/sandbox/probe-lab/assets/library", {
          cache: "no-store",
        });
        const payload = (await response.json()) as LibraryResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Asset Library request failed.");
        }
        if (cancelled) return;
        const nextAssets = [...(payload.assets ?? [])].sort((a, b) =>
          (a.display_name || a.canonical_label || a.asset_id).localeCompare(
            b.display_name || b.canonical_label || b.asset_id,
          ),
        );
        setAssets(nextAssets);
        setSelectedAssetId((current) => current || nextAssets[0]?.asset_id || "");
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assets;
    return assets.filter((asset) =>
      [
        asset.asset_id,
        asset.display_name,
        asset.canonical_label,
        ...(asset.aliases ?? []),
        ...(asset.semantic_tags ?? []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [assets, query]);

  const asset = useMemo(
    () => assets.find((item) => item.asset_id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  useEffect(() => {
    let cancelled = false;
    setStructureResult(null);
    setStructureError(null);
    if (!asset || asset.asset_type === "primitive" || !asset.public_path) {
      setStructureLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setStructureLoading(true);
    void inspectBrowserAssetStructure(asset.public_path)
      .then((result) => {
        if (!cancelled) {
          setStructureResult({ asset_id: asset.asset_id, inspection: result });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setStructureError(
            caught instanceof Error ? caught.message : String(caught),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStructureLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const activeStructure =
    asset && structureResult?.asset_id === asset.asset_id
      ? structureResult.inspection
      : null;

  const graph = useMemo(
    () =>
      asset
        ? compileDirectableAssetAffordanceGraph(asset, {
            structure: activeStructure,
          })
        : null,
    [asset, activeStructure],
  );
  const qualifications = useMemo(
    () =>
      graph
        ? qualifyDirectableAssetForAllOperators(graph, OPERATOR_IDS)
        : [],
    [graph],
  );

  const libraryAudit = useMemo(
    () => buildDirectableAssetLibraryAudit(assets, OPERATOR_IDS),
    [assets],
  );

  const affordanceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of graph?.affordances ?? []) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "clamp(1rem, 3vw, 2.4rem)",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,0.17), transparent 30%), radial-gradient(circle at top right, rgba(168,85,247,0.12), transparent 28%), #050816",
      }}
    >
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 900 }}>
            <div style={{ color: "#7dd3fc", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Phase 1B.5B.1 inference · Phase 1B.5B.2 hardening
            </div>
            <h1 style={{ margin: "0.45rem 0 0.6rem", fontSize: "clamp(2rem, 4vw, 3.5rem)" }}>
              Directable Asset Qualification
            </h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.67)", lineHeight: 1.7 }}>
              Compile each real Asset Library record once, derive trusted and geometry-inferred affordances, then separate intrinsic possibility from scene-context readiness and runtime execution. Names and tags still cannot grant executable capabilities, and arbitrary GLB child nodes remain unanimated.
            </p>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 8 }}>
            <a href="/sandbox/probe-lab" style={{ color: "#93c5fd", textDecoration: "none" }}>
              ← Probe Lab
            </a>
          </div>
        </div>

        {error ? (
          <Panel style={{ marginTop: 24, padding: 18, borderColor: "rgba(248,113,113,0.36)" }}>
            <strong style={{ color: "#fca5a5" }}>Could not load Asset Library</strong>
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.7)" }}>{error}</div>
          </Panel>
        ) : null}

        <Panel style={{ marginTop: 24, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Library-wide qualification audit</h3>
              <p style={{ margin: "0.4rem 0 0", color: "rgba(255,255,255,0.58)", lineHeight: 1.55, maxWidth: 820 }}>
                Cheap compile-once coverage from stored evidence. Raw geometric candidates are separated from executable semantic affordances. Deep surface-shape inference is intentionally on-demand for the selected GLB so this page never bulk-loads the whole model library.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 9 }}>
            <Metric label="Assets" value={libraryAudit.asset_count} />
            <Metric label="Geometry profiles" value={libraryAudit.geometry_profile_count} />
            <Metric label="Measured geometry" value={libraryAudit.measured_geometry_count} />
            <Metric label="Directability overrides" value={libraryAudit.directability_override_count} />
            <Metric label="Rigged" value={libraryAudit.rigged_count} />
            <Metric label="Usable containment" value={libraryAudit.executable_affordance_counts.containment_volume ?? 0} />
            <Metric label="Interior candidates" value={libraryAudit.affordance_counts.containment_candidate ?? 0} />
            <Metric label="Surface contacts" value={libraryAudit.affordance_counts.surface_contact_region ?? 0} />
            <Metric label="Precise attachment ports" value={libraryAudit.executable_affordance_counts.attachment_port ?? 0} />
            <Metric label="Support candidates" value={libraryAudit.affordance_counts.support_surface ?? 0} />
            <Metric label="Stored rolling evidence" value={libraryAudit.affordance_counts.rolling ?? 0} />
          </div>
          {libraryAudit.top_missing_requirements.length ? (
            <div style={{ marginTop: 14, color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.6 }}>
              <strong style={{ color: "rgba(255,255,255,0.78)" }}>Most common blockers:</strong>{" "}
              {libraryAudit.top_missing_requirements
                .slice(0, 5)
                .map((item) => `${item.label} (${item.count})`)
                .join(" · ")}
            </div>
          ) : null}
        </Panel>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)",
            gap: 18,
            alignItems: "start",
          }}
        >
          <Panel style={{ position: "sticky", top: 18, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <strong>Real assets</strong>
              <div style={{ marginTop: 10 }}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search assets…"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.75rem 0.85rem",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(2,6,23,0.7)",
                    color: "white",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ marginTop: 8, color: "rgba(255,255,255,0.44)", fontSize: 12 }}>
                {loading ? "Loading…" : `${filteredAssets.length} of ${assets.length} assets`}
              </div>
            </div>
            <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", padding: 8 }}>
              {filteredAssets.map((item) => {
                const selected = item.asset_id === selectedAssetId;
                return (
                  <button
                    key={item.asset_id}
                    type="button"
                    onClick={() => setSelectedAssetId(item.asset_id)}
                    style={{
                      display: "grid",
                      gap: 4,
                      width: "100%",
                      textAlign: "left",
                      padding: "0.75rem 0.8rem",
                      marginBottom: 5,
                      borderRadius: 12,
                      border: selected
                        ? "1px solid rgba(125,211,252,0.42)"
                        : "1px solid transparent",
                      background: selected ? "rgba(14,165,233,0.12)" : "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>
                      {item.display_name || item.canonical_label || item.asset_id}
                    </strong>
                    <span style={{ color: "rgba(255,255,255,0.42)", fontSize: 11 }}>{item.asset_id}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {!asset || !graph ? (
            <Panel style={{ padding: 22 }}>
              {loading ? "Loading qualification evidence…" : "Select an asset to inspect."}
            </Panel>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <Panel style={{ padding: 18 }}>
                <div style={{ display: "flex", gap: 18, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "#7dd3fc", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Compiled real asset
                    </div>
                    <h2 style={{ margin: "0.35rem 0 0.25rem", fontSize: 25 }}>
                      {graph.display_name}
                    </h2>
                    <div style={{ color: "rgba(255,255,255,0.46)", fontSize: 12 }}>{graph.asset_id}</div>
                  </div>
                  {asset.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.thumbnail_path}
                      alt=""
                      style={{ width: 138, height: 104, objectFit: "contain", borderRadius: 14, background: "rgba(255,255,255,0.04)" }}
                    />
                  ) : null}
                </div>
                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <Metric label="Geometry" value={graph.diagnostics.geometry_status} />
                  <Metric label="Overrides" value={graph.diagnostics.directability_override_status} />
                  <Metric label="Rig" value={graph.diagnostics.rig_status} />
                  <Metric label="Animation clips" value={graph.diagnostics.animation_clip_count} />
                  <Metric
                    label="GLB structure"
                    value={
                      structureLoading
                        ? "inspecting…"
                        : graph.diagnostics.structure_status
                    }
                  />
                  <Metric label="Nodes / meshes" value={`${graph.diagnostics.structure_node_count} / ${graph.diagnostics.structure_mesh_count}`} />
                  <Metric label="Bones" value={graph.diagnostics.structure_bone_count} />
                  <Metric label="Geometry shape" value={graph.diagnostics.geometry_shape_status} />
                  <Metric label="Shape samples" value={graph.diagnostics.geometry_shape_sample_count} />
                  <Metric label="Inferred affordances" value={graph.diagnostics.inferred_affordance_count} />
                  <Metric label="Executable evidence" value={graph.diagnostics.executable_affordance_count} />
                  <Metric label="Advisory suggestions" value={graph.diagnostics.suggestion_count} />
                </div>
              </Panel>

              <Panel style={{ padding: 18 }}>
                <h3 style={{ margin: 0 }}>Affordance graph</h3>
                <p style={{ margin: "0.45rem 0 0", color: "rgba(255,255,255,0.58)", lineHeight: 1.6 }}>
                  Counts below distinguish raw measured candidates from executable semantic affordances. Generic exterior regions are surface contacts, raw voids are containment candidates, and free-form labels remain advisory unless independent geometry corroborates them.
                </p>
                <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {affordanceCounts.map(([kind, count]) => (
                    <span key={kind} style={{ padding: "0.45rem 0.65rem", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
                      {kind.replaceAll("_", " ")} · {count}
                    </span>
                  ))}
                </div>
                {structureError ? (
                  <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#fecaca", fontSize: 12, lineHeight: 1.55 }}>
                    GLB structure inspection failed, so explicit node/bone/clip bindings are shown without independent hierarchy validation: {structureError}
                  </div>
                ) : null}
                {graph.suggestions.length ? (
                  <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.18)" }}>
                    <strong style={{ color: "#fde68a", fontSize: 13 }}>Advisory metadata only</strong>
                    <div style={{ marginTop: 7, color: "rgba(255,255,255,0.64)", fontSize: 12, lineHeight: 1.55 }}>
                      {graph.suggestions.map((item) => item.label).join(", ")}. These labels do not resolve operators until trusted geometry/directability evidence exists.
                    </div>
                  </div>
                ) : null}
              </Panel>

              <Panel style={{ padding: 18 }}>
                <h3 style={{ margin: 0 }}>Geometry-derived candidates</h3>
                <p style={{ margin: "0.45rem 0 0", color: "rgba(255,255,255,0.58)", lineHeight: 1.6 }}>
                  Surface-shape evidence is measured directly from the selected GLB without a WebGL Canvas. It may establish a plausible physical affordance, but never semantic identity.
                </p>
                {activeStructure?.geometry_shape?.roll_candidates.length ? (
                  <div style={{ marginTop: 14, display: "grid", gap: 9 }}>
                    {activeStructure.geometry_shape.roll_candidates.map((candidate) => (
                      <div key={candidate.axis_name} style={{ padding: 13, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong>Roll around local {candidate.axis_name.toUpperCase()}</strong>
                          <span style={{ color: candidate.score >= 0.74 ? "#fcd34d" : "rgba(255,255,255,0.46)", fontSize: 12 }}>
                            score {candidate.score.toFixed(2)} · confidence {candidate.confidence.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ marginTop: 7, color: "rgba(255,255,255,0.56)", fontSize: 11, lineHeight: 1.55 }}>
                          angular coverage {Math.round(candidate.angular_coverage * 100)}% · boundary circularity {Math.round(candidate.boundary_circularity * 100)}% · effective radius ≈ {(candidate.effective_radius_ratio * 100).toFixed(0)}% of projected span
                          {candidate.rolling_profile ? ` · profile ${candidate.rolling_profile.replaceAll("_", " ")}` : ""}
                          {candidate.runtime_model ? ` · runtime ${candidate.runtime_model.replaceAll("_", " ")}` : ""}
                        </div>
                        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.46)", fontSize: 11, lineHeight: 1.5 }}>{candidate.note}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 13, color: "rgba(255,255,255,0.46)", fontSize: 12 }}>
                    {structureLoading ? "Inspecting GLB surface shape…" : "No strong rolling surface candidate was found in the inspected geometry."}
                  </div>
                )}
                {activeStructure?.geometry_shape?.top_opening_candidates?.length ? (
                  <div style={{ marginTop: 14, display: "grid", gap: 9 }}>
                    {activeStructure.geometry_shape.top_opening_candidates.map((candidate, index) => (
                      <div key={`top-opening-${index}`} style={{ padding: 13, borderRadius: 14, border: "1px solid rgba(103,232,249,0.18)", background: "rgba(6,182,212,0.06)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong>Top-opening geometry candidate</strong>
                          <span style={{ color: "#67e8f9", fontSize: 12 }}>
                            score {candidate.score.toFixed(2)} · confidence {candidate.confidence.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ marginTop: 7, color: "rgba(255,255,255,0.56)", fontSize: 11, lineHeight: 1.55 }}>
                          center void {Math.round(candidate.center_void_score * 100)}% · rim coverage {Math.round(candidate.rim_angular_coverage * 100)}%
                        </div>
                        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.46)", fontSize: 11, lineHeight: 1.5 }}>
                          {candidate.note} A usable container is promoted only when independent semantic container evidence agrees.
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Panel>

              <Panel style={{ padding: 18 }}>
                <h3 style={{ margin: 0 }}>Derived operator qualification</h3>
                <p style={{ margin: "0.45rem 0 0", color: "rgba(255,255,255,0.58)", lineHeight: 1.6 }}>
                  This is derived from the graph; it is not stored as an asset × capability matrix.
                </p>
                <div style={{ marginTop: 15, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                  {qualifications.map((qualification) => {
                    const status = STATUS_COPY[qualification.status];
                    return (
                      <div key={qualification.operator_id} style={{ padding: 14, borderRadius: 15, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                          <strong>{qualification.label}</strong>
                          <span style={{ padding: "0.28rem 0.48rem", borderRadius: 999, color: status.color, background: status.background, fontSize: 10, whiteSpace: "nowrap" }}>
                            {status.label}
                          </span>
                        </div>
                        <div style={{ marginTop: 8, color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                          {qualification.resolved_required_count}/{qualification.required_count} required affordances resolved
                          {" · "}
                          <span style={{ color: QUALIFICATION_COPY[qualification.asset_qualification_level].color }}>
                            {QUALIFICATION_COPY[qualification.asset_qualification_level].label} evidence
                          </span>
                        </div>
                        {qualification.missing_required_labels.length ? (
                          <div style={{ marginTop: 8, color: "#fda4af", fontSize: 11, lineHeight: 1.45 }}>
                            Missing: {qualification.missing_required_labels.join(", ")}
                          </div>
                        ) : null}
                        {qualification.context_requirements.length ? (
                          <div style={{ marginTop: 8, color: "#fcd34d", fontSize: 11, lineHeight: 1.5 }}>
                            Scene context required: {qualification.context_requirements.join("; ")}
                          </div>
                        ) : null}
                        {qualification.context_note ? (
                          <div style={{ marginTop: 6, color: "rgba(255,255,255,0.52)", fontSize: 11, lineHeight: 1.5 }}>
                            {qualification.context_note}
                          </div>
                        ) : null}
                        {qualification.counterpart_note ? (
                          <div style={{ marginTop: 8, color: "#93c5fd", fontSize: 11, lineHeight: 1.45 }}>
                            {qualification.counterpart_note}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel style={{ padding: 18 }}>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 650 }}>Evidence and compiler diagnostics</summary>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {graph.diagnostics.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.55 }}>
                        • {warning}
                      </div>
                    ))}
                  </div>
                  <pre style={{ marginTop: 16, maxHeight: 520, overflow: "auto", padding: 14, borderRadius: 14, background: "rgba(2,6,23,0.72)", border: "1px solid rgba(255,255,255,0.08)", color: "#cbd5e1", fontSize: 11, lineHeight: 1.5 }}>
                    {JSON.stringify(graph, null, 2)}
                  </pre>
                </details>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
