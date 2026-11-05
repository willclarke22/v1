/** S1.5 DEVELOPMENT-ONLY read-only shadow Model B / Model C. No database access or writers. */
import {S13_SCHEMA,S13_PROMPT,validS13Input} from '@/sandbox/probe-lab/learning-space/memory-adjudication-s13';
import {COMPACT_TEACH_SCHEMA,validCompactTeachingInput} from '@/sandbox/probe-lab/local-assessment/compact-teaching';
import {S15_TEACHING_PROMPT,S15_MEMORY_ADDENDUM} from '@/sandbox/probe-lab/learning-space/myway-shadow-voice-s15';
import {readOpenAIUsage} from '@/sandbox/probe-lab/local-assessment/model-token-usage';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const FORMAT='myway_s15_shadow_model_v1';
const MODELS=new Set(['gpt-4.1-mini','gpt-4o-mini']);
const fail=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function allow(request:Request):boolean{
 if(process.env.NODE_ENV!=='development'||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||process.env.VERCEL==='1')return false;
 const url=new URL(request.url);if(!['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname))return false;
 const host=(request.headers.get('host')||'').toLowerCase().trim();if(!['127.0.0.1:3001','localhost:3001'].includes(host))return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 try{const o=new URL(origin);return !o.username&&!o.password&&o.origin===`http://${host}`;}catch{return false;}
}
export async function POST(request:Request){
 if(!allow(request))return fail(403,'S1.5 requires pinned local development and matching Origin.');
 if(!request.headers.get('content-type')?.includes('application/json'))return fail(415,'JSON body required.');
 if(Number(request.headers.get('content-length')||0)>6500)return fail(413,'Payload too large.');
 let data:unknown;try{data=await request.json();}catch{return fail(400,'Invalid JSON.');}
 const p=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:{};
 if(Object.keys(p).sort().join('|')!==['context','format','model','stage'].join('|')||p.format!==FORMAT||
  (p.stage!=='teaching'&&p.stage!=='memory')||typeof p.model!=='string'||!MODELS.has(p.model)||
  !(p.stage==='teaching'?validCompactTeachingInput(p.context):validS13Input(p.context)))return fail(400,'Invalid S1.5 shadow payload.');
 const key=process.env.MYWAY_OPENAI_API_KEY||process.env.OPENAI_API_KEY;if(!key)return fail(503,'OpenAI key unavailable.');
 let endpoint:URL;
 try{endpoint=new URL((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'')+'/chat/completions');
  if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(endpoint.hostname)))return fail(503,'Unsafe provider endpoint.');
 }catch{return fail(503,'Invalid provider endpoint.');}
 const memory=p.stage==='memory';
 const system=memory?S13_PROMPT+S15_MEMORY_ADDENDUM:S15_TEACHING_PROMPT;
 const schema=memory?S13_SCHEMA:COMPACT_TEACH_SCHEMA;
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
 try{
  const response=await fetch(endpoint.toString(),{method:'POST',cache:'no-store',redirect:'error',signal:abort.signal,
   headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:p.model,store:false,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(p.context)}],
    response_format:{type:'json_schema',json_schema:{name:memory?'myway_s15_memory':'myway_s15_teaching',strict:true,schema}},max_tokens:memory?650:370})});
  if(!response.ok)return fail(response.status===429?429:502,'Provider HTTP '+response.status);
  const data:unknown=await response.json();const obj=data&&typeof data==='object'?data as Record<string,unknown>:{};
  const choice=Array.isArray(obj.choices)?obj.choices[0]:null;
  const msg=choice&&typeof choice==='object'?(choice as Record<string,unknown>).message:null;
  const raw=msg&&typeof msg==='object'?(msg as Record<string,unknown>).content:null;
  if(typeof raw!=='string')return fail(502,'Provider returned no structured output.');
  return Response.json({raw,model:typeof obj.model==='string'?obj.model:p.model,usage:readOpenAIUsage(obj)},
   {headers:{'Cache-Control':'no-store','X-MyWay-Mode':'read-only-s15-shadow'}});
 }catch{return fail(502,abort.signal.aborted?'Model request timed out.':'Model request failed.');}
 finally{clearTimeout(timer);}
}
