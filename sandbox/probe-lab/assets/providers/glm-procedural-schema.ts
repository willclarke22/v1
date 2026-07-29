export type GlmPrimitiveKind = "box" | "cylinder" | "sphere";

export type GlmProceduralPart = {
  name: string;
  primitive: GlmPrimitiveKind;
  position: [number, number, number];
  rotation_deg: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number, number];
  metallic: number;
  roughness: number;
  radial_segments?: number;
};

export type GlmProceduralAssetPlan = {
  schema_version: "myway_glm_procedural_asset_v1";
  canonical_label: string;
  aliases: string[];
  semantic_tags: string[];
  suitability: "strong" | "moderate" | "weak";
  suitability_reason: string;
  parts: GlmProceduralPart[];
};

const MAX_PARTS = 32;

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec3(value: unknown, fallback: [number, number, number]) {
  const input = Array.isArray(value) ? value : [];
  return [
    finite(input[0], fallback[0]),
    finite(input[1], fallback[1]),
    finite(input[2], fallback[2]),
  ] as [number, number, number];
}

function color4(value: unknown) {
  const input = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) =>
    Math.min(1, Math.max(0, finite(input[index], index === 3 ? 1 : 0.7))),
  ) as [number, number, number, number];
}

function text(value: unknown, max = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, 80)).filter(Boolean))].slice(0, maxItems);
}

export function parseGlmProceduralAssetPlan(raw: unknown): GlmProceduralAssetPlan {
  if (!raw || typeof raw !== "object") throw new Error("GLM did not return an object build plan.");
  const input = raw as Record<string, unknown>;
  const canonicalLabel = text(input.canonical_label);
  if (!canonicalLabel) throw new Error("GLM build plan is missing canonical_label.");

  const rawParts = Array.isArray(input.parts) ? input.parts : [];
  if (rawParts.length < 1) throw new Error("GLM build plan did not contain any parts.");
  if (rawParts.length > MAX_PARTS) throw new Error(`GLM build plan exceeded the ${MAX_PARTS}-part safety limit.`);

  const parts = rawParts.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`GLM part ${index + 1} is invalid.`);
    const part = entry as Record<string, unknown>;
    const primitive = text(part.primitive, 20) as GlmPrimitiveKind;
    if (!(["box", "cylinder", "sphere"] as string[]).includes(primitive)) {
      throw new Error(`GLM part ${index + 1} used unsupported primitive '${primitive}'.`);
    }
    const scaleValue = vec3(part.scale, [1, 1, 1]).map((value) => Math.min(20, Math.max(0.01, Math.abs(value)))) as [number, number, number];
    return {
      name: text(part.name, 80) || `part_${index + 1}`,
      primitive,
      position: vec3(part.position, [0, 0, 0]).map((value) => Math.min(50, Math.max(-50, value))) as [number, number, number],
      rotation_deg: vec3(part.rotation_deg, [0, 0, 0]).map((value) => Math.min(360, Math.max(-360, value))) as [number, number, number],
      scale: scaleValue,
      color: color4(part.color),
      metallic: Math.min(1, Math.max(0, finite(part.metallic, 0))),
      roughness: Math.min(1, Math.max(0.02, finite(part.roughness, 0.65))),
      radial_segments: primitive === "cylinder"
        ? Math.min(64, Math.max(8, Math.round(finite(part.radial_segments, 24))))
        : undefined,
    } satisfies GlmProceduralPart;
  });

  const suitability = text(input.suitability, 20);
  return {
    schema_version: "myway_glm_procedural_asset_v1",
    canonical_label: canonicalLabel,
    aliases: list(input.aliases),
    semantic_tags: list(input.semantic_tags),
    suitability: suitability === "strong" || suitability === "weak" ? suitability : "moderate",
    suitability_reason: text(input.suitability_reason, 500) || "No suitability explanation was returned.",
    parts,
  };
}
