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

const DEFAULT_TOPIC_LABELER_PROVIDER: TopicLabelerProviderId = "v3";
const DEFAULT_TOPIC_LABELER_TIMEOUT_MS = 15_000;
const MIN_TOPIC_LABELER_TIMEOUT_MS = 500;
const MAX_TOPIC_LABELER_TIMEOUT_MS = 60_000;

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

  return DEFAULT_TOPIC_LABELER_PROVIDER;
}

function clampTimeoutMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TOPIC_LABELER_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(Math.round(value), MIN_TOPIC_LABELER_TIMEOUT_MS),
    MAX_TOPIC_LABELER_TIMEOUT_MS,
  );
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
   * Current runtime default:
   * the local topic labeler is authoritative unless explicitly disabled.
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

  return clampTimeoutMs(parsed);
}

export function buildTopicLabelerRequest(input: {
  message: string;
  activeTopicLabel?: string | null;
  currentTopicLabels?: string[];
  previousUserMessages?: string[];
}): TopicLabelerRequest {
  /**
   * V3 already uses the canonical wire shape:
   * active_topic_label
   * current_topic_labels
   * previous_user_messages
   *
   * Future V4/V5 adapters should translate from this generic request rather
   * than changing /api/message.
   */
  return buildTopicLabelerV3Request({
    message: input.message,
    activeTopicLabel: input.activeTopicLabel ?? null,
    currentTopicLabels: normalizeStringArray(input.currentTopicLabels),
    previousUserMessages: normalizeStringArray(input.previousUserMessages),
  });
}

function buildUnsupportedProviderResult(args: {
  provider: TopicLabelerProviderId;
  startedAt: number;
}): TopicLabelerClientResult {
  return {
    ok: false,
    source: "topic_labeler",
    provider: args.provider,
    error: `Topic labeler provider "${args.provider}" is configured but no adapter is implemented yet.`,
    latency_ms: Date.now() - args.startedAt,
  };
}

export async function callConfiguredTopicLabeler(
  request: TopicLabelerRequest,
  options?: {
    timeoutMs?: number;
  },
): Promise<TopicLabelerClientResult> {
  const provider = getTopicLabelerProvider();
  const timeoutMs = clampTimeoutMs(options?.timeoutMs ?? getTopicLabelerTimeoutMs());
  const startedAt = Date.now();

  if (provider === "v3") {
    return callTopicLabelerV3(request, { timeoutMs });
  }

  /**
   * Provider slots are intentionally explicit.
   * Switching MYWAY_TOPIC_LABELER_PROVIDER=v4/v5 should fail safely until a real
   * adapter exists, rather than silently pretending the provider is wired.
   */
  return buildUnsupportedProviderResult({
    provider,
    startedAt,
  });
}

export type { TopicLabelerClientResult, TopicLabelerRequest };
