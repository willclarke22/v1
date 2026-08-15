"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { MyWayAssetRecord } from "../../assets/asset-types";
import type {
  DirectableAssetStructureInspectionV1,
} from "../affordance-graph-contract";
import {
  compileDirectableAssetAffordanceGraph,
} from "../directable-asset-compiler";
import {
  DIRECTABLE_ASSET_PAIR_INTERACTION_IDS,
  type DirectableAssetPairResolutionStatus,
} from "../pair-interaction-contract";
import {
  resolveAllDirectableAssetPairInteractions,
} from "../pair-interaction-resolver";
import { inspectBrowserAssetStructure } from "./browser-asset-structure-inspection";

type LibraryResponse = {
  ok: boolean;
  assets?: MyWayAssetRecord[];
  error?: string;
};

const STATUS_COPY: Record<
  DirectableAssetPairResolutionStatus,
  { label: string; color: string; background: string }
> = {
  resolved_candidate: {
    label: "Resolved candidate",
    color: "#86efac",
    background: "rgba(34,197,94,0.14)",
  },
  contextual_candidate: {
    label: "Contextual candidate",
    color: "#fcd34d",
    background: "rgba(245,158,11,0.14)",
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
        background: "rgba(15,23,42,0.68)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "0.78rem 0.85rem",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.035)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.48)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 650 }}>
        {value}
      </div>
    </div>
  );
}

function formatNumber(value: number | null | undefined, digits = 3) {
  return Number.isFinite(value)
    ? Number(value).toFixed(digits)
    : "n/a";
}

function formatVector(value: readonly number[] | null | undefined) {
  if (!value) return "n/a";
  return `[${value.map((item) => formatNumber(Number(item), 3)).join(", ")}]`;
}

function parseSceneDimensions(value: string): [number, number, number] | null {
  const parts = value
    .split(/[x,\s]+/i)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (parts.length !== 3 || parts.some((item) => item <= 0)) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function assetName(asset: MyWayAssetRecord | null) {
  if (!asset) return "None";
  return asset.display_name || asset.canonical_label || asset.asset_id;
}

function useAssetInspection(asset: MyWayAssetRecord | null) {
  const [result, setResult] = useState<{
    asset_id: string;
    inspection: DirectableAssetStructureInspectionV1;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);

    if (!asset || asset.asset_type === "primitive" || !asset.public_path) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void inspectBrowserAssetStructure(asset.public_path)
      .then((inspection) => {
        if (!cancelled) {
          setResult({
            asset_id: asset.asset_id,
            inspection,
          });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [asset]);

  return {
    inspection:
      asset && result?.asset_id === asset.asset_id
        ? result.inspection
        : null,
    loading,
    error,
  };
}

function AssetColumn({
  label,
  asset,
  assets,
  selectedId,
  onSelect,
  inspectionLoading,
  inspectionError,
  inspection,
}: {
  label: string;
  asset: MyWayAssetRecord | null;
  assets: MyWayAssetRecord[];
  selectedId: string;
  onSelect: (assetId: string) => void;
  inspectionLoading: boolean;
  inspectionError: string | null;
  inspection: DirectableAssetStructureInspectionV1 | null;
}) {
  return (
    <Panel style={{ padding: "1rem" }}>
      <div
        style={{
          color: "#93c5fd",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      <select
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "0.7rem",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#111827",
          color: "white",
        }}
      >
        {assets.map((item) => (
          <option key={item.asset_id} value={item.asset_id}>
            {item.display_name || item.canonical_label || item.asset_id}
          </option>
        ))}
      </select>

      {asset ? (
        <>
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: asset.thumbnail_path
                ? "92px minmax(0,1fr)"
                : "1fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            {asset.thumbnail_path ? (
              <img
                src={asset.thumbnail_path}
                alt=""
                style={{
                  width: 92,
                  height: 92,
                  objectFit: "cover",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 15 }}>{assetName(asset)}</strong>
              <div
                style={{
                  marginTop: 5,
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 11,
                  wordBreak: "break-all",
                }}
              >
                {asset.asset_id}
              </div>
              <div
                style={{
                  marginTop: 9,
                  color: "rgba(255,255,255,0.68)",
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                dimensions: {formatVector(asset.dimensions_m)}
                <br />
                default scale: {formatNumber(asset.default_scale)}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gap: 8,
            }}
          >
            <Metric
              label="Structure"
              value={
                inspectionLoading
                  ? "Inspecting…"
                  : inspectionError
                    ? "Failed"
                    : inspection
                      ? "Inspected"
                      : "Stored only"
              }
            />
            <Metric
              label="Meshes"
              value={inspection?.mesh_names.length ?? "—"}
            />
            <Metric
              label="Samples"
              value={inspection?.geometry_shape?.sample_count ?? "—"}
            />
          </div>
          {inspectionError ? (
            <div
              style={{
                marginTop: 10,
                color: "#fca5a5",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {inspectionError}
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

export function DirectableAssetPairLab() {
  const [assets, setAssets] = useState<MyWayAssetRecord[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sourceSceneDimensionsText, setSourceSceneDimensionsText] = useState("");
  const [targetSceneDimensionsText, setTargetSceneDimensionsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const next = [...(payload.assets ?? [])].sort((a, b) =>
          assetName(a).localeCompare(assetName(b)),
        );
        setAssets(next);
        setSourceId((current) => current || next[0]?.asset_id || "");
        setTargetId(
          (current) =>
            current ||
            next.find((item) => item.asset_id !== next[0]?.asset_id)?.asset_id ||
            next[0]?.asset_id ||
            "",
        );
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

  const sourceAsset = useMemo(
    () => assets.find((item) => item.asset_id === sourceId) ?? null,
    [assets, sourceId],
  );
  const targetAsset = useMemo(
    () => assets.find((item) => item.asset_id === targetId) ?? null,
    [assets, targetId],
  );

  const sourceInspection = useAssetInspection(sourceAsset);
  const targetInspection = useAssetInspection(targetAsset);

  const sourceGraph = useMemo(
    () =>
      sourceAsset
        ? compileDirectableAssetAffordanceGraph(sourceAsset, {
            structure: sourceInspection.inspection,
          })
        : null,
    [sourceAsset, sourceInspection.inspection],
  );
  const targetGraph = useMemo(
    () =>
      targetAsset
        ? compileDirectableAssetAffordanceGraph(targetAsset, {
            structure: targetInspection.inspection,
          })
        : null,
    [targetAsset, targetInspection.inspection],
  );

  const sourceSceneDimensions = useMemo(
    () => parseSceneDimensions(sourceSceneDimensionsText),
    [sourceSceneDimensionsText],
  );
  const targetSceneDimensions = useMemo(
    () => parseSceneDimensions(targetSceneDimensionsText),
    [targetSceneDimensionsText],
  );

  const resolutions = useMemo(
    () =>
      sourceGraph && targetGraph
        ? resolveAllDirectableAssetPairInteractions(
            sourceGraph,
            targetGraph,
            DIRECTABLE_ASSET_PAIR_INTERACTION_IDS,
            {
              source_dimensions_m:
                sourceSceneDimensions ?? sourceAsset?.dimensions_m ?? null,
              target_dimensions_m:
                targetSceneDimensions ?? targetAsset?.dimensions_m ?? null,
              source_dimensions_authority: sourceSceneDimensions
                ? "explicit_context"
                : "asset_baseline",
              target_dimensions_authority: targetSceneDimensions
                ? "explicit_context"
                : "asset_baseline",
            },
          )
        : [],
    [
      sourceGraph,
      targetGraph,
      sourceAsset?.dimensions_m,
      targetAsset?.dimensions_m,
      sourceSceneDimensions,
      targetSceneDimensions,
    ],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<DirectableAssetPairResolutionStatus, number> = {
      resolved_candidate: 0,
      contextual_candidate: 0,
      requires_asset_authoring: 0,
      fallback_only: 0,
    };
    for (const resolution of resolutions) {
      counts[resolution.status] += 1;
    }
    return counts;
  }, [resolutions]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "min(4vw, 2.4rem)",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 34%), radial-gradient(circle at top right, rgba(34,197,94,0.12), transparent 30%), linear-gradient(135deg, #050816, #111827)",
      }}
    >
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <a
          href="/sandbox/probe-lab"
          style={{
            color: "#93c5fd",
            textDecoration: "none",
            fontSize: 12,
          }}
        >
          ← Probe Lab
        </a>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
            }}
          >
            Director · Phase 1B.5C.2
          </div>
          <h1
            style={{
              margin: "0.55rem 0 0",
              fontSize: "clamp(2rem, 4vw, 3.5rem)",
            }}
          >
            Asset-to-Asset Interaction Resolver
          </h1>
          <p
            style={{
              maxWidth: 980,
              margin: "0.75rem 0 0",
              color: "rgba(255,255,255,0.68)",
              lineHeight: 1.7,
            }}
          >
            Choose two real Asset Library records. MyWay deep-inspects only
            those GLBs, compiles each into its hardened Affordance Graph, then
            resolves Place On, Surface Attach, Precise Attach, Insert, and Flow
            without storing an asset-pair matrix. Asset Library dimensions are
            baseline preview evidence only; use the optional scene-dimension
            overrides below to exercise authoritative pair fit. Every relationship
            remains proposed until Asset Scene Builder accepts validation.
          </p>
        </div>

        {error ? (
          <Panel
            style={{
              marginTop: 20,
              padding: "1rem",
              color: "#fca5a5",
            }}
          >
            {error}
          </Panel>
        ) : null}

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <AssetColumn
            label="Source actor"
            asset={sourceAsset}
            assets={assets}
            selectedId={sourceId}
            onSelect={setSourceId}
            inspectionLoading={sourceInspection.loading}
            inspectionError={sourceInspection.error}
            inspection={sourceInspection.inspection}
          />

          <button
            type="button"
            onClick={() => {
              setSourceId(targetId);
              setTargetId(sourceId);
            }}
            disabled={!sourceId || !targetId}
            style={{
              alignSelf: "center",
              padding: "0.7rem 0.85rem",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
            title="Swap source and target"
          >
            ⇄
          </button>

          <AssetColumn
            label="Target actor"
            asset={targetAsset}
            assets={assets}
            selectedId={targetId}
            onSelect={setTargetId}
            inspectionLoading={targetInspection.loading}
            inspectionError={targetInspection.error}
            inspection={targetInspection.inspection}
          />
        </div>

        <Panel style={{ marginTop: 14, padding: "1rem" }}>
          <div style={{ fontWeight: 750, fontSize: 13 }}>Scene-scale authority</div>
          <p
            style={{
              margin: "0.45rem 0 0",
              color: "rgba(255,255,255,0.58)",
              fontSize: 11,
              lineHeight: 1.55,
            }}
          >
            Leave these blank to use Asset Library baseline dimensions as preview
            evidence only. Enter final scene dimensions in metres (X, Y, Z) to
            test fit with explicit-context authority.
          </p>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0,1fr))",
              gap: 10,
            }}
          >
            {[
              {
                label: "Source scene dimensions",
                value: sourceSceneDimensionsText,
                onChange: setSourceSceneDimensionsText,
                parsed: sourceSceneDimensions,
                baseline: sourceAsset?.dimensions_m ?? null,
              },
              {
                label: "Target scene dimensions",
                value: targetSceneDimensionsText,
                onChange: setTargetSceneDimensionsText,
                parsed: targetSceneDimensions,
                baseline: targetAsset?.dimensions_m ?? null,
              },
            ].map((field) => (
              <label key={field.label} style={{ fontSize: 11 }}>
                <span style={{ color: "rgba(255,255,255,0.68)" }}>
                  {field.label}
                </span>
                <input
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder={field.baseline ? formatVector(field.baseline) : "x, y, z"}
                  style={{
                    marginTop: 6,
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.7rem 0.75rem",
                    borderRadius: 11,
                    border: `1px solid ${
                      field.value && !field.parsed
                        ? "rgba(248,113,113,0.65)"
                        : "rgba(255,255,255,0.11)"
                    }`,
                    background: "rgba(255,255,255,0.045)",
                    color: "white",
                    outline: "none",
                  }}
                />
                <span
                  style={{
                    display: "block",
                    marginTop: 5,
                    color: field.parsed ? "#86efac" : "rgba(255,255,255,0.42)",
                  }}
                >
                  {field.parsed
                    ? `explicit_context · ${formatVector(field.parsed)}`
                    : "asset_baseline preview"}
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel style={{ marginTop: 14, padding: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0,1fr))",
              gap: 8,
            }}
          >
            <Metric label="Assets" value={loading ? "Loading…" : assets.length} />
            <Metric
              label="Resolved"
              value={statusCounts.resolved_candidate}
            />
            <Metric
              label="Contextual"
              value={statusCounts.contextual_candidate}
            />
            <Metric
              label="Needs authoring"
              value={statusCounts.requires_asset_authoring}
            />
            <Metric
              label="Fallback"
              value={statusCounts.fallback_only}
            />
          </div>
        </Panel>

        <section
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))",
            gap: 12,
          }}
        >
          {resolutions.map((resolution) => {
            const status = STATUS_COPY[resolution.status];
            return (
              <Panel
                key={resolution.interaction_id}
                style={{ padding: "1rem" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 16 }}>
                      {resolution.label}
                    </strong>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(255,255,255,0.46)",
                        fontSize: 11,
                      }}
                    >
                      {resolution.interaction_id}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "0.35rem 0.55rem",
                      borderRadius: 999,
                      color: status.color,
                      background: status.background,
                      fontSize: 10,
                      fontWeight: 750,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                <p
                  style={{
                    margin: "0.8rem 0 0",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {resolution.note}
                </p>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                    gap: 7,
                  }}
                >
                  <Metric
                    label="Pair score"
                    value={formatNumber(resolution.score)}
                  />
                  <Metric
                    label="Fit"
                    value={
                      resolution.fit.fits === null
                        ? "Contextual"
                        : resolution.fit.fits
                          ? "Fits"
                          : "No fit"
                    }
                  />
                  <Metric
                    label="Candidates"
                    value={resolution.diagnostics.candidate_count}
                  />
                </div>

                <div
                  style={{
                    marginTop: 12,
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 11,
                    lineHeight: 1.55,
                  }}
                >
                  <strong style={{ color: "rgba(255,255,255,0.76)" }}>
                    Evidence
                  </strong>
                  <br />
                  scale: {resolution.diagnostics.source_scale_source} → {resolution.diagnostics.target_scale_source}
                  <br />
                  source:{" "}
                  {resolution.evidence.source_evidence_ids.join(", ") ||
                    "(none)"}
                  <br />
                  target:{" "}
                  {resolution.evidence.target_evidence_ids.join(", ") ||
                    "(none)"}
                  {resolution.evidence.shared_semantic_tokens.length ? (
                    <>
                      <br />
                      shared semantics:{" "}
                      {resolution.evidence.shared_semantic_tokens.join(", ")}
                    </>
                  ) : null}
                </div>

                {resolution.candidate_transform ? (
                  <div
                    style={{
                      marginTop: 11,
                      padding: "0.7rem",
                      borderRadius: 12,
                      background: "rgba(34,197,94,0.07)",
                      border: "1px solid rgba(34,197,94,0.14)",
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    <strong>Candidate transform</strong>
                    <br />
                    translation:{" "}
                    {formatVector(
                      resolution.candidate_transform
                        .source_origin_translation_m,
                    )}
                    <br />
                    quaternion:{" "}
                    {formatVector(
                      resolution.candidate_transform
                        .source_rotation_quaternion_xyzw,
                    )}
                    <br />
                    rule:{" "}
                    {resolution.candidate_transform.alignment_rule}
                  </div>
                ) : null}

                {resolution.route ? (
                  <div
                    style={{
                      marginTop: 11,
                      padding: "0.7rem",
                      borderRadius: 12,
                      background: "rgba(59,130,246,0.08)",
                      border: "1px solid rgba(59,130,246,0.15)",
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    <strong>Route candidate</strong>
                    <br />
                    source:{" "}
                    {formatVector(resolution.route.source_point_local_m)}
                    <br />
                    target:{" "}
                    {formatVector(resolution.route.target_point_local_m)}
                  </div>
                ) : null}

                {resolution.proposed_relationship ? (
                  <div
                    style={{
                      marginTop: 11,
                      color: "rgba(255,255,255,0.62)",
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    proposed relationship:{" "}
                    <strong>{resolution.proposed_relationship.type}</strong>
                    {resolution.proposed_relationship.inverse_operation
                      ? ` · inverse ${resolution.proposed_relationship.inverse_operation}`
                      : ""}
                    <br />
                    activation: {resolution.proposed_relationship.activation_state}
                    {resolution.proposed_relationship.activation_requirements.length ? (
                      <>
                        <br />
                        requires: {resolution.proposed_relationship.activation_requirements.join(" · ")}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {resolution.context_requirements.length ? (
                  <div
                    style={{
                      marginTop: 11,
                      color: "#fcd34d",
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    <strong>Context still required</strong>
                    <ul style={{ margin: "0.35rem 0 0", paddingLeft: 18 }}>
                      {resolution.context_requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {resolution.builder_validation_handoff.length ? (
                  <div
                    style={{
                      marginTop: 11,
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    <strong style={{ color: "rgba(255,255,255,0.74)" }}>
                      Builder validation handoff
                    </strong>
                    <ul style={{ margin: "0.35rem 0 0", paddingLeft: 18 }}>
                      {resolution.builder_validation_handoff.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </section>

        {sourceGraph && targetGraph ? (
          <Panel style={{ marginTop: 14, padding: "1rem" }}>
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Full pair-resolution JSON
              </summary>
              <pre
                style={{
                  margin: "0.85rem 0 0",
                  maxHeight: 720,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 10,
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {JSON.stringify(
                  {
                    phase: "1B.5C",
                    source_graph: sourceGraph,
                    target_graph: targetGraph,
                    resolutions,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
