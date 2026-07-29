import { NextRequest, NextResponse } from "next/server";
import { createGlmProceduralAsset } from "../providers/glm-procedural-provider.server";
export const runtime="nodejs"; export const maxDuration=300;
function csv(value:unknown){return typeof value==="string"?[...new Set(value.split(",").map(v=>v.trim()).filter(Boolean))].slice(0,20):[];}
export async function POST(request:NextRequest){
  try{
    const body=await request.json() as Record<string,unknown>; const concept=String(body.concept??"").trim();
    if(!concept)return NextResponse.json({ok:false,error:"An object identity is required."},{status:400});
    const target=Number(body.target_extent_m??2); if(!Number.isFinite(target)||target<=0)return NextResponse.json({ok:false,error:"Normalization extent must be greater than zero."},{status:400});
    const result=await createGlmProceduralAsset({concept,details:csv(body.details),style:String(body.style??"clean stylized").trim(),targetExtentM:Math.min(20,Math.max(0.05,target))});
    return NextResponse.json({ok:true,source:"glm_procedural",...result,message:`GLM produced a ${result.plan.suitability}-suitability procedural plan with ${result.plan.parts.length} parts. MyWay compiled, normalized, registered, and queued it for review.`});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error),debug_path:"sandbox/probe-lab/assets/debug/latest-glm-procedural-build.json"},{status:502});}
}
