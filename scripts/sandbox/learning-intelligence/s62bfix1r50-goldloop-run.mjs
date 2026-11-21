#!/usr/bin/env node
/** R4.3 HUMAN GOLDLOOP — research-only, isolated A routing -> A evidence -> B narration -> X textual storyboard.
 * - Real provider calls ONLY in --mode model --allow-spend with explicit budget and unique turn-id.
 * - Real localhost MiniLM ONLY; no fake vectors in model mode or silent lexical substitution.
 * - No production routes, asset library, Director, DB, Vercel, or rendering.
 * - Never automatically retry a possibly billable model call; logs include all attempted payloads and raw replies.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost,PRICING} from './s16b61fix1-models.mjs';
import {A_SCHEMA,verifyAIsolated,applyA} from './s62bfix1r2-core.mjs';
import {R41_A_PROMPT,PROMPT_SET_VERSION} from './s62bfix1r41-prompts.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {localMiniLM} from './s16b60-retrieval.mjs';
import {rankCandidateRoots,pendingExists} from './s62bfix1r45-root-memory.mjs';
import {normalizeTeachingR50,normalizeVisualR50} from './s62bfix1r50-output.mjs';
import {retrieveAndPackR50,focusedRetrievalDecision,makeTeacherInputR50,compactRouteInput} from './s62bfix1r50-context.mjs';

import {B_R46_SCHEMA,B_R46_PROMPT,validateBWithProbe,sceneCatalog,makeSceneContract} from './s62bfix1r46-probe-core.mjs';
import {STAGE,ROUTE_SCHEMA,B_GOLD_SCHEMA,X_GOLD_SCHEMA,ROUTE_PROMPT,A_GOLD_ADDITION,B_GOLD_PROMPT,X_GOLD_PROMPT,idOK,sha,clone,validateRoute,routeTopic,validateB,validateX,makeObservation,packEvidence,makeTeacherInput,makeXInput,teacherText,traceSummary} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
const ROOT_OUTPUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const VERSION='myway_goldloop_human_v1';
const RUNTIME_VERSION='r50_bounded_semantic_context_conditional_A_v1';
const A_R45_MEMORY_POLICY=`\n\nR4.5 LONGITUDINAL ROOT MEMORY (human learner): Current typed root/shared_root records are provisional, not established facts. Inspect their support/counter evidence and the current learner statement. When a specific explanatory mechanism is genuinely supported by cited observations, propose a small, valid create/revise/weaken/retire root memory_decision; do not keep every vague topic-level or motivation-only description as a root. A zero-action response is correct when evidence is insufficient. Do not use embedding cosine score as proof of a shared root. Shared_root requires two distinct learner-specific existing root IDs and DIRECT observations from two topics, with genuine mechanism-level evidence; when uncertain, abstain. Preserve contrasting alternatives, provisional status and historical evidence. A learner's curiosity or positive self-report does not verify independent mastery. An offered B learner_action is NOT an executed or scored probe; interpret a subsequent real learner response as a possible attempt only if the actual text justifies it and disclose any hints/exposure. Use Model A's existing structured memory schema; do not invent IDs, claims or new user facts. B alone chooses whether to offer a probe or natural question.\n`;
const A_R46_PROBE_POLICY=`\nR4.6 REAL PROBE EVIDENCE: Recent probe_attempts are raw browser actions and learner-authored answers, not independently verified conceptual mastery. Interpret the particular task, whether learner skipped/used a hint, the order of action events, and whether it was a placeholder or a genuine interactive simulation. The text scene is not rendered 2D/3D. A correct-looking option without reason is limited evidence, and probe non-participation is never failure. Do not assert independent mastery solely from an answer or a model-proposed task. When root hypotheses are affected, cite the probe observation ID (ending -IN) in a valid memory_decision and distinguish support vs counterevidence. No fabricated probe results or simulations. If a past attempt is not among the allowed evidence IDs, do not cite it as supporting evidence until retrieved.\n`;
const ALLOWED_MODELS=new Set(Object.keys(PRICING));
const flags={'--mode':'mode','--session-id':'sessionId','--turn-id':'turnId','--message-file':'messageFile','--model-a':'modelA','--model-b':'modelB','--model-x':'modelX','--budget-usd':'budget','--second-retrieval':'secondRetrieval'};
const fail=m=>{throw Error('GOLDLOOP: '+m);};
export function parseArgs(argv){const o={mode:'plan',sessionId:'sample_session',turnId:'t001',messageFile:null,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on'};
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--allow-spend'){o.allowSpend=true;continue;}if(!(a in flags)||!argv[i+1])fail('Unknown or incomplete argument '+a);o[flags[a]]=argv[++i];}
 if(!['plan','preflight','retrieval-check','model'].includes(o.mode)||!idOK(o.sessionId)||!idOK(o.turnId))fail('Invalid mode/session-id/turn-id');
 if([o.modelA,o.modelB,o.modelX].some(x=>!ALLOWED_MODELS.has(x)))fail('Use verified gpt-4.1-mini or gpt-4.1 structured-output models; other models not yet API-validated');
 if(!['on','off'].includes(o.secondRetrieval))fail('second retrieval must be on/off');
 o.budget=o.budget===null?null:Number(o.budget);
 if(o.mode==='model'&&(!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>10||!o.messageFile))fail('Model mode requires --allow-spend, --budget-usd (0,10], and --message-file');
 if(o.mode!=='model'&&(o.allowSpend||o.budget!==null))fail('Free modes cannot accept paid flags');
 if(o.mode==='retrieval-check'&&!o.messageFile)fail('retrieval-check requires --message-file');
 if(o.messageFile)o.messageFile=path.resolve(o.messageFile);
 return o;
}
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
export const sessionDir=id=>path.join(ROOT_OUTPUT,id);
function defaultState(learner){return {schema:VERSION,stage:STAGE,learner,topics:[],observations:[],records:[],turns:[],version:0};}
function checkState(state,o){if(state.schema!==VERSION||state.learner!==o.sessionId||!Array.isArray(state.topics)||!Array.isArray(state.observations)||!Array.isArray(state.records)||!Array.isArray(state.turns)||!Number.isInteger(state.version))fail('Unexpected state format or learner');}
function loadEnv(){if(process.env.OPENAI_API_KEY)return;const p=path.join(ROOT,'.env.local');if(!fs.existsSync(p))return;let parser;try{parser=require('dotenv');}catch{fail('dotenv is needed to load local .env.local; or set OPENAI_API_KEY in this terminal');}const e=parser.parse(fs.readFileSync(p));process.env.OPENAI_API_KEY=e.OPENAI_API_KEY||e.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&e.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=e.OPENAI_BASE_URL;}
function response(role,input,prompt,schema,model,maxTokens){if(Buffer.byteLength(JSON.stringify(input))>56000)fail('Oversized '+role+' input; no silent evidence clipping');return {model,store:false,max_tokens:maxTokens,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'myway_g43_'+role.toLowerCase(),strict:true,schema}}};}
function basePlan(o){return {stage:STAGE,runtime_patch_version:RUNTIME_VERSION,mode:o.mode,session_id:o.sessionId,turn_id:o.turnId,prompt_base_version:PROMPT_SET_VERSION,model_roles:{route:'A',A:o.modelA,B:o.modelB,X:o.modelX},expected_calls:'4 (route, A, B, X), plus 1 A ONLY if focused retrieval finds previously unseen same-topic evidence',embedding:'REAL all-MiniLM-L6-v2 at http://127.0.0.1:8001/embed; mandatory in model mode',topic_route:'model-guided with exact existing ID validation and free creation; not preassigned',learner:'human input, no Model L, no inferred mastery',B_narration:'authoritative learner-facing words segmented into beats',X:'aligned textual directions only; does NOT invoke Director/assets/renderer',persistence:'ignored local .myway-patch-backups/.../s62bfix1r43-goldloop',app_writes:false,requires_paid_opt_in:true,no_automatic_retry:true,educational_quality_auto_scored:false};}
async function retrievalCheck(o){
 const p=path.join(sessionDir(o.sessionId),'state.json');if(!fs.existsSync(p))fail('No existing completed session state for retrieval-check');
 const state=read(p);checkState(state,o);if(!fs.existsSync(o.messageFile))fail('Missing query message file');
 const query=fs.readFileSync(o.messageFile,'utf8').trim();if(!query||query.length>4000)fail('Invalid retrieval query');
 const current={id:'AUDIT-QUERY',topic_id:state.turns.at(-1)?.topic_id??'unassigned',text:query,compact_index_text:query};
 const copy=clone(state);copy.observations.push(current);
 const p1=await retrieveR3(copy,current,{method:'semantic',cap:12});
 const delivered=(await retrieveAndPackR50(copy,current,{cap:12}));
 return {mode:'retrieval-check',real_local_minilm:true,session:o.sessionId,query_sha256:sha(query),available_prior:state.observations.length,selected_evidence:delivered.packet.evidence.filter(x=>x.id!==current.id).map(x=>({id:x.id,topic_id:x.topic_id,source_excerpt:String(x.text??'').slice(0,420),selection_reason:delivered.packet.selection_reasons[x.id]})),omitted_evidence_ids:delivered.omitted,ranked_preview:p1.ranked_preview,coverage:delivered.input.coverage,model_calls:0,DB_writes:0,warning:'Similarity ranks CANDIDATE history; correctness/relevance must be independently reviewed. The audit query is NOT stored.'};
}
async function preflight(o){const sample=await localMiniLM(['A learner is confused by probability graphs.','A learner wants to understand why treading water is tiring.']);return {...basePlan(o),local_minilm_ok:true,vector_dimension:sample[0].length,embedding_count:sample.length,embedding_finite:sample.every(v=>v.every(Number.isFinite)),used_local_real_service:true,model_calls:0,db_writes:0,not_a_semantic_accuracy_benchmark:true};}
function reserve(o){const dir=sessionDir(o.sessionId),turnDir=path.join(dir,'turns');fs.mkdirSync(turnDir,{recursive:true});
 const pending=path.join(turnDir,o.turnId+'.pending.json'); const complete=path.join(turnDir,o.turnId+'.json');
 if(fs.existsSync(complete)||fs.existsSync(pending))fail('This turn-id already attempted; never automatically retry a billable call. Inspect reports first.');
 const stateFile=path.join(dir,'state.json');if(fs.existsSync(stateFile)){const st=read(stateFile);checkState(st,o);if(pendingExists(dir))fail('Another incomplete paid turn, retry or root backfill exists; inspect before continuing');}
 const state=fs.existsSync(stateFile)?read(stateFile):defaultState(o.sessionId);
 const turn={schema:'myway_goldloop_turn_v1',stage:STAGE,runtime_patch_version:RUNTIME_VERSION,turn_id:o.turnId,session_id:o.sessionId,status:'reserved',started_at:new Date().toISOString(),learner_message_file_sha256:sha(fs.readFileSync(o.messageFile)),calls:[],route:null,A:null,B:null,X:null,ethical_boundary:'Real learner utterances are not independently verified mastery. Do not commit or publish this trace.'};
 // The write is atomic creation. Even process crash or provider uncertainty leaves a no-retry marker.
 fs.writeFileSync(pending,JSON.stringify(turn,null,2)+'\n',{flag:'wx',mode:0o600});
 return {dir,turnDir,pending,complete,stateFile,state,turn};
}
async function modelTurn(o){if(!fs.existsSync(o.messageFile)||!fs.statSync(o.messageFile).isFile())fail('Message file not found');const msg=fs.readFileSync(o.messageFile,'utf8').replace(/^\uFEFF/,'').trim();if(!msg||msg.length>4000)fail('Learner message must be 1..4000 characters');
 // Preflight embedding BEFORE reserving the paid attempt. Fail rather than use lexical or test vectors.
 await localMiniLM(['Goldloop real MiniLM preflight']);loadEnv();const context=credentials();
 const costReserve={ 'gpt-4.1-mini':0.055, 'gpt-4.1':0.29};
 const admission=3*costReserve[o.modelA]+costReserve[o.modelB]+costReserve[o.modelX];
 if(o.budget<admission)fail(`Pre-admission budget too low: ${admission.toFixed(3)} suggested for 4 calls + possible A follow-up; this is NOT a provider billing cap. No model call made.`);
 const r=reserve(o),{state,turn}=r;let spent=0;
 const flush=()=>write(r.pending,turn);
 async function call(role,input,prompt,schema,model,maxTokens){if(spent+costReserve[model]>o.budget)fail(`Conservative pre-admission budget threshold before ${role}: estimated ${spent.toFixed(4)} + ${costReserve[model]} > ${o.budget}. No retry; use new turn-id only after reviewing.`);
  const req=response(role,input,prompt,schema,model,maxTokens),entry={role,model,request_sha256:sha(req),input_sha256:sha(input),request:req,status:'submitted',sent_at:new Date().toISOString(),response_sha256:null,response_raw:null,usage:null,estimated_usd:null};turn.calls.push(entry);turn.status='model_call_submitted_'+role;flush();
  let out;try{out=await callProvider(req,context);}catch(e){entry.status='transport_or_provider_error_unknown_usage';entry.error=String(e.message);turn.status='manual_review_required_unsafe_to_retry';flush();throw e;}
  entry.response_sha256=sha(out.raw);entry.response_raw=out.raw;entry.usage=out.usage;entry.provider_model=out.model;entry.status='returned';entry.received_at=new Date().toISOString();try{entry.estimated_usd=estimateCost(out.usage,model);spent+=entry.estimated_usd;}catch(e){entry.usage_error=String(e.message);turn.status='manual_review_required_unknown_cost';flush();throw e;}turn.total_estimated_usd=+spent.toFixed(8);flush();return JSON.parse(out.raw);
 }
 try{
  const routeInput=compactRouteInput(state,msg);
  const rawRoute=await call('ROUTE',routeInput,ROUTE_PROMPT,ROUTE_SCHEMA,o.modelA,800);const route=validateRoute(rawRoute,state.topics);const topic=routeTopic(state,route);const current=makeObservation(state,topic,msg,o.turnId);turn.route={...route,resolved_topic:topic};turn.current=current;flush();
  // Observations in session state are historical only until this turn commits. Retrieval always injects current.
  const packetState={...state,observations:[...state.observations,current]};
  async function assess(additionalQuery=null,cap=12){const packed=await retrieveAndPackR50(packetState,current,{additionalQuery,cap});const candidateRoots=await rankCandidateRoots(packetState,current);const prior=state.turns.at(-1);const priorProbe=prior?.B_output?{previous_turn_id:prior.turn_id,previous_topic_id:prior.topic_id,previous_teaching_mode:prior.B_output.teaching_mode,original_learner_actions:prior.B_output.beats.map(b=>({beat_id:b.id,offered_action:b.learner_action})).filter(x=>x.offered_action),status:'offered_in_text_not_executed_or_scored',next_input_may_or_may_not_respond_to_probe:true}:null;const recentAttempts=(state.probe_attempts??[]).slice(-3).map(z=>({attempt_id:z.attempt_id,evidence_id:z.evidence_id,source_turn_id:z.turn_id,scene_id:z.scene_id,modality:z.modality,probe_purpose:z.probe_purpose,task_as_offered:String(z.task_as_offered??'').slice(0,650),status:z.status,learner_answer:String(z.learner_answer??'').slice(0,900),selection:z.selection,ordered_items:z.ordered_items,matches:z.matches,selected_items:z.selected_items,values:z.values,hints_requested:z.hints_requested,action_log:(z.action_log??[]).slice(-10),full_raw_record_in_state_and_export:true,placeholder_not_real_renderer:true,not_auto_scored:true}));const aInput={...packed.input,assessment_phase:'pre_teacher',focused_history_question:additionalQuery,root_similarity_candidates:candidateRoots,prior_probe_opportunity:priorProbe,actual_recent_probe_attempts:recentAttempts,policy:'Assessment evidence is NOT automatically a diagnosed root or mastery; cosine similarity NOT a root merge. Raw probe actions are unscored learner evidence, NOT model-verified accuracy'};
   const result=await call('A',aInput,R41_A_PROMPT+A_GOLD_ADDITION+A_R45_MEMORY_POLICY+A_R46_PROBE_POLICY,A_SCHEMA,o.modelA,2400);const valid=verifyAIsolated(result,packed.packet,packetState);if(!valid.assessment_valid)fail('A failed grounded validation: '+valid.error+'; no automatic paid retry');return {output:valid.output,validation:valid,packet:packed.packet,input:aInput,omitted:packed.omitted};}
  let a=await assess();let second=null;
  if(a.output.interpretation.more_history_needed&&o.secondRetrieval==='on'&&state.observations.length){
    const focused=a.output.interpretation.more_history_needed;const decision=await focusedRetrievalDecision(packetState,current,a,focused);
    second={requested:focused,used:decision.use,reason:decision.reason,newly_selected_evidence_ids:decision.newlySelected??[]};
    if(decision.use){a=await assess(focused,12);second.used=true;}
  }
  let changes=[];if(a.output.memory_decisions?.length)changes=applyA(state,a.output,current.id);
  turn.A={input:a.input,output:a.output,root_similarity_candidates:a.input.root_similarity_candidates,validation:{assessment_valid:true,proposed_memory_actions:a.validation.proposed_memory_actions,rejected_memory_actions:a.validation.rejected_memory_actions},changes,focused_retrieval:second,retrieval_summary:{...a.packet.coverage,selected_ids:a.packet.allowed_evidence_ids,omitted_delivered:a.omitted,relevance_not_truth:true},retrieval_preview:a.packet.ranked_preview};flush();
  const teacherInput={...makeTeacherInputR50(state,current,a.output,a.packet),available_scene_catalog:sceneCatalog(state,topic.id),recent_probe_attempts:(state.probe_attempts??[]).slice(-3).map(z=>({attempt_id:z.attempt_id,source_turn_id:z.turn_id,probe_purpose:z.probe_purpose,modality:z.modality,status:z.status,learner_answer:z.learner_answer,hints_requested:z.hints_requested,placeholder_not_validated:true})),probe_rule:'Probe only if educationally useful. Prefer reuse of a prior X text scene with exact scene ID; no graphics have actually been rendered.'};
  const originalB=await call('B',teacherInput,B_R46_PROMPT+'\n\nR5.0 IMPORTANT: The learner\'s latest words and corrections override your impulse to repeat earlier categories, definitions, or teaching metaphors. If a previous explanation was rejected, change teaching strategy rather than rephrasing the same explanation. Focus on the immediate usable skill and demonstrate it with a fresh example. Prefer 3–6 short beats (no more than 8); avoid encyclopedic lists. Offer a probe only if it genuinely helps the learner. Do not claim a skipped probe is a failure.',B_R46_SCHEMA,o.modelB,3900);const {output:bOutput,report:bBeatReport}=normalizeTeachingR50(originalB);turn.B={input:teacherInput,output:bOutput,normalization:bBeatReport};turn.teacher_response=teacherText(bOutput);flush();
  const xInput={...makeXInput(bOutput,teacherInput),B_optional_probe_plan:bOutput.probe_plan,existing_scene_catalog:teacherInput.available_scene_catalog,scene_reuse_instruction:'Keep a coherent textual world; if B selected a known scene for reuse, use those objects. Do not pretend an interactive renderer exists.'};
  const {output:xOutput,report:xCoverage}=normalizeVisualR50(await call('X',xInput,X_GOLD_PROMPT,X_GOLD_SCHEMA,o.modelX,4000),bOutput);turn.X={input:xInput,output:xOutput,alignment_verified:xCoverage.missing_beat_ids.length===0,coverage_report:xCoverage,normalization_note:'Raw paid X reply is preserved unchanged in calls; any explicit hold-scene placeholders are generated by host, not X'};const scene=makeSceneContract(state,o.turnId,topic,bOutput,xOutput);turn.scene_contract=scene;flush();
  if(packetState.semantic_index)state.semantic_index=packetState.semantic_index;
  state.observations.push(current);state.scene_contracts??=[];state.scene_contracts.push(scene);state.turns.push({runtime_patch_version:RUNTIME_VERSION,turn_id:o.turnId,topic_id:topic.id,topic_title:topic.title,learner_message:msg,teacher_response:turn.teacher_response,B_output:bOutput,X_output:xOutput,probe_plan:bOutput.probe_plan,scene_contract_id:scene.scene_id,scene_contract:scene,A_brief:a.output.learner_brief_for_B,evidence_id:current.id,visuals_rendered:false,probe_opportunity:{teaching_mode:bOutput.teaching_mode,offered_actions:bOutput.beats.map(b=>({beat_id:b.id,learner_action:b.learner_action})).filter(x=>x.learner_action),status:bOutput.probe_plan?.offer?'offered_not_observed_or_scored':'not_offered',structured_probe_plan:bOutput.probe_plan}});
  turn.status='complete';turn.completed_at=new Date().toISOString();turn.summary=traceSummary(turn);flush();
  // State write is only permitted after both structured model outputs and X alignment validate.
  write(r.stateFile,state);fs.renameSync(r.pending,r.complete);
  return {status:'complete',runtime_patch_version:RUNTIME_VERSION,memory_record_count:state.records.length,accepted_memory_changes:changes.length,session_id:o.sessionId,turn_id:o.turnId,topic:topic.title,estimated_usd:+spent.toFixed(8),retrieval_real_minilm:true,A_validation:true,B_beats:bOutput.beats.length,X_beats:xOutput.moments.length,X_coverage_report:xCoverage,trace:r.complete,state:r.stateFile,teacher_response:turn.teacher_response,storyboard:bOutput.beats.map((beat,i)=>({id:beat.id,narration:beat.narration,scene:xOutput.moments[i].scene_description,cues:xOutput.moments[i].cues})),no_real_renderer:true,probe_offered:bOutput.probe_plan?.offer??false,probe_modality:bOutput.probe_plan?.modality??'none',scene_id:scene.scene_id,scene_decision:scene.scene_reuse};
 }catch(e){if(turn.status!=='manual_review_required_unsafe_to_retry'&&turn.status!=='manual_review_required_unknown_cost')turn.status='manual_review_required_after_failure';turn.failure=String(e.stack??e.message);flush();throw Error(String(e.message)+'\nPaid-turn trace retained: '+r.pending+'\nDo NOT rerun this turn ID automatically.');}
}
export async function main(argv=process.argv.slice(2)){const o=parseArgs(argv);if(o.mode==='plan')return basePlan(o);if(o.mode==='preflight')return await preflight(o);if(o.mode==='retrieval-check')return await retrievalCheck(o);return await modelTurn(o);}
const thisModule=path.resolve(fileURLToPath(import.meta.url));if(process.argv[1]&&path.resolve(process.argv[1])===thisModule)main().then(v=>{console.log(JSON.stringify(v,null,2));}).catch(e=>{console.error(String(e.message));process.exitCode=1;});
