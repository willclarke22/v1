
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type Cosmos3NanoRequest = {
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  num_output_frames?: number;
  fps?: number;
  seed?: number;
  steps?: number;
  guidance_scale?: number;
};

export type Cosmos3NanoResult = {
  endpoint: string;
  request_payload: Cosmos3NanoRequest;
  response_metadata: Record<string, unknown>;
  video_url: string;
  video_path: string;
  video_bytes: number;
  duration_ms: number;
};

const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

function timeoutMs() {
  const raw = Number.parseInt(
    process.env.MYWAY_COSMOS3_NANO_TIMEOUT_MS ?? "",
    10,
  );

  return Number.isFinite(raw)
    ? Math.min(Math.max(raw, 30_000), 600_000)
    : 300_000;
}

function configuredEndpoint() {
  const endpoint = process.env.MYWAY_COSMOS3_NANO_ENDPOINT?.trim();

  if (!endpoint) {
    throw new Error(
      "MYWAY_COSMOS3_NANO_ENDPOINT is not configured. Copy the current Cosmos3 Nano inference URL from the NVIDIA Build API/integration panel into .env.local. NVIDIA's public model card documents the /v1/infer-style payload but does not currently expose one stable hosted URL in its public page.",
    );
  }

  return endpoint;
}

function publicOutputRoot() {
  return path.join(
    process.cwd(),
    "public",
    "sandbox-generated",
    "cosmos3-nano",
  );
}

function safeMetadata(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const record = { ...(payload as Record<string, unknown>) };
  delete record.b64_video;
  return record;
}

export async function generateCosmos3NanoVideo(
  requestPayload: Cosmos3NanoRequest,
): Promise<Cosmos3NanoResult> {
  const endpoint = configuredEndpoint();
  const apiKey = process.env.NVIDIA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is required for Cosmos3 Nano.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawText = await response.text();
    let payload: unknown = null;

    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const providerMessage =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        "error" in payload
          ? JSON.stringify((payload as Record<string, unknown>).error)
          : rawText.slice(0, 1200);

      throw new Error(
        `Cosmos3 Nano request failed with HTTP ${response.status}: ${
          providerMessage || response.statusText
        }`,
      );
    }

    const b64Video =
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).b64_video === "string"
        ? ((payload as Record<string, unknown>).b64_video as string)
        : "";

    if (!b64Video) {
      throw new Error(
        "Cosmos3 Nano returned no b64_video field. Check that the configured endpoint is the generator /v1/infer endpoint.",
      );
    }

    const videoBuffer = Buffer.from(b64Video, "base64");

    if (!videoBuffer.length) {
      throw new Error("Cosmos3 Nano returned an empty decoded video.");
    }

    if (videoBuffer.length > MAX_VIDEO_BYTES) {
      throw new Error(
        `Cosmos3 Nano returned ${videoBuffer.length} bytes, exceeding the ${MAX_VIDEO_BYTES}-byte sandbox safety limit.`,
      );
    }

    const fileName = `cosmos3_${Date.now().toString(36)}_${randomUUID()
      .slice(0, 8)}.mp4`;
    const outputRoot = publicOutputRoot();
    const outputPath = path.join(outputRoot, fileName);

    await mkdir(outputRoot, { recursive: true });
    await writeFile(outputPath, videoBuffer);

    return {
      endpoint,
      request_payload: requestPayload,
      response_metadata: safeMetadata(payload),
      video_url: `/sandbox-generated/cosmos3-nano/${fileName}`,
      video_path: outputPath,
      video_bytes: videoBuffer.length,
      duration_ms: Date.now() - startedAt,
    };
  } catch (caught) {
    if (
      caught instanceof Error &&
      (caught.name === "AbortError" ||
        /aborted|timeout/i.test(caught.message))
    ) {
      throw new Error(
        `Cosmos3 Nano exceeded the ${timeoutMs()} ms local timeout.`,
      );
    }

    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}
