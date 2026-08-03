import sharp from "sharp";

import {
  readAmbientCgCatalog,
  readAmbientCgMaterialAppearanceRegistry,
  writeAmbientCgMaterialAppearanceRegistry,
} from "./ambientcg-store.server";
import type {
  AmbientCgCatalogAsset,
  AmbientCgMaterialAppearanceProfile,
  AmbientCgMaterialBrightness,
} from "./ambientcg-types";

export const AMBIENTCG_MATERIAL_APPEARANCE_PROMPT_VERSION =
  "myway_ambientcg_material_appearance_prompt_v1_texture" as const;

const DEFAULT_MODEL =
  "nvidia/nemotron-nano-12b-v2-vl";

const COLOR_REFERENCES = [
  ["black", [20, 20, 20]],
  ["charcoal", [55, 58, 62]],
  ["dark gray", [85, 85, 85]],
  ["gray", [135, 135, 135]],
  ["light gray", [195, 195, 195]],
  ["white", [238, 238, 235]],
  ["cream", [226, 215, 184]],
  ["beige", [190, 166, 125]],
  ["tan", [166, 125, 79]],
  ["dark brown", [72, 46, 31]],
  ["brown", [119, 78, 48]],
  ["reddish brown", [130, 61, 43]],
  ["red", [176, 44, 42]],
  ["orange", [198, 94, 38]],
  ["yellow", [210, 177, 50]],
  ["olive", [105, 105, 44]],
  ["dark green", [38, 78, 51]],
  ["green", [61, 126, 69]],
  ["teal", [48, 113, 112]],
  ["navy", [33, 52, 84]],
  ["blue", [55, 103, 160]],
  ["purple", [102, 68, 126]],
  ["pink", [190, 116, 135]],
] as const;

function baseUrl(value: string | undefined) {
  return (value ?? "https://integrate.api.nvidia.com/v1")
    .replace(/\/$/, "");
}

function isLocalEndpoint(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i
    .test(`${value}/`);
}

function authorizationHeaders(
  endpoint: string,
): Record<string, string> {
  const apiKey =
    process.env.MYWAY_ASSET_NVIDIA_API_KEY?.trim() ||
    process.env.NVIDIA_API_KEY?.trim();

  if (!apiKey && !isLocalEndpoint(endpoint)) {
    throw new Error(
      "NVIDIA_API_KEY is required for hosted ambientCG material analysis.",
    );
  }

  return apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
}

function previewScore(url: string) {
  const value = url.toLowerCase();
  let score = 0;
  for (const [token, weight] of [
    ["2048", 2048],
    ["1024", 1024],
    ["512", 512],
    ["preview", 300],
    ["thumb", 50],
  ] as const) {
    if (value.includes(token)) score += weight;
  }
  return score;
}

function bestPreview(asset: AmbientCgCatalogAsset) {
  return [
    ...asset.preview_urls,
    ...asset.thumbnail_urls,
  ]
    .filter(Boolean)
    .sort((left, right) =>
      previewScore(right) - previewScore(left),
    )[0] ?? null;
}

async function fetchImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    60_000,
  );

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "MyWay-AmbientCG-Material-Appearance/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Material preview request failed with HTTP ${response.status}.`,
      );
    }
    const bytes =
      Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new Error(
        "The material preview response was empty.",
      );
    }
    if (bytes.length > 20 * 1024 * 1024) {
      throw new Error(
        "The material preview exceeded 20 MB.",
      );
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

type Rgb = [number, number, number];

function colorDistance(
  left: Rgb,
  right: readonly number[],
) {
  return Math.sqrt(
    (left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2,
  );
}

function colorName(color: Rgb) {
  return COLOR_REFERENCES
    .map(([name, reference]) => ({
      name,
      distance:
        colorDistance(color, reference),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance,
    )[0]?.name ?? "gray";
}

function initialCentroids(
  pixels: Rgb[],
) {
  const sorted = [...pixels].sort(
    (left, right) =>
      (
        left[0] + left[1] + left[2]
      ) - (
        right[0] + right[1] + right[2]
      ),
  );
  const positions = [0.18, 0.5, 0.82];
  return positions.map((position) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.floor(
          position * sorted.length,
        ),
      )
    ] ?? [128, 128, 128],
  ) as Rgb[];
}

function kMeansColors(
  pixels: Rgb[],
) {
  let centroids =
    initialCentroids(pixels);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const groups = centroids.map(
      () => [] as Rgb[],
    );
    for (const pixel of pixels) {
      const nearest =
        centroids
          .map((centroid, index) => ({
            index,
            distance:
              colorDistance(pixel, centroid),
          }))
          .sort(
            (left, right) =>
              left.distance - right.distance,
          )[0]?.index ?? 0;
      groups[nearest]!.push(pixel);
    }
    centroids = groups.map(
      (group, index) => {
        if (!group.length) {
          return centroids[index]!;
        }
        return [
          Math.round(
            group.reduce(
              (sum, value) =>
                sum + value[0],
              0,
            ) / group.length,
          ),
          Math.round(
            group.reduce(
              (sum, value) =>
                sum + value[1],
              0,
            ) / group.length,
          ),
          Math.round(
            group.reduce(
              (sum, value) =>
                sum + value[2],
              0,
            ) / group.length,
          ),
        ] as Rgb;
      },
    );
  }

  const counts =
    centroids.map(() => 0);
  for (const pixel of pixels) {
    const nearest =
      centroids
        .map((centroid, index) => ({
          index,
          distance:
            colorDistance(pixel, centroid),
        }))
        .sort(
          (left, right) =>
            left.distance - right.distance,
        )[0]?.index ?? 0;
    counts[nearest] =
      (counts[nearest] ?? 0) + 1;
  }

  return centroids
    .map((centroid, index) => ({
      centroid,
      count: counts[index] ?? 0,
    }))
    .sort(
      (left, right) =>
        right.count - left.count,
    );
}

async function measuredAppearance(
  bytes: Buffer,
) {
  const {
    data,
    info,
  } = await sharp(bytes)
    .rotate()
    .resize(96, 96, {
      fit: "cover",
    })
    .extract({
      left: 16,
      top: 16,
      width: 64,
      height: 64,
    })
    .removeAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  const pixels: Rgb[] = [];
  let luminanceTotal = 0;
  const channels = info.channels;

  for (
    let offset = 0;
    offset + 2 < data.length;
    offset += channels
  ) {
    const pixel: Rgb = [
      data[offset] ?? 0,
      data[offset + 1] ?? 0,
      data[offset + 2] ?? 0,
    ];
    pixels.push(pixel);
    luminanceTotal +=
      0.2126 * pixel[0] +
      0.7152 * pixel[1] +
      0.0722 * pixel[2];
  }

  const dominantColors =
    Array.from(
      new Set(
        kMeansColors(pixels)
          .slice(0, 3)
          .map((entry) =>
            colorName(entry.centroid),
          ),
      ),
    ).slice(0, 3);
  const meanLuminance =
    pixels.length
      ? luminanceTotal / pixels.length
      : 128;
  const brightness:
    AmbientCgMaterialBrightness =
      meanLuminance < 92
        ? "dark"
        : meanLuminance > 174
          ? "light"
          : "medium";

  return {
    dominantColors,
    brightness,
  };
}

function assistantText(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return "";
  }
  const choices =
    (value as Record<string, unknown>)
      .choices;
  if (
    !Array.isArray(choices) ||
    !choices.length
  ) {
    return "";
  }
  const first = choices[0];
  if (
    !first ||
    typeof first !== "object" ||
    Array.isArray(first)
  ) {
    return "";
  }
  const message =
    (first as Record<string, unknown>)
      .message;
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    return "";
  }
  const content =
    (message as Record<string, unknown>)
      .content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        Array.isArray(part)
      ) {
        return "";
      }
      const text =
        (part as Record<string, unknown>)
          .text;
      return typeof text === "string"
        ? text
        : "";
    })
    .join("");
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last <= first) {
      throw new Error(
        "The material vision model did not return a JSON object.",
      );
    }
    return JSON.parse(
      trimmed.slice(first, last + 1),
    ) as unknown;
  }
}

function normalizeVisionResult(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "The material vision model returned an invalid object.",
    );
  }
  const item =
    value as Record<string, unknown>;
  const summary =
    typeof item.summary === "string"
      ? item.summary.trim()
      : "";
  if (!summary) {
    throw new Error(
      "The material vision model did not provide a summary.",
    );
  }
  const confidence =
    Number(item.confidence);
  const warnings =
    Array.isArray(item.warnings)
      ? Array.from(
          new Set(
            item.warnings
              .filter(
                (
                  warning,
                ): warning is string =>
                  typeof warning ===
                  "string",
              )
              .map((warning) =>
                warning.trim(),
              )
              .filter(Boolean),
          ),
        ).slice(0, 8)
      : [];

  return {
    summary:
      summary
        .replace(/\s+/g, " ")
        .slice(0, 420),
    confidence:
      Number.isFinite(confidence)
        ? Math.max(
            0,
            Math.min(1, confidence),
          )
        : 0.5,
    warnings,
  };
}

async function visionDescription(
  asset:
    AmbientCgCatalogAsset,
  bytes: Buffer,
) {
  const endpoint =
    `${baseUrl(
      process.env
        .MYWAY_ASSET_VISION_BASE_URL ??
      process.env.NVIDIA_BASE_URL,
    )}/chat/completions`;
  const model =
    process.env
      .MYWAY_ASSET_VISION_MODEL
      ?.trim() ||
    DEFAULT_MODEL;
  const mime =
    await sharp(bytes)
      .metadata()
      .then((metadata: { format?: string }) =>
        metadata.format === "png"
          ? "image/png"
          : "image/jpeg",
      )
      .catch(() => "image/jpeg");
  const image =
    `data:${mime};base64,${bytes.toString("base64")}`;
  const prompt = [
    `ambientCG material id: ${asset.source_asset_id}.`,
    "Describe the visible surface appearance of this material in one concise sentence.",
    "Mention color character, visible texture, pattern or grain, surface variation, and apparent finish only when clearly visible.",
    "Do not infer brand, age, origin, durability, composition, or object suitability.",
    "Describe only what the preview visibly supports.",
    "Return only one JSON object with exactly these fields:",
    '{"summary":"one concise sentence","confidence":0.0,"warnings":[]}',
    "Warnings should be short and should only mention uncertainty caused by the preview, lighting, cropping, or an unclear surface.",
  ].join("\n");

  const controller =
    new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    180_000,
  );

  try {
    const response = await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/json",
          ...authorizationHeaders(
            endpoint,
          ),
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "/no_think\nReturn only valid JSON. Do not include Markdown or commentary.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: 420,
          stream: false,
        }),
        signal: controller.signal,
      },
    );
    const responseText =
      await response.text();
    if (!response.ok) {
      throw new Error(
        `Material appearance request failed with ${response.status}: ${responseText.slice(0, 800)}`,
      );
    }
    const payload =
      JSON.parse(responseText) as unknown;
    const text =
      assistantText(payload);
    if (!text.trim()) {
      throw new Error(
        "The material vision model returned no assistant text.",
      );
    }
    return {
      ...normalizeVisionResult(
        extractJsonObject(text),
      ),
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function saveProfile(
  profile:
    AmbientCgMaterialAppearanceProfile,
) {
  const registry =
    await readAmbientCgMaterialAppearanceRegistry();
  const profiles =
    registry.profiles.filter(
      (item) =>
        item.source_asset_id !==
        profile.source_asset_id,
    );
  profiles.push(profile);
  profiles.sort((left, right) =>
    left.source_asset_id.localeCompare(
      right.source_asset_id,
    ),
  );
  await writeAmbientCgMaterialAppearanceRegistry({
    schema_version:
      "myway_ambientcg_material_appearance_registry_v1",
    updated_at:
      new Date().toISOString(),
    profiles,
  });
  return profile;
}

function baseProfile(
  sourceAssetId: string,
  previewUrl: string | null,
): AmbientCgMaterialAppearanceProfile {
  return {
    schema_version:
      "myway_ambientcg_material_appearance_v1",
    source_asset_id:
      sourceAssetId,
    status: "pending",
    summary: null,
    dominant_colors: [],
    brightness: null,
    confidence: 0,
    warnings: [],
    preview_url: previewUrl,
    model: null,
    prompt_version:
      AMBIENTCG_MATERIAL_APPEARANCE_PROMPT_VERSION,
    analyzed_at: null,
    error: null,
  };
}

export async function analyzeAmbientCgMaterialAppearance(
  sourceAssetId: string,
) {
  const catalog =
    await readAmbientCgCatalog();
  const asset =
    catalog.assets.find(
      (item) =>
        item.source_asset_id ===
        sourceAssetId &&
        item.asset_type ===
        "material",
    );
  if (!asset) {
    throw new Error(
      `ambientCG material ${sourceAssetId} was not found in the mirrored catalog.`,
    );
  }
  const previewUrl =
    bestPreview(asset);
  if (!previewUrl) {
    throw new Error(
      `ambientCG material ${sourceAssetId} has no preview image.`,
    );
  }

  await saveProfile({
    ...baseProfile(
      sourceAssetId,
      previewUrl,
    ),
    status: "analyzing",
  });

  try {
    const bytes =
      await fetchImage(previewUrl);
    const [measured, vision] =
      await Promise.all([
        measuredAppearance(bytes),
        visionDescription(
          asset,
          bytes,
        ),
      ]);
    return await saveProfile({
      ...baseProfile(
        sourceAssetId,
        previewUrl,
      ),
      status: "ready",
      summary:
        vision.summary,
      dominant_colors:
        measured.dominantColors,
      brightness:
        measured.brightness,
      confidence:
        vision.confidence,
      warnings:
        vision.warnings,
      model:
        vision.model,
      analyzed_at:
        new Date().toISOString(),
    });
  } catch (caught) {
    const failed = {
      ...baseProfile(
        sourceAssetId,
        previewUrl,
      ),
      status: "failed" as const,
      analyzed_at:
        new Date().toISOString(),
      error:
        caught instanceof Error
          ? caught.message
          : String(caught),
    };
    await saveProfile(failed);
    throw caught;
  }
}

export async function analyzeAmbientCgMaterialBatch(
  input: {
    limit?: number;
    force?: boolean;
  } = {},
) {
  const limit =
    Math.max(
      1,
      Math.min(
        3,
        Math.round(
          input.limit ?? 1,
        ),
      ),
    );
  const [
    catalog,
    registry,
  ] = await Promise.all([
    readAmbientCgCatalog(),
    readAmbientCgMaterialAppearanceRegistry(),
  ]);
  const byId =
    new Map(
      registry.profiles.map(
        (profile) => [
          profile.source_asset_id,
          profile,
        ],
      ),
    );
  const candidates =
    catalog.assets
      .filter(
        (asset) =>
          asset.asset_type ===
            "material" &&
          Boolean(bestPreview(asset)) &&
          (
            input.force === true ||
            !byId.has(
              asset.source_asset_id,
            )
          ),
      )
      .slice(0, limit);
  const profiles:
    AmbientCgMaterialAppearanceProfile[] =
      [];
  const failures:
    Array<{
      source_asset_id: string;
      error: string;
    }> = [];

  for (const asset of candidates) {
    try {
      profiles.push(
        await analyzeAmbientCgMaterialAppearance(
          asset.source_asset_id,
        ),
      );
    } catch (caught) {
      failures.push({
        source_asset_id:
          asset.source_asset_id,
        error:
          caught instanceof Error
            ? caught.message
            : String(caught),
      });
    }
  }

  return {
    attempted:
      candidates.length,
    completed:
      profiles.length,
    failed:
      failures.length,
    profiles,
    failures,
  };
}

export async function ambientCgMaterialAppearanceMap() {
  const registry =
    await readAmbientCgMaterialAppearanceRegistry();
  return new Map(
    registry.profiles.map(
      (profile) => [
        profile.source_asset_id,
        profile,
      ],
    ),
  );
}
