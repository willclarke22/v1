import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopicStateRow = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type PendingConfusionInsightQueueItem = {
  score_id: string;
  created_at: string;
  payload_shape: "structured_v1_1";
};

type ConfusionInsightQueueCounts = {
  total: number;
  structured_v1_1: number;
};

type PendingStatusSnapshot = {
  rows: TopicStateRow[];
  semanticEnrichmentRows: TopicStateRow[];
  topicMessageEmbeddingRows: TopicStateRow[];
  confusionInsightRows: TopicStateRow[];
  layoutCommitRows: TopicStateRow[];
  topicMessageEmbeddingItemsFound: number;
  confusionInsightQueueCounts: ConfusionInsightQueueCounts;
  pendingWorkFound: number;
  embeddingBackedWorkFound: number;
  confusionInsightWorkFound: number;
  layoutCommitWorkFound: number;
};

const ROUTE_NAME = "/api/semantic-enrichment/pending-status";
const LAYOUT_COMMIT_EPSILON = 0.035;
const DEBUG_TOPIC_LIMIT = 10;

function getConfusionInsightScoringMode() {
  return process.env.MYWAY_CONFUSION_INSIGHT_SCORING_MODE?.trim().toLowerCase() ===
    "foreground"
    ? "foreground"
    : "worker";
}

function getWorkerRuntimeMode() {
  const raw = process.env.MYWAY_WORKER_RUNTIME_MODE?.trim().toLowerCase();

  if (
    raw === "remote-services" ||
    raw === "remote_services" ||
    raw === "gpu" ||
    raw === "remote-gpu" ||
    raw === "remote_gpu"
  ) {
    return "remote_services";
  }

  return "local_worker";
}

function hasTopicLabelEmbedding(row: {
  topic_label_embedding_centroid: unknown;
  topic_label_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_label_embedding_centroid) &&
    row.topic_label_embedding_centroid.length > 0 &&
    row.topic_label_embedding_count > 0
  );
}

function hasTopicMessageEmbedding(row: {
  topic_message_embedding_centroid: unknown;
  topic_message_embedding_count: number;
}) {
  return (
    Array.isArray(row.topic_message_embedding_centroid) &&
    row.topic_message_embedding_centroid.length > 0 &&
    row.topic_message_embedding_count > 0
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTopicJson(row: TopicStateRow) {
  return asRecord(row.topic_json);
}

function getNestedSemanticStatus(
  row: TopicStateRow,
): Record<string, unknown> | null {
  return asRecord(getTopicJson(row)?.semantic_enrichment_status);
}

function getPendingTopicMessageEmbeddings(row: TopicStateRow) {
  const rawQueue = getTopicJson(row)?.pending_topic_message_embeddings;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue.filter((item) => {
    const candidate = asRecord(item);

    return Boolean(
      candidate &&
        typeof candidate.message_id === "string" &&
        candidate.message_id.trim() &&
        typeof candidate.text === "string" &&
        candidate.text.trim(),
    );
  });
}

function hasStructuredConfusionInsightInput(candidate: Record<string, unknown>) {
  const structuredInput = asRecord(candidate.structured_input);

  return Boolean(
    structuredInput &&
      typeof structuredInput.current_evidence === "string" &&
      structuredInput.current_evidence.trim(),
  );
}

function getPendingConfusionInsightScores(
  row: TopicStateRow,
): PendingConfusionInsightQueueItem[] {
  const rawQueue = getTopicJson(row)?.pending_confusion_insight_scores;

  if (!Array.isArray(rawQueue)) return [];

  return rawQueue
    .map((item): PendingConfusionInsightQueueItem | null => {
      const candidate = asRecord(item);

      if (!candidate) return null;

      const scoreId =
        typeof candidate.score_id === "string" && candidate.score_id.trim()
          ? candidate.score_id.trim()
          : null;

      const createdAt =
        typeof candidate.created_at === "string" && candidate.created_at.trim()
          ? candidate.created_at.trim()
          : null;

      if (!scoreId || !createdAt) return null;

      if (hasStructuredConfusionInsightInput(candidate)) {
        return {
          score_id: scoreId,
          created_at: createdAt,
          payload_shape: "structured_v1_1",
        };
      }

      return null;
    })
    .filter((item): item is PendingConfusionInsightQueueItem => Boolean(item));
}

function emptyConfusionInsightQueueCounts(): ConfusionInsightQueueCounts {
  return {
    total: 0,
    structured_v1_1: 0,
  };
}

function countConfusionInsightQueueItemsByShape(
  items: PendingConfusionInsightQueueItem[],
) {
  return items.reduce((counts, item) => {
    counts.total += 1;

    counts.structured_v1_1 += 1;

    return counts;
  }, emptyConfusionInsightQueueCounts());
}

function sumConfusionInsightQueueCounts(rows: TopicStateRow[]) {
  return rows.reduce((totals, row) => {
    const counts = countConfusionInsightQueueItemsByShape(
      getPendingConfusionInsightScores(row),
    );

    totals.total += counts.total;
    totals.structured_v1_1 += counts.structured_v1_1;

    return totals;
  }, emptyConfusionInsightQueueCounts());
}

function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getLayoutCommitDistance(row: TopicStateRow) {
  if (!row.topic_position || !row.semantic_position) return null;

  const distance = distanceBetween(row.topic_position, row.semantic_position);

  return Number.isFinite(distance) ? distance : null;
}

function needsLayoutCommit(row: TopicStateRow) {
  const distance = getLayoutCommitDistance(row);

  return distance !== null && distance > LAYOUT_COMMIT_EPSILON;
}

function shouldRunSemanticEnrichmentForTopic(row: TopicStateRow) {
  const hasLabelEmbedding = hasTopicLabelEmbedding(row);
  const hasMessageEmbedding = hasTopicMessageEmbedding(row);

  if (row.needs_embedding_centroid) return true;
  if (row.should_schedule_enrichment) return true;

  const nestedStatus = getNestedSemanticStatus(row);

  if (
    nestedStatus?.needs_embedding_centroid === true ||
    nestedStatus?.should_schedule_enrichment === true ||
    nestedStatus?.status === "skipped_for_fast_model_route"
  ) {
    return true;
  }

  return !hasLabelEmbedding || !hasMessageEmbedding;
}

function buildPendingStatusSnapshot(rows: TopicStateRow[]): PendingStatusSnapshot {
  const semanticEnrichmentRows = rows.filter(shouldRunSemanticEnrichmentForTopic);
  const topicMessageEmbeddingRows = rows.filter(
    (row) => getPendingTopicMessageEmbeddings(row).length > 0,
  );
  const confusionInsightRows = rows.filter(
    (row) => getPendingConfusionInsightScores(row).length > 0,
  );
  const layoutCommitRows = rows.filter(needsLayoutCommit);

  const topicMessageEmbeddingItemsFound = topicMessageEmbeddingRows.reduce(
    (sum, row) => sum + getPendingTopicMessageEmbeddings(row).length,
    0,
  );

  const confusionInsightQueueCounts =
    sumConfusionInsightQueueCounts(confusionInsightRows);

  const embeddingBackedWorkFound =
    semanticEnrichmentRows.length + topicMessageEmbeddingItemsFound;
  const confusionInsightWorkFound = confusionInsightQueueCounts.total;
  const layoutCommitWorkFound = layoutCommitRows.length;

  const pendingWorkFound =
    embeddingBackedWorkFound + confusionInsightWorkFound + layoutCommitWorkFound;

  return {
    rows,
    semanticEnrichmentRows,
    topicMessageEmbeddingRows,
    confusionInsightRows,
    layoutCommitRows,
    topicMessageEmbeddingItemsFound,
    confusionInsightQueueCounts,
    pendingWorkFound,
    embeddingBackedWorkFound,
    confusionInsightWorkFound,
    layoutCommitWorkFound,
  };
}

function buildWorkerQueues(snapshot: PendingStatusSnapshot) {
  return {
    pending_work_found: snapshot.pendingWorkFound,
    embedding_backed_work_found: snapshot.embeddingBackedWorkFound,
    confusion_insight_work_found: snapshot.confusionInsightWorkFound,
    layout_commit_work_found: snapshot.layoutCommitWorkFound,

    semantic_enrichment: {
      pending_topics_found: snapshot.semanticEnrichmentRows.length,
      queue_role: "embedding_centroid_refresh",
    },

    topic_message_embeddings: {
      pending_topics_found: snapshot.topicMessageEmbeddingRows.length,
      pending_items_found: snapshot.topicMessageEmbeddingItemsFound,
      queue_role: "topic_message_embedding_centroid_update",
    },

    confusion_insight: {
      pending_topics_found: snapshot.confusionInsightRows.length,
      pending_items_found: snapshot.confusionInsightQueueCounts.total,
      pending_structured_v1_1_items_found:
        snapshot.confusionInsightQueueCounts.structured_v1_1,
      queue_role: "worker_default_structured_v1_1",
      normal_payload_shape: "structured_v1_1",
    },

    semantic_layout_commit: {
      pending_topics_found: snapshot.layoutCommitRows.length,
      epsilon: LAYOUT_COMMIT_EPSILON,
      queue_role: "commit_semantic_position_to_render_position",
    },
  };
}

function buildWorkerSummary(snapshot: PendingStatusSnapshot) {
  return {
    pending_work_found: snapshot.pendingWorkFound,
    embedding_backed_work_found: snapshot.embeddingBackedWorkFound,
    confusion_insight_work_found: snapshot.confusionInsightWorkFound,
    layout_commit_work_found: snapshot.layoutCommitWorkFound,
    should_start_embedding_service: snapshot.embeddingBackedWorkFound > 0,
    should_start_confusion_insight_service:
      snapshot.confusionInsightWorkFound > 0 &&
      getConfusionInsightScoringMode() !== "foreground",
    can_skip_model_services:
      snapshot.embeddingBackedWorkFound <= 0 &&
      snapshot.confusionInsightWorkFound <= 0,
  };
}

function buildCompatibilityFields(snapshot: PendingStatusSnapshot) {
  /**
   * Backward-compatible top-level fields.
   *
   * Keep these stable while local worker scripts and ad-hoc terminal checks are
   * still transitioning to worker_queues / worker_summary.
   */
  return {
    pending_topics_found: snapshot.semanticEnrichmentRows.length,
    pending_topic_message_embedding_topics_found:
      snapshot.topicMessageEmbeddingRows.length,
    pending_topic_message_embedding_items_found:
      snapshot.topicMessageEmbeddingItemsFound,
    pending_confusion_insight_topics_found: snapshot.confusionInsightRows.length,
    pending_confusion_insight_items_found:
      snapshot.confusionInsightQueueCounts.total,
    pending_confusion_insight_structured_v1_1_items_found:
      snapshot.confusionInsightQueueCounts.structured_v1_1,
    pending_confusion_insight_queue_role:
      "worker_default_structured_v1_1",
    pending_layout_commit_topics_found: snapshot.layoutCommitRows.length,
    pending_layout_commit_epsilon: LAYOUT_COMMIT_EPSILON,
    pending_work_found: snapshot.pendingWorkFound,
  };
}

function buildPendingTopicSummary(row: TopicStateRow) {
  const hasLabelEmbedding = hasTopicLabelEmbedding(row);
  const hasMessageEmbedding = hasTopicMessageEmbedding(row);
  const pendingTopicMessageEmbeddings = getPendingTopicMessageEmbeddings(row);
  const pendingConfusionInsightScores = getPendingConfusionInsightScores(row);
  const pendingConfusionInsightCounts =
    countConfusionInsightQueueItemsByShape(pendingConfusionInsightScores);

  return {
    topic_id: row.topic_id,
    topic_label: row.topic_label,

    semantic_enrichment_status: row.semantic_enrichment_status,
    needs_embedding_centroid: row.needs_embedding_centroid,
    should_schedule_enrichment: row.should_schedule_enrichment,
    layout_status: row.layout_status,
    embedding_skip_reason: row.embedding_skip_reason,

    topic_label_embedding_count: row.topic_label_embedding_count,
    topic_message_embedding_count: row.topic_message_embedding_count,

    has_topic_label_embedding: hasLabelEmbedding,
    has_topic_message_embedding: hasMessageEmbedding,

    pending_topic_message_embedding_count: pendingTopicMessageEmbeddings.length,
    pending_confusion_insight_count: pendingConfusionInsightCounts.total,
    pending_confusion_insight_structured_v1_1_count:
      pendingConfusionInsightCounts.structured_v1_1,

    pending_layout_commit: needsLayoutCommit(row),
    layout_commit_distance: getLayoutCommitDistance(row),

    missing_canonical_embeddings: {
      topic_label_embedding: !hasLabelEmbedding,
      topic_message_embedding: !hasMessageEmbedding,
    },
  };
}

function buildTopicMessageEmbeddingSummary(row: TopicStateRow) {
  return {
    topic_id: row.topic_id,
    topic_label: row.topic_label,
    pending_topic_message_embedding_count:
      getPendingTopicMessageEmbeddings(row).length,
    topic_message_embedding_count: row.topic_message_embedding_count,
    topic_message_embedding_updated_at: row.topic_message_embedding_updated_at,
  };
}

function buildConfusionInsightSummary(row: TopicStateRow) {
  const pendingScores = getPendingConfusionInsightScores(row);
  const counts = countConfusionInsightQueueItemsByShape(pendingScores);
  const topicJson = getTopicJson(row);

  return {
    topic_id: row.topic_id,
    topic_label: row.topic_label,
    pending_confusion_insight_count: counts.total,
    pending_confusion_insight_structured_v1_1_count: counts.structured_v1_1,
    confusion: row.confusion,
    insight: row.insight,
    confusion_insight_signal_count:
      typeof topicJson?.confusion_insight_signal_count === "number"
        ? topicJson.confusion_insight_signal_count
        : null,
    has_last_confusion_insight_score: Boolean(
      asRecord(topicJson?.last_confusion_insight_score),
    ),
    has_confusion_insight_signal_state: Boolean(
      asRecord(topicJson?.confusion_insight_signal_state),
    ),
  };
}

function buildLayoutCommitSummary(row: TopicStateRow) {
  return {
    topic_id: row.topic_id,
    topic_label: row.topic_label,
    topic_position: row.topic_position,
    semantic_position: row.semantic_position,
    layout_commit_distance: getLayoutCommitDistance(row),
    semantic_position_method: row.semantic_position_method,
    semantic_position_updated_at: row.semantic_position_updated_at,
  };
}

export async function GET() {
  try {
    const rows = await getLatestTopicState();
    const snapshot = buildPendingStatusSnapshot(rows);
    const compatibilityFields = buildCompatibilityFields(snapshot);

    return NextResponse.json({
      ok: true,
      route: `GET ${ROUTE_NAME}`,
      route_role: "local_worker_pending_status",
      route_name_is_legacy: true,
      compatibility_note:
        "This route name is legacy. It reports all local worker queues, not only semantic enrichment.",

      worker_runtime_mode: getWorkerRuntimeMode(),
      confusion_insight_scoring_mode: getConfusionInsightScoringMode(),
      total_topics_seen: rows.length,

      worker_summary: buildWorkerSummary(snapshot),
      worker_queues: buildWorkerQueues(snapshot),

      ...compatibilityFields,

      pending_topics: snapshot.semanticEnrichmentRows
        .slice(0, DEBUG_TOPIC_LIMIT)
        .map(buildPendingTopicSummary),

      pending_topic_message_embedding_topics: snapshot.topicMessageEmbeddingRows
        .slice(0, DEBUG_TOPIC_LIMIT)
        .map(buildTopicMessageEmbeddingSummary),

      pending_confusion_insight_topics: snapshot.confusionInsightRows
        .slice(0, DEBUG_TOPIC_LIMIT)
        .map(buildConfusionInsightSummary),

      pending_layout_commit_topics: snapshot.layoutCommitRows
        .slice(0, DEBUG_TOPIC_LIMIT)
        .map(buildLayoutCommitSummary),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        route: `GET ${ROUTE_NAME}`,
        route_role: "local_worker_pending_status",
        error:
          error instanceof Error
            ? error.message
            : "Unknown pending-status error",
      },
      { status: 500 },
    );
  }
}
