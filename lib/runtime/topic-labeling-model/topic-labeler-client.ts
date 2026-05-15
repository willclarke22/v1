import {
  buildTopicLabelerV3Request,
  callTopicLabelerV3,
} from "./model-topic-labeler-v3";
import type {
  TopicLabelerClientResult,
  TopicLabelerProviderId,
  TopicLabelerRequest,
} from "./topic-labeler-contract";

export type TopicLabelerMode =
  | "off"
  | "deterministic_only"
  | "shadow"
  | "compare"
  | "fallback"
  | "authoritative";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProvider(raw: string | undefined): TopicLabelerProviderId {
  const value = raw?.trim().toLowerCase();

  if (value === "v4") return "v4";
  if (value === "v5") return "v5";

  return "v3";
}

export function getTopicLabelerProvider(): TopicLabelerProviderId {
  return normalizeProvider(process.env.MYWAY_TOPIC_LABELER_PROVIDER);
}

export function getTopicLabelerMode(): TopicLabelerMode {
  const raw =
    process.env.MYWAY_TOPIC_LABELER_MODE?.trim().toLowerCase() ??
    process.env.TOPIC_LABELER_MODE?.trim().toLowerCase() ??
    "";

  if (
    raw === "off" ||
    raw === "false" ||
    raw === "0" ||
    raw === "disabled"
  ) {
    return "off";
  }

  if (raw === "deterministic_only" || raw === "legacy_deterministic") {
    return "deterministic_only";
  }

  if (raw === "shadow") return "shadow";
  if (raw === "compare") return "compare";
  if (raw === "fallback") return "fallback";

  /**
   * Current behavior before this abstraction pass:
   * V3 is active unless explicitly disabled.
   */
  return "authoritative";
}

export function getTopicLabelerEnabled(): boolean {
  const mode = getTopicLabelerMode();

  return mode !== "off" && mode !== "deterministic_only";
}

export function getTopicLabelerTimeoutMs(): number {
  const raw = process.env.MYWAY_TOPIC_LABELER_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }

  return 15_000;
}

export function buildTopicLabelerRequest(input: {
  message: string;
  activeTopicLabel?: string | null;
  currentTopicLabels?: string[];
  previousUserMessages?: string[];
}): TopicLabelerRequest {
  /**
   * For now this delegates to the V3 request builder because V3 already uses
   * the canonical wire shape:
   *
   * active_topic_label
   * current_topic_labels
   * previous_user_messages
   *
   * Later, if V4/V5 need different raw service payloads, their adapters can
   * translate from this generic request into their own service-specific shape.
   */
  return buildTopicLabelerV3Request({
    message: input.message,
    activeTopicLabel: input.activeTopicLabel ?? null,
    currentTopicLabels: normalizeStringArray(input.currentTopicLabels),
    previousUserMessages: normalizeStringArray(input.previousUserMessages),
  });
}

export async function callConfiguredTopicLabeler(
  request: TopicLabelerRequest,
  options?: {
    timeoutMs?: number;
  }
): Promise<TopicLabelerClientResult> {
  const provider = getTopicLabelerProvider();
  const timeoutMs = options?.timeoutMs ?? getTopicLabelerTimeoutMs();
  const startedAt = Date.now();

  if (provider === "v3") {
    return callTopicLabelerV3(request, { timeoutMs });
  }

  /**
   * These provider slots are intentionally explicit.
   * This means switching MYWAY_TOPIC_LABELER_PROVIDER=v4 will fail safely until
   * a real V4 adapter exists, rather than silently pretending V4 is wired.
   */
  return {
    ok: false,
    source: "topic_labeler",
    provider,
    error: `Topic labeler provider "${provider}" is configured but no adapter is implemented yet.`,
    latency_ms: Date.now() - startedAt,
  };
}

export type { TopicLabelerClientResult, TopicLabelerRequest };