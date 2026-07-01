import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import {
  buildEngineReelContract,
  normalizeEngineReelContract,
  stableContractId,
  type EngineReelContract,
} from "@/ui/learning-space/probes/generated-video/remotion-reel/engine-reel-contract";

type OllamaContractRequest = {
  learner_signal?: string;
  model?: string;
};

type OllamaChatResponse = {
  message?: {
    content?: unknown;
  };
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.MYWAY_OLLAMA_ANIMATION_MODEL ?? "qwen2.5:3b";
const REQUEST_TIMEOUT_MS = 420_000;
const PING_TIMEOUT_MS = 10_000;

function buildSystemPrompt() {
  return [
    "You are MyWay's Animation Contract Generator.",
    "Return only valid JSON. No markdown. No comments.",
    "You are not writing React code. You are directing a trusted Remotion composition with JSON.",
    "Keep language clear for a learner. Avoid jargon unless the learner already used it.",
    "Create a small renderable video_explanation director contract.",
  ].join("\n");
}

function buildUserPrompt(learnerSignal: string) {
  return [
    `Learner message: ${learnerSignal}`,
    "Return only a compact JSON object with these keys:",
    "title, diagnosis_guess, learning_goal, scenes, checkpoint.",
    "scenes must be exactly 3 short objects with: id, kind, title, caption, focus.",
    "Allowed scene kind values: overview, ignition_power, checkpoint.",
    "Captions must be under 18 words each.",
    "Use the engine cutaway as the visual. Explain the missing cause/effect link.",
    "Do not include markdown. Do not include extra prose.",
  ].join("\n");
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeParseJson(content: string) {
  const stripped = stripCodeFence(content);
  try {
    return JSON.parse(stripped) as unknown;
  } catch (error) {
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as unknown;
    }
    throw error;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOllamaDraft(args: {
  draft: unknown;
  model: string;
  learnerSignal: string;
}): EngineReelContract {
  const draftRecord = args.draft && typeof args.draft === "object" ? (args.draft as Record<string, unknown>) : {};

  return normalizeEngineReelContract({
    ...draftRecord,
    schema_version: "myway_engine_reel_remotion_contract_v1",
    contract_id:
      typeof draftRecord.contract_id === "string" && draftRecord.contract_id.trim()
        ? draftRecord.contract_id
        : stableContractId(`${args.model}:${args.learnerSignal}:${JSON.stringify(draftRecord).slice(0, 280)}`),
    learner_signal: args.learnerSignal,
  });
}

async function callOllama(args: { learnerSignal: string; model: string }) {
  const startedAt = Date.now();

  const response = await fetchWithTimeout(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        stream: false,
        keep_alive: "10m",
        // Important: use lightweight JSON mode here instead of a huge strict JSON schema.
        // The sandbox normalizer below turns the model's compact draft into a full trusted contract.
        format: "json",
        options: {
          temperature: 0.1,
          top_p: 0.85,
          num_ctx: 1024,
          num_predict: 360,
        },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(args.learnerSignal) },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  const elapsed_ms = Date.now() - startedAt;

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama request failed (${response.status}) after ${elapsed_ms}ms. ${detail.slice(0, 420)}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`Ollama response did not include usable message.content after ${elapsed_ms}ms.`);
  }

  const draft = safeParseJson(content);
  const contract = normalizeOllamaDraft({ draft, model: args.model, learnerSignal: args.learnerSignal });

  return {
    contract,
    meta: {
      elapsed_ms,
      done_reason: data.done_reason ?? null,
      prompt_eval_count: data.prompt_eval_count ?? null,
      eval_count: data.eval_count ?? null,
      raw_content_preview: content.slice(0, 360),
    },
  };
}

function formatOllamaError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || /aborted/i.test(error.message)) {
      return `Ollama generation timed out or was aborted after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. The model may still be too slow on CPU for this prompt.`;
    }
    return error.message;
  }

  return "Unknown Ollama error";
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, { method: "GET" }, PING_TIMEOUT_MS);
    const text = await response.text();

    return NextResponse.json({
      ok: response.ok,
      ollama_base_url: OLLAMA_URL,
      default_model: DEFAULT_MODEL,
      status: response.status,
      elapsed_ms: Date.now() - startedAt,
      preview: text.slice(0, 800),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ollama_base_url: OLLAMA_URL,
        default_model: DEFAULT_MODEL,
        elapsed_ms: Date.now() - startedAt,
        error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown ping error",
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as OllamaContractRequest;
  const learnerSignal = body.learner_signal?.trim() || "I do not get how a gas engine makes the piston move.";
  const model = body.model?.trim() || DEFAULT_MODEL;

  try {
    const result = await callOllama({ learnerSignal, model });

    return NextResponse.json({
      ok: true,
      source: "ollama",
      model,
      contract: result.contract,
      warnings: [
        `Ollama generated a compact JSON draft in ${Math.round(result.meta.elapsed_ms / 1000)}s; MyWay normalized it into the trusted Remotion contract.`,
      ],
      debug: result.meta,
    });
  } catch (error) {
    const fallbackContract = buildEngineReelContract(learnerSignal);
    const message = formatOllamaError(error);

    console.error("[myway-ollama-contract]", message);

    return NextResponse.json(
      {
        ok: false,
        source: "fallback",
        model,
        error: message,
        contract: fallbackContract,
        warnings: [
          "Ollama did not return a usable contract, so the sandbox returned the deterministic fallback contract.",
          "This route now uses lightweight JSON mode. If this still fails, check the pnpm dev terminal for [myway-ollama-contract].",
        ],
      },
      { status: 200 },
    );
  }
}
