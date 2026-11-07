#!/usr/bin/env node
/** S1.6B.4D: frozen, synthetic teaching A/B/C comparison. No memory/profile/DB writes.
 * Paid calls only in --mode model with explicit --allow-spend and admission budget.
 * A=unchanged S1.5 shadow prompt, B=new contract/context, C=contract/context/interest.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {assembleTeachingExperiment,createBaselineTeachingRequest} from './s16b4d-integration.mjs';
import {validateExistingModelBOutput} from './s16b4a-interfaces.mjs';
import {reviewTeachingResponse} from './s16b4c-voice.mjs';
import {inspectTeacherOutput,rejectedOutputEvidence,FIX2_MAX_RETRIES_PER_RUN} from './s16b4d-fix2-validation.mjs';
export const EVALUATION_VERSION='myway_s16b4d_teacher_comparison_v1';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const FIXTURES=path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b4d-fixtures.json');
const BASE='http://127.0.0.1:3001';
const ENDPOINTS={baseline:BASE+'/api/sandbox/probe-lab/local-assessment/myway-shadow-s15',
 contract:BASE+'/api/sandbox/probe-lab/local-assessment/s16b4d-teaching',
 personalized:BASE+'/api/sandbox/probe-lab/local-assessment/s16b4d-teaching'};
const OPTIONS=['baseline','contract','personalized'];
const has=(args,x)=>args.includes(x);
function parse(argv){const out={mode:'offline',limit:3,variants:[...OPTIONS],allowSpend:false,budget:null,scenario:null,help:false};
 for(let i=0;i<argv.length;i++){const a=argv[i];
  if(a==='--help'){out.help=true;continue;}
  if(a==='--allow-spend'){out.allowSpend=true;continue;}
  if(!['--mode','--limit','--variants','--budget-usd','--scenario'].includes(a))throw Error('Unsupported argument '+a);
  if(i+1>=argv.length)throw Error('Value required for '+a);
  const v=argv[++i];if(a==='--mode')out.mode=v;
  else if(a==='--limit')out.limit=Number(v);
  else if(a==='--budget-usd')out.budget=Number(v);
  else if(a==='--scenario')out.scenario=v;
  else out.variants=v.split(',');
 }
 if(!['offline','model'].includes(out.mode)||!Number.isInteger(out.limit)||out.limit<1||out.limit>12||!out.variants.length||out.variants.some(x=>!OPTIONS.includes(x))||new Set(out.variants).size!==out.variants.length)throw Error('Invalid evaluation options');
 if(out.mode==='offline'&&(out.allowSpend||out.budget!==null))throw Error('Offline mode forbids model-spend flags');
 if(out.mode==='model'&&(!out.allowSpend||!Number.isFinite(out.budget)||out.budget<0.03||out.budget>0.5))throw Error('Paid evaluation requires --allow-spend --budget-usd 0.03..0.50');
 return out;
}
export {parse as parseEvaluationArgs};
function fixtures(){const f=JSON.parse(fs.readFileSync(FIXTURES,'utf8'));
 if(f.schema!=='myway_s16b4d_frozen_scenarios_v1'||f.scenarios.length!==12||new Set(f.scenarios.map(s=>s.domain)).size!==10||f.scenarios.some(s=>s.privacy_class!=='synthetic_example_only'))throw Error('Unexpected or non-synthetic evaluation corpus');return f.scenarios;}
function checkRoot(){if(path.basename(ROOT)!=='v1-learning-experiment')throw Error('Not in the protected experimental worktree');
 const release=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8'));
 if(release.release!=='v37d2c7a3s12')throw Error('Local release marker drift');
 for(const step of ['s16b4a','s16b4b','s16b4c','s16b4d'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${step}/installation.json`)))throw Error('Missing installed overlay '+step);
 const branch=execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8'}).trim();
 if(branch!=='myway/learning-sandbox-v3_7a')throw Error('Wrong experiment branch');
}
function estimatedCost(response){const u=response?.usage;
 if(!u||!Number.isSafeInteger(u.promptTokens)||u.promptTokens<0||!Number.isSafeInteger(u.completionTokens)||u.completionTokens<0)return null;
 const cached=u.cachedTokens??0;if(!Number.isSafeInteger(cached)||cached<0||cached>u.promptTokens)return null;
 return ((u.promptTokens-cached)*0.4+cached*0.10+u.completionTokens*1.6)/1000000;
}
export function offlinePlan(scenarios,variants){return scenarios.flatMap(s=>variants.map(variant=>{
 const prepared=variant==='baseline'?{status:'READY_EXPERIMENTAL_OPT_IN',request:createBaselineTeachingRequest(s),audit:{baseline_current_s15_prompt:true},action:'explain_missing_mechanism'}:
  assembleTeachingExperiment({...s,variant});
 return {scenario:s.id,domain:s.domain,variant,status:prepared.status,action:prepared.action??null,
  plan:prepared.audit??null,request:prepared.request??null,
  selected_interest:prepared.personalization?.use_interest??'do_not_use',
  blocked_reason:prepared.reason??null,human_quality_review:'NOT_YET_SCORED'};
 }));}
async function callModel(url,payload){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),32000);
 try{const resp=await fetch(url,{method:'POST',cache:'no-store',redirect:'error',signal:ctrl.signal,
  headers:{'Content-Type':'application/json','Origin':BASE},body:JSON.stringify(payload)});
  const body=await resp.json().catch(()=>null);
  if(!resp.ok)throw Error(`Local model endpoint HTTP ${resp.status}: ${typeof body?.error==='string'?body.error:'no diagnostic'}`);
  if(typeof body?.raw!=='string')throw Error('Local endpoint returned no raw structured output');
  return body;
 }finally{clearTimeout(timer);}
}
function printable(n){return typeof n==='number'?'$'+n.toFixed(7):'unknown';}
function report(trace){const lines=[`S1.6B.4D — COMPLETE TEACHER COMPARISON / ${trace.mode.toUpperCase()}`,
 `Frozen scenario set: ${trace.scenario_ids.join(', ')}`,`Variants: ${trace.variants.join(', ')}`,
 `All learner/profile data are synthetic. Human teaching-quality scores are NOT filled in.`,
 `Provider budget is admission control, NOT a hard billing cap. No memory or profile updates are performed.`,
 `Calls attempted: ${trace.cost.attemptedCalls}; estimated USD: ${printable(trace.cost.knownEstimatedUsd)}; complete ledger: ${trace.cost.complete}`,''];
 for(const e of trace.results){lines.push('='.repeat(74),`${e.scenario} | ${e.domain} | ${e.variant} | ${e.status}`,
  `Action: ${e.action??'-'} | interest_mode: ${e.selected_interest}`,
  `Selected evidence: ${JSON.stringify(e.plan?.selected_evidence_ids??[])}`,
  `Estimated supplemental context tokens (planning only): ${e.plan?.estimated_supplemental_context_tokens??'-'}`,
  `Provider input/output: ${e.usage?`${e.usage.promptTokens}/${e.usage.completionTokens}`:'not available'}`,
  `Attempts: ${e.attempts?.length??0}; retried for formatting: ${e.attempts?.some(a=>a.retry)??false}`,
  ...((e.attempts??[]).filter(a=>a.validation?.ok===false).map(a=>`Rejected attempt ${a.number}: ${a.validation.reason}; fields=${JSON.stringify(a.validation.field_diagnostics)}; raw_sha256=${a.validation.raw_sha256}; cost=${printable(a.costUsd??null)}`)),
  `Cost: ${printable(e.costUsd??null)}`);
  if(e.teaching)lines.push('MODEL B / LEARNER-FACING:',e.teaching.teaching_strategy,
    'INTERNAL NEXT STEP:',e.teaching.next_step,'INTERNAL VISUAL:',e.teaching.visual_intent);
  if(e.error)lines.push('ERROR:',e.error);
  lines.push('HUMAN REVIEW (unscored): conceptual accuracy [ ], naturalness [ ], correct action [ ], evidence continuity [ ], analogy fidelity [ ], teaching restraint [ ], learner follow-up evidence [ ]');
 }
 lines.push('',`COST LEDGER: ${JSON.stringify(trace.cost)}`,
  'LIMITATIONS: Contract and style regex flags are not expert-rated educational outcomes. Synthetic scenarios, no learner outcome validation.');
 return lines.join('\n')+'\n';
}
function writeTrace(trace){const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b4d',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});for(const [name,value] of [['trace.json',JSON.stringify(trace,null,2)+'\n'],['S16B4D_TEACHER_REVIEW.txt',report(trace)]])fs.writeFileSync(path.join(dir,name),value,{flag:'wx',mode:0o600});return dir;
}
export async function runComparison(f,{invoke=callModel,doRootCheck=true}={}){
 if(doRootCheck)checkRoot();
 let corpus=fixtures();if(f.scenario){corpus=corpus.filter(x=>x.id===f.scenario);if(!corpus.length)throw Error('Unknown scenario ID');}
 corpus=corpus.slice(0,f.limit);const planned=offlinePlan(corpus,f.variants);
 if(planned.some(x=>x.status!=='READY_EXPERIMENTAL_OPT_IN'))throw Error('Frozen scenario cannot be assembled without missing evidence');
 const maxOutput=370,perAttemptAdmission=(10000*0.4+maxOutput*1.6)/1000000;
 // At most two additional formatting calls across the entire evaluation, one per
 // malformed experimental variant. No automatic retry for transports or baseline.
 const retryAllowance=f.variants.some(x=>x!=='baseline')?Math.min(FIX2_MAX_RETRIES_PER_RUN,planned.filter(x=>x.variant!=='baseline').length):0;
 const maxAdmissionUsd=(planned.length+retryAllowance)*perAttemptAdmission;
 if(f.mode==='model'&&f.budget+1e-12<maxAdmissionUsd)throw Error(`Admission budget too low: ${planned.length} base + ${retryAllowance} potential formatting calls require at least USD ${maxAdmissionUsd.toFixed(4)}; NOT a billing cap.`);
 const results=[],cost={attemptedCalls:0,knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,notInvoice:true,
  validationFailures:0,formatRetriesAttempted:0,formatRetryRecoveries:0,maxFormatRetriesPerRun:retryAllowance,
  admissionBudgetUsd:f.budget,conservativeAdmissionEstimateUsd:maxAdmissionUsd,rateSource:'Existing MyWay model-token-usage.ts standard USD per million rates, recheck for billing'};
 let retriesAvailable=retryAllowance,stopRequested=false;
 for(const plan of planned){
  const e={scenario:plan.scenario,domain:plan.domain,variant:plan.variant,status:f.mode==='offline'?'OFFLINE_PREPARED':'PENDING',action:plan.action,
   selected_interest:plan.selected_interest,plan:plan.plan,usage:null,costUsd:null,teaching:null,attempts:[]};
  results.push(e);if(f.mode==='offline')continue;
  for(let attemptNo=1;attemptNo<=2;attemptNo++){
   const retry=attemptNo===2;
   if(retry){retriesAvailable--;cost.formatRetriesAttempted++;}
   const record={number:attemptNo,retry,usage:null,costUsd:null,validation:null};
   e.attempts.push(record);cost.attemptedCalls++;
   let response;
   try{
    const request=retry?{...plan.request,format_retry:true}:plan.request;
    response=await invoke(ENDPOINTS[plan.variant],request);
   }catch(err){e.status='STOPPED_ON_ERROR';e.error=String(err?.message??err).slice(0,500);record.error=e.error;
    cost.unknownOrIncompleteCalls++;cost.complete=false;stopRequested=true;break;}
   record.usage=response?.usage??null;record.costUsd=estimatedCost(response);
   e.usage=record.usage;
   if(record.costUsd===null){e.status='UNPRICED_STOP';e.error='Provider usage missing; further calls stopped.';
    cost.unknownOrIncompleteCalls++;cost.complete=false;stopRequested=true;break;}
   cost.knownEstimatedUsd+=record.costUsd;
   e.costUsd=(e.costUsd??0)+record.costUsd;
   const {parsed,diagnostic}=inspectTeacherOutput(response.raw);
   record.validation=diagnostic;
   if(diagnostic.ok){
    try{validateExistingModelBOutput(parsed);e.review=reviewTeachingResponse(parsed,{action:plan.action});}
    catch(err){e.status='STOPPED_ON_ERROR';e.error='Internal teaching compatibility check failed: '+String(err?.message??err).slice(0,300);
     record.error=e.error;stopRequested=true;break;}
    e.teaching=parsed;e.status='PROVIDER_VALIDATED_UNSCORED';
    if(retry)cost.formatRetryRecoveries++;
    break;
   }
   cost.validationFailures++;
   record.rejected_output=rejectedOutputEvidence(response.raw);
   const canRetry=!retry&&plan.variant!=='baseline'&&retriesAvailable>0;
   if(canRetry){record.status='FORMAT_VALIDATION_FAILED_RETRY_PLANNED';continue;}
   e.status='VALIDATION_STOP';e.error='Model B output failed validation: '+diagnostic.reason+'; '+JSON.stringify(diagnostic.field_diagnostics).slice(0,350);
   stopRequested=true;break;
  }
  if(stopRequested)break;
 }
 return {schema_version:EVALUATION_VERSION,mode:f.mode,scenario_ids:corpus.map(x=>x.id),variants:f.variants,results,cost,
  no_database_writes:true,no_profile_writes:true,no_canonical_root_writes:true,quality_scores_not_inferred:true};
}
async function main(){const f=parse(process.argv.slice(2));if(f.help){console.log('S1.6B.4D: --mode offline|model --limit 1..12 --variants baseline,contract,personalized --scenario ID --allow-spend --budget-usd 0.03..0.50. Only synthetic research fixtures; no database writes.');return;}
 console.log(`S1.6B.4D comparison | mode=${f.mode} | up to ${f.limit} scenarios | variants=${f.variants.join(',')} | LIVE DB WRITES=0`);
 if(f.mode==='model')console.log('EXPLICIT PAID OPT-IN; budget is admission control, NOT a hard billing cap. Requires the guarded Next.js server at 127.0.0.1:3001.');
 const trace=await runComparison(f);const dir=writeTrace(trace);
 for(const r of trace.results)console.log(`${r.scenario} | ${r.variant} | ${r.status} | interest=${r.selected_interest} | estimated_cost=${printable(r.costUsd)}`);
 console.log('NOTEPAD: '+path.join(dir,'S16B4D_TEACHER_REVIEW.txt'));
 console.log('TRACE: '+path.join(dir,'trace.json'));
 console.log('COST: '+JSON.stringify(trace.cost));
 if(trace.results.some(x=>['STOPPED_ON_ERROR','UNPRICED_STOP','VALIDATION_STOP'].includes(x.status)))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.4D REFUSED: '+e.message);process.exitCode=1;});
