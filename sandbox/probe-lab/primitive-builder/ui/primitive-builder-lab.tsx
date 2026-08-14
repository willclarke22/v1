"use client";

import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Html,
  OrbitControls,
} from "@react-three/drei";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DirectorMoment,
  EducationalSceneDirectorPlanV1,
  EducationalSceneDirectorValidationReport,
} from "@/sandbox/probe-lab/director";
import type {
  PrimitiveBeat,
  PrimitiveBuildPlanV1,
  PrimitivePart,
} from "../primitive-build-plan";
import type {
  PrimitiveBuilderAssetRequirement,
} from "../asset-requirement-plan";
import {
  applyDirectorBlocking,
  DirectorShotCameraController,
  DirectorShotLightingRig,
  ResolvedAssetModel,
  sampleDirectorActorState,
  solveResolvedAssetLayout,
  validateDirectorShot,
  type DirectorRuntimeActor,
  type ResolvedAssetRuntimeMetrics,
  type ResolvedPlacementDiagnostic,
} from "@/sandbox/probe-lab/scenes/ui";
import type {
  PrimitiveBuilderSceneAssetResolution,
  ResolvedSceneAssetBinding,
} from "@/sandbox/probe-lab/scenes/resolved-scene";
import {
  extractResourcePlanFromLabResult,
  LabSceneRuntimePanel,
} from "@/sandbox/probe-lab/scene-resources/ui";

type Vec3 = [number, number, number];

type RuntimeAssetDiagnostic = {
  world_size: Vec3;
  source_size: Vec3;
  support_surface_count: number;
  containment_region_count: number;
  attachment_region_count: number;
  geometry_confidence: number;
  placement_status: ResolvedPlacementDiagnostic["status"];
  placement_reason: string | null;
  placement_messages: string[];
  collisions: string[];
  placement: {
    target_instance_id: string;
    surface_id: string;
    surface_label: string;
    surface_source: string;
    surface_confidence: number;
    surface_size: [number, number];
    usable_surface_size: [number, number];
    is_primary: boolean;
    exposure: string;
    openness: string;
    clearance_above_m: number | null;
  } | null;
};
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
  director_plan?: EducationalSceneDirectorPlanV1 | null;
  director_validation?: EducationalSceneDirectorValidationReport | null;
  primitive_plan?: PrimitiveBuildPlanV1 | null;
  asset_requirements?: GeneratedAssetRequirement[];
  unresolved_requirements?: GeneratedAssetRequirement[];
  camera?: Record<string, unknown>;
  lights?: Record<string, unknown>;
  timeline?: unknown[];
  created_at: string;
  updated_at: string;
};


type MissingAssetAcquisitionJob = {
  job_id: string;
  concept_key: string;
  requirement_key?: string;
  concept: string;
  appearance_request?: {
    visual_brief: string;
    required_traits: string[];
    preferred_traits: string[];
    avoid_traits: string[];
  };
  status:
    | "missing"
    | "searching_blenderkit"
    | "generating_trellis"
    | "awaiting_review"
    | "approved"
    | "unavailable";
  active_provider:
    | "blenderkit"
    | "trellis"
    | null;
  current_candidate_asset_id:
    | string
    | null;
  linked_scene_count: number;
  refresh_ready: boolean;
  last_error: string | null;
  scene_references: Array<{
    scene_session_id: string;
    scene_id?: string | null;
    requirement_instance_ids: string[];
  }>;
};

type GenerateResponse = {
  ok: boolean;
  plan: PrimitiveBuildPlanV1;
  scene_session_id?: string;
  acquisition_jobs?: MissingAssetAcquisitionJob[];
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
  director_plan?: EducationalSceneDirectorPlanV1 | null;
  director_validation?: EducationalSceneDirectorValidationReport | null;
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

function normalizeConceptKey(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

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
      right.support_surfaces.length ||
    left.interior_volumes.length !==
      right.interior_volumes.length ||
    left.attachment_regions.length !==
      right.attachment_regions.length ||
    Math.abs(
      left.geometry_confidence -
        right.geometry_confidence,
    ) > 0.0001
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

function SceneBoundsGate({
  directed,
  children,
}: {
  directed: boolean;
  children: ReactNode;
}) {
  if (directed) return <>{children}</>;
  return (
    <Bounds fit clip observe margin={1.25}>
      {children}
    </Bounds>
  );
}

function AssetScene({
  plan,
  sceneGraph,
  activeStep,
  directorMoment,
  showLabels,
  assetBindings,
  onRuntimeDiagnostics,
}: {
  plan: PrimitiveBuildPlanV1;
  sceneGraph: unknown;
  activeStep: number;
  directorMoment?: DirectorMoment | null;
  showLabels: boolean;
  assetBindings: ResolvedSceneAssetBinding[];
  onRuntimeDiagnostics: (
    diagnostics: Map<
      string,
      RuntimeAssetDiagnostic
    >,
  ) => void;
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
  const stagedBaseAssetPositions = useMemo(() => {
    if (!directorMoment) return baseAssetPositions;
    const actors: DirectorRuntimeActor[] = assetBindings.map((binding) => {
      const base = baseAssetPositions.get(binding.instance_id) ?? binding.position;
      const metrics = assetMetrics.get(binding.instance_id);
      const extent = Math.max(0.1, binding.target_extent_m);
      return {
        id: binding.instance_id,
        position: [...base] as Vec3,
        rotation: [...binding.rotation] as Vec3,
        size: metrics?.world_size ?? [extent, extent, extent],
        directability: binding.directability_profile ?? null,
      };
    });
    const staged = applyDirectorBlocking(directorMoment, actors, { cinematic_only: true });
    return new Map(
      staged.map((actor) => [actor.id, [...actor.position] as Vec3]),
    );
  }, [
    assetBindings,
    assetMetrics,
    baseAssetPositions,
    directorMoment,
  ]);
  const solvedLayout = useMemo(
    () =>
      solveResolvedAssetLayout({
        bindings: assetBindings,
        basePositions: stagedBaseAssetPositions,
        metrics: assetMetrics,
      }),
    [
      assetBindings,
      assetMetrics,
      stagedBaseAssetPositions,
    ],
  );
  const renderableAssetBindings =
    visibleAssetBindings.filter(
      (binding) =>
        !solvedLayout.all_metrics_ready ||
        !solvedLayout.unresolved_ids.has(
          binding.instance_id,
        ),
    );

  const directorActors = useMemo<DirectorRuntimeActor[]>(
    () =>
      renderableAssetBindings.map((binding) => {
        const position =
          solvedLayout.positions.get(binding.instance_id) ??
          binding.position;
        const metrics = assetMetrics.get(binding.instance_id);
        const extent = Math.max(0.1, binding.target_extent_m);
        return {
          id: binding.instance_id,
          position: [...position] as Vec3,
          rotation: [...binding.rotation] as Vec3,
          size: metrics?.world_size ?? [extent, extent, extent],
          directability: binding.directability_profile ?? null,
        };
      }),
    [
      assetMetrics,
      renderableAssetBindings,
      solvedLayout.positions,
    ],
  );
  const directorShotValidation = useMemo(
    () =>
      directorMoment && directorActors.length > 0
        ? validateDirectorShot(directorMoment, directorActors)
        : null,
    [directorActors, directorMoment],
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

  useEffect(() => {
    const diagnostics = new Map<
      string,
      RuntimeAssetDiagnostic
    >();

    for (const binding of assetBindings) {
      const metrics = assetMetrics.get(
        binding.instance_id,
      );
      if (!metrics) continue;

      const placement =
        solvedLayout.surface_placements.get(
          binding.instance_id,
        );
      const placementDiagnostic =
        solvedLayout.placement_diagnostics.get(
          binding.instance_id,
        );
      diagnostics.set(
        binding.instance_id,
        {
          world_size: metrics.world_size,
          source_size: metrics.source_size,
          support_surface_count:
            metrics.support_surfaces.length,
          containment_region_count:
            metrics.interior_volumes.length,
          attachment_region_count:
            metrics.attachment_regions.length,
          geometry_confidence:
            metrics.geometry_confidence,
          placement_status:
            placementDiagnostic?.status ??
            "provisional",
          placement_reason:
            placementDiagnostic?.reason ?? null,
          placement_messages:
            placementDiagnostic?.messages ?? [],
          collisions:
            placementDiagnostic?.collisions ?? [],
          placement: placement
            ? {
                target_instance_id:
                  placement.target_instance_id,
                surface_id:
                  placement.surface.id,
                surface_label:
                  placement.surface.label,
                surface_source:
                  placement.surface.source,
                surface_confidence:
                  placement.surface.confidence,
                surface_size:
                  placement.surface.size,
                usable_surface_size:
                  placement.surface.usable_size,
                exposure:
                  placement.surface.exposure,
                openness:
                  placement.surface.openness,
                clearance_above_m:
                  placement.surface.clearance_above_m,
                is_primary:
                  placement.surface.is_primary,
              }
            : null,
        },
      );
    }

    onRuntimeDiagnostics(diagnostics);
  }, [
    assetBindings,
    assetMetrics,
    onRuntimeDiagnostics,
    solvedLayout.surface_placements,
    solvedLayout.placement_diagnostics,
  ]);

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
        {directorMoment && directorActors.length > 0 ? (
          <DirectorShotLightingRig
            moment={directorMoment}
            actors={directorActors}
            autoLoop
          />
        ) : (
          <>
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
          </>
        )}

        <SceneBoundsGate directed={Boolean(directorMoment)}>
          <group rotation={[0, directorMoment ? 0 : -0.35, 0]}>
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

            {renderableAssetBindings.map(
              (binding) => {
                const position =
                  solvedLayout.positions.get(
                    binding.instance_id,
                  ) ?? binding.position;
                const metrics =
                  assetMetrics.get(
                    binding.instance_id,
                  );
                const directorActor =
                  directorActors.find(
                    (candidate) =>
                      candidate.id ===
                      binding.instance_id,
                  ) ?? null;
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
                        runtimeMotion={
                          directorMoment &&
                          directorActor
                            ? {
                                duration_ms:
                                  directorMoment.duration_ms,
                                loop: true,
                                sample: (progress) => {
                                  const sampled =
                                    sampleDirectorActorState(
                                      directorMoment,
                                      directorActor,
                                      progress,
                                      directorActors,
                                    );
                                  return {
                                    position: [
                                      sampled.position.x,
                                      sampled.position.y,
                                      sampled.position.z,
                                    ],
                                    rotation: [
                                      sampled.rotation.x,
                                      sampled.rotation.y,
                                      sampled.rotation.z,
                                    ],
                                    scale_multiplier: [
                                      sampled.scale.x,
                                      sampled.scale.y,
                                      sampled.scale.z,
                                    ],
                                  };
                                },
                              }
                            : undefined
                        }
                      />
                    </Suspense>
                    {showLabels &&
                    !directorMoment &&
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
        </SceneBoundsGate>

        {directorMoment && directorActors.length > 0 ? (
          <DirectorShotCameraController
            moment={directorMoment}
            actors={directorActors}
            autoLoop
          />
        ) : null}

        <gridHelper
          args={[
            9,
            18,
            "#334155",
            "#1e293b",
          ]}
          position={[0, -0.04, 0]}
        />
        {!directorMoment ? (
          <OrbitControls
            enableDamping
            makeDefault
          />
        ) : null}
      </Canvas>

      {directorMoment && directorShotValidation ? (
        <div className="pointer-events-none absolute right-3 top-3 z-10 grid gap-1 rounded-2xl border border-cyan-200/20 bg-slate-950/82 px-3 py-2 text-[10px] font-semibold text-cyan-50/80 shadow-2xl backdrop-blur">
          <span className="font-black uppercase tracking-[0.12em] text-cyan-200">Director V2 live</span>
          <span>Camera path: {directorShotValidation.camera_path_clear ? "clear" : "review"}</span>
          <span>Required visible: {Math.round(directorShotValidation.required_visible_fraction * 100)}%</span>
          <span>Approx. occlusion: {Math.round(directorShotValidation.approximate_occlusion_ratio * 100)}%</span>
          <span>Motion overlap: {Math.round(directorShotValidation.approximate_actor_collision_ratio * 100)}%</span>
        </div>
      ) : null}

      {renderableAssetBindings.length === 0 &&
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
  const [savedScenes, setSavedScenes] =
    useState<
      SavedPrimitiveBuilderScene[]
    >([]);
  const [sceneName, setSceneName] =
    useState("");
  const [sceneMessage, setSceneMessage] =
    useState<string | null>(null);
  const [
    acquisitionJobs,
    setAcquisitionJobs,
  ] = useState<
    MissingAssetAcquisitionJob[]
  >([]);
  const [
    refreshingMissingAssets,
    setRefreshingMissingAssets,
  ] = useState(false);
  const [savedSceneId, setSavedSceneId] =
    useState<string | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] =
    useState<
      Map<string, RuntimeAssetDiagnostic>
    >(() => new Map());
  const acquisitionPollInFlight =
    useRef(false);

  const handleRuntimeDiagnostics =
    useCallback(
      (
        diagnostics: Map<
          string,
          RuntimeAssetDiagnostic
        >,
      ) => {
        setRuntimeDiagnostics(diagnostics);
      },
      [],
    );

  const plan = result?.plan ?? null;
  const directorPlan =
    result?.director_plan ?? null;
  const directorValidation =
    result?.director_validation ?? null;
  const sharedResourcePlan =
    extractResourcePlanFromLabResult(
      result,
    );
  const sharedPrimitiveNodes =
    (
      result?.scene_graph as
        | {
            nodes?: unknown;
          }
        | undefined
    )?.nodes;
  const currentBeat = plan
    ? plan.beats[activeStep - 1] ??
      plan.beats[0]
    : null;
  const assetRequirements =
    result?.asset_requirements ?? [];
  const resolvedBindings =
    result?.asset_resolution?.bindings ??
    [];
  const missingRequirements =
    assetRequirements.filter(
      (requirement) =>
        !resolvedBindings.some(
          (binding) =>
            binding.instance_id ===
            requirement.instance_id,
        ),
    );
  const acquisitionJobByRequirementId =
    useMemo(() => {
      const map = new Map<
        string,
        MissingAssetAcquisitionJob
      >();
      const sessionId =
        result?.scene_session_id ??
        savedSceneId;

      for (const job of acquisitionJobs) {
        for (const reference of
          job.scene_references) {
          if (
            sessionId &&
            reference.scene_session_id !==
              sessionId &&
            reference.scene_id !==
              sessionId
          ) {
            continue;
          }

          for (const instanceId of
            reference.requirement_instance_ids) {
            map.set(instanceId, job);
          }
        }
      }

      for (const requirement of
        missingRequirements) {
        if (
          !map.has(requirement.instance_id)
        ) {
          const conceptKey =
            normalizeConceptKey(
              requirement.concept,
            );
          const fallbackJob =
            acquisitionJobs.find(
              (job) =>
                job.concept_key ===
                conceptKey,
            );
          if (fallbackJob) {
            map.set(
              requirement.instance_id,
              fallbackJob,
            );
          }
        }
      }

      return map;
    }, [
      acquisitionJobs,
      missingRequirements,
      result?.scene_session_id,
      savedSceneId,
    ]);
  const refreshReadyCount =
    missingRequirements.filter(
      (requirement) =>
        acquisitionJobByRequirementId.get(
          requirement.instance_id,
        )?.status === "approved",
    ).length;
  const hasAcquiringMissingAssets =
    missingRequirements.some((requirement) => {
      const status =
        acquisitionJobByRequirementId.get(
          requirement.instance_id,
        )?.status;
      return (
        status === "missing" ||
        status ===
          "searching_blenderkit" ||
        status ===
          "generating_trellis"
      );
    });
  const hasAwaitingReviewMissingAssets =
    missingRequirements.some(
      (requirement) =>
        acquisitionJobByRequirementId.get(
          requirement.instance_id,
        )?.status ===
        "awaiting_review",
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

  async function refreshAcquisitionJobs(
    sceneSessionId:
      | string
      | null
      | undefined,
    options: {
      silent?: boolean;
    } = {},
  ) {
    if (!sceneSessionId) {
      setAcquisitionJobs([]);
      return;
    }

    if (
      acquisitionPollInFlight.current
    ) {
      return;
    }

    acquisitionPollInFlight.current =
      true;
    try {
      const response = await fetch(
        `/api/sandbox/probe-lab/assets/acquisition?scene_session_id=${encodeURIComponent(
          sceneSessionId,
        )}&summary=1`,
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
            : `Acquisition status failed with ${response.status}`,
        );
      }

      setAcquisitionJobs(
        Array.isArray(json.jobs)
          ? (json.jobs as MissingAssetAcquisitionJob[])
          : [],
      );
    } catch (caught) {
      if (!options.silent) {
        setSceneMessage(
          `Missing-asset status could not be refreshed: ${
            caught instanceof Error
              ? caught.message
              : String(caught)
          }`,
        );
      }
    } finally {
      acquisitionPollInFlight.current =
        false;
    }
  }

  const activeAcquisitionPolling =
    acquisitionJobs.some(
      (job) =>
        job.status ===
          "searching_blenderkit" ||
        job.status ===
          "generating_trellis",
    );

  useEffect(() => {
    const sceneSessionId =
      result?.scene_session_id ??
      savedSceneId;

    if (
      !sceneSessionId ||
      !missingRequirements.length
    ) {
      return;
    }

    void refreshAcquisitionJobs(
      sceneSessionId,
      { silent: true },
    );
  }, [
    missingRequirements.length,
    result?.scene_session_id,
    savedSceneId,
  ]);

  useEffect(() => {
    const sceneSessionId =
      result?.scene_session_id ??
      savedSceneId;

    if (
      !sceneSessionId ||
      !missingRequirements.length ||
      !activeAcquisitionPolling
    ) {
      return;
    }

    const poll = () => {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      void refreshAcquisitionJobs(
        sceneSessionId,
        { silent: true },
      );
    };

    const interval =
      window.setInterval(
        poll,
        8_000,
      );
    const onVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        poll();
      }
    };
    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );

    return () => {
      window.clearInterval(
        interval,
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );
    };
  }, [
    activeAcquisitionPolling,
    missingRequirements.length,
    result?.scene_session_id,
    savedSceneId,
  ]);

  useEffect(() => {
    const sceneSessionId =
      result?.scene_session_id ??
      savedSceneId;

    if (
      !sceneSessionId ||
      !missingRequirements.length
    ) {
      return;
    }

    const refreshOnFocus = () => {
      void refreshAcquisitionJobs(
        sceneSessionId,
        { silent: true },
      );
    };

    window.addEventListener(
      "focus",
      refreshOnFocus,
    );
    return () =>
      window.removeEventListener(
        "focus",
        refreshOnFocus,
      );
  }, [
    missingRequirements.length,
    result?.scene_session_id,
    savedSceneId,
  ]);

  async function refreshMissingAssets() {
    if (
      !result?.scene_graph ||
      refreshingMissingAssets ||
      missingRequirements.length < 1
    ) {
      return;
    }

    setRefreshingMissingAssets(true);
    setError(null);
    setSceneMessage(
      "Refreshing approved missing assets without regenerating the scene…",
    );

    try {
      const response = await fetch(
        "/api/sandbox/probe-lab/primitive-builder/refresh-assets",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            scene_id: savedSceneId,
            saved:
              Boolean(savedSceneId),
            scene_session_id:
              result.scene_session_id ??
              savedSceneId,
            scene_graph:
              result.scene_graph,
          }),
        },
      );
      const json =
        await readJsonResponse(response);

      if (
        !response.ok ||
        json.ok !== true ||
        !json.resolution
      ) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : `Missing-asset refresh failed with ${response.status}`,
        );
      }

      const resolution =
        json.resolution as PrimitiveBuilderSceneAssetResolution;

      setResult((current) =>
        current
          ? {
              ...current,
              asset_resolution:
                resolution,
            }
          : current,
      );
      setAcquisitionJobs(
        Array.isArray(
          json.acquisition_jobs,
        )
          ? (json.acquisition_jobs as MissingAssetAcquisitionJob[])
          : acquisitionJobs,
      );

      if (json.scene) {
        await refreshSavedScenes();
      }

      const unresolvedReasons =
        (resolution.unresolved_diagnostics ?? [])
          .map(
            (diagnostic) =>
              `${diagnostic.concept}: ${diagnostic.reason}`,
          )
          .slice(0, 3);
      setSceneMessage(
        `Refreshed ${resolution.bindings.length} approved asset binding(s). ${resolution.unresolved_requirements.length} requirement(s) remain missing.${
          unresolvedReasons.length
            ? ` ${unresolvedReasons.join(" ")}`
            : ""
        }`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : String(caught),
      );
    } finally {
      setRefreshingMissingAssets(false);
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
            scene_id:
              savedSceneId ??
              result.scene_session_id ??
              title,
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
            director_plan:
              result.director_plan ?? null,
            director_validation:
              result.director_validation ?? null,
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
      if (
        json.scene &&
        typeof (
          json.scene as Record<
            string,
            unknown
          >
        ).scene_id === "string"
      ) {
        setSavedSceneId(
          String(
            (
              json.scene as Record<
                string,
                unknown
              >
            ).scene_id,
          ),
        );
      }
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
    setSavedSceneId(scene.scene_id);
    setAcquisitionJobs([]);
    setResult({
      ok: true,
      plan: loadedPlan,
      scene_session_id:
        scene.scene_id,
      scene_graph: scene.scene_graph,
      director_plan:
        scene.director_plan ?? null,
      director_validation:
        scene.director_validation ?? null,
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

      const generated =
        json as unknown as GenerateResponse;
      setResult(generated);
      setAcquisitionJobs(
        generated.acquisition_jobs ?? [],
      );
      setSavedSceneId(null);
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
                  directorMoment={
                    directorPlan?.moments[activeStep - 1] ??
                    directorPlan?.moments[0] ??
                    null
                  }
                  showLabels={showLabels}
                  assetBindings={
                    resolvedBindings
                  }
                  onRuntimeDiagnostics={
                    handleRuntimeDiagnostics
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

                  {missingRequirements.length ? (
                    <button
                      type="button"
                      disabled={
                        refreshingMissingAssets
                      }
                      onClick={() => {
                        void refreshMissingAssets();
                      }}
                      className={`mt-3 w-full rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        refreshReadyCount > 0
                          ? "border-emerald-200/35 bg-emerald-300/14 text-emerald-50 hover:bg-emerald-300/20"
                          : "border-amber-200/20 bg-amber-300/[0.07] text-amber-50/85 hover:bg-amber-300/[0.12]"
                      }`}
                    >
                      {refreshingMissingAssets
                        ? "Checking missing assets…"
                        : refreshReadyCount > 0
                          ? `Refresh missing assets (${refreshReadyCount})`
                          : hasAcquiringMissingAssets
                            ? "Check acquisition progress"
                            : hasAwaitingReviewMissingAssets
                              ? "Check why assets are awaiting review"
                              : "Check why assets are still missing"}
                    </button>
                  ) : null}

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
                          const acquisitionJob =
                            acquisitionJobByRequirementId.get(
                              requirement.instance_id,
                            );
                          const acquisitionStatus =
                            acquisitionJob?.status.replaceAll(
                              "_",
                              " ",
                            );
                          const runtimeDiagnostic =
                            runtimeDiagnostics.get(
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
                                    : acquisitionStatus ??
                                      "missing from scene"}
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
                              <p
                                className="mt-1 text-[11px] leading-5 text-sky-100/65"
                                title={
                                  binding?.size_policy?.reason
                                }
                              >
                                Logical size:{" "}
                                {requirement.target_extent_m.toFixed(
                                  2,
                                )}{" "}
                                m longest dimension
                                {binding?.size_policy
                                  ? ` · ${binding.size_policy.source.replaceAll(
                                      "_",
                                      " ",
                                    )}`
                                  : ""}
                              </p>
                              {runtimeDiagnostic ? (
                                <>
                                  <p className="mt-1 text-[11px] leading-5 text-emerald-100/70">
                                    Actual world size:{" "}
                                    {runtimeDiagnostic.world_size
                                      .map((value) => value.toFixed(3))
                                      .join(" × ")}{" "}
                                    m
                                  </p>
                                  <p className="mt-1 text-[11px] leading-5 text-amber-100/70">
                                    {runtimeDiagnostic.placement
                                      ? `Selected region: ${
                                          runtimeDiagnostic.placement.surface_label
                                        } · ${Math.round(
                                          runtimeDiagnostic.placement.surface_confidence * 100,
                                        )}% ${
                                          runtimeDiagnostic.placement.surface_source
                                        } · ${runtimeDiagnostic.placement.exposure} · ${runtimeDiagnostic.placement.openness} · usable ${runtimeDiagnostic.placement.usable_surface_size
                                          .map((value) => value.toFixed(2))
                                          .join(" × ")} m${
                                          runtimeDiagnostic.placement.clearance_above_m == null
                                            ? " · open clearance"
                                            : ` · ${runtimeDiagnostic.placement.clearance_above_m.toFixed(2)} m clearance above`
                                        }${
                                          runtimeDiagnostic.placement.is_primary
                                            ? " · primary"
                                            : ""
                                        }`
                                      : `Spatial regions: ${runtimeDiagnostic.support_surface_count} support · ${runtimeDiagnostic.containment_region_count} containment · ${runtimeDiagnostic.attachment_region_count} attachment`}
                                  </p>
                                  <p
                                    className={`mt-1 text-[11px] leading-5 ${
                                      runtimeDiagnostic.placement_status === "unresolved"
                                        ? "text-rose-200/85"
                                        : runtimeDiagnostic.placement_status === "adjusted"
                                          ? "text-sky-200/80"
                                          : "text-zinc-300/65"
                                    }`}
                                  >
                                    Placement status: {runtimeDiagnostic.placement_status.replaceAll("_", " ")}
                                    {runtimeDiagnostic.placement_reason
                                      ? ` · ${runtimeDiagnostic.placement_reason.replaceAll("_", " ")}`
                                      : ""}
                                    {runtimeDiagnostic.collisions.length
                                      ? ` · collision with ${runtimeDiagnostic.collisions.join(", ")}`
                                      : ""}
                                  </p>
                                  {runtimeDiagnostic.placement_messages.length ? (
                                    <p className="mt-1 text-[11px] leading-5 text-rose-100/65">
                                      {runtimeDiagnostic.placement_messages.join(" ")}
                                    </p>
                                  ) : null}
                                </>
                              ) : null}

                              {requirement.appearance_request ? (
                                <div className="mt-2 rounded-xl border border-violet-200/10 bg-violet-300/[0.045] px-3 py-2 text-[11px] leading-5 text-violet-50/75">
                                  <p className="font-semibold text-violet-100">
                                    Desired appearance
                                  </p>
                                  {requirement.appearance_request
                                    .visual_brief ? (
                                    <p>
                                      {
                                        requirement
                                          .appearance_request
                                          .visual_brief
                                      }
                                    </p>
                                  ) : null}
                                  {requirement.appearance_request
                                    .required_traits.length ? (
                                    <p>
                                      Required:{" "}
                                      {requirement.appearance_request.required_traits.join(
                                        ", ",
                                      )}
                                    </p>
                                  ) : null}
                                  {requirement.appearance_request
                                    .preferred_traits.length ? (
                                    <p>
                                      Preferred:{" "}
                                      {requirement.appearance_request.preferred_traits.join(
                                        ", ",
                                      )}
                                    </p>
                                  ) : null}
                                  {requirement.appearance_request
                                    .avoid_traits.length ? (
                                    <p>
                                      Avoid:{" "}
                                      {requirement.appearance_request.avoid_traits.join(
                                        ", ",
                                      )}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

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
                                    {binding.appearance_similarity !=
                                    null
                                      ? ` · appearance ${Math.round(
                                          Math.max(
                                            0,
                                            Math.min(
                                              1,
                                              binding.appearance_similarity,
                                            ),
                                          ) * 100,
                                        )}%`
                                      : ""}
                                  </p>
                                  {binding.appearance_summary ? (
                                    <p className="mt-1 text-emerald-50/65">
                                      {
                                        binding.appearance_summary
                                      }
                                    </p>
                                  ) : null}
                                  {binding.appearance_trait_matches
                                    ?.length ? (
                                    <p className="mt-1 text-emerald-100/70">
                                      Appearance matched:{" "}
                                      {binding.appearance_trait_matches.join(
                                        ", ",
                                      )}
                                    </p>
                                  ) : null}
                                  {binding.appearance_ranking
                                    ?.requested &&
                                  !binding.appearance_ranking
                                    .used ? (
                                    <p className="mt-1 text-amber-100/70">
                                      Selected using identity and
                                      quality ranking.{" "}
                                      {
                                        binding
                                          .appearance_ranking
                                          .reason
                                      }
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-300/[0.055] px-3 py-2 text-[11px] leading-5 text-amber-50/80">
                                  <p>
                                    {acquisitionJob?.status ===
                                    "searching_blenderkit"
                                      ? "MyWay is searching BlendKit automatically."
                                      : acquisitionJob?.status ===
                                          "generating_trellis"
                                        ? "BlendKit did not produce an acceptable candidate, so TRELLIS is generating one."
                                        : acquisitionJob?.status ===
                                            "awaiting_review"
                                          ? "A candidate is ready in the Asset Library. Approve it, try another BlendKit asset, or generate with TRELLIS instead."
                                          : acquisitionJob?.status ===
                                              "approved"
                                            ? "An approved asset is ready. Use Refresh missing assets above."
                                            : acquisitionJob?.status ===
                                                "unavailable"
                                              ? "Acquisition needs attention in the Asset Library."
                                              : "MyWay queued this missing asset for automatic acquisition."}
                                  </p>
                                  {acquisitionJob?.last_error ? (
                                    <p className="mt-1 text-rose-100/75">
                                      {acquisitionJob.last_error}
                                    </p>
                                  ) : null}
                                  {result?.asset_resolution
                                    ?.unresolved_diagnostics
                                    ?.find(
                                      (diagnostic) =>
                                        diagnostic.instance_id ===
                                        requirement.instance_id,
                                    ) ? (
                                    <p className="mt-1 text-amber-100/75">
                                      {
                                        result.asset_resolution.unresolved_diagnostics.find(
                                          (diagnostic) =>
                                            diagnostic.instance_id ===
                                            requirement.instance_id,
                                        )?.reason
                                      }
                                    </p>
                                  ) : null}
                                  <a
                                    href="/sandbox/probe-lab/asset-library"
                                    className="mt-2 inline-flex rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 font-semibold text-zinc-100 transition hover:bg-white/[0.09]"
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
                    Missing objects are not replaced with primitives. MyWay
                    automatically searches BlendKit, falls back to TRELLIS
                    when needed, and waits for approval in the Asset Library.
                    Refreshing adds newly approved assets without another model
                    generation.
                  </p>
                </div>

                {directorPlan ? (
                  <div className="rounded-3xl border border-violet-200/20 bg-violet-300/[0.07] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-100/75">
                          Educational director
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {directorPlan.scene_thesis}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-50/70">
                        {directorValidation?.valid === false
                          ? "Needs review"
                          : "Direction ready"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] leading-5 text-violet-50/70">
                      <p>
                        Mode:{" "}
                        {directorPlan.representation_strategy.primary_mode.replaceAll(
                          "_",
                          " ",
                        )}
                      </p>
                      <p>
                        Moments:{" "}
                        {directorPlan.moments.length}
                      </p>
                      <p>
                        Events:{" "}
                        {directorValidation?.event_count ??
                          directorPlan.moments.reduce(
                            (count, moment) =>
                              count +
                              moment.events.length,
                            0,
                          )}
                      </p>
                      <p>
                        Text cues:{" "}
                        {directorValidation?.text_cue_count ??
                          directorPlan.moments.reduce(
                            (count, moment) =>
                              count +
                              moment.text_cues.length,
                            0,
                          )}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {directorPlan.moments
                        .slice(0, 6)
                        .map((moment, index) => (
                          <div
                            key={moment.id}
                            className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"
                          >
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-100/55">
                              Moment {index + 1}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-violet-50/90">
                              {moment.title}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-violet-50/60">
                              {moment.learning_job}
                            </p>
                          </div>
                        ))}
                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-violet-50/55">
                      This direction remains the source of truth when an actor
                      is missing. Asset resolution can bind a better GLB later
                      without asking the model to redesign the lesson.
                    </p>
                  </div>
                ) : null}

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

      <div className="mx-auto mt-6 w-full max-w-[1800px]">
        <LabSceneRuntimePanel
          source="primitive_builder"
          resourcePlan={sharedResourcePlan}
          primitiveNodes={sharedPrimitiveNodes}
          heading="Primitive Builder mixed primitive and reviewed-asset runtime"
        />
      </div>
    </main>
  );
}
