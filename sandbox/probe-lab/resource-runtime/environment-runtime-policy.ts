import type {
  RuntimeEnvironmentBackgroundMode,
  RuntimeEnvironmentFallbackRig,
  RuntimeEnvironmentFormat,
  RuntimeShadowPolicy,
} from "./environment-runtime-contract";


export const BROWSER_ENVIRONMENT_MAX_WIDTH_WEBGL2 = 4096;
export const BROWSER_ENVIRONMENT_MAX_WIDTH_WEBGL1 = 2048;
export const BROWSER_ENVIRONMENT_MAX_DECODED_BYTES =
  96 * 1024 * 1024;

export type BrowserEnvironmentTexturePlan = {
  source_width: number;
  source_height: number;
  target_width: number;
  target_height: number;
  channels: number;
  bytes_per_channel: number;
  estimated_runtime_bytes: number;
  browser_max_width: number;
  downsampled: boolean;
};

export function planBrowserEnvironmentTexture(
  input: {
    source_width: number;
    source_height: number;
    channels: number;
    bytes_per_channel: number;
    max_texture_size: number;
    is_webgl2: boolean;
    max_decoded_bytes?: number;
  },
): BrowserEnvironmentTexturePlan {
  const sourceWidth = Math.max(
    1,
    Math.floor(input.source_width),
  );
  const sourceHeight = Math.max(
    1,
    Math.floor(input.source_height),
  );
  const channels = Math.min(
    4,
    Math.max(1, Math.floor(input.channels)),
  );
  const bytesPerChannel = Math.max(
    1,
    Math.floor(input.bytes_per_channel),
  );
  const rendererLimit = Math.max(
    256,
    Math.floor(input.max_texture_size),
  );
  const browserLimit = input.is_webgl2
    ? BROWSER_ENVIRONMENT_MAX_WIDTH_WEBGL2
    : BROWSER_ENVIRONMENT_MAX_WIDTH_WEBGL1;
  const browserMaxWidth = Math.max(
    256,
    Math.min(
      sourceWidth,
      rendererLimit,
      browserLimit,
    ),
  );
  const maxDecodedBytes = Math.max(
    16 * 1024 * 1024,
    input.max_decoded_bytes ??
      BROWSER_ENVIRONMENT_MAX_DECODED_BYTES,
  );

  const candidateWidths = Array.from(
    new Set([
      browserMaxWidth,
      4096,
      2048,
      1024,
      512,
      256,
    ]),
  )
    .filter(
      (value) =>
        value > 0 &&
        value <= browserMaxWidth,
    )
    .sort((left, right) => right - left);

  for (const targetWidth of candidateWidths) {
    const targetHeight = Math.max(
      1,
      Math.round(
        sourceHeight *
          (targetWidth / sourceWidth),
      ),
    );
    const estimatedRuntimeBytes =
      targetWidth *
      targetHeight *
      channels *
      bytesPerChannel;

    if (
      estimatedRuntimeBytes <=
      maxDecodedBytes
    ) {
      return {
        source_width: sourceWidth,
        source_height: sourceHeight,
        target_width: targetWidth,
        target_height: targetHeight,
        channels,
        bytes_per_channel: bytesPerChannel,
        estimated_runtime_bytes:
          estimatedRuntimeBytes,
        browser_max_width:
          browserMaxWidth,
        downsampled:
          targetWidth !== sourceWidth ||
          targetHeight !== sourceHeight,
      };
    }
  }

  const targetWidth = Math.min(
    browserMaxWidth,
    256,
  );
  const targetHeight = Math.max(
    1,
    Math.round(
      sourceHeight *
        (targetWidth / sourceWidth),
    ),
  );

  return {
    source_width: sourceWidth,
    source_height: sourceHeight,
    target_width: targetWidth,
    target_height: targetHeight,
    channels,
    bytes_per_channel: bytesPerChannel,
    estimated_runtime_bytes:
      targetWidth *
      targetHeight *
      channels *
      bytesPerChannel,
    browser_max_width: browserMaxWidth,
    downsampled:
      targetWidth !== sourceWidth ||
      targetHeight !== sourceHeight,
  };
}

export function environmentFormatFromUrl(
  value: string | null | undefined,
): RuntimeEnvironmentFormat | null {
  if (!value) return null;

  let pathname = value;
  try {
    pathname = new URL(
      value,
      "https://myway.invalid",
    ).pathname;
  } catch {
    // The suffix check below also handles project-relative URLs.
  }

  const normalized =
    pathname.toLowerCase();

  if (normalized.endsWith(".hdr")) {
    return "hdr";
  }
  if (normalized.endsWith(".exr")) {
    return "exr";
  }
  return null;
}

export function clampEnvironmentNumber(
  value: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

export function normalizeBackgroundMode(
  value: unknown,
): RuntimeEnvironmentBackgroundMode {
  return value === "environment" ||
    value === "solid_color" ||
    value === "transparent" ||
    value === "none"
    ? value
    : "solid_color";
}

export function normalizeFallbackRig(
  value: unknown,
): RuntimeEnvironmentFallbackRig {
  return value === "diagrammatic_rig" ||
    value === "dramatic_rig" ||
    value === "outdoor_daylight_rig" ||
    value === "studio_rig"
    ? value
    : "studio_rig";
}

export type RuntimeFallbackLight = {
  kind:
    | "hemisphere"
    | "ambient"
    | "directional"
    | "spot";
  role:
    | "ambient"
    | "key"
    | "fill"
    | "rim";
  intensity: number;
  color: string;
  ground_color?: string;
  position?: [number, number, number];
  cast_shadow: boolean;
};

export function fallbackRigLights(
  rig: RuntimeEnvironmentFallbackRig,
  input: {
    ambient: number;
    key: number;
    fill: number;
    rim: number;
  },
): RuntimeFallbackLight[] {
  if (rig === "diagrammatic_rig") {
    return [
      {
        kind: "hemisphere",
        role: "ambient",
        intensity: input.ambient * 1.35,
        color: "#f8fafc",
        ground_color: "#64748b",
        cast_shadow: false,
      },
      {
        kind: "directional",
        role: "key",
        intensity: input.key * 0.75,
        color: "#ffffff",
        position: [4, 7, 5],
        cast_shadow: true,
      },
      {
        kind: "directional",
        role: "fill",
        intensity: input.fill * 1.1,
        color: "#dbeafe",
        position: [-5, 3, 4],
        cast_shadow: false,
      },
    ];
  }

  if (rig === "dramatic_rig") {
    return [
      {
        kind: "ambient",
        role: "ambient",
        intensity: input.ambient * 0.35,
        color: "#cbd5e1",
        cast_shadow: false,
      },
      {
        kind: "spot",
        role: "key",
        intensity: input.key * 1.35,
        color: "#fff7ed",
        position: [4, 7, 4],
        cast_shadow: true,
      },
      {
        kind: "directional",
        role: "fill",
        intensity: input.fill * 0.45,
        color: "#93c5fd",
        position: [-5, 2, 1],
        cast_shadow: false,
      },
      {
        kind: "directional",
        role: "rim",
        intensity: input.rim * 1.4,
        color: "#c4b5fd",
        position: [0, 4, -6],
        cast_shadow: false,
      },
    ];
  }

  if (rig === "outdoor_daylight_rig") {
    return [
      {
        kind: "hemisphere",
        role: "ambient",
        intensity: input.ambient * 1.2,
        color: "#dbeafe",
        ground_color: "#6b7280",
        cast_shadow: false,
      },
      {
        kind: "directional",
        role: "key",
        intensity: input.key,
        color: "#fff7ed",
        position: [6, 9, 3],
        cast_shadow: true,
      },
      {
        kind: "directional",
        role: "fill",
        intensity: input.fill * 0.5,
        color: "#bfdbfe",
        position: [-4, 4, -2],
        cast_shadow: false,
      },
    ];
  }

  return [
    {
      kind: "hemisphere",
      role: "ambient",
      intensity: input.ambient,
      color: "#f8fafc",
      ground_color: "#334155",
      cast_shadow: false,
    },
    {
      kind: "directional",
      role: "key",
      intensity: input.key,
      color: "#ffffff",
      position: [4, 7, 5],
      cast_shadow: true,
    },
    {
      kind: "directional",
      role: "fill",
      intensity: input.fill,
      color: "#dbeafe",
      position: [-5, 3, 4],
      cast_shadow: false,
    },
    {
      kind: "directional",
      role: "rim",
      intensity: input.rim,
      color: "#e9d5ff",
      position: [1, 5, -6],
      cast_shadow: false,
    },
  ];
}

export function normalizeShadowPolicy(
  input: Partial<RuntimeShadowPolicy> | null | undefined,
  fallback: RuntimeShadowPolicy,
): RuntimeShadowPolicy {
  const quality =
    input?.quality === "off" ||
    input?.quality === "low" ||
    input?.quality === "medium" ||
    input?.quality === "high"
      ? input.quality
      : fallback.quality;

  const mapSize =
    input?.map_size === 512 ||
    input?.map_size === 1024 ||
    input?.map_size === 2048
      ? input.map_size
      : fallback.map_size;

  return {
    enabled:
      quality !== "off" &&
      (input?.enabled ?? fallback.enabled),
    quality,
    max_shadow_lights:
      input?.max_shadow_lights === 0
        ? 0
        : Math.max(
            1,
            Math.min(
              2,
              Math.round(
                input?.max_shadow_lights ??
                  fallback.max_shadow_lights,
              ),
            ),
          ),
    map_size: mapSize,
    softness: clampEnvironmentNumber(
      input?.softness ?? fallback.softness,
      0,
      8,
    ),
    bias: clampEnvironmentNumber(
      input?.bias ?? fallback.bias,
      -0.02,
      0.02,
    ),
    normal_bias: clampEnvironmentNumber(
      input?.normal_bias ??
        fallback.normal_bias,
      0,
      0.2,
    ),
  };
}
