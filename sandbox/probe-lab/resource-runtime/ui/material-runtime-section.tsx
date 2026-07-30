"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearRuntimeTextureCache,
  runtimeTextureCacheSnapshot,
} from "../browser-texture-runtime";
import type {
  BlenderMaterialHydrationReport,
  MaterialRuntimeInstanceState,
  MaterialRuntimeListResponse,
  MaterialRuntimeResolveResponse,
  MaterialTextureRole,
  ReviewedMaterialSummary,
  RuntimeMaterialBindingV1,
  RuntimeMaterialSourceMode,
} from "../material-runtime-contract";
import type {
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";
import {
  MaterialRuntimeCanvas,
} from "./material-runtime-canvas";

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
    "1px solid rgba(167,139,250,0.4)",
  borderRadius: "0.75rem",
  background:
    "rgba(91,33,182,0.28)",
  color: "#ede9fe",
  padding: "0.65rem 0.85rem",
  cursor: "pointer",
  fontWeight: 700,
} as const;

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
          fontSize: "0.92rem",
        }}
      >
        {title}
      </h3>
      <pre
        style={{
          margin: 0,
          maxHeight: "340px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          color:
            "rgba(226,232,240,0.82)",
          fontSize: "0.7rem",
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
  title,
  state,
}: {
  title: string;
  state:
    | MaterialRuntimeInstanceState
    | null;
}) {
  return (
    <section style={cardStyle}>
      <h3
        style={{
          margin: "0 0 0.7rem",
          fontSize: "0.92rem",
        }}
      >
        {title}
      </h3>
      {state ? (
        <div
          style={{
            display: "grid",
            gap: "0.4rem",
            fontSize: "0.76rem",
          }}
        >
          <div>
            Phase:{" "}
            <strong>
              {state.phase}
            </strong>
          </div>
          <div>
            Textures:{" "}
            {state.metrics
              ?.texture_count ??
              "—"}
          </div>
          <div>
            Cache hits:{" "}
            {state.metrics
              ?.cache_hits ??
              "—"}
          </div>
          <div>
            Cache misses:{" "}
            {state.metrics
              ?.cache_misses ??
              "—"}
          </div>
          <div>
            Applied meshes:{" "}
            {state.metrics
              ?.applied_mesh_count ??
              "—"}
          </div>
          <div>
            Fallback maps:{" "}
            {state.metrics
              ?.fallback_roles.join(
                ", ",
              ) || "none"}
          </div>
          {state.warnings.map(
            (warning) => (
              <div
                key={warning}
                style={{
                  color: "#fde68a",
                }}
              >
                {warning}
              </div>
            ),
          )}
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
              "rgba(226,232,240,0.55)",
          }}
        >
          Not run.
        </div>
      )}
    </section>
  );
}

export function MaterialRuntimeSection({
  modelBinding,
}: {
  modelBinding:
    | RuntimeModelBindingV1
    | null;
}) {
  const [
    materials,
    setMaterials,
  ] = useState<
    ReviewedMaterialSummary[]
  >([]);
  const [
    selectedMaterialId,
    setSelectedMaterialId,
  ] = useState("");
  const [
    binding,
    setBinding,
  ] = useState<
    RuntimeMaterialBindingV1 | null
  >(null);
  const [
    resolveReport,
    setResolveReport,
  ] = useState<
    MaterialRuntimeResolveResponse | null
  >(null);
  const [
    blenderReport,
    setBlenderReport,
  ] = useState<
    BlenderMaterialHydrationReport | null
  >(null);
  const [
    sourceMode,
    setSourceMode,
  ] = useState<RuntimeMaterialSourceMode>(
    "replace_all",
  );
  const [
    targetSlot,
    setTargetSlot,
  ] = useState("");
  const [
    repeat,
    setRepeat,
  ] = useState(2);
  const [
    duplicateRepeat,
    setDuplicateRepeat,
  ] = useState(5);
  const [
    roughness,
    setRoughness,
  ] = useState(0.8);
  const [
    duplicateRoughness,
    setDuplicateRoughness,
  ] = useState(0.25);
  const [
    simulateFailureRole,
    setSimulateFailureRole,
  ] = useState<
    MaterialTextureRole | null
  >(null);
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
    primaryState,
    setPrimaryState,
  ] = useState<
    MaterialRuntimeInstanceState | null
  >(null);
  const [
    duplicateState,
    setDuplicateState,
  ] = useState<
    MaterialRuntimeInstanceState | null
  >(null);
  const [
    modelState,
    setModelState,
  ] = useState<
    MaterialRuntimeInstanceState | null
  >(null);
  const [
    textureCache,
    setTextureCache,
  ] = useState(
    runtimeTextureCacheSnapshot(),
  );

  const selected =
    useMemo(
      () =>
        materials.find(
          (material) =>
            material.resource_id ===
            selectedMaterialId,
        ) ?? null,
      [
        materials,
        selectedMaterialId,
      ],
    );

  const refreshCache =
    useCallback(() => {
      setTextureCache(
        runtimeTextureCacheSnapshot(),
      );
    }, []);

  const onPrimaryState =
    useCallback(
      (
        state: MaterialRuntimeInstanceState,
      ) => {
        setPrimaryState(state);
        refreshCache();
      },
      [refreshCache],
    );
  const onDuplicateState =
    useCallback(
      (
        state: MaterialRuntimeInstanceState,
      ) => {
        setDuplicateState(state);
        refreshCache();
      },
      [refreshCache],
    );
  const onModelState =
    useCallback(
      (
        state: MaterialRuntimeInstanceState,
      ) => {
        setModelState(state);
        refreshCache();
      },
      [refreshCache],
    );

  useEffect(() => {
    let active = true;

    fetch(
      "/api/sandbox/probe-lab/resource-runtime/materials",
      { cache: "no-store" },
    )
      .then(
        async (response) => {
          const payload =
            (await response.json()) as
              MaterialRuntimeListResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ??
                "Unable to list reviewed materials.",
            );
          }

          if (!active) return;
          setMaterials(
            payload.materials,
          );
          setSelectedMaterialId(
            payload.default_material_id ??
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

  const resolveMaterial =
    useCallback(async () => {
      setLoading(true);
      setError(null);
      setBlenderReport(null);
      setPrimaryState(null);
      setDuplicateState(null);
      setModelState(null);
      setSimulateFailureRole(
        null,
      );

      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/resource-runtime/materials",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify({
                material_id:
                  selectedMaterialId,
                target_entity_id:
                  modelBinding?.entity_id ??
                  "resource_runtime_material_actor",
                target_slot:
                  targetSlot,
                source_mode:
                  sourceMode,
                repeat_x: repeat,
                repeat_y: repeat,
                roughness_factor:
                  roughness,
                opacity: 1,
              }),
            },
          );
        const payload =
          (await response.json()) as
            MaterialRuntimeResolveResponse;

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
              "Material resolution failed.",
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
    }, [
      modelBinding,
      repeat,
      roughness,
      selectedMaterialId,
      sourceMode,
      targetSlot,
    ]);

  const testBlender =
    useCallback(async () => {
      if (!binding) return;
      setLoading(true);
      setError(null);

      try {
        const response =
          await fetch(
            "/api/sandbox/probe-lab/resource-runtime/materials/blender-hydrate",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify({
                material_binding:
                  binding,
              }),
            },
          );
        const payload =
          (await response.json()) as
            BlenderMaterialHydrationReport;
        setBlenderReport(
          payload,
        );

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ??
              "Blender material hydration failed.",
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
    }, [binding]);

  const clearCache =
    useCallback(() => {
      const result =
        clearRuntimeTextureCache();
      refreshCache();
      setError(
        result.retained
          ? `${result.retained} active texture entries were retained until their material instances are disposed.`
          : null,
      );
    }, [refreshCache]);

  return (
    <section
      style={{
        marginTop: "2.5rem",
      }}
    >
      <p
        style={{
          margin: 0,
          color:
            "rgba(196,181,253,0.8)",
          fontSize: "0.74rem",
          letterSpacing: "0.17em",
          textTransform:
            "uppercase",
        }}
      >
        Phase 2F material runtime
      </p>
      <h2
        style={{
          margin:
            "0.55rem 0 0.45rem",
          fontSize:
            "clamp(1.55rem, 3vw, 2.35rem)",
        }}
      >
        Reviewed PBR materials
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: "940px",
          color:
            "rgba(226,232,240,0.68)",
          lineHeight: 1.65,
        }}
      >
        Resolve one R2-published
        ambientCG material,
        hydrate its PBR maps
        through the shared texture
        cache, compare independent
        UV and roughness settings,
        override the current GLB,
        and inspect the Blender
        Principled BSDF handoff.
      </p>

      <div
        style={{
          ...cardStyle,
          marginTop: "1rem",
          display: "grid",
          gap: "0.85rem",
        }}
      >
        <label
          style={{
            display: "grid",
            gap: "0.35rem",
            fontSize: "0.78rem",
          }}
        >
          Reviewed material
          <select
            value={
              selectedMaterialId
            }
            onChange={(event) =>
              setSelectedMaterialId(
                event.target.value,
              )
            }
            style={{
              borderRadius:
                "0.7rem",
              border:
                "1px solid rgba(148,163,184,0.28)",
              background:
                "#0f172a",
              color: "#f8fafc",
              padding:
                "0.7rem 0.75rem",
            }}
          >
            {materials.map(
              (material) => (
                <option
                  key={
                    material.resource_id
                  }
                  value={
                    material.resource_id
                  }
                >
                  {
                    material.display_name
                  }{" "}
                  —{" "}
                  {
                    material.resolution ??
                    "native"
                  }
                </option>
              ),
            )}
          </select>
        </label>

        {selected ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.7rem",
              color:
                "rgba(226,232,240,0.62)",
              fontSize: "0.72rem",
            }}
          >
            <span>
              Maps:{" "}
              {selected.map_roles.join(
                ", ",
              )}
            </span>
            <span>
              Hash:{" "}
              {selected.content_hash.slice(
                0,
                12,
              )}
            </span>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <label>
            <div>
              Primary UV repeat:{" "}
              {repeat.toFixed(1)}
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={repeat}
              onChange={(event) =>
                setRepeat(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
              style={{
                width: "100%",
              }}
            />
          </label>
          <label>
            <div>
              Duplicate UV repeat:{" "}
              {duplicateRepeat.toFixed(
                1,
              )}
            </div>
            <input
              type="range"
              min="0.5"
              max="12"
              step="0.5"
              value={
                duplicateRepeat
              }
              onChange={(event) =>
                setDuplicateRepeat(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
              style={{
                width: "100%",
              }}
            />
          </label>
          <label>
            <div>
              Primary roughness:{" "}
              {roughness.toFixed(2)}
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={roughness}
              onChange={(event) =>
                setRoughness(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
              style={{
                width: "100%",
              }}
            />
          </label>
          <label>
            <div>
              Duplicate roughness:{" "}
              {duplicateRoughness.toFixed(
                2,
              )}
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={
                duplicateRoughness
              }
              onChange={(event) =>
                setDuplicateRoughness(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
              style={{
                width: "100%",
              }}
            />
          </label>
          <label
            style={{
              display: "grid",
              gap: "0.3rem",
            }}
          >
            GLB application mode
            <select
              value={sourceMode}
              onChange={(event) =>
                setSourceMode(
                  event.target
                    .value as RuntimeMaterialSourceMode,
                )
              }
              style={{
                borderRadius:
                  "0.65rem",
                background:
                  "#0f172a",
                color: "#f8fafc",
                padding:
                  "0.55rem",
              }}
            >
              <option value="preserve_original">
                Preserve original
              </option>
              <option value="replace_all">
                Replace all
              </option>
              <option value="replace_slot">
                Replace named slot
              </option>
            </select>
          </label>
          <label
            style={{
              display: "grid",
              gap: "0.3rem",
            }}
          >
            Slot or mesh name
            <input
              value={targetSlot}
              disabled={
                sourceMode !==
                "replace_slot"
              }
              onChange={(event) =>
                setTargetSlot(
                  event.target.value,
                )
              }
              style={{
                borderRadius:
                  "0.65rem",
                border:
                  "1px solid rgba(148,163,184,0.25)",
                background:
                  "#0f172a",
                color: "#f8fafc",
                padding:
                  "0.55rem",
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <button
            type="button"
            style={buttonStyle}
            disabled={
              loading ||
              !selectedMaterialId
            }
            onClick={() =>
              void resolveMaterial()
            }
          >
            Resolve and apply material
          </button>
          <button
            type="button"
            style={{
              ...buttonStyle,
              borderColor:
                "rgba(245,158,11,0.5)",
              background:
                "rgba(146,64,14,0.25)",
              color: "#fef3c7",
            }}
            disabled={!binding}
            onClick={() =>
              setSimulateFailureRole(
                "base_color",
              )
            }
          >
            Test missing base-colour map
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={
              loading ||
              !binding
            }
            onClick={() =>
              void testBlender()
            }
          >
            Test Blender material hydration
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={clearCache}
          >
            Clear idle texture cache
          </button>
        </div>

        {error ? (
          <div
            style={{
              borderRadius:
                "0.7rem",
              border:
                "1px solid rgba(248,113,113,0.35)",
              background:
                "rgba(127,29,29,0.18)",
              color: "#fecaca",
              padding:
                "0.65rem 0.75rem",
              fontSize: "0.78rem",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: "1rem",
        }}
      >
        <MaterialRuntimeCanvas
          binding={binding}
          modelBinding={
            modelBinding
          }
          duplicateRepeat={
            duplicateRepeat
          }
          duplicateRoughness={
            duplicateRoughness
          }
          simulateFailureRole={
            simulateFailureRole
          }
          onPrimaryState={
            onPrimaryState
          }
          onDuplicateState={
            onDuplicateState
          }
          onModelState={
            onModelState
          }
        />
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "1rem",
        }}
      >
        <StatePanel
          title="Primary primitive"
          state={primaryState}
        />
        <StatePanel
          title="Independent duplicate"
          state={duplicateState}
        />
        <StatePanel
          title="Current GLB"
          state={modelState}
        />
        <JsonPanel
          title="Current GLB material application"
          value={
            modelState?.metrics
              ?.application ?? {
              status:
                "not applied",
            }
          }
        />
        <JsonPanel
          title="Texture cache"
          value={textureCache}
        />
        <JsonPanel
          title="Blender material hydration"
          value={
            blenderReport ?? {
              status:
                "not run",
            }
          }
        />
        <JsonPanel
          title="Material binding"
          value={binding}
        />
        <JsonPanel
          title="Material resolver diagnostics"
          value={resolveReport}
        />
      </div>
    </section>
  );
}