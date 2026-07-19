"use client";

import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Html,
  OrbitControls,
  Text,
} from "@react-three/drei";
import {
  ChangeEvent,
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  PrimitiveBeat,
  PrimitiveBuildPlanV1,
  PrimitivePart,
} from "../primitive-build-plan";
import type {
  PrimitiveBuilderAssetRequirement,
} from "../asset-requirement-plan";
import {
  ResolvedAssetModel,
  solveResolvedAssetLayout,
  type ResolvedAssetRuntimeMetrics,
} from "@/sandbox/probe-lab/scenes/ui";
import type {
  PrimitiveBuilderSceneAssetResolution,
  ResolvedSceneAssetBinding,
} from "@/sandbox/probe-lab/scenes/resolved-scene";

type Vec3 = [number, number, number];
type ProviderChoice = "deepseek" | "glm";
type FallbackChoice =
  | "none"
  | "deepseek"
  | "glm";

type GeneratedAssetRequirement =
  PrimitiveBuilderAssetRequirement;

type SavedPrimitiveBuilderScene = {
  schema_version: "myway_scene_manifest_v2";
  scene_id: string;
  title: string;
  original_prompt: string;
  source: "primitive_builder";
  assets: ResolvedSceneAssetBinding[];
  procedural_nodes: unknown[];
  scene_graph?: unknown;
  primitive_plan?: PrimitiveBuildPlanV1 | null;
  asset_requirements?: GeneratedAssetRequirement[];
  unresolved_requirements?: GeneratedAssetRequirement[];
  camera?: Record<string, unknown>;
  lights?: Record<string, unknown>;
  timeline?: unknown[];
  created_at: string;
  updated_at: string;
};

type GenerateResponse = {
  ok: boolean;
  plan: PrimitiveBuildPlanV1;
  warnings?: string[];
  provider_requested?: string;
  fallback_provider?: string;
  provider_used?: string;
  provider_model?: string;
  provider_fallback_used?: boolean;
  provider_call_error?: string | null;
  duration_ms?: number;
  prompt_stats?: {
    system_chars: number;
    user_chars: number;
    total_chars: number;
  };
  parse_ok?: boolean;
  parse_error?: string | null;
  parse_retry?: {
    attempted: boolean;
    succeeded: boolean;
    error: string | null;
  };
  model_call_diagnostics?: unknown;
  raw_text_preview?: string;
  scene_graph?: unknown;
  asset_requirements?: GeneratedAssetRequirement[];
  asset_inference?: Array<{
    asset_id: string;
    canonical_label: string;
    matched_phrase: string;
    layout_proxy_node_id?: string;
    fallback_node_id?: string;
    source:
      | "existing_model_requirement"
      | "matched_scene_node"
      | "created_layout_proxy"
      | "created_fallback_node";
  }>;
  asset_resolution?: PrimitiveBuilderSceneAssetResolution;
};

type RenderPart = PrimitivePart & {
  position: Vec3;
  scale: Vec3;
};

type ResolvedLayoutScene = {
  parts: RenderPart[];
  byId: Map<string, RenderPart>;
};

const DEFAULT_PROMPT =
  "Build a small outdoor picnic scene with a picnic table, a coffee mug, an apple, and a potted plant.";

function positiveSize(
  value: Vec3,
): Vec3 {
  return value.map((entry) =>
    Math.max(0.02, Math.abs(entry)),
  ) as Vec3;
}

function partPosition(
  part: PrimitivePart,
): Vec3 {
  const offset = part.placement.offset;

  return Array.isArray(offset) &&
    offset.length >= 3
    ? [
        Number(offset[0] ?? 0),
        Number(offset[1] ?? 0),
        Number(offset[2] ?? 0),
      ]
    : [0, 0, 0];
}

function composeLayout(parts: RenderPart[]) {
  if (!parts.length) return;

  const minX = Math.min(
    ...parts.map(
      (part) =>
        part.position[0] -
        part.scale[0] / 2,
    ),
  );
  const maxX = Math.max(
    ...parts.map(
      (part) =>
        part.position[0] +
        part.scale[0] / 2,
    ),
  );
  const minY = Math.min(
    ...parts.map(
      (part) =>
        part.position[1] -
        part.scale[1] / 2,
    ),
  );
  const minZ = Math.min(
    ...parts.map(
      (part) =>
        part.position[2] -
        part.scale[2] / 2,
    ),
  );
  const maxZ = Math.max(
    ...parts.map(
      (part) =>
        part.position[2] +
        part.scale[2] / 2,
    ),
  );
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  for (const part of parts) {
    part.position = [
      part.position[0] - centerX,
      part.position[1] - minY,
      part.position[2] - centerZ,
    ];
  }
}

function resolveLayoutScene(
  plan: PrimitiveBuildPlanV1,
): ResolvedLayoutScene {
  const parts = plan.parts.map((part) => ({
    ...part,
    position: partPosition(part),
    scale: positiveSize(part.size),
  }));
  composeLayout(parts);

  return {
    parts,
    byId: new Map(
      parts.map((part) => [
        part.id,
        part,
      ]),
    ),
  };
}

function visiblePartIds(
  plan: PrimitiveBuildPlanV1,
  activeStep: number,
) {
  const visible = new Set<string>();
  const safeStep = Math.max(
    1,
    Math.min(
      activeStep,
      Math.max(1, plan.beats.length),
    ),
  );

  for (const beat of plan.beats.slice(
    0,
    safeStep,
  )) {
    for (const id of beat.reveal) {
      visible.add(id);
    }
  }

  return visible;
}

function activePartIds(
  beat: PrimitiveBeat | undefined,
) {
  return new Set([
    ...(beat?.reveal ?? []),
    ...(beat?.emphasize ?? []),
    ...(
      beat?.effects ?? []
    ).map((effect) => effect.target_id),
  ]);
}

function sameVec3(
  left: Vec3 | undefined,
  right: Vec3,
) {
  return Boolean(
    left &&
      Math.abs(left[0] - right[0]) <
        0.0001 &&
      Math.abs(left[1] - right[1]) <
        0.0001 &&
      Math.abs(left[2] - right[2]) <
        0.0001,
  );
}

function sameRuntimeMetrics(
  left: ResolvedAssetRuntimeMetrics,
  right: ResolvedAssetRuntimeMetrics,
) {
  if (
    !sameVec3(
      left.world_size,
      right.world_size,
    ) ||
    !sameVec3(
      left.source_size,
      right.source_size,
    ) ||
    left.support_surfaces.length !==
      right.support_surfaces.length
  ) {
    return false;
  }

  return left.support_surfaces.every(
    (surface, index) => {
      const other =
        right.support_surfaces[index];

      return Boolean(
        other &&
          surface.id === other.id &&
          sameVec3(
            surface.center_offset,
            other.center_offset,
          ) &&
          Math.abs(
            surface.size[0] -
              other.size[0],
          ) < 0.0001 &&
          Math.abs(
            surface.size[1] -
              other.size[1],
          ) < 0.0001,
      );
    },
  );
}

function sceneGraphRecord(
  value: unknown,
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectSceneGraphSubtreeIds(
  sceneGraph: unknown,
  targetId: string,
) {
  const found = new Set<string>();

  function visit(
    values: unknown,
    insideTarget: boolean,
  ) {
    if (!Array.isArray(values)) return;

    for (const value of values) {
      const node = sceneGraphRecord(value);
      if (!node) continue;

      const nodeId =
        typeof node.id === "string"
          ? node.id
          : "";
      const active =
        insideTarget ||
        nodeId === targetId;

      if (active && nodeId) {
        found.add(nodeId);
      }

      visit(node.children, active);
    }
  }

  const root = sceneGraphRecord(sceneGraph);
  visit(root?.nodes, false);

  if (!found.size) {
    found.add(targetId);
  }

  return found;
}

function collectAuthorizedProceduralIds(
  sceneGraph: unknown,
) {
  const ids = new Set<string>();

  function visit(values: unknown) {
    if (!Array.isArray(values)) return;

    for (const value of values) {
      const node = sceneGraphRecord(value);
      if (!node) continue;

      const nodeId =
        typeof node.id === "string"
          ? node.id
          : "";
      const kind =
        typeof node.kind === "string"
          ? node.kind
          : "";
      const policy =
        node.render_policy ===
        "procedural_required";

      if (
        policy &&
        nodeId &&
        (kind === "glow" ||
          kind === "cloud")
      ) {
        ids.add(nodeId);
      }

      visit(node.children);
    }
  }

  visit(
    sceneGraphRecord(sceneGraph)?.nodes,
  );
  return ids;
}

function authorizedProceduralNodes(
  sceneGraph: unknown,
) {
  const output: Record<string, unknown>[] =
    [];

  function visit(values: unknown) {
    if (!Array.isArray(values)) return;

    for (const value of values) {
      const node = sceneGraphRecord(value);
      if (!node) continue;

      const kind =
        typeof node.kind === "string"
          ? node.kind
          : "";
      if (
        node.render_policy ===
          "procedural_required" &&
        (kind === "glow" ||
          kind === "cloud")
      ) {
        output.push(node);
      }

      visit(node.children);
    }
  }

  visit(
    sceneGraphRecord(sceneGraph)?.nodes,
  );
  return output;
}

function proxyNodeIds(
  binding: ResolvedSceneAssetBinding,
  sceneGraph: unknown,
) {
  const ids = new Set<string>([
    ...(binding.layout_proxy_node_ids ??
      []),
    ...(binding.replacement_node_ids ??
      []),
  ]);
  const rootId =
    binding.layout_proxy_node_id ??
    binding.fallback_node_id;

  if (rootId) {
    for (const id of
      collectSceneGraphSubtreeIds(
        sceneGraph,
        rootId,
      )) {
      ids.add(id);
    }
  }

  return ids;
}

function ProceduralEffect({
  part,
  active,
}: {
  part: RenderPart;
  active: boolean;
}) {
  const opacity = active ? 0.52 : 0.24;
  const color =
    part.material === "particle"
      ? "#fbbf24"
      : "#67e8f9";

  return (
    <mesh
      position={part.position}
      scale={part.scale}
    >
      <sphereGeometry
        args={[
          0.5,
          part.material === "particle"
            ? 10
            : 18,
          part.material === "particle"
            ? 8
            : 12,
        ]}
      />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

function AssetScene({
  plan,
  sceneGraph,
  activeStep,
  showLabels,
  assetBindings,
}: {
  plan: PrimitiveBuildPlanV1;
  sceneGraph: unknown;
  activeStep: number;
  showLabels: boolean;
  assetBindings: ResolvedSceneAssetBinding[];
}) {
  const layoutScene = useMemo(
    () => resolveLayoutScene(plan),
    [plan],
  );
  const [assetMetrics, setAssetMetrics] =
    useState<
      Map<string, ResolvedAssetRuntimeMetrics>
    >(() => new Map());
  const activeBeat =
    plan.beats[activeStep - 1] ??
    plan.beats[0];
  const visibleIds =
    visiblePartIds(plan, activeStep);
  const activeIds =
    activePartIds(activeBeat);
  const authorizedProceduralIds =
    useMemo(
      () =>
        collectAuthorizedProceduralIds(
          sceneGraph,
        ),
      [sceneGraph],
    );
  const visibleProceduralParts =
    layoutScene.parts.filter(
      (part) =>
        authorizedProceduralIds.has(
          part.id,
        ) &&
        visibleIds.has(part.id),
    );
  const proxyIdsByBinding = useMemo(
    () =>
      new Map(
        assetBindings.map((binding) => [
          binding.instance_id,
          proxyNodeIds(
            binding,
            sceneGraph,
          ),
        ]),
      ),
    [assetBindings, sceneGraph],
  );

  function bindingIntersects(
    binding: ResolvedSceneAssetBinding,
    ids: Set<string>,
  ) {
    const proxyIds =
      proxyIdsByBinding.get(
        binding.instance_id,
      );

    if (!proxyIds || proxyIds.size === 0) {
      return true;
    }

    for (const id of proxyIds) {
      if (ids.has(id)) return true;
    }

    return false;
  }

  const visibleAssetBindings =
    assetBindings.filter((binding) =>
      bindingIntersects(binding, visibleIds),
    );
  const baseAssetPositions = useMemo(() => {
    const positions = new Map<string, Vec3>();

    for (const binding of assetBindings) {
      const ids =
        proxyIdsByBinding.get(
          binding.instance_id,
        ) ?? new Set<string>();
      const ownedParts = [...ids]
        .map((id) =>
          layoutScene.byId.get(id),
        )
        .filter(
          (
            value,
          ): value is RenderPart =>
            Boolean(value),
        );

      if (ownedParts.length > 0) {
        const minX = Math.min(
          ...ownedParts.map(
            (part) =>
              part.position[0] -
              part.scale[0] / 2,
          ),
        );
        const maxX = Math.max(
          ...ownedParts.map(
            (part) =>
              part.position[0] +
              part.scale[0] / 2,
          ),
        );
        const minY = Math.min(
          ...ownedParts.map(
            (part) =>
              part.position[1] -
              part.scale[1] / 2,
          ),
        );
        const minZ = Math.min(
          ...ownedParts.map(
            (part) =>
              part.position[2] -
              part.scale[2] / 2,
          ),
        );
        const maxZ = Math.max(
          ...ownedParts.map(
            (part) =>
              part.position[2] +
              part.scale[2] / 2,
          ),
        );

        positions.set(
          binding.instance_id,
          [
            (minX + maxX) / 2,
            minY,
            (minZ + maxZ) / 2,
          ],
        );
      } else {
        positions.set(
          binding.instance_id,
          binding.position,
        );
      }
    }

    return positions;
  }, [
    assetBindings,
    layoutScene,
    proxyIdsByBinding,
  ]);
  const solvedLayout = useMemo(
    () =>
      solveResolvedAssetLayout({
        bindings: assetBindings,
        basePositions: baseAssetPositions,
        metrics: assetMetrics,
      }),
    [
      assetBindings,
      assetMetrics,
      baseAssetPositions,
    ],
  );

  function recordMetrics(
    metrics: ResolvedAssetRuntimeMetrics,
  ) {
    setAssetMetrics((current) => {
      const previous = current.get(
        metrics.instance_id,
      );

      if (
        previous &&
        sameRuntimeMetrics(
          previous,
          metrics,
        )
      ) {
        return current;
      }

      const next = new Map(current);
      next.set(metrics.instance_id, metrics);
      return next;
    });
  }

  return (
    <div className="relative h-full">
      <Canvas
        camera={{
          position: [5.2, 3.8, 6.2],
          fov: 44,
        }}
        shadows
      >
        <color
          attach="background"
          args={["#020617"]}
        />
        <ambientLight intensity={0.52} />
        <directionalLight
          position={[4, 7, 5]}
          intensity={1.25}
          castShadow
        />
        <pointLight
          position={[-4, 3, -4]}
          intensity={0.6}
          color="#60a5fa"
        />
        <pointLight
          position={[3, 2.5, 3]}
          intensity={0.35}
          color="#fbbf24"
        />

        <Bounds
          fit
          clip
          observe
          margin={1.25}
        >
          <group rotation={[0, -0.35, 0]}>
            {visibleProceduralParts.map(
              (part) => (
                <ProceduralEffect
                  key={part.id}
                  part={part}
                  active={activeIds.has(
                    part.id,
                  )}
                />
              ),
            )}

            {visibleAssetBindings.map(
              (binding) => {
                const position =
                  solvedLayout.positions.get(
                    binding.instance_id,
                  ) ?? binding.position;
                const metrics =
                  assetMetrics.get(
                    binding.instance_id,
                  );
                const labelHeight =
                  metrics?.world_size[1] ??
                  binding.target_extent_m;

                return (
                  <group
                    key={
                      binding.instance_id
                    }
                  >
                    <Suspense fallback={null}>
                      <ResolvedAssetModel
                        binding={binding}
                        active={bindingIntersects(
                          binding,
                          activeIds,
                        )}
                        positionOverride={
                          position
                        }
                        onMetrics={
                          recordMetrics
                        }
                      />
                    </Suspense>
                    {showLabels &&
                    bindingIntersects(
                      binding,
                      activeIds,
                    ) ? (
                      <Html
                        position={[
                          position[0],
                          position[1] +
                            labelHeight +
                            0.2,
                          position[2],
                        ]}
                        center
                        distanceFactor={7.5}
                      >
                        <div className="whitespace-nowrap rounded-full border border-white/15 bg-black/75 px-2 py-1 text-[10px] font-semibold text-white shadow-xl backdrop-blur">
                          {binding.concept}
                        </div>
                      </Html>
                    ) : null}
                  </group>
                );
              },
            )}
          </group>
        </Bounds>

        <Text
          position={[0, 3.7, -2.2]}
          fontSize={0.18}
          maxWidth={4.8}
          textAlign="center"
          color="#dbeafe"
          anchorX="center"
          anchorY="middle"
        >
          {activeBeat?.title ??
            plan.scene_title}
        </Text>

        <gridHelper
          args={[
            9,
            18,
            "#334155",
            "#1e293b",
          ]}
          position={[0, -0.04, 0]}
        />
        <OrbitControls
          enableDamping
          makeDefault
        />
      </Canvas>

      {visibleAssetBindings.length === 0 &&
      visibleProceduralParts.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-sm rounded-3xl border border-white/10 bg-slate-950/85 p-5 text-center shadow-2xl backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100/75">
              Nothing available in this beat
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-200/75">
              Requested objects without a
              verified asset are intentionally
              missing from the scene.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function beatButtonTone(
  active: boolean,
) {
  return active
    ? "border-cyan-200/45 bg-cyan-300/20 text-cyan-50 shadow-[0_14px_34px_rgba(34,211,238,0.14)]"
    : "border-white/10 bg-white/[0.055] text-zinc-200 hover:bg-white/[0.09]";
}

function clampStep(
  value: number,
  plan: PrimitiveBuildPlanV1 | null,
) {
  if (!plan) return 1;

  return Math.max(
    1,
    Math.min(
      Math.max(1, plan.beats.length),
      value,
    ),
  );
}

function providerLabel(
  value: string | undefined,
) {
  if (value === "glm") return "GLM-5.2";
  if (value === "deepseek") {
    return "DeepSeek V4 Pro";
  }

  return value ?? "unknown";
}

export function PrimitiveBuilderLab() {
  const [prompt, setPrompt] =
    useState(DEFAULT_PROMPT);
  const [provider, setProvider] =
    useState<ProviderChoice>("glm");
  const [
    fallbackProvider,
    setFallbackProvider,
  ] = useState<FallbackChoice>("deepseek");
  const [showLabels, setShowLabels] =
    useState(true);
  const [activeStep, setActiveStep] =
    useState(1);
  const [result, setResult] =
    useState<GenerateResponse | null>(null);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [
    previewBindings,
    setPreviewBindings,
  ] = useState<
    ResolvedSceneAssetBinding[]
  >([]);
  const [
    trellisLoadingIds,
    setTrellisLoadingIds,
  ] = useState<Set<string>>(
    new Set(),
  );
  const [savedScenes, setSavedScenes] =
    useState<
      SavedPrimitiveBuilderScene[]
    >([]);
  const [sceneName, setSceneName] =
    useState("");
  const [sceneMessage, setSceneMessage] =
    useState<string | null>(null);

  const plan = result?.plan ?? null;
  const currentBeat = plan
    ? plan.beats[activeStep - 1] ??
      plan.beats[0]
    : null;
  const assetRequirements =
    result?.asset_requirements ?? [];
  const resolvedBindings = useMemo(() => {
    const byId = new Map<
      string,
      ResolvedSceneAssetBinding
    >();

    for (const binding of
      result?.asset_resolution?.bindings ??
      []) {
      byId.set(
        binding.instance_id,
        binding,
      );
    }

    for (const binding of previewBindings) {
      byId.set(
        binding.instance_id,
        binding,
      );
    }

    return [...byId.values()];
  }, [previewBindings, result]);
  const missingRequirements =
    assetRequirements.filter(
      (requirement) =>
        !resolvedBindings.some(
          (binding) =>
            binding.instance_id ===
            requirement.instance_id,
        ),
    );
  const warnings = Array.from(
    new Set([
      ...(result?.warnings ?? []),
      ...(
        result?.asset_resolution
          ?.warnings ?? []
      ),
    ]),
  );

  async function readJsonResponse(
    response: Response,
  ) {
    const raw = await response.text();

    try {
      return JSON.parse(
        raw,
      ) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Expected JSON from ${response.url}, but received ${response.status} ${response.statusText}: ${raw.slice(0, 180)}`,
      );
    }
  }

  async function refreshSavedScenes() {
    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/scenes",
        { cache: "no-store" },
      );
      const json =
        await readJsonResponse(response);

      if (
        !response.ok ||
        json.ok !== true
      ) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : `Scene list failed with ${response.status}`,
        );
      }

      setSavedScenes(
        Array.isArray(json.scenes)
          ? (json.scenes as SavedPrimitiveBuilderScene[])
          : [],
      );
    } catch (caught) {
      setSceneMessage(
        `Saved scenes could not be loaded: ${
          caught instanceof Error
            ? caught.message
            : String(caught)
        }`,
      );
    }
  }

  useEffect(() => {
    void refreshSavedScenes();
  }, []);

  async function generateWithTrellis(
    requirement: GeneratedAssetRequirement,
  ) {
    if (
      trellisLoadingIds.has(
        requirement.instance_id,
      )
    ) {
      return;
    }

    setTrellisLoadingIds((current) => {
      const next = new Set(current);
      next.add(requirement.instance_id);
      return next;
    });
    setError(null);
    setSceneMessage(
      `Generating ${requirement.concept} with TRELLIS…`,
    );

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/primitive-builder/trellis",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requirement,
          }),
        },
      );
      const json =
        await readJsonResponse(response);

      if (
        !response.ok ||
        json.ok !== true ||
        !json.binding
      ) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : `TRELLIS request failed with ${response.status}`,
        );
      }

      const binding =
        json.binding as ResolvedSceneAssetBinding;

      setPreviewBindings((current) => [
        ...current.filter(
          (candidate) =>
            candidate.instance_id !==
            binding.instance_id,
        ),
        binding,
      ]);
      setSceneMessage(
        `${requirement.concept} is now in the current scene as a TRELLIS preview. Review it in the Asset Library before MyWay may reuse it automatically.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setTrellisLoadingIds((current) => {
        const next = new Set(current);
        next.delete(
          requirement.instance_id,
        );
        return next;
      });
    }
  }

  async function saveCurrentScene() {
    if (!plan || !result) return;

    const sceneGraph =
      sceneGraphRecord(
        result.scene_graph,
      ) ?? {};
    const title =
      sceneName.trim() ||
      plan.scene_title ||
      "Asset Scene";

    setSceneMessage("Saving scene…");

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/assets/scenes",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            schema_version:
              "myway_scene_manifest_v2",
            title,
            original_prompt: prompt,
            source: "primitive_builder",
            assets: resolvedBindings,
            procedural_nodes:
              authorizedProceduralNodes(
                result.scene_graph,
              ),
            scene_graph:
              result.scene_graph,
            primitive_plan: plan,
            asset_requirements:
              assetRequirements,
            unresolved_requirements:
              missingRequirements,
            camera:
              sceneGraphRecord(
                sceneGraph.camera,
              ) ?? {},
            lights:
              sceneGraphRecord(
                sceneGraph.lighting,
              ) ?? {},
            timeline: Array.isArray(
              sceneGraph.beats,
            )
              ? sceneGraph.beats
              : plan.beats,
          }),
        },
      );
      const json =
        await readJsonResponse(response);

      if (
        !response.ok ||
        json.ok !== true
      ) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : `Scene save failed with ${response.status}`,
        );
      }

      setSceneMessage(
        `Saved “${title}”.`,
      );
      setSceneName(title);
      await refreshSavedScenes();
    } catch (caught) {
      setSceneMessage(
        `Scene save failed: ${
          caught instanceof Error
            ? caught.message
            : String(caught)
        }`,
      );
    }
  }

  function loadSavedScene(
    scene: SavedPrimitiveBuilderScene,
  ) {
    const loadedPlan =
      scene.primitive_plan;

    if (
      !loadedPlan ||
      !Array.isArray(
        loadedPlan.parts,
      ) ||
      !Array.isArray(
        loadedPlan.beats,
      )
    ) {
      setSceneMessage(
        `“${scene.title}” does not contain a reloadable asset layout plan.`,
      );
      return;
    }

    const bindings = (
      Array.isArray(scene.assets)
        ? scene.assets
        : []
    ).filter(
      (binding) =>
        typeof binding.public_path ===
          "string" &&
        binding.public_path.length > 0,
    );

    setPrompt(scene.original_prompt);
    setSceneName(scene.title);
    setPreviewBindings([]);
    setResult({
      ok: true,
      plan: loadedPlan,
      scene_graph: scene.scene_graph,
      asset_requirements:
        scene.asset_requirements ?? [],
      asset_resolution: {
        schema_version:
          "primitive_builder_scene_asset_resolution_v2",
        bindings,
        unresolved_requirements:
          scene.unresolved_requirements ??
          [],
        warnings: [],
      },
    });
    setActiveStep(1);
    setSceneMessage(
      `Loaded “${scene.title}”.`,
    );
  }

  async function submitPrompt(
    event?: FormEvent,
  ) {
    event?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/primitive-builder/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            prompt: cleanPrompt,
            provider,
            fallback_provider:
              fallbackProvider,
            style: {
              look: "clean_stylized",
              mood: "neutral",
              complexity: "medium",
              cutaway: false,
            },
          }),
        },
      );
      const json =
        await readJsonResponse(response);

      if (
        !response.ok ||
        !("plan" in json)
      ) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : `Request failed with ${response.status}`,
        );
      }

      setResult(
        json as unknown as GenerateResponse,
      );
      setPreviewBindings([]);
      setSceneName(
        typeof (
          json.plan as Record<
            string,
            unknown
          >
        )?.scene_title === "string"
          ? String(
              (
                json.plan as Record<
                  string,
                  unknown
                >
              ).scene_title,
            )
          : "",
      );
      setSceneMessage(null);
      setActiveStep(1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1550px] flex-col gap-5 px-5 py-5 lg:px-7">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">
              MyWay Sandbox
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Asset Scene Builder
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-200/72">
              The model creates an invisible
              layout plan. MyWay renders only
              verified assets and explicitly
              authorized abstract effects.
            </p>
          </div>
          <a
            href="/sandbox/probe-lab"
            className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.11]"
          >
            Back to Probe Lab
          </a>
        </header>

        <section className="grid min-h-[720px] flex-1 gap-5 xl:grid-cols-[minmax(22rem,0.34fr)_minmax(0,1fr)_minmax(23rem,0.36fr)]">
          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            <form onSubmit={submitPrompt}>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">
                Prompt
              </p>
              <label
                className="mt-3 block text-sm font-semibold text-zinc-100"
                htmlFor="asset-scene-prompt"
              >
                What should MyWay build?
              </label>
              <textarea
                id="asset-scene-prompt"
                value={prompt}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setPrompt(
                    event.target.value,
                  )
                }
                rows={6}
                className="mt-2 w-full resize-none rounded-3xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-200/45"
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300/80">
                  Primary model
                  <select
                    value={provider}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setProvider(
                        event.target
                          .value as ProviderChoice,
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/45"
                  >
                    <option value="deepseek">
                      DeepSeek V4 Pro
                    </option>
                    <option value="glm">
                      GLM-5.2
                    </option>
                  </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300/80">
                  Fallback
                  <select
                    value={
                      fallbackProvider
                    }
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setFallbackProvider(
                        event.target
                          .value as FallbackChoice,
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-200/45"
                  >
                    <option value="none">
                      No fallback
                    </option>
                    <option value="deepseek">
                      DeepSeek V4 Pro
                    </option>
                    <option value="glm">
                      GLM-5.2
                    </option>
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-3 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Planning asset scene…"
                  : "Generate asset scene"}
              </button>
            </form>

            {error ? (
              <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="mt-auto rounded-3xl border border-cyan-200/15 bg-cyan-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/80">
                Asset-first contract
              </p>
              <p className="mt-2 text-sm leading-6 text-cyan-50/80">
                Layout proxies are never
                visible. A requested object
                appears only when a verified
                library asset or current
                TRELLIS preview exists.
              </p>
            </div>
          </aside>

          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                  3D asset scene
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  {plan?.scene_title ??
                    "Waiting for a build request"}
                </h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setShowLabels(
                      event.target.checked,
                    )
                  }
                  className="h-4 w-4 rounded border-white/20 bg-black"
                />
                Labels
              </label>
            </div>
            <div className="h-[640px] min-h-[58vh]">
              {plan ? (
                <AssetScene
                  plan={plan}
                  sceneGraph={
                    result?.scene_graph
                  }
                  activeStep={activeStep}
                  showLabels={showLabels}
                  assetBindings={
                    resolvedBindings
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_34%)] p-8 text-center">
                  <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur-xl">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">
                      Empty asset scene
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">
                      Send a prompt to resolve
                      scene assets
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-zinc-300/78">
                      Objects unavailable in
                      the reviewed library stay
                      missing until you generate
                      or add an asset.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl">
            {plan ? (
              <>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">
                    Scene plan
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {plan.scene_title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-zinc-200/76">
                    {plan.scene_summary}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/24 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300/70">
                      Active beat
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-zinc-300">
                      {activeStep}/
                      {Math.max(
                        1,
                        plan.beats.length,
                      )}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">
                    {currentBeat?.title ??
                      "Asset scene"}
                  </h3>
                  <p className="mt-3 text-xs font-semibold text-cyan-100/70">
                    {resolvedBindings.length} in
                    scene ·{" "}
                    {missingRequirements.length}{" "}
                    missing
                  </p>
                </div>

                <div className="grid gap-2 overflow-auto pr-1">
                  {plan.beats.map(
                    (beat, index) => {
                      const step = index + 1;

                      return (
                        <button
                          key={beat.id}
                          type="button"
                          onClick={() =>
                            setActiveStep(
                              clampStep(
                                step,
                                plan,
                              ),
                            )
                          }
                          className={`rounded-2xl border p-3 text-left transition ${beatButtonTone(
                            step ===
                              activeStep,
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold">
                              {beat.title}
                            </p>
                            <span className="text-xs opacity-70">
                              {step}
                            </span>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStep(
                        (step) =>
                          clampStep(
                            step - 1,
                            plan,
                          ),
                      )
                    }
                    className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStep(
                        (step) =>
                          clampStep(
                            step + 1,
                            plan,
                          ),
                      )
                    }
                    className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
                  >
                    Next
                  </button>
                </div>

                <div className="rounded-3xl border border-cyan-200/20 bg-cyan-300/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/75">
                      Asset requirements
                    </p>
                    <span className="rounded-full border border-cyan-100/15 bg-cyan-100/[0.06] px-2 py-1 text-xs text-cyan-50/80">
                      {
                        resolvedBindings.length
                      }{" "}
                      in scene ·{" "}
                      {
                        missingRequirements.length
                      }{" "}
                      missing
                    </span>
                  </div>

                  {assetRequirements.length ? (
                    <div className="mt-3 grid gap-2">
                      {assetRequirements.map(
                        (requirement) => {
                          const binding =
                            resolvedBindings.find(
                              (candidate) =>
                                candidate.instance_id ===
                                requirement.instance_id,
                            );
                          const isLoading =
                            trellisLoadingIds.has(
                              requirement.instance_id,
                            );

                          return (
                            <div
                              className="rounded-2xl border border-white/10 bg-black/25 p-3"
                              key={
                                requirement.instance_id
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {
                                      requirement.concept
                                    }
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-zinc-300/75">
                                    {
                                      requirement.motion_role
                                    }
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
                                    binding
                                      ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
                                      : "border-amber-200/25 bg-amber-300/10 text-amber-100"
                                  }`}
                                >
                                  {binding
                                    ? binding.preview_only
                                      ? "TRELLIS preview"
                                      : "in scene"
                                    : "missing from scene"}
                                </span>
                              </div>

                              <p className="mt-2 text-[11px] leading-5 text-cyan-50/60">
                                Placement:{" "}
                                {
                                  requirement.placement_relation
                                }
                                {requirement.placement_target_instance_id
                                  ? ` → ${requirement.placement_target_instance_id}`
                                  : ""}
                              </p>

                              {binding ? (
                                <div className="mt-3 rounded-xl border border-emerald-200/15 bg-emerald-300/[0.06] px-3 py-2 text-[11px] leading-5 text-emerald-50/80">
                                  <p className="font-semibold">
                                    {
                                      binding.asset_id
                                    }
                                  </p>
                                  <p>
                                    {
                                      binding.source_type
                                    }
                                    {binding.public_path.startsWith(
                                      "http",
                                    )
                                      ? " · Cloudflare R2"
                                      : " · local library"}
                                    {binding.match_score !=
                                    null
                                      ? ` · match ${binding.match_score.toFixed(
                                          1,
                                        )}`
                                      : ""}
                                    {binding.match_margin !=
                                    null
                                      ? ` · margin ${binding.match_margin.toFixed(
                                          1,
                                        )}`
                                      : ""}
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isLoading
                                    }
                                    onClick={() =>
                                      void generateWithTrellis(
                                        requirement,
                                      )
                                    }
                                    className="rounded-xl border border-violet-200/25 bg-violet-300/10 px-3 py-2 text-[11px] font-semibold text-violet-50 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isLoading
                                      ? "Generating…"
                                      : "Generate with TRELLIS"}
                                  </button>
                                  <a
                                    href="/sandbox/probe-lab/asset-library"
                                    className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-[11px] font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
                                  >
                                    Open Asset Library
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-zinc-300/72">
                      No physical asset
                      requirements were produced
                      for this request.
                    </p>
                  )}

                  <p className="mt-3 text-[11px] leading-5 text-cyan-50/60">
                    Missing objects are not
                    replaced with primitives.
                    TRELLIS previews can enter
                    this scene immediately but
                    remain pending for future
                    automatic reuse.
                  </p>
                </div>

                {warnings.length ? (
                  <div className="rounded-3xl border border-amber-200/20 bg-amber-300/[0.07] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-100/75">
                      Warnings
                    </p>
                    <div className="mt-3 grid gap-2 text-xs leading-5 text-amber-50/80">
                      {warnings.map(
                        (warning) => (
                          <p key={warning}>
                            {warning}
                          </p>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-white/10 bg-black/24 p-4 text-xs leading-5 text-zinc-300/75">
                  <p className="font-semibold text-white">
                    Model run
                  </p>
                  <p className="mt-2">
                    Primary:{" "}
                    {providerLabel(
                      result?.provider_requested,
                    )}
                  </p>
                  <p>
                    Used:{" "}
                    {providerLabel(
                      result?.provider_used,
                    )}
                  </p>
                  <p>
                    Parse:{" "}
                    {result?.parse_ok === false
                      ? "failed"
                      : "ok"}
                  </p>
                  {result?.duration_ms !=
                  null ? (
                    <p>
                      Duration:{" "}
                      {Math.round(
                        result.duration_ms /
                          1000,
                      )}
                      s
                    </p>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-emerald-200/20 bg-emerald-300/[0.06] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100/75">
                    Saved scenes
                  </p>
                  <input
                    value={sceneName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSceneName(
                        event.target.value,
                      )
                    }
                    placeholder={
                      plan.scene_title
                    }
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void saveCurrentScene()
                    }
                    className="mt-2 w-full rounded-xl border border-emerald-200/25 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-300/15"
                  >
                    Save current asset scene
                  </button>
                  {sceneMessage ? (
                    <p className="mt-2 text-xs leading-5 text-emerald-50/75">
                      {sceneMessage}
                    </p>
                  ) : null}
                  {savedScenes.length ? (
                    <div className="mt-3 grid max-h-48 gap-2 overflow-auto">
                      {savedScenes.map(
                        (scene) => (
                          <button
                            key={
                              scene.scene_id
                            }
                            type="button"
                            onClick={() =>
                              loadSavedScene(
                                scene,
                              )
                            }
                            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/[0.06]"
                          >
                            <span className="font-semibold text-white">
                              {
                                scene.title
                              }
                            </span>
                            <span className="mt-1 block text-zinc-400">
                              {
                                scene.assets
                                  .length
                              }{" "}
                              asset
                              {scene.assets
                                .length === 1
                                ? ""
                                : "s"}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm leading-7 text-zinc-300/75">
                Generate a request to inspect
                resolved and missing assets.
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
