import type { VisualLearningTurnModelRequest } from "./visual-learning-turn-request";

export type VisualLearningTurnModelProvider = "scaffold" | "openai" | "nvidia" | "deepseek" | "nemotron";

export type VisualLearningTurnProviderResult = {
  provider: VisualLearningTurnModelProvider;
  provider_used: "scaffold" | "openai" | "nvidia";
  model: string;
  raw_text: string;
  duration_ms: number;
  request_payload_preview?: Record<string, unknown>;
};

type ChatCompletionMessage = {
  role: "system" | "user";
  content: string;
};

type ChatPostResult = {
  raw_text: string;
  duration_ms: number;
  response_chars: number;
};

function normalizeProviderName(value: unknown): VisualLearningTurnModelProvider {
  if (
    value === "openai" ||
    value === "nvidia" ||
    value === "deepseek" ||
    value === "nemotron" ||
    value === "scaffold"
  ) {
    return value;
  }

  const envProvider = process.env.MYWAY_VISUAL_EXPERIENCE_MODEL_PROVIDER ?? process.env.MYWAY_SANDBOX_MODEL_PROVIDER;
  if (envProvider === "openai" || envProvider === "nvidia" || envProvider === "deepseek" || envProvider === "nemotron") {
    return envProvider;
  }

  return "scaffold";
}

function numberFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function getChoiceText(value: unknown): string {
  const response = value as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
      text?: string;
    }>;
  };

  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" || typeof part.text === "string" ? part.text ?? "" : ""))
      .join("\n")
      .trim();
  }

  if (typeof choice?.text === "string") return choice.text;

  return "";
}

async function postChatCompletions(args: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  providerLabel: string;
  timeoutMs: number;
}): Promise<ChatPostResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  let response: Response;

  try {
    response = await fetch(args.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${args.providerLabel} model call timed out after ${args.timeoutMs}ms.`);
    }
    throw new Error(`${args.providerLabel} model call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const durationMs = Date.now() - startedAt;
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorText = typeof json === "object" && json !== null ? JSON.stringify(json).slice(0, 1200) : text.slice(0, 1200);
    throw new Error(`${args.providerLabel} model call failed with ${response.status} after ${durationMs}ms: ${errorText}`);
  }

  const choiceText = getChoiceText(json);
  if (!choiceText.trim()) {
    throw new Error(`${args.providerLabel} model call returned no assistant text after ${durationMs}ms.`);
  }

  return {
    raw_text: choiceText,
    duration_ms: durationMs,
    response_chars: choiceText.length,
  };
}

function visualExperienceMaxTokens() {
  // Step 6c reliability: lower default to reduce NVIDIA/DeepSeek 504s.
  return numberFromEnv("MYWAY_VISUAL_EXPERIENCE_MAX_TOKENS", 2400);
}

function visualExperienceTimeoutMs() {
  return numberFromEnv("MYWAY_VISUAL_EXPERIENCE_PROVIDER_TIMEOUT_MS", 65000);
}

async function callOpenAI(modelRequest: VisualLearningTurnModelRequest): Promise<VisualLearningTurnProviderResult> {
  const apiKey = process.env.MYWAY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY or MYWAY_OPENAI_API_KEY.");

  const model =
    process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL ??
    process.env.MYWAY_OPENAI_FULL_LOOP_MODEL ??
    process.env.OPENAI_MODEL ??
    "gpt-4o-mini";

  const maxTokens = visualExperienceMaxTokens();
  const timeoutMs = visualExperienceTimeoutMs();
  const body = {
    model,
    messages: modelRequest.messages as ChatCompletionMessage[],
    response_format: { type: "json_object" },
    max_completion_tokens: maxTokens,
  };

  const result = await postChatCompletions({
    url: endpoint(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"),
    apiKey,
    body,
    providerLabel: "OpenAI",
    timeoutMs,
  });

  return {
    provider: "openai",
    provider_used: "openai",
    model,
    raw_text: result.raw_text,
    duration_ms: result.duration_ms,
    request_payload_preview: {
      model,
      response_format: body.response_format,
      max_completion_tokens: body.max_completion_tokens,
      timeout_ms: timeoutMs,
      message_count: modelRequest.messages.length,
      prompt_chars: modelRequest.prompt_stats.total_chars,
      response_chars: result.response_chars,
    },
  };
}

function getNvidiaProviderConfig(provider: "nvidia" | "deepseek" | "nemotron") {
  if (provider === "nemotron") {
    return {
      providerLabel: "NVIDIA/Nemotron",
      model:
        process.env.MYWAY_VISUAL_EXPERIENCE_NEMOTRON_MODEL ??
        process.env.MYWAY_NEMOTRON_MODEL ??
        "nvidia/nemotron-3-nano-30b-a3b",
      // NVIDIA currently lists structured output as unsupported for this model, so do not send response_format.
      useResponseFormat: false,
      temperature: numberFromEnv("MYWAY_NEMOTRON_TEMPERATURE", numberFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.35)),
      topP: numberFromEnv("MYWAY_NEMOTRON_TOP_P", numberFromEnv("MYWAY_NVIDIA_TOP_P", 0.9)),
      maxTokens: numberFromEnv("MYWAY_VISUAL_EXPERIENCE_NEMOTRON_MAX_TOKENS", visualExperienceMaxTokens()),
      reasoningBudget: numberFromEnv("MYWAY_VISUAL_EXPERIENCE_NEMOTRON_REASONING_BUDGET", 0),
    };
  }

  if (provider === "deepseek") {
    return {
      providerLabel: "NVIDIA/DeepSeek",
      model:
        process.env.MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_MODEL ??
        process.env.MYWAY_DEEPSEEK_MODEL ??
        process.env.MYWAY_VISUAL_EXPERIENCE_NVIDIA_MODEL ??
        process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL ??
        "deepseek-ai/deepseek-v4-pro",
      useResponseFormat: true,
      temperature: numberFromEnv("MYWAY_DEEPSEEK_TEMPERATURE", numberFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.2)),
      topP: numberFromEnv("MYWAY_DEEPSEEK_TOP_P", numberFromEnv("MYWAY_NVIDIA_TOP_P", 0.9)),
      maxTokens: visualExperienceMaxTokens(),
      reasoningBudget: 0,
    };
  }

  return {
    providerLabel: "NVIDIA",
    model:
      process.env.MYWAY_VISUAL_EXPERIENCE_NVIDIA_MODEL ??
      process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL ??
      "deepseek-ai/deepseek-v4-pro",
    useResponseFormat: true,
    temperature: numberFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.2),
    topP: numberFromEnv("MYWAY_NVIDIA_TOP_P", 0.9),
    maxTokens: visualExperienceMaxTokens(),
    reasoningBudget: 0,
  };
}

async function callNvidia(
  modelRequest: VisualLearningTurnModelRequest,
  provider: "nvidia" | "deepseek" | "nemotron",
): Promise<VisualLearningTurnProviderResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing NVIDIA_API_KEY.");

  const config = getNvidiaProviderConfig(provider);
  const timeoutMs = visualExperienceTimeoutMs();
  const body: Record<string, unknown> = {
    model: config.model,
    messages: modelRequest.messages as ChatCompletionMessage[],
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    stream: false,
  };

  if (config.useResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  if (config.reasoningBudget > 0) {
    body.reasoning_budget = config.reasoningBudget;
  }

  const result = await postChatCompletions({
    url: endpoint(process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1"),
    apiKey,
    body,
    providerLabel: config.providerLabel,
    timeoutMs,
  });

  return {
    provider,
    provider_used: "nvidia",
    model: config.model,
    raw_text: result.raw_text,
    duration_ms: result.duration_ms,
    request_payload_preview: {
      model: config.model,
      response_format: config.useResponseFormat ? body.response_format : "prompt_only_json_no_api_response_format",
      temperature: body.temperature,
      top_p: body.top_p,
      max_tokens: body.max_tokens,
      reasoning_budget: body.reasoning_budget ?? null,
      timeout_ms: timeoutMs,
      message_count: modelRequest.messages.length,
      prompt_chars: modelRequest.prompt_stats.total_chars,
      response_chars: result.response_chars,
    },
  };
}

export function getVisualLearningTurnProvider(value: unknown): VisualLearningTurnModelProvider {
  return normalizeProviderName(value);
}

export function getVisualLearningTurnProviderStatus() {
  return {
    default_provider: normalizeProviderName(undefined),
    providers: ["scaffold", "deepseek", "nemotron", "openai"],
    env: {
      has_openai_key: Boolean(process.env.MYWAY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY),
      has_nvidia_key: Boolean(process.env.NVIDIA_API_KEY),
      nvidia_base_url: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      deepseek_model: getNvidiaProviderConfig("deepseek").model,
      nemotron_model: getNvidiaProviderConfig("nemotron").model,
      nvidia_default_model: getNvidiaProviderConfig("nvidia").model,
      openai_model:
        process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL ??
        process.env.MYWAY_OPENAI_FULL_LOOP_MODEL ??
        process.env.OPENAI_MODEL ??
        "gpt-4o-mini",
      max_tokens: visualExperienceMaxTokens(),
      timeout_ms: visualExperienceTimeoutMs(),
    },
  };
}

export async function callVisualLearningTurnModel(args: {
  provider: unknown;
  model_request: VisualLearningTurnModelRequest;
  scaffold_raw_text: string;
}): Promise<VisualLearningTurnProviderResult> {
  const provider = normalizeProviderName(args.provider);

  if (provider === "scaffold") {
    return {
      provider: "scaffold",
      provider_used: "scaffold",
      model: "deterministic_scaffold_visual_learning_turn_v1",
      raw_text: args.scaffold_raw_text,
      duration_ms: 0,
      request_payload_preview: {
        model: "deterministic_scaffold_visual_learning_turn_v1",
        message_count: args.model_request.messages.length,
        prompt_chars: args.model_request.prompt_stats.total_chars,
      },
    };
  }

  if (provider === "openai") return callOpenAI(args.model_request);

  if (provider === "nemotron") return callNvidia(args.model_request, "nemotron");

  return callNvidia(args.model_request, provider === "nvidia" ? "nvidia" : "deepseek");
}


