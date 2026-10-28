/** D.2A: sandbox retrieval is read-only unless a one-time explicit approved commit operation is supplied. */
import { NextResponse } from "next/server";
import { querySemanticTopicCandidatesWithEmbedding } from "@/lib/vector/query-topics";
import { getLatestTopicState } from "@/lib/persistence/read";
import { compareTopicMemory, unavailableMemoryPreview, type MemoryRetrievalStatus } from "@/sandbox/probe-lab/learning-space/topic-memory-preview";
import { issueApproval, memoryDigest, consumeApproval, issueReview, consumeReview } from "@/sandbox/probe-lab/learning-space/topic-memory-approval.server";
import { rootSemanticMatches } from "@/sandbox/probe-lab/learning-space/root-problem-compare.server";
import { validateReviewedAssociation } from "@/sandbox/probe-lab/learning-space/verifier-association-policy";
import { observationIsValid, saveIndependentObservation } from "@/sandbox/probe-lab/learning-space/score-observations.server";
import { isRubricScore } from "@/sandbox/probe-lab/learning-space/topic-memory-scores";
import { commitTopicMemory, repairApprovedTopicIndex, CommitRefused } from "@/sandbox/probe-lab/learning-space/topic-memory-commit.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Step={label:string;durationMs:number;status:"ok"|"failed"|"fallback"|"skipped"};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store","X-MyWay-Mode":"no-state-writes"}});
const ms=(n:number)=>Math.max(0,Math.round(n));
const allowed=new Set(["localhost:3001","127.0.0.1:3001"]);
// Read-only in-process label cache. Never holds learner text or embeddings.
let labelCache:{topic_id:string;topic_label:string}[]|null=null;
let labelCacheAt=0;
let labelInflight:Promise<{topic_id:string;topic_label:string}[]>|null=null;
const LABEL_TTL_MS=60_000;
async function readCachedLabels(){
 if(labelCache&&Date.now()-labelCacheAt<LABEL_TTL_MS)return {rows:labelCache,source:"cache" as const};
 if(!labelInflight){
  labelInflight=getLatestTopicState().then(rows=>rows.map(r=>({topic_id:r.topic_id,topic_label:r.topic_label||""})))
   .then(rows=>{labelCache=rows;labelCacheAt=Date.now();return rows;})
   .finally(()=>{labelInflight=null;});
 }
 return {rows:await labelInflight,source:"supabase" as const};
}
const ignored=new Set(["the","and","for","with","that","this","about","what","how","why","are","does","from","would","should","could","have","when","only","into","isnt","dont","understand","because"]);
const tokenize=(x:string)=>[...new Set((x.toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(t=>!ignored.has(t)))];
export async function POST(request:Request){
 // Do not compare request.url to Origin: Next may rewrite its internal URL. Instead enforce
 // the client-visible Host + Origin, which the existing proxy also enforces independently.
 const host=request.headers.get("host")?.toLowerCase()||"";
 if(process.env.NODE_ENV!=="development"||!allowed.has(host))return json({error:"Local-only retrieval: expected localhost/127.0.0.1 on port 3001"},403);
 const origin=request.headers.get("origin");
 if(origin){let parsed:URL;try{parsed=new URL(origin);}catch{return json({error:"Malformed Origin"},403);}
  if(parsed.protocol!=="http:"||!allowed.has(parsed.host.toLowerCase())||parsed.username||parsed.password)return json({error:"Non-loopback Origin rejected"},403);
 }
 if(!request.headers.get("content-type")?.includes("application/json"))return json({error:"JSON required"},415);
 if(Number(request.headers.get("content-length")||0)>8000)return json({error:"Oversized request"},413);
 let body:unknown;try{body=await request.json();}catch{return json({error:"Malformed JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"Object required"},400);
 const x=body as Record<string,unknown>;
 // The existing proxy permits only this sandbox route. Commit is a separate,
 // tightly validated operation within it, NOT a new unguarded API endpoint.
 if(x.operation === "record_scored_observation"){
  const ownOrigin=`http://${host}`;
  if(origin!==ownOrigin||request.headers.get("x-myway-approval")!=="v37d2c2-observation"||
     request.headers.get("x-myway-observation-consent")!=="session-opt-in"||!observationIsValid(x))
    return json({error:"Explicit session opt-in and validated score observation required",code:"observation_guard"},403);
  try{return NextResponse.json(await saveIndependentObservation(x),{headers:{"Cache-Control":"no-store","X-MyWay-Mode":"sandbox-observation-only"}});}
  catch{return json({error:"Observation table unavailable or write refused. Apply the sandbox-only SQL migration, or leave observation saving off.",code:"observation_unavailable"},409);}
 }
 if(x.operation === "approve_verifier_existing"){
  const ownOrigin=`http://${host}`;
  if(origin!==ownOrigin||request.headers.get("x-myway-approval")!=="v37d2c2-human-review"||
     x.approvalPhrase!=="I_REVIEWED_AND_APPROVE_EXISTING_TOPIC_ASSOCIATION"||
     typeof x.reviewToken!=="string"||typeof x.targetTopicId!=="string"||
     !["same_topic_same_difficulty","same_topic_new_difficulty"].includes(String(x.relation))||
     Object.keys(x).sort().join("|")!==["operation","approvalPhrase","reviewToken","targetTopicId","relation"].sort().join("|"))
    return json({error:"Explicit manual verifier review required",code:"review_guard"},403);
  const preview=consumeReview(x.reviewToken);
  if(!preview)return json({error:"Review preview expired or already used. Run a new learning turn.",code:"review_expired"},409);
  const validated=validateReviewedAssociation(preview.preview,String(x.targetTopicId),String(x.relation),preview.rootConfidence);
  if(!validated.ok)
    return json({error:"Existing topic lacks supported semantic evidence; manual association refused",code:"review_evidence_insufficient"},409);
  const approved={...preview,preview:{...preview.preview,action:"associate_existing" as const,
    targetTopicId:String(x.targetTopicId),reasonCode:"model_verifier_manual_review",autoEligible:false}};
  try{return NextResponse.json(await commitTopicMemory(approved),{headers:{"Cache-Control":"no-store","X-MyWay-Mode":"manual-reviewed-verifier-association"}});}
  catch(error){const code=error instanceof CommitRefused?error.code:"unexpected_failure";
    return json({error:error instanceof CommitRefused?error.message:"Review association failed",code},409);}
 }
 if(x.operation === "repair_approved_topic_index"){
  const ownOrigin=`http://${host}`;
  if(origin!==ownOrigin || request.headers.get("x-myway-approval")!=="v37d2b-repair" ||
     x.approvalPhrase!=="I_APPROVE_ONE_TOPIC_INDEX_REPAIR" ||typeof x.topicId!=="string" ||
     Object.keys(x).sort().join("|")!==["approvalPhrase","topicId","operation"].sort().join("|"))
    return json({error:"Explicit same-origin single-topic repair confirmation required",code:"repair_guard"},403);
  try {const result=await repairApprovedTopicIndex(x.topicId);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store","X-MyWay-Mode":"approved-sandbox-index-repair"}});
  }catch(error){const code=error instanceof CommitRefused?error.code:"unexpected_failure";
    console.warn("V3.7D.2B index repair stopped",code);
    return json({error:error instanceof CommitRefused?error.message:"Repair failed. Inspect server logs.",code},409);}
 }
 if(x.operation === "auto_associate_existing"){
  const ownOrigin=`http://${host}`;
  if(origin!==ownOrigin||request.headers.get("x-myway-approval")!=="v37d2c-auto"||
     x.approvalPhrase!=="I_ENABLED_AUTO_ASSOCIATION_THIS_SESSION"||typeof x.approvalToken!=="string"||
     Object.keys(x).sort().join("|")!==["operation","approvalToken","approvalPhrase"].sort().join("|"))
   return json({error:"Session opt-in and same-origin automatic association required",code:"auto_guard"},403);
  const p=consumeApproval(x.approvalToken);
  if(!p)return json({error:"Auto-association capability expired or already used",code:"auto_expired"},409);
  if(p.preview.action!=="associate_existing"||p.preview.reasonCode!=="semantic_root_problem_match"||
     p.preview.autoEligible!==true||!p.preview.targetTopicId||p.preview.retrievalStatus!=="semantic_pgvector"||
     p.rootProblem.length<15||(p.preview.candidates.find(c=>c.topicId===p.preview.targetTopicId)?.rootProblemSemanticSimilarity??-1)<0.90)
   return json({error:"Match does not meet automatic association requirements",code:"auto_not_eligible"},403);
  try{const result=await commitTopicMemory(p);
   return NextResponse.json(result,{headers:{"Cache-Control":"no-store","X-MyWay-Mode":"sandbox-auto-association"}});
  }catch(error){const code=error instanceof CommitRefused?error.code:"unexpected_failure";
   console.warn("V3.7D.2C automatic association refused",code);
   return json({error:error instanceof CommitRefused?error.message:"Automatic association failed; inspect logs.",code},409);}
 }
 if(x.operation === "commit_topic_memory"){
  const ownOrigin=`http://${host}`;
  if(origin!==ownOrigin || request.headers.get("x-myway-approval")!=="v37d2a" ||
     x.approvalPhrase!=="I_APPROVE_ONE_TOPIC_MEMORY_WRITE" ||
     typeof x.approvalToken!=="string" || Object.keys(x).sort().join("|")!==
       ["approvalPhrase","approvalToken","operation"].sort().join("|")){
   return json({error:"Explicit same-origin memory approval required",code:"approval_guard"},403);
  }
  const approved=consumeApproval(x.approvalToken);
  if(!approved)return json({error:"Approval expired, already used, or not recognized. Run another learning turn.",code:"approval_expired"},409);
  try{
   const result=await commitTopicMemory(approved);
   return NextResponse.json(result,{headers:{"Cache-Control":"no-store","X-MyWay-Mode":"approved-sandbox-memory-write"}});
  }catch(error){
   const code=error instanceof CommitRefused?error.code:"unexpected_failure";
   console.warn("V3.7D.2A approved memory commit stopped",code);
   return json({error:error instanceof CommitRefused?error.message:"Approved write failed. Review local server logs.",code},409);
  }
 }
 if(x.operation!==undefined)return json({error:"Unknown operation"},400);
 if(typeof x.message!=="string"||typeof x.topicName!=="string"||x.message.length>2500||x.topicName.length>110||!x.message.trim())return json({error:"Invalid query"},400);
 if(x.searchText!==undefined && (typeof x.searchText!=="string" || x.searchText.length>1500 || !x.searchText.trim()))return json({error:"Invalid contextual search text"},400);
 const embeddingQuery=typeof x.searchText==="string"?x.searchText:x.message as string;
 const queryMode=typeof x.searchText==="string"?"assessment_and_full_learner_context":"latest_message_only";
 // D.1 accepts validated learner evidence only for a read-only preview; no write authority.
 const hasMemoryRequest=typeof x.rootProblem==="string" && typeof x.evidenceQuote==="string" &&
  typeof x.originalMessage==="string" && typeof x.rootConfidence==="number" && isRubricScore(x.confusion) && isRubricScore(x.insight);
 if(hasMemoryRequest && (x.rootProblem as string).length>900) return json({error:"Root problem too long"},400);
 if(hasMemoryRequest && ((x.evidenceQuote as string).length>500 || (x.originalMessage as string).length>2500 ||
    !Number.isFinite(x.rootConfidence as number) || (x.rootConfidence as number)<0 || (x.rootConfidence as number)>1))return json({error:"Invalid memory preview evidence"},400);
 const began=performance.now();const serverTimings:Step[]=[];
 const stage=async<T>(label:string,operation:()=>Promise<T>):Promise<T>=>{
  const start=performance.now();try{const value=await operation();serverTimings.push({label,durationMs:ms(performance.now()-start),status:"ok"});return value;}
  catch(e){serverTimings.push({label,durationMs:ms(performance.now()-start),status:"failed"});throw e;}
 };
 // Embed the memory preview in the EXISTING guarded endpoint; no new route or permission.
 const withMemory=async(status:MemoryRetrievalStatus,matches:Array<{topicId:string;topicLabel:string;similarity:number}>,
  response:Record<string,unknown>)=>{
   if(!hasMemoryRequest)return response;
   if(status==="unavailable")return {...response,topicMemory:unavailableMemoryPreview("retrieval unavailable")};
   try{
    const rows=await stage("Sandbox topic memory SELECT (read only)",()=>getLatestTopicState());
    let semanticProblems:Record<string,number>={};
    if(status==="semantic_pgvector"){
     try{semanticProblems=await stage("Local difficulty-to-difficulty embedding comparison",()=>
       rootSemanticMatches(x.rootProblem as string,rows,matches));}
     catch{serverTimings.push({label:"Root-problem comparison unavailable; conservative decision",durationMs:0,status:"fallback"});}
    }
    const topicMemory=compareTopicMemory({retrievalStatus:status,matches,rows,rootSemanticMatches:semanticProblems,
     confusion:x.confusion as number,insight:x.insight as number,
     topicName:x.topicName as string,rootProblem:x.rootProblem as string,evidenceQuote:x.evidenceQuote as string,
     originalMessage:x.originalMessage as string,currentMessage:x.message as string,rootConfidence:x.rootConfidence as number});
    const review= {preview:topicMemory,topicName:x.topicName as string,rootProblem:x.rootProblem as string,evidenceQuote:x.evidenceQuote as string,originalMessage:x.originalMessage as string,currentMessage:x.message as string,rootConfidence:x.rootConfidence as number,confusion:x.confusion as number,insight:x.insight as number,snapshotDigest:memoryDigest(rows)};
    const reviewToken=issueReview(review);
    const approvalToken=issueApproval({preview:topicMemory,topicName:x.topicName as string,
     rootProblem:x.rootProblem as string,evidenceQuote:x.evidenceQuote as string,
     originalMessage:x.originalMessage as string,currentMessage:x.message as string,
     rootConfidence:x.rootConfidence as number,confusion:x.confusion as number,insight:x.insight as number,snapshotDigest:memoryDigest(rows)});
    return {...response,topicMemory:{...topicMemory,approvalToken,reviewToken}};
   }catch{
    serverTimings.push({label:"Sandbox topic memory unavailable; proposal held",durationMs:0,status:"fallback"});
    return {...response,topicMemory:unavailableMemoryPreview("read failed")};
   }
 };
 // The sandbox env pin is independently enforced by lib/supabase/server.ts.
 // Reject unexpected backend modes before touching the DB.
 if(process.env.MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"||process.env.MYWAY_TOPIC_VECTOR_BACKEND!=="supabase"){
  return json({status:"unavailable",matches:[],model:null,warning:"Sandbox Supabase runtime pin missing.",reasonCode:"runtime_pin_missing",durationMs:ms(performance.now()-began),serverTimings},503);
 }
 let semanticReason="Embedding service not configured (skipped unnecessary semantic request).";
 let code="service_not_configured";
 const service=process.env.EMBEDDINGS_URL;
 if(service){
  try{
   const target=new URL(service);
   if(target.protocol!=="http:"||!new Set(["127.0.0.1","localhost","[::1]"]).has(target.hostname))throw Error("Embedding service must be local HTTP loopback");
   // Existing semantic adapter packages embedding inference + pgvector query as one operation.
   // We report the combined duration rather than inventing a split.
   const semantic=await stage("Local embedding + pgvector query (combined)",()=>querySemanticTopicCandidatesWithEmbedding(embeddingQuery,5));
   if(!semantic.messageEmbedding||semantic.debug?.metadata.skipped_reason)throw Error("No compatible 384-D embedding from local service");
   const matches=semantic.candidates.map(y=>({topicId:y.topic_id,topicLabel:y.topic_label,similarity:y.similarity}));
   const result=await withMemory("semantic_pgvector",matches,{status:"semantic_pgvector",matches,
    model:semantic.embeddingModel,warning:null,reasonCode:"semantic_ok",queryMode});
   return json({...result,durationMs:ms(performance.now()-began),serverTimings});
  }catch(e){code="semantic_failed";semanticReason=`Semantic retrieval unavailable: ${e instanceof Error?e.message:"unknown error"}`.slice(0,160);}
 }else serverTimings.push({label:"Semantic query skipped (EMBEDDINGS_URL unset)",durationMs:0,status:"skipped"});
 try{
  const cached=Boolean(labelCache&&Date.now()-labelCacheAt<LABEL_TTL_MS);
  const loaded=await stage(cached?"Sandbox topic label cache (60s; no SELECT)":"Sandbox Supabase topic SELECT",()=>readCachedLabels());
  const rows=loaded.rows;
  const labelTokens=tokenize(x.topicName as string);
  const messageTokens=tokenize(embeddingQuery);
  const keys=new Set([...labelTokens,...messageTokens]);
  const query=(x.topicName as string).toLowerCase().trim();
  const scored=await stage("Local lexical ranking (NOT semantic)",async()=>rows.map(r=>{
   const label=r.topic_label||"";const words=tokenize(label);
   const score=label.toLowerCase()===query?100:words.reduce((acc,t)=>acc+(labelTokens.includes(t)?3:messageTokens.includes(t)?1:0),0);
   return {topicId:r.topic_id,topicLabel:label,score};
  }).filter(r=>r.score>0&&keys.size>0).sort((a,b)=>b.score-a.score||a.topicLabel.localeCompare(b.topicLabel)).slice(0,5));
  serverTimings.push({label:"Lexical fallback (no embedding similarity)",durationMs:0,status:"fallback"});
  const matches=scored.map(c=>({topicId:c.topicId,topicLabel:c.topicLabel,similarity:0}));
  const result=await withMemory("lexical_fallback",matches,{status:"lexical_fallback",matches,model:null,
   warning:`${semanticReason} Using lexical label overlap only, not vector similarity.`,reasonCode:code,queryMode});
  return json({...result,durationMs:ms(performance.now()-began),serverTimings});
 }catch{
  return json({status:"unavailable",matches:[],model:null,warning:"Both semantic and lexical topic retrieval unavailable.",reasonCode:"sandbox_select_failed",durationMs:ms(performance.now()-began),serverTimings});
 }
}
