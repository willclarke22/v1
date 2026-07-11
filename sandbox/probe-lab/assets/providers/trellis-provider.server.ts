import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureAssetDirectories, projectPath } from "../paths.server";

const TRELLIS_ENDPOINT =
  "https://ai.api.nvidia.com/v1/genai/microsoft/trellis";

const DEFAULT_TOTAL_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [10_000, 30_000];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type TrellisAttemptDebug = {
  attempt: number;
  started_at: string;
  finished_at?: string;
  elapsed_ms?: number;
  status?: number;
  status_text?: string;
  content_type?: string;
  retry_after?: string | null;
  request_id?: string | null;
  nvcf_request_id?: string | null;
  response_bytes?: number;
  response_body_preview?: string;
  output_url?: string;
  error?: string;
  will_retry?: boolean;
};

type TrellisDebugRecord = {
  schema_version: "myway_trellis_debug_v1";
  endpoint: string;
  prompt: string;
  no_texture: boolean;
  output_format: "glb";
  seed: number;
  max_attempts: number;
  total_timeout_ms: number;
  started_at: string;
  finished_at?: string;
  total_elapsed_ms?: number;
  outcome: "running" | "completed" | "failed";
  output_bytes?: number;
  destination_path: string;
  attempts: TrellisAttemptDebug[];
  final_error?: string;
};

function recursiveStrings(
  value: unknown,
  output: string[] = [],
): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((child) => recursiveStrings(child, output));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((child) =>
      recursiveStrings(child, output),
    );
  }

  return output;
}

function isGlb(buffer: Buffer) {
  return (
    buffer.length > 20 &&
    buffer[0] === 0x67 &&
    buffer[1] === 0x6c &&
    buffer[2] === 0x54 &&
    buffer[3] === 0x46
  );
}

function assertGlb(buffer: Buffer, source: string) {
  if (!isGlb(buffer)) {
    throw new Error(
      `${source} did not contain a valid GLB file header.`,
    );
  }

  return buffer;
}

function decodeCandidate(value: string) {
  const commaIndex = value.startsWith("data:")
    ? value.indexOf(",")
    : -1;
  const raw =
    commaIndex >= 0 ? value.slice(commaIndex + 1) : value;

  if (
    raw.length < 1000 ||
    !/^[A-Za-z0-9+/=\r\n]+$/.test(raw)
  ) {
    return null;
  }

  try {
    const buffer = Buffer.from(
      raw.replace(/\s+/g, ""),
      "base64",
    );

    return isGlb(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

function isLikelyOutputUrl(candidate: string) {
  if (
    !candidate.startsWith("http://") &&
    !candidate.startsWith("https://")
  ) {
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

function safeUrlForDebug(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "unparseable-output-url";
  }
}

function headerValue(
  response: Response,
  names: string[],
) {
  for (const name of names) {
    const value = response.headers.get(name);
    if (value) return value;
  }

  return null;
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

function isAbortError(caught: unknown) {
  return (
    caught instanceof Error &&
    (caught.name === "AbortError" ||
      caught.message.toLowerCase().includes("aborted"))
  );
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function writeDebug(
  debugPath: string,
  record: TrellisDebugRecord,
) {
  await writeFile(
    debugPath,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  ).catch(() => undefined);
}

async function downloadOutputUrl(
  url: string,
  attempt: TrellisAttemptDebug,
) {
  attempt.output_url = safeUrlForDebug(url);

  const downloaded = await fetch(url);

  if (!downloaded.ok) {
    const detail = await downloaded.text().catch(() => "");

    throw new Error(
      `TRELLIS output download failed (${downloaded.status}): ` +
        detail.slice(0, 500),
    );
  }

  const buffer = Buffer.from(await downloaded.arrayBuffer());
  attempt.response_bytes = buffer.length;

  return assertGlb(buffer, "TRELLIS output download");
}

async function extractGlb(
  response: Response,
  attempt: TrellisAttemptDebug,
) {
  const contentType =
    response.headers.get("content-type") ?? "";

  attempt.content_type = contentType;

  if (!contentType.toLowerCase().includes("json")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    attempt.response_bytes = buffer.length;

    return assertGlb(buffer, "TRELLIS binary response");
  }

  const text = await response.text();
  attempt.response_body_preview = text.slice(0, 2000);

  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    const decoded = decodeCandidate(text.trim());

    if (decoded) {
      attempt.response_bytes = decoded.length;
      return decoded;
    }

    throw new Error(
      "TRELLIS returned neither valid JSON nor a binary GLB.",
    );
  }

  const strings = recursiveStrings(payload);

  for (const candidate of strings) {
    const decoded = decodeCandidate(candidate);

    if (decoded) {
      attempt.response_bytes = decoded.length;
      return decoded;
    }
  }

  const url = strings.find(isLikelyOutputUrl);

  if (url) {
    return downloadOutputUrl(url, attempt);
  }

  throw new Error(
    "TRELLIS response did not contain a recognizable GLB payload.",
  );
}

export async function requestTrellisGlb(input: {
  prompt: string;
  destinationPath: string;
  seed?: number;
  noTexture?: boolean;
  maxAttempts?: number;
  totalTimeoutMs?: number;
}) {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is missing from .env.local.",
    );
  }

  const prompt = input.prompt.trim().slice(0, 77);

  if (!prompt) {
    throw new Error("TRELLIS prompt is empty.");
  }

  await ensureAssetDirectories();
  await mkdir(path.dirname(input.destinationPath), {
    recursive: true,
  });

  const noTexture = input.noTexture === true;
  const seed = Math.max(0, Math.floor(input.seed ?? 0));
  const maxAttempts = Math.min(
    3,
    Math.max(
      1,
      Math.floor(input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
    ),
  );
  const totalTimeoutMs = Math.max(
    30_000,
    input.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
  );

  const debugPath = projectPath(
    "sandbox/probe-lab/assets/debug/latest-trellis-response.json",
  );
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + totalTimeoutMs;

  const debug: TrellisDebugRecord = {
    schema_version: "myway_trellis_debug_v1",
    endpoint: TRELLIS_ENDPOINT,
    prompt,
    no_texture: noTexture,
    output_format: "glb",
    seed,
    max_attempts: maxAttempts,
    total_timeout_ms: totalTimeoutMs,
    started_at: new Date(startedAtMs).toISOString(),
    outcome: "running",
    destination_path: input.destinationPath,
    attempts: [],
  };

  await writeDebug(debugPath, debug);

  let finalError = "TRELLIS request failed.";

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const remainingMs = deadlineMs - Date.now();

    if (remainingMs <= 0) {
      finalError =
        `TRELLIS exhausted its ${Math.round(
          totalTimeoutMs / 1000,
        )}-second request budget.`;
      break;
    }

    const attemptStartedMs = Date.now();
    const attempt: TrellisAttemptDebug = {
      attempt: attemptNumber,
      started_at: new Date(attemptStartedMs).toISOString(),
    };

    debug.attempts.push(attempt);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      remainingMs,
    );

    try {
      const response = await fetch(TRELLIS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json, application/octet-stream",
          "Content-Type": "application/json",
          "User-Agent": "MyWay-TRELLIS-Provider/1.0",
        },
        body: JSON.stringify({
          mode: "text",
          prompt,
          no_texture: noTexture,
          output_format: "glb",
          samples: 1,
          seed,
        }),
        signal: controller.signal,
      });

      attempt.status = response.status;
      attempt.status_text = response.statusText;
      attempt.content_type =
        response.headers.get("content-type") ?? "";
      attempt.retry_after =
        response.headers.get("retry-after");
      attempt.request_id = headerValue(response, [
        "x-request-id",
        "request-id",
        "x-correlation-id",
      ]);
      attempt.nvcf_request_id = headerValue(response, [
        "nvcf-request-id",
        "x-nvcf-request-id",
      ]);

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        attempt.response_body_preview = detail.slice(0, 2000);

        const retryable = RETRYABLE_STATUS_CODES.has(
          response.status,
        );
        const delayMs =
          RETRY_DELAYS_MS[attemptNumber - 1] ?? 0;
        const canRetry =
          retryable &&
          attemptNumber < maxAttempts &&
          Date.now() + delayMs < deadlineMs;

        attempt.will_retry = canRetry;
        finalError =
          `TRELLIS request failed (${response.status}): ` +
          (detail.trim() || response.statusText || "No response detail");

        if (!canRetry) {
          throw new Error(finalError);
        }

        attempt.finished_at = new Date().toISOString();
        attempt.elapsed_ms = Date.now() - attemptStartedMs;
        await writeDebug(debugPath, debug);
        clearTimeout(timeout);
        await sleep(delayMs);
        continue;
      }

      const glb = await extractGlb(response, attempt);
      await writeFile(input.destinationPath, glb);

      attempt.finished_at = new Date().toISOString();
      attempt.elapsed_ms = Date.now() - attemptStartedMs;

      debug.outcome = "completed";
      debug.output_bytes = glb.length;
      debug.finished_at = new Date().toISOString();
      debug.total_elapsed_ms = Date.now() - startedAtMs;

      await writeDebug(debugPath, debug);

      return {
        prompt,
        destination_path: input.destinationPath,
        bytes: glb.length,
        no_texture: noTexture,
        attempts: attemptNumber,
        debug_path:
          "sandbox/probe-lab/assets/debug/latest-trellis-response.json",
      };
    } catch (caught) {
      const message = isAbortError(caught)
        ? `TRELLIS request timed out after ${Math.round(
            totalTimeoutMs / 1000,
          )} seconds.`
        : errorMessage(caught);

      attempt.error = message;
      attempt.finished_at = new Date().toISOString();
      attempt.elapsed_ms = Date.now() - attemptStartedMs;
      finalError = message;

      const delayMs =
        RETRY_DELAYS_MS[attemptNumber - 1] ?? 0;
      const canRetryNetworkError =
        attempt.status == null &&
        !isAbortError(caught) &&
        attemptNumber < maxAttempts &&
        Date.now() + delayMs < deadlineMs;

      attempt.will_retry =
        attempt.will_retry ?? canRetryNetworkError;

      await writeDebug(debugPath, debug);

      if (canRetryNetworkError) {
        clearTimeout(timeout);
        await sleep(delayMs);
        continue;
      }

      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  debug.outcome = "failed";
  debug.finished_at = new Date().toISOString();
  debug.total_elapsed_ms = Date.now() - startedAtMs;
  debug.final_error = finalError;

  await writeDebug(debugPath, debug);

  throw new Error(
    `${finalError} See sandbox/probe-lab/assets/debug/` +
      "latest-trellis-response.json for attempt details.",
  );
}
