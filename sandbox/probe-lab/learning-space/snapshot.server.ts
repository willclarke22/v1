/** V3.7C.1 - read-only experimental topic snapshot. No writes or model calls. */
import "server-only";
import { getLatestTopicState, type TopicStateRow } from "@/lib/persistence/read";
import { resolveTopicLayout } from "@/lib/learning-space/topic-position";
import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import type { DiagnosisType } from "@/types/contracts";
import type { Topic, TopicConfusionInsightStatus } from "@/types/topic";
import type {
  LearningSpaceRelationship,
  LearningSpaceViewpoint,
  LearningSpaceProjectionMetadata,
} from "@/types/learning-space";

const clamp = (n: unknown, fallback = 0.5) =>
  Math.max(0, Math.min(1, typeof n === "number" && Number.isFinite(n) ? n : fallback));
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const str = (x: unknown): string | null => typeof x === "string" && x.trim() ? x.trim() : null;
const arr = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const isValidEmbedding = (value: unknown) =>
  Array.isArray(value) && value.length === 384 && value.every(x => typeof x === "number" && Number.isFinite(x));
const diagnosisTypes = new Set(["recall_gap", "representation_gap", "procedure_gap", "discrimination_gap", "transfer_gap"]);
function diagnosis(value: unknown): DiagnosisType {
  return typeof value === "string" && diagnosisTypes.has(value) ? value as DiagnosisType : "representation_gap";
}
function signalStatus(json: Record<string, unknown>): TopicConfusionInsightStatus {
  const queue = arr(json.pending_confusion_insight_scores);
  const pending = queue.length;
  const last = object(json.last_confusion_insight_score);
  const signal = object(json.confusion_insight_signal_state);
  const signals = typeof signal.signal_count === "number" ? signal.signal_count :
    typeof json.confusion_insight_signal_count === "number" ? json.confusion_insight_signal_count : 0;
  const ready = Object.keys(last).length > 0 || signals > 0;
  const status: TopicConfusionInsightStatus["status"] = pending > 0 ? "pending" : ready ? "ready" : "unknown";
  return {status, isPending: pending > 0, hasModelScore: ready,
    hasStructuredV1Score: last.payload_shape === "structured_v1_1", pendingCount: pending, signalCount: signals,
    lastScore: Object.keys(last).length ? {
      scoreId: str(last.score_id), processedAt: str(last.processed_at),
      modelVersion: str(last.model_version), modelConfusion: typeof last.model_confusion === "number" ? last.model_confusion : null,
      modelInsight: typeof last.model_insight === "number" ? last.model_insight : null,
    } : null};
}
function persistedLayer(rows: TopicStateRow[]) {
  for (const row of rows) {
    const json = object(row.topic_json);
    const relationships = arr(json.learning_space_relationships);
    const viewpoints = arr(json.learning_space_viewpoints);
    const projection = object(json.learning_space_projection);
    if (relationships.length || viewpoints.length || Object.keys(projection).length) {
      return { relationships: relationships as LearningSpaceRelationship[],
        viewpoints: viewpoints as LearningSpaceViewpoint[],
        projection: Object.keys(projection).length ? projection as LearningSpaceProjectionMetadata : null };
    }
  }
  return {relationships: [] as LearningSpaceRelationship[], viewpoints: [] as LearningSpaceViewpoint[], projection: null};
}
function jsonOrigin(x:unknown):string|null{return str(object(x).myway_memory_origin);}
function mapRows(rows: TopicStateRow[]) {
  const layer = persistedLayer(rows);
  return rows.map((row, index) => {
    const json = object(row.topic_json);
    const layout = resolveTopicLayout({topicId: row.topic_id, index,
      topicPosition: row.topic_position, semanticPosition: row.semantic_position,
      semanticPositionMethod: row.semantic_position_method,
      semanticPositionUpdatedAt: row.semantic_position_updated_at,
      topicJson: json});
    const topic: Topic = {
      id: row.topic_id,
      topic_label: str(json.topic_label) ?? row.topic_label ?? "Untitled Topic",
      diagnosis: diagnosis(row.diagnosis),
      nextStep: str(json.next_step) ?? row.next_step ?? "Continue learning",
      confusion: clamp(row.confusion), insight: clamp(row.insight), learningScore: clamp(row.learning_score),
      confusionInsightStatus: signalStatus(json),
      position: layout.position, semanticPosition: layout.semantic_position,
      semanticPositionMethod: layout.semantic_position_method,
      semanticPositionUpdatedAt: layout.semantic_position_updated_at,
      positionSource: layout.position_source, scale: 1,
      messageCount: typeof json.topic_message_count === "number" ? json.topic_message_count : 0,
      lastUpdated: row.updated_at,
      hasAvailableProbe: false, learningSpaceRelationships: layer.relationships,
      learningSpaceViewpoints: layer.viewpoints, learningSpaceProjection: layer.projection,
    };
    // Projection functions accept optional topicJson metadata; not sent as a separate exposed field.
    return Object.assign(topic, {topicJson: json});
  });
}
export async function readSandboxLearningSpaceSnapshot() {
  if (process.env.MYWAY_EXPERIMENTAL_RUNTIME !== "v37b" ||
      process.env.MYWAY_TOPIC_VECTOR_BACKEND !== "supabase") {
    throw new Error("Sandbox-only Supabase runtime flags required");
  }
  const rows = await getLatestTopicState(); // server Supabase client enforces V3.7B destination pin.
  const topics = mapRows(rows);
  const learningSpace = buildLearningSpace(topics);
  const inspect = rows.map((row, i) => ({
    topicId: row.topic_id, label: topics[i].topic_label, diagnosis: topics[i].diagnosis,
    learningScore: topics[i].learningScore, confusion: topics[i].confusion, insight: topics[i].insight,
    position: topics[i].position, semanticPosition: topics[i].semanticPosition,
    positionSource: topics[i].positionSource,
    labelEmbeddingReady: isValidEmbedding(row.topic_label_embedding_centroid),
    repairEligible: jsonOrigin(row.topic_json)==="v37d2a_explicit_user_approval" && row.topic_label_embedding_centroid===null && !row.topic_label_embedding_model,
    scoredObservations: object(object(row.topic_json).myway_scored_observation_summary),
    messageEmbeddingReady: isValidEmbedding(row.topic_message_embedding_centroid),
    labelModel: row.topic_label_embedding_model, messageModel: row.topic_message_embedding_model,
    labelCount: row.topic_label_embedding_count, messageCount: row.topic_message_embedding_count,
  }));
  return {
    schema: "myway-v37c1-learning-space-readonly-v1" as const,
    source: "myway_sandbox" as const,
    mode: "read_only" as const,
    generatedAt: new Date().toISOString(),
    topics: topics.map(({topicJson: _topicJson, ...rest}) => rest),
    learningSpace,
    inspect,
    summary: {
      topicCount: rows.length,
      labelVectors: inspect.filter(x => x.labelEmbeddingReady).length,
      messageVectors: inspect.filter(x => x.messageEmbeddingReady).length,
      relationshipCount: learningSpace.relationships.length,
      committedPositions: rows.filter(r => r.topic_position != null).length,
      semanticPositions: rows.filter(r => r.semantic_position != null).length,
    },
  };
}
