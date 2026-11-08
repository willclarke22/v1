#!/usr/bin/env node
/** S1.6B.5.1: controlled teacher-voice A/B experiment on synthetic, frozen 4D data.
 * Adaptive and calibrated receive IDENTICAL evidence/action; only system voice changes.
 * No provider calls absent explicit --mode model --allow-spend and admission budget.
 * Does not write learner state, memory, profiles, canonical roots, or DB. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {assembleTeachingExperiment} from './s16b4d-integration.mjs';
import {inspectTeacherOutput,rejectedOutputEvidence,FIX2_MAX_RETRIES_PER_RUN} from './s16b4d-fix2-validation.mjs';
import {validateExistingModelBOutput} from './s16b4a-interfaces.mjs';
import {reviewTeachingResponse} from './s16b4c-voice.mjs';
import {inspectAdaptiveDialogue,S16B5_VOICE_VERSION} from './s16b5-dialogue.mjs';
import {inspectActionFidelity,S16B51_VOICE_VERSION} from './s16b51-fidelity.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const DATA='scripts/sandbox/learning-intelligence/s16b4d-fixtures.json';
const BASE='http://127.0.0.1:3001';
const TARGET=BASE+'/api/sandbox/probe-lab/local-assessment/s16b4d-teaching';
const VERSIONS=['current','adaptive','calibrated'];
const ACTIONS=['MED01','MED_REPAIR','BIO01','PHOTO_T10','PHOTO_T10A','MED_VERIFY','PROGRESS01'];
const FOCUSED=['PHOTO_T10','PHOTO_T10A','PROGRESS01','BIO01','LANG01','MED01'];
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
export function parseS16B51Args(argv){
 const out={mode:'offline',set:'focused',scenario:null,limit:3,variants:['adaptive','calibrated'],allowSpend:false,budget:null,help:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];if(a==='--help'){out.help=true;continue;}
  if(a==='--allow-spend'){out.allowSpend=true;continue;}
  if(!['--mode','--set','--scenario','--limit','--variants','--budget-usd'].includes(a))throw Error('Unsupported argument: '+a);
  if(i+1===argv.length)throw Error('Missing value for '+a);
  const v=argv[++i];if(a==='--mode')out.mode=v;else if(a==='--set')out.set=v;
  else if(a==='--scenario')out.scenario=v;else if(a==='--limit')out.limit=Number(v);
  else if(a==='--variants')out.variants=v.split(',');else out.budget=Number(v);
 }
 if(!['offline','model'].includes(out.mode)||!['focused','all','actions'].includes(out.set)||!Number.isInteger(out.limit)||out.limit<1||out.limit>12||
  !out.variants.length||out.variants.some(v=>!VERSIONS.includes(v))||new Set(out.variants).size!==out.variants.length)throw Error('Invalid evaluation options');
 if(out.mode==='offline'&&(out.allowSpend||out.budget!==null))throw Error('Offline refuses spend flags');
 if(out.mode==='model'&&(!out.allowSpend||!Number.isFinite(out.budget)||out.budget<0.03||out.budget>0.50))throw Error('Model mode requires --allow-spend --budget-usd 0.03..0.50');
 return out;
}
function frozen(){
 const file=fs.readFileSync(path.join(ROOT,DATA));
 if(SHA(file)!=='6af14d1e75d27693cfa8b4239b442279f575a2c6625602bdd9e403a449c72ccd')throw Error('Frozen dataset hash changed');
 const f=JSON.parse(file.toString());
 if(f.schema!=='myway_s16b4d_frozen_scenarios_v1'||f.scenarios.length!==12||f.scenarios.some(s=>s.privacy_class!=='synthetic_example_only'))throw Error('Invalid synthetic corpus');
 const extraBytes=fs.readFileSync(path.join(ROOT,'scripts/sandbox/learning-intelligence/s16b5-action-probes.json'));
 if(SHA(extraBytes)!=='b7e42cf52ac158f7c20a74bf241f09d69e95c35effe22854600eefc1f12d4f42')throw Error('Synthetic action probes hash changed');
 const extra=JSON.parse(extraBytes.toString());
 if(extra.schema!=='myway_s16b5_scripted_action_probes_v1'||extra.scenarios.length!==2||extra.scenarios.some(s=>s.privacy_class!=='synthetic_example_only'))throw Error('Invalid local synthetic action probes');
 return [...f.scenarios,...extra.scenarios];
}
function checkRoot(){
 if(path.basename(ROOT)!=='v1-learning-experiment')throw Error('Wrong worktree');
 if(execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8'}).trim()!=='myway/learning-sandbox-v3_7a')throw Error('Wrong experiment branch');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Local release drift');
 for(const stage of ['s16b4d','s16b4dfix1','s16b4dfix2','s16b51'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${stage}/installation.json`)))throw Error('Missing stage '+stage);
}
export function prepareS16B51Cases(scenarios,variants){return scenarios.flatMap(s=>variants.map(variant=>{
 const original=assembleTeachingExperiment({...s,variant:'contract'});
 if(original.status!=='READY_EXPERIMENTAL_OPT_IN')throw Error('Unsafe/missing selected history for '+s.id+': '+original.reason);
 const request=variant==='current'?original.request:{...original.request,voice_version:variant==='adaptive'?S16B5_VOICE_VERSION:S16B51_VOICE_VERSION};
 return {scenario:s.id,domain:s.domain,variant,action:original.action,interest:original.personalization?.use_interest??'do_not_use',
  selectedEvidence:original.audit.selected_evidence_ids,estimatedContextTokens:original.audit.estimated_supplemental_context_tokens,request};
}));}
async function modelInvoke(url,request){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),32000);
 try{const response=await fetch(url,{method:'POST',cache:'no-store',redirect:'error',signal:abort.signal,
  headers:{'Content-Type':'application/json','Origin':BASE},body:JSON.stringify(request)});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Error(`Local endpoint HTTP ${response.status}: ${typeof body?.error==='string'?body.error:'no diagnostic'}`);
  if(typeof body?.raw!=='string')throw Error('No structured response');
  return body;
 }finally{clearTimeout(timer);}
}
const estimate=response=>{
 const u=response?.usage;if(!u||!Number.isSafeInteger(u.promptTokens)||u.promptTokens<0||!Number.isSafeInteger(u.completionTokens)||u.completionTokens<0)return null;
 const c=u.cachedTokens??0;if(!Number.isSafeInteger(c)||c<0||c>u.promptTokens)return null;
 return ((u.promptTokens-c)*.4+c*.1+u.completionTokens*1.6)/1e6;
};
export async function runS16B51(options,{invoke=modelInvoke,rootCheck=true,scenarioCorpus=null}={}){
 if(rootCheck)checkRoot();
 let scenarios=scenarioCorpus??frozen();
 if(options.scenario){scenarios=scenarios.filter(s=>s.id===options.scenario);if(scenarios.length!==1)throw Error('Unknown scenario '+options.scenario);}
 else if(options.set==='focused'||options.set==='actions')scenarios=(options.set==='focused'?FOCUSED:ACTIONS).map(id=>{const s=scenarios.find(x=>x.id===id);if(!s)throw Error('Scenario missing: '+id);return s;});
 else scenarios=scenarios.filter(s=>!['MED_REPAIR','MED_VERIFY'].includes(s.id));
 scenarios=scenarios.slice(0,options.limit);
 const plans=prepareS16B51Cases(scenarios,options.variants);
 const retriesMax=Math.min(FIX2_MAX_RETRIES_PER_RUN,plans.length);
 // Conservative admission check, not a provider billing cap.
 const admitPerCall=(10000*.4+370*1.6)/1e6,maxAdmissionUsd=(plans.length+retriesMax)*admitPerCall;
 if(options.mode==='model'&&options.budget+1e-12<maxAdmissionUsd)throw Error(`Admission budget insufficient for ${plans.length} planned calls and ${retriesMax} possible retries: USD ${maxAdmissionUsd.toFixed(5)}`);
 const trace={version:'myway_s16b51_action_fidelity_eval_v1',mode:options.mode,scenarios:scenarios.map(s=>s.id),variants:options.variants,
  no_database_writes:true,no_memory_writes:true,no_profile_writes:true,quality_unscored:true,
  costs:{attemptedCalls:0,knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,validationFailures:0,retries:0,recoveries:0,
   admissionBudgetUsd:options.budget,conservativeAdmissionEstimateUsd:maxAdmissionUsd,notInvoice:true},results:[]};
 let retryBudget=retriesMax,stop=false;
 for(const p of plans){
  const row={scenario:p.scenario,domain:p.domain,variant:p.variant,action:p.action,interest:p.interest,selectedEvidence:p.selectedEvidence,
   estimatedContextTokens:p.estimatedContextTokens,status:options.mode==='offline'?'OFFLINE_PREPARED':'PENDING',response:null,costUsd:null,attempts:[]};
  trace.results.push(row);if(options.mode==='offline')continue;
  for(let n=1;n<=2;n++){
   if(n===2){retryBudget--;trace.costs.retries++;}
   const a={number:n,formatRetry:n===2};row.attempts.push(a);trace.costs.attemptedCalls++;
   let result;try{result=await invoke(TARGET,n===1?p.request:{...p.request,format_retry:true});}
   catch(error){row.status='STOPPED_ON_ERROR';row.error=String(error?.message??error).slice(0,500);
    trace.costs.unknownOrIncompleteCalls++;trace.costs.complete=false;stop=true;break;}
   a.usage=result.usage??null;a.costUsd=estimate(result);
   if(a.costUsd===null){row.status='UNPRICED_STOP';row.error='Missing usable provider token counts';trace.costs.complete=false;trace.costs.unknownOrIncompleteCalls++;stop=true;break;}
   trace.costs.knownEstimatedUsd+=a.costUsd;row.costUsd=(row.costUsd??0)+a.costUsd;
   const checked=inspectTeacherOutput(result.raw);a.validation=checked.diagnostic;
   if(checked.diagnostic.ok){
    try{validateExistingModelBOutput(checked.parsed);row.review=p.variant==='current'?reviewTeachingResponse(checked.parsed,{action:p.action}):p.variant==='adaptive'?inspectAdaptiveDialogue(checked.parsed,{action:p.action}):inspectActionFidelity(checked.parsed,{action:p.action});}
    catch(err){row.status='STOPPED_ON_ERROR';row.error='Compatibility validation failed: '+String(err?.message??err).slice(0,250);stop=true;break;}
    row.response=checked.parsed;row.status='PROVIDER_VALIDATED_UNSCORED';if(n===2)trace.costs.recoveries++;break;
   }
   trace.costs.validationFailures++;a.rejected=rejectedOutputEvidence(result.raw);
   if(n===1&&retryBudget>0){a.status='FORMAT_RETRY_PLANNED';continue;}
   row.status='VALIDATION_STOP';row.error=checked.diagnostic.reason+' '+JSON.stringify(checked.diagnostic.field_diagnostics).slice(0,320);stop=true;break;
  }
  if(stop)break;
 }
 return trace;
}
function report(trace){
 const out=[`MyWay S1.6B.5.1 | ${trace.mode.toUpperCase()} | synthetic paired voice comparison`,
  `Scenarios: ${trace.scenarios.join(', ')} | variants: ${trace.variants.join(', ')}`,
  'Current, adaptive, and calibrated variants use identical action, evidence and nonpersonalized profile; only voice_version differs.',
  'Every comparison here is NONPERSONALIZED. No interest or retrieval changes are being tested.',
  'No automated teaching-quality verdicts. Human review is required. Costs are estimates, not invoices.',''];
 for(const r of trace.results){out.push('='.repeat(72),`${r.scenario} | ${r.variant} | ${r.action} | ${r.status}`,
  `Selected historical evidence: ${JSON.stringify(r.selectedEvidence)} | interest: ${r.interest}`,
  `Attempts: ${r.attempts.length} | estimated USD: ${r.costUsd===null?'unknown':r.costUsd.toFixed(7)}`);
  if(r.response)out.push('LEARNER-FACING RESPONSE:',r.response.teaching_strategy,'INTERNAL NEXT STEP:',r.response.next_step,'INTERNAL VISUAL:',r.response.visual_intent);
  if(r.error)out.push('ERROR:',r.error);
  for(const a of r.attempts.filter(a=>a.validation?.ok===false))out.push('REJECTED FORMAT:',JSON.stringify(a.validation.field_diagnostics),`Rejected raw SHA: ${a.rejected?.sha256??a.validation.raw_sha256}`);
  out.push('HUMAN PAIRWISE REVIEW (blank): specific correction owned [ ] | correct old/current focus [ ] | closure restraint [ ] | reported vs demonstrated progress [ ] | teaching next-move fidelity [ ] | naturalness [ ] | accuracy [ ]', '');
 }
 out.push('COST LEDGER: '+JSON.stringify(trace.costs),
  'LIMITATION: Synthetic contexts, not observed longitudinal learning. Heuristic warnings are NOT action-fidelity grades. No proof of mastery or memory repair.');
 return out.join('\n')+'\n';
}
function writeReport(trace){const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b51',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'S16B51_ACTION_FIDELITY_SIDE_BY_SIDE.txt'),report(trace),{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(dir,'trace.json'),JSON.stringify(trace,null,2)+'\n',{flag:'wx',mode:0o600});return dir;}
async function main(){const o=parseS16B51Args(process.argv.slice(2));if(o.help){console.log('S1.6B.5.1 --mode offline|model --set focused|all|actions --scenario ID --limit 1..12 --variants adaptive,calibrated,current --allow-spend --budget-usd 0.03..0.50; default FREE offline focused 3 scenarios.');return;}
 console.log(`S1.6B.5.1 paired dialogue | ${o.mode} | ${o.set} | limit=${o.limit} | variants=${o.variants.join(',')} | LIVE DB WRITES=0`);
 if(o.mode==='model')console.log('PAID OPT-IN; admission budget is NOT a billing cap. Guarded local Next server required at 127.0.0.1:3001.');
 const result=await runS16B51(o),dir=writeReport(result);
 for(const x of result.results)console.log(`${x.scenario} | ${x.variant} | ${x.action} | ${x.status} | USD=${x.costUsd===null?'unknown':x.costUsd.toFixed(7)}`);
 console.log('REVIEW: '+path.join(dir,'S16B51_ACTION_FIDELITY_SIDE_BY_SIDE.txt'));console.log('TRACE: '+path.join(dir,'trace.json'));console.log('COST: '+JSON.stringify(result.costs));
 if(result.results.some(x=>['STOPPED_ON_ERROR','UNPRICED_STOP','VALIDATION_STOP'].includes(x.status)))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S1.6B.5.1 REFUSED: '+e.message);process.exitCode=1;});
