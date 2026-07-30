import type {
  ResolvedModelResourceBinding,
  SceneResourceFallbackRecord,
} from "../scene-resources/scene-resource-contract";

export const RESOURCE_RUNTIME_SCHEMA_VERSION =
  "myway_resource_runtime_v1" as const;

export const RESOURCE_RUNTIME_PHASES = [
  "idle",
  "resolving",
  "resolved",
  "downloading",
  "verifying",
  "parsing",
  "ready",
  "failed",
  "cancelled",
  "disposed",
] as const;

export type ResourceRuntimePhase =
  (typeof RESOURCE_RUNTIME_PHASES)[number];

export type RuntimeModelBindingV1 = {
  schema_version: typeof RESOURCE_RUNTIME_SCHEMA_VERSION;
  resource_kind: "model";
  scene_id: string;
  intent_id: string;
  entity_id: string;
  asset_id: string;
  variant_id: string | null;
  public_url: string;
  content_hash: string | null;
  storage_provider: "local" | "r2";
  registry_snapshot_id: string;
  registry_content_hash: string;
  request_hash: string;
  resolver_version: string;
  resolved_at: string;
  fallback: SceneResourceFallbackRecord | null;
  license: ResolvedModelResourceBinding["license"];
};

export type ResourceRuntimeMetrics = {
  cache_key: string | null;
  cache_hit: boolean;
  byte_size: number | null;
  download_ms: number | null;
  verify_ms: number | null;
  parse_ms: number | null;
  total_ms: number | null;
  expected_content_hash: string | null;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
  instance_geometry_count: number;
  instance_material_count: number;
  instance_texture_count: number;
};

export type ResourceRuntimeEvent = {
  phase: ResourceRuntimePhase;
  at: string;
  message: string;
};

export type ResourceRuntimeState = {
  phase: ResourceRuntimePhase;
  entity_id: string | null;
  asset_id: string | null;
  error: string | null;
  metrics: ResourceRuntimeMetrics;
  events: ResourceRuntimeEvent[];
};

export type ResourceRuntimeResolveResponse = {
  ok: boolean;
  resource_plan: unknown;
  resolved_resources: unknown;
  runtime_binding: RuntimeModelBindingV1 | null;
  fallback: SceneResourceFallbackRecord | null;
  error?: string;
};

export type ResourceRuntimeAssetSummary = {
  asset_id: string;
  display_name: string;
  canonical_label: string;
  public_url: string;
  content_hash: string | null;
  file_size_bytes: number | null;
  source_type: string;
};

export type ResourceRuntimeAssetListResponse = {
  ok: boolean;
  assets: ResourceRuntimeAssetSummary[];
  default_asset_id: string | null;
  error?: string;
};

export type BlenderHydrationReport = {
  ok: boolean;
  asset_id: string;
  entity_id: string;
  file_name: string | null;
  byte_size: number | null;
  expected_content_hash: string | null;
  actual_content_hash: string | null;
  hash_verified: boolean | null;
  retained_for_debug: boolean;
  cleaned_up: boolean;
  error?: string;
};

export const EMPTY_RESOURCE_RUNTIME_METRICS: ResourceRuntimeMetrics = {
  cache_key: null,
  cache_hit: false,
  byte_size: null,
  download_ms: null,
  verify_ms: null,
  parse_ms: null,
  total_ms: null,
  expected_content_hash: null,
  actual_content_hash: null,
  hash_verified: null,
  instance_geometry_count: 0,
  instance_material_count: 0,
  instance_texture_count: 0,
};
