import type { ModelSignals } from "@/types/contracts";

export type ScoreConfusionInsightInput = {
  userMessage: string;
  chatHistory: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => {
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

async function scoreConfusionInsightStub(
  input: ScoreConfusionInsightInput
): Promise<ModelSignals> {
  const startedAt = Date.now();

  try {
    const userMessage = input.userMessage.trim();
    const lowerMessage = userMessage.toLowerCase();
    const lowerHistory = input.chatHistory.toLowerCase();

    if (!userMessage) {
      return {
        model_confusion: 0,
        model_insight: 0,
        model_version: "stub-v1",
        inference_mode: "local",
        latency_ms: Date.now() - startedAt,
        status: "ok",
        error_message: null,
      };
    }

    const confusionPatterns = [
      /\b(i don't get|i dont get)\b/,
      /\b(i don't understand|i dont understand)\b/,
      /\b(i'm confused|i am confused|confused)\b/,
      /\b(i'm lost|i am lost|lost)\b/,
      /\b(stuck)\b/,
      /\b(what does .* mean)\b/,
      /\b(why is)\b/,
      /\b(how does)\b/,
      /\b(not sure)\b/,
      /\b(help)\b/,
    ];

    const insightPatterns = [
      /\b(so that means)\b/,
      /\b(so basically)\b/,
      /\b(in other words)\b/,
      /\b(i think i see)\b/,
      /\b(i see)\b/,
      /\b(ohh?|ahh?)\b/,
      /\b(because)\b/,
      /\b(therefore)\b/,
      /\b(so if)\b/,
      /\b(that means)\b/,
    ];

    const questionCount = (userMessage.match(/\?/g) ?? []).length;
    const confusionHits = countMatches(lowerMessage, confusionPatterns);
    const insightHits = countMatches(lowerMessage, insightPatterns);

    let confusion = 0.28;
    let insight = 0.22;

    if (userMessage.length < 18) {
      confusion += 0.06;
      insight -= 0.04;
    }

    if (questionCount >= 2) {
      confusion += 0.08;
    } else if (questionCount === 1) {
      confusion += 0.03;
    }

    confusion += confusionHits * 0.1;
    insight += insightHits * 0.1;

    if (/\b(can you explain|explain|what is|what are)\b/.test(lowerMessage)) {
      confusion += 0.06;
    }

    if (/\b(quiz me|test me|let me try)\b/.test(lowerMessage)) {
      insight += 0.08;
      confusion -= 0.03;
    }

    if (/\b(but|however)\b/.test(lowerMessage) && /\b(because|therefore|so)\b/.test(lowerMessage)) {
      insight += 0.06;
    }

    if (lowerHistory.includes("myway:") && /\b(still|again)\b/.test(lowerMessage)) {
      confusion += 0.05;
    }

    confusion = clamp01(round2(confusion));
    insight = clamp01(round2(insight));

    return {
      model_confusion: confusion,
      model_insight: insight,
      model_version: "stub-v1",
      inference_mode: "local",
      latency_ms: Date.now() - startedAt,
      status: "ok",
      error_message: null,
    };
  } catch (error) {
    return {
      model_confusion: null,
      model_insight: null,
      model_version: "stub-v1",
      inference_mode: "local",
      latency_ms: Date.now() - startedAt,
      status: "error",
      error_message: error instanceof Error ? error.message : "Unknown scoring error",
    };
  }
}

async function scoreConfusionInsightViaService(
  input: ScoreConfusionInsightInput
): Promise<ModelSignals> {
  const startedAt = Date.now();
  const serviceUrl = process.env.CONFUSION_INSIGHT_SERVICE_URL;

  if (!serviceUrl) {
    return {
      model_confusion: null,
      model_insight: null,
      model_version: "service-unconfigured",
      inference_mode: "service",
      latency_ms: Date.now() - startedAt,
      status: "unavailable",
      error_message: "CONFUSION_INSIGHT_SERVICE_URL is not set.",
    };
  }

  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_message: input.userMessage,
        chat_history: input.chatHistory,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        model_confusion: null,
        model_insight: null,
        model_version: "service-http-error",
        inference_mode: "service",
        latency_ms: Date.now() - startedAt,
        status: "error",
        error_message: `Confusion/insight service returned HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as Partial<ModelSignals> & {
      model_confusion?: number | null;
      model_insight?: number | null;
      model_version?: string | null;
      status?: ModelSignals["status"];
      error_message?: string | null;
    };

    return {
      model_confusion:
        typeof data.model_confusion === "number"
          ? clamp01(round2(data.model_confusion))
          : null,
      model_insight:
        typeof data.model_insight === "number"
          ? clamp01(round2(data.model_insight))
          : null,
      model_version: data.model_version ?? "service-v1",
      inference_mode: "service",
      latency_ms: Date.now() - startedAt,
      status: data.status ?? "ok",
      error_message: data.error_message ?? null,
    };
  } catch (error) {
    return {
      model_confusion: null,
      model_insight: null,
      model_version: "service-runtime-error",
      inference_mode: "service",
      latency_ms: Date.now() - startedAt,
      status: "error",
      error_message:
        error instanceof Error ? error.message : "Unknown service error",
    };
  }
}

export async function scoreConfusionInsight(
  input: ScoreConfusionInsightInput
): Promise<ModelSignals> {
  const mode = (process.env.CONFUSION_INSIGHT_MODE ?? "stub").toLowerCase();

  if (mode === "service") {
    return scoreConfusionInsightViaService(input);
  }

  return scoreConfusionInsightStub(input);
}