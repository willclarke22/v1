#!/usr/bin/env node
/** S62A-FIX1A: paired, frozen-input, opt-in Model A prompt experiment. Research ONLY.
 * No model/DB/embedding calls in plan mode; run mode calls Model A only via existing adapter.
 * No authoritative learner memory writes and no journey replay.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult,validateA} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const REPORT_ROOT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a-diag1');
const OUT_ROOT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a-fix1a');
export const FROZEN_SHA256='6c094853308fc85ed79a3cf9628945ed124f7ec02d330a3adde6f128b8c87be3';
export const DEFAULT_CASE_IDS=Object.freeze([
 'MICA-36add3a-STEP17', // historical-root support after correct explanation
 'SAGE-ab96d4b-STEP5', // improve observed, refine/counter polarity
 'ELLI-ceffc2a-STEP22', // practice request and historical-root anchoring
 'MICA-36add3a-STEP19', // topic change and stale-root spillover
 'SAGE-ab96d4b-STEP10', // ambiguous prompt / untested transfer
 'ELLI-ceffc2a-STEP3' // useful historical restraint case
]);

// SAME control text as S62A (source-pinned) to isolate a single additional instruction.
export const NO_UPDATE='S62A EXPERIMENTAL ABSTENTION INSTRUCTION: Do not generate a memory action merely because another turn has occurred. A request for practice or a correct response may warrant no change. If the current evidence does not materially change an existing hypothesis or justify a new one, return empty root_actions/relationship_actions arrays. Distinguish an older difficulty from current demonstrated understanding; cite only observed evidence. This is a prompt variant, not a requirement to abstain.';
export const CANDIDATE_DELTA=`S62A-FIX1A LEARNER-UNDERSTANDING CLARIFICATION — EXPERIMENTAL, NOT AN ANSWER KEY.
Your central task is to infer a continuously revisable, learner-specific model of what THIS learner demonstrates, what remains uncertain, and which alternative underlying mechanisms could explain their reasoning. Do not collapse the current question, the presenting difficulty, or a topic-level prerequisite into a demonstrated underlying cause. Positive knowledge, strengths and demonstrated transfer matter just as much as difficulties.
Interpret task conditions: spontaneous answer, hint, after-explanation paraphrase, scored/valid probe, and independent unhinted novel transfer have different evidentiary strength. The field "independent_opening_unscored" does NOT, alone, establish independence if the learner has just been coached. An accurate answer after teaching is not evidence that a misconception remains ACTIVE; it may leave current mastery uncertain. Equally, a practice request or a question is not a demonstration of failure or success. Consider the earlier tutor wording and whether the probe itself is valid.
For each hypothesis, critically consider support AND counterevidence and competing explanations. Distinguish "once displayed this difficulty" from "still shows this difficulty today"; historical evidence stays historically true even if current status weakens. If the new evidence genuinely contradicts the claim that an existing root remains active, consider weaken/challenge with that existing ID; if context is insufficient, explain the uncertainty and use no action or request specific evidence. Do not support an active confusion root by citing only a successful explanation without clear reasoning. This code currently puts cited IDs for refine into root support_ids even when some citations are counterevidence: avoid refine as a generic response to improvement, and do not mislabel cited counterevidence as support. Explain root-action evidence polarity consistently with observed_understanding and possible_underlying_causes, using allowed IDs only.
Avoid forced cross-topic relationships based on subject overlap alone. Treat teaching-effectiveness claims as provisional, identify hint and task confounds, and suggest discriminating probes when causes remain uncertain. Evidence integrity matters more than the number of proposed actions. Preserve schema exactly.`;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));

export function parseOptions(args){
 const out={mode:'plan',frozen:'',model:'gpt-4.1-mini',caseIds:[...DEFAULT_CASE_IDS],budget:0,allowSpend:false};
 const values={'--frozen':'frozen','--model-a':'model','--case-ids':'caseIds','--budget-usd':'budget'};
 for(let i=0;i<args.length;i++){
  const k=args[i];if(k==='--run'){out.mode='run';continue;}if(k==='--plan'){out.mode='plan';continue;}
  if(k==='--allow-spend'){out.allowSpend=true;continue;}
  if(!(k in values)||i+1>=args.length)throw Error('Unknown/missing argument: '+k);
  const v=args[++i];out[values[k]]=k==='--case-ids'?v.split(',').map(x=>x.trim()):v;
 }
 out.budget=Number(out.budget);
 if(!out.frozen||!['gpt-4.1-mini','gpt-4.1'].includes(out.model))throw Error('Provide --frozen and supported --model-a');
 if(!out.caseIds.length||out.caseIds.length>8||out.caseIds.some(x=>!/^[A-Z]{3,6}-[0-9a-f]{7}-STEP\d{1,2}$/.test(x))||new Set(out.caseIds).size!==out.caseIds.length)throw Error('Supply 1–8 unique valid case IDs');
 if(out.mode==='run'&&(!out.allowSpend||!Number.isFinite(out.budget)||out.budget<=0||out.budget>2))throw Error('Paid run requires explicit --allow-spend and --budget-usd (0, 2]');
 return out;
}
export function readFrozen(filename,base=REPORT_ROOT){
 const full=path.resolve(filename),safeBase=path.resolve(base);
 if(path.basename(full)!=='FROZEN_CASES.json'||!full.startsWith(safeBase+path.sep)||!fs.existsSync(full))throw Error('Frozen cases must be archived DIAG1 FROZEN_CASES.json within ignored report root');
 const real=fs.realpathSync(full),realBase=fs.realpathSync(safeBase);
 if(!real.startsWith(realBase+path.sep)||!fs.statSync(real).isFile()||fs.statSync(real).size>12e6)throw Error('Frozen cases path escape or oversized file');
 const raw=fs.readFileSync(real),fingerprint=sha(raw);
 if(fingerprint!==FROZEN_SHA256)throw Error('Frozen evidence differs from user-reviewed DIAG1 report. Expected SHA256 '+FROZEN_SHA256+' got '+fingerprint+'. No paid calls.');
 const data=JSON.parse(raw.toString('utf8'));
 if(data.schema!=='myway_s62adiag1_frozen_v1'||data.research_only!==true||!Array.isArray(data.cases)||data.cases.length!==15)throw Error('Unsupported frozen report');
 for(const c of data.cases){
  if(!c.case_id||c.input?.role!=='A'||c.input?.research_only!==true||!c.original_model_a||!Array.isArray(c.input.allowed_observation_ids)||!Array.isArray(c.input.context?.observations)||!Array.isArray(c.input.context?.roots))throw Error('Invalid frozen case in DIAG1 report');
 }
 return {data,real,hash:fingerprint};
}
export function selectCases(data,ids){
 const selected=ids.map(id=>data.cases.find(c=>c.case_id===id));
 if(selected.some(x=>!x))throw Error('Unknown frozen case ID(s): '+ids.filter(x=>!data.cases.some(c=>c.case_id===x)).join(', '));
 return selected;
}
export function buildRequest(caseItem,model,arm){
 if(!['control','candidate'].includes(arm))throw Error('Unknown trial arm');
 const req=makeRequest('A',caseItem.input);req.model=model;
 // Exact same user evidence/JSON schema/max_tokens for both arms.
 req.messages[0].content=promptFor('A','s60')+'\n'+NO_UPDATE+(arm==='candidate'?'\n'+CANDIDATE_DELTA:'');
 if(Buffer.byteLength(JSON.stringify(req))>36000)throw Error('Oversized structured Model A request');
 return req;
}
export function makeJobs(selected,model){
 const jobs=[];for(const c of selected){
  // Reversed arms for alternating cases to reduce systematic sequence bias.
  const order=Number.parseInt(sha(c.case_id).slice(0,2),16)%2===0?['control','candidate']:['candidate','control'];
  for(const arm of order){const request=buildRequest(c,model,arm);const rates=PRICING[model];
   // UTF-8 serialized request bytes + max completion tokens is conservative planning,
   // NOT a true upper bound on actual billing for all tokenizers/providers.
   const estimatedUsd=(Buffer.byteLength(JSON.stringify(request))*rates.input+request.max_tokens*rates.output)/1e6;
   jobs.push({caseItem:c,arm,request,estimatedUsd,requestHash:sha(JSON.stringify(request))});
  }
 }
 return jobs;
}
export function analyzeResponse(c,a){
 const ctx=c.input.context,visible=new Set(c.input.allowed_observation_ids);
 const state={obs:ctx.observations,roots:ctx.roots,relationships:ctx.relationships||[],topics:ctx.topics||[],explicit_instructions:[]};
 const checks=validateA(a,state,visible);
 const counters=new Set((a.possible_underlying_causes||[]).flatMap(x=>x.counter_ids||[]));
 const contested=(a.root_actions||[]).filter(x=>['support','refine'].includes(x.action)&&(x.observation_ids||[]).some(id=>counters.has(id))).map(x=>({action:x.action,existing_id:x.existing_id,observation_ids:x.observation_ids.filter(id=>counters.has(id)),note:'Action cites IDs the model also lists as counterevidence in a candidate cause; contextual review required, not proven error'}));
 return {actions:(a.root_actions||[]).map(x=>({action:x.action,existing_id:x.existing_id,observation_ids:x.observation_ids})),relationship_actions:(a.relationship_actions||[]).length,causes:(a.possible_underlying_causes||[]).length,observed_understanding_count:(a.observed_understanding||[]).length,uncertainty:a.overall_uncertainty,structural_validation:checks.checks,accepted_proposals:checks.proposals.length,action_counterevidence_overlaps:contested,scientific_accuracy:'NOT_AUTOMATICALLY_GRADED'};
}
function loadEnv(){
 if(process.env.OPENAI_API_KEY)return;
 const file=path.join(ROOT,'.env.local');if(!fs.existsSync(file))return;
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const match=line.match(/^\s*(?:export\s+)?(OPENAI_API_KEY|OPENAI_BASE_URL)\s*=\s*(.*?)\s*$/);
  if(!match||process.env[match[1]])continue;
  let v=match[2];if(/^(["']).*\1$/.test(v))v=v.slice(1,-1);
  process.env[match[1]]=v;
 }
}
function saveJson(filename,obj){fs.writeFileSync(filename,JSON.stringify(obj,null,2)+'\n',{mode:0o600});}
const clean=s=>String(s??'').replace(/\r/g,'').replace(/\u0000/g,'');
export function reviewMarkdown(result){
 const lines=['# S62A-FIX1A — Blinded reviewer worksheet','','These are **new paid Model A outputs** on the same frozen input per case. A/B labels are deliberately scrambled per case. This worksheet does not judge educational accuracy.','', 'Evaluate independently: observed understanding; presenting difficulty vs cause; alternatives; evidence polarity; uncertainty; coaching vs independent transfer; relationships; teaching confounds; memory actions. Mark uncertain when appropriate.','','Score both arms without using `VARIANT_KEY.json` until after your independent review. No answer-key labels are authoritative.'];
 for(const c of result.cases){
  const assignments=Number.parseInt(sha(c.case_id).slice(0,2),16)%2===0?['candidate','control']:['control','candidate'];
  lines.push('',`## ${c.case_id}`,`Learner: ${clean(c.source?.learner)} | Topic: ${clean(c.source?.topic)} | Original archived step: ${c.source?.step}`,'',`**Original learner message:** ${clean(c.learner_message)}`,'',`**Probe conditions:** ${clean(JSON.stringify(c.probe_conditions))}`,'');
  for(let k=0;k<2;k++){
   const tag=['A','B'][k],arm=assignments[k],res=c.arms[arm];
   lines.push(`### Response ${tag}`,'');
   if(!res?.assessment){lines.push('Missing or incomplete paid response; cannot compare this pair.');continue;}
   const a=res.assessment;
   lines.push('**Observed understanding**', '```json',JSON.stringify(a.observed_understanding,null,2),'```','', '**Possible underlying causes**','```json',JSON.stringify(a.possible_underlying_causes,null,2),'```','','**Root / relationship actions**','```json',JSON.stringify({root_actions:a.root_actions,relationship_actions:a.relationship_actions},null,2),'```','',`**Uncertainty:** ${a.overall_uncertainty}`,'',`**Probe:** ${clean(JSON.stringify(a.next_probe))}`,'');
  }
  lines.push('**Independent review (not answered by the software):**','', '- Which arm best distinguishes current understanding from historical confusion?','- Which claims have direct support, contradictory evidence, or insufficient evidence?','- Did the model infer an underlying learner-specific mechanism rather than re-label the topic?','- Are any actions inconsistent with its own assessment?','- Does it respect coaching, probe validity and the possibility of no update?','- Which arm (if either) would you trust more for the next tutor move, and why?','');
 }
 return lines.join('\n')+'\n';
}
function pairSummary(result){
 const lines=['# Frozen Model A paired comparison','','This is an A/B prompt experiment. No objective correctness grade is provided. The archived original is included for reference in `RESULTS.json` but is **not** a freshly randomized control.','',`Model: ${result.options.model}  |  Frozen input SHA256: ${result.frozen_sha256}`,`Paid calls completed: ${result.completed_calls}/${result.planned_calls}  |  Estimated provider usage: US$${result.estimated_actual_usd.toFixed(6)} (not a bill or cap)`,'', '| Case | Control root actions | Candidate root actions | Structural issues (control/candidate) |','|---|---|---|---|'];
 for(const c of result.cases){
  const fmt=a=>a?.analysis?.actions?.map(x=>x.action).join(', ')||'—';
  const fail=a=>a?.analysis?.structural_validation?.filter(x=>!x.accepted).length??'—';
  lines.push(`| ${c.case_id} | ${fmt(c.arms.control)} | ${fmt(c.arms.candidate)} | ${fail(c.arms.control)} / ${fail(c.arms.candidate)} |`);
 }
 lines.push('','Counts describe outputs, not whether hypotheses are scientifically right. Do **not** choose a winner by counting no_change actions, roots, or structural checks. Review all evidence and note where interpretations are uncertain.','');return lines.join('\n');
}
async function main(){
 const opts=parseOptions(process.argv.slice(2));const frozen=readFrozen(opts.frozen);
 const selected=selectCases(frozen.data,opts.caseIds),jobs=makeJobs(selected,opts.model);
 const admission=jobs.reduce((sum,x)=>sum+x.estimatedUsd,0);
 const plan={stage:'S62A-FIX1A',type:'matched-frozen-model-A-comparison',paid_calls_if_run:jobs.length,model:opts.model,cases:selected.map(x=>x.case_id),frozen_sha256:frozen.hash,admission_estimate_usd:+admission.toFixed(7),notes:'Both arms use exactly the same frozen user evidence, schema and model; only the appended candidate instruction differs. Admission is a planning estimate, not a hard spend cap.'};
 if(opts.mode==='plan'){console.log('S62A-FIX1A PLAN (NO API CALLS)\n'+JSON.stringify(plan,null,2));return;}
 if(admission>opts.budget)throw Error(`Estimated admission $${admission.toFixed(5)} exceeds approved $${opts.budget.toFixed(2)}; NO API calls.`);
 loadEnv();const auth=credentials();
 fs.mkdirSync(OUT_ROOT,{recursive:true});const dir=fs.mkdtempSync(path.join(OUT_ROOT,new Date().toISOString().replace(/[:.]/g,'-')+'-'));
 const run={schema:'myway_s62afix1a_matched_comparison_v1',research_only:true,scientific_grading:false,complete:false,options:{model:opts.model,cases:opts.caseIds,budget_usd:opts.budget,admission_estimate_usd:admission,not_hard_provider_cap:true},frozen_sha256:frozen.hash,frozen_source_file:frozen.real,planned_calls:jobs.length,completed_calls:0,estimated_actual_usd:0,cases:selected.map(c=>({case_id:c.case_id,source:c.source,learner_message:c.input.learner_message,probe_conditions:c.input.probe_conditions,frozen_input_sha256:sha(JSON.stringify(c.input)),archived_original_a:c.original_model_a,arms:{control:null,candidate:null}})),errors:[]};
 const save=()=>{saveJson(path.join(dir,'RESULTS.json'),run);fs.writeFileSync(path.join(dir,'SUMMARY.md'),pairSummary(run),{mode:0o600});fs.writeFileSync(path.join(dir,'BLINDED_REVIEW.md'),reviewMarkdown(run),{mode:0o600});};
 const key={note:'Read AFTER completing blinded review; labels are reversed for approximately half of cases.',cases:Object.fromEntries(run.cases.map(c=>{const order=Number.parseInt(sha(c.case_id).slice(0,2),16)%2===0?['candidate','control']:['control','candidate'];return [c.case_id,{A:order[0],B:order[1]}];}))};
 saveJson(path.join(dir,'VARIANT_KEY.json'),key);
 saveJson(path.join(dir,'REQUEST_PLAN.json'),{plan,jobs:jobs.map(j=>({case_id:j.caseItem.case_id,arm:j.arm,estimated_usd:j.estimatedUsd,request_hash:j.requestHash,input_message_hash:sha(JSON.stringify(j.request.messages[1]))}))});
 save();
 try{
  for(const job of jobs){
   if(run.estimated_actual_usd+job.estimatedUsd>opts.budget)throw Error('Remaining approved budget insufficient for next planned call');
   const entry=run.cases.find(x=>x.case_id===job.caseItem.case_id);
   entry.arms[job.arm]={status:'started',input_request_sha256:job.requestHash,request:job.request,assessment:null,analysis:null};save();
   const output=await callProvider(job.request,auth);
   if(!output.usage)throw Error('Provider response lacked usage; no further calls');
   const cost=estimateCost(output.usage,opts.model);run.estimated_actual_usd=+(run.estimated_actual_usd+cost).toFixed(9);run.completed_calls++;
   let assessment=null,analysis=null,parseError=null;
   try{assessment=parseResult(output.raw,'A');analysis=analyzeResponse(job.caseItem,assessment)}catch(e){parseError=String(e?.message??e)}
   entry.arms[job.arm]={status:parseError?'invalid_response':'complete',input_request_sha256:job.requestHash,request:job.request,raw_model_json:output.raw,provider_model:output.model,usage:output.usage,estimated_cost_usd:cost,assessment,analysis,parse_error:parseError};save();
   if(parseError)throw Error('Response could not be parsed/validated for '+job.caseItem.case_id+'/'+job.arm);
   if(run.estimated_actual_usd>opts.budget)throw Error('Estimated actual spend exceeded approved estimate after provider call; stopped');
  }
  run.complete=true;save();
 }catch(e){run.errors.push({message:String(e?.message??e),note:'No automatic retries. A failed in-flight request could still be billed; inspect before another paid run.'});save();console.log('S62A-FIX1A PARTIAL REPORT '+dir);throw e}
 console.log('S62A-FIX1A COMPARE REPORT '+dir);
 console.log('S62A-FIX1A COMPARISON PASS '+JSON.stringify({cases:run.cases.length,completed_calls:run.completed_calls,estimated_actual_usd:run.estimated_actual_usd,db_writes:0}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A-FIX1A STOP: '+String(e?.message??e));process.exitCode=1});
