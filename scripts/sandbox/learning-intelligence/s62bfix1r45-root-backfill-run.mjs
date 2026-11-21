#!/usr/bin/env node
/** One-time paid Model A retrospective root-hypothesis backfill. Never silently retries. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {ROOT,loadState,pendingExists,read,write,assert,backfillSources,backfillPreview,validateBackfill,applyBackfill,BACKFILL_PROMPT,BACKFILL_SCHEMA,sha} from './s62bfix1r45-root-memory.mjs';
const require=createRequire(import.meta.url);
const ALLOWED=new Set(['gpt-4.1-mini','gpt-4.1']);
export function parseArgs(args){const o={mode:'preview',session:'goldpilot01',model:'gpt-4.1-mini',budget:null,approved:false};for(let i=0;i<args.length;i++){if(args[i]==='--allow-spend'){o.approved=true;continue;}const key={'--mode':'mode','--session-id':'session','--model-a':'model','--budget-usd':'budget'}[args[i]];assert(key&&args[i+1],'unknown option '+args[i]);o[key]=args[++i];}assert(['preview','model'].includes(o.mode),'mode must be preview or model');assert(ALLOWED.has(o.model),'unsupported model');o.budget=o.budget===null?null:Number(o.budget);if(o.mode==='model')assert(o.approved&&Number.isFinite(o.budget)&&o.budget>0&&o.budget<=10,'explicit spend approval and 0 < budget <= $10 required');else assert(!o.approved&&o.budget===null,'preview is free and cannot approve spending');return o;}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;let parser;try{parser=require('dotenv');}catch{throw Error('Missing dotenv; set OPENAI_API_KEY or restore experiment dependencies');}const e=parser.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=e.OPENAI_API_KEY||e.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&e.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=e.OPENAI_BASE_URL;}
function sourced(state,dir){const input=backfillSources(state,path.join(dir,'turns'),{maxTurns:24,maxObservations:90});assert(input.observations.length>0&&input.previous_A_interpretations.length>0,'No completed A trace and historical evidence to backfill');const bytes=Buffer.byteLength(JSON.stringify(input));assert(bytes<=55000,`Historical evidence packet ${bytes} bytes exceeds 55 KB. No model call; use a smaller research session for now.`);return input;}
function guard(o){const ctx=loadState(o.session);assert(!pendingExists(ctx.dir),'Incomplete paid turn/retry/backfill; inspect it before further model calls');assert(!(ctx.state.root_backfill_history??[]).some(x=>x.version==='r45'),'R4.5 backfill was already completed for this session');assert(!ctx.state.records.some(r=>r.provenance?.backfill_version==='r45'),'R4.5 already imported records');assert(!ctx.state.records.some(r=>['root','shared_root'].includes(r.type)),'Existing root records detected; backfill must not create duplicates. Preserve records and review them manually.');return ctx;}
export async function run(argv=process.argv.slice(2),{invoke=null}={}){const o=parseArgs(argv),ctx=guard(o),preview=backfillPreview(ctx.state,path.join(ctx.dir,'turns'));if(o.mode==='preview')return {...preview,model_calls:0,db_writes:0};
 const reservePrice={'gpt-4.1-mini':0.055,'gpt-4.1':0.29}[o.model];assert(o.budget>=reservePrice,`software budget admission needs at least $${reservePrice} (not a provider billing cap)`);
 const input=sourced(ctx.state,ctx.dir);loadEnv();const creds=invoke?null:credentials();const backfillDir=path.join(ctx.dir,'root-backfill');fs.mkdirSync(backfillDir,{recursive:true});const id='bf0001',pending=path.join(backfillDir,id+'.pending.json'),complete=path.join(backfillDir,id+'.json');assert(!fs.existsSync(pending)&&!fs.existsSync(complete),'Prior paid backfill attempt exists; inspect it (never rerun)');
 const req={model:o.model,store:false,max_tokens:3300,messages:[{role:'system',content:BACKFILL_PROMPT},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'myway_r45_backfill',strict:true,schema:BACKFILL_SCHEMA}}};const trace={schema:'myway_r45_root_backfill_v1',session_id:o.session,id,status:'reserved',started_at:new Date().toISOString(),model:o.model,budget_software_admission_usd:o.budget,source_state_sha256:sha(ctx.state),source_evidence_ids:input.observations.map(x=>x.id),request_sha256:sha(req),request:req,response_raw:null,usage:null,estimated_usd:null,model_calls:0,accepted_roots:[],rejected_roots:[],audit:'Retrospective model hypothesis, not learner-confirmed root or mastery.'};
 // Reserve a no-retry marker BEFORE the request. If provider fails, preserve the pending trace.
 fs.writeFileSync(pending,JSON.stringify(trace,null,2)+'\n',{flag:'wx',mode:0o600});const flush=()=>write(pending,trace);
 try{
  trace.status='model_call_submitted';trace.model_calls=1;trace.submitted_at=new Date().toISOString();flush();let out;
  try{out=invoke?await invoke(req):await callProvider(req,creds);}catch(e){trace.status='manual_review_required_unknown_billing';trace.transport_error=String(e.message);flush();throw e;}
  trace.response_raw=out.raw;trace.response_sha256=sha(out.raw);trace.usage=out.usage;trace.provider_model=out.model;trace.returned_at=new Date().toISOString();trace.status='provider_returned';flush();
  assert(out.usage,'provider usage missing; inspect trace before continuing');trace.estimated_usd=estimateCost(out.usage,o.model);flush();
  const reviewed=validateBackfill(JSON.parse(out.raw),input);trace.validation=reviewed;flush();
  // State may have received newer highlight feedback or a different turn while the paid call was in flight.
  const now=loadState(o.session);assert(sha(now.state)===trace.source_state_sha256,'Learner state changed during backfill; manual review needed. No write.');
  const result=applyBackfill(now.state,reviewed,{traceId:id});
  const backupDir=path.join(ctx.dir,'root-backfill-backups');fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,id+'-state-before.json');fs.writeFileSync(backup,fs.readFileSync(now.file),{flag:'wx',mode:0o600});trace.original_state_backup=path.relative(ctx.dir,backup);trace.accepted_roots=result.applied;trace.rejected_roots=reviewed.rejected;trace.status='validated_and_backed_up';flush();
  const temp=path.join(ctx.dir,'.r45-state-'+crypto.randomBytes(8).toString('hex')+'.tmp');write(temp,result.state);fs.renameSync(temp,now.file);
  trace.completed_at=new Date().toISOString();trace.status='complete';trace.output_state_sha256=sha(result.state);flush();fs.renameSync(pending,complete);
  return {status:'complete',session:o.session,model_calls:1,estimated_usd:trace.estimated_usd,root_count:reviewed.roots.length,shared_root_candidate_count:reviewed.shared.length,rejected_count:reviewed.rejected.length,records:result.applied,trace:complete,original_traces_unchanged:true};
 }catch(e){if(fs.existsSync(pending)){trace.status=trace.status==='manual_review_required_unknown_billing'?trace.status:'manual_review_required';trace.failure=String(e.stack??e.message);flush();}throw Error(String(e.message)+'\nPaid backfill trace retained: '+pending+'\nDO NOT automatically rerun or delete it.');}
}
const THIS=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===THIS)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
