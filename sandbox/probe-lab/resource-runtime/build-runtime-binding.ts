import {
  RESOURCE_RUNTIME_SCHEMA_VERSION,
  type RuntimeModelBindingV1,
} from "./resource-runtime-contract";
import type {
  ResolvedModelResourceBinding,
  ResolvedSceneResourcesV1,
  SceneResourceFallbackRecord,
} from "../scene-resources/scene-resource-contract";

function normalizedUrl(value: string) {
  return value.trim().replace(/\\/g, "/");
}

export function validateRuntimeModelUrl(
  publicUrl: string,
  storageProvider: "local" | "r2",
) {
  const normalized = normalizedUrl(publicUrl);

  if (!normalized) {
    throw new Error("Resolved model binding has an empty public URL.");
  }

  if (storageProvider === "r2") {
    if (!/^https:\/\//i.test(normalized)) {
      throw new Error(
        "R2 model bindings must use an HTTPS public URL.",
      );
    }
    return normalized;
  }

  if (
    !normalized.startsWith("/sandbox-assets/myway/") &&
    !/^https:\/\//i.test(normalized)
  ) {
    throw new Error(
      "Local model bindings must use the MyWay public asset root or an HTTPS URL.",
    );
  }

  return normalized;
}

export function buildRuntimeModelBinding(
  resolved: ResolvedSceneResourcesV1,
  model: ResolvedModelResourceBinding,
  fallback: SceneResourceFallbackRecord | null = null,
): RuntimeModelBindingV1 {
  if (model.entity_id.trim().length === 0) {
    throw new Error("Resolved model binding is missing its Director entity id.");
  }

  if (model.intent_id.trim().length === 0) {
    throw new Error("Resolved model binding is missing its resource intent id.");
  }

  if (model.asset_id.trim().length === 0) {
    throw new Error("Resolved model binding is missing its asset id.");
  }

  return {
    schema_version: RESOURCE_RUNTIME_SCHEMA_VERSION,
    resource_kind: "model",
    scene_id: resolved.scene_id,
    intent_id: model.intent_id,
    entity_id: model.entity_id,
    asset_id: model.asset_id,
    variant_id: model.variant_id,
    public_url: validateRuntimeModelUrl(
      model.public_url,
      model.storage_provider,
    ),
    content_hash: model.content_hash,
    storage_provider: model.storage_provider,
    registry_snapshot_id: resolved.registry_snapshot_id,
    registry_content_hash: resolved.registry_content_hash,
    request_hash: resolved.request_hash,
    resolver_version: resolved.resolver_version,
    resolved_at: resolved.resolved_at,
    fallback,
    license: model.license,
  };
}

export function firstRuntimeModelBinding(
  resolved: ResolvedSceneResourcesV1,
): RuntimeModelBindingV1 | null {
  const model = resolved.models[0];

  if (!model) {
    return null;
  }

  const fallback =
    resolved.fallbacks_used.find(
      (entry) =>
        entry.intent_id === model.intent_id &&
        entry.resource_kind === "model",
    ) ?? null;

  return buildRuntimeModelBinding(
    resolved,
    model,
    fallback,
  );
}

export function fallbackForIntent(
  resolved: ResolvedSceneResourcesV1,
  intentId: string,
) {
  return (
    resolved.fallbacks_used.find(
      (entry) =>
        entry.intent_id === intentId &&
        entry.resource_kind === "model",
    ) ?? null
  );
}
