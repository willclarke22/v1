#!/usr/bin/env node
/** S1.6B.5.3 model-first conversational ablation. OFFLINE by default.
 * Paid direct API calls only with explicit --allow-spend / admission budget;
 * old baseline uses existing guarded local development route. No DB writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {buildConversationCase,buildProviderRequest,normalizeReply,selectComparisonCases,VARIANTS,VERSION} from './s16b53-conversation.mjs';
import {inspectTeacherOutput} from './s16b4d-fix2-validation.mjs';
import {validateExistingModelBOutput} from './s16b4a-interfaces.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const BASE='http://127.0.0.1:3001';
const OLD_ENDPOINT=BASE+'/api/sandbox/probe-lab/local-assessment/s16b4d-teaching';
const RATE={input:0.4,cache:0.1,output:1.6}; // Estimated $/million, not an invoice
const MAX_MODEL_LIMIT=6,MAX_RETRIES=2;
export function parseArgs(argv){
 const o={mode:'offline',limit:null,caseId:null,variants:[...VARIANTS],allowSpend:false,budget:null,help:false};
 for(let i=0;i<argv.length;i++){const k=argv[i];
  if(k==='--help'){o.help=true;continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!['--mode','--limit','--case','--variants','--budget-usd'].includes(k))throw Error('Unsupported argument '+k);
  if(++i>=argv.length)throw Error('Missing value after '+k);const v=argv[i];
  if(k==='--mode')o.mode=v;else if(k==='--limit')o.limit=Number(v);else if(k==='--case')o.caseId=v;else if(k==='--variants')o.variants=v.split(',');else o.budget=Number(v);
 }
 if(!['offline','model'].includes(o.mode))throw Error('Invalid mode');
 if(o.limit===null)o.limit=o.mode==='model'?3:6;
 if(!Number.isInteger(o.limit)||o.limit<1||o.limit>MAX_MODEL_LIMIT)throw Error('Invalid limit');
 if(o.caseId!==null&&!/^R52-[A-Z]{2,8}-\d\d$/.test(o.caseId))throw Error('Invalid case ID');
 if(o.variants.length<2||new Set(o.variants).size!==o.variants.length||o.variants.some(x=>!VARIANTS.includes(x)))throw Error('Select 2–4 distinct known variants');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('Offline refuses paid flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.03||o.budget>0.5))throw Error('Paid mode requires --allow-spend and --budget-usd 0.03..0.50');
 return o;
}
function checkRoot({paid=false}={}){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment')throw Error('Wrong worktree');
 const git=(r,...a)=>execFileSync('git',['-C',r,...a],{encoding:'utf8',timeout:10000}).trim();
 if(git(ROOT,'branch','--show-current')!=='myway/learning-sandbox-v3_7a')throw Error('Wrong experimental branch');
 const orig=path.join(path.dirname(ROOT),'v1');
 if(git(orig,'branch','--show-current')!=='main'||git(orig,'rev-parse','--verify','HEAD^{commit}')!=='462a7a4b6ce8b2b20a91021acca716307f4aa2d1')throw Error('Original main drift');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Local release changed');
 for(const s of ['s16b52','s16b53'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${s}/installation.json`)))throw Error('Missing installation receipt '+s);
 if(paid&&(process.env.VERCEL==='1'||process.env.CI==='true'||process.env.NODE_ENV==='production'))throw Error('No cloud/CI/production inference');
}
export function dollarCost(u){
 if(!u||!Number.isSafeInteger(u.promptTokens)||u.promptTokens<0||!Number.isSafeInteger(u.completionTokens)||u.completionTokens<0)return null;
 const cached=u.cachedTokens??0;if(!Number.isSafeInteger(cached)||cached<0||cached>u.promptTokens)return null;
 return ((u.promptTokens-cached)*RATE.input+cached*RATE.cache+u.completionTokens*RATE.output)/1000000;
}
function usageFromProvider(o){const u=o?.usage;
 return {promptTokens:u?.prompt_tokens,completionTokens:u?.completion_tokens,cachedTokens:u?.prompt_tokens_details?.cached_tokens??0};
}
function envAndEndpoint(){
 const require=createRequire(path.join(ROOT,'package.json'));
 // Next loads local .env files for the existing route; this uses the SAME precedence without printing values.
 require('@next/env').loadEnvConfig(ROOT,true);
 const key=process.env.MYWAY_OPENAI_API_KEY||process.env.OPENAI_API_KEY;
 if(typeof key!=='string'||!key.trim())throw Error('OpenAI API key unavailable to experimental CLI; no call made');
 let url;try{url=new URL((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'')+'/chat/completions');}catch{throw Error('Invalid provider base URL');}
 if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname))))throw Error('Provider URL fails HTTPS/loopback check');
 return {key,url:url.toString()};
}
async function checkedFetch(url,opts){const control=new AbortController(),timer=setTimeout(()=>control.abort(),32000);
 try{return await fetch(url,{...opts,redirect:'error',cache:'no-store',signal:control.signal});}finally{clearTimeout(timer);}
}
async function directInvoke(input,ctx){
 const r=await checkedFetch(ctx.url,{method:'POST',headers:{Authorization:`Bearer ${ctx.key}`,'Content-Type':'application/json'},body:JSON.stringify(input)});
 if(!r.ok)throw Error('Provider request failed HTTP '+r.status);
 const obj=await r.json(),msg=obj?.choices?.[0]?.message?.content;
 if(typeof msg!=='string')throw Error('Provider returned no text');
 return {raw:msg,usage:usageFromProvider(obj),providerModel:obj.model??null,finishReason:obj?.choices?.[0]?.finish_reason??null};
}
async function currentInvoke(input){
 const r=await checkedFetch(OLD_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE},body:JSON.stringify(input)});
 if(!r.ok)throw Error('Existing guarded local endpoint HTTP '+r.status);
 const obj=await r.json();if(typeof obj?.raw!=='string')throw Error('Existing endpoint returned no text');return obj;
}
async function localEndpointPreflight(){
 // Invalid request is rejected before provider invocation; confirms route is locally enabled.
 const r=await checkedFetch(OLD_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE},body:'{}'});
 if(r.status!==400)throw Error('Existing local teacher not ready: expected preflight HTTP 400; got '+r.status);
 const x=await r.json().catch(()=>({}));if(x.error!=='Invalid 4D shadow teaching payload.')throw Error('Unexpected local endpoint; stopping without spending');
}
const err=x=>String(x?.message??x).slice(0,350);
export async function run(o,{rootCheck=true,directCall=directInvoke,currentCall=currentInvoke,preflight=localEndpointPreflight,env=envAndEndpoint}={}){
 if(rootCheck)checkRoot({paid:o.mode==='model'});
 const cases=selectComparisonCases({caseId:o.caseId,limit:o.limit}).map(s=>buildConversationCase(s));
 const planned=cases.flatMap(c=>o.variants.map(v=>({c,v,status:v==='current'&&c.existing.status!=='PREPARED'?'SAFE_HOLD':v==='action'&&!c.action?'SAFE_HOLD':'READY'})));
 const numCalls=planned.filter(x=>x.status==='READY').length;
 const retries=Math.min(MAX_RETRIES,planned.filter(x=>x.status==='READY'&&['simple','action'].includes(x.v)).length);
 // Conservative admission, with up to two malformed JSON retries. Actual billing is not capped by this figure.
 const admission=((numCalls+retries)*(10000*RATE.input+450*RATE.output))/1000000;
 if(o.mode==='model'&&admission>o.budget+1e-12)throw Error('Admission budget insufficient: needs at least $'+admission.toFixed(5)+' for planned calls + bounded formatting retries');
 const trace={schema:VERSION,model:'gpt-4.1-mini',mode:o.mode,source:'authored_synthetic_not_real_learners',set:'development_only',variants:o.variants,
  ablation_notes:['direct vs simple: raw text vs one-field JSON','simple vs action: same raw conversation plus advisory inferred action','action vs current: ALSO changes context selection, output schema and system prompt; confounded; inspect rather than attribute causality'],
  oracle_not_fed_to_model:true,persistent_memory_writes:0,db_writes:0,profile_writes:0,
  cost:{attemptedCalls:0,knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,validationFailures:0,retries:0,recoveries:0,admissionBudgetUsd:o.budget,conservativeAdmissionEstimateUsd:admission,notInvoice:true},
  results:[]};
 let ctx=null;
 if(o.mode==='model'){
  // Fail prior to all spending if the old comparator endpoint cannot be reached.
  if(o.variants.includes('current'))await preflight();
  if(o.variants.some(v=>v!=='current'))ctx=env();
 }
 let retryRemaining=retries,stop=false;
 for(const {c,v,status} of planned){
  const row={scenario:c.id,domain:c.domain,variant:v,raw_current_learner:c.learner,raw_prior_turns:c.prior,
   provisional_root:c.root,source_kind:c.source_kind,oracle_action_for_review:c.author_action_for_review,
   inferred_action_for_review:c.action,context_sent:v==='current'?c.existing.request?.context??null:c.messages(v),
   selected_history:v==='current'?c.existing.selected:[],status:status==='SAFE_HOLD'?'SAFE_HOLD':o.mode==='offline'?'OFFLINE_PREPARED':'PENDING',
   response:null,response_format:v==='direct'?'plain_text':v==='current'?'legacy_three_field_json':'one_field_reply_json',
   attempts:[],costUsd:null,planning_note:c.comparison_note};trace.results.push(row);
  if(status==='SAFE_HOLD'||o.mode==='offline')continue;
  for(let attempt=1;attempt<=2;attempt++){
   const formatRetry=attempt===2;if(formatRetry){retryRemaining--;trace.cost.retries++;}
   const a={attempt,formatRetry};row.attempts.push(a);trace.cost.attemptedCalls++;
   let resp;try{resp=v==='current'?await currentCall(c.existing.request):await directCall(buildProviderRequest(c,v,{formatRetry}),ctx);}
   catch(e){row.status='TRANSPORT_STOP';row.error=err(e);trace.cost.unknownOrIncompleteCalls++;trace.cost.complete=false;stop=true;break;}
   a.usage=resp.usage??null;a.costUsd=dollarCost(resp.usage);
   if(a.costUsd===null){row.status='UNKNOWN_USAGE_STOP';row.error='Missing verified provider usage';trace.cost.unknownOrIncompleteCalls++;trace.cost.complete=false;stop=true;break;}
   trace.cost.knownEstimatedUsd+=a.costUsd;row.costUsd=(row.costUsd??0)+a.costUsd;
   if(resp.finishReason&&resp.finishReason!=='stop'){row.status='TRUNCATED_STOP';row.error='Provider finish_reason: '+String(resp.finishReason).slice(0,50);stop=true;break;}
   try{if(v==='current'){
     const checked=inspectTeacherOutput(resp.raw);if(!checked.diagnostic.ok)throw Error(checked.diagnostic.reason);
     validateExistingModelBOutput(checked.parsed);row.response=checked.parsed.teaching_strategy;
     row.legacy_internal_next_step=checked.parsed.next_step;row.legacy_internal_visual=checked.parsed.visual_intent;
    }else row.response=normalizeReply(resp.raw,v);
    row.status='PROVIDER_VALIDATED_UNSCORED';if(formatRetry)trace.cost.recoveries++;break;
   }catch(e){trace.cost.validationFailures++;a.validationError=err(e);a.rejectedSha256=crypto.createHash('sha256').update(String(resp.raw??'')).digest('hex');
    if(!formatRetry&&['simple','action'].includes(v)&&retryRemaining>0){a.status='FORMAT_RETRY_PLANNED';continue;}
    row.status='VALIDATION_STOP';row.error=err(e);stop=true;break;
   }
  }
  if(stop)break;
 }
 return trace;
}
function shortMoney(x){return typeof x==='number'?'$'+x.toFixed(7):'unknown';}
export function reviewText(t){
 const lines=[`MYWAY S1.6B.5.3 — MODEL-FIRST VS EXISTING PIPELINE — ${t.mode.toUpperCase()}`,
 'SYNTHETIC AUTHORED DATA ONLY. No actual learner outcomes, scores or memory changes.',
 'Model: GPT-4.1 mini. The researcher action labels are review hints, NOT model input.',
 'Causality caution: action vs current changes prompt, context and format at once.',''];
 for(const id of [...new Set(t.results.map(r=>r.scenario))]){
  const group=t.results.filter(r=>r.scenario===id);if(!group.length)continue;
  const first=group[0];lines.push('='.repeat(72),id+' | '+first.domain,
   'ACTUAL RAW CONVERSATION:',...first.raw_prior_turns.map(x=>(x.role==='learner'?'LEARNER':'MYWAY')+': '+x.text),
   'LEARNER NOW: '+first.raw_current_learner,
   'POSSIBLE ROOT (AUTHOR LABEL, not verified testimony): '+first.provisional_root,
   'AUTHOR-ASSIGNED ACTION (REVIEW ONLY): '+first.oracle_action_for_review,
   'EXISTING HEURISTIC ACTION: '+(first.inferred_action_for_review??'none'));
  for(const r of group){lines.push('',`-- ${r.variant.toUpperCase()} | ${r.status} | cost ${shortMoney(r.costUsd)}`,
   'CONTEXT: '+(r.variant==='current'?'selected and compressed 4D context':'ordered exact raw dialogue'),
   ...(r.variant==='current'?['SELECTED: '+JSON.stringify(r.selected_history?.map(x=>({source:x.source,text:x.text})))]:[]),
   'LEARNER-FACING RESPONSE:',r.response??'[not generated]',
   ...(r.legacy_internal_next_step?['LEGACY INTERNAL NEXT STEP:',r.legacy_internal_next_step]:[]),
   ...(r.error?['STOP/ERROR: '+r.error]:[]));}
  lines.push('', 'HUMAN EVALUATION — label-blinded companion file contains responses without variant names.');
 }
 lines.push('', 'COST: '+JSON.stringify(t.cost),'NOTE: Structural validation does not establish teaching quality. Authored scenarios are not real users.');return lines.join('\n')+'\n';
}
export function blindText(t){
 const lines=['MYWAY S1.6B.5.3 — BLIND HUMAN COMPARISON','Synthetic scenarios. Scores deliberately blank. Responses are deterministically shuffled; decode from trace AFTER review.',''];
 for(const id of [...new Set(t.results.map(r=>r.scenario))]){
  const g=t.results.filter(r=>r.scenario===id),base=g[0];if(!base)continue;
  lines.push('='.repeat(72),id,...base.raw_prior_turns.map(x=>(x.role==='learner'?'LEARNER':'MYWAY')+': '+x.text),'LEARNER NOW: '+base.raw_current_learner,
   'QUESTION: Is the response appropriately responsive, accurate, grounded and natural?');
  const variants=g.filter(x=>x.response).map(x=>({tag:crypto.createHash('sha256').update(id+'|'+x.variant+'|blind-review-v1').digest('hex').slice(0,8),variant:x.variant,response:x.response})).sort((a,b)=>a.tag.localeCompare(b.tag));
  for(let i=0;i<variants.length;i++){const v=variants[i];lines.push('',`RESPONSE ${i+1} — hidden identifier ${v.tag}`,v.response,
    'REVIEW: intent [1-5] | context [1-5] | accuracy [1-5] | naturalness [1-5] | restraint [1-5] | progress calibration [1-5]',
    'CRITICAL FLAGS: invented learner evidence [ ] | ignored correction [ ] | premature mastery [ ] | ignored explicit request [ ]',
    'COMMENTS:');}
 }
 return lines.join('\n')+'\n';
}
export function writeReport(t){
 const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b53',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});
 for(const [n,v] of [['trace.json',JSON.stringify(t,null,2)+'\n'],['S16B53_ARCHITECTURE_COMPARISON.txt',reviewText(t)],['S16B53_BLIND_REVIEW.txt',blindText(t)]])fs.writeFileSync(path.join(dir,n),v,{flag:'wx',mode:0o600});return dir;
}
async function main(){const o=parseArgs(process.argv.slice(2));
 if(o.help){console.log('S1.6B.5.3: --mode offline|model --limit 1..6 --variants direct,simple,action,current --case R52-ID; paid requires --allow-spend --budget-usd 0.03..0.50; development cases only.');return;}
 console.log(`S1.6B.5.3 model-first | ${o.mode} | ${o.limit} development cases | ${o.variants.join(',')} | DB WRITES=0`);
 if(o.mode==='model')console.log('PAID OPT-IN: budget is conservative admission estimate, NOT a billing cap. If comparing current, start guarded local Next server at 127.0.0.1:3001.');
 const t=await run(o),dir=writeReport(t);
 for(const r of t.results)console.log(`${r.scenario} | ${r.variant} | ${r.status} | USD=${shortMoney(r.costUsd)}`);
 console.log('REVIEW: '+path.join(dir,'S16B53_ARCHITECTURE_COMPARISON.txt'));console.log('BLIND: '+path.join(dir,'S16B53_BLIND_REVIEW.txt'));
 console.log('TRACE: '+path.join(dir,'trace.json'));console.log('COST: '+JSON.stringify(t.cost));
 if(t.results.some(r=>/STOP$/.test(r.status)))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.5.3 REFUSED: '+err(e));process.exitCode=1;});
