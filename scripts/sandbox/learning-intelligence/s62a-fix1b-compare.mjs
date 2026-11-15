#!/usr/bin/env node
/** FIX1B matched-input experiment: original S62A no-update vs learner-first three-part assessment.
 * No DB, app, embeddings, or persistent memory changes. Model calls are opt-in only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeRequest,parseResult} from './s16b59-lean-core.mjs';
import {promptFor} from './s16b60-prompts.mjs';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {readFrozen,selectCases,NO_UPDATE,analyzeResponse,FROZEN_SHA256} from './s62a-fix1a-compare.mjs';
import {LEARNER_FIRST_SCHEMA,LEARNER_FIRST_PROMPT,parseLearnerFirst,toLegacyAssessment,classifyActionConflicts} from './s62a-fix1b-core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62a-fix1b','matched');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const json=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
export function parseOpts(args){
 const o={mode:'plan',frozen:'',model:'gpt-4.1-mini',caseIds:'',limit:12,budget:0,allowSpend:false};
 for(let i=0;i<args.length;i++){
  const k=args[i];if(k==='--run'){o.mode='run';continue;}if(k==='--plan'){o.mode='plan';continue;}if(k==='--allow-spend'){o.allowSpend=true;continue;}
  const known={'--frozen':'frozen','--model-a':'model','--case-ids':'caseIds','--limit':'limit','--budget-usd':'budget'};
  if(!known[k]||i+1>=args.length)throw Error('Unknown or incomplete FIX1B flag '+k);
  o[known[k]]=args[++i];
 }
 o.limit=Number(o.limit);o.budget=Number(o.budget);
 if(!o.frozen||!PRICING[o.model]||!Number.isInteger(o.limit)||o.limit<1||o.limit>15)throw Error('Invalid frozen file, model, or case limit 1..15');
 if(o.mode==='run'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>8))throw Error('Paid run requires --allow-spend and an explicit budget >0, <=8 USD');
 return o;
}
export function makeRequestPair(c,model){
 const baseline=makeRequest('A',c.input);baseline.model=model;
 baseline.messages[0].content=promptFor('A','s60')+'\n'+NO_UPDATE;
 const learnerFirst=makeRequest('A',c.input);learnerFirst.model=model;learnerFirst.max_tokens=2100;
 learnerFirst.messages[0].content=LEARNER_FIRST_PROMPT;
 learnerFirst.response_format={type:'json_schema',json_schema:{name:'myway_s62afix1b_learner_first',strict:true,schema:LEARNER_FIRST_SCHEMA}};
 // The user message has identical serialized content. Schema & task framing intentionally differ.
 if(JSON.stringify(baseline.messages[1])!==JSON.stringify(learnerFirst.messages[1]))throw Error('Frozen user evidence mismatch across arms');
 return {baseline,learnerFirst};
}
function jobOrder(c){return Number.parseInt(sha(c.case_id).slice(0,2),16)%2===0?['baseline','learnerFirst']:['learnerFirst','baseline'];}
export function planCases(selected,model){
 const jobs=[];
 for(const c of selected){const pairs=makeRequestPair(c,model);for(const arm of jobOrder(c)){
  const req=pairs[arm],rate=PRICING[model];
  const estimate=(Buffer.byteLength(JSON.stringify(req))*rate.input+req.max_tokens*rate.output)/1e6;
  jobs.push({id:c.case_id,arm,request:req,requestHash:sha(JSON.stringify(req)),estimate});
 }}return jobs;
}
// The helper avoids introducing any dependency on the working directory.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function loadExistingKey(){
 if(process.env.OPENAI_API_KEY)return;
 const filename=path.join(ROOT,'.env.local');if(!fs.existsSync(filename))return;
 const env=require('dotenv').parse(fs.readFileSync(filename));
 if(env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY)process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY;
 if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;
}
function blindedWorksheet(run){
 const lines=['# FIX1B matched Model A review — blinded case-by-case','', 'Each pair was generated from the exact same frozen user evidence with the same model. **Both system instructions and output schemas differ**; this isolates a learner-first architecture package, not merely a sentence in a prompt.','', 'Do not consult VARIANT_KEY.json before evaluating independently. No model output is an answer key; the fictional learner profile is fallible.',''];
 for(const c of run.cases){
  const order=jobOrder(c);lines.push(`## ${c.case_id}`,'',`**Original learner message:** ${c.learner_message}`,'',`**Probe conditions:** ${JSON.stringify(c.probe_conditions)}`,'');
  for(const [idx,arm] of order.entries()){
   lines.push(`### Response ${idx===0?'A':'B'}`,'');
   const a=c.arms[arm];if(!a||a.status!=='complete'){lines.push('Missing/incomplete arm; do not judge this pair.','');continue;}
   lines.push('```json',JSON.stringify(a.learner_first??a.normalized_assessment,null,2),'```','');
  }
  lines.push('**Independent questions:** Does either response recognize strengths/progress without inventing a cause? Does it distinguish current performance from historical evidence? Is the proposed root learner-specific, with alternatives? Is action polarity supported by the cited evidence? Was a tutor cue overlooked? Is a question mistaken for a deficit? What evidence is missing? Does next-teaching guidance help Model B?','','Verdict (A / B / neither / uncertain): ________','Reason and exact evidence IDs: ___________________________','');
 }
 return lines.join('\n')+'\n';
}
function summary(run){const out=['# FIX1B matched-input research comparison','',`Complete: ${run.complete} | Calls: ${run.completed_calls}/${run.planned_calls} | Estimated usage: US$${run.estimated_actual_usd.toFixed(6)} (not provider invoice)`, '', 'Compare factual learner understanding, calibrated uncertainty and memory fidelity, not number of root actions. No automated educational grading.','', '| Case | Baseline action names | Learner-first action names | Polarity warnings |', '|---|---|---|---|'];
 for(const c of run.cases){const a=c.arms.baseline,b=c.arms.learnerFirst;out.push(`| ${c.case_id} | ${a?.normalized_assessment?.root_actions?.map(x=>x.action).join(', ')??'—'} | ${b?.normalized_assessment?.root_actions?.map(x=>x.action).join(', ')??'—'} | ${b?.polarity_warnings?.length??'—'} |`)}
 return out.join('\n')+'\n';}
export async function runComparison(opts,{invoke}={}){
 const frozen=readFrozen(opts.frozen);
 const available=opts.caseIds?opts.caseIds.split(',').map(x=>x.trim()).filter(Boolean):frozen.data.cases.slice(0,opts.limit).map(x=>x.case_id);
 if(available.length>15||available.length===0||new Set(available).size!==available.length)throw Error('Invalid or duplicate cases');
 const selected=selectCases(frozen.data,available),jobs=planCases(selected,opts.model),admission=jobs.reduce((s,x)=>s+x.estimate,0);
 const plan={stage:'S62A-FIX1B',type:'learner-first-schema-and-prompt-vs-original-frozen-evidence',frozen_sha256:frozen.hash,model:opts.model,cases:available,planned_calls:jobs.length,admission_estimate_usd:+admission.toFixed(7),experimental_difference:'system instruction AND response schema; same learner evidence and model; no claims of causal isolation beyond this package',allow_spend_required:true};
 if(opts.mode==='plan')return {plan};
 if(admission>opts.budget)throw Error(`Admission estimate $${admission.toFixed(5)} exceeds budget $${opts.budget.toFixed(2)}; no calls`);
 if(!invoke)loadExistingKey();const auth=invoke?null:credentials();
 fs.mkdirSync(OUT,{recursive:true});const dir=fs.mkdtempSync(path.join(OUT,new Date().toISOString().replace(/[:.]/g,'-')+'-'));
 const run={schema:'myway_s62afix1b_matched_v1',research_only:true,scientific_grade:false,complete:false,options:{model:opts.model,budget_usd:opts.budget},frozen_sha256:frozen.hash,planned_calls:jobs.length,completed_calls:0,estimated_actual_usd:0,cases:selected.map(c=>({case_id:c.case_id,source:c.source,learner_message:c.input.learner_message,probe_conditions:c.input.probe_conditions,input_hash:sha(JSON.stringify(c.input)),arms:{baseline:null,learnerFirst:null}})),errors:[]};
 const save=()=>{json(path.join(dir,'RESULTS.json'),run);fs.writeFileSync(path.join(dir,'SUMMARY.md'),summary(run));fs.writeFileSync(path.join(dir,'BLINDED_REVIEW.md'),blindedWorksheet(run));};
 json(path.join(dir,'VARIANT_KEY.json'),Object.fromEntries(selected.map(c=>[c.case_id,{A:jobOrder(c)[0],B:jobOrder(c)[1]}])));
 json(path.join(dir,'REQUEST_PLAN.json'),{plan,jobs:jobs.map(x=>({id:x.id,arm:x.arm,request_sha256:x.requestHash,estimated_usd:x.estimate,input_hash:sha(x.request.messages[1].content)}))});save();
 try{
  for(const j of jobs){
   if(run.estimated_actual_usd+j.estimate>opts.budget)throw Error('Insufficient approved remaining budget for next call');
   const target=run.cases.find(c=>c.case_id===j.id),frozenCase=selected.find(c=>c.case_id===j.id);
   target.arms[j.arm]={status:'started',request_sha256:j.requestHash};save();
   const output=invoke?await invoke(j.request,j):await callProvider(j.request,auth);
   if(!output?.usage)throw Error('Provider usage missing; stop before further calls');
   const cost=estimateCost(output.usage,opts.model);run.estimated_actual_usd=+(run.estimated_actual_usd+cost).toFixed(9);run.completed_calls++;
   let parsed,normalized,polarity=[];
   if(j.arm==='baseline'){parsed=parseResult(output.raw,'A');normalized=parsed;}
   else{parsed=parseLearnerFirst(output.raw,frozenCase.input.allowed_observation_ids);normalized=toLegacyAssessment(parsed);polarity=classifyActionConflicts(parsed)}
   const analysis=analyzeResponse(frozenCase,normalized);
   target.arms[j.arm]={status:'complete',request_sha256:j.requestHash,raw_model_json:output.raw,learner_first:j.arm==='learnerFirst'?parsed:null,normalized_assessment:normalized,analysis,polarity_warnings:polarity,usage:output.usage,estimated_cost_usd:cost,provider_model:output.model};save();
   if(run.estimated_actual_usd>opts.budget)throw Error('Estimated usage exceeded user budget after call; no further calls');
  }
  run.complete=true;save();
 }catch(e){run.errors.push({message:String(e?.message??e),note:'Partial results preserved; no automatic paid retries, in-flight requests may be billable'});save();console.log('S62A-FIX1B PARTIAL REPORT '+dir);throw e;}
 console.log('S62A-FIX1B MATCHED REPORT '+dir);
 console.log('S62A-FIX1B COMPARISON PASS '+JSON.stringify({calls:run.completed_calls,cases:run.cases.length,estimated_usd:run.estimated_actual_usd,db_writes:0}));
 return {plan,dir,run};
}
async function main(){const opts=parseOpts(process.argv.slice(2));const result=await runComparison(opts);if(opts.mode==='plan')console.log('S62A-FIX1B PLAN (NO API CALLS)\n'+JSON.stringify(result.plan,null,2));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A-FIX1B STOP: '+String(e?.message??e));process.exitCode=1});
