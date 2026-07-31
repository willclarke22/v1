import type {
  ResolvedSceneResourcesV1,
  SceneResourcePlanSource,
} from "../scene-resources/scene-resource-contract";
import {
  buildRuntimeModelBinding,
  fallbackForIntent,
} from "./build-runtime-binding";
import {
  buildRuntimeSceneBinding,
  type BuildRuntimeSceneBindingInput,
} from "./build-scene-runtime-binding";
import type {
  RuntimeSceneBindingV1,
  RuntimeSceneSource,
} from "./scene-runtime-contract";

function sourceForPlan(
  source: SceneResourcePlanSource,
): RuntimeSceneSource {
  if (source === "primitive_builder") {
    return "primitive_builder";
  }
  if (source === "visual_experience") {
    return "visual_experience";
  }
  if (source === "manual_turn") {
    return "manual_turn";
  }
  return "compatibility_adapter";
}

export type ResolvedSceneRuntimeAdapterInput = Omit<
  BuildRuntimeSceneBindingInput,
  "scene_id" | "models" | "source"
> & {
  resolved: ResolvedSceneResourcesV1;
  source?: RuntimeSceneSource;
};

export function adaptResolvedSceneResourcesToRuntime(
  input: ResolvedSceneRuntimeAdapterInput,
): RuntimeSceneBindingV1 {
  const models = input.resolved.models.map((model) =>
    buildRuntimeModelBinding(
      input.resolved,
      model,
      fallbackForIntent(
        input.resolved,
        model.intent_id,
      ),
    ),
  );

  return buildRuntimeSceneBinding({
    ...input,
    scene_id: input.resolved.scene_id,
    source: input.source ?? "compatibility_adapter",
    models,
    warnings: [
      ...input.resolved.warnings.map(
        (warning) => warning.message,
      ),
      ...(input.warnings ?? []),
    ],
  });
}

export function adaptPrimitiveBuilderSceneRuntime(
  input: ResolvedSceneRuntimeAdapterInput,
) {
  return adaptResolvedSceneResourcesToRuntime({
    ...input,
    source: "primitive_builder",
  });
}

export function adaptVisualExperienceSceneRuntime(
  input: ResolvedSceneRuntimeAdapterInput,
) {
  return adaptResolvedSceneResourcesToRuntime({
    ...input,
    source: "visual_experience",
  });
}

export function adaptManualTurnSceneRuntime(
  input: ResolvedSceneRuntimeAdapterInput,
) {
  return adaptResolvedSceneResourcesToRuntime({
    ...input,
    source: "manual_turn",
  });
}

export function runtimeSceneSourceFromPlanSource(
  source: SceneResourcePlanSource,
) {
  return sourceForPlan(source);
}
