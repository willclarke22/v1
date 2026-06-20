import {
  buildSeededTopicFromResolvedLabel,
  type RouteTopic,
  type SharedMessageFrame,
} from "@/lib/topic-routing/route-topics";

export type ForegroundTopicResolutionKind =
  | "message_exact_topic_label_match"
  | "message_lexical_topic_match"
  | "request_topic_reused"
  | "topic_labeler_existing_topic"
  | "topic_labeler_seeded_topic"
  | "topic_labeler_active_topic_reused"
  | "deterministic_label_existing_topic"
  | "deterministic_label_seeded_topic"
  | "empty_message_existing_topic"
  | "empty_message_seeded_topic";

export type ForegroundTopicResolution = {
  topic: RouteTopic;
  topicsForScene: RouteTopic[];
  resolution_kind: ForegroundTopicResolutionKind;
  resolved_label: string;
  match_confidence: number;
  authority_source:
    | "message_exact_match"
    | "message_lexical_match"
    | "request_body"
    | "topic_labeler_v3"
    | "deterministic_topic_labeler"
    | "empty_message_fallback";
  warnings: string[];
  rejected_request_topic?: {
    topic_id: string | null;
    topic_label: string | null;
    reason: string;
  } | null;
  topic_labeler_debug?: {
    ok: boolean;
    used: boolean;
    provider: "v3";
    model_version?: string | null;
    route_decision?: string | null;
    topic_reference_type?: string | null;
    extracted_label?: string | null;
    matched_topic_label?: string | null;
    score?: number | null;
    reason?: string | null;
    latency_ms?: number | null;
    error?: string | null;
  } | null;
};

type RequestTopicCandidate = {
  topic_id: string | null;
  topic_label: string | null;
};

type TopicLabelerV3RawResponse = {
  ok?: unknown;
  model_version?: unknown;
  model_prediction?: {
    topic_reference_type?: unknown;
    extracted_label?: unknown;
  } | null;
  route?: {
    route_decision?: unknown;
    topic_reference_type?: unknown;
    extracted_label?: unknown;
    matched_topic_label?: unknown;
    match_type?: unknown;
    score?: unknown;
    sequence_similarity?: unknown;
    token_f1?: unknown;
    reason?: unknown;
  } | null;
  timing?: unknown;
};

type TopicLabelerCallResult =
  | {
      ok: true;
      raw: TopicLabelerV3RawResponse;
      latency_ms: number;
    }
  | {
      ok: false;
      error: string;
      latency_ms: number;
    };

const FALLBACK_TOPIC_LABEL = "New learning question";
const DEFAULT_TOPIC_LABELER_V3_URL = "http://127.0.0.1:8002/label-topic";
const DEFAULT_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS = 2_500;
const MIN_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS = 250;
const MAX_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS = 10_000;

const STOPWORDS = new Set([
  "a",
  "about",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "but",
  "can",
  "do",
  "does",
  "for",
  "from",
  "get",
  "got",
  "have",
  "help",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "just",
  "keep",
  "know",
  "like",
  "me",
  "mix",
  "mixing",
  "my",
  "of",
  "on",
  "or",
  "please",
  "should",
  "so",
  "that",
  "the",
  "this",
  "to",
  "up",
  "what",
  "when",
  "where",
  "why",
  "with",
]);

function flagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLoose(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMeaningful(text: string): string[] {
  return normalizeLoose(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function titleCaseToken(token: string) {
  if (!token) return token;
  if (token.length <= 2) return token;
  return `${token[0].toUpperCase()}${token.slice(1)}`;
}

function toTopicLabel(tokens: string[]) {
  const label = tokens.map(titleCaseToken).join(" ").trim();
  return label || FALLBACK_TOPIC_LABEL;
}

function cleanTopicLabel(value: string | null | undefined) {
  return value?.trim() || FALLBACK_TOPIC_LABEL;
}

function isSpanishSeMessage(message: string) {
  const normalized = ` ${normalizeLoose(message)} `;

  return (
    normalized.includes(" spanish se ") ||
    (/\bse\b/u.test(normalized) &&
      (normalized.includes(" spanish ") ||
        normalized.includes(" reflexive ") ||
        normalized.includes(" passive ") ||
        normalized.includes(" impersonal ") ||
        normalized.includes(" pronoun ")))
  );
}

function inferFrameFromMessage(message: string): SharedMessageFrame {
  const normalized = normalizeLoose(message);

  if (
    normalized.includes("quiz") ||
    normalized.includes("test me") ||
    normalized.includes("practice")
  ) {
    return "quiz_request";
  }

  if (
    normalized.includes("confused") ||
    normalized.includes("mixing up") ||
    normalized.includes("stuck") ||
    normalized.includes("dont understand") ||
    normalized.includes("don't understand")
  ) {
    return "confusion_help";
  }

  if (
    normalized.includes("difference") ||
    normalized.includes("compare") ||
    normalized.includes("versus") ||
    normalized.includes(" vs ")
  ) {
    return "compare_request";
  }

  if (
    normalized.includes("apply") ||
    normalized.includes("use this") ||
    normalized.includes("example")
  ) {
    return "apply_request";
  }

  if (
    normalized.includes("answer is") ||
    normalized.includes("i got") ||
    normalized.includes("my answer")
  ) {
    return "attempt_like";
  }

  return "explain_request";
}

/**
 * Temporary cheap fallback labeler.
 *
 * This intentionally does not call embeddings or any heavy semantic service.
 * The optional topic-labeler V3 call below runs only when explicitly enabled.
 */
function inferResolvedLabelFromMessage(message: string) {
  const normalized = normalizeLoose(message);

  if (!normalized) return FALLBACK_TOPIC_LABEL;

  if (isSpanishSeMessage(message)) {
    return "Spanish se";
  }

  if (
    normalized.includes("stoichiometry") ||
    normalized.includes("molar mass") ||
    normalized.includes("mole ratio") ||
    normalized.includes("limiting reactant") ||
    normalized.includes("balanced equation")
  ) {
    return "Stoichiometry";
  }

  const phrasePatterns = [
    /\b(?:help me with|help with|explain|understand|learn|review|practice)\s+(.+)$/iu,
    /\b(?:i keep mixing up|i am mixing up|i'm mixing up)\s+(.+)$/iu,
    /\b(?:what is|what are|how does|how do)\s+(.+)$/iu,
  ];

  for (const pattern of phrasePatterns) {
    const match = message.match(pattern);
    const captured = match?.[1]?.trim();

    if (captured) {
      const tokens = unique(tokenizeMeaningful(captured)).slice(0, 4);
      if (tokens.length) return toTopicLabel(tokens);
    }
  }

  const tokens = unique(tokenizeMeaningful(message)).slice(0, 4);
  return toTopicLabel(tokens);
}

function findTopicById(topics: RouteTopic[], id: string | null) {
  if (!id) return null;
  return topics.find((topic) => topic.id === id) ?? null;
}

function findTopicByLabel(topics: RouteTopic[], label: string | null) {
  if (!label) return null;

  const normalizedLabel = normalizeLoose(label);

  return (
    topics.find(
      (topic) => normalizeLoose(topic.topic_label) === normalizedLabel,
    ) ?? null
  );
}

function extractRequestTopicCandidate(requestBody: unknown): RequestTopicCandidate {
  const record = asRecord(requestBody);
  const context = asRecord(record.context);
  const topic = asRecord(record.topic);
  const selectedTopic = asRecord(record.selectedTopic);
  const activeTopic = asRecord(record.activeTopic);
  const focusedTopic = asRecord(record.focusedTopic);

  const topicId =
    asString(record.selectedTopicId) ??
    asString(record.activeTopicId) ??
    asString(record.focusedTopicId) ??
    asString(record.currentTopicId) ??
    asString(record.targetTopicId) ??
    asString(record.topicId) ??
    asString(context.selectedTopicId) ??
    asString(context.activeTopicId) ??
    asString(context.focusedTopicId) ??
    asString(context.currentTopicId) ??
    asString(topic.id) ??
    asString(topic.topic_id) ??
    asString(selectedTopic.id) ??
    asString(selectedTopic.topic_id) ??
    asString(activeTopic.id) ??
    asString(activeTopic.topic_id) ??
    asString(focusedTopic.id) ??
    asString(focusedTopic.topic_id) ??
    null;

  const topicLabel =
    asString(record.selectedTopicLabel) ??
    asString(record.activeTopicLabel) ??
    asString(record.focusedTopicLabel) ??
    asString(record.currentTopicLabel) ??
    asString(record.targetTopicLabel) ??
    asString(record.topicLabel) ??
    asString(record.topic_label) ??
    asString(context.selectedTopicLabel) ??
    asString(context.activeTopicLabel) ??
    asString(context.focusedTopicLabel) ??
    asString(context.currentTopicLabel) ??
    asString(topic.topic_label) ??
    asString(topic.label) ??
    asString(selectedTopic.topic_label) ??
    asString(selectedTopic.label) ??
    asString(activeTopic.topic_label) ??
    asString(activeTopic.label) ??
    asString(focusedTopic.topic_label) ??
    asString(focusedTopic.label) ??
    null;

  return {
    topic_id: topicId,
    topic_label: topicLabel,
  };
}

function scoreTopicForMessage(topic: RouteTopic, message: string) {
  const normalizedMessage = normalizeLoose(message);
  const normalizedLabel = normalizeLoose(topic.topic_label);

  if (!normalizedMessage || !normalizedLabel) return 0;

  if (normalizedMessage.includes(normalizedLabel)) return 0.98;

  if (
    normalizedMessage.length >= 8 &&
    normalizedLabel.includes(normalizedMessage)
  ) {
    return 0.9;
  }

  const labelTokens = unique(tokenizeMeaningful(topic.topic_label));
  const messageTokens = new Set(tokenizeMeaningful(message));

  if (!labelTokens.length || !messageTokens.size) return 0;

  const overlap = labelTokens.filter((token) => messageTokens.has(token)).length;
  const labelCoverage = overlap / labelTokens.length;
  const messageCoverage = overlap / Math.min(messageTokens.size, labelTokens.length);

  return Math.max(labelCoverage * 0.78, messageCoverage * 0.62);
}

function bestScoredTopic(topics: RouteTopic[], message: string) {
  let best:
    | {
        topic: RouteTopic;
        score: number;
      }
    | null = null;

  for (const topic of topics) {
    const score = scoreTopicForMessage(topic, message);

    if (!best || score > best.score) {
      best = {
        topic,
        score,
      };
    }
  }

  return best;
}

function messageHasConcreteTopicSignal(message: string) {
  if (isSpanishSeMessage(message)) return true;

  const tokens = tokenizeMeaningful(message);

  return tokens.length >= 2;
}

function buildSeededResolution(args: {
  existingTopics: RouteTopic[];
  resolvedLabel: string;
  resolutionKind: ForegroundTopicResolutionKind;
  authoritySource: ForegroundTopicResolution["authority_source"];
  matchConfidence: number;
  warnings: string[];
  rejectedRequestTopic?: ForegroundTopicResolution["rejected_request_topic"];
  frame: SharedMessageFrame;
  topicLabelerDebug?: ForegroundTopicResolution["topic_labeler_debug"];
}): ForegroundTopicResolution {
  const topic = buildSeededTopicFromResolvedLabel({
    resolvedLabel: cleanTopicLabel(args.resolvedLabel),
    existingTopics: args.existingTopics,
    frame: args.frame,
  });

  return {
    topic,
    topicsForScene: [topic],
    resolution_kind: args.resolutionKind,
    resolved_label: topic.topic_label,
    match_confidence: args.matchConfidence,
    authority_source: args.authoritySource,
    warnings: args.warnings,
    rejected_request_topic: args.rejectedRequestTopic ?? null,
    topic_labeler_debug: args.topicLabelerDebug ?? null,
  };
}

function getTopicLabelerV3Url() {
  return (
    process.env.MYWAY_TOPIC_LABELER_V3_URL?.trim() ||
    process.env.TOPIC_LABELER_V3_URL?.trim() ||
    DEFAULT_TOPIC_LABELER_V3_URL
  );
}

function getForegroundTopicLabelerTimeoutMs() {
  const raw = process.env.MYWAY_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(Math.round(parsed), MIN_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS),
    MAX_FOREGROUND_TOPIC_LABELER_TIMEOUT_MS,
  );
}

function shouldUseForegroundTopicLabeler() {
  if (flagEnabled(process.env.MYWAY_USE_TOPIC_LABELER_IN_FOREGROUND)) {
    return true;
  }

  return false;
}

function extractPreviousUserMessages(requestBody: unknown): string[] {
  const record = asRecord(requestBody);
  const context = asRecord(record.context);
  const raw =
    record.previousUserMessages ??
    record.previous_user_messages ??
    context.previousUserMessages ??
    context.previous_user_messages ??
    [];

  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-5);
}

async function callTopicLabelerV3ForForeground(args: {
  message: string;
  activeTopicLabel: string | null;
  currentTopicLabels: string[];
  previousUserMessages: string[];
}): Promise<TopicLabelerCallResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = getForegroundTopicLabelerTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getTopicLabelerV3Url(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        active_topic_label: args.activeTopicLabel,
        current_topic_labels: args.currentTopicLabels,
        previous_user_messages: args.previousUserMessages,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `Topic labeler V3 returned HTTP ${response.status}: ${text}`,
        latency_ms: Date.now() - startedAt,
      };
    }

    return {
      ok: true,
      raw: JSON.parse(text) as TopicLabelerV3RawResponse,
      latency_ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message || "Topic labeler V3 request failed."
          : "Unknown topic labeler V3 request failure.",
      latency_ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function topicLabelerDebugFromRaw(args: {
  raw: TopicLabelerV3RawResponse;
  latencyMs: number;
}): NonNullable<ForegroundTopicResolution["topic_labeler_debug"]> {
  return {
    ok: Boolean(args.raw.ok),
    used: true,
    provider: "v3",
    model_version: asString(args.raw.model_version),
    route_decision: asString(args.raw.route?.route_decision),
    topic_reference_type:
      asString(args.raw.route?.topic_reference_type) ??
      asString(args.raw.model_prediction?.topic_reference_type),
    extracted_label:
      asString(args.raw.route?.extracted_label) ??
      asString(args.raw.model_prediction?.extracted_label),
    matched_topic_label: asString(args.raw.route?.matched_topic_label),
    score: asNumber(args.raw.route?.score),
    reason: asString(args.raw.route?.reason),
    latency_ms: args.latencyMs,
  };
}

async function resolveWithTopicLabeler(args: {
  message: string;
  existingTopics: RouteTopic[];
  requestCandidate: RequestTopicCandidate;
  requestTopic: RouteTopic | null;
  frame: SharedMessageFrame;
  warnings: string[];
}): Promise<ForegroundTopicResolution | null> {
  if (!shouldUseForegroundTopicLabeler()) return null;

  const call = await callTopicLabelerV3ForForeground({
    message: args.message,
    activeTopicLabel: args.requestCandidate.topic_label,
    currentTopicLabels: args.existingTopics.map((topic) => topic.topic_label),
    previousUserMessages: [],
  });

  if (!call.ok) {
    args.warnings.push(`Topic labeler V3 failed; using fallback resolver. ${call.error}`);

    return null;
  }

  const debug = topicLabelerDebugFromRaw({
    raw: call.raw,
    latencyMs: call.latency_ms,
  });

  const routeDecision = debug.route_decision ?? null;
  const matchedLabel = debug.matched_topic_label ?? null;
  const extractedLabel = debug.extracted_label ?? null;
  const requestedActiveTopic = args.requestTopic;

  if (routeDecision === "stay_active" && requestedActiveTopic) {
    return {
      topic: requestedActiveTopic,
      topicsForScene: [requestedActiveTopic],
      resolution_kind: "topic_labeler_active_topic_reused",
      resolved_label: requestedActiveTopic.topic_label,
      match_confidence: debug.score ?? 0.78,
      authority_source: "topic_labeler_v3",
      warnings: args.warnings,
      rejected_request_topic: null,
      topic_labeler_debug: debug,
    };
  }

  const existingByMatchedLabel = findTopicByLabel(args.existingTopics, matchedLabel);
  const existingByExtractedLabel = findTopicByLabel(args.existingTopics, extractedLabel);
  const existing = existingByMatchedLabel ?? existingByExtractedLabel;

  if (existing) {
    return {
      topic: existing,
      topicsForScene: [existing],
      resolution_kind: "topic_labeler_existing_topic",
      resolved_label: existing.topic_label,
      match_confidence: debug.score ?? 0.86,
      authority_source: "topic_labeler_v3",
      warnings: args.warnings,
      rejected_request_topic: null,
      topic_labeler_debug: debug,
    };
  }

  const labelToSeed = matchedLabel ?? extractedLabel;

  if (labelToSeed) {
    return buildSeededResolution({
      existingTopics: args.existingTopics,
      resolvedLabel: labelToSeed,
      resolutionKind: "topic_labeler_seeded_topic",
      authoritySource: "topic_labeler_v3",
      matchConfidence: debug.score ?? 0.82,
      warnings: args.warnings,
      frame: args.frame,
      topicLabelerDebug: debug,
    });
  }

  args.warnings.push(
    "Topic labeler V3 returned no usable matched_topic_label or extracted_label; using fallback resolver.",
  );

  return null;
}

export async function resolveForegroundTopicForMessage(args: {
  message: string;
  existingTopics: RouteTopic[];
  requestBody?: unknown;
}): Promise<ForegroundTopicResolution> {
  const message = args.message.trim();
  const existingTopics = args.existingTopics;
  const frame = inferFrameFromMessage(message);
  const warnings: string[] = [];

  if (!message) {
    const existing = existingTopics[0] ?? null;

    if (existing) {
      return {
        topic: existing,
        topicsForScene: [existing],
        resolution_kind: "empty_message_existing_topic",
        resolved_label: existing.topic_label,
        match_confidence: 0.2,
        authority_source: "empty_message_fallback",
        warnings: ["Empty message used first existing topic as fallback."],
        rejected_request_topic: null,
        topic_labeler_debug: null,
      };
    }

    return buildSeededResolution({
      existingTopics,
      resolvedLabel: FALLBACK_TOPIC_LABEL,
      resolutionKind: "empty_message_seeded_topic",
      authoritySource: "empty_message_fallback",
      matchConfidence: 0.15,
      warnings: ["Empty message created a fallback seeded topic."],
      frame,
    });
  }

  const requestCandidate = extractRequestTopicCandidate(args.requestBody);
  const requestTopic =
    findTopicById(existingTopics, requestCandidate.topic_id) ??
    findTopicByLabel(existingTopics, requestCandidate.topic_label);

  const labelerResolution = await resolveWithTopicLabeler({
    message,
    existingTopics,
    requestCandidate,
    requestTopic,
    frame,
    warnings,
  });

  if (labelerResolution) {
    return labelerResolution;
  }

  const exactOrStrong = bestScoredTopic(existingTopics, message);

  if (exactOrStrong && exactOrStrong.score >= 0.92) {
    return {
      topic: exactOrStrong.topic,
      topicsForScene: [exactOrStrong.topic],
      resolution_kind: "message_exact_topic_label_match",
      resolved_label: exactOrStrong.topic.topic_label,
      match_confidence: exactOrStrong.score,
      authority_source: "message_exact_match",
      warnings,
      rejected_request_topic: null,
      topic_labeler_debug: null,
    };
  }

  if (requestTopic) {
    const requestScore = scoreTopicForMessage(requestTopic, message);
    const canTrustRequestTopic =
      requestScore >= 0.45 || !messageHasConcreteTopicSignal(message);

    if (canTrustRequestTopic) {
      return {
        topic: requestTopic,
        topicsForScene: [requestTopic],
        resolution_kind: "request_topic_reused",
        resolved_label: requestTopic.topic_label,
        match_confidence: Math.max(requestScore, 0.5),
        authority_source: "request_body",
        warnings,
        rejected_request_topic: null,
        topic_labeler_debug: null,
      };
    }

    warnings.push(
      `Request topic "${requestTopic.topic_label}" was ignored because the message did not appear to match it.`,
    );
  }

  const lexical = exactOrStrong;

  if (lexical && lexical.score >= 0.55) {
    return {
      topic: lexical.topic,
      topicsForScene: [lexical.topic],
      resolution_kind: "message_lexical_topic_match",
      resolved_label: lexical.topic.topic_label,
      match_confidence: lexical.score,
      authority_source: "message_lexical_match",
      warnings,
      rejected_request_topic: requestTopic
        ? {
            topic_id: requestTopic.id,
            topic_label: requestTopic.topic_label,
            reason: "request_topic_failed_message_plausibility_check",
          }
        : null,
      topic_labeler_debug: null,
    };
  }

  const inferredLabel = inferResolvedLabelFromMessage(message);
  const existingByInferredLabel = findTopicByLabel(existingTopics, inferredLabel);

  if (existingByInferredLabel) {
    return {
      topic: existingByInferredLabel,
      topicsForScene: [existingByInferredLabel],
      resolution_kind: "deterministic_label_existing_topic",
      resolved_label: existingByInferredLabel.topic_label,
      match_confidence: 0.84,
      authority_source: "deterministic_topic_labeler",
      warnings,
      rejected_request_topic: requestTopic
        ? {
            topic_id: requestTopic.id,
            topic_label: requestTopic.topic_label,
            reason: "request_topic_failed_message_plausibility_check",
          }
        : null,
      topic_labeler_debug: null,
    };
  }

  return buildSeededResolution({
    existingTopics,
    resolvedLabel: inferredLabel,
    resolutionKind: "deterministic_label_seeded_topic",
    authoritySource: "deterministic_topic_labeler",
    matchConfidence: 0.72,
    warnings,
    rejectedRequestTopic: requestTopic
      ? {
          topic_id: requestTopic.id,
          topic_label: requestTopic.topic_label,
          reason: "request_topic_failed_message_plausibility_check",
        }
      : null,
    frame,
  });
}
