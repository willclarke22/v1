#!/usr/bin/env node
/** R4.2 isolated A/B/X/L learning research. No production imports or network except
 * explicitly authorized model calls and mandatory localhost semantic embeddings.
 * Synthetic L evidence is NOT a claim about human learning.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {A_SCHEMA,B_SCHEMA,L_SCHEMA,verifyAIsolated,applyA,learnerBrief} from './s62bfix1r2-core.mjs';
import {TRANSLATOR_SCHEMA,experienceContract} from './s62bfix1r2-experience.mjs';
import {compileExperience,executePhase,assertReplay} from './s62bfix1r42fix2-executor.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {learnerView,normalizeAttempt,memoryActionUsesFailedObservation} from './s62bfix1r3-evidence.mjs';
import {conversationObservation,evidenceR4,forAssessmentR4,fidelityReview} from './s62bfix1r4-quality.mjs';
import {promptForR41,PROMPT_SET_VERSION} from './s62bfix1r41-prompts.mjs';
import {TOPIC_BANK,TOPIC_IDS,LEARNERS,emptyState,topicById} from './s62bfix1r42-topics.mjs';
import {CHALLENGES,challengePacket} from './s62bfix1r42-challenges.mjs';
import {B_ONE_SCHEMA,L_ROUTE_SCHEMA,B_ONE_PROMPT,L_ROUTE_PROMPT,SYMBOLIC_CAPABILITIES,implementationInput,singleCallInput} from './s62bfix1r42-contracts.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const require=createRequire(import.meta.url);
export const STAGE='S62B-FIX1R4.2-FIX2';
export const LABEL='S62B-FIX1R42FIX2';
const clone=x=>structuredClone(x);
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(x);
const MODES=new Set(['plan','offline','model']);
const LABS=new Set(['journey','assessment','implementation','challenge','readiness','paired']);
const PATHWAYS=new Set(['b-only','b+x']);
const MODELS=new Set(['gpt-4.1-mini','gpt-4.1']);
export const DEFAULT={lab:'journey',mode:'plan',learner:'ATLAS',visits:2,pathway:'b+x',runId:'r42_plan',resumeFrom:null,sourceRun:null,cases:12,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelX:'gpt-4.1-mini',modelL:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on',recoverPartial:null,recoverFrom:null};
export function parseArgs(argv){const o={...DEFAULT};const map={'--lab':'lab','--mode':'mode','--learner':'learner','--visits':'visits','--pathway':'pathway','--run-id':'runId','--resume-from':'resumeFrom','--source-run':'sourceRun','--cases':'cases','--model-a':'modelA','--model-b':'modelB','--model-x':'modelX','--model-l':'modelL','--budget-usd':'budget','--second-retrieval':'secondRetrieval','--recover-partial':'recoverPartial','--recover-from':'recoverFrom'};
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--allow-spend'){o.allowSpend=true;continue;}if(!map[k]||!argv[i+1])throw Error('Unrecognized or missing argument '+k);const field=map[k],raw=argv[++i];o[field]=['visits','cases','budget'].includes(field)?Number(raw):raw;}
 if(!LABS.has(o.lab)||!MODES.has(o.mode)||!idOK(o.runId)||!LEARNERS[o.learner]||!PATHWAYS.has(o.pathway)||!Number.isInteger(o.visits)||o.visits<1||o.visits>10||!Number.isInteger(o.cases)||o.cases<1||o.cases>60||!['on','off'].includes(o.secondRetrieval)||[o.modelA,o.modelB,o.modelX,o.modelL].some(v=>!MODELS.has(v)))throw Error('Invalid R4.2 options');
 if(o.resumeFrom!==null&&(!idOK(o.resumeFrom)||o.resumeFrom===o.runId||!['journey','paired'].includes(o.lab)))throw Error('Resume only with a different completed RunId of the same lab');
 if(o.sourceRun!==null&&!idOK(o.sourceRun))throw Error('Invalid source RunId');
 if(o.recoverFrom!==null&&(!idOK(o.recoverFrom)||o.recoverFrom===o.runId||o.lab!=='paired'||o.resumeFrom!==null||o.sourceRun!==null||o.recoverPartial!==null))throw Error('RecoverFrom requires paired lab, unique incomplete source ID, and no simultaneous ResumeFrom');
 if(o.recoverPartial!==null&&(!idOK(o.recoverPartial)||o.lab!=='journey'||o.resumeFrom!==null||o.sourceRun!==null||o.recoverPartial===o.runId||o.visits!==1))throw Error('RecoverPartial requires Journey, exactly one missing A post, no ResumeFrom, a distinct source RunId');
 if(['assessment','implementation'].includes(o.lab)&&!o.sourceRun)throw Error('This lab requires --source-run of a completed R4.2 journey');
 if(o.mode==='model'&&(o.lab==='readiness'||!o.allowSpend||!Number.isFinite(o.budget)||o.budget<=0||o.budget>10))throw Error('Paid mode requires a model lab and explicit budget (0,10] and --allow-spend');
 if(o.mode!=='model'&&(o.allowSpend||o.budget!==null))throw Error('Free modes cannot use spending flags');
 return o;
}
export function labDir(lab,id){return path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2',lab==='readiness'?'readiness':lab+'s',id);}
export function plan(o){const count=o.lab==='journey'?o.visits:o.lab==='readiness'?0:o.cases;
 const admission=o.lab==='paired'?0.70*o.visits:o.lab==='journey'?0.35*o.visits:['assessment','challenge'].includes(o.lab)?0.08*o.cases:0.22*o.cases;
 return {stage:STAGE,mode:o.mode,lab:o.lab,run_id:o.runId,learner:o.learner,pathway:o.pathway,visits:o.visits,resume_from:o.resumeFrom,source_run:o.sourceRun,max_cases:o.cases,topic_bank_size:TOPIC_BANK.length,topic_route:'Model_L_selects_one_of_30_without_planned_outcome',preseeded_memory_records:0,recover_partial:o.recoverPartial,recover_from:o.recoverFrom,paired_rounds:o.lab==='paired'?o.visits:null,model_calls_bound_estimate:o.mode==='model'?(o.lab==='paired'?o.visits*45:o.lab==='journey'?o.visits*(o.pathway==='b-only'?13:14):o.lab==='implementation'?o.cases*3:o.cases):0,admission_estimate_usd:o.mode==='model'?+admission.toFixed(3):0,output_root:labDir(o.lab,o.runId),warnings:['Models are NOT scientifically evaluated automatically; independent transcript review required','Topic bank has no preassigned root causes, desired A decisions or cross-topic relationships','Model L is a fictional simulated learner; not proof of human comprehension','B-only is exactly ONE B call containing teaching, design and technical output; no X call or repair','B+X is ONE B design call followed by ONE X implementation call; no repair in matched comparison','Both architectures use identical symbolic execution capabilities, not rendered 2D/3D/audio','The architecture comparison holds starting learner context fixed but lets the two teacher arms choose different experiences','Assessment replays previously recorded evidence packets; no authored ideal decisions or automatic truth labels','Semantic retrieval requires local MiniLM; no lexical fallback','One-shot paid requests and estimated threshold are NOT provider-side billing caps','No DB or production writes']};}
function envKey(){if(process.env.OPENAI_API_KEY)return;const f=path.join(ROOT,'.env.local');if(fs.existsSync(f)){const env=require('dotenv').parse(fs.readFileSync(f));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}}
function responsePayload(role,input,model){let schema,prompt,max_tokens,name;
 if(role==='A'){schema=A_SCHEMA;prompt=promptForR41('A',input);max_tokens=2400;name='assessment';}
 if(role==='B'){schema=B_SCHEMA;prompt=promptForR41('B',input);max_tokens=1700;name='creative_teacher';}
 if(role==='X'){schema=TRANSLATOR_SCHEMA;prompt=promptForR41('X',input);max_tokens=1900;name='experience_builder';}
 if(role==='B_ONE'){schema=B_ONE_SCHEMA;prompt=B_ONE_PROMPT;max_tokens=3500;name='one_call_teacher_builder';}
 if(role==='L_ROUTE'){schema=L_ROUTE_SCHEMA;prompt=L_ROUTE_PROMPT;max_tokens=900;name='learner_topic_choice';}
 if(role==='L'){schema=L_SCHEMA;prompt=promptForR41('L',input);max_tokens=1000;name='learner_response';}
 if(!schema)throw Error('Unknown role: '+role);
 if(Buffer.byteLength(JSON.stringify(input))>34000)throw Error('Context too large for '+role+' (not truncated silently)');
 return {model,store:false,max_tokens,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'r42_'+name,strict:true,schema}}};
}
function pseudoVector(t){const s=sha(t);const out=Array.from({length:384},(_,i)=>((parseInt(s[(i*2)%62]+s[(i*2+1)%62],16)%128)-63)/64);return out;}
export async function injectedEmbeddings(texts){return texts.map(pseudoVector);}
function mockAnswer(role,input,call){
 const o={raw:'',usage:{prompt_tokens:210,completion_tokens:150}};
 if(role==='L_ROUTE'){
  const i=Number(input.visit)-1,bank=input.available_topics;const prior=input.learner_visible_history?.slice(-1)[0];
  const selected=i%5===4&&prior?prior.topic_id:bank[(i*7+(['ATLAS','JUNO','MICA'].indexOf(input.fictional_private_state.identity))*4)%bank.length].id;
  o.raw=JSON.stringify({topic_id:selected,learner_utterance:`I'm curious about ${topicById(selected)?.title??'this topic'}. Could we look at an example?`,selected_actions:[],request_hint:false,declines:false});
 } else if(role==='A'){
  o.raw=JSON.stringify({observed:{kind:'question',evidence_ids:[input.current.id],demonstrated:'Fictional learner asked or interacted; no understanding automatically established',untested_or_incorrect:'No independent assessment of comprehension',conditions:'Synthetic free test, not educational evidence'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:[],learner_brief_for_B:{current_understanding:'Not established',remaining_uncertainty:'Reasoning not yet observed',relevant_history:'Synthetic observations only',possible_shared_root:null,teaching_response_evidence:'No proved outcome'}});
 } else if(role==='B'||role==='B_ONE'){
  const b={teacher_response:'What do you notice first? We could explore a short example together.',experience_proposal:{modality:'text',setting:'A simple text-based exploration',learner_task:'Explain your idea in your own words',possible_actions:['type an explanation'],private_assessment_intent:'Guided exploration, no claim of independent mastery'}};
  o.raw=JSON.stringify(role==='B'?b:{...b,implementation:{status:'compiled',reason:'Text-only research controls',stages:[{instruction:b.experience_proposal.learner_task,visible_scene:b.experience_proposal.setting,controls:[{id:'answer',kind:'text',label:'Your explanation',choices:[],min:0,max:0}],feedback_on_submit:'Thanks for sharing your reasoning.',hint_text:'Take your time.',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}}});
 }else if(role==='X'){
  const b=input.creative;
  o.raw=JSON.stringify({status:'compiled',reason:'Text-only symbolic prototype',stages:[{instruction:b.experience_proposal.learner_task,visible_scene:b.experience_proposal.setting,controls:[{id:'answer',kind:'text',label:'Your explanation',choices:[],min:0,max:0}],feedback_on_submit:'Thanks for sharing your reasoning.',hint_text:'Take your time.',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}});
 }else if(role==='L'){
  if(input.conversation_reply_request)o.raw=JSON.stringify({learner_utterance:'That gives me something to consider; could we look at another example?',selected_actions:[],request_hint:false,declines:false});
  else o.raw=JSON.stringify({learner_utterance:'I think I see part of the idea but I want to test it.',selected_actions:(input.current_stage?.available_interactions||[]).slice(0,1).map(c=>({control:c.control_id,operation:c.canonical_operation,value:c.control_kind==='slider'?'2':c.control_kind==='select'?(input.current_stage.controls?.find(x=>x.id===c.control_id)?.choices?.[0]??''):c.control_kind==='move'?'0,0,0':c.control_kind==='rotate'?'0':c.control_kind==='play'?'play':'I would start with one simple case.'})),request_hint:false,declines:false});
 }
 return o;
}
function storeJSON(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});}
function preparePaid(o){const parent=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paid-attempts');fs.mkdirSync(parent,{recursive:true});fs.writeFileSync(path.join(parent,o.runId+'.json'),JSON.stringify({stage:STAGE,run_id:o.runId,lab:o.lab,one_shot:true,warning:'Provider side effects and cost may occur on transport failure; NEVER rerun same run ID'}),{flag:'wx',mode:0o600});}
export function makeCaller(o,report,dir,{invoke}={}){
 let context=null;if(o.mode==='model'&&!invoke){envKey();context=credentials();}
 return async(role,input,{record='model',index=0}={})=>{
  const model=role==='A'?o.modelA:role==='X'?o.modelX:role==='L'||role==='L_ROUTE'?o.modelL:o.modelB;
  const req=responsePayload(role,input,model);
  const entry={role,record,index,request_sha256:sha(req),request:req,status:'prepared'};
  report.requests.push(entry);storeJSON(path.join(dir,'TRACE.json'),report);
  if(o.mode==='model'&&report.known_estimated_usd>=o.budget)throw Error('Estimated spending threshold reached before provider call');
  const started_at=Date.now();let res;try{res=invoke?await invoke(role,clone(input),clone(req),record):o.mode==='offline'?mockAnswer(role,input,report.requests.length):await callProvider(req,context);}catch(e){entry.status='transport_unknown';storeJSON(path.join(dir,'TRACE.json'),report);throw Error('Uncertain model transport; do not auto-retry: '+String(e.message));}
  const raw=typeof res.raw==='string'?res.raw:JSON.stringify(res.raw??res);
  entry.duration_ms=Date.now()-started_at;
  entry.status='returned';entry.raw=raw;entry.response_sha256=sha(raw);
  if(o.mode==='model'){report.model_calls++;if(!res.usage)throw Error('Unknown provider usage, no retry');entry.usage=res.usage;const cost=estimateCost(res.usage,model);entry.estimated_usd=cost;report.known_estimated_usd=+(report.known_estimated_usd+cost).toFixed(9);if(report.known_estimated_usd>o.budget){storeJSON(path.join(dir,'TRACE.json'),report);throw Error('Estimated spending limit exceeded after call');}}
  storeJSON(path.join(dir,'TRACE.json'),report);
  let parsed;try{parsed=JSON.parse(raw);}catch(e){throw Error(role+' returned invalid JSON; raw preserved, no repair: '+String(e.message));}
  return {parsed,raw,request:req,usage:res.usage??null};
 };
}
function legacyJourneyDir(id){return path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42','journeys',id);}
function sourceJourney(runId){let dir=labDir('journey',runId);if(!fs.existsSync(path.join(dir,'STATE.json')))dir=legacyJourneyDir(runId);const tracePath=path.join(dir,'TRACE.json'),statePath=path.join(dir,'STATE.json');if(!fs.existsSync(tracePath)||!fs.existsSync(statePath))throw Error('Completed R4.2/FIX1 journey source unavailable: '+runId);
 const report=JSON.parse(fs.readFileSync(tracePath,'utf8')),snap=JSON.parse(fs.readFileSync(statePath,'utf8'));
 if(!['S62B-FIX1R4.2',STAGE].includes(report.stage)||report.lab!=='journey'||!report.complete||snap.schema!=='myway_r42_journey_state_v1'||sha(snap.state)!==snap.state_sha256||snap.run_id!==runId||snap.state.visit_count!==snap.completed_visits||snap.completed_visits!==report.completed_visits)throw Error('Source journey incomplete or integrity mismatch');return {dir,report,snap};
}
function stateSnapshot(o,state){return {schema:'myway_r42_journey_state_v1',stage:STAGE,run_id:o.runId,completed_visits:state.visit_count,state_sha256:sha(state),state};}
function newReport(o){return {stage:STAGE,lab:o.lab,run_id:o.runId,mode:o.mode,prompt_set:PROMPT_SET_VERSION,source_run:o.sourceRun??null,pathway:o.pathway,learner:o.learner,complete:false,failure:null,requests:[],known_estimated_usd:0,model_calls:0,entries:[],db_writes:0,scientific_scoring:false,synthetic_learner:true,auto_educational_quality_score:null};}
function initLab(o,prior={}){const dir=labDir(o.lab,o.runId);if(fs.existsSync(dir))throw Error('Run ID already exists (never overwrite): '+o.runId);if(o.mode==='model'){if(plan(o).admission_estimate_usd>o.budget)throw Error('Admission estimate exceeds authorized budget');preparePaid(o);}fs.mkdirSync(dir,{recursive:true});const report={...newReport(o),...prior};storeJSON(path.join(dir,'TRACE.json'),report);return {dir,report};}
/** No silent truncation: retain the current learner observation and complete activity evidence.
 * Only historical context is reduced, with IDs and changes disclosed to Model A.
 * Keep the full observations and raw requests in the research state and trace. */
export function packAssessmentInput(raw,packet,{targetBytes=30000}={}){
 const size=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 const before=size(raw);if(before<=targetBytes)return {input:raw,packet,packing:{changed:false,before_bytes:before,after_bytes:before}};
 const out=clone(raw),p={...packet,evidence:clone(packet.evidence),allowed_evidence_ids:[...packet.allowed_evidence_ids]};
 const original={evidence_ids:out.observations.map(x=>x.id),topics:out.available_topics.length,dialogue:out.recent_dialogue.length};
 let activityProjected=false,activityRawSha=null;
 if(out.activity_actual_evidence&&size(out.activity_actual_evidence)>6500){
  const a=out.activity_actual_evidence;activityRawSha=sha(a);activityProjected=true;
  out.activity_actual_evidence={
   representation:'verified_structural_projection_of_full_raw_activity',full_raw_activity_sha256:activityRawSha,
   source_preserved_in_research_trace:true,excluded_nonessential_source_fields:['duplicated raw_response when normalized_response exists','repeated action instance metadata','perceptual caveat repeated on each control','raw renderer descriptions beyond explicit scene labels'],
   schema:a.schema,activity_instance_id:a.activity_instance_id,design_id:a.design_id,
   requested_modality:a.requested_modality,delivered_modality:a.delivered_modality,real_2d_rendered:a.real_2d_rendered,real_3d_rendered:a.real_3d_rendered,real_audio_played:a.real_audio_played,
   original_educational_task:a.original_educational_task,
   presented:(a.presented??[]).map(p=>({phase:p.phase,instruction:p.instruction,visible_scene:p.visible_scene,available_interactions:(p.available_interactions??[]).map(c=>({control_id:c.control_id,description:c.description,control_kind:c.control_kind,value_format:c.value_format})),feedback_already_revealed:p.feedback_already_revealed,hint_revealed:p.hint_revealed})),
   learner_attempts:(a.learner_attempts??[]).map(at=>({phase:at.phase,learner_utterance:at.normalized_response?.learner_utterance??at.raw_response?.learner_utterance,selected_actions:at.normalized_response?.selected_actions??at.raw_response?.selected_actions,request_hint:at.normalized_response?.request_hint??at.raw_response?.request_hint,declines:at.normalized_response?.declines??at.raw_response?.declines,accepted:at.accepted,error:at.error,normalizations:at.normalizations})),
   executed_events:(a.executed_events??[]).map(e=>({seq:e.seq,phase:e.phase,type:e.type,control:e.control,operation:e.operation,value:e.value})),
   results:(a.results??[]).map(r=>({phase:r.phase,status:r.status,actions:r.actions,objective_check:r.objective_check,had_hint:r.had_hint})),
   feedback_delivered:a.feedback_delivered,technical_failure:a.technical_failure,observation_status:a.observation_status,limits:a.limits,
   teacher_response_presented_before_attempt:a.teacher_response_presented_before_attempt,cognitive_understanding_verified_by_runtime:a.cognitive_understanding_verified_by_runtime};
 }

 // Topic inventory is not evidence of the learner's understanding. Keep only encountered topics.
 const topicIds=new Set([out.current.topic_id,...out.observations.map(x=>x.topic_id),...out.memory_candidates.flatMap(m=>[m.topic_id,...(m.topic_ids??[])])]);
 out.available_topics=out.available_topics.filter(x=>topicIds.has(x.id));
 out.recent_dialogue=out.recent_dialogue.slice(-2);
 const protectedIds=new Set([out.current.id]);
 for(const m of out.memory_candidates){for(const id of [...(m.evidence_ids??[]),...(m.supporting_evidence_ids??[]),...(m.contradicting_evidence_ids??[])])protectedIds.add(id);}
 const suffix=()=>({kind:'bounded_context_with_full_current_evidence',budget_bytes:targetBytes,before_bytes:before,after_bytes:0,exact_current_observation_preserved:true,activity_actual_evidence_preserved:!activityProjected,activity_evidence_projected:activityProjected,full_activity_source_sha256:activityRawSha,original_evidence_ids:original.evidence_ids,retained_evidence_ids:out.observations.map(x=>x.id),omitted_evidence_ids:original.evidence_ids.filter(id=>!out.observations.some(e=>e.id===id)),topics_not_in_prompt:original.topics-out.available_topics.length,dialogue_turns_not_in_prompt:original.dialogue-out.recent_dialogue.length,note:'Omitted historical evidence is NOT available to cite. This may limit root-hypothesis comparison; ask for more history or express uncertainty. Full source evidence remains unchanged in saved history.'});
 let meta;
 function refresh(){
  const ids=new Set(out.observations.map(x=>x.id));ids.add(out.current.id);
  p.evidence=packet.evidence.filter(e=>ids.has(e.id));
  p.allowed_evidence_ids=packet.allowed_evidence_ids.filter(id=>ids.has(id));
  out.allowed_evidence_ids=p.allowed_evidence_ids;
  meta=suffix();out.coverage={...out.coverage,truncated:true,context_packing:meta};
  meta.after_bytes=size(out);
 }
 refresh();
 while(size(out)>targetBytes&&out.observations.length>1){
  // Historical retrieval is ranked: drop the lowest-ranked unprotected observation first.
  let idx=-1;for(let i=out.observations.length-1;i>=0;i--)if(!protectedIds.has(out.observations[i].id)){idx=i;break;}
  if(idx<0)break;
  out.observations.splice(idx,1);refresh();
 }
 if(size(out)>targetBytes)throw Error('Current A activity/protected evidence exceeds bounded context; no source evidence shortened or hidden');
 if(out.current.id!==raw.current.id||(!activityProjected&&JSON.stringify(out.activity_actual_evidence)!==JSON.stringify(raw.activity_actual_evidence)))throw Error('Current activity evidence changed during packing');
 meta.after_bytes=size(out);
 return {input:out,packet:p,packing:meta};
}

async function assessA(state,current,phase,o,call,embeddings){let packet=await retrieveR3(state,current,{method:'semantic',embedFn:embeddings});
 const makeInput=()=>{const normalized=forAssessmentR4(current);return {stage:phase,current:{...normalized,actual_activity:undefined},activity_actual_evidence:normalized.actual_activity??null,allowed_evidence_ids:packet.allowed_evidence_ids,observations:packet.evidence.map(x=>forAssessmentR4(x,{includeActivity:false})),memory_candidates:packet.memory_candidates,coverage:packet.coverage,available_topics:clone(state.topics),recent_dialogue:state.dialogue.slice(-3)};};
 let packed=packAssessmentInput(makeInput(),packet);packet=packed.packet;let input=packed.input,reply=await call('A',input,{record:`${phase}:A`,index:state.visit_count}),valid=verifyAIsolated(reply.raw,packet,state),requested=null;
 if(valid.output?.interpretation?.more_history_needed&&o.secondRetrieval==='on'){
  requested=valid.output.interpretation.more_history_needed;
  packet=await retrieveR3(state,current,{method:'semantic',cap:18,embedFn:embeddings,additionalQuery:requested});packed=packAssessmentInput({...makeInput(),focused_retrieval_question:requested},packet);packet=packed.packet;input=packed.input;reply=await call('A',input,{record:`${phase}:A_more_history`,index:state.visit_count});valid=verifyAIsolated(reply.raw,packet,state);
 }
 if(valid.output?.memory_decisions?.length){const invalid=valid.output.memory_decisions.filter(m=>memoryActionUsesFailedObservation(m,current));if(invalid.length){valid.rejected_memory_actions.push(...invalid.map(x=>({error:'Technical failure alone cannot prove a cognitive change',raw_action:x})));valid.output.memory_decisions=valid.output.memory_decisions.filter(m=>!invalid.includes(m));}}
 let changes=[],applyError=null;const before=clone(state.records);
 if(valid.assessment_valid&&valid.output)try{changes=applyA(state,valid.output,current.id);}catch(e){applyError=String(e.message)}
 return {valid:valid.assessment_valid,error:valid.error,raw:reply.raw,input,request:reply.request,output:valid.output,retrieval:packet,more_history_requested:requested,rejected_memory_actions:valid.rejected_memory_actions,proposed_memory_actions:valid.proposed_memory_actions,changes,apply_error:applyError,memory_before:before,memory_after:clone(state.records),context_packing:input.coverage?.context_packing??null};
}
function freshLHistory(state){return state.learner_visible_history.slice(-6).map(x=>({visit:x.visit,topic_id:x.topic_id,opening:String(x.opening).slice(0,450),teacher_response:String(x.teacher_response).slice(0,700),learner_response:String(x.learner_response).slice(0,500),activity_status:x.activity_status,feedback_exposed:(x.feedback_exposed??[]).slice(0,2)}));}
async function interact(state,entry,execution,b,call,o){if(!['text_executable','symbolic_simulation_not_rendered'].includes(execution.status)){
  const input={conversation_reply_request:true,fictional_private_state:LEARNERS[state.learner],learner_visible_teacher_response:b.teacher_response,visible_recent_dialogue:state.dialogue.slice(-4),actual_activity_available:false,reason:execution.status,hidden_model_A_memory_not_supplied:true};
  const response=await call('L',input,{record:'L:chat',index:state.visit_count});const l=response.parsed;
  if(typeof l.learner_utterance!=='string'||!l.learner_utterance.trim()||!Array.isArray(l.selected_actions)||l.selected_actions.length)throw Error('Conversation L response malformed');
  entry.l_response={input,raw:response.raw,output:l};
  return {obs:conversationObservation({id:`${state.learner}-${String(state.visit_count).padStart(3,'0')}-OUT`,topic_id:entry.topic_id,text:l.learner_utterance,teacher_response:b.teacher_response,activity_status:execution.status}),learner_response:l.learner_utterance,feedback:[],phases:[]};
 }
 const completed=[],presented=[],attempts=[],responses=[];let failure=null;
 for(let i=0;i<execution.stages.length;i++){
  let hint=null;
  for(let retry=0;retry<2;retry++){
   const view=learnerView(execution,i,{feedback:i?completed.at(-1)?.feedback:null,hint});presented.push(view);
   const input={fictional_private_state:LEARNERS[state.learner],learner_visible_teacher_response:b.teacher_response,current_stage:view,visible_recent_dialogue:state.dialogue.slice(-4),prior_visible_attempt_feedback:completed.slice(-2).map(x=>({result:x.result.status,feedback:x.feedback})),hidden_rubric_not_supplied:true};
   const rep=await call('L',input,{record:'L:activity',index:state.visit_count}),l=rep.parsed;
   try{
    const normal=normalizeAttempt(l,view),recorded=executePhase(execution,i,normal.normalized_response,completed.flatMap(x=>x.events));
    attempts.push({phase:i+1,raw_response:l,normalized_response:normal.normalized_response,normalizations:normal.normalizations,accepted:true});
    completed.push({...recorded,phase:i+1,view,model_l_input:input,model_l_request:rep.request,model_l_raw:rep.raw});responses.push({phase:i,response:normal.normalized_response});
    if(recorded.result.status==='hint_requested'){
     if(retry>0||!recorded.hint){failure={phase:i+1,error:'Hint absent or repeatedly requested; no answer inferred'};break;}
     hint=recorded.hint;continue;
    }
   }catch(e){failure={phase:i+1,error:String(e.message)};attempts.push({phase:i+1,raw_response:l,accepted:false,error:String(e.message)});}
   break;
  }
  if(failure||['declined','no_attempt','incomplete'].includes(completed.at(-1)?.result?.status))break;
 }
 if(!failure)assertReplay(execution,responses,{events:completed.flatMap(x=>x.events),completed:completed.map(({events,result,feedback,hint})=>({events,result,feedback,...(hint?{hint}:{})}))});
 const obs=evidenceR4(execution,completed,{learner_id:state.learner,topic_id:entry.topic_id,observation_id:`${state.learner}-${String(state.visit_count).padStart(3,'0')}-OUT`,presented,attempts,technicalFailure:failure,teacherResponse:b.teacher_response});
 entry.phases=completed;entry.attempts=attempts;entry.activity_failure=failure;
 return {obs,learner_response:attempts.map(x=>x.raw_response?.learner_utterance).filter(Boolean).join(' | '),feedback:completed.map(x=>x.feedback).filter(Boolean),phases:completed};
}
export async function journey(o,{invoke,embedFn}={}){
 const cfg={...DEFAULT,...o,lab:'journey'};if(cfg.mode==='plan')return {plan:plan(cfg)};
 const prior=cfg.resumeFrom?sourceJourney(cfg.resumeFrom):null;
 if(prior&&prior.report.learner!==cfg.learner)throw Error('Cannot resume a different learner');
 const state=prior?clone(prior.snap.state):emptyState(cfg.learner);
 if(state.visit_count+cfg.visits>30)throw Error('Journey maximum 30 visits per fictional learner');
 const {dir,report}=initLab(cfg,{lineage:prior?{previous_run_id:cfg.resumeFrom,previous_state_sha256:prior.snap.state_sha256,prior_visits:state.visit_count}:{resumed:false,prior_visits:0}});
 const call=makeCaller(cfg,report,dir,{invoke}),embed=embedFn??null;
 let phase='start';let currentEntry=null;
 try{
  for(let j=0;j<cfg.visits;j++){
   state.visit_count++;const visit=state.visit_count;
   phase='L:natural_topic_choice';
   const openingInput={opening_request:true,visit,fictional_private_state:LEARNERS[cfg.learner],available_topics:TOPIC_BANK,learner_visible_history:freshLHistory(state),hidden_model_A_memory_not_supplied:true,hidden_teacher_assessment_not_supplied:true};
   const opened=await call('L_ROUTE',openingInput,{record:'L:topic_choice',index:visit});const open=opened.parsed;
   if(!TOPIC_IDS.has(open.topic_id)||typeof open.learner_utterance!=='string'||!open.learner_utterance.trim()||open.learner_utterance.length>2400||!Array.isArray(open.selected_actions)||open.selected_actions.length)throw Error('L failed natural topic choice contract; no topic invented');
   const topic=topicById(open.topic_id),obs={id:`${cfg.learner}-${String(visit).padStart(3,'0')}-IN`,topic_id:topic.id,text:open.learner_utterance.trim(),kind:'fictional_learner_selected_topic_opening',conditions:{origin:'fictional_model_L_self_selected_topic_from_30',independent_performance:false,private_profile_not_exposed_to_A_or_B:true}};
   currentEntry={visit,topic_id:topic.id,topic_title:topic.title,domain:topic.domain,opening_input:openingInput,opening_request:opened.request,opening_raw:opened.raw,opening:open,route_source:'Model_L_selected_from_neutral_bank',memory_before:clone(state.records)};
   report.entries.push(currentEntry);state.observations.push(obs);storeJSON(path.join(dir,'TRACE.json'),report);
   phase='A:pre';currentEntry.pre_a=await assessA(state,obs,'pre',cfg,call,embed);
   const bInput={learner_request:obs.text,topic:topic.title,recent_visible_dialogue:state.dialogue.slice(-4).map(d=>({learner:d.learner,tutor:d.tutor})),learner_brief:learnerBrief(currentEntry.pre_a.output,state.records,currentEntry.pre_a.retrieval.memory_candidates.map(x=>x.id),topic.id)};
   currentEntry.creative_input=bInput;
   phase='B:design+implementation';let b,x,answer;
   if(cfg.pathway==='b-only'){
    const one=await call('B_ONE',singleCallInput(bInput),{record:'B:single_call',index:visit});answer=one.parsed;b={teacher_response:answer.teacher_response,experience_proposal:answer.experience_proposal};x=answer.implementation;
    currentEntry.b_only_request=one.request;currentEntry.b_only_raw=one.raw;
   }else{
    const teach=await call('B',bInput,{record:'B:design',index:visit});b=teach.parsed;currentEntry.b_request=teach.request;currentEntry.b_raw=teach.raw;
    if(b?.experience_proposal?.modality==='none')x={status:'not_called',reason:'B chose natural conversation',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
    else{phase='X:implementation';const impl=await call('X',implementationInput(b),{record:'X:build',index:visit});x=impl.parsed;currentEntry.x_request=impl.request;currentEntry.x_raw=impl.raw;}
   }
   if(typeof b?.teacher_response!=='string'||!b.teacher_response.trim()||!b.experience_proposal?.modality||!x?.status)throw Error('B or implementation output malformed');
   currentEntry.b_output=b;currentEntry.implementation=x;
   phase='compile';const execution=compileExperience(b,x,{instanceKey:`${cfg.runId}:${cfg.learner}:${visit}:${topic.id}`});currentEntry.execution=execution;
   currentEntry.fidelity=fidelityReview(b,x,execution);currentEntry.experience_contract=experienceContract(b,x,execution,{fidelityReview:'not_independently_assessed'});
   state.dialogue.push({episode:visit,learner:obs.text,tutor:b.teacher_response,topic_id:topic.id});
   phase='L:response';const returned=await interact(state,currentEntry,execution,b,call,cfg);
   state.observations.push(returned.obs);state.events.push(...(returned.obs.actual_activity?.executed_events??[]).map(e=>({...e,evidence_id:returned.obs.id})));
   state.learner_visible_history.push({visit,topic_id:topic.id,opening:obs.text,teacher_response:b.teacher_response,learner_response:returned.learner_response,activity_status:returned.obs.actual_activity?.observation_status??returned.obs.conditions?.observation_status,feedback_exposed:returned.feedback});
   currentEntry.observation=returned.obs;currentEntry.learner_response=returned.learner_response;
   phase='A:post';currentEntry.post_a=await assessA(state,returned.obs,'post',cfg,call,embed);currentEntry.memory_after=clone(state.records);
   report.completed_visits=state.visit_count;storeJSON(path.join(dir,'CHECKPOINT.json'),stateSnapshot(cfg,state));storeJSON(path.join(dir,'TRACE.json'),report);
  }
  report.complete=true;
 }catch(e){report.failure={phase,visit:currentEntry?.visit??null,message:String(e.stack??e).slice(0,1900),uncertain_provider_spend_possible:phase.startsWith('A:')||phase.startsWith('B:')||phase.startsWith('X:')||phase.startsWith('L:')};}
 report.summary={visits_this_run:report.entries.length,cumulative_visits:state.visit_count,topics_visited:[...new Set([...state.learner_visible_history.map(x=>x.topic_id)])],candidate_memory_records:state.records.length,semantic_index_provider:state.semantic_index?.provider??null,semantic_index_entries:Object.keys(state.semantic_index?.vectors??{}).length,completed_post_assessments:report.entries.filter(x=>x.post_a?.valid).length,execution_statuses:report.entries.map(x=>({visit:x.visit,status:x.execution?.status??null})),model_calls:report.model_calls,known_estimated_usd:report.known_estimated_usd,db_writes:0};
 if(report.complete)storeJSON(path.join(dir,'STATE.json'),stateSnapshot(cfg,state));storeJSON(path.join(dir,'TRACE.json'),report);
 writeReview(dir,report);return {report,dir};
}
/** Reconstruct legacy partial journey from its preserved trace, without replaying provider calls.
 * Only supported if the original stop was the local context guard BEFORE any A:post request.
 * Fail closed on any discontinuity in evidence, memory identity or model-return status. */
export function preparePartialRecovery(sourceId){
 const dir=fs.existsSync(path.join(legacyJourneyDir(sourceId),'TRACE.json'))?legacyJourneyDir(sourceId):labDir('journey',sourceId);
 const tPath=path.join(dir,'TRACE.json');if(!fs.existsSync(tPath))throw Error('Partial source trace missing');
 const original=JSON.parse(fs.readFileSync(tPath,'utf8'));
 if(original.complete!==false||original.lab!=='journey'||!['S62B-FIX1R4.2',STAGE].includes(original.stage)||original.failure?.phase!=='A:post'||!String(original.failure?.message).includes('Context too large for A'))throw Error('This recovery only supports local context-guard stops at A:post, with no provider uncertainty');
 if(original.requests.some(r=>r.status!=='returned'))throw Error('Uncertain or incomplete provider request found: no automatic recovery');
 const previousId=original.lineage?.previous_run_id;if(!previousId)throw Error('Partial source has no completed predecessor');
 const base=sourceJourney(previousId);
 if(original.lineage?.previous_state_sha256!==base.snap.state_sha256)throw Error('Partial source lineage state digest does not match completed base');
 const state=clone(base.snap.state),entries=original.entries;
 if(!entries.length||state.visit_count+entries.length!==original.summary?.cumulative_visits||entries.at(-1).post_a)throw Error('Unexpected partial visit layout');
 let previousComplete=true;
 for(const [i,e] of entries.entries()){
  if(e.visit!==state.visit_count+1||e.topic_id!==e.opening?.topic_id||e.memory_before===undefined)throw Error('Visit chronology or topic mismatch');
  if(sha(e.memory_before)!==sha(state.records))throw Error('Memory-before does not match predecessor');
  if(!e.pre_a?.valid||!e.pre_a.memory_after||!e.observation||!e.b_output||!e.execution||!e.learner_response)throw Error('Incomplete or invalid pre/post evidence at visit '+e.visit);
  if(!e.post_a&&i!==entries.length-1)throw Error('Earlier visit missing completed post assessment');
  // Fail closed if reconstruction would need unknown version increments or topic mutations.
  if((e.pre_a?.changes?.length??0)>0||(e.post_a?.changes?.length??0)>0)throw Error('Memory edits require a persisted checkpoint; cannot safely infer state version from trace');
  const open={id:`${original.learner}-${String(e.visit).padStart(3,'0')}-IN`,topic_id:e.topic_id,text:e.opening.learner_utterance.trim(),kind:'fictional_learner_selected_topic_opening',conditions:{origin:'fictional_model_L_self_selected_topic_from_30',independent_performance:false,private_profile_not_exposed_to_A_or_B:true}};
  state.visit_count=e.visit;state.observations.push(open);state.records=clone(e.pre_a.memory_after);
  state.dialogue.push({episode:e.visit,learner:open.text,tutor:e.b_output.teacher_response,topic_id:e.topic_id});
  if(e.observation.id!==`${original.learner}-${String(e.visit).padStart(3,'0')}-OUT`||e.observation.topic_id!==e.topic_id)throw Error('Post-activity evidence ID mismatch');
  state.observations.push(clone(e.observation));
  state.events.push(...(e.observation.actual_activity?.executed_events??[]).map(event=>({...clone(event),evidence_id:e.observation.id})));
  const feedback=(e.phases??[]).map(x=>x.feedback).filter(Boolean);
  state.learner_visible_history.push({visit:e.visit,topic_id:e.topic_id,opening:open.text,teacher_response:e.b_output.teacher_response,learner_response:e.learner_response,activity_status:e.observation.actual_activity?.observation_status??e.observation.conditions?.observation_status,feedback_exposed:feedback});
  if(e.post_a){if(!e.post_a.valid||sha(e.post_a.memory_before)!==sha(state.records))throw Error('Historical A post decision failed consistency check');state.records=clone(e.post_a.memory_after);}else previousComplete=false;
 }
 if(previousComplete||state.visit_count!==original.summary.cumulative_visits||original.completed_visits!==state.visit_count-1)throw Error('Expected exactly one pending final A post');
 const last=entries.at(-1),lastIndex=last.visit;
 if(original.requests.some(r=>r.role==='A'&&r.index===lastIndex&&String(r.record).startsWith('post:')))throw Error('Original final A post request exists; unsafe to repeat');
 return {original,source_trace_sha256:sha(fs.readFileSync(tPath)),base_run_id:previousId,base_state_sha256:base.snap.state_sha256,state,pending_entry:clone(last),entries:clone(entries),source_dir:dir};
}
export async function recoverPartialJourney(o,{invoke,embedFn}={}){
 const cfg={...DEFAULT,...o,lab:'journey',visits:1};const pre=preparePartialRecovery(cfg.recoverPartial);
 if(pre.original.learner!==cfg.learner||pre.original.pathway!==cfg.pathway)throw Error('Recovery learner or pathway mismatch');
 if(cfg.mode==='plan')return {plan:{...plan(cfg),recover_original_run:cfg.recoverPartial,original_preserved_model_calls:pre.original.model_calls,final_visit:pre.state.visit_count,paid_A_post_calls_expected:'1, possibly 2 only if targeted retrieval is enabled',source_trace_sha256:pre.source_trace_sha256}};
 const {dir,report}=initLab(cfg,{lineage:{recovered_from_partial:cfg.recoverPartial,source_trace_sha256:pre.source_trace_sha256,completed_base_run_id:pre.base_run_id,completed_base_state_sha256:pre.base_state_sha256},original_preserved_model_calls:pre.original.model_calls,original_preserved_known_estimated_usd:pre.original.known_estimated_usd,original_partial_failure:pre.original.failure,entries:pre.entries,completed_visits:pre.state.visit_count-1});
 const call=makeCaller(cfg,report,dir,{invoke});let state=pre.state;
 try{
  const e=report.entries.at(-1);e.post_a=await assessA(state,e.observation,'post',cfg,call,embedFn??null);
  if(!e.post_a.valid||e.post_a.apply_error)throw Error('Recovered Model A post assessment not valid, no resumable state promoted');
  e.memory_after=clone(state.records);report.completed_visits=state.visit_count;
  report.complete=true;
  storeJSON(path.join(dir,'STATE.json'),stateSnapshot(cfg,state));
  storeJSON(path.join(dir,'CHECKPOINT.json'),stateSnapshot(cfg,state));
 }catch(e){report.failure={phase:'recovery:A_post',message:String(e.stack??e).slice(0,1800),uncertain_provider_spend_possible:true};}
 report.summary={recovered_source_run:cfg.recoverPartial,cumulative_visits:state.visit_count,completed_post_assessments:report.entries.filter(x=>x.post_a?.valid).length,original_preserved_calls:pre.original.model_calls,new_provider_calls:report.model_calls,estimated_new_usd:report.known_estimated_usd,memory_records:state.records.length,semantic_index_entries:Object.keys(state.semantic_index?.vectors??{}).length,db_writes:0};
 storeJSON(path.join(dir,'TRACE.json'),report);writeReview(dir,report);return {dir,report};
}
function readSourceInputs(o,which){const src=sourceJourney(o.sourceRun);const entries=src.report.entries;
 const requests=which==='assessment'?entries.flatMap(e=>[e.pre_a?.request,e.post_a?.request].filter(Boolean)):entries.map(e=>e.creative_input).filter(Boolean);
 return {source:src,items:requests.slice(0,o.cases)};
}
function emptyAssessmentReview(e){return {kind:e?.observed?.kind??null,observed_evidence_ids:e?.observed?.evidence_ids??[],interpretation_hypotheses:e?.interpretation?.hypotheses??[],uncertainty:e?.interpretation?.uncertainty??null,proposed_memory_actions:e?.memory_decisions??[],note:'Descriptive only, NOT correctness scoring'};}
export async function assessment(o,{invoke}={}){
 const cfg={...DEFAULT,...o,lab:'assessment'};if(cfg.mode==='plan')return {plan:plan(cfg)};
 const {source,items}=readSourceInputs(cfg,'assessment');if(!items.length)throw Error('No recorded A inputs in completed source journey');
 const {dir,report}=initLab(cfg,{source_trace_sha256:sha(fs.readFileSync(path.join(source.dir,'TRACE.json'))),source_visit_count:source.report.completed_visits??null});const call=makeCaller(cfg,report,dir,{invoke});
 try{
  for(const [i,req] of items.entries()){
   const input=JSON.parse(req.messages[1].content);const out=await call('A',input,{record:'A:evidence_replay',index:i+1});
   const validIds=new Set(input.allowed_evidence_ids);const cited=out.parsed?.observed?.evidence_ids??[];
   report.entries.push({index:i+1,source_input_sha256:sha(req.messages[1].content),source_request_sha256:sha(req),model_response:out.parsed,response_raw:out.raw,evidence_citations_in_supplied_ids:Array.isArray(cited)&&cited.every(x=>validIds.has(x)),descriptive:emptyAssessmentReview(out.parsed),note:'Replay uses original source evidence and prior memory snapshot. No output is applied to real or fictional memory.'});
   storeJSON(path.join(dir,'TRACE.json'),report);
  }
  report.complete=true;
 }catch(e){report.failure=String(e.stack??e).slice(0,1900)}
 storeJSON(path.join(dir,'TRACE.json'),report);writeReview(dir,report);return {report,dir};
}
export async function implementation(o,{invoke}={}){
 const cfg={...DEFAULT,...o,lab:'implementation'};if(cfg.mode==='plan')return {plan:plan(cfg)};
 const {source,items}=readSourceInputs(cfg,'implementation');if(!items.length)throw Error('Source has no B inputs');
 const {dir,report}=initLab(cfg,{source_trace_sha256:sha(fs.readFileSync(path.join(source.dir,'TRACE.json'))),comparison_protocol:'paired_same_starting_B_input_independent_design_one_call_B_vs_two_call_B_X'});const call=makeCaller(cfg,report,dir,{invoke});
 try{
  for(const [i,bInput] of items.entries()){
   const entry={index:i+1,source_input_sha256:sha(bInput),b_input:bInput,arms:[]};report.entries.push(entry);storeJSON(path.join(dir,'TRACE.json'),report);
   for(const arm of ['b-only','b+x']){
    const requestStart=report.requests.length;let b,x;
    const armResult={arm,call_count_expected:arm==='b-only'?1:2};entry.arms.push(armResult);
    if(arm==='b-only'){
     const one=await call('B_ONE',singleCallInput(bInput),{record:'B-only:one_call',index:i+1});b={teacher_response:one.parsed.teacher_response,experience_proposal:one.parsed.experience_proposal};x=one.parsed.implementation;armResult.teacher_raw=one.raw;armResult.teacher_request=one.request;
    }else{
     const creative=await call('B',bInput,{record:'B+X:B_call',index:i+1});b=creative.parsed;armResult.teacher_raw=creative.raw;armResult.teacher_request=creative.request;
     if(b?.experience_proposal?.modality==='none')x={status:'not_called',reason:'B chose conversation',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
     else{const technical=await call('X',implementationInput(b),{record:'B+X:X_call',index:i+1});x=technical.parsed;armResult.technical_raw=technical.raw;armResult.technical_request=technical.request;}
    }
    armResult.creative=b;armResult.implementation=x;
    try{const exec=compileExperience(b,x,{instanceKey:`${cfg.runId}:${i+1}:${arm}`});armResult.execution={status:exec.status,requested_modality:exec.requested_modality,delivered_modality:exec.delivered_modality,limitations:exec.fidelity,stage_count:exec.stages?.length??0};armResult.fidelity_review=fidelityReview(b,x,exec);armResult.contract=experienceContract(b,x,exec,{fidelityReview:'not_independently_assessed'});}catch(e){armResult.execution={status:'validation_error',error:String(e.message)}}
    const actualCalls=report.requests.slice(requestStart);
    armResult.model_calls=actualCalls.length;
    armResult.estimated_usd=+actualCalls.reduce((sum,x)=>sum+(x.estimated_usd??0),0).toFixed(9);
    armResult.elapsed_model_ms=actualCalls.reduce((sum,x)=>sum+(x.duration_ms??0),0);
    storeJSON(path.join(dir,'TRACE.json'),report);
   }
  }
  report.complete=true;
 }catch(e){report.failure=String(e.stack??e).slice(0,2000)}
 report.summary={comparisons:report.entries.length,model_calls:report.model_calls,estimated_usd:report.known_estimated_usd,one_call_B_calls:report.requests.filter(r=>r.role==='B_ONE').length,B_X_B_calls:report.requests.filter(r=>r.role==='B').length,B_X_X_calls:report.requests.filter(r=>r.role==='X').length};
 storeJSON(path.join(dir,'TRACE.json'),report);writeReview(dir,report);return {report,dir};
}
export async function challenge(o,{invoke}={}){
 const cfg={...DEFAULT,...o,lab:'challenge'};if(cfg.mode==='plan')return {plan:plan(cfg)};
 const items=CHALLENGES.slice(0,cfg.cases);const {dir,report}=initLab(cfg,{challenge_bank_size:CHALLENGES.length,source:'separate_authored_capability_conditions_not_naturalistic_topic_journey'});const call=makeCaller(cfg,report,dir,{invoke});
 try{
  for(const [index,item] of items.entries()){
   const {packet,input,state}=challengePacket(item);const out=await call('A',input,{record:'A:independent_challenge',index:index+1});const valid=verifyAIsolated(out.raw,packet,state);
   report.entries.push({id:item.id,name:item.name,conditions:packet.evidence,original_input:input,source_input_sha256:sha(input),response_raw:out.raw,response:valid.output,assessment_valid:valid.assessment_valid,validation_error:valid.error,rejected_optional_memory_actions:valid.rejected_memory_actions,proposed_memory_actions:valid.proposed_memory_actions,note:'No expected decision label or automatically graded cognitive truth'});
   storeJSON(path.join(dir,'TRACE.json'),report);
  }
  report.complete=true;
 }catch(e){report.failure=String(e.stack??e).slice(0,1900)}
 storeJSON(path.join(dir,'TRACE.json'),report);writeReview(dir,report);return {report,dir};
}
export function readiness(o){const cfg={...DEFAULT,...o,lab:'readiness',mode:'offline'};const folder=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42');const runs=[];
 for(const lab of ['journey','assessment','implementation','challenge']){
  const d=path.join(folder,lab+'s');if(!fs.existsSync(d))continue;
  for(const name of fs.readdirSync(d))try{const report=JSON.parse(fs.readFileSync(path.join(d,name,'TRACE.json'),'utf8'));runs.push({lab,run_id:report.run_id,complete:report.complete,learner:report.learner,pathway:report.pathway,entries:report.entries?.length??0,model_calls:report.model_calls,estimated_usd:report.known_estimated_usd,fail_phase:report.failure?.phase??null});}catch{}
 }
 const learnerTotals={},topicSet=new Set();let paired=0,assessmentCases=0,challengeCases=0,technicalStops=0;
 for(const r of runs){if(!r.complete){technicalStops++;continue}if(r.lab==='journey'){learnerTotals[r.learner]=(learnerTotals[r.learner]??0)+r.entries;try{const t=JSON.parse(fs.readFileSync(path.join(folder,'journeys',r.run_id,'TRACE.json'),'utf8'));for(const e of t.entries??[])if(e.topic_id)topicSet.add(e.topic_id);}catch{}}if(r.lab==='implementation')paired+=r.entries;if(r.lab==='assessment')assessmentCases+=r.entries;if(r.lab==='challenge')challengeCases+=r.entries;}
 const coverage={learner_visit_counts:learnerTotals,unique_topics_visited:topicSet.size,available_topics:TOPIC_BANK.length,paired_architecture_contexts:paired,recorded_A_replays:assessmentCases,independent_challenge_cases:challengeCases,incomplete_or_failed_runs:technicalStops,notes:['Not all 30 topics must be visited','Counts are NOT educational quality scores','Resume runs count incremental visits; do not read them as independent participants']};
 const {dir,report}=initLab(cfg,{runs,coverage,decision:'UNDETERMINED_REQUIRES_INDEPENDENT_HUMAN_REVIEW',unmeasured:['human learning','real visual usability','causal correctness','general reliability of stronger models']});report.complete=true;storeJSON(path.join(dir,'TRACE.json'),report);writeReview(dir,report);return {dir,report};
}
export function writeReview(dir,report){const lines=[`# R4.2 ${report.lab} — ${report.run_id}`,`Complete: ${report.complete}`,`Mode: ${report.mode}`,`Records in this report: ${report.entries.length}`,`Model calls: ${report.model_calls}; estimated USD: ${report.known_estimated_usd}`,`Failure: ${report.failure?JSON.stringify(report.failure):'none'}`,'', '**Educational/architectural readiness is NOT automatically scored.**',''];
 if(report.lineage?.recovered_from_partial)lines.push('RECOVERY: original model calls were preserved in immutable source report; this new run performed only the missing A post assessment. Compare source_trace_sha256 and source run before using the new state.');
 if(report.lab==='paired')lines.push('PAIRED: 20 visits per arm across resumable 5-round blocks. Initial route shared; later topic choice and A/B/L experiences branch independently. B-only exactly one combined call; B+X one B and one X call except conversation-only. No predetermined shared roots. Failures/omissions/technical corrections are reported, not graded as cognitive truth.');
 if(report.lab==='journey')lines.push('Review A observations versus hypotheses, evidence citations, unsupported updates and corrections. Review B adaptations to prior learner experiences. Verify L received no hidden A memory. Different topics do not prove shared roots. Mark missing capabilities as NOT TESTED, not PASS.');
 if(report.lab==='challenge')lines.push('These authored, clearly flagged challenge packets exercise evidence conditions separately from natural learner journeys; there are deliberately NO expected memory actions, ideal root hypotheses, or automatic pass labels. Review plausible alternative interpretations.');
 if(report.lab==='assessment')lines.push('For each source packet: decide whether memory update is warranted, unsupported, missing, or debatable. No authored target classification or exact-answer labels exist. Compare independently to previous source response if needed.');
 if(report.lab==='implementation')lines.push('B-only is ONE creative+technical call. B+X is ONE B design call plus ONE X technical call, unless B elects no activity. Both get identical B learner context, independent creative choices and identical symbolic capabilities. Evaluate task fidelity, execution, teaching value, cost and latency with a reviewer. Neither approach can prove real 2D/3D/audio quality.');
 if(report.lab==='readiness')lines.push(`Coverage snapshot (NOT an educational score): ${JSON.stringify(report.coverage??{})}`,'',
 '## Architecture review sign-off (human review required)',
 '- [ ] Zero serious uncorrected evidence-provenance, unauthorized write, or state-integrity failures',
 '- [ ] Model A: consequential memory actions and explanatory hypotheses supported across diverse observed evidence; mistaken hypotheses can be corrected',
 '- [ ] Model B: adaptive natural teaching and appropriate optional opportunities for reasoning, without forcing assessments',
 '- [ ] B-only versus B+X: paired contexts reviewed for meaningful task fidelity, executable interaction, latency, calls, cost, and failure modes',
 '- [ ] Multi-learner longitudinal runs reviewed for semantic counterevidence retrieval, natural revisits, uncertainty, and evidence-grounded shared-root candidates (if any)',
 '- [ ] Hard cases repeated on a stronger model to distinguish model-capability limits from missing evidence or schema/runtime limitations',
 '- [ ] Remaining failure modes are documented with ownership and an acceptable research/production boundary',
 '', 'Readiness cannot be marked PASS by this report generator. Human reviewer must decide whether the available corpus is sufficient; absent capabilities remain NOT TESTED.');
 lines.push('','## Evidence/provenance notes','- Private fictional learner profiles are NOT A/B prompts.','- No pre-seeded cognitive roots or shared relationships in naturalistic journeys.','- Prompt outputs may be fallible; no expected memory labels or fixed topic transitions.','- Auto execution status does NOT establish comprehension or quality.','- This is an isolated research simulation; no production DB writes.');
 fs.writeFileSync(path.join(dir,'REVIEW.md'),lines.join('\n')+'\n',{mode:0o600});
}
/** Paired longitudinal evaluation. The two arms have identical fictional profiles and the
 * same FIRST natural learner opening, then completely separate learner-visible histories,
 * semantic indexes, evidence and provisional memory. No forced topic or memory outcomes.
 * Paid calls are recorded BEFORE dispatch and returned raw responses are saved BEFORE parse.
 */
const PAIRED_SCHEMA='myway_r42fix2_paired_state_v1';
const PAIRED_ARMS=['b-only','b+x'];
const COMPLETE_MAX=20;
function pairedSnapshot(o,s){return {schema:PAIRED_SCHEMA,stage:STAGE,run_id:o.runId,completed_rounds:s.round_count,state_sha256:sha(s),state:s};}
function pairedTraceDir(id){return labDir('paired',id);}
function loadPairedCompleted(id){
 const dir=pairedTraceDir(id),tf=path.join(dir,'TRACE.json'),sf=path.join(dir,'STATE.json');
 if(!fs.existsSync(tf)||!fs.existsSync(sf))throw Error('Missing completed FIX2 paired source '+id);
 const t=JSON.parse(fs.readFileSync(tf,'utf8')),p=JSON.parse(fs.readFileSync(sf,'utf8'));
 if(t.stage!==STAGE||t.lab!=='paired'||t.run_id!==id||!t.complete||p.schema!==PAIRED_SCHEMA||p.stage!==STAGE||p.run_id!==id||p.state_sha256!==sha(p.state)||p.completed_rounds!==p.state.round_count||t.completed_rounds!==p.completed_rounds)throw Error('Invalid completed paired-source lineage');
 for(const arm of PAIRED_ARMS)if(p.state.branches[arm].visit_count!==p.state.round_count)throw Error('Paired arm visit count mismatch');
 return {dir,trace:t,snap:p};
}
export function preparePairedRecovery(id){
 const dir=pairedTraceDir(id),tp=path.join(dir,'TRACE.json');
 if(!fs.existsSync(tp))throw Error('Missing partial paired trace '+id);
 const t=JSON.parse(fs.readFileSync(tp,'utf8'));
 if(t.stage!==STAGE||t.lab!=='paired'||t.complete!==false||t.run_id!==id||!t.failure)throw Error('Not an incomplete FIX2 paired journey');
 // If a provider request may have reached the provider but its result was not stored,
 // replay cannot safely deduce the result. Stop rather than charging twice.
 if(t.requests.some(r=>r.status!=='returned'&&r.status!=='replayed_returned'))throw Error('Uncertain provider or incomplete request; fail closed. Preserve original trace.');
 const cp=path.join(dir,'CHECKPOINT.json'),sp=path.join(dir,'START_STATE.json');
 const f=fs.existsSync(cp)?cp:sp;
 if(!fs.existsSync(f))throw Error('No paired checkpoint for recovery');
 const snap=JSON.parse(fs.readFileSync(f,'utf8'));
 if(snap.schema!==PAIRED_SCHEMA||snap.stage!==STAGE||snap.state_sha256!==sha(snap.state)||snap.state.round_count!==snap.completed_rounds||snap.run_id!==id)throw Error('Partial checkpoint integrity failure');
 const sourceRaw=fs.readFileSync(tp,'utf8'),start=snap.completed_rounds+1;
 const calls=t.requests.filter(r=>r.round>=start);
 if(calls.length===0)throw Error('No completed provider outputs to recover; continue from last completed checkpoint using a new study run');
 if(calls.some(r=>r.status==='replayed_returned'&&!r.response_sha256))throw Error('Unverifiable source replay response');
 if(calls.some(r=>r.status==='returned'&&!r.response_sha256))throw Error('Unverifiable source provider response');
 if(t.entries.some(e=>e.round<start&&(!e.completed||!PAIRED_ARMS.every(a=>e.arms?.[a]?.post_a?.valid))))throw Error('Completed source rounds unexpectedly incomplete');
 if(t.execution_key===undefined)throw Error('Source lacks stable execution identity');
 return {dir,trace:t,start_state:clone(snap.state),start_round:start,calls,trace_sha256:sha(sourceRaw),execution_key:t.execution_key,completed_rounds:snap.completed_rounds};
}
const SYMBOLIC_FIX2_CONTRACT={adapter:'research_symbolic_extended_v2',stage_limit:8,total_control_limit:48,controls_per_stage:10,observation_only_stage_allowed:true,observation_only_evidence:'learner may respond verbally without a made-up control; not independently verified',next_stage_navigation:'intermediate=true; final=false; purely mechanical flags normalized after generation and disclosed',possible_controls:['text','select','slider','move','rotate','play'],real_2d_3d_audio_rendering:false,reasoning_not_measured_by_execution:true};
function singleCallInputFix2(b){return {...singleCallInput(b),symbolic_contract:SYMBOLIC_FIX2_CONTRACT};}
function implementationInputFix2(b){return {...implementationInput(b),symbolic_contract:SYMBOLIC_FIX2_CONTRACT};}
function pairedNewState(learner){return {learner,round_count:0,branches:{'b-only':emptyState(learner),'b+x':emptyState(learner)},initial_context:{topics_sha256:sha(TOPIC_BANK),private_profile_sha256:sha(LEARNERS[learner]),initial_memory_records:0},pathways:[...PAIRED_ARMS]};}
function pairedStartOptions(o){
 if(o.resumeFrom){const prev=loadPairedCompleted(o.resumeFrom);if(prev.snap.state.learner!==o.learner)throw Error('Cannot resume with a different learner');return {state:clone(prev.snap.state),lineage:{previous_run_id:o.resumeFrom,previous_state_sha256:prev.snap.state_sha256},recovery:null,execution_key:o.runId};}
 if(o.recoverFrom){const p=preparePairedRecovery(o.recoverFrom);if(p.start_state.learner!==o.learner)throw Error('Cannot recover a different learner');return {state:p.start_state,lineage:{recovered_from:o.recoverFrom,source_trace_sha256:p.trace_sha256,source_rounds_completed:p.completed_rounds,source_checkpoint_sha256:sha(p.start_state)},recovery:p,execution_key:p.execution_key};}
 return {state:pairedNewState(o.learner),lineage:{resumed:false,initial_shared_opening:true},recovery:null,execution_key:o.runId};
}
function pairedCaller(o,report,dir,runState,{invoke,sourceCalls=[]}={}){
 let context=null;if(o.mode==='model'&&!invoke){envKey();context=credentials();}
 let cursor=0;
 return async(role,input,{record='model',index=0,arm='shared',round=0}={})=>{
  const model=role==='A'?o.modelA:role==='X'?o.modelX:role==='L'||role==='L_ROUTE'?o.modelL:o.modelB;
  const req=responsePayload(role,input,model),reqHash=sha(req);
  const entry={role,record,index,arm,round,request_sha256:reqHash,request:req,status:'prepared'};
  report.requests.push(entry);storeJSON(path.join(dir,'TRACE.json'),report);
  let result;
  if(cursor<sourceCalls.length){
   const prev=sourceCalls[cursor++];
   if(prev.role!==role||prev.arm!==arm||prev.round!==round||prev.request_sha256!==reqHash||prev.response_sha256!==sha(prev.raw))throw Error('Replayed call does not match recorded original request: STOP, no new API call');
   result={raw:prev.raw,usage:prev.usage??null};entry.status='replayed_returned';entry.replay_source_request_sha256=prev.request_sha256;entry.replay_source_response_sha256=prev.response_sha256;entry.response_sha256=prev.response_sha256;entry.raw=prev.raw;entry.usage=prev.usage??null;
   report.replayed_calls=(report.replayed_calls??0)+1;
  }else{
   if(o.mode==='model'&&report.known_estimated_usd>=o.budget)throw Error('Paid threshold reached; no new provider call');
   const started=Date.now();
   try{result=invoke?await invoke(role,clone(input),clone(req),record):o.mode==='offline'?mockAnswer(role,input,report.requests.length):await callProvider(req,context);}
   catch(e){entry.status='transport_unknown';entry.message=String(e.message??e).slice(0,600);storeJSON(path.join(dir,'TRACE.json'),report);throw Error('Uncertain provider transport. Do not automatically repeat: '+entry.message);}
   const raw=typeof result.raw==='string'?result.raw:JSON.stringify(result.raw??result);
   entry.status='returned';entry.raw=raw;entry.response_sha256=sha(raw);entry.duration_ms=Date.now()-started;
   if(o.mode==='model'){
    report.model_calls++;
    if(!result.usage){storeJSON(path.join(dir,'TRACE.json'),report);throw Error('Provider usage unknown, preserve output and stop');}
    entry.usage=result.usage;const cost=estimateCost(result.usage,model);entry.estimated_usd=cost;report.known_estimated_usd=+(report.known_estimated_usd+cost).toFixed(9);
    if(report.known_estimated_usd>o.budget){storeJSON(path.join(dir,'TRACE.json'),report);throw Error('Estimated spend exceeded threshold after return; no retry');}
   }
   result={...result,raw};
  }
  storeJSON(path.join(dir,'TRACE.json'),report);
  let parsed;try{parsed=JSON.parse(result.raw)}catch(e){throw Error('Malformed '+role+' JSON response preserved; no repair provider call: '+String(e.message));}
  return {parsed,raw:result.raw,request:req,usage:result.usage??null};
 };
}
async function pairedArmVisit(o,state,round,arm,entry,call,embed,executionKey,openingOverride=null){
 state.visit_count++;const visit=state.visit_count;if(visit!==round)throw Error('Paired visit/round discontinuity');
 let step='L:topic_choice';entry.step=step;
 const openInput={opening_request:true,visit,fictional_private_state:LEARNERS[o.learner],available_topics:TOPIC_BANK,learner_visible_history:freshLHistory(state),hidden_model_A_memory_not_supplied:true,hidden_teacher_assessment_not_supplied:true};
 let open,opened=null;
 if(openingOverride){open=clone(openingOverride);entry.opening_shared_from_first_route=true;}
 else {opened=await call('L_ROUTE',openInput,{record:'L:topic_choice',index:visit,round,arm});open=opened.parsed;}
 if(!TOPIC_IDS.has(open?.topic_id)||typeof open?.learner_utterance!=='string'||!open.learner_utterance.trim()||open.learner_utterance.length>2400||!Array.isArray(open.selected_actions)||open.selected_actions.length||open.request_hint!==false||open.declines!==false)throw Error('L topic choice contract violated');
 const topic=topicById(open.topic_id);
 const obs={id:`${o.learner}-${String(visit).padStart(3,'0')}-IN`,topic_id:topic.id,text:open.learner_utterance.trim(),kind:'fictional_learner_selected_topic_opening',conditions:{origin:'fictional_model_L_self_selected_topic_from_30',independent_performance:false,private_profile_not_exposed_to_A_or_B:true}};
 Object.assign(entry,{visit,arm,topic_id:topic.id,topic_title:topic.title,domain:topic.domain,opening_input:openInput,opening_request:opened?.request??null,opening_raw:opened?.raw??null,opening:open,route_source:openingOverride?'shared_first_model_L_route':'independent_branch_model_L_route',memory_before:clone(state.records)});
 state.observations.push(obs);
 entry.step='A:pre';entry.pre_a=await assessA(state,obs,'pre',o,(role,input,meta)=>call(role,input,{...meta,arm,round}),embed);
 if(!entry.pre_a.valid||entry.pre_a.apply_error)throw Error('Invalid Model A pre assessment: preserve trace, no fabricated learner brief');
 const bInput={learner_request:obs.text,topic:topic.title,recent_visible_dialogue:state.dialogue.slice(-4).map(d=>({learner:d.learner,tutor:d.tutor})),learner_brief:learnerBrief(entry.pre_a.output,state.records,entry.pre_a.retrieval.memory_candidates.map(x=>x.id),topic.id)};
 entry.creative_input=bInput;
 let b,x;
 if(arm==='b-only'){
  entry.step='B:single_call';const one=await call('B_ONE',singleCallInputFix2(bInput),{record:'B:single_call',index:visit,round,arm});
  b={teacher_response:one.parsed.teacher_response,experience_proposal:one.parsed.experience_proposal};x=one.parsed.implementation;
  entry.b_only_request=one.request;entry.b_only_raw=one.raw;
 }else{
  entry.step='B:creative';const teach=await call('B',bInput,{record:'B:design',index:visit,round,arm});b=teach.parsed;entry.b_request=teach.request;entry.b_raw=teach.raw;
  if(b?.experience_proposal?.modality==='none')x={status:'not_called',reason:'B chose natural conversation',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
  else {entry.step='X:implementation';const builder=await call('X',implementationInputFix2(b),{record:'X:build',index:visit,round,arm});x=builder.parsed;entry.x_request=builder.request;entry.x_raw=builder.raw;}
 }
 if(typeof b?.teacher_response!=='string'||!b.teacher_response.trim()||!b.experience_proposal?.modality||!x?.status)throw Error('B or implementation malformed');
 entry.b_output=b;entry.implementation=x;
 entry.step='compile';const execution=compileExperience(b,x,{instanceKey:`${executionKey}:${arm}:${o.learner}:${visit}:${topic.id}`});
 entry.execution=execution;entry.mechanical_navigation_corrections=execution.mechanical_navigation_corrections??[];
 entry.fidelity=fidelityReview(b,x,execution);entry.experience_contract=experienceContract(b,x,execution,{fidelityReview:'not_independently_assessed'});
 state.dialogue.push({episode:visit,learner:obs.text,tutor:b.teacher_response,topic_id:topic.id});
 entry.step='L:interaction';const returned=await interact(state,entry,execution,b,(role,input,meta)=>call(role,input,{...meta,arm,round}),o);
 state.observations.push(returned.obs);state.events.push(...(returned.obs.actual_activity?.executed_events??[]).map(e=>({...e,evidence_id:returned.obs.id})));
 state.learner_visible_history.push({visit,topic_id:topic.id,opening:obs.text,teacher_response:b.teacher_response,learner_response:returned.learner_response,activity_status:returned.obs.actual_activity?.observation_status??returned.obs.conditions?.observation_status,feedback_exposed:returned.feedback});
 entry.observation=returned.obs;entry.learner_response=returned.learner_response;
 entry.step='A:post';entry.post_a=await assessA(state,returned.obs,'post',o,(role,input,meta)=>call(role,input,{...meta,arm,round}),embed);
 if(!entry.post_a.valid||entry.post_a.apply_error)throw Error('Invalid Model A post assessment, not counted as completed');
 entry.memory_after=clone(state.records);entry.completed=true;entry.step='completed';
 return entry;
}
function summarizePaired(report,state){
 const arms={};
 for(const arm of PAIRED_ARMS){const s=state.branches[arm],entries=report.entries.map(e=>e.arms?.[arm]).filter(Boolean);
  arms[arm]={cumulative_visits:s.visit_count,distinct_topics:[...new Set(s.learner_visible_history.map(e=>e.topic_id))],memory_records:s.records.length,observations:s.observations.length,events:s.events.length,semantic_index_entries:Object.keys(s.semantic_index?.vectors??{}).length,complete_visits_in_block:entries.filter(e=>e.completed).length,execution_statuses:entries.map(e=>({round:e.visit,status:e.execution?.status??'not_reached',mechanical_corrections:e.mechanical_navigation_corrections?.length??0})),calls_in_block:report.requests.filter(r=>r.arm===arm&&r.status==='returned').length,replayed_calls_in_block:report.requests.filter(r=>r.arm===arm&&r.status==='replayed_returned').length};
 }
 return {cumulative_rounds:state.round_count,cumulative_visits:state.round_count*2,arms,shared_first_route:report.entries.some(e=>e.shared_first_opening!==undefined),actual_model_calls_new:report.model_calls,replayed_model_calls:report.replayed_calls??0,new_estimated_usd:report.known_estimated_usd,db_writes:0,quality_rating:null,warning:'Fictional learner, symbolic activities, no automatic proof of learning'};
}
export async function paired(o,{invoke,embedFn}={}){
 const cfg={...DEFAULT,...o,lab:'paired'};
 const initial=pairedStartOptions(cfg);
 if(initial.state.round_count+cfg.visits>COMPLETE_MAX)throw Error('Paired study capped at 20 visits per arm; do not start extra paid calls');
 if(cfg.mode==='plan')return {plan:{...plan(cfg),design:'paired_20_visits_each_arm_40_total',completed_rounds_before:initial.state.round_count,rounds_this_block:cfg.visits,rounds_after:initial.state.round_count+cfg.visits,first_question_shared:initial.state.round_count===0,subsequent_topic_routes_independent:true,replayed_calls_if_recovery:initial.recovery?.calls.length??0,partial_recovery_requires_known_returned_provider_outputs:true}};
 const {dir,report}=initLab(cfg,{lineage:initial.lineage,execution_key:initial.execution_key,replayed_calls:0,completed_rounds:initial.state.round_count,shared_first_question:true,paired_arms:PAIRED_ARMS});
 let state=initial.state;const startSnap=pairedSnapshot(cfg,state);storeJSON(path.join(dir,'START_STATE.json'),startSnap);
 const call=pairedCaller(cfg,report,dir,state,{invoke,sourceCalls:initial.recovery?.calls??[]});
 const embed=embedFn??null;let phase='initial',currentRound=null;
 try{
  for(let i=0;i<cfg.visits;i++){
   const round=state.round_count+1;phase='paired_round_'+round;
   currentRound={round,arms:{'b-only':{},'b+x':{}},completed:false};report.entries.push(currentRound);storeJSON(path.join(dir,'TRACE.json'),report);
   let shared=null;
   if(round===1){
    const routeInput={opening_request:true,visit:1,fictional_private_state:LEARNERS[cfg.learner],available_topics:TOPIC_BANK,learner_visible_history:[],hidden_model_A_memory_not_supplied:true,hidden_teacher_assessment_not_supplied:true};
    const resp=await call('L_ROUTE',routeInput,{record:'L:shared_first_route',index:1,arm:'shared',round});
    shared=resp.parsed;
    if(!TOPIC_IDS.has(shared?.topic_id)||typeof shared?.learner_utterance!=='string'||!shared.learner_utterance.trim()||!Array.isArray(shared.selected_actions)||shared.selected_actions.length||shared.request_hint!==false||shared.declines!==false)throw Error('Shared initial route malformed');
    currentRound.shared_first_opening={input:routeInput,raw:resp.raw,output:shared};storeJSON(path.join(dir,'TRACE.json'),report);
   }
   for(const arm of PAIRED_ARMS){
    phase=`round_${round}:${arm}`;
    await pairedArmVisit(cfg,state.branches[arm],round,arm,currentRound.arms[arm],call,embed,initial.execution_key,shared);
    storeJSON(path.join(dir,'TRACE.json'),report);
   }
   state.round_count=round;currentRound.completed=true;report.completed_rounds=round;
   storeJSON(path.join(dir,'CHECKPOINT.json'),pairedSnapshot(cfg,state));storeJSON(path.join(dir,'TRACE.json'),report);
  }
  if(initial.recovery&&report.replayed_calls!==initial.recovery.calls.length)throw Error('Recovery replay did not consume all recorded provider outputs');
  report.complete=true;storeJSON(path.join(dir,'STATE.json'),pairedSnapshot(cfg,state));
 }catch(e){
  report.failure={phase,round:currentRound?.round??null,arm:phase.split(':').at(-1),message:String(e.stack??e).slice(0,2000),unknown_provider_result:report.requests.some(r=>r.status==='transport_unknown'||r.status==='prepared')};
 }
 report.summary=summarizePaired(report,state);
 storeJSON(path.join(dir,'TRACE.json'),report);
 writeReview(dir,report);
 fs.writeFileSync(path.join(dir,'PAIRED_REVIEW.md'),[
  '# FIX2 paired B-only vs B→X longitudinal review',
  `Completed: ${report.complete}; completed paired rounds: ${report.completed_rounds}; planned rounds this block: ${cfg.visits}`,
  `New calls: ${report.model_calls}; replayed saved calls: ${report.replayed_calls}; new estimated USD: ${report.known_estimated_usd}`,
  `Lineage: ${JSON.stringify(report.lineage)}`,
  'Two arms share the very first fictional learner question, profile and empty memory. Later model-L routes and learner histories diverge naturally.',
  'B-only is one API call for teaching, creative design, and technical implementation; B+X is B design plus X implementation.',
  'Mechanical navigation flags may be normalized and are disclosed per visit; stage limits and observation-only stages are explicit. No extra model repair calls.',
  'Each arm has independent retrieval, Model A memory decisions, learner activity evidence and state. Do not mistake simulated L performance for human learning.',
  'Retrospectively review A evidence, independent/coached demonstrations, proposed shared roots, contradictory observations, B teaching decisions, fidelity, cost, failures and omissions. No expected cognitive labels or automatic scientific truth scores.',
  '',...PAIRED_ARMS.map(a=>`## ${a}\n${JSON.stringify(report.summary.arms[a],null,2)}`),
  '', '## Open questions for independent review',
  '- Did the teacher actually elicit meaningful reasoning or simply successful control operations?',
  '- Were Model A memory changes supported by available source evidence, including omissions?',
  '- Did one-call B and B→X preserve intended educational experiences equally well?',
  '- Were stage validity failures mechanical or genuine implementation/fidelity defects?',
  '- Did topic revisits and possible shared roots arise from natural learner evidence?',
 ].join('\n')+'\n',{mode:0o600});
 return {report,dir};
}

export async function run(o,options={}){const cfg={...DEFAULT,...o};if(cfg.mode==='plan'){if(cfg.lab==='paired')return paired(cfg,options);if(['assessment','implementation'].includes(cfg.lab))sourceJourney(cfg.sourceRun);if(cfg.lab==='journey'&&cfg.resumeFrom)sourceJourney(cfg.resumeFrom);if(cfg.recoverPartial)return recoverPartialJourney(cfg,options);return {plan:plan(cfg)};}if(cfg.recoverPartial)return recoverPartialJourney(cfg,options);if(cfg.lab==='paired')return paired(cfg,options);if(cfg.lab==='journey')return journey(cfg,options);if(cfg.lab==='assessment')return assessment(cfg,options);if(cfg.lab==='implementation')return implementation(cfg,options);if(cfg.lab==='challenge')return challenge(cfg,options);if(cfg.lab==='readiness')return readiness(cfg);throw Error('Unknown lab');}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.mode==='plan'){const preview=await run(o);console.log(LABEL+' PLAN (NO PROVIDER/DB/EMBEDDING CALLS)\n'+JSON.stringify(preview.plan,null,2));return;}const result=await run(o);if(result.report)console.log(LABEL+' '+o.lab.toUpperCase()+' '+JSON.stringify({report:result.dir,complete:result.report.complete,model_calls:result.report.model_calls,known_estimated_usd:result.report.known_estimated_usd,failure:result.report.failure}));if(result.report&&!result.report.complete)process.exitCode=1;else console.log(LABEL+' RUN PASS | descriptive research evidence; educational quality requires review');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(LABEL+' STOP '+String(e.stack??e));process.exitCode=1});
