"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  BlenderHydrationReport,
  ResourceRuntimeAssetListResponse,
  ResourceRuntimeAssetSummary,
  ResourceRuntimeResolveResponse,
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";
import {
  clearRuntimeGlbCache,
  ResourceRuntimeCanvas,
  runtimeGlbCacheSnapshot,
  type ResourceRuntimeInstanceState,
} from "./resource-runtime-canvas";

import {
  MaterialRuntimeSection,
} from "./material-runtime-section";

const cardStyle = {
  border:
    "1px solid rgba(148,163,184,0.18)",
  borderRadius: "1rem",
  background:
    "rgba(15,23,42,0.72)",
  padding: "1rem",
} as const;

const buttonStyle = {
  border:
    "1px solid rgba(147,197,253,0.35)",
  borderRadius: "0.75rem",
  background:
    "rgba(30,64,175,0.28)",
  color: "#dbeafe",
  padding: "0.65rem 0.85rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

function formatBytes(
  value: number | null,
) {
  if (value === null) return "—";
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }
  return `${(
    value /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

function formatMs(
  value: number | null,
) {
  return value === null
    ? "—"
    : `${value.toFixed(1)} ms`;
}

function JsonPanel({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <section style={cardStyle}>
      <h3
        style={{
          margin: "0 0 0.7rem",
          fontSize: "0.95rem",
        }}
      >
        {title}
      </h3>
      <pre
        style={{
          margin: 0,
          maxHeight: "360px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: "0.72rem",
          lineHeight: 1.55,
          color:
            "rgba(226,232,240,0.84)",
        }}
      >
        {JSON.stringify(
          value,
          null,
          2,
        )}
      </pre>
    </section>
  );
}

function StatusPanel({
  title,
  state,
}: {
  title: string;
  state:
    | ResourceRuntimeInstanceState
    | null;
}) {
  return (
    <section style={cardStyle}>
      <h3
        style={{
          margin: "0 0 0.8rem",
          fontSize: "0.95rem",
        }}
      >
        {title}
      </h3>
      {state ? (
        <div
          style={{
            display: "grid",
            gap: "0.45rem",
            fontSize: "0.8rem",
          }}
        >
          <div>
            Phase:{" "}
            <strong>
              {state.phase}
            </strong>
          </div>
          <div>
            Cache:{" "}
            {state.metrics.cache_hit
              ? "hit"
              : "miss"}
          </div>
          <div>
            Bytes:{" "}
            {formatBytes(
              state.metrics
                .byte_size,
            )}
          </div>
          <div>
            Download:{" "}
            {formatMs(
              state.metrics
                .download_ms,
            )}
          </div>
          <div>
            Parse:{" "}
            {formatMs(
              state.metrics
                .parse_ms,
            )}
          </div>
          <div>
            Total:{" "}
            {formatMs(
              state.metrics
                .total_ms,
            )}
          </div>
          <div>
            Owned instance:{" "}
            {
              state.metrics
                .instance_geometry_count
            }{" "}
            geometries,{" "}
            {
              state.metrics
                .instance_material_count
            }{" "}
            materials,{" "}
            {
              state.metrics
                .instance_texture_count
            }{" "}
            textures
          </div>
          {state.error ? (
            <div
              style={{
                color: "#fecaca",
              }}
            >
              {state.error}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            color:
              "rgba(226,232,240,0.58)",
          }}
        >
          No instance has run yet.
        </div>
      )}
    </section>
  );
}

export function ResourceRuntimeLab() {
  const [
    assets,
    setAssets,
  ] = useState<
    ResourceRuntimeAssetSummary[]
  >([]);
  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState("");
  const [
    binding,
    setBinding,
  ] = useState<
    RuntimeModelBindingV1 | null
  >(null);
  const [
    fallbackLabel,
    setFallbackLabel,
  ] = useState<
    string | null
  >(null);
  const [
    resolveResult,
    setResolveResult,
  ] = useState<
    ResourceRuntimeResolveResponse | null
  >(null);
  const [
    primaryState,
    setPrimaryState,
  ] = useState<
    ResourceRuntimeInstanceState | null
  >(null);
  const [
    duplicateState,
    setDuplicateState,
  ] = useState<
    ResourceRuntimeInstanceState | null
  >(null);
  const [
    showDuplicate,
    setShowDuplicate,
  ] = useState(false);
  const [
    verifyHash,
    setVerifyHash,
  ] = useState(false);
  const [
    loading,
    setLoading,
  ] = useState(false);
  const [
    pageError,
    setPageError,
  ] = useState<
    string | null
  >(null);
  const [
    cacheSnapshot,
    setCacheSnapshot,
  ] = useState<
    ReturnType<
      typeof runtimeGlbCacheSnapshot
    >
  >([]);
  const [
    blenderReport,
    setBlenderReport,
  ] = useState<
    BlenderHydrationReport | null
  >(null);

  const selectedAsset =
    useMemo(
      () =>
        assets.find(
          (asset) =>
            asset.asset_id ===
            selectedAssetId,
        ) ?? null,
      [
        assets,
        selectedAssetId,
      ],
    );

  const refreshCacheSnapshot =
    useCallback(() => {
      setCacheSnapshot(
        runtimeGlbCacheSnapshot(),
      );
    }, []);

  const onPrimaryState =
    useCallback(
      (
        state: ResourceRuntimeInstanceState,
      ) => {
        setPrimaryState(state);
        refreshCacheSnapshot();
      },
      [refreshCacheSnapshot],
    );

  const onDuplicateState =
    useCallback(
      (
        state: ResourceRuntimeInstanceState,
      ) => {
        setDuplicateState(state);
        refreshCacheSnapshot();
      },
      [refreshCacheSnapshot],
    );

  useEffect(() => {
    let active = true;

    fetch(
      "/api/sandbox/probe-lab/resource-runtime",
      {
        cache: "no-store",
      },
    )
      .then(
        async (response) => {
          const payload =
            (await response.json()) as
              ResourceRuntimeAssetListResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ??
                "Unable to load reviewed R2 assets.",
            );
          }

          if (!active) return;

          setAssets(
            payload.assets,
          );
          setSelectedAssetId(
            payload.default_asset_id ??
              "",
          );
        },
      )
      .catch((error) => {
        if (!active) return;
        setPageError(
          error instanceof Error
            ? error.message
            : String(error),
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const resolve = useCallback(
    async (
      simulateFailure: boolean,
    ) => {
      setLoading(true);
      setPageError(null);
      setBlenderReport(null);
      setPrimaryState(null);
      setDuplicateState(null);

      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/resource-runtime",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify({
                asset_id:
                  selectedAssetId,
                simulate_failure:
                  simulateFailure,
              }),
            },
          );
        const payload =
          (await response.json()) as
            ResourceRuntimeResolveResponse;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ??
              "Resource resolution failed.",
          );
        }

        setResolveResult(
          payload,
        );
        setBinding(
          payload.runtime_binding,
        );
        setFallbackLabel(
          payload.fallback
            ? `${payload.fallback.fallback_used}: ${payload.fallback.reason}`
            : null,
        );
      } catch (error) {
        setPageError(
          error instanceof Error
            ? error.message
            : String(error),
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedAssetId],
  );

  const testBlenderHydration =
    useCallback(async () => {
      if (!binding) return;

      setLoading(true);
      setPageError(null);

      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/resource-runtime/blender-hydrate",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify({
                runtime_binding:
                  binding,
                verify_hash:
                  verifyHash,
              }),
            },
          );
        const payload =
          (await response.json()) as
            BlenderHydrationReport;

        setBlenderReport(
          payload,
        );

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ??
              "Blender hydration failed.",
          );
        }
      } catch (error) {
        setPageError(
          error instanceof Error
            ? error.message
            : String(error),
        );
      } finally {
        setLoading(false);
      }
    }, [binding, verifyHash]);

  const clearCache =
    useCallback(() => {
      const result =
        clearRuntimeGlbCache();
      refreshCacheSnapshot();

      if (
        result.retained > 0
      ) {
        setPageError(
          `${result.retained} active cache entries were retained until their rendered instances are released.`,
        );
      } else {
        setPageError(null);
      }
    }, [refreshCacheSnapshot]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding:
          "min(4vw, 2.5rem)",
        color: "#f8fafc",
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 34%), linear-gradient(135deg, #020617, #0f172a)",
      }}
    >
      <div
        style={{
          maxWidth: "1500px",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            margin: 0,
            color:
              "rgba(125,211,252,0.75)",
            fontSize: "0.74rem",
            letterSpacing: "0.17em",
            textTransform:
              "uppercase",
          }}
        >
          Phase 2D + 2F runtime proof
        </p>
        <h1
          style={{
            margin:
              "0.65rem 0 0.5rem",
            fontSize:
              "clamp(2rem, 4vw, 3.5rem)",
          }}
        >
          Reviewed Resource Runtime
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "920px",
            color:
              "rgba(226,232,240,0.72)",
            lineHeight: 1.7,
          }}
        >
          Resolve one reviewed,
          scene-approved R2 model,
          hydrate it through the
          shared browser runtime,
          inspect lifecycle
          diagnostics, and verify
          the temporary Blender
          download boundary.
        </p>

        <section
          style={{
            ...cardStyle,
            marginTop: "1.5rem",
            display: "grid",
            gap: "0.9rem",
          }}
        >
          <label
            style={{
              display: "grid",
              gap: "0.4rem",
              fontSize: "0.82rem",
            }}
          >
            Reviewed R2 model
            <select
              value={
                selectedAssetId
              }
              onChange={(event) =>
                setSelectedAssetId(
                  event.target.value,
                )
              }
              style={{
                width: "100%",
                borderRadius:
                  "0.75rem",
                border:
                  "1px solid rgba(148,163,184,0.28)",
                background:
                  "#0f172a",
                color: "#f8fafc",
                padding:
                  "0.72rem 0.8rem",
              }}
            >
              {assets.map(
                (asset) => (
                  <option
                    key={
                      asset.asset_id
                    }
                    value={
                      asset.asset_id
                    }
                  >
                    {
                      asset.canonical_label
                    }{" "}
                    —{" "}
                    {
                      asset.asset_id
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          {selectedAsset ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                fontSize: "0.75rem",
                color:
                  "rgba(226,232,240,0.68)",
              }}
            >
              <span>
                Source:{" "}
                {
                  selectedAsset.source_type
                }
              </span>
              <span>
                Size:{" "}
                {formatBytes(
                  selectedAsset.file_size_bytes,
                )}
              </span>
              <span>
                Hash:{" "}
                {selectedAsset.content_hash
                  ?.slice(0, 12) ??
                  "not recorded"}
              </span>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem",
              alignItems:
                "center",
            }}
          >
            <button
              type="button"
              style={buttonStyle}
              disabled={
                loading ||
                !selectedAssetId
              }
              onClick={() =>
                void resolve(false)
              }
            >
              Resolve and render
            </button>
            <button
              type="button"
              style={{
                ...buttonStyle,
                borderColor:
                  "rgba(245,158,11,0.45)",
                background:
                  "rgba(146,64,14,0.26)",
                color: "#fef3c7",
              }}
              disabled={loading}
              onClick={() =>
                void resolve(true)
              }
            >
              Test declared fallback
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={
                loading ||
                !binding
              }
              onClick={() =>
                void testBlenderHydration()
              }
            >
              Test Blender hydration
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={clearCache}
            >
              Clear idle cache
            </button>

            <label
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems:
                  "center",
                fontSize: "0.78rem",
              }}
            >
              <input
                type="checkbox"
                checked={
                  showDuplicate
                }
                onChange={(event) =>
                  setShowDuplicate(
                    event.target
                      .checked,
                  )
                }
              />
              Render duplicate
              instance
            </label>

            <label
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems:
                  "center",
                fontSize: "0.78rem",
              }}
            >
              <input
                type="checkbox"
                checked={verifyHash}
                onChange={(event) =>
                  setVerifyHash(
                    event.target
                      .checked,
                  )
                }
              />
              Verify SHA-256
            </label>
          </div>

          {pageError ? (
            <div
              style={{
                borderRadius:
                  "0.75rem",
                border:
                  "1px solid rgba(248,113,113,0.35)",
                background:
                  "rgba(127,29,29,0.18)",
                color: "#fecaca",
                padding:
                  "0.7rem 0.8rem",
                fontSize: "0.8rem",
              }}
            >
              {pageError}
            </div>
          ) : null}
        </section>

        <div
          style={{
            marginTop: "1rem",
          }}
        >
          <ResourceRuntimeCanvas
            binding={binding}
            fallbackLabel={
              fallbackLabel
            }
            showDuplicate={
              showDuplicate
            }
            verifyHash={
              verifyHash
            }
            onPrimaryState={
              onPrimaryState
            }
            onDuplicateState={
              onDuplicateState
            }
          />
        </div>

        <section
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          <StatusPanel
            title="Primary instance"
            state={primaryState}
          />
          <StatusPanel
            title="Duplicate instance"
            state={
              showDuplicate
                ? duplicateState
                : null
            }
          />
          <JsonPanel
            title="Browser cache"
            value={cacheSnapshot}
          />
          <JsonPanel
            title="Blender temporary hydration"
            value={
              blenderReport ?? {
                status:
                  "not run",
              }
            }
          />
        </section>

        <section
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(420px, 1fr))",
            gap: "1rem",
          }}
        >
          <JsonPanel
            title="Runtime binding"
            value={binding}
          />
          <JsonPanel
            title="Resolver output"
            value={resolveResult}
          />
          <JsonPanel
            title="Primary lifecycle events"
            value={
              primaryState?.events ??
              []
            }
          />
          <JsonPanel
            title="Duplicate lifecycle events"
            value={
              duplicateState?.events ??
              []
            }
          />
        </section>

        <MaterialRuntimeSection
          modelBinding={binding}
        />
      </div>
    </main>
  );
}
