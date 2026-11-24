#!/usr/bin/env node
/** R5.4R: recover a saved B plan with a separately consented NEW X call.
 * The original B+X .pending.json is NEVER edited, deleted, renamed, or retried.
 * A fresh immutable recovery trace is reserved before the provider call. Failed recovery also
 * remains pending; no automatic retry and no ability to run it twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {callProviderExtended} from './s62bfix1r54r-provider.mjs';
import {sha,B_BRIEF_SCHEMA,ACTIVITY_SCHEMA,validateActivity} from './s62bfix1r54-creative-core.mjs';
import {BASE} from './s62bfix1r54-creative-store.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,39}$/ , TURN=/^t\d{4,}$/;
const models=new Set(['gpt-4.1-mini','gpt-4.1']);
const check=(v,m)=>{if(!v)throw Error('R54R X recovery: '+m);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fileSha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const writeNew=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
const flush=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
function branch(){const p=spawnSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8',timeout:10000});check(p.status===0&&p.stdout.trim()==='myway/learning-sandbox-v3_7a','wrong protected Git branch');}
function env(){if(process.env.OPENAI_API_KEY)return;const f=path.join(ROOT,'.env.local');if(fs.existsSync(f)){const d=require('dotenv').parse(fs.readFileSync(f));process.env.OPENAI_API_KEY=d.OPENAI_API_KEY||d.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&d.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=d.OPENAI_BASE_URL;}}
export function parseArgs(argv){
 const o={mode:'check',session:null,turn:null,modelX:'gpt-4.1-mini',budget:null,allow:false};
 const map={'--mode':'mode','--session-id':'session','--turn-id':'turn','--model-x':'modelX','--budget-usd':'budget'};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--allow-spend'){o.allow=true;continue;}
  check(map[argv[i]]&&argv[i+1]!==undefined,'unknown CLI argument '+argv[i]);o[map[argv[i]]]=argv[++i];
 }
 check(['check','model'].includes(o.mode)&&ID.test(o.session??'')&&TURN.test(o.turn??'')&&models.has(o.modelX),'invalid mode/session/turn/model');
 o.budget=o.budget===null?null:Number(o.budget);
 if(o.mode==='model')check(o.allow&&Number.isFinite(o.budget)&&o.budget>=(o.modelX==='gpt-4.1'?0.29:0.055)&&o.budget<=10,'X-only recovery requires separate paid approval and sufficient USD budget');
 else check(!o.allow&&o.budget===null,'check mode is read-only and free');
 return o;
}
function load(o,base){
 const dir=path.join(base,o.session),sp=path.join(dir,'state.json');check(fs.existsSync(sp),'session missing');
 const state=read(sp);check(state.schema==='myway_goldloop_human_v1'&&state.learner===o.session,'session identity mismatch');
 check(state.turns?.at(-1)?.turn_id===o.turn,'recovery only on latest completed teaching turn');
 const turn=state.turns.at(-1),folder=path.join(dir,'creative-designs');
 const source=path.join(folder,o.turn+'-bx.pending.json');
 const canonical=path.join(folder,o.turn+'-bx.json');
 const pending=path.join(folder,o.turn+'-bx.recovery01.pending.json');
 const done=path.join(folder,o.turn+'-bx.recovery01.json');
 check(fs.existsSync(source),'original B+X pending trace missing');
 check(!fs.existsSync(canonical)&&!fs.existsSync(pending)&&!fs.existsSync(done),'recovery already reserved/completed; never repeat paid call');
 check(!fs.readdirSync(path.join(dir,'turns')).some(n=>n.endsWith('.pending.json')),'paid learning turn pending');
 const original=read(source);
 check(original.schema==='myway_r54_creative_trace_v1'&&original.session_id===o.session&&original.turn_id===o.turn&&original.variant==='bx','wrong source trace');
 check(original.topic_id===turn.topic_id&&original.status==='manual_review_required_no_automatic_retry','original research trace not in recoverable failed state');
 check(original.calls?.length===2&&original.calls[0].role==='B_DESIGN'&&original.calls[0].status==='returned'&&original.calls[1].role==='X_IMPLEMENT'&&original.calls[1].status==='billing_unknown_do_not_retry','recovery requires B succeeded, X unrecorded');
 check(!original.calls[1].raw&&!original.calls[1].usage,'X provider response was already recorded; manual review needed');
 const b=JSON.parse(original.calls[0].raw??'null');check(typeof b?.brief==='string'&&b.brief.trim().length>=40&&b.brief.length<=12000,'B plan missing/invalid');
 const xReq=original.calls[1].request;
 check(xReq?.messages?.[0]?.role==='system'&&xReq?.messages?.[1]?.role==='user'&&xReq?.response_format?.json_schema?.name==='myway_r54_x_implementation','unexpected original implementation request');
 const xUser=JSON.parse(xReq.messages[1].content);
 check(xUser.model_B_educational_design===b.brief&&xUser.learner_context?.source_turn_id===o.turn&&xUser.learner_context?.topic_id===turn.topic_id,'saved B plan and context do not agree');
 const A=turn.A_brief??null;
 xUser.learner_context.model_A_learner_brief_is_tentative=typeof A==='string'?A.slice(0,3000):JSON.stringify(A).slice(0,3000);
 const req={...xReq,model:o.modelX,messages:[xReq.messages[0],{role:'user',content:JSON.stringify({...xUser,request:'Implement the original saved Model B educational design as a self-contained creative browser interaction. This is a newly authorized X-only recovery call, not a repeat of the original transport operation.'})}]};
 check(Buffer.byteLength(JSON.stringify(req))<=26000,'recovery request too large');
 const originalSha=fileSha(source),bSha=sha(b.brief);
 return {dir,turn,folder,source,canonical,pending,done,originalSha,original,bSha,brief:b.brief,req,contextSha:sha(xUser.learner_context)};
}
export async function run(argv=process.argv.slice(2),{invoke=null,skipBranch=false,base=BASE}={}){
 const o=parseArgs(argv);if(!skipBranch)branch();const c=load(o,base);
 if(o.mode==='check')return {status:'recoverable_read_only',session_id:o.session,turn_id:o.turn,source_pending_sha256:c.originalSha,original_B_completed:true,original_X_billing_unknown:true,reuse_B_call:true,new_paid_calls_required:1,method:'new_explicitly_authorized_X_only_attempt',writes:0,model_calls:0};
 env();const cred=invoke?null:credentials();
 const trace={schema:'myway_r54r_recovery_trace_v1',status:'reserved',session_id:o.session,turn_id:o.turn,variant:'bx',source_pending_sha256:c.originalSha,saved_B_brief_sha256:c.bSha,source_context_sha256:c.contextSha,original_X_billing_unknown:true,new_X_model:o.modelX,explicit_spend_approval:true,started_at:new Date().toISOString(),calls:[],estimated_usd:0,reuses_original_B_result:true,original_pending_immutable:true};
 writeNew(c.pending,trace); // no writes to original .pending.json
 try{
  const log={role:'X_RECOVERY_NEW_CALL',model:o.modelX,status:'submitted_billing_unknown_until_recorded',request:c.req,started_at:new Date().toISOString()};
  trace.calls.push(log);trace.status='new_X_provider_call_submitted';flush(c.pending,trace);
  let result;
  try{result=invoke?await invoke(c.req,'X_RECOVERY_NEW_CALL'):await callProviderExtended(c.req,cred,{timeoutMs:120000});}
  catch(e){log.status='billing_unknown_do_not_retry';log.error=String(e?.message??e);throw e;}
  log.status='returned';log.raw=result.raw;log.usage=result.usage;log.transport=result.transport??null;
  log.estimated_usd=estimateCost(result.usage,o.modelX);trace.estimated_usd=log.estimated_usd;flush(c.pending,trace);
  check(log.estimated_usd<=o.budget,'recorded cost exceeds user-approved budget; inspect before continuation');
  const activity=validateActivity(JSON.parse(result.raw));
  const output={schema:'myway_r54_creative_artifact_v1',status:'complete',variant:'bx',session_id:o.session,turn_id:o.turn,topic_id:c.turn.topic_id,title:activity.title,brief:c.brief,activity,activity_sha256:sha(activity),source_context_sha256:c.contextSha,model_calls:1,estimated_usd:+log.estimated_usd.toFixed(8),created_at:new Date().toISOString(),quality_unverified:true,no_automatic_scoring:true,recovery:{kind:'new_X_only_call',source_pending_sha256:c.originalSha,saved_B_brief_sha256:c.bSha,recovery_trace_name:path.basename(c.done),old_X_billing_unknown:true,original_B_call_not_repeated:true}};
  const canonicalTrace={schema:'myway_r54_creative_trace_v1',status:'complete',session_id:o.session,turn_id:o.turn,topic_id:c.turn.topic_id,variant:'bx',recovery_source_sha256:c.originalSha,recovery_trace_name:path.basename(c.done),original_X_billing_unknown:true,calls:trace.calls,output,completed_at:new Date().toISOString()};
  // Exclusive canonical creation. If a power cut occurs after this write, the original
  // recovery .pending record remains for manual audit, while the valid activity can load.
  writeNew(c.canonical,canonicalTrace);
  trace.status='complete';trace.output_artifact_sha256=output.activity_sha256;trace.completed_at=new Date().toISOString();flush(c.pending,trace);fs.renameSync(c.pending,c.done);
  return {status:'complete',session_id:o.session,turn_id:o.turn,activity_title:output.title,estimated_new_X_usd:output.estimated_usd,model_calls:['X_RECOVERY_NEW_CALL'],original_B_reused:true,original_X_billing_unknown:true,original_pending_preserved:true};
 }catch(e){trace.status='manual_review_required_no_automatic_retry';trace.failure=String(e?.stack??e);flush(c.pending,trace);throw Error(String(e?.message??e)+'; inspect '+c.pending+'; no automatic paid retry');}
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));if(isMain)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
