#!/usr/bin/env node
/** S62A-FIX1C.1: restart-safe continuation of pinned 24-call frozen comparison.
 * Keeps the already-paid invalid model response as invalid. Never coerces actions or re-prompts.
 * A failed validation is an observed research outcome, not a network failure.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {readFrozen,selectCases} from './s62a-fix1a-compare.mjs';
import {pairRequests} from './s62a-fix1c-compare.mjs';
import {parseLearnerFirst,toLegacyAssessment} from './s62a-fix1b-core.mjs';
import {parseCoherence,toLegacyCoherence} from './s62a-fix1c-core.mjs';
const PROJECT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(import.meta.url);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const write=(dir,name,data)=>fs.writeFileSync(path.join(dir,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{mode:0o600});
const FROZEN_SHA='6c094853308fc85ed79a3cf9628945ed124f7ec02d330a3adde6f128b8c87be3';
const ORIGINAL_RESULTS_SHA='abfec6a66087698169f4d8b2cbb36f87814981880f6c4fe6c0683504b49653fe';
const ORIGINAL_ZIP_SHA='65762657cf78d9e4d87940d232d5bb85687afc9c50213087c91deabcee4cfaa3';
const MODEL='gpt-4.1-mini';
const suppliedOrder=id=>parseInt(sha(id).slice(0,2),16)%2?['new','old']:['old','new'];
function requireExact(cond,message){if(!cond)throw Error(message)}
function optsParse(argv){
 const o={mode:'plan',frozen:'',archive:'',budget:0,allowSpend:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];if(arg==='--plan'){o.mode='plan';continue}if(arg==='--run'){o.mode='run';continue}
  if(arg==='--allow-spend'){o.allowSpend=true;continue}
  if(!['--frozen','--archive','--budget-usd'].includes(arg)||i+1>=argv.length)throw Error('Unrecognized or incomplete FIX1C.1 argument '+arg);
  o[{'--frozen':'frozen','--archive':'archive','--budget-usd':'budget'}[arg]]=argv[++i];
 }
 o.budget=Number(o.budget);if(!o.frozen||!o.archive)throw Error('Exact frozen and archive paths required');
 if(o.mode==='run'&&(!o.allowSpend||o.budget<=0||o.budget>8||!Number.isFinite(o.budget)))throw Error('Paid resume requires allow-spend and new budget 0–8 USD');
 return o;
}
export function establish(frozenPath,archiveDir){
 const frozen=readFrozen(frozenPath);
 requireExact(frozen.hash===FROZEN_SHA,'Frozen comparison evidence hash mismatch');
 const file=path.join(archiveDir,'RESULTS.json');
 requireExact(fs.existsSync(file),'Original results file missing');
 const bytes=fs.readFileSync(file);requireExact(sha(bytes)===ORIGINAL_RESULTS_SHA,'Original paid results bytes differ from pinned archive');
 const src=JSON.parse(bytes);
 requireExact(src.stage==='S62A-FIX1C'&&src.complete===false&&src.model===MODEL&&src.frozen_sha256===FROZEN_SHA,'Wrong failed FIX1C report');
 requireExact(src.planned_calls===24&&src.completed_calls===1&&src.known_estimated_usd===0.0031336&&src.cases?.length===12&&src.errors?.length===1,'Unexpected historical call accounting');
 requireExact(src.errors[0]==='FIX1C knowledge action target missing or wrong kind','Original failed for an unexpected reason');
 const selected=selectCases(frozen.data,frozen.data.cases.slice(0,12).map(c=>c.case_id));
 const jobs=[];
 for(const c of selected){
  const row=src.cases.find(x=>x.id===c.case_id);
  requireExact(!!row&&row.learner_message===c.input.learner_message,'Original case does not match frozen case '+c.case_id);
  const reqs=pairRequests(c.input,MODEL);
  requireExact(JSON.stringify(reqs.old.messages[1])===JSON.stringify(reqs.new.messages[1]),'Frozen evidence drift');
  for(const arm of suppliedOrder(c.case_id)){
   jobs.push({c,arm,request:reqs[arm],requestSha:sha(JSON.stringify(reqs[arm]))});
  }
 }
 requireExact(src.cases.every(x=>selected.some(c=>c.case_id===x.id)),'Original case IDs differ');
 const first=jobs[0];const stored=src.cases[0].arms[first.arm];
 requireExact(first.c.case_id==='MICA-36add3a-STEP10'&&first.arm==='new','Unexpected first arm ordering');
 requireExact(stored?.status==='invalid'&&stored.request_sha256===first.requestSha&&stored.error==='FIX1C knowledge action target missing or wrong kind'&&typeof stored.raw==='string'&&stored.usage&&stored.cost===0.0031336,'Original invalid response not preserved');
 requireExact(src.cases[0].arms.old===undefined&&src.cases.slice(1).every(c=>Object.keys(c.arms??{}).length===0),'Original had unknown or in-flight paid calls');
 const prev=JSON.parse(stored.raw);requireExact(prev.learner_model_delta.knowledge_actions.some(k=>k.action==='revise'&&k.kind==='understanding'&&k.existing_id==='MICA-R-001'),'Pinned model failure not found');
 const remaining=jobs.slice(1);const estimate=remaining.reduce((t,j)=>t+(Buffer.byteLength(JSON.stringify(j.request))*PRICING[MODEL].input+j.request.max_tokens*PRICING[MODEL].output)/1e6,0);
 const plan={stage:'S62A-FIX1C.1',type:'pinned partial-comparison continuation, no prior-call repetition',archive_zip_sha256:ORIGINAL_ZIP_SHA,original_results_sha256:ORIGINAL_RESULTS_SHA,frozen_sha256:FROZEN_SHA,model:MODEL,total_jobs:jobs.length,preserved_completed_calls:1,preserved_invalid_calls:1,remaining_calls:remaining.length,additional_admission_estimate_usd:+estimate.toFixed(7),invalid_original_kept_as_invalid:true,validation_error_policy:'record invalid and continue, never coerce or retry',transport_error_policy:'stop; never automatically retry unknown-usage requests',scientific_correctness_automatically_scored:false,no_database_writes:true};
 return {src,selected,jobs,remaining,plan};
}
function loadKey(){if(process.env.OPENAI_API_KEY)return;const file=path.join(PROJECT,'.env.local');if(!fs.existsSync(file))return;const env=require('dotenv').parse(fs.readFileSync(file));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}
function worksheet(run){const lines=['# FIX1C.1 matched learner-understanding review','', 'Keep both the prior invalid response and any new invalid responses. Invalid structural actions are experimental results, not corrected answers.','', 'Do not use mock fixtures as truth. Every arm received the same frozen user evidence per case.',''];for(const c of run.cases){lines.push(`## ${c.id}`,'',`Learner: ${c.learner_message}`,'',`Conditions: ${JSON.stringify(c.conditions)}`,'');for(const [i,arm] of suppliedOrder(c.id).entries()){const v=c.arms[arm];lines.push(`### Response ${i?'B':'A'}`,'',`Technical status: ${v?.status??'not completed'}`,'','```json',JSON.stringify(v?.parsed??(v?.raw?{error:v.error,raw:v.raw}:v?.error??'Not completed'),null,2),'```','')}lines.push('Independent assessment: Did it accurately describe evidence and uncertainty? Was the memory action warranted and citable? Does a valid record update accurately follow its claim?','Verdict (A/B/neither/uncertain): ___','')};return lines.join('\n')+'\n'}
export async function resume(o,{invoke}={}){
 const ctx=establish(o.frozen,o.archive);const {remaining,plan}=ctx;
 if(o.mode==='plan')return {plan};
 if(plan.additional_admission_estimate_usd>o.budget)throw Error('New admission estimate exceeds authorization; no paid calls');
 if(!invoke)loadKey();const auth=invoke?null:credentials();
 const base=path.join(PROJECT,'.myway-patch-backups','learning-intelligence-reports','s62a-fix1c1','matched');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'run-'));
 const run=structuredClone(ctx.src);run.stage='S62A-FIX1C.1';run.complete=false;run.original_partial_report_sha256=ORIGINAL_RESULTS_SHA;run.preserved_original_call_count=1;run.continuation_new_completed_calls=0;run.continuation_new_known_estimated_usd=0;run.errors=[];run.invalid_responses=1;run.no_db_writes=true;run.not_scientifically_scored=true;
 const save=()=>{write(dir,'RESULTS.json',run);write(dir,'BLINDED_REVIEW.md',worksheet(run))};
 write(dir,'PLAN.json',plan);write(dir,'VARIANT_KEY.json',Object.fromEntries(ctx.selected.map(c=>[c.case_id,{A:suppliedOrder(c.case_id)[0],B:suppliedOrder(c.case_id)[1]}])));save();
 try{
  for(const j of remaining){
   const row=run.cases.find(c=>c.id===j.c.case_id);
   requireExact(!row.arms[j.arm],'Refusing to repeat an existing model call');
   const expected=(Buffer.byteLength(JSON.stringify(j.request))*PRICING[MODEL].input+j.request.max_tokens*PRICING[MODEL].output)/1e6;
   if(run.continuation_new_known_estimated_usd+expected>o.budget)throw Error('New spending threshold before next request');
   row.arms[j.arm]={status:'started',request_sha256:j.requestSha};save();
   const result=invoke?await invoke(j.request,j):await callProvider(j.request,auth);
   if(!result?.usage||typeof result.raw!=='string')throw Error('Provider returned missing usage/raw: do not assume request was free');
   const cost=estimateCost(result.usage,MODEL);
   run.completed_calls++;run.continuation_new_completed_calls++;run.continuation_new_known_estimated_usd=+(run.continuation_new_known_estimated_usd+cost).toFixed(9);
   run.known_estimated_usd=+(run.known_estimated_usd+cost).toFixed(9);
   let parsed,legacy;
   try{
    parsed=j.arm==='old'?parseLearnerFirst(result.raw,j.c.input.allowed_observation_ids):parseCoherence(result.raw,j.c.input.allowed_observation_ids,[]);
    legacy=j.arm==='old'?toLegacyAssessment(parsed):toLegacyCoherence(parsed);
    row.arms[j.arm]={status:'complete',parsed,legacy,request_sha256:j.requestSha,usage:result.usage,cost};
   }catch(err){
    row.arms[j.arm]={status:'invalid',raw:result.raw,request_sha256:j.requestSha,error:String(err.message),usage:result.usage,cost};
    run.invalid_responses++;
   }
   save();
   if(run.continuation_new_known_estimated_usd>o.budget)throw Error('New spending threshold exceeded after request: stop; no automatic retries');
  }
  run.complete=true;save();
 }catch(err){run.errors.push(String(err.message));save();console.log('S62A-FIX1C1 PARTIAL REPORT '+dir);throw err}
 console.log('S62A-FIX1C1 MATCHED REPORT '+dir);
 console.log('S62A-FIX1C1 '+(run.invalid_responses?'COMPLETE_WITH_INVALID_OUTPUTS ':'RUN_COMPLETE ')+JSON.stringify({total_calls:run.completed_calls,preserved_calls:1,new_calls:run.continuation_new_completed_calls,invalid_responses:run.invalid_responses,total_estimated_usd:run.known_estimated_usd,new_estimated_usd:run.continuation_new_known_estimated_usd,db_writes:0}));
 return {dir,run,plan};
}
export {optsParse};
async function main(){const o=optsParse(process.argv.slice(2));const r=await resume(o);if(o.mode==='plan')console.log('S62A-FIX1C1 RESUME PLAN (NO PAID CALLS)\n'+JSON.stringify(r.plan,null,2));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62A-FIX1C1 STOP: '+String(e?.message??e).slice(0,500));process.exitCode=1});
