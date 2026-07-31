"use client";

import * as THREE from "three";

import {
  acquireRuntimeEnvironment,
  type RuntimeEnvironmentInstance,
} from "./browser-environment-runtime";
import {
  acquireRuntimeGlb,
  disposeRuntimeScene,
} from "./browser-glb-runtime";
import {
  acquireRuntimeMaterial,
  applyRuntimeMaterialToScene,
  disposeRuntimeMaterial,
} from "./browser-material-runtime";
import {
  validateRuntimeSceneBinding,
} from "./build-scene-runtime-binding";
import type {
  RuntimeSceneActorBindingV1,
  RuntimeSceneActorState,
  RuntimeSceneBindingV1,
  RuntimeSceneDiagnostics,
  RuntimeSceneState,
} from "./scene-runtime-contract";

export type RuntimeSceneProgressListener = (
  state: RuntimeSceneState,
) => void;

export type RuntimeSceneInstance = {
  group: THREE.Group;
  environment: RuntimeEnvironmentInstance | null;
  state: RuntimeSceneState;
  release: () => void;
};

function emptyActorState(
  actor: RuntimeSceneActorBindingV1,
): RuntimeSceneActorState {
  return {
    entity_id: actor.entity_id,
    asset_id: actor.model?.asset_id ?? null,
    phase: "idle",
    fallback_used: null,
    error: null,
    model_metrics: null,
    material_metrics: [],
    warnings: [],
  };
}

function publish(
  listener: RuntimeSceneProgressListener | undefined,
  state: RuntimeSceneState,
  updates: Partial<RuntimeSceneState>,
) {
  const next = {
    ...state,
    ...updates,
  } satisfies RuntimeSceneState;
  listener?.(next);
  return next;
}

function fitActor(
  group: THREE.Group,
  actor: RuntimeSceneActorBindingV1,
) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  const normalizedScale = 2.3 / largest;

  group.position.sub(center);
  group.scale.setScalar(
    normalizedScale * actor.transform.scale,
  );
  group.rotation.set(...actor.transform.rotation_radians);
  group.updateMatrixWorld(true);

  const fittedBounds = new THREE.Box3().setFromObject(group);
  group.position.y -= fittedBounds.min.y;
  group.position.x += actor.transform.position[0];
  group.position.y += actor.transform.position[1];
  group.position.z += actor.transform.position[2];
  group.name = `runtime_actor:${actor.entity_id}`;
  group.userData.myway_entity_id = actor.entity_id;
  group.userData.myway_intent_id = actor.intent_id;

  return group;
}

function fallbackProxy(
  actor: RuntimeSceneActorBindingV1,
  label: string,
) {
  const group = new THREE.Group();
  const geometry =
    actor.model?.fallback?.fallback_used === "abstract_proxy"
      ? new THREE.IcosahedronGeometry(0.9, 1)
      : new THREE.BoxGeometry(1.45, 1.45, 1.45);
  const material = new THREE.MeshStandardMaterial({
    color: "#f59e0b",
    roughness: 0.58,
    metalness: 0.04,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.75;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `fallback_proxy:${actor.entity_id}`;
  mesh.userData.fallback_label = label;
  group.add(mesh);
  group.position.set(...actor.transform.position);
  group.rotation.set(...actor.transform.rotation_radians);
  group.scale.setScalar(actor.transform.scale);
  group.name = `runtime_actor:${actor.entity_id}`;
  group.userData.myway_entity_id = actor.entity_id;
  group.userData.myway_fallback = true;
  return group;
}

function materialBindingsForActor(
  binding: RuntimeSceneBindingV1,
  actor: RuntimeSceneActorBindingV1,
) {
  const ids = new Set(actor.material_binding_ids);
  return binding.materials.filter((material) =>
    ids.has(material.material_binding_id),
  );
}

function isAbort(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

async function hydrateActor(
  sceneBinding: RuntimeSceneBindingV1,
  actor: RuntimeSceneActorBindingV1,
  options: {
    signal?: AbortSignal;
    verify_hash?: boolean;
    simulate_failure_entity_id?: string | null;
    on_actor_state?: (
      state: RuntimeSceneActorState,
    ) => void;
  },
) {
  const releases: Array<() => void> = [];
  let ownedScene: THREE.Group | null = null;
  let state = emptyActorState(actor);

  const update = (
    updates: Partial<RuntimeSceneActorState>,
  ) => {
    state = {
      ...state,
      ...updates,
    };
    options.on_actor_state?.(state);
  };

  try {
    update({ phase: "hydrating_model" });

    if (
      options.simulate_failure_entity_id === actor.entity_id
    ) {
      throw new Error(
        `Intentional Phase 2H actor failure for ${actor.entity_id}.`,
      );
    }

    if (!actor.model) {
      throw new Error(
        `No runtime model binding exists for ${actor.entity_id}.`,
      );
    }

    const model = await acquireRuntimeGlb(actor.model, {
      signal: options.signal,
      verify_hash: options.verify_hash,
    });
    releases.push(model.release);
    ownedScene = fitActor(model.scene, actor);
    update({
      model_metrics: model.metrics,
      phase: "applying_materials",
    });

    for (const materialBinding of materialBindingsForActor(
      sceneBinding,
      actor,
    )) {
      let acquired:
        | Awaited<ReturnType<typeof acquireRuntimeMaterial>>
        | null = null;
      try {
        acquired = await acquireRuntimeMaterial(
          materialBinding,
          {
            signal: options.signal,
          },
        );
        const application = applyRuntimeMaterialToScene(
          ownedScene,
          acquired.material,
          materialBinding,
        );
        acquired.metrics.applied_mesh_count =
          application.applied_mesh_count;
        acquired.metrics.applied_slot_count =
          application.applied_slot_count;
        acquired.metrics.application = application.application;
        releases.push(acquired.release);
        update({
          material_metrics: [
            ...state.material_metrics,
            acquired.metrics,
          ],
          warnings: [
            ...state.warnings,
            ...acquired.warnings,
            ...(application.warning
              ? [application.warning]
              : []),
          ],
        });
        acquired = null;
      } catch (error) {
        if (acquired) {
          disposeRuntimeMaterial(acquired.material);
          acquired.release();
        }
        if (isAbort(error)) throw error;
        if (
          sceneBinding.fallback_policy.missing_material ===
          "fail_scene"
        ) {
          throw error;
        }
        update({
          fallback_used:
            state.fallback_used ?? "preserve_original_material",
          warnings: [
            ...state.warnings,
            `${materialBinding.material_resource_id}: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          ],
        });
      }
    }

    update({ phase: "ready" });

    return {
      object: ownedScene,
      state,
      releases,
    };
  } catch (error) {
    if (isAbort(error)) {
      if (ownedScene) disposeRuntimeScene(ownedScene);
      [...releases].reverse().forEach((release) => release());
      throw error;
    }

    if (
      sceneBinding.fallback_policy.missing_model ===
      "fail_scene" &&
      actor.required
    ) {
      if (ownedScene) disposeRuntimeScene(ownedScene);
      [...releases].reverse().forEach((release) => release());
      throw error;
    }

    if (ownedScene) disposeRuntimeScene(ownedScene);
    [...releases].reverse().forEach((release) => release());

    const reason =
      error instanceof Error ? error.message : String(error);
    const object = fallbackProxy(
      actor,
      actor.fallback_label ?? reason,
    );
    state = {
      ...state,
      phase: "fallback",
      fallback_used:
        sceneBinding.fallback_policy.missing_model,
      error: reason,
      warnings: [...state.warnings, reason],
    };
    options.on_actor_state?.(state);

    return {
      object,
      state,
      releases: [] as Array<() => void>,
    };
  }
}

export async function acquireRuntimeScene(
  binding: RuntimeSceneBindingV1,
  renderer: THREE.WebGLRenderer,
  options: {
    signal?: AbortSignal;
    verify_hash?: boolean;
    simulate_failure_entity_id?: string | null;
    on_progress?: RuntimeSceneProgressListener;
  } = {},
): Promise<RuntimeSceneInstance> {
  const validation = validateRuntimeSceneBinding(binding);
  if (!validation.valid) {
    throw new Error(
      `Runtime scene binding is invalid: ${validation.issues.join(
        "; ",
      )}`,
    );
  }

  const startedAt = performance.now();
  let state: RuntimeSceneState = {
    phase: "idle",
    scene_id: binding.scene_id,
    models_ready: 0,
    materials_ready: 0,
    environment_ready: false,
    actor_states: binding.actors.map(emptyActorState),
    fallbacks_active: [],
    warnings: [...binding.warnings],
    error: null,
    diagnostics: null,
  };
  const group = new THREE.Group();
  group.name = `runtime_scene:${binding.scene_id}`;
  group.userData.myway_scene_id = binding.scene_id;

  let environment: RuntimeEnvironmentInstance | null = null;
  const environmentStartedAt = performance.now();
  const fallbackRecords:
    RuntimeSceneDiagnostics["fallback_records"] = [];

  state = publish(options.on_progress, state, {
    phase: "hydrating_environment",
  });

  if (
    binding.environment?.lighting_mode === "hdri" &&
    binding.environment.public_url
  ) {
    try {
      environment = await acquireRuntimeEnvironment(
        binding.environment,
        renderer,
        {
          verify_hash: options.verify_hash,
        },
      );
      state = publish(options.on_progress, state, {
        environment_ready: true,
      });
    } catch (error) {
      if (isAbort(error)) throw error;
      if (
        binding.fallback_policy.missing_environment ===
        "fail_scene"
      ) {
        throw error;
      }
      const reason =
        error instanceof Error ? error.message : String(error);
      fallbackRecords.push({
        resource_kind: "environment",
        entity_id: null,
        fallback_used:
          binding.fallback_policy.missing_environment,
        reason,
      });
      state = publish(options.on_progress, state, {
        warnings: [...state.warnings, reason],
        fallbacks_active: [
          ...state.fallbacks_active,
          binding.fallback_policy.missing_environment,
        ],
      });
    }
  } else {
    fallbackRecords.push({
      resource_kind: "environment",
      entity_id: null,
      fallback_used:
        binding.fallback_policy.missing_environment,
      reason: "No reviewed HDRI binding was supplied to the composed scene.",
    });
    state = publish(options.on_progress, state, {
      fallbacks_active: [
        ...state.fallbacks_active,
        binding.fallback_policy.missing_environment,
      ],
    });
  }

  const environmentMs = performance.now() - environmentStartedAt;
  const actorsStartedAt = performance.now();
  state = publish(options.on_progress, state, {
    phase: "hydrating_models",
  });

  const actorStates = new Map(
    state.actor_states.map((actor) => [actor.entity_id, actor]),
  );

  try {
    const hydratedActors = await Promise.all(
      binding.actors.map((actor) =>
        hydrateActor(binding, actor, {
          signal: options.signal,
          verify_hash: options.verify_hash,
          simulate_failure_entity_id:
            options.simulate_failure_entity_id,
          on_actor_state: (actorState) => {
            actorStates.set(actorState.entity_id, actorState);
            state = publish(options.on_progress, state, {
              phase:
                actorState.phase === "applying_materials"
                  ? "applying_materials"
                  : "hydrating_models",
              actor_states: binding.actors.map(
                (candidate) =>
                  actorStates.get(candidate.entity_id) ??
                  emptyActorState(candidate),
              ),
            });
          },
        }),
      ),
    );

    hydratedActors.forEach((actor) => group.add(actor.object));
    const modelsReady = hydratedActors.filter(
      (actor) => actor.state.phase === "ready",
    ).length;
    const materialsReady = hydratedActors.reduce(
      (sum, actor) =>
        sum + actor.state.material_metrics.length,
      0,
    );

    for (const actor of hydratedActors) {
      if (actor.state.phase === "fallback") {
        fallbackRecords.push({
          resource_kind: "model",
          entity_id: actor.state.entity_id,
          fallback_used:
            actor.state.fallback_used ??
            binding.fallback_policy.missing_model,
          reason:
            actor.state.error ??
            "The model runtime used a declared fallback.",
        });
      }
      const actorBinding = binding.actors.find(
        (candidate) =>
          candidate.entity_id === actor.state.entity_id,
      );
      if (
        actorBinding &&
        actor.state.warnings.length &&
        actor.state.material_metrics.length <
          materialBindingsForActor(
            binding,
            actorBinding,
          ).length
      ) {
        fallbackRecords.push({
          resource_kind: "material",
          entity_id: actor.state.entity_id,
          fallback_used:
            binding.fallback_policy.missing_material,
          reason: actor.state.warnings.join("; "),
        });
      }
    }

    const modelsAndMaterialsMs =
      performance.now() - actorsStartedAt;
    const compositionStartedAt = performance.now();
    group.updateMatrixWorld(true);
    const compositionMs =
      performance.now() - compositionStartedAt;
    const totalMs = performance.now() - startedAt;
    const finalActorStates = hydratedActors.map(
      (actor) => actor.state,
    );
    const totalDownloadBytes =
      finalActorStates.reduce(
        (sum, actor) =>
          sum +
          (actor.model_metrics?.byte_size ?? 0) +
          actor.material_metrics.reduce(
            (materialSum, material) =>
              materialSum + material.total_bytes,
            0,
          ),
        environment?.metrics.byte_size ?? 0,
      );

    const diagnostics: RuntimeSceneDiagnostics = {
      scene_id: binding.scene_id,
      source: binding.source,
      entity_ids: binding.actors.map(
        (actor) => actor.entity_id,
      ),
      model_resource_ids: binding.actors
        .map((actor) => actor.model?.asset_id ?? null)
        .filter((value): value is string => Boolean(value)),
      material_assignments: binding.materials.map(
        (material) => ({
          material_binding_id:
            material.material_binding_id,
          material_resource_id:
            material.material_resource_id,
          target_entity_id:
            material.target_entity_id,
        }),
      ),
      environment_resource_id:
        binding.environment?.environment_resource_id ?? null,
      renderer: binding.renderer,
      fallback_records: fallbackRecords,
      total_download_bytes: totalDownloadBytes,
      environment_metrics: environment?.metrics ?? null,
      timing: {
        started_at_ms: startedAt,
        environment_ms: environmentMs,
        models_and_materials_ms: modelsAndMaterialsMs,
        composition_ms: compositionMs,
        total_ms: totalMs,
      },
      cleanup_status: "active",
    };

    state = publish(options.on_progress, state, {
      phase:
        fallbackRecords.length > 0 ||
        finalActorStates.some(
          (actor) => actor.warnings.length > 0,
        )
          ? "degraded"
          : "ready",
      models_ready: modelsReady,
      materials_ready: materialsReady,
      environment_ready: Boolean(environment),
      actor_states: finalActorStates,
      fallbacks_active: fallbackRecords.map(
        (record) => record.fallback_used,
      ),
      warnings: Array.from(
        new Set([
          ...state.warnings,
          ...finalActorStates.flatMap(
            (actor) => actor.warnings,
          ),
        ]),
      ),
      diagnostics,
    });

    let released = false;

    return {
      group,
      environment,
      state,
      release: () => {
        if (released) return;
        released = true;
        disposeRuntimeScene(group);
        [...hydratedActors]
          .reverse()
          .forEach((actor) =>
            [...actor.releases]
              .reverse()
              .forEach((release) => release()),
          );
        environment?.release();
        if (state.diagnostics) {
          state.diagnostics.cleanup_status = "released";
        }
      },
    };
  } catch (error) {
    environment?.release();
    disposeRuntimeScene(group);
    if (isAbort(error)) {
      publish(options.on_progress, state, {
        phase: "cancelled",
        error: null,
      });
      throw error;
    }
    const message =
      error instanceof Error ? error.message : String(error);
    publish(options.on_progress, state, {
      phase: "failed",
      error: message,
      warnings: [...state.warnings, message],
    });
    throw error;
  }
}
