#!/usr/bin/env node
/** FIX6C matched context-only Model A experiment. Plan/Prepare free. Model opt-in and never retried. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {STAGE,CASES,VARIANTS,sha,bytes,prepareJobs,objectiveReview,reviewResponse} from './s62bfix1r42fix6c-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n',{flag:'wx'});
function replaceJSON(p,o){const tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(o,null,2)+'\n');fs.renameSync(tmp,p);}
const validId=s=>/^[A-Za-z0-9_-]{1,65}$/.test(s??'');
function params(argv){const o={root:path.resolve(HERE,'../../..'),mode:'plan',runId:'',sourceRunId:'fix6b_context_free_01',sourceDir:'',preparedRunId:'',budget:null,allowSpend:false};
 const keys={'--root':'root','--mode':'mode','--run-id':'runId','--source-run-id':'sourceRunId','--source-dir':'sourceDir','--prepared-run-id':'preparedRunId','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--allow-spend'){o.allowSpend=true;continue;}
  if(!(k in keys)||i+1>=argv.length)throw Error('Unknown/missing argument '+k);
  o[keys[k]]=argv[++i];
 }
 o.root=path.resolve(o.root);o.sourceDir=o.sourceDir?path.resolve(o.sourceDir):path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix6b','context-audits',o.sourceRunId);
 if(!['plan','prepare','model'].includes(o.mode)||!validId(o.runId)||!validId(o.sourceRunId))throw Error('Invalid mode/RunId/source ID');
 if(o.mode==='model'){
  o.budget=Number(o.budget);
  if(!o.allowSpend||!o.preparedRunId||!validId(o.preparedRunId)||!Number.isFinite(o.budget)||o.budget<=0||o.budget>5)throw Error('Model mode requires --allow-spend, --prepared-run-id and 0 < --budget-usd <= 5');
 } else if(o.allowSpend||o.budget!==null||o.preparedRunId)throw Error('Plan/Prepare do not accept paid mode arguments');
 const base=path.join(o.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix6c');
 o.preparedDir=path.join(base,'prepared',o.mode==='model'?o.preparedRunId:o.runId);
 o.paidDir=path.join(base,'paid',o.runId);
 return o;
}
function frozenSource(o){
 const summaryPath=path.join(o.sourceDir,'SUMMARY.json');
 const summary=read(summaryPath);
 if(summary.stage!=='S62B-FIX1R42FIX6B'||summary.completed!==true||summary.model_calls!==0||summary.database_writes!==0||summary.target_bytes!==55000)throw Error('Expected completed and unchanged FIX6B 55KB free preparation');
 const packets={};const hashes={};
 for(const id of CASES){const file=path.join(o.sourceDir,'A_PACKETS',`${id}_post.json`);packets[id]=read(file);hashes[`${id}_post.json`]=sha(fs.readFileSync(file,'utf8'));}
 const {jobs,case_summary,system_prompt_sha256}=prepareJobs(packets);
 if(jobs.length!==6||new Set(jobs.map(j=>j.request_sha256)).size!==6)throw Error('Require six distinct frozen requests');
 const sidecar=CASES.map(id=>objectiveReview(packets[id]));
 return {source_summary_sha256:sha(fs.readFileSync(summaryPath,'utf8')),source_file_hashes:hashes,source_run_id:summary.run_id,source_state_hashes:summary.source_state_hashes,case_summary,jobs,system_prompt_sha256,sidecar};
}
function plan(o,source){
 const conservative=source.jobs.map(j=>{const maxInput=Math.ceil((j.input_bytes+10000)/2),maxOutput=j.request.max_tokens;return {job_id:j.job_id,max_input_tokens_assumption:maxInput,max_output_tokens:maxOutput,estimate_usd:Math.ceil(1e6*(maxInput*0.4+maxOutput*1.6)/1e6)/1e6};});
 const estimated=conservative.reduce((a,x)=>a+x.estimate_usd,0);
 return {stage:STAGE,mode:o.mode,run_id:o.runId,prepared_run_id:o.preparedRunId||null,source_run_id:source.source_run_id,source_summary_sha256:source.source_summary_sha256,source_file_hashes:source.source_file_hashes,source_state_hashes:source.source_state_hashes,system_prompt_sha256:source.system_prompt_sha256,jobs_sha256:sha(source.jobs),case_summary:source.case_summary,models:['gpt-4.1-mini'],cases:CASES,variants:VARIANTS,model_calls_planned:6,input_only_counterfactuals:true,model_prompts_frozen:true,reference_checks_delivered_to_model:false,estimated_usd_conservative_heuristic:Number(estimated.toFixed(6)),per_call_admission_estimates:conservative,admission_is_not_provider_cap:true,model_calls_in_plan_prepare:0,db_writes:0,embedding_calls:0};
}
function prepare(o,source,p){
 if(fs.existsSync(o.preparedDir))throw Error('Prepared run ID already exists; never overwrite '+o.preparedDir);
 fs.mkdirSync(o.preparedDir,{recursive:true});
 write(path.join(o.preparedDir,'PLAN.json'),{...p,mode:'prepare'});
 write(path.join(o.preparedDir,'JOBS.json'),{stage:STAGE,prepared_run_id:o.runId,source_summary_sha256:source.source_summary_sha256,jobs_sha256:p.jobs_sha256,jobs:source.jobs});
 write(path.join(o.preparedDir,'REFERENCE_CHECKS.json'),{stage:STAGE,reference_checks_sidecar_only:true,cases:source.sidecar});
 write(path.join(o.preparedDir,'TRACE.json'),{stage:STAGE,run_id:o.runId,mode:'prepare',model_calls:0,db_writes:0,embedding_calls:0,source_summary_sha256:source.source_summary_sha256,jobs_sha256:p.jobs_sha256,completed:true});
 fs.writeFileSync(path.join(o.preparedDir,'REVIEW.md'),`# FIX6C — frozen Model A request preparation\n\nSix real GPT-4.1 mini calls are **planned but not executed**. The exact system prompts, schema, model, max_tokens, and activity evidence were preserved from FIX6B.\n\nJobs: ${source.jobs.map(j=>j.job_id).join(', ')}.\n\nSource SHA-256: ${p.source_summary_sha256}. Six frozen requests SHA-256: ${p.jobs_sha256}.\n\n**Read REFERENCE_CHECKS.json before assessing model behavior. It was computed independently and never placed into model prompts.**\n\nR15 includes inconsistent submitted answers relative to selected controls; R17 confirms area/volume factor predictions but cannot independently validate paint or water quantities without missing baseline assumptions.\n\n## Paid experiment\n\nRequires a separate fresh paid RunId, -Mode Model -PreparedRunId ${o.runId} -AllowSpend -BudgetUsd <limit>. Do not reuse paid IDs after any failed or interrupted model calls. The budget is a local estimate, not a hard provider billing limit.\n`,'utf8');
 console.log('FIX6C PREPARE PASS '+JSON.stringify({out:o.preparedDir,calls:0,model_jobs:6,source_sha256:p.source_summary_sha256,jobs_sha256:p.jobs_sha256}));
}
function envParse(file){if(!fs.existsSync(file))return{};const out={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m)out[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}return out;}
async function provider(req,root){
 const env=envParse(path.join(root,'.env.local'));
 const sdk=await import(pathToFileURL(path.join(HERE,'s16b54-models.mjs')).href);
 const key=process.env.OPENAI_API_KEY||env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY;
 if(!key)throw Error('OpenAI API key missing in .env.local; no request made');
 if(!process.env.OPENAI_API_KEY)process.env.OPENAI_API_KEY=key;
 if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;
 return sdk.callProvider(req,sdk.credentials());
}
function ensureNotDuplicatePaid(o){
 const base=path.dirname(o.paidDir);
 if(!fs.existsSync(base))return;
 for(const name of fs.readdirSync(base)){
  const trace=path.join(base,name,'TRACE.json');
  if(!fs.existsSync(trace))throw Error('Existing partial FIX6C paid run without trace; inspect before attempting duplicate spend: '+name);
  const data=read(trace);
  if(data.prepared_run_id===o.preparedRunId)throw Error('A FIX6C paid attempt already exists for this prepared run: '+name+'. Inspect it; no rerun or duplicate provider calls.');
 }
}
function markdown(p,records){
 const cells=records.map(r=>`| ${r.job_id} | ${r.status} | ${r.review?.current_cited??'—'} | ${r.review?.unsupported_observed_citations?.length??'—'} | ${r.review?.memory_proposal_count??'—'} | ${r.cost_usd??'—'} |`).join('\n');
 return `# FIX6C — matched Model A context-only comparison\n\n${p.mode==='model'?'Paid calls requested with explicit user opt-in.':'No paid model calls.'} Six frozen prompts: same GPT-4.1 mini system prompt, schema and control settings, only historical input differs. Model-L fictional learner evidence, not real educational outcome data.\n\n| Job | Status | Cites current | Unsupported observed citations | Proposed memory changes | Estimated USD |\n|---|---|---|---:|---:|---:|\n${cells}\n\n## How to interpret\n\nDo **not** use the model itself as the answer key, reward more memories, or equate verbosity with quality. Compare recognition of the R15 selected-controls mismatch, R17 correct 4x/8x factor prediction, treatment of uncertain paint/water claims, hint conditions, selected supporting/contradicting history, root hypotheses, and quality of next B learner brief.\n\nIndependent reference calculations are in REFERENCE_CHECKS.json and were NOT sent to models. They assume rate interpretation explicitly. Inspect complete returned responses in TRACE.json and compare grounded claims with original learner evidence.\n\nPrompt/source hash: ${p.system_prompt_sha256} / ${p.source_summary_sha256}. Admission and final pricing are estimates, not provider hard caps.\n`;
}
async function runPaid(o,source,p){
 if(!fs.existsSync(o.preparedDir))throw Error('Prepared run missing; run Prepare first');
 const prepared=read(path.join(o.preparedDir,'JOBS.json'));const ready=read(path.join(o.preparedDir,'PLAN.json'));
 if(prepared.stage!==STAGE||prepared.prepared_run_id!==o.preparedRunId||prepared.jobs_sha256!==sha(prepared.jobs)||prepared.jobs_sha256!==p.jobs_sha256||ready.source_summary_sha256!==p.source_summary_sha256||ready.system_prompt_sha256!==p.system_prompt_sha256)throw Error('Prepared jobs changed or source drifted; no spend');
 if(sha(prepared.jobs)!==sha(source.jobs))throw Error('Frozen request payload drifted from source; no spend');
 if(o.budget<p.estimated_usd_conservative_heuristic)throw Error('Authorized spending budget below admission estimate ('+p.estimated_usd_conservative_heuristic+'); no calls');
 ensureNotDuplicatePaid(o);
 if(fs.existsSync(o.paidDir))throw Error('RunId already exists (never reuse): '+o.paidDir);
 fs.mkdirSync(o.paidDir,{recursive:true});
 const trace={stage:STAGE,run_id:o.runId,mode:'model',prepared_run_id:o.preparedRunId,source_run_id:source.source_run_id,source_summary_sha256:source.source_summary_sha256,system_prompt_sha256:source.system_prompt_sha256,jobs_sha256:p.jobs_sha256,planned_calls:6,recorded_model_calls:0,spent_estimate_usd:0,budget_estimate_usd:o.budget,started_at:new Date().toISOString(),completed:false,requests:[],failure:null,db_writes:0,embedding_calls:0};
 write(path.join(o.paidDir,'TRACE.json'),trace);
 write(path.join(o.paidDir,'PLAN.json'),p);
 write(path.join(o.paidDir,'REFERENCE_CHECKS.json'),{reference_checks_sidecar_only:true,cases:source.sidecar});
 write(path.join(o.paidDir,'SOURCE_PROVENANCE.json'),{source_dir:o.sourceDir,source_file_hashes:source.source_file_hashes,source_summary_sha256:source.source_summary_sha256,jobs_sha256:p.jobs_sha256});
 const results=[];let error=null;
 try{
  for(let i=0;i<source.jobs.length;i++){
   const job=source.jobs[i];const estimate=p.per_call_admission_estimates[i].estimate_usd;
   if(trace.spent_estimate_usd+estimate>o.budget+1e-9)throw Error('Local budget admission threshold reached before next call');
   const rec={job_id:job.job_id,case_id:job.case_id,variant:job.variant,model:job.model,input_sha256:job.input_sha256,request_sha256:job.request_sha256,request:job.request,status:'in_flight_unknown_if_interrupted',sent_at:new Date().toISOString()};
   trace.requests.push(rec);replaceJSON(path.join(o.paidDir,'TRACE.json'),trace);
   let response;
   try {response=await provider(job.request,o.root);}catch(e){rec.status='transport_status_unknown';rec.error=String(e.message);replaceJSON(path.join(o.paidDir,'TRACE.json'),trace);throw Error('Provider call status unknown: do not retry run ID or create duplicate paid run. '+String(e.message));}
   rec.status='returned';rec.returned_at=new Date().toISOString();rec.raw=response.raw;rec.response_sha256=sha(response.raw);rec.usage=response.usage??null;rec.returned_model=response.model??null;
   // Save raw response *before* parsing/cost calculation to preserve it on validation failure.
   replaceJSON(path.join(o.paidDir,'TRACE.json'),trace);
   if(!rec.usage)throw Error('Provider returned with missing usage; preserve response, stop safely');
   const costMod=await import(pathToFileURL(path.join(HERE,'s16b61fix1-models.mjs')).href);
   rec.cost_usd=costMod.estimateCost(rec.usage,job.model);
   rec.review=reviewResponse(job,response.raw);
   trace.recorded_model_calls++;trace.spent_estimate_usd=Number((trace.spent_estimate_usd+rec.cost_usd).toFixed(9));
   results.push({job_id:job.job_id,status:rec.status,review:rec.review,cost_usd:rec.cost_usd});
   replaceJSON(path.join(o.paidDir,'TRACE.json'),trace);
   if(trace.spent_estimate_usd>o.budget)throw Error('Local budget estimate exceeded after provider response; stop');
  }
  trace.completed=true;trace.completed_at=new Date().toISOString();
 }catch(e){error=String(e.message);trace.failure={message:error,unknown_provider_result:trace.requests.some(r=>['transport_status_unknown','in_flight_unknown_if_interrupted'].includes(r.status))};}
 replaceJSON(path.join(o.paidDir,'TRACE.json'),trace);
 write(path.join(o.paidDir,'RESULTS.json'),{stage:STAGE,mode:'model',complete:trace.completed,run_id:o.runId,model_calls:trace.recorded_model_calls,estimated_usd:trace.spent_estimate_usd,budget_usd:o.budget,results,failure:trace.failure,independent_reviewer_needed:true});
 fs.writeFileSync(path.join(o.paidDir,'REVIEW.md'),markdown(p,results));
 if(error){console.error('FIX6C MODEL PARTIAL STOP: '+error);process.exitCode=1;return;}
 console.log('FIX6C MODEL PASS '+JSON.stringify({run_id:o.runId,out:o.paidDir,model_calls:trace.recorded_model_calls,estimated_usd:trace.spent_estimate_usd}));
}
async function main(){const o=params(process.argv.slice(2));const source=frozenSource(o),p=plan(o,source);
 if(o.mode==='plan'){console.log('FIX6C PLAN PASS '+JSON.stringify(p,null,2));return;}
 if(o.mode==='prepare'){prepare(o,source,p);return;}
 await runPaid(o,source,p);
}
main().catch(e=>{console.error('FIX6C STOP: '+String(e?.stack??e));process.exitCode=1;});
