/** D.2C: optional same-model, locally generated embeddings of *difficulty descriptions*.
 * Distinct from the label vector search; a search hit alone cannot authorize a write.
 */
import "server-only";
import {embedText} from "@/lib/vector/embed";
import {cosine,is384Vector} from "./topic-memory-index.server";
import type {TopicStateRow} from "@/lib/persistence/read";
import {eligibleDifficultyEvents, type ApprovedEventSimilarity} from "./difficulty-identity";
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{ };
export function historicalProblems(json:unknown):string[]{
 const data=obj(json);const all:unknown[]=[];
 const collect=(item:Record<string,unknown>)=>{
  for(const key of ["root_problem","root_problem_explanation","last_root_problem","diagnosed_root_problem"]) all.push(item[key]);
 };
 collect(data);
 for(const key of ["diagnosis_state","last_assessment","last_diagnosis","assessment"]){
  const nested=data[key];if(nested&&typeof nested==="object"&&!Array.isArray(nested))collect(obj(nested));
 }
 const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 for(const event of Array.isArray(data.myway_learning_evidence)?data.myway_learning_evidence:[]){
  const e=obj(event);
  if(typeof e.event_id!=="string"||!validId.test(e.event_id))continue;
  if(e.origin!=="v37d2c_validated_assessment"&&
    !(e.origin==="v37d2a_explicit_user_approval"&&data.myway_memory_origin==="v37d2a_explicit_user_approval"))continue;
  all.push(e.root_problem);
 }
 // Four descriptions per topic keeps the pre-existing bounded local inference cost.
 return [...new Set(all.filter((x):x is string=>typeof x==="string"&&x.trim().length>=15&&x.trim().length<=500).map(x=>x.trim()))].slice(-4);
}
export async function rootSemanticMatches(rootProblem:string,rows:TopicStateRow[],matches:Array<{topicId:string;similarity:number}>):Promise<Record<string,number>>{
 if(!process.env.EMBEDDINGS_URL?.trim()||rootProblem.length>900)return {};
 const plausible=matches.filter(m=>m.similarity>=0.15).slice(0,3);
 if(!plausible.length)return {};
 const query=await embedText(rootProblem.slice(0,500));if(!is384Vector(query))return {};
 const output:Record<string,number>={};
 for(const m of plausible){
  const row=rows.find(x=>x.topic_id===m.topicId);if(!row)continue;
  const old=historicalProblems(row.topic_json);
  let best=-1;
  for(const description of old){const v=await embedText(description);if(!is384Vector(v))continue;best=Math.max(best,cosine(query,v));}
  if(best>=-1&&old.length)output[m.topicId]=Number(best.toFixed(4));
 }
 return output;
}

/** Independently score only APPROVED event records, not free-form topic summaries.
 * Bounded to 3 retrieval topics and 8 recent events each; read-only local embeddings.
 */
export async function approvedEventSemanticMatches(rootProblem:string,rows:TopicStateRow[],
 matches:Array<{topicId:string;similarity:number}>):Promise<ApprovedEventSimilarity[]>{
 if(!process.env.EMBEDDINGS_URL?.trim()||rootProblem.length>900)return [];
 const plausible=matches.filter(m=>m.similarity>=0.15).slice(0,3);
 if(!plausible.length)return [];
 const query=await embedText(rootProblem.slice(0,500));if(!is384Vector(query))return [];
 const result:ApprovedEventSimilarity[]=[];
 const embedded=new Map<string,number[]>();
 for(const m of plausible){
  const row=rows.find(r=>r.topic_id===m.topicId);if(!row)continue;
  const events=eligibleDifficultyEvents(row.topic_json).slice(-8);
  for(const e of events){
   const description=String(e.root_problem);
   let vector=embedded.get(description);
   if(!vector){const found=await embedText(description);if(!is384Vector(found))continue;
    vector=found;embedded.set(description,found);}
   result.push({topicId:m.topicId,eventId:String(e.event_id),similarity:Number(cosine(query,vector).toFixed(4))});
  }
 }
 return result;
}
