#!/usr/bin/env node
/** S61-FIX3 frozen-context A/B comparison: research-only, no memory/application/database writes.
 * Uses the same exact stored model-facing input and role prompt; changes only model selection.
 * This is a matched per-turn replay, NOT a causal estimate of full-journey educational benefit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const BASE=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports');
const REPORT_BASE=path.join(BASE,'s16b61fix3');
const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex');
const json=(x)=>JSON.stringify(x);
const bytes=x=>Buffer.byteLength(json(x));
const clean=x=>typeof x==='string'?x.replace(/\0/g,'').trim():'';
const toIds=(a)=>{
 const ids=[];for(const item of a?.observed_understanding??[])ids.push(...(item.observation_ids??[]));
 for(const item of a?.possible_underlying_causes??[])ids.push(...(item.support_ids??[]),...(item.counter_ids??[]));
 for(const key of ['root_actions','relationship_actions','teaching_effect_hypotheses'])for(const item of a?.[key]??[])ids.push(...(item.observation_ids??[]),...(item.observations??[]));
 return [...new Set(ids.filter(x=>typeof x==='string'))];
};
const roleOutput=(step,role)=>step[`model_${role.toLowerCase()}`];
const requiredTraceModel=(trace,role)=>trace.options?.models?.[role]??trace.options?.[`model${role}`];
function safeReportLocation(filepath){const r=path.resolve(filepath);if(!r.startsWith(BASE+path.sep)||path.basename(r)!=='trace.json'||!fs.statSync(r).isFile())throw Error('Trace must be a previous S61 trace.json under ignored report root');return r;}
export function parseArgs(argv){
 const o={mode:'offline',role:'A',trace:'',model:'gpt-4.1',limit:12,budget:0,allowSpend:false,resume:'',retryFailed:false};
 const allowed={'--mode':'mode','--role':'role','--trace':'trace','--model':'model','--limit':'limit','--budget-usd':'budget','--resume':'resume'};
 for(let i=0;i<argv.length;i++){
  const v=argv[i];if(v==='--allow-spend'){o.allowSpend=true;continue;}if(v==='--retry-failed'){o.retryFailed=true;continue;}
  if(!Object.hasOwn(allowed,v)||i+1>=argv.length)throw Error('Invalid FIX3 option '+v);o[allowed[v]]=argv[++i];
 }
 o.limit=Number(o.limit);o.budget=Number(o.budget);
 if(!['offline','model'].includes(o.mode)||!['A','B'].includes(o.role)||!Object.hasOwn(PRICING,o.model)||!Number.isInteger(o.limit)||o.limit<1||o.limit>40||!o.trace)throw Error('Invalid FIX3 configuration');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>5))throw Error('Model replay requires --allow-spend and positive USD budget at most 5');
 if(o.mode==='offline'&&(o.allowSpend||o.budget!==0))throw Error('Offline mode never authorizes API spend');
 if(o.retryFailed&&!o.resume)throw Error('--retry-failed requires --resume');
 return o;
}
export function prepare(trace,opts){
 if(trace.schema!=='myway_s16b61_longitudinal_v1'||trace.run_type!=='model'||trace.summary?.run_complete!==true)throw Error('Only a COMPLETE real-model S61 learning journey can be matched');
 if(trace.private_truth_in_A_B_C!==false||trace.database_writes!==0)throw Error('Research isolation not verified in source trace');
 const baselineModel=requiredTraceModel(trace,opts.role);
 if(baselineModel!=='gpt-4.1-mini')throw Error(`Expected archived gpt-4.1-mini baseline for ${opts.role}, found ${baselineModel??'unknown'}`);
 if(opts.model===baselineModel)throw Error('Select a different candidate model for the actual comparison');
 const steps=trace.timeline.filter(s=>s.model_inputs?.[opts.role]).slice(0,opts.limit);
 if(steps.length!==opts.limit)throw Error('Not enough complete frozen steps for requested limit');
 for(const s of steps){const x=s.model_inputs[opts.role];if(x.role!==opts.role||x.latest_observation_id!==s.learner_observation_id||!roleOutput(s,opts.role))throw Error('Trace input/output mismatch at step '+s.step);
  if(!x.allowed_observation_ids?.includes(s.learner_observation_id))throw Error('Current evidence ID not in frozen context at step '+s.step);
  const encoded=json(x);if(/private_fictional_state_not_truth|private_answer_key|hidden_learner_truth/.test(encoded))throw Error('Private simulated state leaked to frozen context');
 }
 return {steps,baselineModel};
}
function structuralDiagnostics(answer,input,role){
 const allowed=new Set(input.allowed_observation_ids??[]),cited=toIds(answer),unknown=cited.filter(id=>!allowed.has(id));
 const roots=new Set((input.context?.roots??[]).map(x=>x.id).filter(Boolean));
 const nonexistentRootActions=(answer?.root_actions??[]).filter(x=>x.existing_id&&!roots.has(x.existing_id)).map(x=>({id:x.existing_id,action:x.action}));
 const actionCounts=Object.fromEntries(['propose','support','weaken','refine','challenge','no_change'].map(a=>[a,(answer?.root_actions??[]).filter(x=>x.action===a).length]));
 return {cited_observation_ids:cited,unknown_citation_ids:unknown,root_ids_outside_supplied_packet:nonexistentRootActions,root_action_counts:actionCounts,structurally_clean:unknown.length===0&&nonexistentRootActions.length===0,note:role==='A'?'These are reference-integrity checks only; not judgments of correct causal inference.':'Tutor prose correctness and helpfulness require independent assessment.'};
}
function actions(a,field){return (a?.[field]??[]).map(x=>({...x}));}
function publicEvidence(step,role){const input=step.model_inputs[role];return {
  step:step.step,topic_id:step.topic_id,topic_title:step.topic_title,learner_observation_id:step.learner_observation_id,
  current_learner_message:step.learner,prior_tutor_reply:input.recent_dialogue?.at(-1)?.tutor??null,
  current_probe_conditions:input.probe_conditions??null,
  allowed_observation_ids:input.allowed_observation_ids,
  observations:input.context?.observations??[],
  roots:input.context?.roots??[],relationships:input.context?.relationships??[],
  recent_dialogue:input.recent_dialogue??[],
  context_coverage:input.context?.coverage??{},
  remembered_model_a_advisory:role==='B'?input.model_a_provisional_advisory??null:null,
  instruction:'Historical root hypotheses are provisional, not independent evidence of CURRENT confusion. Responses after teaching can be primed.'
 };}
function candidateValue(res,role){return typeof res?.raw==='string'?parseResult(res.raw,role):res?.raw??res;}
const sampleOut=(a,role)=> role==='A'?{
 observed_understanding:a?.observed_understanding??[],presenting_difficulty:a?.presenting_difficulty??null,
 possible_underlying_causes:a?.possible_underlying_causes??[],root_actions:actions(a,'root_actions'),relationship_actions:actions(a,'relationship_actions'),
 teaching_effect_hypotheses:a?.teaching_effect_hypotheses??[],overall_uncertainty:a?.overall_uncertainty??null,next_probe:a?.next_probe??null
}:{reply:a?.reply??null,probe_offer:a?.probe_offer??null,context_request:a?.context_request??null};
export function renderComparison(report){
 const lines=['# MyWay S61-FIX3 — Frozen Evidence Model Comparison','',
  '**Research-only. No model receives the fictional learner private profile. No assessment automatically determines a winner.**','',
  `**Role:** ${report.role}; **baseline:** ${report.baseline_model}; **candidate:** ${report.candidate_model}; **source trace:** SHA-256 ${report.source_trace_sha256}.`,
  `**Compared:** ${report.results.filter(r=>r.status==='complete').length}/${report.requested_steps} steps. **API calls:** ${report.cost.calls}; **estimated USD:** $${report.cost.estimated_usd.toFixed(6)} (not an invoice/cap).`,
  '', '## Interpretation rules','',
  '1. Same stored final-pass prompt input, same role schema, different model. The original run may have used earlier context-expansion calls, so this isolates the FINAL recorded decision, not the entire multi-pass process.',
  '2. An action labelled `support` is not automatically correct when the new learner response is correct; examine the hypothesis and its historical/counter evidence.',
  '3. Zero new relationships can be a correct abstention. A new root can be an overreach. Neither output count nor agreement proves quality.',
  '4. The learner is synthetic. This measures model assessment of recorded evidence, not human learning or a causal benefit of MyWay memory.',
  '', '## Step-by-step decisions',''];
 for(const item of report.results){lines.push(`### Step ${item.step} — ${item.topic_title??item.topic_id}`,`Learner: ${item.learner_message}`);
  if(item.status!=='complete'){lines.push(`Comparison incomplete: ${item.status} (${item.error??''})`,'');continue;}
  if(report.role==='A'){
   lines.push(`**Baseline presenting difficulty:** ${item.baseline.presenting_difficulty??'none'}`,
    `**Candidate presenting difficulty:** ${item.candidate.presenting_difficulty??'none'}`,
    `**Baseline root actions:** ${json(item.baseline.root_actions??[])}`,
    `**Candidate root actions:** ${json(item.candidate.root_actions??[])}`,
    `**Baseline relationship actions:** ${json(item.baseline.relationship_actions??[])}`,
    `**Candidate relationship actions:** ${json(item.candidate.relationship_actions??[])}`);
  }else lines.push(`**Baseline tutor:** ${item.baseline.reply??''}`,`**Candidate tutor:** ${item.candidate.reply??''}`);
  lines.push(`**Invalid citations:** baseline ${item.baseline_checks.unknown_citation_ids.length}, candidate ${item.candidate_checks.unknown_citation_ids.length}`,'');
 }
 return lines.join('\n')+'\n';
}
export function renderBlindWorksheet(report){
 const lines=['# Independent blind review worksheet — S61-FIX3','',
 'The order of X/Y is balanced deterministically across steps. Model identities are withheld here and appear only in UNBLINDING_KEY.json. Review the evidence first; do not treat the old or newer model as ground truth.',
 '', '**For each step, evaluate:** (i) scientific interpretation of current learner response, (ii) presenting difficulty, (iii) whether any learner-specific root action is justified by NEW evidence, (iv) counterevidence and plausible alternatives, (v) justified relationship creation or abstention, (vi) the degree of priming by prior teaching. Mark **insufficient evidence** where appropriate.',
 '','## Evaluator summary (fill manually)','',
 '| Step | X: appropriate / mixed / unsupported / unclear | Y: appropriate / mixed / unsupported / unclear | Independent cited reasons |','|---|---|---|---|'];
 for(const row of report.results)if(row.status==='complete')lines.push(`| ${row.step} |  |  |  |`);
 lines.push('', '## Evidence and blind candidates','');
 for(const row of report.results){if(row.status!=='complete')continue;
  lines.push(`### Step ${row.step}: ${row.topic_title}`,`**Learner observation:** ${row.learner_message}`,
   `**Previous tutor message (if present):** ${row.public_evidence.prior_tutor_reply??'none'}`,
   `**Current probe conditions:** ${json(row.public_evidence.current_probe_conditions)}`,
   '**Relevant retrieved observations:**', '');
  for(const x of row.public_evidence.observations)lines.push(`- **${x.id}** [${x.topic_id??'unknown'}]: ${x.text??''}`);
  lines.push('', '**Provisional historical root context:**',json(row.public_evidence.roots), '');
  const invert=(row.step%2===0);const X=invert?row.candidate:row.baseline;const Y=invert?row.baseline:row.candidate;
  lines.push('**Candidate X:**', '```json',JSON.stringify(X,null,2),'```','', '**Candidate Y:**','```json',JSON.stringify(Y,null,2),'```','',
   '**Independent reasoning:** _(write evidence for and against, what was actually tested, alternatives and whether the answer followed hints)_','');
 }
 return lines.join('\n')+'\n';
}
function saveAtomic(file,data){const temp=file+'.tmp';fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file);}
function refresh(report,dir){
 report.completed=report.results.filter(r=>r.status==='complete').length;
 report.complete=report.completed===report.requested_steps;
 saveAtomic(path.join(dir,'COMPARISON.json'),JSON.stringify(report,null,2)+'\n');
 saveAtomic(path.join(dir,'COMPARISON_READABLE.md'),renderComparison(report));
 saveAtomic(path.join(dir,'INDEPENDENT_BLIND_REVIEW.md'),renderBlindWorksheet(report));
 saveAtomic(path.join(dir,'UNBLINDING_KEY.json'),JSON.stringify({warning:'Unblind only AFTER judging evidence; odd steps X=baseline, even steps X=candidate',steps:report.results.filter(x=>x.status==='complete').map(x=>({step:x.step,X:x.step%2===0?'candidate':'baseline',Y:x.step%2===0?'baseline':'candidate'}))},null,2)+'\n');
}
export async function runComparison(trace,opts,{invoke,reportDir,sourceTraceHash}={}){
 const {steps,baselineModel}=prepare(trace,opts);
 const traceHash=sourceTraceHash??sha(json(trace));
 let report;
 if(reportDir&&fs.existsSync(path.join(reportDir,'COMPARISON.json'))){
  report=JSON.parse(fs.readFileSync(path.join(reportDir,'COMPARISON.json'),'utf8'));
  if(report.schema!=='myway_s61fix3_frozen_comparison_v1'||report.source_trace_sha256!==traceHash||report.role!==opts.role||report.candidate_model!==opts.model||report.requested_steps!==steps.length||report.mode!==opts.mode)throw Error('Cannot resume report with mismatched trace/role/model/limit');
 }else report={schema:'myway_s61fix3_frozen_comparison_v1',research_only:true,source_trace_sha256:traceHash,
  source_context:'stored final model-facing input',role:opts.role,mode:opts.mode,baseline_model:baselineModel,candidate_model:opts.model,
  requested_steps:steps.length,completed:0,complete:false,run_conditions:{prompt:trace.options?.prompt,context_history:'frozen from original mini journey',models_changed_in_interactive_journey:false},
  note:'A frozen replay is not a full-journey comparison. Inputs include the original learner responses and original Model A/B memory trajectory.',
  cost:{calls:0,estimated_usd:0,unknown_usage:0,hard_billing_cap:false},results:[]};
 const remaining=steps.filter(s=>!report.results.some(r=>r.step===s.step&&(r.status==='complete'||r.status==='uncertain_charge')));
 if(opts.mode==='model'&&remaining.length){const price=PRICING[opts.model],outTokens=opts.role==='A'?1400:850;
  const admission=remaining.length*(16500*price.input+outTokens*price.output)/1e6;
  if(admission>opts.budget)throw Error(`Projected replay $${admission.toFixed(4)} exceeds approved budget; no new calls`);
 }
 if(reportDir)fs.mkdirSync(reportDir,{recursive:true});
 for(const s of remaining){
  const original=roleOutput(s,opts.role),input=s.model_inputs[opts.role];
  const row={step:s.step,topic_id:s.topic_id,topic_title:s.topic_title,learner_observation_id:s.learner_observation_id,learner_message:s.learner,
   status:'not_run',input_sha256:sha(json(input)),input_bytes:bytes(input),public_evidence:publicEvidence(s,opts.role),
   baseline:sampleOut(original,opts.role),baseline_checks:structuralDiagnostics(original,input,opts.role)};
  report.results=report.results.filter(x=>x.step!==s.step);report.results.push(row);report.results.sort((a,b)=>a.step-b.step);
  if(opts.mode==='offline'){row.status='offline_packet_verified';if(reportDir)refresh(report,reportDir);continue;}
  const payload=makeRequest(opts.role,input);payload.model=opts.model;payload.messages[0].content=promptFor(opts.role,trace.options?.prompt??'s60');
  row.serialized_request_bytes=bytes(payload);row.prompt_sha256=sha(payload.messages[0].content);
  if(row.serialized_request_bytes>33000){row.status='invalid_request';row.error='serialized_request_exceeds_33000';if(reportDir)refresh(report,reportDir);break;}
  row.status='uncertain_charge';if(reportDir)refresh(report,reportDir); // preserve ambiguous payment state BEFORE sending
  try{
   const result=invoke?await invoke(payload,s):await callProvider(payload,credentials());
   report.cost.calls++;
   if(!result?.usage){report.cost.unknown_usage++;row.error='Provider usage missing; manual review required';if(reportDir)refresh(report,reportDir);break;}
   report.cost.estimated_usd=+(report.cost.estimated_usd+estimateCost(result.usage,opts.model)).toFixed(9);
   if(report.cost.estimated_usd>opts.budget){row.error='Estimated budget reached; output not admitted';if(reportDir)refresh(report,reportDir);break;}
   const answer=candidateValue(result,opts.role);
   row.candidate=sampleOut(answer,opts.role);row.candidate_checks=structuralDiagnostics(answer,input,opts.role);
   row.usage=result.usage;row.status='complete';
   row.fairness={same_stored_role_input:true,same_role_prompt:true,same_schema:true,changed_model_only:true,
    original_mini_output_is_archived_not_recalled:true,original_multi_pass_history_not_replayed:true};
   if(reportDir)refresh(report,reportDir);
  }catch(err){row.error=String(err?.message??err).slice(0,300);row.status='uncertain_charge';if(reportDir)refresh(report,reportDir);break;}
 }
 report.completed=report.results.filter(r=>r.status==='complete').length;report.complete=report.completed===report.requested_steps;report.offline_packets_verified=report.results.filter(r=>r.status==='offline_packet_verified').length;
 if(reportDir)refresh(report,reportDir);
 return report;
}
async function main(){
 const o=parseArgs(process.argv.slice(2)),source=safeReportLocation(o.trace),trace=JSON.parse(fs.readFileSync(source,'utf8'));
 const originalHash=sha(fs.readFileSync(source));
 let dir;
 if(o.resume){dir=path.resolve(o.resume);if(!dir.startsWith(REPORT_BASE+path.sep)||!fs.statSync(dir).isDirectory())throw Error('Resume directory must be under ignored FIX3 report root');}
 else {fs.mkdirSync(REPORT_BASE,{recursive:true});dir=path.join(REPORT_BASE,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex'));}
 const result=await runComparison(trace,o,{reportDir:dir,sourceTraceHash:originalHash});
 console.log('S61-FIX3 REPORT '+dir);
 console.log('S61-FIX3 SUMMARY '+json({role:result.role,complete:result.complete,completed:result.completed,offline_packets_verified:result.offline_packets_verified??0,requested:result.requested_steps,model_calls:result.cost.calls,estimated_cost_usd:result.cost.estimated_usd,unknown_usage:result.cost.unknown_usage}));
 if(o.mode==='model'&&!result.complete)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(err=>{console.error('S61-FIX3 STOP '+String(err.message).slice(0,450));process.exitCode=1;});
