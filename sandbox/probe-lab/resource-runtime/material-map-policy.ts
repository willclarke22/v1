import type {
  MaterialTextureRole,
  RuntimeNormalMapConvention,
  RuntimeTextureColorSpace,
} from "./material-runtime-contract";

export const MATERIAL_ROLE_POLICY: Record<
  MaterialTextureRole,
  {
    color_space: RuntimeTextureColorSpace;
    required: boolean;
    principled_input: string;
    channel: "rgb" | "r" | "g" | "b" | "a";
  }
> = {
  base_color: {
    color_space: "srgb",
    required: true,
    principled_input: "Base Color",
    channel: "rgb",
  },
  normal: {
    color_space: "linear",
    required: false,
    principled_input: "Normal",
    channel: "rgb",
  },
  roughness: {
    color_space: "linear",
    required: false,
    principled_input: "Roughness",
    channel: "g",
  },
  metalness: {
    color_space: "linear",
    required: false,
    principled_input: "Metallic",
    channel: "b",
  },
  ambient_occlusion: {
    color_space: "linear",
    required: false,
    principled_input: "Ambient Occlusion",
    channel: "r",
  },
  opacity: {
    color_space: "linear",
    required: false,
    principled_input: "Alpha",
    channel: "r",
  },
  emissive: {
    color_space: "srgb",
    required: false,
    principled_input: "Emission Color",
    channel: "rgb",
  },
  height: {
    color_space: "linear",
    required: false,
    principled_input: "Displacement",
    channel: "r",
  },
  orm: {
    color_space: "linear",
    required: false,
    principled_input: "ORM packed",
    channel: "rgb",
  },
};

export function blenderColorSpaceForRole(
  role: MaterialTextureRole,
) {
  return MATERIAL_ROLE_POLICY[role]
    .color_space === "srgb"
    ? "sRGB"
    : "Non-Color";
}

export function normalScaleY(
  convention: RuntimeNormalMapConvention,
) {
  return convention === "directx"
    ? -1
    : 1;
}

export function validateUvPair(
  value: [number, number],
  label: string,
) {
  if (
    value.some(
      (entry) =>
        !Number.isFinite(entry),
    )
  ) {
    throw new Error(
      `${label} must contain finite numbers.`,
    );
  }
}

export function validateUnitFactor(
  value: number,
  label: string,
) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${label} must be between 0 and 1.`,
    );
  }
}

export function uniqueTextureUrls(
  maps: Partial<
    Record<
      MaterialTextureRole,
      { public_url: string }
    >
  >,
) {
  return Array.from(
    new Set(
      Object.values(maps)
        .map((entry) =>
          entry?.public_url.trim(),
        )
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  ).sort();
}
