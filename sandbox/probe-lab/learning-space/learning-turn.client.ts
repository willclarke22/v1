"use client";
import {VERIFIER_FORMAT,VERIFIER_SYSTEM_PROMPT,VERIFIER_SCHEMA,verifierInput,parseVerifier,type VerifierDecision} from "./topic-association-verifier";
import type { TopicMemoryPreview } from "./topic-memory-preview";
import { calculateTurnCost } from "@/sandbox/probe-lab/local-assessment/model-token-usage";
/** V3.7C.3 measured, read-only browser learning-turn orchestrator. No learning-state writes. */
import { requestOpenAIAssessment } from "@/sandbox/probe-lab/local-assessment/cloud-assessment-client";
import { requestOpenAITeaching } from "@/sandbox/probe-lab/local-assessment/cloud-teaching-client";
import {requestGLM, type GLMUsage} from "./glm-client";
import {COMPACT_TEACHING_FORMAT,COMPACT_TEACH_SCHEMA,COMPACT_TEACH_SYSTEM_PROMPT,compactTeachingInput,validateCompactTeaching} from "@/sandbox/probe-lab/local-assessment/compact-teaching";
import type {TeachingPlan} from "@/sandbox/probe-lab/local-assessment/learning-plan";
import { buildVisualHandoff, type VisualHandoff } from "@/sandbox/probe-lab/local-assessment/visual-handoff";
import { ASSESSMENT_SCHEMA, ASSESSMENT_SYSTEM_PROMPT, buildUserPrompt, validateAssessment, resolveAssessmentRoute, type Assessment, type ClarificationContext, type Resolution } from "./assessment-core";

export type Provider = "edge" | "openai" | "glm";
export type ModelChoice = "edge" | "openai:gpt-4o-mini" | "openai:gpt-4.1-mini" |
  "glm:glm-5.3" | "glm:glm-5.3-flash" | "glm:glm-5.3-flashx";
export const MODEL_CHOICES: ReadonlyArray<{value:ModelChoice;label:string}> = [
 {value:"edge",label:"Edge Dev (on-device)"},
 {value:"openai:gpt-4o-mini",label:"OpenAI · GPT-4o mini"},
 {value:"openai:gpt-4.1-mini",label:"OpenAI · GPT-4.1 mini"},
 {value:"glm:glm-5.3",label:"GLM-5.3 (configured backend)"},
 {value:"glm:glm-5.3-flash",label:"GLM-5.3 Flash (configured backend)"},
 {value:"glm:glm-5.3-flashx",label:"GLM-5.3 FlashX (if backend supports)"},
];
export const providerForChoice=(choice:ModelChoice):Provider => choice==="edge"?"edge":choice.startsWith("openai:")?"openai":"glm";
export const modelForChoice=(choice:ModelChoice):string|undefined => choice==="edge"?undefined:choice.split(":")[1];
export type StepStatus = "ok" | "failed" | "skipped" | "fallback";
export type TimingStep = { id: string; stage: "assessment" | "retrieval" | "verifier" | "teaching" | "handoff" | "other";
 label: string; status: StepStatus; durationMs: number; startOffsetMs: number; detail?: string };
export type ServerTimingStep = { label: string; durationMs: number; status: StepStatus };
export type RetrievalResult = { status: "semantic_pgvector" | "lexical_fallback" | "unavailable";
 matches: Array<{topicId:string;topicLabel:string;similarity:number}>; warning:string|null;model:string|null;
 durationMs:number; serverTimings?:ServerTimingStep[]; reasonCode?:string; queryMode?:string; topicMemory?:TopicMemoryPreview };
export type TurnTrace = {
 schema:"myway-v37c2-turn-trace-v1";id:string;timestamp:string;message:string;assessmentProvider:Provider;teachingProvider:Provider; assessmentChoice?:ModelChoice; teachingChoice?:ModelChoice; verifierChoice?:ModelChoice; verifierProvider?:Provider; verifierModel?:string|null; verifier?:{status:"complete"|"skipped"|"error";decision:VerifierDecision|null;error:string|null;durationMs:number;promptChars:number;outputChars:number;usage?:GLMUsage};
 observationSave?:{status:"recorded"|"duplicate"|"withheld"|"error";eventId?:string;detail?:string;topicId?:string|null};
 assessmentModel:string|null;assessment:Assessment|null;resolution:Resolution|null;warnings:string[];
 retrieval:RetrievalResult|null;topicMemory?:TopicMemoryPreview|null;teaching:TeachingPlan|null;teachingModel:string|null;handoff:VisualHandoff|null;
 status:"assessing"|"clarify"|"retrieving"|"teaching"|"complete"|"unresolved"|"error";
 reply:string;error:string|null;
 timings:{assessmentMs:number|null;retrievalMs:number|null;verifierMs?:number|null;teachingMs:number|null;totalMs:number|null};
 io?:{verifier?:{promptChars:number;outputChars:number;usage?:GLMUsage;providerMs?:number};assessment?:{promptChars:number;outputChars:number;usage?:GLMUsage;providerMs?:number};
  teaching?:{promptChars:number;outputChars:number;usage?:GLMUsage;providerMs?:number}};
 steps?:TimingStep[]; failedStage?:"assessment"|"retrieval"|"verifier"|"teaching"|"handoff"|null; diagnosticVersion?:"v37c22"|"v37c23";
};
export const TRACE_KEY="myway-v37c2-last-turn";
export const CLARIFICATION_KEY="myway-v37c2-clarification";
export const METRICS_KEY="myway-v37c22-metric-history";
export type MetricRow = {id:string;timestamp:string;assessmentProvider:Provider;teachingProvider:Provider;status:string;
 totalMs:number;assessmentMs:number|null;retrievalMs:number|null;teachingMs:number|null;failedStage:string|null;
 assessmentModel?:string|null;teachingModel?:string|null;assessmentOutputChars?:number;teachingOutputChars?:number;
 assessmentTokens?:number|null;teachingTokens?:number|null;verifierTokens?:number|null;costUsd?:number|null;knownCostSubtotalUsd?:number|null;costComplete?:boolean};
export function saveMetricRow(trace:TurnTrace){
 if(trace.timings.totalMs===null)return;
 try{
  const existing=JSON.parse(sessionStorage.getItem(METRICS_KEY)||"[]") as unknown;
  const rows=Array.isArray(existing)?existing.filter(x=>x&&typeof x==="object"&&typeof x.id==="string") as MetricRow[]:[];
  if(rows.some(x=>x.id===trace.id))return;
  const cost=calculateTurnCost(trace);
  const record:MetricRow={id:trace.id,timestamp:trace.timestamp,assessmentProvider:trace.assessmentProvider,
   teachingProvider:trace.teachingProvider,status:trace.status,totalMs:trace.timings.totalMs,
   assessmentMs:trace.timings.assessmentMs,retrievalMs:trace.timings.retrievalMs,
   teachingMs:trace.timings.teachingMs,failedStage:trace.failedStage||null,
   assessmentModel:trace.assessmentModel,teachingModel:trace.teachingModel,
   assessmentOutputChars:trace.io?.assessment?.outputChars,teachingOutputChars:trace.io?.teaching?.outputChars,
   assessmentTokens:trace.io?.assessment?.usage?.totalTokens,teachingTokens:trace.io?.teaching?.usage?.totalTokens,verifierTokens:trace.io?.verifier?.usage?.totalTokens,
   costUsd:cost.totalEstimatedUsd,knownCostSubtotalUsd:cost.knownSubtotalUsd,costComplete:cost.complete};
  // Performance-only history. Deliberately does not retain user messages, profiles, or model output.
  sessionStorage.setItem(METRICS_KEY,JSON.stringify([...rows.slice(-11),record]));
 }catch{/* Storage unavailable is non-fatal. */}
}

type PromptSession={prompt:(input:string,options?:{responseConstraint?:Record<string,unknown>;signal?:AbortSignal})=>Promise<string>;destroy?:()=>void};
type PromptFactory={availability:()=>Promise<string>;create:(opts:{initialPrompts:{role:"system";content:string}[]})=>Promise<PromptSession>};
function modelFactory():PromptFactory|null {
 if(typeof window==="undefined")return null;
 return (window as Window & {LanguageModel?:PromptFactory}).LanguageModel??null;
}
// Cache only availability, never the conversational prompt sessions (cross-turn history would leak).
let availableFactory:PromptFactory|null=null;
let availableCheck:Promise<string>|null=null;
const ms=(x:number)=>Math.max(0,Math.round(x));
type StepRecorder=(stage:TimingStep["stage"],id:string,label:string,work:()=>Promise<unknown>|unknown,detail?:string)=>Promise<unknown>;
async function promptEdge(system:string,user:string,schema:Record<string,unknown>,signal:AbortSignal,
 stage:TimingStep["stage"],run:StepRecorder):Promise<string>{
 const factory=modelFactory();if(!factory)throw new Error("Edge Prompt API unavailable. Open Edge Dev with on-device LanguageModel enabled or explicitly select OpenAI.");
 const avail=await run(stage,`${stage}.availability`,"Edge model availability",async()=>{
  if(availableFactory!==factory){availableFactory=factory;availableCheck=null;}
  const cached=!!availableCheck;
  if(!availableCheck)availableCheck=factory.availability().catch(e=>{availableCheck=null;throw e;});
  const status=await availableCheck;
  if(status==="unavailable"||status==="unsupported")availableCheck=null;
  return {status,cached};
 }) as {status:string;cached:boolean};
 if(avail.status==="unavailable"||avail.status==="unsupported")throw Error(`Edge model availability: ${avail.status}`);
 if(signal.aborted)throw Error("Turn cancelled");
 const session=await run(stage,`${stage}.create`,"Edge session creation",()=>factory.create({initialPrompts:[{role:"system",content:system}]})) as PromptSession;
 try{
  if(signal.aborted)throw Error("Turn cancelled");
  return await run(stage,`${stage}.inference`,"Edge model inference",()=>session.prompt(user,{responseConstraint:schema,signal})) as string;
 }finally{
  // Destruction is timed even on failure. A fresh session protects learner-turn isolation.
  await run(stage,`${stage}.destroy`,"Edge session cleanup",()=>session.destroy?.());
 }
}
type ModelAnswer={raw:string;model:string;promptChars:number;usage?:GLMUsage;providerMs?:number};
async function runAssessment(message:string,context:ClarificationContext|null,provider:Provider,model:string|undefined,signal:AbortSignal,run:StepRecorder):Promise<ModelAnswer>{
 const prompt=buildUserPrompt(message,context);
 const promptChars=prompt.length+ASSESSMENT_SYSTEM_PROMPT.length;
 if(provider==="openai"){
  const result=await run("assessment","assessment.openai","OpenAI request + inference",()=>requestOpenAIAssessment({userPrompt:prompt,
    systemPrompt:ASSESSMENT_SYSTEM_PROMPT,responseSchema:ASSESSMENT_SCHEMA,model,signal})) as Awaited<ReturnType<typeof requestOpenAIAssessment>>;
  return {raw:result.raw,model:result.model,promptChars,usage:result.usage??undefined};
 }
 if(provider==="glm"){
  const result=await run("assessment","assessment.glm","GLM API request + inference",()=>requestGLM({stage:"assessment",userPrompt:prompt,model,signal})) as Awaited<ReturnType<typeof requestGLM>>;
  return {...result,model:`${result.provider.toUpperCase()} / ${result.model}`,promptChars};
 }
 const raw=await promptEdge(ASSESSMENT_SYSTEM_PROMPT,prompt,ASSESSMENT_SCHEMA,signal,"assessment",run);
 return {raw,model:"Edge Prompt API",promptChars};
}
async function runTeaching(assessment:Assessment,provider:Provider,model:string|undefined,learnerMessage:string,context:ClarificationContext|null,signal:AbortSignal,run:StepRecorder){
 const input=compactTeachingInput({topic:assessment.topic_name,root_problem:assessment.root_problem,evidence_quote:assessment.evidence_quote,
  original_statement:context?.originalMessage??learnerMessage,clarification_answer:context?learnerMessage:""});
 const system=COMPACT_TEACH_SYSTEM_PROMPT;
 const promptChars=JSON.stringify(input).length+system.length;
 let answer:ModelAnswer;
 if(provider==="openai"){
  const result=await run("teaching","teaching.openai","OpenAI request + inference",()=>requestOpenAITeaching(input,signal,model,COMPACT_TEACHING_FORMAT)) as Awaited<ReturnType<typeof requestOpenAITeaching>>;
  answer={raw:result.raw,model:result.model,promptChars,usage:result.usage??undefined};
 }else if(provider==="glm"){
  const result=await run("teaching","teaching.glm","GLM API request + inference",()=>requestGLM({stage:"teaching",input,model,signal,format:COMPACT_TEACHING_FORMAT})) as Awaited<ReturnType<typeof requestGLM>>;
  answer={...result,model:`${result.provider.toUpperCase()} / ${result.model}`,promptChars};
 }else{
  const raw=await promptEdge(system,JSON.stringify(input),COMPACT_TEACH_SCHEMA as unknown as Record<string,unknown>,signal,"teaching",run);
  answer={raw,model:"Edge Prompt API",promptChars};
 }
 // Record output sizes even if strict validation rejects the model answer.
 await run("teaching","teaching.output_size","Teaching output received (pre-validation)",()=>null,
   `Prompt ${promptChars.toLocaleString()} characters; output ${answer.raw.length.toLocaleString()} characters`+
   (answer.usage?.totalTokens!=null?`; provider total tokens ${answer.usage.totalTokens}`:"")+
   (answer.providerMs!=null?`; provider duration ${answer.providerMs} ms (nested)`:""));
 const checked=await run("teaching","teaching.validation","Compact teaching validation",()=>validateCompactTeaching(answer.raw)) as ReturnType<typeof validateCompactTeaching>;
 if(!checked.plan)throw Error(checked.error||"Invalid compact teaching response");
 return {plan:checked.plan,model:answer.model,warnings:[] as string[],io:{promptChars,outputChars:answer.raw.length,usage:answer.usage,providerMs:answer.providerMs}};
}
/** Retrieval context is an index query, not learner evidence or a topic-memory write. */
export function buildContextualTopicQuery(topicName:string,rootProblem:string,originalMessage:string,clarificationAnswer:string):string {
 const clean=(value:string,max:number)=>value.replace(/\s+/g," ").trim().slice(0,max);
 return [
  `Topic: ${clean(topicName,100)}`,
  `Learning difficulty: ${clean(rootProblem,440)}`,
  `Original question: ${clean(originalMessage,370)}`,
  clarificationAnswer.trim()?`Clarification: ${clean(clarificationAnswer,200)}`:"",
 ].filter(Boolean).join("\n").slice(0,1450);
}
/** Only tutor-facing prose is presented as a reply; the plan fields remain available for Director. */
export function learnerFacingTeachingReply(strategy:string):string {
 const clean=strategy.trim().replace(/\s+/g," ");
 // Defensive compatibility for older providers that still return planner instructions.
 const stripped=clean.replace(/^(?:explain(?:\s+to\s+the\s+learner)?\s+that|tell\s+the\s+learner\s+that)\s+/i,"");
 return stripped ? stripped[0].toUpperCase()+stripped.slice(1) : clean;
}
async function retrieve(topicName:string,message:string,rootProblem:string,evidenceQuote:string,rootConfidence:number,originalMessage:string,confusion:number,insight:number,signal:AbortSignal):Promise<RetrievalResult & {topicMemory?:TopicMemoryPreview}>{
 const response=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
  method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({topicName,message,searchText:buildContextualTopicQuery(topicName,rootProblem,originalMessage,originalMessage===message?"":message),rootProblem,evidenceQuote,rootConfidence,originalMessage,confusion,insight})});
 if(!response.ok){
  // Show route gate vs local-origin vs server failure without leaking credentials.
  const raw=(await response.text().catch(()=>"" )).slice(0,450);
  let explanation=raw;
  try{const parsed=JSON.parse(raw) as {error?:string};if(parsed.error)explanation=parsed.error;}catch{}
  throw Error(`Retrieval HTTP ${response.status}${explanation?`: ${explanation.replace(/\s+/g," ").slice(0,140)}`:""}`);
 }
 const body=await response.json() as RetrievalResult & {topicMemory?:TopicMemoryPreview};
 if(!["semantic_pgvector","lexical_fallback","unavailable"].includes(body.status)||!Array.isArray(body.matches))throw Error("Unexpected retrieval response");
 return body;
}
export async function executeLearningTurn(args:{message:string;context:ClarificationContext|null;assessmentChoice:ModelChoice;teachingChoice:ModelChoice;verifierChoice:ModelChoice;
 signal:AbortSignal;onStage:(trace:TurnTrace)=>void}):Promise<{trace:TurnTrace;nextClarification:ClarificationContext|null}>{
 const {message,context,assessmentChoice,teachingChoice,verifierChoice,signal,onStage}=args;
 const assessmentProvider=providerForChoice(assessmentChoice),teachingProvider=providerForChoice(teachingChoice);
 const began=performance.now();let currentStage:TimingStep["stage"]="assessment";
 const trace:TurnTrace={schema:"myway-v37c2-turn-trace-v1",diagnosticVersion:"v37c23",id:crypto.randomUUID(),timestamp:new Date().toISOString(),message,
  assessmentProvider,teachingProvider,assessmentChoice,teachingChoice,verifierChoice,verifierProvider:providerForChoice(verifierChoice),verifierModel:null,assessmentModel:null,assessment:null,resolution:null,warnings:[],retrieval:null,teaching:null,
  teachingModel:null,handoff:null,topicMemory:null,status:"assessing",reply:"Assessing the learner's statement...",error:null,failedStage:null,
  timings:{assessmentMs:null,retrievalMs:null,verifierMs:null,teachingMs:null,totalMs:null},steps:[],io:{}};
 const notify=()=>onStage({...trace,timings:{...trace.timings},steps:trace.steps?.map(s=>({...s}))});
 const run:StepRecorder=async(stage,id,label,work,detail)=>{
  const start=performance.now();const offset=ms(start-began);
  try {
   const value=await work();
   trace.steps!.push({stage,id,label,status:"ok",durationMs:ms(performance.now()-start),startOffsetMs:offset,detail});
   return value;
  }catch(e){
   trace.steps!.push({stage,id,label,status:"failed",durationMs:ms(performance.now()-start),startOffsetMs:offset,
    detail:(e instanceof Error?e.message:String(e)).slice(0,180)});
   throw e;
  }
 };
 const finish=()=>{trace.timings.totalMs=ms(performance.now()-began);notify();};
 notify();
 try{
  const assessmentStart=performance.now();
  let answer:Awaited<ReturnType<typeof runAssessment>>;
  try{
   answer=await runAssessment(message,context,assessmentProvider,modelForChoice(assessmentChoice),signal,run);
   trace.assessmentModel=answer.model;
   trace.io!.assessment={promptChars:answer.promptChars,outputChars:answer.raw.length,usage:answer.usage,providerMs:answer.providerMs};
   const u=answer.usage;
   trace.steps!.push({stage:"assessment",id:"assessment.io",label:"Assessment model I/O",status:"ok",durationMs:0,startOffsetMs:ms(performance.now()-began),
    detail:`Prompt ${answer.promptChars.toLocaleString()} characters; output ${answer.raw.length.toLocaleString()} characters`+
      (u?.totalTokens!=null?`; provider tokens: input ${u.promptTokens??"?"}, output ${u.completionTokens??"?"}, total ${u.totalTokens}`:"; token counts not available")+
      (answer.providerMs!=null?`; provider duration ${answer.providerMs} ms (nested in model request)`:"")});
   const evidence=context?[context.originalMessage,message]:[message];
   const parsed=await run("assessment","assessment.validation","Assessment validation and evidence checks",()=>validateAssessment(answer.raw,evidence)) as ReturnType<typeof validateAssessment>;
   if(!parsed.assessment)throw Error(parsed.error||"Invalid assessment result");
   trace.assessment=parsed.assessment;trace.warnings=parsed.warnings??[];
   trace.resolution=resolveAssessmentRoute(parsed.assessment,context,0.65);
  }finally{trace.timings.assessmentMs=ms(performance.now()-assessmentStart);}
  const assessment=trace.assessment!;
  if(trace.resolution==="clarify"){
   trace.status="clarify";trace.reply=assessment.clarifying_question.trim()||"Which part feels difficult?";
   finish();return {trace,nextClarification:{originalMessage:context?`${context.originalMessage}\n${message}`:message,question:trace.reply,depth:1}};
  }
  if(trace.resolution==="unresolved"||!assessment.root_problem.trim()){
   trace.status="unresolved";trace.reply="I don't have enough evidence to identify the learning difficulty yet. Please describe what part feels difficult.";
   finish();return {trace,nextClarification:null};
  }
  trace.status="retrieving";currentStage="retrieval";trace.reply="Checking related concepts in your experimental topic library...";notify();
  const rs=performance.now();
  try{
   trace.retrieval=await run("retrieval","retrieval.http","Browser retrieval + topic memory preview (includes server)",()=>retrieve(assessment.topic_name,message,assessment.root_problem,assessment.evidence_quote,assessment.root_problem_confidence,context?.originalMessage??message,assessment.confusion,assessment.insight,signal)) as RetrievalResult & {topicMemory?:TopicMemoryPreview};
   trace.topicMemory=trace.retrieval.topicMemory??null;
  }catch(error){
   if(signal.aborted)throw error;
   trace.retrieval={status:"unavailable",matches:[],warning:error instanceof Error?error.message:"Retrieval failed",model:null,durationMs:0,reasonCode:"http_or_network_failed"};
   trace.warnings.push(trace.retrieval.warning ?? "Retrieval failed");
   trace.topicMemory={schema:"myway-v37d1-memory-preview-v1",mode:"read_only",action:"hold",targetTopicId:null,reasonCode:"retrieval_unavailable",rationale:"Retrieval failed; topic memory cannot be evaluated. No topic changes are proposed.",retrievalStatus:"unavailable",candidateCount:0,candidates:[],limitations:["Retrieval failures cannot justify creating a new topic."]};
   trace.steps!.push({stage:"retrieval",id:"retrieval.fallback",label:"Retrieval unavailable (continue without related topics)",status:"fallback",durationMs:0,startOffsetMs:ms(performance.now()-began)});
  }finally{trace.timings.retrievalMs=ms(performance.now()-rs);}
  if(trace.retrieval?.warning&&!trace.warnings.includes(trace.retrieval.warning))trace.warnings.push(trace.retrieval.warning ?? "Retrieval failed");
  if(trace.topicMemory?.reasonCode === "memory_read_unavailable")trace.warnings.push("Topic memory unavailable: proposal held; no state writes.");
  if(trace.retrieval?.serverTimings?.length){
   // Server breakdown is a child of the HTTP request; do NOT sum these into total latency.
   for(const sub of trace.retrieval.serverTimings){
    trace.steps!.push({stage:"retrieval",id:`retrieval.server.${trace.steps!.length}`,label:`Server: ${sub.label}`,
     status:sub.status,durationMs:sub.durationMs,startOffsetMs:ms(rs-began),detail:"Nested server duration, overlaps browser retrieval request"});
   }
  }
  // V3.7D.2C.1 shadow-only semantic verifier. Its opinion MUST NOT mutate
  // topicMemory, approval tokens, autoEligible, or the authorized write target.
  currentStage="verifier";
  const vs=performance.now();
  try {
   const candidates=trace.topicMemory?.candidates??[];
   if(trace.retrieval?.status!=="semantic_pgvector"||!candidates.length){
     trace.verifier={status:"skipped",decision:null,error:"No reliable semantic candidates; cannot verify association.",durationMs:0,promptChars:0,outputChars:0};
   }else{
     const input=verifierInput({topicName:assessment.topic_name,rootProblem:assessment.root_problem,
       originalStatement:context?.originalMessage??message,clarification:context?message:"",
       candidates:candidates.slice(0,3).map(c=>({topicId:c.topicId,topicLabel:c.topicLabel,
         topicSimilarity:c.similarity,difficultySimilarity:c.rootProblemSemanticSimilarity,
         storedRootProblems:c.storedRootProblems}))});
     const provider=providerForChoice(verifierChoice),model=modelForChoice(verifierChoice);
     let answer:ModelAnswer;
     if(provider==="openai"){
       const raw=await run("verifier","verifier.openai","Semantic verifier (OpenAI; shadow only)",async()=>{
         const response=await fetch("/api/sandbox/probe-lab/local-assessment/teaching",{method:"POST",cache:"no-store",signal,
           headers:{"Content-Type":"application/json"},body:JSON.stringify({format:VERIFIER_FORMAT,context:input,model})});
         const data=await response.json() as {raw?:string;model?:string;usage?:GLMUsage;error?:string};
         if(!response.ok||typeof data.raw!=="string")throw Error(data.error??`Verifier HTTP ${response.status}`);
         return data;
       }) as {raw:string;model?:string;usage?:GLMUsage};
       answer={raw:raw.raw,model:raw.model??model??"OpenAI",promptChars:VERIFIER_SYSTEM_PROMPT.length+JSON.stringify(input).length,usage:raw.usage};
     }else if(provider==="glm"){
       const response=await run("verifier","verifier.glm","Semantic verifier (GLM; shadow only)",()=>requestGLM({stage:"verifier",input,model,format:VERIFIER_FORMAT,signal})) as Awaited<ReturnType<typeof requestGLM>>;
       answer={raw:response.raw,model:`${response.provider.toUpperCase()} / ${response.model}`,promptChars:VERIFIER_SYSTEM_PROMPT.length+JSON.stringify(input).length,usage:response.usage,providerMs:response.providerMs};
     }else{
       const raw=await promptEdge(VERIFIER_SYSTEM_PROMPT,JSON.stringify(input),VERIFIER_SCHEMA as unknown as Record<string,unknown>,signal,"verifier",run);
       answer={raw,model:"Edge Prompt API",promptChars:VERIFIER_SYSTEM_PROMPT.length+JSON.stringify(input).length};
     }
     const validated=parseVerifier(answer.raw,input);
     trace.verifierModel=answer.model;
     trace.io!.verifier={promptChars:answer.promptChars,outputChars:answer.raw.length,usage:answer.usage,providerMs:answer.providerMs};
     trace.verifier={status:validated.decision?"complete":"error",decision:validated.decision,error:validated.error,
       durationMs:ms(performance.now()-vs),promptChars:answer.promptChars,outputChars:answer.raw.length,usage:answer.usage};
   }
  }catch(error){
    if(signal.aborted)throw error;
    trace.verifier={status:"error",decision:null,error:(error instanceof Error?error.message:"Verifier failed").slice(0,180),
      durationMs:ms(performance.now()-vs),promptChars:0,outputChars:0};
    trace.warnings.push("Semantic verifier unavailable; deterministic topic-memory safeguards unchanged.");
  }finally{trace.timings.verifierMs=ms(performance.now()-vs);}
  trace.status="teaching";currentStage="teaching";trace.reply="Preparing a teaching approach...";notify();
  const ts=performance.now();let result:Awaited<ReturnType<typeof runTeaching>>;
  try{result=await runTeaching(assessment,teachingProvider,modelForChoice(teachingChoice),message,context,signal,run);
   trace.teaching=result.plan;trace.teachingModel=result.model;trace.warnings.push(...result.warnings);
   trace.io!.teaching=result.io;
   const u=result.io.usage;
   trace.steps!.push({stage:"teaching",id:"teaching.io",label:"Teaching model I/O",status:"ok",durationMs:0,startOffsetMs:ms(performance.now()-began),
    detail:`Prompt ${result.io.promptChars.toLocaleString()} characters; output ${result.io.outputChars.toLocaleString()} characters`+
      (u?.totalTokens!=null?`; provider tokens: input ${u.promptTokens??"?"}, output ${u.completionTokens??"?"}, total ${u.totalTokens}`:"; token counts not available")+
      (result.io.providerMs!=null?`; provider duration ${result.io.providerMs} ms (nested in model request)`:"")});
  }finally{trace.timings.teachingMs=ms(performance.now()-ts);}
  currentStage="handoff";
  const handoff=await run("handoff","handoff.build","Visual handoff construction",()=>buildVisualHandoff({
   learnerMessage:context?`ORIGINAL LEARNER STATEMENT:\n${context.originalMessage}\nCLARIFICATION ANSWER:\n${message}`:message,topic:assessment.topic_name,rootProblem:assessment.root_problem,
   evidenceQuote:assessment.evidence_quote,rootConfidence:assessment.root_problem_confidence,resolution:trace.resolution??"unresolved",
   teaching:result.plan,assessmentProvider,teachingProvider})) as ReturnType<typeof buildVisualHandoff>;
  trace.handoff=handoff.handoff??null;if(handoff.error)trace.warnings.push(handoff.error);
  trace.reply=learnerFacingTeachingReply(result.plan.teaching_strategy);
  trace.status="complete";finish();return {trace,nextClarification:null};
 }catch(error){
  trace.status="error";trace.failedStage=currentStage;
  trace.error=signal.aborted?"The request was stopped.":error instanceof Error?error.message:"Turn failed";
  trace.reply=`Learning turn paused during ${currentStage}: ${trace.error}`;
  finish();return {trace,nextClarification:context};
 }
}
