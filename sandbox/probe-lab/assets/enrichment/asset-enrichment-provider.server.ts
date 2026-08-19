
import { readFile } from "node:fs/promises";

import type { MyWayAssetRecord } from "../asset-types";

const DEFAULT_ASSET_OMNI_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const LEGACY_ASSET_VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl";

export const ASSET_APPEARANCE_PROMPT_VERSION =
  "myway_asset_appearance_prompt_v3_style_personalization";
export const ASSET_ANALYSIS_RENDER_VERSION =
  "myway_asset_analysis_render_v1";

export type AssetAppearanceAnalysis = {
  summary: string;
  style_descriptors: string[];
  design_era: string[];
  realism_level: string[];
  shape_language: string[];
  material_treatment: string[];
  color_palette: string[];
  surface_condition: string[];
  ornamentation: string[];
  visual_mood: string[];
  detail_level: string[];
  scene_compatibility: string[];
  descriptors: string[];
  materials: string[];
  colors: string[];
  geometry: string[];
  warnings: string[];
  confidence: number;
};

function baseUrl(value: string | undefined) {
  return (value ?? "https://integrate.api.nvidia.com/v1").replace(
    /\/$/,
    "",
  );
}

function isLocalEndpoint(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(
    `${value}/`,
  );
}

function authorizationHeaders(endpoint: string): Record<string, string> {
  const apiKey =
    process.env.MYWAY_ASSET_NVIDIA_API_KEY?.trim() ||
    process.env.NVIDIA_API_KEY?.trim();

  if (!apiKey && !isLocalEndpoint(endpoint)) {
    throw new Error(
      "NVIDIA_API_KEY is required for hosted asset enrichment. A local NIM endpoint may be used without a key.",
    );
  }

  return apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authorizationHeaders(endpoint),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Asset enrichment request failed with ${response.status}: ${text.slice(0, 1200)}`,
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `Asset enrichment endpoint returned invalid JSON: ${text.slice(0, 1200)}`,
      );
    }
  } catch (caught) {
    if (
      caught instanceof Error &&
      (caught.name === "AbortError" ||
        caught.message.toLowerCase().includes("aborted"))
    ) {
      throw new Error(
        `Asset enrichment request exceeded ${Math.round(timeoutMs / 1000)} seconds.`,
      );
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function assistantText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const first = choices[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return "";
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return "";
  }
  const content = (message as Record<string, unknown>).content;

  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        return "";
      }
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
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
      throw new Error("The vision model did not return a JSON object.");
    }
    return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
  }
}

function strings(value: unknown, limit = 16) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function normalizeAnalysis(value: unknown): AssetAppearanceAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The vision model returned an invalid appearance object.");
  }

  const item = value as Record<string, unknown>;
  const summary =
    typeof item.summary === "string" ? item.summary.trim() : "";
  if (!summary) {
    throw new Error("The vision model did not provide an appearance summary.");
  }

  const confidenceValue = Number(item.confidence);

  return {
    summary: summary.slice(0, 1200),
    style_descriptors: strings(item.style_descriptors),
    design_era: strings(item.design_era, 8),
    realism_level: strings(item.realism_level, 8),
    shape_language: strings(item.shape_language),
    material_treatment: strings(item.material_treatment),
    color_palette: strings(item.color_palette),
    surface_condition: strings(item.surface_condition),
    ornamentation: strings(item.ornamentation),
    visual_mood: strings(item.visual_mood),
    detail_level: strings(item.detail_level, 8),
    scene_compatibility: strings(item.scene_compatibility),
    descriptors: strings(item.descriptors),
    materials: strings(item.materials),
    colors: strings(item.colors),
    geometry: strings(item.geometry),
    warnings: strings(item.warnings, 12),
    confidence: Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(1, confidenceValue))
      : 0.5,
  };
}

function identityLabel(asset: MyWayAssetRecord) {
  return (
    asset.verified_canonical_label ||
    asset.requested_concept ||
    asset.canonical_label
  );
}

export async function analyzeAssetAppearance(input: {
  asset: MyWayAssetRecord;
  viewFilePaths: string[];
}) {
  if (input.viewFilePaths.length !== 4) {
    throw new Error(
      `Appearance analysis requires four standardized renders; received ${input.viewFilePaths.length}.`,
    );
  }

  const endpoint = `${baseUrl(
    process.env.MYWAY_ASSET_VISION_BASE_URL ??
      process.env.NVIDIA_BASE_URL,
  )}/chat/completions`;
  const configuredVisionModel =
    process.env.MYWAY_ASSET_VISION_MODEL?.trim();
  const model =
    !configuredVisionModel ||
    configuredVisionModel === LEGACY_ASSET_VISION_MODEL
      ? DEFAULT_ASSET_OMNI_MODEL
      : configuredVisionModel;
  const images = await Promise.all(
    input.viewFilePaths.map(async (filePath) => {
      const bytes = await readFile(filePath);
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }),
  );

  const prompt = [
    "Analyze the same 3D asset from four standardized views.",
    `Expected object identity: ${identityLabel(input.asset)}.`,
    `Source title: ${input.asset.source_display_name ?? input.asset.display_name}.`,
    "The identity is context only. Your main task is to describe the asset's visible visual style so it can later be matched to scene intent and a learner's contextual visual preferences.",
    "Describe only what the images visibly support. Do not judge identity correctness and do not invent hidden properties, internal mechanisms, printed content, historical provenance, brand, or unseen functions.",
    "Prioritize style over restating what the object is: rendering treatment, realism versus stylization, design era or aesthetic language, silhouette and shape language, material treatment, palette character, surface condition, ornamentation, mood, level of detail, and the kinds of scenes whose visual language it would fit.",
    "Use open vocabulary rather than a fixed taxonomy. A field may contain multiple short phrases. Use an empty array when a quality is not visibly supportable.",
    "The summary must be style-first, concise, and distinctive: one or two sentences, usually 35 to 80 words. Mention the identity only when needed for readability. Avoid generic lead-ins such as 'A rectangular object' or merely repeating the expected identity.",
    "Scene compatibility must describe visual compatibility only, such as stylized educational scene, antique storybook environment, realistic modern interior, low-poly game scene, or minimalist diagram. Do not claim functional suitability.",
    "Keep descriptors, materials, colors, and geometry as supporting visible facts for ordinary asset matching, but do not let them dominate the style fields.",
    "Return only one JSON object with exactly these fields:",
    '{"summary":"style-first compact description","style_descriptors":["..."],"design_era":["..."],"realism_level":["..."],"shape_language":["..."],"material_treatment":["..."],"color_palette":["..."],"surface_condition":["..."],"ornamentation":["..."],"visual_mood":["..."],"detail_level":["..."],"scene_compatibility":["..."],"descriptors":["..."],"materials":["..."],"colors":["..."],"geometry":["..."],"warnings":["..."],"confidence":0.0}',
    "Warnings should mention uncertainty, missing textures, clipping, incomplete geometry, multiple objects, or view disagreement when visible.",
  ].join("\n");

  const response = await postJson(
    endpoint,
    {
      model,
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not include Markdown or commentary.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...images.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
      frequency_penalty: 0,
      presence_penalty: 0,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 4096,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    },
    180_000,
  );
  const text = assistantText(response);
  if (!text.trim()) {
    throw new Error("The vision model returned no assistant text.");
  }

  return {
    analysis: normalizeAnalysis(extractJsonObject(text)),
    model,
  };
}

async function embedAppearanceText(
  text: string,
  inputType: "passage" | "query",
) {
  const endpoint = `${baseUrl(
    process.env.MYWAY_ASSET_EMBED_BASE_URL ??
      process.env.NVIDIA_EMBED_BASE_URL ??
      process.env.NVIDIA_BASE_URL,
  )}/embeddings`;
  const model =
    process.env.MYWAY_ASSET_EMBED_MODEL?.trim() ||
    "nvidia/nemotron-3-embed-1b";
  const response = await postJson(
    endpoint,
    {
      input: [text],
      model,
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    },
    120_000,
  );

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("The embedding endpoint returned an invalid response.");
  }
  const data = (response as Record<string, unknown>).data;
  if (!Array.isArray(data) || !data.length) {
    throw new Error("The embedding endpoint returned no vector.");
  }
  const first = data[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    throw new Error("The embedding endpoint returned an invalid vector entry.");
  }
  const rawVector = (first as Record<string, unknown>).embedding;
  if (!Array.isArray(rawVector)) {
    throw new Error("The embedding endpoint did not return a float vector.");
  }
  const vector = rawVector.map(Number);
  if (
    !vector.length ||
    vector.some((entry) => !Number.isFinite(entry))
  ) {
    throw new Error("The embedding endpoint returned a malformed float vector.");
  }

  return { model, vector };
}

export function embedAssetAppearance(text: string) {
  return embedAppearanceText(text, "passage");
}

export function embedAppearanceQuery(text: string) {
  return embedAppearanceText(text, "query");
}
