
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type * as THREE from "three";

import {
  clearRuntimeEnvironmentCache,
  runtimeEnvironmentCacheSnapshot,
} from "../browser-environment-runtime";
import type {
  BlenderEnvironmentHydrationReport,
  EnvironmentRuntimeListResponse,
  EnvironmentRuntimeResolveResponse,
  EnvironmentRuntimeState,
  ReviewedEnvironmentSummary,
  RuntimeEnvironmentBackgroundMode,
  RuntimeEnvironmentBindingV1,
  RuntimeEnvironmentFallbackRig,
} from "../environment-runtime-contract";
import type {
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";
import type {
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";
import {
  EnvironmentRuntimeCanvas,
} from "./environment-runtime-canvas";

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
    "1px solid rgba(56,189,248,0.42)",
  borderRadius: "0.75rem",
  background:
    "rgba(14,116,144,0.28)",
  color: "#cffafe",
  padding: "0.65rem 0.85rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

const selectStyle = {
  borderRadius: "0.65rem",
  border:
    "1px solid rgba(148,163,184,0.24)",
  background: "#020617",
  color: "#e2e8f0",
  colorScheme: "dark",
  padding: "0.6rem",
  minHeight: "2.5rem",
} as const;

const BACKGROUND_MODE_OPTIONS: ReadonlyArray<{
  value: RuntimeEnvironmentBackgroundMode;
  label: string;
}> = [
  {
    value: "solid_color",
    label: "Lighting only",
  },
  {
    value: "environment",
    label: "Visible HDRI",
  },
  {
    value: "transparent",
    label: "Transparent",
  },
  {
    value: "none",
    label: "None",
  },
];

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
          margin:
            "0 0 0.7rem",
          fontSize: "0.92rem",
        }}
      >
        {title}
      </h3>
      <pre
        style={{
          margin: 0,
          maxHeight:
            "360px",
          overflow: "auto",
          whiteSpace:
            "pre-wrap",
          overflowWrap:
            "anywhere",
          color:
            "rgba(226,232,240,0.82)",
          fontSize:
            "0.7rem",
          lineHeight: 1.5,
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

function StatePanel({
  state,
}: {
  state:
    | EnvironmentRuntimeState
    | null;
}) {
  return (
    <section style={cardStyle}>
      <h3
        style={{
          margin:
            "0 0 0.7rem",
          fontSize: "0.92rem",
        }}
      >
        Effective scene environment
      </h3>
      {state ? (
        <div
          style={{
            display: "grid",
            gap: "0.4rem",
            fontSize:
              "0.76rem",
          }}
        >
          <div>
            Phase:{" "}
            <strong>
              {state.phase}
            </strong>
          </div>
          <div>
            Lighting:{" "}
            {state.lighting_mode}
          </div>
          <div>
            HDRI attached:{" "}
            {state.environment_attached
              ? "yes"
              : "no"}
          </div>
          <div>
            Visible HDRI background:{" "}
            {state.background_attached
              ? "yes"
              : "no"}
          </div>
          <div>
            Fallback lights:{" "}
            {state.fallback_lights_active
              ? "active"
              : "off"}
          </div>
          <div>
            Download:{" "}
            {state.metrics
              ?.byte_size
              ? `${(
                  state.metrics
                    .byte_size /
                  (1024 * 1024)
                ).toFixed(2)} MB`
              : "—"}
          </div>
          <div>
            Decode / PMREM:{" "}
            {state.metrics
              ? `${state.metrics.decode_ms?.toFixed(1) ?? "—"} / ${state.metrics.pmrem_ms?.toFixed(1) ?? "—"} ms`
              : "—"}
          </div>
          <div>
            Source / browser HDRI:{" "}
            {state.metrics
              ?.source_width &&
            state.metrics
              ?.source_height &&
            state.metrics
              ?.runtime_width &&
            state.metrics
              ?.runtime_height
              ? `${state.metrics.source_width}×${state.metrics.source_height} → ${state.metrics.runtime_width}×${state.metrics.runtime_height}${state.metrics.downsampled ? " (safe browser downsample)" : ""}`
              : "—"}
          </div>
          {state.error ? (
            <div
              style={{
                color:
                  "#fde68a",
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
              "rgba(226,232,240,0.55)",
          }}
        >
          Not run.
        </div>
      )}
    </section>
  );
}

export function EnvironmentRuntimeSection({
  modelBinding,
  materialBinding,
  onBindingChange,
}: {
  modelBinding:
    | RuntimeModelBindingV1
    | null;
  materialBinding:
    | RuntimeMaterialBindingV1
    | null;
  onBindingChange?: (
    binding:
      | RuntimeEnvironmentBindingV1
      | null,
  ) => void;
}) {
  const [
    environments,
    setEnvironments,
  ] = useState<
    ReviewedEnvironmentSummary[]
  >([]);
  const [
    selectedEnvironmentId,
    setSelectedEnvironmentId,
  ] = useState("");
  const [
    binding,
    setBinding,
  ] = useState<
    RuntimeEnvironmentBindingV1 | null
  >(null);
  const [
    resolveReport,
    setResolveReport,
  ] = useState<
    EnvironmentRuntimeResolveResponse | null
  >(null);
  const [
    blenderReport,
    setBlenderReport,
  ] = useState<
    BlenderEnvironmentHydrationReport | null
  >(null);
  const [
    runtimeState,
    setRuntimeState,
  ] = useState<
    EnvironmentRuntimeState | null
  >(null);
  const [
    backgroundMode,
    setBackgroundMode,
  ] = useState<RuntimeEnvironmentBackgroundMode>(
    "solid_color",
  );
  const [
    fallbackRig,
    setFallbackRig,
  ] = useState<RuntimeEnvironmentFallbackRig>(
    "studio_rig",
  );
  const [
    intensity,
    setIntensity,
  ] = useState(1);
  const [
    rotationDegrees,
    setRotationDegrees,
  ] = useState(0);
  const [
    backgroundIntensity,
    setBackgroundIntensity,
  ] = useState(1);
  const [
    backgroundBlurriness,
    setBackgroundBlurriness,
  ] = useState(0);
  const [
    exposure,
    setExposure,
  ] = useState(1);
  const [
    verifyHash,
    setVerifyHash,
  ] = useState(false);
  const [
    loading,
    setLoading,
  ] = useState(false);
  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);
  const [
    cacheSnapshot,
    setCacheSnapshot,
  ] = useState(
    runtimeEnvironmentCacheSnapshot(),
  );

  const rendererRef =
    useRef<
      THREE.WebGLRenderer | null
    >(null);

  const selected =
    useMemo(
      () =>
        environments.find(
          (environment) =>
            environment.resource_id ===
            selectedEnvironmentId,
        ) ?? null,
      [
        environments,
        selectedEnvironmentId,
      ],
    );

  const effectiveBinding =
    useMemo(() => {
      if (!binding) return null;

      return {
        ...binding,
        background_mode:
          backgroundMode,
        intensity,
        rotation_radians:
          (rotationDegrees *
            Math.PI) /
          180,
        background_intensity:
          backgroundIntensity,
        background_blurriness:
          backgroundBlurriness,
        exposure,
        fallback: {
          ...binding.fallback,
          rig: fallbackRig,
        },
      };
    }, [
      backgroundBlurriness,
      backgroundIntensity,
      backgroundMode,
      binding,
      exposure,
      fallbackRig,
      intensity,
      rotationDegrees,
    ]);

  useEffect(() => {
    onBindingChange?.(
      effectiveBinding,
    );
  }, [
    effectiveBinding,
    onBindingChange,
  ]);

  const refreshCache =
    useCallback(() => {
      setCacheSnapshot(
        runtimeEnvironmentCacheSnapshot(
          rendererRef.current ??
            undefined,
        ),
      );
    }, []);

  const onRuntimeState =
    useCallback(
      (
        state: EnvironmentRuntimeState,
      ) => {
        setRuntimeState(state);
        refreshCache();
      },
      [refreshCache],
    );

  const onRenderer =
    useCallback(
      (
        renderer:
          THREE.WebGLRenderer,
      ) => {
        rendererRef.current =
          renderer;
        refreshCache();
      },
      [refreshCache],
    );

  useEffect(() => {
    let active = true;

    fetch(
      "/api/sandbox/probe-lab/resource-runtime/environments",
      {
        cache:
          "no-store",
      },
    )
      .then(
        async (response) => {
          const payload =
            (await response.json()) as
              EnvironmentRuntimeListResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ??
                "Unable to list reviewed environments.",
            );
          }

          if (!active) return;

          setEnvironments(
            payload.environments,
          );
          setSelectedEnvironmentId(
            payload.default_environment_id ??
              "",
          );
        },
      )
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const resolveEnvironment =
    useCallback(
      async (
        options: {
          forceFallback?: boolean;
          simulateFailure?: boolean;
        } = {},
      ) => {
        setLoading(true);
        setError(null);
        setBlenderReport(
          null,
        );

        try {
          const response =
            await fetch(
              "/api/sandbox/probe-lab/resource-runtime/environments",
              {
                method:
                  "POST",
                headers: {
                  "content-type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    environment_id:
                      selectedEnvironmentId,
                    intent:
                      "soft neutral educational lighting with clear subject visibility",
                    semantic_tags: [
                      "educational",
                      "neutral",
                      "studio",
                    ],
                    background_mode:
                      backgroundMode,
                    fallback_rig:
                      fallbackRig,
                    intensity,
                    rotation_radians:
                      (rotationDegrees *
                        Math.PI) /
                      180,
                    background_intensity:
                      backgroundIntensity,
                    background_blurriness:
                      backgroundBlurriness,
                    background_color:
                      "#0f172a",
                    exposure,
                    force_fallback:
                      Boolean(
                        options.forceFallback,
                      ),
                    simulate_failure:
                      Boolean(
                        options.simulateFailure,
                      ),
                  }),
              },
            );
          const payload =
            (await response.json()) as
              EnvironmentRuntimeResolveResponse;

          setResolveReport(
            payload,
          );

          if (
            !response.ok ||
            !payload.ok ||
            !payload.binding
          ) {
            throw new Error(
              payload.error ??
                "Environment resolution failed.",
            );
          }

          setBinding(
            payload.binding,
          );
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught),
          );
        } finally {
          setLoading(false);
        }
      },
      [
        backgroundBlurriness,
        backgroundIntensity,
        backgroundMode,
        exposure,
        fallbackRig,
        intensity,
        rotationDegrees,
        selectedEnvironmentId,
      ],
    );

  const testBlender =
    useCallback(async () => {
      if (
        !effectiveBinding ||
        effectiveBinding.lighting_mode !==
          "hdri"
      ) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/resource-runtime/environments/blender-hydrate",
            {
              method:
                "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  environment_binding:
                    effectiveBinding,
                }),
            },
          );
        const payload =
          (await response.json()) as
            BlenderEnvironmentHydrationReport;

        setBlenderReport(
          payload,
        );

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ??
              "Blender environment hydration failed.",
          );
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      } finally {
        setLoading(false);
      }
    }, [
      effectiveBinding,
    ]);

  const clearCache =
    useCallback(() => {
      clearRuntimeEnvironmentCache(
        rendererRef.current ??
          undefined,
      );
      refreshCache();
    }, [refreshCache]);

  return (
    <section
      style={{
        marginTop:
          "2rem",
        paddingTop:
          "2rem",
        borderTop:
          "1px solid rgba(56,189,248,0.2)",
      }}
    >
      <p
        style={{
          margin: 0,
          color:
            "#67e8f9",
          fontSize:
            "0.72rem",
          letterSpacing:
            "0.16em",
          textTransform:
            "uppercase",
        }}
      >
        Phase 2G
      </p>
      <h2
        style={{
          margin:
            "0.55rem 0 0.45rem",
          fontSize:
            "clamp(1.55rem, 3vw, 2.35rem)",
        }}
      >
        Reviewed environments
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth:
            "860px",
          color:
            "rgba(226,232,240,0.7)",
          lineHeight: 1.65,
        }}
      >
        Resolve a reviewed HDR or EXR
        environment, process it through
        PMREM for PBR lighting, control its
        visible background independently,
        and compare it with deterministic
        educational light rigs.
      </p>

      <section
        style={{
          ...cardStyle,
          marginTop:
            "1rem",
          display:
            "grid",
          gap: "0.9rem",
        }}
      >
        <label
          style={{
            display:
              "grid",
            gap: "0.35rem",
            fontSize:
              "0.78rem",
          }}
        >
          Reviewed environment
          <select
            value={
              selectedEnvironmentId
            }
            onChange={(
              event,
            ) =>
              setSelectedEnvironmentId(
                event.target
                  .value,
              )
            }
            style={selectStyle}
          >
            {environments.length ===
            0 ? (
              <option value="">
                No reviewed R2 HDRIs yet
              </option>
            ) : null}
            {environments.map(
              (
                environment,
              ) => (
                <option
                  key={
                    environment.resource_id
                  }
                  value={
                    environment.resource_id
                  }
                >
                  {
                    environment.display_name
                  }{" "}
                  —{" "}
                  {
                    environment.resolution ??
                    environment.format.toUpperCase()
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <fieldset
            style={{
              display: "grid",
              gap: "0.35rem",
              margin: 0,
              minWidth: 0,
              padding: 0,
              border: 0,
              fontSize:
                "0.75rem",
            }}
          >
            <legend
              style={{
                padding: 0,
                marginBottom:
                  "0.1rem",
              }}
            >
              Background
            </legend>
            <div
              role="group"
              aria-label="Background mode"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "0.4rem",
              }}
            >
              {BACKGROUND_MODE_OPTIONS.map(
                (option) => {
                  const selected =
                    backgroundMode ===
                    option.value;

                  return (
                    <button
                      key={
                        option.value
                      }
                      type="button"
                      aria-pressed={
                        selected
                      }
                      onClick={() =>
                        setBackgroundMode(
                          option.value,
                        )
                      }
                      style={{
                        border:
                          selected
                            ? "1px solid rgba(103,232,249,0.88)"
                            : "1px solid rgba(148,163,184,0.24)",
                        borderRadius:
                          "0.6rem",
                        background:
                          selected
                            ? "rgba(14,116,144,0.5)"
                            : "#020617",
                        color:
                          selected
                            ? "#ecfeff"
                            : "#cbd5e1",
                        padding:
                          "0.55rem 0.45rem",
                        cursor:
                          "pointer",
                        fontSize:
                          "0.72rem",
                        fontWeight:
                          selected
                            ? 700
                            : 500,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                },
              )}
            </div>
          </fieldset>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Fallback rig
            <select
              value={
                fallbackRig
              }
              style={selectStyle}
              onChange={(
                event,
              ) =>
                setFallbackRig(
                  event.target
                    .value as RuntimeEnvironmentFallbackRig,
                )
              }
            >
              <option value="studio_rig">
                Neutral studio
              </option>
              <option value="diagrammatic_rig">
                Diagrammatic
              </option>
              <option value="dramatic_rig">
                Dramatic
              </option>
              <option value="outdoor_daylight_rig">
                Outdoor daylight
              </option>
            </select>
          </label>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Intensity:{" "}
            {intensity.toFixed(
              2,
            )}
            <input
              type="range"
              min="0"
              max="4"
              step="0.05"
              value={
                intensity
              }
              onChange={(
                event,
              ) =>
                setIntensity(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Rotation:{" "}
            {rotationDegrees}°
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={
                rotationDegrees
              }
              onChange={(
                event,
              ) =>
                setRotationDegrees(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Exposure:{" "}
            {exposure.toFixed(
              2,
            )}
            <input
              type="range"
              min="0.25"
              max="2.5"
              step="0.05"
              value={
                exposure
              }
              onChange={(
                event,
              ) =>
                setExposure(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Background blur:{" "}
            {backgroundBlurriness.toFixed(
              2,
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={
                backgroundBlurriness
              }
              onChange={(
                event,
              ) =>
                setBackgroundBlurriness(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>

          <label
            style={{
              display:
                "grid",
              gap: "0.3rem",
              fontSize:
                "0.75rem",
            }}
          >
            Background intensity:{" "}
            {backgroundIntensity.toFixed(
              2,
            )}
            <input
              type="range"
              min="0"
              max="3"
              step="0.05"
              value={
                backgroundIntensity
              }
              onChange={(
                event,
              ) =>
                setBackgroundIntensity(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
            />
          </label>
        </div>

        <div
          style={{
            display:
              "flex",
            flexWrap:
              "wrap",
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
              !selectedEnvironmentId
            }
            onClick={() =>
              void resolveEnvironment()
            }
          >
            Resolve and apply HDRI
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={
              loading
            }
            onClick={() =>
              void resolveEnvironment({
                forceFallback:
                  true,
              })
            }
          >
            Apply fallback rig
          </button>
          <button
            type="button"
            style={{
              ...buttonStyle,
              borderColor:
                "rgba(245,158,11,0.46)",
              background:
                "rgba(146,64,14,0.28)",
              color:
                "#fef3c7",
            }}
            disabled={
              loading ||
              !selectedEnvironmentId
            }
            onClick={() =>
              void resolveEnvironment({
                simulateFailure:
                  true,
              })
            }
          >
            Test broken HDRI
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={
              loading ||
              effectiveBinding
                ?.lighting_mode !==
                "hdri"
            }
            onClick={() =>
              void testBlender()
            }
          >
            Test Blender environment hydration
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={
              clearCache
            }
          >
            Clear idle environment cache
          </button>
          <label
            style={{
              display:
                "flex",
              gap: "0.4rem",
              alignItems:
                "center",
              fontSize:
                "0.76rem",
            }}
          >
            <input
              type="checkbox"
              checked={
                verifyHash
              }
              onChange={(
                event,
              ) =>
                setVerifyHash(
                  event.target
                    .checked,
                )
              }
            />
            Verify SHA-256
          </label>
        </div>

        {selected ? (
          <div
            style={{
              color:
                "rgba(226,232,240,0.64)",
              fontSize:
                "0.74rem",
            }}
          >
            Selected:{" "}
            {selected.display_name} ·{" "}
            {selected.format.toUpperCase()} ·{" "}
            {selected.resolution ??
              "unknown resolution"}
          </div>
        ) : (
          <div
            style={{
              color:
                "#fde68a",
              fontSize:
                "0.76rem",
            }}
          >
            The reviewed HDRI registry is empty.
            The deterministic fallback rigs are
            still fully testable; publish an
            ambientCG HDRI to R2 to exercise the
            HDR/EXR path.
          </div>
        )}

        {error ? (
          <div
            style={{
              borderRadius:
                "0.75rem",
              border:
                "1px solid rgba(248,113,113,0.35)",
              background:
                "rgba(127,29,29,0.18)",
              color:
                "#fecaca",
              padding:
                "0.7rem 0.8rem",
              fontSize:
                "0.8rem",
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      <div
        style={{
          marginTop:
            "1rem",
        }}
      >
        <EnvironmentRuntimeCanvas
          binding={
            effectiveBinding
          }
          modelBinding={
            modelBinding
          }
          materialBinding={
            materialBinding
          }
          verifyHash={
            verifyHash
          }
          onState={
            onRuntimeState
          }
          onRenderer={
            onRenderer
          }
        />
      </div>

      <section
        style={{
          marginTop:
            "1rem",
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        <StatePanel
          state={
            runtimeState
          }
        />
        <JsonPanel
          title="Environment cache"
          value={
            cacheSnapshot
          }
        />
        <JsonPanel
          title="Blender temporary environment hydration"
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
          marginTop:
            "1rem",
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "1rem",
        }}
      >
        <JsonPanel
          title="Environment binding"
          value={
            effectiveBinding
          }
        />
        <JsonPanel
          title="Environment resolver diagnostics"
          value={
            resolveReport
          }
        />
        <JsonPanel
          title="Effective renderer configuration"
          value={
            runtimeState?.effective ??
            null
          }
        />
      </section>
    </section>
  );
}
