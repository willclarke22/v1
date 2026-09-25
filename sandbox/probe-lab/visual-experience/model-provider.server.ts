import type { VisualLearningTurnModelRequest } from "./visual-learning-turn-request";

export type VisualLearningTurnModelProvider = "scaffold" | "openai" | "nvidia" | "deepseek" | "glm";
export type VisualGenerationPreset = "reliable" | "cinematic";
export type VisualProviderFallback = "none" | VisualLearningTurnModelProvider;
export type VisualGlmReasoningEffort = "low" | "high" | "max";
export type VisualProviderRequestProfile =
  | "standard"
  | "glm53_native_reasoning"
  | "glm53_hosted_compatibility";
export type VisualClearThinkingPolicy =
  | "not_applicable"
  | "not_sent_hosted_api_schema";

export type VisualProviderFailureKind =
  | "local_abort_timeout"
  | "provider_504"
  | "provider_429"
  | "provider_5xx"
  | "provider_model_unavailable"
  | "provider_http_error"
  | "provider_network_error"
  | "empty_response"
  | "unknown_error";

export type VisualProviderAttemptDiagnostic = {
  attempt_number: number;
  provider: VisualLearningTurnModelProvider;
  provider_used: "openai" | "nvidia";
  provider_label: string;
  model: string;
  generation_preset: VisualGenerationPreset;
  stream_enabled: boolean;
  max_tokens: number | null;
  reasoning_budget: number | null;
  reasoning_effort: VisualGlmReasoningEffort | null;
  temperature: number | null;
  top_p: number | null;
  request_profile: VisualProviderRequestProfile;
  clear_thinking_policy: VisualClearThinkingPolicy;
  timeout_ms: number;
  request_chars: number;
  message_count: number;
  status: "success" | "error";
  http_status: number | null;
  failure_kind: VisualProviderFailureKind | null;
  duration_ms: number;
  first_token_ms: number | null;
  response_chars: number;
  raw_error_preview: string | null;
};

export type VisualProviderDiagnostics = {
  generation_preset: VisualGenerationPreset;
  stream_enabled: boolean;
  retry_transient_errors: boolean;
  primary_provider: VisualLearningTurnModelProvider;
  fallback_provider: VisualProviderFallback;
  provider_fallback_used: boolean;
  total_duration_ms: number;
  attempt_count: number;
  final_failure_kind: VisualProviderFailureKind | null;
  final_error_message: string | null;
  attempts: VisualProviderAttemptDiagnostic[];
};

export type VisualLearningTurnProviderResult = {
  provider: VisualLearningTurnModelProvider;
  provider_used: "scaffold" | "openai" | "nvidia";
  model: string;
  raw_text: string;
  duration_ms: number;
  provider_fallback_used?: boolean;
  provider_call_error?: string | null;
  diagnostics?: VisualProviderDiagnostics;
  request_payload_preview?: Record<string, unknown>;
};

export type VisualProviderChatMessage = {
  role: "system" | "user";
  content: string;
};

type VisualProviderChatRequest = {
  messages: VisualProviderChatMessage[];
  prompt_stats: {
    total_chars: number;
  };
};

type ChatPostResult = {
  raw_text: string;
  duration_ms: number;
  first_token_ms: number | null;
  response_chars: number;
  http_status: number;
  attempts: VisualProviderAttemptDiagnostic[];
};

type ChatProviderConfig = {
  provider: VisualLearningTurnModelProvider;
  providerUsed: "openai" | "nvidia";
  providerLabel: string;
  model: string;
  url: string;
  apiKey: string;
  useResponseFormat: boolean;
  temperature?: number;
  topP?: number;
  maxTokens: number;
  reasoningBudget: number;
  reasoningEffort?: VisualGlmReasoningEffort;
  clearThinkingPolicy?: VisualClearThinkingPolicy;
  tokenField: "max_tokens" | "max_completion_tokens";
};

type VisualModelCallOptions = {
  generation_preset?: unknown;
  enable_streaming?: unknown;
  retry_transient_errors?: unknown;
  fallback_provider?: unknown;
  max_attempts?: number;
  timeout_ms?: number;
};

class VisualProviderError extends Error {
  failure_kind: VisualProviderFailureKind;
  http_status: number | null;
  duration_ms: number;
  first_token_ms: number | null;
  raw_error_preview: string | null;

  constructor(args: {
    message: string;
    failure_kind: VisualProviderFailureKind;
    http_status?: number | null;
    duration_ms: number;
    first_token_ms?: number | null;
    raw_error_preview?: string | null;
  }) {
    super(args.message);
    this.name = "VisualProviderError";
    this.failure_kind = args.failure_kind;
    this.http_status = args.http_status ?? null;
    this.duration_ms = args.duration_ms;
    this.first_token_ms = args.first_token_ms ?? null;
    this.raw_error_preview = args.raw_error_preview ?? null;
  }
}

class VisualProviderAttemptsError extends Error {
  attempts: VisualProviderAttemptDiagnostic[];
  final_failure_kind: VisualProviderFailureKind;

  constructor(args: {
    message: string;
    attempts: VisualProviderAttemptDiagnostic[];
    final_failure_kind: VisualProviderFailureKind;
  }) {
    super(args.message);
    this.name = "VisualProviderAttemptsError";
    this.attempts = args.attempts;
    this.final_failure_kind = args.final_failure_kind;
  }
}

function normalizeProviderName(value: unknown): VisualLearningTurnModelProvider {
  if (
    value === "openai" ||
    value === "nvidia" ||
    value === "deepseek" ||
    value === "glm" ||
    value === "scaffold"
  ) {
    return value;
  }

  const envProvider = process.env.MYWAY_VISUAL_EXPERIENCE_MODEL_PROVIDER ?? process.env.MYWAY_SANDBOX_MODEL_PROVIDER;
  if (envProvider === "openai" || envProvider === "nvidia" || envProvider === "deepseek" || envProvider === "glm") {
    return envProvider;
  }

  return "scaffold";
}

function normalizeFallbackProvider(value: unknown, primary: VisualLearningTurnModelProvider): VisualProviderFallback {
  if (value === "none") return "none";
  const normalized = normalizeProviderName(value);
  // OpenAI is intentionally never used as an automatic fallback because it can incur paid usage.
  // It can still be used only when selected as the primary provider.
  if (normalized === "openai") return "none";
  if (normalized === primary) return "none";
  return normalized;
}

function defaultFallbackProvider(primary: VisualLearningTurnModelProvider): VisualProviderFallback {
  if (primary === "deepseek" || primary === "nvidia") return "glm";
  if (primary === "glm") return "scaffold";
  if (primary === "openai") return "glm";
  return "none";
}

function normalizeGenerationPreset(value: unknown): VisualGenerationPreset {
  if (value === "cinematic") return "cinematic";
  return "reliable";
}

function booleanFromEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeStreaming(value: unknown) {
  if (typeof value === "boolean") return value;
  return booleanFromEnv("MYWAY_VISUAL_EXPERIENCE_STREAMING", true);
}

function normalizeRetry(value: unknown) {
  if (typeof value === "boolean") return value;
  return booleanFromEnv("MYWAY_VISUAL_EXPERIENCE_RETRY_TRANSIENT_ERRORS", true);
}

function numberFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberInRangeFromEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = numberFromEnv(name, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function visualExperienceGlmReasoningEffort(
  preset: VisualGenerationPreset,
): VisualGlmReasoningEffort {
  const configured = process.env.MYWAY_VISUAL_EXPERIENCE_GLM_REASONING_EFFORT?.trim().toLowerCase();
  if (configured === "low" || configured === "high" || configured === "max") {
    return configured;
  }
  return preset === "cinematic" ? "max" : "high";
}

function visualExperienceGlmTemperature() {
  return numberInRangeFromEnv(
    "MYWAY_GLM_TEMPERATURE",
    numberInRangeFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.25, 0, 1),
    0,
    1,
  );
}

function visualExperienceGlmTopP() {
  // Keep nucleus sampling neutral by default. GLM-5.3's hosted endpoint documents
  // top_p=1 as the default and advises against tuning both sampling controls.
  return numberInRangeFromEnv(
    "MYWAY_GLM_TOP_P",
    numberInRangeFromEnv("MYWAY_NVIDIA_TOP_P", 1, 0, 1),
    0,
    1,
  );
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function visualExperienceMaxTokens(preset: VisualGenerationPreset) {
  // Step 13b: the v2 semantic draft can legitimately be larger because it includes
  // full_prompt, explanation_pieces, diagnostic_signal, scene_moments, entities,
  // and a follow-up probe. Keep the cinematic minimum high enough that DeepSeek
  // does not return a cut-off JSON object.
  const presetDefault = preset === "cinematic" ? 12000 : 8000;
  const specificEnvName =
    preset === "cinematic"
      ? "MYWAY_VISUAL_EXPERIENCE_CINEMATIC_MAX_TOKENS"
      : "MYWAY_VISUAL_EXPERIENCE_RELIABLE_MAX_TOKENS";
  const configured = numberFromEnv(
    specificEnvName,
    numberFromEnv("MYWAY_VISUAL_EXPERIENCE_MAX_TOKENS", presetDefault),
  );

  // If an older .env still has MYWAY_VISUAL_EXPERIENCE_MAX_TOKENS=5000, do not
  // let it silently truncate Step 13 JSON. The specific env vars above can still
  // raise the cap further.
  return preset === "cinematic"
    ? Math.max(configured, presetDefault)
    : Math.max(configured, presetDefault);
}

function visualExperienceTimeoutMs(preset: VisualGenerationPreset) {
  const presetDefault = preset === "cinematic" ? 180000 : 90000;
  return numberFromEnv("MYWAY_VISUAL_EXPERIENCE_PROVIDER_TIMEOUT_MS", presetDefault);
}

function visualExperienceProviderMaxTokens(envName: string, preset: VisualGenerationPreset) {
  const base = visualExperienceMaxTokens(preset);
  return Math.max(numberFromEnv(envName, base), base);
}


function retryBaseDelayMs() {
  return numberFromEnv("MYWAY_VISUAL_EXPERIENCE_RETRY_BASE_MS", 1200);
}

function getMaxAttempts(options: VisualModelCallOptions, retryTransientErrors: boolean) {
  if (typeof options.max_attempts === "number" && Number.isFinite(options.max_attempts)) {
    return Math.max(1, Math.min(4, Math.floor(options.max_attempts)));
  }

  if (!retryTransientErrors) return 1;
  return Math.max(1, Math.min(4, numberFromEnv("MYWAY_VISUAL_EXPERIENCE_MAX_ATTEMPTS", 2)));
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

function getStreamingDeltaText(value: unknown): string {
  const response = value as {
    choices?: Array<{
      delta?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
      message?: {
        content?: string;
      };
      text?: string;
    }>;
  };

  const choice = response.choices?.[0];
  const content = choice?.delta?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("");
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (typeof choice?.text === "string") return choice.text;
  return "";
}

function classifyHttpStatus(status: number): VisualProviderFailureKind {
  if (status === 504) return "provider_504";
  if (status === 429) return "provider_429";
  if (status === 404 || status === 410) return "provider_model_unavailable";
  if (status >= 500) return "provider_5xx";
  return "provider_http_error";
}

function isTransientFailure(kind: VisualProviderFailureKind) {
  return (
    kind === "local_abort_timeout" ||
    kind === "provider_504" ||
    kind === "provider_429" ||
    kind === "provider_5xx" ||
    kind === "provider_network_error"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestProfileForAttempt(
  config: ChatProviderConfig,
  body: Record<string, unknown>,
): VisualProviderRequestProfile {
  if (config.provider !== "glm") return "standard";
  return typeof body.reasoning_effort === "string"
    ? "glm53_native_reasoning"
    : "glm53_hosted_compatibility";
}

function makeAttemptDiagnostic(args: {
  attemptNumber: number;
  config: ChatProviderConfig;
  body: Record<string, unknown>;
  preset: VisualGenerationPreset;
  streamEnabled: boolean;
  timeoutMs: number;
  status: "success" | "error";
  httpStatus: number | null;
  failureKind: VisualProviderFailureKind | null;
  durationMs: number;
  firstTokenMs: number | null;
  responseChars: number;
  rawErrorPreview: string | null;
  requestChars: number;
  messageCount: number;
}): VisualProviderAttemptDiagnostic {
  return {
    attempt_number: args.attemptNumber,
    provider: args.config.provider,
    provider_used: args.config.providerUsed,
    provider_label: args.config.providerLabel,
    model: args.config.model,
    generation_preset: args.preset,
    stream_enabled: args.streamEnabled,
    max_tokens: typeof args.body.max_tokens === "number" ? args.body.max_tokens : typeof args.body.max_completion_tokens === "number" ? args.body.max_completion_tokens : null,
    reasoning_budget: typeof args.body.reasoning_budget === "number" ? args.body.reasoning_budget : null,
    reasoning_effort:
      args.body.reasoning_effort === "low" ||
      args.body.reasoning_effort === "high" ||
      args.body.reasoning_effort === "max"
        ? args.body.reasoning_effort
        : null,
    temperature: typeof args.body.temperature === "number" ? args.body.temperature : null,
    top_p: typeof args.body.top_p === "number" ? args.body.top_p : null,
    request_profile: requestProfileForAttempt(args.config, args.body),
    clear_thinking_policy:
      args.config.clearThinkingPolicy ?? "not_applicable",
    timeout_ms: args.timeoutMs,
    request_chars: args.requestChars,
    message_count: args.messageCount,
    status: args.status,
    http_status: args.httpStatus,
    failure_kind: args.failureKind,
    duration_ms: args.durationMs,
    first_token_ms: args.firstTokenMs,
    response_chars: args.responseChars,
    raw_error_preview: args.rawErrorPreview,
  };
}

async function readStreamingText(response: Response, startedAt: number) {
  if (!response.body) {
    throw new VisualProviderError({
      message: "Streaming response had no readable body.",
      failure_kind: "empty_response",
      http_status: response.status,
      duration_ms: Date.now() - startedAt,
      raw_error_preview: null,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let firstTokenMs: number | null = null;

  function consumeEvent(rawEvent: string) {
    const lines = rawEvent.split(/\r?\n/g);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") continue;

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const delta = getStreamingDeltaText(parsed);
      if (delta) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
        rawText += delta;
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\r?\n\r?\n/g);
    buffer = events.pop() ?? "";
    for (const event of events) consumeEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);

  return { rawText, firstTokenMs };
}

async function postChatCompletionsOnce(args: {
  config: ChatProviderConfig;
  body: Record<string, unknown>;
  providerLabel: string;
  timeoutMs: number;
  attemptNumber: number;
  generationPreset: VisualGenerationPreset;
  streamEnabled: boolean;
  requestChars: number;
  messageCount: number;
}): Promise<ChatPostResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  let response: Response;

  try {
    response = await fetch(args.config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.config.apiKey}`,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const durationMs = Date.now() - startedAt;
      const failureKind = classifyHttpStatus(response.status);
      const preview = text.slice(0, 1200);
      const diagnostic = makeAttemptDiagnostic({
        attemptNumber: args.attemptNumber,
        config: args.config,
        body: args.body,
        preset: args.generationPreset,
        streamEnabled: args.streamEnabled,
        timeoutMs: args.timeoutMs,
        status: "error",
        httpStatus: response.status,
        failureKind,
        durationMs,
        firstTokenMs: null,
        responseChars: 0,
        rawErrorPreview: preview,
        requestChars: args.requestChars,
        messageCount: args.messageCount,
      });

      const error = new VisualProviderError({
        message: `${args.providerLabel} model call failed with ${response.status} after ${durationMs}ms: ${preview}`,
        failure_kind: failureKind,
        http_status: response.status,
        duration_ms: durationMs,
        raw_error_preview: preview,
      }) as VisualProviderError & { attempt?: VisualProviderAttemptDiagnostic };
      error.attempt = diagnostic;
      throw error;
    }

    let choiceText = "";
    let firstTokenMs: number | null = null;

    if (args.streamEnabled) {
      const streamed = await readStreamingText(response, startedAt);
      choiceText = streamed.rawText;
      firstTokenMs = streamed.firstTokenMs;
    } else {
      const text = await response.text();
      let json: unknown = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      choiceText = getChoiceText(json);
    }

    const durationMs = Date.now() - startedAt;

    if (!choiceText.trim()) {
      const diagnostic = makeAttemptDiagnostic({
        attemptNumber: args.attemptNumber,
        config: args.config,
        body: args.body,
        preset: args.generationPreset,
        streamEnabled: args.streamEnabled,
        timeoutMs: args.timeoutMs,
        status: "error",
        httpStatus: response.status,
        failureKind: "empty_response",
        durationMs,
        firstTokenMs,
        responseChars: 0,
        rawErrorPreview: "No assistant text was returned.",
        requestChars: args.requestChars,
        messageCount: args.messageCount,
      });

      const error = new VisualProviderError({
        message: `${args.providerLabel} model call returned no assistant text after ${durationMs}ms.`,
        failure_kind: "empty_response",
        http_status: response.status,
        duration_ms: durationMs,
        first_token_ms: firstTokenMs,
        raw_error_preview: "No assistant text was returned.",
      }) as VisualProviderError & { attempt?: VisualProviderAttemptDiagnostic };
      error.attempt = diagnostic;
      throw error;
    }

    const diagnostic = makeAttemptDiagnostic({
      attemptNumber: args.attemptNumber,
      config: args.config,
      body: args.body,
      preset: args.generationPreset,
      streamEnabled: args.streamEnabled,
      timeoutMs: args.timeoutMs,
      status: "success",
      httpStatus: response.status,
      failureKind: null,
      durationMs,
      firstTokenMs,
      responseChars: choiceText.length,
      rawErrorPreview: null,
      requestChars: args.requestChars,
      messageCount: args.messageCount,
    });

    return {
      raw_text: choiceText,
      duration_ms: durationMs,
      first_token_ms: firstTokenMs,
      response_chars: choiceText.length,
      http_status: response.status,
      attempts: [diagnostic],
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof VisualProviderError) {
      throw error;
    }

    const isAbort = error instanceof Error && error.name === "AbortError";
    const failureKind: VisualProviderFailureKind = isAbort ? "local_abort_timeout" : "provider_network_error";
    const message = isAbort
      ? `${args.providerLabel} model call timed out locally after ${args.timeoutMs}ms.`
      : `${args.providerLabel} model call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`;
    const preview = error instanceof Error ? error.message.slice(0, 1200) : String(error).slice(0, 1200);

    const diagnostic = makeAttemptDiagnostic({
      attemptNumber: args.attemptNumber,
      config: args.config,
      body: args.body,
      preset: args.generationPreset,
      streamEnabled: args.streamEnabled,
      timeoutMs: args.timeoutMs,
      status: "error",
      httpStatus: null,
      failureKind,
      durationMs,
      firstTokenMs: null,
      responseChars: 0,
      rawErrorPreview: preview,
      requestChars: args.requestChars,
      messageCount: args.messageCount,
    });

    const providerError = new VisualProviderError({
      message,
      failure_kind: failureKind,
      http_status: null,
      duration_ms: durationMs,
      raw_error_preview: preview,
    }) as VisualProviderError & { attempt?: VisualProviderAttemptDiagnostic };
    providerError.attempt = diagnostic;
    throw providerError;
  } finally {
    clearTimeout(timeout);
  }
}

async function postChatCompletionsWithRetry(args: {
  config: ChatProviderConfig;
  body: Record<string, unknown>;
  providerLabel: string;
  timeoutMs: number;
  generationPreset: VisualGenerationPreset;
  streamEnabled: boolean;
  retryTransientErrors: boolean;
  maxAttempts: number;
  requestChars: number;
  messageCount: number;
}): Promise<ChatPostResult> {
  const startedAt = Date.now();
  const attempts: VisualProviderAttemptDiagnostic[] = [];
  let lastError: VisualProviderError | null = null;

  for (let attemptNumber = 1; attemptNumber <= args.maxAttempts; attemptNumber += 1) {
    try {
      const result = await postChatCompletionsOnce({
        config: args.config,
        body: args.body,
        providerLabel: args.providerLabel,
        timeoutMs: args.timeoutMs,
        attemptNumber,
        generationPreset: args.generationPreset,
        streamEnabled: args.streamEnabled,
        requestChars: args.requestChars,
        messageCount: args.messageCount,
      });

      attempts.push(...result.attempts);

      return {
        ...result,
        duration_ms: Date.now() - startedAt,
        attempts,
      };
    } catch (error) {
      const providerError = error instanceof VisualProviderError ? error : new VisualProviderError({
        message: error instanceof Error ? error.message : String(error),
        failure_kind: "unknown_error",
        duration_ms: Date.now() - startedAt,
        raw_error_preview: error instanceof Error ? error.message : String(error),
      });

      const attempt = (providerError as VisualProviderError & { attempt?: VisualProviderAttemptDiagnostic }).attempt;
      if (attempt) attempts.push(attempt);
      lastError = providerError;

      const canRetry =
        args.retryTransientErrors &&
        attemptNumber < args.maxAttempts &&
        isTransientFailure(providerError.failure_kind);

      if (!canRetry) break;

      await sleep(retryBaseDelayMs() * attemptNumber);
    }
  }

  throw new VisualProviderAttemptsError({
    message: lastError?.message ?? `${args.providerLabel} model call failed before returning text.`,
    attempts,
    final_failure_kind: lastError?.failure_kind ?? "unknown_error",
  });
}

function makeBaseBody(args: {
  config: ChatProviderConfig;
  modelRequest: VisualProviderChatRequest;
  streamEnabled: boolean;
}) {
  const body: Record<string, unknown> = {
    model: args.config.model,
    messages: args.modelRequest.messages as VisualProviderChatMessage[],
    stream: args.streamEnabled,
  };

  body[args.config.tokenField] = args.config.maxTokens;

  if (args.config.useResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  if (typeof args.config.temperature === "number") body.temperature = args.config.temperature;
  if (typeof args.config.topP === "number") body.top_p = args.config.topP;
  if (args.config.reasoningBudget > 0) body.reasoning_budget = args.config.reasoningBudget;
  if (args.config.reasoningEffort) body.reasoning_effort = args.config.reasoningEffort;

  return body;
}

async function callChatProvider(
  modelRequest: VisualProviderChatRequest,
  config: ChatProviderConfig,
  options: Required<Pick<VisualModelCallOptions, "generation_preset">> & VisualModelCallOptions,
) {
  const startedAt = Date.now();
  const generationPreset = normalizeGenerationPreset(options.generation_preset);
  const streamEnabled = normalizeStreaming(options.enable_streaming);
  const retryTransientErrors = normalizeRetry(options.retry_transient_errors);
  const timeoutMs =
    typeof options.timeout_ms === "number" && Number.isFinite(options.timeout_ms)
      ? Math.max(5_000, Math.min(180_000, Math.floor(options.timeout_ms)))
      : visualExperienceTimeoutMs(generationPreset);
  const maxAttempts = getMaxAttempts(options, retryTransientErrors);
  const body = makeBaseBody({ config, modelRequest, streamEnabled });
  const requestChars = JSON.stringify(body).length;
  const messageCount = modelRequest.messages.length;

  let result: ChatPostResult;
  let finalBody = body;

  try {
    result = await postChatCompletionsWithRetry({
      config,
      body,
      providerLabel: config.providerLabel,
      timeoutMs,
      generationPreset,
      streamEnabled,
      retryTransientErrors,
      maxAttempts,
      requestChars,
      messageCount,
    });
  } catch (error) {
    const nativeAttempts = errorAttempts(error);
    const lastNativeAttempt = nativeAttempts[nativeAttempts.length - 1];
    const shouldUseHostedCompatibilityProfile =
      config.provider === "glm" &&
      typeof body.reasoning_effort === "string" &&
      lastNativeAttempt?.http_status === 422;

    if (!shouldUseHostedCompatibilityProfile) throw error;

    // NVIDIA's GLM-5.3 model card documents reasoning_effort, while the current
    // hosted chat-completions schema does not list that field. Prefer the native
    // control, but if the hosted endpoint rejects it with 422, immediately retry
    // once without the extra field. GLM-5.3 defaults to max reasoning server-side,
    // so cinematic turns still retain the intended reasoning depth.
    const compatibilityBody = { ...body };
    delete compatibilityBody.reasoning_effort;
    const compatibilityRequestChars = JSON.stringify(compatibilityBody).length;

    try {
      const compatibilityResult = await postChatCompletionsWithRetry({
        config,
        body: compatibilityBody,
        providerLabel: `${config.providerLabel} hosted-compatibility`,
        timeoutMs,
        generationPreset,
        streamEnabled,
        retryTransientErrors: false,
        maxAttempts: 1,
        requestChars: compatibilityRequestChars,
        messageCount,
      });
      const compatibilityAttempts = compatibilityResult.attempts.map((attempt, index) => ({
        ...attempt,
        attempt_number: nativeAttempts.length + index + 1,
      }));
      result = {
        ...compatibilityResult,
        duration_ms: Date.now() - startedAt,
        attempts: [...nativeAttempts, ...compatibilityAttempts],
      };
      finalBody = compatibilityBody;
    } catch (compatibilityError) {
      const compatibilityAttempts = errorAttempts(compatibilityError).map((attempt, index) => ({
        ...attempt,
        attempt_number: nativeAttempts.length + index + 1,
      }));
      throw new VisualProviderAttemptsError({
        message:
          `${config.providerLabel} native reasoning request was rejected with 422, ` +
          `and the hosted-compatibility retry also failed: ${errorMessage(compatibilityError)}`,
        attempts: [...nativeAttempts, ...compatibilityAttempts],
        final_failure_kind: errorFailureKind(compatibilityError),
      });
    }
  }

  return {
    result,
    body: finalBody,
    diagnostics: {
      generation_preset: generationPreset,
      stream_enabled: streamEnabled,
      retry_transient_errors: retryTransientErrors,
      primary_provider: config.provider,
      fallback_provider: "none" as const,
      provider_fallback_used: false,
      total_duration_ms: result.duration_ms,
      attempt_count: result.attempts.length,
      final_failure_kind: null,
      final_error_message: null,
      attempts: result.attempts,
    } satisfies VisualProviderDiagnostics,
  };
}

const DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL = "z-ai/glm-5.3";
const RETIRED_VISUAL_EXPERIENCE_GLM_MODELS = new Map<string, string>([
  ["z-ai/glm-5.2", DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL],
]);

function visualExperienceGlmModel() {
  const configured = (
    process.env.MYWAY_VISUAL_EXPERIENCE_GLM_MODEL ??
    process.env.MYWAY_GLM_MODEL ??
    DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL
  ).trim();
  return RETIRED_VISUAL_EXPERIENCE_GLM_MODELS.get(configured.toLowerCase()) ?? configured;
}

function visualExperienceGlmProviderLabel(model: string) {
  return model === DEFAULT_VISUAL_EXPERIENCE_GLM_MODEL
    ? "NVIDIA/GLM-5.3"
    : `NVIDIA/GLM (${model})`;
}

function getOpenAIConfig(preset: VisualGenerationPreset): ChatProviderConfig {
  const apiKey = process.env.MYWAY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY or MYWAY_OPENAI_API_KEY.");

  const model =
    process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL ??
    process.env.MYWAY_OPENAI_FULL_LOOP_MODEL ??
    process.env.OPENAI_MODEL ??
    "gpt-4o-mini";

  return {
    provider: "openai",
    providerUsed: "openai",
    providerLabel: "OpenAI",
    model,
    url: endpoint(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"),
    apiKey,
    useResponseFormat: true,
    maxTokens: visualExperienceProviderMaxTokens("MYWAY_VISUAL_EXPERIENCE_OPENAI_MAX_TOKENS", preset),
    reasoningBudget: 0,
    tokenField: "max_completion_tokens",
  };
}

function getNvidiaProviderConfig(provider: "nvidia" | "deepseek" | "glm", preset: VisualGenerationPreset): ChatProviderConfig {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing NVIDIA_API_KEY.");

  const url = endpoint(process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1");

  if (provider === "glm") {
    const model = visualExperienceGlmModel();
    return {
      provider,
      providerUsed: "nvidia",
      providerLabel: visualExperienceGlmProviderLabel(model),
      model,
      url,
      apiKey,
      // GLM-5.3 is the current no-extra-paid-cost NVIDIA reasoning endpoint.
      // Prefer its native reasoning_effort control. The hosted API currently omits
      // clear_thinking/chat_template_kwargs from the documented schema, so do not
      // send that field until NVIDIA exposes it for this endpoint.
      useResponseFormat: false,
      temperature: visualExperienceGlmTemperature(),
      topP: visualExperienceGlmTopP(),
      maxTokens: visualExperienceProviderMaxTokens("MYWAY_VISUAL_EXPERIENCE_GLM_MAX_TOKENS", preset),
      reasoningBudget: 0,
      reasoningEffort: visualExperienceGlmReasoningEffort(preset),
      clearThinkingPolicy: "not_sent_hosted_api_schema",
      tokenField: "max_tokens",
    };
  }

  if (provider === "deepseek") {
    return {
      provider,
      providerUsed: "nvidia",
      providerLabel: "NVIDIA/DeepSeek",
      model:
        process.env.MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_MODEL ??
        process.env.MYWAY_DEEPSEEK_MODEL ??
        process.env.MYWAY_VISUAL_EXPERIENCE_NVIDIA_MODEL ??
        process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL ??
        "deepseek-ai/deepseek-v4-pro",
      url,
      apiKey,
      useResponseFormat: true,
      temperature: numberFromEnv("MYWAY_DEEPSEEK_TEMPERATURE", numberFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.2)),
      topP: numberFromEnv("MYWAY_DEEPSEEK_TOP_P", numberFromEnv("MYWAY_NVIDIA_TOP_P", 0.9)),
      maxTokens: visualExperienceProviderMaxTokens("MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_MAX_TOKENS", preset),
      reasoningBudget: numberFromEnv("MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_REASONING_BUDGET", 0),
      tokenField: "max_tokens",
    };
  }

  return {
    provider,
    providerUsed: "nvidia",
    providerLabel: "NVIDIA",
    model:
      process.env.MYWAY_VISUAL_EXPERIENCE_NVIDIA_MODEL ??
      process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL ??
      "deepseek-ai/deepseek-v4-pro",
    url,
    apiKey,
    useResponseFormat: true,
    temperature: numberFromEnv("MYWAY_NVIDIA_TEMPERATURE", 0.2),
    topP: numberFromEnv("MYWAY_NVIDIA_TOP_P", 0.9),
    maxTokens: visualExperienceMaxTokens(preset),
    reasoningBudget: numberFromEnv("MYWAY_VISUAL_EXPERIENCE_NVIDIA_REASONING_BUDGET", 0),
    tokenField: "max_tokens",
  };
}

function getProviderConfig(provider: VisualLearningTurnModelProvider, preset: VisualGenerationPreset): ChatProviderConfig {
  if (provider === "openai") return getOpenAIConfig(preset);
  if (provider === "glm") return getNvidiaProviderConfig("glm", preset);
  if (provider === "nvidia") return getNvidiaProviderConfig("nvidia", preset);
  return getNvidiaProviderConfig("deepseek", preset);
}

async function callConfiguredProvider(
  provider: VisualLearningTurnModelProvider,
  modelRequest: VisualLearningTurnModelRequest,
  options: VisualModelCallOptions,
) {
  const preset = normalizeGenerationPreset(options.generation_preset);
  const config = getProviderConfig(provider, preset);
  return callChatProvider(modelRequest, config, { ...options, generation_preset: preset });
}

function scaffoldResult(args: {
  requestedProvider: VisualLearningTurnModelProvider;
  modelRequest: VisualLearningTurnModelRequest;
  scaffoldRawText: string;
  diagnostics?: VisualProviderDiagnostics;
  providerCallError?: string | null;
  providerFallbackUsed?: boolean;
}): VisualLearningTurnProviderResult {
  return {
    provider: args.requestedProvider,
    provider_used: "scaffold",
    model: "deterministic_scaffold_visual_learning_turn_v1",
    raw_text: args.scaffoldRawText,
    duration_ms: args.diagnostics?.total_duration_ms ?? 0,
    provider_fallback_used: args.providerFallbackUsed ?? false,
    provider_call_error: args.providerCallError ?? null,
    diagnostics: args.diagnostics,
    request_payload_preview: {
      model: "deterministic_scaffold_visual_learning_turn_v1",
      message_count: args.modelRequest.messages.length,
      prompt_chars: args.modelRequest.prompt_stats.total_chars,
      provider_call_error: args.providerCallError ?? null,
      model_call_diagnostics: args.diagnostics ?? null,
    },
  };
}

function mergeDiagnostics(args: {
  primaryProvider: VisualLearningTurnModelProvider;
  fallbackProvider: VisualProviderFallback;
  providerFallbackUsed: boolean;
  generationPreset: VisualGenerationPreset;
  streamEnabled: boolean;
  retryTransientErrors: boolean;
  startedAt: number;
  attempts: VisualProviderAttemptDiagnostic[];
  finalFailureKind: VisualProviderFailureKind | null;
  finalErrorMessage: string | null;
}): VisualProviderDiagnostics {
  return {
    generation_preset: args.generationPreset,
    stream_enabled: args.streamEnabled,
    retry_transient_errors: args.retryTransientErrors,
    primary_provider: args.primaryProvider,
    fallback_provider: args.fallbackProvider,
    provider_fallback_used: args.providerFallbackUsed,
    total_duration_ms: Date.now() - args.startedAt,
    attempt_count: args.attempts.length,
    final_failure_kind: args.finalFailureKind,
    final_error_message: args.finalErrorMessage,
    attempts: args.attempts,
  };
}

function errorAttempts(error: unknown): VisualProviderAttemptDiagnostic[] {
  if (error instanceof VisualProviderAttemptsError) return error.attempts;
  return [];
}

function errorFailureKind(error: unknown): VisualProviderFailureKind {
  if (error instanceof VisualProviderAttemptsError) return error.final_failure_kind;
  if (error instanceof VisualProviderError) return error.failure_kind;
  return "unknown_error";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type VisualOrchestrationCalibrationModel =
  | "z-ai/glm-5.3"
  | "z-ai/glm-5.3-flash";

export type VisualOrchestrationCalibrationResult =
  | {
      ok: true;
      model: VisualOrchestrationCalibrationModel;
      raw_text: string;
      duration_ms: number;
      request_body: Record<string, unknown>;
      diagnostics: VisualProviderDiagnostics;
    }
  | {
      ok: false;
      model: VisualOrchestrationCalibrationModel;
      error: string;
      final_failure_kind: VisualProviderFailureKind;
      request_body: Record<string, unknown>;
      attempts: VisualProviderAttemptDiagnostic[];
    };

function normalizeCalibrationReasoningEffort(value: unknown): VisualGlmReasoningEffort {
  return value === "high" || value === "max" ? value : "low";
}

function normalizeCalibrationModel(value: unknown): VisualOrchestrationCalibrationModel {
  return value === "z-ai/glm-5.3-flash" ? value : "z-ai/glm-5.3";
}

/**
 * Shared provider entry point for the Visual Experience Orchestration Lab.
 * It deliberately reuses the production GLM transport/diagnostics path but
 * disables retries/fallbacks so each benchmark run measures one bounded call.
 */
export async function callVisualOrchestrationCalibrationModel(args: {
  messages: VisualProviderChatMessage[];
  model?: unknown;
  reasoning_effort?: unknown;
  max_tokens: number;
  timeout_ms?: number;
  temperature?: number;
  top_p?: number;
}): Promise<VisualOrchestrationCalibrationResult> {
  const model = normalizeCalibrationModel(args.model);
  const reasoningEffort = normalizeCalibrationReasoningEffort(args.reasoning_effort);
  const configBase = getNvidiaProviderConfig("glm", "reliable");
  const config: ChatProviderConfig = {
    ...configBase,
    model,
    providerLabel:
      model === "z-ai/glm-5.3-flash"
        ? "NVIDIA/GLM-5.3-Flash"
        : "NVIDIA/GLM-5.3",
    maxTokens: Math.max(64, Math.min(4_000, Math.floor(args.max_tokens))),
    reasoningEffort,
    temperature:
      typeof args.temperature === "number"
        ? Math.max(0, Math.min(1, args.temperature))
        : 0.1,
    topP:
      typeof args.top_p === "number"
        ? Math.max(0, Math.min(1, args.top_p))
        : 1,
    useResponseFormat: false,
  };
  const request: VisualProviderChatRequest = {
    messages: args.messages,
    prompt_stats: {
      total_chars: args.messages.reduce((sum, message) => sum + message.content.length, 0),
    },
  };
  const plannedBody = makeBaseBody({
    config,
    modelRequest: request,
    streamEnabled: false,
  });

  try {
    const called = await callChatProvider(request, config, {
      generation_preset: "reliable",
      enable_streaming: false,
      retry_transient_errors: false,
      max_attempts: 1,
      timeout_ms: args.timeout_ms ?? 90_000,
    });
    return {
      ok: true,
      model,
      raw_text: called.result.raw_text,
      duration_ms: called.result.duration_ms,
      request_body: called.body,
      diagnostics: called.diagnostics,
    };
  } catch (error) {
    return {
      ok: false,
      model,
      error: errorMessage(error),
      final_failure_kind: errorFailureKind(error),
      request_body: plannedBody,
      attempts: errorAttempts(error),
    };
  }
}

export function getVisualLearningTurnProvider(value: unknown): VisualLearningTurnModelProvider {
  return normalizeProviderName(value);
}

export function getVisualLearningTurnProviderStatus() {
  const reliable = "reliable" as const;
  return {
    default_provider: normalizeProviderName(undefined),
    providers: ["scaffold", "deepseek", "glm", "openai"],
    generation_presets: ["reliable", "cinematic"],
    resilience: {
      streaming_default: normalizeStreaming(undefined),
      retry_transient_errors_default: normalizeRetry(undefined),
      default_deepseek_fallback_provider: defaultFallbackProvider("deepseek"),
      openai_fallback_disabled: true,
      reliable_timeout_ms: visualExperienceTimeoutMs("reliable"),
      cinematic_timeout_ms: visualExperienceTimeoutMs("cinematic"),
      max_attempts_default: getMaxAttempts({}, normalizeRetry(undefined)),
    },
    glm53_request_profiles: {
      reliable: {
        model: visualExperienceGlmModel(),
        reasoning_effort: visualExperienceGlmReasoningEffort("reliable"),
        temperature: visualExperienceGlmTemperature(),
        top_p: visualExperienceGlmTopP(),
        clear_thinking_policy: "not_sent_hosted_api_schema" as const,
        native_reasoning_422_compatibility_retry: true,
      },
      cinematic: {
        model: visualExperienceGlmModel(),
        reasoning_effort: visualExperienceGlmReasoningEffort("cinematic"),
        temperature: visualExperienceGlmTemperature(),
        top_p: visualExperienceGlmTopP(),
        clear_thinking_policy: "not_sent_hosted_api_schema" as const,
        native_reasoning_422_compatibility_retry: true,
      },
    },
    env: {
      has_openai_key: Boolean(process.env.MYWAY_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY),
      has_nvidia_key: Boolean(process.env.NVIDIA_API_KEY),
      nvidia_base_url: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      deepseek_model: (() => {
        try {
          return getNvidiaProviderConfig("deepseek", reliable).model;
        } catch {
          return process.env.MYWAY_VISUAL_EXPERIENCE_DEEPSEEK_MODEL ?? "deepseek-ai/deepseek-v4-pro";
        }
      })(),
      glm_model: (() => {
        try {
          return getNvidiaProviderConfig("glm", reliable).model;
        } catch {
          return visualExperienceGlmModel();
        }
      })(),
      nvidia_default_model: process.env.MYWAY_VISUAL_EXPERIENCE_NVIDIA_MODEL ?? process.env.MYWAY_NVIDIA_FULL_LOOP_MODEL ?? "deepseek-ai/deepseek-v4-pro",
      openai_model:
        process.env.MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL ??
        process.env.MYWAY_OPENAI_FULL_LOOP_MODEL ??
        process.env.OPENAI_MODEL ??
        "gpt-4o-mini",
      reliable_max_tokens: visualExperienceMaxTokens("reliable"),
      cinematic_max_tokens: visualExperienceMaxTokens("cinematic"),
      timeout_ms: visualExperienceTimeoutMs("reliable"),
    },
  };
}

export async function callVisualLearningTurnModel(args: {
  provider: unknown;
  model_request: VisualLearningTurnModelRequest;
  scaffold_raw_text: string;
  generation_preset?: unknown;
  enable_streaming?: unknown;
  retry_transient_errors?: unknown;
  fallback_provider?: unknown;
}): Promise<VisualLearningTurnProviderResult> {
  const startedAt = Date.now();
  const provider = normalizeProviderName(args.provider);
  const generationPreset = normalizeGenerationPreset(args.generation_preset);
  const streamEnabled = normalizeStreaming(args.enable_streaming);
  const retryTransientErrors = normalizeRetry(args.retry_transient_errors);
  const fallbackProvider = normalizeFallbackProvider(args.fallback_provider ?? defaultFallbackProvider(provider), provider);

  if (provider === "scaffold") {
    return scaffoldResult({
      requestedProvider: "scaffold",
      modelRequest: args.model_request,
      scaffoldRawText: args.scaffold_raw_text,
      diagnostics: mergeDiagnostics({
        primaryProvider: "scaffold",
        fallbackProvider: "none",
        providerFallbackUsed: false,
        generationPreset,
        streamEnabled: false,
        retryTransientErrors: false,
        startedAt,
        attempts: [],
        finalFailureKind: null,
        finalErrorMessage: null,
      }),
    });
  }

  const options: VisualModelCallOptions = {
    generation_preset: generationPreset,
    enable_streaming: streamEnabled,
    retry_transient_errors: retryTransientErrors,
  };

  const allAttempts: VisualProviderAttemptDiagnostic[] = [];
  let primaryError: unknown = null;

  try {
    const primary = await callConfiguredProvider(provider, args.model_request, options);
    const diagnostics = mergeDiagnostics({
      primaryProvider: provider,
      fallbackProvider,
      providerFallbackUsed: false,
      generationPreset,
      streamEnabled,
      retryTransientErrors,
      startedAt,
      attempts: primary.diagnostics.attempts,
      finalFailureKind: null,
      finalErrorMessage: null,
    });

    const primarySuccessAttempt =
      primary.diagnostics.attempts.find((attempt) => attempt.status === "success") ?? null;
    const nativeReasoningCompatibilityFallbackUsed =
      primary.diagnostics.attempts.some(
        (attempt) =>
          attempt.request_profile === "glm53_native_reasoning" &&
          attempt.http_status === 422,
      ) &&
      primarySuccessAttempt?.request_profile === "glm53_hosted_compatibility";

    return {
      provider,
      provider_used: primarySuccessAttempt?.provider_used ?? (provider === "openai" ? "openai" : "nvidia"),
      model: primarySuccessAttempt?.model ?? getProviderConfig(provider, generationPreset).model,
      raw_text: primary.result.raw_text,
      duration_ms: diagnostics.total_duration_ms,
      provider_fallback_used: false,
      provider_call_error: null,
      diagnostics,
      request_payload_preview: {
        model: primarySuccessAttempt?.model ?? getProviderConfig(provider, generationPreset).model,
        provider_requested: provider,
        provider_fallback_used: false,
        generation_preset: generationPreset,
        stream_enabled: streamEnabled,
        retry_transient_errors: retryTransientErrors,
        max_tokens: primarySuccessAttempt?.max_tokens ?? null,
        reasoning_budget: primarySuccessAttempt?.reasoning_budget ?? null,
        reasoning_effort: primarySuccessAttempt?.reasoning_effort ?? null,
        temperature: primarySuccessAttempt?.temperature ?? null,
        top_p: primarySuccessAttempt?.top_p ?? null,
        request_profile: primarySuccessAttempt?.request_profile ?? null,
        clear_thinking_policy: primarySuccessAttempt?.clear_thinking_policy ?? null,
        native_reasoning_compatibility_fallback_used: nativeReasoningCompatibilityFallbackUsed,
        timeout_ms: primarySuccessAttempt?.timeout_ms ?? null,
        message_count: args.model_request.messages.length,
        prompt_chars: args.model_request.prompt_stats.total_chars,
        response_chars: primary.result.response_chars,
        first_token_ms: primary.result.first_token_ms,
        attempt_count: diagnostics.attempt_count,
        final_failure_kind: null,
      },
    };
  } catch (error) {
    primaryError = error;
    allAttempts.push(...errorAttempts(error));
  }

  if (fallbackProvider !== "none" && fallbackProvider !== "scaffold") {
    try {
      const fallback = await callConfiguredProvider(fallbackProvider, args.model_request, {
        ...options,
        // Keep fallback quick: one attempt after the primary provider has already failed/retried.
        max_attempts: 1,
      });

      allAttempts.push(...fallback.diagnostics.attempts);
      const diagnostics = mergeDiagnostics({
        primaryProvider: provider,
        fallbackProvider,
        providerFallbackUsed: true,
        generationPreset,
        streamEnabled,
        retryTransientErrors,
        startedAt,
        attempts: allAttempts,
        finalFailureKind: null,
        finalErrorMessage: null,
      });

      const successAttempt = fallback.diagnostics.attempts.find((attempt) => attempt.status === "success");

      return {
        provider,
        provider_used: successAttempt?.provider_used ?? (fallbackProvider === "openai" ? "openai" : "nvidia"),
        model: successAttempt?.model ?? getProviderConfig(fallbackProvider, generationPreset).model,
        raw_text: fallback.result.raw_text,
        duration_ms: diagnostics.total_duration_ms,
        provider_fallback_used: true,
        provider_call_error: `Primary ${provider} failed, then ${fallbackProvider} succeeded. Primary error: ${errorMessage(primaryError)}`,
        diagnostics,
        request_payload_preview: {
          model: successAttempt?.model ?? getProviderConfig(fallbackProvider, generationPreset).model,
          provider_requested: provider,
          fallback_provider: fallbackProvider,
          provider_fallback_used: true,
          primary_error: errorMessage(primaryError),
          generation_preset: generationPreset,
          stream_enabled: streamEnabled,
          retry_transient_errors: retryTransientErrors,
          max_tokens: successAttempt?.max_tokens ?? null,
          reasoning_budget: successAttempt?.reasoning_budget ?? null,
          reasoning_effort: successAttempt?.reasoning_effort ?? null,
          temperature: successAttempt?.temperature ?? null,
          top_p: successAttempt?.top_p ?? null,
          request_profile: successAttempt?.request_profile ?? null,
          clear_thinking_policy: successAttempt?.clear_thinking_policy ?? null,
          native_reasoning_compatibility_fallback_used:
            fallback.diagnostics.attempts.some(
              (attempt) =>
                attempt.request_profile === "glm53_native_reasoning" &&
                attempt.http_status === 422,
            ) &&
            successAttempt?.request_profile === "glm53_hosted_compatibility",
          timeout_ms: successAttempt?.timeout_ms ?? null,
          message_count: args.model_request.messages.length,
          prompt_chars: args.model_request.prompt_stats.total_chars,
          response_chars: fallback.result.response_chars,
          first_token_ms: fallback.result.first_token_ms,
          attempt_count: diagnostics.attempt_count,
          final_failure_kind: null,
        },
      };
    } catch (fallbackError) {
      allAttempts.push(...errorAttempts(fallbackError));
      const diagnostics = mergeDiagnostics({
        primaryProvider: provider,
        fallbackProvider,
        providerFallbackUsed: true,
        generationPreset,
        streamEnabled,
        retryTransientErrors,
        startedAt,
        attempts: allAttempts,
        finalFailureKind: errorFailureKind(fallbackError),
        finalErrorMessage: `Primary error: ${errorMessage(primaryError)} | Fallback error: ${errorMessage(fallbackError)}`,
      });

      return scaffoldResult({
        requestedProvider: provider,
        modelRequest: args.model_request,
        scaffoldRawText: args.scaffold_raw_text,
        diagnostics,
        providerFallbackUsed: true,
        providerCallError: diagnostics.final_error_message,
      });
    }
  }

  const diagnostics = mergeDiagnostics({
    primaryProvider: provider,
    fallbackProvider,
    providerFallbackUsed: fallbackProvider === "scaffold",
    generationPreset,
    streamEnabled,
    retryTransientErrors,
    startedAt,
    attempts: allAttempts,
    finalFailureKind: errorFailureKind(primaryError),
    finalErrorMessage: errorMessage(primaryError),
  });

  return scaffoldResult({
    requestedProvider: provider,
    modelRequest: args.model_request,
    scaffoldRawText: args.scaffold_raw_text,
    diagnostics,
    providerFallbackUsed: fallbackProvider === "scaffold",
    providerCallError: errorMessage(primaryError),
  });
}
