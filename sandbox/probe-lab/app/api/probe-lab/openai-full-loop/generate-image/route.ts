import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { DEFAULT_IMAGE_MODEL, OPENAI_BASE_URL, apiKey, text } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageRequest = {
  prompt?: string;
  model?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
};

function b64FromResponse(data: unknown): string | null {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const items = Array.isArray(record.data) ? record.data : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const candidate = (item as Record<string, unknown>).b64_json;
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as ImageRequest;
  const prompt = text(body.prompt, "Create a polished educational concept image that makes the learner's root problem visible.", 2400);
  const model = body.model?.trim() || DEFAULT_IMAGE_MODEL;
  const size = body.size ?? "1536x1024";

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, prompt, size }),
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`OpenAI image request failed (${response.status}): ${raw.slice(0, 1200)}`);

    const b64 = b64FromResponse(JSON.parse(raw));
    if (!b64) throw new Error(`OpenAI image response did not include data[0].b64_json. Raw preview: ${raw.slice(0, 1000)}`);

    const publicDir = path.join(process.cwd(), "public", "generated-probe-images");
    await mkdir(publicDir, { recursive: true });
    const fileName = `myway_probe_image_${Date.now()}_${randomUUID().slice(0, 8)}.png`;
    await writeFile(path.join(publicDir, fileName), Buffer.from(b64, "base64"));

    return NextResponse.json({
      ok: true,
      model,
      size,
      elapsed_ms: Date.now() - startedAt,
      image_url: `/generated-probe-images/${fileName}`,
      prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI image error";
    console.error("[myway-openai-full-loop/generate-image]", message);
    return NextResponse.json({ ok: false, model, size, elapsed_ms: Date.now() - startedAt, error: message }, { status: 500 });
  }
}
