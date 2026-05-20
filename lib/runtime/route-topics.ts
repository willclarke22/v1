// lib/runtime/route-topics.ts

import { getRouteTopicState } from "@/lib/persistence/read";
import {
  computeNextTopicPosition,
  resolveTopicLayout,
  type TopicPosition3D,
  type TopicPositionSource,
} from "@/lib/learning-space/topic-position";
import { makeId } from "@/lib/utils/ids";
import type { DiagnosisType, EmbeddingVector } from "@/types/contracts";
import { normalizeDiagnosis } from "./shared";

export type RouteTopic = {
  id: string;
  topic_label: string;
  diagnosis: DiagnosisType;
  nextStep: string;
  confusion: number;
  insight: number;
  learningScore: number;

  /**
   * Current committed renderer position.
   * This should be derived from topic_position_x/y/z first.
   */
  position: TopicPosition3D;

  /**
   * Optional semantic target position.
   * This is not automatically the rendered position.
   */
  semanticPosition?: TopicPosition3D | null;
  semanticPositionMethod?: string | null;
  semanticPositionUpdatedAt?: string | null;
  positionSource?: TopicPositionSource;

  scale: number;
  messageCount: number;
  lastUpdated: string;
  hasAvailableProbe: boolean;

  topic_label_embedding_centroid?: EmbeddingVector | null;
  topic_label_embedding_count?: number | null;
  topic_label_embedding_model?: string | null;
  topic_label_embedding_updated_at?: string | null;

  topic_message_embedding_centroid?: EmbeddingVector | null;
  topic_message_embedding_count?: number | null;
  topic_message_embedding_model?: string | null;
  topic_message_embedding_updated_at?: string | null;

  semantic_enrichment_status?: string | null;
  needs_embedding_centroid?: boolean | null;
  should_schedule_enrichment?: boolean | null;
  semantic_enrichment_prompt_text?: string | null;
  layout_status?: string | null;
  embedding_skip_reason?: string | null;

  topic_json?: Record<string, unknown> | null;
};

export type SharedMessageFrame =
  | "quiz_request"
  | "confusion_help"
  | "explain_request"
  | "compare_request"
  | "apply_request"
  | "attempt_like"
  | "general";

const DEFAULT_DIAGNOSIS: DiagnosisType = "representation_gap";

const DEFAULT_ROUTE_TOPICS_CACHE_MS = 1_500;

let routeTopicsCache:
  | {
      createdAt: number;
      topics: RouteTopic[];
    }
  | null = null;

function getRouteTopicsCacheMs() {
  const raw = process.env.MYWAY_ROUTE_TOPICS_CACHE_MS;
  if (!raw) return DEFAULT_ROUTE_TOPICS_CACHE_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ROUTE_TOPICS_CACHE_MS;

  return Math.min(parsed, 5_000);
}

function cloneRouteTopic(topic: RouteTopic): RouteTopic {
  return {
    ...topic,
    position: [...topic.position] as TopicPosition3D,
    semanticPosition: topic.semanticPosition
      ? ([...topic.semanticPosition] as TopicPosition3D)
      : topic.semanticPosition,
    topic_label_embedding_centroid: topic.topic_label_embedding_centroid
      ? [...topic.topic_label_embedding_centroid]
      : topic.topic_label_embedding_centroid,
    topic_message_embedding_centroid: topic.topic_message_embedding_centroid
      ? [...topic.topic_message_embedding_centroid]
      : topic.topic_message_embedding_centroid,
    topic_json: topic.topic_json ? { ...topic.topic_json } : topic.topic_json,
  };
}

function cloneRouteTopics(topics: RouteTopic[]) {
  return topics.map(cloneRouteTopic);
}


type EmbeddingFields = {
  topic_label_embedding_centroid: EmbeddingVector | null;
  topic_label_embedding_count: number | null;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;

  topic_message_embedding_centroid: EmbeddingVector | null;
  topic_message_embedding_count: number | null;
  topic_message_embedding_model: string | null;
  topic_message_embedding_updated_at: string | null;
};

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeLooseForRouteTopic(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticTokenizeForRouteTopic(text: string): string[] {
  return normalizeLooseForRouteTopic(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function inferKeywordsFromSourceText(source: string): string[] {
  return dedupeStrings(
    semanticTokenizeForRouteTopic(source).filter((token) => token.length > 2),
  ).slice(0, 8);
}

function inferSeededNextStepFromConceptAndFrame(
  concept: string,
  frame: SharedMessageFrame,
): string {
  switch (frame) {
    case "quiz_request":
      return `Show what you understand about ${concept} in your own words.`;
    case "confusion_help":
      return `Build a clearer mental model of ${concept}.`;
    case "compare_request":
      return `Explain the key difference in ${concept} in your own words.`;
    case "apply_request":
      return `Apply ${concept} to a simple case and explain why.`;
    case "attempt_like":
      return `Refine your thinking about ${concept} and explain your reasoning.`;
    case "explain_request":
    case "general":
    default:
      return `Explain ${concept} clearly in your own words.`;
  }
}

function buildSeededTopic(args: {
  topicLabel: string;
  nextStep: string;
  existingTopics: RouteTopic[];
}): RouteTopic {
  const position = computeNextTopicPosition(args.existingTopics.length);

  return {
    id: makeId("topic"),
    topic_label: args.topicLabel,
    diagnosis: DEFAULT_DIAGNOSIS,
    nextStep: args.nextStep,
    confusion: 0.58,
    insight: 0.34,
    learningScore: 0.22,
    position,
    semanticPosition: null,
    semanticPositionMethod: null,
    semanticPositionUpdatedAt: null,
    positionSource: "deterministic_fallback",
    scale: 1,
    messageCount: 1,
    lastUpdated: new Date().toISOString(),
    hasAvailableProbe: false,
    topic_json: null,
  };
}

export function buildSeededTopicFromResolvedLabel(args: {
  resolvedLabel: string;
  existingTopics: RouteTopic[];
  frame?: SharedMessageFrame;
}): RouteTopic {
  return buildSeededTopic({
    topicLabel: args.resolvedLabel,
    nextStep: inferSeededNextStepFromConceptAndFrame(
      args.resolvedLabel,
      args.frame ?? "explain_request",
    ),
    existingTopics: args.existingTopics,
  });
}

function resolveEmbeddingFields(row: {
  topic_label_embedding_centroid: EmbeddingVector | null;
  topic_label_embedding_count: number | null;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;

  topic_message_embedding_centroid: EmbeddingVector | null;
  topic_message_embedding_count: number | null;
  topic_message_embedding_model: string | null;
  topic_message_embedding_updated_at: string | null;
}): EmbeddingFields {
  return {
    topic_label_embedding_centroid: row.topic_label_embedding_centroid ?? null,
    topic_label_embedding_count: row.topic_label_embedding_count ?? null,
    topic_label_embedding_model: row.topic_label_embedding_model ?? null,
    topic_label_embedding_updated_at:
      row.topic_label_embedding_updated_at ?? null,

    topic_message_embedding_centroid:
      row.topic_message_embedding_centroid ?? null,
    topic_message_embedding_count: row.topic_message_embedding_count ?? null,
    topic_message_embedding_model: row.topic_message_embedding_model ?? null,
    topic_message_embedding_updated_at:
      row.topic_message_embedding_updated_at ?? null,
  };
}

export function inferKeywordsFromTopicLabel(label: string): string[] {
  return inferKeywordsFromSourceText(label);
}

export async function loadRouteTopics(): Promise<RouteTopic[]> {
  const cacheMs = getRouteTopicsCacheMs();
  const now = Date.now();

  if (
    cacheMs > 0 &&
    routeTopicsCache &&
    now - routeTopicsCache.createdAt <= cacheMs
  ) {
    return cloneRouteTopics(routeTopicsCache.topics);
  }

  const rows = await getRouteTopicState();

  if (!rows.length) {
    routeTopicsCache = {
      createdAt: now,
      topics: [],
    };

    return [];
  }

  const loadedTopics: RouteTopic[] = [];

  for (const row of rows) {
    const layout = resolveTopicLayout({
      topicId: row.topic_id,
      index: loadedTopics.length,
      topicPosition: row.topic_position,
      semanticPosition: row.semantic_position,
      semanticPositionMethod: row.semantic_position_method,
      semanticPositionUpdatedAt: row.semantic_position_updated_at,
      topicJson: row.topic_json,
    });

    const embeddingFields = resolveEmbeddingFields(row);
    const topicLabel = row.topic_label.trim() || "Untitled Topic";

    const routeTopic: RouteTopic = {
      id: row.topic_id,
      topic_label: topicLabel,
      diagnosis: normalizeDiagnosis(row.diagnosis) ?? DEFAULT_DIAGNOSIS,
      nextStep:
        row.next_step ?? `Explain ${topicLabel} clearly in your own words.`,
      confusion: row.confusion ?? 0.5,
      insight: row.insight ?? 0.3,
      learningScore: row.learning_score ?? 0.2,

      position: layout.position,
      semanticPosition: layout.semantic_position,
      semanticPositionMethod: layout.semantic_position_method,
      semanticPositionUpdatedAt: layout.semantic_position_updated_at,
      positionSource: layout.position_source,

      scale: 1,
      messageCount: 1,
      lastUpdated: row.updated_at,
      hasAvailableProbe: false,

      ...embeddingFields,

      semantic_enrichment_status: row.semantic_enrichment_status,
      needs_embedding_centroid: row.needs_embedding_centroid,
      should_schedule_enrichment: row.should_schedule_enrichment,
      semantic_enrichment_prompt_text: row.semantic_enrichment_prompt_text,
      layout_status: row.layout_status,
      embedding_skip_reason: row.embedding_skip_reason,

      topic_json: row.topic_json,
    };

    loadedTopics.push(routeTopic);
  }

  routeTopicsCache = {
    createdAt: now,
    topics: cloneRouteTopics(loadedTopics),
  };

  return cloneRouteTopics(loadedTopics);
}