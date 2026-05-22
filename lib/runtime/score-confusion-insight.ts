export type ConfusionInsightStatus =
  | "ok"
  | "unavailable"
  | "timeout"
  | "error";

export type ConfusionInsightSignals = {
  model_confusion: number | null;
  model_insight: number | null;
  model_version: string | null;
  inference_mode: "service" | "local" | null;
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
 * The v1_1 model is fast once warm, but local Next/Turbopack + Python service
 * scheduling can occasionally push the first foreground request above 800ms.
 * 2s keeps the foreground path practical while preserving a clean timeout/fallback.
 */
const DEFAULT_TIMEOUT_MS = 2_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 10_000;

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

function getConfiguredDefaultTimeoutMs() {
  const raw = process.env.CONFUSION_INSIGHT_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;

  const parsed = Number(raw);
  return normalizeTimeoutMs(parsed, DEFAULT_TIMEOUT_MS);
}

function buildLegacyStructuredInput(
  args: ScoreConfusionInsightLegacyArgs,
): ConfusionInsightStructuredInput {
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
    most_related_topic_similarity_threshold: 0.65,
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
    .slice(-5);
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
    topic_transition_type: normalizeTopicTransitionType(input.topic_transition_type),
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
    most_related_topic_similarity_threshold: normalizeNullableNumber(
      input.most_related_topic_similarity_threshold,
    ),
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

export async function scoreConfusionInsight(
  args: ScoreConfusionInsightArgs,
): Promise<ConfusionInsightSignals> {
  const serviceUrl =
    process.env.CONFUSION_INSIGHT_SERVICE_URL ??
    DEFAULT_CONFUSION_INSIGHT_SERVICE_URL;

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

    if (!response.ok) {
      return emptySignals(
        "error",
        `Confusion/insight provider returned HTTP ${response.status}.`,
        latencyMs,
      );
    }

    const data = (await response.json()) as ConfusionInsightServiceResponse;

    if (data.status !== "ok") {
      return emptySignals(
        "error",
        data.error_message ??
          "Confusion/insight provider returned non-ok status.",
        typeof data.latency_ms === "number" ? data.latency_ms : latencyMs,
      );
    }

    return {
      model_confusion: clamp01(data.model_confusion),
      model_insight: clamp01(data.model_insight),
      model_version: data.model_version ?? null,
      inference_mode: data.inference_mode ?? "service",
      latency_ms:
        typeof data.latency_ms === "number" ? data.latency_ms : latencyMs,
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
