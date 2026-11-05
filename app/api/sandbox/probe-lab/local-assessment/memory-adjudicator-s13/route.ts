/** S1.3 localhost-only model evaluation. No DB, no learner memory, no API writes. */
import {S13_FORMAT,S13_SCHEMA,S13_PROMPT,validS13Input} from '@/sandbox/probe-lab/learning-space/memory-adjudication-s13';
import {readOpenAIUsage} from '@/sandbox/probe-lab/local-assessment/model-token-usage';
export const runtime='nodejs';
const MODELS=new Set(['gpt-4.1-mini','gpt-4o-mini']);
const fail=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function localOnly(request:Request):boolean{
 if(process.env.NODE_ENV!=='development'||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||process.env.VERCEL==='1')return false;
 const url=new URL(request.url);
 if(!['127.0.0.1','localhost','[::1]','::1'].includes(url.hostname))return false;
 const host=(request.headers.get('host')??'').toLowerCase().trim();
 if(!['127.0.0.1:3001','localhost:3001'].includes(host))return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 try{const o=new URL(origin);return !o.username&&!o.password&&o.origin===`http://${host}`;}catch{return false;}
}
export async function POST(request:Request){
 if(!localOnly(request))return fail(403,'S1.3 only accepts pinned loopback development requests.');
 if(!request.headers.get('content-type')?.includes('application/json'))return fail(415,'JSON required.');
 if(Number(request.headers.get('content-length')||0)>6500)return fail(413,'Payload too large.');
 let v:unknown;try{v=await request.json();}catch{return fail(400,'Invalid JSON.');}
 const p=v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
 if(Object.keys(p).sort().join('|')!==['format','input','model'].sort().join('|')||p.format!==S13_FORMAT||!validS13Input(p.input)||typeof p.model!=='string'||!MODELS.has(p.model))return fail(400,'Invalid S1.3 two-stage input.');
 const apiKey=process.env.MYWAY_OPENAI_API_KEY||process.env.OPENAI_API_KEY;
 if(!apiKey)return fail(503,'Server-side OpenAI credentials unavailable.');
 let target:URL;
 try{
  target=new URL((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'')+'/chat/completions');
  if(target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(target.hostname)))return fail(503,'Unsafe provider endpoint.');
 }catch{return fail(503,'Invalid provider endpoint.');}
 const aborter=new AbortController(),timer=setTimeout(()=>aborter.abort(),30000);
 try{
  const response=await fetch(target.toString(),{method:'POST',cache:'no-store',signal:aborter.signal,redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:p.model,store:false,
   messages:[{role:'system',content:S13_PROMPT},{role:'user',content:JSON.stringify(p.input)}],
   response_format:{type:'json_schema',json_schema:{name:S13_FORMAT,strict:true,schema:S13_SCHEMA}},max_tokens:560})});
  if(!response.ok)return fail(response.status===429?429:502,`Provider HTTP ${response.status}.`);
  const payload:unknown=await response.json();const record=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
  const first=Array.isArray(record.choices)?record.choices[0]:null;
  const choice=first&&typeof first==='object'?first as Record<string,unknown>:{};
  const msg=choice.message&&typeof choice.message==='object'?choice.message as Record<string,unknown>:{};
  if(typeof msg.content!=='string')return fail(502,'Missing two-stage response.');
  return Response.json({raw:msg.content,model:typeof record.model==='string'?record.model:p.model,usage:readOpenAIUsage(record)},
   {headers:{'Cache-Control':'no-store','X-MyWay-Mode':'read-only-s13-two-stage'}});
 }catch{return fail(502,aborter.signal.aborted?'Model evaluation timed out.':'Model evaluation request failed.');}
 finally{clearTimeout(timer);}
}
