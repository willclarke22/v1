// app/api/confusion-insight/run-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";
import {
  scoreConfusionInsight,
  type ConfusionInsightEvent,
  type ConfusionInsightInputType,
  type ConfusionInsightPreviousMode,
  type ConfusionInsightStructuredInput,
  type ConfusionInsightTopicTransitionType,
} from "@/lib/model-adapters/confusion-insight/confusion-insight-client";

// Worker route.
//
// Local dev defaults to worker-mode confusion/insight scoring so the foreground
// /api/message route does not compete with the topic labeler, embedding service,
// and Next dev server on the same laptop.
//
// This route drains modern structured v1_1 queue items only:
// { structured_input }

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type PendingConfusionInsightPayloadShape = "structured_v1_1";

type PendingConfusionInsightResolutionKind =
  | "created_new_candidate"
  | "matched_existing"
  | "fallback_active_topic"
  | "fallback_existing_topic"
  | "no_match"
  | "probe_submit_attempt"
  | string;

type PendingConfusionInsightScore = {
  score_id: string;
  run_id: string | null;
  text: string;
  structured_input: ConfusionInsightStructuredInput;
  created_at: string;
  source:
    | "message_route"
    | "probe_submit_route"
    | "probe_submit"
    | "fallback"
    | string;
  routing: {
    target_topic_id: string;
    target_topic_label: string;
    resolution_kind: PendingConfusionInsightResolutionKind;
    resolved_label: string | null;
    match_confidence: number;
    authority_source: string | null;
  };
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonObject = { [key: string]: JsonValue };

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const DEFAULT_SIGNAL_ALPHA = 0.25;
const DEFAULT_SIMILARITY_THRESHOLD = 0.65;
const ROUTE_NAME = "POST /api/confusion-insight/run-pending";

function getScoreTimeoutMs() {
  const raw = process.env.MYWAY_CONFUSION_INSIGHT_SCORE_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : null;

  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) {
    return 10_000;
  }

  return Math.min(Math.max(parsed, 1_000), 60_000);
}

function nowIso() {
  return new Date().toISOString();
}

function parseLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");

  if (!raw) return DEFAULT_LIMIT;
  if (raw === "all") return MAX_LIMIT;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(parsed, MAX_LIMIT);
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePendingSource(value: unknown) {
  const source = asString(value, "message_route");

  /**
   * Normalize the temporary older probe source name if any rows were queued
   * before the worker-backed probe-submit cleanup.
   */
  return source === "probe_submit" ? "probe_submit_route" : source;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (value && typeof value === "object") {
    const output: JsonObject = {};

    for (const [key, childValue] of Object.entries(value)) {
      output[key] = toJsonValue(childValue);
    }

    return output;
  }

  return null;
}

function normalizeInputType(value: unknown): ConfusionInsightInputType {
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
  value: unknown,
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

function normalizePreviousMode(value: unknown): ConfusionInsightPreviousMode {
  if (value === "no_previous" || value === "clarify" || value === "probe") {
    return value;
  }

  return "no_previous";
}

function normalizeEvent(value: unknown): ConfusionInsightEvent | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;

  return {
    event_type: asOptionalString(record.event_type),
    topic_label: asOptionalString(record.topic_label),
    diagnosis_label: asOptionalString(record.diagnosis_label),

    clarification_prompt: asOptionalString(record.clarification_prompt),
    clarification_goal: asOptionalString(record.clarification_goal),

    probe_type: asOptionalString(record.probe_type),
    modality: asOptionalString(record.modality),
    probe_prompt: asOptionalString(record.probe_prompt),
    learning_objective: asOptionalString(record.learning_objective),
    expected_attempt_type: asOptionalString(record.expected_attempt_type),
    success_marker: asOptionalString(record.success_marker),
    misconception_being_tested: asOptionalString(
      record.misconception_being_tested,
    ),

    attempt_type: asOptionalString(record.attempt_type),
    evidence: asOptionalString(record.evidence),
  };
}

function normalizeEvents(value: unknown): ConfusionInsightEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeEvent)
    .filter((event): event is ConfusionInsightEvent => Boolean(event))
    .slice(-5);
}

function normalizeStructuredInput(
  value: unknown,
): ConfusionInsightStructuredInput | null {
  const record = asRecord(value);
  const currentEvidence = asOptionalString(record.current_evidence);

  if (!currentEvidence) return null;

  return {
    input_type: normalizeInputType(record.input_type),
    current_attempt_type: asOptionalString(record.current_attempt_type),
    current_evidence: currentEvidence,

    previous_active_topic_label: asOptionalString(
      record.previous_active_topic_label,
    ),
    target_topic_label: asOptionalString(record.target_topic_label),
    topic_transition_type: normalizeTopicTransitionType(
      record.topic_transition_type,
    ),
    topic_similarity: asFiniteNumber(record.topic_similarity),

    previous_mode: normalizePreviousMode(record.previous_mode),
    is_response_to_clarify: asBoolean(record.is_response_to_clarify),
    is_response_to_probe: asBoolean(record.is_response_to_probe),

    target_topic_recent_events: normalizeEvents(record.target_topic_recent_events),

    most_related_topic_label: asOptionalString(record.most_related_topic_label),
    most_related_topic_similarity: asFiniteNumber(
      record.most_related_topic_similarity,
    ),
    most_related_topic_similarity_threshold:
      asFiniteNumber(record.most_related_topic_similarity_threshold) ??
      DEFAULT_SIMILARITY_THRESHOLD,
    most_related_topic_recent_events: normalizeEvents(
      record.most_related_topic_recent_events,
    ),

    target_topic_confusion_average: asFiniteNumber(
      record.target_topic_confusion_average,
    ),
    target_topic_insight_average: asFiniteNumber(
      record.target_topic_insight_average,
    ),
    most_related_topic_confusion_average: asFiniteNumber(
      record.most_related_topic_confusion_average,
    ),
    most_related_topic_insight_average: asFiniteNumber(
      record.most_related_topic_insight_average,
    ),
  };
}

function getPendingPayloadShape(
  _item: PendingConfusionInsightScore,
): PendingConfusionInsightPayloadShape {
  return "structured_v1_1";
}

function buildStructuredInputForPendingItem(
  item: PendingConfusionInsightScore,
): ConfusionInsightStructuredInput {
  return item.structured_input;
}

function getPendingConfusionInsightScores(
  topicJson: unknown,
): PendingConfusionInsightScore[] {
  const base = asRecord(topicJson);
  const rawQueue = base.pending_confusion_insight_scores;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingConfusionInsightScore | null => {
      const candidate = asRecord(item);
      const routing = asRecord(candidate.routing);

      const scoreId = asOptionalString(candidate.score_id);
      const createdAt = asOptionalString(candidate.created_at);
      const structuredInput = normalizeStructuredInput(candidate.structured_input);
      const text =
        asOptionalString(candidate.text) ?? structuredInput?.current_evidence ?? "";

      if (!scoreId || !createdAt || !structuredInput) return null;

      return {
        score_id: scoreId,
        run_id: asOptionalString(candidate.run_id),
        text,
        structured_input: structuredInput,
        created_at: createdAt,
        source: normalizePendingSource(candidate.source),
        routing: {
          target_topic_id: asString(routing.target_topic_id),
          target_topic_label: asString(routing.target_topic_label),
          resolution_kind: asString(routing.resolution_kind, "unknown"),
          resolved_label: asOptionalString(routing.resolved_label),
          match_confidence: asFiniteNumber(routing.match_confidence) ?? 0,
          authority_source: asOptionalString(routing.authority_source),
        },
      };
    })
    .filter((item): item is PendingConfusionInsightScore => Boolean(item));
}

type SignalAverageUpdate = {
  value: number;
  alpha_applied: number;
  source:
    | "model_direct_created_topic"
    | "model_direct_first_signal"
    | "model_blended_existing_topic";
};

type ConfusionInsightPersistenceSource = SignalAverageUpdate["source"];

type InputSanitizationSummary = {
  removed_provisional_target_averages: boolean;
  reason: string | null;
};

function isCreatedOrNewTopicInput(args: {
  item: PendingConfusionInsightScore;
  input: ConfusionInsightStructuredInput;
}) {
  return (
    args.item.routing.resolution_kind === "created_new_candidate" ||
    args.input.topic_transition_type === "new_topic"
  );
}

function sanitizeStructuredInputForScoring(args: {
  item: PendingConfusionInsightScore;
  input: ConfusionInsightStructuredInput;
  priorSignalCount: number;
}): {
  input: ConfusionInsightStructuredInput;
  sanitization: InputSanitizationSummary;
} {
  const isFirstCreatedTopicSignal =
    args.priorSignalCount <= 0 &&
    isCreatedOrNewTopicInput({
      item: args.item,
      input: args.input,
    });

  if (!isFirstCreatedTopicSignal) {
    return {
      input: args.input,
      sanitization: {
        removed_provisional_target_averages: false,
        reason: null,
      },
    };
  }

  /**
   * For a just-created topic, the row-level confusion/insight values are often
   * provisional fallback values written by /api/message before the worker runs.
   * They are useful as temporary UI placeholders, but they are not real prior
   * learner-history evidence and should not be fed back into the model as
   * target_topic_*_average features for the first real score.
   */
  return {
    input: {
      ...args.input,
      target_topic_confusion_average: null,
      target_topic_insight_average: null,
    },
    sanitization: {
      removed_provisional_target_averages: true,
      reason:
        "created_or_new_topic_first_signal_should_not_use_provisional_fallback_averages",
    },
  };
}

function shouldUseModelSignalDirectly(args: {
  item: PendingConfusionInsightScore;
  input: ConfusionInsightStructuredInput;
  priorSignalCount: number;
  previous: number | null;
}) {
  if (
    isCreatedOrNewTopicInput({
      item: args.item,
      input: args.input,
    })
  ) {
    return true;
  }

  if (args.priorSignalCount <= 0) {
    return true;
  }

  return typeof args.previous !== "number" || !Number.isFinite(args.previous);
}

function deriveSignalAverageUpdate(args: {
  item: PendingConfusionInsightScore;
  input: ConfusionInsightStructuredInput;
  previous: number | null;
  nextSignal: number;
  priorSignalCount: number;
}): SignalAverageUpdate {
  const signal = clamp01(args.nextSignal);

  if (
    shouldUseModelSignalDirectly({
      item: args.item,
      input: args.input,
      priorSignalCount: args.priorSignalCount,
      previous: args.previous,
    })
  ) {
    return {
      value: round4(signal),
      alpha_applied: 1,
      source:
        isCreatedOrNewTopicInput({
          item: args.item,
          input: args.input,
        })
          ? "model_direct_created_topic"
          : "model_direct_first_signal",
    };
  }

  const previous = clamp01(args.previous as number);
  const alpha = DEFAULT_SIGNAL_ALPHA;

  return {
    value: round4(clamp01(previous * (1 - alpha) + signal * alpha)),
    alpha_applied: alpha,
    source: "model_blended_existing_topic",
  };
}

type ProcessedConfusionInsightItem = {
  item: PendingConfusionInsightScore;
  input_type: ConfusionInsightInputType;
  payload_shape: PendingConfusionInsightPayloadShape;
  structured_input_used: ConfusionInsightStructuredInput;
  input_sanitization: InputSanitizationSummary;
  model_confusion: number;
  model_insight: number;
  model_version: string | null;
  inference_mode: "service" | "local" | null;
  latency_ms: number | null;
  previous_confusion: number | null;
  previous_insight: number | null;
  next_confusion: number | null;
  next_insight: number | null;
  alpha_applied: number;
  confusion_alpha_applied: number;
  insight_alpha_applied: number;
  persistence_source: ConfusionInsightPersistenceSource;
  confusion_persistence_source: ConfusionInsightPersistenceSource;
  insight_persistence_source: ConfusionInsightPersistenceSource;
};

type FailedConfusionInsightItem = {
  item: PendingConfusionInsightScore;
  payload_shape: PendingConfusionInsightPayloadShape;
  failed_at: string;
  error_message: string;
  status: string | null;
};

function buildFailedScoreAudit(failed: FailedConfusionInsightItem) {
  return {
    score_id: failed.item.score_id,
    run_id: failed.item.run_id,
    failed_at: failed.failed_at,
    source: failed.item.source,
    routing: failed.item.routing,
    payload_shape: failed.payload_shape,
    is_probe_submit_score: failed.item.source === "probe_submit_route",
    text_preview: failed.item.text.slice(0, 240),
    status: failed.status,
    error_message: failed.error_message,
  };
}

function buildLastScoreAudit(args: {
  processed: ProcessedConfusionInsightItem;
  updatedAt: string;
  signalCountBeforeRun: number;
  signalCountAfterRun: number;
}) {
  return {
    score_id: args.processed.item.score_id,
    run_id: args.processed.item.run_id,
    processed_at: args.updatedAt,
    source: args.processed.item.source,
    routing: args.processed.item.routing,
    payload_shape: args.processed.payload_shape,
    is_probe_submit_score: args.processed.item.source === "probe_submit_route",
    input_type: args.processed.input_type,
    structured_input_used: args.processed.structured_input_used,
    input_sanitization: args.processed.input_sanitization,
    text_preview: args.processed.item.text.slice(0, 240),

    model_confusion: args.processed.model_confusion,
    model_insight: args.processed.model_insight,
    model_version: args.processed.model_version,
    inference_mode: args.processed.inference_mode,
    latency_ms: args.processed.latency_ms,

    previous_confusion: args.processed.previous_confusion,
    previous_insight: args.processed.previous_insight,
    next_confusion: args.processed.next_confusion,
    next_insight: args.processed.next_insight,

    alpha_applied: args.processed.alpha_applied,
    confusion_alpha_applied: args.processed.confusion_alpha_applied,
    insight_alpha_applied: args.processed.insight_alpha_applied,
    persistence_source: args.processed.persistence_source,
    confusion_persistence_source: args.processed.confusion_persistence_source,
    insight_persistence_source: args.processed.insight_persistence_source,

    signal_count_before_run: args.signalCountBeforeRun,
    signal_count_after_run: args.signalCountAfterRun,
    first_real_signal: args.signalCountBeforeRun <= 0,
    direct_score_for_created_topic:
      args.processed.persistence_source === "model_direct_created_topic",
  };
}

function buildUpdatedTopicJson(args: {
  row: TopicStateRow;
  remainingQueue: PendingConfusionInsightScore[];
  processedItems: ProcessedConfusionInsightItem[];
  failedItems: FailedConfusionInsightItem[];
  updatedAt: string;
  nextConfusion: number | null;
  nextInsight: number | null;
  signalCountBeforeRun: number;
  signalCountAfterRun: number;
}) {
  const base = asRecord(args.row.topic_json);

  const previousProcessed = Array.isArray(base.processed_confusion_insight_scores)
    ? base.processed_confusion_insight_scores
    : [];

  const processedSummaries = args.processedItems.map((processed) => ({
    score_id: processed.item.score_id,
    run_id: processed.item.run_id,
    processed_at: args.updatedAt,
    source: processed.item.source,
    is_probe_submit_score: processed.item.source === "probe_submit_route",
    input_type: processed.input_type,
    payload_shape: processed.payload_shape,
    text_preview: processed.item.text.slice(0, 120),
    input_sanitization: processed.input_sanitization,
    model_confusion: processed.model_confusion,
    model_insight: processed.model_insight,
    model_version: processed.model_version,
    inference_mode: processed.inference_mode,
    latency_ms: processed.latency_ms,
    previous_confusion: processed.previous_confusion,
    previous_insight: processed.previous_insight,
    next_confusion: processed.next_confusion,
    next_insight: processed.next_insight,
    alpha_applied: processed.alpha_applied,
    confusion_alpha_applied: processed.confusion_alpha_applied,
    insight_alpha_applied: processed.insight_alpha_applied,
    persistence_source: processed.persistence_source,
    confusion_persistence_source: processed.confusion_persistence_source,
    insight_persistence_source: processed.insight_persistence_source,
  }));

  const previousFailures = Array.isArray(base.failed_confusion_insight_scores)
    ? base.failed_confusion_insight_scores
    : [];

  const failedSummaries = args.failedItems.map(buildFailedScoreAudit);
  const nextFailures = [...previousFailures, ...failedSummaries].slice(-30);

  const nextProcessed = [...previousProcessed, ...processedSummaries].slice(-30);
  const lastProcessed = args.processedItems.at(-1) ?? null;
  const lastScoreAudit = lastProcessed
    ? buildLastScoreAudit({
        processed: lastProcessed,
        updatedAt: args.updatedAt,
        signalCountBeforeRun: args.signalCountBeforeRun,
        signalCountAfterRun: args.signalCountAfterRun,
      })
    : asRecord(base.last_confusion_insight_score);

  const nextJson: JsonObject = {
    ...Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, toJsonValue(value)]),
    ),
    pending_confusion_insight_scores: args.remainingQueue.map(toJsonValue),
    confusion_insight_pending_count: args.remainingQueue.length,
    confusion_insight_queue_status:
      args.remainingQueue.length > 0 ? "pending" : "empty",
    processed_confusion_insight_scores: nextProcessed.map(toJsonValue),
    failed_confusion_insight_scores: nextFailures.map(toJsonValue),
    last_confusion_insight_score: toJsonValue(lastScoreAudit),
    last_confusion_insight_error: failedSummaries.at(-1)
      ? toJsonValue(failedSummaries.at(-1))
      : toJsonValue(asRecord(base.last_confusion_insight_error)),
    confusion_insight_signal_count: args.signalCountAfterRun,
    confusion_insight_updated_at: args.updatedAt,
    confusion_insight_signal_state: {
      status:
        args.processedItems.length > 0
          ? "has_model_signal"
          : args.failedItems.length > 0
            ? "scoring_failed"
            : "no_model_signal",
      signal_count: args.signalCountAfterRun,
      last_processed_at: args.updatedAt,
      last_score_id: lastProcessed?.item.score_id ?? null,
      last_model_version: lastProcessed?.model_version ?? null,
      last_model_confusion: lastProcessed?.model_confusion ?? null,
      last_model_insight: lastProcessed?.model_insight ?? null,
      last_next_confusion: args.nextConfusion,
      last_next_insight: args.nextInsight,
      last_alpha_applied: lastProcessed?.alpha_applied ?? null,
      last_persistence_source: lastProcessed?.persistence_source ?? null,
      last_input_sanitization: lastProcessed?.input_sanitization ?? null,
    },
    confusion_insight_status: {
      ...asRecord(base.confusion_insight_status),
      status:
        args.failedItems.length > 0 && args.processedItems.length <= 0
          ? "retry_pending_after_error"
          : args.remainingQueue.length > 0
            ? "partially_processed"
            : "ready",
      pending_count: args.remainingQueue.length,
      processed_count_this_run: args.processedItems.length,
      failed_count_this_run: args.failedItems.length,
      last_error: failedSummaries.at(-1) ?? null,
      updated_at: args.updatedAt,
      model_signal_alpha: DEFAULT_SIGNAL_ALPHA,
      first_signal_alpha: 1,
      direct_score_for_created_topic: true,
      note:
        "Confusion/insight scores are supportive soft signals, not proof of understanding. Created topics and first real signals use the model score directly; established topics blend with prior state. Provisional fallback topic averages are removed from first created/new-topic scoring inputs.",
    },
    model_confusion_average: args.nextConfusion,
    model_insight_average: args.nextInsight,
  };

  return nextJson;
}

async function processTopicQueue(args: {
  row: TopicStateRow;
  remainingBudget: number;
}) {
  const queue = getPendingConfusionInsightScores(args.row.topic_json);

  if (!queue.length || args.remainingBudget <= 0) {
    return null;
  }

  const toProcess = queue.slice(0, args.remainingBudget);
  const notYetProcessed = queue.slice(args.remainingBudget);
  const processedItems: ProcessedConfusionInsightItem[] = [];
  const failedItems: FailedConfusionInsightItem[] = [];

  const topicJson = asRecord(args.row.topic_json);
  const signalCountBeforeRun =
    typeof topicJson.confusion_insight_signal_count === "number" &&
    Number.isFinite(topicJson.confusion_insight_signal_count)
      ? Math.max(0, Math.floor(topicJson.confusion_insight_signal_count))
      : 0;

  let signalCount = signalCountBeforeRun;

  let confusion =
    typeof args.row.confusion === "number" && Number.isFinite(args.row.confusion)
      ? clamp01(args.row.confusion)
      : null;
  let insight =
    typeof args.row.insight === "number" && Number.isFinite(args.row.insight)
      ? clamp01(args.row.insight)
      : null;

  for (const item of toProcess) {
    const rawStructuredInput = buildStructuredInputForPendingItem(item);
    const payloadShape = getPendingPayloadShape(item);
    const { input: structuredInput, sanitization } =
      sanitizeStructuredInputForScoring({
        item,
        input: rawStructuredInput,
        priorSignalCount: signalCount,
      });

    try {
      const signal = await scoreConfusionInsight({
        input: structuredInput,
        timeoutMs: getScoreTimeoutMs(),
      });

      if (
        signal.status !== "ok" ||
        typeof signal.model_confusion !== "number" ||
        typeof signal.model_insight !== "number"
      ) {
        console.warn("Confusion/insight worker received non-ok signal", {
          topic_id: args.row.topic_id,
          topic_label: args.row.topic_label,
          score_id: item.score_id,
          status: signal.status,
          error_message: signal.error_message,
        });
        failedItems.push({
          item,
          payload_shape: payloadShape,
          failed_at: nowIso(),
          error_message:
            signal.error_message || "Confusion/insight service returned a non-ok response.",
          status: signal.status ?? null,
        });
        continue;
      }

      const previousConfusion = confusion;
      const previousInsight = insight;

      const confusionUpdate = deriveSignalAverageUpdate({
        item,
        input: structuredInput,
        previous: confusion,
        nextSignal: signal.model_confusion,
        priorSignalCount: signalCount,
      });
      const insightUpdate = deriveSignalAverageUpdate({
        item,
        input: structuredInput,
        previous: insight,
        nextSignal: signal.model_insight,
        priorSignalCount: signalCount,
      });

      confusion = confusionUpdate.value;
      insight = insightUpdate.value;
      signalCount += 1;

      const alphaApplied = Math.max(
        confusionUpdate.alpha_applied,
        insightUpdate.alpha_applied,
      );

      const persistenceSource =
        confusionUpdate.source === insightUpdate.source
          ? confusionUpdate.source
          : confusionUpdate.alpha_applied >= insightUpdate.alpha_applied
            ? confusionUpdate.source
            : insightUpdate.source;

      processedItems.push({
        item,
        input_type: structuredInput.input_type,
        payload_shape: payloadShape,
        structured_input_used: structuredInput,
        input_sanitization: sanitization,
        model_confusion: signal.model_confusion,
        model_insight: signal.model_insight,
        model_version: signal.model_version,
        inference_mode: signal.inference_mode,
        latency_ms: signal.latency_ms,
        previous_confusion: previousConfusion,
        previous_insight: previousInsight,
        next_confusion: confusion,
        next_insight: insight,
        alpha_applied: alphaApplied,
        confusion_alpha_applied: confusionUpdate.alpha_applied,
        insight_alpha_applied: insightUpdate.alpha_applied,
        persistence_source: persistenceSource,
        confusion_persistence_source: confusionUpdate.source,
        insight_persistence_source: insightUpdate.source,
      });
    } catch (error) {
      console.warn("Confusion/insight worker failed to score pending item", {
        topic_id: args.row.topic_id,
        topic_label: args.row.topic_label,
        score_id: item.score_id,
        error: error instanceof Error ? error.message : String(error),
      });
      failedItems.push({
        item,
        payload_shape: payloadShape,
        failed_at: nowIso(),
        error_message: error instanceof Error ? error.message : String(error),
        status: "exception",
      });
    }
  }

  if (!processedItems.length) {
    const updatedAt = nowIso();
    const remainingQueue = [
      ...failedItems.map((failed) => failed.item),
      ...notYetProcessed,
    ];

    const nextTopicJson = buildUpdatedTopicJson({
      row: args.row,
      remainingQueue,
      processedItems,
      failedItems,
      updatedAt,
      nextConfusion: confusion,
      nextInsight: insight,
      signalCountBeforeRun,
      signalCountAfterRun: signalCount,
    });

    if (failedItems.length > 0) {
      await upsertTopicState({
        topicId: args.row.topic_id,
        lastRunId: args.row.last_run_id,
        topicLabel: args.row.topic_label,
        confusion: args.row.confusion,
        insight: args.row.insight,
        learningScore: args.row.learning_score,
        diagnosis: args.row.diagnosis,
        nextStep: args.row.next_step,
        topicJson: nextTopicJson,
        topicPosition: args.row.topic_position as TopicPosition | null,

        topicLabelEmbeddingCentroid: args.row.topic_label_embedding_centroid,
        topicLabelEmbeddingCount: args.row.topic_label_embedding_count,
        topicLabelEmbeddingModel: args.row.topic_label_embedding_model,
        topicLabelEmbeddingUpdatedAt: args.row.topic_label_embedding_updated_at,

        topicMessageEmbeddingCentroid: args.row.topic_message_embedding_centroid,
        topicMessageEmbeddingCount: args.row.topic_message_embedding_count,
        topicMessageEmbeddingModel: args.row.topic_message_embedding_model,
        topicMessageEmbeddingUpdatedAt: args.row.topic_message_embedding_updated_at,

        semanticPosition: args.row.semantic_position,
        semanticPositionMethod: args.row.semantic_position_method,
        semanticPositionUpdatedAt: args.row.semantic_position_updated_at,
      });
    }

    return {
      topic_id: args.row.topic_id,
      topic_label: args.row.topic_label,
      processed_count: 0,
      processed_structured_v1_1_count: 0,
      failed_count: failedItems.length,
      failed_structured_v1_1_count: failedItems.filter(
        (failed) => failed.payload_shape === "structured_v1_1",
      ).length,
      remaining_count: remainingQueue.length,
      updated: false,
      persisted_failure_audit: failedItems.length > 0,
      confusion: args.row.confusion,
      insight: args.row.insight,
      failed_score_details: failedItems.map(buildFailedScoreAudit),
      updated_at: failedItems.length > 0 ? updatedAt : null,
    };
  }

  const updatedAt = nowIso();
  const remainingQueue = [
    ...failedItems.map((failed) => failed.item),
    ...notYetProcessed,
  ];

  const updatedRowForJson: TopicStateRow = {
    ...args.row,
    confusion,
    insight,
  };

  const nextTopicJson = buildUpdatedTopicJson({
    row: updatedRowForJson,
    remainingQueue,
    processedItems,
    failedItems,
    updatedAt,
    nextConfusion: confusion,
    nextInsight: insight,
    signalCountBeforeRun,
    signalCountAfterRun: signalCount,
  });

  const processedStructuredV1Count = processedItems.filter(
    (item) => item.payload_shape === "structured_v1_1",
  ).length;
  const failedStructuredV1Count = failedItems.filter(
    (failed) => failed.payload_shape === "structured_v1_1",
  ).length;

  await upsertTopicState({
    topicId: args.row.topic_id,
    lastRunId: args.row.last_run_id,
    topicLabel: args.row.topic_label,
    confusion,
    insight,
    learningScore: args.row.learning_score,
    diagnosis: args.row.diagnosis,
    nextStep: args.row.next_step,
    topicJson: nextTopicJson,
    topicPosition: args.row.topic_position as TopicPosition | null,

    topicLabelEmbeddingCentroid: args.row.topic_label_embedding_centroid,
    topicLabelEmbeddingCount: args.row.topic_label_embedding_count,
    topicLabelEmbeddingModel: args.row.topic_label_embedding_model,
    topicLabelEmbeddingUpdatedAt: args.row.topic_label_embedding_updated_at,

    topicMessageEmbeddingCentroid: args.row.topic_message_embedding_centroid,
    topicMessageEmbeddingCount: args.row.topic_message_embedding_count,
    topicMessageEmbeddingModel: args.row.topic_message_embedding_model,
    topicMessageEmbeddingUpdatedAt: args.row.topic_message_embedding_updated_at,

    semanticPosition: args.row.semantic_position,
    semanticPositionMethod: args.row.semantic_position_method,
    semanticPositionUpdatedAt: args.row.semantic_position_updated_at,
  });

  const processedScoreDetails = processedItems.map((item) =>
    buildLastScoreAudit({
      processed: item,
      updatedAt,
      signalCountBeforeRun,
      signalCountAfterRun: signalCount,
    }),
  );

  return {
    topic_id: args.row.topic_id,
    topic_label: args.row.topic_label,
    processed_count: processedItems.length,
    processed_structured_v1_1_count: processedStructuredV1Count,
    failed_count: failedItems.length,
    failed_structured_v1_1_count: failedStructuredV1Count,
    remaining_count: remainingQueue.length,
    updated: true,
    previous_confusion: args.row.confusion,
    previous_insight: args.row.insight,
    next_confusion: confusion,
    next_insight: insight,
    signal_alpha: DEFAULT_SIGNAL_ALPHA,
    first_signal_alpha: 1,
    direct_score_for_created_topic: true,
    signal_count_before_run: signalCountBeforeRun,
    signal_count_after_run: signalCount,
    applied_alpha_values: processedItems.map((item) => item.alpha_applied),
    persistence_sources: processedItems.map((item) => item.persistence_source),
    processed_score_details: processedScoreDetails,
    failed_score_details: failedItems.map(buildFailedScoreAudit),
    updated_at: updatedAt,
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams);

  try {
    const rows = await getLatestTopicState();
    let remainingBudget = limit;
    const results = [];

    for (const row of rows) {
      if (remainingBudget <= 0) break;

      const pendingCount = getPendingConfusionInsightScores(row.topic_json).length;
      if (pendingCount <= 0) continue;

      const result = await processTopicQueue({
        row,
        remainingBudget,
      });

      if (!result) continue;

      remainingBudget -= result.processed_count + result.failed_count;
      results.push(result);
    }

    const processedScoreCount = results.reduce(
      (sum, result) => sum + result.processed_count,
      0,
    );
    const failedScoreCount = results.reduce(
      (sum, result) => sum + result.failed_count,
      0,
    );
    const processedStructuredV1ScoreCount = results.reduce(
      (sum, result) => sum + result.processed_structured_v1_1_count,
      0,
    );
    const failedStructuredV1ScoreCount = results.reduce(
      (sum, result) => sum + result.failed_structured_v1_1_count,
      0,
    );
    const processedProbeSubmitScoreCount = results.reduce(
      (sum, result) =>
        sum +
        (result.processed_score_details ?? []).filter(
          (detail: { is_probe_submit_score?: boolean }) =>
            detail.is_probe_submit_score,
        ).length,
      0,
    );
    const failedProbeSubmitScoreCount = results.reduce(
      (sum, result) =>
        sum +
        (result.failed_score_details ?? []).filter(
          (detail: { is_probe_submit_score?: boolean }) =>
            detail.is_probe_submit_score,
        ).length,
      0,
    );
    const updatedTopicCount = results.filter((result) => result.updated).length;

    return NextResponse.json({
      ok: true,
      route: ROUTE_NAME,
      route_role: "local_worker_confusion_insight_queue_drain",
      duration_ms: roundMs(performance.now() - startedAt),
      limit,
      score_timeout_ms: getScoreTimeoutMs(),
      normal_payload_shape: "structured_v1_1",
      accepted_sources: ["message_route", "probe_submit_route"],
      processed_score_count: processedScoreCount,
      processed_structured_v1_1_score_count: processedStructuredV1ScoreCount,
      failed_score_count: failedScoreCount,
      failed_structured_v1_1_score_count: failedStructuredV1ScoreCount,
      processed_probe_submit_score_count: processedProbeSubmitScoreCount,
      failed_probe_submit_score_count: failedProbeSubmitScoreCount,
      updated_topic_count: updatedTopicCount,
      persisted_failure_audit_count: results.filter(
        (result) =>
          "persisted_failure_audit" in result &&
          result.persisted_failure_audit,
      ).length,
      should_refresh_learning_space: processedScoreCount > 0,
      worker_contract: {
        processed_score_count: processedScoreCount,
        processed_structured_v1_1_score_count: processedStructuredV1ScoreCount,
        processed_probe_submit_score_count: processedProbeSubmitScoreCount,
        failed_score_count: failedScoreCount,
        failed_probe_submit_score_count: failedProbeSubmitScoreCount,
        updated_topic_count: updatedTopicCount,
        should_refresh_learning_space: processedScoreCount > 0,
      },
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: ROUTE_NAME,
        duration_ms: roundMs(performance.now() - startedAt),
        error:
          error instanceof Error
            ? error.message
            : "Unknown confusion/insight worker error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
