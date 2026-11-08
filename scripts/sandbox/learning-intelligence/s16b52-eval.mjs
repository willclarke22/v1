#!/usr/bin/env node
/** MyWay S1.6B.5.2 realism research harness.
 * Offline by default; paid model inference only after explicit CLI opt-in.
 * Staged authored action vs EXISTING heuristic-plus-planner proxy, not real full app routing.
 * Never writes a learner, memory, DB, profile, production, or source artifact. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {loadRealismCorpus,prepareCase,corpusCoverage,SHA} from './s16b52-corpus.mjs';
import {inspectTeacherOutput,rejectedOutputEvidence,FIX2_MAX_RETRIES_PER_RUN} from './s16b4d-fix2-validation.mjs';
import {validateExistingModelBOutput} from './s16b4a-interfaces.mjs';
import {inspectAdaptiveDialogue} from './s16b5-dialogue.mjs';
import {inspectActionFidelity} from './s16b51-fidelity.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const BASE='http://127.0.0.1:3001';
const ENDPOINT=BASE+'/api/sandbox/probe-lab/local-assessment/s16b4d-teaching';
export const VERSION='myway_s16b52_realism_harness_v1';
const MAX_BUDGET_USD=0.50;
function clampError(x){return String(x?.message??x).slice(0,400);}
const stableSort=(a,b)=>SHA('blind'+a.scenario+a.routing).localeCompare(SHA('blind'+b.scenario+b.routing));
export function parseRealismArgs(argv){
 const o={mode:'offline',set:'development',routing:'both',voice:'adaptive',limit:null,case:null,thread:null,allowSpend:false,budget:null,unlockHoldout:false,help:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];if(a==='--help'){o.help=true;continue;}if(a==='--allow-spend'){o.allowSpend=true;continue;}if(a==='--unlock-holdout'){o.unlockHoldout=true;continue;}
  if(!['--mode','--set','--routing','--voice','--limit','--case','--thread','--budget-usd'].includes(a))throw Error('Unsupported CLI flag: '+a);
  if(i+1===argv.length)throw Error('Missing value for '+a);const v=argv[++i];if(a==='--mode')o.mode=v;else if(a==='--set')o.set=v;else if(a==='--routing')o.routing=v;
  else if(a==='--voice')o.voice=v;else if(a==='--limit')o.limit=Number(v);else if(a==='--case')o.case=v;else if(a==='--thread')o.thread=v;else o.budget=Number(v);
 }
 if(!['offline','model'].includes(o.mode)||!['development','holdout','all'].includes(o.set)||!['oracle','inferred','both'].includes(o.routing)||!['adaptive','calibrated'].includes(o.voice))throw Error('Invalid mode/set/routing/voice');
 if(o.limit===null)o.limit=o.mode==='offline'?12:3;
 if(!Number.isInteger(o.limit)||o.limit<1||o.limit>(o.mode==='model'?6:48))throw Error('Evaluation limit out of bounds (model <=6, offline <=48)');
 if(o.case!==null&&!/^R52-[A-Z]+-\d\d$/.test(o.case))throw Error('Invalid case ID');
 if(o.thread!==null&&!/^[A-Z]{2,8}$/.test(o.thread))throw Error('Invalid thread ID');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==null))throw Error('Offline mode refuses paid flags');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<0.03||o.budget>MAX_BUDGET_USD))throw Error('Explicit --allow-spend and --budget-usd 0.03..0.50 required');
 if((o.set==='holdout'||o.set==='all')&&!o.unlockHoldout)throw Error('Holdout locked; use --unlock-holdout explicitly when ready to inspect');
 return o;
}
function checkRoot(){
 if(path.basename(ROOT).toLowerCase()!=='v1-learning-experiment')throw Error('Wrong experimental worktree');
 if(execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:5000}).trim()!=='myway/learning-sandbox-v3_7a')throw Error('Wrong branch');
 if(JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sandbox/current-local-release.json'),'utf8')).release!=='v37d2c7a3s12')throw Error('Local release changed');
 for(const suffix of ['s16b5','s16b51','s16b52'])if(!fs.existsSync(path.join(ROOT,`scripts/sandbox/v37d2c7a3${suffix}/installation.json`)))throw Error('Missing installed stage '+suffix);
}
export function selectCases(c,o){let rows=c.snapshots.filter(s=>o.set==='all'||s.split===o.set);
 if(o.thread)rows=rows.filter(x=>x.thread_id===o.thread);
 if(o.case)rows=rows.filter(x=>x.id===o.case);
 if(o.case&&rows.length!==1)throw Error('Case not in selected set or unknown');
 if(o.thread&&rows.length===0)throw Error('Thread not found in selected set');
 return rows.slice(0,o.limit);
}
function requestCost(response){const u=response?.usage;if(!u||!Number.isSafeInteger(u.promptTokens)||u.promptTokens<0||!Number.isSafeInteger(u.completionTokens)||u.completionTokens<0)return null;
 const c=u.cachedTokens??0;if(!Number.isSafeInteger(c)||c<0||c>u.promptTokens)return null;
 return ((u.promptTokens-c)*.4+c*.1+u.completionTokens*1.6)/1e6;
}
async function modelInvoke(request){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),32000);
 try{const r=await fetch(ENDPOINT,{method:'POST',cache:'no-store',redirect:'error',signal:abort.signal,
  headers:{'Content-Type':'application/json','Origin':BASE},body:JSON.stringify(request)});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Error(`Local endpoint HTTP ${r.status}: ${typeof data?.error==='string'?data.error:'no diagnostic'}`);
  if(typeof data?.raw!=='string')throw Error('No structured model output');return data;
 }finally{clearTimeout(timer);}
}
export async function runRealism(o,{rootCheck=true,invoke=modelInvoke,corpus=null}={}){
 if(rootCheck)checkRoot();const c=corpus??loadRealismCorpus();const cases=selectCases(c,o);
 const routes=o.routing==='both'?['oracle','inferred']:[o.routing];
 const prepared=cases.flatMap(s=>routes.map(r=>({case:s,routing:r,plan:prepareCase(s,{routing:r,voice:o.voice})})));
 const numCalls=prepared.filter(x=>x.plan.status==='PREPARED').length;
 const retryMax=Math.min(FIX2_MAX_RETRIES_PER_RUN,numCalls);
 // Admission estimate is intentionally conservative and is not a billing guarantee.
 const admission=(numCalls+retryMax)*((10000*.4+370*1.6)/1e6);
 if(o.mode==='model'&&o.budget+1e-12<admission)throw Error(`Insufficient admission budget for ${numCalls} planned requests and ${retryMax} format retries: USD ${admission.toFixed(5)}`);
 const trace={schema:VERSION,mode:o.mode,set:o.set,routing:o.routing,voice:o.voice,scenarios:cases.map(x=>x.id),
  provenance:'entirely_synthetic_no_observed_learners',routing_proxy:'s16b3-intent_heuristic_plus_s16b4c_deterministic_planner_not_production_end_to_end',
  action_truth:'author_assigned_not_expert_verified',no_db_writes:true,no_memory_writes:true,no_profile_writes:true,
  costs:{attemptedCalls:0,knownEstimatedUsd:0,unknownOrIncompleteCalls:0,complete:true,validationFailures:0,retries:0,recoveries:0,admissionBudgetUsd:o.budget,conservativeAdmissionEstimateUsd:admission,notInvoice:true},
  coverage:corpusCoverage(c),results:[]};
 let retryBudget=retryMax,stop=false;
 for(const {case:s,routing,plan} of prepared){const row={scenario:s.id,thread:s.thread_id,domain:s.domain,split:s.split,
  raw_learner_message:s.raw_learner_message,raw_prior_turns:s.prior_turns,routing,voice:o.voice,
  expected_action_for_analysis:s.oracle.action,acceptable_actions_for_analysis:s.oracle.acceptable_actions,
  scenario_ambiguity:s.scenario_ambiguity,realism_tags:s.realism_tags,selected_history:plan.selected,planning:plan.trace,
  action:plan.action,status:plan.status==='PREPARED'?(o.mode==='offline'?'OFFLINE_PREPARED':'PENDING'):'SAFE_HOLD',
  reason:plan.reason??null,costUsd:null,response:null,attempts:[]};trace.results.push(row);
  if(plan.status!=='PREPARED'||o.mode==='offline')continue;
  for(let attempt=1;attempt<=2;attempt++){
   if(attempt===2){retryBudget--;trace.costs.retries++;}trace.costs.attemptedCalls++;
   const a={number:attempt,formatRetry:attempt===2};row.attempts.push(a);
   let resp;try{resp=await invoke(attempt===2?{...plan.request,format_retry:true}:plan.request);}
   catch(error){row.status='TRANSPORT_STOP';row.reason=clampError(error);trace.costs.unknownOrIncompleteCalls++;trace.costs.complete=false;stop=true;break;}
   a.usage=resp.usage??null;a.costUsd=requestCost(resp);
   if(a.costUsd===null){row.status='UNPRICED_STOP';row.reason='Missing usable provider token counts';trace.costs.unknownOrIncompleteCalls++;trace.costs.complete=false;stop=true;break;}
   trace.costs.knownEstimatedUsd+=a.costUsd;row.costUsd=(row.costUsd??0)+a.costUsd;
   const checked=inspectTeacherOutput(resp.raw);a.validation=checked.diagnostic;
   if(checked.diagnostic.ok){try{validateExistingModelBOutput(checked.parsed);
    row.review_warning=o.voice==='adaptive'?inspectAdaptiveDialogue(checked.parsed,{action:plan.action}):inspectActionFidelity(checked.parsed,{action:plan.action});}
    catch(error){row.status='VALIDATION_STOP';row.reason=clampError(error);stop=true;break;}
    row.status='PROVIDER_VALIDATED_UNSCORED';row.response=checked.parsed;if(attempt===2)trace.costs.recoveries++;break;
   }
   trace.costs.validationFailures++;a.rejected=rejectedOutputEvidence(resp.raw);
   if(attempt===1&&retryBudget>0){a.status='FORMAT_RETRY_PLANNED';continue;}
   row.status='FORMAT_STOP';row.reason=checked.diagnostic.reason;stop=true;break;
  }
  if(stop)break;
 }
 trace.audit={prepared:trace.results.filter(x=>x.status!=='SAFE_HOLD').length,held:trace.results.filter(x=>x.status==='SAFE_HOLD').length,
  exactActionMatches:trace.results.filter(x=>x.action!==null&&x.action===x.expected_action_for_analysis).length,
  acceptedActionMatches:trace.results.filter(x=>x.action!==null&&x.acceptable_actions_for_analysis.includes(x.action)).length,
  mismatchCount:trace.results.filter(x=>x.action!==null&&!x.acceptable_actions_for_analysis.includes(x.action)).length,
  basis:'author_labels_and_existing_routing_heuristic_only_not_validated_learner_outcomes'};
 return trace;
}
function redactLabel(name){return 'R-'+SHA('blind-review-'+name).slice(0,10).toUpperCase();}
export function reviewText(trace){
 const byId=new Map();for(const r of trace.results){if(!byId.has(r.scenario))byId.set(r.scenario,[]);byId.get(r.scenario).push(r);}
 const out=[`MYWAY S1.6B.5.2 — REALISM AND EVIDENCE BENCHMARK (${trace.mode})`,
  'All utterances and histories below are SCRIPTED SYNTHETIC data, not observed real learners.',
  'Author-assigned actions are tentative reference labels, NOT expert-validated gold standards.',
  'Inferred routing = legacy S1.6B.3 intent heuristic + S1.6B.4C deterministic planner, NOT production end-to-end routing.',
  'Offline mode prepares inputs only; no responses and no pedagogical quality scores.',
  `Scenarios: ${trace.scenarios.join(', ')} | mode=${trace.mode} | split=${trace.set} | voice=${trace.voice}`,
  `AUDIT: ${JSON.stringify(trace.audit)}`,''];
 for(const [id,rows] of byId){const r=rows[0];out.push('='.repeat(76),`${id} | ${r.domain} | ${r.scenario_ambiguity} | ${r.split}`,'RAW SCRIPTED CONVERSATION:');
  for(const t of r.raw_prior_turns)out.push(`${t.role==='learner'?'LEARNER':'SCRIPTED TUTOR'} [${t.turn_id}]: ${t.text}`);
  out.push(`CURRENT LEARNER [${id}]: ${r.raw_learner_message}`);
  for(const item of rows)out.push(`ROUTE ${item.routing}: status=${item.status}; planned_action=${item.action??'NONE'}; expectation=${item.expected_action_for_analysis}; acceptable=${item.acceptable_actions_for_analysis.join('|')}`,
    `Route reason: ${item.reason??'-'}; selected RAW history: ${JSON.stringify(item.selected_history.map(x=>({id:x.evidence_id,source:x.source,text:x.text})))}`,
    item.response?`MODEL B LEARNER-FACING: ${item.response.teaching_strategy}\nINTERNAL NEXT STEP: ${item.response.next_step}\nINTERNAL VISUAL: ${item.response.visual_intent}`:'MODEL B: not generated',
    'Human review not scored: intent [ ] | action fidelity [ ] | history truth [ ] | conceptual accuracy [ ] | naturalness [ ] | progress calibration [ ] | teaching restraint [ ] | next-step usefulness [ ]');
 }
 out.push('\nCOST LEDGER: '+JSON.stringify(trace.costs),'IMPORTANT LIMITATIONS: Curated synthetic scripts and authored expected actions are not representative real usage. R52 holdout is only held out from iteration; it is not independent human validation.');
 return out.join('\n')+'\n';
}
export function blindReviewText(trace){const rows=trace.results.filter(x=>x.response).slice().sort(stableSort);
 const out=[`MYWAY S16B52 BLIND HUMAN REVIEW | ${rows.length} model responses`,
  'Do not open answer-key.json until scores are submitted. Do not infer performance from formatting or length.',
  'Synthetic scripted context is included so reviewers can verify whether claims are grounded; variants and intended actions are masked.',''];
 for(const r of rows){out.push('='.repeat(72),`CODE: ${redactLabel(r.scenario+':'+r.routing)}`,`SUBJECT: ${r.domain}`,
  ...r.raw_prior_turns.map(t=>`${t.role==='learner'?'LEARNER':'SCRIPTED TUTOR'}: ${t.text}`),`CURRENT LEARNER: ${r.raw_learner_message}`,
  'MODEL REPLY:',r.response.teaching_strategy,'SCORE 1–5: intent [ ] | action fidelity [ ] | history truth [ ] | accuracy [ ] | naturalness [ ] | progress [ ] | restraint [ ] | next move [ ]',
  'SEVERITY (none / minor / major / critical): [ ]  REVIEWER NOTES:','');}
 return out.join('\n')+'\n';
}
function csvEscape(x){return `"${String(x??'').replaceAll('"','""')}"`;}
export function blindReviewCSV(trace){const head=['blind_code','domain','intent_1_5','action_fidelity_1_5','history_truth_1_5','conceptual_accuracy_1_5','naturalness_1_5','progress_calibration_1_5','restraint_1_5','next_move_1_5','severity_none_minor_major_critical','reviewer_notes'];
 const rows=trace.results.filter(x=>x.response).slice().sort(stableSort).map(r=>[redactLabel(r.scenario+':'+r.routing),r.domain,...Array(head.length-2).fill('')]);
 return [head,...rows].map(row=>row.map(csvEscape).join(',')).join('\n')+'\n';
}
export function answerKey(trace){return trace.results.filter(x=>x.response).map(r=>({blind_code:redactLabel(r.scenario+':'+r.routing),scenario:r.scenario,routing:r.routing,planned_action:r.action,reference_action:r.expected_action_for_analysis,acceptable:r.acceptable_actions_for_analysis}));}
export function writeRealismReport(trace,{root=ROOT}={}){
 const folder=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s16b52',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(folder,{recursive:true});const files={
  'S16B52_REALISM_AUDIT.txt':reviewText(trace),'S16B52_BLIND_REVIEW.txt':blindReviewText(trace),
  'S16B52_SCORECARD.csv':blindReviewCSV(trace),'answer-key.json':JSON.stringify(answerKey(trace),null,2)+'\n','trace.json':JSON.stringify(trace,null,2)+'\n'};
 for(const [name,contents] of Object.entries(files))fs.writeFileSync(path.join(folder,name),contents,{encoding:'utf8',flag:'wx',mode:0o600});return folder;
}
async function main(){const o=parseRealismArgs(process.argv.slice(2));if(o.help){console.log('Usage: node .../s16b52-eval.mjs --mode offline|model --set development|holdout|all --routing oracle|inferred|both --limit N --voice adaptive|calibrated [--case CASE] [--thread ID] [--unlock-holdout] [--allow-spend --budget-usd 0.05]. Offline by default.');return;}
 console.log(`S1.6B.5.2 realism | mode=${o.mode} split=${o.set} routing=${o.routing} limit=${o.limit} voice=${o.voice} | LIVE DB WRITES=0`);
 if(o.mode==='model')console.log('EXPLICIT PAID OPT-IN; admission budget is NOT a hard billing cap. Requires guarded Next.js at 127.0.0.1:3001.');
 const result=await runRealism(o),folder=writeRealismReport(result);
 for(const r of result.results)console.log(`${r.scenario} | ${r.routing} | ${r.action??'held'} | ${r.status} | cost=${r.costUsd===null?'unknown':r.costUsd.toFixed(7)}`);
 console.log('ROUTING AUDIT:',JSON.stringify(result.audit));console.log('COVERAGE:',JSON.stringify(result.coverage));
 console.log('REVIEW:',path.join(folder,'S16B52_REALISM_AUDIT.txt'));console.log('BLIND:',path.join(folder,'S16B52_BLIND_REVIEW.txt'));
 console.log('TRACE:',path.join(folder,'trace.json'));console.log('COST:',JSON.stringify(result.costs));
 if(result.results.some(x=>['TRANSPORT_STOP','UNPRICED_STOP','FORMAT_STOP','VALIDATION_STOP'].includes(x.status)))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(err=>{console.error('S1.6B.5.2 REFUSED:',clampError(err));process.exitCode=1;});
