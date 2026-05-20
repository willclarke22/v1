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

type ConfusionInsightServiceResponse = {
  model_confusion?: number | null;
  model_insight?: number | null;
  model_version?: string | null;
  inference_mode?: "service" | "local" | null;
  status?: string | null;
  latency_ms?: number | null;
  error_message?: string | null;
  raw_logits?: number[];
};

type ScoreConfusionInsightArgs = {
  userMessage: string;
  chatHistory?: string[];
  timeoutMs?: number;
};

const DEFAULT_CONFUSION_INSIGHT_SERVICE_URL =
  "http://127.0.0.1:8003/score";

const DEFAULT_TIMEOUT_MS = 1800;

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

export async function scoreConfusionInsight({
  userMessage,
  chatHistory = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ScoreConfusionInsightArgs): Promise<ConfusionInsightSignals> {
  const serviceUrl =
    process.env.CONFUSION_INSIGHT_SERVICE_URL ??
    DEFAULT_CONFUSION_INSIGHT_SERVICE_URL;

  if (!userMessage.trim()) {
    return emptySignals("unavailable", "No user message provided.");
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
      body: JSON.stringify({
        user_message: userMessage,
        chat_history: chatHistory.slice(-8),
      }),
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