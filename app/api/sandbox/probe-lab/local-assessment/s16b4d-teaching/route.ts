/** S1.6B.4D: opt-in DEVELOPMENT-ONLY teacher-voice shadow.
 * Does not change S1.5, production Learning Space, profile storage, or memory.
 * This route is disabled on Vercel and whenever NODE_ENV is not development. */
import {COMPACT_TEACH_SCHEMA,validCompactTeachingInput} from '@/sandbox/probe-lab/local-assessment/compact-teaching';
import {readOpenAIUsage} from '@/sandbox/probe-lab/local-assessment/model-token-usage';
import {MYWAY_VOICE_SYSTEM_PROMPT} from '@/scripts/sandbox/learning-intelligence/s16b4c-voice.mjs';
import {TEACHING_ACTIONS} from '@/scripts/sandbox/learning-intelligence/s16b4a-teaching-contract.mjs';
import {buildAdaptiveDialoguePrompt,S16B5_VOICE_VERSION} from '@/scripts/sandbox/learning-intelligence/s16b5-dialogue.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const FORMAT='myway_s16b4d_teaching_v1';
// FIX2 keeps strict three-field JSON and existing 620-character validator.
// The provider JSON-schema subset cannot reliably constrain string lengths.
const OUTPUT_LENGTH_RULE='Use three nonempty string fields only. Target teaching_strategy <= 460 characters, next_step <= 180, and visual_intent <= 140; HARD LIMIT 620 characters PER FIELD. Preserve the precise learner meaning. Do not clip sentences or omit essential evidence just to fit a limit.';
const RETRY_LENGTH_RULE='FORMAT-ONLY RETRY: The previous response failed local output validation. Regenerate all three fields within the hard 620-character limit; preserve the teaching action and evidence, without adding commentary or extra fields.';
const fail=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function localOnly(request:Request):boolean{
 if(process.env.NODE_ENV!=='development'||process.env.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||process.env.VERCEL==='1')return false;
 const url=new URL(request.url);if(!['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname))return false;
 const host=(request.headers.get('host')||'').toLowerCase().trim();if(!['127.0.0.1:3001','localhost:3001'].includes(host))return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 try{const o=new URL(origin);return !o.username&&!o.password&&o.origin===`http://${host}`;}catch{return false;}
}
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function personal(v:unknown):v is Record<string,string|null>{
 if(!obj(v)||Object.keys(v).sort().join('|')!=='anti_distortion_guard|chosen_interest|reason|structural_mapping|use_interest')return false;
 const mode=v.use_interest;
 if(!['do_not_use','light_tone','structural_bridge'].includes(String(mode)))return false;
 if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>600||typeof v.anti_distortion_guard!=='string'||!v.anti_distortion_guard.trim()||v.anti_distortion_guard.length>600||typeof v.structural_mapping!=='string'||v.structural_mapping.length>600)return false;
 if(mode==='do_not_use')return v.chosen_interest===null&&v.structural_mapping==='';
 if(typeof v.chosen_interest!=='string'||!v.chosen_interest.trim()||v.chosen_interest.length>120)return false;
 return mode!=='structural_bridge'||!!v.structural_mapping.trim();
}
export async function POST(request:Request){
 if(!localOnly(request))return fail(403,'S1.6B.4D requires pinned loopback development mode.');
 if(!request.headers.get('content-type')?.includes('application/json'))return fail(415,'JSON body required.');
 if(Number(request.headers.get('content-length')||0)>6500)return fail(413,'Payload too large.');
 const bodyText=await request.text();if(Buffer.byteLength(bodyText,'utf8')>6500)return fail(413,'Payload too large.');
 let incoming:unknown;try{incoming=JSON.parse(bodyText);}catch{return fail(400,'Invalid JSON.');}
 const retry=!!(incoming&&obj(incoming)&&incoming.format_retry===true);
 const adaptive=!!(incoming&&obj(incoming)&&incoming.voice_version===S16B5_VOICE_VERSION);
 const allowedKeys=adaptive
  ? (retry?'action|context|format|format_retry|model|personalization|variant|voice_version':'action|context|format|model|personalization|variant|voice_version')
  : (retry?'action|context|format|format_retry|model|personalization|variant':'action|context|format|model|personalization|variant');
 if(!obj(incoming)||Object.keys(incoming).sort().join('|')!==allowedKeys||incoming.format!==FORMAT||
 incoming.model!=='gpt-4.1-mini'||!['contract','personalized'].includes(String(incoming.variant))||!TEACHING_ACTIONS.includes(String(incoming.action))||
 !validCompactTeachingInput(incoming.context)||!personal(incoming.personalization)||
 (incoming.variant==='contract'&&incoming.personalization.use_interest!=='do_not_use'))return fail(400,'Invalid 4D shadow teaching payload.');
 const key=process.env.MYWAY_OPENAI_API_KEY||process.env.OPENAI_API_KEY;if(!key)return fail(503,'OpenAI key unavailable.');
 let endpoint:URL;try{endpoint=new URL((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'')+'/chat/completions');
  if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(endpoint.hostname)))return fail(503,'Unsafe provider endpoint.');
 }catch{return fail(503,'Invalid provider endpoint.');}
 // Keep the 4C contract canonical; replace ONLY its explicit 4C no-interest constraint.
 const legacySystem=MYWAY_VOICE_SYSTEM_PROMPT.replace('Use no interest in this 4C phase.',
  'Interest is optional. Use only the supplied decision: structural_bridge requires a faithful mapping and stated limitation; light_tone is a brief relevant reference; do_not_use means do not mention the interest. Do not infer learner interest, preference, understanding or successful analogy from the decision.')+'\n'+OUTPUT_LENGTH_RULE+(retry?'\n'+RETRY_LENGTH_RULE:'');
 const system=adaptive?buildAdaptiveDialoguePrompt(String(incoming.action),{formatRetry:retry}):legacySystem;
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
 try{
  const result=await fetch(endpoint.toString(),{method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,
   headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:incoming.model,store:false,
    messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({action:incoming.action,context:incoming.context,personalization:incoming.personalization})}],
    response_format:{type:'json_schema',json_schema:{name:'myway_s16b4d_teaching',strict:true,schema:COMPACT_TEACH_SCHEMA}},max_tokens:370})});
  if(!result.ok)return fail(result.status===429?429:502,'Provider HTTP '+result.status);
  const rawBody:unknown=await result.json();const out=obj(rawBody)?rawBody:{};
  const choice=Array.isArray(out.choices)?out.choices[0]:null;const message=obj(choice)?choice.message:null;const raw=obj(message)?message.content:null;
  if(typeof raw!=='string')return fail(502,'Provider returned no structured output.');
  return Response.json({raw,model:typeof out.model==='string'?out.model:incoming.model,usage:readOpenAIUsage(out)},
   {headers:{'Cache-Control':'no-store','X-MyWay-Mode':adaptive?'s16b5-adaptive-teaching-shadow':'s16b4d-local-teaching-shadow'}});
 }catch{return fail(502,abort.signal.aborted?'Model request timed out.':'Model request failed.');}
 finally{clearTimeout(timer);}
}
