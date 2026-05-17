// app/api/semantic-layout/commit-pending/route.ts

import { NextResponse } from "next/server";
import { getLatestTopicState, type TopicPosition } from "@/lib/persistence/read";
import { upsertTopicState } from "@/lib/persistence/myway";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type JsonObject = { [key: string]: JsonValue };

type CommitCandidate = Awaited<ReturnType<typeof getLatestTopicState>>[number];

type CommitStatus =
  | "committed"
  | "already_close"
  | "missing_topic_position"
  | "missing_semantic_position"
  | "invalid_distance";

type CommitResult = {
  topic_id: string;
  topic_label: string;
  status: CommitStatus;
  previous_topic_position: TopicPosition | null;
  semantic_position: TopicPosition | null;
  next_topic_position: TopicPosition | null;
  distance_to_target_before: number | null;
  distance_to_target_after: number | null;
  alpha_used: number | null;
  max_step_distance: number;
  epsilon: number;
  reason: string;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Backend truth policy.
 *
 * The backend should commit the authoritative semantic target immediately.
 * The frontend/SpaceCanvas is responsible for making that movement feel smooth.
 */
const DEFAULT_ALPHA = 1;

/**
 * Kept as a diagnostic/override field for compatibility with older callers.
 * Normal commits no longer cap movement; topic_position becomes semantic_position.
 */
const DEFAULT_MAX_STEP_DISTANCE = 10_000;

/**
 * Avoid writing tiny changes to Supabase.
 */
const DEFAULT_EPSILON = 0.035;

const COMMIT_VERSION = "semantic_position_commit_v2_instant";

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

function parseBoolean(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);

  return raw === "true" || raw === "1" || raw === "yes";
}

function parseNumberParam(args: {
  searchParams: URLSearchParams;
  key: string;
  fallback: number;
  min: number;
  max: number;
}) {
  const raw = args.searchParams.get(args.key);

  if (!raw) return args.fallback;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) return args.fallback;

  return clamp(parsed, args.min, args.max);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}


function distanceBetween(a: TopicPosition, b: TopicPosition) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


function getTopicLabel(topic: CommitCandidate) {
  return topic.topic_label.trim() || "Untitled Topic";
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const clean: JsonObject = {};

  for (const [key, item] of Object.entries(value)) {
    clean[key] = isJsonValue(item) ? item : null;
  }

  return clean;
}

function withCommitMetadata(args: {
  topic: CommitCandidate;
  previousTopicPosition: TopicPosition;
  semanticPosition: TopicPosition;
  nextTopicPosition: TopicPosition;
  alpha: number;
  maxStepDistance: number;
  epsilon: number;
  distanceBefore: number;
  distanceAfter: number;
  committedAt: string;
}) {
  const base = toJsonObject(args.topic.topic_json);

  base.topic_position = args.nextTopicPosition;

  /**
   * Preserve semantic target explicitly in JSON as well as columns.
   */
  base.semantic_position = args.semanticPosition;
  base.semantic_position_updated_at =
    args.topic.semantic_position_updated_at ?? null;
  base.semantic_position_method = args.topic.semantic_position_method ?? null;

  base.semantic_position_commit = {
    version: COMMIT_VERSION,
    committed_at: args.committedAt,
    previous_topic_position: args.previousTopicPosition,
    semantic_position: args.semanticPosition,
    next_topic_position: args.nextTopicPosition,
    alpha_used: round4(args.alpha),
    max_step_distance: args.maxStepDistance,
    epsilon: args.epsilon,
    distance_to_target_before: round4(args.distanceBefore),
    distance_to_target_after: round4(args.distanceAfter),
    policy:
      "Backend commits topic_position immediately to semantic_position. The frontend animates the visual transition, while topic_position remains the committed rendered source of truth.",
  };

  return base;
}

function shouldConsiderTopic(topic: CommitCandidate) {
  return Boolean(topic.topic_position && topic.semantic_position);
}

function buildSkippedResult(args: {
  topic: CommitCandidate;
  status: CommitStatus;
  alpha: number | null;
  maxStepDistance: number;
  epsilon: number;
  reason: string;
}): CommitResult {
  const previous = args.topic.topic_position;
  const semantic = args.topic.semantic_position;

  const distance =
    previous && semantic ? round4(distanceBetween(previous, semantic)) : null;

  return {
    topic_id: args.topic.topic_id,
    topic_label: getTopicLabel(args.topic),
    status: args.status,
    previous_topic_position: previous,
    semantic_position: semantic,
    next_topic_position: previous,
    distance_to_target_before: distance,
    distance_to_target_after: distance,
    alpha_used: args.alpha,
    max_step_distance: args.maxStepDistance,
    epsilon: args.epsilon,
    reason: args.reason,
  };
}

async function commitTopicPosition(args: {
  topic: CommitCandidate;
  alpha: number;
  maxStepDistance: number;
  epsilon: number;
  force: boolean;
}): Promise<CommitResult> {
  const { topic, alpha, maxStepDistance, epsilon, force } = args;
  const topicLabel = getTopicLabel(topic);

  if (!topic.topic_position) {
    return buildSkippedResult({
      topic,
      status: "missing_topic_position",
      alpha: null,
      maxStepDistance,
      epsilon,
      reason:
        "Skipped because this topic does not have a committed topic_position yet.",
    });
  }

  if (!topic.semantic_position) {
    return buildSkippedResult({
      topic,
      status: "missing_semantic_position",
      alpha: null,
      maxStepDistance,
      epsilon,
      reason:
        "Skipped because this topic does not have a semantic_position target yet.",
    });
  }

  const previousTopicPosition = topic.topic_position;
  const semanticPosition = topic.semantic_position;
  const distanceBefore = distanceBetween(previousTopicPosition, semanticPosition);

  if (!Number.isFinite(distanceBefore)) {
    return buildSkippedResult({
      topic,
      status: "invalid_distance",
      alpha: null,
      maxStepDistance,
      epsilon,
      reason:
        "Skipped because the distance between topic_position and semantic_position was invalid.",
    });
  }

  if (!force && distanceBefore <= epsilon) {
    return buildSkippedResult({
      topic,
      status: "already_close",
      alpha,
      maxStepDistance,
      epsilon,
      reason:
        "Skipped because topic_position is already close enough to semantic_position.",
    });
  }

  /**
   * Commit the semantic target immediately.
   *
   * The frontend animates from the previous rendered position to this newly
   * committed position. This keeps backend state truthful while preserving a
   * smooth visual transition in SpaceCanvas.
   */
  const nextTopicPosition = semanticPosition;
  const distanceAfter = 0;

  if (!force && distanceBetween(previousTopicPosition, nextTopicPosition) <= 0) {
    return buildSkippedResult({
      topic,
      status: "already_close",
      alpha,
      maxStepDistance,
      epsilon,
      reason:
        "Skipped because topic_position already equals semantic_position.",
    });
  }

  const committedAt = nowIso();

  const topicJson = withCommitMetadata({
    topic,
    previousTopicPosition,
    semanticPosition,
    nextTopicPosition,
    alpha,
    maxStepDistance,
    epsilon,
    distanceBefore,
    distanceAfter,
    committedAt,
  });

  await upsertTopicState({
    topicId: topic.topic_id,
    lastRunId: topic.last_run_id,
    topicLabel,
    confusion: topic.confusion,
    insight: topic.insight,
    learningScore: topic.learning_score,
    diagnosis: topic.diagnosis,
    nextStep: topic.next_step,
    topicJson,

    /**
     * This is the only authoritative visual movement this route performs.
     */
    topicPosition: nextTopicPosition,

    /**
     * Preserve canonical embeddings.
     */
    topicLabelEmbeddingCentroid: topic.topic_label_embedding_centroid,
    topicLabelEmbeddingCount: topic.topic_label_embedding_count,
    topicLabelEmbeddingModel: topic.topic_label_embedding_model,
    topicLabelEmbeddingUpdatedAt: topic.topic_label_embedding_updated_at,

    topicMessageEmbeddingCentroid: topic.topic_message_embedding_centroid,
    topicMessageEmbeddingCount: topic.topic_message_embedding_count,
    topicMessageEmbeddingModel: topic.topic_message_embedding_model,
    topicMessageEmbeddingUpdatedAt: topic.topic_message_embedding_updated_at,

    /**
     * Preserve the semantic target. Do not collapse it into topic_position.
     */
    semanticPosition,
    semanticPositionUpdatedAt: topic.semantic_position_updated_at,
    semanticPositionMethod: topic.semantic_position_method,
  });

  return {
    topic_id: topic.topic_id,
    topic_label: topicLabel,
    status: "committed",
    previous_topic_position: previousTopicPosition,
    semantic_position: semanticPosition,
    next_topic_position: nextTopicPosition,
    distance_to_target_before: round4(distanceBefore),
    distance_to_target_after: round4(distanceAfter),
    alpha_used: round4(alpha),
    max_step_distance: maxStepDistance,
    epsilon,
    reason:
      "Committed topic_position immediately to semantic_position. Frontend animation should handle the perceived movement.",
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);

  const limit = parseLimit(url.searchParams);
  const force = parseBoolean(url.searchParams, "force");

  const alpha = parseNumberParam({
    searchParams: url.searchParams,
    key: "alpha",
    fallback: DEFAULT_ALPHA,
    min: 0.01,
    max: 1,
  });

  const maxStepDistance = parseNumberParam({
    searchParams: url.searchParams,
    key: "maxStepDistance",
    fallback: DEFAULT_MAX_STEP_DISTANCE,
    min: 0.02,
    max: 10_000,
  });

  const epsilon = parseNumberParam({
    searchParams: url.searchParams,
    key: "epsilon",
    fallback: DEFAULT_EPSILON,
    min: 0,
    max: 0.5,
  });

  try {
    const rows = await getLatestTopicState();

    const candidateTopics = rows
      .filter((topic) => force || shouldConsiderTopic(topic))
      .filter((topic) => {
        if (force) return true;
        if (!topic.topic_position || !topic.semantic_position) return false;

        return distanceBetween(topic.topic_position, topic.semantic_position) > epsilon;
      })
      .slice(0, limit);

    const results: CommitResult[] = [];

    for (const topic of candidateTopics) {
      const result = await commitTopicPosition({
        topic,
        alpha,
        maxStepDistance,
        epsilon,
        force,
      });

      results.push(result);
    }

    const committedCount = results.filter(
      (result) => result.status === "committed",
    ).length;

    const skippedCount = results.length - committedCount;

    return NextResponse.json({
      ok: true,
      route: "/api/semantic-layout/commit-pending",
      commit_version: COMMIT_VERSION,
      policy:
        "Commit topic_position immediately to semantic_position. semantic_position remains the target; topic_position is the rendered source of truth; frontend animation handles motion.",
      limit,
      force,
      alpha,
      max_step_distance: maxStepDistance,
      epsilon,
      topics_seen: rows.length,
      candidate_topics_found: candidateTopics.length,
      committed_count: committedCount,
      skipped_count: skippedCount,
      duration_ms: round4(performance.now() - startedAt),
      results,
    });
  } catch (error) {
    console.error("POST /api/semantic-layout/commit-pending failed:", error);

    return NextResponse.json(
      {
        ok: false,
        route: "/api/semantic-layout/commit-pending",
        error:
          error instanceof Error
            ? error.message
            : "Failed to commit semantic layout movement.",
      },
      { status: 500 },
    );
  }
}