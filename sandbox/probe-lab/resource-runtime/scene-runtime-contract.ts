import type {
  MyWayThirdPartyAssetCreditV1,
} from "../assets/asset-types";
import type {
  EnvironmentCacheMetric,
  RuntimeEnvironmentBindingV1,
  RuntimeShadowPolicy,
} from "./environment-runtime-contract";
import type {
  MaterialRuntimeMetrics,
  RuntimeMaterialBindingV1,
} from "./material-runtime-contract";
import type {
  ResourceRuntimeMetrics,
  RuntimeModelBindingV1,
} from "./resource-runtime-contract";

export const SCENE_RUNTIME_SCHEMA_VERSION =
  "myway_scene_runtime_v1" as const;

export const SCENE_RUNTIME_PHASES = [
  "idle",
  "hydrating_environment",
  "hydrating_models",
  "applying_materials",
  "composing",
  "ready",
  "degraded",
  "failed",
  "cancelled",
  "disposed",
] as const;

export type RuntimeScenePhase =
  (typeof SCENE_RUNTIME_PHASES)[number];

export type RuntimeSceneSource =
  | "resource_runtime_harness"
  | "primitive_builder"
  | "visual_experience"
  | "manual_turn"
  | "compatibility_adapter";

export type RuntimeSceneActorTransform = {
  position: [number, number, number];
  rotation_radians: [number, number, number];
  scale: number;
};

export const RUNTIME_SCENE_PRIMITIVE_KINDS = [
  "box",
  "cylinder",
  "sphere",
  "plane",
  "cone",
  "torus",
  "rod",
] as const;

export type RuntimeScenePrimitiveKind =
  (typeof RUNTIME_SCENE_PRIMITIVE_KINDS)[number];

export type RuntimeScenePrimitiveBindingV1 = {
  entity_id: string;
  primitive_kind: RuntimeScenePrimitiveKind;
  dimensions: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  generated_uvs: true;
  cast_shadow: boolean;
  receive_shadow: boolean;
};

export type RuntimeSceneActorBindingV1 = {
  entity_id: string;
  intent_id: string;
  model: RuntimeModelBindingV1 | null;
  primitive: RuntimeScenePrimitiveBindingV1 | null;
  fallback_only: boolean;
  fallback_reason: string | null;
  material_binding_ids: string[];
  required: boolean;
  transform: RuntimeSceneActorTransform;
  fallback_label: string | null;
};

export type RuntimeSceneRendererPolicy = {
  tone_mapping: "ACESFilmic";
  output_color_space: "srgb";
  exposure: number;
  shadows_enabled: boolean;
  shadow_policy: RuntimeShadowPolicy;
};

export type RuntimeSceneFallbackPolicy = {
  preserve_entity_ids: true;
  preserve_direction: true;
  missing_model:
    | "diagrammatic_proxy"
    | "abstract_proxy"
    | "preserve_direction_without_actor"
    | "fail_scene";
  missing_material:
    | "neutral_material"
    | "preserve_original"
    | "fail_scene";
  missing_environment:
    | "studio_rig"
    | "renderer_default"
    | "fail_scene";
};

export type RuntimeSceneBindingV1 = {
  schema_version:
    typeof SCENE_RUNTIME_SCHEMA_VERSION;
  scene_id: string;
  source: RuntimeSceneSource;
  actors: RuntimeSceneActorBindingV1[];
  materials: RuntimeMaterialBindingV1[];
  environment: RuntimeEnvironmentBindingV1 | null;
  third_party_assets?: MyWayThirdPartyAssetCreditV1[];
  renderer: RuntimeSceneRendererPolicy;
  fallback_policy: RuntimeSceneFallbackPolicy;
  created_at: string;
  adapter_version: string;
  warnings: string[];
};

export type RuntimeSceneActorPhase =
  | "idle"
  | "hydrating_model"
  | "applying_materials"
  | "ready"
  | "fallback"
  | "failed"
  | "disposed";

export type RuntimeSceneActorState = {
  entity_id: string;
  asset_id: string | null;
  phase: RuntimeSceneActorPhase;
  fallback_used: string | null;
  error: string | null;
  model_metrics: ResourceRuntimeMetrics | null;
  material_metrics: MaterialRuntimeMetrics[];
  warnings: string[];
};

export type RuntimeSceneTiming = {
  started_at_ms: number;
  environment_ms: number;
  models_and_materials_ms: number;
  composition_ms: number;
  total_ms: number;
};

export type RuntimeSceneDiagnostics = {
  scene_id: string;
  source: RuntimeSceneSource;
  entity_ids: string[];
  model_resource_ids: string[];
  primitive_entity_ids: string[];
  material_assignments: Array<{
    material_binding_id: string;
    material_resource_id: string;
    target_entity_id: string;
  }>;
  environment_resource_id: string | null;
  renderer: RuntimeSceneRendererPolicy;
  fallback_records: Array<{
    resource_kind: "model" | "material" | "environment";
    entity_id: string | null;
    fallback_used: string;
    reason: string;
  }>;
  total_download_bytes: number;
  environment_metrics: EnvironmentCacheMetric | null;
  timing: RuntimeSceneTiming;
  cleanup_status: "active" | "released";
};

export type RuntimeSceneState = {
  phase: RuntimeScenePhase;
  scene_id: string | null;
  models_ready: number;
  materials_ready: number;
  environment_ready: boolean;
  actor_states: RuntimeSceneActorState[];
  fallbacks_active: string[];
  warnings: string[];
  error: string | null;
  diagnostics: RuntimeSceneDiagnostics | null;
};

export const DEFAULT_RUNTIME_SCENE_FALLBACK_POLICY:
  RuntimeSceneFallbackPolicy = {
    preserve_entity_ids: true,
    preserve_direction: true,
    missing_model: "diagrammatic_proxy",
    missing_material: "preserve_original",
    missing_environment: "studio_rig",
  };
