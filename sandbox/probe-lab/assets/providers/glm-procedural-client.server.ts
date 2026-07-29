import { parseGlmProceduralAssetPlan } from "./glm-procedural-schema";

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("GLM response did not contain a JSON object.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function requestGlmProceduralPlan(input: {
  concept: string;
  details: string[];
  style: string;
}) {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY is required for GLM procedural asset generation.");
  const endpoint = (process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const model = process.env.MYWAY_GLM_ASSET_MODEL ?? process.env.MYWAY_GLM_MODEL ?? "z-ai/glm-5.2";

  const system = `You design compact procedural 3D assets for a deterministic GLB compiler. Return JSON only. Use only box, cylinder, and sphere primitives. Never output code. Keep the asset centered near the origin with its bottom near y=0. Use y as vertical. Use no more than 32 parts. Prefer symmetry and repeated simple parts. This system is best for geometric, mechanical, educational, furniture, toy-like, and stylized objects. For highly organic or photorealistic subjects, still provide the best stylized approximation but mark suitability weak.\n\nRequired JSON schema:\n{\n  "schema_version":"myway_glm_procedural_asset_v1",\n  "canonical_label":"string",\n  "aliases":["string"],\n  "semantic_tags":["string"],\n  "suitability":"strong|moderate|weak",\n  "suitability_reason":"string",\n  "parts":[{\n    "name":"string",\n    "primitive":"box|cylinder|sphere",\n    "position":[x,y,z],\n    "rotation_deg":[x,y,z],\n    "scale":[x,y,z],\n    "color":[r,g,b,a],\n    "metallic":0,\n    "roughness":0.65,\n    "radial_segments":24\n  }]\n}`;
  const user = `Create a reusable procedural asset.\nObject: ${input.concept}\nDetails: ${input.details.join(", ") || "none"}\nStyle: ${input.style || "clean stylized"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 7000,
        stream: false,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) throw new Error(payload?.error?.message ?? `GLM request failed with HTTP ${response.status}.`);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("GLM returned no message content.");
    return { plan: parseGlmProceduralAssetPlan(extractJson(content)), model };
  } finally {
    clearTimeout(timeout);
  }
}
