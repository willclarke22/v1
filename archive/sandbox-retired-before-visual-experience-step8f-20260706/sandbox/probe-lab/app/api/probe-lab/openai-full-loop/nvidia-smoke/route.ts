import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SmokeBody = {
  model?: string;
  mode?: "plain" | "json" | "json_no_template";
  timeout_ms?: number;
  max_tokens?: number;
};

const NVIDIA_BASE_URL =
  (process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1").replace(/\/+$/g, "");

const DEBUG_FILE_RELATIVE = path.join(
  "sandbox",
  "probe-lab",
  "debug",
  "openai-full-loop",
  "latest-nvidia-smoke-debug.json",
);

const DEBUG_FILE_ABSOLUTE = path.join(process.cwd(), DEBUG_FILE_RELATIVE);
const DEBUG_FILE_DISPLAY = DEBUG_FILE_RELATIVE.split(path.sep).join("\\");

function apiKey() {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing NVIDIA_API_KEY. Add it to .env.local and restart pnpm dev.");
  }
  return key;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function outputText(value: unknown) {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
  const message = first.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : {};
  const content = message.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const item = part as Record<string, unknown>;
          return typeof item.text === "string" ? item.text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function writeDebug(snapshot: Record<string, unknown>) {
  await mkdir(path.dirname(DEBUG_FILE_ABSOLUTE), { recursive: true });
  await writeFile(DEBUG_FILE_ABSOLUTE, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "openai-full-loop/nvidia-smoke",
    calls_model: true,
    debug_file_path: DEBUG_FILE_DISPLAY,
    default_model: process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL?.trim() || "deepseek-ai/deepseek-v4-pro",
    base_url: NVIDIA_BASE_URL,
    has_nvidia_api_key: Boolean(process.env.NVIDIA_API_KEY?.trim()),
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as SmokeBody;

  const model = body.model?.trim() || process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL?.trim() || "deepseek-ai/deepseek-v4-pro";
  const mode = body.mode ?? "plain";
  const timeoutMs = numberInRange(body.timeout_ms, 45_000, 5_000, 120_000);
  const maxTokens = numberInRange(body.max_tokens, 80, 16, 600);

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: mode === "plain"
          ? "Reply with exactly: OK"
          : "Return only valid JSON.",
      },
      {
        role: "user",
        content: mode === "plain"
          ? "Say OK."
          : "Return this exact JSON object with no extra keys: {\"ok\":true,\"message\":\"smoke test\"}",
      },
    ],
    temperature: 0,
    top_p: 1,
    max_tokens: maxTokens,
    stream: false,
  };

  if (mode === "json" || mode === "json_no_template") {
    requestBody.response_format = { type: "json_object" };
  }

  if (mode !== "json_no_template") {
    requestBody.chat_template_kwargs = { enable_thinking: false, thinking: false };
  }

  try {
    const response = await fetchWithTimeout(
      NVIDIA_BASE_URL + "/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + apiKey(),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      timeoutMs,
    );

    const raw = await response.text();
    const elapsedMs = Date.now() - startedAt;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const snapshot = {
      schema_version: "myway_nvidia_smoke_debug_v1",
      generated_at: new Date().toISOString(),
      ok: response.ok,
      status: response.status,
      elapsed_ms: elapsedMs,
      base_url: NVIDIA_BASE_URL,
      model,
      mode,
      timeout_ms: timeoutMs,
      max_tokens: maxTokens,
      sent_request_body_without_auth: requestBody,
      raw_response_preview: raw.slice(0, 4000),
      output_text: parsed ? outputText(parsed) : null,
    };

    await writeDebug(snapshot);

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      elapsed_ms: elapsedMs,
      model,
      mode,
      output_text: snapshot.output_text,
      raw_response_preview: raw.slice(0, 1200),
      debug_file_path: DEBUG_FILE_DISPLAY,
      debug_file_absolute_path: DEBUG_FILE_ABSOLUTE,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    await writeDebug({
      schema_version: "myway_nvidia_smoke_debug_v1",
      generated_at: new Date().toISOString(),
      ok: false,
      elapsed_ms: elapsedMs,
      base_url: NVIDIA_BASE_URL,
      model,
      mode,
      timeout_ms: timeoutMs,
      max_tokens: maxTokens,
      sent_request_body_without_auth: requestBody,
      error: message,
    });

    return NextResponse.json({
      ok: false,
      elapsed_ms: elapsedMs,
      model,
      mode,
      error: message,
      debug_file_path: DEBUG_FILE_DISPLAY,
      debug_file_absolute_path: DEBUG_FILE_ABSOLUTE,
    }, { status: 500 });
  }
}
