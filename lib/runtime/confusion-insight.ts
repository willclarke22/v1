export type ModelSignalStatus = "ok" | "unavailable" | "timeout" | "error" | null;
export type ModelInferenceMode = "local" | "service" | null;

export type ConfusionInsightSignals = {
  model_confusion: number | null;
  model_insight: number | null;
  model_version: string | null;
  inference_mode: ModelInferenceMode;
  latency_ms: number | null;
  status: ModelSignalStatus;
  error_message: string | null;
};

export type ScoreConfusionInsightInput = {
  userMessage: string;
  chatHistory: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export async function scoreConfusionInsightStub(
  input: ScoreConfusionInsightInput
): Promise<ConfusionInsightSignals> {
  const started = Date.now();

  try {
    const msg = input.userMessage.trim().toLowerCase();

    let confusion = 0.3;
    let insight = 0.3;

    if (!msg) {
      confusion = 0;
      insight = 0;
    } else {
      if (/\b(i don't get|confused|lost|what does that mean|i'm not sure|stuck)\b/.test(msg)) {
        confusion += 0.25;
      }
      if (/\b(so that means|oh|i see|because|then|therefore|in other words)\b/.test(msg)) {
        insight += 0.2;
      }
      if (msg.length < 20) {
        insight -= 0.05;
      }
    }

    return {
      model_confusion: clamp01(Number(confusion.toFixed(2))),
      model_insight: clamp01(Number(insight.toFixed(2))),
      model_version: "stub-v1",
      inference_mode: "local",
      latency_ms: Date.now() - started,
      status: "ok",
      error_message: null,
    };
  } catch (error) {
    return {
      model_confusion: null,
      model_insight: null,
      model_version: "stub-v1",
      inference_mode: "local",
      latency_ms: Date.now() - started,
      status: "error",
      error_message: error instanceof Error ? error.message : "Unknown scoring error",
    };
  }
}