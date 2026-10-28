"use client";
/** Browser-to-local Next route only: keys remain server-side and are never returned. */
export type GLMUsage={promptTokens:number|null;completionTokens:number|null;totalTokens:number|null;cachedTokens:number|null};
export type GLMReply={raw:string;model:string;provider:"zai"|"openrouter"|"nvidia";providerMs:number;usage:GLMUsage};
export async function requestGLM(args:{stage:"assessment";userPrompt:string;model?:string;signal:AbortSignal}|{stage:"teaching";input:unknown;model?:string;signal:AbortSignal;format?:"myway_learning_space_teaching_v1"}|{stage:"verifier";input:unknown;model?:string;signal:AbortSignal;format:"myway_topic_association_verifier_v1"}):Promise<GLMReply>{
 const controller=new AbortController();let expired=false;
 const cancel=()=>controller.abort();
 if(args.signal.aborted)controller.abort();else args.signal.addEventListener("abort",cancel,{once:true});
 const timeout=setTimeout(()=>{expired=true;controller.abort();},90_000);
 try{
  const body=args.stage==="assessment"?{stage:"assessment",userPrompt:args.userPrompt,model:args.model}:{stage:args.stage,input:args.input,model:args.model,...(args.format?{format:args.format}:{})};
  const response=await fetch("/api/sandbox/probe-lab/local-assessment/glm",{
   method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",signal:controller.signal,body:JSON.stringify(body),
  });
  const result:unknown=await response.json().catch(()=>null);
  if(!result||typeof result!=="object")throw Error(`GLM endpoint returned HTTP ${response.status} without JSON.`);
  const data=result as Record<string,unknown>;
  if(!response.ok)throw Error(`GLM ${typeof data.stage==="string"?data.stage:"request"}: ${typeof data.error==="string"?data.error:`HTTP ${response.status}`}`);
  if(typeof data.raw!=="string"||typeof data.model!=="string"||!data.raw.trim())throw Error("GLM returned no usable JSON answer.");
  const stats=(data.usage&&typeof data.usage==="object"?data.usage:{}) as Record<string,unknown>;
  const numeric=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&x>=0?Math.round(x):null;
  const provider=data.provider;
  if(provider!=="zai"&&provider!=="openrouter"&&provider!=="nvidia")throw Error("Unknown GLM provider response.");
  return {raw:data.raw,model:data.model,provider,providerMs:numeric(data.providerMs)??0,usage:{
   promptTokens:numeric(stats.promptTokens),completionTokens:numeric(stats.completionTokens),
   totalTokens:numeric(stats.totalTokens),cachedTokens:numeric(stats.cachedTokens),
  }};
 }catch(error){
  if(expired)throw Error("GLM timed out after 90 seconds; try Flash or inspect the local Next terminal.");
  if(args.signal.aborted)throw new DOMException("Turn cancelled","AbortError");
  throw error;
 }finally{clearTimeout(timeout);args.signal.removeEventListener("abort",cancel);}
}
