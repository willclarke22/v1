/**
 * MyWay experimental Supabase-only topic retrieval (V3.7B.2).
 * Replaces Qdrant for topic routing. Caller contracts remain unchanged.
 * Never import this file from the original MyWay worktree.
 */
import { embedText } from "@/lib/vector/embed";
import { searchSandboxTopics } from "@/sandbox/probe-lab/learning-space/semantic-search.server";
import type { EmbeddingVector, VectorInfo } from "@/types/contracts";

export type SemanticTopicCandidate = {
  topic_id: string;
  topic_label: string;
  similarity: number;
  rank: number;
  topic_label_embedding_count: number | null;
  topic_label_embedding_model: string | null;
  topic_label_embedding_updated_at: string | null;
  vector_source: string | null;
  vector_semantics: string | null;
};
export type QueryTopicsTimingStep = { label: string; duration_ms: number; elapsed_ms: number };
export type QueryTopicsRoute =
  | "embedMessageForSemanticRouting"
  | "querySemanticTopicCandidatesFromEmbedding"
  | "querySemanticTopicCandidatesWithEmbedding"
  | "querySemanticTopicCandidates";
export type QueryTopicsTimingDebug = {
  enabled: boolean;
  total_ms: number;
  steps: QueryTopicsTimingStep[];
  metadata: {
    route: QueryTopicsRoute;
    requested_limit: number;
    returned_points: number;
    returned_topics: number;
    has_qdrant_config: boolean;
    skipped_reason: string | null;
    message_embedding_available: boolean;
    embedding_model: string | null;
    qdrant_query_attempted: boolean;
    qdrant_timeout_ms: number;
    backend: "supabase";
    supabase_query_attempted: boolean;
  };
};
export type SemanticTopicQueryResult = {
  vectorInfo: VectorInfo;
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  candidates: SemanticTopicCandidate[];
  debug?: QueryTopicsTimingDebug;
};
export type SemanticMessageEmbeddingResult = {
  messageEmbedding: EmbeddingVector | null;
  embeddingModel: string | null;
  debug?: QueryTopicsTimingDebug;
};

const emptyInfo = (): VectorInfo => ({
  top_k_topic_labels: [], top_k_topic_ids: [], top_k_similarity_scores: [],
});
function modelName() {
  return process.env.MYWAY_EMBEDDING_MODEL ?? process.env.EMBEDDING_MODEL ?? "local-embedding-service";
}
function validVector(value: unknown): value is EmbeddingVector {
  return Array.isArray(value) && value.length === 384 &&
    value.every(x => typeof x === "number" && Number.isFinite(x));
}
function normalizeLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 5;
}
function diagnostics(route: QueryTopicsRoute, started: number, data: {
  limit: number; returned: number; reason?: string | null;
  hasEmbedding: boolean; model: string | null; queried: boolean;
}): QueryTopicsTimingDebug {
  const debug: QueryTopicsTimingDebug = {
    enabled: process.env.MYWAY_VECTOR_QUERY_TIMING !== "off",
    total_ms: Math.round((performance.now() - started) * 100) / 100,
    steps: [],
    metadata: {
      route, requested_limit: data.limit, returned_points: data.returned,
      returned_topics: data.returned, has_qdrant_config: false,
      skipped_reason: data.reason ?? null, message_embedding_available: data.hasEmbedding,
      embedding_model: data.model, qdrant_query_attempted: false, qdrant_timeout_ms: 0,
      backend: "supabase", supabase_query_attempted: data.queried,
    },
  };
  if (debug.enabled) console.info(`[${route} timing]`, debug);
  return debug;
}
function emptyResult(messageEmbedding: EmbeddingVector | null, model: string | null,
  debug?: QueryTopicsTimingDebug): SemanticTopicQueryResult {
  return { vectorInfo: emptyInfo(), messageEmbedding, embeddingModel: model, candidates: [], debug };
}
function assertSupabaseBackend() {
  if (process.env.MYWAY_TOPIC_VECTOR_BACKEND !== "supabase") {
    throw new Error("V3.7B.2 BLOCK: MYWAY_TOPIC_VECTOR_BACKEND=supabase required. No Qdrant fallback.");
  }
}
export async function embedMessageForSemanticRouting(message: string): Promise<SemanticMessageEmbeddingResult> {
  assertSupabaseBackend();
  const started = performance.now();
  const route = "embedMessageForSemanticRouting" as const;
  if (typeof message !== "string" || !message.trim()) {
    return { messageEmbedding: null, embeddingModel: null,
      debug: diagnostics(route, started, {limit: 0,returned:0,reason:"empty_message",hasEmbedding:false,model:null,queried:false}) };
  }
  try {
    const vector = await embedText(message);
    if (!validVector(vector)) throw new Error("embedding_service_did_not_return_384_finite_numbers");
    const model = modelName();
    return { messageEmbedding: vector, embeddingModel: model,
      debug: diagnostics(route,started,{limit:0,returned:0,hasEmbedding:true,model,queried:false}) };
  } catch (error) {
    const debug = diagnostics(route,started,{limit:0,returned:0,hasEmbedding:false,model:null,queried:false,
      reason:error instanceof Error?`embed_text_failed: ${error.message}`:"embed_text_failed"});
    throw Object.assign(error instanceof Error?error:new Error("embed_text_failed"),{debug});
  }
}
export async function querySemanticTopicCandidatesFromEmbedding(
  messageEmbedding: EmbeddingVector | null, limit = 5, embeddingModel: string | null = modelName(),
): Promise<SemanticTopicQueryResult> {
  assertSupabaseBackend();
  const started=performance.now();
  const route="querySemanticTopicCandidatesFromEmbedding" as const;
  const requested=normalizeLimit(limit);
  if (!messageEmbedding?.length) return emptyResult(null,embeddingModel,
    diagnostics(route,started,{limit:requested,returned:0,reason:"missing_message_embedding",hasEmbedding:false,model:embeddingModel,queried:false}));
  if (!validVector(messageEmbedding)) throw new Error("V3.7B.2: message embedding must be 384 finite numbers");
  if (!embeddingModel?.trim()) throw new Error("V3.7B.2: embedding model identity is required");
  // Production semantics: learner-message vector searches stored TOPIC-LABEL vectors.
  // The model identity must match the stored centroid model exactly.
  const found = await searchSandboxTopics({vector:messageEmbedding, kind:"label", embeddingModel, limit:requested});
  const candidates: SemanticTopicCandidate[] = found.map((r,i)=>({
    topic_id:r.topicId,topic_label:r.topicLabel,similarity:r.similarity,rank:i,
    topic_label_embedding_count:null,topic_label_embedding_model:r.embeddingModel,
    topic_label_embedding_updated_at:null,vector_source:"supabase_pgvector",
    vector_semantics:"learner_message_to_topic_label_centroid",
  }));
  const vectorInfo:VectorInfo={
    top_k_topic_labels:candidates.map(c=>c.topic_label),
    top_k_topic_ids:candidates.map(c=>c.topic_id),
    top_k_similarity_scores:candidates.map(c=>c.similarity),
  };
  return { vectorInfo,messageEmbedding,embeddingModel,candidates,
    debug:diagnostics(route,started,{limit:requested,returned:candidates.length,hasEmbedding:true,model:embeddingModel,queried:true})};
}
export async function querySemanticTopicCandidatesWithEmbedding(message:string, limit=5):Promise<SemanticTopicQueryResult>{
  const requested=normalizeLimit(limit);
  let embedded:SemanticMessageEmbeddingResult;
  try { embedded=await embedMessageForSemanticRouting(message); }
  catch(error){
    const d=(error as {debug?:QueryTopicsTimingDebug})?.debug;
    if(!d)throw error;
    return emptyResult(null,null,{...d,metadata:{...d.metadata,route:"querySemanticTopicCandidatesWithEmbedding",requested_limit:requested}});
  }
  const result=await querySemanticTopicCandidatesFromEmbedding(embedded.messageEmbedding,requested,embedded.embeddingModel);
  if(result.debug)result.debug.metadata.route="querySemanticTopicCandidatesWithEmbedding";
  return result;
}
export async function querySemanticTopicCandidates(message:string,limit=5):Promise<VectorInfo>{
  return (await querySemanticTopicCandidatesWithEmbedding(message,limit)).vectorInfo;
}
