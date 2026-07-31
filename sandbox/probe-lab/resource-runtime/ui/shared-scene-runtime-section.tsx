"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildRuntimeSceneBinding,
} from "../build-scene-runtime-binding";
import type {
  RuntimeEnvironmentBindingV1,
} from "../environment-runtime-contract";
import type {
  RuntimeMaterialBindingV1,
} from "../material-runtime-contract";
import type {
  ResourceRuntimeAssetSummary,
  ResourceRuntimeResolveResponse,
  RuntimeModelBindingV1,
} from "../resource-runtime-contract";
import type {
  RuntimeSceneBindingV1,
  RuntimeSceneState,
} from "../scene-runtime-contract";
import {
  SharedSceneRuntimeCanvas,
} from "./shared-scene-runtime-canvas";

const cardStyle = {
  border:
    "1px solid rgba(34,211,238,0.2)",
  borderRadius: "1rem",
  background: "rgba(15,23,42,0.74)",
  padding: "1rem",
} as const;

const buttonStyle = {
  border:
    "1px solid rgba(34,211,238,0.42)",
  borderRadius: "0.75rem",
  background: "rgba(14,116,144,0.28)",
  color: "#cffafe",
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
          margin: "0 0 0.65rem",
          fontSize: "0.9rem",
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
          color: "rgba(226,232,240,0.82)",
          fontSize: "0.69rem",
          lineHeight: 1.5,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function remapModelBinding(
  binding: RuntimeModelBindingV1,
  input: {
    scene_id: string;
    intent_id: string;
    entity_id: string;
  },
): RuntimeModelBindingV1 {
  return {
    ...binding,
    scene_id: input.scene_id,
    intent_id: input.intent_id,
    entity_id: input.entity_id,
  };
}

function clonedMaterialForEntity(
  binding: RuntimeMaterialBindingV1,
  entityId: string,
  suffix: string,
  repeatMultiplier = 1,
): RuntimeMaterialBindingV1 {
  return {
    ...binding,
    material_binding_id:
      `${binding.material_binding_id}:${suffix}`,
    target_entity_id: entityId,
    maps: { ...binding.maps },
    parameters: { ...binding.parameters },
    uv_transform: {
      ...binding.uv_transform,
      repeat: [
        binding.uv_transform.repeat[0] *
          repeatMultiplier,
        binding.uv_transform.repeat[1] *
          repeatMultiplier,
      ],
      offset: [
        ...binding.uv_transform.offset,
      ] as [number, number],
      center: [
        ...binding.uv_transform.center,
      ] as [number, number],
    },
    warnings: [...binding.warnings],
  };
}

function StatusPanel({
  state,
}: {
  state: RuntimeSceneState | null;
}) {
  return (
    <section style={cardStyle}>
      <h3
        style={{
          margin: "0 0 0.7rem",
          fontSize: "0.92rem",
        }}
      >
        Effective composed scene
      </h3>
      {state ? (
        <div
          style={{
            display: "grid",
            gap: "0.42rem",
            fontSize: "0.76rem",
          }}
        >
          <div>
            Phase: <strong>{state.phase}</strong>
          </div>
          <div>
            Models ready: {state.models_ready}/
            {state.actor_states.length}
          </div>
          <div>
            Materials ready: {state.materials_ready}
          </div>
          <div>
            Environment: {state.environment_ready
              ? "reviewed HDRI"
              : "fallback rig"}
          </div>
          <div>
            Fallbacks: {state.fallbacks_active.length
              ? state.fallbacks_active.join(", ")
              : "none"}
          </div>
          <div>
            Bytes: {state.diagnostics
              ? `${(
                  state.diagnostics.total_download_bytes /
                  (1024 * 1024)
                ).toFixed(2)} MB`
              : "—"}
          </div>
          <div>
            Total composition: {state.diagnostics
              ? `${state.diagnostics.timing.total_ms.toFixed(
                  1,
                )} ms`
              : "—"}
          </div>
          {state.error ? (
            <div style={{ color: "#fecaca" }}>
              {state.error}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            color: "rgba(226,232,240,0.55)",
            fontSize: "0.76rem",
          }}
        >
          Compose the scene to run the shared lifecycle.
        </div>
      )}
    </section>
  );
}

export function SharedSceneRuntimeSection({
  assets,
  primaryModelBinding,
  primaryMaterialBinding,
  environmentBinding,
}: {
  assets: ResourceRuntimeAssetSummary[];
  primaryModelBinding: RuntimeModelBindingV1 | null;
  primaryMaterialBinding:
    | RuntimeMaterialBindingV1
    | null;
  environmentBinding:
    | RuntimeEnvironmentBindingV1
    | null;
}) {
  const [secondaryAssetId, setSecondaryAssetId] =
    useState("");
  const [secondaryModelBinding, setSecondaryModelBinding] =
    useState<RuntimeModelBindingV1 | null>(null);
  const [sceneBinding, setSceneBinding] =
    useState<RuntimeSceneBindingV1 | null>(null);
  const [runtimeState, setRuntimeState] =
    useState<RuntimeSceneState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyHash, setVerifyHash] = useState(false);
  const [applyMaterialToSecondary, setApplyMaterialToSecondary] =
    useState(true);
  const [simulateSecondaryFailure, setSimulateSecondaryFailure] =
    useState(false);

  const secondaryOptions = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.asset_id !== primaryModelBinding?.asset_id,
      ),
    [assets, primaryModelBinding?.asset_id],
  );

  useEffect(() => {
    if (
      secondaryAssetId &&
      secondaryOptions.some(
        (asset) => asset.asset_id === secondaryAssetId,
      )
    ) {
      return;
    }
    setSecondaryAssetId(
      secondaryOptions[0]?.asset_id ?? "",
    );
    setSecondaryModelBinding(null);
    setSceneBinding(null);
    setRuntimeState(null);
  }, [secondaryAssetId, secondaryOptions]);

  const resolveSecondary = useCallback(async () => {
    if (!secondaryAssetId) return;
    setLoading(true);
    setError(null);
    setSecondaryModelBinding(null);
    setSceneBinding(null);
    setRuntimeState(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/resource-runtime",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            asset_id: secondaryAssetId,
            simulate_failure: false,
          }),
        },
      );
      const payload =
        (await response.json()) as ResourceRuntimeResolveResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.runtime_binding
      ) {
        throw new Error(
          payload.error ??
            "Unable to resolve the secondary reviewed actor.",
        );
      }

      setSecondaryModelBinding(
        remapModelBinding(payload.runtime_binding, {
          scene_id: "phase2h_composed_scene",
          intent_id: "phase2h_secondary_model",
          entity_id: "phase2h_secondary_actor",
        }),
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
  }, [secondaryAssetId]);

  const composeScene = useCallback(() => {
    if (!primaryModelBinding) {
      setError(
        "Resolve the primary model in Phase 2D before composing the shared scene.",
      );
      return;
    }
    if (!secondaryModelBinding) {
      setError(
        "Resolve a secondary reviewed model before composing the multi-actor proof.",
      );
      return;
    }

    setError(null);
    setRuntimeState(null);

    try {
      const primary = remapModelBinding(
        primaryModelBinding,
        {
          scene_id: "phase2h_composed_scene",
          intent_id: "phase2h_primary_model",
          entity_id: "resource_runtime_actor",
        },
      );
      const materials: RuntimeMaterialBindingV1[] = [];

      if (primaryMaterialBinding) {
        materials.push(
          clonedMaterialForEntity(
            primaryMaterialBinding,
            primary.entity_id,
            "primary",
          ),
        );
        if (applyMaterialToSecondary) {
          materials.push(
            clonedMaterialForEntity(
              primaryMaterialBinding,
              secondaryModelBinding.entity_id,
              "secondary",
              1.6,
            ),
          );
        }
      }

      const next = buildRuntimeSceneBinding({
        scene_id: "phase2h_composed_scene",
        source: "resource_runtime_harness",
        models: [primary, secondaryModelBinding],
        materials,
        environment: environmentBinding,
        required_entity_ids: [
          primary.entity_id,
          secondaryModelBinding.entity_id,
        ],
        actor_transforms: {
          [primary.entity_id]: {
            position: [-1.8, 0, 0],
          },
          [secondaryModelBinding.entity_id]: {
            position: [1.8, 0, 0],
            rotation_radians: [0, -0.35, 0],
          },
        },
        warnings: environmentBinding
          ? []
          : [
              "No reviewed environment binding is active; the composed scene will use the declared studio fallback rig.",
            ],
      });

      setSceneBinding(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    }
  }, [
    applyMaterialToSecondary,
    environmentBinding,
    primaryMaterialBinding,
    primaryModelBinding,
    secondaryModelBinding,
  ]);

  const onRuntimeState = useCallback(
    (state: RuntimeSceneState) => {
      setRuntimeState(state);
    },
    [],
  );

  return (
    <section
      style={{
        marginTop: "1.4rem",
        borderTop:
          "1px solid rgba(34,211,238,0.2)",
        paddingTop: "1.4rem",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "rgba(103,232,249,0.78)",
          fontSize: "0.72rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Phase 2H composition proof
      </p>
      <h2
        style={{
          margin: "0.55rem 0 0.45rem",
          fontSize: "clamp(1.45rem, 3vw, 2.25rem)",
        }}
      >
        Shared Scene Runtime
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: "980px",
          color: "rgba(226,232,240,0.7)",
          lineHeight: 1.65,
        }}
      >
        Compose two independently owned model instances, entity-targeted
        materials, one reviewed environment, renderer policy, lifecycle
        cleanup, failure isolation, and declared fallbacks through a single
        scene binding. The composer executes resource decisions; it does not
        reinterpret the educational direction.
      </p>

      <section
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
          Secondary reviewed R2 model
          <select
            value={secondaryAssetId}
            onChange={(event) => {
              setSecondaryAssetId(event.target.value);
              setSecondaryModelBinding(null);
              setSceneBinding(null);
              setRuntimeState(null);
            }}
            style={{
              borderRadius: "0.7rem",
              border:
                "1px solid rgba(148,163,184,0.3)",
              background: "#0f172a",
              color: "#f8fafc",
              padding: "0.7rem 0.8rem",
            }}
          >
            {secondaryOptions.map((asset) => (
              <option
                key={asset.asset_id}
                value={asset.asset_id}
              >
                {asset.canonical_label} — {asset.asset_id}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.65rem",
          }}
        >
          <button
            type="button"
            style={buttonStyle}
            disabled={loading || !secondaryAssetId}
            onClick={() => void resolveSecondary()}
          >
            Resolve secondary actor
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={
              loading ||
              !primaryModelBinding ||
              !secondaryModelBinding
            }
            onClick={composeScene}
          >
            Compose shared scene
          </button>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.76rem",
            }}
          >
            <input
              type="checkbox"
              checked={applyMaterialToSecondary}
              onChange={(event) =>
                setApplyMaterialToSecondary(
                  event.target.checked,
                )
              }
            />
            Independent material on second actor
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.76rem",
            }}
          >
            <input
              type="checkbox"
              checked={simulateSecondaryFailure}
              onChange={(event) =>
                setSimulateSecondaryFailure(
                  event.target.checked,
                )
              }
            />
            Isolate second-actor failure
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.76rem",
            }}
          >
            <input
              type="checkbox"
              checked={verifyHash}
              onChange={(event) =>
                setVerifyHash(event.target.checked)
              }
            />
            Verify SHA-256
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.8rem",
            color: "rgba(226,232,240,0.65)",
            fontSize: "0.74rem",
          }}
        >
          <span>
            Primary: {primaryModelBinding?.asset_id ?? "not resolved"}
          </span>
          <span>
            Secondary: {secondaryModelBinding?.asset_id ?? "not resolved"}
          </span>
          <span>
            Material: {primaryMaterialBinding?.material_resource_id ??
              "preserve original"}
          </span>
          <span>
            Environment: {environmentBinding?.display_name ??
              "studio fallback"}
          </span>
        </div>

        {error ? (
          <div
            style={{
              borderRadius: "0.75rem",
              border:
                "1px solid rgba(248,113,113,0.35)",
              background: "rgba(127,29,29,0.18)",
              color: "#fecaca",
              padding: "0.7rem 0.8rem",
              fontSize: "0.78rem",
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      {sceneBinding ? (
        <div style={{ marginTop: "1rem" }}>
          <SharedSceneRuntimeCanvas
            binding={sceneBinding}
            verifyHash={verifyHash}
            simulateFailureEntityId={
              simulateSecondaryFailure
                ? "phase2h_secondary_actor"
                : null
            }
            onState={onRuntimeState}
          />
        </div>
      ) : null}

      <section
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
        }}
      >
        <StatusPanel state={runtimeState} />
        <JsonPanel
          title="Scene runtime binding"
          value={sceneBinding ?? { status: "not composed" }}
        />
        <JsonPanel
          title="Composition diagnostics"
          value={
            runtimeState?.diagnostics ?? {
              status: "not run",
            }
          }
        />
        <JsonPanel
          title="Actor lifecycle states"
          value={runtimeState?.actor_states ?? []}
        />
      </section>
    </section>
  );
}
