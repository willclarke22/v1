#!/usr/bin/env node
/** Explicit continuation of the reviewed goldpilot01 t0009 paid checkpoint. No A/ROUTE rerun.
 * Read-only CHECK. CONTINUE runs exactly B and X after explicit paid opt-in.
 * The original pending model responses and user message remain auditably preserved.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {verifyAIsolated,applyA,A_SCHEMA} from './s62bfix1r2-core.mjs';
import {validateRoute,clone,sha,teacherText,makeXInput,X_GOLD_PROMPT} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
import {normalizeTeachingR50,normalizeVisualR50} from './s62bfix1r50-output.mjs';
import {B_R46_PROMPT,B_R46_SCHEMA,sceneCatalog,makeSceneContract} from './s62bfix1r46-probe-core.mjs';
import {makeTeacherInputR50} from './s62bfix1r50-context.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
const SESSION='goldpilot01',TURN_ID='t0009';
const ROOTDIR=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop',SESSION);
const STATE=path.join(ROOTDIR,'state.json'),PENDING=path.join(ROOTDIR,'turns',TURN_ID+'.pending.json'),COMPLETE=path.join(ROOTDIR,'turns',TURN_ID+'.json');
// Fingerprints of the exact session/trace supplied for review by the user.
const REVIEWED_STATE_SHA='ce71976810220f83f52b5ac2e48f47a090ba419d2113c111220b94bb2b97c54a';
const REVIEWED_PENDING_SHA='a4bf28a4718437ed808d6a41d432318ab0c00e2c10550c139141882d51a6ddf8';
const hashFile=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const fail=m=>{throw Error('R50 RESUME REFUSED: '+m);};
function args(argv){let mode=null,budget=null,modelB='gpt-4.1-mini',modelX='gpt-4.1-mini',allowSpend=false;
 for(let i=0;i<argv.length;i++){const k=argv[i],v=argv[i+1];if(k==='--allow-spend'){allowSpend=true;continue;}if(!v)fail('missing argument '+k);i++;if(k==='--mode')mode=v;else if(k==='--budget-usd')budget=Number(v);else if(k==='--model-b')modelB=v;else if(k==='--model-x')modelX=v;else fail('unknown argument '+k);}
 if(!['check','continue'].includes(mode))fail('mode must be check or continue');if(!['gpt-4.1-mini','gpt-4.1'].includes(modelB)||!['gpt-4.1-mini','gpt-4.1'].includes(modelX))fail('unsupported model');if(mode==='continue'&&(!allowSpend||!(budget>0&&budget<=10)))fail('explicit per-resume paid authorization and software budget required');if(mode==='check'&&(allowSpend||budget!==null))fail('check must be free');return {mode,budget,modelB,modelX};}
function safeInspect(){
 if(!fs.existsSync(STATE)||!fs.existsSync(PENDING)||fs.existsSync(COMPLETE))fail('reviewed pending/state file missing, altered or already complete');
 if(hashFile(STATE)!==REVIEWED_STATE_SHA||hashFile(PENDING)!==REVIEWED_PENDING_SHA)fail('original session differs from the reviewed ZIP. Do not rerun; export updated session for fresh review');
 const state=read(STATE),turn=read(PENDING);
 if(state.learner!==SESSION||state.turns.length!==8||turn.session_id!==SESSION||turn.turn_id!==TURN_ID||turn.status!=='manual_review_required_after_failure')fail('unexpected session or turn shape');
 if(turn.calls.length!==2||turn.calls[0].role!=='ROUTE'||turn.calls[1].role!=='A'||turn.calls.some(c=>c.status!=='returned'||sha(c.request)!==c.request_sha256||sha(c.response_raw)!==c.response_sha256))fail('paid response hashes or roles invalid');
 const route=validateRoute(JSON.parse(turn.calls[0].response_raw),state.topics),topic=state.topics.find(t=>t.id===route.existing_topic_id);
 if(!topic||topic.id!==turn.route?.resolved_topic?.id||topic.id!==turn.current?.topic_id)fail('original route/current topic mismatch');
 if(state.observations.some(o=>o.id===turn.current.id)||state.turns.some(t=>t.turn_id===TURN_ID))fail('turn has already entered durable history');
 const originalAInput=JSON.parse(turn.calls[1].request.messages.at(-1).content),rawA=JSON.parse(turn.calls[1].response_raw);
 if(originalAInput.current?.id!==turn.current.id||originalAInput.current?.text!==turn.current.text||!originalAInput.allowed_evidence_ids.includes(turn.current.id))fail('original A input does not match pending learner evidence');
 const packetState={...clone(state),observations:[...state.observations,clone(turn.current)]};
 const packet={current:clone(turn.current),evidence:clone(originalAInput.observations),allowed_evidence_ids:clone(originalAInput.allowed_evidence_ids),memory_candidates:clone(originalAInput.memory_candidates),coverage:clone(originalAInput.coverage)};
 const verified=verifyAIsolated(rawA,packet,packetState);
 if(!verified.assessment_valid)fail('original paid A response cannot be grounded against its original request: '+verified.error);
 if(originalAInput.focused_history_question!==null)fail('expected first A assessment only');
 return {state,turn,topic,packet,verified,originalAInput};
}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;let dot;try{dot=require('dotenv');}catch{fail('dotenv not installed to read .env.local');}const e=dot.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=e.OPENAI_API_KEY||e.MYWAY_OPENAI_API_KEY||'';if(e.OPENAI_BASE_URL&&!process.env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=e.OPENAI_BASE_URL;}
function providerRequest(role,input,prompt,schema,model,maxTokens){if(Buffer.byteLength(JSON.stringify(input))>56000)fail('B/X input too large before provider call');return {model,store:false,max_tokens:maxTokens,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'myway_r50_resume_'+role.toLowerCase(),strict:true,schema}}};}
export function check(){const {state,turn,topic,verified}=safeInspect();return {mode:'check',read_only:true,status:'ready_for_explicit_paid_continuation',session_id:SESSION,turn_id:TURN_ID,topic:topic.title,prior_completed_turns:state.turns.length,original_paid_responses_verified:2,original_roles:turn.calls.map(c=>c.role),already_paid_estimated_usd:turn.total_estimated_usd,already_returned_A_grounded:true,more_history_requested:verified.output.interpretation.more_history_needed,second_A_deliberately_not_repeated:true,remaining_roles:['B','X'],new_model_calls_on_check:0,new_embedding_calls_on_check:0,new_model_calls_only_if_approved:2,raw_prior_responses_preserved:true,modelB_result_not_known_yet:true,warning:'The recovered A assessment was generated with the original, larger R4.9 evidence context; B will receive a compact, corrective-focused brief. Structured validation does not prove educational quality.'};}
export async function continuePaid({budget,modelB,modelX}){
 const prepared=safeInspect();const {state,turn,topic,packet,verified}=prepared;
 const reserve={'gpt-4.1-mini':0.055,'gpt-4.1':0.29},min=reserve[modelB]+reserve[modelX];if(budget<min)fail('software admission needs at least $'+min.toFixed(3)+' for B+X; not a provider billing cap');
 loadEnv();const providerContext=credentials();const backupDir=path.join(ROOTDIR,'recovery-backups','t0009-r50-checkpoint');fs.mkdirSync(backupDir,{recursive:true});const backupPath=path.join(backupDir,'original-reviewed-pending.json');
 fs.writeFileSync(backupPath,fs.readFileSync(PENDING),{flag:'wx',mode:0o600});const stateBefore=fs.readFileSync(STATE);
 const a=verified.output;let spent=0;
 turn.recovery={schema:'r50_reviewed_checkpoint_resume_v1',origin:'first_A_returned_and_validated',prior_response_hashes:turn.calls.map(c=>c.response_sha256),original_pending_backup:backupPath,additional_A_calls:0,second_retrieval_disposition:'deferred: no independent probe success evidenced in supplied history',modelB,modelX,warning:'This continuation is approved and billable for B and X only; never auto-retry after unknown provider result'};
 const flush=()=>write(PENDING,turn);
 async function call(role,input,prompt,schema,model,maxTokens){if(spent+reserve[model]>budget)fail('conservative software admission limit before '+role+'; no call made');const req=providerRequest(role,input,prompt,schema,model,maxTokens);const entry={role,model,request:req,request_sha256:sha(req),input_sha256:sha(input),status:'submitted',sent_at:new Date().toISOString(),response_sha256:null,response_raw:null,estimated_usd:null};turn.calls.push(entry);turn.status='model_call_submitted_'+role;flush();let response;
  try{response=await callProvider(req,providerContext);}catch(e){entry.status='transport_or_provider_error_unknown_usage';entry.error=String(e.message);turn.status='manual_review_required_unsafe_to_retry';flush();throw e;}
  entry.response_raw=response.raw;entry.response_sha256=sha(response.raw);entry.usage=response.usage;entry.provider_model=response.model;entry.status='returned';entry.received_at=new Date().toISOString();try{entry.estimated_usd=estimateCost(response.usage,model);spent+=entry.estimated_usd;}catch(e){entry.usage_error=String(e.message);turn.status='manual_review_required_unknown_cost';flush();throw e;}turn.total_estimated_usd=+(Number(turn.total_estimated_usd??0)+entry.estimated_usd).toFixed(8);flush();return JSON.parse(response.raw);}
 try{
  const next=clone(state);let changes=[];if(a.memory_decisions?.length)changes=applyA(next,a,turn.current.id);
  turn.A={input:prepared.originalAInput,output:a,root_similarity_candidates:prepared.originalAInput.root_similarity_candidates,validation:{assessment_valid:true,proposed_memory_actions:verified.proposed_memory_actions,rejected_memory_actions:verified.rejected_memory_actions},changes,focused_retrieval:{requested:a.interpretation.more_history_needed,used:false,reason:'deferred after first paid A; no automatic second A'},retrieval_summary:{...packet.coverage,selected_ids:packet.allowed_evidence_ids,reviewed_original_A_context:true},retrieval_preview:[]};flush();
  const teacherInput={...makeTeacherInputR50(next,turn.current,a,packet),available_scene_catalog:sceneCatalog(next,topic.id),recent_probe_attempts:(next.probe_attempts??[]).slice(-3).map(p=>({attempt_id:p.attempt_id,source_turn_id:p.turn_id,modality:p.modality,status:p.status,learner_answer:p.learner_answer,hints_requested:p.hints_requested,placeholder_not_validated:true})),probe_rule:'Only offer a probe when it helps. The learner wants a usable comprehension strategy, not another taxonomy. Treat skipped activities neutrally.'};
  const B=await call('B',teacherInput,B_R46_PROMPT+'\n\nR5.0 CRITICAL CORRECTION: The learner has explicitly rejected earlier rule lists or classification explanations. Respond directly to the real-time processing skill they requested. Show a simple practical method in use, not another inventory of abstract categories. This is the learner\'s correction and not evidence of incompetence. Prefer 3–6 short narration beats, maximum eight. Offer an activity only if useful.',B_R46_SCHEMA,modelB,3800);
  const {output:bOutput,report:bReport}=normalizeTeachingR50(B);turn.B={input:teacherInput,output:bOutput,normalization:bReport};turn.teacher_response=teacherText(bOutput);flush();
  const xInput={...makeXInput(bOutput,teacherInput),B_optional_probe_plan:bOutput.probe_plan,existing_scene_catalog:teacherInput.available_scene_catalog,scene_reuse_instruction:'Reuse relevant scene descriptions when meaningful; this is textual only; do not claim graphics were rendered.'};
  const {output:xOutput,report:xReport}=normalizeVisualR50(await call('X',xInput,X_GOLD_PROMPT, (await import('./s62bfix1r43-goldloop-core-anchor-v1.mjs')).X_GOLD_SCHEMA,modelX,4000),bOutput);
  turn.X={input:xInput,output:xOutput,alignment_verified:xReport.missing_beat_ids.length===0,coverage_report:xReport};
  const scene=makeSceneContract(next,TURN_ID,topic,bOutput,xOutput);turn.scene_contract=scene;
  next.observations.push(clone(turn.current));next.scene_contracts??=[];next.scene_contracts.push(scene);next.turns.push({runtime_patch_version:'r50_reviewed_checkpoint_resume_v1',turn_id:TURN_ID,topic_id:topic.id,topic_title:topic.title,learner_message:turn.current.text,teacher_response:turn.teacher_response,B_output:bOutput,X_output:xOutput,probe_plan:bOutput.probe_plan,scene_contract_id:scene.scene_id,scene_contract:scene,A_brief:a.learner_brief_for_B,evidence_id:turn.current.id,visuals_rendered:false,probe_opportunity:{teaching_mode:bOutput.teaching_mode,offered_actions:bOutput.beats.map(b=>({beat_id:b.id,learner_action:b.learner_action})).filter(x=>x.learner_action),status:bOutput.probe_plan?.offer?'offered_not_observed_or_scored':'not_offered',structured_probe_plan:bOutput.probe_plan}});
  turn.status='complete';turn.recovery.result='B_and_X_only_paid_continuation_complete';turn.completed_at=new Date().toISOString();turn.summary={turn_id:TURN_ID,model_calls:turn.calls.map(c=>({role:c.role,response_sha256:c.response_sha256,estimated_usd:c.estimated_usd})),A_validation:true,B_beats:bOutput.beats.length,X_beats:xOutput.moments.length};flush();
  const stateBackup=path.join(backupDir,'state-before-completion.json');fs.writeFileSync(stateBackup,stateBefore,{flag:'wx',mode:0o600});const tmp=STATE+'.r50tmp';write(tmp,next);fs.renameSync(tmp,STATE);fs.renameSync(PENDING,COMPLETE);
  return {status:'completed_from_verified_checkpoint',session_id:SESSION,turn_id:TURN_ID,new_paid_calls:2,prior_paid_calls_reused:2,estimated_additional_usd:+spent.toFixed(8),estimated_total_turn_usd:turn.total_estimated_usd,completed_turns:next.turns.length,topic:topic.title,raw_previous_model_outputs_preserved:true,backups:backupDir};
 }catch(e){if(turn.status!=='manual_review_required_unsafe_to_retry'&&turn.status!=='manual_review_required_unknown_cost')turn.status='manual_review_required_after_failure';turn.failure='R50 checkpoint continuation: '+String(e.stack??e.message);flush();throw Error(String(e.message)+'\nPending paid work retained; DO NOT automatically retry B or X. Export the session for manual review.');}
}
export async function main(argv=process.argv.slice(2)){const o=args(argv);return o.mode==='check'?check():continuePaid(o);}
const me=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===me)main().then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(String(e.stack??e.message));process.exitCode=1;});
