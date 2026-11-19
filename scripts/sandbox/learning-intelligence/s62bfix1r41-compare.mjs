#!/usr/bin/env node
/** R4 vs R4.1 same-input prompt comparison. No outcome labels or automated educational scores.
 * Frozen requests come from an ALREADY completed real R4 report and are never altered except system prompt.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {PROMPT_SET_VERSION,promptForR41} from './s62bfix1r41-prompts.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(import.meta.url);
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const clone=x=>structuredClone(x);
const ID=/^[A-Za-z0-9_-]{1,40}$/;
const defaults={mode:'plan',sourceRun:'r4_paid_2a',runId:'compare_plan',budget:null,allowSpend:false,model:'gpt-4.1-mini'};
export function parseArgs(argv){const o={...defaults};const fields={'--mode':'mode','--source-run':'sourceRun','--run-id':'runId','--budget-usd':'budget','--model':'model'};
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--allow-spend'){o.allowSpend=true;continue;}if(!fields[k]||!argv[i+1])throw Error('Unknown or incomplete compare argument '+k);const f=fields[k],v=argv[++i];o[f]=f==='budget'?Number(v):v;}
 if(!['plan','offline','model'].includes(o.mode)||!ID.test(o.sourceRun)||!ID.test(o.runId)||!['gpt-4.1-mini','gpt-4.1'].includes(o.model))throw Error('Invalid compare options');
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>10))throw Error('Paid comparison requires explicit --allow-spend and --budget-usd (0,10]');
 if(o.mode!=='model'&&(o.allowSpend||o.budget!==null))throw Error('Free compare modes forbid spending flags');
 return o;
}
export function frozenPairs(source){if(source.stage!=='S62B-FIX1R4'||source.complete!==true||!Array.isArray(source.timeline)||!source.timeline.length)throw Error('Source must be a completed ORIGINAL R4 report (not R4.1)');
 const t=source.timeline[0];
 const defs=[['A-pre','A',t.pre_a?.request],['A-post','A',t.post_a?.request],['B-teach','B',t.b_request],['X-build','X',t.translator_request],['L-opening','L',t.opening_L_request],['L-interact','L',t.phases?.find(x=>x.model_l_request)?.model_l_request]];
 const pairs=[];for(const [label,role,oldRequest] of defs){if(!oldRequest)continue;
  const user=oldRequest.messages?.[1],system=oldRequest.messages?.[0];
  if(system?.role!=='system'||typeof system.content!=='string'||user?.role!=='user'||typeof user.content!=='string'||!oldRequest.response_format?.json_schema?.schema)throw Error('Unrecognized frozen prompt structure '+label);
  let input;try{input=JSON.parse(user.content)}catch{throw Error('Frozen R4 input is not valid JSON: '+label)}
  const newPrompt=promptForR41(role,input);if(!newPrompt||oldRequest.messages.length!==2)throw Error('Unexpected frozen prompt: '+label);
  pairs.push({label,role,inputSha256:sha(user.content),oldPromptSha256:sha(system.content),newPromptSha256:sha(newPrompt),oldPrompt:system.content,newPrompt,userContent:user.content,originalRequest:oldRequest});
 }
 if(pairs.length<4)throw Error('Not enough matched source-role inputs for fair comparison');return pairs;
}
function sourcePath(runId){return path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r4',runId,'TRACE.json')}
function reportPath(runId){return path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41','prompt-comparisons',runId)}
function checkEnv(){if(process.env.OPENAI_API_KEY)return;const file=path.join(root,'.env.local');if(fs.existsSync(file)){const env=require('dotenv').parse(fs.readFileSync(file));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}}
export function inspectSource(o){const f=sourcePath(o.sourceRun);if(!fs.existsSync(f))throw Error('R4 source TRACE not found. Use an existing complete R4 report RunId: '+o.sourceRun);const raw=fs.readFileSync(f);const source=JSON.parse(raw.toString());return {file:f,digest:sha(raw.toString()),pairs:frozenPairs(source)};}
function makeRequest(pair,arm,model){const p=clone(pair.originalRequest);p.model=model;p.store=false;p.messages=[{role:'system',content:arm==='R4'?pair.oldPrompt:pair.newPrompt},{role:'user',content:pair.userContent}];return p;}
export function plan(o,pairs){return {stage:'S62B-FIX1R4.1',method:'frozen_R4_same_input_comparison',source_run:o.sourceRun,source_visit:1,prompt_set_version:PROMPT_SET_VERSION,mode:o.mode,model:o.model,pairs:pairs.map(x=>({case:x.label,role:x.role,identical_user_input_sha256:x.inputSha256,R4_prompt_sha256:x.oldPromptSha256,R41_prompt_sha256:x.newPromptSha256})),planned_model_calls:o.mode==='model'?pairs.length*2:0,admission_estimate_usd:o.mode==='model'?0.60:0, warnings:['R4 and R4.1 are independently sampled on IDENTICAL frozen user inputs; neither arm has a model-quality answer key','Source R4 output is not an expected result or a score','A and B are compared as independent requests, not an end-to-end downstream adaptation test','Preserves identical JSON schema, model and max_tokens for each matched prompt pair','Cost estimate is an admission estimate, NOT a provider billing cap','Do not retry an uncertain paid request or the same RunId','No DB/production writes']};}
export async function compare(o,{invoke}={}){const cfg={...defaults,...o};const {digest,pairs}=inspectSource(cfg),p=plan(cfg,pairs);if(cfg.mode==='plan')return {plan:p};
 if(cfg.mode==='model'&&p.admission_estimate_usd>cfg.budget)throw Error('Paired study estimate exceeds authorized budget');
 const folder=reportPath(cfg.runId);if(fs.existsSync(folder))throw Error('Compare RunId already used');
 if(cfg.mode==='model'){
  const marks=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41','paid-comparison-attempts');fs.mkdirSync(marks,{recursive:true});
  fs.writeFileSync(path.join(marks,cfg.runId+'.json'),JSON.stringify({run_id:cfg.runId,source_run:cfg.sourceRun,one_shot:true}),{flag:'wx',mode:0o600});
 }
 fs.mkdirSync(folder,{recursive:true});
 const report={...p,source_trace_sha256:digest,complete:false,scientific_scoring:false,results:[],known_estimated_usd:0,model_calls:0,failure:null,db_writes:0};
 const persist=()=>fs.writeFileSync(path.join(folder,'COMPARE.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});persist();
 try{
  if(cfg.mode==='offline'){report.note='Frozen inputs and prompt hashes inspected; no model answers, mock grades or API calls generated';}
  else{
   if(!invoke)checkEnv();const ctx=invoke?null:credentials();
   for(const pair of pairs){const item={case:pair.label,role:pair.role,identical_user_input_sha256:pair.inputSha256,arms:[]};report.results.push(item);persist();
    for(const arm of ['R4','R4.1']){
     if(report.known_estimated_usd>=cfg.budget)throw Error('Estimated authorization threshold reached before next call');
     const payload=makeRequest(pair,arm==='R4'?'R4':'R41',cfg.model);
     const out={arm,request_sha256:sha(payload),status:'prepared'};item.arms.push(out);persist();
     let response;try{response=invoke?await invoke(pair.role,clone(payload),arm):await callProvider(payload,ctx)}catch(e){out.status='transport_unknown';throw Error('Uncertain provider result; no retries: '+String(e.message));}
     out.status='returned';out.raw=typeof response.raw==='string'?response.raw:JSON.stringify(response.raw??response);out.response_sha256=sha(out.raw);
     try{out.parsed=JSON.parse(out.raw);out.json_valid=true}catch{out.json_valid=false}
     if(!response.usage)throw Error('Unknown provider usage; do not retry');
     out.usage=response.usage;out.estimated_usd=estimateCost(response.usage,cfg.model);report.known_estimated_usd=+(report.known_estimated_usd+out.estimated_usd).toFixed(9);report.model_calls++;persist();
     if(report.known_estimated_usd>cfg.budget)throw Error('Estimated budget exceeded after provider call; stop');
    }
   }
  }
  report.complete=true;
 }catch(e){report.failure=String(e.stack??e).slice(0,2200)}
 persist();
 fs.writeFileSync(path.join(folder,'COMPARE_REVIEW.md'),`# R4 vs R4.1 frozen-input comparison\n\nComplete: ${report.complete}\nMode: ${cfg.mode}\nCases: ${pairs.map(x=>x.label).join(', ')}\nModel calls: ${report.model_calls}; known estimated USD: ${report.known_estimated_usd}\n\n**No automatic educational grading.** For A, compare observation-versus-inference, evidence citations, durable memory selectivity and alternative root hypotheses. For B, compare responsiveness, diagnostic opportunity without forced quizzes, and creative freedom. For X, compare task and intended-versus-delivered fidelity; note current symbolic constraints. For L, compare coherence without expected answers. Look at raw responses independently and account for ordinary model sampling variance.\n\nFull input SHA, system prompt hashes, responses and call usage are in COMPARE.json. R4 original trace remains unmodified.\n`,{mode:0o600});
 return {plan:p,folder,report};
}
async function main(){const cfg=parseArgs(process.argv.slice(2));const r=await compare(cfg);if(cfg.mode==='plan'){console.log('S62B-FIX1R4.1 COMPARE PLAN (NO API)\n'+JSON.stringify(r.plan,null,2));return;}
 console.log('S62B-FIX1R4.1 COMPARE '+r.folder+' '+JSON.stringify({complete:r.report.complete,model_calls:r.report.model_calls,known_estimated_usd:r.report.known_estimated_usd,failure:r.report.failure}));if(!r.report.complete)process.exitCode=1;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62B-FIX1R4.1 COMPARE STOP '+String(e.stack??e));process.exitCode=1});
