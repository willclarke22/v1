import { NextResponse } from "next/server";
import { generateAnatomyExperience, type AnatomyExperienceModel } from "../anatomy-experience/generate.server";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const raw=await request.json() as {learner_message?:unknown;model?:unknown;use_semantic?:unknown};
  const question=typeof raw?.learner_message==='string'?raw.learner_message.trim():'';
  if(question.length<8||question.length>1000)return NextResponse.json({ok:false,error:'Enter an anatomy question between 8 and 1,000 characters.'},{status:400});
  const model:AnatomyExperienceModel=raw.model==='z-ai/glm-5.3'?'z-ai/glm-5.3':'gpt-6.1-sol';
  const result=await generateAnatomyExperience(question,model,raw.use_semantic===true);
  return NextResponse.json(result);
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:422});}
}
