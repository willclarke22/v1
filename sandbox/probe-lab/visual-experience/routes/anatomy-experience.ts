import { NextResponse } from "next/server";
import { generateAnatomyExperience, type AnatomyExperienceModel } from "../anatomy-experience/generate.server";
import { assembleAnatomyContext } from "../anatomy-experience/assemble.server";
import { prepareLookGrabDiscovery, type LookGrabMode } from "../anatomy-experience/asset-discovery.server";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const raw=await request.json() as {learner_message?:unknown;model?:unknown;use_semantic?:unknown; inspect_only?:unknown; discovery_mode?:unknown; inspect_discovery?:unknown;reference_names?:unknown};
  const question=typeof raw?.learner_message==='string'?raw.learner_message.trim():'';
  if(question.length<8||question.length>1000)return NextResponse.json({ok:false,error:'Enter an anatomy question between 8 and 1,000 characters.'},{status:400});
  const model:AnatomyExperienceModel=raw.model==='z-ai/glm-5.3'?'z-ai/glm-5.3':'gpt-6.1-sol';
  const discoveryMode:"v2_context"|LookGrabMode=raw.discovery_mode==="full_catalog"?"full_catalog":raw.discovery_mode==="search_assisted"?"search_assisted":raw.discovery_mode==="multiscale_v2"?"multiscale_v2":"v2_context";
  if(raw.inspect_discovery===true && discoveryMode!=="v2_context"){
    const refs=Array.isArray(raw.reference_names)?raw.reference_names.filter((x):x is string=>typeof x==='string'&&x.trim().length>1&&x.length<=100).slice(0,12):[];
    const found=await prepareLookGrabDiscovery(question,discoveryMode,refs);
    return NextResponse.json({ok:true,preview:true,discovery_mode:discoveryMode,diagnostics:found.diagnostics,sample:found.entries.slice(0,30).map(a=>({id:a.short_id,name:a.name,system:a.system}))});
  }
  if(raw.inspect_only===true){
    // No generative model or embedding call for previews. Useful before paid experiments.
    const context=await assembleAnatomyContext(question,false);
    return NextResponse.json({ok:true,preview:true,focal_name:context.focal_name,assets:context.assets,diagnostics:context.diagnostics});
  }
  const result=await generateAnatomyExperience(question,model,raw.use_semantic===true,discoveryMode);
  return NextResponse.json(result);
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:422});}
}
