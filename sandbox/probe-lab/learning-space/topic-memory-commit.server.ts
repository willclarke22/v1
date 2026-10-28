/** V3.7D.2A: explicitly approved, experimental-only topic-memory mutation.
 * No embeddings, mastery updates, relationship recompute, worker invocation or layout writes.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getLatestTopicState } from "@/lib/persistence/read";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canonicalLabel, memoryDigest, type MemoryApproval } from "./topic-memory-approval.server";
import { isRubricScore, scoredObservation, scoreSummary } from "./topic-memory-scores";
import { is384Vector, prepareTopicIndex } from "./topic-memory-index.server";

export type CommitOutcome={status:"committed";action:"associate_existing"|"propose_new";topicId:string;topicLabel:string;verified:boolean;embeddingReady?:boolean;positionReady?:boolean;warning?:string};
export class CommitRefused extends Error {constructor(public code:string,message:string){super(message);this.name="CommitRefused";}}
const asObject=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?{...(value as Record<string,unknown>)}:{};
const asArray=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const safe=(s:string,limit:number)=>s.trim().slice(0,limit);
// In dev, serialize approved writes inside this single process. The CAS update / topic ID
// uniqueness remain the database safeguards. Cross-process label uniqueness requires a DB
// unique index and is deliberately NOT claimed here.
let gate:Promise<void>=Promise.resolve();
export async function exclusive<T>(callback:()=>Promise<T>):Promise<T>{
  const previous=gate;let release!:()=>void;
  gate=new Promise<void>(resolve=>{release=resolve;});
  await previous;try{return await callback();}finally{release();}
}
export async function commitTopicMemory(p:MemoryApproval):Promise<CommitOutcome>{
 return exclusive(async()=>{
  if(process.env.NODE_ENV!=="development"||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"||
    process.env.MYWAY_TOPIC_VECTOR_BACKEND!=="supabase"||process.env.MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL!=="v37c-route-audit-passed"){
    throw new CommitRefused("sandbox_guard_missing","Experimental runtime approval or sandbox vector pin missing.");
  }
  // The server client itself performs pinned project identity and credential checks.
  const db=createServerSupabaseClient();
  const rows=await getLatestTopicState();
  if(memoryDigest(rows)!==p.snapshotDigest)throw new CommitRefused("stale_preview","Topic memory changed since this preview. Run another learning turn before approving.");
  if(!isRubricScore(p.confusion)||!isRubricScore(p.insight))throw new CommitRefused("bad_rubric","Invalid model score: expected -1..10 integers.");
  if(!p.evidenceQuote.trim()||!`${p.originalMessage}\n${p.currentMessage}`.toLowerCase().includes(p.evidenceQuote.toLowerCase())){
    throw new CommitRefused("ungrounded_evidence","Learner evidence could not be verified.");
  }
  const {action,targetTopicId,reasonCode}=p.preview;
  if(action!=="associate_existing"&&action!=="propose_new")throw new CommitRefused("not_actionable","A hold decision cannot be committed.");
  if(action==="associate_existing"&&!new Set(["historical_root_problem_match","strong_topic_level_match","semantic_root_problem_match","model_verifier_manual_review"]).has(reasonCode))throw new CommitRefused("not_supported","Association requires explicit historical difficulty evidence or a strong subject-level match.");
  if(action==="propose_new"&&reasonCode!=="no_close_semantic_candidate"||action==="propose_new"&&p.preview.retrievalStatus!=="semantic_pgvector"){
    throw new CommitRefused("not_supported","New topic requires a successful semantic search and a supported proposal.");
  }
  const now=new Date().toISOString();
  const item={event_id:randomUUID(),recorded_at:now,root_problem:safe(p.rootProblem,500),evidence_quote:safe(p.evidenceQuote,500),
    original_statement:safe(p.originalMessage,2500),clarification_answer:p.currentMessage===p.originalMessage?"":safe(p.currentMessage,2500),
    origin:"v37d2c_validated_assessment",reason_code:reasonCode,
    ...scoredObservation(p.confusion,p.insight),model_estimated_evidence_confidence:p.rootConfidence};
  if(action==="associate_existing"){
    const target=rows.find(r=>r.topic_id===targetTopicId);
    if(!target)throw new CommitRefused("topic_missing","The approved existing topic no longer exists.");
    const json=asObject(target.topic_json);
    const prior=asArray(json.myway_learning_evidence);
    if(prior.length>=100)throw new CommitRefused("history_full","Topic evidence history is full; refusing to discard older evidence silently.");
    const events=[...prior,item];
    const summary=scoreSummary(events);
    const sandboxOwned=json.myway_memory_origin==="v37d2a_explicit_user_approval";
    const next={...json,myway_learning_evidence:events,myway_scored_observation_summary:summary};
    const changes:Record<string,unknown>={topic_json:next,updated_at:now};
    // Only sandbox-created topics may have their provisional signal averages changed.
    // Never override legacy score histories or learning_score/mastery.
    if(sandboxOwned){if(summary.confusion!==null)changes.confusion=summary.confusion;if(summary.insight!==null)changes.insight=summary.insight;}
    const {data,error}=await db.from("topic_state").update(changes)
      .eq("topic_id",target.topic_id).eq("updated_at",target.updated_at).select("topic_id,topic_json");
    if(error)throw new CommitRefused("write_failed","Topic update failed. Inspect local server logs.");
    if(!data||data.length!==1)throw new CommitRefused("write_conflict","Topic changed before update. No overwrite performed.");
    const verified=await getLatestTopicState();
    const result=verified.find(r=>r.topic_id===target.topic_id);
    const evidence=asArray(asObject(result?.topic_json).myway_learning_evidence);
    if(!evidence.some(v=>asObject(v).event_id===item.event_id))throw new CommitRefused("verification_failed","Write response was not visible in a verification read.");
    return {status:"committed",action,topicId:target.topic_id,topicLabel:target.topic_label,verified:true};
  }
  // Label duplication check including different capitalization/spacing. Recheck under
  // the local commit mutex. The database has no proven unique normalized-label index.
  const label=safe(p.topicName,110);
  if(label.length<3)throw new CommitRefused("invalid_topic_label","Topic label too short.");
  if(rows.some(r=>canonicalLabel(r.topic_label)===canonicalLabel(label))){
    throw new CommitRefused("duplicate_topic_label","A topic already has this label. Reassess against existing memory.");
  }
  if(rows.some(r=>canonicalLabel(r.topic_label).includes(canonicalLabel(label))||canonicalLabel(label).includes(canonicalLabel(r.topic_label)))&&label.length>=8){
    throw new CommitRefused("similar_topic_label","A near-identical topic label already exists. Review manually before creating.");
  }
  // Prepare before INSERT: failed embedding service must not leave a half-created topic.
  const prepared=await prepareTopicIndex(label,rows);
  const topicId=randomUUID();
  // Insert, NOT upsert: a new ID collision must fail rather than overwrite a row.
  const json={topic_label:label,root_problem:safe(p.rootProblem,500),myway_learning_evidence:[item],
    myway_memory_origin:"v37d2a_explicit_user_approval",topic_message_count:0,
    myway_scored_observation_summary:scoreSummary([item]),
    myway_initial_layout:"v37d2b_initial_placement",layout_status:"semantic_layout_refresh_pending"};
  const {error}=await db.from("topic_state").insert({topic_id:topicId,topic_label:label,updated_at:now,
    last_run_id:null,confusion:scoreSummary([item]).confusion,insight:scoreSummary([item]).insight,learning_score:null,diagnosis:null,next_step:"Continue learning",topic_json:json,
    topic_label_embedding_centroid:prepared.vector,topic_label_embedding_count:1,
    topic_label_embedding_model:prepared.model,topic_label_embedding_updated_at:now,
    topic_position_x:prepared.position[0],topic_position_y:prepared.position[1],topic_position_z:prepared.position[2],
    semantic_position_x:prepared.semanticPosition?.[0]??null,semantic_position_y:prepared.semanticPosition?.[1]??null,
    semantic_position_z:prepared.semanticPosition?.[2]??null,semantic_position_method:prepared.positionMethod,
    semantic_position_updated_at:prepared.semanticPosition?now:null,layout_status:"semantic_layout_refresh_pending"});
  if(error)throw new CommitRefused("create_failed","New topic insert failed. Inspect local server logs; no upsert attempted.");
  const verified=await getLatestTopicState();
  const created=verified.find(r=>r.topic_id===topicId);
  if(!created||canonicalLabel(created.topic_label)!==canonicalLabel(label)||
    !asArray(asObject(created.topic_json).myway_learning_evidence).some(v=>asObject(v).event_id===item.event_id)){
    throw new CommitRefused("verification_failed","Created topic was not visible in a verification read.");
  }
  // The sandbox migration trigger indexes the centroid transactionally.
  // If verification cannot see it, report partial completion explicitly; do not
  // pretend the database insert failed (or invite a duplicate retry).
  const indexed=await db.from("topic_vectors").select("topic_id,embedding_model")
    .eq("topic_id",topicId).eq("kind","label").maybeSingle();
  const embeddingReady=!indexed.error&&indexed.data?.embedding_model===prepared.model;
  return {status:"committed",action,topicId,topicLabel:label,verified:true,embeddingReady,positionReady:true,
    ...(embeddingReady?{}:{warning:"Topic created, but its pgvector index could not be verified. Do not recreate; inspect before repair."})};
 });
}

/** One-topic repair for previously approved D.2A records with no label centroid.
 * NOT a general backfill. No learner evidence, scores or pre-existing coordinates are modified.
 * Requires a separate explicit same-origin confirmation in the existing sandbox route.
 */
export async function repairApprovedTopicIndex(topicId:string):Promise<{status:"repaired"|"already_indexed";topicId:string;verified:boolean;embeddingReady:boolean;positionReady:boolean}>{
 return exclusive(async()=>{
  if(process.env.NODE_ENV!=="development"||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"||
    process.env.MYWAY_TOPIC_VECTOR_BACKEND!=="supabase"||process.env.MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL!=="v37c-route-audit-passed")
    throw new CommitRefused("sandbox_guard_missing","Repair requires the experimental-only approved server.");
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(topicId))throw new CommitRefused("invalid_id","Invalid topic id.");
  const db=createServerSupabaseClient();const rows=await getLatestTopicState();
  const row=rows.find(r=>r.topic_id===topicId);
  if(!row)throw new CommitRefused("topic_missing","Topic not found in experimental memory.");
  if(asObject(row.topic_json).myway_memory_origin!=="v37d2a_explicit_user_approval")
    throw new CommitRefused("repair_scope","Only explicitly approved D.2A-created topics can be repaired.");
  if(is384Vector(row.topic_label_embedding_centroid)){
   const indexed=await db.from("topic_vectors").select("topic_id").eq("topic_id",topicId).eq("kind","label").maybeSingle();
   if(indexed.error||!indexed.data)throw new CommitRefused("index_inconsistent","Centroid exists but index could not be verified; refusing to overwrite it.");
   return {status:"already_indexed",topicId,verified:true,embeddingReady:true,positionReady:row.topic_position!==null};
  }
  // Do not overwrite an unexpected non-null invalid centroid or another model's embedding.
  if(row.topic_label_embedding_centroid!==null||row.topic_label_embedding_model)
    throw new CommitRefused("unexpected_embedding_state","Existing index metadata requires manual review.");
  const prepared=await prepareTopicIndex(row.topic_label,rows.filter(r=>r.topic_id!==row.topic_id));
  const now=new Date().toISOString();
  const next:Record<string,unknown>={topic_label_embedding_centroid:prepared.vector,topic_label_embedding_count:1,
    topic_label_embedding_model:prepared.model,topic_label_embedding_updated_at:now,updated_at:now};
  if(!row.topic_position){
   next.topic_position_x=prepared.position[0];next.topic_position_y=prepared.position[1];next.topic_position_z=prepared.position[2];
   if(prepared.semanticPosition){next.semantic_position_x=prepared.semanticPosition[0];next.semantic_position_y=prepared.semanticPosition[1];next.semantic_position_z=prepared.semanticPosition[2];next.semantic_position_method=prepared.positionMethod;next.semantic_position_updated_at=now;}
   next.layout_status="semantic_layout_refresh_pending";
  }
  const {data,error}=await db.from("topic_state").update(next).eq("topic_id",topicId)
   .eq("updated_at",row.updated_at).is("topic_label_embedding_centroid",null).select("topic_id");
  if(error||!data||data.length!==1)throw new CommitRefused("repair_conflict","Repair conflict; refresh topic memory. No overwrite performed.");
  const current=await getLatestTopicState();const verified=current.find(r=>r.topic_id===topicId);
  const indexed=await db.from("topic_vectors").select("embedding_model").eq("topic_id",topicId).eq("kind","label").maybeSingle();
  const embeddingReady=!!verified&&is384Vector(verified.topic_label_embedding_centroid)&&!indexed.error&&indexed.data?.embedding_model===prepared.model;
  if(!embeddingReady)throw new CommitRefused("repair_verification_failed","The repair changed metadata but index verification failed. Inspect before retrying.");
  return {status:"repaired",topicId,verified:true,embeddingReady:true,positionReady:verified?.topic_position!=null};
 });
}
