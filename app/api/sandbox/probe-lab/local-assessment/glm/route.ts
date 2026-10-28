import {VERIFIER_SYSTEM_PROMPT,VERIFIER_SCHEMA,validVerifierInput} from "@/sandbox/probe-lab/learning-space/topic-association-verifier";
/** V3.7C.2.3: isolated GLM inference via Z.ai, OpenRouter, or NVIDIA only. No topic reads or writes; no browser credentials. */
import {COMPACT_TEACHING_FORMAT,COMPACT_TEACH_SCHEMA,COMPACT_TEACH_SYSTEM_PROMPT,validCompactTeachingInput} from "@/sandbox/probe-lab/local-assessment/compact-teaching";
import {ASSESSMENT_SCHEMA, ASSESSMENT_SYSTEM_PROMPT} from "@/sandbox/probe-lab/learning-space/assessment-core";
import {TEACH_SCHEMA, TEACH_SYSTEM_PROMPT} from "@/sandbox/probe-lab/local-assessment/learning-plan";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const ZAI_ENDPOINT="https://api.z.ai/api/paas/v4/chat/completions";
const OPENROUTER_ENDPOINT="https://openrouter.ai/api/v1/chat/completions";
const NVIDIA_ENDPOINT="https://integrate.api.nvidia.com/v1/chat/completions";
const LOCAL_HOSTS=new Set(["127.0.0.1:3001","localhost:3001"]);
const ZAI_MODELS=new Set(["glm-5.3","glm-5.3-flash","glm-5.3-flashx"]);
const ROUTER_MODELS=new Set(["z-ai/glm-5.3","z-ai/glm-5.3-flash","z-ai/glm-5.3-flashx"]);
// IDs confirmed for NVIDIA NIM. Do not assume every Z.ai/OpenRouter variant is hosted.
const NVIDIA_MODELS=new Set(["z-ai/glm-5.3","z-ai/glm-5.3-flash"]);
const TIMEOUT_MS=75_000;
const fail=(status:number,error:string,stage:string)=>Response.json({error,stage},{status,headers:{"Cache-Control":"no-store","X-MyWay-Mode":"no-state-writes"}});
function guard(request:Request):Response|null{
 // Standalone guard (in addition to the global Next proxy) avoids unexpected invocation paths.
 if(process.env.NODE_ENV!=="development")return fail(403,"GLM is available in the experimental development preview only.","access");
 const host=(request.headers.get("host")||"").toLowerCase();
 if(!LOCAL_HOSTS.has(host))return fail(403,"GLM is restricted to the port-3001 loopback server.","access");
 const origin=request.headers.get("origin");
 if(origin){
  try{const url=new URL(origin);if(url.protocol!=="http:"||!LOCAL_HOSTS.has(url.host.toLowerCase())||url.username||url.password)
   return fail(403,"Cross-origin GLM request rejected.","access");}
  catch{return fail(403,"Invalid Origin.","access");}
 }
 if(process.env.MYWAY_EXPERIMENTAL_RUNTIME!=="v37b"||process.env.MYWAY_TOPIC_VECTOR_BACKEND!=="supabase")
  return fail(503,"Experimental runtime/database pin is missing.","configuration");
 return null;
}
function config(){
 const directKey=(process.env.MYWAY_GLM_API_KEY||process.env.ZAI_API_KEY||"").trim();
 const routerKey=(process.env.MYWAY_GLM_OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY||"").trim();
 const nvidiaKey=(process.env.NVIDIA_API_KEY||"").trim();
 const requested=(process.env.MYWAY_GLM_BACKEND||"").trim().toLowerCase();
 if(requested&&!new Set(["zai","openrouter","nvidia"]).has(requested))
  throw Error("MYWAY_GLM_BACKEND must be zai, openrouter, or nvidia.");
 // Prefer explicitly chosen provider; autodetect NVIDIA only if no other GLM keys exist.
 const backend=requested||(directKey?"zai":routerKey?"openrouter":nvidiaKey?"nvidia":"zai");
 const defaultModel=backend==="zai"?"glm-5.3-flash":backend==="nvidia"?"z-ai/glm-5.3":"z-ai/glm-5.3-flash";
 const model=(process.env.MYWAY_GLM_MODEL||defaultModel).trim();
 const allowed=backend==="zai"?ZAI_MODELS:backend==="nvidia"?NVIDIA_MODELS:ROUTER_MODELS;
 if(!allowed.has(model))throw Error("GLM model does not match the approved provider model list.");
 // The NVIDIA endpoint is fixed; do not allow an environment variable to redirect secret-bearing requests.
 const base=(process.env.NVIDIA_BASE_URL||"").trim().replace(/\/$/,"");
 if(backend==="nvidia"&&base&&base!=="https://integrate.api.nvidia.com/v1")
  throw Error("NVIDIA_BASE_URL differs from the fixed NVIDIA API endpoint.");
 const key=backend==="zai"?directKey:backend==="nvidia"?nvidiaKey:routerKey;
 const endpoint=backend==="zai"?ZAI_ENDPOINT:backend==="nvidia"?NVIDIA_ENDPOINT:OPENROUTER_ENDPOINT;
 return {key,model,backend,endpoint};
}
export async function GET(request:Request){
 const blocked=guard(request);if(blocked)return blocked;
 try{const c=config();return Response.json({ready:Boolean(c.key),model:c.model,provider:c.backend,availableModels:Array.from(c.backend==="zai"?ZAI_MODELS:c.backend==="nvidia"?NVIDIA_MODELS:ROUTER_MODELS),reasoningEffort:"low",keyConfigured:Boolean(c.key)},
  {headers:{"Cache-Control":"no-store"}});}
 catch{return fail(503,"Invalid GLM model setting.","configuration");}
}
export async function POST(request:Request){
 const blocked=guard(request);if(blocked)return blocked;
 if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return fail(415,"JSON required.","validation");
 if(Number(request.headers.get("content-length")||0)>12_500)return fail(413,"Request too large.","validation");
 let body:unknown;try{body=await request.json();}catch{return fail(400,"Malformed JSON.","validation");}
 if(!body||typeof body!=="object"||Array.isArray(body))return fail(400,"Expected object.","validation");
 const obj=body as Record<string,unknown>;
 if(!["assessment","teaching","verifier"].includes(String(obj.stage)))return fail(400,"Unknown model stage.","validation");
 const stage=obj.stage as "assessment"|"teaching"|"verifier";
 let user:string;let system:string;
 if(stage==="assessment"){
  if(typeof obj.userPrompt!=="string"||!obj.userPrompt.trim()||obj.userPrompt.length>6500)return fail(400,"Invalid assessment prompt.","validation");
  user=obj.userPrompt;
  system=`${ASSESSMENT_SYSTEM_PROMPT}\nReturn ONLY a JSON object conforming to these fields and types: ${JSON.stringify(ASSESSMENT_SCHEMA)}. Keep text fields concise; no markdown fences.`;
 }else if(stage==="verifier"){
  if(obj.format!=="myway_topic_association_verifier_v1"||!validVerifierInput(obj.input))return fail(400,"Invalid verifier input.","validation");
  user=JSON.stringify(obj.input);
  system=`${VERIFIER_SYSTEM_PROMPT}
Return JSON exactly matching ${JSON.stringify(VERIFIER_SCHEMA)}. No markdown fences.`;
 }else{
  const input=obj.input;
  const compact=obj.format===COMPACT_TEACHING_FORMAT;
  if(obj.format!==undefined&&!compact)return fail(400,"Unrecognized teaching format.","validation");
  if(compact){
   if(!validCompactTeachingInput(input))return fail(400,"Invalid compact teaching input.","validation");
   user=JSON.stringify(input);
   system=`${COMPACT_TEACH_SYSTEM_PROMPT}\nReturn JSON exactly matching ${JSON.stringify(COMPACT_TEACH_SCHEMA)}. No markdown.`;
  }else{
  if(!input||typeof input!=="object"||Array.isArray(input))return fail(400,"Teaching input object required.","validation");
  const t=input as Record<string,unknown>;
  if(typeof t.topic!=="string"||typeof t.root_problem!=="string"||typeof t.evidence_quote!=="string"||
      !t.profile||typeof t.profile!=="object"||Array.isArray(t.profile)||JSON.stringify(input).length>10500)
    return fail(400,"Invalid or oversized teaching input.","validation");
  const p=t.profile as Record<string,unknown>;
  if(!Array.isArray(p.interests)||p.interests.length>5||p.interests.some(x=>typeof x!=="string"||x.length>45))
    return fail(400,"Invalid learner profile.","validation");
  if(typeof t.learner_statement!=="string"||!t.learner_statement.trim()||t.learner_statement.length>2500||
     typeof t.clarification_answer!=="string"||t.clarification_answer.length>2500||
     typeof t.prior_clarifying_question!=="string"||t.prior_clarifying_question.length>400)
    return fail(400,"Missing or oversized original learner context.","validation");
  user=JSON.stringify(input);
  system=`${TEACH_SYSTEM_PROMPT}\nReturn ONLY a JSON object with precisely these fields: ${JSON.stringify(TEACH_SCHEMA)}. If learner interests are empty, use_interest MUST be do_not_use and chosen_interest MUST be empty. Keep each description brief. No markdown fences.`;
  }
 }
 let cfg:ReturnType<typeof config>;try{cfg=config();}catch{return fail(503,"Invalid MYWAY_GLM_BACKEND or incompatible MYWAY_GLM_MODEL. Check experimental settings.","configuration");}
 // Model selection is validated against the server-configured provider (never a client-supplied endpoint).
 const requestedModel = obj.model;
 let selectedModel=cfg.model;
 if(requestedModel!==undefined){
  if(typeof requestedModel!=="string")return fail(422,"Invalid GLM model choice.","validation");
  const canonical=requestedModel.replace(/^z-ai\//,"");
  if(!["glm-5.3","glm-5.3-flash","glm-5.3-flashx"].includes(canonical))return fail(422,"Unsupported GLM model choice.","validation");
  const providerModel=cfg.backend==="zai"?canonical:`z-ai/${canonical}`;
  const allowed=cfg.backend==="zai"?ZAI_MODELS:cfg.backend==="nvidia"?NVIDIA_MODELS:ROUTER_MODELS;
  if(!allowed.has(providerModel))return fail(422,"Selected GLM variant is not offered by the configured backend.","validation");
  selectedModel=providerModel;
 }
 if(!cfg.key)return fail(503,"Set the selected GLM provider key (NVIDIA_API_KEY, MYWAY_GLM_API_KEY, or OPENROUTER_API_KEY) in experimental .env.local. Do not paste it into chat.","configuration");
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);const began=performance.now();
 try{
  // Exact fixed Z.ai / OpenRouter / NVIDIA host, chosen by experimental server config only. No arbitrary URL.
  const response=await fetch(cfg.endpoint,{method:"POST",signal:controller.signal,redirect:"error",cache:"no-store",
   headers:{"Authorization":`Bearer ${cfg.key}`,"Content-Type":"application/json"},
   body:JSON.stringify({model:selectedModel,messages:[{role:"system",content:system},{role:"user",content:user}],
    // NVIDIA GLM endpoint does not advertise response_format=json_object. Its
    // prompt requests JSON and the existing assessment/teaching validators enforce the contract.
    ...(cfg.backend==="nvidia"?{}:{response_format:{type:"json_object"}}),
    ...(cfg.backend==="openrouter"?{reasoning:{effort:"low"}}:{reasoning_effort:"low"}),
    // NVIDIA counts reasoning inside completion budget; leave room for final JSON.
    max_tokens:cfg.backend==="nvidia"?6144:3072,temperature:0.2,stream:false}),
  });
  if(!response.ok)return fail(response.status===429?429:response.status===401||response.status===403?503:502,
   `GLM provider (${cfg.backend}) returned HTTP ${response.status}. Check key, model access, quota or JSON-mode support.`,"provider_response");
  const data:unknown=await response.json();
  if(!data||typeof data!=="object")return fail(502,"Invalid response from the GLM provider.","provider_response");
  const record=data as Record<string,unknown>;const choices=record.choices;
  const first=Array.isArray(choices)&&choices.length?choices[0]:null;
  const item=first&&typeof first==="object"?(first as Record<string,unknown>):null;
  const message=item?.message&&typeof item.message==="object"?(item.message as Record<string,unknown>):null;
  // reasoning_content is never returned or exposed; only the final answer is validated.
  const raw=message?.content;
  if(typeof raw!=="string"||!raw.trim())return fail(502,"GLM returned no final JSON content; reasoning may have exhausted the output budget. Try Flash or check provider limits.","provider_response");
  const usage=record.usage&&typeof record.usage==="object"?record.usage as Record<string,unknown>:{};
  const breakdown=usage.prompt_tokens_details&&typeof usage.prompt_tokens_details==="object"?usage.prompt_tokens_details as Record<string,unknown>:{};
  const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?Math.round(v):null;
  return Response.json({raw,model:typeof record.model==="string"?record.model:selectedModel,provider:cfg.backend,providerMs:Math.round(performance.now()-began),
   usage:{promptTokens:number(usage.prompt_tokens),completionTokens:number(usage.completion_tokens),
    totalTokens:number(usage.total_tokens),cachedTokens:number(breakdown.cached_tokens)}},
   {headers:{"Cache-Control":"no-store","X-MyWay-Mode":"no-state-writes"}});
 }catch{
  return fail(502,controller.signal.aborted?"GLM provider exceeded the 75-second server deadline.":"GLM transport or provider response failed; inspect the local server log.",
   controller.signal.aborted?"timeout":"transport");
 }finally{clearTimeout(timer);}
}
