import {
  createHash,
} from "node:crypto";

import type {
  AmbientCgCachedHdri,
  AmbientCgHdriRegistry,
} from "../assets/catalog/ambientcg/ambientcg-types";
import {
  DEFAULT_ENVIRONMENT_FALLBACK,
  DEFAULT_ENVIRONMENT_SHADOW_POLICY,
  ENVIRONMENT_RESOLVER_VERSION,
  ENVIRONMENT_RUNTIME_SCHEMA_VERSION,
  type EnvironmentCandidateDiagnostic,
  type EnvironmentResolverDiagnostics,
  type RuntimeEnvironmentBackgroundMode,
  type RuntimeEnvironmentBindingV1,
  type RuntimeEnvironmentFallbackRig,
} from "./environment-runtime-contract";
import {
  clampEnvironmentNumber,
  environmentFormatFromUrl,
  normalizeBackgroundMode,
  normalizeFallbackRig,
  normalizeShadowPolicy,
} from "./environment-runtime-policy";

export type ReviewedEnvironmentResolverSnapshot = {
  registry: AmbientCgHdriRegistry;
  registry_snapshot_id: string;
  registry_content_hash: string;
};

export type ResolveReviewedEnvironmentRequest = {
  preferred_environment_id?: string | null;
  intent?: string | null;
  semantic_tags?: string[];
  background_mode?: RuntimeEnvironmentBackgroundMode;
  fallback_rig?: RuntimeEnvironmentFallbackRig;
  intensity?: number;
  rotation_radians?: number;
  background_intensity?: number;
  background_blurriness?: number;
  background_color?: string;
  exposure?: number;
  force_fallback?: boolean;
  simulate_failure?: boolean;
};

function canonicalSnapshotValue(
  registry: AmbientCgHdriRegistry,
) {
  return registry.hdris
    .map((item) => ({
      resource_id: item.resource_id,
      source_asset_id: item.source_asset_id,
      display_name: item.display_name,
      source_url: item.source_url,
      license: item.license,
      attribution_required:
        item.attribution_required,
      commercial_use_allowed:
        item.commercial_use_allowed,
      raw_distribution_allowed:
        item.raw_distribution_allowed,
      resolution: item.resolution,
      file_format: item.file_format,
      variant_id: item.variant_id,
      environment_url:
        item.environment_url,
      environment_object_key:
        item.environment_object_key ?? null,
      thumbnail_url:
        item.thumbnail_url,
      semantic_tags: [
        ...item.semantic_tags,
      ].sort(),
      content_sha256:
        item.content_sha256,
      published_to_r2:
        item.published_to_r2,
      storage_provider:
        item.storage_provider ?? null,
      storage: item.storage
        ? {
            provider:
              item.storage.provider,
            runtime_prefix:
              item.storage.runtime_prefix,
            manifest_url:
              item.storage.manifest_url,
            manifest_object_key:
              item.storage
                .manifest_object_key,
            thumbnail_object_key:
              item.storage
                .thumbnail_object_key,
            source_metadata_object_key:
              item.storage
                .source_metadata_object_key,
            license_object_key:
              item.storage
                .license_object_key,
          }
        : null,
    }))
    .sort((left, right) =>
      left.resource_id.localeCompare(
        right.resource_id,
      ),
    );
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function buildReviewedEnvironmentResolverSnapshot(
  registry: AmbientCgHdriRegistry,
): ReviewedEnvironmentResolverSnapshot {
  const registryContentHash =
    stableHash(
      canonicalSnapshotValue(
        registry,
      ),
    );

  return {
    registry,
    registry_snapshot_id:
      `ambientcg-hdri:${registryContentHash.slice(0, 16)}`,
    registry_content_hash:
      registryContentHash,
  };
}

export async function loadReviewedEnvironmentResolverSnapshot() {
  const {
    readAmbientCgHdriRegistry,
  } = await import(
    "../assets/catalog/ambientcg/ambientcg-store.server"
  );

  return buildReviewedEnvironmentResolverSnapshot(
    await readAmbientCgHdriRegistry(),
  );
}

export function isReviewedRuntimeEnvironment(
  item: AmbientCgCachedHdri,
) {
  return (
    item.asset_type === "hdri" &&
    item.license === "CC0-1.0" &&
    item.attribution_required ===
      false &&
    item.commercial_use_allowed ===
      true &&
    item.raw_distribution_allowed ===
      true &&
    item.published_to_r2 === true &&
    item.storage_provider === "r2" &&
    item.storage?.provider === "r2" &&
    Boolean(
      item.environment_object_key,
    ) &&
    /^https:\/\//i.test(
      item.environment_url,
    ) &&
    Boolean(item.content_sha256) &&
    environmentFormatFromUrl(
      item.environment_url,
    ) !== null
  );
}

function normalizeWords(
  values: Array<string | null | undefined>,
) {
  return values
    .flatMap((value) =>
      (value ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g),
    )
    .filter(Boolean);
}

function candidateDiagnostic(
  item: AmbientCgCachedHdri,
  request: ResolveReviewedEnvironmentRequest,
): EnvironmentCandidateDiagnostic {
  const rejectedReasons: string[] =
    [];
  const reasons: string[] = [];

  if (item.license !== "CC0-1.0") {
    rejectedReasons.push(
      "license is not CC0-1.0",
    );
  }
  if (
    item.attribution_required ||
    !item.commercial_use_allowed ||
    !item.raw_distribution_allowed
  ) {
    rejectedReasons.push(
      "license policy is not application-ready",
    );
  }
  if (!item.published_to_r2) {
    rejectedReasons.push(
      "not published to R2",
    );
  }
  if (
    item.storage_provider !==
      "r2" ||
    item.storage?.provider !== "r2"
  ) {
    rejectedReasons.push(
      "storage provider is not authoritative R2",
    );
  }
  if (
    !item.environment_object_key
  ) {
    rejectedReasons.push(
      "environment object key is missing",
    );
  }
  if (
    !/^https:\/\//i.test(
      item.environment_url,
    )
  ) {
    rejectedReasons.push(
      "environment URL is not HTTPS",
    );
  }
  if (
    !environmentFormatFromUrl(
      item.environment_url,
    )
  ) {
    rejectedReasons.push(
      "environment format is not HDR or EXR",
    );
  }
  if (!item.content_sha256) {
    rejectedReasons.push(
      "content hash is missing",
    );
  }

  let score = 0;

  if (
    request.preferred_environment_id &&
    item.resource_id ===
      request.preferred_environment_id
  ) {
    score += 1000;
    reasons.push(
      "explicit preferred environment id",
    );
  }

  const requestWords =
    new Set(
      normalizeWords([
        request.intent,
        ...(request.semantic_tags ?? []),
      ]),
    );
  const itemWords =
    new Set(
      normalizeWords([
        item.display_name,
        ...item.semantic_tags,
      ]),
    );

  for (const word of requestWords) {
    if (itemWords.has(word)) {
      score += 10;
      reasons.push(
        `semantic match: ${word}`,
      );
    }
  }

  const resolution =
    (item.resolution ?? "")
      .toLowerCase();
  if (
    resolution.includes("2k") ||
    resolution.includes("4k")
  ) {
    score += 4;
    reasons.push(
      "runtime-friendly resolution",
    );
  } else if (
    resolution.includes("8k") ||
    resolution.includes("16k")
  ) {
    score -= 2;
    reasons.push(
      "high-resolution runtime cost",
    );
  }

  if (
    environmentFormatFromUrl(
      item.environment_url,
    ) === "hdr"
  ) {
    score += 1;
    reasons.push(
      "widely supported HDR format",
    );
  }

  return {
    resource_id: item.resource_id,
    eligible:
      rejectedReasons.length === 0,
    score,
    reasons,
    rejected_reasons:
      rejectedReasons,
  };
}

function fallbackBinding(
  request: ResolveReviewedEnvironmentRequest,
  snapshot: ReviewedEnvironmentResolverSnapshot,
  reason: string,
  requestHash: string,
): RuntimeEnvironmentBindingV1 {
  const rig =
    normalizeFallbackRig(
      request.fallback_rig,
    );

  return {
    schema_version:
      ENVIRONMENT_RUNTIME_SCHEMA_VERSION,
    resource_kind:
      "environment",
    environment_binding_id:
      `environment:fallback:${rig}`,
    environment_resource_id:
      null,
    variant_id: null,
    content_hash: null,
    display_name:
      `Deterministic ${rig.replaceAll("_", " ")}`,
    format: null,
    lighting_mode: rig,
    background_mode:
      normalizeBackgroundMode(
        request.background_mode,
      ),
    public_url: null,
    object_key: null,
    intensity:
      clampEnvironmentNumber(
        request.intensity ?? 1,
        0,
        8,
      ),
    rotation_radians:
      clampEnvironmentNumber(
        request.rotation_radians ??
          0,
        -Math.PI * 4,
        Math.PI * 4,
      ),
    background_intensity:
      clampEnvironmentNumber(
        request.background_intensity ??
          1,
        0,
        8,
      ),
    background_blurriness:
      clampEnvironmentNumber(
        request.background_blurriness ??
          0,
        0,
        1,
      ),
    background_color:
      typeof request.background_color ===
        "string"
        ? request.background_color
        : "#0f172a",
    exposure:
      clampEnvironmentNumber(
        request.exposure ?? 1,
        0.1,
        4,
      ),
    shadow_policy:
      normalizeShadowPolicy(
        null,
        DEFAULT_ENVIRONMENT_SHADOW_POLICY,
      ),
    fallback: {
      ...DEFAULT_ENVIRONMENT_FALLBACK,
      used: true,
      reason,
      rig,
    },
    registry_snapshot_id:
      snapshot.registry_snapshot_id,
    registry_content_hash:
      snapshot.registry_content_hash,
    request_hash: requestHash,
    resolver_version:
      ENVIRONMENT_RESOLVER_VERSION,
    resolved_at:
      new Date().toISOString(),
    provenance: {
      source_type: "fallback",
      source_asset_id: null,
      source_url: null,
      license: "internal",
      attribution_required: false,
      commercial_use_allowed: true,
      raw_distribution_allowed: false,
    },
    warnings: [reason],
  };
}

export function resolveReviewedEnvironment(
  request: ResolveReviewedEnvironmentRequest,
  snapshot: ReviewedEnvironmentResolverSnapshot,
): {
  binding: RuntimeEnvironmentBindingV1;
  diagnostics: EnvironmentResolverDiagnostics;
} {
  const requestHash = stableHash({
    preferred_environment_id:
      request.preferred_environment_id ??
      null,
    intent: request.intent ?? null,
    semantic_tags: [
      ...(request.semantic_tags ?? []),
    ].sort(),
    background_mode:
      normalizeBackgroundMode(
        request.background_mode,
      ),
    fallback_rig:
      normalizeFallbackRig(
        request.fallback_rig,
      ),
    intensity:
      request.intensity ?? 1,
    rotation_radians:
      request.rotation_radians ?? 0,
    background_intensity:
      request.background_intensity ??
      1,
    background_blurriness:
      request.background_blurriness ??
      0,
    background_color:
      request.background_color ??
      "#0f172a",
    exposure: request.exposure ?? 1,
    force_fallback:
      Boolean(request.force_fallback),
    simulate_failure:
      Boolean(request.simulate_failure),
  });

  const candidateDiagnostics =
    snapshot.registry.hdris.map(
      (item) =>
        candidateDiagnostic(
          item,
          request,
        ),
    );

  const eligible =
    candidateDiagnostics
      .filter((candidate) =>
        candidate.eligible,
      )
      .sort((left, right) =>
        right.score - left.score ||
        left.resource_id.localeCompare(
          right.resource_id,
        ),
      );

  const selectedDiagnostic =
    request.force_fallback
      ? null
      : eligible[0] ?? null;
  const selected =
    selectedDiagnostic
      ? snapshot.registry.hdris.find(
          (item) =>
            item.resource_id ===
            selectedDiagnostic.resource_id,
        ) ?? null
      : null;

  if (!selected) {
    const reason =
      request.force_fallback
        ? "The deterministic fallback rig was explicitly requested."
        : "No reviewed, R2-published HDR or EXR environment was eligible.";

    const binding =
      fallbackBinding(
        request,
        snapshot,
        reason,
        requestHash,
      );

    return {
      binding,
      diagnostics: {
        resolver_version:
          ENVIRONMENT_RESOLVER_VERSION,
        registry_snapshot_id:
          snapshot.registry_snapshot_id,
        registry_content_hash:
          snapshot.registry_content_hash,
        request_hash: requestHash,
        selected_resource_id:
          null,
        candidate_diagnostics:
          candidateDiagnostics,
        acquisition_attempted: false,
        fallback_used: true,
      },
    };
  }

  const format =
    environmentFormatFromUrl(
      selected.environment_url,
    );

  if (!format) {
    throw new Error(
      "The selected reviewed environment has an unsupported runtime format.",
    );
  }

  const rig =
    normalizeFallbackRig(
      request.fallback_rig,
    );
  const warnings: string[] = [];

  if (request.simulate_failure) {
    warnings.push(
      "The harness will deliberately request an unapproved URL to test the runtime fallback.",
    );
  }

  const publicUrl =
    request.simulate_failure
      ? `${selected.environment_url}.missing`
      : selected.environment_url;

  const binding:
    RuntimeEnvironmentBindingV1 = {
      schema_version:
        ENVIRONMENT_RUNTIME_SCHEMA_VERSION,
      resource_kind:
        "environment",
      environment_binding_id:
        `environment:${selected.resource_id}`,
      environment_resource_id:
        selected.resource_id,
      variant_id:
        selected.variant_id,
      content_hash:
        selected.content_sha256,
      display_name:
        selected.display_name,
      format,
      lighting_mode: "hdri",
      background_mode:
        normalizeBackgroundMode(
          request.background_mode,
        ),
      public_url: publicUrl,
      object_key:
        selected.environment_object_key ??
        null,
      intensity:
        clampEnvironmentNumber(
          request.intensity ?? 1,
          0,
          8,
        ),
      rotation_radians:
        clampEnvironmentNumber(
          request.rotation_radians ??
            0,
          -Math.PI * 4,
          Math.PI * 4,
        ),
      background_intensity:
        clampEnvironmentNumber(
          request.background_intensity ??
            1,
          0,
          8,
        ),
      background_blurriness:
        clampEnvironmentNumber(
          request.background_blurriness ??
            0,
          0,
          1,
        ),
      background_color:
        typeof request.background_color ===
          "string"
          ? request.background_color
          : "#0f172a",
      exposure:
        clampEnvironmentNumber(
          request.exposure ?? 1,
          0.1,
          4,
        ),
      shadow_policy:
        normalizeShadowPolicy(
          null,
          DEFAULT_ENVIRONMENT_SHADOW_POLICY,
        ),
      fallback: {
        ...DEFAULT_ENVIRONMENT_FALLBACK,
        used: false,
        reason: null,
        rig,
      },
      registry_snapshot_id:
        snapshot.registry_snapshot_id,
      registry_content_hash:
        snapshot.registry_content_hash,
      request_hash: requestHash,
      resolver_version:
        ENVIRONMENT_RESOLVER_VERSION,
      resolved_at:
        new Date().toISOString(),
      provenance: {
        source_type: "ambientcg",
        source_asset_id:
          selected.source_asset_id,
        source_url:
          selected.source_url,
        license:
          selected.license,
        attribution_required:
          selected.attribution_required,
        commercial_use_allowed:
          selected.commercial_use_allowed,
        raw_distribution_allowed:
          selected.raw_distribution_allowed,
      },
      warnings,
    };

  return {
    binding,
    diagnostics: {
      resolver_version:
        ENVIRONMENT_RESOLVER_VERSION,
      registry_snapshot_id:
        snapshot.registry_snapshot_id,
      registry_content_hash:
        snapshot.registry_content_hash,
      request_hash: requestHash,
      selected_resource_id:
        selected.resource_id,
      candidate_diagnostics:
        candidateDiagnostics,
      acquisition_attempted: false,
      fallback_used: false,
    },
  };
}
