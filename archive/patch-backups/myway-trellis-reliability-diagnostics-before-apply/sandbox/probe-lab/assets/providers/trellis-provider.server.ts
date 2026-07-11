import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureAssetDirectories, projectPath } from "../paths.server";

const TRELLIS_ENDPOINT = "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";

function recursiveStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((child) => recursiveStrings(child, output));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((child) => recursiveStrings(child, output));
  }
  return output;
}

function decodeCandidate(value: string) {
  const commaIndex = value.startsWith("data:") ? value.indexOf(",") : -1;
  const raw = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;

  if (raw.length < 1000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return null;

  try {
    const buffer = Buffer.from(raw.replace(/\s+/g, ""), "base64");
    return buffer.length > 512 ? buffer : null;
  } catch {
    return null;
  }
}

function isLikelyOutputUrl(candidate: string) {
  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    return false;
  }

  const lower = candidate.toLowerCase();
  return (
    lower.includes(".glb") ||
    lower.includes(".gltf") ||
    lower.includes("artifact") ||
    lower.includes("download") ||
    lower.includes("output")
  );
}

async function extractGlb(response: Response, rawDebugPath: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 512) return buffer;
    throw new Error("TRELLIS returned an unexpectedly small binary response.");
  }

  const text = await response.text();
  await writeFile(rawDebugPath, text, "utf8");

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    const decoded = decodeCandidate(text.trim());
    if (decoded) return decoded;
    throw new Error("TRELLIS returned neither JSON nor a binary GLB.");
  }

  const strings = recursiveStrings(payload);

  for (const candidate of strings) {
    const decoded = decodeCandidate(candidate);
    if (decoded) return decoded;
  }

  const url = strings.find(isLikelyOutputUrl);
  if (url) {
    const downloaded = await fetch(url);
    if (!downloaded.ok) {
      throw new Error(`TRELLIS output download failed with ${downloaded.status}.`);
    }
    return Buffer.from(await downloaded.arrayBuffer());
  }

  throw new Error("TRELLIS response did not contain a recognizable GLB payload.");
}

export async function requestTrellisGlb(input: {
  prompt: string;
  destinationPath: string;
  seed?: number;
}) {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY is missing from .env.local.");

  const prompt = input.prompt.trim().slice(0, 77);
  if (!prompt) throw new Error("TRELLIS prompt is empty.");

  await ensureAssetDirectories();
  await mkdir(path.dirname(input.destinationPath), { recursive: true });

  const debugPath = projectPath(
    "sandbox/probe-lab/assets/debug/latest-trellis-response.json",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8 * 60 * 1000);

  try {
    const response = await fetch(TRELLIS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "text",
        prompt,
        no_texture: false,
        output_format: "glb",
        samples: 1,
        seed: input.seed ?? 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `TRELLIS request failed (${response.status}): ${detail.slice(0, 1200)}`,
      );
    }

    const glb = await extractGlb(response, debugPath);
    await writeFile(input.destinationPath, glb);

    return {
      prompt,
      destination_path: input.destinationPath,
      bytes: glb.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}
