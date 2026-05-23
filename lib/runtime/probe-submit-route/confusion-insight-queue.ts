import { makeId } from "@/lib/utils/ids";
import { nowIso } from "@/lib/runtime/shared";
import type { ModelSignals } from "@/types/contracts";
import type { RouteTopic } from "@/lib/runtime/route-topics";
import type { inferDiagnosisFromTopic } from "@/lib/runtime/attempt-judging";
import type {
  ConfusionInsightEvent,
  ConfusionInsightInputType,
  ConfusionInsightPreviousMode,
  ConfusionInsightStructuredInput,
  ConfusionInsightTopicTransitionType,
} from "@/lib/runtime/score-confusion-insight";
import {
  getBodyModality,
  getBodyResponseType,
  type ProbeSubmitBody,
} from "./request-context";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type PendingConfusionInsightScore = {
  score_id: string;
  run_id: string;
  source: "probe_submit_route";
  created_at: string;
  payload_shape: "structured_v1_1";
  text: string;
  routing: {
    target_topic_id: string;
    target_topic_label: string;
    resolution_kind: "probe_submit_attempt";
    resolved_label: string;
    match_confidence: number;
    authority_source: "probe_submit_route";
  };
  structured_input: ConfusionInsightStructuredInput;
  probe: {
    probe_id: string;
    attempt_id: string | null;
    response_type: string | null;
    modality: string | null;
  };
};

export type ProbeConfusionInsightScoringMode = "worker" | "foreground";

export type UsableModelSignals = ModelSignals & {
  model_confusion: number;
  model_insight: number;
};

export const CONFUSION_INSIGHT_PAYLOAD_SHAPE = "structured_v1_1" as const;
export const CONFUSION_INSIGHT_WORKER_QUEUE_ROLE =
  "worker_default_structured_v1_1_probe_submit" as const;

const DEFAULT_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS = 2_500;
const MIN_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS = 500;
const MAX_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS = 15_000;

export function getProbeConfusionInsightScoringMode(): ProbeConfusionInsightScoringMode {
  return process.env.MYWAY_PROBE_CONFUSION_INSIGHT_SCORING_MODE?.trim().toLowerCase() ===
    "foreground"
    ? "foreground"
    : "worker";
}

export function getProbeConfusionInsightTimeoutMs() {
  const raw = process.env.MYWAY_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : null;

  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(parsed, MIN_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS),
    MAX_PROBE_CONFUSION_INSIGHT_TIMEOUT_MS,
  );
}

export function hasUsableModelSignals(
  modelSignals: ModelSignals,
): modelSignals is UsableModelSignals {
  return (
    modelSignals.status === "ok" &&
    typeof modelSignals.model_confusion === "number" &&
    Number.isFinite(modelSignals.model_confusion) &&
    typeof modelSignals.model_insight === "number" &&
    Number.isFinite(modelSignals.model_insight)
  );
}

export function buildFallbackModelSignals(errorMessage?: string): ModelSignals {
  return {
    model_confusion: null,
    model_insight: null,
    model_version: "unavailable",
    inference_mode: null,
    latency_ms: null,
    status: errorMessage ? "error" : "unavailable",
    error_message: errorMessage ?? null,
  };
}

export function buildProbeSubmitModelSignals(): ModelSignals {
  const scoringMode = getProbeConfusionInsightScoringMode();

  return scoringMode === "worker"
    ? buildFallbackModelSignals("probe_confusion_insight_queued_for_worker")
    : buildFallbackModelSignals(
        "foreground_probe_confusion_insight_scoring_not_enabled_in_this_worker-first_route",
      );
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp01(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function inferConfusionInsightInputType(
  body: ProbeSubmitBody,
): ConfusionInsightInputType {
  const modality = getBodyModality(body);
  const responseType = getBodyResponseType(body);

  if (modality === "video") return "video_checkpoint_attempt";
  if (modality === "audio") return "audio_checkpoint_attempt";
  if (modality === "interactive") return "interactive_attempt";

  if (
    responseType === "audio" ||
    responseType === "spoken_response" ||
    responseType === "speech"
  ) {
    return "spoken_attempt";
  }

  if (
    responseType === "video" ||
    responseType === "video_click_timing" ||
    responseType === "video_annotation"
  ) {
    return "video_checkpoint_attempt";
  }

  if (
    responseType === "interactive" ||
    responseType === "choice" ||
    responseType === "multiple_choice" ||
    responseType === "ordering" ||
    responseType === "transform" ||
    responseType === "classify" ||
    responseType === "classification" ||
    responseType === "predict" ||
    responseType === "prediction_choice" ||
    responseType === "dynamic_task" ||
    responseType === "interactive_action" ||
    responseType === "drag_drop" ||
    responseType === "slider_adjustment" ||
    responseType === "sequence_ordering" ||
    responseType === "freeform_action"
  ) {
    return "interactive_attempt";
  }

  return "text_attempt";
}

function inferCurrentAttemptType(body: ProbeSubmitBody): string | null {
  const modality = getBodyModality(body);
  const responseType = getBodyResponseType(body);

  if (modality === "audio") return "spoken_response";
  if (modality === "video") return "video_annotation";
  if (modality === "interactive") return "freeform_action";

  if (responseType === "text") return "written_response";
  if (
    responseType === "audio" ||
    responseType === "spoken_response" ||
    responseType === "speech"
  ) {
    return "spoken_response";
  }
  if (responseType === "choice" || responseType === "multiple_choice") {
    return "selected_option";
  }
  if (responseType === "ordering" || responseType === "sequence_ordering") {
    return "sequence_ordering";
  }
  if (responseType === "classify" || responseType === "classification") {
    return "classification";
  }
  if (responseType === "predict" || responseType === "prediction_choice") {
    return "prediction_choice";
  }
  if (responseType === "video_click_timing") return "video_click_timing";
  if (responseType === "video_annotation") return "video_annotation";
  if (responseType === "audio_click_timing") return "audio_click_timing";
  if (responseType === "audio_annotation") return "audio_annotation";
  if (responseType === "drag_drop") return "drag_drop";
  if (responseType === "slider_adjustment") return "slider_adjustment";
  if (responseType === "interactive_action") return "freeform_action";
  if (
    responseType === "transform" ||
    responseType === "dynamic_task" ||
    responseType === "freeform_action"
  ) {
    return "freeform_action";
  }

  return "written_response";
}

function buildAttemptEvidence(args: {
  body: ProbeSubmitBody;
  rawResponse: string;
  topicLabel: string;
}) {
  const responseType = getBodyResponseType(args.body) ?? "text";
  const modality = getBodyModality(args.body) ?? "text";

  return [
    `Probe attempt response type: ${responseType}.`,
    `Probe attempt modality: ${modality}.`,
    `Target topic: ${args.topicLabel}.`,
    `Learner response: ${args.rawResponse}`,
  ].join("\n");
}

function getPreviousModeForProbeSubmit(): ConfusionInsightPreviousMode {
  return "probe";
}

function getTopicTransitionForProbeSubmit(): ConfusionInsightTopicTransitionType {
  return "same_topic";
}

function buildTargetTopicRecentEvents(args: {
  body: ProbeSubmitBody;
  topicLabel: string;
  activeDiagnosis: ReturnType<typeof inferDiagnosisFromTopic>;
  prompt: string;
}): ConfusionInsightEvent[] {
  return [
    {
      event_type: "probe",
      topic_label: args.topicLabel,
      diagnosis_label: args.activeDiagnosis,
      probe_type: null,
      modality: getBodyModality(args.body) ?? "text",
      probe_prompt: args.prompt,
      learning_objective: args.body.prompt ?? null,
      expected_attempt_type: inferCurrentAttemptType(args.body),
      success_marker: null,
      misconception_being_tested: null,
      evidence: null,
    },
  ];
}

function buildProbeSubmissionConfusionInsightInput(args: {
  body: ProbeSubmitBody;
  topic: RouteTopic;
  topicLabel: string;
  rawResponse: string;
  activeDiagnosis: ReturnType<typeof inferDiagnosisFromTopic>;
}): ConfusionInsightStructuredInput {
  const currentEvidence = buildAttemptEvidence({
    body: args.body,
    rawResponse: args.rawResponse,
    topicLabel: args.topicLabel,
  });

  return {
    input_type: inferConfusionInsightInputType(args.body),
    current_attempt_type: inferCurrentAttemptType(args.body),
    current_evidence: currentEvidence,

    previous_active_topic_label: args.topicLabel,
    target_topic_label: args.topicLabel,
    topic_transition_type: getTopicTransitionForProbeSubmit(),
    topic_similarity: 1,

    previous_mode: getPreviousModeForProbeSubmit(),
    is_response_to_clarify: false,
    is_response_to_probe: true,

    target_topic_recent_events: buildTargetTopicRecentEvents({
      body: args.body,
      topicLabel: args.topicLabel,
      activeDiagnosis: args.activeDiagnosis,
      prompt: args.body.prompt ?? args.topic.nextStep,
    }),

    most_related_topic_label: null,
    most_related_topic_similarity: null,
    most_related_topic_similarity_threshold: 0.65,
    most_related_topic_recent_events: [],

    target_topic_confusion_average: clamp01(asFiniteNumber(args.topic.confusion)),
    target_topic_insight_average: clamp01(asFiniteNumber(args.topic.insight)),
    most_related_topic_confusion_average: null,
    most_related_topic_insight_average: null,
  };
}

export function buildPendingProbeConfusionInsightScore(args: {
  runId: string;
  body: ProbeSubmitBody;
  topic: RouteTopic;
  topicLabel: string;
  rawResponse: string;
  activeDiagnosis: ReturnType<typeof inferDiagnosisFromTopic>;
}): PendingConfusionInsightScore {
  const structuredInput = buildProbeSubmissionConfusionInsightInput({
    body: args.body,
    topic: args.topic,
    topicLabel: args.topicLabel,
    rawResponse: args.rawResponse,
    activeDiagnosis: args.activeDiagnosis,
  });

  return {
    score_id: makeId("ciscore"),
    run_id: args.runId,
    source: "probe_submit_route",
    created_at: nowIso(),
    payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
    text: structuredInput.current_evidence,
    routing: {
      target_topic_id: args.topic.id,
      target_topic_label: args.topicLabel,
      resolution_kind: "probe_submit_attempt",
      resolved_label: args.topicLabel,
      match_confidence: 1,
      authority_source: "probe_submit_route",
    },
    structured_input: structuredInput,
    probe: {
      probe_id: args.body.probeId,
      attempt_id: args.body.attemptId ?? null,
      response_type: getBodyResponseType(args.body),
      modality: getBodyModality(args.body) ?? "text",
    },
  };
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return { ...(value as Record<string, JsonValue>) };
}

function asPendingConfusionInsightScores(
  value: unknown,
): PendingConfusionInsightScore[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is PendingConfusionInsightScore =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

export function appendPendingConfusionInsightScore(args: {
  topicJson: Record<string, unknown> | null | undefined;
  pendingScore: PendingConfusionInsightScore;
}) {
  const base = asJsonObject(args.topicJson);
  const previousPending = asPendingConfusionInsightScores(
    base.pending_confusion_insight_scores,
  );
  const nextPending = [...previousPending, args.pendingScore];

  return {
    ...base,
    pending_confusion_insight_scores: nextPending.map(toJsonValue),
    confusion_insight_signal_state: {
      ...(asJsonObject(base.confusion_insight_signal_state) as JsonObject),
      status: "pending_model_signal",
      pending_count: nextPending.length,
      source: "probe_submit_route",
      payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
      updated_at: nowIso(),
    },
    confusion_insight_status: {
      ...(asJsonObject(base.confusion_insight_status) as JsonObject),
      status: "queued_for_worker",
      pending_count: nextPending.length,
      queue_role: CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
      normal_payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
      updated_at: nowIso(),
    },
    confusion_insight_queue_role: CONFUSION_INSIGHT_WORKER_QUEUE_ROLE,
    confusion_insight_payload_shape: CONFUSION_INSIGHT_PAYLOAD_SHAPE,
  };
}
