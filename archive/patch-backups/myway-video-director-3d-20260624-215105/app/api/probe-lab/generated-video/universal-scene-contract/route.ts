import { NextResponse } from "next/server";
import {
  buildFallbackUniversalSceneContract,
  normalizeUniversalSceneContract,
  stableUniversalSceneContractId,
  type UniversalSceneContract,
} from "@/ui/learning-space/probes/generated-video/universal-scene/universal-scene-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UniversalSceneProvider = "ollama" | "nvidia";

type UniversalSceneRequest = {
  learner_signal?: string;
  model?: string;
  provider?: UniversalSceneProvider;
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

type NvidiaChatResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    finish_reason?: string;
    message?: {
      role?: string;
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = process.env.MYWAY_OLLAMA_ANIMATION_MODEL ?? "qwen2.5:3b";

const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const DEFAULT_NVIDIA_MODEL = process.env.MYWAY_NVIDIA_ANIMATION_MODEL ?? "nvidia/nemotron-3-super-120b-a12b";

const REQUEST_TIMEOUT_MS = 540_000;
const PING_TIMEOUT_MS = 10_000;

function buildSystemPrompt() {
  return [
    "You are MyWay's Universal Animation Director Contract Generator.",
    "Return ONLY valid JSON. No markdown. No comments. No trailing commas.",
    "Do not write React, TypeScript, CSS, SVG markup, Remotion code, or executable code of any kind.",
    "You are not choosing a fixed subject template. The subject matter is invented from the learner message.",
    "Your job is to act as a semantic animation director: decide what concept, misconception, objects, relationship, motion, and checkpoint should be shown.",
    "The trusted MyWay renderer will draw the result. You must provide a clean director plan plus a safe universal scene graph.",
    "Prefer visual clarity over literal detail. Show one central relationship, one incorrect intuition if useful, and the corrected path or transformation.",
    "Use a simple educational animation grammar: actors, anchors, containers, arrows, paths, labels, highlights, ghost/wrong path, corrected path, freeze moment, and checkpoint.",
    "Keep the JSON compact, valid, and directly parseable.",
  ].join("\n");
}

function buildUserPrompt(learnerSignal: string) {
  return [
    `Learner message: ${learnerSignal}`,
    "",
    "Create one MyWay universal animation director contract draft.",
    "The model should decide what needs to be shown, but it must express that decision as safe JSON for MyWay to validate and Remotion to render.",
    "",
    "Return exactly one JSON object with these top-level keys:",
    "title, diagnosis_guess, learning_goal, director_plan, scene_style, elements, scenes, checkpoint.",
    "",
    "director_plan must be an object with:",
    "visual_intent, misconception_target, key_relationships, design_principles.",
    "key_relationships must be 2 to 5 short strings.",
    "design_principles must be 2 to 5 short strings that explain how the animation should make the idea visible.",
    "",
    "Important: do not use a prebuilt domain template. Invent the scene for this learner message.",
    "But do use a universal animation grammar:",
    "1. anchors: stable reference objects, such as a base, ledger, axis, paragraph, circuit node, or container.",
    "2. actors: moving or changing objects, such as a runner, charge, molecule, money record, claim, or variable.",
    "3. relationship marks: arrows, paths, labels, brackets, highlights, or ghost paths that reveal the hidden link.",
    "4. correction sequence: show the tempting wrong idea or missing step, then show the corrected relationship.",
    "",
    "elements must be an array of 7 to 14 visual objects.",
    "Each element must have: id, kind, label, x, y, tone, layer.",
    "Allowed element.kind values: card, rect, circle, ellipse, polygon, line, arrow, path, text, icon, highlight.",
    "Allowed tone values: purple, blue, cyan, green, yellow, orange, red, pink, gray, white.",
    "Useful optional element fields: text, icon, width, height, radius, rx, ry, points, from, to, d, opacity.",
    "",
    "Coordinate and layout rules:",
    "Use a 1280 by 720 canvas, but keep the main teaching scene inside the safe stage.",
    "Safe stage: x from 110 to 1170, y from 135 to 585.",
    "Do not place important objects, labels, points, arrows, or movement targets outside the safe stage.",
    "For cards, rects, and highlights, x and y are the top-left corner. Keep the full box inside the safe stage.",
    "For circles, ellipses, icons, and text, x and y are the center. Keep the center inside the safe stage.",
    "from and to must be [x,y] arrays for arrows or lines, and both points must be inside the safe stage.",
    "points must be an array of [x,y] arrays for polygons, and every point must be inside the safe stage.",
    "Do not create zero-length arrows or paths. The start and end should be visually separated.",
    "Avoid path.d unless it is really useful. If using d, keep every coordinate inside the safe stage.",
    "",
    "scenes must be exactly 3 scene objects.",
    "Each scene must have: id, title, caption, durationInFrames, focus, visible_element_ids, spotlight_element_ids, actions.",
    "durationInFrames should be between 110 and 165.",
    "Captions must be under 18 words.",
    "visible_element_ids and spotlight_element_ids must reference element ids.",
    "Each scene must introduce one visible change: a drawn path, moved actor, highlighted link, reveal, or scale/pulse.",
    "",
    "actions may include 1 to 4 objects.",
    "Allowed action.kind values: appear, fade, move_to, highlight, pulse, draw, scale_to.",
    "Each action must have target_id, kind, startFrame, endFrame.",
    "move_to actions may include to: { x, y }, and the destination must be inside the safe stage.",
    "",
    "Scene beat guidance:",
    "Scene 1: set up the learner's current picture with the key objects visible.",
    "Scene 2: reveal the missing rule, hidden relationship, wrong path, or state change.",
    "Scene 3: show the corrected explanation and ask a checkpoint.",
    "",
    "checkpoint must have prompt and expected_idea.",
    "Return JSON only.",
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

function contentToString(content: unknown) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const record = part as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          if (typeof record.content === "string") return record.content;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
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

function normalizeProviderDraft(args: {
  draft: unknown;
  model: string;
  provider: UniversalSceneProvider;
  learnerSignal: string;
}): UniversalSceneContract {
  const draftRecord = args.draft && typeof args.draft === "object" ? (args.draft as Record<string, unknown>) : {};

  return normalizeUniversalSceneContract(
    {
      ...draftRecord,
      schema_version: "myway_universal_scene_contract_v1",
      contract_id:
        typeof draftRecord.contract_id === "string" && draftRecord.contract_id.trim()
          ? draftRecord.contract_id
          : stableUniversalSceneContractId(
              `${args.provider}:${args.model}:${args.learnerSignal}:${JSON.stringify(draftRecord).slice(0, 600)}`,
            ),
      learner_signal: args.learnerSignal,
    },
    args.learnerSignal,
  );
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
        format: "json",
        options: {
          temperature: 0.1,
          top_p: 0.85,
          num_ctx: 2048,
          num_predict: 1200,
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
    throw new Error(`Ollama request failed (${response.status}) after ${elapsed_ms}ms. ${detail.slice(0, 640)}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = contentToString(data?.message?.content);

  if (!content.trim()) {
    throw new Error(`Ollama response did not include usable message.content after ${elapsed_ms}ms.`);
  }

  const draft = safeParseJson(content);
  const contract = normalizeProviderDraft({
    draft,
    provider: "ollama",
    model: args.model,
    learnerSignal: args.learnerSignal,
  });

  return {
    contract,
    meta: {
      elapsed_ms,
      done_reason: data.done_reason ?? null,
      prompt_eval_count: data.prompt_eval_count ?? null,
      eval_count: data.eval_count ?? null,
      raw_content_preview: content.slice(0, 900),
    },
  };
}

async function callNvidia(args: { learnerSignal: string; model: string }) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey?.trim()) {
    throw new Error("Missing NVIDIA_API_KEY. Add it to .env.local and restart pnpm dev.");
  }

  const startedAt = Date.now();

  const response = await fetchWithTimeout(
    `${NVIDIA_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0,
        top_p: 0.85,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        chat_template_kwargs: {
          enable_thinking: false,
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
    throw new Error(`NVIDIA request failed (${response.status}) after ${elapsed_ms}ms. ${detail.slice(0, 900)}`);
  }

  const data = (await response.json()) as NvidiaChatResponse;
  const content = contentToString(data?.choices?.[0]?.message?.content);

  if (!content.trim()) {
    throw new Error(`NVIDIA response did not include usable choices[0].message.content after ${elapsed_ms}ms.`);
  }

  const draft = safeParseJson(content);
  const contract = normalizeProviderDraft({
    draft,
    provider: "nvidia",
    model: args.model,
    learnerSignal: args.learnerSignal,
  });

  return {
    contract,
    meta: {
      elapsed_ms,
      finish_reason: data.choices?.[0]?.finish_reason ?? null,
      prompt_tokens: data.usage?.prompt_tokens ?? null,
      completion_tokens: data.usage?.completion_tokens ?? null,
      total_tokens: data.usage?.total_tokens ?? null,
      raw_content_preview: content.slice(0, 1200),
    },
  };
}

function normalizeProvider(value: unknown, model: string): UniversalSceneProvider {
  if (value === "nvidia" || model.startsWith("nvidia/")) return "nvidia";
  return "ollama";
}

function formatProviderError(error: unknown, provider: UniversalSceneProvider) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || /aborted/i.test(error.message)) {
      return `${provider} universal-scene generation timed out or was aborted after ${Math.round(
        REQUEST_TIMEOUT_MS / 1000,
      )}s.`;
    }
    return error.message;
  }

  return `Unknown ${provider} error`;
}

export async function GET() {
  const startedAt = Date.now();

  let ollamaStatus: unknown = null;

  try {
    const response = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, { method: "GET" }, PING_TIMEOUT_MS);
    const text = await response.text();
    ollamaStatus = {
      ok: response.ok,
      status: response.status,
      preview: text.slice(0, 800),
    };
  } catch (error) {
    ollamaStatus = {
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown Ollama ping error",
    };
  }

  return NextResponse.json({
    ok: true,
    route: "universal-scene-contract",
    elapsed_ms: Date.now() - startedAt,
    providers: {
      ollama: {
        base_url: OLLAMA_URL,
        default_model: DEFAULT_OLLAMA_MODEL,
        status: ollamaStatus,
      },
      nvidia: {
        base_url: NVIDIA_BASE_URL,
        default_model: DEFAULT_NVIDIA_MODEL,
        has_api_key: Boolean(process.env.NVIDIA_API_KEY?.trim()),
      },
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UniversalSceneRequest;
  const learnerSignal = body.learner_signal?.trim() || "I do not understand why a baseball runner has to tag up.";
  const requestedModel = body.model?.trim() || "";
  const provider = normalizeProvider(body.provider, requestedModel);
  const model = requestedModel || (provider === "nvidia" ? DEFAULT_NVIDIA_MODEL : DEFAULT_OLLAMA_MODEL);

  try {
    const result =
      provider === "nvidia"
        ? await callNvidia({ learnerSignal, model })
        : await callOllama({ learnerSignal, model });

    return NextResponse.json({
      ok: true,
      source: provider,
      provider,
      model,
      contract: result.contract,
      warnings: [
        `${provider} generated a universal scene graph in ${Math.round(
          result.meta.elapsed_ms / 1000,
        )}s; MyWay normalized it into a trusted Remotion contract.`,
      ],
      debug: result.meta,
    });
  } catch (error) {
    const fallbackContract = buildFallbackUniversalSceneContract(learnerSignal);
    const message = formatProviderError(error, provider);

    console.error("[myway-universal-scene-contract]", provider, message);

    return NextResponse.json(
      {
        ok: false,
        source: "fallback",
        provider,
        model,
        error: message,
        contract: fallbackContract,
        warnings: [
          `${provider} did not return a usable universal scene contract, so the sandbox returned MyWay's deterministic fallback contract.`,
          "This route expects arbitrary scene JSON. Check the pnpm dev terminal for [myway-universal-scene-contract].",
        ],
      },
      { status: 200 },
    );
  }
}