import type {
  SceneAuxiliaryResourceIntent,
  SceneResourceKind,
  SceneResourceRuntimeTarget,
} from "./scene-resource-contract";

export const AUXILIARY_RUNTIME_STATUSES = [
  "direct_runtime",
  "requires_compilation",
  "blender_only",
  "unsupported",
] as const;

export type AuxiliaryRuntimeStatus =
  (typeof AUXILIARY_RUNTIME_STATUSES)[number];

export type AuxiliaryResourceRuntimeDescriptor = {
  intent_id: string;
  resource_kind: SceneAuxiliaryResourceIntent["resource_kind"];
  runtime_status: AuxiliaryRuntimeStatus;
  runtime_target: SceneResourceRuntimeTarget;
  compiler:
    | "atlas_billboard"
    | "terrain_heightfield"
    | "decal_projector"
    | "image_plane"
    | "blender_bake"
    | null;
  primary_url: string | null;
  file_urls: string[];
  content_hash: string | null;
  ready_for_browser: boolean;
  ready_for_blender: boolean;
  fallback_required: boolean;
  reasons: string[];
};

function text(
  value: unknown,
) {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function stringArray(
  value: unknown,
) {
  return Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === "string"
            ? entry.trim()
            : "",
        )
        .filter(Boolean)
    : [];
}

function isHttps(value: string | null) {
  return Boolean(
    value && /^https:\/\//i.test(value),
  );
}

function runtimeNeedsBrowser(
  target: SceneResourceRuntimeTarget,
) {
  return (
    target === "browser" ||
    target === "both"
  );
}

function runtimeNeedsBlender(
  target: SceneResourceRuntimeTarget,
) {
  return (
    target === "blender" ||
    target === "both" ||
    target === "authoring_only"
  );
}

function directCompilerFor(
  kind: SceneAuxiliaryResourceIntent["resource_kind"],
) {
  if (kind === "atlas") {
    return "atlas_billboard" as const;
  }
  if (kind === "image" || kind === "hdri_element") {
    return "image_plane" as const;
  }
  return null;
}

function compilationFor(
  kind: SceneAuxiliaryResourceIntent["resource_kind"],
) {
  if (kind === "terrain") {
    return "terrain_heightfield" as const;
  }
  if (kind === "decal") {
    return "decal_projector" as const;
  }
  if (kind === "brush" || kind === "substance") {
    return "blender_bake" as const;
  }
  return null;
}

export function declaredRuntimeStatusForResourceKind(
  kind: SceneResourceKind,
): AuxiliaryRuntimeStatus {
  if (
    kind === "model" ||
    kind === "material" ||
    kind === "environment" ||
    kind === "atlas" ||
    kind === "image" ||
    kind === "hdri_element"
  ) {
    return "direct_runtime";
  }
  if (
    kind === "terrain" ||
    kind === "decal"
  ) {
    return "requires_compilation";
  }
  if (
    kind === "brush" ||
    kind === "substance"
  ) {
    return "blender_only";
  }
  return "unsupported";
}

export function classifyAuxiliaryResourceIntent(
  intent: SceneAuxiliaryResourceIntent,
): AuxiliaryResourceRuntimeDescriptor {
  const metadata = intent.metadata ?? {};
  const explicitCompiledUrl =
    text(metadata.compiled_url);
  const primaryUrl =
    explicitCompiledUrl ??
    text(metadata.primary_url) ??
    text(metadata.public_url);
  const fileUrls = Array.from(
    new Set([
      ...(primaryUrl ? [primaryUrl] : []),
      ...stringArray(metadata.file_urls),
    ]),
  );
  const contentHash =
    text(metadata.content_hash) ??
    text(metadata.content_sha256);
  const reasons: string[] = [];
  const needsBrowser =
    runtimeNeedsBrowser(intent.runtime_target);
  const needsBlender =
    runtimeNeedsBlender(intent.runtime_target);

  if (
    intent.runtime_target === "authoring_only" ||
    intent.resource_kind === "brush" ||
    intent.resource_kind === "substance"
  ) {
    reasons.push(
      "The resource requires an explicit Blender authoring or bake job before it can become a reviewed runtime resource.",
    );
    return {
      intent_id: intent.intent_id,
      resource_kind: intent.resource_kind,
      runtime_status: "blender_only",
      runtime_target: intent.runtime_target,
      compiler: "blender_bake",
      primary_url: primaryUrl,
      file_urls: fileUrls,
      content_hash: contentHash,
      ready_for_browser: false,
      ready_for_blender: true,
      fallback_required: needsBrowser,
      reasons,
    };
  }

  if (
    intent.resource_kind === "terrain" ||
    intent.resource_kind === "decal"
  ) {
    if (
      explicitCompiledUrl &&
      isHttps(explicitCompiledUrl) &&
      contentHash
    ) {
      reasons.push(
        "A reviewed compiled HTTPS derivative and content hash were supplied.",
      );
      return {
        intent_id: intent.intent_id,
        resource_kind: intent.resource_kind,
        runtime_status: "direct_runtime",
        runtime_target: intent.runtime_target,
        compiler: compilationFor(
          intent.resource_kind,
        ),
        primary_url: explicitCompiledUrl,
        file_urls: fileUrls,
        content_hash: contentHash,
        ready_for_browser: needsBrowser,
        ready_for_blender: needsBlender,
        fallback_required: false,
        reasons,
      };
    }

    reasons.push(
      `${intent.resource_kind} requires deterministic compilation before browser execution.`,
    );
    return {
      intent_id: intent.intent_id,
      resource_kind: intent.resource_kind,
      runtime_status: "requires_compilation",
      runtime_target: intent.runtime_target,
      compiler: compilationFor(
        intent.resource_kind,
      ),
      primary_url: primaryUrl,
      file_urls: fileUrls,
      content_hash: contentHash,
      ready_for_browser: false,
      ready_for_blender: needsBlender,
      fallback_required: intent.required,
      reasons,
    };
  }

  if (
    intent.resource_kind === "atlas" ||
    intent.resource_kind === "image" ||
    intent.resource_kind === "hdri_element"
  ) {
    if (!primaryUrl) {
      reasons.push(
        "No reviewed primary URL was supplied.",
      );
    } else if (!isHttps(primaryUrl)) {
      reasons.push(
        "Browser runtime resources must use an authoritative HTTPS URL.",
      );
    }
    if (!contentHash) {
      reasons.push(
        "A content hash is required for immutable runtime hydration.",
      );
    }

    const ready =
      Boolean(
        primaryUrl &&
          isHttps(primaryUrl) &&
          contentHash,
      );

    if (ready) {
      reasons.push(
        "The reviewed HTTPS derivative is directly usable by the declared runtime target.",
      );
    }

    return {
      intent_id: intent.intent_id,
      resource_kind: intent.resource_kind,
      runtime_status: ready
        ? "direct_runtime"
        : "unsupported",
      runtime_target: intent.runtime_target,
      compiler: directCompilerFor(
        intent.resource_kind,
      ),
      primary_url: primaryUrl,
      file_urls: fileUrls,
      content_hash: contentHash,
      ready_for_browser:
        ready && needsBrowser,
      ready_for_blender:
        ready && needsBlender,
      fallback_required:
        !ready && intent.required,
      reasons,
    };
  }

  reasons.push(
    "No Phase 2 runtime policy exists for this auxiliary resource kind.",
  );
  return {
    intent_id: intent.intent_id,
    resource_kind: intent.resource_kind,
    runtime_status: "unsupported",
    runtime_target: intent.runtime_target,
    compiler: null,
    primary_url: primaryUrl,
    file_urls: fileUrls,
    content_hash: contentHash,
    ready_for_browser: false,
    ready_for_blender: false,
    fallback_required: intent.required,
    reasons,
  };
}
