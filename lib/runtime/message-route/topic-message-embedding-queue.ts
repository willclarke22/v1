import { makeId } from "@/lib/utils/ids";
import { nowIso } from "@/lib/runtime/shared";
import type { RouteResolutionKind } from "./confusion-insight-queue";

export type PendingTopicMessageEmbedding = {
  message_id: string;
  run_id: string | null;
  text: string;
  created_at: string;
  source: "message_route";
  routing: {
    target_topic_id: string;
    target_topic_label: string;
    resolution_kind: RouteResolutionKind;
    resolved_label: string | null;
    match_confidence: number;
    authority_source: string | null;
  };
};

export const TOPIC_MESSAGE_EMBEDDING_PENDING_QUEUE_MAX_ITEMS = 50;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRouteResolutionKind(value: unknown): value is RouteResolutionKind {
  return (
    value === "matched_existing" ||
    value === "created_new_candidate" ||
    value === "fallback_active_topic" ||
    value === "fallback_existing_topic" ||
    value === "no_match"
  );
}

export function getPendingTopicMessageEmbeddings(
  topicJson: unknown,
): PendingTopicMessageEmbedding[] {
  const base = asRecord(topicJson);
  const rawQueue = base.pending_topic_message_embeddings;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingTopicMessageEmbedding | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const routing = asRecord(candidate.routing);

      const messageId = asTrimmedString(candidate.message_id);
      const text = asTrimmedString(candidate.text);
      const createdAt = asTrimmedString(candidate.created_at);
      const targetTopicId = asTrimmedString(routing.target_topic_id);
      const targetTopicLabel = asTrimmedString(routing.target_topic_label);

      if (
        !messageId ||
        !text ||
        !createdAt ||
        !targetTopicId ||
        !targetTopicLabel
      ) {
        return null;
      }

      return {
        message_id: messageId,
        run_id: asTrimmedString(candidate.run_id),
        text,
        created_at: createdAt,
        source: "message_route",
        routing: {
          target_topic_id: targetTopicId,
          target_topic_label: targetTopicLabel,
          resolution_kind: isRouteResolutionKind(routing.resolution_kind)
            ? routing.resolution_kind
            : "fallback_existing_topic",
          resolved_label: asTrimmedString(routing.resolved_label),
          match_confidence:
            typeof routing.match_confidence === "number" &&
            Number.isFinite(routing.match_confidence)
              ? routing.match_confidence
              : 0,
          authority_source: asTrimmedString(routing.authority_source),
        },
      };
    })
    .filter((item): item is PendingTopicMessageEmbedding => Boolean(item));
}

export function buildPendingTopicMessageEmbedding(args: {
  message: string;
  runId: string;
  targetTopicId: string;
  targetTopicLabel: string;
  resolutionKind: RouteResolutionKind;
  resolvedLabel: string | null;
  matchConfidence: number;
  authoritySource: string | null;
}): PendingTopicMessageEmbedding {
  return {
    message_id: makeId("msgemb"),
    run_id: args.runId,
    text: args.message,
    created_at: nowIso(),
    source: "message_route",
    routing: {
      target_topic_id: args.targetTopicId,
      target_topic_label: args.targetTopicLabel,
      resolution_kind: args.resolutionKind,
      resolved_label: args.resolvedLabel,
      match_confidence: args.matchConfidence,
      authority_source: args.authoritySource,
    },
  };
}

export function appendPendingTopicMessageEmbedding(args: {
  topicJson: Record<string, unknown>;
  pendingItem: PendingTopicMessageEmbedding;
}) {
  const existingQueue = getPendingTopicMessageEmbeddings(args.topicJson);
  const nextQueue = [...existingQueue, args.pendingItem].slice(
    -TOPIC_MESSAGE_EMBEDDING_PENDING_QUEUE_MAX_ITEMS,
  );

  return {
    ...args.topicJson,
    pending_topic_message_embeddings: nextQueue,
    topic_message_embedding_pending_count: nextQueue.length,
    topic_message_embedding_queue_status: "pending",
    layout_status: "topic_message_embedding_pending",
    should_schedule_enrichment: true,
    semantic_enrichment_status: {
      ...asRecord(args.topicJson.semantic_enrichment_status),
      status: "message_embedding_pending",
      queue_role: "worker_default_topic_message_embedding",
      pending_topic_message_embedding_count: nextQueue.length,
      needs_embedding_centroid: false,
      should_schedule_enrichment: true,
      layout_status: "topic_message_embedding_pending",
      embedding_skip_reason: null,
      queued_at: args.pendingItem.created_at,
    },
  };
}
