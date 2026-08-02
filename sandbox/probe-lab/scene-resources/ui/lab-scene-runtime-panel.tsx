"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  EnvironmentRuntimeListResponse,
  ReviewedEnvironmentSummary,
} from "../../resource-runtime/environment-runtime-contract";
import type {
  MaterialRuntimeListResponse,
  ReviewedMaterialSummary,
} from "../../resource-runtime/material-runtime-contract";
import type {
  ResourceRuntimeAssetListResponse,
  ResourceRuntimeAssetSummary,
} from "../../resource-runtime/resource-runtime-contract";
import type {
  RuntimeSceneBindingV1,
  RuntimeSceneState,
} from "../../resource-runtime/scene-runtime-contract";
import {
  SharedSceneRuntimeCanvas,
} from "../../resource-runtime/ui/shared-scene-runtime-canvas";
import type {
  SceneResourcePlanSource,
  SceneResourcePlanV1,
} from "../scene-resource-contract";

type JsonRecord =
  Record<string, unknown>;

type ResolveResponse = {
  ok: boolean;
  resource_plan?: unknown;
  resource_plan_validation?: unknown;
  resolved_resources?: unknown;
  runtime_binding?:
    | RuntimeSceneBindingV1
    | null;
  inspector?: unknown;
  error?: string;
};

const cardStyle = {
  border:
    "1px solid rgba(34,211,238,0.22)",
  borderRadius: "1rem",
  background: "rgba(2,6,23,0.72)",
  padding: "1rem",
} as const;

const inputStyle = {
  width: "100%",
  borderRadius: "0.75rem",
  border:
    "1px solid rgba(148,163,184,0.28)",
  background: "rgba(2,6,23,0.92)",
  color: "white",
  padding: "0.62rem 0.72rem",
} as const;

const buttonStyle = {
  border:
    "1px solid rgba(34,211,238,0.42)",
  borderRadius: "0.75rem",
  background: "rgba(8,145,178,0.3)",
  color: "#cffafe",
  padding: "0.72rem 0.95rem",
  cursor: "pointer",
  fontWeight: 800,
} as const;

function asRecord(
  value: unknown,
): JsonRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function cleanId(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function planEntityIds(
  plan: unknown,
) {
  const root =
    asRecord(plan);
  const ids =
    Array.isArray(
      root?.entity_intents,
    )
      ? root.entity_intents
          .map((value) =>
            cleanId(
              asRecord(value)
                ?.entity_id,
            ),
          )
          .filter(Boolean)
      : [];
  return ids;
}

function planModelIntents(
  plan: unknown,
) {
  const root =
    asRecord(plan);
  if (
    !Array.isArray(
      root?.entity_intents,
    )
  ) {
    return [] as Array<{
      intent_id: string;
      entity_id: string;
      label: string;
    }>;
  }

  return root.entity_intents
    .map((value) => {
      const intent =
        asRecord(value);
      if (
        !intent ||
        !asRecord(
          intent.model_requirement,
        )
      ) {
        return null;
      }
      const intentId =
        cleanId(
          intent.intent_id,
        );
      const entityId =
        cleanId(
          intent.entity_id,
        );
      if (!intentId || !entityId) {
        return null;
      }
      return {
        intent_id: intentId,
        entity_id: entityId,
        label:
          cleanId(
            intent.semantic_role,
          ) || entityId,
      };
    })
    .filter(
      (
        value,
      ): value is {
        intent_id: string;
        entity_id: string;
        label: string;
      } => Boolean(value),
    );
}

function primitiveEntityIds(
  nodes: unknown,
) {
  const ids: string[] = [];
  const visit = (
    value: unknown,
  ) => {
    const node =
      asRecord(value);
    if (!node) return;
    const id =
      cleanId(node.id);
    if (id) ids.push(id);
    if (
      Array.isArray(
        node.children,
      )
    ) {
      node.children.forEach(
        visit,
      );
    }
  };
  if (Array.isArray(nodes)) {
    nodes.forEach(visit);
  }
  return ids;
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
          margin: "0 0 0.65rem",
          fontSize: "0.9rem",
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
          fontSize: "0.68rem",
          lineHeight: 1.5,
          color:
            "rgba(226,232,240,0.82)",
        }}
      >
        {JSON.stringify(
          value ?? null,
          null,
          2,
        )}
      </pre>
    </section>
  );
}

export function LabSceneRuntimePanel({
  source,
  resourcePlan,
  primitiveNodes,
  heading = "Shared Phase 2 execution",
}: {
  source:
    | "manual_turn"
    | "primitive_builder"
    | "visual_experience";
  resourcePlan: unknown;
  primitiveNodes?: unknown;
  heading?: string;
}) {
  const [
    assets,
    setAssets,
  ] = useState<
    ResourceRuntimeAssetSummary[]
  >([]);
  const [
    materials,
    setMaterials,
  ] = useState<
    ReviewedMaterialSummary[]
  >([]);
  const [
    environments,
    setEnvironments,
  ] = useState<
    ReviewedEnvironmentSummary[]
  >([]);
  const [
    selectedModelIntent,
    setSelectedModelIntent,
  ] = useState("");
  const [
    selectedAssetId,
    setSelectedAssetId,
  ] = useState("");
  const [
    materialTarget,
    setMaterialTarget,
  ] = useState("");
  const [
    selectedMaterialId,
    setSelectedMaterialId,
  ] = useState("");
  const [
    selectedEnvironmentId,
    setSelectedEnvironmentId,
  ] = useState("");
  const [
    preserveOriginalMaterial,
    setPreserveOriginalMaterial,
  ] = useState(true);
  const [
    visibleBackground,
    setVisibleBackground,
  ] = useState(false);
  const [
    resolving,
    setResolving,
  ] = useState(false);
  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );
  const [
    response,
    setResponse,
  ] = useState<ResolveResponse | null>(
    null,
  );
  const [
    runtimeState,
    setRuntimeState,
  ] = useState<RuntimeSceneState | null>(
    null,
  );

  const modelIntents =
    useMemo(
      () =>
        planModelIntents(
          resourcePlan,
        ),
      [resourcePlan],
    );
  const entityIds =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...planEntityIds(
              resourcePlan,
            ),
            ...primitiveEntityIds(
              primitiveNodes,
            ),
          ]),
        ),
      [
        primitiveNodes,
        resourcePlan,
      ],
    );
  const validPlan =
    asRecord(
      resourcePlan,
    )?.schema_version ===
    "myway_scene_resource_plan_v1";

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(
        "/api/sandbox/probe-lab/resource-runtime",
      ).then(
        (result) =>
          result.json(),
      ),
      fetch(
        "/api/sandbox/probe-lab/resource-runtime/materials",
      ).then(
        (result) =>
          result.json(),
      ),
      fetch(
        "/api/sandbox/probe-lab/resource-runtime/environments",
      ).then(
        (result) =>
          result.json(),
      ),
    ])
      .then(
        ([
          modelPayload,
          materialPayload,
          environmentPayload,
        ]) => {
          if (!active) return;
          const models =
            modelPayload as ResourceRuntimeAssetListResponse;
          const materialList =
            materialPayload as MaterialRuntimeListResponse;
          const environmentList =
            environmentPayload as EnvironmentRuntimeListResponse;
          setAssets(
            models.assets ?? [],
          );
          setMaterials(
            materialList.materials ??
              [],
          );
          setEnvironments(
            environmentList
              .environments ?? [],
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

  useEffect(() => {
    const first =
      modelIntents[0];
    if (
      selectedModelIntent &&
      modelIntents.some(
        (intent) =>
          intent.intent_id ===
          selectedModelIntent,
      )
    ) {
      return;
    }
    setSelectedModelIntent(
      first?.intent_id ?? "",
    );
  }, [
    modelIntents,
    selectedModelIntent,
  ]);

  useEffect(() => {
    if (
      materialTarget &&
      entityIds.includes(
        materialTarget,
      )
    ) {
      return;
    }
    setMaterialTarget(
      entityIds[0] ?? "",
    );
  }, [
    entityIds,
    materialTarget,
  ]);

  useEffect(() => {
    if (
      !selectedAssetId ||
      assets.some(
        (asset) =>
          asset.asset_id ===
          selectedAssetId,
      )
    ) {
      return;
    }
    setSelectedAssetId("");
  }, [
    assets,
    selectedAssetId,
  ]);

  useEffect(() => {
    if (
      !selectedMaterialId ||
      materials.some(
        (material) =>
          material.resource_id ===
          selectedMaterialId,
      )
    ) {
      return;
    }
    setSelectedMaterialId("");
  }, [
    materials,
    selectedMaterialId,
  ]);

  useEffect(() => {
    if (
      !selectedEnvironmentId ||
      environments.some(
        (environment) =>
          environment.resource_id ===
          selectedEnvironmentId,
      )
    ) {
      return;
    }
    setSelectedEnvironmentId("");
  }, [
    environments,
    selectedEnvironmentId,
  ]);

  const resolveRuntime =
    useCallback(async () => {
      if (!validPlan) {
        setError(
          "Generate or validate a scene first so this lab has a shared scene resource plan.",
        );
        return;
      }

      setResolving(true);
      setError(null);
      setResponse(null);
      setRuntimeState(null);

      const preferredAssets:
        Record<string, string> =
          {};
      if (
        selectedModelIntent &&
        selectedAssetId
      ) {
        preferredAssets[
          selectedModelIntent
        ] = selectedAssetId;
      }

      try {
        const result =
          await fetch(
            "/api/sandbox/probe-lab/scene-runtime/resolve",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify({
                source,
                resource_plan:
                  resourcePlan,
                primitive_nodes:
                  primitiveNodes,
                preferred_asset_ids_by_intent:
                  preferredAssets,
                material_override:
                  preserveOriginalMaterial ||
                  !materialTarget ||
                  !selectedMaterialId
                    ? null
                    : {
                        target_entity_id:
                          materialTarget,
                        preferred_material_id:
                          selectedMaterialId,
                        semantic_tags: [],
                        appearance_tags: [],
                        required_maps: [
                          "base_color",
                        ],
                        material_slot:
                          "default",
                        repeat: [1, 1],
                        preserve_original:
                          false,
                      },
                environment_override: {
                  preferred_environment_id:
                    selectedEnvironmentId ||
                    null,
                  background_mode:
                    visibleBackground
                      ? "visible"
                      : "lighting_only",
                },
              }),
            },
          );
        const payload =
          (await result.json()) as ResolveResponse;
        if (
          !result.ok ||
          payload.ok !== true ||
          !payload.runtime_binding
        ) {
          throw new Error(
            payload.error ??
              `Runtime resolution failed with ${result.status}.`,
          );
        }
        setResponse(payload);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : String(caught),
        );
      } finally {
        setResolving(false);
      }
    }, [
      materialTarget,
      preserveOriginalMaterial,
      primitiveNodes,
      resourcePlan,
      selectedAssetId,
      selectedEnvironmentId,
      selectedMaterialId,
      selectedModelIntent,
      source,
      validPlan,
      visibleBackground,
    ]);

  const onRuntimeState =
    useCallback(
      (state: RuntimeSceneState) => {
        setRuntimeState(state);
      },
      [],
    );

  return (
    <section
      style={{
        border:
          "1px solid rgba(34,211,238,0.24)",
        borderRadius: "1.4rem",
        background:
          "linear-gradient(145deg, rgba(8,47,73,0.68), rgba(2,6,23,0.86))",
        padding: "1.15rem",
        display: "grid",
        gap: "1rem",
        color: "white",
      }}
    >
      <header>
        <div
          style={{
            color: "#67e8f9",
            fontSize: "0.72rem",
            fontWeight: 900,
            letterSpacing:
              "0.15em",
            textTransform:
              "uppercase",
          }}
        >
          Phase 2 closeout
        </div>
        <h2
          style={{
            margin:
              "0.45rem 0 0.35rem",
          }}
        >
          {heading}
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: "980px",
            color:
              "rgba(226,232,240,0.72)",
            lineHeight: 1.6,
          }}
        >
          Resolve reviewed models, optional PBR material overrides,
          one HDRI environment, and supported primitives through the same
          stable scene contract. Changing a resource never regenerates the
          educational direction.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "0.8rem",
        }}
      >
        <label style={cardStyle}>
          <span
            style={{
              display: "block",
              marginBottom: "0.45rem",
              fontSize: "0.75rem",
              color:
                "rgba(226,232,240,0.68)",
            }}
          >
            Model intent override
          </span>
          <select
            value={
              selectedModelIntent
            }
            onChange={(event) =>
              setSelectedModelIntent(
                event.target.value,
              )
            }
            style={inputStyle}
          >
            <option value="">
              Deterministic resolver
            </option>
            {modelIntents.map(
              (intent) => (
                <option
                  key={
                    intent.intent_id
                  }
                  value={
                    intent.intent_id
                  }
                >
                  {intent.label} ·{" "}
                  {intent.entity_id}
                </option>
              ),
            )}
          </select>
          <select
            value={selectedAssetId}
            onChange={(event) =>
              setSelectedAssetId(
                event.target.value,
              )
            }
            style={{
              ...inputStyle,
              marginTop: "0.55rem",
            }}
          >
            <option value="">
              No pinned model
            </option>
            {assets.map((asset) => (
              <option
                key={asset.asset_id}
                value={asset.asset_id}
              >
                {asset.display_name}
              </option>
            ))}
          </select>
        </label>

        <label style={cardStyle}>
          <span
            style={{
              display: "block",
              marginBottom: "0.45rem",
              fontSize: "0.75rem",
              color:
                "rgba(226,232,240,0.68)",
            }}
          >
            Material target
          </span>
          <select
            value={materialTarget}
            onChange={(event) =>
              setMaterialTarget(
                event.target.value,
              )
            }
            style={inputStyle}
          >
            {entityIds.map((id) => (
              <option
                key={id}
                value={id}
              >
                {id}
              </option>
            ))}
          </select>
          <select
            value={
              selectedMaterialId
            }
            onChange={(event) =>
              setSelectedMaterialId(
                event.target.value,
              )
            }
            disabled={
              preserveOriginalMaterial
            }
            style={{
              ...inputStyle,
              marginTop: "0.55rem",
            }}
          >
            <option value="">
              No explicit override
            </option>
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
                  }
                </option>
              ),
            )}
          </select>
          <span
            style={{
              display: "flex",
              gap: "0.45rem",
              marginTop: "0.55rem",
              fontSize: "0.75rem",
            }}
          >
            <input
              type="checkbox"
              checked={
                preserveOriginalMaterial
              }
              onChange={(event) =>
                setPreserveOriginalMaterial(
                  event.target.checked,
                )
              }
            />
            Preserve original material
          </span>
        </label>

        <label style={cardStyle}>
          <span
            style={{
              display: "block",
              marginBottom: "0.45rem",
              fontSize: "0.75rem",
              color:
                "rgba(226,232,240,0.68)",
            }}
          >
            Environment
          </span>
          <select
            value={
              selectedEnvironmentId
            }
            onChange={(event) =>
              setSelectedEnvironmentId(
                event.target.value,
              )
            }
            style={inputStyle}
          >
            <option value="">
              Director choice / deterministic resolver
            </option>
            {environments.map(
              (environment) => (
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
                  }
                </option>
              ),
            )}
          </select>
          <span
            style={{
              display: "flex",
              gap: "0.45rem",
              marginTop: "0.55rem",
              fontSize: "0.75rem",
            }}
          >
            <input
              type="checkbox"
              checked={
                visibleBackground
              }
              onChange={(event) =>
                setVisibleBackground(
                  event.target.checked,
                )
              }
            />
            Show HDRI background
          </span>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            void resolveRuntime()
          }
          disabled={
            resolving || !validPlan
          }
        >
          {resolving
            ? "Resolving shared scene…"
            : "Resolve + compose shared scene"}
        </button>
        <span
          style={{
            borderRadius: 999,
            border:
              "1px solid rgba(34,211,238,0.24)",
            padding:
              "0.4rem 0.65rem",
            fontSize: "0.72rem",
            color: validPlan
              ? "#a7f3d0"
              : "#fde68a",
          }}
        >
          {validPlan
            ? `${entityIds.length} stable entity id(s)`
            : "Waiting for resource plan"}
        </span>
        {runtimeState ? (
          <span
            style={{
              borderRadius: 999,
              border:
                "1px solid rgba(34,211,238,0.24)",
              padding:
                "0.4rem 0.65rem",
              fontSize:
                "0.72rem",
            }}
          >
            Runtime:{" "}
            {runtimeState.phase}
          </span>
        ) : null}
      </div>

      {error ? (
        <pre
          style={{
            margin: 0,
            borderRadius:
              "0.85rem",
            background:
              "rgba(127,29,29,0.34)",
            padding: "0.85rem",
            whiteSpace:
              "pre-wrap",
            color: "#fecaca",
          }}
        >
          {error}
        </pre>
      ) : null}

      {response?.runtime_binding ? (
        <SharedSceneRuntimeCanvas
          binding={
            response.runtime_binding
          }
          verifyHash={false}
          simulateFailureEntityId={
            null
          }
          onState={onRuntimeState}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "0.8rem",
        }}
      >
        <JsonPanel
          title="Requested resource plan"
          value={
            response?.resource_plan ??
            resourcePlan
          }
        />
        <JsonPanel
          title="Resolved resources"
          value={
            response?.resolved_resources ??
            null
          }
        />
        <JsonPanel
          title="Unified run inspector"
          value={
            response?.inspector ??
            null
          }
        />
        <JsonPanel
          title="Runtime lifecycle"
          value={runtimeState}
        />
      </div>
    </section>
  );
}

export function extractResourcePlanFromLabResult(
  value: unknown,
): SceneResourcePlanV1 | null {
  const root =
    asRecord(value);
  const candidates = [
    root?.resource_plan,
    asRecord(root?.resolved)
      ?.resource_plan,
    asRecord(root?.scene_graph)
      ?.resource_plan,
    asRecord(
      asRecord(root?.output)
        ?.visual_experience,
    )?.semantic_scene_plan
      ? asRecord(
          asRecord(
            asRecord(root?.output)
              ?.visual_experience,
          )?.semantic_scene_plan,
        )?.resource_plan
      : null,
  ];

  for (const candidate of
    candidates) {
    const plan =
      asRecord(candidate);
    if (
      plan?.schema_version ===
      "myway_scene_resource_plan_v1"
    ) {
      return plan as SceneResourcePlanV1;
    }
  }
  return null;
}

export function sourceForLabRuntime(
  value: SceneResourcePlanSource,
) {
  return value;
}
