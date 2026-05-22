export type ConfusionInsightStatus =
  | "ok"
  | "unavailable"
  | "timeout"
  | "error";

export type ConfusionInsightInferenceMode = "service" | "local" | null;

export type ConfusionInsightSignals = {
  model_confusion: number | null;
  model_insight: number | null;
  model_version: string | null;
  inference_mode: ConfusionInsightInferenceMode;
  latency_ms: number | null;
  status: ConfusionInsightStatus;
  error_message: string | null;
};

export type ConfusionInsightInputType =
  | "message"
  | "clarify_response"
  | "text_attempt"
  | "spoken_attempt"
  | "interactive_attempt"
  | "video_checkpoint_attempt"
  | "audio_checkpoint_attempt";

export type ConfusionInsightTopicTransitionType =
  | "same_topic"
  | "nearby_topic"
  | "far_topic"
  | "new_topic";

export type ConfusionInsightPreviousMode =
  | "no_previous"
  | "clarify"
  | "probe";

export type ConfusionInsightEvent = {
  event_type: "clarify" | "probe" | "attempt" | string | null;
  topic_label: string | null;
  diagnosis_label: string | null;

  clarification_prompt?: string | null;
  clarification_goal?: string | null;

  probe_type?: string | null;
  modality?: string | null;
  probe_prompt?: string | null;
  learning_objective?: string | null;
  expected_attempt_type?: string | null;
  success_marker?: string | null;
  misconception_being_tested?: string | null;

  attempt_type?: string | null;
  evidence?: string | null;
};

export type ConfusionInsightStructuredInput = {
  input_type: ConfusionInsightInputType;
  current_attempt_type: string | null;
  current_evidence: string;

  previous_active_topic_label: string | null;
  target_topic_label: string | null;
  topic_transition_type: ConfusionInsightTopicTransitionType;
  topic_similarity: number | null;

  previous_mode: ConfusionInsightPreviousMode;
  is_response_to_clarify: boolean;
  is_response_to_probe: boolean;

  target_topic_recent_events: ConfusionInsightEvent[];

  most_related_topic_label: string | null;
  most_related_topic_similarity: number | null;
  most_related_topic_similarity_threshold: number | null;
  most_related_topic_recent_events: ConfusionInsightEvent[];

  target_topic_confusion_average: number | null;
  target_topic_insight_average: number | null;

  most_related_topic_confusion_average: number | null;
  most_related_topic_insight_average: number | null;
};

type ConfusionInsightServiceResponse = {
  model_confusion?: number | null;
  model_insight?: number | null;
  model_version?: string | null;
  inference_mode?: "service" | "local" | null;
  status?: string | null;
  latency_ms?: number | null;
  error_message?: string | null;
  raw_logits?: number[];
  raw_scores?: {
    confusion?: number | null;
    insight?: number | null;
  } | null;
};

type ScoreConfusionInsightStructuredArgs = {
  input: ConfusionInsightStructuredInput;
  timeoutMs?: number;
};

type ScoreConfusionInsightLegacyArgs = {
  userMessage: string;
  chatHistory?: string[];
  timeoutMs?: number;
};

type ScoreConfusionInsightArgs =
  | ScoreConfusionInsightStructuredArgs
  | ScoreConfusionInsightLegacyArgs;

const DEFAULT_CONFUSION_INSIGHT_SERVICE_URL =
  "http://127.0.0.1:8003/score";

/**
 * MYWAY_* names are the canonical runtime configuration surface.
 *
 * The older CONFUSION_INSIGHT_* names are supported as fallbacks so this adapter
 * can be swapped without breaking existing local .env files.
 *
 * GPU/external service path:
 *   MYWAY_CONFUSION_INSIGHT_SERVICE_URL=http://gpu-host:8003
 *
 * Local managed worker path:
 *   default http://127.0.0.1:8003/score
 */
const SERVICE_URL_ENV_KEYS = [
  "MYWAY_CONFUSION_INSIGHT_SERVICE_URL",
  "CONFUSION_INSIGHT_SERVICE_URL",
] as const;

const TIMEOUT_MS_ENV_KEYS = [
  "MYWAY_CONFUSION_INSIGHT_TIMEOUT_MS",
  "CONFUSION_INSIGHT_TIMEOUT_MS",
] as const;

const DEFAULT_TIMEOUT_MS = 2_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_SIMILARITY_THRESHOLD = 0.65;
const MAX_RECENT_EVENTS = 5;

function emptySignals(
  status: ConfusionInsightStatus,
  errorMessage: string | null,
  latencyMs: number | null = null,
): ConfusionInsightSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: null,
    inference_mode: null,
    latency_ms: latencyMs,
    status,
    error_message: errorMessage,
  };
}

function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTimeoutMs(value: unknown, fallback = DEFAULT_TIMEOUT_MS) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.round(value)));
}

function getFirstConfiguredEnvValue(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeServiceUrl(value: string) {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);

    /**
     * Accept either a full /score endpoint or a bare service origin.
     */
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/score";
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

function getConfiguredServiceUrl() {
  const configured = getFirstConfiguredEnvValue(SERVICE_URL_ENV_KEYS);

  return normalizeServiceUrl(
    configured ?? DEFAULT_CONFUSION_INSIGHT_SERVICE_URL,
  );
}

function getConfiguredDefaultTimeoutMs() {
  const raw = getFirstConfiguredEnvValue(TIMEOUT_MS_ENV_KEYS);
  if (!raw) return DEFAULT_TIMEOUT_MS;

  return normalizeTimeoutMs(Number(raw), DEFAULT_TIMEOUT_MS);
}

function buildLegacyStructuredInput(
  args: ScoreConfusionInsightLegacyArgs,
): ConfusionInsightStructuredInput {
  /**
   * Legacy callers are still supported, but the adapter normalizes them into the
   * v1_1 structured shape before calling the provider. This keeps the model
   * boundary stable while older call sites are gradually retired.
   */
  return {
    input_type: "message",
    current_attempt_type: null,
    current_evidence: args.userMessage.trim(),

    previous_active_topic_label: null,
    target_topic_label: null,
    topic_transition_type: "same_topic",
    topic_similarity: null,

    previous_mode: "no_previous",
    is_response_to_clarify: false,
    is_response_to_probe: false,

    target_topic_recent_events: [],

    most_related_topic_label: null,
    most_related_topic_similarity: null,
    most_related_topic_similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    most_related_topic_recent_events: [],

    target_topic_confusion_average: null,
    target_topic_insight_average: null,

    most_related_topic_confusion_average: null,
    most_related_topic_insight_average: null,
  };
}

function normalizeEvent(event: ConfusionInsightEvent): ConfusionInsightEvent {
  return {
    event_type: normalizeOptionalString(event.event_type),
    topic_label: normalizeOptionalString(event.topic_label),
    diagnosis_label: normalizeOptionalString(event.diagnosis_label),

    clarification_prompt: normalizeOptionalString(event.clarification_prompt),
    clarification_goal: normalizeOptionalString(event.clarification_goal),

    probe_type: normalizeOptionalString(event.probe_type),
    modality: normalizeOptionalString(event.modality),
    probe_prompt: normalizeOptionalString(event.probe_prompt),
    learning_objective: normalizeOptionalString(event.learning_objective),
    expected_attempt_type: normalizeOptionalString(
      event.expected_attempt_type,
    ),
    success_marker: normalizeOptionalString(event.success_marker),
    misconception_being_tested: normalizeOptionalString(
      event.misconception_being_tested,
    ),

    attempt_type: normalizeOptionalString(event.attempt_type),
    evidence: normalizeOptionalString(event.evidence),
  };
}

function normalizeEvents(value: unknown): ConfusionInsightEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is ConfusionInsightEvent =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map(normalizeEvent)
    .slice(-MAX_RECENT_EVENTS);
}

function normalizeInputType(
  value: ConfusionInsightInputType,
): ConfusionInsightInputType {
  if (
    value === "message" ||
    value === "clarify_response" ||
    value === "text_attempt" ||
    value === "spoken_attempt" ||
    value === "interactive_attempt" ||
    value === "video_checkpoint_attempt" ||
    value === "audio_checkpoint_attempt"
  ) {
    return value;
  }

  return "message";
}

function normalizeTopicTransitionType(
  value: ConfusionInsightTopicTransitionType,
): ConfusionInsightTopicTransitionType {
  if (
    value === "same_topic" ||
    value === "nearby_topic" ||
    value === "far_topic" ||
    value === "new_topic"
  ) {
    return value;
  }

  return "same_topic";
}

function normalizePreviousMode(
  value: ConfusionInsightPreviousMode,
): ConfusionInsightPreviousMode {
  if (value === "no_previous" || value === "clarify" || value === "probe") {
    return value;
  }

  return "no_previous";
}

function normalizeStructuredInput(
  input: ConfusionInsightStructuredInput,
): ConfusionInsightStructuredInput {
  return {
    input_type: normalizeInputType(input.input_type),
    current_attempt_type: normalizeOptionalString(input.current_attempt_type),
    current_evidence: input.current_evidence.trim(),

    previous_active_topic_label: normalizeOptionalString(
      input.previous_active_topic_label,
    ),
    target_topic_label: normalizeOptionalString(input.target_topic_label),
    topic_transition_type: normalizeTopicTransitionType(
      input.topic_transition_type,
    ),
    topic_similarity: normalizeNullableNumber(input.topic_similarity),

    previous_mode: normalizePreviousMode(input.previous_mode),
    is_response_to_clarify: Boolean(input.is_response_to_clarify),
    is_response_to_probe: Boolean(input.is_response_to_probe),

    target_topic_recent_events: normalizeEvents(
      input.target_topic_recent_events,
    ),

    most_related_topic_label: normalizeOptionalString(
      input.most_related_topic_label,
    ),
    most_related_topic_similarity: normalizeNullableNumber(
      input.most_related_topic_similarity,
    ),
    most_related_topic_similarity_threshold:
      normalizeNullableNumber(input.most_related_topic_similarity_threshold) ??
      DEFAULT_SIMILARITY_THRESHOLD,
    most_related_topic_recent_events: normalizeEvents(
      input.most_related_topic_recent_events,
    ),

    target_topic_confusion_average: normalizeNullableNumber(
      input.target_topic_confusion_average,
    ),
    target_topic_insight_average: normalizeNullableNumber(
      input.target_topic_insight_average,
    ),

    most_related_topic_confusion_average: normalizeNullableNumber(
      input.most_related_topic_confusion_average,
    ),
    most_related_topic_insight_average: normalizeNullableNumber(
      input.most_related_topic_insight_average,
    ),
  };
}

function isStructuredArgs(
  args: ScoreConfusionInsightArgs,
): args is ScoreConfusionInsightStructuredArgs {
  return "input" in args;
}

function getRequestPayload(
  args: ScoreConfusionInsightArgs,
): ConfusionInsightStructuredInput {
  if (isStructuredArgs(args)) {
    return normalizeStructuredInput(args.input);
  }

  return buildLegacyStructuredInput(args);
}

function getTimeoutMs(args: ScoreConfusionInsightArgs) {
  return normalizeTimeoutMs(args.timeoutMs, getConfiguredDefaultTimeoutMs());
}

function normalizeServiceResponseLatencyMs(
  value: unknown,
  fallbackLatencyMs: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallbackLatencyMs;
}

function normalizeProviderInferenceMode(
  value: unknown,
): ConfusionInsightInferenceMode {
  if (value === "service" || value === "local") return value;
  return "service";
}

function normalizeProviderStatus(value: unknown): ConfusionInsightStatus {
  if (
    value === "ok" ||
    value === "unavailable" ||
    value === "timeout" ||
    value === "error"
  ) {
    return value;
  }

  return "error";
}

function normalizeProviderErrorMessage(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeServiceScores(data: ConfusionInsightServiceResponse) {
  const modelConfusion =
    clamp01(data.model_confusion) ?? clamp01(data.raw_scores?.confusion);
  const modelInsight =
    clamp01(data.model_insight) ?? clamp01(data.raw_scores?.insight);

  return {
    modelConfusion,
    modelInsight,
  };
}

function buildInvalidScoreResponse(args: {
  data: ConfusionInsightServiceResponse;
  latencyMs: number;
}) {
  const { modelConfusion, modelInsight } = normalizeServiceScores(args.data);

  if (modelConfusion === null || modelInsight === null) {
    return emptySignals(
      "error",
      "Confusion/insight provider returned ok status without valid model_confusion/model_insight scores.",
      normalizeServiceResponseLatencyMs(args.data.latency_ms, args.latencyMs),
    );
  }

  return null;
}

async function readServiceResponseJson(
  response: Response,
): Promise<ConfusionInsightServiceResponse | null> {
  try {
    return (await response.json()) as ConfusionInsightServiceResponse;
  } catch {
    return null;
  }
}

export async function scoreConfusionInsight(
  args: ScoreConfusionInsightArgs,
): Promise<ConfusionInsightSignals> {
  const serviceUrl = getConfiguredServiceUrl();
  const payload = getRequestPayload(args);
  const timeoutMs = getTimeoutMs(args);

  if (!payload.current_evidence.trim()) {
    return emptySignals("unavailable", "No current evidence provided.");
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    clearTimeout(timeout);

    const latencyMs = Date.now() - started;
    const data = await readServiceResponseJson(response);

    if (!response.ok) {
      return emptySignals(
        "error",
        data?.error_message ??
          `Confusion/insight provider returned HTTP ${response.status}.`,
        normalizeServiceResponseLatencyMs(data?.latency_ms, latencyMs),
      );
    }

    if (!data) {
      return emptySignals(
        "error",
        "Confusion/insight provider returned an unreadable JSON response.",
        latencyMs,
      );
    }

    const providerStatus = normalizeProviderStatus(data.status ?? "ok");

    if (providerStatus !== "ok") {
      return emptySignals(
        providerStatus,
        normalizeProviderErrorMessage(
          data.error_message,
          "Confusion/insight provider returned non-ok status.",
        ),
        normalizeServiceResponseLatencyMs(data.latency_ms, latencyMs),
      );
    }

    const invalidScoreResponse = buildInvalidScoreResponse({
      data,
      latencyMs,
    });

    if (invalidScoreResponse) {
      return invalidScoreResponse;
    }

    const { modelConfusion, modelInsight } = normalizeServiceScores(data);

    return {
      model_confusion: modelConfusion,
      model_insight: modelInsight,
      model_version: data.model_version ?? null,
      inference_mode: normalizeProviderInferenceMode(data.inference_mode),
      latency_ms: normalizeServiceResponseLatencyMs(data.latency_ms, latencyMs),
      status: "ok",
      error_message: null,
    };
  } catch (error) {
    clearTimeout(timeout);

    const latencyMs = Date.now() - started;

    if (error instanceof Error && error.name === "AbortError") {
      return emptySignals(
        "timeout",
        `Confusion/insight provider timed out after ${timeoutMs}ms.`,
        latencyMs,
      );
    }

    return emptySignals(
      "unavailable",
      error instanceof Error ? error.message : "Unknown provider error.",
      latencyMs,
    );
  }
}
