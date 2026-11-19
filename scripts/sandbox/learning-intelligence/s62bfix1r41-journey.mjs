#!/usr/bin/env node
/** S62B successor research architecture: A → evidence memory → creative B → technical interpreter → actual staged controls → L → A.
 * Read-only production isolation. No DB/write imports. Old stages retained for rollback/comparison.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {A_PROMPT_R2,A_SCHEMA,B_PROMPT,B_SCHEMA,L_PROMPT,L_SCHEMA,verifyAIsolated,applyA,learnerBrief} from './s62bfix1r2-core.mjs';
import {TRANSLATOR_SCHEMA,TRANSLATOR_PROMPT_R2,compileExperience,publicStage,executePhase,evidenceFromAttempt,assertReplay,experienceContract,errorForRepair} from './s62bfix1r2-experience.mjs';
import {retrieveR3} from './s62bfix1r3-retrieval.mjs';
import {learnerView,normalizeAttempt,evidenceR3,memoryActionUsesFailedObservation,forAssessment} from './s62bfix1r3-evidence.mjs';
import {initialState,EPISODES,LEARNER_PRIVATE,routeAuthoredEpisode} from './s62b-scenario.mjs';
import {inspect} from './s62bfix1-inspector.mjs';
import {R4_OPPORTUNITIES,makeOpeningInput,conversationObservation,evidenceR4,forAssessmentR4,fidelityReview,makeQualityReport} from './s62bfix1r4-quality.mjs';
import {PROMPT_SET_VERSION,promptForR41} from './s62bfix1r41-prompts.mjs';
const dirname=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(dirname,'../../..');
const require=createRequire(import.meta.url),clone=x=>structuredClone(x),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const DEFAULT={mode:'plan',episodes:6,method:'semantic',runId:'pilot1',resumeFrom:null,modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelL:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on'};
const allowedModels=new Set(['gpt-4.1-mini','gpt-4.1']);
export function parseArgs(argv){const opts={...DEFAULT},fields={'--mode':'mode','--episodes':'episodes','--retrieval':'method','--run-id':'runId','--model-a':'modelA','--model-b':'modelB','--model-l':'modelL','--model-x':'modelX','--budget-usd':'budget','--second-retrieval':'secondRetrieval','--resume-from':'resumeFrom'};
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--allow-spend'){opts.allowSpend=true;continue}if(!fields[k]||!argv[i+1])throw Error('Unknown/missing S62B argument '+k);const field=fields[k],v=argv[++i];opts[field]=['episodes','budget'].includes(field)?Number(v):v;}
 if(!['plan','offline','model'].includes(opts.mode)||!Number.isInteger(opts.episodes)||opts.episodes<1||opts.episodes>6||opts.method!=='semantic'||!['on','off'].includes(opts.secondRetrieval)||!/^[a-zA-Z0-9_-]{1,40}$/.test(opts.runId)||(opts.resumeFrom!==null&&(!/^[A-Za-z0-9_-]{1,40}$/.test(opts.resumeFrom)||opts.resumeFrom===opts.runId))||[opts.modelA,opts.modelB,opts.modelL,opts.modelX].some(x=>!allowedModels.has(x)))throw Error('Invalid S62B configuration');
 if(opts.mode==='model'&&(!opts.allowSpend||!Number.isFinite(opts.budget)||opts.budget<=0||opts.budget>10))throw Error('Paid mode requires budget <=10 and explicit AllowSpend');
 if(opts.mode!=='model'&&(opts.allowSpend||opts.budget!==null))throw Error('No spending flags permitted in Plan/Offline');
 return opts;
}
export function plan(o){const callsPerVisit=17;const cost=Number((o.episodes*0.30).toFixed(4));return {stage:'S62B-FIX1R4.1',prompt_set_version:PROMPT_SET_VERSION,journey:'guided6_dynamic_L_openings',scope:'add-only prompt-consolidation research; R4 and all predecessors preserved',episodes:o.episodes,resume_from:o.resumeFrom,starting_topics:5,models:{A:o.modelA,B:o.modelB,L:o.modelL,X_technical:o.modelX},retrieval:o.method,second_retrieval:o.secondRetrieval,expected_upper_model_calls:o.episodes*callsPerVisit,conservative_admission_estimate_usd:cost,plan_only:o.mode==='plan',output_root:'.myway-patch-backups/learning-intelligence-reports/s62bfix1r41',warnings:['Model L generates openings and activity attempts, but scenario topic opportunities are curated and route is not automatic','Model L is fictional, not a human learner or educational ground truth','Paid estimation is NOT a guaranteed provider billing cap','Model B retains unbounded creative educational design; X remains separate and fallible','B to X fidelity audit is descriptive and not independently scored','Only symbolic prototype interactions run, not actual rendered 2D/3D/audio','Local semantic retrieval is mandatory; no lexical fallback','A cognitive judgments and synthetic learner behaviour are not scientifically validated','No DB or production writes; isolated R4 STATE only','No API usage without explicit spending authorization']};}
function reportDir(o){return path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41',o.runId)}
function resumeState(cfg){
 if(!cfg.resumeFrom)return {state:initialState(),lineage:{resumed:false,previous_run_id:null,episode_offset:0}};
 const previousDir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41',cfg.resumeFrom);
 const snapshotFile=path.join(previousDir,'STATE.json'),traceFile=path.join(previousDir,'TRACE.json');
 const former=JSON.parse(fs.readFileSync(traceFile,'utf8'));const snap=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));
 if(former.complete!==true||snap.schema!=='myway_s62bfix1r41_state_v1'||snap.run_id!==cfg.resumeFrom||snap.stage!=='S62B-FIX1R4.1'||sha(snap.state)!==snap.state_sha256||snap.completed_episodes!==former.state.last_completed_episode||snap.completed_episodes!==snap.state.last_completed_episode||!Array.isArray(snap.state.observations)||!Array.isArray(snap.state.records))throw Error('R4.1 previous-state integrity/continuity mismatch; no reuse');
 if(snap.state.semantic_index?.provider!=='local_minilm_http_127_0_0_1_8001_embed'&&snap.state.semantic_index?.provider!=='injected_test_only')throw Error('Previous semantic index missing/provider unexpected');
 if(cfg.episodes+snap.completed_episodes>6)throw Error('Resumed guided journey would pass six visits');
 return {state:clone(snap.state),lineage:{resumed:true,previous_run_id:cfg.resumeFrom,previous_state_sha256:snap.state_sha256,episode_offset:snap.completed_episodes}};
}
function saveState(state,cfg,dir){
 const snap={schema:'myway_s62bfix1r41_state_v1',stage:'S62B-FIX1R4.1',run_id:cfg.runId,completed_episodes:state.last_completed_episode,state_sha256:sha(state),state};
 fs.writeFileSync(path.join(dir,'STATE.json'),JSON.stringify(snap,null,2)+'\n',{flag:'wx',mode:0o600});
 return snap.state_sha256;
}
function checkEnv(){if(process.env.OPENAI_API_KEY)return;const f=path.join(ROOT,'.env.local');if(fs.existsSync(f)){const env=require('dotenv').parse(fs.readFileSync(f));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}}
function makePayload(role,input,model){let prompt,schema,max,name;
 if(role==='A'){prompt=promptForR41('A',input);schema=A_SCHEMA;max=2400;name='learner_investigator'}
 if(role==='B'){prompt=promptForR41('B',input);schema=B_SCHEMA;max=1600;name='creative_teacher'}
 if(role==='L'){prompt=promptForR41('L',input);schema=L_SCHEMA;max=850;name=input.opening_request===true?'fictional_learner_opening':input.conversation_reply_request===true?'fictional_learner_chat':'fictional_learner'}
 if(role==='X'){prompt=promptForR41('X',input);schema=TRANSLATOR_SCHEMA;max=1700;name='technical_scene_translation'}
 const bytes=Buffer.byteLength(JSON.stringify(input));if(bytes>33000)throw Error(`Input overflow ${role}: ${bytes} bytes`);
 return {model,store:false,max_tokens:max,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'s62b_'+name,strict:true,schema}}};
}
function mock(role,input,callIndex){const usage={prompt_tokens:200,completion_tokens:110};
 if(role==='A'){
  const id=input.current.id,topic=input.current.topic_id;
  const first=callIndex===1,rec=input.memory_candidates.find(r=>r.type==='root'&&r.topics.includes(topic));
  const action=first&&rec?{action:'revise',record_type:'root',target_id:rec.id,claim:rec.current_claim,topics:rec.topics,possible_instances:[],evidence:[{id,role:'context'}],rationale:'Mock: this question does not prove the root persists',uncertainty:'high'}:null;
  return {raw:JSON.stringify({observed:{kind:'question',evidence_ids:[id],demonstrated:'Learner provided a response or request',untested_or_incorrect:'The task has not established independent transfer',conditions:'authored fictional scenario'},interpretation:{hypotheses:[],uncertainty:'high',more_history_needed:null},memory_decisions:action?[action]:[],learner_brief_for_B:{current_understanding:'Uncertain; learner is investigating a possible confusion',remaining_uncertainty:'Determine how they reason when answering',relevant_history:'Prior learner questions exist and were not scored',possible_shared_root:null,teaching_response_evidence:'No independent effectiveness claim'}}),usage};
 }
 if(role==='B'){const mod=callIndex<=2?'2d':callIndex===3?'audio':'text';return {raw:JSON.stringify({teacher_response:'Imagine you are solving a small real-world problem. Try one idea, then explain what happened.',experience_proposal:{modality:mod,setting:'A simple water-flow puzzle and a change over time',learner_task:'Try a small prediction and explain it',possible_actions:['adjust values','choose or write an answer'],private_assessment_intent:'Observe reasoning, not declare mastery'}}),usage};}
 if(role==='X'){
  const modality=input.creative.experience_proposal.modality;
  if(modality==='audio')return {raw:JSON.stringify({status:'unsupported',reason:'No verified audio stimulus; symbolic audio perception would be invalid',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}}),usage};
  if(modality==='2d')return {raw:JSON.stringify({status:'compiled',reason:'symbolic controls only',stages:[{instruction:'Set the two rates; keep water level constant',visible_scene:'Two water valves, inflow and outflow',controls:[{id:'inflow',kind:'slider',label:'Inflow',choices:[],min:0,max:10},{id:'outflow',kind:'slider',label:'Outflow',choices:[],min:0,max:10}],feedback_on_submit:'Try comparing the two rates',hint_text:'Compare inflow and outflow rather than inflow alone.',reveal_next_on_submit:false}],assessment:{kind:'balance',control_a:'inflow',control_b:'outflow',expected_choice:'',explanation:'Equal rates maintain constant level'}}),usage};
  return {raw:JSON.stringify({status:'compiled',reason:'text response',stages:[{instruction:input.creative.experience_proposal.learner_task,visible_scene:input.creative.experience_proposal.setting,controls:[{id:'answer',kind:'text',label:'Your reasoning',choices:[],min:0,max:0}],feedback_on_submit:'Thanks for your attempt.',hint_text:'Consider one piece at a time.',reveal_next_on_submit:false}],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}}),usage};
 }
 if(role==='L'&&input.opening_request===true){const cue=input.research_opportunity??{};const turn=input.visit??1;return {raw:JSON.stringify({learner_utterance:turn===1?'I keep getting mixed up about whether a rising graph that gets less steep means the amount falls. Could we work through it?':`I have a new question in ${cue.topic_title??'this area'}. I am wondering whether the amount can still grow even if the rate changes.`,selected_actions:[],request_hint:false,declines:false}),usage};}
 if(role==='L'&&input.conversation_reply_request===true)return {raw:JSON.stringify({learner_utterance:'I think I follow some of it, but could you give me another example without revealing the answer?',selected_actions:[],request_hint:false,declines:false}),usage};
 if(role==='L'){const controls=input.current_stage?.controls??[];const actions=controls.map(c=>({control:c.id,operation:({text:'text_response',select:'select',slider:'set_value',move:'move',rotate:'rotate',play:'play'})[c.kind],value:c.kind==='slider'?'3':c.kind==='select'?c.choices[0]:c.kind==='rotate'?'20':c.kind==='move'?'0,0,0':c.kind==='play'?'play':'I think the amount depends on both rate and total.'}));return {raw:JSON.stringify({learner_utterance:'I am not totally sure; I want to compare what goes in and out.',selected_actions:actions,request_hint:false,declines:false}),usage};}
 throw Error('Unknown mock role');
}
/** Persist minimal recovery checkpoints. Never regenerate HTML during the learning loop. */
function persist(trace,dir){
 fs.mkdirSync(dir,{recursive:true});
 try { fs.writeFileSync(path.join(dir,'TRACE.json'),JSON.stringify(trace,null,2)+'\n',{mode:0o600}); }
 catch(e){ throw Error('TRACE checkpoint write failed (not a model/route failure): '+String(e?.message??e)); }
}
/** Final HTML is a derived, non-authoritative convenience; it must not corrupt the research run. */
function finalizeReport(trace,dir,{skipHtml=false}={}){
 const html=path.join(dir,'TURN_INSPECTOR.html');
 try { if(!skipHtml)fs.writeFileSync(html,inspect(trace)+'\n',{flag:'wx',mode:0o600}); }
 catch(e){
  trace.report_warnings??=[];
  trace.report_warnings.push('Turn Inspector generation failed; TRACE.json is authoritative and can be re-rendered: '+String(e?.message??e));
  persist(trace,dir);
 }
 const summary=`# S62B-FIX1R4.1 learning research\n\nRunner complete: ${trace.complete}\nEpisodes: ${trace.timeline.length}\nFull learning loops (valid A post assessment): ${trace.summary?.full_learning_loops_with_valid_post_assessment??'n/a'}\nPost assessments (attempted): ${trace.timeline.filter(x=>x.post_a).length}\nCost estimate USD: ${trace.cost.known_estimated_usd}\nReport warnings: ${(trace.report_warnings??[]).join(' ; ')||'none'}\n\nFictional model simulations and symbolic activities; no educational truth claims.\n`;
 fs.writeFileSync(path.join(dir,'SUMMARY.md'),summary,{mode:0o600});
 fs.writeFileSync(path.join(dir,'QUALITY_REVIEW.json'),JSON.stringify(makeQualityReport(trace),null,2)+'\n',{mode:0o600});
 fs.writeFileSync(path.join(dir,'QUALITY_REVIEW.md'),makeQualityReport(trace,{markdown:true}),{mode:0o600});
}
export async function run(o,{invoke,embedFn,afterEpisode,suppressHtml=false}={}){const cfg={...DEFAULT,...o};const p=plan(cfg);if(cfg.mode==='plan')return {plan:p};
 if(cfg.mode==='model'&&p.conservative_admission_estimate_usd>cfg.budget)throw Error('S62B admission estimate exceeds spending authorization');
 if(cfg.mode==='model'&&!invoke)checkEnv();const ctx=cfg.mode==='model'&&!invoke?credentials():null;
 const recovered=resumeState(cfg);if(cfg.method!=='semantic')throw Error('R4.1 must use semantic retrieval');
 const dir=reportDir(cfg);if(fs.existsSync(dir))throw Error('Run ID already used: reports cannot be overwritten');
 if(cfg.mode==='model'){const attemptDir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41','paid-attempts');fs.mkdirSync(attemptDir,{recursive:true});fs.writeFileSync(path.join(attemptDir,cfg.runId+'.json'),JSON.stringify({runId:cfg.runId,request_sha256:sha(cfg),warning:'one shot; do NOT rerun after provider failure'}),{flag:'wx',mode:0o600});}
 const trace={stage:'S62B-FIX1R4.1',prompt_set_version:PROMPT_SET_VERSION,plan:p,options:cfg,synthetic:true,db_writes:0,model_C_invocations:0,educational_correctness_scored:false,complete:false,failure:null,timeline:[],request_log:[],cost:{calls:0,known_estimated_usd:0,by_role:{A:0,B:0,X:0,L:0},unknown_usage:0}};
 const state=recovered.state;state.last_completed_episode??=0;let phase='start',inflight=null;trace.lineage=recovered.lineage;
 const use=async(role,input,meta={})=>{
  const model=cfg['model'+role],payload=makePayload(role,input,model),requestRecord={role,episode:inflight?.step,phase,model,request_sha256:sha(payload),request:payload,status:'prepared'};trace.request_log.push(requestRecord);
  if(cfg.mode==='model'&&trace.cost.known_estimated_usd>=cfg.budget)throw Error('Estimated spending threshold reached before next call');
  let reply;try{reply=invoke?await invoke(role,clone(input),clone(payload),meta):cfg.mode==='model'?await callProvider(payload,ctx):mock(role,input,trace.request_log.filter(x=>x.role===role).length)}catch(e){requestRecord.status='transport_unknown';throw Error('Model transport failure; never auto retry: '+String(e.message));}
  requestRecord.status='returned';const raw=typeof reply.raw==='string'?reply.raw:JSON.stringify(reply.raw??reply);requestRecord.raw=raw;requestRecord.response_sha256=sha(raw);
  if(cfg.mode==='model'){trace.cost.calls++;trace.cost.by_role[role]++;if(!reply.usage){trace.cost.unknown_usage++;throw Error('Unknown API usage; stop without retry');}trace.cost.known_estimated_usd=+(trace.cost.known_estimated_usd+estimateCost(reply.usage,model)).toFixed(9);if(trace.cost.known_estimated_usd>cfg.budget)throw Error('Estimated spend exceeded threshold after a call; stop');}
  return {raw,payload};
 };
 const assess=async(current,stage)=>{
  phase='retrieve_'+stage;let packet=await retrieveR3(state,current,{method:cfg.method,embedFn});
  let compactCurrent=forAssessmentR4(current);let input={stage,current:{...compactCurrent,actual_activity:undefined},allowed_evidence_ids:packet.allowed_evidence_ids,observations:packet.evidence.map(x=>forAssessmentR4(x,{includeActivity:false})),memory_candidates:packet.memory_candidates,coverage:packet.coverage,available_topics:clone(state.topics),recent_dialogue:state.dialogue.slice(-3),activity_actual_evidence:compactCurrent.actual_activity??null};
  phase='Model_A_'+stage;let r=await use('A',input),v=verifyAIsolated(r.raw,packet,state);
  let requested=null;
  if(v.output?.interpretation.more_history_needed&&cfg.secondRetrieval==='on'){
   phase='targeted_retrieval';requested=v.output.interpretation.more_history_needed;
   const larger=await retrieveR3(state,current,{method:cfg.method,cap:18,embedFn,additionalQuery:requested});
   input={...input,allowed_evidence_ids:larger.allowed_evidence_ids,observations:larger.evidence.map(x=>forAssessmentR4(x,{includeActivity:false})),memory_candidates:larger.memory_candidates,coverage:larger.coverage,focused_retrieval_question:requested};
   packet=larger;phase='Model_A_after_retrieval';r=await use('A',input);v=verifyAIsolated(r.raw,packet,state);
  }
  // Preserve the assessment while refusing a memory mutation founded on an unexecuted action.
  if(v.output?.memory_decisions?.length){
   const rejected=v.output.memory_decisions.filter(m=>memoryActionUsesFailedObservation(m,current));
   if(rejected.length){v.rejected_memory_actions.push(...rejected.map((raw_action,index)=>({index,error:'Technical non-execution cannot support a learner-state memory change',raw_action})));v.output.memory_decisions=v.output.memory_decisions.filter(m=>!memoryActionUsesFailedObservation(m,current));}
  }
  const memoryBefore=clone(state.records);
  // applyA is transactional; an application failure cannot silently write a partial learner belief.
  let changes=[],application_error=null;
  if(v.assessment_valid&&v.output){try{changes=applyA(state,v.output,current.id)}catch(e){application_error=String(e.message);v.output.memory_decisions=[];}}
  return {valid:v.assessment_valid,error:v.error,raw:r.raw,request:r.payload,output:v.output,packet,requested_extra_history:requested,
   proposed_memory_actions:v.proposed_memory_actions,accepted_memory_actions:v.accepted_memory_actions.length,rejected_memory_actions:v.rejected_memory_actions,
   memory_application_error:application_error,memory_before:memoryBefore,memory_changes:changes,memory_after:clone(state.records)};
 };
 try{
  for(const opportunity of R4_OPPORTUNITIES.slice(state.last_completed_episode,state.last_completed_episode+cfg.episodes)){
   const episode={...opportunity,step:opportunity.visit};inflight={step:episode.step,topic:episode.topic_id};
   phase='Model_L_opening';const openingInput=makeOpeningInput(episode,LEARNER_PRIVATE,state);
   const openingResult=await use('L',openingInput);let openingObj;
   try{openingObj=JSON.parse(openingResult.raw);if(typeof openingObj.learner_utterance!=='string'||!openingObj.learner_utterance.trim()||openingObj.learner_utterance.length>2400||!Array.isArray(openingObj.selected_actions)||openingObj.selected_actions.length!==0)throw Error('Invalid L opening; must be prose and no executable actions');}catch(e){throw Error('R4 learner opening invalid: '+String(e.message));}
   episode.opening=openingObj.learner_utterance.trim();
   phase='route';const route=routeAuthoredEpisode(state,episode);
   const current={id:`NORA-${String(episode.step).padStart(2,'0')}-IN`,topic_id:episode.topic_id,text:episode.opening,kind:'fictional_learner_generated_opening',conditions:{source:'Model_L_generated_under_curated_topic_opportunity',independent_performance:false,topic_scaffold:episode.topic_id,topic_route_not_model_inferred:true}};
   state.observations.push(current);
   const entry={step:episode.step,topic_id:episode.topic_id,topic_route:{...route,source:'research_topic_opportunity_not_automatic_topic_routing'},research_opportunity:episode,opening_L_input:openingInput,opening_L_request:openingResult.payload,opening_L_raw:openingResult.raw,learner_opening:episode.opening,memory_before:clone(state.records),pre_a:null};
   trace.timeline.push(entry);persist(trace,dir);
   entry.pre_a=await assess(current,'pre');entry.retrieval_pre=entry.pre_a.packet;entry.pre_memory_changes=entry.pre_a.memory_changes;entry.memory_after_pre=clone(state.records);persist(trace,dir);
   phase='Model_B';const bInput={learner_request:episode.opening,topic:episode.topic_title,recent_visible_dialogue:state.dialogue.slice(-4).map(d=>({learner:d.learner,tutor:d.tutor})),learner_brief:learnerBrief(entry.pre_a.output,state.records,entry.pre_a.packet.memory_candidates.map(x=>x.id),episode.topic_id)};
   const bResult=await use('B',bInput);let b;try{b=JSON.parse(bResult.raw);if(typeof b.teacher_response!=='string'||!b.teacher_response.trim()||!b.experience_proposal||!['text','2d','3d','audio','mixed','none'].includes(b.experience_proposal.modality))throw Error('B invalid creative output')}catch(e){entry.b_error=String(e.message);state.last_completed_episode=episode.step;persist(trace,dir);continue}
   entry.b_input=bInput;entry.b_request=bResult.payload;entry.b_output=b;entry.b_raw=bResult.raw;
   state.dialogue.push({episode:episode.step,learner:episode.opening,tutor:b.teacher_response,topic_id:episode.topic_id});
   phase='technical_scene_translation';
   const capability={text:true,select:true,slider:true,symbolic_move_rotate:true,symbolic_2d:true,symbolic_3d:true,symbolic_audio_actions:true,actual_renderer:false,actual_audio_playback:false};
   const xInput={creative:b,translation_role:'implementation_only',available_in_research:capability,
     policy:'Preserve B story/task/actions; implementation-only; if meaning or assessment changes, report unsupported. Symbolic visual/audio is not actual perception. Unverified check is valid.'};
   entry.translator_input=xInput;
   let xInputCurrent=xInput,x=null,execution=null;
   const translationAttempts=[];
   if(b.experience_proposal.modality==='none'){
    x={status:'not_called',reason:'Model B selected natural conversation without an activity',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};
    execution=compileExperience(b,x,{instanceKey:`${cfg.runId}:${state.learner}:${episode.step}:${episode.topic_id}`});
   }else for(let attempt=0;attempt<2;attempt++){
    phase=attempt===0?'technical_scene_translation':'technical_scene_translation_repair';
    const xResult=await use('X',xInputCurrent);let translationError=null;
    try{x=JSON.parse(xResult.raw)}catch(e){translationError=String(e.message);x={status:'unsupported',reason:'Invalid JSON from translator',stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};}
    phase='compile';execution=compileExperience(b,x,{instanceKey:`${cfg.runId}:${state.learner}:${episode.step}:${episode.topic_id}`});
    const repairReason=errorForRepair(execution,translationError);
    translationAttempts.push({attempt:attempt+1,request:xResult.payload,raw:xResult.raw,output:clone(x),validation_status:execution.status,
     validator_error:repairReason,translation_error:translationError,implementation_changed_without_B_change:true});
    if(execution.status!=='rejected'||(x.status==='unsupported'&&!translationError)||attempt===1)break;
    // B has not been modified or reprompted. X alone gets the exact failure and one repair attempt.
    xInputCurrent={...xInput,previous_translation:translationError?null:clone(x),previous_translation_raw:translationError?xResult.raw.slice(0,12000):null,previous_validation_error:repairReason,
      correction_instruction:'Fix ONLY technical implementation errors. Preserve the original Model B experience and assessment intent. If infeasible, return unsupported.'};
   }
   entry.translation_attempts=translationAttempts;
   entry.translator_request=translationAttempts.at(-1)?.request??null;
   entry.translator_raw=translationAttempts.at(-1)?.raw??null;
   entry.translator_output=x;
   entry.translator_error=translationAttempts.find(y=>y.translation_error)?.translation_error??null;
   entry.execution=execution;
   entry.experience_contract=experienceContract(b,x,execution,{attempts:translationAttempts});
   entry.fidelity_review=fidelityReview(b,x,execution);
   if(['rejected','no_activity'].includes(execution.status)){
    phase='Model_L_conversation_reply';
    const lInput={conversation_reply_request:true,fictional_private_state:LEARNER_PRIVATE,visible_recent_dialogue:state.dialogue.slice(-4),learner_visible_teacher_response:b.teacher_response,actual_activity_available:false,reason:execution.status,hidden_rubric_not_supplied:true};
    const lResult=await use('L',lInput);let l;
    try{l=JSON.parse(lResult.raw);if(typeof l.learner_utterance!=='string'||!l.learner_utterance.trim()||!Array.isArray(l.selected_actions)||l.selected_actions.length)throw Error('Conversation reply invalid');}catch(e){throw Error('R4 L conversational reply invalid: '+String(e.message));}
    entry.conversation_reply={input:lInput,request:lResult.payload,raw:lResult.raw,output:l};entry.phases=[];
    const obs=conversationObservation({id:`NORA-${String(episode.step).padStart(2,'0')}-OUT`,topic_id:episode.topic_id,text:l.learner_utterance,teacher_response:b.teacher_response,activity_status:execution.status});
    entry.activity_evidence=obs;state.observations.push(obs);state.learner_visible_history??=[];state.learner_visible_history.push({visit:episode.step,opening:episode.opening,teacher_response:b.teacher_response,learner_response:l.learner_utterance,activity_status:execution.status});
    entry.post_a=await assess(obs,'post');entry.retrieval_post=entry.post_a.packet;entry.post_memory_changes=entry.post_a.memory_changes;entry.memory_after_post=clone(state.records);state.last_completed_episode=episode.step;persist(trace,dir);afterEpisode?.(clone(entry),clone(state));continue;
   }
   const stageResponses=[],completed=[],presented=[],attempts=[];let invalidAttempt=null;
   for(let k=0;k<execution.stages.length;k++){
    let hint=null,previous=completed.at(-1)?.feedback??null;
    for(let call=0;call<2;call++){
     phase='learner_visible_phase_'+(k+1);
     const view=learnerView(execution,k,{feedback:k?previous:null,hint});presented.push(clone(view));
     const lInput={fictional_private_state:LEARNER_PRIVATE,learner_visible_teacher_response:b.teacher_response,current_stage:view,visible_recent_dialogue:state.dialogue.slice(-3),prior_visible_attempt_feedback:completed.slice(-2).map(x=>({result:x.result.status,feedback:x.feedback})),hidden_rubric_not_supplied:true};
     phase='Model_L_phase_'+(k+1);const lResult=await use('L',lInput);let l;
     try{
      l=JSON.parse(lResult.raw);
      const normalized=normalizeAttempt(l,view);
      const recorded=executePhase(execution,k,normalized.normalized_response,completed.flatMap(x=>x.events));
      attempts.push({phase:k+1,raw_response:clone(l),normalized_response:clone(normalized.normalized_response),normalizations:normalized.normalizations,accepted:true});
      stageResponses.push({phase:k,response:normalized.normalized_response});completed.push({...recorded,phase:k+1,view,model_l_input:lInput,model_l_request:lResult.payload,model_l_raw:lResult.raw,normalizations:normalized.normalizations});
      if(recorded.result.status==='hint_requested'){
       if(call>0||!recorded.hint){invalidAttempt={phase:k+1,error:'Hint unavailable or repeated; no task answer inferred',raw:lResult.raw,view};break;}
       hint=recorded.hint;continue;
      }
      break;
     }catch(e){invalidAttempt={phase:k+1,error:String(e.message),raw:lResult.raw,raw_response:l??null,view};attempts.push({phase:k+1,raw_response:clone(l??null),accepted:false,error:String(e.message)});break}
    }
    if(invalidAttempt)break;
    if(['declined','no_attempt','incomplete'].includes(completed.at(-1)?.result.status))break;
   }
   entry.phases=completed;entry.invalid_attempt=invalidAttempt;entry.presented_views=presented;entry.attempted_actions=attempts;
   if(!invalidAttempt){const replayOriginal={events:completed.flatMap(x=>x.events),completed:completed.map(({events,result,feedback,hint})=>({events,result,feedback,...(hint?{hint}:{})}))};assertReplay(execution,stageResponses,replayOriginal);entry.event_replay_verified=true;}
   const obs=evidenceR4(execution,completed,{learner_id:state.learner,topic_id:episode.topic_id,observation_id:`NORA-${String(episode.step).padStart(2,'0')}-OUT`,presented,attempts,technicalFailure:invalidAttempt,teacherResponse:b.teacher_response});
   entry.activity_evidence=obs;state.observations.push(obs);
   state.learner_visible_history??=[];state.learner_visible_history.push({visit:episode.step,opening:episode.opening,teacher_response:b.teacher_response,learner_response:attempts.map(x=>x.raw_response?.learner_utterance??'').filter(Boolean).join(' | ').slice(0,800),activity_status:obs.actual_activity?.observation_status,feedback_exposed:completed.map(x=>x.feedback??null).filter(Boolean)});
   state.events??=[];state.events.push(...obs.actual_activity.executed_events.map(x=>({...x,evidence_id:obs.id})));
   entry.post_a=await assess(obs,'post');entry.retrieval_post=entry.post_a.packet;entry.post_memory_changes=entry.post_a.memory_changes;entry.memory_after_post=clone(state.records);state.last_completed_episode=episode.step;
   persist(trace,dir);afterEpisode?.(clone(entry),clone(state));
  }
  trace.complete=true;state.last_completed_episode??=0;
 }catch(e){trace.failure={phase,inflight,message:String(e?.stack??e).slice(0,1600),completed_episodes:trace.timeline.filter(x=>x.post_a||x.execution).length,unknown_provider_spend_possible:phase.startsWith('Model_')};}
 trace.summary={planned:cfg.episodes,episodes:trace.timeline.length,journey_episode_offset:trace.lineage.episode_offset,guided_L_openings:trace.timeline.filter(x=>x.opening_L_raw).length,conversation_only_replies:trace.timeline.filter(x=>x.conversation_reply).length,quality_automated_scoring:false,journey_completed_episodes:state.last_completed_episode,semantic_index_provider:state.semantic_index?.provider??null,semantic_index_entries:Object.keys(state.semantic_index?.vectors??{}).length,full_learning_loops_with_valid_post_assessment:trace.timeline.filter(x=>x.post_a?.valid===true&&x.phases?.length>0&&!x.invalid_attempt&&x.activity_evidence?.task_conditions?.observation_status==='executed_attempt').length,completed_with_post_assessment:trace.timeline.filter(x=>x.post_a).length,invalid_memory_actions:trace.timeline.reduce((n,x)=>n+(x.pre_a?.rejected_memory_actions?.length??0)+(x.post_a?.rejected_memory_actions?.length??0),0),x_repair_calls:trace.timeline.reduce((n,x)=>n+Math.max(0,(x.translation_attempts?.length??0)-1),0),invalid_translations_after_repair:trace.timeline.filter(x=>x.execution?.status==='rejected').length,no_activity_by_B:trace.timeline.filter(x=>x.execution?.status==='no_activity').length,unexecuted_experiences:trace.timeline.filter(x=>['no_activity','rejected'].includes(x.execution?.status)).length,new_topics:state.topics.filter(x=>x.status==='new_from_authored_opening').length,records:state.records.length,memory_decisions:state.records.reduce((n,x)=>n+x.revisions.filter(r=>r.version>0).length,0),model_calls:trace.cost.calls,known_estimated_usd:trace.cost.known_estimated_usd,failed_at:trace.failure?.phase??null,db_writes:0,scientific_scoring:false};
 trace.state=state;persist(trace,dir);if(trace.complete)trace.saved_state_sha256=saveState(state,cfg,dir);persist(trace,dir);finalizeReport(trace,dir,{skipHtml:suppressHtml});return {plan:p,dir,trace};
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.mode==='plan'){console.log('S62B-FIX1R4.1 PLAN (NO MODEL/EMBEDDING/DB CALLS)\n'+JSON.stringify(plan(o),null,2));console.log('S62B-FIX1R4.1 PLAN PASS');return;}
 const r=await run(o);console.log('S62B-FIX1R4.1 REPORT '+r.dir);if(r.trace.report_warnings?.length)console.warn('S62B-FIX1R4.1 REPORT WARNINGS '+JSON.stringify(r.trace.report_warnings));console.log('S62B-FIX1R4.1 SUMMARY '+JSON.stringify(r.trace.summary));if(!r.trace.complete){console.error('S62B-FIX1R4.1 PARTIAL STOP '+JSON.stringify(r.trace.failure));process.exitCode=1}else console.log('S62B-FIX1R4.1 RUN PASS | prototype simulations; educational quality not automatically established');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62B-FIX1R4.1 STOP '+String(e.stack??e));process.exitCode=1});
