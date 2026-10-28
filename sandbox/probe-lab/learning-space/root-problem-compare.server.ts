/** D.2C: optional same-model, locally generated embeddings of *difficulty descriptions*.
 * Distinct from the label vector search; a search hit alone cannot authorize a write.
 */
import "server-only";
import {embedText} from "@/lib/vector/embed";
import {cosine,is384Vector} from "./topic-memory-index.server";
import type {TopicStateRow} from "@/lib/persistence/read";
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
export function historicalProblems(json:unknown):string[]{
 const data=obj(json);const all:unknown[]=[data.root_problem,data.diagnosed_root_problem,data.last_root_problem];
 for(const e of Array.isArray(data.myway_learning_evidence)?data.myway_learning_evidence:[])all.push(obj(e).root_problem);
 return [...new Set(all.filter((x):x is string=>typeof x==="string"&&x.trim().length>=15&&x.length<=500).map(x=>x.trim()))].slice(-4);
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
