#!/usr/bin/env node
/** S62B successor research architecture: A → evidence memory → creative B → technical interpreter → actual staged controls → L → A.
 * Read-only production isolation. No DB/write imports. Old stages retained for rollback/comparison.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {credentials,callProvider} from './s16b54-models.mjs';
import {estimateCost} from './s16b61fix1-models.mjs';
import {A_PROMPT,A_SCHEMA,B_PROMPT,B_SCHEMA,L_PROMPT,L_SCHEMA,verifyA,applyA,learnerBrief} from './s62b-core.mjs';
import {TRANSLATOR_SCHEMA,TRANSLATOR_PROMPT,compileExperience,publicStage,executePhase,evidenceFromAttempt,assertReplay} from './s62bfix1-experience.mjs';
import {retrieve} from './s62b-retrieval.mjs';
import {initialState,EPISODES,LEARNER_PRIVATE,routeAuthoredEpisode} from './s62b-scenario.mjs';
import {inspect} from './s62bfix1-inspector.mjs';
const dirname=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(dirname,'../../..');
const require=createRequire(import.meta.url),clone=x=>structuredClone(x),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const obj=p=>({type:'object',additionalProperties:false,properties:p,required:Object.keys(p)});
const DEFAULT={mode:'plan',episodes:3,method:'lexical',runId:'pilot1',modelA:'gpt-4.1-mini',modelB:'gpt-4.1-mini',modelL:'gpt-4.1-mini',modelX:'gpt-4.1-mini',budget:null,allowSpend:false,secondRetrieval:'on'};
const allowedModels=new Set(['gpt-4.1-mini','gpt-4.1']);
export function parseArgs(argv){const opts={...DEFAULT},fields={'--mode':'mode','--episodes':'episodes','--retrieval':'method','--run-id':'runId','--model-a':'modelA','--model-b':'modelB','--model-l':'modelL','--model-x':'modelX','--budget-usd':'budget','--second-retrieval':'secondRetrieval'};
 for(let i=0;i<argv.length;i++){const k=argv[i];if(k==='--allow-spend'){opts.allowSpend=true;continue}if(!fields[k]||!argv[i+1])throw Error('Unknown/missing S62B argument '+k);const field=fields[k],v=argv[++i];opts[field]=['episodes','budget'].includes(field)?Number(v):v;}
 if(!['plan','offline','model'].includes(opts.mode)||!Number.isInteger(opts.episodes)||opts.episodes<1||opts.episodes>20||!['lexical','semantic','mixed'].includes(opts.method)||!['on','off'].includes(opts.secondRetrieval)||!/^[a-zA-Z0-9_-]{1,40}$/.test(opts.runId)||[opts.modelA,opts.modelB,opts.modelL,opts.modelX].some(x=>!allowedModels.has(x)))throw Error('Invalid S62B configuration');
 if(opts.mode==='model'&&(!opts.allowSpend||!Number.isFinite(opts.budget)||opts.budget<=0||opts.budget>10))throw Error('Paid mode requires budget <=10 and explicit AllowSpend');
 if(opts.mode!=='model'&&(opts.allowSpend||opts.budget!==null))throw Error('No spending flags permitted in Plan/Offline');
 return opts;
}
export function plan(o){const estimatedCalls=o.episodes*14;const cost=Number((o.episodes*0.25).toFixed(4));return {stage:'S62B-FIX1',scope:'research successor replaces FIX1C2 as active evaluation workflow; prior stages protected',episodes:o.episodes,starting_topics:5,new_topics_in_full_20:8,models:{A:o.modelA,B:o.modelB,L:o.modelL,X_technical:o.modelX},retrieval:o.method,second_retrieval:o.secondRetrieval,expected_upper_model_calls:estimatedCalls,conservative_admission_estimate_usd:cost,plan_only:o.mode==='plan',output_root:'.myway-patch-backups/learning-intelligence-reports/s62bfix1',warnings:['Admission estimate is not provider billing cap','Model B designs freely; X technical translation is separate and fallible','Text tasks executable in prototype; 2D/3D/audio are SYMBOLIC ONLY, not rendered/listened to','Scoring keys from B or X are not authoritative truth','Author-seeded openings and fictional Model L are not educational ground truth','No database writes or production changes']};}
function reportDir(o){return path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1',o.runId)}
function checkEnv(){if(process.env.OPENAI_API_KEY)return;const f=path.join(ROOT,'.env.local');if(fs.existsSync(f)){const env=require('dotenv').parse(fs.readFileSync(f));process.env.OPENAI_API_KEY=env.OPENAI_API_KEY||env.MYWAY_OPENAI_API_KEY||'';if(!process.env.OPENAI_BASE_URL&&env.OPENAI_BASE_URL)process.env.OPENAI_BASE_URL=env.OPENAI_BASE_URL;}}
function makePayload(role,input,model){let prompt,schema,max,name;
 if(role==='A'){prompt=A_PROMPT;schema=A_SCHEMA;max=2400;name='learner_investigator'}
 if(role==='B'){prompt=B_PROMPT;schema=B_SCHEMA;max=1600;name='creative_teacher'}
 if(role==='L'){prompt=L_PROMPT;schema=L_SCHEMA;max=850;name='fictional_learner'}
 if(role==='X'){prompt=TRANSLATOR_PROMPT;schema=TRANSLATOR_SCHEMA;max=1700;name='technical_scene_translation'}
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
 if(role==='L'){const controls=input.current_stage?.controls??[];const actions=controls.map(c=>({control:c.id,operation:({text:'text_response',select:'select',slider:'set_value',move:'move',rotate:'rotate',play:'play'})[c.kind],value:c.kind==='slider'?'3':c.kind==='select'?c.choices[0]:c.kind==='rotate'?'20':c.kind==='move'?'0,0,0':c.kind==='play'?'play':'I think the amount depends on both rate and total.'}));return {raw:JSON.stringify({learner_utterance:'I am not totally sure; I want to compare what goes in and out.',selected_actions:actions,request_hint:false,declines:false}),usage};}
 throw Error('Unknown mock role');
}
function persist(trace,dir){fs.mkdirSync(dir,{recursive:true});for(const [name,data] of [['TRACE.json',JSON.stringify(trace,null,2)],['TURN_INSPECTOR.html',inspect(trace)],['SUMMARY.md',`# S62B-FIX1 learning research\n\nComplete: ${trace.complete}\nEpisodes: ${trace.timeline.length}\nCost estimate USD: ${trace.cost.known_estimated_usd}\n\nFictional model simulations and symbolic activities; no educational truth claims.\n`]]){const file=path.join(dir,name);fs.writeFileSync(file,data+'\n',{mode:0o600})}}
export async function run(o,{invoke,embedFn,afterEpisode}={}){const cfg={...DEFAULT,...o};const p=plan(cfg);if(cfg.mode==='plan')return {plan:p};
 if(cfg.mode==='model'&&p.conservative_admission_estimate_usd>cfg.budget)throw Error('S62B admission estimate exceeds spending authorization');
 if(cfg.mode==='model'&&!invoke)checkEnv();const ctx=cfg.mode==='model'&&!invoke?credentials():null;
 const dir=reportDir(cfg);if(fs.existsSync(dir))throw Error('Run ID already used: reports cannot be overwritten');
 if(cfg.mode==='model'){const attemptDir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1','paid-attempts');fs.mkdirSync(attemptDir,{recursive:true});fs.writeFileSync(path.join(attemptDir,cfg.runId+'.json'),JSON.stringify({runId:cfg.runId,request_sha256:sha(cfg),warning:'one shot; do NOT rerun after provider failure'}),{flag:'wx',mode:0o600});}
 const trace={stage:'S62B-FIX1',plan:p,options:cfg,synthetic:true,db_writes:0,model_C_invocations:0,educational_correctness_scored:false,complete:false,failure:null,timeline:[],request_log:[],cost:{calls:0,known_estimated_usd:0,by_role:{A:0,B:0,X:0,L:0},unknown_usage:0}};
 const state=initialState();let phase='start',inflight=null;
 const use=async(role,input,meta={})=>{
  const model=cfg['model'+role],payload=makePayload(role,input,model),requestRecord={role,episode:inflight?.step,phase,model,request_sha256:sha(payload),request:payload,status:'prepared'};trace.request_log.push(requestRecord);
  if(cfg.mode==='model'&&trace.cost.known_estimated_usd>=cfg.budget)throw Error('Estimated spending threshold reached before next call');
  let reply;try{reply=invoke?await invoke(role,clone(input),clone(payload),meta):cfg.mode==='model'?await callProvider(payload,ctx):mock(role,input,trace.request_log.filter(x=>x.role===role).length)}catch(e){requestRecord.status='transport_unknown';throw Error('Model transport failure; never auto retry: '+String(e.message));}
  requestRecord.status='returned';const raw=typeof reply.raw==='string'?reply.raw:JSON.stringify(reply.raw??reply);requestRecord.raw=raw;requestRecord.response_sha256=sha(raw);
  if(cfg.mode==='model'){trace.cost.calls++;trace.cost.by_role[role]++;if(!reply.usage){trace.cost.unknown_usage++;throw Error('Unknown API usage; stop without retry');}trace.cost.known_estimated_usd=+(trace.cost.known_estimated_usd+estimateCost(reply.usage,model)).toFixed(9);if(trace.cost.known_estimated_usd>cfg.budget)throw Error('Estimated spend exceeded threshold after a call; stop');}
  return {raw,payload};
 };
 const assess=async(current,stage)=>{
  phase='retrieve_'+stage;let packet=await retrieve(state,current,{method:cfg.method,embedFn});
  let input={stage,current,allowed_evidence_ids:packet.allowed_evidence_ids,observations:packet.evidence,memory_candidates:packet.memory_candidates,coverage:packet.coverage,available_topics:clone(state.topics),recent_dialogue:state.dialogue.slice(-3),activity_actual_evidence:current.actual_activity??null};
  phase='Model_A_'+stage;let r=await use('A',input),a=null,error=null;
  try{a=verifyA(r.raw,packet,state)}catch(e){error=String(e.message)}
  let requested=null;
  if(a?.interpretation.more_history_needed&&cfg.secondRetrieval==='on'){
   // Exactly one bounded second retrieval, never recursive; do not invent observations.
   phase='targeted_retrieval';requested=a.interpretation.more_history_needed;
   const larger=await retrieve(state,current,{method:cfg.method,cap:18,embedFn,additionalQuery:requested});
   input={...input,allowed_evidence_ids:larger.allowed_evidence_ids,observations:larger.evidence,memory_candidates:larger.memory_candidates,coverage:larger.coverage,focused_retrieval_question:requested};
   phase='Model_A_after_retrieval';r=await use('A',input);try{a=verifyA(r.raw,larger,state);error=null;packet=larger}catch(e){a=null;error=String(e.message)}
  }
  const memoryBefore=clone(state.records);const changes=a?applyA(state,a,current.id):[];
  return {valid:!!a,error,raw:r.raw,request:r.payload,output:a,packet,requested_extra_history:requested,memory_before:memoryBefore,memory_changes:changes,memory_after:clone(state.records)};
 };
 try{
  for(const episode of EPISODES.slice(0,cfg.episodes)){
   inflight={step:episode.step,topic:episode.topic_id};phase='route';const route=routeAuthoredEpisode(state,episode);
   const current={id:`NORA-${String(episode.step).padStart(2,'0')}-IN`,topic_id:episode.topic_id,text:episode.opening,kind:'learner_initiated_opening',conditions:{source:'author_curated_fictional_opening',independent_performance:false}};
   state.observations.push(current);
   const entry={step:episode.step,topic_id:episode.topic_id,topic_route:route,learner_opening:episode.opening,memory_before:clone(state.records),pre_a:null};
   trace.timeline.push(entry);persist(trace,dir);
   entry.pre_a=await assess(current,'pre');entry.retrieval_pre=entry.pre_a.packet;entry.pre_memory_changes=entry.pre_a.memory_changes;entry.memory_after_pre=clone(state.records);persist(trace,dir);
   phase='Model_B';const bInput={learner_request:episode.opening,topic:episode.topic_title,recent_visible_dialogue:state.dialogue.slice(-4).map(d=>({learner:d.learner,tutor:d.tutor})),learner_brief:learnerBrief(entry.pre_a.output,state.records,entry.pre_a.packet.memory_candidates.map(x=>x.id),episode.topic_id)};
   const bResult=await use('B',bInput);let b;try{b=JSON.parse(bResult.raw);if(typeof b.teacher_response!=='string'||!b.teacher_response.trim()||!b.experience_proposal||!['text','2d','3d','audio','mixed','none'].includes(b.experience_proposal.modality))throw Error('B invalid creative output')}catch(e){entry.b_error=String(e.message);persist(trace,dir);continue}
   entry.b_input=bInput;entry.b_request=bResult.payload;entry.b_output=b;entry.b_raw=bResult.raw;
   state.dialogue.push({episode:episode.step,learner:episode.opening,tutor:b.teacher_response,topic_id:episode.topic_id});
   phase='technical_scene_translation';const xInput={creative:b,translation_role:'implementation_only',available_in_research:{text:true,select:true,slider:true,symbolic_2d:true,symbolic_3d:true,symbolic_audio_actions:true,actual_renderer:false,actual_audio_playback:false},policy:'Return unsupported if meaning/assessment would change; numeric checks must be independently computable.'};entry.translator_input=xInput;
   const xResult=await use('X',xInput);let x;try{x=JSON.parse(xResult.raw)}catch(e){x={status:'unsupported',reason:'Translator invalid JSON '+String(e.message),stages:[],assessment:{kind:'unverified',control_a:'',control_b:'',expected_choice:'',explanation:''}};entry.translator_error=String(e.message)}
   entry.translator_request=xResult.payload;entry.translator_raw=xResult.raw;entry.translator_output=x;
   phase='compile';const execution=compileExperience(b,x,{instanceKey:`${cfg.runId}:${state.learner}:${episode.step}:${episode.topic_id}`});entry.execution=execution;
   if(['rejected','no_activity'].includes(execution.status)){
    entry.phases=[];entry.activity_evidence={id:null,status:execution.status,note:'No learner task attempted; do not infer cognitive state from unavailable activity'};
    entry.post_a=null;entry.post_memory_changes=[];entry.memory_after_post=clone(state.records);persist(trace,dir);afterEpisode?.(clone(entry),clone(state));continue;
   }
   const stageResponses=[],completed=[];let invalidAttempt=null;
   for(let k=0;k<execution.stages.length;k++){
    let hint=null,previous=completed.at(-1)?.feedback??null;
    for(let call=0;call<2;call++){
     phase='learner_visible_phase_'+(k+1);
     const view=publicStage(execution,k,{feedback:k?previous:null,hint});
     const lInput={fictional_private_state:LEARNER_PRIVATE,learner_visible_teacher_response:b.teacher_response,current_stage:view,visible_recent_dialogue:state.dialogue.slice(-3),prior_visible_attempt_feedback:completed.slice(-2).map(x=>({result:x.result.status,feedback:x.feedback})),hidden_rubric_not_supplied:true};
     phase='Model_L_phase_'+(k+1);const lResult=await use('L',lInput);let l;
     try{
      l=JSON.parse(lResult.raw);const recorded=executePhase(execution,k,l,completed.flatMap(x=>x.events));
      stageResponses.push({phase:k,response:l});completed.push({...recorded,phase:k+1,view,model_l_input:lInput,model_l_request:lResult.payload,model_l_raw:lResult.raw});
      if(recorded.result.status==='hint_requested'){
       if(call>0||!recorded.hint){invalidAttempt={phase:k+1,error:'Hint unavailable or repeated; no task answer inferred',raw:lResult.raw,view};break;}
       hint=recorded.hint;continue;
      }
      break;
     }catch(e){invalidAttempt={phase:k+1,error:String(e.message),raw:lResult.raw,view};break}
    }
    if(invalidAttempt)break;
    if(['declined','no_attempt','incomplete'].includes(completed.at(-1)?.result.status))break;
   }
   entry.phases=completed;entry.invalid_attempt=invalidAttempt;
   if(!invalidAttempt){const replayOriginal={events:completed.flatMap(x=>x.events),completed:completed.map(({events,result,feedback,hint})=>({events,result,feedback,...(hint?{hint}:{})}))};assertReplay(execution,stageResponses,replayOriginal);entry.event_replay_verified=true;}
   const obs=evidenceFromAttempt(execution,completed,{learner_id:state.learner,topic_id:episode.topic_id,observation_id:`NORA-${String(episode.step).padStart(2,'0')}-OUT`});
   if(invalidAttempt){obs.text+=' | A model-generated action was rejected by the executor; task performance not established';obs.task_conditions.invalid_action=invalidAttempt.error;}
   entry.activity_evidence=obs;state.observations.push(obs);
   entry.post_a=await assess(obs,'post');entry.retrieval_post=entry.post_a.packet;entry.post_memory_changes=entry.post_a.memory_changes;entry.memory_after_post=clone(state.records);
   persist(trace,dir);afterEpisode?.(clone(entry),clone(state));
  }
  trace.complete=true;
 }catch(e){trace.failure={phase,inflight,message:String(e?.stack??e).slice(0,1600),completed_episodes:trace.timeline.filter(x=>x.post_a||x.execution).length,unknown_provider_spend_possible:phase.startsWith('Model_')};}
 trace.summary={planned:cfg.episodes,episodes:trace.timeline.length,completed_with_post_assessment:trace.timeline.filter(x=>x.post_a).length,unexecuted_experiences:trace.timeline.filter(x=>['no_activity','rejected'].includes(x.execution?.status)).length,new_topics:state.topics.filter(x=>x.status==='new_from_authored_opening').length,records:state.records.length,memory_decisions:state.records.reduce((n,x)=>n+x.revisions.filter(r=>r.version>0).length,0),model_calls:trace.cost.calls,known_estimated_usd:trace.cost.known_estimated_usd,failed_at:trace.failure?.phase??null,db_writes:0,scientific_scoring:false};
 trace.state=state;persist(trace,dir);return {plan:p,dir,trace};
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.mode==='plan'){console.log('S62B-FIX1 PLAN (NO MODEL/EMBEDDING/DB CALLS)\n'+JSON.stringify(plan(o),null,2));console.log('S62B-FIX1 PLAN PASS');return;}
 const r=await run(o);console.log('S62B-FIX1 REPORT '+r.dir);console.log('S62B-FIX1 SUMMARY '+JSON.stringify(r.trace.summary));if(!r.trace.complete){console.error('S62B-FIX1 PARTIAL STOP '+JSON.stringify(r.trace.failure));process.exitCode=1}else console.log('S62B-FIX1 RUN PASS | prototype simulations; educational quality not automatically established');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S62B-FIX1 STOP '+String(e.stack??e));process.exitCode=1});
