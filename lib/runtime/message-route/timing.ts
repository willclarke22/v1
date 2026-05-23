import type { ModelSignals } from "@/types/contracts";
import type { RouteResolutionKind } from "./confusion-insight-queue";

export type TopicLabelingMode =
  | "deterministic_only"
  | "deterministic_plus_llm"
  | "topic_labeler_primary";

export type TopicRoutingQdrantQueryMode = "off" | "always";

export type MessageRouteTimingStep = {
  label: string;
  duration_ms: number;
  elapsed_ms: number;
};

export type MessageRouteLatencyDebug = {
  enabled: boolean;
  total_ms: number;
  steps: MessageRouteTimingStep[];
  metadata: {
    route: "POST /api/message";
    topic_count_loaded: number | null;

    incoming_active_topic_id: string | null;
    incoming_active_topic_found: boolean | null;
    incoming_active_topic_label: string | null;
    viewport_focused_topic_id: string | null;
    viewport_selected_topic_id: string | null;
    viewport_active_topic_id_for_message: string | null;

    qdrant_query_mode: TopicRoutingQdrantQueryMode;
    qdrant_query_attempted: boolean;
    qdrant_query_succeeded: boolean | null;
    qdrant_query_error: string | null;
    qdrant_query_skipped_reason: string | null;

    qdrant_sync_attempted: boolean;
    qdrant_sync_succeeded: boolean | null;
    qdrant_sync_error: string | null;
    qdrant_sync_duration_ms: number | null;

    confusion_insight_status: ModelSignals["status"] | null;
    topic_labeling_mode: TopicLabelingMode | null;
    resolution_kind: RouteResolutionKind | null;
    used_llm_topic_fallback: boolean | null;
    message_embedding_available: boolean | null;
    embedding_model: string | null;
    centroid_update_method: string | null;

    topic_labeler_provider: string | null;
    topic_labeler_enabled: boolean;
    topic_labeler_attempted: boolean;
    topic_labeler_succeeded: boolean | null;
    topic_labeler_error: string | null;
    topic_labeler_latency_ms: number | null;
    topic_labeler_route_decision: string | null;
    topic_labeler_extracted_label: string | null;
    topic_labeler_matched_topic_label: string | null;

    model_topic_policy_usable: boolean | null;
    model_topic_policy_decision_kind: string | null;
    model_topic_policy_extracted_label: string | null;
    model_topic_policy_matched_topic_label: string | null;
    model_topic_policy_reasons: string[] | null;
    model_topic_policy_used_as_authority: boolean | null;
    topic_authority_source: string | null;

    model_route_continuation_policy_kind: string | null;
    model_route_learner_message_intent: string | null;
    model_route_should_create_learning_topic: boolean | null;
    model_route_should_update_learning_space: boolean | null;
    model_route_should_treat_as_learning_evidence: boolean | null;
    model_route_should_myway_choose_target: boolean | null;
    model_route_should_ask_user_to_choose: boolean | null;

    semantic_enrichment_status: string | null;
    needs_embedding_centroid: boolean | null;
    embedding_skip_reason: string | null;
    layout_status: string | null;
    should_schedule_enrichment: boolean | null;
  };
};

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

export function createMessageRouteTimer() {
  const enabled = process.env.MYWAY_MESSAGE_ROUTE_TIMING !== "off";
  const startedAt = performance.now();
  let lastMark = startedAt;
  const steps: MessageRouteTimingStep[] = [];

  function step(label: string) {
    if (!enabled) return;

    const now = performance.now();

    steps.push({
      label,
      duration_ms: roundMs(now - lastMark),
      elapsed_ms: roundMs(now - startedAt),
    });

    lastMark = now;
  }

  function finish(
    metadata: MessageRouteLatencyDebug["metadata"],
  ): MessageRouteLatencyDebug {
    return {
      enabled,
      total_ms: roundMs(performance.now() - startedAt),
      steps,
      metadata,
    };
  }

  return {
    step,
    finish,
  };
}
