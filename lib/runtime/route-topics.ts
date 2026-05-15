import { getRouteTopicState } from "@/lib/persistence/read";
import { makeId } from "@/lib/utils/ids";
import type { DiagnosisType, EmbeddingVector } from "@/types/contracts";
import { isPosition, normalizeDiagnosis } from "./shared";

export type RouteTopic = {
  id: string;
  topic_label: string;

  /**
   * @deprecated Use topic_label instead. Kept while older UI/runtime code migrates.
   */
  name: string;
  diagnosis: DiagnosisType;
  nextStep: string;
  confusion: number;
  insight: number;
  learningScore: number;
  position: [number, number, number];
  scale: number;
  messageCount: number;
  lastUpdated: string;
  hasAvailableProbe: boolean;

  /**
   * Canonical topic-label embedding.
   *
   * Represents the clean topic label / topic identity. This is the vector family
   * used for semantic layout and Qdrant topic lookup.
   */
  topic_label_embedding_centroid?: EmbeddingVector | null;
  topic_label_embedding_count?: number | null;
  topic_label_embedding_model?: string | null;
  topic_label_embedding_updated_at?: string | null;

  /**
   * Canonical topic-message embedding.
   *
   * Represents learner-message / struggle-pattern evidence assigned to this
   * topic. This is not used for semantic layout yet.
   */
  topic_message_embedding_centroid?: EmbeddingVector | null;
  topic_message_embedding_count?: number | null;
  topic_message_embedding_model?: string | null;
  topic_message_embedding_updated_at?: string | null;

  /**
   * Semantic enrichment / layout metadata mirrored from explicit topic_state columns.
   */
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

type EmbeddingAliases = {
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

function getRowTopicLabel(row: {
  topic_name: string;
  topic_json?: Record<string, unknown> | null;
}) {
  const topicLabelFromJson =
    row.topic_json &&
    typeof row.topic_json.topic_label === "string" &&
    row.topic_json.topic_label.trim()
      ? row.topic_json.topic_label.trim()
      : null;

  return topicLabelFromJson ?? row.topic_name.trim();
}

function computeNextTopicPosition(existingTopics: RouteTopic[]): [number, number, number] {
  const count = existingTopics.length;

  if (count === 0) {
    return [0, 0, 0];
  }

  const angle = count * 1.35;
  const radius = 2.8 + count * 0.65;
  const x = Math.cos(angle) * radius;
  const y = ((count % 3) - 1) * 0.9;
  const z = Math.sin(angle) * radius * 0.75;

  return [x, y, z];
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
  name: string;
  nextStep: string;
  existingTopics: RouteTopic[];
}): RouteTopic {
  const position = computeNextTopicPosition(args.existingTopics);

  return {
    id: makeId("topic"),
    topic_label: args.name,
    name: args.name,
    diagnosis: DEFAULT_DIAGNOSIS,
    nextStep: args.nextStep,
    confusion: 0.58,
    insight: 0.34,
    learningScore: 0.22,
    position,
    scale: 1,
    messageCount: 1,
    lastUpdated: new Date().toISOString(),
    hasAvailableProbe: false,
  };
}

export function buildSeededTopicFromResolvedLabel(args: {
  resolvedLabel: string;
  existingTopics: RouteTopic[];
  frame?: SharedMessageFrame;
}): RouteTopic {
  return buildSeededTopic({
    name: args.resolvedLabel,
    nextStep: inferSeededNextStepFromConceptAndFrame(
      args.resolvedLabel,
      args.frame ?? "explain_request",
    ),
    existingTopics: args.existingTopics,
  });
}

function extractPositionFromTopicJson(topicJson: unknown): [number, number, number] | null {
  if (!topicJson || typeof topicJson !== "object" || Array.isArray(topicJson)) {
    return null;
  }

  const json = topicJson as {
    topic_position?: unknown;
    position?: unknown;
    topic_centroid?: unknown;
    learning_space_topic?: {
      position?: unknown;
    };
  };

  return (
    (isPosition(json.topic_position) ? json.topic_position : null) ??
    (isPosition(json.position) ? json.position : null) ??
    (isPosition(json.topic_centroid) ? json.topic_centroid : null) ??
    (isPosition(json.learning_space_topic?.position)
      ? json.learning_space_topic.position
      : null)
  );
}

function resolveTopicPosition(row: {
  topic_position?: [number, number, number] | null;
  semantic_position?: [number, number, number] | null;
  topic_json?: Record<string, unknown> | null;
}): [number, number, number] | null {
  return (
    (isPosition(row.semantic_position) ? row.semantic_position : null) ??
    (isPosition(row.topic_position) ? row.topic_position : null) ??
    extractPositionFromTopicJson(row.topic_json)
  );
}

function resolveEmbeddingAliases(row: {
  topic_label_embedding_centroid: EmbeddingVector | null;
  topic_label_embedding_count: number | null;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;

  topic_message_embedding_centroid: EmbeddingVector | null;
  topic_message_embedding_count: number | null;
  topic_message_embedding_model: string | null;
  topic_message_embedding_updated_at: string | null;
}): EmbeddingAliases {
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
  const rows = await getRouteTopicState();

  if (!rows.length) {
    return [];
  }

  const loadedTopics: RouteTopic[] = [];

  for (const row of rows) {
    const position =
      resolveTopicPosition({
        topic_position: row.topic_position,
        semantic_position: row.semantic_position,
        topic_json: row.topic_json,
      }) ?? computeNextTopicPosition(loadedTopics);

    const embeddingAliases = resolveEmbeddingAliases(row);
    const topicLabel = getRowTopicLabel(row);

    const routeTopic: RouteTopic = {
      id: row.topic_id,
      topic_label: topicLabel,
      name: topicLabel,
      diagnosis: normalizeDiagnosis(row.diagnosis) ?? DEFAULT_DIAGNOSIS,
      nextStep: row.next_step ?? `Explain ${topicLabel} clearly in your own words.`,
      confusion: row.confusion ?? 0.5,
      insight: row.insight ?? 0.3,
      learningScore: row.learning_score ?? 0.2,
      position,
      scale: 1,
      messageCount: 1,
      lastUpdated: row.updated_at,
      hasAvailableProbe: false,

      ...embeddingAliases,

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

  return loadedTopics;
}
